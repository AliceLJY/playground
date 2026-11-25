// 结果卡片里不出现单字掉行（2026-11-25 Duet 巡检后续）：卡片里每一段文字（标题、真事、结尾句、按钮），
// 折成多行时最后一行至少两个字。逐字用 Range 取位置分行；标点不算字（「录。」算一个字）。
// 胜、负两张卡 × 手机、横屏、平板、电脑各档；胜卡用全新的 localStorage，保证带「新纪录」。
// 负卡另把八种真事各换上去排一遍（只换文字，不改规则），各档都不许有单字行。
//   NODE_PATH="$(npm root -g)" node tools/orphan-check.cjs <page-url> <out-dir>
const { chromium } = require('playwright'), fs = require('node:fs'), path = require('node:path');
const { STORIES } = require('../src/core.js');
const [url, out] = process.argv.slice(2);
if (!url || !out) { console.error('用法：node tools/orphan-check.cjs <page-url> <out-dir>'); process.exit(2); }
fs.mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  let failed = 0;
  for (const [w, h, touch] of [[320, 568, true], [360, 740, true], [390, 664, true], [412, 915, true], [844, 340, true], [1024, 768, true], [1280, 720, false], [1365, 900, false], [1440, 800, false], [1920, 1080, false]]) {
    for (const view of ['win', 'boom']) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
      const p = await ctx.newPage(), errors = [];
      p.on('pageerror', (e) => errors.push(e.message));
      await p.goto(url + (url.includes('?') ? '&' : '?') + 'view=' + view);
      await p.waitForFunction(() => window.__sweeper && window.__sweeper.ready && window.__sweeper.probe().card, null, { polling: 100, timeout: 10000 });
      await p.waitForTimeout(250);
      const scan = () => p.evaluate(() => {
        const PUNCT = /[\s，。、：；！？「」『』（）·…—,.:;!?()'"\-]/;
        const bad = [];
        const blocks = [...document.querySelectorAll('#card h2, #card p, #card .row button')];
        for (const el of blocks) {
          const chars = [];
          const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          for (let n; (n = tw.nextNode());) for (let i = 0; i < n.textContent.length; i++) {
            const ch = n.textContent[i]; if (PUNCT.test(ch)) continue;
            const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1); const q = r.getClientRects()[0]; if (!q || q.width < 1) continue;
            chars.push({ ch, y: (q.top + q.bottom) / 2 });
          }
          const lines = []; for (const c of chars) { const L = lines.find((l) => Math.abs(l.y - c.y) < 6); if (L) L.s += c.ch; else lines.push({ y: c.y, s: c.ch }); }
          lines.sort((a, b) => a.y - b.y);
          if (lines.length > 1 && [...lines[lines.length - 1].s].length < 2) bad.push(`${el.tagName.toLowerCase()}${el.className ? '.' + el.className : ''} 末行只有「${lines[lines.length - 1].s}」（上一行「${lines[lines.length - 2].s.slice(-8)}」）`);
        }
        return bad;
      });
      let bad = await scan();
      await p.screenshot({ path: path.join(out, `orphan-${view}-${w}x${h}.png`) });
      if (view === 'boom') {
        // 八种真事轮流换上去（只换卡片上的文字），卡片重新摆位后再排一遍
        for (let k = 0; k < STORIES.length; k++) {
          await p.evaluate((st) => {
            const tale = document.querySelector('#card .tale');
            tale.querySelector('b').textContent = '真事一则 · ' + st.title + '：'; tale.lastChild.textContent = st.text;
            dispatchEvent(new Event('resize'));
          }, STORIES[k]);
          await p.waitForTimeout(50);
          bad = bad.concat((await scan()).map((s) => `真事 ${k + 1}「${STORIES[k].title}」：${s}`));
        }
      }
      const ok = bad.length === 0 && errors.length === 0;
      if (!ok) failed++;
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${view} ${w}x${h}${touch ? ' touch' : ''}${bad.length ? '：' + bad.join('；') : '：没有单字行'}${errors.length ? '，报错 ' + errors.join(' | ') : ''}`);
      await ctx.close();
    }
  }
  await b.close();
  process.exit(failed ? 1 : 0);
})();
