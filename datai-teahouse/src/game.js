// 茶楼搭台 · 画面、动作、声音、记录。规则在 core.js。
(function () {
  'use strict';
  const D = window.DATAI;
  const Q = new URLSearchParams(location.search);
  const VIEW = Q.get('view');                 // first | busy | full：固定机位，不读不写 localStorage
  const FIXED = VIEW !== null;
  const SEED0 = +Q.get('seed') || 20261031;
  const STORE_KEY = 'datai-visits';
  const canvas = document.getElementById('scene');
  const ctx = canvas.getContext('2d');
  const whereEl = document.getElementById('where'), hallEl = document.getElementById('hall'), hintEl = document.getElementById('hint');
  const buttons = [...document.querySelectorAll('#bar button[data-act]')];
  const muteBtn = document.getElementById('mute');

  // ---------- 颜色（sRGB） ----------
  const C = {
    wood: '#6b4a2b', woodDark: '#4a3119', woodLight: '#8a6539', floor: '#7a5a38', floorLine: 'rgba(0,0,0,.14)',
    wall: '#b89b72', wallDark: '#9c8058', cloth: '#efe6d2', clothShade: '#d9cbb0', rim: '#5a3d22',
    glass: ['#3f8f7a', '#c7532f', '#d9a441', '#4a6fa5'], sun: 'rgba(243,217,160,.55)',
    bamboo: '#c9a063', bambooDark: '#8f6a35', tea: '#b8762a', porcelain: '#f7f3ea', blue: '#3b5b9a',
    paper: '#ece5d3', paperInk: 'rgba(60,50,40,.55)', grey: '#9a948c', ink: '#2a2118',
    me: '#c7532f', ghost: ['#4a6fa5', '#3f8f7a', '#d9a441', '#8a5aa5', '#5a8f3f', '#a56f3f'],
    skin: '#e8c9a6', steam: 'rgba(255,255,255,.55)',
  };

  // ---------- 状态 ----------
  let W = 0, H = 0, DPR = 1;
  let S = null;             // 场景状态
  let visits = [];          // 历史来访
  let seed = SEED0;
  let paused = false, lastFrame = 0, frameStamp = 0;
  let muted = false;
  try { muted = !FIXED && localStorage.getItem('datai-muted') === '1'; } catch (e) {}
  if (Q.get('mute') === '1') muted = true;

  function loadVisits() {
    if (FIXED) {
      if (VIEW === 'busy') return D.syntheticVisits(6, 7);
      if (VIEW === 'full') return D.syntheticVisits(3, 5);
      return [];
    }
    try { return D.decodeVisits(localStorage.getItem(STORE_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveVisits() {
    if (FIXED) return;
    try { localStorage.setItem(STORE_KEY, D.encodeVisits(visits)); } catch (e) {}
  }

  // 进门：把历史幽灵排好桌，给自己派一张桌。此时还站着，按「落座」才坐下。
  function enterHall() {
    const plan = D.planGhosts(visits, D.CAP);
    const now = Date.now();
    const mine = plan.ghosts.filter((g) => g.table === plan.me.table);
    const ghosts = plan.ghosts.map((g, i) => ({
      ...g, kind: 'ghost', color: C.ghost[i % C.ghost.length], label: '你 · ' + ago(now - g.at),
      prev: 0, here: g.table === plan.me.table, gone: false, fade: 1, pose: 'idle', poseUntil: 0, cup: 0.6, page: 0,
    }));
    S = {
      phase: 'door', tau: 0, seatT: 0, hall: plan.hall, me: plan.me, ghosts, residents: [],
      pot: { level: 1, lidOff: false, refillAt: -1 }, myCup: 0, myPlate: 0, myPage: 0, myPose: 'idle', myPoseUntil: 0,
      steamer: { count: 3, nextAt: -1 }, effects: [], knockUntil: -1, knockBacks: [], lastSound: null,
      visit: null, fan: 0, hintUntil: 0,
    };
    for (const g of mine) g.here = true;
    syncResidents();
    updateBars();
    hint(S.me.table === 1 && !mine.length ? '早市刚开，拣张桌落座' : `伙计指了指第 ${S.me.table} 桌：那边有位，搭台吧`);
  }

  function ago(ms) {
    const m = ms / 60000;
    if (m < 1) return '刚才'; if (m < 60) return `${Math.round(m)} 分钟前`;
    const h = m / 60; if (h < 24) return `${Math.round(h)} 小时前`;
    const d = h / 24; if (d < 2) return '昨天'; if (d < 30) return `${Math.round(d)} 天前`;
    return '很久以前';
  }

  // 桌上的「别人」（幽灵在座的）；灰影补到 2 个
  function othersHere() { return S.ghosts.filter((g) => g.here && !g.gone); }
  function syncResidents() {
    const need = D.residentsFor(othersHere().length);
    while (S.residents.length > need) { const r = S.residents.pop(); S.effects.push({ kind: 'fade', who: r, t0: S.tau, dur: 1.2 }); }
    while (S.residents.length < need) {
      const idx = S.residents.length;
      const taken = new Set([S.me.seat, ...othersHere().map((g) => g.seat), ...S.residents.map((r) => r.seat)]);
      let seat = 0; while (taken.has(seat)) seat++;
      if (seat > 3) break;
      S.residents.push({ id: 'r' + idx, kind: 'resident', seat, color: C.grey, label: '常客 · 不是真人', sched: D.residentSchedule(seed, idx),
        prev: S.tau, start: S.tau, fade: 0, pose: 'idle', poseUntil: 0, cup: 0.5, page: 0 });
    }
  }

  // 视觉槽位：自己永远在前左（0），其余按桌上顺序：1 后左、2 后右、3 前右
  function slotOf(seat) { return (seat - S.me.seat + 4) % 4; }

  // ---------- 动作 ----------
  const KNOCK_WINDOW = 8;
  function canAct(code) {
    if (!S) return false;
    if (code === 0) return S.phase === 'door';
    if (S.phase !== 'seated') return false;
    if (code === 2) return S.tau <= S.knockUntil;
    if (code === 3) return !S.pot.lidOff;
    if (code === 6) return true;
    return true;
  }

  function act(code, by) {
    // by: undefined = 玩家；否则是桌上的别人（幽灵或灰影）
    if (!by && !canAct(code)) { if (code === 1 && S.phase === 'seated') {} return false; }
    const t = S.tau;
    if (!by) {
      if (S.visit && code !== 0) D.recordAct(S.visit, t - S.seatT, code);
    }
    switch (code) {
      case 0: // 落座
        S.phase = 'seated'; S.seatT = t; S.visit = D.newVisit(Date.now());
        S.myPose = 'sit'; S.myPoseUntil = t + 0.8; S.effects.push({ kind: 'sitdown', t0: t, dur: 0.8 });
        sfx.sit(); hint(`第 ${S.me.table} 桌 · 一盅两件，各看各的`);
        break;
      case 1: { // 斟茶：给全桌
        if (S.pot.level < 0.24) { sfx.dry(); if (!by) hint('壶空了。揭盖，伙计就来加水'); S.effects.push({ kind: 'shake', t0: t, dur: 0.4 }); break; }
        S.pot.level = Math.max(0, S.pot.level - 0.25);
        const from = by ? slotOf(by.seat) : 0;
        S.effects.push({ kind: 'pour', t0: t, dur: 1.6, from });
        S.myCup = 1; for (const g of othersHere()) g.cup = 1; for (const r of S.residents) r.cup = 1;
        setPose(by, 'pour', 1.6);
        sfx.pour();
        if (by) { S.knockUntil = t + KNOCK_WINDOW; hint(`${by.label.split(' · ')[0] === '你' ? '上次的你' : '邻座'}给你斟了茶 · 叩指谢一下`); }
        else {
          hint('给全桌斟了一巡');
          for (const o of [...othersHere(), ...S.residents]) if (o.kind === 'resident' || o.knocks) S.knockBacks.push({ who: o, at: t + 1.4 + rnd() * 1.2 });
        }
        break;
      }
      case 2: // 叩指
        S.effects.push({ kind: 'knock', t0: t, dur: 0.6, slot: by ? slotOf(by.seat) : 0 });
        setPose(by, 'knock', 0.6); sfx.knock();
        if (!by) { S.knockUntil = -1; hint('叩指两下 · 多谢'); }
        break;
      case 3: // 揭盖
        S.pot.lidOff = true; S.pot.refillAt = t + 3.5; S.effects.push({ kind: 'lid', t0: t, dur: 0.5 }); sfx.lid();
        if (!by) hint('壶盖搁在壶口 · 伙计看见就来加水');
        break;
      case 4: // 翻报纸
        if (by) by.page++; else S.myPage++;
        S.effects.push({ kind: 'paper', t0: t, dur: 0.7, slot: by ? slotOf(by.seat) : 0 });
        setPose(by, 'paper', 6 + rnd() * 6); sfx.paper();
        if (!by) hint(['翻到港闻', '翻到体育', '翻到副刊', '翻到马经', '翻到讣闻', '翻到广告'][S.myPage % 6]);
        break;
      case 5: // 夹一件
        if (S.steamer.count <= 0) { sfx.dry(); if (!by) hint('笼空了 · 伙计换一笼'); break; }
        S.steamer.count--; if (S.steamer.count === 0) S.steamer.nextAt = t + 4;
        if (by) {} else S.myPlate++;
        S.effects.push({ kind: 'pick', t0: t, dur: 1.1, slot: by ? slotOf(by.seat) : 0 });
        setPose(by, 'pick', 1.1); sfx.pick();
        if (!by) hint(['虾饺', '烧卖', '叉烧包', '凤爪', '排骨'][S.myPlate % 5] + ' · 夹到碟里');
        break;
      case 6: { // 离席
        const dur = t - S.seatT;
        D.closeVisit(S.visit, dur);
        visits = D.pushVisit(visits, S.visit); saveVisits();
        S.visit = null; sfx.leave();
        const sat = Math.round(dur);
        hint(sat < 5 ? '坐了一会儿就走' : `坐了 ${sat} 秒 · 这一趟记下了，下次会坐在桌上`);
        // 重新进门：大堂按新的历史重排，刚才的你坐进去
        const keepHint = hintEl.textContent;
        enterHall(); hint(keepHint);
        S.effects.push({ kind: 'reenter', t0: 0, dur: 1.0 });
        break;
      }
      case 7: // 抿茶（只给别人）
        if (by) { by.cup = Math.max(0, by.cup - 0.3); setPose(by, 'sip', 1.4); }
        break;
    }
    frameStamp++;
    updateBars();
    return true;
  }
  function setPose(who, pose, dur) {
    if (who) { who.pose = pose; who.poseUntil = S.tau + dur; } else { S.myPose = pose; S.myPoseUntil = S.tau + dur; }
  }
  let rngState = D.rng(SEED0);
  function rnd() { return rngState(); }

  function hint(text) { hintEl.textContent = text; hintEl.classList.add('show'); S.hintUntil = S.tau + 4; }

  // ---------- 时间推进 ----------
  function tick(dt) {
    S.tau += dt;
    const t = S.tau;
    S.fan += dt * 2.2;
    // 别人的回放
    for (const g of S.ghosts) {
      if (!g.here || g.gone) continue;
      if (t >= g.end) { g.gone = true; D.leave(S.hall, g.id); S.effects.push({ kind: 'fade', who: g, t0: t, dur: 1.2 }); sfx.leave(0.5); syncResidents(); updateBars(); continue; }
      for (const a of D.dueActs(g.acts, g.prev, t)) act(a[1], g);
      g.prev = t;
      if (g.fade < 1) g.fade = Math.min(1, g.fade + dt * 1.5);
    }
    for (const r of S.residents) {
      const local = t - r.start, prevLocal = r.prev - r.start;
      const cyc = Math.floor(local / r.sched.period), pcyc = Math.floor(prevLocal / r.sched.period);
      for (let c = pcyc; c <= cyc; c++) {
        const lo = prevLocal - c * r.sched.period, hi = local - c * r.sched.period;
        for (const a of D.dueActs(r.sched.acts, lo, hi)) act(a[1], r);
      }
      r.prev = t;
      if (r.fade < 1) r.fade = Math.min(1, r.fade + dt * 1.2);
    }
    // 回叩
    for (let i = S.knockBacks.length - 1; i >= 0; i--) if (t >= S.knockBacks[i].at) { act(2, S.knockBacks[i].who); S.knockBacks.splice(i, 1); }
    // 伙计加水、换笼
    if (S.pot.lidOff && t >= S.pot.refillAt) { S.pot.lidOff = false; S.pot.level = 1; S.effects.push({ kind: 'refill', t0: t, dur: 1.2 }); sfx.refill(); if (S.phase === 'seated') hint('加了水 · 壶满了'); }
    if (S.steamer.count === 0 && t >= S.steamer.nextAt) { S.steamer.count = 3; S.effects.push({ kind: 'newsteamer', t0: t, dur: 0.9 }); sfx.steamer(); }
    if (S.knockUntil > 0 && t > S.knockUntil) { S.knockUntil = -1; updateBars(); }
    if (S.myPose !== 'idle' && t > S.myPoseUntil) S.myPose = 'idle';
    for (const o of [...S.ghosts, ...S.residents]) if (o.pose !== 'idle' && t > o.poseUntil) o.pose = 'idle';
    S.effects = S.effects.filter((e) => t - e.t0 < e.dur);
    if (t > S.hintUntil) hintEl.classList.remove('show');
    // 远处偶尔一声蒸笼
    if (Math.floor(t / 27) !== Math.floor((t - dt) / 27) && rnd() < 0.8) sfx.steamer(0.25);
  }

  function updateBars() {
    if (!S) return;
    const sum = D.summary(S.hall);
    const atMine = othersHere().length + (S.phase === 'seated' ? 1 : 0);
    const myCount = S.hall.tables.get(S.me.table) ? S.hall.tables.get(S.me.table).size : 0;
    const guests = sum.guests - (S.phase === 'seated' ? 0 : 1);
    whereEl.innerHTML = S.phase === 'door' ? `<b>搭台</b> · 第 ${S.me.table} 桌有位` : `<b>第 ${S.me.table} 桌</b> · ${myCount} / ${D.CAP}`;
    hallEl.textContent = `大堂 ${sum.tables} 桌 · ${Math.max(guests, 0)} 人`;
    void atMine;
    buttons.forEach((b) => { const code = +b.dataset.act; b.disabled = !canAct(code); b.classList.toggle('hot', code === 2 && canAct(2)); });
    muteBtn.textContent = muted ? '有声' : '静音'; muteBtn.setAttribute('aria-pressed', String(muted));
  }

  // ---------- 声音（全部合成，首次触碰后才建） ----------
  let ac = null, master = null, noiseBuf = null, ambient = null;
  function audio() {
    if (ac) return ac;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
      const n = ac.sampleRate * 2, buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12; }
      noiseBuf = buf;
      startAmbient();
    } catch (e) { ac = null; }
    return ac;
  }
  function startAmbient() {
    if (ambient || !ac) return;
    const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
    const g = ac.createGain(); g.gain.value = muted ? 0 : 0.18;
    src.connect(lp); lp.connect(g); g.connect(master); src.start();
    ambient = g;
  }
  const detune = () => 1 + (rnd() - 0.5) * 0.12;
  function noise(opts) {
    if (!audio() || muted) return;
    const t = ac.currentTime + (opts.delay || 0), src = ac.createBufferSource(); src.buffer = noiseBuf; src.playbackRate.value = (opts.rate || 1) * detune();
    const f = ac.createBiquadFilter(); f.type = opts.type || 'bandpass'; f.Q.value = opts.q || 1;
    f.frequency.setValueAtTime(opts.f0 || 800, t); if (opts.f1) f.frequency.linearRampToValueAtTime(opts.f1, t + opts.dur);
    const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(opts.vol || 0.5, t + (opts.attack || 0.02)); g.gain.exponentialRampToValueAtTime(0.001, t + opts.dur);
    src.connect(f); f.connect(g); g.connect(master); src.start(t); src.stop(t + opts.dur + 0.05);
  }
  function tone(opts) {
    if (!audio() || muted) return;
    const t = ac.currentTime + (opts.delay || 0), o = ac.createOscillator(); o.type = opts.wave || 'sine';
    o.frequency.setValueAtTime((opts.f0 || 440) * detune(), t); if (opts.f1) o.frequency.exponentialRampToValueAtTime(opts.f1 * detune(), t + opts.dur);
    const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(opts.vol || 0.3, t + (opts.attack || 0.005)); g.gain.exponentialRampToValueAtTime(0.001, t + opts.dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + opts.dur + 0.05);
  }
  const sfx = {
    sit() { S.lastSound = 'sit'; noise({ type: 'lowpass', f0: 260, dur: 0.28, vol: 0.5, attack: 0.04 }); tone({ f0: 110, f1: 70, dur: 0.25, vol: 0.12, wave: 'triangle', delay: 0.05 }); },
    pour() { S.lastSound = 'pour'; noise({ f0: 420, f1: 1300, q: 2.5, dur: 1.3, vol: 0.4, attack: 0.15 }); tone({ f0: 520, f1: 1180, dur: 1.2, vol: 0.05, delay: 0.1 }); },
    knock() { S.lastSound = 'knock'; tone({ f0: 1750, f1: 900, dur: 0.07, vol: 0.35, wave: 'triangle' }); tone({ f0: 1750, f1: 900, dur: 0.07, vol: 0.35, wave: 'triangle', delay: 0.16 }); noise({ f0: 2400, q: 3, dur: 0.05, vol: 0.2 }); noise({ f0: 2400, q: 3, dur: 0.05, vol: 0.2, delay: 0.16 }); },
    lid() { S.lastSound = 'lid'; tone({ f0: 2650, f1: 2500, dur: 0.35, vol: 0.28 }); tone({ f0: 3950, f1: 3700, dur: 0.18, vol: 0.1, delay: 0.02 }); },
    paper() { S.lastSound = 'paper'; noise({ type: 'highpass', f0: 1500, dur: 0.13, vol: 0.4, rate: 1.6 }); noise({ type: 'highpass', f0: 1200, dur: 0.18, vol: 0.3, rate: 1.3, delay: 0.17 }); },
    pick() { S.lastSound = 'pick'; noise({ f0: 900, q: 4, dur: 0.08, vol: 0.3, rate: 0.8 }); tone({ f0: 3100, f1: 2900, dur: 0.12, vol: 0.14, delay: 0.55 }); },
    leave(v) { S.lastSound = 'leave'; const vol = v || 1; noise({ type: 'lowpass', f0: 300, dur: 0.3, vol: 0.45 * vol, attack: 0.03 }); noise({ type: 'lowpass', f0: 180, dur: 0.1, vol: 0.3 * vol, delay: 0.45 }); noise({ type: 'lowpass', f0: 180, dur: 0.1, vol: 0.25 * vol, delay: 0.8 }); },
    dry() { S.lastSound = 'dry'; noise({ f0: 700, q: 6, dur: 0.2, vol: 0.2, rate: 0.6 }); },
    refill() { S.lastSound = 'refill'; noise({ f0: 300, f1: 900, q: 2, dur: 1.0, vol: 0.3, attack: 0.1 }); tone({ f0: 2650, f1: 2500, dur: 0.3, vol: 0.2, delay: 1.0 }); },
    steamer(v) { S.lastSound = 'steamer'; const vol = v || 0.6; noise({ f0: 1100, q: 2, dur: 0.12, vol: 0.35 * vol, rate: 0.9 }); noise({ f0: 1300, q: 2, dur: 0.1, vol: 0.25 * vol, rate: 1.1, delay: 0.09 }); },
  };
  function setMuted(m) {
    muted = m; if (!FIXED) try { localStorage.setItem('datai-muted', m ? '1' : '0'); } catch (e) {}
    if (ambient) ambient.gain.value = m ? 0 : 0.18;
    updateBars();
  }

  // ---------- 画面 ----------
  function resize() {
    const r = canvas.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    frameStamp++;
  }

  // 布局：后墙占上 36%，地板往下；近桌中心在 68% 高
  function layout() {
    const horizon = H * 0.36;
    const avail = H - horizon;
    let rx = Math.min(W * 0.34, 190, avail * 0.40), ry = rx * 0.46;
    // 近桌中心：默认在地板 56% 处；前排的人（头、身、标签）要留在画布里，不够就往上提、桌子再缩
    let cy = horizon + avail * 0.56;
    const need = (r) => r * 0.46 * 1.34 * 0.77 + 48; // 前排人物从桌心到标签底的距离
    if (cy + need(rx) > H - 4) { cy = H - 4 - need(rx); }
    if (cy < horizon + avail * 0.40) { rx = Math.max(60, (H - 4 - horizon - avail * 0.40 - 48) / (0.46 * 1.34 * 0.77)); ry = rx * 0.46; cy = H - 4 - need(rx); }
    return { horizon, cx: W / 2, cy, rx, ry, short: avail < 240 };
  }
  function ell(x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); }
  const SLOT_ANGLE = [Math.PI * 0.72, Math.PI * 1.22, Math.PI * 1.78, Math.PI * 0.28]; // 前左、后左、后右、前右
  function slotPos(L, slot, k) {
    const a = SLOT_ANGLE[slot];
    return { x: L.cx + Math.cos(a) * L.rx * k, y: L.cy + Math.sin(a) * L.ry * k, back: slot === 1 || slot === 2 };
  }

  function draw() {
    const L = layout(), t = S.tau;
    // 地板
    ctx.fillStyle = C.floor; ctx.fillRect(0, L.horizon, W, H - L.horizon);
    ctx.strokeStyle = C.floorLine; ctx.lineWidth = 1;
    for (let i = 0; i < 9; i++) { const y = L.horizon + ((H - L.horizon) * Math.pow(i / 8, 1.6)); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    for (let i = -6; i <= 6; i++) { ctx.beginPath(); ctx.moveTo(W / 2 + i * W * 0.045, L.horizon); ctx.lineTo(W / 2 + i * W * 0.22, H); ctx.stroke(); }
    drawWall(L, t);
    drawFarTables(L, t);
    // 近桌：后排的人 → 桌 → 前排的人
    const people = peopleAtTable();
    for (const p of people) if (p.back) drawPerson(L, p, t);
    drawTable(L, t);
    for (const p of people) if (!p.back) drawPerson(L, p, t);
    drawEffects(L, t);
    if (S.phase === 'door') drawDoorVeil(L, t);
  }

  function drawWall(L, t) {
    const g = ctx.createLinearGradient(0, 0, 0, L.horizon); g.addColorStop(0, C.wallDark); g.addColorStop(1, C.wall);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, L.horizon);
    // 护墙板
    ctx.fillStyle = C.woodDark; ctx.fillRect(0, L.horizon - 10, W, 10);
    // 满洲窗：三扇，彩色玻璃格
    const n = W > 700 ? 5 : 3, ww = Math.min(W / (n + 1) * 0.78, 150), wh = L.horizon * 0.58, gap = (W - n * ww) / (n + 1);
    for (let i = 0; i < n; i++) {
      const x = gap + i * (ww + gap), y = L.horizon * 0.2;
      ctx.fillStyle = C.rim; ctx.fillRect(x - 6, y - 6, ww + 12, wh + 12);
      const cols = 3, rows = 4, cw = ww / cols, ch = wh / rows;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const edge = r === 0 || r === rows - 1 || c === 0 || c === cols - 1;
        ctx.fillStyle = edge ? C.glass[(r * 3 + c + i) % 4] : 'rgba(250,240,220,.85)';
        ctx.fillRect(x + c * cw + 2, y + r * ch + 2, cw - 4, ch - 4);
      }
      ctx.strokeStyle = C.rim; ctx.lineWidth = 2; ctx.strokeRect(x, y, ww, wh);
      // 晨光斜落到地上
      ctx.fillStyle = C.sun; ctx.beginPath(); ctx.moveTo(x, y + wh); ctx.lineTo(x + ww, y + wh); ctx.lineTo(x + ww * 1.6, L.horizon + (H - L.horizon) * 0.25); ctx.lineTo(x - ww * 0.2, L.horizon + (H - L.horizon) * 0.25); ctx.closePath(); ctx.fill();
    }
    // 木柱
    for (const x of [W * 0.06, W * 0.94]) { ctx.fillStyle = C.woodDark; ctx.fillRect(x - 9, 0, 18, L.horizon); ctx.fillStyle = C.woodLight; ctx.fillRect(x - 3, 0, 4, L.horizon); }
    // 吊扇
    const fx = W / 2, fy = L.horizon * 0.07;
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(fx, 0); ctx.lineTo(fx, fy); ctx.stroke();
    ctx.fillStyle = C.rim; ell(fx, fy, 7, 3.5); ctx.fill();
    for (let i = 0; i < 4; i++) { const a = S.fan + i * Math.PI / 2; ctx.fillStyle = 'rgba(74,49,25,.85)'; ctx.beginPath(); ctx.ellipse(fx + Math.cos(a) * 17, fy + Math.sin(a) * 3.5, 15, 2.6, a, 0, Math.PI * 2); ctx.fill(); }
    // 鸟笼
    const bx = W * 0.88, by = L.horizon * 0.22, bw = 14, bh = 26;
    ctx.strokeStyle = C.rim; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx, by - bh * 0.5); ctx.stroke();
    ctx.beginPath(); ctx.arc(bx, by - bh * 0.3, bw, Math.PI, 0); ctx.moveTo(bx - bw, by - bh * 0.3); ctx.lineTo(bx - bw, by + bh * 0.5); ctx.lineTo(bx + bw, by + bh * 0.5); ctx.lineTo(bx + bw, by - bh * 0.3); ctx.stroke();
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(bx + i * bw * 0.45, by - bh * 0.3 - Math.sqrt(Math.max(0, bw * bw - (i * bw * 0.45) ** 2))); ctx.lineTo(bx + i * bw * 0.45, by + bh * 0.5); ctx.stroke(); }
    ctx.fillStyle = C.glass[2]; ell(bx + Math.sin(t * 1.3) * 3, by + bh * 0.1, 4, 3); ctx.fill();
    // 墙上的字牌（墙够高才挂）
    if (L.horizon > 150) {
      ctx.fillStyle = C.rim; ctx.fillRect(W * 0.5 - 34, L.horizon - 34, 68, 18);
      ctx.fillStyle = '#f0d9a0'; ctx.font = `${11}px "Noto Serif SC", serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('茶 靓 水 滚', W * 0.5, L.horizon - 25);
    }
  }

  // 远处的桌子：大堂里除了自己这桌的其他桌，小椭圆加人头点
  function drawFarTables(L, t) {
    const tables = D.tableList(S.hall).filter((x) => x.no !== S.me.table);
    const y0 = L.horizon + (H - L.horizon) * (L.short ? 0.05 : 0.10), step = Math.min(W / (tables.length + 1), 150);
    const total = tables.length;
    tables.forEach((tb, i) => {
      const x = W / 2 + (i - (total - 1) / 2) * step, y = y0 + (L.short ? 0 : (i % 2) * 14);
      const rx = 26, ry = 11;
      ctx.fillStyle = C.rim; ell(x, y + 3, rx + 2, ry + 2); ctx.fill();
      ctx.fillStyle = C.cloth; ell(x, y, rx, ry); ctx.fill();
      ctx.fillStyle = C.porcelain; ell(x, y - 1, 4, 2.5); ctx.fill();
      for (let k = 0; k < tb.count; k++) {
        const a = Math.PI * (0.25 + k * 0.5), px = x + Math.cos(a) * rx * 1.2, py = y + Math.sin(a) * ry * 1.6 - 8;
        const gh = S.ghosts.find((g) => g.table === tb.no && !g.gone && g.seat === k) || S.ghosts.filter((g) => g.table === tb.no && !g.gone)[k];
        ctx.fillStyle = gh ? gh.color : C.grey; ctx.globalAlpha = 0.75;
        ell(px, py, 5, 5); ctx.fill(); ctx.fillRect(px - 7, py + 3, 14, 7); ctx.globalAlpha = 1;
      }
      ctx.fillStyle = 'rgba(42,33,24,.8)'; ctx.font = '10px "Noto Serif SC", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      if (!L.short) ctx.fillText(`${tb.no} 桌 · ${tb.count}/${tb.cap}`, x, y + ry + 16);
    });
  }

  function drawTable(L, t) {
    const { cx, cy, rx, ry } = L;
    // 桌腿与阴影
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ell(cx, cy + ry * 1.1, rx * 1.05, ry * 0.8); ctx.fill();
    ctx.fillStyle = C.rim; ctx.fillRect(cx - 8, cy, 16, ry * 1.9);
    ctx.fillStyle = C.rim; ell(cx, cy + 6, rx + 5, ry + 5); ctx.fill();
    // 桌布
    const g = ctx.createRadialGradient(cx - rx * 0.3, cy - ry * 0.4, 4, cx, cy, rx); g.addColorStop(0, '#f6efe0'); g.addColorStop(1, C.clothShade);
    ctx.fillStyle = g; ell(cx, cy, rx, ry); ctx.fill();
    // 每个位子的茶盅与碟
    for (let slot = 0; slot < 4; slot++) {
      const p = slotPos(L, slot, 0.66), who = occupant(slot);
      const cup = who ? (who.kind === 'me' ? S.myCup : who.cup) : 0;
      // 碟
      ctx.fillStyle = C.porcelain; ell(p.x + (slot < 2 ? 14 : -14) * (p.back ? 0.7 : 1), p.y + 2, 12 * (p.back ? 0.8 : 1), 5 * (p.back ? 0.8 : 1)); ctx.fill();
      ctx.strokeStyle = C.blue; ctx.lineWidth = 1; ctx.stroke();
      if (who && who.kind === 'me' && S.myPlate > 0) { ctx.fillStyle = '#f3dcc5'; ell(p.x + 14, p.y, 5, 3.4); ctx.fill(); ctx.strokeStyle = '#d9a07a'; ctx.stroke(); }
      // 茶盅
      const r = (p.back ? 6.5 : 8.5);
      ctx.fillStyle = C.porcelain; ell(p.x, p.y + 3, r, r * 0.5); ctx.fill(); ctx.fillRect(p.x - r, p.y - 4, r * 2, 7); ell(p.x, p.y - 4, r, r * 0.5); ctx.fill();
      ctx.strokeStyle = C.blue; ctx.lineWidth = 1; ell(p.x, p.y - 4, r, r * 0.5); ctx.stroke();
      if (cup > 0.05) { ctx.fillStyle = C.tea; ell(p.x, p.y - 4, r * 0.8, r * 0.4); ctx.fill(); }
      if (cup > 0.6 && Math.sin(t * 2 + slot) > 0) drawSteam(p.x, p.y - 8, t + slot, 0.5);
    }
    // 茶壶（中偏后）与蒸笼（中偏左前）
    drawPot(L, t); drawSteamer(L, t);
    // 报纸：翻报的人手里
    for (let slot = 0; slot < 4; slot++) {
      const who = occupant(slot); if (!who) continue;
      const pose = who.kind === 'me' ? S.myPose : who.pose;
      if (pose === 'paper') drawPaper(L, slot, who, t);
    }
  }
  function occupant(slot) {
    if (slot === 0) return S.phase === 'seated' || S.myPose === 'sit' ? { kind: 'me' } : null;
    for (const g of othersHere()) if (slotOf(g.seat) === slot) return g;
    for (const r of S.residents) if (slotOf(r.seat) === slot) return r;
    return null;
  }
  function peopleAtTable() {
    const out = [];
    if (S.phase === 'seated') out.push({ kind: 'me', slot: 0, color: C.me, label: '你', fade: 1, pose: S.myPose, back: false });
    for (const g of othersHere()) out.push({ ...g, slot: slotOf(g.seat), back: slotOf(g.seat) === 1 || slotOf(g.seat) === 2 });
    for (const r of S.residents) out.push({ ...r, slot: slotOf(r.seat), back: slotOf(r.seat) === 1 || slotOf(r.seat) === 2 });
    for (const e of S.effects) if (e.kind === 'fade' && e.who) out.push({ ...e.who, slot: slotOf(e.who.seat), back: slotOf(e.who.seat) === 1 || slotOf(e.who.seat) === 2, fade: 1 - (S.tau - e.t0) / e.dur, leaving: true });
    return out;
  }

  function drawPot(L, t) {
    const x = L.cx + L.rx * 0.08, y = L.cy - L.ry * 0.25, r = 15;
    ctx.fillStyle = 'rgba(0,0,0,.12)'; ell(x, y + 10, r + 3, 6); ctx.fill();
    ctx.fillStyle = C.porcelain; ell(x, y, r, r * 0.95); ctx.fill();
    ctx.strokeStyle = C.blue; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(x, y + 2, r * 0.85, r * 0.35, 0, 0, Math.PI); ctx.stroke();
    ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x + r * 0.8, y - 2); ctx.quadraticCurveTo(x + r * 1.5, y - 10, x + r * 1.45, y - 16); ctx.stroke();
    ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x - r * 0.9, y - 2, 8, Math.PI * 0.6, Math.PI * 1.5); ctx.stroke();
    // 壶盖：揭开时搁在壶口边
    const lidOff = S.pot.lidOff, lx = lidOff ? x + r * 0.55 : x, ly = lidOff ? y - r * 0.55 : y - r * 0.9;
    ctx.fillStyle = C.porcelain; ell(lx, ly, r * 0.6, r * 0.28); ctx.fill(); ctx.strokeStyle = C.blue; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = C.blue; ell(lx, ly - 3, 2.5, 2); ctx.fill();
    if (lidOff) drawSteam(x, y - r, t, 0.9);
    // 水位示意：壶身一条淡淡的刻度
    ctx.fillStyle = 'rgba(184,118,42,.25)'; ctx.fillRect(x - r * 0.5, y + r * 0.6 - S.pot.level * r * 0.9, r, S.pot.level * r * 0.9);
  }
  function drawSteamer(L, t) {
    const x = L.cx - L.rx * 0.42, y = L.cy - L.ry * 0.05, r = 17;
    const e = S.effects.find((f) => f.kind === 'newsteamer'); const lift = e ? (1 - (t - e.t0) / e.dur) * 24 : 0;
    for (let k = 0; k < 2; k++) {
      const yy = y - k * 9 - (k === 1 ? lift : 0);
      ctx.fillStyle = C.bambooDark; ell(x, yy + 4, r, r * 0.45); ctx.fill();
      ctx.fillStyle = C.bamboo; ctx.fillRect(x - r, yy - 5, r * 2, 9); ell(x, yy - 5, r, r * 0.45); ctx.fill();
      ctx.strokeStyle = C.bambooDark; ctx.lineWidth = 1; ell(x, yy - 5, r, r * 0.45); ctx.stroke();
    }
    const top = y - 9 - lift;
    // 上层笼里的点心
    for (let i = 0; i < S.steamer.count; i++) { const a = i * 2.1 + 0.4; ctx.fillStyle = '#f3dcc5'; ell(x + Math.cos(a) * 7, top - 5 + Math.sin(a) * 3.5, 5, 3.4); ctx.fill(); ctx.strokeStyle = '#d9a07a'; ctx.stroke(); }
    if (S.steamer.count > 0) drawSteam(x, top - 10, t * 1.2, 0.8);
    if (S.steamer.count === 0) { ctx.fillStyle = 'rgba(42,33,24,.5)'; ctx.font = '10px serif'; ctx.textAlign = 'center'; ctx.fillText('空', x, top - 4); }
  }
  function drawSteam(x, y, t, k) {
    ctx.strokeStyle = C.steam; ctx.lineWidth = 1.2;
    for (let i = 0; i < 2; i++) {
      const ph = (t * 0.7 + i * 0.5) % 1, yy = y - ph * 22 * k, xx = x + Math.sin(t * 2 + i * 2) * 4 + (i - 0.5) * 6;
      ctx.globalAlpha = (1 - ph) * 0.8; ctx.beginPath(); ctx.moveTo(xx, yy + 8); ctx.quadraticCurveTo(xx + 3, yy + 3, xx - 2, yy); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function drawPaper(L, slot, who, t) {
    const p = slotPos(L, slot, 1.02), back = slot === 1 || slot === 2, w = back ? 30 : 42, h = back ? 22 : 30;
    const x = p.x - w / 2, y = p.y - (back ? 34 : 54);
    const e = S.effects.find((f) => f.kind === 'paper' && f.slot === slot), fl = e ? Math.sin((t - e.t0) / e.dur * Math.PI) : 0;
    ctx.fillStyle = C.paper; ctx.fillRect(x, y, w, h); ctx.strokeStyle = 'rgba(42,33,24,.4)'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
    ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); ctx.stroke();
    ctx.strokeStyle = C.paperInk; for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(x + 3, y + i * h / 5); ctx.lineTo(x + w / 2 - 3, y + i * h / 5); ctx.moveTo(x + w / 2 + 3, y + i * h / 5); ctx.lineTo(x + w - 3, y + i * h / 5); ctx.stroke(); }
    if (fl > 0) { ctx.fillStyle = '#f7f1e2'; ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2 + (w / 2) * (1 - fl), y + fl * 4); ctx.lineTo(x + w / 2 + (w / 2) * (1 - fl), y + h - fl * 4); ctx.lineTo(x + w / 2, y + h); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  }

  function drawPerson(L, p, t) {
    const pos = slotPos(L, p.slot, 1.34), back = p.back, sc = back ? 0.72 : 1;
    const alpha = Math.max(0, Math.min(1, p.fade)) * (p.kind === 'resident' ? 0.6 : p.kind === 'ghost' ? 0.78 : 1);
    ctx.globalAlpha = alpha;
    const headR = 13 * sc, bodyW = 38 * sc, bodyH = 30 * sc;
    const bob = p.pose === 'sip' ? -3 : p.pose === 'knock' ? 2 : p.pose === 'pour' ? -2 : 0;
    const x = pos.x, y = pos.y + bob;
    // 椅背
    ctx.fillStyle = C.rim; ctx.fillRect(x - bodyW / 2 - 3, y - bodyH * 0.1, bodyW + 6, 6 * sc);
    // 身体
    ctx.fillStyle = p.kind === 'me' ? p.color : p.color;
    ctx.beginPath(); ctx.moveTo(x - bodyW / 2, y + bodyH); ctx.lineTo(x - bodyW / 2, y + bodyH * 0.25); ctx.quadraticCurveTo(x, y - bodyH * 0.25, x + bodyW / 2, y + bodyH * 0.25); ctx.lineTo(x + bodyW / 2, y + bodyH); ctx.closePath(); ctx.fill();
    // 头
    ctx.fillStyle = p.kind === 'resident' ? C.grey : C.skin; ell(x, y - headR * 0.4, headR, headR * 1.05); ctx.fill();
    if (p.kind !== 'resident') { ctx.fillStyle = '#2a2118'; ell(x, y - headR * 1.05, headR * 0.95, headR * 0.55); ctx.fill(); }
    if (back && p.kind !== 'resident') { ctx.fillStyle = '#2a2118'; ell(x - headR * 0.35, y - headR * 0.4, 1.6, 2); ctx.fill(); ell(x + headR * 0.35, y - headR * 0.4, 1.6, 2); ctx.fill(); }
    // 手臂动作
    ctx.strokeStyle = p.kind === 'resident' ? C.grey : C.skin; ctx.lineWidth = 5 * sc; ctx.lineCap = 'round';
    const toward = back ? 1 : -1; // 朝桌子的方向（后排往下，前排往上）
    if (p.pose === 'pour' || p.pose === 'pick' || p.pose === 'knock' || p.pose === 'sip') {
      ctx.beginPath(); ctx.moveTo(x + bodyW * 0.3, y + bodyH * 0.45); ctx.lineTo(x + bodyW * 0.1, y + bodyH * 0.45 + toward * 22 * sc); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // 标签
    ctx.font = `${back ? 10.5 : 12}px "Noto Serif SC", serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const lab = p.label, lw = ctx.measureText(lab).width + 12, ly = back ? y - headR * 1.9 - 6 : y + bodyH + 16;
    ctx.globalAlpha = alpha; ctx.fillStyle = p.kind === 'resident' ? 'rgba(90,86,80,.75)' : 'rgba(42,33,24,.78)';
    ctx.fillRect(x - lw / 2, ly - 11, lw, 15);
    ctx.fillStyle = p.kind === 'me' ? '#ffd9c7' : p.kind === 'resident' ? '#e6e2db' : '#f3e6c8'; ctx.fillText(lab, x, ly);
    ctx.globalAlpha = 1;
  }

  function drawEffects(L, t) {
    for (const e of S.effects) {
      const k = (t - e.t0) / e.dur;
      if (e.kind === 'pour') {
        // 从壶到各杯的一道茶流，按顺序一杯接一杯
        const pot = { x: L.cx + L.rx * 0.08, y: L.cy - L.ry * 0.25 - 16 };
        const order = [e.from, (e.from + 1) % 4, (e.from + 2) % 4, (e.from + 3) % 4];
        const idx = Math.min(3, Math.floor(k * 4)), target = slotPos(L, order[idx], 0.66);
        ctx.strokeStyle = C.tea; ctx.lineWidth = 2.2; ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.moveTo(pot.x + 14, pot.y); ctx.quadraticCurveTo((pot.x + target.x) / 2, Math.min(pot.y, target.y) - 24, target.x, target.y - 6); ctx.stroke();
        ctx.globalAlpha = 1; drawSteam(target.x, target.y - 10, t, 0.6);
      } else if (e.kind === 'knock') {
        const p = slotPos(L, e.slot, 0.66), n = k < 0.5 ? 1 : 2;
        ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5;
        for (let i = 0; i < n; i++) { ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.arc(p.x + 14, p.y + 4, 5 + i * 5 + k * 6, 0, Math.PI * 2); ctx.stroke(); }
        ctx.globalAlpha = 1;
        // 两根手指
        ctx.strokeStyle = C.skin; ctx.lineWidth = 3; ctx.lineCap = 'round'; const dy = (k % 0.5) < 0.25 ? -4 : 0;
        ctx.beginPath(); ctx.moveTo(p.x + 12, p.y + 14 + dy); ctx.lineTo(p.x + 14, p.y + 6 + dy); ctx.moveTo(p.x + 17, p.y + 14 + dy); ctx.lineTo(p.x + 18, p.y + 6 + dy); ctx.stroke();
      } else if (e.kind === 'pick') {
        const from = { x: L.cx - L.rx * 0.42, y: L.cy - L.ry * 0.05 - 14 }, to = slotPos(L, e.slot, 0.66);
        const x = from.x + (to.x + 14 - from.x) * k, y = from.y + (to.y - from.y) * k - Math.sin(k * Math.PI) * 18;
        ctx.strokeStyle = C.bambooDark; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - 3, y + 2); ctx.lineTo(x - 10, y + 28); ctx.moveTo(x + 3, y + 2); ctx.lineTo(x - 4, y + 28); ctx.stroke();
        ctx.fillStyle = '#f3dcc5'; ell(x, y + 2, 5, 3.4); ctx.fill(); ctx.strokeStyle = '#d9a07a'; ctx.stroke();
      } else if (e.kind === 'refill') {
        const x = L.cx + L.rx * 0.08, y = L.cy - L.ry * 0.25 - 16;
        ctx.strokeStyle = 'rgba(180,210,230,.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y - 40); ctx.lineTo(x, y + 2); ctx.stroke(); drawSteam(x, y - 10, t, 1.2);
      } else if (e.kind === 'shake') {
        // 壶空了：壶身晃两下的提示
        const x = L.cx + L.rx * 0.08, y = L.cy - L.ry * 0.25;
        ctx.fillStyle = 'rgba(42,33,24,.7)'; ctx.font = '11px serif'; ctx.textAlign = 'center'; ctx.fillText('空', x, y - 24);
      } else if (e.kind === 'sitdown' || e.kind === 'reenter') {
        ctx.fillStyle = `rgba(58,40,23,${(1 - k) * 0.35})`; ctx.fillRect(0, 0, W, H);
      }
    }
  }
  function drawDoorVeil(L, t) {
    // 站在门口：近桌压暗一点，指示你的桌
    ctx.fillStyle = 'rgba(58,40,23,.18)'; ctx.fillRect(0, L.horizon, W, H - L.horizon);
    const p = slotPos(L, 0, 1.34), bob = Math.sin(t * 3) * 3;
    ctx.fillStyle = C.me; ctx.beginPath(); ctx.moveTo(p.x, p.y - 30 + bob); ctx.lineTo(p.x - 7, p.y - 44 + bob); ctx.lineTo(p.x + 7, p.y - 44 + bob); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f3e6c8'; ctx.font = '12px "Noto Serif SC", serif'; ctx.textAlign = 'center'; ctx.fillText('你的位', p.x, p.y - 50 + bob);
  }

  // ---------- 主循环 ----------
  function frame(now) {
    if (!lastFrame) lastFrame = now;
    const dt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now;
    if (!paused) tick(dt);
    draw(); frameStamp++;
    requestAnimationFrame(frame);
  }

  // ---------- 输入 ----------
  buttons.forEach((b) => b.addEventListener('click', () => { audio(); act(+b.dataset.act); }));
  muteBtn.addEventListener('click', () => { audio(); setMuted(!muted); });
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const map = { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 6 };
    if (e.key in map) { audio(); act(map[e.key]); e.preventDefault(); }
    else if (e.key === 'm' || e.key === 'M') setMuted(!muted);
  });
  canvas.addEventListener('pointerdown', () => { audio(); if (S.phase === 'door') act(0); });
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { if (document.hidden) lastFrame = 0; });

  // ---------- 钩子 ----------
  function snapshot() {
    return {
      phase: S.phase, tau: +S.tau.toFixed(2), me: S.me, tables: D.tableList(S.hall),
      others: othersHere().map((g) => ({ id: g.id, table: g.table, seat: g.seat, pose: g.pose })),
      residents: S.residents.map((r) => ({ seat: r.seat, pose: r.pose })),
      pot: { ...S.pot }, myCup: S.myCup, myPlate: S.myPlate, myPage: S.myPage, steamer: S.steamer.count,
      knockOpen: S.tau <= S.knockUntil, lastSound: S.lastSound, effects: S.effects.map((e) => e.kind), visits: visits.length,
      hint: hintEl.textContent, where: whereEl.textContent, hallText: hallEl.textContent, frameStamp,
    };
  }
  window.__datai = {
    get ready() { return !!S; }, act, snapshot, canAct, get state() { return S; }, get visits() { return visits; }, get frameStamp() { return frameStamp; },
    pause(p) { paused = p; }, step(ms) { tick(ms / 1000); draw(); frameStamp++; },
  };
  window.__PLAYTEST__ = {
    get ready() { return !!S; }, snapshot,
    reset() { visits = loadVisits(); rngState = D.rng(seed); enterHall(); },
    setSeed(n) { seed = n >>> 0; rngState = D.rng(seed); },
    step(ms) { paused = true; tick(ms / 1000); draw(); frameStamp++; },
  };

  // ---------- 启动 ----------
  resize();
  visits = loadVisits();
  enterHall();
  if (FIXED) {
    if (Q.get('door') !== '1') act(0);
    const t = +Q.get('t');
    if (t > 0) { const steps = Math.ceil(t / 0.05); for (let i = 0; i < steps; i++) tick(t / steps); paused = true; }
  }
  updateBars();
  requestAnimationFrame(frame);
})();
