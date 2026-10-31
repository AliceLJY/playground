// 最靓的仔 · 页面：舞台、仪表台、自动导览与接管。所有读数都从 model.pose() 来。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as M from './model.js';
import { buildRoach } from './roach.js';
import { tourAt, TOUR_S, SHOTS } from './tour.js';

const ACCENT = '#12a58f';
const q = new URLSearchParams(location.search);
const CAPTURE = q.has('capture');
const $ = (s) => document.querySelector(s);

// ---------------- 舞台 ----------------
const canvas = $('#scene');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: CAPTURE }); }
catch (e) { document.body.classList.add('nogl'); throw e; }
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
const BG = new THREE.Color(0xebe4d8);
const scene = new THREE.Scene(); scene.background = BG; scene.fog = new THREE.Fog(BG, 95, 230);
const camera = new THREE.PerspectiveCamera(34, 1, 0.5, 600);

scene.add(new THREE.HemisphereLight(0xfff6ea, 0x8a6a52, 1.15));
const key = new THREE.DirectionalLight(0xfff1de, 2.6); key.position.set(30, 60, 26); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 10, far: 160 }); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
scene.add(key);
const rim = new THREE.DirectionalLight(0xffd2a8, 1.5); rim.position.set(-40, 22, -30); scene.add(rim);
const spot = new THREE.SpotLight(0xffe2b0, 0, 140, 0.42, 0.6, 0.6); spot.position.set(18, 80, 10); spot.target.position.set(0, 10, 0); scene.add(spot, spot.target);

// 地面：广州老屋的红阶砖，按步行速度往后走（踏步机：虫在原地跑，地在脚下动）
const TILE = 9;
function tileTexture() {
  // 两块砖一张图：灰缝细而暗，砖面低饱和，免得地面抢了虫的戏
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#9d6a56'; g.fillRect(0, 0, 256, 256);
  const tones = ['#c48a72', '#bd836b', '#c99079', '#b97f68'];
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    g.fillStyle = tones[(i * 2 + j) % 4]; g.fillRect(i * 128 + 1.5, j * 128 + 1.5, 125, 125);
    g.globalAlpha = 0.07; for (let k = 0; k < 50; k++) { g.fillStyle = k % 2 ? '#fff' : '#3a1a10'; g.fillRect(i * 128 + 3 + ((k * 53) % 118), j * 128 + 3 + ((k * 31) % 118), 3, 2); } g.globalAlpha = 1;
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const floorTex = tileTexture(); floorTex.repeat.set(400 / (TILE * 2), 400 / (TILE * 2));
const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.82 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

const roach = buildRoach(); scene.add(roach.root);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.minDistance = 22; controls.maxDistance = 150; controls.maxPolarAngle = Math.PI * 0.49; controls.enabled = false;

// ---------------- 状态 ----------------
const live = { v: 0.25, swag: 0, wings: 0, explode: 0, xray: false, focus: null, cycle: 0, ground: 0, view: 'hero' };
const target = { v: 0.25, swag: 0, wings: 0, explode: 0 };
let mode = CAPTURE || q.has('at') || q.has('view') ? 'frozen' : 'tour';
let tourClock = 0, idle = 0, appliedMode = '';
const IDLE_BACK = q.has('idle') ? Math.max(1, +q.get('idle')) : 25; // ?idle=秒 只给验收脚本缩短等待

function camFromView(name) { const v = M.VIEWS[name] || M.VIEWS.hero; return { pos: new THREE.Vector3(...v.pos), tgt: new THREE.Vector3(...v.target) }; }
// 窄屏把机位拉远，保证整只虫在画面里
function fitScale() { const a = innerWidth / innerHeight; return a < 1 ? 1 + (1 - a) * 1.25 : 1; }
function applyCam(from, to, k) {
  const A = camFromView(from), B = camFromView(to), s = fitScale();
  const tgt = A.tgt.clone().lerp(B.tgt, k);
  const pos = A.pos.clone().lerp(B.pos, k).sub(tgt).multiplyScalar(s).add(tgt);
  camera.position.copy(pos); camera.lookAt(tgt); controls.target.copy(tgt);
}
let camAnim = null;
function flyTo(name) { const s = fitScale(), V = camFromView(name); camAnim = { p0: camera.position.clone(), t0: controls.target.clone(), p1: V.pos.clone().sub(V.tgt).multiplyScalar(s).add(V.tgt), t1: V.tgt, k: 0 }; live.view = name; }

// ---------------- 仪表台 ----------------
const panels = {
  speed: $('#speed'), speedVal: $('#speedVal'), bls: $('#bls'), human: $('#human'), zone: $('#zone'), caption: $('#caption'), badge: $('#badge'),
  read: { f: $('#rf'), s: $('#rs'), duty: $('#rd'), air: $('#ra'), feet: $('#rfeet'), pitch: $('#rp'), ant: $('#rant') },
  gait: $('#gait'), load: $('#load'), band: $('#band'), callout: $('#callout'), leader: $('#leader'), cursor: $('#cursor'),
};
const fmt = (x, d = 1) => x.toFixed(d);
function sizeCanvas(c) { const r = c.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); if (c.width !== Math.round(r.width * d)) { c.width = Math.round(r.width * d); c.height = Math.round(r.height * d); } const g = c.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); return { g, w: r.width, h: r.height }; }

