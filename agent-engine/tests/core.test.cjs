// Behaviour checks for the mini engine behind "agent 引擎是什么". Every number comes from running src/core.js; thresholds come from SPEC.md §8.
// AGENT_ENGINE_ROOT points the suite at another copy of the folder (used to run it against a deliberately broken copy).
const test = require('node:test'), assert = require('node:assert');
const path = require('path');
const ROOT = process.env.AGENT_ENGINE_ROOT || path.join(__dirname, '..');
const C = require(path.join(ROOT, 'src', 'core.js'));

const sleepless = () => 0.5;

test('spec 8.1 the loop stops only when the model stops asking for tools, and pairs every request with a result', () => {
  const r = C.runLoop({});
  assert.strictEqual(r.stoppedBy, 'no-tool-request', 'spec 8.1: the loop must end on a reply with no tool request');
  assert.strictEqual(r.turns, 3, 'spec 8.1: list, read, answer is three turns, got ' + r.turns);
  assert.deepStrictEqual(r.messages.map((m) => m.role), ['system', 'user', 'assistant', 'tool', 'assistant', 'tool', 'assistant'], 'spec 8.1: message order');
  assert.strictEqual(C.unpaired(r.messages), 0, 'spec 8.1: a tool request without a result (or the reverse) is left in the history');
  const last = r.messages[r.messages.length - 1];
  assert.ok(!last.toolCalls, 'spec 8.1: the last message must be plain text');
  // the events are what the page replays: 15 of them, turn numbers never go back, the ring station order inside a tool turn is 0..5
  assert.strictEqual(r.events.length, 15, 'spec 5: three turns replay as 15 events, got ' + r.events.length);
  for (let i = 1; i < r.events.length; i++) assert.ok(r.events[i].turn >= r.events[i - 1].turn, 'spec 8.1: event turns went backwards at ' + i);
  const turn1 = r.events.filter((e) => e.turn === 1).map((e) => e.station);
  assert.deepStrictEqual(turn1, [0, 1, 2, 3, 4, 5], 'spec 8.1: a tool turn walks stations 1-6 in order');
  assert.strictEqual(r.events[r.events.length - 1].phase, 'output');
});

test('spec 8.1 the answer comes from the tool results: change the directory and the answer changes', () => {
  const five = C.runLoop({ workspace: C.newWorkspace(['alpha', 'beta', 'gamma', 'delta', 'eps']) });
  const answer = five.messages[five.messages.length - 1].content;
  assert.ok(answer.includes('一共 5 个目录'), 'spec 8.1: the count must come from the listing, got: ' + answer);
  assert.ok(answer.includes('alpha 和 beta'), 'spec 8.1: the two most recent names must come from the listing, got: ' + answer);
  const full = C.runLoop({}).messages.pop().content;
  assert.ok(full.includes('一共 ' + C.PROJECTS.length + ' 个目录'), 'spec 8.1: default listing count, got: ' + full);
  const empty = C.runLoop({ workspace: C.newWorkspace([]) });
  assert.ok(/空的/.test(empty.messages[empty.messages.length - 1].content) && empty.turns === 2, 'an empty directory ends after one tool turn');
});

test('spec 8.1 a model that never stops is cut off at the turn cap, and a refused tool comes back as an ordinary result', () => {
  const greedy = () => ({ content: '', toolCalls: [{ id: 'x', name: 'list_files', args: { path: C.ROOT } }] });
  const capped = C.runLoop({ model: greedy, maxTurns: 4 });
  assert.strictEqual(capped.stoppedBy, 'max-turns');
  assert.strictEqual(capped.turns, 4);

  // first asks for something dangerous, reads the refusal, then answers in text
  const model = (msgs) => {
    const last = msgs[msgs.length - 1];
    if (last.role === 'user') return { content: '', toolCalls: [{ id: 'k1', name: 'run_cmd', args: { cmd: 'rm -rf ' + C.ROOT } }] };
    return { content: '这条命令被拒绝了，我办不到：' + last.content };
  };
  const r = C.runLoop({ model });
  assert.strictEqual(r.denied, 1, 'the gate should have refused exactly one call');
  assert.strictEqual(r.turns, 2, 'the loop must continue after a refusal');
  const tool = r.messages.find((m) => m.role === 'tool');
  assert.ok(tool.content.startsWith('权限门拒绝'), 'a refusal is a tool result the model can read, got: ' + tool.content);
  assert.ok(r.messages[r.messages.length - 1].content.includes('权限门拒绝'), 'the model saw the refusal');
  assert.ok(!r.events.some((e) => e.phase === 'tool'), 'a refused call must not execute');
  assert.ok(r.events.some((e) => e.phase === 'gate' && e.allow === false));
});

