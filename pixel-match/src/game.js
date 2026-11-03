/* 像素连连看：画面、点选、关卡流程、合影、试玩钩子。规则全在 core.js，小人全在 figures.js（从像素办公室原样抽的）。 */
(() => {
  'use strict';
  const C = window.PixelMatchCore, F = window.PixelFigures, K = window.PixelCard;
  const $ = (s) => document.querySelector(s);
  const params = new URLSearchParams(location.search);
  const VIEWS = { hero: 1, wide: 1, match: 1, photo: 1, final: 1, lost: 1 };
  const view = VIEWS[params.get('view')] ? params.get('view') : null;
  const canvas = $('#stage'), g = canvas.getContext('2d');
  const FIG = new Map(F.ROSTER.map((f) => [f.id, f]));
  const COL = { wall: '#f1e7ce', wallLine: '#dedbc3', trim: '#c7c7ac', trimDark: '#8c967d', plankA: '#c9a27a', plankB: '#d1ad83', plankLine: '#bd946c', ink: '#45534b', red: '#d96952', orange: '#e8963a', blue: '#5fa8d3', green: '#67b779', gold: '#efc66c', paper: '#fff6dc' };
  const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif';

  const panel = $('#panel'), bar = $('#bar');
  let dpr = 1, vw = 0, vh = 0, L = null, sprites = new Map(), likeFn = null, backdrop = null;
  let mode = 'title', level = 0, seed = Number(params.get('seed')) || (Date.now() % 100000), game = null;
  let photoAge = 0, photoWait = 0, wonAt = null, frozen = false, pilot = null, pilotStep = null, pilotWait = 0, last = 0, ready = false;
  let viewState = null, drawTimes = [], errors = [];
  const ctx2 = (c) => ({ set fillStyle(v) { c.fillStyle = v; }, get fillStyle() { return c.fillStyle; }, fillRect: (x, y, w, h) => c.fillRect(x, y, w, h), setScale(s, ox, oy) { c.setTransform(s, 0, 0, s, ox, oy); } });

  // ---------------- 版面与缓存 ----------------
  function resize() {
    dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    vw = window.innerWidth; vh = window.innerHeight;
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
    relayout(); paintBackdrop();
    bar.style.height = `calc(${L.bar}px + env(safe-area-inset-bottom))`;
    for (const b of bar.querySelectorAll('button')) b.style.height = `${L.bar - 20}px`;
  }
  function relayout() {
    const lv = C.LEVELS[level];
    L = C.layout(vw, vh, lv.cols, lv.rows, dpr);
    sprites = new Map();
    for (const id of lv.types) {
      const c = document.createElement('canvas'); c.width = L.dev.w; c.height = L.dev.h;
      const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
      K.paintCard(ctx2(x), FIG.get(id), L.dev.w, L.dev.h, L.scale.adult, L.scale.kid);
      sprites.set(id, c);
    }
    likeFn = null;
  }
  // 背景：办公室的墙、护墙板和木地板（颜色与砌法同 ai-office 的 room()）。
  function paintBackdrop() {
    backdrop = document.createElement('canvas'); backdrop.width = canvas.width; backdrop.height = canvas.height;
    const b = backdrop.getContext('2d'), s = Math.max(2, Math.round(2 * dpr)), W = Math.ceil(canvas.width / s), H = Math.ceil(canvas.height / s);
    b.setTransform(s, 0, 0, s, 0, 0);
    const r = (c, x, y, w, h) => { b.fillStyle = c; b.fillRect(x, y, w, h); };
    const hud = Math.ceil(L.hud * dpr / s);
    r(COL.wall, 0, 0, W, H); r(COL.wallLine, 0, 0, W, hud); r(COL.trim, 0, hud - 4, W, 3); r(COL.trimDark, 0, hud - 1, W, 2);
    r('#b58c63', 0, hud + 1, W, H);
    for (let y = hud + 1; y < H; y += 18) for (let x = -((((y - hud) / 18) | 0) % 2) * 24; x < W; x += 48) {
      const left = Math.max(0, x), width = Math.min(W, x + 47) - left;
      r(((x + y) / 6 | 0) % 3 ? COL.plankA : COL.plankB, left, y, width, 17);
      r(COL.plankLine, left + 3, y + 12, Math.max(0, width - 9), 1);
    }
  }
  const D = (v) => Math.round(v * dpr);
  // 连线拐点（格子坐标，含外圈 -1 / rows / cols）→ CSS 坐标；外圈画在棋盘边外 0.3 格。
  function pointOf(r, c) {
    const x = c < 0 ? L.board.x - 0.3 * L.cell.w : c >= L.cols ? L.board.x + L.board.w + 0.3 * L.cell.w : L.board.x + (c + 0.5) * L.cell.w;
    const y = r < 0 ? L.board.y - 0.3 * L.cell.h : r >= L.rows ? L.board.y + L.board.h + 0.3 * L.cell.h : L.board.y + (r + 0.5) * L.cell.h;
    return { x, y };
  }
  const cardOrigin = (r, c) => ({ x: D(L.board.x + c * L.cell.w + 2), y: D(L.board.y + r * L.cell.h + 2) });
  function likeness() {
    if (!likeFn) likeFn = K.likenessTable(L, C.LEVELS[level].types);
    return likeFn;
  }

  // ---------------- 画 ----------------
  function text(str, x, y, size, color = COL.ink, align = 'center', weight = 700) {
    g.font = `${weight} ${D(size)}px ${FONT}`; g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(str, D(x), D(y));
  }
  function frameRect(x, y, w, h, color, t) { g.fillStyle = color; g.fillRect(x - t, y - t, w + 2 * t, t); g.fillRect(x - t, y + h, w + 2 * t, t); g.fillRect(x - t, y, t, h); g.fillRect(x + w, y, t, h); }
  function drawHud() {
    const lv = C.LEVELS[level], s = game;
    text(`第 ${level + 1} 关`, 14, L.hud / 2 - 1, 17, COL.ink, 'left');
    if (vw > vh && vh < 500) text('竖过来玩，牌更大', 14, L.hud + 14, 12, '#8a4a3e', 'left');
    const left = s ? Math.max(0, s.limit - s.time) : lv.time, frac = left / lv.time;
    const bw = Math.min(170, vw * 0.38), bx = vw / 2 - bw / 2, by = L.hud / 2 - 13;
    g.fillStyle = '#c7c7ac'; g.fillRect(D(bx), D(by), D(bw), D(14));
    g.fillStyle = frac > 0.3 ? COL.green : frac > 0.15 ? COL.gold : COL.red; g.fillRect(D(bx), D(by), D(bw * frac), D(14));
    const m = Math.floor(Math.ceil(left) / 60), sec = Math.ceil(left) % 60;
    text(`${m}:${String(sec).padStart(2, '0')}`, vw / 2, L.hud / 2 + 11, 13, frac > 0.15 ? COL.ink : COL.red);
    const pairs = s ? C.remaining(s) / 2 : lv.cols * lv.rows / 2;
    text(`剩 ${pairs} 对`, vw - 14, L.hud / 2 - 1, 15, COL.ink, 'right');
  }
  function drawBoard(now) {
    const s = game, fxMatch = s.fx.filter((e) => e.kind === 'match'), shaking = s.fx.filter((e) => (e.kind === 'wrong' || e.kind === 'switch') && now - e.at < C.FX.wrong);
    for (let r = 0; r < s.rows; r++) for (let c = 0; c < s.cols; c++) {
      const t = s.grid[r][c]; if (t < 0) continue;
      let { x, y } = cardOrigin(r, c);
      const sel = s.selected && s.selected.r === r && s.selected.c === c;
      const shake = shaking.find((e) => e.b.r === r && e.b.c === c);
      if (sel) y -= D(3);
      if (shake) x += Math.round(Math.sin((now - shake.at) * 70) * D(2));
      g.drawImage(sprites.get(s.types[t]), x, y);
      if (sel) frameRect(x, y, L.dev.w - D(1), L.dev.h - D(2), COL.orange, D(3));
      if (shake && shake.kind === 'wrong') frameRect(x, y, L.dev.w - D(1), L.dev.h - D(2), COL.red, D(2));
      const hinted = s.hint && s.hint.some((h) => h.r === r && h.c === c);
      if (hinted && Math.floor((now - s.hintAt) * 3) % 2 === 0) frameRect(x, y, L.dev.w - D(1), L.dev.h - D(2), COL.blue, D(3));
    }
    // 刚配上的一对：线留一下，两个小人挥手或跳一下，然后淡出。
    for (const e of fxMatch) {
      const age = now - e.at;
      if (age < C.FX.line) {
        const pts = e.path.map((p) => pointOf(p.r, p.c));
        g.lineJoin = 'round'; g.lineCap = 'round';
        for (const [w, col] of [[7, '#fff6dcd0'], [3.5, COL.red]]) {
          g.lineWidth = D(w); g.strokeStyle = col; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(D(p.x), D(p.y)) : g.moveTo(D(p.x), D(p.y)))); g.stroke();
        }
      }
      if (age < C.FX.act + C.FX.fade) {
        for (const cell of [e.a, e.b]) {
          const o = cardOrigin(cell.r, cell.c), fig = FIG.get(s.types[e.type]);
          g.save();
          if (age > C.FX.act) g.globalAlpha = Math.max(0, 1 - (age - C.FX.act) / C.FX.fade);
          const opts = fig.kind === 'kid' || e.act === 'hop' ? { hop: age * 1.2, t: now } : { wave: age, t: now };
          K.paintCard(ctx2(g), fig, L.dev.w, L.dev.h, L.scale.adult, L.scale.kid, { ...opts, ox: o.x, oy: o.y });
          g.setTransform(1, 0, 0, 1, 0, 0);
          frameRect(o.x, o.y, L.dev.w - D(1), L.dev.h - D(2), COL.gold, D(3)); // 金边：这一对已经消了，正在做动作
          g.restore();
        }
      }
    }
    const dl = s.fx.find((e) => e.kind === 'deadlock' && now - e.at < C.FX.deadlock);
    if (dl) banner('没路了，帮你洗一下牌');
  }
  function banner(msg) {
    const w = Math.min(vw - 40, 300), h = 46, x = (vw - w) / 2, y = L.board.y + L.board.h / 2 - h / 2;
    g.fillStyle = '#45534be8'; g.fillRect(D(x), D(y), D(w), D(h));
    text(msg, vw / 2, y + h / 2, 17, '#fff6dc');
  }

  // 合影：办公室一角，这一关的人排成一两排一起挥手喊「茄子」。
  function drawPhoto(age, ids, caption) {
    const W = 200, H = 150, s = Math.max(1, Math.floor(Math.min((vw * dpr - D(24)) / W, (vh * dpr - D(L.hud + 190)) / H)));
    const ox = Math.round((canvas.width - W * s) / 2), oy = Math.max(D(L.hud + 10), Math.round((canvas.height - D(170) - H * s) / 2));
    const p = ctx2(g); p.setScale(s, ox, oy);
    const r = (c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    r('#6d725e', -3, -3, W + 6, H + 6); r('#f1e7ce', 0, 0, W, 64); r('#c7c7ac', 0, 58, W, 7); r('#8c967d', 0, 63, W, 3);
    for (const x of [22, 122]) { r('#aaa98e', x, 10, 56, 38); r('#4e756e', x + 2, 10, 52, 35); r('#a5c6bf', x + 5, 13, 46, 28); r('#83a69c', x + 8, 30, 10, 11); r('#91b3a6', x + 22, 25, 12, 16); r('#74988c', x + 37, 32, 11, 9); r('#e8e3c9', x + 27, 12, 3, 31); r('#8d9d7c', x - 2, 45, 60, 4); }
    r('#b58c63', 0, 66, W, H - 66);
    for (let y = 66; y < H; y += 18) for (let x = -(((y - 66) / 18 | 0) % 2) * 24; x < W; x += 48) { const lft = Math.max(0, x), wd = Math.min(W, x + 47) - lft; r(((x + y) / 6 | 0) % 3 ? '#c9a27a' : '#d1ad83', lft, y, wd, Math.min(17, H - y)); }
    F.plant(p, 10, 70, true); F.plant(p, W - 11, 70, true);
    const kids = ids.filter((id) => FIG.get(id).kind === 'kid'), adults = ids.filter((id) => FIG.get(id).kind !== 'kid');
    const rows = adults.length > 7 ? [adults.slice(0, Math.ceil(adults.length / 2)), [...adults.slice(Math.ceil(adults.length / 2)), ...kids]] : [[...adults, ...kids]];
    const bubbles = [];
    rows.forEach((row, ri) => {
      const y = rows.length > 1 ? (ri ? 136 : 106) : 126, gap = Math.min(24, (W - 30) / Math.max(1, row.length - 1));
      row.forEach((id, k) => {
        const x = Math.round(W / 2 + (k - (row.length - 1) / 2) * gap), fig = FIG.get(id), a = age - 0.25 - (k + ri * 3) * 0.07;
        const opts = fig.kind === 'kid' ? { hop: a > 0 ? a % 2.4 : -1, t: age } : { wave: a > 0 ? a : -1, t: age };
        F.drawFigure(p, fig, x, y, opts);
        if (a > 0.5 && fig.kind !== 'kid' && ri === 0 && k % 2 === 0) bubbles.push({ x, y: y - 40, word: F.POSE_WORDS[(k + ri * 5) % F.POSE_WORDS.length] });
      });
    });
    g.setTransform(1, 0, 0, 1, 0, 0);
    for (const b of bubbles) {
      const bx = ox + b.x * s, by = oy + b.y * s; g.font = `700 ${Math.round(5.5 * s)}px ${FONT}`;
      const w = g.measureText(b.word).width + 4 * s;
      g.fillStyle = '#fff6dc'; g.fillRect(Math.round(bx - w / 2), by, Math.round(w), 9 * s); g.fillStyle = '#d9a56d'; g.fillRect(Math.round(bx - w / 2), by, Math.round(w), s);
      g.fillStyle = '#6a4b30'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(b.word, bx, by + 5 * s);
    }
    if (caption) { g.fillStyle = '#fff6dc'; g.fillRect(ox, oy + H * s + D(6), W * s, D(32)); text(caption, vw / 2, (oy + H * s) / dpr + 22, 15, '#6a4b30'); }
    return { ox, oy, s, W, H };
  }
  // 关卡开头：把这一关的人摆一排给你认一认。
  function drawCast(ids, y) {
    const n = ids.length, per = Math.min(n, 7), rowsN = Math.ceil(n / per), w = Math.min(54, (vw - 32) / per), h = w / 0.86;
    const devW = D(w - 4), devH = D(h - 4), sa = Math.max(1, Math.floor(devH * 0.84 / 31)), sk = Math.round(sa * 4 / 3);
    ids.forEach((id, i) => {
      const row = Math.floor(i / per), inRow = Math.min(per, n - row * per), k = i - row * per;
      const x = D(vw / 2 + (k - inRow / 2) * w + 2), yy = D(y + row * h);
      K.paintCard(ctx2(g), FIG.get(id), devW, devH, sa, sk, { ox: x, oy: yy, wave: mode === 'intro' ? (performance.now() / 1000 + i * 0.4) % 3 : -1 });
      g.setTransform(1, 0, 0, 1, 0, 0);
    });
    return y + rowsN * h;
  }

  function draw(now) {
    const t0 = performance.now();
    g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false;
    g.drawImage(backdrop, 0, 0);
    if (mode === 'title') {
      text('像素连连看', vw / 2, L.hud / 2, 19, '#8a4a3e');
      drawPhoto(now, F.ROSTER.map((f) => f.id), '');
    } else if (mode === 'photo' || mode === 'done') {
      drawHud();
      const ids = C.LEVELS[level].types, used = Math.round(game.finishedAt);
      drawPhoto(photoAge, ids, mode === 'done' ? `全员到齐 · 第 5 关用时 ${Math.floor(used / 60)}:${String(used % 60).padStart(2, '0')}` : `第 ${level + 1} 关合影 · 用时 ${Math.floor(used / 60)}:${String(used % 60).padStart(2, '0')}`);
    } else if (mode === 'intro') {
      drawHud();
      drawCast(C.LEVELS[level].types, Math.max(L.hud + 160, vh * 0.42));
    } else {
      drawHud();
      if (game) drawBoard(game.time);
    }
    drawTimes.push(performance.now() - t0); if (drawTimes.length > 600) drawTimes.shift();
  }

  // ---------------- 流程与界面 ----------------
  function showPanel(title, msg, buttons, top) {
    $('#panel-title').textContent = title; $('#panel-text').innerHTML = msg;
    const box = $('#panel-buttons'); box.innerHTML = '';
    for (const [label, fn, main] of buttons) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (main) b.className = 'main'; b.addEventListener('click', fn); box.append(b); }
    panel.style.top = top; panel.style.bottom = ''; panel.hidden = false;
  }
  function showBottomPanel(title, msg, buttons) { showPanel(title, msg, buttons, ''); panel.style.top = 'auto'; panel.style.bottom = 'max(14px, env(safe-area-inset-bottom))'; }
  function hidePanel() { panel.hidden = true; }
  function updateBar() {
    bar.hidden = mode !== 'play';
    if (!game) return;
    $('#hint-n').textContent = `×${game.hints}`; $('#shuffle-n').textContent = `×${game.shuffles}`;
    $('#hint-btn').disabled = game.hints <= 0 || game.status !== 'playing'; $('#shuffle-btn').disabled = game.shuffles <= 0 || game.status !== 'playing';
  }
  function toTitle() {
    mode = 'title'; game = null; level = 0; relayout(); paintBackdrop(); updateBar();
    showBottomPanel('像素连连看', '点两张一样的小人，<br>中间能用拐弯不超过两次的线连上，就消掉。<br>越往后，长得越像。', [['开始玩', () => toIntro(0), true]]);
  }
  function toIntro(lv) {
    level = lv; mode = 'intro'; game = null; relayout(); paintBackdrop(); updateBar();
    const n = C.LEVELS[lv].types.length, lead = lv === 0 ? '先认识四位同事。' : lv === C.LEVELS.length - 1 ? '全员上场，包括长得最像的那几对。' : '又来了几位，有的长得挺像。';
    showPanel(`第 ${lv + 1} 关`, `${lead}<br>这关 ${n} 位，${C.LEVELS[lv].time} 秒内消完。`, [['开始', () => startLevel(lv), true]], `${L.hud + 14}px`);
  }
  function startLevel(lv, sd) {
    level = lv; if (sd != null) seed = sd; else seed = (seed * 1103515245 + 12345) % 2147483647;
    if (!L || L.cols !== C.LEVELS[lv].cols || L.rows !== C.LEVELS[lv].rows) relayout();
    game = C.createGame(lv, seed); mode = 'play'; wonAt = null; hidePanel(); updateBar();
  }
  function onWon() {
    mode = level === C.LEVELS.length - 1 ? 'done' : 'photo'; photoAge = 0; updateBar();
    const used = Math.round(game.finishedAt);
    if (mode === 'done') showBottomPanel('全员到齐！', `五关全过，最后一关用了 ${used} 秒。`, [['再玩一遍', () => toIntro(0), true]]);
    else showBottomPanel(`第 ${level + 1} 关过了`, `用了 ${used} 秒，大家出来合个影。`, [['下一关', () => toIntro(level + 1), true]]);
  }
  function onLost() {
    mode = 'lost'; updateBar();
    showPanel('时间到', `这关还剩 ${C.remaining(game) / 2} 对。<br>再来一盘，提示和洗牌都补满。`, [['再来一次', () => startLevel(level), true], ['回到开头', toTitle]], `${L.hud + 40}px`);
  }
  function pause() {
    if (mode !== 'play') return;
    mode = 'paused'; updateBar();
    showPanel('歇一会儿', '计时停了。', [['继续', resume, true], ['重开本关', () => startLevel(level)]], `${L.hud + 40}px`);
  }
  function resume() { if (mode !== 'paused') return; mode = 'play'; hidePanel(); updateBar(); }

  // 每帧推进：只有在玩的时候计时。
  function tick(dt) {
    if (mode === 'photo' || mode === 'done') { photoAge += dt; return; }
    if (mode !== 'play' || !game) return;
    let left = dt;
    while (left > 1e-9) {
      const h = Math.min(left, 1 / 60); left -= h;
      if (pilot && game.status === 'playing') {
        if (!pilotStep) { pilotStep = pilot.next(game); pilotWait = pilotStep ? pilotStep.wait : 0.3; }
        pilotWait -= h;
        if (pilotWait <= 0 && pilotStep) {
          C.advance(game, h + pilotWait); const act = pilotStep.action; pilotStep = null;
          if (act && game.status === 'playing') { if (act.tap) C.tap(game, act.tap.r, act.tap.c); else if (act.hint) C.useHint(game); else if (act.shuffle) C.useShuffle(game); }
          C.advance(game, -pilotWait > 0 ? -pilotWait : 0); continue;
        }
      }
      C.advance(game, h);
      if (game.status === 'won') { if (wonAt == null) wonAt = game.time; }
      if (game.status !== 'playing') break;
    }
    if (game.status === 'won') { photoWait += dt; if (photoWait >= 0.9) { photoWait = 0; onWon(); } }
    else if (game.status === 'lost') onLost();
    updateBar();
  }

  function frame(ts) {
    const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0; last = ts;
    if (!frozen) tick(dt);
    draw(mode === 'title' ? ts / 1000 : 0);
    requestAnimationFrame(frame);
  }

  // ---------------- 输入 ----------------
  canvas.addEventListener('pointerdown', (ev) => {
    if (mode !== 'play' || !game || frozen) return;
    ev.preventDefault();
    const hit = C.cellAt(L, ev.clientX, ev.clientY);
    if (hit) { C.tap(game, hit.r, hit.c); updateBar(); }
  });
  $('#hint-btn').addEventListener('click', () => { if (game && mode === 'play') { C.useHint(game); updateBar(); } });
  $('#shuffle-btn').addEventListener('click', () => { if (game && mode === 'play') { C.useShuffle(game); updateBar(); } });
  $('#pause-btn').addEventListener('click', pause);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyH') $('#hint-btn').click(); else if (e.code === 'KeyS') $('#shuffle-btn').click(); else if (e.code === 'Escape' || e.code === 'KeyP') { if (mode === 'play') pause(); else resume(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('resize', () => { resize(); });
  window.addEventListener('error', (e) => errors.push(String(e.message)));

  // ---------------- 试玩钩子与固定机位 ----------------
  function runTo(predicate, maxSec = 600) {
    const h = 1 / 60; let n = 0;
    while (!predicate() && n++ < maxSec * 60) tick(h);
  }
  function startWith(lv, sd, kind) { toIntro(lv); startLevel(lv, sd); pilot = kind ? C.Autopilot(kind, sd, kind === 'human' ? likeness() : null) : null; pilotStep = null; }
  function setupView() {
    const sd = Number(params.get('seed')), t = Number(params.get('t'));
    const want = { hero: [2, 4, 'human', 40], wide: [4, 2, null, 0.5], match: [1, 3, 'human', null], photo: [0, 1, 'precise', null], final: [4, 1, 'precise', null], lost: [4, 5, 'reckless', null] }[view];
    const [lv, s0, kind, t0] = want, s = Number.isFinite(sd) && sd > 0 ? sd : s0, tt = Number.isFinite(t) && t > 0 ? t : t0;
    startWith(lv, s, kind);
    if (view === 'hero' || view === 'wide') runTo(() => game.time >= tt || game.status !== 'playing');
    if (view === 'match') { runTo(() => game.log.some((e) => e.kind === 'match')); const m = game.log.find((e) => e.kind === 'match'); runTo(() => game.time >= m.at + 0.3); }
    if (view === 'photo' || view === 'final') { runTo(() => mode === 'photo' || mode === 'done'); runTo(() => photoAge >= 1.4); }
    if (view === 'lost') runTo(() => mode === 'lost');
    pilot = null; frozen = true;
    viewState = { view, level: game.level, seed: game.seed, mode, time: +game.time.toFixed(2), status: game.status, remaining: C.remaining(game), photoAge: +photoAge.toFixed(2) };
  }
  function probe() {
    const s = game, sorted = [...drawTimes].sort((a, b) => a - b);
    return {
      mode, level, seed, frozen, view, viewState,
      status: s?.status, time: s ? +s.time.toFixed(3) : 0, limit: s?.limit, remaining: s ? C.remaining(s) : null, selected: s?.selected || null,
      hints: s?.hints, shuffles: s?.shuffles, matches: s?.matches, mistakes: s?.mistakes, autoShuffles: s?.autoShuffles, hasMove: s ? !!C.firstMove(s.grid) : null,
      grid: s ? s.grid.map((r) => r.slice()) : null, types: C.LEVELS[level].types,
      layout: L && { vw, vh, dpr, card: L.card, dev: L.dev, scale: L.scale, board: L.board, cell: L.cell },
      draw: { frames: drawTimes.length, mean: drawTimes.length ? +(drawTimes.reduce((a, b) => a + b, 0) / drawTimes.length).toFixed(3) : 0, p95: sorted.length ? +sorted[Math.floor(sorted.length * 0.95)].toFixed(3) : 0, max: sorted.length ? +sorted[sorted.length - 1].toFixed(3) : 0 },
      errors: errors.slice(),
    };
  }
  window.__pixelMatch = {
    get ready() { return ready; },
    probe,
    start: (lv = 0, sd = 1) => { frozen = false; pilot = null; toIntro(lv); startLevel(lv, sd); return probe(); },
    autopilot: (kind) => { pilot = kind ? C.Autopilot(kind, game ? game.seed : 1, kind === 'human' ? likeness() : null) : null; pilotStep = null; },
    advance: (sec) => { const h = 1 / 60; for (let i = 0; i < Math.round(sec * 60); i++) tick(h); draw(0); return probe(); },
    freeze: (on = true) => { frozen = !!on; },
    // 格子中心的 CSS 坐标，给真实点击用。
    cellCenter: (r, c) => C.cellCenter(L, r, c),
    // 当前牌面尺寸下两两的像素差异读数。
    likeness: () => { const f = likeness(), out = {}; for (const [k, v] of f.table) out[k] = v; return out; },
    // 第一个格子上真画布的像素（CSS 像素平均），用来和 Node 软光栅比对。
    cardReadout: (r, c) => { draw(0); const o = cardOrigin(r, c), d = g.getImageData(o.x, o.y + (game.selected && game.selected.r === r && game.selected.c === c ? -D(3) : 0), L.dev.w, L.dev.h).data; return { w: L.dev.w, h: L.dev.h, type: game.types[game.grid[r][c]], data: Array.from(d) }; },
    toTitle, pause, resume,
  };
  window.__PLAYTEST__ = {
    get ready() { return ready; },
    snapshot: probe,
    reset: () => { frozen = false; pilot = null; startLevel(level, seed); return probe(); },
    setSeed: (n) => { seed = n; startLevel(level, n); return probe(); },
    step: (ms) => window.__pixelMatch.advance(ms / 1000),
  };

  resize();
  if (view) setupView(); else if (params.get('level')) { const lv = Math.max(1, Math.min(5, Number(params.get('level')) || 1)) - 1; toIntro(lv); } else toTitle();
  ready = true;
  requestAnimationFrame(frame);
})();
