// 茶楼搭台 · 核心规则。浏览器与 Node 测试共用：分桌、来访记录与回放、灰色身影补位、带种子随机。
// 没有画面、没有声音、不碰 DOM 和 localStorage——那些都在 game.js。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DATAI = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CAP = 4;            // 一桌四位，茶楼搭台的常态
  const MAX_VISITS = 12;    // 本机最多记最近 12 次来访
  const MIN_GHOST_STAY = 45; // 幽灵在座至少这么多秒，免得一进门它就走了
  const MAX_DUR = 1800;     // 一次来访最长记半小时
  const CLOSE = 300;        // 早市一共这么多秒真时间：进门是 7:00，收市是 11:00
  const OPEN_HOUR = 7, CLOSE_HOUR = 11;
  // 点心车上会出现的点心：名字、一句话（茶单上用）
  const DIMSUM = [
    { key: 'har', zh: '虾饺' }, { key: 'siu', zh: '烧卖' }, { key: 'bao', zh: '叉烧包' }, { key: 'feet', zh: '凤爪' },
    { key: 'rib', zh: '排骨' }, { key: 'roll', zh: '肠粉' }, { key: 'cake', zh: '马拉糕' }, { key: 'tart', zh: '蛋挞' },
  ];

  // 动作码。0–6 是玩家能按的七个，7 只给桌上的别人用（抿一口茶，没有按钮）
  const ACTS = [
    { code: 0, key: 'sit',   zh: '落座' },
    { code: 1, key: 'pour',  zh: '斟茶' },
    { code: 2, key: 'knock', zh: '叩指' },
    { code: 3, key: 'lid',   zh: '揭盖' },
    { code: 4, key: 'paper', zh: '翻报纸' },
    { code: 5, key: 'pick',  zh: '夹一件' },
    { code: 6, key: 'leave', zh: '离席' },
    { code: 7, key: 'sip',   zh: '抿茶' },
  ];
  const PLAYER_ACTS = ACTS.slice(0, 7);

  // ---------- 带种子随机（测试与固定机位可复现） ----------
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  // ---------- 分桌 ----------
  // hall = { cap, tables: Map<桌号, Map<客人 id, 座位序号>> }
  function createHall(cap) { return { cap: cap || CAP, tables: new Map() }; }

  function tableOf(hall, id) {
    for (const [no, guests] of hall.tables) if (guests.has(id)) return no;
    return null;
  }

  // 规则：进「最满的未满桌」；平手取最小桌号；都满（或没有桌）就开最小未用号的新桌。
  function seat(hall, id) {
    if (tableOf(hall, id) !== null) throw new Error(`${id} 已经坐在第 ${tableOf(hall, id)} 桌`);
    let best = null;
    for (const [no, guests] of hall.tables) {
      if (guests.size >= hall.cap) continue;
      if (!best || guests.size > best.size || (guests.size === best.size && no < best.no)) best = { no, size: guests.size };
    }
    if (!best) {
      let no = 1;
      while (hall.tables.has(no)) no++;
      hall.tables.set(no, new Map());
      best = { no, size: 0 };
    }
    const guests = hall.tables.get(best.no);
    const taken = new Set(guests.values());
    let seatNo = 0;
    while (taken.has(seatNo)) seatNo++;
    guests.set(id, seatNo);
    return { table: best.no, seat: seatNo };
  }

  // 规则：最后一位离席，这张桌就撤掉。
  function leave(hall, id) {
    for (const [no, guests] of hall.tables) {
      if (guests.delete(id)) {
        if (guests.size === 0) hall.tables.delete(no);
        return no;
      }
    }
    return null;
  }

  function summary(hall) {
    let guests = 0;
    for (const g of hall.tables.values()) guests += g.size;
    return { tables: hall.tables.size, guests };
  }

  function tableList(hall) {
    return [...hall.tables.entries()].sort((a, b) => a[0] - b[0]).map(([no, g]) => ({ no, count: g.size, cap: hall.cap }));
  }

  // ---------- 来访记录 ----------
  // 一次来访：{ v:1, at:进门时刻(ms), dur:在座秒数, acts:[[相对秒, 动作码], ...] }。没有名字、没有文字。
  function newVisit(at) { return { v: 1, at: at, dur: 0, acts: [] }; }

  function recordAct(visit, t, code) {
    if (!(t >= 0) || !Number.isInteger(code) || code < 0 || code > 6) return false;
    const last = visit.acts.length ? visit.acts[visit.acts.length - 1][0] : 0;
    visit.acts.push([Math.round(Math.max(t, last) * 10) / 10, code]);
    return true;
  }

  function closeVisit(visit, dur) {
    visit.dur = Math.round(Math.min(Math.max(dur, 0), MAX_DUR) * 10) / 10;
    return visit;
  }

  function isVisit(x) {
    if (!x || x.v !== 1 || typeof x.at !== 'number' || typeof x.dur !== 'number' || !Array.isArray(x.acts)) return false;
    if (x.acts.length > 400) return false;
    let last = -1;
    for (const a of x.acts) {
      if (!Array.isArray(a) || a.length !== 2 || typeof a[0] !== 'number' || !Number.isInteger(a[1])) return false;
      if (a[0] < last || a[1] < 0 || a[1] > 6) return false;
      last = a[0];
    }
    return true;
  }

  function encodeVisits(list) { return JSON.stringify(list.filter(isVisit)); }

  function decodeVisits(str) {
    try {
      const arr = JSON.parse(str);
      if (!Array.isArray(arr)) return [];
      return arr.filter(isVisit).slice(-MAX_VISITS);
    } catch (e) { return []; }
  }

  function pushVisit(list, visit, max) {
    const out = list.concat([visit]);
    const cap = max || MAX_VISITS;
    return out.length > cap ? out.slice(out.length - cap) : out;
  }

  // ---------- 把历史来访排成今天桌上的幽灵 ----------
  // 幽灵按它们当年进门的先后依次落座（走同一套分桌规则），再轮到玩家。
  // 每个幽灵从 0 秒起在座，坐到 max(dur, MIN_GHOST_STAY) 秒离席；离席后桌空就撤。
  // knocks：它当年有没有叩过指——有，今天你给它斟茶它就会回叩。
  function planGhosts(visits, cap) {
    const hall = createHall(cap);
    const ghosts = [];
    const sorted = visits.slice().sort((a, b) => a.at - b.at);
    sorted.forEach((v, i) => {
      const id = 'g' + i;
      const pos = seat(hall, id);
      ghosts.push({
        id, table: pos.table, seat: pos.seat, start: 0,
        end: Math.max(v.dur || 0, MIN_GHOST_STAY),
        acts: v.acts.filter((a) => a[1] !== 0 && a[1] !== 6), // 落座与离席由 start / end 表达
        knocks: v.acts.some((a) => a[1] === 2),
        at: v.at,
      });
    });
    const me = seat(hall, 'me');
    return { hall, ghosts, me };
  }

  // 桌上「别人」少于 2 个就补灰色身影，补到 2 个；它们不算人数。
  function residentsFor(othersAtTable) { return Math.max(0, 2 - othersAtTable); }

  // 灰影的日程：种子决定，每个灰影一张表，32 秒一轮，周而复始。
  // 内容只有抿茶、翻报、偶尔斟茶（给全桌）——不落座、不离席、不揭盖、不夹件。
  function residentSchedule(seed, index) {
    const r = rng(seed * 7919 + index * 104729 + 17);
    const acts = [];
    let t = 2 + r() * 6;
    while (t < 32) {
      const p = r();
      acts.push([Math.round(t * 10) / 10, p < 0.55 ? 7 : p < 0.85 ? 4 : 1]);
      t += 4 + r() * 8;
    }
    return { period: 32, acts };
  }

  // 幽灵在时刻 tau（进门后的秒数）该做的事：返回 [start, end) 落在 (prev, tau] 内的动作
  function dueActs(acts, prev, tau) {
    const out = [];
    for (const a of acts) if (a[0] > prev && a[0] <= tau) out.push(a);
    return out;
  }

  // 固定机位用的合成来访：n 个，各坐 stay 秒，带几个动作。不写进 localStorage。
  function syntheticVisits(n, seed, stay) {
    const r = rng(seed || 7);
    const out = [];
    for (let i = 0; i < n; i++) {
      const v = newVisit(1700000000000 + i * 3600000);
      let t = 3 + r() * 4;
      const count = 3 + Math.floor(r() * 4);
      for (let k = 0; k < count; k++) {
        const p = r();
        recordAct(v, t, p < 0.35 ? 1 : p < 0.55 ? 2 : p < 0.8 ? 4 : p < 0.9 ? 5 : 3);
        t += 6 + r() * 10;
      }
      closeVisit(v, stay || 120 + r() * 120);
      out.push(v);
    }
    return out;
  }

  // ---------- 早市的钟 ----------
  // tau 秒 → 「7:40」这样的早市时刻；收市后钉在 11:00
  function clockAt(tau) {
    const k = Math.max(0, Math.min(1, tau / CLOSE));
    const mins = Math.round(k * (CLOSE_HOUR - OPEN_HOUR) * 60);
    const h = OPEN_HOUR + Math.floor(mins / 60), m = mins % 60;
    return `${h}:${m < 10 ? '0' : ''}${m}`;
  }
  // 0 早市 / 1 快收市（最后一刻钟，光变白、伙计开始收碟）/ 2 收市
  function phaseAt(tau) { return tau >= CLOSE ? 2 : tau >= CLOSE - 45 ? 1 : 0; }

  // ---------- 点心车 ----------
  // 一个早市的点心车日程：种子决定。第一趟约 12 秒后到，之后每 30–42 秒一趟，收市前 40 秒不再来。
  // 每趟 3 样不重复，每样 1–3 件；别人也会夹，件数是真的会少。
  function cartPlan(seed) {
    const r = rng(seed * 31337 + 7);
    const carts = [];
    let t = 10 + r() * 5;
    let n = 0;
    while (t < CLOSE - 40) {
      const pool = DIMSUM.slice();
      const items = [];
      for (let i = 0; i < 3; i++) { const k = Math.floor(r() * pool.length); items.push({ kind: pool.splice(k, 1)[0].key, stock: 1 + Math.floor(r() * 3) }); }
      carts.push({ index: n++, at: Math.round(t * 10) / 10, stay: 9, items });
      t += 30 + r() * 12;
    }
    return carts;
  }
  function takeFromCart(cart, kind) {
    const it = cart.items.find((x) => x.kind === kind);
    if (!it || it.stock <= 0) return false;
    it.stock--; return true;
  }
  // 灰影遇到第 c 趟车：夹不夹、几秒后伸筷子。约六成会夹，车到后 1.5–6 秒之间。
  function residentCartMove(seed, cartIndex, residentIndex) {
    const r = rng(seed * 4099 + cartIndex * 613 + residentIndex * 97 + 3);
    const takes = r() < 0.6;
    return { takes, delay: Math.round((1.5 + r() * 4.5) * 10) / 10, pick: Math.floor(r() * 3) };
  }
  function dimsumName(key) { const d = DIMSUM.find((x) => x.key === key); return d ? d.zh : key; }

  // ---------- 茶单 ----------
  // tally = { table, companions, seconds, pours, lids, knocksGiven, knocksGot, pages, pieces: {key: n}, closedOut, leftAt }
  function billLines(tally) {
    const sec = Math.max(0, Math.round(tally.seconds || 0));
    const dur = sec < 60 ? `${sec} 秒` : `${Math.floor(sec / 60)} 分 ${sec % 60 < 10 ? '0' : ''}${sec % 60} 秒`;
    const pieces = Object.entries(tally.pieces || {}).filter(([, n]) => n > 0);
    const total = pieces.reduce((a, [, n]) => a + n, 0);
    const lines = [
      tally.companions > 0 ? `第 ${tally.table} 桌 · 搭了 ${tally.companions} 位` : `第 ${tally.table} 桌 · 没人搭台，两位常客陪坐`,
      `${tally.leftAt || clockAt(0)} 离席 · 坐了 ${dur}${tally.closedOut ? ' · 坐到收市' : ''}`,
      `一盅：斟了 ${tally.pours || 0} 巡 · 揭盖 ${tally.lids || 0} 次`,
      total ? `${total} 件：` + pieces.map(([k, n]) => `${dimsumName(k)} ×${n}`).join('、') : '一件未夹',
      `礼数：谢了 ${tally.knocksGiven || 0} 次 · 被谢 ${tally.knocksGot || 0} 次`,
      `报纸翻了 ${tally.pages || 0} 版`,
    ];
    return lines;
  }

  return {
    CAP, MAX_VISITS, MIN_GHOST_STAY, MAX_DUR, CLOSE, OPEN_HOUR, CLOSE_HOUR, DIMSUM, ACTS, PLAYER_ACTS,
    rng, createHall, seat, leave, tableOf, summary, tableList,
    newVisit, recordAct, closeVisit, isVisit, encodeVisits, decodeVisits, pushVisit,
    planGhosts, residentsFor, residentSchedule, dueActs, syntheticVisits,
    clockAt, phaseAt, cartPlan, takeFromCart, residentCartMove, dimsumName, billLines,
  };
});
