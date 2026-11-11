import * as THREE from 'three';
import { DURATION, STAGES, QUALITIES, VIEWS, clampTime, stageAt, starState, AdaptiveQuality } from './physics.js';
import { fullscreenVertex, computeFragment, atlasVertex, atlasFragment, traceFragment, compositeFragment } from './shaders.js';

const $ = (selector) => document.querySelector(selector);
const canvas = $('#scene');
const params = new URLSearchParams(location.search);
const mobile = matchMedia('(max-width: 700px)').matches;
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'low-power' });
  if (!renderer.extensions.has('EXT_color_buffer_float')) throw new Error('需要支持浮点渲染目标的 WebGL 2 浏览器。');
} catch (error) {
  $('#fail').hidden = false;
  $('#fail').textContent = `无法启动实时模拟。${error.message}`;
  throw error;
}
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.25 : 1.5));
renderer.setClearColor(0, 0);
renderer.info.autoReset = false;
const gl = renderer.getContext();
const debug = gl.getExtension('WEBGL_debug_renderer_info');
const rendererName = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
const timerExtension = gl.getExtension('EXT_disjoint_timer_query_webgl2');
const timerSlots = timerExtension ? Array.from({ length: 4 }, () => ({ query: gl.createQuery(), pending: false })) : [];
let activeQuery = null;
let gpuMs = 0;
const gpuSamples = new Float32Array(180);
let gpuSampleIndex = 0;
const screenGeometry = new THREE.BufferGeometry();
screenGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-1,-1,0, 3,-1,0, -1,3,0],3));
const camera = new THREE.Camera();
function material(vertexShader, fragmentShader, uniforms) {
  return new THREE.RawShaderMaterial({ vertexShader, fragmentShader, uniforms, glslVersion: THREE.GLSL3, depthTest: false, depthWrite: false });
}
function pass(fragment, uniforms) {
  const mesh = new THREE.Mesh(screenGeometry, material(fullscreenVertex, fragment, uniforms));
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  return { scene, material: mesh.material };
}
const uniforms = {
  uTime: { value: 0 }, uSeed: { value: 19 }, uSide: { value: 96 }, uAtlas: { value: 512 },
  uState: { value: null }, uDensity: { value: null }, uMoments: { value: null },
  uCamera: { value: new THREE.Vector3() }, uForward: { value: new THREE.Vector3() },
  uRight: { value: new THREE.Vector3() }, uUp: { value: new THREE.Vector3() },
  uStar: { value: new THREE.Vector3() }, uStarShape: { value: new THREE.Vector4() },
  uAspect: { value: 1 },
  uSteps: { value: 144 }, uBending: { value: 1 }, uDiskOnly: { value: 0 }
};
const compute = pass(computeFragment, uniforms);
const trace = pass(traceFragment, uniforms);
const composite = pass(compositeFragment, { uScene: { value: null }, uTexel: { value: new THREE.Vector2() } });
const atlasMaterial = material(atlasVertex, atlasFragment, uniforms);
atlasMaterial.transparent = true;
atlasMaterial.blending = THREE.CustomBlending;
atlasMaterial.blendSrc = THREE.OneFactor;
atlasMaterial.blendDst = THREE.OneFactor;
atlasMaterial.blendEquation = THREE.AddEquation;
const debris = new THREE.Points(new THREE.BufferGeometry(), atlasMaterial);
debris.frustumCulled = false;
const atlasScene = new THREE.Scene();
atlasScene.add(debris);
let stateTarget, atlasTarget, rayTarget;
const adaptive = new AdaptiveQuality();
let qualityMode = 'auto';
let qualityChanges = 0;
let appliedTier = -1;
function allocateQuality() {
  const tier = adaptive.tier;
  const quality = QUALITIES[tier];
  if (appliedTier !== tier) {
    stateTarget?.dispose(); atlasTarget?.dispose();
    stateTarget = new THREE.WebGLRenderTarget(quality.side, quality.side, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
    atlasTarget = new THREE.WebGLRenderTarget(quality.atlas, quality.atlas, { count: 2, type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    debris.geometry.dispose();
    const ids = new Float32Array(quality.side * quality.side * 3);
    for (let i = 0; i < quality.side * quality.side; i++) ids[i * 3] = i;
    debris.geometry = new THREE.BufferGeometry();
    debris.geometry.setAttribute('position', new THREE.BufferAttribute(ids, 3));
    uniforms.uState.value = stateTarget.texture;
    uniforms.uDensity.value = atlasTarget.textures[0];
    uniforms.uMoments.value = atlasTarget.textures[1];
    uniforms.uSide.value = quality.side;
    uniforms.uAtlas.value = quality.atlas;
    uniforms.uSteps.value = quality.steps;
    appliedTier = tier;
    qualityChanges++;
  }
  const width = Math.max(1, Math.round(innerWidth * renderer.getPixelRatio() * quality.scale));
  const height = Math.max(1, Math.round(innerHeight * renderer.getPixelRatio() * quality.scale));
  if (!rayTarget) rayTarget = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, depthBuffer: false });
  rayTarget.setSize(width, height);
  composite.material.uniforms.uScene.value = rayTarget.texture;
  composite.material.uniforms.uTexel.value.set(1 / width, 1 / height);
}
const orbit = { yaw: .16, elevation: .245, distance: 29 };
let actualView = 'free';
let time = 0;
let playing = true;
let speed = 1;
let dirty = true;
let visible = true;
let inViewport = true;
let raf = 0;
let lastTick = 0;
let lastDraw = 0;
let previousInterval = 33.3;
let frames = 0;
let lastJsMs = 0;
let draws = 0, triangles = 0, points = 0;
let fps = 0;
let fpsStart = 0, fpsFrames = 0;
const jsSamples = new Float32Array(180);
let sampleIndex = 0;
const star = {};
const yAxis = new THREE.Vector3(0, 1, 0);
const timeInput = $('#timeline');
const playButton = $('#play');
const stageButtons = [];
for (let i = 0; i < STAGES.length; i++) {
  const button = document.createElement('button');
  button.innerHTML = `${STAGES[i][0]}<small>${STAGES[i][1]}</small>`;
  button.addEventListener('click', () => seek(i * 18 + 3));
  $('.stages').append(button);
  stageButtons.push(button);
}
let previousStage = -1;
let lastUiTime = -1;
function updateUI() {
  const stage = stageAt(time);
  if (stage !== previousStage) {
    $('#stage-name').textContent = STAGES[stage][0];
    $('#stage-en').textContent = STAGES[stage][1];
    $('#stage-caption').textContent = STAGES[stage][2];
    $('#physics-stage').textContent = STAGES[stage][0];
    $('#physics-copy').textContent = STAGES[stage][3];
    stageButtons.forEach((button, index) => button.setAttribute('aria-current', String(index === stage)));
    previousStage = stage;
  }
  timeInput.value = time.toFixed(1);
  timeInput.style.setProperty('--progress', `${time / DURATION * 100}%`);
  const seconds = Math.floor(time);
  $('#clock').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')} / 01:48`;
  playButton.textContent = playing ? 'Ⅱ 暂停' : time >= DURATION ? '↺ 重播' : '▷ 播放';
  playButton.setAttribute('aria-label', playing ? '暂停' : time >= DURATION ? '重播' : '播放');
  $('#quality-readout').textContent = `${QUALITIES[adaptive.tier].name} · ${QUALITIES[adaptive.tier].steps} 步光路`;
  lastUiTime = time;
}
function pollGpu() {
  if (!timerExtension) return;
  for (const slot of timerSlots) {
    if (slot.pending && gl.getQueryParameter(slot.query, gl.QUERY_RESULT_AVAILABLE)) {
      if (!gl.getParameter(timerExtension.GPU_DISJOINT_EXT)) {
        gpuMs = gl.getQueryParameter(slot.query, gl.QUERY_RESULT) / 1e6;
        gpuSamples[gpuSampleIndex++ % gpuSamples.length] = gpuMs;
      }
      slot.pending = false;
    }
  }
}
function render() {
  const start = performance.now();
  pollGpu();
  activeQuery = null;
  if (timerExtension) {
    for (const slot of timerSlots) {
      if (!slot.pending) { activeQuery = slot; break; }
    }
    if (activeQuery) gl.beginQuery(timerExtension.TIME_ELAPSED_EXT, activeQuery.query);
  }
  uniforms.uTime.value = time;
  const horizontal = Math.cos(orbit.elevation) * orbit.distance;
  uniforms.uCamera.value.set(Math.sin(orbit.yaw) * horizontal, Math.sin(orbit.elevation) * orbit.distance, Math.cos(orbit.yaw) * horizontal);
  uniforms.uForward.value.copy(uniforms.uCamera.value).normalize().negate();
  uniforms.uRight.value.crossVectors(uniforms.uForward.value, yAxis).normalize();
  uniforms.uUp.value.crossVectors(uniforms.uRight.value, uniforms.uForward.value).normalize();
  starState(time, star);
  uniforms.uStar.value.set(star.x, 0, star.z);
  uniforms.uStarShape.value.set(star.length, star.width, star.angle, star.opacity);
  renderer.info.reset();
  renderer.setRenderTarget(stateTarget);
  renderer.render(compute.scene, camera);
  renderer.setRenderTarget(atlasTarget);
  renderer.clear();
  renderer.render(atlasScene, camera);
  renderer.setRenderTarget(rayTarget);
  renderer.render(trace.scene, camera);
  renderer.setRenderTarget(null);
  renderer.render(composite.scene, camera);
  if (activeQuery) {
    gl.endQuery(timerExtension.TIME_ELAPSED_EXT);
    activeQuery.pending = true;
  }
  draws = renderer.info.render.calls;
  triangles = renderer.info.render.triangles;
  points = renderer.info.render.points;
  frames++;
  fpsFrames++;
  const now = performance.now();
  if (now - fpsStart > 2000) {
    fps = fpsFrames * 1000 / (now - fpsStart);
    fpsStart = now; fpsFrames = 0;
  }
  lastJsMs = performance.now() - start;
  if (frames > 4) jsSamples[sampleIndex++ % jsSamples.length] = lastJsMs;
  dirty = false;
}
function frame(now) {
  raf = 0;
  if (!visible || !inViewport || document.hidden) { lastTick = 0; return; }
  if (!lastTick) lastTick = now;
  const delta = Math.min(100, now - lastTick);
  lastTick = now;
  if (playing) {
    time = clampTime(time + delta * .001 * speed);
    if (time >= DURATION) playing = false;
    dirty = true;
  }
  if (dirty && now - lastDraw >= 32.5) {
    previousInterval = lastDraw ? now - lastDraw : 33.3;
    render();
    if (qualityMode === 'auto' && playing && frames > 5) {
      const load = Math.max(gpuMs, lastJsMs, previousInterval - 16.7);
      if (adaptive.sample(load, now)) allocateQuality();
    }
    lastDraw = now;
    if (Math.abs(time - lastUiTime) > .1 || !playing) updateUI();
  }
  if (playing || dirty) raf = requestAnimationFrame(frame);
}
function wake() {
  dirty = true;
  if (!raf && visible && inViewport && !document.hidden) {
    lastTick = 0;
    raf = requestAnimationFrame(frame);
  }
}
function seek(value) {
  time = clampTime(value);
  updateUI(); wake();
}
function togglePlay() {
  if (time >= DURATION) time = 0;
  playing = !playing;
  updateUI(); wake();
}
playButton.addEventListener('click', togglePlay);
timeInput.addEventListener('input', () => seek(Number(timeInput.value)));
$('#speed').addEventListener('change', (event) => { speed = Number(event.target.value); wake(); });
$('#quality').addEventListener('change', (event) => {
  qualityMode = event.target.value;
  if (qualityMode !== 'auto') adaptive.tier = Number(qualityMode);
  adaptive.slow = 0; adaptive.fast = 0; adaptive.cooldown = performance.now() + 8000;
  allocateQuality(); updateUI(); wake();
});
function chooseView(name, presetTime = false) {
  const preset = VIEWS[name];
  if (!preset) return;
  orbit.yaw = preset.yaw; orbit.elevation = preset.elevation; orbit.distance = preset.distance;
  actualView = name;
  document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === name)));
  if (presetTime) { time = preset.time; playing = false; }
  updateUI(); wake();
}
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => chooseView(button.dataset.view)));
const panel = $('#panel');
function setPanel(open) {
  panel.hidden = !open;
  document.body.classList.toggle('explaining', open);
  $('#physics').setAttribute('aria-expanded', String(open));
  if (open) $('#close-panel').focus(); else $('#physics').focus();
}
$('#physics').addEventListener('click', () => setPanel(panel.hidden));
$('#close-panel').addEventListener('click', () => setPanel(false));
addEventListener('keydown', event => {
  if (event.code === 'Escape') setPanel(false);
  if (['INPUT', 'SELECT', 'BUTTON'].includes(document.activeElement.tagName)) return;
  if (event.code === 'Space') { event.preventDefault(); togglePlay(); }
  if (event.code === 'ArrowRight') seek(time + 5);
  if (event.code === 'ArrowLeft') seek(time - 5);
});
const pointers = new Map();
let lastPinch = 0;
canvas.addEventListener('pointerdown', event => {
  canvas.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  lastPinch = 0;
});
canvas.addEventListener('pointermove', event => {
  const pointer = pointers.get(event.pointerId);
  if (!pointer) return;
  if (pointers.size === 1) {
    orbit.yaw -= (event.clientX - pointer.x) * .005;
    orbit.elevation = THREE.MathUtils.clamp(orbit.elevation + (event.clientY - pointer.y) * .004, -.95, 1.25);
  }
  pointer.x = event.clientX; pointer.y = event.clientY;
  if (pointers.size === 2) {
    const iterator = pointers.values();
    const a = iterator.next().value, b = iterator.next().value;
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    if (lastPinch > 0 && distance > 0) orbit.distance = THREE.MathUtils.clamp(orbit.distance * lastPinch / distance, 15, 54);
    lastPinch = distance;
  }
  actualView = 'free';
  document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', 'false'));
  wake();
});
function releasePointer(event) { pointers.delete(event.pointerId); lastPinch = 0; }
canvas.addEventListener('pointerup', releasePointer);
canvas.addEventListener('pointercancel', releasePointer);
canvas.addEventListener('lostpointercapture', releasePointer);
canvas.addEventListener('wheel', event => {
  event.preventDefault();
  orbit.distance = THREE.MathUtils.clamp(orbit.distance * Math.exp(event.deltaY * .001), 15, 54);
  actualView = 'free'; wake();
}, { passive: false });
addEventListener('blur', () => { pointers.clear(); lastPinch = 0; });
function suspend() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0; lastTick = 0; lastDraw = 0;
  pointers.clear();
}
document.addEventListener('visibilitychange', () => {
  visible = !document.hidden;
  if (visible) wake(); else suspend();
});
addEventListener('pagehide', suspend);
addEventListener('pageshow', () => { visible = !document.hidden; wake(); });
const observer = new IntersectionObserver(entries => {
  inViewport = entries[0].isIntersecting;
  if (inViewport) wake(); else suspend();
});
observer.observe(canvas);
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  uniforms.uAspect.value = innerWidth / innerHeight;
  allocateQuality(); wake();
}
addEventListener('resize', resize);
canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault(); suspend();
  $('#fail').textContent = '图形上下文已中断，请刷新页面继续。';
  $('#fail').hidden = false;
});
resize();
if (VIEWS[params.get('view')]) chooseView(params.get('view'), true);
updateUI();
render();
const diagnostics = params.has('test');
window.__PLAYTEST__ = {
  ready: true,
  snapshot() {
    const samples = Array.from(jsSamples.subarray(0, Math.min(sampleIndex, jsSamples.length))).sort((a,b) => a-b);
    const gpu = Array.from(gpuSamples.subarray(0, Math.min(gpuSampleIndex, gpuSamples.length))).sort((a,b) => a-b);
    return {
      time, duration: DURATION, stage: stageAt(time) + 1, stageName: STAGES[stageAt(time)][0], playing, speed,
      view: actualView, camera: { ...orbit }, seed: uniforms.uSeed.value,
      quality: QUALITIES[adaptive.tier].name, tier: adaptive.tier, qualityMode, qualityChanges,
      resolutionScale: rayTarget.width / canvas.width, raySteps: uniforms.uSteps.value,
      rayResolution: [rayTarget.width, rayTarget.height], drawingBuffer: [canvas.width, canvas.height],
      dpr: renderer.getPixelRatio(), particleCount: points, atlasSize: atlasTarget.width,
      drawCalls: draws, triangles, frames, fps, jsMs: lastJsMs,
      jsP95: samples[Math.floor(samples.length * .95)] || 0, gpuMs: timerExtension ? gpuMs : null,
      gpuSampleCount: gpuSampleIndex, gpuSamplesMs: gpu,
      gpuMedianMs: gpu.length ? (gpu[Math.floor((gpu.length - 1) / 2)] + gpu[Math.floor(gpu.length / 2)]) * .5 : null,
      renderer: rendererName, softwareRenderer: /swiftshader|llvmpipe/i.test(rendererName),
      visible: visible && inViewport && !document.hidden, scheduled: Boolean(raf),
      lensing: uniforms.uBending.value === 1, star: { ...star }
    };
  },
  reset() { time = 0; playing = true; uniforms.uSeed.value = 19; updateUI(); wake(); },
  setSeed(value) { if (Number.isFinite(value)) { uniforms.uSeed.value = Math.abs(Math.floor(value)) % 100000; wake(); } },
  step(ms) { if (Number.isFinite(ms)) { time = clampTime(time + Math.max(0, ms) / 1000); playing = false; updateUI(); render(); dirty = false; } }
};
// Extra measurement controls exist only behind the explicit acceptance URL flag.
if (diagnostics) {
  window.__TDE_TEST__ = {
    capture(reference = false) {
      if (playing) throw new Error('Pause before capturing a same-frame reference.');
      const savedRay = rayTarget, savedAtlas = atlasTarget;
      try {
        if (reference) {
          rayTarget = new THREE.WebGLRenderTarget(canvas.width, canvas.height, { type: THREE.HalfFloatType, depthBuffer: false });
          atlasTarget = new THREE.WebGLRenderTarget(Math.max(1024, savedAtlas.width), Math.max(1024, savedAtlas.height), { count: 2, type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
          uniforms.uAtlas.value = atlasTarget.width;
          uniforms.uDensity.value = atlasTarget.textures[0];
          uniforms.uMoments.value = atlasTarget.textures[1];
          composite.material.uniforms.uScene.value = rayTarget.texture;
          composite.material.uniforms.uTexel.value.set(1 / rayTarget.width, 1 / rayTarget.height);
        }
        render();
        return { image: canvas.toDataURL('image/png'), state: window.__PLAYTEST__.snapshot() };
      } finally {
        if (reference) { rayTarget.dispose(); atlasTarget.dispose(); }
        rayTarget = savedRay; atlasTarget = savedAtlas;
        uniforms.uAtlas.value = atlasTarget.width;
        uniforms.uDensity.value = atlasTarget.textures[0];
        uniforms.uMoments.value = atlasTarget.textures[1];
        composite.material.uniforms.uScene.value = rayTarget.texture;
        composite.material.uniforms.uTexel.value.set(1 / rayTarget.width, 1 / rayTarget.height);
        if (reference) render();
      }
    },
    seek(value) { playing = false; seek(value); render(); },
    view(name) { chooseView(name, true); render(); },
    lensing(enabled) { uniforms.uBending.value = enabled ? 1 : 0; render(); },
    quality(tier) { if (Number.isInteger(tier) && tier >= 0 && tier <= 2) { adaptive.tier = tier; allocateQuality(); render(); } },
    adaptive(ms, count, start = 100000) {
      let changes = 0;
      for (let i = 0; i < count; i++) if (adaptive.sample(ms, start + i * 34)) changes++;
      allocateQuality(); render();
      return { changes, tier: adaptive.tier, cooldown: adaptive.cooldown };
    },
    pixels() {
      const buffer = new Uint16Array(rayTarget.width * rayTarget.height * 4);
      renderer.readRenderTargetPixels(rayTarget, 0, 0, rayTarget.width, rayTarget.height, buffer);
      return { width: rayTarget.width, height: rayTarget.height, pixels: Array.from(buffer) };
    },
    particles() {
      const quality = QUALITIES[adaptive.tier];
      const buffer = new Float32Array(quality.side * quality.side * 4);
      renderer.readRenderTargetPixels(stateTarget, 0, 0, quality.side, quality.side, buffer);
      return Array.from(buffer);
    },
    density() {
      const buffer = new Uint16Array(atlasTarget.width * atlasTarget.height * 4);
      renderer.readRenderTargetPixels(atlasTarget, 0, 0, atlasTarget.width, atlasTarget.height, buffer);
      let nonzero = 0;
      for (let i = 3; i < buffer.length; i += 4) if (buffer[i]) nonzero++;
      return { nonzero, total: buffer.length / 4 };
    },
    collisions() {
      const buffer = new Uint16Array(atlasTarget.width * atlasTarget.height * 4);
      renderer.readRenderTargetPixels(atlasTarget, 0, 0, atlasTarget.width, atlasTarget.height, buffer, 0, 1);
      let maxVariance = 0, crossingPixels = 0;
      for (let i = 0; i < buffer.length; i += 4) {
        const weight = THREE.DataUtils.fromHalfFloat(buffer[i + 3]);
        if (weight < .1) continue;
        const vx = THREE.DataUtils.fromHalfFloat(buffer[i]) / weight;
        const vz = THREE.DataUtils.fromHalfFloat(buffer[i + 1]) / weight;
        const variance = Math.max(0, THREE.DataUtils.fromHalfFloat(buffer[i + 2]) / weight - vx * vx - vz * vz);
        maxVariance = Math.max(maxVariance, variance);
        if (variance > .09) crossingPixels++;
      }
      return { maxVariance, crossingPixels };
    },
    sleep(enabled) { inViewport = !enabled; if (enabled) suspend(); else wake(); }
  };
}
wake();