test('spec 8.2 without an engine the same model stops on its request and never reaches an answer', () => {
  const r = C.apiOnly(C.scriptedModel, C.demoMessages());
  assert.strictEqual(r.stuck, true);
  assert.strictEqual(r.messages.length, 3, 'spec 8.2: system, user, one assistant message');
  const last = r.messages[r.messages.length - 1];
  assert.ok(last.toolCalls && last.toolCalls[0].name === 'list_files', 'spec 8.2: the last message is a tool request');
  assert.ok(!r.messages.some((m) => m.role === 'tool'), 'spec 8.2: nobody ran it, so there is no result');
  assert.strictEqual(C.unpaired(r.messages), 1, 'the request is left dangling');
  const chatty = C.apiOnly(() => ({ content: '你好' }), C.demoMessages());
  assert.strictEqual(chatty.stuck, false, 'plain talk needs no engine');
});

test('spec 8.3 pairing: a missing result is filled, an orphan result is dropped, a healthy history is untouched', () => {
  const call = (id) => ({ id, name: 'read_file', args: { path: C.ROOT + '/a' } });
  const hist = [
    { role: 'user', content: 'a' },
    { role: 'assistant', content: '', toolCalls: [call('a1'), call('a2')] },
    { role: 'tool', toolCallId: 'a2', name: 'read_file', content: 'ok' },
    { role: 'tool', toolCallId: 'zz', name: 'read_file', content: 'orphan' },
    { role: 'assistant', content: 'done' },
  ];
  const r = C.repairPairing(hist);
  assert.strictEqual(r.added, 1, 'one request (a1) had no result');
  assert.strictEqual(r.removed, 1, 'one result (zz) had no request');
  assert.strictEqual(C.unpaired(r.history), 0, 'after the repair nothing is unpaired');
  assert.strictEqual(r.history[2].toolCallId, 'a1', 'the filler sits right after the request it answers');
  assert.ok(r.history[2].synthetic && /已中断/.test(r.history[2].content));
  assert.ok(r.history.includes(hist[2]), 'the genuine result survives');
  const healthy = C.runLoop({}).messages;
  const same = C.repairPairing(healthy);
  assert.deepStrictEqual([same.added, same.removed], [0, 0], 'a healthy history needs nothing');
  assert.deepStrictEqual(same.history, healthy);
});

test('spec 8.3 argument types: fix what can be fixed, leave the rest, never touch a right value', () => {
  const schema = { limit: 'integer', ratio: 'number', verbose: 'boolean', path: 'string' };
  const r = C.coerceArgs(schema, { limit: '10', ratio: '3.5', verbose: 'TRUE', path: 42, extra: '7' });
  assert.deepStrictEqual(r.args, { limit: 10, ratio: 3.5, verbose: true, path: '42', extra: '7' }, 'unknown keys stay as they were');
  assert.deepStrictEqual(r.changed.sort(), ['limit', 'path', 'ratio', 'verbose']);
  const bad = C.coerceArgs(schema, { limit: '3.5', verbose: 'maybe' });
  assert.deepStrictEqual(bad.args, { limit: '3.5', verbose: 'maybe' }, 'what cannot be converted is left alone');
  assert.deepStrictEqual(bad.failed.sort(), ['limit', 'verbose']);
  const good = C.coerceArgs(schema, { limit: 10, verbose: false, path: 'x' });
  assert.deepStrictEqual(good.changed, [], 'values that already have the right type are not touched');
});

