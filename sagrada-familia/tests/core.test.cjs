// 圣家堂：平面、塔表、碰撞、视点与操作方式的逻辑测试。运行：node --test tests/*.test.cjs
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path'), { pathToFileURL } = require('node:url');
const load = () => import(pathToFileURL(path.join(__dirname, '../src/core.js')).href);

test('十八座塔：耶稣塔最高，其次圣母塔、福音塔，使徒塔三面各四座', async () => {
  const C = await load(), by = k => C.TOWERS.filter(t => t.kind === k);
  assert.equal(C.TOWERS.length, 18, '塔数应为 18');
  assert.equal(by('jesus')[0].h, 172.5); assert.equal(by('mary')[0].h, 138); assert.deepEqual(by('evangelist').map(t => t.h), [135, 135, 135, 135]);
  for (const f of ['nativity', 'passion', 'glory']) assert.equal(by('apostle').filter(t => t.face === f).length, 4, f + ' 立面应有四座钟塔');
  for (const t of by('apostle')) assert.ok(t.h >= 98.5 && t.h <= 120 && t.h < 135, `${t.id} 高度 ${t.h} 应在 98.5–120 之间`);
  assert.ok(by('apostle').filter(t => t.face === 'nativity').every(t => t.x > C.TRANS_HALF), '诞生立面的塔在 +X 一侧');
  assert.ok(by('apostle').filter(t => t.face === 'passion').every(t => t.x < -C.TRANS_HALF), '受难立面的塔在 -X 一侧');
});

test('平面：拉丁十字，长 90、中殿宽 45、横厅长 60', async () => {
  const C = await load();
  assert.equal(C.Z_GLORY - (C.APSE.z - C.APSE.r), 90); assert.equal(C.NAVE_HALF * 2, 45); assert.equal(C.TRANS_HALF * 2, 60);
  assert.ok(C.inside(0, 20) && C.inside(28, -12) && C.inside(0, -40), '中殿、横厅端头、后殿都在里面');
  assert.ok(!C.inside(28, 20) && !C.inside(0, 50) && !C.inside(20, -44), '中殿外侧、荣耀门外、后殿外角都在外面');
});

test('走路：墙挡得住，三个门洞走得通', async () => {
  const C = await load();
  // 从中殿里朝 +X 侧墙一直走：停在墙里侧
  let p = { x: 18, z: 20 }; for (let i = 0; i < 400; i++) p = C.moveWalker(p.x, p.z, 0.1, 0);
  assert.ok(p.x < C.NAVE_HALF - C.WALL + 1e-6, `不该穿过侧墙，停在 x=${p.x.toFixed(2)}`);
  assert.ok(p.x > C.NAVE_HALF - C.WALL - 0.4, `应当能贴到墙边，停在 x=${p.x.toFixed(2)}`);
  // 从荣耀门外正对门洞走进去
  p = { x: 0, z: 60 }; for (let i = 0; i < 400; i++) p = C.moveWalker(p.x, p.z, 0, -0.1);
  assert.ok(C.inside(p.x, p.z) && p.z < 38, `应当从荣耀门走进中殿，停在 z=${p.z.toFixed(2)}`);
  // 门洞旁边两米就是墙
  p = { x: 12, z: 60 }; for (let i = 0; i < 400; i++) p = C.moveWalker(p.x, p.z, 0, -0.1);
  assert.ok(!C.inside(p.x, p.z), '门洞旁边的墙走不进去');
  // 诞生门、受难门从里往外能出去
  for (const s of [1, -1]) { p = { x: s * 20, z: C.CROSS.z }; for (let i = 0; i < 400; i++) p = C.moveWalker(p.x, p.z, s * 0.1, 0); assert.ok(Math.abs(p.x) > C.TRANS_HALF + 3, `${s > 0 ? '诞生' : '受难'}门应当能走出去，停在 x=${p.x.toFixed(2)}`); }
});

test('走路：柱子、长椅、祭台都挡人，圣坛台有坡', async () => {
  const C = await load();
  for (const c of C.COLUMNS) assert.equal(C.blocked(c.x, c.z), 'column', `柱 (${c.x},${c.z}) 中心应被挡`);
  assert.equal(C.blocked(C.PEWS[0].x, C.PEWS[0].z), 'pew'); assert.equal(C.blocked(0, -22.5), 'solid');
  let p = { x: 0, z: 30 }; for (let i = 0; i < 600; i++) p = C.moveWalker(p.x, p.z, 0, -0.1);
  assert.ok(p.z < -15 && p.z > -22, `沿中廊走到祭台前停下，z=${p.z.toFixed(2)}`);
  assert.equal(C.groundY(0, 10), 0); assert.equal(C.groundY(0, -24), C.PRESBYTERY.h); assert.ok(C.groundY(0, -19) > 0 && C.groundY(0, -19) < C.PRESBYTERY.h);
  assert.ok(C.COLUMNS.every(c => C.inside(c.x, c.z)), '柱子都在室内');
  assert.ok(C.COLUMNS.filter(c => c.kind === 'crossing').length === 4, '十字交叉四根大柱');
});

