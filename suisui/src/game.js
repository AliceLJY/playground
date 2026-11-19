// 碎碎平安 · the page: shelf layout, tap / hold / swipe, refills, words, shake, smash-all, typed worries.
// Rules and numbers live in core.js (SPEC.md); the particle engine is vendor/dissolve-atlas.js.
import { play, snapshot, cancelAll } from '../vendor/dissolve-atlas.js';
import { draw } from './draw.js';
import { Sound } from './sound.js';

const C = window.SuiCore, G = C.G, K = C.KINDS;
const $ = (s) => document.querySelector(s);
const q = new URLSearchParams(location.search);
const VIEW = q.get('view') || '';
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const store = {
  get(k, d) { if (VIEW) return d; try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } },
  set(k, v) { if (VIEW) return; try { localStorage.setItem(k, v); } catch { /* private mode: the page works without it */ } },
};

const S = {
  seed: (Number(q.get('seed')) >>> 0) || (VIEW ? 1 : (Math.random() * 1e9) >>> 0),
  L: null, slots: [], r: Math.random, gen: 0,
  count: Number(store.get('suisui.count', '0')) || 0, smashes: 0, active: 0,
  ready: false, allBusy: false, charging: new Set(),
};
const sound = new Sound();
sound.muted = store.get('suisui.muted', '0') === '1';

const shelf = $('#shelf'), stage = $('#stage'), countEl = $('#count'), hint = $('#hint');
countEl.textContent = S.count;

/* ---------- layout and items ---------- */

function setVH() { document.documentElement.style.setProperty('--vh', innerHeight + 'px'); }

function build(keep) {
  cancelAll();
  for (const h of S.charging) h.hum.stop();
  S.charging.clear(); S.active = 0; S.gen++;
  const L = C.layout(innerWidth, innerHeight); S.L = L;
  document.documentElement.style.setProperty('--shelf-w', L.shelfW + 'px');
  shelf.style.gridTemplateColumns = `repeat(${L.cols}, ${L.cell}px)`;
  shelf.style.gridAutoRows = L.cell + 'px';
  const init = C.createShelf(S.seed, L.count, L.cols); S.r = init.r;
  shelf.replaceChildren(); S.slots = [];
  for (let i = 0; i < L.count; i++) {
    const el = document.createElement('div');
    el.className = 'slot'; el.tabIndex = 0; el.setAttribute('role', 'button');
    el.innerHTML = '<div class="lamp"></div><div class="shade"></div><div class="charge" aria-hidden="true"><i></i></div>';
    const slot = { i, el, kind: null, text: '', cv: null, busy: false, gen: S.gen };
    S.slots.push(slot); shelf.appendChild(el);
    const kept = keep && keep[i];
    put(slot, kept ? kept.kind : init.kinds[i], kept ? kept.text : init.notes[i]);
    bind(slot);
  }
}

function pickNote() { return C.NOTES[Math.floor(S.r() * C.NOTES.length)]; }

function put(slot, kind, text) {
  slot.kind = kind; slot.text = kind === 'note' ? (text || pickNote()) : '';
  const s = S.L.item;
  const cv = snapshot(s, s, (ctx) => draw(kind, ctx, s, s, slot.text));
  cv.style.width = s + 'px'; cv.style.height = s + 'px';
  slot.el.querySelector('.shade').style.width = Math.round(s * 0.78) + 'px';
  if (slot.cv) slot.cv.replaceWith(cv); else slot.el.appendChild(cv);
  slot.cv = cv;
  slot.el.setAttribute('aria-label', `砸碎${K[kind].name}${slot.text ? '：' + slot.text : ''}`);
}

// Measure the item without the hover lift, then hide it: the engine draws the grains from here on.
function lift(slot) {
  slot.el.classList.add('empty');
  slot.cv.style.transition = 'none';
  const r = slot.cv.getBoundingClientRect();
  slot.cv.style.opacity = '0';
  return r;
}
function showItem(slot) {
  slot.cv.style.transition = 'none'; slot.cv.style.opacity = '1';
  slot.el.classList.remove('empty');
  requestAnimationFrame(() => { slot.cv.style.transition = ''; });
}

/* ---------- breaking ---------- */

