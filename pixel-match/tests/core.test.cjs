// 规则：连线判定、每关初始盘有解、死局检测与自动洗牌、点选语义、计时。SPEC 第 7 节验收 1–4。
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');

// 独立的连线检查（不用 BFS）：枚举至多两个拐点，逐段检查空格。和 core.findPath 互相对照。
function brute(g, a, b) {
  const R = g.length, Cn = g[0].length;
  const empty = (r, c) => r < -1 || c < -1 || r > R || c > Cn ? false : (r < 0 || c < 0 || r >= R || c >= Cn) ? true : g[r][c] < 0;
  const seg = (p, q) => {
    if (p.r !== q.r && p.c !== q.c) return false;
    const dr = Math.sign(q.r - p.r), dc = Math.sign(q.c - p.c);
    let r = p.r + dr, c = p.c + dc;
    while (r !== q.r || c !== q.c) { if (!empty(r, c)) return false; r += dr; c += dc; }
    return true;
  };
  const ok = (p) => empty(p.r, p.c);
  if (a.r === b.r && a.c === b.c) return false;
  if (g[a.r][a.c] < 0 || g[a.r][a.c] !== g[b.r][b.c]) return false;
  if (seg(a, b)) return true;
  for (const p of [{ r: a.r, c: b.c }, { r: b.r, c: a.c }]) if (ok(p) && seg(a, p) && seg(p, b)) return true;
  for (let r = -1; r <= R; r++) { const p = { r, c: a.c }, q = { r, c: b.c }; if (r !== a.r && ok(p) && ok(q) && seg(a, p) && seg(p, q) && seg(q, b)) return true; }
  for (let c = -1; c <= Cn; c++) { const p = { r: a.r, c }, q = { r: b.r, c }; if (c !== a.c && ok(p) && ok(q) && seg(a, p) && seg(p, q) && seg(q, b)) return true; }
  return false;
}
function pathValid(g, path) {
  if (!path || path.length < 2 || path.length > 4) return false; // 至多两个拐点 = 至多 4 个点
  const R = g.length, Cn = g[0].length, a = path[0], b = path[path.length - 1];
  for (let i = 1; i < path.length; i++) {
    const p = path[i - 1], q = path[i];
    if (p.r !== q.r && p.c !== q.c) return false;
    const dr = Math.sign(q.r - p.r), dc = Math.sign(q.c - p.c);
    let r = p.r, c = p.c;
    while (r !== q.r || c !== q.c) {
      r += dr; c += dc;
      if (r < -1 || c < -1 || r > R || c > Cn) return false;
      const inside = r >= 0 && c >= 0 && r < R && c < Cn;
      if (inside && g[r][c] >= 0 && !(r === b.r && c === b.c)) return false;
    }
  }
  return a && b;
}
const randomBoard = (R, rows, cols, types, fill) => {
  const g = [];
  for (let r = 0; r < rows; r++) { const row = []; for (let c = 0; c < cols; c++) row.push(R() < fill ? Math.floor(R() * types) : -1); g.push(row); }
  return g;
};
const allPairsConnectable = (g) => { const cells = C.cellsOf(g); for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) if (brute(g, cells[i], cells[j])) return true; return false; };

test('1 连线：BFS 与独立枚举在 3000 个随机盘上结论一致，给出的线不超过两个拐弯、只走空格和外圈', () => {
  const R = C.rng(99);
  let connectable = 0, checked = 0;
  for (let k = 0; k < 3000; k++) {
    const g = randomBoard(R, 3 + Math.floor(R() * 6), 3 + Math.floor(R() * 4), 3, 0.35 + R() * 0.5);
    const cells = C.cellsOf(g); if (cells.length < 2) continue;
    const a = cells[Math.floor(R() * cells.length)], b = cells[Math.floor(R() * cells.length)];
    const p = C.findPath(g, a, b), q = brute(g, a, b);
    checked++;
    assert.equal(!!p, q, `连线判定和独立枚举不一致：${JSON.stringify({ g, a, b })}`);
    if (p) { connectable++; assert.ok(pathValid(g, p), `给出的线不合法：${JSON.stringify({ g, p })}`); }
  }
  assert.ok(checked > 2500 && connectable > 300 && connectable < checked - 300, `样本里连得上和连不上的都要有：${connectable}/${checked}`);
});

