const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');

// Load the actual TypeScript modules in Node without adding a test framework.
const previousLoader = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    fileName: filename,
  });
  module._compile(outputText, filename);
};
let Ui;
try {
  ({ Ui } = require('../src/ui/ui.ts'));
} finally {
  if (previousLoader) require.extensions['.ts'] = previousLoader;
  else delete require.extensions['.ts'];
}

function unlocked(index, records = {}) {
  // The policy does not need DOM construction; use the real prototype method.
  return Ui.prototype.isUnlocked.call({
    levels: [{ id: '1-1' }, { id: '1-2' }, { id: '1-3' }],
    save: { levels: records },
  }, index);
}

test('a fresh player can enter the first level', () => {
  assert.equal(unlocked(0), true);
});

test('later levels remain locked until their predecessor is cleared', () => {
  assert.equal(unlocked(1), false);
  assert.equal(unlocked(1, { '1-1': { cleared: false } }), false);
  assert.equal(unlocked(1, { '1-1': { cleared: true } }), true);
  assert.equal(unlocked(2, { '1-1': { cleared: true } }), false);
  assert.equal(unlocked(2, { '1-2': { cleared: true } }), true);
});
