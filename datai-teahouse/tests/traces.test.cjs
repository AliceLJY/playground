// 跨用户痕迹：Worker 的收与发（假 KV）、页面侧的打包与合并、门口等位。node --test tests/*.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const D = require('../src/core.js');
const load = () => import(pathToFileURL(path.join(__dirname, '..', 'worker', 'index.js')).href);
const ORIGIN = 'https://aliceljy.github.io';

// 照 KV 的行为写的假货：list 按 key 字典序升序、带 limit
function fakeKV() {
  const m = new Map();
  return {
    m,
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async put(k, v, opts) { m.set(k, v); this.lastOpts = opts; },
    async list({ prefix, limit }) { return { keys: [...m.keys()].filter((k) => k.startsWith(prefix)).sort().slice(0, limit).map((name) => ({ name })) }; },
  };
}
const post = (body, ip, origin) => new Request('https://w.example/trace', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip || '1.2.3.4', ...(origin === null ? {} : { origin: origin || ORIGIN }) }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const get = (q) => new Request('https://w.example/traces' + (q || ''), { headers: { origin: ORIGIN } });

test('痕迹 1 页面打包的痕迹 Worker 一定收：合成来访 → traceBody → cleanTrace 原样通过，只有 v/dur/acts', async () => {
  const W = await load();
  for (const v of D.syntheticVisits(8, 3)) {
    const body = D.traceBody(v);
    assert.deepEqual(Object.keys(body).sort(), ['acts', 'dur', 'v'], '上传体不带进门时刻、不带任何别的字段');
    assert.deepEqual(W.cleanTrace(body), { v: 1, dur: body.dur, acts: body.acts });
  }
  // 动作超过 200 个、有晚于离席的：截掉，不整条作废
  const v = D.newVisit(1); for (let i = 0; i < 260; i++) D.recordAct(v, i * 0.5, 1); D.closeVisit(v, 100);
  const body = D.traceBody(v);
  assert.equal(body.acts.length, D.TRACE_MAX_ACTS);
  assert.ok(body.acts.every((a) => a[0] <= 100));
  assert.ok(W.cleanTrace(body));
});

test('痕迹 2 POST 白名单重建：多余字段（名字、文字、伪造时刻）被丢掉；坏形状 400、超 2 KB 413、别的来源 403', async () => {
  const W = await load();
  const env = { DATAI_TRACES: fakeKV() };
  const r = await W.handle(post({ v: 1, dur: 30, acts: [[1, 1], [2, 2]], name: '阿明', text: '你好', at: 1, k: 'x' }), env, 1700000000000);
  assert.equal(r.status, 201);
  assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN);
  const stored = [...env.DATAI_TRACES.m.entries()].find(([k]) => k.startsWith('trace:'));
  assert.deepEqual(JSON.parse(stored[1]), { v: 1, dur: 30, acts: [[1, 1], [2, 2]], at: 1700000000000 }, '只存 v/dur/acts 和服务端时刻');
  assert.equal(env.DATAI_TRACES.lastOpts.expirationTtl, 7 * 24 * 3600, '痕迹七天过期');
  const bad = [
    { v: 2, dur: 1, acts: [] }, { v: 1, dur: 1801, acts: [] }, { v: 1, dur: -1, acts: [] },
    { v: 1, dur: 10, acts: [[3, 1], [2, 1]] }, { v: 1, dur: 10, acts: [[11, 1]] }, { v: 1, dur: 10, acts: [[1, 7]] },
    { v: 1, dur: 10, acts: [[1, 'pour']] }, { v: 1, dur: 10, acts: Array.from({ length: 201 }, () => [1, 1]) }, 'not json',
  ];
  for (const b of bad) assert.equal((await W.handle(post(b, '9.9.9.' + bad.indexOf(b)), env)).status, 400, `应拒绝 ${JSON.stringify(b).slice(0, 60)}`);
  const big = JSON.stringify({ v: 1, dur: 10, acts: [], pad: 'x'.repeat(2100) });
  assert.equal((await W.handle(post(big), env)).status, 413);
  assert.equal((await W.handle(post({ v: 1, dur: 1, acts: [] }, '5.5.5.5', 'https://evil.example'), env)).status, 403);
  assert.equal((await W.handle(new Request('https://w.example/trace', { method: 'OPTIONS', headers: { origin: ORIGIN } }), env)).status, 204);
  assert.equal((await W.handle(new Request('https://w.example/other'), env)).status, 404);
});

