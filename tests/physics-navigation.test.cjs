const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');
const previousLoader = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, fileName: filename,
  });
  module._compile(outputText, filename);
};
let StaticWorld, NavGrid, LEVELS, World, createEnemy, nextWaypoint, buildLevelMesh;
try {
  ({ StaticWorld } = require('../src/physics/collision.ts'));
  ({ NavGrid } = require('../src/physics/navigation.ts'));
  ({ LEVELS } = require('../src/levels/levels.ts'));
  ({ buildLevelMesh } = require('../src/graphics/scene.ts')); 
  ({ World } = require('../src/gameplay/world.ts'));
  ({ createEnemy, nextWaypoint } = require('../src/gameplay/enemies.ts'));
} finally {
  if (previousLoader) require.extensions['.ts'] = previousLoader;
  else delete require.extensions['.ts'];
}
const floor = { min: [-5, -0.4, -5], max: [5, 0, 5] };
const box = (min, max) => ({ min, max });
const overlaps = (boxes, pos, r, h) => boxes.some(b =>
  pos[0] - r < b.max[0] - 1e-4 && pos[0] + r > b.min[0] + 1e-4 &&
  pos[1] < b.max[1] - 1e-4 && pos[1] + h > b.min[1] + 1e-4 &&
  pos[2] - r < b.max[2] - 1e-4 && pos[2] + r > b.min[2] + 1e-4);

test('all level player spawns and every wave spawn have free character volumes', () => {
  for (const level of LEVELS) {
    const world = new World(level);
    assert.equal(overlaps(world.static.boxes, world.player.pos, 0.3, 1.75), false, `${level.id} player`);
    assert.equal(world.player.pos[1], level.player.pos[1]);
    if (!overlaps(world.static.boxes, level.player.pos, 0.3, 1.75))
      assert.deepEqual(world.player.pos, level.player.pos, 'valid player spawn unchanged');
    // Exercise the real queue path for all waves, independent of combat/wave triggers.
    for (const wave of level.waves) {
      world.enemies = [];
      world.spawnQueue = wave.spawns.map(spawn => ({ spawn }));
      world.flushSpawnQueue(false);
      assert.equal(world.enemies.length, wave.spawns.length);
      for (let i = 0; i < world.enemies.length; i++) {
        const enemy = world.enemies[i], spec = wave.spawns[i];
        assert.equal(overlaps(world.static.boxes, enemy.pos, 0.3, 1.8), false, `${level.id} ${JSON.stringify(spec.pos)}`);
        const requested = spec.pos.length === 2 ? [spec.pos[0], 0.05, spec.pos[1]] : [spec.pos[0], spec.pos[1] + 0.05, spec.pos[2]];
        assert.equal(enemy.pos[1], requested[1]);
        if (!overlaps(world.static.boxes, requested, 0.3, 1.8))
          assert.deepEqual(enemy.pos, requested, 'valid enemy spawn unchanged');
        assert.deepEqual(world.static.characterSpawn(requested, 0.3, 1.8), enemy.pos, 'deterministic placement');
        assert.ok(world.static.boxes.some(b => enemy.pos[0] >= b.min[0] && enemy.pos[0] <= b.max[0] &&
          enemy.pos[2] >= b.min[2] && enemy.pos[2] <= b.max[2] &&
          Math.abs(b.max[1] - enemy.pos[1]) < 0.1), 'spawn remains supported');
        assert.ok(Math.hypot(enemy.pos[0] - requested[0], enemy.pos[2] - requested[2]) <= 3);
        assert.deepEqual(enemy.prevPos, enemy.pos);
        assert.equal(enemy.kind, spec.kind);
      }
    }
  }
});

test('carriage spawn stays at floor height when gravity first acts', () => {
  const world = new World(LEVELS.find(l => l.id === '1-2'));
  const pos = [...world.player.pos];
  world.static.moveCharacter(pos, [0, -0.001, 0], 0.3, 1.75, 0.42, true);
  assert.equal(pos[1], 0);
});

test('navigation uses interior floors under carriage and elevator ceilings', () => {
  for (const id of ['1-2', '2-2']) {
    const level = LEVELS.find(l => l.id === id);
    const world = new World(level);
    const p = id === '1-2' ? [0.25, 0, 1.75] : [0, 0, 1.4];
    assert.equal(world.nav.floor[world.nav.cellOf(p[0], p[2])], 0, id);
  }
});

