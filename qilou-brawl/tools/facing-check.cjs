// 回归检查（2026-10-20 Alice 报：按 W 跑起来人往右拧）：自动驾驶打一阵，逐帧读身体实际朝向与逻辑朝向的夹角。
// 跑、走、翻滚、出招时身体应朝着走或打的方向；整段动作的平均偏差超过阈值即失败。
// 用 Alice 撞到的那一版（所有片段统一 -90°、不分段补偿）校准过：跑 -74°、踢 -80°、翻滚 -82°、出拳 -113°，全部 FAIL；修好后都在阈值内。
//   NODE_PATH="$(npm root -g)" node tools/facing-check.cjs <url> [seconds]
const { chromium } = require('playwright');
const LIMIT = { move: 25, roll: 30, attack: 50 }; // 度，按整段动作的平均偏差判；出拳本来就侧身，放宽。
// 待机不判：一局里只有二十来帧且混着淡入，坏版本里画面是对的也会被判红（校准时见过）
(async () => {
  const [url, secs = '25'] = process.argv.slice(2);
  const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await (await b.newContext({ viewport: { width: 640, height: 400 } })).newPage();
  await page.goto(url + (url.includes('?') ? '&' : '?') + 'auto&seed=3&fast=2');
  await page.waitForFunction(() => window.__qilou && window.__qilou.ready, null, { polling: 200, timeout: 90000 });
  const rows = await page.evaluate(async (ms) => {
    const out = [], t0 = performance.now();
    while (performance.now() - t0 < ms) {
      await new Promise((r) => requestAnimationFrame(r));
      // 只量阿龙：对手的锁骨位置受 PINOC 自动绑骨影响（狮头那一个画面朝向对、锁骨算出来却偏 120°），不可信
      const ids = [0];
      for (const id of ids) { const f = window.__qilou.facing(id); if (f) out.push({ id, ...f }); }
    }
    return out;
  }, +secs * 1000);
  // 每段动作取所有帧夹角的圆周平均：摆臂、扭肩这类来回摆动会相互抵消，剩下的是整段动作的系统偏差。
  // 转身踢整段身体转一圈，平均没有意义，不判。
  const acc = {};
  for (const r of rows) {
    if (!(r.state in LIMIT) || r.clip === 'spin') continue;
    const k = `${r.state}:${r.clip}`, a = acc[k] || (acc[k] = { n: 0, sx: 0, sy: 0 });
    a.n++; a.sx += Math.cos(r.diff / 57.2958); a.sy += Math.sin(r.diff / 57.2958);
  }
  let fail = false;
  for (const k of Object.keys(acc).sort()) {
    const a = acc[k], mean = Math.round(Math.atan2(a.sy, a.sx) * 57.2958), lim = LIMIT[k.split(':')[0]];
    const ok = Math.abs(mean) <= lim; if (!ok) fail = true;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${k.padEnd(26)} frames ${String(a.n).padStart(5)}  mean ${String(mean).padStart(4)}°  (limit ±${lim}°)`);
  }
  await b.close(); process.exit(fail ? 1 : 0);
})();
