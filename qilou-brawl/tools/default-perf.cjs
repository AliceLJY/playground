// Default rendering path, not ?view: mobile 390x664/DPR 2/touch, then desktop 1365x900/DPR 1.
// NODE_PATH="$(npm root -g)" node tools/default-perf.cjs <page-url-without-query> <report.json>
const fs = require('node:fs');
const path = require('node:path');

const PROFILES = [
  { name: 'phone', width: 390, height: 664, dpr: 2, touch: true, minFps: 30 },
  { name: 'desktop', width: 1365, height: 900, dpr: 1, touch: false, minFps: 55 }
];
const SAMPLE_MS = 10000;

// Observe only the contexts/adapters requested by the game; never force another backend.
function observeRenderer() {
  const observed = window.__qilouPerf = { contextType: null, webgl: null, webgpu: null };
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, ...args) {
    const context = getContext.call(this, type, ...args);
    if (context && this.id === 'game') {
      observed.contextType = type;
      if (type.startsWith('webgl')) {
        const ext = context.getExtension('WEBGL_debug_renderer_info');
        observed.webgl = {
          rendererString: context.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : context.RENDERER),
          identityKnown: !!ext, fallbackAdapter: false
        };
      }
    }
    return context;
  };
  if (navigator.gpu) {
    const requestAdapter = navigator.gpu.requestAdapter.bind(navigator.gpu);
    navigator.gpu.requestAdapter = async (...args) => {
      const adapter = await requestAdapter(...args);
      if (adapter) {
        const info = adapter.info;
        const fields = Object.fromEntries(['vendor', 'architecture', 'device', 'description'].map(k => [k, info?.[k] || '']));
        observed.webgpu = {
          adapter: fields, rendererString: Object.values(fields).filter(Boolean).join(' / '),
          identityKnown: Object.values(fields).some(Boolean), fallbackAdapter: adapter.isFallbackAdapter === true
        };
      }
      return adapter;
    };
  }
}

// Same real core simulation as setupView('stress'), but without its DPR/preserve-buffer overrides.
// Run in one browser task so no street-opening enemies reach the character renderer.
function prepareStress() {
  const h = window.__qilou, C = window.QilouCore, s = h.sim(), player = s.player;
  h.start();
  // start() opens dialogue. Clear it through the existing input handler before pausing.
  for (let n = 0; n < 4 && document.getElementById('dialog').classList.contains('on'); n++) {
    for (const type of ['keydown', 'keyup']) window.dispatchEvent(new KeyboardEvent(type, { code: 'Space' }));
  }
  if (document.getElementById('dialog').classList.contains('on')) throw new Error('opening dialogue did not close');
  const initial = C.create({ seed: 5 });
  Object.assign(player, initial.player); // Keep the live player's character reference.
  Object.assign(s, initial, { player });
  C.start(s, { wave: 2 }); player.z = C.WAVES[2].z0 + 4;
  const bot = C.makeBot(35, 1);
  while (s.t < 6 && s.phase === 'fight') C.step(s, bot(s), C.STEP);
  s.events.length = 0;
  h.setPaused(true); // Like the existing stress view: simulation frozen, renderer/animation running.
}

function readState() {
  const h = window.__qilou, s = h.sim(), canvas = document.getElementById('game'), rect = canvas.getBoundingClientRect();
  const observed = window.__qilouPerf;
  const renderer = observed.contextType === 'webgpu' ? observed.webgpu : observed.webgl;
  return {
    url: location.href, view: h.view ?? null, info: h.info(),
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, touch: matchMedia('(pointer:coarse)').matches },
    canvas: { width: canvas.width, height: canvas.height, cssWidth: rect.width, cssHeight: rect.height,
      pixelRatioX: canvas.width / rect.width, pixelRatioY: canvas.height / rect.height },
    renderer: { contextType: observed.contextType, ...renderer },
    simulation: { t: s.t, phase: s.phase, wave: s.wave, practice: s.practice, player: { ...s.player },
      enemies: s.enemies.map(e => ({ ...e })) },
    dialogue: document.getElementById('dialog').classList.contains('on'), hidden: document.hidden
  };
}