// One break. gesture: tap | swipe | hold. Returns the engine handle and the item box, or null when the slot is busy.
function smash(slot, gesture, pt, { vel, extra, quiet } = {}) {
  if (slot.busy || slot.gen !== S.gen) return null;
  slot.busy = true;
  const r = lift(slot);
  if (!(r.width > 0)) { slot.busy = false; showItem(slot); return null; }
  const local = { x: pt.x - r.left, y: pt.y - r.top };
  const opts = { ...C.plan(slot.kind, gesture, local, { w: r.width, h: r.height }, vel), ...extra };
  S.active++;
  const h = play({ source: slot.cv, x: r.left, y: r.top, w: r.width, h: r.height, ...opts });
  if (gesture !== 'hold') feedback(slot, gesture, pt, r, quiet ? 0.45 : 1, quiet);
  const gen = slot.gen;
  h.done.then(() => { if (gen !== S.gen) return; S.active--; refill(slot); });
  return { h, r };
}

function feedback(slot, gesture, pt, r, level, quiet) {
  const k = K[slot.kind];
  if (!quiet || S.smashes % 2 === 0) sound.play(k.sound, level * (gesture === 'hold' ? 1.3 : 1));
  if (gesture === 'swipe') sound.play('whoosh', 0.6 * level);
  vibrate(gesture === 'hold' ? [35, 25, 45] : quiet ? 0 : 16);
  shake(k.shake * (gesture === 'hold' ? 1.7 : gesture === 'swipe' ? 0.8 : 1) * (quiet ? 0.35 : 1));
  if (!quiet) {
    const at = gesture === 'tap' ? pt : { x: r.left + r.width / 2, y: r.top + r.height * 0.3 };
    floatWords(gesture === 'hold' ? '炸了！' : C.words(slot.kind, S.r), at.x, at.y, gesture === 'hold' ? 34 : 26);
  }
  S.smashes++; S.count++;
  countEl.textContent = S.count;
  store.set('suisui.count', String(S.count));
  hint.classList.add('gone');
}

// After a break the slot gets a new thing that falls or gathers in. Never the same kind as its neighbours.
function refill(slot) {
  const gen = slot.gen;
  setTimeout(() => {
    if (gen !== S.gen) return;
    const kinds = S.slots.map((s) => (s === slot ? null : s.kind));
    put(slot, C.pickKind(S.r, C.avoidFor(kinds, slot.i, S.L.cols)), '');
    enter(slot, S.r() < 0.5 ? 'gather' : 'rain');
  }, 320 + S.r() * 380);
}

function enter(slot, preset) {
  const gen = slot.gen;
  slot.cv.style.transition = 'none'; slot.cv.style.opacity = '0';
  const r = slot.cv.getBoundingClientRect();
  sound.play('appear', 0.6);
  S.active++;
  play({ source: slot.cv, x: r.left, y: r.top, w: r.width, h: r.height, preset }).done.then(() => {
    if (gen !== S.gen) return;
    S.active--; showItem(slot); slot.busy = false;
  });
}

/* ---------- hold to charge ---------- */

function startCharge(slot, st) {
  const got = smash(slot, 'hold', { x: st.x0, y: st.y0 });
  if (!got) return;
  const hold = { slot, h: got.h, r: got.r, pt: { x: st.x0, y: st.y0 }, t0: performance.now(), hum: sound.charge(), released: false, c: 0 };
  st.hold = hold; S.charging.add(hold);
  slot.el.classList.add('charging');
  vibrate(12);
  const tick = (now) => {
    if (hold.released) return;
    const c = Math.min(1, (now - hold.t0) / G.holdMs);
    hold.c = c; hold.h.aux.a0 = c; hold.h.aux.a1 = now - hold.t0; hold.hum.set(c);
    slot.el.style.setProperty('--c', c.toFixed(3));
    if (c >= 1) { burst(hold); return; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
function burst(hold) {
  if (hold.released) return;
  hold.released = true; S.charging.delete(hold);
  hold.hum.stop(); hold.h.release();
  hold.slot.el.classList.remove('charging'); hold.slot.el.style.removeProperty('--c');
  feedback(hold.slot, 'hold', hold.pt, hold.r, 0.7 + hold.c * 0.6, false);
}
function releaseAll() { for (const h of [...S.charging]) burst(h); }

/* ---------- input ---------- */

function velocity(pts) {
  const last = pts[pts.length - 1];
  let first = pts[0];
  for (const p of pts) if (last[2] - p[2] <= G.flingWindow) { first = p; break; }
  const dt = (last[2] - first[2]) / 1000;
  return dt > 0.004 ? { x: (last[0] - first[0]) / dt, y: (last[1] - first[1]) / dt } : { x: last[0] - pts[0][0], y: last[1] - pts[0][1] };
}

function bind(slot) {
  const el = slot.el;
  let st = null;
  el.addEventListener('pointerdown', (e) => {
    if (slot.busy || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    sound.unlock(); e.preventDefault();
    try { el.setPointerCapture(e.pointerId); } catch { /* old browsers */ }
    const now = performance.now();
    st = { id: e.pointerId, t0: now, x0: e.clientX, y0: e.clientY, pts: [[e.clientX, e.clientY, now]], moved: 0, hold: null };
    const mine = st;
    st.timer = setTimeout(() => { if (st === mine && mine.moved < G.moveTol) startCharge(slot, mine); }, G.tapMs);
  });
  el.addEventListener('pointermove', (e) => {
    if (!st || e.pointerId !== st.id) return;
    const now = performance.now();
    st.pts.push([e.clientX, e.clientY, now]);
    while (st.pts.length > 2 && now - st.pts[0][2] > 160) st.pts.shift();
    st.moved = Math.max(st.moved, Math.hypot(e.clientX - st.x0, e.clientY - st.y0));
  });
  const end = (e, cancelled) => {
    if (!st || e.pointerId !== st.id) return;
    const s = st; st = null; clearTimeout(s.timer);
    if (s.hold) { burst(s.hold); return; }
    if (cancelled) return;
    const g = C.classify(performance.now() - s.t0, s.moved);
    if (g === 'swipe') smash(slot, 'swipe', { x: e.clientX, y: e.clientY }, { vel: velocity(s.pts) });
    else smash(slot, 'tap', { x: e.clientX, y: e.clientY });
  };
  el.addEventListener('pointerup', (e) => end(e, false));
  el.addEventListener('pointercancel', (e) => end(e, true));
  el.addEventListener('lostpointercapture', (e) => end(e, true));
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault(); sound.unlock();
    const r = slot.cv.getBoundingClientRect();
    smash(slot, 'tap', { x: r.left + r.width / 2, y: r.top + r.height / 2 });
  });
}
addEventListener('blur', releaseAll);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });

