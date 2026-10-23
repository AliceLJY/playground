// Data, timeline and layout checks for 派活回放. Every threshold comes from SPEC.md §9; time checks sample the real data.
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), vm = require('vm');
const C = require('../src/core.js');

// Load every dataset listed in data/index.js the way the page does: as plain scripts that fill window.*
function loadData() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  const dir = path.join(__dirname, '..', 'data');
  vm.runInContext(fs.readFileSync(path.join(dir, 'index.js'), 'utf8'), sandbox);
  const out = [];
  for (const { slug } of sandbox.window.REPLAY_INDEX) {
    const file = path.join(dir, slug + '.js');
    const src = fs.readFileSync(file, 'utf8');
    vm.runInContext(src, sandbox);
    out.push({ slug, src, data: sandbox.window.REPLAY_DATA[slug] });
  }
  return out;
}
const SETS = loadData();
// bare screens plus phones with the browser's own bars taken off (AGENTS.md §3): iPhone Safari, Android Chrome, landscape
const VIEWPORTS = [[1280, 720], [1920, 1080], [390, 844], [844, 390], [720, 800], [540, 960], [390, 664], [412, 700], [844, 340]];
const PHASE_RANK = Object.fromEntries(C.PHASES.map((p, i) => [p, i]));

test('every palette colours every model family, external AI and tool group; index.js names real palettes (spec §4)', () => {
  for (const [name, th] of Object.entries(C.THEMES)) {
    for (const k of Object.keys(C.FAMILY)) assert.ok(/^#[0-9A-F]{6}$/i.test(th.family[k] || ''), `spec §4: palette ${name} has no colour for ${k}`);
    for (const k of Object.keys(C.VENDOR)) assert.ok(/^#[0-9A-F]{6}$/i.test(th.vendor[k] || ''), `spec §4: palette ${name} has no colour for ${k}`);
    for (const k of Object.keys(C.GROUP)) assert.ok(/^#[0-9A-F]{6}$/i.test(th.group[k] || ''), `spec §4: palette ${name} has no colour for tool group ${k}`);
  }
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'data', 'index.js'), 'utf8'), sandbox);
  for (const d of sandbox.window.REPLAY_INDEX) assert.ok(!d.theme || C.THEMES[d.theme], `spec §4: ${d.slug} asks for palette "${d.theme}", which does not exist`);
});

test('data/index.js lists at least one dataset and every one loads', () => {
  assert.ok(SETS.length >= 1, 'spec §3: data/index.js must list a dataset');
  for (const s of SETS) assert.ok(s.data, `spec §3: data/${s.slug}.js did not define REPLAY_DATA["${s.slug}"]`);
});

