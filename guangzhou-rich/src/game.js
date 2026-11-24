// 花城收租佬 · 界面。只读 core 的状态、发「掷骰 / 选择」意图，不在这里另写规则。
(function () {
  'use strict';
  const M = self.GZRich;
  const A = self.GZRichAI;
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const VIEW = params.get('view') || 'setup';
  const FAST = params.get('fast') === '1';
  const STORE_KEY = 'guangzhou-rich/v1/seats';
  const DEFAULT_NAMES = ['阿发', '阿珍', '阿强'];
  const COLORS = ['var(--p0)', 'var(--p1)', 'var(--p2)', 'var(--p3)'];
  const D = FAST ? { think: 0, step: 0, after: 0 } : { think: 650, step: 110, after: 700 };

  // 规则机器人的嘴炮（界面用自己的随机数，不碰规则随机数，保证同种子同局）。
  const BOT_LINES = {
    buy: ['呢块地我睇中咗！', '买咗先，迟啲收租。', '执到宝啦！'],
    skip: ['太贵，唔要住。', '留住啲钱傍身。'],
    build: ['加多层，租金翻几番。', '起楼！'],
    rent: ['交租交到肉痛……', '算你好彩。'],
    jail: ['塞车塞到冇脾气。'],
  };
  let uiSeed = 12345;
  const uiRand = () => ((uiSeed = (uiSeed * 1103515245 + 12345) >>> 0) / 4294967296);
  const pick = (arr) => arr[Math.floor(uiRand() * arr.length)];

  // 座位配置只存在这个闭包里；不挂到 window，不进快照。
  let seats = [];
  let g = null;
  let busy = false;
  let gen = 0; // 每开一局加一，旧局的异步回调看到不一致就丢掉
  let displayPos = null;
  let ready = false;
  let screen = 'setup';
  // 花钱的决定（买下、加盖、付钱打车）刚出现时，按钮先禁用一小段：掷骰那一下的迟到补点、连点落在原位的新按钮上会误花钱。
  // 放开时刻 = max(按钮出现后 LOCK_AFTER_SHOW, 点掷骰后 LOCK_SINCE_ROLL)。实测按钮出现在点掷骰后 0.4–1.6 秒（300ms 摇骰 + 每格 110ms），
  // 点击延迟约 1 秒的试玩里补点落在 1.1 秒；快速模式（?fast=1）不设禁用。
  const LOCK_AFTER_SHOW = 500, LOCK_SINCE_ROLL = 1900;
  let lockUntil = 0, rollClickAt = 0, decisionKey = '', lockTimer = null;

  // ---------- 选座页 ----------
  function seatRow(k, saved) {
    const i = k + 1;
    const row = document.createElement('div');
    row.className = 'seat';
    row.dataset.seat = String(i);
    const prov = (saved && saved.provider) || 'bot';
    row.innerHTML =
      `<span class="dot c${i}"></span>` +
      `<label class="nm">对手<input class="s-name" maxlength="6" autocomplete="off"></label>` +
      `<select class="s-kind" aria-label="第 ${i} 位对手由谁来打"></select>` +
      `<div class="more" hidden>` +
      `<label><span>key</span><input class="s-key" type="password" autocomplete="off" spellcheck="false" placeholder="sk-……"></label>` +
      `<details><summary>改接口地址或模型（可选）</summary>` +
      `<label><span>接口地址</span><input class="s-url" inputmode="url" autocomplete="off" spellcheck="false"></label>` +
      `<label><span>模型名</span><input class="s-model" autocomplete="off" spellcheck="false"></label>` +
      `<button class="s-reset" type="button">恢复默认地址和模型</button></details></div>`;
    const sel = row.querySelector('.s-kind');
    const kinds = Object.keys(A.PROVIDERS).map((p) => [p, A.PROVIDERS[p].label]);
    if (k > 0) kinds.push(['none', '空着']);
    kinds.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); });
    sel.value = prov;
    row.querySelector('.s-name').value = (saved && saved.name) || DEFAULT_NAMES[k];
    if (saved && saved.key) row.querySelector('.s-key').value = saved.key;
    const fillDefaults = () => {
      const p = A.PROVIDERS[sel.value];
      const url = row.querySelector('.s-url'), model = row.querySelector('.s-model');
      if (p && p.url) {
        if (!url.value || Object.values(A.PROVIDERS).some((q) => q.url === url.value)) url.value = p.url;
        if (!model.value || Object.values(A.PROVIDERS).some((q) => q.model === model.value)) model.value = p.model;
      }
      row.querySelector('.more').hidden = !(p && p.needsKey);
      $('remember-row').hidden = !document.querySelector('.seat .s-kind option:checked[value="deepseek"], .seat .s-kind option:checked[value="qwen"]');
    };
    if (saved && saved.url) row.querySelector('.s-url').value = saved.url;
    if (saved && saved.model) row.querySelector('.s-model').value = saved.model;
    const resetDefaults = () => {
      const p = A.PROVIDERS[sel.value];
      if (p && p.url) { row.querySelector('.s-url').value = p.url; row.querySelector('.s-model').value = p.model; }
    };
    // 换了服务商就回到那家的默认地址和模型（Alice 11-23：不然要自己去找来填）；页面初次载入仍保留记住的自定义值
    sel.addEventListener('change', () => { resetDefaults(); fillDefaults(); });
    row.querySelector('.s-reset').addEventListener('click', resetDefaults);
    $('seats').appendChild(row);
    fillDefaults();
  }

  function loadSaved() {
    try { const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); return s && Array.isArray(s.seats) ? s : null; } catch (e) { return null; }
  }

  function readSeats() {
    const out = [{ provider: 'human', name: ($('me-name').value || '你').trim().slice(0, 6) || '你' }];
    document.querySelectorAll('#seats .seat[data-seat]').forEach((row, k) => {
      const provider = row.querySelector('.s-kind').value;
      if (provider === 'none') return;
      const name = (row.querySelector('.s-name').value || DEFAULT_NAMES[k]).trim().slice(0, 6) || DEFAULT_NAMES[k];
      const s = { provider, name, failures: 0, note: '' };
      if (A.PROVIDERS[provider] && A.PROVIDERS[provider].needsKey) {
        s.key = row.querySelector('.s-key').value.trim();
        s.url = row.querySelector('.s-url').value.trim();
        s.model = row.querySelector('.s-model').value.trim();
      }
      s.color = k + 1;
      out.push(s);
    });
    return out;
  }

  function persist(list) {
    try {
      if ($('remember').checked) {
        localStorage.setItem(STORE_KEY, JSON.stringify({ seats: list.slice(1).map((s) => ({ provider: s.provider, name: s.name, key: s.key || '', url: s.url || '', model: s.model || '' })) }));
      } else localStorage.removeItem(STORE_KEY);
    } catch (e) { /* 存不了就当没存 */ }
  }

  function initSetup() {
    const saved = loadSaved();
    for (let k = 0; k < 3; k++) seatRow(k, saved && saved.seats[k]);
    if (saved) $('remember').checked = true;
    $('forget').addEventListener('click', () => {
      try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
      document.querySelectorAll('.s-key').forEach((el) => { el.value = ''; });
      $('remember').checked = false;
    });
    $('start').addEventListener('click', () => {
      const list = readSeats();
      persist(list);
      startGame(list, randomSeed());
    });
    $('back').addEventListener('click', () => showScreen('setup'));
    $('reseat').addEventListener('click', () => showScreen('setup'));
    $('again').addEventListener('click', () => startGame(seats, randomSeed()));
    $('act-a').addEventListener('click', () => human(0));
    $('act-b').addEventListener('click', () => human(1));
  }

  function randomSeed() {
    if (params.get('seed')) return Number(params.get('seed')) >>> 0 || 1;
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] || 1;
  }

  function showScreen(name) {
    screen = name;
    $('setup').hidden = name !== 'setup';
    $('play').hidden = name === 'setup';
    $('over').hidden = name !== 'over';
    if (name === 'setup') gen++;
  }

  // ---------- 开局与渲染 ----------
  function buildBoard() {
    const b = $('board');
    b.querySelectorAll('.cell').forEach((c) => c.remove());
    M.BOARD.forEach((s, i) => {
      const [r, c] = cellRC(i);
      const el = document.createElement('div');
      el.className = 'cell' + ([0, 6, 12, 18].includes(i) ? ' corner' : '') + (s.kind === 'chance' ? ' chance' : '');
      el.style.gridRow = String(r + 1);
      el.style.gridColumn = String(c + 1);
      el.dataset.sq = String(i);
      let inner = '';
      if (s.kind === 'prop') inner += `<i class="band"></i>`;
      inner += `<span class="nm">${s.name}</span>`;
      if (s.kind === 'prop') inner += `<span class="pr">${s.price}</span><span class="lv"></span>`;
      else if (s.kind === 'tax') inner += `<span class="pr">付 ${s.amount}</span>`;
      else if (s.kind === 'bonus') inner += `<span class="pr">收 ${s.amount}</span>`;
      else if (s.kind === 'chance') inner = `<span class="nm">？</span><span class="pr">机会</span>`;
      else if (s.sub) inner += `<span class="pr">${s.sub.split(' · ')[0]}</span>`;
      inner += `<div class="tokens"></div>`;
      el.innerHTML = inner;
      if (s.kind === 'prop') {
        el.querySelector('.band').style.background = M.AREAS[s.area].color;
        el.style.backgroundImage = `linear-gradient(${M.AREAS[s.area].color}24, ${M.AREAS[s.area].color}24)`;
      }
      b.appendChild(el);
    });
    const lg = $('legend');
    lg.innerHTML = '';
    Object.values(M.AREAS).forEach((a) => {
      const sp = document.createElement('span');
      const i = document.createElement('i');
      i.style.background = a.color;
      sp.appendChild(i);
      sp.appendChild(document.createTextNode(a.name));
      lg.appendChild(sp);
    });
  }

  // 0 号在右下角，沿底边往左，再沿左边往上，顶边往右，右边往下。
  function cellRC(i) {
    if (i <= 6) return [6, 6 - i];
    if (i <= 12) return [12 - i, 0];
    if (i <= 18) return [0, i - 12];
    return [i - 18, 6];
  }

  function startGame(list, seed, opts) {
    seats = list.map((s) => Object.assign({}, s, { failures: 0, note: '' }));
    gen++;
    uiSeed = seed ^ 0x5bd1e995;
    g = M.create({ seed, seats: seats.map((s) => ({ name: s.name })), maxRounds: (opts && opts.maxRounds) || M.DEFAULT_ROUNDS });
    displayPos = g.players.map((p) => p.pos);
    busy = false;
    lockUntil = 0; rollClickAt = 0; decisionKey = '';
    buildBoard();
    $('bubble').hidden = true;
    showScreen('play');
    render();
    setEvent(g.turn === 0 ? eventText() : '');
    if (!(opts && opts.noLoop)) tick();
  }

  function seatColor(i) { return COLORS[seats[i] && seats[i].color != null ? seats[i].color : i]; }

  function render() {
    if (!g) return;
    const snap = M.snapshot(g);
    $('round').textContent = `第 ${snap.round} / ${snap.maxRounds} 轮`;
    document.querySelectorAll('#board .cell').forEach((el) => {
      const i = Number(el.dataset.sq);
      const o = g.owner[i];
      el.classList.toggle('owned', o != null);
      const d = (i - g.players[0].pos + M.BOARD.length) % M.BOARD.length;
      el.classList.toggle('near', g.turn === 0 && g.phase === 'roll' && !busy && d >= 1 && d <= 6);
      if (o != null) el.style.setProperty('--own', seatColor(o));
      const lv = el.querySelector('.lv');
      if (lv) lv.textContent = '▮'.repeat(g.level[i]);
      const toks = el.querySelector('.tokens');
      toks.innerHTML = '';
      g.players.forEach((p, k) => {
        if (!p.alive || displayPos[k] !== i) return;
        const t = document.createElement('i');
        t.className = 'tok' + (k === g.turn && g.phase !== 'over' ? ' now' : '');
        t.style.background = seatColor(k);
        t.title = p.name;
        toks.appendChild(t);
      });
    });
    const pl = $('players');
    pl.innerHTML = '';
    g.players.forEach((p, k) => {
      const s = seats[k];
      const d = document.createElement('div');
      d.className = 'pl' + (k === g.turn && g.phase !== 'over' ? ' now' : '') + (p.alive ? '' : ' out');
      d.dataset.seat = String(k);
      const kind = s.provider === 'human' ? '你自己' : A.PROVIDERS[s.provider].label + (s.note ? '·代打' : '');
      d.innerHTML = `<div class="who"><span class="dot"></span><span class="n"></span></div><div class="cash"></div><div class="kind"></div>`;
      d.querySelector('.dot').style.background = seatColor(k);
      d.querySelector('.n').textContent = p.name + (p.stuck ? '·塞车' : '') + (p.card ? '·月票' : '');
      d.querySelector('.cash').textContent = p.alive ? `¥${p.cash}` : '出局';
      d.querySelector('.kind').textContent = kind;
      pl.appendChild(d);
    });
    // 模型座位出错的人话原因：棋盘下方一行一条，不撑高玩家牌
    const notes = $('notes');
    notes.innerHTML = '';
    seats.forEach((s, k) => {
      if (!s.note || !g.players[k].alive) return;
      const li = document.createElement('p');
      li.className = 'warn';
      li.dataset.seat = String(k);
      li.textContent = `${g.players[k].name}：${s.note}`;
      notes.appendChild(li);
    });
    showDice();
    renderLog();
    renderActions();
  }

  // 记录栏：一个回合一行，最新的在最上面，留最近 8 个回合，所以机器人这一圈做了什么都看得到。
  // 以前是「先截最后 4 条原始记录、再滤掉掷骰和落点」，一个机器人的回合就能把它占满甚至滤空；而且用 <ol> 从 1 数起，
  // 配上最新在上就像倒序（2026-11-24 外部试玩）。
  function renderLog() {
    const log = $('log');
    log.innerHTML = '';
    const turns = [];
    g.log.forEach((e) => {
      const last = turns[turns.length - 1];
      if (last && last.round === e.round && last.who === e.who) last.events.push(e);
      else turns.push({ round: e.round, who: e.who, events: [e] });
    });
    turns.slice(-8).reverse().forEach((t) => {
      const informative = t.events.some((e) => !['land', 'roll', 'salary'].includes(e.t));
      const texts = t.events.filter((e) => e.t !== 'roll' && !(e.t === 'land' && informative)).map((e) => e.text);
      if (!texts.length) return;
      const li = document.createElement('li');
      li.textContent = texts.join('；');
      log.appendChild(li);
    });
  }

  function renderActions() {
    const a = $('act-a'), b = $('act-b');
    if (!g || g.phase === 'over') { a.disabled = true; a.textContent = '这局完了'; b.hidden = true; return; }
    const mine = g.turn === 0 && !busy;
    if (!mine) {
      a.disabled = true;
      a.textContent = busy && g.turn === 0 ? '……' : `${g.players[g.turn].name} 在想……`;
      b.hidden = true;
      return;
    }
    const pd = g.pending;
    const key = `${g.round}:${pd.type}:${pd.square}`;
    if (key !== decisionKey) {
      decisionKey = key;
      const now = performance.now();
      lockUntil = !FAST && pd.type !== 'dice' ? Math.max(now + LOCK_AFTER_SHOW, rollClickAt + LOCK_SINCE_ROLL) : 0;
      clearTimeout(lockTimer);
      if (lockUntil > now) lockTimer = setTimeout(() => { if (g) renderActions(); }, lockUntil - now + 20);
    }
    const locked = performance.now() < lockUntil;
    a.disabled = locked;
    b.disabled = locked;
    a.classList.toggle('locked', locked);
    b.classList.toggle('locked', locked);
    const label = { two: '掷两颗', one: '掷一颗', buy: `买下 ¥${pd.cost}`, skip: pd.type === 'buy' ? '不买' : '先不盖', build: `加盖一层 ¥${pd.cost}`, pay: '付 50 打车走', wait: '等一轮' };
    a.textContent = label[pd.options[0]];
    if (pd.options[1]) { b.hidden = false; b.textContent = label[pd.options[1]]; } else b.hidden = true;
  }

  function eventText() {
    const ev = g.events.filter((e) => e.t !== 'roll');
    const lastLand = ev.filter((e) => e.t !== 'land');
    const pd = g.pending;
    const who = g.players[g.turn];
    let s = ev.map((e) => e.text).slice(-3).join('；');
    if (g.phase === 'roll' && g.turn === 0) {
      s = (lastLand.length ? s + '。' : '') + '轮到你：掷一颗走 1–6 格（虚线框），掷两颗走 2–12 格。';
    } else if (g.phase === 'decide' && g.turn === 0 && pd) {
      const sq = M.BOARD[pd.square];
      if (pd.type === 'buy') s = `${sq.name}没人要，标价 ${pd.cost}，买不买？（买了别人踩到要给你 ${M.rentFor(Object.assign({}, g, { owner: g.owner.map((o, k) => (k === pd.square ? 0 : o)) }), pd.square)}）`;
      else if (pd.type === 'build') s = `回到自己的${sq.name}，加盖一层要 ${pd.cost}，租金会涨到 ${Math.round(sq.price * M.RENT_MULT[g.level[pd.square] + 1])}`;
      else if (pd.type === 'jail') s = '你被困在内环塞车：付 50 打车走，还是等一轮？';
    } else if (!s) s = `${who.name} 准备掷骰`;
    return s;
  }

  // 骰面只认「掷出来的那条记录」。掷完当场没有决定要做时，规则核心在同一次调用里就把 g.dice 清成 null、换下一位，
  // 界面若读 g.dice 就永远看不到这一手的点，骰面停在上一手（2026-11-24 外部试玩：骰面偶尔不是刚掷的点）。
  function showDice(d) {
    d = d || g.dice;
    if (!d) return;
    const ds = document.querySelectorAll('#dice .die');
    ds[0].textContent = d[0];
    ds[1].textContent = d[1] == null ? '' : d[1];
    ds[1].hidden = d[1] == null;
  }

  function setEvent(text) { $('event').textContent = text; }
  function setBubble(i, text) {
    const b = $('bubble');
    if (!text) { b.hidden = true; return; }
    b.hidden = false;
    b.innerHTML = '';
    const n = document.createElement('b');
    n.textContent = g.players[i].name + '：';
    b.style.setProperty('--bub', seatColor(i));
    b.appendChild(n);
    b.appendChild(document.createTextNode(text));
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function animateRoll(myGen, i) {
    const roll = g.log.slice().reverse().find((e) => e.t === 'roll' && e.who === i);
    const dice = $('dice');
    // 骰面在掷出的那一刻就换成这一手的点，摇动只是动画；摇骰的 300ms 里不再留着上一手的点
    if (roll) showDice(roll.dice);
    dice.classList.add('rolling');
    if (!FAST) await wait(300);
    dice.classList.remove('rolling');
    if (!roll || myGen !== gen) return;
    showDice(roll.dice);
    let pos = roll.from;
    while (pos !== roll.to) {
      pos = (pos + 1) % M.BOARD.length;
      displayPos[i] = pos;
      renderTokensOnly();
      if (D.step) await wait(D.step);
      if (myGen !== gen) return;
    }
  }

  function renderTokensOnly() {
    showDice();
    document.querySelectorAll('#board .cell').forEach((el) => {
      el.classList.remove('near');
      const i = Number(el.dataset.sq);
      const toks = el.querySelector('.tokens');
      toks.innerHTML = '';
      g.players.forEach((p, k) => {
        if (!p.alive || displayPos[k] !== i) return;
        const t = document.createElement('i');
        t.className = 'tok' + (k === g.turn ? ' now' : '');
        t.style.background = seatColor(k);
        toks.appendChild(t);
      });
    });
  }

  function flashSquare(sq) {
    const el = document.querySelector(`#board .cell[data-sq="${sq}"]`);
    if (!el) return;
    el.classList.remove('hit');
    void el.offsetWidth;
    el.classList.add('hit');
  }

  async function doRoll(i, myGen, choice) {
    const before = g.turn;
    M.decide(g, choice);
    const evs = g.events.slice();
    const rollEv = evs.find((e) => e.t === 'roll');
    // 骰子一出，中间那段话立刻换成这一手的，不再留着上一位的「轮到你：掷……」
    if (rollEv) setEvent(`${rollEv.text}，走着……`);
    await animateRoll(myGen, before);
    if (myGen !== gen) return;
    syncPositions();
    const land = evs.filter((e) => e.t === 'land').pop();
    if (land) flashSquare(land.square);
    if (i !== 0) {
      const rent = evs.find((e) => e.t === 'rent');
      if (rent && seats[i].provider === 'bot' && uiRand() < 0.5) setBubble(i, pick(BOT_LINES.rent));
      if (evs.find((e) => e.t === 'jail') && seats[i].provider === 'bot') setBubble(i, pick(BOT_LINES.jail));
    }
    const after = eventTextFrom(evs, before);
    setEvent(rollEv && g.turn === 0 && g.phase === 'decide' && before === 0 ? `${rollEv.text}。${after}` : after);
    render();
  }

  function eventTextFrom(evs, who) {
    if (g.turn === 0 && g.phase !== 'over' && (g.phase === 'decide' || who !== 0)) return eventText();
    const t = evs.filter((e) => e.t !== 'roll' && !(e.t === 'land' && evs.some((x) => x.t !== 'land' && x.t !== 'roll' && x.t !== 'salary'))).map((e) => e.text).slice(-3).join('；');
    return t || eventText();
  }

  function syncPositions() { displayPos = g.players.map((p) => p.pos); }

  async function human(btn) {
    if (!g || g.turn !== 0 || busy || g.phase === 'over') return;
    if (performance.now() < lockUntil) return;
    const myGen = gen;
    busy = true;
    if (g.pending && g.pending.type === 'dice') rollClickAt = performance.now();
    renderActions();
    try {
      const choice = g.pending && g.pending.options[btn];
      if (choice == null) return;
      if (g.pending.type === 'dice') {
        setBubble(0, '');
        await doRoll(0, myGen, choice);
      } else {
        M.decide(g, choice);
        setEvent(g.events.map((e) => e.text).join('；'));
        syncPositions();
      }
    } finally {
      if (myGen === gen) { busy = false; render(); if (g.phase === 'roll' && g.turn === 0) setEvent(eventText()); tick(); }
    }
  }

  // AI 回合循环：一次只走一步，走完再排下一步。
  async function tick() {
    if (!g || busy || screen === 'setup') return;
    if (g.phase === 'over') return showOver();
    if (g.turn === 0) { render(); return; }
    const myGen = gen;
    busy = true;
    render();
    try {
      const i = g.turn;
      const s = seats[i];
      if (D.think) await wait(D.think);
      if (myGen !== gen) return;
      {
        let r;
        if (A.PROVIDERS[s.provider] && A.PROVIDERS[s.provider].needsKey) {
          setEvent(`${g.players[i].name} 在想……`);
          r = await A.decide(M, g, i, s);
          if (myGen !== gen) return;
          s.note = r.note || '';
        } else {
          const choice = M.botChoice(g, i, M.BOT_TUNES[i % 4]);
          r = { choice, say: BOT_LINES[choice] && uiRand() < 0.55 ? pick(BOT_LINES[choice]) : '', source: 'bot' };
        }
        if (r.say) setBubble(i, r.say);
        if (g.pending.type === 'dice') await doRoll(i, myGen, r.choice);
        else {
          M.decide(g, r.choice);
          setEvent(g.events.map((e) => e.text).join('；'));
          syncPositions();
          render();
        }
      }
      if (D.after) await wait(D.after);
    } finally {
      if (myGen === gen) {
        busy = false;
        if (g.turn === 0 && g.phase !== 'over') setEvent(eventText());
        render();
        setTimeout(tick, 0);
      }
    }
  }

  function showOver() {
    const r = g.result;
    $('over-title').textContent = r.ranking[0].seat === 0 ? '你赢了！' : `${r.ranking[0].name} 赢了`;
    $('over-reason').textContent = r.reason === 'rounds' ? `${g.maxRounds} 轮到了，按身家（现金＋地价＋楼）排名。` : r.reason === 'human' ? '你交不起租，出局了。' : '其他人都破产了。';
    const ol = $('ranking');
    ol.innerHTML = '';
    r.ranking.forEach((x, k) => {
      const li = document.createElement('li');
      if (k === 0) li.className = 'first';
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = seatColor(x.seat);
      li.appendChild(dot);
      li.appendChild(document.createTextNode(`${k + 1}. ${x.name}${x.alive ? '' : '（出局）'}`));
      const b = document.createElement('b');
      b.textContent = `¥${x.worth}`;
      li.appendChild(b);
      ol.appendChild(li);
    });
    showScreen('over');
    $('play').hidden = false;
  }

  // ---------- 固定机位与试玩钩子 ----------
  function botSeats() {
    return [{ provider: 'human', name: '你' }].concat(DEFAULT_NAMES.map((n, k) => ({ provider: 'bot', name: n, color: k + 1 })));
  }

  function autoplayTo(stop) {
    while (g.phase !== 'over' && !stop()) {
      M.decide(g, M.botChoice(g, g.turn, M.BOT_TUNES[g.turn % 4]));
    }
    syncPositions();
  }

  function applyView() {
    const seed = Number(params.get('seed')) >>> 0 || 7;
    if (VIEW === 'play') {
      startGame(botSeats(), seed, { noLoop: true });
      autoplayTo(() => g.round >= 5 && g.turn === 0 && g.phase === 'roll');
      setEvent(eventText());
      render();
    } else if (VIEW === 'over') {
      startGame(botSeats(), seed, { noLoop: true });
      autoplayTo(() => false);
      render();
      showOver();
    }
  }

  self.__PLAYTEST__ = {
    get ready() { return ready; },
    snapshot: () => Object.assign(g ? M.snapshot(g) : {}, {
      view: VIEW, screen, busy,
      lastRoll: g ? (g.log.slice().reverse().find((e) => e.t === 'roll') || null) : null,
      seats: seats.map((s) => ({ provider: s.provider, name: s.name, hasKey: !!s.key, failures: s.failures || 0, note: s.note || '' })),
      bubble: $('bubble').hidden ? '' : $('bubble').textContent,
    }),
    reset: () => startGame(seats.length ? seats : botSeats(), g ? g.seed : 1),
    setSeed: (n) => startGame(seats.length ? seats : botSeats(), n >>> 0),
  };

  initSetup();
  if (VIEW !== 'setup') applyView();
  ready = true;
})();
