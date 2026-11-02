// 跨用户痕迹的浏览器检查：页面里的 TRACE_ENDPOINT 换成一个假地址，请求由 Playwright 拦下来作答，部署前后都能跑。
//   NODE_PATH="$(npm root -g)" node tools/traces-check.cjs <page-url> <out-dir>
// 走的是正常入口（不带 view）：门口等远端 → 稍等 → 领位；别人的回放标「有人」；离席上传只带 v/dur/acts；下次进门认出自己那条。
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path');
const D = require('../src/core.js');
const FAKE = 'https://datai-traces.check.workers.dev';

(async () => {
  const [url, out] = process.argv.slice(2);
  if (!url) { console.error('用法：node tools/traces-check.cjs <page-url> <out-dir>'); process.exit(2); }
  fs.mkdirSync(out || 'check-out', { recursive: true });
  const b = await chromium.launch();
  let fail = 0;
  const ok = (name, cond, extra) => { console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ' · ' + extra : ''}`); if (!cond) fail++; };
  const remoteList = D.syntheticVisits(9, 13, 240).map((v, i) => ({ k: 'r' + i, at: Date.now() - (i + 1) * 20 * 3600000, v: 1, dur: v.dur, acts: v.acts }));

  async function open(ctx, { delay = 600, list = remoteList, hang = false, posts }) {
    const p = await ctx.newPage();
    const errors = []; p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await p.route('**/src/game.js', async (route) => {
      const r = await route.fetch(); const body = (await r.text()).replace(/const TRACE_ENDPOINT = (null|'[^']*');/, `const TRACE_ENDPOINT = '${FAKE}';`);
      await route.fulfill({ response: r, body });
    });
    await p.route(FAKE + '/**', async (route) => {
      const req = route.request();
      if (req.method() === 'GET') {
        if (hang) return; // 永远不回
        await new Promise((r) => setTimeout(r, delay));
        return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(list) });
      }
      if (req.method() === 'POST') { posts && posts.push(JSON.parse(req.postData())); return route.fulfill({ status: 201, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ k: 'mine-1' }) }); }
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' } });
    });
    await p.goto(url + (url.includes('?') ? '&' : '?') + 'mute=1');
    await p.waitForFunction(() => window.__datai && window.__datai.ready, null, { polling: 50 });
    return { p, errors };
  }

  // 1. 门口稍等 → 远端到了 → 领位
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 664 }, deviceScaleFactor: 2, hasTouch: true });
    const posts = [];
    const { p, errors } = await open(ctx, { delay: 900, posts });
    const s0 = await p.evaluate(() => window.__datai.snapshot());
    const sitBtn0 = await p.evaluate(() => document.querySelector('#bar button[data-act="0"]').disabled);
    ok('进门先等远端：伙计说稍等、落座键灰着', s0.waiting && /稍等/.test(s0.hint) && sitBtn0, s0.hint);
    await p.screenshot({ path: path.join(out, '1-door-waiting.png') });
    await p.waitForFunction(() => !window.__datai.snapshot().waiting, null, { polling: 50, timeout: 4000 });
    const s1 = await p.evaluate(() => window.__datai.snapshot());
    const labels = await p.evaluate(() => window.__datai.state.ghosts.map((g) => g.label));
    ok('远端 9 条进了大堂，标「有人 · …」', s1.remote === 9 && labels.filter((l) => l.startsWith('有人 · ')).length === 9, labels.slice(0, 3).join(' / '));
    ok('分桌：9 位别人 + 你 = 3 桌，你进第 3 桌', JSON.stringify(s1.tables.map((t) => t.count)) === '[4,4,2]' && s1.me.table === 3, JSON.stringify(s1.tables));
    ok('伙计领位提示、门口有人等位', /第 3 桌/.test(s1.hint) && s1.queue.length === 3, `${s1.hint} · 等位 ${s1.queue.length}`);
    await p.screenshot({ path: path.join(out, '2-door-ready.png') });
    await p.click('#bar button[data-act="0"]');
    await p.evaluate(() => { window.__datai.chooseTea('puer'); window.__datai.pause(true); for (let i = 0; i < 80; i++) window.__datai.step(100); });
    await p.click('#bar button[data-act="1"]'); await p.click('#bar button[data-act="4"]');
    await p.evaluate(() => { for (let i = 0; i < 160; i++) window.__datai.step(100); });
    const s2 = await p.evaluate(() => window.__datai.snapshot());
    ok('落座后桌上有别人的回放在动、门口换过人', s2.others.length === 1 && s2.queueIdx >= 1, `同桌 ${s2.others.length} · 领走 ${s2.queueIdx}`);
    await p.screenshot({ path: path.join(out, '3-seated.png') });
    await p.click('#bar button[data-act="6"]');
    await p.waitForTimeout(400);
    ok('离席上传一条，只有 v/dur/acts', posts.length === 1 && JSON.stringify(Object.keys(posts[0]).sort()) === '["acts","dur","v"]' && posts[0].acts.length >= 3, JSON.stringify(posts[0]).slice(0, 90));
    const posted = await p.evaluate(() => localStorage.getItem('datai-posted'));
    ok('记下了自己那条的 key', posted === '["mine-1"]', posted);
    ok('零报错', errors.length === 0, errors.join(' | '));
    // 2. 再开一次：远端名单里有自己那条，不当成别人
    const { p: p2, errors: e2 } = await open(ctx, { delay: 100, list: [{ k: 'mine-1', at: Date.now() - 60000, ...posts[0] }, ...remoteList.slice(0, 2)] });
    await p2.waitForFunction(() => !window.__datai.snapshot().waiting, null, { polling: 50, timeout: 4000 });
    const s3 = await p2.evaluate(() => window.__datai.snapshot());
    const l3 = await p2.evaluate(() => window.__datai.state.ghosts.map((g) => g.label));
    ok('自己上传过的那条回来时是「你 · 刚才」，不算「有人」', s3.remote === 2 && l3.filter((l) => l.startsWith('你 · ')).length === 1, l3.join(' / '));
    ok('第二次零报错', e2.length === 0, e2.join(' | '));
    await ctx.close();
  }
  // 3. 远端不回：最多 3 秒后照常开桌
  {
    const ctx = await b.newContext({ viewport: { width: 412, height: 700 } });
    const { p, errors } = await open(ctx, { hang: true });
    const t0 = Date.now();
    await p.waitForFunction(() => !window.__datai.snapshot().waiting, null, { polling: 50, timeout: 5000 });
    const waited = Date.now() - t0;
    const s = await p.evaluate(() => window.__datai.snapshot());
    const sitOk = await p.evaluate(() => !document.querySelector('#bar button[data-act="0"]').disabled);
    ok('远端不回，≤4 秒后照常能落座，只有本机记录（新访客桌上两个常客）', waited < 3800 && sitOk && s.remote === 0 && s.residents.length === 2 && s.tables.length === 1, `${waited} ms`);
    ok('零报错', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  // 4. 固定机位 crowd：横屏也看得到等位
  for (const [tag, w, h] of [['iphone-390x664', 390, 664], ['landscape-844x340', 844, 340], ['desktop-1280x720', 1280, 720]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    await p.goto(url + (url.includes('?') ? '&' : '?') + 'view=crowd&door=1&mute=1');
    await p.waitForFunction(() => window.__datai && window.__datai.ready, null, { polling: 50 });
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(out, `crowd-door-${tag}.png`) });
    const s = await p.evaluate(() => window.__datai.snapshot());
    ok(`crowd 机位 ${tag}：10 位别人、门口等位`, s.remote === 10 && s.queue.length >= 3, JSON.stringify(s.tables.map((t) => t.count)));
    await ctx.close();
  }
  await b.close();
  console.log(fail ? `${fail} 项没过` : '全部通过');
  process.exit(fail ? 1 : 0);
})();
