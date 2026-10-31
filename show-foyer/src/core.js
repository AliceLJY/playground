// 候场厅 · 核心规则。浏览器与 Node 测试共用：分厅与落座、来访记录与回放、灰色身影补位、整点锣、带种子随机。
// 没有画面、没有声音、不碰 DOM 和 localStorage——那些都在 game.js。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FOYER = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const COLS = 4, ROWS = 3;          // 一个小厅 4 列 3 排 12 座
  const CAP = COLS * ROWS;
  const MAX_VISITS = 12;             // 本机最多记最近 12 次来访
  const MIN_GHOST_STAY = 60;         // 回放的「你」至少坐这么多秒，免得一进厅它就走了
  const MAX_DUR = 2700;              // 一次来访最长记 45 分钟（候场厅开 30 分钟，留余量）
  const OPEN_MINUTES = 30;           // 开演前多少分钟开厅
  const RESIDENTS = 3;               // 厅里「别人」不足 3 个就补灰色身影到 3 个

  // 动作码。0–4 是观众能按的五个；5、6 只给厅里的别人用（抬头看台、挪一挪），没有按钮
  const ACTS = [
    { code: 0, key: 'sit',   zh: '落座' },
    { code: 1, key: 'lamp',  zh: '点灯' },
    { code: 2, key: 'clap',  zh: '鼓掌' },
    { code: 3, key: 'tea',   zh: '递茶' },
    { code: 4, key: 'leave', zh: '离席' },
    { code: 5, key: 'look',  zh: '看台' },
    { code: 6, key: 'shift', zh: '挪一挪' },
  ];
  const PLAYER_ACTS = ACTS.slice(0, 5);

  // ---------- 带种子随机（测试与固定机位可复现） ----------
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  // ---------- 座位顺序：先坐第二排正中，再向两侧和前后扩 ----------
  // 返回座位下标数组（下标 = 排 * COLS + 列）。同距离先取靠前的排，再取靠左的列。
  function seatOrder(cols, rows) {
    cols = cols || COLS; rows = rows || ROWS;
    const cx = (cols - 1) / 2, cy = Math.min(1, rows - 1);
    const all = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) all.push({ i: r * cols + c, d: Math.abs(c - cx) + Math.abs(r - cy), r, c });
    all.sort((a, b) => a.d - b.d || a.r - b.r || a.c - b.c);
    return all.map((s) => s.i);
  }
  const ORDER = seatOrder(COLS, ROWS);

  // 两个座位是否相邻（含斜对角），用来找「邻座」递茶
  function adjacent(i, j, cols) {
    cols = cols || COLS;
    if (i === j) return false;
    const ri = Math.floor(i / cols), ci = i % cols, rj = Math.floor(j / cols), cj = j % cols;
    return Math.abs(ri - rj) <= 1 && Math.abs(ci - cj) <= 1;
  }

  // ---------- 分厅 ----------
  // house = { cap, halls: Map<厅号, Map<来客 id, 座位下标>> }
  function createHouse(cap) { return { cap: cap || CAP, halls: new Map() }; }

  function hallOf(house, id) {
    for (const [no, guests] of house.halls) if (guests.has(id)) return no;
    return null;
  }

  // 规则：进「最满的未满厅」；平手取最小厅号；都满（或没有厅）就开最小未用号的新厅。座位按 ORDER 取第一个空位。
  function seat(house, id) {
    if (hallOf(house, id) !== null) throw new Error(`${id} 已经坐在第 ${hallOf(house, id)} 厅`);
    let best = null;
    for (const [no, guests] of house.halls) {
      if (guests.size >= house.cap) continue;
      if (!best || guests.size > best.size || (guests.size === best.size && no < best.no)) best = { no, size: guests.size };
    }
    if (!best) {
      let no = 1;
      while (house.halls.has(no)) no++;
      house.halls.set(no, new Map());
      best = { no, size: 0 };
    }
    const guests = house.halls.get(best.no);
    const taken = new Set(guests.values());
    const order = house.cap === CAP ? ORDER : seatOrder(house.cap, 1);
    let seatNo = order.find((s) => !taken.has(s));
    if (seatNo === undefined) { seatNo = 0; while (taken.has(seatNo)) seatNo++; }
    guests.set(id, seatNo);
    return { hall: best.no, seat: seatNo };
  }

  // 规则：最后一位离席，这个厅就撤掉。
  function leave(house, id) {
    for (const [no, guests] of house.halls) {
      if (guests.delete(id)) {
        if (guests.size === 0) house.halls.delete(no);
        return no;
      }
    }
    return null;
  }

  function summary(house) {
    let guests = 0;
    for (const g of house.halls.values()) guests += g.size;
    return { halls: house.halls.size, guests };
  }

  function hallList(house) {
    return [...house.halls.entries()].sort((a, b) => a[0] - b[0]).map(([no, g]) => ({ no, count: g.size, cap: house.cap }));
  }

  // ---------- 来访记录 ----------
  // 一次来访：{ v:1, at:进厅时刻(ms), dur:在座秒数, acts:[[相对秒, 动作码], ...] }。没有名字、没有文字、没有设备信息。
  function newVisit(at) { return { v: 1, at: at, dur: 0, acts: [] }; }

  function recordAct(visit, t, code) {
    if (!(t >= 0) || !Number.isInteger(code) || code < 0 || code > 4) return false;
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
      if (a[0] < last || a[1] < 0 || a[1] > 4) return false;
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

  // ---------- 把历史来访排成今天厅里的幽灵 ----------
  // 幽灵按它们当年进厅的先后依次落座（走同一套分厅规则），再轮到观众本人。
  // 每个幽灵从 0 秒起在座，坐到 max(dur, MIN_GHOST_STAY) 秒离席；离席后厅空就撤。
  // claps：它当年有没有鼓过掌——有，今天整点锣响后它会跟着鼓掌。
  function planGhosts(visits, cap) {
    const house = createHouse(cap);
    const ghosts = [];
    const sorted = visits.slice().sort((a, b) => a.at - b.at);
    sorted.forEach((v, i) => {
      const id = 'g' + i;
      const pos = seat(house, id);
      ghosts.push({
        id, hall: pos.hall, seat: pos.seat, start: 0,
        end: Math.max(v.dur || 0, MIN_GHOST_STAY),
        acts: v.acts.filter((a) => a[1] !== 0 && a[1] !== 4), // 落座与离席由 start / end 表达
        claps: v.acts.some((a) => a[1] === 2),
        at: v.at,
      });
    });
    const me = seat(house, 'me');
    return { house, ghosts, me };
  }

  // 厅里「别人」少于 RESIDENTS 个就补灰色身影，补到 RESIDENTS 个；它们不算人数，不点灯、不鼓掌、不递茶。
  function residentsFor(othersInHall) { return Math.max(0, RESIDENTS - othersInHall); }

  // 灰影的日程：种子决定，每个灰影一张表，45 秒一轮，周而复始。内容只有抬头看台（5）和挪一挪（6）。
  function residentSchedule(seed, index) {
    const r = rng(seed * 7919 + index * 104729 + 29);
    const acts = [];
    let t = 3 + r() * 8;
    while (t < 45) {
      acts.push([Math.round(t * 10) / 10, r() < 0.7 ? 5 : 6]);
      t += 7 + r() * 11;
    }
    return { period: 45, acts };
  }

  // 幽灵在时刻 tau（进厅后的秒数）该做的事：返回落在 (prev, tau] 内的动作
  function dueActs(acts, prev, tau) {
    const out = [];
    for (const a of acts) if (a[0] > prev && a[0] <= tau) out.push(a);
    return out;
  }

  // ---------- 整点锣与开演倒计时 ----------
  // 下一声锣：now 之后第一个整点（毫秒时间戳，按本地时区由调用方传入 getTimezoneOffset 的毫秒数；不传按 UTC）
  function nextGong(nowMs, tzOffsetMs) {
    const off = tzOffsetMs || 0;
    const local = nowMs - off;
    const hour = 3600000;
    return Math.floor(local / hour) * hour + hour + off;
  }
  // (prev, now] 之间有没有跨过整点
  function gongCrossed(prevMs, nowMs, tzOffsetMs) {
    if (!(nowMs > prevMs)) return false;
    return nextGong(prevMs, tzOffsetMs) <= nowMs;
  }
  // 开演时刻：进厅即按「开演前 OPEN_MINUTES 分钟」倒计时
  function curtainAt(enterMs, minutes) { return enterMs + (minutes || OPEN_MINUTES) * 60000; }
  function countdown(nowMs, curtainMs) {
    const left = Math.max(0, curtainMs - nowMs);
    const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
    return { left, text: left > 0 ? String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') : '开演' };
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
        recordAct(v, t, p < 0.4 ? 1 : p < 0.75 ? 2 : 3);
        t += 6 + r() * 10;
      }
      closeVisit(v, stay || 120 + r() * 120);
      out.push(v);
    }
    return out;
  }

  return {
    COLS, ROWS, CAP, MAX_VISITS, MIN_GHOST_STAY, MAX_DUR, OPEN_MINUTES, RESIDENTS, ACTS, PLAYER_ACTS, ORDER,
    rng, seatOrder, adjacent, createHouse, seat, leave, hallOf, summary, hallList,
    newVisit, recordAct, closeVisit, isVisit, encodeVisits, decodeVisits, pushVisit,
    planGhosts, residentsFor, residentSchedule, dueActs,
    nextGong, gongCrossed, curtainAt, countdown, syntheticVisits,
  };
});
