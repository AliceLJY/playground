const assert = require('node:assert/strict');
const { before, test } = require('node:test');
const { readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = readFileSync(path.join(root, 'index.html'), 'utf8');
let THREE, rules, pixelStats;
function between(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `Missing page source section: ${start}`);
  return source.slice(a, b);
}
before(async () => {
  THREE = await import(`data:text/javascript;base64,${readFileSync(path.join(root, 'vendor/three.module.js')).toString('base64')}`);
  rules = await import('../tools/acceptance.mjs');
  pixelStats = new Function(between('    function pixelStats(', '    function sampleMaterials(') + '; return pixelStats;')();
});
function simulation() {
  // Real page updates, freeze, snapshot and r160 Groups/camera; DOM, wall
  // clock, OrbitControls and GPU are stubs. This is not a browser/pixel test.
  return new Function('THREE', [
    'let paused = false, pendingStep = .25, timeScale = 180;',
    'const [shaftCenter, shaftGreat, shaftThird, shaftEscape, shaftMinuteWork, shaftHour, shaftBalance] = Array.from({length:7}, () => new THREE.Group());',
    'const camera = new THREE.PerspectiveCamera(42, 16/9, .1, 1000);',
    'const controls = {enableDamping:true, target:new THREE.Vector3(), update(){camera.lookAt(this.target);}};',
    'const slider = {}, speedVal = {}, stepButton = {}, pauseButton = {setAttribute(){}};',
    'const clock = {getDelta(){return .123;}}, renderer = {render(){}};',
    'const scene = {}; function updateLabels() {}',
    between('let centerWheelAngle =', 'function animate()'),
    between('    const snapshot = () =>', '    function freeze('),
    between('    function freeze(', '    // sRGB framebuffer'),
    'return {snapshot, freeze, advanceSimulation};'
  ].join('\n'))(THREE);
}
test('freeze replays actual shafts at the same time after different playback histories', () => {
  for (const [view, w, h] of [['wide', 1440, 810], ['close', 1440, 810], ['phone', 390, 664]]) {
    const sim = simulation(), request = rules.shotRequest(view, w, h);
    sim.advanceSimulation(.13); sim.advanceSimulation(21.7);
    const first = sim.freeze(request);
    rules.assertFrozen(first, request);
    sim.advanceSimulation(31.111); sim.advanceSimulation(.07);
    const second = sim.freeze(request);
    rules.assertFrozen(second, request);
    assert.deepEqual(second, first, 'Loading history must not change the shot');
    sim.advanceSimulation(0);
    assert.deepEqual(sim.snapshot(), first, 'Paused frames retain every shaft pose');
  }
});
test('capture rejects simulation drift, wrong shaft/camera and page errors', () => {
  const sim = simulation(), request = rules.shotRequest('wide', 1440, 810);
  const good = sim.freeze(request);
  sim.advanceSimulation(.25);
  assert.throws(() => rules.assertFrozen(sim.snapshot(), request), /Freeze time/);
  assert.throws(() => rules.assertFrozen({...good, angles: {...good.angles, escape: 0}}, request), /shaft mismatch: escape/);
  assert.throws(() => rules.assertFrozen({...good, camera: [0, 0, 20]}, request), /camera mismatch/);
  assert.throws(() => rules.assertFrozen({...good, direction: [1, 0, 0]}, request), /camera direction/);
  assert.throws(() => rules.assertFrozen(good, request, ['injected exception']), /Page errors/);
});
function buffers(size = 64) {
  const subject = new Uint8Array(size * size * 4).fill(240);
  const background = new Uint8Array(size * size * 4).fill(200);
  const mask = new Uint8Array(size * size * 4);
  for (let y = 8; y < size - 8; y++) for (let x = 8; x < size - 8; x++)
    mask.fill(255, (y * size + x) * 4, (y * size + x + 1) * 4);
  return {subject, background, mask, size};
}
function stats(b) { return pixelStats(b.subject, b.background, b.mask, b.size, b.size); }
test('pixel metric excludes background, holes and one-pixel silhouette borders', () => {
  const b = buffers();
  for (let y = 8; y < 56; y++) for (let x = 8; x < 56; x++) {
    const i = (y * b.size + x) * 4;
    b.subject.fill(x === 8 || x === 55 || y === 8 || y === 55 ? 0 : 130, i, i + 3);
  }
  b.mask.fill(0, (32 * b.size + 32) * 4, (32 * b.size + 33) * 4); // A hole, also eroded by one pixel.
  const s = stats(b);
  assert.equal(s.samples, 46 * 46 - 9);
  assert.ok(s.range < 1e-9, 'Outline/background must not make a flat wheel pass');
  assert.equal(s.highlightFraction, 0);
  assert.deepEqual(rules.materialFailures(s), ['range']);
  b.mask.fill(0);
  assert.equal(stats(b).samples, 0, 'Blank render must never pass');
  assert.ok(rules.materialFailures(stats(b)).includes('samples'));
});
test('pixel threshold requires contrast (highlights are measured but not required, see MATERIAL_LIMITS)', () => {
  const b = buffers();
  for (let y = 9; y < 55; y++) for (let x = 9; x < 55; x++) {
    const i = (y * b.size + x) * 4;
    b.subject.fill(x < 32 ? 90 : 230, i, i + 3);
  }
  assert.deepEqual(rules.materialFailures(stats(b)), []);
  b.subject.fill(230);
  assert.deepEqual(rules.materialFailures(stats(b)), ['range']);
  for (let i = 0; i < b.subject.length; i += 4) b.subject.fill(i % 8 ? 80 : 50, i, i + 3);
  assert.deepEqual(rules.materialFailures(stats(b)), ['range'], 'a 30-level spread is below the calibrated 50');
  assert.throws(() => pixelStats([], [], [], 4, 4), /Invalid pixel buffers/);
});
test('shots CLI exits nonzero for a late page error or wrong frozen pose', () => {
  const sim = simulation(), request = rules.shotRequest('wide', 1440, 810);
  const good = sim.freeze(request);
  // Run the real CLI/rules; replace only Playwright and artifact writes.
  // No browser is launched and no screenshot/report is written.
  for (const scenario of ['clean', 'error', 'console', 'pose']) {
    const script = `
      const Module = require('node:module'), original = Module._load;
      const state = ${JSON.stringify(good)}, scenario = ${JSON.stringify(scenario)};
      let handlers = {};
      const page = {
        on(name, fn) { handlers[name] = fn; }, route: async () => {}, goto: async () => {}, waitForFunction: async () => {},
        async evaluate(fn, request) {
          if (request) {
            state.camera = request.camera; state.target = request.target;
            const length = Math.hypot(...request.target.map((v, i) => v - request.camera[i]));
            state.direction = request.target.map((v, i) => (v - request.camera[i]) / length);
            if (scenario === 'pose') state.angles.escape += 1;
          }
          return fn.toString().includes('devicePixelRatio') ? 1 : structuredClone(state);
        },
        async screenshot() {
          if (scenario === 'error') handlers.pageerror(Error('late injected exception'));
          if (scenario === 'console') handlers.console({type: () => 'error', text: () => 'late injected exception'});
        }
      };
      Module._load = function(name, ...args) {
        if (name === 'playwright') return {chromium: {launch: async () => ({
          version: () => 'test double, no browser', newContext: async () => ({newPage: async () => page, close: async () => {}}), close: async () => {}
        })}};
        if (name === 'node:fs') return {mkdirSync(){}, writeFileSync(file, data){ console.log('REPORT ' + data); }};
        return original.call(this, name, ...args);
      };
      process.argv = ['node', 'shots.cjs', 'http://127.0.0.1/clockwork/', 'unused-test-output'];
      require(${JSON.stringify(path.join(root, 'tools/shots.cjs'))});
    `;
    const result = spawnSync(process.execPath, ['-e', script], {encoding: 'utf8'});
    assert.equal(result.status, scenario === 'clean' ? 0 : 1, result.stderr + result.stdout);
    if (scenario !== 'clean') assert.match(result.stderr, scenario === 'pose' ? /shaft mismatch: escape/ : /Page errors: late injected exception/);
    assert.match(result.stdout, /REPORT /, 'Report must be written on failure too');
  }
});
