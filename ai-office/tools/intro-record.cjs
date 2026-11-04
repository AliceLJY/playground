// 录品牌片头（11-05 Alice 定：以后每支视频前面加像素办公室片头，片尾署名页是另一半）。
// 她定的结构：先是像素办公室那个头（真实网页顶部「AI 幕后 / 像素办公室.」）→ 镜头从网页里的办公室直接推进对应房间
// → 停在房间里看谁在干什么 → 接正片。竖屏 1080×1920、30fps、3.6 秒，出无声 intro.mp4（声音见 intro-sting.py）。
//   NODE_PATH="$(npm root -g)" node tools/intro-record.cjs <jobs.json> <out-dir>
// jobs.json: [{name, room, title}]；room 取下面 ROOMS 的键；每条输出 <out-dir>/<name>/intro.mp4。
// 房间坐标是塔楼布局（竖屏 portrait）逻辑像素，宽 360、高 1050；房间挪了要跟着改。view 是办公室自带的场景机位。
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const { createPreview } = require('./preview.cjs');
const [jobsFile, outDir] = process.argv.slice(2);
if (!jobsFile || !outDir) { console.error('usage: intro-record.cjs <jobs.json> <out-dir>'); process.exit(2); }
// ready(snapshot) = 房间里的人到位了才开始录（最多预热 60 秒）。
const settled = s => s.actors.every(a => !a.moving);
const ROOMS = {
  游戏室: { cx: 140, cy: 300, w: 250, view: 'games', line: '大家在玩游戏', ready: s => s.actualView === 'games' },
  会议室: { cx: 68, cy: 410, w: 150, view: 'meeting', line: 'AI 们在开会', ready: s => s.actualView === 'meeting' },
  阅读室: { cx: 70, cy: 916, w: 150, view: 'read', line: '在阅读室看书', ready: s => s.actors.filter(a => [25, 26].includes(a.gameSlot) && !a.moving).length >= 2 },
  制片室: { cx: 270, cy: 206, w: 170, view: 'orders', line: 'Grok 和 Muse 在出片', ready: settled },
  总监室: { cx: 66, cy: 126, w: 150, view: 'orders', line: 'CC 在派活', ready: settled },
  陈列室: { cx: 58, cy: 206, w: 150, view: 'orders', line: '作品都摆在这', ready: settled },
  办公室: { cx: 180, cy: 270, w: 340, view: 'orders', line: '大家都在忙', ready: settled },
};
const fps = 30, total = 108, HEAD_END = 1.0, ZOOM_END = 2.2, SIGN_AT = 2.25;
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
for (const j of jobs) if (!ROOMS[j.room]) { console.error(`unknown room ${j.room} (${j.name})`); process.exit(2); }
(async () => {
  const server = createPreview(); await new Promise(ok => server.listen(3197, '127.0.0.1', ok));
  const browser = await chromium.launch(); const errors = [];
  for (const job of jobs) {
    const R = ROOMS[job.room], dir = path.join(outDir, job.name), frames = path.join(dir, 'frames');
    fs.rmSync(frames, { recursive: true, force: true }); fs.mkdirSync(frames, { recursive: true });
    const page = await browser.newPage({ viewport: { width: 432, height: 768 }, deviceScaleFactor: 2.5 });
    page.on('pageerror', e => errors.push(`${job.name}: ${e.message}`));
    await page.goto(`http://127.0.0.1:3197/?demo=1&view=${R.view}`);
    await page.waitForFunction(() => window.__PLAYTEST__?.ready);
    let warm = 0;
    for (; warm < 60000; warm += 500) { const s = await page.evaluate(() => window.__PLAYTEST__.step(500)); if (warm >= 2000 && R.ready(s)) break; }
    if (warm >= 60000) errors.push(`${job.name}: room never settled for ${R.view}`);
    // The intro shows the real page head; hide the demo banner and the floor button, keep the office scrolled to the top.
    await page.evaluate(() => { const tf = document.querySelector('#to-fun'); if (tf) tf.style.setProperty('display', 'none', 'important'); const m = document.querySelector('#mode-text'); if (m) m.closest('p,div,section').style.visibility = 'hidden'; document.querySelector('#room-viewport').scrollTop = 0; });
    const shot = (await page.screenshot({ fullPage: true })).toString('base64');
    await page.evaluate(b64 => new Promise(ok => { const im = new Image(); im.onload = () => { window.__introPage = im; ok(); }; im.src = 'data:image/png;base64,' + b64; }), shot);
    const geo = await page.evaluate(() => { const c = document.querySelector('#office').getBoundingClientRect(), v = document.querySelector('#room-viewport').getBoundingClientRect(); return { cx: c.x + scrollX, cy: c.y + scrollY, cw: c.width, ch: c.height, vh: v.height }; });
    const f = geo.cw / 360, a = { x: 0, y: 4, w: 236 }, bw = R.w * f, b = { x: geo.cx + (R.cx - R.w / 2) * f, y: geo.cy + R.cy * f - bw * 16 / 9 / 2, w: bw };
    for (let i = 0; i < total; i++) {
      await page.evaluate(ms => window.__PLAYTEST__.step(ms), 1000 / fps);
      const t = i / fps, k = ease(Math.min(1, Math.max(0, (t - HEAD_END) / (ZOOM_END - HEAD_END))));
      const cam = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k };
      const data = await page.evaluate(({ cam, t, k, geo, room, line, title, SIGN_AT }) => {
        const src = document.querySelector('#office'), im = window.__introPage, o = document.createElement('canvas'); o.width = 1080; o.height = 1920;
        const g = o.getContext('2d'); g.imageSmoothingEnabled = false; g.fillStyle = '#efe7d4'; g.fillRect(0, 0, 1080, 1920);
        const s = 1080 / cam.w, X = x => (x - cam.x) * s, Y = y => (y - cam.y) * s;
        g.drawImage(im, X(0), Y(0), im.width / 2.5 * s, im.height / 2.5 * s);
        // Live office over the page: clipped to the page's 400 px window at first, opening to the whole tower as the camera dives.
        const clipH = geo.vh + (geo.ch - geo.vh) * k;
        g.save(); g.beginPath(); g.rect(X(geo.cx), Y(geo.cy), geo.cw * s, clipH * s); g.clip();
        g.drawImage(src, X(geo.cx), Y(geo.cy), geo.cw * s, geo.ch * s); g.restore();
        g.textAlign = 'center';
        const p = Math.min(1, Math.max(0, (t - SIGN_AT) / 0.18));
        if (p > 0) {
          const sc = 0.6 + 0.4 * p + 0.12 * Math.sin(Math.PI * p);
          g.save(); g.translate(540, 1440); g.scale(sc, sc);
          g.font = '700 80px "PingFang SC",system-ui'; const rw = g.measureText(room).width + 110;
          g.fillStyle = '#5a3b22'; g.beginPath(); g.roundRect(-rw / 2, -74, rw, 120, 16); g.fill();
          g.strokeStyle = '#d9b25a'; g.lineWidth = 8; g.stroke(); g.fillStyle = '#fff1c9'; g.fillText(room, 0, 16);
          g.font = '600 40px "PingFang SC",system-ui'; const lw = g.measureText(line).width + 50;
          g.fillStyle = '#253334cc'; g.beginPath(); g.roundRect(-lw / 2, 62, lw, 62, 31); g.fill(); g.fillStyle = '#fff6dc'; g.fillText(line, 0, 106);
          g.restore();
          if (title) {
            g.globalAlpha = Math.min(1, Math.max(0, (t - SIGN_AT - 0.15) / 0.2)); g.font = '600 54px "PingFang SC",system-ui';
            const lines = []; let cur = ''; for (const ch of title) { if (g.measureText(cur + ch).width > 920) { lines.push(cur); cur = ''; } cur += ch; } lines.push(cur);
            const bh = 36 + lines.length * 70, by = 1610;
            g.fillStyle = '#253334e6'; g.beginPath(); g.roundRect(60, by, 960, bh, 22); g.fill();
            g.fillStyle = '#fff6dc'; lines.forEach((l, j) => g.fillText(l, 540, by + 68 + j * 70)); g.globalAlpha = 1;
          }
        }
        if (t < 0.15) { g.fillStyle = `rgba(0,0,0,${1 - t / 0.15})`; g.fillRect(0, 0, 1080, 1920); }
        return o.toDataURL('image/jpeg', .93);
      }, { cam, t, k, geo, room: job.room, line: R.line, title: job.title, SIGN_AT });
      fs.writeFileSync(path.join(frames, String(i).padStart(5, '0') + '.jpg'), Buffer.from(data.split(',')[1], 'base64'));
    }
    await page.close();
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(frames, '%05d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', path.join(dir, 'intro.mp4')]);
    console.log('wrote', path.join(dir, 'intro.mp4'), `(warm ${warm / 1000}s)`);
  }
  await browser.close(); server.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
})();
