// 碎碎平安 room · the shared shelf as a pure state machine. No sockets, no timers, no disk:
// the server feeds it messages and clock ticks and sends out whatever it returns.
// Rules: README of the multiplayer batch (sections 1–8) and plan.md section 8 (review decisions).
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
const C = createRequire(import.meta.url)('../src/core.js');
const K = C.KINDS;

export const SLOTS = 12, COLS = 4;                 // fixed shelf: phones lay it out 3 x 4, desktops 4 x 3
export const T = {
  hold: 2500, holdMax: 6000, turn: 5000, enter: 1500, margin: 300, gap: 70,
  allCooldown: 30000, noteEvery: 5000, keep: 600000,
};
export const LIMITS = { queue: 5, waitlist: 20, names: 64, colors: 12 };

// How long the engine shows a break, so the server never refills a slot that is still flying apart on screen.
export function breakMs(kind, g) {
  if (g === 'hold') return 900;
  if (g === 'swipe') return 1500;
  const k = K[kind];
  return k.opts.duration ?? (k.fx === 'melt' ? 1800 : 1500);
}

const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const only = (m, keys) => Object.keys(m).every((k) => keys.includes(k));

// Parse one client message. Returns a clean object or null. Unknown fields, wrong types, strings anywhere but `t`: null.
export function parse(text) {
  if (typeof text !== 'string' || text.length > 512) return null;
  let m; try { m = JSON.parse(text); } catch { return null; }
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  switch (m.t) {
    case 'hi': return only(m, ['t', 'n', 'c', 'tok']) && int(m.n, 0, LIMITS.names - 1) && int(m.c, 0, LIMITS.colors - 1)
      && (m.tok === undefined || (typeof m.tok === 'string' && /^[0-9a-f]{32}$/.test(m.tok))) ? m : null;
    case 'p': return only(m, ['t', 'i', 'x', 'y', 'd']) && int(m.i, 0, SLOTS - 1) && num(m.x, 0, 1) && num(m.y, 0, 1) && int(m.d, 0, 1) ? m : null;
    case 'c': return only(m, ['t', 'i', 'h']) && int(m.i, 0, SLOTS - 1) && (m.h === undefined || int(m.h, 0, 1)) ? m : null;
    case 'u': return only(m, ['t', 'i']) && int(m.i, 0, SLOTS - 1) ? m : null;
    case 's': return only(m, ['t', 'i', 'g', 'ox', 'oy', 'vx', 'vy']) && int(m.i, 0, SLOTS - 1) && ['tap', 'hold', 'swipe'].includes(m.g)
      && num(m.ox, 0, 1) && num(m.oy, 0, 1) && num(m.vx ?? 0, -5000, 5000) && num(m.vy ?? 0, -5000, 5000) ? m : null;
    case 'n': return only(m, ['t']) ? m : null;
    case 'a': return only(m, ['t']) ? m : null;
    default: return null;
  }
}

export function createRoom({ now = Date.now, seed = 1, token = () => randomBytes(16).toString('hex'), noteId = () => randomBytes(4).toString('hex') } = {}) {
  const shelf = C.createShelf(seed, SLOTS, COLS);
  const R = {
    now, token, noteId, r: shelf.r, pidNext: 1,
    sessions: new Map(),        // token -> session
    byPid: new Map(),           // public id -> session
    waitlist: [],               // [{id, owner(token)}], oldest first
    pointers: new Map(),        // pid -> [i, x, y, d]; flushed in batches
    slots: shelf.kinds.map((kind, i) => ({
      i, kind, v: 1, st: 'idle', by: null, until: 0, since: 0, q: [], h: 0,
      note: kind === 'note' ? { id: null, owner: null, sys: Math.max(0, C.NOTES.indexOf(shelf.notes[i])) } : null,
      reserve: null,            // a note that must go here next (a torn slip's replacement, or the waitlist head)
    })),
  };
  return R;
}

/* ---------- views ---------- */

