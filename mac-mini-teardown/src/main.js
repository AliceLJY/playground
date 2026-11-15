// Mac mini 拆解台 · 页面：舞台、读数卡、侧视线稿、旋钮、自动导览与接管。所有读数都从 model 来。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as M from './model.js';
import { buildMachine, ACCENT } from './machine.js';
import { tourAt, TOUR_S, SHOTS, VIEWS, timeAt, captionAt, viewNameAt, SSD_NOTES, SUMMARY_AT, OUTRO_AT, _steps } from './tour.js';

const q = new URLSearchParams(location.search);
const CAPTURE = q.has('capture');
const $ = (s) => document.querySelector(s);
if (CAPTURE) document.body.classList.add('capture');
const portrait = () => innerWidth / innerHeight < 1 || innerWidth <= 760;
const filmTall = () => CAPTURE && innerWidth / innerHeight < 1;
const layoutName = () => (portrait() ? 'tall' : 'wide');

// ---------------- 舞台 ----------------
const canvas = $('#scene');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: CAPTURE }); }
catch (e) { document.body.classList.add('nogl'); throw e; }
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
const BG = new THREE.Color(0xecebe7);
const scene = new THREE.Scene(); scene.background = BG.clone();
const camera = new THREE.PerspectiveCamera(30, 1, 2, 3000);

scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc9bf, 1.25));
const key = new THREE.DirectionalLight(0xffffff, 2.1); key.position.set(-160, 300, 140); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -230, right: 230, top: 230, bottom: -230, near: 50, far: 800 });
key.shadow.bias = -0.0003; key.shadow.normalBias = 0.6; key.shadow.radius = 4; scene.add(key);
const fill = new THREE.DirectionalLight(0xfff4e8, 0.7); fill.position.set(220, 120, -60); scene.add(fill);
// 地面：只接影子，颜色就是背景
const floor = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.ShadowMaterial({ opacity: 0.13, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

const machine = buildMachine(); scene.add(machine.root);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.minDistance = 60; controls.maxDistance = 900; controls.maxPolarAngle = Math.PI * 0.48; controls.enabled = false;

// ---------------- 机位：按「要框住的半径」和可用画面算距离，再把目标点挪到可用区的中心 ----------------
function freeRect() {
  const W = innerWidth, H = innerHeight;
  if (filmTall()) return { x0: 24, x1: W - 24, y0: 258, y1: 572 };
  if (portrait()) return { x0: 8, x1: W - 8, y0: 146, y1: H - 236 };
  return { x0: 380, x1: W - 380, y0: 150, y1: H - 300 };
}
function viewSpec(name) { const v = VIEWS[name] || VIEWS.hero; return (layoutName() === 'tall' && v.tall) ? v.tall : v; }
function camFromView(name) {
  const v = viewSpec(name), az = v.az * Math.PI / 180, el = v.el * Math.PI / 180;
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  const F = freeRect(), W = innerWidth, H = innerHeight, t = Math.tan(camera.fov * Math.PI / 360);
  const tv = t * (F.y1 - F.y0) / H, th = t * camera.aspect * (F.x1 - F.x0) / W;
  const dist = v.r / Math.min(tv, th);
  const tgt = new THREE.Vector3(...v.t);
  return { pos: tgt.clone().addScaledVector(dir, dist), tgt };
}
function setOffset() {
  const F = freeRect(), W = innerWidth, H = innerHeight;
  camera.setViewOffset(W, H, W / 2 - (F.x0 + F.x1) / 2, H / 2 - (F.y0 + F.y1) / 2, W, H);
  camera.updateProjectionMatrix();
}
let displayedView = 'open';
function applyCam(from, to, k) {
  const A = camFromView(from), B = camFromView(to);
  const tgt = A.tgt.clone().lerp(B.tgt, k);
  // 位置按「方向 + 距离」插值，比直接插位置少穿模
  const da = A.pos.clone().sub(A.tgt), db = B.pos.clone().sub(B.tgt);
  const len = THREE.MathUtils.lerp(da.length(), db.length(), k), dir = da.normalize().lerp(db.normalize(), k).normalize();
  camera.position.copy(tgt).addScaledVector(dir, len); camera.lookAt(tgt); controls.target.copy(tgt);
  displayedView = k < 1 ? from + '→' + to : to;
}

// ---------------- 读数卡 ----------------
const cards = { steps: $('#cSteps'), screws: $('#cScrews'), bits: $('#cBits'), conns: $('#cConns') };
const pad2 = (n) => String(n).padStart(2, '0');
const screwSub = $('#screwSub'), bitSub = $('#bitSub'), connSub = $('#connSub'), stepSub = $('#stepSub');
bitSub.innerHTML = M.BITS.map((b) => `<span data-b="${b}">${b}</span>`).join('');
const CONN_LABEL = { power: '电源键', zif: '风扇 ZIF', ssd: 'SSD' };
connSub.innerHTML = M.CONNECTORS.map((c) => `<span data-c="${c.id}">${CONN_LABEL[c.id]}</span>`).join('');
screwSub.innerHTML = M.BITS.map((b) => `<span data-sb="${b}"></span>`).join('');
let lastKey = '';
function updateCards(s) {
  const c = M.counters(s), before = M.counters(Math.max(0, s - 0.12));
  const key = [c.steps, c.screws, c.bits, c.connectors, c.ramSlots, s > M.LOOK + 0.3, before.steps !== c.steps, before.screws !== c.screws, before.bits !== c.bits, before.connectors !== c.connectors].join();
  if (key === lastKey) return c; lastKey = key;
  cards.steps.querySelector('.v span').textContent = pad2(c.steps);
  cards.screws.querySelector('.v span').textContent = pad2(c.screws);
  cards.bits.querySelector('.v span').textContent = c.bits;
  cards.conns.querySelector('.v span').textContent = c.connectors;
  cards.steps.classList.toggle('hot', before.steps !== c.steps);
  cards.screws.classList.toggle('hot', before.screws !== c.screws);
  cards.bits.classList.toggle('hot', before.bits !== c.bits);
  cards.conns.classList.toggle('hot', before.connectors !== c.connectors);
  const done = M.SCREWS.filter((sc) => M.local(s, sc.stage) >= sc.b);
  screwSub.querySelectorAll('span').forEach((el) => { const b = el.dataset.sb, n = done.filter((x) => x.bit === b).length, tot = M.SCREWS.filter((x) => x.bit === b).length; el.textContent = `${b} ${n}/${tot}`; el.classList.toggle('on', n > 0); });
  bitSub.querySelectorAll('span').forEach((el) => el.classList.toggle('on', c.bitList.includes(el.dataset.b)));
  connSub.querySelectorAll('span').forEach((el) => el.classList.toggle('on', c.connectorList.includes(el.dataset.c)));
  stepSub.innerHTML = `<span class="${c.pins ? 'on' : ''}">销钉 ${c.pins}/4</span>`;
  $('#ramnote').style.opacity = c.ramSlots === 0 ? 1 : 0;
  return c;
}
function updateStepbar(s) {
  const { i, stage } = M.stageAt(s);
  const no = stage.ifixit ? stage.ifixit : M.STAGES.slice(0, i).filter((x) => x.ifixit).length;
  $('#stepNo').innerHTML = `${pad2(no)}<small>/21</small>`;
  const end = s >= M.S_MAX - 1e-6;
  $('#stepKind').textContent = end ? '拆完了' : stage.ifixit ? `iFixit 第 ${stage.ifixit} 步` : stage.kind === 'look' ? '插一拍 · 不在指南里' : '特写 · 不在步骤里';
  $('#stepTx').textContent = end ? '能换的只有这块 SSD 模块，而且只能换同类型的。' : stage.title;
}

// ---------------- 侧视线稿 ----------------
const side = $('#side');
const SZ = [-80, 80], SY = [-6, 92]; // 只画机身附近：z 横轴，y 纵轴
const sx = (z) => 10 + ((z - SZ[0]) / (SZ[1] - SZ[0])) * 280, sy = (y) => 140 - ((y - SY[0]) / (SY[1] - SY[0])) * 132;
const LABELS = { cover: '底盖', inner: '内板', fan: '风扇', heatsink: '散热片', board: '主板', ssd: 'SSD', psu: '电源（示意）' };
function drawSide(s, frame) {
  if (!CAPTURE && frame % 2) return;
  const items = M.sideView(s, layoutName());
  let html = `<defs><clipPath id="clip"><rect x="0" y="0" width="300" height="146"/></clipPath></defs><line class="floor" x1="6" x2="294" y1="${sy(0)}" y2="${sy(0)}"/><g clip-path="url(#clip)">`;
  const order = ['skin', 'wallN', 'wallS', 'psu', 'board', 'socket', 'm4', 'ramA', 'ramB', 'ssd', 'jack', 'zif', 'heatsink', 'fan', 'inner', 'cover'];
  items.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  for (const it of items) {
    if (it.poly.some(([z, y]) => z < SZ[0] - 60 || z > SZ[1] + 60 || y > SY[1] + 60)) { if (it.id !== 'cover' && it.id !== 'fan') continue; }
    const cls = ['p', it.hi ? 'hi' : '', it.xray ? 'xr' : '', it.id.startsWith('wall') || it.id === 'skin' ? 'chassis' : ''].join(' ');
    html += `<polygon class="${cls}" opacity="${Math.min(1, it.op).toFixed(2)}" points="${it.poly.map(([z, y]) => sx(z).toFixed(1) + ',' + sy(y).toFixed(1)).join(' ')}"/>`;
  }
  html += '</g>';
  if (!filmTall()) for (const it of items) {
    const name = LABELS[it.id]; if (!name || it.op < 0.5 || !(it.hi || it.id === 'board' || (it.id === 'heatsink' && it.xray))) continue;
    const ys = it.poly.map((p) => p[1]), zs = it.poly.map((p) => p[0]);
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2, cz = Math.max(...zs);
    if (cz > SZ[1] - 6 || cy > SY[1] - 4) continue;
    html += `<text x="${(sx(cz) + 4).toFixed(1)}" y="${(sy(cy) + 3).toFixed(1)}">${name}</text>`;
  }
  side.innerHTML = html;
}

// ---------------- 旋钮 ----------------
const dial = $('#dial');
const A0 = -150, A1 = 150; // 角度范围（0 在正上方，顺时针）
const angOf = (s) => A0 + (A1 - A0) * (s / M.S_MAX);
(function buildDial() {
  let h = '<circle cx="60" cy="60" r="46" fill="rgba(255,255,255,.6)" stroke="rgba(31,30,28,.18)"/>';
  for (let i = 0; i <= M.S_MAX; i++) {
    const a = (angOf(i) - 90) * Math.PI / 180, r0 = 49, r1 = i % 5 === 0 ? 57 : 54;
    h += `<line class="tk" data-i="${i}" x1="${(60 + Math.cos(a) * r0).toFixed(2)}" y1="${(60 + Math.sin(a) * r0).toFixed(2)}" x2="${(60 + Math.cos(a) * r1).toFixed(2)}" y2="${(60 + Math.sin(a) * r1).toFixed(2)}"/>`;
  }
  h += '<line id="needle" x1="60" y1="60" x2="60" y2="22" stroke="#1f1e1c" stroke-width="2.2" stroke-linecap="round"/><circle class="knob" id="knob" cx="60" cy="22" r="6"/><circle cx="60" cy="60" r="22" fill="#fff" stroke="rgba(31,30,28,.18)"/><text x="60" y="61" id="dialNo">00</text>';
  dial.innerHTML = h;
})();
let lastDial = -1;
function updateDial(s) {
  if (Math.abs(s - lastDial) < 1e-4) return; lastDial = s;
  const a = angOf(s);
  $('#needle').setAttribute('transform', `rotate(${a.toFixed(2)} 60 60)`); $('#knob').setAttribute('transform', `rotate(${a.toFixed(2)} 60 60)`);
  $('#dialNo').textContent = pad2(M.counters(s).steps);
  dial.querySelectorAll('.tk').forEach((t) => { const i = +t.dataset.i; t.classList.toggle('done', i <= s); t.classList.toggle('look', i === M.LOOK + 1); });
  dial.setAttribute('aria-valuenow', s.toFixed(2));
}

// ---------------- 标注（SSD 特写、顺带看内存） ----------------
const tag1 = $('#tag1'), tag2 = $('#tag2');
function placeTag(el, lead, dot, anchorName, html, k, side = 1) {
  const p = anchorName && machine.anchor(anchorName);
  if (!p || k <= 0.01) { el.style.opacity = 0; lead.setAttribute('d', ''); dot.setAttribute('cx', -10); return; }
  p.project(camera); const ax = (p.x * 0.5 + 0.5) * innerWidth, ay = (-p.y * 0.5 + 0.5) * innerHeight;
  if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
  const W = innerWidth, F = freeRect(), cw = el.offsetWidth, ch = el.offsetHeight;
  let lx = side > 0 ? ax + 60 : ax - 60 - cw; lx = Math.max(16, Math.min(W - 16 - cw, lx));
  let ly = ay - 70 - ch / 2; ly = Math.max(F.y0 + 4, Math.min(F.y1 - ch - 4, ly));
  el.style.transform = `translate(${lx.toFixed(1)}px, ${ly.toFixed(1)}px)`; el.style.opacity = k.toFixed(3);
  const ex = side > 0 ? lx : lx + cw, ey = ly + ch / 2;
  lead.setAttribute('d', `M${ax.toFixed(1)},${ay.toFixed(1)} L${(ex + (side > 0 ? -14 : 14)).toFixed(1)},${ey.toFixed(1)} L${ex.toFixed(1)},${ey.toFixed(1)}`);
  lead.style.opacity = k; dot.setAttribute('cx', ax.toFixed(1)); dot.setAttribute('cy', ay.toFixed(1)); dot.style.opacity = k;
}
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
function updateTags(s, tTour) {
  const u = M.local(s, M.LOOK);
  const ramK = s > M.LOOK && s < M.LOOK + 1 ? ease((u - 0.28) / 0.1) * (1 - ease((u - 0.9) / 0.1)) : 0;
  if (ramK > 0) {
    placeTag(tag1, $('#lead'), $('#leadDot'), 'ram', '<b>LPDDR5 内存颗粒</b><br>焊在 M4 旁边，没有插槽', ramK, -1);
    placeTag(tag2, $('#lead2'), $('#leadDot2'), null, '', 0);
    return;
  }
  const notes = SSD_NOTES.filter(([a, b]) => tTour >= a && tTour < b && s >= M.CLOSEUP);
  const k = (a, b) => Math.min(ease((tTour - a) / 0.4), 1 - ease((tTour - b + 0.3) / 0.3));
  const n1 = notes.find((n) => n[2] === 'gold'), n2 = notes.find((n) => n[2] === 'nand');
  placeTag(tag1, $('#lead'), $('#leadDot'), n1 && 'gold', n1 ? `<b>${n1[3]}</b>` : '', n1 ? k(n1[0], n1[1]) : 0, -1);
  placeTag(tag2, $('#lead2'), $('#leadDot2'), n2 && 'nand', n2 ? `<b>${n2[3]}</b>` : '', n2 ? k(n2[0], n2[1]) : 0, 1);
}

// ---------------- 导览光标 ----------------
const cursorEl = $('#cursor'), ping = $('#ping');
function moveCursor(cur) {
  if (!cur || (mode !== 'tour' && mode !== 'frozen') || filmTall()) { cursorEl.style.opacity = 0; return; }
  const tgt = document.querySelector(`[data-tour="${cur.target}"]`); if (!tgt || !tgt.offsetParent) { cursorEl.style.opacity = 0; return; }
  const r = tgt.getBoundingClientRect(), x1 = r.left + r.width * 0.5, y1 = r.top + r.height * 0.55;
  const x0 = innerWidth * 0.6, y0 = innerHeight * 0.5, k = cur.moving;
  const x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k - Math.sin(Math.PI * k) * 40;
  cursorEl.style.opacity = (Math.min(1, k * 4) * cur.fade).toFixed(3);
  cursorEl.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${cur.pressed ? 0.84 : 1})`;
  ping.style.opacity = cur.pressed ? 1 : 0;
}

// ---------------- 状态 ----------------
let mode = CAPTURE || q.has('at') || q.has('view') || q.has('s') ? 'frozen' : 'tour';
let tourClock = 0, idle = 0, backTimer, liveS = 0, targetS = 0, liveDwell = 0, userOrbit = false, liveView = 'hero', camAnim = null;
const heldPointers = new Set();
const IDLE_BACK = q.has('idle') ? Math.max(1, +q.get('idle')) : 25;
let lowTier = false, frame = 0, renderedS = 0, loopFade = 0;

function drawFrame(s, tTour, { view, cursor, caption, captionAt: cAt, summary }) {
  renderedS = s;
  machine.update(s, layoutName());
  if (q.has('hide')) for (const id of q.get('hide').split(',')) machine.parts[id].g.visible = false; // 调试：藏掉某几个零件
  if (view) applyCam(view.from, view.to, view.k);
  updateCards(s); updateStepbar(s); updateDial(s); drawSide(s, frame);
  const narr = $('#narr');
  if (narr.textContent !== caption) narr.textContent = caption;
  narr.style.opacity = caption ? Math.min(1, (tTour - cAt) / 0.3).toFixed(3) : '0';
  const sm = $('#summary'); sm.style.opacity = summary.toFixed(3); sm.style.transform = (filmTall() ? 'translate(-50%, -50%)' : portrait() ? 'translate(-50%, -54%)' : 'translate(-50%, -54%)') + ` translateY(${((1 - summary) * 14).toFixed(1)}px)`;
  updateTags(s, tTour);
  moveCursor(cursor);
  renderer.render(scene, camera);
}
function renderTour(t) { const T = tourAt(t); drawFrame(T.s, T.t, T); $('#fade').style.opacity = T.dip.toFixed(3); return T; }

function tick(now) {
  const dt = Math.min(0.05, (now - lastNow) / 1000); lastNow = now; frame++;
  fpsMeter(dt);
  if (mode === 'tour') {
    tourClock += dt;
    if (tourClock >= TOUR_S) { tourClock = 0; loopFade = 1; }
    renderTour(tourClock);
    // 导览循环回到开头：盖一层淡入淡出（按帧时间递减，不靠 CSS 过渡）
    if (loopFade > 0) { loopFade = Math.max(0, loopFade - dt / 0.45); $('#fade').style.opacity = Math.max(loopFade, +$('#fade').style.opacity).toFixed(3); }
  } else if (mode === 'live') {
    idle = heldPointers.size ? 0 : idle + dt;
    // 按导览同样的节奏追目标进度：在剧本时间轴上走 dt×2
    if (Math.abs(targetS - liveS) > 1e-4) {
      const tNow = timeAt(liveS), dir = Math.sign(targetS - liveS);
      let tNext = tNow + dir * dt * 2.2; let sNext = sAtTime(tNext);
      if (dir > 0 && sNext <= liveS + 1e-6) sNext = liveS + dt * 0.8;
      if (dir < 0 && sNext >= liveS - 1e-6) sNext = liveS - dt * 0.8;
      liveS = dir > 0 ? Math.min(targetS, sNext) : Math.max(targetS, sNext);
    }
    liveDwell = liveS >= M.S_MAX - 1e-6 ? liveDwell + dt : 0;
    const tT = timeAt(liveS);
    const cap = liveS >= M.S_MAX - 1e-6 ? captionAt(Math.min(SUMMARY_AT - 0.01, OUTRO_AT + liveDwell * 0.9)) : captionAt(tT);
    const wantView = viewNameAt(tT);
    if (!userOrbit && wantView !== liveView) { flyTo(wantView); }
    if (camAnim) { camAnim.k = Math.min(1, camAnim.k + dt / 1.2); const e = ease(camAnim.k); camera.position.lerpVectors(camAnim.p0, camAnim.p1, e); controls.target.lerpVectors(camAnim.t0, camAnim.t1, e); if (camAnim.k >= 1) camAnim = null; }
    controls.update();
    displayedView = userOrbit ? 'orbit' : camAnim ? '→' + liveView : liveView;
    // 特写标注按剧本时间走；拆到底停 6 秒后出总结卡
    const tNotes = liveS >= M.CLOSEUP ? Math.min(41.2, 31.6 + (liveS - M.CLOSEUP) * 9.9) : tT;
    drawFrame(liveS, tNotes, { view: null, cursor: null, caption: cap.text, captionAt: liveS >= M.S_MAX - 1e-6 ? cap.at - (OUTRO_AT - 0) * 0 : cap.at, summary: ease((liveDwell - 6.5) / 0.7) });
    $('#narr').style.opacity = cap.text ? 1 : 0;
    if (idle > IDLE_BACK) backToTour();
  }
  requestAnimationFrame(tick);
}
function sAtTime(t) { return tourAt(t).s; }
function flyTo(name) { const V = camFromView(name); camAnim = { p0: camera.position.clone(), t0: controls.target.clone(), p1: V.pos, t1: V.tgt, k: 0 }; liveView = name; }

// 帧率与降档：连续 3 秒低于 40 帧就降像素比、换硬阴影、线稿隔帧
let fpsAcc = 0, fpsN = 0, fps = 60, slowFor = 0;
function fpsMeter(dt) {
  fpsAcc += dt; fpsN++;
  if (fpsAcc >= 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; slowFor = fps < 40 ? slowFor + 0.5 : 0; if (slowFor >= 3 && !lowTier) setLowTier(); }
}
function setLowTier() { lowTier = true; renderer.shadowMap.type = THREE.PCFShadowMap; key.shadow.mapSize.set(1024, 1024); key.shadow.map?.dispose(); key.shadow.map = null; resize(); }

// ---------------- 接管与交还 ----------------
function takeOver() {
  if (mode === 'frozen') return;
  if (mode === 'live' || mode === 'fading') { clearTimeout(backTimer); mode = 'live'; $('#fade').style.opacity = 0; idle = 0; return; }
  const T = tourAt(tourClock);
  liveS = T.s; targetS = Math.min(M.S_MAX, Math.round(T.s)); if (targetS < T.s - 0.5) targetS = Math.ceil(T.s);
  targetS = T.s; // 先停在当前位置，等访客的下一个指令
  mode = 'live'; idle = 0; controls.enabled = true; userOrbit = false; liveView = T.view.to; cursorEl.style.opacity = 0;
  $('#badge').textContent = '你在拆 · 25 秒不动交回导览'; $('#resume').hidden = false;
}
function backToTour() {
  if (mode !== 'live') return;
  const f = $('#fade'); f.style.opacity = 1;
  backTimer = setTimeout(() => { mode = 'tour'; tourClock = 0; loopFade = 1; controls.enabled = false; camAnim = null; $('#badge').textContent = '自动导览 · 点一下就交给你'; $('#resume').hidden = true; }, 200);
  mode = 'fading';
}
function goStep(dir) {
  takeOver(); liveDwell = 0;
  const base = targetS;
  targetS = dir > 0 ? Math.min(M.S_MAX, Math.floor(base + 1e-6) + 1) : Math.max(0, Math.ceil(base - 1e-6) - 1);
}
addEventListener('pointerdown', (e) => heldPointers.add(e.pointerId), { capture: true, passive: true });
function releasePointer(e) { if (heldPointers.delete(e.pointerId)) idle = 0; }
for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, releasePointer, { capture: true, passive: true });
function releaseInputs() { heldPointers.clear(); idle = 0; dragging = false; controls.disconnect(); controls.connect(canvas); }
addEventListener('lostpointercapture', (e) => releasePointer(e), { capture: true });
addEventListener('blur', releaseInputs);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseInputs(); });
controls.addEventListener('start', () => { if (mode === 'live') { camAnim = null; userOrbit = true; } });
for (const ev of ['pointerdown', 'wheel', 'keydown']) addEventListener(ev, (e) => { if (e.target.closest && e.target.closest('#resume')) return; takeOver(); }, { capture: true, passive: true });
$('#resume').addEventListener('click', () => { idle = 0; backToTour(); });
$('#next').addEventListener('click', () => goStep(1));
$('#prev').addEventListener('click', () => goStep(-1));
addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') { e.preventDefault(); goStep(1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); goStep(-1); }
  else if (e.key.toLowerCase() === 'v') { userOrbit = false; liveView = ''; }
});
// 旋钮：按住拖，角度换成进度，松手吸附到整步
let dragging = false;
function dialToS(e) {
  const r = dial.getBoundingClientRect(), x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
  let a = Math.atan2(x, -y) * 180 / Math.PI; a = Math.max(A0, Math.min(A1, a));
  return ((a - A0) / (A1 - A0)) * M.S_MAX;
}
dial.addEventListener('pointerdown', (e) => { takeOver(); dragging = true; dial.setPointerCapture(e.pointerId); targetS = dialToS(e); liveDwell = 0; e.preventDefault(); });
dial.addEventListener('pointermove', (e) => { if (dragging) { targetS = dialToS(e); idle = 0; } });
const endDrag = () => { if (dragging) { dragging = false; targetS = Math.round(targetS); } };
dial.addEventListener('pointerup', endDrag); dial.addEventListener('pointercancel', endDrag); dial.addEventListener('lostpointercapture', endDrag);

// ---------------- 尺寸、就绪、钩子 ----------------
function resize() {
  const w = innerWidth, h = innerHeight; renderer.setPixelRatio(lowTier ? 1 : Math.min(2, devicePixelRatio || 1)); renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.fov = w / h < 1 ? 34 : 26; camera.updateProjectionMatrix();
  document.body.classList.toggle('film-tall', filmTall());
  setOffset();
  if (mode === 'frozen') renderFrozen();
  else if (mode === 'live' && !userOrbit) flyTo(liveView);
}
addEventListener('resize', resize);
const frozenAt = q.has('at') ? +q.get('at') : q.has('view') ? SHOTS[q.get('view')] ?? 0 : 0;
function renderFrozen() {
  if (q.has('s')) { const s = +q.get('s'), t = timeAt(s); const T = tourAt(t); drawFrame(s, t, { ...T, cursor: null }); return; }
  renderTour(frozenAt);
}
resize();
machine.update(0, layoutName()); renderer.compile(scene, camera);
let lastNow = performance.now();
if (mode === 'frozen') { renderFrozen(); $('#badge').textContent = CAPTURE ? '' : '固定机位 · ' + (q.get('view') || q.get('s') || 't=' + frozenAt); }
else requestAnimationFrame((n) => { lastNow = n; tick(n); });

const rendererName = () => { const g = renderer.getContext(), e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; };
window.__mini = {
  ready: true, TOUR_S, SHOTS,
  render: (t) => { clearTimeout(backTimer); $('#fade').style.opacity = 0; mode = 'frozen'; return renderTour(t); },
  state: () => ({ mode, s: mode === 'live' ? liveS : renderedS, target: targetS, tourClock, idle, view: displayedView, layout: layoutName(), filmTall: filmTall(), counters: M.counters(renderedS), camera: { position: camera.position.toArray(), target: controls.target.toArray() }, lowTier, fps }),
  info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, pixelRatio: renderer.getPixelRatio(), renderer: rendererName() }),
  // 机器主体（机身和还在机身里的零件；不含螺丝盘、工具、已经挪到机身外的底盖、内板、风扇和拔出来的 SSD）在屏幕上的范围，0–1 归一
  box: () => {
    const out = { cover: 5, inner: 10.5, fan: 13, ssd: 21 };
    const b = new THREE.Box3(), v = new THREE.Vector3(); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    machine.root.updateMatrixWorld(true);
    for (const [id, P] of Object.entries(machine.parts)) {
      if (id.startsWith('screw') || !P.g.visible || P.op < 0.3 || (out[id] !== undefined && renderedS >= out[id])) continue;
      b.setFromObject(P.g);
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) { v.set(x, y, z).project(camera); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
    }
    return { x0: x0 * 0.5 + 0.5, x1: x1 * 0.5 + 0.5, y0: -y1 * 0.5 + 0.5, y1: -y0 * 0.5 + 0.5 };
  },
  takeOver, backToTour, goStep,
  beats: () => [...new Set([..._steps.steps.caption.map((c) => c[0]), SUMMARY_AT])].sort((a, b) => a - b),
};
window.__PLAYTEST__ = { get ready() { return true; }, snapshot: () => window.__mini.state(), reset: () => { mode = 'live'; backToTour(); }, step: (ms) => { tourClock += ms / 1000; } };
