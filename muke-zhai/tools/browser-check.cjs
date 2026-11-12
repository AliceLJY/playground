// 穆柯寨 · 浏览器验收。用法（先在本目录起 http.server）：
//   NODE_PATH="$(npm root -g)" node tools/browser-check.cjs http://127.0.0.1:8793/ <截图目录>
// 线上复验把地址换成 https://aliceljy.github.io/playground/muke-zhai/
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const base = process.argv[2], out = process.argv[3] || 'shots';
fs.mkdirSync(out, { recursive: true });
const VIEWS = [
  { name: 'desktop', width: 1280, height: 720, mobile: false },
  { name: 'phone', width: 390, height: 664, mobile: true },
];
const SHOTS = [
  { name: 'play', q: '' },
  { name: 'meng', q: '?view=meng' },
  { name: 'duel', q: '?view=duel' },
  { name: 'end', q: '?view=end' },
  { name: 'teach3', q: '?view=teach3' },
  { name: 'demo', q: '?view=demo' },
  { name: 'ult', q: '?view=ult' },
  { name: 'chain3', q: '?view=chain3' },
];
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); };
const overlap = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);

(async () => {
  const browser = await chromium.launch();
  for (const v of VIEWS) {
    for (const s of SHOTS) {
      const tag = `${v.name}/${s.name}`;
      const page = await browser.newPage({
        viewport: { width: v.width, height: v.height }, isMobile: v.mobile, hasTouch: v.mobile, deviceScaleFactor: 1,
      });
      const errs = [], bad = [];
      page.on('pageerror', (e) => errs.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
      page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
      page.on('requestfailed', (r) => bad.push(`failed ${r.url()}`));
      await page.goto(base + s.q, { waitUntil: 'load' });
      await page.waitForFunction(() => self.__PLAYTEST__ && self.__PLAYTEST__.ready, null, { polling: 100, timeout: 30000 });
      await page.waitForTimeout(s.q ? 300 : 1500);
      const snap = await page.evaluate(() => self.__PLAYTEST__.snapshot());

      // 机位钩子回报的状态要和请求对得上
      if (s.name === 'meng') check(snap.view === 'meng' && snap.stage === 1 && snap.e.act === 'warn', `[${tag}] 孟良处于预警（回报 ${snap.e.act}，t=${snap.t}）`);
      if (s.name === 'duel') {
        const dx = Math.abs(snap.e.x - snap.p.x);
        check(snap.view === 'duel' && snap.stage === 2 && dx >= 190 && dx <= 215, `[${tag}] 第二场对峙，相距 ${dx.toFixed(0)} 像素（目标约 200）`);
      }
      if (s.name === 'end') check(snap.phase === 'end' && snap.p.act === 'victory' && snap.e.act === 'victory', `[${tag}] 结尾并肩亮相（回报 ${snap.phase} ${snap.p.act}/${snap.e.act}）`);
      if (s.name === 'teach3') {
        check(snap.view === 'teach3' && snap.tutorial === 'guard' && snap.timeScale < 1 && snap.e.act === 'warn',
          `[${tag}] 定格在教学第三步：孟良慢慢举斧（步骤 ${snap.tutorial}，时间 ${snap.timeScale} 倍，${snap.e.act}）`);
        check(snap.glowKeys.includes('guard') && snap.glowKeys.length === 1, `[${tag}] 只有「架」在亮（${snap.glowKeys}）`);
        check(snap.qi === 5 && snap.sub && /架|K/.test(snap.sub), `[${tag}] 提示字提到「架」，气满（${snap.sub}）`);
      }
      if (s.name === 'ult') {
        check(snap.view === 'ult' && snap.ult === 'strikes' && snap.ultStrike >= 3 && snap.shi === 0, `[${tag}] 定格在大招第三枪（${snap.ult}，已出 ${snap.ultStrike} 枪，势 ${snap.shi}）`);
        const gp = await page.evaluate(() => self.__PLAYTEST__.ghostPixels());
        check(gp.ult && gp.pixels >= 400, `[${tag}] 残影确实画出来了（与无残影渲染相比变化 ${gp.pixels} 像素）`);
      }
      if (s.name === 'chain3') {
        check(snap.view === 'chain3' && snap.p.act === 'attack' && snap.stats.chain3 >= 1, `[${tag}] 定格在三连刺第三枪命中（${snap.p.act}，三连 ${snap.stats.chain3}）`);
      }
      if (s.name === 'demo') {
        check(snap.demo && snap.lit.includes('guard') && snap.sub === '架', `[${tag}] 示范进行中：「架」亮、出词「架」（亮 ${snap.lit}，字幕 ${snap.sub}）`);
        const own = await page.evaluate(() => self.__PLAYTEST__.mainSnapshot());
        check(own.t === 0 && own.helmets === 3 && own.qi === 5, `[${tag}] 她自己的局没被示范改动（t=${own.t}）`);
      }
      if (s.name === 'play') check(snap.stage === 1 && snap.phase === 'play' && snap.t > 500, `[${tag}] 正常入口在第一场游玩（t=${snap.t}）`);

      check(errs.length === 0, `[${tag}] 页面无报错 ${errs.join(' | ')}`);
      check(bad.length === 0, `[${tag}] 资源全部加载 ${bad.join(' | ')}`);
      const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth - innerWidth, document.documentElement.scrollHeight - innerHeight));
      check(overflow <= 0, `[${tag}] 页面不溢出（${overflow}px）`);

      // 角色画出来了：加背景与仅背景两次渲染，在人物格子里数变化的像素。
      // 精灵压了夜色，亮度比原图低，所以阈值取 10%（原图平光时同一读数约 25–35%）。
      const cov = await page.evaluate(() => self.__PLAYTEST__.coverage());
      const need = s.name === 'meng' || s.name === 'play' ? ['p', 'e'] : ['p', 'e'];
      for (const id of need) {
        check(cov[id].ratio >= 0.10, `[${tag}] ${id === 'p' ? '穆桂英' : '对手'}确实画出来了（变化像素 ${(cov[id].ratio * 100).toFixed(1)}%）`);
      }
      // 大部分画面是暗的（ART.md 第 1 条）
      const lum = await page.evaluate(() => self.__PLAYTEST__.luma());
      check(lum.median <= 0.3 && lum.brightShare <= 0.06, `[${tag}] 画面够暗：亮度中位 ${lum.median.toFixed(2)}，高亮占比 ${(lum.brightShare * 100).toFixed(1)}%`);
      await page.screenshot({ path: path.join(out, `${v.name}-${s.name}.png`) });

      // 界面各元素的外框两两不重叠；手机竖屏另查主角高度与画布占比
      const checkLayout = async (label) => {
        const lay = await page.evaluate(() => self.__PLAYTEST__.layout());
        const bad2 = [];
        for (let i = 0; i < lay.boxes.length; i++) {
          for (let j = i + 1; j < lay.boxes.length; j++) {
            if (overlap(lay.boxes[i], lay.boxes[j])) bad2.push(lay.boxes[i].name + '×' + lay.boxes[j].name);
          }
        }
        check(bad2.length === 0, `[${tag}] ${label}界面元素互不重叠（${lay.boxes.map((b) => b.name).join(',')}）${bad2.join(',')}`);
        return lay;
      };
      const lay = await checkLayout('');
      if (v.mobile) {
        check(lay.portrait, `[${tag}] 手机竖屏用竖取景窗`);
        check(lay.canvas.h >= lay.viewport.h * 0.55, `[${tag}] 画布高度 ${lay.canvas.h.toFixed(0)} 不小于可视区的 55%（${(lay.viewport.h * 0.55).toFixed(0)}）`);
        check(cov.p.heightCss >= 240, `[${tag}] 主角在屏幕上高 ${cov.p.heightCss.toFixed(0)} CSS 像素，不小于 240`);
      }
      if (s.name === 'teach3' || s.name === 'demo') {
        const sub = lay.boxes.find((b) => b.name === 'subtitle');
        check(!!sub && sub.left >= 0 && sub.right <= lay.viewport.w && sub.top >= 0 && sub.bottom <= lay.viewport.h,
          `[${tag}] 提示字完整在可视区内 ${sub ? JSON.stringify([sub.left, sub.right, sub.top, sub.bottom].map(Math.round)) : '没有字幕'}`);
        {
          const cls = await page.evaluate(() => [...document.querySelectorAll('#pad button')].map((b) => [b.dataset.k, b.className]));
          const want = s.name === 'teach3' ? 'glow' : 'lit';
          check(cls.some(([k, c]) => k === 'guard' && c.includes(want)), `[${tag}] 触屏「架」键处于${want === 'glow' ? '高亮（呼吸亮边）' : '亮起'} ${JSON.stringify(cls)}`);
          if (s.name === 'teach3') check(cls.filter(([, c]) => c.includes('glow')).length === 1, `[${tag}] 只有一个键在亮`);
        }
        check(lay.boxes.some((b) => b.name === (s.name === 'teach3' ? 'skip' : 'demoTag')), `[${tag}] ${s.name === 'teach3' ? '教学里有「跳过」' : '示范里有「点一下退出」'}`);
      }
      if (s.name === 'teach3') {
        // 真操作：手机按住「架」按钮、桌面按住 K；教学应前进到第四步
        await page.evaluate(() => self.__PLAYTEST__.play());
        if (v.mobile) {
          const gb = await page.locator('#pad button[data-k="guard"]').boundingBox();
          await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
          await page.mouse.down();
        } else await page.keyboard.down('k');
        const adv = await page.waitForFunction(() => self.__PLAYTEST__.snapshot().tutorial === 'punish', null, { polling: 50, timeout: 4000 }).then(() => true, () => false);
        if (v.mobile) await page.mouse.up(); else await page.keyboard.up('k');
        const after = await page.evaluate(() => self.__PLAYTEST__.snapshot());
        check(adv && after.stats.parries === 1 && after.qi === 5, `[${tag}] 真${v.mobile ? '触摸按住「架」' : '按住 K'}后教学前进到第四步，出架开，气不掉（${after.tutorial}，架开 ${after.stats.parries}）`);
      }
      if (s.name === 'end') {
        // 字幕停稳后再出「再来一遍」，此时它与字幕、界面也不能重叠
        await page.evaluate(() => self.__PLAYTEST__.step(4000));
        const lay2 = await checkLayout('字幕过后 ');
        check(lay2.boxes.some((b) => b.name === 'prompt') && !lay2.boxes.some((b) => b.name === 'subtitle'), `[${tag}] 字幕过后出「再来一遍」且字幕已退（${lay2.boxes.map((b) => b.name)}）`);
        await page.screenshot({ path: path.join(out, `${v.name}-end2.png`) });
      }

      if (s.name === 'play') {
        {
          const btns = await page.evaluate(() => [...document.querySelectorAll('#pad button')].map((b) => {
            const r = b.getBoundingClientRect();
            const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return {
              k: b.dataset.k, left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height,
              hasKbd: getComputedStyle(b.querySelector('kbd')).display !== 'none', inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, hit: b.contains(hit),
            };
          }));
          check(btns.length === 6, `[${tag}] 六个键都在（${btns.map((b) => b.k)}）`);
          check(btns.every((b) => b.inView && b.hit), `[${tag}] 六个键完整在可视区且点得到 ${JSON.stringify(btns.filter((b) => !(b.inView && b.hit)))}`);
          check(btns.every((b) => b.w >= 44 && b.h >= 44), `[${tag}] 每个键不小于 44 像素`);
          check(btns.every((b) => b.hasKbd === !v.mobile), `[${tag}] 键帽${v.mobile ? '在手机上隐藏' : '在桌面上显示'}`);
          let clash = [];
          for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) if (overlap(btns[i], btns[j])) clash.push(btns[i].k + '×' + btns[j].k);
          check(clash.length === 0, `[${tag}] 六个键互不重叠 ${clash.join(',')}`);
          const cv = await page.evaluate(() => { const r = document.getElementById('stage').getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; });
          check(btns.every((b) => !overlap(b, cv)), `[${tag}] 触屏键不压住画面`);
        }
        if (v.mobile) {
          // 真实触摸：按住右键走，松开停；点一下出枪
          const box = await page.locator('#pad button[data-k="right"]').boundingBox();
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          const x0 = (await page.evaluate(() => self.__PLAYTEST__.snapshot())).p.x;
          await page.mouse.down(); await page.waitForTimeout(600);
          const mid = await page.evaluate(() => self.__PLAYTEST__.snapshot());
          await page.mouse.up(); await page.waitForTimeout(200);
          const end = await page.evaluate(() => self.__PLAYTEST__.snapshot());
          check(mid.p.act === 'walk' && mid.p.x > x0, `[${tag}] 按住右键往前走（x ${x0}→${mid.p.x}）`);
          check(end.p.act === 'idle', `[${tag}] 松开后站定（${end.p.act}）`);
          await page.locator('#pad button[data-k="attack"]').dispatchEvent('pointerdown');
          await page.waitForTimeout(150);
          const atk = await page.evaluate(() => self.__PLAYTEST__.snapshot());
          check(atk.p.act === 'attack', `[${tag}] 点「刺」出枪（${atk.p.act}）`);
        } else {
          const x0 = snap.p.x;
          await page.keyboard.down('ArrowRight'); await page.waitForTimeout(500);
          const mid = await page.evaluate(() => self.__PLAYTEST__.snapshot());
          await page.keyboard.up('ArrowRight');
          check(mid.p.act === 'walk' && mid.p.x > x0, `[${tag}] 按住 → 往前走（x ${x0}→${mid.p.x}）`);
          await page.keyboard.down('j'); await page.waitForTimeout(90);
          const jCls = await page.evaluate(() => document.querySelector('#pad button[data-k="attack"]').className);
          await page.keyboard.up('j');
          check(jCls.includes('lit'), `[${tag}] 按键盘 J 时「刺」键亮起（${jCls}）`);
          check((await page.evaluate(() => self.__PLAYTEST__.snapshot())).p.act === 'attack', `[${tag}] J 出枪`);
          await page.waitForTimeout(900);
          await page.keyboard.down('k'); await page.waitForTimeout(150);
          check((await page.evaluate(() => self.__PLAYTEST__.snapshot())).p.act === 'guard', `[${tag}] 按住 K 架枪`);
          await page.keyboard.up('k'); await page.waitForTimeout(500);
          await page.keyboard.press('l'); await page.waitForTimeout(150);
          check((await page.evaluate(() => self.__PLAYTEST__.snapshot())).p.act === 'dodge', `[${tag}] L 翻身闪避`);
          await page.waitForFunction(() => self.__PLAYTEST__.snapshot().p.act === 'idle', null, { polling: 50, timeout: 4000 });
          const gbox = await page.locator('#pad button[data-k="guard"]').boundingBox();
          await page.mouse.move(gbox.x + gbox.width / 2, gbox.y + gbox.height / 2);
          await page.mouse.down(); await page.waitForTimeout(250);
          const gs = await page.evaluate(() => self.__PLAYTEST__.snapshot());
          await page.mouse.up();
          check(gs.p.act === 'guard', `[${tag}] 鼠标按住「架」键，主角进入架枪（${gs.p.act}）`);
        }
      }
      if (s.name === 'play') {
        // 跳过 → 进正常局 → 重新打开页面不再出教学，但有「教学」「看示范」入口
        await page.click('#skip');
        const sk = await page.evaluate(() => self.__PLAYTEST__.snapshot());
        check(sk.tutorial === null && sk.helmets === 3 && sk.timeScale === 1, `[${tag}] 点「跳过」直接进正常局（${sk.tutorial}）`);
        await page.reload({ waitUntil: 'load' });
        await page.waitForFunction(() => self.__PLAYTEST__ && self.__PLAYTEST__.ready, null, { polling: 100, timeout: 30000 });
        await page.waitForTimeout(300);
        const again = await page.evaluate(() => self.__PLAYTEST__.snapshot());
        check(again.tutorial === null, `[${tag}] 教学过一次后重新打开不再出（${again.tutorial}）`);
        const vis = await page.evaluate(() => ({ r: !document.getElementById('replay').hidden, d: !document.getElementById('demoBtn').hidden }));
        check(vis.r && vis.d, `[${tag}] 留有「教学」「看示范」入口 ${JSON.stringify(vis)}`);
        const lay3 = await checkLayout('跳过后 ');
        // 点「看示范」：独立一局跑起来，点任意处回来，她的局没变
        const before = await page.evaluate(() => JSON.stringify(self.__PLAYTEST__.mainSnapshot()));
        await page.click('#demoBtn');
        await page.waitForTimeout(500);
        const dm = await page.evaluate(() => self.__PLAYTEST__.snapshot());
        check(dm.demo === true, `[${tag}] 点「看示范」进入示范`);
        await page.mouse.click(v.width / 2, v.height / 2);
        await page.waitForTimeout(200);
        const back = await page.evaluate(() => self.__PLAYTEST__.snapshot());
        check(back.demo === false, `[${tag}] 点任意处回到自己的局`);
        const afterMain = await page.evaluate(() => JSON.stringify(self.__PLAYTEST__.mainSnapshot()));
        // 她的局在这 0.7 秒里自己也在走，所以只比不该变的字段
        const a = JSON.parse(before), b = JSON.parse(afterMain);
        check(a.qi === b.qi && a.helmets === b.helmets && a.stage === b.stage && b.t - a.t < 2500, `[${tag}] 示范前后她的气、金盔、场次不变`);
      }
      await page.close();
    }
  }
  await browser.close();
  console.log(fails.length ? `\n${fails.length} 项未过` : '\n全部通过');
  process.exit(fails.length ? 1 : 0);
})();
