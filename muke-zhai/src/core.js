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
  const MIN_GAP = 70;             // 两人身体至少隔开的距离

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

  // 动作名 → 图集动作名
  const CLIP_OF = {
    idle: 'idle', walk: 'walk', warn: 'attack', attack: 'attack', guard: 'guard',
    dodge: 'jump', hurt: 'hurt', down: 'hurt', defeat: 'defeat', victory: 'victory', daze: 'idle',
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
      path: 0,
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
    };
    g.rng = mulberry32(g.seed);
    g.p = makeActor(g, 'p', 'guiying', 300, 1);
    setupStage(g, opts.stage || 1, true);
    return g;
  }
  function newStats() {
    return {
      parries: 0, blocks: 0, clashes: 0, hitsTaken: 0, hitsLanded: 0, dings: 0,
      dodges: 0, helmetsLost: 0, retries: 0, restarts: 0, swings: 0,
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
    return ev;
  }
  function later(g, ms, fn) { g.script.push({ at: g.t + ms, fn }); }
  function addTrauma(g, v) { g.trauma = Math.min(1, g.trauma + v); }

  function setupStage(g, n, first) {
    g.stage = n; g.phase = 'play';
    g.qi = QI_MAX; g.helmets = 3; g.meter = 0;
    g.fade = 0; g.script.length = 0; g.fx.length = 0; g.floats.length = 0;
    g.finT = 0; g.finStep = 0; g.endT = -1; g.victoryAt = -1; g.dingCool = 0;
    g.buf.attack = g.buf.guard = g.buf.dodge = -9999;
    const p = g.p;
    resetActor(p, 300, 1);
    if (n === 1) {
      g.e = makeActor(g, 'e', 'mengliang', 700, -1);
      g.e.cool = 4800;
      if (first) say(g, '穆柯寨前，孟良来讨降龙木。', 3600);
    } else {
      g.e = makeActor(g, 'e', 'zongbao', 680, -1);
      g.e.cool = 3800;
      say(g, '杨宗保：降龙木，我是一定要取的。', 3400);
    }
  }
  function resetActor(a, x, face) {
    a.x = x; a.face = face; a.act = 'idle'; a.t = 0; a.rate = 1; a.freeze = 0; a.flash = 0;
    a.pushV = 0; a.invuln = 0; a.hitDone = false; a.vul = false; a.slide = null;
    a.travel = null; a.lock = 0; a.gRel = false; a.rt = 0;
  }
  function start(a, act) { a.act = act; a.t = 0; a.rate = 1; a.hitDone = false; a.slide = null; }

  // ---------- 输入 ----------
  function input(g, name, down) {
    if (name === 'left' || name === 'right') { g.held[name] = down; return; }
    if (name === 'guard') g.held.guard = down;
    if (!down) return;
    if (g.phase === 'retry') { retryStage(g); return; }
    if (g.phase === 'end' && g.endT > 1200) { restartAll(g); return; }
    g.buf[name] = g.t;
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
    return a.act === 'attack' && a.t >= a.tabs.attack.hitT + VUL_AFTER_HIT;
  }
  // 对手距离命中还有多久（预警 + 蓄力），没有在出招返回 null
  function hitIn(a) {
    if (a.act === 'warn') return a.spec.warn - a.t + a.tabs.attack.hitT;
    if (a.act === 'attack' && a.t < a.tabs.attack.hitT) return a.tabs.attack.hitT - a.t;
    return null;
  }
  const dist = (g) => Math.abs(g.e.x - g.p.x);

  // 站位限制：舞台范围，且两人不叠在一起（被挤的是敌人，贴墙时反过来）
  function fixPositions(g) {
    const { p, e } = g;
    p.x = clamp(p.x, MIN_X, MAX_X);
    e.x = clamp(e.x, MIN_X, MAX_X);
    const gap = Math.abs(e.x - p.x);
    if (gap < MIN_GAP) {
      const dir = e.x >= p.x ? 1 : -1;
      const want = p.x + dir * MIN_GAP;
      if (want >= MIN_X && want <= MAX_X) e.x = want;
      else p.x = e.x - dir * MIN_GAP;
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
    g.qi--; g.stats.hitsTaken++;
    start(p, 'hurt');
    p.invuln = 1000; p.flash = 90; p.vul = false;
    push(p, -sign(att.x - p.x), 0.27);
    stop(p, HITSTOP_HEAVY); stop(att, HITSTOP_HEAVY);
    const c = contact(g, att, p);
    emit(g, 'hurt', c.x, c.y, { qi: g.qi });
    addTrauma(g, 0.55);
    if (g.qi <= 0) {
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
    if (p.invuln > 0 || dodgeInvuln(p)) {
      if (dodgeInvuln(p)) g.stats.dodges++;
      emit(g, 'evade', p.x, GROUND - 120);
      return;
    }
    if (guardActive(p)) {
      const age = g.t - p.gPress;
      const mid = { x: (p.x + e.x) / 2 + p.face * 14, y: GROUND - 140 };
      if (age <= PARRY_WINDOW) {
        g.stats.parries++;
        stop(p, HITSTOP_LIGHT); stop(e, HITSTOP_LIGHT);
        // 被架开：敌人踉跄，进入可被打的状态
        start(e, 'hurt'); e.vul = true; e.rate = STAGGER_RATE; e.flash = 60;
        push(e, sign(e.x - p.x), 0.22);
        emit(g, 'parry', mid.x, mid.y);
        addTrauma(g, 0.25);
        if (g.stage === 2) addMeter(g, 12, e.x, GROUND - 270);
      } else {
        g.stats.blocks++;
        stop(p, HITSTOP_LIGHT); stop(e, HITSTOP_LIGHT);
        push(p, -sign(e.x - p.x), 0.2);
        emit(g, 'block', mid.x, mid.y);
        addTrauma(g, 0.15);
        if (g.stage === 2) addMeter(g, 6, e.x, GROUND - 270);
      }
      return;
    }
    playerHurt(g, e);
    g.fx.push({ kind: 'spark', x: c.x, y: c.y, t0: g.t, big: true, seed: g.eventId, dir: e.face });
  }

  // 玩家出手命中结算
  function playerHits(g) {
    if (g.phase !== 'play') return;
    const { p, e } = g;
    const c = contact(g, p, e);
    if (g.stage === 1) {
      if (isVul(e)) {
        g.helmets--; g.stats.helmetsLost++; g.stats.hitsLanded++;
        const last = g.helmets <= 0;
        stop(p, last ? HITSTOP_HEAVY : HITSTOP_LIGHT);
        stop(e, last ? HITSTOP_HEAVY : HITSTOP_LIGHT);
        e.flash = 90;
        emit(g, 'helmet', c.x, c.y, { left: g.helmets });
        addTrauma(g, last ? 0.7 : 0.35);
        g.fx.push({ kind: 'spark', x: c.x, y: c.y, t0: g.t, big: true, seed: g.eventId, dir: p.face });
        if (last) { startWin1(g); return; }
        start(e, 'hurt'); e.vul = false; e.rate = 1;
        push(e, sign(e.x - p.x), 0.3);
      } else if (!(e.act === 'hurt')) {
        g.stats.dings++;
        emit(g, 'ding', c.x, c.y);
        addTrauma(g, 0.1);
      }
      return;
    }
    // 第二场
    if (isVul(e)) {
      g.stats.hitsLanded++;
      stop(p, HITSTOP_LIGHT); stop(e, HITSTOP_LIGHT);
      e.flash = 80;
      emit(g, 'tap', c.x, c.y);
      addTrauma(g, 0.3);
      addMeter(g, 8, e.x, GROUND - 270);
      if (g.phase === 'play') { start(e, 'hurt'); e.vul = false; e.rate = 1; push(e, sign(e.x - p.x), 0.18); }
    } else if (e.act !== 'hurt') {
      g.stats.dings++;
      emit(g, 'ding', c.x, c.y);
      addTrauma(g, 0.12);
      // 只有他真架着枪时才加分，每次架枪只算一次，乱戳不涨心动
      if (e.act === 'guard' && !e.dinged) { e.dinged = true; addMeter(g, 3, e.x, GROUND - 270); }
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
    const gap = other.tabs.attack.hitT - other.t;
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
    g.e.cool = Math.max(g.e.cool, 900);
    emit(g, 'clash', x, GROUND - 150);
    g.fx.push({ kind: 'spark', x, y: GROUND - 150, t0: g.t, big: true, seed: g.eventId, dir: 1 });
    addTrauma(g, 0.5);
    addMeter(g, 15, x, GROUND - 270);
    return true;
  }

  // ---------- 出招 ----------
  function beginAttack(g, a, targetX) {
    a.attackId++;
    start(a, 'attack');
    // 出手吸附：转向对手，小滑步到够得着的距离，不冲过头
    const d = Math.abs(targetX - a.x);
    if (d < 360) a.face = sign(targetX - a.x);
    const want = a.spec.reach * 0.85;
    let slide = clamp(d - want, 0, isEnemy(a) ? 90 : 110);
    slide = Math.min(slide, Math.max(0, d - MIN_GAP));
    a.slide = { total: slide, done: 0, dur: a.tabs.attack.hitT, dir: a.face };
    g.stats.swings++;
    emit(g, 'swing', a.x, GROUND - 150, { who: a.id });
  }

  function slideStep(a, dt) {
    if (!a.slide) return;
    const s = a.slide;
    const frac = clamp(a.t / s.dur, 0, 1);
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
    if (!a.hitDone && a.t >= tab.hitT) {
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
      } else if (a.t >= tab.hitT + 100) {
        a.hitDone = true;
        emit(g, 'whiff', a.x, GROUND - 150, { who: a.id });
      }
    }
    if (a.t >= tab.total) { start(a, 'idle'); if (isEnemy(a)) a.cool = enemyCool(g, a); }
  }
  function enemyCool(g, a) {
    return a.who === 'mengliang' ? range(g, 2600, 3800) : range(g, 3000, 4400);
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
    return p.act === 'guard' && p.gRel && p.rt > 60;
  }

  function startDodge(g, p) {
    start(p, 'dodge');
    const dir = (g.held.right ? 1 : 0) - (g.held.left ? 1 : 0) || -sign(g.e.x - p.x);
    p.travel = { dir, total: 130, done: 0, dur: p.tabs.jump.total };
    emit(g, 'dodge', p.x, GROUND - 100);
  }
  function startGuard(g, p, pressT) {
    start(p, 'guard');
    if (g.phase === 'play' && dist(g) < 380) p.face = sign(g.e.x - p.x);
    p.gRel = false; p.rt = 0; p.gPress = pressT; p.gLimit = 0;
    emit(g, 'guard', p.x, GROUND - 100);
  }

  function updatePlayer(g, dt) {
    const p = g.p;
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
      if (p.t >= p.tabs.jump.total) start(p, 'idle');
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
        else beginAttack(g, p, g.e.x);
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
    if (e.freeze > 0) { e.freeze -= dt; return; }
    if (e.lock > 0) e.lock -= dt;
    e.t += dt;
    if (e.pushV) { e.x += e.pushV * dt; e.pushV *= 0.9; if (Math.abs(e.pushV) < 0.01) e.pushV = 0; }
    if (e.cool > 0) e.cool -= dt;
    const d = Math.abs(p.x - e.x);
    switch (e.act) {
      case 'hurt': {
        const tab = e.tabs.hurt;
        if (e.t * e.rate >= tab.total) { start(e, 'idle'); e.vul = false; e.cool = Math.max(e.cool, enemyCool(g, e) * 0.8); }
        break;
      }
      case 'warn':
        e.face = sign(p.x - e.x);
        if (e.t >= e.spec.warn) { const t0 = e.warnT0; beginAttack(g, e, p.x); e.warnT0 = t0; }
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
    if (e.who === 'zongbao' && rnd(g) < 0.28) {
      start(e, 'guard');
      e.gRel = false; e.rt = 0; e.guardHold = range(g, 500, 800); e.dinged = false;
      return;
    }
    start(e, 'warn');
    e.warnT0 = g.t;
    emit(g, 'warn', e.x, GROUND - 180, { who: e.who, hitIn: hitIn(e) });
  }

  // ---------- 过场：第一场收尾 ----------
  function startWin1(g) {
    const e = g.e;
    g.phase = 'win1';
    start(e, 'defeat');
    later(g, 900, () => say(g, '金盔留下，人可以走。', 2600));
    later(g, 3000, () => { g.phase = 'fade'; g.fadeDir = 1; });
  }

  // ---------- 过场：第二场收尾 ----------
  function startFinale(g) {
    const { p, e } = g;
    g.phase = 'finale'; g.finT = 0; g.finStep = 0;
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
    if (g.phase === 'finale' || g.phase === 'end') {
      if (g.phase === 'end') g.endT += dt;
      updateFinale(g, dt);
    } else {
      updatePlayer(g, dt);
      updateEnemy(g, dt, g.phase === 'play');
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
      p: pk(g.p), e: pk(g.e), stats: Object.assign({}, g.stats, { warnToHit: g.stats.warnToHit.length }),
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
    } else if (view === 'end') {
      const d = makeDriver('precise', 3);
      runUntil(g, d, (s) => s.phase === 'end' && s.endT > 1600, 600000);
    }
  }

  // ---------- 自动驾驶：测试和定格都用它 ----------
  const PROFILES = {
    precise: { react: 200, jit: 40, parry: 0.34, block: 0.25, dodge: 0.2, clash: 0.16, ignore: 0.04, miss: 0.12 },
    sloppy: { react: 380, jit: 110, parry: 0.3, block: 0.22, dodge: 0.1, clash: 0.1, ignore: 0.1, miss: 0.2 },
  };
  function gauss(r) {
    const u = Math.max(1e-9, r()), v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function makeDriver(skill, seed) {
    const r = mulberry32((seed || 1) * 7919 + 13);
    const P = PROFILES[skill];
    const d = { skill, plan: null, seen: -1, counterAt: null, counterDone: false, relAt: -1, retryAt: -1 };
    const keys = (g, l, rt) => { g.held.left = l; g.held.right = rt; };

    d.think = function (g) {
      const { p, e } = g;
      if (skill === 'reckless') return reckless(d, g, r);
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
      if (e.act === 'warn' && e.attackId !== d.seen) {
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
        else if (pl.kind === 'dodge') tap(g, 'dodge', 60);
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
        }
      } else { d.counterAt = null; d.counterDone = false; }

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
    restartAll, retryStage,
  };
});
