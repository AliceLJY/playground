import * as THREE from 'three';
import { createSim, cameraFor, safeFor, posePoints, integrity, playScene, SCENES, STEP, FEATHERS, EYE_SIZE, screenToGround } from './core.js';
import { buildPeacock, buildStage, PALETTE } from './peacock.js';
import { createAudio } from './audio.js';

const params = new URLSearchParams(location.search);
const requestedScene = SCENES.includes(params.get('scene')) ? params.get('scene') : null;
const fail = document.querySelector('#fail');
const canvas = document.querySelector('#scene');
const coarse = () => matchMedia('(pointer:coarse)').matches;
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (error) {
  fail.hidden = false; fail.textContent = '无法启动三维画面：' + error.message;
  window.__PLAYTEST__ = { ready: false, error: String(error.message) };
  throw error;
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
// Neutral rather than ACES: ACES pulls deep teal and dark gold toward grey.
renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.info.autoReset = false;
const gl = renderer.getContext(), dbg = gl.getExtension('WEBGL_debug_renderer_info');
const gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.ivory);
scene.fog = new THREE.Fog(PALETTE.ivory, 14, 30);
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.3, 80);
const bird = buildPeacock(); scene.add(bird.root);
const stage = buildStage(); scene.add(stage.group);
const key = new THREE.DirectionalLight('#fff3e0', 2.1);
key.position.set(-3.5, 6, 4.5); key.castShadow = true; key.shadow.mapSize.set(coarse() ? 1024 : 2048, coarse() ? 1024 : 2048);
Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 20 }); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 4;
const fill = new THREE.HemisphereLight('#fff6e6', '#b9a184', 1.25);
const rim = new THREE.DirectionalLight('#d8e8e0', 0.6); rim.position.set(4, 3, -5);
scene.add(key, key.target, fill, rim);

// ---- state ----
let seed = Number(params.get('seed')) || 7;
let aspect = innerWidth / innerHeight;
const sim = createSim({ seed, aspect });
const audio = createAudio(); audio.setSeed(seed);
let frames = 0, ready = false, paused = false, acc = 0, last = performance.now(), sceneResult = null;
let camState = null;
if (requestedScene) { sceneResult = playScene(sim, requestedScene); paused = true; sim.drainEvents(); }

function resize() {
  const pr = Math.min(devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight, false);
  aspect = innerWidth / innerHeight; sim.setAspect(aspect);
  camState = cameraFor(aspect);
  camera.fov = camState.fov; camera.aspect = aspect; camera.position.set(...camState.position); camera.up.set(0, 1, 0); camera.lookAt(...camState.target); camera.updateProjectionMatrix();
  key.target.position.set(camState.target[0], 0, camState.target[2]); key.position.set(camState.target[0] - 3.5, 6, camState.target[2] + 4.5);
  stage.paper.material.uniforms.uRes.value.set(innerWidth, innerHeight);
  document.body.dataset.layout = aspect < 1 ? 'phone' : 'desktop';
  render();
}
addEventListener('resize', resize);

// ---- input ----
const $ = (s) => document.querySelector(s);
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), tmp = new THREE.Vector3();
const toNdc = (cx, cy) => ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
// Which feather is under the pointer: a hit on its vane, shaft or eye (instance index = feather id); failing
// that, the nearest attached eye within reach of a fingertip.
function featherAt(cx, cy) {
  toNdc(cx, cy); ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects([bird.parts.eyes, bird.parts.vanes, bird.parts.shafts, bird.parts.body, bird.parts.head], false);
  for (const h of hits) { if (h.instanceId !== undefined && h.object !== bird.parts.body) { const f = sim.state.feathers[h.instanceId]; if (f && f.state === 'attached') return h.instanceId; } if (h.object === bird.parts.body || h.object === bird.parts.head) break; }
  const pxReach = Math.max(22, coarse() ? 30 : 0);
  let best = -1, bd = Infinity;
  for (const f of sim.state.feathers) {
    if (f.state !== 'attached') continue;
    const F = FEATHERS[f.id], e = f.quill.map((v, k) => v + f.dir[k] * F.length * F.eye);
    const s = tmp.set(...e).project(camera), sx = (s.x + 1) / 2 * innerWidth, sy = (1 - s.y) / 2 * innerHeight;
    const d = Math.hypot(sx - cx, sy - cy); if (d < bd) { bd = d; best = f.id; }
  }
  return bd < pxReach ? best : -1;
}
function overBird(cx, cy) {
  toNdc(cx, cy); ray.setFromCamera(ndc, camera);
  return ray.intersectObject(bird.root, true).length > 0;
}
function groundAt(cx, cy) { return screenToGround(camState, aspect, cx / innerWidth, cy / innerHeight); }
let hoverTimer = 0, lastWalk = 0;
function setHover(v) {
  if (v) { clearTimeout(hoverTimer); hoverTimer = 0; sim.setHover(true); return; }
  if (!hoverTimer && sim.state.hover) hoverTimer = setTimeout(() => { hoverTimer = 0; sim.setHover(false); }, 350);
}
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || paused) return;
  const over = overBird(e.clientX, e.clientY);
  setHover(over);
  canvas.style.cursor = featherAt(e.clientX, e.clientY) >= 0 ? 'pointer' : 'default';
  if (!over && performance.now() - lastWalk > 90) { const g = groundAt(e.clientX, e.clientY); if (g) { sim.walkTo(g[0], g[1]); lastWalk = performance.now(); } }
});
canvas.addEventListener('pointerleave', () => setHover(false));
canvas.addEventListener('pointerdown', (e) => {
  if (paused) return;
  const id = featherAt(e.clientX, e.clientY);
  if (id >= 0) { sim.pluck(id); return; }
  if (e.pointerType !== 'mouse') { const g = groundAt(e.clientX, e.clientY); if (g) sim.walkTo(g[0], g[1]); }
});
let lastWheel = 0;
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (paused || Math.abs(e.deltaY) < 2 || performance.now() - lastWheel < 380) return;
  lastWheel = performance.now(); sim.approach(e.deltaY > 0 ? 1 : -1);
}, { passive: false });
addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '')) return;
  e.preventDefault(); if (!paused) sim.jump();
});
const fanBtn = $('#b-fan');
function syncFan() { fanBtn.setAttribute('aria-pressed', String(sim.state.fanLatch)); fanBtn.textContent = sim.state.fanLatch ? '收屏' : '开屏'; }
fanBtn.addEventListener('click', () => { sim.setFanLatch(!sim.state.fanLatch); syncFan(); });
$('#b-near').addEventListener('click', () => sim.approach(1));
$('#b-back').addEventListener('click', () => sim.approach(-1));
$('#b-jump').addEventListener('click', () => sim.jump());
const soundBtn = $('#b-sound');
soundBtn.addEventListener('click', async () => { const on = await audio.toggle(); soundBtn.setAttribute('aria-pressed', String(on)); soundBtn.textContent = on ? '声音 开' : '声音 关'; });
syncFan();