test('spec 8.3 context budget: compaction lands under the limit, keeps the system message, the newest turn and every pair; short outputs pass', () => {
  const build = (n) => {
    const h = [{ role: 'system', content: '你是一个助手。' }, { role: 'user', content: '读一下日志' }];
    for (let i = 0; i < n; i++) {
      h.push({ role: 'assistant', content: '', toolCalls: [{ id: 'b' + i, name: 'read_file', args: { path: C.ROOT + '/log' + i } }] });
      h.push({ role: 'tool', toolCallId: 'b' + i, name: 'read_file', content: '日志行 '.repeat(500) });
    }
    h.push({ role: 'assistant', content: '日志里有三处报错。' });
    return h;
  };
  const big = build(4), limit = 2000;
  const r = C.compact(big, { limitTokens: limit, keepLast: 2 });
  assert.ok(r.compacted && r.before.tokens > limit, 'the history starts over the limit: ' + r.before.tokens);
  assert.ok(r.after.tokens <= limit, 'spec 8.3: compaction must land under ' + limit + ', got ' + r.after.tokens);
  assert.strictEqual(r.history[0].role, 'system', 'spec 8.3: the system message stays first');
  assert.strictEqual(r.history[r.history.length - 1], big[big.length - 1], 'spec 8.3: the newest message stays');
  assert.strictEqual(C.unpaired(r.history), 0, 'spec 8.3: compaction must not cut a request from its result');
  assert.ok(r.history.some((m) => m.synthetic && /前面 \d+ 条消息已压缩/.test(m.content)), 'a summary stands in for the middle');
  const small = build(0);
  const same = C.compact(small, { limitTokens: limit });
  assert.strictEqual(same.compacted, false);
  assert.strictEqual(same.history, small, 'under the limit nothing changes');
  // keeping only the last message when it is a tool result: the tail must pull in its request
  const tailTool = C.compact(build(4).slice(0, -1), { limitTokens: limit, keepLast: 1 });
  assert.strictEqual(C.unpaired(tailTool.history), 0, 'a tail that starts on a result must pull in its request');
  const sp = C.spill('x'.repeat(12000), { maxChars: 4000, id: '#1' });
  assert.ok(sp.spilled && sp.content.length < 100 && sp.content.includes('12000'), 'a huge output becomes one short line that still says how big it was');
  assert.strictEqual(C.spill('short', { maxChars: 4000, id: '#2' }).content, 'short');
});

test('spec 8.3 errors: three kinds, retries back off with jitter, permanent errors are not retried', () => {
  assert.deepStrictEqual([429, 503, 408].map((status) => C.classifyError({ status })), ['transient', 'transient', 'transient']);
  assert.deepStrictEqual([400, 401, 403, 404].map((status) => C.classifyError({ status })), ['permanent', 'permanent', 'permanent', 'permanent']);
  assert.strictEqual(C.classifyError({ code: 'ECONNRESET' }), 'transient');
  assert.strictEqual(C.classifyError({ status: 500 }), 'ambiguous');
  assert.deepStrictEqual([1, 2, 3, 4, 5, 6].map((a) => C.backoffMs(a, { rand: () => 1 })), [500, 1000, 2000, 4000, 8000, 8000], 'full step doubles then caps at 8000');
  assert.deepStrictEqual([1, 2, 3].map((a) => C.backoffMs(a, { rand: () => 0 })), [250, 500, 1000], 'jitter floor is half the step');
  const rnd = C.mulberry32(11);
  for (let a = 1; a <= 6; a++) {
    const step = Math.min(8000, 500 * Math.pow(2, a - 1)), v = C.backoffMs(a, { rand: rnd });
    assert.ok(v >= step / 2 - 1 && v <= step + 1, 'spec 8.3: wait ' + v + ' ms outside [' + step / 2 + ', ' + step + '] at retry ' + a);
  }
  const flaky = C.runWithRetry((i) => (i < 3 ? { ok: false, error: { status: 429 } } : { ok: true }), { rand: sleepless });
  assert.deepStrictEqual([flaky.ok, flaky.tries, flaky.waits.length], [true, 3, 2], 'two transient failures, then success');
  assert.ok(flaky.waits[1] > flaky.waits[0], 'the second wait is longer');
  const perm = C.runWithRetry(() => ({ ok: false, error: { status: 401 } }), { rand: sleepless });
  assert.deepStrictEqual([perm.ok, perm.tries, perm.gaveUp], [false, 1, 'permanent'], 'a permanent error is not retried');
  const forever = C.runWithRetry(() => ({ ok: false, error: { status: 503 } }), { rand: sleepless, maxAttempts: 4 });
  assert.deepStrictEqual([forever.tries, forever.waits.length, forever.gaveUp], [4, 3, 'exhausted'], 'transient errors retry up to the cap and then give up');
  const unsure = C.runWithRetry(() => ({ ok: false, error: { status: 500 } }), { rand: sleepless, idempotent: false });
  assert.deepStrictEqual([unsure.tries, unsure.gaveUp], [1, 'ambiguous'], 'an unclear failure on a write must not be repeated blindly');
  const readOnly = C.runWithRetry(() => ({ ok: false, error: { status: 500 } }), { rand: sleepless, idempotent: true, maxAttempts: 3 });
  assert.strictEqual(readOnly.tries, 3, 'the same failure on a read is retried');
});

