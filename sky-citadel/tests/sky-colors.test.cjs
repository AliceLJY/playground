const test = require('node:test');
const assert = require('node:assert/strict');
const colors = import('../src/sky-colors.js');

test('OKLCH conversion preserves sRGB endpoints', async () => {
  const {toOklch, toSrgb} = await colors;
  for (const hex of ['#000000', '#ffffff', '#1f4fa8', '#4d8fe0', '#ffc796', '#0b1530', '#cde6fa']) {
    const expected = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    const actual = toSrgb(toOklch(hex)).map(v => v * 255);
    assert.ok(actual.every((v, i) => Math.abs(v - expected[i]) < .01), hex);
  }
});

test('OKLCH hue takes the short arc and gamut mapping preserves lightness', async () => {
  const {mixOklch, toSrgb, toOklch} = await colors;
  const midpoint = mixOklch([.8, .15, 350 * Math.PI / 180], [.8, .15, 10 * Math.PI / 180], .5);
  assert.ok(Math.abs(Math.sin(midpoint[2])) < .000001);
  assert.ok(Math.cos(midpoint[2]) > .999999);
  const rgb = toSrgb([.85, .35, midpoint[2]]);
  assert.ok(rgb.every(v => Number.isFinite(v) && v >= 0 && v <= 1));
  const mapped = toOklch('#' + rgb.map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join(''));
  assert.ok(Math.abs(mapped[0] - .85) < .002);
  assert.ok(Math.abs(Math.sin(mapped[2] - midpoint[2])) < .02);
});

// Rows measured top to bottom on the live page for the two skies that were rejected
// ("the sky looks cheap and muddy" on 2026-11-11), kept as known-bad calibration samples.
const REJECTED = {
  'round 3, blue mixed straight into amber': ['#1d4063', '#3a6581', '#51869e', '#619bb0', '#9babac', '#ccc1b0', '#d2ba9c', '#b6a28b'],
  'round 4, primary blue through pink to peach': ['#1f4a97', '#2a5fb0', '#3a77cb', '#4889da', '#69a1ea', '#9dadee', '#e7a4dc', '#f7cca8'],
};

test('sky rules reject both skies that were sent back', async () => {
  const {skyRuleFailures} = await colors;
  for (const [name, rows] of Object.entries(REJECTED)) assert.ok(skyRuleFailures(rows).length > 0, name + ' must fail');
  assert.match(skyRuleFailures(REJECTED['round 3, blue mixed straight into amber']).join('; '), /grey band/);
  assert.match(skyRuleFailures(REJECTED['round 3, blue mixed straight into amber']).join('; '), /dull warm/);
  assert.match(skyRuleFailures(REJECTED['round 4, primary blue through pink to peach']).join('; '), /pink band/);
  assert.match(skyRuleFailures(REJECTED['round 4, primary blue through pink to peach']).join('; '), /loud blue/);
});

test('the five keyframes pass the strict sky rules and every blend between them passes the looser set', async () => {
  const {skyRuleFailures, fillSkyRamp} = await colors, {timeState} = await import('../src/core.js');
  const rowsAt = hour => {
    const data = new Uint8Array(256 * 4); fillSkyRamp(timeState(hour), data);
    const rows = [];
    for (let row = 255; row >= 0; row--) rows.push('#' + [0, 1, 2].map(k => data[row * 4 + k].toString(16).padStart(2, '0')).join(''));
    return rows;
  };
  // Afterglow (2.5) is dark on purpose, so its lightness is not expected to rise; the other four are.
  for (const hour of [0, 1, 2, 3]) assert.deepEqual(skyRuleFailures(rowsAt(hour)), [], 'keyframe ' + hour);
  assert.deepEqual(skyRuleFailures(rowsAt(2.5)).filter(f => !f.startsWith('lightness dips')), [], 'afterglow');
  for (let hour = 0; hour <= 3.0001; hour += .125) assert.deepEqual(skyRuleFailures(rowsAt(hour), false), [], 'blend ' + hour);
  // The looser set still rejects the muddy sky, so it is not an empty check.
  assert.ok(skyRuleFailures(REJECTED['round 3, blue mixed straight into amber'], false).length > 0);
});
