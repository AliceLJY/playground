const test = require('node:test');
const assert = require('node:assert/strict');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const path = require('node:path');
const fs = require('node:fs');

test('R4 real framebuffer passes sky, foliage, sunlight and creature separation checks', {timeout:180000}, async () => {
  const root = path.resolve(__dirname, '..');
  await promisify(execFile)(process.execPath, ['tools/palette-check.cjs', '--default'], {
    cwd:root, timeout:175000, maxBuffer:2*1024*1024
  });
  const report = JSON.parse(fs.readFileSync(path.join(root, 'shots/r4-default-report.json')));
  assert.equal(report.passed, true);
  assert.deepEqual(report.scenes.map(s => s.view), ['hero', 'wide', 'night']);
  assert.ok(report.scenes.every(s => s.state.palette === 'noon' && s.state.quality.scale === 1));
});
