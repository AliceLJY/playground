// 交互实验室工具的无头测试：账本解析、判官校验、帧差判定、种类抽取。浏览器录屏的校准见 SPEC 验收 #2（tests/fixtures）。
const test = require('node:test'), assert = require('node:assert');
const { parseLedger } = require('../tools/judge-brief.cjs');
const { validate } = require('../tools/validate-scores.cjs');
const { judgeMotion, diffRaw, staticChecks } = require('../tools/record.cjs');
const { pick, rng, contract } = require('../tools/fill-prompt.cjs');
const fs = require('fs'), path = require('path');

const MD = `# 账
| 日期 | 片子 | 她的原话 | 层 | 我读出的倾向 | 出处 |
|---|---|---|---|---|---|
| 09-26 | 动态图形 | 「超级无敌好，很心动」 | 画面 | 落地挤压？ | RN x |
| 10-19 | 短样 | 「其实能再快一点点都可以」 | 节奏 | 宁快勿慢 | 本会话 |

正文
| 不是 | 这张 |
`;

test('账本只取原话四列，不带「我读出的倾向」', () => {
  const rows = parseLedger(MD, 'T');
  assert.strictEqual(rows.length, 2);
  assert.deepStrictEqual(rows[0], { id: 'T-1', date: '09-26', piece: '动态图形', quote: '「超级无敌好，很心动」', layer: '画面' });
  assert.ok(!JSON.stringify(rows).includes('落地挤压？'), '推断列漏进了判官输入');
});

const rows = { taste: parseLedger(MD, 'T'), craft: [] };
const ok = (kind) => ({ allPass: true, params: { kind }, checks: { 'C8-response': { pass: true } } });
const bad = (kind) => ({ allPass: false, params: { kind }, checks: { 'C8-response': { pass: false } } });
const good = () => ({
  judge: 'kimi',
  candidates: [
    { slug: 'a', items: [{ delta: 2, cite: { id: 'T-1', quote: '超级无敌好' } }], total: 2, verdict: 'keep' },
    { slug: 'b', items: [{ delta: 1, cite: { id: 'T-2', quote: '再快一点点' } }], total: 1, verdict: 'keep' },
    { slug: 'c', items: [{ delta: -2, cite: { check: 'C8-response' } }], total: -2, verdict: 'surprise' },
  ],
  keep: ['a', 'b'], surprise: 'c', surpriseWhy: '弹法不同',
});
const cks = { a: ok('x'), b: ok('y'), c: bad('z') };

test('合规的判官输出通过校验', () => assert.deepStrictEqual(validate(good(), rows, cks), []));
test('引用不在原话里会被抓出', () => {
  const s = good(); s.candidates[0].items[0].cite.quote = '很好看很时尚';
  assert.match(validate(s, rows, cks).join('\n'), /不在 T-1 的原话里/);
});
test('没有出处的分会被抓出', () => {
  const s = good(); delete s.candidates[1].items[0].cite;
  assert.match(validate(s, rows, cks).join('\n'), /没有出处/);
});
test('检查没过却进了留下会被抓出', () => {
  const s = good(); s.keep = ['a', 'c']; s.surprise = 'b'; s.candidates[1].verdict = 'surprise'; s.candidates[2].verdict = 'keep';
  assert.match(validate(s, rows, cks).join('\n'), /留下的 c 自动检查没全过/);
});
test('判官是生成者会被抓出', () => {
  const s = good(); s.judge = 'codex';
  assert.match(validate(s, rows, cks).join('\n'), /不能是生成者/);
});
test('意外项和留下的同种类会被抓出', () => {
  assert.match(validate(good(), rows, { a: ok('x'), b: ok('y'), c: { ...bad('x') } }).join('\n'), /种类和留下的重复/);
});
test('没过的检查没有扣分会被抓出', () => {
  const s = good(); s.candidates[2].items[0].delta = 1; s.candidates[2].total = 1;
  assert.match(validate(s, rows, cks).join('\n'), /没有对应的扣分/);
});

