const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../src/core.js');

// Capture the real street mesh uploads and frame's shadow placement without a GPU.
// Only PlayCanvas storage, textures, animation, camera and HUD are replaced.
function renderer() {
  class Mesh {
    setPositions(v) { this.p = Array.from(v); }
    setNormals(v) { this.n = Array.from(v); }
    setColors32(v) { this.c = Array.from(v); }
    setUvs() {}
    setIndices(v) { this.i = Array.from(v); }
    update() {}
  }
  class Entity {
    constructor(name) { this.name = name; this.children = []; this.position = [0, 0, 0]; this.scale = [1, 1, 1]; this.enabled = true; }
    addChild(e) { this.children.push(e); }
    addComponent(name, value) { this[name] = value; }
    setPosition(...v) { this.position = v; }
    setLocalScale(...v) { this.scale = v; }
  }
  const pc = {
    Mesh, Entity, MeshInstance: class { constructor(mesh, material) { this.mesh = mesh; this.material = material; } },
    StandardMaterial: class { update() {} }, Color: class {}, Layer: class {}, Vec3: class {}
  };
  const source = (file) => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const textures = vm.runInNewContext(source('textures.js') + '\n;({ ATLAS, ARENA, SIGN_TEXT })', { pc });
  const street = vm.runInNewContext(source('street.js') + '\n;buildStreet(app)', {
    pc, ...textures, makeTextures: () => Object.fromEntries(['plaster', 'brick', 'granite', 'tile', 'wood'].map(k => [k, {}])),
    app: { graphicsDevice: {}, scene: { layers: { push() {} } } }
  });
  // Derive the receiver bounds from the actual uploaded platform top, not ring constants.
  const plain = street.root.children.find(e => e.name === 'street-plain').render.meshInstances[0].mesh;
  const platform = [];
  for (let i = 0; i < plain.i.length; i += 3) {
    const tri = plain.i.slice(i, i + 3).map(k => plain.p.slice(k * 3, k * 3 + 3));
    if (tri.every(p => Math.abs(p[1] - .05) < 1e-9) && Math.max(...tri.map(p => p[2])) - Math.min(...tri.map(p => p[2])) > 10) platform.push(...tri);
  }
  assert.ok(platform.length, 'must capture the actual ring platform');
  const bounds = [Math.min(...platform.map(p => p[0])), Math.max(...platform.map(p => p[0])), Math.min(...platform.map(p => p[2])), Math.max(...platform.map(p => p[2]))];
  const render = vm.runInNewContext(source('main.js').replace(/\nboot\(\)\.catch[\s\S]*$/, '') + `
    street = testStreet;
    syncChar = updateCamera = updateHud = () => {};
    sim = { enemies: [], gongT: 0, wave: 0 };
    (fighters) => {
      chars = new Map(fighters.map((o, i) => [i, { o, c: {} }]));
      frame(1 / 60);
      return blobs.filter(b => b.enabled);
    }`, {
    pc, C, testStreet: street, URLSearchParams, location: { search: '?shadows=0' }, window: {},
    matchMedia: () => ({ matches: false }), innerWidth: 1280, innerHeight: 720,
    performance: { now: () => 0 }, setInterval: () => 0,
    sfx: { setTempo() {}, tick() {} }
  });
  const geometry = (e) => {
    const m = e.render.meshInstances[0].mesh;
    return m.i.reduce((tris, _, i) => {
      if (i % 3 === 0) tris.push(m.i.slice(i, i + 3).map(k => [
        ...m.p.slice(k * 3, k * 3 + 3).map((v, axis) => e.position[axis] + v * e.scale[axis]), m.c[k * 4 + 3] / 255
      ]));
      return tris;
    }, []);
  };
  return { render, geometry, bounds };
}
const fighter = (x, z, kind = 'player', state = 'idle') => ({ x, z, kind, state });
const area = (t) => Math.abs((t[1][0] - t[0][0]) * (t[2][2] - t[0][2]) - (t[2][0] - t[0][0]) * (t[1][2] - t[0][2])) / 2;
function moments(tris) {
  let mass = 0, height = 0, footprint = 0;
  for (const t of tris) {
    const a = area(t), m = a * t.reduce((s, p) => s + p[3], 0) / 3;
    footprint += a; mass += m; height += m * t.reduce((s, p) => s + p[1], 0) / 3;
  }
  return { mass, height: height / mass, footprint };
}

