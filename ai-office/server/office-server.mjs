import http from 'node:http';
import { readFile, writeFile, rename, mkdir, chmod, stat } from 'node:fs/promises';
import { createHash, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { collect } from './collectors.mjs';
import { STATUSES, iso, cleanText, cleanNotice, taskCategory, reduceMember, RateLimiter, appendNotice, beijingDay } from './core.mjs';
const MINUTE_MS = 60_000;

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRIVATE = path.join(os.homedir(), '.config', 'ai-office');
const ASSETS = new Map([['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']], ['/office.js', ['office.js', 'text/javascript']], ['/office-core.js', ['office-core.js', 'text/javascript']], ['/style.css', ['style.css', 'text/css']], ['/demo-script.json', ['demo-script.json', 'application/json']]]);

// What a visitor may bring: the menu on the page, nothing free-form ever crosses the wire.
export const TREAT_KINDS = ['milktea', 'coffee', 'cake', 'melon'];

export function validateConfig(config) {
  if (!config || !Array.isArray(config.roster) || config.roster.length < 1 || config.roster.length > 11) throw new Error('Config must define 1 to 11 roles');
  const ids = new Set(), desks = new Set();
  for (const a of config.roster) {
    if (!/^[a-z][a-z0-9_-]{0,31}$/.test(a.id) || ['constructor', 'prototype', '__proto__'].includes(a.id) || ids.has(a.id)) throw new Error('Invalid or duplicate role id');
    ids.add(a.id);
    if (typeof a.name !== 'string' || !a.name.trim() || a.name.length > 24 || typeof a.role !== 'string' || a.role.length > 32 || !/^#[0-9a-f]{6}$/i.test(a.color)) throw new Error('Invalid role presentation');
    if (!['cc', 'codex', 'launchd', 'etwin', 'artifacts', 'statusfiles', 'push', 'courier'].includes(a.source?.type)) throw new Error('Invalid role source');
    if (a.source?.type === 'artifacts' && a.source.directories !== undefined && (!Array.isArray(a.source.directories) || !a.source.directories.length || a.source.directories.some(d => typeof d?.path !== 'string'))) throw new Error('Invalid directories');
    if (a.desk !== undefined && (!Number.isInteger(a.desk) || a.desk < 0 || a.desk > 10 || desks.has(a.desk))) throw new Error('Invalid desk'); if (a.desk !== undefined) desks.add(a.desk);
  }
  return config;
}

async function loadState(file) {
  try {
    const data = JSON.parse(await readFile(file, 'utf8'));
    if (data.version !== 1 || !data.members || !Array.isArray(data.notices)) throw new Error();
    data.notices = data.notices.filter(n => typeof n.text === 'string' && Number.isFinite(Date.parse(n.at))).slice(-20).map(n => ({ at: n.at, text: cleanNotice(n.text) }));
    data.visitorsTotal = Number.isInteger(data.visitorsTotal) && data.visitorsTotal >= 0 ? data.visitorsTotal : 0;
    data.treats = (Array.isArray(data.treats) ? data.treats : []).filter(t => TREAT_KINDS.includes(t?.kind) && Number.isFinite(Date.parse(t.at))).slice(-50).map(t => ({ kind: t.kind, at: t.at }));
    return data;
  } catch (e) {
    if (e.code === 'ENOENT') return { version: 1, members: {}, notices: [], visitorsTotal: 0, treats: [] };
    throw new Error('Private state is unreadable or invalid; preserve it and repair before restart');
  }
}

export async function createOffice({ config, token, botKeys: botKeys_ = {}, stateFile, clock = Date.now, collector = collect }) {
  validateConfig(config);
  if (typeof token !== 'string' || token.trim().length < 24) throw new Error('Missing or invalid private token');
  const expected = createHash('sha256').update(`Bearer ${token.trim()}`).digest();
  // Per-bot keys for the public guest report path: a key moves only that one desk, nothing else. Cosmetic by design.
  // A bot that cannot keep a secret (an agent with no credential store) may be marked "open" by the owner: its desk
  // takes reports with no key. The harm is bounded the same way a leaked key would be: that one desk, five words,
  // rate limited. Everything else still needs its key or the private token.
  const botKeys = new Map();
  for (const [id, key] of Object.entries(botKeys_ || {})) {
    if (!config.roster.some(a => a.id === id)) throw new Error(`Unknown bot in keys: ${id}`);
    if (key === 'open') { botKeys.set(id, 'open'); continue; }
    if (typeof key !== 'string' || key.trim().length < 24) throw new Error(`Invalid bot key for ${id}`);
    botKeys.set(id, createHash('sha256').update(key.trim()).digest());
  }
  const state = await loadState(stateFile);
  const limiter = new RateLimiter();
  // People looking at the public page: each page keeps a random tag for its tab and says hello every ten seconds;
  // a tag silent for 45 s has left. Only a count ever leaves the server. Capped so a flood cannot grow memory.
  const VISIT_TTL = 45_000, VISIT_CAP = 200;
  const visitors = new Map();
  function visitorCount(now) {
    for (const [tag, at] of visitors) if (now - at > VISIT_TTL) visitors.delete(tag);
    return visitors.size;
  }
  let writes = Promise.resolve(), polling = false, updatedAt = iso(clock());

  function persist() {
    const body = JSON.stringify(state);
    const job = writes.catch(() => {}).then(async () => {
      await mkdir(path.dirname(stateFile), { recursive: true, mode: 0o700 });
      const tmp = stateFile + '.tmp';
      await writeFile(tmp, body, { mode: 0o600 });
      await chmod(tmp, 0o600);
      await rename(tmp, stateFile);
    });
    writes = job;
    return job;
  }

  function snapshot() {
    return { updatedAt, roster: config.roster.map(a => {
      const m = state.members[a.id] || {};
      return { id: a.id, ...(a.desk !== undefined ? { desk: a.desk } : {}), name: cleanText(a.name, 24), role: cleanText(a.role, 32), color: a.color, status: STATUSES.includes(m.status) ? m.status : 'unknown', statusSince: m.statusSince || updatedAt, badge: cleanText(m.badge || '', 16), workedToday: Number.isFinite(m.workedMs) && m.workedDay === beijingDay(clock()) ? Math.round(m.workedMs) : 0 };
    }), notices: state.notices.map(n => ({ ...n })), demo: false, visitors: visitorCount(clock()), visitorsTotal: state.visitorsTotal || 0, treats: (state.treats || []).slice(-10), treatsToday: treatsToday() };
  }
  function treatsToday() {
    const day = beijingDay(clock()), counts = {};
    for (const t of state.treats || []) if (beijingDay(Date.parse(t.at)) === day) counts[t.kind] = (counts[t.kind] || 0) + 1;
    return counts;
  }
  const treatBy = new Map(); // visitor tag -> last treat time: one a minute each

  const COLLECT_TIMEOUT = 10_000, SUSPEND_AFTER_TIMEOUT = 30 * 60_000;
  const log = (msg) => console.error(`${new Date().toISOString()} ${msg}`);
  const suspended = new Map();
  async function poll({ save = true } = {}) {
    if (polling) return;
    polling = true;
    try {
      // A collector cannot overwrite a push arriving while it is reading the OS.
      const results = await Promise.all(config.roster.map(async a => {
        // A collector that never returns (a TCC-blocked open on a protected folder hangs forever under launchd)
        // must not freeze every other desk: race it against a timeout, then leave that source alone for a while,
        // since each hung read also pins one of libuv's few worker threads.
        if ((suspended.get(a.id) || 0) > clock()) return { error: true };
        let timer;
        try {
          return await Promise.race([
            collector(a.source, state.members[a.id] || {}),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), COLLECT_TIMEOUT); })
          ]);
        } catch (e) {
          if (e?.message === 'timeout') { suspended.set(a.id, clock() + SUSPEND_AFTER_TIMEOUT); log(`collector ${a.id} timed out after ${COLLECT_TIMEOUT} ms; suspended for ${SUSPEND_AFTER_TIMEOUT / 60000} min`); }
          return { error: true };
        } finally { clearTimeout(timer); }
      }));
      const now = clock();
      config.roster.forEach((a, i) => {
        const prev = state.members[a.id] || {};
        const signal = results[i];
        state.members[a.id] = reduceMember(a.source, signal, { ...prev, memory: { ...prev.memory, ...signal?.memory } }, now);
      });
      updatedAt = iso(now);
      if (save) await persist();
    } finally { polling = false; }
  }

  const reply = (res, code, value, extra = {}) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(code === 429 ? { 'Retry-After': '2' } : {}), ...extra });
    res.end(JSON.stringify(value));
  };
  // The guest view: the same desks and statuses, no board and no badge text, readable from the public page's origin
  // only. It is what a path-limited public proxy (tailscale funnel /office -> /guest) exposes; nothing else is reachable.
  const GUEST_ORIGINS = new Set(['https://aliceljy.github.io']);
  function guestSnapshot() {
    // The public feed is the show, not a log: times are rounded to the minute so nobody can read a work diary
    // off it with a script; the board and badge text stay private.
    const full = snapshot(), minute = ms => Math.floor(ms / 60_000) * 60_000;
    return { ...full, roster: full.roster.map(a => ({ ...a, badge: '', statusSince: iso(minute(Date.parse(a.statusSince))), workedToday: minute(a.workedToday) })), notices: [], guest: true };
  }
  // Everything under /guest/ sits on the public internet through the funnel: a per-address budget keeps one
  // script from turning the machine into a free ping target. The page itself needs 12 requests a minute per tab.
  const GUEST_LIMIT = 120, GUEST_WINDOW = 60_000, guestHits = new Map();
  function guestAllowed(req, now) {
    // The funnel sets X-Forwarded-For; the last entry is the one the proxy itself appended.
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
    const ip = forwarded.at(-1) || req.socket?.remoteAddress || 'unknown';
    for (const [k, rec] of guestHits) if (now - rec.start > GUEST_WINDOW * 2) guestHits.delete(k);
    if (guestHits.size > 10_000) guestHits.clear();
    let rec = guestHits.get(ip);
    if (!rec || now - rec.start > GUEST_WINDOW) { rec = { start: now, n: 0 }; guestHits.set(ip, rec); }
    rec.n++;
    return rec.n <= GUEST_LIMIT ? null : Math.ceil((GUEST_WINDOW - (now - rec.start)) / 1000);
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    try {
      const url = new URL(req.url, 'http://127.0.0.1:3091');
      if (req.method === 'GET' && url.pathname === '/api/state') return reply(res, 200, snapshot());
      if (url.pathname.startsWith('/guest/')) {
        const retry = guestAllowed(req, clock());
        if (retry !== null) { req.resume(); return reply(res, 429, { error: 'Rate limited' }, { 'Retry-After': String(retry), 'Cache-Control': 'no-store' }); }
      }
      if (req.method === 'GET' && url.pathname === '/guest/api/state') {
        const origin = req.headers.origin;
        return reply(res, 200, guestSnapshot(), { Vary: 'Origin', ...(GUEST_ORIGINS.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}) });
      }
      if (req.method === 'OPTIONS' && url.pathname === '/guest/treat') {
        const origin = req.headers.origin;
        if (!GUEST_ORIGINS.has(origin)) return reply(res, 404, { error: 'Not found' });
        res.writeHead(204, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Max-Age': '600', Vary: 'Origin' }); res.end(); return;
      }
      if (req.method === 'GET' && url.pathname === '/guest/visit') {
        const origin = req.headers.origin, tag = url.searchParams.get('v') || '';
        const cors = { Vary: 'Origin', 'Cache-Control': 'no-store', ...(GUEST_ORIGINS.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}) };
        if (!/^[a-f0-9]{16,32}$/.test(tag)) return reply(res, 400, { error: 'Invalid visitor tag' }, cors);
        const now = clock();
        if (!limiter.take(`visit:${tag}`, now)) return reply(res, 429, { error: 'Rate limited' }, cors);
        visitorCount(now);
        // A tag heard for the first time is one more guest in the book, kept across restarts; a tab that goes quiet
        // for 45 s and comes back counts again (it is a new visit), which is how a guest book works anyway.
        if (!visitors.has(tag) && visitors.size < VISIT_CAP) { visitors.set(tag, now); state.visitorsTotal = (state.visitorsTotal || 0) + 1; await persist(); }
        else if (visitors.has(tag)) visitors.set(tag, now);
        return reply(res, 200, { ok: true, visitors: visitors.size, visitorsTotal: state.visitorsTotal || 0 }, cors);
      }
      if (req.method === 'POST' && url.pathname === '/guest/treat') {
        const origin = req.headers.origin;
        const cors = { Vary: 'Origin', 'Cache-Control': 'no-store', ...(GUEST_ORIGINS.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}) };
        if (Number(req.headers['content-length']) > 256) { req.resume(); return reply(res, 413, { error: 'Body too large' }, cors); }
        let size = 0, parts = [];
        for await (const part of req) { size += part.length; if (size > 256) { reply(res, 413, { error: 'Body too large' }, cors); return; } parts.push(part); }
        let data;
        try { data = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { return reply(res, 400, { error: 'Invalid JSON' }, cors); }
        if (!data || typeof data !== 'object' || !TREAT_KINDS.includes(data.kind) || !/^[a-f0-9]{16,32}$/.test(String(data.v || ''))) return reply(res, 400, { error: 'Invalid treat' }, cors);
        const now = clock();
        for (const [tag, at] of treatBy) if (now - at > 10 * MINUTE_MS) treatBy.delete(tag);
        if (treatBy.has(data.v) && now - treatBy.get(data.v) < MINUTE_MS) return reply(res, 429, { error: 'One a minute, thank you' }, { ...cors, 'Retry-After': String(Math.ceil((MINUTE_MS - (now - treatBy.get(data.v))) / 1000)) });
        if (!limiter.take('treat', now)) return reply(res, 429, { error: 'Rate limited' }, cors);
        treatBy.set(data.v, now);
        const entry = { kind: data.kind, at: iso(now) };
        state.treats = [...(state.treats || []), entry].slice(-50);
        updatedAt = iso(now); await persist();
        return reply(res, 200, { ok: true, at: entry.at }, cors);
      }
      const guestReport = req.method === 'POST' && url.pathname.match(/^\/guest\/report\/([a-z][a-z0-9_-]{0,31})$/);
      if (guestReport) {
        const id = guestReport[1], keyHash = botKeys.get(id);
        const got = createHash('sha256').update(String(req.headers['x-office-key'] || '').trim()).digest();
        if (!keyHash || (keyHash !== 'open' && !timingSafeEqual(keyHash, got))) { req.resume(); return reply(res, 403, { error: 'Forbidden' }); }
        if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) { req.resume(); return reply(res, 415, { error: 'JSON required' }); }
        if (Number(req.headers['content-length']) > 1024) { req.resume(); return reply(res, 413, { error: 'Body too large' }); }
        let size = 0, parts = [];
        for await (const part of req) { size += part.length; if (size > 1024) { reply(res, 413, { error: 'Body too large' }); return; } parts.push(part); }
        let data;
        try { data = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { return reply(res, 400, { error: 'Invalid JSON' }); }
        const allowed = ['busy', 'waiting', 'done', 'idle', 'away'];
        if (!data || typeof data !== 'object' || !allowed.includes(data.status) || data.task != null && typeof data.task !== 'string') return reply(res, 400, { error: 'Invalid report' });
        const now = clock();
        if (!limiter.take(id, now)) return reply(res, 429, { error: 'Rate limited' });
        const prev = state.members[id] || {};
        state.members[id] = { ...prev, status: data.status, statusSince: prev.status === data.status ? prev.statusSince : iso(now), lastSignalAt: now, push: { at: now, status: data.status, summary: taskCategory(data.task) } };
        updatedAt = iso(now); await persist();
        return reply(res, 200, { ok: true });
      }
      if (url.pathname.startsWith('/guest/')) return reply(res, 404, { error: 'Not found' });
      if (req.method === 'POST' && ['/api/report', '/api/notice'].includes(url.pathname)) {
        const got = createHash('sha256').update(req.headers.authorization || '').digest();
        if (!timingSafeEqual(expected, got)) { req.resume(); return reply(res, 401, { error: 'Unauthorized' }); }
        if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) { req.resume(); return reply(res, 415, { error: 'JSON required' }); }
        if (Number(req.headers['content-length']) > 4096) { req.resume(); return reply(res, 413, { error: 'Body too large' }); }
        let size = 0, parts = [];
        for await (const part of req) {
          size += part.length;
          if (size > 4096) { reply(res, 413, { error: 'Body too large' }); return; }
          parts.push(part);
        }
        let data;
        try { data = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { return reply(res, 400, { error: 'Invalid JSON' }); }
        if (!data || typeof data !== 'object' || Array.isArray(data)) return reply(res, 400, { error: 'Invalid object' });
        const now = clock();
        if (url.pathname === '/api/report') {
          const actor = config.roster.find(a => a.id === data.id);
          if (!actor || !STATUSES.includes(data.status) || data.summary != null && typeof data.summary !== 'string') return reply(res, 400, { error: 'Invalid report' });
          if (!limiter.take(actor.id, now)) return reply(res, 429, { error: 'Rate limited' });
          const prev = state.members[actor.id] || {};
          state.members[actor.id] = { ...prev, status: data.status, statusSince: prev.status === data.status ? prev.statusSince : iso(now), lastSignalAt: now, push: { at: now, status: data.status, summary: taskCategory(data.summary) } };
        } else {
          if (typeof data.text !== 'string' || !cleanNotice(data.text)) return reply(res, 400, { error: 'Empty notice' });
          const courier = config.roster.find(a => a.source.type === 'courier')?.id || '$notice';
          if (!limiter.take(courier, now)) return reply(res, 429, { error: 'Rate limited' });
          state.notices = appendNotice(state.notices, data.text, now);
        }
        updatedAt = iso(now);
        await persist();
        return reply(res, 200, { ok: true });
      }
      const asset = ASSETS.get(url.pathname);
      if ((req.method === 'GET' || req.method === 'HEAD') && asset) {
        const body = await readFile(path.join(ROOT, asset[0]));
        res.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8`, 'Content-Length': body.length, 'Cache-Control': 'no-cache' });
        return res.end(req.method === 'HEAD' ? undefined : body);
      }
      return reply(res, 404, { error: 'Not found' });
    } catch { if (!res.headersSent) reply(res, 500, { error: 'Request could not be completed' }); else res.end(); }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.timeout = 5000;
  return { server, poll, snapshot, flush: () => writes };
}

async function main() {
  if (process.argv.slice(2).some(a => a !== '--once')) throw new Error('Usage: node server/office-server.mjs [--once]');
  const configFile = path.join(PRIVATE, 'config.json'), tokenFile = path.join(PRIVATE, 'token');
  for (const file of [configFile, tokenFile]) {
    if ((await stat(file)).mode & 0o077) throw new Error('Private config and token must have mode 600');
  }
  let botKeys = {};
  try { botKeys = JSON.parse(await readFile(path.join(PRIVATE, 'botkeys.json'), 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const office = await createOffice({ config: JSON.parse(await readFile(configFile, 'utf8')), token: await readFile(tokenFile, 'utf8'), botKeys, stateFile: path.join(PRIVATE, 'state.json') });
  if (process.argv.includes('--once')) {
    await office.poll({ save: false });
    process.stdout.write(JSON.stringify(office.snapshot()) + '\n'); return;
  }
  // Acquire the listening port before writing shared state: a second instance must not overwrite it.
  await new Promise((resolve, reject) => {
    office.server.once('error', reject);
    office.server.listen(3091, '127.0.0.1', resolve);
  });
  try { await office.poll(); } catch (error) { office.server.close(); throw error; }
  console.error('Office listening on http://127.0.0.1:3091');
  const interval = setInterval(() => office.poll().catch(() => console.error('Office state could not be saved')), 10_000);
  interval.unref();
  for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => {
    clearInterval(interval);
    office.server.close(async () => { await office.flush().catch(() => {}); });
    office.server.closeIdleConnections();
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(() => { console.error('Office startup failed: check private config, token permissions, and state file'); process.exitCode = 1; });
