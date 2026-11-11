const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../src/core.js');
const { PROFILES, prepareStress, sampleFrames, observeRenderer, summarize, assess } = require('../tools/default-perf.cjs');

// Real simulation, fake DOM/hook storage only. This does not measure a browser or GPU.
function prepared() {
  const s = C.create({ seed: 5 }), player = s.player;
  let lines = 0, paused = false;
  const window = { QilouCore: C, __qilou: {
    sim: () => s, start: () => { C.start(s); lines = 2; }, setPaused: p => { paused = p; }
  }, dispatchEvent: e => { if (e.type === 'keydown' && e.code === 'Space') lines--; } };
  vm.runInNewContext(`(${prepareStress.toString()})()`, {
    window, document: { getElementById: () => ({ classList: { contains: () => lines > 0 } }) },
    KeyboardEvent: class { constructor(type, data) { this.type = type; Object.assign(this, data); } }
  });
  return { s, player, paused, lines };
}

test('默认档压力状态与现有 setupView(stress) 的真实 core 模拟一致，且保留玩家引用', () => {
  const actual = prepared(), reference = C.create({ seed: 5 });
  const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  const setup = main.match(/function setupView\(v\) \{[\s\S]*?\n\}/)[0];
  vm.runInNewContext(setup + '; setupView("stress");', {
    sim: reference, C, SEED: 5, window: { __qilou: {} }, scene: {}, blobs: [],
    $: () => ({ classList: { add() {}, remove() {} } })
  });
  assert.deepEqual(JSON.parse(JSON.stringify(actual.s)), JSON.parse(JSON.stringify(reference)));
  assert.equal(actual.s.player, actual.player, 'the live character must keep following the player');
  assert.equal(actual.paused, true); assert.equal(actual.lines, 0);
  assert.equal(actual.s.enemies.filter(e => !e.dead).length, 4, 'stress actors really exist');
});

test('采样覆盖完整 10 秒，保留长帧，不把首个回调等待计入帧时间', async () => {
  const times = [7000, 7016, 7032, 7032 + 5000, 17001];
  const sample = await vm.runInNewContext(`(${sampleFrames.toString()})(10000)`, {
    document: { hidden: false }, setTimeout, clearTimeout, cancelAnimationFrame: clearImmediate,
    requestAnimationFrame: cb => setImmediate(() => cb(times.shift()))
  });
  assert.equal(sample.elapsedMs, 10001);
  assert.deepEqual(Array.from(sample.frameTimesMs), [16, 16, 5000, 4969]);
});

test('帧时间统计区分中位数、p99 与最慢 1% 的均值，并拒绝空样本', () => {
  const values = [...Array(198).fill(16), 100, 200], untouched = [...values];
  const stats = summarize(values);
  assert.equal(stats.medianFps, 62.5); assert.equal(stats.p99FrameMs, 16);
  assert.equal(stats.worst1PctMeanFrameMs, 150); assert.deepEqual(values, untouched);
  assert.equal(summarize([20, 10]).medianFrameMs, 15);
  for (const bad of [[], [0], [-1], [NaN], [Infinity]]) assert.throws(() => summarize(bad));
});

function result(profile = PROFILES[1], frameMs = 16) {
  const s = prepared().s;
  const state = {
    url: 'http://127.0.0.1:8961/qilou-brawl/dist/', view: null,
    info: { chars: 5, blobs: 5, backend: 'webgpu' },
    viewport: { width: profile.width, height: profile.height, dpr: profile.dpr, touch: profile.touch },
    canvas: { width: profile.width * profile.dpr, height: profile.height * profile.dpr,
      cssWidth: profile.width, cssHeight: profile.height, pixelRatioX: profile.dpr, pixelRatioY: profile.dpr },
    renderer: { contextType: 'webgpu', rendererString: 'apple / metal-3', identityKnown: true, fallbackAdapter: false },
    simulation: { t: s.t, phase: s.phase, wave: s.wave, practice: s.practice, player: { ...s.player }, enemies: s.enemies },
    hidden: false, dialogue: false
  };
  // Synthetic frame timings exercise the verdict, not hardware performance.
  const frameTimesMs = Array(Math.ceil(10000 / frameMs)).fill(frameMs);
  return { profile, errors: [], before: structuredClone(state), after: structuredClone(state),
    sample: { elapsedMs: frameTimesMs.length * frameMs, frameTimesMs, ...summarize(frameTimesMs) } };
}

