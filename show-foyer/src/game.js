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
    resident: '#493028', skin: '#f5d9b8',
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
    const desktop = W >= 700 && !short, pad = Math.min(24, W * 0.06);
    const stageH = short ? H * 0.3 : desktop ? Math.min(H * 0.53, W * 0.94 / 2.4) : H * 0.42;
    const top = stageH + (short ? 30 : 20), bottom = H - (short ? 14 : 24);
    const pitch = (bottom - top) / D.ROWS;
    const cell = Math.min((W - 2 * (pad + 4)) / D.COLS, Math.max(pitch * (desktop ? 2.15 : 1.6), 120));
    const seatW = Math.min(cell * 0.94, pitch * (desktop ? 1.96 : short ? 1 : 1.5));
    const seatH = seatW * (desktop ? 0.43 : 0.6);
    const ps = Math.max(0.55, seatW / (desktop ? 70 : 56));
    const left = W / 2 - cell * D.COLS / 2, right = W / 2 + cell * D.COLS / 2;
    const pw = desktop ? stageH * 2.4 : Math.min(W, Math.max(cell * D.COLS * 1.75, W * 0.6));
    const px0 = (W - pw) / 2, px1 = px0 + pw;
    const col = Math.max(7, Math.min(short ? 12 : 42, pw * 0.045));
    const curtainH = stageH * (short ? 0.72 : 0.83);
    const book = { x: 8, y: curtainH + (short ? 4 : 6), w: short ? 26 : 34, h: short ? 18 : 24 };   // 台口左侧的节目单
    return { stageH, curtainH, top, bottom, left, right, pitch, cell, seatW, seatH, ps, short, desktop, book, px0, px1, col, cx0: px0 + col, cx1: px1 - col };
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

  // Relief ornament is baked once. Offset dark and light edges give each leaf a bevel.
  function scrollwork(c, x, y, length, width) {
    c.save(); c.translate(x, y);
    const count = Math.max(1, Math.round(length / (width * 2.5))), step = length / count;
    for (let i = 0; i < count; i++) {
      c.save(); c.translate(i * step, 0); c.scale(step, width);
      for (const [dy, colour, weight] of [[0.06, '#492408', 0.14], [0, '#c38831', 0.095], [-0.035, '#f4c66f', 0.023]]) {
        c.strokeStyle = colour; c.lineWidth = weight; c.lineCap = 'round';
        c.beginPath(); c.moveTo(0, 0.12); c.bezierCurveTo(0.32, 0.55, 0.64, -0.5, 0.9, -0.05 + dy);
        c.bezierCurveTo(1.14, 0.38, 0.59, 0.45, 0.64, 0.08 + dy); c.bezierCurveTo(0.68, -0.1, 0.85, -0.05, 0.8, 0.08 + dy); c.stroke();
      }
      for (const [lx, ly, sign] of [[0.22, 0.1, -1], [0.4, -0.02, -1], [0.47, 0.08, 1]]) {
        c.fillStyle = '#ce9038'; c.beginPath(); c.moveTo(lx, ly); c.bezierCurveTo(lx - 0.05, ly + sign * 0.4, lx + 0.18, ly + sign * 0.45, lx + 0.17, ly + sign * 0.55); c.bezierCurveTo(lx + 0.4, ly + sign * 0.12, lx + 0.12, ly + sign * 0.16, lx, ly); c.fill();
        c.strokeStyle = '#f1bf65'; c.lineWidth = 0.018; c.beginPath(); c.moveTo(lx, ly); c.quadraticCurveTo(lx + 0.16, ly + sign * 0.22, lx + 0.17, ly + sign * 0.46); c.stroke();
      }
      c.restore();
    }
    c.restore();
  }
  function rosette(c, x, y, radius) {
    c.save(); c.translate(x, y);
    for (let i = 0; i < 8; i++) {
      c.rotate(Math.PI / 4); c.fillStyle = grad(c, 0, -radius, radius * 0.4, 0, [[0, '#f6c76f'], [0.45, '#ce8d32'], [1, '#684013']]);
      c.beginPath(); c.ellipse(0, -radius * 0.48, radius * 0.22, radius * 0.48, -0.18, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#e6ad55'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -radius * 0.8); c.stroke();
    }
    c.fillStyle = '#f5cb76'; c.beginPath(); c.arc(0, 0, radius * 0.22, 0, Math.PI * 2); c.fill(); c.restore();
  }
  function bakeLayers(g) {
    const R = D.rng(7), sh = g.stageH, ch = g.curtainH, cw = g.cx1 - g.cx0;
    const hw = cw / 2 + 4, [cur, c] = layer(hw, ch);
    c.fillStyle = '#210509'; c.fillRect(0, 0, hw, ch);
    // Unequal fold widths and a slightly curved ridge keep the velvet from reading as stripes.
    const fw0 = Math.max(14, Math.min(40, cw / 23));
    for (let x = -fw0 * 0.3; x < hw;) {
      const fw = fw0 * (0.7 + R() * 0.65), lean = (R() - 0.5) * fw * 0.22;
      c.fillStyle = grad(c, x, 0, x + fw, 0, [[0, '#1d0408'], [0.16, '#400810'], [0.38, '#8b1723'], [0.53, '#bd343b'], [0.62, '#9e232e'], [0.8, '#570a14'], [1, '#200408']]);
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x + fw, 0); c.bezierCurveTo(x + fw + lean, ch * 0.35, x + fw - lean, ch * 0.75, x + fw, ch - 8); c.quadraticCurveTo(x + fw / 2, ch - 4, x, ch - 8); c.bezierCurveTo(x - lean, ch * 0.7, x + lean, ch * 0.3, x, 0); c.fill();
      c.strokeStyle = 'rgba(245,112,99,.11)'; c.lineWidth = Math.max(0.6, fw * 0.025); c.beginPath(); c.moveTo(x + fw * 0.53, ch * 0.15); c.bezierCurveTo(x + fw * 0.53 + lean, ch * 0.4, x + fw * 0.53 - lean, ch * 0.7, x + fw * 0.53, ch - 12); c.stroke();
      x += fw;
    }
    c.fillStyle = grad(c, 0, 0, 0, ch, [[0, 'rgba(0,0,0,.75)'], [0.24, 'rgba(0,0,0,.18)'], [0.65, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.25)']]); c.fillRect(0, 0, hw, ch);
    for (let i = 0, n = Math.round(hw * ch / 11); i < n; i++) { c.fillStyle = R() < 0.5 ? 'rgba(255,160,150,.055)' : 'rgba(0,0,0,.15)'; c.fillRect(R() * hw, R() * ch, 0.6, 0.7 + R() * 1.4); }
    const fringe = Math.max(5, ch * 0.027);
    c.strokeStyle = '#cc963b'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, ch - fringe - 2); c.quadraticCurveTo(hw / 2, ch - fringe + 3, hw, ch - fringe - 2); c.stroke();
    for (let x = 0; x < hw; x += 2.5) { const yy = ch - fringe - 2 + Math.sin(x / hw * Math.PI) * 2; c.fillStyle = x % 5 < 2.5 ? '#edbd60' : '#805018'; c.fillRect(x, yy, 1.3, fringe * (0.75 + 0.25 * Math.sin(x * 1.7))); }

    const [fr, f] = layer(W, sh + 10), ay0 = ch, ay1 = sh - 6;
    // Satin varnish over staggered boards, with the red curtain reflected in the grain.
    f.fillStyle = grad(f, 0, ay0, 0, ay1, [[0, '#45241e'], [0.45, '#75422c'], [1, '#412217']]); f.fillRect(g.px0, ay0, g.px1 - g.px0, ay1 - ay0);
    f.save(); f.beginPath(); f.rect(g.px0, ay0, g.px1 - g.px0, ay1 - ay0); f.clip();
    const rows = 6;
    for (let k = 0; k < rows; k++) {
      const y0 = ay0 + (ay1 - ay0) * Math.pow(k / rows, 1.35), y1 = ay0 + (ay1 - ay0) * Math.pow((k + 1) / rows, 1.35), ph = y1 - y0;
      for (let x = g.px0 - R() * 150; x < g.px1;) {
        const len = 80 + R() * 150;
        f.fillStyle = 'rgba(' + (90 + R() * 50 | 0) + ',' + (42 + R() * 25 | 0) + ',' + (23 + R() * 15 | 0) + ',.28)'; f.fillRect(x, y0, len, ph);
        f.strokeStyle = 'rgba(251,204,151,.1)'; f.lineWidth = 0.5;
        for (let j = 0; j < 4; j++) { const yy = y0 + ph * (0.15 + j * 0.2); f.beginPath(); f.moveTo(x, yy); f.bezierCurveTo(x + len * 0.3, yy - ph * 0.15, x + len * 0.6, yy + ph * 0.2, x + len, yy); f.stroke(); }
        f.fillStyle = 'rgba(18,7,4,.65)'; f.fillRect(x + len - 0.7, y0, 0.7, ph); x += len;
      }
      f.fillStyle = 'rgba(21,8,4,.7)'; f.fillRect(g.px0, y1 - 0.6, g.px1 - g.px0, 0.6);
    }
    for (let x = g.cx0; x < g.cx1; x += fw0) {
      f.fillStyle = grad(f, 0, ch, 0, ay1, [[0, 'rgba(160,23,39,.36)'], [1, 'rgba(134,18,28,0)']]); f.fillRect(x + fw0 * 0.2, ch, fw0 * 0.5, ay1 - ch);
    }
    f.restore();
    f.fillStyle = grad(f, 0, ch, 0, ch + 12, [[0, 'rgba(12,3,2,.8)'], [1, 'rgba(12,3,2,0)']]); f.fillRect(g.px0, ch, g.px1 - g.px0, 12);
    f.fillStyle = grad(f, 0, ay1, 0, sh + 10, [[0, '#c18648'], [0.08, '#e0ac65'], [0.18, '#502517'], [0.6, '#29130d'], [1, '#120807']]); f.fillRect(g.px0 - 4, ay1, g.px1 - g.px0 + 8, sh + 10 - ay1);

    // Thick double moulding, recessed scrollwork band, corner flowers and shell crest.
    const header = g.col * 0.93;
    for (const x of [g.px0, g.cx1]) {
      f.fillStyle = grad(f, x, 0, x + g.col, 0, GILT); f.fillRect(x, 0, g.col, ay1);
      f.fillStyle = '#754315'; f.fillRect(x + g.col * 0.22, header, g.col * 0.56, ay1 - header);
      for (const u of [0.08, 0.19, 0.8, 0.93]) { f.fillStyle = u < 0.5 ? '#e9b960' : '#a26924'; f.fillRect(x + g.col * u, 0, Math.max(0.8, g.col * 0.035), ay1); }
      f.save(); f.translate(x + g.col * 0.5, header); f.rotate(Math.PI / 2); scrollwork(f, 0, 0, ay1 - header - g.col * 0.6, g.col * 0.64); f.restore();
      f.fillStyle = grad(f, x, 0, x + g.col, 0, GILT); f.fillRect(x - 2, ay1 - g.col * 0.8, g.col + 4, g.col * 0.8);
      rosette(f, x + g.col / 2, ay1 - g.col * 0.4, g.col * 0.28);
    }
    f.fillStyle = grad(f, 0, 0, 0, header, GILT); f.fillRect(g.px0, 0, g.px1 - g.px0, header);
    f.fillStyle = '#6b3a11'; f.fillRect(g.px0 + 3, header * 0.21, g.px1 - g.px0 - 6, header * 0.57);
    scrollwork(f, g.px0 + g.col * 0.7, header * 0.5, g.px1 - g.px0 - g.col * 1.4, header * 0.7);
    f.fillStyle = '#e9b960'; f.fillRect(g.px0, 1, g.px1 - g.px0, 1.5); f.fillRect(g.px0, header - 3, g.px1 - g.px0, 1.5);
    for (const x of [g.px0 + g.col * 0.6, g.px1 - g.col * 0.6]) rosette(f, x, header * 0.65, g.col * 0.48);
    f.save(); f.translate(W / 2, header * 0.92);
    for (let i = -4; i <= 4; i++) {
      f.save(); f.rotate(i * 0.19); f.fillStyle = grad(f, -3, -header, 7, 0, [[0, '#f2c874'], [0.5, '#d99b3e'], [1, '#805019']]);
      f.beginPath(); f.moveTo(0, 0); f.bezierCurveTo(-header * 0.2, -header * 0.6, -header * 0.18, -header * 0.9, 0, -header * 0.86); f.bezierCurveTo(header * 0.18, -header * 0.9, header * 0.2, -header * 0.6, 0, 0); f.fill();
      f.strokeStyle = '#f8d68d'; f.lineWidth = 0.7; f.stroke(); f.restore();
    }
    rosette(f, 0, -1, header * 0.2); f.restore();
    // Light falling off the inner frame onto the velvet.
    for (const side of [-1, 1]) {
      const x = side < 0 ? g.cx0 : g.cx1, end = x + side * -g.col * 0.65;
      f.fillStyle = grad(f, x, 0, end, 0, [[0, 'rgba(8,2,2,.8)'], [1, 'rgba(8,2,2,0)']]); f.fillRect(Math.min(x, end), header, Math.abs(end - x), ch - header);
    }
    const vh = Math.max(10, ch * 0.17), swags = g.desktop ? 7 : g.short ? 7 : 5, sw = cw / swags;
    for (let i = 0; i < swags; i++) {
      const x0 = g.cx0 + i * sw, x1 = x0 + sw, ah = header - 2;
      f.fillStyle = grad(f, 0, ah, 0, ah + vh, [[0, '#24050b'], [0.32, '#70101b'], [0.68, '#a52530'], [0.82, '#5a0913'], [1, '#210409']]);
      f.beginPath(); f.moveTo(x0, ah); f.lineTo(x1, ah); f.bezierCurveTo(x1 - sw * 0.15, ah + vh * 1.1, x0 + sw * 0.15, ah + vh * 1.1, x0, ah); f.fill();
      for (const u of [0.32, 0.56, 0.78]) {
        f.strokeStyle = u === 0.56 ? 'rgba(255,102,96,.36)' : 'rgba(22,1,6,.75)'; f.lineWidth = Math.max(1, vh * 0.065);
        f.beginPath(); f.moveTo(x0 + sw * 0.06, ah + 1); f.bezierCurveTo(x0 + sw * 0.26, ah + vh * u, x1 - sw * 0.26, ah + vh * u, x1 - sw * 0.06, ah + 1); f.stroke();
      }
      f.strokeStyle = '#9d6122'; f.lineWidth = 3; f.beginPath(); f.moveTo(x0, ah + 1); f.bezierCurveTo(x0 + sw * 0.15, ah + vh * 1.1, x1 - sw * 0.15, ah + vh * 1.1, x1, ah + 1); f.stroke();
      for (let j = 0; j <= sw; j += 2.5) {
        const u = j / sw, yy = ah + vh * 3.3 * u * (1 - u);
        f.fillStyle = j % 5 < 2.5 ? '#f3c66f' : '#aa6b25'; f.fillRect(x0 + j, yy, 1.3, 4 + vh * 0.08);
      }
      f.fillStyle = '#c58e37'; f.beginPath(); f.ellipse(x1, ah + vh * 0.26, 2, vh * 0.22, 0, 0, Math.PI * 2); f.fill();
    }
    if (!g.short) {
      f.font = '500 ' + (g.desktop ? 12 : 10) + 'px "PingFang SC",sans-serif'; const label = SHOW.troupe + ' · 《' + SHOW.name + '》', tw = f.measureText(label).width + 22, th = g.desktop ? 21 : 17, ty = header + 3;
      f.fillStyle = '#c18b3e'; rr(f, W / 2 - tw / 2, ty, tw, th, 2); f.fill();
      f.fillStyle = '#35120f'; rr(f, W / 2 - tw / 2 + 1, ty + 1, tw - 2, th - 2, 2); f.fill();
      f.fillStyle = '#edca82'; f.textAlign = 'center'; f.textBaseline = 'middle'; f.fillText(label, W / 2, ty + th / 2); f.textBaseline = 'alphabetic';
    }
    const [nz, n] = layer(64, 64);
    for (let i = 0; i < 1700; i++) { n.fillStyle = R() < 0.5 ? 'rgba(255,158,139,.045)' : 'rgba(15,0,3,.1)'; n.fillRect(R() * 64, R() * 64, 0.6, 0.6 + R()); }
    const [cp, q] = layer(64, 64);
    q.strokeStyle = 'rgba(185,114,77,.045)'; q.lineWidth = 0.65;
    for (let y = -16; y <= 80; y += 32) for (let x = -16; x <= 80; x += 32) { q.beginPath(); q.moveTo(x, y - 10); q.quadraticCurveTo(x + 9, y - 2, x, y + 10); q.quadraticCurveTo(x - 9, y + 2, x, y - 10); q.stroke(); }
    for (let i = 0; i < 1300; i++) { q.fillStyle = R() < 0.5 ? 'rgba(230,153,112,.025)' : 'rgba(0,0,0,.07)'; q.fillRect(R() * 64, R() * 64, 0.6, 0.6); }
    bake = { key: W + 'x' + H + 'x' + DPR, cur, fr, hw, velvet: ctx.createPattern(nz, 'repeat'), carpet: ctx.createPattern(cp, 'repeat') };
    bake.velvet.setTransform({ a: 1 / DPR, d: 1 / DPR });
    bake.carpet.setTransform({ a: 1 / DPR, d: 1 / DPR });
    bakeHouse(g, R);
    bakeSeats(g);
    // A single soft-edged beam texture is shared by all twelve lamp positions.
    const light = lampLightAt(0, g), [beam, bc] = layer(light.spread * 2, sh);
    for (let y = Math.floor(light.top); y < light.baseY; y++) {
      const u = (y - light.top) / (light.baseY - light.top), half = light.spread + (light.baseHalfWidth - light.spread) * u;
      const strength = 0.02 + 0.25 * u;
      bc.fillStyle = grad(bc, light.spread - half, 0, light.spread + half, 0, [[0, 'rgba(255,164,80,0)'], [0.11, 'rgba(255,181,94,' + strength * 0.88 + ')'], [0.5, 'rgba(255,190,110,' + strength + ')'], [0.89, 'rgba(255,181,94,' + strength * 0.88 + ')'], [1, 'rgba(255,164,80,0)']]);
      bc.fillRect(light.spread - half, y, half * 2, 1);
    }
    bake.beam = ctx.createPattern(beam, 'no-repeat');
  }
  function bakeHouse(g, R) {
    const [house, c] = layer(W, H), sh = g.stageH;
    c.fillStyle = grad(c, 0, 0, 0, H, [[0, '#26130f'], [0.52, '#281719'], [1, '#170e10']]); c.fillRect(0, 0, W, H);
    if (g.px0 > 40) for (const [x0, x1, side] of [[0, g.px0, -1], [g.px1, W, 1]]) {
      const width = x1 - x0;
      c.fillStyle = grad(c, x0, 0, x1, 0, [[0, '#2b1713'], [0.5, '#48271c'], [1, '#2b1713']]); c.fillRect(x0, 0, width, H);
      for (let x = x0 + 10; x < x1 - 15; x += width / 3) {
        const w = width / 3 - 14;
        c.fillStyle = '#170c0a'; c.fillRect(x, 12, w, sh - 25);
        c.fillStyle = grad(c, x, 0, x + w, 0, [[0, '#422419'], [0.2, '#532d1e'], [0.85, '#341b14'], [1, '#21120e']]); c.fillRect(x + 3, 16, w - 6, sh - 33);
        c.strokeStyle = 'rgba(204,128,63,.2)'; c.lineWidth = 0.7; c.strokeRect(x + 6, 20, w - 12, sh - 41);
        c.strokeStyle = 'rgba(13,4,2,.18)';
        for (let j = 0; j < 10; j++) { const xx = x + 7 + R() * (w - 14); c.beginPath(); c.moveTo(xx, 20); c.bezierCurveTo(xx + 3, sh * 0.3, xx - 4, sh * 0.7, xx, sh - 22); c.stroke(); }
        c.fillStyle = '#301910'; c.fillRect(x + 2, sh + 20, w - 4, H - sh - 24); c.strokeStyle = 'rgba(141,83,47,.23)'; c.strokeRect(x + 7, sh + 28, w - 14, H - sh - 39);
      }
      c.fillStyle = grad(c, 0, sh - 4, 0, sh + 20, [[0, '#75472a'], [0.15, '#3a1c12'], [0.65, '#1d0c09'], [1, '#56301c']]); c.fillRect(x0, sh - 4, width, 24);
      // Pleated side drape against the inner edge of each wall.
      const dx = side < 0 ? x1 - width * 0.24 : x0, dw = width * 0.24;
      for (let j = 0; j < 5; j++) { const xx = dx + dw * j / 5; c.fillStyle = grad(c, xx, 0, xx + dw / 5, 0, [[0, '#0e0709'], [0.45, '#35141b'], [0.7, '#421a20'], [1, '#14080c']]); c.fillRect(xx, 0, dw / 5 + 1, sh); }
      const sx = side < 0 ? x0 + width * 0.43 : x0 + width * 0.57, sy = sh * 0.43;
      const halo = c.createRadialGradient(sx, sy, 1, sx, sy, width * 0.52); halo.addColorStop(0, 'rgba(255,169,80,.35)'); halo.addColorStop(0.45, 'rgba(228,116,40,.13)'); halo.addColorStop(1, 'rgba(192,74,20,0)'); c.fillStyle = halo; c.fillRect(x0, sy - width * 0.52, width, width * 1.04);
      c.fillStyle = '#22100a'; rr(c, sx - 7, sy - 18, 14, 39, 4); c.fill(); c.fillStyle = '#a97336'; c.fillRect(sx - 1.5, sy + 8, 3, 22); c.fillRect(sx - 10, sy + 15, 20, 3);
      c.fillStyle = grad(c, sx - 6, 0, sx + 6, 0, [[0, '#c28a46'], [0.5, '#ffe5ac'], [1, '#cd9955']]); rr(c, sx - 6, sy - 12, 12, 23, 4); c.fill();
      c.fillStyle = '#805326'; c.fillRect(sx - 8, sy - 13, 16, 2); c.fillRect(sx - 8, sy + 9, 16, 2);
    }
    // Carpeted shallow risers and inset amber aisle lamps.
    for (let r = 0; r < D.ROWS; r++) {
      const y0 = g.top - g.pitch * 0.32 + g.pitch * r, y1 = Math.min(H, y0 + g.pitch), half = g.cell * D.COLS * rowScale(r) / 2 + g.cell * 0.2;
      const fx0 = g.px0 > 40 ? g.px0 - 14 : 0, fx1 = g.px0 > 40 ? g.px1 + 14 : W;
      c.fillStyle = grad(c, 0, y0, 0, y1, [[0, '#4a2424'], [0.06, '#32171b'], [1, '#210f14']]); c.fillRect(fx0, y0, fx1 - fx0, y1 - y0);
      c.fillStyle = bake.carpet; c.fillRect(fx0, y0, fx1 - fx0, y1 - y0);
      c.fillStyle = '#14090b'; c.fillRect(fx0, y0, fx1 - fx0, 5); c.fillStyle = 'rgba(183,115,75,.22)'; c.fillRect(fx0, y0 + 5, fx1 - fx0, 0.8);
      for (const x of [Math.max(12, W / 2 - half), Math.min(W - 12, W / 2 + half)]) {
        const glow = c.createRadialGradient(x, y0 + 13, 1, x, y0 + 13, 23); glow.addColorStop(0, 'rgba(238,128,38,.3)'); glow.addColorStop(1, 'rgba(238,128,38,0)'); c.fillStyle = glow; c.fillRect(x - 23, y0, 46, 36);
        c.fillStyle = '#140b09'; c.fillRect(x - 8, y0 + 8, 16, 6); c.fillStyle = '#f6bd68'; c.fillRect(x - 5, y0 + 9, 10, 2.5);
      }
    }
    bake.house = house;
    const [vignette, v] = layer(W, H);
    const falloff = v.createRadialGradient(W / 2, sh * 0.65, sh * 0.3, W / 2, sh * 0.65, Math.hypot(W / 2, H - sh * 0.65));
    falloff.addColorStop(0, 'rgba(9,3,2,0)'); falloff.addColorStop(0.48, 'rgba(9,3,2,.04)'); falloff.addColorStop(1, 'rgba(9,3,2,.5)'); v.fillStyle = falloff; v.fillRect(0, 0, W, H); bake.vignette = vignette;
  }

  const LAMP_SLOTS = [0.5, 0.3, 0.7, 0.12, 0.88, 0.4, 0.6, 0.21, 0.79, 0.05, 0.95, 0.5];
  function lampAt(i, g) {
    const k = Math.floor(i / LAMP_SLOTS.length), f = LAMP_SLOTS[i % LAMP_SLOTS.length] + (k ? 0.04 * k : 0);
    return { x: g.cx0 + (g.cx1 - g.cx0) * Math.min(0.97, f), y: g.stageH - (g.short ? 7 : 14) };
  }
  function lampLightAt(i, g) {
    const p = lampAt(i, g), ls = Math.max(0.65, Math.min(2.5, g.stageH / 112));
    const spread = Math.max((g.cx1 - g.cx0) * 0.06, 34 * ls);
    return { ...p, top: g.curtainH * 0.08, spread, baseY: p.y - 12 * ls, baseHalfWidth: 5 * ls, poolY: g.curtainH * 0.62, poolRadius: spread * 1.3 };
  }
  function lantern(x, y, alpha, s) {                       // 落地的红纸灯笼：底在 y，里头一点暖火
    const flick = 0.88 + 0.12 * Math.sin(S.t * 5 + x);
    ctx.save(); ctx.globalAlpha = alpha;
    const cy = y - 16 * s;
    const halo = ctx.createRadialGradient(x, cy, 1, x, cy, 26 * s); halo.addColorStop(0, 'rgba(255,190,100,' + (0.55 * flick) + ')'); halo.addColorStop(1, 'rgba(255,140,60,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, cy, 26 * s, 0, Math.PI * 2); ctx.fill();
    const body = ctx.createRadialGradient(x - 2 * s, cy, 1, x, cy, 10 * s); body.addColorStop(0, '#ffd18a'); body.addColorStop(0.45, '#ef6837'); body.addColorStop(1, '#8b191a');
    ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(x, cy, 8.5 * s, 9.5 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(120,30,16,.55)'; ctx.lineWidth = Math.max(0.6, 0.8 * s); ctx.beginPath();
    for (const k of [-0.75, -0.4, 0, 0.4, 0.75]) { ctx.moveTo(x + k * 5 * s, cy - 8.6 * s); ctx.quadraticCurveTo(x + k * 15 * s, cy, x + k * 5 * s, cy + 8.6 * s); }
    ctx.stroke();
    ctx.fillStyle = '#2a1608'; ctx.fillRect(x - 4.5 * s, cy - 11 * s, 9 * s, 2.5 * s); ctx.fillRect(x - 4.5 * s, cy + 8.5 * s, 9 * s, 2.5 * s);
    ctx.fillStyle = '#d9b45e'; ctx.fillRect(x - 4.5 * s, cy - 11 * s, 9 * s, 0.9 * s);
    ctx.strokeStyle = '#bd8a3f'; ctx.lineWidth = 0.7 * s; ctx.beginPath(); ctx.ellipse(x, cy - 12.2 * s, 3.4 * s, 3.7 * s, 0, Math.PI, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#bd682c'; ctx.fillRect(x - 0.5 * s, cy + 11 * s, s, 2 * s);
    for (let j = -2; j <= 2; j++) { ctx.fillStyle = j % 2 ? '#edb35a' : '#9e471f'; ctx.fillRect(x + j * 0.7 * s, cy + 13 * s, 0.55 * s, (2.5 - Math.abs(j) * 0.3) * s); }
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
    // 暗场保留四成材质亮度，让雕花和幕褶可辨；五灯时遮罩完全退去。
    ctx.fillStyle = 'rgba(6,3,2,' + (0.62 * (1 - L)) + ')'; ctx.fillRect(g.px0 - 4, 0, g.px1 - g.px0 + 8, sh + 8);
    // 台口的暖色总光：从台前往幕布上铺开
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    if (L > 0.01) {
      const wash = ctx.createRadialGradient(W / 2, sh, 4, W / 2, sh, Math.max(cw * 0.6, sh * 1.4));
      wash.addColorStop(0, 'rgba(255,170,80,' + (0.13 * L) + ')'); wash.addColorStop(0.6, 'rgba(200,90,40,' + (0.045 * L) + ')'); wash.addColorStop(1, 'rgba(120,40,20,0)');
      ctx.fillStyle = wash; ctx.fillRect(g.px0, 0, g.px1 - g.px0, sh);
    }
    // 每盏灯一道朝幕布的光锥，幕上一片光斑，台板上一点反光，空气里几粒浮尘
    const ls = Math.max(0.65, Math.min(2.5, sh / 112)), seen = Math.min(S.lamps.length, 12);
    ctx.beginPath(); ctx.rect(g.cx0, 0, cw, sh); ctx.clip();
    for (let i = 0; i < seen; i++) {
      const l = S.lamps[i], a = l.t < 0 ? 1 : Math.min(1, (S.t - l.t) / 0.6), k = a * (i < LIT_FULL ? 1 : 0.55), p = lampLightAt(i, g);
      const { top, spread } = p;
      const cone = bake.beam; cone.setTransform({ a: 1 / DPR, d: 1 / DPR, e: p.x - spread, f: 0 });
      ctx.globalAlpha = k;
      ctx.fillStyle = cone; ctx.beginPath(); ctx.moveTo(p.x - p.baseHalfWidth, p.baseY); ctx.lineTo(p.x - spread, top); ctx.lineTo(p.x + spread, top); ctx.lineTo(p.x + p.baseHalfWidth, p.baseY); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
      const pool = ctx.createRadialGradient(p.x, p.poolY, 2, p.x, p.poolY, p.poolRadius); pool.addColorStop(0, 'rgba(255,140,70,' + (0.13 * k) + ')'); pool.addColorStop(1, 'rgba(255,120,60,0)');
      ctx.fillStyle = pool; ctx.fillRect(p.x - spread * 1.3, ch * 0.62 - spread * 1.3, spread * 2.6, spread * 2.6);
      const ref = ctx.createRadialGradient(p.x, p.y + 1, 1, p.x, p.y + 1, 22 * ls); ref.addColorStop(0, 'rgba(255,200,120,' + (0.4 * k) + ')'); ref.addColorStop(1, 'rgba(255,160,80,0)');
      ctx.fillStyle = ref; ctx.save(); ctx.translate(p.x, p.y + 1); ctx.scale(1.8, 0.4); ctx.translate(-p.x, -p.y - 1); ctx.fillRect(p.x - 22 * ls, p.y - 21 * ls, 44 * ls, 44 * ls); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(g.cx0, ch, cw, sh - 6 - ch); ctx.clip();
      ctx.translate(p.x, p.y + 3); ctx.scale(ls, ls * 0.27);
      const reflection = ctx.createRadialGradient(0, 0, 0, 0, 0, 11);
      reflection.addColorStop(0, 'rgba(255,183,91,' + (0.42 * k) + ')'); reflection.addColorStop(0.35, 'rgba(242,107,46,' + (0.18 * k) + ')'); reflection.addColorStop(1, 'rgba(219,78,31,0)');
      ctx.fillStyle = reflection; ctx.fillRect(-11, -11, 22, 22); ctx.restore();
      ctx.fillStyle = 'rgba(255,225,170,' + (0.55 * k) + ')';
      for (let j = 0; j < 5; j++) { const u = ((S.t * 0.05 + j * 0.21 + i * 0.13) % 1), yy = p.y - 14 * ls - (p.y - top) * u, xx = p.x + Math.sin(j * 2.1 + i + S.t * 0.4) * spread * u * 0.7; ctx.fillRect(xx, yy, 1.4, 1.4); }
    }
    ctx.restore();
    // 台口轮廓：暗场里也认得出金框
    ctx.strokeStyle = 'rgba(232,200,120,' + (0.18 + 0.2 * (1 - L)) + ')'; ctx.lineWidth = 1;
    ctx.strokeRect(g.cx0 + 0.5, 0.5, cw - 1, sh - 6); ctx.strokeRect(g.px0 + 0.5, 0.5, g.px1 - g.px0 - 1, sh - 6);
    ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(247,220,154,' + (0.45 + 0.55 * L) + ')'; ctx.font = '600 15px "PingFang SC","Hiragino Sans GB",sans-serif';
    if (open < 0.3) { ctx.globalAlpha = 1 - open / 0.3; ctx.fillText('戏 台', W / 2, ch * (g.short ? 0.7 : 0.58)); ctx.globalAlpha = 1; }
    if (g.short) { ctx.font = '500 12px sans-serif'; ctx.fillStyle = 'rgba(247,220,154,.75)'; ctx.fillText(SHOW.troupe + ' · 《' + SHOW.name + '》', W / 2, ch + 26); }
    for (let i = 0; i < Math.min(S.lamps.length, 12); i++) { const l = S.lamps[i], a = l.t < 0 ? 1 : Math.min(1, (S.t - l.t) / 0.6), p = lampAt(i, g); lantern(p.x, p.y - (1 - a) * 6, a, ls * (Math.floor(i / LAMP_SLOTS.length) ? 0.8 : 1)); }
    // 台口左侧的节目单（可点）
    const b = g.book; ctx.save(); ctx.translate(b.x, b.y); ctx.fillStyle = '#efe6d2'; roundRect(0, 0, b.w, b.h, 2); ctx.fill(); ctx.fillStyle = '#9b2d20'; ctx.fillRect(0, 0, 4, b.h); ctx.fillStyle = '#2a1e16'; ctx.font = (g.short ? 7 : 9) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('节目单', b.w / 2 + 2, b.h / 2 + 3); ctx.restore();
    ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(243,233,214,.6)'; ctx.font = '11px sans-serif'; ctx.fillText('台前灯 ' + S.lamps.length + ' 盏', 10, sh + 20);
    ctx.textAlign = 'right'; ctx.fillText('第 ' + S.me.hall + ' 厅 · ' + humansHere() + ' 人', W - 10, sh + 20);
  }
  function drawHouse(g) {
    ctx.drawImage(bake.house, 0, 0, W, H);
    const wash = ctx.createRadialGradient(W / 2, g.stageH, 1, W / 2, g.stageH, g.stageH * 1.45);
    wash.addColorStop(0, 'rgba(245,151,74,' + (0.035 + S.lit * 0.13) + ')'); wash.addColorStop(1, 'rgba(245,151,74,0)');
    ctx.fillStyle = wash; ctx.fillRect(g.px0, g.stageH, g.px1 - g.px0, H - g.stageH);
  }
  const HAIR = ['#2a1d16', '#3b2a1e', '#1f1a17', '#4a3324', '#5c4a3c', '#2e2622', '#6a5a4c'];
  function hairOf(o) { let h = 0; const s = String(o.id || o.label || 'me'); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return HAIR[h % HAIR.length]; }
  // 绘制与点击共用外轮廓，随排缩放；圆顶外和座间空隙不算座位。
  function seatBackPath(x, yt, bw, bh, c = ctx) {
    const r = bw * 0.24;
    c.beginPath();
    c.moveTo(x - bw * 0.46, yt + bh); c.lineTo(x - bw * 0.46, yt + r);
    c.quadraticCurveTo(x - bw * 0.46, yt, x - bw * 0.46 + r, yt);
    c.lineTo(x + bw * 0.46 - r, yt);
    c.quadraticCurveTo(x + bw * 0.46, yt, x + bw * 0.46, yt + r);
    c.lineTo(x + bw * 0.46, yt + bh); c.closePath();
  }
  function seatCushionPath(x, yt, bw, bh, c = ctx) {
    rr(c, x - bw * 0.36, yt - bh * 0.16, bw * 0.72, bh * 0.2, bh * 0.1);
  }
  function drawSeat(p, s, bw, bh, row, col, state, c = ctx) {        // 从背后看的一张剧场椅：坐垫（空座露出）、扶手、丝绒椅背、铜号牌
    const x = p.x, yt = p.y - bh * 0.15;
    if (state.me && state.part === 'back') { const gl = c.createRadialGradient(x, yt + bh * 0.3, 2, x, yt + bh * 0.3, bw * 0.95); gl.addColorStop(0, 'rgba(247,210,120,.35)'); gl.addColorStop(1, 'rgba(247,210,120,0)'); c.fillStyle = gl; c.fillRect(x - bw, yt + bh * 0.3 - bw, bw * 2, bw * 2); }
    if (state.part === 'back' || state.part === 'all') {
      if (state.empty) {                                    // 空座：坐垫放平，从椅背上沿露出一块红丝绒
        c.fillStyle = grad(c, 0, yt - bh * 0.22, 0, yt + 2, [[0, '#5a1c14'], [0.5, '#7e2a1e'], [1, '#3a0f0a']]); seatCushionPath(x, yt, bw, bh, c); c.fill();
        c.fillStyle = 'rgba(255,200,170,.19)'; c.fillRect(x - bw * 0.3, yt - bh * 0.145, bw * 0.6, Math.max(1, bh * 0.025));
      }
      return;
    }
    // 扶手（深色木，顶上一道亮边）
    for (const sx of [-1, 1]) {
      const ax = x + sx * bw * 0.5 - bw * 0.055, aw = bw * 0.11;
      c.fillStyle = grad(c, ax, 0, ax + aw, 0, [[0, '#1e120a'], [0.5, '#4a3020'], [1, '#1e120a']]); c.fillRect(ax, yt + bh * 0.28, aw, bh * 0.8);
      c.fillStyle = grad(c, 0, yt + bh * 0.22, 0, yt + bh * 0.38, [[0, '#af744a'], [0.3, '#815031'], [1, '#35190f']]); rr(c, ax - aw * 0.15, yt + bh * 0.24, aw * 1.3, bh * 0.1, aw * 0.3); c.fill();
    }
    // 椅背：圆顶丝绒，上沿受台口光
    const r = bw * 0.24;
    c.fillStyle = grad(c, 0, yt, 0, yt + bh, [[0, '#b83b42'], [0.13, '#9d2b35'], [0.4, '#7a1925'], [0.8, '#59101c'], [1, '#350b13']]);
    seatBackPath(x, yt, bw, bh, c); c.fill();
    c.fillStyle = bake.velvet; c.fill();
    const seam = yt + bh * 0.86;                              // 椅背上的软包分缝：一道暗缝压一道亮边
    c.fillStyle = 'rgba(30,6,4,.45)'; c.fillRect(x - bw * 0.44, seam, bw * 0.88, Math.max(1, bh * 0.025));
    c.fillStyle = 'rgba(255,190,160,.1)'; c.fillRect(x - bw * 0.44, seam + Math.max(1, bh * 0.025), bw * 0.88, Math.max(1, bh * 0.03));
    c.fillStyle = 'rgba(20,4,2,.3)'; for (const k of [-0.2, 0.2]) c.fillRect(x + k * bw - 0.5, yt + bh * 0.2, 0.65, bh * 0.63);
    seatBackPath(x, yt, bw, bh, c);
    c.fillStyle = grad(c, x - bw * 0.46, 0, x + bw * 0.46, 0, [[0, 'rgba(0,0,0,.35)'], [0.2, 'rgba(0,0,0,0)'], [0.8, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.35)']]); c.fill();
    c.strokeStyle = state.me ? '#f7dc9a' : 'rgba(255,190,150,.24)'; c.lineWidth = state.me ? 2 : 1;
    c.beginPath(); c.moveTo(x - bw * 0.46 + 1, yt + r); c.quadraticCurveTo(x - bw * 0.46 + 1, yt + 1, x - bw * 0.46 + r, yt + 1); c.lineTo(x + bw * 0.46 - r, yt + 1); c.quadraticCurveTo(x + bw * 0.46 - 1, yt + 1, x + bw * 0.46 - 1, yt + r); if (state.me) { c.lineTo(x + bw * 0.46 - 1, yt + bh - 1); c.lineTo(x - bw * 0.46 + 1, yt + bh - 1); c.closePath(); } c.stroke();
    c.strokeStyle = 'rgba(238,136,118,.16)'; c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(x - bw * 0.415, yt + bh * 0.92); c.lineTo(x - bw * 0.415, yt + r); c.quadraticCurveTo(x - bw * 0.415, yt + bh * 0.055, x - bw * 0.2, yt + bh * 0.055); c.lineTo(x + bw * 0.2, yt + bh * 0.055); c.quadraticCurveTo(x + bw * 0.415, yt + bh * 0.055, x + bw * 0.415, yt + r); c.lineTo(x + bw * 0.415, yt + bh * 0.92); c.stroke();
    // 铜号牌：几排几座
    const pw = Math.max(12, bw * 0.3), ph = Math.max(6, bh * 0.15), py = yt + bh * 0.14;
    c.fillStyle = grad(c, 0, py, 0, py + ph, state.me ? [[0, '#fff0b8'], [1, '#c9a24a']] : [[0, '#e8c878'], [1, '#8a6424']]); rr(c, x - pw / 2, py, pw, ph, ph * 0.3); c.fill();
    if (ph >= 7) { c.fillStyle = '#3a240a'; c.font = '600 ' + Math.round(ph * 0.78) + 'px sans-serif'; c.textAlign = 'center'; c.fillText((row + 1) + '-' + (col + 1), x, py + ph * 0.8); }
  }
  function bakeSeats(g) {
    bake.seats = [];
    for (let row = 0; row < D.ROWS; row++) {
      const rs = rowScale(row), bw = g.seatW * rs, bh = g.seatH * rs, w = bw * 1.24, h = bh * 1.34;
      const p = { x: w / 2, y: bh * 0.33 }, front = [];
      const [back, bc] = layer(w, h);
      drawSeat(p, g.ps * rs, bw, bh, row, 0, { part: 'back', empty: true }, bc);
      for (let col = 0; col < D.COLS; col++) {
        const [sprite, c] = layer(w, h);
        drawSeat(p, g.ps * rs, bw, bh, row, col, { part: 'front' }, c);
        front.push(sprite);
      }
      bake.seats.push({ front, back, w, h, bw, bh });
    }
  }
  function drawCachedSeat(p, row, col, empty, selected, part) {
    const q = bake.seats[row], { bw, bh } = q, yt = p.y - bh * 0.15;
    if (part === 'back') {
      if (selected) {
        const glow = ctx.createRadialGradient(p.x, yt, 1, p.x, yt, bw * 0.8);
        glow.addColorStop(0, 'rgba(247,210,120,.28)'); glow.addColorStop(1, 'rgba(247,210,120,0)');
        ctx.fillStyle = glow; ctx.fillRect(p.x - bw, yt - bw, bw * 2, bw * 2);
      }
      if (empty) ctx.drawImage(q.back, p.x - q.w / 2, p.y - bh * 0.33, q.w, q.h);
      return;
    }
    ctx.drawImage(q.front[col], p.x - q.w / 2, p.y - bh * 0.33, q.w, q.h);
    seatBackPath(p.x, yt, bw, bh);
    const light = S.lit * (1 - row * 0.28);
    ctx.fillStyle = grad(ctx, 0, yt, 0, yt + bh, [[0, 'rgba(255,178,104,' + light * 0.28 + ')'], [0.32, 'rgba(255,178,104,' + light * 0.16 + ')'], [0.94, 'rgba(255,178,104,0)']]); ctx.fill();
    if (selected) { ctx.strokeStyle = '#f7dc9a'; ctx.lineWidth = 2; ctx.stroke(); }
  }
  function drawPerson(o, x, yt, s) {                        // 从背后看：头发、耳朵、脖子、肩膀，下半身在椅背后
    s = s || 1;
    const isR = o.kind === 'resident', isMe = o.kind === 'me';
    if (o.glow && S.t - o.glow < 2.5) { const k = 1 - (S.t - o.glow) / 2.5; ctx.fillStyle = 'rgba(247,220,154,' + (0.35 * k) + ')'; ctx.beginPath(); ctx.arc(x, yt - 10 * s, 22 * s, 0, Math.PI * 2); ctx.fill(); }
    ctx.save(); if (isR) ctx.globalAlpha = 0.55; else if (o.kind === 'ghost') ctx.globalAlpha = 0.85;
    const dx = o.pose === 'shift' ? Math.sin(S.t * 8) * 1.5 * s : 0, lift = (o.pose === 'look' || o.pose === 'snap' ? -3 : o.pose === 'nod' ? 2 : 0) * s;
    const cx = x + dx, shY = yt - 9 * s, hy = yt - 19 * s + lift, skin = C.skin;
    if (isR) {
      const style = (Number(o.id.slice(1)) + Math.floor(D.rng(seed)() * 3)) % 3;
      ctx.globalAlpha = 0.65;
      ctx.fillStyle = grad(ctx, 0, shY - 2 * s, 0, yt + 7 * s, [[0, '#75513a'], [0.2, '#483027'], [1, '#271b1a']]);
      ctx.beginPath(); ctx.moveTo(cx - 16 * s, yt + 7 * s); ctx.quadraticCurveTo(cx - 15 * s, shY - 1 * s, cx - 6 * s, shY - 2 * s); ctx.lineTo(cx + 6 * s, shY - 2 * s); ctx.quadraticCurveTo(cx + 15 * s, shY - 1 * s, cx + 16 * s, yt + 7 * s); ctx.fill();
      ctx.fillStyle = '#39271f'; ctx.fillRect(cx - 3 * s, hy + 5 * s, 6 * s, 7 * s);
      ctx.fillStyle = grad(ctx, 0, hy - 9 * s, 0, hy + 9 * s, [[0, '#b48553'], [0.12, '#61452d'], [0.55, '#2c201b'], [1, '#211917']]);
      ctx.beginPath(); ctx.ellipse(cx, hy, 7.8 * s, 8.8 * s, 0, 0, Math.PI * 2); ctx.fill();
      if (style === 0) {
        for (let j = 0; j < 7; j++) { const angle = Math.PI + j * Math.PI / 6; ctx.beginPath(); ctx.ellipse(cx + Math.cos(angle) * 6.1 * s, hy + Math.sin(angle) * 6.5 * s, 2.5 * s, 2.8 * s, angle, 0, Math.PI * 2); ctx.fill(); }
      } else if (style === 1) {
        ctx.beginPath(); ctx.ellipse(cx + 1.5 * s, hy - 7 * s, 4.6 * s, 4.3 * s, 0, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = grad(ctx, 0, hy - 10 * s, 0, hy - 2 * s, [[0, '#9a7750'], [0.2, '#5c4430'], [1, '#2d211b']]);
        ctx.beginPath(); ctx.ellipse(cx, hy - 5 * s, 9.5 * s, 4.7 * s, -0.08, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#281b17'; ctx.beginPath(); ctx.ellipse(cx + 1.5 * s, hy - 2 * s, 10 * s, 1.5 * s, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore(); return;
    }
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
  function labelGeometry(o, x, y, s, maxW) {
    const isR = o.kind === 'resident'; let fs = Math.max(8, Math.min(13, Math.round((isR ? 9 : 10) * Math.min(s, 1.3))));
    const lines = o === S.usher ? ['领位人', '· 非真人'] : [o.label];
    ctx.textAlign = 'center';
    for (; fs > 7; fs--) { ctx.font = fs + 'px sans-serif'; if (!maxW || Math.max(...lines.map((t) => ctx.measureText(t).width)) + 8 <= maxW * 0.96) break; }
    ctx.font = fs + 'px sans-serif';
    const w = Math.max(...lines.map((t) => ctx.measureText(t).width)) + 8, h = lines.length * (fs + 2) + 3;
    return { fs, lines, w, h, left: x - w / 2, right: x + w / 2, top: y - fs - 1, bottom: y - fs - 1 + h };
  }
  function personLabel(o, x, y, s, maxW, box = labelGeometry(o, x, y, s, maxW)) {
    const { fs, lines, w, h } = box;
    ctx.font = fs + 'px sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(20,10,6,.62)'; roundRect(box.left, box.top, w, h, 3); ctx.fill();
    ctx.fillStyle = o.kind === 'resident' ? 'rgba(226,203,175,.85)' : 'rgba(243,233,214,.95)';
    lines.forEach((t, i) => ctx.fillText(t, x, y + i * (fs + 2)));
  }
  function floatingText(text, x, baseline, labels, alpha = 1) {
    ctx.textAlign = 'center';
    const m = ctx.measureText(text), ascent = m.actualBoundingBoxAscent || 16, descent = m.actualBoundingBoxDescent || 2;
    const left = x - (m.actualBoundingBoxLeft || m.width / 2), right = x + (m.actualBoundingBoxRight || m.width / 2);
    const crossed = labels.filter(box => right + 1 > box.left && left - 1 < box.right);
    // Choose the closest clear vertical slot. Tea and gesture icons share the same placement.
    const candidates = [baseline, ...crossed.flatMap(box => [box.top - descent - 2, box.bottom + ascent + 2])];
    candidates.sort((a, b) => Math.abs(a - baseline) - Math.abs(b - baseline));
    const clear = candidates.find(y => y - ascent >= 0 && y + descent <= H && crossed.every(box => y + descent + 1 <= box.top || y - ascent - 1 >= box.bottom));
    const y = clear === undefined ? Math.max(ascent, Math.min(H - descent, baseline)) : clear;
    ctx.globalAlpha = alpha; ctx.fillStyle = '#fff'; ctx.fillText(text, x, y); ctx.globalAlpha = 1;
    labels.push({ left, right, top: y - ascent, bottom: y + descent });
  }
  function bubbleAt(o, x, y, s, labels = []) {
    if (!o.bubble || S.t - o.bubble.t >= 2.4) return;
    const k = (S.t - o.bubble.t) / 2.4;
    ctx.font = Math.round(16 * Math.min(s, 1.6)) + 'px sans-serif';
    floatingText(o.bubble.text, x, y - k * 10, labels, 1 - k);
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
      for (const q of row) drawCachedSeat(q.p, r, q.c, !q.o, q.o === meObj, 'back');
      for (const q of row) if (q.o) drawPerson(q.o, q.p.x, q.p.y - bh * 0.15, s);
      for (const q of row) drawCachedSeat(q.p, r, q.c, !q.o, q.o === meObj, 'front');
      for (const q of row) if (q.o) tags.push([q.o, q.p.x, q.p.y - bh * 0.15, bh, s, g.cell * rs]);
    }
    const labels = tags.map(([o, x, yt, bh, s, w]) => labelGeometry(o, x, yt + bh * 0.62, s, w));
    const titleY = g.curtainH * (g.short ? 0.7 : 0.58);
    const labelBoxes = [{ left: 0, right: W, top: g.stageH + 6, bottom: g.stageH + 25 }, { left: W / 2 - 24, right: W / 2 + 24, top: titleY - 16, bottom: titleY + 4 }, ...labels];
    if (g.short) { ctx.font = '500 12px sans-serif'; const width = ctx.measureText(SHOW.troupe + ' · 《' + SHOW.name + '》').width; labelBoxes.push({ left: W / 2 - width / 2, right: W / 2 + width / 2, top: g.curtainH + 13, bottom: g.curtainH + 29 }); }
    for (const [o, x, yt, , s] of tags) bubbleAt(o, x, yt - 27 * s, s, labelBoxes);
    tags.forEach(([o, x, yt, bh, s, w], i) => personLabel(o, x, yt + bh * 0.62, s, w, labels[i]));
    if (S.phase === 'door') {
      const s = Math.min(g.ps, 1.3), y = H - 4;
      const name = labelGeometry(meObj, 0, y - 22 * s, s);
      const half = Math.max(15 * s + 1, name.w / 2), top = Math.min(y - 36 * s - 1, name.top);
      const candidates = [W / 2, ...Array.from({ length: D.COLS }, (_, c) => seatPos((D.ROWS - 1) * D.COLS + c, g).x)];
      // 入门标记优先居中，碰到名签时挪到最近的座位前方。
      candidates.sort((a, b) => Math.abs(a - W / 2) - Math.abs(b - W / 2));
      const x = candidates.find(x => x - half >= 0 && x + half <= W && labels.every(b =>
        x + half + 2 <= b.left || x - half - 2 >= b.right || y + 2 <= b.top || top - 2 >= b.bottom
      )) ?? W / 2;
      drawPerson({ kind: 'me', color: C.me, label: '我', pose: 'stand', glow: 0 }, x, y - 6 * s, s);
      personLabel(meObj, x, y - 22 * s, s); bubbleAt({ bubble: S.meBubble }, x, y - 50 * s, s);
    }
    // 拍立得：每个座位最多叠三张，摆在座位右上
    const bySeat = {}; for (const s of S.snaps) { (bySeat[s.seat] = bySeat[s.seat] || []).push(s); }
    for (const k of Object.keys(bySeat)) { const p = seatPos(Number(k), g); const list = bySeat[k].slice(-3); list.forEach((s, i) => { const a = Math.min(1, (S.t - s.t) / 0.5); const w = 12 * g.ps, h = 14 * g.ps; ctx.save(); ctx.globalAlpha = a; ctx.translate(p.x + 18 * g.ps + i * 4, p.y - 22 * g.ps - i * 3); ctx.rotate(-0.15 + i * 0.12); ctx.fillStyle = '#f3e9d6'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#5a1f16'; ctx.fillRect(1.5, 1.5, w - 3, h - 5); ctx.restore(); }); }
    for (const e of S.effects) {
      const k = (S.t - e.t) / (e.kind === 'tea' ? 1.4 : 1.0);
      if (e.kind === 'ripple') { const p = seatPos(e.seat, g); ctx.strokeStyle = 'rgba(247,220,154,' + (0.6 * (1 - k)) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y - 12 * g.ps, (14 + k * 34) * g.ps, 0, Math.PI * 2); ctx.stroke(); }
      if (e.kind === 'tea') { const a = seatPos(e.from, g), b = seatPos(e.to, g); const ease = k < 0.5 ? 2 * k * k : -1 + (4 - 2 * k) * k; const x = a.x + (b.x - a.x) * ease, y = a.y - 30 + (b.y - a.y) * ease - Math.sin(k * Math.PI) * 22; ctx.font = Math.round(16 * g.ps) + 'px sans-serif'; ctx.textAlign = 'center'; floatingText('🍵', x, y, labelBoxes); }
    }
    if (S.gift.ticket) {
      const p = seatPos(S.me.seat, g);
      ctx.fillStyle = '#efe6d2'; ctx.fillRect(p.x + 15 * g.ps, p.y - 14 * g.ps, 18 * g.ps, 12 * g.ps);
      ctx.strokeStyle = '#9b2d20'; ctx.strokeRect(p.x + 25 * g.ps, p.y - 10 * g.ps, 5 * g.ps, 5 * g.ps);
    }
    ctx.drawImage(bake.vignette, 0, 0, W, H);
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
    let best = -1;
    // 与绘制顺序相反，从近排查起。Canvas 路径带 DPR 变换，命中点也用画布像素。
    for (let i = D.CAP - 1; i >= 0; i--) {
      const p = seatPos(i, g), rs = rowScale(Math.floor(i / D.COLS));
      const bw = g.seatW * rs, bh = g.seatH * rs, yt = p.y - bh * 0.15;
      seatBackPath(p.x, yt, bw, bh);
      let hit = ctx.isPointInPath(px * DPR, py * DPR);
      if (!hit && !occupant(i)) {
        seatCushionPath(p.x, yt, bw, bh);
        hit = ctx.isPointInPath(px * DPR, py * DPR);
      }
      if (hit) { best = i; break; }
    }
    if (best < 0) return;
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
    // Logical Canvas coordinates; fresh objects only, so callers cannot change layout.
    get geometry() {
      const g = geom();
      return {
        canvas: { width: W, height: H },
        stage: { x: g.px0, y: 0, width: g.px1 - g.px0, height: g.stageH },
        curtain: { x: g.cx0, y: 0, width: g.cx1 - g.cx0, height: g.curtainH },
        boards: { x: g.px0, y: g.curtainH, width: g.px1 - g.px0, height: g.stageH - 6 - g.curtainH },
        frame: {
          left: { x: g.px0, y: 0, width: g.col, height: g.stageH - 6 },
          right: { x: g.cx1, y: 0, width: g.col, height: g.stageH - 6 },
        },
        firstLamp: lampLightAt(0, g),
        book: { ...g.book },
        seats: Array.from({ length: D.CAP }, (_, i) => {
          const p = seatPos(i, g), scale = rowScale(Math.floor(i / D.COLS));
          return { ...p, width: g.seatW * scale, height: g.seatH * scale };
        }),
      };
    },
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
