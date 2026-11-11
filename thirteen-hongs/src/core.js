// 十三行江岸：纯逻辑（布局、碰撞、行人、船、名场面）。不依赖 three，可在 Node 里无头跑。
// 坐标：x 向东为正，z 向南为正（江在南）；码头岸线在 z=0，商馆立面在 z=FRONT。单位米。

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const WATER_Y = -1.5;
export const FRONT = -62;
export const BOUND = { x0: -150, x1: 147.5, z0: FRONT + 0.6, z1: -0.5 };

// 由西到东（画面从左到右）。排列据维基百科 Thirteen Factories 的表；立面样式除法兰西馆（檐廊）
// 与新英国馆（门廊）外都是示意。旗只挂约 1805 年玻璃画题注里点到的六国。
const W = 21;
const DEF = [
  ['danish', '丹麦馆', '黄旗行', 'dk', 'arcade', 2, '#ece5d3'],
  ['spanish', '西班牙馆', '大吕宋行', 'es', 'arcade', 2, '#e9d7b4'],
  ['french', '法兰西馆', '高公行', null, 'veranda', 2, '#efe9da'],
  ['mingqua', '明官馆', '中和行', null, 'hong', 2, '#a3a39b'],
  ['@old-china', '靖远街', 9, -136],
  ['american', '美国馆', '广源行', 'us', 'arcade', 2, '#f0ead9'],
  ['paoushun', '宝顺馆', '宝顺行', null, 'hong', 2, '#9c9d97'],
  ['imperial', '帝国馆', '孖鹰行', null, 'arcade', 3, '#ead9bd'],
  ['swedish', '瑞典馆', '瑞行', 'se', 'veranda', 2, '#eee7d6'],
  ['old-english', '旧英国馆', '隆顺行', null, 'arcade', 3, '#e6dfcd'],
  ['chowchow', '炒炒馆', '丰泰行', null, 'hong', 2, '#a7a69c'],
  ['@hog', '新豆栏', 5, -112],
  ['new-english', '新英国馆', '保和行', 'gb', 'portico', 2, '#f1ecdf'],
  ['dutch', '荷兰馆', '集义行', 'nl', 'veranda', 2, '#ecdcc0'],
  ['creek', '小溪馆', '怡和行', null, 'arcade', 2, '#e8e1cf'],
];
export const FACTORIES = [];
export const LANES = [];
{
  let total = 0;
  for (const d of DEF) total += d[0][0] === '@' ? d[2] : W;
  let x = -total / 2;
  for (const d of DEF) {
    if (d[0][0] === '@') {
      LANES.push({ id: d[0].slice(1), cn: d[1], x0: x, x1: x + d[2], cx: x + d[2] / 2, zEnd: d[3] });
      x += d[2];
    } else {
      FACTORIES.push({ id: d[0], cn: d[1], hong: d[2], flag: d[3], style: d[4], storeys: d[5], wall: d[6], x0: x, x1: x + W, cx: x + W / 2 });
      x += W;
    }
  }
}
const F = id => FACTORIES.find(f => f.id === id);

// ---------- 障碍与可走范围 ----------
export const OBST = [];
const ob = (x0, x1, z0, z1, tag) => OBST.push({ x0, x1, z0, z1, tag });
for (const f of FACTORIES) ob(f.x0, f.x1, -230, FRONT, 'b:' + f.id);
ob(-230, BOUND.x0, -230, 0, 'west-block');
export const GARDEN = { x0: F('new-english').x0 + 1.5, x1: F('dutch').x1 - 1.5, z0: FRONT, z1: -38 };
ob(GARDEN.x0, GARDEN.x1, GARDEN.z0, GARDEN.z1, 'garden');
export const YARDS = [
  { id: 'tea', x0: 33, x1: 37.6, z0: -14, z1: -4, goods: 'tea' },
  { id: 'tea2', x0: -10, x1: 1, z0: -33, z1: -26, goods: 'tea' },
  { id: 'porcelain', x0: -137, x1: -125, z0: -26, z1: -18, goods: 'crate' },
  { id: 'silk', x0: 57, x1: 66, z0: -49, z1: -43, goods: 'bale' },
  { id: 'casks', x0: 128, x1: 136, z0: -12, z1: -6, goods: 'cask' },
];
for (const y of YARDS) ob(y.x0, y.x1, y.z0, y.z1, 'yard:' + y.id);
export const SCALE = { x: 46.5, z: -12 };
ob(SCALE.x - 3.1, SCALE.x + 3.1, SCALE.z - 4, SCALE.z + 4, 'scale');
export const SHED = { x0: -25, x1: -14, z0: -12, z1: -5.5 };
ob(SHED.x0, SHED.x1, SHED.z0, SHED.z1, 'shed');
export const STALLS = [
  { x: -100, z: -11, goods: 'fruit' }, { x: -70, z: -33, goods: 'tea' },
  { x: 71, z: -9, goods: 'congee' }, { x: 14, z: -47, goods: 'fan' },
  { x: 118, z: -22, goods: 'barber' }, { x: -44, z: -8, goods: 'easel' },
  { x: -118, z: -44, goods: 'rest' }, { x: 70, z: -33, goods: 'sailors' },
];
for (const s of STALLS) ob(s.x - 2.4, s.x + 2.4, s.z - 2, s.z + 2, 'stall:' + s.goods);
export const POLES = FACTORIES.filter(f => f.flag).map(f => ({ x: f.cx, z: -24, flag: f.flag, id: f.id }));
for (const p of POLES) ob(p.x - 0.7, p.x + 0.7, p.z - 0.7, p.z + 0.7, 'pole');

