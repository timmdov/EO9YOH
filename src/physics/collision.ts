import type { Box } from "../types";
var CELL = 2;
var EPS = 1e-4;
class StaticWorld {
  boxes;
  bounds;
  cells: Map<number,number[]> = new Map();
  stamps;
  stampId = 0;
  scratch: number[] = [];
  constructor(boxes: Box[]) {
    this.boxes = boxes;
    this.stamps = new Uint32Array(Math.max(1, boxes.length));
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    boxes.forEach((b: Box, i) => {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], b.min[k]);
        max[k] = Math.max(max[k], b.max[k]);
      }
      const x0 = Math.floor(b.min[0] / CELL), x1 = Math.floor(b.max[0] / CELL);
      const z0 = Math.floor(b.min[2] / CELL), z1 = Math.floor(b.max[2] / CELL);
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          const key = cellKey(x, z);
          let list = this.cells.get(key);
          if (!list)
            this.cells.set(key, list = []);
          list.push(i);
        }
      }
    });
    if (boxes.length === 0) {
      min.fill(-1);
      max.fill(1);
    }
    this.bounds = { min, max };
  }
  query(minX: number, minZ: number, maxX: number, maxZ: number, out: number[]) {
    out.length = 0;
    this.stampId = this.stampId + 1 >>> 0;
    if (this.stampId === 0) {
      this.stamps.fill(0);
      this.stampId = 1;
    }
    const x0 = Math.floor(minX / CELL), x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL), z1 = Math.floor(maxZ / CELL);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const list = this.cells.get(cellKey(x, z));
        if (!list)
          continue;
        for (const i of list) {
          if (this.stamps[i] === this.stampId)
            continue;
          this.stamps[i] = this.stampId;
          out.push(i);
        }
      }
    }
    return out;
  }
  raycast(origin: number[], dir: number[], maxDist: number) {
    const ex = origin[0] + dir[0] * maxDist;
    const ez = origin[2] + dir[2] * maxDist;
    const cand = this.query(Math.min(origin[0], ex), Math.min(origin[2], ez), Math.max(origin[0], ex), Math.max(origin[2], ez), this.scratch);
    let best = maxDist;
    let bestBox = -1;
    let bestAxis = 0;
    let bestSign = 0;
    for (const i of cand) {
      const b = this.boxes[i];
      const r = rayBox(origin, dir, b, best);
      if (r !== null && r.t < best) {
        best = r.t;
        bestBox = i;
        bestAxis = r.axis;
        bestSign = r.sign;
      }
    }
    if (bestBox < 0)
      return null;
    const normal = [0, 0, 0];
    normal[bestAxis] = bestSign;
    return {
      t: best,
      normal,
      point: [origin[0] + dir[0] * best, origin[1] + dir[1] * best, origin[2] + dir[2] * best],
      box: bestBox
    };
  }
  lineClear(a: number[], b: number[]) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const l = Math.hypot(dx, dy, dz);
    if (l < 1e-6)
      return true;
    return this.raycast(a, [dx / l, dy / l, dz / l], l) === null;
  }
  overlapsAabb(min: number[], max: number[]) {
    const cand = this.query(min[0], min[2], max[0], max[2], this.scratch);
    for (const i of cand) {
      const b = this.boxes[i];
      if (min[0] < b.max[0] - EPS && max[0] > b.min[0] + EPS && min[1] < b.max[1] - EPS && max[1] > b.min[1] + EPS && min[2] < b.max[2] - EPS && max[2] > b.min[2] + EPS) {
        return true;
      }
    }
    return false;
  }
  moveCharacter(pos: number[], delta: number[], r: number, h: number, stepHeight: number, canStep: boolean) {
    const res = { grounded: false, hitWall: false, hitCeiling: false };
    const maxD = Math.max(Math.abs(delta[0]), Math.abs(delta[1]), Math.abs(delta[2]));
    const n = Math.max(1, Math.ceil(maxD / (r * 0.8)));
    for (let s = 0; s < n; s++) {
      this.moveAxis(pos, 0, delta[0] / n, r, h, stepHeight, canStep, res);
      this.moveAxis(pos, 2, delta[2] / n, r, h, stepHeight, canStep, res);
      this.moveAxis(pos, 1, delta[1] / n, r, h, stepHeight, canStep, res);
    }
    return res;
  }
  moveAxis(pos: number[], axis: number, d: number, r: number, h: number, stepHeight: number, canStep: boolean, res: {grounded:boolean;hitWall:boolean;hitCeiling:boolean}) {
    if (d === 0)
      return;
    pos[axis] = pos[axis] + d;
    const cand = this.query(pos[0] - r - 0.1, pos[2] - r - 0.1, pos[0] + r + 0.1, pos[2] + r + 0.1, this.scratch);
    const list = cand.slice();
    for (const i of list) {
      const b = this.boxes[i];
      if (!(pos[0] - r < b.max[0] - EPS && pos[0] + r > b.min[0] + EPS && pos[1] < b.max[1] - EPS && pos[1] + h > b.min[1] + EPS && pos[2] - r < b.max[2] - EPS && pos[2] + r > b.min[2] + EPS)) {
        continue;
      }
      if (axis === 1) {
        if (d < 0) {
          pos[1] = b.max[1];
          res.grounded = true;
        } else {
          pos[1] = b.min[1] - h - EPS;
          res.hitCeiling = true;
        }
        continue;
      }
      const rise = b.max[1] - pos[1];
      if (canStep && rise > 0 && rise <= stepHeight) {
        const y = b.max[1] + 1e-3;
        if (!this.overlapsAabb([pos[0] - r, y, pos[2] - r], [pos[0] + r, y + h, pos[2] + r])) {
          pos[1] = y;
          continue;
        }
      }
      pos[axis] = d > 0 ? b.min[axis] - r - EPS : b.max[axis] + r + EPS;
      res.hitWall = true;
    }
  }
  resolveSphere(pos: number[], vel: number[], r: number, restitution: number, friction: number) {
    const res = { grounded: false, impact: 0, normal: [0, 1, 0] };
    const cand = this.query(pos[0] - r, pos[2] - r, pos[0] + r, pos[2] + r, this.scratch);
    for (const i of cand) {
      const b = this.boxes[i];
      const qx = clampN(pos[0], b.min[0], b.max[0]);
      const qy = clampN(pos[1], b.min[1], b.max[1]);
      const qz = clampN(pos[2], b.min[2], b.max[2]);
      let nx = pos[0] - qx, ny = pos[1] - qy, nz = pos[2] - qz;
      const d2 = nx * nx + ny * ny + nz * nz;
      if (d2 > r * r)
        continue;
      let pen;
      if (d2 > 1e-12) {
        const d = Math.sqrt(d2);
        nx /= d;
        ny /= d;
        nz /= d;
        pen = r - d;
      } else {
        const faces = [
          [pos[0] - b.min[0], -1, 0, 0],
          [b.max[0] - pos[0], 1, 0, 0],
          [pos[1] - b.min[1], 0, -1, 0],
          [b.max[1] - pos[1], 0, 1, 0],
          [pos[2] - b.min[2], 0, 0, -1],
          [b.max[2] - pos[2], 0, 0, 1]
        ];
        let best = faces[0];
        for (const f of faces)
          if (f[0] < best[0])
            best = f;
        nx = best[1];
        ny = best[2];
        nz = best[3];
        pen = best[0] + r;
      }
      pos[0] += nx * pen;
      pos[1] += ny * pen;
      pos[2] += nz * pen;
      const vn = vel[0] * nx + vel[1] * ny + vel[2] * nz;
      if (vn < 0) {
        res.impact = Math.max(res.impact, -vn);
        const tx = vel[0] - nx * vn, ty = vel[1] - ny * vn, tz = vel[2] - nz * vn;
        const f = 1 - friction;
        vel[0] = tx * f - nx * vn * restitution;
        vel[1] = ty * f - ny * vn * restitution;
        vel[2] = tz * f - nz * vn * restitution;
      }
      if (ny > 0.6)
        res.grounded = true;
      res.normal = [nx, ny, nz];
    }
    return res;
  }
};
function cellKey(x: number, z: number) {
  return x + 4096 << 13 | z + 4096;
}
function clampN(x: number, lo: number, hi: number) {
  return x < lo ? lo : x > hi ? hi : x;
}
function rayBox(o: number[], d: number[], b: Box, maxT: number) {
  let tmin = 0;
  let tmax = maxT;
  let axis = -1;
  let sign = 0;
  for (let k = 0; k < 3; k++) {
    const ok = o[k];
    const dk = d[k];
    const lo = b.min[k];
    const hi = b.max[k];
    if (Math.abs(dk) < 1e-12) {
      if (ok < lo || ok > hi)
        return null;
      continue;
    }
    const inv = 1 / dk;
    let t0 = (lo - ok) * inv;
    let t1 = (hi - ok) * inv;
    let s = -1;
    if (t0 > t1) {
      const tmp2 = t0;
      t0 = t1;
      t1 = tmp2;
      s = 1;
    }
    if (t0 > tmin) {
      tmin = t0;
      axis = k;
      sign = s;
    }
    if (t1 < tmax)
      tmax = t1;
    if (tmin > tmax)
      return null;
  }
  if (axis < 0) {
    return { t: 0, axis: 1, sign: 1 };
  }
  return { t: tmin, axis, sign };
}
function segmentSphere(p0: number[], p1: number[], c: number[], r: number) {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
  const mx = p0[0] - c[0], my = p0[1] - c[1], mz = p0[2] - c[2];
  const a = dx * dx + dy * dy + dz * dz;
  const b = mx * dx + my * dy + mz * dz;
  const cc = mx * mx + my * my + mz * mz - r * r;
  if (cc <= 0)
    return 0;
  if (a < 1e-12)
    return -1;
  const disc = b * b - a * cc;
  if (disc < 0)
    return -1;
  const t = (-b - Math.sqrt(disc)) / a;
  return t >= 0 && t <= 1 ? t : -1;
}
function segmentCapsule(p0: number[], p1: number[], a: number[], b: number[], r: number) {
  const d1x = p1[0] - p0[0], d1y = p1[1] - p0[1], d1z = p1[2] - p0[2];
  const d2x = b[0] - a[0], d2y = b[1] - a[1], d2z = b[2] - a[2];
  const rx = p0[0] - a[0], ry = p0[1] - a[1], rz = p0[2] - a[2];
  const aa = d1x * d1x + d1y * d1y + d1z * d1z;
  const ee = d2x * d2x + d2y * d2y + d2z * d2z;
  const ff = d2x * rx + d2y * ry + d2z * rz;
  let s;
  let t;
  if (aa < 1e-12) {
    s = 0;
    t = clampN(ff / ee, 0, 1);
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    const bb = d1x * d2x + d1y * d2y + d1z * d2z;
    const denom = aa * ee - bb * bb;
    s = denom > 1e-12 ? clampN((bb * ff - c * ee) / denom, 0, 1) : 0;
    t = (bb * s + ff) / ee;
    if (t < 0) {
      t = 0;
      s = clampN(-c / aa, 0, 1);
    } else if (t > 1) {
      t = 1;
      s = clampN((bb - c) / aa, 0, 1);
    }
  }
  const cx = p0[0] + d1x * s - (a[0] + d2x * t);
  const cy = p0[1] + d1y * s - (a[1] + d2y * t);
  const cz = p0[2] + d1z * s - (a[2] + d2z * t);
  const dsq = cx * cx + cy * cy + cz * cz;
  if (dsq > r * r)
    return -1;
  const segLen = Math.sqrt(aa);
  if (segLen < 1e-9)
    return 0;
  const back = Math.sqrt(Math.max(0, r * r - dsq)) / segLen;
  return clampN(s - back, 0, 1);
}

export { CELL,cellKey,clampN,EPS,rayBox,segmentCapsule,segmentSphere,StaticWorld };
