import { mat4 } from "wgpu-matrix";
import { AudioEngine } from "./audio/audio";
import { Input } from "./core/input";
import { approach,clamp,dirFromYawPitch,lerp,lerpAngle,lerpN,v3 } from "./core/math";
import type { Time } from "./core/time";
import { FIXED_STEP,Loop } from "./core/time";
import { TimeScaleDriver } from "./core/time-scale";
import { enemyIsTwoHanded } from "./gameplay/enemies";
import { PlayerController,WALK_SPEED } from "./gameplay/player";
import { ReplayPlayer,ReplayRecorder } from "./gameplay/replay";
import { isGun,ITEM_NAMES,WEAPONS } from "./gameplay/weapons";
import { EYE_HEIGHT,World } from "./gameplay/world";
import { Camera } from "./graphics/camera";
import { FxSystem } from "./graphics/effects";
import { THEMES } from "./graphics/geometry";
import type { Gfx } from "./graphics/gfx";
import { buildMeshLibrary,PART_IDS } from "./graphics/library";
import { computePose,createPose } from "./graphics/pose";
import { defaultPostParams,Renderer } from "./graphics/renderer";
import { buildLevelMesh } from "./graphics/scene";
import { Viewmodel } from "./graphics/viewmodel";
import { LEVELS } from "./levels/levels";
import type { Enemy,ItemKind,Scene,Settings,SharedStatic,WorldEvent } from "./types";
import { DebugOverlay } from "./ui/debug";
import { loadSave,writeSave } from "./ui/save";
import { Ui } from "./ui/ui";
var BASE_SENSITIVITY = 22e-4;
var ENEMY_TINT = {
  walker: [0.8, 0.32, 1],
  rusher: [1, 0.26, 0.48],
  marksman: [0.42, 0.48, 1]
};
var ENEMY_EMISSIVE = { walker: 0.9, rusher: 1.1, marksman: 1 };
var SHOT_SFX: Partial<Record<ItemKind,string>> = { pistol: "pistol", scatter: "scatter", carbine: "carbine", blade: "whoosh" };
class Game {
  gfx;
  renderer;
  input;
  audio = new AudioEngine();
  ui;
  overlay;
  loop;
  meshes;
  save;
  camera = new Camera();
  vmCamera = new Camera();
  player = new PlayerController();
  driver = new TimeScaleDriver();
  recorder = new ReplayRecorder();
  fx = new FxSystem();
  viewmodel = new Viewmodel();
  pose = createPose();
  model = mat4.create();
  post = defaultPostParams();
  state = "title";
  stateTime = 0;
  levelIndex = 0;
  def = LEVELS[0];
  scene: Scene | null = null;
  shared: SharedStatic | null = null;
  sceneCache: Map<string,{scene:Scene;shared:SharedStatic}> = new Map();
  world!: World;
  replay: ReplayPlayer | null = null;
  runRealTime = 0;
  flash = [1, 1, 1, 0];
  threat = 0;
  deathDir = [0, 0, -1];
  telegraphing = new Set();
  lastResults: {real:number;sim:number;kills:number;shots:number} | null = null;
  debugOverlayForced = false;
  perfAccum = 0;
  perfFrames = 0;
  autoScale = 1;
  constructor(gfx: Gfx, canvas: HTMLCanvasElement, overlayEl: HTMLElement) {
    this.gfx = gfx;
    this.renderer = new Renderer(gfx);
    this.input = new Input(canvas);
    this.overlay = new DebugOverlay(overlayEl);
    this.meshes = buildMeshLibrary(gfx.device);
    this.save = loadSave();
    this.ui = new Ui({
      onPlayLevel: (i: number) => this.startLevel(i, true),
      onResume: () => this.resume(),
      onRestart: () => this.restart(true),
      onMenu: () => this.toMenu(),
      onNext: () => this.startLevel(Math.min(LEVELS.length - 1, this.levelIndex + 1), true),
      onReplay: () => this.startReplay(),
      onSkipReplay: () => this.endReplay(),
      onSettingsChanged: (s: Settings) => this.applySettings(s),
      onUiSound: () => {
        this.audio.unlock();
        this.audio.play("ui", { ignoreTime: true });
      }
    }, this.save, LEVELS);
    this.applySettings(this.save.settings);
    const applyAspect = () => {
      this.camera.aspect = gfx.aspect;
      this.camera.setHorizontalFov(this.save.settings.fov);
      this.vmCamera.aspect = gfx.aspect;
      this.vmCamera.fovYDeg = 54;
    };
    applyAspect();
    gfx.onResize(applyAspect);
    this.vmCamera.near = this.camera.near;
    this.vmCamera.far = this.camera.far;
    document.addEventListener("pointerlockchange", () => {
      if (!this.input.pointerLocked && (this.state === "playing" || this.state === "intro"))
        this.pause();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && (this.state === "playing" || this.state === "intro"))
        this.pause();
    });
    window.addEventListener("pointerdown", () => this.audio.unlock(), { capture: true });
    window.addEventListener("keydown", () => this.audio.unlock(), { capture: true });
    this.loadLevel(this.firstUncleared());
    this.toMenu();
    this.loop = new Loop({
      frame: (t: Time) => this.frame(t),
      fixedStep: () => this.fixedStep(),
      render: (t: Time) => this.render(t)
    });
  }
  start() {
    this.loop.start();
  }
  stop() {
    this.loop.stop();
  }
  firstUncleared() {
    const i = LEVELS.findIndex((l) => !this.save.levels[l.id]?.cleared);
    return i < 0 ? 0 : i;
  }
  loadLevel(index: number) {
    this.levelIndex = clamp(index, 0, LEVELS.length - 1);
    this.def = LEVELS[this.levelIndex];
    let cached = this.sceneCache.get(this.def.id);
    if (!cached) {
      const t0 = performance.now();
      const { scene, shared } = buildLevelMesh(this.gfx.device, this.def);
      cached = { scene, shared };
      this.sceneCache.set(this.def.id, cached);
      console.info(`[game] built level ${this.def.id} in ${(performance.now() - t0).toFixed(1)} ms (${this.def.boxes.length} boxes)`);
    }
    this.scene = cached.scene;
    this.shared = cached.shared;
    const theme = THEMES[this.def.theme];
    this.renderer.lighting = theme.lighting;
    this.renderer.setShadowBounds(this.scene.min, this.scene.max);
    this.resetWorld();
  }
  resetWorld() {
    this.world = new World(this.def, this.shared ?? void 0);
    this.shared = this.world.staticData;
    this.player.reset(this.def.player.pos, this.def.player.yaw);
    this.driver.reset();
    this.recorder.reset();
    this.fx.clear();
    this.telegraphing.clear();
    this.runRealTime = 0;
    this.flash = [1, 1, 1, 0];
    this.replay = null;
  }
  setState(s: string) {
    this.state = s;
    this.stateTime = 0;
  }
  startLevel(index: number, lock: boolean) {
    if (!this.ui.isUnlocked(index))
      return;
    this.audio.unlock();
    if (lock)
      this.input.requestPointerLock();
    this.loadLevel(index);
    this.ui.hideScreen();
    this.beginIntro(this.def.words, 0.34);
  }
  beginIntro(words: string[], wordTime: number) {
    this.setState("intro");
    this.ui.titleCard(words, wordTime, () => {
      if (this.state === "intro")
        this.beginPlaying();
    });
  }
  beginPlaying() {
    this.setState("playing");
    this.loop.time.clearAccumulator();
    this.recorder.reset();
    this.runRealTime = 0;
  }
  restart(lock: boolean) {
    if (lock)
      this.input.requestPointerLock();
    this.ui.hideScreen();
    this.resetWorld();
    this.beginIntro([this.def.name], 0.45);
  }
  pause() {
    if (this.state !== "playing" && this.state !== "intro")
      return;
    this.ui.hideCard();
    this.setState("paused");
    this.ui.showPause();
  }
  resume() {
    this.input.requestPointerLock();
    this.ui.hideScreen();
    this.state = this.recorder.frames.length > 0 ? "playing" : "intro";
    this.stateTime = 0;
    if (this.state === "intro")
      this.beginIntro(["GO."], 0.3);
    this.loop.time.clearAccumulator();
  }
  toMenu() {
    this.ui.hideCard();
    this.replay = null;
    if (document.pointerLockElement)
      document.exitPointerLock();
    this.loadLevel(this.firstUncleared());
    this.setState("title");
    this.ui.showTitle();
  }
  enterDead() {
    this.setState("dead");
    this.flash = [1, 0.25, 0.3, 0.85];
    this.audio.play("death", { ignoreTime: true });
    this.ui.titleCard(["AGAIN."], 0.6);
  }
  enterCleared() {
    this.setState("cleared");
    this.lastResults = { real: this.runRealTime, sim: this.world.simTime, kills: this.world.stats.kills, shots: this.world.stats.shots };
    this.flash = [1, 1, 1, 0.5];
    this.audio.play("clear", { ignoreTime: true });
    this.ui.titleCard(["CLEAR.", "CLEAR.", "CLEAR."], 0.38, () => this.showResults());
  }
  showResults() {
    if (document.pointerLockElement)
      document.exitPointerLock();
    const r = this.lastResults ?? { real: 0, sim: 0, kills: 0, shots: 0 };
    const rec = this.save.levels[this.def.id] ?? { cleared: false };
    const newBest = rec.best === void 0 || r.real < rec.best;
    rec.cleared = true;
    if (newBest) {
      rec.best = r.real;
      rec.bestSim = r.sim;
    }
    this.save.levels[this.def.id] = rec;
    writeSave(this.save);
    this.setState("results");
    this.ui.showResults({
      level: this.def,
      realTime: r.real,
      simTime: r.sim,
      kills: r.kills,
      shots: r.shots,
      best: rec.best,
      newBest,
      hasNext: this.levelIndex < LEVELS.length - 1
    });
  }
  startReplay() {
    if (!this.shared || this.recorder.frames.length === 0)
      return;
    this.fx.clear();
    this.telegraphing.clear();
    this.replay = new ReplayPlayer(this.def, this.recorder.frames, this.shared);
    this.setState("replay");
    this.ui.showReplayBar();
  }
  endReplay() {
    if (this.state !== "replay")
      return;
    this.replay = null;
    this.fx.clear();
    this.showResults();
  }
  applySettings(s: Settings) {
    this.save.settings = s;
    this.ui.setSave(this.save);
    writeSave(this.save);
    this.camera.aspect = this.gfx.aspect;
    this.camera.setHorizontalFov(s.fov);
    this.renderer.quality = s.postQuality;
    this.audio.setVolumes(s.masterVolume, s.sfxVolume, s.musicVolume);
    this.autoScale = 1;
    this.gfx.setResolutionScale(s.resolutionScale);
  }
  frame(t: Time) {
    const dt = t.realDt;
    const input = this.input;
    input.update(dt);
    this.stateTime += dt;
    this.ui.update(dt);
    if (input.wasPressed("debugTimeFreeze"))
      t.lock = t.lock === "frozen" ? "none" : "frozen";
    if (input.wasPressed("debugTimeRealtime"))
      t.lock = t.lock === "realtime" ? "none" : "realtime";
    if (input.wasPressed("debugOverlay"))
      this.debugOverlayForced = !this.debugOverlayForced;
    const look = { sensitivity: BASE_SENSITIVITY * this.save.settings.sensitivity, invertY: this.save.settings.invertY };
    const locked = input.pointerLocked;
    this.ui.showLockHint((this.state === "playing" || this.state === "intro") && !locked);
    switch (this.state) {
      case "title":
        t.timeScale = 0;
        break;
      case "intro":
        if (locked)
          this.player.look(input, dt, look);
        t.timeScale = 0;
        break;
      case "playing": {
        if (!locked) {
          t.timeScale = 0;
          break;
        }
        if (input.wasPressed("restart")) {
          this.restart(false);
          t.timeScale = 0;
          break;
        }
        this.player.update(input, dt, this.world, look, true);
        const f = this.player.toFrame(input.wasPressed("fire"), input.wasPressed("throw"), input.wasPressed("interact"));
        const acted = this.world.applyPlayerFrame(f);
        this.recorder.push(f);
        if (acted)
          this.driver.actionKick();
        const busy = this.world.player.burstLeft > 0;
        t.timeScale = this.driver.update(dt, WALK_SPEED, this.player.planarSpeed, this.player.lookSpeed, !this.player.grounded, busy);
        this.runRealTime += dt;
        break;
      }
      case "dead":
        t.timeScale = approach(t.timeScale, 0.04, 0.2, dt);
        if (this.stateTime > 0.35 && (input.wasPressed("restart") || input.wasPressed("fire")))
          this.restart(false);
        else if (this.stateTime > 1.4)
          this.restart(false);
        break;
      case "cleared":
        if (locked)
          this.player.look(input, dt, look);
        t.timeScale = approach(t.timeScale, 0.25, 0.3, dt);
        break;
      case "paused":
      case "results":
        t.timeScale = 0;
        break;
      case "replay":
        t.timeScale = 0;
        if (this.stateTime > 0.3 && input.anyPressed()) {
          this.endReplay();
          break;
        }
        if (this.replay) {
          this.replay.update(dt);
          this.ui.setReplayProgress(this.replay.progress);
          if (this.replay.done && this.stateTime > 0.5)
            this.endReplay();
        }
        break;
    }
  }
  fixedStep() {
    if (this.state === "playing" || this.state === "dead" || this.state === "cleared") {
      this.world.step(FIXED_STEP);
    }
  }
  render(t: Time) {
    if (this.state === "playing")
      this.recorder.setLastSteps(t.stepsThisFrame);
    if (this.state === "playing" && this.world.failed)
      this.enterDead();
    else if (this.state === "playing" && this.world.cleared)
      this.enterCleared();
    const world = this.replay?.world ?? this.world;
    const inReplay = this.state === "replay" && !!this.replay;
    const ts = inReplay ? 1 : t.effectiveScale();
    const visualDt = inReplay ? t.realDt : t.simDt;
    this.handleEvents(world);
    this.fx.update(visualDt, world.static);
    this.updateAutoResolution(t.realDt);
    const eye = v3();
    let yaw;
    let pitch;
    if (inReplay && this.replay?.current) {
      const f = this.replay.current;
      eye[0] = f.pos[0];
      eye[1] = f.pos[1] + EYE_HEIGHT;
      eye[2] = f.pos[2];
      yaw = f.yaw;
      pitch = f.pitch;
    } else if (inReplay) {
      eye[0] = this.def.player.pos[0];
      eye[1] = this.def.player.pos[1] + EYE_HEIGHT;
      eye[2] = this.def.player.pos[2];
      yaw = this.def.player.yaw;
      pitch = 0;
    } else if (this.state === "title" || this.state === "results" && !this.lastResults) {
      const sc = this.scene!;
      const cx = (sc.min[0] + sc.max[0]) / 2;
      const cz = (sc.min[2] + sc.max[2]) / 2;
      const r = Math.max(4, Math.min(sc.max[0] - sc.min[0], sc.max[2] - sc.min[2]) * 0.32);
      const a = t.realTime * 0.06;
      eye[0] = cx + Math.cos(a) * r;
      eye[1] = 2.4;
      eye[2] = cz + Math.sin(a) * r;
      yaw = Math.atan2(-(cx - eye[0]), -(cz - eye[2]));
      pitch = -0.12;
    } else {
      eye[0] = this.player.pos[0];
      eye[1] = this.player.pos[1] + EYE_HEIGHT;
      eye[2] = this.player.pos[2];
      yaw = this.player.yaw;
      pitch = this.player.pitch;
      if (this.state === "dead") {
        const k = Math.min(1, this.stateTime / 0.6);
        eye[1] -= k * 0.5;
        pitch = lerpN(pitch, -0.4, k * 0.5);
      }
    }
    const cam = this.camera;
    cam.position[0] = eye[0];
    cam.position[1] = eye[1];
    cam.position[2] = eye[2];
    cam.yaw = yaw;
    cam.pitch = pitch;
    cam.update();
    const vm = this.vmCamera;
    vm.position[0] = eye[0];
    vm.position[1] = eye[1];
    vm.position[2] = eye[2];
    vm.yaw = yaw;
    vm.pitch = pitch;
    vm.update();
    this.audio.setListener({ x: eye[0], y: eye[1], z: eye[2], yaw });
    this.audio.setTimeScale(this.state === "title" || this.state === "results" || this.state === "paused" ? 0.35 : ts);
    const alpha = inReplay ? 1 : t.alpha;
    this.drawWorld(world, alpha, ts, t.realTime);
    this.fx.draw(this.renderer, this.meshes);
    const showViewmodel = this.state === "playing" || this.state === "intro" || this.state === "cleared" || this.state === "paused" || inReplay;
    if (showViewmodel) {
      const pState = world.player;
      if (!inReplay)
        this.viewmodel.update(t.realDt, this.player.mouseDx, this.player.mouseDy, this.player.planarSpeed, this.player.grounded);
      const stride = inReplay ? this.replay?.current ? Math.hypot(this.replay.current.pos[0], this.replay.current.pos[2]) : 0 : this.player.stride;
      this.viewmodel.draw(this.renderer, this.meshes, eye, yaw, pitch, pState, stride, this.save.settings.reduceMotion);
    }
    this.updatePost(world, ts, t.realDt);
    this.renderer.render(cam, vm, this.post, t.realTime);
    this.updateHud(world, ts);
    const showFps = this.save.settings.showFps || this.debugOverlayForced;
    this.overlay.visible = showFps;
    if (showFps) {
      this.overlay.set("res", `${this.gfx.width}x${this.gfx.height} (${(this.gfx.getResolutionScale() * 100).toFixed(0)}%)`);
      this.overlay.set("draws", `${this.renderer.lastDrawCalls} calls, ${this.renderer.lastInstances} inst, ${this.renderer.lastSegments} fx`);
      this.overlay.set("world", `enemies ${world.enemies.length}  bullets ${world.projectiles.length}  props ${world.props.length}  shards ${this.fx.shardCount}`);
      this.overlay.set("state", this.state);
    }
    this.overlay.update(t);
  }
  drawWorld(world: World, alpha: number, ts: number, realTime: number) {
    const r = this.renderer;
    if (this.scene)
      r.drawMesh(this.scene.mesh, IDENTITY);
    const m2 = this.model;
    const tmp2 = v3();
    for (const pr of world.props) {
      lerp(tmp2, pr.prevPos, pr.pos, alpha);
      mat4.translation(tmp2, m2);
      mat4.rotateY(m2, lerpN(pr.prevRot[1], pr.rot[1], alpha), m2);
      mat4.rotateX(m2, lerpN(pr.prevRot[0], pr.rot[0], alpha), m2);
      mat4.rotateZ(m2, lerpN(pr.prevRot[2], pr.rot[2], alpha), m2);
      const highlight = world.aimProp === pr && this.state === "playing" ? 0.45 + 0.25 * Math.sin(realTime * 8) : 0;
      r.drawMesh(this.meshes.items[pr.item.kind], m2, WHITE3, 0.06, "opaque", 0, 1, highlight);
    }
    for (const e of world.enemies)
      this.drawEnemy(e, alpha);
    const trailLen = 0.6 + 5 * (1 - ts);
    const head = v3();
    const tail = v3();
    for (const b of world.projectiles) {
      lerp(head, b.prevPos, b.pos, alpha);
      const vx = b.vel[0], vy = b.vel[1], vz = b.vel[2];
      const vl = Math.hypot(vx, vy, vz) || 1;
      const traveled = Math.hypot(head[0] - b.spawnPos[0], head[1] - b.spawnPos[1], head[2] - b.spawnPos[2]);
      const l = Math.min(trailLen, traveled);
      tail[0] = head[0] - vx / vl * l;
      tail[1] = head[1] - vy / vl * l;
      tail[2] = head[2] - vz / vl * l;
      const enemyShot = b.ownerId !== 0;
      r.drawSegment(tail, head, 0.016, enemyShot ? TRAIL_ENEMY : TRAIL_PLAYER, 0, 1.2);
      r.drawSegment(head, head, 0.035, CORE, 1, 2);
    }
    const lasers = world.activeLasers();
    for (const l of lasers) {
      const hit = world.static.raycast(l.origin, l.dir, 60);
      const d = hit ? hit.t : 60;
      const end = [l.origin[0] + l.dir[0] * d, l.origin[1] + l.dir[1] * d, l.origin[2] + l.dir[2] * d];
      const k = l.progress;
      r.drawSegment(l.origin, end, 4e-3 + k * 8e-3, [0.9 * (1 + k * 6), 0.25 * (1 + k * 3), 1.6 * (1 + k * 6)], 1, 1.2);
    }
  }
  drawEnemy(e: Enemy, alpha: number) {
    const p = this.pose;
    const pos = lerp(v3(), e.prevPos, e.pos, alpha);
    computePose({
      pos,
      yaw: lerpAngle(e.prevYaw, e.yaw, alpha),
      walkPhase: lerpN(e.prevWalkPhase, e.walkPhase, alpha),
      moveBlend: lerpN(e.prevMoveBlend, e.moveBlend, alpha),
      aimBlend: lerpN(e.prevAimBlend, e.aimBlend, alpha),
      aimPitch: e.aimPitch,
      attackT: e.meleeT > 0 ? lerpN(e.prevMeleeT, e.meleeT, alpha) : 0,
      stun: e.state === "stunned" ? 1 : 0,
      spawnT: lerpN(e.prevSpawnT, e.spawnT, alpha),
      twoHanded: enemyIsTwoHanded(e),
      kind: e.kind
    }, p);
    const tint = ENEMY_TINT[e.kind];
    const spawnT = lerpN(e.prevSpawnT, e.spawnT, alpha);
    const emissive = ENEMY_EMISSIVE[e.kind] + (1 - spawnT) * 3;
    const flash = Math.max(e.hitFlash, (1 - spawnT) * 0.5);
    for (const id of PART_IDS) {
      this.renderer.drawMesh(this.meshes.parts[id], p.parts[id], tint, emissive, "glass", flash, 0.25 + 0.75 * spawnT);
    }
    if (e.weapon)
      this.renderer.drawMesh(this.meshes.items[e.weapon.kind], p.weapon, WHITE3, 0.04, "opaque");
  }
  incomingThreat(world: World) {
    if (this.state !== "playing")
      return 0;
    const eye = world.playerEye(v3());
    let threat = 0;
    for (const b of world.projectiles) {
      if (!b.alive || b.ownerId === 0)
        continue;
      const d = Math.hypot(b.pos[0] - eye[0], b.pos[1] - eye[1], b.pos[2] - eye[2]);
      threat = Math.max(threat, clamp(2 - d / 8, 0, 1));
    }
    for (const e of world.enemies) {
      if (e.alive && e.telegraph > 0)
        threat = 1;
    }
    return threat;
  }
  updatePost(world: World, ts: number, realDt: number) {
    const s = this.save.settings;
    const p = this.post;
    const reduce = s.reduceMotion;
    let freeze = 1 - ts;
    if (this.state === "title" || this.state === "results" || this.state === "paused")
      freeze = 0.6;
    if (this.state === "replay")
      freeze = 0;
    p.freeze = freeze;
    p.desaturation = this.state === "replay" ? 0.25 : freeze * 0.7;
    p.aberration = reduce ? 0 : freeze * 0.6 + this.flash[3] * 0.8;
    p.grain = reduce ? 0 : this.state === "replay" ? 0.07 : 0.025 + freeze * 0.03;
    p.vignette = this.state === "replay" ? 0.6 : 0.3 + freeze * 0.25;
    p.bloomStrength = s.postQuality === "high" ? 0.7 : 0.5;
    p.bloomThreshold = 1;
    p.exposure = 1;
    p.outline = 1;
    this.flash[3] = approach(this.flash[3], 0, this.state === "dead" ? 0.6 : 0.25, realDt);
    if (this.state === "dead") {
      p.desaturation = Math.max(p.desaturation, 0.85);
    }
    p.flash = this.flash;
    const incoming = this.incomingThreat(world);
    this.threat = approach(this.threat, incoming, incoming > this.threat ? 0.05 : 2.5, realDt);
    p.threat = reduce ? 0 : this.threat;
  }
  updateHud(world: World, ts: number) {
    const visible = this.state === "playing" || this.state === "intro" || this.state === "cleared";
    const held = world.player.held;
    let hint = null;
    if (this.state === "playing" && world.aimProp)
      hint = `E  ${ITEM_NAMES[world.aimProp.item.kind]}`;
    else if (this.state === "playing" && held && isGun(held.kind) && held.ammo === 0)
      hint = "EMPTY — CLICK TO THROW";
    const exit = this.def.exit;
    const hud = {
      visible,
      timeScale: ts,
      itemName: held ? ITEM_NAMES[held.kind] : null,
      ammo: held && isGun(held.kind) ? held.ammo : 0,
      maxAmmo: held && isGun(held.kind) ? WEAPONS[held.kind].ammo : 0,
      hint,
      levelName: `${this.def.id}  ${this.def.name}${exit ? "  ·  REACH THE EXIT" : ""}`,
      remaining: exit ? 0 : world.remainingEnemies,
      crosshairScale: this.save.settings.crosshairScale
    };
    this.ui.updateHud(hud);
  }
  handleEvents(world: World) {
    const a = this.audio;
    const fx = this.fx;
    for (const ev of world.events)
      this.handleEvent(ev, a, fx);
    world.events.length = 0;
    const now = new Set();
    for (const e of world.enemies) {
      if (e.telegraph > 0) {
        now.add(e.id);
        if (!this.telegraphing.has(e.id))
          a.play("charge", { pos: e.pos });
      }
    }
    this.telegraphing = now;
  }
  handleEvent(ev: WorldEvent, a: AudioEngine, fx: FxSystem) {
    switch (ev.type) {
      case "shot":
        a.play(ev.byPlayer ? SHOT_SFX[ev.weapon]! : "enemyShot", { pos: ev.byPlayer ? void 0 : ev.pos, volume: ev.byPlayer ? 0.8 : 1 });
        fx.muzzleFlash(ev.pos, ev.dir, ev.weapon === "scatter");
        break;
      case "impact":
        a.play("impact", { pos: ev.pos, volume: 0.6 });
        fx.sparks(ev.pos, ev.normal, 8);
        fx.dust(ev.pos, ev.normal, 3);
        break;
      case "enemyDeath": {
        if (ev.silent)
          break;
        const e = ev.enemy;
        computePose({
          pos: e.pos,
          yaw: e.yaw,
          walkPhase: e.walkPhase,
          moveBlend: e.moveBlend,
          aimBlend: e.aimBlend,
          aimPitch: e.aimPitch,
          attackT: e.meleeT,
          stun: e.state === "stunned" ? 1 : 0,
          spawnT: e.spawnT,
          twoHanded: enemyIsTwoHanded(e),
          kind: e.kind
        }, this.pose);
        fx.shatter(this.pose, ev.dir, ev.point, ENEMY_TINT[e.kind], this.meshes.shards.length);
        a.play("shatter", { pos: ev.point });
        break;
      }
      case "enemyHit":
        a.play("punch", { pos: ev.pos });
        fx.glints(ev.pos, 10, [0.9, 0.6, 1], 2);
        break;
      case "playerDeath":
        this.deathDir = ev.dir;
        break;
      case "bulletClash":
        a.play("clash", { pos: ev.pos });
        fx.sparks(ev.pos, [0, 1, 0], 16, [6, 6, 7]);
        break;
      case "slice":
        a.play("slice", { pos: ev.pos });
        fx.sparks(ev.pos, [0, 1, 0], 10, [7, 6, 5]);
        break;
      case "punch":
        a.play(ev.hit ? "punch" : "punchMiss", { volume: ev.hit ? 1 : 0.5 });
        break;
      case "slash":
        a.play("whoosh");
        if (ev.hit)
          a.play("slice", { volume: 0.6 });
        break;
      case "throw":
        a.play("whoosh", { volume: 0.7 });
        break;
      case "pickup":
        a.play("pickup");
        break;
      case "dryFire":
        a.play("dryFire");
        break;
      case "itemBreak":
        a.play("glassBreak", { pos: ev.pos });
        fx.smallShatter(ev.pos, [0.9, 0.95, 1], this.meshes.shards.length);
        break;
      case "propImpact":
        a.play("propImpact", { pos: ev.pos, volume: clamp(ev.speed / 8, 0.1, 0.8) });
        break;
      case "spawn":
        a.play("spawn", { pos: ev.pos });
        fx.spawnShimmer(ev.pos, [0.8, 0.4, 1]);
        break;
      case "melee":
        a.play("melee", { pos: ev.pos });
        break;
      case "telegraph":
        break;
    }
  }
  updateAutoResolution(realDt: number) {
    const s = this.save.settings;
    if (!s.autoResolution || this.state !== "playing")
      return;
    this.perfAccum += realDt;
    this.perfFrames++;
    if (this.perfAccum < 2)
      return;
    const avg = this.perfAccum / this.perfFrames;
    this.perfAccum = 0;
    this.perfFrames = 0;
    const prev = this.autoScale;
    if (avg > 1 / 52)
      this.autoScale = Math.max(0.5, this.autoScale - 0.1);
    else if (avg < 1 / 75)
      this.autoScale = Math.min(1, this.autoScale + 0.05);
    if (prev !== this.autoScale) {
      console.info(`[game] auto resolution: avg frame ${(avg * 1e3).toFixed(1)} ms → scale ${(s.resolutionScale * this.autoScale).toFixed(2)}`);
      this.gfx.setResolutionScale(s.resolutionScale * this.autoScale);
    }
  }
  get lastDeathDir() {
    return dirFromYawPitch(v3(), Math.atan2(-this.deathDir[0], -this.deathDir[2]), 0);
  }
};
var IDENTITY = mat4.identity();
var WHITE3 = [1, 1, 1];
var CORE = [9, 8.5, 7.5];
var TRAIL_PLAYER = [3.2, 2.2, 1.2];
var TRAIL_ENEMY = [4, 1.4, 0.6];

export { BASE_SENSITIVITY,CORE,ENEMY_EMISSIVE,ENEMY_TINT,Game,IDENTITY,SHOT_SFX,TRAIL_ENEMY,TRAIL_PLAYER,WHITE3 };
