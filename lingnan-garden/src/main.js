// 岭南园林一角：渲染、明信片机位、第一人称步行、自动逛一圈、界面与验收钩子。
import * as THREE from 'three';
import * as C from './core.js';
import { buildWorld } from './world.js';
import { createAudio } from './audio.js';

const Q = new URLSearchParams(location.search);
const $ = id => document.getElementById(id);
const canvas = $('scene');
const coarse = matchMedia('(pointer:coarse)').matches;
// 浏览器打不开 WebGL 时盖一层看得清的说明，别让页面空着卡住
function noWebGL() {
  if (document.getElementById('nogl')) return;
  const d = document.createElement('div'); d.id = 'nogl'; d.setAttribute('role', 'alert');
  d.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:28px;box-sizing:border-box;background:#17202b;color:#f6ecdc;font:15px/1.9 system-ui,-apple-system,\'PingFang SC\',\'Microsoft YaHei\',sans-serif;text-align:center';
  d.textContent = '这个页面要用 WebGL 画三维画面，这台设备的浏览器打不开。换一个浏览器，或者打开硬件加速后再试。';
  document.body.append(d);
}
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
catch (e) { noWebGL(); throw e; }
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.02;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#cfe4f2', 60, 420);
const camera = new THREE.PerspectiveCamera(60, 1, 0.08, 1400); camera.layers.enable(1);   // 第 1 层是不进水面倒影的东西（荷叶荷花锦鲤），主相机照常看得见
camera.rotation.order = 'YXZ';

const SUN = new THREE.Vector3(-0.56, 0.7, 0.44).normalize();
scene.add(new THREE.HemisphereLight('#dcecff', '#c2bd9c', 1.75));
const sun = new THREE.DirectionalLight('#ffe6ba', 2.7);
sun.position.copy(SUN).multiplyScalar(60); sun.castShadow = true;
sun.shadow.mapSize.set(coarse ? 2048 : 4096, coarse ? 2048 : 4096);
Object.assign(sun.shadow.camera, { left: -27, right: 27, top: 27, bottom: -27, near: 5, far: 140 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);

const world = buildWorld(scene, { coarse, sunDir: SUN, flatWater: Q.has('flatwater'), still: Q.has('still') });
const audio = createAudio();
renderer.shadowMap.needsUpdate = true;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const S = { mode: 'card', started: false, walk: { x: C.START.x, z: C.START.z, yaw: C.START.yaw, pitch: -0.04, bob: 0, v: 0, y: 0 }, tour: { on: false, i: 1, hold: 0 }, top: { az: -0.68, pol: 0.86, dist: 46 } };
const keys = new Set();
let hintTimer = 0;
function hint(text) { const h = $('hint'); h.textContent = text; h.classList.add('show'); clearTimeout(hintTimer); hintTimer = setTimeout(() => h.classList.remove('show'), 4200); }
function setMode(mode) {
  S.mode = mode; S.tour.on = false;
  if (mode === 'walk') hint(coarse ? '左下摇杆走动 · 其余地方拖动转头' : 'WASD 走动 · 拖动转头 · Shift 快走');
  if (mode === 'card') hint('这是和起始图同一个机位 · 点「对照原图」看差别');
  if (mode === 'top') hint('拖动旋转 · 滚轮或双指缩放');
  refreshButtons(); resize();
}
function startTour() { S.mode = 'walk'; S.tour.on = true; S.tour.i = 1; S.tour.hold = 0; Object.assign(S.walk, { x: C.TOUR[0].x, z: C.TOUR[0].z }); hint('自动逛一圈 · 拖动可以随便看 · 推摇杆或按方向键就接手'); refreshButtons(); resize(); }
function refreshButtons() { $('bCard').classList.toggle('on', S.mode === 'card'); $('bWalk').classList.toggle('on', S.mode === 'walk' && !S.tour.on); $('bTour').classList.toggle('on', S.tour.on); $('bTop').classList.toggle('on', S.mode === 'top'); }

const joy = { x: 0, y: 0, id: -1, ox: 0, oy: 0 };
function updateCamera(dt) {
  if (S.mode === 'card') { const P = C.POSTCARD; camera.position.set(P.x, P.y, P.z); camera.rotation.set(P.pitch, P.yaw, 0); return; }
  if (S.mode === 'top') { const T = S.top, sp = Math.sin(T.pol); camera.position.set(1 + T.dist * sp * Math.sin(T.az), T.dist * Math.cos(T.pol), 2 + T.dist * sp * Math.cos(T.az)); camera.lookAt(1, 1, 2); return; }
  const W = S.walk;
  let ix = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0) + joy.x;
  let iy = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0) + joy.y;
  if (S.tour.on && (ix || iy)) { S.tour.on = false; refreshButtons(); }
  let nx = W.x, nz = W.z;
  if (S.tour.on) {
    const t = C.TOUR[S.tour.i], d = Math.hypot(t.x - W.x, t.z - W.z);
    if (d < 0.25) { S.tour.i++; if (S.tour.i >= C.TOUR.length) { S.tour.on = false; refreshButtons(); hint('逛完一圈了'); } }
    else { const r = C.walkToward(W.x, W.z, t.x, t.z, dt, 1.7, dt); nx = r.x; nz = r.z; const want = Math.atan2(-(t.x - W.x), -(t.z - W.z)); let dy = want - W.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI; S.tour.hold = Math.max(0, S.tour.hold - dt); if (S.tour.hold <= 0 && ![...ptrs.values()].some(q => q.role === 'look')) { W.yaw += dy * (1 - Math.exp(-dt * 2.2)); W.pitch += (-0.03 - W.pitch) * (1 - Math.exp(-dt * 2)); } }
  } else {
    const m = Math.hypot(ix, iy); if (m > 1) { ix /= m; iy /= m; }
    const v = keys.has('shift') ? 5 : 2.5, fx = -Math.sin(W.yaw), fz = -Math.cos(W.yaw);
    const r = C.moveWalker(W.x, W.z, (fx * iy + Math.cos(W.yaw) * ix) * v * dt, (fz * iy - Math.sin(W.yaw) * ix) * v * dt); nx = r.x; nz = r.z;
  }
  W.v = Math.hypot(nx - W.x, nz - W.z) / Math.max(dt, 1e-4); W.x = nx; W.z = nz; W.bob += W.v * dt * 3.2;
  const gy = C.groundY(W.x, W.z); W.y += (gy - W.y) * (1 - Math.exp(-dt * 14));
  camera.position.set(W.x, W.y + C.EYE + Math.sin(W.bob) * 0.025 * Math.min(1, W.v), W.z);
  camera.rotation.set(W.pitch, W.yaw, 0);
}

