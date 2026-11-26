// 外壳：验证码框、九宫格挑战面板、图块。全部自己画，不仿任何真实产品的标识。
// 来源：外接盘《我不是机器人》v2 工程 film/shell.js（同一作者的原创代码），这里只把字体换成系统字体。
// 所有函数都是 (ctx, 位置, 状态) → 画出来；状态是 0–1 的数，由 main.js 按时间算好传进来。
export const C = {
  page: '#EEF0F2', box: '#F9F9F9', edge: '#D3D3D3', ink: '#222', mid: '#555', faint: '#9A9A9A',
  blue: '#3B78E7', blueD: '#2A5DB8', green: '#1E9E5A', red: '#D93025', check: '#1E9E5A',
  night: '#0E1220', ai: '#6FD3FF',
};
export const SANS = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", sans-serif';
export const FONT = (w, s) => `${w} ${s}px ${SANS}`;
export const MONO = s => `500 ${s}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export function rnd(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
export { rr };

// ---------- 验证码框 ----------
export const WG = { w: 780, h: 156 };
// o: { checked 0–1, spin 0–1（转圈等待）, label 文字透明度, warp 0–1（"器"字扭）, dot 0–1, seams 0–1, crack 0–1, hollow 0–1（标签被借走后留下的空位）, aiCheck 0–1 }
export function widget(c, x, y, o = {}, rep) {
  const { w, h } = WG;
  c.save(); c.translate(x, y);
  c.shadowColor = 'rgba(0,0,0,.12)'; c.shadowBlur = 10; c.shadowOffsetY = 2;
  rr(c, 0, 0, w, h, 6); c.fillStyle = C.box; c.fill(); c.shadowColor = 'transparent';
  c.lineWidth = 2; c.strokeStyle = C.edge; c.stroke();
  // 勾选框
  const bx = 44, by = h / 2 - 32, bs = 64;
  c.lineWidth = 4; c.strokeStyle = o.checked > 0 ? 'transparent' : '#B8B8B8'; c.fillStyle = '#fff';
  rr(c, bx, by, bs, bs, 4); c.fill(); if (!(o.checked > 0)) c.stroke();
  if (o.spin > 0 && !(o.checked > 0)) {
    c.strokeStyle = C.blue; c.lineWidth = 6; c.lineCap = 'round'; c.beginPath();
    const a0 = o.spin * 14; c.arc(bx + bs / 2, by + bs / 2, 24, a0, a0 + 4.2); c.stroke();
  }
  if (o.checked > 0) check(c, bx + 6, by + 6, bs - 12, o.checked, o.aiCheck ? C.ai : C.check);
  // 标签
  const lab = o.labelText ?? '我不是机器人';
  if ((o.label ?? 1) > 0) {
    c.globalAlpha = o.label ?? 1; c.font = FONT(5, 40); c.fillStyle = C.ink; c.textBaseline = 'middle';
    let lx = 140;
    for (const ch of lab) {
      const cw = c.measureText(ch).width;
      if (ch === '器' && o.warp > 0) {
        c.save(); c.translate(lx + cw / 2, h / 2); c.rotate(Math.sin(o.warp * 9) * .25 * o.warp); c.scale(1 + .25 * o.warp, 1 - .2 * o.warp); c.fillText(ch, -cw / 2, 0); c.restore();
      } else c.fillText(ch, lx, h / 2);
      lx += cw;
    }
    c.globalAlpha = 1;
    rep && rep('wlabel', lab, x + 140, y + h / 2 - 24, x + lx, y + h / 2 + 24);
  }
  if (o.hollow > 0) { c.setLineDash([10, 8]); c.strokeStyle = `rgba(0,0,0,${.25 * o.hollow})`; c.lineWidth = 2; rr(c, 132, h / 2 - 30, 260, 60, 6); c.stroke(); c.setLineDash([]); }
  // 右侧：自己画的盾形小标，不用任何真实产品的标识
  c.save(); c.translate(w - 92, h / 2 - 16);
  c.strokeStyle = '#8A9BB5'; c.lineWidth = 4; c.beginPath(); c.moveTo(0, -26); c.lineTo(24, -16); c.lineTo(22, 10); c.quadraticCurveTo(14, 28, 0, 34); c.quadraticCurveTo(-14, 28, -22, 10); c.lineTo(-24, -16); c.closePath(); c.stroke();
  c.beginPath(); c.arc(0, 2, 8, 0, Math.PI * 2); c.stroke();
  c.font = FONT(4, 20); c.fillStyle = C.faint; c.textAlign = 'center'; c.fillText('人机验证', 0, 64); c.restore();
  // 小红点（第一场埋的记号）
  if (o.dot > 0) { c.fillStyle = C.red; c.globalAlpha = o.dot; c.beginPath(); c.arc(w - 14, 14, 7, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; }
  // 接缝：第 5 场重新拼起来的框
  if (o.seams > 0) {
    c.strokeStyle = `rgba(120,120,120,${.6 * o.seams})`; c.lineWidth = 2; c.beginPath();
    c.moveTo(w * .31, 0); c.lineTo(w * .34, h * .45); c.lineTo(w * .29, h);
    c.moveTo(w * .66, 0); c.lineTo(w * .63, h * .6); c.lineTo(w * .7, h); c.stroke();
  }
  // 裂纹：第 7 场穿过标签
  if (o.crack > 0) crackLines(c, 140, h / 2, 520, o.crack);
  c.restore();
}
export function check(c, x, y, s, k, col = C.check) {
  c.save(); c.strokeStyle = col; c.lineWidth = s * .16; c.lineCap = 'round'; c.lineJoin = 'round';
  const p = [[x + s * .12, y + s * .55], [x + s * .4, y + s * .82], [x + s * .9, y + s * .18]];
  const L1 = Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]), L2 = Math.hypot(p[2][0] - p[1][0], p[2][1] - p[1][1]), d = k * (L1 + L2);
  c.beginPath(); c.moveTo(...p[0]);
  if (d <= L1) c.lineTo(p[0][0] + (p[1][0] - p[0][0]) * d / L1, p[0][1] + (p[1][1] - p[0][1]) * d / L1);
  else { c.lineTo(...p[1]); const e = (d - L1) / L2; c.lineTo(p[1][0] + (p[2][0] - p[1][0]) * e, p[1][1] + (p[2][1] - p[1][1]) * e); }
  c.stroke(); c.restore();
}
function crackLines(c, x0, y0, len, k) {
  const r = rnd(77); c.save(); c.strokeStyle = 'rgba(30,30,30,.75)'; c.lineWidth = 2.5; c.beginPath();
  let x = x0 - 60, y = y0 - 50; c.moveTo(x, y);
  const steps = 26, n = Math.floor(steps * k);
  for (let i = 0; i < n; i++) { x += len / steps * 1.1; y += (r() - .5) * 46 + (i < steps / 2 ? 4 : -4); c.lineTo(x, y); if (r() < .3) { c.moveTo(x, y); c.lineTo(x + (r() - .5) * 60, y + (r() - .3) * 70); c.moveTo(x, y); } }
  c.stroke(); c.restore();
}

// ---------- 挑战面板 ----------
export const PN = { w: 780, head: 190, foot: 110 };
// mode: 'grid9' | 'text' | 'grid8' | 'page'（旧书页）；o: { prompt, sel:Set, k 各模式进度 }
export function panel(c, x, y, mode, o = {}, rep) {
  const { w, head, foot } = PN, cell = mode === 'grid8' ? (w - 30) / 4 : (w - 24) / 3;
  const bodyH = mode === 'grid8' ? cell * 2 + 30 : mode === 'grid9' ? cell * 3 + 24 : 520;
  const h = head + bodyH + foot;
  c.save(); c.translate(x, y);
  c.shadowColor = 'rgba(0,0,0,.18)'; c.shadowBlur = 24; c.shadowOffsetY = 6; c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.shadowColor = 'transparent';
  c.strokeStyle = C.edge; c.lineWidth = 2; c.strokeRect(0, 0, w, h);
  if (!o.noHead) {
    c.fillStyle = C.blue; c.fillRect(8, 8, w - 16, head - 16);
    c.fillStyle = '#fff'; c.textBaseline = 'alphabetic';
    const p = o.prompt || ['请选出所有包含', '红绿灯', '的图片'];
    c.font = FONT(4, 30); c.fillText(p[0], 36, 66);
    c.font = FONT(9, 56); c.fillText(p[1], 36, 134); const w1 = c.measureText(p[1]).width;
    c.font = FONT(4, 30); c.fillText(p[2], 36 + w1 + 16, 134);
    rep && rep('prompt', p.join(''), x + 36, y + 36, x + w - 40, y + 140);
  }
  const by = head;
  if (mode === 'grid9' || mode === 'grid8') {
    const cols = mode === 'grid8' ? 4 : 3, rows = mode === 'grid8' ? 2 : 3, kinds = o.kinds || GRID9;
    for (let i = 0; i < cols * rows; i++) {
      const cx = 8 + (i % cols) * (cell + (mode === 'grid8' ? 4.6 : 4)), cy = by + 8 + Math.floor(i / cols) * (cell + 4);
      if (o.hide && o.hide(i)) continue;
      tile(c, kinds[i], cx, cy, cell, i * 13 + 5);
      if (o.sel && o.sel.has(i)) { c.strokeStyle = C.blue; c.lineWidth = 8; c.strokeRect(cx + 4, cy + 4, cell - 8, cell - 8); c.fillStyle = C.blue; c.beginPath(); c.arc(cx + 30, cy + 30, 18, 0, 7); c.fill(); check(c, cx + 16, cy + 16, 28, 1, '#fff'); }
    }
  } else if (mode === 'text') distorted(c, 8, by + 8, w - 16, bodyH - 16, o);
  else if (mode === 'page') bookPage(c, 8, by + 8, w - 16, bodyH - 16, o);
  // 底栏
  const fy = h - foot;
  c.strokeStyle = C.edge; c.beginPath(); c.moveTo(0, fy); c.lineTo(w, fy); c.stroke();
  c.fillStyle = C.blue; rr(c, w - 210, fy + 22, 190, 66, 4); c.fill();
  c.fillStyle = '#fff'; c.font = FONT(7, 30); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('验证', w - 115, fy + 56);
  c.textAlign = 'left'; c.fillStyle = '#9AA0A6'; c.font = FONT(4, 40); c.fillText('↻', 30, fy + 56);
  c.restore();
  return h;
}
export function panelH(mode) { const w = PN.w, cell = mode === 'grid8' ? (w - 30) / 4 : (w - 24) / 3; return PN.head + PN.foot + (mode === 'grid8' ? cell * 2 + 30 : mode === 'grid9' ? cell * 3 + 24 : 520); }

// 扭曲字：k=0 机器看来是噪点，human=1 人眼看是清楚的词
const WORD = 'overlooks';
function distorted(c, x, y, w, h, o) {
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
  c.fillStyle = '#F4F1EA'; c.fillRect(x, y, w, h);
  const r = rnd(9);
  for (let i = 0; i < 26; i++) { c.strokeStyle = `rgba(90,80,70,${.15 + r() * .2})`; c.lineWidth = 1 + r() * 3; c.beginPath(); c.moveTo(x + r() * w, y + r() * h); c.bezierCurveTo(x + r() * w, y + r() * h, x + r() * w, y + r() * h, x + r() * w, y + r() * h); c.stroke(); }
  c.font = 'italic 700 120px "Times New Roman", serif'; c.fillStyle = '#2B2622'; c.textBaseline = 'middle';
  let cx = x + 60; const wob = o.wob ?? 1;
  for (let i = 0; i < WORD.length; i++) {
    const ch = WORD[i], cw = c.measureText(ch).width;
    c.save(); c.translate(cx + cw / 2, y + h / 2 + Math.sin(i * 1.7) * 26 * wob); c.rotate(Math.sin(i * 2.3 + 1) * .38 * wob); c.scale(1 + .25 * Math.sin(i * 3.1) * wob, 1 + .3 * Math.cos(i * 1.3) * wob); c.fillText(ch, -cw / 2, 0); c.restore();
    cx += cw * .82;
  }
  // 机器的眼：把这块区域打成噪点格（noise 0–1）
  if (o.noise > 0) {
    const s = 22, r2 = rnd(31);
    for (let gy = y; gy < y + h; gy += s) for (let gx = x; gx < x + w; gx += s) { const v = Math.floor(r2() * 200 + 30); c.fillStyle = `rgba(${v},${v},${v},${o.noise})`; c.fillRect(gx, gy, s - 1, s - 1); }
  }
  c.restore();
}
// 旧书页：一行行灰条当字，中间一个认不出的旧词
function bookPage(c, x, y, w, h, o) {
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
  const g = c.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, '#E9DEC2'); g.addColorStop(1, '#D8C89F'); c.fillStyle = g; c.fillRect(x, y, w, h);
  const r = rnd(4);
  for (let i = 0; i < 12; i++) {
    const ly = y + 50 + i * 38; let lx = x + 46;
    while (lx < x + w - 60) { const ww = 20 + r() * 70; if (!(i === 6 && lx > x + 250 && lx < x + 470)) { c.fillStyle = `rgba(60,45,30,${.35 + r() * .25})`; c.fillRect(lx, ly, ww, 12); } lx += ww + 12; }
  }
  // 那个旧词：墨迹化开
  c.save(); c.translate(x + 360, y + 50 + 6 * 38 + 6); c.font = 'italic 600 46px "Times New Roman", serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.filter = `blur(${(1 - (o.clean || 0)) * 2.5}px)`; c.fillStyle = '#3A2B1C'; c.fillText('morning', 0, 0); c.filter = 'none';
  c.strokeStyle = C.red; c.lineWidth = 4; c.globalAlpha = o.ring ?? 0; c.beginPath(); c.ellipse(0, 0, 120, 40, -.05, 0, 7); c.stroke(); c.restore();
  // 污渍
  c.fillStyle = 'rgba(120,90,40,.15)'; c.beginPath(); c.ellipse(x + w * .8, y + h * .3, 90, 60, .4, 0, 7); c.fill();
  c.restore();
}

// ---------- 图块（扁平小插画，全部原创） ----------
export const GRID9 = ['light', 'car', 'tree', 'bus', 'light', 'cross', 'building', 'hydrant', 'light'];
export const GRID8 = ['leaf', 'berry', 'vine', 'flask', 'stamp', 'berry2', 'coin', 'leaf2'];
export function tile(c, kind, x, y, s, seed) {
  c.save(); c.beginPath(); c.rect(x, y, s, s); c.clip(); c.translate(x, y); const u = s / 100, r = rnd(seed);
  const sky = c.createLinearGradient(0, 0, 0, s); sky.addColorStop(0, '#A9C7DE'); sky.addColorStop(1, '#D9E4EA');
  const street = () => { c.fillStyle = sky; c.fillRect(0, 0, s, s); c.fillStyle = '#7E8287'; c.fillRect(0, 70 * u, s, 30 * u); c.fillStyle = '#B9B4A8'; c.fillRect(0, 64 * u, s, 7 * u); };
  const blur = () => { c.fillStyle = 'rgba(255,255,255,.06)'; c.fillRect(0, 0, s, s); };
  switch (kind) {
    case 'light': street(); c.fillStyle = '#444'; c.fillRect(46 * u, 30 * u, 6 * u, 40 * u); c.fillStyle = '#2C2C2C'; rr(c, 36 * u, 8 * u, 26 * u, 44 * u, 4 * u); c.fill();
      ['#E2453C', '#E8B04A', '#4FB36A'].forEach((col, i) => { c.fillStyle = i === (seed % 3) ? col : '#555'; c.beginPath(); c.arc(49 * u, (17 + i * 13) * u, 5 * u, 0, 7); c.fill(); }); break;
    case 'car': street(); c.fillStyle = '#C44536'; rr(c, 14 * u, 52 * u, 72 * u, 20 * u, 6 * u); c.fill(); c.fillStyle = '#A33A2D'; rr(c, 28 * u, 40 * u, 40 * u, 16 * u, 6 * u); c.fill(); c.fillStyle = '#9FC3DA'; c.fillRect(33 * u, 44 * u, 14 * u, 9 * u); c.fillRect(50 * u, 44 * u, 14 * u, 9 * u);
      c.fillStyle = '#222'; c.beginPath(); c.arc(30 * u, 73 * u, 7 * u, 0, 7); c.arc(70 * u, 73 * u, 7 * u, 0, 7); c.fill(); break;
    case 'tree': street(); c.fillStyle = '#6B4F35'; c.fillRect(46 * u, 40 * u, 8 * u, 30 * u); c.fillStyle = '#4E8A4A'; c.beginPath(); c.arc(50 * u, 34 * u, 24 * u, 0, 7); c.arc(34 * u, 42 * u, 14 * u, 0, 7); c.arc(66 * u, 42 * u, 14 * u, 0, 7); c.fill(); break;
    case 'bus': street(); c.fillStyle = '#E3A53B'; rr(c, 6 * u, 30 * u, 88 * u, 40 * u, 5 * u); c.fill(); c.fillStyle = '#9FC3DA'; for (let i = 0; i < 5; i++) c.fillRect((12 + i * 16) * u, 36 * u, 12 * u, 12 * u);
      c.fillStyle = '#222'; c.beginPath(); c.arc(24 * u, 71 * u, 7 * u, 0, 7); c.arc(76 * u, 71 * u, 7 * u, 0, 7); c.fill(); break;
    case 'cross': c.fillStyle = '#7E8287'; c.fillRect(0, 0, s, s); c.fillStyle = '#EDEDED'; for (let i = 0; i < 6; i++) { c.save(); c.translate(50 * u, 50 * u); c.rotate(-.5); c.fillRect(-60 * u, (-40 + i * 15) * u, 120 * u, 8 * u); c.restore(); } break;
    case 'building': c.fillStyle = sky; c.fillRect(0, 0, s, s); c.fillStyle = '#B7A48C'; c.fillRect(14 * u, 10 * u, 50 * u, 90 * u); c.fillStyle = '#8F9AA3'; c.fillRect(64 * u, 30 * u, 30 * u, 70 * u);
      c.fillStyle = '#5D6B78'; for (let j = 0; j < 6; j++) for (let i = 0; i < 3; i++) c.fillRect((20 + i * 15) * u, (16 + j * 13) * u, 9 * u, 8 * u); break;
    case 'hydrant': street(); c.fillStyle = '#C73E31'; rr(c, 40 * u, 38 * u, 20 * u, 34 * u, 4 * u); c.fill(); c.beginPath(); c.arc(50 * u, 38 * u, 11 * u, Math.PI, 0); c.fill(); c.fillRect(32 * u, 48 * u, 36 * u, 8 * u); break;
    // 12306 那一类：认不出的小物件
    case 'leaf': case 'leaf2': c.fillStyle = '#E8E4D8'; c.fillRect(0, 0, s, s); c.fillStyle = kind === 'leaf' ? '#5E8C3E' : '#6F9A4A';
      for (let i = 0; i < 7; i++) { c.save(); c.translate(50 * u, 80 * u); c.rotate(-1.2 + i * .4 + r() * .2); c.beginPath(); c.ellipse(0, -34 * u, 7 * u, 16 * u, 0, 0, 7); c.fill(); c.restore(); } break;
    case 'berry': case 'berry2': c.fillStyle = '#EFE8DD'; c.fillRect(0, 0, s, s); c.fillStyle = kind === 'berry' ? '#B5302A' : '#8E2A4A';
      for (let i = 0; i < 9; i++) { c.beginPath(); c.arc((30 + r() * 40) * u, (30 + r() * 40) * u, (7 + r() * 4) * u, 0, 7); c.fill(); } break;
    case 'vine': c.fillStyle = '#9C8D7B'; c.fillRect(0, 0, s, s); c.strokeStyle = '#3F6B33'; c.lineWidth = 3 * u; c.beginPath(); c.moveTo(0, 90 * u); for (let i = 0; i < 8; i++) c.quadraticCurveTo(r() * s, r() * s, r() * s, r() * s); c.stroke();
      c.fillStyle = '#4E7F3C'; for (let i = 0; i < 18; i++) { c.beginPath(); c.arc(r() * s, r() * s, 5 * u, 0, 7); c.fill(); } break;
    case 'flask': c.fillStyle = '#DCE3E6'; c.fillRect(0, 0, s, s); c.fillStyle = '#5876A0'; rr(c, 36 * u, 22 * u, 28 * u, 62 * u, 8 * u); c.fill(); c.fillStyle = '#C9CED3'; c.fillRect(38 * u, 14 * u, 24 * u, 12 * u); break;
    case 'stamp': c.fillStyle = '#F2EEE4'; c.fillRect(0, 0, s, s); c.strokeStyle = '#B23A2E'; c.lineWidth = 5 * u; c.beginPath(); c.arc(50 * u, 50 * u, 28 * u, 0, 7); c.stroke(); c.beginPath(); c.moveTo(34 * u, 50 * u); c.lineTo(66 * u, 50 * u); c.stroke(); break;
    case 'coin': c.fillStyle = '#E2DED3'; c.fillRect(0, 0, s, s); c.fillStyle = '#B8963A'; c.beginPath(); c.arc(50 * u, 50 * u, 24 * u, 0, 7); c.fill(); c.fillStyle = '#E2DED3'; c.fillRect(44 * u, 44 * u, 12 * u, 12 * u); break;
  }
  blur(); c.restore();
}
