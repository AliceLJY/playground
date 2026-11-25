// 结果卡片不压棋盘（2026-11-25 Duet 巡检，SPEC 第 3 节「横屏放在棋盘下方」）。
// 横屏（含电脑）上，只要棋盘外有地方放得下卡片——棋盘下方空出的高度够卡片的高、侧栏里读数和按钮之间的空当
// 放得下按侧栏宽排的卡片、或棋盘右边空出的宽度 ≥ 240 px——卡片就不许和棋盘相交；三处都放不下（手机横屏）才允许落回棋盘区底部、靠「✕ 收起」看盘面（SPEC 第 1 节）。
// 无论放哪，卡片整块在屏内，「再来一局」「换难度」中心点到的是它们自己。胜、负两张卡各测一遍。
//   NODE_PATH="$(npm root -g)" node tools/card-check.cjs <page-url> <out-dir>
const { chromium } = require('playwright'), fs = require('node:fs'), path = require('node:path');
const [url, out] = process.argv.slice(2);
if (!url || !out) { console.error('用法：node tools/card-check.cjs <page-url> <out-dir>'); process.exit(2); }
fs.mkdirSync(out, { recursive: true });
const SIDE_MIN = 240;
(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  let failed = 0;
  for (const [w, h, touch] of [[1440, 800, false], [1365, 900, false], [1280, 720, false], [1920, 1080, false], [1024, 768, true], [844, 340, true], [390, 664, true]]) {
    for (const view of ['win', 'boom']) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
      const p = await ctx.newPage(), errors = [];
      p.on('pageerror', (e) => errors.push(e.message));
      await p.goto(url + (url.includes('?') ? '&' : '?') + 'view=' + view);
      await p.waitForFunction(() => window.__sweeper && window.__sweeper.ready && window.__sweeper.probe().card, null, { polling: 100, timeout: 10000 });
      await p.waitForTimeout(250);
      const r = await p.evaluate(() => {
        const L = window.__sweeper.probe().layout, bd = L.board, a = L.area;
        const c = document.getElementById('card').getBoundingClientRect();
        // 侧栏空当：读数下沿到按钮上沿；把卡片克隆一份按侧栏宽排一次量高
        const panelW = L.hud.w - 16, panelRoom = Math.min(L.btn.mode.y, L.btn.sound.y) - 8 - (L.readout.y + L.readout.h + 8);
        const probeCard = document.getElementById('card').cloneNode(true); probeCard.removeAttribute('id');
        Object.assign(probeCard.style, { position: 'fixed', left: '0', top: '0', bottom: 'auto', transform: 'none', width: panelW + 'px', maxHeight: 'none', visibility: 'hidden' });
        document.body.appendChild(probeCard); const panelNeed = probeCard.offsetHeight; probeCard.remove();
        const hit = (id) => { const e = document.getElementById(id).getBoundingClientRect(); return document.elementFromPoint(e.left + e.width / 2, e.top + e.height / 2) === document.getElementById(id); };
        return {
          land: L.land, card: { x0: c.left, y0: c.top, x1: c.right, y1: c.bottom }, board: { x0: bd.x, y0: bd.y, x1: bd.x + bd.w, y1: bd.y + bd.h },
          below: a.y + a.h - (bd.y + bd.h), panel: panelW >= 240 && panelNeed <= panelRoom, panelRoom, panelNeed, right: a.x + a.w - (bd.x + bd.w), vw: innerWidth, vh: innerHeight, again: hit('again'), levels: hit('levels-btn'),
          scrolls: document.getElementById('card').scrollHeight > document.getElementById('card').clientHeight + 1,
        };
      });
      await p.screenshot({ path: path.join(out, `card-${view}-${w}x${h}.png`) });
      const { card: c, board: bd } = r;
      const overlap = c.x0 < bd.x1 && bd.x0 < c.x1 && c.y0 < bd.y1 && bd.y0 < c.y1;
      const room = r.land && (r.below >= c.y1 - c.y0 + 8 || r.panel || r.right >= SIDE_MIN + 16);
      const inside = c.x0 >= 0 && c.y0 >= 0 && c.x1 <= r.vw + 0.5 && c.y1 <= r.vh + 0.5;
      const ok = (!room || !overlap) && inside && r.again && r.levels && !r.scrolls && errors.length === 0;
      if (!ok) failed++;
      const R = (o) => [o.x0, o.y0, o.x1, o.y1].map(Math.round);
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${view} ${w}x${h}${touch ? ' touch' : ''}: 卡片 ${JSON.stringify(R(c))} 棋盘 ${JSON.stringify(R(bd))}，棋盘下方空 ${Math.round(r.below)} px、侧栏空当 ${Math.round(r.panelRoom)} px（卡片要 ${r.panelNeed}）、右边空 ${Math.round(r.right)} px → ${room ? '放得下，不许压棋盘' : '放不下，允许落在棋盘区底部'}；${overlap ? '压住棋盘' : '没压棋盘'}${inside ? '' : '，卡片出屏'}${r.again && r.levels ? '' : '，卡片按钮点不到'}${r.scrolls ? '，卡片要滚动' : ''}${errors.length ? '，报错 ' + errors.join(' | ') : ''}`);
      await ctx.close();
    }
  }
  await b.close();
  process.exit(failed ? 1 : 0);
})();