function drawGait(st) {
  const { g, w, h } = sizeCanvas(panels.gait); g.clearRect(0, 0, w, h);
  const rows = M.gaitDiagram(st.v), lx = 44, top = 6, rh = (h - top - 16) / 6;
  g.font = Math.max(8, Math.min(11, rh * 0.85)).toFixed(1) + 'px ' + getComputedStyle(document.body).fontFamily; g.textBaseline = 'middle';
  rows.forEach((r, i) => {
    const y = top + i * rh + rh / 2;
    g.fillStyle = '#6b5a4c'; g.fillText(r.name.replace('足', ''), 2, y);
    g.fillStyle = 'rgba(80,60,40,.08)'; g.fillRect(lx, y - rh * 0.32, w - lx - 4, rh * 0.64);
    if (st.v <= 0 || st.swag > 0.5) { g.fillStyle = r.id.endsWith('3') || st.swag < 0.5 ? '#7a5a44' : 'rgba(80,60,40,.0)'; if (r.id.endsWith('3') || st.swag < 0.5) g.fillRect(lx, y - rh * 0.32, w - lx - 4, rh * 0.64); return; }
    if (r.lifted) { g.fillStyle = '#a08a78'; g.fillText('抬起', lx + 6, y); return; }
    g.fillStyle = '#7a5a44';
    for (const [a, b] of r.spans) g.fillRect(lx + a * (w - lx - 4), y - rh * 0.32, (b - a) * (w - lx - 4), rh * 0.64);
  });
  const ph = ((st.cycle % 1) + 1) % 1, x = lx + ph * (w - lx - 4);
  g.fillStyle = ACCENT; g.fillRect(x - 1, top - 2, 2, h - top - 12);
  g.fillStyle = '#8a7868'; g.fillText('一个步态周期 →  深色 = 脚着地', lx, h - 6);
}
function drawLoad(st) {
  const { g, w, h } = sizeCanvas(panels.load); g.clearRect(0, 0, w, h);
  const max = 16, bw = (w - 20) / 6, base = h - 18;
  g.font = '11px ' + getComputedStyle(document.body).fontFamily; g.textAlign = 'center';
  st.legs.forEach((l, i) => {
    const x = 10 + i * bw, hh = (Math.min(l.load, max) / max) * (base - 8);
    g.fillStyle = 'rgba(80,60,40,.08)'; g.fillRect(x + 4, 8, bw - 8, base - 8);
    g.fillStyle = l.load > 0.05 ? (st.focus === 'legs' + l.pair ? ACCENT : '#7a5a44') : 'transparent'; g.fillRect(x + 4, base - hh, bw - 8, hh);
    g.fillStyle = '#6b5a4c'; g.fillText(l.id, x + bw / 2, h - 5);
  });
  const wy = base - (M.WEIGHT_MN / max) * (base - 8); g.strokeStyle = 'rgba(80,60,40,.45)'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(10, wy); g.lineTo(w - 10, wy); g.stroke(); g.setLineDash([]);
  g.textAlign = 'right'; g.fillStyle = '#8a7868'; g.fillText('体重 9.8 mN', w - 10, wy - 6);
}
function drawBand(st) {
  const { g, w, h } = sizeCanvas(panels.band); g.clearRect(0, 0, w, h);
  const x = (v) => 4 + (v / M.SPEED_MAX) * (w - 8);
  const tones = ['#d9cbb9', '#c9b39c', '#b89b80'];
  M.GAIT_ZONES.forEach((z, i) => { g.fillStyle = tones[i]; g.fillRect(x(z.from), 6, x(z.to) - x(z.from), 10); });
  g.fillStyle = ACCENT; g.beginPath(); const px = x(st.v); g.moveTo(px, 18); g.lineTo(px - 5, 26); g.lineTo(px + 5, 26); g.fill(); g.fillRect(px - 1, 2, 2, 16);
  g.font = '10px ' + getComputedStyle(document.body).fontFamily; g.fillStyle = '#6b5a4c'; g.textAlign = 'center';
  ['六足', '四足', '二足'].forEach((n, i) => { const z = M.GAIT_ZONES[i]; g.fillText(n, (x(z.from) + x(z.to)) / 2, 38); });
}

