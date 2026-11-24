// 碎碎平安 · the page: shelf layout, tap / hold / swipe, refills, words, shake, smash-all, typed worries,
// and the shared room (everyone on one shelf, queues per slot, the 候贴区, folded notes).
// Rules and numbers live in core.js (SPEC.md); the particle engine is vendor/dissolve-atlas.js; the room protocol in
// server/room.mjs. Single-player is the default and the fallback: no room, no problem.
// ?v= on every script: GitHub Pages caches for ten minutes, and a new page with an old module breaks. Bump it on each release.
import { play, snapshot, cancelAll } from '../vendor/dissolve-atlas.js';
import { draw, loadArt } from './draw.js?v=4';
import { Sound } from './sound.js?v=4';
import { connect, NAMES, COLORS, DEFAULT_URL, myNotes } from './room.js?v=5';

const C = window.SuiCore, G = C.G, K = C.KINDS;
const $ = (s) => document.querySelector(s);
const q = new URLSearchParams(location.search);
const VIEW = q.get('view') || '';
const ROOM_URL = q.get('solo') === '1' ? null : q.get('room') || (VIEW ? null : DEFAULT_URL);
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
  mode: 'solo', room: null, me: null, people: new Map(), live: new Set(), conn: 'off', online: 0, wait: 0, mine: null, cdUntil: 0, pendingNote: '', deferred: null,
};
const sound = new Sound();
sound.muted = store.get('suisui.muted', '0') === '1';

const shelf = $('#shelf'), stage = $('#stage'), countEl = $('#count'), hint = $('#hint'), roomline = $('#roomline'), toastEl = $('#toast'), waitbar = $('#waitbar');
countEl.textContent = S.count;
const inRoom = () => S.mode === 'room';

/* ---------- layout and items ---------- */

function setVH() { document.documentElement.style.setProperty('--vh', innerHeight + 'px'); }
const layoutNow = () => (inRoom() ? C.roomLayout(innerWidth, innerHeight) : C.layout(innerWidth, innerHeight));

// Build the shelf. `from` is either a list of {kind, text} to keep (resize, leaving the room) or the room's slot views.
function build(from, roomSlots) {
  cancelAll();
  for (const h of S.charging) h.hum.stop();
  S.charging.clear(); S.active = 0; S.gen++;
  const L = layoutNow(); S.L = L;
  document.documentElement.style.setProperty('--shelf-w', L.shelfW + 'px');
  document.body.classList.toggle('room', inRoom());
  shelf.style.gridTemplateColumns = `repeat(${L.cols}, ${L.cell}px)`;
  shelf.style.gridAutoRows = L.cell + 'px';
  const init = C.createShelf(S.seed, L.count, L.cols); S.r = init.r;
  shelf.replaceChildren(); S.slots = [];
  fingers.clear();
  for (let i = 0; i < L.count; i++) {
    const el = document.createElement('div');
    el.className = 'slot'; el.tabIndex = 0; el.setAttribute('role', 'button');
    el.innerHTML = '<div class="lamp"></div><div class="shade"></div><div class="charge" aria-hidden="true"><i></i></div><div class="tag" aria-hidden="true"></div><div class="owner" aria-hidden="true"></div>';
    const slot = { i, el, kind: null, text: '', folded: false, note: null, cv: null, busy: false, gen: S.gen,
      v: 0, st: 'idle', by: null, qq: [], h: 0, until: 0, mineBreak: false, owner: null };
    S.slots.push(slot); shelf.appendChild(el);
    if (roomSlots) { const rs = roomSlots[i]; putRoom(slot, rs); applyState(slot, rs); }
    else { const kept = from && from[i]; put(slot, kept ? kept.kind : init.kinds[i], kept ? kept.text : init.notes[i], false, kept && kept.mine ? { who: 'me' } : null); }
    bind(slot);
  }
  paintRoom();
}

function pickNote() { return C.pickNote(S.r, S.slots.map((s) => s.text)); }

