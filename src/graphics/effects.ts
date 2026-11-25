import { mat4 } from "wgpu-matrix";
import { v3 } from "../core/math";
import { visualRng } from "../core/random";
import type { StaticWorld } from "../physics/collision";
import type { MeshLibrary,Particle,Pose,Shard } from "../types";
import { PART_CENTER,PART_EXTENTS,PART_IDS } from "./library";
import type { Renderer } from "./renderer";
var MAX_PARTICLES = 3e3;
var MAX_SHARDS = 900;
var SHARD_LIFE = 7;
class FxSystem {
  particles: Particle[] = [];
  shards: Shard[] = [];
  model = mat4.create();
  tmpA = v3();
  tmpB = v3();
  clear() {
    this.particles.length = 0;
    this.shards.length = 0;
  }
  get particleCount() {
    return this.particles.length;
  }
  get shardCount() {
    return this.shards.length;
  }
  emit(p: Particle) {
    if (this.particles.length >= MAX_PARTICLES)
      this.particles.shift();
    this.particles.push({ ...p, alive: true });
  }
  sparks(pos: number[], normal: number[], count: number, color: number[] = [6, 3.2, 1.2]) {
    for (let i = 0; i < count; i++) {
      const s = visualRng.range(2, 7);
      this.emit({
        pos: [pos[0], pos[1], pos[2]],
        vel: [normal[0] * s + visualRng.sym(3), normal[1] * s + visualRng.sym(3) + 1, normal[2] * s + visualRng.sym(3)],
        life: 0,
        maxLife: visualRng.range(0.15, 0.4),
        size: visualRng.range(6e-3, 0.014),
        color,
        drag: 2,
        gravity: 9,
        streak: 0.035
      });
    }
  }
  dust(pos: number[], normal: number[], count: number) {
    for (let i = 0; i < count; i++) {
      const s = visualRng.range(0.3, 1.2);
      this.emit({
        pos: [pos[0], pos[1], pos[2]],
        vel: [normal[0] * s + visualRng.sym(0.5), normal[1] * s + visualRng.sym(0.5), normal[2] * s + visualRng.sym(0.5)],
        life: 0,
        maxLife: visualRng.range(0.5, 1.2),
        size: visualRng.range(0.04, 0.09),
        color: [0.25, 0.23, 0.21],
        drag: 3,
        gravity: -0.2,
        streak: 0
      });
    }
  }
  glints(pos: number[], count: number, tint: number[], speed: number = 3) {
    for (let i = 0; i < count; i++) {
      const s = visualRng.range(0.5, speed);
      const dir = randomUnit(this.tmpA);
      this.emit({
        pos: [pos[0], pos[1], pos[2]],
        vel: [dir[0] * s, dir[1] * s + 0.8, dir[2] * s],
        life: 0,
        maxLife: visualRng.range(0.3, 0.9),
        size: visualRng.range(8e-3, 0.02),
        color: [tint[0] * 5, tint[1] * 5, tint[2] * 5],
        drag: 1.5,
        gravity: 5,
        streak: 0.02
      });
    }
  }
  muzzleFlash(pos: number[], dir: number[], big: boolean) {
    const n = big ? 10 : 6;
    for (let i = 0; i < n; i++) {
      const s = visualRng.range(1, big ? 6 : 4);
      this.emit({
        pos: [pos[0], pos[1], pos[2]],
        vel: [dir[0] * s + visualRng.sym(1), dir[1] * s + visualRng.sym(1), dir[2] * s + visualRng.sym(1)],
        life: 0,
        maxLife: visualRng.range(0.04, 0.09),
        size: visualRng.range(0.02, big ? 0.06 : 0.04),
        color: [9, 5.5, 2.2],
        drag: 8,
        gravity: 0,
        streak: 0.02
      });
    }
    this.emit({ pos: [pos[0], pos[1], pos[2]], vel: [0, 0, 0], life: 0, maxLife: 0.05, size: big ? 0.12 : 0.08, color: [10, 7, 3], drag: 0, gravity: 0, streak: 0 });
  }
  spawnShimmer(pos: number[], tint: number[]) {
    for (let i = 0; i < 24; i++) {
      const a = visualRng.next() * Math.PI * 2;
      const r = visualRng.range(0.2, 0.6);
      this.emit({
        pos: [pos[0] + Math.cos(a) * r, pos[1] + visualRng.range(0, 1.8), pos[2] + Math.sin(a) * r],
        vel: [0, visualRng.range(0.3, 1.2), 0],
        life: 0,
        maxLife: visualRng.range(0.4, 0.9),
        size: visualRng.range(0.01, 0.025),
        color: [tint[0] * 4, tint[1] * 4, tint[2] * 4],
        drag: 0.5,
        gravity: -0.5,
        streak: 0.05
      });
    }
  }
  shatter(pose: Pose, dir: number[], point: number[], tint: number[], meshCount: number) {
    const local = this.tmpB;
    for (const id of PART_IDS) {
      const m2 = pose.parts[id];
      const ext = PART_EXTENTS[id];
      const c = PART_CENTER[id];
      const n = id === "torso" ? 9 : id === "head" || id === "pelvis" ? 5 : 3;
      for (let i = 0; i < n; i++) {
        local[0] = c[0] + visualRng.sym(ext[0]);
        local[1] = c[1] + visualRng.sym(ext[1]);
        local[2] = c[2] + visualRng.sym(ext[2]);
        const wx = m2[0] * local[0] + m2[4] * local[1] + m2[8] * local[2] + m2[12];
        const wy = m2[1] * local[0] + m2[5] * local[1] + m2[9] * local[2] + m2[13];
        const wz = m2[2] * local[0] + m2[6] * local[1] + m2[10] * local[2] + m2[14];
        const near = Math.max(0, 1 - Math.hypot(wx - point[0], wy - point[1], wz - point[2]) / 1.2);
        const s = visualRng.range(1.5, 3.5) + near * 4;
        const out = randomUnit(this.tmpA);
        if (this.shards.length >= MAX_SHARDS)
          this.shards.shift();
        this.shards.push({
          pos: [wx, wy, wz],
          vel: [dir[0] * s + out[0] * 1.8, dir[1] * s + out[1] * 1.8 + 1.5, dir[2] * s + out[2] * 1.8],
          rot: [visualRng.next() * 6.28, visualRng.next() * 6.28, visualRng.next() * 6.28],
          angVel: [visualRng.sym(14), visualRng.sym(14), visualRng.sym(14)],
          scale: visualRng.range(0.7, 1.5) * (id === "torso" ? 1.3 : 1),
          life: 0,
          mesh: Math.floor(visualRng.next() * meshCount),
          tint,
          sleeping: false
        });
      }
    }
    this.glints(point, 30, tint, 5);
  }
  smallShatter(pos: number[], tint: number[], meshCount: number) {
    for (let i = 0; i < 8; i++) {
      const out = randomUnit(this.tmpA);
      if (this.shards.length >= MAX_SHARDS)
        this.shards.shift();
      this.shards.push({
        pos: [pos[0], pos[1], pos[2]],
        vel: [out[0] * 2.5, Math.abs(out[1]) * 2 + 1, out[2] * 2.5],
        rot: [visualRng.next() * 6.28, visualRng.next() * 6.28, visualRng.next() * 6.28],
        angVel: [visualRng.sym(14), visualRng.sym(14), visualRng.sym(14)],
        scale: visualRng.range(0.3, 0.6),
        life: 0,
        mesh: Math.floor(visualRng.next() * meshCount),
        tint,
        sleeping: false
      });
    }
    this.glints(pos, 12, [1, 1, 1], 3);
  }
  update(dt: number, world: StaticWorld) {
    if (dt <= 0)
      return;
    for (const p of this.particles) {
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.alive = false;
        continue;
      }
      const d = Math.max(0, 1 - p.drag * dt);
      p.vel[0] *= d;
      p.vel[1] = p.vel[1] * d - p.gravity * dt;
      p.vel[2] *= d;
      p.pos[0] += p.vel[0] * dt;
      p.pos[1] += p.vel[1] * dt;
      p.pos[2] += p.vel[2] * dt;
    }
    compact(this.particles);
    const sub = dt > 1 / 60 ? Math.ceil(dt / (1 / 60)) : 1;
    const h = dt / sub;
    for (const s of this.shards) {
      s.life += dt;
      if (s.sleeping)
        continue;
      for (let k = 0; k < sub; k++) {
        s.vel[1] -= 12 * h;
        s.pos[0] += s.vel[0] * h;
        s.pos[1] += s.vel[1] * h;
        s.pos[2] += s.vel[2] * h;
        if (world) {
          const res = world.resolveSphere(s.pos, s.vel, 0.035 * s.scale, 0.35, 0.25);
          if (res.impact > 0.2) {
            s.angVel[0] *= 0.6;
            s.angVel[1] *= 0.6;
            s.angVel[2] *= 0.6;
          }
          if (res.grounded && Math.hypot(s.vel[0], s.vel[1], s.vel[2]) < 0.15)
            s.sleeping = true;
        }
      }
      s.rot[0] += s.angVel[0] * dt;
      s.rot[1] += s.angVel[1] * dt;
      s.rot[2] += s.angVel[2] * dt;
      if (s.pos[1] < -20)
        s.life = SHARD_LIFE;
    }
    let w = 0;
    for (let i = 0; i < this.shards.length; i++) {
      const s = this.shards[i];
      if (s.life < SHARD_LIFE)
        this.shards[w++] = s;
    }
    this.shards.length = w;
  }
  draw(renderer: Renderer, meshes: MeshLibrary) {
    for (const p of this.particles) {
      const fade = 1 - p.life / p.maxLife;
      const c = [p.color[0] * fade, p.color[1] * fade, p.color[2] * fade];
      if (p.streak > 0) {
        const tail = [p.pos[0] - p.vel[0] * p.streak, p.pos[1] - p.vel[1] * p.streak, p.pos[2] - p.vel[2] * p.streak];
        renderer.drawSegment(tail, p.pos, p.size, c, 0.2, 1.5);
      } else {
        renderer.drawSegment(p.pos, p.pos, p.size, c, 1, 2.5);
      }
    }
    const m2 = this.model;
    for (const s of this.shards) {
      const fadeStart = SHARD_LIFE - 1.5;
      const fade = s.life > fadeStart ? Math.max(0, 1 - (s.life - fadeStart) / 1.5) : 1;
      mat4.translation(s.pos, m2);
      mat4.rotateY(m2, s.rot[1], m2);
      mat4.rotateX(m2, s.rot[0], m2);
      mat4.rotateZ(m2, s.rot[2], m2);
      mat4.uniformScale(m2, s.scale * (0.4 + 0.6 * fade), m2);
      const mesh = meshes.shards[s.mesh] ?? meshes.shards[0];
      renderer.drawMesh(mesh, m2, s.tint, 0.6, "glass", 0, fade);
    }
  }
};
function randomUnit(out: number[]) {
  for (; ; ) {
    const x = visualRng.sym(1), y = visualRng.sym(1), z = visualRng.sym(1);
    const l = x * x + y * y + z * z;
    if (l > 1e-4 && l <= 1) {
      const il = 1 / Math.sqrt(l);
      out[0] = x * il;
      out[1] = y * il;
      out[2] = z * il;
      return out;
    }
  }
}
function compact(list: {alive?:boolean}[]) {
  let w = 0;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (p.alive)
      list[w++] = p;
  }
  list.length = w;
}

export { compact,FxSystem,MAX_PARTICLES,MAX_SHARDS,randomUnit,SHARD_LIFE };
