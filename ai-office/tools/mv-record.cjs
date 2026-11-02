// 录 MV「像素办公室的一天」：竖屏 540×960、2 倍像素 = 1080×1920、30fps，逐帧录，不是截图拼。
//   NODE_PATH="$(npm root -g)" node tools/mv-record.cjs <out-dir> [--stills 5,12.5,…] [--from 秒] [--to 秒] [--speed 1.2] [--endcard <目录>]
// --speed：每帧推进 speed/30 秒剧本时间（11-01 Alice 嫌原速慢，定 1.2 倍），events.json 的时间同步换算成成片时间；尾板不变速。
// 做法同 jianmen-drizzle/tools/demo.cjs：page.clock 接管页面时钟并停住，每帧调 __PLAYTEST__.step(1000/30) 推进办公室，
// 再按设备像素截图；?mv=1&hold=1 让页面自己不走，画面只取决于推进了多少时间（字幕、灯光、镜头、淡出都按页面时间算）。
// 录完写 events.json（每件事发生在第几秒，给 tools/mv-music.py 卡点），frames/ 合成 office.mp4。
// --endcard 给署名尾板目录（video-director 的 signature-endcard 拷一份、只改 config.js），逐帧 seek 截图接在片尾，
// 0.8 秒从黑场淡入，合成 mv-noaudio.mp4。--stills 只拍这几个时刻的 PNG（分镜表用），不出视频。
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), { execFileSync } = require('node:child_process');

const args = process.argv.slice(2), outDir = args[0];
const opt = k => { const i = args.indexOf(k); return i > 0 ? args[i + 1] : null; };
if (!outDir) { console.error('usage: mv-record.cjs <out-dir> [--stills a,b] [--from s] [--to s] [--endcard dir]'); process.exit(2); }
const root = path.resolve(__dirname, '..'), fps = 30;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

