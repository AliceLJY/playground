// Content and pure-function checks for 手写板书: the words, the timing numbers and the doodle geometry.
// Thresholds come from SPEC.md §8 (the item numbers are cited as spec #n).  Run: node --test tests/*.test.cjs
const test = require('node:test'), assert = require('node:assert');
const path = require('path');
const ROOT = process.env.HB_DIR ? path.resolve(process.env.HB_DIR) : path.join(__dirname, '..');
const PAGES = require(path.join(ROOT, 'src', 'pages.js')), C = require(path.join(ROOT, 'src', 'core.js'));
const { CFG } = C;
const allLines = PAGES.flatMap((p, pi) => [{ pi, title: true, text: p.title }, ...p.lines.map((l, li) => ({ pi, li, ...l }))]);

test('the board has two pages, each with a title and 3 to 4 lines (spec #10)', () => {
  assert.strictEqual(PAGES.length, 2, 'spec #10: two pages');
  PAGES.forEach((p, i) => {
    assert.ok(typeof p.title === 'string' && p.title.length > 0, `spec #10: page ${i + 1} needs a title`);
    assert.ok(p.lines.length >= 3 && p.lines.length <= 4, `spec #10: page ${i + 1} has ${p.lines.length} lines`);
  });
});

test('every doodle names a target that is really in its line, and only known kinds (spec #10)', () => {
  for (const l of allLines.filter((l) => !l.title)) {
    assert.ok(['circle', 'underline', 'box', 'arrow'].includes(l.doodle), `spec #10: line "${l.text}" has doodle "${l.doodle}"`);
    if (l.target) assert.ok(l.text.includes(l.target), `spec #10: target "${l.target}" is not a substring of "${l.text}", so the doodle would silently go around the whole line`);
  }
});

test('nothing private or off-site in the words (spec #1)', () => {
  const text = allLines.map((l) => l.text).join('\n');
  assert.ok(!/https?:\/\/|@[A-Za-z0-9.-]+\.[a-z]{2,}|\/Us\w+rs\/|\.md\b/.test(text), 'spec #1: the board text contains a link, an e-mail, a path or a file name');
});

test('a space is drawn as a no-break space and nothing else changes (spec #2)', () => {
  assert.strictEqual(C.displayText('a b'), 'a b');
  const t = PAGES[1].lines[0].text;
  assert.strictEqual(C.displayText(t).replace(/ /g, ' '), t);
  assert.ok(C.displayText(t).includes(' '), 'spec #2: this line has a space, it must come out as U+00A0');
});

test('character reveal times are deterministic, bounded by the jitter, and not all equal (spec #10)', () => {
  for (const l of allLines) {
    const a = C.charDurations(l.text, 10), b = C.charDurations(l.text, 10);
    assert.deepStrictEqual(a, b, `spec #10: "${l.text}" gave two different timings for the same seed`);
    Array.from(l.text).forEach((ch, i) => {
      if (ch === ' ') { assert.strictEqual(a[i], CFG.spaceDur); return; }
      const base = C.isCJK(ch) ? CFG.cjkDur : CFG.asciiDur;
      assert.ok(a[i] >= base * (1 - CFG.jitter / 2) - 1e-9 && a[i] <= base * (1 + CFG.jitter / 2) + 1e-9, `spec #10: "${ch}" in "${l.text}" takes ${a[i]}s, outside ±${CFG.jitter / 2 * 100}% of ${base}s`);
    });
    if (l.text.length >= 8) assert.ok(new Set(a).size > 3, `spec #10: "${l.text}" has no visible jitter between characters`);
  }
  assert.notDeepStrictEqual(C.charDurations(PAGES[0].title, 1), C.charDurations(PAGES[0].title, 2), 'spec #10: a different seed should change the timing');
});

test('writing the whole board takes 15 to 30 s of pen time at 1x (spec #10)', () => {
  let t = 0;
  allLines.forEach((l, k) => {
    t += C.charDurations(l.text, l.pi * 100 + (l.title ? 0 : l.li + 1) * 10).reduce((a, b) => a + b, 0);
  });
  assert.ok(t >= 15 && t <= 30, `spec #10: ${t.toFixed(1)} s of character reveals`);
});

// parse the numbers of a path string
const nums = (d) => (d.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g) || []).map(Number);
const bbox = (d) => { const n = nums(d), xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1); return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; };

