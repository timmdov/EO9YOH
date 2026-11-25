import type { Box,Door,Level,RoomOptions } from "../types";
class LevelBuilder {
  boxes: Box[] = [];
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: string = "wall", collide: boolean = true) {
    const min = [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)];
    const max = [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)];
    this.boxes.push({ min, max, mat, collide });
    return this;
  }
  floor(x0: number, z0: number, x1: number, z1: number, y: number = 0, mat: string = "floor") {
    return this.box(x0, y - 0.4, z0, x1, y, z1, mat);
  }
  ceiling(x0: number, z0: number, x1: number, z1: number, y: number, mat: string = "dark") {
    return this.box(x0, y, z0, x1, y + 0.3, z1, mat);
  }
  wallX(x0: number, x1: number, z: number, h: number, t: number = 0.3, mat: string = "wall", y0: number = 0) {
    return this.box(x0, y0, z - t / 2, x1, y0 + h, z + t / 2, mat);
  }
  wallZ(z0: number, z1: number, x: number, h: number, t: number = 0.3, mat: string = "wall", y0: number = 0) {
    return this.box(x - t / 2, y0, z0, x + t / 2, y0 + h, z1, mat);
  }
  wallWithDoorsX(x0: number, x1: number, z: number, h: number, doors: Door[], t: number = 0.3, mat: string = "wall", y0: number = 0) {
    this.segmented(x0, x1, doors, h, (a, b: number) => this.wallX(a, b, z, h, t, mat, y0), (a, b: number, dh) => this.box(a, y0 + dh, z - t / 2, b, y0 + h, z + t / 2, mat));
    return this;
  }
  wallWithDoorsZ(z0: number, z1: number, x: number, h: number, doors: Door[], t: number = 0.3, mat: string = "wall", y0: number = 0) {
    this.segmented(z0, z1, doors, h, (a, b: number) => this.wallZ(a, b, x, h, t, mat, y0), (a, b: number, dh) => this.box(x - t / 2, y0 + dh, a, x + t / 2, y0 + h, b, mat));
    return this;
  }
  segmented(a0: number, a1: number, doors: Door[], h: number, solid: (a:number,b:number)=>void, lintel: (a:number,b:number,h:number)=>void) {
    const gaps = doors.map((d) => [d.at - d.width / 2, d.at + d.width / 2, d.height ?? h]).sort((p, q) => p[0] - q[0]);
    let cur = a0;
    for (const [g0, g1, gh] of gaps) {
      if (g0 > cur)
        solid(cur, g0);
      if (gh < h)
        lintel(g0, g1, gh);
      cur = Math.max(cur, g1);
    }
    if (cur < a1)
      solid(cur, a1);
  }
  room(x0: number, z0: number, x1: number, z1: number, h: number, opts: RoomOptions = {}) {
    const t = opts.t ?? 0.4;
    const mat = opts.mat ?? "wall";
    const doors = opts.doors ?? [];
    const on = (s: string) => doors.filter((d) => d.side === s);
    if (opts.floor !== false)
      this.floor(x0 - t, z0 - t, x1 + t, z1 + t, 0, opts.floorMat ?? "floor");
    if (opts.ceiling)
      this.ceiling(x0 - t, z0 - t, x1 + t, z1 + t, h);
    this.wallWithDoorsX(x0 - t, x1 + t, z0 - t / 2, h, on("n"), t, mat);
    this.wallWithDoorsX(x0 - t, x1 + t, z1 + t / 2, h, on("s"), t, mat);
    this.wallWithDoorsZ(z0, z1, x0 - t / 2, h, on("w"), t, mat);
    this.wallWithDoorsZ(z0, z1, x1 + t / 2, h, on("e"), t, mat);
    return this;
  }
  pillar(x: number, z: number, size: number, h: number, mat: string = "dark") {
    return this.box(x - size / 2, 0, z - size / 2, x + size / 2, h, z + size / 2, mat);
  }
  crate(x: number, z: number, w: number, h: number, d: number, y: number = 0, mat: string = "light") {
    return this.box(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2, mat);
  }
  strip(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: string = "accent") {
    return this.box(x0, y0, z0, x1, y1, z1, mat, false);
  }
  stairsZ(x0: number, x1: number, zStart: number, steps: number, rise: number, run: number, dir: number = 1, baseY: number = 0, mat: string = "trim") {
    for (let i = 0; i < steps; i++) {
      const za = zStart + dir * i * run;
      const zb = za + dir * run;
      this.box(x0, baseY - 0.4, za, x1, baseY + (i + 1) * rise, zb, mat);
    }
    return this;
  }
  stairsX(z0: number, z1: number, xStart: number, steps: number, rise: number, run: number, dir: number = 1, baseY: number = 0, mat: string = "trim") {
    for (let i = 0; i < steps; i++) {
      const xa = xStart + dir * i * run;
      const xb = xa + dir * run;
      this.box(xa, baseY - 0.4, z0, xb, baseY + (i + 1) * rise, z1, mat);
    }
    return this;
  }
  platform(x0: number, z0: number, x1: number, z1: number, y: number, mat: string = "floor") {
    return this.box(x0, y - 0.4, z0, x1, y, z1, mat);
  }
  rail(x0: number, z0: number, x1: number, z1: number, y: number = 0, h: number = 1, mat: string = "metal") {
    return this.box(x0, y, z0, x1, y + h, z1, mat);
  }
  lights(x0: number, z0: number, x1: number, z1: number, y: number, spacing: number, mat: string = "accent") {
    for (let x = x0; x <= x1 + 1e-6; x += spacing) {
      for (let z = z0; z <= z1 + 1e-6; z += spacing) {
        this.strip(x - 0.6, y - 0.06, z - 0.08, x + 0.6, y, z + 0.08, mat);
      }
    }
    return this;
  }
};

