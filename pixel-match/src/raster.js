/* 极简软光栅：只实现牌面小人用到的 fillStyle + fillRect（整数坐标、#rgb/#rrggbb/#rrggbbaa、源覆盖混合），
 * 让 Node 测试和浏览器用同一套像素读数比较「两种小人像不像」。浏览器端由 tools/browser-check.cjs 抽查它和真画布一致。 */
(function (root) {
  'use strict';
  function parse(c) {
    let h = String(c).replace('#', '');
    if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
    const n = (k) => parseInt(h.slice(k, k + 2), 16);
    return [n(0), n(2), n(4), h.length >= 8 ? n(6) / 255 : 1];
  }
  // w×h 的 RGB 画布，scale = 一个逻辑像素占几个物理像素；ox/oy 是逻辑坐标原点在画布上的物理位置。
  function Raster(w, h, bg = '#ffffff') {
    const [br, bgc, bb] = parse(bg);
    const data = new Float64Array(w * h * 3);
    for (let i = 0; i < w * h; i++) { data[i * 3] = br; data[i * 3 + 1] = bgc; data[i * 3 + 2] = bb; }
    let fill = [0, 0, 0, 1], T = { s: 1, ox: 0, oy: 0 };
    const ctx = {
      get fillStyle() { return fill; },
      set fillStyle(v) { fill = parse(v); },
      setScale(s, ox, oy) { T = { s, ox, oy }; },
      fillRect(x, y, rw, rh) {
        if (rw < 0) { x += rw; rw = -rw; }
        if (rh < 0) { y += rh; rh = -rh; }
        const x0 = Math.round(T.ox + x * T.s), y0 = Math.round(T.oy + y * T.s), x1 = Math.round(T.ox + (x + rw) * T.s), y1 = Math.round(T.oy + (y + rh) * T.s);
        const [r, g, b, a] = fill;
        for (let yy = Math.max(0, y0); yy < Math.min(h, y1); yy++) for (let xx = Math.max(0, x0); xx < Math.min(w, x1); xx++) {
          const o = (yy * w + xx) * 3;
          data[o] = r * a + data[o] * (1 - a); data[o + 1] = g * a + data[o + 1] * (1 - a); data[o + 2] = b * a + data[o + 2] * (1 - a);
        }
      },
    };
    return { w, h, data, ctx };
  }
  // 按 k×k 平均下采样（物理像素 → CSS 像素）。
  function downsample(R, k) {
    const w = Math.floor(R.w / k), h = Math.floor(R.h / k), out = new Float64Array(w * h * 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) s += R.data[((y * k + dy) * R.w + x * k + dx) * 3 + c];
      out[(y * w + x) * 3 + c] = s / (k * k);
    }
    return { w, h, data: out };
  }
  // sRGB(0–255) → CIE Lab（D65），用于 ΔE76。
  function lab(r, g, b) {
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const R = lin(r), G = lin(g), B = lin(b);
    const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, Y = 0.2126 * R + 0.7152 * G + 0.0722 * B, Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
    const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  }
  function deltaE(a, b) { const p = lab(...a), q = lab(...b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); }
  const api = { Raster, downsample, lab, deltaE, parse };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.PixelRaster = api;
})(typeof window !== 'undefined' ? window : globalThis);