// ---- 输入 ----
const ptrs = new Map(); let pinch = 0;
function look(dx, dy) {
  if (S.mode === 'card') return;
  if (S.mode === 'top') { S.top.az -= dx * 0.006; S.top.pol = clamp(S.top.pol - dy * 0.004, 0.15, 1.45); return; }
  if (S.tour.on) S.tour.hold = 3;
  S.walk.yaw -= dx * (coarse ? 0.0065 : 0.0045); S.walk.pitch = clamp(S.walk.pitch - dy * 0.004, -1.1, 1.1);
}
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  const p = { x: e.clientX, y: e.clientY, role: 'look' };
  if (S.mode === 'walk' && e.pointerType === 'touch' && joy.id < 0 && e.clientX < innerWidth * 0.45 && e.clientY > innerHeight * 0.35) {
    p.role = 'joy'; joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY;
    const j = $('joy'); j.style.display = 'block'; j.style.left = e.clientX - 55 + 'px'; j.style.top = e.clientY - 55 + 'px'; j.firstElementChild.style.transform = '';
  }
  ptrs.set(e.pointerId, p); pinch = 0;
});
canvas.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId); if (!p) return;
  if (p.role === 'joy') { let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy; const m = Math.hypot(dx, dy), R = 46; if (m > R) { dx *= R / m; dy *= R / m; } joy.x = dx / R; joy.y = -dy / R; $('joy').firstElementChild.style.transform = `translate(${dx}px,${dy}px)`; }
  else {
    const looks = [...ptrs.values()].filter(q => q.role === 'look');
    if (looks.length >= 2) { p.x = e.clientX; p.y = e.clientY; const d = Math.hypot(looks[0].x - looks[1].x, looks[0].y - looks[1].y); if (pinch > 0 && d > 0 && S.mode === 'top') S.top.dist = clamp(S.top.dist * pinch / d, 16, 80); pinch = d; return; }
    look(e.clientX - p.x, e.clientY - p.y);
  }
  p.x = e.clientX; p.y = e.clientY;
});
const release = e => { const p = ptrs.get(e.pointerId); if (!p) return; if (p.role === 'joy') { joy.id = -1; joy.x = joy.y = 0; $('joy').style.display = 'none'; } ptrs.delete(e.pointerId); pinch = 0; };
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(ev, release);
canvas.addEventListener('wheel', e => { e.preventDefault(); if (S.mode === 'top') S.top.dist = clamp(S.top.dist * Math.exp(e.deltaY * 0.0012), 16, 80); }, { passive: false });
addEventListener('keydown', e => { const k = e.key.toLowerCase(); keys.add(k); if (S.mode === 'card' && ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k) && S.started) setMode('walk'); });
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => { keys.clear(); joy.x = joy.y = 0; joy.id = -1; $('joy').style.display = 'none'; ptrs.clear(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { keys.clear(); joy.x = joy.y = 0; } });

