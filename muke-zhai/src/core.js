// 穆柯寨 · 不打不相识 —— 游戏逻辑。浏览器与 Node 测试共用。
// 不碰 DOM，只有带种子的随机数和固定步长，可以在 Node 里无头跑整局。
// 画面、输入、声音都在 game.js；规格和验收条目见 README_CN.md。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MKZ = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const STEP = 1000 / 60;         // 固定步长（毫秒）
  const W = 960, H = 540;         // 逻辑画布
  const GROUND = 448;             // 脚底的地面坐标
  const MIN_X = 110, MAX_X = 850; // 舞台可站的范围
  const MIN_GAP = 84;             // 两人身体至少隔开的距离（每人身体半径约 42）
  const Z_X = 806, Z_HIDE_X = 858; // 杨宗保在右侧门边站的位置；他让到门帘里一点的位置
  const HEART1_MAX = 20;          // 第一场心动最多攒到这么多

  // 每个人物的数值。速度单位：像素 / 毫秒；时间单位：毫秒。
  const SPEC = {
    guiying: { reach: 215, speed: 0.235, wind: 38, tail: 62, hurt: 45, up: 28, down: 55 },
    zongbao: { reach: 235, speed: 0.12, wind: 55, tail: 85, hurt: 52, up: 30, down: 50, warn: 380 },
    mengliang: { reach: 165, speed: 0.115, wind: 55, tail: 62, hurt: 60, up: 0, down: 0, warn: 600 },
  };
  const HIT_FRAME_MS = 70;        // 命中帧本身停留的时间
  const PARRY_WINDOW = 200;       // 对方命中前这么久内按下 = 架开
  const CLASH_WINDOW = 150;       // 双方出枪命中时刻相差不到这么久 = 对枪
  const BUFFER_MS = 200;          // 输入缓冲
  const GUARD_MAX = 900;          // 架枪最长按住时间
  const VUL_AFTER_HIT = 130;      // 出招命中后多久进入收招硬直（可被打）
  const STAGGER_RATE = 0.7;       // 被架开后受击动作放慢，给玩家反击留出时间
  const HITSTOP_LIGHT = 70, HITSTOP_HEAVY = 110;
  const QI_MAX = 5;
  const ULT_WINDOW = 80;          // K 和 J 相隔这么久内按下算「一起按」
  const ULT_CHARGE = 400;         // 大招起手的全场放慢
  const ULT_STRIKE = 150;         // 大招连刺，每一枪的间隔
  // 出枪的种类：rate 是出招动画的快慢，slide 是吸附滑步上限，knock 击退，stop 命中顿帧，
  // loose 对金盔的松动格数，meter 对心动的加分，gate 为真时受「松动间隔」限制（乱按不涨）
  const ATK = {
    normal: { kind: 'normal', rate: 1.1, slide: 110, knock: 0.22, stop: 70, trauma: 0.3, loose: 1, meter: 3, gate: true, heavy: false, shi: 6, trail: 1 },
    light: { kind: 'light', rate: 1.25, slide: 80, knock: 0.16, stop: 60, trauma: 0.22, loose: 1, meter: 3, gate: true, heavy: false, shi: 5, trail: 0.8 },
    heavy: { kind: 'heavy', rate: 0.85, slide: 110, knock: 0.5, stop: 130, trauma: 0.6, loose: 1, meter: 6, gate: false, heavy: true, shi: 10, trail: 1.7 },
    dash: { kind: 'dash', rate: 0.92, slide: 230, knock: 0.45, stop: 100, trauma: 0.45, loose: 1, meter: 5, gate: false, heavy: true, shi: 9, trail: 1.5, lock: 220 },
    flip: { kind: 'flip', rate: 1, slide: 60, knock: 0.32, stop: 90, trauma: 0.35, loose: 1, meter: 5, gate: false, heavy: true, shi: 8, trail: 1.3 },
  };

  // 动作名 → 图集动作名
  const CLIP_OF = {
    idle: 'idle', walk: 'walk', warn: 'attack', attack: 'attack', guard: 'guard',
    dodge: 'jump', hurt: 'hurt', down: 'hurt', defeat: 'defeat', victory: 'victory', daze: 'idle', ult: 'attack',
  };

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sign = (v) => (v < 0 ? -1 : 1);

  // ---------- 每帧时长 ----------
  function framesMs(who, act, clip) {
    const s = SPEC[who], n = clip.count, out = [];
    for (let i = 0; i < n; i++) {
      let ms = 70;
      if (act === 'idle') ms = 125;
      else if (act === 'walk') ms = 83;
      else if (act === 'attack') ms = i < clip.hit ? s.wind : i === clip.hit ? HIT_FRAME_MS : s.tail;
      else if (act === 'hurt') ms = s.hurt;
      else if (act === 'guard') ms = i <= clip.hold ? s.up : s.down;
      else if (act === 'jump') ms = 38;
      else if (act === 'victory') ms = 110;
      else if (act === 'defeat') ms = 70;
      out.push(ms);
    }
    return out;
  }
  function makeTable(who, act, clip) {
    const ms = framesMs(who, act, clip), cum = [];
    let sum = 0;
    for (const m of ms) { sum += m; cum.push(sum); }
    const t = { ms, cum, total: sum, count: clip.count, loop: !!clip.loop };
    if (clip.hit != null) { t.hitIndex = clip.hit; t.hitT = sum - (cum[cum.length - 1] - (cum[clip.hit - 1] || 0)); }
    if (clip.hold != null) t.hold = clip.hold;
    return t;
  }
  function indexAt(tab, t) {
    if (tab.loop) t %= tab.total;
    for (let i = 0; i < tab.cum.length; i++) if (t < tab.cum[i]) return i;
    return tab.count - 1;
  }

  function makeActor(g, id, who, x, face) {
    const tabs = {};
    for (const act of Object.keys(g.clips[who])) tabs[act] = makeTable(who, act, g.clips[who][act]);
    return {
      id, who, spec: SPEC[who], tabs, x, face,
      act: 'idle', t: 0, rate: 1, freeze: 0, flash: 0, pushV: 0,
      invuln: 0, hitDone: false, vul: false, cool: 0,
      slide: null, travel: null, attackId: 0, lock: 0,
      gRel: false, rt: 0, gPress: -9999, gLimit: 0,
      path: 0, atkGap: 1e9, lastAtkEnd: -1e9, flinchOkAt: 0, atk: null, chainN: 0, flinch: false, shake: 0, armor: 0, chain: null, warnLen: null, flipReq: false,
      ultT: 0,
    };
  }
  // 动作名 → 时间表
  const isEnemy = (a) => a.id === 'e';

  // 当前该画哪个动作的第几帧
  function frameOf(a) {
    const clipName = CLIP_OF[a.act];
    const tab = a.tabs[clipName];
    if (a.act === 'guard') {
      const raise = tab.cum[tab.hold];
      if (!a.gRel) return { clip: clipName, frame: indexAt(tab, Math.min(a.t, raise - 1)) };
      return { clip: clipName, frame: indexAt(tab, raise + a.rt) };
    }
    if (a.act === 'warn') return { clip: clipName, frame: 0 };
    if (a.act === 'ult') {
      // 大招：起手停在蓄力帧，之后五次快速的出手帧（命中帧前后）连放
      if (a.ultT < 0) return { clip: clipName, frame: 2 };
      const s = Math.min(4, Math.floor(a.ultT / ULT_STRIKE)), local = (a.ultT % ULT_STRIKE) / ULT_STRIKE;
      return { clip: clipName, frame: clamp(tab.hitIndex - 3 + Math.floor(local * 5), 0, tab.count - 1) };
    }
    if (a.act === 'down') return { clip: clipName, frame: tab.count - 1 };
    if (a.act === 'victory' || a.act === 'defeat') {
      return { clip: clipName, frame: Math.min(indexAt(tab, a.t), tab.hold) };
    }
    return { clip: clipName, frame: indexAt(tab, a.t * a.rate) };
  }

  // ---------- 创建与开场 ----------
  function create(clips, opts = {}) {
    const g = {
      clips, seed: opts.seed ?? 1, rng: null,
      t: 0, acc: 0, stage: 1, phase: 'play',
      held: { left: false, right: false, guard: false },
      buf: { attack: -9999, guard: -9999, dodge: -9999 },
      events: [], eventId: 0, fx: [], floats: [], script: [],
      sub: null, trauma: 0, fade: 0,
      calm: false, qi: QI_MAX, helmets: 3, meter: 0,
      dingCool: 0, finT: 0, finStep: 0, endT: -1, victoryAt: -1,
      stats: newStats(), hitLog: [],
      z: null, m: null, hand: null, zr: mulberry32((opts.seed ?? 1) + 99), heldSince: { left: -1e9, right: -1e9 },
      shi: 0, shiFull: false, loose: 0, gateUntil: 0, heavyGateUntil: 0, ult: null, ultSeen: !!opts.ultSeen, ultHintOn: false,
      lastDir: { dir: 0, t: -1e9 }, dashArm: null,
      tut: null, tutDone: false, timeScale: 1, touch: !!opts.touch, hints: !!opts.hints,
      pressT: { attack: -1e9, guard: -1e9, dodge: -1e9 },
    };
    g.rng = mulberry32(g.seed);
    g.p = makeActor(g, 'p', 'guiying', 300, 1);
    setupStage(g, opts.stage || 1, true);
    if (opts.tutorial) tutStart(g);
    return g;
  }
  function newStats() {
    return {
      parries: 0, blocks: 0, clashes: 0, hitsTaken: 0, hitsLanded: 0, dings: 0,
      dodges: 0, helmetsLost: 0, retries: 0, restarts: 0, swings: 0,
      chain3: 0, ults: 0, dashes: 0, flips: 0, looses: 0, ultHits: 0, chainAllParried: 0,
      maxSlide: 0, minX: 9999, maxX: -9999, warnToHit: [],
    };
  }
  const rnd = (g) => g.rng();
  const range = (g, a, b) => a + (b - a) * g.rng();

  function say(g, text, ms) { g.sub = { text, t0: g.t, until: g.t + ms }; }
  function emit(g, type, x, y, extra) {
    g.eventId++;
    const ev = Object.assign({ id: g.eventId, t: g.t, type, x, y }, extra || {});
    g.events.push(ev);
    if (g.events.length > 240) g.events.splice(0, g.events.length - 240);
    if (g.z && type !== 'zreact') zTrigger(g, ev);
    return ev;
  }
  function later(g, ms, fn) { g.script.push({ at: g.t + ms, fn }); }
  function addTrauma(g, v) { g.trauma = Math.min(1, g.trauma + v); }

  function setupStage(g, n, first) {
    g.stage = n; g.phase = 'play';
    g.tut = null; g.timeScale = 1; g.hand = null;
    g.qi = QI_MAX; g.helmets = 3; g.meter = 0; g.shi = 0; g.shiFull = false; g.loose = 0; g.ult = null; g.gateUntil = 0; g.heavyGateUntil = 0;
    g.fade = 0; g.script.length = 0; g.fx.length = 0; g.floats.length = 0;
    g.finT = 0; g.finStep = 0; g.endT = -1; g.victoryAt = -1; g.dingCool = 0;
    g.buf.attack = g.buf.guard = g.buf.dodge = -9999;
    const p = g.p;
    resetActor(p, 300, 1);
    g.m = null;
    if (n === 1) {
      // 一开场两个人都在台上：穆桂英在左，孟良在中间靠后，杨宗保站在右侧门边看着
      g.e = makeActor(g, 'e', 'mengliang', 600, -1);
      g.e.cool = 4800;
      g.z = makeActor(g, 'z', 'zongbao', Z_X, -1);
      if (first) say(g, '穆柯寨前，杨宗保带着孟良来讨降龙木。', 3600);
    } else {
      g.z = null;
      g.e = makeActor(g, 'e', 'zongbao', 680, -1);
      g.e.cool = 3800;
      say(g, '杨宗保：降龙木，我是一定要取的。', 3400);
      // 第二场开头只补一句提示，三秒自己消失
      if (!first && g.hints) later(g, 3600, () => say(g, '两枪同时出手会撞在一起，那也算数。', 3000));
    }
  }
  function resetActor(a, x, face) {
    a.x = x; a.face = face; a.act = 'idle'; a.t = 0; a.rate = 1; a.freeze = 0; a.flash = 0;
    a.pushV = 0; a.invuln = 0; a.hitDone = false; a.vul = false; a.slide = null;
    a.travel = null; a.lock = 0; a.gRel = false; a.rt = 0;
  }
  function start(a, act) { a.act = act; a.t = 0; a.rate = 1; a.hitDone = false; a.slide = null; a.flinch = false; }

  // ---------- 输入 ----------
  function input(g, name, down) {
    if (name === 'left' || name === 'right') {
      // 0.25 秒内同方向连点两下，接着按 J 是冲刺突刺
      if (down && !g.held[name]) {
        const dir = name === 'right' ? 1 : -1;
        g.heldSince[name] = g.t;
        if (g.lastDir.dir === dir && g.t - g.lastDir.t <= 250) g.dashArm = { dir, until: g.t + 500 };
        g.lastDir = { dir, t: g.t };
      }
      g.held[name] = down; return;
    }
    if (name === 'ult') {
      if (down && g.phase === 'play' && g.shi >= 100 && !g.ult && !g.tut) startUlt(g);
      return;
    }
    if (name === 'guard') g.held.guard = down;
    if (!down) return;
    g.pressT[name] = g.t;
    // K 和 J 在 0.08 秒内一起按：势满了就放大招；没满就各做各的
    if ((name === 'attack' || name === 'guard') && g.phase === 'play' && g.shi >= 100 && !g.ult && !g.tut) {
      const other = name === 'attack' ? 'guard' : 'attack';
      if (g.t - g.pressT[other] <= ULT_WINDOW) { startUlt(g); return; }
    }
    if (g.phase === 'retry') { retryStage(g); return; }
    if (g.phase === 'end' && g.endT > 1200) { restartAll(g); return; }
    g.buf[name] = g.t;
    if (g.tut) tutOnPress(g, name);
  }
  // 按一下（保持 ms 毫秒再松开），给钩子和机器人用
  function tap(g, name, ms) {
    input(g, name, true);
    later(g, ms == null ? 120 : ms, () => input(g, name, false));
  }
  function retryStage(g) {
    g.stats.retries++;
    setupStage(g, g.stage, false);
  }
  function restartAll(g) {
    g.stats.restarts++;
    setupStage(g, 1, true);
  }

  // ---------- 判定用的查询 ----------
  const guardActive = (a) => a.act === 'guard' && (!a.gRel || a.rt < 90);
  const dodgeInvuln = (a) => {
    if (a.act !== 'dodge') return false;
    const total = a.tabs.jump.total;
    return a.t >= total * 0.2 && a.t <= total * 0.65;
  };
  // 对手收招硬直：出招命中之后，或被架开后的踉跄
  function isVul(a) {
    if (a.act === 'hurt' && a.vul) return true;
    return a.act === 'attack' && a.t * a.rate >= a.tabs.attack.hitT + VUL_AFTER_HIT;
  }
  // 对手距离命中还有多久（预警 + 蓄力），没有在出招返回 null
  function hitIn(a) {
    if (a.act === 'warn') return (a.warnLen || a.spec.warn) - a.t + a.tabs.attack.hitT / (a.nextRate || 1);
    if (a.act === 'attack' && a.t * a.rate < a.tabs.attack.hitT) return (a.tabs.attack.hitT - a.t * a.rate) / a.rate;
    return null;
  }
  const dist = (g) => Math.abs(g.e.x - g.p.x);
  // 对手出招的蓄力条：从预警开始匀速走满，走满的那一刻就是招式落下；最后 0.2 秒是架开的亮段
  function chargeBar(g) {
    const e = g.e;
    if (!e || g.phase !== 'play') return null;
    const rem = hitIn(e);
    if (rem == null) return null;
    const total = Math.max(rem, e.chgTotal || rem);
    return {
      frac: clamp(1 - rem / total, 0, 1), winStart: 1 - Math.min(1, PARRY_WINDOW / total),
      inWindow: rem <= PARRY_WINDOW, rem, total, who: e.who, strikes: e.chain ? 3 : 1, strike: e.chain ? Math.max(1, e.chain.n) : 1,
    };
  }

  // 站位限制：舞台范围，且两人不叠在一起（被挤的是敌人，贴墙时反过来）
  function fixPositions(g) {
    const { p, e } = g;
    p.x = clamp(p.x, MIN_X, MAX_X);
    e.x = clamp(e.x, MIN_X, MAX_X);
    const gap = Math.abs(e.x - p.x);
    if (gap < MIN_GAP) {
      // 身体有体积，互相推开；贴墙时被墙挡住的那一方不动，另一方让出全部
      const dir = e.x >= p.x ? 1 : -1, half = (MIN_GAP - gap) / 2;
      p.x -= dir * half; e.x += dir * half;
      p.x = clamp(p.x, MIN_X, MAX_X); e.x = clamp(e.x, MIN_X, MAX_X);
      if (Math.abs(e.x - p.x) < MIN_GAP - 0.01) {
        const hi = dir > 0 ? e : p, lo = dir > 0 ? p : e;
        if (hi.x >= MAX_X - 0.01) lo.x = hi.x - MIN_GAP; else hi.x = lo.x + MIN_GAP;
      }
    }
  }

  // ---------- 顿帧、受击 ----------
  function stop(a, ms) { a.freeze = Math.max(a.freeze, ms); }
  function push(a, awayDir, v) { a.pushV = awayDir * v; }
  function contact(g, att, vic) {
    // 火花出在接触点：受击方靠近攻击方的那一侧，胸口高度
    return { x: vic.x - att.face * 26, y: GROUND - 150 };
  }

  function playerHurt(g, att) {
    const p = g.p;
    // 教学里挨一下只是演示，不掉气
    if (!g.tut) { g.qi--; g.stats.hitsTaken++; }
    start(p, 'hurt');
    p.invuln = 1000; p.flash = 90; p.vul = false;
    push(p, -sign(att.x - p.x), 0.27);
    stop(p, HITSTOP_HEAVY); stop(att, HITSTOP_HEAVY);
    const c = contact(g, att, p);
    emit(g, 'hurt', c.x, c.y, { qi: g.qi });
    addTrauma(g, 0.55);
    if (g.qi <= 0 && !g.tut) {
      // 掉光了不是死，播完受击就出「再来」
      later(g, p.tabs.hurt.total + HITSTOP_HEAVY, () => {
        if (g.phase !== 'play') return;
        g.phase = 'retry'; p.act = 'down'; emit(g, 'retry', p.x, GROUND - 120);
      });
    }
  }

  // 敌人命中结算：闪避 / 架开 / 挡下 / 受击
  function enemyHits(g) {
    if (g.phase !== 'play') return;
    const { p, e } = g;
    const c = contact(g, e, p);
    const T = g.tut;
    if (T) { T.attempting = false; T.boost = 1; T.slow = false; g.timeScale = 1; }
    if (p.invuln > 0 || dodgeInvuln(p)) {
      if (dodgeInvuln(p)) g.stats.dodges++;
      emit(g, 'evade', p.x, GROUND - 120);
      if (T && (T.step === 'guard' || T.step === 'dodge')) {
        if (T.step === 'dodge' && dodgeInvuln(p)) tutPass(g); else tutMiss(g);
      }
      return;
    }
    if (guardActive(p)) {
      const age = g.t - p.gPress;
      const mid = { x: (p.x + e.x) / 2 + p.face * 14, y: GROUND - 140 };
      if (age <= PARRY_WINDOW + STEP) {
        g.stats.parries++;
        addShi(g, 15);
        stop(p, HITSTOP_LIGHT); stop(e, HITSTOP_LIGHT);
        const mid3 = e.chain && e.chain.n < 3;
        if (e.chain) e.chain.parried++;
        if (mid3) {
          // 三连刺的前两枪被架开：他不踉跄，接着出下一枪
          e.flash = 60;
          push(e, sign(e.x - p.x), 0.12);
        } else {
          if (e.chain && e.chain.parried >= 3) { g.stats.chainAllParried++; addMeter(g, 20, e.x, GROUND - 300); }
          e.chain = null;
          // 被架开：敌人踉跄，进入可被打的状态
          start(e, 'hurt'); e.vul = true; e.rate = T ? 0.5 : STAGGER_RATE; e.flash = 60;
          push(e, sign(e.x - p.x), 0.22);
        }
        emit(g, 'parry', mid.x, mid.y);
        addTrauma(g, 0.25);
        if (g.stage === 2) addMeter(g, 12, e.x, GROUND - 270);
        if (T && (T.step === 'guard' || T.step === 'dodge')) { if (T.step === 'guard') tutPass(g); else tutMiss(g); }
      } else {
        g.stats.blocks++;
        addShi(g, 4);
        stop(p, HITSTOP_LIGHT); stop(e, HITSTOP_LIGHT);
        push(p, -sign(e.x - p.x), 0.2);
        emit(g, 'block', mid.x, mid.y);
        addTrauma(g, 0.15);
        if (g.stage === 2) addMeter(g, 6, e.x, GROUND - 270);
        if (T && (T.step === 'guard' || T.step === 'dodge')) tutMiss(g, T.step === 'guard');
      }
      return;
    }
    playerHurt(g, e);
    if (T && (T.step === 'guard' || T.step === 'dodge')) tutMiss(g);
    g.fx.push({ kind: 'spark', x: c.x, y: c.y, t0: g.t, big: true, seed: g.eventId, dir: e.face });
  }

  // 势：命中、架开、对枪都会涨，被打中不掉
  function addShi(g, n) {
    if (g.tut || g.shi >= 100) return;
    g.shi = Math.min(100, g.shi + n);
    if (g.shi >= 100 && !g.shiFull) {
      g.shiFull = true;
      emit(g, 'shiFull', g.p.x, GROUND - 200);
      if (!g.ultSeen) {
        g.ultHintOn = true;
        say(g, g.touch ? '势满了。同时按『架』和『刺』' : '势满了。同时按 K 和 J', 6000);
      }
    }
  }

  // 每一枪打中都有身体反应：顿帧、击退、抖一下、火花；站着的对手还会小退一步、播 hurt 的前几帧
  function hitReaction(g, K, c, strength) {
    const { p, e } = g;
    stop(p, K.stop); stop(e, K.stop);
    e.flash = 80; e.shake = 180;
    push(e, sign(e.x - p.x), K.knock * (strength == null ? 1 : strength));
    addTrauma(g, K.trauma * (strength == null ? 1 : strength));
    g.fx.push({ kind: 'spark', x: c.x, y: c.y, t0: g.t, big: K.heavy, seed: g.eventId, dir: p.face });
    emit(g, 'hit', c.x, c.y, { kind: K.kind });
    if (K.heavy && e.who === 'mengliang') { e.armor = g.t + 700; e.cool = Math.min(e.cool, 300); }
    const armored = g.t < e.armor || e.act === 'warn' || e.act === 'attack' || e.act === 'guard';
    // 他不会被无限连着打：每 1.4 秒最多晃一次，其余时间硬扛，并尽快还手
    e.cool = Math.min(e.cool, 250); e.lastHitT = g.t;
    if (!armored && g.t >= e.flinchOkAt && (e.act === 'idle' || e.act === 'walk' || (e.act === 'hurt' && e.flinch))) {
      start(e, 'hurt'); e.vul = false; e.rate = 1; e.flinch = true; e.flinchOkAt = g.t + 1400;
    }
  }

  // 孟良掉一整顶金盔
  function dropHelmet(g, c, last0) {
    const { p, e } = g;
    g.helmets--; g.stats.helmetsLost++; g.stats.hitsLanded++; g.loose = 0;
    const last = g.helmets <= 0;
    stop(p, last ? HITSTOP_HEAVY : Math.max(HITSTOP_LIGHT, p.freeze)); stop(e, last ? HITSTOP_HEAVY : HITSTOP_LIGHT);
    e.flash = 90; e.shake = 220;
    emit(g, 'helmet', c.x, c.y, { left: g.helmets });
    addTrauma(g, last ? 0.7 : 0.4);
    g.fx.push({ kind: 'spark', x: c.x, y: c.y, t0: g.t, big: true, seed: g.eventId, dir: p.face });
    if (last) { startWin1(g); return true; }
    return false;
  }

  // 玩家出手命中结算
  function playerHits(g) {
    if (g.phase !== 'play') return;
    const { p, e } = g;
    const c = contact(g, p, e);
    const K = p.atk || ATK.normal;
    if (g.tut && g.tut.step === 'stab') {
      // 教学第二步：这一下不掉金盔，只让她看到出枪和命中的反馈
      stop(p, HITSTOP_LIGHT); stop(e, HITSTOP_LIGHT);
      e.flash = 80;
      emit(g, 'tap', c.x, c.y);
      addTrauma(g, 0.3);
      tutPass(g);
      return;
    }
    const vul = isVul(e);
    if (g.stage === 1) {
      if (vul) {
        // 打在收招硬直里或架开之后：直接掉一整顶
        addShi(g, 12);
        if (dropHelmet(g, c)) return;
        start(e, 'hurt'); e.vul = false; e.rate = 1;
        push(e, sign(e.x - p.x), K.knock);
        if (g.tut && g.tut.step === 'punish') tutPass(g);
      } else if (g.tut) {
        g.stats.dings++;
        emit(g, 'ding', c.x, c.y);
        addTrauma(g, 0.1);
      } else if (e.act === 'hurt' && !e.flinch) {
        // 刚掉了金盔、正在硬挨：不再计
      } else {
        // 普通命中：松一格；松满三格掉一顶。乱按有间隔限制，重招不受限
        const gated = g.t < (K.gate ? g.gateUntil : g.heavyGateUntil);
        hitReaction(g, K, c, gated ? 0.6 : 1);
        if (gated) { g.stats.dings++; return; }
        if (K.gate) g.gateUntil = g.t + 2200; else g.heavyGateUntil = g.t + 3000;
        g.loose += K.loose; g.stats.looses++; g.stats.hitsLanded++;
        addShi(g, K.shi);
        if (g.loose >= 3) { g.loose -= 3; dropHelmet(g, c); if (g.phase !== 'play') return; start(e, 'hurt'); e.vul = false; e.rate = 1; }
        else emit(g, 'loose', c.x, c.y, { loose: g.loose });
      }
      return;
    }
    // 第二场
    if (vul) {
      g.stats.hitsLanded++;
      addShi(g, 12);
      stop(p, HITSTOP_LIGHT); stop(e, HITSTOP_LIGHT);
      e.flash = 80;
      emit(g, 'tap', c.x, c.y);
      addTrauma(g, 0.3);
      addMeter(g, 8, e.x, GROUND - 270);
      if (g.phase === 'play') { start(e, 'hurt'); e.vul = false; e.rate = 1; push(e, sign(e.x - p.x), 0.18); }
    } else if (e.act === 'guard') {
      g.stats.dings++;
      emit(g, 'ding', c.x, c.y);
      addTrauma(g, 0.12);
      // 他架着枪：只「叮」一下，每次架枪只算一次 +3
      if (!e.dinged) { e.dinged = true; addMeter(g, 3, e.x, GROUND - 270); }
    } else if (!(e.act === 'hurt' && !e.flinch)) {
      const gated = g.t < (K.gate ? g.gateUntil : g.heavyGateUntil);
      hitReaction(g, K, c, gated ? 0.6 : 1);
      if (gated) { g.stats.dings++; return; }
      if (K.gate) g.gateUntil = g.t + 3000; else g.heavyGateUntil = g.t + 4500;
      g.stats.hitsLanded++;
      addShi(g, K.shi);
      addMeter(g, K.meter, e.x, GROUND - 270);
    }
  }

  function addMeter(g, amt, x, y) {
    if (g.phase !== 'play') return;
    g.meter = Math.min(100, g.meter + amt);
    g.floats.push({ x, y, text: '+' + amt, t0: g.t });
    emit(g, 'meter', x, y, { amt, meter: g.meter });
    if (g.meter >= 100) startFinale(g);
  }

  // 对枪：双方几乎同时出枪
  function checkClash(g, att) {
    if (g.stage !== 2) return false;
    const other = att === g.p ? g.e : g.p;
    if (other.act !== 'attack' || other.hitDone) return false;
    // 对枪要的是看准了出手：上一枪收完不到 0.45 秒就又出枪（乱按、连招）不算
    if (g.p.atkGap < 700) return false;
    const gap = (other.tabs.attack.hitT - other.t * other.rate) / other.rate;
    if (Math.abs(gap) > CLASH_WINDOW) return false;
    if (dist(g) > Math.max(g.p.spec.reach, g.e.spec.reach) + 20) return false;
    att.hitDone = true; other.hitDone = true;
    g.stats.clashes++;
    const x = (g.p.x + g.e.x) / 2;
    for (const a of [g.p, g.e]) {
      stop(a, HITSTOP_HEAVY);
      push(a, -sign(g.e.x - g.p.x) * (a === g.p ? 1 : -1), 0.18);
      // 各退半步，收招，短暂不能动
      start(a, 'idle'); a.lock = 260;
    }
    g.e.cool = Math.max(g.e.cool, 900); g.e.chain = null;
    addShi(g, 20);
    emit(g, 'clash', x, GROUND - 150);
    g.fx.push({ kind: 'spark', x, y: GROUND - 150, t0: g.t, big: true, seed: g.eventId, dir: 1 });
    addTrauma(g, 0.5);
    addMeter(g, 15, x, GROUND - 270);
    return true;
  }

  // ---------- 出招 ----------
  function beginAttack(g, a, targetX, kind) {
    a.attackId++;
    a.atkGap = g.t - (a.lastAtkEnd == null ? -1e9 : a.lastAtkEnd);
    a.lastAtkEnd = g.t;
    start(a, 'attack');
    const K = isEnemy(a) ? null : ATK[kind || 'normal'];
    a.atk = K;
    // 出手吸附：转向对手，小滑步到够得着的距离，不冲过头
    const d = Math.abs(targetX - a.x);
    if (d < 360 || (K && K.kind === 'dash')) a.face = sign(targetX - a.x);
    let slide;
    if (K && K.kind === 'dash') slide = clamp(d - 105, 0, K.slide);
    else slide = clamp(d - a.spec.reach * 0.85, 0, K ? K.slide : 90);
    slide = Math.min(slide, Math.max(0, d - MIN_GAP));
    if (K) {
      a.rate = K.rate;
      a.chainN = K.kind === 'normal' ? 1 : K.kind === 'light' ? 2 : K.kind === 'heavy' ? 3 : 0;
      if (K.kind === 'heavy') g.stats.chain3++;
      if (K.kind === 'dash') g.stats.dashes++;
      if (K.kind === 'flip') g.stats.flips++;
    } else if (a.chain) a.rate = a.chain.n > 0 ? 0.65 : 1;
    if (a.chain) a.chain.n++;
    if (isEnemy(a) && a.chain && a.chain.n > 1) a.chgTotal = a.tabs.attack.hitT / a.rate;
    a.slide = { total: slide, done: 0, dur: a.tabs.attack.hitT, dir: a.face };
    g.stats.swings++;
    emit(g, 'swing', a.x, GROUND - 150, { who: a.id, kind: K ? K.kind : 'enemy' });
    if (K && g.tut && g.tut.step === 'chain' && K.kind === 'heavy') tutPass(g);
  }

  function slideStep(a, dt) {
    if (!a.slide) return;
    const s = a.slide;
    const frac = clamp(a.t * a.rate / s.dur, 0, 1);
    // 先快后慢，贴近目标时收住
    const eased = 1 - (1 - frac) * (1 - frac);
    const target = s.total * eased;
    const dx = target - s.done;
    if (dx > 0) { a.x += s.dir * dx; s.done = target; }
  }

  // 一方出枪的命中判定：在出手帧起的一小段活动期内，够得着就算
  function attackStep(g, a, dt) {
    const tab = a.tabs.attack;
    slideStep(a, dt);
    const t = a.t * a.rate;
    if (!a.hitDone && t >= tab.hitT) {
      const target = isEnemy(a) ? g.p : g.e;
      const dx = target.x - a.x;
      const inRange = Math.abs(dx) <= a.spec.reach + 25 && sign(dx) === a.face;
      if (inRange) {
        if (g.stage === 2 && checkClash(g, a)) return;
        a.hitDone = true;
        if (isEnemy(a)) {
          g.stats.warnToHit.push(g.t - a.warnT0);
          enemyHits(g);
        } else playerHits(g);
      } else if (t >= tab.hitT + 100 * a.rate) {
        a.hitDone = true;
        emit(g, 'whiff', a.x, GROUND - 150, { who: a.id });
      }
    }
    // 杨宗保的三连刺：每一枪打完很快接下一枪
    if (isEnemy(a) && a.chain && a.hitDone && t >= tab.hitT + 200 && a.chain.n < 3 && g.phase === 'play') {
      a.warnT0 = g.t;
      beginAttack(g, a, g.p.x);
      return;
    }
    if (t >= tab.total) {
      if (!isEnemy(a) && a.atk && a.atk.lock) a.lock = a.atk.lock;
      a.lastAtkEnd = g.t;
      start(a, 'idle');
      if (isEnemy(a)) { a.chain = null; a.cool = enemyCool(g, a); }
    }
  }
  function enemyCool(g, a) {
    return a.who === 'mengliang' ? range(g, 2200, 3400) : range(g, 1800, 3000);
  }

  // ---------- 玩家每步 ----------
  function canStart(g, p, kind) {
    if (p.lock > 0 || g.phase !== 'play') return false;
    const neutral = p.act === 'idle' || p.act === 'walk';
    const tab = p.tabs.attack;
    if (kind === 'dodge') return p.act !== 'hurt' && p.act !== 'dodge' && p.act !== 'down';
    if (kind === 'guard') {
      if (neutral) return true;
      if (p.act === 'attack' && p.t >= tab.hitT + 80) return true;
      return p.act === 'guard' && p.gRel && p.rt > 100;
    }
    if (neutral) return true;
    // 连招：在上一枪的后半段按；翻身刺：在闪的后半段按
    if (p.act === 'attack' && p.atk && p.chainN >= 1 && p.chainN < 3 && p.t * p.rate >= tab.total * 0.5) return true;
    if (p.act === 'dodge' && !p.flipReq && p.t >= p.tabs.jump.total * 0.5) return true;
    return p.act === 'guard' && p.gRel && p.rt > 60;
  }
  function pickAttackKind(g, p) {
    if (p.act === 'dodge') return 'flipReq';
    if (p.act === 'attack' && p.chainN >= 1 && p.chainN < 3) return p.chainN === 1 ? 'light' : 'heavy';
    const toward = sign(g.e.x - p.x), dir = (g.held.right ? 1 : 0) - (g.held.left ? 1 : 0);
    const far = dist(g) > 120 && dist(g) < 520;
    // 只在「连点两下」或「按住方向跑起来超过 0.35 秒」后才冲刺；刚起步、贴身都是普通刺
    const heldMs = dir ? g.t - g.heldSince[dir > 0 ? 'right' : 'left'] : 0;
    if (far && dir === toward && p.act === 'walk' && heldMs >= 350) return 'dash';
    if (far && g.dashArm && g.t < g.dashArm.until && g.dashArm.dir === toward) { g.dashArm = null; return 'dash'; }
    return 'normal';
  }

  function startDodge(g, p) {
    start(p, 'dodge'); p.flipReq = false;
    const dir = (g.held.right ? 1 : 0) - (g.held.left ? 1 : 0) || -sign(g.e.x - p.x);
    p.travel = { dir, total: 130, done: 0, dur: p.tabs.jump.total };
    emit(g, 'dodge', p.x, GROUND - 100);
  }
  function startGuard(g, p, pressT) {
    start(p, 'guard');
    if (g.phase === 'play' && dist(g) < 380) p.face = sign(g.e.x - p.x);
    p.gRel = false; p.rt = 0; p.gPress = pressT; p.gLimit = 0;
    const bar = chargeBar(g);
    emit(g, 'guard', p.x, GROUND - 100, { win: !!(bar && bar.inWindow), frac: bar ? bar.frac : 0 });
  }

  function updatePlayer(g, dt) {
    const p = g.p;
    if (p.act === 'ult') return;
    if (p.freeze > 0) { p.freeze -= dt; return; }
    if (p.lock > 0) p.lock -= dt;
    if (p.invuln > 0) p.invuln -= dt;
    p.t += dt;
    if (p.pushV) { p.x += p.pushV * dt; p.pushV *= 0.9; if (Math.abs(p.pushV) < 0.01) p.pushV = 0; }
    const free = g.phase === 'play';

    // 先结算正在进行的动作
    if (p.act === 'attack') attackStep(g, p, dt);
    else if (p.act === 'dodge') {
      const tr = p.travel, frac = clamp((p.t - 80) / (p.tabs.jump.total - 160), 0, 1);
      const target = tr.total * frac;
      p.x += tr.dir * (target - tr.done); tr.done = target;
      if (p.flipReq && p.t >= p.tabs.jump.total * 0.85) { p.flipReq = false; beginAttack(g, p, g.e.x, 'flip'); }
      else if (p.t >= p.tabs.jump.total) start(p, 'idle');
    } else if (p.act === 'hurt') {
      if (p.t >= p.tabs.hurt.total) start(p, 'idle');
    } else if (p.act === 'guard') {
      if (!p.gRel) {
        const tooLong = p.t >= GUARD_MAX;
        if ((!g.held.guard && p.t >= 120) || tooLong) { p.gRel = true; p.rt = 0; p.gLimit = tooLong ? 1 : 0; }
      } else {
        p.rt += dt;
        const tab = p.tabs.guard;
        if (tab.cum[tab.hold] + p.rt >= tab.total) start(p, 'idle');
      }
    }

    // 再看有没有缓冲的指令可以开始
    if (free) {
      let pick = null, best = -1;
      for (const kind of ['dodge', 'guard', 'attack']) {
        const at = g.buf[kind];
        if (g.t - at > BUFFER_MS) continue;
        if (kind === 'guard' && p.gLimit && g.held.guard && p.act === 'guard') continue;
        if (at > best && canStart(g, p, kind)) { best = at; pick = kind; }
      }
      if (pick) {
        g.buf[pick] = -9999;
        if (pick === 'dodge') startDodge(g, p);
        else if (pick === 'guard') startGuard(g, p, best);
        else {
          const kind = pickAttackKind(g, p);
          if (kind === 'flipReq') p.flipReq = true; else beginAttack(g, p, g.e.x, kind);
        }
      }
      // 走路
      if ((p.act === 'idle' || p.act === 'walk') && p.lock <= 0) {
        const dir = (g.held.right ? 1 : 0) - (g.held.left ? 1 : 0);
        if (dir) {
          if (p.act !== 'walk') start(p, 'walk');
          p.face = dir;
          p.x += dir * p.spec.speed * dt;
        } else if (p.act === 'walk') start(p, 'idle');
      }
    } else if (p.act === 'walk' && !g.held.left && !g.held.right) start(p, 'idle');
    if (p.act === 'guard' && g.held.guard === false && p.gLimit) p.gLimit = 0;
  }

  // ---------- 敌人每步 ----------
  function updateEnemy(g, dt, ai) {
    const e = g.e, p = g.p;
    if (e.shake > 0) e.shake -= dt;
    if (e.freeze > 0) { e.freeze -= dt; return; }
    if (e.lock > 0) e.lock -= dt;
    e.t += dt;
    if (e.pushV) { e.x += e.pushV * dt; e.pushV *= 0.9; if (Math.abs(e.pushV) < 0.01) e.pushV = 0; }
    if (e.cool > 0) e.cool -= dt;
    const d = Math.abs(p.x - e.x);
    switch (e.act) {
      case 'hurt': {
        const tab = e.tabs.hurt;
        // 普通命中只播 hurt 的前几帧（小退一步、晃一下）
        const cutoff = e.flinch ? tab.cum[Math.min(3, tab.count - 1)] : tab.total;
        if (e.t * e.rate >= cutoff) { start(e, 'idle'); e.vul = false; e.cool = Math.max(e.cool, enemyCool(g, e) * 0.8); }
        break;
      }
      case 'warn':
        e.face = sign(p.x - e.x);
        if (e.t >= (e.warnLen || e.spec.warn)) { const t0 = e.warnT0; beginAttack(g, e, p.x); e.warnT0 = t0; }
        break;
      case 'attack': attackStep(g, e, dt); break;
      case 'guard': {
        if (!e.gRel) {
          if (e.t >= e.guardHold) { e.gRel = true; e.rt = 0; }
        } else {
          e.rt += dt;
          const tab = e.tabs.guard;
          if (tab.cum[tab.hold] + e.rt >= tab.total) { start(e, 'idle'); e.cool = range(g, 700, 1200); }
        }
        break;
      }
      case 'defeat': case 'victory': case 'daze': case 'down': break;
      default: {
        if (g.hand && e.act === 'walk') break;
        if (!ai || e.lock > 0) { if (e.act === 'walk') start(e, 'idle'); break; }
        e.face = sign(p.x - e.x);
        const near = e.who === 'mengliang' ? 215 : 235;
        if (d > near + 20) {
          if (e.act !== 'walk') start(e, 'walk');
          e.x += e.face * e.spec.speed * dt;
        } else if (e.who === 'zongbao' && d < 160 && e.cool > 0) {
          if (e.act !== 'walk') start(e, 'walk');
          e.x -= e.face * 0.09 * dt;
        } else {
          if (e.act === 'walk') start(e, 'idle');
          if (e.cool <= 0 && !g.calm) enemyDecide(g, e, d);
        }
      }
    }
  }
  function enemyDecide(g, e, d) {
    // 刚被打过的杨宗保不会缩进去架枪，而是直接还手
    const hot = g.t - (e.lastHitT == null ? -1e9 : e.lastHitT) < 2500;
    if (e.who === 'zongbao' && !hot && rnd(g) < 0.28) {
      start(e, 'guard');
      e.gRel = false; e.rt = 0; e.guardHold = range(g, 500, 800); e.dinged = false;
      return;
    }
    start(e, 'warn');
    e.warnT0 = g.t;
    e.warnLen = null; e.chain = null;
    e.chgTotal = hitIn(e);
    // 杨宗保偶尔三连刺回敬：预警更长更明显，三枪都能被逐一架开
    if (e.who === 'zongbao' && g.stage === 2 && !g.tut && rnd(g) < 0.14) { e.chain = { n: 0, parried: 0 }; e.warnLen = 560; e.chgTotal = hitIn(e); }
    emit(g, 'warn', e.x, GROUND - 180, { who: e.who, hitIn: hitIn(e) });
  }

  // ---------- 教学：第一场开头手把手，一步一件事，做到了才进下一步 ----------
  const TUT_TEXT = {
    walk: ['按住 ◀ ▶ 走到孟良跟前', '按住 ← → 走到孟良跟前'],
    stab: ['按『刺』出枪', '按 J 出枪'],
    guard: ['条走到亮的那一段时，按住『架』', '条走到亮的那一段时，按住 K'],
    raise: ['他举斧了，看他头上的条', '他举斧了，看他头上的条'],
    caught: ['架住了', '架住了'],
    early: ['挡住了。等条走到亮段再按，能把他弹开', '挡住了。等条走到亮段再按，能把他弹开'],
    punish: ['趁他愣住，刺', '趁他愣住，刺'],
    dodge: ['斧子太沉的时候，也可以『闪』开', '斧子太沉的时候，也可以按 L 闪开'],
    chain: ['连按三下『刺』', '连按 J 三下'],
    outro: ['就是这样。把剩下两顶金盔打下来。', '就是这样。把剩下两顶金盔打下来。'],
  };
  const TUT_GLOW = { walk: 'move', stab: 'attack', guard: 'guard', punish: 'attack', dodge: 'dodge', chain: 'attack', outro: null };
  const SLOW = 0.35;
  const tutText = (g, step) => TUT_TEXT[step][g.touch ? 0 : 1];

  function tutStart(g) {
    g.tut = { step: 'walk', tries: 0, slow: false, boost: 1, attempting: false, attempt: 0, glow: 'move', autoAt: 0, autoDone: false, pressed: false };
    g.helmets = 3;
    const e = g.e;
    e.x = 640; e.lock = 1e9; e.cool = 1e9;
    g.sub = null;
    tutEnter(g, 'walk');
  }
  function tutEnter(g, step) {
    const T = g.tut;
    T.step = step; T.glow = TUT_GLOW[step]; T.pressed = false;
    if (step === 'guard') g.sub = null; else say(g, tutText(g, step), step === 'outro' ? 3300 : 1e12);
    T.half = false;
    if (step === 'guard') later(g, 900, () => tutAttempt(g));
    if (step === 'dodge') later(g, 1800, () => tutAttempt(g));
    if (step === 'outro') {
      later(g, 3400, () => {
        if (!g.tut) return;
        g.tut = null; g.timeScale = 1; g.tutDone = true;
        g.e.lock = 0; g.e.cool = 2200;
        emit(g, 'tutorialDone', g.e.x, GROUND - 200);
      });
    }
  }
  // 孟良慢慢举斧（放慢到 0.35 倍），等她按
  function tutAttempt(g) {
    const T = g.tut;
    if (!T || g.phase !== 'play' || (T.step !== 'guard' && T.step !== 'dodge')) return;
    const e = g.e, p = g.p;
    if (T.slow || T.attempting) return;
    if (e.act !== 'idle' || p.act === 'hurt') { later(g, 300, () => tutAttempt(g)); return; }
    T.attempt++;
    T.attempting = true; T.slow = true; T.boost = 1; T.pressed = false;
    T.glow = TUT_GLOW[T.step];
    T.autoDone = false; T.autoAt = g.t + 1500;
    // 前三次都没按，这一次替她按
    T.auto = T.tries >= 3;
    e.face = sign(p.x - e.x);
    start(e, 'warn'); e.warnT0 = g.t;
    e.chgTotal = hitIn(e);
    emit(g, 'warn', e.x, GROUND - 180, { who: e.who, hitIn: hitIn(e) });
    g.timeScale = SLOW;
    T.half = false;
    say(g, tutText(g, T.step === 'guard' ? 'raise' : T.step), 1e12);
  }
  function tutOnPress(g, name) {
    const T = g.tut;
    if (!T || !T.slow || T.pressed) return;
    if (T.step === 'guard' && name === 'guard') {
      // 恢复正常速度；在亮段里按下，字幕立刻换成「架住了」
      const bar = chargeBar(g);
      T.slow = false; T.pressed = true; T.glow = null; g.timeScale = 1;
      if (bar && bar.inWindow) say(g, tutText(g, 'caught'), 1e12);
    } else if (T.step === 'dodge' && name === 'dodge') {
      const rem = hitIn(g.e);
      if (rem == null) return;
      T.boost = rem > 300 ? rem / 300 : 1;
      T.slow = false; T.pressed = true; T.glow = null;
      g.timeScale = 1;
    }
  }
  function tutPass(g) {
    const T = g.tut;
    if (!T) return;
    T.tries = 0;
    emit(g, 'tutStep', g.p.x, GROUND - 200, { step: T.step });
    const next = { walk: 'stab', stab: 'guard', guard: 'punish', punish: 'dodge', dodge: 'chain', chain: 'outro' }[T.step];
    tutEnter(g, next);
  }
  function tutMiss(g, early) {
    const T = g.tut;
    if (!T) return;
    T.tries++; T.slow = false; T.boost = 1; T.attempting = false; g.timeScale = 1; T.glow = null;
    say(g, early ? tutText(g, 'early') : '没关系，再来一次。', early ? 2400 : 1400);
    later(g, 1900, () => tutAttempt(g));
  }
  function tutTick(g) {
    const T = g.tut, e = g.e, p = g.p;
    if (g.phase !== 'play') return;
    if (T.step === 'walk' && g.t > 600 && Math.abs(e.x - p.x) <= 240) tutPass(g);
    if (T.step === 'guard' && T.slow && !T.pressed) {
      // 条走到一半，提示她等亮段再按
      const bar = chargeBar(g);
      if (bar && bar.frac >= 0.5 && !T.half) { T.half = true; say(g, tutText(g, 'guard'), 1e12); }
      // 前三次都没架开：这一次在亮段里替她按
      if (bar && T.tries >= 3 && !T.autoDone && bar.rem <= 190) { T.autoDone = true; tap(g, 'guard', 350); }
    }
    if (T.step === 'dodge' && T.slow && T.tries >= 3 && !T.autoDone && g.t >= T.autoAt) { T.autoDone = true; tap(g, 'dodge', 80); }
    // 他愣住的时间过了还没打中：回到第三步重来（不算次数）
    if (T.step === 'punish' && e.act === 'idle' && e.t > 300) tutEnter(g, 'guard');
    // 斧子落空（她走开了）：当没架住，重来
    if (T.attempting && (T.step === 'guard' || T.step === 'dodge') && e.act === 'idle' && e.t > 200) tutMiss(g);
  }
  // 跳过教学：直接进正常的第一场
  function skipTutorial(g) {
    if (!g.tut) return;
    const e = g.e;
    g.tut = null; g.timeScale = 1; g.sub = null; g.tutDone = true;
    if (e.act !== 'defeat') { start(e, 'idle'); e.lock = 0; e.cool = 2500; e.vul = false; }
    g.p.invuln = 0;
    emit(g, 'tutorialDone', e.x, GROUND - 200, { skipped: true });
  }

  // ---------- 大招：势满了，K 和 J 一起按 ----------
  function startUlt(g) {
    const { p, e } = g;
    g.shi = 0; g.shiFull = false; g.ultHintOn = false; g.ultSeen = true;
    g.buf.attack = g.buf.guard = g.buf.dodge = -9999;
    g.stats.ults++;
    if (g.sub && /势满了/.test(g.sub.text)) g.sub = null;
    // 起手前先把两人的间距修正到合适：太近就各退半步，免得身体叠在一起
    const d0 = Math.abs(e.x - p.x);
    if (d0 < 130) {
      const dir = sign(e.x - p.x), need = (130 - d0) / 2;
      p.x = clamp(p.x - dir * need, MIN_X, MAX_X); e.x = clamp(e.x + dir * need, MIN_X, MAX_X);
      fixPositions(g);
    }
    start(p, 'ult');
    p.ultT = -1; p.invuln = 1e9; p.flipReq = false; p.lock = 0;
    p.face = sign(e.x - p.x);
    g.ult = { t: 0, phase: 'charge', next: 0, done: false, endAt: 0 };
    g.timeScale = 0.35;
    emit(g, 'ult', p.x, GROUND - 160);
  }
  function endUlt(g) {
    const p = g.p;
    g.ult = null; g.timeScale = 1;
    if (p.act === 'ult') { start(p, 'idle'); p.invuln = 300; p.ultT = 0; }
  }
  // 用真实时间推进：放慢只放慢别人，不放慢大招自己的节奏
  function ultTick(g, dt) {
    const U = g.ult, { p, e } = g;
    if (p.freeze > 0) { p.freeze -= dt; return; }
    U.t += dt;
    if (U.phase === 'charge') {
      p.ultT = -1;
      if (U.t >= ULT_CHARGE) {
        U.phase = 'strikes'; g.timeScale = 1; p.ultT = 0;
        const d = Math.abs(e.x - p.x);
        p.face = sign(e.x - p.x);
        p.slide = { total: clamp(d - 105, 0, 240), done: 0, dur: ULT_STRIKE * 2, dir: p.face };
        p.t = 0; p.rate = 1;
      }
      return;
    }
    const st = U.t - ULT_CHARGE;
    p.ultT = st; p.t = st;
    slideStep(p, dt);
    while (U.next < 5 && st >= U.next * ULT_STRIKE + 90) { ultStrike(g, U.next); U.next++; }
    if (U.next >= 5 && !U.done && st >= 4 * ULT_STRIKE + 90 + 450) { U.done = true; endUlt(g); }
  }
  function ultStrike(g, i) {
    const { p, e } = g;
    if (g.phase !== 'play') return;
    const c = { x: e.x - p.face * 26, y: GROUND - 150 };
    g.stats.ultHits++;
    emit(g, 'ultHit', c.x, c.y, { i });
    g.fx.push({ kind: 'spark', x: c.x, y: c.y - 6 + i * 3, t0: g.t, big: i === 4, seed: g.eventId, dir: p.face });
    addTrauma(g, i === 4 ? 0.85 : 0.25);
    e.flash = 70; e.shake = 200;
    if (i === 0) { start(e, 'hurt'); e.vul = false; e.rate = 0.3; e.chain = null; }
    push(e, sign(e.x - p.x), i === 4 ? 0.85 : 0.1);
    if (i < 4) { stop(e, 40); return; }
    // 最后一枪：长顿帧，大锣，对方大退
    stop(p, 250); stop(e, 250);
    emit(g, 'gongBig', c.x, c.y);
    if (g.stage === 1) {
      if (dropHelmet(g, c)) { endUlt(g); return; }
      start(e, 'hurt'); e.vul = true; e.rate = 0.45;
    } else {
      start(e, 'hurt'); e.vul = false; e.rate = 0.6;
      addMeter(g, 25, e.x, GROUND - 270);
      e.cool = 1800;
    }
  }

  // ---------- 过场：第一场收尾 ----------
  function startWin1(g) {
    const e = g.e;
    g.phase = 'win1'; g.ult = null; g.timeScale = 1; g.p.invuln = 0;
    if (g.p.act === 'ult') start(g.p, 'idle');
    start(e, 'defeat');
    later(g, 900, () => say(g, '金盔留下，人可以走。', 2600));
    // 不黑场：孟良丢盔退进右门，杨宗保走上前站到对面，再说他的台词
    g.hand = { stage: 0, at: g.t + 2300, zAt: 0, doneAt: 0 };
  }
  function updateHandoff(g, dt) {
    const H = g.hand, e = g.e, z = g.z;
    if (g.phase !== 'win1' || !z) return;
    if (H.stage === 0 && g.t >= H.at) { start(e, 'walk'); e.face = 1; H.stage = 1; }
    else if (H.stage === 1) {
      e.x += 0.13 * dt;
      if (e.x >= 842) { e.x = 842; start(e, 'idle'); e.face = -1; H.stage = 2; H.zAt = g.t + 300; }
    } else if (H.stage === 2 && g.t >= H.zAt) {
      if (z.act !== 'walk') start(z, 'walk');
      z.face = -1; z.x -= 0.09 * dt;
      if (z.x <= 700) { z.x = 700; start(z, 'idle'); H.stage = 3; H.doneAt = g.t + 400; }
    } else if (H.stage === 3 && g.t >= H.doneAt) {
      // 第二场从这里接着打：杨宗保成为对手，孟良留在门边（结尾探半个身子）
      e.id = 'm'; g.m = e;
      z.id = 'e'; g.e = z; g.z = null;
      g.stage = 2; g.phase = 'play'; g.hand = null;
      g.qi = QI_MAX; g.helmets = 3; g.loose = 0; g.shi = 0; g.shiFull = false;
      z.cool = 3800; z.lock = 0; z.chain = null; z.face = -1;
      start(g.p, 'idle'); g.p.invuln = 0; g.p.lock = 0; g.p.pushV = 0;
      g.fx.length = 0;
      say(g, '杨宗保：降龙木，我是一定要取的。', 3400);
      if (g.hints) later(g, 3600, () => say(g, '两枪同时出手会撞在一起，那也算数。', 3000));
    }
  }

  // ---------- 杨宗保在第一场：站在门边看着，不参战、不被打到、不挡路 ----------
  function zTrigger(g, ev) {
    const z = g.z;
    if (g.stage !== 1 || !z) return;
    if (ev.type === 'parry') { zReact(g); addHeart1(g, 4); }
    else if (ev.type === 'ult') { zReact(g, true); addHeart1(g, 5); }
    else if (ev.type === 'hit' && ev.kind === 'heavy') { zReact(g); addHeart1(g, 3); }
  }
  function zReact(g, hurtOnly) {
    const z = g.z;
    if (z.act !== 'idle' && z.act !== 'walk') return;
    if (hurtOnly || g.zr() < 0.55) { start(z, 'hurt'); z.flinch = true; }
    else { start(z, 'guard'); z.gRel = false; z.rt = 0; z.guardHold = 260; }
  }
  // 第一场的心动：她每次架开、三连第三枪、大招，都涨一点，合计最多约 20
  function addHeart1(g, n) {
    if (g.tut || g.meter >= HEART1_MAX) return;
    const before = g.meter;
    g.meter = Math.min(HEART1_MAX, g.meter + n);
    if (g.meter === before) return;
    emit(g, 'meter', g.z.x, GROUND - 210, { amt: g.meter - before, meter: g.meter });
    emit(g, 'zreact', g.z.x, GROUND - 210);
    g.fx.push({ kind: 'mote', x: g.z.x, y: GROUND - 210, t0: g.t, seed: g.eventId });
  }
  function updateZ(g, dt) {
    const z = g.z;
    if (!z) return;
    z.t += dt;
    if (g.hand && g.hand.stage >= 2) return;
    if (z.act === 'hurt') {
      const tab = z.tabs.hurt;
      if (z.t * z.rate >= tab.cum[Math.min(2, tab.count - 1)]) start(z, 'idle');
    } else if (z.act === 'guard') {
      if (!z.gRel) { if (z.t >= z.guardHold) { z.gRel = true; z.rt = 0; } }
      else { z.rt += dt; const tab = z.tabs.guard; if (tab.cum[tab.hold] + z.rt >= tab.total) start(z, 'idle'); }
    } else {
      // 穆桂英和孟良打到右半场时他让进门帘里一点；孟良每掉一顶盔，他往前迈半步
      const far = Math.max(g.p.x, g.e.x) > 620;
      const tx = far ? Z_HIDE_X : Z_X - 30 * (3 - g.helmets);
      const d = tx - z.x;
      if (Math.abs(d) > 2) {
        if (z.act !== 'walk') start(z, 'walk');
        z.face = sign(d); z.x += sign(d) * Math.min(Math.abs(d), 0.07 * dt);
      } else { if (z.act === 'walk') start(z, 'idle'); z.face = -1; }
    }
  }

  // ---------- 过场：第二场收尾 ----------
  function startFinale(g) {
    const { p, e } = g;
    g.phase = 'finale'; g.finT = 0; g.finStep = 0; g.ult = null; g.timeScale = 1; p.invuln = 0; p.pushV = 0; e.pushV = 0;
    start(e, 'hurt'); e.rate = 1; e.vul = false; e.hitDone = true;
    stop(e, HITSTOP_HEAVY);
    emit(g, 'finale', e.x, GROUND - 200);
  }
  function walkTo(a, tx, dt) {
    const dx = tx - a.x;
    if (Math.abs(dx) < 3) { if (a.act === 'walk') start(a, 'idle'); return true; }
    a.face = sign(dx);
    if (a.act !== 'walk') start(a, 'walk');
    a.x += sign(dx) * Math.min(Math.abs(dx), 0.15 * dt);
    return false;
  }
  function updateFinale(g, dt) {
    const { p, e } = g;
    g.finT += dt;
    if (g.finStep === 0) {
      // 他受击后愣住一下
      if (p.act !== 'idle' && p.act !== 'hurt' && p.t > 400) start(p, 'idle');
      if (e.act === 'idle') { start(e, 'daze'); }
      if (g.finT > 2500) { g.finStep = 1; }
    } else if (g.finStep === 1) {
      // 两人转向同一边，走到舞台中间并肩
      e.face = 1; p.face = 1;
      const a = walkTo(p, 410, dt), b = walkTo(e, 540, dt);
      if ((a && b) || g.finT > 5200) {
        g.finStep = 2; g.finMark = g.finT;
        p.face = 1; e.face = 1;
        start(p, 'idle'); start(e, 'idle');
        later(g, 350, () => {
          start(p, 'victory'); start(e, 'victory');
          g.victoryAt = g.t;
          emit(g, 'gongBig', 480, GROUND - 200);
          say(g, '这一仗谁也没赢。后来的事，戏里都唱过。', 6000);
          addTrauma(g, 0.3);
        });
        later(g, 2200, () => { g.phase = 'end'; g.endT = 0; });
      }
    }
    // 动画推进
    for (const a of [p, e]) {
      if (a.freeze > 0) { a.freeze -= dt; continue; }
      a.t += dt;
      if (a.pushV) { a.x += a.pushV * dt; a.pushV *= 0.9; }
      if (a.act === 'hurt' && a.t >= a.tabs.hurt.total) start(a, 'idle');
    }
  }

  // ---------- 每个固定步长 ----------
  function tick(g, dt) {
    g.t += dt;
    if (g.p.flash > 0) g.p.flash -= dt;
    if (g.e.flash > 0) g.e.flash -= dt;
    g.trauma = Math.max(0, g.trauma - dt / 1000 * 1.6);
    if (g.dingCool > 0) g.dingCool -= dt;
    if (g.sub && g.t > g.sub.until) g.sub = null;
    // 淡入淡出
    if (g.phase === 'fade') {
      g.fade = clamp(g.fade + (g.fadeDir || 0) * dt / 800, 0, 1);
      if (g.fadeDir > 0 && g.fade >= 1) {
        setupStage(g, 2, false);
        g.phase = 'fade'; g.fadeDir = -1; g.fade = 1;
      } else if (g.fadeDir < 0 && g.fade <= 0) g.phase = 'play';
    }

    // 到点的剧本
    for (let i = 0; i < g.script.length; i++) {
      if (g.script[i].at <= g.t) { const s = g.script.splice(i, 1)[0]; i--; s.fn(g); }
    }

    const { p, e } = g;
    if (g.tut) tutTick(g);
    if (g.ult) ultTick(g, dt);
    updateZ(g, dt);
    if (g.hand) updateHandoff(g, dt);
    // 放慢只放慢玩法的时间步；g.t、界面、特效、震屏、字幕都走真实时间
    const gdt = dt * g.timeScale;
    if (g.phase === 'finale' || g.phase === 'end') {
      if (g.phase === 'end') g.endT += dt;
      updateFinale(g, dt);
    } else {
      updatePlayer(g, gdt);
      // 教学里玩家按下后，敌人会加速把剩下的动作演完，分小步走免得跳帧
      const boost = g.tut ? g.tut.boost : 1, n = Math.max(1, Math.ceil(boost));
      for (let i = 0; i < n; i++) updateEnemy(g, gdt * boost / n, g.phase === 'play');
      fixPositions(g);
    }
    // 统计：任何时刻站位都不应出舞台
    const st = g.stats;
    for (const a of [p, e]) { st.minX = Math.min(st.minX, a.x); st.maxX = Math.max(st.maxX, a.x); }
    if (p.slide) st.maxSlide = Math.max(st.maxSlide, p.slide.done);

    // 特效和飘字过期
    for (let i = g.fx.length - 1; i >= 0; i--) if (g.t - g.fx[i].t0 > 700) g.fx.splice(i, 1);
    for (let i = g.floats.length - 1; i >= 0; i--) if (g.t - g.floats[i].t0 > 1100) g.floats.splice(i, 1);
  }
  // 命中的火花（弹飞的小火星）：其他事件也走同一入口
  function addFx(g, ev) {
    if (ev.type === 'parry' || ev.type === 'block' || ev.type === 'ding' || ev.type === 'tap') {
      // 火花顺着出枪的方向飞：架开和挡下是敌人出枪，其余是玩家出枪
      const att = ev.type === 'parry' || ev.type === 'block' ? g.e : g.p;
      g.fx.push({
        kind: ev.type === 'parry' ? 'parry' : 'spark', x: ev.x, y: ev.y, t0: ev.t,
        big: ev.type === 'parry', seed: ev.id, dir: att.face,
      });
    }
  }

  function advance(g, ms) {
    g.acc += ms;
    let n = 0;
    while (g.acc >= STEP && n++ < 600) {
      const before = g.eventId;
      tick(g, STEP);
      g.acc -= STEP;
      if (g.eventId > before) {
        for (const ev of g.events) if (ev.id > before) addFx(g, ev);
      }
    }
    if (n >= 600) g.acc = 0;
  }

  // 震屏：创伤值平方，噪声由累计游戏时间驱动
  function shakeOffset(g) {
    const s = g.trauma * g.trauma, t = g.t / 1000;
    return {
      x: 16 * s * (Math.sin(t * 61.3) * 0.6 + Math.sin(t * 37.1 + 1.3) * 0.4),
      y: 12 * s * (Math.sin(t * 53.7 + 0.7) * 0.6 + Math.sin(t * 29.9 + 2.1) * 0.4),
    };
  }

  function snapshot(g) {
    const pk = (a) => {
      const f = frameOf(a);
      return {
        x: Math.round(a.x * 10) / 10, face: a.face, act: a.act, clip: f.clip, frame: f.frame,
        freeze: Math.round(a.freeze), vul: isVul(a),
      };
    };
    return {
      t: Math.round(g.t), stage: g.stage, phase: g.phase, qi: g.qi, helmets: g.helmets,
      meter: g.meter, sub: g.sub ? g.sub.text : null, trauma: g.trauma,
      shi: g.shi, loose: g.loose, ult: g.ult ? g.ult.phase : null, ultStrike: g.ult ? g.ult.next : 0,
      charge: chargeBar(g),
      tutorial: g.tut ? g.tut.step : null, glow: g.tut ? g.tut.glow : null, timeScale: g.timeScale,
      p: pk(g.p), e: pk(g.e), z: g.z ? pk(g.z) : null, m: g.m ? pk(g.m) : null, stats: Object.assign({}, g.stats, { warnToHit: g.stats.warnToHit.length }),
    };
  }

  // ---------- 视角：用真实模拟推进到目标状态再定格 ----------
  function runUntil(g, driver, cond, maxMs) {
    let used = 0;
    while (used < maxMs && !cond(g)) {
      if (driver) driver.think(g);
      advance(g, STEP);
      used += STEP;
    }
    return cond(g);
  }
  function prepareView(g, view) {
    if (view === 'meng') {
      // 玩家站着不动，等孟良走近、开始预警
      runUntil(g, null, (s) => s.e.act === 'warn' && s.e.t >= 90, 30000);
    } else if (view === 'duel') {
      setupStage(g, 2, false);
      g.sub = null;
      g.calm = true;
      const d = { think(s) { s.held.right = s.e.x - s.p.x > 200; s.held.left = false; } };
      runUntil(g, d, (s) => s.e.x - s.p.x <= 200, 20000);
      g.held.right = false;
      runUntil(g, null, (s) => s.p.act === 'idle' && s.p.t > 700, 5000);
    } else if (view === 'teach3') {
      // 真实模拟：自动驾驶走完前两步，孟良慢慢举斧，在「按住架」那一刻定格（不替她按）
      const d = makeDriver('precise', 3, { tutStop: 'guard' });
      runUntil(g, d, (s) => s.tut && s.tut.step === 'guard' && s.tut.slow && s.e.act === 'warn' && chargeBar(s) && chargeBar(s).frac >= 0.55, 60000);
    } else if (view === 'open') {
      // 开场第一帧：三个人都在台上
      runUntil(g, null, (s) => s.t >= 250, 2000);
    } else if (view === 'act1') {
      // 第一场中段：孟良在出斧、杨宗保在门边看着
      const d = makeDriver('precise', 5);
      runUntil(g, d, (s) => s.stage === 1 && s.helmets <= 2 && s.e.act === 'attack' && s.e.t > 250, 120000);
    } else if (view === 'ult') {
      // 真实模拟：自动驾驶打到势满、放出大招，定格在第三枪出手那一刻
      const d = makeDriver('precise', 3);
      runUntil(g, d, (s) => s.ult && s.ult.phase === 'strikes' && s.ult.next >= 3, 120000);
    } else if (view === 'chain3') {
      // 真实模拟：精准档每次反击都接三连，定格在第三枪命中后的顿帧里
      const d = makeDriver('precise', 3, { chainP: 1 });
      runUntil(g, d, (s) => s.p.atk && s.p.atk.kind === 'heavy' && s.p.hitDone && s.p.freeze > 40, 120000);
    } else if (view === 'end') {
      const d = makeDriver('precise', 3);
      runUntil(g, d, (s) => s.phase === 'end' && s.endT > 1600, 600000);
    }
  }

  // ---------- 自动驾驶：测试和定格都用它 ----------
  const PROFILES = {
    precise: { react: 200, jit: 40, parry: 0.34, block: 0.25, dodge: 0.2, clash: 0.24, ignore: 0.04, miss: 0.12, chain: 0.75 },
    sloppy: { react: 360, jit: 100, parry: 0.4, block: 0.25, dodge: 0.1, clash: 0.16, ignore: 0.06, miss: 0.2, chain: 0.4 },
  };
  function gauss(r) {
    const u = Math.max(1e-9, r()), v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function makeDriver(skill, seed, opts) {
    opts = opts || {};
    const r = mulberry32((seed || 1) * 7919 + 13);
    const P = PROFILES[skill];
    const d = {
      skill, plan: null, seen: -1, counterAt: null, counterDone: false, relAt: -1, retryAt: -1,
      script: (opts.script || []).slice(), tutStop: opts.tutStop || null, flipArm: false, flipT: 0, tutSeen: -1, nextTap: 0, nextTap2: 0, chainLeft: 0, ultAt: -1, chainP: opts.chainP, chainArm: 0,
    };
    const keys = (g, l, rt) => { g.held.left = l; g.held.right = rt; };

    d.think = function (g) {
      const { p, e } = g;
      if (skill === 'reckless') return reckless(d, g, r);
      if (g.tut) return tutThink(d, g);
      if (g.phase === 'retry') {
        keys(g, false, false);
        if (d.retryAt < 0) d.retryAt = g.t + 600;
        if (g.t >= d.retryAt) { d.retryAt = -1; tap(g, 'attack', 80); }
        return;
      }
      if (g.phase !== 'play') { keys(g, false, false); d.plan = null; return; }
      const dst = Math.abs(e.x - p.x), toward = sign(e.x - p.x);
      if (d.relAt > 0 && g.t >= d.relAt) { input(g, 'guard', false); d.relAt = -1; }

      // 1. 敌人刚开始预警：定一个应对方案
      const newStrike = e.act === 'warn' || (e.act === 'attack' && e.chain && e.chain.n > 1 && e.t * e.rate < 150);
      if (newStrike && e.attackId !== d.seen) {
        d.seen = e.attackId;
        const hitAt = g.t + hitIn(e);
        const roll = r();
        let kind = 'parry';
        const c1 = P.ignore, c2 = c1 + P.parry, c3 = c2 + P.block, c4 = c3 + P.dodge;
        const clashP = g.stage === 2 ? P.clash : 0;
        if (roll < c1) kind = 'none';
        else if (roll < c2) kind = 'parry';
        else if (roll < c3) kind = 'block';
        else if (roll < c4) kind = 'dodge';
        else if (roll < c4 + clashP) kind = 'clash';
        else kind = 'parry';
        if (e.chain && r() < (d.skill === 'precise' ? 0.9 : 0.75)) kind = 'parry';   // 三连刺要逐枪架开
        if (d.script.length) kind = d.script.shift();
        const lead = { parry: 110, block: 420, dodge: 300, clash: 190, none: 0 }[kind];
        const late = g.t + P.react + gauss(r) * P.jit * 0.5;
        const at = Math.max(late, hitAt - lead + gauss(r) * P.jit);
        d.plan = { kind, at, hitAt, done: false };
      }
      // 2. 到点执行
      const pl = d.plan;
      if (pl && !pl.done && g.t >= pl.at) {
        pl.done = true;
        if (pl.kind === 'parry') { input(g, 'guard', true); d.relAt = g.t + 260; }
        else if (pl.kind === 'block') { input(g, 'guard', true); d.relAt = pl.hitAt + 130; }
        else if (pl.kind === 'dodge') { tap(g, 'dodge', 60); if (opts.flip) { d.flipArm = true; d.flipT = g.t; } }
        else if (pl.kind === 'clash' && dst < p.spec.reach + 110) tap(g, 'attack', 60);
      }
      // 3. 敌人进入收招硬直：反击
      if (isVul(e)) {
        if (d.counterAt === null) {
          d.counterAt = g.t + P.react + gauss(r) * P.jit * 0.6;
          d.counterSkip = r() < P.miss;
        }
        if (!d.counterDone && !d.counterSkip && g.t >= d.counterAt && dst < 330) {
          d.counterDone = true;
          tap(g, 'attack', 60);
          d.chainLeft = r() < (d.chainP != null ? d.chainP : P.chain) ? 2 : 0; d.chainArm = g.t;
        }
      } else { d.counterAt = null; d.counterDone = false; }

      // 3a. 闪完接一枪（翻身刺），示范里用
      if (d.flipArm) {
        if (p.act === 'dodge' && p.t >= p.tabs.jump.total * 0.55) { tap(g, 'attack', 50); d.flipArm = false; }
        else if (g.t - d.flipT > 900) d.flipArm = false;
      }
      // 3b. 连招：在上一枪的后半段再按
      if (d.chainLeft > 0) {
        if (p.act !== 'attack') { if (g.t - d.chainArm > 300) d.chainLeft = 0; }
        else if (p.atk && p.chainN < 3 && p.t * p.rate >= p.tabs.attack.total * 0.55 && g.t >= d.nextTap2) {
          tap(g, 'attack', 50); d.chainLeft--; d.nextTap2 = g.t + 220;
        }
      }
      // 3c. 势满了就放大招（K 和 J 同一刻按下）
      if (g.shi >= 100 && !g.ult && p.act !== 'hurt' && dst < 420) {
        if (d.ultAt < 0) d.ultAt = g.t + P.react + 100 + Math.abs(gauss(r)) * P.jit;
        if (g.t >= d.ultAt) {
          d.ultAt = -1;
          input(g, 'guard', true); input(g, 'attack', true);
          later(g, 70, () => { input(g, 'guard', false); input(g, 'attack', false); });
          return;
        }
      } else d.ultAt = -1;

      // 4. 平时保持距离
      const busy = p.act === 'attack' || p.act === 'dodge' || p.act === 'hurt' || p.act === 'guard';
      if (busy || (pl && !pl.done && pl.kind === 'dodge')) { keys(g, false, false); return; }
      const want = (g.stage === 1 ? 235 : 215) + (isVul(e) ? -60 : 0);
      if (dst > want + 30) keys(g, toward < 0, toward > 0);
      else if (dst < want - 50 && !isVul(e)) keys(g, toward > 0, toward < 0);
      else keys(g, false, false);
    };
    return d;
  }

  // 教学里的自动驾驶：每一步做对
  function tutThink(d, g) {
    const T = g.tut, p = g.p, e = g.e;
    const dst = Math.abs(e.x - p.x), toward = sign(e.x - p.x);
    g.held.left = g.held.right = false;
    if (g.phase !== 'play') return;
    if (T.step === 'walk') { if (dst > 225) { g.held.right = toward > 0; g.held.left = toward < 0; } }
    else if (T.step === 'stab') {
      if (g.t >= d.nextTap && dst <= 260 && (p.act === 'idle' || p.act === 'walk')) { tap(g, 'attack', 60); d.nextTap = g.t + 900; }
      else if (dst > 260) { g.held.right = toward > 0; g.held.left = toward < 0; }
    } else if (T.step === 'guard' || T.step === 'dodge') {
      const need = T.step === 'guard' ? (hitIn(e) != null && hitIn(e) <= 190) : e.t >= 250;
      if (T.slow && !T.pressed && need && d.tutSeen !== T.attempt && d.tutStop !== T.step) {
        d.tutSeen = T.attempt;
        if (T.step === 'guard') tap(g, 'guard', 300); else tap(g, 'dodge', 60);
      }
    } else if (T.step === 'punish') {
      if (isVul(e) && dst < 330 && g.t >= d.nextTap) { tap(g, 'attack', 60); d.nextTap = g.t + 1500; }
    } else if (T.step === 'chain') {
      if (dst > 230) { g.held.right = toward > 0; g.held.left = toward < 0; }
      else if (g.t >= d.nextTap && p.act !== 'attack' && p.act !== 'hurt') { tap(g, 'attack', 50); d.nextTap = g.t + 1500; }
      else if (p.act === 'attack' && p.atk && p.chainN < 3 && p.t * p.rate >= p.tabs.attack.total * 0.55 && g.t >= d.nextTap2) { tap(g, 'attack', 50); d.nextTap2 = g.t + 200; }
    }
  }

  // 示范用：独立的一局 + 精准档自动驾驶。先冲刺突刺、三连刺，再架开、闪开接翻身刺，最后势满放大招。
  // 示范是演示，所以大招前把势直接填满（她自己的局里要打出来）。
  function createDemo(clips, seed) {
    seed = seed || 11;
    const g = create(clips, { seed, touch: true, ultSeen: true });
    g.sub = null; g.e.cool = 6500;
    const base = makeDriver('precise', seed, { script: ['parry', 'dodge', 'parry', 'parry'], flip: true, chainP: 0 });
    const queue = ['chain', 'dash'];
    let nextAt = 600, ultDone = false, dash = null;
    const driver = {
      base,
      think(gg) {
        base.think(gg);
        const { p, e } = gg;
        if (gg.phase !== 'play') return;
        // 先演完连招和冲刺，孟良这段时间不出手
        if (queue.length || gg.t < nextAt) e.cool = Math.max(e.cool, 1500);
        const calm = (e.act === 'idle' || e.act === 'walk') && p.act === 'idle' && !isVul(e) && gg.t >= nextAt;
        // 冲刺：先按住方向跑起来超过 0.35 秒，再按 J
        if (dash) {
          gg.held.right = dash.dir > 0; gg.held.left = dash.dir < 0;
          gg.heldSince[dash.dir > 0 ? 'right' : 'left'] = dash.since;
          if (gg.t - dash.since >= 420 && p.act === 'walk') { tap(gg, 'attack', 50); dash = null; nextAt = gg.t + 1700; }
          else if (gg.t - dash.since > 1500) { dash = null; nextAt = gg.t + 800; }
          return;
        }
        if (queue.length && calm) {
          const k = queue.shift();
          if (k === 'dash') {
            if (Math.abs(e.x - p.x) > 200) dash = { dir: sign(e.x - p.x), since: gg.t };
            else { queue.unshift('dash'); nextAt = gg.t + 400; }
          } else {
            tap(gg, 'attack', 50); base.chainLeft = 2; base.chainArm = gg.t; nextAt = gg.t + 2200;
          }
        }
        if (!ultDone && gg.stats.parries >= 1 && gg.stats.flips >= 1 && p.act === 'idle' && !gg.ult && gg.helmets >= 1 && gg.t > 7000) {
          ultDone = true; gg.shi = 100; gg.shiFull = true; base.ultAt = -1;
        }
      },
    };
    return { g, driver };
  }

  // 莽撞档：只会往前冲、乱按出枪，从不架枪闪避
  function reckless(d, g, r) {
    const { p, e } = g;
    if (g.phase === 'retry') {
      g.held.left = g.held.right = false;
      if (d.retryAt < 0) d.retryAt = g.t + 500;
      if (g.t >= d.retryAt) { d.retryAt = -1; tap(g, 'attack', 80); }
      return;
    }
    if (g.phase !== 'play') { g.held.left = g.held.right = false; return; }
    const dst = Math.abs(e.x - p.x), toward = sign(e.x - p.x);
    if (dst > 150) { g.held.left = toward < 0; g.held.right = toward > 0; }
    else g.held.left = g.held.right = false;
    if (r() < 0.12) tap(g, 'attack', 40);
  }

  // 机器人跑整局：直到结尾或超时。返回用时（毫秒）。
  function playThrough(g, driver, maxMs) {
    let used = 0;
    while (used < maxMs && !(g.phase === 'end' && g.endT > 500)) {
      driver.think(g);
      advance(g, STEP);
      used += STEP;
    }
    return used;
  }

  return {
    STEP, W, H, GROUND, MIN_X, MAX_X, SPEC, HITSTOP_LIGHT, HITSTOP_HEAVY, PARRY_WINDOW, CLASH_WINDOW,
    QI_MAX, mulberry32, create, advance, tick, input, tap, snapshot, frameOf, hitIn, isVul,
    shakeOffset, prepareView, makeDriver, playThrough, runUntil, setupStage, guardActive,
    restartAll, retryStage, chargeBar, skipTutorial, tutStart, tutText, createDemo,
  };
});
