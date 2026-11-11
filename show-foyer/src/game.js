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
    resident: '#8a8a8a', skin: '#f5d9b8', 
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
  function enterHall(withGift = false, skipGift = false) {
    const now = FIXED ? 1700000000000 + 13 * 3600000 : Date.now();
    const plan = D.planGhosts(withGift ? [] : visits);
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
      gift: D.newTeaGift(withGift || (!skipGift && !FIXED && Q.get('intro') !== 'skip' && visits.length === 0)), giftReplay: withGift, usher: null,
      curtainSway: -9, curtainOpen: -1, flash: -9, shows: (S ? S.shows : 0),
    };
    for (const g of ghosts) for (const a of g.acts) if (a[1] === 1 && g.hall === plan.me.hall) { S.lamps.push({ by: g.id, t: -1 }); g.lamp = true; break; }
    S.lit = litTarget();
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
  function giftActive() { return S.gift.phase !== 'off'; }
  function startGift() {
    // Switching modes preserves any ordinary visit already in progress.
    if (!S.giftReplay && S.visit) { D.closeVisit(S.visit, S.t - S.seatT); visits = D.pushVisit(visits, S.visit); saveVisits(); }
    for (const o of document.querySelectorAll('.overlay.show')) hide(o.id);
    enterHall(true);
  }
  function exitGift() {
    for (const o of document.querySelectorAll('.overlay.show')) hide(o.id);
    if (S.giftReplay) { enterHall(false, true); return; }
    // Skip only the invitation: retain the ordinary visit, seat and curtain time.
    S.gift = D.teaGift(S.gift, 'exit');
    if (S.usher) {
      S.usher.seat = S.usherHomeSeat; S.usher.label = '身影 · 非真人';
      S.usher.bubble = null; S.usher.pose = 'idle'; S.usher = null;
    }
    if (S.phase === 'curtain') show('curtainOverlay');
    updateTop();
  }
  function neighbors() {
    if (S.phase !== 'seated') return [];
    if (giftActive()) return S.gift.phase === 'invited' ? [S.usher] : [];
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
      else if (code === 3 && S.phase === 'seated') hint(S.gift.ticket ? '回礼已经收好，合影里看看吧' : '邻座还没来，茶先温着');
      else if (code !== 0 && S.phase !== 'seated') hint('先落座');
      return false;
    }
    unlockAudio();
    if (code === 0) {
      if (seatNo !== undefined && !occupant(seatNo)) {
        D.leave(S.house, 'me'); const guests = S.house.halls.get(S.me.hall) || (S.house.halls.set(S.me.hall, new Map()), S.house.halls.get(S.me.hall)); guests.set('me', seatNo); S.me = { hall: S.me.hall, seat: seatNo };
      }
      S.phase = 'seated'; S.gift = D.teaGift(S.gift, 0); S.seatT = S.t; S.visit = D.newVisit(Date.now()); D.recordAct(S.visit, 0, 0);
      S.meGlow = S.t; S.lastSound = 'sit'; sfx.sit(); hint('已落座 · ' + seatName(S.me.seat) + '，点戏台可以拍照，台口有节目单'); updateTop(); frameStamp++; return true;
    }
    const tau = S.t - S.seatT;
    if (code === 1) { S.lamps.push({ by: 'me', t: S.t }); pose(me(), 'lamp', 1.4); bubble(me(), '🏮'); S.lastSound = 'lamp'; sfx.lamp(); D.recordAct(S.visit, tau, 1); hint('台前多了一盏灯'); }
    if (code === 2) { S.claps++; pose(me(), 'clap', 1.0); bubble(me(), '👏'); S.effects.push({ kind: 'ripple', seat: S.me.seat, t: S.t }); S.lastSound = 'clap'; sfx.clap(); D.recordAct(S.visit, tau, 2); }
    if (code === 3) {
      const ns = neighbors(); const to = ns[Math.floor(rand() * ns.length)];
      S.gift = D.teaGift(S.gift, 3, S.me);
      S.teas++; S.effects.push({ kind: 'tea', from: S.me.seat, to: to.seat, t: S.t }); setTimeout(() => { if (S) { bubble(to, '🍵'); pose(to, 'nod', 1.2); } }, 900);
      S.lastSound = 'tea'; sfx.tea(); D.recordAct(S.visit, tau, 3); hint('给 ' + to.label + ' 递了一杯茶');
    }
    if (code === 5) { snap('me', S.me.seat); D.recordAct(S.visit, tau, 5); hint('拍了一张舞台，开演后就不能拍了'); }
    if (code === 4) {
      D.recordAct(S.visit, tau, 4); D.closeVisit(S.visit, tau);
      if (!S.giftReplay) { visits = D.pushVisit(visits, S.visit); saveVisits(); }
      S.lastSound = 'leave'; sfx.leave(); S.phase = 'door'; S.visit = null;
      if (S.giftReplay) { enterHall(true); hint('重新落座后，再等领位人来'); }
      else {
        hint('这一趟记下了，下次进门你就坐在厅里');
        const leaving = S;
        setTimeout(() => { if (S === leaving && S.phase === 'door') enterHall(); }, 1400);
      }   // 按新历史重排：你会看到「你 · 刚才」
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
    if (S.phase === 'seated' && S.visit) { const tau = S.t - S.seatT; D.closeVisit(S.visit, tau); if (!S.giftReplay) { visits = D.pushVisit(visits, S.visit); saveVisits(); } S.visit = null; }
    S.gift = D.teaGift(S.gift, 'curtain');
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
    // 邀请由真实落座时间推进；首访或可选重玩时把一个灰影挪到空邻座。
    if (giftActive() && S.phase === 'seated') {
      const before = S.gift.phase;
      S.gift = D.teaGift(S.gift, 'tick', { dt, seat: S.me.seat, occupied: hereOthers().filter(o => o.id !== 'r0').map(o => o.seat) });
      if (before === 'waiting' && S.gift.phase === 'invited') {
        S.usher = S.residents[0]; S.usherHomeSeat = S.usher.seat; S.usher.seat = S.gift.seat; S.usher.label = '领位人 · 非真人';
        bubble(S.usher, '🍵'); pose(S.usher, 'look', 2); updateTop();
      }
    }
    // 灰影照日程
    for (const r of S.residents) {
      const period = r.sched.period, cyc = Math.floor(S.tau / period), local = S.tau - cyc * period, prevLocal = r.prev < 0 ? -1 : r.prev - Math.floor(r.prev / period) * period;
      const due = prevLocal > local ? [...D.dueActs(r.sched.acts, prevLocal, period), ...D.dueActs(r.sched.acts, -1, local)] : D.dueActs(r.sched.acts, prevLocal, local);
      for (const a of due) pose(r, a[1] === 6 ? 'look' : 'shift', 1.6);
      r.prev = S.tau;
    }
    // 台上亮度跟着灯数走：指数逼近目标，约 1 秒走完大半，跳时间时直接到位
    S.lit += (litTarget() - S.lit) * (1 - Math.exp(-dt * 2.2));
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
    el('curtainGiftBtn').hidden = !giftActive();
    const note = el('teaNote'); note.hidden = !giftActive();
    el('giftSkip').hidden = S.phase === 'curtain';
    el('teaText').textContent = !giftActive() ? '' : ({ door: '一杯茶的回礼 · 请先落座', waiting: '一杯茶的回礼 · 领位人稍后就来', invited: '领位人 · 非真人　🍵 请递一杯茶', done: '纸票已收好 · 点合影看看回礼', missed: '这次没递出茶 · 节目单里可以重试' })[S.gift.phase];
  }
  let hintTimer = 0;
  function hint(text) { if (!text) { hintEl.classList.remove('show'); return; } hintEl.textContent = text; hintEl.classList.add('show'); clearTimeout(hintTimer); hintTimer = setTimeout(() => hintEl.classList.remove('show'), 2600); }
  function show(id) { el(id).classList.add('show'); }
  function hide(id) { el(id).classList.remove('show'); }
  function closeOverlay(id) {
    hide(id);
    if (S.phase === 'curtain') show('curtainOverlay');
  }

  // ---------- 节目单 ----------
  let page = 0;
  function programmePages() {
    const others = S.ghosts.filter((g) => g.hall === S.me.hall && g.here && !g.gone).map((g) => g.label);
    return [
      { h: '节目单', b: (giftActive() ? '<p><button class="close" id="giftExit">回到普通候场</button> <button class="close" id="giftStart">再试一次</button></p><p class="small">落座后等 25 秒，给领位人递茶，收一张纸票。</p>' : '<p><button class="close" id="giftStart">一杯茶的回礼</button></p><p class="small">可选：落座后等 25 秒，给「领位人 · 非真人」递茶，收一张纸票。独立候场，不写入来访。</p>') + '<p class="big">' + SHOW.kind + '《' + SHOW.name + '》</p><p>' + SHOW.troupe + '</p><p class="small">候场厅 · 第 ' + S.me.hall + ' 厅 · 开演前</p><p class="small">剧目名与演出单位取自公开报道，是真实信息；这个候场厅是个人做着玩的小玩意，不是剧院或剧目的官方页面，不售票、不联网。以后有新戏上演，戏名会跟着换。</p>' },
      { h: '这出戏', b: '<p>据公开报道，' + SHOW.kind + '《' + SHOW.name + '》由' + SHOW.troupe + '创排演出，以岭南民俗舞蹈英歌为载体，把传统英歌舞和木雕、嵌瓷、潮绣、铁枝木偶、潮州油纸灯笼这些非遗元素揉进现代舞台，讲的是民族危难之际同仇敌忾、舍家卫国的家国情怀。近年在各地巡演，二〇二六年八月在北京天桥剧场参加第七届全国少数民族文艺会演。</p>' },
      { h: '英歌是什么', b: '<p>英歌是流行于广东潮汕一带的民间广场舞蹈，舞者扮作水浒人物，脸上勾画脸谱，双手各持一根短槌，边击槌边行进起舞，配以大鼓和锣钹，阵势很大。二〇〇六年，英歌（普宁英歌、潮阳英歌）列入第一批国家级非物质文化遗产名录。</p><p class="small">候场时如果听见幕后有鼓点，那是在热身。</p>' },
      { h: '观演小贴士', b: '<p>开演前有三遍铃：一铃在开演前三分钟，二铃在前一分钟，三铃就开演，场灯会跟着渐暗。</p><p>候场时拍舞台随意，开演后请把手机收好，不拍照不录像。</p><p>迟到请在换场的间隙入场。</p><p class="small">这里一场候场是五分钟：真剧场的半小时，压成了五分钟。</p>' },
      { h: '今晚谁来过', b: '<p>第 ' + S.me.hall + ' 厅 · 在场 ' + humansHere() + ' 人 · 点灯 ' + S.lamps.length + ' 盏 · 掌声 ' + S.claps + ' 次 · 递茶 ' + S.teas + ' 杯 · 拍舞台 ' + S.snaps.length + ' 张</p><p>' + ([S.phase === 'door' ? null : '我', ...others].filter(Boolean).join('　') || '还没有人落座') + '</p><p class="small">带「你」的是你自己前几次来的回放，灰色身影不计。这台手机的浏览器最多记 12 次，坐满一厅就开第 2 厅。</p><p><button class="close" id="progPhoto">生成合影图</button></p><p><button class="close" id="progClear">清场 · 删掉这台手机记着的 ' + visits.length + ' 次来访</button></p>' },
    ];
  }
  function openProgramme(p) { if (giftActive()) hide('curtainOverlay'); page = p || 0; renderProgramme(); show('programmeOverlay'); unlockAudio(); sfx.page(); }
  function renderProgramme() {
    const pages = programmePages(); page = Math.max(0, Math.min(pages.length - 1, page));
    el('progTitle').textContent = pages[page].h; el('progBody').innerHTML = pages[page].b; el('progNo').textContent = (page + 1) + ' / ' + pages.length;
    el('progPrev').disabled = page === 0; el('progNext').disabled = page === pages.length - 1;
    const gs = el('giftStart'); if (gs) gs.addEventListener('click', startGift);
    const ge = el('giftExit'); if (ge) ge.addEventListener('click', exitGift);
    const pb = el('progPhoto'); if (pb) pb.addEventListener('click', () => { hide('programmeOverlay'); photo(); });
    const cb = el('progClear'); if (cb) { cb.disabled = visits.length === 0; cb.addEventListener('click', () => { if (!cb.dataset.armed) { cb.dataset.armed = '1'; cb.textContent = '再点一次就清了，回放全走、灰色身影补位'; return; } clearVisits(); }); }
  }
  // 清场：删掉本机记着的全部来访，重新进厅（只剩候场身影）。固定机位下不碰 localStorage。
  function clearVisits() {
    visits = [];
    if (!FIXED) try { localStorage.removeItem(STORE_KEY); } catch (e) {}
    hide('programmeOverlay'); hide('photoOverlay'); hide('curtainOverlay');
    const shows = (S && S.shows) || 0; enterHall(); S.shows = shows;
    S.lastSound = 'clear'; sfx.leave(); hint('清场了，厅里只剩候场身影');
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
  function updateSoundButton() {
    el('soundBtn').textContent = muted ? '声音：关' : '声音：开';
    el('soundBtn').setAttribute('aria-pressed', String(!muted));
  }
  function setMuted(m) {
    muted = m;
    if (muted && audio) audio.suspend(); else if (!muted) unlockAudio();
    if (!FIXED) try { localStorage.setItem('show-foyer-muted', m ? '1' : '0'); } catch (e) {}
    updateSoundButton(); hint(m ? '已静音' : '已开声');
  }

  // ---------- 画面 ----------
  // 从观众席后排往台口看：台口金框、檐幕、丝绒大幕、木台板；台下三排红丝绒椅从背后看，坐了人就露出头肩。
  // 静态的幕布、台口、台板烘焙进离屏画布（尺寸变了才重画），每帧只叠明暗、光锥、灯笼和人。
  const LIT_FULL = 5;                                         // 点到第 5 盏满台暖光（灯数本身不设上限，照旧）
  function litTarget() { return S.phase === 'curtain' ? 1 : Math.min(S.lamps.length, LIT_FULL) / LIT_FULL; }
  let bake = null;
  function resize() {
    const r = cv.getBoundingClientRect(); W = Math.max(200, r.width); H = Math.max(200, r.height); DPR = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); ctx.setTransform(DPR, 0, 0, DPR, 0, 0); frameStamp++; bake = null;
  }
  function geom() {
    const short = H < 330;                                  // 横屏手机：画布很矮
    const stageH = short ? H * 0.3 : Math.min(H * 0.36, W >= 700 ? 290 : 230), pad = Math.min(24, W * 0.06);
    const top = stageH + (short ? 30 : 36), bottom = H - (short ? 14 : 30);
    const pitch = (bottom - top) / D.ROWS;
    const cell = Math.min((W - 2 * (pad + 10)) / D.COLS, Math.max(pitch * 1.1, 120));   // 列宽：竖屏与电脑上椅子挨着排成一排，横屏矮画布留出名签的宽度
    const seatW = Math.min(cell * 0.9, pitch), seatH = seatW * 0.6;            // 第二排的椅背；前后排按 rowScale 近大远小
    const ps = Math.max(0.55, seatW / 52);                  // 人物缩放：跟着椅背走
    const left = W / 2 - cell * D.COLS / 2, right = W / 2 + cell * D.COLS / 2;
    const pw = Math.min(W, Math.max(cell * D.COLS * 1.75, W * 0.6)), px0 = (W - pw) / 2, px1 = px0 + pw;   // 台口外框
    const col = Math.max(7, Math.min(26, pw * 0.024));      // 台柱宽
    const curtainH = stageH * 0.72;
    const book = { x: 8, y: stageH * 0.72 + (short ? 4 : 8), w: short ? 26 : 34, h: short ? 18 : 24 };   // 台口左侧的节目单
    return { stageH, curtainH, top, bottom, left, right, pitch, cell, seatW, seatH, ps, short, book, px0, px1, col, cx0: px0 + col, cx1: px1 - col };
  }
  const rowScale = (r) => 0.92 + 0.08 * r;                  // 一排远、三排近
  function seatPos(i, g) {
    g = g || geom(); const r = Math.floor(i / D.COLS), c = i % D.COLS;
    return { x: W / 2 + (c - (D.COLS - 1) / 2) * g.cell * rowScale(r), y: g.top + (g.bottom - g.top) * (r + 0.5) / D.ROWS };
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function layer(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w * DPR)); c.height = Math.max(1, Math.ceil(h * DPR)); const x = c.getContext('2d'); x.setTransform(DPR, 0, 0, DPR, 0, 0); return [c, x]; }
  function grad(c, x0, y0, x1, y1, stops) { const gr = c.createLinearGradient(x0, y0, x1, y1); stops.forEach(([k, col]) => gr.addColorStop(k, col)); return gr; }
  const GILT = [[0, '#4a2e0e'], [0.22, '#a77a2c'], [0.45, '#f2d58a'], [0.6, '#c9a24a'], [0.85, '#6e4a18'], [1, '#3a240a']];

  function bakeLayers(g) {
    const R = D.rng(7), sh = g.stageH, ch = g.curtainH, cw = g.cx1 - g.cx0;
    // 半幅大幕：一道道褶子，亮脊暗谷，丝绒细点，底边金流苏
    const hw = cw / 2 + 4, [cur, c] = layer(hw, ch);
    c.fillStyle = '#3a110b'; c.fillRect(0, 0, hw, ch);
    const fw0 = Math.max(12, Math.min(30, W / 44));
    for (let x = -fw0 * 0.3; x < hw; ) {
      const fw = fw0 * (0.75 + R() * 0.5), sag = ch * (0.008 + R() * 0.012);
      c.fillStyle = grad(c, x, 0, x + fw, 0, [[0, '#2c0c08'], [0.2, '#5e1e15'], [0.46, '#a3392a'], [0.56, '#b4483a'], [0.78, '#6a2219'], [1, '#2c0c08']]);
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x + fw, 0); c.lineTo(x + fw, ch - 6); c.quadraticCurveTo(x + fw / 2, ch - 6 + sag * 2, x, ch - 6); c.closePath(); c.fill();
      x += fw;
    }
    c.fillStyle = grad(c, 0, 0, 0, ch, [[0, 'rgba(0,0,0,.55)'], [0.18, 'rgba(0,0,0,.15)'], [0.5, 'rgba(0,0,0,0)'], [0.86, 'rgba(0,0,0,.18)'], [1, 'rgba(0,0,0,.35)']]); c.fillRect(0, 0, hw, ch);
    for (let i = 0, n = Math.round(hw * ch / 26); i < n; i++) { c.fillStyle = R() < 0.5 ? 'rgba(255,190,160,.07)' : 'rgba(0,0,0,.12)'; c.fillRect(R() * hw, R() * ch, 1, 1 + R() * 2); }
    c.fillStyle = grad(c, 0, ch - 7, 0, ch, [[0, '#8a6424'], [0.4, '#e8c878'], [1, '#6e4a18']]); c.fillRect(0, ch - 7, hw, 3);
    c.fillStyle = '#c9a24a'; for (let x = 0; x < hw; x += 2.5) c.fillRect(x, ch - 4, 1.2, 2.5 + (Math.floor(x / 2.5) % 2) * 1.5);

    // 台口：两侧描金台柱、顶上金楣与带流苏的檐幕、匾额、木台板与前沿
    const [fr, f] = layer(W, sh + 10);
    const vh = Math.max(8, ch * 0.2), ah = vh * 0.42;
    // 台板：横铺木条、错缝、木纹，台口下沿压一道阴影
    const ay0 = ch, ay1 = sh - 6;
    f.fillStyle = grad(f, 0, ay0, 0, ay1, [[0, '#3a2414'], [1, '#6a4428']]); f.fillRect(g.px0, ay0, g.px1 - g.px0, ay1 - ay0);
    f.save(); f.beginPath(); f.rect(g.px0, ay0, g.px1 - g.px0, ay1 - ay0); f.clip();
    const rows = Math.max(3, Math.round((ay1 - ay0) / 9));
    for (let k = 0; k < rows; k++) {
      const y0 = ay0 + (ay1 - ay0) * Math.pow(k / rows, 1.25), y1 = ay0 + (ay1 - ay0) * Math.pow((k + 1) / rows, 1.25), ph = y1 - y0;
      for (let x = g.px0 - R() * 120; x < g.px1; ) {
        const len = 70 + R() * 110; f.fillStyle = 'rgba(' + (80 + R() * 40 | 0) + ',' + (48 + R() * 24 | 0) + ',' + (26 + R() * 12 | 0) + ',.35)'; f.fillRect(x, y0, len, ph);
        f.strokeStyle = 'rgba(255,220,170,.07)'; f.lineWidth = 0.6;
        for (let j = 0; j < 3; j++) { const yy = y0 + ph * (0.25 + j * 0.25) + (R() - 0.5); f.beginPath(); f.moveTo(x, yy); f.quadraticCurveTo(x + len / 2, yy + (R() - 0.5) * ph * 0.5, x + len, yy); f.stroke(); }
        f.fillStyle = 'rgba(20,10,4,.55)'; f.fillRect(x + len - 1, y0, 1, ph); x += len;
      }
      f.fillStyle = 'rgba(20,10,4,.6)'; f.fillRect(g.px0, y1 - 0.8, g.px1 - g.px0, 0.8);
    }
    f.restore();
    f.fillStyle = grad(f, 0, ay0, 0, ay0 + 10, [[0, 'rgba(0,0,0,.6)'], [1, 'rgba(0,0,0,0)']]); f.fillRect(g.px0, ay0, g.px1 - g.px0, 10);
    f.fillStyle = grad(f, 0, ay1, 0, ay1 + 4, [[0, '#f0d58c'], [0.5, '#a77a2c'], [1, '#4a2e0e']]); f.fillRect(g.px0 - 4, ay1, g.px1 - g.px0 + 8, 4);   // 台唇
    f.fillStyle = grad(f, 0, ay1 + 4, 0, sh + 8, [[0, '#2a170c'], [1, '#160c06']]); f.fillRect(g.px0 - 4, ay1 + 4, g.px1 - g.px0 + 8, sh + 4 - ay1);
    f.strokeStyle = 'rgba(201,162,74,.28)'; f.lineWidth = 1;
    for (let x = g.px0 + 8; x < g.px1 - 30; x += 64) f.strokeRect(x, ay1 + 6, 56, Math.max(2, sh + 3 - ay1 - 6));
    // 台柱：描金立柱，内嵌暗槽和花饰
    for (const x0 of [g.px0, g.cx1]) {
      f.fillStyle = grad(f, x0, 0, x0 + g.col, 0, GILT); f.fillRect(x0, 0, g.col, ay1);
      f.fillStyle = 'rgba(40,20,6,.55)'; f.fillRect(x0 + g.col * 0.3, ah + vh, g.col * 0.4, ay1 - ah - vh - 6);
      f.fillStyle = 'rgba(255,230,160,.35)'; f.fillRect(x0 + g.col * 0.3, ah + vh, 1, ay1 - ah - vh - 6);
      for (let y = ah + vh + 14; y < ay1 - 14; y += Math.max(18, g.col * 2.2)) { f.fillStyle = '#e8c878'; f.beginPath(); f.arc(x0 + g.col / 2, y, g.col * 0.22, 0, Math.PI * 2); f.fill(); f.fillStyle = '#6e4a18'; f.beginPath(); f.arc(x0 + g.col / 2, y, g.col * 0.1, 0, Math.PI * 2); f.fill(); }
    }
    // 檐幕：先一条丝绒底，再一串垂花幔，幔底挂金流苏，幔间吊穗
    f.fillStyle = '#5e1a12'; f.fillRect(g.cx0, ah, cw, vh * 0.55);
    const swags = Math.max(3, Math.round(cw / Math.max(70, cw / 9))), sw = cw / swags;
    for (let i = 0; i < swags; i++) {
      const x0 = g.cx0 + i * sw, x1 = x0 + sw, yb = ah + vh;
      f.fillStyle = grad(f, 0, ah, 0, yb, [[0, '#4a130d'], [0.55, '#a3392a'], [0.8, '#7a2a1e'], [1, '#4a130d']]);
      f.beginPath(); f.moveTo(x0, ah); f.lineTo(x1, ah); f.quadraticCurveTo(x1 - sw * 0.05, yb - vh * 0.3, (x0 + x1) / 2, yb); f.quadraticCurveTo(x0 + sw * 0.05, yb - vh * 0.3, x0, ah); f.fill();
      f.strokeStyle = 'rgba(0,0,0,.25)'; f.lineWidth = 1; for (const k of [0.35, 0.65]) { f.beginPath(); f.moveTo(x0 + sw * 0.12, ah + vh * k * 0.7); f.quadraticCurveTo((x0 + x1) / 2, ah + vh * (k + 0.25), x1 - sw * 0.12, ah + vh * k * 0.7); f.stroke(); }
      f.strokeStyle = '#d9b45e'; f.lineWidth = Math.max(1.5, vh * 0.12); f.setLineDash([1.2, 1.6]);
      f.beginPath(); f.moveTo(x0, ah + 1); f.quadraticCurveTo(x0 + sw * 0.05, yb - vh * 0.3, (x0 + x1) / 2, yb + vh * 0.05); f.quadraticCurveTo(x1 - sw * 0.05, yb - vh * 0.3, x1, ah + 1); f.stroke(); f.setLineDash([]);
      f.fillStyle = '#e8c878'; f.beginPath(); f.ellipse(x1, ah + vh * 0.45, Math.max(1.5, vh * 0.1), Math.max(3, vh * 0.28), 0, 0, Math.PI * 2); f.fill();
    }
    // 金楣：渐变金带，压一排卷草圆点
    f.fillStyle = grad(f, 0, 0, 0, ah, [[0, '#6e4a18'], [0.35, '#f2d58a'], [0.7, '#b68a35'], [1, '#4a2e0e']]); f.fillRect(g.px0, 0, g.px1 - g.px0, ah);
    f.fillStyle = 'rgba(74,46,14,.7)'; for (let x = g.px0 + 10; x < g.px1 - 6; x += Math.max(9, ah * 1.1)) { f.beginPath(); f.arc(x, ah * 0.52, Math.max(1, ah * 0.16), 0, Math.PI * 2); f.fill(); }
    if (!g.short) {   // 台口匾额：剧目与院团，照旧的那一行字
      f.font = '500 12px "PingFang SC","Hiragino Sans GB",sans-serif'; const label = SHOW.troupe + ' · 《' + SHOW.name + '》', tw = f.measureText(label).width + 26, th = Math.max(16, Math.min(20, ah + vh * 0.5));
      f.fillStyle = grad(f, 0, 0, 0, th, GILT); rr(f, W / 2 - tw / 2 - 2, 0, tw + 4, th + 2, 3); f.fill();
      f.fillStyle = '#3a110b'; rr(f, W / 2 - tw / 2, 1.5, tw, th - 1.5, 2); f.fill();
      f.fillStyle = '#f2d58a'; f.textAlign = 'center'; f.textBaseline = 'middle'; f.fillText(label, W / 2, 1 + th / 2); f.textBaseline = 'alphabetic';
    }
    // 椅背丝绒的细点纹
    const [nz, n] = layer(48, 48); for (let i = 0; i < 260; i++) { n.fillStyle = R() < 0.5 ? 'rgba(255,200,180,.09)' : 'rgba(0,0,0,.14)'; n.fillRect(R() * 48, R() * 48, 1, 1 + R() * 1.5); }
    const [cp, q] = layer(40, 40); for (let i = 0; i < 160; i++) { q.fillStyle = R() < 0.5 ? 'rgba(255,200,160,.025)' : 'rgba(0,0,0,.06)'; q.fillRect(R() * 40, R() * 40, 1 + R(), 1); }
    bake = { key: W + 'x' + H + 'x' + DPR, cur, fr, hw, velvet: ctx.createPattern(nz, 'repeat'), carpet: ctx.createPattern(cp, 'repeat') };
  }

  const LAMP_SLOTS = [0.5, 0.3, 0.7, 0.12, 0.88, 0.4, 0.6, 0.21, 0.79, 0.05, 0.95, 0.5];
  function lampAt(i, g) {
    const k = Math.floor(i / LAMP_SLOTS.length), f = LAMP_SLOTS[i % LAMP_SLOTS.length] + (k ? 0.04 * k : 0);
    return { x: g.cx0 + (g.cx1 - g.cx0) * Math.min(0.97, f), y: g.stageH - 7 };
  }
  function lantern(x, y, alpha, s) {                       // 落地的红纸灯笼：底在 y，里头一点暖火
    const flick = 0.88 + 0.12 * Math.sin(S.t * 5 + x);
    ctx.save(); ctx.globalAlpha = alpha;
    const cy = y - 13 * s;
    const halo = ctx.createRadialGradient(x, cy, 1, x, cy, 26 * s); halo.addColorStop(0, 'rgba(255,190,100,' + (0.55 * flick) + ')'); halo.addColorStop(1, 'rgba(255,140,60,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, cy, 26 * s, 0, Math.PI * 2); ctx.fill();
    const body = ctx.createRadialGradient(x, cy, 1, x, cy, 10 * s); body.addColorStop(0, '#ffe39a'); body.addColorStop(0.45, '#f08a3a'); body.addColorStop(1, '#a8281a');
    ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(x, cy, 8.5 * s, 9.5 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(120,30,16,.55)'; ctx.lineWidth = Math.max(0.6, 0.8 * s); ctx.beginPath();
    for (const k of [-0.55, 0, 0.55]) { ctx.moveTo(x + k * 8.5 * s, cy - 8.6 * s); ctx.quadraticCurveTo(x + k * 12 * s, cy, x + k * 8.5 * s, cy + 8.6 * s); }
    ctx.stroke();
    ctx.fillStyle = '#2a1608'; ctx.fillRect(x - 4.5 * s, cy - 11 * s, 9 * s, 2.5 * s); ctx.fillRect(x - 4.5 * s, cy + 8.5 * s, 9 * s, 2.5 * s);
    ctx.fillStyle = '#d9b45e'; ctx.fillRect(x - 4.5 * s, cy - 11 * s, 9 * s, 0.9 * s); ctx.fillRect(x - 0.6 * s, cy + 11 * s, 1.2 * s, y - cy - 11 * s);
    ctx.restore();
  }
  function drawStage(g) {
    if (!bake || bake.key !== W + 'x' + H + 'x' + DPR) bakeLayers(g);
    const sh = g.stageH, ch = g.curtainH, cw = g.cx1 - g.cx0, L = Math.max(0, Math.min(1, S.lit));
    const open = S.curtainOpen >= 0 ? Math.min(1, (S.t - S.curtainOpen) / 2.6) : 0;        // 幕布拉开进度
    const ease = open < 0.5 ? 2 * open * open : -1 + (4 - 2 * open) * open;
    // 幕后：拉开后露出暖光与英歌阵列的剪影
    ctx.fillStyle = '#2a1008'; ctx.fillRect(g.cx0, 0, cw, ch);
    if (open > 0) {
      const lg = ctx.createRadialGradient(W / 2, ch * 0.9, 10, W / 2, ch * 0.9, cw * 0.7); lg.addColorStop(0, 'rgba(247,200,110,' + (0.55 * ease) + ')'); lg.addColorStop(1, 'rgba(120,40,20,0)');
      ctx.fillStyle = lg; ctx.fillRect(g.cx0, 0, cw, ch);
      ctx.fillStyle = 'rgba(20,8,4,' + (0.9 * ease) + ')';
      const n = 7, base = ch * 0.92, hgt = Math.min(44, ch * 0.42);
      for (let i = 0; i < n; i++) { const x = g.cx0 + cw * (0.14 + 0.72 * i / (n - 1)), lift = Math.sin(S.t * 6 + i) * 3 * ease; ctx.beginPath(); ctx.arc(x, base - hgt * 0.78 + lift, hgt * 0.14, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(x - hgt * 0.16, base - hgt * 0.62 + lift, hgt * 0.32, hgt * 0.62); ctx.save(); ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(247,220,154,' + (0.9 * ease) + ')'; ctx.beginPath(); ctx.moveTo(x - hgt * 0.16, base - hgt * 0.5 + lift); ctx.lineTo(x - hgt * 0.36, base - hgt * 0.95 + lift); ctx.moveTo(x + hgt * 0.16, base - hgt * 0.5 + lift); ctx.lineTo(x + hgt * 0.36, base - hgt * 0.95 + lift); ctx.stroke(); ctx.restore(); }
    }
    // 两片大幕：拉开时各自向两侧收；被碰时下摆轻晃
    const sway = S.t - S.curtainSway < 1.6 ? Math.sin((S.t - S.curtainSway) * 9) * 4 * (1 - (S.t - S.curtainSway) / 1.6) : 0;
    const slide = ease * (cw / 2 - 18);
    ctx.save(); ctx.beginPath(); ctx.rect(g.cx0, 0, cw, ch); ctx.clip();
    for (const side of [-1, 1]) {
      ctx.save(); ctx.translate(side < 0 ? g.cx0 - slide : g.cx0 + cw / 2 - 4 + slide, 0); ctx.transform(1, 0, side * sway / ch, 1, 0, 0);
      ctx.drawImage(bake.cur, 0, 0, bake.hw, ch); ctx.restore();
    }
    ctx.restore();
    ctx.drawImage(bake.fr, 0, 0, W, sh + 10);
    // 暗场：灯越少台越暗，0 盏只剩轮廓
    ctx.fillStyle = 'rgba(6,3,2,' + (0.86 * (1 - L)) + ')'; ctx.fillRect(g.px0 - 4, 0, g.px1 - g.px0 + 8, sh + 8);
    // 台口的暖色总光：从台前往幕布上铺开
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    if (L > 0.01) {
      const wash = ctx.createRadialGradient(W / 2, sh, 4, W / 2, sh, Math.max(cw * 0.6, sh * 1.4));
      wash.addColorStop(0, 'rgba(255,170,80,' + (0.28 * L) + ')'); wash.addColorStop(0.6, 'rgba(200,90,40,' + (0.1 * L) + ')'); wash.addColorStop(1, 'rgba(120,40,20,0)');
      ctx.fillStyle = wash; ctx.fillRect(g.px0, 0, g.px1 - g.px0, sh);
    }
    // 每盏灯一道朝幕布的光锥，幕上一片光斑，台板上一点反光，空气里几粒浮尘
    const ls = Math.max(0.5, Math.min(1.75, sh / 150)), seen = Math.min(S.lamps.length, 12);
    ctx.beginPath(); ctx.rect(g.cx0, 0, cw, sh); ctx.clip();
    for (let i = 0; i < seen; i++) {
      const l = S.lamps[i], a = l.t < 0 ? 1 : Math.min(1, (S.t - l.t) / 0.6), k = a * (i < LIT_FULL ? 1 : 0.55), p = lampAt(i, g);
      const top = ch * 0.08, spread = Math.max(cw * 0.06, 34 * ls);
      const cone = ctx.createLinearGradient(0, p.y - 10 * ls, 0, top); cone.addColorStop(0, 'rgba(255,190,110,' + (0.32 * k) + ')'); cone.addColorStop(1, 'rgba(255,150,70,0)');
      ctx.fillStyle = cone; ctx.beginPath(); ctx.moveTo(p.x - 5 * ls, p.y - 12 * ls); ctx.lineTo(p.x - spread, top); ctx.lineTo(p.x + spread, top); ctx.lineTo(p.x + 5 * ls, p.y - 12 * ls); ctx.closePath(); ctx.fill();
      const pool = ctx.createRadialGradient(p.x, ch * 0.62, 2, p.x, ch * 0.62, spread * 1.3); pool.addColorStop(0, 'rgba(255,140,70,' + (0.3 * k) + ')'); pool.addColorStop(1, 'rgba(255,120,60,0)');
      ctx.fillStyle = pool; ctx.fillRect(p.x - spread * 1.3, ch * 0.62 - spread * 1.3, spread * 2.6, spread * 2.6);
      const ref = ctx.createRadialGradient(p.x, p.y + 1, 1, p.x, p.y + 1, 22 * ls); ref.addColorStop(0, 'rgba(255,200,120,' + (0.4 * k) + ')'); ref.addColorStop(1, 'rgba(255,160,80,0)');
      ctx.fillStyle = ref; ctx.save(); ctx.translate(p.x, p.y + 1); ctx.scale(1.8, 0.4); ctx.translate(-p.x, -p.y - 1); ctx.fillRect(p.x - 22 * ls, p.y - 21 * ls, 44 * ls, 44 * ls); ctx.restore();
      ctx.fillStyle = 'rgba(255,225,170,' + (0.55 * k) + ')';
      for (let j = 0; j < 5; j++) { const u = ((S.t * 0.05 + j * 0.21 + i * 0.13) % 1), yy = p.y - 14 * ls - (p.y - top) * u, xx = p.x + Math.sin(j * 2.1 + i + S.t * 0.4) * spread * u * 0.7; ctx.fillRect(xx, yy, 1.4, 1.4); }
    }
    ctx.restore();
    // 台口轮廓：暗场里也认得出金框
    ctx.strokeStyle = 'rgba(232,200,120,' + (0.18 + 0.2 * (1 - L)) + ')'; ctx.lineWidth = 1;
    ctx.strokeRect(g.cx0 + 0.5, 0.5, cw - 1, sh - 6); ctx.strokeRect(g.px0 + 0.5, 0.5, g.px1 - g.px0 - 1, sh - 6);
    ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(247,220,154,' + (0.45 + 0.55 * L) + ')'; ctx.font = '600 15px "PingFang SC","Hiragino Sans GB",sans-serif';
    if (open < 0.3) { ctx.globalAlpha = 1 - open / 0.3; ctx.fillText('戏 台', W / 2, ch - (g.short ? 10 : 18)); ctx.globalAlpha = 1; }
    if (g.short) { ctx.font = '500 12px sans-serif'; ctx.fillStyle = 'rgba(247,220,154,.75)'; ctx.fillText(SHOW.troupe + ' · 《' + SHOW.name + '》', W / 2, ch + 26); }
    for (let i = 0; i < Math.min(S.lamps.length, 12); i++) { const l = S.lamps[i], a = l.t < 0 ? 1 : Math.min(1, (S.t - l.t) / 0.6), p = lampAt(i, g); lantern(p.x, p.y - (1 - a) * 6, a, ls * (Math.floor(i / LAMP_SLOTS.length) ? 0.8 : 1)); }
    // 台口左侧的节目单（可点）
    const b = g.book; ctx.save(); ctx.translate(b.x, b.y); ctx.fillStyle = '#efe6d2'; roundRect(0, 0, b.w, b.h, 2); ctx.fill(); ctx.fillStyle = '#9b2d20'; ctx.fillRect(0, 0, 4, b.h); ctx.fillStyle = '#2a1e16'; ctx.font = (g.short ? 7 : 9) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('节目单', b.w / 2 + 2, b.h / 2 + 3); ctx.restore();
    ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(243,233,214,.6)'; ctx.font = '11px sans-serif'; ctx.fillText('台前灯 ' + S.lamps.length + ' 盏', 10, sh + 20);
    ctx.textAlign = 'right'; ctx.fillText('第 ' + S.me.hall + ' 厅 · ' + humansHere() + ' 人', W - 10, sh + 20);
  }
  function drawHouse(g) {                                   // 墙、壁灯、阶梯地面与过道小灯
    ctx.fillStyle = grad(ctx, 0, 0, 0, H, [[0, '#24170f'], [1, '#140c08']]); ctx.fillRect(0, 0, W, H);
    if (g.px0 > 40) for (const [x0, x1] of [[0, g.px0], [g.px1, W]]) {
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2; for (let x = x0 + 18; x < x1 - 8; x += 44) { ctx.strokeRect(x, 16, 32, g.stageH - 30); ctx.strokeRect(x, g.stageH + 40, 32, H - g.stageH - 60); }
      ctx.fillStyle = 'rgba(201,162,74,.22)'; ctx.fillRect(x0, g.stageH + 28, x1 - x0, 2);
      const sx = (x0 + x1) / 2, sy = g.stageH * 0.42, k = 0.25 + 0.75 * S.light;
      const glow = ctx.createRadialGradient(sx, sy, 1, sx, sy, 40); glow.addColorStop(0, 'rgba(255,190,110,' + (0.35 * k) + ')'); glow.addColorStop(1, 'rgba(255,150,70,0)');
      ctx.fillStyle = glow; ctx.fillRect(sx - 40, sy - 40, 80, 80); ctx.fillStyle = 'rgba(255,214,150,' + (0.4 + 0.5 * k) + ')'; roundRect(sx - 4, sy - 6, 8, 12, 3); ctx.fill();
      ctx.fillStyle = '#6e4a18'; ctx.fillRect(sx - 6, sy + 6, 12, 2.5);
    }
    for (let r = 0; r < D.ROWS; r++) {
      const y0 = g.top - g.pitch * 0.32 + g.pitch * r, y1 = y0 + g.pitch, half = g.cell * D.COLS * rowScale(r) / 2 + g.cell * 0.32;
      const fx0 = g.px0 > 40 ? g.px0 : 0, fx1 = g.px0 > 40 ? g.px1 : W;
      ctx.fillStyle = grad(ctx, 0, y0, 0, y1, [[0, '#2c1b13'], [0.08, '#22150e'], [1, '#170e09']]); ctx.fillRect(fx0, y0, fx1 - fx0, y1 - y0);
      ctx.fillStyle = bake.carpet; ctx.fillRect(fx0, y0, fx1 - fx0, y1 - y0);
      ctx.fillStyle = 'rgba(201,162,74,.16)'; ctx.fillRect(fx0, y0, fx1 - fx0, 1);
      for (const x of [W / 2 - half, W / 2 + half]) { ctx.fillStyle = 'rgba(255,190,110,' + (0.25 + 0.55 * S.light) + ')'; ctx.fillRect(x - 5, y0 + g.pitch * 0.55, 10, 2.5); }
    }
  }
  const HAIR = ['#2a1d16', '#3b2a1e', '#1f1a17', '#4a3324', '#5c4a3c', '#2e2622', '#6a5a4c'];
  function hairOf(o) { let h = 0; const s = String(o.id || o.label || 'me'); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return HAIR[h % HAIR.length]; }
  function drawSeat(p, s, bw, bh, row, col, state) {        // 从背后看的一张剧场椅：坐垫（空座露出）、扶手、丝绒椅背、铜号牌
    const x = p.x, yt = p.y - bh * 0.15, L = Math.max(0, Math.min(1, S.lit));
    if (state.me && state.part === 'back') { const gl = ctx.createRadialGradient(x, yt + bh * 0.3, 2, x, yt + bh * 0.3, bw * 0.95); gl.addColorStop(0, 'rgba(247,210,120,.35)'); gl.addColorStop(1, 'rgba(247,210,120,0)'); ctx.fillStyle = gl; ctx.fillRect(x - bw, yt + bh * 0.3 - bw, bw * 2, bw * 2); }
    if (state.part === 'back' || state.part === 'all') {
      if (state.empty) {                                    // 空座：坐垫放平，从椅背上沿露出一块红丝绒
        ctx.fillStyle = grad(ctx, 0, yt - bh * 0.22, 0, yt + 2, [[0, '#5a1c14'], [0.5, '#7e2a1e'], [1, '#3a0f0a']]); roundRect(x - bw * 0.36, yt - bh * 0.16, bw * 0.72, bh * 0.2, bh * 0.1); ctx.fill();
        ctx.fillStyle = 'rgba(255,200,170,' + (0.12 + 0.15 * L) + ')'; ctx.fillRect(x - bw * 0.3, yt - bh * 0.145, bw * 0.6, Math.max(1, bh * 0.025));
      }
      return;
    }
    // 扶手（深色木，顶上一道亮边）
    for (const sx of [-1, 1]) {
      const ax = x + sx * bw * 0.5 - bw * 0.055, aw = bw * 0.11;
      ctx.fillStyle = grad(ctx, ax, 0, ax + aw, 0, [[0, '#1e120a'], [0.5, '#4a3020'], [1, '#1e120a']]); ctx.fillRect(ax, yt + bh * 0.28, aw, bh * 0.8);
      ctx.fillStyle = '#6a4a30'; roundRect(ax - aw * 0.15, yt + bh * 0.24, aw * 1.3, bh * 0.1, aw * 0.3); ctx.fill();
    }
    // 椅背：圆顶丝绒，上沿受台口光
    const r = bw * 0.24;
    ctx.fillStyle = grad(ctx, 0, yt, 0, yt + bh, [[0, '#b2402e'], [0.18, '#8e2c1f'], [0.7, '#6a1f16'], [1, '#3e110b']]);
    ctx.beginPath(); ctx.moveTo(x - bw * 0.46, yt + bh); ctx.lineTo(x - bw * 0.46, yt + r); ctx.quadraticCurveTo(x - bw * 0.46, yt, x - bw * 0.46 + r, yt); ctx.lineTo(x + bw * 0.46 - r, yt); ctx.quadraticCurveTo(x + bw * 0.46, yt, x + bw * 0.46, yt + r); ctx.lineTo(x + bw * 0.46, yt + bh); ctx.closePath(); ctx.fill();
    ctx.fillStyle = bake.velvet; ctx.fill();
    const seam = yt + bh * 0.34;                              // 椅背上的软包分缝：一道暗缝压一道亮边
    ctx.fillStyle = 'rgba(30,6,4,.45)'; ctx.fillRect(x - bw * 0.44, seam, bw * 0.88, Math.max(1, bh * 0.025));
    ctx.fillStyle = 'rgba(255,190,160,.1)'; ctx.fillRect(x - bw * 0.44, seam + Math.max(1, bh * 0.025), bw * 0.88, Math.max(1, bh * 0.03));
    ctx.fillStyle = 'rgba(20,4,2,.3)'; for (const k of [-0.2, 0.2]) ctx.fillRect(x + k * bw - 0.5, seam + bh * 0.1, 1, bh * 0.5);
    ctx.beginPath(); ctx.moveTo(x - bw * 0.46, yt + bh); ctx.lineTo(x - bw * 0.46, yt + r); ctx.quadraticCurveTo(x - bw * 0.46, yt, x - bw * 0.46 + r, yt); ctx.lineTo(x + bw * 0.46 - r, yt); ctx.quadraticCurveTo(x + bw * 0.46, yt, x + bw * 0.46, yt + r); ctx.lineTo(x + bw * 0.46, yt + bh); ctx.closePath();
    ctx.fillStyle = grad(ctx, x - bw * 0.46, 0, x + bw * 0.46, 0, [[0, 'rgba(0,0,0,.35)'], [0.2, 'rgba(0,0,0,0)'], [0.8, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.35)']]); ctx.fill();
    ctx.strokeStyle = state.me ? '#f7dc9a' : 'rgba(255,190,150,' + (0.18 + 0.3 * L * (1.2 - row * 0.25)) + ')'; ctx.lineWidth = state.me ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(x - bw * 0.46 + 1, yt + r); ctx.quadraticCurveTo(x - bw * 0.46 + 1, yt + 1, x - bw * 0.46 + r, yt + 1); ctx.lineTo(x + bw * 0.46 - r, yt + 1); ctx.quadraticCurveTo(x + bw * 0.46 - 1, yt + 1, x + bw * 0.46 - 1, yt + r); if (state.me) { ctx.lineTo(x + bw * 0.46 - 1, yt + bh - 1); ctx.lineTo(x - bw * 0.46 + 1, yt + bh - 1); ctx.closePath(); } ctx.stroke();
    // 铜号牌：几排几座
    const pw = Math.max(12, bw * 0.3), ph = Math.max(6, bh * 0.15), py = yt + bh * 0.14;
    ctx.fillStyle = grad(ctx, 0, py, 0, py + ph, state.me ? [[0, '#fff0b8'], [1, '#c9a24a']] : [[0, '#e8c878'], [1, '#8a6424']]); roundRect(x - pw / 2, py, pw, ph, ph * 0.3); ctx.fill();
    if (ph >= 7) { ctx.fillStyle = '#3a240a'; ctx.font = '600 ' + Math.round(ph * 0.78) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.fillText((row + 1) + '-' + (col + 1), x, py + ph * 0.8); }
  }
  function drawPerson(o, x, yt, s) {                        // 从背后看：头发、耳朵、脖子、肩膀，下半身在椅背后
    s = s || 1;
    const isR = o.kind === 'resident', isMe = o.kind === 'me';
    if (o.glow && S.t - o.glow < 2.5) { const k = 1 - (S.t - o.glow) / 2.5; ctx.fillStyle = 'rgba(247,220,154,' + (0.35 * k) + ')'; ctx.beginPath(); ctx.arc(x, yt - 10 * s, 22 * s, 0, Math.PI * 2); ctx.fill(); }
    ctx.save(); if (isR) ctx.globalAlpha = 0.55; else if (o.kind === 'ghost') ctx.globalAlpha = 0.85;
    const dx = o.pose === 'shift' ? Math.sin(S.t * 8) * 1.5 * s : 0, lift = (o.pose === 'look' || o.pose === 'snap' ? -3 : o.pose === 'nod' ? 2 : 0) * s;
    const cx = x + dx, shY = yt - 9 * s, hy = yt - 19 * s + lift, skin = isR ? '#9a9a9a' : C.skin;
    // 肩背：圆肩梯形，衣服颜色，两侧压暗
    ctx.fillStyle = o.color; ctx.beginPath(); ctx.moveTo(cx - 15 * s, yt + 6 * s); ctx.quadraticCurveTo(cx - 15 * s, shY, cx - 8 * s, shY - 1 * s); ctx.lineTo(cx + 8 * s, shY - 1 * s); ctx.quadraticCurveTo(cx + 15 * s, shY, cx + 15 * s, yt + 6 * s); ctx.closePath(); ctx.fill();
    if (!isR) { ctx.fillStyle = grad(ctx, cx - 15 * s, 0, cx + 15 * s, 0, [[0, 'rgba(0,0,0,.35)'], [0.35, 'rgba(255,255,255,.08)'], [0.65, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.35)']]); ctx.fill(); }
    if (o.pose === 'clap') { ctx.fillStyle = skin; const w = Math.sin(S.t * 18) * 2.5 * s; ctx.beginPath(); ctx.arc(cx - 11 * s + w, shY - 3 * s, 3 * s, 0, Math.PI * 2); ctx.arc(cx + 11 * s - w, shY - 3 * s, 3 * s, 0, Math.PI * 2); ctx.fill(); }
    if (o.pose === 'lamp') { ctx.strokeStyle = o.color; ctx.lineWidth = 4 * s; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx + 10 * s, shY + 1 * s); ctx.lineTo(cx + 14 * s, hy - 2 * s); ctx.stroke(); ctx.fillStyle = 'rgba(255,200,120,.35)'; ctx.beginPath(); ctx.arc(cx + 14 * s, hy - 6 * s, 6 * s, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#e8743a'; ctx.beginPath(); ctx.ellipse(cx + 14 * s, hy - 6 * s, 3 * s, 3.5 * s, 0, 0, Math.PI * 2); ctx.fill(); }
    // 脖子、耳朵、后脑
    ctx.fillStyle = skin; ctx.fillRect(cx - 3 * s, hy + 4 * s, 6 * s, shY - hy - 2 * s);
    ctx.beginPath(); ctx.ellipse(cx - 7.6 * s, hy + 1 * s, 1.8 * s, 2.6 * s, 0, 0, Math.PI * 2); ctx.ellipse(cx + 7.6 * s, hy + 1 * s, 1.8 * s, 2.6 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = isR ? '#8a8a8a' : hairOf(o); ctx.beginPath(); ctx.ellipse(cx, hy, 7.6 * s, 8.4 * s, 0, 0, Math.PI * 2); ctx.fill();
    if (!isR) { ctx.fillStyle = 'rgba(255,230,200,.16)'; ctx.beginPath(); ctx.ellipse(cx - 2.2 * s, hy - 3.6 * s, 3 * s, 2 * s, -0.5, 0, Math.PI * 2); ctx.fill(); }
    if (o.pose === 'snap') { ctx.fillStyle = '#1a120c'; ctx.fillRect(cx - 5 * s, hy - 19 * s, 10 * s, 7 * s); ctx.fillStyle = '#f7dc9a'; ctx.beginPath(); ctx.arc(cx + 2.5 * s, hy - 16.5 * s, 1.4 * s, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = skin; ctx.fillRect(cx - 6.5 * s, hy - 14 * s, 2.5 * s, 6 * s); }
    if (isMe) { ctx.strokeStyle = '#f7dc9a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, hy + 4 * s, 15 * s, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  }
  function personLabel(o, x, y, s, maxW) {                  // 名签贴在椅背下半，深底浅字；比列宽还宽就缩字
    const isR = o.kind === 'resident'; let fs = Math.max(8, Math.min(13, Math.round((isR ? 9 : 10) * Math.min(s, 1.3))));
    const lines = o === S.usher ? ['领位人', '· 非真人'] : [o.label];
    ctx.textAlign = 'center';
    for (; fs > 7; fs--) { ctx.font = fs + 'px sans-serif'; if (!maxW || Math.max(...lines.map((t) => ctx.measureText(t).width)) + 8 <= maxW * 0.96) break; }
    ctx.font = fs + 'px sans-serif';
    const w = Math.max(...lines.map((t) => ctx.measureText(t).width)) + 8, h = lines.length * (fs + 2) + 3;
    ctx.fillStyle = 'rgba(20,10,6,.62)'; roundRect(x - w / 2, y - fs - 1, w, h, 3); ctx.fill();
    ctx.fillStyle = isR ? 'rgba(210,210,210,.85)' : 'rgba(243,233,214,.95)';
    lines.forEach((t, i) => ctx.fillText(t, x, y + i * (fs + 2)));
  }
  function bubbleAt(o, x, y, s) {
    if (o.bubble && S.t - o.bubble.t < 2.4) { const k = (S.t - o.bubble.t) / 2.4; ctx.globalAlpha = 1 - k; ctx.font = Math.round(16 * Math.min(s, 1.6)) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText(o.bubble.text, x, y - k * 10); ctx.globalAlpha = 1; }
  }
  function draw() {
    if (!S) return;
    const g = geom();
    if (!bake || bake.key !== W + 'x' + H + 'x' + DPR) bakeLayers(g);
    drawHouse(g);
    drawStage(g);
    const meObj = { kind: 'me', color: C.me, label: '我', pose: S.mePose, bubble: S.meBubble, glow: S.meGlow };
    const others = hereOthers(), tags = [];
    for (let r = 0; r < D.ROWS; r++) {                       // 远排先画，近排的人和椅背压住远排下沿
      const rs = rowScale(r), bw = g.seatW * rs, bh = g.seatH * rs, s = g.ps * rs, row = [];
      for (let c = 0; c < D.COLS; c++) {
        const i = r * D.COLS + c, p = seatPos(i, g);
        const o = S.phase !== 'door' && S.me.seat === i ? meObj : others.find((q) => q.seat === i) || null;
        row.push({ i, c, p, o });
      }
      for (const q of row) drawSeat(q.p, s, bw, bh, r, q.c, { part: 'back', empty: !q.o, me: q.o === meObj });
      for (const q of row) if (q.o) drawPerson(q.o, q.p.x, q.p.y - bh * 0.15, s);
      for (const q of row) drawSeat(q.p, s, bw, bh, r, q.c, { part: 'front', empty: !q.o, me: q.o === meObj });
      for (const q of row) if (q.o) tags.push([q.o, q.p.x, q.p.y - bh * 0.15, bh, s, g.cell * rs]);
    }
    for (const [o, x, yt, , s] of tags) bubbleAt(o, x, yt - 27 * s, s);
    for (const [o, x, yt, bh, s, w] of tags) personLabel(o, x, yt + bh * 0.62, s, w);   // 名签最后画：不被后排举手和气泡挡住
    if (S.phase === 'door') { const s = Math.min(g.ps, 1.3), y = H - 4; drawPerson({ kind: 'me', color: C.me, label: '我', pose: 'stand', glow: 0 }, W / 2, y - 6 * s, s); personLabel(meObj, W / 2, y - 22 * s, s); bubbleAt({ bubble: S.meBubble }, W / 2, y - 50 * s, s); }
    // 拍立得：每个座位最多叠三张，摆在座位右上
    const bySeat = {}; for (const s of S.snaps) { (bySeat[s.seat] = bySeat[s.seat] || []).push(s); }
    for (const k of Object.keys(bySeat)) { const p = seatPos(Number(k), g); const list = bySeat[k].slice(-3); list.forEach((s, i) => { const a = Math.min(1, (S.t - s.t) / 0.5); const w = 12 * g.ps, h = 14 * g.ps; ctx.save(); ctx.globalAlpha = a; ctx.translate(p.x + 18 * g.ps + i * 4, p.y - 22 * g.ps - i * 3); ctx.rotate(-0.15 + i * 0.12); ctx.fillStyle = '#f3e9d6'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#5a1f16'; ctx.fillRect(1.5, 1.5, w - 3, h - 5); ctx.restore(); }); }
    for (const e of S.effects) {
      const k = (S.t - e.t) / (e.kind === 'tea' ? 1.4 : 1.0);
      if (e.kind === 'ripple') { const p = seatPos(e.seat, g); ctx.strokeStyle = 'rgba(247,220,154,' + (0.6 * (1 - k)) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y - 12 * g.ps, (14 + k * 34) * g.ps, 0, Math.PI * 2); ctx.stroke(); }
      if (e.kind === 'tea') { const a = seatPos(e.from, g), b = seatPos(e.to, g); const ease = k < 0.5 ? 2 * k * k : -1 + (4 - 2 * k) * k; const x = a.x + (b.x - a.x) * ease, y = a.y - 30 + (b.y - a.y) * ease - Math.sin(k * Math.PI) * 22; ctx.font = Math.round(16 * g.ps) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🍵', x, y); }
    }
    if (S.gift.ticket) {
      const p = seatPos(S.me.seat, g);
      ctx.fillStyle = '#efe6d2'; ctx.fillRect(p.x + 15 * g.ps, p.y - 14 * g.ps, 18 * g.ps, 12 * g.ps);
      ctx.strokeStyle = '#9b2d20'; ctx.strokeRect(p.x + 25 * g.ps, p.y - 10 * g.ps, 5 * g.ps, 5 * g.ps);
    }
    // 场灯：二铃起渐暗（只暗观众席，戏台留着）
    if (S.light < 1) { ctx.fillStyle = 'rgba(8,4,2,' + (0.8 * (1 - S.light)) + ')'; ctx.fillRect(0, g.stageH + 20, W, H - g.stageH - 20); }
    if (S.flash >= 0 && S.t - S.flash < 0.35) { ctx.fillStyle = 'rgba(255,255,255,' + (0.7 * (1 - (S.t - S.flash) / 0.35)) + ')'; ctx.fillRect(0, 0, W, g.stageH); }
    if (S.gongFlash && S.t - S.gongFlash < 0.9) { ctx.fillStyle = 'rgba(247,220,154,' + (0.35 * (1 - (S.t - S.gongFlash) / 0.9)) + ')'; ctx.fillRect(0, 0, W, H); }
  }

  // ---------- 合影：今晚谁来过 ----------
  function photo() {
    const pw = 720, scale = (pw - 120) / W, hallH = H * scale, ph = Math.round(240 + hallH + 230 + (S.gift.ticket ? 180 : 0));
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
    if (S.gift.ticket) drawTicket(x, (pw - 420) / 2, ph - 234, S.gift.ticket);
    x.font = '16px sans-serif'; x.fillStyle = 'rgba(200,200,200,.6)'; x.fillText('灰色身影为候场布置，不是真人 · 带「你」的是你自己前几次来的回放', pw / 2, ph - 44);
    el('photoImg').alt = S.gift.ticket ? '合影图：一杯茶的回礼，领位人 · 非真人，纸票盖有' + seatName(S.gift.ticket.seat) + '小章' : '合影图：戏台、座席上的人影与名单';
    el('photoGiftExit').hidden = !giftActive();
    el('photoImg').src = c.toDataURL('image/png'); show('photoOverlay'); S.lastSound = 'photo';
  }
  function drawTicket(x, left, top, ticket) {
    x.save(); x.translate(left, top); x.fillStyle = '#efe6d2'; x.fillRect(0, 0, 420, 146);
    x.strokeStyle = '#9b2d20'; x.lineWidth = 1; x.strokeRect(7, 7, 406, 132);
    x.textAlign = 'left'; x.fillStyle = '#2a2118'; x.font = '26px sans-serif'; x.fillText('今晚 · 《' + SHOW.name + '》', 20, 40);
    x.font = '20px sans-serif'; x.fillText('一杯茶的回礼', 20, 75);
    x.font = '15px sans-serif'; x.fillText('领位人 · 非真人', 20, 103); x.fillText('候场纪念 · 非入场凭证', 20, 126);
    x.translate(330, 73); x.rotate(-0.12); x.strokeStyle = '#9b2d20'; x.lineWidth = 3; x.strokeRect(-61, -44, 122, 88);
    x.fillStyle = '#9b2d20'; x.textAlign = 'center'; x.font = '21px sans-serif'; x.fillText('第 ' + ticket.hall + ' 厅', 0, -12); x.font = '19px sans-serif'; x.fillText(seatName(ticket.seat), 0, 18); x.restore();
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
    else if (o === S.usher) hint('领位人 · 非真人，递茶后回赠纸票');
    else if (o.kind === 'resident') hint('这是候场身影，不是真人');
    else if (o.kind === 'ghost') hint(o.label + ' 坐在这儿');
  });
  bar.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.act !== undefined) act(Number(b.dataset.act)); else if (b.id === 'btnPhoto') { unlockAudio(); photo(); } });
  el('gongBtn').addEventListener('click', () => { unlockAudio(); gong(false); });
  el('infoBtn').addEventListener('click', () => openProgramme(0));
  el('soundBtn').addEventListener('click', () => setMuted(!muted));
  el('progPrev').addEventListener('click', () => flip(-1));
  el('progNext').addEventListener('click', () => flip(1));
  el('giftSkip').addEventListener('click', exitGift);
  el('nextShowBtn').addEventListener('click', () => nextShow());
  el('curtainGiftBtn').addEventListener('click', startGift);
  el('photoGiftExit').addEventListener('click', exitGift);
  el('curtainPhotoBtn').addEventListener('click', () => { hide('curtainOverlay'); photo(); });
  for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', () => closeOverlay(b.dataset.close));
  window.addEventListener('keydown', (e) => {
    if (e.key >= '1' && e.key <= '5') act(Number(e.key) - 1);
    else if (e.key === 'm' || e.key === 'M') setMuted(!muted); else if (e.key === 'p' || e.key === 'P') photo();
    else if (e.key === 'b' || e.key === 'B') openProgramme(0); else if (e.key === 's' || e.key === 'S') act(5);
    else if (e.key === 'ArrowLeft' && el('programmeOverlay').classList.contains('show')) flip(-1);
    else if (e.key === 'ArrowRight' && el('programmeOverlay').classList.contains('show')) flip(1);
    else if (e.key === 'Escape') {
      for (const o of document.querySelectorAll('.overlay.show')) hide(o.id);
      if (S.phase === 'curtain') show('curtainOverlay');
    }
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
      gift: { ...S.gift }, giftReplay: S.giftReplay, usher: S.usher ? { seat: S.usher.seat, label: S.usher.label } : null,
      curtainOverlay: el('curtainOverlay').classList.contains('show'), frameStamp,
    };
  }
  window.__foyer = {
    get ready() { return !!S; }, act, snapshot, canAct, gong, photo, openProgramme, flip, nextShow, clearVisits, get state() { return S; }, get visits() { return visits; }, get frameStamp() { return frameStamp; },
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

  updateSoundButton(); resize(); visits = loadVisits(); enterHall(); requestAnimationFrame(frame);
})();
