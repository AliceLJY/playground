// 花城收租佬 · 模型座位测试：验收条目 4（出错退回规则机器人、游戏不卡）与 5（key 不外露）。
// 全部用假 key + mock fetch，不发任何真实请求。
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/core.js');
const A = require('../src/ai.js');

const FAKE_KEY = 'sk-test-FAKE0000000000000000000000';
const seat = (extra) => Object.assign({ provider: 'deepseek', name: '阿发', key: FAKE_KEY, failures: 0 }, extra || {});
const okReply = (content) => async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) });
// 一个停在「买不买」的局面，轮到 1 号
function buyState() {
  for (let s = 1; s < 500; s++) {
    const g = M.create({ seed: s, humanSeat: -1 });
    M.decide(g, 'two');
    if (g.phase === 'decide' && g.pending && g.pending.type === 'buy') return g;
    while (g.phase !== 'over' && g.turn !== 1) M.decide(g, M.botChoice(g, g.turn, M.BOT_TUNES[g.turn]));
    M.decide(g, 'two');
    if (g.turn === 1 && g.pending && g.pending.type === 'buy') return g;
  }
  throw new Error('找不到买地局面');
}

test('provider 表：规则机器人、DeepSeek、千问三种；两个模型座位默认官方地址；没有 Kimi', () => {
  assert.deepEqual(Object.keys(A.PROVIDERS).sort(), ['bot', 'deepseek', 'qwen']);
  assert.equal(A.PROVIDERS.deepseek.url, 'https://api.deepseek.com/chat/completions');
  assert.equal(A.PROVIDERS.qwen.url, 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
  assert.ok(!JSON.stringify(A.PROVIDERS).toLowerCase().includes('kimi'));
  assert.ok(!JSON.stringify(A.PROVIDERS).toLowerCase().includes('moonshot'));
});

test('合法回复：采用模型的选择和嘴炮；嘴炮截到 30 字以内、去掉换行；请求短、key 只在 Authorization 头里', async () => {
  const g = buyState();
  const i = g.turn;
  let req = null;
  const long = '这块地我睇中咗'.repeat(8) + '\n第二行';
  const fetch = async (url, init) => { req = { url, init }; return okReply(JSON.stringify({ c: 2, say: long }))(); };
  const r = await A.decide(M, g, i, seat(), { fetch });
  assert.equal(r.source, 'model');
  assert.equal(r.choice, g.pending.options[1]);
  assert.ok(Array.from(r.say).length <= 30, `嘴炮 ${Array.from(r.say).length} 字`);
  assert.doesNotMatch(r.say, /\n/);
  assert.equal(req.url, A.PROVIDERS.deepseek.url);
  assert.equal(req.init.headers.Authorization, 'Bearer ' + FAKE_KEY);
  assert.equal(req.init.credentials, 'omit');
  const body = JSON.parse(req.init.body);
  assert.ok(!req.init.body.includes(FAKE_KEY), 'key 不该出现在请求正文里');
  assert.equal(body.model, 'deepseek-chat');
  assert.ok(body.max_tokens <= 80);
  const promptLen = body.messages.map((m) => m.content).join('').length;
  assert.ok(promptLen < 400, `prompt ${promptLen} 字，太长`);
  assert.equal(r.note, '');
});

test('同一服务商坐两个座位：各用各的 key 与地址（例如一个官方、一个中转）', async () => {
  const g = buyState();
  const seen = [];
  const fetch = async (url, init) => { seen.push([url, init.headers.Authorization]); return okReply('{"c":1,"say":"好"}')(); };
  await A.decide(M, g, g.turn, seat({ key: 'sk-test-A-0000000000' }), { fetch });
  await A.decide(M, g, g.turn, seat({ key: 'sk-test-B-0000000000', url: 'https://relay.example.invalid/v1/chat/completions', model: 'deepseek-v3' }), { fetch });
  assert.deepEqual(seen, [
    [A.PROVIDERS.deepseek.url, 'Bearer sk-test-A-0000000000'],
    ['https://relay.example.invalid/v1/chat/completions', 'Bearer sk-test-B-0000000000'],
  ]);
});

const FAILS = [
  ['编号超出选项', okReply('{"c":7,"say":"哈"}'), /不是合法选项/],
  ['编号不是整数', okReply('{"c":"买","say":"哈"}'), /不是合法选项/],
  ['回的不是 JSON', okReply('我决定买下这块地'), /不是合法选项/],
  ['空回复', async () => ({ ok: true, status: 200, json: async () => ({}) }), /不是合法选项/],
  ['HTTP 401', async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'Incorrect API key provided: ' + FAKE_KEY } }) }), /key 不对/],
  ['HTTP 429', async () => ({ ok: false, status: 429, json: async () => ({}) }), /太频繁/],
  ['HTTP 500', async () => ({ ok: false, status: 500, json: async () => ({}) }), /500/],
  ['网络或跨域被拦（TypeError）', async () => { throw new TypeError('Failed to fetch'); }, /连不上服务商/],
  ['抛出别的错，错误里带着 key', async () => { throw new Error('boom ' + FAKE_KEY); }, /调用出错/],
  ['永不返回（超时）', () => new Promise(() => {}), /秒没回/],
];
for (const [name, fetch, re] of FAILS) {
  test(`出错退回规则机器人：${name}`, async () => {
    const g = buyState();
    const i = g.turn;
    const expect = M.botChoice(g, i, M.BOT_TUNES[i % 4]);
    const t0 = Date.now();
    const r = await A.decide(M, g, i, seat(), { fetch, timeoutMs: 50 });
    assert.ok(Date.now() - t0 < 2000, '退回要快，不能卡住');
    assert.equal(r.source, 'bot');
    assert.equal(r.choice, expect);
    assert.match(r.note, re);
    assert.match(r.note, /规则机器人/);
    assert.ok(!JSON.stringify(r).includes(FAKE_KEY), 'key 出现在结果里');
    // 退回的选择真能用：游戏继续往下走
    M.decide(g, r.choice);
    assert.notEqual(g.phase, 'decide-stuck');
  });
}

