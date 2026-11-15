// 自动导览：53.8 秒的剧本，tourAt(t) 只依赖时间（录片时任意时刻都能直接算）。
// 剧本只写「t 秒时拆到进度 s」和镜头、旁白、光标；零件怎么动全由 model.pose(s) 决定。
import { S_MAX, SSD_SHOW } from './model.js';

export const TOUR_S = 53.8;
export const SWAP_AT = 35.6;   // 换上第三方小板（硬切）
export const OUTRO_AT = 41.6;  // 我为什么没拆、最后怎么选（硬切到总结机位）
export const SUMMARY_AT = 47.8;
// [时刻 s, 拆解进度]。两点之间匀速（连续运动用线性）。三处放慢：掀开底盖、拆风扇看到 SSD、拔出 SSD（含特写与换板）。
const S_KEYS = [
  [0, 0], [0.5, 0], [2.2, 1],
  [3.0, 2], [3.8, 3], [4.9, 4], [6.1, 5], [7.6, 6], [8.6, 7], [9.4, 8], // 底盖：7.2 秒
  [11.2, 9], [11.7, 10], [12.2, 11], [13.2, 12], // 内板：快进
  [14.8, 13], [15.9, 14], [16.5, 15], [17.1, 16], [17.9, 17], [19.4, 18], [20.4, 18], // 风扇 → 看到 SSD：6.2 秒
  [23.0, 19], // 顺带看内存：2.6 秒
  [24.4, 20], [26.0, 21], [28.0, 22], // 拔出 SSD
  [SWAP_AT, 23], // 特写 7.6 秒
  [OUTRO_AT, 24], [TOUR_S, 24], // 换上第三方小板 6 秒，然后结尾和总结卡
];
const steps = {
  view: [[0, 'open'], [2.1, 'hero'], [6.6, 'back'], [9.2, 'hero'], [13.1, 'fan'], [19.2, 'ssd'], [20.6, 'chip'], [22.9, 'ssd'], [27.4, 'show'], [SWAP_AT, 'swap', 0], [OUTRO_AT, 'summary', 0]],
  // 大字旁白讲故事；步骤栏小字只写 iFixit 的操作要点（model.STAGES[].op），两行不说同一句话
  caption: [
    [0, 'Mac mini 硬盘满了，有人直接拆机换大容量。'],
    [2.2, '我不敢，那就在 3D 里替我拆一遍。'],
    [4.0, '照 iFixit 换 SSD 指南：一共 21 步。'],
    [5.9, '底盖没有螺丝，四个角是 4 个销钉。'],
    [7.4, '掀开先别扯：底盖还连着电源键排线，很脆。'],
    [9.6, '里面还有一层金属内板。'],
    [13.4, '再往下是风扇，底下压着一根排线。'],
    [19.3, '风扇拿走，SSD 就在耳机孔旁边。'],
    [20.7, '顺带一眼：内存是焊在 M4 旁边的颗粒，加不了。'],
    [23.2, '到了，硬盘就压在一颗螺丝下面。'],
    [25.8, '撬开、斜着一提，拔出来了。'],
    [28.2, '它长得像一块普通的 M.2 固态硬盘……'],
    [30.8, '但模块上没有存储控制器，控制器做在 M4 芯片里。'],
    [33.4, '所以普通 M.2 硬盘插不上，只能换同类型的模块。'],
    [SWAP_AT, '换上去的是一块第三方 2TB 小板：斜着插进同一个插槽，压平。'],
    [38.6, '螺丝落进那个半圆缺口，拧紧。'],
    [OUTRO_AT, '我怕影响保修；而且装好以后还得用另一台 Mac 的 Apple Configurator 做 DFU 刷机，整块盘抹掉重装系统。'],
    [46.0, '所以我最后接了一块外接硬盘。'],
    [SUMMARY_AT, ''],
  ],
  // 光标：走到哪个控件、在哪一刻按下（目标是 DOM 里 data-tour 的值）
  cursor: [[1.1, 'next', 2.1], [8.4, 'dial', 9.4], [18.4, 'next', 19.4], [27.0, 'next', 28.0]],
};
// 特写里的标注（贴在 SSD 上，随它翻面）
export const SSD_NOTES = [
  [28.9, 33.5, 'gold', '金手指：看着像 M.2'],
  [30.6, 33.5, 'nand', '一面一颗 128 GB 闪存（两面共两颗）'],
  [38.9, 41.4, 'notch', '8IP 螺丝压在半圆缺口里'],
];
// 机位：目标点、方位角（从 +z 往 +x 转）、仰角、要框住的半径（mm）。tall 是竖屏版（画面窄，框得松一点）。
export const VIEWS = {
  open: { t: [0, 25, 0], az: 28, el: 20, r: 92, tall: { t: [0, 25, 0], az: 28, el: 22, r: 74 } },
  hero: { t: [0, 22, 6], az: 30, el: 50, r: 104, tall: { t: [18, 20, 6], az: 24, el: 52, r: 88 } },
  back: { t: [0, 52, -30], az: 38, el: 26, r: 116, tall: { t: [8, 50, -22], az: 30, el: 30, r: 100 } },
  fan: { t: [18, 28, 12], az: 24, el: 56, r: 84, tall: { t: [14, 26, 8], az: 24, el: 56, r: 76 } },
  ssd: { t: [-30, 18, 24], az: 18, el: 58, r: 74, tall: { t: [-20, 18, 18], az: 18, el: 58, r: 68 } },
  chip: { t: [4, 22, -22], az: 22, el: 62, r: 84, tall: { t: [4, 22, -16], az: 22, el: 60, r: 76 } },
  show: { t: [SSD_SHOW.p[0], SSD_SHOW.p[1] + 4, SSD_SHOW.p[2]], az: 4, el: -8, r: 33 }, // 略微仰视：机身落到画外，特写背后只有素背景
  swap: { t: [-36, 20, 24], az: 20, el: 58, r: 58, tall: { t: [-30, 20, 22], az: 20, el: 58, r: 60 } },
  summary: { t: [-20, 20, 40], az: 24, el: 38, r: 104, tall: { t: [-24, 20, 30], az: 20, el: 40, r: 96 } },
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
/** 镜头：切到新机位后缓动过去（默认 1.4 s；第三项写 0 就是硬切，配一下泛白） */
function viewAt(t) {
  let from = steps.view[0][1], to = from, k = 1;
  for (let i = 1; i < steps.view.length; i++) {
    const [t1, name, d = 1.4] = steps.view[i];
    if (t < t1) break;
    from = steps.view[i - 1][1]; to = name; k = d > 0 ? ease((t - t1) / d) : 1;
  }
  return { from, to, k };
}
/** 硬切处的泛白：切点前后各 0.25 s，三角形 */
function dipAt(t) {
  let d = 0;
  for (const [t1, , dur = 1.4] of steps.view) if (dur === 0) d = Math.max(d, 1 - Math.abs(t - t1) / 0.25);
  return Math.max(0, d);
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
    summary: ease((t - SUMMARY_AT) / 0.7), dip: dipAt(t),
    notes: SSD_NOTES.filter(([a, b]) => t >= a && t < b).map(([a, b, id, text]) => ({ id, text, k: Math.min(ease((t - a) / 0.4), 1 - ease((t - b + 0.3) / 0.3)) })),
  };
}
/** 固定机位：导览里的时刻，截图和验收共用 */
export const SHOTS = { open: 0.2, cover: 8.0, plate: 12.4, fan: 16.0, ssd: 20.2, ram: 22.0, pull: 26.8, show: 30.0, back: 32.4, swap: 37.2, screw: 40.6, outro: 44.0, done: 50.0 };
export const _steps = { S_KEYS, steps };
