const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const { STEP, FEEL, TARGETS } = C;
const start = () => ({ yaw: FEEL.startYaw, pitch: FEEL.startPitch, fov: FEEL.fovRest });

// Play to the end with the autopilot; `sigma` adds hand shake. Returns the state, events and when each target was first aimed at.
function play({ sigma = 0, seed = 1, order, limit = 120 } = {}) {
  const s = C.create(), rnd = C.rng(seed), shake = sigma ? C.shaker(sigma, rnd) : (a) => a;
  let aim = start(); const events = [], arrived = {};
  for (let i = 0; i < limit / STEP && s.phase !== 'done'; i++) {
    aim = C.autopilot(s, aim, STEP, { order });
    for (const g of TARGETS) if (!(g.id in arrived) && C.angle(aim.yaw, aim.pitch, g.yaw, g.pitch) < 0.5) arrived[g.id] = s.t;
    for (const e of C.step(s, shake(aim), STEP)) events.push({ ...e, t: s.t });
  }
  return { s, events, arrived };
}

test('精准档：自动驾驶找全四处并走完结尾', () => {
  const { s, events } = play();
  assert.equal(s.phase, 'done', '没走到结尾');
  assert.deepEqual(s.order.slice().sort(), TARGETS.map((g) => g.id).sort(), '四处没找全');
  assert.equal(events.filter((e) => e.type === 'ending').length, 1, '结尾应只触发一次');
});

test('手抖档（σ=4°）：每处到位后 3 秒内判定，四处找全', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const { s, events, arrived } = play({ sigma: 4, seed });
    assert.equal(s.phase, 'done', `种子 ${seed} 没走到结尾`);
    for (const e of events.filter((x) => x.type === 'found')) {
      const lag = e.t - arrived[e.id];
      assert.ok(lag <= 3, `种子 ${seed}：${e.id} 到位后 ${lag.toFixed(2)} s 才判定，超过 3 s（规格第 7 节第 1 条）`);
    }
  }
});

test('扫过不算：看 0.6 秒就移开，不判定', () => {
  const s = C.create(), gate = TARGETS.find((g) => g.id === 'gate');
  const ev = [];
  for (let i = 0; i < 0.6 / STEP; i++) ev.push(...C.step(s, { yaw: gate.yaw, pitch: gate.pitch }, STEP));
  for (let i = 0; i < 1.0 / STEP; i++) ev.push(...C.step(s, { yaw: -150, pitch: -20 }, STEP));
  for (let i = 0; i < 0.6 / STEP; i++) ev.push(...C.step(s, { yaw: gate.yaw, pitch: gate.pitch }, STEP));
  assert.equal(ev.filter((e) => e.type === 'found').length, 0, '两次 0.6 s 的扫视被累计成了一次看准');
  assert.ok(s.dwell.gate < FEEL.dwell);
});

test('每处只算一次，诗句写在各自的位置', () => {
  const { events } = play({ order: ['gate', 'back', 'far', 'path'] });
  const found = events.filter((e) => e.type === 'found');
  assert.equal(found.length, 4);
  assert.deepEqual(found.map((e) => e.id), ['gate', 'back', 'far', 'path'], '应按看的顺序判定');
  // 规格第 4 节的表：哪一处写第几句、写什么
  const SPEC = { path: [0, '衣上征尘杂酒痕'], far: [1, '远游无处不消魂'], back: [2, '此身合是诗人未'], gate: [3, '细雨骑驴入剑门'] };
  for (const e of found) {
    assert.equal(e.line, SPEC[e.id][0], `${e.id} 应写在第 ${SPEC[e.id][0] + 1} 句的位置`);
    assert.equal(e.text, SPEC[e.id][1], `${e.id} 的诗句不对`);
  }
  assert.deepEqual(found.map((e) => e.line).sort(), [0, 1, 2, 3], '四句的位置有重复或缺失');
  assert.equal(found.find((e) => e.id === 'back').note, '这一面，高剑父没有画');
});

test('卡住 25 秒给提示，提示指向最近的未找到处，找到后提示收起', () => {
  const s = C.create(); const ev = [];
  const look = { yaw: 100, pitch: 30 };          // 不对着任何目标
  for (let i = 0; i < 24.5 / STEP; i++) ev.push(...C.step(s, look, STEP));
  assert.equal(ev.filter((e) => e.type === 'hint').length, 0, '不到 25 秒就出了提示');
  for (let i = 0; i < 1 / STEP; i++) ev.push(...C.step(s, look, STEP));
  const hint = ev.find((e) => e.type === 'hint');
  assert.ok(hint, '25 秒后没出提示');
  const nearest = C.nearestUnfound(s, look);
  assert.equal(hint.id, nearest.id);
  assert.ok(!s.found[hint.id]);
  const g = TARGETS.find((x) => x.id === hint.id);
  for (let i = 0; i < 1.2 / STEP; i++) ev.push(...C.step(s, { yaw: g.yaw, pitch: g.pitch }, STEP));
  assert.ok(ev.some((e) => e.type === 'hintOff'), '找到后提示没收起');
});

test('四个目标彼此不重叠，且都在可看范围内', () => {
  for (const g of TARGETS) {
    assert.ok(g.pitch - 0 >= FEEL.pitchMin && g.pitch <= FEEL.pitchMax, `${g.id} 超出俯仰限位`);
  }
  for (let i = 0; i < TARGETS.length; i++) for (let j = i + 1; j < TARGETS.length; j++) {
    const a = TARGETS[i], b = TARGETS[j], d = C.angle(a.yaw, a.pitch, b.yaw, b.pitch);
    assert.ok(d > a.r + b.r, `${a.id} 与 ${b.id} 相距 ${d.toFixed(1)}°，不大于半径之和 ${a.r + b.r}°`);
  }
  // 开场朝向不应该一进来就判定任何一处
  const st = start();
  for (const g of TARGETS) assert.ok(C.angle(st.yaw, st.pitch, g.yaw, g.pitch) > g.r, `开场朝向就落在 ${g.id} 里`);
});

test('角度工具：偏航绕回与大圆夹角', () => {
  assert.equal(C.wrap(190), -170);
  assert.equal(C.wrap(-180), 180);
  assert.ok(Math.abs(C.angle(179, 0, -179, 0) - 2) < 1e-6);
  assert.ok(Math.abs(C.angle(0, 90, 123, 90)) < 1e-6, '正上方不该受偏航影响');
});
