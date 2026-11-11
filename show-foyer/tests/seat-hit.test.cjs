const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const D = require('../src/core.js');
const source = fs.readFileSync(path.join(__dirname, '../src/game.js'), 'utf8');

function contains(polygon, x, y) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

// Record actual drawSeat paths. Curves are sampled only for this Node geometry
// check; native Canvas hit testing and touch delivery still need a browser.
function canvasContext() {
  let polygon = [], scale = 1;
  const context = {
    fills: [],
    setTransform(a) { scale = a; },
    beginPath() { polygon = []; },
    moveTo(x, y) { polygon.push([x, y]); },
    lineTo(x, y) { polygon.push([x, y]); },
    quadraticCurveTo(cx, cy, x, y) {
      const [sx, sy] = polygon.at(-1);
      for (let i = 1; i <= 64; i++) {
        const t = i / 64, u = 1 - t;
        polygon.push([u * u * sx + 2 * u * t * cx + t * t * x, u * u * sy + 2 * u * t * cy + t * t * y]);
      }
    },
    arcTo(x1, y1, x2, y2, radius) {
      const [x0, y0] = polygon.at(-1);
      const before = Math.hypot(x0 - x1, y0 - y1), after = Math.hypot(x2 - x1, y2 - y1);
      const ux = (x0 - x1) / before, uy = (y0 - y1) / before;
      const vx = (x2 - x1) / after, vy = (y2 - y1) / after;
      assert.ok(Math.abs(ux * vx + uy * vy) < 1e-8, 'roundRect uses right-angle corners');
      const cx = x1 + (ux + vx) * radius, cy = y1 + (uy + vy) * radius;
      const start = Math.atan2(-vy, -vx);
      let sweep = Math.atan2(-uy, -ux) - start;
      if (ux * vy - uy * vx < 0 && sweep < 0) sweep += Math.PI * 2;
      if (ux * vy - uy * vx > 0 && sweep > 0) sweep -= Math.PI * 2;
      for (let i = 0; i <= 32; i++) {
        const angle = start + sweep * i / 32;
        polygon.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
      }
    },
    closePath() {},
    fill() { this.fills.push(polygon.slice()); },
    fillRect() {},
    fillText() {},
    stroke() {},
    createLinearGradient() { return { addColorStop() {} }; },
    isPointInPath(x, y) { return contains(polygon, x / scale, y / scale); },
  };
  return context;
}

function loadGame(width, height, dpr) {
  const ctx = canvasContext(), elements = new Map();
  const rect = { left: 17, top: 73, width, height };
  const getElement = (id) => {
    if (!elements.has(id)) elements.set(id, {
      textContent: '', dataset: {}, listeners: {},
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      addEventListener(type, callback) { this.listeners[type] = callback; },
      setAttribute() {}, querySelectorAll() { return []; },
      getBoundingClientRect() { return rect; }, getContext() { return ctx; },
    });
    return elements.get(id);
  };
  const window = { FOYER: D, devicePixelRatio: dpr, addEventListener() {} };
  const sandbox = {
    window, document: { getElementById: getElement, querySelectorAll() { return []; } },
    location: { search: '?view=first&mute=1' }, URLSearchParams,
    requestAnimationFrame() {}, setTimeout() {}, clearTimeout() {},
  };
  // Expose the real drawing/geometry functions only in this in-memory test copy.
  vm.runInNewContext(source.replace(/\}\)\(\);\s*$/, 'window.seatTest = { geom, seatPos, rowScale, drawSeat }; bake = { velvet: null }; })();'), sandbox);
  const game = window.__foyer, geometry = window.seatTest;
  function reset(empty = true) {
    game.reset();
    if (empty) game.state.residents = [];
  }
  function click(x, y) {
    getElement('scene').listeners.pointerdown({ clientX: rect.left + x, clientY: rect.top + y, pointerType: dpr > 1 ? 'touch' : 'mouse' });
    return game.snapshot();
  }
  function chair(i) {
    const g = geometry.geom(), p = geometry.seatPos(i, g), row = Math.floor(i / D.COLS);
    const rs = geometry.rowScale(row), bw = g.seatW * rs, bh = g.seatH * rs;
    const outlines = {};
    for (const part of ['back', 'front']) {
      ctx.fills = [];
      geometry.drawSeat(p, g.ps * rs, bw, bh, row, i % D.COLS, { part, empty: true, me: false });
      // The backrest is the widest front fill; armrest caps and the plate are smaller.
      outlines[part] = ctx.fills.reduce((largest, points) => {
        const span = poly => Math.max(...poly.map(p => p[0])) - Math.min(...poly.map(p => p[0]));
        return span(points) > span(largest) ? points : largest;
      });
    }
    return { ...p, bw, bh, yt: p.y - bh * 0.15, cushion: outlines.back, backrest: outlines.front };
  }
  reset();
  return { game, reset, click, chair };
}

