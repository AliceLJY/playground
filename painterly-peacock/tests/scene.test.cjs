// Structure, materials, colours and budget from SPEC.md, checked on the real scene graph.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const peacock = import('../src/peacock.js');
const core = import('../src/core.js');
const three = import('three');

async function build(scene = 'display') {
  const { buildPeacock, buildStage } = await peacock, C = await core;
  const bird = buildPeacock(), stage = buildStage(), sim = C.createSim({ seed: 7, aspect: 1.6 });
  C.playScene(sim, scene); bird.update(sim.state.pose);
  const meshes = []; for (const r of [bird.root, stage.group]) r.traverse(m => { if (m.isMesh) meshes.push(m); });
  return { bird, stage, sim, meshes };
}
const tris = (m) => ((m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3) * (m.isInstancedMesh ? m.count : 1);

test('C1 every mesh has a role from the list, and every listed role is used', async () => {
  const { ROLES } = await peacock, { meshes } = await build();
  const used = new Set();
  for (const m of meshes) { assert.ok(ROLES[m.userData.role], `${m.name}: role "${m.userData.role}" is not in ROLES`); used.add(m.userData.role); }
  for (const role of Object.keys(ROLES)) assert.ok(used.has(role), `ROLES lists "${role}" but nothing uses it`);
});

test('C2 nothing is loaded from outside: no loaders, textures, image files or URLs in the source', () => {
  for (const f of fs.readdirSync(path.join(root, 'src'))) {
    const src = fs.readFileSync(path.join(root, 'src', f), 'utf8');
    assert.ok(!/Loader\b|TextureLoader|GLTF|OBJLoader|new Image\(|\.(png|jpe?g|webp|gif|glb|gltf|hdr|ktx2?|mp3|ogg|wav)\b|fetch\(|https?:\/\//i.test(src), `${f} pulls in an external asset`);
  }
});

test('C3 budget: ≤ 20 objects, ≤ 40 k triangles, estimated draws (scene + shadow pass) ≤ 30', async () => {
  const { meshes } = await build();
  const total = meshes.reduce((a, m) => a + tris(m), 0);
  assert.ok(meshes.length <= 20, `${meshes.length} objects`);
  assert.ok(total <= 40_000, `${total} triangles`);
  const casters = meshes.filter(m => m.castShadow).length;
  assert.ok(meshes.length + casters <= 30, `≈ ${meshes.length + casters} draws`);
});

test('C4 colours come from vertex colours, never instanceColor (which renders white)', async () => {
  const { meshes } = await build();
  for (const m of meshes) {
    assert.ok(!m.instanceColor, `${m.name} uses instanceColor`);
    if (['ground-shadow', 'paper'].includes(m.userData.role)) continue;
    assert.ok(m.material.vertexColors && m.geometry.attributes.color, `${m.name} has no vertex colours`);
  }
  const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  assert.ok(!/setColorAt\(|\.instanceColor\s*=/.test(main + fs.readFileSync(path.join(root, 'src/peacock.js'), 'utf8')), 'source sets instance colours');
});

test('C5 deep teal and dark gold survive the tone mapping: Neutral (not ACES), and the lit palette keeps its colour', async () => {
  const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  assert.match(main, /toneMapping\s*=\s*THREE\.NeutralToneMapping/);
  assert.ok(!/ACESFilmicToneMapping|AgXToneMapping/.test(main), 'a desaturating tone mapping is used');
  const { PALETTE } = await peacock, { Color } = await three;
  // three.js NeutralToneMapping (Khronos PBR Neutral), as in its shader chunk.
  const neutral = (c) => {
    let [r, g, b] = c; const x = Math.min(r, g, b), off = x < 0.08 ? x - 6.25 * x * x : 0.04; r -= off; g -= off; b -= off;
    const peak = Math.max(r, g, b), sc = 0.76; if (peak < sc) return [r, g, b];
    const d = 1 - sc, np = 1 - (d * d) / (peak + d - sc), k = np / peak; r *= k; g *= k; b *= k;
    const t = 1 - 1 / (0.15 * (peak - np) + 1); return [r + (np - r) * t, g + (np - g) * t, b + (np - b) * t];
  };
  const toSrgb = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
  const sat = (c) => { const mx = Math.max(...c), mn = Math.min(...c); return mx === 0 ? 0 : (mx - mn) / mx; };
  for (const key of ['teal', 'tealDeep', 'breast', 'vane', 'gold', 'eyeGold', 'eyeTeal']) {
    const lin = new Color(PALETTE[key]); const src = [lin.r, lin.g, lin.b];
    for (const light of [0.8, 1.6, 2.6]) {
      const out = neutral(src.map(v => v * light)).map(v => toSrgb(Math.max(0, Math.min(1, v))));
      const s0 = sat(src.map(toSrgb)), s1 = sat(out);
      assert.ok(s1 >= s0 * 0.75, `${key} at light ${light}: saturation ${s0.toFixed(2)} → ${s1.toFixed(2)}`);
      const hue = (c) => Math.atan2(Math.sqrt(3) * (c[1] - c[2]), 2 * c[0] - c[1] - c[2]);
      assert.ok(Math.abs(hue(out) - hue(src.map(toSrgb))) < 0.12, `${key} at light ${light}: hue shifted`);
    }
  }
  const ivory = new Color(PALETTE.ivory);
  assert.ok(ivory.r > ivory.g && ivory.g > ivory.b && ivory.b > 0.6, 'ground is a warm light ivory');
});

test('C6 one instance per feather id in the vane, shaft and eye meshes: picking an instance picks that feather', async () => {
  const { bird, sim } = await build('carrying');
  const { Matrix4, Vector3 } = await three, M = new Matrix4(), p = new Vector3();
  for (const name of ['vanes', 'shafts']) {
    const im = bird.parts[name]; assert.equal(im.count, sim.state.feathers.length);
    for (const f of sim.state.feathers) { im.getMatrixAt(f.id, M); p.setFromMatrixPosition(M); assert.ok(p.distanceTo(new Vector3(...f.quill)) < 1e-6, `${name} instance ${f.id} is not feather ${f.id}`); }
  }
  // A ray straight at a feather's eye hits that feather's instance.
  const { Raycaster } = await three, C = await core, ray = new Raycaster();
  for (const id of [0, 7, 13, 21]) {
    const s2 = C.createSim({ seed: 7, aspect: 1.6 }); C.playScene(s2, 'display'); bird.update(s2.state.pose);
    const f = s2.state.feathers[id], F = C.FEATHERS[id], e = f.quill.map((v, k) => v + f.dir[k] * F.length * F.eye);
    const n = C.norm(C.cross(f.side, f.dir)), from = C.add(e, C.scale(n, 2));
    ray.set(new Vector3(...from), new Vector3(...C.scale(n, -1)));
    const hit = ray.intersectObject(bird.parts.eyes, false)[0];
    assert.ok(hit && hit.instanceId === id, `ray at eye ${id} hit ${hit && hit.instanceId}`);
  }
});
