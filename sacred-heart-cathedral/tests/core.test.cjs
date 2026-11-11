// 石室圣心大教堂：平面、柱网、碰撞、视点与操作方式的逻辑测试。运行：node --test tests/*.test.cjs
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path'), { pathToFileURL } = require('node:url');
const load = () => import(pathToFileURL(path.join(__dirname, '../src/core.js')).href);
const walk = (C, p, dx, dz, n = 600) => { for (let i = 0; i < n; i++) p = C.moveWalker(p.x, p.z, dx, dz); return p; };

test('平面：拉丁十字，总长约 77.2、最宽约 32.9，朝南的一头是双塔', async () => {
  const C = await load();
  const len = (C.Z_FRONT + 0.6) - (C.Z_APSE - C.APSE_R - 0.6), wid = (C.TRANS + 0.43) * 2;
  assert.ok(Math.abs(len - 77.17) < 0.6, `总长 ${len.toFixed(2)} 应接近 77.17`); assert.ok(Math.abs(wid - 32.85) < 0.3, `最宽 ${wid.toFixed(2)} 应接近 32.85`);
  assert.equal(C.TOWER.h, 58.5); assert.equal(C.H.vault, 28.2); assert.ok(C.TOWER.z0 > 0 && C.Z_APSE < 0, '塔在南（+Z），后殿在北（-Z）');
  assert.ok(C.inside(0, 20) && C.inside(15, -12) && C.inside(0, -36) && C.inside(10, 34), '中殿、横厅端头、后殿、塔基都在里面');
  assert.ok(!C.inside(15, 20) && !C.inside(0, 40) && !C.inside(8, -37), '侧墙外、正门外、后殿外角都在外面');
});

test('柱：左右各十根束柱，十字交叉四根最粗，都在室内', async () => {
  const C = await load();
  for (const s of [-1, 1]) assert.equal(C.PIERS.filter(p => Math.sign(p.x) === s).length, 10, '每侧应有十根');
  assert.equal(C.PIERS.filter(p => p.kind === 'cross').length, 4); assert.ok(C.PIERS.every(p => C.inside(p.x, p.z) && Math.abs(Math.abs(p.x) - C.AX) < 1e-9));
  assert.ok(C.PIERS.filter(p => p.kind === 'cross').every(p => p.r > C.PIERS.find(q => q.kind === 'nave').r));
  for (const p of C.PIERS) assert.equal(C.blocked(p.x, p.z), 'pier', `柱 (${p.x},${p.z}) 中心应被挡`);
});

test('走路：墙挡得住，正面三座门和两扇边门走得通', async () => {
  const C = await load();
  let p = walk(C, { x: 11.8, z: C.naveMid(4) }, 0.1, 0);
  assert.ok(p.x < C.CHAP - C.WALL + 1e-6, `不该穿过小礼拜堂外墙，停在 x=${p.x.toFixed(2)}`); assert.ok(p.x > C.CHAP - C.WALL - 0.4, `应当能贴到墙边，停在 x=${p.x.toFixed(2)}`);
  p = walk(C, { x: 0, z: 60 }, 0, -0.1, 400); assert.ok(C.inside(p.x, p.z) && p.z < 30, `应当从正门走进中殿，停在 z=${p.z.toFixed(2)}`);
  for (const s of [-1, 1]) { p = walk(C, { x: s * C.TOWER.cx, z: 50 }, 0, -0.1, 200); assert.ok(C.inside(p.x, p.z) && p.z < 37, `${s > 0 ? '东' : '西'}侧门应能走进塔基，停在 z=${p.z.toFixed(2)}`); }
  p = walk(C, { x: 4.5, z: 60 }, 0, -0.1, 400); assert.ok(!C.inside(p.x, p.z), '门洞旁边的墙走不进去');
  for (const s of [-1, 1]) { p = walk(C, { x: s * 12, z: C.naveMid(C.SIDE_DOOR_BAY) }, s * 0.1, 0, 200); assert.ok(Math.abs(p.x) > C.CHAP + 3, `${s > 0 ? '东' : '西'}边门应当能走出去，停在 x=${p.x.toFixed(2)}`); }
});

