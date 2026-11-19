// 碎碎平安 · the things on the shelf, drawn in code. Every drawer works in a 100 x 100 box, light from the upper left.
// draw(kind, ctx, w, h, text) paints one item into a canvas the engine will later cut into grains or shards.

const TAU = Math.PI * 2;
const COBALT = '#2d4f9e', COBALT_D = '#1f3a7a', COBALT_L = '#5d7fc4', GLAZE = '#f4f1e8';
const HAND = '"Kaiti SC","STKaiti","KaiTi","BiauKai","Songti SC","Noto Serif SC","Source Han Serif SC",serif';

function lin(x, x0, y0, x1, y1, stops) { const g = x.createLinearGradient(x0, y0, x1, y1); for (const [o, c] of stops) g.addColorStop(o, c); return g; }
function rad(x, x0, y0, r0, x1, y1, r1, stops) { const g = x.createRadialGradient(x0, y0, r0, x1, y1, r1); for (const [o, c] of stops) g.addColorStop(o, c); return g; }
function ell(x, cx, cy, rx, ry, rot = 0) { x.beginPath(); x.ellipse(cx, cy, rx, ry, rot, 0, TAU); }
// Small deterministic noise per item so speckles and crumples differ between items but not between redraws.
function noise(seed) { let a = seed >>> 0 || 7; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; }

// Porcelain glaze sheen: a soft window reflection on the upper left plus a thin rim light on the right.
function sheen(x, path, cx, cy) {
  x.save(); path(); x.clip();
  x.fillStyle = rad(x, cx - 14, cy - 16, 1, cx - 10, cy - 10, 30, [[0, 'rgba(255,255,255,0.75)'], [0.35, 'rgba(255,255,255,0.18)'], [1, 'rgba(255,255,255,0)']]);
  x.fillRect(0, 0, 100, 100);
  x.restore();
}

/* ---------- porcelain ---------- */

function plate(x) {
  const cx = 50, cy = 50, R = 46;
  const disc = () => { x.beginPath(); x.arc(cx, cy, R, 0, TAU); };
  disc(); x.fillStyle = rad(x, cx - 14, cy - 16, 4, cx, cy, R, [[0, '#ffffff'], [0.55, GLAZE], [0.92, '#e2dccb'], [1, '#c9c0aa']]); x.fill();
  x.save(); disc(); x.clip();
  // outer band with a pearl border
  x.beginPath(); x.arc(cx, cy, R - 1.6, 0, TAU); x.arc(cx, cy, R - 8, 0, TAU, true); x.fillStyle = COBALT; x.fill();
  x.fillStyle = GLAZE;
  for (let i = 0; i < 28; i++) { const a = (i / 28) * TAU; x.beginPath(); x.arc(cx + Math.cos(a) * (R - 4.8), cy + Math.sin(a) * (R - 4.8), 1.5, 0, TAU); x.fill(); }
  x.lineWidth = 0.7; x.strokeStyle = COBALT; x.beginPath(); x.arc(cx, cy, R - 10.5, 0, TAU); x.stroke();
  // scrolling tendrils between band and medallion
  x.strokeStyle = COBALT; x.lineWidth = 1.3; x.lineCap = 'round';
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU, b = a + TAU / 10, r0 = 28.5, r1 = 33.5;
    x.beginPath();
    x.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    x.bezierCurveTo(cx + Math.cos(a + 0.2) * (r1 + 2), cy + Math.sin(a + 0.2) * (r1 + 2), cx + Math.cos(b - 0.25) * (r0 - 2), cy + Math.sin(b - 0.25) * (r0 - 2), cx + Math.cos(b) * r0, cy + Math.sin(b) * r0);
    x.stroke();
    const lx = cx + Math.cos(a + 0.33) * (r1 - 0.5), ly = cy + Math.sin(a + 0.33) * (r1 - 0.5);
    x.fillStyle = COBALT_L; ell(x, lx, ly, 2.6, 1.3, a + 1.2); x.fill();
  }
  // medallion with an eight-petal lotus
  x.lineWidth = 1.2; x.strokeStyle = COBALT; x.beginPath(); x.arc(cx, cy, 23, 0, TAU); x.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2;
    x.save(); x.translate(cx, cy); x.rotate(a);
    x.beginPath(); x.moveTo(5, 0); x.bezierCurveTo(9, -6.5, 17, -5.5, 20, 0); x.bezierCurveTo(17, 5.5, 9, 6.5, 5, 0);
    x.fillStyle = 'rgba(45,79,158,0.88)'; x.fill();
    x.beginPath(); x.moveTo(8, 0); x.lineTo(17, 0); x.strokeStyle = 'rgba(244,241,232,0.7)'; x.lineWidth = 0.7; x.stroke();
    x.restore();
  }
  x.fillStyle = COBALT_D; x.beginPath(); x.arc(cx, cy, 5.2, 0, TAU); x.fill();
  x.fillStyle = GLAZE; x.beginPath(); x.arc(cx, cy, 2, 0, TAU); x.fill();
  // heaped-and-piled cobalt: a few darker spots where the pigment pooled
  const n = noise(11); x.fillStyle = 'rgba(20,35,80,0.35)';
  for (let i = 0; i < 26; i++) { const a = n() * TAU, r = 24 + n() * 21; x.beginPath(); x.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.5 + n() * 0.8, 0, TAU); x.fill(); }
  x.restore();
  sheen(x, disc, cx, cy);
  disc(); x.lineWidth = 0.8; x.strokeStyle = 'rgba(110,98,78,0.55)'; x.stroke();
}

