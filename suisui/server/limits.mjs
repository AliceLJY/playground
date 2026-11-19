// 碎碎平安 room · limits shared by the Node server (room-server.mjs) and the Cloudflare Durable Object (../worker/).
// Pure: no Node or Workers APIs.
export const LIMIT = {
  people: 50, conns: 60, perAddr: 4, handshakesPerSec: 10,
  msgsPerSec: 30, fingersPerSec: 15, floodMs: 3000, helloMs: 5000,
  pingEvery: 15000, silentMs: 40000, tickMs: 100,
};
export const ORIGINS = [/^https:\/\/aliceljy\.github\.io$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/, /^http:\/\/localhost(:\d+)?$/];

// Token bucket. `flooding(windowMs)` is true when more messages were dropped in the window than the bucket would
// have allowed in it, i.e. someone keeps sending at twice the limit or more. (Timing "since it first ran dry" does
// not work: a refill every 1/rate seconds resets it, so a flood just above the rate was never cut off.)
export class Bucket {
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