const pidOf = (R, tok) => (tok && R.sessions.get(tok)?.pid) || null;
function noteView(R, n) { return n ? { id: n.id, o: pidOf(R, n.owner), s: n.sys } : null; }
export function slotView(R, s) {
  return { i: s.i, k: s.kind, v: s.v, st: s.st, by: pidOf(R, s.by), q: s.q.map((t) => pidOf(R, t)), h: s.h,
    ms: Math.max(0, s.until - R.now()), n: noteView(R, s.note) };
}
const online = (R) => [...R.sessions.values()].filter((s) => s.live).length;
function snapshot(R, me) {
  const mine = R.waitlist.findIndex((w) => w.owner === me.tok);
  return { t: 'W', you: { pid: me.pid, n: me.n, c: me.c, tok: me.tok }, slots: R.slots.map((s) => slotView(R, s)),
    wait: R.waitlist.length, mine: mine >= 0 ? { id: R.waitlist[mine].id, pos: mine + 1 } : null,
    online: online(R), cd: Math.max(0, me.cd - R.now()),
    people: [...R.sessions.values()].filter((s) => s.live).map((s) => [s.pid, s.n, s.c]) };
}

/* ---------- helpers that change slots ---------- */

const out = () => ({ to: [], all: [] });          // to: [[token, msg]], all: [msg]
const C_ = (R, s) => ({ t: 'C', ...slotView(R, s) });
function bump(s) { s.v++; }
function leaveQueues(R, tok, except, o) {
  for (const s of R.slots) {
    if (s.i === except) continue;
    const at = s.q.indexOf(tok);
    if (at >= 0) { s.q.splice(at, 1); bump(s); o.all.push(C_(R, s)); }
  }
}
// Give a free slot to the head of its queue (with a full turn), or leave it idle.
function handOn(R, s, o) {
  const t = R.now();
  while (s.q.length && !R.sessions.get(s.q[0])?.live) s.q.shift();
  if (s.q.length) { s.st = 'held'; s.by = s.q.shift(); s.since = t; s.until = t + T.turn; s.h = 0; }
  else { s.st = 'idle'; s.by = null; s.until = 0; s.h = 0; }
  bump(s); o.all.push(C_(R, s));
}
function heldBy(R, tok) { return R.slots.find((s) => s.st === 'held' && s.by === tok); }

/* ---------- messages ---------- */

export function join(R, msg) {
  const o = out();
  let me = msg.tok && R.sessions.get(msg.tok);
  if (me) { me.live = true; me.lost = 0; }
  else {
    const tok = R.token();
    // names must tell people apart: if someone here already has this one, take the next free name (and colour)
    const taken = new Set([...R.sessions.values()].filter((x) => x.live).map((x) => x.n));
    const usedC = new Set([...R.sessions.values()].filter((x) => x.live).map((x) => x.c));
    let n = msg.n; for (let k = 0; k < LIMITS.names && taken.has(n); k++) n = (n + 1) % LIMITS.names;
    let c = msg.c; if (taken.has(msg.n)) for (let k = 0; k < LIMITS.colors && usedC.has(c); k++) c = (c + 1) % LIMITS.colors;
    me = { tok, pid: R.pidNext++, n, c, live: true, lost: 0, cd: 0, lastNote: -Infinity };
    R.sessions.set(tok, me); R.byPid.set(me.pid, me);
  }
  o.to.push([me.tok, snapshot(R, me)]);
  o.all.push({ t: 'O', online: online(R), people: [[me.pid, me.n, me.c]] });
  return { me, o };
}

export function leave(R, tok) {
  const o = out(), me = R.sessions.get(tok);
  if (!me || !me.live) return o;
  me.live = false; me.lost = R.now();
  for (const s of R.slots) {
    if (s.st === 'held' && s.by === tok) handOn(R, s, o);
    const at = s.q.indexOf(tok); if (at >= 0) { s.q.splice(at, 1); bump(s); o.all.push(C_(R, s)); }
  }
  const w = R.waitlist.findIndex((x) => x.owner === tok);
  if (w >= 0) { R.waitlist.splice(w, 1); o.all.push({ t: 'Q', wait: R.waitlist.length }); }
  R.pointers.delete(me.pid);
  o.all.push({ t: 'O', online: online(R), gone: me.pid });
  return o;
}

