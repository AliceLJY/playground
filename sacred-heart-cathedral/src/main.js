// 石室圣心大教堂：渲染、三种操作方式（轨道 / 漫游 / 飞行）、视点导览、三档光、界面与验收钩子。
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
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

// 浏览器打不开 WebGL 时盖一层看得清的说明，别让页面空着卡住
function noWebGL() {
  if (document.getElementById('nogl')) return;
  const d = document.createElement('div'); d.id = 'nogl'; d.setAttribute('role', 'alert');
  d.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:28px;box-sizing:border-box;background:#17202b;color:#f6ecdc;font:15px/1.9 system-ui,-apple-system,\'PingFang SC\',\'Microsoft YaHei\',sans-serif;text-align:center';
  d.textContent = '这个页面要用 WebGL 画三维画面，这台设备的浏览器打不开。换一个浏览器，或者打开硬件加速后再试。';
  document.body.append(d);
}
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }); }
catch (e) { noWebGL(); throw e; }
let DPR = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);
renderer.setPixelRatio(DPR);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#dfe6ea', 220, 1500);
const camera = new THREE.PerspectiveCamera(50, 1, 0.15, 4000);
camera.rotation.order = 'YXZ';

const hemi = new THREE.HemisphereLight('#e6eef6', '#b8a98a', 1.2);
const sun = new THREE.DirectionalLight('#fff0d8', 2.6);
sun.castShadow = true; sun.shadow.mapSize.set(coarse ? 2048 : 4096, coarse ? 2048 : 4096);
Object.assign(sun.shadow.camera, { left: -100, right: 100, top: 100, bottom: -100, near: 20, far: 700 }); sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.25;
scene.add(hemi, sun, sun.target);

const world = buildWorld(scene, { coarse });

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { samples: Q.get('msaa') ? +Q.get('msaa') : (coarse || (window.devicePixelRatio || 1) > 1.5 ? 2 : 4), type: THREE.HalfFloatType }));
// 内部墙面的着色贵、又层层叠着：先只写一遍深度，再正式画，看不见的像素就不算了
const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false });
class ScenePass extends Pass {
  constructor() { super(); this.needsSwap = false; }
  render(r, writeBuffer, readBuffer) {
    r.setRenderTarget(this.renderToScreen ? null : readBuffer);
    if (S.zone !== 'in' || !Q.has('pre')) { r.render(scene, camera); return; }
    for (const m of world.noPre) m.visible = false; scene.overrideMaterial = depthOnly; r.render(scene, camera);
    scene.overrideMaterial = null; for (const m of world.noPre) m.visible = true; world.rays.mesh.visible = QUAL[quality].steps > 0 && !Q.has('novol');
    const ac = r.autoClear; r.autoClear = false; r.render(scene, camera); r.autoClear = ac;
  }
}
composer.addPass(new ScenePass());
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.7, 0.82);
if (!Q.has('nobloom')) composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------- 状态 ----------
const S = { mode: 'orbit', zone: 'out', view: 'whole', light: 'morning' };
// 内部的亮度一处调：先暗，再一点点加
const LV = { hemi: 0.95, bloom: 0.22, exp: 1.0, glass: 1.7, vault: 0.8, vol: 1.0 };
for (const k of Object.keys(LV)) if (Q.get(k)) LV[k] = +Q.get(k);
const orbit = { az: 0.6, pol: 1.15, dist: 120, target: new THREE.Vector3(0, 22, 6), idle: 0 };
const fp = { x: 0, y: C.EYE + C.GROUND, z: 79, yaw: 0, pitch: 0.1, v: 0, bob: 0 };
let tween = null;                     // 飞向视点的过程
const keys = new Set();
const joy = { x: 0, y: 0, id: -1, ox: 0, oy: 0 };

