// 标题页按键提示不把「键」和「动作」拆到两行（2026-11-25 Duet 巡检）。
// 没有触屏的窄窗口（手机宽度的电脑窗口、或不带触屏的模拟）会显示键盘提示；提示可以折行，
// 但只许在「·」或换行处折，每一组「键 + 动作」（如「空格 翻滚」「M 声音」）必须在同一行。
// 判法：把 .keys 的文字按「·」和换行切成组，每组用 Range 取行盒，组内出现两个不同的行就算拆开。
// 同时要求提示整块在屏内、不和「开锣」「街口讨教」相交。带触屏时提示本来就隐藏，只确认它不显示。
//   NODE_PATH="$(npm root -g)" node tools/keyhint-check.cjs <built-page-url> <out-dir>
const { chromium } = require('playwright'), fs = require('node:fs'), path = require('node:path');
const [url, out] = process.argv.slice(2);
if (!url || !out) { console.error('用法：node tools/keyhint-check.cjs <built-page-url> <out-dir>'); process.exit(2); }
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
  let failed = 0;
  for (const [w, h, touch] of [[390, 844, false], [360, 740, false], [320, 568, false], [390, 664, true], [1365, 900, false]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 2 });
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url);
    await page.waitForFunction(() => window.__qilou?.ready && !document.getElementById('title').classList.contains('hidden'), null, { polling: 100, timeout: 90000 });
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => {
      const keys = document.querySelector('#title .keys'), kr = keys.getBoundingClientRect();
      if (!keys.getClientRects().length) return { shown: false };
      // 文字节点 → 全文偏移；<br> 记成换行
      const pieces = []; let text = '';
      (function walk(n) { for (const c of n.childNodes) { if (c.nodeType === 3) { pieces.push({ node: c, at: text.length }); text += c.textContent; } else if (c.nodeName === 'BR') text += '\n'; else walk(c); } })(keys);
      const pos = (i) => { for (let k = pieces.length - 1; k >= 0; k--) if (i >= pieces[k].at) return [pieces[k].node, Math.min(i - pieces[k].at, pieces[k].node.textContent.length)]; return [pieces[0].node, 0]; };
      const groups = []; const re = /[^·\n]+/g; let m;
      while ((m = re.exec(text))) {
        const s = m.index + (m[0].length - m[0].trimStart().length), e = m.index + m[0].trimEnd().length;
        if (e <= s) continue;
        const rg = document.createRange(); rg.setStart(...pos(s)); rg.setEnd(...pos(e));
        const tops = []; for (const q of rg.getClientRects()) { if (q.width < 1) continue; const cy = (q.top + q.bottom) / 2; if (!tops.some((t) => Math.abs(t - cy) < 8)) tops.push(cy); }
        groups.push({ text: text.slice(s, e), lines: tops.length });
      }
      const ov = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const btns = ['start', 'practice'].map((id) => document.getElementById(id).getBoundingClientRect());
      return { shown: true, groups, box: [kr.left, kr.top, kr.right, kr.bottom].map(Math.round), inside: kr.left >= 0 && kr.top >= 0 && kr.right <= innerWidth && kr.bottom <= innerHeight, hitsButton: btns.some((b) => ov(b, kr)) };
    });
    await page.screenshot({ path: path.join(out, `title-${w}x${h}-${touch ? 'touch' : 'mouse'}.png`) });
    const split = r.shown ? r.groups.filter((g) => g.lines > 1).map((g) => g.text) : [];
    const ok = (touch ? !r.shown : r.shown && split.length === 0 && r.inside && !r.hitsButton) && errors.length === 0;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${w}x${h} ${touch ? 'touch' : 'mouse'}: ${r.shown ? `提示 ${r.groups.length} 组、框 ${JSON.stringify(r.box)}${split.length ? '，拆到两行：' + split.map((s) => '「' + s + '」').join('') : '，没有一组被拆开'}${r.inside ? '' : '，出屏'}${r.hitsButton ? '，压住按钮' : ''}` : '提示隐藏'}${errors.length ? '，报错 ' + errors.join(' | ') : ''}`);
    await ctx.close();
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
