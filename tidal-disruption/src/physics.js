export const DURATION = 108;
export const STAGES = [
  ['接近', 'APPROACH', '一颗恒星正在沿轨道接近黑洞。', '恒星沿近抛物线轨道接近。黑洞两侧的引力差尚小，恒星仍完整；远处星光已沿弯曲的光路抵达你眼前。'],
  ['潮汐拉长', 'TIDAL STRETCHING', '引力差拉长恒星，外层物质逐渐剥离。', '恒星朝向黑洞的一面受到更强的引力。拉伸沿径向发生，横向收缩；表层物质先脱落，连续地加入拖尾。'],
  ['撕裂', 'DISRUPTION', '碎屑获得不同能量，沿不同轨道展开。', '不同碎屑得到不同的轨道能量。内侧先绕回，外侧绕行更慢，一部分物质沿开放的尾流远去。轨道进动使物质流逐渐交叉。'],
  ['回落与碰撞', 'FALLBACK & COLLISIONS', '回落物质流发生交叉，碰撞加热成蓝白色。', '束缚碎屑回落并撞上后续物质流。速度差转化为热，交叉处变成蓝白亮斑。这里通过密度图中的速度方差估计混流与激波加热。'],
  ['成盘', 'DISK FORMATION', '轨道逐渐环化，形成差分旋转的炽热盘。', '碰撞耗散轨道能量，使细长轨道逐渐环化。内圈转得更快；迎着观察者运动的一侧因多普勒增亮更明亮、更偏蓝。盘背面的光绕过黑洞，在上下方形成弧像。'],
  ['余波', 'AFTERMATH', '恒星已经消失，残余气体持续吸积。', '剩余气体继续向内输运，外侧逐渐稀薄，辐射缓慢减弱。这里保留温热的残盘，让光子环与时空透镜仍然可见。']
];
export const QUALITIES = [
  { name: '节能', scale: 0.30, steps: 96, side: 64, atlas: 384 },
  { name: '平衡', scale: 0.75, steps: 144, side: 96, atlas: 1024 },
  { name: '精细', scale: 1.00, steps: 192, side: 128, atlas: 1024 }
];
export const VIEWS = {
  wide: { time: 8, yaw: 0.12, elevation: 0.29, distance: 37 },
  hero: { time: 82, yaw: 0.16, elevation: 0.245, distance: 25 },
  edge: { time: 82, yaw: 0.10, elevation: 0.055, distance: 26 }
};
export const smooth = (a, b, x) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
export const clampTime = (t) => Number.isFinite(t) ? Math.max(0, Math.min(DURATION, t)) : 0;
export const stageAt = (t) => Math.min(5, Math.floor(clampTime(t) / 18));
export function starState(time, target = {}) {
  const f = -2.1 + 2.06 * smooth(0, 40, time);
  const r = 6.5 / (1 + .94 * Math.cos(f));
  const angle = f + 2.1;
  target.x = r * Math.cos(angle);
  target.z = r * Math.sin(angle);
  target.angle = angle;
  target.length = .72 + 2.05 * smooth(17, 36, time);
  target.width = .72 - .51 * smooth(17, 39, time);
  target.opacity = 1 - smooth(33, 45, time);
  return target;
}
// Independent numerical probe of the same Schwarzschild spatial orbit equation.
export function tracePhoton(impact, bending = true) {
  let x = impact, z = 45, vx = 0, vz = -1;
  const l2 = impact * impact;
  let crossings = 0;
  for (let i = 0; i < 2000; i++) {
    const r = Math.hypot(x, z);
    if (r < 1.015) return { captured: true, crossings, steps: i, deflection: 0 };
    if (r > 48) return { captured: false, crossings, steps: i, deflection: Math.acos(Math.max(-1, Math.min(1, -vz / Math.hypot(vx, vz)))) };
    const h = Math.min(.55, Math.max(.012, r * .025));
    const k = bending ? -1.5 * l2 / r ** 5 : 0;
    const ax = k * x, az = k * z;
    const nx = x + vx * h + .5 * ax * h * h;
    const nz = z + vz * h + .5 * az * h * h;
    const nr = Math.hypot(nx, nz);
    const nk = bending ? -1.5 * l2 / nr ** 5 : 0;
    vx += .5 * (ax + nk * nx) * h;
    vz += .5 * (az + nk * nz) * h;
    if (z * nz < 0) crossings++;
    x = nx; z = nz;
  }
  return { captured: false, crossings, steps: 2000, deflection: NaN };
}
export class AdaptiveQuality {
  constructor() { this.tier = 1; this.slow = 0; this.fast = 0; this.cooldown = 0; }
  sample(ms, now) {
    if (now < this.cooldown) return false;
    this.slow = ms > 40 ? this.slow + 1 : 0;
    this.fast = ms < 29 ? this.fast + 1 : 0;
    let next = this.tier;
    if (this.slow >= 45) next = Math.max(0, this.tier - 1);
    if (this.fast >= 240) next = Math.min(2, this.tier + 1);
    if (next === this.tier) return false;
    this.tier = next;
    this.slow = 0; this.fast = 0; this.cooldown = now + 8000;
    return true;
  }
}
