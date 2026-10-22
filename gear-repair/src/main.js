// 齿轮返修：场景、版本切换、穿模高亮、固定机位、验收钩子。
// 齿形函数（src/gear-profile.js）和穿模检测（src/gear-mesh.js）与 Node 测试共用同一份代码。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const { PARAMS: P, PAIRS, angles, PairChecker } = window.GearMesh;
const Profile = window.GearProfile;
const Framing = window.GearFraming;
const VERSIONS = Profile.VERSIONS;
const VIEWS = Framing.VIEWS;
const SLOW = 0.2;                         // 慢放倍率
const MAX_MARKERS = 480;
const CYCLE_FRAMES = 60;                  // 一个齿周期取的帧数，与 dsh 的检测一致

/* ---------------- URL 参数 ---------------- */
const qs = new URLSearchParams(location.search);
let version = VERSIONS.includes(qs.get('version')) ? qs.get('version') : 'original';
let view = VIEWS.includes(qs.get('view')) ? qs.get('view') : 'hero';
const tParam = qs.has('t') && isFinite(parseFloat(qs.get('t'))) ? parseFloat(qs.get('t')) : null;
let highlight = qs.get('hl') !== '0';
let slow = qs.get('slow') === '1';
let playing = tParam === null;
let simT = tParam === null ? 0 : tParam;

/* ---------------- 渲染器、场景、灯光（沿用 dsh 的设置） ---------------- */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e1116);

const camera = new THREE.PerspectiveCamera(Framing.FOV, innerWidth / innerHeight, 0.1, 500);
let renderer;
try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch (err) {
  document.body.insertAdjacentHTML('beforeend', '<p id="nogl" style="position:fixed;inset:0;margin:0;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;line-height:1.7;z-index:20;background:#0e1116">这个浏览器打不开 WebGL，看不了这页 3D。换 Chrome、Safari 或 Edge 的新版本试试。</p>');
  throw err;
}
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.body.insertBefore(renderer.domElement, document.body.firstChild);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

scene.add(new THREE.AmbientLight(0x8fa0b8, 0.6));
const key = new THREE.DirectionalLight(0xffffff, 2.6);
key.position.set(28, 40, 34);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -50; key.shadow.camera.right = 70;
key.shadow.camera.top = 45; key.shadow.camera.bottom = -45;
key.shadow.camera.near = 1; key.shadow.camera.far = 150;
key.shadow.bias = -0.0004;
scene.add(key);
const fill = new THREE.DirectionalLight(0xbcd2ff, 0.8);
fill.position.set(-30, 10, 20);
scene.add(fill);
const rim = new THREE.PointLight(0xffd166, 80, 0, 2);
rim.position.set(12, -6, 42);
scene.add(rim);

/* ---------------- 齿轮：两版的几何都按需生成并缓存 ---------------- */
const GEARS = {
  A: { N: P.NA, color: 0xd9a441, x: -P.bx, z: -P.zL },
  B: { N: P.NB, color: 0x4f8cff, x: 0, z: -P.zL },
  C: { N: P.NC, color: 0x9a5cff, x: 0, z: +P.zL },
  D: { N: P.ND, color: 0xc9ced6, x: +P.bx, z: +P.zL },
};
const shapes = { original: {}, repaired: {} };
const geos = { original: {}, repaired: {} };
const polys = { original: null, repaired: null };
const checkers = { original: null, repaired: null };

function shapeOf(v, k) {
  return shapes[v][k] || (shapes[v][k] = Profile.makeGearShape(THREE, v, GEARS[k].N, P.m));
}
function geoOf(v, k) {
  if (geos[v][k]) return geos[v][k];
  const geo = new THREE.ExtrudeGeometry(shapeOf(v, k), {
    depth: P.depth,
    bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2,
    curveSegments: 24,
  });
  geo.translate(0, 0, -P.depth / 2);      // 让齿轮沿 z 居中
  return (geos[v][k] = geo);
}
function checkerFor(v, pairIndex) {
  if (!polys[v]) {
    polys[v] = {};
    for (const k of Object.keys(GEARS)) polys[v][k] = shapeOf(v, k).getPoints(P.curveDivisions).map((p) => [p.x, p.y]);
    checkers[v] = PAIRS.map((pr) => new PairChecker(polys[v][pr.left], polys[v][pr.right], pr.dist));
  }
  return checkers[v][pairIndex];
}

const rig = new THREE.Group();            // 整套齿轮装在 rig 里：竖屏时整组转 90°
scene.add(rig);

