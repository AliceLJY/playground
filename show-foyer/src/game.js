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
  const SHOW = { name: '英歌', troupe: '广州歌舞剧院', kind: '舞剧' };   // 换戏只改这里（真实公开信息，见 README「关于这出戏」）
  const C = {
    me: '#e0b25a', ghost: ['#d9534f', '#5b9bd5', '#7cb342', '#f0a830', '#9b6bd1', '#e37fb0', '#4db6ac', '#c98a3a', '#8aa4d1', '#c9c35a', '#d17a8a', '#6fb0a0'],
    resident: '#8a8a8a', skin: '#f5d9b8', seat: 'rgba(155,45,32,.55)', seatTaken: 'rgba(155,45,32,.32)', seatLine: 'rgba(224,178,90,.35)',
  };

  const cv = document.getElementById('scene'), ctx = cv.getContext('2d');
  const el = (id) => document.getElementById(id);
  const hallTag = el('hallTag'), countEl = el('count'), cdEl = el('countdown'), gongEl = el('nextGong'), hintEl = el('hint'), bar = el('bar');
  let W = 390, H = 500, DPR = 1;
  let paused = false, lastFrame = 0, frameStamp = 0;
  let muted = Q.get('mute') === '1';
  try { muted = muted || (!FIXED && localStorage.getItem('show-foyer-muted') === '1'); } catch (e) {}
  let visits = [];
  let S = null;                 // 当前场面
  let audio = null;
  const TZ = new Date().getTimezoneOffset() * 60000;
  let rngState = D.rng(seed); const rand = () => rngState();

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

  // ---------- 进厅：排幽灵、补灰影、排幕后动静 ----------
  function makeResident(i, seatNo, hall) {
    return { id: 'r' + i, kind: 'resident', seat: seatNo, hall, color: C.resident, label: '身影 · 非真人', pose: 'idle', poseUntil: 0, bubble: null, glow: 0, sched: D.residentSchedule(seed, i), prev: -1, here: true, gone: false };
  }
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
    const prefer = [D.COLS * (D.ROWS - 1), D.COLS * D.ROWS - 1, D.COLS * (D.ROWS - 1) + 1, D.COLS * (D.ROWS - 1) + 2, D.COLS * (D.ROWS - 2), D.COLS * (D.ROWS - 1) - 1];
    for (let i = 0; i < D.residentsFor(othersHere); i++) {
      let s = prefer.find((p) => !taken.has(p) && p !== plan.me.seat);
      if (s === undefined) { for (let k = D.CAP - 1; k >= 0; k--) if (!taken.has(k) && k !== plan.me.seat) { s = k; break; } }
      if (s === undefined) break;
      taken.add(s); residents.push(makeResident(i, s, plan.me.hall));
    }
    S = {
      t: 0, tau: 0, phase: 'door', seatT: 0, enterMs: now, curtain: D.curtainAt(now), house: plan.house, me: plan.me, ghosts, residents,
      mePose: 'idle', mePoseUntil: 0, meBubble: null, meGlow: 0, lamps: [], claps: 0, teas: 0, snaps: [], effects: [], lastSound: null, visit: null,
      lastClockMs: now, gongFlash: 0, gongCount: 0, bells: [], light: 1, backstage: D.backstageSchedule(seed), bsPrev: -1, lastBackstage: null,
      curtainSway: -9, curtainOpen: -1, flash: -9, shows: (S ? S.shows : 0),
    };
    for (const g of ghosts) for (const a of g.acts) if (a[1] === 1 && g.hall === plan.me.hall) { S.lamps.push({ by: g.id, t: -1 }); g.lamp = true; break; }
    if (T0 !== null) { paused = true; tick(T0, true); }
    updateTop(); hint('开演前请随意落座，点一个空位也行');
  }
  function nextShow() {   // 等下一场：重新进厅，开演时刻重排
    hide('curtainOverlay'); hide('programmeOverlay'); hide('photoOverlay');
    const shows = (S && S.shows) || 0; enterHall(); S.shows = shows + 1;
  }

  // ---------- 场面人物 ----------
  function hereOthers() { return [...S.ghosts.filter((g) => g.hall === S.me.hall && g.here && !g.gone), ...S.residents]; }
  function humansHere() { return (S.phase === 'door' ? 0 : 1) + S.ghosts.filter((g) => g.hall === S.me.hall && g.here && !g.gone).length; }
  function occupant(seatNo) {
    if (S.phase !== 'door' && S.me.seat === seatNo) return { kind: 'me' };
    return hereOthers().find((o) => o.seat === seatNo) || null;
  }
  function neighbors() {
    if (S.phase !== 'seated') return [];
    return S.ghosts.filter((g) => g.hall === S.me.hall && g.here && !g.gone && D.adjacent(S.me.seat, g.seat));
  }
  function pose(o, p, dur) { o.pose = p; o.poseUntil = S.t + (dur || 1.2); }
  function bubble(o, text) { o.bubble = { text, t: S.t }; }
  const me = () => ({ get pose() { return S.mePose; }, set pose(v) { S.mePose = v; }, get poseUntil() { return S.mePoseUntil; }, set poseUntil(v) { S.mePoseUntil = v; }, set bubble(v) { S.meBubble = v; }, get bubble() { return S.meBubble; } });
  function seatName(i) { const N = ['一', '二', '三', '四', '五', '六']; return N[Math.floor(i / D.COLS)] + '排' + N[i % D.COLS] + '座'; }

  // ---------- 观众的动作：五个按钮 + 点戏台拍照 ----------
  function canAct(code) {
    if (!S) return false;
    if (S.phase === 'curtain') return false;
    if (code === 0) return S.phase === 'door';
    if (code === 4) return S.phase === 'seated';
    if (code === 3) return S.phase === 'seated' && neighbors().length > 0;
    return S.phase === 'seated';
  }
  function act(code, seatNo) {
    if (!canAct(code)) {
      if (S && S.phase === 'curtain') hint('已经开演了，等下一场再来');
      else if (code === 3 && S.phase === 'seated') hint('邻座还没来，茶先温着');
      else if (code !== 0 && S.phase !== 'seated') hint('先落座');
      return false;
    }
    unlockAudio();
    if (code === 0) {
      if (seatNo !== undefined && !occupant(seatNo)) {
        D.leave(S.house, 'me'); const guests = S.house.halls.get(S.me.hall) || (S.house.halls.set(S.me.hall, new Map()), S.house.halls.get(S.me.hall)); guests.set('me', seatNo); S.me = { hall: S.me.hall, seat: seatNo };
      }
      S.phase = 'seated'; S.seatT = S.t; S.visit = D.newVisit(Date.now()); D.recordAct(S.visit, 0, 0);
      S.meGlow = S.t; S.lastSound = 'sit'; sfx.sit(); hint('已落座 · ' + seatName(S.me.seat) + '，点戏台可以拍照，台口有节目单'); updateTop(); frameStamp++; return true;
    }
    const tau = S.t - S.seatT;
    if (code === 1) { S.lamps.push({ by: 'me', t: S.t }); pose(me(), 'lamp', 1.4); bubble(me(), '🏮'); S.lastSound = 'lamp'; sfx.lamp(); D.recordAct(S.visit, tau, 1); hint('台前多了一盏灯'); }
    if (code === 2) { S.claps++; pose(me(), 'clap', 1.0); bubble(me(), '👏'); S.effects.push({ kind: 'ripple', seat: S.me.seat, t: S.t }); S.lastSound = 'clap'; sfx.clap(); D.recordAct(S.visit, tau, 2); }
    if (code === 3) {
      const ns = neighbors(); const to = ns[Math.floor(rand() * ns.length)];
      S.teas++; S.effects.push({ kind: 'tea', from: S.me.seat, to: to.seat, t: S.t }); setTimeout(() => { if (S) { bubble(to, '🍵'); pose(to, 'nod', 1.2); } }, 900);
      S.lastSound = 'tea'; sfx.tea(); D.recordAct(S.visit, tau, 3); hint('给 ' + to.label + ' 递了一杯茶');
    }
    if (code === 5) { snap('me', S.me.seat); D.recordAct(S.visit, tau, 5); hint('拍了一张舞台，开演后就不能拍了'); }
    if (code === 4) {
      D.recordAct(S.visit, tau, 4); D.closeVisit(S.visit, tau);
      visits = D.pushVisit(visits, S.visit); saveVisits();
      S.lastSound = 'leave'; sfx.leave(); S.phase = 'door'; S.visit = null;
      hint('这一趟记下了，下次进门你就坐在厅里');
      setTimeout(() => { if (S && S.phase === 'door') enterHall(); }, 1400);   // 按新历史重排：你会看到「你 · 刚才」
    }
    updateTop(); frameStamp++; return true;
  }
  function snap(by, seatNo) {
    S.flash = S.t; S.snaps.push({ by, seat: seatNo, t: S.t }); S.lastSound = 'shutter'; sfx.shutter(by === 'me' ? 1 : 0.4);
  }

  // ---------- 整点锣、三遍铃、开演 ----------
  function gong(auto) {
    S.gongCount++; S.gongFlash = S.t; S.lastSound = 'gong'; sfx.gong();
    el('gongTitle').textContent = auto ? '整点 · 一声锣' : '锣 · 试听';
    const cd = D.countdown(S.lastClockMs, S.curtain);
    el('gongText').textContent = (cd.left > 0 ? '离开演还有 ' + cd.text + '。' : '已经开演。') + ' 台前 ' + S.lamps.length + ' 盏灯，厅里 ' + humansHere() + ' 人。';
    show('gongOverlay');
    let k = 0;
    for (const g of S.ghosts) if (g.hall === S.me.hall && g.here && !g.gone && g.claps) { k++; setTimeout(() => { if (S) { pose(g, 'clap', 1.0); bubble(g, '👏'); S.effects.push({ kind: 'ripple', seat: g.seat, t: S.t }); } }, 600 + k * 180); }
    updateTop();
  }
  function bell(n) {
    S.bells.push(n); S.lastSound = 'bell' + n; sfx.bell(n);
    for (const o of hereOthers()) pose(o, 'look', 2.2);
    if (n === 1) hint('一铃 · 演出将在三分钟后开始，请将手机调至静音');
    if (n === 2) hint('二铃 · 还有一分钟，场灯渐暗，请回到座位');
    if (n === 3) { hint('三铃 · 开演'); curtainUp(); }
  }
  function curtainUp() {
    if (S.phase === 'seated' && S.visit) { const tau = S.t - S.seatT; D.closeVisit(S.visit, tau); visits = D.pushVisit(visits, S.visit); saveVisits(); S.visit = null; }
    S.phase = 'curtain'; S.curtainOpen = S.t; S.lastSound = 'curtain'; sfx.curtain();
    for (const g of S.ghosts) if (g.hall === S.me.hall && g.here && !g.gone && g.claps) { pose(g, 'clap', 1.6); bubble(g, '👏'); }
    el('curtainText').textContent = '《' + SHOW.name + '》开演。候场这一会儿，台前点了 ' + S.lamps.length + ' 盏灯，' + humansHere() + ' 人在场，拍了 ' + S.snaps.length + ' 张舞台。接下来的一个半小时不在这里，请收好手机。';
    setTimeout(() => { if (S && S.phase === 'curtain') show('curtainOverlay'); }, 2600);
    updateTop();
  }

  // ---------- 每帧 ----------
  function tick(dt, jump) {
    if (!S) return;
    const prevMs = S.lastClockMs;
    const nowMs = FIXED ? S.enterMs + Math.round((S.t + dt) * 1000) : Date.now();
    if (!FIXED && D.gongCrossed(prevMs, nowMs, TZ)) gong(true);
    S.lastClockMs = nowMs;
    S.t += dt; S.tau = S.t;
    // 三遍铃（固定机位也按时间线响，定格截图能看到场灯暗）
    for (const n of D.bellsDue(prevMs, nowMs, S.curtain)) if (!S.bells.includes(n)) bell(n);
    S.light = D.houseLight(nowMs, S.curtain);
    // 幕后动静
    if (S.phase !== 'curtain') {
      for (const e of D.backstageDue(S.backstage, S.bsPrev, S.tau)) {
        S.lastBackstage = e[1];
        if (e[1] === 'drum') { if (!jump) sfx.drum(); for (const o of hereOthers()) if (rand() < 0.7) pose(o, 'look', 2.0); }
        if (e[1] === 'tune') { if (!jump) sfx.tune(); for (const o of hereOthers()) if (rand() < 0.4) pose(o, 'look', 1.6); }
        if (e[1] === 'curtain') { S.curtainSway = S.t; if (!jump) sfx.rustle(); for (const o of hereOthers()) pose(o, 'look', 2.4); if (S.phase === 'seated') hint('幕布动了一下'); }
      }
      S.bsPrev = S.tau;
    }
    // 回放的别人
    for (const g of S.ghosts) {
      if (g.hall !== S.me.hall || g.gone) continue;
      if (S.tau >= g.end && S.phase !== 'curtain') { g.gone = true; g.here = false; D.leave(S.house, g.id); if (!jump) { S.lastSound = 'leave'; sfx.leave(0.4); } continue; }
      for (const a of D.dueActs(g.acts, g.prev, S.tau)) {
        if (a[1] === 1) { if (!g.lamp) { S.lamps.push({ by: g.id, t: S.t }); g.lamp = true; } pose(g, 'lamp', 1.4); bubble(g, '🏮'); if (!jump) sfx.lamp(0.5); }
        if (a[1] === 2) { pose(g, 'clap', 1.0); bubble(g, '👏'); S.effects.push({ kind: 'ripple', seat: g.seat, t: S.t }); if (!jump) sfx.clap(0.5); }
        if (a[1] === 3) { const ns = hereOthers().filter((o) => o !== g && D.adjacent(g.seat, o.seat)); const tgt = S.phase === 'seated' && D.adjacent(g.seat, S.me.seat) ? { seat: S.me.seat, kind: 'me' } : ns[0]; if (tgt) { S.effects.push({ kind: 'tea', from: g.seat, to: tgt.seat, t: S.t }); if (tgt.kind === 'me') hint(g.label + ' 给你递了一杯茶'); } }
        if (a[1] === 5 && S.phase !== 'curtain') { if (!jump) snap(g.id, g.seat); else S.snaps.push({ by: g.id, seat: g.seat, t: S.t }); pose(g, 'snap', 1.2); }
      }
      g.prev = S.tau;
    }
    // 灰影照日程
    for (const r of S.residents) {
      const period = r.sched.period, cyc = Math.floor(S.tau / period), local = S.tau - cyc * period, prevLocal = r.prev < 0 ? -1 : r.prev - Math.floor(r.prev / period) * period;
      const due = prevLocal > local ? [...D.dueActs(r.sched.acts, prevLocal, period), ...D.dueActs(r.sched.acts, -1, local)] : D.dueActs(r.sched.acts, prevLocal, local);
      for (const a of due) pose(r, a[1] === 6 ? 'look' : 'shift', 1.6);
      r.prev = S.tau;
    }
    for (const o of [...S.ghosts, ...S.residents]) if (o.pose !== 'idle' && S.t > o.poseUntil) o.pose = 'idle';
    if (S.mePose !== 'idle' && S.t > S.mePoseUntil) S.mePose = 'idle';
    S.effects = S.effects.filter((e) => S.t - e.t < (e.kind === 'tea' ? 1.4 : 1.0));
    if (S.phase === 'seated' && !S.ghosts.some((g) => g.hall === S.me.hall && g.here && !g.gone) && S.residents.length < D.RESIDENTS && !jump) {
      const have = S.residents.length; const n = D.residentsFor(0) - have;
      for (let i = 0; i < n; i++) { let s = D.CAP - 1 - i; while (s >= 0 && (occupant(s) || s === S.me.seat)) s--; if (s < 0) break; S.residents.push(makeResident(have + i, s, S.me.hall)); }
    }
    frameStamp++;
    if (!jump && Math.floor(S.t * 2) !== Math.floor((S.t - dt) * 2)) updateTop();
  }

  // ---------- 顶栏与提示 ----------
  function updateTop() {
    if (!S) return;
    hallTag.textContent = S.phase === 'door' ? '入门 · 第 ' + S.me.hall + ' 厅有位' : '第 ' + S.me.hall + ' 厅';
    countEl.textContent = humansHere() + ' / ' + D.CAP;
    cdEl.textContent = S.phase === 'curtain' ? '开演' : D.countdown(S.lastClockMs, S.curtain).text;
    const ng = new Date(D.nextGong(S.lastClockMs, TZ)); gongEl.textContent = String(ng.getHours()).padStart(2, '0') + ':00';
    for (const b of bar.querySelectorAll('button[data-act]')) { const c = Number(b.dataset.act); b.disabled = !canAct(c); b.classList.toggle('hot', c === 0 && S.phase === 'door'); }
    el('btnSit').textContent = S.phase === 'door' ? '落座' : '已落座';
  }
  let hintTimer = 0;
  function hint(text) { if (!text) { hintEl.classList.remove('show'); return; } hintEl.textContent = text; hintEl.classList.add('show'); clearTimeout(hintTimer); hintTimer = setTimeout(() => hintEl.classList.remove('show'), 2600); }
  function show(id) { el(id).classList.add('show'); }
  function hide(id) { el(id).classList.remove('show'); }

  // ---------- 节目单 ----------
  let page = 0;
  function programmePages() {
    const others = S.ghosts.filter((g) => g.hall === S.me.hall && g.here && !g.gone).map((g) => g.label);
    return [
      { h: '节目单', b: '<p class="big">' + SHOW.kind + '《' + SHOW.name + '》</p><p>' + SHOW.troupe + '</p><p class="small">候场厅 · 第 ' + S.me.hall + ' 厅 · 开演前</p><p class="small">剧目名与演出单位取自公开报道，是真实信息；这个候场厅是个人做着玩的小玩意，不是剧院或剧目的官方页面，不售票、不联网。以后有新戏上演，戏名会跟着换。</p>' },
      { h: '这出戏', b: '<p>据公开报道，' + SHOW.kind + '《' + SHOW.name + '》由' + SHOW.troupe + '创排演出，以岭南民俗舞蹈英歌为载体，把传统英歌舞和木雕、嵌瓷、潮绣、铁枝木偶、潮州油纸灯笼这些非遗元素揉进现代舞台，讲的是民族危难之际同仇敌忾、舍家卫国的家国情怀。近年在各地巡演，二〇二六年八月在北京天桥剧场参加第七届全国少数民族文艺会演。</p>' },
      { h: '英歌是什么', b: '<p>英歌是流行于广东潮汕一带的民间广场舞蹈，舞者扮作水浒人物，脸上勾画脸谱，双手各持一根短槌，边击槌边行进起舞，配以大鼓和锣钹，阵势很大。二〇〇六年，英歌（普宁英歌、潮阳英歌）列入第一批国家级非物质文化遗产名录。</p><p class="small">候场时如果听见幕后有鼓点，那是在热身。</p>' },
      { h: '观演小贴士', b: '<p>开演前有三遍铃：一铃在开演前三分钟，二铃在前一分钟，三铃就开演，场灯会跟着渐暗。</p><p>候场时拍舞台随意，开演后请把手机收好，不拍照不录像。</p><p>迟到请在换场的间隙入场。</p><p class="small">这里一场候场是五分钟：真剧场的半小时，压成了五分钟。</p>' },
      { h: '今晚谁来过', b: '<p>第 ' + S.me.hall + ' 厅 · 在场 ' + humansHere() + ' 人 · 点灯 ' + S.lamps.length + ' 盏 · 掌声 ' + S.claps + ' 次 · 递茶 ' + S.teas + ' 杯 · 拍舞台 ' + S.snaps.length + ' 张</p><p>' + ([S.phase === 'door' ? null : '我', ...others].filter(Boolean).join('　') || '还没有人落座') + '</p><p class="small">带「你」的是你自己前几次来的回放，灰色身影不计。</p><p><button class="close" id="progPhoto">生成合影图</button></p>' },
    ];
  }
  function openProgramme(p) { page = p || 0; renderProgramme(); show('programmeOverlay'); unlockAudio(); sfx.page(); }
  function renderProgramme() {
    const pages = programmePages(); page = Math.max(0, Math.min(pages.length - 1, page));
    el('progTitle').textContent = pages[page].h; el('progBody').innerHTML = pages[page].b; el('progNo').textContent = (page + 1) + ' / ' + pages.length;
    el('progPrev').disabled = page === 0; el('progNext').disabled = page === pages.length - 1;
    const pb = el('progPhoto'); if (pb) pb.addEventListener('click', () => { hide('programmeOverlay'); photo(); });
  }
  function flip(d) { page += d; renderProgramme(); sfx.page(); }

  // ---------- 声音：全部 Web Audio 合成，首次触碰后才建 ----------
  function unlockAudio() { if (muted) return; if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audio = null; } } if (audio && audio.state === 'suspended') audio.resume(); }
  function tone(o) {
    if (muted || !audio) return; const t = audio.currentTime + (o.delay || 0); const osc = audio.createOscillator(), g = audio.createGain();
    osc.type = o.wave || 'sine'; const jit = o.exact ? 1 : 1 + (rand() - 0.5) * 0.12; osc.frequency.setValueAtTime(o.f0 * jit, t); if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1 * jit, t + o.dur);
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
    shutter(v) { const vol = v || 1; noise({ type: 'highpass', f0: 2500, dur: 0.03, vol: 0.5 * vol, curve: 1 }); noise({ f0: 1200, q: 4, dur: 0.05, vol: 0.3 * vol, delay: 0.06 }); },
    bell(n) { for (let i = 0; i < n; i++) { tone({ f0: 1760, dur: 0.9, vol: 0.18, exact: true, delay: i * 0.45 }); tone({ f0: 1760 * 2.4, dur: 0.5, vol: 0.06, exact: true, delay: i * 0.45 }); } },
    drum() { const pat = [0, 0.22, 0.44, 0.55, 0.66, 0.99]; pat.forEach((d, i) => { noise({ type: 'lowpass', f0: 140, dur: 0.18, vol: 0.5 * (i % 3 === 0 ? 1 : 0.6), curve: 3, delay: d }); tone({ f0: 90, f1: 52, dur: 0.22, vol: 0.2, wave: 'sine', exact: true, delay: d }); }); },
    tune() { tone({ f0: 440, f1: 660, dur: 1.4, vol: 0.07, exact: true }); tone({ f0: 659, f1: 440, dur: 1.1, vol: 0.05, exact: true, delay: 0.6 }); },
    rustle() { noise({ type: 'highpass', f0: 900, dur: 0.6, vol: 0.18, curve: 1.5 }); noise({ type: 'highpass', f0: 700, dur: 0.5, vol: 0.12, curve: 1.5, delay: 0.5 }); },
    curtain() { noise({ type: 'bandpass', f0: 500, q: 0.6, dur: 2.4, vol: 0.25, curve: 1.2 }); tone({ f0: 196, dur: 2.6, vol: 0.12, exact: true, attack: 0.6 }); tone({ f0: 294, dur: 2.4, vol: 0.08, exact: true, attack: 0.8, delay: 0.3 }); },
    page() { noise({ type: 'highpass', f0: 1500, dur: 0.12, vol: 0.25, curve: 1.6 }); },
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
    const book = { x: 8, y: stageH * 0.72 + (short ? 4 : 8), w: short ? 26 : 34, h: short ? 18 : 24 };   // 台口左侧的节目单
    return { stageH, top, bottom, left, right, seatW, seatH, ps, short, book };
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
  function drawStage(g) {
    const sh = g.stageH, curtainH = sh * 0.72;
    const open = S.curtainOpen >= 0 ? Math.min(1, (S.t - S.curtainOpen) / 2.6) : 0;        // 幕布拉开进度
    const ease = open < 0.5 ? 2 * open * open : -1 + (4 - 2 * open) * open;
    // 幕后：拉开后露出暖光与英歌阵列的剪影
    ctx.fillStyle = '#2a1008'; ctx.fillRect(0, 0, W, curtainH);
    if (open > 0) {
      const lg = ctx.createRadialGradient(W / 2, curtainH * 0.9, 10, W / 2, curtainH * 0.9, W * 0.7); lg.addColorStop(0, 'rgba(247,200,110,' + (0.55 * ease) + ')'); lg.addColorStop(1, 'rgba(120,40,20,0)');
      ctx.fillStyle = lg; ctx.fillRect(0, 0, W, curtainH);
      ctx.fillStyle = 'rgba(20,8,4,' + (0.9 * ease) + ')';
      const n = 7, base = curtainH * 0.92, hgt = Math.min(44, curtainH * 0.42);
      for (let i = 0; i < n; i++) { const x = W * (0.14 + 0.72 * i / (n - 1)), lift = Math.sin(S.t * 6 + i) * 3 * ease; ctx.beginPath(); ctx.arc(x, base - hgt * 0.78 + lift, hgt * 0.14, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(x - hgt * 0.16, base - hgt * 0.62 + lift, hgt * 0.32, hgt * 0.62); ctx.save(); ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(247,220,154,' + (0.9 * ease) + ')'; ctx.beginPath(); ctx.moveTo(x - hgt * 0.16, base - hgt * 0.5 + lift); ctx.lineTo(x - hgt * 0.36, base - hgt * 0.95 + lift); ctx.moveTo(x + hgt * 0.16, base - hgt * 0.5 + lift); ctx.lineTo(x + hgt * 0.36, base - hgt * 0.95 + lift); ctx.stroke(); ctx.restore(); }
    }
    // 两片帷幕，拉开时各自向两侧收，褶皱保留；被碰时轻晃
    const sway = S.t - S.curtainSway < 1.6 ? Math.sin((S.t - S.curtainSway) * 9) * 4 * (1 - (S.t - S.curtainSway) / 1.6) : 0;
    const half = W / 2, slide = ease * (half - 22);
    for (const side of [-1, 1]) {
      ctx.save(); ctx.translate(side < 0 ? -slide : slide, 0);
      const x0 = side < 0 ? 0 : half;
      for (let x = x0; x < x0 + half; x += 18) { const k = ((x - x0) / 18) % 2; ctx.fillStyle = k ? '#7a2a1e' : '#6a241a'; ctx.fillRect(x, 0, 18, curtainH + (k ? sway : -sway) * 0.5); }
      ctx.restore();
    }
    ctx.fillStyle = '#5a1f16'; ctx.fillRect(0, 0, W, 14);                                   // 台口横楣
    ctx.fillStyle = '#c9a24a'; ctx.fillRect(0, curtainH - 3, W, 5);
    const tg = ctx.createLinearGradient(0, curtainH, 0, sh + 20); tg.addColorStop(0, '#4a331f'); tg.addColorStop(1, '#2e2014'); ctx.fillStyle = tg; ctx.fillRect(0, curtainH, W, sh * 0.28 + 20);
    ctx.textAlign = 'center'; ctx.fillStyle = '#f7dc9a'; ctx.font = '600 15px "PingFang SC","Hiragino Sans GB",sans-serif';
    if (open < 0.3) { ctx.globalAlpha = 1 - open / 0.3; ctx.fillText('戏 台', W / 2, curtainH - (g.short ? 8 : 14)); ctx.globalAlpha = 1; }
    ctx.font = '500 12px sans-serif'; ctx.fillStyle = 'rgba(247,220,154,.75)'; ctx.fillText(SHOW.troupe + ' · 《' + SHOW.name + '》', W / 2, curtainH + 26);
    lantern(26, g.short ? 16 : 24, 1, g.short ? 0.7 : 1); lantern(W - 26, g.short ? 16 : 24, 1, g.short ? 0.7 : 1);
    S.lamps.forEach((l, i) => { const a = l.t < 0 ? 1 : Math.min(1, (S.t - l.t) / 0.6); const col = i % 7, row = Math.floor(i / 7) % 3; lantern(48 + (W - 96) * col / 6, (g.short ? 30 : 56) + row * (g.short ? 14 : 22), a, g.short ? 0.6 : 0.9); });
    // 台口左侧的节目单（可点）
    const b = g.book; ctx.save(); ctx.translate(b.x, b.y); ctx.fillStyle = '#efe6d2'; roundRect(0, 0, b.w, b.h, 2); ctx.fill(); ctx.fillStyle = '#9b2d20'; ctx.fillRect(0, 0, 4, b.h); ctx.fillStyle = '#2a1e16'; ctx.font = (g.short ? 7 : 9) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('节目单', b.w / 2 + 2, b.h / 2 + 3); ctx.restore();
    ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(243,233,214,.55)'; ctx.font = '11px sans-serif'; ctx.fillText('台前灯 ' + S.lamps.length + ' 盏', 10, sh + 16);
    ctx.textAlign = 'right'; ctx.fillText('第 ' + S.me.hall + ' 厅 · ' + humansHere() + ' 人', W - 10, sh + 16);
  }
  function draw() {
    if (!S) return;
    const g = geom();
    const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#2a1e16'); bg.addColorStop(1, '#1a120d'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.03)'; for (let y = g.stageH + 20; y < H; y += 14) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    drawStage(g);
    for (let i = 0; i < D.CAP; i++) {
      const p = seatPos(i, g), o = occupant(i);
      ctx.fillStyle = o ? C.seatTaken : C.seat; ctx.strokeStyle = C.seatLine; ctx.lineWidth = 1;
      roundRect(p.x - g.seatW / 2, p.y - 6, g.seatW, g.seatH, 5); ctx.fill(); ctx.stroke();
      if (!o) { ctx.fillStyle = 'rgba(243,233,214,.25)'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('空', p.x, p.y + 9); }
    }
    const people = [];
    for (const o of hereOthers()) people.push({ o, p: seatPos(o.seat, g) });
    if (S.phase !== 'door') people.push({ o: { kind: 'me', color: C.me, label: '我', pose: S.mePose, bubble: S.meBubble, glow: S.meGlow }, p: seatPos(S.me.seat, g) });
    else people.push({ o: { kind: 'me', color: C.me, label: '我', pose: 'stand', bubble: S.meBubble, glow: 0 }, p: { x: W / 2, y: H - 12 } });
    people.sort((a, b) => a.p.y - b.p.y);
    for (const { o, p } of people) drawPerson(o, p.x, p.y - 6 * g.ps, g.ps);
    // 拍立得：每个座位最多叠三张，摆在座位右上
    const bySeat = {}; for (const s of S.snaps) { (bySeat[s.seat] = bySeat[s.seat] || []).push(s); }
    for (const k of Object.keys(bySeat)) { const p = seatPos(Number(k), g); const list = bySeat[k].slice(-3); list.forEach((s, i) => { const a = Math.min(1, (S.t - s.t) / 0.5); const w = 12 * g.ps, h = 14 * g.ps; ctx.save(); ctx.globalAlpha = a; ctx.translate(p.x + 18 * g.ps + i * 4, p.y - 22 * g.ps - i * 3); ctx.rotate(-0.15 + i * 0.12); ctx.fillStyle = '#f3e9d6'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#5a1f16'; ctx.fillRect(1.5, 1.5, w - 3, h - 5); ctx.restore(); }); }
    for (const e of S.effects) {
      const k = (S.t - e.t) / (e.kind === 'tea' ? 1.4 : 1.0);
      if (e.kind === 'ripple') { const p = seatPos(e.seat, g); ctx.strokeStyle = 'rgba(247,220,154,' + (0.6 * (1 - k)) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y - 12 * g.ps, (14 + k * 34) * g.ps, 0, Math.PI * 2); ctx.stroke(); }
      if (e.kind === 'tea') { const a = seatPos(e.from, g), b = seatPos(e.to, g); const ease = k < 0.5 ? 2 * k * k : -1 + (4 - 2 * k) * k; const x = a.x + (b.x - a.x) * ease, y = a.y - 30 + (b.y - a.y) * ease - Math.sin(k * Math.PI) * 22; ctx.font = Math.round(16 * g.ps) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🍵', x, y); }
    }
    // 场灯：二铃起渐暗（只暗观众席，戏台留着）
    if (S.light < 1) { ctx.fillStyle = 'rgba(8,4,2,' + (0.8 * (1 - S.light)) + ')'; ctx.fillRect(0, g.stageH + 20, W, H - g.stageH - 20); }
    if (S.flash >= 0 && S.t - S.flash < 0.35) { ctx.fillStyle = 'rgba(255,255,255,' + (0.7 * (1 - (S.t - S.flash) / 0.35)) + ')'; ctx.fillRect(0, 0, W, g.stageH); }
    if (S.gongFlash && S.t - S.gongFlash < 0.9) { ctx.fillStyle = 'rgba(247,220,154,' + (0.35 * (1 - (S.t - S.gongFlash) / 0.9)) + ')'; ctx.fillRect(0, 0, W, H); }
  }
  function drawPerson(o, x, y, s) {
    s = s || 1;
    const isR = o.kind === 'resident', isMe = o.kind === 'me';
    if (o.glow && S.t - o.glow < 2.5) { const k = 1 - (S.t - o.glow) / 2.5; ctx.fillStyle = 'rgba(247,220,154,' + (0.35 * k) + ')'; ctx.beginPath(); ctx.arc(x, y - 8 * s, 22 * s, 0, Math.PI * 2); ctx.fill(); }
    ctx.save(); if (isR) ctx.globalAlpha = 0.55; else if (o.kind === 'ghost') ctx.globalAlpha = 0.82;
    const dy = o.pose === 'shift' ? Math.sin(S.t * 8) * 1.5 : 0, lift = (o.pose === 'look' || o.pose === 'snap' ? -3 : o.pose === 'nod' ? 2 : 0) * s;
    ctx.fillStyle = o.color; ctx.beginPath(); ctx.ellipse(x + dy, y + 2 * s, 11 * s, 9 * s, 0, 0, Math.PI * 2); ctx.fill();          // 身体
    ctx.fillStyle = isR ? '#8a8a8a' : C.skin; ctx.beginPath(); ctx.arc(x + dy, y - 11 * s + lift, 8 * s, 0, Math.PI * 2); ctx.fill(); // 头
    if (o.pose === 'clap') { ctx.fillStyle = isR ? '#8a8a8a' : C.skin; const w = Math.sin(S.t * 18) * 3 * s; ctx.beginPath(); ctx.arc(x - 6 * s + w, y - 2 * s, 3 * s, 0, Math.PI * 2); ctx.arc(x + 6 * s - w, y - 2 * s, 3 * s, 0, Math.PI * 2); ctx.fill(); }
    if (o.pose === 'lamp') { ctx.fillStyle = C.skin; ctx.beginPath(); ctx.arc(x + 10 * s, y - 14 * s, 3 * s, 0, Math.PI * 2); ctx.fill(); }
    if (o.pose === 'snap') { ctx.fillStyle = '#2a1e16'; ctx.fillRect(x - 5 * s, y - 16 * s, 10 * s, 7 * s); ctx.fillStyle = '#f7dc9a'; ctx.beginPath(); ctx.arc(x, y - 12.5 * s, 2 * s, 0, Math.PI * 2); ctx.fill(); }
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
    const d = new Date(S.lastClockMs); x.font = '20px sans-serif'; x.fillStyle = 'rgba(243,233,214,.6)'; x.fillText(d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 · ' + (S.phase === 'curtain' ? '开演' : '开演前'), pw / 2, 196);
    x.save(); x.translate(60, 240); x.scale(scale, scale); x.drawImage(cv, 0, 0, cv.width, cv.height, 0, 0, W, H); x.restore();
    const yb = 240 + hallH + 56;
    x.font = '24px sans-serif'; x.fillStyle = '#f7dc9a'; x.fillText('在场 ' + humansHere() + ' 人 · 点灯 ' + S.lamps.length + ' 盏 · 掌声 ' + S.claps + ' 次 · 递茶 ' + S.teas + ' 杯 · 拍舞台 ' + S.snaps.length + ' 张', pw / 2, yb);
    const names = [S.phase === 'door' ? null : '我', ...S.ghosts.filter((g) => g.hall === S.me.hall && g.here && !g.gone).map((g) => g.label)].filter(Boolean).join('   ');
    x.font = '20px sans-serif'; x.fillStyle = 'rgba(243,233,214,.7)'; wrap(x, names || '还没有人落座', pw / 2, yb + 44, pw - 140, 28);
    x.font = '16px sans-serif'; x.fillStyle = 'rgba(200,200,200,.6)'; x.fillText('灰色身影为候场布置，不是真人 · 带「你」的是你自己前几次来的回放', pw / 2, ph - 44);
    el('photoImg').src = c.toDataURL('image/png'); show('photoOverlay'); S.lastSound = 'photo';
  }
  function wrap(x, text, cx, y, maxW, lh) { let line = ''; for (const w of text.split('   ')) { const t = line ? line + '   ' + w : w; if (x.measureText(t).width > maxW && line) { x.fillText(line, cx, y); y += lh; line = w; } else line = t; } if (line) x.fillText(line, cx, y); }

  // ---------- 交互 ----------
  cv.addEventListener('pointerdown', (e) => {
    if (!S) return; const r = cv.getBoundingClientRect(); const px = e.clientX - r.left, py = e.clientY - r.top; const g = geom();
    const b = g.book;
    if (px >= b.x - 6 && px <= b.x + b.w + 6 && py >= b.y - 6 && py <= b.y + b.h + 6) { openProgramme(0); return; }
    if (py < g.stageH) { if (S.phase === 'seated') act(5); else if (S.phase === 'door') hint('先落座，坐下再拍'); else hint('开演了，收好手机'); return; }
    let best = -1, bd = 1e9; for (let i = 0; i < D.CAP; i++) { const p = seatPos(i, g); const d = Math.hypot(p.x - px, p.y - py); if (d < bd) { bd = d; best = i; } }
    if (best < 0 || bd > 26) return;
    const o = occupant(best);
    if (!o) { if (S.phase === 'door') act(0, best); else if (S.phase === 'seated') hint('换座请先离席'); }
    else if (o.kind === 'resident') hint('这是候场身影，不是真人');
    else if (o.kind === 'ghost') hint(o.label + ' 坐在这儿');
  });
  bar.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.act !== undefined) act(Number(b.dataset.act)); else if (b.id === 'btnPhoto') { unlockAudio(); photo(); } });
  el('gongBtn').addEventListener('click', () => { unlockAudio(); gong(false); });
  el('infoBtn').addEventListener('click', () => openProgramme(0));
  el('progPrev').addEventListener('click', () => flip(-1));
  el('progNext').addEventListener('click', () => flip(1));
  el('nextShowBtn').addEventListener('click', () => nextShow());
  el('curtainPhotoBtn').addEventListener('click', () => { hide('curtainOverlay'); photo(); });
  for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', () => hide(b.dataset.close));
  window.addEventListener('keydown', (e) => {
    if (e.key >= '1' && e.key <= '5') act(Number(e.key) - 1);
    else if (e.key === 'm' || e.key === 'M') setMuted(!muted); else if (e.key === 'p' || e.key === 'P') photo();
    else if (e.key === 'b' || e.key === 'B') openProgramme(0); else if (e.key === 's' || e.key === 'S') act(5);
    else if (e.key === 'ArrowLeft' && el('programmeOverlay').classList.contains('show')) flip(-1);
    else if (e.key === 'ArrowRight' && el('programmeOverlay').classList.contains('show')) flip(1);
    else if (e.key === 'Escape') for (const o of document.querySelectorAll('.overlay.show')) o.classList.remove('show');
  });
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
      halls: D.hallList(S.house), humans: humansHere(),
      ghostsHere: S.ghosts.filter((g) => g.hall === S.me.hall && g.here && !g.gone).length, residents: S.residents.length,
      lamps: S.lamps.length, claps: S.claps, teas: S.teas, snaps: S.snaps.length, gongs: S.gongCount, bells: S.bells.slice(), light: Math.round(S.light * 100) / 100,
      lastBackstage: S.lastBackstage, curtainOpen: S.curtainOpen >= 0, shows: S.shows, lastSound: S.lastSound,
      effects: S.effects.map((e) => e.kind), visits: visits.length, hint: hintEl.textContent, hallTag: hallTag.textContent, countText: countEl.textContent, countdown: cdEl.textContent,
      gongOpen: el('gongOverlay').classList.contains('show'), photoOpen: el('photoOverlay').classList.contains('show'),
      programmeOpen: el('programmeOverlay').classList.contains('show'), programmePage: page, programmeTitle: el('progTitle').textContent,
      curtainOverlay: el('curtainOverlay').classList.contains('show'), frameStamp,
    };
  }
  window.__foyer = {
    get ready() { return !!S; }, act, snapshot, canAct, gong, photo, openProgramme, flip, nextShow, get state() { return S; }, get visits() { return visits; }, get frameStamp() { return frameStamp; },
    pause(p) { paused = p; }, step(ms) { tick(ms / 1000); draw(); frameStamp++; },
    // 把开演时刻挪到「从现在起 sec 秒后」，用来在测试里快进到一铃 / 二铃 / 开演
    jumpTo(sec) { if (!S) return; S.curtain = S.lastClockMs + sec * 1000; updateTop(); },
    reset() { visits = loadVisits(); rngState = D.rng(seed); enterHall(); },
  };
  window.__PLAYTEST__ = {
    get ready() { return !!S; }, snapshot,
    reset() { window.__foyer.reset(); }, setSeed(n) { rngState = D.rng(n); },
    step(ms) { paused = true; tick(ms / 1000); draw(); frameStamp++; },
  };

  resize(); visits = loadVisits(); enterHall(); requestAnimationFrame(frame);
})();
