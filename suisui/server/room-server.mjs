// 碎碎平安 room · the network side: WebSocket at /room/ws, limits, heartbeat, broadcasting.
// Exposed on the public internet through Tailscale funnel (8443 /suisui -> 127.0.0.1:8798/room), so it trusts nothing:
// browser origin checked, every message parsed against a whitelist, rate limits per connection and per address,
// a cap on people and connections, no disk, no access log.
//   node server/room-server.mjs            (PORT, HOST, SEED from the environment)
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { handshake, FrameReader, encodeText, encodeClose, encodePong, encodePing } from './ws.mjs';
import { createRoom, parse, join, leave, handle, tick, flushPointers } from './room.mjs';

export const LIMIT = {
  people: 50, conns: 60, perAddr: 4, handshakesPerSec: 10,
  msgsPerSec: 30, fingersPerSec: 15, floodMs: 3000, helloMs: 5000,
  pingEvery: 15000, silentMs: 40000, tickMs: 100,
};
const ORIGINS = [/^https:\/\/aliceljy\.github\.io$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/, /^http:\/\/localhost(:\d+)?$/];

// The visitor's address as seen by the last proxy. Funnel appends to X-Forwarded-For, so the last entry is the one
// it wrote; anything before it came from the client and can be forged (checked on the public side after deploy).
export function addrOf(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  return xff.length ? xff[xff.length - 1] : req.socket.remoteAddress || '?';
}

// Token bucket. `flooding(windowMs)` is true when more messages were dropped in the window than the bucket would
// have allowed in it, i.e. someone keeps sending at twice the limit or more. (Timing "since it first ran dry" does
// not work: a refill every 1/rate seconds resets it, so a flood just above the rate was never cut off.)
class Bucket {
  constructor(rate) { this.rate = rate; this.tokens = rate; this.at = Date.now(); this.drops = []; }
  take() {
    const t = Date.now();
    this.tokens = Math.min(this.rate, this.tokens + ((t - this.at) / 1000) * this.rate); this.at = t;
    if (this.tokens >= 1) { this.tokens -= 1; return true; }
    this.drops.push(t);
    return false;
  }
  flooding(windowMs) {
    const t = Date.now();
    while (this.drops.length && t - this.drops[0] > windowMs) this.drops.shift();
    return this.drops.length > this.rate * Math.max(1, windowMs / 1000);
  }
}

export function startRoom({ port = 8798, host = '127.0.0.1', seed = (Math.random() * 1e9) >>> 0, now, limits = {} } = {}) {
  const L = { ...LIMIT, ...limits };
  const room = createRoom({ seed, ...(now ? { now } : {}) });
  const conns = new Set();
  const byTok = new Map();          // session token -> its one live connection
  let handshakes = [];

  const send = (c, msg) => { if (!c.closed) c.sock.write(encodeText(JSON.stringify(msg))); };
  const deliver = (o) => {
    for (const [tok, msg] of o.to) { const c = byTok.get(tok); if (c) send(c, msg); }
    for (const msg of o.all) for (const c of conns) if (c.tok) send(c, msg);
  };
  const close = (c, code = 1000) => {
    if (c.closed) return;
    c.closed = true;
    try { c.sock.write(encodeClose(code)); } catch { /* socket already gone */ }
    c.sock.end(); setTimeout(() => c.sock.destroy(), 1000).unref();
  };

  const server = http.createServer((req, res) => {
    if (req.url === '/room/health') { res.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' }); res.end('ok'); return; }
    res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found');
  });

  server.on('upgrade', (req, sock) => {
    const refuse = (code, why) => { sock.end(`HTTP/1.1 ${code} ${why}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); };
    const t = Date.now();
    handshakes = handshakes.filter((x) => t - x < 1000);
    if (req.url !== '/room/ws') return refuse(404, 'Not Found');
    if (!ORIGINS.some((re) => re.test(String(req.headers.origin || '')))) return refuse(403, 'Forbidden');
    if (handshakes.length >= L.handshakesPerSec || conns.size >= L.conns) return refuse(503, 'Busy');
    const addr = addrOf(req);
    if ([...conns].filter((c) => c.addr === addr).length >= L.perAddr) return refuse(429, 'Too Many');
    const ok = handshake(req);
    if (!ok) return refuse(400, 'Bad Request');
    handshakes.push(t);
    sock.setNoDelay(true);
    sock.write(ok);

    const c = { sock, addr, tok: null, closed: false, replaced: false, seen: t, msgs: new Bucket(L.msgsPerSec), fingers: new Bucket(L.fingersPerSec) };
    conns.add(c);
    const hello = setTimeout(() => { if (!c.tok) close(c, 1008); }, L.helloMs);
    c.reader = new FrameReader({
      onText: (text) => {
        if (!c.msgs.take()) { if (c.msgs.flooding(L.floodMs)) close(c, 1008); return; }
        const m = parse(text);
        if (!m) return;                                     // anything off-whitelist is dropped silently
        if (!c.tok) {
          if (m.t !== 'hi') return;
          const known = m.tok && room.sessions.get(m.tok);
          const live = [...room.sessions.values()].filter((s) => s.live).length;
          if (!known && live >= L.people) { send(c, { t: 'F' }); return close(c, 1013); }
          const old = known && byTok.get(m.tok);
          if (old && old !== c) { old.replaced = true; close(old, 1000); }   // same visitor, newer tab wins
          const r = join(room, m);
          c.tok = r.me.tok; byTok.set(c.tok, c); clearTimeout(hello);
          return deliver(r.o);
        }
        if (m.t === 'hi') return;
        if (m.t === 'p' && !c.fingers.take()) return;
        deliver(handle(room, c.tok, m));
      },
      onPing: (p) => { if (!c.closed) sock.write(encodePong(p)); },
      onClose: () => close(c, 1000),
      onError: () => close(c, 1002),
    });
    sock.on('data', (b) => { c.seen = Date.now(); c.reader.push(b); });
    const gone = () => {
      if (!conns.delete(c)) return;
      clearTimeout(hello); c.closed = true;
      if (c.tok && byTok.get(c.tok) === c) byTok.delete(c.tok);
      if (c.tok && !c.replaced) deliver(leave(room, c.tok));
    };
    // Node's HTTP server allows half-open sockets, so after an upgrade a client FIN (a closed tab, passed on by the
    // proxy) would leave this socket open and still counted until the heartbeat. Close our side as soon as theirs is.
    sock.on('end', () => { close(c, 1000); gone(); });
    sock.on('close', gone); sock.on('error', gone);
  });

  const timers = [
    setInterval(() => { deliver(tick(room)); const P = flushPointers(room); if (P) deliver({ to: [], all: [P] }); }, L.tickMs),
    setInterval(() => {
      const t = Date.now();
      for (const c of conns) { if (t - c.seen > L.silentMs) close(c, 1001); else if (!c.closed) c.sock.write(encodePing()); }
    }, L.pingEvery),
  ];
  timers.forEach((x) => x.unref());

  return new Promise((resolve) => server.listen(port, host, () => resolve({
    port: server.address().port, room, conns,
    stop: () => new Promise((r) => { timers.forEach(clearInterval); for (const c of conns) close(c, 1001); server.close(() => r()); }),
  })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 8798, host = process.env.HOST || '127.0.0.1';
  startRoom({ port, host }).then((s) => console.log(`${new Date().toISOString()} suisui room listening on ${host}:${s.port}`));
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { console.log(`${new Date().toISOString()} stopping (${sig})`); process.exit(0); });
  process.on('uncaughtException', (e) => { console.error(`${new Date().toISOString()} fatal: ${e && e.message}`); process.exit(1); });
}