const sizes = [[1440, 686, 1], [1365, 776, 1], [390, 486, 2], [320, 390, 2], [412, 522, 3], [844, 216, 2]];

for (const [width, height, dpr] of sizes) {
  const name = `${width}×${height} DPR${dpr}`;
  test(`${name} 椅背下部、侧边落座到所点座位`, () => {
    const app = loadGame(width, height, dpr);
    for (let i = 0; i < D.CAP; i++) {
      const c = app.chair(i);
      for (const [dx, dy] of [[0, 0.8], [-0.43, 0.68], [0.43, 0.68], [0, 0.3]]) {
        const x = c.x + c.bw * dx, y = c.yt + c.bh * dy;
        assert.ok(contains(c.backrest, x, y), '采样点须在实际绘制的椅背内');
        app.reset();
        const result = app.click(x, y);
        assert.equal(result.phase, 'seated', `${name} 座位 ${i} 椅背 (${dx}, ${dy}) 未落座`);
        assert.equal(result.seat, i, `${name} 座位 ${i} 被邻座抢点`);
      }
    }
  });

  test(`${name} 露出的坐垫可以落座`, () => {
    const app = loadGame(width, height, dpr);
    for (let i = 0; i < D.CAP; i++) {
      const c = app.chair(i), y = c.yt - c.bh * 0.1;
      for (const dx of [-0.2, 0, 0.2]) {
        const x = c.x + c.bw * dx;
        assert.ok(contains(c.cushion, x, y), '采样点须在实际绘制的坐垫内');
        assert.ok(!contains(c.backrest, x, y), '坐垫采样点须露在椅背外');
        app.reset();
        const result = app.click(x, y);
        assert.equal(result.phase, 'seated', `${name} 座位 ${i} 坐垫未落座`);
        assert.equal(result.seat, i, `${name} 座位 ${i} 坐垫被邻座抢点`);
      }
    }
  });

  test(`${name} 圆顶外、座间和排间空隙不触发落座`, () => {
    const app = loadGame(width, height, dpr);
    const chairs = Array.from({ length: D.CAP }, (_, i) => app.chair(i));
    const points = [];
    for (let i = 0; i < D.CAP; i++) {
      const c = chairs[i];
      points.push([c.x - c.bw * 0.45, c.yt + c.bh * 0.02], [c.x + c.bw * 0.45, c.yt + c.bh * 0.02]);
      if (i % D.COLS < D.COLS - 1) points.push([(c.x + chairs[i + 1].x) / 2, c.yt + c.bh * 0.5]);
      if (i < D.CAP - D.COLS) points.push([c.x, (c.yt + c.bh + chairs[i + D.COLS].yt - chairs[i + D.COLS].bh * 0.16) / 2]);
    }
    for (const [x, y] of points) {
      assert.ok(chairs.every(c => !contains(c.backrest, x, y) && !contains(c.cushion, x, y)), '空隙采样点必须在所有椅背与坐垫外');
      app.reset();
      assert.equal(app.click(x, y).phase, 'door', `${name} 空隙 (${x.toFixed(1)}, ${y.toFixed(1)}) 误触落座`);
    }
  });
}

test('已占座位沿用提示，不穿透到旁边空位；落座后不能直接换座', () => {
  const app = loadGame(390, 486, 2);
  app.reset(false);
  const occupied = app.game.state.residents[0].seat, c = app.chair(occupied);
  const result = app.click(c.x + c.bw * 0.43, c.yt + c.bh * 0.68);
  assert.equal(result.phase, 'door');
  assert.equal(result.hint, '这是候场身影，不是真人');
  app.reset();
  const first = app.chair(0), second = app.chair(1);
  assert.equal(app.click(first.x, first.y).seat, 0);
  const after = app.click(second.x, second.y);
  assert.equal(after.seat, 0);
  assert.equal(after.hint, '换座请先离席');
});
