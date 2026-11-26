// 「有个看不见的编辑在改这份演讲」的笔画：光标、选框、文字光标、打字、印章、划线。
// 全部画在 2D 画布上，再当贴图用；时间由调用方算好传进来，同一时刻画出来的一定一样（无随机、无墙钟）。
import { C, FONT, rr } from './shell.js';

export const AI = '#3CC6EA';       // 它的光标
export const AI_INK = '#0E9FC2';   // 它在浅色纸上留下的勾、字
export const SEL = '#3B78E7';      // 选框
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const ease = k => { k = clamp(k); return k * k * (3 - 2 * k); };
export const easeOut = k => 1 - Math.pow(1 - clamp(k), 3);
export const seg = (t, a, b) => clamp((t - a) / (b - a));   // t 在 [a,b] 之间走到哪

// 鼠标箭头。who: 'me' 白底黑边 | 'ai' 青色。s 是箭头高度（像素）。
export function cursor(c, x, y, s, who = 'me', alpha = 1) {
  if (alpha <= 0) return;
  const u = s / 24;
  c.save(); c.globalAlpha = alpha; c.translate(x, y); c.scale(u, u);
  c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 19); c.lineTo(4.6, 15); c.lineTo(7.6, 22); c.lineTo(10.6, 20.8); c.lineTo(7.7, 14); c.lineTo(13.5, 14); c.closePath();
  c.shadowColor = 'rgba(0,0,0,.28)'; c.shadowBlur = 3; c.shadowOffsetY = 1;
  c.fillStyle = who === 'ai' ? AI : '#FFFFFF'; c.fill(); c.shadowColor = 'transparent';
  c.lineJoin = 'round'; c.lineWidth = 1.4; c.strokeStyle = who === 'ai' ? '#06303C' : '#111'; c.stroke();
  c.restore();
}

// 选框加八个拉手（像在编辑软件里选中一个对象）
export function selection(c, x, y, w, h, alpha = 1, scale = 1) {
  if (alpha <= 0) return;
  c.save(); c.globalAlpha = alpha; c.strokeStyle = SEL; c.lineWidth = 2 * scale; c.strokeRect(x, y, w, h);
  const r = 5 * scale;
  for (const [px, py] of [[0, 0], [.5, 0], [1, 0], [1, .5], [1, 1], [.5, 1], [0, 1], [0, .5]]) {
    c.beginPath(); c.arc(x + px * w, y + py * h, r, 0, 7); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 1.6 * scale; c.stroke();
  }
  c.restore();
}

// 文字光标（竖线），t 用来闪：每 0.53 秒一次
export function caret(c, x, y, h, t, col = '#111', always = false) {
  if (!always && Math.floor(t / .53) % 2) return;
  c.save(); c.fillStyle = col; c.fillRect(x, y, Math.max(2, h * .06), h); c.restore();
}

// 打字：按时间返回已经打出来的那一截（中文一个字算一下）
export function typed(str, t, a, cps = 9) {
  const chars = [...str]; const n = Math.floor(clamp((t - a) * cps, 0, chars.length));
  return chars.slice(0, n).join('');
}
// 先从尾巴一个个删掉 from，再打出 to；返回此刻屏上的字和光标该不该常亮（正在动就常亮）
export function retype(from, to, t, a, delCps = 14, cps = 8) {
  const f = [...from], tt = t - a;
  if (tt < 0) return { s: from, busy: false };
  const del = Math.floor(tt * delCps);
  if (del < f.length) return { s: f.slice(0, f.length - del).join(''), busy: true };
  const t2 = tt - f.length / delCps - .35;
  if (t2 < 0) return { s: '', busy: true };
  const n = Math.floor(t2 * cps), to2 = [...to];
  return { s: to2.slice(0, Math.min(n, to2.length)).join(''), busy: n < to2.length };
}

// 红色圆角印章，k 0–1 是盖下来的过程（先大后小再停住）
export function stamp(c, x, y, text, size, k, rot = -.12, col = '#D93025') {
  if (k <= 0) return;
  const s = k < .6 ? 1.8 - 1.0 * ease(k / .6) : .8 + .2 * ease((k - .6) / .4);
  const a = clamp(k * 3);
  c.save(); c.translate(x, y); c.rotate(rot); c.scale(s, s); c.globalAlpha = a;
  c.font = FONT(9, size); c.textAlign = 'center'; c.textBaseline = 'middle';
  const w = c.measureText(text).width + size * .7, h = size * 1.35;
  c.strokeStyle = col; c.lineWidth = size * .09; rr(c, -w / 2, -h / 2, w, h, size * .18); c.stroke();
  c.lineWidth = size * .03; rr(c, -w / 2 + size * .12, -h / 2 + size * .12, w - size * .24, h - size * .24, size * .12); c.stroke();
  c.fillStyle = col; c.fillText(text, 0, size * .04);
  c.globalCompositeOperation = 'destination-out';           // 印泥不匀：抠掉一些细点
  for (let i = 0; i < 90; i++) { const px = Math.sin(i * 12.9898) * 43758.5453 % 1, py = Math.sin(i * 78.233) * 12345.678 % 1; c.globalAlpha = .55; c.fillRect(px * w / 2, py * h / 2, size * .035, size * .035); }
  c.restore();
}

// 划掉一行：从左到右画一道略歪的红线
export function strike(c, x, y, w, k, col = '#D93025', lw = 6) {
  if (k <= 0) return;
  c.save(); c.strokeStyle = col; c.lineWidth = lw; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x, y + 3); c.lineTo(x + w * ease(k), y - 3 + 6 * ease(k) * .3); c.stroke(); c.restore();
}

// 一条从 a 到 b 的光标路线（可带犹豫的小圈）：返回 t 时刻光标位置。
// knot：在终点前 k0 处画一个小圈再走，像人在框前停了一下。
export function path(p0, p1, k, knot = 0, wobble = 0) {
  const e = ease(k);
  let x = p0[0] + (p1[0] - p0[0]) * e, y = p0[1] + (p1[1] - p0[1]) * e;
  // 人手的弧线
  x += Math.sin(e * Math.PI) * wobble * .6; y -= Math.sin(e * Math.PI) * wobble;
  if (knot > 0) {   // 在 0.72–0.92 之间绕一个小圈
    const q = clamp((k - .72) / .2);
    if (q > 0 && q < 1) { const a = q * Math.PI * 2; x += Math.sin(a) * knot; y += (1 - Math.cos(a)) * knot * .7; }
  }
  return [x, y];
}

// 圆角气泡里的一句话（给它说的话用）
export function bubble(c, x, y, w, text, size, col = AI_INK, bg = '#FFFFFF', alpha = 1) {
  if (alpha <= 0 || !text) return 0;
  c.save(); c.globalAlpha = alpha; c.font = FONT(5, size);
  const lines = wrap(c, text, w - size * 1.6), lh = size * 1.45, h = lines.length * lh + size * 1.1;
  c.shadowColor = 'rgba(0,0,0,.18)'; c.shadowBlur = size * .6; c.shadowOffsetY = size * .15;
  rr(c, x, y, w, h, size * .5); c.fillStyle = bg; c.fill(); c.shadowColor = 'transparent';
  c.fillStyle = col; c.textBaseline = 'top';
  lines.forEach((l, i) => c.fillText(l, x + size * .8, y + size * .55 + i * lh));
  c.restore(); return h;
}
export function wrap(c, text, maxW) {
  const out = []; let line = '';
  for (const ch of [...text]) { if (c.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; } else line += ch; }
  if (line) out.push(line); return out;
}