// ---- 界面 ----
function begin(mode) { S.started = true; $('intro').style.display = 'none'; audio.start(); mode === 'tour' ? startTour() : setMode(mode); }
$('bCard').addEventListener('click', () => begin('card'));
$('bWalk').addEventListener('click', () => begin('walk'));
$('bTour').addEventListener('click', () => begin('tour'));
$('bTop').addEventListener('click', () => begin('top'));
$('bRef').addEventListener('click', () => { const r = $('ref'); const on = r.style.display !== 'block'; r.style.display = on ? 'block' : 'none'; $('bRef').classList.toggle('on', on); if (on && S.mode !== 'card') setMode('card'); });
$('ref').addEventListener('click', () => { const r = $('ref'); r.classList.toggle('big'); });
$('mute').addEventListener('click', () => { audio.start(); audio.setMuted(!audio.muted); $('mute').textContent = audio.muted ? '声音 关' : '声音 开'; });
$('infoBtn').addEventListener('click', () => { $('info').style.display = 'block'; });
$('infoClose').addEventListener('click', () => { $('info').style.display = 'none'; });
$('goCard').addEventListener('click', () => begin('card'));
$('goWalk').addEventListener('click', () => begin('walk'));
$('goTour').addEventListener('click', () => begin('tour'));
if (Q.has('mute')) audio.setMuted(true);

function resize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h;
  // 明信片机位按横向视角对齐起始图：竖屏时把纵向视角放大，免得左右被裁掉太多
  const hf = 2 * Math.atan(Math.tan(C.POSTCARD.fov * Math.PI / 360) * 16 / 9);
  camera.fov = S.mode === 'card' ? clamp(2 * Math.atan(Math.tan(hf / 2) / Math.max(camera.aspect, 0.9)) * 180 / Math.PI, C.POSTCARD.fov, 84) : S.mode === 'top' ? 42 : (w < h ? 74 : 62);
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

// ---- 主循环 ----
const stat = { fps: 0, frames: 0, acc: 0, calls: 0, tris: 0 };
let last = performance.now(), T = 0, shadowTick = 0;
function step(real) {
  T += real; world.update(T, real); updateCamera(real);
  world.sky.position.copy(camera.position);
  if (Q.has('shadow1') || ++shadowTick % (coarse ? 20 : 4) === 0) renderer.shadowMap.needsUpdate = true;   // 诊断开关 ?shadow1：阴影每帧更新
  const nearWater = S.mode === 'walk' ? Math.max(clamp(1 - (Math.hypot(S.walk.x + 0.5, S.walk.z - 3.2) - 4) / 7, 0, 1), clamp(1 - (Math.hypot(S.walk.x - C.FALL.x, S.walk.z + 1.5) - 2) / 7, 0, 1)) : 0.6;
  audio.update(real, nearWater);
  renderer.info.reset(); renderer.render(scene, camera);
  stat.calls = renderer.info.render.calls; stat.tris = renderer.info.render.triangles;
}
function hud() {
  $('stats').innerHTML = `${stat.fps} fps · ${stat.calls} 次绘制<br>${(stat.tris / 10000).toFixed(1)} 万三角面`;
  $('where').textContent = S.mode === 'card' ? '明信片机位' : S.mode === 'top' ? '俯瞰' : C.placeName(S.walk.x, S.walk.z);
}
function frame(now) {
  const real = Math.min(0.1, (now - last) / 1000); last = now; step(real);
  stat.frames++; stat.acc += real; if (stat.acc >= 0.5) { stat.fps = Math.round(stat.frames / stat.acc); stat.frames = 0; stat.acc = 0; hud(); }
  requestAnimationFrame(frame);
}
renderer.info.autoReset = false;