const nack = (o, tok, why, R, s) => { o.to.push([tok, { t: 'X', why, ...(s ? { slot: slotView(R, s) } : {}) }]); return o; };
const ack = (o, tok, extra) => { o.to.push([tok, { t: 'K', ...extra }]); return o; };

export function handle(R, tok, m) {
  const o = out(), me = R.sessions.get(tok);
  if (!me || !me.live) return o;
  const t = R.now();
  if (m.t === 'p') { R.pointers.set(me.pid, [m.i, Math.round(m.x * 1000) / 1000, Math.round(m.y * 1000) / 1000, m.d]); return o; }

  if (m.t === 'c') {
    const s = R.slots[m.i];
    if (s.st === 'held' && s.by === tok) {            // still pressing: renew, but never past holdMax from the start of the turn
      s.until = Math.max(s.until, Math.min(t + T.hold, s.since + T.holdMax)); s.h = m.h ? 1 : 0; bump(s); o.all.push(C_(R, s));
      return ack(o, tok, { c: m.i, v: s.v, ms: s.until - t });
    }
    const other = heldBy(R, tok);
    if (other) handOn(R, other, o);                   // one slot per person: pressing another lets the first go
    leaveQueues(R, tok, m.i, o);
    if (s.st === 'idle' && !s.q.length) {
      s.st = 'held'; s.by = tok; s.since = t; s.until = t + T.hold; s.h = m.h ? 1 : 0; bump(s); o.all.push(C_(R, s));
      return ack(o, tok, { c: m.i, v: s.v, ms: T.hold });
    }
    let pos = s.q.indexOf(tok);
    if (pos < 0) { if (s.q.length >= LIMITS.queue) return nack(o, tok, 'queue-full', R, s); s.q.push(tok); pos = s.q.length - 1; bump(s); o.all.push(C_(R, s)); }
    return ack(o, tok, { c: m.i, v: s.v, q: pos + 2 });   // 第 2 位 = first in line behind whoever has it
  }

  if (m.t === 'u') {
    const s = R.slots[m.i];
    if (s.st === 'held' && s.by === tok) { handOn(R, s, o); return ack(o, tok, { u: m.i }); }
    const at = s.q.indexOf(tok);
    if (at >= 0) { s.q.splice(at, 1); bump(s); o.all.push(C_(R, s)); return ack(o, tok, { u: m.i }); }
    return nack(o, tok, 'not-yours', R, s);           // a late `u` after a timeout must not free the next person's turn
  }

  if (m.t === 's') {
    const s = R.slots[m.i];
    const mine = s.st === 'held' && s.by === tok;
    const free = s.st === 'idle' && !s.q.length;
    if (!mine && !free) return nack(o, tok, 'busy', R, s);
    const other = heldBy(R, tok); if (other && other !== s) handOn(R, other, o);
    leaveQueues(R, tok, m.i, o);
    smash(R, s, me, m, 0, o);
    return ack(o, tok, { s: m.i, v: s.v });
  }

  if (m.t === 'n') {
    if (t - me.lastNote < T.noteEvery) return nack(o, tok, 'too-soon');
    if (R.waitlist.some((w) => w.owner === tok)) return nack(o, tok, 'already-waiting');
    me.lastNote = t;
    const id = R.noteId();
    const notes = R.slots.filter((s) => s.kind === 'note').length;
    const spot = notes < C.MAX_NOTES ? R.slots.find((s) => s.st === 'idle' && !s.q.length && s.kind !== 'note') : null;
    if (spot) { place(R, spot, { id, owner: tok, sys: null }, o, 'print'); return ack(o, tok, { n: id, i: spot.i }); }
    if (R.waitlist.length >= LIMITS.waitlist) return nack(o, tok, 'waitlist-full');
    R.waitlist.push({ id, owner: tok });
    o.all.push({ t: 'Q', wait: R.waitlist.length });
    return ack(o, tok, { n: id, wait: R.waitlist.length });
  }

  if (m.t === 'a') {
    if (me.cd > t) return nack(o, tok, 'cooldown');
    const free = R.slots.filter((s) => s.st === 'idle' && !s.q.length);
    me.cd = t + T.allCooldown;
    // each entry: [slot, kind, version after the break, delay ms] so every page plays the same wave
    const list = free.map((s, k) => { const kind = s.kind; smash(R, s, me, { g: 'tap', ox: 0.5, oy: 0.45, vx: 0, vy: 0 }, k * T.gap, o, true); return [s.i, kind, s.v, k * T.gap]; });
    o.all.push({ t: 'A', by: me.pid, list });
    return ack(o, tok, { a: list.length, cd: T.allCooldown });
  }
  return o;
}