function level(meta: Omit<Level,"boxes">, build: (b:LevelBuilder)=>void) {
  const b = new LevelBuilder();
  build(b);
  return { ...meta, boxes: b.boxes };
}
var platform = level({
  id: "1-1",
  name: "PLATFORM",
  act: 1,
  theme: "transit",
  words: ["TIME", "MOVES", "WHEN", "YOU", "MOVE."],
  seed: 101,
  player: { pos: [0, 0, 4], yaw: 0 },
  props: [
    { kind: "bottle", pos: [1.5, 0.6, 2] },
    { kind: "brick", pos: [-1.5, 0.1, 1] },
    { kind: "mug", pos: [-4.5, 0.6, -4.6] }
  ],
  waves: [
    { when: { type: "start" }, spawns: [{ kind: "walker", pos: [0, -9], weapon: null }] },
    { when: { type: "remaining", count: 0 }, delay: 0.4, spawns: [{ kind: "walker", pos: [-4, -10] }] },
    { when: { type: "remaining", count: 0 }, delay: 0.4, spawns: [{ kind: "walker", pos: [4, -10] }, { kind: "walker", pos: [-4, -10] }] }
  ]
}, (b: LevelBuilder) => {
  b.room(-6, -12, 6, 6, 5, { ceiling: true });
  for (const z of [-3, -8])
    for (const x of [-3, 3])
      b.pillar(x, z, 0.7, 5);
  b.crate(1.5, 2, 1.6, 0.45, 0.5, 0, "trim");
  b.crate(-4.5, -5, 0.5, 0.45, 2.2, 0, "trim");
  b.crate(4.6, -1, 0.8, 1.2, 0.8, 0, "light");
  b.strip(-6, 4e-3, -0.6, 6, 0.012, -0.4, "accent");
  b.lights(-3, -10, 3, 4, 4.95, 4.5);
  b.strip(-5.95, 2.6, -11, -5.9, 3.4, 5, "window");
});
var car = level({
  id: "1-2",
  name: "CARRIAGE",
  act: 1,
  theme: "transit",
  words: ["NOWHERE", "TO", "RUN."],
  seed: 102,
  player: { pos: [0, 0, 0], yaw: 0, item: "pistol" },
  props: [
    { kind: "mug", pos: [-1.2, 0.6, 3] },
    { kind: "bottle", pos: [-1.2, 0.6, -3] }
  ],
  waves: [
    { when: { type: "start" }, spawns: [{ kind: "walker", pos: [0, -12] }, { kind: "walker", pos: [0, 12] }] },
    {
      when: { type: "remaining", count: 0 },
      delay: 0.3,
      spawns: [
        { kind: "rusher", pos: [5, -12] },
        { kind: "rusher", pos: [5, 12] },
        { kind: "walker", pos: [5.5, 0] }
      ]
    }
  ]
}, (b: LevelBuilder) => {
  b.floor(-2.2, -16, 7.6, 16);
  b.wallZ(-15, 15, -1.65, 2.6, 0.3, "light");
  b.wallWithDoorsZ(-15, 15, 1.65, 2.6, [
    { side: "e", at: -5, width: 1.4, height: 2.1 },
    { side: "e", at: 5, width: 1.4, height: 2.1 }
  ], 0.3, "light");
  b.wallX(-1.8, 1.8, -15.15, 2.6, 0.3, "light");
  b.wallX(-1.8, 1.8, 15.15, 2.6, 0.3, "light");
  b.ceiling(-1.8, -15.3, 1.8, 15.3, 2.6, "trim");
  for (const [z0, z1] of [[-14.5, -6], [-4, 4], [6, 14.5]]) {
    b.box(-1.5, 0, z0, -1, 0.45, z1, "dark");
    b.box(1, 0, z0, 1.5, 0.45, z1, "dark");
  }
  for (let z = -12; z <= 12; z += 4)
    b.pillar(0, z, 0.08, 2.6, "metal");
  b.lights(0, -13, 0, 13, 2.58, 3.25, "glow");
  b.wallZ(-16, 16, 7.4, 5, 0.4);
  b.wallX(1.8, 7.6, -16.2, 5, 0.4);
  b.wallX(1.8, 7.6, 16.2, 5, 0.4);
  b.ceiling(1.8, -16.4, 7.6, 16.4, 5);
  b.pillar(4.8, -8, 0.6, 5);
  b.pillar(4.8, 8, 0.6, 5);
  b.crate(5.5, 0, 1.4, 1, 0.6, 0, "trim");
  b.lights(4.8, -12, 4.8, 12, 4.95, 6);
});
var turnstiles = level({
  id: "1-3",
  name: "TURNSTILES",
  act: 1,
  theme: "transit",
  words: ["THEY", "RUN.", "YOU", "DON'T."],
  seed: 103,
  player: { pos: [0, 0, 5.5], yaw: 0 },
  props: [
    { kind: "pistol", pos: [0.6, 0.1, 3.2] },
    { kind: "bottle", pos: [-2.5, 0.1, 4] },
    { kind: "brick", pos: [3, 0.1, 2] }
  ],
  waves: [
    { when: { type: "start" }, spawns: [{ kind: "rusher", pos: [-6, -10] }, { kind: "rusher", pos: [6, -10] }] },
    {
      when: { type: "remaining", count: 0 },
      delay: 0.5,
      spawns: [
        { kind: "walker", pos: [-8, -12] },
        { kind: "walker", pos: [8, -12] },
        { kind: "rusher", pos: [0, -13] }
      ]
    },
    { when: { type: "remaining", count: 1 }, delay: 1, spawns: [{ kind: "rusher", pos: [-8, 6.5] }, { kind: "rusher", pos: [8, 6.5] }] }
  ]
}, (b: LevelBuilder) => {
  b.room(-10, -14, 10, 8, 5, { ceiling: true });
  for (let x = -8.4; x <= 8.4; x += 1.6)
    b.crate(x, -3, 0.3, 1, 0.9, 0, "metal");
  b.crate(-7, -9, 3, 2.4, 2, 0, "light");
  b.crate(7, -9, 3, 2.4, 2, 0, "light");
  for (const x of [-5, 5])
    for (const z of [-11, 2])
      b.pillar(x, z, 0.8, 5);
  b.crate(0, 2.5, 2.4, 0.45, 0.5, 0, "trim");
  b.lights(-6, -12, 6, 6, 4.95, 4);
  b.strip(-10, 2.2, -13.95, 10, 2.5, -13.9, "glow");
});
var escalator = level({
  id: "1-4",
  name: "ESCALATOR",
  act: 1,
  theme: "transit",
  words: ["UP."],
  seed: 104,
  player: { pos: [0, 0, 8], yaw: 0 },
  props: [
    { kind: "pistol", pos: [2, 0.1, 6] },
    { kind: "brick", pos: [-2, 0.1, 6.5] },
    { kind: "bottle", pos: [4.5, 0.1, 1] }
  ],
  waves: [
    { when: { type: "start" }, spawns: [{ kind: "walker", pos: [-3, 3, -12] }, { kind: "walker", pos: [3, 3, -12] }] },
    {
      when: { type: "remaining", count: 0 },
      delay: 0.4,
      spawns: [
        { kind: "rusher", pos: [-2, 3, -16] },
        { kind: "rusher", pos: [2, 3, -16] },
        { kind: "walker", pos: [-5, 0, 9] }
      ]
    }
  ]
}, (b: LevelBuilder) => {
  b.floor(-6.4, -18.4, 6.4, 10.4);
  b.wallZ(-18.4, 10.4, -6.2, 7.5, 0.4);
  b.wallZ(-18.4, 10.4, 6.2, 7.5, 0.4);
  b.wallX(-6.4, 6.4, -18.2, 7.5, 0.4);
  b.wallX(-6.4, 6.4, 10.2, 7.5, 0.4);
  b.ceiling(-6.4, -18.4, 6.4, 10.4, 7.5);
  b.box(-6, -0.4, -18, 6, 3, -8, "dark");
  b.stairsZ(-1.5, 1.5, -2, 12, 0.25, 0.5, -1);
  b.rail(-6, -8.1, -1.5, -7.9, 3, 1);
  b.rail(1.5, -8.1, 6, -7.9, 3, 1);
  b.box(-1.7, 0, -8, -1.5, 3.9, -2, "metal");
  b.box(1.5, 0, -8, 1.7, 3.9, -2, "metal");
  b.crate(-4, -13, 1.2, 1.1, 1.2, 3, "light");
  b.crate(4, -14, 1.2, 1.1, 1.2, 3, "light");
  b.pillar(-4, 3, 0.7, 7.5);
  b.pillar(4, 3, 0.7, 7.5);
  b.lights(-3, -16, 3, 8, 7.45, 4);
});
var lastTrain = level({
  id: "1-5",
  name: "LAST TRAIN",
  act: 1,
  theme: "transit",
  words: ["LAST", "TRAIN."],
  seed: 105,
  player: { pos: [1, 0, 16], yaw: 0, item: "pistol" },
  props: [
    { kind: "bottle", pos: [3, 0.6, 12] },
    { kind: "brick", pos: [-1, 0.1, 14] },
    { kind: "mug", pos: [3, 0.6, -2] }
  ],
  maxActive: 6,
  waves: [
    {
      when: { type: "start" },
      spawns: [
        { kind: "walker", pos: [-1, -14] },
        { kind: "walker", pos: [3, -14] },
        { kind: "rusher", pos: [1, -18] }
      ]
    },
    { when: { type: "remaining", count: 1 }, delay: 0.5, spawns: [{ kind: "walker", pos: [-6.2, -5] }, { kind: "walker", pos: [-6.2, 6] }] },
    {
      when: { type: "remaining", count: 0 },
      delay: 0.5,
      spawns: [
        { kind: "rusher", pos: [-6.2, -12] },
        { kind: "rusher", pos: [3, -19] },
        { kind: "rusher", pos: [-6.2, 12] },
        { kind: "walker", pos: [1, -19], weapon: "scatter" }
      ]
    }
  ]
}, (b: LevelBuilder) => {
  b.floor(-8.4, -20.4, 4.4, 20.4);
  b.wallZ(-20.4, 20.4, 4.2, 5.5, 0.4);
  b.wallX(-8.4, 4.4, -20.2, 5.5, 0.4);
  b.wallX(-8.4, 4.4, 20.2, 5.5, 0.4);
  b.wallZ(-20.4, 20.4, -8.2, 5.5, 0.4);
  b.ceiling(-8.4, -20.4, 4.4, 20.4, 5.5);
  b.wallWithDoorsZ(-18, 18, -4.5, 2.6, [
    { side: "e", at: -12, width: 1.4, height: 2.1 },
    { side: "e", at: -5, width: 1.4, height: 2.1 },
    { side: "e", at: 5, width: 1.4, height: 2.1 },
    { side: "e", at: 12, width: 1.4, height: 2.1 }
  ], 0.3, "light");
  b.wallX(-8, -4.35, -18, 2.6, 0.3, "light");
  b.wallX(-8, -4.35, 18, 2.6, 0.3, "light");
  b.ceiling(-8, -18.15, -4.35, 18.15, 2.6, "trim");
  for (const z of [-15, -8.5, 0, 8.5, 15])
    b.box(-7.9, 0, z - 2, -7.4, 0.45, z + 2, "dark");
  b.lights(-6.2, -16, -6.2, 16, 2.58, 4, "glow");
  for (const z of [-10, 0, 10])
    b.pillar(1, z, 0.7, 5.5);
  b.crate(3, -2, 1.6, 0.45, 0.5, 0, "trim");
  b.crate(3, 12, 1.6, 0.45, 0.5, 0, "trim");
  b.crate(1, -6, 1.2, 1.1, 0.6, 0, "light");
  b.crate(-1.5, 6, 0.8, 1.3, 0.8, 0, "light");
  b.strip(-3.6, 4e-3, -20, -3.4, 0.012, 20, "accent");
  b.lights(1, -18, 1, 18, 5.45, 6);
});
var ACT1 = [platform, car, turnstiles, escalator, lastTrain];