// rAF timestamps are real wall time, not info().fps (whose dt is clamped by the game).
function sampleFrames(durationMs) {
  return new Promise((resolve, reject) => {
    const frameTimesMs = [];
    let first, previous, raf;
    const timeout = setTimeout(() => { cancelAnimationFrame(raf); reject(new Error('frame sampling timed out')); }, durationMs + 20000);
    function tick(now) {
      if (document.hidden) { clearTimeout(timeout); reject(new Error('page hidden during frame sampling')); return; }
      if (first === undefined) first = now;
      if (previous !== undefined) frameTimesMs.push(now - previous);
      previous = now;
      if (now - first >= durationMs) {
        clearTimeout(timeout); resolve({ elapsedMs: now - first, frameTimesMs });
      } else raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
  });
}

function summarize(frameTimesMs) {
  if (!frameTimesMs.length || frameTimesMs.some(ms => !Number.isFinite(ms) || ms <= 0)) throw new Error('empty or invalid frame-time sample');
  const sorted = [...frameTimesMs].sort((a, b) => a - b), n = sorted.length;
  const medianFrameMs = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const worst = sorted.slice(-Math.ceil(n * .01));
  return { frames: n, medianFrameMs, medianFps: 1000 / medianFrameMs,
    p99FrameMs: sorted[Math.ceil(n * .99) - 1],
    worst1PctMeanFrameMs: worst.reduce((sum, ms) => sum + ms, 0) / worst.length };
}

function assess(result) {
  const failures = [...result.errors];
  const before = result.before, after = result.after, sample = result.sample, profile = result.profile;
  const renderer = before?.renderer;
  const software = /swiftshader/i.test(renderer?.rendererString || '') || renderer?.fallbackAdapter === true;
  result.fpsValid = !!renderer?.identityKnown && !software;
  result.fpsInvalidReason = software ? 'software renderer (SwiftShader/fallback adapter); FPS does not count'
    : result.fpsValid ? null : 'actual renderer identity unavailable; FPS does not count';
  if (!result.fpsValid) failures.push(result.fpsInvalidReason);
  for (const [label, state] of [['before', before], ['after', after]]) {
    if (!state) { failures.push(`${label}: missing rendering state`); continue; }
    if (new URL(state.url).search || state.view !== null) failures.push(`${label}: not the normal entry without query parameters`);
    const v = state.viewport, c = state.canvas;
    if (v.width !== profile.width || v.height !== profile.height || v.dpr !== profile.dpr || v.touch !== profile.touch) failures.push(`${label}: wrong viewport/DPR/touch mode`);
    if (!(c.width > 0 && c.height > 0 && c.cssWidth === profile.width && c.cssHeight === profile.height)) failures.push(`${label}: empty or incorrectly sized canvas`);
    const s = state.simulation, live = s.enemies.filter(e => !e.dead);
    if (state.hidden || state.dialogue || s.phase !== 'fight' || s.wave !== 2 || s.practice || s.t < 6 || s.t > 6.1 ||
      live.length !== 4 || live.filter(e => e.kind === 'baozugong').length !== 2 || live.filter(e => e.kind === 'apo').length !== 2 ||
      state.info.chars !== 5 || state.info.blobs !== 5) failures.push(`${label}: stress scene not rendered (wave 2, player + 2 landlords + 2 grannies required)`);
  }
  if (before && after && (JSON.stringify(before.simulation) !== JSON.stringify(after.simulation) || JSON.stringify(before.canvas) !== JSON.stringify(after.canvas))) failures.push('stress simulation or canvas size changed during sampling');
  if (!sample || sample.elapsedMs < SAMPLE_MS) failures.push('less than 10 continuous seconds sampled');
  // Compare frame times to avoid 1000 / (1000 / 55) rounding just below 55 at the boundary.
  if (!sample || !(sample.medianFrameMs <= 1000 / profile.minFps)) failures.push(`median FPS below SPEC threshold ${profile.minFps}`);
  result.failures = failures; result.pass = failures.length === 0;
  return result;
}

async function measure(browser, url, profile) {
  const result = { profile, errors: [] };
  let context;
  try {
    context = await browser.newContext({ viewport: { width: profile.width, height: profile.height },
      deviceScaleFactor: profile.dpr, hasTouch: profile.touch, isMobile: profile.touch });
    const page = await context.newPage();
    page.setDefaultTimeout(90000);
    page.on('pageerror', e => result.errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') result.errors.push('console: ' + m.text()); });
    await page.addInitScript(observeRenderer);
    await page.goto(url);
    await page.waitForFunction(() => window.__qilou?.ready || window.__qilou?.error, null, { polling: 200, timeout: 90000 });
    const error = await page.evaluate(() => window.__qilou.error);
    if (error) throw new Error(error);
    // The published page bundles core.js; inject the same local source only for fixture preparation.
    await page.addScriptTag({ path: path.join(__dirname, '../src/core.js') });
    await page.evaluate(prepareStress);
    await page.waitForFunction(() => { const i = window.__qilou.info(); return i.chars === 5 && i.blobs === 5; }, null, { polling: 200, timeout: 90000 });
    await page.waitForTimeout(3000); // Finish character uploads/shader warmup; no clock or resolution overrides.
    result.before = await page.evaluate(readState);
    const sample = await page.evaluate(sampleFrames, SAMPLE_MS);
    result.sample = { ...sample, ...summarize(sample.frameTimesMs) };
    result.after = await page.evaluate(readState);
  } catch (e) { result.errors.push('tool: ' + e.message); }
  finally { if (context) await context.close().catch(e => result.errors.push('close: ' + e.message)); }
  return assess(result);
}

async function main() {
  const [base, out] = process.argv.slice(2);
  if (!base || !out) throw new Error('Usage: node tools/default-perf.cjs <page-url-without-query> <report.json>');
  const url = new URL(base);
  if (!['http:', 'https:'].includes(url.protocol) || url.search || url.hash) throw new Error('Use an HTTP(S) normal entry URL without query parameters or fragment');
  const report = { url: url.href, sampledAt: new Date().toISOString(), sampleTargetMs: SAMPLE_MS,
    scenario: 'seed 5; setupView(stress) core simulation to 6 s; simulation paused, default renderer/animation running',
    results: [], errors: [] };
  let browser;
  try {
    const { chromium } = require('playwright');
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
    report.browser = browser.version();
    for (const profile of PROFILES) report.results.push(await measure(browser, url.href, profile)); // One GPU workload at a time.
  } catch (e) { report.errors.push(e.message); }
  finally { if (browser) await browser.close().catch(e => report.errors.push('close: ' + e.message)); }
  report.pass = !report.errors.length && report.results.length === PROFILES.length && report.results.every(r => r.pass);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.pass ? 0 : 1;
}

module.exports = { PROFILES, observeRenderer, prepareStress, sampleFrames, summarize, assess };
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