export const JETTIES = [{ x0: 38, x1: 42, z1: 14.2 }, { x0: -63, x1: -59.6, z1: 10 }];
export const STEPS = [{ x0: -92, x1: -80, z1: 4.2 }, { x0: 6, x1: 18, z1: 4.2 }, { x0: 100, x1: 112, z1: 4.2 }];

export function groundY(x, z) {
  if (z > 0) for (const s of STEPS) if (x >= s.x0 && x <= s.x1) return Math.max(-1.3, -z * 0.31);
  return 0;
}
function inAllowed(x, z, r) {
  if (x >= BOUND.x0 + r && x <= BOUND.x1 - r && z >= BOUND.z0 + r && z <= BOUND.z1) return true;
  for (const l of LANES) if (x >= l.x0 + r && x <= l.x1 - r && z >= l.zEnd + r && z <= FRONT + 1.2) return true;
  for (const j of JETTIES) if (x >= j.x0 + r && x <= j.x1 - r && z > BOUND.z1 - 0.2 && z <= j.z1 - r) return true;
  for (const s of STEPS) if (x >= s.x0 + r && x <= s.x1 - r && z > BOUND.z1 - 0.2 && z <= s.z1) return true;
  return false;
}
export function hitsObstacle(x, z, r = 0) {
  for (const o of OBST) if (x > o.x0 - r && x < o.x1 + r && z > o.z0 - r && z < o.z1 + r) return o;
  return null;
}
export function walkable(x, z, r = 0.4) { return inAllowed(x, z, r) && !hitsObstacle(x, z, r); }
// 第一人称移动：两轴分开试，贴墙时能沿墙滑
export function moveWalker(x, z, dx, dz, r = 0.4) {
  if (walkable(x + dx, z + dz, r)) return { x: x + dx, z: z + dz, hit: false };
  if (walkable(x + dx, z, r)) return { x: x + dx, z, hit: true };
  if (walkable(x, z + dz, r)) return { x, z: z + dz, hit: true };
  return { x, z, hit: true };
}

// ---------- 行人路网 ----------
function segClear(a, b, r) {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (hitsObstacle(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, r)) return false;
  }
  return true;
}
export function buildGraph() {
  const INF = 2.6;
  let xs = [];
  for (let x = -145; x <= 145; x += 11.6) xs.push(x);
  for (const l of LANES) { xs = xs.filter(x => Math.abs(x - l.cx) > 5); xs.push(l.cx); }
  xs.sort((a, b) => a - b);
  const zs = [-55, -45, -34, -17, -4.5];
  const nodes = [], grid = new Map();
  xs.forEach((x, i) => zs.forEach((z, j) => {
    if (hitsObstacle(x, z, INF)) return;
    const n = { id: nodes.length, x, z, off: 2, nb: [] };
    nodes.push(n); grid.set(i + ',' + j, n);
  }));
  const link = (a, b) => { if (a && b && !a.nb.includes(b.id)) { a.nb.push(b.id); b.nb.push(a.id); } };
  xs.forEach((x, i) => zs.forEach((z, j) => {
    const a = grid.get(i + ',' + j); if (!a) return;
    const r = grid.get((i + 1) + ',' + j), d = grid.get(i + ',' + (j + 1));
    if (r && segClear(a, r, INF)) link(a, r);
    if (d && segClear(a, d, INF)) link(a, d);
  }));
  for (const l of LANES) {
    const i = xs.indexOf(l.cx);
    let prev = grid.get(i + ',0');
    const off = Math.max(0.5, (l.x1 - l.x0) / 2 - 1.6);
    for (let z = FRONT - 6; z > l.zEnd + 4; z -= 14) {
      const n = { id: nodes.length, x: l.cx, z, off, nb: [], lane: l.id };
      nodes.push(n); link(prev, n); prev = n;
    }
  }
  return nodes;
}