/* ---------- feel ---------- */

function vibrate(p) { if (!p) return; try { navigator.vibrate?.(p); } catch { /* not allowed here */ } }

// Trauma shake: adds up, squared, capped at 1, decays linearly; noise runs on accumulated time.
let trauma = 0, shakeT = 0, shaking = false, lastT = 0;
function shake(a) {
  if (reduced.matches || !a) return;
  trauma = Math.min(1, trauma + a);
  if (!shaking) { shaking = true; lastT = performance.now(); requestAnimationFrame(shakeTick); }
}
function shakeTick(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now; shakeT += dt;
  trauma = Math.max(0, trauma - dt * 1.7);
  if (trauma <= 0) { shaking = false; stage.style.transform = ''; return; }
  const k = trauma * trauma, m = 13 * k;
  const nx = Math.sin(shakeT * 61.3) * 0.6 + Math.sin(shakeT * 97.1 + 1.3) * 0.4;
  const ny = Math.sin(shakeT * 71.7 + 2.1) * 0.6 + Math.sin(shakeT * 113.9) * 0.4;
  stage.style.transform = `translate(${(nx * m).toFixed(2)}px,${(ny * m).toFixed(2)}px) rotate(${(Math.sin(shakeT * 53.1 + 0.7) * k * 1.1).toFixed(3)}deg)`;
  requestAnimationFrame(shakeTick);
}

function floatWords(text, x, y, size, dur) {
  if (document.querySelectorAll('.float').length > 6) return;
  const d = document.createElement('div');
  d.className = 'float'; d.textContent = text;
  d.style.left = x + 'px'; d.style.top = y + 'px'; d.style.setProperty('--fs', size + 'px');
  if (dur) d.style.setProperty('--dur', dur + 's');
  document.body.appendChild(d);
  const bye = () => d.remove();
  d.addEventListener('animationend', bye); setTimeout(bye, (dur || 1.15) * 1000 + 400);
}

/* ---------- smash all, worries, sound switch ---------- */

function smashAll() {
  if (S.allBusy) return;
  const targets = S.slots.filter((s) => !s.busy);
  if (!targets.length) return;
  sound.unlock();
  S.allBusy = true; $('#all').disabled = true;
  const g = C.cascadeGrain(targets.map((s) => s.kind), S.L.item);
  const cols = S.L.cols;
  targets.sort((a, b) => ((a.i % cols) + Math.floor(a.i / cols)) - ((b.i % cols) + Math.floor(b.i / cols)) || a.i - b.i);
  const sr = shelf.getBoundingClientRect();
  floatWords('碎碎平安', sr.left + sr.width / 2, sr.top + sr.height * 0.45, Math.min(72, sr.width / 5.5), 2.2);
  shake(0.5);
  targets.forEach((s, n) => setTimeout(() => {
    if (s.gen !== S.gen) return;
    const r = s.cv.getBoundingClientRect(), k = K[s.kind];
    smash(s, 'tap', { x: r.left + r.width * (0.35 + S.r() * 0.3), y: r.top + r.height * 0.45 }, { quiet: true, extra: k.fx === 'shatter' ? {} : { grain: Math.max(g, k.opts.grain || 0) } });
  }, n * 70));
  setTimeout(() => { S.allBusy = false; $('#all').disabled = false; }, targets.length * 70 + 1200);
}