test('spec 8.3 permission gate: dangerous commands and out-of-bounds paths refused, ordinary work allowed', () => {
  const run = (cmd) => C.gate({ name: 'run_cmd', args: { cmd } });
  for (const cmd of ['rm -rf ' + C.ROOT, 'rm -fr /', 'sudo ls', 'mkfs.ext4 /dev/sda1', 'dd if=/dev/zero of=/dev/sda', ':(){ :|:& };:']) {
    assert.strictEqual(run(cmd).allow, false, 'spec 8.3: "' + cmd + '" must be refused');
  }
  for (const cmd of ['ls -la', 'git status', 'echo hello > notes.txt', 'rm notes.txt']) {
    assert.strictEqual(run(cmd).allow, true, 'spec 8.3: "' + cmd + '" is ordinary work and must pass');
  }
  assert.strictEqual(C.gate({ name: 'read_file', args: { path: C.ROOT + '/a/README.md' } }).allow, true);
  assert.strictEqual(C.gate({ name: 'read_file', args: { path: '/etc/passwd' } }).allow, false, 'outside the root');
  assert.strictEqual(C.gate({ name: 'read_file', args: { path: C.ROOT + '/../secrets' } }).allow, false, 'a .. segment escapes the root');
  assert.strictEqual(C.gate({ name: 'list_files', args: { path: C.ROOT + '-evil' } }).allow, false, 'a sibling directory with the same prefix is outside');
  assert.strictEqual(C.gate({ name: 'format_disk', args: {} }).allow, false, 'unknown tools are refused');
});

test('spec 8.3 read before write: an unread file cannot be edited, a read one can', () => {
  const g = C.createEditGuard();
  const first = g.check('edit_file', 'notes/todo.md');
  assert.strictEqual(first.allow, false);
  assert.ok(first.reason.includes('notes/todo.md'), 'the refusal names the file');
  g.noteRead('notes/todo.md');
  assert.strictEqual(g.check('edit_file', 'notes/todo.md').allow, true, 'after a read the edit is allowed');
  assert.strictEqual(g.check('edit_file', 'notes/other.md').allow, false, 'reading one file does not unlock another');
  assert.strictEqual(g.check('read_file', 'notes/other.md').allow, true, 'reading itself is never blocked');
});

test('spec 8.3 too many tools: full definitions only for the core set, the rest by name, and a pick pulls its definition in', () => {
  const cat = C.buildCatalog(), sel = C.selectTools(cat, C.CORE_TOOLS);
  assert.strictEqual(cat.length, 80, 'the demo catalogue has 80 tools');
  assert.strictEqual(sel.full.length, C.CORE_TOOLS.length);
  assert.strictEqual(sel.deferred.length, 80 - C.CORE_TOOLS.length);
  assert.ok(sel.tokensAll / sel.tokensNow >= 2, 'spec 8.3: listing by name must cut the prompt at least in half, got ' + sel.tokensAll + ' -> ' + sel.tokensNow);
  const pick = sel.deferred[0].name;
  const r = C.expandTool(sel, pick);
  assert.strictEqual(r.needsRetry, true, 'the first pick of a name-only tool is intercepted once');
  assert.ok(r.selection.full.some((t) => t.name === pick) && !r.selection.deferred.some((t) => t.name === pick));
  assert.strictEqual(r.selection.full.length, sel.full.length + 1);
  assert.strictEqual(C.expandTool(sel, 'no_such_tool').needsRetry, false);
  assert.strictEqual(C.expandTool(r.selection, pick).needsRetry, false, 'once expanded it is just a normal tool');
});

