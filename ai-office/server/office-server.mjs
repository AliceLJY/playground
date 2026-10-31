import http from 'node:http';
import { readFile, writeFile, rename, mkdir, chmod, stat } from 'node:fs/promises';
import { createHash, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { collect } from './collectors.mjs';
import { STATUSES, iso, cleanText, cleanNotice, taskCategory, reduceMember, RateLimiter, appendNotice } from './core.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRIVATE = path.join(os.homedir(), '.config', 'ai-office');
const ASSETS = new Map([['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']], ['/office.js', ['office.js', 'text/javascript']], ['/office-core.js', ['office-core.js', 'text/javascript']], ['/style.css', ['style.css', 'text/css']], ['/demo-script.json', ['demo-script.json', 'application/json']]]);

export function validateConfig(config) {
  if (!config || !Array.isArray(config.roster) || config.roster.length !== 11) throw new Error('Config must define exactly 11 roles');
  const ids = new Set();
  for (const a of config.roster) {
    if (!/^[a-z][a-z0-9_-]{0,31}$/.test(a.id) || ['constructor', 'prototype', '__proto__'].includes(a.id) || ids.has(a.id)) throw new Error('Invalid or duplicate role id');
    ids.add(a.id);
    if (typeof a.name !== 'string' || !a.name.trim() || a.name.length > 24 || typeof a.role !== 'string' || a.role.length > 32 || !/^#[0-9a-f]{6}$/i.test(a.color)) throw new Error('Invalid role presentation');
    if (!['cc', 'codex', 'launchd', 'etwin', 'artifacts', 'push', 'courier'].includes(a.source?.type)) throw new Error('Invalid role source');
  }
  return config;
}

async function loadState(file) {
  try {
    const data = JSON.parse(await readFile(file, 'utf8'));
    if (data.version !== 1 || !data.members || !Array.isArray(data.notices)) throw new Error();
    data.notices = data.notices.filter(n => typeof n.text === 'string' && Number.isFinite(Date.parse(n.at))).slice(-20).map(n => ({ at: n.at, text: cleanNotice(n.text) }));
    return data;
  } catch (e) {
    if (e.code === 'ENOENT') return { version: 1, members: {}, notices: [] };
    throw new Error('Private state is unreadable or invalid; preserve it and repair before restart');
  }
}

export async function createOffice({ config, token, stateFile, clock = Date.now, collector = collect }) {
  validateConfig(config);
  if (typeof token !== 'string' || token.trim().length < 24) throw new Error('Missing or invalid private token');
  const expected = createHash('sha256').update(`Bearer ${token.trim()}`).digest();
  const state = await loadState(stateFile);
  const limiter = new RateLimiter();
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
      return { id: a.id, name: cleanText(a.name, 24), role: cleanText(a.role, 32), color: a.color, status: STATUSES.includes(m.status) ? m.status : 'unknown', statusSince: m.statusSince || updatedAt, badge: cleanText(m.badge || '', 16) };
    }), notices: state.notices.map(n => ({ ...n })), demo: false };
  }

  async function poll({ save = true } = {}) {
    if (polling) return;
    polling = true;
    try {
      // A collector cannot overwrite a push arriving while it is reading the OS.
      const results = await Promise.all(config.roster.map(async a => {
        try { return await collector(a.source, state.members[a.id] || {}); } catch { return { error: true }; }
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

  const reply = (res, code, value) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(code === 429 ? { 'Retry-After': '2' } : {}) });
    res.end(JSON.stringify(value));
  };
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    try {
      const url = new URL(req.url, 'http://127.0.0.1:3091');
      if (req.method === 'GET' && url.pathname === '/api/state') return reply(res, 200, snapshot());
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
  const office = await createOffice({ config: JSON.parse(await readFile(configFile, 'utf8')), token: await readFile(tokenFile, 'utf8'), stateFile: path.join(PRIVATE, 'state.json') });
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