// ---------- 光 ----------
const light = { tod: 0, east: 1, west: 0.12, south: 0.3, tTod: 0, tEast: 1, tWest: 0.12, tSouth: 0.3, dirty: true };
// 教堂朝南：上午太阳在东偏南，正午在南，傍晚在西
const SUNS = [[0.8, 0.5, 0.36], [0.12, 0.88, 0.46], [-0.8, 0.42, 0.4]].map(a => new THREE.Vector3(...a).normalize());
const PAL = { sun: ['#ffe9cc', '#fff7ea', '#ffbf85'], zen: ['#6f9fd0', '#5d96d8', '#6a7db4'], hor: ['#e9e4d6', '#dfe9f0', '#f7c79a'], amb: ['#d6e0f0', '#e9e6dc', '#f0d2a8'] };
const _ca = new THREE.Color(), _cb = new THREE.Color();
const tri = (arr, t, out) => { const i = t < 0.5 ? 0 : 1, f = t < 0.5 ? t * 2 : t * 2 - 1; return out.copy(_ca.set(arr[i])).lerp(_cb.set(arr[i + 1]), f); };
const sunDir = new THREE.Vector3();
function setLight(id, instant) {
  const L = C.LIGHTS[id]; if (!L) return;
  S.light = id; light.tTod = L.tod; light.tEast = L.east; light.tWest = L.west; light.tSouth = L.south;
  if (instant) { light.tod = L.tod; light.east = L.east; light.west = L.west; light.south = L.south; }
  light.dirty = true;
  document.querySelectorAll('#lights button').forEach(b => b.classList.toggle('on', b.dataset.light === id));
}
function updateLight(dt) {
  const k = 1 - Math.exp(-dt * 2.2), moving = Math.abs(light.tod - light.tTod) > 0.002 || light.dirty;
  light.tod += (light.tTod - light.tod) * k; light.east += (light.tEast - light.east) * k; light.west += (light.tWest - light.west) * k; light.south += (light.tSouth - light.south) * k;
  if (!moving && !light.zoneDirty) return;
  light.dirty = false; light.zoneDirty = false;
  const t = light.tod, i = t < 0.5 ? 0 : 1, f = t < 0.5 ? t * 2 : t * 2 - 1;
  sunDir.copy(SUNS[i]).lerp(SUNS[i + 1], f).normalize();
  const inside = S.zone === 'in', side = Math.max(light.east, light.west);
  sun.position.copy(sunDir).multiplyScalar(300); sun.target.position.set(0, 0, 0);
  tri(PAL.sun, t, sun.color); sun.intensity = inside ? 0 : 2.9;
  if (inside) {
    // 里面不靠太阳直射：一个偏暗的环境光，再加彩窗投进来的色光
    hemi.intensity = LV.hemi + 0.12 * side; hemi.color.set('#e9e0d0').lerp(_cb.set('#ffcf90'), t > 0.5 ? (t - 0.5) * 0.7 : 0); hemi.groundColor.set('#a09585');
    scene.fog.color.set('#4a4338'); scene.fog.near = 30; scene.fog.far = 240;
    bloom.strength = LV.bloom; bloom.threshold = 0.9; renderer.toneMappingExposure = LV.exp;
  } else {
    hemi.intensity = 1.1; tri(PAL.amb, t, hemi.color); hemi.groundColor.set('#a89c86');
    tri(PAL.hor, t, scene.fog.color); scene.fog.near = 240; scene.fog.far = 1500;
    bloom.strength = 0.1; bloom.threshold = 0.95; renderer.toneMappingExposure = 1;
    renderer.shadowMap.needsUpdate = true;
  }
  const u = world.sky.material.uniforms; u.uSun.value.copy(sunDir); tri(PAL.zen, t, u.uZen.value); tri(PAL.hor, t, u.uHor.value); tri(PAL.sun, t, u.uGlow.value);
  GLASS.uGI.value.set(light.east * LV.glass, light.west * LV.glass, light.south * LV.glass);
  for (const m of world.eastMats) m.color.setScalar(0.3 + 0.75 * light.east);
  for (const m of world.westMats) m.color.setScalar(0.3 + 0.75 * light.west);
  for (const m of world.southMats) m.color.setScalar(0.35 + 0.7 * light.south);
  for (const m of world.apseMats) m.color.setScalar(0.72);
  world.vaultMat.color.setScalar(LV.vault + 0.1 * side);
  // 太阳越高，光斑落得离窗越近；早晚斜着打进来，能铺到对面的柱子上
  GLASS.uGL.value.set(-0.5 - 0.8 * Math.sin(Math.PI * t), -0.12);
  world.rays.vol.uniforms.uK.value = LV.vol * (0.6 + 0.5 * side);
}