const anchorOf = (sys) => {
  const leg = (id) => roach.legs.find((l) => l.L.id === id).femur.children[0];
  const o = { head: roach.head, pronotum: roach.body.children[1], legs0: leg('R1'), legs1: leg('R2'), legs2: leg('R3'), wings: roach.wings[1].teg, abdomen: roach.body.children.find((c) => c.userData.sys === 'abdomen') }[sys];
  return o ? o.getWorldPosition(new THREE.Vector3()) : null;
};
function drawCallout(st) {
  const c = panels.callout, line = panels.leader;
  const sys = M.SUBSYSTEMS.find((s) => s.id === st.focus);
  if (!sys || st.explode > 0.2 || document.body.classList.contains('bare')) { c.classList.remove('on'); line.setAttribute('d', ''); $('#dot').setAttribute('cx', -10); return; }
  const p = anchorOf(sys.id).project(camera), ax = (p.x * 0.5 + 0.5) * innerWidth, ay = (-p.y * 0.5 + 0.5) * innerHeight;
  c.querySelector('b').textContent = sys.name; c.querySelector('span').textContent = sys.note;
  c.classList.add('on');
  // 标签放在锚点斜上方；右边被图表占着就放左边；上下夹在标题与底栏之间
  const W = innerWidth, H = innerHeight, narrow = W < 640 || W < H;
  const cw = c.offsetWidth, ch = c.offsetHeight, rightLimit = narrow ? W - 12 : W - 340, leftLimit = narrow ? 12 : 250;
  let toRight = ax + 70 + cw < rightLimit; if (!toRight && ax - 70 - cw < leftLimit) toRight = true;
  let lx = toRight ? ax + 70 : ax - 70 - cw; lx = Math.max(leftLimit, Math.min(rightLimit - cw, lx));
  let ly = ay - 90 - ch / 2; ly = Math.max(narrow ? 205 : 210, Math.min(H - (narrow ? 200 : 200) - ch, ly));
  c.style.transform = `translate(${lx.toFixed(1)}px, ${ly.toFixed(1)}px)`;
  const ex = toRight ? lx : lx + cw, ey = ly + ch / 2;
  line.setAttribute('d', `M${ax.toFixed(1)},${ay.toFixed(1)} L${(ex + (toRight ? -16 : 16)).toFixed(1)},${ey.toFixed(1)} L${ex.toFixed(1)},${ey.toFixed(1)}`);
  $('#dot').setAttribute('cx', ax.toFixed(1)); $('#dot').setAttribute('cy', ay.toFixed(1));
}

