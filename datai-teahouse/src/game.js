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
  const cartEl = document.getElementById('cart'), billEl = document.getElementById('bill'), billImg = document.getElementById('billImg'), againBtn = document.getElementById('again');
  const orderEl = document.getElementById('order'), orderGrid = document.getElementById('orderGrid'), orderGo = document.getElementById('orderGo'), orderCancel = document.getElementById('orderCancel'), orderNote = document.getElementById('orderNote');

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
      greedy: g.acts.filter((a) => a[1] === 5).length >= 2,
    }));
    S = {
      phase: 'door', tau: 0, seatT: 0, hall: plan.hall, me: plan.me, ghosts, residents: [],
      pot: { level: 1, lidOff: false, refillAt: -1 }, myCup: 0, myPlate: 0, myPage: 0, myPose: 'idle', myPoseUntil: 0,
      baskets: [], plateKinds: [], effects: [], knockUntil: -1, knockBacks: [], lastSound: null,
      tea: null, askTea: false, potHere: false, teaAt: -1, rinsed: false, kitchen: [], orders: 0, picked: new Set(),
      visit: null, fan: 0, hintUntil: 0,
      carts: D.cartPlan(seed), cartIdx: 0, cart: null, cartMoves: [], tally: null, closed: false, dayPhase: 0, plates: {},
    };
    for (const g of mine) g.here = true;
    syncResidents();
    updateBars();
    cartEl.classList.remove('show'); billEl.classList.remove('show'); orderEl.classList.remove('show');
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
    if (S.phase === 'bill') return false;
    if (code === 0) return S.phase === 'door' && !S.closed;
    if (S.phase !== 'seated') return false;
    if (code === 1) return S.potHere;
    if (code === 2) return S.tau <= S.knockUntil;
    if (code === 3) return S.potHere && !S.pot.lidOff;
    if (code === 8) return !orderEl.classList.contains('show');
    return true;
  }

  function act(code, by, kind) {
    // by: undefined = 玩家；否则是桌上的别人（幽灵或灰影）；kind 只给夹一件用（点心车上选哪样）
    if (!by && !canAct(code)) return false;
    const t = S.tau;
    if (!by) {
      if (S.visit && code !== 0) D.recordAct(S.visit, t - S.seatT, code);
    }
    switch (code) {
      case 0: // 落座
        S.phase = 'seated'; S.seatT = t; S.visit = D.newVisit(Date.now());
        S.tally = { pours: 0, lids: 0, knocksGiven: 0, knocksGot: 0, pages: 0, pieces: {}, baskets: {} };
        S.myPose = 'sit'; S.myPoseUntil = t + 0.8; S.effects.push({ kind: 'sitdown', t0: t, dur: 0.8 });
        sfx.sit(); S.askTea = true; renderStrip(); hint('伙计过来：饮乜茶？');
        break;
      case 1: { // 斟茶：给全桌；头一泡不入口，洗杯
        if (!S.potHere) { if (!by) { sfx.dry(); hint(S.tea ? '茶未到 · 伙计拎壶去了' : '先拣茶 · 唔该'); } break; }
        if (by && !S.rinsed && by.kind !== 'resident') break; // 你还没洗杯，别人不给你斟
        if (S.pot.level < 0.24) { sfx.dry(); if (!by) hint('壶空了。揭盖，伙计就来加水'); S.effects.push({ kind: 'shake', t0: t, dur: 0.4 }); break; }
        S.pot.level = Math.max(0, S.pot.level - 0.25);
        if (!by && !S.rinsed) {
          S.rinsed = true; S.effects.push({ kind: 'rinse', t0: t, dur: 2.2 }); setPose(by, 'pour', 2.0); sfx.pour();
          hint('头泡洗杯 · 筷子碗碟在大碗里涮一遍'); break;
        }
        const from = by ? slotOf(by.seat) : 0;
        S.effects.push({ kind: 'pour', t0: t, dur: 1.6, from });
        S.myCup = 1; for (const g of othersHere()) g.cup = 1; for (const r of S.residents) r.cup = 1;
        setPose(by, 'pour', 1.6);
        sfx.pour(); if (!by) S.tally.pours++;
        if (by) { S.knockUntil = t + KNOCK_WINDOW; hint(`${by.label.split(' · ')[0] === '你' ? '上次的你' : '邻座'}给你斟了茶 · 叩指谢一下`); }
        else {
          hint('给全桌斟了一巡');
          for (const o of [...othersHere(), ...S.residents]) if (o.kind === 'resident' || o.knocks) { o.thanking = true; S.knockBacks.push({ who: o, at: t + 1.4 + rnd() * 1.2 }); }
        }
        break;
      }
      case 2: // 叩指
        S.effects.push({ kind: 'knock', t0: t, dur: 0.6, slot: by ? slotOf(by.seat) : 0 });
        setPose(by, 'knock', 0.6); sfx.knock();
        if (!by) { S.knockUntil = -1; S.tally.knocksGiven++; hint('叩指两下 · 多谢'); }
        else if (by.thanking) { by.thanking = false; if (S.tally) S.tally.knocksGot++; }
        break;
      case 3: // 揭盖
        S.pot.lidOff = true; S.pot.refillAt = t + 3.5; S.effects.push({ kind: 'lid', t0: t, dur: 0.5 }); sfx.lid();
        if (!by) { S.tally.lids++; hint('壶盖搁在壶口 · 伙计看见就来加水'); }
        break;
      case 4: // 翻报纸
        if (by) by.page++; else { S.myPage++; S.tally.pages++; }
        S.effects.push({ kind: 'paper', t0: t, dur: 0.7, slot: by ? slotOf(by.seat) : 0 });
        setPose(by, 'paper', 6 + rnd() * 6); sfx.paper();
        if (!by) hint(['翻到港闻', '翻到体育', '翻到副刊', '翻到马经', '翻到讣闻', '翻到广告'][S.myPage % 6]);
        break;
      case 5: { // 夹一件：点选择条上的一样（带 kind）是向点心车要一笼（阿姨搁下盖印）；按钮本身是从自己桌上的笼里夹一件
        if (S.cart && kind) {
          let it = kind ? S.cart.items.find((x) => x.kind === kind) : null;
          if (kind && (!it || it.stock <= 0) && !by) { sfx.dry(); hint(`${D.dimsumName(kind)}卖完了`); break; }
          if (!it || it.stock <= 0) it = S.cart.items.find((x) => x.stock > 0) || null;
          if (!it) { if (!by) { sfx.dry(); hint('车上卖完了 · 等下一趟'); } break; }
          D.takeFromCart(S.cart, it.kind); renderStrip();
          S.effects.push({ kind: 'pick', t0: t, dur: 1.1, slot: by ? slotOf(by.seat) : 0, fromCart: true, basket: true });
          if (by) { by.plate = (by.plate || 0) + 1; setPose(by, 'pick', 1.1); if (S.cart.items.every((x) => x.stock <= 0)) hint('车上被拿空了'); }
          else { addBasket(it.kind); setPose(undefined, 'pick', 1.1); hint(`阿姨搁下一笼${D.dimsumName(it.kind)} · 点心纸上盖了个印`); }
          sfx.pick();
          break;
        }
        if (by) break; // 别人不动你的笼
        const bk = S.baskets.find((b) => b.left > 0);
        if (!bk) { sfx.dry(); hint(S.cart ? '桌上没点心 · 点上面点心车的一样要一笼' : S.baskets.length ? '笼都空了 · 唔该叫一笼，或等点心车' : '桌上还没点心 · 唔该叫伙计，或等点心车'); break; }
        bk.left--; if (bk.left === 0) bk.emptiedAt = t;
        S.myPlate++; S.plateKinds.push(bk.kind); if (S.plateKinds.length > 3) S.plateKinds.shift();
        S.tally.pieces[bk.kind] = (S.tally.pieces[bk.kind] || 0) + 1;
        S.effects.push({ kind: 'pick', t0: t, dur: 1.1, slot: 0, from: basketPos(S.baskets.indexOf(bk)) });
        setPose(undefined, 'pick', 1.1); sfx.pick();
        hint(`${D.dimsumName(bk.kind)} · 夹到碟里${bk.left === 0 ? ' · 这笼空了' : ''}`);
        break;
      }
      case 8: // 唔该：喊伙计。没拣茶先拣茶，拣了就拿点心纸
        if (by) break;
        if (!S.tea) { S.askTea = true; renderStrip(); hint('伙计过来：饮乜茶？'); sfx.call(); break; }
        sfx.call(); openOrder();
        break;
      case 6: { // 离席：这一趟记下，开茶单；「再开一市」才重新进门
        const dur = t - S.seatT;
        D.closeVisit(S.visit, dur);
        visits = D.pushVisit(visits, S.visit); saveVisits();
        S.visit = null; sfx.leave();
        const companions = new Set(S.ghosts.filter((g) => g.here && g.seatedWithMe !== false).map((g) => g.id)).size;
        const tally = { ...S.tally, tea: S.tea, table: S.me.table, companions: Math.max(companions, S.metOthers || 0), seconds: dur, closedOut: !!kind, leftAt: D.clockAt(t) };
        S.phase = 'bill'; S.lastBill = D.billLines(tally);
        showBill(tally);
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

  // 横屏时提示在顶栏下，和点心车选择条同一个位置：车在就不弹提示（文字照记，钩子读得到）
  function hint(text) {
    hintEl.textContent = text; S.hintUntil = S.tau + 4;
    const clash = cartEl.classList.contains('show') && window.matchMedia('(max-height: 420px)').matches;
    hintEl.classList.toggle('show', !clash);
  }

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
    // 茶到了：壶、大碗一起上桌
    if (S.tea && !S.potHere && t >= S.teaAt) { S.potHere = true; S.pot.level = 1; S.pot.lidOff = false; sfx.potdown(); if (S.phase === 'seated') hint(`${D.teaOf(S.tea).zh}到 · 头泡洗杯`); updateBars(); }
    // 厨房出品
    for (let i = S.kitchen.length - 1; i >= 0; i--) if (t >= S.kitchen[i].at) {
      const k = S.kitchen.splice(i, 1)[0]; addBasket(k.kind); S.effects.push({ kind: 'waiter', t0: t, dur: 2.4 }); sfx.steamer();
      if (S.phase === 'seated') hint(`出品 · ${D.dimsumName(k.kind)}`);
    }
    // 空笼放 6 秒伙计来收
    for (let i = S.baskets.length - 1; i >= 0; i--) if (S.baskets[i].left === 0 && t - S.baskets[i].emptiedAt > 6) { S.baskets.splice(i, 1); S.effects.push({ kind: 'waiter', t0: t, dur: 1.8 }); }
    // 伙计加水
    if (S.pot.lidOff && t >= S.pot.refillAt) { S.pot.lidOff = false; S.pot.level = 1; S.effects.push({ kind: 'refill', t0: t, dur: 1.2 }); sfx.refill(); if (S.phase === 'seated') hint('加了水 · 壶满了'); }
    // 点心车：到、停、走；桌上别人也伸筷子
    if (!S.cart && S.cartIdx < S.carts.length && t >= S.carts[S.cartIdx].at && S.phase !== 'bill') {
      const plan = S.carts[S.cartIdx++];
      S.cart = { index: plan.index, items: plan.items.map((x) => ({ ...x })), arrivedAt: t, leaveAt: t + plan.stay };
      S.cartMoves = [];
      S.residents.forEach((r, i) => { const m = D.residentCartMove(seed, plan.index, i); if (m.takes) S.cartMoves.push({ who: r, at: t + m.delay, pick: m.pick }); });
      othersHere().forEach((g, i) => { if (g.greedy) S.cartMoves.push({ who: g, at: t + 2 + ((i * 7 + plan.index * 3) % 5) * 0.8, pick: (i + plan.index) % 3 }); });
      sfx.cart(); renderStrip();
      if (S.phase === 'seated') hint('点心车到了 · ' + S.cart.items.map((x) => D.dimsumName(x.kind)).join('、'));
    }
    if (S.cart) {
      for (let i = S.cartMoves.length - 1; i >= 0; i--) if (t >= S.cartMoves[i].at) { const m = S.cartMoves.splice(i, 1)[0]; const it = S.cart.items[m.pick] && S.cart.items[m.pick].stock > 0 ? S.cart.items[m.pick] : null; act(5, m.who, it ? it.kind : undefined); }
      if (t >= S.cart.leaveAt) { S.cart = null; S.cartMoves = []; renderStrip(); sfx.cart(0.5); if (S.phase === 'seated') hint('点心车走了'); updateBars(); }
    }
    // 早市过去：快收市变光、收市清场
    const ph = D.phaseAt(t);
    if (ph !== S.dayPhase) {
      S.dayPhase = ph;
      if (ph === 1) { if (S.phase !== 'bill') hint('快收市了 · 伙计开始收碟'); sfx.steamer(0.5); }
      if (ph === 2) {
        S.closed = true;
        if (S.phase === 'seated') { act(6, undefined, true); }
        else if (S.phase === 'door') { hint('收市了 · 明早再来'); S.reopenAt = t + 2.5; }
      }
    }
    if (S.closed && S.phase === 'door' && S.reopenAt && t >= S.reopenAt) { enterHall(); return; }
    if (S.knockUntil > 0 && t > S.knockUntil) { S.knockUntil = -1; updateBars(); }
    if (S.phase === 'seated') S.metOthers = Math.max(S.metOthers || 0, othersHere().length);
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
    hallEl.textContent = `${S.closed ? '收市' : '早市 ' + D.clockAt(S.tau)} · 大堂 ${sum.tables} 桌 ${Math.max(guests, 0)} 人`;
    void atMine;
    buttons.forEach((b) => { const code = +b.dataset.act; b.disabled = !canAct(code); b.classList.toggle('hot', code === 2 && canAct(2)); });
    muteBtn.textContent = muted ? '有声' : '静音'; muteBtn.setAttribute('aria-pressed', String(muted));
  }

  // ---------- 拣茶、下单、桌上的笼 ----------
  function chooseTea(key) {
    if (!D.teaOf(key) || S.tea) return false;
    S.tea = key; S.askTea = false; S.teaAt = S.tau + 3; if (S.tally) S.tally.tea = key;
    S.effects.push({ kind: 'waiter', t0: S.tau, dur: 3.2 }); renderStrip(); updateBars();
    hint(`${D.teaOf(key).zh} · 伙计拎壶去了`); return true;
  }
  function addBasket(kind) {
    const d = D.dimsum(kind); if (!d) return;
    S.baskets.push({ kind, left: d.n, at: S.tau });
    if (S.tally) S.tally.baskets[kind] = (S.tally.baskets[kind] || 0) + 1;
  }
  function openOrder() {
    S.picked = new Set();
    orderGrid.innerHTML = '';
    for (const d of D.DIMSUM) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'item'; b.dataset.kind = d.key;
      const img = document.createElement('img'); img.src = dimsumIcon(d.key, 30); img.alt = '';
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = d.zh;
      const tier = document.createElement('span'); tier.className = 'tier'; tier.textContent = `${D.TIERS[d.tier].zh} ¥${D.TIERS[d.tier].price} · ${d.n} 件`; nm.appendChild(tier);
      const tick = document.createElement('span'); tick.className = 'tick';
      b.append(img, nm, tick);
      b.addEventListener('click', () => {
        if (S.picked.has(d.key)) S.picked.delete(d.key); else if (S.picked.size < D.ORDER_MAX) S.picked.add(d.key); else { hint(`一次最多勾 ${D.ORDER_MAX} 样 · 食完再叫`); return; }
        refreshOrder();
      });
      orderGrid.appendChild(b);
    }
    refreshOrder(); orderEl.classList.add('show'); updateBars();
  }
  function refreshOrder() {
    for (const b of orderGrid.children) { const on = S.picked.has(b.dataset.kind); b.classList.toggle('on', on); b.disabled = !on && S.picked.size >= D.ORDER_MAX; }
    orderGo.disabled = S.picked.size === 0;
    orderNote.textContent = S.picked.size ? `勾了 ${S.picked.size} 样 · 合计 ¥${[...S.picked].reduce((a, k) => a + D.tierOf(k).price, 0)}` : `一次最多勾 ${D.ORDER_MAX} 样`;
  }
  function placeOrder(kinds) {
    const list = (kinds || [...S.picked]).filter((k) => D.dimsum(k)).slice(0, D.ORDER_MAX);
    if (!list.length) return false;
    const plan = D.kitchenPlan(seed, S.orders++, list);
    for (const k of plan) S.kitchen.push({ kind: k.kind, at: S.tau + k.at });
    orderEl.classList.remove('show'); S.picked = new Set();
    S.effects.push({ kind: 'waiter', t0: S.tau, dur: 2.4 }); sfx.pen();
    hint(`伙计收了单：${list.map(D.dimsumName).join('、')} · 等出品`); updateBars();
    return true;
  }
  orderGo.addEventListener('click', () => { audio(); if (S.phase === 'seated') placeOrder(); });
  orderCancel.addEventListener('click', () => { orderEl.classList.remove('show'); updateBars(); });

  // ---------- 顶栏下的选择条：拣茶 / 点心车 ----------
  function renderStrip() {
    [...cartEl.querySelectorAll('button')].forEach((b) => b.remove());
    const who = cartEl.querySelector('.who');
    cartEl.classList.remove('tea');
    if (S.phase !== 'seated' || (!S.cart && !S.askTea)) { cartEl.classList.remove('show'); return; }
    if (S.cart) {
      who.textContent = '点心车';
      for (const it of S.cart.items) {
        const b = document.createElement('button'); b.type = 'button'; b.dataset.kind = it.kind;
        const img = document.createElement('img'); img.src = dimsumIcon(it.kind, 22); img.alt = '';
        b.append(img, document.createTextNode(`${D.dimsumName(it.kind)} ×${it.stock}`)); b.disabled = it.stock <= 0;
        b.addEventListener('click', () => { audio(); act(5, undefined, it.kind); });
        cartEl.appendChild(b);
      }
    } else {
      who.textContent = '饮乜茶？'; cartEl.classList.add('tea');
      for (const tea of D.TEAS) {
        const b = document.createElement('button'); b.type = 'button'; b.dataset.tea = tea.key; b.textContent = tea.zh;
        b.style.borderColor = tea.color;
        b.addEventListener('click', () => { audio(); chooseTea(tea.key); });
        cartEl.appendChild(b);
      }
    }
    cartEl.classList.add('show');
  }
  const renderCart = renderStrip;

  // ---------- 茶单（离席时的一张图，长按可存） ----------
  function showBill(tally) {
    const lines = D.billLines(tally);
    const Wc = 1080, Hc = 1180, c = document.createElement('canvas'); c.width = Wc; c.height = Hc;
    const g = c.getContext('2d');
    g.fillStyle = '#f3ead6'; g.fillRect(0, 0, Wc, Hc);
    // 纸纹：几道淡横线
    g.strokeStyle = 'rgba(42,33,24,.06)'; g.lineWidth = 2; for (let y = 60; y < Hc; y += 46) { g.beginPath(); g.moveTo(60, y); g.lineTo(Wc - 60, y); g.stroke(); }
    g.strokeStyle = '#6b4a2b'; g.lineWidth = 6; g.strokeRect(40, 40, Wc - 80, Hc - 80); g.lineWidth = 2; g.strokeRect(58, 58, Wc - 116, Hc - 116);
    g.fillStyle = '#2a2118'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '600 88px "Noto Serif SC", "Songti SC", serif'; g.fillText('搭台 · 埋单', Wc / 2, 170);
    g.font = '34px "Noto Serif SC", "Songti SC", serif'; g.fillStyle = 'rgba(42,33,24,.6)';
    const d = new Date(); g.fillText(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} 早市`, Wc / 2, 240);
    // 一张小桌
    g.fillStyle = '#6b4a2b'; g.beginPath(); g.ellipse(Wc / 2, 340, 150, 56, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#efe6d2'; g.beginPath(); g.ellipse(Wc / 2, 334, 142, 50, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f7f3ea'; g.strokeStyle = '#3b5b9a'; g.lineWidth = 3;
    for (const [dx, dy] of [[-80, 10], [80, 10], [-50, -24], [50, -24]]) { g.beginPath(); g.ellipse(Wc / 2 + dx, 334 + dy, 16, 9, 0, 0, Math.PI * 2); g.fill(); g.stroke(); }
    g.fillStyle = '#c9a063'; g.beginPath(); g.ellipse(Wc / 2 - 10, 326, 28, 13, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f7f3ea'; g.beginPath(); g.ellipse(Wc / 2 + 30, 318, 22, 20, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#2a2118'; g.font = '44px "Noto Serif SC", "Songti SC", serif'; g.textAlign = 'left';
    lines.forEach((ln, i) => { let fs = 44; g.font = `${fs}px "Noto Serif SC", "Songti SC", serif`; while (g.measureText(ln).width > Wc - 240 && fs > 26) { fs -= 2; g.font = `${fs}px "Noto Serif SC", "Songti SC", serif`; } g.fillText(ln, 120, 470 + i * 96); });
    // 红章
    g.save(); g.translate(Wc - 230, Hc - 230); g.rotate(-0.18); g.strokeStyle = 'rgba(199,83,47,.85)'; g.lineWidth = 8; g.strokeRect(-80, -80, 160, 160);
    g.fillStyle = 'rgba(199,83,47,.85)'; g.font = '600 64px "Noto Serif SC", "Songti SC", serif'; g.textAlign = 'center'; g.fillText('多謝', 0, -2); g.restore();
    g.fillStyle = 'rgba(42,33,24,.5)'; g.font = '28px "Noto Serif SC", "Songti SC", serif'; g.textAlign = 'center'; g.fillText('playground · 小试AI', Wc / 2, Hc - 100);
    billImg.src = c.toDataURL('image/png');
    cartEl.classList.remove('show'); billEl.classList.add('show'); updateBars();
    againBtn.textContent = S.closed ? '明早再来' : '再开一市';
  }
  againBtn.addEventListener('click', () => { audio(); const hadBill = S.phase === 'bill'; enterHall(); if (hadBill) S.effects.push({ kind: 'reenter', t0: 0, dur: 1.0 }); });

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
    call() { S.lastSound = 'call'; tone({ f0: 660, f1: 880, dur: 0.14, vol: 0.18, wave: 'triangle' }); tone({ f0: 880, f1: 760, dur: 0.18, vol: 0.14, wave: 'triangle', delay: 0.16 }); },
    pen() { S.lastSound = 'pen'; noise({ type: 'highpass', f0: 2500, dur: 0.08, vol: 0.25, rate: 1.8 }); noise({ type: 'highpass', f0: 2500, dur: 0.1, vol: 0.2, rate: 1.6, delay: 0.14 }); },
    potdown() { S.lastSound = 'potdown'; tone({ f0: 2400, f1: 2200, dur: 0.3, vol: 0.22 }); noise({ type: 'lowpass', f0: 400, dur: 0.12, vol: 0.3, delay: 0.02 }); tone({ f0: 1900, f1: 1800, dur: 0.25, vol: 0.12, delay: 0.3 }); },
    cart(v) { S.lastSound = 'cart'; const vol = v || 1; for (let i = 0; i < 4; i++) noise({ type: 'lowpass', f0: 500, dur: 0.09, vol: 0.22 * vol, rate: 0.7 + i * 0.1, delay: i * 0.13 }); tone({ f0: 180, f1: 150, dur: 0.5, vol: 0.06 * vol, wave: 'triangle' }); },
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
  function teaColor() { const tea = S.tea ? D.teaOf(S.tea) : null; return tea ? tea.color : C.tea; }

  // 十四样点心各画各的样子，s 是基准尺寸（一件约 s 宽）。g 可以是任意 2D 上下文（页面、图标、茶单共用）。
  function drawDimsum(g, kind, x, y, s) {
    const E = (cx, cy, rx, ry) => { g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); };
    g.lineWidth = Math.max(0.8, s * 0.08);
    switch (kind) {
      case 'har': // 虾饺：半透明月牙皮，透出粉红虾肉，皮上褶
        g.fillStyle = '#f0a3a0'; E(x, y + s * 0.05, s * 0.5, s * 0.3); g.fill();
        g.fillStyle = 'rgba(255,255,255,.72)'; g.beginPath(); g.moveTo(x - s * 0.52, y + s * 0.1); g.quadraticCurveTo(x, y - s * 0.55, x + s * 0.52, y + s * 0.1); g.quadraticCurveTo(x, y + s * 0.4, x - s * 0.52, y + s * 0.1); g.fill();
        g.strokeStyle = 'rgba(200,170,170,.8)'; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(x + i * s * 0.14, y - s * 0.3 + Math.abs(i) * s * 0.06); g.lineTo(x + i * s * 0.17, y + s * 0.02); g.stroke(); } break;
      case 'siu': // 烧卖：黄皮直筒，橙红肉顶，一点蟹籽
        g.fillStyle = '#e9c35a'; g.fillRect(x - s * 0.36, y - s * 0.15, s * 0.72, s * 0.5); E(x, y + s * 0.35, s * 0.36, s * 0.14); g.fill();
        g.fillStyle = '#e07a4a'; E(x, y - s * 0.15, s * 0.34, s * 0.2); g.fill();
        g.fillStyle = '#f0b040'; E(x + s * 0.08, y - s * 0.2, s * 0.08, s * 0.06); g.fill(); break;
      case 'bao': // 叉烧包：白胖圆，顶上开口露出酱红
        g.fillStyle = '#fbf7ef'; E(x, y, s * 0.5, s * 0.42); g.fill(); g.strokeStyle = '#e4dccb'; g.stroke();
        g.fillStyle = '#9c3b22'; g.beginPath(); g.moveTo(x - s * 0.16, y - s * 0.3); g.lineTo(x + s * 0.16, y - s * 0.3); g.lineTo(x + s * 0.02, y - s * 0.05); g.closePath(); g.fill(); break;
      case 'feet': // 凤爪：酱红亮，三根趾
        g.fillStyle = '#b4452a'; E(x, y + s * 0.1, s * 0.3, s * 0.26); g.fill();
        g.strokeStyle = '#b4452a'; g.lineWidth = s * 0.16; g.lineCap = 'round'; for (const a of [-0.9, -0.45, 0]) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a - 1.2) * s * 0.55, y + Math.sin(a - 1.2) * s * 0.55); g.stroke(); }
        g.fillStyle = 'rgba(255,220,200,.5)'; E(x - s * 0.08, y, s * 0.08, s * 0.05); g.fill(); break;
      case 'rib': // 豉汁排骨：三块褐色，黑豆豉点
        g.fillStyle = '#8a5a35'; for (const [dx, dy] of [[-0.3, 0.05], [0.05, -0.12], [0.32, 0.1]]) { E(x + dx * s, y + dy * s, s * 0.22, s * 0.17); g.fill(); }
        g.fillStyle = '#2a1a10'; for (const [dx, dy] of [[-0.25, 0], [0.1, -0.15], [0.3, 0.08], [-0.05, 0.1]]) { E(x + dx * s, y + dy * s, s * 0.04, s * 0.03); g.fill(); } break;
      case 'roll': // 肠粉：两条白卷，泡在酱油里
        g.fillStyle = 'rgba(90,50,20,.55)'; E(x, y + s * 0.15, s * 0.6, s * 0.22); g.fill();
        g.fillStyle = '#fbf8f2'; g.strokeStyle = '#e8e0d0'; for (const dy of [-0.08, 0.14]) { g.beginPath(); g.roundRect ? g.roundRect(x - s * 0.52, y + dy * s - s * 0.1, s * 1.04, s * 0.2, s * 0.1) : g.rect(x - s * 0.52, y + dy * s - s * 0.1, s * 1.04, s * 0.2); g.fill(); g.stroke(); } break;
      case 'cake': // 马拉糕：棕黄方块，气孔
        g.fillStyle = '#c98a3e'; g.fillRect(x - s * 0.4, y - s * 0.3, s * 0.8, s * 0.6); g.fillStyle = '#e0a452'; g.fillRect(x - s * 0.4, y - s * 0.3, s * 0.8, s * 0.14);
        g.fillStyle = 'rgba(80,40,10,.35)'; for (const [dx, dy] of [[-0.2, 0.05], [0.1, 0.15], [0.25, -0.05], [-0.05, -0.08]]) { E(x + dx * s, y + dy * s, s * 0.04, s * 0.04); g.fill(); } break;
      case 'tart': // 蛋挞：花边酥皮，黄蛋心
        g.fillStyle = '#d9a95a'; E(x, y, s * 0.5, s * 0.36); g.fill(); g.strokeStyle = '#b88638'; g.lineWidth = s * 0.1; g.setLineDash([s * 0.12, s * 0.08]); E(x, y, s * 0.46, s * 0.32); g.stroke(); g.setLineDash([]);
        g.fillStyle = '#f2c43a'; E(x, y, s * 0.34, s * 0.23); g.fill(); break;
      case 'rice': // 糯米鸡：荷叶包，捆绳
        g.fillStyle = '#5f7a3a'; g.beginPath(); g.roundRect ? g.roundRect(x - s * 0.5, y - s * 0.32, s, s * 0.64, s * 0.12) : g.rect(x - s * 0.5, y - s * 0.32, s, s * 0.64); g.fill();
        g.strokeStyle = '#3f5526'; g.beginPath(); g.moveTo(x - s * 0.5, y); g.lineTo(x + s * 0.5, y); g.moveTo(x, y - s * 0.32); g.lineTo(x, y + s * 0.32); g.stroke(); break;
      case 'turnip': // 萝卜糕：煎到两面焦黄的厚片
        g.fillStyle = '#f0e2c4'; g.fillRect(x - s * 0.45, y - s * 0.22, s * 0.9, s * 0.44); g.fillStyle = 'rgba(190,120,50,.55)'; g.fillRect(x - s * 0.45, y - s * 0.22, s * 0.9, s * 0.1); g.fillRect(x - s * 0.45, y + s * 0.12, s * 0.9, s * 0.1);
        g.fillStyle = '#c9553a'; for (const [dx, dy] of [[-0.2, 0.02], [0.15, -0.04], [0.3, 0.08]]) { E(x + dx * s, y + dy * s, s * 0.05, s * 0.04); g.fill(); } break;
      case 'lava': // 流沙包：雪白圆包，顶一点黄
        g.fillStyle = '#fdfbf5'; E(x, y, s * 0.46, s * 0.4); g.fill(); g.strokeStyle = '#e8e0d0'; g.stroke();
        g.fillStyle = '#f0c040'; E(x, y - s * 0.3, s * 0.1, s * 0.06); g.fill(); break;
      case 'beef': // 牛肉球：两个灰褐圆球，垫腐皮
        g.fillStyle = '#e8d9b8'; E(x, y + s * 0.2, s * 0.55, s * 0.16); g.fill();
        g.fillStyle = '#8f7a66'; E(x - s * 0.22, y, s * 0.24, s * 0.24); g.fill(); E(x + s * 0.22, y - s * 0.02, s * 0.24, s * 0.24); g.fill();
        g.fillStyle = '#4f7a3a'; E(x - s * 0.2, y - s * 0.1, s * 0.05, s * 0.03); g.fill(); break;
      case 'spring': // 春卷：金黄两条
        g.fillStyle = '#d9962f'; for (const dy of [-0.1, 0.12]) { g.beginPath(); g.roundRect ? g.roundRect(x - s * 0.5, y + dy * s - s * 0.1, s, s * 0.2, s * 0.1) : g.rect(x - s * 0.5, y + dy * s - s * 0.1, s, s * 0.2); g.fill(); }
        g.strokeStyle = 'rgba(120,70,10,.5)'; g.beginPath(); g.moveTo(x - s * 0.3, y - s * 0.1); g.lineTo(x + s * 0.3, y - s * 0.1); g.stroke(); break;
      case 'ham': // 咸水角：枣形金黄，表面起泡
        g.fillStyle = '#e0a93f'; E(x, y, s * 0.52, s * 0.3); g.fill();
        g.fillStyle = 'rgba(255,240,200,.6)'; for (const [dx, dy] of [[-0.25, -0.08], [0.05, -0.14], [0.3, -0.02], [-0.05, 0.08]]) { E(x + dx * s, y + dy * s, s * 0.05, s * 0.04); g.fill(); } break;
      default:
        g.fillStyle = '#f3dcc5'; E(x, y, s * 0.45, s * 0.3); g.fill();
    }
  }
  const iconCache = new Map();
  function dimsumIcon(kind, size) {
    const key = kind + '@' + size;
    if (iconCache.has(key)) return iconCache.get(key);
    const c = document.createElement('canvas'); c.width = c.height = size * 2;
    const g = c.getContext('2d'); g.scale(2, 2); drawDimsum(g, kind, size / 2, size / 2 + 1, size * 0.78);
    const url = c.toDataURL('image/png'); iconCache.set(key, url); return url;
  }
  // 自己桌上的笼：排在左前方，最多四笼
  function basketPos(i) { const L = layout(); return { x: L.cx - L.rx * 0.52 + (i % 2) * 36, y: L.cy + L.ry * 0.02 + Math.floor(i / 2) * 22 - (i % 2) * 7 }; }
  const SLOT_ANGLE = [Math.PI * 0.72, Math.PI * 1.22, Math.PI * 1.78, Math.PI * 0.28]; // 前左、后左、后右、前右
  function slotPos(L, slot, k) {
    const a = SLOT_ANGLE[slot];
    return { x: L.cx + Math.cos(a) * L.rx * k, y: L.cy + Math.sin(a) * L.ry * k, back: slot === 1 || slot === 2 };
  }

  // 早市的光：0 清早暖黄斜长，1 近午发白变短；快收市再带一点灰
  function dayK() { return Math.max(0, Math.min(1, S.tau / D.CLOSE)); }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function draw() {
    const L = layout(), t = S.tau, k = dayK();
    L.k = k;
    // 地板
    ctx.fillStyle = C.floor; ctx.fillRect(0, L.horizon, W, H - L.horizon);
    if (k > 0.3) { ctx.fillStyle = `rgba(255,250,240,${(k - 0.3) * 0.18})`; ctx.fillRect(0, L.horizon, W, H - L.horizon); }
    ctx.strokeStyle = C.floorLine; ctx.lineWidth = 1;
    for (let i = 0; i < 9; i++) { const y = L.horizon + ((H - L.horizon) * Math.pow(i / 8, 1.6)); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    for (let i = -6; i <= 6; i++) { ctx.beginPath(); ctx.moveTo(W / 2 + i * W * 0.045, L.horizon); ctx.lineTo(W / 2 + i * W * 0.22, H); ctx.stroke(); }
    drawWall(L, t);
    drawFarTables(L, t);
    // 近桌：后排的人 → 桌 → 前排的人
    const people = peopleAtTable();
    for (const p of people) if (p.back) drawPerson(L, p, t);
    drawTable(L, t);
    if (S.cart) drawCart(L, t);
    for (const p of people) if (!p.back) drawPerson(L, p, t);
    drawEffects(L, t);
    if (S.phase === 'door') drawDoorVeil(L, t);
    if (S.dayPhase >= 1) { ctx.fillStyle = `rgba(200,205,215,${S.dayPhase === 2 ? 0.22 : 0.1})`; ctx.fillRect(0, 0, W, H); }
  }

  function drawWall(L, t) {
    const g = ctx.createLinearGradient(0, 0, 0, L.horizon); g.addColorStop(0, C.wallDark); g.addColorStop(1, C.wall);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, L.horizon);
    if (L.k > 0.3) { ctx.fillStyle = `rgba(255,250,240,${(L.k - 0.3) * 0.25})`; ctx.fillRect(0, 0, W, L.horizon); }
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
      // 清早的光斜长偏黄，近午竖直变短发白
      const reach = lerp(0.25, 0.06, L.k), skew = lerp(0.6, 0.05, L.k), warm = lerp(1, 0.35, L.k);
      ctx.fillStyle = `rgba(${Math.round(lerp(255, 243, warm))},${Math.round(lerp(250, 217, warm))},${Math.round(lerp(235, 160, warm))},${lerp(0.5, 0.28, L.k)})`;
      ctx.beginPath(); ctx.moveTo(x, y + wh); ctx.lineTo(x + ww, y + wh); ctx.lineTo(x + ww * (1 + skew), L.horizon + (H - L.horizon) * reach); ctx.lineTo(x - ww * skew * 0.35, L.horizon + (H - L.horizon) * reach); ctx.closePath(); ctx.fill();
    }
    // 木柱
    for (const x of [W * 0.06, W * 0.94]) { ctx.fillStyle = C.woodDark; ctx.fillRect(x - 9, 0, 18, L.horizon); ctx.fillStyle = C.woodLight; ctx.fillRect(x - 3, 0, 4, L.horizon); }
    // 吊扇
    const fx = W / 2, fy = L.horizon * 0.07;
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(fx, 0); ctx.lineTo(fx, fy); ctx.stroke();
    ctx.fillStyle = C.rim; ell(fx, fy, 7, 3.5); ctx.fill();
    for (let i = 0; i < 4; i++) { const a = S.fan + i * Math.PI / 2; ctx.fillStyle = 'rgba(74,49,25,.85)'; ctx.beginPath(); ctx.ellipse(fx + Math.cos(a) * 17, fy + Math.sin(a) * 3.5, 15, 2.6, a, 0, Math.PI * 2); ctx.fill(); }
    // 鸟笼：快收市时伙计取下
    if (S.dayPhase < 1) {
    const bx = W * 0.88, by = L.horizon * 0.22, bw = 14, bh = 26;
    ctx.strokeStyle = C.rim; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx, by - bh * 0.5); ctx.stroke();
    ctx.beginPath(); ctx.arc(bx, by - bh * 0.3, bw, Math.PI, 0); ctx.moveTo(bx - bw, by - bh * 0.3); ctx.lineTo(bx - bw, by + bh * 0.5); ctx.lineTo(bx + bw, by + bh * 0.5); ctx.lineTo(bx + bw, by - bh * 0.3); ctx.stroke();
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(bx + i * bw * 0.45, by - bh * 0.3 - Math.sqrt(Math.max(0, bw * bw - (i * bw * 0.45) ** 2))); ctx.lineTo(bx + i * bw * 0.45, by + bh * 0.5); ctx.stroke(); }
    ctx.fillStyle = C.glass[2]; ell(bx + Math.sin(t * 1.3) * 3, by + bh * 0.1, 4, 3); ctx.fill();
    }
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
      const onPlate = who ? (who.kind === 'me' ? S.myPlate : (who.plate || 0)) : 0;
      for (let i = 0; i < Math.min(onPlate, 3); i++) {
        const px = p.x + (slot < 2 ? 14 : -14) * (p.back ? 0.7 : 1) + (i - 1) * 6, py = p.y + (p.back ? 1 : 0) - i * 1.5;
        const kind = who.kind === 'me' ? (S.plateKinds[S.plateKinds.length - Math.min(onPlate, 3) + i] || 'har') : ['siu', 'har', 'bao'][i];
        drawDimsum(ctx, kind, px, py, p.back ? 8 : 11);
      }
      // 茶盅
      const r = (p.back ? 6.5 : 8.5);
      ctx.fillStyle = C.porcelain; ell(p.x, p.y + 3, r, r * 0.5); ctx.fill(); ctx.fillRect(p.x - r, p.y - 4, r * 2, 7); ell(p.x, p.y - 4, r, r * 0.5); ctx.fill();
      ctx.strokeStyle = C.blue; ctx.lineWidth = 1; ell(p.x, p.y - 4, r, r * 0.5); ctx.stroke();
      if (cup > 0.05) { ctx.fillStyle = teaColor(); ell(p.x, p.y - 4, r * 0.8, r * 0.4); ctx.fill(); }
      if (cup > 0.6 && Math.sin(t * 2 + slot) > 0) drawSteam(p.x, p.y - 8, t + slot, 0.5);
    }
    // 茶壶与大碗（茶到了才上桌）、自己的笼
    if (S.potHere) { drawPot(L, t); drawBowl(L, t); }
    drawBaskets(L, t);
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
    ctx.fillStyle = teaColor(); ctx.globalAlpha = 0.28; ctx.fillRect(x - r * 0.5, y + r * 0.6 - S.pot.level * r * 0.9, r, S.pot.level * r * 0.9); ctx.globalAlpha = 1;
  }
  function drawBaskets(L, t) {
    S.baskets.slice(0, 4).forEach((bk, i) => {
      const { x, y } = basketPos(i), r = 17;
      ctx.fillStyle = C.bambooDark; ell(x, y + 4, r, r * 0.45); ctx.fill();
      ctx.fillStyle = C.bamboo; ctx.fillRect(x - r, y - 5, r * 2, 9); ell(x, y - 5, r, r * 0.45); ctx.fill();
      ctx.strokeStyle = C.bambooDark; ctx.lineWidth = 1; ell(x, y - 5, r, r * 0.45); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ell(x, y - 5, r * 0.8, r * 0.3); ctx.fill();
      const d = D.dimsum(bk.kind), n = d ? d.n : 3;
      for (let k = 0; k < bk.left; k++) { const a = (k / n) * Math.PI * 2 + 0.6, rr = bk.left === 1 ? 0 : 7; drawDimsum(ctx, bk.kind, x + Math.cos(a) * rr, y - 7 + Math.sin(a) * rr * 0.5, 10.5); }
      // 盖子斜靠在笼边
      ctx.fillStyle = C.bamboo; ctx.beginPath(); ctx.ellipse(x + r * 0.9, y - 8, r * 0.9, r * 0.25, -0.5, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = C.bambooDark; ctx.stroke();
      if (bk.left > 0) drawSteam(x, y - 12, t * 1.2 + i, 0.7);
      else { ctx.fillStyle = 'rgba(42,33,24,.5)'; ctx.font = '9px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText('空', x, y - 2); }
    });
    if (S.baskets.length > 4) { ctx.fillStyle = 'rgba(42,33,24,.6)'; ctx.font = '10px serif'; ctx.textAlign = 'left'; ctx.fillText(`+${S.baskets.length - 4} 笼`, L.cx - L.rx * 0.5 + 62, L.cy + 18); }
  }
  // 洗杯的大碗：在你的位子旁边
  function drawBowl(L, t) {
    const p = slotPos(L, 0, 0.66), x = p.x + 30, y = p.y - 10, r = 11;
    ctx.fillStyle = C.porcelain; ell(x, y + 4, r, r * 0.45); ctx.fill(); ctx.fillRect(x - r, y - 2, r * 2, 6); ell(x, y - 2, r, r * 0.5); ctx.fill();
    ctx.strokeStyle = C.blue; ctx.lineWidth = 1; ell(x, y - 2, r, r * 0.5); ctx.stroke();
    if (S.rinsed) { ctx.fillStyle = teaColor(); ctx.globalAlpha = 0.5; ell(x, y - 2, r * 0.78, r * 0.36); ctx.fill(); ctx.globalAlpha = 1; }
    // 没洗杯前筷子横在碗上
    if (!S.rinsed) { ctx.strokeStyle = C.bambooDark; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - 14, y - 4); ctx.lineTo(x + 14, y - 1); ctx.moveTo(x - 14, y - 1); ctx.lineTo(x + 14, y + 2); ctx.stroke(); }
  }
  // 伙计：从右边走到桌边又走开（送茶、出品、收碟都靠他）
  function drawWaiter(L, t, e) {
    const k = (t - e.t0) / e.dur, ease = (v) => 1 - Math.pow(1 - v, 3);
    const xHome = Math.min(W - 30, L.cx + L.rx * 1.12), xFar = W + 40;
    const x = k < 0.4 ? lerp(xFar, xHome, ease(k / 0.4)) : k < 0.6 ? xHome : lerp(xHome, xFar, ease((k - 0.6) / 0.4));
    const y = L.cy - L.ry * 0.55;
    ctx.fillStyle = '#f0ebe0'; ctx.beginPath(); ctx.moveTo(x - 13, y); ctx.lineTo(x - 13, y - 24); ctx.quadraticCurveTo(x, y - 34, x + 13, y - 24); ctx.lineTo(x + 13, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = C.skin; ell(x, y - 34, 8.5, 9.5); ctx.fill(); ctx.fillStyle = '#2a2118'; ell(x, y - 40, 8, 4.2); ctx.fill();
    // 手里托着东西
    ctx.fillStyle = C.bamboo; ell(x - 16, y - 14, 9, 4); ctx.fill();
  }
  // 点心车：从右边推到桌旁，停一会儿再走；车上三格，标着名字和剩几件
  function cartPos(L, t) {
    const inK = Math.min(1, (t - S.cart.arrivedAt) / 0.9), outK = Math.max(0, (t - (S.cart.leaveAt - 0.8)) / 0.8);
    const ease = (v) => 1 - Math.pow(1 - v, 3);
    const xHome = Math.min(W - 44, L.cx + L.rx * 1.12 + 10), xFar = W + 60;
    const x = outK > 0 ? lerp(xHome, xFar, ease(outK)) : lerp(xFar, xHome, ease(inK));
    return { x, y: L.cy - L.ry * 0.35, w: Math.min(78, W * 0.2), h: 26 };
  }
  function drawCart(L, t) {
    const c = cartPos(L, t), x = c.x, y = c.y, w = c.w;
    // 伙计
    ctx.fillStyle = '#f0ebe0'; ctx.beginPath(); ctx.moveTo(x - 14, y - 2); ctx.lineTo(x - 14, y - 26); ctx.quadraticCurveTo(x, y - 36, x + 14, y - 26); ctx.lineTo(x + 14, y - 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = C.skin; ell(x, y - 36, 9, 10); ctx.fill(); ctx.fillStyle = '#2a2118'; ell(x, y - 42, 8.5, 4.5); ctx.fill();
    // 车
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ell(x, y + c.h + 10, w * 0.6, 7); ctx.fill();
    ctx.fillStyle = C.woodDark; ctx.fillRect(x - w / 2, y, w, c.h); ctx.fillStyle = C.woodLight; ctx.fillRect(x - w / 2, y, w, 4);
    ctx.fillStyle = C.rim; ell(x - w * 0.3, y + c.h + 4, 6, 6); ctx.fill(); ell(x + w * 0.3, y + c.h + 4, 6, 6); ctx.fill();
    ctx.strokeStyle = C.rim; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + w / 2, y + 6); ctx.lineTo(x + w / 2 + 12, y - 8); ctx.stroke();
    // 三摞小笼与标签
    S.cart.items.forEach((it, i) => {
      const sx = x - w / 2 + w * (0.18 + i * 0.32), sy = y - 2;
      for (let k = 0; k < Math.max(1, Math.min(it.stock, 3)); k++) { ctx.fillStyle = k === Math.min(it.stock, 3) - 1 ? C.bamboo : C.bambooDark; ell(sx, sy - k * 4, 9, 4); ctx.fill(); }
      if (it.stock <= 0) { ctx.strokeStyle = 'rgba(42,33,24,.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(sx - 6, sy - 10); ctx.lineTo(sx + 6, sy + 2); ctx.stroke(); }
      else { drawDimsum(ctx, it.kind, sx, sy - Math.min(it.stock, 3) * 4 - 3, 9); drawSteam(sx, sy - 16, t + i, 0.5); }
    });
    // 车身上写着字，不另挂牌子（免得压到邻座的标签）
    ctx.fillStyle = '#f0d9a0'; ctx.font = '10px "Noto Serif SC", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText('点 心 车', x, y + c.h - 7);
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
        const cp = e.fromCart && S.cart ? cartPos(L, t) : null;
        const from = cp ? { x: cp.x, y: cp.y - 10 } : e.from ? { x: e.from.x, y: e.from.y - 14 } : { x: L.cx - L.rx * 0.42, y: L.cy - L.ry * 0.05 - 14 };
        const to = e.basket ? basketPos(Math.max(0, Math.min(3, S.baskets.length - 1))) : slotPos(L, e.slot, 0.66);
        const x = from.x + (to.x + 14 - from.x) * k, y = from.y + (to.y - from.y) * k - Math.sin(k * Math.PI) * 18;
        ctx.strokeStyle = C.bambooDark; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - 3, y + 2); ctx.lineTo(x - 10, y + 28); ctx.moveTo(x + 3, y + 2); ctx.lineTo(x - 4, y + 28); ctx.stroke();
        if (e.basket) { ctx.fillStyle = C.bamboo; ell(x, y + 2, 12, 5); ctx.fill(); ctx.strokeStyle = C.bambooDark; ctx.stroke(); } else drawDimsum(ctx, (e.from && S.plateKinds[S.plateKinds.length - 1]) || 'har', x, y + 2, 11);
      } else if (e.kind === 'rinse') {
        const pot = { x: L.cx + L.rx * 0.08, y: L.cy - L.ry * 0.25 - 16 }, p = slotPos(L, 0, 0.66), bowl = { x: p.x + 30, y: p.y - 12 };
        ctx.strokeStyle = teaColor(); ctx.lineWidth = 2.2; ctx.globalAlpha = k < 0.6 ? 0.9 : 0.9 * (1 - (k - 0.6) / 0.4);
        ctx.beginPath(); ctx.moveTo(pot.x + 14, pot.y); ctx.quadraticCurveTo((pot.x + bowl.x) / 2, Math.min(pot.y, bowl.y) - 26, bowl.x, bowl.y); ctx.stroke(); ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1; for (let i = 0; i < 3; i++) { ctx.globalAlpha = Math.max(0, 1 - ((k * 3 + i * 0.33) % 1)); ell(bowl.x, bowl.y + 2, 6 + ((k * 3 + i * 0.33) % 1) * 10, 2.5 + ((k * 3 + i * 0.33) % 1) * 4); ctx.stroke(); } ctx.globalAlpha = 1;
        drawSteam(bowl.x, bowl.y - 6, t, 0.8);
      } else if (e.kind === 'waiter') {
        drawWaiter(L, t, e);
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
    ctx.fillStyle = '#f3e6c8'; ctx.font = '12px "Noto Serif SC", serif'; ctx.textAlign = 'center'; ctx.fillText(S.closed ? '收市了' : '你的位', p.x, p.y - 50 + bob);
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
    const map = { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 8, '8': 6 };
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
      pot: { ...S.pot }, myCup: S.myCup, myPlate: S.myPlate, myPage: S.myPage,
      knockOpen: S.tau <= S.knockUntil, lastSound: S.lastSound, effects: S.effects.map((e) => e.kind), visits: visits.length,
      clock: D.clockAt(S.tau), dayPhase: S.dayPhase, closed: S.closed, cart: S.cart ? S.cart.items.map((x) => [x.kind, x.stock]) : null, cartChips: cartEl.querySelectorAll('button').length, cartShown: cartEl.classList.contains('show'),
      tally: S.tally, bill: S.phase === 'bill' ? S.lastBill : null, billShown: billEl.classList.contains('show'),
      tea: S.tea, askTea: S.askTea, potHere: S.potHere, rinsed: S.rinsed, baskets: S.baskets.map((b) => [b.kind, b.left]), kitchen: S.kitchen.length, orders: S.orders, orderShown: orderEl.classList.contains('show'), plateKinds: S.plateKinds.slice(), stripKind: cartEl.classList.contains('show') ? (S.cart ? 'cart' : 'tea') : null,
      hint: hintEl.textContent, where: whereEl.textContent, hallText: hallEl.textContent, frameStamp,
    };
  }
  window.__datai = {
    get ready() { return !!S; }, act, snapshot, canAct, get state() { return S; }, get visits() { return visits; }, get frameStamp() { return frameStamp; },
    pause(p) { paused = p; }, step(ms) { tick(ms / 1000); draw(); frameStamp++; }, chooseTea, order: placeOrder, openOrder, dimsumIcon,
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
    if (Q.get('door') !== '1') { act(0); if (Q.get('ask') !== '1') chooseTea(Q.get('tea') || 'puer'); }
    const t = +Q.get('t');
    if (t > 0) { const steps = Math.ceil(t / 0.05); for (let i = 0; i < steps; i++) tick(t / steps); paused = true; }
  }
  updateBars();
  requestAnimationFrame(frame);
})();
