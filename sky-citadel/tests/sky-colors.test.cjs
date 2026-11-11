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
