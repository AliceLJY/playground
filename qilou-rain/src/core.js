// 骑楼雨夜 · 纯逻辑。不含 three.js，可在 Node 里无头跑；页面、自动驾驶、测试都读这一份。
// 坐标：+X 朝东，+Z 朝南，Y 朝上，单位米。街道沿 Z 走，北端开局，南端是渡口。
// 玩家朝向 yaw：0 朝 -Z（北），前方向量 (-sin yaw, 0, -cos yaw)，与 three 相机的 rotation.y 一致。

export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const TAU = Math.PI * 2;
export const wrap = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };

// ---------- 场地 ----------
export const STREET = { x0: -9, x1: 9, z0: -60, z1: 40, road: 5 };
export const ALLEY = { x0: 9, x1: 34, z0: -4, z1: 4 };
export const PLAZA = { x0: -20, x1: 20, z0: 40, z1: 62 };
export const GANG = { x0: -1.7, x1: 1.7, z0: 62, z1: 67.5 };
export const WALK = [STREET, ALLEY, PLAZA, GANG];
export const START = { x: 0, z: -54, yaw: Math.PI };
export const EXTRACT = { x: 0, z: 65.5, r: 2.2 };
export const DRAINS = [
  { id: 'A', name: '甲 · 街心', x: -1.5, z: -22 },
  { id: 'B', name: '乙 · 横巷', x: 26, z: 0.5 },
  { id: 'C', name: '丙 · 渡口', x: -9, z: 50 },
];
export const VENTS = [{ x: -7.6, z: -8 }, { x: 7.6, z: 22 }, { x: -15, z: 45 }, { x: 15, z: 47 }, { x: 30, z: -1.5 }];
export const CRATES = [{ x: 7.2, z: -36 }, { x: 17, z: -2.6 }, { x: 7.4, z: 30 }, { x: 13, z: 56 }];

// 障碍：轴对齐方块。h 是高度，高于 1.2 米的挡视线和喷雾。
export const OBST = [];
const ob = (kind, x, z, w, d, h) => OBST.push({ kind, x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, x, z, w, d, h });
export const COLUMNS = [];
for (let z = -57.5; z <= 37.5; z += 5) {
  for (const s of [-1, 1]) {
    if (s === 1 && Math.abs(z) < 4.5) continue;
    COLUMNS.push({ x: s * 5.35, z });
    ob('column', s * 5.35, z, 0.7, 0.7, 4.2);
  }
}
ob('van', -2.6, 9, 2.0, 4.6, 2.0);
ob('trike', 3.2, -41, 1.3, 2.4, 1.3);
ob('kiosk', -7.6, -31, 1.8, 2.2, 2.6);
ob('stall', 7.6, -14, 1.6, 3.0, 2.2);
ob('bins', -6.2, 16, 1.2, 0.8, 1.0);
ob('table', 15, 2.3, 1.6, 1.6, 0.8);
ob('table', 21, -2.3, 1.6, 1.6, 0.8);
ob('cart', 30.5, 2.2, 1.4, 2.4, 1.8);
ob('crates', -13, 44, 2.4, 2.4, 1.8);
ob('crates', 10, 52, 2.4, 1.6, 1.5);
ob('booth', 6.5, 59.6, 3.0, 2.4, 2.8);
ob('bollard', -4.2, 61.2, 0.5, 0.5, 0.9);
ob('bollard', 4.2, 61.2, 0.5, 0.5, 0.9);
ob('barricade', 0, -59.2, 18, 1.2, 1.4);

const inRect = (r, x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
export const inWalk = (x, z) => inRect(STREET, x, z) || inRect(ALLEY, x, z) || inRect(PLAZA, x, z) || inRect(GANG, x, z);
function inObst(x, z, tallOnly) {
  for (let i = 0; i < OBST.length; i++) {
    const o = OBST[i];
    if (tallOnly && o.h < 1.2) continue;
    if (x >= o.x0 && x <= o.x1 && z >= o.z0 && z <= o.z1) return true;
  }
  return false;
}
const RING = [];
for (let i = 0; i < 8; i++) RING.push([Math.cos(i * TAU / 8), Math.sin(i * TAU / 8)]);
export function free(x, z, r) {
  if (!inWalk(x, z) || inObst(x, z, false)) return false;
  for (let i = 0; i < 8; i++) {
    const px = x + RING[i][0] * r, pz = z + RING[i][1] * r;
    if (!inWalk(px, pz) || inObst(px, pz, false)) return false;
  }
  return true;
}
export function los(x0, z0, x1, z1) {
  const d = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(d / 0.4));
  for (let i = 1; i < n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    if (!inWalk(x, z) || inObst(x, z, true)) return false;
  }
  return true;
}