test('痕迹 3 同一地址每小时最多留 6 次，第 7 次 429；换个小时恢复；别的地址不受影响', async () => {
  const W = await load();
  const env = { DATAI_TRACES: fakeKV() };
  const t0 = 1700000000000;
  for (let i = 0; i < 6; i++) assert.equal((await W.handle(post({ v: 1, dur: 10, acts: [] }, '7.7.7.7'), env, t0 + i)).status, 201);
  const r7 = await W.handle(post({ v: 1, dur: 10, acts: [] }, '7.7.7.7'), env, t0 + 7);
  assert.equal(r7.status, 429); assert.ok(r7.headers.get('retry-after'));
  assert.equal((await W.handle(post({ v: 1, dur: 10, acts: [] }, '8.8.8.8'), env, t0 + 8)).status, 201);
  assert.equal((await W.handle(post({ v: 1, dur: 10, acts: [] }, '7.7.7.7'), env, t0 + 3600000)).status, 201);
});

test('痕迹 4 GET 最新的在前、n 封顶 12、带 key 与服务端时刻；拉回来的能直接排进大堂，标成别人', async () => {
  const W = await load();
  const env = { DATAI_TRACES: fakeKV() };
  const t0 = 1700000000000;
  const keys = [];
  for (let i = 0; i < 15; i++) { const r = await W.handle(post({ v: 1, dur: 60 + i, acts: [[2, 1], [4, 2]] }, '10.0.' + i), env, t0 + i * 60000); keys.push((await r.json()).k); }
  const r = await W.handle(get('?n=50'), env);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('cache-control'), /max-age=30/);
  const list = await r.json();
  assert.equal(list.length, 12, 'n 最多 12');
  assert.deepEqual(list.map((x) => x.dur), [74, 73, 72, 71, 70, 69, 68, 67, 66, 65, 64, 63], '最新的在前');
  assert.deepEqual(list[0].k, keys[14]);
  // 自己上传的那条（posted 里有）不当成别人；本机 2 条 + 远端 11 条 = 13 位，排出 4 桌，你进第 4 桌
  const local = D.syntheticVisits(2, 5);
  const merged = D.mergeRemote(local, list, [keys[14]]);
  assert.equal(merged.length, 13);
  assert.equal(merged.filter((v) => v.remote).length, 11);
  const plan = D.planGhosts(merged, D.CAP);
  assert.deepEqual(D.tableList(plan.hall).map((t) => t.count), [4, 4, 4, 2]);
  assert.equal(plan.me.table, 4);
  assert.equal(plan.ghosts.filter((g) => g.remote).length, 11);
  assert.equal(plan.ghosts.filter((g) => !g.remote).length, 2, '本机记录照旧是「你」');
});

test('痕迹 5 合并时坏数据丢掉、重复 key 只留一条、没有 key 的不收、最多 12 条', () => {
  const ok = (k, at) => ({ k, at, v: 1, dur: 50, acts: [[1, 1]] });
  const remote = [ok('a', 1), ok('a', 2), { k: 'b', at: 3, v: 1, dur: 50, acts: [[1, 7]] }, { at: 4, v: 1, dur: 50, acts: [] }, null, 'x', ...Array.from({ length: 20 }, (_, i) => ok('c' + i, 10 + i))];
  const merged = D.mergeRemote([], remote, []);
  assert.equal(merged.length, 12);
  assert.equal(merged[0].at, 1, 'a 只留第一条');
  assert.ok(merged.every((v) => v.remote && D.isVisit(v)));
  assert.deepEqual(D.mergeRemote([], 'garbage', null), []);
});

test('等位 门口排 1–4 位（大堂几桌排几位），伙计每 14–24 秒领走一位，收市前 45 秒停', () => {
  for (const seed of [1, 7, 20261031, 99]) {
    for (const tables of [0, 1, 3, 9]) {
      const q = D.queuePlan(seed, tables);
      assert.equal(q.people.length, Math.max(1, Math.min(4, tables)));
      assert.ok(q.swaps.length >= 8);
      assert.ok(q.swaps[0] >= 8 && q.swaps[0] <= 14);
      for (let i = 1; i < q.swaps.length; i++) { const g = q.swaps[i] - q.swaps[i - 1]; assert.ok(g >= 13.9 && g <= 24.1, `间隔 ${g}`); }
      assert.ok(q.swaps[q.swaps.length - 1] < D.CLOSE - 45);
    }
  }
  assert.deepEqual(D.queuePlan(5, 2), D.queuePlan(5, 2), '同种子同结果');
});
