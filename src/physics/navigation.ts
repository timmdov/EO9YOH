import type { StaticWorld } from "./collision";
var CELL2 = 0.5;
var AGENT_RADIUS = 0.32;
var STEP = 0.4;
var HEADROOM = 1.75;
var MAX_FLOOR = 3.3;
class NavGrid {
  world;
  originX;
  originZ;
  w;
  h;
  floor;
  gScore;
  fScore;
  cameFrom;
  closed;
  openStamp;
  searchId = 0;
  heap: number[] = [];
  constructor(world: StaticWorld) {
    this.world = world;
    const b = world.bounds;
    this.originX = Math.floor(b.min[0]);
    this.originZ = Math.floor(b.min[2]);
    this.w = Math.max(1, Math.ceil((b.max[0] - this.originX) / CELL2));
    this.h = Math.max(1, Math.ceil((b.max[2] - this.originZ) / CELL2));
    const n = this.w * this.h;
    this.floor = new Float32Array(n).fill(NaN);
    this.gScore = new Float32Array(n);
    this.fScore = new Float32Array(n);
    this.cameFrom = new Int32Array(n);
    this.closed = new Uint32Array(n);
    this.openStamp = new Uint32Array(n);
    this.bake();
  }
  bake() {
    const boxes = this.world.boxes;
    const cand: number[] = [];
    for (let cz = 0; cz < this.h; cz++) {
      for (let cx = 0; cx < this.w; cx++) {
        const x = this.originX + (cx + 0.5) * CELL2;
        const z = this.originZ + (cz + 0.5) * CELL2;
        this.world.query(x - AGENT_RADIUS, z - AGENT_RADIUS, x + AGENT_RADIUS, z + AGENT_RADIUS, cand);
        let floorY = -Infinity;
        for (const i of cand) {
          const bx = boxes[i];
          if (x >= bx.min[0] && x <= bx.max[0] && z >= bx.min[2] && z <= bx.max[2] && bx.max[1] <= MAX_FLOOR && bx.max[1] > floorY) {
            floorY = bx.max[1];
          }
        }
        if (floorY === -Infinity)
          continue;
        let blocked = false;
        for (const i of cand) {
          const bx = boxes[i];
          if (bx.min[0] < x + AGENT_RADIUS && bx.max[0] > x - AGENT_RADIUS && bx.min[2] < z + AGENT_RADIUS && bx.max[2] > z - AGENT_RADIUS && bx.max[1] > floorY + STEP && bx.min[1] < floorY + HEADROOM) {
            blocked = true;
            break;
          }
        }
        if (!blocked)
          this.floor[cz * this.w + cx] = floorY;
      }
    }
  }
  cellOf(x: number, z: number) {
    const cx = Math.floor((x - this.originX) / CELL2);
    const cz = Math.floor((z - this.originZ) / CELL2);
    if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h)
      return -1;
    return cz * this.w + cx;
  }
  walkable(cell: number) {
    return cell >= 0 && !Number.isNaN(this.floor[cell]);
  }
  center(cell: number, out: number[]) {
    const cx = cell % this.w;
    const cz = (cell - cx) / this.w;
    out[0] = this.originX + (cx + 0.5) * CELL2;
    out[1] = this.floor[cell];
    out[2] = this.originZ + (cz + 0.5) * CELL2;
    return out;
  }
  nearestWalkable(x: number, z: number, nearY: number) {
    const c0 = this.cellOf(x, z);
    if (this.walkable(c0) && Math.abs(this.floor[c0] - nearY) < 1.2)
      return c0;
    const cx0 = Math.floor((x - this.originX) / CELL2);
    const cz0 = Math.floor((z - this.originZ) / CELL2);
    for (let ring = 1; ring <= 6; ring++) {
      let best = -1;
      let bestD = Infinity;
      for (let dz = -ring; dz <= ring; dz++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring)
            continue;
          const cx = cx0 + dx, cz = cz0 + dz;
          if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h)
            continue;
          const c = cz * this.w + cx;
          if (!this.walkable(c))
            continue;
          const d = dx * dx + dz * dz + Math.abs(this.floor[c] - nearY) * 4;
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
      }
      if (best >= 0)
        return best;
    }
    return -1;
  }
  findPath(from: number[], to: number[], maxExpansions: number = 4e3) {
    const start = this.nearestWalkable(from[0], from[2], from[1]);
    const goal = this.nearestWalkable(to[0], to[2], to[1]);
    if (start < 0 || goal < 0)
      return null;
    if (start === goal)
      return [[to[0], this.floor[goal], to[2]]];
    this.searchId = this.searchId + 1 >>> 0;
    const sid = this.searchId;
    const w = this.w;
    const gx = goal % w, gz = (goal - gx) / w;
    const heur = (c: number) => {
      const cx = c % w, cz = (c - cx) / w;
      const dx = Math.abs(cx - gx), dz = Math.abs(cz - gz);
      return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz);
    };
    const heap = this.heap;
    heap.length = 0;
    this.gScore[start] = 0;
    this.fScore[start] = heur(start);
    this.cameFrom[start] = -1;
    this.openStamp[start] = sid;
    this.heapPush(start);
    let expansions = 0;
    let found = false;
    while (heap.length > 0) {
      const cur = this.heapPop();
      if (cur === goal) {
        found = true;
        break;
      }
      if (this.closed[cur] === sid)
        continue;
      this.closed[cur] = sid;
      if (++expansions > maxExpansions)
        break;
      const cx = cur % w, cz = (cur - cx) / w;
      const fy = this.floor[cur];
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0)
            continue;
          const nx = cx + dx, nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= w || nz >= this.h)
            continue;
          const nb = nz * w + nx;
          if (!this.walkable(nb) || this.closed[nb] === sid)
            continue;
          if (Math.abs(this.floor[nb] - fy) > STEP)
            continue;
          if (dx !== 0 && dz !== 0) {
            if (!this.walkable(cz * w + nx) || !this.walkable(nz * w + cx))
              continue;
          }
          const cost = this.gScore[cur] + (dx !== 0 && dz !== 0 ? 1.4142 : 1);
          if (this.openStamp[nb] === sid && cost >= this.gScore[nb])
            continue;
          this.openStamp[nb] = sid;
          this.gScore[nb] = cost;
          this.fScore[nb] = cost + heur(nb);
          this.cameFrom[nb] = cur;
          this.heapPush(nb);
        }
      }
    }
    if (!found)
      return null;
    const cells = [];
    for (let c = goal; c !== -1; c = this.cameFrom[c])
      cells.push(c);
    cells.reverse();
    return this.smooth(cells, to);
  }
  smooth(cells: number[], to: number[]) {
    const out = [];
    let anchor = 0;
    let i = 1;
    while (i < cells.length) {
      if (i + 1 < cells.length && this.gridLineClear(cells[anchor], cells[i + 1])) {
        i++;
        continue;
      }
      out.push(this.center(cells[i], [0, 0, 0]));
      anchor = i;
      i++;
    }
    const last = out[out.length - 1];
    const goalCell = cells[cells.length - 1];
    if (last) {
      last[0] = to[0];
      last[2] = to[2];
      last[1] = this.floor[goalCell];
    } else {
      out.push([to[0], this.floor[goalCell], to[2]]);
    }
    return out;
  }
  gridLineClear(a: number, b: number) {
    const pa = this.center(a, [0, 0, 0]);
    const pb = this.center(b, [0, 0, 0]);
    const d = Math.hypot(pb[0] - pa[0], pb[2] - pa[2]);
    const steps = Math.ceil(d / (CELL2 * 0.5));
    let prevY = pa[1];
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const x = pa[0] + (pb[0] - pa[0]) * t;
      const z = pa[2] + (pb[2] - pa[2]) * t;
      for (const [ox, oz] of [[0, 0], [AGENT_RADIUS * 0.7, 0], [-AGENT_RADIUS * 0.7, 0], [0, AGENT_RADIUS * 0.7], [0, -AGENT_RADIUS * 0.7]]) {
        const c = this.cellOf(x + ox, z + oz);
        if (!this.walkable(c))
          return false;
        if (ox === 0 && oz === 0) {
          const y = this.floor[c];
          if (Math.abs(y - prevY) > STEP)
            return false;
          prevY = y;
        }
      }
    }
    return true;
  }
  heapPush(c: number) {
    const heap = this.heap;
    const f = this.fScore;
    heap.push(c);
    let i = heap.length - 1;
    while (i > 0) {
      const p = i - 1 >> 1;
      if (f[heap[p]] <= f[heap[i]])
        break;
      const tmp2 = heap[p];
      heap[p] = heap[i];
      heap[i] = tmp2;
      i = p;
    }
  }
  heapPop() {
    const heap = this.heap;
    const f = this.fScore;
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (; ; ) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m2 = i;
        if (l < heap.length && f[heap[l]] < f[heap[m2]])
          m2 = l;
        if (r < heap.length && f[heap[r]] < f[heap[m2]])
          m2 = r;
        if (m2 === i)
          break;
        const tmp2 = heap[m2];
        heap[m2] = heap[i];
        heap[i] = tmp2;
        i = m2;
      }
    }
    return top;
  }
};

export { AGENT_RADIUS,CELL2,HEADROOM,MAX_FLOOR,NavGrid,STEP };
