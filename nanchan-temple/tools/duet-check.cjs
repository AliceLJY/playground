// 2026-11-25 Duet 巡检复核：尺子每一档的读数、第 4 步前的剖视窗、手机「从头来」、16.5 档注记
// NODE_PATH="$(npm root -g)" node tools/duet-check.cjs <page-url> [screenshot-dir]
const { chromium } = require('playwright');
const path = require('node:path');
const [base, shots] = process.argv.slice(2);
if (!base) throw new Error('Provide page URL');
(async () => {
  const M = await import(path.join(__dirname, '..', 'src', 'model.mjs'));
  const browser = await chromium.launch();
  let fails = 0;
  const check = (name, pass, detail) => { if (!pass) fails++; console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(detail)}`); };

  // 桌面：搭完，每一档尺子都看「装回」读数
  const desk = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await desk.goto(base);
  await desk.waitForFunction(() => window.__nc);
  await desk.evaluate(() => { localStorage.clear(); });
  await desk.locator('[data-mode="manual"]').click();
  // 第 4 步之前：剖视窗是展开的，里面要有看得见的东西
  const before = await desk.evaluate(() => {
    const d = document.querySelector('.nc-cutaway');
    d.open = true;
    const visible = [...d.children].filter((el) => el.tagName !== 'SUMMARY').filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; });
    return { visible: visible.map((el) => (el.className || el.tagName) + ':' + el.textContent.trim().slice(0, 30)) };
  });
  check('cutaway before step 4 shows something', before.visible.length > 0, before);
  if (shots) await desk.locator('.nc-cutaway').screenshot({ path: path.join(shots, 'nanchan-d-cutaway-before-step4.png') });
  for (let i = 0; i < 11; i++) { await desk.evaluate((n) => window.__nc.press(n), i); await desk.evaluate(() => window.__nc.advance(5)); }
  const afterInset = await desk.evaluate(() => { const b = document.querySelector('[data-inset]'); return { hidden: b.hidden, w: b.getBoundingClientRect().width, wait: [...document.querySelectorAll('[data-inset-wait]')].map((w) => w.hidden) }; });
  check('cutaway shows the bracket set after step 4', !afterInset.hidden && afterInset.w > 0 && afterInset.wait.every(Boolean), afterInset);
  const bad = [];
  for (let mm = 12; mm <= 20; mm += 0.5) {
    await desk.evaluate((v) => { const r = document.querySelector('[data-fen]'); r.value = String(v); r.dispatchEvent(new Event('input')); }, mm);
    const text = await desk.locator('[data-readout]').textContent();
    const o = M.overall(mm);
    const want = `面阔 ${o.width.toFixed(2)} m · 进深 ${o.depth.toFixed(2)} m`;
    if (text !== want) bad.push({ mm, got: text, want });
    if (shots && mm === 17) await desk.screenshot({ path: path.join(shots, 'nanchan-d-ruler-17mm.png') });
  }
  check('readout follows every ruler stop 12–20 mm', bad.length === 0, bad);
  // 回看斗栱也跟着尺子
  await desk.locator('[data-review="bracket"]').click();
  await desk.evaluate(() => { const r = document.querySelector('[data-fen]'); r.value = '13'; r.dispatchEvent(new Event('input')); });
  const br = await desk.locator('[data-readout]').textContent();
  check('bracket review readout at 13 mm', br.includes(`${M.cm(M.BRACKET_H, 13).toFixed(0)} cm`), br);
  await desk.evaluate(() => { const r = document.querySelector('[data-fen]'); r.value = '16.5'; r.dispatchEvent(new Event('input')); });
  const note = await desk.locator('[data-fen-note]').textContent();
  check('16.5 mm note says it is a derived value, as facts.md lists it', note.includes('推算') && !note.includes('实测'), note);

  // 手机：「从头来」点按区域
  for (const hasTouch of [true, false]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 664 }, hasTouch, deviceScaleFactor: 2 });
    const ph = await ctx.newPage();
    await ph.goto(base);
    await ph.waitForFunction(() => window.__nc);
    const r = await ph.locator('[data-reset]').evaluate((el) => { el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), font: getComputedStyle(el).fontSize, hit: document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2) === el }; });
    check(`390 hasTouch=${hasTouch} restart link >=44px tall and hittable`, r.h >= 44 && r.hit, r);
    if (shots) await ph.screenshot({ path: path.join(shots, `nanchan-m-restart-touch${hasTouch}.png`) });
    await ctx.close();
  }
  await browser.close();
  console.log(fails ? `${fails} FAIL` : 'ALL PASS');
  process.exitCode = fails ? 1 : 0;
})();