let lastPanel = -1, lastBtn = '';
function updatePanels(st, frame) {
  panels.speedVal.textContent = fmt(st.v, 2);
  panels.bls.textContent = Math.round(st.bodyLengthsPerSec);
  panels.human.textContent = Math.round((st.bodyLengthsPerSec * 1.7 * 3.6) / 5) * 5;
  panels.zone.textContent = st.swag > 0.5 ? '最靓的仔 · 只用后足站' : st.v <= 0 ? '站着' : st.zone.name;
  const r = panels.read;
  const still = st.v < 0.01 || st.swag > 0.5;
  r.f.textContent = fmt(st.f, 1); r.s.textContent = fmt(st.stride, 0); r.duty.textContent = still ? '—' : Math.round(st.duty * 100); r.air.textContent = still ? '0' : Math.round(st.aerial * 100);
  r.feet.textContent = st.feetDown; r.pitch.textContent = Math.round(st.pitchDeg); r.ant.textContent = Math.round(st.antennaDeg);
  if (document.activeElement !== panels.speed) panels.speed.value = st.v;
  // 面板每两帧重画一次（低端显卡的省力档）
  if (frame % (lowTier ? 2 : 1) === 0) { drawGait(st); drawLoad(st); drawBand(st); }
  const key = [st.focus, st.xray, st.swag > 0.5, st.wings > 0.5, st.explode > 0.5, st.view].join();
  if (key !== lastBtn) {
    lastBtn = key;
    document.querySelectorAll('[data-sys]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.sys === st.focus));
    $('[data-act="xray"]').setAttribute('aria-pressed', st.xray); $('[data-act="swag"]').setAttribute('aria-pressed', st.swag > 0.5);
    $('[data-act="wings"]').setAttribute('aria-pressed', st.wings > 0.5); $('[data-act="explode"]').setAttribute('aria-pressed', st.explode > 0.5);
    document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.view === st.view));
  }
  drawCallout(st);
  document.body.classList.toggle('swag', st.swag > 0.5);
}

// ---------------- 导览光标 ----------------
function moveCursor(cur) {
  const el = panels.cursor;
  if (!cur || mode !== 'tour' && mode !== 'frozen') { el.style.opacity = 0; return; }
  const tgt = document.querySelector(`[data-tour="${cur.target}"]`); if (!tgt) return;
  const r = tgt.getBoundingClientRect(), x1 = r.left + r.width * (cur.target === 'speed' ? 0.62 : 0.5), y1 = r.top + r.height * 0.55;
  const x0 = innerWidth * 0.62, y0 = innerHeight * 0.45;
  const k = cur.moving, x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k - Math.sin(Math.PI * k) * 40;
  el.style.opacity = cur.moving > 0 ? 1 : 0; el.style.transform = `translate(${x}px, ${y}px) scale(${cur.pressed ? 0.82 : 1})`;
  el.classList.toggle('press', cur.pressed);
}

// ---------------- 每帧 ----------------
let lowTier = false, frame = 0;
function stateAt(src) {
  const st = M.pose(src.v, src.t, { swag: src.swag, wings: src.wings, cycle: src.cycle });
  return Object.assign(st, { explode: src.explode, xray: src.xray, focus: src.focus, wings: src.wings, view: src.viewName || (src.view && src.view.to) });
}
function applyState(st, ground) {
  roach.update(st, st.explode);
  const mkey = st.focus + '|' + st.xray;
  if (mkey !== appliedMode) { roach.setMode({ focus: st.focus, xray: st.xray, accent: 0x12a58f }); appliedMode = mkey; }
  floorTex.offset.x = (ground / (TILE * 2)) % 1;
  spot.intensity = 260 * st.swag; key.intensity = 2.6 - 1.1 * st.swag;
  scene.background.copy(BG).lerp(new THREE.Color(0x2a2220), st.swag * 0.82); scene.fog.color.copy(scene.background);
}
function renderTour(t) {
  const s = tourAt(t);
  const st = stateAt({ ...s, t: s.t });
  applyState(st, s.ground);
  applyCam(s.view.from, s.view.to, s.view.k);
  updatePanels(st, frame);
  panels.caption.textContent = s.caption; panels.caption.classList.toggle('on', !!s.caption);
  moveCursor(s.cursor);
  renderer.render(scene, camera);
  return { st, s };
}
let lastNow = performance.now(), simTime = 0;
function tick(now) {
  const dt = Math.min(0.05, (now - lastNow) / 1000); lastNow = now; frame++;
  fpsMeter(dt);
  if (mode === 'tour') { tourClock = (tourClock + dt) % TOUR_S; renderTour(tourClock); }
  else if (mode === 'live') {
    simTime += dt; idle += dt;
    const k = 1 - Math.exp(-dt * 3.2);
    for (const n of ['v', 'swag', 'wings', 'explode']) live[n] += (target[n] - live[n]) * k;
    live.cycle += M.strideFrequency(live.v) * (1 - live.swag) * M.SLOW * dt;
    live.ground += live.v * 1000 * (1 - live.swag) * M.SLOW * dt;
    const st = stateAt({ ...live, t: simTime, viewName: live.view });
    applyState(st, live.ground);
    if (camAnim) { camAnim.k = Math.min(1, camAnim.k + dt / 1.2); const e = camAnim.k * camAnim.k * (3 - 2 * camAnim.k); camera.position.lerpVectors(camAnim.p0, camAnim.p1, e); controls.target.lerpVectors(camAnim.t0, camAnim.t1, e); if (camAnim.k >= 1) camAnim = null; }
    controls.update();
    updatePanels(st, frame);
    renderer.render(scene, camera);
    if (idle > IDLE_BACK) backToTour();
  }
  requestAnimationFrame(tick);
}