// ---------- 路径（闭合或开口的 Catmull-Rom，按弧长取点） ----------
export function makePath(pts, closed = false) {
  const P = i => { const n = pts.length; return closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]; };
  const segs = closed ? pts.length : pts.length - 1, S = 24;
  const xs = [], zs = [], ds = [0];
  for (let s = 0; s < segs; s++) for (let k = 0; k < S; k++) {
    const t = k / S, p0 = P(s - 1), p1 = P(s), p2 = P(s + 1), p3 = P(s + 2);
    const c = (a, b, c2, d) => 0.5 * ((2 * b) + (-a + c2) * t + (2 * a - 5 * b + 4 * c2 - d) * t * t + (-a + 3 * b - 3 * c2 + d) * t * t * t);
    xs.push(c(p0[0], p1[0], p2[0], p3[0])); zs.push(c(p0[1], p1[1], p2[1], p3[1]));
  }
  const last = closed ? pts[0] : pts[pts.length - 1];
  xs.push(last[0]); zs.push(last[1]);
  for (let i = 1; i < xs.length; i++) ds.push(ds[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]));
  const len = ds[ds.length - 1];
  return {
    len, closed,
    at(d) {
      d = closed ? ((d % len) + len) % len : Math.max(0, Math.min(len, d));
      let lo = 0, hi = ds.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ds[m] <= d) lo = m; else hi = m; }
      const t = (d - ds[lo]) / Math.max(1e-6, ds[hi] - ds[lo]);
      return { x: xs[lo] + (xs[hi] - xs[lo]) * t, z: zs[lo] + (zs[hi] - zs[lo]) * t, h: Math.atan2(xs[hi] - xs[lo], zs[hi] - zs[lo]) };
    },
  };
}

// ---------- 步态：脚落地后钉在地上，身体从它上面走过去 ----------
// 一个完整步态周期（左右各一步）身体前进 cycle 米；每只脚半个周期着地、半个周期摆动。
export const GAIT = { cycle: 1.25, hip: 0.92, thigh: 0.46, shin: 0.45, ankle: 0.05, lift: 0.1 };
export const PHASE_PER_M = 2 * Math.PI / GAIT.cycle;
// 脚踝相对胯的前后位置 f（身体坐标，向前为正）与离地高度；stride 是半个周期身体走过的距离
export function footAt(phase, leg, stride = GAIT.cycle / 2) {
  let u = (phase / (2 * Math.PI) + leg * 0.5) % 1; if (u < 0) u += 1;
  if (u < 0.5) return { f: stride / 2 - stride * (u / 0.5), lift: 0, stance: true };
  const v = (u - 0.5) / 0.5, s = v * v * (3 - 2 * v);
  return { f: -stride / 2 + stride * s, lift: GAIT.lift * Math.sin(Math.PI * v), stance: false };
}
// 身体的起伏：让着地那条腿几乎伸直（脚在正下方时人最高，两脚换步时最低），像人走路而不是蹲着走
export function gaitY(phase, stride = GAIT.cycle / 2) {
  const a = footAt(phase, 0, stride), f = a.stance ? a.f : footAt(phase, 1, stride).f, R = GAIT.thigh + GAIT.shin - 0.012;
  return Math.sqrt(R * R - f * f) + GAIT.ankle - GAIT.hip;
}
// 两段腿的反解：给脚踝相对胯的前后 f 与垂直距离 h，求大腿转角 a 与膝盖弯角 b（约定同 people.js 的 limb）
export function legIK(f, h) {
  const L1 = GAIT.thigh, L2 = GAIT.shin, d = Math.min(Math.hypot(f, h), L1 + L2 - 0.004);
  const g = Math.atan2(f, h), al = Math.acos((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)), k = Math.acos((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2));
  return { a: -(g + al), b: Math.PI - k };
}

// 换动作的过渡：姿势参数每帧按指数向目标靠（与帧率无关），停步、起步、放下箱子不再一帧跳过去
export const POSE_RATE = 11;
export function ease(cur, target, dt, rate = POSE_RATE) { return cur + (target - cur) * (1 - Math.exp(-dt * rate)); }