const gearMeshes = {};
for (const k of Object.keys(GEARS)) {
  const g = GEARS[k];
  const mesh = new THREE.Mesh(geoOf(version, k), new THREE.MeshStandardMaterial({ color: g.color, metalness: 0.85, roughness: 0.32 }));
  mesh.position.set(g.x, 0, g.z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  rig.add(mesh);
  gearMeshes[k] = mesh;
}

// 轴和衬套。原版的圆柱没转到齿轮的转轴（z）方向，返修后转了；两套都建好，跟着版本显示
function cylinder(rt, rb2, len, color, alongZ, metal = 0.9, rough = 0.35) {
  const g = new THREE.CylinderGeometry(rt, rb2, len, 28);
  if (alongZ) g.rotateX(Math.PI / 2);     // 圆柱默认沿 Y 轴，转 90° 使其沿齿轮转轴 Z 方向
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough }));
  mesh.castShadow = true;
  return mesh;
}
const axleR = P.m * 1.1;
const axles = {};
for (const v of VERSIONS) {
  const grp = new THREE.Group();
  const alongZ = v === 'repaired';
  const a = cylinder(axleR, axleR, 2.4, 0x3a4149, alongZ); a.position.set(-P.bx, 0, -1.55);
  const bc = cylinder(axleR, axleR, 5.0, 0x3a4149, alongZ); bc.position.set(0, 0, -0.2);
  const sp = cylinder(P.m * 1.7, P.m * 1.7, 2 * P.zL - P.depth, 0x2f3540, alongZ, 0.9, 0.4); sp.position.set(0, 0, 0);
  const d = cylinder(axleR, axleR, 2.4, 0x3a4149, alongZ); d.position.set(+P.bx, 0, +1.55);
  grp.add(a, bc, sp, d);
  grp.visible = v === version;
  rig.add(grp);
  axles[v] = grp;
}

// 背板
const boardMat = new THREE.MeshStandardMaterial({ color: 0x161b23, metalness: 0.4, roughness: 0.85 });
const back = new THREE.Mesh(new THREE.BoxGeometry(170, 120, 0.8), boardMat);
back.position.set(4.05, 0, -3.2);
back.receiveShadow = true;
rig.add(back);

/* ---------------- 穿模标记：红点 + 啮合处的红光 ---------------- */
const markers = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3b5c }), MAX_MARKERS);
markers.count = 0;
markers.frustumCulled = false;
rig.add(markers);
// 啮合处的红光：一张径向渐变的贴图，亮度跟穿模点数走
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,59,92,0.85)'); grad.addColorStop(0.5, 'rgba(255,59,92,0.35)'); grad.addColorStop(1, 'rgba(255,59,92,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const glowTex = glowTexture();
const glows = PAIRS.map((pr) => {
  const mat = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), mat);
  mesh.position.set(pr.originX + (pr.NL * P.m) / 2, 0, pr.z + P.depth / 2 + 0.2);
  rig.add(mesh);
  return mesh;
});
const dummy = new THREE.Object3D();

/* ---------------- 每帧：转角 → 穿模检测 → 标记 ---------------- */
let pen = { AB: null, CD: null, count: 0, penetrating: false };
const frameCost = [];                     // 每帧检测耗时（毫秒）
function summarize(r) { return { crossings: r.crossings, inL: r.inL, inR: r.inR, count: r.crossings + r.inL + r.inR }; }

function detect(ang) {
  const t0 = performance.now();
  const res = PAIRS.map((pr, i) => ({ pr, r: checkerFor(version, i).frame(ang[pr.left], ang[pr.right], true) }));
  const ms = performance.now() - t0;
  frameCost.push(ms); if (frameCost.length > 600) frameCost.shift();
  pen = { AB: summarize(res[0].r), CD: summarize(res[1].r), count: 0, penetrating: false };
  pen.count = pen.AB.count + pen.CD.count; pen.penetrating = pen.count > 0;
  return res;
}

let markerLocal = [];                     // 当前红点在 rig 局部坐标里的位置，给验收钩子用
function updateMarkers(res) {
  let n = 0;
  markerLocal = [];
  if (highlight) {
    for (const { pr, r } of res) {
      const pts = r.points;
      for (let i = 0; i < pts.length && n < MAX_MARKERS; i += 3) {
        const s = pts[i + 2] === 0 ? 0.17 : 0.1;
        dummy.position.set(pr.originX + pts[i], pts[i + 1], pr.z + P.depth / 2 + 0.14);
        markerLocal.push([dummy.position.x, dummy.position.y, dummy.position.z]);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        markers.setMatrixAt(n++, dummy.matrix);
      }
    }
  }
  markers.count = n;
  markers.instanceMatrix.needsUpdate = true;
  glows[0].material.opacity = highlight && pen.AB.count > 0 ? Math.min(0.9, 0.25 + pen.AB.count / 200) : 0;
  glows[1].material.opacity = highlight && pen.CD.count > 0 ? Math.min(0.9, 0.25 + pen.CD.count / 200) : 0;
}

