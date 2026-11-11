const test = require('node:test');
const assert = require('node:assert/strict');
const physics = import('../src/physics.js');

test('A1 six chronological stages cover the complete 108 second arc', async () => {
  const { stageAt, DURATION } = await physics;
  for (let i = 0; i < 6; i++) {
    assert.equal(stageAt(i * 18), i);
    assert.equal(stageAt(i * 18 + 17.999), i);
  }
  assert.equal(DURATION, 108);
  assert.equal(stageAt(DURATION), 5);
});
test('A1 seeking clamps invalid or out-of-range input', async () => {
  const { clampTime } = await physics;
  for (const value of [NaN, Infinity, -10, undefined]) assert.equal(clampTime(value), 0);
  assert.equal(clampTime(400), 108);
  assert.equal(clampTime(53.25), 53.25);
});
test('A1/A3 star approaches, stretches radially and loses its remnant', async () => {
  const { starState } = await physics;
  let previousDistance = Infinity;
  let maxJump = 0;
  let previous = starState(0);
  for (let t = 0; t <= 45; t += .025) {
    const state = starState(t);
    assert.ok(Number.isFinite(state.x + state.z + state.length + state.width));
    const distance = Math.hypot(state.x, state.z);
    assert.ok(distance <= previousDistance + 1e-10, 'approach may not reverse before periapsis');
    maxJump = Math.max(maxJump, Math.hypot(state.x - previous.x, state.z - previous.z));
    previous = state; previousDistance = distance;
  }
  assert.ok(maxJump < .04, 'continuous orbit may not teleport');
  assert.ok(starState(30).length / starState(30).width > 4, 'visible radial tidal stretching');
  assert.equal(starState(45).opacity, 0, 'disrupted star must disappear');
});
test('A2 Schwarzschild capture and escape lie on opposite sides of the shadow', async () => {
  const { tracePhoton } = await physics;
  assert.equal(tracePhoton(2.4).captured, true);
  const escaped = tracePhoton(3.4);
  assert.equal(escaped.captured, false);
  assert.ok(escaped.deflection > .3 && escaped.deflection < 2, 'finite, substantial light bending');
});
test('A2 near-critical light loops farther and straight light has zero bending', async () => {
  const { tracePhoton } = await physics;
  assert.ok(tracePhoton(2.6).crossings > tracePhoton(6).crossings, 'higher-order images need actual looping rays');
  assert.ok(tracePhoton(2.6).steps > tracePhoton(6).steps);
  assert.equal(tracePhoton(3.4, false).deflection, 0);
  assert.equal(tracePhoton(3.4, false).captured, false);
});
test('A7 sustained overload lowers quality after exactly 45 samples', async () => {
  const { AdaptiveQuality } = await physics;
  const quality = new AdaptiveQuality();
  for (let i = 0; i < 44; i++) assert.equal(quality.sample(55, i * 34), false);
  assert.equal(quality.tier, 1);
  assert.equal(quality.sample(55, 44 * 34), true);
  assert.equal(quality.tier, 0);
  for (let i = 45; i < 500; i++) quality.sample(55, i * 34);
  assert.equal(quality.tier, 0, 'quality floor is preserved');
});
test('A7 recovery is slower, honors cooldown and has a ceiling', async () => {
  const { AdaptiveQuality } = await physics;
  const quality = new AdaptiveQuality();
  for (let i = 0; i < 45; i++) quality.sample(50, i * 34);
  for (let i = 0; i < 400; i++) quality.sample(12, 2000 + i);
  assert.equal(quality.tier, 0, '8 second cooldown prevents immediate rebound');
  for (let i = 0; i < 239; i++) assert.equal(quality.sample(12, 11000 + i * 34), false);
  assert.equal(quality.sample(12, 11000 + 239 * 34), true);
  assert.equal(quality.tier, 1);
  for (let i = 0; i < 1800; i++) quality.sample(12, 30000 + i * 34);
  assert.equal(quality.tier, 2);
});
test('A7 alternating load does not oscillate or accumulate nonconsecutive failures', async () => {
  const { AdaptiveQuality } = await physics;
  const quality = new AdaptiveQuality();
  for (let i = 0; i < 2000; i++) quality.sample(i % 2 ? 50 : 12, i * 34);
  assert.equal(quality.tier, 1);
});