// ---------- 寻路：1 米格子上的流场 ----------
export const GRID = { x0: -21, z0: -61, w: 56, h: 130 };
const PASS = new Uint8Array(GRID.w * GRID.h);
for (let j = 0; j < GRID.h; j++) for (let i = 0; i < GRID.w; i++) PASS[j * GRID.w + i] = free(GRID.x0 + i + 0.5, GRID.z0 + j + 0.5, 0.42) ? 1 : 0;
const cellOf = (x, z) => {
  const i = clamp(Math.floor(x - GRID.x0), 0, GRID.w - 1), j = clamp(Math.floor(z - GRID.z0), 0, GRID.h - 1);
  return j * GRID.w + i;
};
const NB = [[1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10], [1, 1, 14], [1, -1, 14], [-1, 1, 14], [-1, -1, 14]];
export function makeField() { return { d: new Int32Array(GRID.w * GRID.h), q: new Int32Array(GRID.w * GRID.h * 4), gx: 1e9, gz: 1e9 }; }
export function fillField(f, gx, gz) {
  const { w, h } = GRID, d = f.d, q = f.q;
  d.fill(1e9);
  let s = cellOf(gx, gz);
  if (!PASS[s]) {
    let best = -1, bd = 1e9;
    for (let c = 0; c < PASS.length; c++) {
      if (!PASS[c]) continue;
      const dx = GRID.x0 + (c % w) + 0.5 - gx, dz = GRID.z0 + Math.floor(c / w) + 0.5 - gz, dd = dx * dx + dz * dz;
      if (dd < bd) { bd = dd; best = c; }
    }
    s = best;
  }
  let head = 0, tail = 0;
  d[s] = 0; q[tail++] = s;
  const cap = q.length;
  while (head !== tail) {
    const c = q[head]; head = (head + 1) % cap;
    const ci = c % w, cj = (c - ci) / w, cd = d[c];
    for (let k = 0; k < 8; k++) {
      const ni = ci + NB[k][0], nj = cj + NB[k][1];
      if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
      const n = nj * w + ni;
      if (!PASS[n]) continue;
      if (k >= 4 && (!PASS[cj * w + ni] || !PASS[nj * w + ci])) continue;
      const nd = cd + NB[k][2];
      if (nd < d[n]) { d[n] = nd; q[tail] = n; tail = (tail + 1) % cap; }
    }
  }
  f.gx = gx; f.gz = gz;
  return f;
}
// 顺着流场往目标走一步的方向（单位向量写进 out）
export function flow(f, x, z, out) {
  const { w, h } = GRID, i = clamp(Math.floor(x - GRID.x0), 0, w - 1), j = clamp(Math.floor(z - GRID.z0), 0, h - 1);
  let best = f.d[j * w + i], bi = 0, bj = 0;
  for (let k = 0; k < 8; k++) {
    const ni = i + NB[k][0], nj = j + NB[k][1];
    if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
    if (k >= 4 && (!PASS[j * w + ni] || !PASS[nj * w + i])) continue;
    const v = f.d[nj * w + ni];
    if (v < best) { best = v; bi = NB[k][0]; bj = NB[k][1]; }
  }
  if (!bi && !bj) {
    const dx = f.gx - x, dz = f.gz - z, l = Math.hypot(dx, dz) || 1;
    out.x = dx / l; out.z = dz / l;
    return best;
  }
  const tx = GRID.x0 + i + bi + 0.5 - x, tz = GRID.z0 + j + bj + 0.5 - z, l = Math.hypot(tx, tz) || 1;
  out.x = tx / l; out.z = tz / l;
  return best;
}

// ---------- 数值 ----------
export const P = {
  r: 0.36, eye: 1.62, walk: 4.3, sprint: 6.6, accel: 14, jump: 5.2, grav: 15,
  hp: 100, regenDelay: 4.5, regen: 7,
  tank: 100, drain: 10.5, cans: 3, maxCans: 6, reload: 1.4,
  range: 13, cone: 0.1, coneNear: 0.07, dps: 78,
  slapCd: 0.62, slapAt: 0.13, slapRange: 2.5, slapArc: 1.05, slapDmg: 75,
  sealTime: 4.6, sealR: 2.3, pickR: 1.3, sealLock: 0.9, sealLoss: 0.3, guardR: 19,
};
export const TYPES = {
  runner: { hp: 60, r: 0.55, speed: 5.4, dmg: 8, len: 1.5, wind: 0.42, score: 100 },
  flyer: { hp: 34, r: 0.5, speed: 7.2, dmg: 12, len: 1.15, wind: 0.65, score: 150 },
  charger: { hp: 280, r: 1.05, speed: 2.7, dmg: 28, len: 3.2, wind: 0.95, score: 500 },
};
export const STAGES = [
  { alive: 4, wave: 4, lull: 7, every: 1.7, flyer: 0, chargers: 0 },
  { alive: 6, wave: 7, lull: 6, every: 1.4, flyer: 0.3, chargers: 0 },
  { alive: 7, wave: 9, lull: 5.5, every: 1.2, flyer: 0.3, chargers: 1 },
  { alive: 9, wave: 10, lull: 3.5, every: 0.9, flyer: 0.35, chargers: 2 },
];
export const RADIO = {
  start: ['士多陈伯', '后生仔，三个沙井盖全被顶开了，蟑螂就是从那儿上来的。逐个盖回去，再去渡口坐船走。'],
  contact: ['士多陈伯', '来了来了！远的拿喷雾喷，贴脸了就一拖鞋拍下去。'],
  seal1: ['街坊群', '第一个盖上了！小心，会飞的那种出来了，它俯冲之前会先停在半空。'],
  seal2: ['街坊群', '还剩一个！有只带壳的大家伙，正面喷不动，等它撞柱子翻了肚再打。'],
  seal3: ['士多陈伯', '三个都盖好了！末班渡轮在码头等你，快跑！'],
  low: ['街坊群', '你挂彩了，先躲到柱子后面喘口气。'],
  empty: ['士多陈伯', '药罐空了！骑楼底下的红箱子里有新的。'],
  win: ['街坊群', '上船了上船了！今晚这条街清净了，多谢你啊靓仔。'],
};