// 帧率与降档：连续 3 秒低于 40 帧就降像素比、关软阴影、面板隔帧重画
let fpsAcc = 0, fpsN = 0, fps = 60, slowFor = 0;
function fpsMeter(dt) {
  fpsAcc += dt; fpsN++;
  if (fpsAcc >= 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; slowFor = fps < 40 ? slowFor + 0.5 : 0; if (slowFor >= 3 && !lowTier) setLowTier(); }
}
function setLowTier() { lowTier = true; renderer.setPixelRatio(1); renderer.shadowMap.type = THREE.BasicShadowMap; key.shadow.mapSize.set(1024, 1024); key.shadow.map?.dispose(); key.shadow.map = null; resize(); }

// ---------------- 接管与交还 ----------------
function takeOver() {
  if (mode === 'live' || mode === 'frozen') { idle = 0; return; }
  const s = tourAt(tourClock);
  Object.assign(live, { v: s.v, swag: s.swag, wings: s.wings, explode: s.explode, xray: s.xray, focus: s.focus, cycle: s.cycle, ground: s.ground, view: s.view.to });
  Object.assign(target, { v: s.v, swag: s.swag > 0.5 ? 1 : 0, wings: s.wings > 0.5 ? 1 : 0, explode: s.explode > 0.5 ? 1 : 0 });
  simTime = s.t; mode = 'live'; idle = 0; controls.enabled = true; panels.cursor.style.opacity = 0;
  panels.caption.classList.remove('on'); panels.badge.textContent = '你在操作 · 25 秒不动回到导览';
}
function backToTour() {
  const f = $('#fade'); f.style.opacity = 1;
  setTimeout(() => { mode = 'tour'; tourClock = 0; controls.enabled = false; camAnim = null; panels.badge.textContent = '自动导览 · 点任何地方接管'; f.style.opacity = 0; }, 380);
  mode = 'fading';
}
for (const ev of ['pointerdown', 'wheel', 'keydown']) addEventListener(ev, (e) => { if (e.target.closest && e.target.closest('#fade')) return; takeOver(); }, { capture: true, passive: true });

panels.speed.addEventListener('input', () => { takeOver(); target.v = +panels.speed.value; if (target.v > 0.02) target.swag = 0; });
document.querySelectorAll('[data-sys]').forEach((b) => b.addEventListener('click', () => { takeOver(); live.focus = live.focus === b.dataset.sys ? null : b.dataset.sys; if (live.focus) target.explode = 0; }));
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { takeOver(); flyTo(b.dataset.view); }));
const acts = {
  xray: () => { live.xray = !live.xray; if (live.xray) live.focus = null; },
  explode: () => { target.explode = target.explode > 0.5 ? 0 : 1; live.focus = null; },
  wings: () => { target.wings = target.wings > 0.5 ? 0 : 1; },
  swag: () => { if (target.swag > 0.5) { target.swag = 0; target.v = 0.25; } else { target.swag = 1; target.v = 0; target.wings = 0.55; target.explode = 0; live.focus = null; flyTo('pose'); } },
  panels: () => document.body.classList.toggle('bare'),
};
document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => { takeOver(); acts[b.dataset.act](); }));
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === 'h') acts.panels(); else if (k === 'x') acts.xray(); else if (k === 'e') acts.explode(); else if (k === 'w') acts.wings(); else if (k === 's') acts.swag();
  else if (k === 'arrowup') target.v = Math.min(M.SPEED_MAX, target.v + 0.1); else if (k === 'arrowdown') target.v = Math.max(0, target.v - 0.1);
});