test('carriage enemies can route from the interior through an existing doorway', () => {
  const world = new World(LEVELS.find(l => l.id === '1-2'));
  const route = world.nav.findPath([0.5,0,-5], [5,0,-5]);
  assert.ok(route);
  assert.ok(route.every(p => p[1] < 0.1), 'route remains on the interior floor');
  assert.deepEqual(route.at(-1), [5,0,-5]);
});

test('navigation retains elevated platforms and stairs without removing ceilings', () => {
  const st = new StaticWorld([floor, box([-1,-0.4,-1], [1,2,1])]);
  const nav = new NavGrid(st);
  assert.equal(nav.floor[nav.cellOf(0,0)], 2);
  assert.equal(nav.floor[nav.cellOf(3,3)], 0);
  const level = LEVELS.find(l => l.id === '1-4');
  const world = new World(level);
  const route = world.nav.findPath([0,0,0], [0,3,-10]);
  assert.ok(route, 'escalator route to upper platform');
  assert.equal(route.at(-1)[1], 3);
});

function routing(blocker) {
  const st = new StaticWorld([floor, ...blocker]);
  const nav = new NavGrid(st);
  const enemy = createEnemy(1, 'rusher', [-0.75,0,0], 0, null, false, 1);
  return { world: { static: st, nav, rng: { next: () => 0.5 } }, enemy, target: [0.75,0,0] };
}

test('nearby target behind a partition keeps a route around its end', () => {
  const {world, enemy, target} = routing([box([-0.1,0,-1], [0.1,2,1])]);
  const waypoint = nextWaypoint(world, enemy, target, 1/120);
  assert.ok(enemy.path && enemy.path.length > 1);
  assert.notDeepEqual(waypoint, target);
  assert.ok(Math.abs(waypoint[2]) > 1, 'route goes around wall end');
  // Independently sample the complete route against original obstacle volumes.
  let start = enemy.pos;
  for (const end of enemy.path) {
    const steps = Math.max(1, Math.ceil(Math.hypot(end[0]-start[0], end[2]-start[2]) / 0.02));
    for (let i = 0; i <= steps; i++) {
      const pos = start.map((value, axis) => value + (end[axis]-value) * i / steps);
      assert.equal(overlaps(world.static.boxes, pos, 0.3, 1.8), false);
    }
    start = end;
  }
});

test('close open targets retain direct pursuit; low obstacles still require body clearance', () => {
  const open = routing([]);
  assert.deepEqual(nextWaypoint(open.world, open.enemy, open.target, 1/120), open.target);
  const blocked = routing([box([-0.1,0,-1], [0.1,0.9,1])]);
  assert.notDeepEqual(nextWaypoint(blocked.world, blocked.enemy, blocked.target, 1/120), blocked.target);
});

test('cached scene and replay worlds preserve ceiling metadata and corrected spawn', () => {
  // Only GPU buffer allocation is stubbed; scene geometry and collision baking run.
  const device = { createBuffer({ size }) {
    const data = new ArrayBuffer(size);
    return { getMappedRange: () => data, unmap() {}, destroy() {} };
  } };
  const oldUsage = global.GPUBufferUsage;
  global.GPUBufferUsage = { VERTEX: 32, INDEX: 16 };
  try {
    const level = LEVELS.find(l => l.id === '1-2');
    const { shared } = buildLevelMesh(device, level);
    assert.equal(shared.nav.floor[shared.nav.cellOf(0.25,1.75)], 0);
    const live = new World(level, shared);
    const replay = new World(level, shared);
    assert.deepEqual(live.player.pos, replay.player.pos);
    assert.deepEqual(live.enemies.map(e => e.pos), replay.enemies.map(e => e.pos));
    assert.equal(overlaps(shared.static.boxes, live.player.pos, 0.3, 1.75), false);
    assert.ok(shared.static.boxes.some(b => b.navFloor === false), 'ceilings still collide');
  } finally {
    if (oldUsage === undefined) delete global.GPUBufferUsage;
    else global.GPUBufferUsage = oldUsage;
  }
});

test('blocked target with no route does not restore obstacle-blind pursuit', () => {
  const {world, enemy, target} = routing([box([-0.1,0,-5], [0.1,4,5])]);
  assert.deepEqual(nextWaypoint(world, enemy, target, 1/120), enemy.pos);
});
