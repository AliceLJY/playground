const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), C = require('../src/core.js');

test('hall wall paint includes three horizontal grain strokes and seeded speckles per cell', () => {
  const strokes = [], speckles = [], state = {}, stack = []; let points = [];
  const ctx = new Proxy(state, { get(target, key) {
    if (key in target) return target[key];
    if (key === 'save') return () => stack.push({ ...state });
    if (key === 'restore') return () => Object.assign(state, stack.pop());
    if (key === 'beginPath') return () => { points = []; };
    if (key === 'moveTo' || key === 'lineTo') return (x, y) => points.push([x, y]);
    if (key === 'stroke') return () => strokes.push({ style: state.strokeStyle, points: [...points] });
    if (key === 'fillRect') return (x, y) => { if (state.fillStyle === '#ffffff' && state.globalAlpha === .05) speckles.push([x, y]); };
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (key === 'measureText') return () => ({ width: 20 });
    return () => {};
  } });
  const scope = {}; vm.runInNewContext(fs.readFileSync(require.resolve('../src/art.js'), 'utf8'), scope);
  scope.SneakArt.paintRoom(ctx, C.level(1), { ox: 0, oy: 0, s: 40 }, true);
  // The top-left wall cell occupies [0,40] × [0,40]. Inspect actual paint commands in that cell.
  const grain = strokes.filter(s => s.style === 'rgba(0,0,0,.18)' && s.points.length === 2 &&
    s.points[0][0] === 0 && s.points[1][0] === 40 && s.points[0][1] === s.points[1][1] && s.points[0][1] > 0 && s.points[0][1] < 40);
  assert.equal(grain.length, 3, 'hall wall grain was skipped');
  assert.ok(speckles.filter(([x, y]) => x >= 0 && x < 40 && y >= 0 && y < 40).length >= 30, 'hall wall speckles were skipped');
});
