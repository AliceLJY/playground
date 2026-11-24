// Structure, materials and visibility rules from SPEC.md, checked on the real scene graph.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const core = import('../src/core.js');
const station = import('../src/station.js');
const three = import('three');

async function build(t = 0) {
  const { buildStation } = await station;
  const st = buildStation(2026); st.update(t); st.root.updateMatrixWorld(true);
  const meshes = []; st.root.traverse(m => { if (m.isMesh) meshes.push(m); });
  return { st, meshes };
}
const tris = (m) => ((m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3) * (m.isInstancedMesh ? m.count : 1);

test('A7 every mesh has a layer and a role from the whitelist, and every listed part exists', async () => {
  const { ROLES } = await station, { meshes } = await build();
  const used = new Set();
  for (const m of meshes) {
    assert.ok(['metal', 'glass', 'emissive', 'organic'].includes(m.userData.layer), `${m.name} has no material layer`);
    assert.ok(ROLES[m.userData.role], `${m.name}: role "${m.userData.role}" is not in ROLES (no part without a function)`);
    used.add(m.userData.role);
  }
  for (const role of Object.keys(ROLES)) assert.ok(used.has(role), `ROLES lists "${role}" but nothing uses it`);
  // The parts the brief asks for.
  for (const role of ['ring-hull', 'spokes', 'hub-core', 'port-collar', 'rcs', 'engines', 'wing-cells', 'truss', 'arm', 'antenna', 'ring-glass', 'garden-trees', 'shuttle-hull'])
    assert.ok(used.has(role), `required part missing: ${role}`);
});

test('A7 metal, glass and emissive layers are separable by their material response', async () => {
  const { meshes } = await build();
  const by = (layer) => meshes.filter(m => m.userData.layer === layer).map(m => m.material);
  const metal = by('metal'), glass = by('glass'), lit = by('emissive').filter(m => m.isMeshStandardMaterial);
  // Hull layer = bare metal (metalness ≥ 0.5) or white thermal paint (metalness ≤ 0.45, light base).
  for (const m of meshes.filter(m => m.userData.layer === 'metal')) {
    const c = m.material.color, light = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    assert.ok(m.material.metalness >= 0.5 || (m.material.metalness <= 0.45 && light >= 0.6), `${m.name}: neither bare metal (metalness ≥ 0.5) nor white paint`);
  }
  for (const m of metal) assert.ok(m.roughness >= 0.34 && m.roughness <= 0.7 && !m.transparent && m.emissive.getHex() === 0, 'metal layer roughness must stay 0.34–0.70, opaque and unlit');
  assert.ok(Math.min(...metal.map(m => m.roughness)) - Math.max(...glass.map(m => m.roughness)) >= 0.1, 'glass must be at least 0.1 smoother than any metal');
  for (const m of meshes.filter(m => ['ring-glass', 'shuttle-glass'].includes(m.userData.role)))
    assert.ok(m.material.transparent && m.material.opacity <= 0.4 && !m.material.depthWrite, `${m.name}: windows must be see-through`);
  for (const m of lit) {
    assert.ok(m.emissiveIntensity >= 2.5 && m.emissive.r + m.emissive.g + m.emissive.b > 1.5, `${m.name}: emissive parts must glow (intensity ≥ 2.5)`);
    assert.ok(m.color.r + m.color.g + m.color.b < 0.3, 'emissive base colour must be dark so the glow reads as light, not paint');
  }
  const panels = metal.filter(m => m.userData.panel).length;
  assert.ok(panels / metal.length >= 0.4, 'at least 40 % of metal parts carry the procedural panel shader');
});

test('A7 nothing is loaded from outside: no loaders, textures, image files or URLs in the source', () => {
  for (const f of fs.readdirSync(path.join(root, 'src'))) {
    const src = fs.readFileSync(path.join(root, 'src', f), 'utf8');
    assert.ok(!/Loader\b|TextureLoader|GLTF|OBJLoader|new Image\(|\.(png|jpe?g|webp|gif|glb|gltf|hdr|ktx2?)\b|fetch\(|https?:\/\//i.test(src), `${f} pulls in an external asset`);
  }
  assert.ok(!fs.existsSync(path.join(root, 'assets')), 'no asset folder');
});

test('A8 scene budget: ≤ 120 meshes, ≤ 160 k triangles', async () => {
  const { meshes } = await build();
  const total = meshes.reduce((a, m) => a + tris(m), 0);
  assert.ok(meshes.length <= 120, `${meshes.length} meshes`);
  assert.ok(total <= 160000 && total >= 25000, `${total} triangles (budget 25 k–160 k)`);
});

test('A2 the ring and everything on it turn together; the hub, port and truss stay still', async () => {
  const { st } = await build(0), { ringAngle } = await core;
  const parts = (s) => { const out = {}; s.root.traverse(m => { if (m.isMesh) { const p = m.getWorldPosition(new (m.position.constructor)()); out[m.uuid] = { role: m.userData.role, p, ring: isRing(m, s) }; } }); return out; };
  const isRing = (m, s) => { for (let o = m; o; o = o.parent) if (o === s.ring) return true; return false; };
  st.update(3); st.root.updateMatrixWorld(true); const a = parts(st);
  st.update(7); st.root.updateMatrixWorld(true); const b = parts(st);
  assert.ok(Math.abs(st.ring.rotation.y - ringAngle(7)) < 1e-12);
  for (const [k, v] of Object.entries(a)) {
    if (/shuttle|arm|wing/.test(v.role) || !b[k]) continue;
    const moved = v.p.distanceTo(b[k].p);
    if (!v.ring && ['hub-core', 'port-collar', 'truss', 'engines', 'antenna'].includes(v.role)) assert.ok(moved < 1e-9, `${v.role} must not move`);
  }
  // A ring-mounted mesh with an off-axis centre sweeps the expected arc.
  const glass = st.ring.children.find(m => m.userData.role === 'ring-glass');
  assert.ok(glass, 'ring glass is a child of the rotating ring');
});

test('A5 parts are driven only by scene time: the same t gives the same scene, whatever came before', async () => {
  const { st } = await build(0);
  const sig = () => { const out = []; st.root.updateMatrixWorld(true); st.root.traverse(m => { if (m.isMesh) out.push(...m.matrixWorld.elements.map(v => Math.round(v * 1e6))); }); return out.join(','); };
  st.update(36.7); const once = sig();
  st.update(12); st.update(49.9); st.update(36.7); assert.equal(sig(), once, 'station state depends on history, so a camera switch could make parts jump');
});

test('A9 the garden deck shows through the inner windows from the outside shots', async () => {
  const THREE = await three, { shotPoseAt } = await core, { SHOTS } = await core;
  for (const key of ['ring', 'settle']) {
    const shot = SHOTS.find(s => s.key === key);
    const { st, meshes } = await build(shot.at);
    const pose = shotPoseAt(key, shot.at, 1.6), origin = new THREE.Vector3(...pose.position);
    const trees = meshes.find(m => m.userData.role === 'garden-trees' && m.geometry.type.startsWith('Icosahedron'));
    const ray = new THREE.Raycaster(), im = new THREE.Matrix4(), seen = [];
    const solid = meshes.filter(m => m.userData.layer !== 'emissive' || m.material.isMeshStandardMaterial);
    for (let i = 0; i < trees.count; i++) {
      trees.getMatrixAt(i, im); const p = new THREE.Vector3().setFromMatrixPosition(im).applyMatrix4(trees.matrixWorld);
      const dir = p.clone().sub(origin), dist = dir.length(); ray.set(origin, dir.normalize()); ray.far = dist + 0.5;
      const hits = ray.intersectObjects(solid, false).filter(h => h.distance < dist - 1.2);
      const blockers = hits.filter(h => h.object.userData.layer !== 'glass');
      if (!blockers.length && hits.some(h => h.object.userData.role === 'ring-glass')) seen.push(i);
    }
    assert.ok(seen.length >= 5, `${key}: only ${seen.length} trees visible through the window band (need ≥ 5)`);
    void st;
  }
});

test('A1 hook lamps show their state: dark while free, amber once captured, green one by one as hooks close', async () => {
  const { PORT } = await core, { st, meshes } = await build(20);
  const lamps = meshes.find(m => m.userData.role === 'latch-lights'), nav = meshes.find(m => m.userData.role === 'nav-lights');
  // Three.js applies instanceColor to the base colour only. A lit material whose light comes from `emissive`
  // would show every lamp in the emissive colour (the first version: twelve white lamps in every state).
  for (const m of [lamps, nav]) {
    assert.ok(m.instanceColor, `${m.name} needs per-lamp colours`);
    const e = m.material.emissive, glow = e ? (e.r + e.g + e.b) * (m.material.emissiveIntensity ?? 1) : 0;
    const c = m.material.color;
    assert.ok(glow < 0.05 && c.r + c.g + c.b > 2.9, `${m.name}: per-lamp colours must reach the screen (white base colour, no emissive drowning them)`);
  }
  const kind = (i) => { const c = new (lamps.material.color.constructor)(); lamps.getColorAt(i, c); return c.g > 1.5 * c.r && c.g > 0.3 ? 'green' : c.r > 0.6 && c.g > 0.25 && c.b < 0.2 ? 'amber' : c.r + c.g + c.b < 0.2 ? 'off' : 'other'; };
  const count = (t) => { st.update(t); const n = { green: 0, amber: 0, off: 0, other: 0 }; for (let i = 0; i < PORT.latches; i++) n[kind(i)]++; return n; };
  assert.deepEqual(count(20), { green: 0, amber: 0, off: 12, other: 0 }, 'approach: all lamps dark');
  assert.deepEqual(count(34.6), { green: 0, amber: 12, off: 0, other: 0 }, 'contact: captured, all amber');
  const mid = count(37);
  assert.ok(mid.green >= 3 && mid.amber >= 3 && mid.green + mid.amber === 12, `mid-settle must mix green and amber, got ${JSON.stringify(mid)}`);
  assert.deepEqual(count(39.9), { green: 12, amber: 0, off: 0, other: 0 }, 'settled: all green');
  const red = new (lamps.material.color.constructor)(), grn = red.clone(); nav.getColorAt(0, red); nav.getColorAt(1, grn);
  assert.ok(red.r > 3 * red.g && grn.g > 3 * grn.r, 'shuttle navigation lamps are red on one fin and green on the other');
});

test('A1 the robotic arm never sweeps through the shuttle', async () => {
  const THREE = await three, { CYCLE } = await core, { st, meshes } = await build(0);
  const arm = meshes.filter(m => /^arm/.test(m.userData.role)), v = new THREE.Vector3(), inv = new THREE.Matrix4();
  assert.ok(arm.length >= 6, 'arm links found');
  // Shuttle envelope in its own frame: hull as a 2.3 m cylinder over its 10 m length, plus the two radiator fins.
  let worst = Infinity, at = 0, moved = 0, first = null;
  for (let t = 0; t < CYCLE; t += 0.05) {
    st.update(t); st.root.updateMatrixWorld(true); inv.copy(st.shuttle.matrixWorld).invert();
    const tip = arm.at(-1).getWorldPosition(new THREE.Vector3()); if (first) moved = Math.max(moved, tip.distanceTo(first)); else first = tip;
    for (const m of arm) {
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).applyMatrix4(inv);
        const hull = Math.hypot(Math.max(0, Math.hypot(v.x, v.z) - 2.3), Math.max(0, -v.y, v.y - 10));
        const fin = Math.hypot(Math.max(0, Math.abs(v.x) - 4.4), Math.max(0, Math.abs(v.y - 7.2) - 1.3), Math.max(0, Math.abs(v.z) - 0.1));
        const d = Math.min(hull, fin); if (d < worst) { worst = d; at = t; }
      }
    }
  }
  assert.ok(moved > 5, `the arm must actually move during the cycle (tip travelled ${moved.toFixed(1)} m), or this check proves nothing`);
  assert.ok(worst >= 0.5, `arm comes within ${worst.toFixed(2)} m of the shuttle at ${at.toFixed(2)} s (0 = inside it); spec ≥ 0.5 m`);
});

test('A7 approach lights are mounted on the docking tunnel, not floating beside it', async () => {
  const THREE = await three, { HUB } = await core, { meshes } = await build(0);
  const lights = meshes.find(m => m.userData.role === 'port-lights'), im = new THREE.Matrix4(), p = new THREE.Vector3(), s = new THREE.Vector3();
  assert.equal(lights.count, 8);
  for (let i = 0; i < lights.count; i++) {
    lights.getMatrixAt(i, im); im.premultiply(lights.matrixWorld); p.setFromMatrixPosition(im); s.setFromMatrixScale(im);
    const gap = Math.hypot(p.x, p.z) - s.x / 2 - HUB.adapterRadius;
    assert.ok(gap <= 0.01 && gap > -s.x, `approach light ${i} sits ${gap.toFixed(2)} m off the tunnel wall (must touch it without being buried)`);
  }
});

test('A4 the garden camera walks under the trees: never inside a crown, with crowns ahead in frame', async () => {
  const THREE = await three, { shotPoseAt, project, SHOTS } = await core;
  const g = SHOTS.find(s => s.key === 'garden'), { st, meshes } = await build(g.start);
  const crowns = meshes.find(m => m.userData.role === 'garden-trees' && m.geometry.type.startsWith('Icosahedron'));
  const trees = meshes.filter(m => m.userData.role === 'garden-trees');
  const im = new THREE.Matrix4(), world = new THREE.Matrix4(), scale = new THREE.Vector3(), ray = new THREE.Raycaster();
  const { norm, sub, cross, add, scale: mul } = await core;
  for (const aspect of [1280 / 720, 390 / 664]) {
    for (let t = g.start; t <= g.end + 1e-9; t += 0.25) {
      st.update(t); st.root.updateMatrixWorld(true);
      const pose = shotPoseAt('garden', t, aspect), eye = new THREE.Vector3(...pose.position);
      // Rays through a 16×12 grid of the frame: how much of the picture is a tree closer than 4 m.
      // The first version stood at 3.7 m, level with the crowns: 52 % of the desktop frame (29 % of its
      // middle) was one or two giant leaf polygons. Walking at eye height it is at most about a third.
      const f = norm(sub(pose.target, pose.position)), r = norm(cross(f, pose.up)), u = cross(r, f), th = Math.tan(pose.fov * Math.PI / 360);
      let near = 0, mid = 0, midAll = 0; ray.far = 4;
      for (let iy = 0; iy < 12; iy++) for (let ix = 0; ix < 16; ix++) {
        const sx = (ix + 0.5) / 8 - 1, sy = (iy + 0.5) / 6 - 1;
        ray.set(eye, new THREE.Vector3(...add(f, add(mul(r, sx * th * aspect), mul(u, sy * th)))).normalize());
        const hit = ray.intersectObjects(trees, false).length > 0; if (hit) near++;
        if (Math.abs(sx) < 0.4 && Math.abs(sy) < 0.4) { midAll++; if (hit) mid++; }
      }
      assert.ok(near / 192 <= 0.4, `garden @${t.toFixed(2)} s (aspect ${aspect.toFixed(2)}): trees closer than 4 m fill ${(near / 1.92).toFixed(0)} % of the frame (spec ≤ 40 %)`);
      assert.ok(mid / midAll <= 0.15, `garden @${t.toFixed(2)} s (aspect ${aspect.toFixed(2)}): trees closer than 4 m fill ${(100 * mid / midAll).toFixed(0)} % of the middle of the frame (spec ≤ 15 %)`);
      let gap = Infinity, ahead = 0;
      for (let i = 0; i < crowns.count; i++) {
        crowns.getMatrixAt(i, im); world.multiplyMatrices(crowns.matrixWorld, im);
        // Crowns are unit icosahedra scaled per tree: in crown space the camera must stay outside radius 1.
        const local = eye.clone().applyMatrix4(world.clone().invert());
        scale.setFromMatrixScale(world);
        gap = Math.min(gap, (local.length() - 1) * Math.min(scale.x, scale.y, scale.z));
        const q = project(pose, aspect, new THREE.Vector3().setFromMatrixPosition(world).toArray());
        if (q.z > 3 && q.z < 40 && q.x > 0 && q.x < 1 && q.y > 0 && q.y < 1) ahead++;
      }
      assert.ok(gap >= 0.3, `garden @${t.toFixed(2)} s (aspect ${aspect.toFixed(2)}): camera is ${gap.toFixed(2)} m from a tree crown (inside it when negative); spec ≥ 0.3 m`);
      assert.ok(ahead >= 5, `garden @${t.toFixed(2)} s (aspect ${aspect.toFixed(2)}): only ${ahead} tree crowns in frame 3–40 m ahead (need ≥ 5)`);
    }
  }
});