// ---------- 模拟 ----------
export function createSim(seed = 1, opts = {}) {
  const sim = {
    seed, r: rng(seed), t: 0, state: 'play', opts,
    player: { x: START.x, y: 0, z: START.z, vx: 0, vy: 0, vz: 0, yaw: START.yaw, pitch: 0, hp: P.hp, hurtT: 99, tank: P.tank, cans: P.cans, reloadT: 0, slapT: 9, slapHit: false, firing: false, onGround: true, moved: 0, speed: 0 },
    drains: DRAINS.map(d => ({ ...d, sealed: false, prog: 0, using: false, woke: false })),
    crates: CRATES.map(c => ({ ...c, t: 0 })),
    drops: [], enemies: [], nextId: 1, spawnT: 3, stage: 0, sealLock: 0, chargerCd: 0, waveLeft: 4, lullT: 0, waves: 0, contact: false, lowSaid: 0, emptySaid: 0,
    field: makeField(), fieldT: 0,
    stats: { kills: 0, sprayT: 0, hitT: 0, slaps: 0, slapHits: 0, damage: 0, score: 0, byType: { runner: 0, flyer: 0, charger: 0 } },
    events: [], near: null, extractOpen: false,
  };
  fillField(sim.field, sim.player.x, sim.player.z);
  ev(sim, 'radio', { key: 'start' });
  return sim;
}
function ev(sim, type, data) { sim.events.push({ type, t: sim.t, ...data }); }
export const sealedCount = sim => sim.drains.reduce((n, d) => n + (d.sealed ? 1 : 0), 0);
export const aliveCount = (sim, type) => sim.enemies.reduce((n, e) => n + (!e.dead && (!type || e.type === type) ? 1 : 0), 0);

function spawn(sim, type, src) {
  const T = TYPES[type], a = sim.r() * TAU;
  const e = { id: sim.nextId++, type, x: src.x + Math.cos(a) * 0.6, y: 0, z: src.z + Math.sin(a) * 0.6, yaw: a, hp: T.hp, state: 'emerge', t: 0, phase: sim.r() * 9, dead: false, deadT: 0, flip: 0, slow: 0, hitT: 9, tx: 0, tz: 0, dx: 0, dz: 0, burst: 0, zig: sim.r() < 0.5 ? -1 : 1, stuck: 0, speed: 0, fromRoof: !!src.roof, run: 0 };
  if (!free(e.x, e.z, T.r)) { e.x = src.x; e.z = src.z; }
  sim.enemies.push(e);
  ev(sim, 'spawn', { id: e.id, kind: type, x: e.x, z: e.z });
  return e;
}
export function spawnAt(sim, type, x, z) { return spawn(sim, type, { x, z }); }

function hurt(sim, dmg, fromX, fromZ, kind, id) {
  const p = sim.player;
  if (sim.state !== 'play' || sim.opts.god) return;
  p.hp -= dmg; p.hurtT = 0; sim.stats.damage += dmg;
  sim.sealLock = P.sealLock;
  for (const d of sim.drains) if (d.using) d.prog = Math.max(0, d.prog - P.sealLoss);
  ev(sim, 'hurt', { dmg, x: fromX, z: fromZ, kind, id });
  if (p.hp <= 30 && sim.t - sim.lowSaid > 25) { sim.lowSaid = sim.t; ev(sim, 'radio', { key: 'low' }); }
  if (p.hp <= 0) { p.hp = 0; sim.state = 'dead'; ev(sim, 'dead', {}); }
}
function damage(sim, e, dmg, how) {
  if (e.dead || e.state === 'emerge' && e.t < 0.25) return 0;
  const p = sim.player;
  if (e.type === 'charger') {
    if (e.state === 'stun') dmg *= 2;
    else {
      const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw), dx = p.x - e.x, dz = p.z - e.z, l = Math.hypot(dx, dz) || 1;
      if ((fx * dx + fz * dz) / l > 0.35) dmg *= 0.3;
    }
  }
  e.hp -= dmg; e.hitT = 0;
  if (e.hp <= 0) {
    e.dead = true; e.deadT = 0; e.state = 'dead';
    sim.stats.kills++; sim.stats.byType[e.type]++; sim.stats.score += TYPES[e.type].score;
    if (e.type === 'charger') sim.chargerCd = sim.stage >= 3 ? 14 : 28;
    ev(sim, 'kill', { id: e.id, kind: e.type, x: e.x, y: e.y, z: e.z, how });
    const chance = e.type === 'charger' ? 1 : (sim.player.cans + sim.drops.length < 2 ? 0.34 : 0.14);
    if (sim.r() < chance) sim.drops.push({ x: e.x, z: e.z, t: 0 });
  }
  return dmg;
}

function moveCircle(o, dx, dz, r) {
  let hit = false;
  if (free(o.x + dx, o.z, r)) o.x += dx; else hit = true;
  if (free(o.x, o.z + dz, r)) o.z += dz; else hit = true;
  return hit;
}

