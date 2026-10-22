// Canvas view for 派活回放: loads one dataset, plays it, draws the stage and the timeline.
(function () {
  'use strict';
  const C = window.ReplayCore;
  const qs = new URLSearchParams(location.search);
  const index = window.REPLAY_INDEX || [];
  const wanted = qs.get('d');
  const slug = wanted && /^[a-z0-9-]+$/.test(wanted) && index.some((d) => d.slug === wanted) ? wanted : (index[0] || {}).slug;
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const $ = (id) => document.getElementById(id);
  const canvas = $('stage'), ctx = canvas.getContext('2d');
  const FONT = '"PingFang SC","Hiragino Sans GB","Noto Sans CJK SC","Microsoft YaHei",system-ui,sans-serif';

  let model, L, playback = C.DEFAULT_PLAYBACK, clock = null, endT = 0;
  let t = 0, playing = false, last = 0, dragging = false, wasPlaying = false, selected = -1, dpr = 1;
  const drawTimes = [];   // ms per draw(), last 240 frames, read by the browser check
  const hook = { ready: false };
  window.__replay = hook;

  // ---- loading ------------------------------------------------------------------------------------
  function load() {
    if (!slug) return fail('没有可回放的数据。');
    const s = document.createElement('script');
    s.src = 'data/' + slug + '.js';
    s.onload = () => (window.REPLAY_DATA && window.REPLAY_DATA[slug] ? start(window.REPLAY_DATA[slug]) : fail('数据文件是空的。'));
    s.onerror = () => fail('数据文件没加载上。');
    document.head.appendChild(s);
  }
  function fail(msg) { $('caption').textContent = msg; $('caption').style.opacity = 1; }

  function start(data) {
    model = C.prepare(data);
    document.title = data.title + ' · 派活回放';
    $('title').textContent = data.title;
    $('subtitle').textContent = data.subtitle || '';
    buildLegend();
    buildSwitcher();
    setPlayback(playback);
    resize();
    window.addEventListener('resize', resize);
    bindControls();
    const view = qs.get('view'), tq = parseFloat(qs.get('t'));
    if (view === 'hero') seek(model.heroT);
    else if (view === 'wide') seek(model.duration * 0.6);
    else if (view === 'end') seek(endT);
    else if (!isNaN(tq)) seek(tq);
    else { seek(0); setTimeout(() => setPlaying(true), 500); }
    Object.assign(hook, {
      ready: true,
      seek: (x) => { setPlaying(false); seek(x); draw(); },
      play: () => setPlaying(true),
      pause: () => setPlaying(false),
      setPlayback: (p) => { setPlayback(p); draw(); },
      state: () => snapshot(),
      drawStats: () => {
        const a = drawTimes.slice().sort((p, q) => p - q);
        return { frames: a.length, median: a[a.length >> 1] || 0, p95: a[Math.floor(a.length * 0.95)] || 0 };
      },
    });
    last = performance.now();
    requestAnimationFrame(frame);
  }

  function buildLegend() {
    const seen = new Map();
    model.agents.forEach((a) => seen.set(C.agentBadge(a), { color: C.agentColor(a), square: a.kind === 'external' }));
    const el = $('legend');
    el.innerHTML = '';
    const add = (label, color, square) => {
      const s = document.createElement('span');
      s.className = 'key';
      s.innerHTML = '<i></i>';
      s.querySelector('i').style.background = color;
      if (square) s.querySelector('i').style.borderRadius = '2px';
      s.append(label);
      el.appendChild(s);
    };
    add('作者', C.COLOR.author);
    add('总调度', C.COLOR.cc);
    seen.forEach((k, label) => add(label, k.color, k.square));
  }

  function buildSwitcher() {
    const sel = $('dataset');
    if (index.length < 2) { sel.hidden = true; return; }
    sel.innerHTML = '';
    index.forEach((d) => {
      const o = document.createElement('option');
      o.value = d.slug; o.textContent = d.title; o.selected = d.slug === slug;
      sel.appendChild(o);
    });
    sel.hidden = false;
    sel.onchange = () => { location.search = '?d=' + encodeURIComponent(sel.value); };
  }

  // ---- time -------------------------------------------------------------------------------------
  function setPlayback(p) {
    playback = p;
    clock = C.makeClock(model, playback);
    endT = clock.end;
    $('speed').value = String(p);
  }
  function seek(x) { t = Math.max(0, Math.min(endT, x)); }
  function setPlaying(on) {
    if (on && t >= endT) seek(0);
    playing = on;
    $('play').setAttribute('aria-pressed', on ? 'true' : 'false');
    last = performance.now();
  }

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (playing && !dragging) {
      t = clock.real(clock.play(t) + dt);
      if (t >= endT) { t = endT; setPlaying(false); }
    }
    const t0 = performance.now();
    draw();
    drawTimes.push(performance.now() - t0);
    if (drawTimes.length > 240) drawTimes.shift();
    requestAnimationFrame(frame);
  }

  // ---- controls ---------------------------------------------------------------------------------
  function bindControls() {
    $('play').onclick = () => setPlaying(!playing);
    $('restart').onclick = () => { seek(0); setPlaying(true); };
    $('speed').onchange = (e) => { setPlayback(Number(e.target.value)); seek(t); };
    window.addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'SELECT') return;
      if (e.code === 'Space') { e.preventDefault(); setPlaying(!playing); }
      if (e.code === 'ArrowRight') seek(t + endT * 0.03);
      if (e.code === 'ArrowLeft') seek(t - endT * 0.03);
    });
    canvas.addEventListener('pointerdown', (e) => {
      const p = point(e);
      if (Math.abs(p.y - L.timeline.y) < 22) {
        dragging = true; wasPlaying = playing; canvas.setPointerCapture(e.pointerId);
        scrub(p.x);
        return;
      }
      selected = hitCell(p);
    });
    canvas.addEventListener('pointermove', (e) => { if (dragging) scrub(point(e).x); });
    const up = () => { if (dragging) { dragging = false; if (wasPlaying && t < endT) setPlaying(true); } };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    $('detail').onclick = () => { selected = -1; };
  }
  function point(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function scrub(x) {
    const f = (x - L.timeline.x0) / (L.timeline.x1 - L.timeline.x0);
    seek(f * endT);
  }
  function hitCell(p) {
    if (t >= endT - 0.01) return -1;
    for (let i = 0; i < L.cells.length; i++) {
      const c = L.cells[i];
      if (p.x >= c.x && p.x < c.x + c.w && p.y >= c.y && p.y < c.y + c.h) return model.agents[i].dispatchT <= t ? i : -1;
    }
    return -1;
  }

  // ---- layout -----------------------------------------------------------------------------------
  function resize() {
    const W = window.innerWidth, H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    L = C.layout(model, W, H, { picker: index.length > 1 });
    shortLabels = null;
    const cap = $('caption');
    cap.style.top = (L.stage.y + L.stage.h - L.captionH) + 'px';
    cap.style.height = L.captionH + 'px';
    $('summary').style.bottom = (L.H - (L.stage.y + L.stage.h)) + 'px';
    $('counters').style.bottom = (L.H - L.timeline.y + 16) + 'px';
    document.body.classList.toggle('portrait', L.portrait);
    document.body.classList.toggle('compact', L.compact);
    document.body.classList.toggle('tall', L.tall);
  }

  // ---- drawing ----------------------------------------------------------------------------------
  const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
  const easeIn = (p) => p * p * p;

  function draw() {
    if (!model) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = L.W, H = L.H;
    const bg = ctx.createRadialGradient(W * 0.3, H * 0.45, 0, W * 0.3, H * 0.45, Math.max(W, H));
    bg.addColorStop(0, '#0B1020'); bg.addColorStop(1, '#05070F');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1A2340';
    for (let x = 14; x < W; x += 28) for (let y = L.header + 10; y < L.stage.y + L.stage.h; y += 28) ctx.fillRect(x, y, 1.2, 1.2);

    const states = model.agents.map((a) => C.agentState(a, t, clock));
    const ending = Math.max(0, Math.min(1, (clock.play(t) - (clock.length - C.FX.tail)) / C.FX.tail));
    const mainTokens = C.mainTokensAt(model, t);
    const ccR = Math.max(L.rUnit * 0.5, C.radiusFor(mainTokens, L.rUnit, model.maxPeak));

    ctx.globalAlpha = 1 - ending * 0.94;
    drawLinks(states);
    model.agents.forEach((a, i) => drawCell(a, states[i], L.cells[i]));
    if (!reduceMotion) drawSparks(ccR);
    ctx.globalAlpha = 1;
    drawAuthor();
    drawCC(ccR, mainTokens, states);
    drawPackets(states);
    if (ending > 0) drawEnding(ending);
    drawTimeline();
    updateDom(states, ending);
  }

  function linkPath(a, b, bend) {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    return { a, b, c: { x: mx - (dy / len) * len * bend, y: my + (dx / len) * len * bend } };
  }
  function along(path, p) {
    const q = 1 - p;
    return {
      x: q * q * path.a.x + 2 * q * p * path.c.x + p * p * path.b.x,
      y: q * q * path.a.y + 2 * q * p * path.c.y + p * p * path.b.y,
    };
  }
  function ccPath(i) { const c = L.cells[i]; return linkPath(L.cc, { x: c.cx, y: c.cy }, 0.12); }

  function drawLinks(states) {
    const base = ctx.globalAlpha;
    ctx.lineWidth = 1;
    states.forEach((s, i) => {
      if (s.phase === 'idle' || s.phase === 'done') return;
      const path = ccPath(i);
      ctx.strokeStyle = C.agentColor(model.agents[i]);
      ctx.globalAlpha = base * (s.phase === 'working' ? 0.13 : 0.32);
      ctx.beginPath(); ctx.moveTo(path.a.x, path.a.y); ctx.quadraticCurveTo(path.c.x, path.c.y, path.b.x, path.b.y); ctx.stroke();
    });
    ctx.globalAlpha = base;
  }

  function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2); }

  function bubble(x, y, r, color, strength) {
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    g.addColorStop(0, hexA(color, 0.55 * strength)); g.addColorStop(1, hexA(color, 0.12 * strength));
    ctx.fillStyle = g; circle(x, y, r); ctx.fill();
    ctx.strokeStyle = hexA(color, 0.9 * strength); ctx.lineWidth = 1.5; circle(x, y, r); ctx.stroke();
  }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')';
  }

  function text(str, x, y, size, color, align, weight) {
    ctx.font = (weight || 400) + ' ' + size + 'px ' + FONT;
    ctx.fillStyle = color; ctx.textAlign = align || 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(str, x, y);
  }

  function drawCell(a, s, c) {
    const color = C.agentColor(a);
    const r0 = L.rUnit;
    const base = ctx.globalAlpha;
    const sel = selected === a.index;
    if (s.phase === 'idle') {
      ctx.setLineDash([3, 4]); ctx.strokeStyle = hexA('#8A93B2', 0.28); ctx.lineWidth = 1;
      circle(c.cx, c.cy, r0 * 0.35); ctx.stroke(); ctx.setLineDash([]);
      text(fitLabel(a.label, c.w - 6, L.font, 400), c.cx, c.labelY + L.font, L.font, hexA('#8A93B2', 0.35));
      return;
    }
    const peakR = a.hasBubble ? C.radiusFor(a.peakTokens, r0, model.maxPeak) : r0 * 0.55;
    const nowR = a.hasBubble ? C.radiusFor(s.tokens || 0, r0, model.maxPeak) : r0 * 0.55;
    if (s.phase === 'dispatching' || s.phase === 'working') {
      if (a.hasBubble) bubble(c.cx, c.cy, nowR, color, 1);
      else drawBlock(c.cx, c.cy, nowR, color, 0.8 + 0.2 * Math.sin(clock.play(t) * 4));
    } else if (s.phase === 'collapsing') {
      const r = nowR + (3.5 - nowR) * easeIn(s.p);
      ctx.strokeStyle = hexA(color, 0.6 * (1 - s.p)); ctx.lineWidth = 2;
      if (a.hasBubble) { circle(c.cx, c.cy, nowR + 6 * s.p); ctx.stroke(); bubble(c.cx, c.cy, r, color, 1 + s.p * 0.5); }
      else { blockPath(c.cx, c.cy, nowR + 6 * s.p); ctx.stroke(); drawBlock(c.cx, c.cy, r, color, 1); }
    } else {
      ctx.setLineDash([3, 4]); ctx.strokeStyle = hexA(color, 0.42); ctx.lineWidth = 1;
      if (a.hasBubble) circle(c.cx, c.cy, peakR); else blockPath(c.cx, c.cy, peakR);
      ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = hexA(color, 0.9); circle(c.cx, c.cy, 2.5); ctx.fill();
    }
    if (sel) { ctx.strokeStyle = hexA('#E8ECF8', 0.8); ctx.lineWidth = 1; ctx.strokeRect(c.x + 3, c.y + 3, c.w - 6, c.h - 6); }
    ctx.globalAlpha = base;
    const f = L.font;
    text(fitLabel(a.label, c.w - 6, f, 500), c.cx, c.labelY + f, f, hexA('#E8ECF8', s.phase === 'done' ? 0.62 : 0.95), 'center', 500);
    if (!L.compact) {
      let line;
      if (s.phase === 'done' || s.phase === 'returning' || s.phase === 'collapsing') {
        line = (a.hasBubble ? C.fmtTokensTight(a.peakTokens) : C.fmtClock(a.handbackT - a.dispatchT)) + '→' + C.fmtInt(a.handbackChars) + '字';
      } else if (a.hasBubble) {
        line = C.fmtTokensTight(s.tokens || 0) + ' · ' + toolsSoFar(a) + '次';
      } else {
        line = '已跑 ' + C.fmtClock(t - a.dispatchT);      // an external AI's inside is not in the transcript
      }
      text(line, c.cx, c.labelY + f * 2 + 3, f - 1 >= C.MIN_FONT ? f - 1 : C.MIN_FONT, hexA(color, s.phase === 'done' ? 0.7 : 0.95));
    }
  }

  // If any label is too wide for its cell, every label drops its first word ("事实核查 n14" → "n14"),
  // so the grid stays consistent; whatever still does not fit gets an ellipsis.
  const fitCache = new Map();
  let shortLabels = null;
  function fitLabel(label, width, size, weight) {
    if (shortLabels === null) {
      ctx.font = '500 ' + size + 'px ' + FONT;
      shortLabels = model.agents.some((a) => ctx.measureText(a.label).width > width);
    }
    const key = label + '|' + Math.round(width) + '|' + size + '|' + weight + '|' + shortLabels;
    if (fitCache.has(key)) return fitCache.get(key);
    ctx.font = weight + ' ' + size + 'px ' + FONT;
    const fits = (x) => ctx.measureText(x).width <= width;
    let out = label;
    if (shortLabels && /\s/.test(label)) out = label.split(/\s+/).slice(1).join(' ');
    while (!fits(out) && out.length > 1) out = out.slice(0, -2) + '…';
    fitCache.set(key, out);
    return out;
  }

  // External AIs: a solid square, so it never reads as a context bubble (its context is not in the transcript).
  function blockPath(x, y, r) { ctx.beginPath(); ctx.roundRect(x - r, y - r, r * 2, r * 2, Math.min(5, r / 4)); }
  function drawBlock(x, y, r, color, a) {
    blockPath(x, y, r);
    ctx.fillStyle = hexA(color, 0.9 * a); ctx.fill();
    ctx.strokeStyle = hexA('#FFFFFF', 0.35 * a); ctx.lineWidth = 1; ctx.stroke();
  }

  function toolsSoFar(a) {
    let n = 0;
    for (const x of a.tools) { if (x[0] <= t) n++; else break; }
    return n;
  }

  function drawSparks(ccR) {
    for (const sp of C.sparks(model, t, clock)) {
      let x, y, r;
      if (sp.owner < 0) { x = L.cc.x; y = L.cc.y; r = ccR; }
      else {
        const a = model.agents[sp.owner], c = L.cells[sp.owner];
        x = c.cx; y = c.cy;
        r = a.hasBubble ? C.radiusFor(C.interp(a.ctxS, t), L.rUnit, model.maxPeak) : L.rUnit * 0.55;
      }
      const ang = sp.seed * Math.PI * 2, d = r + 2 + sp.age * (8 + L.rUnit * 0.35);
      const px = x + Math.cos(ang) * d, py = y + Math.sin(ang) * d;
      ctx.fillStyle = hexA((C.GROUP[sp.group] || C.GROUP.other).color, 1 - sp.age);
      circle(px, py, 2.1 * (1 - sp.age * 0.4)); ctx.fill();
    }
  }

  function drawAuthor() {
    const a = L.author;
    ctx.save(); ctx.shadowColor = C.COLOR.author; ctx.shadowBlur = 14;
    ctx.fillStyle = hexA(C.COLOR.author, 0.85); circle(a.x, a.y, a.r); ctx.fill(); ctx.restore();
    text('作者', a.x, a.y + a.r + 16, Math.max(12, L.font), C.COLOR.text, 'center', 600);
  }

  function drawCC(r, tokens, states) {
    const c = L.cc;
    // pulses where reports land
    states.forEach((s) => {
      if (s.phase === 'done' && s.since < C.FX.pulse) {
        const p = s.since / C.FX.pulse;
        ctx.strokeStyle = hexA(C.COLOR.cc, 0.7 * (1 - p)); ctx.lineWidth = 2; circle(c.x, c.y, r + 4 + p * 18); ctx.stroke();
      }
    });
    ctx.save(); ctx.shadowColor = C.COLOR.cc; ctx.shadowBlur = 24;
    bubble(c.x, c.y, r, C.COLOR.cc, 1.25); ctx.restore();
    const f = Math.max(12, L.font);
    text('Claude Code · 总调度', c.x, c.y + r + f + 4, f, C.COLOR.text, 'center', 600);
    text('上下文 ' + C.fmtTokens(tokens) + ' token', c.x, c.y + r + f * 2 + 8, Math.max(11, f - 1), hexA(C.COLOR.cc, 0.95));
  }

  function packet(x, y, color, label) {
    ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = 12;
    ctx.fillStyle = color; circle(x, y, 4.5); ctx.fill(); ctx.restore();
    if (label) text(label, x + 8, y - 8, Math.max(11, L.font - 1), color, 'left', 600);
  }

  function drawPackets(states) {
    states.forEach((s, i) => {
      const a = model.agents[i];
      if (s.phase === 'dispatching') {
        const pos = along(ccPath(i), ease(s.p));
        packet(pos.x, pos.y, C.COLOR.cc);
      } else if (s.phase === 'returning') {
        const path = ccPath(i);
        const pos = along({ a: path.b, b: path.a, c: path.c }, ease(s.p));
        packet(pos.x, pos.y, C.agentColor(a), C.fmtInt(a.handbackChars) + ' 字');
      }
    });
    const task = model.task;
    const qt = task ? C.since(clock, t, task.t) : -1;
    if (qt >= 0 && qt < C.FX.task) {
      const pos = along(linkPath(L.author, L.cc, -0.15), ease(qt / C.FX.task));
      packet(pos.x, pos.y, C.COLOR.author, '任务');
    }
    const rep = model.reply;
    const qr = rep ? C.since(clock, t, rep.t) : -1;
    if (qr >= 0 && qr < C.FX.reply) {
      const pos = along(linkPath(L.cc, L.author, -0.15), ease(qr / C.FX.reply));
      packet(pos.x, pos.y, C.COLOR.cc, C.fmtInt(rep.chars) + ' 字');
    }
  }

  function drawEnding(k) {
    const b = L.endBig, c = L.endCc;
    ctx.globalAlpha = k;
    ctx.setLineDash([4, 5]); ctx.strokeStyle = hexA('#FF8A4C', 0.8); ctx.lineWidth = 1.5;
    circle(b.x, b.y, b.r); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = hexA('#FF8A4C', 0.08); circle(b.x, b.y, b.r); ctx.fill();
    const f = Math.max(12, L.font);
    text(model.nSub + ' 个子 agent 的上下文峰值加起来', b.x, b.y - 4, f, C.COLOR.text, 'center', 600);
    text(C.fmtTokens(model.sumPeak) + ' token', b.x, b.y + f + 4, f + 4, '#FF8A4C', 'center', 700);
    bubble(c.x, c.y, c.r, C.COLOR.cc, 1.2);
    text('总调度自己', c.x, c.y + c.r + f + 4, f, C.COLOR.text, 'center', 600);
    text(C.fmtTokens(model.mainMax) + ' token', c.x, c.y + c.r + f * 2 + 8, f, C.COLOR.cc, 'center', 700);
    text('（同一把尺：面积对应 token 数）', b.x, b.y + b.r + f + 6, Math.max(11, f - 2), C.COLOR.dim);
    ctx.globalAlpha = 1;
  }

  function drawTimeline() {
    const tl = L.timeline, x = (v) => tl.x0 + (tl.x1 - tl.x0) * (v / endT);
    ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.strokeStyle = '#1F2947'; ctx.beginPath(); ctx.moveTo(tl.x0, tl.y); ctx.lineTo(tl.x1, tl.y); ctx.stroke();
    ctx.strokeStyle = hexA(C.COLOR.cc, 0.85); ctx.beginPath(); ctx.moveTo(tl.x0, tl.y); ctx.lineTo(x(t), tl.y); ctx.stroke();
    ctx.lineWidth = 1.5;
    for (const a of model.agents) {
      ctx.strokeStyle = hexA(C.agentColor(a), 0.8);
      ctx.beginPath(); ctx.moveTo(x(a.dispatchT), tl.y - 4); ctx.lineTo(x(a.dispatchT), tl.y - 10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x(a.handbackT), tl.y + 4); ctx.lineTo(x(a.handbackT), tl.y + 10); ctx.stroke();
    }
    if (model.task) { ctx.fillStyle = C.COLOR.author; circle(x(model.task.t), tl.y, 3.5); ctx.fill(); }
    if (model.reply) { ctx.fillStyle = C.COLOR.cc; circle(x(model.reply.t), tl.y, 3.5); ctx.fill(); }
    ctx.fillStyle = '#E8ECF8'; circle(x(t), tl.y, dragging ? 8 : 6); ctx.fill();
    ctx.lineCap = 'butt';
  }

  // ---- DOM overlays -----------------------------------------------------------------------------
  let lastCaption = null;
  function updateDom(states, ending) {
    const n = C.counters(model, Math.min(t, model.duration));
    $('clock').textContent = (playing && clock.isSlow(t) ? '慢放 · ' : '') + C.fmtClock(Math.min(t, model.duration)) + ' / ' + C.fmtClock(model.duration);
    $('c-running').textContent = n.running;
    $('c-sent').textContent = n.dispatched + '/' + n.total;
    $('c-back').textContent = n.returned + '/' + n.total;
    $('c-live').textContent = C.fmtTokens(n.liveTokens);
    $('c-report').textContent = C.fmtInt(n.reportChars);
    $('c-tools').textContent = C.fmtInt(n.toolCalls);

    const cap = C.caption(model, t, clock);
    const el = $('caption');
    const key = cap ? cap.index : null;
    if (key !== lastCaption) { el.textContent = cap ? cap.text : ''; lastCaption = key; }
    let op = 0;
    if (cap) {
      const inP = C.since(clock, t, cap.start) / 0.35, outP = C.since(clock, cap.end, t) / 0.35;
      op = Math.max(0, Math.min(1, inP, outP));
    }
    el.style.opacity = ending > 0.4 ? 0 : op;

    const end = $('summary');
    end.hidden = ending < 0.6;
    end.style.opacity = Math.max(0, (ending - 0.6) / 0.4);
    if (!end.hidden && !end.dataset.filled) {
      const span = model.reply && model.task ? model.reply.t - model.task.t : model.duration;
      const parts = [Math.round(span / 60) + ' 分钟里，' + model.nSub + ' 个子 agent 调了 ' + C.fmtInt(model.subTools)
        + ' 次工具，交回的报告一共 ' + C.fmtInt(model.subReport) + ' 字'];
      if (model.nExt) parts.push('外部 AI 被叫了 ' + model.nExt + ' 次');
      if (model.reply) parts.push('总调度最后写给作者 ' + C.fmtInt(model.reply.chars) + ' 字');
      $('s-line1').textContent = parts.join('；');
      end.dataset.filled = '1';
    }
    $('play').textContent = playing ? '暂停' : t >= endT ? '再看一遍' : '播放';

    const d = $('detail');
    if (selected >= 0 && !(t >= endT)) {
      const a = model.agents[selected], s = states[selected];
      const groups = {};
      a.tools.forEach((x) => { if (x[0] <= t) groups[x[1]] = (groups[x[1]] || 0) + 1; });
      const toolLine = Object.keys(groups).map((g) => (C.GROUP[g] || C.GROUP.other).label + ' ' + groups[g]).join(' · ') || '还没调工具';
      const done = s.phase === 'done' || s.phase === 'returning' || s.phase === 'collapsing';
      d.innerHTML = '';
      const add = (cls, txt) => { const p = document.createElement('p'); p.className = cls; p.textContent = txt; d.appendChild(p); };
      const ext = a.kind === 'external';
      add('d-title', a.label + ' · ' + C.agentBadge(a) + (ext ? ' · 外部 AI' : '') + (a.effort ? ' · effort ' + a.effort : ''));
      add('', '派出于 ' + C.fmtClock(a.dispatchT) + (!done ? '，已跑 ' + C.fmtClock(t - a.dispatchT)
        : ext ? '，' + C.fmtClock(a.handbackT - a.dispatchT) + ' 后总调度读回结果' : '，跑了 ' + C.fmtClock(a.handbackT - a.dispatchT)));
      if (ext && done && a.endT != null) add('', '它自己跑了 ' + C.fmtClock(a.endT - a.dispatchT) + '（脚本自报）');
      if (a.hasBubble) add('', (done ? '上下文峰值 ' + C.fmtTokens(a.peakTokens) : '当前上下文 ' + C.fmtTokens(s.tokens || 0)) + ' token');
      if (ext) add('', '会话记录里看不到它读了什么、调了什么');
      else add('', '工具：' + toolLine);
      add('', done ? (ext ? '总调度读回 ' : '交回报告 ') + C.fmtInt(a.handbackChars) + ' 字' : '还在干活');
      add('d-hint', '点这里关闭');
      d.hidden = false;
    } else d.hidden = true;
  }

  function snapshot() {
    const states = model.agents.map((a) => C.agentState(a, t, clock));
    const cap = C.caption(model, t, clock);
    return {
      t, endT, playback, playing, slow: clock.isSlow(t), length: clock.length, maxConcurrent: model.maxConcurrent,
      counters: C.counters(model, Math.min(t, model.duration)),
      phases: states.map((s) => s.phase),
      caption: cap ? cap.text : null,
      layout: { W: L.W, H: L.H, cols: L.cols, rows: L.rows, rUnit: L.rUnit, font: L.font, portrait: L.portrait, compact: L.compact,
        endRulerY: L.endBig.y + L.endBig.r + Math.max(12, L.font) + 6 },
      cells: L.cells.map((c, i) => ({ x: c.cx, y: c.cy, kind: model.agents[i].kind, color: C.agentColor(model.agents[i]) })),
      dpr,
      summaryShown: !$('summary').hidden,
    };
  }

  load();
})();
