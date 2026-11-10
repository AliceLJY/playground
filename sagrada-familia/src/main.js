// 圣家堂：渲染、三种操作方式（轨道 / 漫游 / 飞行）、视点导览、三档光、界面与验收钩子。
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as C from './core.js';
import { buildWorld, GLASS } from './world.js';

const Q = new URLSearchParams(location.search);
const $ = id => document.getElementById(id);
const canvas = $('scene'), stage = $('stage');
const coarse = matchMedia('(pointer:coarse)').matches;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const DPR = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);
renderer.setPixelRatio(DPR);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#dfe6ea', 300, 1700);
const camera = new THREE.PerspectiveCamera(50, 1, 0.3, 4000);
camera.rotation.order = 'YXZ';

const hemi = new THREE.HemisphereLight('#e6eef6', '#b8a98a', 1.2);
const sun = new THREE.DirectionalLight('#fff0d8', 2.6);
sun.castShadow = true; sun.shadow.mapSize.set(coarse ? 2048 : 4096, coarse ? 2048 : 4096);
Object.assign(sun.shadow.camera, { left: -210, right: 210, top: 210, bottom: -210, near: 20, far: 900 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.5;
scene.add(hemi, sun, sun.target);

const world = buildWorld(scene, { coarse });

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { samples: coarse ? 2 : 4, type: THREE.HalfFloatType }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.7, 0.82);
if (!Q.has('nobloom')) composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------- 状态 ----------
const S = { mode: 'orbit', zone: 'out', view: 'whole', light: 'morning' };
const orbit = { az: 0.7, pol: 1.1, dist: 250, target: new THREE.Vector3(0, 52, -6), idle: 0 };
const fp = { x: 0, y: C.EYE, z: 62, yaw: 0, pitch: 0.1, v: 0, bob: 0 };
let tween = null;                     // 飞向视点的过程
const keys = new Set();
const joy = { x: 0, y: 0, id: -1, ox: 0, oy: 0 };

// ---------- 光 ----------
const light = { tod: 0, cool: 1, warm: 0.16, tTod: 0, tCool: 1, tWarm: 0.16, dirty: true };
const SUNS = [[0.82, 0.46, 0.34], [0.22, 0.95, 0.24], [-0.82, 0.42, 0.3]].map(a => new THREE.Vector3(...a).normalize());
const PAL = { sun: ['#ffe4c2', '#fff7ea', '#ffbf85'], zen: ['#7aa6d0', '#5d96d8', '#6a7db4'], hor: ['#f2e2cc', '#dfe9f0', '#f7c79a'], amb: ['#cfdcf0', '#e9e6dc', '#f0d2a8'] };
const _ca = new THREE.Color(), _cb = new THREE.Color();
const tri = (arr, t, out) => { const i = t < 0.5 ? 0 : 1, f = t < 0.5 ? t * 2 : t * 2 - 1; return out.copy(_ca.set(arr[i])).lerp(_cb.set(arr[i + 1]), f); };
const sunDir = new THREE.Vector3();
function setLight(id, instant) {
  const L = C.LIGHTS[id]; if (!L) return;
  S.light = id; light.tTod = L.tod; light.tCool = L.cool; light.tWarm = L.warm;
  if (instant) { light.tod = L.tod; light.cool = L.cool; light.warm = L.warm; }
  light.dirty = true;
  document.querySelectorAll('#lights button').forEach(b => b.classList.toggle('on', b.dataset.light === id));
}
function updateLight(dt) {
  const k = 1 - Math.exp(-dt * 2.2), moving = Math.abs(light.tod - light.tTod) > 0.002 || light.dirty;
  light.tod += (light.tTod - light.tod) * k; light.cool += (light.tCool - light.cool) * k; light.warm += (light.tWarm - light.warm) * k;
  if (!moving && !light.zoneDirty) return;
  light.dirty = false; light.zoneDirty = false;
  const t = light.tod, i = t < 0.5 ? 0 : 1, f = t < 0.5 ? t * 2 : t * 2 - 1;
  sunDir.copy(SUNS[i]).lerp(SUNS[i + 1], f).normalize();
  const inside = S.zone === 'in';
  sun.position.copy(sunDir).multiplyScalar(420); sun.target.position.set(0, 0, 0);
  tri(PAL.sun, t, sun.color); sun.intensity = inside ? 0 : 2.7;
  if (inside) {
    // 里面不靠太阳直射：一个偏暗的环境光，随哪一侧的窗子亮而偏冷或偏暖
    hemi.intensity = 1.25 + 0.15 * (light.cool + light.warm);
    hemi.color.set('#cfc8ba').lerp(_ca.set('#9fc4ff'), light.cool * 0.3).lerp(_cb.set('#ffc27a'), light.warm * 0.42);
    hemi.groundColor.set('#8a8172').lerp(_ca.set('#5f86b8'), light.cool * 0.25).lerp(_cb.set('#c98a3a'), light.warm * 0.4);
    scene.fog.color.set('#bfb7a6').lerp(_cb.set('#f0b060'), light.warm * 0.45).lerp(_ca.set('#9fc0e0'), light.cool * 0.25); scene.fog.near = 70; scene.fog.far = 520;
    bloom.strength = 0.3 + 0.12 * Math.max(light.cool, light.warm); bloom.threshold = 0.86; renderer.toneMappingExposure = 1.05;
  } else {
    hemi.intensity = 1.15; tri(PAL.amb, t, hemi.color); hemi.groundColor.set('#b3a58a');
    tri(PAL.hor, t, scene.fog.color); scene.fog.near = 320; scene.fog.far = 1750;
    bloom.strength = 0.14; bloom.threshold = 0.92; renderer.toneMappingExposure = 1;
    renderer.shadowMap.needsUpdate = true;
  }
  const u = world.sky.material.uniforms; u.uSun.value.copy(sunDir); tri(PAL.zen, t, u.uZen.value); tri(PAL.hor, t, u.uHor.value); tri(PAL.sun, t, u.uGlow.value);
  GLASS.uGI.value.set(light.cool, light.warm, 0);
  for (const m of world.coolMats) m.color.setScalar(0.42 + 0.75 * light.cool);
  for (const m of world.warmMats) m.color.setScalar(0.42 + 0.75 * light.warm);
  world.ceilMat.color.set('#d9d4c8').lerp(_ca.set('#bcd4f5'), light.cool * 0.3).lerp(_cb.set('#ffd9a0'), light.warm * 0.4);
  for (const m of world.mixedMats) m.color.setScalar(0.62 + 0.3 * Math.max(light.cool, light.warm));
  world.rays.cool.opacity = 0.01 + 0.1 * light.cool; world.rays.warm.opacity = 0.01 + 0.15 * light.warm;
}

// ---------- 镜头 ----------
const _d = new THREE.Vector3(), _look = new THREE.Vector3(), _qa = new THREE.Quaternion(), _m4 = new THREE.Matrix4();
function setZone(z) {
  if (S.zone === z && world.int.visible === (z === 'in') && world.ext.visible === (z !== 'in')) return;
  S.zone = z; world.int.visible = z === 'in'; world.ext.visible = z !== 'in'; world.sky.visible = z !== 'in'; light.zoneDirty = true;
  scene.background = z === 'in' ? new THREE.Color('#1c1a15') : null;
}
function zoneOf(p) { return C.inside(p.x, p.z) && C.sdFoot(p.x, p.z) < -0.05 && p.y < 57 ? 'in' : 'out'; }
function fpFromCamera() {
  camera.getWorldDirection(_d); fp.x = camera.position.x; fp.y = camera.position.y; fp.z = camera.position.z;
  fp.yaw = Math.atan2(-_d.x, -_d.z); fp.pitch = Math.asin(clamp(_d.y, -1, 1));
}
function orbitFromCamera(target) {
  orbit.target.copy(target); _d.copy(camera.position).sub(target); orbit.dist = _d.length();
  orbit.pol = Math.acos(clamp(_d.y / orbit.dist, -1, 1)); orbit.az = Math.atan2(_d.x, _d.z); orbit.idle = 0;
}
function placeCamera() {
  if (S.mode === 'orbit') {
    const sp = Math.sin(orbit.pol);
    camera.position.set(orbit.target.x + orbit.dist * sp * Math.sin(orbit.az), orbit.target.y + orbit.dist * Math.cos(orbit.pol), orbit.target.z + orbit.dist * sp * Math.cos(orbit.az));
    if (camera.position.y < 1.2) camera.position.y = 1.2;
    camera.lookAt(orbit.target);
  } else {
    camera.position.set(fp.x, fp.y + (S.mode === 'walk' ? Math.sin(fp.bob) * 0.03 * Math.min(1, fp.v) : 0), fp.z);
    camera.rotation.set(fp.pitch, fp.yaw, 0);
  }
}
function updateCamera(dt) {
  if (tween) {
    tween.t += dt / tween.dur; const t = Math.min(1, tween.t);
    if (tween.cut) {
      // 里外互换：先暗下去，换好位置再亮起来
      $('fade').style.opacity = t < 0.5 ? t * 2 : 2 - t * 2;
      if (t >= 0.5 && !tween.swapped) { tween.swapped = true; camera.position.copy(tween.p1); camera.quaternion.copy(tween.q1); land(tween.view); }
    } else { const e = ease(t); camera.position.lerpVectors(tween.p0, tween.p1, e); camera.quaternion.slerpQuaternions(tween.q0, tween.q1, e); }
    if (t >= 1) { if (!tween.cut) land(tween.view); $('fade').style.opacity = 0; tween = null; }
    setZone(zoneOf(camera.position)); return;
  }
  if (S.mode === 'orbit') {
    orbit.idle += dt; if (orbit.idle > 9 && !Q.has('still')) orbit.az += dt * 0.04;
  } else {
    let ix = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0) + joy.x;
    let iy = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0) + joy.y;
    const m = Math.hypot(ix, iy); if (m > 1) { ix /= m; iy /= m; }
    const fx = -Math.sin(fp.yaw), fz = -Math.cos(fp.yaw), rx = Math.cos(fp.yaw), rz = -Math.sin(fp.yaw);
    if (S.mode === 'walk') {
      const v = keys.has('shift') ? 6.5 : 2.8, r = C.moveWalker(fp.x, fp.z, (fx * iy + rx * ix) * v * dt, (fz * iy + rz * ix) * v * dt);
      fp.v = Math.hypot(r.x - fp.x, r.z - fp.z) / Math.max(dt, 1e-4); fp.x = r.x; fp.z = r.z; fp.bob += fp.v * dt * 3;
      fp.y = C.groundY(fp.x, fp.z) + C.EYE;
    } else {
      const v = keys.has('shift') ? 55 : 16, cp = Math.cos(fp.pitch), up = (keys.has(' ') || keys.has('e') ? 1 : 0) - (keys.has('q') ? 1 : 0);
      fp.x += (fx * cp * iy + rx * ix) * v * dt; fp.z += (fz * cp * iy + rz * ix) * v * dt; fp.y = clamp(fp.y + (Math.sin(fp.pitch) * iy + up) * v * dt, 1.2, 420);
      fp.x = clamp(fp.x, -620, 620); fp.z = clamp(fp.z, -620, 620); fp.v = 0;
    }
  }
  placeCamera(); setZone(zoneOf(camera.position));
}
// 到达一个视点之后，把镜头交给对应的操作方式
function land(id) {
  const v = C.VIEWS.find(q => q.id === id); Object.assign(S, C.applyView(S, id));
  if (v.mode === 'orbit') orbitFromCamera(_look.set(...v.look)); else fpFromCamera();
  if (v.mode === 'walk') fp.y = C.groundY(fp.x, fp.z) + C.EYE;
  syncUI();
}
function goView(id, instant) {
  const v = C.VIEWS.find(q => q.id === id); if (!v) return false;
  const p1 = new THREE.Vector3(...v.pos), q1 = new THREE.Quaternion().setFromRotationMatrix(_m4.lookAt(p1, _look.set(...v.look), THREE.Object3D.DEFAULT_UP));
  if (v.light) setLight(v.light, instant);
  S.view = id; showCaption(v);
  if (instant) { camera.position.copy(p1); camera.quaternion.copy(q1); tween = null; $('fade').style.opacity = 0; land(id); setZone(zoneOf(camera.position)); updateLight(0); return true; }
  const cut = zoneOf(camera.position) !== v.zone;
  tween = { t: 0, dur: cut ? 0.9 : 1.7, cut, swapped: false, view: id, p0: camera.position.clone(), q0: camera.quaternion.clone(), p1, q1 };
  syncUI(id); return true;
}
function setMode(mode) {
  if (tween) return;
  const before = S.mode, zoneBefore = S.zone;
  if (mode === before) return;
  if (mode === 'orbit') { if (zoneBefore === 'in') { goView('whole'); return; } orbitFromCamera(_look.set(0, 48, -6)); orbit.dist = clamp(orbit.dist, 60, 600); }
  else if (before === 'orbit') {
    if (mode === 'walk') { Object.assign(fp, { x: 0, z: 72, yaw: 0, pitch: 0.3 }); fp.y = C.EYE; }
    else fpFromCamera();
  } else if (mode === 'walk') {
    if (C.blocked(fp.x, fp.z)) Object.assign(fp, zoneBefore === 'in' ? { x: 0, z: 41 } : { x: 0, z: 72 });
    fp.y = C.groundY(fp.x, fp.z) + C.EYE; fp.pitch = clamp(fp.pitch, -1.1, 1.1);
  }
  Object.assign(S, C.applyMode(S, mode)); S.mode = mode;
  hint({ orbit: '拖动旋转 · 滚轮或双指缩放 · 右键拖动平移', walk: coarse ? '左下摇杆走动 · 其余地方拖动转头' : 'WASD 走动 · 拖动转头 · Shift 快走 · 三个立面各有一扇门能进', fly: coarse ? '左下摇杆沿视线飞 · 拖动转头' : 'WASD 沿视线飞 · 空格升 Q 降 · Shift 加速' }[mode]);
  placeCamera(); setZone(zoneOf(camera.position)); syncUI();
}

