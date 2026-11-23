// 花城收租佬 · 模型座位。模型只在代码给的合法选项里挑一个编号、说一句嘴炮；
// 任何差错都退回规则机器人。key 只进 Authorization 头，不进任何返回值、提示或日志。
(function (root) {
  'use strict';

  // 座位类型表。加服务商只加一行（OpenAI 兼容的 chat/completions 接口）。
  const PROVIDERS = {
    bot: { label: '规则机器人', needsKey: false },
    deepseek: { label: 'DeepSeek', needsKey: true, url: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat' },
    qwen: { label: '通义千问', needsKey: true, url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-plus' },
  };
  const TIMEOUT_MS = 8000;
  const SAY_MAX = 30;
  const GIVE_UP_AFTER = 3;

  const OPTION_TEXT = {
    buy: (pd) => `买下（花 ${pd.cost}）`,
    skip: () => '不要',
    build: (pd) => `加盖一层（花 ${pd.cost}）`,
    pay: () => '付 50 打车走',
    wait: () => '等一轮',
    two: () => '掷两颗（走2-12格）',
    one: () => '掷一颗（走1-6格）',
  };
  const SITUATION = {
    buy: (M, pd) => `走到没人要的${M.BOARD[pd.square].name}（${M.AREAS[M.BOARD[pd.square].area].name}，标价 ${pd.cost}）`,
    build: (M, pd, g) => `走到自己的${M.BOARD[pd.square].name}，现在 ${g.level[pd.square]} 层`,
    jail: () => '被困在内环塞车',
    dice: (M, pd, g, i) => `站在${M.BOARD[g.players[i].pos].name}，要掷骰。前方：${ahead(M, g, i)}`,
  };

  // 前方 12 格里值得一提的格子，压成一行，省 token。
  function ahead(M, g, i) {
    const pos = g.players[i].pos;
    const out = [];
    for (let d = 1; d <= 12; d++) {
      const k = (pos + d) % M.BOARD.length;
      const s = M.BOARD[k];
      if (s.kind === 'prop') {
        const o = g.owner[k];
        if (o == null) out.push(`+${d}${s.name}空地${s.price}`);
        else if (o === i) out.push(`+${d}${s.name}自己的`);
        else if (g.players[o].alive) out.push(`+${d}${s.name}要交租${M.rentFor(g, k)}`);
      } else if (s.kind === 'tax') out.push(`+${d}交${s.amount}`);
      else if (s.kind === 'gotojail') out.push(`+${d}坐错地铁去塞车`);
      else if (s.kind === 'bonus') out.push(`+${d}收${s.amount}`);
    }
    return out.join('，');
  }

  function buildMessages(M, g, i) {
    const p = g.players[i];
    const pd = g.pending;
    const others = g.players.map((q, k) => (k !== i && q.alive ? `${q.name}${q.cash}` : null)).filter(Boolean).join('，');
    const opts = pd.options.map((o, k) => `${k + 1}=${OPTION_TEXT[o](pd)}`).join('；');
    const sys = `你在玩广州街区收租桌游，扮演「${p.name}」，讲话带点广州味。只回一行JSON：{"c":选项编号,"say":"不超过${SAY_MAX}字的一句嘴炮"}`;
    const user = `第${g.round}/${g.maxRounds}轮。你现金${p.cash}。对手：${others}。你${SITUATION[pd.type](M, pd, g, i)}。选项：${opts}。`;
    return [{ role: 'system', content: sys }, { role: 'user', content: user }];
  }

  // 从模型文字里抽 {"c":..,"say":..}；不合法返回 null。
  function parseReply(text, nOptions) {
    if (typeof text !== 'string') return null;
    const m = text.match(/\{[\s\S]*?\}/);
    if (!m) return null;
    let o;
    try { o = JSON.parse(m[0]); } catch (e) { return null; }
    const c = Number(o.c);
    if (!Number.isInteger(c) || c < 1 || c > nOptions) return null;
    return { index: c - 1, say: cleanSay(o.say) };
  }

  function cleanSay(s) {
    if (typeof s !== 'string') return '';
    // 像 key 的长串（sk-…、长段字母数字）一律抹掉，模型复读谁的 key 都不外露
    const t = s.replace(/[\r\n\t]+/g, ' ').replace(/[<>]/g, '').replace(/sk-[A-Za-z0-9_-]{6,}/g, '***').replace(/[A-Za-z0-9_-]{24,}/g, '***').trim();
    return Array.from(t).slice(0, SAY_MAX).join('');
  }

  // 把任何字符串里的 key 抹掉（兜底，正常路径上 key 本来就不会进这些字符串）。
  function redact(text, key) {
    if (!key || typeof text !== 'string' || key.length < 4) return text;
    return text.split(key).join('<key>');
  }

  function isCustomUrl(seat) {
    const prov = PROVIDERS[seat.provider];
    return !!(seat.url && prov && seat.url !== prov.url);
  }

  // 一次决定。返回 { choice, say, source: 'model'|'bot', note }，绝不抛错。
  async function decide(M, g, i, seat, opts) {
    const o = Object.assign({ fetch: (typeof fetch !== 'undefined' ? fetch.bind(root) : null), timeoutMs: TIMEOUT_MS }, opts || {});
    const pd = g.pending;
    const fallback = (note) => ({ choice: M.botChoice(g, i, M.BOT_TUNES[i % 4]), say: '', source: 'bot', note });
    if (!pd) return fallback('');
    const prov = PROVIDERS[seat.provider];
    if (!prov || !prov.needsKey) return fallback('');
    if (!seat.key) return fallback('没填 key，规则机器人代打');
    if (seat.failures >= GIVE_UP_AFTER) return fallback('连续出错，这局都由规则机器人代打');
    const url = seat.url || prov.url;
    if (!/^https:\/\//i.test(url)) return fallback('接口地址要以 https:// 开头');
    const body = { model: seat.model || prov.model, messages: buildMessages(M, g, i), max_tokens: 60, temperature: 0.8, stream: false };
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timer;
    const timeout = new Promise((_, rej) => { timer = setTimeout(() => { rej(Object.assign(new Error('timeout'), { kind: 'timeout' })); if (ctl) ctl.abort(); }, o.timeoutMs); });
    let note;
    try {
      const res = await Promise.race([
        o.fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + seat.key },
          body: JSON.stringify(body),
          signal: ctl ? ctl.signal : undefined,
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
        }),
        timeout,
      ]);
      if (!res || !res.ok) {
        const st = res ? res.status : 0;
        note = st === 401 || st === 403 ? 'key 不对或没有权限' : st === 402 || st === 429 ? '余额不够或请求太频繁' : `服务商回了错误（${st}）`;
      } else {
        const data = await Promise.race([res.json(), timeout]);
        const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        const r = parseReply(text, pd.options.length);
        if (r) {
          seat.failures = 0;
          return { choice: pd.options[r.index], say: redact(r.say, seat.key), source: 'model', note: '' };
        }
        note = '回的不是合法选项';
      }
    } catch (e) {
      if (e && (e.kind === 'timeout' || e.name === 'AbortError')) note = `超过 ${Math.round(o.timeoutMs / 1000) || 1} 秒没回`;
      else if (e && e.name === 'TypeError') note = isCustomUrl(seat) ? '这个地址不允许网页直接调用' : '连不上服务商（网络或浏览器拦了）';
      else note = '调用出错';
    } finally {
      clearTimeout(timer);
    }
    seat.failures = (seat.failures || 0) + 1;
    return fallback(note + '，规则机器人代打');
  }

  const A = { PROVIDERS, TIMEOUT_MS, SAY_MAX, GIVE_UP_AFTER, buildMessages, parseReply, cleanSay, redact, decide, isCustomUrl };
  if (typeof module !== 'undefined' && module.exports) module.exports = A;
  else root.GZRichAI = A;
})(typeof self !== 'undefined' ? self : this);
