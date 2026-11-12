// 穆柯寨 · 页面：画面、输入、声音。游戏逻辑全在 core.js，这里只读状态、发意图。
(function () {
  const CLIPS = self.MKZ_CLIPS, M = self.MKZ, BD = self.MKZ_BACKDROP;
  const W = M.W, H = M.H, GROUND = M.GROUND;
  const params = new URLSearchParams(location.search);
  const VIEW = params.get('view') || '';
  const STAGE = params.get('stage') === '2' ? 2 : 1;
  const SEED = Number(params.get('seed')) || 7;

  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');
  const FONT_KAI = '"Kaiti SC","STKaiti","KaiTi","Songti SC","Noto Serif CJK SC",serif';
  const FONT_SONG = '"Songti SC","STSong","SimSun","Noto Serif CJK SC",serif';
  // 界面颜色：只用一族暖金（压暗）、暗朱红、旧纸色，不用纯白纯黑
  const GOLD = '#c9a45c', GOLD_DIM = 'rgba(201,164,92,.38)', PAPER = '#e4d3ae';
  const touchUI = matchMedia('(pointer:coarse)').matches;

  let g = null, paused = false, ready = false;
  const ui = { meterShown: 0, meterPulse: 0, lastEvent: 0, qiLost: 0, boxes: [] };
  let VW = W, portrait = false;   // 当前取景窗的逻辑宽度；手机竖屏取 400 宽的窗，跟着人走
  const box = (name, x, y, w, h) => ui.boxes.push({ name, x, y, w, h });

  function newGame(seed, stage) {
    g = M.create(CLIPS, { seed, stage });
    ui.meterShown = 0; ui.lastEvent = 0; ui.meterPulse = 0;
    if (VIEW && !seedOverride) M.prepareView(g, VIEW);
  }
  let seedOverride = false;

  // ---------- 图集 ----------
  const atlas = {};
  const loads = [];
  for (const who of Object.keys(CLIPS)) {
    for (const clip of Object.keys(CLIPS[who])) {
      loads.push(new Promise((ok) => {
        const im = new Image();
        im.onload = ok; im.onerror = ok;
        im.src = 'assets/' + CLIPS[who][clip].src;
        atlas[who + '-' + clip] = im;
      }));
    }
  }
  loads.push(BD.load());

  // ---------- 精灵压夜色（ART.md 第 3 条）：处理结果按帧缓存到离屏画布 ----------
  const PAD = 4;
  const procCache = new Map(), ringCache = new Map();
  const hasFilter = 'filter' in CanvasRenderingContext2D.prototype;
  function frameSrc(who, clipName, frame) {
    const clip = CLIPS[who][clipName];
    const w = clip.cell[0], h = clip.cell[1];
    return {
      im: atlas[who + '-' + clipName], w, h,
      sx: (frame % clip.cols) * w, sy: Math.floor(frame / clip.cols) * h,
    };
  }
  function blank(w, h) {
    const cv = document.createElement('canvas');
    cv.width = w + PAD * 2; cv.height = h + PAD * 2;
    return cv;
  }
  // 夜色只用正片叠底（只会变暗）；降饱和不超过 0.9，再略加对比，红靠才不会发灰。
  // 上缘一圈很窄的暖色边光（上移 2px 的剪影减去原剪影），不整身叠亮。
  function processed(who, clipName, frame) {
    const key = who + '|' + clipName + '|' + frame;
    let hit = procCache.get(key);
    if (hit) return hit;
    const s = frameSrc(who, clipName, frame);
    const cv = blank(s.w, s.h), c = cv.getContext('2d');
    if (hasFilter) c.filter = 'saturate(0.9) contrast(1.1)';
    c.drawImage(s.im, s.sx, s.sy, s.w, s.h, PAD, PAD, s.w, s.h);
    c.filter = 'none';
    c.globalCompositeOperation = 'multiply';
    c.fillStyle = 'rgb(196,182,224)'; c.fillRect(0, 0, cv.width, cv.height);
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(s.im, s.sx, s.sy, s.w, s.h, PAD, PAD, s.w, s.h);
    const rim = blank(s.w, s.h), r = rim.getContext('2d');
    r.drawImage(s.im, s.sx, s.sy, s.w, s.h, PAD, PAD - 2, s.w, s.h);
    r.globalCompositeOperation = 'source-in';
    r.fillStyle = 'rgb(230,150,70)'; r.fillRect(0, 0, rim.width, rim.height);
    r.globalCompositeOperation = 'destination-out';
    r.drawImage(s.im, s.sx, s.sy, s.w, s.h, PAD, PAD, s.w, s.h);
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = 0.3;
    c.drawImage(rim, 0, 0);
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    procCache.set(key, cv);
    return cv;
  }
  // 预警用的轮廓：剪影向四周各挪 3px 再减去原剪影，只剩一圈暖色亮边
  function ring(who, clipName, frame) {
    const key = who + '|' + clipName + '|' + frame;
    let hit = ringCache.get(key);
    if (hit) return hit;
    const s = frameSrc(who, clipName, frame);
    const cv = blank(s.w, s.h), c = cv.getContext('2d');
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      c.drawImage(s.im, s.sx, s.sy, s.w, s.h, PAD + Math.cos(a) * 3, PAD + Math.sin(a) * 3, s.w, s.h);
    }
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = 'rgb(255,176,96)'; c.fillRect(0, 0, cv.width, cv.height);
    c.globalCompositeOperation = 'destination-out';
    c.drawImage(s.im, s.sx, s.sy, s.w, s.h, PAD, PAD, s.w, s.h);
    ringCache.set(key, cv);
    return cv;
  }
  const tmp = document.createElement('canvas');
  tmp.width = 560; tmp.height = 460;
  const tctx = tmp.getContext('2d');
  const rects = { p: null, e: null };

  // 画一个人：接触影、倒影、压暗后的精灵，再按状态叠闪色
  function drawActor(a, t) {
    const f = M.frameOf(a), clip = CLIPS[a.who][f.clip];
    const cv = processed(a.who, f.clip, f.frame);
    const level = BD.lightAt(a.x);
    // 脚下接触影：由深到浅三层，不是一个纯黑椭圆
    const layers = [[84, 13, 0.14], [60, 9, 0.22], [38, 6, 0.34]];
    for (const [rx, ry, al] of layers) {
      ctx.fillStyle = `rgba(6,4,14,${al})`;
      ctx.beginPath(); ctx.ellipse(a.x, GROUND + 2, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    }
    // 地板上压扁、很淡的倒影
    ctx.save();
    ctx.translate(a.x, GROUND + 3); ctx.scale(a.face, -0.26);
    ctx.globalAlpha = 0.11;
    ctx.drawImage(cv, -clip.anchor[0] - PAD, -clip.anchor[1] - PAD);
    ctx.restore();

    // 灯间更暗：只用正片叠底（变暗不蒙白）；受击闪一下暖白；预警不动透明度，只闪轮廓
    const dk = 0.06 + 0.24 * (1 - level);
    const m = Math.round(255 * (1 - dk));
    const hitFlash = a.flash > 0 ? Math.min(0.6, a.flash / 90) : 0;
    ctx.save();
    ctx.translate(a.x, GROUND); ctx.scale(a.face, 1);
    const dx = -clip.anchor[0] - PAD, dy = -clip.anchor[1] - PAD;
    tctx.globalCompositeOperation = 'source-over';
    tctx.clearRect(0, 0, tmp.width, tmp.height);
    tctx.drawImage(cv, 0, 0);
    tctx.globalCompositeOperation = 'multiply';
    tctx.fillStyle = `rgb(${m},${m},${Math.min(255, m + 8)})`; tctx.fillRect(0, 0, cv.width, cv.height);
    tctx.globalCompositeOperation = 'destination-in';
    tctx.drawImage(cv, 0, 0);
    if (hitFlash) {
      tctx.globalCompositeOperation = 'source-atop';
      tctx.fillStyle = `rgba(255,226,190,${hitFlash.toFixed(3)})`; tctx.fillRect(0, 0, cv.width, cv.height);
    }
    ctx.drawImage(tmp, 0, 0, cv.width, cv.height, dx, dy, cv.width, cv.height);
    if (a.act === 'warn') {
      // 轮廓快速闪两下
      const bump = (c0) => Math.max(0, 1 - Math.abs(a.t - c0) / 85);
      const pulse = Math.max(bump(70), bump(300));
      if (pulse > 0.01) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.9 * pulse;
        ctx.drawImage(ring(a.who, f.clip, f.frame), dx, dy);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.restore();
    if (a.act === 'warn') {
      // 兵器上一点高光，随两次闪动亮起
      const bump = (c0) => Math.max(0, 1 - Math.abs(a.t - c0) / 110);
      const pulse = Math.max(bump(70), bump(300));
      if (pulse > 0.01) {
        const hx = a.x + a.face * a.spec.reach * 0.66, hy = GROUND - 144;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const gl = ctx.createRadialGradient(hx, hy, 1, hx, hy, 24);
        gl.addColorStop(0, `rgba(255,210,150,${0.7 * pulse})`); gl.addColorStop(1, 'rgba(255,150,80,0)');
        ctx.fillStyle = gl; ctx.fillRect(hx - 24, hy - 24, 48, 48);
        ctx.restore();
      }
    }
    const left = a.face > 0 ? a.x - clip.anchor[0] : a.x - (clip.cell[0] - clip.anchor[0]);
    rects[a.id] = { x: left, y: GROUND - clip.anchor[1], w: clip.cell[0], h: clip.cell[1] };
  }

  // 孟良 / 杨宗保出招前的地面提示：脚下往前一道暖红细线，到枪（斧）能够到的地方
  function drawWarnLine(e, t) {
    if (e.act !== 'warn') return;
    const k = Math.min(1, e.t / 120);
    const x1 = e.x + e.face * (e.spec.reach + 10), xa = Math.min(e.x, x1), wd = Math.abs(x1 - e.x);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gr = ctx.createLinearGradient(e.x, 0, x1, 0);
    gr.addColorStop(0, 'rgba(255,150,80,0)'); gr.addColorStop(0.15, `rgba(255,150,80,${0.9 * k})`);
    gr.addColorStop(1, `rgba(255,120,60,${0.35 * k})`);
    ctx.fillStyle = gr; ctx.fillRect(xa, GROUND + 5, wd, 4);
    ctx.fillStyle = `rgba(255,190,120,${0.18 * k})`; ctx.fillRect(xa, GROUND + 1, wd, 12);
    ctx.restore();
  }

  // ---------- 特效：火花沿枪的方向飞、带拖尾；架开是细弧光加冲击环 ----------
  const easeOut = (k) => 1 - (1 - k) * (1 - k);
  function drawFx() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const f of g.fx) {
      const age = g.t - f.t0;
      const rng = M.mulberry32(f.seed * 131 + 7);
      if (f.kind === 'spark') {
        const life = f.big ? 320 : 220, k = age / life;
        if (k >= 1) continue;
        const n = f.big ? 9 : 5;
        for (let i = 0; i < n; i++) {
          const ang = (rng() - 0.5) * 1.9 + (f.dir > 0 ? 0 : Math.PI);
          const len = (18 + rng() * 42) * (f.big ? 1.3 : 0.8);
          const d = easeOut(k) * len, tail = Math.max(0, d - len * 0.45 * (1 - k * 0.3));
          ctx.strokeStyle = `rgba(255,${190 + Math.floor(rng() * 40)},120,${(1 - k) * 0.8})`;
          ctx.lineWidth = 1.6 - k;
          ctx.beginPath();
          ctx.moveTo(f.x + Math.cos(ang) * tail, f.y + Math.sin(ang) * tail * 0.8);
          ctx.lineTo(f.x + Math.cos(ang) * d, f.y + Math.sin(ang) * d * 0.8);
          ctx.stroke();
        }
        const gl = ctx.createRadialGradient(f.x, f.y, 1, f.x, f.y, 26);
        gl.addColorStop(0, `rgba(255,200,130,${0.45 * (1 - k)})`); gl.addColorStop(1, 'rgba(255,160,80,0)');
        ctx.fillStyle = gl; ctx.fillRect(f.x - 26, f.y - 26, 52, 52);
      } else if (f.kind === 'parry') {
        const k = age / 360;
        if (k >= 1) continue;
        const r = 18 + easeOut(k) * 34;
        const base = f.dir > 0 ? 0 : Math.PI;
        ctx.strokeStyle = `rgba(255,226,170,${(1 - k) * 0.95})`;
        ctx.lineWidth = 2.2 * (1 - k) + 0.6;
        ctx.beginPath(); ctx.arc(f.x, f.y, r, base - 1.0, base + 1.0); ctx.stroke();
        ctx.strokeStyle = `rgba(230,160,90,${(1 - k) * 0.3})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(f.x, f.y, 14 + easeOut(k) * 70, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ---------- 界面：细线、楷体、克制（ART.md 第 7 条） ----------
  function drawHelmet(x, y, s, on) {
    ctx.save();
    ctx.translate(x, y); ctx.scale(s, s);
    ctx.lineWidth = 1.2 / s * 1.0;
    ctx.strokeStyle = on ? GOLD : 'rgba(201,164,92,.28)';
    ctx.fillStyle = on ? 'rgba(201,164,92,.22)' : 'rgba(201,164,92,.04)';
    ctx.beginPath(); ctx.moveTo(-9, 4); ctx.quadraticCurveTo(-9, -8, 0, -9); ctx.quadraticCurveTo(9, -8, 9, 4);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-12, 4); ctx.lineTo(12, 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(0, -13); ctx.stroke();
    ctx.restore();
  }
  function drawQi(k) {
    const x = portrait ? 12 : 16, y = portrait ? 24 : 28 * k;
    ctx.fillStyle = GOLD; ctx.font = `${16 * k}px ${FONT_KAI}`;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText('气', x, y);
    for (let i = 0; i < M.QI_MAX; i++) {
      const cx = x + 24 * k + i * 13 * k, on = i < g.qi;
      ctx.save();
      ctx.translate(cx, y); ctx.rotate(Math.PI / 4);
      const s = 4.6 * k;
      ctx.lineWidth = 1;
      ctx.strokeStyle = on ? 'rgba(214,110,78,.95)' : 'rgba(201,164,92,.25)';
      ctx.fillStyle = on ? 'rgba(150,48,40,.85)' : 'rgba(60,40,40,.2)';
      ctx.fillRect(-s, -s, s * 2, s * 2); ctx.strokeRect(-s, -s, s * 2, s * 2);
      ctx.restore();
    }
  }
  function drawMeter(k) {
    const w = portrait ? VW - 62 - 16 : 360, h = 7, x = portrait ? 62 : (VW - w) / 2;
    const y = portrait ? 66 : 30 * k;
    box('meter', x - 52, y - 11, w + 64, 22);
    ctx.fillStyle = GOLD; ctx.font = `${16 * k}px ${FONT_KAI}`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText('心动', x - 14, y);
    // 细长的槽，端头各带一小片装饰
    ctx.fillStyle = 'rgba(20,12,22,.7)'; ctx.fillRect(x, y - h / 2, w, h);
    ctx.strokeStyle = GOLD_DIM; ctx.lineWidth = 1; ctx.strokeRect(x - 0.5, y - h / 2 - 0.5, w + 1, h + 1);
    const frac = Math.max(0, Math.min(1, ui.meterShown / 100));
    if (frac > 0) {
      const gr = ctx.createLinearGradient(x, 0, x + w, 0);
      gr.addColorStop(0, '#6e1f28'); gr.addColorStop(1, '#d79078');
      ctx.fillStyle = gr; ctx.fillRect(x, y - h / 2, w * frac, h);
      // 前沿一道亮线（心动满的那一下才亮得多）
      const pulse = ui.meterPulse;
      ctx.fillStyle = `rgba(255,214,170,${0.55 + 0.4 * pulse})`;
      ctx.fillRect(x + w * frac - 1.5, y - h / 2 - 1, 2, h + 2);
    }
    ctx.fillStyle = GOLD;
    for (const ex of [x - 4, x + w + 4]) {
      ctx.save(); ctx.translate(ex, y); ctx.rotate(Math.PI / 4);
      ctx.fillRect(-3, -3, 6, 6); ctx.restore();
    }
  }
  function wrapText(text, maxW) {
    if (ctx.measureText(text).width <= maxW) return [text];
    const cut = Math.max(text.lastIndexOf('。', text.length - 2), text.lastIndexOf('，'));
    if (cut > 0) return [text.slice(0, cut + 1), text.slice(cut + 1)];
    const mid = Math.floor(text.length / 2);
    return [text.slice(0, mid), text.slice(mid)];
  }
  function drawSubtitle(k) {
    if (!g.sub) return;
    const age = g.t - g.sub.t0, left = g.sub.until - g.t;
    const a = Math.min(1, age / 350, left / 350);
    if (a <= 0) return;
    const e = easeOut(Math.max(0, Math.min(1, a)));
    const fs = 22 * Math.min(k, 1.7);
    ctx.save();
    ctx.globalAlpha = e;
    ctx.font = `${fs}px ${FONT_KAI}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = (fs * 0.12) + 'px';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lines = wrapText(g.sub.text, VW - 40);
    const y0 = H - 40 - (lines.length - 1) * fs * 0.6 - (1 - e) * 6;
    let wmax = 0;
    lines.forEach((ln, i) => {
      const y = y0 + i * fs * 1.3;
      wmax = Math.max(wmax, ctx.measureText(ln).width);
      ctx.fillStyle = 'rgba(8,5,12,.65)'; ctx.fillText(ln, VW / 2 + 1.5, y + 1.5);
      ctx.fillStyle = PAPER; ctx.fillText(ln, VW / 2, y);
    });
    box('subtitle', VW / 2 - wmax / 2, y0 - fs * 0.65, wmax, lines.length * fs * 1.3);
    ctx.restore();
  }
  function drawFloats(k) {
    for (const f of g.floats) {
      const age = g.t - f.t0, kk = age / 1100;
      const a = Math.min(1, age / 120) * (1 - kk);
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      ctx.font = `${15 * Math.min(k, 1.5)}px ${FONT_SONG}`;
      ctx.fillStyle = '#e2a27c'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(f.text, f.x, f.y - easeOut(kk) * 26);
      ctx.restore();
    }
  }
  // 结尾的心形：小、少、慢，取灯笼的暖色。位置只由游戏时间决定。
  function drawHearts() {
    if (g.victoryAt < 0) return;
    const T = g.t - g.victoryAt;
    ctx.save();
    for (let i = 0; i < 9; i++) {
      const age = T - 300 - i * 420;
      if (age < 0 || age > 3200) continue;
      const k = age / 3200;
      const r = M.mulberry32(i * 77 + 5);
      const x = 480 + (r() - 0.5) * 220 + Math.sin(age / 700 + i) * 8;
      const y = GROUND - 250 - easeOut(k) * 70;
      const a = Math.min(1, age / 500) * (1 - k * k);
      ctx.globalAlpha = a * 0.85;
      ctx.fillStyle = '#e0966c';
      const s = 5 + r() * 2.5;
      ctx.beginPath();
      ctx.moveTo(x, y + s);
      ctx.bezierCurveTo(x - s * 1.6, y - s * 0.2, x - s * 0.6, y - s * 1.2, x, y - s * 0.3);
      ctx.bezierCurveTo(x + s * 0.6, y - s * 1.2, x + s * 1.6, y - s * 0.2, x, y + s);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawHud(k) {
    ui.boxes = [];
    // 孟良头上的三格金盔
    if (g.stage === 1 && g.e.act !== 'defeat') {
      const e = g.e;
      for (let i = 0; i < 3; i++) drawHelmet(camX(e.x) + (i - 1) * 30, camY(GROUND - 252), 0.9, i < g.helmets);
    }
    if (g.stage === 1 && g.e.act !== 'defeat') box('helmets', camX(g.e.x) - 52, camY(GROUND - 252) - 16, 104, 30);
    drawQi(k);
    box('qi', portrait ? 8 : 20, portrait ? 10 : 28 * k - 14, 24 + 13 * 5 + 28, 28);
    if (g.stage === 2) drawMeter(k);
    ctx.save(); camApply(); drawFloats(k); drawHearts(); ctx.restore();
    // 开场提示：只给键盘用户，几秒后淡出
    if (!touchUI && g.stage === 1 && g.t < 9000 && g.phase === 'play') {
      const a = Math.min(1, (9000 - g.t) / 1200) * Math.min(1, g.t / 600) * 0.7;
      ctx.save(); ctx.globalAlpha = a;
      ctx.font = `13px ${FONT_KAI}`; ctx.fillStyle = GOLD; ctx.textAlign = 'center';
      if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
      ctx.fillText('← → 走　J 出枪　K 架枪（按住）　L 或空格 翻身', VW / 2, 58 * Math.max(1, k * 0.7));
      box('hint', VW / 2 - 190, 58 * Math.max(1, k * 0.7) - 10, 380, 20);
      ctx.restore();
    }
    drawSubtitle(k);
    // 再来 / 再玩一遍
    if (g.phase === 'retry') overlayText('再来', touchUI ? '点一下' : '点一下，或按 J', k, 0.55);
    else if (g.phase === 'end' && g.endT > 1200 && !g.sub) {
      const a = Math.min(1, (g.endT - 1200) / 800);
      ctx.save(); ctx.globalAlpha = a * 0.8;
      ctx.font = `${14 * Math.min(k, 1.6)}px ${FONT_KAI}`; ctx.fillStyle = GOLD; ctx.textAlign = 'center';
      if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';
      const msg = touchUI ? '再来一遍：点一下' : '再来一遍：点一下，或按 J';
      ctx.textBaseline = 'middle';
      ctx.fillText(msg, VW / 2, H - 40);
      const mw = ctx.measureText(msg).width;
      box('prompt', VW / 2 - mw / 2, H - 40 - 10, mw, 20);
      ctx.restore();
    }
  }
  function overlayText(big, small, k, veil) {
    ctx.fillStyle = `rgba(10,7,18,${veil})`; ctx.fillRect(0, 0, VW, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${64 * Math.min(k, 1.5)}px ${FONT_KAI}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '12px';
    ctx.fillStyle = GOLD; ctx.fillText(big, VW / 2 + 6, H / 2 - 20);
    ctx.font = `${16 * Math.min(k, 1.5)}px ${FONT_KAI}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
    ctx.fillStyle = PAPER; ctx.fillText(small, VW / 2, H / 2 + 38);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }

  // ---------- 取景：桌面和横屏整幅；手机竖屏取 400 宽的窗，水平跟着两人中点平滑移动、到底图边缘钳住 ----------
  let cam = { cx: W / 2 }, camLast = 0, camInit = false;
  function updateCam() {
    const target = portrait ? Math.max(VW / 2, Math.min(W - VW / 2, (g.p.x + g.e.x) / 2)) : W / 2;
    const now = performance.now(), dtr = Math.min(100, now - camLast);
    camLast = now;
    if (!camInit || Math.abs(target - cam.cx) > 420) { cam.cx = target; camInit = true; return; }
    cam.cx += (target - cam.cx) * (1 - Math.exp(-dtr / 140));
  }
  const camOff = () => cam.cx - VW / 2;
  function camApply() { ctx.translate(-camOff(), 0); }
  const camX = (x) => x - camOff();
  const camY = (y) => y;

  // ---------- 整帧 ----------
  let dpr = 1, scale = 1;
  function fit() {
    portrait = matchMedia('(max-aspect-ratio: 1/1)').matches;
    VW = portrait ? 400 : W;
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, self.devicePixelRatio || 1);
    const w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    scale = r.width / VW;
  }
  function render(opts) {
    opts = opts || {};
    fit();
    const s = canvas.width / VW;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    const k = Math.max(1, 0.8 / Math.max(0.05, scale));
    const sk = M.shakeOffset(g);
    updateCam();
    ctx.save();
    ctx.translate(sk.x, sk.y);
    camApply();
    BD.draw(ctx, g.t, cam.cx);
    if (!opts.hideActors) {
      drawWarnLine(g.e, g.t);
      const order = g.e.id === 'e' ? [g.e, g.p] : [g.p, g.e];
      for (const a of order) drawActor(a, g.t);
      drawFx();
    }
    BD.dust(ctx, g.t);
    ctx.restore();
    BD.front(ctx, g.t, VW);
    drawHud(k);
    if (g.fade > 0) { ctx.fillStyle = `rgba(6,4,12,${g.fade})`; ctx.fillRect(0, 0, VW, H); }
  }

  // ---------- 声音：WebAudio 合成，第一次点按后才出声 ----------
  const srng = M.mulberry32(20261112);
  let ac = null, master = null, muted = false;
  const muteBtn = document.getElementById('mute');
  function unlock() {
    if (!ac) {
      const AC = self.AudioContext || self.webkitAudioContext;
      if (!AC) return;
      ac = new AC(); master = ac.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
  }
  const jitter = () => 1 + (srng() - 0.5) * 0.12;     // 音高随机偏 ±6%
  function noiseBuf(len) {
    const b = ac.createBuffer(1, Math.floor(ac.sampleRate * len), ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = srng() * 2 - 1;
    return b;
  }
  function env(gn, t0, a, d, peak) {
    gn.gain.setValueAtTime(0.0001, t0);
    gn.gain.exponentialRampToValueAtTime(peak, t0 + a);
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }
  function ban(vol) {            // 板：木头脆响
    const t0 = ac.currentTime, src = ac.createBufferSource(); src.buffer = noiseBuf(0.12);
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400 * jitter(); bp.Q.value = 1.2;
    const gn = ac.createGain(); env(gn, t0, 0.002, 0.07, vol);
    src.connect(bp); bp.connect(gn); gn.connect(master); src.start(t0);
    const o = ac.createOscillator(), og = ac.createGain();
    o.frequency.setValueAtTime(1300 * jitter(), t0); o.frequency.exponentialRampToValueAtTime(420, t0 + 0.05);
    env(og, t0, 0.002, 0.05, vol * 0.5); o.connect(og); og.connect(master); o.start(t0); o.stop(t0 + 0.12);
  }
  function gong(base, dur, vol, parts) {   // 锣：几个不成整数比的泛音
    const t0 = ac.currentTime;
    (parts || [1, 1.47, 2.09, 2.76]).forEach((m, i) => {
      const o = ac.createOscillator(), gn = ac.createGain();
      o.type = 'sine'; o.frequency.value = base * m * jitter();
      env(gn, t0, 0.004 + i * 0.002, dur / (1 + i * 0.6), vol / (1 + i * 0.7));
      o.connect(gn); gn.connect(master); o.start(t0); o.stop(t0 + dur + 0.3);
    });
  }
  function ping() {              // 架开：脆而亮
    const t0 = ac.currentTime, o = ac.createOscillator(), gn = ac.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(2000 * jitter(), t0);
    o.frequency.exponentialRampToValueAtTime(2300, t0 + 0.1);
    env(gn, t0, 0.002, 0.16, 0.22); o.connect(gn); gn.connect(master); o.start(t0); o.stop(t0 + 0.25);
    ban(0.18);
  }
  function thud(vol) {
    const t0 = ac.currentTime, o = ac.createOscillator(), gn = ac.createGain();
    o.frequency.setValueAtTime(190 * jitter(), t0); o.frequency.exponentialRampToValueAtTime(70, t0 + 0.12);
    env(gn, t0, 0.004, 0.14, vol); o.connect(gn); gn.connect(master); o.start(t0); o.stop(t0 + 0.2);
  }
  function play(ev) {
    if (!ac || muted) return;
    switch (ev.type) {
      case 'swing': thud(0.07); break;
      case 'warn': thud(0.1); break;
      case 'ding': ban(0.14); gong(1500, 0.18, 0.05, [1, 1.5]); break;
      case 'tap': ban(0.3); gong(520, 0.35, 0.12); break;
      case 'helmet': ban(0.35); gong(480, 0.6, 0.2); break;
      case 'parry': ping(); break;
      case 'block': ban(0.22); thud(0.12); break;
      case 'clash': ban(0.4); gong(420, 0.8, 0.22); break;
      case 'hurt': thud(0.28); ban(0.2); break;
      case 'dodge': thud(0.05); break;
      case 'gongBig': gong(110, 3.2, 0.5, [1, 1.58, 2.2, 2.76, 3.5]); break;
      default: break;
    }
  }
  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      unlock(); muted = !muted;
      muteBtn.setAttribute('aria-pressed', String(muted));
      muteBtn.textContent = muted ? '静' : '声';
      if (master) master.gain.value = muted ? 0 : 0.5;
    });
  }

  // ---------- 输入：键盘和触屏发的是同一套意图 ----------
  const KEYS = {
    arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right',
    j: 'attack', k: 'guard', l: 'dodge', ' ': 'dodge', space: 'dodge',
    left: 'left', right: 'right', attack: 'attack', guard: 'guard', dodge: 'dodge',
  };
  const downNow = new Set();
  function intentDown(i) { unlock(); if (!downNow.has(i)) { downNow.add(i); M.input(g, i, true); } }
  function intentUp(i) { if (downNow.has(i)) { downNow.delete(i); M.input(g, i, false); } }
  function releaseAll() { for (const i of [...downNow]) intentUp(i); }
  addEventListener('keydown', (e) => {
    const i = KEYS[e.key.toLowerCase()];
    if (!i) return;
    if (e.key === ' ' || e.key.startsWith('Arrow')) e.preventDefault();
    if (e.repeat) return;
    intentDown(i);
  });
  addEventListener('keyup', (e) => { const i = KEYS[e.key.toLowerCase()]; if (i) intentUp(i); });
  addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
  document.querySelectorAll('#pad button').forEach((b) => {
    const i = b.dataset.k;
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { b.setPointerCapture(e.pointerId); } catch (_) { /* 部分浏览器不支持 */ }
      b.setAttribute('aria-pressed', 'true');
      // 方向和架枪是按住，出枪和闪避是点一下
      if (i === 'attack' || i === 'dodge') { intentDown(i); setTimeout(() => intentUp(i), 90); } else intentDown(i);
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      b.addEventListener(ev, () => { b.setAttribute('aria-pressed', 'false'); if (i !== 'attack' && i !== 'dodge') intentUp(i); });
    }
  });
  // 点画面：「再来」和结尾后重来
  canvas.addEventListener('pointerdown', () => {
    unlock();
    if (g.phase === 'retry' || g.phase === 'end') { M.input(g, 'attack', true); M.input(g, 'attack', false); }
  });

  // ---------- 统一试玩钩子 ----------
  function coverage() {
    // 主体加背景 与 仅背景 各渲一次，在人物格子内数变化的像素
    render({});
    const full = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const rs = {};
    for (const id of ['p', 'e']) rs[id] = rects[id];
    render({ hideActors: true });
    const bg = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const s = canvas.width / VW, out = {};
    for (const id of ['p', 'e']) {
      const r0 = rs[id];
      const r = { x: camX(r0.x), y: camY(r0.y), w: r0.w, h: r0.h };
      const x0 = Math.max(1, Math.floor(r.x * s) + 1), y0 = Math.max(1, Math.floor(r.y * s) + 1);
      const x1 = Math.min(canvas.width - 1, Math.floor((r.x + r.w) * s) - 1);
      const y1 = Math.min(canvas.height - 1, Math.floor((r.y + r.h) * s) - 1);
      let n = 0, diff = 0, minY = 1e9, maxY = -1;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * canvas.width + x) * 4;
        n++;
        const d = Math.abs(full.data[i] - bg.data[i]) + Math.abs(full.data[i + 1] - bg.data[i + 1])
          + Math.abs(full.data[i + 2] - bg.data[i + 2]);
        if (d > 24) { diff++; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      }
      // heightCss：变化像素从最高到最低的高度，换成 CSS 像素，就是人在屏幕上的高度
      out[id] = { pixels: diff, area: n, ratio: n ? diff / n : 0, heightCss: maxY >= 0 ? (maxY - minY) / dpr : 0 };
    }
    render({});
    return out;
  }
  function luma() {
    // 整屏亮度分布：中位数与高于 0.6 的占比，验「大部分画面是暗的」
    render({});
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data, hist = new Uint32Array(256);
    let n = 0, hi = 0;
    for (let i = 0; i < d.length; i += 16) {
      const y = Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
      hist[y]++; n++; if (y > 153) hi++;
    }
    let acc = 0, med = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n / 2) { med = v / 255; break; } }
    return { median: med, brightShare: hi / n };
  }
  self.__PLAYTEST__ = {
    get ready() { return ready; },
    snapshot: () => Object.assign(M.snapshot(g), { view: VIEW, paused, seed: g.seed, touch: touchUI }),
    reset: () => { seedOverride = true; newGame(g.seed, STAGE); seedOverride = false; },
    setSeed: (n) => { seedOverride = true; newGame(n, STAGE); seedOverride = false; },
    step: (ms) => { paused = true; M.advance(g, ms); syncUi(0); render(); },
    play: () => { paused = false; },
    press: (name, ms) => {
      const i = KEYS[String(name).toLowerCase()];
      if (i) M.tap(g, i, ms == null ? 120 : ms);
    },
    coverage, luma,
    // 界面各元素的外框（CSS 像素，相对视口），给浏览器检查查重叠
    layout: () => {
      render({});
      const r = canvas.getBoundingClientRect(), out = ui.boxes.map((b) => ({
        name: b.name, left: r.left + b.x * scale, top: r.top + b.y * scale,
        right: r.left + (b.x + b.w) * scale, bottom: r.top + (b.y + b.h) * scale,
      }));
      if (muteBtn) { const m = muteBtn.getBoundingClientRect(); out.push({ name: 'mute', left: m.left, top: m.top, right: m.right, bottom: m.bottom }); }
      return { boxes: out, portrait, canvas: { w: r.width, h: r.height }, viewport: { w: innerWidth, h: innerHeight } };
    },
  };

  // ---------- 主循环 ----------
  function syncUi(dt) {
    // 心动条平滑追上真实数值；事件里取声音和脉冲
    ui.meterShown += (g.meter - ui.meterShown) * Math.min(1, dt / 220 + 0.0001);
    if (!dt) ui.meterShown = g.meter;
    ui.meterPulse = Math.max(0, ui.meterPulse - dt / 500);
    for (const ev of g.events) {
      if (ev.id <= ui.lastEvent) continue;
      ui.lastEvent = ev.id;
      if (g.t - ev.t < 400) play(ev);
      if (ev.type === 'meter') ui.meterPulse = ev.meter >= 100 ? 1 : 0.35;
    }
  }
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(50, now - last); last = now;
    if (!paused) { M.advance(g, dt); syncUi(dt); }
    render();
    requestAnimationFrame(frame);
  }
  Promise.all(loads).then(() => {
    newGame(SEED, STAGE);
    if (VIEW) paused = true;
    ui.meterShown = g.meter; ui.lastEvent = g.eventId;
    render();
    ready = true;
    requestAnimationFrame((t) => { last = t; frame(t); });
  });
})();
