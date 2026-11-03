/* 像素连连看的规则与模拟：棋盘、连线（不超过两个拐弯、可走棋盘外一圈）、有解生成、死局洗牌、计时、提示、自动驾驶。
 * 不碰 DOM，Node 测试与浏览器共用。 */
(function (root) {
  'use strict';

  // ---- 关卡：棋盘逐关变大，小人逐关混进更像的（像不像的读数见 SPEC 第 4 节与 tests/figures.test.cjs）----
  const L1 = ['builder', 'artist', 'filmmaker', 'wuyou'];
  const L2 = [...L1, 'companion', 'courier'];
  const L3 = [...L2, 'writer', 'wulv'];
  const L4 = [...L3, 'scout', 'boss'];
  const L5 = [...L4, 'director', 'twin-a', 'helper'];
  const LEVELS = [
    { cols: 4, rows: 6, types: L1, time: 120 },
    { cols: 5, rows: 6, types: L2, time: 140 },
    { cols: 6, rows: 6, types: L3, time: 160 },
    { cols: 6, rows: 7, types: L4, time: 180 },
    { cols: 6, rows: 8, types: L5, time: 200 },
  ];
  const HINTS = 3, SHUFFLES = 2;
  // 动画时长（秒）：连线停留、小人做动作、牌淡出。都不挡输入：牌在逻辑上一配上就已经拿掉了。
  const FX = { line: 0.35, act: 0.7, fade: 0.18, wrong: 0.3, hint: 3, deadlock: 1.1 };

  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const gauss = (R) => { let u = 0, v = 0; while (u === 0) u = R(); while (v === 0) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const shuffleArr = (arr, R) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

  // ---- 棋盘：grid[r][c] = 类型编号（LEVELS[..].types 的下标），-1 = 空 ----
  const at = (g, r, c) => (r < 0 || c < 0 || r >= g.length || c >= g[0].length) ? -1 : g[r][c];
  const inRing = (g, r, c) => r >= -1 && c >= -1 && r <= g.length && c <= g[0].length;

  // 最少拐弯的连线：BFS 按（位置，方向）走，代价 = 拐弯次数，可走到棋盘外一圈。返回拐点序列（含两端），连不上返回 null。
  function findPath(g, a, b) {
    if (a.r === b.r && a.c === b.c) return null;
    const t = at(g, a.r, a.c);
    if (t < 0 || t !== at(g, b.r, b.c)) return null;
    const D = [[-1, 0], [1, 0], [0, -1], [0, 1]], R = g.length + 2, C = g[0].length + 2;
    const key = (r, c, d) => ((r + 1) * C + (c + 1)) * 4 + d;
    const best = new Int8Array(R * C * 4).fill(9), prev = new Int32Array(R * C * 4).fill(-1);
    const queue = []; let head = 0;
    for (let d = 0; d < 4; d++) {
      const nr = a.r + D[d][0], nc = a.c + D[d][1];
      if (!inRing(g, nr, nc)) continue;
      if (!(nr === b.r && nc === b.c) && at(g, nr, nc) >= 0) continue;
      const k = key(nr, nc, d); best[k] = 0; prev[k] = -2; queue.push([nr, nc, d, 0]);
    }
    // 按代价从小到大展开（同方向代价 0，转向代价 1；队列很短，线性挑最小即可）。
    while (head < queue.length) {
      // 找当前代价最小的（量小，线性挑即可）
      let bi = head;
      for (let i = head + 1; i < queue.length; i++) if (queue[i][3] < queue[bi][3]) bi = i;
      [queue[head], queue[bi]] = [queue[bi], queue[head]];
      const [r, c, d, cost] = queue[head++];
      if (cost > best[key(r, c, d)]) continue;
      if (r === b.r && c === b.c) {
        // 回溯拐点
        const pts = [{ r, c }]; let k = key(r, c, d), cd = d;
        while (prev[k] !== -2) {
          const pk = prev[k], pd = pk % 4, cell = (pk - pd) / 4, pr = Math.floor(cell / C) - 1, pc = cell % C - 1;
          if (pd !== cd) pts.push({ r: pr, c: pc });
          k = pk; cd = pd;
        }
        pts.push({ r: a.r, c: a.c });
        return pts.reverse();
      }
      for (let nd = 0; nd < 4; nd++) {
        if (D[nd][0] === -D[d][0] && D[nd][1] === -D[d][1]) continue;
        const ncost = cost + (nd === d ? 0 : 1);
        if (ncost > 2) continue;
        const nr = r + D[nd][0], nc = c + D[nd][1];
        if (!inRing(g, nr, nc)) continue;
        if (!(nr === b.r && nc === b.c) && at(g, nr, nc) >= 0) continue;
        const k = key(nr, nc, nd);
        if (ncost < best[k]) { best[k] = ncost; prev[k] = key(r, c, d); queue.push([nr, nc, nd, ncost]); }
      }
    }
    return null;
  }

  function cellsOf(g) { const out = []; for (let r = 0; r < g.length; r++) for (let c = 0; c < g[0].length; c++) if (g[r][c] >= 0) out.push({ r, c, t: g[r][c] }); return out; }
  // 全部可连的对子
  function allMoves(g) {
    const cells = cellsOf(g), moves = [];
    for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) if (cells[i].t === cells[j].t && findPath(g, cells[i], cells[j])) moves.push([cells[i], cells[j]]);
    return moves;
  }
  function firstMove(g) {
    const cells = cellsOf(g);
    for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) if (cells[i].t === cells[j].t && findPath(g, cells[i], cells[j])) return [cells[i], cells[j]];
    return null;
  }
  const clone = (g) => g.map((row) => row.slice());

  // 能不能消完：深搜，带记忆与节点预算。找到就返回一串对子；预算用完返回 undefined（判不了），确定无解返回 null。
  function solve(g, budget = 40000) {
    const memo = new Set(); let nodes = 0;
    const sig = (b) => b.map((r) => r.join(',')).join('/');
    function dfs(b, seq) {
      if (++nodes > budget) return undefined;
      const cells = cellsOf(b); if (!cells.length) return seq;
      const s = sig(b); if (memo.has(s)) return null; memo.add(s);
      const moves = allMoves(b); if (!moves.length) return null;
      let gaveUp = false;
      for (const [p, q] of moves) {
        b[p.r][p.c] = -1; b[q.r][q.c] = -1;
        const res = dfs(b, [...seq, [{ r: p.r, c: p.c }, { r: q.r, c: q.c }]]);
        b[p.r][p.c] = p.t; b[q.r][q.c] = q.t;
        if (res) return res;
        if (res === undefined) gaveUp = true;
        if (nodes > budget) return undefined;
      }
      return gaveUp ? undefined : null;
    }
    return dfs(clone(g), []);
  }

  // 按关卡出一盘必有解的牌。每种小人的对数尽量平均。
  function makeBoard(level, R) {
    const L = LEVELS[level], n = L.cols * L.rows, pairs = n / 2, T = L.types.length;
    for (let attempt = 0; attempt < 200; attempt++) {
      const order = shuffleArr([...Array(T).keys()], R), bag = [];
      for (let k = 0; k < pairs; k++) { const t = order[k % T]; bag.push(t, t); }
      shuffleArr(bag, R);
      const g = []; for (let r = 0; r < L.rows; r++) g.push(bag.slice(r * L.cols, (r + 1) * L.cols));
      if (solve(g)) return g;
    }
    throw new Error('出不了有解的盘');
  }
  // 洗牌：剩下的牌原地换位置（空位不动），直到整盘仍能消完。
  function reshuffle(g, R) {
    const cells = cellsOf(g), types = cells.map((c) => c.t);
    for (let attempt = 0; attempt < 400; attempt++) {
      shuffleArr(types, R);
      const ng = clone(g); cells.forEach((c, i) => { ng[c.r][c.c] = types[i]; });
      if (solve(ng)) return ng;
    }
    // 极端残局（例如只剩两张、彼此被困不可能——两张同类必能从外圈绕吗？不一定）：退而求其次，只保证有一步可走
    for (let attempt = 0; attempt < 400; attempt++) {
      shuffleArr(types, R);
      const ng = clone(g); cells.forEach((c, i) => { ng[c.r][c.c] = types[i]; });
      if (firstMove(ng)) return ng;
    }
    return g;
  }

  // ---- 一局（一关）----
  function createGame(level = 0, seed = 1) {
    const R = rng(seed * 7919 + level * 104729 + 13);
    const L = LEVELS[level];
    return {
      level, seed, R, cols: L.cols, rows: L.rows, types: L.types, grid: makeBoard(level, R),
      time: 0, limit: L.time, status: 'playing', selected: null,
      hints: HINTS, shuffles: SHUFFLES, hint: null, fx: [], log: [], matches: 0, mistakes: 0, autoShuffles: 0, finishedAt: null,
    };
  }
  const remaining = (s) => cellsOf(s.grid).length;
  const push = (s, e) => { e.at = s.time; s.fx.push(e); s.log.push(e); };

  function afterChange(s) {
    if (!remaining(s)) { s.status = 'won'; s.finishedAt = s.time; push(s, { kind: 'won' }); return; }
    if (!firstMove(s.grid)) {
      s.grid = reshuffle(s.grid, s.R); s.autoShuffles++; s.selected = null; s.hint = null;
      push(s, { kind: 'deadlock' });
    }
  }
  // 点一张牌。返回这次发生了什么：select / deselect / match / wrong / switch / none。
  function tap(s, r, c) {
    if (s.status !== 'playing') return 'none';
    const t = at(s.grid, r, c);
    if (t < 0) { return 'none'; }
    const cur = s.selected;
    if (!cur) { s.selected = { r, c }; return 'select'; }
    if (cur.r === r && cur.c === c) { s.selected = null; return 'deselect'; }
    const ct = at(s.grid, cur.r, cur.c);
    if (ct === t) {
      const path = findPath(s.grid, cur, { r, c });
      if (path) {
        s.grid[cur.r][cur.c] = -1; s.grid[r][c] = -1; s.selected = null; s.matches++;
        if (s.hint && [s.hint[0], s.hint[1]].some((h) => (h.r === r && h.c === c) || (h.r === cur.r && h.c === cur.c))) s.hint = null;
        push(s, { kind: 'match', type: t, a: { ...cur }, b: { r, c }, path, act: s.R() < 0.5 ? 'wave' : 'hop' });
        afterChange(s);
        return 'match';
      }
      push(s, { kind: 'wrong', a: { ...cur }, b: { r, c } }); s.mistakes++;
      s.selected = { r, c }; return 'wrong';
    }
    s.selected = { r, c }; s.mistakes++; push(s, { kind: 'switch', a: { ...cur }, b: { r, c } });
    return 'switch';
  }
  function useHint(s) {
    if (s.status !== 'playing' || s.hints <= 0) return false;
    const m = firstMove(s.grid); if (!m) return false;
    s.hints--; s.hint = [{ r: m[0].r, c: m[0].c }, { r: m[1].r, c: m[1].c }]; s.hintAt = s.time;
    push(s, { kind: 'hint' }); return true;
  }
  function useShuffle(s) {
    if (s.status !== 'playing' || s.shuffles <= 0) return false;
    s.shuffles--; s.grid = reshuffle(s.grid, s.R); s.selected = null; s.hint = null;
    push(s, { kind: 'shuffle' }); afterChange(s); return true;
  }
  function advance(s, dt) {
    if (s.status !== 'playing') return;
    s.time = Math.min(s.time + dt, s.limit);
    if (s.hint && s.time - s.hintAt > FX.hint) s.hint = null;
    if (s.time >= s.limit) { s.status = 'lost'; s.selected = null; push(s, { kind: 'lost' }); }
    s.fx = s.fx.filter((e) => s.time - e.at < 2);
  }

  // ---- 版面：手机竖屏优先。返回 CSS 像素与物理像素下的格子、牌、小人放大倍数 ----
  const PAD = 8, RING = 0.36, GAP = 4, ASPECT = 0.86, FIG_FILL = 1;
  // 顶栏与底栏：矮屏幕（可视高度不到 700，多数手机带浏览器栏时）收窄，把高度让给牌。
  const bars = (vh) => (vh < 700 ? { hud: 50, bar: 66 } : { hud: 58, bar: 78 });
  function layout(vw, vh, cols, rows, dpr = 1) {
    const { hud: HUD, bar: BAR } = bars(vh);
    const aw = vw - PAD * 2, ah = vh - HUD - BAR - PAD;
    let cw = Math.min(aw / (cols + RING * 2), (ah / (rows + RING * 2)) * ASPECT, 96);
    const ch = cw / ASPECT;
    const bw = cw * cols, bh = ch * rows;
    const bx = Math.round((vw - bw) / 2), by = Math.round(HUD + (ah - bh) / 2);
    const card = { w: cw - GAP, h: ch - GAP };
    const devH = Math.floor(card.h * dpr), devW = Math.floor(card.w * dpr);
    // 小人含阴影共 30 行（Dots 的天线到脚下阴影）、最宽 23 列（含 Muse 的胶片盒）：取放得下的最大整数倍。
    const adult = Math.max(1, Math.min(Math.floor((devH * FIG_FILL) / 30), Math.floor((devW * 0.95) / 23)));
    const kid = Math.max(1, Math.round((adult * 4) / 3));
    return { vw, vh, dpr, cols, rows, cell: { w: cw, h: ch }, board: { x: bx, y: by, w: bw, h: bh }, card, dev: { w: devW, h: devH }, scale: { adult, kid }, hud: HUD, bar: BAR };
  }
  const cellCenter = (L, r, c) => ({ x: L.board.x + (c + 0.5) * L.cell.w, y: L.board.y + (r + 0.5) * L.cell.h });
  const cellAt = (L, x, y) => { const c = Math.floor((x - L.board.x) / L.cell.w), r = Math.floor((y - L.board.y) / L.cell.h); return r >= 0 && c >= 0 && r < L.rows && c < L.cols ? { r, c } : null; };

  // ---- 自动驾驶：精准档、手抖档、莽撞档。输出要点哪里（格子或按钮），由调用方经 tap()/真实点击送进游戏 ----
  // 像不像：sim 需要每两种小人在牌面上的差异读数（tests 与浏览器都由 figures+raster 算出后传进来）。
  const HUMAN = { think0: 2.3, perTile: 0.05, perMove: 3.0, noise: 0.35, gap: 0.32, gapSd: 0.09, jitter: 0.2, confuseAt: 450, confuseSlope: 1 / 1200, confuseMax: 0.3, hintAfter: 9, notice: 0.6, playerSd: 0.3 };
  const PRECISE = { think: 0.35, gap: 0.14 };
  function Autopilot(kind, seed, similarity) {
    const R = rng(seed * 31 + 7), sim = similarity || (() => 1e9);
    // 每个真人快慢不一：整局乘一个对数正态的速度系数。
    const pace = kind === 'human' ? Math.exp(gauss(R) * HUMAN.playerSd) : 1;
    let plan = [], wait = 0, lastPair = null;
    const near = (s, t) => { // 盘上和 t 最像的那种，以及读数
      let best = null, bd = 1e9; const present = new Set(cellsOf(s.grid).map((c) => c.t));
      for (const u of present) if (u !== t) { const d = sim(s.types[t], s.types[u]); if (d < bd) { bd = d; best = u; } }
      return [best, bd];
    };
    const jitterCell = (s, cell, sd) => {
      const r = Math.floor(cell.r + 0.5 + gauss(R) * sd), c = Math.floor(cell.c + 0.5 + gauss(R) * sd);
      return { r, c };
    };
    function think(s) {
      if (kind === 'precise') return PRECISE.think;
      const moves = allMoves(s.grid).length;
      const base = HUMAN.think0 + HUMAN.perTile * remaining(s) + HUMAN.perMove / Math.sqrt(Math.max(1, moves));
      return pace * base * Math.exp(gauss(R) * HUMAN.noise);
    }
    // 返回 { wait: 秒, action: {tap:{r,c}} | {hint:true} | {shuffle:true} | null }
    function next(s) {
      if (s.status !== 'playing') return null;
      if (plan.length) return plan.shift();
      if (kind === 'reckless') {
        return { wait: 0.28 + R() * 0.1, action: { tap: { r: Math.floor(R() * s.rows), c: Math.floor(R() * s.cols) } } };
      }
      const moves = allMoves(s.grid);
      if (!moves.length) return { wait: 0.3, action: null };
      if (kind === 'precise') {
        const [a, b] = moves[0];
        const out = [];
        if (s.selected && !(s.selected.r === a.r && s.selected.c === a.c)) out.push({ wait: PRECISE.gap, action: { tap: { r: s.selected.r, c: s.selected.c } } });
        out.push({ wait: PRECISE.think, action: { tap: { r: a.r, c: a.c } } }, { wait: PRECISE.gap, action: { tap: { r: b.r, c: b.c } } });
        plan = out.slice(1); return out[0];
      }
      // 手抖档
      let a, b, tthink;
      const stillValid = lastPair && at(s.grid, lastPair[0].r, lastPair[0].c) === lastPair[0].t && at(s.grid, lastPair[1].r, lastPair[1].c) === lastPair[1].t && findPath(s.grid, lastPair[0], lastPair[1]);
      if (stillValid) { [a, b] = lastPair; tthink = HUMAN.notice * Math.exp(gauss(R) * 0.25); }
      else if (s.hint) { a = { ...s.hint[0], t: at(s.grid, s.hint[0].r, s.hint[0].c) }; b = { ...s.hint[1], t: at(s.grid, s.hint[1].r, s.hint[1].c) }; tthink = 0.7; }
      else {
        tthink = think(s);
        if (tthink > HUMAN.hintAfter && s.hints > 0) { lastPair = null; return { wait: HUMAN.hintAfter, action: { hint: true } }; }
        [a, b] = moves[Math.floor(R() * moves.length)];
      }
      lastPair = [a, b];
      const out = [];
      if (s.selected && !(s.selected.r === a.r && s.selected.c === a.c)) {
        // 手上已经选着别的：先点自己要的那张（游戏会把选中换过来，或者恰好配上）。
      }
      const gap = () => Math.max(0.12, HUMAN.gap + gauss(R) * HUMAN.gapSd);
      out.push({ wait: tthink, action: { tap: jitterCell(s, a, HUMAN.jitter) } });
      // 看走眼：盘上有长得像的，有一定概率点成那种
      const [lt, ld] = near(s, a.t), p = Math.min(HUMAN.confuseMax, Math.max(0, (HUMAN.confuseAt - ld) * HUMAN.confuseSlope));
      let second = b;
      if (lt != null && R() < p) { const alike = cellsOf(s.grid).filter((c) => c.t === lt).sort((x, y) => Math.hypot(x.r - b.r, x.c - b.c) - Math.hypot(y.r - b.r, y.c - b.c))[0]; if (alike) second = alike; }
      out.push({ wait: gap(), action: { tap: jitterCell(s, second, HUMAN.jitter) } });
      plan = out.slice(1); return out[0];
    }
    return { kind, next, reset() { plan = []; lastPair = null; wait = 0; void wait; } };
  }

  // 整关模拟（Node 测试用）：自动驾驶一直点到赢或输。返回用时、是否通关、各种事件计数。
  function simulate(level, seed, kind, similarity, opts = {}) {
    const s = createGame(level, seed), ap = Autopilot(kind, seed, similarity);
    let clock = 0, guard = 0, idle = 0;
    while (s.status === 'playing' && guard++ < 20000) {
      const step = ap.next(s); if (!step) break;
      const before = s.time;
      advance(s, step.wait); clock += step.wait;
      if (s.status !== 'playing') break;
      const act = step.action;
      if (!act) { idle += step.wait; continue; }
      if (act.tap) tap(s, act.tap.r, act.tap.c);
      else if (act.hint) useHint(s);
      else if (act.shuffle) useShuffle(s);
      void before;
      if (opts.onStep) opts.onStep(s, act);
    }
    return { won: s.status === 'won', time: s.status === 'won' ? s.finishedAt : s.time, matches: s.matches, mistakes: s.mistakes, hintsUsed: HINTS - s.hints, autoShuffles: s.autoShuffles, idle, state: s };
  }

  const api = { LEVELS, HINTS, SHUFFLES, FX, HUMAN, PRECISE, rng, findPath, allMoves, firstMove, solve, makeBoard, reshuffle, cellsOf, createGame, tap, useHint, useShuffle, advance, remaining, layout, cellCenter, cellAt, Autopilot, simulate, at };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.PixelMatchCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
