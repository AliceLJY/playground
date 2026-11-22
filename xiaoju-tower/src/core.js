(function (root) {
  'use strict';
  // Pure game logic for 小橘爬塔: tower geometry, climbing state machine, hazards, autopilots.
  // No DOM, no three.js — runs in Node tests and in the page.

  const CFG = {
    cols: 24,
    rings: 46,
    height: 454,
    bottom: { a: 40, b: 30 },
    top: { a: 27, b: 20.5 },
    twist: Math.PI * 0.75,          // 135°
    climbSpeed: 3.0,                // m/s along the column
    downSpeed: 4.0,
    shiftTime: 0.5,
    snap: 0.8,                      // m: releasing ↑ this close to a ring snaps onto it
    nodeTol: 0.35,                  // m: counts as standing on a ring node
    stamina: 100,
    drainClimb: 6,
    drainHang: 1.5,
    drainBrace: 4,
    restRate: 16,
    leanIn: 0.8,
    leanOut: 1.4,
    checkpoints: [11, 23, 34],      // ring indices ≈ 110 m, 227 m, 336 m
    gust: { warn: 1.6, len: 1.4, grace: 0.15, minGap: 10, maxGap: 18, firstAt: 9, penalty: 25 },
    pigeon: { penalty: 20, base: 0.025, perRing: 0.0024, hopMin: 8, hopMax: 14, safeBelow: 3 },
    fallTime: 0.7,
    slideTime: 2.2,
    bumpTime: 0.45
  };

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const lerp = (a, b, t) => a + (b - a) * t;
  const mod = (n, m) => ((n % m) + m) % m;

  // ---------- geometry ----------
  function colAngle(c) { return (2 * Math.PI * c) / CFG.cols; }
  function colEnds(c) {
    const th = colAngle(c), tw = th + CFG.twist;
    return {
      p0: { x: CFG.bottom.a * Math.cos(th), y: 0, z: CFG.bottom.b * Math.sin(th) },
      p1: { x: CFG.top.a * Math.cos(tw), y: CFG.height, z: CFG.top.b * Math.sin(tw) }
    };
  }
  const ENDS = Array.from({ length: CFG.cols }, (_, c) => colEnds(c));
  function colPoint(c, t) {
    const e = ENDS[mod(c, CFG.cols)];
    return { x: lerp(e.p0.x, e.p1.x, t), y: lerp(e.p0.y, e.p1.y, t), z: lerp(e.p0.z, e.p1.z, t) };
  }
  function colLength(c) {
    const e = ENDS[mod(c, CFG.cols)];
    return Math.hypot(e.p1.x - e.p0.x, e.p1.y - e.p0.y, e.p1.z - e.p0.z);
  }
  const COL_LEN = colLength(0);
  function radiusAt(c, t) { const p = colPoint(c, t); return Math.hypot(p.x, p.z); }
  // Horizontal outward unit vector at a point on the column.
  function outward(c, t) {
    const p = colPoint(c, t), r = Math.hypot(p.x, p.z) || 1;
    return { x: p.x / r, y: 0, z: p.z / r };
  }
  // dr/dy along the column: <0 the column leans in (slab), >0 leans out (overhang).
  function leanAt(c, t) {
    const dt = 0.002, r0 = radiusAt(c, clamp(t - dt, 0, 1)), r1 = radiusAt(c, clamp(t + dt, 0, 1));
    return (r1 - r0) / (CFG.height * (clamp(t + dt, 0, 1) - clamp(t - dt, 0, 1)));
  }
  function leanMult(c, t) {
    const l = leanAt(c, t);
    const s = clamp(0.5 + l * 6, 0, 1); // smooth around vertical
    return lerp(CFG.leanIn, CFG.leanOut, s);
  }
  function waist() {
    let best = { r: Infinity, t: 0 };
    for (let i = 0; i <= 1000; i++) {
      const t = i / 1000;
      let r = 0; for (let c = 0; c < CFG.cols; c++) r += radiusAt(c, t);
      r /= CFG.cols;
      if (r < best.r) best = { r, t };
    }
    return best;
  }
  const ringT = k => k / CFG.rings;
  const ringY = k => ringT(k) * CFG.height;

  // ---------- hazards ----------
  function makeGusts(seed, horizon) {
    const rng = mulberry32(seed * 7919 + 13), out = [];
    let at = CFG.gust.firstAt;
    while (at < horizon) {
      out.push({ warnAt: at - CFG.gust.warn, start: at, end: at + CFG.gust.len, dir: rng() < 0.5 ? -1 : 1 });
      at += CFG.gust.len + lerp(CFG.gust.minGap, CFG.gust.maxGap, rng());
    }
    return out;
  }
  function makePigeons(seed) {
    const rng = mulberry32(seed * 104729 + 7), map = new Map();
    for (let k = CFG.pigeon.safeBelow; k < CFG.rings; k++) {
      if (CFG.checkpoints.includes(k)) continue;           // segment right above a platform stays clear
      const p = CFG.pigeon.base + CFG.pigeon.perRing * k;
      for (let c = 0; c < CFG.cols; c++) if (rng() < p) map.set(k + ':' + c, { k, c, hop: lerp(CFG.pigeon.hopMin, CFG.pigeon.hopMax, rng()) });
    }
    return map;
  }

  // ---------- state ----------
  function createState(seed = 1) {
    return {
      seed, time: 0, col: 0, t: 0, stamina: CFG.stamina,
      mode: 'climb', anim: null, checkpointK: 0, falls: 0, gustFalls: 0, pigeonHits: 0,
      gusts: makeGusts(seed, 3600), gustIdx: 0, braceSince: -1, braced: false,
      pigeons: makePigeons(seed), rng: mulberry32(seed * 31 + 5),
      events: [], done: false, doneAt: 0, maxY: 0, climbing: false
    };
  }
  function y(s) { return s.t * CFG.height; }
  function nearestRing(s) { return Math.round(s.t * CFG.rings); }
  function atNode(s) { const k = nearestRing(s); return Math.abs(y(s) - ringY(k)) < CFG.nodeTol ? k : -1; }
  function segmentOf(s) { return Math.floor(s.t * CFG.rings + 1e-9); }
  function currentGust(s) {
    const g = s.gusts[s.gustIdx];
    return g || null;
  }
  function gustPhase(s) {
    const g = currentGust(s);
    if (!g) return { phase: 'calm', g: null, p: 0 };
    if (s.time < g.warnAt) return { phase: 'calm', g, p: 0 };
    if (s.time < g.start) return { phase: 'warn', g, p: (s.time - g.warnAt) / CFG.gust.warn };
    if (s.time < g.end) return { phase: 'gust', g, p: (s.time - g.start) / CFG.gust.len };
    return { phase: 'calm', g, p: 1 };
  }
  function onPlatform(s) {
    const k = atNode(s);
    return k === 0 || CFG.checkpoints.includes(k);
  }
  function emit(s, type, data) { s.events.push(Object.assign({ type, at: s.time }, data || {})); }

  function startFall(s, toK, kind) {
    s.anim = { kind, from: s.t, to: ringT(toK), toK, p: 0, dur: kind === 'slide' ? CFG.slideTime : kind === 'bump' ? CFG.bumpTime : CFG.fallTime };
    s.mode = 'fall';
  }

  function step(s, input, dt) {
    if (s.done) { s.time += dt; return s; }
    s.time += dt;
    input = input || {};

    // advance gust schedule
    while (s.gusts[s.gustIdx] && s.time >= s.gusts[s.gustIdx].end) {
      s.gustIdx++;
    }
    // brace bookkeeping
    if (input.brace && !s.braced) { s.braced = true; s.braceSince = s.time; }
    if (!input.brace) s.braced = false;

    // pigeon hops
    for (const [key, pg] of s.pigeons) {
      pg.hop -= dt;
      if (pg.hop <= 0) {
        const nc = mod(pg.c + (s.rng() < 0.5 ? -1 : 1), CFG.cols), nk = pg.k + ':' + nc;
        const playerHere = segmentOf(s) === pg.k && (s.col === nc);
        if (!s.pigeons.has(nk) && !playerHere) { s.pigeons.delete(key); pg.c = nc; s.pigeons.set(nk, pg); }
        pg.hop = lerp(CFG.pigeon.hopMin, CFG.pigeon.hopMax, s.rng());
      }
    }

    // animations (fall / slide / bump / shift)
    if (s.mode === 'fall') {
      const a = s.anim; a.p += dt / a.dur;
      s.t = lerp(a.from, a.to, Math.min(1, a.p * a.p));
      if (a.p >= 1) { s.t = a.to; s.mode = 'climb'; s.anim = null; if (a.kind === 'slide') { s.stamina = CFG.stamina; emit(s, 'recovered', { k: a.toK }); } }
      return s;
    }
    if (s.mode === 'shift') {
      const a = s.anim; a.p += dt / CFG.shiftTime;
      s.stamina -= CFG.drainHang * dt;
      if (a.p >= 1) { s.col = a.to; s.mode = 'climb'; s.anim = null; emit(s, 'shifted', { col: s.col }); }
      return s;
    }

    // gust resolution (only at the instant it starts)
    // Gust: must be bracing when it starts (or within the grace window) and keep bracing until it ends.
    const gp = gustPhase(s);
    if (gp.phase === 'gust' && gp.g.status !== 'failed' && gp.g.status !== 'held-out') {
      const g = gp.g, safe = onPlatform(s);
      if (!g.status) g.status = safe || s.braced ? 'holding' : 'grace';
      if (g.status === 'grace' && (s.braced || safe)) { g.status = 'holding'; g.late = true; }
      const fail = (g.status === 'grace' && s.time > g.start + CFG.gust.grace) || (g.status === 'holding' && !s.braced && !safe);
      if (fail) {
        g.status = 'failed';
        const k = atNode(s), below = k >= 0 ? Math.max(0, k - 1) : segmentOf(s);
        s.stamina -= CFG.gust.penalty; s.gustFalls++;
        emit(s, 'gust-fall');
        if (s.stamina <= 0) return loseGrip(s);
        startFall(s, below, 'fall');
        return s;
      }
      if (g.status === 'holding' && s.time + dt >= g.end) { g.status = 'held-out'; emit(s, 'gust-held', { late: !!g.late }); }
    }

    // movement
    const node = atNode(s);
    const lm = leanMult(s.col, s.t);
    s.climbing = false;
    if (s.braced) {
      s.stamina -= CFG.drainBrace * dt;
    } else if (input.up) {
      s.climbing = true;
      const before = y(s);
      s.t = clamp(s.t + (CFG.climbSpeed * dt) / COL_LEN, 0, 1);
      s.stamina -= CFG.drainClimb * lm * dt;
      // entering a pigeon segment?
      const seg = Math.floor((before / CFG.height) * CFG.rings + 1e-9);
      const enterY = ringY(seg) + 1.0;
      if (before < enterY && y(s) >= enterY && s.pigeons.has(seg + ':' + s.col)) {
        s.pigeons.delete(seg + ':' + s.col);
        s.stamina -= CFG.pigeon.penalty; s.pigeonHits++;
        emit(s, 'pigeon', { k: seg, col: s.col });
        if (s.stamina <= 0) return loseGrip(s);
        startFall(s, seg, 'bump');
        return s;
      }
    } else if (input.down) {
      s.t = clamp(s.t - (CFG.downSpeed * dt) / COL_LEN, 0, 1);
      s.stamina -= CFG.drainHang * dt;
    } else if ((input.left || input.right) && node >= 0) {
      const to = mod(s.col + (input.left ? -1 : 1), CFG.cols);
      s.t = ringT(node);
      s.anim = { kind: 'shift', from: s.col, to, dir: input.left ? -1 : 1, p: 0 };
      s.mode = 'shift';
      emit(s, 'shift-start', { to });
      return s;
    } else {
      // idle: snap onto a nearby ring
      const k = nearestRing(s);
      if (Math.abs(y(s) - ringY(k)) < CFG.snap) s.t = ringT(k);
      const n2 = atNode(s);
      if (n2 >= 0) s.stamina += CFG.restRate * dt;
      else s.stamina -= CFG.drainHang * dt;
    }

    // platforms
    const k2 = atNode(s);
    if (k2 >= 0 && CFG.checkpoints.includes(k2) && s.checkpointK < k2) {
      s.checkpointK = k2; s.stamina = CFG.stamina; emit(s, 'checkpoint', { k: k2 });
    }
    if (k2 >= 0 && (k2 === 0 || CFG.checkpoints.includes(k2))) s.stamina = Math.max(s.stamina, Math.min(CFG.stamina, s.stamina + 30 * dt));
    s.stamina = Math.min(CFG.stamina, s.stamina);
    s.maxY = Math.max(s.maxY, y(s));
    if (s.t >= 1) { s.done = true; s.doneAt = s.time; emit(s, 'top'); return s; }
    if (s.stamina <= 0) return loseGrip(s);
    return s;
  }
  function loseGrip(s) {
    s.stamina = 0; s.falls++;
    emit(s, 'lost-grip', { to: s.checkpointK });
    startFall(s, s.checkpointK, 'slide');
    return s;
  }

  // ---------- autopilots (tests + demo) ----------
  // profile: 'precise' | 'clumsy' | 'reckless'
  function makePilot(profile, seed) {
    const rng = mulberry32(seed * 9973 + 1);
    const gauss = () => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const mem = { resting: false, braceAt: new Map(), avoidRoll: new Map() };
    return function pilot(s) {
      const inp = { up: false, down: false, left: false, right: false, brace: false };
      if (s.mode !== 'climb') return inp;
      if (profile === 'reckless') { inp.up = true; return inp; }
      // bracing
      const gp = gustPhase(s);
      if (gp.g && (gp.phase === 'warn' || gp.phase === 'gust')) {
        let at = mem.braceAt.get(gp.g.start);
        if (at === undefined) {
          at = gp.g.start - 0.3 + (profile === 'clumsy' ? gauss() * 0.25 : 0);
          mem.braceAt.set(gp.g.start, at);
        }
        if (s.time >= at && s.time < gp.g.end) { inp.brace = true; return inp; }
        if (gp.phase === 'warn' && s.time < at) {
          // precise pilots stop on a node before the gust if close
          return inp;
        }
      }
      const node = atNode(s);
      const seg = segmentOf(s);
      // resting
      const restBelow = profile === 'clumsy' ? 30 + rng() * 15 : 45;
      const restUntil = profile === 'clumsy' ? 80 : 95;
      if (node >= 0 && (s.stamina < restBelow || (mem.resting && s.stamina < restUntil))) { mem.resting = true; return inp; }
      mem.resting = false;
      // pigeon above on this column?
      if (node >= 0 && node < CFG.rings && s.pigeons.has(node + ':' + s.col)) {
        let avoid = true;
        if (profile === 'clumsy') { const key = node + ':' + s.col; if (!mem.avoidRoll.has(key)) mem.avoidRoll.set(key, rng() < 0.7); avoid = mem.avoidRoll.get(key); }
        if (avoid) {
          const l = s.pigeons.has(node + ':' + mod(s.col - 1, CFG.cols)), r = s.pigeons.has(node + ':' + mod(s.col + 1, CFG.cols));
          if (!r) inp.right = true; else if (!l) inp.left = true; else inp.right = true;
          return inp;
        }
      }
      // clumsy pilots wander sometimes
      if (profile === 'clumsy' && node >= 0 && rng() < 0.01) { inp.left = true; return inp; }
      inp.up = true;
      void seg;
      return inp;
    };
  }
  function simulate(seed, profile, maxSeconds = 900, dt = 1 / 30) {
    const s = createState(seed), pilot = makePilot(profile, seed);
    while (!s.done && s.time < maxSeconds) step(s, pilot(s), dt);
    return { done: s.done, time: s.done ? s.doneAt : s.time, falls: s.falls, gustFalls: s.gustFalls, pigeonHits: s.pigeonHits, maxY: s.maxY, checkpointK: s.checkpointK, events: s.events };
  }

  // ---------- time of day follows the player's clock ----------
  // day 06:00–16:59, dusk 17:00–18:59 (the sky darkens as you climb), night 19:00–05:59.
  function timeMode(hour) {
    const h = ((hour % 24) + 24) % 24;
    if (h >= 6 && h < 17) return 'day';
    if (h >= 17 && h < 19) return 'dusk';
    return 'night';
  }
  // Map climb progress (0..1 of the height reached) to the sky curve used by the renderer (0 = afternoon, 1 = deep night).
  function skyProgress(mode, f) {
    f = clamp(f, 0, 1);
    if (mode === 'day') return f * 0.28;
    if (mode === 'night') return 0.9 + f * 0.1;
    return f;
  }

  const API = { CFG, mulberry32, colPoint, colEnds, colLength, COL_LEN, radiusAt, outward, leanAt, leanMult, waist, ringT, ringY,
    makeGusts, makePigeons, createState, step, gustPhase, atNode, segmentOf, onPlatform, makePilot, simulate, y, timeMode, skyProgress };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.XJT = API;
})(typeof self !== 'undefined' ? self : this);
