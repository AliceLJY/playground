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

  const GROUP = {
    web: { label: '网页', color: '#4DD0E1' },
    file: { label: '文件', color: '#A5D6A7' },
    write: { label: '写入', color: '#FFB74D' },
    shell: { label: '命令', color: '#B0BEC5' },
    mcp: { label: '外部工具', color: '#CE93D8' },
    other: { label: '其他', color: '#90A4AE' },
  };
  const FAMILY = {
    opus: { label: 'Opus', color: '#FF8A4C' },
    sonnet: { label: 'Sonnet', color: '#9B8CFF' },
    haiku: { label: 'Haiku', color: '#5FD39A' },
    fable: { label: 'Fable', color: '#F06292' },
  };
  const VENDOR = {
    kimi: { label: 'Kimi', color: '#4FC3F7' },
    agy: { label: 'Gemini', color: '#7AB8FF' },
    grok: { label: 'Grok', color: '#D9D9D9' },
    gpt: { label: 'GPT', color: '#19C37D' },
    codex: { label: 'Codex', color: '#9BE15D' },
  };
  const COLOR = { author: '#FF8FB1', cc: '#F5B84B', text: '#E8ECF8', dim: '#8A93B2', unknown: '#90A4AE' };

  function agentColor(a) {
    if (a.kind === 'external') return (VENDOR[a.vendor] || {}).color || COLOR.unknown;
    return (FAMILY[a.family] || {}).color || COLOR.unknown;
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
    const mainCtx = (data.main && data.main.ctx) || [];
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
      data, agents, byId, mainCtx, mainTools, maxPeak, mainMax, sumPeak, sumReport, toolTimes,
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

  const LABEL_BLOCK = 34;   // two text lines under a bubble
  const LABEL_BLOCK_COMPACT = 18;   // short screens (phone landscape): label line only, numbers in the detail card
  const MIN_FONT = 11;
  const CC_LABELS = 40;     // two label lines under the dispatcher at the largest font (14 px)

  function rMaxFor(cw, ch, block) { return Math.min(cw * 0.42, (ch - block) * 0.48); }

  function grid(n, area, block, minCell) {
    let best = null;
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      const cw = area.w / cols, ch = area.h / rows;
      const r = rMaxFor(cw, ch, block);
      const score = cw < minCell ? r - 1000 : r;     // keep room for a label line
      if (!best || score > best.score) best = { cols, rows, cw, ch, r, score };
    }
    return best;
  }

  // opts.picker: the dataset picker is shown. On a narrow portrait screen it pushes the controls onto a second header row.
  function layout(model, W, H, opts) {
    const portrait = H > W;
    const compact = !portrait && H < 520;
    const tall = portrait && !!(opts && opts.picker) && W < 560;
    const labelBlock = compact ? LABEL_BLOCK_COMPACT : LABEL_BLOCK;
    const header = compact ? 44 : tall ? 92 : portrait ? 56 : 60;
    const footer = compact ? 74 : portrait ? 108 : 96;
    const captionH = compact ? 40 : portrait ? 60 : 50;
    const stage = { x: 0, y: header, w: W, h: H - header - footer };
    const live = { y: stage.y, h: stage.h - captionH };   // part of the stage not covered by the caption band
    const ccRatio = Math.sqrt(Math.max(model.mainMax, 1) / model.maxPeak);
    let author, cc, gridArea, ccRoom;
    if (!portrait) {
      const midY = live.y + live.h / 2;
      author = { x: W * 0.075, y: midY, r: clamp(Math.min(W, H) * 0.028, 14, 26) };
      cc = { x: W * 0.245, y: midY };
      gridArea = { x: W * 0.40, y: live.y + 8, w: W * 0.58, h: live.h - 16 };
      ccRoom = Math.min(live.h / 2 - CC_LABELS - 4, gridArea.x - cc.x - 12, cc.x - (author.x + author.r) - 14);
    } else {
      const topH = clamp(live.h * 0.2, 112, 200);
      const midY = live.y + (topH - CC_LABELS) / 2;    // circle plus its two label lines centred in the top band
      author = { x: W * 0.14, y: midY, r: clamp(W * 0.045, 14, 24) };
      cc = { x: W * 0.6, y: midY };
      gridArea = { x: 10, y: live.y + topH, w: W - 20, h: live.h - topH - 6 };
      ccRoom = Math.min((topH - CC_LABELS) / 2 - 4, W - cc.x - 12, cc.x - (author.x + author.r) - 40);
    }
    const g = grid(model.agents.length, gridArea, labelBlock, compact ? 60 : 88);
    const rUnit = Math.max(4, Math.min(g.r, ccRoom / ccRatio));
    const font = clamp(Math.min(g.cw / 8.5, rUnit * 0.6 + 4), MIN_FONT, 14);
    const cells = model.agents.map((a, i) => {
      const col = i % g.cols, row = Math.floor(i / g.cols);
      const x = gridArea.x + col * g.cw, y = gridArea.y + row * g.ch;
      const cy = y + (g.ch - labelBlock) / 2;
      return { x, y, w: g.cw, h: g.ch, cx: x + g.cw / 2, cy, labelY: cy + rUnit + 6 };
    });
    // End view: the summed peaks and the dispatcher on one shared scale that fits the grid area.
    const sumRatio = Math.sqrt(Math.max(model.sumPeak, 1) / model.maxPeak);
    const endUnit = Math.min(rUnit, (Math.min(gridArea.h, gridArea.w * 0.62) / 2 - 20) / sumRatio);
    const endBig = { x: gridArea.x + gridArea.w * 0.36, y: gridArea.y + gridArea.h / 2, r: endUnit * sumRatio };
    const endCc = { x: gridArea.x + gridArea.w * 0.84, y: endBig.y, r: endUnit * ccRatio };
    return {
      W, H, portrait, compact, tall, labelBlock, header, footer, captionH, stage, gridArea, author, cc, cells, rUnit, font,
      cols: g.cols, rows: g.rows, ccMaxR: rUnit * ccRatio, endUnit, endBig, endCc,
      timeline: { x0: 16, x1: W - 16, y: H - (compact ? 22 : portrait ? 36 : 30) },
    };
  }

  function radiusFor(tokens, rUnit, maxPeak) {
    return rUnit * Math.sqrt(Math.max(tokens, 0) / maxPeak);
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  const api = {
    FX, PLAYBACK, DEFAULT_PLAYBACK, MAX_SPARKS, PHASES, GROUP, FAMILY, VENDOR, COLOR, LABEL_BLOCK, MIN_FONT, MIN_HOLD,
    prepare, makeClock, since, holdFor, agentState, counters, sparks, caption, fillCaption, layout, radiusFor,
    mainTokensAt, interp, agentColor, agentBadge, fmtTokens, fmtTokensTight, fmtInt, fmtClock, clamp, hash,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ReplayCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
