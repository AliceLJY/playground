// 录「像素办公室日常」系列（11-05 起，第 1 集带娃上班）：竖屏 1080×1920、30fps，每个镜头从演示办公室的某个北京时间起，
// 等人走到位再录，镜头可以跟着老板或两个孩子走，叠字幕，出无声 office.mp4 和 shots.json 里每镜的起止秒（配乐卡点用）。
//   NODE_PATH="$(npm root -g)" node tools/story-record.cjs <shots.json> <out-dir>
// shots.json: [{at:"HH:MM", view?, seconds, speed?, warm?, settle?:"kids"|"boss", cam, caption}]
//   cam: [{x,y,w},{x,y,w}]（逻辑像素，塔楼宽 360，镜头从前一个推到后一个）| {follow:"kids"|"boss", w}
//   t: 从演示剧本第 t 秒开拍（吵架、吃瓜、请客这些都按剧本时间发生；at 只管钟点）。follow 也可写 "actor:<id>"。
//   settle: 预热到孩子/老板停下脚步再开录（最多 warm 毫秒，默认 60 秒）。night: true 压夜色（演示页不画昼夜）。
// 每帧都加暗角（11-05 Alice 嫌画面花、看不出重点：中间亮、四周压暗）。
// COVER=square：朋友圈封面方形宽镜头版（11-10 第二版，Alice 嫌第一版放大后糊、看不到整体布局）——出 1080×1080，
//   镜头宽 360＝整栋楼全宽（1.5 倍、不再放大到五倍），不压暗角；shots 里不写 caption 就不出字幕。只配固定机位 cam:[a,b]。
// COVER=1：朋友圈封面版（11-10）——封面平时只露画面正中 1080×1080，展开才是整幅 9:16，所以暗角中心、字幕都收进中间那块方形。
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const { createPreview } = require('./preview.cjs');
const [shotsFile, outDir] = process.argv.slice(2);
if (!shotsFile || !outDir) { console.error('usage: story-record.cjs <shots.json> <out-dir>'); process.exit(2); }
const shots = JSON.parse(fs.readFileSync(shotsFile, 'utf8')), fps = 30, frames = path.join(outDir, 'frames');
fs.rmSync(frames, { recursive: true, force: true }); fs.mkdirSync(frames, { recursive: true });
const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const centre = (snap, who) => {
  if (who === 'boss' && snap.boss) return snap.boss;
  // 被猫叫醒、喂猫（11-10 朋友圈封面）: aim between the boss and the cat nearest her, so both sit in the centre square.
  if (who === 'bosscat' && snap.boss) { if (!snap.cats?.length) return snap.boss; const b = snap.boss, c = snap.cats.reduce((p, q) => Math.hypot(q.x - b.x, q.y - b.y) < Math.hypot(p.x - b.x, p.y - b.y) ? q : p); return { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 }; }
  if (who.startsWith('actor:')) { const a = snap.actors.find(q => q.id === who.slice(6)); if (a) return a; }
  const k = (snap.kids?.list || []).filter(c => c.x != null); if (!k.length) return snap.boss;
  const m = { x: k.reduce((s, c) => s + c.x, 0) / k.length, y: k.reduce((s, c) => s + c.y, 0) / k.length };
  // 一起看剧: the boss and both kids in one frame (11-05 Alice: 「只有孩子们两个形象，没看到我」).
  if (who === 'kidsboss' && snap.boss) return { x: (m.x * 2 + snap.boss.x) / 3, y: (m.y * 2 + snap.boss.y) / 3 };
  if (who !== 'kidscat' || !snap.cats?.length) return m;
  // 追猫: aim between the kids and the cat nearest to them, so both are in frame.
  const cat = snap.cats.reduce((b, c) => Math.hypot(c.x - m.x, c.y - m.y) < Math.hypot(b.x - m.x, b.y - m.y) ? c : b);
  return { x: (m.x + cat.x) / 2, y: (m.y + cat.y) / 2 };
};
// settle "teach": wait until a colleague is teaching the kids (11-05 Alice: 「空闲的 AI 要给孩子们讲课」).
const still = (snap, who) => who === 'boss' ? true : (snap.kids?.list || []).every(c => !c.moving) && (who !== 'teach' || !!snap.kids?.teach);
(async () => {
  const server = createPreview(); await new Promise(ok => server.listen(3194, '127.0.0.1', ok));
  const browser = await chromium.launch();
  let n = 0; const errors = [], marks = [];
  for (const [k, shot] of shots.entries()) {
    const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
    page.on('pageerror', e => errors.push(`shot ${k + 1}: ${e.message}`));
    await page.goto(`http://127.0.0.1:3194/?demo=1&at=${shot.at}${shot.view ? '&view=' + shot.view : ''}`);
    await page.waitForFunction(() => window.__PLAYTEST__?.ready, null, { polling: 100 });
    let snap = await page.evaluate(() => window.__PLAYTEST__.step(500));
    if (shot.t) for (let w = 500; w < shot.t * 1000; w += 500) snap = await page.evaluate(() => window.__PLAYTEST__.step(500));
    if (shot.settle) { for (let w = 0; w < (shot.warm || 60000); w += 500) { snap = await page.evaluate(() => window.__PLAYTEST__.step(500)); if (w > 1500 && still(snap, shot.settle)) break; } }
    // Kids and cats move page-side per step, so warm up in half-second steps (one 23 s step moves them only once).
    else if (shot.warm) for (let w = 0; w < shot.warm; w += 500) snap = await page.evaluate(() => window.__PLAYTEST__.step(500));
    const total = Math.round(shot.seconds * fps); let follow = null; marks.push({ shot: k + 1, start: +(n / fps).toFixed(3), caption: shot.caption });
    for (let i = 0; i < total; i++) {
      snap = await page.evaluate(ms => window.__PLAYTEST__.step(ms), 1000 / fps * (shot.speed || 1));
      let cam;
      if (shot.cam.follow) {
        const c = centre(snap, shot.cam.follow), w = shot.cam.w, target = { x: c.x - w / 2, y: c.y - w * 16 / 9 / 2, w };
        follow = follow ? { x: follow.x + (target.x - follow.x) * (shot.chase ? .25 : .1), y: follow.y + (target.y - follow.y) * (shot.chase ? .25 : .1), w } : target; cam = follow;
      } else { const [a, b] = shot.cam, e = ease(i / Math.max(1, total - 1)); cam = { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, w: a.w + (b.w - a.w) * e }; }
      const fade = Math.min(1, i / 6, (total - 1 - i) / 6);
      const data = await page.evaluate(({ cam, caption, fade, night, cover }) => {
        const sq = cover === 'square', src = document.querySelector('#office'), o = document.createElement('canvas'); o.width = 1080; o.height = sq ? 1080 : 1920;
        const g = o.getContext('2d'); g.imageSmoothingEnabled = false; g.fillStyle = '#efe7d4'; g.fillRect(0, 0, 1080, o.height);
        const W = src.width / 2, H = src.height / 2, h = sq ? cam.w : cam.w * 16 / 9;
        const x = Math.max(0, Math.min(cam.x, W - cam.w)), y = Math.max(0, Math.min(cam.y, H - h));
        const s = 1080 / cam.w; g.drawImage(src, 0, 0, src.width, src.height, -x * s, -y * s, W * s, H * s);
        if (night) { g.fillStyle = 'rgba(14,22,52,0.38)'; g.fillRect(0, 0, 1080, 1920); }
        if (!sq) {
        const cy = cover ? 960 : 860, v = g.createRadialGradient(540, cy, cover ? 220 : 260, 540, cy, cover ? 900 : 1150);
        v.addColorStop(0, 'rgba(18,22,26,0)'); v.addColorStop(1, 'rgba(18,22,26,0.72)'); g.fillStyle = v; g.fillRect(0, 0, 1080, 1920);
        }
        if (caption) {
          g.textAlign = 'center'; g.font = '600 52px "PingFang SC",system-ui';
          const lines = []; let cur = ''; for (const ch of caption) { if (g.measureText(cur + ch).width > 900) { lines.push(cur); cur = ''; } cur += ch; } lines.push(cur);
          const bh = 44 + lines.length * 70, by = cover ? 1500 - 40 - bh : 1920 - 230 - bh;
          g.globalAlpha = fade; g.fillStyle = '#253334e0'; g.beginPath(); g.roundRect(60, by, 960, bh, 24); g.fill();
          g.fillStyle = '#fff6dc'; lines.forEach((l, j) => g.fillText(l, 540, by + 72 + j * 70)); g.globalAlpha = 1;
        }
        return o.toDataURL('image/jpeg', .92);
      }, { cam, caption: shot.caption, fade, night: !!shot.night, cover: process.env.COVER === 'square' ? 'square' : process.env.COVER === '1' });
      fs.writeFileSync(path.join(frames, String(n++).padStart(5, '0') + '.jpg'), Buffer.from(data.split(',')[1], 'base64'));
    }
    await page.close(); console.log(`shot ${k + 1}/${shots.length} ${shot.at} done (${n} frames)`);
  }
  await browser.close(); server.close();
  fs.writeFileSync(path.join(outDir, 'marks.json'), JSON.stringify({ seconds: +(n / fps).toFixed(3), marks }, null, 1));
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  execFileSync('ffmpeg', ['-nostdin', '-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(frames, '%05d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', path.join(outDir, 'office.mp4')]);
  console.log('wrote', path.join(outDir, 'office.mp4'));
})();