// ---------- 输入 ----------
const ptrs = new Map(); let pinch = 0;
function look(dx, dy, pan) {
  if (tween) return;
  if (S.mode === 'orbit') {
    if (pan) { const s = orbit.dist * 0.0016; orbit.target.x -= (Math.cos(orbit.az) * dx) * s; orbit.target.z += (Math.sin(orbit.az) * dx) * s; orbit.target.y = clamp(orbit.target.y + dy * s, 2, 170); }
    else { orbit.az -= dx * 0.006; orbit.pol = clamp(orbit.pol - dy * 0.005, 0.1, 1.54); }
    orbit.idle = 0;
  } else { fp.yaw -= dx * (coarse ? 0.0065 : 0.0045); fp.pitch = clamp(fp.pitch - dy * 0.004, -1.45, 1.45); }
}
function zoom(k) { if (S.mode === 'orbit' && !tween) { orbit.dist = clamp(orbit.dist * k, 16, 640); orbit.idle = 0; } }
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  const r = stage.getBoundingClientRect(), p = { x: e.clientX, y: e.clientY, role: 'look', pan: e.button === 2 || e.shiftKey };
  if (S.mode !== 'orbit' && e.pointerType === 'touch' && joy.id < 0 && e.clientX - r.left < r.width * 0.45 && e.clientY - r.top > r.height * 0.4) {
    p.role = 'joy'; joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY;
    const j = $('joy'); j.style.display = 'block'; j.style.left = e.clientX - r.left - 56 + 'px'; j.style.top = e.clientY - r.top - 56 + 'px'; j.firstElementChild.style.transform = '';
  }
  ptrs.set(e.pointerId, p); pinch = 0;
});
canvas.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId); if (!p) return;
  if (p.role === 'joy') {
    let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy; const m = Math.hypot(dx, dy), R = 46; if (m > R) { dx *= R / m; dy *= R / m; }
    joy.x = dx / R; joy.y = -dy / R; $('joy').firstElementChild.style.transform = `translate(${dx}px,${dy}px)`;
  } else {
    const looks = [...ptrs.values()].filter(q => q.role === 'look');
    if (looks.length >= 2) { p.x = e.clientX; p.y = e.clientY; const d = Math.hypot(looks[0].x - looks[1].x, looks[0].y - looks[1].y); if (pinch > 0 && d > 0) zoom(pinch / d); pinch = d; return; }
    look(e.clientX - p.x, e.clientY - p.y, p.pan);
  }
  p.x = e.clientX; p.y = e.clientY;
});
const release = e => { const p = ptrs.get(e.pointerId); if (!p) return; if (p.role === 'joy') { joy.id = -1; joy.x = joy.y = 0; $('joy').style.display = 'none'; } ptrs.delete(e.pointerId); pinch = 0; };
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(ev, release);
canvas.addEventListener('wheel', e => { e.preventDefault(); zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
addEventListener('keydown', e => { if (e.target.tagName === 'INPUT') return; const k = e.key.toLowerCase(); keys.add(k); if (k === ' ') e.preventDefault(); if (k === '1') setMode('orbit'); if (k === '2') setMode('walk'); if (k === '3') setMode('fly'); if (k === 'r') goView(S.zone === 'in' ? 'nave' : 'whole'); });
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => { keys.clear(); joy.x = joy.y = 0; joy.id = -1; $('joy').style.display = 'none'; ptrs.clear(); });

// ---------- 界面 ----------
let tab = 'out', hintTimer = 0;
function hint(text) { const h = $('hint'); h.textContent = text; h.style.opacity = 1; clearTimeout(hintTimer); hintTimer = setTimeout(() => { h.style.opacity = 0.55; }, 6000); }
function showCaption(v) { $('capK').textContent = (v.zone === 'in' ? '建筑内部' : '建筑外部') + ' · 导览视点'; $('capT').innerHTML = `${v.cn}<em>${v.en}</em>`; $('capP').textContent = v.text; }
function renderList() {
  const items = C.VIEWS.filter(v => v.zone === tab);
  $('list').innerHTML = items.map(v => `<button data-view="${v.id}"><i>${String(C.VIEWS.indexOf(v) + 1).padStart(2, '0')}</i><div><b>${v.cn}</b><span>${v.en}</span></div></button>`).join('');
  $('count').textContent = `${String(items.length).padStart(2, '0')} / ${C.VIEWS.length}`;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.zone === tab));
  syncUI();
}
function syncUI(pendingView) {
  const cur = pendingView || S.view;
  document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === (pendingView ? C.VIEWS.find(v => v.id === pendingView).mode : S.mode)));
  document.querySelectorAll('#list button').forEach(b => b.classList.toggle('on', b.dataset.view === cur));
  $('hero').style.opacity = S.zone === 'out' && S.mode === 'orbit' && !pendingView ? 1 : 0;
}
$('list').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; goView(b.dataset.view); $('side').classList.remove('open'); });
$('tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; tab = b.dataset.zone; renderList(); });
$('modes').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setMode(b.dataset.mode); });
$('lights').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setLight(b.dataset.light); });
$('resetBtn').addEventListener('click', () => goView(S.zone === 'in' ? 'nave' : 'whole'));
$('drawerBtn').addEventListener('click', () => $('side').classList.toggle('open'));
$('infoBtn').addEventListener('click', () => { $('info').style.display = 'block'; });
$('infoClose').addEventListener('click', () => { $('info').style.display = 'none'; });