test('doodle paths are valid, repeatable and really go around / under / next to their target (spec #10)', () => {
  const rects = [{ x: 200, y: 200, w: 180, h: 70 }, { x: 540, y: 330, w: 260, h: 70 }, { x: 112, y: 90, w: 600, h: 80 }];
  for (const kind of ['circle', 'underline', 'box', 'arrow']) for (const r of rects) {
    const d = C.doodleFor(kind, r, 77);
    assert.ok(/^M[-\d. ]+/.test(d) && !/[^MLQC\d\s.,-]/.test(d), `spec #10: ${kind} path has unexpected characters: ${d.slice(0, 60)}`);
    assert.ok(nums(d).every(Number.isFinite), `spec #10: ${kind} path has a non-finite number`);
    assert.strictEqual(d, C.doodleFor(kind, r, 77), `spec #10: ${kind} path is not repeatable`);
    assert.notStrictEqual(d, C.doodleFor(kind, r, 78), `spec #10: ${kind} path ignores the seed`);
    const b = bbox(d);
    if (kind === 'circle' || kind === 'box') {
      assert.ok(b.x0 <= r.x && b.x1 >= r.x + r.w && b.y0 <= r.y && b.y1 >= r.y + r.h, `spec #10: ${kind} does not enclose its target`);
      assert.ok(b.x1 - b.x0 <= r.w + 80 && b.y1 - b.y0 <= r.h + 60, `spec #10: ${kind} is much larger than its target`);
    }
    if (kind === 'underline') {
      assert.ok(b.x0 <= r.x && b.x1 >= r.x + r.w, 'spec #10: underline is shorter than its target');
      assert.ok(b.y0 >= r.y + r.h - 16 && b.y1 <= r.y + r.h + 8, `spec #10: underline sits at y ${b.y0}..${b.y1}, not under the target (bottom ${r.y + r.h})`);
    }
    if (kind === 'arrow') assert.ok(b.x0 >= r.x + r.w, 'spec #10: arrow starts on top of its target instead of after it');
  }
});

test('the arrow stops short of maxX when there is room, and never gets shorter than 60 (spec #5)', () => {
  const r = { x: 300, y: 300, w: 300, h: 70 };      // the arrow starts at x = 626
  const tip = (maxX) => { const n = nums(C.doodleFor('arrow', r, 5, maxX)); return Math.max(...n.filter((_, i) => i % 2 === 0)); };
  assert.ok(tip(undefined) > 626 + 140, 'spec #5: without a limit the arrow is the full 150 long');
  assert.ok(tip(700) <= 700 + 0.5, `spec #5: arrow reaches x=${tip(700)} but maxX is 700`);
  assert.ok(tip(640) >= 626 + 59, `spec #5: arrow is only ${tip(640) - 626} long, minimum is 60`);
});

test('layout choice: fits the box, never beyond MAX_SCALE, and always the shape with the larger writing (spec #5)', () => {
  const { LAYOUTS, MAX_SCALE } = C;
  for (let w = 240; w <= 2000; w += 40) for (let h = 160; h <= 1400; h += 40) {
    const pick = C.chooseLayout(w, h), other = C.fitLayout(pick.layout === LAYOUTS.landscape ? LAYOUTS.portrait : LAYOUTS.landscape, w, h);
    assert.ok(pick.w <= w + 1e-6 && pick.h <= h + 1e-6, `spec #5: ${pick.layout.name} frame ${pick.w.toFixed(0)}x${pick.h.toFixed(0)} does not fit a ${w}x${h} box`);
    assert.ok(pick.scale <= MAX_SCALE + 1e-9, `spec #5: scale ${pick.scale} beyond ${MAX_SCALE}`);
    assert.ok(pick.bodyPx >= other.bodyPx - 1e-9, `spec #5: in a ${w}x${h} box the ${other.layout.name} shape would write larger (${other.bodyPx.toFixed(1)} vs ${pick.bodyPx.toFixed(1)}px)`);
    if (w / h >= 1.7) assert.strictEqual(pick.layout.name, 'landscape', `spec #5: a wide ${w}x${h} box should get the landscape board`);
    if (w / h <= 0.7) assert.strictEqual(pick.layout.name, 'portrait', `spec #5: a tall ${w}x${h} box should get the portrait board`);
  }
});

test('the boxes the five test screens leave for the board get the expected shape and readable writing (spec #5)', () => {
  // free area left for the board after the header and controls, as the page measured it in tools/browser-check.cjs (state().box):
  // phone upright, phone sideways, folding screen, laptop window, big monitor
  const boxes = [['phone', 366, 683, 'portrait'], ['phone sideways', 820, 322, 'landscape'], ['fold', 696, 691, 'portrait'], ['laptop', 1256, 619, 'landscape'], ['monitor', 1896, 979, 'landscape']];
  for (const [name, w, h, shape] of boxes) {
    const pick = C.chooseLayout(w, h);
    assert.strictEqual(pick.layout.name, shape, `spec #5: ${name} (${w}x${h}) got ${pick.layout.name}`);
    assert.ok(pick.bodyPx >= 15 && pick.titlePx >= 20, `spec #5: ${name} writing is ${pick.bodyPx.toFixed(1)}px body / ${pick.titlePx.toFixed(1)}px title on screen, minimum 15 / 20`);
  }
});
