// 十三行江岸：渲染、三种视角（俯瞰 / 第一人称步行 / 跟随）、界面与验收钩子。
import * as THREE from 'three';
import * as C from './core.js';
import { buildWorld } from './world.js';
import { createPeople } from './people.js';
import { createAudio } from './audio.js';

const Q = new URLSearchParams(location.search);
const $ = id => document.getElementById(id);
const canvas = $('scene');
const coarse = matchMedia('(pointer:coarse)').matches;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const DPR = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);
renderer.setPixelRatio(DPR);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = !coarse;   // 桌面：人和船的影子逐帧更新；手机：只烘一次建筑的影子，人用圆片影

const scene = new THREE.Scene();
const FOG = new THREE.Color('#d6d0bc');
scene.fog = new THREE.Fog(FOG, 140, 1500);
const camera = new THREE.PerspectiveCamera(55, 1, 0.25, 5000);
camera.rotation.order = 'YXZ';

const SUN = new THREE.Vector3(-0.52, 0.62, 0.59).normalize();
scene.add(new THREE.HemisphereLight('#e6eef2', '#b3a17c', 1.5));
const sun = new THREE.DirectionalLight('#fff0d2', 2.5);
sun.position.copy(SUN).multiplyScalar(300).add(new THREE.Vector3(0, 0, -40)); sun.target.position.set(0, 0, -40);
sun.castShadow = true; sun.shadow.mapSize.set(coarse ? 2048 : 4096, coarse ? 2048 : 4096);
Object.assign(sun.shadow.camera, { left: -215, right: 215, top: 130, bottom: -130, near: 10, far: 700 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.25;
scene.add(sun, sun.target);

// 天穹
const sky = new THREE.Mesh(new THREE.SphereGeometry(4200, 24, 12), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { uSun: { value: SUN }, uHor: { value: FOG }, uZen: { value: new THREE.Color('#86a9c2') } },
  vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: `varying vec3 vD; uniform vec3 uSun, uHor, uZen;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y); }
    float fbm(vec2 p){ return vn(p) * .5 + vn(p * 2.03 + 7.) * .25 + vn(p * 4.1 + 13.) * .125; }
        void main(){ vec3 d = normalize(vD); float h = clamp(d.y, 0., 1.);
      vec3 c = mix(uHor, uZen, pow(h, .55));
      vec2 cp = d.xz / (d.y + .14) * 1.3;
      float cl = smoothstep(.42, .72, fbm(cp * vec2(.55, 1.5) + 3.));
      c = mix(c, vec3(1., .97, .91), cl * smoothstep(.03, .2, d.y) * .6);
      c += vec3(1., .85, .6) * pow(max(dot(d, uSun), 0.), 24.) * .35;
      gl_FragColor = vec4(c, 1.);
      #include <colorspace_fragment>
    }`,
}));
scene.add(sky);

// 江水
const waterMat = new THREE.ShaderMaterial({
  uniforms: { uT: { value: 0 }, uCam: { value: new THREE.Vector3() }, uSun: { value: SUN }, uFog: { value: FOG }, uDeep: { value: new THREE.Color('#77845f') }, uSky: { value: new THREE.Color('#cdd6d2') }, uNear: { value: 140 }, uFar: { value: 1500 } },
  vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: `varying vec3 vW; uniform float uT, uNear, uFar; uniform vec3 uCam, uSun, uFog, uDeep, uSky;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y); }
    float fbm(vec2 p){ return vn(p) * .5 + vn(p * 2.03 + 7.) * .25 + vn(p * 4.1 + 13.) * .125; }
    float h(vec2 p){ return fbm(p * .3 + vec2(uT * .22, uT * .09)) * 2.6 + fbm(p * 1.1 - vec2(uT * .35, uT * .1)) * .8 + sin((p.x + p.y) * .21 + uT * .5) * .25; }
    void main(){ vec2 p = vW.xz; float e = .3;
      float hx = h(p + vec2(e, 0.)) - h(p - vec2(e, 0.)), hz = h(p + vec2(0., e)) - h(p - vec2(0., e));
      float dist = length(uCam - vW), amp = .55 / (1. + dist * .005);
      vec3 n = normalize(vec3(-hx * amp, 1., -hz * amp)), v = normalize(uCam - vW);
      float fr = pow(1. - max(dot(n, v), 0.), 3.);
      vec3 c = mix(uDeep, uSky, clamp(.16 + fr * .85, 0., 1.));
      float sp = max(dot(reflect(-v, n), uSun), 0.); c += vec3(1., .94, .78) * (pow(sp, 160.) * 1.6 + pow(sp, 24.) * .18);
      c += (hx + hz) * .02 * amp;
      c = mix(c, uFog, smoothstep(uNear, uFar, dist));
      gl_FragColor = vec4(c, 1.);
      #include <colorspace_fragment>
    }`,
});
const water = new THREE.Mesh(new THREE.PlaneGeometry(9000, 5200), waterMat);
water.rotation.x = -Math.PI / 2; water.position.set(0, C.WATER_Y, 900); scene.add(water);

