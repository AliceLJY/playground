const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const C = require('../src/core.js');

// Record real renderer commands without a DOM or an extra Canvas dependency.
function renderer() {
  const flashes = [];
  function canvas() {
    const cv = { width: 360, height: 520 };
    const ctx = new Proxy({}, {
      get(target, key) {
        if (key === 'drawImage') return image => { if (image.hurtEdge) flashes.push(target.globalAlpha); };
        return key in target ? target[key] : () => {};
      },
      set(target, key, value) { target[key] = value; if (key === 'fillStyle' && value === '#FF2A3A') cv.hurtEdge = true; return true; }
    });
    cv.getContext = () => ctx;
    return cv;
  }
  const scope = { CoalData: C.data, document: { createElement: canvas } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/art.js'), 'utf8'), scope);
  return { art: scope.CoalArt.createRenderer(canvas()), flashes };
}

test('R1: a real ordinary hit paints red edges for exactly 18 simulation ticks', () => {
  const { art, flashes } = renderer(), s = C.create(1); s.nextSpawn = 1e9;
  C.step.hurt(s);
  for (let i = 0; i <= 84; i++) { art.draw(s); C.step(s, 0, 0, -2); }
  assert.equal(s.hits, 1);
  assert.equal(flashes.length, 18);
  assert.equal(flashes[0], 1);
  assert.ok(flashes.at(-1) > 0 && flashes.at(-1) < .1);
});

test('R2: a revival shield never paints a delayed red edge as it counts through 84', () => {
  const { art, flashes } = renderer(), s = C.create(1); s.nextSpawn = 1e9; s.hp = 1; s.revives = 1;
  C.step.hurt(s);
  for (let i = 0; i <= 180; i++) { art.draw(s); C.step(s, 0, 0, -2); }
  assert.equal(s.revivals, 1);
  assert.equal(s.hits, 1, 'no second hit occurred during the shield');
  assert.equal(flashes.length, 0, 'revival must not replay an ordinary hit flash');
});