test('1b 连线：直连、一拐、两拐、绕外圈能连，需要三个拐弯的不能连', () => {
  const X = -1;
  let g = [[0, X, X, 0]]; assert.equal(C.findPath(g, { r: 0, c: 0 }, { r: 0, c: 3 }).length, 2, '同一行中间空着应直连');
  g = [[0, 1], [X, 0]]; assert.ok(C.findPath(g, { r: 0, c: 0 }, { r: 1, c: 1 }), '一个拐弯');
  g = [[0, 1, 0], [1, 1, 1]]; const ring = C.findPath(g, { r: 0, c: 0 }, { r: 0, c: 2 });
  assert.ok(ring && ring.some((p) => p.r < 0 || p.c < 0 || p.r >= 2 || p.c >= 3), '被围住时应能走棋盘外一圈');
  // 两张 0 之间要拐三个弯：中间整圈被 1 围着
  g = [[1, 1, 1, 1, 1], [1, 0, 1, X, 1], [1, 1, 1, 0, 1], [1, 1, 1, 1, 1]];
  assert.equal(C.findPath(g, { r: 1, c: 1 }, { r: 2, c: 3 }), null, '被完全围住的不能连');
  g = [[1, 1, 1, 1, 1], [1, 0, X, 1, 1], [1, 1, X, 1, 1], [1, 1, X, X, 1], [1, 1, 1, 0, 1], [1, 1, 1, 1, 1]];
  assert.equal(C.findPath(g, { r: 1, c: 1 }, { r: 4, c: 3 }), null, '右-下-右-下 需要三个拐弯，不该连上');
  assert.equal(brute(g, { r: 1, c: 1 }, { r: 4, c: 3 }), false);
});

test('2 每一关的初始棋盘都有解：5 关 × 40 个种子，解出的消除顺序逐步回放都合法', () => {
  for (let lv = 0; lv < C.LEVELS.length; lv++) for (let seed = 1; seed <= 40; seed++) {
    const s = C.createGame(lv, seed), L = C.LEVELS[lv];
    assert.equal(s.grid.length, L.rows); assert.equal(s.grid[0].length, L.cols);
    const counts = {}; C.cellsOf(s.grid).forEach((c) => { counts[c.t] = (counts[c.t] || 0) + 1; });
    assert.equal(Object.keys(counts).length, L.types.length, `第 ${lv + 1} 关种子 ${seed}：该上场的 ${L.types.length} 种没到齐`);
    for (const k in counts) assert.equal(counts[k] % 2, 0, '每种都要成对');
    const seq = C.solve(s.grid);
    assert.ok(Array.isArray(seq), `第 ${lv + 1} 关种子 ${seed} 的初始盘解不出来`);
    const g = s.grid.map((r) => r.slice());
    for (const [a, b] of seq) { assert.ok(brute(g, a, b), `回放第 ${lv + 1} 关种子 ${seed} 时有一步连不上`); g[a.r][a.c] = -1; g[b.r][b.c] = -1; }
    assert.equal(C.cellsOf(g).length, 0, '回放完应该一张不剩');
  }
});

// 找一盘「只剩一步可走、走完就成死局」的牌，用来验自动洗牌。
function findDeadlockSetup() {
  const R = C.rng(2024);
  for (let k = 0; k < 200000; k++) {
    const g = randomBoard(R, 4, 4, 5, 1);
    const cells = C.cellsOf(g), counts = {};
    cells.forEach((c) => { counts[c.t] = (counts[c.t] || 0) + 1; });
    if (Object.values(counts).some((n) => n % 2)) continue;
    const moves = C.allMoves(g); if (moves.length !== 1) continue;
    const [a, b] = moves[0], after = g.map((r) => r.slice()); after[a.r][a.c] = -1; after[b.r][b.c] = -1;
    if (C.firstMove(after)) continue;
    return { g, a, b, after };
  }
  return null;
}

test('3 死局检测：找到的死局里任何两张同样的都连不上（独立枚举复核）；还有一步时不算死局', () => {
  const setup = findDeadlockSetup();
  assert.ok(setup, '没找到死局样本');
  assert.equal(C.firstMove(setup.after), null);
  assert.equal(allPairsConnectable(setup.after), false, '判成死局，但独立枚举找到了能连的一对');
  assert.ok(C.firstMove(setup.g), '还有一步可走时不该判死局');
  assert.ok(allPairsConnectable(setup.g));
});

test('4 死局自动洗牌：最后一步走完成死局时自动洗，只换位置不换牌，洗完能消完；手动洗牌有次数', () => {
  const { g, a, b } = findDeadlockSetup();
  const s = C.createGame(0, 1); s.grid = g.map((r) => r.slice()); s.cols = 4; s.rows = 4;
  const occupied = (gg) => C.cellsOf(gg).map((c) => c.r + ',' + c.c).sort().join(' '), multiset = (gg) => C.cellsOf(gg).map((c) => c.t).sort().join(',');
  const before = g.map((r) => r.slice()); before[a.r][a.c] = -1; before[b.r][b.c] = -1;
  assert.equal(C.tap(s, a.r, a.c), 'select'); assert.equal(C.tap(s, b.r, b.c), 'match');
  assert.equal(s.autoShuffles, 1, '成死局后应自动洗牌一次');
  assert.ok(s.log.some((e) => e.kind === 'deadlock'), '要有洗牌提示事件');
  assert.equal(occupied(s.grid), occupied(before), '洗牌不该挪动空位');
  assert.equal(multiset(s.grid), multiset(before), '洗牌不该改变剩下的牌');
  assert.ok(C.firstMove(s.grid), '洗完必须有路');
  assert.ok(Array.isArray(C.solve(s.grid)), '洗完必须能消完');
  assert.equal(s.shuffles, C.SHUFFLES, '自动洗牌不扣手动洗牌次数');
  for (let i = 0; i < C.SHUFFLES; i++) assert.equal(C.useShuffle(s), true);
  assert.equal(C.useShuffle(s), false, '手动洗牌用完就不能再洗');
});