// ---- 模拟与场景 ----
const sim = C.createSim(Number(Q.get('seed')) || 1805, Number(Q.get('crowd')) || (coarse ? 0.6 : 1));
const skip = sec => { for (let t = 0; t < sec; t += 0.1) C.stepSim(sim, 0.1); };
if (Q.get('t')) skip(Number(Q.get('t')));
const world = buildWorld(scene, sim, { plainFlags: Q.get('flags') === 'plain', shadows: !coarse });
const people = createPeople(scene, sim, { shadows: !coarse });
const audio = createAudio();
renderer.shadowMap.needsUpdate = true;

// 馆名标签（俯瞰时显示）
const labels = [...C.FACTORIES.map(f => ({ cn: f.cn, x: f.cx, y: f.storeys * 4.7 + 6, z: C.FRONT })), ...C.LANES.map(l => ({ cn: l.cn, x: l.cx, y: 3, z: C.FRONT + 4, lane: true }))];
for (const l of labels) { l.el = document.createElement('div'); l.el.textContent = l.cn; if (l.lane) l.el.className = 'lane'; $('labels').appendChild(l.el); }

// ---- 视角 ----
const S = {
  mode: 'top', follow: null, speed: Number(Q.get('speed')) || 1, started: false,
  top: { az: 0.42, pol: 1.08, dist: 250, tx: 4, tz: -22, idle: 99 },
  walk: { x: 27, z: -7, yaw: 0.55, pitch: 0.04, bob: 0, v: 0 },
  fol: { yaw: 0, pitch: 0.24, dist: 4, h: 0, pos: new THREE.Vector3(), init: false },
};
const FOLLOW_DIST = { sampan: 9, ferry: 12, chop: 17, junk: 34, flower: 24, sedan: 6 };
const keys = new Set();
const lerpA = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function setMode(mode, follow = null) {
  S.mode = mode; S.follow = follow;
  if (mode === 'follow') {
    const f = sim.follow[follow];
    S.fol.dist = f.boat != null ? FOLLOW_DIST[sim.boats[f.boat].type] : 4; S.fol.pitch = f.boat != null ? 0.3 : 0.2; S.fol.yaw = follow === 'sedan' ? 0.9 : 0; S.fol.init = false;
    if (follow === 'tea' && sim.boats[0].hidden) hint('茶艇还没进港，稍等片刻；右下 ×1 可以调快');
  }
  if (mode === 'walk') hint(coarse ? '左下摇杆走动 · 其余地方拖动转头' : 'WASD 走动 · 拖动转头 · Shift 快走');
  if (mode === 'top') { S.top.idle = 0; hint('拖动旋转 · 滚轮或双指缩放'); }
  document.querySelectorAll('#views button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode || (mode === 'follow' && b.dataset.follow === follow)));
  $('where').style.display = mode === 'top' ? 'none' : 'block';
  $('labels').style.display = mode === 'top' ? 'block' : 'none';
  resize();
}
let hintTimer = 0;
function hint(text) { const h = $('hint'); h.textContent = text; h.classList.add('show'); clearTimeout(hintTimer); hintTimer = setTimeout(() => h.classList.remove('show'), 4200); }

function followTarget(out) {
  const f = sim.follow[S.follow];
  if (f.boat != null) { const b = sim.boats[f.boat]; out.set(b.x, b.land ? 1.5 : C.WATER_Y + C.DECK[b.type] + (b.type === 'junk' ? 4 : 1.8), b.z); return b.h; }
  const a = sim.agents[f.agent], w = C.agentWorld(sim, a); out.set(w.x, w.y + 1.5 * a.scale, w.z); return w.h;
}
const _t = new THREE.Vector3(), _want = new THREE.Vector3(), _look = new THREE.Vector3();
function updateCamera(dt) {
  if (S.mode === 'top') {
    const T = S.top; T.idle += dt; if (T.idle > 10 && S.started) T.az += dt * 0.025;
    const sp = Math.sin(T.pol);
    camera.position.set(T.tx + T.dist * sp * Math.sin(T.az), T.dist * Math.cos(T.pol), T.tz + T.dist * sp * Math.cos(T.az));
    camera.lookAt(T.tx, 4, T.tz);
  } else if (S.mode === 'walk') {
    const W = S.walk;
    let ix = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0) + joy.x;
    let iy = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0) + joy.y;
    const m = Math.hypot(ix, iy); if (m > 1) { ix /= m; iy /= m; }
    const v = (keys.has('shift') ? 5.5 : 2.5), fx = -Math.sin(W.yaw), fz = -Math.cos(W.yaw);
    const dx = (fx * iy + Math.cos(W.yaw) * ix) * v * dt, dz = (fz * iy - Math.sin(W.yaw) * ix) * v * dt;
    const r = C.moveWalker(W.x, W.z, dx, dz);
    W.v = Math.hypot(r.x - W.x, r.z - W.z) / Math.max(dt, 1e-4); W.x = r.x; W.z = r.z; W.bob += W.v * dt * 3.2;
    camera.position.set(W.x, C.groundY(W.x, W.z) + 1.62 + Math.sin(W.bob) * 0.03 * Math.min(1, W.v), W.z);
    camera.rotation.set(W.pitch, W.yaw, 0);
  } else {
    const Fo = S.fol, h = followTarget(_t);
    Fo.h = Fo.init ? lerpA(Fo.h, h, 1 - Math.exp(-dt * 2.5)) : h;
    const A = Fo.h + Math.PI + Fo.yaw, cp = Math.cos(Fo.pitch);
    _want.set(_t.x + Math.sin(A) * cp * Fo.dist, _t.y + Math.sin(Fo.pitch) * Fo.dist + 0.25, _t.z + Math.cos(A) * cp * Fo.dist);
    const floor = (_want.z > 0 ? C.WATER_Y : 0) + 0.5; if (_want.y < floor) _want.y = floor;
    if (!Fo.init) { Fo.pos.copy(_want); Fo.init = true; } else Fo.pos.lerp(_want, 1 - Math.exp(-dt * 5));
    camera.position.copy(Fo.pos);
    _look.set(_t.x + Math.sin(Fo.h) * Fo.dist * 0.4, _t.y, _t.z + Math.cos(Fo.h) * Fo.dist * 0.4);
    camera.lookAt(_look);
  }
}

