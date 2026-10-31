// 自动导览：一段 36 秒的剧本，tourAt(t) 只依赖时间（录片时任意时刻都能直接算出来）。
import { strideFrequency, SLOW, SPEED_MAX } from './model.js';

export const TOUR_S = 36;
const tracks = {
  // [时刻 s, 值]：两个关键帧之间用缓动过渡，过渡时长写在第三项（缺省 1.2 s，在下一个关键帧之前完成）
  v: [[0, 0.25], [3.6, 0.25], [6.4, 0.9, 2.6], [10.6, 0.9], [12.2, 1.2, 1.5], [14.2, 1.2], [15.6, 1.5, 1.3], [20.4, 1.5], [22.0, 0.3, 1.6], [27.4, 0.3], [29.2, 0, 1.6], [34.0, 0], [35.4, 0.25, 1.3]],
  swag: [[0, 0], [29.0, 0], [30.6, 1, 1.5], [33.8, 1], [35.0, 0, 1.1]],
  wings: [[0, 0], [24.6, 0], [25.6, 1, 1.0], [27.6, 1], [28.4, 0.55, 0.8], [33.8, 0.55], [34.8, 0, 0.9]],
  explode: [[0, 0], [21.4, 0], [23.0, 1, 1.5], [24.2, 1], [25.0, 0, 0.8]],
  xray: [[0, 0], [18.4, 0], [18.9, 1, 0.4], [20.9, 1], [21.0, 0, 0.1]],
};
const steps = {
  focus: [[0, null], [7.2, 'legs2'], [10.6, 'legs0'], [14.2, 'legs1'], [17.0, null], [24.6, 'wings'], [27.6, null]],
  view: [[0, 'hero'], [7.2, 'side'], [10.6, 'front'], [14.2, 'street'], [18.4, 'hero'], [24.6, 'top'], [28.6, 'pose'], [34.0, 'hero']],
  // 光标：走到哪个控件、在哪一刻按下（目标是 DOM 里 data-tour 的值）
  cursor: [[2.0, 'speed', 3.6], [5.6, 'legs2', 7.2], [9.0, 'legs0', 10.6], [12.6, 'legs1', 14.2], [16.8, 'xray', 18.4], [19.8, 'explode', 21.4], [23.0, 'wings', 24.6], [27.4, 'swag', 28.6]],
  caption: [
    [0, '广州小强·美洲大蠊。体长 35 毫米，这里放大 85 倍，差不多三米高。'],
    [3.6, '加速：六条腿分成两组三角形，轮流着地。'],
    [7.2, '后足最长最壮，胫节一排刺，跑起来主要靠它蹬。'],
    [10.6, '过了 1 米每秒，前足先抬离地面：四条腿跑。'],
    [14.2, '1.25 以上中足也抬起，只剩后足：两条腿跑（Full & Tu, 1991 实测）。'],
    [18.4, 'X 光：背上的壳和翅变透明，底下是胸和腹。'],
    [21.4, '慢下来，拆开：头、前胸背板、翅、腹、三对足，全挂在胸上。'],
    [24.6, '前翅是革质的「风衣」，后翅像折扇收在下面。'],
    [28.6, '收工，摆个姿势。'],
    [30.6, '最靓的仔。'],
    [34.0, ''],
  ],
};

const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * (x * (x * 6 - 15) + 10));
function track(keys, t) {
  let val = keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, dur = 1.2] = keys[i];
    if (t < t1 - dur) break;
    const prev = val;
    val = t >= t1 ? v1 : prev + (v1 - prev) * ease((t - (t1 - dur)) / dur);
    if (t < t1) break;
  }
  return val;
}
const step = (keys, t) => { let v = keys[0][1]; for (const k of keys) if (t >= k[0]) v = k[1]; else break; return v; };

/** 镜头：切到新机位后 1.6 s 缓动过去 */
function viewAt(t) {
  let from = steps.view[0][1], to = from, k = 1;
  for (let i = 1; i < steps.view.length; i++) {
    const [t1, name] = steps.view[i];
    if (t < t1) break;
    from = steps.view[i - 1][1]; to = name; k = ease((t - t1) / 1.6);
  }
  return { from, to, k };
}
function cursorAt(t) {
  let cur = null;
  for (const [t0, target, press] of steps.cursor) if (t >= t0 - 1.4) cur = { target, t0, press, moving: ease((t - (t0 - 1.4)) / 1.4), pressed: t >= press && t < press + 0.35 };
  return cur;
}

// 步态周期与地面走过的距离，载入时按 1/240 s 积分成表（两者都随速度变，不能用 t×f 直接算）
const DT = 1 / 240, N = Math.ceil(TOUR_S / DT) + 1;
const CYC = new Float64Array(N), DIST = new Float64Array(N);
for (let i = 1; i < N; i++) {
  const tm = (i - 0.5) * DT, v = track(tracks.v, tm), sw = track(tracks.swag, tm);
  CYC[i] = CYC[i - 1] + strideFrequency(v) * (1 - sw) * SLOW * DT;
  DIST[i] = DIST[i - 1] + v * 1000 * (1 - sw) * SLOW * DT;
}
const table = (arr, t) => { const x = Math.min(Math.max(t, 0), TOUR_S) / DT, i = Math.min(Math.floor(x), N - 2); return arr[i] + (arr[i + 1] - arr[i]) * (x - i); };

/** 导览在 t 秒时的全部状态 */
export function tourAt(t) {
  t = ((t % TOUR_S) + TOUR_S) % TOUR_S;
  return {
    t,
    v: Math.min(SPEED_MAX, Math.max(0, track(tracks.v, t))),
    swag: track(tracks.swag, t), wings: track(tracks.wings, t), explode: track(tracks.explode, t), xray: track(tracks.xray, t) > 0.5,
    focus: step(steps.focus, t), view: viewAt(t), cursor: cursorAt(t), caption: step(steps.caption, t),
    cycle: table(CYC, t), ground: table(DIST, t),
  };
}
/** 固定机位：导览里的时刻，截图和验收共用 */
export const SHOTS = { hero: 1.5, tripod: 6.9, hind: 9.8, four: 13.6, biped: 16.8, xray: 20.2, explode: 23.8, wings: 27.0, swag: 32.4 };
export const _tracks = { tracks, steps };