test('自定义地址被浏览器拦（TypeError）时说「这个地址不允许网页直接调用」；非 https 地址直接不调', async () => {
  const g = buyState();
  const r = await A.decide(M, g, g.turn, seat({ url: 'https://relay.example.invalid/v1/chat/completions' }), { fetch: async () => { throw new TypeError('Failed to fetch'); } });
  assert.match(r.note, /这个地址不允许网页直接调用/);
  let called = false;
  const r2 = await A.decide(M, g, g.turn, seat({ url: 'http://relay.example.invalid/v1' }), { fetch: async () => { called = true; } });
  assert.equal(called, false, 'http 明文地址不该发请求');
  assert.match(r2.note, /https/);
});

test('连续失败 3 次后这局不再调用，整局改由规则机器人代打；成功一次计数清零', async () => {
  const g = buyState();
  const s = seat();
  let calls = 0;
  const bad = async () => { calls++; throw new TypeError('x'); };
  for (let k = 0; k < 5; k++) await A.decide(M, g, g.turn, s, { fetch: bad });
  assert.equal(calls, A.GIVE_UP_AFTER);
  const s2 = seat({ failures: 2 });
  await A.decide(M, g, g.turn, s2, { fetch: okReply('{"c":1,"say":"好"}') });
  assert.equal(s2.failures, 0);
});

test('没填 key：不发请求，直接规则机器人', async () => {
  const g = buyState();
  let called = false;
  const r = await A.decide(M, g, g.turn, seat({ key: '' }), { fetch: async () => { called = true; } });
  assert.equal(called, false);
  assert.equal(r.source, 'bot');
});

test('掷骰选择也交给模型：prompt 里有前方格子，选项是掷两颗 / 掷一颗', async () => {
  const g = M.create({ seed: 4, humanSeat: -1 });
  let body = null;
  const r = await A.decide(M, g, 0, seat(), { fetch: async (u, init) => { body = JSON.parse(init.body); return okReply('{"c":2,"say":"慢慢行"}')(); } });
  assert.equal(r.choice, 'one');
  const user = body.messages[1].content;
  assert.match(user, /前方/);
  assert.match(user, /1=掷两颗/);
  assert.match(user, /2=掷一颗/);
});

test('带假 key 的两个模型座位打完一整局：状态快照、日志、提示里都搜不到 key；模型乱回也能打完', async () => {
  const keys = ['sk-test-FAKE-AAAA-1111111111', 'sk-test-FAKE-BBBB-2222222222'];
  const seats = [null, seat({ key: keys[0] }), seat({ provider: 'qwen', key: keys[1] }), { provider: 'bot' }];
  let n = 0;
  const replies = ['{"c":1,"say":"冲！"}', 'blah', '{"c":9}', '{"c":2,"say":"' + keys[0] + '"}'];
  const fetch = async () => okReply(replies[n++ % replies.length])();
  const g = M.create({ seed: 77, humanSeat: -1 });
  const notes = [];
  let steps = 0;
  while (g.phase !== 'over' && steps++ < 2000) {
    const i = g.turn;
    const s = seats[i];
    if (s && s.key) {
      const r = await A.decide(M, g, i, s, { fetch, timeoutMs: 50 });
      notes.push(r.note, r.say);
      M.decide(g, r.choice);
    } else M.decide(g, M.botChoice(g, i, M.BOT_TUNES[i]));
  }
  assert.equal(g.phase, 'over', '整局打完');
  assert.ok(n > 10, `模型只被调用了 ${n} 次`);
  const dump = JSON.stringify([M.snapshot(g), g.log, notes]);
  for (const k of keys) assert.ok(!dump.includes(k), 'key 出现在对外输出里');
});

test('redact 兜底：任何字符串里的 key 都被抹掉', () => {
  assert.equal(A.redact('x ' + FAKE_KEY + ' y', FAKE_KEY), 'x <key> y');
  assert.equal(A.redact('abc', ''), 'abc');
});
