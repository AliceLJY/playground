// 记忆褪色 · 画面与操作。规则全在 core.js，这里只负责画、读手势、跑弹簧。
(function () {
  'use strict';
  const F = window.FADE;
  const $ = (id) => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const mem = { importance: 0.5, pinned: false, recalls: [] };
  let day = 0;
  let playing = false;
  let lastTier = null;

  // ---------- 舞台：天花板 — 弹簧 — 记忆卡片 — 地板 ----------
  const STAGE = { top: 18, cardW: 236, cardH: 74, cx: 180 };
  const yOf = (factor) => 136 + (1 - factor) * 260;          // 倍率 1 在上，0.45 在下
  const ratioCard = reduced ? 2 : 0.55;                        // 阻尼比：卡片要弹，减弱动效时不过冲
  const card = F.spring(170, ratioCard * 2 * Math.sqrt(170));
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

  function drawPlot() {
    const pts = F.curve(mem, 1);
    $('curve').setAttribute('d', pts.map((f, d) => `${d ? 'L' : 'M'}${px(d).toFixed(1)},${py(f).toFixed(1)}`).join(' '));
    // 地板随层级变：逐天画成台阶线
    let fl = '';
    for (let d = 0; d <= F.DAYS; d++) fl += `${d ? 'L' : 'M'}${px(d).toFixed(1)},${py(F.stateAt(mem, d).floor).toFixed(1)} `;
    $('floorline').setAttribute('d', fl);
    // 7 天豁免窗口与召回刻度
    const bands = $('bands'); bands.textContent = '';
    for (const r of mem.recalls) {
      const b = document.createElementNS(NS, 'rect');
      b.setAttribute('x', px(r)); b.setAttribute('y', PLOT.y0);
      b.setAttribute('width', Math.max(1, px(Math.min(F.DAYS, r + F.RECENT_DAYS)) - px(r)));
      b.setAttribute('height', PLOT.y1 - PLOT.y0); b.setAttribute('class', 'band');
      bands.appendChild(b);
      const t = document.createElementNS(NS, 'path');
      t.setAttribute('d', `M${px(r)},${PLOT.y1 + 3} l-4,7 h8 z`); t.setAttribute('class', 'tick');
      bands.appendChild(t);
    }
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
      case 'pinned': return '钉住了：不管过多久都不掉分。';
      case 'core': return '重要性到了 0.95，算核心记忆：永远不掉分。';
      case 'recent': return `${s.since === 0 ? '今天' : s.since + ' 天前'}刚被想起：7 天内整条不掉分，还剩 ${F.RECENT_DAYS - s.since} 天。`;
      case 'reinforced': return `被想起过 ${s.count} 次，半衰期从 ${F.BASE_HALF_LIFE} 天拉长到 ${Math.round(s.halfLife)} 天，掉得慢了；${tz}最低掉到 ${s.floor} 倍。`;
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
    $('day').textContent = day;
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
    $('recall').disabled = mem.recalls.includes(day);
    $('count').textContent = mem.recalls.filter((d) => d <= day).length;
    nail.style.display = mem.pinned ? '' : 'none';
    cardG.classList.toggle('pinned', mem.pinned);
  }

  function recall() {
    if (mem.recalls.includes(day)) return;
    mem.recalls.push(day); mem.recalls.sort((a, b) => a - b);
    card.v -= reduced ? 0 : 520;            // 被想起时往上一蹿，弹簧再把它拉回落点
    drawPlot(); update(true);
  }

  // ---------- 手势：拖卡片、点卡片、拖曲线 ----------
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
    const nx = Math.max(100, Math.min(310, dragging.cy0 + pull));
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

  let scrubbing = null;
  const scrubTo = (e) => {
    const d = Math.round(((svgX(plot, e) - PLOT.x0) / (PLOT.x1 - PLOT.x0)) * F.DAYS);
    setDay(Math.max(0, Math.min(F.DAYS, d)));
  };
  plot.addEventListener('pointerdown', (e) => { plot.setPointerCapture(e.pointerId); scrubbing = e.pointerId; stopPlay(); scrubTo(e); });
  plot.addEventListener('pointermove', (e) => { if (scrubbing === e.pointerId) scrubTo(e); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) plot.addEventListener(ev, () => { scrubbing = null; });

  function setDay(d) { day = d; update(false); }

  $('scrub').addEventListener('input', (e) => { stopPlay(); setDay(+e.target.value); });
  $('importance').addEventListener('input', (e) => { mem.importance = +e.target.value; drawPlot(); update(false); });
  $('recall').addEventListener('click', recall);
  $('pin').addEventListener('click', () => { mem.pinned = !mem.pinned; if (mem.pinned && !reduced) card.v -= 380; drawPlot(); update(false); });
  $('reset').addEventListener('click', () => {
    stopPlay(); mem.recalls = []; mem.pinned = false; mem.importance = 0.5; $('importance').value = 0.5; lastTier = null;
    drawPlot(); setDay(0);
  });

  // 让时间走：每秒 30 天，一年约 12 秒
  let playAcc = 0;
  function stopPlay() { playing = false; $('play').textContent = '让时间走'; $('play').setAttribute('aria-pressed', false); }
  $('play').addEventListener('click', () => {
    if (playing) return stopPlay();
    if (day >= F.DAYS) setDay(0);
    playing = true; playAcc = day; $('play').textContent = '停'; $('play').setAttribute('aria-pressed', true);
  });

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

  drawAxes(); drawPlot(); update(false);
  requestAnimationFrame((t) => { last = t; frame(t); });
  // 开场：时间自己往前走一段，让人先看到它在掉；减弱动效时直接停在第 90 天
  if (reduced) setDay(90);
  else { playing = true; playAcc = 0; $('play').textContent = '停'; setTimeout(() => { if (playing && day >= 85) stopPlay(); }, 3200); }

  // 测试与截图用：?day=120&recalls=30,60&imp=0.5&pin=0
  const q = new URLSearchParams(location.search);
  if (q.has('day')) {
    stopPlay();
    if (q.get('recalls')) mem.recalls = q.get('recalls').split(',').map(Number).sort((a, b) => a - b);
    if (q.has('imp')) { mem.importance = +q.get('imp'); $('importance').value = mem.importance; }
    mem.pinned = q.get('pin') === '1';
    drawPlot(); setDay(+q.get('day'));
    card.x = yOf(F.stateAt(mem, day).factor); card.v = 0; ledge.x = ledge.target;
  }
  window.__fade = { mem, get day() { return day; }, card, ledge, yOf };
})();
