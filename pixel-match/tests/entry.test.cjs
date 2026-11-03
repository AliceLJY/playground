// 发布入口：页面引用的文件都在、不向站外要东西、CI 里有自己那一段、两份 README 各有「谁会点开、AI 素材」。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(DIR, p), 'utf8');

test('10 页面引用的脚本都在，顺序是 小人 → 软光栅 → 牌面 → 规则 → 画面；页面和源码不向站外请求', () => {
  const html = read('index.html');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(scripts, ['src/figures.js', 'src/raster.js', 'src/card.js', 'src/core.js', 'src/game.js']);
  for (const s of scripts) assert.ok(fs.existsSync(path.join(DIR, s)), `${s} 不存在`);
  for (const f of ['index.html', ...scripts]) assert.doesNotMatch(read(f), /(src|href)=["']?https?:|fetch\(|XMLHttpRequest|import\(["']https?:/, `${f} 向站外要东西`);
  for (const f of scripts) assert.doesNotMatch(read(f), /Math\.random\(/, `${f} 用了不带种子的随机数，固定机位就复现不了`);
});

test('10b CI 有自己的检查与拷贝；两份 README 分开写、末尾有「谁会点开、AI 素材」', () => {
  const yml = fs.readFileSync(path.join(DIR, '..', '.github', 'workflows', 'pages.yml'), 'utf8');
  assert.match(yml, /working-directory: pixel-match[\s\S]*?node --test tests\/\*\.test\.cjs/);
  assert.match(yml, /cp -R pixel-match\/src _site\/pixel-match\//);
  const cn = read('README_CN.md'), en = read('README.md');
  assert.match(cn, /谁会点开、AI 素材/); assert.match(en, /Who opens it, AI material/);
  assert.doesNotMatch(en, /[一-鿿]{6,}/, '英文 README 里混了大段中文');
  for (const f of ['README_CN.md', 'README.md', 'SPEC.md']) assert.doesNotMatch(read(f), /[\w.+-]+@[\w-]+\.[\w.]+|1[3-9]\d{9}/, `${f} 里像有邮箱或手机号`);
});