// ---- 输入 ----
const joy = { x: 0, y: 0, id: -1, ox: 0, oy: 0 };
const ptrs = new Map();
let pinch = 0;
function look(dx, dy) {
  if (S.mode === 'top') { S.top.az -= dx * 0.006; S.top.pol = clamp(S.top.pol - dy * 0.004, 0.12, 1.5); S.top.idle = 0; }
  else if (S.mode === 'walk') { S.walk.yaw -= dx * (coarse ? 0.0065 : 0.0045); S.walk.pitch = clamp(S.walk.pitch - dy * 0.004, -1.1, 1.1); }
  else { S.fol.yaw -= dx * 0.006; S.fol.pitch = clamp(S.fol.pitch + dy * 0.004, -0.05, 1.25); }
}
function zoom(k) {
  if (S.mode === 'top') { S.top.dist = clamp(S.top.dist * k, 45, 560); S.top.idle = 0; }
  else if (S.mode === 'follow') S.fol.dist = clamp(S.fol.dist * k, 1.6, 90);
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
  if (p.role === 'joy') {
    let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy; const m = Math.hypot(dx, dy), R = 46; if (m > R) { dx *= R / m; dy *= R / m; }
    joy.x = dx / R; joy.y = -dy / R; $('joy').firstElementChild.style.transform = `translate(${dx}px,${dy}px)`;
  } else {
    const looks = [...ptrs.values()].filter(q => q.role === 'look');
    if (looks.length >= 2) {
      const px = p.x, py = p.y; p.x = e.clientX; p.y = e.clientY;
      const d = Math.hypot(looks[0].x - looks[1].x, looks[0].y - looks[1].y);
      if (pinch > 0 && d > 0) zoom(pinch / d); pinch = d; void px; void py;
      return;
    }
    look(e.clientX - p.x, e.clientY - p.y);
  }
  p.x = e.clientX; p.y = e.clientY;
});
const release = e => {
  const p = ptrs.get(e.pointerId); if (!p) return;
  if (p.role === 'joy') { joy.id = -1; joy.x = joy.y = 0; $('joy').style.display = 'none'; }
  ptrs.delete(e.pointerId); pinch = 0;
};
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(ev, release);
canvas.addEventListener('wheel', e => { e.preventDefault(); zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
addEventListener('keydown', e => { const k = e.key.toLowerCase(); keys.add(k); if (k === '1') setMode('top'); if (k === '2') setMode('walk'); });
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => { keys.clear(); joy.x = joy.y = 0; joy.id = -1; $('joy').style.display = 'none'; ptrs.clear(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { keys.clear(); joy.x = joy.y = 0; } });

// ---- 界面 ----
document.querySelectorAll('#views button').forEach(b => b.addEventListener('click', () => { audio.start(); b.dataset.mode ? setMode(b.dataset.mode) : setMode('follow', b.dataset.follow); }));
$('event').addEventListener('click', () => setMode('follow', sim.event.stage === 'load' || sim.event.stage === 'inspect' ? 'porter' : 'tea'));
$('speed').addEventListener('click', () => { S.speed = S.speed === 1 ? 4 : 1; $('speed').textContent = '×' + S.speed; $('speed').classList.toggle('on', S.speed > 1); });
$('mute').addEventListener('click', () => { audio.start(); audio.setMuted(!audio.muted); $('mute').textContent = audio.muted ? '声音 关' : '声音 开'; });
$('infoBtn').addEventListener('click', () => { $('info').style.display = 'block'; });
$('infoClose').addEventListener('click', () => { $('info').style.display = 'none'; });
function begin(mode, follow) { S.started = true; $('intro').style.display = 'none'; setMode(mode, follow); }
$('goTop').addEventListener('click', () => { audio.start(); begin('top'); });
$('goWalk').addEventListener('click', () => { audio.start(); begin('walk'); });
if (Q.has('mute')) audio.setMuted(true);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  camera.fov = w < h ? (S.mode === 'top' ? 62 : 72) : (S.mode === 'top' ? 46 : 60);
  camera.updateProjectionMatrix();
  if (S.mode === 'top' && !S.top.fit) S.top.dist = w < h ? 330 : 250;
}
addEventListener('resize', resize);

// ---- 主循环 ----
const stat = { fps: 0, frames: 0, acc: 0, calls: 0, tris: 0 };
let last = performance.now(), T = 0;
const _v = new THREE.Vector3();
function frame(now) {
  const real = Math.min(0.1, (now - last) / 1000); last = now;
  step(real);
  stat.frames++; stat.acc += real;
  if (stat.acc >= 0.5) { stat.fps = Math.round(stat.frames / stat.acc); stat.frames = 0; stat.acc = 0; hud(); }
  requestAnimationFrame(frame);
}
function step(real) {
  const n = Math.max(1, Math.round(S.speed));
  for (let i = 0; i < n; i++) C.stepSim(sim, Math.min(0.05, real));
  T += real;
  world.update(T); people.update(T); updateCamera(real);
  waterMat.uniforms.uT.value = T; waterMat.uniforms.uCam.value.copy(camera.position); sky.position.copy(camera.position);
  audio.update(real, sim, { x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw: camera.rotation.y }, S.mode === 'walk' ? S.walk.v : 0);
  renderer.render(scene, camera);
  stat.calls = renderer.info.render.calls; stat.tris = renderer.info.render.triangles;
  if (S.mode === 'top') {
    const placed = [], cw = innerWidth < 520 ? 11 : 13;
    for (const l of labels) {
      _v.set(l.x, l.y, l.z).project(camera);
      let ok = _v.z < 1 && Math.abs(_v.x) < 1.05 && Math.abs(_v.y) < 1.05 && camera.position.z > l.z + 20;
      const sx = (_v.x * 0.5 + 0.5) * innerWidth, sy = (-_v.y * 0.5 + 0.5) * innerHeight, hw = l.cn.length * cw / 2 + 7;
      if (ok && placed.some(q => Math.abs(q.x - sx) < q.hw + hw && Math.abs(q.y - sy) < 20)) ok = false;   // 挤在一起时只留先放下的
      l.el.style.display = ok ? 'block' : 'none';
      if (ok) { placed.push({ x: sx, y: sy, hw }); l.el.style.left = sx + 'px'; l.el.style.top = sy + 'px'; }
    }
  }
}
function hud() {
  $('stats').innerHTML = `${stat.fps} fps · ${stat.calls} 次绘制<br>${(stat.tris / 10000).toFixed(1)} 万三角面 · ${sim.agents.length} 人 ${sim.boats.length} 船`;
  const e = sim.event, total = { wait: C.EVENT.wait, inspect: C.EVENT.inspect, hoist: C.EVENT.hoist }[e.stage];
  const prog = e.stage === 'load' ? e.loaded / C.EVENT.chests : total ? e.t / total : e.stage === 'arrive' ? Math.min(1, e.t / 50) : Math.min(1, e.t / 85);
  $('event').querySelector('span').textContent = `${innerWidth < 520 ? '名场面' : '名场面 · 茶箱落艇'}｜${C.STAGE_CN[e.stage]}${e.stage === 'load' ? ` ${e.loaded}/${C.EVENT.chests}` : ''}`;
  $('event').querySelector('i').style.width = Math.round(prog * 100) + '%';
  if (S.mode !== 'top') {
    const p = camera.position;
    $('where').textContent = S.mode === 'follow' ? sim.follow[S.follow].note : p.z > 0.2 ? '码头' : p.z < C.FRONT ? C.nearestFactory(p.x) : `${C.nearestFactory(p.x)}前`;
  }
}

// ---- 验收钩子与固定机位 ----
const VIEWS = {
  top: () => begin('top'),
  wide: () => { begin('top'); Object.assign(S.top, { az: 0.05, pol: 1.25, dist: 300, fit: true }); },
  walk: () => begin('walk'),
  quay: () => { begin('walk'); Object.assign(S.walk, { x: 40, z: 9, yaw: 2.2, pitch: -0.05 }); },
  lane: () => { begin('walk'); Object.assign(S.walk, { x: C.LANES[0].cx, z: -70, yaw: 0, pitch: 0.05 }); },
  facade: () => { begin('walk'); Object.assign(S.walk, { x: 70, z: -22, yaw: -0.5, pitch: 0.16 }); },
};
for (const k of Object.keys(sim.follow)) VIEWS[k] = () => begin('follow', k);
window.__hong = {
  sim, C, S, stat, views: Object.keys(VIEWS), ready: false,
  setView(v) { if (!VIEWS[v]) return null; VIEWS[v](); step(0.016); step(0.016); hud(); return { mode: S.mode, follow: S.follow }; },
  skip(sec) { skip(sec); step(0.016); hud(); return sim.event.stage; },
  gpu() { const gl = renderer.getContext(), x = gl.getExtension('WEBGL_debug_renderer_info'); return x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : 'unknown'; },
  press(k, on) { on ? keys.add(k) : keys.delete(k); },
};
window.__PLAYTEST__ = {
  ready: false,
  snapshot: () => ({ mode: S.mode, follow: S.follow, t: +sim.t.toFixed(2), stage: sim.event.stage, loaded: sim.event.loaded, cycles: sim.event.cycles, cam: camera.position.toArray().map(v => +v.toFixed(2)), walk: { x: +S.walk.x.toFixed(2), z: +S.walk.z.toFixed(2) }, fps: stat.fps, calls: stat.calls, tris: stat.tris }),
  step(ms) { for (let t = 0; t < ms; t += 16) step(0.016); hud(); },
};
resize(); setMode('top');
if (Q.get('view') && VIEWS[Q.get('view')]) VIEWS[Q.get('view')]();
step(0.016); hud();
window.__hong.ready = window.__PLAYTEST__.ready = true;
requestAnimationFrame(t => { last = t; frame(t); });
