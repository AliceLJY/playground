// 最靓的仔 · 广州小强奔跑模型。纯函数，不含 three.js；页面、面板、测试都读这一份。
// 单位：长度 mm，时间 s，速度 m/s，频率 Hz，力 mN。坐标：X 朝前，Y 朝上，Z 朝右；地面 y = 0。
// 数字与出处见 SPEC.md「数字与来源」：标〔实测〕的来自 Full & Tu 1991（J Exp Biol 156:215），其余是本展品的估值或模型。

export const SPEED_MAX = 1.5;            // 〔实测〕美洲大蠊最高奔跑速度约 1.5 m/s，≈ 50 体长/秒
export const BODY_LENGTH = 35;           // mm，美洲大蠊成虫体长 28–44 mm，取 35
export const MASS_G = 1.0;               // g，成虫约 1 g
export const WEIGHT_MN = MASS_G * 9.81;  // mN
export const SCALE = 85;
export const SLOW = 1 / 25;            // 页面慢放：真实 27 Hz 的步频看不清，放慢 25 倍                 // 展品放大倍数：35 mm → 2.98 m（「三米高的小强」）
export const FREQ_MAX = 27;              // 〔实测〕高速时步频接近飞行翅频 27 Hz
export const HIP_H = 7.0;                // mm，站立时髋关节离地高度（估）
export const GAIT_ZONES = [              // 〔实测〕1.0–1.5 m/s 时改用四足与二足奔跑
  { id: 'six', name: '六足 · 三足式', from: 0, to: 1.0 },
  { id: 'four', name: '四足（前足抬起）', from: 1.0, to: 1.25 },
  { id: 'two', name: '二足（只剩后足）', from: 1.25, to: SPEED_MAX },
];

// 三对腿的骨段长度 mm（估，按美洲大蠊比例：后足最长）与髋点（体坐标，身体原点在中胸、髋高）
export const LEGS = [
  { id: 'L1', pair: 0, name: '左前足', side: -1, hip: [9.0, -0.5, -4.2], coxa: 2.6, femur: 4.6, tibia: 4.4, tarsus: 3.6, rest: [9.5, -8.5], tripod: 0 },
  { id: 'R1', pair: 0, name: '右前足', side: 1, hip: [9.0, -0.5, 4.2], coxa: 2.6, femur: 4.6, tibia: 4.4, tarsus: 3.6, rest: [9.5, 8.5], tripod: 1 },
  { id: 'L2', pair: 1, name: '左中足', side: -1, hip: [3.0, -0.8, -4.8], coxa: 3.0, femur: 6.2, tibia: 6.6, tarsus: 4.6, rest: [0.5, -11.5], tripod: 1 },
  { id: 'R2', pair: 1, name: '右中足', side: 1, hip: [3.0, -0.8, 4.8], coxa: 3.0, femur: 6.2, tibia: 6.6, tarsus: 4.6, rest: [0.5, 11.5], tripod: 0 },
  { id: 'L3', pair: 2, name: '左后足', side: -1, hip: [-4.0, -0.8, -4.6], coxa: 3.4, femur: 8.0, tibia: 9.6, tarsus: 5.6, rest: [-11.5, -11.0], tripod: 0 },
  { id: 'R3', pair: 2, name: '右后足', side: 1, hip: [-4.0, -0.8, 4.6], coxa: 3.4, femur: 8.0, tibia: 9.6, tarsus: 5.6, rest: [-11.5, 11.0], tripod: 1 },
];
export const PAIR_NAMES = ['前足', '中足', '后足'];

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const v3 = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** 步频 Hz：低速随速度上升，1 m/s 以上趋近 27 Hz〔实测：高速时步频几乎不再增加〕 */
export const strideFrequency = (v) => (v <= 0 ? 0 : FREQ_MAX * Math.tanh(v / 0.75));
/** 步幅 mm = 速度 / 步频；高速靠步幅变长〔实测〕 */
export const strideLength = (v) => (v <= 0 ? 0 : (v * 1000) / strideFrequency(v));
/** 占空比（一步里脚着地的时间比例）；低于 0.5 就出现腾空相〔实测：1 m/s 以上有腾空相〕 */
export const dutyFactor = (v) => clamp(0.62 - 0.18 * v, 0.35, 0.62);
export const gaitZone = (v) => GAIT_ZONES.find((z) => v < z.to) || GAIT_ZONES[GAIT_ZONES.length - 1];
export const bodyLengthsPerSecond = (v) => (v * 1000) / BODY_LENGTH;
/** 前足、中足离地的程度 0–1（速度带之间平滑过渡） */
export const liftFront = (v) => smooth(0.95, 1.1, v);
export const liftMid = (v) => smooth(1.2, 1.4, v);
/** 身体抬头角 deg：四足时略抬，二足时抬到约 30°（估） */
export const pitchDeg = (v, swag = 0) => lerp(8 * liftFront(v) + 22 * liftMid(v), 82, swag);
/** 触角后掠角 deg（相对身体朝前的方向）：停着时前伸 25°，跑得越快越往后甩；展品姿态甩成「双马尾」 */
export const antennaSweepDeg = (v, swag = 0) => lerp(25 + 55 * (v / SPEED_MAX), 125, swag);
/** 腾空相 0–1：占空比低于 0.5 时两组三足之间的空档 */
export const aerialFraction = (v) => Math.max(0, 1 - 2 * dutyFactor(v));