function vasePath(x) {
  x.beginPath();
  x.moveTo(43, 9); x.lineTo(43.5, 14);
  x.bezierCurveTo(30, 16, 19, 22, 19, 37);
  x.bezierCurveTo(19, 55, 31, 78, 35, 92);
  x.lineTo(34, 97); x.lineTo(66, 97); x.lineTo(65, 92);
  x.bezierCurveTo(69, 78, 81, 55, 81, 37);
  x.bezierCurveTo(81, 22, 70, 16, 56.5, 14);
  x.lineTo(57, 9); x.closePath();
}
function vase(x) {
  vasePath(x); x.fillStyle = lin(x, 18, 0, 82, 0, [[0, '#ddd6c4'], [0.22, '#fdfbf5'], [0.5, GLAZE], [0.82, '#d9d1bd'], [1, '#bdb39b']]); x.fill();
  x.save(); vasePath(x); x.clip();
  // shoulder: cobalt collar with ruyi scallops
  x.fillStyle = COBALT; x.fillRect(0, 14, 100, 12.5);
  x.fillStyle = GLAZE; for (let i = -1; i < 10; i++) { x.beginPath(); x.arc(14 + i * 9.5, 27.5, 4.6, Math.PI, 0); x.fill(); }
  x.fillStyle = COBALT_L; for (let i = -1; i < 10; i++) { x.beginPath(); x.arc(14 + i * 9.5, 21, 1.6, 0, TAU); x.fill(); }
  x.strokeStyle = COBALT; x.lineWidth = 0.8; x.beginPath(); x.moveTo(0, 30.5); x.lineTo(100, 30.5); x.moveTo(0, 32.3); x.lineTo(100, 32.3); x.stroke();
  // body: a lotus scroll
  x.lineCap = 'round'; x.strokeStyle = COBALT; x.lineWidth = 1.6;
  x.beginPath(); x.moveTo(14, 56); x.bezierCurveTo(28, 40, 38, 70, 50, 54); x.bezierCurveTo(62, 38, 72, 70, 88, 52); x.stroke();
  const leaves = [[24, 50, -0.7], [36, 60, 0.6], [44, 50, -0.9], [58, 46, 0.8], [66, 60, -0.5], [78, 56, 0.9], [30, 64, 2.2], [70, 48, 2.6]];
  for (const [lx, ly, a] of leaves) { x.fillStyle = 'rgba(45,79,158,0.9)'; ell(x, lx, ly, 5.2, 2.1, a); x.fill(); x.strokeStyle = 'rgba(244,241,232,0.55)'; x.lineWidth = 0.5; x.beginPath(); x.moveTo(lx - Math.cos(a) * 4, ly - Math.sin(a) * 4); x.lineTo(lx + Math.cos(a) * 4, ly + Math.sin(a) * 4); x.stroke(); }
  for (const [fx, fy] of [[40, 45], [74, 64]]) {
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.48; x.fillStyle = i % 2 ? COBALT_L : COBALT; ell(x, fx + Math.cos(a) * 4.5, fy + Math.sin(a) * 4.5, 4.2, 2.1, a); x.fill(); }
    x.fillStyle = COBALT_D; x.beginPath(); x.arc(fx, fy + 1, 2.2, 0, TAU); x.fill();
  }
  // foot: lotus-petal panels
  x.strokeStyle = COBALT; x.lineWidth = 0.9; x.beginPath(); x.moveTo(0, 75); x.lineTo(100, 75); x.stroke();
  for (let i = 0; i < 9; i++) {
    const px = 26 + i * 6;
    x.beginPath(); x.moveTo(px - 2.6, 92); x.bezierCurveTo(px - 2.8, 84, px - 1, 79, px, 77.5); x.bezierCurveTo(px + 1, 79, px + 2.8, 84, px + 2.6, 92);
    x.stroke(); x.fillStyle = 'rgba(45,79,158,0.35)'; x.fill();
  }
  x.fillStyle = COBALT; x.fillRect(0, 92.5, 100, 1.4);
  const n = noise(23); x.fillStyle = 'rgba(20,35,80,0.32)';
  for (let i = 0; i < 30; i++) { x.beginPath(); x.arc(22 + n() * 56, 16 + n() * 76, 0.4 + n() * 0.8, 0, TAU); x.fill(); }
  // tall window reflection
  x.fillStyle = lin(x, 27, 0, 36, 0, [[0, 'rgba(255,255,255,0)'], [0.5, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
  x.fillRect(27, 30, 9, 50);
  x.restore();
  // mouth
  x.fillStyle = lin(x, 41, 0, 59, 0, [[0, '#e8e2d2'], [0.4, '#ffffff'], [1, '#cfc6b0']]); x.fillRect(41.5, 5, 17, 5);
  x.fillStyle = COBALT; x.fillRect(41.5, 8.6, 17, 1.2);
  ell(x, 50, 5, 8.5, 1.6); x.fillStyle = '#5a5244'; x.fill();
  sheen(x, () => vasePath(x), 46, 32);
  vasePath(x); x.lineWidth = 0.8; x.strokeStyle = 'rgba(110,98,78,0.55)'; x.stroke();
}

function bowl(x) {
  // saucer
  ell(x, 50, 88, 42, 8.5); x.fillStyle = lin(x, 0, 80, 0, 97, [[0, '#ffffff'], [0.6, '#e7e1d1'], [1, '#bfb59e']]); x.fill();
  ell(x, 50, 87, 38, 6.5); x.strokeStyle = COBALT; x.lineWidth = 1.1; x.stroke();
  ell(x, 50, 86, 24, 3.6); x.fillStyle = 'rgba(160,148,120,0.35)'; x.fill();
  // cup
  const cup = () => { x.beginPath(); x.moveTo(24, 58); x.bezierCurveTo(25, 74, 33, 86, 50, 86); x.bezierCurveTo(67, 86, 75, 74, 76, 58); x.closePath(); };
  cup(); x.fillStyle = lin(x, 24, 0, 76, 0, [[0, '#e3dccb'], [0.25, '#ffffff'], [0.6, GLAZE], [1, '#c9c0a9']]); x.fill();
  x.save(); cup(); x.clip();
  x.strokeStyle = COBALT; x.lineWidth = 1.2; x.beginPath(); x.moveTo(20, 62); x.lineTo(80, 62); x.stroke();
  // an orchid sprig
  x.lineCap = 'round'; x.lineWidth = 1.1;
  x.beginPath(); x.moveTo(36, 82); x.bezierCurveTo(40, 74, 48, 70, 60, 68); x.moveTo(40, 81); x.bezierCurveTo(44, 76, 50, 76, 58, 78); x.stroke();
  x.fillStyle = COBALT; for (const [fx, fy] of [[61, 68], [58, 78]]) for (let i = 0; i < 4; i++) { ell(x, fx + Math.cos(i * 1.57) * 2.2, fy + Math.sin(i * 1.57) * 2.2, 2, 1, i * 1.57); x.fill(); }
  x.restore();
  // lid
  const lid = () => { x.beginPath(); x.moveTo(23, 58); x.bezierCurveTo(25, 46, 38, 40, 50, 40); x.bezierCurveTo(62, 40, 75, 46, 77, 58); x.closePath(); };
  lid(); x.fillStyle = rad(x, 40, 44, 2, 50, 52, 30, [[0, '#ffffff'], [0.6, GLAZE], [1, '#cfc6b0']]); x.fill();
  x.save(); lid(); x.clip();
  x.strokeStyle = COBALT; x.lineWidth = 1.4; x.beginPath(); x.moveTo(20, 54.5); x.lineTo(80, 54.5); x.stroke();
  x.lineWidth = 1; for (let i = 0; i < 6; i++) { const px = 30 + i * 8; x.beginPath(); x.arc(px, 50.5, 2.2, Math.PI, 0); x.stroke(); }
  x.restore();
  ell(x, 50, 58, 27, 3.2); x.fillStyle = '#e9e3d4'; x.fill(); x.strokeStyle = 'rgba(110,98,78,0.5)'; x.lineWidth = 0.6; x.stroke();
  // knob
  ell(x, 50, 37.5, 6, 2.8); x.fillStyle = lin(x, 44, 0, 56, 0, [[0, '#e8e2d2'], [0.4, '#ffffff'], [1, '#c4baa2']]); x.fill();
  x.fillStyle = COBALT; ell(x, 50, 36.5, 3, 1.2); x.fill();
  sheen(x, lid, 44, 48);
  sheen(x, cup, 42, 68);
}

/* ---------- glass ---------- */

function glass(x) {
  const body = () => { x.beginPath(); x.moveTo(23, 13); x.lineTo(29, 90); x.quadraticCurveTo(50, 96, 71, 90); x.lineTo(77, 13); x.closePath(); };
  body(); x.fillStyle = lin(x, 23, 0, 77, 0, [[0, 'rgba(210,235,255,0.34)'], [0.4, 'rgba(255,255,255,0.10)'], [1, 'rgba(190,220,250,0.30)']]); x.fill();
  x.save(); body(); x.clip();
  // water and two ice cubes
  x.fillStyle = lin(x, 0, 42, 0, 92, [[0, 'rgba(140,200,240,0.40)'], [1, 'rgba(90,150,210,0.55)']]); x.fillRect(0, 42, 100, 60);
  for (const [ix, iy, a] of [[42, 50, 0.3], [58, 58, -0.4]]) {
    x.save(); x.translate(ix, iy); x.rotate(a);
    x.fillStyle = 'rgba(235,248,255,0.42)'; x.strokeStyle = 'rgba(255,255,255,0.8)'; x.lineWidth = 0.7;
    x.beginPath(); x.roundRect(-7, -7, 14, 14, 3); x.fill(); x.stroke();
    x.fillStyle = 'rgba(255,255,255,0.6)'; x.fillRect(-5, -5, 4, 2);
    x.restore();
  }
  // bubbles
  const n = noise(5); x.strokeStyle = 'rgba(255,255,255,0.65)'; x.lineWidth = 0.5;
  for (let i = 0; i < 9; i++) { x.beginPath(); x.arc(32 + n() * 36, 66 + n() * 22, 0.7 + n() * 1.1, 0, TAU); x.stroke(); }
  x.restore();
  ell(x, 50, 42, 26, 3.6); x.fillStyle = 'rgba(210,240,255,0.55)'; x.fill(); x.strokeStyle = 'rgba(255,255,255,0.7)'; x.lineWidth = 0.6; x.stroke();
  // thick bottom
  ell(x, 50, 89, 20.5, 3.6); x.fillStyle = 'rgba(225,245,255,0.45)'; x.fill();
  // rim and edges
  ell(x, 50, 13, 27, 4.6); x.fillStyle = 'rgba(200,230,255,0.18)'; x.fill(); x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 1.1; x.stroke();
  x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 1.3; x.beginPath(); x.moveTo(23.4, 14); x.lineTo(29.2, 89); x.stroke();
  x.strokeStyle = 'rgba(200,225,250,0.55)'; x.beginPath(); x.moveTo(76.6, 14); x.lineTo(70.8, 89); x.stroke();
  // reflections
  x.fillStyle = 'rgba(255,255,255,0.55)'; x.beginPath(); x.moveTo(30, 18); x.lineTo(34, 18); x.lineTo(37, 84); x.lineTo(34.5, 84); x.closePath(); x.fill();
  x.fillStyle = 'rgba(255,255,255,0.22)'; x.beginPath(); x.moveTo(66, 18); x.lineTo(68, 18); x.lineTo(65, 80); x.lineTo(63.5, 80); x.closePath(); x.fill();
}

/* ---------- clay ---------- */

function pot(x) {
  const body = () => { x.beginPath(); x.moveTo(35, 22); x.bezierCurveTo(35, 30, 12, 36, 12, 58); x.bezierCurveTo(12, 78, 26, 92, 36, 94); x.lineTo(64, 94); x.bezierCurveTo(74, 92, 88, 78, 88, 58); x.bezierCurveTo(88, 36, 65, 30, 65, 22); x.closePath(); };
  body(); x.fillStyle = rad(x, 36, 44, 4, 50, 60, 48, [[0, '#e3925a'], [0.45, '#c46a37'], [0.85, '#8e4520'], [1, '#6b3216']]); x.fill();
  x.save(); body(); x.clip();
  // throwing rings
  for (const y of [40, 46, 80]) { x.strokeStyle = 'rgba(70,30,10,0.45)'; x.lineWidth = 1; x.beginPath(); x.moveTo(0, y); x.quadraticCurveTo(50, y + 3, 100, y); x.stroke(); x.strokeStyle = 'rgba(255,205,160,0.25)'; x.lineWidth = 0.6; x.beginPath(); x.moveTo(0, y + 1.2); x.quadraticCurveTo(50, y + 4.2, 100, y + 1.2); x.stroke(); }
  // incised zigzag band
  x.strokeStyle = 'rgba(60,25,8,0.6)'; x.lineWidth = 1.1; x.beginPath();
  for (let i = 0; i <= 16; i++) { const px = 8 + i * 5.4, py = i % 2 ? 66 : 58; i ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke();
  // speckles
  const n = noise(17);
  for (let i = 0; i < 160; i++) { x.fillStyle = n() < 0.6 ? 'rgba(60,25,8,0.35)' : 'rgba(255,215,170,0.30)'; x.fillRect(12 + n() * 76, 24 + n() * 70, 0.7, 0.7); }
  // shade on the right
  x.fillStyle = lin(x, 50, 0, 90, 0, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(40,15,5,0.45)']]); x.fillRect(50, 0, 50, 100);
  x.restore();
  // rim
  x.fillStyle = lin(x, 31, 0, 69, 0, [[0, '#b25d2d'], [0.35, '#e09460'], [1, '#7f3c1b']]); x.beginPath(); x.roundRect(31, 17, 38, 7, 3); x.fill();
  ell(x, 50, 18, 16, 2.6); x.fillStyle = '#3a1a0c'; x.fill();
  // matte highlight
  x.fillStyle = rad(x, 32, 46, 1, 32, 46, 16, [[0, 'rgba(255,220,180,0.35)'], [1, 'rgba(255,220,180,0)']]); x.fillRect(10, 30, 40, 40);
}

/* ---------- paper ---------- */

function wrapLines(x, text, maxW, size) {
  x.font = `700 ${size}px ${HAND}`;
  const chars = Array.from(text), lines = []; let cur = '';
  for (const c of chars) { if (x.measureText(cur + c).width > maxW && cur) { lines.push(cur); cur = c; } else cur += c; }
  if (cur) lines.push(cur);
  return lines;
}
function note(x, text) {
  x.save(); x.translate(50, 52); x.rotate(-0.06); x.translate(-50, -52);
  // paper with a lifted corner
  x.beginPath(); x.moveTo(9, 12); x.lineTo(91, 12); x.lineTo(91, 80); x.quadraticCurveTo(88, 90, 77, 92); x.lineTo(9, 92); x.closePath();
  x.fillStyle = lin(x, 0, 12, 0, 92, [[0, '#fbe27a'], [0.6, '#f5d151'], [1, '#e9bd36']]); x.fill();
  x.beginPath(); x.moveTo(91, 80); x.quadraticCurveTo(84, 82, 77, 92); x.quadraticCurveTo(86, 86, 91, 80); x.fillStyle = '#c99a22'; x.fill();
  // faint ruled lines
  x.strokeStyle = 'rgba(160,110,20,0.18)'; x.lineWidth = 0.6;
  for (let y = 36; y < 88; y += 12) { x.beginPath(); x.moveTo(14, y); x.lineTo(86, y); x.stroke(); }
  // label
  x.fillStyle = '#9a7316'; x.font = `600 8.5px ${HAND}`; x.textBaseline = 'alphabetic'; x.fillText('烦心事', 14, 27);
  x.strokeStyle = '#c8402f'; x.lineWidth = 1; x.beginPath(); x.arc(80, 24, 4.5, 0, TAU); x.stroke();
  x.fillStyle = '#c8402f'; x.font = `700 6px ${HAND}`; x.textAlign = 'center'; x.fillText('急', 80, 26.2);
  // the worry itself, sized to fit two lines
  const t = text || '烦';
  let size = 26, lines = wrapLines(x, t, 70, size);
  while ((lines.length > 2 || size * lines.length > 48) && size > 11) { size -= 1; lines = wrapLines(x, t, 70, size); }
  x.fillStyle = '#3a2914'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `700 ${size}px ${HAND}`;
  const y0 = 60 - ((lines.length - 1) * size * 1.1) / 2;
  lines.slice(0, 2).forEach((l, i) => x.fillText(l, 50, y0 + i * size * 1.1));
  x.restore();
  // tape
  x.save(); x.translate(50, 10); x.rotate(0.05);
  x.fillStyle = 'rgba(255,255,255,0.5)'; x.fillRect(-17, -5, 34, 10);
  x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 0.5; x.strokeRect(-17, -5, 34, 10);
  x.restore();
}

function paper(x) {
  const n = noise(31), pts = [];
  for (let i = 0; i < 22; i++) { const a = (i / 22) * TAU, r = 33 + n() * 9; pts.push([50 + Math.cos(a) * r, 58 + Math.sin(a) * r * 0.9]); }
  const ball = () => { x.beginPath(); pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py))); x.closePath(); };
  ball(); x.fillStyle = rad(x, 38, 44, 3, 50, 58, 44, [[0, '#fbf8ef'], [0.6, '#e4ddcb'], [1, '#b5ab94']]); x.fill();
  x.save(); ball(); x.clip();
  // newsprint: rows of grey dashes at a slant, plus a headline block
  x.save(); x.translate(50, 58); x.rotate(-0.35); x.translate(-50, -58);
  x.fillStyle = 'rgba(40,36,30,0.55)'; x.fillRect(26, 34, 30, 5);
  x.fillStyle = 'rgba(60,55,45,0.32)';
  for (let r = 0; r < 12; r++) for (let c = 0; c < 6; c++) if (n() > 0.15) x.fillRect(14 + c * 12, 44 + r * 3.6, 6 + n() * 4, 1.3);
  x.fillStyle = 'rgba(70,70,70,0.25)'; x.fillRect(62, 34, 16, 12);
  x.restore();
  // crumple folds: dark crease with a light edge
  for (let i = 0; i < 14; i++) {
    const a = n() * TAU, r = 6 + n() * 30, l = 8 + n() * 16, b = a + 1.2 + n();
    const x0 = 50 + Math.cos(a) * r, y0 = 58 + Math.sin(a) * r;
    x.strokeStyle = 'rgba(90,80,60,0.38)'; x.lineWidth = 0.8; x.beginPath(); x.moveTo(x0, y0); x.lineTo(x0 + Math.cos(b) * l, y0 + Math.sin(b) * l); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.6)'; x.lineWidth = 0.6; x.beginPath(); x.moveTo(x0 + 0.8, y0 + 0.8); x.lineTo(x0 + 0.8 + Math.cos(b) * l, y0 + 0.8 + Math.sin(b) * l); x.stroke();
  }
  x.fillStyle = lin(x, 40, 30, 80, 95, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(60,50,35,0.35)']]); x.fillRect(0, 0, 100, 100);
  x.restore();
}

/* ---------- wax and ice ---------- */

function candle(x) {
  // glow
  x.fillStyle = rad(x, 50, 22, 2, 50, 24, 24, [[0, 'rgba(255,200,110,0.55)'], [1, 'rgba(255,170,70,0)']]); x.fillRect(20, 0, 60, 50);
  // brass dish
  ell(x, 50, 91, 31, 6.5); x.fillStyle = lin(x, 19, 0, 81, 0, [[0, '#8a6420'], [0.3, '#f2d27a'], [0.6, '#c39437'], [1, '#6e4d16']]); x.fill();
  ell(x, 50, 89.5, 25, 4.2); x.fillStyle = '#7a5518'; x.fill();
  // pillar with drips
  const body = () => { x.beginPath(); x.moveTo(34, 40); x.lineTo(34, 89); x.quadraticCurveTo(50, 92, 66, 89); x.lineTo(66, 40); x.closePath(); };
  body(); x.fillStyle = lin(x, 34, 0, 66, 0, [[0, '#a8241c'], [0.25, '#e65446'], [0.55, '#c9322a'], [1, '#86190f']]); x.fill();
  x.fillStyle = '#d63c31';
  for (const [dx, len, w] of [[37, 18, 3.4], [47, 9, 3], [58, 24, 3.6], [64.5, 12, 2.6]]) {
    x.beginPath(); x.moveTo(dx - w, 39); x.lineTo(dx - w, 39 + len - w); x.arc(dx, 39 + len - w, w, Math.PI, 0, true); x.lineTo(dx + w, 39); x.fill();
  }
  x.fillStyle = 'rgba(255,190,170,0.45)'; x.fillRect(38, 44, 3, 40);
  ell(x, 50, 40, 16, 3.4); x.fillStyle = '#b52b22'; x.fill();
  ell(x, 50, 40.3, 11, 2.2); x.fillStyle = '#e8695a'; x.fill();
  // wick and flame
  x.strokeStyle = '#2b1d14'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(50, 40); x.quadraticCurveTo(50.5, 35, 49.6, 31); x.stroke();
  x.beginPath(); x.moveTo(50, 8); x.bezierCurveTo(56, 18, 56.5, 26, 50, 32); x.bezierCurveTo(43.5, 26, 44, 18, 50, 8);
  x.fillStyle = rad(x, 50, 26, 0.5, 50, 22, 13, [[0, '#ffffff'], [0.3, '#fff2b0'], [0.7, '#ffb347'], [1, 'rgba(255,120,40,0.85)']]); x.fill();
  ell(x, 50, 28, 2, 3.2); x.fillStyle = 'rgba(90,140,255,0.55)'; x.fill();
}

function icecream(x) {
  // cone
  const cone = () => { x.beginPath(); x.moveTo(32, 54); x.lineTo(50, 97); x.lineTo(68, 54); x.closePath(); };
  cone(); x.fillStyle = lin(x, 32, 0, 68, 0, [[0, '#c98a45'], [0.4, '#e6b06c'], [1, '#a8692f']]); x.fill();
  x.save(); cone(); x.clip(); x.strokeStyle = 'rgba(140,80,30,0.7)'; x.lineWidth = 1;
  for (let i = -6; i < 8; i++) { x.beginPath(); x.moveTo(20 + i * 7, 50); x.lineTo(50 + i * 7, 100); x.stroke(); x.beginPath(); x.moveTo(80 - i * 7, 50); x.lineTo(50 - i * 7, 100); x.stroke(); }
  x.restore();
  // mint scoop with drips
  x.fillStyle = rad(x, 42, 44, 2, 50, 50, 20, [[0, '#d2f3e2'], [0.6, '#9edcc0'], [1, '#6fb999']]);
  x.beginPath(); x.arc(50, 49, 18.5, Math.PI * 0.95, Math.PI * 0.05);
  for (let i = 0; i <= 6; i++) { const px = 68 - i * 6, py = 56 + (i % 2 ? 5 : 1); x.quadraticCurveTo(px + 3, py + 3, px, py); }
  x.closePath(); x.fill();
  x.fillStyle = '#9edcc0'; for (const [dx, l] of [[41, 9], [57, 6]]) { x.beginPath(); x.moveTo(dx - 2.2, 57); x.lineTo(dx - 2.2, 57 + l); x.arc(dx, 57 + l, 2.2, Math.PI, 0, true); x.lineTo(dx + 2.2, 57); x.fill(); }
  // strawberry scoop
  x.fillStyle = rad(x, 43, 26, 2, 50, 32, 18, [[0, '#ffd3de'], [0.6, '#f4a2b8'], [1, '#d97692']]);
  x.beginPath(); x.arc(50, 32, 15.5, Math.PI * 0.92, Math.PI * 0.08);
  for (let i = 0; i <= 5; i++) { const px = 65 - i * 6, py = 38 + (i % 2 ? 4 : 0.5); x.quadraticCurveTo(px + 3, py + 3, px, py); }
  x.closePath(); x.fill();
  const n = noise(41), cols = ['#ffffff', '#ffd54a', '#6ec6ff', '#7ad17a'];
  for (let i = 0; i < 14; i++) { x.save(); x.translate(39 + n() * 22, 22 + n() * 14); x.rotate(n() * TAU); x.fillStyle = cols[i % 4]; x.fillRect(-1.6, -0.5, 3.2, 1); x.restore(); }
  // cherry
  x.strokeStyle = '#4b6b2a'; x.lineWidth = 1; x.beginPath(); x.moveTo(51, 14); x.quadraticCurveTo(53, 6, 58, 4); x.stroke();
  x.fillStyle = rad(x, 48.5, 14, 0.5, 50, 16, 5.5, [[0, '#ff8a8a'], [0.5, '#d62c3a'], [1, '#8f1520']]); x.beginPath(); x.arc(50, 16.5, 5.2, 0, TAU); x.fill();
  x.fillStyle = 'rgba(255,255,255,0.75)'; ell(x, 48.3, 14.6, 1.4, 0.9, -0.5); x.fill();
}

/* ---------- rubber, mood, pixels ---------- */

function balloon(x) {
  x.strokeStyle = '#d9cfc0'; x.lineWidth = 0.8; x.beginPath(); x.moveTo(50, 74); x.bezierCurveTo(44, 82, 58, 88, 50, 98); x.stroke();
  x.beginPath(); x.moveTo(50, 69); x.bezierCurveTo(26, 69, 22, 46, 22, 36); x.bezierCurveTo(22, 18, 35, 6, 50, 6); x.bezierCurveTo(65, 6, 78, 18, 78, 36); x.bezierCurveTo(78, 46, 74, 69, 50, 69);
  x.fillStyle = rad(x, 38, 22, 2, 50, 38, 40, [[0, '#ff9a8c'], [0.35, '#ef5345'], [0.8, '#c22f25'], [1, '#8e1c15']]); x.fill();
  x.fillStyle = '#b8291f'; x.beginPath(); x.moveTo(46.5, 74); x.lineTo(50, 68.5); x.lineTo(53.5, 74); x.closePath(); x.fill();
  x.fillStyle = 'rgba(255,255,255,0.75)'; ell(x, 37, 22, 5, 9, 0.5); x.fill();
  x.fillStyle = 'rgba(255,255,255,0.35)'; ell(x, 66, 50, 2.5, 5, 0.4); x.fill();
}

function cloud(x) {
  // rain
  x.strokeStyle = 'rgba(150,185,225,0.85)'; x.lineWidth = 1.6; x.lineCap = 'round';
  for (const [rx, ry] of [[30, 76], [42, 82], [54, 76], [66, 84], [36, 90], [60, 92]]) { x.beginPath(); x.moveTo(rx, ry); x.lineTo(rx - 2, ry + 5); x.stroke(); }
  const puff = () => { x.beginPath(); for (const [px, py, r] of [[28, 52, 15], [46, 40, 19], [65, 45, 16], [79, 56, 11], [20, 61, 10], [50, 58, 16]]) { x.moveTo(px + r, py); x.arc(px, py, r, 0, TAU); } x.rect(20, 54, 60, 15); };
  puff(); x.fillStyle = lin(x, 0, 22, 0, 70, [[0, '#7c8594'], [0.6, '#565e6b'], [1, '#3c424d']]); x.fill('nonzero');
  x.save(); puff(); x.clip('nonzero');
  x.fillStyle = 'rgba(255,255,255,0.12)'; x.beginPath(); x.arc(42, 34, 12, 0, TAU); x.fill();
  // grumpy face
  x.strokeStyle = '#1f232a'; x.lineWidth = 2; x.beginPath(); x.moveTo(36, 46); x.lineTo(44, 49); x.moveTo(64, 46); x.lineTo(56, 49); x.stroke();
  x.fillStyle = '#1f232a'; x.beginPath(); x.arc(41.5, 53, 2.2, 0, TAU); x.arc(58.5, 53, 2.2, 0, TAU); x.fill();
  x.lineWidth = 1.8; x.beginPath(); x.arc(50, 66, 5.5, Math.PI * 1.15, Math.PI * 1.85); x.stroke();
  x.restore();
  // tiny lightning
  x.fillStyle = '#ffd84a'; x.beginPath(); x.moveTo(74, 66); x.lineTo(70, 76); x.lineTo(74, 76); x.lineTo(71, 86); x.lineTo(79, 73); x.lineTo(75, 73); x.lineTo(78, 66); x.closePath(); x.fill();
}

const PIXEL_ART = [
  '...H....H...',
  '...HA..AH...',
  '..AAAAAAAA..',
  '.LLLAAAAAAA.',
  '.LWWAAAWWAD.',
  '.AWKAAAWKAD.',
  'AAAAAAAAAAAD',
  'AABAMMMMABAD',
  'AAAAAMMAAAAD',
  'AAAAAAAAAADD',
  '.AAD.AA.ADD.',
  '..D...D...D.',
];
const PIXEL_COL = { A: '#7d5cd6', L: '#a68cf2', D: '#5a3fae', H: '#ffcf4a', W: '#ffffff', K: '#1b1430', B: '#f28aac', M: '#3a2466' };
function pixel(x) {
  const s = 7, ox = 8, oy = 10;
  PIXEL_ART.forEach((row, r) => Array.from(row).forEach((ch, c) => { if (ch === '.') return; x.fillStyle = PIXEL_COL[ch]; x.fillRect(ox + c * s, oy + r * s, s + 0.05, s + 0.05); }));
}

const DRAW = { plate, vase, bowl, glass, pot, note, paper, candle, icecream, balloon, cloud, pixel };

export function draw(kind, ctx, w, h, text) {
  ctx.save();
  ctx.scale(w / 100, h / 100);
  (DRAW[kind] || plate)(ctx, text);
  ctx.restore();
}
export const KINDS_DRAWN = Object.keys(DRAW);
