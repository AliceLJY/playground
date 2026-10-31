// 候场厅 · 画面、声音、DOM 与 localStorage。规则都在 core.js（window.FOYER）。
(function () {
  'use strict';
  const D = window.FOYER;
  const Q = new URLSearchParams(location.search);
  const VIEW = Q.get('view');                 // first | busy | full：固定机位，不读不写 localStorage
  const FIXED = !!VIEW;
  const T0 = Q.has('t') ? Number(Q.get('t')) : null;   // 把时间线推到 t 秒定格
  const seed = Q.has('seed') ? Number(Q.get('seed')) : 11;
  const STORE_KEY = 'show-foyer-visits';
  const SHOW = { name: '英歌', troupe: '广州歌舞剧院' };   // 换戏只改这里（真实公开信息，见 README「关于这出戏」）
  const C = {
    me: '#e0b25a', ghost: ['#d9534f', '#5b9bd5', '#7cb342', '#f0a830', '#9b6bd1', '#e37fb0', '#4db6ac', '#c98a3a', '#8aa4d1', '#c9c35a', '#d17a8a', '#6fb0a0'],
    resident: '#8a8a8a', skin: '#f5d9b8', seat: 'rgba(155,45,32,.55)', seatTaken: 'rgba(155,45,32,.32)', seatLine: 'rgba(224,178,90,.35)',
  };

  const cv = document.getElementById('scene'), ctx = cv.getContext('2d');
  const el = (id) => document.getElementById(id);
  const whereEl = el('where'), hallTag = el('hallTag'), countEl = el('count'), cdEl = el('countdown'), gongEl = el('nextGong'), hintEl = el('hint'), bar = el('bar');
  let W = 390, H = 500, DPR = 1;
  let paused = false, lastFrame = 0, frameStamp = 0;
  let muted = Q.get('mute') === '1';
  try { muted = muted || (!FIXED && localStorage.getItem('show-foyer-muted') === '1'); } catch (e) {}
  let visits = [];
  let S = null;                 // 当前场面
  let audio = null;
  const TZ = new Date().getTimezoneOffset() * 60000;

  // ---------- 来访记录 ----------
  function loadVisits() {
    if (FIXED) {
      if (VIEW === 'busy') return D.syntheticVisits(12, 7);     // 第 1 厅坐满，你进第 2 厅
      if (VIEW === 'full') return D.syntheticVisits(9, 5);      // 第 1 厅 9 个回放 + 你 = 10/12，没有灰影
      return [];
    }
    try { return D.decodeVisits(localStorage.getItem(STORE_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveVisits() { if (FIXED) return; try { localStorage.setItem(STORE_KEY, D.encodeVisits(visits)); } catch (e) {} }
  function ago(ms) {
    const d = Math.round(ms / 86400000), h = Math.round(ms / 3600000), m = Math.round(ms / 60000);
    if (ms < 90000) return '刚才'; if (h < 1) return m + ' 分钟前'; if (h < 36) return h < 24 ? h + ' 小时前' : '昨天'; return d + ' 天前';
  }

  // ---------- 进厅：排幽灵、补灰影 ----------
  function enterHall() {
    const now = FIXED ? 1700000000000 + 13 * 3600000 : Date.now();
    const plan = D.planGhosts(visits);
    const ghosts = plan.ghosts.map((g, i) => ({
      ...g, kind: 'ghost', color: C.ghost[i % C.ghost.length], label: '你 · ' + ago(now - g.at),
      here: true, gone: false, pose: 'idle', poseUntil: 0, bubble: null, glow: 0, prev: -1, lamp: false,
    }));
    const othersHere = ghosts.filter((g) => g.hall === plan.me.hall).length;
    const residents = [];
    const taken = new Set(ghosts.filter((g) => g.hall === plan.me.hall).map((g) => g.seat));
    // 灰影坐后排两角与中间，位置不和回放冲突
    const prefer = [D.COLS * (D.ROWS - 1), D.COLS * D.ROWS - 1, D.COLS * (D.ROWS - 1) + 1, D.COLS * (D.ROWS - 1) + 2, D.COLS * (D.ROWS - 2), D.COLS * (D.ROWS - 1) - 1];
    for (let i = 0; i < D.residentsFor(othersHere); i++) {
      let s = prefer.find((p) => !taken.has(p) && p !== plan.me.seat);
      if (s === undefined) { for (let k = D.CAP - 1; k >= 0; k--) if (!taken.has(k) && k !== plan.me.seat) { s = k; break; } }
      if (s === undefined) break;
      taken.add(s);
      residents.push({ id: 'r' + i, kind: 'resident', seat: s, hall: plan.me.hall, color: C.resident, label: '身影 · 非真人', pose: 'idle', poseUntil: 0, bubble: null, glow: 0, sched: D.residentSchedule(seed, i), prev: -1, here: true, gone: false });
    }
    S = {
      t: 0, tau: 0, phase: 'door', seatT: 0, enterMs: now, curtain: D.curtainAt(now), house: plan.house, me: plan.me, ghosts, residents,
      mePose: 'idle', mePoseUntil: 0, meBubble: null, meGlow: 0, lamps: [], claps: 0, teas: 0, effects: [], lastSound: null, visit: null,
      lastClockMs: now, gongFlash: 0, gongCount: 0, hintT: 0,
    };
    // 回放里当年点过的灯，今天进门就亮着
    for (const g of ghosts) for (const a of g.acts) if (a[1] === 1 && g.hall === plan.me.hall) { S.lamps.push({ by: g.id, t: -1 }); g.lamp = true; break; }
    if (T0 !== null) { paused = true; tick(T0, true); }
    updateTop(); hint(S.phase === 'door' ? '开演前请随意落座，点一个空位也行' : '');
  }

  // ---------- 场面人物 ----------
  function hereOthers() { return [...S.ghosts.filter((g) => g.hall === S.me.hall && g.here && !g.gone), ...S.residents]; }
  function humansHere() { return 1 + S.ghosts.filter((g) => g.hall === S.me.hall && g.here && !g.gone).length; }
  function occupant(seatNo) {
    if (S.phase === 'seated' && S.me.seat === seatNo) return { kind: 'me' };
    return hereOthers().find((o) => o.seat === seatNo) || null;
  }
  function neighbors() {
    if (S.phase !== 'seated') return [];
    return S.ghosts.filter((g) => g.hall === S.me.hall && g.here && !g.gone && D.adjacent(S.me.seat, g.seat));
  }
  function pose(o, p, dur) { o.pose = p; o.poseUntil = S.t + (dur || 1.2); }
  function bubble(o, text) { o.bubble = { text, t: S.t }; }

  // ---------- 观众的五个动作 ----------
  function canAct(code) {
    if (!S) return false;
    if (code === 0) return S.phase !== 'seated';
    if (code === 4) return S.phase === 'seated';
    if (code === 3) return S.phase === 'seated' && neighbors().length > 0;
    return S.phase === 'seated';
  }
  function act(code, seatNo) {
    if (!canAct(code)) { if (code === 3 && S.phase === 'seated') hint('邻座还没来，茶先温着'); else if (code !== 0 && S.phase !== 'seated') hint('先落座'); return false; }
    unlockAudio();
    if (code === 0) {
      if (seatNo !== undefined && !occupant(seatNo)) { // 点了一个空位：换到那里
        D.leave(S.house, 'me'); const guests = S.house.halls.get(S.me.hall) || (S.house.halls.set(S.me.hall, new Map()), S.house.halls.get(S.me.hall)); guests.set('me', seatNo); S.me = { hall: S.me.hall, seat: seatNo };
      }
      S.phase = 'seated'; S.seatT = S.t; S.visit = D.newVisit(Date.now()); D.recordAct(S.visit, 0, 0);
      S.meGlow = S.t; S.lastSound = 'sit'; sfx.sit(); hint('已落座 · ' + seatName(S.me.seat)); updateTop(); frameStamp++; return true;
    }
    const tau = S.t - S.seatT;
    if (code === 1) { S.lamps.push({ by: 'me', t: S.t }); pose(me(), 'lamp', 1.4); bubble(me(), '🏮'); S.lastSound = 'lamp'; sfx.lamp(); D.recordAct(S.visit, tau, 1); hint('台前多了一盏灯'); }
    if (code === 2) { S.claps++; pose(me(), 'clap', 1.0); bubble(me(), '👏'); S.effects.push({ kind: 'ripple', seat: S.me.seat, t: S.t }); S.lastSound = 'clap'; sfx.clap(); D.recordAct(S.visit, tau, 2); }
    if (code === 3) {
      const ns = neighbors(); const to = ns[Math.floor(rand() * ns.length)];
      S.teas++; S.effects.push({ kind: 'tea', from: S.me.seat, to: to.seat, t: S.t }); setTimeout(() => { if (S) { bubble(to, '🍵'); pose(to, 'nod', 1.2); } }, 900);
      S.lastSound = 'tea'; sfx.tea(); D.recordAct(S.visit, tau, 3); hint('给 ' + to.label + ' 递了一杯茶');
    }
    if (code === 4) {
      D.recordAct(S.visit, tau, 4); D.closeVisit(S.visit, tau);
      visits = D.pushVisit(visits, S.visit); saveVisits();
      S.lastSound = 'leave'; sfx.leave(); S.phase = 'door'; S.visit = null;
      hint('这一趟记下了，下次进门你就坐在厅里');
      setTimeout(() => { if (S && S.phase === 'door') enterHall(); }, 1400);   // 按新历史重排：你会看到「你 · 刚才」
    }
    updateTop(); frameStamp++; return true;
  }
  const me = () => ({ get pose() { return S.mePose; }, set pose(v) { S.mePose = v; }, get poseUntil() { return S.mePoseUntil; }, set poseUntil(v) { S.mePoseUntil = v; }, set bubble(v) { S.meBubble = v; }, get bubble() { return S.meBubble; } });
  function seatName(i) { const N = ['一', '二', '三', '四', '五', '六']; return N[Math.floor(i / D.COLS)] + '排' + N[i % D.COLS] + '座'; }
  let rngState = D.rng(seed); const rand = () => rngState();

  // ---------- 整点锣 ----------
  function gong(auto) {
    S.gongCount++; S.gongFlash = S.t; S.lastSound = 'gong'; sfx.gong();
    el('gongTitle').textContent = auto ? '整点 · 一声锣' : '锣 · 试听';
    const cd = D.countdown(S.lastClockMs, S.curtain);
    el('gongText').textContent = (cd.left > 0 ? '离开演还有 ' + cd.text + '。' : '快开演了，请收好手机。') + ' 台前 ' + S.lamps.length + ' 盏灯，厅里 ' + humansHere() + ' 人。';
    show('gongOverlay');
    // 当年鼓过掌的回放，锣响后跟着鼓掌
    let k = 0;
    for (const g of S.ghosts) if (g.hall === S.me.hall && g.here && !g.gone && g.claps) { k++; setTimeout(() => { if (S) { pose(g, 'clap', 1.0); bubble(g, '👏'); S.effects.push({ kind: 'ripple', seat: g.seat, t: S.t }); } }, 600 + k * 180); }
    updateTop();
  }

  // ---------- 每帧 ----------
  function tick(dt, jump) {
    if (!S) return;
    const nowMs = FIXED ? S.enterMs + Math.round((S.t + dt) * 1000) : Date.now();
    if (!FIXED && D.gongCrossed(S.lastClockMs, nowMs, TZ)) { S.lastClockMs = nowMs; gong(true); }
    S.lastClockMs = nowMs;
    S.t += dt; S.tau = S.t;
    // 回放的别人
    for (const g of S.ghosts) {
      if (g.hall !== S.me.hall || g.gone) continue;
      if (S.tau >= g.end) { g.gone = true; g.here = false; D.leave(S.house, g.id); if (!jump) { S.lastSound = 'leave'; sfx.leave(0.4); } continue; }
      for (const a of D.dueActs(g.acts, g.prev, S.tau)) {
        if (a[1] === 1) { if (!g.lamp) { S.lamps.push({ by: g.id, t: S.t }); g.lamp = true; } pose(g, 'lamp', 1.4); bubble(g, '🏮'); if (!jump) sfx.lamp(0.5); }
        if (a[1] === 2) { pose(g, 'clap', 1.0); bubble(g, '👏'); S.effects.push({ kind: 'ripple', seat: g.seat, t: S.t }); if (!jump) sfx.clap(0.5); }
        if (a[1] === 3) { const ns = hereOthers().filter((o) => o !== g && D.adjacent(g.seat, o.seat)); const tgt = S.phase === 'seated' && D.adjacent(g.seat, S.me.seat) ? { seat: S.me.seat, kind: 'me' } : ns[0]; if (tgt) { S.effects.push({ kind: 'tea', from: g.seat, to: tgt.seat, t: S.t }); if (tgt.kind === 'me') hint(g.label + ' 给你递了一杯茶'); } }
      }
      g.prev = S.tau;
    }
    // 灰影照日程
    for (const r of S.residents) {
      const period = r.sched.period, cyc = Math.floor(S.tau / period), local = S.tau - cyc * period, prevLocal = r.prev < 0 ? -1 : r.prev - Math.floor(r.prev / period) * period;
      const due = prevLocal > local ? [...D.dueActs(r.sched.acts, prevLocal, period), ...D.dueActs(r.sched.acts, -1, local)] : D.dueActs(r.sched.acts, prevLocal, local);
      for (const a of due) pose(r, a[1] === 5 ? 'look' : 'shift', 1.6);
      r.prev = S.tau;
    }
    for (const o of [...S.ghosts, ...S.residents]) if (o.pose !== 'idle' && S.t > o.poseUntil) o.pose = 'idle';
    if (S.mePose !== 'idle' && S.t > S.mePoseUntil) S.mePose = 'idle';
    S.effects = S.effects.filter((e) => S.t - e.t < (e.kind === 'tea' ? 1.4 : 1.0));
    if (S.phase === 'seated' && !S.ghosts.some((g) => g.hall === S.me.hall && g.here && !g.gone) && S.residents.length < D.RESIDENTS && !jump) {
      // 回放的别人走光了，灰影补位（下一帧生效）
      const have = S.residents.length; const n = D.residentsFor(0) - have;
      for (let i = 0; i < n; i++) { let s = D.CAP - 1 - i; while (occupant(s) || s === S.me.seat) s--; if (s < 0) break; S.residents.push({ id: 'r' + (have + i), kind: 'resident', seat: s, hall: S.me.hall, color: C.resident, label: '身影 · 非真人', pose: 'idle', poseUntil: 0, bubble: null, glow: 0, sched: D.residentSchedule(seed, have + i), prev: -1, here: true, gone: false }); }
    }
    frameStamp++;
    if (!jump && Math.floor(S.t * 2) !== Math.floor((S.t - dt) * 2)) updateTop();
  }

  // ---------- 顶栏与提示 ----------
  function updateTop() {
    if (!S) return;
    hallTag.textContent = S.phase === 'seated' ? '第 ' + S.me.hall + ' 厅' : '入门 · 第 ' + S.me.hall + ' 厅有位';
    countEl.textContent = (S.phase === 'seated' ? humansHere() : humansHere() - 1) + ' / ' + D.CAP;
    cdEl.textContent = D.countdown(S.lastClockMs, S.curtain).text;
    const ng = new Date(D.nextGong(S.lastClockMs, TZ)); gongEl.textContent = String(ng.getHours()).padStart(2, '0') + ':00';
    for (const b of bar.querySelectorAll('button[data-act]')) { const c = Number(b.dataset.act); b.disabled = !canAct(c); b.classList.toggle('hot', c === 0 && S.phase !== 'seated'); }
    el('btnSit').textContent = S.phase === 'seated' ? '已落座' : '落座';
    el('btnPhoto').disabled = false;
  }
  let hintTimer = 0;
  function hint(text) { if (!text) { hintEl.classList.remove('show'); return; } hintEl.textContent = text; hintEl.classList.add('show'); clearTimeout(hintTimer); hintTimer = setTimeout(() => hintEl.classList.remove('show'), 2200); }
  function show(id) { el(id).classList.add('show'); }
  function hide(id) { el(id).classList.remove('show'); }

  // ---------- 声音：全部 Web Audio 合成，首次触碰后才建 ----------
  function unlockAudio() { if (muted) return; if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audio = null; } } if (audio && audio.state === 'suspended') audio.resume(); }
  function tone(o) {
    if (muted || !audio) return; const t = audio.currentTime + (o.delay || 0); const osc = audio.createOscillator(), g = audio.createGain();
    osc.type = o.wave || 'sine'; const jit = 1 + (rand() - 0.5) * 0.12; osc.frequency.setValueAtTime(o.f0 * jit, t); if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1 * jit, t + o.dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.vol, t + (o.attack || 0.01)); g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g).connect(audio.destination); osc.start(t); osc.stop(t + o.dur + 0.05);
  }
  function noise(o) {
    if (muted || !audio) return; const t = audio.currentTime + (o.delay || 0); const len = Math.max(1, Math.floor(audio.sampleRate * o.dur));
    const buf = audio.createBuffer(1, len, audio.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, o.curve || 2);
    const src = audio.createBufferSource(); src.buffer = buf; const f = audio.createBiquadFilter(); f.type = o.type || 'bandpass'; f.frequency.value = o.f0; if (o.q) f.Q.value = o.q;
    const g = audio.createGain(); g.gain.value = o.vol; src.connect(f).connect(g).connect(audio.destination); src.start(t);
  }
  const sfx = {
    sit() { noise({ type: 'lowpass', f0: 260, dur: 0.28, vol: 0.4 }); tone({ f0: 110, f1: 70, dur: 0.25, vol: 0.1, wave: 'triangle', delay: 0.05 }); },
    lamp(v) { tone({ f0: 880, f1: 1320, dur: 0.35, vol: 0.12 * (v || 1), wave: 'triangle' }); },
    clap(v) { const vol = v || 1; noise({ f0: 1800, q: 1.2, dur: 0.08, vol: 0.5 * vol, curve: 2.2 }); noise({ f0: 2400, q: 1.2, dur: 0.08, vol: 0.4 * vol, curve: 2.2, delay: 0.09 }); },
    tea() { tone({ f0: 660, f1: 990, dur: 0.3, vol: 0.1, wave: 'triangle' }); noise({ f0: 900, q: 3, dur: 0.25, vol: 0.12, delay: 0.3 }); },
    leave(v) { const vol = v || 1; noise({ type: 'lowpass', f0: 300, dur: 0.3, vol: 0.35 * vol }); noise({ type: 'lowpass', f0: 180, dur: 0.1, vol: 0.25 * vol, delay: 0.4 }); },
    gong() { [1, 1.5, 2.07, 2.76, 3.9].forEach((m, i) => tone({ f0: 98 * m, dur: 3.2 - i * 0.3, vol: 0.45 / (i + 1), attack: 0.02 })); noise({ f0: 400, q: 0.7, dur: 0.12, vol: 0.3 }); },
  };
  function setMuted(m) { muted = m; if (!FIXED) try { localStorage.setItem('show-foyer-muted', m ? '1' : '0'); } catch (e) {} hint(m ? '已静音' : '已开声'); }

  // ---------- 画面 ----------
  function resize() {
    const r = cv.getBoundingClientRect(); W = Math.max(200, r.width); H = Math.max(200, r.height); DPR = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); ctx.setTransform(DPR, 0, 0, DPR, 0, 0); frameStamp++;
  }
  function geom() {
    const short = H < 330;                                  // 横屏手机：画布很矮
    const stageH = short ? H * 0.3 : Math.min(H * 0.36, 230), pad = Math.min(24, W * 0.06);
    const top = stageH + (short ? 30 : 36), bottom = H - (short ? 14 : 30), left = pad + 10, right = W - pad - 10;
    const pitch = (bottom - top) / D.ROWS;
    const ps = Math.max(0.55, Math.min(1, pitch / 58));     // 人物缩放：排距不够就整体缩小
    const seatW = Math.min(48, (right - left) / D.COLS * 0.7, pitch * 0.9), seatH = seatW * 0.62;
    return { stageH, top, bottom, left, right, seatW, seatH, ps, short };
  }
  function seatPos(i, g) {
    g = g || geom(); const r = Math.floor(i / D.COLS), c = i % D.COLS;
    return { x: g.left + (g.right - g.left) * (c + 0.5) / D.COLS, y: g.top + (g.bottom - g.top) * (r + 0.5) / D.ROWS };
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function lantern(x, y, alpha, scale) {
    const s = scale || 1, flick = 0.85 + 0.15 * Math.sin(S.t * 5 + x);
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(247,200,110,' + (0.2 * flick) + ')'; ctx.beginPath(); ctx.arc(x, y + 2 * s, 18 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c7452f'; ctx.beginPath(); ctx.ellipse(x, y, 8 * s, 10 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f7dc9a'; ctx.fillRect(x - 4 * s, y - 13 * s, 8 * s, 3 * s); ctx.fillRect(x - 1 * s, y + 10 * s, 2 * s, 6 * s);
    ctx.restore();
  }
  function draw() {
    if (!S) return;
    const g = geom();
    const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#2a1e16'); bg.addColorStop(1, '#1a120d'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.03)'; for (let y = g.stageH + 20; y < H; y += 14) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    // 戏台：帷幕、流苏、台面、台口两盏常明灯
    const sh = g.stageH;
    ctx.fillStyle = '#5a1f16'; ctx.fillRect(0, 0, W, sh);
    for (let x = 0; x < W; x += 18) { ctx.fillStyle = (x / 18) % 2 ? '#7a2a1e' : '#6a241a'; ctx.fillRect(x, 0, 18, sh * 0.72); }
    ctx.fillStyle = '#c9a24a'; ctx.fillRect(0, sh * 0.72 - 3, W, 5);
    const tg = ctx.createLinearGradient(0, sh * 0.72, 0, sh + 20); tg.addColorStop(0, '#4a331f'); tg.addColorStop(1, '#2e2014'); ctx.fillStyle = tg; ctx.fillRect(0, sh * 0.72, W, sh * 0.28 + 20);
    ctx.textAlign = 'center'; ctx.fillStyle = '#f7dc9a'; ctx.font = '600 15px "PingFang SC","Hiragino Sans GB",sans-serif'; ctx.fillText('戏 台', W / 2, sh * 0.72 - (g.short ? 8 : 14));
    ctx.font = '500 12px sans-serif'; ctx.fillStyle = 'rgba(247,220,154,.75)'; ctx.fillText(SHOW.troupe + ' · 《' + SHOW.name + '》', W / 2, sh * 0.72 + 26);
    lantern(26, g.short ? 16 : 24, 1, g.short ? 0.7 : 1); lantern(W - 26, g.short ? 16 : 24, 1, g.short ? 0.7 : 1);
    // 点的灯挂成一串，从帷幕上方第二行起，避开「戏台」二字
    S.lamps.forEach((l, i) => { const a = l.t < 0 ? 1 : Math.min(1, (S.t - l.t) / 0.6); const col = i % 7, row = Math.floor(i / 7) % 3; lantern(48 + (W - 96) * col / 6, (g.short ? 30 : 56) + row * (g.short ? 14 : 22), a, g.short ? 0.6 : 0.9); });
    ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(243,233,214,.55)'; ctx.font = '11px sans-serif'; ctx.fillText('台前灯 ' + S.lamps.length + ' 盏', 10, sh + 16);
    ctx.textAlign = 'right'; ctx.fillText('第 ' + S.me.hall + ' 厅 · ' + (S.phase === 'seated' ? humansHere() : humansHere() - 1) + ' 人', W - 10, sh + 16);
    // 座席
    for (let i = 0; i < D.CAP; i++) {
      const p = seatPos(i, g), o = occupant(i);
      ctx.fillStyle = o ? C.seatTaken : C.seat; ctx.strokeStyle = C.seatLine; ctx.lineWidth = 1;
      roundRect(p.x - g.seatW / 2, p.y - 6, g.seatW, g.seatH, 5); ctx.fill(); ctx.stroke();
      if (!o) { ctx.fillStyle = 'rgba(243,233,214,.25)'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('空', p.x, p.y + 9); }
    }
    // 人物：先画后排再画前排（按 y）
    const people = [];
    for (const o of hereOthers()) people.push({ o, p: seatPos(o.seat, g) });
    if (S.phase === 'seated') people.push({ o: { kind: 'me', color: C.me, label: '我', pose: S.mePose, bubble: S.meBubble, glow: S.meGlow }, p: seatPos(S.me.seat, g) });
    else people.push({ o: { kind: 'me', color: C.me, label: '我', pose: 'stand', bubble: S.meBubble, glow: 0 }, p: { x: W / 2, y: H - 12 } });
    people.sort((a, b) => a.p.y - b.p.y);
    for (const { o, p } of people) drawPerson(o, p.x, p.y - 6 * g.ps, g.ps);
    // 效果：掌声涟漪、茶杯飞行、整点闪光
    for (const e of S.effects) {
      const k = (S.t - e.t) / (e.kind === 'tea' ? 1.4 : 1.0);
      if (e.kind === 'ripple') { const p = seatPos(e.seat, g); ctx.strokeStyle = 'rgba(247,220,154,' + (0.6 * (1 - k)) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y - 12 * g.ps, (14 + k * 34) * g.ps, 0, Math.PI * 2); ctx.stroke(); }
      if (e.kind === 'tea') { const a = seatPos(e.from, g), b = seatPos(e.to, g); const ease = k < 0.5 ? 2 * k * k : -1 + (4 - 2 * k) * k; const x = a.x + (b.x - a.x) * ease, y = a.y - 30 + (b.y - a.y) * ease - Math.sin(k * Math.PI) * 22; ctx.font = Math.round(16 * g.ps) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🍵', x, y); }
    }
    if (S.gongFlash && S.t - S.gongFlash < 0.9) { ctx.fillStyle = 'rgba(247,220,154,' + (0.35 * (1 - (S.t - S.gongFlash) / 0.9)) + ')'; ctx.fillRect(0, 0, W, H); }
  }
  function drawPerson(o, x, y, s) {
    s = s || 1;
    const isR = o.kind === 'resident', isMe = o.kind === 'me';
    if (o.glow && S.t - o.glow < 2.5) { const k = 1 - (S.t - o.glow) / 2.5; ctx.fillStyle = 'rgba(247,220,154,' + (0.35 * k) + ')'; ctx.beginPath(); ctx.arc(x, y - 8 * s, 22 * s, 0, Math.PI * 2); ctx.fill(); }
    ctx.save(); if (isR) ctx.globalAlpha = 0.55; else if (o.kind === 'ghost') ctx.globalAlpha = 0.82;
    const dy = o.pose === 'shift' ? Math.sin(S.t * 8) * 1.5 : 0, lift = (o.pose === 'look' ? -3 : o.pose === 'nod' ? 2 : 0) * s;
    ctx.fillStyle = o.color; ctx.beginPath(); ctx.ellipse(x + dy, y + 2 * s, 11 * s, 9 * s, 0, 0, Math.PI * 2); ctx.fill();          // 身体
    ctx.fillStyle = isR ? '#8a8a8a' : C.skin; ctx.beginPath(); ctx.arc(x + dy, y - 11 * s + lift, 8 * s, 0, Math.PI * 2); ctx.fill(); // 头
    if (o.pose === 'clap') { ctx.fillStyle = isR ? '#8a8a8a' : C.skin; const w = Math.sin(S.t * 18) * 3 * s; ctx.beginPath(); ctx.arc(x - 6 * s + w, y - 2 * s, 3 * s, 0, Math.PI * 2); ctx.arc(x + 6 * s - w, y - 2 * s, 3 * s, 0, Math.PI * 2); ctx.fill(); }
    if (o.pose === 'lamp') { ctx.fillStyle = C.skin; ctx.beginPath(); ctx.arc(x + 10 * s, y - 14 * s, 3 * s, 0, Math.PI * 2); ctx.fill(); }
    if (isMe) { ctx.strokeStyle = '#f7dc9a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y - 6 * s, 16 * s, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
    const fs = Math.max(8, Math.round((isR ? 9 : 10) * s));
    ctx.textAlign = 'center'; ctx.font = fs + 'px sans-serif'; ctx.fillStyle = isR ? 'rgba(200,200,200,.75)' : 'rgba(243,233,214,.9)';
    ctx.fillText(o.label, x, y + 22 * s);
    if (o.bubble && S.t - o.bubble.t < 2.4) { const k = (S.t - o.bubble.t) / 2.4; ctx.globalAlpha = 1 - k; ctx.font = Math.round(16 * s) + 'px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(o.bubble.text, x, y - 26 * s - k * 10); ctx.globalAlpha = 1; }
  }

  // ---------- 合影：今晚谁来过 ----------
  function photo() {
    const pw = 720, scale = (pw - 120) / W, hallH = H * scale, ph = Math.round(240 + hallH + 230);
    const c = document.createElement('canvas'); c.width = pw; c.height = ph; const x = c.getContext('2d');
    const bg = x.createLinearGradient(0, 0, 0, ph); bg.addColorStop(0, '#2a1e16'); bg.addColorStop(1, '#120c08'); x.fillStyle = bg; x.fillRect(0, 0, pw, ph);
    x.strokeStyle = '#c9a24a'; x.lineWidth = 3; x.strokeRect(24, 24, pw - 48, ph - 48);
    x.textAlign = 'center'; x.fillStyle = '#f7dc9a'; x.font = '600 40px "PingFang SC","Hiragino Sans GB",sans-serif'; x.fillText('今晚谁来过', pw / 2, 110);
    x.font = '26px sans-serif'; x.fillStyle = 'rgba(243,233,214,.85)'; x.fillText(SHOW.troupe + ' · 《' + SHOW.name + '》 · 候场厅 · 第 ' + S.me.hall + ' 厅', pw / 2, 160);
    const d = new Date(S.lastClockMs); x.font = '20px sans-serif'; x.fillStyle = 'rgba(243,233,214,.6)'; x.fillText(d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 · 开演前', pw / 2, 196);
    x.save(); x.translate(60, 240); x.scale(scale, scale); x.drawImage(cv, 0, 0, cv.width, cv.height, 0, 0, W, H); x.restore();
    const yb = 240 + hallH + 56;
    x.font = '24px sans-serif'; x.fillStyle = '#f7dc9a'; x.fillText('在场 ' + (S.phase === 'seated' ? humansHere() : humansHere() - 1) + ' 人 · 点灯 ' + S.lamps.length + ' 盏 · 掌声 ' + S.claps + ' 次 · 递茶 ' + S.teas + ' 杯', pw / 2, yb);
    const names = [S.phase === 'seated' ? '我' : null, ...S.ghosts.filter((g) => g.hall === S.me.hall && g.here && !g.gone).map((g) => g.label)].filter(Boolean).join('   ');
    x.font = '20px sans-serif'; x.fillStyle = 'rgba(243,233,214,.7)'; wrap(x, names || '还没有人落座', pw / 2, yb + 44, pw - 140, 28);
    x.font = '16px sans-serif'; x.fillStyle = 'rgba(200,200,200,.6)'; x.fillText('灰色身影为候场布置，不是真人 · 带「你」的是你自己前几次来的回放', pw / 2, ph - 44);
    el('photoImg').src = c.toDataURL('image/png'); show('photoOverlay'); S.lastSound = 'photo';
  }
  function wrap(x, text, cx, y, maxW, lh) { let line = ''; for (const w of text.split('   ')) { const t = line ? line + '   ' + w : w; if (x.measureText(t).width > maxW && line) { x.fillText(line, cx, y); y += lh; line = w; } else line = t; } if (line) x.fillText(line, cx, y); }

  // ---------- 交互 ----------
  cv.addEventListener('pointerdown', (e) => {
    if (!S) return; const r = cv.getBoundingClientRect(); const px = e.clientX - r.left, py = e.clientY - r.top; const g = geom();
    let best = -1, bd = 1e9; for (let i = 0; i < D.CAP; i++) { const p = seatPos(i, g); const d = Math.hypot(p.x - px, p.y - py); if (d < bd) { bd = d; best = i; } }
    if (best < 0 || bd > 26) return;
    const o = occupant(best);
    if (!o) { if (S.phase !== 'seated') act(0, best); else hint('换座请先离席'); }
    else if (o.kind === 'resident') hint('这是候场身影，不是真人');
    else if (o.kind === 'ghost') hint(o.label + ' 坐在这儿');
  });
  bar.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.act !== undefined) act(Number(b.dataset.act)); else if (b.id === 'btnPhoto') { unlockAudio(); photo(); } });
  el('gongBtn').addEventListener('click', () => { unlockAudio(); gong(false); });
  el('infoBtn').addEventListener('click', () => show('infoOverlay'));
  for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', () => hide(b.dataset.close));
  window.addEventListener('keydown', (e) => { if (e.key >= '1' && e.key <= '5') act(Number(e.key) - 1); else if (e.key === 'm' || e.key === 'M') setMuted(!muted); else if (e.key === 'p' || e.key === 'P') photo(); else if (e.key === 'Escape') for (const o of document.querySelectorAll('.overlay.show')) o.classList.remove('show'); });
  window.addEventListener('resize', resize);

  // ---------- 主循环 ----------
  function frame(ts) {
    const dt = lastFrame ? Math.min(0.1, (ts - lastFrame) / 1000) : 0; lastFrame = ts;
    if (!paused) tick(dt);
    draw(); requestAnimationFrame(frame);
  }

  // ---------- 测试钩子 ----------
  function snapshot() {
    if (!S) return null;
    return {
      phase: S.phase, hall: S.me.hall, seat: S.me.seat, t: Math.round(S.t * 10) / 10,
      halls: D.hallList(S.house), humans: S.phase === 'seated' ? humansHere() : humansHere() - 1,
      ghostsHere: S.ghosts.filter((g) => g.hall === S.me.hall && g.here && !g.gone).length, residents: S.residents.length,
      lamps: S.lamps.length, claps: S.claps, teas: S.teas, gongs: S.gongCount, lastSound: S.lastSound,
      effects: S.effects.map((e) => e.kind), visits: visits.length, hint: hintEl.textContent, hallTag: hallTag.textContent, countText: countEl.textContent,
      gongOpen: el('gongOverlay').classList.contains('show'), photoOpen: el('photoOverlay').classList.contains('show'), frameStamp,
    };
  }
  window.__foyer = {
    get ready() { return !!S; }, act, snapshot, canAct, gong, photo, get state() { return S; }, get visits() { return visits; }, get frameStamp() { return frameStamp; },
    pause(p) { paused = p; }, step(ms) { tick(ms / 1000); draw(); frameStamp++; },
    reset() { visits = loadVisits(); rngState = D.rng(seed); enterHall(); },
  };
  window.__PLAYTEST__ = {
    get ready() { return !!S; }, snapshot,
    reset() { window.__foyer.reset(); }, setSeed(n) { rngState = D.rng(n); },
    step(ms) { paused = true; tick(ms / 1000); draw(); frameStamp++; },
  };

  resize(); visits = loadVisits(); enterHall(); requestAnimationFrame(frame);
})();
