const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');

const previousLoader = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    fileName: filename,
  });
  module._compile(outputText, filename);
};
let PlayerController, Camera, MAX_PITCH2;
try {
  ({ PlayerController, MAX_PITCH2 } = require('../src/gameplay/player.ts'));
  ({ Camera } = require('../src/graphics/camera.ts'));
} finally {
  if (previousLoader) require.extensions['.ts'] = previousLoader;
  else delete require.extensions['.ts'];
}

for (const [direction, dx] of [['right', 10], ['left', -10]]) {
  test(`mouse movement ${direction} turns toward camera ${direction}`, () => {
    for (const yaw of [0, 1.2, -1.2, Math.PI * 2 - 0.01]) {
      const player = new PlayerController();
      player.reset([0, 0, 0], yaw);
      const camera = new Camera();
      camera.yaw = yaw;
      const rightBefore = camera.right();
      player.look({ mouseDx: dx, mouseDy: 0 }, 1 / 60, { sensitivity: 0.002, invertY: false });
      camera.yaw = player.yaw;
      const forwardAfter = camera.forward();
      const turnTowardRight = forwardAfter.reduce((sum, v, i) => sum + v * rightBefore[i], 0);
      assert.ok(turnTowardRight * dx > 0, `incorrect ${direction} turn from yaw ${yaw}`);
    }
  });
}

test('horizontal sensitivity, vertical inversion and look speed retain their behaviour', () => {
  for (const invertY of [false, true]) {
    const player = new PlayerController();
    player.look({ mouseDx: 3, mouseDy: 4 }, 0.02, { sensitivity: 0.01, invertY });
    assert.equal(player.yaw, -0.03);
    assert.equal(player.pitch, invertY ? 0.04 : -0.04);
    assert.equal(player.lookSpeed, 250);
    assert.equal(player.mouseDx, 3);
    assert.equal(player.mouseDy, 4);
  }
});

test('vertical pitch limits and zero-input look remain unchanged', () => {
  const player = new PlayerController();
  player.look({ mouseDx: 0, mouseDy: 10000 }, 1 / 60, { sensitivity: 0.01, invertY: false });
  assert.equal(player.pitch, -MAX_PITCH2);
  player.look({ mouseDx: 0, mouseDy: -10000 }, 1 / 60, { sensitivity: 0.01, invertY: false });
  assert.equal(player.pitch, MAX_PITCH2);
  player.reset([0, 0, 0], 1.2);
  player.look({ mouseDx: 0, mouseDy: 0 }, 0, { sensitivity: 0.01, invertY: false });
  assert.equal(player.yaw, 1.2);
  assert.equal(player.pitch, 0);
  assert.equal(player.lookSpeed, 0);
});
