// The four fixed scenes used by the tests, the CPU preview and the browser check, written as plain steps so
// each of them can replay the same thing: Node drives World directly, the browser check drives the page
// through window.__PLAYTEST__ (turning the world points below into screen points).
//   grab   {bear, part}          take hold of a part where it is
//   drag   {offset, ms}          move the hand in a straight line, over ms, to (where the part was grabbed + offset);
//                                 with stopAtPeak, stop moving at the frame the stretch stops growing (the picture
//                                 of a pulled bear: the far end has not caught up yet)
//   step   {ms}                  advance the simulation
//   release
//   pourFull                      pour until the table holds its cap, waiting for each handful to land
//   settle {maxMs}                step until no bear moves (or maxMs)
//   landing {bear, maxMs}         step one frame at a time until the bear, after leaving the table, touches it
//                                 again, then two more frames (the most squashed moment)
export const SEED = 7;
export const SCENARIOS = {
  row: [{ op: 'reset' }, { op: 'step', ms: 1200 }],
  stretch: [
    { op: 'reset' }, { op: 'step', ms: 300 },
    { op: 'grab', bear: 2, part: 'head' },
    { op: 'drag', offset: [0.6, 2.6, -2.0], ms: 300, stopAtPeak: true },
  ],
  fling: [
    { op: 'reset' }, { op: 'step', ms: 300 },
    { op: 'grab', bear: 0, part: 'head' },
    { op: 'drag', offset: [0.5, 2.4, 0], ms: 600 }, { op: 'step', ms: 300 },
    { op: 'drag', offset: [2.8, 4.3, 0], ms: 120 },
    { op: 'release' },
    { op: 'landing', bear: 0, maxMs: 4000 },
  ],
  pile: [{ op: 'reset' }, { op: 'pourFull' }, { op: 'settle', maxMs: 16000 }],
};

// Run a scenario on a World (Node). Returns the snapshot at the end plus a few readings gathered on the way.
export function runOnWorld(world, steps, { onFrame } = {}) {
  const DT = 1 / 60, notes = { frames: 0, minVolume: Infinity, maxStretch: 1 };
  const frameStep = () => {
    world.step(); notes.frames++;
    notes.maxStretch = Math.max(notes.maxStretch, world.stats.stretch);
    if (onFrame) onFrame(world, notes);
  };
  const steady = () => world.bears.every((b, i) => b.asleep || world.bearSpeed(i) < 0.25);
  let anchor = null, hand = null;
  for (const s of steps) {
    if (s.op === 'reset') { world.reset(); anchor = null; }
    else if (s.op === 'step') for (let i = 0, n = Math.round(s.ms / 1000 / DT); i < n; i++) frameStep();
    else if (s.op === 'grab') {
      const li = world.partParticle[s.part], o = (s.bear * world.n + li) * 3;
      anchor = [world.x[o], world.x[o + 1], world.x[o + 2]];
      world.grab(s.bear, li, anchor);
      hand = anchor.slice();
    } else if (s.op === 'drag') {
      const from = hand.slice(), to = anchor.map((v, k) => v + s.offset[k]), n = Math.max(1, Math.round(s.ms / 1000 / DT));
      for (let i = 1, prev = 0; i <= n; i++) {
        hand = from.map((v, k) => v + ((to[k] - v) * i) / n); world.moveGrab(hand); frameStep();
        if (s.stopAtPeak && world.stats.stretch < prev) break;
        prev = world.stats.stretch;
      }
    } else if (s.op === 'release') world.release();
    else if (s.op === 'pourFull') {
      while (world.count + world.pending < world.cap) { world.pour(); for (let i = 0; i < 45; i++) frameStep(); }
      while (world.pending) frameStep();
    } else if (s.op === 'settle') { for (let i = 0, n = Math.round(s.maxMs / 1000 / DT); i < n && !steady(); i++) frameStep(); notes.settledAt = +world.time.toFixed(3); notes.settled = steady(); }
    else if (s.op === 'landing') {
      let left = false, n = Math.round(s.maxMs / 1000 / DT);
      for (let i = 0; i < n; i++) {
        frameStep();
        const low = world.bearBox(s.bear).min[1];
        if (low > 0.25) left = true;
        if (left && low < 0.02) { frameStep(); frameStep(); notes.landedAt = +world.time.toFixed(3); break; }
      }
    }
  }
  return { snapshot: world.snapshot(), notes };
}