/** 旋转：绕 Z 轴把点抬头 pitch（弧度），再平移 */
const bodyToWorld = (p, pitch, pos) => {
  const c = Math.cos(pitch), s = Math.sin(pitch);
  return [pos[0] + p[0] * c - p[1] * s, pos[1] + p[0] * s + p[1] * c, pos[2] + p[2]];
};

/** 两段 IK：从 C 到 A，膝盖往 up 一侧弯；返回膝点 */
function knee2(C, A, l1, l2, up) {
  let d = sub(A, C); let D = len(d);
  const reach = l1 + l2 - 0.05;
  if (D > reach) { d = norm(d); D = reach; A = v3(C, d, D); } else d = norm(d);
  const a = Math.acos(clamp((l1 * l1 + D * D - l2 * l2) / (2 * l1 * D), -1, 1));
  // 弯曲方向：垂直于 d、朝 up
  let b = sub(up, [d[0] * dot(up, d), d[1] * dot(up, d), d[2] * dot(up, d)]);
  if (len(b) < 1e-6) b = [0, 1, 0]; b = norm(b);
  const K = v3(v3(C, d, Math.cos(a) * l1), b, Math.sin(a) * l1);
  return { K, A };
}

/**
 * 整只虫的姿态：一个输入 v（m/s）加时间 t。
 * opts.swag 0–1 展品姿态（最靓的仔），opts.wings 0–1 翅膀张开。
 * 返回世界坐标里每条腿的 H(髋) C(基节末) K(膝) A(踝) P(跗节尖) 与载荷，以及身体位置、抬头角等读数。
 */
