// 真实记忆库抽样（SPEC 验收 10）：只许有数字，格式对，和页面说的数对得上。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
global.self = global;
require('../src/library.js');
const LIB = global.FADE_LIBRARY;
const F = require('../src/core.js');
const CATS = new Set(['events', 'patterns', 'cases', 'preferences', 'entities', 'profile', 'other']);

test('验收 10 每行只有七个字段：类别、四个数、层级字母、钉住标记，没有任何文字内容', () => {
  assert.equal(LIB.rows.length, LIB.meta.sampled);
  for (const r of LIB.rows) {
    assert.equal(r.length, 7);
    const [c, imp, age, ac, since, tier, pin] = r;
    assert.ok(CATS.has(c), `类别 ${c}`);
    assert.ok(imp >= 0 && imp <= 1 && Number.isInteger(age) && age >= 0 && age <= F.DAYS && Number.isInteger(ac) && ac >= 0);
    assert.ok(since === null || (Number.isInteger(since) && since >= 0 && since <= age + 1));
    assert.ok(['c', 'w', 'p'].includes(tier) && (pin === 0 || pin === 1));
  }
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'library.js'), 'utf8');
  const body = src.slice(src.indexOf('FADE_LIBRARY ='));
  // 数据体里出现的字符串只能是类别名、层级字母和 meta 的键与日期
  const strings = body.match(/"[^"]*"/g).map((s) => s.slice(1, -1));
  const allowed = new Set([...CATS, 'c', 'w', 'p', 'meta', 'rows', ...Object.keys(LIB.meta)]);
  for (const s of strings) assert.ok(allowed.has(s) || /^\d{4}-\d{2}-\d{2}$/.test(s), `数据里出现了不该有的字符串：${s}`);
  assert.match(LIB.meta.date, /^\d{4}-\d{2}-\d{2}$/);
});

test('验收 10 抽样里真有页面要讲的几类：会掉分的、不掉分的、7 天窗口里的', () => {
  const st = LIB.rows.map((r) => {
    const [c, imp, age, ac, since, tier, pin] = r;
    return F.stateAt({ category: c, importance: imp, pinned: !!pin, recalls: [], tier: { c: 'core', w: 'working', p: 'peripheral' }[tier], history: ac ? { count: ac, last: since === null ? null : Math.max(0, age - since) } : null }, age);
  });
  assert.ok(st.filter((s) => s.factor < 1).length > 100, '会掉分的太少');
  assert.ok(st.filter((s) => s.factor === 1).length > 100, '不掉分的太少');
  assert.ok(st.filter((s) => s.why === 'recent').length >= 20, '7 天窗口里的太少');
});