// 小平面图：后殿在上，荣耀门在下，诞生在右
const map = $('map'), mg = map.getContext('2d');
const MAP = { s: 1, ox: 0, oy: 0, dots: [] };
function mapXY(x, z) { return [MAP.ox + x * MAP.s, MAP.oy + z * MAP.s]; }
function drawMap() {
  const r = map.getBoundingClientRect(); if (!r.width) return;
  const d = Math.min(2, window.devicePixelRatio || 1); if (map.width !== Math.round(r.width * d)) { map.width = Math.round(r.width * d); map.height = Math.round(r.height * d); }
  const W = r.width, Hh = r.height; mg.setTransform(d, 0, 0, d, 0, 0); mg.clearRect(0, 0, W, Hh);
  MAP.s = (Hh - 44) / 96; MAP.ox = W / 2; MAP.oy = 22 + 48 * MAP.s;
  mg.strokeStyle = '#2b2a20'; mg.lineWidth = 1; for (let g = -60; g <= 60; g += 15) { mg.beginPath(); mg.moveTo(...mapXY(g, -50)); mg.lineTo(...mapXY(g, 50)); mg.stroke(); mg.beginPath(); mg.moveTo(...mapXY(-62, g * 0.8)); mg.lineTo(...mapXY(62, g * 0.8)); mg.stroke(); }
  mg.beginPath();
  const P = [[-C.NAVE_HALF, C.Z_GLORY], [C.NAVE_HALF, C.Z_GLORY], [C.NAVE_HALF, C.Z_NAVE_END], [C.TRANS_HALF, C.Z_NAVE_END], [C.TRANS_HALF, C.Z_TRANS_END], [C.APSE.r, C.Z_TRANS_END]];
  P.forEach(([x, z], i) => i ? mg.lineTo(...mapXY(x, z)) : mg.moveTo(...mapXY(x, z)));
  const [cx, cy] = mapXY(C.APSE.x, C.APSE.z); mg.arc(cx, cy, C.APSE.r * MAP.s, 0, Math.PI, true);
  for (const [x, z] of [[-C.TRANS_HALF, C.Z_TRANS_END], [-C.TRANS_HALF, C.Z_NAVE_END], [-C.NAVE_HALF, C.Z_NAVE_END]]) mg.lineTo(...mapXY(x, z));
  mg.closePath(); mg.fillStyle = '#26241a'; mg.fill(); mg.strokeStyle = '#8f7d45'; mg.lineWidth = 1.4; mg.stroke();
  mg.fillStyle = '#8f7d45'; for (const c of C.COLUMNS) { const [x, y] = mapXY(c.x, c.z); mg.beginPath(); mg.arc(x, y, c.kind === 'crossing' ? 2.2 : 1.4, 0, 7); mg.fill(); }
  mg.fillStyle = '#9c957e'; mg.font = '10px system-ui'; mg.textAlign = 'center';
  mg.fillText('后殿', ...mapXY(0, -49)); mg.fillText('荣耀', ...mapXY(0, 52.5)); mg.textAlign = 'left'; mg.fillText('诞生', ...mapXY(34, -11)); mg.textAlign = 'right'; mg.fillText('受难', ...mapXY(-34, -11));
  MAP.dots = [];
  for (const v of C.VIEWS) {
    let [x, y] = mapXY(v.pos[0], v.pos[2]); x = clamp(x, 10, W - 10); y = clamp(y, 10, Hh - 10);
    const on = v.id === S.view; MAP.dots.push({ id: v.id, x, y });
    mg.beginPath(); mg.arc(x, y, on ? 5 : 3.2, 0, 7); mg.fillStyle = on ? '#f3deA0' : v.zone === 'in' ? '#d9c07a' : '#6f6747'; mg.fill(); if (on) { mg.strokeStyle = '#f3deA055'; mg.lineWidth = 5; mg.stroke(); }
  }
  // 当前镜头：一个带朝向的小三角
  camera.getWorldDirection(_d); let [mx, my] = mapXY(camera.position.x, camera.position.z); mx = clamp(mx, 8, W - 8); my = clamp(my, 8, Hh - 8);
  const a = Math.atan2(_d.z, _d.x); mg.save(); mg.translate(mx, my); mg.rotate(a); mg.beginPath(); mg.moveTo(8, 0); mg.lineTo(-5, 4.5); mg.lineTo(-2, 0); mg.lineTo(-5, -4.5); mg.closePath(); mg.fillStyle = '#ff6a3d'; mg.fill(); mg.restore();
}
map.addEventListener('click', e => {
  const r = map.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; let best = null, bd = 16;
  for (const d of MAP.dots) { const q = Math.hypot(d.x - x, d.y - y); if (q < bd) { bd = q; best = d; } }
  if (best) { const v = C.VIEWS.find(q => q.id === best.id); if (v.zone !== tab) { tab = v.zone; renderList(); } goView(best.id); }
});

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
  renderer.setSize(w, h, false); composer.setPixelRatio(DPR); composer.setSize(w, h);
  bloom.resolution.set(w * DPR / 2, h * DPR / 2);
  camera.aspect = w / h; camera.fov = w < h ? 68 : 52; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