for (const { slug, src, data } of SETS) {
  const model = C.prepare(data);

  test(`${slug}: schema and per-agent timing (spec §9.1)`, () => {
    assert.strictEqual(data.schema, 1, 'spec §3: schema must be 1');
    assert.ok(data.duration > 0 && data.agents.length > 0, 'spec §3: needs a duration and at least one agent');
    const ids = new Set();
    for (const a of data.agents) {
      assert.ok(!ids.has(a.id), `spec §3: agent id ${a.id} repeats`); ids.add(a.id);
      assert.ok(['subagent', 'external'].includes(a.kind), `spec §3: ${a.id} kind ${a.kind}`);
      const start = a.startT == null ? a.dispatchT : a.startT;
      assert.ok(a.dispatchT >= 0 && a.dispatchT <= start + 0.05, `spec §9.1: ${a.id} starts (${start}) before it was dispatched (${a.dispatchT})`);
      assert.ok(start <= a.handbackT && a.handbackT <= data.duration, `spec §9.1: ${a.id} hand-back ${a.handbackT} outside [start ${start}, duration ${data.duration}]`);
      assert.ok(Number.isInteger(a.handbackChars) && a.handbackChars > 0, `spec §3: ${a.id} report length must be a positive integer`);
      assert.strictEqual(a.toolCount, a.tools.length, `spec §9.1: ${a.id} toolCount ${a.toolCount} ≠ ${a.tools.length} tool events`);
      for (const [t, g] of a.tools) assert.ok(C.GROUP[g], `spec §3: ${a.id} tool group "${g}" is not one of ${Object.keys(C.GROUP)}`);
      if (a.kind === 'external') {
        // an external AI is a black box in the transcript: no context, no tool trace, only times and the read-back length
        assert.ok(C.VENDOR[a.vendor], `spec §3/§4: external ${a.id} vendor "${a.vendor}" has no colour in VENDOR`);
        assert.strictEqual(a.ctx.length + a.tools.length, 0, `spec §3: external ${a.id} must not carry context or tool samples`);
        assert.ok(a.peakTokens == null, `spec §3: external ${a.id} must not claim a token peak`);
        if (a.endT != null) assert.ok(a.endT >= a.dispatchT && a.endT <= a.handbackT, `spec §3: external ${a.id} finished at ${a.endT}, outside [dispatch ${a.dispatchT}, hand-back ${a.handbackT}]`);
      }
      if (a.kind === 'subagent') {
        assert.ok(a.ctx.length > 0, `spec §3: subagent ${a.id} needs context samples`);
        assert.strictEqual(a.peakTokens, Math.max(...a.ctx.map((x) => x[1])), `spec §9.1: ${a.id} peakTokens is not the context maximum`);
        for (let i = 1; i < a.ctx.length; i++) assert.ok(a.ctx[i][0] >= a.ctx[i - 1][0], `spec §3: ${a.id} context samples out of order`);
      }
    }
  });

  test(`${slug}: nothing private leaks into the published data file (spec §9.2)`, () => {
    for (const [pattern, what] of [[/\/Users\/|\/home\/|[A-Za-z]:\\\\/, 'a file path'], [/https?:\/\//, 'a link'], [/\.md\b/, 'a .md file name'], [/toolu_|session|sessionId/i, 'a tool or session id'], [/@[a-z0-9.-]+\.[a-z]{2,}/i, 'an email address'], [/\.(png|jpe?g|webp|txt|log|json|mp4|mov|wav|html?|ts|sh)\b/i, 'a file name']]) {
      assert.ok(!pattern.test(src), `spec §3: data/${slug}.js contains ${what}`);
    }
    for (const a of data.agents) assert.ok(a.label.length <= 20, `spec §9.2: label "${a.label}" is ${a.label.length} characters, limit 20`);
    const allowed = new Set(['schema', 'slug', 'title', 'subtitle', 'date', 'duration', 'task', 'main', 'agents', 'reply', 'captions']);
    for (const k of Object.keys(data)) assert.ok(allowed.has(k), `spec §3: unexpected top-level field "${k}"`);
    const agentKeys = new Set(['id', 'label', 'kind', 'vendor', 'askedModel', 'effort', 'dispatchT', 'promptChars', 'startT', 'endT', 'family', 'ctx', 'tools', 'handbackT', 'handbackChars', 'peakTokens', 'toolCount']);
    for (const a of data.agents) for (const k of Object.keys(a)) assert.ok(agentKeys.has(k), `spec §3: agent field "${k}" is not on the allowed list`);
  });

  test(`${slug}: the run ends with everything back, and concurrency never beats the data (spec §9.3)`, () => {
    for (const playback of C.PLAYBACK) {
      const clock = C.makeClock(model, playback), end = clock.end;
      let maxRun = 0;
      for (let t = 0; t <= end; t += 1) maxRun = Math.max(maxRun, C.counters(model, t).running);
      assert.ok(maxRun <= model.maxConcurrent, `spec §9.3: ${maxRun} running at once, data peak is ${model.maxConcurrent}`);
      const fin = C.counters(model, end);
      assert.strictEqual(fin.dispatched, data.agents.length, 'spec §9.3: not every agent was dispatched by the end');
      assert.strictEqual(fin.returned, data.agents.length, 'spec §9.3: not every agent came back by the end');
      assert.strictEqual(fin.reportChars, data.agents.reduce((s, a) => s + a.handbackChars, 0), 'spec §9.3: returned report length ≠ sum of reports');
      assert.strictEqual(fin.toolCalls, model.toolTimes.length, 'spec §9.3: tool counter does not reach the total');
      const states = model.agents.map((a) => C.agentState(a, end, clock).phase);
      assert.ok(states.every((p) => p === 'done'), `spec §9.4: at the end every agent should be done, got ${states}`);
    }
    // the fixed hero view really is a moment with the most agents running
    assert.strictEqual(C.counters(model, model.heroT).running, model.maxConcurrent, 'spec §8: ?view=hero is not at peak concurrency');
  });

  test(`${slug}: every agent's phase only moves forward (spec §9.4)`, () => {
    const clock = C.makeClock(model, C.DEFAULT_PLAYBACK), end = clock.end;
    for (const a of model.agents) {
      let prev = 0;
      const seen = new Set();
      for (let t = 0; t <= end; t += 0.5) {
        const r = PHASE_RANK[C.agentState(a, t, clock).phase];
        assert.ok(r >= prev, `spec §9.4: ${a.id} went from ${C.PHASES[prev]} back to ${C.PHASES[r]} at t=${t}`);
        prev = r; seen.add(r);
      }
      for (const must of ['working', 'collapsing', 'returning', 'done']) {
        assert.ok(seen.has(PHASE_RANK[must]) || C.since(clock, a.handbackT, a.dispatchT) < C.FX.dispatch, `spec §9.4: ${a.id} never showed ${must}`);
      }
    }
  });

  test(`${slug}: bubble area is proportional to tokens within 1% (spec §9.5)`, () => {
    const rUnit = 40;
    const ref = model.agents.find((a) => a.hasBubble);
    for (const a of model.agents.filter((x) => x.hasBubble)) {
      for (const [, tokens] of a.ctx) {
        const area = C.radiusFor(tokens, rUnit, model.maxPeak) ** 2, refArea = C.radiusFor(ref.peakTokens, rUnit, model.maxPeak) ** 2;
        const want = tokens / ref.peakTokens;
        assert.ok(Math.abs(area / refArea - want) <= 0.01 * Math.max(want, 1e-9) + 1e-12, `spec §9.5: ${a.id} area ratio ${area / refArea} vs token ratio ${want}`);
      }
    }
    // the dispatcher uses the same ruler
    const ccArea = C.radiusFor(model.mainMax, rUnit, model.maxPeak) ** 2, agentArea = C.radiusFor(model.maxPeak, rUnit, model.maxPeak) ** 2;
    assert.ok(Math.abs(ccArea / agentArea - model.mainMax / model.maxPeak) < 0.01 * (model.mainMax / model.maxPeak), 'spec §5: dispatcher bubble is not on the shared scale');
  });

  test(`${slug}: layout fits six screen shapes (spec §9.6)`, () => {
    const E = 0.01;   // cells share edges; ignore float noise on a shared edge
    const overlap = (a, b) => a.x < b.x + b.w - E && b.x < a.x + a.w - E && a.y < b.y + b.h - E && b.y < a.y + a.h - E;
    const circleBox = (c, r, below) => ({ x: c.x - r, y: c.y - r, w: 2 * r, h: 2 * r + (below || 0) });
    for (const [W, H] of VIEWPORTS) {
      const L = C.layout(model, W, H, { picker: SETS.length > 1 }), tag = `${W}×${H}`;
      const stageBottom = L.stage.y + L.stage.h - L.captionH;
      assert.ok(L.rUnit >= 14, `spec §9.6: ${tag} largest bubble radius ${L.rUnit.toFixed(1)} px < 14`);
      assert.ok(L.font >= C.MIN_FONT, `spec §9.6: ${tag} label font ${L.font} px < ${C.MIN_FONT}`);
      L.cells.forEach((c, i) => {
        assert.ok(c.x >= -0.5 && c.y >= L.stage.y - 0.5 && c.x + c.w <= W + 0.5 && c.y + c.h <= stageBottom + 0.5, `spec §9.6: ${tag} cell ${i} leaves the stage`);
        assert.ok(c.cy - L.rUnit >= c.y - 0.5 && c.labelY + L.labelBlock - 6 <= c.y + c.h + 0.5, `spec §9.6: ${tag} cell ${i} bubble or labels spill out of the cell`);
        for (let j = i + 1; j < L.cells.length; j++) assert.ok(!overlap(c, L.cells[j]), `spec §9.6: ${tag} cells ${i} and ${j} overlap`);
      });
      // dispatcher at its largest plus its two label lines, and the author with its label
      const labels = Math.max(12, L.font) * 2 + 12;
      const ccBox = circleBox(L.cc, L.ccMaxR + L.ccHalo, labels - L.ccHalo), authorBox = circleBox(L.author, L.author.r, 22);
      const ccHalf = Math.max(L.ccMaxR + L.ccHalo, L.ccLabelW / 2);
      Object.assign(ccBox, { x: L.cc.x - ccHalf, w: 2 * ccHalf });     // its two label lines are wider than the star
      if (L.readout) L.cells.forEach((c, i) => assert.ok(!overlap(L.readout, c), `spec §5: ${tag} big readout covers executor ${i}`));
      for (const [name, box] of [['dispatcher', ccBox], ['author', authorBox]]) {
        assert.ok(box.y >= L.stage.y - 0.5 && box.y + box.h <= stageBottom + 0.5 && box.x >= 0 && box.x + box.w <= W, `spec §9.6: ${tag} ${name} leaves the stage`);
        L.cells.forEach((c, i) => assert.ok(!overlap(box, c), `spec §9.6: ${tag} ${name} covers cell ${i}`));
      }
      assert.ok(!overlap(ccBox, authorBox), `spec §9.6: ${tag} author and dispatcher overlap`);
      // the end comparison fits the grid area
      const g = L.gridArea;
      for (const [name, c] of [['summed circle', L.endBig], ['dispatcher circle', L.endCc]]) {
        assert.ok(c.x - c.r >= g.x - 0.5 && c.x + c.r <= g.x + g.w + 0.5 && c.y - c.r >= g.y - 0.5 && c.y + c.r <= g.y + g.h + 0.5, `spec §9.6: ${tag} end ${name} does not fit`);
      }
      assert.ok(L.endBig.x + L.endBig.r < L.endCc.x - L.endCc.r, `spec §9.6: ${tag} end circles overlap`);
      const rulerY = L.endBig.y + L.endBig.r + Math.max(12, L.font) + 6;   // the 「同一把尺」 line under the summed circle
      assert.ok(rulerY <= L.stage.y + L.stage.h - L.captionH, `spec §9.6: ${tag} ruler line under the end circle falls into the caption band`);
    }
  });

  test(`${slug}: at most ${C.MAX_SPARKS} sparks at any moment (spec §9.7)`, () => {
    for (const playback of C.PLAYBACK) {
      const clock = C.makeClock(model, playback), end = clock.end;
      let most = 0;
      for (let t = 0; t <= end; t += 0.5) most = Math.max(most, C.sparks(model, t, clock).length);
      assert.ok(most <= C.MAX_SPARKS, `spec §9.7: ${most} sparks at playback ${playback}s`);
      assert.ok(most > 0, 'spec §9.7: no sparks at all, tool events are not reaching the view');
    }
  });

  test(`${slug}: captions fill every placeholder and are on screen when due (spec §9.8)`, () => {
    const clock = C.makeClock(model, C.DEFAULT_PLAYBACK);
    for (const [t, raw] of model.captions) {
      const filled = C.fillCaption(model, raw);
      assert.ok(!/[{}]/.test(filled), `spec §9.8: caption at ${t}s keeps a placeholder: ${filled}`);
      assert.ok(t >= 0 && t <= model.duration, `spec §9.8: caption at ${t}s is outside the run`);
      const shown = C.caption(model, t + 0.01, clock);
      assert.ok(shown && shown.text === filled, `spec §9.8: caption at ${t}s is not the one shown`);
    }
  });

  // 2026-10-23: the opening 30-second recording showed 「作者丢来一句话」 for 0.34 s and 「第一份报告回来了」 for 0.76 s
  // at a constant 45x speed. Every caption must stay up long enough to read (8 characters a second, at least 2.5 s).
  test(`${slug}: every caption stays up long enough to read, at both playback lengths (spec §6, §9.8)`, () => {
    for (const playback of C.PLAYBACK) {
      const clock = C.makeClock(model, playback);
      for (const [t, raw] of model.captions) {
        const text = C.fillCaption(model, raw), c = C.caption(model, t + 1e-6, clock);
        assert.ok(text.length <= 64, `spec §6: caption 「${text.slice(0, 16)}…」 is ${text.length} characters, limit 64`);
        const visible = C.since(clock, c.end, c.start), need = Math.max(C.MIN_HOLD, text.length / 8);
        assert.ok(visible >= need - 0.01, `spec §6: at ${playback}s playback 「${text.slice(0, 16)}…」 shows ${visible.toFixed(2)} s, needs ${need.toFixed(1)} s`);
      }
    }
  });

  test(`${slug}: the clock keeps the chosen length and runs one way (spec §6)`, () => {
    for (const playback of C.PLAYBACK) {
      const clock = C.makeClock(model, playback);
      assert.ok(Math.abs(clock.length - playback) <= playback * 0.1, `spec §6: chose ${playback} s, replay lasts ${clock.length.toFixed(1)} s`);
      let prev = -Infinity;
      for (let t = 0; t <= clock.end; t += 0.37) {
        const q = clock.play(t);
        assert.ok(q > prev, `spec §6: playback time goes backwards at t=${t}`);
        assert.ok(Math.abs(clock.real(q) - t) < 1e-6, `spec §6: play and real are not inverse at t=${t}`);
        prev = q;
      }
      const slowShare = clock.segs.filter((s) => s.slow).reduce((a, s) => a + s.p1 - s.p0, 0) / clock.length;
      assert.ok(slowShare < 0.75, `spec §6: ${Math.round(slowShare * 100)}% of the replay is slow motion, the work itself barely shows`);
    }
  });
}

test('formatting used in captions and labels', () => {
  assert.strictEqual(C.fmtTokens(143929), '14.4 万');
  assert.strictEqual(C.fmtTokens(3767335), '376.7 万');
  assert.strictEqual(C.fmtTokens(180000), '18 万');
  assert.strictEqual(C.fmtTokens(950), '950');
  assert.strictEqual(C.fmtInt(8674), '8,674');
  assert.strictEqual(C.fmtClock(4110), '68:30');
});
