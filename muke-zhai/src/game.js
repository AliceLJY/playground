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
  const sign = (v) => (v < 0 ? -1 : 1);

  let g = null, paused = false, ready = false;
  const ui = { confirmT: -1e9, chargeRect: null, meterPos: null, looseT: -1e9, push: 0, meterShown: 0, meterPulse: 0, lastEvent: 0, qiLost: 0, boxes: [], slow: 0 };
  let VW = W, portrait = false;   // 当前取景窗的逻辑宽度；手机竖屏取 400 宽的窗，跟着人走
  const box = (name, x, y, w, h) => ui.boxes.push({ name, x, y, w, h });

  // 教学：第一次进游戏默认走；?tutorial=0 关、?tutorial=1 强制开；机位默认不出教学（teach3 除外）
  const TUT_KEY = 'mkz-tutorial-done';
  const store = {
    get() { try { return localStorage.getItem(TUT_KEY) === '1'; } catch (_) { return false; } },
    set() { try { localStorage.setItem(TUT_KEY, '1'); } catch (_) { /* 无痕模式等 */ } },
  };
  const STORY_KEY = 'mkz-story-seen';
  const storyStore = {
    get() { try { return localStorage.getItem(STORY_KEY) === '1'; } catch (_) { return false; } },
    set() { try { localStorage.setItem(STORY_KEY, '1'); } catch (_) { /* 无痕模式 */ } },
  };
  function wantStory() {
    return M.storyPolicy({ param: params.get('story'), view: VIEW, stage: STAGE, tutorialParam: params.get('tutorial'), seen: storyStore.get() });
  }
  function wantTutorial() {
    const q = params.get('tutorial');
    if (q === '0') return false;
    if (q === '1' || VIEW === 'teach3') return true;
    if (VIEW || STAGE === 2) return false;
    return !store.get();
  }
  let forceTut = null, forceStory = null;
  let main = null, demo = null;          // 示范跑在独立的一局里，main 是玩家自己的局
  function newGame(seed, stage) {
    const tut = forceTut != null ? forceTut : wantTutorial();
    g = M.create(CLIPS, { seed, stage, tutorial: tut && stage !== 2, touch: touchUI, hints: true, story: forceStory != null ? forceStory : wantStory() });
    main = g; demo = null;
    ui.meterShown = 0; ui.lastEvent = 0; ui.meterPulse = 0; ui.slow = 0;
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
    // 杨宗保在第一场站在门边，离台口远一点：画得略小（6%）、略暗；孟良结尾探身也是这个画法
    const D = a.id === 'z' || a.id === 'm';
    const sc = D ? 0.94 : 1, gy = D ? GROUND - 22 : GROUND;
    const f = M.frameOf(a), clip = CLIPS[a.who][f.clip];
    const cv = processed(a.who, f.clip, f.frame);
    const level = BD.lightAt(a.x);
    // 脚下接触影：由深到浅三层，不是一个纯黑椭圆
    const layers = D ? [[60, 9, 0.16], [40, 6, 0.26]] : [[84, 13, 0.14], [60, 9, 0.22], [38, 6, 0.34]];
    for (const [rx, ry, al] of layers) {
      ctx.fillStyle = `rgba(6,4,14,${al})`;
      ctx.beginPath(); ctx.ellipse(a.x, gy + 2, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    }
    // 地板上压扁、很淡的倒影
    ctx.save();
    ctx.translate(a.x, gy + 3); ctx.scale(a.face * sc, -0.26 * sc);
    ctx.globalAlpha = 0.11;
    ctx.drawImage(cv, -clip.anchor[0] - PAD, -clip.anchor[1] - PAD);
    ctx.restore();
    // 她架着的时候：枪身一道很淡的暖色护光，加脚下一圈细环；松手就没有
    if (a.id === 'p' && M.guardActive(a)) {
      const br = 0.6 + 0.4 * Math.sin(g.t / 160);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gx = a.x + a.face * 30;
      const gr = ctx.createRadialGradient(gx, GROUND - 130, 6, gx, GROUND - 130, 100);
      gr.addColorStop(0, `rgba(255,170,90,${0.13 * br})`); gr.addColorStop(1, 'rgba(255,140,70,0)');
      ctx.fillStyle = gr; ctx.fillRect(gx - 100, GROUND - 240, 200, 220);
      ctx.strokeStyle = `rgba(255,190,120,${0.45 + 0.2 * br})`; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(a.x, GROUND + 2, 58, 9, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // 灯间更暗：只用正片叠底（变暗不蒙白）；受击闪一下暖白；预警不动透明度，只闪轮廓
    const dk = 0.06 + 0.24 * (1 - level) + (D ? 0.2 : 0);
    const m = Math.round(255 * (1 - dk));
    // 大招的残影：三四层逐渐变淡，沿着出枪的方向往后拖
    if (a.act === 'ult' && a.ultT >= 0 && !noGhost) {
      for (let i = 3; i >= 1; i--) {
        const gf = M.frameOf(Object.assign({}, a, { ultT: Math.max(0, a.ultT - i * 38) }));
        const gc = processed(a.who, gf.clip, gf.frame);
        ctx.save();
        ctx.translate(a.x - a.face * i * 15, GROUND); ctx.scale(a.face, 1);
        ctx.globalAlpha = 0.34 / i;
        ctx.drawImage(gc, -clip.anchor[0] - PAD, -clip.anchor[1] - PAD);
        ctx.restore();
      }
    }
    // 被打中的抖一下
    const shk = a.shake > 0 ? Math.sin(g.t * 0.13) * 3 * (a.shake / 180) : 0;
    ctx.save();
    ctx.translate(a.x + shk, gy); ctx.scale(a.face * sc, sc);
    const dx = -clip.anchor[0] - PAD, dy = -clip.anchor[1] - PAD;
    tctx.globalCompositeOperation = 'source-over';
    tctx.clearRect(0, 0, tmp.width, tmp.height);
    tctx.drawImage(cv, 0, 0);
    tctx.globalCompositeOperation = 'multiply';
    tctx.fillStyle = `rgb(${m},${m},${Math.min(255, m + 8)})`; tctx.fillRect(0, 0, cv.width, cv.height);
    tctx.globalCompositeOperation = 'destination-in';
    tctx.drawImage(cv, 0, 0);
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
    // 被打中：不整身变白，只在受击的那一侧闪一道窄亮边（约 60 毫秒），身体抖动另算
    if (a.flash > 0 && !noFlash) {
      const side = sign((a.id === 'p' ? g.e.x : g.p.x) - a.x);
      ctx.save();
      ctx.beginPath(); ctx.rect(side > 0 ? a.x - 6 : a.x - 420, 0, 426, H); ctx.clip();
      ctx.translate(a.x + shk, gy); ctx.scale(a.face * sc, sc);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.85 * Math.min(1, a.flash / 60);
      ctx.drawImage(ring(a.who, f.clip, f.frame), dx, dy);
      ctx.restore();
    }
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

  // ---------- 枪尖的弧形拖影：沿出枪那几帧枪尖走过的路径，细、亮芯、两端收尖、很快灭 ----------
  // 枪尖位置只由出招动画时间决定（没有逐帧坐标，按出手帧前后一段弧线估算），所以定格和回放都一致
  function tipAt(a, tau) {
    const hitT = a.tabs.attack.hitT;
    const k = Math.max(0, Math.min(1, (tau - (hitT - 150)) / 260));
    const e = 1 - Math.pow(1 - k, 3);
    const reach = a.spec.reach * 0.93;
    return { x: a.x + a.face * (26 + e * (reach - 26)), y: GROUND - 160 + e * 12 - Math.sin(e * Math.PI) * 24 };
  }
  function drawTrail(a) {
    let tau, long = 1;
    const hitT = a.tabs.attack.hitT;
    if (a.act === 'attack') { tau = a.t * a.rate; long = a.atk ? a.atk.trail : 1; }
    else if (a.act === 'ult' && a.ultT >= 0) { tau = hitT - 150 + ((a.ultT % 150) / 150) * 260; long = 1.8; }
    else return;
    if (tau < hitT - 150 || tau > hitT + 300) return;
    const fade = tau > hitT + 120 ? Math.max(0, 1 - (tau - hitT - 120) / 180) : 1;
    const N = Math.max(4, Math.round(9 * long)), step = 11;
    const pts = [];
    for (let i = 0; i < N; i++) { const t0 = tau - i * step; if (t0 < hitT - 150) break; pts.push(tipAt(a, t0)); }
    if (pts.length < 2) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 0; i < pts.length - 1; i++) {
      const k = 1 - i / (pts.length - 1);            // 头 1，尾 0：两端收尖
      const w = (0.6 + 3.2 * k) * Math.min(1.4, 0.8 + long * 0.3), al = Math.min(0.5, (0.14 + 0.42 * k) * fade * (0.8 + long * 0.12));
      ctx.strokeStyle = `rgba(255,150,70,${(al * 0.3).toFixed(3)})`; ctx.lineWidth = w * 2.2;
      ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[i + 1].x, pts[i + 1].y); ctx.stroke();
      ctx.strokeStyle = `rgba(255,226,170,${al.toFixed(3)})`; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[i + 1].x, pts[i + 1].y); ctx.stroke();
    }
    ctx.restore();
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
        gl.addColorStop(0, `rgba(255,200,130,${0.28 * (1 - k)})`); gl.addColorStop(1, 'rgba(255,160,80,0)');
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
  // 盔形小图标：on 亮着；wobble 是晃动的弧度；chips 是缺角的数量（松动的格数）
  function drawHelmet(x, y, s, on, wobble, chips) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(wobble || 0); ctx.scale(s, s);
    ctx.lineWidth = 1.2 / s;
    ctx.strokeStyle = on ? GOLD : 'rgba(201,164,92,.28)';
    ctx.fillStyle = on ? 'rgba(201,164,92,.22)' : 'rgba(201,164,92,.04)';
    ctx.beginPath(); ctx.moveTo(-9, 4); ctx.quadraticCurveTo(-9, -8, 0, -9); ctx.quadraticCurveTo(9, -8, 9, 4);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-12, 4); ctx.lineTo(12, 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(0, -13); ctx.stroke();
    // 缺角：用背景色的小三角在盔沿上咬掉一口
    if (on && chips > 0) {
      ctx.fillStyle = 'rgba(16,10,18,.95)';
      const cuts = [[-9, -2, -4, -8, -9, -8], [9, -2, 4, -8, 9, -8]];
      for (let i = 0; i < Math.min(2, chips); i++) {
        const c = cuts[i];
        ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(c[2], c[3]); ctx.lineTo(c[4], c[5]); ctx.closePath(); ctx.fill();
      }
    }
    ctx.restore();
  }
  // 对手出招的蓄力条：从预警开始匀速走满，走满的那一刻招式落下；最后 0.2 秒（架开判定窗）用更亮的暖色标出
  function drawCharge() {
    const b = M.chargeBar(g);
    ui.chargeRect = null;
    if (!b) return;
    const e = g.e, w = 130, h = 8;
    // 孟良：金盔图标下面；杨宗保：心动条下面一行（两条不重叠、不遮脸）
    const x = camX(e.x) - w / 2, y = camY(e.who === 'mengliang' ? GROUND - 226 : GROUND - 318);
    const ws = b.winStart * w, fw = b.frac * w;
    const inWin = b.frac >= b.winStart;
    ctx.save();
    ctx.fillStyle = 'rgba(14,9,18,.86)'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    // 外框：条头进入亮段的那一下整条外框亮一下
    const since = inWin ? Math.min(1, (b.frac - b.winStart) / Math.max(0.02, 1 - b.winStart)) : 0;
    const flashK = inWin ? Math.max(0, 1 - since * 1.8) : 0;
    ctx.strokeStyle = `rgba(${150 + 105 * flashK},${104 + 96 * flashK},${60 + 60 * flashK},${0.55 + 0.45 * flashK})`; ctx.lineWidth = 1 + flashK;
    ctx.strokeRect(x - 2.5, y - 2.5, w + 5, h + 5);
    // 没走到的部分：身子暗、亮段更暖更亮的琥珀
    ctx.fillStyle = 'rgba(96,62,46,.85)'; ctx.fillRect(x, y, ws, h);
    ctx.fillStyle = 'rgba(244,168,78,1)'; ctx.fillRect(x + ws, y, w - ws, h);
    // 已走过的部分
    ctx.fillStyle = 'rgba(206,134,82,.97)'; ctx.fillRect(x, y, Math.min(fw, ws), h);
    if (fw > ws) { ctx.fillStyle = 'rgba(255,232,180,1)'; ctx.fillRect(x + ws, y, fw - ws, h); }
    if (inWin) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,176,96,${0.16 + 0.1 * Math.sin(g.t / 90)})`; ctx.fillRect(x, y - 1, w, h + 2);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.fillStyle = 'rgba(255,240,200,.97)'; ctx.fillRect(x + fw - 1.5, y - 3, 3, h + 6);
    const age = g.t - ui.confirmT;
    if (age >= 0 && age < 260) {
      const k2 = age / 260, hx = x + fw, hy = y + h / 2;
      ctx.globalCompositeOperation = 'lighter';
      const gl = ctx.createRadialGradient(hx, hy, 1, hx, hy, 8 + 10 * k2);
      gl.addColorStop(0, `rgba(255,236,190,${0.8 * (1 - k2)})`); gl.addColorStop(1, 'rgba(255,170,90,0)');
      ctx.fillStyle = gl; ctx.fillRect(hx - 20, hy - 20, 40, 40);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (b.strikes > 1) {
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i < b.strike ? 'rgba(255,214,150,.95)' : 'rgba(120,80,60,.8)';
        ctx.fillRect(x + w / 2 - 10 + i * 8, y + h + 5, 4, 2);
      }
    }
    // 教学里：条的左边一个细的小箭头指向它（从字幕指过来的意思）
    let ax = 0;
    if (g.tut && !demo) {
      const br = 0.6 + 0.4 * Math.sin(g.t / 200);
      ctx.fillStyle = `rgba(240,190,120,${0.7 + 0.3 * br})`;
      ctx.beginPath(); ctx.moveTo(x - 20 + 2 * br, y + h / 2 - 5); ctx.lineTo(x - 9 + 2 * br, y + h / 2); ctx.lineTo(x - 20 + 2 * br, y + h / 2 + 5); ctx.closePath(); ctx.fill();
      ax = 22;
    }
    ctx.restore();
    ui.chargeRect = { x, y, w, h, ws, frac: b.frac };
    box('charge', x - 4 - ax, y - 5, w + 8 + ax, h + (b.strikes > 1 ? 16 : 10));
  }

  // 势条：气下面一条细的，满了暖光亮一点
  function drawShi(k) {
    const x = portrait ? 12 : 16, y = portrait ? 45 : 28 * k + 23, w = 92, h = 3;
    const frac = Math.max(0, Math.min(1, g.shi / 100)), full = g.shi >= 100;
    box('shi', x - 4, y - 6, w + 34, 12);
    ctx.save();
    ctx.fillStyle = full ? 'rgba(226,160,96,.95)' : GOLD_DIM; ctx.font = `11px ${FONT_KAI}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('势', x, y);
    const bx = x + 18;
    ctx.fillStyle = 'rgba(20,12,22,.7)'; ctx.fillRect(bx, y - h / 2, w, h);
    ctx.strokeStyle = GOLD_DIM; ctx.lineWidth = 1; ctx.strokeRect(bx - 0.5, y - h / 2 - 0.5, w + 1, h + 1);
    if (frac > 0) {
      const gr = ctx.createLinearGradient(bx, 0, bx + w, 0);
      gr.addColorStop(0, '#6e1f28'); gr.addColorStop(1, full ? '#f0b878' : '#d79078');
      ctx.fillStyle = gr; ctx.fillRect(bx, y - h / 2, w * frac, h);
    }
    if (full) {
      const br = 0.5 + 0.5 * Math.sin(g.t / 300);
      ctx.fillStyle = `rgba(255,214,160,${0.25 + 0.3 * br})`; ctx.fillRect(bx, y - h / 2 - 1, w, h + 2);
    }
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
  // 心动条：跟着杨宗保走的一条小条，在他头顶翎子上方；他让进门帘里时条变淡但不消失
  const heartActor = () => g.z || (g.e && g.e.who === 'zongbao' ? g.e : (g.phase === 'end' || g.phase === 'finale' ? g.e : null));
  const HEART_Y = GROUND - 336;
  function heartPath(x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + s);
    ctx.bezierCurveTo(x - s * 1.6, y - s * 0.2, x - s * 0.6, y - s * 1.2, x, y - s * 0.3);
    ctx.bezierCurveTo(x + s * 0.6, y - s * 1.2, x + s * 1.6, y - s * 0.2, x, y + s);
    ctx.closePath();
  }
  function drawHeart(k) {
    const z = heartActor();
    ui.meterPos = null;
    if (!z) return;
    const frac = Math.max(0, Math.min(1, ui.meterShown / 100));
    const sx = camX(z.x), y = camY(HEART_Y);
    // 取景窗里看不到他（手机竖屏、第一场两人在左半场）：右缘贴边画一个小指示
    if (sx > VW - 26) {
      const ex = VW - 20, ey = Math.round(H * 0.56);
      ctx.save();
      ctx.fillStyle = 'rgba(14,9,18,.7)'; ctx.fillRect(ex - 16, ey - 17, 34, 34);
      ctx.strokeStyle = GOLD_DIM; ctx.lineWidth = 1; ctx.strokeRect(ex - 15.5, ey - 16.5, 33, 33);
      // 当前心动的细弧
      ctx.strokeStyle = 'rgba(80,36,40,.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ex - 2, ey, 11, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(226,140,110,.95)';
      ctx.beginPath(); ctx.arc(ex - 2, ey, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); ctx.stroke();
      ctx.fillStyle = `rgba(226,150,120,${0.8 + 0.2 * ui.meterPulse})`; heartPath(ex - 2, ey - 2, 4.5); ctx.fill();
      // 朝右的小箭头
      ctx.fillStyle = GOLD; ctx.beginPath(); ctx.moveTo(ex + 8, ey - 4); ctx.lineTo(ex + 14, ey); ctx.lineTo(ex + 8, ey + 4); ctx.closePath(); ctx.fill();
      ctx.restore();
      box('heartEdge', ex - 16, ey - 17, 34, 34);
      ui.meterPos = { x: ex - 2, y: ey, edge: true };
      return;
    }
    const w = 110, h = 6, x = sx - w / 2 + 6;
    const hide = z.x > 830 ? 0.55 : 1;
    const sc = 1 + 0.16 * ui.meterPulse;
    ctx.save();
    ctx.globalAlpha = hide;
    ctx.translate(sx, y); ctx.scale(sc, sc); ctx.translate(-sx, -y);
    // 左端一颗小心形，细长的槽，暗朱红到暖粉的填充加亮前沿
    ctx.fillStyle = 'rgba(14,9,18,.78)'; ctx.fillRect(x - 14, y - 7, w + 18, 14);
    ctx.fillStyle = `rgba(226,140,112,${0.85 + 0.15 * ui.meterPulse})`; heartPath(x - 6, y - 1, 3.8); ctx.fill();
    ctx.fillStyle = 'rgba(32,18,26,.9)'; ctx.fillRect(x, y - h / 2, w, h);
    ctx.strokeStyle = GOLD_DIM; ctx.lineWidth = 1; ctx.strokeRect(x - 0.5, y - h / 2 - 0.5, w + 1, h + 1);
    if (frac > 0) {
      const gr = ctx.createLinearGradient(x, 0, x + w, 0);
      gr.addColorStop(0, '#6e1f28'); gr.addColorStop(1, '#d79078');
      ctx.fillStyle = gr; ctx.fillRect(x, y - h / 2, w * frac, h);
      ctx.fillStyle = `rgba(255,214,170,${0.55 + 0.4 * ui.meterPulse})`;
      ctx.fillRect(x + w * frac - 1.5, y - h / 2 - 1, 2, h + 2);
    }
    ctx.restore();
    ui.meterPos = { x: x + w * frac, y };
    ui.heartRect = { x: x - 14, y: y - 7, w: w + 18, h: 14, cx: sx };
    box('heart', x - 14, y - 7, w + 18, 14);
  }
  // 第一次出场的小名牌：头上，停 2.5 秒淡出
  function drawTags() {
    const defs = [['p', g.p, GROUND - 300], ['e', g.e, GROUND - 292], ['z', g.z, GROUND - 306]];
    for (const [id, a, wy] of defs) {
      if (!a || id === 'e' && g.stage !== 1) continue;
      const al = M.tagAlpha(g, id);
      if (al <= 0.02) continue;
      const x = camX(a.x), y = camY(wy);
      if (x < 30 || x > VW - 30) continue;
      ctx.save();
      ctx.globalAlpha = al;
      ctx.font = `12px ${FONT_KAI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
      const text = M.TAG_TEXT[id], tw = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(14,9,18,.72)'; ctx.fillRect(x - tw / 2 - 7, y - 9, tw + 14, 18);
      ctx.strokeStyle = GOLD_DIM; ctx.lineWidth = 1; ctx.strokeRect(x - tw / 2 - 6.5, y - 8.5, tw + 13, 17);
      ctx.fillStyle = PAPER; ctx.fillText(text, x, y + 1);
      ctx.restore();
      box('tag-' + id, x - tw / 2 - 7, y - 9, tw + 14, 18);
    }
  }
  // 戏单式的引子：暗底（戏台底图压暗）、细框、楷体、字距拉开
  function drawIntro() {
    const S = M.STORY;
    ctx.fillStyle = 'rgba(8,6,14,.78)'; ctx.fillRect(0, 0, VW, H);
    const inset = portrait ? 14 : 36;
    ctx.strokeStyle = 'rgba(201,164,92,.5)'; ctx.lineWidth = 1;
    ctx.strokeRect(inset + 0.5, inset + 0.5, VW - inset * 2 - 1, H - inset * 2 - 1);
    ctx.strokeStyle = 'rgba(201,164,92,.22)';
    ctx.strokeRect(inset + 5.5, inset + 5.5, VW - inset * 2 - 11, H - inset * 2 - 11);
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const ls = (v) => { if ('letterSpacing' in ctx) ctx.letterSpacing = v + 'px'; };
    const cx = VW / 2, big = portrait ? 44 : 58;
    ctx.fillStyle = GOLD; ctx.font = `${big}px ${FONT_KAI}`; ls(big * 0.4);
    ctx.fillText(S.title, cx + big * 0.2, H * 0.2);
    ctx.fillStyle = 'rgba(228,211,174,.7)'; ctx.font = `${portrait ? 13 : 15}px ${FONT_KAI}`; ls(5);
    ctx.fillText(S.sub, cx, H * 0.2 + big * 0.9);
    // 细横线
    ctx.strokeStyle = GOLD_DIM; ctx.beginPath(); ctx.moveTo(cx - 40, H * 0.2 + big * 1.35); ctx.lineTo(cx + 40, H * 0.2 + big * 1.35); ctx.stroke();
    const fs = portrait ? 15 : 18;
    ctx.fillStyle = PAPER; ctx.font = `${fs}px ${FONT_KAI}`; ls(portrait ? 2 : 4);
    let y = H * 0.2 + big * 1.9;
    for (const para of S.lines) {
      for (const ln of wrapText(para, VW - inset * 2 - 50)) { ctx.fillText(ln, cx, y); y += fs * 1.6; }
      y += fs * 0.7;
    }
    ctx.fillStyle = GOLD; ctx.font = `${portrait ? 14 : 16}px ${FONT_KAI}`; ls(6);
    ctx.fillText(S.foot, cx, Math.max(y + fs * 0.6, H * 0.8));
    ctx.fillStyle = 'rgba(201,164,92,.5)'; ctx.font = `12px ${FONT_KAI}`; ls(3);
    ctx.fillText(touchUI ? '点一下继续' : '点一下或按任意键继续', cx, H - inset - 14);
    ctx.restore();
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
      // 下一个要掉的是亮着的最后一顶：松动时它晃一下、缺角（松几格缺几口）
      const age = g.t - ui.looseT, wob = age < 400 ? Math.sin(age / 38) * 0.28 * Math.exp(-age / 150) : 0;
      for (let i = 0; i < 3; i++) {
        const cur = i === g.helmets - 1;
        drawHelmet(camX(e.x) + (i - 1) * 30, camY(GROUND - 252), 0.9, i < g.helmets, cur ? wob : 0, cur ? g.loose : 0);
      }
    }
    if (g.stage === 1 && g.e.act !== 'defeat') box('helmets', camX(g.e.x) - 52, camY(GROUND - 252) - 16, 104, 30);
    drawQi(k);
    if (!g.tut) drawShi(k);
    box('qi', portrait ? 8 : 12, portrait ? 12 : 28 * k - 14, 24 + 13 * 5 + 28, 24);
    drawHeart(k);
    drawCharge();
    drawTags();
    // 他看在眼里：杨宗保有反应时，一个很小的暖色光点飘向心动条
    for (const f of g.fx) {
      if (f.kind !== 'mote' || !ui.meterPos) continue;
      const kk = Math.min(1, (g.t - f.t0) / 650), e2 = 1 - Math.pow(1 - kk, 2);
      const sx = camX(f.x), sy = camY(f.y);
      const mx = sx + (ui.meterPos.x - sx) * e2, my = sy + (ui.meterPos.y - sy) * e2 - Math.sin(kk * Math.PI) * 18;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) {
        const t2 = Math.max(0, kk - i * 0.04), ee = 1 - Math.pow(1 - t2, 2);
        const px = sx + (ui.meterPos.x - sx) * ee, py = sy + (ui.meterPos.y - sy) * ee - Math.sin(t2 * Math.PI) * 18;
        ctx.fillStyle = `rgba(255,190,120,${(0.7 - i * 0.16) * (1 - kk * 0.5)})`;
        ctx.beginPath(); ctx.arc(px, py, 2.6 - i * 0.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    ctx.save(); camApply(); drawFloats(k); drawHearts(); ctx.restore();
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
  // ---------- 教学与示范：按键亮边 ----------
  const padEl = document.getElementById('pad');
  // 哪些键该亮：教学里是「该按的键」（呼吸的暖色亮边），示范里是「她按着的键」
  function glowKeys() {
    const T = g.tut;
    if (!T || demo) return [];
    return T.glow === 'move' ? ['left', 'right'] : T.glow ? [T.glow] : [];
  }
  // 势第一次满了：「架」和「刺」一起亮，放出一次后不再亮
  function ultGlow() { return !demo && !g.tut && g.ultHintOn ? ['guard', 'attack'] : []; }
  function litKeys() {
    if (!demo) return [];
    const out = [];
    if (g.held.left) out.push('left');
    if (g.held.right) out.push('right');
    if (g.held.guard || g.t - g.pressT.guard < 220) out.push('guard');
    if (g.t - g.pressT.attack < 220) out.push('attack');
    if (g.t - g.pressT.dodge < 220) out.push('dodge');
    if (g.ult) out.push('ult');
    return out;
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
    // 竖屏：跟着两人的中点；第一场两人打到右半场时往右偏，把门边的杨宗保带进画面（最多偏 120）
    const mid0 = (g.p.x + g.e.x) / 2;
    let mid = mid0;
    if (g.z && Math.max(g.p.x, g.e.x) > 520) mid += Math.min(120, Math.max(0, (g.z.x - mid) * 0.5));
    // 但不能把穆桂英或孟良挤出画面：两人都要留在取景窗里（各留 50 的边）
    const lo = Math.max(g.p.x, g.e.x) - (VW / 2 - 50), hi = Math.min(g.p.x, g.e.x) + (VW / 2 - 50);
    mid = lo <= hi ? Math.max(lo, Math.min(hi, mid)) : mid0;
    const target = portrait ? Math.max(VW / 2, Math.min(W - VW / 2, mid)) : W / 2;
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
  let noGhost = false, noFlash = false;
  function render(opts) {
    opts = opts || {};
    noGhost = !!opts.noGhost; noFlash = !!opts.noFlash;
    fit();
    const s = canvas.width / VW;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    const k = Math.max(1, 0.8 / Math.max(0.05, scale));
    const sk = M.shakeOffset(g);
    updateCam();
    ctx.save();
    ctx.translate(sk.x, sk.y);
    if (ui.push > 0.005) { const z = 1 + 0.1 * ui.push; const px = camX((g.p.x + g.e.x) / 2); ctx.translate(px, H * 0.66); ctx.scale(z, z); ctx.translate(-px, -H * 0.66); }
    camApply();
    BD.draw(ctx, g.t, cam.cx);
    if (!opts.hideActors && !g.intro) {
      drawWarnLine(g.e, g.t);
      const order = g.e.id === 'e' ? [g.e, g.p] : [g.p, g.e];
      if (g.z) drawActor(g.z, g.t);
      if (g.m && (g.phase === 'end' || (g.phase === 'finale' && g.finStep >= 1))) {
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 850, H); ctx.clip(); drawActor(g.m, g.t); ctx.restore();
      }
      for (const a of order) drawActor(a, g.t);
      for (const a of order) drawTrail(a);
      drawFx();
    }
    BD.dust(ctx, g.t);
    ctx.restore();
    BD.front(ctx, g.t, VW);
    if (g.intro) { ui.boxes = []; drawIntro(); return; }
    // 慢放时整个画面略带冷色（跟着真实时间缓入缓出，不跟着慢放走）
    if (ui.slow > 0.01) { ctx.fillStyle = `rgba(22,18,56,${(0.16 * ui.slow).toFixed(3)})`; ctx.fillRect(0, 0, VW, H); }
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
      case 'hit': ban(ev.kind === 'normal' || ev.kind === 'light' ? 0.28 : 0.4); gong(ev.kind === 'heavy' ? 340 : 480, ev.kind === 'light' ? 0.25 : 0.5, ev.kind === 'heavy' ? 0.22 : 0.12); break;
      case 'loose': ban(0.2); break;
      case 'shiFull': gong(1180, 0.9, 0.08, [1, 1.5, 2.0]); break;
      case 'ult': thud(0.22); gong(160, 0.5, 0.12); break;
      case 'ultHit': ban(0.3 + (ev.i || 0) * 0.03); break;
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
    j: 'attack', k: 'guard', l: 'dodge', ' ': 'dodge', space: 'dodge', u: 'ult',
    left: 'left', right: 'right', attack: 'attack', guard: 'guard', dodge: 'dodge', ult: 'ult',
  };
  // 引子：点一下或按任意键继续（拦下，不当成游戏输入），并记住「看过」
  function closeIntro() { M.dismissIntro(main); storyStore.set(); }
  document.addEventListener('pointerdown', (e) => {
    if (!g.intro) return;
    if (e.target && e.target.closest && e.target.closest('#mute')) return;
    e.stopPropagation(); e.preventDefault(); unlock(); closeIntro();
  }, true);
  addEventListener('keydown', (e) => {
    if (!g.intro) return;
    e.stopImmediatePropagation(); e.preventDefault(); closeIntro();
  }, true);
  // 示范进行中：点任意位置、按任意键，回到她自己的局（捕获阶段拦下，不当成游戏输入）
  document.addEventListener('pointerdown', (e) => {
    if (!demo) return;
    e.stopPropagation(); e.preventDefault(); stopDemo();
  }, true);
  addEventListener('keydown', (e) => {
    if (!demo) return;
    e.stopImmediatePropagation(); e.preventDefault(); stopDemo();
  }, true);
  const downNow = new Set();
  const flashAt = {};   // 键盘或鼠标按下某个键的时刻，键上亮一小会儿，让她看到「我按的这个键是干什么的」
  function intentDown(i) { unlock(); flashAt[i] = performance.now(); if (!downNow.has(i)) { downNow.add(i); M.input(g, i, true); } }
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
      if (i === 'attack' || i === 'dodge' || i === 'ult') { intentDown(i); setTimeout(() => intentUp(i), 90); } else intentDown(i);
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      b.addEventListener(ev, () => { b.setAttribute('aria-pressed', 'false'); if (i !== 'attack' && i !== 'dodge' && i !== 'ult') intentUp(i); });
    }
  });
  // 点画面：「再来」和结尾后重来
  canvas.addEventListener('pointerdown', () => {
    unlock();
    if (g.phase === 'retry' || g.phase === 'end') { M.input(g, 'attack', true); M.input(g, 'attack', false); }
  });

  // ---------- 小按钮：跳过 / 教学 / 看示范 ----------
  const toolsEl = document.getElementById('tools');
  const btn = { skip: document.getElementById('skip'), replay: document.getElementById('replay'), demo: document.getElementById('demoBtn'), tag: document.getElementById('demoTag') };
  btn.skip.addEventListener('click', () => { M.skipTutorial(main); store.set(); });
  btn.replay.addEventListener('click', () => { forceTut = true; forceStory = false; newGame(g.seed, 1); forceTut = null; forceStory = null; });
  btn.demo.addEventListener('click', () => startDemo());
  const movesEl = document.getElementById('moves');
  let pausedBeforeMoves = false;
  function openMoves(open) {
    movesEl.hidden = !open;
    if (open) { pausedBeforeMoves = paused; paused = true; releaseAll(); } else paused = pausedBeforeMoves;
  }
  btn.story = document.getElementById('storyBtn');
  btn.story.addEventListener('click', () => { M.showIntro(main); releaseAll(); });
  btn.moves = document.getElementById('movesBtn');
  btn.moves.addEventListener('click', () => openMoves(true));
  document.getElementById('movesClose').addEventListener('click', () => openMoves(false));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !movesEl.hidden) openMoves(false); });
  function syncTools() {
    const inTut = !demo && !!g.tut, idle = !demo && !g.tut && g.stage === 1 && g.phase === 'play';
    btn.skip.hidden = !inTut;
    btn.replay.hidden = !idle || g.intro;
    btn.moves.hidden = !idle || g.intro;
    btn.story.hidden = !idle || g.intro;
    btn.demo.hidden = !idle || g.intro;
    btn.tag.hidden = !demo;
    if (main && main.tutDone && !store.get() && !demo) store.set();
  }

  // 示范：独立的一局 + 精准档自动驾驶，画面下方的键随它的操作亮起，关键动作出一个短词
  let demoAcc = 0, demoWin = 0, demoPrev = null;
  const DEMO_WORD = { guard: '架', attack: '刺', dodge: '闪' };
  let demoUlt = false;
  function startDemo() {
    if (demo) return;
    const d = M.createDemo(CLIPS, 11);
    main = g;
    demo = { g: d.g, driver: d.driver };
    demoPrev = { attack: d.g.pressT.attack, guard: d.g.pressT.guard, dodge: d.g.pressT.dodge };
    demoAcc = 0; demoWin = 0; demoUlt = false;
    ui.savedEvent = ui.lastEvent; ui.savedMeter = ui.meterShown;
    g = d.g; ui.lastEvent = g.eventId; ui.meterShown = 0;
    releaseAll();
  }
  function stopDemo() {
    if (!demo) return;
    demo = null; g = main;
    ui.lastEvent = main.eventId;          // 示范里的事件不要在她的局里再响一遍
    ui.meterShown = main.meter;
  }
  function demoAdvance(ms) {
    demoAcc += ms;
    while (demoAcc >= M.STEP && demo) {
      demoAcc -= M.STEP;
      demo.driver.think(g);
      M.advance(g, M.STEP);
      for (const k of ['guard', 'attack', 'dodge']) {
        if (g.pressT[k] !== demoPrev[k]) {
          demoPrev[k] = g.pressT[k];
          g.sub = { text: DEMO_WORD[k], t0: g.t, until: g.t + 800 };
        }
      }
      if (g.ult && !demoUlt) { demoUlt = true; g.sub = { text: '绝', t0: g.t, until: g.t + 1200 }; }
      if (g.phase === 'win1' && !demoWin) demoWin = g.t;
      if (g.t >= 24000 || (demoWin && g.t - demoWin > 1500)) { stopDemo(); return; }
    }
  }

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
  // 残影有没有画出来：带残影与不带残影各渲一次，在主角周围一圈数变化的像素
  function ghostPixels() {
    render({});
    const a = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const r0 = rects.p;
    render({ noGhost: true });
    const b = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const s = canvas.width / VW;
    const x0 = Math.max(0, Math.floor(camX(r0.x - 80) * s)), x1 = Math.min(canvas.width, Math.floor(camX(r0.x + r0.w + 80) * s));
    const y0 = Math.max(0, Math.floor(r0.y * s)), y1 = Math.min(canvas.height, Math.floor((r0.y + r0.h) * s));
    let n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * canvas.width + x) * 4;
      if (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]) > 18) n++;
    }
    render({});
    return { pixels: n, ult: !!g.ult };
  }
  // 蓄力条的亮段有没有画出来：亮段的平均亮度要明显高于还没走到的身子
  function chargePixels() {
    render({});
    const r = ui.chargeRect;
    if (!r) return null;
    const s = canvas.width / VW;
    const meanLum = (x0, x1) => {
      const xa = Math.floor(x0 * s), xb = Math.max(xa + 1, Math.floor(x1 * s)), ya = Math.floor((r.y + 1) * s), yb = Math.max(ya + 1, Math.floor((r.y + r.h - 1) * s));
      const d = ctx.getImageData(xa, ya, xb - xa, yb - ya).data;
      let sum = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++; }
      return sum / n / 255;
    };
    const fillEnd = r.x + r.frac * r.w;
    const win = meanLum(r.x + r.ws + 1, r.x + r.w - 1);
    const body = fillEnd + 2 < r.x + r.ws - 2 ? meanLum(fillEnd + 2, r.x + r.ws - 2) : meanLum(r.x + 1, r.x + r.ws - 1);
    return { win, body, ratio: win / Math.max(0.01, body), frac: r.frac };
  }
  // 受击闪光是不是只沿一侧一道窄亮边：与关掉闪光的渲染对比，主角格子里变亮的像素占比
  function flashPixels() {
    render({});
    const a = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const rs = { p: rects.p, e: rects.e };
    render({ noFlash: true });
    const b = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const s = canvas.width / VW, out = {};
    for (const id of ['p', 'e']) {
      const r = rs[id];
      const x0 = Math.max(0, Math.floor(camX(r.x) * s)), x1 = Math.min(canvas.width, Math.floor(camX(r.x + r.w) * s));
      const y0 = Math.max(0, Math.floor(r.y * s)), y1 = Math.min(canvas.height, Math.floor((r.y + r.h) * s));
      let n = 0, changed = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * canvas.width + x) * 4;
        n++;
        if (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]) > 30) changed++;
      }
      out[id] = { ratio: n ? changed / n : 0, flash: id === 'p' ? g.p.flash : g.e.flash };
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
    snapshot: () => Object.assign(M.snapshot(g), { view: VIEW, paused, seed: g.seed, touch: touchUI, demo: !!demo, lit: litKeys(), glowKeys: glowKeys(), tutDone: main.tutDone }),
    mainSnapshot: () => M.snapshot(main),
    startDemo, stopDemo, skipTutorial: () => { M.skipTutorial(main); store.set(); },
    reset: () => { seedOverride = true; newGame(main.seed, STAGE); seedOverride = false; },
    setSeed: (n) => { seedOverride = true; newGame(n, STAGE); seedOverride = false; },
    step: (ms) => { paused = true; if (demo) demoAdvance(ms); else M.advance(g, ms); syncUi(0); render(); },
    play: () => { paused = false; },
    press: (name, ms) => {
      const i = KEYS[String(name).toLowerCase()];
      if (i) M.tap(g, i, ms == null ? 120 : ms);
    },
    coverage, luma, ghostPixels, chargePixels, flashPixels,
    // 心动条是否在杨宗保头顶上方：回报条的中心 x 与他的屏幕 x、条底与他格子顶的距离（CSS 像素）
    heartCheck: () => {
      render({});
      const z = heartActor(), r = ui.heartRect, zr = z && rects[z.id];
      const cr = canvas.getBoundingClientRect();
      if (!z || !zr) return null;
      const off = r ? { cx: cr.left + r.cx * scale, bottom: cr.top + (r.y + r.h) * scale } : null;
      return { zx: cr.left + camX(z.x) * scale, zTop: cr.top + zr.y * scale, bar: off, edge: !r };
    },
    // 界面各元素的外框（CSS 像素，相对视口），给浏览器检查查重叠
    layout: () => {
      render({});
      const r = canvas.getBoundingClientRect(), out = ui.boxes.map((b) => ({
        name: b.name, left: r.left + b.x * scale, top: r.top + b.y * scale,
        right: r.left + (b.x + b.w) * scale, bottom: r.top + (b.y + b.h) * scale,
      }));
      const keysDom = {};
      document.querySelectorAll('#pad button').forEach((b) => { keysDom['key-' + b.dataset.k] = b; });
      const dom = { ...keysDom, mute: muteBtn, skip: btn.skip, replay: btn.replay, demo: btn.demo, moves: btn.moves, story: btn.story, demoTag: btn.tag };
      for (const k of Object.keys(dom)) {
        if (!dom[k] || dom[k].hidden) continue;
        const m = dom[k].getBoundingClientRect();
        out.push({ name: k, left: m.left, top: m.top, right: m.right, bottom: m.bottom });
      }
      return { boxes: out, portrait, canvas: { w: r.width, h: r.height }, viewport: { w: innerWidth, h: innerHeight } };
    },
  };

  // ---------- 主循环 ----------
  function syncUi(dt) {
    // 心动条平滑追上真实数值；事件里取声音和脉冲
    ui.meterShown += (g.meter - ui.meterShown) * Math.min(1, dt / 220 + 0.0001);
    if (!dt) ui.meterShown = g.meter;
    ui.meterPulse = Math.max(0, ui.meterPulse - dt / 500);
    // 慢放的冷色罩用真实时间缓入缓出
    const slowTarget = g.timeScale < 1 ? 1 : 0;
    ui.push += ((g.ult ? 1 : 0) - ui.push) * Math.min(1, dt / 160 + (dt ? 0 : 1));
    ui.slow += (slowTarget - ui.slow) * Math.min(1, dt / 200 + (dt ? 0 : 1));
    for (const ev of g.events) {
      if (ev.id <= ui.lastEvent) continue;
      ui.lastEvent = ev.id;
      if (g.t - ev.t < 400) play(ev);
      if (ev.type === 'meter') ui.meterPulse = ev.meter >= 100 ? 1 : 0.35;
      if (ev.type === 'guard' && ev.win) ui.confirmT = ev.t;
      if (ev.type === 'loose' || (ev.type === 'hit' && g.stage === 1)) ui.looseT = ev.t;
    }
    // 键的亮边：教学是呼吸的暖色亮边（CSS 动画走真实时间），示范是按下即亮
    const gl = glowKeys().concat(ultGlow()), lit = litKeys();
    const nowMs = performance.now();
    document.querySelectorAll('#pad button').forEach((b) => {
      const k = b.dataset.k;
      b.classList.toggle('glow', gl.includes(k));
      const mine = !demo && (downNow.has(k) || nowMs - (flashAt[k] || -1e9) < 200);
      b.classList.toggle('lit', lit.includes(k) || mine);
    });
    padEl.classList.toggle('full', g.shi >= 100 && !g.tut);
    const ub = padEl.querySelector('[data-k="ult"]');
    if (ub) ub.classList.toggle('ready', g.shi >= 100 && !g.tut);
    syncTools();
  }
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(50, now - last); last = now;
    if (!paused) { if (demo) demoAdvance(dt); else M.advance(g, dt); syncUi(dt); }
    render();
    requestAnimationFrame(frame);
  }
  Promise.all(loads).then(() => {
    newGame(SEED, STAGE);
    if (VIEW === 'demo') {
      // 机位：示范进行中，停在她（自动驾驶）按下「架」之后一小会儿
      startDemo();
      for (let i = 0; i < 6000 && !(g.pressT.guard > 0 && g.t - g.pressT.guard >= 90 && g.sub); i++) demoAdvance(M.STEP);
    }
    if (VIEW) paused = true;
    ui.meterShown = g.meter; ui.lastEvent = g.eventId; ui.slow = g.timeScale < 1 ? 1 : 0;
    syncUi(0);
    render();
    ready = true;
    requestAnimationFrame((t) => { last = t; frame(t); });
  });
})();
