// The room around the desks: who CC has work out with, meetings, the phone booth, the storeroom, the night guard,
// and the running totals and today's log a visitor who missed the moment can still read. Everything that leaves this
// module is structured (ids, counts, times, booleans); no text from any log or wrapper is ever passed on.
import { readFile, stat, open } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { MINUTE, iso, beijingDay, validTime } from './core.mjs';
import { expand } from './collectors.mjs';
const exec = promisify(execFile);

// The wrappers CC (or a subagent) calls to hand work to another engine; Alice's own terminal runs and the TG bridges
// call the CLIs directly, so a live wrapper means work CC sent out. Script basename -> roster id.
export const DISPATCH = { 'codex-run.sh': 'codex', 'kimi-run.sh': 'kimi', 'agy-gui-run.sh': 'agy', 'grok-clean.sh': 'grok', 'muse-vm.py': 'muse' };

// Which engines have a wrapper alive, from `ps -axo pid,ppid,args` (or `pid,args`). A wrapper forks watchdog subshells
// that show the same args, so this is a set of engines, not a count of processes. With ppid, `windows` groups them by
// the CC window that sent them (its nearest claude ancestor): two windows each with one hand-off are not a meeting.
export function dispatchedFrom(output, map = DISPATCH, roster = null) { return dispatchScan(output, map, roster).dispatched; }
export function dispatchScan(output, map = DISPATCH, roster = null) {
  const found = new Set(), procs = new Map(), hits = [];
  for (const line of output.split('\n')) {
    const w = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
    if (w) procs.set(w[1], { ppid: w[2], args: w[3] });
  }
  for (const line of output.split('\n')) {
    const withParent = line.trim().match(/^(\d+)\s+\d+\s+(.*)$/);
    const m = withParent && procs.size ? [null, withParent[2]] : line.trim().match(/^\d+\s+(.*)$/);
    if (!m) continue;
    const pid = withParent && procs.size ? withParent[1] : null;
    // The script is the interpreter's first non-option argument (bash x.sh, python3 -I x.py) or the command itself.
    for (const word of m[1].split(/\s+/).slice(0, 4)) {
      if (word.startsWith('-')) continue;
      const base = word.slice(word.lastIndexOf('/') + 1), id = map[base];
      // muse-vm.py has quick helper subcommands too; only handing Muse a job (ask) or waiting on it (wait) is work.
      if (base === 'muse-vm.py' && !/\s(?:ask|wait)(?:\s|$)/.test(m[1])) break;
      if (id) { if (!roster || roster.has(id)) { found.add(id); if (pid) hits.push({ pid, id }); } break; }
      // Past an interpreter (bash x.sh, python3 -I x.py, zsh -c "x.sh ...") keep looking; anything else (less, grep,
      // an editor with the script open) is not a run.
      if (!/^(?:bash|sh|zsh|python3?(?:\.\d+)?|python|env|nohup|time|exec)$/.test(base)) break;
    }
  }
  const window = (pid) => {
    for (let p = procs.get(pid)?.ppid, n = 0; p && p !== '1' && n < 32; p = procs.get(p)?.ppid, n++) {
      const first = (procs.get(p)?.args || '').split(/\s+/)[0];
      if (/\/claude\/versions\/[^/]+$|(?:^|\/)claude$/.test(first)) return p;
    }
    return null;
  };
  const groups = new Map();
  for (const { pid, id } of hits) { const key = window(pid); if (!key) continue; if (!groups.has(key)) groups.set(key, new Set()); groups.get(key).add(id); }
  return { dispatched: [...found].sort(), windows: procs.size ? Object.fromEntries([...groups].map(([k, v]) => [k, [...v].sort()])) : null };
}

// Percent used of the data volume, as df shows it. Only the integer leaves.
export function diskPercent(output) {
  const line = output.trim().split('\n').at(-1) || '';
  const m = line.match(/\s(\d{1,3})%\s/);
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : null;
}

// The nightly sync-bridge backup log (22:30): "=== <date> <time> 备份开始 ===" ... "=== <date> <time> 完成 (FAIL=n) ===".
// Running means patrol; finished means done with ok = FAIL is 0. Only the start/end lines are looked at.
export function guardFrom(text) {
  const lines = text.split('\n');
  const start = lines.find(l => /^=== \S+ \S+ 备份开始 ===/.test(l));
  if (!start) return null;
  const end = [...lines].reverse().find(l => /^=== \S+ \S+ 完成 \(FAIL=\d+\) ===/.test(l));
  const when = l => { const m = l.match(/^=== (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/); return m ? Date.parse(`${m[1]}T${m[2]}+08:00`) : NaN; };
  if (!end) return { phase: 'patrol', at: when(start), ok: null };
  return { phase: 'done', at: when(end), ok: /FAIL=0\)/.test(end) };
}