function put(slot, kind, text, folded = false, owner = null) {
  slot.kind = kind; slot.folded = kind === 'note' && folded; slot.owner = kind === 'note' ? owner : null;
  slot.text = kind === 'note' && !slot.folded ? (text || pickNote()) : '';
  const s = S.L.item;
  const cv = snapshot(s, s, (ctx) => draw(kind, ctx, s, s, slot.text, slot.folded, slot.i + 1));
  cv.style.width = s + 'px'; cv.style.height = s + 'px';
  slot.el.querySelector('.shade').style.width = Math.round(s * 0.78) + 'px';
  if (slot.cv) slot.cv.replaceWith(cv); else slot.el.appendChild(cv);
  slot.cv = cv;
  const who = slot.folded ? '：一张折起来的烦心事' : slot.text ? '：' + slot.text : '';
  slot.el.setAttribute('aria-label', `砸碎${K[kind].name}${who}`);
}

// The words on a room note: a system worry by its index, my own from this browser, anyone else's stays folded.
function putRoom(slot, rs) {
  slot.note = rs.n || null;
  if (rs.k !== 'note' || !rs.n) return put(slot, rs.k, '');
  if (rs.n.s != null) return put(slot, 'note', C.NOTES[rs.n.s] || '烦', false, { who: 'shared' });
  const isMine = S.me && rs.n.o === S.me.pid;
  const mine = isMine && myNotes.get(rs.n.id);
  if (mine) return put(slot, 'note', mine, false, { who: 'me' });
  return put(slot, 'note', '', true, { who: isMine ? 'me' : 'other', pid: rs.n.o });
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

/* ---------- breaking (local execution, shared by both modes) ---------- */

// One break. gesture: tap | swipe | hold. remote = someone else's break replayed here.
// Returns the engine handle and the item box, or null when the slot is busy.
function smash(slot, gesture, pt, { vel, extra, quiet, remote, torn } = {}) {
  if (slot.busy || slot.gen !== S.gen) return null;
  slot.busy = true;
  const r = lift(slot);
  if (!(r.width > 0)) { slot.busy = false; showItem(slot); return null; }
  const local = { x: pt.x - r.left, y: pt.y - r.top };
  const opts = { ...C.plan(slot.kind, gesture, local, { w: r.width, h: r.height }, vel), ...extra };
  if (remote && gesture === 'hold') opts.hold = false;   // a remote charge just bursts
  S.active++;
  const h = play({ source: slot.cv, x: r.left, y: r.top, w: r.width, h: r.height, ...opts });
  if (gesture !== 'hold' || remote) feedback(slot, gesture, pt, r, quiet ? 0.45 : remote ? 0.6 : 1, quiet, remote, torn);
  const gen = slot.gen;
  h.done.then(() => {
    if (gen !== S.gen) return;
    S.active--;
    if (inRoom()) slot.busy = false;                    // in the room only the server refills (plan 8.2)
    else refill(slot);
  });
  return { h, r };
}

function feedback(slot, gesture, pt, r, level, quiet, remote, torn) {
  const k = K[slot.kind];
  if (!quiet || S.smashes % 2 === 0) sound.play(k.sound, level * (gesture === 'hold' ? 1.3 : 1));
  if (gesture === 'swipe') sound.play('whoosh', 0.6 * level);
  if (!remote) vibrate(gesture === 'hold' ? [35, 25, 45] : quiet ? 0 : 16);
  shake(k.shake * (gesture === 'hold' ? 1.7 : gesture === 'swipe' ? 0.8 : 1) * (quiet ? 0.35 : remote ? 0.4 : 1));
  if (!quiet) {
    const at = gesture === 'tap' ? pt : { x: r.left + r.width / 2, y: r.top + r.height * 0.3 };
    const words = torn ? '替人烧掉了' : gesture === 'hold' ? '炸了！' : C.words(slot.kind, S.r);
    floatWords(words, at.x, at.y, gesture === 'hold' ? 34 : remote ? 22 : 26);
  }
  if (remote) return;
  S.smashes++; S.count++;
  countEl.textContent = S.count;
  store.set('suisui.count', String(S.count));
  hint.classList.add('gone');
}

// Single-player only: after a break the slot gets a new thing that falls or gathers in.
function refill(slot) {
  const gen = slot.gen;
  setTimeout(() => {
    if (gen !== S.gen || inRoom()) return;
    const kinds = S.slots.map((s) => (s === slot ? null : s.kind));
    put(slot, C.pickKind(S.r, C.avoidFor(kinds, slot.i, S.L.cols)), '');
    enter(slot, S.r() < 0.5 ? 'gather' : 'rain');
  }, 320 + S.r() * 380);
}

function enter(slot, preset) {
  const gen = slot.gen;
  slot.busy = true;
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
  const hold = { slot, h: got.h, r: got.r, pt: { x: st.x0, y: st.y0 }, t0: performance.now(), hum: sound.charge(), released: false, c: 0, renew: 0 };
  st.hold = hold; S.charging.add(hold);
  slot.el.classList.add('charging');
  vibrate(12);
  if (inRoom()) { slot.mineBreak = true; hold.renew = setInterval(() => roomSend({ t: 'c', i: slot.i, h: 1 }), 800); }
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
  hold.released = true; S.charging.delete(hold); clearInterval(hold.renew);
  hold.hum.stop(); hold.h.release();
  hold.slot.el.classList.remove('charging'); hold.slot.el.style.removeProperty('--c');
  const torn = inRoom() && othersNote(hold.slot);
  feedback(hold.slot, 'hold', hold.pt, hold.r, 0.7 + hold.c * 0.6, false, false, torn);
  if (inRoom()) sendSmash(hold.slot, 'hold', hold.pt, hold.r);
}
function releaseAll() { for (const h of [...S.charging]) burst(h); }

/* ---------- intents: what the visitor did, executed here (solo) or through the room ---------- */

const othersNote = (slot) => !!(slot.note && slot.note.s == null && slot.note.o !== S.me?.pid);
// Can I break this slot right now? Single-player: when it is not animating. Room: when it is free or my turn.
function canAct(slot) {
  if (slot.busy) return false;
  if (!inRoom()) return true;
  return (slot.st === 'idle' && !slot.qq.length) || (slot.st === 'held' && slot.by === S.me.pid);
}

function doTap(slot, pt) {
  if (!inRoom()) return smash(slot, 'tap', pt);
  if (!canAct(slot)) return null;
  const torn = othersNote(slot);
  slot.mineBreak = true;
  const got = smash(slot, 'tap', pt, { torn });
  if (got) sendSmash(slot, 'tap', pt, got.r);
  return got;
}
function doSwipe(slot, pt, vel) {
  if (!inRoom()) return smash(slot, 'swipe', pt, { vel });
  if (!canAct(slot)) return null;
  slot.mineBreak = true;
  const got = smash(slot, 'swipe', pt, { vel, torn: othersNote(slot) });
  if (got) sendSmash(slot, 'swipe', pt, got.r, vel);
  return got;
}
function sendSmash(slot, g, pt, r, vel = { x: 0, y: 0 }) {
  const clamp = (v) => Math.max(0, Math.min(1, v));
  roomSend({ t: 's', i: slot.i, g, ox: +clamp((pt.x - r.left) / r.width).toFixed(3), oy: +clamp((pt.y - r.top) / r.height).toFixed(3),
    vx: Math.round(Math.max(-5000, Math.min(5000, vel.x || 0))), vy: Math.round(Math.max(-5000, Math.min(5000, vel.y || 0))) });
}

/* ---------- input ---------- */

function velocity(pts) {
  const last = pts[pts.length - 1];
  let first = pts[0];
  for (const p of pts) if (last[2] - p[2] <= G.flingWindow) { first = p; break; }
  const dt = (last[2] - first[2]) / 1000;
  return dt > 0.004 ? { x: (last[0] - first[0]) / dt, y: (last[1] - first[1]) / dt } : { x: last[0] - pts[0][0], y: last[1] - pts[0][1] };
}

// My finger, as slot + position inside the slot (phones and desktops lay the shelf out differently), 15 times a second at most.
let lastFinger = 0;
function sendFinger(slot, e, down, force) {
  if (!inRoom()) return;
  const t = performance.now();
  if (!force && t - lastFinger < 67) return;
  lastFinger = t;
  const r = slot.el.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
  roomSend({ t: 'p', i: slot.i, x: +x.toFixed(3), y: +y.toFixed(3), d: down ? 1 : 0 });
}

function bind(slot) {
  const el = slot.el;
  let st = null;
  el.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    sound.unlock(); e.preventDefault();
    if (inRoom()) { roomSend({ t: 'c', i: slot.i }); sendFinger(slot, e, true, true); }
    if (!canAct(slot)) { if (inRoom()) st = { id: e.pointerId, queued: true }; return; }   // the room queues me; nothing to break yet
    try { el.setPointerCapture(e.pointerId); } catch { /* old browsers */ }
    const now = performance.now();
    st = { id: e.pointerId, t0: now, x0: e.clientX, y0: e.clientY, pts: [[e.clientX, e.clientY, now]], moved: 0, hold: null };
    const mine = st;
    st.timer = setTimeout(() => { if (st === mine && mine.moved < G.moveTol) startCharge(slot, mine); }, G.tapMs);
  });
  el.addEventListener('pointermove', (e) => {
    if (!st || e.pointerId !== st.id || st.queued) return;
    const now = performance.now();
    st.pts.push([e.clientX, e.clientY, now]);
    while (st.pts.length > 2 && now - st.pts[0][2] > 160) st.pts.shift();
    st.moved = Math.max(st.moved, Math.hypot(e.clientX - st.x0, e.clientY - st.y0));
    sendFinger(slot, e, true);
  });
  const end = (e, cancelled) => {
    if (!st || e.pointerId !== st.id) return;
    const s = st; st = null;
    if (inRoom()) sendFinger(slot, e, false, true);
    if (s.queued) return;
    clearTimeout(s.timer);
    if (s.hold) { burst(s.hold); return; }
    if (cancelled) { if (inRoom()) roomSend({ t: 'u', i: slot.i }); return; }
    const g = C.classify(performance.now() - s.t0, s.moved);
    if (g === 'swipe') doSwipe(slot, { x: e.clientX, y: e.clientY }, velocity(s.pts));
    else doTap(slot, { x: e.clientX, y: e.clientY });
  };
  el.addEventListener('pointerup', (e) => end(e, false));
  el.addEventListener('pointercancel', (e) => end(e, true));
  el.addEventListener('lostpointercapture', (e) => end(e, true));
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault(); sound.unlock();
    const r = slot.cv.getBoundingClientRect();
    if (inRoom() && canAct(slot)) roomSend({ t: 'c', i: slot.i });
    else if (inRoom()) { roomSend({ t: 'c', i: slot.i }); return; }
    doTap(slot, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
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

let toastT = 0;
function toast(text) {
  toastEl.textContent = text; toastEl.hidden = false; toastEl.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => { toastEl.classList.remove('on'); setTimeout(() => { toastEl.hidden = true; }, 300); }, 3200);
}

