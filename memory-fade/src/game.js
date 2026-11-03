// 记忆褪色 · 画面与操作。规则全在 core.js，数据在 library.js，这里只负责画、读手势、跑弹簧。
(function () {
  'use strict';
  const F = window.FADE;
  const LIB = window.FADE_LIBRARY;
  const $ = (id) => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const CAT = { events: '一件事', patterns: '一条做法', cases: '一次踩坑', preferences: '一条偏好', entities: '一个项目或工具', profile: '一条身份信息', other: '一条其他记忆' };
  const TIER = { c: 'core', w: 'working', p: 'peripheral' };

  // 库里一行 → 一条可以推演的记忆。写入那天是第 0 天，今天是第 age 天。
  function fromRow(row, index) {
    const [category, importance, age, count, since, tier, pinned] = row;
    return {
      index, category, importance, age, pinned: !!pinned, tier: TIER[tier], recalls: [],
      history: count ? { count, last: since === null ? null : Math.max(0, age - since) } : null,
      orig: { importance, pinned: !!pinned },
    };
  }
  const library = LIB.rows.map(fromRow);

  let mem = null;
  let day = 0;
  let playing = false;
  let lastTier = null;

  // ---------- 舞台：天花板 — 弹簧 — 记忆卡片 — 地板 ----------
  const STAGE = { top: 18, cardW: 236, cardH: 74, cx: 180 };
  const yOf = (factor) => 110 + (1 - factor) * 230;          // 倍率 1 在上，0.45 在下
  const card = F.spring(170, (reduced ? 2 : 0.55) * 2 * Math.sqrt(170));   // 阻尼比：卡片要弹，减弱动效时不过冲
  const ledge = F.spring(120, (reduced ? 2 : 0.8) * 2 * Math.sqrt(120));
  card.x = card.target = yOf(1);
  ledge.x = ledge.target = yOf(F.TIERS.peripheral.floor);

  const coil = $('coil'), cardG = $('card'), ledgeG = $('ledge'), nail = $('nail');
  function coilPath(y0, y1) {
    // 拉伸的螺旋弹簧：圈数固定，长度变了圈距跟着变
    const turns = 7, w = 15, lead = 8;
    const len = Math.max(20, y1 - y0 - lead * 2);
    let d = `M${STAGE.cx},${y0} L${STAGE.cx},${y0 + lead}`;
    for (let i = 0; i < turns * 2; i++) {
      const y = y0 + lead + (len * (i + 0.5)) / (turns * 2);
      d += ` L${STAGE.cx + (i % 2 ? -w : w)},${y}`;
    }
    d += ` L${STAGE.cx},${y1 - lead} L${STAGE.cx},${y1}`;
    return d;
  }

  // ---------- 曲线：倍率随天数 ----------
  const PLOT = { x0: 34, x1: 346, y0: 14, y1: 150, lo: 0.4 };
  const px = (d) => PLOT.x0 + (d / F.DAYS) * (PLOT.x1 - PLOT.x0);
  const py = (f) => PLOT.y1 - ((f - PLOT.lo) / (1 - PLOT.lo)) * (PLOT.y1 - PLOT.y0);
  const plot = $('plot');

  // 整个库今天的样子：每个点是一条真实记忆，横坐标是它写入多少天，纵坐标是今天的倍率
  const dotPos = [];
  function drawLibrary() {
    const g = $('lib'); g.textContent = '';
    for (const m of library) {
      const s = F.stateAt(m, m.age);
      const jitter = s.factor === 1 ? ((m.index * 37) % 7) - 3 : 0;   // 不掉分的那一大批叠在顶线上，错开一点看得出有多少
      const x = px(Math.min(F.DAYS, m.age)), y = py(s.factor) + jitter;
      dotPos.push({ m, x, y });
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', x.toFixed(1)); c.setAttribute('cy', y.toFixed(1)); c.setAttribute('r', 2.1);
      c.setAttribute('class', s.factor === 1 ? 'libdot keep' : 'libdot');
      g.appendChild(c);
    }
  }

  function drawPlot() {
    // 写入之前的日子库里没记全（只存了被想起几次和最后一次），不画曲线，只画今天往后
    const pts = [];
    for (let d = mem.age; d <= F.DAYS; d++) pts.push(`${pts.length ? 'L' : 'M'}${px(d).toFixed(1)},${py(F.stateAt(mem, d).factor).toFixed(1)}`);
    $('curve').setAttribute('d', pts.join(' '));
    let fl = '';
    for (let d = mem.age; d <= F.DAYS; d++) fl += `${d > mem.age ? 'L' : 'M'}${px(d).toFixed(1)},${py(F.stateAt(mem, d).floor).toFixed(1)} `;
    $('floorline').setAttribute('d', fl);
    $('pastshade').setAttribute('width', Math.max(0, px(mem.age) - PLOT.x0));
    $('pastlabel').style.display = mem.age > 40 ? '' : 'none';
    $('pastlabel').setAttribute('x', PLOT.x0 + 4);
    const bands = $('bands'); bands.textContent = '';
    const marks = mem.recalls.slice();
    if (mem.history && mem.history.last !== null) marks.push(mem.history.last);
    for (const r of marks) {
      const b = document.createElementNS(NS, 'rect');
      b.setAttribute('x', px(r)); b.setAttribute('y', PLOT.y0);
      b.setAttribute('width', Math.max(1, px(Math.min(F.DAYS, r + F.RECENT_DAYS)) - px(r)));
      b.setAttribute('height', PLOT.y1 - PLOT.y0); b.setAttribute('class', 'band');
      bands.appendChild(b);
      const t = document.createElementNS(NS, 'path');
      t.setAttribute('d', `M${px(r)},${PLOT.y1 + 3} l-4,7 h8 z`); t.setAttribute('class', 'tick');
      bands.appendChild(t);
    }
    const sel = dotPos.find((p) => p.m === mem);
    $('selring').setAttribute('cx', sel ? sel.x : -20); $('selring').setAttribute('cy', sel ? sel.y : -20);
  }

  function drawAxes() {
    const g = $('axes');
    for (const f of [1, 0.85, 0.65, 0.45]) {
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', PLOT.x0 - 6); t.setAttribute('y', py(f) + 3); t.setAttribute('text-anchor', 'end');
      t.textContent = f.toFixed(2).replace(/0$/, ''); g.appendChild(t);
      const l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', PLOT.x0); l.setAttribute('x2', PLOT.x1); l.setAttribute('y1', py(f)); l.setAttribute('y2', py(f));
      l.setAttribute('class', 'grid'); g.appendChild(l);
    }
    for (const d of [0, 60, 120, 180, 240, 300, 365]) {
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', px(d)); t.setAttribute('y', PLOT.y1 + 22); t.setAttribute('text-anchor', 'middle');
      t.textContent = d; g.appendChild(t);
    }
  }

  // ---------- 读数与解释 ----------
  function explain(s) {
    const tz = F.TIERS[s.tier].zh;
    switch (s.why) {
      case 'procedural': return '这是一条做法：会做的事不随时间忘，只在前提变了时作废，所以不掉分。';
      case 'pinned': return '钉住了：不管过多久都不掉分。';
      case 'core': return '重要性到了 0.95，算核心记忆：永远不掉分。';
      case 'recent': return `${s.since === 0 ? '今天' : s.since + ' 天前'}刚被想起：7 天内整条不掉分，还剩 ${F.RECENT_DAYS - s.since} 天。`;
      case 'reinforced':
        if (Math.round(s.halfLife) <= F.BASE_HALF_LIFE + 1) return `被想起过 ${s.count} 次，但最后一次已是 ${s.since} 天前，加成淡得差不多了，按${tz}的曲线往下掉，最低 ${s.floor} 倍。`;
        return `被想起过 ${s.count} 次，半衰期从 ${F.BASE_HALF_LIFE} 天拉长到 ${Math.round(s.halfLife)} 天，掉得慢了；${tz}最低掉到 ${s.floor} 倍。`;
      default: return `没人想起它，按${tz}的曲线往下掉，最低掉到 ${s.floor} 倍。`;
    }
  }

  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 1600);
  }

  function update(fromRecall) {
    const s = F.stateAt(mem, day);
    if (!dragging) card.target = yOf(s.factor);
    ledge.target = yOf(s.floor);
    if (lastTier && s.tier !== lastTier && fromRecall) toast(`升到${F.TIERS[s.tier].zh}，地板抬到 ${s.floor}`);
    lastTier = s.tier;
    const ahead = day - mem.age;
    $('day').textContent = ahead === 0 ? '今天' : `${ahead} 天后`;
    $('tier').textContent = F.TIERS[s.tier].zh;
    $('hl').textContent = Math.round(s.halfLife);
    $('factor').textContent = '×' + s.factor.toFixed(2);
    $('why').textContent = explain(s);
    $('scrub').value = day;
    $('playhead').setAttribute('x1', px(day)); $('playhead').setAttribute('x2', px(day));
    $('dot').setAttribute('cx', px(day)); $('dot').setAttribute('cy', py(s.factor));
    $('imp').textContent = mem.importance.toFixed(2);
    $('pin').textContent = mem.pinned ? '取消钉住' : '钉住它';
    $('pin').setAttribute('aria-pressed', mem.pinned);
    $('recall').disabled = !F.canRecall(mem, day);
    cardG.setAttribute('aria-disabled', !F.canRecall(mem, day));
    $('count').textContent = s.count;
    $('memo').textContent = `${CAT[mem.category] || CAT.other}，写入 ${mem.age} 天了`;
    $('memometa').textContent = `重要性 ${mem.orig.importance.toFixed(2)} · 被想起过 ${mem.history ? mem.history.count : 0} 次${mem.orig.pinned ? ' · 已钉住' : ''}`;
    nail.style.display = mem.pinned ? '' : 'none';
    cardG.classList.toggle('pinned', mem.pinned);
  }

  function select(m, jump) {
    stopPlay();
    mem = m; mem.recalls = []; mem.importance = mem.orig.importance; mem.pinned = mem.orig.pinned;
    $('importance').value = mem.importance; lastTier = null;
    $('scrub').min = mem.age;
    day = mem.age;
    drawPlot(); update(false);
    if (jump && !reduced) card.v += 260;      // 换一条时卡片轻轻一沉再弹回
  }

  function recall() {
    if (!F.canRecall(mem, day)) return;
    mem.recalls.push(day); mem.recalls.sort((a, b) => a - b);
    card.v -= reduced ? 0 : 520;            // 被想起时往上一蹿，弹簧再把它拉回落点
    drawPlot(); update(true);
  }

  // ---------- 手势：拖卡片、点卡片、拖曲线、点曲线上的点 ----------
  let dragging = null;
  const svgY = (svg, e) => {
    const r = svg.getBoundingClientRect();
    return ((e.clientY - r.top) / r.height) * svg.viewBox.baseVal.height;
  };
  const svgX = (svg, e) => {
    const r = svg.getBoundingClientRect();
    return ((e.clientX - r.left) / r.width) * svg.viewBox.baseVal.width;
  };
  const stage = $('stage');
  cardG.addEventListener('pointerdown', (e) => {
    cardG.setPointerCapture(e.pointerId);
    dragging = { id: e.pointerId, y0: svgY(stage, e), cy0: card.x, t0: performance.now(), moved: 0 };
    e.preventDefault();
  });
  cardG.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== dragging.id) return;
    const dy = svgY(stage, e) - dragging.y0;
    dragging.moved = Math.max(dragging.moved, Math.abs(dy));
    // 往下拽越拽越沉：超过 40 像素后阻力变大，像拉一根真弹簧
    const pull = Math.sign(dy) * (Math.abs(dy) < 40 ? Math.abs(dy) : 40 + (Math.abs(dy) - 40) * 0.45);
    const now = performance.now();
    // 紧凑舞台仍为卡片的旋转边缘留 14 个单位，拖拽时也不裁掉卡片。
    const nx = Math.max(100, Math.min(stage.viewBox.baseVal.height - STAGE.cardH / 2 - 14, dragging.cy0 + pull));
    card.v = (nx - card.x) / Math.max(0.008, (now - (dragging.tl || dragging.t0)) / 1000);
    card.x = nx; dragging.tl = now;
  });
  const release = (e) => {
    if (!dragging || e.pointerId !== dragging.id) return;
    const tap = dragging.moved < 6 && performance.now() - dragging.t0 < 350;
    dragging = null;
    if (e.type === 'pointerup' && tap) recall(); else update(false);
  };
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) cardG.addEventListener(ev, release);
  cardG.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); recall(); } });

  // 曲线：横拖选日、纵划交给浏览器滚页；没拖动且点在散点旁边才换记忆。
  let press = null;
  const scrubTo = (e) => {
    const d = Math.round(((svgX(plot, e) - PLOT.x0) / (PLOT.x1 - PLOT.x0)) * F.DAYS);
    setDay(Math.max(mem.age, Math.min(F.DAYS, d)));
  };
  plot.addEventListener('pointerdown', (e) => {
    plot.setPointerCapture(e.pointerId); stopPlay();
    press = { id: e.pointerId, x: svgX(plot, e), y: svgY(plot, e), clientX: e.clientX, clientY: e.clientY, axis: null };
  });
  plot.addEventListener('pointermove', (e) => {
    if (!press || press.id !== e.pointerId) return;
    const dx = Math.abs(e.clientX - press.clientX), dy = Math.abs(e.clientY - press.clientY);
    if (!press.axis && Math.max(dx, dy) > 6) press.axis = dx > dy ? 'x' : 'y';
    if (press.axis === 'x') scrubTo(e);
  });
  plot.addEventListener('pointerup', (e) => {
    if (!press || press.id !== e.pointerId) return;
    if (!press.axis) {
      let best = null, bd = 9;
      for (const p of dotPos) { const d = Math.hypot(p.x - press.x, p.y - press.y); if (d < bd) { bd = d; best = p; } }
      if (best && best.m !== mem) select(best.m, true); else scrubTo(e);
    }
    press = null;
  });
  for (const ev of ['pointercancel', 'lostpointercapture']) plot.addEventListener(ev, () => { press = null; });

  function cancelGestures() {
    const cardId = dragging && dragging.id, plotId = press && press.id;
    dragging = null; press = null;
    if (cardId !== null && cardG.hasPointerCapture(cardId)) cardG.releasePointerCapture(cardId);
    if (plotId !== null && plot.hasPointerCapture(plotId)) plot.releasePointerCapture(plotId);
    update(false);
  }
  window.addEventListener('blur', cancelGestures);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelGestures(); });

  function setDay(d) { day = d; update(false); }

  $('scrub').addEventListener('input', (e) => { stopPlay(); setDay(+e.target.value); });
  $('importance').addEventListener('input', (e) => { mem.importance = +e.target.value; drawPlot(); update(false); });
  $('recall').addEventListener('click', recall);
  $('pin').addEventListener('click', () => { mem.pinned = !mem.pinned; if (mem.pinned && !reduced) card.v -= 380; drawPlot(); update(false); });
  // 换一条：从库里随机抽，偏向还会往下掉的那些（不掉分的一抽一大把，看不出东西）
  let pickSeed = 7;
  function nextPick() {
    const moving = library.filter((m) => m !== mem && F.stateAt(m, m.age).factor < 1);
    const pool = moving.length && (pickSeed % 4 !== 0) ? moving : library.filter((m) => m !== mem);
    pickSeed = (pickSeed * 1103515245 + 12345) & 0x7fffffff;
    return pool[pickSeed % pool.length];
  }
  $('another').addEventListener('click', () => select(nextPick(), true));

  // 让时间走：每秒 30 天
  let playAcc = 0;
  function stopPlay() { playing = false; $('play').textContent = '让时间走'; $('play').setAttribute('aria-pressed', false); }
  function startPlay() {
    if (day >= F.DAYS) setDay(mem.age);
    playing = true; playAcc = day; $('play').textContent = '停'; $('play').setAttribute('aria-pressed', true);
  }
  $('play').addEventListener('click', () => (playing ? stopPlay() : startPlay()));

  // ---------- 主循环 ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (playing) {
      playAcc += dt * 30;
      const d = Math.min(F.DAYS, Math.floor(playAcc));
      if (d !== day) setDay(d);
      if (d >= F.DAYS) stopPlay();
    }
    if (!dragging) F.springStep(card, dt);
    F.springStep(ledge, dt);
    const cy = card.x, top = cy - STAGE.cardH / 2;
    coil.setAttribute('d', coilPath(STAGE.top + 8, top));
    // 运动时轻轻歪一下，停稳就正回来
    const tilt = Math.max(-6, Math.min(6, card.v * 0.012));
    cardG.setAttribute('transform', `translate(${STAGE.cx},${cy}) rotate(${tilt.toFixed(2)})`);
    const f = F.stateAt(mem, day).factor;
    $('cardbody').style.opacity = (0.32 + 0.68 * Math.max(0, (f - 0.45) / 0.55)).toFixed(3);
    ledgeG.setAttribute('transform', `translate(0,${(ledge.x + STAGE.cardH / 2 + 4).toFixed(1)})`);
    requestAnimationFrame(frame);
  }

  // 库的概况
  const M = LIB.meta;
  $('libnote').textContent = `点是我自己的记忆库 ${M.date} 那天随机抽的 ${M.sampled} 条（库里在用的共 ${M.active} 条），只取了数字，没有内容。绿色的今天不掉分。点一个点，上面的卡片就换成它。`;
  $('cliffnote').textContent = `被想起后的 7 天一过，倍率会直接跌回曲线上，中间没有过渡。真实库里眼下有 ${M.recentOnly} 条正处在这 7 天里，等豁免结束，倍率中位数是 ${M.dropMedian}，跌破 0.7 的只有 ${M.dropBelow07} 条。跌得不多，名次却会变：11-03 拿那之前一周 578 条真实检索重放，前 5 名里有这类记忆的 95 条查询，豁免一结束有 26 条前 5 名换了人，因为前几名分数本来就挨得很近。把悬崖改成缓坡也免不了这次换位，只是换到坡上另一天，所以没改。为了让这类记忆看得到，抽样里它们多抽了 ${M.recentSampled} 条，图上的比例比真实库高。`;

  drawAxes(); drawLibrary();
  // 开场：挑一条还在往下掉、又被想起过的记忆，让时间自己往前走一段
  const first = library.find((m) => m.history && m.history.count >= 2 && F.stateAt(m, m.age).why === 'reinforced' && m.age < 120) || library[0];
  select(first, false);
  card.x = yOf(F.stateAt(mem, day).factor);
  requestAnimationFrame((t) => { last = t; frame(t); });
  if (!reduced) { startPlay(); setTimeout(() => { if (playing) stopPlay(); }, 3000); }

  // 测试与截图用：?pick=序号&ahead=天数&recalls=相对今天的天数,...&imp=0.5&pin=0
  const q = new URLSearchParams(location.search);
  if (q.has('pick')) {
    select(library[Math.max(0, Math.min(library.length - 1, +q.get('pick')))], false);
    if (q.get('recalls')) mem.recalls = q.get('recalls').split(',').map((d) => mem.age + Number(d)).sort((a, b) => a - b);
    if (q.has('imp')) { mem.importance = +q.get('imp'); $('importance').value = mem.importance; }
    if (q.has('pin')) mem.pinned = q.get('pin') === '1';
    drawPlot(); setDay(Math.min(F.DAYS, mem.age + (+q.get('ahead') || 0)));
    card.x = yOf(F.stateAt(mem, day).factor); card.v = 0; ledge.x = ledge.target;
  }
  window.__fade = { get mem() { return mem; }, get day() { return day; }, library, card, ledge, yOf, select, firstIndex: first.index };
  window.__PLAYTEST__ = {
    ready: true,
    snapshot: () => ({ index: mem.index, ...F.stateAt(mem, day), pinned: mem.pinned, playing, recalls: mem.recalls.slice(), cardY: card.x }),
  };
})();
