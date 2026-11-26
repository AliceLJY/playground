// 放映：翻页、转场、屏上的字、讲稿、右下角的分数。
// 键：→ ↓ 空格 PageDown Enter 下一步；← ↑ PageUp Backspace 上一步；Home End；F 全屏；A 自动播放；N 讲稿。
// 网址参数：?step=N 从第 N 步开始（0 起）；&t=秒 该步已过去的秒数；?notes=1 打开讲稿；
// ?headless=1 不跑动画循环，由 window.__talk.step(ms) 推时间（静音、固定时间步，录视频用）。
import * as THREE from 'three';
import { steps, SCENES, SOURCES } from './deck.js';
import { widget } from './shell.js';
import { makeWorlds, FLAT_FOV, DIST } from './worlds.js';

const qs = new URLSearchParams(location.search);
const HEADLESS = qs.get('headless') === '1';
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const STEPS = steps();
const $ = id => document.getElementById(id);
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const ease = k => { k = clamp(k); return k * k * (3 - 2 * k); };

const canvas = $('stage');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: HEADLESS, powerPreference: 'high-performance' }); }
catch (e) { $('fail').hidden = false; $('fail').textContent = '这台设备的浏览器没能打开 WebGL，演讲放不起来。换一个浏览器，或者在电脑上打开试试。'; throw e; }
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));

const worlds = makeWorlds({ widget });

// ---------- 转场：把上一场的最后一帧拍下来，当一张纸撕开、折起、揉皱、掀倒 ----------
const TRANS = { word: ['lift', 1.5], grid: ['tear', 1.15], check: ['fold', 1.05], label: ['crumple', 1.3], click: ['zoom', .55], list: ['none', 0], shell2: ['cut', 0], sources: ['cut', 0] };
const snap = document.createElement('canvas'), snapTex = new THREE.CanvasTexture(snap); snapTex.colorSpace = THREE.SRGBColorSpace;
const ov = { scene: new THREE.Scene(), cam: new THREE.PerspectiveCamera(FLAT_FOV, 16 / 9, .01, 50) };
ov.cam.position.set(0, 0, DIST); ov.cam.lookAt(0, 0, 0);
const ovMat = side => new THREE.ShaderMaterial({
  transparent: true, side: THREE.DoubleSide, toneMapped: false,
  uniforms: { map: { value: snapTex }, k: { value: 0 }, side: { value: side }, mode: { value: 0 }, alpha: { value: 1 } },
  vertexShader: `uniform float k; uniform float mode; varying vec2 vu; varying float shade;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    void main(){ vu = uv; vec3 p = position; shade = 1.;
      if (mode > 2.5 && mode < 3.5) {
        float n = h(floor(uv*vec2(9.,6.))) - .5, m = h(floor(uv*vec2(17.,11.))+3.) - .5;
        p.z += (n*.35 + m*.18) * k; p.xy *= 1. - .82*k*k; p.xy += vec2(n, m) * .12 * k; shade = 1. - abs(n+m)*k*.9; }
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.); }`,
  fragmentShader: `uniform sampler2D map; uniform float k; uniform float side; uniform float mode; uniform float alpha; varying vec2 vu; varying float shade;
    void main(){ if (mode > .5 && mode < 1.5) {
        float edge = .5 + .035*sin(vu.y*41.) + .02*sin(vu.y*97.+1.3) + .012*sin(vu.y*233.);
        if (side < 0. && vu.x > edge) discard; if (side > 0. && vu.x < edge) discard;
        float d = abs(vu.x - edge); vec4 c = texture2D(map, vu); c.rgb = mix(vec3(.9,.88,.84), c.rgb, smoothstep(.0, .006, d)); gl_FragColor = vec4(c.rgb*shade, alpha); }
      else { vec4 c = texture2D(map, vu); gl_FragColor = vec4(c.rgb*shade, alpha); }
      #include <colorspace_fragment>
    }`,
});
const halves = [-1, 1].map(s => { const pivot = new THREE.Group(), m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 48, 28), ovMat(s)); pivot.add(m); ov.scene.add(pivot); return { pivot, m }; });
let trans = null;
function layoutOverlay(type, k) {
  const a = innerWidth / innerHeight, e = k * k;
  for (const H of halves) { H.pivot.position.set(0, 0, 0); H.pivot.rotation.set(0, 0, 0); H.pivot.scale.set(1, 1, 1); H.m.position.set(0, 0, 0); H.m.scale.set(a, 1, 1); H.m.visible = true;
    H.m.material.uniforms.k.value = k; H.m.material.uniforms.alpha.value = 1; H.m.material.uniforms.mode.value = { tear: 1, crumple: 3 }[type] || 0; }
  const [L, R] = halves;
  if (type === 'tear') {
    [L, R].forEach((H, i) => { const s = i ? 1 : -1; H.pivot.position.set(s * a / 2, 0, 0); H.m.position.set(-s * a / 2, 0, 0); H.pivot.rotation.y = -s * e * 1.9; H.pivot.position.x += s * e * a * .25; H.pivot.position.y = -e * .35; });
  } else {
    R.m.visible = false;
    if (type === 'lift') { L.pivot.position.set(0, -.5, 0); L.m.position.set(0, .5, 0); L.pivot.rotation.x = -ease(k) * 1.62; L.pivot.position.y -= ease(k) * .25; L.pivot.position.z -= ease(k) * .5; L.m.material.uniforms.alpha.value = 1 - seg(k, .7, 1); }
    if (type === 'fold') { L.pivot.position.set(0, -.5, 0); L.m.position.set(0, .5, 0); L.pivot.rotation.x = e * 2.0; }
    if (type === 'crumple') { L.pivot.position.set(e * .2, e * .9, -e * .6); L.pivot.rotation.z = e * .9; }
    if (type === 'zoom') { const s = 1 + e * 2.2; L.pivot.scale.set(s, s, 1); L.m.material.uniforms.alpha.value = 1 - k; }
  }
}