function serve(dir) {
  return new Promise(ok => {
    const server = http.createServer((req, res) => {
      const file = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
    }).listen(0, '127.0.0.1', () => ok(server));
  });
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const server = await serve(root), base = `http://127.0.0.1:${server.address().port}/index.html?mv=1&hold=1`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await (await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 })).newPage();
  const errors = [], external = [];
  await page.route(/^https?:\/\//, route => { const u=new URL(route.request().url());if(u.hostname==='127.0.0.1')return route.continue();external.push(u.origin+u.pathname);return route.abort(); });
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.clock.install({ time: Date.parse('2026-11-01T01:00:00Z') });
  await page.goto(base);
  for (let i = 0; i < 300; i++) { if (await page.evaluate(() => window.__PLAYTEST__?.ready)) break; await page.clock.runFor(100); await page.waitForTimeout(30); }
  if (!(await page.evaluate(() => window.__PLAYTEST__?.ready))) throw new Error('page not ready: ' + errors.join(' | '));
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 50));
  const info = await page.evaluate(() => window.__PLAYTEST__.snapshot());
  const seconds = info.mv.seconds;
  let at = 0;
  const stepTo = async t => { while (at < t - 1e-6) { const ms = Math.min(60000, (t - at) * 1000); await page.evaluate(ms => window.__PLAYTEST__.step(ms), ms); at += ms / 1000; } };

  const stills = opt('--stills');
  if (stills) {
    for (const t of stills.split(',').map(Number).sort((a, b) => a - b)) {
      await stepTo(t); await page.waitForTimeout(30);
      const file = path.join(outDir, `still-${t.toFixed(1).padStart(5, '0')}.png`);
      await page.screenshot({ path: file }); console.log('still', t, file);
    }
    await browser.close(); server.close(); console.log(JSON.stringify({ errors })); return;
  }

  const from = Number(opt('--from') || 0), to = Number(opt('--to') || seconds);
  const frames = path.join(outDir, 'frames'); if(fs.existsSync(frames)) throw new Error('frames already exists; use a fresh output directory'); fs.mkdirSync(frames, { recursive: true });
  await stepTo(from);
  const speed = Number(opt('--speed') || 1), total = Math.round((to - from) * fps / speed), safe = { subBottom: 0, subFrames: 0, titleTop: Infinity, paperBottom: 0 };
  for (let n = 0; n < total; n++) {
    if (n > 0) await page.evaluate(ms => window.__PLAYTEST__.step(ms), 1000 * speed / fps);
    await page.waitForTimeout(12);  // let the compositor commit the DOM layers (subtitle, title) of this frame
    await page.screenshot({ path: path.join(frames, String(n).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92 });
    if (n % 5 === 0) {
      // Safe area, measured on the frame just saved: subtitle box bottom and title top, in device pixels.
      const m = await page.evaluate(() => {
        const box = s => { const el = document.querySelector(s); if (!el || getComputedStyle(el).display === 'none' || el.hidden) return null; const r = el.getBoundingClientRect(); return { top: r.top * 2, bottom: r.bottom * 2 }; };
        return { sub: +getComputedStyle(document.querySelector('#mv-sub')).opacity > 0 ? box('#mv-sub span') : null, title: box('#mv-title'), paper: document.querySelector('#paper').hidden ? null : box('#paper') };
      });
      if (m.sub) { safe.subBottom = Math.max(safe.subBottom, m.sub.bottom); safe.subFrames++; }
      if (m.title) safe.titleTop = Math.min(safe.titleTop, m.title.top);
      if (m.paper) safe.paperBottom = Math.max(safe.paperBottom, m.paper.bottom);
    }
    if (n % 300 === 0) console.log('frame', n, '/', total);
  }
  safe.passed=safe.subFrames>0&&safe.subBottom<=1480&&safe.titleTop>=172;
  fs.writeFileSync(path.join(outDir,'safe-area-v7.json'),JSON.stringify(safe,null,2));
  if(external.length)throw new Error('MV attempted external requests: '+JSON.stringify(external));
  if(!safe.passed)throw new Error('Safe area failed: '+JSON.stringify(safe));
  const log = await page.evaluate(() => window.__PLAYTEST__.mvLog());
  await page.close();
  const officeMp4 = path.join(outDir, 'office.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(frames, '%05d.jpg'), '-vf', 'scale=in_range=pc:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-bsf:v', 'h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', officeMp4]);

  const office = total / fps;
  const ev = { fps, from, speed, office, external, browser:browser.version(), viewport:{width:540,height:960,dpr:2}, events: log.map(e => ({ ...e, t: +((e.t - from) / speed).toFixed(3) })).filter(e => e.t >= 0 && e.t <= office), safe, errors };
  const card = opt('--endcard');
  if (card) {
    const cp = await (await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 })).newPage();
    cp.on('pageerror', e => errors.push('endcard: ' + e.message));
    await cp.goto('file://' + path.resolve(card, 'endcard.html'));
    await cp.waitForFunction(() => window.__ready === true, null, { polling: 100, timeout: 20000 });
    const dur = await cp.evaluate(() => window.__duration()), cf = path.join(outDir, 'endcard-frames');
    if(fs.existsSync(cf)) throw new Error('endcard-frames already exists; use a fresh output directory'); fs.mkdirSync(cf, { recursive: true });
    const cn = Math.round(dur * fps);
    for (let n = 0; n < cn; n++) { await cp.evaluate(t => window.__seek(t), n / fps); await cp.screenshot({ path: path.join(cf, String(n).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92 }); }
    const endcard = path.join(outDir, 'endcard.mp4');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(cf, '%05d.jpg'), '-vf', 'fade=in:st=0:d=0.8,scale=in_range=pc:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-bsf:v', 'h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', endcard]);
    fs.writeFileSync(path.join(outDir, 'concat.txt'), `file '${officeMp4}'\nfile '${endcard}'\n`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(outDir, 'concat.txt'), '-c', 'copy', '-movflags', '+faststart', path.join(outDir, 'mv-noaudio.mp4')]);
    ev.endcard = { start: office, seconds: cn / fps, sfx: [1.8, 2.8] };
    const audio=path.resolve(card,'audio.wav');if(fs.existsSync(audio))ev.endcard.audio=audio;
  }
  ev.seconds = office + (ev.endcard ? ev.endcard.seconds : 0);
  fs.writeFileSync(path.join(outDir, 'events.json'), JSON.stringify(ev, null, 2));
  await browser.close(); server.close();
  console.log(JSON.stringify({ frames: total, seconds: ev.seconds, safe, events: log.length, errors: errors.slice(0, 5) }));
})().catch(e => { console.error(e); process.exit(1); });