const _f = { x: 0, z: 0 };
function stepEnemy(sim, e, dt) {
  const p = sim.player, T = TYPES[e.type];
  e.t += dt; e.hitT += dt; e.slow = Math.max(0, e.slow - dt);
  if (e.dead) {
    e.deadT += dt; e.flip = Math.min(1, e.flip + dt * 3.2);
    e.y = Math.max(0, e.y - dt * 9);
    return;
  }
  const dx = p.x - e.x, dz = p.z - e.z, dist = Math.hypot(dx, dz) || 1e-3;
  const face = (tx, tz, rate) => { const want = Math.atan2(-tx, -tz); e.yaw += clamp(wrap(want - e.yaw), -rate * dt, rate * dt); };
  const slowK = e.slow > 0 ? 0.45 : 1;
  let vx = 0, vz = 0;
  if (e.state === 'emerge') {
    if (e.t > 0.7) { e.state = e.type === 'flyer' ? 'fly' : e.type === 'charger' ? 'stalk' : 'chase'; e.t = 0; }
    e.speed = 0;
    return;
  }
  if (e.type === 'runner') {
    if (e.state === 'chase') {
      e.burst -= dt;
      if (e.burst < -0.22 - 0.2 * ((e.id * 7) % 5) / 5) { e.burst = 0.55 + sim.r() * 0.7; e.zig = -e.zig; }
      const seen = dist < 7 && los(e.x, e.z, p.x, p.z);
      if (seen) { _f.x = dx / dist; _f.z = dz / dist; } else flow(sim.field, e.x, e.z, _f);
      const sp = e.burst > 0 ? T.speed * slowK : 0.6;
      const zk = seen && dist > 2.5 ? 0.25 * e.zig : 0;
      vx = (_f.x - _f.z * zk) * sp; vz = (_f.z + _f.x * zk) * sp;
      face(vx, vz, 9);
      if (dist < 1.75 && Math.abs(p.y - e.y) < 1.6) { e.state = 'windup'; e.t = 0; ev(sim, 'telegraph', { id: e.id, kind: e.type, x: e.x, z: e.z }); }
    } else if (e.state === 'windup') {
      face(dx, dz, 7);
      if (e.t >= T.wind) {
        if (dist < 2.2 && p.y < 1.3) hurt(sim, T.dmg, e.x, e.z, e.type, e.id);
        ev(sim, 'bite', { id: e.id, x: e.x, z: e.z });
        e.state = 'recover'; e.t = 0;
      }
    } else if (e.state === 'recover') {
      vx = -dx / dist * 1.2; vz = -dz / dist * 1.2;
      if (e.t > 0.8) { e.state = 'chase'; e.t = 0; e.burst = 0.5; }
    }
  } else if (e.type === 'flyer') {
    if (e.state === 'fly') {
      e.y += (2.5 + Math.sin(e.phase + sim.t * 2.3) * 0.35 - e.y) * Math.min(1, dt * 3);
      const seen = dist < 16 && los(e.x, e.z, p.x, p.z);
      if (seen) {
        const ring = 7.5, k = (dist - ring) / 4;
        _f.x = dx / dist * clamp(k, -1, 1) - dz / dist * 0.7 * e.zig;
        _f.z = dz / dist * clamp(k, -1, 1) + dx / dist * 0.7 * e.zig;
        const l = Math.hypot(_f.x, _f.z) || 1; _f.x /= l; _f.z /= l;
      } else flow(sim.field, e.x, e.z, _f);
      vx = _f.x * T.speed * 0.75 * slowK; vz = _f.z * T.speed * 0.75 * slowK;
      face(seen ? dx : vx, seen ? dz : vz, 6);
      if (seen && dist < 11 && e.t > 1.6 + ((e.id * 13) % 10) / 10) { e.state = 'aim'; e.t = 0; ev(sim, 'telegraph', { id: e.id, kind: e.type, x: e.x, z: e.z }); }
    } else if (e.state === 'aim') {
      e.y += (3.1 - e.y) * Math.min(1, dt * 4);
      face(dx, dz, 8);
      if (e.t >= T.wind) {
        const lead = 0.25;
        e.tx = p.x + p.vx * lead; e.tz = p.z + p.vz * lead;
        const l = Math.hypot(e.tx - e.x, e.tz - e.z) || 1;
        e.dx = (e.tx - e.x) / l; e.dz = (e.tz - e.z) / l; e.run = l + 2.5; e.bit = false;
        e.state = 'dive'; e.t = 0; ev(sim, 'dive', { id: e.id, x: e.x, z: e.z });
      }
    } else if (e.state === 'dive') {
      const sp = 13;
      vx = e.dx * sp; vz = e.dz * sp; e.run -= sp * dt;
      e.y = Math.max(0.5, e.y - dt * 4.2);
      if (!e.bit && dist < 1.25 && Math.abs(p.y + 1.0 - e.y) < 1.4) { e.bit = true; hurt(sim, T.dmg, e.x, e.z, e.type, e.id); }
      if (e.run <= 0 || e.t > 1.4) { e.state = 'land'; e.t = 0; }
    } else if (e.state === 'land') {
      e.y = Math.max(0, e.y - dt * 5);
      if (e.t > 1.1) { e.state = 'fly'; e.t = 0; e.zig = -e.zig; }
    }
  } else {
    if (e.state === 'stalk') {
      const seen = dist < 15 && los(e.x, e.z, p.x, p.z);
      if (seen) { _f.x = dx / dist; _f.z = dz / dist; } else flow(sim.field, e.x, e.z, _f);
      vx = _f.x * T.speed * slowK; vz = _f.z * T.speed * slowK;
      face(vx, vz, 2.6);
      if (seen && dist < 14 && e.t > 1.2) { e.state = 'windup'; e.t = 0; ev(sim, 'telegraph', { id: e.id, kind: e.type, x: e.x, z: e.z }); }
    } else if (e.state === 'windup') {
      if (e.t < T.wind - 0.3) face(dx, dz, 5);
      if (e.t >= T.wind) {
        e.dx = -Math.sin(e.yaw); e.dz = -Math.cos(e.yaw); e.run = 24; e.bit = false;
        e.state = 'charge'; e.t = 0; ev(sim, 'charge', { id: e.id, x: e.x, z: e.z });
      }
    } else if (e.state === 'charge') {
      const sp = 11.5, step = sp * dt;
      e.run -= step;
      const nx = e.x + e.dx * step, nz = e.z + e.dz * step;
      if (!e.bit && dist < 1.6 && p.y < 1.5) {
        e.bit = true; hurt(sim, T.dmg, e.x, e.z, e.type, e.id);
        p.vx += e.dx * 9; p.vz += e.dz * 9; p.vy = Math.max(p.vy, 3);
      }
      if (!free(nx, nz, T.r * 0.8)) {
        e.state = 'stun'; e.t = 0;
        ev(sim, 'stun', { id: e.id, x: e.x, z: e.z });
      } else {
        e.x = nx; e.z = nz;
        if (e.run <= 0) { e.state = 'recover'; e.t = 0; }
      }
      e.speed = sp;
      return;
    } else if (e.state === 'stun') {
      e.flip = Math.min(1, e.flip + dt * 4);
      if (e.t > 2.6) { e.state = 'recover'; e.t = 0; }
      e.speed = 0;
      return;
    } else if (e.state === 'recover') {
      e.flip = Math.max(0, e.flip - dt * 3);
      if (e.t > 0.9) { e.state = 'stalk'; e.t = 0; }
    }
  }
  const ox = e.x, oz = e.z;
  moveCircle(e, vx * dt, vz * dt, e.type === 'flyer' && e.y > 1.4 ? 0.3 : T.r * 0.8);
  const moved = Math.hypot(e.x - ox, e.z - oz);
  e.speed = moved / dt;
  if ((e.state === 'chase' && e.burst > 0 || e.state === 'stalk') && moved < 0.3 * dt) {
    e.stuck += dt;
    if (e.stuck > 0.8) {
      flow(sim.field, e.x, e.z, _f);
      moveCircle(e, _f.x * 0.25, _f.z * 0.25, 0.3);
      e.stuck = 0;
    }
  } else e.stuck = 0;
}

