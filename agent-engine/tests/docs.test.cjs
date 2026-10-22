// Documentation checks for the public folder: the English README holds no Chinese, both READMEs end on the same last section,
// nothing in the docs points back to a person or a machine, and every vendored file (if there ever is one) has a licence entry.
// AGENT_ENGINE_ROOT points the suite at another copy of the folder.
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const ROOT = process.env.AGENT_ENGINE_ROOT || path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const NAME = 'Al' + 'ice', ACCOUNT = ['anxian', 'jingya'].join(''), OUTDIR = 'AI' + '产出';   // spelled in pieces so this file does not carry them either
const DOCS = ['README.md', 'README_CN.md', 'SPEC.md', 'VERIFICATION.md', 'THIRD_PARTY_NOTICES.md'];

test('the English README has no Chinese characters or Chinese punctuation', () => {
  const m = /[⺀-鿿豈-﫿︰-﹏＀-￯　-〿]/.exec(read('README.md'));
  assert.ok(!m, 'README.md contains "' + (m && m[0]) + '"');
});

test('both READMEs end on the who-it\'s-for / AI-assets section, two bullets, in their own language', () => {
  for (const [file, title, a, b] of [['README.md', "## Who it's for, AI assets", '- Who it\'s for: ', '- AI assets: '], ['README_CN.md', '## 谁会点开、AI 素材', '- 谁会点开：', '- AI 素材清单：']]) {
    const s = read(file).trim(), heads = s.match(/^## .*$/gm);
    assert.strictEqual(heads[heads.length - 1], title, file + ': the last section must be "' + title + '"');
    const body = s.slice(s.lastIndexOf(title) + title.length).trim().split('\n').filter(Boolean);
    assert.strictEqual(body.length, 2, file + ': two bullets expected, got ' + body.length);
    assert.ok(body[0].startsWith(a) && body[1].startsWith(b), file + ': bullets must start with "' + a + '" and "' + b + '"');
    assert.ok(/\[VERIFICATION\.md\]|\[SPEC\.md\]/.test(s), file + ' links the spec or the verification record');
  }
});

test('the spec has its required parts and 5-10 acceptance rows', () => {
  const s = read('SPEC.md');
  for (const h of ['## 1. 体验一句话', '## 2. 美学与场地', '## 3. 配色', '## 4. 构图', '## 6. 性能预算', '## 8. 验收条目']) assert.ok(s.includes(h), 'SPEC.md lacks ' + h);
  const rows = s.split('## 8. 验收条目')[1].split('\n').filter((l) => /^\| \d+ \|/.test(l));
  assert.ok(rows.length >= 5 && rows.length <= 10, 'SPEC.md has ' + rows.length + ' acceptance rows, wanted 5-10');
  for (const r of rows) assert.ok(r.split('|').filter((c) => c.trim()).length >= 4, 'acceptance row without a check and a threshold: ' + r.slice(0, 40));
});

test('nothing in the docs points back to a person or a machine', () => {
  for (const f of DOCS.filter((x) => fs.existsSync(path.join(ROOT, x)))) {
    const s = read(f);
    for (const [what, re] of [['a local user path', new RegExp('/' + 'Users/')], ['the local account name', new RegExp(ACCOUNT, 'i')], ['a tailnet address', /\.ts\.net/], ['a session id', /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i], ['the output folder name', new RegExp(OUTDIR)]]) {
      assert.ok(!re.test(s), f + ' contains ' + what);
    }
    const rest = s.replace(new RegExp(NAME + 'LJY', 'g'), '').replace(new RegExp(NAME + 'ljy\\.github\\.io', 'gi'), '').replace(new RegExp(NAME + '_methodology', 'g'), '');
    assert.ok(!new RegExp(NAME, 'i').test(rest), f + ' contains the author\'s name outside the allowed handle, Pages address and repo name');
  }
});

test('every vendored file, if any, is listed in THIRD_PARTY_NOTICES.md', () => {
  const notices = read('THIRD_PARTY_NOTICES.md');
  const walk = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [e.name])) : []);
  for (const f of walk(path.join(ROOT, 'vendor'))) assert.ok(notices.includes(f), 'vendor/' + f + ' has no licence entry in THIRD_PARTY_NOTICES.md');
});
