// 复制自 video-director signature-endcard/endcard.js，多导出 drawThumb / drawSeal 给门标用（11-06）
// 署名收尾页固定模板（2026-10-27 Alice 定：「以后署名那页就按你的版本固定下来」，母版是《较真神话 02 夸父逐日》v2 片尾）
// 竖屏 1080×1920。用法：在自己的 canvas 片里 SignatureEndcard.draw(ctx, e, cfg)，e = 进入收尾页后的秒数；
// 或把 endcard.html + config.js 复制进工程，用 story-video scripts/html_seek_render.cjs 单独渲成片段再接在片尾。
// cfg = { series: "较真神话 02"（可空）, title: "夸父逐日", accounts?: ["公众号 我的AI小木屋", …], notes: [["资料","…"],["画面","…"],["声音","…"],["借鉴","…"],["构思","小试AI · 与 Claude Code 协作完成"]] }
// 时间：0.3s 起做法逐行出现，1.0s 手写字，1.2s GitHub 行，1.8s 盖印章，2.8s 按煤球指纹；整页停 5.6s。
// 音效：1.8s、2.8s 各一声落定音（story-video sfx-library 的 hard-pop-click -10dB 叠 deep-impact -20dB）。
(function (G) {
const W = 1080, H = 1920;
const FONT = '"Yuanti SC","PingFang SC",sans-serif';
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const eOC = k => 1 - Math.pow(1 - k, 3);
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
const SERIF = '"Songti SC","Noto Serif SC",serif', KAI = '"Kaiti SC","STKaiti",serif';
function wrapLines(ctx, txt, maxW) { const out = []; let line = ""; for (const ch of txt) { if (ctx.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; } else line += ch; } if (line) out.push(line); return out; }
const RIDGES = (() => { const a = []; for (let k = 0; k < 11; k++) a.push({ rx: 14 + k * 10, ry: 10 + k * 9.3, dx: Math.sin(k * 1.7) * 3, dy: Math.cos(k * 1.3) * 3, gap: (k * 47) % 360, rot: (-20 + k * 4) * Math.PI / 180 }); return a; })();
function drawThumb(ctx) { // 小黑煤球指纹：照 IP 母版，黑身粉球、白眼短嘴、白贴纸边、身上淡指纹
  ctx.lineCap = "round"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 16;
  ctx.beginPath(); ctx.arc(0, 0, 100, 0, 7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -100); ctx.lineTo(0, -136); ctx.moveTo(-28, 92); ctx.lineTo(-28, 144); ctx.moveTo(28, 92); ctx.lineTo(28, 144); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, -152, 17, 0, 7); ctx.stroke();
  ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(0, 0, 100, 0, 7); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(0, 0, 96, 0, 7); ctx.clip(); ctx.strokeStyle = "#1e1e1e"; ctx.lineWidth = 3.5;
  for (const r of RIDGES) { ctx.save(); ctx.rotate(r.rot); ctx.setLineDash([r.rx * 5.2, 14]); ctx.lineDashOffset = r.gap; ctx.beginPath(); ctx.ellipse(r.dx, 8 + r.dy, r.rx, r.ry, 0, 0, 7); ctx.stroke(); ctx.restore(); }
  ctx.restore(); ctx.setLineDash([]);
  ctx.strokeStyle = "#111"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, -100); ctx.lineTo(0, -136); ctx.moveTo(-28, 92); ctx.lineTo(-28, 144); ctx.moveTo(28, 92); ctx.lineTo(28, 144); ctx.stroke();
  ctx.fillStyle = "#FF5DA2"; ctx.beginPath(); ctx.arc(0, -152, 17, 0, 7); ctx.fill();
  ctx.fillStyle = "#111"; for (const x of [-32, 32]) { ctx.beginPath(); ctx.arc(x, 144, 4.5, 0, 7); ctx.fill(); }
  ctx.fillStyle = "#fff"; for (const x of [-47, 47]) { ctx.beginPath(); ctx.arc(x, -4, 9, 0, 7); ctx.fill(); }
  rr(ctx, -10, 0, 20, 4.5, 2.25); ctx.fill();
}
function drawSeal(ctx) {
  ctx.fillStyle = "#C8352B"; rr(ctx, -75, -75, 150, 150, 10); ctx.fill();
  ctx.strokeStyle = "#efe9dc"; ctx.lineWidth = 4; rr(ctx, -65, -65, 130, 130, 6); ctx.stroke();
  ctx.fillStyle = "#efe9dc"; ctx.font = `900 54px ${KAI}`; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillText("小试", 0, -7); ctx.fillText("AI", 0, 53);
}