export function stepSim(sim, dt, input = {}) {
  const p = sim.player;
  sim.events.length = sim.keepEvents ? sim.events.length : 0;
  if (sim.state !== 'play') { for (const e of sim.enemies) if (e.dead) e.deadT += dt; return sim; }
  sim.t += dt;
  // ---- 玩家 ----
  if (input.yaw !== undefined) p.yaw = input.yaw;
  if (input.pitch !== undefined) p.pitch = clamp(input.pitch, -1.45, 1.45);
  let mx = input.mx || 0, mz = input.mz || 0;
  const ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; }
  const sprint = !!input.sprint && mz > 0.5 && !input.fire;
  const sp = sprint ? P.sprint : P.walk;
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
  const wx = (fx * mz + rx * mx) * sp, wz = (fz * mz + rz * mx) * sp;
  const k = Math.min(1, P.accel * dt * (p.onGround ? 1 : 0.35));
  p.vx += (wx - p.vx) * k; p.vz += (wz - p.vz) * k;
  if (input.jump && p.onGround) { p.vy = P.jump; p.onGround = false; ev(sim, 'jump', {}); }
  p.vy -= P.grav * dt; p.y += p.vy * dt;
  if (p.y <= 0) { if (!p.onGround && p.vy < -3) ev(sim, 'land', {}); p.y = 0; p.vy = 0; p.onGround = true; }
  const px = p.x, pz = p.z;
  moveCircle(p, p.vx * dt, p.vz * dt, P.r);
  const moved = Math.hypot(p.x - px, p.z - pz);
  p.moved += moved; p.speed = moved / dt; p.sprinting = sprint && moved > 0.01;
  p.hurtT += dt;
  if (p.hurtT > P.regenDelay && p.hp < P.hp) p.hp = Math.min(P.hp, p.hp + P.regen * dt);
  // ---- 流场 ----
  sim.fieldT -= dt;
  if (sim.fieldT <= 0) { sim.fieldT = 0.35; fillField(sim.field, p.x, p.z); }
  // ---- 换罐 ----
  if (p.reloadT > 0) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) { p.reloadT = 0; p.tank = P.tank; ev(sim, 'reloaded', {}); }
  } else if ((input.reload && p.tank < P.tank - 1 || p.tank <= 0 && input.fire) && p.cans > 0) {
    p.cans--; p.reloadT = P.reload; ev(sim, 'reload', {});
  }
  // ---- 喷雾 ----
  const eyeY = p.y + P.eye, cp = Math.cos(p.pitch), ax = fx * cp, ay = Math.sin(p.pitch), az = fz * cp;
  p.firing = !!input.fire && p.tank > 0 && p.reloadT <= 0 && p.slapT > 0.3;
  if (input.fire && p.tank <= 0 && p.cans <= 0 && sim.t - sim.emptySaid > 20) { sim.emptySaid = sim.t; ev(sim, 'radio', { key: 'empty' }); }
  p.aimOn = false; p.aimDist = 9;
  {
    if (p.firing) { p.tank = Math.max(0, p.tank - P.drain * dt); sim.stats.sprayT += dt; }
    let any = false;
    for (const e of sim.enemies) {
      if (e.dead) continue;
      const T = TYPES[e.type], cy = e.y + (e.type === 'charger' ? 0.7 : 0.35);
      const vx = e.x - p.x, vy = cy - eyeY, vz = e.z - p.z, d = Math.hypot(vx, vy, vz);
      if (d > P.range + T.r) continue;
      const dot = (vx * ax + vy * ay + vz * az) / d;
      if (dot <= 0) continue;
      const ang = Math.acos(Math.min(1, dot));
      if (ang > P.cone + P.coneNear * Math.max(0, 1 - d / 5) + Math.atan2(T.r, d)) continue;
      if (!los(p.x, p.z, e.x, e.z)) continue;
      if (!p.aimOn || d < p.aimDist) p.aimDist = d;
      p.aimOn = true;
      if (!p.firing) continue;
      const got = damage(sim, e, P.dps * dt * (1 - 0.45 * Math.min(1, d / P.range)), 'spray');
      if (got > 0) { any = true; if (e.type === 'runner') e.slow = 0.3; }
    }
    if (any) sim.stats.hitT += dt;
    if (p.firing && p.tank <= 0) ev(sim, 'empty', {});
  }
  // ---- 凉拖 ----
  const before = p.slapT;
  p.slapT += dt;
  if (input.slap && before >= P.slapCd) { p.slapT = 0; p.slapHit = false; sim.stats.slaps++; ev(sim, 'slap', {}); }
  if (before < P.slapAt && p.slapT >= P.slapAt) {
    let n = 0;
    for (const e of sim.enemies) {
      if (e.dead || e.y > 2.9) continue;
      const T = TYPES[e.type], dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz);
      if (d > P.slapRange + T.r) continue;
      if (d > 0.6 && (dx * fx + dz * fz) / d < Math.cos(P.slapArc)) continue;
      const got = damage(sim, e, P.slapDmg, 'slap');
      if (got > 0) {
        n++;
        if (!e.dead && e.type !== 'charger') { moveCircle(e, dx / (d || 1) * 1.2, dz / (d || 1) * 1.2, 0.3); if (e.state === 'windup' || e.state === 'aim' || e.state === 'dive') { e.state = e.type === 'flyer' ? 'land' : 'recover'; e.t = 0; } }
      }
    }
    if (n) { p.slapHit = true; sim.stats.slapHits++; ev(sim, 'slapHit', { n }); }
  }
  // ---- 沙井口 ----
  sim.near = null;
  sim.sealLock = Math.max(0, sim.sealLock - dt);
  sim.chargerCd = Math.max(0, sim.chargerCd - dt);
  for (const d of sim.drains) {
    d.using = false;
    if (d.sealed) continue;
    const dist = Math.hypot(d.x - p.x, d.z - p.z);
    if (!d.woke && dist < P.guardR) {
      d.woke = true;
      const n = 3 + Math.min(1, sim.stage);
      for (let i = 0; i < n; i++) spawn(sim, i === 3 ? 'flyer' : 'runner', d);
      ev(sim, 'nest', { id: d.id, x: d.x, z: d.z });
    }
    if (dist < P.sealR) {
      sim.near = d;
      if (input.use && sim.sealLock <= 0) {
        d.using = true; d.prog += dt / P.sealTime;
        if (d.prog >= 1) {
          d.prog = 1; d.sealed = true;
          const n = sealedCount(sim);
          sim.stage = n; sim.waveLeft = STAGES[n].wave; sim.lullT = 0;
          p.cans = Math.min(P.maxCans, p.cans + 1); p.hp = Math.min(P.hp, p.hp + 25);
          ev(sim, 'seal', { id: d.id, n });
          ev(sim, 'radio', { key: 'seal' + n });
          if (n === 2) { const src = sim.drains.find(q => !q.sealed); spawn(sim, 'charger', src); sim.chargerCd = 28; }
          if (n === 3) { sim.extractOpen = true; sim.spawnT = 2.5; }
        }
        continue;
      }
    }
    if (!d.using) d.prog = Math.max(0, d.prog - dt * 0.12);
  }
  // ---- 补给 ----
  for (const c of sim.crates) {
    if (c.t > 0) { c.t -= dt; continue; }
    if (p.cans < P.maxCans && Math.hypot(c.x - p.x, c.z - p.z) < P.pickR + 0.4) { p.cans = Math.min(P.maxCans, p.cans + 2); c.t = 28; ev(sim, 'pickup', { from: 'crate', x: c.x, z: c.z }); }
  }
  for (let i = sim.drops.length - 1; i >= 0; i--) {
    const d = sim.drops[i]; d.t += dt;
    if (p.cans < P.maxCans && Math.hypot(d.x - p.x, d.z - p.z) < P.pickR) { p.cans++; sim.drops.splice(i, 1); ev(sim, 'pickup', { from: 'drop', x: d.x, z: d.z }); }
    else if (d.t > 22) sim.drops.splice(i, 1);
  }
  // ---- 出怪 ----
  const calm = !sim.contact && p.moved < 8 && sim.t < 7;
  if (!calm) {
    const S = STAGES[sim.stage];
    sim.spawnT -= dt;
    if (sim.waveLeft <= 0) {
      if (aliveCount(sim) <= 1) sim.lullT += dt;
      if (sim.lullT >= S.lull) { sim.waveLeft = S.wave; sim.lullT = 0; sim.waves++; ev(sim, 'wave', { n: sim.waves }); }
    } else if (sim.spawnT <= 0) {
      sim.spawnT = S.every;
      if (aliveCount(sim) < S.alive) {
        sim.waveLeft--;
        let srcs = sim.drains.filter(d => !d.sealed && d.prog < 0.15);
        if (!srcs.length || sim.r() < 0.25 && sim.stage > 0) srcs = VENTS.filter(v => Math.hypot(v.x - p.x, v.z - p.z) > 7).map(v => ({ ...v, roof: true }));
        srcs.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
        const src = srcs[Math.min(srcs.length - 1, sim.r() < 0.6 ? 0 : 1 + Math.floor(sim.r() * 2))];
        let type = 'runner';
        if (S.chargers > aliveCount(sim, 'charger') && sim.chargerCd <= 0 && sim.r() < 0.3) { type = 'charger'; sim.chargerCd = 10; }
        else if (sim.r() < S.flyer) type = 'flyer';
        spawn(sim, type, src);
      }
    }
  }
  // ---- 蟑螂 ----
  for (const e of sim.enemies) stepEnemy(sim, e, dt);
  for (let i = 0; i < sim.enemies.length; i++) {
    const a = sim.enemies[i];
    if (a.dead || a.state === 'charge' || a.state === 'dive') continue;
    for (let j = i + 1; j < sim.enemies.length; j++) {
      const b = sim.enemies[j];
      if (b.dead || b.state === 'charge' || b.state === 'dive' || Math.abs(a.y - b.y) > 1.2) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 1e-3, need = TYPES[a.type].r + TYPES[b.type].r;
      if (d < need) {
        const push = (need - d) * 0.5, ux = dx / d, uz = dz / d;
        moveCircle(a, -ux * push, -uz * push, 0.3); moveCircle(b, ux * push, uz * push, 0.3);
      }
    }
  }
  for (let i = sim.enemies.length - 1; i >= 0; i--) if (sim.enemies[i].dead && sim.enemies[i].deadT > 6) sim.enemies.splice(i, 1);
  if (!sim.contact && sim.enemies.some(e => !e.dead && Math.hypot(e.x - p.x, e.z - p.z) < 14)) { sim.contact = true; ev(sim, 'radio', { key: 'contact' }); }
  // ---- 撤离 ----
  if (sim.extractOpen && Math.hypot(EXTRACT.x - p.x, EXTRACT.z - p.z) < EXTRACT.r) { sim.state = 'won'; ev(sim, 'win', {}); ev(sim, 'radio', { key: 'win' }); }
  return sim;
}

