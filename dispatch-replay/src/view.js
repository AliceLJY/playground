// Canvas view for 派活回放: loads one dataset, plays it, draws the stage and the timeline.
(function () {
  'use strict';
  const C = window.ReplayCore;
  const qs = new URLSearchParams(location.search);
  const index = window.REPLAY_INDEX || [];
  const wanted = qs.get('d');
  const slug = wanted && /^[a-z0-9-]+$/.test(wanted) && index.some((d) => d.slug === wanted) ? wanted : (index[0] || {}).slug;
  const entry = index.find((d) => d.slug === slug) || {};
  const TH = C.THEMES[entry.theme] || C.THEMES.deepspace;     // this dataset's palette (SPEC §4)
  const colorOf = (a) => C.agentColor(a, TH);
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const $ = (id) => document.getElementById(id);
  const canvas = $('stage'), ctx = canvas.getContext('2d');
  const FONT = '"PingFang SC","Hiragino Sans GB","Noto Sans CJK SC","Microsoft YaHei",system-ui,sans-serif';
  const MONO = '"SF Mono","JetBrains Mono",Menlo,Consolas,monospace';

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
    document.body.classList.add('theme-' + (C.THEMES[entry.theme] ? entry.theme : 'deepspace'));
    drops = model.drops;
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
      tick: (dt) => step(dt),     // for frame-by-frame recording: stub requestAnimationFrame, then call this per frame
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
    model.agents.forEach((a) => seen.set(C.agentBadge(a), { color: colorOf(a), square: a.kind === 'external' }));
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
    add('作者', TH.author);
    add('总调度', TH.cc);
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
    step(dt);
    requestAnimationFrame(frame);
  }
  // advance playback by dt playback seconds and draw (the rAF loop, or a recorder driving frames itself)
  function step(dt) {
    if (playing && !dragging) {
      t = clock.real(clock.play(t) + dt);
      if (t >= endT) { t = endT; setPlaying(false); }
    }
    const t0 = performance.now();
    draw();
    drawTimes.push(performance.now() - t0);
    if (drawTimes.length > 240) drawTimes.shift();
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
    document.body.classList.toggle('narrow', L.narrow);
    const big = $('big');
    if (L.readout) Object.assign(big.style, { left: L.readout.x + 'px', top: L.readout.y + 'px', width: L.readout.w + 'px', height: L.readout.h + 'px' });
    buildLayers();
  }

  // ---- drawing ----------------------------------------------------------------------------------
  // Galaxy look (SPEC §4–5). The dispatcher is a star in the middle. Each subagent is a small galaxy: its glow sphere's
  // area follows its context (the same ruler as the star) and its dust grows with it, spinning while it works. An
  // external AI is a black hole, dark inside because nothing of its context is in the transcript. Work goes out as a
  // seed and comes back as a comet carrying the report's length. Nebula and stars are cached per screen size.
  const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
  const easeIn = (p) => p * p * p;
  const TAU = Math.PI * 2;
  const DUST = 240;          // dust grains of a galaxy at the largest subagent peak; grows with tokens
  let bgLayer = null, stars = [], drops = [];

  function layerCanvas(paint) {
    const c = document.createElement('canvas');
    c.width = Math.round(L.W * dpr); c.height = Math.round(L.H * dpr);
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    paint(g);
    return c;
  }
  function buildLayers() {
    const W = L.W, H = L.H, M = Math.max(W, H);
    bgLayer = layerCanvas((g) => {
      g.fillStyle = TH.ink; g.fillRect(0, 0, W, H);
      for (const [fx, fy, col, a, rr] of TH.nebula) {
        const x = fx * W, y = fy * H, R = M * rr, gr = g.createRadialGradient(x, y, 0, x, y, R);
        gr.addColorStop(0, hexA(col, a * 0.55)); gr.addColorStop(0.5, hexA(col, a * 0.18)); gr.addColorStop(1, hexA(col, 0));
        g.fillStyle = gr; g.fillRect(0, 0, W, H);
      }
      const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, M * 0.8);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
      g.fillStyle = v; g.fillRect(0, 0, W, H);
    });
    stars = Array.from({ length: Math.round((W * H) / 2600) }, (_, i) => ({
      x: C.hash(i * 3 + 1) * W, y: C.hash(i * 3 + 2) * H, z: 0.2 + C.hash(i * 3 + 3) * 0.8, tw: C.hash(i * 7 + 5) * TAU,
    }));
  }

  function draw() {
    if (!model) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bgLayer, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawStars();

    const states = model.agents.map((a) => C.agentState(a, t, clock));
    const ending = Math.max(0, Math.min(1, (clock.play(t) - (clock.length - C.FX.tail)) / C.FX.tail));
    const mainTokens = C.mainTokensAt(model, t);
    const ccR = Math.max(L.rUnit * 0.5, C.radiusFor(mainTokens, L.rUnit, model.maxPeak));

    ctx.globalAlpha = 1 - ending * 0.94;
    drawOrbits();
    drawLinks(states);
    model.agents.forEach((a, i) => drawCell(a, states[i], L.cells[i]));
    if (!reduceMotion) drawSparks(ccR);
    ctx.globalAlpha = 1;
    drawAuthor();
    ctx.globalAlpha = 1 - ending;   // the end view draws its own star next to the summed galaxy
    drawCore(ccR, mainTokens, states, 1 - ending);
    ctx.globalAlpha = 1;
    drawPackets(states);
    if (ending > 0) drawEnding(ending);
    drawTimeline();
    drawCorners();
    updateDom(states, ending);
  }

  const spin = () => (reduceMotion ? 0 : clock.play(t));

  function drawStars() {
    const w = spin(), W = L.W;
    ctx.fillStyle = TH.star;
    for (const s of stars) {
      let x = (s.x - w * s.z * 5) % W; if (x < 0) x += W;
      ctx.globalAlpha = 0.2 + 0.6 * s.z * (0.6 + 0.4 * Math.sin(w * 1.7 + s.tw));
      const size = s.z > 0.88 ? 1.8 : 1.1;
      ctx.fillRect(x, s.y, size, size);
    }
    ctx.globalAlpha = 1;
  }

  function drawOrbits() {
    const o = L.orbits;
    if (o.grid) return;
    const full = o.span >= TAU - 1e-6, w = spin(), base = ctx.globalAlpha;
    ctx.lineWidth = 1;
    o.rings.forEach((k, j) => {
      ctx.strokeStyle = hexA(TH.orbit, 0.12); ctx.beginPath();
      ctx.ellipse(L.cc.x, L.cc.y, o.ax * k, o.ay * k, 0, full ? 0 : o.a0 - 0.06, full ? TAU : o.a0 + o.span + 0.06);
      ctx.stroke();
      // a glint travelling along each orbit
      const f = (w * 0.05 * (j % 2 ? -1 : 1) + j * 0.37) % 1, th = o.a0 + (full ? TAU : o.span) * ((f + 1) % 1);
      const gx = L.cc.x + Math.cos(th) * o.ax * k, gy = L.cc.y + Math.sin(th) * o.ay * k;
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, 8); g.addColorStop(0, hexA(TH.glint, 0.7 * base)); g.addColorStop(1, hexA(TH.glint, 0));
      ctx.fillStyle = g; circle(gx, gy, 8); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    });
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
  function ccPath(i) { const c = L.cells[i]; return linkPath(L.cc, { x: c.cx, y: c.cy }, 0.14); }

  // Live links: a faint tether with dashes flowing outwards from the star.
  function drawLinks(states) {
    const base = ctx.globalAlpha;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 7]); ctx.lineDashOffset = -spin() * 26;
    states.forEach((s, i) => {
      if (s.phase === 'idle' || s.phase === 'done') return;
      const path = ccPath(i);
      ctx.strokeStyle = colorOf(model.agents[i]);
      ctx.globalAlpha = base * (s.phase === 'working' ? 0.3 : 0.6);
      ctx.beginPath(); ctx.moveTo(path.a.x, path.a.y); ctx.quadraticCurveTo(path.c.x, path.c.y, path.b.x, path.b.y); ctx.stroke();
    });
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
    ctx.globalAlpha = base;
  }

  function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, TAU); }

  // A subagent as a small galaxy. R follows its context (area ∝ tokens); `fall` in [0, 1] pulls the dust into the core.
  function galaxy(seed, x, y, R, color, k, w, fall, maxDust) {
    const base = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(x, y, 0, x, y, R);
    halo.addColorStop(0, hexA('#FFFFFF', 0.95 * k)); halo.addColorStop(0.06, hexA(color, 0.85 * k));
    halo.addColorStop(0.3, hexA(color, 0.3 * k)); halo.addColorStop(0.75, hexA(color, 0.1 * k)); halo.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = halo; circle(x, y, R); ctx.fill();
    ctx.strokeStyle = hexA(color, 0.28 * k); ctx.lineWidth = 1; circle(x, y, R * (1 - easeIn(fall || 0))); ctx.stroke();   // the ruler: area ∝ tokens
    const n = Math.min(maxDust || 900, Math.round(DUST * (R / L.rUnit) ** 2));
    const tilt = seed * 0.73, ct = Math.cos(tilt), st = Math.sin(tilt), shrink = 1 - easeIn(fall || 0);
    for (const white of [false, true]) {
      ctx.fillStyle = white ? '#FFFFFF' : color;
      ctx.globalAlpha = base * k * (white ? 0.85 : 0.6);
      for (let i = 0; i < n; i++) {
        const u = C.hash(seed * 7919 + i * 3), v = C.hash(seed * 7919 + i * 3 + 1), q = C.hash(seed * 7919 + i * 3 + 2);
        if ((q > 0.86) !== white) continue;
        const f = 0.12 + 0.88 * Math.pow(u, 0.62), rr = R * f * shrink;
        const ang = (i & 1) * Math.PI + f * 3.4 + (v - 0.5) * 1.1 + w * (0.5 + 1.6 * (1 - f)) * (1 + 2 * (fall || 0));
        const px = Math.cos(ang) * rr, py = Math.sin(ang) * rr * 0.62;
        const s = q > 0.95 ? 2 : 1.25;
        ctx.fillRect(x + px * ct - py * st - s / 2, y + px * st + py * ct - s / 2, s, s);
      }
    }
    ctx.globalAlpha = base;
    ctx.globalCompositeOperation = 'source-over';
  }

  // An external AI as a black hole: a glowing accretion disk around a black centre.
  function blackHole(seed, x, y, b, color, k, w) {
    const base = ctx.globalAlpha, tilt = -0.32 + (seed % 3) * 0.12;
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(x, y, b * 0.8, x, y, b * 2.8);
    glow.addColorStop(0, hexA(color, 0.6 * k)); glow.addColorStop(0.3, hexA(color, 0.2 * k)); glow.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = glow; circle(x, y, b * 2.8); ctx.fill();
    ctx.lineWidth = b * 0.34; ctx.strokeStyle = hexA(color, 0.5 * k);
    ctx.beginPath(); ctx.ellipse(x, y, b * 2, b * 0.5, tilt, Math.PI, TAU); ctx.stroke();
    ctx.fillStyle = TH.holeDust; ctx.globalAlpha = base * k * 0.8;
    for (let i = 0; i < 46; i++) {
      const u = C.hash(seed * 131 + i * 2), v = C.hash(seed * 131 + i * 2 + 1), ph = (v + w * 0.32) % 1;
      const rr = b * (2.7 - 1.65 * ph), ang = u * TAU + ph * 6;
      const px = Math.cos(ang) * rr, py = Math.sin(ang) * rr * 0.42;
      ctx.fillRect(x + px * Math.cos(tilt) - py * Math.sin(tilt) - 0.7, y + px * Math.sin(tilt) + py * Math.cos(tilt) - 0.7, 1.4, 1.4);
    }
    ctx.globalAlpha = base;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000000'; circle(x, y, b); ctx.fill();          // event horizon: nothing inside is visible
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = hexA(TH.photon, 0.95 * k); ctx.lineWidth = 1.6; circle(x, y, b * 1.06); ctx.stroke();
    ctx.lineWidth = b * 0.26; ctx.strokeStyle = hexA(color, 0.9 * k);
    ctx.beginPath(); ctx.ellipse(x, y, b * 2, b * 0.5, tilt, 0, Math.PI); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  // Four corner brackets around (x, y); `half` is half the box side.
  function brackets(x, y, half, color, a, lw) {
    const k = Math.max(4, half * 0.3);
    ctx.strokeStyle = hexA(color, a); ctx.lineWidth = lw || 1.5; ctx.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const cx = x + sx * half, cy = y + sy * half;
      ctx.moveTo(cx, cy - sy * k); ctx.lineTo(cx, cy); ctx.lineTo(cx - sx * k, cy);
    }
    ctx.stroke();
  }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')';
  }

  function text(str, x, y, size, color, align, weight, font) {
    ctx.font = (weight || 400) + ' ' + size + 'px ' + (font || FONT);
    ctx.fillStyle = color; ctx.textAlign = align || 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(str, x, y);
  }

  const holeR = () => L.rUnit * 0.5;

  function drawCell(a, s, c) {
    const color = colorOf(a);
    const r0 = L.rUnit, w = spin();
    const base = ctx.globalAlpha;
    const sel = selected === a.index;
    if (s.phase === 'idle') {
      ctx.fillStyle = hexA(TH.idle, 0.35); ctx.fillRect(c.cx - 1, c.cy - 1, 2, 2);
      ctx.strokeStyle = hexA(TH.idle, 0.18); ctx.lineWidth = 1; circle(c.cx, c.cy, 5); ctx.stroke();
      text(fitLabel(a.label, c.lw - 4, L.font, 400), c.cx, c.labelY + L.font, L.font, hexA(TH.dim, 0.65));
      return;
    }
    const peakR = a.hasBubble ? C.radiusFor(a.peakTokens, r0, model.maxPeak) : holeR();
    const nowR = a.hasBubble ? C.radiusFor(s.tokens || 0, r0, model.maxPeak) : holeR();
    if (s.phase === 'dispatching' || s.phase === 'working') {
      const grow = s.phase === 'dispatching' ? ease(s.p) : 1;
      if (a.hasBubble) galaxy(a.index + 1, c.cx, c.cy, Math.max(nowR, 3) * grow, color, 1, w, 0);
      else blackHole(a.index + 1, c.cx, c.cy, nowR * grow, color, 1, w);
      if (s.phase === 'dispatching') {   // arrival: a shock ring and lock-on brackets snapping in
        ctx.strokeStyle = hexA(color, 0.8 * (1 - s.p)); ctx.lineWidth = 1.5; circle(c.cx, c.cy, peakR * (0.4 + s.p)); ctx.stroke();
        brackets(c.cx, c.cy, Math.max(nowR, r0 * 0.5) * (1.5 - 0.5 * ease(s.p)) + 6, color, 0.9 * (1 - s.p * 0.3));
      }
    } else if (s.phase === 'collapsing') {   // the galaxy falls into its core, the black hole closes
      if (a.hasBubble) galaxy(a.index + 1, c.cx, c.cy, nowR * (1 - 0.7 * easeIn(s.p)), color, 1 + s.p, w, s.p);
      else blackHole(a.index + 1, c.cx, c.cy, nowR * (1 - 0.7 * easeIn(s.p)), color, 1, w);
      ctx.globalCompositeOperation = 'lighter';
      const fl = ctx.createRadialGradient(c.cx, c.cy, 0, c.cx, c.cy, 14 + 10 * s.p);
      fl.addColorStop(0, hexA('#FFFFFF', 0.9 * s.p)); fl.addColorStop(1, hexA(color, 0));
      ctx.fillStyle = fl; circle(c.cx, c.cy, 14 + 10 * s.p); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    } else {   // done: what is left is a small star and the outline of how big it got
      ctx.setLineDash([2, 5]); ctx.strokeStyle = hexA(color, 0.35); ctx.lineWidth = 1;
      circle(c.cx, c.cy, peakR); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalCompositeOperation = 'lighter';
      const st = ctx.createRadialGradient(c.cx, c.cy, 0, c.cx, c.cy, 7);
      st.addColorStop(0, hexA('#FFFFFF', 0.9)); st.addColorStop(0.3, hexA(color, 0.7)); st.addColorStop(1, hexA(color, 0));
      ctx.fillStyle = st; circle(c.cx, c.cy, 7); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      if (!a.hasBubble) { ctx.fillStyle = '#000'; circle(c.cx, c.cy, 2); ctx.fill(); }
    }
    if (sel) brackets(c.cx, c.cy, Math.max(peakR, r0 * 0.6) + 8, '#FFFFFF', 0.85, 1);
    ctx.globalAlpha = base;
    const f = L.font;
    text(fitLabel(a.label, c.lw - 4, f, 600), c.cx, c.labelY + f, f, hexA(TH.label, s.phase === 'done' ? 0.6 : 0.95), 'center', 600);
    if (!L.oneLine) {
      let line;
      if (s.phase === 'done' || s.phase === 'returning' || s.phase === 'collapsing') {
        line = (a.hasBubble ? C.fmtTokensTight(a.peakTokens) : C.fmtClock(a.handbackT - a.dispatchT)) + '→' + C.fmtInt(a.handbackChars) + '字';
      } else if (a.hasBubble) {
        line = C.fmtTokensTight(s.tokens || 0) + ' · ' + toolsSoFar(a) + '次';
      } else {
        line = '已跑 ' + C.fmtClock(t - a.dispatchT);      // an external AI's inside is not in the transcript
      }
      text(line, c.cx, c.labelY + f * 2 + 3, f - 1 >= C.MIN_FONT ? f - 1 : C.MIN_FONT, hexA(color, s.phase === 'done' ? 0.7 : 1), 'center', 600, MONO);
    }
  }

  // If any label is too wide for its slot, every label drops its first word ("事实核查 n14" → "n14"),
  // so the labels stay consistent; whatever still does not fit gets an ellipsis.
  const fitCache = new Map();
  let shortLabels = null;
  function fitLabel(label, width, size, weight) {
    if (shortLabels === null) {
      ctx.font = '600 ' + size + 'px ' + FONT;
      shortLabels = model.agents.some((a, i) => ctx.measureText(a.label).width > L.cells[i].lw - 4);
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

  function toolsSoFar(a) {
    let n = 0;
    for (const x of a.tools) { if (x[0] <= t) n++; else break; }
    return n;
  }

  // Tool calls: a streak falling into whoever made the call (it is reading something in).
  function drawSparks(ccR) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 1.4;
    for (const sp of C.sparks(model, t, clock)) {
      let x, y, r;
      if (sp.owner < 0) { x = L.cc.x; y = L.cc.y; r = ccR; }
      else {
        const a = model.agents[sp.owner], c = L.cells[sp.owner];
        x = c.cx; y = c.cy;
        r = a.hasBubble ? C.radiusFor(C.interp(a.ctxS, t), L.rUnit, model.maxPeak) : holeR();
      }
      const ang = sp.seed * TAU, far = r + 14 + L.rUnit * 0.5, near = r * 0.35;
      const d = far + (near - far) * sp.age, d2 = d + 7;
      ctx.strokeStyle = hexA((TH.group[sp.group] || TH.group.other), 0.9 * (1 - sp.age * 0.6));
      ctx.beginPath(); ctx.moveTo(x + Math.cos(ang) * d2, y + Math.sin(ang) * d2); ctx.lineTo(x + Math.cos(ang) * d, y + Math.sin(ang) * d); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawAuthor() {
    const a = L.author, col = TH.author, w = spin();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, a.r * 2.2);
    g.addColorStop(0, hexA('#FFFFFF', 0.95)); g.addColorStop(0.2, hexA(col, 0.9)); g.addColorStop(1, hexA(col, 0));
    ctx.fillStyle = g; circle(a.x, a.y, a.r * 2.2); ctx.fill();
    const fl = a.r * (2.2 + 0.4 * Math.sin(w * 2));
    ctx.strokeStyle = hexA(col, 0.55); ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(a.x - fl, a.y); ctx.lineTo(a.x + fl, a.y); ctx.moveTo(a.x, a.y - fl); ctx.lineTo(a.x, a.y + fl); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    text('作者', a.x + a.r + 8, a.y + 4, Math.max(12, L.font), '#FFFFFF', 'left', 700);
  }

  // The dispatcher: a star sized by its own context, with a corona of rays, pulses where reports land and a
  // shock wave when its context is compacted.
  function drawCore(r, tokens, states, k) {
    const c = L.cc, gold = TH.cc, w = spin(), halo = L.ccHalo;
    ctx.globalCompositeOperation = 'lighter';
    const cor = ctx.createRadialGradient(c.x, c.y, r * 0.5, c.x, c.y, r + halo + r * 0.5);
    cor.addColorStop(0, hexA(gold, 0.55 * k)); cor.addColorStop(0.5, hexA(TH.ccEdge, 0.15 * k)); cor.addColorStop(1, hexA(gold, 0));
    ctx.fillStyle = cor; circle(c.x, c.y, r + halo + r * 0.5); ctx.fill();
    ctx.fillStyle = hexA(TH.glintCore || '#FFE9B0', 0.28 * k); ctx.beginPath();
    for (let i = 0; i < 18; i++) {
      const ang = (i * TAU) / 18 + w * 0.05, len = r + halo * (0.45 + 0.55 * Math.abs(Math.sin(w * 1.2 + i * 1.9)));
      ctx.moveTo(c.x + Math.cos(ang - 0.07) * r * 0.9, c.y + Math.sin(ang - 0.07) * r * 0.9);
      ctx.lineTo(c.x + Math.cos(ang) * len, c.y + Math.sin(ang) * len);
      ctx.lineTo(c.x + Math.cos(ang + 0.07) * r * 0.9, c.y + Math.sin(ang + 0.07) * r * 0.9);
    }
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    const body = ctx.createRadialGradient(c.x - r * 0.25, c.y - r * 0.25, r * 0.05, c.x, c.y, r);
    body.addColorStop(0, '#FFFFFF'); body.addColorStop(0.35, hexA('#FFEDB5', 0.97)); body.addColorStop(0.8, hexA(gold, 0.85)); body.addColorStop(1, hexA(TH.ccEdge, 0.75));
    ctx.fillStyle = body; circle(c.x, c.y, r); ctx.fill();
    ctx.strokeStyle = hexA('#FFF4D6', 0.8); ctx.lineWidth = 1; circle(c.x, c.y, r); ctx.stroke();
    states.forEach((s) => {
      if (s.phase === 'done' && s.since < C.FX.pulse) {
        const p = s.since / C.FX.pulse;
        ctx.strokeStyle = hexA(gold, 0.85 * (1 - p)); ctx.lineWidth = 2; circle(c.x, c.y, r + 4 + p * (halo + 10)); ctx.stroke();
      }
    });
    for (const te of drops) {
      const q = C.since(clock, t, te);
      if (q >= 0 && q < 1.6) {
        ctx.strokeStyle = hexA('#FFFFFF', 0.9 * (1 - q / 1.6)); ctx.lineWidth = 3 * (1 - q / 1.6) + 0.5;
        circle(c.x, c.y, r + q * 70); ctx.stroke();
      }
    }
    const f = L.narrow ? 12 : Math.max(12, L.font);
    text('Claude Code · 总调度', c.x, c.y + r + halo + f + 2, f, '#FFFFFF', 'center', 700);
    text('上下文 ' + C.fmtTokens(tokens) + ' token', c.x, c.y + r + halo + f * 2 + 6, Math.max(11, f - 1), hexA(gold, 0.95), 'center', 600, MONO);
  }

  // A comet: bright head, fading tail along its path, optional label.
  function comet(path, p, color, label, size) {
    const s0 = size || 3;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = color;
    for (let k = 16; k >= 1; k--) {
      const q = along(path, Math.max(0, ease(p) - k * 0.012)), s = s0 * (1 - k / 18);
      ctx.globalAlpha = 0.6 * (1 - k / 17); ctx.fillRect(q.x - s, q.y - s, 2 * s, 2 * s);
    }
    ctx.globalAlpha = 1;
    const { x, y } = along(path, ease(p));
    const g = ctx.createRadialGradient(x, y, 0, x, y, s0 * 4);
    g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.3, hexA(color, 0.95)); g.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = g; circle(x, y, s0 * 4); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    if (label) {
      ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = 10;
      text(label, x + 12, y - 10, Math.max(12, L.font), '#FFFFFF', 'left', 700, MONO);
      ctx.restore();
    }
  }

  function drawPackets(states) {
    states.forEach((s, i) => {
      const a = model.agents[i];
      if (s.phase === 'dispatching') comet(ccPath(i), s.p, TH.cc, null, 2.2);
      else if (s.phase === 'returning') {
        const path = ccPath(i);
        comet({ a: path.b, b: path.a, c: path.c }, s.p, colorOf(a), C.fmtInt(a.handbackChars) + ' 字', 3.2);
      }
    });
    const task = model.task;
    const qt = task ? C.since(clock, t, task.t) : -1;
    if (qt >= 0 && qt < C.FX.task) comet(linkPath(L.author, L.cc, -0.2), qt / C.FX.task, TH.author, '任务', 3.4);
    const rep = model.reply;
    const qr = rep ? C.since(clock, t, rep.t) : -1;
    if (qr >= 0 && qr < C.FX.reply) comet(linkPath(L.cc, L.author, -0.2), qr / C.FX.reply, TH.cc, C.fmtInt(rep.chars) + ' 字', 3.4);
  }

  // End view: every subagent's peak gathered into one galaxy, next to the star on the same ruler.
  function drawEnding(k) {
    const b = L.endBig, c = L.endCc, w = spin();
    ctx.globalAlpha = k;
    galaxy(97, b.x, b.y, b.r, TH.endGalaxy, 0.9, w * 0.4, 0, 1100);
    ctx.setLineDash([3, 6]); ctx.strokeStyle = hexA(TH.glint, 0.7); ctx.lineWidth = 1.2; circle(b.x, b.y, b.r); ctx.stroke(); ctx.setLineDash([]);
    const f = Math.max(12, L.font);
    ctx.save(); ctx.shadowColor = '#000'; ctx.shadowBlur = 12;
    text(model.nSub + ' 个子 agent 的上下文峰值加起来', b.x, b.y - f * 0.6, f, '#FFFFFF', 'center', 700);
    ctx.shadowColor = TH.endGalaxy; ctx.shadowBlur = 18;
    text(C.fmtTokens(model.sumPeak) + ' token', b.x, b.y + f * 1.6, Math.round(f * 2), '#FFFFFF', 'center', 800, MONO);
    ctx.restore();
    const g = ctx.createRadialGradient(c.x - c.r * 0.25, c.y - c.r * 0.25, c.r * 0.05, c.x, c.y, c.r);
    g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.35, hexA('#FFEDB5', 0.97)); g.addColorStop(0.8, hexA(TH.cc, 0.85)); g.addColorStop(1, hexA(TH.ccEdge, 0.75));
    ctx.save(); ctx.shadowColor = TH.cc; ctx.shadowBlur = 30; ctx.fillStyle = g; circle(c.x, c.y, c.r); ctx.fill(); ctx.restore();
    text('总调度自己', c.x, c.y + c.r + f + 6, f, '#FFFFFF', 'center', 700);
    text(C.fmtTokens(model.mainMax) + ' token', c.x, c.y + c.r + f * 2 + 10, f, TH.cc, 'center', 700, MONO);
    text('（同一把尺：面积对应 token 数）', b.x, b.y + b.r + f + 6, Math.max(11, f - 2), TH.dim);
    ctx.globalAlpha = 1;
  }

  function drawTimeline() {
    const tl = L.timeline, x = (v) => tl.x0 + (tl.x1 - tl.x0) * (v / endT);
    ctx.lineWidth = 2;
    ctx.strokeStyle = hexA(TH.orbit, 0.16); ctx.beginPath(); ctx.moveTo(tl.x0, tl.y); ctx.lineTo(tl.x1, tl.y); ctx.stroke();
    ctx.save(); ctx.shadowColor = TH.cc; ctx.shadowBlur = 10;
    ctx.strokeStyle = hexA(TH.cc, 0.95); ctx.beginPath(); ctx.moveTo(tl.x0, tl.y); ctx.lineTo(x(t), tl.y); ctx.stroke(); ctx.restore();
    ctx.lineWidth = 1;
    for (const a of model.agents) {
      ctx.strokeStyle = hexA(colorOf(a), 0.85);
      ctx.beginPath(); ctx.moveTo(x(a.dispatchT), tl.y - 4); ctx.lineTo(x(a.dispatchT), tl.y - 10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x(a.handbackT), tl.y + 4); ctx.lineTo(x(a.handbackT), tl.y + 10); ctx.stroke();
    }
    if (model.task) { ctx.fillStyle = TH.author; circle(x(model.task.t), tl.y, 3.5); ctx.fill(); }
    if (model.reply) { ctx.fillStyle = TH.cc; circle(x(model.reply.t), tl.y, 3.5); ctx.fill(); }
    const hx = x(t);
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(hx, tl.y, 0, hx, tl.y, dragging ? 14 : 11);
    g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.35, hexA(TH.cc, 0.8)); g.addColorStop(1, hexA(TH.cc, 0));
    ctx.fillStyle = g; circle(hx, tl.y, dragging ? 14 : 11); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  // Small fixed readouts in the stage corners (skipped on narrow screens, where the caption needs the width).
  function drawCorners() {
    if (L.W < 560) return;
    const y = L.stage.y + L.stage.h - 10;
    text('DISPATCH REPLAY // ' + slug.toUpperCase(), 16, y, 10, hexA(TH.orbit, 0.5), 'left', 600, MONO);
    text('T+' + C.fmtClock(Math.min(t, model.duration)) + ' / ' + C.fmtClock(model.duration), L.W - 16, y, 10, hexA(TH.orbit, 0.5), 'right', 600, MONO);
  }

  // ---- DOM overlays -----------------------------------------------------------------------------
  let lastCaption = null;
  // Captions: escape, then light up the numbers (her rule: the point of a line should be big and bright).
  function highlight(s) {
    const esc = s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
    return esc.replace(/(\d[\d,.×]*(?:\s*万)?(?:\s*(?:token|字|分钟|小时|秒|位|个|次|篇))?)/g, '<em>$1</em>');
  }
  function updateDom(states, ending) {
    const n = C.counters(model, Math.min(t, model.duration));
    $('clock').textContent = (playing && clock.isSlow(t) ? '慢放 · ' : '') + C.fmtClock(Math.min(t, model.duration)) + ' / ' + C.fmtClock(model.duration);
    $('c-running').textContent = n.running;
    $('c-sent').textContent = n.dispatched + '/' + n.total;
    $('c-back').textContent = n.returned + '/' + n.total;
    $('c-live').textContent = C.fmtTokens(n.liveTokens);
    $('c-report').textContent = C.fmtInt(n.reportChars);
    $('c-tools').textContent = C.fmtInt(n.toolCalls);
    const big = $('big');
    big.hidden = !L.readout || ending > 0.3;
    if (!big.hidden) {
      $('big-v').textContent = C.fmtTokensTight(n.liveTokens).replace('万', '');
      $('big-u').textContent = n.liveTokens >= 10000 ? '万 token' : 'token';
      $('big-s').textContent = '在跑 ' + n.running + ' · 已交回 ' + n.returned + '/' + n.total;
    }

    const cap = C.caption(model, t, clock);
    const el = $('caption');
    const key = cap ? cap.index : null;
    if (key !== lastCaption) { el.innerHTML = cap ? '<span>' + highlight(cap.text) + '</span>' : ''; lastCaption = key; }
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
      cells: L.cells.map((c, i) => ({ x: c.cx, y: c.cy, kind: model.agents[i].kind, color: colorOf(model.agents[i]) })),
      timeline: L.timeline, play: clock.play(t),
      orbit: !L.orbits.grid, readout: L.readout, readoutShown: !$('big').hidden,
      dpr,
      summaryShown: !$('summary').hidden,
    };
  }

  load();
})();