// ---------- 镜头 ----------
const _d = new THREE.Vector3(), _look = new THREE.Vector3(), _qa = new THREE.Quaternion(), _m4 = new THREE.Matrix4();
function setZone(z) {
  if (S.zone === z && world.int.visible === (z === 'in') && world.ext.visible === (z !== 'in')) return;
  S.zone = z; world.int.visible = z === 'in'; world.ext.visible = z !== 'in'; world.sky.visible = z !== 'in'; light.zoneDirty = true;
  scene.background = z === 'in' ? new THREE.Color('#14120e') : null;
}
function zoneOf(p) { return C.inside(p.x, p.z) && C.sdFoot(p.x, p.z) < -0.05 && p.y < 29.6 ? 'in' : 'out'; }
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
    if (camera.position.y < C.GROUND + 0.6) camera.position.y = C.GROUND + 0.6;
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
      const v = keys.has('shift') ? 5.5 : 2.4, r = C.moveWalker(fp.x, fp.z, (fx * iy + rx * ix) * v * dt, (fz * iy + rz * ix) * v * dt);
      fp.v = Math.hypot(r.x - fp.x, r.z - fp.z) / Math.max(dt, 1e-4); fp.x = r.x; fp.z = r.z; fp.bob += fp.v * dt * 3;
      fp.y = C.groundY(fp.x, fp.z) + C.EYE;
    } else {
      const v = keys.has('shift') ? 26 : 8, cp = Math.cos(fp.pitch), up = (keys.has(' ') || keys.has('e') ? 1 : 0) - (keys.has('q') ? 1 : 0);
      fp.x += (fx * cp * iy + rx * ix) * v * dt; fp.z += (fz * cp * iy + rz * ix) * v * dt; fp.y = clamp(fp.y + (Math.sin(fp.pitch) * iy + up) * v * dt, C.GROUND + 0.5, 220);
      fp.x = clamp(fp.x, -320, 320); fp.z = clamp(fp.z, -320, 320); fp.v = 0;
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
  if (mode === 'orbit') { if (zoneBefore === 'in') { goView('whole'); return; } orbitFromCamera(_look.set(0, 22, 6)); orbit.dist = clamp(orbit.dist, 30, 300); }
  else if (before === 'orbit') {
    if (mode === 'walk') { Object.assign(fp, { x: 0, z: 79, yaw: 0, pitch: 0.3 }); fp.y = C.groundY(0, 79) + C.EYE; }
    else fpFromCamera();
  } else if (mode === 'walk') {
    if (C.blocked(fp.x, fp.z)) Object.assign(fp, zoneBefore === 'in' ? { x: 0, z: 35 } : { x: 0, z: 79 });
    fp.y = C.groundY(fp.x, fp.z) + C.EYE; fp.pitch = clamp(fp.pitch, -1.1, 1.1);
  }
  Object.assign(S, C.applyMode(S, mode)); S.mode = mode;
  hint({ orbit: '拖动旋转 · 滚轮或双指缩放 · 右键拖动平移', walk: coarse ? '左下摇杆走动 · 其余地方拖动转头' : 'WASD 走动 · 拖动转头 · Shift 快走 · 正面三座门都能走进去', fly: coarse ? '左下摇杆沿视线飞 · 拖动转头' : 'WASD 沿视线飞 · 空格升 Q 降 · Shift 加速' }[mode]);
  placeCamera(); setZone(zoneOf(camera.position)); syncUI();
}

// ---------- 输入 ----------
const ptrs = new Map(); let pinch = 0;
function look(dx, dy, pan) {
  if (tween) return;
  if (S.mode === 'orbit') {
    if (pan) { const s = orbit.dist * 0.0016; orbit.target.x -= (Math.cos(orbit.az) * dx) * s; orbit.target.z += (Math.sin(orbit.az) * dx) * s; orbit.target.y = clamp(orbit.target.y + dy * s, 1, 58); }
    else { orbit.az -= dx * 0.006; orbit.pol = clamp(orbit.pol - dy * 0.005, 0.1, 1.54); }
    orbit.idle = 0;
  } else { fp.yaw -= dx * (coarse ? 0.0065 : 0.0045); fp.pitch = clamp(fp.pitch - dy * 0.004, -1.45, 1.45); }
}
function zoom(k) { if (S.mode === 'orbit' && !tween) { orbit.dist = clamp(orbit.dist * k, 7, 420); orbit.idle = 0; } }
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