// ---------- 人物长相 ----------
// 脸图集的八格：0 青年 1 八字胡 2 花白长须 3 僧 4 深发洋人 5 浅发洋人 6 妇人 7 日晒胡茬；衣服图集的八格见 skins.js
const FACE = { official: [1, 2, 1], merchant: [0, 1, 1, 2], linguist: [0, 1], clerk: [0, 1, 2], coolie: [0, 7, 7], hawker: [7, 1, 2], monk: [3], foreigner: [4, 5], sailor: [4, 5, 5], boatwoman: [6] };
const CLOTH = { linguist: 0, clerk: 0, merchant: 1, coolie: 2, hawker: 2, foreigner: 3, sailor: 4, monk: 5, official: 6, boatwoman: 7 };
const SKIN = ['#c99a6b', '#b98558', '#d2a877', '#a9774c'], PALE = ['#e2b998', '#d9ad8c'];
const HAIRF = ['#3a2a1c', '#6b4a2a', '#8a6a3a', '#2a2622', '#a08a6a'];
const LOOKS = {
  official: r => ({ skin: pick(r, SKIN), top: '#1b2748', bottom: '#e6e0d2', gown: pick(r, ['#1f2f5a', '#23325e', '#2a2f52']), hat: 'official', hatColor: '#e9dfc4', queue: true, prop: 'badge', propColor: '#c9a24a' }),
  monk: r => ({ skin: pick(r, SKIN), top: '#8a7a55', bottom: '#d8d2c2', gown: pick(r, ['#8a6f3a', '#7d7468', '#9a7a48']), hat: null, hatColor: '#000', queue: false, hairStyle: 'none', prop: 'staff', propColor: '#6b5540' }),
  coolie: r => ({ skin: pick(r, SKIN), top: pick(r, ['#3d5a80', '#56697a', '#7a6a55', '#4a5a4c', '#8a7a62', '#2f4763']), bottom: pick(r, ['#2c3440', '#4a4138', '#3a4a5c']), gown: null, hat: r() < 0.75 ? 'cone' : null, hatColor: '#c9b27a', queue: true }),
  merchant: r => ({ skin: pick(r, SKIN), top: pick(r, ['#1e2a3c', '#2a2230', '#23302a']), bottom: '#e6e0d2', gown: pick(r, ['#2f4a6b', '#5a3e6b', '#3f5d4a', '#7b5a36', '#6b2f3a']), hat: 'cap', hatColor: '#15151a', queue: true }),
  linguist: r => ({ skin: pick(r, SKIN), top: '#5d6c78', bottom: '#e6e0d2', gown: pick(r, ['#6d7f8c', '#7d8a7a', '#8a8072']), hat: 'cap', hatColor: '#1c1c22', queue: true }),
  clerk: r => ({ skin: pick(r, SKIN), top: '#6a6f73', bottom: '#d8d2c2', gown: pick(r, ['#83898c', '#9a9282']), hat: r() < 0.5 ? 'cap' : null, hatColor: '#1c1c22', queue: true }),
  foreigner: r => ({ skin: pick(r, PALE), top: pick(r, ['#1f2a44', '#3a2a22', '#2d4a3a', '#4a2a2e', '#26262c']), bottom: pick(r, ['#ebe5d3', '#d9cfb8', '#c9bfa4']), gown: null, hat: 'top', hatColor: pick(r, ['#17171b', '#3b2c22', '#8a8676']), queue: false }),
  sailor: r => ({ skin: pick(r, PALE.concat(SKIN[0])), top: pick(r, ['#2c4f7c', '#3b6a9a', '#e3ddcc']), bottom: '#e9e3d2', gown: null, hat: 'straw', hatColor: '#d9c58c', queue: false }),
  hawker: r => ({ skin: pick(r, SKIN), top: pick(r, ['#6f6250', '#4f6170', '#855f45']), bottom: '#3a3530', gown: null, hat: 'cone', hatColor: '#bfa76d', queue: true }),
  boatwoman: r => ({ skin: pick(r, SKIN), top: pick(r, ['#27405e', '#1f3550', '#34506c']), bottom: '#1d2a3a', gown: null, hat: r() < 0.7 ? 'cone' : 'scarf', hatColor: r() < 0.5 ? '#c4ad73' : '#7a2f2f', queue: false }),
};
function pick(r, a) { return a[Math.floor(r() * a.length)]; }
function makeAgent(sim, kind, o = {}) {
  const r = sim.rand;
  const a = Object.assign({
    id: sim.agents.length, kind, look: LOOKS[kind](r), scale: 0.93 + r() * 0.14, girth: (kind === 'merchant' || kind === 'official' ? 1.04 : 0.9) + r() * 0.2,
    x: 0, z: 0, h: 0, phase: r() * 6.28, pose: 'stand', carry: null, speed: 0, boat: -1, lx: 0, ly: 0, lz: 0, lh: 0, moved: 0,
  }, o);
  const L = a.look;
  if (!L.hairStyle) L.hairStyle = L.queue ? 'queue' : kind === 'boatwoman' ? 'bun' : 'short';
  if (kind === 'foreigner' || kind === 'sailor') L.hair = pick(r, HAIRF);
  L.face = pick(r, FACE[kind]); L.cloth = CLOTH[kind];
  if (L.face === 2) L.hair = '#8a867e';
  if (a.pose === 'write') { L.prop = 'book'; L.propColor = '#e8e0cc'; }
  sim.agents.push(a);
  return a;
}

// ---------- 名场面：茶箱落艇 ----------
export const STAGES = ['wait', 'arrive', 'inspect', 'load', 'hoist', 'depart'];
export const STAGE_CN = { wait: '候艇', arrive: '茶艇靠泊', inspect: '验货过秤', load: '挑夫落货', hoist: '升帆', depart: '开往黄埔' };
export const EVENT = {
  chests: 15, porters: 5, wait: 8, inspect: 9, hoist: 6,
  berth: { x: 45, z: 17.4, h: -Math.PI / 2 },
  pick: { x: 38.5, z: -8 },
  loop: [[40.7, -3.5], [40.7, 13.5], [39.3, 13.5], [39.3, -3.5]],
};
const ARRIVE = makePath([[235, 64], [150, 50], [95, 30], [62, 18.6], [45, 17.4]]);
const DEPART = makePath([[45, 17.4], [18, 19], [-2, 34], [14, 56], [90, 70], [200, 82], [350, 96]]);
const WHERE = { home: i => ({ x: 38.7, z: -15.6 - i * 1.3 }) };

