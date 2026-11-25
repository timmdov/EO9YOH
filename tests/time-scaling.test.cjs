const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const previousLoader = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    fileName: filename,
  });
  module._compile(outputText, filename);
};
let TimeScaleDriver, WALK_SPEED;
try {
  ({ TimeScaleDriver } = require('../src/core/time-scale.ts'));
  ({ WALK_SPEED } = require('../src/gameplay/player.ts'));
} finally {
  if (previousLoader) require.extensions['.ts'] = previousLoader;
  else delete require.extensions['.ts'];
}

// Execute the actual Game.frame method, including its argument order, without
// initializing a GPU, DOM, renderer or level. Only those external boundaries
// are stubbed; the time-scale driver and frame method are production code.
const source = fs.readFileSync(require.resolve('../src/game.ts'), 'utf8');
const ast = ts.createSourceFile('game.ts', source, ts.ScriptTarget.ES2022, true);
const gameClass = ast.statements.find(node => ts.isClassDeclaration(node) && node.name.text === 'Game');
const frame = gameClass.members.find(node => ts.isMethodDeclaration(node) && node.name.getText(ast) === 'frame');
const { outputText } = ts.transpileModule(`class FrameHarness { ${frame.getText(ast)} }\nexports.FrameHarness = FrameHarness;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
});
const context = { exports: {}, WALK_SPEED, BASE_SENSITIVITY: 0.0022 };
vm.runInNewContext(outputText, context);

function harness(speed = 0) {
  const game = new context.exports.FrameHarness();
  Object.assign(game, {
    state: 'playing', stateTime: 0, runRealTime: 0,
    input: { update() {}, wasPressed() { return false; }, pointerLocked: true },
    ui: { update() {}, showLockHint() {} },
    save: { settings: { sensitivity: 1, invertY: false } },
    player: { planarSpeed: speed, lookSpeed: 0, grounded: true, update() {}, toFrame() { return {}; } },
    world: { player: { burstLeft: 0 }, applyPlayerFrame() { return false; } },
    recorder: { push() {} }, driver: new TimeScaleDriver(),
  });
  return game;
}
function run(game, count = 120) {
  const time = { realDt: 1 / 60, timeScale: 0 };
  for (let i = 0; i < count; i++) game.frame(time);
  return time.timeScale;
}
function near(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} should approach ${expected}`);
}

test('grounded inactivity keeps simulation at its intentional minimum', () => {
  near(run(harness()), 0.015);
});
test('half and full walking speeds approach proportional simulation speeds', () => {
  near(run(harness(WALK_SPEED / 2)), 0.5);
  near(run(harness(WALK_SPEED)), 1);
});
test('stopping smoothly returns simulation to slow motion', () => {
  const game = harness(WALK_SPEED);
  near(run(game), 1);
  game.player.planarSpeed = 0;
  const first = run(game, 1);
  assert.ok(first > 0.015 && first < 1);
  near(run(game), 0.015);
});
test('looking, jumping, bursts and successful actions still advance time', () => {
  const looking = harness();
  looking.player.lookSpeed = 900;
  near(run(looking), 0.35);
  const jumping = harness();
  jumping.player.grounded = false;
  near(run(jumping), 0.8);
  const bursting = harness();
  bursting.world.player.burstLeft = 1;
  near(run(bursting), 1);
  const action = harness();
  action.world.applyPlayerFrame = () => true;
  assert.ok(run(action, 1) > 0.015);
  action.world.applyPlayerFrame = () => false;
  near(run(action), 0.015);
});
