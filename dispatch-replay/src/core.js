// Pure logic for 派活回放: timeline state, counters, captions and layout. No DOM, so Node tests can require it.
(function (root) {
  'use strict';

  // Effect lengths in playback seconds (SPEC §6). Real time and playback time are linked by a clock (makeClock).
  const FX = { dispatch: 0.9, collapse: 0.6, fly: 0.9, spark: 0.7, task: 1.0, reply: 1.2, pulse: 0.5, tail: 1.6 };
  const PLAYBACK = [90, 180];
  const DEFAULT_PLAYBACK = 90;
  const MAX_SPARKS = 160;
  const READ_RATE = 8;               // characters a visitor reads per second (SPEC §6)
  const MIN_HOLD = 2.5;              // playback seconds every caption gets at least
  const MAX_HOLD = 8;                // so a caption is at most 64 characters (SPEC §6)
  const AFTER_HOLD = 3;              // a caption may linger this long after its slow-motion window
  const SLOW = 0.12;                 // slow-motion speed as a share of the plain average speed
  const PHASES = ['idle', 'dispatching', 'working', 'collapsing', 'returning', 'done'];

  // HUD palette (SPEC §4): cold cyan family for Claude subagents, warm alert family for external AIs,
  // a gold core for the dispatcher, magenta for the human.
  const GROUP = {
    web: { label: '网页', color: '#00E5FF' },
    file: { label: '文件', color: '#7CFFCB' },
    write: { label: '写入', color: '#FFC94A' },
    shell: { label: '命令', color: '#9FB3C8' },
    mcp: { label: '外部工具', color: '#C792EA' },
    other: { label: '其他', color: '#6E8796' },
  };
  const FAMILY = {
    opus: { label: 'Opus', color: '#00E5FF' },
    sonnet: { label: 'Sonnet', color: '#8C9EFF' },
    haiku: { label: 'Haiku', color: '#3DFFB0' },
    fable: { label: 'Fable', color: '#E040FB' },
  };
  const VENDOR = {
    codex: { label: 'Codex', color: '#FF6A00' },
    kimi: { label: 'Kimi', color: '#FFB020' },
    agy: { label: 'Gemini', color: '#FF8A65' },
    grok: { label: 'Grok', color: '#FFE0B2' },
    gpt: { label: 'GPT', color: '#FF4D4D' },
  };
  const COLOR = { author: '#FF4D9D', cc: '#FFC94A', hud: '#00E5FF', text: '#D8F6FF', dim: '#5F8796', unknown: '#6E8796' };
  const pick = (table) => Object.fromEntries(Object.entries(table).map(([k, v]) => [k, v.color]));

  // Each dataset picks a palette in data/index.js (SPEC §4). deepspace: cold nebula, cyan and violet galaxies, orange
  // black holes. cinnabar: the vermilion, ink black, dark gold and rice white of the 英歌 film, with jade black holes.
  const THEMES = {
    deepspace: {
      family: pick(FAMILY), vendor: pick(VENDOR), group: pick(GROUP),
      author: COLOR.author, cc: COLOR.cc, ccEdge: '#FF7A2E', ink: '#01030A', star: '#DCEBFF',
      nebula: [[0.15, 0.25, '#1C4E9C', 0.5, 0.55], [0.85, 0.75, '#6A1F8C', 0.45, 0.55], [0.5, 0.5, '#0C5C70', 0.3, 0.4], [0.25, 0.9, '#3E1257', 0.35, 0.45], [0.9, 0.15, '#103A6B', 0.35, 0.4]],
      orbit: '#7FD8FF', glint: '#BFF3FF', idle: '#9FC6D6', label: '#F2FAFF', dim: '#5F8796', endGalaxy: '#7FD8FF',
      holeDust: '#FFD2A1', photon: '#FFE6C2',
    },
    cinnabar: {
      family: { opus: '#FFE2A8', sonnet: '#FF4B3A', haiku: '#FF9E7A', fable: '#FF6FAE' },
      vendor: { codex: '#2FE6B8', kimi: '#7FE0FF', agy: '#9AD7FF', grok: '#E8F0FF', gpt: '#3BE87A' },
      group: { web: '#FFD27A', file: '#FFE9C7', write: '#FF8A5C', shell: '#C9B49A', mcp: '#2FE6B8', other: '#9C8670' },
      author: '#FFF1D6', cc: '#FFC94A', ccEdge: '#E0381E', ink: '#060102', star: '#FFE8D0',
      nebula: [[0.15, 0.25, '#8C1022', 0.55, 0.55], [0.85, 0.75, '#7A3A08', 0.45, 0.55], [0.5, 0.5, '#4A0A1E', 0.35, 0.4], [0.25, 0.9, '#5C1A06', 0.35, 0.45], [0.9, 0.15, '#6B0F2A', 0.35, 0.4]],
      orbit: '#FFC94A', glint: '#FFE6A8', idle: '#C9A27A', label: '#FFF4E6', dim: '#8A6A55', endGalaxy: '#FF8A55',
      holeDust: '#B8FFEA', photon: '#E6FFF8',
    },
  };

  function agentColor(a, theme) {
    const th = theme || THEMES.deepspace;
    if (a.kind === 'external') return th.vendor[a.vendor] || COLOR.unknown;
    return th.family[a.family] || COLOR.unknown;
  }
  function agentBadge(a) {
    if (a.kind === 'external') return (VENDOR[a.vendor] || {}).label || a.vendor || '外部';
    return (FAMILY[a.family] || {}).label || a.family || '';
  }

  // Index of the last sample with time <= t, or -1.
  function lastAtOrBefore(series, t) {
    let lo = 0, hi = series.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (series[mid][0] <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  }

  // Linear interpolation over [[t, value], ...]; 0 before the first sample, last value after the end.
  function interp(series, t) {
    if (!series.length) return 0;
    const i = lastAtOrBefore(series, t);
    if (i < 0) return 0;
    if (i === series.length - 1) return series[i][1];
    const a = series[i], b = series[i + 1];
    const f = b[0] > a[0] ? (t - a[0]) / (b[0] - a[0]) : 1;
    return a[1] + (b[1] - a[1]) * f;
  }

  function prepare(data) {
    const agents = data.agents
      .map((a, i) => Object.assign({}, a, { order: i }))
      .sort((x, y) => x.dispatchT - y.dispatchT || x.order - y.order)
      .map((a, index) => {
        const start = a.startT != null ? a.startT : a.dispatchT;
        const ctxS = a.ctx && a.ctx.length ? [[start, 0]].concat(a.ctx) : [];
        const tools = (a.tools || []).slice().sort((p, q) => p[0] - q[0]);
        return Object.assign(a, { index, ctxS, tools, hasBubble: ctxS.length > 0 });
      });
    const byId = {};
    agents.forEach((a) => { byId[a.id] = a; });
    // The dispatcher's context only shrinks by compaction, which is sudden: hold the old value until the sample
    // after the drop instead of shrinking it linearly over the gap, and remember when it happened.
    const rawCtx = (data.main && data.main.ctx) || [], mainCtx = [], drops = [];
    rawCtx.forEach((s, i) => {
      const prev = rawCtx[i - 1];
      if (prev && s[1] < prev[1] * 0.6) { mainCtx.push([Math.max(prev[0], s[0] - 0.5), prev[1]]); drops.push(s[0]); }
      mainCtx.push(s);
    });
    const mainTools = ((data.main && data.main.tools) || []).slice().sort((p, q) => p[0] - q[0]);
    const peaks = agents.filter((a) => a.hasBubble).map((a) => a.peakTokens || 0);
    const maxPeak = Math.max(1, ...peaks);
    const mainMax = Math.max(0, ...mainCtx.map((s) => s[1]));
    const sumPeak = peaks.reduce((s, v) => s + v, 0);
    const sumReport = agents.reduce((s, a) => s + (a.handbackChars || 0), 0);
    const subs = agents.filter((a) => a.kind !== 'external');
    const nExt = agents.length - subs.length;
    const subReport = subs.reduce((s, a) => s + (a.handbackChars || 0), 0);
    const subTools = subs.reduce((s, a) => s + a.tools.length, 0);
    const toolTimes = agents.reduce((acc, a) => acc.concat(a.tools.map((x) => x[0])), mainTools.map((x) => x[0]))
      .sort((p, q) => p - q);

    // Concurrency: running between dispatch and hand-back.
    const ev = [];
    agents.forEach((a) => { ev.push([a.dispatchT, 1]); ev.push([a.handbackT, -1]); });
    ev.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    let run = 0, maxConcurrent = 0;
    const segs = ev.map(([t, k], i) => {
      run += k;
      maxConcurrent = Math.max(maxConcurrent, run);
      return [t, i + 1 < ev.length ? ev[i + 1][0] : t, run];
    });
    // Fixed hero view: the middle of the longest stretch with the most agents running at once.
    const best = segs.filter((s) => s[2] === maxConcurrent).sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]))[0];
    const heroT = best ? (best[0] + best[1]) / 2 : data.duration / 2;

    return {
      data, agents, byId, mainCtx, mainTools, drops, maxPeak, mainMax, sumPeak, sumReport, toolTimes,
      nSub: subs.length, nExt, subReport, subTools,
      maxConcurrent, heroT, duration: data.duration, task: data.task, reply: data.reply,
      captions: (data.captions || []).slice().sort((p, q) => p[0] - q[0]),
    };
  }

  function holdFor(text) { return Math.max(MIN_HOLD, Math.min(MAX_HOLD, text.length / READ_RATE)); }

  // The clock maps real seconds t to playback seconds and back. Each caption opens a slow-motion window long
  // enough to read it (holdFor); the rest of the run is fast-forwarded so the whole replay lasts about P seconds.
  function makeClock(model, P) {
    P = P || DEFAULT_PLAYBACK;
    const D = model.duration, base = D / P;
    const caps = model.captions;
    const holds = [];
    caps.forEach(([tc, raw], i) => {
      const H = holdFor(fillCaption(model, raw));
      const gap = Math.min(i + 1 < caps.length ? caps[i + 1][0] : D, D) - tc;
      if (gap <= 0) return;
      const v = Math.min(base * SLOW, gap / H);          // squeeze harder when the next caption is close
      holds.push({ t0: tc, t1: tc + H * v, v, H });
    });
    const holdReal = holds.reduce((s, h) => s + (h.t1 - h.t0), 0);
    const holdPlay = holds.reduce((s, h) => s + h.H, 0);
    const vFast = Math.max(base * SLOW, (D - holdReal) / Math.max(P - holdPlay, P * 0.25));
    const segs = [];
    let cur = 0;
    for (const h of holds) {
      if (h.t0 > cur) segs.push({ t0: cur, t1: h.t0, v: vFast, slow: false });
      segs.push({ t0: h.t0, t1: h.t1, v: h.v, slow: true });
      cur = h.t1;
    }
    if (cur < D) segs.push({ t0: cur, t1: D, v: vFast, slow: false });
    let p = 0;
    for (const s of segs) { s.p0 = p; p += (s.t1 - s.t0) / s.v; s.p1 = p; }
    const pD = p;
    const find = (key, x) => { let lo = 0, hi = segs.length - 1, a = 0; while (lo <= hi) { const m = (lo + hi) >> 1; if (segs[m][key] <= x) { a = m; lo = m + 1; } else hi = m - 1; } return segs[a]; };
    const play = (t) => {
      if (t >= D) return pD + (t - D) / vFast;
      if (t <= 0) return t / vFast;
      const s = find('t0', t);
      return s.p0 + (t - s.t0) / s.v;
    };
    const real = (q) => {
      if (q >= pD) return D + (q - pD) * vFast;
      if (q <= 0) return q * vFast;
      const s = find('p0', q);
      return s.t0 + (q - s.p0) * s.v;
    };
    const isSlow = (t) => t > 0 && t < D && find('t0', t).slow;
    const clock = { P, vFast, segs, holds, play, real, isSlow };
    clock.end = endReal(model, clock);
    clock.length = play(clock.end);
    return clock;
  }

  // Where the replay stops (real seconds): after the reply has landed, with the recorded window as the floor.
  function endReal(model, clock) {
    let p = clock.play(model.duration);
    if (model.reply) p = Math.max(p, clock.play(model.reply.t) + FX.reply + FX.tail);
    for (const a of model.agents) p = Math.max(p, clock.play(a.handbackT) + FX.collapse + FX.fly + FX.tail);
    return clock.real(p);
  }

  // Effect progress in playback seconds since a real-time event.
  function since(clock, t, te) { return clock.play(t) - clock.play(te); }

  function agentState(a, t, clock) {
    if (t < a.dispatchT) return { phase: 'idle', p: 0, tokens: 0 };
    const tokens = a.hasBubble ? interp(a.ctxS, Math.min(t, a.handbackT)) : null;
    if (t < a.handbackT) {
      const p = since(clock, t, a.dispatchT) / FX.dispatch;
      return { phase: p < 1 ? 'dispatching' : 'working', p: Math.min(p, 1), tokens };
    }
    const q = since(clock, t, a.handbackT);
    if (q < FX.collapse) return { phase: 'collapsing', p: q / FX.collapse, tokens };
    if (q < FX.collapse + FX.fly) return { phase: 'returning', p: (q - FX.collapse) / FX.fly, tokens };
    return { phase: 'done', p: 1, tokens, since: q - FX.collapse - FX.fly };
  }

  function mainTokensAt(model, t) {
    const s = model.mainCtx;
    if (!s.length) return 0;
    if (t < s[0][0]) return s[0][1];
    return interp(s, t);
  }

  function counters(model, t) {
    let dispatched = 0, returned = 0, running = 0, liveTokens = 0, reportChars = 0;
    for (const a of model.agents) {
      if (t >= a.dispatchT) dispatched++;
      if (t >= a.handbackT) { returned++; reportChars += a.handbackChars || 0; }
      else if (t >= a.dispatchT) { running++; if (a.hasBubble) liveTokens += interp(a.ctxS, t); }
    }
    const toolCalls = lastAtOrBefore(model.toolTimes.map((x) => [x]), t) + 1;
    return { dispatched, returned, running, total: model.agents.length, liveTokens, reportChars, toolCalls, mainTokens: mainTokensAt(model, t) };
  }

  // Tool sparks alive at t. owner -1 is the dispatcher itself.
  function sparks(model, t, clock) {
    const out = [], pt = clock.play(t), tMin = clock.real(pt - FX.spark);
    const take = (tools, owner) => {
      const hi = lastAtOrBefore(tools, t);
      for (let i = hi; i >= 0 && tools[i][0] > tMin; i--) {
        out.push({ owner, group: tools[i][1], age: (pt - clock.play(tools[i][0])) / FX.spark, seed: hash(owner * 7919 + i) });
      }
    };
    take(model.mainTools, -1);
    for (const a of model.agents) if (t >= a.dispatchT && t < a.handbackT) take(a.tools, a.index);
    if (out.length > MAX_SPARKS) out.sort((p, q) => p.age - q.age).length = MAX_SPARKS;
    return out;
  }

  function hash(n) {
    let x = (n | 0) ^ 0x9e3779b9;
    x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
    x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  }

  function fmtTokens(n) {
    if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + ' 万';
    return String(Math.round(n));
  }
  function fmtTokensTight(n) { return fmtTokens(n).replace(' ', ''); }
  function fmtInt(n) { return Math.round(n).toLocaleString('en-US'); }
  function fmtClock(sec) {
    const s = Math.max(0, Math.floor(sec));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function fillCaption(model, text) {
    return text.replace(/\{(\w+)(?::([\w-]+))?\}/g, (whole, key, id) => {
      const a = id ? model.byId[id] : null;
      if (key === 'peak' && a) return fmtTokens(a.peakTokens);
      if (key === 'report' && a) return fmtInt(a.handbackChars) + ' 字';
      if (key === 'reply' && model.reply) return fmtInt(model.reply.chars) + ' 字';
      if (key === 'sumPeak') return fmtTokens(model.sumPeak);
      if (key === 'sumReport') return fmtInt(model.sumReport) + ' 字';
      if (key === 'n') return String(model.agents.length);
      if (key === 'nSub') return String(model.nSub);
      if (key === 'nExt') return String(model.nExt);
      if (key === 'mainPeak') return fmtTokens(model.mainMax);
      return whole;
    });
  }

  // The caption on screen at real time t: from its own time until the next caption or until it has lingered
  // AFTER_HOLD playback seconds past its reading time. start/end are real seconds.
  function caption(model, t, clock) {
    const list = model.captions;
    const i = lastAtOrBefore(list, t);
    if (i < 0) return null;
    const start = list[i][0], text = fillCaption(model, list[i][1]);
    const next = i + 1 < list.length ? list[i + 1][0] : Infinity;
    const end = Math.min(next, clock.real(clock.play(start) + holdFor(text) + AFTER_HOLD));
    if (t >= end) return null;
    return { text, start, end, index: i, hold: holdFor(text) };
  }

  // ---- layout -----------------------------------------------------------------------------------
  // Orbit layout (SPEC §5): the dispatcher sits in the middle of the stage and the executors sit on one or two
  // elliptical orbits around it, in dispatch order, clockwise from the top. The author's beacon takes the top-left
  // corner and the big readout the top-right. A small search over orbit sizes and ring splits keeps the largest
  // executor radius at which nothing overlaps.

  const LABEL_BLOCK = 34;   // two text lines under an executor
  const LABEL_BLOCK_COMPACT = 18;   // short screens: label line only, numbers in the detail card
  const MIN_FONT = 11;
  const CC_LABELS = 40;     // two label lines under the dispatcher at the largest font (14 px)
  // width of 「Claude Code · 总调度」 / 「上下文 78.1 万 token」: 14 px type, or 12 px on phones held upright
  const CC_LABEL_W = 176, CC_LABEL_W_NARROW = 132;
  const CC_HALO = 14;       // corona and landing pulses drawn outside the dispatcher's circle
  const GRID_PENALTY = 1.67;
  const FAN_PENALTY = 1.2;   // a full orbit reads best; fans only when they buy a clearly larger radius
  const MIN_R = 14;         // smallest executor radius worth showing (SPEC §9.6); any layout reaching it beats one that does not
  // Orbits that reach MIN_R always beat rows, so the galaxy form holds wherever it fits; rows are the last resort.
  function scoreOf(r, weight) { return (r >= MIN_R ? 1000 : 0) + (r >= MIN_R && weight < GRID_PENALTY ? 500 : 0) + r / weight; }

  function overlaps(a, b) { return a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01 && a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01; }
  function inside(a, b) { return a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.w <= b.x + b.w + 0.5 && a.y + a.h <= b.y + b.h + 0.5; }

  // Slots on k concentric ellipse arcs around the dispatcher (scales `rings`) between angles a0 and a0 + span; each
  // ring holds a share of the executors in proportion to its length, and all slots are sorted by angle so the dispatch
  // order sweeps clockwise like a radar. A full circle puts the dispatcher in the middle; a fan puts it at an edge.
  function slotsFor(n, c, ax, ay, rings, a0, span) {
    const full = span >= 2 * Math.PI - 1e-6;
    const total = rings.reduce((a, b) => a + b, 0);
    const counts = rings.map((k) => Math.max(1, Math.round((n * k) / total)));
    let diff = n - counts.reduce((a, b) => a + b, 0);
    for (let j = 0; diff !== 0; j = (j + 1) % rings.length) { if (diff > 0) { counts[j]++; diff--; } else if (counts[j] > 1) { counts[j]--; diff++; } }
    const all = [];
    rings.forEach((k, j) => {
      for (let m = 0; m < counts[j]; m++) {
        const f = full ? (m + j / rings.length) / counts[j] : (m + 0.5) / counts[j];
        const th = a0 + span * f;
        all.push({ x: c.x + Math.cos(th) * ax * k, y: c.y + Math.sin(th) * ay * k, ring: j, f });
      }
    });
    return all.sort((a, b) => a.f - b.f || a.ring - b.ring);
  }

  // label width: generous where there is room, tighter on phones held upright (labels get an ellipsis there)
  function cellBox(s, r, block, tight) {
    const lw = clamp(2 * r + (tight ? 24 : 40), tight ? 56 : 60, 132), half = Math.max(r, lw / 2);
    return { x: s.x - half, y: s.y - r, w: 2 * half, h: 2 * r + 4 + block, lw };
  }

  function layout(model, W, H, opts) {
    const portrait = H > W;
    const compact = !portrait && H < 520;
    const tall = portrait && !!(opts && opts.picker) && W < 560;
    // short or phone-width screens (phone landscape, an upright phone with its browser bars, any phone-width screen):
    // label line only, the numbers are in the detail card
    const oneLine = compact || (portrait && (H < 740 || W < 430));
    const labelBlock = oneLine ? LABEL_BLOCK_COMPACT : LABEL_BLOCK;
    const narrow = portrait && W < 560;   // phones held upright: no subtitle, one-line counters
    const header = compact ? 44 : tall ? 74 : portrait ? 56 : 60;
    const footer = compact ? 74 : narrow ? 86 : portrait ? 108 : 96;
    const captionH = compact ? 40 : portrait ? 64 : 56;
    const stage = { x: 0, y: header, w: W, h: H - header - footer };
    const live = { x: 0, y: stage.y, w: W, h: stage.h - captionH };   // part of the stage not covered by the caption band
    const liveBox = { x: 4, y: live.y + 2, w: W - 8, h: live.h - 4 };
    const n = model.agents.length;
    const ccLabelW = narrow ? CC_LABEL_W_NARROW : CC_LABEL_W;
    const ccRatio = Math.sqrt(Math.max(model.mainMax, 1) / model.maxPeak);
    const ar = clamp(Math.min(W, H) * 0.02, 9, 16);
    const author = { x: 16 + ar, y: live.y + 12 + ar, r: ar };
    const authorBox = { x: author.x - ar - 4, y: author.y - ar - 4, w: 2 * ar + 8 + 28, h: 2 * ar + 26 };
    // big readout in the top-right corner; short landscape screens skip it (the counter row says the same)
    const rw = portrait ? 150 : 200, rh = portrait ? 46 : 76;
    const readout = compact ? null : { x: W - rw - 10, y: live.y + 6, w: rw, h: rh };
    const midY = live.y + live.h / 2 - (oneLine ? 6 : 10);
    // where the dispatcher sits and which way the executors spread: all round, fanned right, or fanned down
    const anchors = [
      { c: { x: W / 2, y: midY }, a0: -Math.PI / 2, span: 2 * Math.PI, ax: W / 2 - 20, ay: live.h / 2 - 10, weight: 1 },
      { c: { x: Math.max(W * 0.12, 70), y: midY }, a0: -Math.PI * 0.44, span: Math.PI * 0.88, ax: W - Math.max(W * 0.12, 70) - 30, ay: live.h / 2 - 10, weight: FAN_PENALTY },
      { c: { x: W / 2, y: live.y + Math.min(live.h * 0.16, 110) }, a0: Math.PI * 0.06, span: Math.PI * 0.88, ax: W / 2 - 16, ay: live.h - Math.min(live.h * 0.16, 110) - 30, weight: FAN_PENALTY },
    ];

    let best = null;
    const rCap = Math.min(W, live.h) * 0.11;
    const steps = [1, 0.94, 0.88, 0.82, 0.76, 0.7, 0.64, 0.58];
    const ringSets = [[1], [1, 0.5], [1, 0.58], [1, 0.66], [1, 0.74], [1, 0.72, 0.46], [1, 0.76, 0.52], [1, 0.68, 0.4]]
      .filter((set) => set.length <= Math.max(1, Math.ceil(n / 6)));
    // Candidate placements: orbits around the dispatcher, plus, for screens too short or narrow for orbits, a block of
    // rows beside it. Rows only win when they allow a radius GRID_PENALTY times larger, so orbits stay the norm.
    const cands = [];
    for (const an of anchors) for (const sx of steps) for (const sy of steps) for (const rings of ringSets) {
      cands.push({ an, ax: sx * an.ax, ay: sy * an.ay, rings, center: an.c, slots: slotsFor(n, an.c, sx * an.ax, sy * an.ay, rings, an.a0, an.span), weight: an.weight });
    }
    // rows: the star above them (upright screens, clear of the corner boxes) or to their left
    const rowPlans = portrait
      ? [70, 92, 116].map((dy) => ({ gc: { x: W / 2, y: live.y + dy }, ga: { x: 8, y: live.y + dy + 80, w: W - 16, h: live.h - dy - 86 } }))
      : [0, 14].map((dy) => {
        const gc = { x: Math.max(W * 0.12, ccLabelW / 2 + 8), y: midY + dy };
        return { gc, ga: { x: gc.x + ccLabelW / 2 + 8, y: live.y + 6, w: W - gc.x - ccLabelW / 2 - 18, h: live.h - 12 } };
      });
    for (const { gc, ga } of rowPlans) for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols), cw = ga.w / cols, ch = ga.h / rows;
      const slots = Array.from({ length: n }, (_, i) => ({ x: ga.x + (i % cols + 0.5) * cw, y: ga.y + Math.floor(i / cols) * ch + (ch - labelBlock) / 2, ring: 0 }));
      cands.push({ an: { a0: 0, span: 0, grid: true }, ax: 0, ay: 0, rings: [], center: gc, slots, weight: GRID_PENALTY });
    }
    for (const cd of cands) {
      const { an, ax, ay, rings, center, slots } = cd;
      for (let r = rCap; r >= 6; r *= 0.92) {
        if (best && scoreOf(r, cd.weight) <= best.score) break;
        const ccR = r * ccRatio + CC_HALO, ccW = Math.max(ccR, ccLabelW / 2);
        const ccBox = { x: center.x - ccW, y: center.y - ccR, w: 2 * ccW, h: 2 * ccR + CC_LABELS };
        if (!inside(ccBox, liveBox) || overlaps(ccBox, authorBox) || (readout && overlaps(ccBox, readout))) continue;
        const boxes = slots.map((s) => cellBox(s, r, labelBlock, narrow));
        let ok = true;
        for (let i = 0; ok && i < n; i++) {
          const b = boxes[i];
          if (!inside(b, liveBox) || overlaps(b, ccBox) || overlaps(b, authorBox) || (readout && overlaps(b, readout))) ok = false;
          for (let j = i + 1; ok && j < n; j++) if (overlaps(b, boxes[j])) ok = false;
        }
        if (ok) { best = { r, score: scoreOf(r, cd.weight), ax, ay, rings, slots, boxes, center, a0: an.a0, span: an.span, grid: !!an.grid }; break; }
      }
    }
    if (!best) {   // nothing fits: fall back to one ring at the smallest radius, the tests will say so
      const an = anchors[0], slots = slotsFor(n, an.c, an.ax, an.ay, [1], an.a0, an.span);
      best = { r: 6, ax: an.ax, ay: an.ay, rings: [1], slots, boxes: slots.map((s) => cellBox(s, 6, labelBlock, narrow)), center: an.c, a0: an.a0, span: an.span };
    }
    const rUnit = best.r;
    const font = clamp(rUnit * 0.4 + 6, MIN_FONT, 14);
    const cells = best.slots.map((s, i) => {
      const b = best.boxes[i];
      return { x: b.x, y: b.y, w: b.w, h: b.h, lw: b.lw, cx: s.x, cy: s.y, ring: s.ring, labelY: s.y + rUnit + 6 };
    });
    // End view: the summed peaks and the dispatcher on one shared scale that fits the stage.
    const gridArea = { x: 16, y: live.y + 8, w: W - 32, h: live.h - 16 };
    const sumRatio = Math.sqrt(Math.max(model.sumPeak, 1) / model.maxPeak);
    const endUnit = Math.min(rUnit, (Math.min(gridArea.h - 40, gridArea.w * 0.5) / 2 - 16) / sumRatio);
    const endBig = { x: gridArea.x + gridArea.w * 0.4, y: gridArea.y + gridArea.h / 2 - 10, r: endUnit * sumRatio };
    const endCc = { x: gridArea.x + gridArea.w * 0.82, y: endBig.y, r: endUnit * ccRatio };
    return {
      W, H, portrait, compact, tall, narrow, oneLine, labelBlock, header, footer, captionH, stage, gridArea, author, authorBox, readout,
      cc: best.center, cells, rUnit, font, orbits: { ax: best.ax, ay: best.ay, rings: best.rings, a0: best.a0, span: best.span, grid: !!best.grid },
      cols: n, rows: best.rings.length, ccMaxR: rUnit * ccRatio, ccHalo: CC_HALO, ccLabelW, endUnit, endBig, endCc,
      timeline: { x0: 16, x1: W - 16, y: H - (compact ? 22 : narrow ? 28 : portrait ? 36 : 30) },
    };
  }

  function radiusFor(tokens, rUnit, maxPeak) {
    return rUnit * Math.sqrt(Math.max(tokens, 0) / maxPeak);
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  const api = {
    FX, PLAYBACK, DEFAULT_PLAYBACK, MAX_SPARKS, PHASES, GROUP, FAMILY, VENDOR, COLOR, THEMES, LABEL_BLOCK, MIN_FONT, MIN_HOLD,
    prepare, makeClock, since, holdFor, agentState, counters, sparks, caption, fillCaption, layout, radiusFor,
    mainTokensAt, interp, agentColor, agentBadge, fmtTokens, fmtTokensTight, fmtInt, fmtClock, clamp, hash,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ReplayCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