/* ---------- smash all, worries, sound switch ---------- */

function playWave(list) {
  // list: [[slot, kind, version, delay]] from the room, or local targets in single-player
  const g = C.cascadeGrain(list.map(([s]) => s.kind), S.L.item);
  const sr = shelf.getBoundingClientRect();
  floatWords('碎碎平安', sr.left + sr.width / 2, sr.top + sr.height * 0.45, Math.min(72, sr.width / 5.5), 2.2);
  shake(0.5);
  for (const [s, , , delay] of list) setTimeout(() => {
    if (s.gen !== S.gen) return;
    const r = s.cv.getBoundingClientRect(), k = K[s.kind];
    smash(s, 'tap', { x: r.left + r.width * (0.35 + S.r() * 0.3), y: r.top + r.height * 0.45 }, { quiet: true, extra: k.fx === 'shatter' ? {} : { grain: Math.max(g, k.opts.grain || 0) } });
  }, delay);
}

function smashAll() {
  sound.unlock();
  if (inRoom()) {
    if (S.cdUntil > Date.now()) return;
    roomSend({ t: 'a' });
    return;
  }
  if (S.allBusy) return;
  const targets = S.slots.filter((s) => !s.busy);
  if (!targets.length) return;
  S.allBusy = true; $('#all').disabled = true;
  const cols = S.L.cols;
  targets.sort((a, b) => ((a.i % cols) + Math.floor(a.i / cols)) - ((b.i % cols) + Math.floor(b.i / cols)) || a.i - b.i);
  playWave(targets.map((s, n) => [s, s.kind, 0, n * 70]));
  setTimeout(() => { S.allBusy = false; $('#all').disabled = false; }, targets.length * 70 + 1200);
}

