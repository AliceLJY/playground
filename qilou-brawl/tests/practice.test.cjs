const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');

function lesson(seed = 5) {
  const s = C.create({ seed }); C.start(s, { practice: true }); return s;
}
function advance(s, input, stop, seconds = 20) {
  const events = [];
  for (let i = 0; i < seconds / C.STEP; i++) {
    C.step(s, typeof input === 'function' ? input(s, i) : input, C.STEP);
    events.push(...s.events.map(e => ({ ...e, at: s.t })));
    if (stop(s, events)) return events;
  }
  assert.fail(`操作序列未达到目标：${JSON.stringify({ phase: s.phase, practice: s.practice })}`);
}
function block(s, count) {
  return advance(s, { block: true }, () => s.practice.blocks >= count);
}
function kick(s) {
  return advance(s, (_, i) => i === 0 ? { kick: true } : {}, () => s.phase === 'practice-win', 2);
}

test('街口讨教：跨 8 个种子真实挡/脚意图完成，确实发生三次格挡和一次还脚', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const s = lesson(seed), foe = s.enemies[0];
    assert.equal(s.enemies.length, 1); assert.equal(foe.kind, 'apo');
    const events = block(s, 3);
    const blocked = events.filter(e => e.type === 'blocked'), tells = events.filter(e => e.type === 'tell');
    assert.equal(blocked.length, 3, `seed ${seed} 空验格挡`);
    assert.equal(tells.length, 3, '每掌必须真的给预警');
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(blocked[i].at - tells[i].at - .32) <= C.STEP, '预警提前量应为 0.32 s ± 一步');
    assert.equal(events.filter(e => e.type === 'practice-ready').length, 1);
    assert.equal(s.phase, 'fight', '挡三掌仍需还一脚');
    assert.equal(kick(s).filter(e => e.type === 'practice-win').length, 1);
    assert.equal(s.stats.hitsLanded, 1); assert.equal(s.kills, 0);
    assert.equal(s.enemies[0], foe); assert.equal(foe.hp, C.KINDS.apo.hp);
    assert.equal(s.player.hp, C.PLAYER.hp);
    assert.ok(s.practice.elapsed < 60);
  }
});

test('街口讨教：提前拳脚实际命中也不跳关、不击倒阿婆；满三掌的空踢不算', () => {
  const s = lesson();
  const events = advance(s, (_, i) => i % 60 === 0 ? { kick: true } : i % 60 === 30 ? { punch: true } : {}, () => s.practice.elapsed >= 12);
  assert.ok(events.some(e => e.type === 'practice-early'), '样本必须真有提前命中');
  assert.equal(s.phase, 'fight'); assert.equal(s.enemies[0].hp, C.KINDS.apo.hp);
  block(s, 3);
  advance(s, { mx: -1 }, () => s.player.x <= -3.4, 3);
  const misses = advance(s, (_, i) => i === 0 ? { kick: true } : {}, (_, es) => es.some(e => e.type === 'whiff'), 2);
  assert.ok(misses.some(e => e.type === 'whiff')); assert.equal(s.phase, 'fight');
  advance(s, state => {
    const p = state.player, e = state.enemies[0], d = Math.hypot(e.x-p.x,e.z-p.z);
    return { mx: (e.x-p.x)/d, mz: (e.z-p.z)/d };
  }, () => Math.hypot(s.enemies[0].x-s.player.x,s.enemies[0].z-s.player.z) < 1.3, 5);
  kick(s);
});

test('街口讨教：先真挡两掌再漏挡，只清零计数，原地继续练', () => {
  for (const seed of [2, 5, 9]) {
    const s = lesson(seed), foe = s.enemies[0]; block(s, 2);
    const before = s.practice.elapsed;
    const events = advance(s, {}, (_, es) => es.some(e => e.type === 'practice-reset'));
    assert.ok(events.some(e => e.type === 'hurt'), '样本必须真的挨掌');
    assert.equal(s.practice.blocks, 0); assert.equal(s.phase, 'fight');
    assert.equal(s.player.hp, C.PLAYER.hp); assert.equal(s.stats.dmgTaken, 0);
    assert.ok(s.practice.elapsed > before); assert.equal(s.enemies[0], foe);
    assert.equal(s.enemies.length, 1); assert.equal(s.retries, undefined);
    assert.equal(block(s, 3).filter(e => e.type === 'blocked').length, 3);
    kick(s);
  }
});

test('街口讨教：莽撞不挡到 60 s 超时，能重新练', () => {
  const s = lesson();
  const events = advance(s, {}, () => s.phase !== 'fight', 61);
  assert.ok(events.some(e => e.type === 'hurt'), '莽撞档必须真有挨掌');
  assert.equal(s.phase, 'practice-timeout'); assert.equal(s.practice.blocks, 0);
  assert.ok(Math.abs(s.practice.elapsed - 60) <= C.STEP);
  assert.equal(s.player.hp, C.PLAYER.hp);
  C.start(s, { practice: true });
  assert.equal(s.practice.elapsed, 0); assert.equal(s.practice.blocks, 0); assert.equal(s.enemies.length, 1);
  block(s, 3); kick(s);
});

test('街口讨教：完成、超时或中途转正式擂台，等同全新默认开局', () => {
  for (const ending of ['win', 'timeout', 'exit']) {
    const s = lesson(7);
    if (ending === 'win') { block(s, 3); kick(s); }
    if (ending === 'timeout') advance(s, {}, () => s.phase !== 'fight', 61);
    if (ending === 'exit') block(s, 1);
    C.start(s);
    const fresh = C.create({ seed: 7 }); C.start(fresh);
    const plain = state => JSON.parse(JSON.stringify(state));
    assert.deepEqual(plain(s), plain(fresh), `${ending} 留下练招状态`);
    const bot = C.makeBot(49);
    for (let i = 0; i < 600; i++) {
      const input = bot(fresh); C.step(s, input, C.STEP); C.step(fresh, input, C.STEP);
      assert.deepEqual(plain(s), plain(fresh), `${ending} 影响正式玩法第 ${i} 帧`);
    }
  }
});
