(function (root) {
  'use strict';
  // Chapter 2 「下塔进城」 pure logic: the 1 m street grid from OSM, running and shared-bike riding with one set of keys,
  // collision, the three postcard stops, 三花姐 and the autopilots. No DOM, no three.js — runs in Node tests and the page.
  // Heading h: forward = (sin h, −cos h) in (x, z), so h = 0 faces north (−z). ← turns left on screen (h decreases).

  const SURF = { OUT: 0, ROAD: 1, GROUND: 2, GREEN: 3, WATER: 4, BUILDING: 5, FOOTBRIDGE: 6 };
  const TCFG = {
    // running: quick to start and turn, same speed everywhere you can stand (a little slower on grass)
    run: { top: 9.5, green: 0.85, accel: 24, decel: 30, back: 3, turn: 3.0, radius: 0.6 },   // radius > 0.5: the body cannot slip into the 1 m notches of a stair-stepped diagonal wall
    // shared bike: fast on roads, slower on plazas, crawls on grass; slow to pick up speed, wide turns, rolls on when you let go
    bike: { top: { 1: 15, 2: 10, 3: 7 },   // grass 7 (was 4.5, Duet round 2: a route across grass on a bike crawled) — still below running on grass (8.1)
            accel: 5.5, brake: 14, coast: 2.8, back: 1.5, turn: 1.8, turnLow: 2.6, radius: 0.7 },   // coast 2.8: let go at 15 m/s, stops in ~5 s / ~40 m (Duet: 1.0 rolled 110 m into the river)
    scanTime: 2.0, lockTime: 0.6, dockReach: 4.5, stopReach: 7, stampTime: 1.2, bumpKeep: 0.3,
    nav: 2,                              // metres per path-finding cell
    rival: { seedOffset: 2000 }
  };
  const ORDER_NAMES = ['海心沙', '西塔', '东塔'];

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const wrapAngle = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const fwd = h => ({ x: Math.sin(h), z: -Math.cos(h) });
  // what the follow camera sees: looking along the heading, screen-right = forward × up
  function screenRight(h) { const f = fwd(h); return { x: -f.z, z: f.x }; }

  // ---------- the grid ----------
  function b64(str) {
    if (typeof atob === 'function') { const s = atob(str), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
    return new Uint8Array(Buffer.from(str, 'base64'));
  }
  function decodeGrid(town) {
    const [X0, X1, Z0, Z1] = town.box, W = X1 - X0, H = Z1 - Z0, cells = new Uint8Array(W * H), raw = b64(town.rle);
    let i = 0, o = 0;
    while (i < raw.length) {
      const v = raw[i++]; let n = 0, sh = 0, b;
      do { b = raw[i++]; n |= (b & 0x7F) << sh; sh += 7; } while (b & 0x80);
      cells.fill(v, o, o + n); o += n;
    }
    if (o !== W * H) throw new Error('town grid size ' + o + ' != ' + W * H);
    return { X0, Z0, W, H, cells, town };
  }
  function surf(G, x, z) {
    const xi = Math.floor(x - G.X0), zi = Math.floor(z - G.Z0);
    return xi < 0 || zi < 0 || xi >= G.W || zi >= G.H ? SURF.OUT : G.cells[zi * G.W + xi];
  }
  const canRun = v => v === SURF.ROAD || v === SURF.GROUND || v === SURF.GREEN || v === SURF.FOOTBRIDGE;
  const canRide = v => v === SURF.ROAD || v === SURF.GROUND || v === SURF.GREEN;
  // the body is a circle: centre plus eight points on its rim must all be on passable cells
  function blockedAt(G, x, z, riding) {
    const r = riding ? TCFG.bike.radius : TCFG.run.radius, ok = riding ? canRide : canRun;
    if (!ok(surf(G, x, z))) return true;
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; if (!ok(surf(G, x + Math.cos(a) * r, z + Math.sin(a) * r))) return true; }
    return false;
  }

  // ---------- state ----------
  function createTown(G, seed, opts) {
    opts = opts || {};
    const st = G.town.start;
    return {
      seed, time: 0, x: st.x + (opts.dx || 0), z: st.z, h: 0, speed: 0, riding: false, mode: 'go', anim: null,
      stamps: [], done: false, doneAt: 0, bumps: 0, rides: 0, dist: 0, bikeDist: 0, events: [], lastBump: -9, bridgeNag: -9
    };
  }
  function emit(s, type, data) { s.events.push(Object.assign({ type, at: s.time }, data || {})); }
  function nearDock(G, s) {
    let best = null, bd = Infinity;
    for (const d of G.town.docks) { const dd = Math.hypot(d.x - s.x, d.z - s.z); if (dd < bd) { bd = dd; best = d; } }
    return bd <= TCFG.dockReach ? best : null;
  }
  function stopAt(G, s) {
    for (let i = 0; i < G.town.stops.length; i++) {
      const p = G.town.stops[i];
      if (!s.stamps.includes(i) && Math.hypot(p.x - s.x, p.z - s.z) <= TCFG.stopReach) return i;
    }
    return -1;
  }
  function topSpeed(G, s) {
    const v = surf(G, s.x, s.z);
    const p = s.power || 1;
    if (s.riding) return (TCFG.bike.top[v] || 4.5) * p;
    return TCFG.run.top * (v === SURF.GREEN ? TCFG.run.green : 1) * p;
  }
  // what E does right here: scan a bike at a dock, lock the bike you are on, or nothing
  function actionAt(G, s) {
    if (s.mode !== 'go' || s.done) return null;
    if (s.riding) return 'lock';
    return nearDock(G, s) ? 'scan' : null;
  }

  function stepTown(G, s, input, dt) {
    s.time += dt;
    if (s.done) { s.speed = 0; return s; }
    input = input || {};
    if (s.mode === 'scan' || s.mode === 'lock' || s.mode === 'stamp') {
      const a = s.anim; a.t += dt; s.speed = Math.max(0, s.speed - TCFG.bike.brake * dt);
      if (a.t >= a.dur) {
        if (s.mode === 'scan') { s.riding = true; s.rides++; emit(s, 'ride'); }
        if (s.mode === 'lock') { s.riding = false; emit(s, 'walk'); }
        if (s.mode === 'stamp' && s.stamps.length === G.town.stops.length) { s.done = true; s.doneAt = s.time; emit(s, 'done'); }
        s.mode = 'go'; s.anim = null;
      }
      return s;
    }
    const act = input.act && actionAt(G, s);
    if (act === 'scan') { s.mode = 'scan'; s.anim = { t: 0, dur: TCFG.scanTime, dock: nearDock(G, s) }; s.speed = 0; emit(s, 'scan'); return s; }
    if (act === 'lock') { s.mode = 'lock'; s.anim = { t: 0, dur: TCFG.lockTime }; emit(s, 'lock'); return s; }

    // turning: running turns on the spot; the bike turns slower the faster it goes
    const turn = s.riding ? TCFG.bike.turnLow + (TCFG.bike.turn - TCFG.bike.turnLow) * clamp(s.speed / 12, 0, 1) : TCFG.run.turn;
    if (input.left && !input.right) s.h = wrapAngle(s.h - turn * dt);
    if (input.right && !input.left) s.h = wrapAngle(s.h + turn * dt);
    const top = topSpeed(G, s);
    let target, rate;
    if (s.riding) {
      if (input.up) { target = top; rate = s.speed > top ? TCFG.bike.brake * 0.5 : TCFG.bike.accel; }
      else if (input.down) { target = s.speed > 0.3 ? 0 : -TCFG.bike.back; rate = s.speed > 0.3 ? TCFG.bike.brake : 3; }   // brake, then walk the bike back
      else { target = 0; rate = TCFG.bike.coast; }
    } else {
      if (input.up) { target = top; rate = TCFG.run.accel; }
      else if (input.down) { target = -TCFG.run.back; rate = TCFG.run.accel; }
      else { target = 0; rate = TCFG.run.decel; }
    }
    s.speed += clamp(target - s.speed, -rate * dt, rate * dt);
    // move with wall sliding
    if (Math.abs(s.speed) > 1e-4) {
      const f = fwd(s.h), dx = f.x * s.speed * dt, dz = f.z * s.speed * dt;
      // blocked straight ahead: take the wall's normal from the body's surroundings (averaged over a ring, so the 1 m
      // stair-steps of a rasterised shore read as one smooth wall), drop the part of the step that goes into it and slide
      // along the rest; then try small turns; wedged in a corner, ease out towards the open side.
      let nx = s.x + dx, nz = s.z + dz, hit = false;
      const L = Math.hypot(dx, dz);
      if (blockedAt(G, nx, nz, s.riding)) {
        hit = true; s.hits = (s.hits || 0) + 1; nx = s.x; nz = s.z;
        const r = (s.riding ? TCFG.bike.radius : TCFG.run.radius) + 0.9, ok = s.riding ? canRide : canRun;
        let wx = 0, wz = 0;
        for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a); if (!ok(surf(G, s.x + c * r, s.z + sn * r))) { wx -= c; wz -= sn; } }
        const wl = Math.hypot(wx, wz), cands = [];
        if (wl > 0.1) {
          const ux = wx / wl, uz = wz / wl, into = dx * ux + dz * uz;
          if (into < 0) { const tx = dx - into * ux, tz = dz - into * uz; cands.push([tx, tz], [tx + ux * L * 0.15, tz + uz * L * 0.15]); }
        }
        for (const a of [0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4, 1.75, -1.75]) {
          const c = Math.cos(a), sn = Math.sin(a), k = Math.max(0.6, Math.cos(a));     // keep a usable sliding speed even at a steep angle
          cands.push([(dx * c - dz * sn) * k, (dx * sn + dz * c) * k]);
        }
        // keep sliding the way it slid last frame, so a sharp tip cannot flip it back and forth on the spot
        const prev = s.time - (s.slideT || -9) < 0.25 ? s.slide : null;
        const free = cands.filter(([ux, uz]) => Math.hypot(ux, uz) > L * 0.05 && !blockedAt(G, s.x + ux, s.z + uz, s.riding));
        const pick = (prev && free.find(([ux, uz]) => ux * prev.x + uz * prev.z > 0)) || free[0];
        if (pick) { nx = s.x + pick[0]; nz = s.z + pick[1]; const pl = Math.hypot(pick[0], pick[1]); s.slide = { x: pick[0] / pl, z: pick[1] / pl }; s.slideT = s.time; }
        if (nx === s.x && nz === s.z && wl > 0.1) {      // wedged in a corner: ease out towards the open side
          const step = Math.min(0.06, L), ex = wx / wl * step, ez = wz / wl * step;
          if (!blockedAt(G, s.x + ex, s.z + ez, s.riding)) { nx = s.x + ex; nz = s.z + ez; }
        }
      }
      const moved = Math.hypot(nx - s.x, nz - s.z);
      s.dist += moved; if (s.riding) s.bikeDist += moved;
      s.x = nx; s.z = nz;
      if (hit) {
        const full = L;
        s.speed *= moved < full * 0.05 ? TCFG.bumpKeep : moved < full * 0.8 ? 0.96 : 1;     // stopped dead: lose most speed; sliding: a little
        if (moved < full * 0.3 && s.time - s.lastBump > 0.6) { s.bumps++; s.lastBump = s.time; emit(s, 'bump'); }
        if (s.riding && surf(G, s.x + f.x * 2.5, s.z + f.z * 2.5) === SURF.FOOTBRIDGE && s.time - s.bridgeNag > 3) { s.bridgeNag = s.time; emit(s, 'no-bike'); }
      }
    }
    const k = stopAt(G, s);
    if (k >= 0) { s.stamps.push(k); s.mode = 'stamp'; s.anim = { t: 0, dur: TCFG.stampTime, stop: k }; emit(s, 'stamp', { stop: k, n: s.stamps.length }); }
    return s;
  }

  // ---------- path fields: seconds-to-stop for every 2 m cell, on foot and on a bike ----------
  // One reverse Dijkstra per stop over two layers (0 on foot, 1 riding). Scanning a bike only works at a dock; locking it works anywhere.
  function buildNav(G) {
    const N = TCFG.nav, NW = Math.ceil(G.W / N), NH = Math.ceil(G.H / N), n = NW * NH;
    const walkSp = new Float32Array(n), rideSp = new Float32Array(n), dock = new Uint8Array(n);
    for (let j = 0; j < NH; j++) for (let i = 0; i < NW; i++) {
      let run = 0, ride = 0, road = 0, green = 0;
      for (let dz = 0; dz < N; dz++) for (let dx = 0; dx < N; dx++) {
        const x = i * N + dx, z = j * N + dz; if (x >= G.W || z >= G.H) continue;
        const v = G.cells[z * G.W + x];
        if (canRun(v)) run++; if (canRide(v)) ride++; if (v === SURF.ROAD) road++; if (v === SURF.GREEN) green++;
      }
      const id = j * NW + i, cx = G.X0 + (i + 0.5) * N, cz = G.Z0 + (j + 0.5) * N;
      // a cell counts only when it is all passable and the body fits at its centre, so a path never squeezes through a gap the body cannot
      if (run >= 4 && blockedAt(G, cx, cz, false)) run = 0;
      if (ride >= 4 && blockedAt(G, cx, cz, true)) ride = 0;
      if (run >= 4) walkSp[id] = TCFG.run.top * (green >= 2 ? TCFG.run.green : 1);
      // planning prices any grass at a quarter of the bike's real grass speed, so suggested bike routes keep to roads and paving (Duet round 3)
      if (ride >= 4) rideSp[id] = road >= 2 ? TCFG.bike.top[1] : green >= 1 ? TCFG.bike.top[3] * 0.25 : TCFG.bike.top[2];
    }
    // thin the passable set by the body radius: drop cells that touch a blocked neighbour (keeps paths off the walls)
    const erode = sp => { const out = sp.slice(); for (let j = 1; j < NH - 1; j++) for (let i = 1; i < NW - 1; i++) { const id = j * NW + i; if (!sp[id]) continue; if (!sp[id - 1] || !sp[id + 1] || !sp[id - NW] || !sp[id + NW]) out[id] = sp[id] * 0.55; } return out; };
    const wS = erode(walkSp), rS = erode(rideSp);
    for (const d of G.town.docks) {
      const ci = Math.floor((d.x - G.X0) / N), cj = Math.floor((d.z - G.Z0) / N), r = Math.ceil(TCFG.dockReach / N);
      for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
        if (i < 0 || j < 0 || i >= NW || j >= NH) continue;
        if (Math.hypot((i + 0.5) * N + G.X0 - d.x, (j + 0.5) * N + G.Z0 - d.z) <= TCFG.dockReach - 0.6) dock[j * NW + i] = 1;
      }
    }
    return { NW, NH, n, walkSp: wS, rideSp: rS, dock, fields: [] };
  }
  // walkOnly: the same field for someone who never takes a bike (no ride layer, no transitions)
  function field(G, nav, stopIdx, walkOnly) {
    const key = stopIdx + (walkOnly ? 10 : 0);
    if (nav.fields[key]) return nav.fields[key];
    const { NW, NH, n, walkSp, rideSp, dock } = nav, N = TCFG.nav, INF = 1e9;
    const dist = new Float32Array(2 * n).fill(INF);
    // binary heap of node ids keyed by dist (lazy deletion)
    let heap = new Int32Array(1 << 16), keys = new Float32Array(1 << 16), size = 0;
    const push = (id, k) => {
      if (size === heap.length) { const h2 = new Int32Array(size * 2), k2 = new Float32Array(size * 2); h2.set(heap); k2.set(keys); heap = h2; keys = k2; }
      let i = size++; while (i > 0) { const p = (i - 1) >> 1; if (keys[p] <= k) break; heap[i] = heap[p]; keys[i] = keys[p]; i = p; } heap[i] = id; keys[i] = k;
    };
    const pop = () => {
      const top = heap[0], lastId = heap[--size], lastK = keys[size]; let i = 0;
      while (true) { let c = 2 * i + 1; if (c >= size) break; if (c + 1 < size && keys[c + 1] < keys[c]) c++; if (keys[c] >= lastK) break; heap[i] = heap[c]; keys[i] = keys[c]; i = c; }
      heap[i] = lastId; keys[i] = lastK; return top;
    };
    const st = G.town.stops[stopIdx], ci = (st.x - G.X0) / N, cj = (st.z - G.Z0) / N, rr = (TCFG.stopReach - 1) / N;
    for (let j = Math.floor(cj - rr); j <= Math.ceil(cj + rr); j++) for (let i = Math.floor(ci - rr); i <= Math.ceil(ci + rr); i++) {
      if (i < 0 || j < 0 || i >= NW || j >= NH || Math.hypot(i + 0.5 - ci, j + 0.5 - cj) > rr) continue;
      const id = j * NW + i;
      if (walkSp[id]) { dist[id] = 0; push(id, 0); }
      if (rideSp[id] && !walkOnly) { dist[n + id] = 0; push(n + id, 0); }
    }
    const DI = [1, -1, 0, 0, 1, 1, -1, -1], DJ = [0, 0, 1, -1, 1, -1, 1, -1];
    while (size) {
      const k0 = keys[0], node = pop();
      if (k0 > dist[node]) continue;
      const layer = node >= n ? 1 : 0, id = node - layer * n, i = id % NW, j = (id - i) / NW, sp = layer ? rideSp : walkSp, s0 = sp[id];
      for (let d = 0; d < 8; d++) {
        const ni = i + DI[d], nj = j + DJ[d]; if (ni < 0 || nj < 0 || ni >= NW || nj >= NH) continue;
        const nid = nj * NW + ni, s1 = sp[nid]; if (!s1) continue;
        if (d >= 4 && (!sp[j * NW + ni] || !sp[nj * NW + i])) continue;   // no corner cutting
        const c = Math.fround(k0 + (d >= 4 ? Math.SQRT2 : 1) * N * 2 / (s0 + s1)), nn = layer * n + nid;   // fround: dist is float32, compare like for like or it never settles
        if (c < dist[nn]) { dist[nn] = c; push(nn, c); }
      }
      // reverse transitions: on foot here ← locked a bike here; riding here ← scanned a bike here (docks only)
      if (walkOnly) continue;
      if (layer === 0 && rideSp[id]) { const c = Math.fround(k0 + TCFG.lockTime), nn = n + id; if (c < dist[nn]) { dist[nn] = c; push(nn, c); } }
      if (layer === 1 && dock[id] && walkSp[id]) { const c = Math.fround(k0 + TCFG.scanTime + 0.3), nn = id; if (c < dist[nn]) { dist[nn] = c; push(nn, c); } }
    }
    nav.fields[key] = dist;
    return dist;
  }
  function navId(G, nav, x, z) {
    const i = Math.floor((x - G.X0) / TCFG.nav), j = Math.floor((z - G.Z0) / TCFG.nav);
    return i < 0 || j < 0 || i >= nav.NW || j >= nav.NH ? -1 : j * nav.NW + i;
  }
  // seconds left to a stop from here, on foot (layer 0) or on a bike (layer 1); looks at nearby cells if this one is a wall
  function timeTo(G, nav, stopIdx, x, z, layer, walkOnly) {
    const f = field(G, nav, stopIdx, walkOnly), id = navId(G, nav, x, z); if (id < 0) return 1e9;
    let v = f[layer * nav.n + id];
    if (v >= 1e9) for (let d = 1; d <= 2 && v >= 1e9; d++) for (let dj = -d; dj <= d; dj++) for (let di = -d; di <= d; di++) { const k = id + dj * nav.NW + di; if (k >= 0 && k < nav.n) v = Math.min(v, f[layer * nav.n + k] + d); }
    return v;
  }
  // where to steer next: walk down the field up to `cells` steps and keep the farthest point you can run to in a straight line
  function lookahead(G, nav, stopIdx, x, z, layer, cells, walkOnly) {
    const f = field(G, nav, stopIdx, walkOnly), off = layer * nav.n, riding = layer === 1;
    let id = navId(G, nav, x, z); if (id < 0) return null;
    if (f[off + id] >= 1e9) {     // wedged against a wall: step to the best neighbour within 2 cells
      let best = -1, bv = 1e9;
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const k = id + dj * nav.NW + di; if (k >= 0 && k < nav.n && f[off + k] < bv) { bv = f[off + k]; best = k; } }
      if (best < 0) return null; id = best;
    }
    const DI = [1, -1, 0, 0, 1, 1, -1, -1], DJ = [0, 0, 1, -1, 1, -1, 1, -1];
    const pt = k => { const i = k % nav.NW, j = (k - i) / nav.NW; return { x: G.X0 + (i + 0.5) * TCFG.nav, z: G.Z0 + (j + 0.5) * TCFG.nav, t: f[off + k] }; };
    let keep = pt(id);
    for (let s = 0; s < cells; s++) {
      const i = id % nav.NW, j = (id - i) / nav.NW; let best = id, bv = f[off + id], clearBest = -1, cv = f[off + id];
      for (let d = 0; d < 8; d++) {
        const ni = i + DI[d], nj = j + DJ[d]; if (ni < 0 || nj < 0 || ni >= nav.NW || nj >= nav.NH) continue; const k = nj * nav.NW + ni;
        if (f[off + k] < bv - 1e-6) { bv = f[off + k]; best = k; }
        if (s === 0 && f[off + k] < cv - 1e-6) { const q = pt(k); if (clearLine(G, x, z, q.x, q.z, riding)) { cv = f[off + k]; clearBest = k; } }
      }
      if (s === 0 && clearBest >= 0) best = clearBest;     // first step: the best neighbour you can actually run to
      if (best === id) break; id = best;
      const p = pt(id);
      if (s > 0 && !clearLine(G, x, z, p.x, p.z, riding)) break;    // the first step is always taken
      keep = p;
    }
    return keep;
  }
  // the whole route down a field from here, as world points (for the minimap line and the route length)
  function tracePath(G, nav, stopIdx, x, z, layer, maxCells) {
    const f = field(G, nav, stopIdx), DI = [1, -1, 0, 0, 1, 1, -1, -1], DJ = [0, 0, 1, -1, 1, -1, 1, -1], pts = [[x, z]];
    let id = navId(G, nav, x, z), off = layer * nav.n; if (id < 0) return pts;
    for (let s = 0; s < maxCells; s++) {
      const i = id % nav.NW, j = (id - i) / nav.NW; let best = id, bv = f[off + id], bo = off;
      for (let d = 0; d < 8; d++) { const ni = i + DI[d], nj = j + DJ[d]; if (ni < 0 || nj < 0 || ni >= nav.NW || nj >= nav.NH) continue; const k = nj * nav.NW + ni; if (f[off + k] < bv - 1e-6) { bv = f[off + k]; best = k; bo = off; } }
      // the cheaper way on from here is to change layer (scan a bike / lock it): follow the other layer
      const other = (1 - off / nav.n) * nav.n;
      if (best === id && f[other + id] < f[off + id] - 1e-6) { off = other; continue; }
      if (best === id) break; id = best;
      const ci = id % nav.NW, cj = (id - ci) / nav.NW; pts.push([G.X0 + (ci + 0.5) * TCFG.nav, G.Z0 + (cj + 0.5) * TCFG.nav]);
      if (f[off + id] <= 0) break;
    }
    return pts;
  }
  // riding, the straight line to steer along must also stay off grass: cutting a corner across a lawn is what put
  // Duet on the grass for 15 s following the arrow (unless she is already on grass and needs a way off)
  function clearLine(G, x0, z0, x1, z1, riding) {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(L / 0.5), onGrass = riding && surf(G, x0, z0) === SURF.GREEN;
    for (let k = 1; k <= n; k++) {
      const u = k / n, x = x0 + (x1 - x0) * u, z = z0 + (z1 - z0) * u;
      if (blockedAt(G, x, z, riding)) return false;
      if (riding && !onGrass && surf(G, x, z) === SURF.GREEN) return false;
    }
    return true;
  }
  // best order for the two towers once 海心沙 is done, judged on foot from where you stand
  function nextStop(G, nav, s, opts) {
    const left = [0, 1, 2].filter(i => !s.stamps.includes(i));
    if (!left.length) return -1;
    if (opts && opts.order) { const o = opts.order.find(i => left.includes(i)); if (o !== undefined) return o; }
    let best = left[0], bt = 1e9;
    for (const i of left) {
      const wo = opts && opts.walkOnly;
      let t = timeTo(G, nav, i, s.x, s.z, s.riding ? 1 : 0, wo);
      const rest = left.filter(k => k !== i);
      if (rest.length) { const p = G.town.stops[i]; t += Math.min(...rest.map(k => wo ? timeTo(G, nav, k, p.x, p.z, 0, true) : Math.min(timeTo(G, nav, k, p.x, p.z, 0), timeTo(G, nav, k, p.x, p.z, 1)))); }
      if (t < bt) { bt = t; best = i; }
    }
    return best;
  }

  // ---------- autopilots: they press the same keys a player does ----------
  // precise: best route, takes bikes when the field says so, no dithering.
  // clumsy: reacts late (0.25 s), oversteers, sometimes ignores bikes or picks the worse tower first, dawdles at docks.
  // rival (三花姐): drives clean at 82–98% of 小橘's top speed; about one race in seven she skips the bikes, one in five she does
  // the towers in the slower order, and she poses for a photo at every stop for 1.5–10 s. Tuned over Duet's four playtests on
  // 2026-11-23: round 1 she won 5:10–5:40; round 4 her solo times spread 5:17–7:37 with 32–34 s selfies and the no-bike races
  // too easy, so now most races land between about 5:20 and 6:30.
  const PROFILES = {
    precise: { lag: 0, noise: 0, bike: 1, hesitate: () => 0, wander: 0, orderMiss: 0, deadband: 0.06 },
    clumsy: { lag: 0.18, noise: 0.12, bike: 0.6, hesitate: r => 0.6 + r * 2.4, wander: 0.04, orderMiss: 0.4, deadband: 0.12 },
    rival: { lag: 0, noise: 0, bike: 0.85, hesitate: r => 0.2 + r * 1.6, wander: 0, orderMiss: 0.2, deadband: 0.06, power: r => 0.82 + 0.16 * r, linger: r => 1.5 + 8.5 * r * r * r },
    walker: { lag: 0, noise: 0, bike: 0, hesitate: () => 0, wander: 0, orderMiss: 0, deadband: 0.06 }
  };
  function makePilot(G, nav, profile, seed) {
    const P = PROFILES[profile], rng = mulberry32(seed * 7907 + 11);
    const gauss = () => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const mem = { target: -1, queue: [], wanderUntil: -1, wanderDir: 0, waitUntil: -1, skipBike: rng() > P.bike, order: null, noiseNow: 0, noiseAt: 0 };
    if (rng() < P.orderMiss) mem.order = [0, 2, 1];      // the slower order: 海心沙, then 东塔, then 西塔
    const power = P.power ? P.power(rng()) : 1;
    function pilot(s) {
      if (s.power === undefined) s.power = power;      // 三花姐's legs: a little faster or slower than 小橘 depending on the day
      const inp = { up: false, down: false, left: false, right: false, act: false };
      if (s.done || s.mode !== 'go') return inp;
      // 三花姐 poses for photos at each stop: usually a couple of seconds, now and then much longer
      if (P.linger && s.stamps.length > (mem.posed || 0)) { mem.posed = s.stamps.length; if (s.stamps.length < 3) mem.poseUntil = s.time + P.linger(rng()); }
      s.posing = s.time < (mem.poseUntil || 0);
      if (s.posing) return inp;
      const wo = mem.skipBike && !s.riding;
      const tgt = nextStop(G, nav, s, { order: mem.order, walkOnly: wo });
      if (tgt < 0) return inp;
      const layer = s.riding ? 1 : 0;
      const here = timeTo(G, nav, tgt, s.x, s.z, layer, wo), other = wo ? 1e9 : timeTo(G, nav, tgt, s.x, s.z, 1 - layer);
      // bike decisions straight from the field: the field already priced the scan (and lock) in, so take it when it is the best move here
      const a = actionAt(G, s);
      if (a === 'scan' && !wo && other + TCFG.scanTime + 0.3 < here + 0.25) {
        if (mem.waitUntil < 0) mem.waitUntil = s.time + P.hesitate(rng());
        if (s.time >= mem.waitUntil) { mem.waitUntil = -1; inp.act = true; return inp; }
        return inp;
      }
      if (a === 'lock' && other + TCFG.lockTime < here + 0.25) { inp.act = true; return inp; }
      // drifting off while looking at the phone
      // wander is a chance per second (the pilot runs at 30 Hz)
      if (P.wander && mem.wanderUntil < s.time && rng() < P.wander / 30) { mem.wanderUntil = s.time + 0.8 + rng() * 1.2; mem.wanderDir = rng() < 0.5 ? -1 : 1; }
      const pt = lookahead(G, nav, tgt, s.x, s.z, layer, s.riding ? 14 : 10, wo);
      if (!pt) { inp.up = true; return inp; }
      const want = Math.atan2(pt.x - s.x, -(pt.z - s.z));
      if (s.time >= mem.noiseAt) { mem.noiseNow = gauss() * P.noise; mem.noiseAt = s.time + 0.5 + rng(); }
      let err = wrapAngle(want - s.h + mem.noiseNow);
      if (s.time < mem.wanderUntil) err = mem.wanderDir * 0.6;
      if (P.lag) { mem.queue.push({ at: s.time, err }); while (mem.queue.length > 1 && mem.queue[1].at <= s.time - P.lag) mem.queue.shift(); err = mem.queue[0].err; }
      if (err < -P.deadband) inp.left = true; else if (err > P.deadband) inp.right = true;
      // ease off for tight turns on the bike, otherwise go
      const dist = Math.hypot(pt.x - s.x, pt.z - s.z), radius = Math.max(1, s.speed) / (s.riding ? TCFG.bike.turn : TCFG.run.turn);
      if (s.riding && Math.abs(err) > 0.9 && s.speed > 6) inp.down = true;
      else if (Math.abs(err) < (s.riding ? 1.2 : 1.6) && !(Math.abs(err) > 0.5 && dist < radius * 1.5)) inp.up = true;
      return inp;
    }
    pilot.power = power; pilot.plan = mem;
    return pilot;
  }
  const tsummary = s => ({ done: s.done, time: s.done ? s.doneAt : s.time, stamps: s.stamps.slice(), rides: s.rides, bumps: s.bumps, dist: s.dist, bikeDist: s.bikeDist, events: s.events });
  // run one cat (or a race) to the end; also records stall windows: keys held, frames running, no movement for 3 s
  function simulateTown(G, nav, seed, profile, maxSeconds = 900, dt = 1 / 30) {
    const s = createTown(G, seed), pilot = makePilot(G, nav, profile, seed);
    let stall = 0, stalls = 0, lx = s.x, lz = s.z, inside = 0;
    while (!s.done && s.time < maxSeconds) {
      const inp = pilot(s); stepTown(G, s, inp, dt);
      if (blockedAt(G, s.x, s.z, s.riding)) inside++;
      const moved = Math.hypot(s.x - lx, s.z - lz); lx = s.x; lz = s.z;
      if (inp.up && s.mode === 'go' && moved < 0.02) { stall += dt; if (stall > 3) { stalls++; stall = -1e9; } }
      else if (moved >= 0.02) stall = 0;
    }
    return Object.assign(tsummary(s), { stalls, inside });
  }
  function createTownRival(G, player) { const r = createTown(G, player.seed + TCFG.rival.seedOffset, { dx: 5 }); r.z -= 3; return r; }   // to 小橘's right and a little ahead: the opening camera swings round her left side, so it never passes through 三花姐
  function townResult(player, rival) {
    if (!player.done) return null;
    return { won: !rival.done || player.doneAt <= rival.doneAt, margin: rival.done ? Math.abs(rival.doneAt - player.doneAt) : null, rivalStamps: rival.stamps.length };
  }
  function simulateTownRace(G, nav, seed, profile, maxSeconds = 900, dt = 1 / 30) {
    const p = createTown(G, seed), r = createTownRival(G, p);
    const pp = makePilot(G, nav, profile, seed), rp = makePilot(G, nav, 'rival', seed + TCFG.rival.seedOffset);
    while ((!p.done || !r.done) && p.time < maxSeconds) { if (!p.done) stepTown(G, p, pp(p), dt); else p.time += dt; if (!r.done) stepTown(G, r, rp(r), dt); else r.time += dt; }
    return { player: tsummary(p), rival: tsummary(r), won: p.done && (!r.done || p.doneAt <= r.doneAt) };
  }

  const API = { SURF, TCFG, ORDER_NAMES, decodeGrid, surf, canRun, canRide, blockedAt, createTown, stepTown, actionAt, nearDock, stopAt, topSpeed,
    buildNav, field, timeTo, lookahead, tracePath, nextStop, PROFILES, makePilot, simulateTown, createTownRival, townResult, simulateTownRace, fwd, screenRight, wrapAngle };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.XJTOWN = API;
})(typeof self !== 'undefined' ? self : this);