// ---- loop ----
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (document.hidden) return;
  if (!paused) { acc += dt; let n = 0; while (acc >= STEP && n < 24) { sim.step(STEP); acc -= STEP; n++; } if (n === 24) acc = 0; audio.play(sim.drainEvents()); }
  else if (ready) return;
  render();
}
function render() {
  bird.update(sim.state.pose);
  renderer.info.reset(); renderer.render(scene, camera);
  frames++;
  if (!ready && frames > 2) { ready = true; document.body.dataset.ready = '1'; }
}

// ---- play-test hook (normal play never depends on it) ----
function screenOf(p) { tmp.set(...p).project(camera); return { x: (tmp.x + 1) / 2, y: (1 - tmp.y) / 2 }; }
function snapshot() {
  const s = sim.snapshot(), info = renderer.info, pose = sim.state.pose;
  let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
  for (const p of posePoints(pose)) { const q = screenOf(p); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  const r4 = (v) => +v.toFixed(4);
  return {
    ...s, ready, paused, scene: requestedScene, sceneResult, layout: aspect < 1 ? 'phone' : 'desktop', viewport: [innerWidth, innerHeight],
    screenBox: { x0: r4(x0), x1: r4(x1), y0: r4(y0), y1: r4(y1) }, safe: safeFor(aspect), integrity: integrity(pose),
    eyes: s.feathers.map(f => { const F = FEATHERS[f.id], src = sim.state.feathers[f.id]; const q = screenOf(src.quill.map((v, k) => v + src.dir[k] * F.length * F.eye)); return { id: f.id, x: r4(q.x), y: r4(q.y) }; }),
    eyeSize: EYE_SIZE, sound: audio.on,
    drawCalls: info.render.calls, triangles: info.render.triangles, renderer: gpu, pixelRatio: renderer.getPixelRatio(),
    camera: { position: camState.position, target: camState.target, fov: camState.fov },
  };
}
const after = (fn) => (...a) => { const r = fn(...a); render(); return { result: r, ...snapshot() }; };
window.__PLAYTEST__ = {
  get ready() { return ready; }, snapshot, scenes: SCENES.slice(),
  reset: after(() => { sim.reset(seed); sim.setHoverOverride(null); sim.drainEvents(); return true; }),
  setSeed: (n) => { seed = Number(n) | 0; audio.setSeed(seed); sim.reset(seed); render(); return seed; },
  // Advance the simulation by ms of game time (fixed steps) and draw once; also pauses the live clock.
  step: (ms) => { paused = true; const n = Math.max(1, Math.round(ms / 1000 / STEP)); for (let i = 0; i < n; i++) sim.step(STEP); sim.drainEvents(); render(); return snapshot(); },
  play: () => { paused = false; return true; }, pause: () => { paused = true; return true; },
  hover: after((v) => { sim.setHoverOverride(v == null ? null : Boolean(v)); return true; }),
  // Screen coordinates in CSS pixels; the bird walks to the ground point under them.
  walkTo: after((x, y) => { const g = groundAt(x, y); return g ? sim.walkTo(g[0], g[1]) : false; }),
  pluck: after((id) => sim.pluck(id)),
  jump: after(() => sim.jump()),
  peck: after((strong = false) => sim.peck(strong)),
  approach: after((dir) => sim.approach(dir)),
  setScene: (name) => { sceneResult = playScene(sim, name); paused = true; sim.drainEvents(); render(); return snapshot(); },
  featherAt: (x, y) => featherAt(x, y),
};
resize(); requestAnimationFrame((t) => { last = t; frame(t); });
