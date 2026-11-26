// 屏上字的规矩（照原作实看的尺度，见 SPEC.md「屏上的字」）：写成断言，改讲稿时违反了就红。
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const load = () => import(pathToFileURL(path.resolve(__dirname, '../src/deck.js')).href);
const len = s => [...(s || '')].length;
const nums = s => (s || '').match(/[0-9][0-9,.]*/g) || [];

test('每一步：一句标题至多 24 字、标题里不放数字、小灰字至多一行 60 字', async () => {
  const { steps } = await load();
  for (const s of steps()) {
    assert.ok(len(s.h) <= 24, `第 ${s.si + 1} 场第 ${s.beat + 1} 拍标题 ${len(s.h)} 字：「${s.h}」`);
    assert.equal(nums(s.h).length, 0, `标题里有数字：「${s.h}」——数字要长在画面里的物体上`);
    assert.ok(!/\n/.test(s.s) && len(s.s) <= 60, `小灰字超过一行：「${s.s}」`);
    assert.ok(!/[=×÷]/.test(s.h + s.s), `屏上出现算式：「${s.h} ${s.s}」——算式只进讲稿`);
  }
});

test('每一步都有讲稿，且讲稿里有舞台指示（括号）的步数过半', async () => {
  const { steps } = await load();
  const all = steps();
  for (const s of all) assert.ok(len(s.notes) >= 8, `第 ${s.si + 1} 场第 ${s.beat + 1} 拍没有讲稿`);
  const staged = all.filter(s => /（[^）]+）/.test(s.notes)).length;
  assert.ok(staged > all.length / 2, `只有 ${staged}/${all.length} 步带舞台指示`);
});

test('首尾同一个壳：开场与收尾都是验证页，且收尾在资料页之前', async () => {
  const { SCENES } = await load();
  const ids = SCENES.map(s => s.id);
  assert.equal(ids[0], 'shell'); assert.equal(ids[ids.length - 2], 'shell2'); assert.equal(ids[ids.length - 1], 'sources');
});

test('讲稿不说事实核查里禁止的话', async () => {
  const { steps } = await load();
  const text = steps().map(s => s.h + s.s + s.notes).join('\n');
  // 事实核查.md「要谨慎措辞的说法」：不说训练自动驾驶是事实、不说雇了人、不说攻破了、不说 2007 年上线、不说每天 2 亿次
  for (const bad of ['在训练自动驾驶', '雇了一个', '攻破了 Cloudflare', '2007 年上线', '每天 2 亿次', '跟你学的认字']) assert.ok(!text.includes(bad), `出现了不能说的：「${bad}」`);
});

test('分数从 0.9 一路往下掉，只有它自己点过的那一拍回到 0.9', async () => {
  const { steps } = await load();
  const all = steps(), i = all.findIndex(s => s.scene === 'click' && s.beat === 1);
  for (let k = 1; k < i; k++) assert.ok(all[k].score <= all[k - 1].score, `第 ${k} 步分数回升了`);
  assert.equal(all[i].score, 0.9);
  assert.ok(all[all.length - 1].score <= 0.5);
});
