import type { Input } from "../core/input";
import { clamp,v3 } from "../core/math";
import type { World } from "./world";
import { PLAYER_HEIGHT,PLAYER_RADIUS } from "./world";
var WALK_SPEED = 4;
var ACCEL = 30;
var AIR_ACCEL = 10;
var GRAVITY3 = 16;
var JUMP_VELOCITY = Math.sqrt(2 * GRAVITY3 * 1);
var MAX_PITCH2 = Math.PI / 2 - 0.02;
var STEP_HEIGHT = 0.42;
class PlayerController {
  pos = v3();
  vel = v3();
  yaw = 0;
  pitch = 0;
  grounded = true;
  lookSpeed = 0;
  stride = 0;
  mouseDx = 0;
  mouseDy = 0;
  delta = v3();
  reset(pos: number[], yaw: number) {
    this.pos[0] = pos[0];
    this.pos[1] = pos[1];
    this.pos[2] = pos[2];
    this.vel[0] = this.vel[1] = this.vel[2] = 0;
    this.yaw = yaw;
    this.pitch = 0;
    this.grounded = true;
    this.stride = 0;
  }
  look(input: Input, dt: number, s: {sensitivity:number;invertY:boolean}) {
    this.mouseDx = input.mouseDx;
    this.mouseDy = input.mouseDy;
    this.yaw += input.mouseDx * s.sensitivity;
    this.pitch -= input.mouseDy * s.sensitivity * (s.invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, -MAX_PITCH2, MAX_PITCH2);
    this.yaw %= Math.PI * 2;
    this.lookSpeed = dt > 0 ? Math.hypot(input.mouseDx, input.mouseDy) / dt : 0;
  }
  update(input: Input, dt: number, world: World, s: {sensitivity:number;invertY:boolean}, canMove: boolean) {
    this.look(input, dt, s);
    const axes = canMove ? input.moveAxes() : { x: 0, y: 0 };
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const wishX = (fx * axes.y + rx * axes.x) * WALK_SPEED;
    const wishZ = (fz * axes.y + rz * axes.x) * WALK_SPEED;
    const a = (this.grounded ? ACCEL : AIR_ACCEL) * dt;
    this.vel[0] += clamp(wishX - this.vel[0], -a, a);
    this.vel[2] += clamp(wishZ - this.vel[2], -a, a);
    if (canMove && this.grounded && input.wasPressed("jump")) {
      this.vel[1] = JUMP_VELOCITY;
      this.grounded = false;
    }
    this.vel[1] -= GRAVITY3 * dt;
    if (this.vel[1] < -40)
      this.vel[1] = -40;
    this.delta[0] = this.vel[0] * dt;
    this.delta[1] = this.vel[1] * dt;
    this.delta[2] = this.vel[2] * dt;
    const res = world.static.moveCharacter(this.pos, this.delta, PLAYER_RADIUS, PLAYER_HEIGHT, STEP_HEIGHT, this.grounded);
    this.grounded = res.grounded;
    if (res.grounded && this.vel[1] < 0)
      this.vel[1] = 0;
    if (res.hitCeiling && this.vel[1] > 0)
      this.vel[1] = 0;
    for (const e of world.enemies) {
      if (!e.alive || e.spawnT < 1)
        continue;
      if (Math.abs(e.pos[1] - this.pos[1]) > 1.6)
        continue;
      const dx = this.pos[0] - e.pos[0];
      const dz = this.pos[2] - e.pos[2];
      const d = Math.hypot(dx, dz);
      const minD = PLAYER_RADIUS + 0.3;
      if (d < minD && d > 1e-4) {
        const push = [dx / d * (minD - d), 0, dz / d * (minD - d)];
        world.static.moveCharacter(this.pos, push, PLAYER_RADIUS, PLAYER_HEIGHT, 0, false);
      }
    }
    this.stride += Math.hypot(this.vel[0], this.vel[2]) * dt;
  }
  get planarSpeed() {
    return Math.hypot(this.vel[0], this.vel[2]);
  }
  toFrame(fire: boolean, throwItem: boolean, interact: boolean) {
    return {
      pos: [this.pos[0], this.pos[1], this.pos[2]],
      vel: [this.vel[0], this.vel[1], this.vel[2]],
      yaw: this.yaw,
      pitch: this.pitch,
      grounded: this.grounded,
      fire,
      throwItem,
      interact,
      steps: 0
    };
  }
};

export { ACCEL,AIR_ACCEL,GRAVITY3,JUMP_VELOCITY,MAX_PITCH2,PlayerController,STEP_HEIGHT,WALK_SPEED };
