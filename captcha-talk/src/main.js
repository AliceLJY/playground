// 放映：翻页、物体接力转场、屏上的字、讲稿、右下角的分数。
// 键：→ ↓ 空格 PageDown Enter 下一步；← ↑ PageUp Backspace 上一步；Home End；F 全屏；A 自动播放；N 讲稿。
// 网址参数：?step=N 从第 N 步开始（0 起）；&t=秒 该步已过去的秒数；?notes=1 打开讲稿；
// ?headless=1 不跑动画循环，由 window.__talk.step(ms) 推时间（静音、固定时间步，录视频用）。
import * as THREE from 'three';
import { steps, SCENES, SOURCES } from './deck.js';
import { widget } from './shell.js';
import { makeWorlds, TRANS_DUR } from './worlds.js';

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
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));

const worlds = makeWorlds({ widget });

// ---------- 物体接力转场状态 ----------
// 不再使用 2D 截图撕纸/折叠覆盖层；每场第 0 拍前 TRANS_DUR[scene] 秒由三维世界自身完成
// 从上一场核心物体到下一场世界的连续物理变形。trans 仅用于追踪转场窗口与标题延迟。
let trans = null;

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
    const dur = TRANS_DUR[to.scene] || 0;
    const handoff = worlds[from.scene].getHandoff?.(from.beat, now - beatStart) || null;
    worlds[to.scene].enterFrom?.(handoff);
    trans = dur > 0 ? { dur, start: now, from: from.scene, to: to.scene } : null;
  } else {
    if (from.scene !== to.scene) worlds[to.scene].enterFrom?.(null);
    trans = null;
  }
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
    d.style.display = ''; d.className = 'lab ' + (L.cls || '') + ' ' + (L.ink || ink); d.textContent = L.text; d.style.opacity = L.alpha ?? 1;
    d.style.transform = `translate(${((v.x + 1) / 2 * innerWidth).toFixed(1)}px, ${((1 - v.y) / 2 * innerHeight).toFixed(1)}px) translate(-50%, -120%)`;
  });
}
const HDELAY = { 'click.1': 2.2, 'list.0': 0.9 };
function displayedScore() { const s = STEPS[cur], bt = now - beatStart; return prevScore + (s.score - prevScore) * ease(seg(bt, .5, 1.6)); }

// ---------- 每一帧 ----------
function frame() {
  const s = STEPS[cur], w = worlds[s.scene];
  let bt = now - beatStart; if (REDUCED) bt += 60;
  if (trans && (now - trans.start) >= trans.dur) trans = null;
  const out = w.update(s.beat, bt) || {};
  renderer.setRenderTarget(null); renderer.autoClear = true; renderer.render(w.scene, w.camera);

  // 标题与小灰字
  const key = s.scene + '.' + s.beat, tdur = TRANS_DUR[s.scene] || 0;
  const delay = (HDELAY[key] ?? .25) + (bt < 5 && s.beat === 0 && tdur > 0 ? tdur * .68 : 0);
  const ka = REDUCED ? 1 : ease(seg(bt, delay, delay + .5));
  h1.textContent = s.h; sm.textContent = s.s;
  hd.style.opacity = s.h || s.s ? ka : 0; hd.style.transform = `translateY(${(1 - ka) * 14}px)`;
  hd.className = 'hd ' + (w.ink === 'light' ? 'light' : 'dark') + (s.h ? '' : ' only-s') + (s.scene === 'sources' ? ' hide' : '');

  // 分数：它给你的分；它自己点过之后，那个分归它
  const ai = s.scene === 'click' && s.beat === 1 && bt > .7;
  score.textContent = (ai ? s.score : displayedScore()).toFixed(1);
  score.className = 'score ' + (ai ? 'ai' : w.ink === 'light' ? 'light' : 'dark');
  setLabels(out.labels || [], w.camera, w.ink === 'light' ? 'light' : 'dark');

  // 资料页：跟随转场 8 平滑显现
  if (s.scene === 'sources') {
    src.hidden = false;
    src.style.opacity = REDUCED ? 1 : ease(seg(bt, 0.22, 0.55));
  } else {
    src.hidden = true;
    src.style.opacity = 1;
  }

  hint.hidden = advanced || HEADLESS;
  pos.textContent = `${cur + 1} / ${STEPS.length}`; navPrev.disabled = cur === 0; navNext.disabled = cur === STEPS.length - 1;
  if (notesOn) { const sc = SCENES[s.si]; notes.hidden = false; notes.innerHTML = `<div class="idx">${cur + 1} / ${STEPS.length} · 第 ${s.si + 1} 场 ${sc.id} · 第 ${s.beat + 1} 拍</div><div>${s.notes}</div>`; } else notes.hidden = true;
  if (auto && bt > (s.dur || 9)) next();
}

// ---------- 尺寸 ----------
function resize() {
  const W = innerWidth, H = innerHeight, a = W / H;
  renderer.setSize(W, H, false);
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