test('spec 8.3 no function calling: XML requests parse to the same structure, bad XML does not crash, and the loop still finishes', () => {
  const x = C.fromXml('好的。<tool_call><name>read_file</name><arguments><path>' + C.ROOT + '/a</path><limit>5</limit></arguments></tool_call>');
  assert.strictEqual(x.content, '好的。', 'prose outside the tags is kept');
  assert.deepStrictEqual(x.toolCalls.map((c) => [c.name, c.args]), [['read_file', { path: C.ROOT + '/a', limit: '5' }]]);
  const two = C.fromXml('<tool_call><name>a</name><arguments><x>1</x></arguments></tool_call>然后<tool_call><name>b</name><arguments><y>2</y></arguments></tool_call>');
  assert.deepStrictEqual(two.toolCalls.map((c) => c.name), ['a', 'b']);
  assert.notStrictEqual(two.toolCalls[0].id, two.toolCalls[1].id, 'every request needs its own id');
  const broken = C.fromXml('我想读文件 <tool_call><name>read_file</name><arguments><path>x</arguments>');
  assert.ok(!broken.toolCalls, 'a request that never closes is not a request');
  assert.ok(broken.content.includes('我想读文件'), 'and the text is kept as ordinary talk');
  // run the real loop with a model that can only write XML text
  const xmlModel = (msgs) => {
    const r = C.scriptedModel(msgs);
    if (!r.toolCalls) return C.fromXml(r.content);
    const c = r.toolCalls[0];
    return C.fromXml(r.content + '<tool_call><name>' + c.name + '</name><arguments>' + Object.entries(c.args).map(([k, v]) => '<' + k + '>' + v + '</' + k + '>').join('') + '</arguments></tool_call>');
  };
  const viaXml = C.runLoop({ model: xmlModel }), native = C.runLoop({});
  assert.strictEqual(viaXml.stoppedBy, 'no-tool-request');
  assert.strictEqual(viaXml.messages[viaXml.messages.length - 1].content, native.messages[native.messages.length - 1].content, 'same final answer as the native tool-calling model');
});

test('spec 8.3 the eight card demos are computed, not typed: they carry the numbers the functions return', () => {
  const d = C.cardDemos();
  assert.deepStrictEqual(Object.keys(d), C.CARD_KEYS, 'one demo per card, in card order');
  for (const k of C.CARD_KEYS) assert.ok(d[k].length > 10, 'demo ' + k + ' is empty');
  const sel = C.selectTools(C.buildCatalog(), C.CORE_TOOLS);
  assert.ok(d.tools.includes(sel.tokensAll.toLocaleString('en-US')) && d.tools.includes(sel.tokensNow.toLocaleString('en-US')), 'the tools demo shows the computed token counts');
  assert.ok(d.pairing.includes('补 1 条') && d.pairing.includes('删 1 条'));
  assert.ok(d.gate.includes('拒绝') && d.readfirst.includes('拒绝') && d.readfirst.includes('放行'));
  assert.ok(d.coerce.includes('"limit":10') && d.coerce.includes('"verbose":true'));
  assert.ok(d.retry.includes('共 3 次') && d.retry.includes('401'));
});

test('spec 8.4 world-state gate: reject, fix, pass; the state and the retelling follow the rules', () => {
  const w0 = C.newWorld(), before = JSON.stringify(w0);
  const r = C.runLife(w0);
  assert.deepStrictEqual(r.steps.map((s) => s.verdict.status), ['reject', 'fix', 'pass'], 'spec 8.4: one of each');
  assert.strictEqual(JSON.stringify(w0), before, 'running the gate must not mutate the starting world');
  assert.strictEqual(r.world.balance, 1200 - 98 - 320, 'spec 8.4: balance is start minus the fixed meal price minus the coat');
  assert.deepStrictEqual(r.world.transit, [{ item: '外套', eta: '10-24' }], 'spec 8.4: the coat is on its way, three days after 10-21');
  assert.deepStrictEqual(r.world.today, ['本地午餐 龙井虾仁 98']);
  assert.strictEqual(r.world.city, '广州', 'a rejected trip must not move the world');
  assert.ok(!r.retell.includes('杭州') && !r.retell.includes('48'), 'spec 8.4: the retelling holds nothing the gate rejected or corrected: ' + r.retell);
  assert.ok(r.retell.includes('98') && r.retell.includes('320') && r.retell.includes('10-24'));
  assert.strictEqual(C.formatWorld(r.world), '所在地: 广州 · 余额: 782 · 拥有: [雨伞, 书×3]\n在路上: [外套 → 10-24 到]\n今日: 本地午餐 龙井虾仁 98');
});