// ---------- 主循环 ----------
const stat = { fps: 0, frames: 0, acc: 0, calls: 0, tris: 0 };
let last = performance.now(), mapAcc = 0;
function step(dt) {
  updateLight(dt); updateCamera(dt);
  renderer.info.reset(); composer.render(dt);
  stat.calls = renderer.info.render.calls; stat.tris = renderer.info.render.triangles;
}
function hud() {
  $('stats').innerHTML = `<b>${stat.fps} fps</b> · ${stat.calls} 次绘制 · ${(stat.tris / 10000).toFixed(1)} 万三角面 · ${S.zone === 'in' ? '内部' : '外部'} · ${{ orbit: '轨道', walk: '漫游', fly: '飞行' }[S.mode]} · ${C.LIGHTS[S.light].cn}`;
}
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now; step(dt);
  stat.frames++; stat.acc += dt; mapAcc += dt;
  if (stat.acc >= 0.5) { stat.fps = Math.round(stat.frames / stat.acc); stat.frames = 0; stat.acc = 0; hud(); }
  if (mapAcc > 0.1) { mapAcc = 0; drawMap(); }
  requestAnimationFrame(frame);
}

// ---------- 验收钩子 ----------
window.__sf = {
  ready: false, C, S, stat, counts: world.counts,
  snapshot: () => ({ ...S, tween: !!tween, cam: camera.position.toArray().map(v => +v.toFixed(2)), fp: { x: +fp.x.toFixed(2), y: +fp.y.toFixed(2), z: +fp.z.toFixed(2), yaw: +fp.yaw.toFixed(3) }, orbit: { az: +orbit.az.toFixed(3), dist: +orbit.dist.toFixed(1) }, light: S.light, cool: +light.cool.toFixed(3), warm: +light.warm.toFixed(3), glass: GLASS.uGI.value.toArray().map(v => +v.toFixed(3)), extVisible: world.ext.visible, intVisible: world.int.visible, fps: stat.fps, calls: stat.calls, tris: stat.tris }),
  setView: (id, instant = true) => goView(id, instant), setLight: (id, instant = true) => { setLight(id, instant); updateLight(0); }, setMode,
  step(ms) { for (let t = 0; t < ms; t += 16) step(0.016); hud(); drawMap(); },
  press(k, on) { on ? keys.add(k) : keys.delete(k); },
  teleport(x, z, yaw = 0, mode = 'walk') { tween = null; S.mode = mode; Object.assign(fp, { x, z, yaw, pitch: 0 }); fp.y = C.groundY(x, z) + C.EYE; placeCamera(); setZone(zoneOf(camera.position)); syncUI(); },
  gpu() { const gl = renderer.getContext(), x = gl.getExtension('WEBGL_debug_renderer_info'); return x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : 'unknown'; },
};

window.__PLAYTEST__ = { ready: false, snapshot: () => window.__sf.snapshot(), reset: () => goView('whole', true), step: ms => window.__sf.step(ms) };
resize(); renderList(); setLight(Q.get('light') || 'morning', true);
goView(Q.get('view') || 'whole', true);
if (Q.get('mode')) setMode(Q.get('mode'));
hint('拖动旋转 · 滚轮或双指缩放 · 右边点视点前往');
step(0.016); hud(); drawMap();
window.__sf.ready = window.__PLAYTEST__.ready = true;
requestAnimationFrame(t => { last = t; frame(t); });
