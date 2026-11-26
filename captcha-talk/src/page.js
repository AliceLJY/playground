// 平平无奇的人机验证页（外壳），画在一张和屏幕同比例的画布上。
// 逻辑坐标：短边方向至少 1000×1080 个单位，验证框 780 宽，永远居中。
import { C, FONT, widget, panel, panelH, WG, PN, check, rr } from './shell.js';
import { cursor, selection, caret, stamp, bubble, AI_INK, clamp, ease, seg, path } from './draw.js';

export const HEADER = '继续访问之前，请先完成人机验证';
export const HEADER_EDITED = '这场演讲，就是一道验证码。';

export class Page {
  constructor() { this.cv = document.createElement('canvas'); this.c = this.cv.getContext('2d'); this.resize(16 / 9); }
  resize(aspect) {
    const max = 2048; let cw, ch;
    if (aspect >= 1) { cw = max; ch = Math.round(max / aspect); } else { ch = max; cw = Math.round(max * aspect); }
    this.cv.width = cw; this.cv.height = ch; this.k = Math.min(cw / 840, ch / 820);
    this.LW = cw / this.k; this.LH = ch / this.k; this.aspect = aspect;
  }
  // 几个关键位置（逻辑坐标）
  get geo() {
    const cx = this.LW / 2, cy = this.LH / 2, wx = cx - WG.w / 2, wy = cy - WG.h / 2 + 30;
    return { cx, cy, wx, wy, box: [wx + 44 + 32, wy + WG.h / 2], head: [wx, wy - 120] };
  }
  // o: header 文字, headerSel 选框透明度, caretOn, widget 状态, tilt 框歪的角度, page 损伤 {stamp, seams…}, cur {x,y,who,alpha}, tip {text,alpha}, panel {mode,k}
  draw(o = {}) {
    const { c, k, LW, LH } = this; const g = this.geo;
    c.setTransform(k, 0, 0, k, 0, 0);
    c.fillStyle = C.page; c.fillRect(0, 0, LW, LH);
    // 极淡的网格，像一张表单的底
    c.strokeStyle = 'rgba(0,0,0,.035)'; c.lineWidth = 1;
    for (let x = (LW / 2) % 60; x < LW; x += 60) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, LH); c.stroke(); }
    for (let y = (LH / 2) % 60; y < LH; y += 60) { c.beginPath(); c.moveTo(0, y); c.lineTo(LW, y); c.stroke(); }
    // 第一场盖过的章留在纸上（损伤只累积）
    if (o.stamp99) stamp(c, g.cx + 330, g.wy - 250, '99.8%', 70, 1, .16);
    // 抬头那行字
    const head = o.header ?? HEADER;
    c.font = FONT(5, 40); c.fillStyle = C.ink; c.textBaseline = 'middle';
    const hx = g.head[0], hy = g.head[1], hw = c.measureText(head).width;
    c.fillText(head, hx, hy);
    if (o.headerSel > 0) selection(c, hx - 14, hy - 34, Math.max(hw, 40) + 28, 68, o.headerSel);
    if (o.caretOn) caret(c, hx + hw + 4, hy - 24, 48, o.t || 0, '#111', o.caretSolid);
    c.font = FONT(4, 24); c.fillStyle = C.faint; c.fillText('这一步用来确认你是真人', hx, hy + 52);
    // 验证框（可能被歪着放回去）
    c.save();
    if (o.tilt) { c.translate(g.cx, g.wy + WG.h / 2); c.rotate(o.tilt); c.translate(-g.cx, -(g.wy + WG.h / 2)); }
    widget(c, g.wx, g.wy, o.widget || {});
    c.restore();
    // 弹出来的题
    if (o.panel && o.panel.k > 0) {
      const s = .62 * (.9 + .1 * ease(o.panel.k)), ph = panelH(o.panel.mode);
      c.save(); c.globalAlpha = ease(o.panel.k * 1.4);
      c.translate(g.cx, g.cy - 10); c.scale(s, s); c.translate(-PN.w / 2, -ph / 2);
      panel(c, 0, 0, o.panel.mode, o.panel.o || {}); c.restore();
    }
    if (o.tip && o.tip.alpha > 0) bubble(c, o.tip.x, o.tip.y, 560, o.tip.text, 30, AI_INK, '#FFFFFF', o.tip.alpha);
    if (o.cur && o.cur.alpha > 0) cursor(c, o.cur.x, o.cur.y, 46, o.cur.who, o.cur.alpha);
  }
}

// 题卡：挑战面板 + 一个输入框 / 选格子，另画光标和章。画在自己的画布上，当三维物体的贴图。
export class Card {
  constructor(mode) {
    this.mode = mode; this.h = panelH(mode) + (mode === 'text' ? 0 : 0);
    this.cv = document.createElement('canvas'); this.cv.width = PN.w + 40; this.cv.height = this.h + 40; this.c = this.cv.getContext('2d');
  }
  draw(o = {}) {
    const c = this.c; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.cv.width, this.cv.height); c.translate(20, 20);
    panel(c, 0, 0, this.mode, o.panel || {});
    const fy = this.h - PN.foot;
    if (this.mode === 'text') {   // 输入框
      c.fillStyle = '#fff'; c.strokeStyle = o.inputFocus ? '#3B78E7' : '#C8C8C8'; c.lineWidth = o.inputFocus ? 3 : 2;
      rr(c, 20, fy + 22, 520, 66, 4); c.fill(); c.stroke();
      c.font = '500 36px ui-monospace, Menlo, monospace'; c.textBaseline = 'middle';
      if (o.typed) { c.fillStyle = AI_INK; c.fillText(o.typed, 40, fy + 56); }
      else { c.fillStyle = '#AAA'; c.font = FONT(4, 28); c.fillText('输入你看到的词', 40, fy + 56); }
      if (o.inputFocus) { c.font = '500 36px ui-monospace, Menlo, monospace'; caret(c, 40 + c.measureText(o.typed || '').width + 3, fy + 36, 40, o.t || 0, AI_INK); }
    }
    if (o.ok > 0) { c.globalAlpha = o.ok; c.strokeStyle = '#1E9E5A'; c.lineWidth = 8; c.strokeRect(4, 4, PN.w - 8, this.h - 8); c.globalAlpha = 1; }
    if (o.stamp > 0) stamp(c, PN.w / 2 + 40, this.h * .42, o.stampText || '99.8%', 120, o.stamp, -.14);
    if (o.cur && o.cur.alpha > 0) cursor(c, o.cur.x, o.cur.y, 56, o.cur.who, o.cur.alpha);
  }
  // 题卡上几个点的位置（面板坐标，画的时候已平移 20 边距）
  get input() { return [300, this.h - PN.foot + 56]; }
  get verify() { return [PN.w - 115, this.h - PN.foot + 56]; }
  tile(i) { const cell = (PN.w - 24) / 3; return [8 + (i % 3) * (cell + 4) + cell / 2, PN.head + 8 + Math.floor(i / 3) * (cell + 4) + cell / 2]; }
}
