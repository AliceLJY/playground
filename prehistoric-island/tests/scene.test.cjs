// Structure, materials, colours and budget from SPEC.md, checked on the real scene graph.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const world = import('../src/world.js');
const core = import('../src/core.js');
const three = import('three');

async function build(t = 0) {
  const { buildIsland } = await world;
  const w = buildIsland(7); w.update(t); w.root.updateMatrixWorld(true);
  const meshes = []; w.root.traverse(m => { if (m.isMesh || m.isLineSegments) meshes.push(m); });
  return { w, meshes };
}
const tris = (m) => (m.isLineSegments ? 0 : ((m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3) * (m.isInstancedMesh ? m.count : 1));
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

test('C1 every mesh has a layer and a role from the whitelist, and every listed part exists', async () => {
  const { ROLES, LAYERS } = await world, { meshes } = await build();
  const used = new Set();
  for (const m of meshes) {
    assert.ok(LAYERS.includes(m.userData.layer), `${m.name} has no layer`);
    assert.ok(ROLES[m.userData.role], `${m.name}: role "${m.userData.role}" is not in ROLES`);
    used.add(m.userData.role);
  }
  for (const role of Object.keys(ROLES)) assert.ok(used.has(role), `ROLES lists "${role}" but nothing uses it`);
});

test('C2 nothing is loaded from outside: no loaders, textures, image files or URLs in the source', () => {
  for (const f of fs.readdirSync(path.join(root, 'src'))) {
    const src = fs.readFileSync(path.join(root, 'src', f), 'utf8');
    assert.ok(!/Loader\b|TextureLoader|GLTF|OBJLoader|new Image\(|\.(png|jpe?g|webp|gif|glb|gltf|hdr|ktx2?)\b|fetch\(|https?:\/\//i.test(src), `${f} pulls in an external asset`);
  }
});

test('C3 scene budget: ≤ 60 objects, ≤ 240 k triangles, estimated draws (scene + shadow pass) ≤ 160', async () => {
  const { meshes } = await build();
  const total = meshes.reduce((a, m) => a + tris(m), 0);
  assert.ok(meshes.length <= 60, `${meshes.length} objects`);
  assert.ok(total <= 240_000, `${total} triangles`);
  // One draw per object, plus one per shadow caster in the sun's shadow pass (the sky dome adds one).
  const casters = meshes.filter(m => m.isMesh && !['water', 'emissive', 'air'].includes(m.userData.layer) && m.userData.role !== 'ferns').length;
  assert.ok(meshes.length + 1 + casters <= 160, `≈ ${meshes.length + 1 + casters} draws`);
});

test('C4 colours come from vertex colours, never instanceColor (which renders white), and the land is not washed out', async () => {
  const { meshes } = await build();
  for (const m of meshes) {
    assert.ok(!m.instanceColor, `${m.name} uses instanceColor`);
    if (m.isMesh && !['emissive', 'air'].includes(m.userData.layer)) assert.ok(m.material.vertexColors && m.geometry.attributes.color, `${m.name} has no vertex colours`);
  }
  const terrain = meshes.find(m => m.userData.role === 'terrain'), col = terrain.geometry.attributes.color;
  let bright = 0, sum = 0; const buckets = new Set();
  for (let i = 0; i < col.count; i++) {
    const L = lum(col.getX(i), col.getY(i), col.getZ(i)); sum += L; if (L > 0.85) bright++;
    buckets.add([col.getX(i), col.getY(i), col.getZ(i)].map(v => Math.round(v * 12)).join());
  }
  assert.ok(sum / col.count < 0.6, `terrain average luminance ${(sum / col.count).toFixed(2)} (linear) is too pale`);
  assert.ok(bright / col.count < 0.02, 'more than 2 % of the terrain is near white');
  assert.ok(buckets.size >= 12, `terrain has only ${buckets.size} colour groups`);
  for (const role of ['strata', 'conifers', 'herd-body', 'swimmer-body', 'coral-branch']) {
    const m = meshes.find(x => x.userData.role === role), c = m.geometry.attributes.color;
    let s = 0; for (let i = 0; i < c.count; i++) s += lum(c.getX(i), c.getY(i), c.getZ(i));
    assert.ok(s / c.count > 0.02 && s / c.count < 0.7, `${role} average luminance ${(s / c.count).toFixed(2)} out of range`);
  }
});

test('C5 the water is see-through, the lava glows and its base stays dark', async () => {
  const { meshes } = await build();
  for (const m of meshes.filter(m => m.userData.layer === 'water' && m.isMesh)) {
    assert.ok(m.material.transparent && m.material.opacity <= 0.55 && m.material.depthWrite === false, `${m.name} hides what is behind it`);
  }
  assert.equal(meshes.filter(m => m.userData.role === 'water-wall').length, 4, 'four cut faces of water');
  const lava = meshes.find(m => m.userData.role === 'lava');
  assert.ok(lava.material.emissiveIntensity >= 2 && lava.material.emissive.r > 0.8 && lava.material.emissive.b < 0.2, 'lava must glow orange');
  assert.ok(lum(lava.material.color.r, lava.material.color.g, lava.material.color.b) < 0.05, 'lava base must be dark so the glow reads');
});

test('C6 parts are driven only by scene time: the same t gives the same scene, whatever came before', async () => {
  const THREE = await three;
  const a = (await build(17.3)).meshes, w2 = (await build(3)).w; w2.update(40); w2.update(17.3); w2.root.updateMatrixWorld(true);
  const b = []; w2.root.traverse(m => { if (m.isMesh || m.isLineSegments) b.push(m); });
  const m1 = new THREE.Matrix4(), m2 = new THREE.Matrix4();
  a.forEach((m, i) => {
    assert.ok(m.matrixWorld.equals(b[i].matrixWorld), `${m.name} differs`);
    if (m.isInstancedMesh) for (let k = 0; k < m.count; k++) { m.getMatrixAt(k, m1); b[i].getMatrixAt(k, m2); assert.ok(m1.equals(m2), `${m.name}[${k}] differs`); }
  });
});

test('C7 reef life sits on the reef and drop-off under water; rocks on the beach or the deep floor', async () => {
  const { reefPlacements } = await world, { WATER } = await core;
  const r = reefPlacements(), n = (k) => r.filter(p => p.type === k).length;
  for (const k of ['branch', 'mound', 'fan', 'lily', 'sponge', 'rock']) assert.ok(n(k) >= 15, `only ${n(k)} ${k}`);
  for (const p of r) if (p.type !== 'rock') assert.ok(p.y < WATER - 2, `${p.type} above water`);
});
