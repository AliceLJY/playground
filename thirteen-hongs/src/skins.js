// 画出来的脸和衣服：两张运行时在画布上画的图集（零外部素材），每个人按实例属性选一格。
// 每张图集配一张同样分格的遮罩：白处跟着肤色或衣色染，黑处保持画上去的原色（眼白、头发、纽扣、补子）。
// 坐标：横向是绕身一圈的经度（0 在正前，负的是穿的人自己的右手边），纵向脸用纬度、衣服用 0（下）到 1（上）。
import * as THREE from 'three';
import { rng } from './core.js';

function pair(w, h) {
  const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const c = mk(), k = mk(), g = c.getContext('2d'), m = k.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); m.fillStyle = '#fff'; m.fillRect(0, 0, w, h);
  return { c, k, g, m };
}
function finish(P) {
  const tex = new THREE.CanvasTexture(P.c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const mask = new THREE.CanvasTexture(P.k); mask.colorSpace = THREE.NoColorSpace;
  return { tex, mask, canvas: P.c };
}
// 一格里的画笔。shade / line 叠在底色上、跟着染色；solid / ink 是不跟着染的原色
function pen(P, col, row, S) {
  const { g, m } = P, both = [g, m];
  for (const c of both) { c.save(); c.beginPath(); c.rect(col * S, row * S, S, S); c.clip(); c.translate(col * S, row * S); c.lineCap = 'round'; c.lineJoin = 'round'; }
  return {
    S,
    shade(color, path) { g.fillStyle = color; g.beginPath(); path(g); g.fill(); },
    line(color, w, path) { g.strokeStyle = color; g.lineWidth = w * S; g.beginPath(); path(g); g.stroke(); },
    solid(color, path) { for (const c of both) { c.fillStyle = c === g ? color : '#000'; c.beginPath(); path(c); c.fill(); } },
    ink(color, w, path) { for (const c of both) { c.strokeStyle = c === g ? color : '#000'; c.lineWidth = w * S; c.beginPath(); path(c); c.stroke(); } },
    done() { g.restore(); m.restore(); },
  };
}

// ---------- 脸 ----------
// 八格：0 青年 1 八字胡加山羊须 2 花白长须 3 僧 4 深发洋人（连鬓胡）5 浅发洋人 6 妇人 7 日晒、胡茬
export const FACES = [
  { hair: 'queue' },
  { hair: 'queue', beard: 'goat' },
  { hair: 'queue', hairCol: '#8a867e', beard: 'long', old: true, brow: '#6a665e' },
  { hair: 'bald', browW: 0.009 },
  { hair: 'short', hairCol: '#4a3220', beard: 'whisker', iris: '#51708c', brow: '#3a2818', blush: 'rgba(214,100,84,0.13)' },
  { hair: 'short', hairCol: '#9a7a48', iris: '#5d7f6a', brow: '#7a5e38', blush: 'rgba(220,104,88,0.16)' },
  { hair: 'woman', browW: 0.007, lip: 'rgba(190,60,62,0.62)', eye: 1.12 },
  { hair: 'queue', beard: 'stubble', browW: 0.014, blush: 'rgba(150,84,60,0.12)' },
];
function drawFace(p, o) {
  const S = p.S, X = lon => S * (0.5 + lon / 360), Y = lat => S * (0.5 - lat / 180);
  const E = (c, lon, lat, rl, rt) => { c.moveTo(X(lon) + rl * S / 360, Y(lat)); c.ellipse(X(lon), Y(lat), rl * S / 360, rt * S / 180, 0, 0, 6.2832); };
  const R = (c, a, b, top, bot) => c.rect(X(a), Y(top), X(b) - X(a), Y(bot) - Y(top));
  const hc = o.hairCol || '#17140f', SH = 'rgba(96,60,44,';
  // 明暗：下颌以下、腮、眼窝、鼻翼、耳、鼻孔、鼻底
  p.shade('rgba(105,62,40,0.30)', c => R(c, -180, 180, -55, -90));
  p.shade('rgba(105,62,40,0.16)', c => R(c, -180, 180, -44, -55));
  for (const s of [-1, 1]) {
    p.shade(o.blush || 'rgba(206,120,96,0.09)', c => E(c, s * 29, -14, 10, 6));
    p.shade(SH + '0.24)', c => E(c, s * 19, 6.5, 9.5, 5.5));
    p.shade(SH + '0.16)', c => E(c, s * 6.5, -3, 1.8, 9));
    p.shade('rgba(150,84,60,0.30)', c => E(c, s * 88, 0, 5.5, 10)); p.shade('rgba(100,56,40,0.34)', c => E(c, s * 87, 0, 2.6, 5.5));
    p.shade('rgba(52,28,20,0.72)', c => E(c, s * 3.3, -14.6, 1.5, 1.1));
  }
  p.shade('rgba(255,244,230,0.22)', c => E(c, 0, -2, 2.2, 9));
  p.shade('rgba(88,50,36,0.34)', c => E(c, 0, -16.2, 5.2, 1.5));
  // 头发。辫发：前额到头顶剃光（留一层青皮），耳后到后脑留发
  if (o.hair === 'queue') {
    for (let la = 22; la < 46; la += 2) p.shade('rgba(70,84,100,0.016)', c => R(c, -94, 94, 90, la));   // 青皮往额头渐淡，不留一道线
    p.solid(hc, c => { R(c, -181, -94, 91, -36); R(c, 94, 181, 91, -36); for (let la = 84; la > -36; la -= 9) for (const s of [-1, 1]) E(c, s * 93.5, la, 3.2, 5.5); });
  } else if (o.hair === 'short') {
    p.solid(hc, c => { R(c, -181, 181, 91, 40); for (const s of [-1, 1]) { E(c, s * 42, 40, 26, 6); R(c, s * 64, s * 181, 41, -6); R(c, s * 64, s * 80, -5, o.beard === 'whisker' ? -36 : -20); R(c, s * 100, s * 181, -5, -40); } });
    if (o.beard === 'whisker') p.solid(hc, c => { for (const s of [-1, 1]) E(c, s * 66, -36, 11, 7); });
  } else if (o.hair === 'woman') {
    p.solid(hc, c => { for (const s of [-1, 1]) { R(c, s * 0.7, s * 181, 91, 37); E(c, s * 34, 37, 32, 7); R(c, s * 58, s * 181, 38, -22); R(c, s * 96, s * 181, -21, -42); } });
  } else for (let la = 20; la < 44; la += 2) p.shade('rgba(70,84,100,0.012)', c => R(c, -181, 181, 91, la));
  // 皱纹
  if (o.old) {
    for (const la of [21, 25.5, 30]) p.line(SH + '0.34)', 0.004, c => { c.moveTo(X(-17), Y(la - 1)); c.quadraticCurveTo(X(0), Y(la + 1.2), X(17), Y(la - 1)); });
    for (const s of [-1, 1]) { p.line(SH + '0.4)', 0.005, c => { c.moveTo(X(s * 8), Y(-11)); c.quadraticCurveTo(X(s * 13.5), Y(-18), X(s * 13), Y(-29)); }); for (const d of [-2, 1, 4]) p.line(SH + '0.3)', 0.003, c => { c.moveTo(X(s * 26.5), Y(5)); c.lineTo(X(s * 31), Y(5 + d)); }); }
  }
  // 眉、眼
  for (const s of [-1, 1]) {
    p.ink(o.brow || '#1c140e', o.browW || 0.011, c => { c.moveTo(X(s * 9.5), Y(12.2)); c.quadraticCurveTo(X(s * 18), Y(15.8), X(s * 28), Y(12.4)); });
    const k = o.eye || 1;
    p.solid('#efe8dc', c => E(c, s * 19, 5.4, 6.2, 2.3 * k));
    p.solid(o.iris || '#2b1a10', c => E(c, s * 19, 5.5, 2.7, 2.2 * k));
    p.solid('#0c0806', c => E(c, s * 19, 5.5, 1.2, 1.1));
    p.solid('#ffffff', c => E(c, s * 19 - 0.9, 6.2, 0.55, 0.5));
    p.ink('#1a110b', 0.0075, c => { c.moveTo(X(s * 12.2), Y(4.9)); c.quadraticCurveTo(X(s * 19), Y(5.4 + 4.4 * k), X(s * 26), Y(5.5)); });
    p.line(SH + '0.42)', 0.004, c => { c.moveTo(X(s * 13), Y(4.4)); c.quadraticCurveTo(X(s * 19), Y(5.4 - 3.6 * k), X(s * 25.4), Y(4.8)); });
  }
  // 嘴
  const lip = o.lip || 'rgba(176,84,72,0.50)';
  p.shade(lip, c => E(c, 0, -29.6, 6.2, 2.0)); p.shade(lip, c => E(c, 0, -25.9, 6.6, 1.3));
  p.ink('#5e2a24', 0.006, c => { c.moveTo(X(-8.4), Y(-27)); c.quadraticCurveTo(X(0), Y(-27.9), X(8.4), Y(-27)); });
  p.shade(SH + '0.15)', c => E(c, 0, -33.6, 5, 1.4));
  // 胡须
  const mous = w => { for (const s of [-1, 1]) p.ink(hc, w, c => { c.moveTo(X(s * 1.6), Y(-21.4)); c.quadraticCurveTo(X(s * 8.5), Y(-21.4), X(s * 12.6), Y(-30.5)); }); };
  if (o.beard === 'goat') { mous(0.011); p.solid(hc, c => E(c, 0, -41, 3.2, 6)); }
  if (o.beard === 'long') { mous(0.015); p.solid(hc, c => { E(c, 0, -46, 7, 12); E(c, -6, -42, 3.5, 7); E(c, 6, -42, 3.5, 7); }); }
  if (o.beard === 'stubble') { p.shade('rgba(40,34,30,0.20)', c => E(c, 0, -34, 36, 17)); p.shade('rgba(40,34,30,0.22)', c => E(c, 0, -22.5, 11, 2.4)); }
}
export function faceAtlas(S) {
  const P = pair(S * 8, S);
  FACES.forEach((o, i) => { const p = pen(P, i, 0, S); drawFace(p, o); p.done(); });
  return { ...finish(P), cols: 8, rows: 1 };
}

// ---------- 衣服 ----------
// 八格衣型：0 长衫 1 马褂（下面露长袍）2 短打 3 洋服 4 水手 5 僧衣 6 补服 7 大襟衫。上一行是上身，下一行是袍子的下半截
export function clothAtlas(S) {
  const P = pair(S * 8, S * 2), R0 = rng(1805), r = (a, b) => a + R0() * (b - a);
  // 底：细的经纬纹
  { const t = document.createElement('canvas'); t.width = t.height = 4; const tg = t.getContext('2d'); tg.fillStyle = '#fff'; tg.fillRect(0, 0, 4, 4); tg.fillStyle = 'rgba(0,0,0,0.07)'; tg.fillRect(0, 0, 4, 1); tg.fillRect(0, 0, 1, 4); tg.fillStyle = 'rgba(0,0,0,0.05)'; tg.fillRect(2, 2, 1, 1); P.g.fillStyle = P.g.createPattern(t, 'repeat'); P.g.fillRect(0, 0, S * 8, S * 2); }
  const X = lon => S * (0.5 + lon / 360), V = v => S * (1 - v);
  const dot = (c, lon, v, rad) => { c.moveTo(X(lon) + rad * S, V(v)); c.arc(X(lon), V(v), rad * S, 0, 6.2832); };
  const band = (c, v0, v1) => c.rect(-2, V(v1), S + 4, V(v0) - V(v1));
  const poly = (c, pts) => { pts.forEach(([lon, v], i) => i ? c.lineTo(X(lon), V(v)) : c.moveTo(X(lon), V(v))); c.closePath(); };
  const folds = (p, n, v0, v1, k = 1) => { for (let i = 0; i < n; i++) { const lon = r(-175, 175), d = r(-5, 5), w = r(0.006, 0.02); p.line(`rgba(0,0,0,${(r(0.05, 0.12) * k).toFixed(3)})`, w, c => { c.moveTo(X(lon), V(v1)); c.lineTo(X(lon + d), V(v0)); }); p.line(`rgba(255,255,255,${(r(0.03, 0.07) * k).toFixed(3)})`, w * 0.6, c => { c.moveTo(X(lon + 4), V(v1)); c.lineTo(X(lon + d + 4), V(v0)); }); } };
  const lapel = (p, wide) => {   // 大襟：从领口斜到右腋下，再沿右侧往下
    const path = c => { c.moveTo(X(0), V(0.955)); c.quadraticCurveTo(X(-8), V(0.84), X(-38), V(0.80)); c.lineTo(X(-44), V(-0.02)); };
    if (wide) p.line('rgba(0,0,0,0.36)', 0.034, path);
    p.line('rgba(0,0,0,0.45)', 0.008, path);
  };
  const roundels = (p, v0, v1, n) => { for (let i = 0; i < n; i++) { const lon = r(-170, 170), v = r(v0, v1); p.line('rgba(255,255,255,0.075)', 0.007, c => dot(c, lon, v, 0.035)); p.shade('rgba(255,255,255,0.05)', c => dot(c, lon, v, 0.016)); } };
  const KNOT = '#1d1a17', GOLD = '#c2a04a';
  const top = [
    p => { folds(p, 12, 0, 0.8); p.shade('rgba(0,0,0,0.30)', c => band(c, 0.955, 1.01)); lapel(p); p.solid(KNOT, c => { dot(c, 0, 0.955, 0.012); dot(c, -22, 0.835, 0.011); dot(c, -39, 0.775, 0.011); dot(c, -42.5, 0.5, 0.011); dot(c, -43.5, 0.22, 0.011); }); },
    p => { folds(p, 8, 0, 0.8, 0.7); roundels(p, 0.1, 0.85, 16); p.shade('rgba(255,255,255,0.16)', c => band(c, 0.955, 1.01)); p.shade('rgba(255,255,255,0.10)', c => band(c, -0.01, 0.045)); p.line('rgba(0,0,0,0.5)', 0.007, c => { c.moveTo(X(0), V(0.955)); c.lineTo(X(0), V(0)); }); for (const v of [0.86, 0.72, 0.58, 0.44, 0.30]) { p.ink(GOLD, 0.006, c => { c.moveTo(X(-8), V(v)); c.lineTo(X(8), V(v)); }); p.solid(GOLD, c => dot(c, 0, v, 0.011)); } for (const s of [-1, 1]) p.line('rgba(0,0,0,0.4)', 0.006, c => { c.moveTo(X(s * 90), V(0.2)); c.lineTo(X(s * 90), V(0)); }); },
    p => { folds(p, 14, 0, 0.85); p.shade('rgba(60,40,20,0.14)', c => band(c, -0.01, 0.25)); p.shade('rgba(0,0,0,0.38)', c => poly(c, [[-10, 1], [10, 1], [0, 0.80]])); p.line('rgba(0,0,0,0.42)', 0.007, c => { c.moveTo(X(0), V(0.80)); c.lineTo(X(0), V(0)); }); p.shade('rgba(0,0,0,0.5)', c => { for (const v of [0.72, 0.58, 0.46]) dot(c, 1.5, v, 0.01); }); p.shade('rgba(255,255,255,0.10)', c => poly(c, [[30, 0.72], [52, 0.72], [52, 0.56], [30, 0.56]])); p.line('rgba(0,0,0,0.25)', 0.003, c => poly(c, [[30, 0.72], [52, 0.72], [52, 0.56], [30, 0.56]])); p.solid('#b9ac8c', c => { band(c, 0.36, 0.425); poly(c, [[16, 0.37], [24, 0.37], [25, 0.19], [19, 0.17]]); }); p.line('rgba(0,0,0,0.3)', 0.004, c => { c.moveTo(-2, V(0.39)); c.lineTo(S + 2, V(0.395)); }); },
    p => { folds(p, 6, 0, 0.6, 0.6); p.shade('rgba(0,0,0,0.26)', c => { poly(c, [[-11, 1], [-24, 0.955], [-9, 0.64], [0, 0.6]]); poly(c, [[11, 1], [24, 0.955], [9, 0.64], [0, 0.6]]); }); p.solid('#e9e3d5', c => poly(c, [[-10, 1.01], [10, 1.01], [5, 0.70], [0, 0.60], [-5, 0.70]])); p.solid('#f7f3eb', c => poly(c, [[-9, 1.01], [9, 1.01], [4, 0.87], [-4, 0.87]])); p.line('rgba(0,0,0,0.22)', 0.004, c => { c.moveTo(X(-5), V(0.9)); c.lineTo(X(5), V(0.9)); c.moveTo(X(0), V(0.86)); c.lineTo(X(0), V(0.62)); }); p.line('rgba(255,255,255,0.14)', 0.004, c => { c.moveTo(X(-24), V(0.955)); c.lineTo(X(-9), V(0.64)); c.moveTo(X(24), V(0.955)); c.lineTo(X(9), V(0.64)); }); p.line('rgba(0,0,0,0.45)', 0.006, c => { c.moveTo(X(0), V(0.6)); c.lineTo(X(0), V(0.05)); }); p.solid(GOLD, c => { for (const v of [0.52, 0.42, 0.32]) for (const s of [-1, 1]) dot(c, s * 7, v, 0.011); }); p.line('rgba(0,0,0,0.3)', 0.005, c => { c.moveTo(-2, V(0.27)); c.lineTo(S + 2, V(0.27)); }); },
    p => { folds(p, 10, 0, 0.8); for (let v = 0.12; v < 0.9; v += 0.075) p.shade('rgba(255,255,255,0.09)', c => band(c, v, v + 0.02)); p.solid('#1d2026', c => { poly(c, [[-15, 1.01], [15, 1.01], [0, 0.76]]); poly(c, [[-3, 0.78], [3, 0.78], [5, 0.66], [-5, 0.66]]); }); p.solid('#3a2c20', c => band(c, 0.33, 0.375)); p.solid(GOLD, c => poly(c, [[-4, 0.385], [4, 0.385], [4, 0.32], [-4, 0.32]])); },
    p => { folds(p, 12, 0, 0.9); p.shade('rgba(70,36,0,0.24)', c => poly(c, [[14, 1.01], [185, 1.01], [185, -0.01], [-60, -0.01], [-52, 0.38]])); p.shade('rgba(255,255,255,0.17)', c => { poly(c, [[30, 1.01], [13, 1.01], [-52, 0.36], [-36, 0.33]]); poly(c, [[-30, 1.01], [-13, 1.01], [4, 0.76], [-5, 0.70]]); }); p.line('rgba(0,0,0,0.35)', 0.005, c => { c.moveTo(X(13), V(1.01)); c.lineTo(X(-52), V(0.36)); c.moveTo(X(30), V(1.01)); c.lineTo(X(-36), V(0.33)); }); },
    p => { folds(p, 6, 0, 0.5, 0.6); p.shade('rgba(255,255,255,0.20)', c => band(c, 0.955, 1.01)); p.line('rgba(0,0,0,0.5)', 0.006, c => { c.moveTo(X(0), V(0.955)); c.lineTo(X(0), V(0)); });
      p.solid('#1b2550', c => poly(c, [[-17, 0.80], [17, 0.80], [17, 0.50], [-17, 0.50]])); p.ink(GOLD, 0.01, c => poly(c, [[-17, 0.80], [17, 0.80], [17, 0.50], [-17, 0.50]]));
      for (const [v, col] of [[0.53, '#4e7fa0'], [0.555, '#5d9a78'], [0.58, '#4e7fa0']]) p.ink(col, 0.006, c => { c.moveTo(X(-15), V(v)); for (let lon = -15; lon < 15; lon += 5) c.quadraticCurveTo(X(lon + 2.5), V(v + 0.022), X(lon + 5), V(v)); });
      p.solid('#b03a2e', c => dot(c, -10.5, 0.755, 0.014)); p.solid('#e9e4d6', c => { c.ellipse(X(1), V(0.665), 0.03 * S, 0.02 * S, -0.5, 0, 6.2832); poly(c, [[2, 0.69], [12, 0.75], [9, 0.68], [13, 0.66], [4, 0.655]]); poly(c, [[-4, 0.65], [-11, 0.62], [-3, 0.635]]); }); p.solid(GOLD, c => poly(c, [[5.5, 0.70], [9, 0.705], [6, 0.685]]));
      for (let i = 0; i <= 26; i++) { const a = Math.PI * i / 26, lon = -15 * Math.cos(a), v = 0.955 - 0.47 * Math.sin(a); p.solid(i % 9 === 4 ? '#3f8a6a' : '#8a4a2e', c => dot(c, lon, v, i % 9 === 4 ? 0.013 : 0.009)); } },
    p => { folds(p, 12, 0, 0.8); p.shade('rgba(0,0,0,0.34)', c => { band(c, 0.955, 1.01); band(c, -0.01, 0.06); }); lapel(p, true); p.solid('#c9bfa6', c => { dot(c, 0, 0.955, 0.011); dot(c, -22, 0.835, 0.01); dot(c, -39, 0.775, 0.01); }); },
  ];
  const hem = (p, a = 0.2) => p.shade(`rgba(0,0,0,${a})`, c => band(c, -0.01, 0.035));
  const slit = p => { for (const s of [-1, 1]) p.shade('rgba(0,0,0,0.45)', c => poly(c, [[s * 88, 0.2], [s * 86, 0], [s * 94, 0]])); };
  const low = {
    0: p => { folds(p, 16, 0, 1); hem(p); slit(p); p.line('rgba(0,0,0,0.42)', 0.008, c => { c.moveTo(X(-44), V(1.01)); c.lineTo(X(-45), V(0.12)); }); p.shade('rgba(0,0,0,0.45)', c => poly(c, [[-45, 0.14], [-42, 0], [-49, 0]])); p.solid(KNOT, c => { dot(c, -44.3, 0.74, 0.011); dot(c, -44.7, 0.42, 0.011); }); },
    1: p => { folds(p, 14, 0, 1, 0.8); roundels(p, 0.08, 0.95, 18); hem(p, 0.26); slit(p); },
    5: p => { folds(p, 18, 0, 1); hem(p); for (let i = 0; i < 5; i++) p.line('rgba(0,0,0,0.13)', 0.012, c => { c.moveTo(X(-150 + i * 60), V(1)); c.lineTo(X(-110 + i * 60), V(0)); }); },
    6: p => { folds(p, 10, 0.2, 1, 0.6); p.line('rgba(0,0,0,0.5)', 0.006, c => { c.moveTo(X(0), V(1)); c.lineTo(X(0), V(0.2)); });
      const C5 = ['#2f5f8f', '#e6dfc8', '#3f8a6a', GOLD, '#b03a2e', '#e6dfc8']; for (let i = -32; i < 32; i++) p.solid(C5[((i % 6) + 6) % 6], c => poly(c, [[i * 6, 0.16], [i * 6 + 6, 0.16], [i * 6 + 14, -0.01], [i * 6 + 8, -0.01]]));
      for (const [v, col] of [[0.18, '#4e7fa0'], [0.215, '#5d9a78']]) p.ink(col, 0.009, c => { c.moveTo(X(-180), V(v)); for (let lon = -180; lon < 180; lon += 12) c.quadraticCurveTo(X(lon + 6), V(v + 0.04), X(lon + 12), V(v)); });
      for (const lon of [0, -75, 75, -150, 150]) { p.ink(GOLD, 0.008, c => dot(c, lon, 0.6, 0.06)); p.solid(GOLD, c => dot(c, lon, 0.6, 0.022)); } },
  };
  for (let i = 0; i < 8; i++) {
    let p = pen(P, i, 0, S); top[i](p); p.done();
    p = pen(P, i, 1, S); (low[i] || (q => { folds(q, 14, 0, 1); hem(q); }))(p); p.done();
  }
  return { ...finish(P), cols: 8, rows: 2 };
}