async function tailText(file, bytes = 65536) {
  const handle = await open(file, 'r');
  try {
    const info = await handle.stat();
    const head = Buffer.alloc(Math.min(512, info.size));
    await handle.read(head, 0, head.length, 0);
    const length = Math.min(bytes, info.size), buf = Buffer.alloc(length);
    await handle.read(buf, 0, length, info.size - length);
    return head.toString('utf8').split('\n')[0] + '\n' + buf.toString('utf8');
  } finally { await handle.close(); }
}

export async function collectScene(options = {}, now = Date.now()) {
  const out = {};
  try {
    const { stdout } = await exec('/bin/ps', ['-axo', 'pid,ppid,args'], { timeout: 3000, maxBuffer: 8 * 1024 * 1024 });
    Object.assign(out, dispatchScan(stdout, options.dispatch || DISPATCH, options.roster));
  } catch { out.dispatched = null; }
  try {
    const { stdout } = await exec('/bin/df', ['-k', options.diskPath || '/System/Volumes/Data'], { timeout: 3000 });
    out.diskPct = diskPercent(stdout);
  } catch { out.diskPct = null; }
  // Tonight's log is named by the Beijing date the backup started; after midnight it is still yesterday's.
  const dir = expand(options.guardLogDir || '~/ops-logs/sync-bridge-vault');
  out.guard = null;
  for (const day of [beijingDay(now), beijingDay(now - 86_400_000)]) {
    const file = path.join(dir, `${day}.log`);
    try { if ((await stat(file)).size > 8 * 1024 * 1024) continue; out.guard = guardFrom(await tailText(file)); if (out.guard) break; }
    catch (e) { if (e.code !== 'ENOENT') break; }
  }
  // Cobbler's notes, all of them since its log began (queued for the 10:30 digest or sent at once), and today's.
  try {
    const file = expand(options.cobblerLog || '~/ops-logs/cobbler-notify/sent.log');
    if ((await stat(file)).size <= 16 * 1024 * 1024) {
      const today = beijingDay(now);
      let total = 0, day = 0;
      for (const line of (await readFile(file, 'latin1')).split('\n')) {
        const m = line.match(/^(\d{4}-\d{2}-\d{2}) \d{2}:\d{2}:\d{2}\t(queued|sent|sent-proxy)\t/);
        if (!m) continue;
        total++; if (m[1] === today) day++;
      }
      out.notes = { total, today: day };
    }
  } catch { out.notes = null; }
  return out;
}

const EVENT_CAP = 40, REVIEW_TTL = 90 * MINUTE, CALL_TTL = 60 * MINUTE, ASK_GAP = 10 * MINUTE, RING_MS = 30_000;

export function emptyScene(now) {
  return { dispatched: [], huddle: null, review: null, call: null, diskPct: null, guard: null, windows: {}, stats: freshStats(now), events: [] };
}
export function freshStats(now) {
  return { since: beijingDay(now), visitorsTotal: 0, treatsTotal: 0, meetingsTotal: 0, handoffsTotal: 0, callsTotal: 0, day: beijingDay(now), today: { visitors: 0, treats: 0, meetings: 0, handoffs: 0, calls: 0 } };
}

// Today's counts start over at Beijing midnight; so does the log.
function rollDay(scene, now) {
  const day = beijingDay(now);
  if (scene.stats.day !== day) { scene.stats.day = day; scene.stats.today = { visitors: 0, treats: 0, meetings: 0, handoffs: 0, calls: 0 }; }
  scene.events = scene.events.filter(e => beijingDay(Date.parse(e.at)) === day);
}
function count(scene, key, now) {
  rollDay(scene, now);
  scene.stats[`${key}Total`] = (scene.stats[`${key}Total`] || 0) + 1;
  scene.stats.today[key] = (scene.stats.today[key] || 0) + 1;
}
export function addEvent(scene, event, now) {
  rollDay(scene, now);
  scene.events = [...scene.events, { at: iso(now), ...event }].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(-EVENT_CAP);
}

// Visitors arrive in bursts (one link, several friends): arrivals within ten minutes of the last visitor line are
// folded into it, whatever else was logged in between, instead of filling the log.
export function noteVisitor(scene, now) {
  count(scene, 'visitors', now);
  const last = [...scene.events].reverse().find(e => e.kind === 'visitor');
  if (last && now - Date.parse(last.at) < 10 * MINUTE) last.n = Math.min(9999, (last.n || 1) + 1);
  else addEvent(scene, { kind: 'visitor', n: 1 }, now);
}
export function noteTreat(scene, kind, now) { count(scene, 'treats', now); addEvent(scene, { kind: 'treat', treat: kind }, now); }

const meetingMembers = (scene) => ['cc', ...(scene.dispatched || [])];

