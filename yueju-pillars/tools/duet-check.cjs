// Checks from the 2026-11-25 Duet review. Usage: NODE_PATH="$(npm root -g)" node tools/duet-check.cjs <base-url>
const { chromium } = require('playwright');
const base = process.argv[2] || 'http://127.0.0.1:8793/yueju-pillars/';
let fails = 0;
const check = (name, pass, detail) => { if (!pass) fails++; console.log(pass ? 'ok  ' : 'FAIL', name, pass ? '' : JSON.stringify(detail)); };
(async () => {
  const browser = await chromium.launch();
  for (const [w, h, touch] of [[1440, 900, false], [390, 664, true], [320, 568, true]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
    const open = async (q) => { await page.goto(base + q); await page.waitForFunction(() => window.__pillar); };
    const cardTexts = () => page.evaluate(() => {
      const seen = [], orig = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { seen.push(String(t)); return orig.call(this, t, ...a); };
      try { window.__pillar.card(); } finally { CanvasRenderingContext2D.prototype.fillText = orig; }
      document.getElementById('modal').classList.remove('on');
      return seen;
    });
    // 1. share card wording follows whose pillar it is
    await open('?r=zyhd');
    const friend = await cardTexts();
    check(`${w} share card from a friend's link does not say 我是`, !friend.some((t) => t.includes('我是')), friend.filter((t) => t.includes('我')));
    await page.evaluate(() => { window.__pillar.st.mine = 'ws'; window.__pillar.result('ws', false); window.__pillar.result('zyhd', true); });
    const other = await cardTexts();
    check(`${w} share card while viewing another pillar does not say 我是`, !other.some((t) => t.includes('我是')), other.filter((t) => t.includes('我')));
    await page.evaluate(() => window.__pillar.result('ws', false));
    const mine = await cardTexts();
    check(`${w} share card of your own result still says 我是`, mine.includes('我是撑起粤剧团的'), mine.slice(0, 3));
    // 2. four-character names stay on one line and clear the seal
    for (const id of ['zyhd', 'ebhd']) {
      await page.evaluate((x) => window.__pillar.result(x, true), id);
      const m = await page.evaluate(() => { const n = document.getElementById('rname'), r = document.createRange(); r.selectNodeContents(n); const rs = [...r.getClientRects()]; return { lines: new Set(rs.map((x) => Math.round(x.top))).size, right: Math.max(...rs.map((x) => x.right)), seal: document.querySelector('.rhead .seal').getBoundingClientRect().left, font: getComputedStyle(n).fontSize }; });
      check(`${w} ${id} name on one line, left of the seal`, m.lines === 1 && m.right <= m.seal, m);
    }
    // 3. the 《帝女花》 note points at the number the list shows
    const role = await page.evaluate(() => { const li = [...document.querySelectorAll('#srcs li')]; const note = li[li.length - 1].textContent; const n = (note.match(/第\s*(\d+)\s*条/) || [])[1]; return { note, n, item: n ? li[+n - 1].textContent : null }; });
    check(`${w} 《帝女花》 note cites the listed number of 粤剧笔记`, role.item && role.item.includes('粤剧笔记'), role);
    // 4. heading count matches the buttons
    const oth = await page.evaluate(() => ({ h: document.getElementById('others').previousElementSibling.textContent, n: document.querySelectorAll('#others button').length }));
    check(`${w} 「其他…柱」 heading does not promise five when six buttons show`, !(oth.h.includes('五') && oth.n === 6), oth);
    // 5. 上一题 tall enough to tap
    await open('?view=q2');
    const back = await page.$eval('#back', (e) => e.getBoundingClientRect().height);
    check(`${w} 上一题 at least 44px tall`, back >= 44, { height: back });
    // 6. tapping an answer then 上一题 within 220 ms stays on the earlier question
    await page.locator('.opt').first().click(); await page.locator('#back').click(); await page.waitForTimeout(500);
    const q = await page.$eval('#qnum', (e) => e.textContent);
    check(`${w} 上一题 right after answering wins`, q.startsWith('第 1 题'), { qnum: q });
    // 7. share modal: backdrop and Esc close it; desktop does not say 长按
    await open('?r=ws');
    await page.click('#card'); await page.waitForSelector('#modal.on');
    const hint = await page.$eval('#modal p', (p) => { const parts = [...p.querySelectorAll('span')]; return (parts.length ? parts.filter((e) => getComputedStyle(e).display !== 'none') : [p]).map((e) => e.textContent).join(' '); });
    check(`${w} save hint fits the device`, touch ? hint.includes('长按') : !hint.includes('长按'), { hint });
    await page.mouse.click(5, 5); await page.waitForTimeout(100);
    check(`${w} tapping the dark backdrop closes the share card`, !(await page.$eval('#modal', (m) => m.classList.contains('on'))), null);
    if (!touch) { await page.evaluate(() => document.getElementById('modal').classList.remove('on')); await page.click('#card'); await page.keyboard.press('Escape'); check(`${w} Esc closes the share card`, !(await page.$eval('#modal', (m) => m.classList.contains('on'))), null); }
    await page.close();
  }
  await browser.close();
  console.log(fails ? fails + ' failed' : 'all passed');
  process.exit(fails ? 1 : 0);
})();