// Break a slot. Burning someone's note tells its owner; if the burner has a note waiting, it goes right here (撕便签).
function smash(R, s, me, m, delay, o, quiet = false) {
  const t = R.now();
  const note = s.note;
  s.st = 'broken'; s.by = null; s.h = 0;
  s.until = t + delay + breakMs(s.kind, m.g) + T.margin;
  bump(s);
  const torn = !!(note && note.owner && note.owner !== me.tok);
  if (!quiet) o.all.push({ t: 'S', i: s.i, k: s.kind, v: s.v, by: me.pid, g: m.g, ox: m.ox, oy: m.oy, vx: m.vx ?? 0, vy: m.vy ?? 0, torn, n: noteView(R, note) });
  if (torn && R.sessions.get(note.owner)?.live) o.to.push([note.owner, { t: 'T', id: note.id }]);
  if (note && s.kind === 'note') {
    const w = R.waitlist.findIndex((x) => x.owner === me.tok);
    if (w >= 0) s.reserve = R.waitlist.splice(w, 1)[0];
    else if (R.waitlist.length) s.reserve = R.waitlist.shift();
    if (s.reserve) o.all.push({ t: 'Q', wait: R.waitlist.length });
  }
  s.note = null;
}

function place(R, s, note, o, enter) {
  s.kind = 'note'; s.note = note; s.st = 'entering'; s.by = null; s.until = R.now() + T.enter; bump(s);
  o.all.push({ t: 'R', ...slotView(R, s), e: enter });
}

/* ---------- clock ---------- */

export function tick(R) {
  const o = out(), t = R.now();
  for (const s of R.slots) {
    if (s.until > t) continue;
    if (s.st === 'held') handOn(R, s, o);
    else if (s.st === 'broken') refill(R, s, o);
    else if (s.st === 'entering') handOn(R, s, o);
  }
  for (const [tok, se] of R.sessions) if (!se.live && t - se.lost > T.keep) { R.sessions.delete(tok); R.byPid.delete(se.pid); }
  return o;
}

function refill(R, s, o) {
  if (s.reserve) { const n = s.reserve; s.reserve = null; return place(R, s, { id: n.id, owner: n.owner, sys: null }, o, 'print'); }
  const kinds = R.slots.map((x) => (x === s ? null : x.kind));
  let kind = C.pickKind(R.r, C.avoidFor(kinds, s.i, COLS));
  if (kind === 'note') {
    if (R.waitlist.length) { const n = R.waitlist.shift(); o.all.push({ t: 'Q', wait: R.waitlist.length }); return place(R, s, { id: n.id, owner: n.owner, sys: null }, o, 'print'); }
    const used = R.slots.filter((x) => x.note && x.note.sys != null).map((x) => C.NOTES[x.note.sys]);
    s.note = { id: null, owner: null, sys: C.NOTES.indexOf(C.pickNote(R.r, used)) };
  }
  s.kind = kind; s.st = 'entering'; s.until = R.now() + T.enter; bump(s);
  o.all.push({ t: 'R', ...slotView(R, s), e: R.r() < 0.5 ? 'gather' : 'rain' });
}

// Latest finger of everyone who moved since the last flush, as one batch.
export function flushPointers(R) {
  if (!R.pointers.size) return null;
  const list = [...R.pointers].map(([pid, p]) => [pid, ...p]);
  R.pointers.clear();
  return { t: 'P', list };
}

export function view(R, tok) { const me = R.sessions.get(tok); return me ? snapshot(R, me) : null; }