test('帧差：按下后 3 帧内有变化算响应，否则不算', () => {
  const still = Array.from({ length: 89 }, () => ({ px: 0 }));
  const late = still.map((d, k) => (k === 20 ? { px: 800 } : d));     // 第 15 帧按下，第 21 帧才动（200 ms）
  assert.strictEqual(judgeMotion(late, [15])['C8-response'].pass, false);
  const fast = still.map((d, k) => (k === 15 ? { px: 800 } : d));
  assert.strictEqual(judgeMotion(fast, [15])['C8-response'].pass, true);
  const shaky = still.map((d, k) => (k > 82 ? { px: 300 } : d));
  assert.strictEqual(judgeMotion(shaky, [15])['C9-settle'].pass, false);
});
test('diffRaw 数的是变化超过 16 的像素', () => {
  const a = Buffer.alloc(10, 100), b = Buffer.from([100, 100, 120, 100, 100, 110, 100, 100, 200, 100]);
  assert.deepStrictEqual(diffRaw(Buffer.concat([a, b]), 10), [{ px: 2 }]);
});
test('静态检查：transition: none 不算违约，transition: transform 算', () => {
  assert.strictEqual(staticChecks('<style>a{transition: none}</style>').checks['C5-css-motion'].pass, true);
  assert.strictEqual(staticChecks('<style>a{transition: transform .2s}</style>').checks['C5-css-motion'].pass, false);
});
test('种类抽取按种子可复现、不重复', () => {
  const kinds = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'kinds.json'), 'utf8')).kinds;
  const a = pick(kinds, 8, rng(20261103)).map((k) => k.kind), b = pick(kinds, 8, rng(20261103)).map((k) => k.kind);
  assert.deepStrictEqual(a, b);
  assert.strictEqual(new Set(a).size, 8);
  assert.match(contract(fs.readFileSync(path.join(__dirname, '..', 'SPEC.md'), 'utf8')), /springStep/);
});
test('同一行原话一轮引用超过两次会被抓出', () => {
  const s = good();
  s.candidates[1].items[0].cite = { id: 'T-1', quote: '很心动' };
  s.candidates[2].items.push({ delta: 1, cite: { id: 'T-1', quote: '超级无敌好' } }); s.candidates[2].total = -1;
  assert.match(validate(s, rows, cks).join('\n'), /T-1 被引用了 3 次/);
});
test('逐帧图挪进媒体目录所在卷的废纸篓', () => {
  const { trashFor } = require('../tools/record.cjs');
  assert.strictEqual(trashFor('/Volumes/ColdData/产出/x'), `/Volumes/ColdData/.Trashes/${process.getuid()}`);
  assert.strictEqual(trashFor('/tmp/x'), path.join(require('os').homedir(), '.Trash'));
});
test('入库：同种只有更高分才替换，意外项只进 history', () => {
  const os = require('os'), { ingest } = require('../tools/ingest.cjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-ingest-')), group = path.join(root, 'group'), media = path.join(root, 'media');
  const mk = (round, totals) => {
    const r = path.join(root, round); fs.mkdirSync(media, { recursive: true });
    for (const s of ['a', 'b', 'c']) {
      fs.mkdirSync(path.join(r, 'candidates', s), { recursive: true });
      fs.writeFileSync(path.join(r, 'candidates', s, 'index.html'), `<p>${round}-${s}</p>`);
      fs.writeFileSync(path.join(r, 'candidates', s, 'checks.json'), JSON.stringify({ allPass: true, params: { name: s, kind: s, spring: { k: 400, c: 20 } }, demo: [] }));
      fs.writeFileSync(path.join(media, `${s}.gif`), 'GIF');
    }
    fs.writeFileSync(path.join(r, 'ledger-rows.json'), JSON.stringify({ taste: [{ id: 'T-1', date: '09-26', piece: 'p', quote: '「很心动」' }], craft: [] }));
    fs.writeFileSync(path.join(r, 'scores.json'), JSON.stringify({ judge: 'kimi', keep: ['a', 'b'], surprise: 'c', surpriseWhy: 'x',
      candidates: ['a', 'b', 'c'].map((s, i) => ({ slug: s, total: totals[i], verdict: 'keep', items: [{ delta: totals[i], why: 'w', cite: { id: 'T-1', quote: '很心动' } }] })) }));
    return r;
  };
  ingest({ round: mk('r1', [3, 3, 1]), media, group, roundName: 'r1', date: '2026-11-03' });
  const out = ingest({ round: mk('r2', [4, 3, 1]), media, group, roundName: 'r2', date: '2026-11-10' });
  assert.match(fs.readFileSync(path.join(group, 'a', 'index.html'), 'utf8'), /r2-a/, '更高分应替换');
  assert.match(fs.readFileSync(path.join(group, 'b', 'index.html'), 'utf8'), /r1-b/, '同分不应替换');
  assert.ok(!fs.existsSync(path.join(group, 'c')), '意外项不入库');
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(group, 'history.json'), 'utf8')).filter((h) => h.slug === 'c').length, 2);
  assert.strictEqual(out.entries, 2);
  assert.match(fs.readFileSync(path.join(group, 'README.md'), 'utf8'), /「很心动」/);
});