// ---------- 状态 ----------
let cur = 0, now = 0, beatStart = 0, auto = false, advanced = false, notesOn = qs.get('notes') === '1';
const startAt = parseInt(qs.get('step') || '0', 10);
if (startAt > 0 && startAt < STEPS.length) { cur = startAt; beatStart = -(parseFloat(qs.get('t') || '0')); advanced = true; }
let prevScore = STEPS[cur].score;

function go(i, back = false) {
  i = clamp(i, 0, STEPS.length - 1); if (i === cur) return;
  const from = STEPS[cur], to = STEPS[i];
  prevScore = displayedScore();
  if (from.scene !== to.scene && !back && !REDUCED) {
    const tr = TRANS[to.scene] || ['cut', 0];
    if (tr[0] !== 'none' && tr[0] !== 'cut') {
      const w = worlds[from.scene], bt = now - beatStart;
      // 把上一场此刻的样子画到屏幕上，同一个任务里立刻拷走（不需要 preserveDrawingBuffer）
      w.hidePanel = true; w.update(from.beat, bt); w.hidePanel = false;
      renderer.setRenderTarget(null); renderer.render(w.scene, w.camera);
      if (snap.width !== canvas.width || snap.height !== canvas.height) { snap.width = canvas.width; snap.height = canvas.height; }
      snap.getContext('2d').drawImage(canvas, 0, 0); snapTex.needsUpdate = true;
      trans = { type: tr[0], dur: tr[1], start: now };
    } else trans = null;
  } else trans = null;
  cur = i; beatStart = back ? now - 60 : now; advanced = true;
}
const next = () => go(cur + 1), prev = () => go(cur - 1, true);

// ---------- 屏上的字 ----------
const hd = $('hd'), h1 = $('h'), sm = $('s'), score = $('score'), notes = $('notes'), hint = $('hint'), labelsEl = $('labels'), src = $('sources');
src.innerHTML = '<h2>资料</h2><div class="again"><button type="button" class="primary" data-nav="restart">↺ 从头再看</button><button type="button" data-nav="prev">← 回到收尾</button></div><ol>'
  + SOURCES.map(([a, b]) => `<li><b>${a}</b><span>${b}</span></li>`).join('') + '</ol><p class="fine">数字的口径、能说与不能说的话，讲稿（按 N）里逐条写了。</p>';
const pool = [];
function setLabels(list, cam, ink) {
  while (pool.length < list.length) { const d = document.createElement('div'); labelsEl.appendChild(d); pool.push(d); }
  pool.forEach((d, i) => {
    const L = list[i]; if (!L) { d.style.display = 'none'; return; }
    const v = L.p.clone().project(cam); if (v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) { d.style.display = 'none'; return; }
    d.style.display = ''; d.className = 'lab ' + (L.cls || '') + ' ' + ink; d.textContent = L.text; d.style.opacity = L.alpha ?? 1;
    d.style.transform = `translate(${((v.x + 1) / 2 * innerWidth).toFixed(1)}px, ${((1 - v.y) / 2 * innerHeight).toFixed(1)}px) translate(-50%, -120%)`;
  });
}
const HDELAY = { 'click.1': 2.6, 'list.0': .3 };
function displayedScore() { const s = STEPS[cur], bt = now - beatStart; return prevScore + (s.score - prevScore) * ease(seg(bt, .5, 1.6)); }