export function pose(v, t, opts = {}) {
  v = clamp(v, 0, SPEED_MAX);
  const swag = clamp(opts.swag || 0, 0, 1);
  const f = strideFrequency(v) * (1 - swag);
  const s = strideLength(v);
  const duty = dutyFactor(v);
  const zone = gaitZone(v);
  const lf = Math.max(liftFront(v), swag), lm = Math.max(liftMid(v), swag);
  const pitch = (pitchDeg(v, swag) * Math.PI) / 180;
  // 身体上下起伏：每步两次，幅度随速度增大；展品姿态时静止呼吸
  const bobA = (0.25 + 1.1 * v) * (1 - swag);
  // cyc：已走过的步态周期数。页面把步频按慢放倍数积分后传进来；没传就按恒速 t × f 算（测试用）
  const cyc = opts.cycle !== undefined ? opts.cycle : t * f;
  const bob = bobA * Math.sin(2 * Math.PI * 2 * cyc) + swag * 0.25 * Math.sin(2 * Math.PI * 0.6 * t);
  // 后髋当支点：抬头时后足不动
  const hindHipLocal = [-4.0, -0.8, 0];
  // 展品姿态：身体立起来，腹尾点地当第三条腿（袋鼠式），髋抬到 14.5 mm 才不会把腹部插进地里
  const c = Math.cos(pitch), si = Math.sin(pitch);
  // 腹尾相对后髋的高度；抬头时髋至少要抬到让腹尾离地 0.3 mm（过渡中途也不插进地里）
  const tipRelY = (-17.6 - hindHipLocal[0]) * si + (-0.6 - hindHipLocal[1]) * c;
  const hindHipWorldY = Math.max(lerp(HIP_H, 14.5, swag) + bob, 0.3 - tipRelY);
  const pos = [-(hindHipLocal[0] * c - hindHipLocal[1] * si), hindHipWorldY - (hindHipLocal[0] * si + hindHipLocal[1] * c), 0];
  const fwd = [c, si, 0], up = [-si, c, 0];
  const stanceCount = zone.id === 'six' ? 3 : zone.id === 'four' ? 2 : 1;
  // 分担体重的「有效脚数」：一组三足里每对腿按没抬起的程度算，过渡中途也守恒
  const shareN = (1 - lf) + (1 - lm) + 1;

  const legs = LEGS.map((L) => {
    const H = bodyToWorld(L.hip, pitch, pos);
    const out = [0, 0, L.side];
    // 基节：从髋往外、往下、稍朝前
    const C = v3(H, norm([0.15, -0.55, 0.8 * L.side]), L.coxa);
    const phase = ((cyc + L.tripod * 0.5) % 1 + 1) % 1;
    const stance = phase < duty;
    // 地面脚点（世界系，踏步机：身体不动，脚在地上向后划）
    // 脚相对身体的划动距离 = 步幅 × 占空比（着地那段时间里身体走过的路）
    const ex = s * duty;
    const restX = lerp(L.rest[0], L.pair === 2 ? 1.5 : L.rest[0], swag), restZ = lerp(L.rest[1], L.pair === 2 ? 9.5 * L.side : L.rest[1], swag);
    let fx, fy;
    if (stance) { const u = phase / duty; fx = restX + ex / 2 - ex * u; fy = 0; }
    else { const u = (phase - duty) / (1 - duty); fx = restX - ex / 2 + ex * u; fy = (1.6 + 2.2 * v) * Math.sin(Math.PI * u); }
    if (v <= 0) { fx = restX; fy = 0; }
    fx = lerp(fx, restX, swag); fy *= 1 - swag;
    const P = [fx, fy, restZ];
    // 跗节平贴地面，从踝往外前伸
    const tdir = norm([0.35, 0, L.side]);
    const A = v3(v3(P, tdir, -L.tarsus), [0, 1, 0], 0.9);
    let kneeUp = norm(v3([0, 1, 0], out, 0.6));
    let ik = knee2(C, A, L.femur, L.tibia, kneeUp);
    let K = ik.K, A2 = ik.A, P2 = P;
    let load = 0;
    // 一步里脚的冲量加起来要等于体重：峰值 = 体重/同时着地数 × (π/2) / (2×占空比)
    if (stance && v > 0) load = (WEIGHT_MN / shareN) * (Math.PI / 2) * Math.sin((Math.PI * phase) / duty) / (2 * duty);
    if (v <= 0 || swag >= 1) load = WEIGHT_MN / (L.pair === 2 && swag >= 1 ? 2 : 6) * (L.pair === 2 || swag < 1 ? 1 : 0);
    else if (swag > 0) load = lerp(load, L.pair === 2 ? WEIGHT_MN / 2 : 0, swag);
    // 抬起的腿（高速时前足、中足；展品姿态里前足当手、中足当胳膊）
    const lift = L.pair === 0 ? lf : L.pair === 1 ? lm : 0;
    if (lift > 0) {
      let tuckA, tuckK, tuckP;
      if (L.pair === 0) { // 前足收到头下、再在展品姿态里叉腰
        const run = { K: [12.5, -1.0, 7.5 * L.side], A: [14.5, -2.6, 5.0 * L.side], P: [16.5, -2.2, 4.0 * L.side] };
        const pose = { K: [8.5, -4.5, 9.5 * L.side], A: [6.0, -5.5, 6.0 * L.side], P: [5.0, -5.0, 4.5 * L.side] };
        tuckK = mix3(run.K, pose.K, swag); tuckA = mix3(run.A, pose.A, swag); tuckP = mix3(run.P, pose.P, swag);
      } else { // 中足：奔跑时贴身后摆，展品姿态里举起来秀肌肉
        const run = { K: [1.0, 1.5, 10.5 * L.side], A: [-5.0, -1.5, 9.0 * L.side], P: [-8.5, -2.5, 8.0 * L.side] };
        const pose = { K: [5.5, 5.5, 11.5 * L.side], A: [8.0, 10.5, 7.0 * L.side], P: [9.0, 12.5, 4.5 * L.side] };
        tuckK = mix3(run.K, pose.K, swag); tuckA = mix3(run.A, pose.A, swag); tuckP = mix3(run.P, pose.P, swag);
      }
      const wobble = swag * 0.35 * Math.sin(2 * Math.PI * 0.6 * t + L.side);
      const tK = bodyToWorld(v3(tuckK, [0, 1, 0], wobble), pitch, pos), tA = bodyToWorld(v3(tuckA, [0, 1, 0], wobble), pitch, pos), tP = bodyToWorld(v3(tuckP, [0, 1, 0], wobble), pitch, pos);
      // 收腿时保持骨长：踝由膝沿方向定
      const Kb = mix3(K, tK, lift), Ab = mix3(A2, tA, lift), Pb = mix3(P2, tP, lift);
      const kd = norm(sub(Kb, C)); K = v3(C, kd, L.femur);
      const ad = norm(sub(Ab, K)); A2 = v3(K, ad, L.tibia);
      const pd = norm(sub(Pb, A2)); P2 = v3(A2, pd, L.tarsus);
      load *= 1 - lift;
    }
    const down = swag > 0.5 ? L.pair === 2 : v <= 0 ? true : stance && lift < 0.5;
    return { ...L, H, C, K, A: A2, P: P2, phase, stance: down, load, lift };
  });

  // 面板读数
  const feetDown = legs.filter((l) => l.stance).length;
  const comLocal = [1.0, 1.0, 0];
  const com = bodyToWorld(comLocal, pitch, pos);
  const tipLocal = [-17.6, -0.6, 0];
  const tip = bodyToWorld(tipLocal, pitch, pos);
  const headLocal = [14.5, 0.8, 0];
  const head = bodyToWorld(headLocal, pitch, pos);
  return {
    v, t, f, cycle: cyc, stride: s, duty, zone, pitchDeg: (pitch * 180) / Math.PI, pitch, pos, fwd, up, bob,
    swag, wings: clamp(opts.wings || 0, 0, 1),
    antennaDeg: antennaSweepDeg(v, swag), bodyLengthsPerSec: bodyLengthsPerSecond(v), aerial: aerialFraction(v),
    liftFront: lf, liftMid: lm, feetDown, com, head, tip, comHeight: com[1], headHeight: head[1], legs,
    stanceCount, totalLoad: legs.reduce((a, l) => a + l.load, 0),
  };
}