test('视点：不少于 14 个，位置都站得住，里外标得对', async () => {
  const C = await load();
  assert.ok(C.VIEWS.length >= 14, `视点 ${C.VIEWS.length} 个`);
  assert.equal(new Set(C.VIEWS.map(v => v.id)).size, C.VIEWS.length, '视点 id 不重复');
  assert.ok(C.VIEWS.filter(v => v.zone === 'out').length >= 5 && C.VIEWS.filter(v => v.zone === 'in').length >= 5);
  for (const v of C.VIEWS) {
    const [x, y, z] = v.pos, isIn = C.inside(x, z) && y < 57;
    assert.equal(isIn ? 'in' : 'out', v.zone, `${v.id} 标的是 ${v.zone}，位置实际在${isIn ? '里' : '外'}`);
    assert.ok(v.text.length > 15 && v.cn && v.en, `${v.id} 要有说明文字`);
    if (v.mode === 'walk') assert.equal(C.blocked(x, z), null, `${v.id} 的落脚点被 ${C.blocked(x, z)} 挡住`);
    if (v.zone === 'out') assert.ok(!C.BLOCKS.some(b => !b.park && Math.abs(x - b.x) < C.BLOCK / 2 && Math.abs(z - b.z) < C.BLOCK / 2 && y < 30), `${v.id} 的机位埋在街块里`);
  }
});

test('操作方式：点视点和切模式之后落在哪', async () => {
  const C = await load(); let s = { mode: 'orbit', zone: 'out', view: 'whole', light: 'morning' };
  s = C.applyView(s, 'nave'); assert.deepEqual([s.mode, s.zone, s.view], ['walk', 'in', 'nave']);
  s = C.applyView(s, 'evening-glass'); assert.equal(s.light, 'evening', '暮光彩窗顺带切到傍晚光');
  s = C.applyView(s, 'vault'); assert.equal(s.mode, 'fly'); assert.equal(s.light, 'evening', '没指定光的视点不改光');
  s = C.applyMode(s, 'orbit'); assert.deepEqual([s.mode, s.zone, s.view], ['orbit', 'out', 'whole'], '在里面切轨道会被带到外面全景');
  assert.deepEqual(C.applyMode(s, 'swim'), s, '不认识的模式不动'); assert.deepEqual(C.applyView(s, 'nope'), s);
});

test('光：早晨诞生一侧冷色亮，傍晚受难一侧暖色亮', async () => {
  const C = await load();
  assert.ok(C.LIGHTS.morning.cool > C.LIGHTS.morning.warm * 3); assert.ok(C.LIGHTS.evening.warm > C.LIGHTS.evening.cool * 3);
  assert.ok(Math.abs(C.LIGHTS.noon.cool - C.LIGHTS.noon.warm) < 0.1);
});

test('走路：荣耀门廊的八根大柱挡人，柱子之间走得过去', async () => {
  const C = await load();
  assert.equal(C.GLORY_COLS.length, 8, '门廊柱应为八根');
  for (const c of C.GLORY_COLS) {
    assert.equal(C.blocked(c.x, c.z), 'porch', `门廊柱 (${c.x},${c.z}) 中心应被挡`);
    // 正对着柱子从街上走过来：停在柱子外侧，不会穿过去
    let p = { x: c.x, z: c.z + 9 }; for (let i = 0; i < 200; i++) { const q = C.blocked(p.x, p.z - 0.1) ? p : { x: p.x, z: p.z - 0.1 }; if (q === p) break; p = q; }
    assert.ok(p.z > c.z + c.r, `不该穿过门廊柱，停在 z=${p.z.toFixed(2)}，柱心 z=${c.z}`);
  }
  // 相邻两根柱子正中间是空的；正中那一跨对着荣耀门，能一路走进中殿
  const a = C.GLORY_COLS[3], b = C.GLORY_COLS[4]; assert.equal(C.blocked((a.x + b.x) / 2, a.z), null, '柱间应能通过');
  let p = { x: 0, z: 70 }; for (let i = 0; i < 500; i++) p = C.moveWalker(p.x, p.z, 0, -0.1);
  assert.ok(C.inside(p.x, p.z), `从街上穿过门廊正中应能走进中殿，停在 z=${p.z.toFixed(2)}`);
});