export function objective(sim) {
  const left = sim.drains.filter(d => !d.sealed);
  if (!left.length) return { text: '去渡口上船', sub: '末班渡轮在码头南端', target: EXTRACT, id: '渡' };
  const p = sim.player;
  left.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
  return { text: left.length === 3 ? '盖回三处沙井盖' : left.length === 1 ? '盖回最后一处沙井盖' : '还剩 ' + left.length + ' 处沙井盖', sub: '走近后按住「封」', target: left[0], id: left[0].id };
}
export function rating(sim) {
  const s = sim.stats, acc = s.sprayT > 0 ? s.hitT / s.sprayT : 0;
  const pts = (sim.t < 150 ? 2 : sim.t < 240 ? 1 : 0) + (acc > 0.6 ? 2 : acc > 0.4 ? 1 : 0) + (s.damage < 60 ? 2 : s.damage < 140 ? 1 : 0);
  return { acc, name: ['险过剃头', '有惊无险', '手脚麻利', '街坊点赞', '灭蟑能手', '一拖定音', '西关战神'][pts] };
}

// ---------- 自动驾驶（测试与演示用，正常游玩不依赖） ----------
function gauss(r) { return Math.sqrt(-2 * Math.log(1 - r() + 1e-9)) * Math.cos(TAU * r()); }
export function makeBot(level = 'precise', seed = 7) {
  return { level, r: rng(seed * 7919 + 13), field: makeField(), goalKey: '', yaw: START.yaw, pitch: 0, react: 0, target: 0, aimErr: 0, errT: 0, strafe: 1, strafeT: 0, idle: 0 };
}
export function botInput(sim, bot, dt) {
  const p = sim.player, out = { mx: 0, mz: 0, yaw: bot.yaw, pitch: bot.pitch, fire: false, slap: false, use: false, reload: false, jump: false, sprint: false };
  const obj = objective(sim), g = obj.target, key = obj.id;
  if (key !== bot.goalKey) { bot.goalKey = key; fillField(bot.field, g.x, g.z); }
  flow(bot.field, p.x, p.z, _f);
  const gdx = _f.x, gdz = _f.z, gdist = Math.hypot(g.x - p.x, g.z - p.z);
  const turnTo = (yaw, rate) => { bot.yaw += clamp(wrap(yaw - bot.yaw), -rate * dt, rate * dt); };
  const moveWorld = (wx, wz) => {
    const fx = -Math.sin(bot.yaw), fz = -Math.cos(bot.yaw), rx = Math.cos(bot.yaw), rz = -Math.sin(bot.yaw);
    out.mz = wx * fx + wz * fz; out.mx = wx * rx + wz * rz;
  };
  if (bot.level === 'reckless') {
    turnTo(Math.atan2(-gdx, -gdz), 6); moveWorld(gdx, gdz); out.sprint = true;
    out.use = !!sim.near; out.yaw = bot.yaw; out.pitch = 0;
    return out;
  }
  const shaky = bot.level === 'shaky';
  let best = null, bd = 1e9, threat = null;
  for (const e of sim.enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - p.x, e.z - p.z);
    if (e.type === 'charger' && (e.state === 'windup' || e.state === 'charge') && d < 16) threat = e;
    if (d > 11 || !los(p.x, p.z, e.x, e.z)) continue;
    const w = d - (e.type === 'charger' && e.state === 'stun' ? 6 : 0) + (e.type === 'charger' && e.state !== 'stun' ? 5 : 0);
    if (w < bd) { bd = w; best = e; }
  }
  if (best && best.id !== bot.target) { bot.target = best.id; bot.react = shaky ? 0.22 + bot.r() * 0.2 : 0.05; }
  bot.react -= dt; bot.errT -= dt; bot.strafeT -= dt;
  if (bot.errT <= 0) { bot.errT = 0.35; bot.aimErr = shaky ? gauss(bot.r) * 0.07 : 0; }
  if (bot.strafeT <= 0) { bot.strafeT = 0.8 + bot.r() * 0.8; bot.strafe = -bot.strafe; }
  if (shaky && bot.idle <= 0 && bot.r() < dt * 0.12) bot.idle = 0.5 + bot.r() * 0.6;
  bot.idle -= dt;
  const d2 = best ? Math.hypot(best.x - p.x, best.z - p.z) : 99;
  const sealing = sim.near && !sim.near.sealed;
  const fight = best && (d2 < 8.5 || sealing && d2 < 6);
  if (fight && bot.idle <= 0) {
    const T = TYPES[best.type], cy = best.y + (best.type === 'charger' ? 0.7 : 0.35);
    const yaw = Math.atan2(-(best.x - p.x), -(best.z - p.z)) + bot.aimErr;
    turnTo(yaw, shaky ? 5 : 14);
    bot.pitch = Math.atan2(cy - (p.y + P.eye), d2) + bot.aimErr * 0.5;
    const aimed = Math.abs(wrap(yaw - bot.yaw)) < 0.12;
    if (bot.react <= 0) {
      if (d2 < P.slapRange + T.r - 0.3 && best.y < 2.6) out.slap = true;
      else if (aimed && p.tank > 0 && !(best.type === 'charger' && best.state !== 'stun' && p.cans < 1)) out.fire = true;
      else if (aimed && p.tank <= 0 && d2 < 4) out.slap = d2 < P.slapRange + T.r;
    }
    const ux = (best.x - p.x) / (d2 || 1), uz = (best.z - p.z) / (d2 || 1);
    const back = d2 < 4.5 ? -0.8 : d2 > 7 ? 0.5 : 0;
    moveWorld(ux * back - uz * 0.7 * bot.strafe, uz * back + ux * 0.7 * bot.strafe);
    if (p.tank <= 0 && p.cans > 0) out.reload = true;
  } else {
    turnTo(Math.atan2(-gdx, -gdz), shaky ? 4 : 8); bot.pitch *= 0.9;
    if (bot.idle <= 0) moveWorld(gdx, gdz);
    out.sprint = gdist > 6 && !shaky;
    if (p.tank < 35 && p.cans > 0 && !best) out.reload = true;
  }
  if (threat && bot.idle <= 0) {
    const tx = threat.state === 'charge' ? threat.dx : -Math.sin(threat.yaw), tz = threat.state === 'charge' ? threat.dz : -Math.cos(threat.yaw);
    const side = ((p.x - threat.x) * -tz + (p.z - threat.z) * tx) >= 0 ? 1 : -1;
    let sx = -tz * side, sz = tx * side;
    if (!free(p.x + sx * 1.5, p.z + sz * 1.5, P.r)) { sx = -sx; sz = -sz; }
    if (!shaky || bot.r() < 0.75) moveWorld(sx, sz);
  }
  if (sealing && (!best || d2 > 6) && !(threat && Math.hypot(threat.x - p.x, threat.z - p.z) < 12)) { out.use = true; out.mx = 0; out.mz = 0; out.fire = false; }
  if (sealing && sim.near.prog > 0.8) out.use = true;
  out.yaw = bot.yaw; out.pitch = bot.pitch;
  return out;
}
export function runBot(seed, level, maxT = 600, opts) {
  const sim = createSim(seed, opts), bot = makeBot(level, seed), dt = 1 / 30;
  const log = { seals: [], stuck: 0, maxAlive: 0, telegraphs: 0, firstHurt: -1, stuns: 0, chargerSeen: 0, flyerSeen: 0 };
  let lastX = sim.player.x, lastZ = sim.player.z, still = 0;
  sim.keepEvents = false;
  while (sim.state === 'play' && sim.t < maxT) {
    const inp = botInput(sim, bot, dt);
    stepSim(sim, dt, inp);
    for (const e of sim.events) {
      if (e.type === 'seal') log.seals.push(sim.t);
      if (e.type === 'telegraph') log.telegraphs++;
      if (e.type === 'stun') log.stuns++;
      if (e.type === 'hurt' && log.firstHurt < 0) log.firstHurt = sim.t;
      if (e.type === 'spawn' && e.kind === 'charger') log.chargerSeen++;
      if (e.type === 'spawn' && e.kind === 'flyer') log.flyerSeen++;
    }
    log.maxAlive = Math.max(log.maxAlive, aliveCount(sim));
    const mv = Math.hypot(sim.player.x - lastX, sim.player.z - lastZ);
    const wants = Math.hypot(inp.mx, inp.mz) > 0.3 && !inp.use && !inp.fire && !inp.slap;
    if (wants && mv < 0.002) { still += dt; if (still > 3) { log.stuck++; still = 0; } } else still = 0;
    lastX = sim.player.x; lastZ = sim.player.z;
  }
  return { sim, log };
}
