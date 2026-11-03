// 记忆褪色 · 核心模型。浏览器与 Node 测试共用：衰减公式、豁免规则、层级判定、弹簧积分。
// 没有画面、不碰 DOM——那些都在 game.js。
// 公式照 RecallNest（github.com/AliceLJY/recallnest）的 src/decay-engine.ts 与 src/access-tracker.ts 逐行搬来，
// 参数取它的默认值；tests/core.test.cjs 里有一张用 RecallNest 原代码算出来的对照表。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FADE = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 三层记忆：形状参数 beta（<1 起步慢、>1 起步快）和地板 floor（分数倍率最低掉到这里）
  const TIERS = {
    peripheral: { beta: 1.3, floor: 0.45, zh: '边缘层' },
    working:    { beta: 1.0, floor: 0.65, zh: '工作层' },
    core:       { beta: 0.8, floor: 0.85, zh: '核心层' },
  };
  const BASE_HALF_LIFE = 60;        // retriever 默认 timeDecayHalfLifeDays
  const REINFORCE = 0.5;            // access-tracker reinforcementFactor
  const MAX_MULT = 3;               // 半衰期最多拉长到 3 倍
  const ACCESS_FRESH_HALF = 30;     // 召回次数本身也会「过期」，按 30 天衰减
  const RECENT_DAYS = 7;            // 7 天内被召回过：整条豁免
  const DAYS = 365;                 // 页面上的时间轴长度

  // Weibull 拉伸指数衰减：floor + (1 - floor) * exp(-λ t^β)，λ = ln2 / halfLife^β
  function weibull(ageDays, halfLife, tier) {
    if (halfLife <= 0 || ageDays <= 0) return 1;
    const { beta, floor } = TIERS[tier];
    const lambda = Math.LN2 / Math.pow(halfLife, beta);
    return floor + (1 - floor) * Math.exp(-lambda * Math.pow(ageDays, beta));
  }

  // 用进废退：被想起得越多、越近，半衰期越长，封顶 3 倍
  function effectiveHalfLife(base, accessCount, daysSinceAccess) {
    if (accessCount <= 0) return base;
    const fresh = Math.exp(-daysSinceAccess / ACCESS_FRESH_HALF);
    const ext = base * REINFORCE * Math.log1p(accessCount * fresh);
    return Math.min(base + ext, base * MAX_MULT);
  }

  // 没写明层级时 RecallNest 的判定：重要性或被召回次数够了就升层
  function tierOf(importance, accessCount) {
    if (importance >= 0.95 || accessCount >= 10) return 'core';
    if (importance >= 0.8 || accessCount >= 3) return 'working';
    return 'peripheral';
  }

  const RANK = { peripheral: 0, working: 1, core: 2 };

  // 页面推演每天最多新增一次；库里当天已经被想起的也算在内。
  const canRecall = (mem, day) => !mem.recalls.includes(day) && !(mem.history && mem.history.last === day);

  // 第 day 天这条记忆的检索分倍率，以及是哪条规则在起作用（页面上那句解释就读 why）
  // mem = { importance, pinned, recalls: [召回发生在第几天, ...] }，记忆写入于第 0 天。
  // 真实记忆另带：category；history = { count, last }（库里只存了次数和最后一次，不知道每次是哪天）；
  // tier（库里已经写明的层级，RecallNest 写明了就用写明的，这里取它和启发式里高的那个）。
  function stateAt(mem, day) {
    const past = mem.recalls.filter((d) => d <= day);
    const h = mem.history;
    const count = past.length + (h ? h.count : 0);
    const lasts = past.slice();
    if (h && h.last !== null && h.last <= day) lasts.push(h.last);
    const last = lasts.length ? Math.max(...lasts) : null;
    let tier = tierOf(mem.importance, count);
    if (mem.tier && RANK[mem.tier] > RANK[tier]) tier = mem.tier;
    const base = { day, tier, count, floor: TIERS[tier].floor, halfLife: BASE_HALF_LIFE };
    if (mem.category === 'patterns') return { ...base, factor: 1, why: 'procedural' };
    if (mem.pinned) return { ...base, factor: 1, why: 'pinned' };
    if (tier === 'core' && mem.importance >= 0.95) return { ...base, factor: 1, why: 'core' };
    if (last !== null && day - last < RECENT_DAYS) return { ...base, factor: 1, why: 'recent', since: day - last };
    const hl = effectiveHalfLife(BASE_HALF_LIFE, count, last === null ? 0 : day - last);
    return { ...base, halfLife: hl, factor: weibull(day, hl, tier), why: count ? 'reinforced' : 'decay', since: last === null ? null : day - last };
  }

  function curve(mem, step = 1) {
    const out = [];
    for (let d = 0; d <= DAYS; d += step) out.push(stateAt(mem, d).factor);
    return out;
  }

  // 弹簧：质量 1，x'' = -k(x - target) - c v。固定步长半隐式欧拉，和帧率无关
  function spring(stiffness, damping) { return { k: stiffness, c: damping, x: 0, v: 0, target: 0 }; }
  function springStep(s, dt) {
    const h = 1 / 240;
    let left = Math.min(dt, 0.1);
    while (left > 1e-9) {
      const step = Math.min(h, left);
      s.v += (-s.k * (s.x - s.target) - s.c * s.v) * step;
      s.x += s.v * step;
      left -= step;
    }
    return s;
  }
  // 阻尼比：<1 会回弹过头再落定，=1 刚好不过冲
  const dampingRatio = (s) => s.c / (2 * Math.sqrt(s.k));

  return {
    TIERS, BASE_HALF_LIFE, REINFORCE, MAX_MULT, ACCESS_FRESH_HALF, RECENT_DAYS, DAYS,
    weibull, effectiveHalfLife, tierOf, canRecall, stateAt, curve, spring, springStep, dampingRatio,
  };
});