test('走路：长椅、祭台、隔墙、飞扶壁墩都挡人；圣所三级台阶、门前台阶有高差', async () => {
  const C = await load();
  assert.equal(C.blocked(C.PEWS[0].x, C.PEWS[0].z), 'pew'); assert.equal(C.blocked(C.ALTAR.x, C.ALTAR.z), 'altar'); assert.equal(C.blocked(12, C.naveLine(3)), 'chapel-wall');
  assert.equal(C.blocked(C.BUTTRESS[0].x, C.BUTTRESS[0].z), 'buttress'); assert.equal(C.blocked(30, C.YARD.z1), 'fence'); assert.equal(C.blocked(0, C.YARD.z1), null, '大门开着');
  const p = walk(C, { x: 0, z: 30 }, 0, -0.1); assert.ok(p.z < -20 && p.z > C.ALTAR.z, `沿中间走道一直走，上台阶后停在祭台前，z=${p.z.toFixed(2)}`);
  assert.equal(C.groundY(0, 10), 0); assert.equal(C.groundY(0, -25), C.SANCT.h); assert.ok(C.groundY(0, -19.2) > 0 && C.groundY(0, -19.2) < C.SANCT.h); assert.equal(C.groundY(8, -25), 0, '侧廊不抬高');
  assert.equal(C.groundY(0, 60), C.GROUND); assert.equal(C.groundY(0, 38.4), 0); const mid = C.groundY(0, 40); assert.ok(mid < 0 && mid > C.GROUND, `台阶中段高度 ${mid}`);
  let last = 1; for (let z = 38; z < 43; z += 0.25) { const y = C.groundY(0, z); assert.ok(y <= last + 1e-9, '台阶只降不升'); last = y; }
});

test('视点：不少于 14 个，位置都站得住，里外标得对', async () => {
  const C = await load();
  assert.ok(C.VIEWS.length >= 14, `视点 ${C.VIEWS.length} 个`); assert.equal(new Set(C.VIEWS.map(v => v.id)).size, C.VIEWS.length, '视点 id 不重复');
  assert.ok(C.VIEWS.filter(v => v.zone === 'out').length >= 5 && C.VIEWS.filter(v => v.zone === 'in').length >= 5);
  for (const v of C.VIEWS) {
    const [x, y, z] = v.pos, isIn = C.inside(x, z) && y < 29.6;
    assert.equal(isIn ? 'in' : 'out', v.zone, `${v.id} 标的是 ${v.zone}，位置实际在${isIn ? '里' : '外'}`);
    assert.ok(v.text.length > 15 && v.cn && v.en, `${v.id} 要有说明文字`);
    if (v.mode === 'walk') { assert.equal(C.blocked(x, z), null, `${v.id} 的落脚点被 ${C.blocked(x, z)} 挡住`); assert.ok(Math.abs(y - C.groundY(x, z) - C.EYE) < 1e-9, `${v.id} 的高度应当是脚下地面加眼高`); }
    if (v.zone === 'out') assert.ok(!C.BUILDINGS.some(b => Math.abs(x - b.x) < b.hx && Math.abs(z - b.z) < b.hz && y < b.h), `${v.id} 的机位埋在房子里`);
  }
});

test('操作方式：点视点和切模式之后落在哪', async () => {
  const C = await load(); let s = { mode: 'orbit', zone: 'out', view: 'whole', light: 'morning' };
  s = C.applyView(s, 'nave'); assert.deepEqual([s.mode, s.zone, s.view], ['walk', 'in', 'nave']);
  s = C.applyView(s, 'west-glass'); assert.equal(s.light, 'evening', '傍晚的彩窗顺带切到傍晚');
  s = C.applyView(s, 'vault'); assert.equal(s.mode, 'fly'); assert.equal(s.light, 'evening', '没指定光的视点不改光');
  s = C.applyMode(s, 'orbit'); assert.deepEqual([s.mode, s.zone, s.view], ['orbit', 'out', 'whole'], '在里面切轨道会被带到外面全景');
  assert.deepEqual(C.applyMode(s, 'swim'), s, '不认识的模式不动'); assert.deepEqual(C.applyView(s, 'nope'), s);
});

test('光：上午东窗亮，傍晚西窗亮，正午南面玫瑰窗最亮', async () => {
  const C = await load(), L = C.LIGHTS;
  assert.ok(L.morning.east > L.morning.west * 3); assert.ok(L.evening.west > L.evening.east * 3);
  assert.ok(L.noon.south > L.noon.east && L.noon.south > L.morning.south && Math.abs(L.noon.east - L.noon.west) < 0.05);
});