// ---- 验收钩子与固定机位 ----
const at = (x, z, yaw, pitch = 0) => () => { begin('walk'); Object.assign(S.walk, { x, z, yaw, pitch, y: C.groundY(x, z) }); };
const VIEWS = {
  card: () => begin('card'), walk: () => begin('walk'), top: () => begin('top'),
  hall: at(-7.4, 3.6, -0.9, 0.12),                  // 走近敞厅：炮仗花、满洲窗、蚝壳横披
  gable: at(-9.6, 1.6, -0.72, 0.36),                // 西山墙与屋脊的灰塑
  veranda: at(-3.4, -1.1, -1.5, 0.0),               // 檐廊里往东看
  inside: at(-2.2, -4.6, 2.2, 0.05),                // 屋里看满洲窗
  pond: at(-6.7, 8.8, -0.85, -0.2),                 // 荷池西南角：石栏、黄蜡石
  bridge: at(0.4, 8.4, -0.72, 0.08),                // 看廊桥和石拱
  onbridge: at(5.9, 2.75, 1.35, -0.12),             // 桥顶回看敞厅
  oct: at(6.4, 10.6, -0.62, 0.05),                  // 八角池、八角亭、英石壁山
  pavilion: at(11.3, 5.9, -1.35, 0.06),             // 八角亭里看壁山跌水
  rock: at(9.4, 0.6, -1.2, 0.28),                   // 壁山下
  door: at(-8.6, 1.8, 0.1, 0.05),                   // 北墙的门
  alley: at(-7.6, -3.4, 0.05, 0.14),                // 窄巷里往北看
  back: at(-6.6, -7.9, -1.5, 0.14),                 // 屋后
  court: at(5.6, 13.4, 0.85, 0.08),                 // 庭院东南角回望：荔枝、石桌、花基
  bonsai: at(-7.4, 5.9, 1.5, -0.14),                // 花基上的盆景
  tour: () => begin('tour'),
};
window.__garden = {
  C, S, stat, views: Object.keys(VIEWS), ready: false, prof: world.prof,
  setView(v) { if (!VIEWS[v]) return null; VIEWS[v](); step(0.016); step(0.016); hud(); return S.mode; },
  press(k, on) { on ? keys.add(k) : keys.delete(k); },
  gpu() { const gl = renderer.getContext(), x = gl.getExtension('WEBGL_debug_renderer_info'); return x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : 'unknown'; },
  snapshot: () => ({ mode: S.mode, tour: S.tour.on, x: +S.walk.x.toFixed(3), z: +S.walk.z.toFixed(3), y: +S.walk.y.toFixed(3), yaw: +S.walk.yaw.toFixed(3), place: C.placeName(S.walk.x, S.walk.z), fps: stat.fps, calls: stat.calls, tris: stat.tris, cam: camera.position.toArray().map(v => +v.toFixed(2)), fov: +camera.fov.toFixed(1) }),
  step(ms) { for (let t = 0; t < ms; t += 16) step(0.016); hud(); },
};
resize(); refreshButtons();
if (Q.get('view') && VIEWS[Q.get('view')]) VIEWS[Q.get('view')]();
if (Q.get('at')) { const [x, z, yaw, pitch] = Q.get('at').split(',').map(Number); at(x, z, yaw || 0, pitch || 0)(); }
step(0.016); hud();
window.__garden.ready = true;
requestAnimationFrame(t => { last = t; frame(t); });