test('spec 8.4 world-state gate: the verdicts depend on the world and the request, not on a script', () => {
  const w = C.newWorld();
  assert.strictEqual(C.judge(w, { kind: 'trip', city: '杭州', inDays: 1 }).status, 'pass', 'a trip a day out is possible');
  assert.strictEqual(C.judge(w, { kind: 'trip', city: '广州', inDays: 0 }).status, 'pass', 'staying put is always fine');
  assert.strictEqual(C.judge(w, { kind: 'trip', city: '杭州', inDays: 0 }).status, 'reject');
  const poor = Object.assign(C.newWorld(), { balance: 100 });
  const broke = C.judge(poor, { kind: 'buy', item: '外套', price: 320 });
  assert.strictEqual(broke.status, 'reject');
  assert.ok(broke.note.includes('100'), 'the refusal quotes the real balance: ' + broke.note);
  assert.strictEqual(C.judge(w, { kind: 'meal', item: '龙井虾仁', price: 100 }).status, 'pass', 'close to the market price is fine');
  assert.strictEqual(C.judge(w, { kind: 'meal', item: '龙井虾仁', price: 98 * 0.7 }).status, 'pass', 'the floor is inclusive');
  const dear = C.judge(w, { kind: 'meal', item: '龙井虾仁', price: 300 });
  assert.deepStrictEqual([dear.status, dear.price], ['fix', 98], 'far above market is also corrected');
  assert.ok(dear.note.includes('高于'));
  const late = Object.assign(C.newWorld(), { date: '2026-10-30' });
  const out = C.runLife(late, [{ kind: 'buy', item: '外套', price: 320 }]);
  assert.strictEqual(out.world.transit[0].eta, '11-02', 'delivery date rolls over the month');
  const planned = C.runLife(C.newWorld(), [{ kind: 'trip', city: '杭州', inDays: 2 }]);
  assert.strictEqual(planned.world.city, '广州', 'a trip two days out does not move today');
  assert.ok(planned.retell.includes('杭州') && planned.world.today.some((t) => t.includes('杭州')));
  assert.strictEqual(C.runLife(C.newWorld(), []).retell, '今天没什么特别的事。');
});

test('spec 8.5 fixed views: ?view=1..6 parse, everything else falls back to the normal entry, flip stays in range', () => {
  for (let n = 1; n <= 6; n++) assert.strictEqual(C.parseView('?view=' + n).view, n);
  for (const bad of ['', '?view=0', '?view=7', '?view=abc', '?view=', '?view=1.5', '?view=-2', '?view=01', '?view=%20', '?x=1']) {
    assert.strictEqual(C.parseView(bad).view, null, 'spec 8.5: "' + bad + '" must fall back to the normal entry');
  }
  assert.deepStrictEqual(C.parseView('?view=4&flip=all').flip, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepStrictEqual(C.parseView('?view=4&flip=6,1,1,9,x,0').flip, [1, 6], 'sorted, deduplicated, out-of-range dropped');
  assert.deepStrictEqual(C.parseView('?view=3&flip=all').flip, [], 'flip only means something on scene 4');
  assert.deepStrictEqual(C.parseView('?flip=all').flip, []);
});

test('spec 5 dwell: grows with the text, never below 12 s or above 40 s, and always covers the animation', () => {
  assert.strictEqual(C.dwellMs(0, 0), C.DWELL_MIN);
  assert.strictEqual(C.dwellMs(1e6, 0), C.DWELL_MAX);
  let prev = 0;
  for (const chars of [0, 100, 200, 300, 400, 500]) { const v = C.dwellMs(chars, 1000); assert.ok(v >= prev, 'dwell must not shrink as text grows'); prev = v; }
  assert.ok(C.dwellMs(200, 10000) > C.dwellMs(200, 0), 'a longer animation earns a longer stay');
  for (const anim of [0, 600, 3700, 10800]) assert.ok(C.dwellMs(100, anim) >= Math.min(C.DWELL_MAX, anim + 1000), 'a scene must not be left before its animation ends');
});
