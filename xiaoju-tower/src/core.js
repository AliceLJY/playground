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
    settleSpeed: 5,                 // m/s: letting go mid-column moves onto the nearest ring (up or down)
    nodeTol: 0.35,                  // m: counts as standing on a ring node
    stamina: 100,
    drainClimb: 6,
    drainHang: 1.5,
    drainBrace: 4,
    restRate: 16,
    leanIn: 0.8,
    leanOut: 1.4,
    checkpoints: [17, 34, 43],      // ring indices nearest the real stops: Spider Walk 168 m / 334.4 m, revolving restaurant 422.8 m
    checkpointNames: ['蜘蛛侠栈道入口', '蜘蛛侠栈道出口', '旋转餐厅'],
    checkpointRealY: [168, 334, 423],
    // black kite (黑鸢, recorded at Haizhu Wetland): locks onto your column, dives after the warning; move to another column to dodge
    kite: { warn: 2.0, minY: 90, firstAt: 28, minGap: 16, maxGap: 26, clearOfGust: 3.5, penalty: 20 },
    gust: { warn: 1.6, len: 1.4, grace: 0.15, minGap: 10, maxGap: 18, firstAt: 9, penalty: 25 },
    pigeon: { penalty: 20, base: 0.025, perRing: 0.0024, hopMin: 8, hopMax: 14, safeBelow: 3 },
    // 蜘蛛侠栈道 (Spider Walk, real 168–334.4 m): an open-air spiral stair inside the mesh. Slower, but no wind and no kites reach you there.
    stairs: { fromK: 17, toK: 34, speed: 1.45, regen: 4 },
    // 旋转餐厅 (422.8 m): one snack raises the stamina cap for the overhang to the top.
    snack: { k: 43, bonus: 30, eatTime: 2.5, names: { shuangpinai: '双皮奶', xiajiao: '虾饺' } },
    // 三花姐 races on the column to the screen-LEFT of 小橘 (column +1, see the ← note in step()).
    rival: { col: 1, seedOffset: 1000 },
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
  function makeKites(seed, gusts, horizon) {
    const rng = mulberry32(seed * 6271 + 3), out = [], K = CFG.kite;
    let at = K.firstAt;
    while (at < horizon) {
      // keep dives clear of gusts: you cannot brace and change column at once
      // (1e-6 tolerance: (x + w) - w can round below x and loop forever)
      let moved = true;
      while (moved) { moved = false; for (const g of gusts) if (at > g.warnAt - K.clearOfGust && at - K.warn < g.end + K.clearOfGust - 1e-6) { at = g.end + K.clearOfGust + K.warn; moved = true; } }
      out.push({ warnAt: at - K.warn, strike: at, target: null, status: null });
      at += lerp(K.minGap, K.maxGap, rng());
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
    return withKites({
      seed, time: 0, col: 0, t: 0, stamina: CFG.stamina, staminaMax: CFG.stamina, stairY: 0, ate: null, stairsUsed: 0, ownsPigeons: true,
      mode: 'climb', anim: null, checkpointK: 0, falls: 0, gustFalls: 0, pigeonHits: 0,
      gusts: makeGusts(seed, 3600), gustIdx: 0, braceSince: -1, braced: false, kiteIdx: 0, kiteHits: 0,
      pigeons: makePigeons(seed), rng: mulberry32(seed * 31 + 5),
      kites: null,
      events: [], done: false, doneAt: 0, maxY: 0, climbing: false
    });
  }
  function withKites(s) { s.kites = makeKites(s.seed, s.gusts, 3600); return s; }
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
  function kitePhase(s) {
    const k = s.kites[s.kiteIdx];
    if (!k || k.status === 'idle' || s.time < k.warnAt) return { phase: 'calm', k: k || null, p: 0 };
    if (s.time < k.strike) return { phase: 'warn', k, p: (s.time - k.warnAt) / CFG.kite.warn };
    return { phase: 'calm', k, p: 1 };
  }
  function onPlatform(s) {
    const k = atNode(s);
    return k === 0 || CFG.checkpoints.includes(k);
  }
  // inside the stair or the restaurant: wind and kites cannot reach you
  function sheltered(s) { return s.mode === 'stairs' || s.mode === 'eat'; }
  // standing at the Spider Walk entrance with the stair still ahead of you
  function atFork(s) { return s.mode === 'climb' && !s.done && atNode(s) === CFG.stairs.fromK && s.checkpointK < CFG.stairs.toK; }
  function canEat(s) { return s.mode === 'climb' && !s.done && !s.ate && atNode(s) === CFG.snack.k; }
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

    // black kite: lock a column at the warning, dive at the strike
    const kt = s.kites[s.kiteIdx];
    if (kt) {
      if (!kt.status && s.time >= kt.warnAt) {
        if (y(s) < CFG.kite.minY || s.done || sheltered(s)) kt.status = 'idle';          // too low or indoors: it just circles
        else { kt.target = s.mode === 'shift' && s.anim ? s.anim.to : s.col; kt.status = 'locked'; emit(s, 'kite-warn', { col: kt.target }); }
      }
      if (s.time >= kt.strike) {
        if (kt.status === 'locked') {
          const here = s.mode === 'shift' && s.anim ? s.anim.to : s.col;
          const safe = s.mode === 'fall' || sheltered(s) || onPlatform(s) || here !== kt.target;
          if (safe) { kt.status = 'dodged'; emit(s, 'kite-dodged', { col: kt.target }); }
          else {
            kt.status = 'hit'; s.kiteHits++; s.stamina -= CFG.kite.penalty; emit(s, 'kite-hit', { col: kt.target });
            s.kiteIdx++;
            if (s.stamina <= 0) return loseGrip(s);
            const k = atNode(s); startFall(s, k >= 0 ? Math.max(0, k - 1) : segmentOf(s), 'fall'); return s;
          }
        }
        s.kiteIdx++;
      }
    }
    // pigeon hops (a rival sharing the same pigeons leaves the hopping to the player's state)
    if (s.ownsPigeons) for (const [key, pg] of s.pigeons) {
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
      if (a.p >= 1) { s.t = a.to; s.mode = 'climb'; s.anim = null; if (a.kind === 'slide') { s.stamina = s.staminaMax; emit(s, 'recovered', { k: a.toK }); } }
      return s;
    }
    if (s.mode === 'stairs') {
      const St = CFG.stairs, top = ringY(St.toK), bottom = ringY(St.fromK);
      s.climbing = false;
      if (input.up) { s.stairY = Math.min(top, s.stairY + St.speed * dt); s.stamina += St.regen * dt; s.climbing = true; }
      else if (input.down) { s.stairY = Math.max(bottom, s.stairY - St.speed * dt); s.stamina += St.regen * dt; }
      else { s.stamina += CFG.restRate * dt; s.climbing = false; }
      s.resting = !input.up && !input.down; s.settling = false;
      s.stamina = Math.min(s.staminaMax, s.stamina);
      s.t = s.stairY / CFG.height; s.maxY = Math.max(s.maxY, s.stairY);
      if (s.stairY >= top) { s.mode = 'climb'; s.t = ringT(St.toK); emit(s, 'stairs-out'); }
      else if (input.down && s.stairY <= bottom) { s.mode = 'climb'; s.t = ringT(St.fromK); emit(s, 'stairs-back'); }
      if (s.mode === 'climb') { const k = atNode(s); if (k > s.checkpointK) { s.checkpointK = k; s.stamina = s.staminaMax; emit(s, 'checkpoint', { k }); } }
      return s;
    }
    if (s.mode === 'eat') {
      const a = s.anim; a.p += dt / CFG.snack.eatTime;
      if (a.p >= 1) { s.ate = a.name; s.staminaMax = CFG.stamina + CFG.snack.bonus; s.stamina = s.staminaMax; s.mode = 'climb'; s.anim = null; emit(s, 'snack', { name: a.name }); }
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
    // contextual action (E / on-screen button): take the stair at its entrance, or eat at the restaurant
    if (input.act && atFork(s)) {
      s.mode = 'stairs'; s.stairY = ringY(CFG.stairs.fromK); s.stairsUsed++; s.anim = null; emit(s, 'stairs-in'); return s;
    }
    if (input.act && canEat(s)) {
      const name = CFG.snack.names[input.act] ? input.act : 'shuangpinai';
      s.mode = 'eat'; s.anim = { kind: 'eat', p: 0, name }; emit(s, 'eat-start', { name }); return s;
    }
    const lm = leanMult(s.col, s.t);
    s.climbing = false; s.resting = false; s.settling = false;
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
      // seen from outside the tower, column +1 sits on the screen's LEFT, so ← goes +1 and → goes −1
      const to = mod(s.col + (input.left ? 1 : -1), CFG.cols);
      s.t = ringT(node);
      s.anim = { kind: 'shift', from: s.col, to, dir: input.left ? -1 : 1, p: 0 };
      s.mode = 'shift';
      emit(s, 'shift-start', { to });
      return s;
    } else {
      // let go = rest: snap onto a ring close by, otherwise back down onto the ring below and hold on there
      const k = nearestRing(s);
      if (Math.abs(y(s) - ringY(k)) < CFG.snap) s.t = ringT(k);
      if (atNode(s) < 0) {                           // grab whichever ring is closer, up or down
        const target = ringT(k), step = (CFG.settleSpeed * dt) / COL_LEN;
        if (target > s.t) { s.t = Math.min(target, s.t + step); s.stamina -= CFG.drainClimb * dt; }
        else s.t = Math.max(target, s.t - step);
        s.settling = true;
      } else s.settling = false;
      const n2 = atNode(s);
      if (n2 >= 0) { s.stamina += CFG.restRate * dt; s.resting = true; }
      else s.stamina -= CFG.drainHang * dt;
    }

    // platforms
    const k2 = atNode(s);
    if (k2 >= 0 && CFG.checkpoints.includes(k2) && s.checkpointK < k2) {
      s.checkpointK = k2; s.stamina = s.staminaMax; emit(s, 'checkpoint', { k: k2 });
    }
    if (k2 >= 0 && (k2 === 0 || CFG.checkpoints.includes(k2))) s.stamina = Math.max(s.stamina, Math.min(s.staminaMax, s.stamina + 30 * dt));
    s.stamina = Math.min(s.staminaMax, s.stamina);
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
  // profile: 'precise' | 'clumsy' | 'reckless' | 'rival' (三花姐) | 'cautious' (rests to full at every ring)
  // opts: { stairs: take the Spider Walk, snack: eat at the restaurant (a snack key, or true) }
  const PROFILES = {
    precise: { brace: 0, kite: () => 0.25, restBelow: () => 45, restUntil: 95, avoid: 1, wander: 0 },
    clumsy: { brace: 0.25, kite: g => Math.max(0.2, 0.9 + g * 0.5), restBelow: r => 30 + r * 15, restUntil: 80, avoid: 0.7, wander: 0.01 },
    cautious: { brace: 0, kite: () => 0.25, restBelow: () => 92, restUntil: 100, avoid: 1, wander: 0 },
    // 三花姐: strong and impatient — rests late and short, so wind and kites sometimes catch her low on stamina
    rival: { brace: 0.22, kite: g => Math.max(0.2, 0.8 + g * 0.45), restBelow: r => 18 + r * 26, restUntil: 62, avoid: 0.85, wander: 0 },
    // two more for the race tests: rests a little and early (bold) / almost never (pusher)
    bold: { brace: 0, kite: () => 0.25, restBelow: () => 30, restUntil: 70, avoid: 1, wander: 0 },
    pusher: { brace: 0, kite: () => 0.25, restBelow: () => 8, restUntil: 40, avoid: 1, wander: 0 }
  };
  function makePilot(profile, seed, opts) {
    opts = opts || {};
    const rng = mulberry32(seed * 9973 + 1), P = PROFILES[profile];
    const gauss = () => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const mem = { resting: false, braceAt: new Map(), avoidRoll: new Map(), kiteReact: new Map(), restBelow: null };
    return function pilot(s) {
      const inp = { up: false, down: false, left: false, right: false, brace: false, act: false };
      if (s.mode === 'stairs') { inp.up = true; return inp; }
      if (s.mode !== 'climb') return inp;
      if (opts.stairs && atFork(s)) { inp.act = true; return inp; }
      if (opts.snack && canEat(s)) { inp.act = opts.snack === true ? 'shuangpinai' : opts.snack; return inp; }
      if (profile === 'reckless') { inp.up = true; return inp; }
      // black kite: get onto a ring and change column before it dives
      const kp = kitePhase(s);
      if (kp.phase === 'warn' && kp.k.status === 'locked' && s.col === kp.k.target) {
        let react = mem.kiteReact.get(kp.k.strike);
        if (react === undefined) { react = kp.k.warnAt + P.kite(gauss()); mem.kiteReact.set(kp.k.strike, react); }
        if (s.time >= react) {
          const n = atNode(s);
          if (n < 0) return inp;                                   // let go: grabs the nearest ring
          const l = s.pigeons.has(n + ':' + mod(s.col + 1, CFG.cols));
          if (!l) inp.left = true; else inp.right = true;
          return inp;
        }
      }
      // bracing
      const gp = gustPhase(s);
      if (gp.g && (gp.phase === 'warn' || gp.phase === 'gust')) {
        let at = mem.braceAt.get(gp.g.start);
        if (at === undefined) {
          at = gp.g.start - 0.3 + (P.brace ? gauss() * P.brace : 0);
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
      if (mem.restBelow === null) mem.restBelow = P.restBelow(rng());
      const restUntil = P.restUntil * s.staminaMax / CFG.stamina;
      if (node >= 0 && (s.stamina < mem.restBelow || (mem.resting && s.stamina < restUntil))) { mem.resting = true; return inp; }
      if (mem.resting) mem.restBelow = null;   // roll a new threshold for the next stop
      mem.resting = false;
      // pigeon above on this column?
      if (node >= 0 && node < CFG.rings && s.pigeons.has(node + ':' + s.col)) {
        let avoid = true;
        if (P.avoid < 1) { const key = node + ':' + s.col; if (!mem.avoidRoll.has(key)) mem.avoidRoll.set(key, rng() < P.avoid); avoid = mem.avoidRoll.get(key); }
        if (avoid) {
          const l = s.pigeons.has(node + ':' + mod(s.col + 1, CFG.cols)), r = s.pigeons.has(node + ':' + mod(s.col - 1, CFG.cols));   // screen left / right
          if (!r) inp.right = true; else if (!l) inp.left = true; else inp.right = true;
          return inp;
        }
      }
      // clumsy pilots wander sometimes
      if (P.wander && node >= 0 && rng() < P.wander) { inp.left = true; return inp; }
      inp.up = true;
      void seg;
      return inp;
    };
  }
  const summary = s => ({ done: s.done, time: s.done ? s.doneAt : s.time, falls: s.falls, gustFalls: s.gustFalls, pigeonHits: s.pigeonHits, kiteHits: s.kiteHits, kiteDodged: s.events.filter(e => e.type === 'kite-dodged').length, maxY: s.maxY, checkpointK: s.checkpointK, stairsUsed: s.stairsUsed, ate: s.ate, staminaMax: s.staminaMax, events: s.events });
  function simulate(seed, profile, maxSeconds = 900, dt = 1 / 30, opts) {
    const s = createState(seed), pilot = makePilot(profile, seed, opts);
    while (!s.done && s.time < maxSeconds) step(s, pilot(s), dt);
    return summary(s);
  }

  // ---------- race against 三花姐 ----------
  // Same tower, same wind, same pigeons; her own black kite. She starts on the column to 小橘's screen-left.
  function createRival(player) {
    const r = createState(player.seed + CFG.rival.seedOffset);
    r.col = CFG.rival.col;
    r.gusts = player.gusts.map(g => ({ warnAt: g.warnAt, start: g.start, end: g.end, dir: g.dir }));
    r.kites = makeKites(r.seed, r.gusts, 3600);
    r.pigeons = player.pigeons; r.ownsPigeons = false;
    return r;
  }
  // height gap in metres, positive = 三花姐 ahead
  function raceGap(player, rival) { return y(rival) - y(player); }
  function raceResult(player, rival) {
    if (!player.done) return null;
    const won = !rival.done || player.doneAt <= rival.doneAt;
    return { won, margin: rival.done ? Math.abs(rival.doneAt - player.doneAt) : null, rivalY: y(rival) };
  }
  function simulateRace(seed, profile, opts, maxSeconds = 900, dt = 1 / 30) {
    const p = createState(seed), r = createRival(p);
    const pp = makePilot(profile, seed, opts), rp = makePilot('rival', seed + CFG.rival.seedOffset, { snack: 'xiajiao' });
    while (!p.done && p.time < maxSeconds) { step(p, pp(p), dt); step(r, rp(r), dt); }
    while (!r.done && r.time < maxSeconds) step(r, rp(r), dt);      // let her finish so both times are known
    return { player: summary(p), rival: summary(r), won: p.done && (!r.done || p.doneAt <= r.doneAt) };
  }

  // ---------- after the top: bubble tram or the drop ride, then the 488 m outdoor deck ----------
  // Heights from the scenic-area pages: the tram runs round the rim at about 450–460 m (sources differ),
  // 极速云霄 rides the antenna between 455 and 485 m, the outdoor deck is at 488 m.
  const FINALE = { tram: { dur: 9, y0: 450, y1: 460 }, drop: { dur: 7, y0: 455, y1: 485 }, deckY: 488, deckDur: 2.5 };
  function finalePose(kind, t) {
    const F = FINALE[kind];
    if (!F) throw new Error('unknown ride ' + kind);
    if (t >= F.dur + FINALE.deckDur) return { phase: 'postcard', y: FINALE.deckY, angle: 0, done: true };
    if (t >= F.dur) return { phase: 'deck', y: FINALE.deckY, angle: 0, p: (t - F.dur) / FINALE.deckDur, done: false };
    const u = t / F.dur;
    if (kind === 'tram') {   // one slow lap; the track tilts, so the cabin rises on one side and dips on the other
      const angle = u * Math.PI * 2;
      return { phase: 'ride', y: lerp(F.y0, F.y1, 0.5 - 0.5 * Math.cos(angle)), angle, p: u, done: false };
    }
    // drop: 3.2 s winch up, 0.8 s hang, 1.2 s free fall, then bounce and settle
    const up = 3.2 / F.dur, hang = 4 / F.dur, fall = 5.2 / F.dur;
    let yy;
    if (u < up) yy = lerp(F.y0, F.y1, smoothstep(u / up));
    else if (u < hang) yy = F.y1;
    else if (u < fall) { const f = (u - hang) / (fall - hang); yy = lerp(F.y1, F.y0 + 2, f * f); }
    else { const f = (u - fall) / (1 - fall); yy = F.y0 + 2 + Math.sin(f * Math.PI * 3) * 3 * (1 - f); }
    return { phase: u >= hang && u < fall ? 'falling' : 'ride', y: yy, angle: 0, p: u, done: false };
  }
  function smoothstep(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

  // ---------- time of day and tower lights follow Guangzhou time (UTC+8) ----------
  // day 06:00–16:59, dusk 17:00–18:59 (the sky darkens as you climb), night 19:00–05:59.
  function timeMode(hour) {
    const h = ((hour % 24) + 24) % 24;
    if (h >= 6 && h < 17) return 'day';
    if (h >= 17 && h < 19) return 'dusk';
    return 'night';
  }
  function gzClock(date) {
    const d = date || new Date();
    const ms = d.getTime() + 8 * 3600e3;           // Guangzhou has no daylight saving
    const secOfDay = Math.floor(ms / 1000) % 86400;
    return { hour: Math.floor(secOfDay / 3600), sec: secOfDay };
  }
  // Map climb progress (0..1 of the height reached) to the sky curve (0 = afternoon, 1 = deep night).
  function skyProgress(mode, f) {
    f = clamp(f, 0, 1);
    if (mode === 'day') return f * 0.28;
    if (mode === 'night') return 0.9 + f * 0.1;
    return f;
  }
  // The clock the tower "sees", in Guangzhou seconds of day. Following the real clock uses it directly;
  // a mode picked by hand stands in for a typical moment of that period. Dusk runs 17:30 → 19:30 as you climb.
  function virtualSec(mode, following, realSec, f) {
    if (mode === 'dusk') return (17.5 + 2 * clamp(f, 0, 1)) * 3600;
    if (following) return realSec;
    return mode === 'day' ? 14 * 3600 : 20.5 * 3600;
  }
  // Canton Tower lights: on 19:00–23:00 (inferred from the 2023 Spring Festival notice "19:00-24:00（延迟1小时）").
  const LIGHTS = { on: 19 * 3600, off: 23 * 3600, chapterLen: 260 / 6 };
  const BAY_CHAPTERS = ['潮涌', '蹁跹', '聚势', '同心', '星河', '华章'];
  function lightsOn(sec) { return sec >= LIGHTS.on && sec < LIGHTS.off; }
  // 「湾区新韵」(about 4 min 20 s, six chapters) alternates with the classic programme.
  function lightProgram(sec) {
    if (!lightsOn(sec)) return { on: false };
    const t = sec - LIGHTS.on, cycle = 520, inCycle = t % cycle;
    if (inCycle >= 260) return { on: true, program: 'classic', chapter: -1, local: (inCycle - 260) / 260 };
    const ch = Math.min(5, Math.floor(inCycle / LIGHTS.chapterLen));
    return { on: true, program: 'bay', chapter: ch, name: BAY_CHAPTERS[ch], local: (inCycle - ch * LIGHTS.chapterLen) / LIGHTS.chapterLen };
  }

  const API = { CFG, mulberry32, colPoint, colEnds, colLength, COL_LEN, radiusAt, outward, leanAt, leanMult, waist, ringT, ringY,
    makeGusts, makeKites, kitePhase, makePigeons, createState, step, gustPhase, atNode, segmentOf, onPlatform, sheltered, atFork, canEat, makePilot, simulate,
    createRival, raceGap, raceResult, simulateRace, FINALE, finalePose, PROFILES, y, timeMode, skyProgress, gzClock, virtualSec, lightsOn, lightProgram, LIGHTS, BAY_CHAPTERS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.XJT = API;
})(typeof self !== 'undefined' ? self : this);
