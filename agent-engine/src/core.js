// Pure logic for "agent 引擎是什么": a tiny real agent loop, the eight rescues from the failure cards, the world-state gate,
// and the page's view helpers. No DOM, so Node tests can require it. These are teaching-size implementations,
// not the code of Claude Code or of any product the page talks about.
(function (root) {
  'use strict';

  // ---------- small helpers ----------
  const estimateTokens = (s) => Math.ceil(String(s).length / 4);        // coarse: 4 characters a token, only used for before/after ratios
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  function mulberry32(seed) {                                           // deterministic random numbers for the retry jitter
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const msgTokens = (m) => estimateTokens((m.content || '') + (m.toolCalls ? JSON.stringify(m.toolCalls) : ''));
  const totalTokens = (h) => h.reduce((n, m) => n + msgTokens(m), 0);

  // ---------- the fake workspace the demo loop explores ----------
  // Most recently touched first, which is the order list_files returns.
  const PROJECTS = ['playground', 'recallnest', 'notes', 'agent-notes', 'blog', 'bookmarks', 'chat-export', 'cli-tools', 'dotfiles',
    'draw-box', 'ebooks', 'gear-lab', 'icons', 'journal', 'kitchen-timer', 'map-lab', 'mini-site', 'paper-craft', 'poster-kit',
    'prompts', 'scratch', 'slides', 'sound-lab', 'tarot-deck', 'todo-app', 'translate', 'video-cut', 'weekly-report', 'wiki-sync',
    'writing', 'zine'];
  const ROOT = '~/projects';
  const FILES = { [ROOT + '/playground/README.md']: '# playground\n做着玩的小东西，一个玩意一个子目录，共用一个页面站点。\n' };

  // ---------- tools, gate, and the scripted model ----------
  const TOOLS = {
    list_files: { run: (a, ws) => (ws.dirs[a.path] || []).map((n) => n + '/').join(' ') },
    read_file: { run: (a, ws) => (a.path in ws.files ? ws.files[a.path] : '没有这个文件') },
    run_cmd: { run: (a) => '(演示环境不真的执行：' + a.cmd + ')' },
  };
  const DANGEROUS = [/\brm\s+-[a-z]*[rf]/i, /\bsudo\b/, /\bmkfs\b/, /\bdd\s+if=/, />\s*\/dev\/(sd|disk|nvme)/, /:\(\)\s*\{/];

  // The permission gate: runs before every tool call. A refusal goes back to the model as an ordinary tool result.
  function gate(call, policy) {
    const root = (policy && policy.root) || ROOT;
    const a = call.args || {};
    if (!TOOLS[call.name]) return { allow: false, reason: '没有这个工具：' + call.name };
    if (call.name === 'list_files' || call.name === 'read_file') {
      const p = String(a.path || '');
      if (!(p === root || p.startsWith(root + '/')) || p.split('/').includes('..')) return { allow: false, reason: '路径在 ' + root + ' 之外' };
    }
    if (call.name === 'run_cmd' && DANGEROUS.some((re) => re.test(String(a.cmd || '')))) return { allow: false, reason: '命令会删除或破坏数据' };
    return { allow: true };
  }

  // A model that only ever returns text or a tool request. It reads the messages it is given, so what it says depends on the tool results.
  function scriptedModel(messages) {
    const last = messages[messages.length - 1];
    const calls = messages.filter((m) => m.toolCalls && m.toolCalls.length).length;
    if (last.role === 'user') {
      return { content: '我需要先看一下目录。', toolCalls: [{ id: 'call_' + (calls + 1), name: 'list_files', args: { path: ROOT } }] };
    }
    if (last.role === 'tool' && last.name === 'list_files') {
      const names = last.content.split(' ').filter(Boolean).map((s) => s.replace(/\/$/, ''));
      if (!names.length) return { content: '目录是空的。' };
      return { content: '', toolCalls: [{ id: 'call_' + (calls + 1), name: 'read_file', args: { path: ROOT + '/' + names[0] + '/README.md' } }] };
    }
    if (last.role === 'tool' && last.name === 'read_file') {
      const listing = messages.filter((m) => m.role === 'tool' && m.name === 'list_files').pop();
      const names = listing ? listing.content.split(' ').filter(Boolean).map((s) => s.replace(/\/$/, '')) : [];
      const title = last.content.startsWith('#') ? last.content.split('\n')[0].replace(/^#\s*/, '') : '';
      const recent = names.slice(0, 2).join(' 和 ');
      return { content: '一共 ' + names.length + ' 个目录，最近动过的是 ' + recent + '。' + (title ? '第一个的 README 开头是「' + title + '」。' : '') };
    }
    return { content: '好的。' };
  }

  function newWorkspace(projects) {
    const dirs = { [ROOT]: (projects || PROJECTS).slice() };
    return { dirs, files: Object.assign({}, FILES) };
  }
  function demoMessages() {
    return [
      { role: 'system', content: '你是一个助手。工具：list_files, read_file, run_cmd' },
      { role: 'user', content: '帮我看看 ' + ROOT + ' 里都有什么' },
    ];
  }

  // Scene 2: the API alone. One call, and whatever the model asked for just sits there.
  function apiOnly(model, messages) {
    const reply = model(messages);
    const msg = { role: 'assistant', content: reply.content || '' };
    if (reply.toolCalls && reply.toolCalls.length) msg.toolCalls = reply.toolCalls;
    const out = messages.concat([msg]);
    return { messages: out, stuck: !!msg.toolCalls, last: msg };
  }

  // Scene 3: the loop. Events are what the page replays: station 0..5 is the ring position.
  function runLoop(opts) {
    const model = opts.model || scriptedModel, ws = opts.workspace || newWorkspace(), maxTurns = opts.maxTurns || 8;
    const messages = (opts.messages || demoMessages()).slice();
    const events = [];
    let turn = 0, denied = 0, stoppedBy = 'max-turns';
    let fresh = messages.map((_, i) => i);
    while (turn < maxTurns) {
      turn++;
      events.push({ turn, phase: 'context', station: 0, added: fresh });
      fresh = [];
      const reply = model(messages);
      const asst = { role: 'assistant', content: reply.content || '' };
      if (reply.toolCalls && reply.toolCalls.length) asst.toolCalls = reply.toolCalls;
      messages.push(asst);
      events.push({ turn, phase: 'model', station: 1, added: [messages.length - 1] });
      if (!asst.toolCalls) { events.push({ turn, phase: 'output', station: null, added: [] }); stoppedBy = 'no-tool-request'; break; }
      for (const call of asst.toolCalls) {
        const verdict = (opts.gate || gate)(call);
        events.push({ turn, phase: 'gate', station: 2, allow: verdict.allow, reason: verdict.reason || null, added: [] });
        let content;
        if (verdict.allow) {
          content = TOOLS[call.name].run(call.args, ws);
          events.push({ turn, phase: 'tool', station: 3, added: [] });
        } else { denied++; content = '权限门拒绝：' + verdict.reason; }
        messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content });
        events.push({ turn, phase: 'fill', station: 4, added: [messages.length - 1] });
      }
      events.push({ turn, phase: 'more', station: 5, added: [] });
    }
    return { messages, events, turns: turn, denied, stoppedBy };
  }

  // One line per message for the messages[] panel.
  function clipJson(s, n) { const j = JSON.stringify(s); return j.length > n ? j.slice(0, n) + '…' : j; }
  function formatMessage(m) {
    if (m.role === 'system') return { cls: 'sys', label: 'system', text: m.content };
    if (m.role === 'user') return { cls: 'user', label: 'user', text: m.content };
    if (m.role === 'assistant') {
      if (m.toolCalls && m.toolCalls.length) {
        return { cls: 'asst', label: 'assistant', text: m.toolCalls.map((c) => 'tool_call ' + c.name + '(' + JSON.stringify(c.args).replace(/"([a-z_]+)":/g, '$1:') + ')').join(' ') };
      }
      return { cls: 'asst', label: 'assistant', text: m.content, note: '（纯文字，没有工具请求）' };
    }
    if (m.name === 'list_files') {
      const names = m.content.split(' ').filter(Boolean);
      return { cls: 'toolr', label: 'tool', text: names.slice(0, 3).join(' ') + (names.length > 3 ? ' … (' + names.length + ' 项)' : '') };
    }
    return { cls: 'toolr', label: 'tool', text: clipJson(m.content, 32) };
  }
  const STATION_NAMES = ['① 拼上下文', '② 调模型', '③ 权限门', '④ 执行工具', '⑤ 结果回填', '⑥ 还要工具？'];

  // ---------- the eight rescues (scene 4) ----------
  // 1. tool request / result pairing
  function repairPairing(history) {
    const called = new Set(), answered = new Set();
    history.forEach((m) => { (m.toolCalls || []).forEach((c) => called.add(c.id)); if (m.role === 'tool') answered.add(m.toolCallId); });
    const out = []; let added = 0, removed = 0;
    for (const m of history) {
      if (m.role === 'tool' && !called.has(m.toolCallId)) { removed++; continue; }     // a result nobody asked for
      out.push(m);
      for (const c of m.toolCalls || []) {
        if (!answered.has(c.id)) { out.push({ role: 'tool', toolCallId: c.id, name: c.name, content: '已中断，没有拿到结果', synthetic: true }); added++; }
      }
    }
    return { history: out, added, removed };
  }
  function unpaired(history) {     // how many requests lack a result plus results lack a request, for tests and checks
    const r = repairPairing(history); return r.added + r.removed;
  }

  // 2. argument types
  function coerceArgs(schema, args) {
    const out = Object.assign({}, args), changed = [], failed = [];
    for (const k of Object.keys(schema)) {
      if (!(k in out)) continue;
      const want = schema[k], v = out[k];
      let next = v;
      if (typeof v === 'string' && (want === 'integer' || want === 'number')) {
        const re = want === 'integer' ? /^\s*-?\d+\s*$/ : /^\s*-?\d+(\.\d+)?\s*$/;
        if (re.test(v)) next = Number(v); else failed.push(k);
      } else if (typeof v === 'string' && want === 'boolean') {
        if (/^true$/i.test(v.trim())) next = true; else if (/^false$/i.test(v.trim())) next = false; else failed.push(k);
      } else if (typeof v === 'number' && want === 'string') next = String(v);
      if (next !== v) { out[k] = next; changed.push(k); }
    }
    return { args: out, changed, failed };
  }

  // 3. context budget: compact the middle, never the system message or the newest turns; never cut a pair in half
  function compact(history, opts) {
    const limit = opts.limitTokens, keepLast = opts.keepLast || 2;
    const before = { n: history.length, tokens: totalTokens(history) };
    if (before.tokens <= limit) return { history, compacted: false, before, after: before };
    const head = history.filter((m, i) => m.role === 'system' && i === 0);
    let cut = Math.max(head.length, history.length - keepLast);
    while (cut > head.length && history[cut].role === 'tool') cut--;                 // the tail must not start with an orphan result
    const middle = history.slice(head.length, cut), tail = history.slice(cut);
    const used = [...new Set(middle.filter((m) => m.role === 'tool').map((m) => m.name))];
    const summary = { role: 'user', content: '[摘要] 前面 ' + middle.length + ' 条消息已压缩' + (used.length ? '，期间用过：' + used.join('、') : '') + '。', synthetic: true };
    const out = head.concat(middle.length ? [summary] : [], tail);
    return { history: out, compacted: true, before, after: { n: out.length, tokens: totalTokens(out) } };
  }
  function spill(output, opts) {      // a huge tool output goes to a scratch file; the model gets one line
    const max = opts.maxChars;
    if (output.length <= max) return { content: output, spilled: false };
    return { content: '（输出 ' + output.length + ' 字，已存入临时文件 ' + opts.id + '，需要时再按行读取）', spilled: true, chars: output.length };
  }

  // 4. errors, retries, backoff
  function classifyError(e) {
    const s = e.status, c = e.code;
    if (s === 429 || s === 408 || s === 502 || s === 503 || s === 504 || c === 'ETIMEDOUT' || c === 'ECONNRESET') return 'transient';
    if (s === 400 || s === 401 || s === 403 || s === 404 || s === 422) return 'permanent';
    return 'ambiguous';
  }
  function backoffMs(attempt, opts) {          // attempt 1 is the first retry; jitter keeps it in [half, full] of the exponential step
    const base = (opts && opts.base) || 500, cap = (opts && opts.cap) || 8000, rand = (opts && opts.rand) || Math.random;
    const step = Math.min(cap, base * Math.pow(2, attempt - 1));
    return Math.round(step * (0.5 + 0.5 * rand()));
  }
  function runWithRetry(attemptFn, opts) {
    const max = (opts && opts.maxAttempts) || 4, idempotent = !opts || opts.idempotent !== false;
    const waits = [], errors = [];
    for (let i = 1; i <= max; i++) {
      const r = attemptFn(i);
      if (r.ok) return { ok: true, tries: i, waits, errors, gaveUp: null };
      errors.push(r.error);
      const kind = classifyError(r.error);
      if (kind === 'permanent') return { ok: false, tries: i, waits, errors, gaveUp: 'permanent' };
      if (kind === 'ambiguous' && !idempotent) return { ok: false, tries: i, waits, errors, gaveUp: 'ambiguous' };   // retrying could repeat a side effect
      if (i === max) return { ok: false, tries: i, waits, errors, gaveUp: 'exhausted' };
      waits.push(backoffMs(i, opts));
    }
    return { ok: false, tries: max, waits, errors, gaveUp: 'exhausted' };
  }

  // 6. read before write
  function createEditGuard() {
    const read = new Set();
    return {
      noteRead(path) { read.add(path); },
      check(toolName, path) {
        if (toolName === 'edit_file' && !read.has(path)) return { allow: false, reason: path + ' 在这个会话里还没读过' };
        return { allow: true };
      },
    };
  }

  // 7. too many tools: the core set keeps full definitions, the rest only a name and one line
  const CORE_TOOLS = ['read_file', 'write_file', 'edit_file', 'list_files', 'run_cmd', 'grep', 'glob', 'web_fetch'];
  const OTHER_TOOLS = ['web_search', 'todo', 'ask_user', 'task', 'notebook_edit', 'screenshot', 'clipboard', 'notify'];
  function buildCatalog() {
    const out = CORE_TOOLS.concat(OTHER_TOOLS).map((name) => ({ name, description: '内置工具 ' + name + '：对工作区做一件具体的事，参数见定义。', params: { path: 'string', query: 'string', limit: 'integer' } }));
    for (const svc of ['calendar', 'mail', 'notes', 'drive', 'issues', 'chat', 'map', 'shop']) {
      for (const act of ['list', 'get', 'create', 'update', 'delete', 'search', 'share', 'export']) {
        out.push({ name: svc + '_' + act, description: '对 ' + svc + ' 做 ' + act + '：外部服务接入的工具，参数见定义。', params: { id: 'string', query: 'string', limit: 'integer' } });
      }
    }
    return out;
  }
  function selectTools(catalog, coreNames) {
    const full = catalog.filter((t) => coreNames.includes(t.name));
    const deferred = catalog.filter((t) => !coreNames.includes(t.name));
    const defTokens = (t) => estimateTokens(JSON.stringify(t));
    const nameLine = (t) => t.name + '：' + t.description.split('：')[0];
    return {
      full, deferred,
      tokensAll: catalog.reduce((n, t) => n + defTokens(t), 0),
      tokensNow: full.reduce((n, t) => n + defTokens(t), 0) + deferred.reduce((n, t) => n + estimateTokens(nameLine(t)), 0),
    };
  }
  function expandTool(selection, name) {     // the model picked a name it only knew by name: the engine intercepts once, injects the full definition
    const t = selection.deferred.find((x) => x.name === name);
    if (!t) return { needsRetry: false, selection };
    return { needsRetry: true, selection: Object.assign({}, selection, { full: selection.full.concat([t]), deferred: selection.deferred.filter((x) => x !== t) }) };
  }

  // 8. a model without native function calling is taught to write XML
  function fromXml(text) {
    const calls = []; let n = 0;
    const re = /<tool_call>\s*<name>\s*([A-Za-z_][\w-]*)\s*<\/name>\s*<arguments>([\s\S]*?)<\/arguments>\s*<\/tool_call>/g;
    const prose = String(text).replace(re, (_, name, body) => {
      const args = {}; let m;
      const ar = /<([A-Za-z_]\w*)>([\s\S]*?)<\/\1>/g;
      while ((m = ar.exec(body))) args[m[1]] = m[2].trim();
      calls.push({ id: 'xml_' + (++n), name, args });
      return '';
    }).trim();
    const msg = { role: 'assistant', content: prose };
    if (calls.length) msg.toolCalls = calls;
    return msg;
  }

  // ---------- the eight demos shown on the flipped cards ----------
  function cardDemos() {
    const out = {};
    const hist = [
      { role: 'user', content: '看看目录' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'list_files', args: { path: ROOT } }] },
      { role: 'user', content: '算了，改查 README' },
      { role: 'tool', toolCallId: 'c9', name: 'read_file', content: '（上一次取消留下的结果）' },
      { role: 'assistant', content: '好的。' },
    ];
    const rp = repairPairing(hist);
    out.pairing = hist.length + ' 条 → ' + rp.history.length + ' 条：补 ' + rp.added + ' 条「已中断」，删 ' + rp.removed + ' 条孤儿结果';

    const co = coerceArgs({ limit: 'integer', verbose: 'boolean' }, { limit: '10', verbose: 'true' });
    out.coerce = '{"limit":"10","verbose":"true"} → ' + JSON.stringify(co.args);

    const big = [{ role: 'system', content: '你是一个助手。' }, { role: 'user', content: '读一下日志' }];
    for (let i = 0; i < 4; i++) {
      big.push({ role: 'assistant', content: '', toolCalls: [{ id: 'b' + i, name: 'read_file', args: { path: ROOT + '/log' + i } }] });
      big.push({ role: 'tool', toolCallId: 'b' + i, name: 'read_file', content: '日志行 '.repeat(500) });
    }
    big.push({ role: 'assistant', content: '日志里有三处报错。' });
    const cp = compact(big, { limitTokens: 2000, keepLast: 2 });
    const sp = spill('x'.repeat(12000), { maxChars: 4000, id: '#1' });
    out.context = cp.before.n + ' 条 / 约 ' + cp.before.tokens.toLocaleString('en-US') + ' token → ' + cp.after.n + ' 条 / 约 ' + cp.after.tokens.toLocaleString('en-US') +
      ' token；一次 ' + sp.chars.toLocaleString('en-US') + ' 字的输出只给模型一行';

    const rnd = mulberry32(7);
    const flaky = runWithRetry((i) => (i < 3 ? { ok: false, error: { status: 429 } } : { ok: true }), { rand: rnd });
    const bad = runWithRetry(() => ({ ok: false, error: { status: 401 } }), { rand: rnd });
    out.retry = '429 → 等 ' + (flaky.waits[0] / 1000).toFixed(1) + ' 秒 → 429 → 等 ' + (flaky.waits[1] / 1000).toFixed(1) + ' 秒 → 成功（共 ' + flaky.tries + ' 次）；401 → 试 ' + bad.tries + ' 次就停（永久错误）';

    const g = gate({ name: 'run_cmd', args: { cmd: 'rm -rf ' + ROOT } });
    out.gate = 'run_cmd "rm -rf ' + ROOT + '" → ' + (g.allow ? '放行' : '拒绝：' + g.reason + '，这句话作为工具结果还给模型');

    const guard = createEditGuard();
    const first = guard.check('edit_file', 'notes/todo.md'); guard.noteRead('notes/todo.md'); const second = guard.check('edit_file', 'notes/todo.md');
    out.readfirst = 'edit_file(notes/todo.md) → ' + (first.allow ? '放行' : '拒绝：' + first.reason) + '；读过之后 → ' + (second.allow ? '放行' : '拒绝');

    const sel = selectTools(buildCatalog(), CORE_TOOLS);
    out.tools = (sel.full.length + sel.deferred.length) + ' 个工具的完整定义约 ' + sel.tokensAll.toLocaleString('en-US') + ' token → 常驻 ' + sel.full.length + ' 个，其余 ' + sel.deferred.length + ' 个只留名字，约 ' + sel.tokensNow.toLocaleString('en-US') + ' token';

    const x = fromXml('好的。<tool_call><name>list_files</name><arguments><path>' + ROOT + '</path></arguments></tool_call>');
    out.xml = '<tool_call><name>list_files</name>… → ' + JSON.stringify({ name: x.toolCalls[0].name, args: x.toolCalls[0].args });
    return out;
  }
  const CARD_KEYS = ['pairing', 'coerce', 'context', 'retry', 'gate', 'readfirst', 'tools', 'xml'];

  // ---------- scene 6: a world state the model cannot overwrite ----------
  const MARKET = { '龙井虾仁': 98 };
  const SHIPPING_DAYS = 3;
  function newWorld() { return { city: '广州', balance: 1200, date: '2026-10-21', owns: ['雨伞', '书×3'], transit: [], today: [] }; }
  function addDays(iso, n) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(5, 10); }
  // The gate judges one request against the world: reject, fix, or pass. Only reject-free results reach the state.
  function judge(world, p) {
    if (p.kind === 'trip') {
      if (p.city === world.city) return { status: 'pass', note: p.city + '：就在本地 → 通过' };
      if (!(p.inDays >= 1)) return { status: 'reject', note: p.city + '：今早还在' + world.city + '，去不了 → 驳回' };
      return { status: 'pass', note: p.city + '：行程在 ' + p.inDays + ' 天后 → 通过' };
    }
    if (p.kind === 'meal') {
      const market = MARKET[p.item];
      if (market && (p.price < market * 0.7 || p.price > market * 1.5)) return { status: 'fix', price: market, note: p.item + ' ' + p.price + ' 元' + (p.price < market ? '低于' : '高于') + '市价 → 改成 ' + market };
      return { status: 'pass', price: p.price, note: p.item + ' ' + p.price + ' 元 → 通过' };
    }
    if (p.kind === 'buy') {
      if (p.price > world.balance) return { status: 'reject', note: p.item + ' ' + p.price + '，余额只有 ' + world.balance + ' → 驳回' };
      return { status: 'pass', price: p.price, note: p.item + ' ' + p.price + '，余额够 → 通过，' + SHIPPING_DAYS + ' 天后到' };
    }
    return { status: 'reject', note: '看不懂的请求 → 驳回' };
  }
  function applyVerdict(world, p, v) {
    if (v.status === 'reject') return world;
    const w = JSON.parse(JSON.stringify(world));
    if (p.kind === 'meal') { w.balance -= v.price; w.today.push('本地午餐 ' + p.item + ' ' + v.price); }
    if (p.kind === 'buy') { w.balance -= v.price; w.transit.push({ item: p.item, eta: addDays(w.date, SHIPPING_DAYS) }); }
    if (p.kind === 'trip' && p.city !== w.city) w.today.push('已订 ' + p.city + ' 行程，' + p.inDays + ' 天后');
    return w;
  }
  const LIFE_PROPOSALS = [
    { kind: 'trip', city: '杭州', inDays: 0 },
    { kind: 'meal', item: '龙井虾仁', price: 48 },
    { kind: 'buy', item: '外套', price: 320 },
  ];
  function runLife(world0, proposals) {
    let world = world0 || newWorld();
    const start = world, steps = [];
    for (const p of proposals || LIFE_PROPOSALS) {
      const verdict = judge(world, p);
      world = applyVerdict(world, p, verdict);
      steps.push({ proposal: p, verdict });
    }
    return { start, world, steps, retell: narrate(steps, world) };
  }
  // The expression layer only retells what passed, using the gate's numbers rather than the model's.
  function narrate(steps, world) {
    const parts = [];
    for (const s of steps) {
      if (s.verdict.status === 'reject') continue;
      const p = s.proposal;
      if (p.kind === 'meal') parts.push('在' + world.city + '吃了' + p.item + '（' + s.verdict.price + ' 元）');
      if (p.kind === 'buy') parts.push('买了件' + p.item + '（' + s.verdict.price + ' 元），' + world.transit.find((t) => t.item === p.item).eta + ' 到');
      if (p.kind === 'trip' && p.city !== world.city) parts.push('订了' + p.city + '的行程');
    }
    return parts.length ? '今天' + parts.join('，') + '。' : '今天没什么特别的事。';
  }
  function formatWorld(w) {
    const lines = ['所在地: ' + w.city + ' · 余额: ' + w.balance + ' · 拥有: [' + w.owns.join(', ') + ']'];
    if (w.transit.length) lines.push('在路上: [' + w.transit.map((t) => t.item + ' → ' + t.eta + ' 到').join(', ') + ']');
    if (w.today.length) lines.push('今日: ' + w.today.join('；'));
    return lines.join('\n');
  }

  // ---------- page helpers ----------
  const SCENES = 6;
  // ?view=1..6 freezes a scene; ?flip=all|1,6 flips cards on scene 4. Anything else leaves the normal entry alone.
  function parseView(search) {
    const q = new URLSearchParams(search || '');
    const raw = q.get('view');
    const view = raw !== null && /^[1-6]$/.test(raw) ? Number(raw) : null;
    let flip = [];
    const f = q.get('flip');
    if (view === 4 && f) {
      if (f === 'all') flip = CARD_KEYS.map((_, i) => i + 1);
      else flip = [...new Set(f.split(',').map((s) => s.trim()).filter((s) => /^[1-8]$/.test(s)).map(Number))].sort((a, b) => a - b);
    }
    return { view, flip };
  }
  const READ_CPS = 12, DWELL_MIN = 12000, DWELL_MAX = 40000, DWELL_BASE = 3000;
  // How long autoplay stays on a scene: its animation, three seconds of grace, and time to read what is on screen.
  function dwellMs(visibleChars, animMs) {
    return clamp(Math.round((animMs || 0) + DWELL_BASE + (visibleChars / READ_CPS) * 1000), DWELL_MIN, DWELL_MAX);
  }
  const LOOP_EVENT_MS = 700;

  const api = {
    ROOT, PROJECTS, TOOLS, DANGEROUS, gate, scriptedModel, newWorkspace, demoMessages, apiOnly, runLoop, formatMessage, STATION_NAMES, LOOP_EVENT_MS,
    repairPairing, unpaired, coerceArgs, compact, spill, classifyError, backoffMs, runWithRetry, createEditGuard,
    CORE_TOOLS, buildCatalog, selectTools, expandTool, fromXml, estimateTokens, cardDemos, CARD_KEYS,
    MARKET, SHIPPING_DAYS, LIFE_PROPOSALS, newWorld, judge, applyVerdict, runLife, narrate, formatWorld,
    SCENES, parseView, dwellMs, READ_CPS, DWELL_MIN, DWELL_MAX, mulberry32,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AgentCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