const dlg = $('#dlg'), noteText = $('#noteText');
function openNote(prefill = '') {
  noteText.value = prefill;
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  setTimeout(() => noteText.focus(), 30);
}
function pasteNote(text) {
  const free = S.slots.filter((s) => !s.busy);
  if (!free.length) return false;
  const pool = free.filter((s) => s.kind !== 'note');
  const slot = (pool.length ? pool : free)[Math.floor(S.r() * (pool.length ? pool : free).length)];
  slot.busy = true;
  lift(slot);
  put(slot, 'note', text);
  enter(slot, 'print');
  const r = slot.cv.getBoundingClientRect();
  setTimeout(() => floatWords('贴好了', r.left + r.width / 2, r.top, 20), 300);
  return slot;
}
$('#noteForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const t = C.cleanNote(noteText.value);
  dlg.close?.(); dlg.removeAttribute('open');
  if (t) { sound.unlock(); pasteNote(t); }
});
$('#noteCancel').addEventListener('click', () => { dlg.close?.(); dlg.removeAttribute('open'); });
$('#write').addEventListener('click', () => openNote());
$('#all').addEventListener('click', smashAll);

const muteBtn = $('#mute');
function paintMute() {
  muteBtn.setAttribute('aria-pressed', String(sound.muted));
  muteBtn.setAttribute('aria-label', sound.muted ? '打开声音' : '关掉声音');
  muteBtn.querySelector('.wave').toggleAttribute('hidden', sound.muted);
  muteBtn.querySelector('.cross').toggleAttribute('hidden', !sound.muted);
}
muteBtn.addEventListener('click', () => { sound.muted = !sound.muted; store.set('suisui.muted', sound.muted ? '1' : '0'); if (!sound.muted) { sound.unlock(); sound.play('appear', 1.5); } paintMute(); });
paintMute();

/* ---------- resize, hooks, start ---------- */

let rt = 0;
function onResize() {
  clearTimeout(rt);
  rt = setTimeout(() => {
    setVH();
    const L = C.layout(innerWidth, innerHeight);
    if (L.cols === S.L.cols && L.rows === S.L.rows && L.cell === S.L.cell) return;
    build(S.slots.map((s) => ({ kind: s.kind, text: s.text })));
  }, 200);
}
addEventListener('resize', onResize);
window.visualViewport?.addEventListener('resize', onResize);

function probe() {
  return {
    ready: S.ready, view: VIEW, seed: S.seed, cols: S.L.cols, rows: S.L.rows, item: S.L.item,
    count: S.count, smashes: S.smashes, active: S.active, charging: S.charging.size,
    floats: document.querySelectorAll('.float').length,
    slots: S.slots.map((s) => ({ kind: s.kind, text: s.text, busy: s.busy, shown: s.cv.style.opacity !== '0' })),
  };
}
window.__suisui = {
  get ready() { return S.ready; }, probe, smashAll, openNote, pasteNote,
  // tap a slot at a point given as a fraction of the item box (tests and fixed views)
  tap(i, fx = 0.5, fy = 0.5) { const s = S.slots[i], r = s.cv.getBoundingClientRect(); return !!smash(s, 'tap', { x: r.left + r.width * fx, y: r.top + r.height * fy }); },
  // put a given kind into a slot (fixed views and per-effect checks); ignored while the slot is busy
  setKind(i, kind, text = '') { const s = S.slots[i]; if (!s || s.busy || !K[kind]) return false; put(s, kind, text); return true; },
  rect(i) { const r = S.slots[i].cv.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; },
};
window.__PLAYTEST__ = {
  get ready() { return S.ready; },
  snapshot: probe,
  reset() { build(); },
  setSeed(n) { S.seed = (n >>> 0) || 1; build(); },
};

async function start() {
  setVH();
  try { await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 800))]); } catch { /* fonts API missing */ }
  build();
  S.ready = true;
  if (VIEW === 'burst') requestAnimationFrame(() => window.__suisui.tap(0, 0.4, 0.45));
  if (VIEW === 'note') openNote('又要开会');
}
start();
