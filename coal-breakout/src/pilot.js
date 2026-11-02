(function (root) {
  'use strict';
  // Input producer only; never writes game state or bypasses its rules.
  function create(mode = 'precise', seed = 1) {
    let rng = (seed ^ 0x9e3779b9) >>> 0, next = 0, angle = 0;
    const out = new Float64Array([0, 0, -2]);
    function random() { rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5; return (rng >>> 0) / 4294967296; }
    return function drive(s) {
      out[2] = -2;
      if (s.phase === 1) {
        const priorities = [8, 10, 7, 6, 5, 4, 3, 7];
        let best = -Infinity, pick = -1;
        for (let i = 0; i < 3; i++) {
          const c = s.offer[i]; if (c < 0) continue;
          const value = priorities[c] - s.cards[c] * 2 + (c === 5 && s.hp <= 2 ? 6 : 0);
          if (value > best) { best = value; pick = i; }
        }
        out[2] = pick; return out;
      }
      if (mode === 'reckless') {
        let best = Infinity, ex = 180, ey = 30;
        for (let i = 0; i < s.eOn.length; i++) if (s.eOn[i]) {
          const d = Math.hypot(s.ex[i] - s.x, s.ey[i] - s.y);
          if (d < best) { best = d; ex = s.ex[i]; ey = s.ey[i]; }
        }
        const d = Math.hypot(ex - s.x, ey - s.y) || 1;
        out[0] = (ex - s.x) / d; out[1] = (ey - s.y) / d; return out;
      }
      if (s.tick < next) return out;
      next = s.tick + (mode === 'human' ? 20 : mode === 'random' ? 42 : 8);
      let tx = 180 + Math.cos(s.tick / 160) * 95, ty = 260 + Math.sin(s.tick / 160) * 145, bestGem = Infinity;
      for (let i = 0; i < s.gOn.length; i++) if (s.gOn[i] && (!s.gFake[i] || mode === 'random')) {
        let d = Math.hypot(s.gx[i] - s.x, s.gy[i] - s.y);
        // Prefer safe experience; do not walk into the boss for a gem.
        for (let j = 0; j < s.eOn.length; j++) if (s.eOn[j] && Math.abs(s.ex[j] - s.gx[i]) < 38 && Math.abs(s.ey[j] - s.gy[i]) < 38) d += 90;
        if (d < bestGem) { bestGem = d; tx = s.gx[i]; ty = s.gy[i]; }
      }
      let best = -Infinity, bx = 0, by = 0;
      for (let k = 0; k < 16; k++) {
        const a = k * Math.PI / 8, dx = Math.cos(a), dy = Math.sin(a);
        const px = s.x + dx * 30, py = s.y + dy * 30;
        let score = -Math.hypot(px - tx, py - ty) * .65;
        const edge = Math.min(px - 18 - s.wall, 342 - s.wall - px, py - 30 - s.wall, 500 - s.wall - py);
        if (edge < 12) score -= (12 - edge) * 12;
        for (let i = 0; i < s.eOn.length; i++) if (s.eOn[i]) {
          const d = Math.hypot(px - s.ex[i], py - s.ey[i]) - s.er[i];
          if (d < 65) score -= (65 - d) ** 2 * (mode === 'random' ? .017 : .09);
        }
        for (let i = 0; i < s.zOn.length; i++) if (s.zOn[i] && Math.abs(px - s.zx[i]) < 60 && Math.abs(py - s.zy[i]) < 60) score -= 500;
        if (score > best) { best = score; bx = dx; by = dy; }
      }
      angle = Math.atan2(by, bx);
      if (mode !== 'precise') {
        // Box–Muller normal steering error; independent of game RNG.
        const z = Math.sqrt(-2 * Math.log(Math.max(.00001, random()))) * Math.cos(2 * Math.PI * random());
        angle += z * (mode === 'human' ? .23 : .95);
      }
      out[0] = Math.cos(angle); out[1] = Math.sin(angle);
      return out;
    };
  }
  function run(core, seed, level, mode, limit = 18000, watch) {
    const s = core.create(seed, level), p = create(mode, seed);
    for (let f = 0; f < limit && s.phase < 2; f++) { const a = p(s); core.step(s, a[0], a[1], a[2]); if (watch) watch(s, a); }
    return s;
  }
  const api = { create, run };
  if (typeof module !== 'undefined') module.exports = api; else root.CoalPilot = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
