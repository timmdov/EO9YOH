import { clamp,copy,dirFromYawPitch,distSq,distXZ,dot,len,normalize,v3 } from "../core/math";
import { Rng } from "../core/random";
import { segmentCapsule,segmentSphere,StaticWorld } from "../physics/collision";
import { NavGrid } from "../physics/navigation";
import type { Enemy,Frame,Item,Level,Player,Projectile,Prop,SharedStatic,Spawn,WorldEvent } from "../types";
import { ENEMY_RADIUS, ENEMY_HEIGHT, BODY_A,BODY_B,BODY_RADIUS,createEnemy,enemyMuzzle,HEAD_OFFSET,HEAD_RADIUS,savePrev,updateEnemy } from "./enemies";
import { BULLET_LIFE,BULLET_RADIUS,BULLET_SPEED,FRAGILE,isGun,isWeapon,ITEM_RADIUS,newItem,WEAPONS } from "./weapons";
var EYE_HEIGHT = 1.6;
var PLAYER_RADIUS = 0.3;
var PLAYER_HEIGHT = 1.75;
var PLAYER_BODY_A = 0.3;
var PLAYER_BODY_B = 1.5;
var PLAYER_BODY_R = 0.26;
var REACH = 2.6;
var PROP_PHYS_RADIUS = 0.05;
var GRAVITY2 = 16;
var THROW_SPEED = 15;
var PUNCH_COOLDOWN = 0.32;
var PUNCH_RANGE = 1.7;
var SLASH_RANGE = 2.2;
var SHOT_HEARING = 16;
var REST_ROT = {
  pistol: [0, Math.PI / 2],
  scatter: [0, Math.PI / 2],
  carbine: [0, Math.PI / 2],
  blade: [0, Math.PI / 2],
  bottle: [Math.PI / 2, 0],
  brick: [0, 0],
  mug: [0, 0]
};
class World {
  def;
  static;
  nav;
  rng;
  events: WorldEvent[] = [];
  enemies: Enemy[] = [];
  props: Prop[] = [];
  projectiles: Projectile[] = [];
  player: Player;
  stats = { kills: 0, shots: 0 };
  simTime = 0;
  cleared = false;
  failed = false;
  aimProp: Prop | null = null;
  nextId = 1;
  shotCounter = 0;
  waveIndex = 0;
  waveArmed = false;
  waveDelay = 0;
  lastWaveTime = 0;
  spawnQueue: {spawn:Spawn}[] = [];
  recentShots: {pos:number[];time:number}[] = [];
  constructor(def: Level, sharedStatic?: SharedStatic) {
    this.def = def;
    this.rng = new Rng(def.seed);
    if (sharedStatic) {
      this.static = sharedStatic.static;
      this.nav = sharedStatic.nav;
    } else {
      const boxes = def.boxes.filter((b) => b.collide).map((b) => ({ min: [...b.min], max: [...b.max], navFloor: b.navFloor }));
      this.static = new StaticWorld(boxes);
      this.nav = new NavGrid(this.static);
    }
    const p = def.player;
    this.player = {
      pos: this.static.characterSpawn(p.pos, PLAYER_RADIUS, PLAYER_HEIGHT),
      vel: v3(),
      yaw: p.yaw,
      pitch: 0,
      grounded: true,
      alive: true,
      invulnerable: false,
      held: p.item ? newItem(p.item) : null,
      fireCooldown: 0,
      burstLeft: 0,
      burstTimer: 0,
      punchCooldown: 0,
      punchSide: 1,
      punchAge: 99,
      recoilAge: 99,
      throwAge: 99,
      slashAge: 99,
      pickupAge: 99
    };
    for (const ps of def.props)
      this.addProp(newItem(ps.kind), ps.pos, [0, 0, 0], false);
    this.updateWaves(0);
    this.flushSpawnQueue(true);
  }
  get staticData() {
    return { static: this.static, nav: this.nav };
  }
  playerEye(out: number[]) {
    out[0] = this.player.pos[0];
    out[1] = this.player.pos[1] + EYE_HEIGHT;
    out[2] = this.player.pos[2];
    return out;
  }
  newShotId() {
    return ++this.shotCounter;
  }
  get aliveEnemies() {
    return this.enemies.length;
  }
  get remainingEnemies() {
    let queued = this.spawnQueue.length;
    for (let i = this.waveIndex; i < this.def.waves.length; i++)
      queued += this.def.waves[i].spawns.length;
    return this.enemies.length + queued;
  }
  applyPlayerFrame(f: Frame) {
    const p = this.player;
    copy(p.pos, f.pos);
    copy(p.vel, f.vel);
    p.yaw = f.yaw;
    p.pitch = f.pitch;
    p.grounded = f.grounded;
    if (!p.alive)
      return false;
    this.aimProp = this.findAimProp();
    let acted = false;
    if (f.interact) {
      const target = this.aimProp ?? this.nearestPropInRadius(1.4);
      if (target) {
        if (p.held)
          this.throwHeld(0.35);
        this.pickUp(target);
        acted = true;
      }
    }
    if (f.throwItem && p.held) {
      this.throwHeld(1);
      acted = true;
    }
    if (f.fire) {
      acted = this.primaryAction() || acted;
    }
    if (p.pos[1] < -6)
      this.killPlayer([0, -1, 0]);
    return acted;
  }
  primaryAction() {
    const p = this.player;
    const held = p.held;
    if (held) {
      if (isGun(held.kind)) {
        if (p.fireCooldown > 0 || p.burstLeft > 0)
          return false;
        if (held.ammo <= 0) {
          this.events.push({ type: "dryFire" });
          this.throwHeld(1);
          return true;
        }
        const def = WEAPONS[held.kind];
        held.ammo--;
        p.fireCooldown = def.cooldown;
        p.burstLeft = def.burst - 1;
        p.burstTimer = def.burstInterval;
        this.playerVolley(held.kind);
        return true;
      }
      if (held.kind === "blade") {
        if (p.fireCooldown > 0)
          return false;
        p.fireCooldown = WEAPONS.blade.cooldown;
        this.slash();
        return true;
      }
      this.throwHeld(1);
      return true;
    }
    if (this.aimProp && distSq(this.aimProp.pos, this.playerEye(v3())) < 2.2 * 2.2) {
      this.pickUp(this.aimProp);
      return true;
    }
    if (p.punchCooldown <= 0) {
      this.punch();
      return true;
    }
    return false;
  }
  forward(out: number[]) {
    return dirFromYawPitch(out, this.player.yaw, this.player.pitch);
  }
  playerVolley(kind: keyof typeof WEAPONS) {
    const p = this.player;
    const def = WEAPONS[kind];
    const eye = this.playerEye(v3());
    const fwd = this.forward(v3());
    const right = [Math.cos(p.yaw), 0, -Math.sin(p.yaw)];
    const hit = this.static.raycast(eye, fwd, 80);
    const target = hit ? hit.point : [eye[0] + fwd[0] * 80, eye[1] + fwd[1] * 80, eye[2] + fwd[2] * 80];
    let muzzle = [
      eye[0] + fwd[0] * 0.45 + right[0] * 0.14,
      eye[1] + fwd[1] * 0.45 - 0.1,
      eye[2] + fwd[2] * 0.45 + right[2] * 0.14
    ];
    if (!this.static.lineClear(eye, muzzle))
      muzzle = [eye[0], eye[1], eye[2]];
    const dir = [target[0] - muzzle[0], target[1] - muzzle[1], target[2] - muzzle[2]];
    if (len(dir) < 1.5)
      copy(dir, fwd);
    normalize(dir, dir);
    const shotId = this.newShotId();
    for (let i = 0; i < Math.max(1, def.pellets); i++) {
      const d = [dir[0], dir[1], dir[2]];
      if (def.pellets > 1 || def.spread > 0)
        this.perturbDirection(d, def.spread);
      this.spawnProjectile(muzzle, d, 0, shotId);
    }
    this.stats.shots++;
    p.recoilAge = 0;
    this.recentShots.push({ pos: [eye[0], eye[1], eye[2]], time: this.simTime });
    this.events.push({ type: "shot", pos: muzzle, dir, weapon: kind, byPlayer: true });
  }
  punch() {
    const p = this.player;
    p.punchCooldown = PUNCH_COOLDOWN;
    p.punchAge = 0;
    p.punchSide = -p.punchSide;
    const target = this.meleeTarget(PUNCH_RANGE, 0.65);
    const fwd = this.forward(v3());
    if (!target) {
      this.events.push({ type: "punch", hit: false, pos: this.playerEye(v3()) });
      return;
    }
    target.hp--;
    target.hitFlash = 1;
    const hitPos = [target.pos[0], target.pos[1] + 1.3, target.pos[2]];
    this.events.push({ type: "punch", hit: true, pos: hitPos });
    if (target.hp <= 0) {
      this.killEnemy(target, fwd, hitPos, false);
    } else {
      this.disarm(target, fwd);
      this.stun(target, 0.9, fwd, 2.5);
    }
  }
  slash() {
    const p = this.player;
    p.slashAge = 0;
    const eye = this.playerEye(v3());
    const fwd = this.forward(v3());
    let hit = false;
    for (const e of this.enemies) {
      if (!e.alive || e.spawnT < 1)
        continue;
      const to = [e.pos[0] - eye[0], e.pos[1] + 1.1 - eye[1], e.pos[2] - eye[2]];
      const d = len(to);
      if (d > SLASH_RANGE)
        continue;
      normalize(to, to);
      if (dot(to, fwd) < 0.45)
        continue;
      if (!this.static.lineClear(eye, [e.pos[0], e.pos[1] + 1.1, e.pos[2]]))
        continue;
      this.killEnemy(e, fwd, [e.pos[0], e.pos[1] + 1.2, e.pos[2]], false);
      hit = true;
    }
    for (const b of this.projectiles) {
      if (!b.alive || b.ownerId === 0)
        continue;
      const to = [b.pos[0] - eye[0], b.pos[1] - eye[1], b.pos[2] - eye[2]];
      const d = len(to);
      if (d > 2)
        continue;
      normalize(to, to);
      if (dot(to, fwd) < 0.25)
        continue;
      b.alive = false;
      this.events.push({ type: "slice", pos: [b.pos[0], b.pos[1], b.pos[2]], dir: [b.vel[0], b.vel[1], b.vel[2]] });
      hit = true;
    }
    this.events.push({ type: "slash", hit });
  }
  meleeTarget(range: number, minDot: number) {
    const eye = this.playerEye(v3());
    const fwd = this.forward(v3());
    let best = null;
    let bestD = Infinity;
    for (const e of this.enemies) {
      if (!e.alive || e.spawnT < 1)
        continue;
      const chest = [e.pos[0], e.pos[1] + 1.25, e.pos[2]];
      const to = [chest[0] - eye[0], chest[1] - eye[1], chest[2] - eye[2]];
      const d = len(to);
      if (d > range + 0.3)
        continue;
      normalize(to, to);
      if (dot(to, fwd) < minDot)
        continue;
      if (d < bestD && this.static.lineClear(eye, chest)) {
        best = e;
        bestD = d;
      }
    }
    return best;
  }
  throwHeld(strength: number) {
    const p = this.player;
    const item = p.held;
    if (!item)
      return;
    p.held = null;
    p.burstLeft = 0;
    p.throwAge = 0;
    const eye = this.playerEye(v3());
    const fwd = this.forward(v3());
    const right = [Math.cos(p.yaw), 0, -Math.sin(p.yaw)];
    let start = [eye[0] + fwd[0] * 0.45 + right[0] * 0.12, eye[1] + fwd[1] * 0.45 - 0.08, eye[2] + fwd[2] * 0.45 + right[2] * 0.12];
    if (!this.static.lineClear(eye, start))
      start = [eye[0], eye[1] - 0.05, eye[2]];
    const s = THROW_SPEED * strength;
    const vel = [fwd[0] * s + p.vel[0], fwd[1] * s + 1.2 * strength + p.vel[1] * 0.5, fwd[2] * s + p.vel[2]];
    const prop = this.addProp(item, start, vel, strength > 0.5);
    prop.rot = [0, p.yaw, 0];
    prop.angVel = [this.rng.sym(12) - 8 * strength, this.rng.sym(4), this.rng.sym(6)];
    this.events.push({ type: "throw" });
  }
  pickUp(prop: Prop) {
    const p = this.player;
    prop.alive = false;
    p.held = prop.item;
    p.fireCooldown = Math.max(p.fireCooldown, 0.12);
    p.pickupAge = 0;
    this.events.push({ type: "pickup", kind: prop.item.kind });
  }
  findAimProp() {
    const eye = this.playerEye(v3());
    const fwd = this.forward(v3());
    let best = null;
    let bestScore = Infinity;
    for (const pr of this.props) {
      if (!pr.alive || pr.thrown)
        continue;
      const to = [pr.pos[0] - eye[0], pr.pos[1] - eye[1], pr.pos[2] - eye[2]];
      const along = dot(to, fwd);
      if (along < 0.1 || along > REACH)
        continue;
      const perp = Math.sqrt(Math.max(0, distSq(to, [0, 0, 0]) - along * along));
      const tol = 0.3 + along * 0.06;
      if (perp > tol)
        continue;
      const score = perp / tol + along * 0.1;
      if (score < bestScore && this.static.lineClear(eye, pr.pos)) {
        best = pr;
        bestScore = score;
      }
    }
    return best;
  }
  nearestPropInRadius(r: number) {
    let best = null;
    let bestD = r;
    for (const pr of this.props) {
      if (!pr.alive || pr.thrown)
        continue;
      const d = distXZ(pr.pos, this.player.pos);
      if (d < bestD && Math.abs(pr.pos[1] - this.player.pos[1]) < 1.8) {
        best = pr;
        bestD = d;
      }
    }
    return best;
  }
  spawnProjectile(origin: number[], dir: number[], ownerId: number, shotId: number) {
    this.projectiles.push({
      pos: [origin[0], origin[1], origin[2]],
      prevPos: [origin[0], origin[1], origin[2]],
      vel: [dir[0] * BULLET_SPEED, dir[1] * BULLET_SPEED, dir[2] * BULLET_SPEED],
      spawnPos: [origin[0], origin[1], origin[2]],
      ownerId,
      shotId,
      age: 0,
      alive: true
    });
    if (ownerId !== 0)
      this.recentShots.push({ pos: [origin[0], origin[1], origin[2]], time: this.simTime });
  }
  perturbDirection(d: number[], coneDeg: number) {
    normalize(d, d);
    if (coneDeg <= 0)
      return;
    const ang = coneDeg * Math.PI / 180;
    const up = Math.abs(d[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0];
    const ax = [d[1] * up[2] - d[2] * up[1], d[2] * up[0] - d[0] * up[2], d[0] * up[1] - d[1] * up[0]];
    normalize(ax, ax);
    const ay = [d[1] * ax[2] - d[2] * ax[1], d[2] * ax[0] - d[0] * ax[2], d[0] * ax[1] - d[1] * ax[0]];
    const r = Math.sqrt(this.rng.next()) * Math.tan(ang);
    const phi = this.rng.next() * Math.PI * 2;
    const ox = Math.cos(phi) * r, oy = Math.sin(phi) * r;
    d[0] += ax[0] * ox + ay[0] * oy;
    d[1] += ax[1] * ox + ay[1] * oy;
    d[2] += ax[2] * ox + ay[2] * oy;
    normalize(d, d);
  }
  heardShot(pos: number[]) {
    for (const s of this.recentShots) {
      if (this.simTime - s.time < 0.5 && distSq(s.pos, pos) < SHOT_HEARING * SHOT_HEARING)
        return true;
    }
    return false;
  }
  killPlayer(dir: number[]) {
    const p = this.player;
    if (!p.alive || p.invulnerable)
      return;
    p.alive = false;
    this.failed = true;
    this.events.push({ type: "playerDeath", dir });
  }
  killEnemy(e: Enemy, dir: number[], point: number[], silent: boolean) {
    if (!e.alive)
      return;
    e.alive = false;
    this.stats.kills++;
    if (!silent)
      this.disarm(e, dir);
    this.events.push({ type: "enemyDeath", enemy: e, dir: [dir[0], dir[1], dir[2]], point: [point[0], point[1], point[2]], silent });
  }
  disarm(e: Enemy, dir: number[]) {
    if (!e.weapon)
      return;
    const item = e.weapon;
    e.weapon = null;
    e.burstLeft = 0;
    e.telegraph = 0;
    if (!isWeapon(item.kind))
      return;
    const dropped = newItem(item.kind);
    const muzzle = enemyMuzzle(e, v3());
    const vel = [dir[0] * 2 + this.rng.sym(0.8), 2.2 + this.rng.next(), dir[2] * 2 + this.rng.sym(0.8)];
    const pos = [muzzle[0], muzzle[1], muzzle[2]];
    if (!this.static.lineClear([e.pos[0], e.pos[1] + 1.3, e.pos[2]], pos)) {
      pos[0] = e.pos[0];
      pos[1] = e.pos[1] + 1.3;
      pos[2] = e.pos[2];
    }
    const pr = this.addProp(dropped, pos, vel, false);
    pr.angVel = [this.rng.sym(8), this.rng.sym(8), this.rng.sym(8)];
  }
  stun(e: Enemy, seconds: number, dir: number[], push: number) {
    e.state = "stunned";
    e.stateTime = 0;
    e.stunTimer = seconds;
    e.meleeT = 0;
    e.telegraph = 0;
    e.burstLeft = 0;
    e.vel[0] += dir[0] * push;
    e.vel[2] += dir[2] * push;
    this.events.push({ type: "enemyHit", pos: [e.pos[0], e.pos[1] + 1.3, e.pos[2]], dir: [dir[0], dir[1], dir[2]] });
  }
  findGunPropFor(e: Enemy) {
    if (e.targetPropId >= 0) {
      const cur = this.props.find((p) => p.id === e.targetPropId && p.alive && !p.thrown);
      if (cur)
        return cur;
      e.targetPropId = -1;
    }
    let best = null;
    let bestD = 10;
    for (const pr of this.props) {
      if (!pr.alive || pr.thrown || !isGun(pr.item.kind) || pr.claimedBy >= 0 && pr.claimedBy !== e.id)
        continue;
      if (Math.hypot(pr.vel[0], pr.vel[1], pr.vel[2]) > 1)
        continue;
      const d = distXZ(pr.pos, e.pos);
      if (d < bestD && Math.abs(pr.pos[1] - e.pos[1]) < 1.2) {
        best = pr;
        bestD = d;
      }
    }
    if (best) {
      best.claimedBy = e.id;
      e.targetPropId = best.id;
    }
    return best;
  }
  enemyPickUp(e: Enemy, prop: Prop) {
    prop.alive = false;
    e.weapon = prop.item;
    e.targetPropId = -1;
    e.fireCooldown = 0.8;
    e.aimTimer = 0.6;
  }
  step(dt: number) {
    this.simTime += dt;
    const p = this.player;
    for (const e of this.enemies)
      savePrev(e);
    for (const pr of this.props) {
      copy(pr.prevPos, pr.pos);
      copy(pr.prevRot, pr.rot);
    }
    p.fireCooldown -= dt;
    p.punchCooldown -= dt;
    p.punchAge += dt;
    p.recoilAge += dt;
    p.throwAge += dt;
    p.slashAge += dt;
    p.pickupAge += dt;
    if (p.burstLeft > 0 && p.alive) {
      p.burstTimer -= dt;
      if (p.burstTimer <= 0) {
        const held = p.held;
        if (held && isGun(held.kind) && held.ammo > 0) {
          held.ammo--;
          this.playerVolley(held.kind);
          p.burstLeft--;
          p.burstTimer = WEAPONS[held.kind].burstInterval;
        } else {
          p.burstLeft = 0;
        }
      }
    }
    this.updateWaves(dt);
    this.flushSpawnQueue(false);
    for (const e of this.enemies)
      if (e.alive)
        updateEnemy(this, e, dt);
    this.stepProps(dt);
    this.stepProjectiles(dt);
    removeDead(this.enemies);
    removeDead(this.props);
    removeDead(this.projectiles);
    while (this.recentShots.length > 0 && this.simTime - this.recentShots[0].time > 1)
      this.recentShots.shift();
    this.checkWin();
  }
  updateWaves(dt: number) {
    const waves = this.def.waves;
    while (this.waveIndex < waves.length) {
      const w = waves[this.waveIndex];
      if (!this.waveArmed) {
        let ok = false;
        const t = w.when;
        switch (t.type) {
          case "start":
            ok = true;
            break;
          case "remaining":
            ok = this.enemies.length + this.spawnQueue.length <= t.count!;
            break;
          case "zone": {
            const [x0, z0, x1, z1] = t.rect!;
            const px = this.player.pos[0], pz = this.player.pos[2];
            ok = px >= Math.min(x0, x1) && px <= Math.max(x0, x1) && pz >= Math.min(z0, z1) && pz <= Math.max(z0, z1);
            break;
          }
          case "time":
            ok = this.simTime - this.lastWaveTime >= t.seconds!;
            break;
        }
        if (!ok)
          break;
        this.waveArmed = true;
        this.waveDelay = w.delay ?? 0;
      }
      this.waveDelay -= dt;
      if (this.waveDelay > 0)
        break;
      for (const s of w.spawns)
        this.spawnQueue.push({ spawn: s });
      this.waveIndex++;
      this.waveArmed = false;
      this.lastWaveTime = this.simTime;
    }
  }
  flushSpawnQueue(initial: boolean) {
    const max = this.def.maxActive ?? 8;
    while (this.spawnQueue.length > 0 && this.enemies.length < max) {
      const q = this.spawnQueue.shift()!;
      const s = q.spawn;
      const requested = s.pos.length === 2 ? [s.pos[0], 0.05, s.pos[1]] : [s.pos[0], s.pos[1] + 0.05, s.pos[2]];
      const pos = this.static.characterSpawn(requested, ENEMY_RADIUS, ENEMY_HEIGHT);
      const yaw = s.yaw ?? Math.atan2(-(this.player.pos[0] - pos[0]), -(this.player.pos[2] - pos[2]));
      const e = createEnemy(this.nextId++, s.kind, pos, yaw, s.weapon, !!s.idle, this.rng.next());
      if (initial)
        e.spawnT = 1;
      e.prevSpawnT = e.spawnT;
      this.enemies.push(e);
      if (!initial)
        this.events.push({ type: "spawn", pos: [pos[0], pos[1], pos[2]] });
    }
  }
  checkWin() {
    if (this.cleared || this.failed || !this.player.alive)
      return;
    const allSpawned = this.waveIndex >= this.def.waves.length && this.spawnQueue.length === 0;
    const allDead = allSpawned && this.enemies.length === 0;
    const exit = this.def.exit;
    if (exit) {
      const [x0, z0, x1, z1] = exit.rect;
      const px = this.player.pos[0], pz = this.player.pos[2];
      const inside = px >= Math.min(x0, x1) && px <= Math.max(x0, x1) && pz >= Math.min(z0, z1) && pz <= Math.max(z0, z1);
      if (inside && (!exit.requiresClear || allDead))
        this.cleared = true;
    } else if (allDead) {
      this.cleared = true;
    }
    if (this.cleared)
      this.player.invulnerable = true;
  }
  addProp(item: Item, pos: number[], vel: number[], thrown: boolean) {
    const pr = {
      id: this.nextId++,
      item,
      pos: [pos[0], pos[1], pos[2]],
      prevPos: [pos[0], pos[1], pos[2]],
      vel: [vel[0], vel[1], vel[2]],
      rot: [REST_ROT[item.kind][0], 0, REST_ROT[item.kind][1]],
      prevRot: [REST_ROT[item.kind][0], 0, REST_ROT[item.kind][1]],
      angVel: v3(),
      thrown,
      sleeping: false,
      restTimer: 0,
      alive: true,
      claimedBy: -1
    };
    this.props.push(pr);
    return pr;
  }
  stepProps(dt: number) {
    for (const pr of this.props) {
      if (!pr.alive || pr.sleeping)
        continue;
      const prev = [pr.pos[0], pr.pos[1], pr.pos[2]];
      pr.vel[1] -= GRAVITY2 * dt;
      const drag = 1 - 0.05 * dt;
      pr.vel[0] *= drag;
      pr.vel[2] *= drag;
      pr.pos[0] += pr.vel[0] * dt;
      pr.pos[1] += pr.vel[1] * dt;
      pr.pos[2] += pr.vel[2] * dt;
      pr.rot[0] += pr.angVel[0] * dt;
      pr.rot[1] += pr.angVel[1] * dt;
      pr.rot[2] += pr.angVel[2] * dt;
      if (pr.thrown) {
        const hitR = ITEM_RADIUS[pr.item.kind];
        for (const e of this.enemies) {
          if (!e.alive || e.spawnT < 1)
            continue;
          const head = [e.pos[0], e.pos[1] + HEAD_OFFSET, e.pos[2]];
          const th = segmentSphere(prev, pr.pos, head, HEAD_RADIUS + hitR);
          const tb = segmentCapsule(prev, pr.pos, [e.pos[0], e.pos[1] + BODY_A, e.pos[2]], [e.pos[0], e.pos[1] + BODY_B, e.pos[2]], BODY_RADIUS + hitR);
          if (th < 0 && tb < 0)
            continue;
          const dir = normalize(v3(), pr.vel);
          const heavy = pr.item.kind === "brick" || isWeapon(pr.item.kind);
          if (th >= 0) {
            this.killEnemy(e, dir, head, false);
          } else {
            this.disarm(e, dir);
            this.stun(e, heavy ? 1.6 : 1.3, dir, 3);
            e.hitFlash = 1;
          }
          pr.vel[0] *= -0.25;
          pr.vel[1] = Math.abs(pr.vel[1]) * 0.3 + 1;
          pr.vel[2] *= -0.25;
          pr.thrown = false;
          if (FRAGILE[pr.item.kind])
            this.breakProp(pr);
          break;
        }
        if (!pr.alive)
          continue;
      }
      const res = this.static.resolveSphere(pr.pos, pr.vel, PROP_PHYS_RADIUS, 0.3, 0.12);
      if (res.impact > 0.5) {
        pr.angVel[0] *= 0.6;
        pr.angVel[1] *= 0.6;
        pr.angVel[2] *= 0.6;
        if (res.impact > 2)
          this.events.push({ type: "propImpact", pos: [pr.pos[0], pr.pos[1], pr.pos[2]], speed: res.impact });
        if (pr.thrown && FRAGILE[pr.item.kind] && res.impact > 4) {
          this.breakProp(pr);
          continue;
        }
        if (pr.thrown && res.impact > 3)
          pr.thrown = false;
      }
      const speed = len(pr.vel);
      if (pr.thrown && speed < 4)
        pr.thrown = false;
      if (res.grounded && speed < 0.35) {
        pr.restTimer += dt;
        pr.angVel[0] *= 0.8;
        pr.angVel[1] *= 0.8;
        pr.angVel[2] *= 0.8;
        if (pr.restTimer > 0.35) {
          pr.sleeping = true;
          pr.vel[0] = pr.vel[1] = pr.vel[2] = 0;
          const rest = REST_ROT[pr.item.kind];
          pr.rot[0] = rest[0];
          pr.rot[2] = rest[1];
          copy(pr.prevRot, pr.rot);
        }
      } else {
        pr.restTimer = 0;
      }
      if (pr.pos[1] < -10)
        pr.alive = false;
    }
  }
  breakProp(pr: Prop) {
    pr.alive = false;
    this.events.push({ type: "itemBreak", pos: [pr.pos[0], pr.pos[1], pr.pos[2]], kind: pr.item.kind });
  }
  wake(pr: Prop) {
    pr.sleeping = false;
    pr.restTimer = 0;
  }
  stepProjectiles(dt: number) {
    const bullets = this.projectiles;
    const playerHead = v3();
    const pa = v3();
    const pb = v3();
    const dirN = v3();
    for (const b of bullets) {
      if (!b.alive)
        continue;
      copy(b.prevPos, b.pos);
      b.age += dt;
      if (b.age > BULLET_LIFE) {
        b.alive = false;
        continue;
      }
      const next = [b.pos[0] + b.vel[0] * dt, b.pos[1] + b.vel[1] * dt, b.pos[2] + b.vel[2] * dt];
      const segLen = BULLET_SPEED * dt;
      normalize(dirN, b.vel);
      let bestT = 1;
      let hitKind = "none";
      let hitEnemy = null;
      let hitProp = null;
      let hitNormal = [0, 1, 0];
      const sh = this.static.raycast(b.pos, dirN, segLen);
      if (sh) {
        bestT = sh.t / segLen;
        hitKind = "static";
        hitNormal = sh.normal;
      }
      for (const e of this.enemies) {
        if (!e.alive || e.spawnT < 1)
          continue;
        if (e.id === b.ownerId && b.age < 0.25)
          continue;
        if (Math.abs(e.pos[0] - b.pos[0]) > 3 || Math.abs(e.pos[2] - b.pos[2]) > 3)
          continue;
        const head = [e.pos[0], e.pos[1] + HEAD_OFFSET, e.pos[2]];
        const th = segmentSphere(b.pos, next, head, HEAD_RADIUS + BULLET_RADIUS);
        if (th >= 0 && th < bestT) {
          bestT = th;
          hitKind = "head";
          hitEnemy = e;
        }
        pa[0] = e.pos[0];
        pa[1] = e.pos[1] + BODY_A;
        pa[2] = e.pos[2];
        pb[0] = e.pos[0];
        pb[1] = e.pos[1] + BODY_B;
        pb[2] = e.pos[2];
        const tb = segmentCapsule(b.pos, next, pa, pb, BODY_RADIUS + BULLET_RADIUS);
        if (tb >= 0 && tb < bestT) {
          bestT = tb;
          hitKind = "enemy";
          hitEnemy = e;
        }
      }
      const p = this.player;
      if (b.ownerId !== 0 && p.alive) {
        pa[0] = p.pos[0];
        pa[1] = p.pos[1] + PLAYER_BODY_A;
        pa[2] = p.pos[2];
        pb[0] = p.pos[0];
        pb[1] = p.pos[1] + PLAYER_BODY_B;
        pb[2] = p.pos[2];
        const tp = segmentCapsule(b.pos, next, pa, pb, PLAYER_BODY_R + BULLET_RADIUS);
        this.playerEye(playerHead);
        const thd = segmentSphere(b.pos, next, playerHead, 0.16);
        const t = tp >= 0 && thd >= 0 ? Math.min(tp, thd) : Math.max(tp, thd);
        if (t >= 0 && t < bestT) {
          bestT = t;
          hitKind = "player";
        }
      }
      for (const pr of this.props) {
        if (!pr.alive)
          continue;
        if (Math.abs(pr.pos[0] - b.pos[0]) > 1.5 || Math.abs(pr.pos[2] - b.pos[2]) > 1.5)
          continue;
        const t = segmentSphere(b.pos, next, pr.pos, ITEM_RADIUS[pr.item.kind] + BULLET_RADIUS);
        if (t >= 0 && t < bestT) {
          bestT = t;
          hitKind = "prop";
          hitProp = pr;
        }
      }
      const hitPoint = [b.pos[0] + (next[0] - b.pos[0]) * bestT, b.pos[1] + (next[1] - b.pos[1]) * bestT, b.pos[2] + (next[2] - b.pos[2]) * bestT];
      switch (hitKind) {
        case "none":
          copy(b.pos, next);
          break;
        case "static":
          b.alive = false;
          copy(b.pos, hitPoint);
          this.events.push({ type: "impact", pos: hitPoint, normal: hitNormal });
          break;
        case "head":
        case "enemy":
          b.alive = false;
          copy(b.pos, hitPoint);
          if (hitEnemy)
            this.killEnemy(hitEnemy, [dirN[0], dirN[1], dirN[2]], hitPoint, false);
          break;
        case "player":
          b.alive = false;
          copy(b.pos, hitPoint);
          this.killPlayer([dirN[0], dirN[1], dirN[2]]);
          break;
        case "prop":
          b.alive = false;
          copy(b.pos, hitPoint);
          if (hitProp) {
            this.wake(hitProp);
            hitProp.vel[0] += dirN[0] * 3;
            hitProp.vel[1] += 1.5;
            hitProp.vel[2] += dirN[2] * 3;
            hitProp.angVel[0] += this.rng.sym(10);
            hitProp.angVel[2] += this.rng.sym(10);
            if (FRAGILE[hitProp.item.kind])
              this.breakProp(hitProp);
          }
          this.events.push({ type: "impact", pos: hitPoint, normal: [-dirN[0], -dirN[1], -dirN[2]] });
          break;
      }
    }
    const n = bullets.length;
    for (let i = 0; i < n; i++) {
      const a = bullets[i];
      if (!a.alive)
        continue;
      for (let j = i + 1; j < n; j++) {
        const c = bullets[j];
        if (!c.alive || c.shotId === a.shotId)
          continue;
        if (distSq(a.pos, c.pos) < 0.16 * 0.16 || segmentSphere(a.prevPos, a.pos, c.pos, 0.12) >= 0) {
          a.alive = false;
          c.alive = false;
          this.events.push({ type: "bulletClash", pos: [(a.pos[0] + c.pos[0]) / 2, (a.pos[1] + c.pos[1]) / 2, (a.pos[2] + c.pos[2]) / 2] });
          break;
        }
      }
    }
  }
  activeLasers() {
    const out = [];
    for (const e of this.enemies) {
      if (!e.alive || e.telegraph <= 0)
        continue;
      out.push({ origin: enemyMuzzle(e, v3()), dir: [...e.lockedDir], progress: clamp(1 - e.telegraph / 0.6, 0, 1) });
    }
    return out;
  }
};
function removeDead(list: {alive:boolean}[]) {
  let w = 0;
  for (let r = 0; r < list.length; r++) {
    const item = list[r];
    if (item.alive)
      list[w++] = item;
  }
  list.length = w;
}

export { EYE_HEIGHT,GRAVITY2,PLAYER_BODY_A,PLAYER_BODY_B,PLAYER_BODY_R,PLAYER_HEIGHT,PLAYER_RADIUS,PROP_PHYS_RADIUS,PUNCH_COOLDOWN,PUNCH_RANGE,REACH,removeDead,REST_ROT,SHOT_HEARING,SLASH_RANGE,THROW_SPEED,World };
