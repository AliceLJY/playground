// 自动导览：50 秒的剧本，tourAt(t) 只依赖时间（录片时任意时刻都能直接算）。
// 剧本只写「t 秒时拆到进度 s」和镜头、旁白、光标；零件怎么动全由 model.pose(s) 决定。
import { S_MAX, SSD_SHOW } from './model.js';

export const TOUR_S = 50;
export const SUMMARY_AT = 41.6;
// [时刻 s, 拆解进度]。两点之间匀速（连续运动用线性）。三处放慢：掀开底盖、拆风扇看到 SSD、拔出 SSD（含特写）。
const S_KEYS = [
  [0, 0], [0.5, 0], [2.6, 1],
  [3.6, 2], [4.6, 3], [5.8, 4], [7.2, 5], [8.8, 6], [10.0, 7], [11.0, 8], // 底盖：8.4 秒
  [13.2, 9], [13.8, 10], [14.4, 11], [15.6, 12], // 内板：快进
  [17.4, 13], [18.6, 14], [19.2, 15], [19.8, 16], [20.6, 17], [22.0, 18], [23.4, 18], // 风扇 → 看到 SSD
  [26.0, 19], // 顺带看内存：2.6 秒
  [27.6, 20], [29.4, 21], [31.6, 22], // 拔出 SSD
  [41.5, 23], [TOUR_S, 23], // 特写，然后总结卡
];
const steps = {
  view: [[0, 'open'], [2.3, 'hero'], [7.0, 'back'], [10.8, 'hero'], [15.4, 'fan'], [21.4, 'ssd'], [23.2, 'chip'], [25.8, 'ssd'], [31.0, 'show'], [SUMMARY_AT, 'summary']],
  caption: [
    [0, 'Mac mini 硬盘不够用了，能自己换吗？'],
    [2.7, '照 iFixit 的换 SSD 指南拆一遍：一共 21 步。'],
    [4.9, '底盖没有螺丝，四个角是 4 个销钉。'],
    [7.3, '掀开先别扯：底盖还连着电源键排线，很脆。'],
    [11.0, '里面一层内板：8 颗 T5 螺丝。'],
    [15.6, '风扇：4 颗螺丝，加一个 ZIF 排线接头。'],
    [21.6, '风扇拿走，SSD 就躺在耳机孔旁边。'],
    [23.5, '顺带一眼：内存是焊在 M4 旁边的颗粒，加不了。'],
    [26.1, 'SSD 只靠 1 颗 8IP 螺丝固定。'],
    [29.5, '撬开、斜着一提，拔出来了。'],
    [31.8, '它长得像一块普通的 M.2 固态硬盘……'],
    [34.6, '但模块上没有存储控制器，控制器做在 M4 芯片里。'],
    [37.8, '所以普通 M.2 硬盘插不上，只能换同类型的模块。'],
    [SUMMARY_AT, ''],
  ],
  // 光标：走到哪个控件、在哪一刻按下（目标是 DOM 里 data-tour 的值）
  cursor: [[1.4, 'next', 2.5], [9.9, 'dial', 11.0], [20.9, 'next', 22.0], [30.5, 'next', 31.6]],
};
// 特写里的标注（贴在 SSD 上，随它翻面）
export const SSD_NOTES = [
  [32.0, 41.5, 'gold', '金手指：看着像 M.2'],
  [35.0, 41.5, 'nand', '一面一颗 128 GB 闪存（两面共两颗）'],
];
// 机位：目标点、方位角（从 +z 往 +x 转）、仰角、要框住的半径（mm）。tall 是竖屏版（螺丝盘在机身正前方）。
export const VIEWS = {
  open: { t: [0, 25, 0], az: 28, el: 20, r: 92 },
  hero: { t: [0, 22, 6], az: 30, el: 50, r: 104, tall: { t: [0, 18, 40], az: 12, el: 56, r: 128 } },
  back: { t: [0, 52, -30], az: 38, el: 26, r: 116, tall: { t: [0, 48, -20], az: 30, el: 30, r: 122 } },
  fan: { t: [18, 28, 12], az: 24, el: 56, r: 84 },
  ssd: { t: [-36, 18, 28], az: 18, el: 60, r: 58 },
  chip: { t: [8, 20, -30], az: 22, el: 64, r: 58 },
  show: { t: [SSD_SHOW.p[0], SSD_SHOW.p[1] + 8, SSD_SHOW.p[2]], az: 6, el: 22, r: 44 },
  summary: { t: [0, 26, 4], az: 30, el: 42, r: 118, tall: { t: [0, 22, 36], az: 14, el: 48, r: 142 } },
};