let lastAngles = angles(0);
function applyTime(t) {
  const a = angles(t);
  lastAngles = a;
  gearMeshes.A.rotation.z = a.A; gearMeshes.B.rotation.z = a.B;
  gearMeshes.C.rotation.z = a.C; gearMeshes.D.rotation.z = a.D;
  updateMarkers(detect(a));
}

/* ---------------- 界面 ---------------- */
const $ = (id) => document.getElementById(id);
const chipText = $('chip-text'), readout = $('readout');
const cycles = { original: null, repaired: null };

// 一个齿周期取 60 帧，用页面自己的几何和检测跑一遍（和 Node 测试里的做法一致）
function measureCycle(v) {
  const out = { version: v, frames: CYCLE_FRAMES, bad: 0, maxCount: 0, pairs: {} };
  PAIRS.forEach((pr, i) => {
    const chk = checkerFor(v, i), tooth = 2 * Math.PI / pr.NL;
    const rec = { bad: 0, maxCount: 0 };
    for (let k = 0; k < CYCLE_FRAMES; k++) {
      const a = tooth * k / CYCLE_FRAMES, b = -a * (pr.NL / pr.NR) + Math.PI / pr.NR;
      const r = chk.frame(a, b, false), c = r.crossings + r.inL + r.inR;
      if (c > 0) rec.bad++;
      rec.maxCount = Math.max(rec.maxCount, c);
    }
    out.pairs[pr.id] = rec;
  });
  // 两个啮合对共用同一个相位，整体按「任一对穿模的帧」统计
  out.bad = Math.max(out.pairs.AB.bad, out.pairs.CD.bad);
  out.maxCount = Math.max(out.pairs.AB.maxCount, out.pairs.CD.maxCount);
  return out;
}

