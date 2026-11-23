// 花城收租佬 · 规则核心。所有判定（掷骰、扣钱、产权、破产、结算）都在这里，带种子随机数。
// 浏览器里挂到 self.GZRich，Node 里 module.exports；没有任何 DOM 依赖。
(function (root) {
  'use strict';

  const START_CASH = 800;
  const GO_SALARY = 100;
  const JAIL_FEE = 50;
  const MAX_LEVEL = 3;
  const RENT_MULT = [0.6, 2.2, 4.5, 7];
  const DEFAULT_ROUNDS = 15;
  const JAIL = 6;

  const AREAS = {
    xiguan: { name: '西关', color: '#c27b3c' },
    laocheng: { name: '老城', color: '#d77a8a' },
    yanglou: { name: '洋楼', color: '#4f8f86' },
    tianhe: { name: '天河', color: '#5b7fb0' },
    jiaowai: { name: '郊外', color: '#6f9a4c' },
  };

  // 24 格，0 号是出发角，逆时针走。
  const P = (name, area, price) => ({ kind: 'prop', name, area, price });
  const BOARD = [
    { kind: 'go', name: '花城广场', sub: '出发 · 经过领 100' },
    P('上下九', 'xiguan', 60),
    { kind: 'chance', name: '机会' },
    P('恩宁路', 'xiguan', 60),
    { kind: 'tax', name: '物业费', amount: 80 },
    P('北京路', 'laocheng', 100),
    { kind: 'jail', name: '内环塞车', sub: '路过看看' },
    P('一德路', 'laocheng', 100),
    { kind: 'bonus', name: '收利是', amount: 80 },
    P('海珠桥', 'laocheng', 120),
    P('沙面', 'yanglou', 140),
    { kind: 'chance', name: '机会' },
    { kind: 'rest', name: '饮早茶', sub: '歇一歇' },
    P('东山口', 'yanglou', 140),
    P('二沙岛', 'yanglou', 160),
    { kind: 'chance', name: '机会' },
    P('天河路', 'tianhe', 180),
    P('珠江新城', 'tianhe', 200),
    { kind: 'gotojail', name: '坐错地铁', sub: '去塞车' },
    P('广州塔', 'tianhe', 220),
    { kind: 'chance', name: '机会' },
    P('白云山', 'jiaowai', 260),
    { kind: 'tax', name: '珠江夜游', amount: 60 },
    P('长隆', 'jiaowai', 280),
  ];

  // 机会卡：原创广州文案。
  const CARDS = [
    { text: '早茶抢到靠窗靓位，心情好，收 50', cash: 50 },
    { text: '三号线挤到变形，迟到只好打车，付 40', cash: -40 },
    { text: '回南天衣服晾不干，买部抽湿机，付 80', cash: -80 },
    { text: '年廿八行花街，摆档卖桃花，收 120', cash: 120 },
    { text: '街坊抽奖抽中电饭煲，转手卖了，收 100', cash: 100 },
    { text: '约朋友去长隆玩一日', moveTo: 23 },
    { text: '行花街一路行到北京路', moveTo: 5 },
    { text: '听讲珠江新城开新楼盘，去睇下', moveTo: 17 },
    { text: '单车乱停被抄牌，去内环那边处理', jail: true },
    { text: '做东请大家饮早茶，每人付 30', payEach: 30 },
    { text: '生日，大家给你封利是，每人收 20', collectEach: 20 },
    { text: '抽到一张羊城通月票：下次塞车直接走', card: true },
    { text: '房子回南天发霉要翻新，每层楼付 40', perLevel: 40 },
    { text: '导航带错路，倒退 3 格', back: 3 },
  ];

  // mulberry32：状态是一个 32 位整数，存在 game 里，便于复现。
  function rngNext(g) {
    let t = (g.rng = (g.rng + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const rngInt = (g, n) => Math.floor(rngNext(g) * n);

  function shuffleDeck(g) {
    const d = CARDS.map((_, i) => i);
    for (let i = d.length - 1; i > 0; i--) {
      const j = rngInt(g, i + 1);
      [d[i], d[j]] = [d[j], d[i]];
    }
    g.deck = d;
  }

  const rentFor = (g, sq) => {
    const s = BOARD[sq];
    const lv = g.level[sq];
    let r = Math.round(s.price * RENT_MULT[lv]);
    if (lv === 0 && ownsArea(g, g.owner[sq], s.area)) r *= 2;
    return r;
  };
  const ownsArea = (g, who, area) => who != null && BOARD.every((s, i) => s.kind !== 'prop' || s.area !== area || g.owner[i] === who);
  const buildCost = (sq) => BOARD[sq].price / 2;

  function netWorth(g, i) {
    const p = g.players[i];
    if (!p.alive) return 0;
    let w = p.cash;
    BOARD.forEach((s, k) => { if (g.owner[k] === i) w += s.price + g.level[k] * buildCost(k); });
    return w;
  }

  function create(opts = {}) {
    const seats = opts.seats || [{ name: '你' }, { name: '阿发' }, { name: '阿珍' }, { name: '阿强' }];
    const g = {
      seed: (opts.seed >>> 0) || 1,
      rng: (opts.seed >>> 0) || 1,
      maxRounds: opts.maxRounds || DEFAULT_ROUNDS,
      humanSeat: opts.humanSeat == null ? 0 : opts.humanSeat,
      players: seats.map((s) => ({ name: s.name, cash: START_CASH, pos: 0, alive: true, stuck: false, card: false })),
      owner: BOARD.map(() => null),
      level: BOARD.map(() => 0),
      round: 1,
      turn: 0,
      phase: 'roll',
      pending: null,
      dice: null,
      log: [],
      events: [],
      stats: { rentPaid: 0, builds: 0, bankrupt: 0, buys: 0, turns: 0 },
      result: null,
    };
    shuffleDeck(g);
    startTurn(g);
    return g;
  }

  function say(g, text, extra) {
    const e = Object.assign({ round: g.round, who: g.turn, text }, extra || {});
    g.log.push(e);
    g.events.push(e);
  }

  // 付钱：不够就先卖楼、再卖地；还不够就破产。返回实际付出的钱。
  function pay(g, i, amount, to) {
    const p = g.players[i];
    if (p.cash < amount) raise(g, i, amount);
    let paid = amount;
    if (p.cash < amount) {
      paid = Math.max(0, p.cash);
      p.cash -= amount;
      bankrupt(g, i, to);
    } else {
      p.cash -= amount;
    }
    if (to != null && g.players[to].alive) g.players[to].cash += paid;
    return paid;
  }

  function raise(g, i, need) {
    const p = g.players[i];
    // 先卖楼：从造价最高的地开始，一层一层卖，按造价一半。
    while (p.cash < need) {
      let best = -1;
      BOARD.forEach((s, k) => { if (g.owner[k] === i && g.level[k] > 0 && (best < 0 || s.price > BOARD[best].price)) best = k; });
      if (best < 0) break;
      g.level[best]--;
      p.cash += buildCost(best) / 2;
      say(g, `${p.name} 卖掉${BOARD[best].name}一层楼，回 ${buildCost(best) / 2}`, { t: 'sell' });
    }
    // 再卖地：从最便宜的开始，按标价一半。
    while (p.cash < need) {
      let best = -1;
      BOARD.forEach((s, k) => { if (g.owner[k] === i && (best < 0 || s.price < BOARD[best].price)) best = k; });
      if (best < 0) break;
      g.owner[best] = null;
      p.cash += BOARD[best].price / 2;
      say(g, `${p.name} 卖掉${BOARD[best].name}，回 ${BOARD[best].price / 2}`, { t: 'sell' });
    }
  }

  function bankrupt(g, i, to) {
    const p = g.players[i];
    p.alive = false;
    p.cash = 0;
    BOARD.forEach((_, k) => { if (g.owner[k] === i) { g.owner[k] = null; g.level[k] = 0; } });
    g.stats.bankrupt++;
    say(g, `${p.name} 交不起，破产出局`, { t: 'bankrupt', to });
  }

  const alive = (g) => g.players.map((p, i) => (p.alive ? i : -1)).filter((i) => i >= 0);

  function startTurn(g) {
    g.dice = null;
    const p = g.players[g.turn];
    if (p.stuck) {
      if (p.card) {
        p.card = false;
        p.stuck = false;
        say(g, `${p.name} 拿出羊城通月票，直接走`, { t: 'card' });
      } else {
        g.phase = 'decide';
        g.pending = { type: 'jail', options: p.cash >= JAIL_FEE ? ['pay', 'wait'] : ['wait'], square: JAIL };
        return;
      }
    }
    readyToRoll(g);
  }

  // 掷骰前的决定：两颗走得远，一颗走得近，能挑想去或想躲的格子。
  const DICE = { type: 'dice', options: ['two', 'one'] };
  function readyToRoll(g) {
    g.phase = 'roll';
    g.pending = { type: DICE.type, options: DICE.options.slice(), square: g.players[g.turn].pos };
  }

  function moveTo(g, i, target, passGo) {
    const p = g.players[i];
    if (passGo && target < p.pos) {
      p.cash += GO_SALARY;
      say(g, `${p.name} 经过花城广场，领 ${GO_SALARY}`, { t: 'salary' });
    }
    p.pos = target;
  }

  function sendToJail(g, i) {
    const p = g.players[i];
    p.pos = JAIL;
    p.stuck = true;
    say(g, `${p.name} 被困在内环塞车`, { t: 'jail' });
  }

  // 落地结算。可能产生一个待决定的选项（买 / 加盖），返回 true 表示需要决定。
  function land(g, depth) {
    const i = g.turn;
    const p = g.players[i];
    const sq = p.pos;
    const s = BOARD[sq];
    say(g, `${p.name} 走到 ${s.name}`, { t: 'land', square: sq });
    if (s.kind === 'prop') {
      const o = g.owner[sq];
      if (o == null) {
        if (p.cash >= s.price) {
          g.pending = { type: 'buy', options: ['buy', 'skip'], square: sq, cost: s.price };
          return true;
        }
        say(g, `${p.name} 钱不够买 ${s.name}`, { t: 'info' });
      } else if (o === i) {
        if (g.level[sq] < MAX_LEVEL && p.cash >= buildCost(sq)) {
          g.pending = { type: 'build', options: ['build', 'skip'], square: sq, cost: buildCost(sq) };
          return true;
        }
      } else if (g.players[o].alive) {
        const r = rentFor(g, sq);
        const paid = pay(g, i, r, o);
        g.stats.rentPaid += paid;
        say(g, `${p.name} 交租 ${paid} 给 ${g.players[o].name}`, { t: 'rent', amount: paid, to: o });
      }
    } else if (s.kind === 'tax') {
      pay(g, i, s.amount, null);
      say(g, `${p.name} 付${s.name} ${s.amount}`, { t: 'tax' });
    } else if (s.kind === 'bonus') {
      p.cash += s.amount;
      say(g, `${p.name} 收到利是 ${s.amount}`, { t: 'bonus' });
    } else if (s.kind === 'gotojail') {
      sendToJail(g, i);
    } else if (s.kind === 'chance') {
      return drawCard(g, depth);
    }
    return false;
  }

  function drawCard(g, depth) {
    const i = g.turn;
    const p = g.players[i];
    if (!g.deck.length) shuffleDeck(g);
    const c = CARDS[g.deck.shift()];
    say(g, `机会：${c.text}`, { t: 'chance' });
    if (c.cash > 0) p.cash += c.cash;
    else if (c.cash < 0) pay(g, i, -c.cash, null);
    else if (c.jail) sendToJail(g, i);
    else if (c.card) p.card = true;
    else if (c.payEach) alive(g).forEach((j) => { if (j !== i && p.alive) pay(g, i, c.payEach, j); });
    else if (c.collectEach) alive(g).forEach((j) => { if (j !== i) pay(g, j, c.collectEach, i); });
    else if (c.perLevel) {
      const n = g.level.reduce((a, lv, k) => a + (g.owner[k] === i ? lv : 0), 0);
      if (n > 0) pay(g, i, n * c.perLevel, null);
    } else if (c.moveTo != null) {
      moveTo(g, i, c.moveTo, true);
      if (depth < 2) return land(g, depth + 1);
    } else if (c.back) {
      p.pos = (p.pos - c.back + BOARD.length) % BOARD.length;
      if (depth < 2) return land(g, depth + 1);
    }
    return false;
  }

  function roll(g, n) {
    if (g.phase !== 'roll') throw new Error('现在不是掷骰的时候');
    const count = n === 1 ? 1 : 2;
    g.events = [];
    g.pending = null;
    const i = g.turn;
    const p = g.players[i];
    const dice = [rngInt(g, 6) + 1];
    if (count === 2) dice.push(rngInt(g, 6) + 1);
    g.dice = dice;
    const from = p.pos;
    const steps = dice.reduce((a, b) => a + b, 0);
    const target = (p.pos + steps) % BOARD.length;
    say(g, count === 2 ? `${p.name} 掷两颗：${dice[0]}+${dice[1]}` : `${p.name} 掷一颗：${dice[0]}`, { t: 'roll', dice: dice.slice(), from, to: target });
    moveTo(g, i, target, true);
    const needs = p.alive && land(g, 0);
    if (needs && p.alive) { g.phase = 'decide'; return g; }
    return endTurn(g);
  }

  const legal = (g) => (g.phase !== 'over' && g.pending ? g.pending.options.slice() : []);

  function decide(g, choice) {
    if (g.phase === 'over' || !g.pending) throw new Error('现在没有要决定的事');
    if (!g.pending.options.includes(choice)) throw new Error(`不合法的选择：${choice}`);
    if (g.pending.type === 'dice') return roll(g, choice === 'one' ? 1 : 2);
    g.events = [];
    const i = g.turn;
    const p = g.players[i];
    const pd = g.pending;
    const s = BOARD[pd.square];
    g.pending = null;
    if (pd.type === 'buy') {
      if (choice === 'buy') {
        p.cash -= s.price;
        g.owner[pd.square] = i;
        g.stats.buys++;
        say(g, `${p.name} 买下 ${s.name}，花 ${s.price}`, { t: 'buy', square: pd.square });
      } else say(g, `${p.name} 不买 ${s.name}`, { t: 'skip' });
      return endTurn(g);
    }
    if (pd.type === 'build') {
      if (choice === 'build') {
        p.cash -= buildCost(pd.square);
        g.level[pd.square]++;
        g.stats.builds++;
        say(g, `${p.name} 在${s.name}加盖到 ${g.level[pd.square]} 层`, { t: 'build', square: pd.square });
      } else say(g, `${p.name} 先不盖`, { t: 'skip' });
      return endTurn(g);
    }
    if (pd.type === 'jail') {
      p.stuck = false;
      if (choice === 'pay') {
        pay(g, i, JAIL_FEE, null);
        say(g, `${p.name} 付 ${JAIL_FEE} 打车走`, { t: 'jailpay' });
        readyToRoll(g);
        return g;
      }
      say(g, `${p.name} 在塞车里等一轮`, { t: 'jailwait' });
      return endTurn(g);
    }
    throw new Error('未知的决定');
  }

  function finish(g, reason) {
    g.phase = 'over';
    g.pending = null;
    const order = g.players.map((_, i) => i).sort((a, b) => {
      const pa = g.players[a], pb = g.players[b];
      if (pa.alive !== pb.alive) return pa.alive ? -1 : 1;
      return netWorth(g, b) - netWorth(g, a) || a - b;
    });
    g.result = { reason, ranking: order.map((i) => ({ seat: i, name: g.players[i].name, worth: netWorth(g, i), alive: g.players[i].alive })) };
    say(g, reason === 'rounds' ? `${g.maxRounds} 轮到了，按身家排名` : reason === 'human' ? '你出局了，这局结束' : '只剩一个人，这局结束', { t: 'over' });
    return g;
  }

  function endTurn(g) {
    g.stats.turns++;
    const live = alive(g);
    if (live.length <= 1) return finish(g, 'last');
    if (g.humanSeat != null && g.humanSeat >= 0 && !g.players[g.humanSeat].alive) return finish(g, 'human');
    let n = g.turn;
    do {
      n = (n + 1) % g.players.length;
      if (n === 0) g.round++;
    } while (!g.players[n].alive);
    if (g.round > g.maxRounds) { g.round = g.maxRounds; return finish(g, 'rounds'); }
    g.turn = n;
    startTurn(g);
    return g;
  }

  // 规则机器人：稳健地买，留够余钱才盖。tune 让不同座位性格略有不同。
  function botChoice(g, i, tune) {
    const t = Object.assign({ reserve: 200, buildReserve: 350, jailPayAbove: 300 }, tune || {});
    const pd = g.pending;
    const p = g.players[i];
    if (!pd) return null;
    if (pd.type === 'dice') return diceChoice(g, i);
    if (pd.type === 'buy') return p.cash - pd.cost >= t.reserve ? 'buy' : 'skip';
    if (pd.type === 'build') return p.cash - pd.cost >= t.buildReserve ? 'build' : 'skip';
    if (pd.type === 'jail') return pd.options.includes('pay') && p.cash >= t.jailPayAbove ? 'pay' : 'wait';
    return pd.options[0];
  }
  // 掷几颗：按落点的期望得失挑。得失只粗算（交租、交钱为负，能买能盖、收钱为正）。
  function squareValue(g, i, sq) {
    const s = BOARD[sq];
    const p = g.players[i];
    if (s.kind === 'prop') {
      const o = g.owner[sq];
      if (o == null) return p.cash >= s.price ? s.price * 0.25 : 0;
      if (o === i) return g.level[sq] < MAX_LEVEL && p.cash >= buildCost(sq) ? s.price * 0.2 : 0;
      return g.players[o].alive ? -rentFor(g, sq) : 0;
    }
    if (s.kind === 'tax') return -s.amount;
    if (s.kind === 'bonus') return s.amount;
    if (s.kind === 'gotojail') return -60;
    return 0;
  }
  function expectedValue(g, i, count) {
    const pos = g.players[i].pos;
    let ev = 0;
    for (let a = 1; a <= 6; a++) {
      if (count === 1) { ev += squareValue(g, i, (pos + a) % BOARD.length) / 6; continue; }
      for (let b = 1; b <= 6; b++) ev += squareValue(g, i, (pos + a + b) % BOARD.length) / 36;
    }
    return ev;
  }
  const diceChoice = (g, i) => (expectedValue(g, i, 1) > expectedValue(g, i, 2) + 1 ? 'one' : 'two');

  const BOT_TUNES = [
    { reserve: 200, buildReserve: 350, jailPayAbove: 300 },
    { reserve: 120, buildReserve: 250, jailPayAbove: 200 },
    { reserve: 320, buildReserve: 500, jailPayAbove: 450 },
    { reserve: 180, buildReserve: 300, jailPayAbove: 260 },
  ];

  // 无头跑一整局：chooser(g, i) 返回选择；没给就全用规则机器人。
  function simulate(opts, chooser, maxSteps = 5000) {
    const g = create(opts);
    let steps = 0;
    while (g.phase !== 'over' && steps++ < maxSteps) {
      decide(g, chooser ? chooser(g, g.turn) : botChoice(g, g.turn, BOT_TUNES[g.turn % 4]));
    }
    return g;
  }

  // 给界面和测试的只读快照（不含任何座位配置，自然也不含 key）。
  function snapshot(g) {
    return {
      round: g.round, maxRounds: g.maxRounds, turn: g.turn, phase: g.phase,
      pending: g.pending && Object.assign({}, g.pending, { options: g.pending.options.slice() }),
      dice: g.dice && g.dice.slice(),
      players: g.players.map((p, i) => Object.assign({}, p, { worth: netWorth(g, i) })),
      owner: g.owner.slice(), level: g.level.slice(),
      result: g.result, stats: Object.assign({}, g.stats), logSize: g.log.length,
    };
  }

  const M = {
    BOARD, AREAS, CARDS, START_CASH, GO_SALARY, JAIL_FEE, MAX_LEVEL, RENT_MULT, DEFAULT_ROUNDS, JAIL, BOT_TUNES,
    create, roll, decide, legal, botChoice, expectedValue, simulate, snapshot, netWorth, rentFor, buildCost, ownsArea, rngNext,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
  else root.GZRich = M;
})(typeof self !== 'undefined' ? self : this);
