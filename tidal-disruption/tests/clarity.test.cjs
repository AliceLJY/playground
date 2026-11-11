const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('A9 default final-frame ring and filaments retain at least 65% of full-resolution gradient energy', { timeout: 120000 }, () => {
  const result = spawnSync(process.execPath, [path.resolve(__dirname, '../tools/clarity-check.cjs')], { encoding: 'utf8', timeout: 110000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