test('4b 跨种子整关模拟里真的发生过死局自动洗牌，而且每次洗完都有路（不是空验）', () => {
  let deadlocks = 0;
  for (let lv = 0; lv < C.LEVELS.length; lv++) for (let seed = 1; seed <= 60; seed++) {
    C.simulate(lv, seed, 'precise', null, { onStep(s) { if (s.status === 'playing' && C.remaining(s)) assert.ok(C.firstMove(s.grid), `第 ${lv + 1} 关种子 ${seed}：盘上还有牌却没路，也没洗牌`); } });
    const r = C.simulate(lv, seed, 'precise'); deadlocks += r.autoShuffles;
  }
  assert.ok(deadlocks >= 5, `300 局里死局只出现 ${deadlocks} 次，测不到自动洗牌`);
});

test('5 点选：选中、再点取消、点别种换选、同种连不上算点错、配上就消', () => {
  const s = C.createGame(0, 3);
  const cells = C.cellsOf(s.grid);
  const other = cells.find((c) => c.t !== cells[0].t);
  assert.equal(C.tap(s, cells[0].r, cells[0].c), 'select');
  assert.equal(C.tap(s, cells[0].r, cells[0].c), 'deselect');
  assert.equal(s.selected, null);
  C.tap(s, cells[0].r, cells[0].c);
  assert.equal(C.tap(s, other.r, other.c), 'switch'); assert.deepEqual(s.selected, { r: other.r, c: other.c });
  const [a, b] = C.firstMove(s.grid);
  C.tap(s, a.r, a.c); assert.equal(C.tap(s, b.r, b.c), 'match');
  assert.equal(s.grid[a.r][a.c], -1); assert.equal(s.grid[b.r][b.c], -1);
  assert.equal(C.tap(s, a.r, a.c), 'none', '空格点了没反应');
  // 同种但连不上
  let found = null;
  for (const p of C.cellsOf(s.grid)) for (const q of C.cellsOf(s.grid)) if (!found && p.t === q.t && (p.r !== q.r || p.c !== q.c) && !C.findPath(s.grid, p, q)) found = [p, q];
  if (found) { s.selected = null; C.tap(s, found[0].r, found[0].c); assert.equal(C.tap(s, found[1].r, found[1].c), 'wrong'); }
});

test('6 提示与计时：提示给的是能连的一对、有次数；到点判输，重开是新的一盘且次数补满', () => {
  const s = C.createGame(4, 7);
  for (let i = 0; i < C.HINTS; i++) { assert.equal(C.useHint(s), true); assert.ok(C.findPath(s.grid, s.hint[0], s.hint[1]), '提示的那对要能连'); }
  assert.equal(C.useHint(s), false);
  C.advance(s, s.limit - 0.01); assert.equal(s.status, 'playing');
  C.advance(s, 0.02); assert.equal(s.status, 'lost');
  assert.equal(C.tap(s, 0, 0), 'none', '输了以后点牌没反应');
  const again = C.createGame(4, 8);
  assert.equal(again.status, 'playing'); assert.equal(again.hints, C.HINTS); assert.equal(again.shuffles, C.SHUFFLES); assert.equal(again.time, 0);
  assert.ok(Array.isArray(C.solve(again.grid)));
});

test('7 关卡逐关变难：棋盘严格变大、上场人数不减、前一关的人后一关都在、最后一关 13 位全员', () => {
  const F = require('../src/figures.js');
  for (let i = 1; i < C.LEVELS.length; i++) {
    const a = C.LEVELS[i - 1], b = C.LEVELS[i];
    assert.ok(b.cols * b.rows > a.cols * a.rows, `第 ${i + 1} 关棋盘没变大`);
    assert.ok(b.types.length >= a.types.length);
    for (const t of a.types) assert.ok(b.types.includes(t), `第 ${i} 关的 ${t} 第 ${i + 1} 关不见了`);
  }
  assert.deepEqual([...C.LEVELS.at(-1).types].sort(), F.ROSTER.map((f) => f.id).sort(), '最后一关要全员上场');
  for (const L of C.LEVELS) { assert.equal((L.cols * L.rows) % 2, 0); assert.ok(L.cols <= 6, '竖屏一行最多 6 张'); }
});