var lobby = level({
  id: "2-1",
  name: "LOBBY",
  act: 2,
  theme: "office",
  words: ["WELCOME."],
  seed: 201,
  player: { pos: [0, 0, 8], yaw: 0 },
  props: [
    { kind: "mug", pos: [1.5, 1.3, -3.6] },
    { kind: "brick", pos: [-3, 0.1, 6] },
    { kind: "bottle", pos: [6.8, 0.8, 7] }
  ],
  waves: [
    { when: { type: "start" }, spawns: [{ kind: "walker", pos: [0, -6] }, { kind: "walker", pos: [-7, -9], weapon: "scatter" }] },
    {
      when: { type: "remaining", count: 0 },
      delay: 0.6,
      spawns: [
        { kind: "rusher", pos: [-3, -11] },
        { kind: "rusher", pos: [3, -11] },
        { kind: "walker", pos: [0, -11] }
      ]
    }
  ]
}, (b: LevelBuilder) => {
  b.room(-10, -12, 10, 10, 6, { ceiling: true, doors: [{ side: "s", at: 0, width: 3, height: 3 }] });
  b.box(-1.5, 0, 10.2, 1.5, 3, 10.6, "window");
  b.crate(0, -4, 6, 1.1, 1.2, 0, "light");
  b.crate(-3.4, -4.9, 0.8, 1.1, 3, 0, "light");
  for (const x of [-6, 6])
    for (const z of [-6, 4])
      b.pillar(x, z, 0.9, 6);
  b.crate(6.8, 7, 1.2, 0.7, 1.2, 0, "dark");
  b.crate(-6.8, 7, 1.2, 0.7, 1.2, 0, "dark");
  for (const x of [-3, 3])
    b.strip(x - 0.9, 0, -11.95, x + 0.9, 2.6, -11.9, "glow");
  b.lights(-6, -9, 6, 7, 5.95, 4);
});
var elevator = level({
  id: "2-2",
  name: "ELEVATOR",
  act: 2,
  theme: "office",
  words: ["DOORS", "OPEN."],
  seed: 202,
  player: { pos: [0, 0, 1.4], yaw: 0, item: "scatter" },
  props: [
    { kind: "mug", pos: [-4.5, 0.85, -6] },
    { kind: "bottle", pos: [4.5, 0.85, -12] }
  ],
  waves: [
    { when: { type: "start" }, spawns: [{ kind: "walker", pos: [0, -18] }] },
    {
      when: { type: "remaining", count: 0 },
      delay: 0.3,
      spawns: [
        { kind: "rusher", pos: [-5, -8] },
        { kind: "walker", pos: [5, -14] }
      ]
    },
    {
      when: { type: "remaining", count: 0 },
      delay: 0.4,
      spawns: [
        { kind: "walker", pos: [-4, -6], weapon: "scatter" },
        { kind: "rusher", pos: [4, -12] },
        { kind: "rusher", pos: [0, -19] }
      ]
    }
  ]
}, (b: LevelBuilder) => {
  b.floor(-7.4, -20.4, 7.4, 2.8);
  b.wallZ(-0.1, 2.6, -1.3, 2.6, 0.2, "metal");
  b.wallZ(-0.1, 2.6, 1.3, 2.6, 0.2, "metal");
  b.wallX(-1.4, 1.4, 2.7, 2.6, 0.2, "metal");
  b.ceiling(-1.4, -0.1, 1.4, 2.8, 2.6, "metal");
  b.strip(-0.8, 2.55, 0.8, 0.8, 2.58, 2, "glow");
  b.wallWithDoorsZ(-20, -0.1, -1.75, 3, [{ side: "w", at: -8, width: 1.2, height: 2.2 }], 0.3);
  b.wallWithDoorsZ(-20, -0.1, 1.75, 3, [{ side: "e", at: -14, width: 1.2, height: 2.2 }], 0.3);
  b.wallX(-1.9, 1.9, -20.15, 3, 0.3);
  b.ceiling(-1.9, -20.3, 1.9, 0, 3);
  b.lights(0, -18, 0, -2, 2.95, 4);
  b.wallX(-7.4, -1.6, -12.2, 3, 0.4);
  b.wallX(-7.4, -1.6, -3.8, 3, 0.4);
  b.wallZ(-12.4, -3.6, -7.2, 3, 0.4);
  b.ceiling(-7.4, -12.4, -1.6, -3.6, 3);
  b.crate(-4.5, -6, 2, 0.75, 0.9, 0, "light");
  b.crate(-5, -10, 1.2, 1.4, 0.6, 0, "dark");
  b.wallX(1.6, 7.4, -18.2, 3, 0.4);
  b.wallX(1.6, 7.4, -9.8, 3, 0.4);
  b.wallZ(-18.4, -9.6, 7.2, 3, 0.4);
  b.ceiling(1.6, -18.4, 7.4, -9.6, 3);
  b.crate(4.5, -12, 2, 0.75, 0.9, 0, "light");
  b.crate(5, -16.5, 1.2, 1.4, 0.6, 0, "dark");
});
var cubicles = level({
  id: "2-3",
  name: "CUBICLES",
  act: 2,
  theme: "office",
  words: ["NINE", "TO", "FIVE."],
  seed: 203,
  player: { pos: [0, 0, 8.5], yaw: 0 },
  props: [
    { kind: "pistol", pos: [1.6, 0.85, 4.8] },
    { kind: "mug", pos: [-6.4, 0.85, 4.6] },
    { kind: "mug", pos: [6.4, 0.85, -1.6] },
    { kind: "bottle", pos: [-1.6, 0.85, -1.4] },
    { kind: "brick", pos: [-3, 0.1, 8] }
  ],
  maxActive: 6,
  waves: [
    {
      when: { type: "start" },
      spawns: [
        { kind: "marksman", pos: [-10, -12.5] },
        { kind: "walker", pos: [6, -11] },
        { kind: "walker", pos: [-6, -6] }
      ]
    },
    { when: { type: "remaining", count: 1 }, delay: 0.5, spawns: [{ kind: "rusher", pos: [10, -13] }, { kind: "rusher", pos: [-10, -13] }] },
    { when: { type: "remaining", count: 0 }, delay: 0.5, spawns: [{ kind: "marksman", pos: [10, -12.5] }, { kind: "walker", pos: [0, -12.5], weapon: "scatter" }] }
  ]
}, (b: LevelBuilder) => {
  b.room(-12, -14, 12, 10, 3.6, { ceiling: true });
  for (const gx of [-6, 0, 6]) {
    for (const gz of [-7, -1, 5]) {
      b.wallX(gx - 2.3, gx + 2.3, gz, 1.25, 0.1, "trim");
      b.wallZ(gz - 2.3, gz + 2.3, gx, 1.25, 0.1, "trim");
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        b.crate(gx + sx * 1.4, gz + sz * 0.8, 1.4, 0.75, 0.7, 0, "light");
      }
    }
  }
  b.crate(0, -12.8, 6, 1, 0.8, 0, "dark");
  b.box(-12.05, 1, -14, -11.95, 3, 10, "window", false);
  b.lights(-9, -12, 9, 9, 3.55, 3);
});
var serverRoom = level({
  id: "2-4",
  name: "SERVER ROOM",
  act: 2,
  theme: "office",
  words: ["REACH", "THE", "EXIT."],
  seed: 204,
  player: { pos: [0, 0, 4], yaw: 0, item: "pistol" },
  props: [
    { kind: "pistol", pos: [-4, 0.1, 3] },
    { kind: "brick", pos: [4, 0.1, 3.5] }
  ],
  exit: { rect: [-1.5, -16, 1.5, -14.6], requiresClear: false },
  waves: [
    { when: { type: "start" }, spawns: [{ kind: "rusher", pos: [-4, -14] }, { kind: "rusher", pos: [4, -14] }] },
    {
      when: { type: "zone", rect: [-9, -6, 9, -4] },
      spawns: [
        { kind: "walker", pos: [-8, -14] },
        { kind: "walker", pos: [8, -14] },
        { kind: "rusher", pos: [0, -13] }
      ]
    },
    { when: { type: "time", seconds: 5 }, spawns: [{ kind: "rusher", pos: [-8, 4] }, { kind: "rusher", pos: [8, 4] }] },
    { when: { type: "zone", rect: [-9, -12, 9, -10] }, spawns: [{ kind: "walker", pos: [-8, -15], weapon: "carbine" }] }
  ]
}, (b: LevelBuilder) => {
  b.room(-9, -16, 9, 6, 3.2, { ceiling: true, floorMat: "dark" });
  for (const x of [-6, -2, 2, 6]) {
    for (const [z0, z1] of [[-13, -8], [-6, -1]]) {
      b.box(x - 0.45, 0, z0, x + 0.45, 2.4, z1, "metal");
      b.strip(x - 0.47, 0.4, z0 + 0.2, x - 0.45, 2.2, z1 - 0.2, "glow");
      b.strip(x + 0.45, 0.4, z0 + 0.2, x + 0.47, 2.2, z1 - 0.2, "glow");
    }
  }
  b.strip(-1.2, 0, -15.98, 1.2, 2.4, -15.9, "accent");
  b.strip(-1.5, 4e-3, -16, 1.5, 0.012, -14.6, "accent");
  b.lights(-4, -14, 4, 4, 3.15, 4, "glow");
});
var boardroom = level({
  id: "2-5",
  name: "BOARDROOM",
  act: 2,
  theme: "office",
  words: ["ANY", "OTHER", "BUSINESS?"],
  seed: 205,
  player: { pos: [0, 0, 4.5], yaw: 0 },
  props: [
    { kind: "blade", pos: [0, 0.9, 2] },
    { kind: "mug", pos: [-0.6, 0.9, -4] },
    { kind: "mug", pos: [0.6, 0.9, -1] },
    { kind: "bottle", pos: [0.5, 0.9, -6] }
  ],
  waves: [
    {
      when: { type: "start" },
      spawns: [
        { kind: "walker", pos: [-4, -8] },
        { kind: "walker", pos: [0, -9] },
        { kind: "walker", pos: [4, -8] }
      ]
    },
    {
      when: { type: "remaining", count: 0 },
      delay: 0.4,
      spawns: [
        { kind: "rusher", pos: [-6.2, 3] },
        { kind: "rusher", pos: [-6.2, -5] },
        { kind: "walker", pos: [4, -9], weapon: "scatter" }
      ]
    }
  ]
}, (b: LevelBuilder) => {
  b.room(-7, -10, 7, 6, 3.4, { ceiling: true });
  b.crate(0, -2.5, 2.4, 0.8, 9, 0, "dark");
  for (const z of [-6, -4, -2, 0, 2]) {
    b.crate(-1.7, z, 0.5, 0.5, 0.5, 0, "trim");
    b.crate(1.7, z, 0.5, 0.5, 0.5, 0, "trim");
  }
  b.box(6.95, 0.6, -10, 7.05, 3, 6, "window", false);
  b.crate(-5.5, -9.2, 2, 1.1, 0.6, 0, "light");
  b.crate(5.5, 5.2, 2, 1.1, 0.6, 0, "light");
  b.lights(0, -8, 0, 4, 3.35, 3);
});
var ACT2 = [lobby, elevator, cubicles, serverRoom, boardroom];