function stepEvent(sim, dt) {
  const e = sim.event, b = sim.boats[0];
  e.t += dt;
  if (e.fly) { e.fly.t += dt; if (e.fly.t >= e.fly.dur) e.fly = null; }
  sim.agents[b.crew[1]].pose = e.fly ? 'catch' : e.stage === 'load' ? 'ready' : 'stand';
  const go = s => { e.stage = s; e.t = 0; e.log.push(s); };
  if (e.stage === 'wait') {
    b.hidden = true;
    if (e.t >= EVENT.wait) { go('arrive'); b.hidden = false; b.d = 0; b.sail = 0.55; }
  } else if (e.stage === 'arrive') {
    const left = ARRIVE.len - b.d, v = Math.max(0.5, Math.min(4.4, left * 0.22 + 0.4));
    b.d = Math.min(ARRIVE.len, b.d + v * dt);
    b.sail = Math.max(0, Math.min(0.55, left / 60));
    Object.assign(b, ARRIVE.at(b.d));
    if (left < 6) b.h = lerpAngle(b.h, EVENT.berth.h, 1 - left / 6);
    if (left <= 0.02) { Object.assign(b, EVENT.berth); go('inspect'); }
  } else if (e.stage === 'inspect') {
    if (e.t >= EVENT.inspect) { go('load'); sim.porters.forEach((p, i) => { p.ev = { state: 'delay', t: i * 2.6, wp: 0 }; }); }
  } else if (e.stage === 'load') {
    let home = 0;
    for (const p of sim.porters) if (stepPorter(sim, p, dt)) home++;
    if (e.loaded >= EVENT.chests && home === sim.porters.length) go('hoist');
  } else if (e.stage === 'hoist') {
    b.sail = Math.min(1, e.t / (EVENT.hoist - 1));
    if (e.t >= EVENT.hoist) { go('depart'); b.d = 0; }
  } else if (e.stage === 'depart') {
    const v = Math.min(5.2, 0.6 + e.t * 0.5);
    b.d += v * dt;
    Object.assign(b, DEPART.at(b.d));
    if (b.d >= DEPART.len) { e.cycles++; e.loaded = 0; e.picked = 0; b.sail = 0; b.hidden = true; go('wait'); }
  }
}
function lerpAngle(a, b, t) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; }
function walkTo(a, tx, tz, v, dt) {
  const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
  if (d < 0.05) return true;
  const s = Math.min(d, v * dt);
  a.x += dx / d * s; a.z += dz / d * s; a.h = lerpAngle(a.h, Math.atan2(dx, dz), Math.min(1, dt * 10));
  a.phase += s * PHASE_PER_M; a.moved += s;
  return s >= d - 1e-6;
}
// 返回 true 表示这名挑夫已回原位歇着
function stepPorter(sim, p, dt) {
  const e = sim.event, ev = p.ev, V = 1.9;
  if (ev.state === 'delay') { ev.t -= dt; if (ev.t <= 0) ev.state = 'toPick'; return false; }
  if (ev.state === 'toPick') {
    p.pose = 'walk'; p.carry = null;
    if (walkTo(p, EVENT.pick.x, EVENT.pick.z, V, dt)) {
      if (e.picked >= EVENT.chests) ev.state = 'goHome'; else { e.picked++; ev.state = 'lift'; ev.t = 0.8; }
    }
    return false;
  }
  if (ev.state === 'lift') { p.pose = 'stand'; p.h = lerpAngle(p.h, -Math.PI / 2, 0.2); ev.t -= dt; if (ev.t <= 0) { p.carry = 'chest'; ev.state = 'out'; ev.wp = 0; } return false; }
  if (ev.state === 'out') {
    p.pose = 'carry';
    const w = EVENT.loop[ev.wp];
    if (walkTo(p, w[0], w[1], V, dt)) { ev.wp++; if (ev.wp === 2) { ev.state = 'drop'; ev.t = 1.0; } }
    return false;
  }
  if (ev.state === 'drop') {   // 走到栈桥头，转身朝艇，把箱子递过去：先放低，再脱手，艇上的人接住码好
    p.pose = 'hand'; p.h = lerpAngle(p.h, 0, 0.25); ev.t -= dt;
    if (ev.t <= 0.55 && p.carry) { p.carry = null; e.fly = { t: 0, dur: 0.55, x: p.x, z: p.z + 0.5, slot: e.loaded }; }
    if (ev.t <= 0) { e.loaded++; e.lastDrop = sim.t; ev.state = 'back'; }
    return false;
  }
  if (ev.state === 'back') {
    p.pose = 'walk';
    const w = EVENT.loop[ev.wp];
    if (walkTo(p, w[0], w[1], V, dt)) { ev.wp++; if (ev.wp >= EVENT.loop.length) ev.state = 'toPick'; }
    return false;
  }
  if (ev.state === 'goHome') {
    p.pose = 'walk';
    const hm = WHERE.home(p.slot);
    if (walkTo(p, hm.x, hm.z, 1.4, dt)) { ev.state = 'home'; p.pose = p.slot % 2 ? 'sit' : 'stand'; p.h = Math.PI / 2; }
    return false;
  }
  return true;
}