// 小平面图：北（后殿）在上，南（正门、一德路）在下，东在右
const map = $('map'), mg = map.getContext('2d');
const MAP = { s: 1, ox: 0, oy: 0, dots: [] };
function mapXY(x, z) { return [MAP.ox + x * MAP.s, MAP.oy + z * MAP.s]; }
function drawMap() {
  const r = map.getBoundingClientRect(); if (!r.width) return;
  const d = Math.min(2, window.devicePixelRatio || 1); if (map.width !== Math.round(r.width * d)) { map.width = Math.round(r.width * d); map.height = Math.round(r.height * d); }
  const W = r.width, Hh = r.height; mg.setTransform(d, 0, 0, d, 0, 0); mg.clearRect(0, 0, W, Hh);
  MAP.s = (Hh - 24) / 140; MAP.ox = W / 2; MAP.oy = 12 + 48 * MAP.s;
  const Y = C.YARD, line = (pts, close) => { mg.beginPath(); pts.forEach(([x, z], i) => i ? mg.lineTo(...mapXY(x, z)) : mg.moveTo(...mapXY(x, z))); if (close) mg.closePath(); };
  line([[Y.x0, Y.z0], [Y.x1, Y.z0], [Y.x1, Y.z1], [Y.x0, Y.z1]], true); mg.fillStyle = '#1a1a13'; mg.fill(); mg.strokeStyle = '#3a382b'; mg.lineWidth = 1; mg.stroke();
  mg.fillStyle = '#23221a'; for (const b of C.BUILDINGS) { const [x, y] = mapXY(b.x - b.hx, b.z - b.hz); mg.fillRect(x, y, b.hx * 2 * MAP.s, b.hz * 2 * MAP.s); }
  mg.beginPath();
  [[-C.CHAP, C.Z_FRONT + 0.6], [C.CHAP, C.Z_FRONT + 0.6], [C.CHAP, C.Z_CROSS0], [C.TRANS, C.Z_CROSS0], [C.TRANS, C.Z_CROSS1], [C.CHAP, C.Z_CROSS1], [C.CHAP, C.Z_APSE], [C.APSE_R, C.Z_APSE]].forEach(([x, z], i) => i ? mg.lineTo(...mapXY(x, z)) : mg.moveTo(...mapXY(x, z)));
  const [cx, cy] = mapXY(0, C.Z_APSE); mg.arc(cx, cy, C.APSE_R * MAP.s, 0, Math.PI, true);
  for (const [x, z] of [[-C.CHAP, C.Z_APSE], [-C.CHAP, C.Z_CROSS1], [-C.TRANS, C.Z_CROSS1], [-C.TRANS, C.Z_CROSS0], [-C.CHAP, C.Z_CROSS0]]) mg.lineTo(...mapXY(x, z));
  mg.closePath(); mg.fillStyle = '#2b281c'; mg.fill(); mg.strokeStyle = '#8f7d45'; mg.lineWidth = 1.4; mg.stroke();
  mg.strokeStyle = '#d9c07a'; mg.lineWidth = 1; for (const s of [-1, 1]) { const [x, y] = mapXY(s * C.TOWER.cx - C.TOWER.half, C.TOWER.z0); mg.strokeRect(x, y, C.TOWER.half * 2 * MAP.s, (C.TOWER.z1 - C.TOWER.z0) * MAP.s); }
  mg.fillStyle = '#8f7d45'; for (const c of C.PIERS) { const [x, y] = mapXY(c.x, c.z); mg.beginPath(); mg.arc(x, y, c.kind === 'cross' ? 1.8 : 1.2, 0, 7); mg.fill(); }
  mg.fillStyle = '#9c957e'; mg.font = '10px system-ui'; mg.textAlign = 'center';
  mg.fillText('北 · 后殿', ...mapXY(0, -42)); mg.fillText('一德路', ...mapXY(0, 91)); mg.fillText('广场', ...mapXY(-22, 64)); mg.textAlign = 'left'; mg.fillText('东', ...mapXY(20, -11)); mg.textAlign = 'right'; mg.fillText('西', ...mapXY(-20, -11));
  MAP.dots = [];
  for (const v of C.VIEWS) {
    let [x, y] = mapXY(v.pos[0], v.pos[2]); x = clamp(x, 10, W - 10); y = clamp(y, 10, Hh - 10);
    const on = v.id === S.view; MAP.dots.push({ id: v.id, x, y });
    mg.beginPath(); mg.arc(x, y, on ? 5 : 3.2, 0, 7); mg.fillStyle = on ? '#f3deA0' : v.zone === 'in' ? '#d9c07a' : '#6f6747'; mg.fill(); if (on) { mg.strokeStyle = '#f3deA055'; mg.lineWidth = 5; mg.stroke(); }
  }
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

// ---------- 画质 ----------
// 高：全分辨率、体积光 26 步；中：1.5 倍像素、14 步（手机默认）；低：1 倍像素、不算体积光、不泛光。连续掉到 28 帧以下会自动降一档。
const QUAL = { high: { cn: '高', dpr: 2, steps: 12, bloom: true }, mid: { cn: '中', dpr: 1.5, steps: 8, bloom: true }, low: { cn: '低', dpr: 1, steps: 0, bloom: false } };
let quality = QUAL[Q.get('q')] ? Q.get('q') : (coarse ? 'mid' : 'high'), slow = 0;
function setQuality(q, auto) {
  if (!QUAL[q]) return; quality = q; const k = QUAL[q];
  DPR = Math.min(window.devicePixelRatio || 1, k.dpr); renderer.setPixelRatio(DPR);
  world.rays.vol.uniforms.uSteps.value = Math.max(1, k.steps); world.rays.mesh.visible = k.steps > 0 && !Q.has('novol'); bloom.enabled = k.bloom;
  $('qBtn').textContent = '画质 ' + k.cn + (auto ? '（自动）' : ''); resize();
}
$('qBtn').addEventListener('click', () => setQuality({ high: 'mid', mid: 'low', low: 'high' }[quality]));

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
  if (stat.acc >= 0.5) { stat.fps = Math.round(stat.frames / stat.acc); stat.frames = 0; stat.acc = 0; hud(); slow = stat.fps < 28 && document.visibilityState === 'visible' ? slow + 1 : 0; if (slow >= 4 && quality !== 'low' && !Q.has('noauto')) { slow = 0; setQuality(quality === 'high' ? 'mid' : 'low', true); } }
  if (mapAcc > 0.1) { mapAcc = 0; drawMap(); }
  requestAnimationFrame(frame);
}

