// 逐步翻完整场演讲：每一步在几个时刻截图，并记下屏上的字（标题、小灰字、钉在物体上的标签）、页面报错和 WebGL 渲染器。
// 用法：NODE_PATH="$(npm root -g)" node tools/walk.cjs <页面地址> <输出目录> [视口宽x高] [--keys]
//   默认用 ?headless=1 固定时间步进（可复现）；--keys 改用真实按键、真实时间（验输入）。
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const [url, out, vp = '1920x1080'] = process.argv.slice(2), KEYS = process.argv.includes('--keys');
  const [W, H] = vp.split('x').map(Number);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const u = new URL(url); if (!KEYS) u.searchParams.set('headless', '1');
  await page.goto(u.href, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__talk && window.__talk.ready, null, { timeout: 60000, polling: 200 });
  const n = await page.evaluate(() => window.__talk.steps);
  const screenText = () => page.evaluate(() => {
    const vis = el => el && !el.hidden && getComputedStyle(el).display !== 'none' && +getComputedStyle(el).opacity > .05;
    const hd = document.getElementById('hd'), labs = [...document.querySelectorAll('#labels .lab')].filter(vis).map(e => e.textContent);
    return { h: vis(hd) ? document.getElementById('h').textContent : '', s: vis(hd) ? document.getElementById('s').textContent : '', labels: labs, score: document.getElementById('score').textContent, info: window.__talk.info() };
  });
  const rec = [];
  const TIMES = [.4, 2.5, 6, 11];
  for (let i = 0; i < n; i++) {
    if (i > 0) { if (KEYS) await page.keyboard.press('ArrowRight'); else await page.evaluate(() => window.__talk.next()); }
    let t = 0; const shots = [];
    for (const T of TIMES) {
      if (KEYS) await page.waitForTimeout((T - t) * 1000); else await page.evaluate(ms => window.__talk.step(ms), (T - t) * 1000);
      t = T; const f = path.join(out, `s${String(i).padStart(2, '0')}-t${String(T).replace('.', '_')}.png`);
      await page.screenshot({ path: f }); shots.push(f);
    }
    const txt = await screenText();
    rec.push({ i, ...txt, shots: shots.map(s => path.basename(s)) });
  }
  // 屏上字的约束：一句标题 + 至多一行小灰字；标题里不出现数字（数字长在物体上）；标签至多一个数字
  const digits = s => (s.match(/[0-9][0-9,.]*/g) || []).length;
  const problems = [];
  for (const r of rec) {
    if (r.h && [...r.h].length > 24) problems.push(`步 ${r.i}：标题 ${[...r.h].length} 字，超过 24`);
    if (digits(r.h) > 0) problems.push(`步 ${r.i}：标题里有数字「${r.h}」`);
    const nums = r.labels.filter(l => digits(l) > 0).length; if (nums > 1) problems.push(`步 ${r.i}：物体上有 ${nums} 个数字标签`);
  }
  const renderer = rec[0] && rec[0].info.renderer;
  fs.writeFileSync(path.join(out, 'walk.json'), JSON.stringify({ url: u.href, viewport: vp, renderer, errors, problems, rec }, null, 1));
  console.log(`steps ${rec.length}/${n}  errors ${errors.length}  problems ${problems.length}  renderer ${renderer}`);
  errors.slice(0, 5).forEach(e => console.log('  error:', e.slice(0, 200)));
  problems.forEach(p => console.log('  problem:', p));
  await browser.close();
  process.exit(errors.length || problems.length ? 1 : 0);
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