// ---------- 每一帧 ----------
function frame() {
  const s = STEPS[cur], w = worlds[s.scene];
  let bt = now - beatStart; if (REDUCED) bt += 60;
  const out = w.update(s.beat, bt) || {};
  renderer.setRenderTarget(null); renderer.autoClear = true; renderer.render(w.scene, w.camera);
  if (trans) {
    const k = (now - trans.start) / trans.dur;
    if (k >= 1) trans = null; else { layoutOverlay(trans.type, clamp(k)); renderer.autoClear = false; renderer.clearDepth(); renderer.render(ov.scene, ov.cam); renderer.autoClear = true; }
  }
  // 标题与小灰字
  const key = s.scene + '.' + s.beat, delay = (HDELAY[key] ?? .25) + (bt < 5 && s.beat === 0 && TRANS[s.scene] ? TRANS[s.scene][1] * .6 : 0);
  const ka = REDUCED ? 1 : ease(seg(bt, delay, delay + .5));
  h1.textContent = s.h; sm.textContent = s.s;
  hd.style.opacity = s.h || s.s ? ka : 0; hd.style.transform = `translateY(${(1 - ka) * 14}px)`;
  hd.className = 'hd ' + (w.ink === 'light' ? 'light' : 'dark') + (s.h ? '' : ' only-s') + (s.scene === 'sources' ? ' hide' : '');
  // 分数：它给你的分；它自己点过之后，那个分归它
  const ai = s.scene === 'click' && s.beat === 1 && bt > .7;
  score.textContent = (ai ? s.score : displayedScore()).toFixed(1);
  score.className = 'score ' + (ai ? 'ai' : w.ink === 'light' ? 'light' : 'dark');
  setLabels(out.labels || [], w.camera, w.ink === 'light' ? 'light' : 'dark');
  src.hidden = s.scene !== 'sources';
  hint.hidden = advanced || HEADLESS;
  pos.textContent = `${cur + 1} / ${STEPS.length}`; navPrev.disabled = cur === 0; navNext.disabled = cur === STEPS.length - 1;
  if (notesOn) { const sc = SCENES[s.si]; notes.hidden = false; notes.innerHTML = `<div class="idx">${cur + 1} / ${STEPS.length} · 第 ${s.si + 1} 场 ${sc.id} · 第 ${s.beat + 1} 拍</div><div>${s.notes}</div>`; } else notes.hidden = true;
  if (auto && bt > (s.dur || 9)) next();
}

// ---------- 尺寸 ----------
function resize() {
  const W = innerWidth, H = innerHeight, a = W / H;
  renderer.setSize(W, H, false);
  ov.cam.aspect = a; ov.cam.updateProjectionMatrix();
  for (const w of Object.values(worlds)) w.resize(a);
}
addEventListener('resize', resize); resize();

// ---------- 输入 ----------
addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'Enter'].includes(k)) { e.preventDefault(); if (!e.repeat) next(); }
  else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) { e.preventDefault(); prev(); }
  else if (k === 'Home') go(0, true);
  else if (k === 'End') go(STEPS.length - 2, true);   // 最后一页是资料页，End 停在收尾
  else if (k === 'f' || k === 'F') { if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(() => {}); }
  else if (k === 'a' || k === 'A') auto = !auto;
  else if (k === 'n' || k === 'N') notesOn = !notesOn;
});
// 点：右侧七成下一步、左侧三成上一步；手指左右滑：往左滑下一步、往右滑上一步
let downX = null;
canvas.addEventListener('pointerdown', e => { downX = e.clientX; });
canvas.addEventListener('pointerup', e => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const dx = downX == null ? 0 : e.clientX - downX; downX = null;
  if (Math.abs(dx) > 40) (dx < 0 ? next : prev)(); else (e.clientX > innerWidth * .3 ? next : prev)();
});
// 翻页按钮（底部那条，和资料页上的「从头再看」「回到收尾」）
const pos = $('pos'), navPrev = document.querySelector('#nav [data-nav="prev"]'), navNext = document.querySelector('#nav [data-nav="next"]');
document.addEventListener('click', e => {
  const b = e.target.closest('[data-nav]'); if (!b) return;
  const k = b.dataset.nav; if (k === 'next') next(); else if (k === 'prev') prev(); else if (k === 'restart') go(0);
  b.blur();
});
// 电脑上鼠标两秒半不动就把翻页条藏起来（讲者放映时不碍眼）；触屏一直留着
let idleT; const wake = e => { if (e && e.pointerType && e.pointerType !== 'mouse') return; document.body.classList.remove('idle'); clearTimeout(idleT); if (!matchMedia('(pointer: coarse)').matches) idleT = setTimeout(() => document.body.classList.add('idle'), 2500); };
addEventListener('pointermove', wake); wake();
if (HEADLESS || qs.get('clean') === '1') document.body.classList.add('headless');

// ---------- 时间 ----------
const api = {
  ready: false, steps: STEPS.length,
  info: () => { const s = STEPS[cur]; return { index: cur, scene: s.scene, beat: s.beat, t: now - beatStart, h: s.h, s: s.s, notes: s.notes, trans: !!trans, renderer: rendererName() }; },
  next, prev, go: i => go(i), step(ms) { now += ms / 1000; frame(); return api.info(); },
};
function rendererName() { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); }
window.__talk = api;
window.__PLAYTEST__ = { get ready() { return api.ready; }, snapshot: () => api.info(), step: ms => api.step(ms) };
if (HEADLESS) { frame(); api.ready = true; window.ready = true; }
else {
  let last = performance.now();
  renderer.setAnimationLoop(t => { now += Math.min(.1, (t - last) / 1000); last = t; frame(); if (!api.ready) { api.ready = true; window.ready = true; } });
}