let lastHud = '';
function renderHud() {
  const c = cycles[version];
  const name = version === 'original' ? '原版' : '返修后';
  const chip = c ? `${name} · 一个齿周期取 ${c.frames} 帧，${c.bad} 帧穿模` : `${name} · 检测中…`;
  if (chip !== chipText.textContent) chipText.textContent = chip;
  const fmt = (p) => `<b class="hot">${p.count}</b>`;
  const html = `穿模点 A–B ${fmt(pen.AB || { count: 0 })} · C–D ${fmt(pen.CD || { count: 0 })}`;
  if (html !== lastHud) { readout.innerHTML = html; lastHud = html; }
}
function syncButtons() {
  document.body.dataset.version = version;
  document.querySelectorAll('#ver button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.version === version)));
  document.querySelectorAll('#views button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
  $('b-play').textContent = playing ? '暂停' : '播放';
  $('b-play').setAttribute('aria-pressed', String(!playing));
  $('b-slow').setAttribute('aria-pressed', String(slow));
  $('b-hl').setAttribute('aria-pressed', String(highlight));
  $('b-info').setAttribute('aria-pressed', String(!$('info').hidden));
}
function syncUrl() {
  const u = new URL(location.href);
  u.searchParams.set('version', version); u.searchParams.set('view', view);
  if (playing) u.searchParams.delete('t');
  history.replaceState(null, '', u);
}
// 说明页夹在顶栏和底栏之间，不盖住它们
function layoutInfo() {
  const ins = insets(), st = document.documentElement.style;
  st.setProperty('--info-top', Math.round(ins.top + 8) + 'px');
  st.setProperty('--info-bottom', Math.round(ins.bottom + 8) + 'px');
}
function applyBodyClasses() {
  const w = innerWidth, h = innerHeight;
  document.body.classList.toggle('narrow', w < 760);
  document.body.classList.toggle('compact', w < 760 || h < 480);
  document.body.classList.toggle('short', h < 480);
}

/* ---------------- 机位 ---------------- */
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 4;
controls.maxDistance = 220;
let userMoved = false, lastRigRot = null, tween = null;
controls.addEventListener('start', () => { userMoved = true; tween = null; });

function insets() {
  const top = $('top').getBoundingClientRect().bottom;
  const bottom = innerHeight - $('bottom').getBoundingClientRect().top;
  return { top, bottom };
}
function currentPose(name) {
  const { top, bottom } = insets();
  return Framing.poseFor(name, { W: innerWidth, H: innerHeight, top, bottom, pad: 22, P });
}
function setViewOffset(pose) {
  if (Math.abs(pose.offsetY) > 0.5) camera.setViewOffset(innerWidth, innerHeight, 0, -pose.offsetY, innerWidth, innerHeight);
  else camera.clearViewOffset();
}
function applyPose(pose, animate) {
  rig.position.set(0, 0, 0);
  rig.rotation.z = pose.rigRotation;
  lastRigRot = pose.rigRotation;
  setViewOffset(pose);
  if (animate) {
    tween = { t0: performance.now(), dur: 650, fromPos: camera.position.clone(), fromTar: controls.target.clone(), toPos: new THREE.Vector3(...pose.position), toTar: new THREE.Vector3(...pose.target) };
  } else {
    tween = null;
    camera.position.set(...pose.position);
    controls.target.set(...pose.target);
    controls.update();
  }
}
function stepTween(now) {
  if (!tween) return;
  const k = Math.min(1, (now - tween.t0) / tween.dur), e = k * k * (3 - 2 * k);
  camera.position.lerpVectors(tween.fromPos, tween.toPos, e);
  controls.target.lerpVectors(tween.fromTar, tween.toTar, e);
  if (k >= 1) tween = null;
}
function setView(name, animate = true) {
  if (!VIEWS.includes(name)) return;
  view = name; userMoved = false;
  applyPose(currentPose(name), animate);
  syncButtons(); syncUrl();
}

/* ---------------- 版本切换、播放控制 ---------------- */
function setVersion(v) {
  if (!VERSIONS.includes(v) || v === version) { syncButtons(); return; }
  version = v;
  for (const k of Object.keys(GEARS)) gearMeshes[k].geometry = geoOf(v, k);
  for (const x of VERSIONS) axles[x].visible = x === v;
  applyTime(simT);
  syncButtons(); renderHud(); syncUrl();
}
function setPlaying(on) { playing = on; syncButtons(); if (on) syncUrl(); }
function seek(t) { simT = t; applyTime(simT); renderFrame(performance.now(), true); }

document.querySelectorAll('#ver button').forEach((b) => b.addEventListener('click', () => setVersion(b.dataset.version)));
document.querySelectorAll('#views button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
$('b-play').addEventListener('click', () => setPlaying(!playing));
$('b-slow').addEventListener('click', () => { slow = !slow; syncButtons(); });
$('b-hl').addEventListener('click', () => { highlight = !highlight; applyTime(simT); syncButtons(); });
$('b-info').addEventListener('click', () => { layoutInfo(); $('info').hidden = !$('info').hidden; syncButtons(); });
$('info-close').addEventListener('click', () => { $('info').hidden = true; syncButtons(); });
addEventListener('keydown', (e) => {
  if (e.key === ' ' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); setPlaying(!playing); }
  else if (e.key === 'Escape') { $('info').hidden = true; syncButtons(); }
});

/* ---------------- 主循环 ---------------- */
let last = performance.now();
const drawCost = [];
function renderFrame(now, forced) {
  const t0 = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (playing && !forced) { simT += dt * (slow ? SLOW : 1); applyTime(simT); }
  stepTween(now);
  controls.update();
  renderHud();
  renderer.render(scene, camera);
  drawCost.push(performance.now() - t0); if (drawCost.length > 600) drawCost.shift();
}
function loop(now) { requestAnimationFrame(loop); renderFrame(now, false); }

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  applyBodyClasses(); layoutInfo();
  const rot = Framing.rigRotation(innerWidth, innerHeight);
  if (!userMoved || rot !== lastRigRot) { userMoved = false; applyPose(currentPose(view), false); }
  else setViewOffset(currentPose(view));
});

/* ---------------- 验收钩子 ---------------- */
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const p95 = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] : 0; };

// 屏幕坐标：直接用 THREE 的相机投影（含 viewOffset），和 framing.js 的纯数学互为对照
function toScreen(localPoint) {
  const v = new THREE.Vector3(...localPoint);
  rig.localToWorld(v);
  v.project(camera);
  return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, depth: v.z };
}
function probe() {
  const centers = {}, bboxes = {};
  const outlines = Framing.gearOutlinePoints(P);
  for (const [k, c] of Object.entries(Framing.gearCenters(P))) centers[k] = toScreen(c);
  for (const [k, pts] of Object.entries(outlines)) {
    const xy = pts.map(toScreen);
    bboxes[k] = { x0: Math.min(...xy.map((p) => p.x)), x1: Math.max(...xy.map((p) => p.x)), y0: Math.min(...xy.map((p) => p.y)), y1: Math.max(...xy.map((p) => p.y)) };
  }
  const mesh = {
    mesh: toScreen([-P.bx + P.rA, 0, -P.zL + P.depth / 2]),
    'mesh-cd': toScreen([P.rC, 0, +P.zL + P.depth / 2]),
  };
  const hud = [...document.querySelectorAll('#top, #bottom, #info:not([hidden])')].map((el) => {
    const r = el.getBoundingClientRect();
    return { id: el.id, x0: r.left, x1: r.right, y0: r.top, y1: r.bottom };
  });
  const ins = insets();
  return { viewport: { w: innerWidth, h: innerHeight }, centers, bboxes, mesh, hud, safe: { y0: ins.top, y1: innerHeight - ins.bottom } };
}