/** 一个步态周期里六条腿的着地区间（给步态图），返回每腿 [起, 止) 在 0–1 周期上的区间列表 */
export function gaitDiagram(v) {
  const duty = dutyFactor(v), lf = liftFront(v), lm = liftMid(v);
  return LEGS.map((L) => {
    const lifted = L.pair === 0 ? lf > 0.5 : L.pair === 1 ? lm > 0.5 : false;
    const start = L.tripod * 0.5;
    const spans = lifted || v <= 0 ? (v <= 0 ? [[0, 1]] : []) : start + duty <= 1 ? [[start, start + duty]] : [[start, 1], [0, start + duty - 1]];
    return { id: L.id, name: L.name, lifted, spans };
  });
}

/** 摄像机预设（世界系 mm），给页面与截图机位共用 */
export const VIEWS = {
  hero: { pos: [62, 34, 58], target: [-1, 6, 0], name: '主视' },
  front: { pos: [56, 13, 16], target: [0, 7, 0], name: '正面' },
  pose: { pos: [96, 25, 13], target: [0, 13.5, 0], name: '亮相' },
  side: { pos: [0, 16, 84], target: [-1, 7, 0], name: '侧面' },
  top: { pos: [8, 118, 6], target: [-3, 0, 0], name: '俯视' },
  leg: { pos: [-30, 14, 40], target: [-9, 4, 7], name: '跟后足' },
  street: { pos: [56, 3, 42], target: [0, 11, 0], name: '街面仰拍' },
};

/** 子系统清单：按钮、标注、爆炸方向共用 */
export const SUBSYSTEMS = [
  { id: 'head', name: '头与触角', en: 'head & antennae', note: '复眼约 2000 个小眼；触角与体长相当，是它的鼻子和尺子' },
  { id: 'pronotum', name: '前胸背板', en: 'pronotum', note: '把头盖住的那块盾，边上一圈淡黄——认美洲大蠊就认它' },
  { id: 'legs0', name: '前足', en: 'forelegs', note: '最短的一对，高速时第一个抬离地面' },
  { id: 'legs1', name: '中足', en: 'midlegs', note: '1.25 m/s 以上也抬起，只剩后足在跑' },
  { id: 'legs2', name: '后足', en: 'hindlegs', note: '最长最壮，胫节带刺；二足奔跑全靠这一对' },
  { id: 'wings', name: '翅', en: 'wings', note: '革质前翅像风衣，膜质后翅折扇一样收在下面' },
  { id: 'abdomen', name: '腹节与尾须', en: 'abdomen & cerci', note: '尾须测气流，被风吹到约 50 ms 内起跑' },
];
