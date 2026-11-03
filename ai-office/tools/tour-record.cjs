// 录「像素办公室招聘启事」：竖屏 1080×1920、30fps，按镜头表逐帧推进办公室、裁出 9:16 窗口、叠字幕，出无声 office.mp4。
//   NODE_PATH="$(npm root -g)" node tools/tour-record.cjs <shots.json> <out-dir>
// shots.json: [{view, seconds, speed?, warm?, caption, captionTop?, cam:[{x,y,w},{x,y,w}] | "cats"}]，坐标是办公室逻辑像素（宽 360）；
// 窗口高 = w×16/9，超出画布的部分画成米色底（最后一镜拉远看整栋楼用）。cam 为 "cats" 时镜头跟着两只猫的中点。
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const { createPreview } = require('./preview.cjs');
const [shotsFile, outDir] = process.argv.slice(2);
if (!shotsFile || !outDir) { console.error('usage: tour-record.cjs <shots.json> <out-dir>'); process.exit(2); }
const shots = JSON.parse(fs.readFileSync(shotsFile, 'utf8')), fps = 30, frames = path.join(outDir, 'frames');
fs.mkdirSync(frames, { recursive: true });
const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
(async () => {
  const server = createPreview(); await new Promise(ok => server.listen(3199, '127.0.0.1', ok));
  const browser = await chromium.launch();
  let n = 0; const errors = [];
  for (const [k, shot] of shots.entries()) {
    const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
    page.on('pageerror', e => errors.push(`${shot.view}: ${e.message}`));
    await page.goto(`http://127.0.0.1:3199/?demo=1${shot.view ? '&view=' + shot.view : ''}`);
    await page.waitForFunction(() => window.__PLAYTEST__?.ready);
    if (shot.warm) await page.evaluate(ms => window.__PLAYTEST__.step(ms), shot.warm);
    const total = Math.round(shot.seconds * fps); let follow = null;
    for (let i = 0; i < total; i++) {
      const snap = await page.evaluate(ms => window.__PLAYTEST__.step(ms), 1000 / fps * (shot.speed || 1));
      let cam;
      if (shot.cam === 'cats') {
        const c = snap.cats || [], mx = c.reduce((s, q) => s + q.x, 0) / (c.length || 1), my = c.reduce((s, q) => s + q.y, 0) / (c.length || 1);
        const w = 210, target = { x: mx - w / 2, y: my - w * 16 / 9 / 2 - 10, w };
        follow = follow ? { x: follow.x + (target.x - follow.x) * .08, y: follow.y + (target.y - follow.y) * .08, w } : target; cam = follow;
      } else { const [a, b] = shot.cam, e = ease(i / Math.max(1, total - 1)); cam = { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, w: a.w + (b.w - a.w) * e }; }
      const data = await page.evaluate(({ cam, caption, top, tag }) => {
        const src = document.querySelector('#office'), o = document.createElement('canvas'); o.width = 1080; o.height = 1920;
        const g = o.getContext('2d'); g.imageSmoothingEnabled = false; g.fillStyle = '#efe7d4'; g.fillRect(0, 0, 1080, 1920);
        const W = src.width / 2, H = src.height / 2, h = cam.w * 16 / 9;
        let x = Math.max(cam.w <= W ? 0 : -1e9, Math.min(cam.x, cam.w <= W ? W - cam.w : 1e9)), y = Math.max(h <= H ? 0 : -1e9, Math.min(cam.y, h <= H ? H - h : 1e9));
        const s = 1080 / cam.w; g.drawImage(src, 0, 0, src.width, src.height, -x * s, -y * s, W * s, H * s);
        g.fillStyle = '#25333480'; g.fillRect(0, 0, 1080, 92); g.font = '600 38px "PingFang SC",system-ui'; g.fillStyle = '#fff6dc'; g.textAlign = 'center'; g.fillText(tag, 540, 60);
        if (caption) {
          g.font = '600 46px "PingFang SC",system-ui';
          // Break by clauses (11-04 Alice: 「按句子分上下行」): split after 。，、；：！？ into units, then choose the line breaks
          // that keep every line within 900 px and as even as possible; only a clause wider than a line is cut by characters.
          const W = 900, w = t => g.measureText(t).width, units = [];
          for (const part of caption.match(/[^。，、；：！？]+[。，、；：！？]*/g) || [caption]) {
            if (w(part) <= W) { units.push(part); continue; }
            let cur = ''; for (const ch of part) { if (w(cur + ch) > W) { units.push(cur); cur = ''; } cur += ch; } units.push(cur);
          }
          const n = units.length, best = Array(n + 1).fill(null); best[0] = { cost: 0, lines: [] };
          for (let i = 1; i <= n; i++) for (let j = 0; j < i; j++) {
            if (!best[j]) continue; const text = units.slice(j, i).join(''), tw = w(text); if (tw > W) continue;
            // Prefer ending a line on a full stop (keeps 「会干活，会吃饭，会撸猫。」 together); a comma break costs extra.
            const c = { cost: best[j].cost + (W - tw) ** 2 + 1e6 + (i < n && !/[。！？]$/.test(text) ? 120000 : 0), lines: [...best[j].lines, text] };
            if (!best[i] || c.cost < best[i].cost) best[i] = c;
          }
          const lines = best[n] ? best[n].lines : [caption];
          const bh = 40 + lines.length * 64, by = top ? 130 : 1920 - 120 - bh;
          g.fillStyle = '#253334d8'; g.beginPath(); g.roundRect(60, by, 960, bh, 22); g.fill();
          g.fillStyle = '#fff6dc'; lines.forEach((l, j) => g.fillText(l, 540, by + 66 + j * 64));
        }
        return o.toDataURL('image/jpeg', .92);
      }, { cam, caption: shot.caption, top: !!shot.captionTop, tag: '像素办公室 · 招聘启事' });
      fs.writeFileSync(path.join(frames, String(n++).padStart(5, '0') + '.jpg'), Buffer.from(data.split(',')[1], 'base64'));
    }
    await page.close(); console.log(`shot ${k + 1}/${shots.length} ${shot.view || 'hero'} done (${n} frames)`);
  }
  await browser.close(); server.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(frames, '%05d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', path.join(outDir, 'office.mp4')]);
  console.log('wrote', path.join(outDir, 'office.mp4'));
})();