// ---------------- 尺寸、就绪、钩子 ----------------
function resize() {
  const w = innerWidth, h = innerHeight; renderer.setPixelRatio(lowTier ? 1 : Math.min(2, devicePixelRatio || 1)); renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.fov = w / h < 1 ? 46 : 34;
  // 竖屏：上有标题、下有底栏，把画面中心往上挪，让虫落在中间那块空地上
  if (w / h < 1) camera.setViewOffset(w, h, 0, h * 0.11, w, h); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  if (mode === 'frozen') renderTour(frozenAt);
}
addEventListener('resize', resize);

const frozenAt = q.has('at') ? +q.get('at') : q.has('view') ? SHOTS[q.get('view')] ?? SHOTS.hero : 0;
resize();
// 预热：所有材质在第一帧前编译好，开局不卡
roach.update(M.pose(0.25, 0), 0);
renderer.compile(scene, camera);
if (mode === 'frozen') { renderTour(frozenAt); panels.badge.textContent = CAPTURE ? '' : '固定机位 · ' + (q.get('view') || 't=' + frozenAt); }
else requestAnimationFrame((n) => { lastNow = n; tick(n); });

window.__roach = {
  ready: true,
  render: (t) => { mode = 'frozen'; renderTour(t); return true; },
  state: () => ({ mode, tourClock, idle, live: { ...live }, target: { ...target }, lowTier, fps }),
  info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, pixelRatio: renderer.getPixelRatio(), meshes: roach.parts.length, renderer: (() => { const g = renderer.getContext(), e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; })() }),
  pose: (t) => { const s = tourAt(t); return stateAt({ ...s, t: s.t }); },
  screen: (sys) => { const p = anchorOf(sys); if (!p) return null; p.project(camera); return { x: p.x * 0.5 + 0.5, y: -p.y * 0.5 + 0.5, z: p.z }; },
  // 虫身（不含触角）在屏幕上的范围，0–1 归一；验收用来判断主体在不在画里、有没有被面板挡住
  bodyBox: () => {
    // 逐个顶点投影（包围盒的角会把近处那头算得太低，2026-11-01 亮相机位因此误报被挡）
    const skip = new Set(); roach.antennae.forEach((a) => a.chain.forEach((m) => skip.add(m)));
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; const v = new THREE.Vector3();
    roach.root.updateMatrixWorld(true);
    roach.root.traverseVisible((o) => {
      if (!o.isMesh || skip.has(o) || o.material.opacity <= 0.3) return;
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 2) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).project(camera); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
    });
    return { x0: x0 * 0.5 + 0.5, x1: x1 * 0.5 + 0.5, y0: -y1 * 0.5 + 0.5, y1: -y0 * 0.5 + 0.5 };
  },
  roachBox: () => { const b = new THREE.Box3(); roach.root.traverseVisible((o) => { if (o.isMesh && o.material.opacity > 0.3) b.expandByObject(o); }); const pts = []; for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) pts.push(new THREE.Vector3(x, y, z).project(camera)); return { x0: Math.min(...pts.map((p) => p.x)) * 0.5 + 0.5, x1: Math.max(...pts.map((p) => p.x)) * 0.5 + 0.5, y0: -Math.max(...pts.map((p) => p.y)) * 0.5 + 0.5, y1: -Math.min(...pts.map((p) => p.y)) * 0.5 + 0.5, world: { min: b.min.toArray(), max: b.max.toArray() } }; },
  takeOver, backToTour, TOUR_S, SHOTS,
};