// ---------- 船 ----------
export const DECK = { sampan: 0.32, chop: 0.95, flower: 1.05, junk: 2.3, ferry: 0.5, sedan: 0 };
function addBoat(sim, type, o) {
  const b = Object.assign({ id: sim.boats.length, type, x: 0, z: 0, h: 0, d: 0, speed: 0, path: null, sail: 0, hidden: false, bob: sim.rand() * 6.28, crew: [] }, o);
  sim.boats.push(b);
  return b;
}
function crew(sim, b, kind, lx, lz, lh, pose) {
  const a = makeAgent(sim, kind, { boat: b.id, lx, lz, lh, ly: DECK[b.type], pose });
  b.crew.push(a.id);
  return a;
}

export function createSim(seed = 1805, crowd = 1) {
  const sim = { seed, crowd, t: 0, rand: rng(seed), agents: [], boats: [], porters: [], walkers: [], follow: {}, graph: buildGraph(), event: { stage: 'wait', fly: null, t: 0, loaded: 0, picked: 0, cycles: 0, lastDrop: -99, log: ['wait'] } };
  const r = sim.rand;

  // 0 号：名场面的茶艇（西瓜扁）
  const tea = addBoat(sim, 'chop', { x: 235, z: 64, h: -1.4, hidden: true });
  crew(sim, tea, 'boatwoman', 0.3, -7.3, 0.2, 'scull'); crew(sim, tea, 'coolie', -1.45, 4.3, -Math.PI / 2, 'stand');
  sim.follow.tea = { label: '茶艇', boat: 0, note: '西瓜扁 · 运茶驳艇，装满开往黄埔' };

  // 来往的艇
  const loops = [
    ['sampan', [[-120, 22], [-40, 30], [60, 27], [130, 40], [60, 60], [-60, 58]], 1.5],
    ['sampan', [[0, 22], [30, 150], [10, 292], [-30, 292], [-44, 150], [-22, 26]], 1.7],
    ['sampan', [[112, 20], [180, 60], [90, 110], [-10, 80], [44, 34]], 1.3],
    ['sampan', [[-150, 44], [-225, 92], [-120, 140], [-40, 100], [-92, 48]], 1.4],
    ['sampan', [[160, 30], [260, 44], [300, 120], [180, 130], [120, 70]], 1.2],
    ['ferry', [[-84, 9], [-70, 150], [-80, 290], [-120, 290], [-128, 150], [-98, 14]], 1.6],
    ['junk', [[-520, 185], [0, 168], [520, 200], [540, 250], [0, 236], [-540, 236]], 1.7],
    ['junk', [[480, 150], [0, 128], [-480, 146], [-500, 120], [0, 104], [500, 118]], 1.4],
    ['chop', [[400, 118], [0, 96], [-400, 116], [-410, 150], [0, 140], [410, 152]], 1.5],
  ];
  loops.forEach(([type, pts, speed], i) => {
    const path = makePath(pts, true);
    const b = addBoat(sim, type, { path, speed, d: r() * path.len, sail: type === 'junk' || type === 'chop' ? 1 : 0 });
    Object.assign(b, path.at(b.d));
    if (type === 'sampan') { crew(sim, b, 'boatwoman', 0, -2.3, 0, 'scull'); if (i % 2 === 0) crew(sim, b, i === 2 ? 'foreigner' : 'coolie', 0, 0.9, 0, 'sit'); }
    if (type === 'ferry') { crew(sim, b, 'boatwoman', 0, -3.6, 0, 'scull'); crew(sim, b, 'merchant', -0.5, 0.5, 0, 'sit'); crew(sim, b, 'coolie', 0.5, 1.6, 0, 'sit'); crew(sim, b, 'clerk', 0.4, -0.6, 0, 'sit'); }
    if (type === 'junk') { crew(sim, b, 'coolie', 0, -11, 0, 'stand'); crew(sim, b, 'coolie', 1.4, 2, 1.5, 'stand'); crew(sim, b, 'coolie', -1.2, 8, 0, 'stand'); }
    if (type === 'chop') { crew(sim, b, 'boatwoman', 0.3, -7.3, 0.2, 'scull'); }
  });
  sim.follow.sampan = { label: '疍家艇', boat: 1, note: '疍家艇 · 摇橹的艇家，沿岸揽客' };
  sim.follow.junk = { label: '帆船', boat: 7, note: '帆船 · 篾席硬帆，顺江而下' };

  // 泊着的艇
  const moored = [
    ['sampan', -86, 7.5, 1.4], ['sampan', -82, 10.5, 1.7], ['sampan', 12, 7.4, -1.5], ['sampan', 104, 7.6, 1.5], ['sampan', 109, 10.8, 1.3],
    ['sampan', 22, 6, 0.3], ['sampan', -30, 5.2, 1.57], ['sampan', -112, 4.8, 1.6], ['sampan', 70, 5, -1.57], ['sampan', -58, 13.5, 0.1],
    ['chop', 122, 12, 1.5], ['chop', 142, 16, 1.36], ['chop', -8, 11, -1.62],
    ['flower', -236, 44, 1.52], ['flower', -212, 46.5, 1.6], ['flower', -188, 44.5, 1.55], ['flower', -164, 47, 1.62],
    ['junk', -60, 122, 1.2], ['junk', 190, 96, -1.75],
  ];
  moored.forEach(([type, x, z, h], i) => {
    const b = addBoat(sim, type, { x, z, h });
    if (type === 'sampan' && i % 2 === 0) crew(sim, b, 'boatwoman', 0, -1.6, 2 + i, i % 4 === 0 ? 'sit' : 'stand');
    if (type === 'chop') crew(sim, b, 'coolie', 0.4, 5.6, 1 + i, 'sit');
    if (type === 'flower') { crew(sim, b, 'boatwoman', 1.2, 7.4, 1.6, 'stand'); crew(sim, b, 'clerk', -0.8, -7.6, 3, 'sit'); }
    if (type === 'junk') { crew(sim, b, 'coolie', 1.5, 3, 2, 'sit'); crew(sim, b, 'coolie', -1, -10.5, 0.5, 'stand'); }
  });

  // 名场面的五个挑夫
  for (let i = 0; i < EVENT.porters; i++) {
    const hm = WHERE.home(i);
    const p = makeAgent(sim, 'coolie', { x: hm.x, z: hm.z, h: Math.PI / 2, pose: i % 2 ? 'sit' : 'stand', slot: i, role: 'porter', ev: { state: 'home', t: 0, wp: 0 } });
    sim.porters.push(p);
  }
  sim.follow.porter = { label: '挑夫', agent: sim.porters[0].id, note: '挑夫 · 扛茶箱上栈桥落艇' };

  // 过秤验货的一组
  const S = SCALE;
  makeAgent(sim, 'merchant', { x: S.x - 1.9, z: S.z + 1.6, h: 1.2, pose: 'talk', role: 'hong-merchant' });
  makeAgent(sim, 'foreigner', { x: S.x + 1.7, z: S.z + 2.2, h: -1.9, pose: 'talk', role: 'supercargo' });
  makeAgent(sim, 'linguist', { x: S.x - 0.2, z: S.z + 2.9, h: 3.0, pose: 'talk', role: 'linguist' });
  makeAgent(sim, 'clerk', { x: S.x + 2.2, z: S.z - 1.2, h: -1.3, pose: 'write', role: 'tally' });
  makeAgent(sim, 'coolie', { x: S.x - 1.5, z: S.z - 1.4, h: 1.5, pose: 'weigh' });
  makeAgent(sim, 'coolie', { x: S.x + 1.0, z: S.z - 2.6, h: -0.5, pose: 'stand' });

  // 摊档与歇脚的人
  for (const s of STALLS) {
    const g = s.goods;
    if (g === 'barber') { makeAgent(sim, 'clerk', { x: s.x, z: s.z, h: 1.57, pose: 'sit' }); makeAgent(sim, 'hawker', { x: s.x - 0.65, z: s.z, h: 1.57, pose: 'shave' }); }
    else if (g === 'easel') { makeAgent(sim, 'clerk', { x: s.x, z: s.z + 0.5, h: Math.PI, pose: 'paint', role: 'painter' }); makeAgent(sim, 'foreigner', { x: s.x + 1.5, z: s.z + 1.2, h: 2.6, pose: 'stand' }); }
    else if (g === 'rest') { for (let i = 0; i < 4; i++) makeAgent(sim, 'coolie', { x: s.x - 1.5 + i, z: s.z + (i % 2) * 0.9 - 0.4, h: 0.4 + i, pose: i === 2 ? 'stand' : 'sit' }); }
    else if (g === 'sailors') { for (let i = 0; i < 4; i++) { const an = i * 1.57; makeAgent(sim, 'sailor', { x: s.x + Math.sin(an) * 1.1, z: s.z + Math.cos(an) * 1.1, h: an + Math.PI, pose: i % 2 ? 'talk' : 'stand' }); } }
    else { makeAgent(sim, 'hawker', { x: s.x, z: s.z - 0.9, h: 0, pose: 'wave', role: 'stall:' + g }); makeAgent(sim, pick(r, ['coolie', 'sailor', 'clerk']), { x: s.x + 0.6, z: s.z + 1.3, h: Math.PI + 0.3, pose: 'talk' }); }
  }
  makeAgent(sim, 'clerk', { x: -19.5, z: -4.6, h: 0, pose: 'write', role: 'customs' });

  // 走动的人
  // 轿子：两名轿夫抬一位行商，绕空地走一圈（当成一条走在陆上的「船」）
  {
    const path = makePath([[-125, -53], [55, -53], [70, -46], [55, -39], [-125, -39], [-138, -46]], true);
    const b = addBoat(sim, 'sedan', { path, speed: 1.25, d: 60, land: true });
    Object.assign(b, path.at(b.d));
    crew(sim, b, 'coolie', 0, 1.8, 0, 'bear'); crew(sim, b, 'coolie', 0, -1.8, 0, 'bear'); crew(sim, b, 'merchant', 0, 0.05, 0, 'sit').ly = 0.5;
    sim.follow.sedan = { label: '轿子', boat: b.id, note: '二人小轿 · 轿里坐着一位行商' };
  }
  const mix = [['coolie', 236], ['hawker', 50], ['merchant', 62], ['linguist', 24], ['clerk', 44], ['foreigner', 66], ['sailor', 58], ['official', 8], ['monk', 8]];
  for (const [kind, n0] of mix) for (let i = 0, n = Math.max(2, Math.round(n0 * crowd)); i < n; i++) {
    const node = sim.graph[Math.floor(r() * sim.graph.length)];
    const a = makeAgent(sim, kind, { ox: r() * 2 - 1, oz: r() * 2 - 1, node: node.id, prev: -1, pause: 0, pose: 'walk', role: 'walker' });
    a.speed = kind === 'merchant' || kind === 'linguist' || kind === 'official' || kind === 'monk' ? 0.9 + r() * 0.25 : kind === 'coolie' ? 1.3 + r() * 0.5 : 1.05 + r() * 0.4;
    if (kind === 'coolie') a.carry = i % 3 === 0 ? 'chest' : i % 3 === 1 ? 'pole' : null;
    if (kind === 'hawker') a.carry = 'pole';
    a.x = node.x + a.ox * node.off; a.z = node.z + a.oz * node.off;
    a.target = pickNext(sim, a);
    sim.walkers.push(a);
  }
  const first = k => sim.walkers.find(a => a.kind === k).id;
  sim.follow.merchant = { label: '行商', agent: first('merchant'), note: '行商 · 长袍马褂瓜皮帽，在馆前走动' };
  sim.follow.hawker = { label: '小贩', agent: first('hawker'), note: '小贩 · 挑着担子沿空地叫卖' };
  sim.follow.official = { label: '官员', agent: first('official'), note: '官员 · 补服凉帽，来馆前巡看' };
  sim.follow.monk = { label: '僧人', agent: first('monk'), note: '僧人 · 持杖，从对岸寺里过江来' };
  return sim;
}
function pickNext(sim, a) {
  const n = sim.graph[a.node];
  let opts = n.nb.filter(id => id !== a.prev);
  if (!opts.length) opts = n.nb;
  const id = opts[Math.floor(sim.rand() * opts.length)];
  a.prev = a.node;
  return id;
}