// ---------- 验收钩子 ----------
window.__ss = window.__sf = {
  ready: false, C, S, stat, LV, world, scene, relight() { light.dirty = true; updateLight(0); }, counts: world.counts,
  snapshot: () => ({ ...S, tween: !!tween, cam: camera.position.toArray().map(v => +v.toFixed(2)), fp: { x: +fp.x.toFixed(2), y: +fp.y.toFixed(2), z: +fp.z.toFixed(2), yaw: +fp.yaw.toFixed(3) }, orbit: { az: +orbit.az.toFixed(3), dist: +orbit.dist.toFixed(1) }, light: S.light, east: +light.east.toFixed(3), west: +light.west.toFixed(3), south: +light.south.toFixed(3), glass: GLASS.uGI.value.toArray().map(v => +v.toFixed(3)), extVisible: world.ext.visible, intVisible: world.int.visible, fps: stat.fps, calls: stat.calls, tris: stat.tris }),
  quality: () => quality, setQuality,
  // 任意机位（对照截图用）：临时加一个视点，飞过去再拿掉
  shot(pos, look, fov) { if (fov) { camera.fov = fov; camera.updateProjectionMatrix(); } C.VIEWS.push({ id: '_shot', cn: '', en: '', zone: C.inside(pos[0], pos[2]) && pos[1] < 29.6 ? 'in' : 'out', pos, look, mode: 'fly', text: '' }); goView('_shot', true); C.VIEWS.pop(); },
  setView: (id, instant = true) => goView(id, instant), setLight: (id, instant = true) => { setLight(id, instant); updateLight(0); }, setMode,
  step(ms) { for (let t = 0; t < ms; t += 16) step(0.016); hud(); drawMap(); },
  press(k, on) { on ? keys.add(k) : keys.delete(k); },
  teleport(x, z, yaw = 0, mode = 'walk') { tween = null; S.mode = mode; Object.assign(fp, { x, z, yaw, pitch: 0 }); fp.y = C.groundY(x, z) + C.EYE; placeCamera(); setZone(zoneOf(camera.position)); syncUI(); },
  gpu() { const gl = renderer.getContext(), x = gl.getExtension('WEBGL_debug_renderer_info'); return x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : 'unknown'; },
};

window.__PLAYTEST__ = { ready: false, snapshot: () => window.__sf.snapshot(), reset: () => goView('whole', true), step: ms => window.__sf.step(ms) };
setQuality(quality); renderList(); setLight(Q.get('light') || 'morning', true);
goView(Q.get('view') || 'whole', true);
if (Q.get('mode')) setMode(Q.get('mode'));
hint('拖动旋转 · 滚轮或双指缩放 · 右边点视点前往');
step(0.016); hud(); drawMap();
window.__sf.ready = window.__PLAYTEST__.ready = true;
requestAnimationFrame(t => { last = t; frame(t); });