test('软影跨台边：实际上传的三角形分别贴街面与台面，含各体型、倒地及台角', () => {
  const r = renderer(), [x0, x1, z0, z1] = r.bounds;
  for (const kind of ['player', 'apo', 'baozugong', 'lionhead']) for (const state of ['idle', 'down', 'dead']) {
    for (const [x, z] of [[0, 40.5], [0, z0], [0, z1], [x0, 46], [x1, 46], [x0, z0], [x1, z1]]) {
      const tris = r.geometry(r.render([fighter(x, z, kind, state)])[0]);
      let street = 0, ring = 0;
      for (const t of tris) {
        if (area(t) < 1e-12) continue;
        // Interior barycentric samples avoid ambiguity on the vertical step itself.
        for (const weights of [[1/3, 1/3, 1/3], [.8, .1, .1], [.1, .8, .1], [.1, .1, .8]]) {
          const p = [0, 1, 2, 3].map(axis => t.reduce((s, v, k) => s + v[axis] * weights[k], 0));
          if (p[3] < .001) continue;
          const inside = p[0] > x0 && p[0] < x1 && p[2] > z0 && p[2] < z1;
          if (inside) ring++; else street++;
          const expected = inside ? .075 : .014;
          assert.ok(Math.abs(p[1] - expected) < 1e-7, `${kind}/${state} centre=(${x},${z}): shadow y=${p[1].toFixed(3)} at (${p[0].toFixed(3)},${p[2].toFixed(3)}), receiver requires ${expected}`);
        }
      }
      assert.ok(street > 0 && ring > 0, 'sample must actually straddle the ring');
    }
  }
});

test('软影慢速过台边：高度矩连续，足印与透明度总量守恒', () => {
  const r = renderer(), [, , z0, z1] = r.bounds;
  for (const kind of ['player', 'baozugong', 'lionhead']) for (const state of ['idle', 'down']) {
    const sample = z => moments(r.geometry(r.render([fighter(0, z, kind, state)])[0]));
    const base = sample(38);
    for (const edge of [z0, z1]) {
      const before = sample(edge - .00001), after = sample(edge + .00001);
      assert.ok(Math.abs(after.height - before.height) < .0001, `${kind}/${state} at z=${edge}: 0.00002 m movement jumps shadow by ${Math.abs(after.height - before.height).toFixed(6)} m`);
      for (let i = -20; i <= 20; i++) {
        const m = sample(edge + i * .1);
        assert.ok(Math.abs(m.footprint / base.footprint - 1) < 1e-7, 'clipping must neither lose nor double the shadow footprint');
        assert.ok(Math.abs(m.mass / base.mass - 1) < .01, 'clipping must preserve integrated opacity within 1% (8-bit vertex alpha)');
      }
    }
  }
});

test('同屏软影独立，停下、换体型、倒地及影子池重用后仍保留各自足印', () => {
  const r = renderer();
  const people = [fighter(0, 40.5), fighter(1, 47, 'baozugong', 'down')];
  const alone = people.map(p => JSON.stringify(r.geometry(r.render([p])[0])));
  for (const order of [people, people.slice().reverse(), people]) {
    const blobs = r.render(order);
    order.forEach((p, i) => assert.equal(JSON.stringify(r.geometry(blobs[i])), alone[people.indexOf(p)], 'one fighter changed another shadow'));
  }
  assert.equal(r.render([people[0]]).length, 1, 'unused pooled shadows must be hidden');
});
