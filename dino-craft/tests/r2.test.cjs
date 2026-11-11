const test = require('node:test');
const assert = require('node:assert/strict');
let api;
test.before(async () => { api = await import('../src/core.mjs'); });

test('R2 spawn has a five-voxel vegetation clearing and an unobstructed six-voxel forward ray', () => {
  for (const seed of [46, 55, 64, 71, 91, 135, 731, 732, 9, 1001]) {
    const g = api.createGame(seed), p = g.p;
    assert.equal(api.rayBlock(g, p.x, p.y + 1.65, p.z, ...api.direction(p), 6), null, `seed ${seed} forward ray`);
    for (let x = Math.floor(p.x) - 5; x <= p.x + 5; x++) {
      for (let z = Math.floor(p.z) - 5; z <= p.z + 5; z++) {
        if (Math.hypot(x + .5 - p.x, z + .5 - p.z) > 5) continue;
        for (let y = g.k.height(x, z) + 1; y < 48; y++) {
          assert.ok(![5, 6].includes(g.block(x, y, z)), `seed ${seed} vegetation at ${x},${y},${z}`);
        }
      }
    }
  }
});

test('R2 real chunk faces carry repeating UVs and face-specific atlas tiles', () => {
  const g = api.createVoxelKernel(731);
  const edits = [[5, 38, 5, 1], [8, 38, 5, 5], [11, 38, 5, 6], [5, 38, 8, 8], [8, 38, 8, 7], [11, 38, 8, 3], [5, 38, 11, 4], [8, 38, 11, 9]];
  const m = g.mesh(0, 0, edits);
  assert.equal(m.uv?.length, m.position.length / 3 * 2, 'every rendered vertex needs texture UVs');
  assert.equal(m.tile?.length, m.position.length / 3, 'every rendered vertex needs an atlas tile');
  assert.ok(new Set(m.tile).size >= 9, 'grass and log end/side tiles must differ');
  assert.ok(Math.max(...m.uv) > 1, 'merged faces repeat the 16-pixel tile per voxel');
});

test('R2 vertex AO changes a real exposed face when a neighbouring voxel is added', () => {
  const k = api.createVoxelKernel(731);
  function face(m) {
    const values = [];
    for (let i = 0; i < m.position.length; i += 12) {
      const p = m.position.slice(i, i + 12);
      if ([1, 4, 7, 10].every(j => p[j] === 39) && Math.min(p[0], p[3], p[6], p[9]) === 5 && Math.min(p[2], p[5], p[8], p[11]) === 5) {
        values.push(...m.color.slice(i, i + 12));
      }
    }
    assert.equal(values.length, 12, 'probe top face actually occurred');
    return values;
  }
  const open = face(k.mesh(0, 0, [[5, 38, 5, 3]]));
  const corner = face(k.mesh(0, 0, [[5, 38, 5, 3], [4, 39, 5, 3], [5, 39, 4, 3]]));
  assert.ok(Math.min(...corner) < Math.min(...open) - .05, 'corner occluders must darken sampled vertices');
  assert.ok(Math.max(...corner) - Math.min(...corner) > .1, 'one face must have a corner gradient');
});

test('R2 an edit at a chunk corner also dirties the diagonally adjacent AO receiver', () => {
  const g = api.createGame();
  g.setBlock(15, 40, 15, 3);
  assert.ok(g.changed.some(([x,z]) => x === 1 && z === 1), 'corner AO receiver must rebuild');
});

test('R2 wandering ground creatures face their actual displacement', () => {
  const g = api.createGame();g.creatures.length = 0;
  const e = g.spawn('rex',g.p.x + 32,g.p.z + 12);
  const before = {x:e.x,z:e.z};api.update(g,{},.05);
  const dx=e.x-before.x,dz=e.z-before.z;
  assert.ok(Math.hypot(dx,dz) > .001, 'wandering motion actually occurred');
  assert.ok((Math.sin(e.yaw)*dx+Math.cos(e.yaw)*dz)/Math.hypot(dx,dz) > .99);
});
