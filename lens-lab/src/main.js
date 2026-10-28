// 凸透镜成像 — page. Logic lives in core.js; this file draws the bench and wires the lesson panel.
// Scene units are centimetres: x runs along the ruler (0–100), y up from the rail top, z towards the viewer.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import * as C from './core.js';

const INK = '#1f2a44', PAPER = '#fbf7ee', DESK = '#e9e4da', AMBER = '#e2832a', TEAL = '#1a8f87', RED = '#c2412d';
const Y0 = 18;                        // optical axis height above the rail top
const L = C.LENS_X, F = C.F;
const q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

// ---------------- renderer ----------------
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
const DPR = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(DPR);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(DESK);
const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 2000);
const RES = new THREE.Vector2(1, 1);

// paper material: paper white on lit faces, screen-space ink hatching on faces turned away (same look as the slope-cart film)
const LIGHT = new THREE.Vector3(-0.35, 0.85, 0.45).normalize();
const hatchMats = [];
function hatchMat(color = PAPER) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(color) }, uInk: { value: new THREE.Color(INK) }, uL: { value: LIGHT }, uSp: { value: 7 * DPR } },
    vertexShader: 'varying vec3 vN; void main(){ vN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform vec3 uCol,uInk,uL; uniform float uSp; varying vec3 vN;
      float line(float v,float w){ float f=fract(v/uSp); return 1.-smoothstep(w,w+.08,min(f,1.-f)*2.); }
      void main(){ float l=max(dot(normalize(vN),uL),0.); vec2 p=gl_FragCoord.xy; float h=0.;
        if(l<.62) h=max(h,line(p.x+p.y,.16)*.55);
        if(l<.30) h=max(h,line(p.x-p.y,.16)*.55);
        gl_FragColor=vec4(mix(uCol,uInk,h*.55),1.);
        #include <colorspace_fragment>
      }`,
  });
  hatchMats.push(m); return m;
}
const lineMats = [], labels = [];
function lineMat(w, color = INK, extra = {}) { const m = new LineMaterial({ color, linewidth: w, resolution: RES, ...extra }); lineMats.push(m); return m; }
function inked(geo, mat, w = 1.8, thr = 30) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, mat));
  g.add(new LineSegments2(new LineSegmentsGeometry().fromEdgesGeometry(new THREE.EdgesGeometry(geo, thr)), lineMat(w)));
  return g;
}
function segs(list, mat) {   // list of [x0,y0,z0,x1,y1,z1]
  const g = new LineSegmentsGeometry(); g.setPositions(list.flat());
  const l = new LineSegments2(g, mat); l.computeLineDistances(); return l;
}
// names are drawn on top of everything, so the screen standing in front of the lens never hides them
function textSprite(text, color = INK, px = 44, worldH = 2.6) {
  const c = document.createElement('canvas'), g = c.getContext('2d');
  g.font = `600 ${px}px ${getComputedStyle(document.body).fontFamily}`;
  c.width = Math.ceil(g.measureText(text).width) + 16; c.height = px + 16;
  g.font = `600 ${px}px ${getComputedStyle(document.body).fontFamily}`; g.fillStyle = color; g.textBaseline = 'middle'; g.fillText(text, 8, c.height / 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false }));
  s.scale.set((worldH * c.width) / c.height, worldH, 1); s.renderOrder = 10; s.userData.base = s.scale.clone(); labels.push(s); return s;
}

// ---------------- desk and bench ----------------
const desk = new THREE.Mesh(new THREE.PlaneGeometry(600, 400), new THREE.MeshBasicMaterial({ color: '#ddd6c8' }));
desk.rotation.x = -Math.PI / 2; desk.position.set(50, -3.2, 0); scene.add(desk);
const rail = inked(new THREE.BoxGeometry(106, 3.2, 7), hatchMat('#f3eee2'), 2.2); rail.position.set(50, -1.6, 0); scene.add(rail);
{ // ruler printed on the rail top
  const c = document.createElement('canvas'); c.width = 2120; c.height = 140; const g = c.getContext('2d');
  g.fillStyle = '#f7f2e6'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = INK; g.strokeStyle = INK;
  const px = (cm) => 60 + cm * 20;
  for (let cm = 0; cm <= 100; cm++) { const h = cm % 10 === 0 ? 52 : cm % 5 === 0 ? 36 : 22; g.lineWidth = cm % 10 === 0 ? 3 : 2; g.beginPath(); g.moveTo(px(cm), 0); g.lineTo(px(cm), h); g.stroke(); }
  g.font = '600 40px "PingFang SC", sans-serif'; g.textAlign = 'center';
  for (let cm = 0; cm <= 100; cm += 10) g.fillText(String(cm), px(cm), 102);
  g.font = '500 30px "PingFang SC", sans-serif'; g.textAlign = 'left'; g.fillText('cm', px(100) + 14, 102);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(106, 7), new THREE.MeshBasicMaterial({ map: t }));
  m.rotation.x = -Math.PI / 2; m.position.set(50, 0.02, 0); scene.add(m);
}
function holder(postTop) {
  const g = new THREE.Group();
  const b = inked(new THREE.BoxGeometry(4.4, 1.8, 7.6), hatchMat('#efe9db'), 1.8); b.position.y = 0.9; g.add(b);
  const p = inked(new THREE.CylinderGeometry(0.45, 0.45, postTop - 1.8, 12), hatchMat('#e8e1d1'), 1.4, 60); p.position.y = 1.8 + (postTop - 1.8) / 2; g.add(p);
  return g;
}
// the optical axis and the focal marks on both sides
scene.add(segs([[0, Y0, 0, 100, Y0, 0]], lineMat(1.2, '#8a90a3', { dashed: true, dashSize: 1.2, gapSize: 0.9 })));
for (const [k, name] of [[1, 'F'], [2, '2F']]) for (const side of [-1, 1]) {
  const x = L + side * k * F;
  scene.add(segs([[x, Y0 - 1, 0, x, Y0 + 1, 0]], lineMat(2.2)));
  // label on the rail's front face: below the ruler's numbers, and never behind the screen
  scene.add(segs([[x, -0.2, 3.55, x, -1.1, 3.55]], lineMat(2.6, RED)));
  const s = textSprite(name, RED, 44, 1.9); s.position.set(x, -2.1, 3.9); scene.add(s);
}

// ---------------- lens ----------------
const lens = new THREE.Group(); lens.position.x = L; scene.add(lens);
lens.add(holder(Y0 - 3.6));
{
  const R = C.APERTURE / 2, T = 0.75, pts = [];
  for (let i = 0; i <= 16; i++) { const r = (R * i) / 16; pts.push(new THREE.Vector2(Math.max(r, 1e-3), T * (1 - (r / R) ** 2))); }
  for (let i = 16; i >= 0; i--) { const r = (R * i) / 16; pts.push(new THREE.Vector2(Math.max(r, 1e-3), -T * (1 - (r / R) ** 2))); }
  const geo = new THREE.LatheGeometry(pts.reverse(), 48); geo.rotateZ(Math.PI / 2);
  const glass = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#bfe0ea', transparent: true, opacity: 0.5, depthWrite: false }));
  glass.position.y = Y0; glass.renderOrder = 2; lens.add(glass);
  const ring = []; for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2, b = ((i + 1) / 64) * Math.PI * 2; ring.push([0, Y0 + R * Math.sin(a), R * Math.cos(a), 0, Y0 + R * Math.sin(b), R * Math.cos(b)]); }
  lens.add(segs(ring, lineMat(2.4)));
  const clamp = inked(new THREE.BoxGeometry(1.6, 0.9, 1.6), hatchMat('#e8e1d1'), 1.4); clamp.position.y = Y0 - R - 0.2; lens.add(clamp);
  const lab = textSprite('凸透镜', INK, 40, 2.2); lab.position.set(0, Y0 + R + 4.2, 0); lens.add(lab);
}

// ---------------- candle ----------------
const candle = new THREE.Group(); scene.add(candle);
const CANDLE_TOP = Y0 - 1.4;
{
  candle.add(holder(4));
  const body = inked(new THREE.CylinderGeometry(1.25, 1.25, CANDLE_TOP - 4, 20), hatchMat('#fffaf0'), 1.8, 50); body.position.y = 4 + (CANDLE_TOP - 4) / 2; candle.add(body);
  candle.add(segs([[0, CANDLE_TOP, 0, 0, CANDLE_TOP + 0.9, 0]], lineMat(2.4)));
}
const flameGeo = (() => {   // teardrop, tip at y = +OBJ_H above the axis
  const pts = []; for (let i = 0; i <= 20; i++) { const k = i / 20, y = -1.3 + k * (C.OBJ_H + 1.3); pts.push(new THREE.Vector2(Math.max(0.001, 0.95 * Math.sin(Math.PI * Math.pow(k, 0.62)) * (1 - k * 0.15)), y)); }
  return new THREE.LatheGeometry(pts, 24);
})();
const flame = new THREE.Group(); flame.position.y = Y0; candle.add(flame);
flame.add(new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: '#ff9a3c' })));
{ const inner = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: '#ffe08a' })); inner.scale.set(0.5, 0.62, 0.5); inner.position.y = -0.35; flame.add(inner); }
const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,190,110,.75)'); r.addColorStop(0.4, 'rgba(255,170,90,.25)'); r.addColorStop(1, 'rgba(255,160,80,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false })); glow.scale.set(9, 9, 1); glow.position.y = Y0 + 0.6; candle.add(glow);
const candleLabel = textSprite('蜡烛', INK, 40, 2.2); candleLabel.position.set(0, Y0 + C.OBJ_H + 2.2, 0); candle.add(candleLabel);

// ---------------- screen ----------------
const SCR = 26;                                  // board size, cm
const scrCanvas = document.createElement('canvas'); scrCanvas.width = scrCanvas.height = 512; $('inset').appendChild(scrCanvas);
const scrTex = new THREE.CanvasTexture(scrCanvas); scrTex.colorSpace = THREE.SRGBColorSpace;
const screen = new THREE.Group(); scene.add(screen);
screen.add(holder(Y0 - SCR / 2));
const board = new THREE.Group(); board.position.y = Y0; board.rotation.y = 0.36; screen.add(board);   // turned a little towards the viewer
{
  const back = inked(new THREE.BoxGeometry(0.8, SCR + 1.2, SCR + 1.2), hatchMat('#e8e1d1'), 2); back.position.x = 0.45; board.add(back);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(SCR, SCR), new THREE.MeshBasicMaterial({ map: scrTex }));
  face.rotation.y = -Math.PI / 2; face.position.x = 0; board.add(face);
  const lab = textSprite('光屏', INK, 40, 2.2); lab.position.set(0, SCR / 2 + 2.4, 0); board.add(lab);
}

// sun for the parallel-light step
const sun = new THREE.Group(); sun.position.set(2, Y0, 0); scene.add(sun);
{ const s = textSprite('☀ 平行光', AMBER, 44, 2.6); s.position.set(4, 5.5, 0); sun.add(s); }

// the virtual (or aerial) image seen when looking through the lens
const ghost = new THREE.Group(); scene.add(ghost);
const ghostLabel = textSprite('虚像', RED, 40, 2.4); scene.add(ghostLabel);
{
  const gm = new THREE.MeshBasicMaterial({ color: '#ffb46b', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, CANDLE_TOP - 4, 20), new THREE.MeshBasicMaterial({ color: '#fff3df', transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
  body.position.y = 4 + (CANDLE_TOP - 4) / 2 - Y0; ghost.add(body);
  ghost.add(new THREE.Mesh(flameGeo, gm));
}

// ray diagram, rebuilt whenever the bench changes
const rayGroup = new THREE.Group(); scene.add(rayGroup);
const rayMats = [lineMat(2.6, AMBER), lineMat(2.6, TEAL), lineMat(2.6, RED)];
const dashMat = lineMat(1.8, RED, { dashed: true, dashSize: 0.8, gapSize: 0.6 });
const sunMat = lineMat(2.2, AMBER);

// ---------------- state ----------------
const st = C.newState();
let rayOn = true;
const view = q.get('view');
if (view === 'far') { st.candle = L - 30; st.screen = C.bestScreen(30); }
if (view === 'mid') { st.candle = L - 15; st.screen = C.bestScreen(15); }
if (view === 'near') { st.candle = L - 6; st.eye = true; }
if (view === 'sun') { st.sun = true; st.screen = L + F; }
if (q.get('found') === 'all') { st.focusFound = true; st.predicted = 1; C.REGION_ORDER.forEach((k) => st.found.add(k)); }

// ---------------- panel ----------------
$('question').textContent = C.QUESTION;
const stepsEl = $('steps');
C.STEPS.forEach((s) => { const b = document.createElement('i'); b.title = s.title; stepsEl.appendChild(b); });
const guessEl = $('guess');
C.GUESS.forEach((g, i) => { const b = document.createElement('button'); b.className = 'opt'; b.textContent = g; b.onclick = () => { st.predicted = i; ding(660); $('guessNote').textContent = `记下了：你猜「${g}」。下一步做实验检验它。`; }; guessEl.appendChild(b); });
const tbody = $('table');
for (const k of C.REGION_ORDER) { const tr = document.createElement('tr'); tr.dataset.k = k; tr.innerHTML = '<td class="q">？</td><td class="q">？</td><td class="q">？</td><td class="q">？</td>'; tbody.appendChild(tr); }
function fillRow(k) {
  const r = C.REGIONS[k], tr = tbody.querySelector(`tr[data-k="${k}"]`);
  tr.innerHTML = `<td>${r.range}</td><td>${C.describe(k)}</td><td>${r.imgRange}</td><td>${r.use}</td>`;
  tr.classList.remove('hit'); void tr.offsetWidth; tr.classList.add('hit');
}
st.found.forEach(fillRow);
const sl = { candle: $('candle'), screen: $('screen') };
sl.candle.min = C.CANDLE[0]; sl.candle.max = C.CANDLE[1];
sl.screen.min = C.SCREEN[0]; sl.screen.max = C.SCREEN[1];
sl.candle.oninput = () => { st.candle = C.snapCandle(+sl.candle.value); };
sl.screen.oninput = () => { st.screen = C.clampScreen(+sl.screen.value); };
// a slider being held counts as dragging (nothing is "found" until the hand lets go); otherwise it always shows the bench
let slHeld = null;
for (const k of ['candle', 'screen']) sl[k].addEventListener('pointerdown', () => { slHeld = k; });
for (const ev of ['pointerup', 'pointercancel', 'blur']) window.addEventListener(ev, () => { slHeld = null; });
// fine steps: a tap moves 0.5 cm, holding keeps going 0.2 cm at a time
const nudge = (k, d) => { if (k === 'candle') st.candle = C.nudgeCandle(st.candle, d); else st.screen = C.clampScreen(st.screen + d); };
let nudgeTimer = 0, nudgeHeld = false;
for (const b of document.querySelectorAll('button.nudge')) {
  const k = b.dataset.k, dir = +b.dataset.d;
  const stop = () => { clearInterval(nudgeTimer); clearTimeout(nudgeTimer); nudgeHeld = false; };
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); nudge(k, 0.5 * dir); nudgeHeld = true; nudgeTimer = setTimeout(() => { nudgeTimer = setInterval(() => nudge(k, 0.2 * dir), 70); }, 380); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop);
  b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nudge(k, 0.5 * dir); } });
}
const tog = (id, key) => { $(id).onclick = () => { if ($(id).disabled) return; st[key] = !st[key]; if (key === 'sun' && st.sun) st.eye = false; if (key === 'eye' && st.eye) st.sun = false; }; };
tog('sun', 'sun'); tog('eye', 'eye');
$('ray').onclick = () => { rayOn = !rayOn; };

let toastTimer = 0;
function toast(html, ms = 5200) { const t = $('toast'); t.innerHTML = html; t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), ms); }
const FOUND_MSG = {
  focus: '光斑缩成最小最亮的一点，这一点就是<b>焦点</b>。它离透镜 <b>10 cm</b>：焦距 f = 10 cm。',
  far: '找到了！<b>倒立、缩小的实像</b>。照相机就是这样把远处的景物拍小的。',
  two: '<b>倒立、等大</b>：物距、像距都是 2f = 20 cm，像和蜡烛一样大。',
  mid: '<b>倒立、放大的实像</b>，而且像跑得更远了。投影仪就是这样。',
  focal: '光屏怎么移都接不到像：从焦点发出的光经过透镜变成<b>平行光</b>，聚不到一起。',
  near: '光屏上接不到，透过透镜却看得见：<b>正立、放大的虚像</b>。这就是放大镜。',
};
let ac = null;
function ding(freq = 880) {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
    o.type = 'sine'; o.frequency.value = freq * (1 + (Math.random() - 0.5) * 0.04);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + 1);
  } catch { /* no audio: fine */ }
}
function onFound(k) {
  let msg = FOUND_MSG[k];
  if (k === 'far' && st.predicted != null) msg += st.predicted === C.GUESS_RIGHT ? '　你猜对了。' : `　你猜的是「${C.GUESS[st.predicted]}」，没猜中。`;
  toast(msg); ding(k === 'focus' ? 660 : 880);
  if (k !== 'focus') fillRow(k);
  if (k === 'focus') setTimeout(() => { st.sun = false; }, 1800);   // the next steps need the candle back
}

const fmt = (x) => (Math.round(x * 10) / 10).toFixed(1);
function updatePanel() {
  const u = L - st.candle, s = st.screen - L, key = C.region(u), scr = C.onScreen(u, s), im = C.image(u);
  const step = C.currentStep(st), S = C.STEPS[step];
  [...stepsEl.children].forEach((b, i) => { b.className = i < step || (i === step && step === C.STEPS.length - 1) ? 'done' : i === step ? 'now' : ''; });
  $('stepNo').textContent = `第 ${step + 1} 步 / 共 ${C.STEPS.length} 步`;
  $('stepTitle').textContent = S.title; $('stepGoal').textContent = (st.sun && step > 0 ? '先关掉「平行光」，' : '') + S.goal;
  guessEl.hidden = !(S.id === 'guess' || st.predicted != null && step <= 2);
  [...guessEl.children].forEach((b, i) => b.classList.toggle('picked', st.predicted === i));
  $('guessNote').hidden = S.id !== 'guess' && S.id !== 'far';   // shown while the guess is being tested (step 3); it returns on the answer card
  $('answer').hidden = S.id !== 'answer';
  if (S.id === 'answer' && st.predicted != null) $('answerGuess').textContent = `你一开始猜蜡烛放远时是「${C.GUESS[st.predicted]}」，实验结果是「倒立、缩小」：${st.predicted === C.GUESS_RIGHT ? '猜对了。' : '没猜中，现在知道为什么了。'}`;
  const nearNow = key === 'near' && !st.sun;
  $('eye').disabled = !nearNow; $('eye').title = nearNow ? '' : '蜡烛放到焦点以内才用得上';
  if (st.eye && !nearNow) st.eye = false;
  $('sun').setAttribute('aria-pressed', String(st.sun)); $('eye').setAttribute('aria-pressed', String(st.eye)); $('ray').setAttribute('aria-pressed', String(rayOn));
  if (slHeld !== 'candle') sl.candle.value = st.candle;
  if (slHeld !== 'screen') sl.screen.value = st.screen;
  $('candleOut').textContent = st.sun ? '—' : `${fmt(st.candle)} cm`; $('screenOut').textContent = `${fmt(st.screen)} cm`;
  $('uLabel').textContent = st.sun ? '光源' : '物距 u（蜡烛到透镜）';
  $('u').textContent = st.sun ? '平行光（像来自很远处）' : `${fmt(u)} cm${key === 'two' ? '（= 2f）' : key === 'focal' ? '（= f）' : ''}`;
  let v = st.sun ? '—' : '对清楚后显示', status = '', cls = '', bar = 0;
  if (st.sun) {
    const d = C.sunSpot(s); bar = 1 / (1 + d * 1.2);
    status = d < C.SHARP ? '光斑最小最亮！这里就是焦点' : `光斑直径 ${fmt(d)} cm，把光屏往${s > F ? '左' : '右'}移`; cls = d < C.SHARP ? 'ok' : '';
  } else if (st.eye) {
    if (im.kind === 'virtual') { status = '透过透镜看：一个正立、放大的虚像'; cls = 'ok'; v = `${fmt(-im.v)} cm（在蜡烛这一侧）`; }
  } else if (key === 'focal') { v = '没有像'; const d = C.sweepDone(st); status = st.found.has('focal') ? '怎么移都接不到像：出来的光是平行的' : `光屏上接不到清晰的像。已来回移了 ${fmt(Math.min(d, C.SWEEP_NEED))} / ${C.SWEEP_NEED} cm`; cls = 'warn'; }
  else if (key === 'near') { v = '光屏上没有'; status = '光屏上接不到像。试试「用眼睛看」'; cls = 'warn'; }
  else if (!scr.reachable) { v = `${fmt(scr.v)} cm（够不着）`; status = `像在 ${fmt(scr.v)} cm 外，光屏够不着，把蜡烛挪远一点`; cls = 'warn'; }
  else {
    bar = 1 / (1 + scr.blur * 1.5);
    if (scr.sharp) { status = `清晰！${C.describe(key)}${Math.abs(s - scr.v) > 0.05 ? `（光屏离正好的位置差 ${fmt(Math.abs(s - scr.v))} cm，眼睛已经看不出糊）` : ''}`; cls = 'ok'; v = `${fmt(scr.v)} cm`; }
    else status = `像是模糊的，把光屏往${s < scr.v ? '右' : '左'}移`;
  }
  if (cls === 'ok') bar = 1;
  $('v').textContent = v; $('sharp').style.width = `${Math.round(bar * 100)}%`;
  const el = $('status'); if (el.textContent !== status) el.textContent = status; el.className = cls;
}

// ---------------- what the screen shows (also shown enlarged in the corner inset) ----------------
const spiral = (n) => Array.from({ length: n }, (_, i) => { const a = i * 2.39996, r = Math.sqrt((i + 0.5) / n); return [r * Math.cos(a), r * Math.sin(a)]; });
const disk = spiral(14), disks = {};
// one candle in object coordinates (y up from the axis, flame tip at +OBJ_H); caller sets the transform
function candleShape(g, bright, flick) {
  g.fillStyle = `rgba(214,160,120,${0.32 * bright})`; g.fillRect(-1.25, 4 - Y0, 2.5, CANDLE_TOP - 4);
  g.fillStyle = `rgba(255,140,40,${0.85 * bright})`;
  g.beginPath(); g.moveTo(0, C.OBJ_H * flick); g.bezierCurveTo(0.9, 0.6, 0.95, -1.0, 0, -1.3); g.bezierCurveTo(-0.95, -1.0, -0.9, 0.6, 0, C.OBJ_H * flick); g.fill();
  g.fillStyle = `rgba(255,220,120,${0.9 * bright})`; g.beginPath(); g.ellipse(0, -0.3, 0.45, 1.0, 0, 0, Math.PI * 2); g.fill();
}
function drawScreen(time) {
  const g = scrCanvas.getContext('2d'), W = scrCanvas.width, k = W / SCR, cx = W / 2, cy = W / 2;
  const flick = 1 + 0.05 * Math.sin(time * 9.1) + 0.03 * Math.sin(time * 23.7);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  const u = L - st.candle, s = st.screen - L;
  if (st.eye && !st.sun) {   // what an eye behind the lens sees through it
    g.fillStyle = '#d9d3c6'; g.fillRect(0, 0, W, W);
    g.save(); g.beginPath(); g.arc(cx, cy, W * 0.47, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#eef3f2'; g.fillRect(0, 0, W, W);
    const im = C.image(u);
    if (im.kind === 'none') { g.filter = 'none'; for (const [dx, dy] of disk) { g.globalAlpha = 0.08; g.save(); g.translate(cx + dx * 60, cy + dy * 60); g.scale(k * 2.4, -k * 2.4); candleShape(g, 0.8, flick); g.restore(); } }
    else { const sc = Math.min(Math.abs(im.m), 4) * k * 0.7; g.save(); g.translate(cx, cy); g.scale(sc, im.m > 0 ? -sc : sc); candleShape(g, 1, flick); g.restore(); }
    g.restore(); g.globalAlpha = 1;
    g.strokeStyle = INK; g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, W * 0.47, 0, Math.PI * 2); g.stroke();
    return;
  }
  g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, W, W);
  g.strokeStyle = 'rgba(31,42,68,.12)'; g.lineWidth = 1; for (let i = 1; i < 13; i++) { g.beginPath(); g.moveTo(i * W / 13, 0); g.lineTo(i * W / 13, W); g.moveTo(0, i * W / 13); g.lineTo(W, i * W / 13); g.stroke(); }
  g.globalCompositeOperation = 'multiply';
  if (st.sun) {
    const d = Math.max(C.sunSpot(s), 0.6), r = (d / 2) * k, a = Math.min(1, 1.2 / (d * d + 0.4));
    if (C.sunSpot(s) < C.SHARP) { const h = g.createRadialGradient(cx, cy, 0, cx, cy, 2.2 * k); h.addColorStop(0, 'rgba(255,190,90,.9)'); h.addColorStop(1, 'rgba(255,220,170,0)'); g.fillStyle = h; g.beginPath(); g.arc(cx, cy, 2.2 * k, 0, Math.PI * 2); g.fill(); }
    const grd = g.createRadialGradient(cx, cy, 0, cx, cy, r * 1.15); grd.addColorStop(0, `rgba(255,170,60,${0.35 + 0.65 * a})`); grd.addColorStop(0.8, `rgba(255,200,120,${0.25 + 0.5 * a})`); grd.addColorStop(1, 'rgba(255,220,170,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, r * 1.15, 0, Math.PI * 2); g.fill();
    return;
  }
  const scr = C.onScreen(u, s);
  if (scr.kind !== 'real') { g.fillStyle = 'rgba(255,214,160,.35)'; g.beginPath(); g.arc(cx, cy, 6 * k, 0, Math.PI * 2); g.fill(); return; }
  // light from each flame point spreads over the blur circle; the picture is upside down and scaled by |m| about the axis
  // enough samples that the blur reads as a smooth smear, not a cloud of copies (about one per 3 px of blur radius squared)
  const m = scr.m, blurR = Math.min(scr.blur / 2, 8) * k, n = blurR < 1.5 ? 1 : Math.min(72, Math.max(10, Math.round((blurR / 2.6) ** 2)));
  const pts = n === 1 ? [[0, 0]] : (disks[n] = disks[n] || spiral(n));
  const bright = Math.min(1, 1.6 / Math.max(1, m * m * 0.6));   // a bigger picture is dimmer
  for (let i = 0; i < n; i++) {
    const ox = pts[i][0] * blurR, oy = pts[i][1] * blurR;
    g.globalAlpha = Math.min(1, 2.2 / n + 0.015);
    g.save(); g.translate(cx + ox, cy + oy); g.scale(-k * Math.abs(m), k * Math.abs(m)); candleShape(g, bright, flick); g.restore();
  }
  g.globalAlpha = 1;
}

// ---------------- rays ----------------
let rayKey = '';
function updateRays() {
  const key = [st.candle.toFixed(2), st.screen.toFixed(2), st.sun, st.eye, rayOn].join();
  if (key === rayKey) return; rayKey = key;
  for (const c of [...rayGroup.children]) { rayGroup.remove(c); c.geometry.dispose(); }
  if (!rayOn) return;
  const xEnd = st.eye ? 100 : st.screen;
  if (st.sun) {
    const lines = [];
    for (const h of [-2.4, -1.2, 0, 1.2, 2.4]) { lines.push([3, Y0 + h, 0, L, Y0 + h, 0]); lines.push([L, Y0 + h, 0, xEnd, Y0 + h - (h / F) * (xEnd - L), 0]); }
    rayGroup.add(segs(lines, sunMat)); return;
  }
  const u = L - st.candle, r = C.rays(u, xEnd);
  const P = (seg) => [seg[0], Y0 + seg[1], 0, seg[2], Y0 + seg[3], 0];
  // pairs: ray 1 = solid[0..1], ray 2 = solid[2], ray 3 = solid[3..4]
  rayGroup.add(segs([P(r.solid[0]), P(r.solid[1])], rayMats[0]));
  rayGroup.add(segs([P(r.solid[2])], rayMats[1]));
  if (r.solid.length > 3) rayGroup.add(segs([P(r.solid[3]), P(r.solid[4])], rayMats[2]));
  if (r.dashed.length) rayGroup.add(segs(r.dashed.map(P), dashMat));
}

// ---------------- camera ----------------
const controls = new OrbitControls(camera, canvas);
controls.enablePan = false; controls.enableDamping = true; controls.dampingFactor = 0.12;
controls.minAzimuthAngle = -0.75; controls.maxAzimuthAngle = 0.75; controls.minPolarAngle = 0.75; controls.maxPolarAngle = 1.5;
const DIR = new THREE.Vector3(-0.2, 0.34, 1).normalize();
const TARGET = new THREE.Vector3(51, Y0 - 4, 0);
function fitDistance() {
  const vf = THREE.MathUtils.degToRad(camera.fov), hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
  return Math.max(55 / Math.tan(hf / 2), 24 / Math.tan(vf / 2));
}
function applyFit() { controls.minDistance = fitDistance() * 0.55; controls.maxDistance = fitDistance() * 1.25; }
function resize() {
  const r = canvas.parentElement.getBoundingClientRect(), w = Math.max(1, r.width), h = Math.max(1, r.height);
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  RES.set(w * DPR, h * DPR); lineMats.forEach((m) => m.resolution.copy(RES));
  applyFit();
  camera.position.copy(TARGET).addScaledVector(DIR, fitDistance()); controls.target.copy(TARGET);
  const big = camera.aspect < 1 || w < 600 ? 2.1 : 1; labels.forEach((l) => l.scale.copy(l.userData.base).multiplyScalar(big));
}
new ResizeObserver(resize).observe(canvas.parentElement);
$('home').onclick = () => { camera.position.copy(TARGET).addScaledVector(DIR, fitDistance()); controls.target.copy(TARGET); controls.update(); };
$('restart').onclick = () => location.reload();
// portrait: the close-up of the screen moves into the panel next to the readings, where it can be large
const narrow = matchMedia('(max-aspect-ratio: 1/1), (max-width: 760px)');
const placeInset = () => { const host = narrow.matches ? $('zoomrow') : document.querySelector('.stage'); if ($('inset').parentElement !== host) host.prepend($('inset')); };
narrow.addEventListener('change', placeInset); placeInset();

// ---------------- dragging the candle and the screen ----------------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hitP = new THREE.Vector3();
const hitMat = new THREE.MeshBasicMaterial({ visible: false });
const candleHit = new THREE.Mesh(new THREE.BoxGeometry(9, Y0 + 8, 12), hitMat); candleHit.position.y = (Y0 + 8) / 2; candle.add(candleHit);
const screenHit = new THREE.Mesh(new THREE.BoxGeometry(9, Y0 + SCR / 2 + 2, SCR + 4), hitMat); screenHit.position.y = (Y0 + SCR / 2 + 2) / 2; screen.add(screenHit);
let drag = null;
function pick(e) {
  const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray;
}
canvas.addEventListener('pointerdown', (e) => {
  const hits = pick(e).intersectObjects(st.sun ? [screenHit] : st.eye ? [candleHit] : [candleHit, screenHit], false);
  if (!hits.length) return;
  // the candle wins when both are under the finger: the screen's hit box reaches towards the viewer and covers the flame
  drag = { what: hits.some((h) => h.object === candleHit) ? 'candle' : 'screen', id: e.pointerId };
  if (ray.ray.intersectPlane(plane, hitP)) drag.x = hitP.x;
  drag.raw = drag.what === 'candle' ? st.candle : st.screen;
  controls.enabled = false; canvas.setPointerCapture(e.pointerId); e.preventDefault();
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) { if (!drag && e.pointerType === 'mouse') canvas.style.cursor = pick(e).intersectObjects([candleHit, screenHit], false).length ? 'grab' : 'default'; return; }
  if (!pick(e).ray.intersectPlane(plane, hitP)) return;
  // the object stays under the finger (1:1); fine focusing is what the ◀ ▶ buttons are for. A slowed-down "precision"
  // drag was tried and dropped: the candle lagged behind a moderately slow finger (browser check B5t, 2026-10-29)
  const dx = hitP.x - (drag.x ?? hitP.x); drag.x = hitP.x;
  drag.raw += dx;   // unsnapped position, so a snap does not trap the hand
  if (drag.what === 'candle') st.candle = C.snapCandle(drag.raw); else st.screen = C.clampScreen(drag.raw);
});
const release = (e) => { if (drag && (!e || e.pointerId === drag.id)) { drag = null; controls.enabled = true; } };
canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release); canvas.addEventListener('lostpointercapture', release);
window.addEventListener('blur', () => release());

// ---------------- loop ----------------
const clock = { last: performance.now(), t: 0 };
let ready = false, lastCandle = null;
function frame(now) {
  const dt = Math.min(0.05, (now - clock.last) / 1000); clock.last = now; clock.t += dt;
  st.dragging = !!drag || !!slHeld || nudgeHeld;
  const hit = C.observe(st, dt); if (hit) onFound(hit);
  if (lastCandle !== null && Math.abs(lastCandle - st.candle) > 1e-9 && C.snapCandle(st.candle) === st.candle && [L - F, L - 2 * F].includes(st.candle) && ![L - F, L - 2 * F].includes(lastCandle)) ding(520);
  lastCandle = st.candle;
  candle.position.x = st.candle; candle.visible = !st.sun; sun.visible = st.sun;
  screen.position.x = st.screen; screen.visible = !st.eye;
  const fl = 1 + 0.06 * Math.sin(clock.t * 9.1) + 0.04 * Math.sin(clock.t * 23.7);
  flame.scale.set(1, fl, 1); glow.material.opacity = 0.8 + 0.2 * Math.sin(clock.t * 7.3);
  // ghost image: visible when looking through the lens
  const im = C.image(L - st.candle);
  ghost.visible = st.eye && im.kind === 'virtual' && !st.sun;
  ghostLabel.visible = ghost.visible && im.kind === 'virtual';
  if (ghost.visible) {
    ghost.position.set(L + im.v, Y0, 0); ghost.scale.setScalar(Math.abs(im.m)); ghost.scale.y = im.m;
    ghostLabel.position.set(L + im.v, Y0 + Math.abs(im.m) * (C.OBJ_H + 1) + 2.5, 0);
  }
  controls.update();
  $('insetTitle').textContent = st.eye && !st.sun ? '眼睛透过透镜看到' : '光屏上';
  updateRays(); drawScreen(clock.t); scrTex.needsUpdate = true; updatePanel();
  renderer.render(scene, camera);
  if (!ready) { ready = true; window.__lens.ready = true; }
  requestAnimationFrame(frame);
}

window.__lens = {
  ready: false,
  state: () => ({ candle: st.candle, screen: st.screen, u: L - st.candle, sun: st.sun, eye: st.eye, predicted: st.predicted, focusFound: st.focusFound, found: [...st.found], step: C.currentStep(st), rays: rayOn }),
  set: (o) => { if ('candle' in o) st.candle = C.snapCandle(o.candle); if ('screen' in o) st.screen = C.clampScreen(o.screen); for (const k of ['sun', 'eye', 'predicted']) if (k in o) st[k] = o[k]; },
  info: () => ({ aspect: camera.aspect, camDist: camera.position.distanceTo(controls.target), fit: fitDistance(), calls: renderer.info.render.calls, tris: renderer.info.render.triangles, renderer: (() => { const gl = renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; })() }),
  // page coordinates of a bench point (x on the ruler, y above the rail top, z = 0)
  project: (x, y = Y0 - 4) => { const p = new THREE.Vector3(x, y, 0).project(camera), r = canvas.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height }; },
  bestScreen: () => C.bestScreen(L - st.candle),
};
window.__PLAYTEST__ = { get ready() { return window.__lens.ready; }, snapshot: () => window.__lens.state(), reset: () => location.reload() };
resize();
requestAnimationFrame(frame);