// 已知的坏构图：dsh 原版页面的机位与布局（A 在原点、B 和 D 向右排开，镜头 (28,9,58) 看向 (19,0,0)，不转竖屏）。
// 只给 browser-check 用来校准「四个齿轮都在画面内」那条检查：这个状态下它必须报错。
function legacyLayout() {
  userMoved = true; tween = null;
  rig.rotation.z = 0; lastRigRot = 0;
  rig.position.set(P.bx, 0, 0);
  camera.clearViewOffset();
  camera.position.set(28, 9, 58);
  controls.target.set(19, 0, 0);
  controls.update();
  camera.updateMatrixWorld();
  renderer.render(scene, camera);
}


// 读画布：立刻渲染一帧、画到二维画布上，统计非背景像素占比，以及给定屏幕点周围「红点颜色」的像素数
function analyze(spots = [], radius = 40) {
  renderer.render(scene, camera);
  const src = renderer.domElement, w = src.width, h = src.height, dpr = w / innerWidth;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(src, 0, 0);
  const d = g.getImageData(0, 0, w, h).data;
  let n = 0, tot = 0;
  for (let y = 0; y < h; y += 6) for (let x = 0; x < w; x += 6) { const i = (y * w + x) * 4; tot++; if (d[i] + d[i + 1] + d[i + 2] > 150) n++; }
  const isRed = (i) => d[i] > 200 && d[i] - d[i + 1] > 110 && d[i] - d[i + 2] > 60;
  const red = spots.map((s) => {
    let cnt = 0;
    const r = radius * dpr, x0 = Math.max(0, Math.floor(s.x * dpr - r)), x1 = Math.min(w - 1, Math.ceil(s.x * dpr + r));
    const y0 = Math.max(0, Math.floor(s.y * dpr - r)), y1 = Math.min(h - 1, Math.ceil(s.y * dpr + r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (isRed((y * w + x) * 4)) cnt++;
    return cnt;
  });
  return { ink: n / tot, red, width: w, height: h };
}
function markerScreen() { return markerLocal.map(toScreen); }

window.__gearRepair = {
  ready: false,
  state() {
    const ins = insets();
    return {
      version, view, playing, slow, highlight, t: simT,
      angles: lastAngles,
      penetration: pen,
      cycle: cycles,
      viewport: { w: innerWidth, h: innerHeight, dpr: renderer.getPixelRatio() },
      portrait: Framing.isPortrait(innerWidth, innerHeight),
      insets: ins,
      camera: { position: camera.position.toArray(), target: controls.target.toArray(), fov: camera.fov },
      infoOpen: !$('info').hidden,
      markers: markers.count,
      drawCalls: renderer.info.render.calls,
      userMoved,
    };
  },
  setVersion, setView: (n) => setView(n, false), play: () => setPlaying(true), pause: () => setPlaying(false), seek,
  setSlow(on) { slow = !!on; syncButtons(); },
  setHighlight(on) { highlight = !!on; applyTime(simT); syncButtons(); },
  openInfo(on) { layoutInfo(); $('info').hidden = !on; syncButtons(); },
  measureCycle,
  probe, legacyLayout, analyze, markerScreen,
  drawStats() {
    return { detect: { median: median(frameCost), p95: p95(frameCost), n: frameCost.length }, frame: { median: median(drawCost), p95: p95(drawCost), n: drawCost.length } };
  },
};

/* ---------------- 启动 ---------------- */
applyBodyClasses();
layoutInfo();
syncButtons();
applyTime(simT);
applyPose(currentPose(view), false);
renderFrame(performance.now(), true);
renderHud();
requestAnimationFrame(loop);
// 两版的 60 帧检测放到首帧之后算，不挡住第一次出画
setTimeout(() => {
  for (const v of VERSIONS) cycles[v] = measureCycle(v);
  renderHud();
  window.__gearRepair.ready = true;
}, 0);