const dlg = $('#dlg'), noteText = $('#noteText');
function openNote(prefill = '') {
  noteText.value = prefill;
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  setTimeout(() => noteText.focus(), 30);
}
function pasteNote(text) {
  if (inRoom()) { S.pendingNote = text; roomSend({ t: 'n' }); return true; }   // the words stay here; the room hands back an id
  const free = S.slots.filter((s) => !s.busy);
  if (!free.length) return false;
  const pool = free.filter((s) => s.kind !== 'note');
  const slot = (pool.length ? pool : free)[Math.floor(S.r() * (pool.length ? pool : free).length)];
  lift(slot);
  put(slot, 'note', text, false, { who: 'me' });
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

/* ---------- the room ---------- */

const nameOf = (pid) => { const p = S.people.get(pid); return p ? '访客 ' + NAMES[p[0]] : '访客'; };
const shortName = (pid) => { const p = S.people.get(pid); return p ? NAMES[p[0]] : '?'; };
const colorOf = (pid) => { const p = S.people.get(pid); return p ? COLORS[p[1]] : '#ccc'; };
function roomSend(m) { return S.room ? S.room.send(m) : false; }

// Server state of one slot: who has it, who waits, how long is left. Never touches what is drawn in it.
function applyState(slot, rs) {
  if (rs.v < slot.v) return false;
  slot.v = rs.v; slot.st = rs.st; slot.by = rs.by; slot.qq = rs.q || []; slot.h = rs.h || 0;
  slot.until = performance.now() + (rs.ms || 0);
  paintSlot(slot);
  return true;
}

function paintSlot(slot) {
  const el = slot.el, tag = el.querySelector('.tag');
  const held = inRoom() && slot.st === 'held' && slot.by != null;
  const mineTurn = held && slot.by === S.me?.pid;
  el.classList.toggle('held', held);
  el.classList.toggle('mine', mineTurn);
  el.classList.toggle('remote-charge', held && !mineTurn && !!slot.h);
  if (held) el.style.setProperty('--who', colorOf(slot.by)); else el.style.removeProperty('--who');
  const me = S.me && slot.qq.indexOf(S.me.pid);
  let text = '';
  if (!inRoom()) text = '';
  else if (me >= 0) text = `你第 ${me + 2} 位`;
  else if (mineTurn) text = '轮到你了';
  else if (held) text = nameOf(slot.by) + (slot.qq.length ? ` · ${slot.qq.length} 人在等` : '');
  else if (slot.qq.length) text = `${slot.qq.length} 人在等`;
  tag.textContent = text; tag.classList.toggle('on', !!text); tag.classList.toggle('me', me >= 0 || mineTurn);
  // whose worry is this: mine, someone's (by name), or one of the shelf's own
  const own = el.querySelector('.owner'), o = slot.kind === 'note' ? slot.owner : null;
  const tearable = inRoom() && !!S.mine && othersNote(slot);   // I have one waiting: tapping someone's swaps mine in
  own.className = 'owner' + (o ? ' on ' + o.who : '') + (tearable ? ' tear' : '');
  own.textContent = !o ? '' : o.who === 'me' ? '我写的' : o.who === 'shared' ? (inRoom() ? '大家的' : '') : tearable ? `${shortName(o.pid)} 的 · 可撕` : `${shortName(o.pid)} 写的`;
  if (o && o.who === 'other') own.style.setProperty('--who', colorOf(o.pid)); else own.style.removeProperty('--who');
  if (!own.textContent) own.className = 'owner';
}

// The line under the title always says whether you are in the shared room, and who is there.
const CONN_TEXT = {
  off: '单人模式：只有你自己的架子',
  connecting: '正在连房间……',
  down: '没连上房间，现在是你一个人的架子（会自动重试）',
  full: '房间满了，现在是你一个人的架子',
};
function chip(text, color, me) {
  const b = document.createElement('span'); b.className = 'who' + (me ? ' me' : '');
  const i = document.createElement('i'); i.style.background = color; b.append(i, document.createTextNode(text)); return b;
}
function paintStatus() {
  roomline.replaceChildren();
  roomline.className = 'roomline ' + (inRoom() ? 'up' : S.conn);
  if (!inRoom()) { roomline.textContent = CONN_TEXT[S.conn] || CONN_TEXT.off; return; }
  const lead = document.createElement('b'); lead.textContent = S.live.size > 1 ? `房间里 ${S.live.size} 人：` : '房间里只有你：';
  roomline.append(lead, chip('你·' + shortName(S.me.pid), colorOf(S.me.pid), true));
  const others = [...S.live].filter((p) => p !== S.me.pid);
  others.slice(0, 5).forEach((p) => roomline.append(chip(shortName(p), colorOf(p))));
  if (others.length > 5) roomline.append(document.createTextNode(` 等 ${others.length} 人`));
}
// The 候贴区 by the door: one folded slip per waiting worry, mine in gold.
function paintWaitbar() {
  waitbar.replaceChildren();
  if (!inRoom()) return;
  const label = document.createElement('b'); label.textContent = '候贴区';
  waitbar.append(label);
  if (!S.wait) { const e = document.createElement('span'); e.className = 'empty'; e.textContent = '空着 · 架上便签满三张后，新写的在这里排队'; waitbar.append(e); return; }
  const n = Math.min(S.wait, 8);
  for (let k = 0; k < n; k++) {
    const slip = document.createElement('span');
    const mine = S.mine && S.mine.pos - 1 === k;
    slip.className = 'slip' + (mine ? ' mine' : ''); slip.textContent = mine ? '我的' : '';
    waitbar.append(slip);
  }
  if (S.wait > n) waitbar.append(document.createTextNode(` +${S.wait - n}`));
  const tip = document.createElement('span'); tip.className = 'tip';
  tip.textContent = S.mine ? '轮到你就自动贴上；也可以撕一张别人的换上' : `${S.wait} 张在等`;
  waitbar.append(tip);
}
function paintRoom() {
  document.body.classList.toggle('room', inRoom());
  paintStatus(); paintWaitbar();
  if (!inRoom()) { $('#all').textContent = '全砸了'; $('#all').disabled = false; for (const s of S.slots) paintSlot(s); return; }
  const left = Math.ceil((S.cdUntil - Date.now()) / 1000);
  const all = $('#all');
  all.textContent = left > 0 ? `全砸了 · ${left}s` : '全砸了';
  all.disabled = left > 0;
  for (const s of S.slots) paintSlot(s);
}
setInterval(() => { if (inRoom()) paintRoom(); }, 1000);

// Other people's fingers: a coloured dot with a name, placed by slot and position inside the slot.
const fingers = new Map();
const fingerLayer = document.createElement('div'); fingerLayer.className = 'fingers'; fingerLayer.setAttribute('aria-hidden', 'true');
$('#stage').appendChild(fingerLayer);
function showFinger(pid, i, x, y, d) {
  if (pid === S.me?.pid) return;
  const slot = S.slots[i]; if (!slot) return;
  let f = fingers.get(pid);
  if (!f) { f = document.createElement('div'); f.className = 'finger'; f.innerHTML = '<i></i><b></b>'; fingerLayer.appendChild(f); fingers.set(pid, f); }
  f.querySelector('b').textContent = nameOf(pid);
  f.style.setProperty('--who', colorOf(pid));
  const sr = stage.getBoundingClientRect(), r = slot.el.getBoundingClientRect();
  f.style.transform = `translate(${(r.left - sr.left + x * r.width).toFixed(1)}px,${(r.top - sr.top + y * r.height).toFixed(1)}px)`;
  f.classList.toggle('down', !!d);
  clearTimeout(f.bye); f.bye = setTimeout(() => f.classList.remove('down'), d ? 3000 : 600);
}
fingers.clear = function () { for (const f of this.values()) f.remove(); Map.prototype.clear.call(this); };

function enterRoom(w) {
  S.me = w.you; S.mode = 'room';
  for (const [pid, n, c] of w.people) S.people.set(pid, [n, c]);
  S.live = new Set(w.people.map(([pid]) => pid));
  S.online = w.online; S.wait = w.wait; S.mine = w.mine; S.cdUntil = Date.now() + (w.cd || 0);
  build(null, w.slots);   // the how-to hint stays until the first smash, same as single-player
  toast('进了房间：大家砸的是同一面架子');
}
function leaveRoom() {
  if (!inRoom()) return;
  const keep = S.slots.map((s) => ({ kind: s.kind, text: s.folded ? '' : s.text, mine: s.owner && s.owner.who === 'me' && !s.folded }));
  S.mode = 'solo'; S.mine = null; S.live = new Set();
  build(keep);
  toast('连不上房间，先自己砸着');
}

function onRoom(m) {
  const slot = Number.isInteger(m.i) ? S.slots[m.i] : null;
  switch (m.t) {
    case 'O':
      S.online = m.online;
      for (const [pid, n, c] of m.people || []) { S.people.set(pid, [n, c]); S.live.add(pid); }
      if (m.gone) { S.live.delete(m.gone); const f = fingers.get(m.gone); if (f) { f.remove(); fingers.delete(m.gone); } }
      break;
    case 'C': if (slot) applyState(slot, m); break;
    case 'S': {
      if (!slot || m.v <= slot.v) break;
      const mineAlready = m.by === S.me.pid && slot.mineBreak;
      slot.mineBreak = false;
      applyState(slot, { ...m, st: 'broken', by: null, q: slot.qq, ms: 0 });
      if (mineAlready || slot.cv.style.opacity === '0') break;
      const r = slot.cv.getBoundingClientRect();
      const pt = { x: r.left + m.ox * r.width, y: r.top + m.oy * r.height };
      slot.busy = false;
      smash(slot, m.g, pt, { vel: { x: m.vx, y: m.vy }, remote: true, torn: m.torn && m.by === S.me.pid });
      break;
    }
    case 'R':
      if (!slot || m.v <= slot.v) break;
      putRoom(slot, m); applyState(slot, m); enter(slot, m.e || 'gather');
      if (S.mine && m.n && m.n.id === S.mine.id) S.mine = null;      // my waiting note made it onto the shelf
      if (m.n && m.n.o === S.me.pid && m.e === 'print') { const r = slot.cv.getBoundingClientRect(); setTimeout(() => floatWords('贴好了', r.left + r.width / 2, r.top, 20), 300); }
      break;
    case 'A': {
      const list = m.list.map(([i, k, v, delay]) => [S.slots[i], k, v, delay]).filter(([s, , v]) => s && v > s.v);
      list.forEach(([s, , v]) => { s.v = v; s.st = 'broken'; paintSlot(s); });
      playWave(list.filter(([s]) => s.cv.style.opacity !== '0'));
      break;
    }
    case 'K':
      if (m.n) {                                        // my worry got an id: keep the words here, under that id
        if (S.pendingNote) myNotes.set(m.n, S.pendingNote);
        S.pendingNote = '';
        if (m.wait) { S.mine = { id: m.n, pos: m.wait }; toast(`便签贴满了，你的排在候贴区第 ${m.wait} 张；也可以撕一张别人的换上`); }
      }
      if (m.cd) S.cdUntil = Date.now() + m.cd;
      if (m.q) toast(`有人在砸，你排第 ${m.q} 位`);
      break;
    case 'X':
      if (m.slot) {                                     // the room said no: go back to how this slot really is
        const sl = S.slots[m.slot.i];
        if (sl && sl.mineBreak) { sl.mineBreak = false; if (m.slot.st !== 'broken') { S.count = Math.max(0, S.count - 1); countEl.textContent = S.count; store.set('suisui.count', String(S.count)); } }
        if (sl && m.slot.v >= sl.v) {
          applyState(sl, m.slot);
          if (m.slot.st !== 'broken' && sl.cv.style.opacity === '0') { putRoom(sl, m.slot); showItem(sl); sl.busy = false; }
        }
      }
      if (m.why === 'cooldown') toast('全砸了要歇一会儿');
      if (m.why === 'already-waiting') toast('你已经有一张在候贴区了');
      if (m.why === 'too-soon') toast('慢一点，五秒后再贴');
      if (m.why === 'waitlist-full') toast('候贴区也满了，先砸点别的');
      if (m.why === 'queue-full') toast('这一格排满了，换一格吧');
      if (['already-waiting', 'too-soon', 'waitlist-full'].includes(m.why)) S.pendingNote = '';
      break;
    case 'T': {
      const text = myNotes.get(m.id);
      // the server sends this private line before the broadcast of the burn; wait a beat so the slip catches fire first
      setTimeout(() => toast(text ? `有人替你把「${text}」烧掉了` : '有人替你把一张烦心事烧掉了'), 400);
      if (S.mine && S.mine.id === m.id) S.mine = null;
      break;
    }
    case 'Q':
      S.wait = m.wait;
      if (S.mine) S.mine.pos = Math.min(S.mine.pos, Math.max(1, m.wait));   // only ever moves forward
      break;
    case 'P': for (const [pid, i, x, y, d] of m.list) showFinger(pid, i, x, y, d); break;
    case 'F': toast('房间满了，先自己砸着'); break;
  }
  paintRoom();
}

function startRoom() {
  if (!ROOM_URL || typeof WebSocket !== 'function') { S.conn = 'off'; paintRoom(); return; }
  S.conn = 'connecting'; paintRoom();
  S.room = connect(ROOM_URL, {
    onUp: (w) => {
      // switch when nothing of mine is mid-flight; otherwise wait for the current break to finish
      S.conn = 'up';
      const go = () => (S.charging.size ? setTimeout(go, 300) : enterRoom(w));
      go();
    },
    onMessage: (m) => { if (m.t === 'F') S.conn = 'full'; if (inRoom()) onRoom(m); else if (m.t === 'F') onRoom(m); paintRoom(); },
    onDown: (wasUp) => { if (S.conn !== 'full') S.conn = 'down'; if (wasUp) leaveRoom(); paintRoom(); },
  });
}

/* ---------- resize, hooks, start ---------- */

let rt = 0;
function onResize() {
  clearTimeout(rt);
  rt = setTimeout(() => {
    setVH();
    const L = layoutNow();
    if (L.cols === S.L.cols && L.rows === S.L.rows && L.cell === S.L.cell) return;
    if (inRoom()) {
      const views = S.slots.map((s) => ({ i: s.i, k: s.kind, v: s.v, st: s.st, by: s.by, q: s.qq, h: s.h, ms: Math.max(0, s.until - performance.now()), n: s.note }));
      build(null, views);
    } else build(S.slots.map((s) => ({ kind: s.kind, text: s.text, mine: s.owner && s.owner.who === 'me' })));
  }, 200);
}
addEventListener('resize', onResize);
window.visualViewport?.addEventListener('resize', onResize);

function probe() {
  return {
    ready: S.ready, view: VIEW, seed: S.seed, cols: S.L.cols, rows: S.L.rows, item: S.L.item,
    count: S.count, smashes: S.smashes, active: S.active, charging: S.charging.size,
    floats: document.querySelectorAll('.float').length,
    mode: S.mode, me: S.me && S.me.pid, online: S.online, wait: S.wait, mine: S.mine, cd: Math.max(0, S.cdUntil - Date.now()),
    toast: toastEl.hidden ? '' : toastEl.textContent, conn: S.conn, status: roomline.textContent, waitbar: waitbar.textContent,
    slots: S.slots.map((s) => ({ kind: s.kind, text: s.text, folded: s.folded, busy: s.busy, shown: s.cv.style.opacity !== '0',
      st: s.st, by: s.by, q: s.qq.slice(), v: s.v, tag: s.el.querySelector('.tag').textContent, owner: s.el.querySelector('.owner').textContent, note: s.note && { id: s.note.id, o: s.note.o } })),
  };
}
window.__suisui = {
  get ready() { return S.ready; }, probe, smashAll, openNote, pasteNote,
  // tap a slot at a point given as a fraction of the item box (tests and fixed views)
  tap(i, fx = 0.5, fy = 0.5) { const s = S.slots[i], r = s.cv.getBoundingClientRect(); return !!smash(s, 'tap', { x: r.left + r.width * fx, y: r.top + r.height * fy }); },
  // put a given kind into a slot (fixed views and per-effect checks); single-player only, ignored while busy
  setKind(i, kind, text = '') { const s = S.slots[i]; if (inRoom() || !s || s.busy || !K[kind]) return false; put(s, kind, text); return true; },
  rect(i) { const r = S.slots[i].cv.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; },
  slotRect(i) { const r = S.slots[i].el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; },
  // send the claim a press sends, nothing else (room check: someone is holding this slot)
  claim(i) { return inRoom() && roomSend({ t: 'c', i }); },
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
  await loadArt(C.SPRITES);
  build();
  S.ready = true;
  if (VIEW === 'burst') requestAnimationFrame(() => window.__suisui.tap(0, 0.4, 0.45));
  if (VIEW === 'note') openNote('又要开会');
  startRoom();
}
start();