test('SPEC 两档阈值：手机 30、桌面 55，中位帧率不达标必须失败', () => {
  for (const profile of PROFILES) {
    assert.equal(assess(result(profile, 1000 / profile.minFps)).pass, true);
    const slow = assess(result(profile, 1000 / (profile.minFps - 1)));
    assert.equal(slow.pass, false, `${profile.name}: below-threshold FPS must fail`);
    assert.ok(slow.failures.some(f => f.includes('SPEC threshold')));
  }
});

test('页面错误、SwiftShader/回退适配器和未知设备身份均不能报性能通过', () => {
  const error = result(); error.errors.push('pageerror: injected');
  assert.equal(assess(error).pass, false); assert.ok(error.failures.includes('pageerror: injected'));
  for (const patch of [
    { rendererString: 'ANGLE (Google, Vulkan SwiftShader Device)' },
    { fallbackAdapter: true }, { identityKnown: false, rendererString: '' }
  ]) {
    const r = result(); Object.assign(r.before.renderer, patch);
    assert.equal(assess(r).pass, false); assert.equal(r.fpsValid, false);
    assert.match(r.fpsInvalidReason, /FPS does not count/);
  }
});

test('错误机位、空验压力场景、短采样和采样中尺寸/模拟变化都失败', () => {
  const mutations = [
    r => { r.before.url += '?view=stress'; }, r => { r.before.view = 'stress'; },
    r => { r.before.viewport.dpr++; }, r => { r.before.viewport.touch = true; },
    r => { r.before.canvas.width = 0; }, r => { r.before.info.blobs = 1; },
    r => { r.before.simulation.enemies.pop(); }, r => { r.before.simulation.wave = 0; },
    r => { r.before.hidden = true; }, r => { r.before.dialogue = true; },
    r => { r.sample.elapsedMs = 9999; }, r => { delete r.sample; },
    r => { r.after.simulation.t += .1; }, r => { r.after.canvas.width--; }
  ];
  mutations.forEach((mutate, i) => { const r = result(); mutate(r); assert.equal(assess(r).pass, false, `invalid measurement ${i} must fail`); });
});

test('渲染器探针保留真实 getContext/requestAdapter 的参数与返回值，只观察实际后端', async () => {
  const options = { antialias: true }, gl = {
    getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 123 }),
    getParameter: key => { assert.equal(key, 123); return 'ANGLE SwiftShader'; }
  };
  const canvas = { id: 'game' }, window = {}, adapter = { info: { vendor: 'apple', architecture: 'metal-3' } };
  const HTMLCanvasElement = { prototype: { getContext(type, opts) {
    assert.equal(this, canvas); assert.equal(type, 'webgl2'); assert.equal(opts, options); return gl;
  } } };
  const navigator = { gpu: { requestAdapter: async opts => { assert.equal(opts, options); return adapter; } } };
  vm.runInNewContext(`(${observeRenderer.toString()})()`, { window, HTMLCanvasElement, navigator });
  assert.equal(HTMLCanvasElement.prototype.getContext.call(canvas, 'webgl2', options), gl);
  assert.equal(window.__qilouPerf.webgl.rendererString, 'ANGLE SwiftShader');
  assert.equal(await navigator.gpu.requestAdapter(options), adapter);
  assert.equal(window.__qilouPerf.webgpu.rendererString, 'apple / metal-3');
});
