// 三次想起：独立的、无 DOM 的实验状态；衰减计算只调用原 core.js。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else root.FADE_EXPERIMENT = factory(root.FADE);
})(typeof self !== 'undefined' ? self : this, function (F) {
  'use strict';
  const END = 180, BUDGET = 3;
  const eligible = (m) => !m.pinned && Number.isInteger(m.age) && m.age >= 0 && F.stateAt(m, m.age).factor < 1;
  const copy = (m) => ({ ...m, recalls: [...m.recalls], history: m.history ? { ...m.history } : null });

  function choose(library) {
    const candidates = library.filter(eligible);
    return candidates.find((m) => !m.history && F.stateAt(m, m.age).tier === 'peripheral') || candidates[0] || null;
  }

  function create(memory) {
    if (!memory || !eligible(memory)) return null;
    return { memory: copy(memory), days: [], day: 0, phase: 'plan', message: '把三枚标记放在三个不同的日子。' };
  }

  // 原生 range 的 input、按钮的 click（触屏 / Enter / Space）均发同一种意图。
  function act(state, intent) {
    if (!state || intent.type === 'exit') return null;
    if (intent.type === 'retry') return create(state.memory);
    if (state.phase !== 'plan') return state;
    const message = (text) => ({ ...state, message: text });
    switch (intent.type) {
      case 'day':
        if (!Number.isInteger(intent.day) || intent.day < 0 || intent.day >= END) return message('请选择第 0–179 天。');
        return { ...state, day: intent.day, message: `选中第 ${intent.day} 天，按「放一枚」安排想起。` };
      case 'add': {
        if (state.days.length >= BUDGET) return message('三枚已用完，可以揭晓或撤回后重排。');
        const absoluteDay = state.memory.age + state.day;
        if (state.days.includes(state.day) || !F.canRecall(state.memory, absoluteDay)) return message('这一天已被想起过；换一天，不消耗标记。');
        const days = [...state.days, state.day].sort((a, b) => a - b);
        return { ...state, days, message: days.length === BUDGET ? '三次已安排，看看第 180 天吧。' : `已安排第 ${state.day} 天，还剩 ${BUDGET - days.length} 枚。` };
      }
      case 'remove':
        if (!state.days.includes(intent.day)) return state;
        return { ...state, days: state.days.filter((d) => d !== intent.day), message: '已撤回一枚，可以重新选日。' };
      case 'reveal':
        return state.days.length === BUDGET ? { ...state, phase: 'result', message: '' } : message('先把三枚标记安排完，再看半年后。');
      default: return state;
    }
  }

  function compare(state) {
    if (!state || state.phase !== 'result') return null;
    const baseline = copy(state.memory), planned = copy(state.memory);
    planned.recalls.push(...state.days.map((d) => state.memory.age + d));
    const at = (m, d) => F.stateAt(m, m.age + d);
    const yours = at(planned, END), plain = at(baseline, END);
    return {
      yours, plain, success: yours.factor === 1,
      lastDay: state.days[BUDGET - 1], gap: END - state.days[BUDGET - 1],
      curves: Array.from({ length: END + 1 }, (_, day) => ({ day, yours: at(planned, day).factor, plain: at(baseline, day).factor })),
    };
  }

  return { END, BUDGET, eligible, choose, create, act, compare };
});