export function stepSim(sim, dt) {
  sim.t += dt;
  for (const b of sim.boats) if (b.path) { b.d += b.speed * dt; Object.assign(b, b.path.at(b.d)); }
  stepEvent(sim, dt);
  for (const a of sim.walkers) {
    if (a.pause > 0) { a.pause -= dt; a.pose = a.carry === 'chest' ? 'carry-stand' : a.carry === 'pole' ? 'pole-stand' : 'stand'; continue; }
    const n = sim.graph[a.target];
    a.pose = a.carry === 'chest' ? 'carry' : a.carry === 'pole' ? 'pole' : 'walk';
    if (walkTo(a, n.x + a.ox * n.off, n.z + a.oz * n.off, a.speed, dt)) {
      a.node = a.target; a.target = pickNext(sim, a);
      if (sim.rand() < 0.16) a.pause = 1.5 + sim.rand() * 5;
    }
  }
}

// 世界坐标（船上的人随船）
export function agentWorld(sim, a) {
  if (a.boat < 0) return { x: a.x, y: groundY(a.x, a.z), z: a.z, h: a.h };
  const b = sim.boats[a.boat], s = Math.sin(b.h), c = Math.cos(b.h);
  return { x: b.x + a.lx * c + a.lz * s, y: (b.land ? 0 : WATER_Y) + a.ly, z: b.z - a.lx * s + a.lz * c, h: b.h + a.lh, hidden: b.hidden };
}
export function nearestFactory(x) {
  for (const l of LANES) if (x >= l.x0 && x <= l.x1) return l.cn;
  let best = FACTORIES[0];
  for (const f of FACTORIES) if (Math.abs(f.cx - x) < Math.abs(best.cx - x)) best = f;
  return best.cn;
}
