// 碎碎平安 room on Cloudflare: https://suisui.aliceljy.xyz/room/ws
// Why here and not on the mini: mainland phones reached the Tailscale funnel entry in 3.5–5 s or not at all
// (2026-11-20, Globalping 6/7 at 3.5–5.3 s, her phone never), while aliceljy.xyz on Cloudflare answers in about 1–2 s.
// The Worker checks the browser origin and stamps the visitor's address (CF-Connecting-IP, set by Cloudflare, so a
// client cannot forge it); one Durable Object holds the one shared room in memory and runs the same room.mjs
// state machine and limits as the Node server. No storage, no logs of what anyone does.
import { createRoom, parse, join, leave, handle, tick, flushPointers } from '../server/room.mjs';
import { LIMIT, ORIGINS, Bucket } from '../server/limits.mjs';

const text = (body, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } });

export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);
    if (pathname === '/room/health') return text('ok');
    if (pathname !== '/room/ws') return text('not found', 404);
    if (req.headers.get('Upgrade') !== 'websocket') return text('expected a websocket', 426);
    if (!ORIGINS.some((re) => re.test(req.headers.get('Origin') || ''))) return text('Forbidden', 403);
    const room = env.ROOM.get(env.ROOM.idFromName('main'));
    return room.fetch('https://room/ws', { headers: { Upgrade: 'websocket', 'x-addr': req.headers.get('CF-Connecting-IP') || '?' } });
  },
};

export class Room {
  constructor(state, env, limits = {}) {
    this.L = { ...LIMIT, ...limits };
    // SEED only for local checks (`wrangler dev --var SEED:<n>`); the public room picks a random shelf.
    this.room = createRoom({ seed: (Number(env && env.SEED) >>> 0) || crypto.getRandomValues(new Uint32Array(1))[0] });
    this.conns = new Set();
    this.byTok = new Map();          // session token -> its one live connection
    this.handshakes = [];
    this.timers = null;
  }

  send(c, msg) { if (!c.closed) try { c.ws.send(JSON.stringify(msg)); } catch { this.gone(c); } }
  deliver(o) {
    for (const [tok, msg] of o.to) { const c = this.byTok.get(tok); if (c) this.send(c, msg); }
    for (const msg of o.all) for (const c of this.conns) if (c.tok) this.send(c, msg);
  }
  close(c, code = 1000) {
    if (c.closed) return;
    c.closed = true;
    try { c.ws.close(code); } catch { /* already gone */ }
    this.gone(c);
  }
  gone(c) {
    if (!this.conns.delete(c)) return;
    clearTimeout(c.hello); c.closed = true;
    if (c.tok && this.byTok.get(c.tok) === c) this.byTok.delete(c.tok);
    if (c.tok && !c.replaced) this.deliver(leave(this.room, c.tok));
    if (!this.conns.size) this.stop();
  }

  // Clock ticks only while someone is connected, so an empty room costs nothing and the object can sleep.
  start() {
    if (this.timers) return;
    this.timers = [
      setInterval(() => { this.deliver(tick(this.room)); const P = flushPointers(this.room); if (P) this.deliver({ to: [], all: [P] }); }, this.L.tickMs),
      // Workers cannot send ping frames; the page sends {"t":"k"} every 15 s instead. Silent longer than that: gone.
      setInterval(() => { const t = Date.now(); for (const c of this.conns) if (t - c.seen > this.L.silentMs) this.close(c, 1001); }, this.L.pingEvery),
    ];
  }
  stop() { if (this.timers) { this.timers.forEach(clearInterval); this.timers = null; } }

  onText(c, data) {
    c.seen = Date.now();
    if (typeof data !== 'string') return this.close(c, 1003);
    if (!c.msgs.take()) { if (c.msgs.flooding(this.L.floodMs)) this.close(c, 1008); return; }
    const m = parse(data);
    if (!m) return;                                         // anything off-whitelist is dropped silently
    const R = this.room;
    if (!c.tok) {
      if (m.t !== 'hi') return;
      const known = m.tok && R.sessions.get(m.tok);
      const live = [...R.sessions.values()].filter((s) => s.live).length;
      if (!known && live >= this.L.people) { this.send(c, { t: 'F' }); return this.close(c, 1013); }
      const old = known && this.byTok.get(m.tok);
      if (old && old !== c) { old.replaced = true; this.close(old, 1000); }   // same visitor, newer tab wins
      const r = join(R, m);
      c.tok = r.me.tok; this.byTok.set(c.tok, c); clearTimeout(c.hello);
      return this.deliver(r.o);
    }
    if (m.t === 'hi' || m.t === 'k') return;
    if (m.t === 'p' && !c.fingers.take()) return;
    this.deliver(handle(R, c.tok, m));
  }

  async fetch(req) {
    const L = this.L, t = Date.now();
    this.handshakes = this.handshakes.filter((x) => t - x < 1000);
    if (this.handshakes.length >= L.handshakesPerSec || this.conns.size >= L.conns) return text('Busy', 503);
    const addr = req.headers.get('x-addr') || '?';
    if ([...this.conns].filter((c) => c.addr === addr).length >= L.perAddr) return text('Too Many', 429);
    this.handshakes.push(t);

    const [client, ws] = Object.values(new WebSocketPair());
    ws.accept();
    const c = { ws, addr, tok: null, closed: false, replaced: false, seen: t, msgs: new Bucket(L.msgsPerSec), fingers: new Bucket(L.fingersPerSec) };
    this.conns.add(c);
    this.start();
    c.hello = setTimeout(() => { if (!c.tok) this.close(c, 1008); }, L.helloMs);
    ws.addEventListener('message', (e) => this.onText(c, e.data));
    ws.addEventListener('close', () => { if (!c.closed) { c.closed = true; try { ws.close(1000); } catch { /* fine */ } } this.gone(c); });
    ws.addEventListener('error', () => this.gone(c));
    return new Response(null, { status: 101, webSocket: client });
  }
}