function roof(b: LevelBuilder, x0: number, z0: number, x1: number, z1: number, gaps: [string,number,number][] = []) {
  b.floor(x0, z0, x1, z1, 0, "floor");
  b.box(x0, -6, z0, x1, -0.4, z1, "wall");
  const h = 1;
  const t = 0.3;
  const along = (side: string, a0: number, a1: number) => {
    const g = gaps.filter((q) => q[0] === side).map((q) => [q[1], q[2]]).sort((p, q) => p[0] - q[0]);
    let cur = a0;
    const seg = (a: number, c: number) => {
      if (c - a < 0.05)
        return;
      if (side === "n")
        b.rail(a, z0, c, z0 + t, 0, h, "trim");
      if (side === "s")
        b.rail(a, z1 - t, c, z1, 0, h, "trim");
      if (side === "w")
        b.rail(x0, a, x0 + t, c, 0, h, "trim");
      if (side === "e")
        b.rail(x1 - t, a, x1, c, 0, h, "trim");
    };
    for (const [g0, g1] of g) {
      seg(cur, g0);
      cur = Math.max(cur, g1);
    }
    seg(cur, a1);
  };
  along("n", x0, x1);
  along("s", x0, x1);
  along("w", z0 + t, z1 - t);
  along("e", z0 + t, z1 - t);
}
function acUnit(b: LevelBuilder, x: number, z: number, w: number = 2, d: number = 1.4) {
  b.crate(x, z, w, 1.5, d, 0, "metal");
  b.crate(x, z, w * 0.6, 0.12, d * 0.6, 1.5, "dark");
}
function skyline(b: LevelBuilder, cx: number, cz: number, r: number) {
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + 0.3;
    const d = r + i % 3 * 9;
    const x = cx + Math.cos(a) * d;
    const z = cz + Math.sin(a) * d;
    const h = 12 + i * 7 % 5 * 6;
    b.box(x - 4, -40, z - 4, x + 4, h, z + 4, "dark", false);
    for (let y = -10; y < h - 2; y += 5)
      b.box(x - 4.05, y, z - 2, x + 4.05, y + 1.2, z + 2, i % 2 ? "accent" : "window", false);
  }
}
var ledge = level({
  id: "3-1",
  name: "LEDGE",
  act: 3,
  theme: "rooftop",
  words: ["MIND", "THE", "EDGE."],
  seed: 301,
  player: { pos: [0, 0, 10], yaw: 0, item: "pistol" },
  props: [
    { kind: "brick", pos: [-2, 0.1, 9] },
    { kind: "bottle", pos: [3, 0.1, 8] }
  ],
  waves: [
    {
      when: { type: "start" },
      spawns: [
        { kind: "marksman", pos: [0, 2.2, -10] },
        { kind: "walker", pos: [-8, -6] },
        { kind: "walker", pos: [8, -6] }
      ]
    },
    { when: { type: "remaining", count: 1 }, delay: 0.5, spawns: [{ kind: "rusher", pos: [-10, -10] }, { kind: "rusher", pos: [10, -10] }] },
    { when: { type: "remaining", count: 0 }, delay: 0.5, spawns: [{ kind: "marksman", pos: [-2.5, 2.2, -10.5] }, { kind: "walker", pos: [9, -10], weapon: "scatter" }] }
  ]
}, (b: LevelBuilder) => {
  roof(b, -12, -12, 12, 12);
  b.box(-4, 0, -12, 4, 2.2, -8, "wall");
  b.stairsX(-11, -9, 8, 8, 0.275, 0.5, -1);
  b.rail(-4, -8.15, 4, -7.95, 2.2, 0.9, "metal");
  acUnit(b, -6, 2);
  acUnit(b, 6, 0);
  acUnit(b, -2, -4, 1.4, 2);
  acUnit(b, 7, 7, 1.4, 1.4);
  b.pillar(-9, 7, 0.4, 3.5, "metal");
  b.strip(-9.3, 3.5, 6.7, -8.7, 3.6, 7.3, "accent");
  skyline(b, 0, 0, 45);
});
var skylight = level({
  id: "3-2",
  name: "SKYLIGHT",
  act: 3,
  theme: "rooftop",
  words: ["LOOK", "UP."],
  seed: 302,
  player: { pos: [0, 0, 12], yaw: 0 },
  props: [
    { kind: "pistol", pos: [2, 0.1, 10] },
    { kind: "brick", pos: [-2, 0.1, 11] },
    { kind: "bottle", pos: [-5, 0.1, 7] }
  ],
  maxActive: 6,
  waves: [
    {
      when: { type: "start" },
      spawns: [
        { kind: "walker", pos: [-6, -6] },
        { kind: "walker", pos: [6, -6], weapon: "carbine" },
        { kind: "marksman", pos: [-9, 3, -9] }
      ]
    },
    { when: { type: "remaining", count: 1 }, delay: 0.5, spawns: [{ kind: "rusher", pos: [12, -12] }, { kind: "rusher", pos: [-12, 12] }] },
    { when: { type: "remaining", count: 0 }, delay: 0.5, spawns: [{ kind: "walker", pos: [0, -12], weapon: "scatter" }, { kind: "marksman", pos: [9, 3, 9] }] }
  ]
}, (b: LevelBuilder) => {
  roof(b, -14, -14, 14, 14);
  for (let gx = -4.5; gx <= 4.5; gx += 3) {
    for (let gz = -4.5; gz <= 4.5; gz += 3) {
      b.box(gx - 1.3, 0, gz - 1.3, gx + 1.3, 0.35, gz + 1.3, "window");
      b.box(gx - 1.4, 0, gz - 1.4, gx + 1.4, 0.55, gz - 1.25, "metal");
      b.box(gx - 1.4, 0, gz + 1.25, gx + 1.4, 0.55, gz + 1.4, "metal");
    }
  }
  b.box(-11, 0, -11, -7, 3, -7, "wall");
  b.box(7, 0, 7, 11, 3, 11, "wall");
  b.strip(-9.6, 1, -6.95, -8.4, 2.6, -6.9, "accent");
  b.strip(8.4, 1, 6.9, 9.6, 2.6, 6.95, "accent");
  acUnit(b, 8, -8);
  acUnit(b, -8, 8);
  skyline(b, 0, 0, 48);
});
var crane = level({
  id: "3-3",
  name: "CROSSING",
  act: 3,
  theme: "rooftop",
  words: ["CROSS", "OVER."],
  seed: 303,
  player: { pos: [0, 0, 14], yaw: 0, item: "pistol" },
  props: [
    { kind: "bottle", pos: [-3, 0.1, 12] },
    { kind: "brick", pos: [3, 0.1, 12] },
    { kind: "bottle", pos: [5, 0.1, 9] }
  ],
  exit: { rect: [-3, -20, 3, -18.4], requiresClear: false },
  waves: [
    {
      when: { type: "start" },
      spawns: [
        { kind: "walker", pos: [-4, -12] },
        { kind: "walker", pos: [4, -12] },
        { kind: "marksman", pos: [0, -17] }
      ]
    },
    { when: { type: "remaining", count: 1 }, delay: 0.4, spawns: [{ kind: "rusher", pos: [-6, -18] }, { kind: "rusher", pos: [6, -18] }] },
    { when: { type: "zone", rect: [-1, -8, 1, 4] }, spawns: [{ kind: "walker", pos: [-5, -16], weapon: "carbine" }, { kind: "walker", pos: [5, -16], weapon: "scatter" }] }
  ]
}, (b: LevelBuilder) => {
  roof(b, -8, 4, 8, 16, [["n", -0.6, 0.6]]);
  roof(b, -8, -20, 8, -8, [["s", -0.6, 0.6]]);
  b.box(-0.6, -0.5, -8, 0.6, 0, 4, "metal");
  b.box(-0.65, -1.2, -8, 0.65, -0.5, 4, "dark");
  acUnit(b, -4, 9);
  acUnit(b, 4, 7);
  acUnit(b, -4, -12, 2, 1.4);
  acUnit(b, 4, -13, 1.4, 2);
  b.crate(0, -14, 3, 1.1, 0.6, 0, "light");
  b.strip(-3, 4e-3, -20, 3, 0.012, -18.4, "accent");
  b.strip(-0.1, 5e-3, -8, 0.1, 0.012, 4, "accent");
  skyline(b, 0, -2, 46);
});
var helipad = level({
  id: "3-4",
  name: "HELIPAD",
  act: 3,
  theme: "rooftop",
  words: ["HOLD", "THE", "LINE."],
  seed: 304,
  player: { pos: [0, 1.2, 0], yaw: 0, item: "carbine" },
  props: [
    { kind: "pistol", pos: [3, 1.3, 3] },
    { kind: "brick", pos: [-3, 1.3, -3] },
    { kind: "brick", pos: [-3, 1.3, 3] }
  ],
  maxActive: 6,
  waves: [
    {
      when: { type: "start" },
      spawns: [
        { kind: "walker", pos: [-11, -11] },
        { kind: "walker", pos: [11, -11] },
        { kind: "walker", pos: [-11, 11] },
        { kind: "walker", pos: [11, 11] }
      ]
    },
    {
      when: { type: "remaining", count: 1 },
      delay: 0.5,
      spawns: [
        { kind: "rusher", pos: [0, -12] },
        { kind: "rusher", pos: [12, 0] },
        { kind: "rusher", pos: [0, 12] }
      ]
    },
    { when: { type: "remaining", count: 1 }, delay: 0.5, spawns: [{ kind: "marksman", pos: [-12, 3, -12] }, { kind: "marksman", pos: [12, 3, 12] }] },
    {
      when: { type: "remaining", count: 0 },
      delay: 0.5,
      spawns: [
        { kind: "walker", pos: [-12, 0], weapon: "scatter" },
        { kind: "walker", pos: [12, 0], weapon: "scatter" },
        { kind: "rusher", pos: [0, -12] },
        { kind: "rusher", pos: [0, 12] }
      ]
    }
  ]
}, (b: LevelBuilder) => {
  roof(b, -14, -14, 14, 14);
  b.box(-6, 0, -6, 6, 1.2, 6, "trim");
  b.strip(-4, 1.204, -0.25, 4, 1.212, 0.25, "accent");
  b.strip(-0.25, 1.204, -4, 0.25, 1.212, 4, "accent");
  b.stairsZ(-1.5, 1.5, 10, 4, 0.3, 1, -1);
  b.stairsZ(-1.5, 1.5, -10, 4, 0.3, 1, 1);
  b.stairsX(-1.5, 1.5, 10, 4, 0.3, 1, -1);
  b.stairsX(-1.5, 1.5, -10, 4, 0.3, 1, 1);
  for (const [x, z] of [[-12, -12], [12, -12], [-12, 12], [12, 12]]) {
    b.box(x - 1.5, 0, z - 1.5, x + 1.5, 3, z + 1.5, "wall");
  }
  acUnit(b, -9, 0, 1.4, 2);
  acUnit(b, 9, 0, 1.4, 2);
  acUnit(b, 0, -9, 2, 1.4);
  acUnit(b, 0, 9, 2, 1.4);
  skyline(b, 0, 0, 46);
});
var spire = level({
  id: "3-5",
  name: "SPIRE",
  act: 3,
  theme: "rooftop",
  words: ["STILL.", "FRAME."],
  seed: 305,
  player: { pos: [0, 0, 13], yaw: 0 },
  props: [
    { kind: "pistol", pos: [2, 0.1, 11] },
    { kind: "scatter", pos: [-12, 0.1, 6] },
    { kind: "blade", pos: [12, 0.1, 6] },
    { kind: "brick", pos: [-2, 0.1, 11] },
    { kind: "bottle", pos: [5, 0.1, 9] },
    { kind: "bottle", pos: [-5, 0.1, 9] }
  ],
  maxActive: 7,
  waves: [
    {
      when: { type: "start" },
      spawns: [
        { kind: "walker", pos: [-8, -8] },
        { kind: "walker", pos: [8, -8] },
        { kind: "rusher", pos: [0, -13] }
      ]
    },
    {
      when: { type: "remaining", count: 1 },
      delay: 0.5,
      spawns: [
        { kind: "marksman", pos: [-12, 2.4, -1] },
        { kind: "marksman", pos: [12, 2.4, -1] },
        { kind: "rusher", pos: [-13, -13] }
      ]
    },
    {
      when: { type: "remaining", count: 1 },
      delay: 0.5,
      spawns: [
        { kind: "walker", pos: [-13, 13], weapon: "carbine" },
        { kind: "walker", pos: [13, 13], weapon: "scatter" },
        { kind: "rusher", pos: [13, -13] },
        { kind: "rusher", pos: [0, -14] }
      ]
    },
    {
      when: { type: "remaining", count: 1 },
      delay: 0.5,
      spawns: [
        { kind: "rusher", pos: [-14, 0] },
        { kind: "rusher", pos: [14, 0] },
        { kind: "walker", pos: [-6, -14], weapon: "carbine" },
        { kind: "walker", pos: [6, -14], weapon: "carbine" }
      ]
    },
    {
      when: { type: "remaining", count: 0 },
      delay: 0.8,
      spawns: [
        { kind: "marksman", pos: [0, -14] },
        { kind: "walker", pos: [-10, -14], weapon: "scatter" },
        { kind: "walker", pos: [10, -14], weapon: "scatter" },
        { kind: "rusher", pos: [-14, -6] },
        { kind: "rusher", pos: [14, -6] }
      ]
    }
  ]
}, (b: LevelBuilder) => {
  roof(b, -16, -16, 16, 16);
  b.box(-2, 0, -2, 2, 14, 2, "dark");
  b.box(-1.2, 14, -1.2, 1.2, 22, 1.2, "metal");
  b.strip(-2.05, 2, -0.2, -2, 13, 0.2, "accent");
  b.strip(2, 2, -0.2, 2.05, 13, 0.2, "accent");
  b.strip(-0.2, 2, 2, 0.2, 13, 2.05, "accent");
  b.strip(-0.2, 2, -2.05, 0.2, 13, -2, "accent");
  b.box(-15.7, 0, -4, -10, 2.4, 2, "wall");
  b.box(10, 0, -4, 15.7, 2.4, 2, "wall");
  b.stairsX(2.5, 4.5, -6, 8, 0.3, 0.5, -1);
  b.stairsX(2.5, 4.5, 6, 8, 0.3, 0.5, 1);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + Math.PI / 8;
    const x = Math.cos(a) * 7;
    const z = Math.sin(a) * 7;
    b.crate(x, z, 1.6, 1.15, 1.6, 0, i % 2 ? "light" : "metal");
  }
  acUnit(b, -10, 10);
  acUnit(b, 10, 10);
  acUnit(b, -9, -11, 1.4, 2);
  acUnit(b, 9, -11, 1.4, 2);
  skyline(b, 0, 0, 52);
});
var ACT3 = [ledge, skylight, crane, helipad, spire];

var LEVELS = [...ACT1, ...ACT2, ...ACT3];
var ACT_NAMES: Record<number,string> = {
  1: "TRANSIT",
  2: "OFFICE TOWER",
  3: "ROOFTOPS"
};

export { ACT1,ACT2,ACT3,ACT_NAMES,acUnit,boardroom,car,crane,cubicles,elevator,escalator,helipad,lastTrain,ledge,level,LevelBuilder,LEVELS,lobby,platform,roof,serverRoom,skylight,skyline,spire,turnstiles };