const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * (x * (x * 6 - 15) + 10));
const step = (keys, t) => { let v = keys[0][1]; for (const k of keys) if (t >= k[0]) v = k[1]; else break; return v; };
const stepAt = (keys, t) => { let at = keys[0][0]; for (const k of keys) if (t >= k[0]) at = k[0]; else break; return at; };

/** 导览在 t 秒时拆到哪 */
export function sAt(t) {
  t = Math.min(Math.max(t, 0), TOUR_S);
  for (let i = 1; i < S_KEYS.length; i++) {
    const [t1, s1] = S_KEYS[i], [t0, s0] = S_KEYS[i - 1];
    if (t <= t1) return s0 + (s1 - s0) * ((t - t0) / (t1 - t0));
  }
  return S_MAX;
}
/** 反过来：进度 s 对应剧本里的哪一刻（访客自己拆时按导览同样的节奏走、配同一句旁白） */
export function timeAt(s) {
  for (let i = 1; i < S_KEYS.length; i++) {
    const [t1, s1] = S_KEYS[i], [t0, s0] = S_KEYS[i - 1];
    if (s1 > s0 && s <= s1) return t0 + (t1 - t0) * ((s - s0) / (s1 - s0));
  }
  return SUMMARY_AT - 0.1;
}
/** 镜头：切到新机位后 1.4 s 缓动过去 */
function viewAt(t) {
  let from = steps.view[0][1], to = from, k = 1;
  for (let i = 1; i < steps.view.length; i++) {
    const [t1, name] = steps.view[i];
    if (t < t1) break;
    from = steps.view[i - 1][1]; to = name; k = ease((t - t1) / 1.4);
  }
  return { from, to, k };
}
export const viewNameAt = (t) => step(steps.view, t);
function cursorAt(t) {
  let cur = null;
  for (const [t0, target, press] of steps.cursor) if (t >= t0 && t < press + 0.7) cur = { target, moving: ease((t - t0) / Math.min(1.0, press - t0 - 0.05)), pressed: t >= press && t < press + 0.32, fade: 1 - ease((t - press - 0.3) / 0.4) };
  return cur;
}
export const captionAt = (t) => ({ text: step(steps.caption, t), at: stepAt(steps.caption, t) });

/** 导览在 t 秒时的全部状态 */
export function tourAt(t) {
  t = Math.min(Math.max(t, 0), TOUR_S);
  const c = captionAt(t);
  return {
    t, s: sAt(t), view: viewAt(t), cursor: cursorAt(t), caption: c.text, captionAt: c.at,
    summary: ease((t - SUMMARY_AT) / 0.7),
    notes: SSD_NOTES.filter(([a, b]) => t >= a && t < b).map(([a, b, id, text]) => ({ id, text, k: Math.min(ease((t - a) / 0.4), 1 - ease((t - b + 0.3) / 0.3)) })),
  };
}
/** 固定机位：导览里的时刻，截图和验收共用 */
export const SHOTS = { open: 0.2, cover: 8.6, plate: 14.0, fan: 18.0, ssd: 23.0, ram: 25.0, pull: 30.2, show: 33.5, side: 36.5, done: 45.0 };
export const _steps = { S_KEYS, steps };