function startMeeting(scene, now, review) {
  count(scene, 'meetings', now);
  addEvent(scene, { kind: 'meeting', ids: meetingMembers(scene), ...(review ? { review: true } : {}) }, now);
}
function endMeeting(scene, since, now) {
  addEvent(scene, { kind: 'meeting-end', minutes: Math.max(1, Math.round((now - since) / MINUTE)) }, now);
}

// One poll: the wrappers alive now against the last poll. Each one out is a hand-off. A meeting is one CC window
// bringing in two or more engines on the same thing, at once (a mutual review's cold read) or one after another with
// gaps under ten minutes (asking around in turn); it ends ten minutes after that window last had anyone out. A one-on-one
// is a hand-off, not a meeting. A review CC announced keeps its meeting open across rounds.
export function reduceScene(prev, signal, now) {
  const scene = { ...emptyScene(now), ...prev, windows: { ...(prev?.windows || {}) }, stats: { ...freshStats(now), ...prev?.stats, today: { ...freshStats(now).today, ...prev?.stats?.today } }, events: [...(prev?.events || [])] };
  rollDay(scene, now);
  if (Array.isArray(signal.dispatched)) {
    const before = new Set(scene.dispatched), after = new Set(signal.dispatched);
    for (const id of after) if (!before.has(id)) {
      count(scene, 'handoffs', now); addEvent(scene, { kind: 'handoff', ids: ['cc', id] }, now);
      // A one-on-one hand-off is CC phoning it in: half a minute in the booth, then back to the desk (Alice, 11-01:
      // 「派活走无头的那种我觉得都可以算」). In a meeting the work is handed out round the table instead.
      if (!scene.review && !scene.huddle) scene.ring = { since: now, with: id };
    }
    for (const id of before) if (!after.has(id)) addEvent(scene, { kind: 'return', ids: [id] }, now);
    scene.dispatched = [...after].sort();
    // Without process parents (tests, an old ps) everyone out is one window.
    const windows = signal.windows || { all: scene.dispatched };
    for (const [key, engines] of Object.entries(windows)) {
      const list = (engines || []).filter(id => after.has(id));
      if (!list.length) continue;
      const w = scene.windows[key] || { since: now, engines: [] };
      scene.windows[key] = { since: w.since, lastAt: now, engines: [...new Set([...w.engines, ...list])].sort() };
    }
  }
  if (signal.diskPct !== undefined) scene.diskPct = signal.diskPct;
  if (signal.notes) scene.notes = signal.notes;
  if (signal.guard !== undefined) {
    const g = signal.guard;
    // Logged at the time the round ended, and only on the day it ended (last night's result is not news this afternoon).
    if (g && g.phase === 'done' && validTime(g.at, now) && beijingDay(g.at) === beijingDay(now) && !(scene.guard?.phase === 'done' && scene.guard.at === g.at)) addEvent(scene, { kind: 'guard', ok: g.ok }, g.at);
    scene.guard = g && validTime(g.at, now) ? g : null;
  }
  if (scene.review && now - scene.review.at > REVIEW_TTL) { endMeeting(scene, scene.review.since, now); scene.review = null; scene.windows = {}; }
  if (scene.call && now - scene.call.since > CALL_TTL) { addEvent(scene, { kind: 'call-end' }, now); scene.call = null; }
  for (const [key, w] of Object.entries(scene.windows)) {
    if (now - w.lastAt <= ASK_GAP) continue;
    if (scene.huddle?.window === key) { endMeeting(scene, scene.huddle.since, now); scene.huddle = null; }
    delete scene.windows[key];
  }
  if (scene.review) scene.review.members = [...new Set([...(scene.review.members || ['cc']), ...meetingMembers(scene)])];
  else if (scene.huddle) scene.huddle.members = ['cc', ...(scene.windows[scene.huddle.window]?.engines || [])];
  else {
    const [key, w] = Object.entries(scene.windows).find(([, w]) => w.engines.length >= 2) || [];
    if (w) { scene.huddle = { window: key, since: w.since, members: ['cc', ...w.engines] }; startMeeting(scene, now, false); scene.events.at(-1).ids = scene.huddle.members; }
  }
  // The log line that opened the meeting names everyone who has come in so far, not only the first one.
  const open = scene.review || scene.huddle;
  if (open) { const line = [...scene.events].reverse().find(e => e.kind === 'meeting'); if (line && Date.parse(line.at) >= Math.floor(open.since / MINUTE) * MINUTE) line.ids = [...open.members]; }
  // A hand-off that turned into a meeting is not a phone call any more.
  if (scene.ring && (now - scene.ring.since >= RING_MS || scene.huddle || scene.review)) scene.ring = null;
  return scene;
}

