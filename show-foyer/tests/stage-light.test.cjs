const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const D = require('../src/core.js');
const { sampleRegions, fadeChecks } = require('../tools/stage-light-check.cjs');
let source = fs.readFileSync(path.join(__dirname, '../src/game.js'), 'utf8');
// 故障只注入内存副本；命令见 VERIFICATION。它们应使本文件以 1 退出。
const mutation = process.env.FOYER_LIGHT_MUTATION;
if (mutation === 'instant') {
  const old = 'S.lit += (litTarget() - S.lit) * (1 - Math.exp(-dt * 2.2));';
  assert.ok(source.includes(old), '瞬亮变异未命中');
  source = source.replace(old, 'S.lit = litTarget();');
} else if (mutation === 'no-cone') {
  const line = source.match(/ctx\.fillStyle = cone;[^\n]*ctx\.fill\(\);/);
  assert.ok(line, '去光锥变异未命中');
  source = source.replace(line[0], line[0].replace(/ctx\.fill\(\);$/, '/* cone fill disabled */'));
} else if (mutation && mutation !== 'old-geometry') throw new Error(`未知变异 ${mutation}`);

// 只记录实际 Canvas 绘图指令，不生成像素；像素、原生裁剪与色彩仍由浏览器验。
function context() {
  let polygon = [];
  const calls = { rects: [], fills: [], radials: [] };
  const ctx = new Proxy({
    calls,
    beginPath() { polygon = []; }, moveTo(x, y) { polygon.push([x, y]); }, lineTo(x, y) { polygon.push([x, y]); },
    fill() { calls.fills.push(polygon.slice()); },
    fillRect(...box) { calls.rects.push({ box, style: this.fillStyle }); },
    rect(...box) { calls.rects.push({ box, clip: true }); },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient(...args) { calls.radials.push(args); return { addColorStop() {} }; },
    measureText(text) { return { width: text.length * 6 }; }, createPattern() { return {}; },
  }, { get(target, key) { return key in target ? target[key] : () => {}; } });
  return ctx;
}
function load(width, height, dpr) {
  const contexts = [], elements = new Map(), ctx = context(); contexts.push(ctx);
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      textContent: '', dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      setAttribute() {}, addEventListener() {}, querySelectorAll() { return []; },
      getBoundingClientRect() { return { width, height }; }, getContext() { return ctx; },
    });
    return elements.get(id);
  };
  const window = { FOYER: D, devicePixelRatio: dpr, addEventListener() {} };
  const sandbox = {
    window, location: { search: '?view=first&t=6&mute=1' }, URLSearchParams,
    document: { getElementById: element, querySelectorAll() { return []; }, createElement() { const c = context(); contexts.push(c); return { getContext() { return c; } }; } },
    requestAnimationFrame() {}, setTimeout() {}, clearTimeout() {},
  };
  const oldGeometry = mutation === 'old-geometry' ? "Object.defineProperty(window.__foyer, 'geometry', { get() { const g = geom(); return { curtain: { x: g.cx0, y: 0, width: g.cx1 - g.cx0, height: g.curtainH } }; } });" : '';
  vm.runInNewContext(source.replace(/\}\)\(\);\s*$/, `window.lightTest = { tick, geom, bakeLayers, drawStage }; ${oldGeometry} })();`), sandbox);
  return { game: window.__foyer, actual: window.lightTest, ctx, contexts };
}
function inside(poly, x, y) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}
const sizes = [[1440, 686, 1], [1440, 956, 1], [390, 486, 2], [320, 390, 2], [412, 522, 3]];
for (const [width, height, dpr] of sizes) {
  test(`${width}×${height}：取样来自实际舞台、幕布、台板与台柱绘制，锥内外不串区`, () => {
    const { game, actual, ctx, contexts } = load(width, height, dpr), g = game.geometry;
    assert.ok(g.stage && g.boards && g.frame && g.firstLamp, '缺真实舞台/台板/台框/灯位几何');
    const regions = sampleRegions(g), layout = actual.geom();
    actual.bakeLayers(layout);
    const rectangles = contexts.flatMap(c => c.calls.rects);
    const drawn = b => rectangles.some(r => r.box.every((v, i) => Math.abs(v - [b.x, b.y, b.width, b.height][i]) < 1e-8));
    assert.ok(drawn(g.boards), '台板几何必须匹配实际烘焙木台板');
    assert.ok(drawn(g.frame.left) && drawn(g.frame.right), '台框几何必须匹配实际台柱');
    game.act(0); game.act(1); actual.tick(3); actual.drawStage(layout);
    assert.ok(ctx.calls.rects.some(r => r.clip && r.box.every((v, i) => Math.abs(v - [g.curtain.x, g.curtain.y, g.curtain.width, g.curtain.height][i]) < 1e-8)), '幕布几何必须匹配实际裁剪区');
    assert.ok(ctx.calls.rects.some(r => String(r.style).startsWith('rgba(6,3,2,') && r.box.every((v, i) => Math.abs(v - [g.stage.x - 4, g.stage.y, g.stage.width + 8, g.stage.height + 8][i]) < 1e-8)), '舞台几何必须匹配实际暗场覆盖');
    for (const name of ['curtainLeft', 'curtainMiddle', 'curtainRight']) {
      const b = regions[name];
      assert.ok(b.x >= g.curtain.x && b.x + b.width <= g.curtain.x + g.curtain.width, `${name} 不得取到墙面`);
    }
    assert.ok(regions.frameLeft.x + regions.frameLeft.width < g.curtain.x, '左台框必须在光锥裁剪区外');
    assert.ok(regions.frameRight.x > g.curtain.x + g.curtain.width, '右台框必须在光锥裁剪区外');
    const b = regions.coneInside, corners = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]];
    const cone = ctx.calls.fills.find(poly => poly.length === 4 && corners.every(([x, y]) => inside(poly, x, y)));
    assert.ok(cone, '锥内取样框四角必须落在实际绘制的光锥路径内');
    const pool = ctx.calls.radials.find(args => args[0] === g.firstLamp.x && args[1] === g.curtain.height * 0.62);
    assert.ok(pool, '样本必须实际绘出幕上光斑');
    assert.ok(corners.every(([x, y]) => Math.hypot(x - pool[3], y - pool[4]) > pool[5]), '锥内取样不得靠光斑通过');
    for (const name of ['coneOutsideLeft', 'coneOutsideRight']) {
      const outside = regions[name];
      assert.equal(outside.y, b.y); assert.equal(outside.height, b.height);
      assert.ok(!inside(cone, outside.x, outside.y) && !inside(cone, outside.x + outside.width, outside.y + outside.height), `${name} 必须在光锥外`);
    }
    for (const [name, b] of Object.entries(regions)) {
      const kx = Math.round(width * Math.min(dpr, 2)) / width, ky = Math.round(height * Math.min(dpr, 2)) / height;
      assert.ok(Math.floor((b.x + b.width) * kx) > Math.ceil(b.x * kx) && Math.floor((b.y + b.height) * ky) > Math.ceil(b.y * ky), `${name} 必须有真实取样像素`);
    }
    const fresh = JSON.stringify(game.geometry);
    g.stage.width = 1; g.frame.left.x = -100;
    assert.equal(JSON.stringify(game.geometry), fresh, '只读几何的返回值不得修改实际布局');
  });
}

test('总光实际 tick：真实落座点灯后约一秒渐亮，不能靠 0.6 秒灯笼淡入通过', () => {
  const { game, actual } = load(390, 486, 2);
  assert.equal(game.act(0), true); assert.equal(game.act(1), true);
  const values = { 0: game.state.lit }, times = [0, 120, 600, 1000, 2000, 3000];
  for (let i = 1; i < times.length; i++) { actual.tick((times[i] - times[i - 1]) / 1000); values[times[i]] = game.state.lit; }
  assert.equal(game.snapshot().lamps, 1, '样本里必须确实点过灯');
  for (const [name, passed] of Object.entries(fadeChecks(values))) assert.ok(passed, `${name}: ${JSON.stringify(values)}`);
  // 相同 1 秒里换细时间步，指数模拟仍应一致；灯笼的出生时间不改总光。
  game.reset(); game.act(0); game.act(1); game.state.lamps[0].t = -1;
  for (let i = 0; i < 60; i++) actual.tick(1 / 60);
  assert.ok(Math.abs(game.state.lit - values[1000]) < 1e-10, '总光不得依赖灯笼淡入或测试时间步');
});
