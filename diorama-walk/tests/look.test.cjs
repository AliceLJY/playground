// Logic checks for the dressed outside (src/dress.js). Run in this folder: node --test tests/*.test.cjs
// Pixels (textures, signs, glows) are judged by eye in the side-by-side pictures; here only what can be computed.
const test = require('node:test');
const assert = require('node:assert');
const load = () => Promise.all([import('../src/core.js'), import('../src/dress.js')]);

// SPEC 外观 L1: two faces of different materials lying in one plane and facing the same way fight in the depth buffer and
// show as broken stripes (the old eave: the front's upper band ran up into the roof slab). Calibrated on the boxes as drawn
// before this change, which must fail.
test('外观 L1: no two outside faces of different materials share a plane (no stripes along the eave)', async () => {
  const [C, D] = await load();
  const before = D.coplanarFaces(C.visualBoxes());
  assert.ok(Object.keys(before).some((k) => k.includes('storeFacade:upper / storeRoof')), 'calibration: the old boxes must show the eave clash, got ' + JSON.stringify(before));
  const now = D.coplanarFaces(D.adjustBoxes(C.visualBoxes()).concat(D.dressBoxes()));
  assert.deepStrictEqual(now, {}, 'coplanar outside faces: ' + JSON.stringify(now));
});

// The dressing is visual only: nothing a walker can reach sticks out of a wall into the walkable space below head height.
test('外观 L2: dressing below 2.3 m stays within 0.2 m of the front or inside a solid footprint', async () => {
  const [C, D] = await load();
  const solids = C.solids();
  const inSolid = (b) => solids.some((s) => b.x0 >= s.x0 - 1e-6 && b.x1 <= s.x1 + 1e-6 && b.z0 >= s.z0 - 1e-6 && b.z1 <= s.z1 + 1e-6);
  const { drainGeometries } = await import('../src/look.js');
  const pipes = drainGeometries().map((g, i) => {
    g.computeBoundingBox(); const { min, max } = g.boundingBox;
    return { mat: 'pipe:' + i, x0: min.x, y0: min.y, z0: min.z, x1: max.x, y1: max.y, z1: max.z };
  });
  assert.ok(pipes.length > 0, 'L2 must sample the rendered drainpipes');
  const bad = D.dressBoxes().concat(pipes).filter((b) => b.y0 < 2.3 && b.y1 > C.SIDEWALK_H + 0.02 && b.z1 > C.FACADE_Z + 0.2 + 1e-6 && !inSolid(b));
  assert.deepStrictEqual(bad, [], 'dressing reaching into the walkable space: ' + JSON.stringify(bad));
});

test('外观 L3: the solids and the drawn boxes the game logic uses are unchanged by the dressing', async () => {
  const [C, D] = await load();
  const V = C.visualBoxes(), A = D.adjustBoxes(V);
  // only the eave band is trimmed and the lamp, pole and sign lettering are redrawn; every other box is the same object
  const changed = A.filter((b) => !V.includes(b)).map((b) => b.mat);
  assert.deepStrictEqual([...new Set(changed)], ['storeFacade:upper']);
  assert.deepStrictEqual([...new Set(V.filter((b) => !A.includes(b) && b.mat !== 'storeFacade:upper').map((b) => b.mat))].sort(), ['lamp', 'pole', 'sign2Text', 'signText']);
});

test('surface shader smoothstep constant edges are strictly increasing', async () => {
  const THREE = await import('three'), { surface, K } = await import('../src/look.js');
  const mat = surface(new THREE.MeshPhongMaterial(), K.BRICK);
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.phong.vertexShader, fragmentShader: THREE.ShaderLib.phong.fragmentShader };
  mat.onBeforeCompile(shader);
  const edges = [...shader.fragmentShader.matchAll(/smoothstep\(\s*([+-]?[\d.]+)\s*,\s*([+-]?[\d.]+)\s*,/g)];
  assert.ok(edges.length > 0, 'must inspect the generated surface shader');
  for (const [call, a, b] of edges) assert.ok(Number(a) < Number(b), 'undefined GLSL edges: ' + call);
});
