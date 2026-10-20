const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const STEP = C.STEP;

// A quiet street: one foe placed by hand in front of the player, no wave spawns.
function arena(kind = 'apo', z = 2.2, seed = 5) {
  const s = C.create({ seed }); s.phase = 'fight'; s.wave = 0;
  const e = C.spawn(s, kind, 0, z); e.cool = 99;
  Object.assign(s.player, { x: 0, z: 1, a: 0 });
  return [s, e];
}
const stepN = (s, inp, n) => { for (let i = 0; i < n; i++) C.step(s, typeof inp === 'function' ? inp(i) : inp, STEP); };
const secs = (t) => Math.round(t / STEP);
// Play one game with the autopilot; a loss restarts the current section (as the page does).
function playthrough(seed, skill) {
  const s = C.create({ seed }); C.start(s); const bot = C.makeBot(seed * 7, skill); let maxAtk = 0;
  while (s.t < 900) {
    while (s.phase === 'fight' && s.t < 900) { C.step(s, bot(s), STEP); maxAtk = Math.max(maxAtk, s.tokens.holders.length); }
    if (s.phase === 'lose') C.retry(s); else break;
  }
  return { s, maxAtk };
}

test('SPEC 7#1 精准档自动驾驶 3 个种子都一次打通，纯战斗时长 1–5 分钟', () => {
  for (const seed of [1, 2, 3]) {
    const { s } = playthrough(seed, 1);
    assert.equal(s.phase, 'win', `seed ${seed} 没打通（停在第 ${s.wave + 1} 段）`);
    assert.equal(s.retries || 0, 0, `seed ${seed} 精准档也要重来，难度超出规格`);
    assert.ok(s.t >= 60 && s.t <= 300, `seed ${seed} 用时 ${s.t.toFixed(0)} s，不在 1–5 分钟`);
    assert.equal(s.kills, C.WAVES.reduce((n, w) => n + w.foes.length, 0) + 2, `seed ${seed} 击倒数 ${s.kills} 与出场人数（含 Boss 二阶段叫来的 2 个）不符`);
  }
});

test('SPEC 7#1 手潮档（按键时机抖动）允许重来，但都能打完', () => {
  for (const seed of [1, 2, 3, 4]) {
    const { s } = playthrough(seed, .6);
    assert.equal(s.phase, 'win', `seed ${seed} 手潮档打不完`);
    assert.ok((s.retries || 0) <= 3, `seed ${seed} 重来 ${s.retries} 次，太难`);
  }
});

test('SPEC 7#2 拳连段只在输入窗内续上', () => {
  // 窗内再按：刺拳之后接直拳
  let [s] = arena(); s.enemies[0].hp = 999;
  C.step(s, { punch: true }, STEP);
  assert.equal(s.player.move, 'jab');
  stepN(s, {}, secs(C.MOVES.jab.dur + C.FEEL.hitstop.hit) + 2); // 打中有 0.05 s 顿帧，等刺拳真正收完
  assert.equal(s.player.state, 'idle');
  C.step(s, { punch: true }, STEP);
  assert.equal(s.player.move, 'cross', '输入窗内第二拳没接成直拳');
  // 窗外再按：重新从刺拳开始
  [s] = arena(); s.enemies[0].hp = 999;
  C.step(s, { punch: true }, STEP);
  stepN(s, {}, secs(C.MOVES.jab.dur + C.FEEL.hitstop.hit + C.FEEL.chainWindow + .1));
  C.step(s, { punch: true }, STEP);
  assert.equal(s.player.move, 'jab', '输入窗外按拳仍然续了连段');
});

test('SPEC 7#3 翻滚无敌时间内不掉血，无敌前后会掉', () => {
  const hitAt = (rollDelay) => {
    const [s, e] = arena('apo', 1.9); C.setState(e, 'attack', 'slap'); s.tokens.holders.push(e.id);
    const hitStep = secs(C.MOVES.slap.hit);
    stepN(s, (i) => (i === hitStep - rollDelay ? { roll: true } : {}), hitStep + 5);
    return s.stats.dmgTaken;
  };
  assert.equal(hitAt(secs(.2)), 0, '命中时刻落在无敌窗内，却掉了血');
  assert.ok(hitAt(0) > 0, '命中当帧才翻滚，不该无敌');
});

test('SPEC 7#4 敌方同时出招不超过 2 个', () => {
  for (const seed of [1, 2, 3]) {
    const { maxAtk } = playthrough(seed, .6);
    assert.ok(maxAtk <= C.FEEL.maxAttackers, `seed ${seed} 同时出招 ${maxAtk} 个`);
  }
});

test('格挡：正面 120° 内挡住只吃 20% 伤害，背后挡不住', () => {
  let [s, e] = arena('apo', 1.9); C.setState(e, 'attack', 'slap'); s.tokens.holders.push(e.id);
  stepN(s, { block: true }, secs(C.MOVES.slap.hit) + 3);
  assert.ok(Math.abs(s.stats.dmgTaken - C.MOVES.slap.dmg * (1 - C.FEEL.block.cut)) < 1e-9, '正面格挡减伤不对');
  // 只看 120° 正面判定：把格挡自动转身关掉，背后来的一下应全额吃到
  const turn = C.PLAYER.turn; C.PLAYER.turn = 0;
  try {
    [s, e] = arena('apo', 1.9); s.player.a = Math.PI; C.setState(e, 'attack', 'slap'); s.tokens.holders.push(e.id);
    stepN(s, { block: true }, secs(C.MOVES.slap.hit) + 3);
    assert.equal(s.stats.dmgTaken, C.MOVES.slap.dmg, '背后那一下也被挡住了');
  } finally { C.PLAYER.turn = turn; }
});

test('Boss 掉到一半血进二阶段并叫来两个阿婆，轻拳打不出硬直', () => {
  const [s, e] = arena('lionhead', 1.95); // 比它爱站的 1.7 m 近，出拳前它退半步也还在拳程里（不改 wave：逻辑会把人夹进那一段街）
  e.hp = e.maxHp / 2 + 1;
  const before = s.enemies.length;
  C.step(s, { punch: true }, STEP); stepN(s, {}, secs(C.MOVES.jab.hit) + 2);
  assert.notEqual(e.state, 'hurt', '轻拳把 Boss 打出了硬直');
  assert.ok(e.phase2, 'Boss 过半血没进二阶段');
  assert.equal(s.enemies.length, before + 2, '二阶段没叫来两个帮手');
});

test('输了从本段重来：满血、本段敌人复位、前面打完的不再出现', () => {
  const s = C.create({ seed: 2 }); C.start(s, { wave: 1 }); s.player.hp = 0; s.phase = 'lose';
  C.retry(s);
  assert.equal(s.player.hp, C.PLAYER.hp);
  assert.equal(C.alive(s).length, C.WAVES[1].foes.length);
  assert.equal(s.phase, 'fight');
});