function draw(ctx, e, cfg) {
  const ease = x => (x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
  ctx.save();
  ctx.fillStyle = "#efe9dc"; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#2c3833"; ctx.lineWidth = 6; ctx.strokeRect(40, 40, 1000, 1840);
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  if (cfg.series) { ctx.fillStyle = "#7a6a55"; ctx.font = `700 42px ${SERIF}`; ctx.fillText(cfg.series, 540, 200); }
  ctx.fillStyle = "#1a1a1a"; ctx.font = `900 104px ${SERIF}`; ctx.fillText(cfg.title, 540, 320);
  ctx.fillRect(290, 360, 500, 5);
  let y = 450;
  cfg.notes.forEach(([lab, body], k) => {
    const a = clamp((e - .3 - k * .18) / .4); ctx.globalAlpha = a; const dy = (1 - eOC(a)) * 20;
    ctx.textAlign = "left"; ctx.fillStyle = "#C8352B"; ctx.font = `700 34px ${SERIF}`; ctx.fillText(lab, 120, y + dy);
    ctx.fillStyle = "#2c2c2c"; ctx.font = `400 32px ${SERIF}`;
    const lines = wrapLines(ctx, body, 770); lines.forEach((l, i) => ctx.fillText(l, 220, y + dy + i * 46)); y += lines.length * 46 + 30;
  });
  ctx.globalAlpha = 1;
  const kg = clamp((e - 1.2) / .4);
  if (kg > 0) { ctx.globalAlpha = kg; ctx.fillStyle = "#1a1a1a"; rr(ctx, 270, y + 10, 540, 92, 46); ctx.fill();
    ctx.fillStyle = "#efe9dc"; ctx.font = `700 46px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("GitHub @AliceLJY", 540, y + 58); ctx.globalAlpha = 1; ctx.textBaseline = "alphabetic"; }
  // 名字、印章、煤球跟着 GitHub 条往下排，不写死高度：说明文字一长，条会压到名字上（2026-11-03 茶楼片「我的AI小木屋」被整个盖住、
  // 名字笔画又把 GitHub 白字啃出缺口）。条下留 82（64px 字的上沿）；放不下就把印章、煤球的间距最多压到 78%
  // 可选 cfg.accounts：GitHub 条下面列其他平台账号，一行一条（11-03 Alice：「除了公众号，加上微博、快手、全民K歌，都是安闲静雅」）。
  let pillBot = y + 102;
  if (cfg.accounts && cfg.accounts.length) {
    ctx.globalAlpha = kg; ctx.fillStyle = "#2c2c2c"; ctx.font = `400 34px ${SERIF}`; ctx.textAlign = "center";
    cfg.accounts.forEach((line, i) => ctx.fillText(line, 540, pillBot + 52 + i * 48)); ctx.globalAlpha = 1;
    pillBot += 30 + cfg.accounts.length * 48;
  }
  const yHand = Math.max(1290, pillBot + 82);
  let gS = 130, gT = 270;
  const room = 1850 - 125 - yHand; // 煤球腿到内框
  if (gS + gT > room) { const k = Math.max(0.78, room / (gS + gT)); gS *= k; gT *= k; }
  const ySeal = yHand + gS, yThumb = ySeal + gT;
  if (G.SignatureEndcard) G.SignatureEndcard.lastLayout = { pillTop: y + 10, pillBot, yHand, ySeal, yThumb, fits: yThumb + 125 <= 1850 };
  ctx.globalAlpha = clamp((e - 1.0) / .5); ctx.fillStyle = "#1a1a1a"; ctx.font = `700 64px ${KAI}`; ctx.textAlign = "center"; ctx.fillText("我的AI小木屋", 540, yHand); ctx.globalAlpha = 1;
  const stamp = (t0, x, yy, fn, sz) => { if (e < t0) return; const f = clamp((e - t0) / .22); const sc = 1.6 - .6 * ease(f); ctx.save(); ctx.translate(x, yy); ctx.scale(sc * sz, sc * sz); ctx.rotate(-6 * (1 - f) * Math.PI / 180); fn(ctx); ctx.restore(); };
  stamp(1.8, 540, ySeal, drawSeal, .85); stamp(2.8, 540, yThumb, drawThumb, .82);
  ctx.restore();
}
G.SignatureEndcard = { draw, drawThumb, drawSeal, DURATION: 5.6, SFX_AT: [1.8, 2.8] };
})(window);