// CC's own announcements, through bin/office-meeting and bin/office-call (token required).
export function applyMeeting(prev, data, now) {
  const scene = reduceScene(prev, {}, now);
  const int = (v, max = 99) => Number.isInteger(v) && v >= 0 && v <= max ? v : null;
  if (data.state === 'start' || (data.state === 'round' && !scene.review)) {
    if (scene.huddle) { scene.review = { since: scene.huddle.since, at: now, round: null, slide: null, members: scene.huddle.members }; scene.huddle = null; scene.windows = {}; }
    else { scene.review = { since: now, at: now, round: null, slide: null, members: meetingMembers(scene) }; scene.windows = {}; startMeeting(scene, now, true); }
    // A huddle that turns out to be a review: the log line says so.
    const opened = [...scene.events].reverse().find(e => e.kind === 'meeting');
    if (opened) opened.review = true;
  }
  if (data.state === 'round' || data.state === 'start') {
    const round = int(data.round, 9);
    if (round !== null && round !== scene.review.round) { scene.review.round = round; addEvent(scene, { kind: 'round', round }, now); }
    const a = int(data.adopted), r = int(data.rejected), o = int(data.open);
    if (a !== null || r !== null || o !== null) scene.review.slide = { adopted: a ?? 0, rejected: r ?? 0, open: o ?? 0 };
    scene.review.at = now;
  }
  // The reviewers' last hand-offs belong to the review: they do not open a huddle right after it.
  if (data.state === 'end' && scene.review) { endMeeting(scene, scene.review.since, now); scene.review = null; scene.windows = {}; }
  return scene;
}
export function applyCall(prev, data, now) {
  const scene = reduceScene(prev, {}, now);
  if (data.state === 'start' && !scene.call) { scene.call = { since: now }; count(scene, 'calls', now); addEvent(scene, { kind: 'call' }, now); }
  if (data.state === 'end' && scene.call) { scene.call = null; addEvent(scene, { kind: 'call-end' }, now); }
  return scene;
}

// What both snapshots carry. Times are rounded to the minute: it is a show and a diary of counts, not a work log.
export function sceneView(scene, rosterIds, now) {
  const minute = ms => iso(Math.floor(ms / MINUTE) * MINUTE);
  const ids = list => (list || []).filter(id => rosterIds.has(id)).slice(0, 11);
  const meeting = scene.review ? { kind: 'review', since: minute(scene.review.since), members: ids(scene.review.members || ['cc']), round: scene.review.round, slide: scene.review.slide }
    : scene.huddle ? { kind: 'huddle', since: minute(scene.huddle.since), members: ids(scene.huddle.members), round: null, slide: null } : null;
  const day = beijingDay(now), today = scene.stats.day === day ? scene.stats.today : freshStats(now).today;
  return {
    scene: { meeting, dispatched: ids(scene.dispatched), call: scene.call ? { since: minute(scene.call.since), kind: 'consult' } : scene.ring && now - scene.ring.since < RING_MS ? { since: minute(scene.ring.since), kind: 'dispatch', with: ids([scene.ring.with])[0] || null } : null, disk: Number.isInteger(scene.diskPct) ? { usedPct: scene.diskPct } : null, guard: scene.guard ? { phase: scene.guard.phase, at: minute(scene.guard.at), ok: scene.guard.ok } : null },
    stats: { since: scene.stats.since, visitorsTotal: scene.stats.visitorsTotal, treatsTotal: scene.stats.treatsTotal, meetingsTotal: scene.stats.meetingsTotal, handoffsTotal: scene.stats.handoffsTotal, callsTotal: scene.stats.callsTotal, notesTotal: scene.notes?.total || 0, today: { ...today, notes: scene.notes?.today || 0 } },
    events: scene.events.filter(e => beijingDay(Date.parse(e.at)) === day).map(e => ({ ...e, at: minute(Date.parse(e.at)), ...(e.ids ? { ids: ids(e.ids) } : {}) }))
  };
}

// A state file from before the scene existed: carry the totals it already knew.
export function migrateScene(state, now) {
  const scene = state.scene && typeof state.scene === 'object' ? state.scene : emptyScene(now);
  scene.stats = { ...freshStats(now), ...scene.stats, today: { ...freshStats(now).today, ...scene.stats?.today } };
  if (!state.scene) {
    scene.stats.visitorsTotal = state.visitorsTotal || 0;
    scene.stats.treatsTotal = (state.treats || []).length;
    const day = beijingDay(now);
    scene.stats.today.treats = (state.treats || []).filter(t => beijingDay(Date.parse(t.at)) === day).length;
  }
  for (const key of ['dispatched', 'events']) if (!Array.isArray(scene[key])) scene[key] = [];
  scene.events = scene.events.filter(e => e && typeof e.kind === 'string' && /^[a-z-]{1,16}$/.test(e.kind) && Number.isFinite(Date.parse(e.at))).slice(-EVENT_CAP);
  return scene;
}
