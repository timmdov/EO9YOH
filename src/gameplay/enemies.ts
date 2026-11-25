import { angleDiff,approach,clamp,copy,distXZ,turnToward,v3,yawOf } from "../core/math";
import type { Enemy,EnemyKind,ItemKind } from "../types";
import { BULLET_SPEED,isGun,newItem,WEAPONS } from "./weapons";
import type { World } from "./world";
var ENEMY_PARAMS = {
  walker: { speed: 2.3, turnRate: 5, reaction: 0.5, aimError: 3.2, keepDist: 6, cooldownMul: 2.4, hp: 2, defaultWeapon: "pistol" as ItemKind },
  rusher: { speed: 5.2, turnRate: 9, reaction: 0.25, aimError: 0, keepDist: 0, cooldownMul: 1, hp: 2, defaultWeapon: null },
  marksman: { speed: 1.1, turnRate: 3.2, reaction: 0.7, aimError: 1, keepDist: 40, cooldownMul: 1, hp: 2, defaultWeapon: "carbine" as ItemKind }
};
var ENEMY_RADIUS = 0.3;
var ENEMY_HEIGHT = 1.8;
var HEAD_OFFSET = 1.7;
var HEAD_RADIUS = 0.17;
var BODY_A = 0.25;
var BODY_B = 1.45;
var BODY_RADIUS = 0.27;
var SPAWN_TIME = 0.6;
var MELEE_TIME = 0.55;
var MELEE_STRIKE_AT = 0.65;
var MELEE_RANGE = 1.5;
var TELEGRAPH = 0.6;
var MARKSMAN_COOLDOWN = 1.9;
var GRAVITY = 18;
var MUZZLE_LOCAL = [0.24, 1.48, -0.72];
function createEnemy(id: number, kind: EnemyKind, pos: number[], yaw: number, weapon: ItemKind | null | undefined, idle: boolean, seed: number): Enemy {
  const params = ENEMY_PARAMS[kind];
  const w = weapon === void 0 ? params.defaultWeapon : weapon;
  return {
    id,
    kind,
    alive: true,
    pos: [pos[0], pos[1], pos[2]],
    prevPos: [pos[0], pos[1], pos[2]],
    vel: v3(),
    yaw,
    prevYaw: yaw,
    grounded: false,
    state: idle ? "idle" : "alert",
    stateTime: 0,
    hp: params.hp,
    weapon: w ? newItem(w) : null,
    fireCooldown: 0.6,
    burstLeft: 0,
    burstTimer: 0,
    aimTimer: params.reaction,
    telegraph: 0,
    lockedDir: [0, 0, -1],
    meleeT: 0,
    prevMeleeT: 0,
    meleeCooldown: 0,
    stunTimer: 0,
    path: null,
    pathIndex: 0,
    repathTimer: 0,
    seesPlayer: false,
    walkPhase: seed * 6.28,
    prevWalkPhase: seed * 6.28,
    moveBlend: 0,
    prevMoveBlend: 0,
    aimBlend: 0,
    prevAimBlend: 0,
    aimPitch: 0,
    hitFlash: 0,
    spawnT: 0,
    prevSpawnT: 0,
    strafeSeed: seed * 10,
    targetPropId: -1,
    lastShotId: -1
  };
}
function enemyIsTwoHanded(e: Enemy) {
  return !!e.weapon && (e.weapon.kind === "scatter" || e.weapon.kind === "carbine");
}
function enemyMuzzle(e: Enemy, out: number[]) {
  const c = Math.cos(e.yaw);
  const s = Math.sin(e.yaw);
  const lx = MUZZLE_LOCAL[0], lz = MUZZLE_LOCAL[2];
  out[0] = e.pos[0] + lx * c + lz * s;
  out[1] = e.pos[1] + MUZZLE_LOCAL[1];
  out[2] = e.pos[2] - lx * s + lz * c;
  return out;
}
var scratchA = v3();
var scratchB = v3();
var scratchC = v3();
function savePrev(e: Enemy) {
  copy(e.prevPos, e.pos);
  e.prevYaw = e.yaw;
  e.prevWalkPhase = e.walkPhase;
  e.prevMoveBlend = e.moveBlend;
  e.prevAimBlend = e.aimBlend;
  e.prevSpawnT = e.spawnT;
  e.prevMeleeT = e.meleeT;
}
function updateEnemy(world: World, e: Enemy, dt: number) {
  const params = ENEMY_PARAMS[e.kind];
  e.stateTime += dt;
  e.hitFlash = Math.max(0, e.hitFlash - dt * 4);
  if (e.spawnT < 1) {
    e.spawnT = Math.min(1, e.spawnT + dt / SPAWN_TIME);
    applyGravityAndMove(world, e, 0, 0, dt);
    return;
  }
  e.fireCooldown -= dt;
  e.meleeCooldown -= dt;
  e.stunTimer -= dt;
  const player = world.player;
  const eye = [e.pos[0], e.pos[1] + 1.6, e.pos[2]];
  const playerEye = world.playerEye(scratchA);
  const dx = playerEye[0] - eye[0];
  const dz = playerEye[2] - eye[2];
  const distP = Math.hypot(dx, dz);
  const yawToPlayer = yawOf(dx, dz);
  let canSee = false;
  if (player.alive) {
    const inFov = Math.abs(angleDiff(yawToPlayer, e.yaw)) < 1.25 || distP < 5 || e.state !== "idle";
    canSee = inFov && distP < 45 && world.static.lineClear(eye, playerEye);
  }
  if (canSee && !e.seesPlayer)
    e.aimTimer = Math.max(e.aimTimer, params.reaction * 0.6);
  e.seesPlayer = canSee;
  let desiredYaw = e.yaw;
  let moveTarget = null;
  let speed = 0;
  let aimWanted = false;
  let stopDist = 0.3;
  if (e.state === "stunned") {
    if (e.stunTimer <= 0)
      setState(e, "pursue");
  } else if (e.state === "idle") {
    if (canSee || world.heardShot(e.pos)) {
      setState(e, "alert");
      e.aimTimer = params.reaction;
    }
  } else if (e.state === "alert") {
    desiredYaw = yawToPlayer;
    if (e.stateTime >= params.reaction)
      setState(e, "pursue");
  }
  if (e.state === "pursue" && player.alive) {
    const hasGun = !!e.weapon && isGun(e.weapon.kind);
    let fetching = false;
    if (!e.weapon && e.kind !== "rusher") {
      const prop = world.findGunPropFor(e);
      if (prop) {
        fetching = true;
        moveTarget = prop.pos;
        speed = params.speed * 1.2;
        stopDist = 0;
        desiredYaw = yawOf(prop.pos[0] - e.pos[0], prop.pos[2] - e.pos[2]);
        if (distXZ(prop.pos, e.pos) < 0.75 && Math.abs(prop.pos[1] - e.pos[1]) < 1.2)
          world.enemyPickUp(e, prop);
      }
    }
    if (!fetching && hasGun) {
      if (canSee) {
        aimWanted = true;
        desiredYaw = yawToPlayer;
        if (distP > params.keepDist) {
          moveTarget = player.pos;
          speed = params.speed * 0.7;
        } else if (e.kind === "walker") {
          const strafe = Math.sin(world.simTime * 0.9 + e.strafeSeed) * 1.2;
          const rx = Math.cos(e.yaw), rz = -Math.sin(e.yaw);
          scratchB[0] = e.pos[0] + rx * strafe;
          scratchB[1] = e.pos[1];
          scratchB[2] = e.pos[2] + rz * strafe;
          moveTarget = scratchB;
          speed = params.speed * 0.35;
          stopDist = 0.1;
        }
        e.aimTimer -= dt;
        e.aimPitch = Math.atan2(playerEye[1] - 0.35 - (e.pos[1] + 1.48), Math.max(0.1, distP));
        handleShooting(world, e, dt, Math.abs(angleDiff(yawToPlayer, e.yaw)) < 0.14);
      } else {
        e.aimTimer = Math.max(e.aimTimer, params.reaction * 0.5);
        e.telegraph = 0;
        if (e.kind !== "marksman") {
          moveTarget = player.pos;
          speed = params.speed;
        } else {
          desiredYaw = yawToPlayer;
        }
        if (e.burstLeft > 0)
          handleShooting(world, e, dt, false);
      }
    } else if (!fetching) {
      const meleeSpeed = e.kind === "rusher" ? params.speed : params.speed * 1.3;
      desiredYaw = yawToPlayer;
      if (e.meleeT > 0) {
        e.meleeT += dt / MELEE_TIME;
        const before = e.prevMeleeT;
        if (before < MELEE_STRIKE_AT && e.meleeT >= MELEE_STRIKE_AT)
          meleeStrike(world, e);
        if (e.meleeT >= 1)
          e.meleeT = 0;
        speed = e.meleeT < MELEE_STRIKE_AT ? meleeSpeed * 0.25 : 0;
        moveTarget = player.pos;
      } else {
        moveTarget = player.pos;
        speed = meleeSpeed;
        stopDist = 0.9;
        if (distP < MELEE_RANGE && e.meleeCooldown <= 0 && Math.abs(angleDiff(yawToPlayer, e.yaw)) < 0.7 && Math.abs(playerEye[1] - eye[1]) < 1.2) {
          e.meleeT = 1e-3;
          world.events.push({ type: "melee", pos: [eye[0], eye[1], eye[2]] });
        }
      }
    }
  } else if (e.state === "pursue") {
    e.telegraph = 0;
  }
  let wantX = 0;
  let wantZ = 0;
  if (moveTarget && speed > 0 && e.state !== "stunned") {
    const tdist = distXZ(moveTarget, e.pos);
    if (tdist > stopDist) {
      const wp = nextWaypoint(world, e, moveTarget, dt);
      const wx = wp[0] - e.pos[0];
      const wz = wp[2] - e.pos[2];
      const wl = Math.hypot(wx, wz);
      if (wl > 1e-4) {
        const sp = tdist < 1 ? speed * Math.max(0.3, tdist) : speed;
        wantX = wx / wl * sp;
        wantZ = wz / wl * sp;
        if (!aimWanted && e.meleeT === 0 && e.state === "pursue" && distP > 4)
          desiredYaw = yawOf(wx, wz);
      }
    }
  }
  for (const o of world.enemies) {
    if (o === e || !o.alive)
      continue;
    const sx = e.pos[0] - o.pos[0];
    const sz = e.pos[2] - o.pos[2];
    const sd = Math.hypot(sx, sz);
    if (sd < 0.75 && sd > 1e-4) {
      const push = (0.75 - sd) * 6;
      wantX += sx / sd * push;
      wantZ += sz / sd * push;
    }
  }
  const accel = e.state === "stunned" ? 4 : 14;
  e.vel[0] += clamp(wantX - e.vel[0], -accel * dt, accel * dt);
  e.vel[2] += clamp(wantZ - e.vel[2], -accel * dt, accel * dt);
  if (e.state !== "stunned")
    e.yaw = turnToward(e.yaw, desiredYaw, params.turnRate * dt);
  applyGravityAndMove(world, e, e.vel[0], e.vel[2], dt);
  const hs = Math.hypot(e.vel[0], e.vel[2]);
  e.moveBlend = approach(e.moveBlend, clamp(hs / 2.4, 0, 1), 0.12, dt);
  e.walkPhase += hs * dt * (e.kind === "rusher" ? 2.6 : 3.4);
  e.aimBlend = approach(e.aimBlend, aimWanted || e.telegraph > 0 || e.burstLeft > 0 ? 1 : 0, 0.12, dt);
  if (!aimWanted)
    e.aimPitch = approach(e.aimPitch, 0, 0.3, dt);
  if (e.pos[1] < -6)
    world.killEnemy(e, [0, -1, 0], e.pos, true);
}
function setState(e: Enemy, s: string) {
  e.state = s;
  e.stateTime = 0;
}
function applyGravityAndMove(world: World, e: Enemy, vx: number, vz: number, dt: number) {
  e.vel[1] -= GRAVITY * dt;
  if (e.vel[1] < -30)
    e.vel[1] = -30;
  scratchC[0] = vx * dt;
  scratchC[1] = e.vel[1] * dt;
  scratchC[2] = vz * dt;
  const res = world.static.moveCharacter(e.pos, scratchC, ENEMY_RADIUS, ENEMY_HEIGHT, 0.42, e.grounded);
  e.grounded = res.grounded;
  if (res.grounded && e.vel[1] < 0)
    e.vel[1] = 0;
  if (res.hitCeiling && e.vel[1] > 0)
    e.vel[1] = 0;
}
function nextWaypoint(world: World, e: Enemy, target: number[], dt: number) {
  const directClear = world.static.characterLineClear(e.pos, target, ENEMY_RADIUS, ENEMY_HEIGHT);
  const straight = distXZ(target, e.pos) < 2.2 && Math.abs(target[1] - e.pos[1]) < 0.5 && directClear;
  if (straight) {
    e.path = null;
    return target;
  }
  e.repathTimer -= dt;
  const pathEnd = e.path ? e.path[e.path.length - 1] : void 0;
  if (!e.path || e.repathTimer <= 0 || pathEnd && distXZ(pathEnd, target) > 2) {
    e.path = world.nav.findPath(e.pos, target);
    e.pathIndex = 0;
    e.repathTimer = 0.5 + world.rng.next() * 0.3;
  }
  const path = e.path;
  if (!path || path.length === 0)
    return directClear ? target : e.pos;
  while (e.pathIndex < path.length - 1 && distXZ(path[e.pathIndex], e.pos) < 0.4)
    e.pathIndex++;
  return path[e.pathIndex];
}
function handleShooting(world: World, e: Enemy, dt: number, aligned: boolean) {
  const w = e.weapon;
  if (!w || !isGun(w.kind))
    return;
  const def = WEAPONS[w.kind];
  const params = ENEMY_PARAMS[e.kind];
  if (e.kind === "marksman") {
    if (e.telegraph > 0) {
      e.telegraph -= dt;
      if (e.telegraph <= 0) {
        e.telegraph = 0;
        fireVolley(world, e, e.lockedDir, 1, 0);
        e.fireCooldown = MARKSMAN_COOLDOWN + world.rng.next() * 0.4;
      }
      return;
    }
    if (e.aimTimer <= 0 && e.fireCooldown <= 0 && aligned) {
      aimDirection(world, e, params.aimError, e.lockedDir);
      e.telegraph = TELEGRAPH;
    }
    return;
  }
  if (e.burstLeft > 0) {
    e.burstTimer -= dt;
    if (e.burstTimer <= 0) {
      const dir = aimDirection(world, e, params.aimError * 1.3, v3());
      fireVolley(world, e, dir, def.pellets, def.spread);
      e.burstLeft--;
      e.burstTimer = def.burstInterval * 1.4;
    }
    return;
  }
  if (e.aimTimer <= 0 && e.fireCooldown <= 0 && aligned) {
    const dir = aimDirection(world, e, params.aimError, v3());
    fireVolley(world, e, dir, def.pellets, def.spread);
    e.burstLeft = def.burst - 1;
    e.burstTimer = def.burstInterval * 1.4;
    e.fireCooldown = def.cooldown * params.cooldownMul + world.rng.next() * 0.6;
  }
}
function aimDirection(world: World, e: Enemy, errorDeg: number, out: number[]) {
  const muzzle = enemyMuzzle(e, v3());
  const p = world.player;
  const tx = p.pos[0], ty = p.pos[1] + 1.25, tz = p.pos[2];
  const d = Math.hypot(tx - muzzle[0], ty - muzzle[1], tz - muzzle[2]);
  const lead = d / BULLET_SPEED * 0.5;
  out[0] = tx + p.vel[0] * lead - muzzle[0];
  out[1] = ty + p.vel[1] * lead * 0.3 - muzzle[1];
  out[2] = tz + p.vel[2] * lead - muzzle[2];
  world.perturbDirection(out, errorDeg);
  return out;
}
function fireVolley(world: World, e: Enemy, dir: number[], pellets: number, spread: number) {
  const muzzle = enemyMuzzle(e, v3());
  const chest = [e.pos[0], e.pos[1] + 1.4, e.pos[2]];
  if (!world.static.lineClear(chest, muzzle))
    return;
  const shotId = world.newShotId();
  e.lastShotId = shotId;
  for (let i = 0; i < Math.max(1, pellets); i++) {
    const d = [dir[0], dir[1], dir[2]];
    if (pellets > 1)
      world.perturbDirection(d, spread);
    world.spawnProjectile(muzzle, d, e.id, shotId);
  }
  world.events.push({ type: "shot", pos: muzzle, dir: [dir[0], dir[1], dir[2]], weapon: e.weapon?.kind ?? "pistol", byPlayer: false });
}
function meleeStrike(world: World, e: Enemy) {
  e.meleeCooldown = 0.9;
  const p = world.player;
  if (!p.alive)
    return;
  const dx = p.pos[0] - e.pos[0];
  const dz = p.pos[2] - e.pos[2];
  const d = Math.hypot(dx, dz);
  const facing = Math.abs(angleDiff(yawOf(dx, dz), e.yaw)) < 0.9;
  const vertical = Math.abs(p.pos[1] - e.pos[1]) < 1.2;
  if (d < MELEE_RANGE + 0.15 && facing && vertical) {
    world.killPlayer([dx / Math.max(d, 1e-3), 0, dz / Math.max(d, 1e-3)]);
  }
}

export { aimDirection,applyGravityAndMove,BODY_A,BODY_B,BODY_RADIUS,createEnemy,ENEMY_HEIGHT,ENEMY_PARAMS,ENEMY_RADIUS,enemyIsTwoHanded,enemyMuzzle,fireVolley,GRAVITY,handleShooting,HEAD_OFFSET,HEAD_RADIUS,MARKSMAN_COOLDOWN,MELEE_RANGE,MELEE_STRIKE_AT,MELEE_TIME,meleeStrike,MUZZLE_LOCAL,nextWaypoint,savePrev,scratchA,scratchB,scratchC,setState,SPAWN_TIME,TELEGRAPH,updateEnemy };
