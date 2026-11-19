// 碎碎平安 · what sits on the shelf. Collectibles are photographed sprites (assets/<kind>.webp, cut out by
// tools/cutout.py); the worry slip is drawn in code because its words are whatever the visitor typed.
// draw(kind, ctx, w, h, text) paints one item into a canvas the engine will later cut into grains or shards.

const TAU = Math.PI * 2;
const BRUSH = '"Kaiti SC","STKaiti","KaiTi","BiauKai","Songti SC","Noto Serif SC","Source Han Serif SC",serif';
const ART = {};

// Load every sprite before the shelf is built. A missing file leaves that kind blank rather than breaking the page.
export function loadArt(kinds, base = 'assets/') {
  return Promise.all(kinds.map((k) => new Promise((done) => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => { ART[k] = im; done(); };
    im.onerror = () => done();
    im.src = `${base}${k}.webp?v=3`;
  })));
}

// Deterministic speckle per slip so gold flecks do not jump between redraws.
function noise(seed) { let a = seed >>> 0 || 7; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; }
function hash(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.codePointAt(0), 16777619); return h >>> 0; }

// A vertical slip of red gold-flecked paper with the worry brushed on in black ink, read top to bottom,
// right column first; leans a little, with a small seal at the foot.
function note(x, text) {
  const t = Array.from(text || '烦').filter((c) => c.trim());   // spaces have no place in a vertical column
  if (!t.length) t.push('烦');
  const cols = t.length > 5 ? 2 : 1, per = Math.ceil(t.length / cols);
  const W = cols === 2 ? 50 : 38, H = 88, X = 50 - W / 2, Y = 7;
  x.save(); x.translate(50, 96); x.rotate(-0.035); x.translate(-50, -96);
  // contact shadow on the shelf floor and a soft drop shadow behind the paper
  x.fillStyle = 'rgba(0,0,0,0.35)'; x.beginPath(); x.ellipse(52, 96, W * 0.55, 2.2, 0, 0, TAU); x.fill();
  // paper: slightly uneven edges, deep red with a lighter middle
  const edge = () => {
    x.beginPath(); x.moveTo(X, Y + 1);
    x.quadraticCurveTo(50, Y - 1.2, X + W, Y + 0.6);
    x.quadraticCurveTo(X + W + 1, Y + H / 2, X + W - 0.4, Y + H);
    x.quadraticCurveTo(50, Y + H + 1, X + 0.5, Y + H - 0.4);
    x.quadraticCurveTo(X - 1, Y + H / 2, X, Y + 1); x.closePath();
  };
  edge();
  const g = x.createLinearGradient(X, 0, X + W, 0);
  g.addColorStop(0, '#8e1b13'); g.addColorStop(0.35, '#c12a1d'); g.addColorStop(0.7, '#b52419'); g.addColorStop(1, '#7c160f');
  x.fillStyle = g; x.fill();
  x.save(); edge(); x.clip();
  // paper fibre and gold flecks
  const n = noise(hash(t.join('')) + 3);
  for (let i = 0; i < 260; i++) { x.fillStyle = n() < 0.5 ? 'rgba(255,190,150,0.07)' : 'rgba(60,0,0,0.10)'; x.fillRect(X + n() * W, Y + n() * H, 0.5 + n() * 2.5, 0.35); }
  for (let i = 0; i < 46; i++) {
    const s = 0.4 + n() * 1.3; x.fillStyle = `rgba(${230 + n() * 25},${185 + n() * 40},${90 + n() * 40},${0.55 + n() * 0.4})`;
    x.beginPath(); const fx = X + n() * W, fy = Y + n() * H; x.moveTo(fx, fy - s); x.lineTo(fx + s, fy); x.lineTo(fx, fy + s * 0.7); x.lineTo(fx - s * 0.8, fy); x.fill();
  }
  // light from the upper left, the right edge falls off
  const sh = x.createLinearGradient(X, Y, X + W, Y + H);
  sh.addColorStop(0, 'rgba(255,230,200,0.16)'); sh.addColorStop(0.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.28)');
  x.fillStyle = sh; x.fillRect(X - 2, Y - 2, W + 4, H + 4);
  // the words, ink black with a faint wet sheen
  const room = H - 22, size = Math.min(26, room / per * 0.96), colW = W / cols;
  x.font = `700 ${size}px ${BRUSH}`; x.textAlign = 'center'; x.textBaseline = 'middle';
  t.forEach((ch, i) => {
    const c = Math.floor(i / per), r = i % per;
    const cx = cols === 2 ? X + colW * (1.5 - c) + (c ? 1.5 : -1.5) : 50;   // right column first
    const cy = Y + 8 + size * 0.55 + r * (room / per);
    x.fillStyle = 'rgba(20,6,4,0.94)'; x.fillText(ch, cx, cy);
    x.fillStyle = 'rgba(255,255,255,0.06)'; x.fillText(ch, cx - 0.4, cy - 0.5);
  });
  // seal
  x.fillStyle = '#f2e3c4'; x.fillRect(X + 4, Y + H - 11, 7, 7);
  x.fillStyle = '#9a1c12'; x.font = `700 5.4px ${BRUSH}`; x.fillText('散', X + 7.5, Y + H - 7.4);
  x.restore();
  // paper edge
  edge(); x.strokeStyle = 'rgba(60,8,4,0.55)'; x.lineWidth = 0.5; x.stroke();
  x.restore();
}

// Someone else's worry in the shared room: the slip folded in half, sealed, no words at all. The words never left
// the writer's browser, so there is nothing to draw even if we wanted to.
function folded(x, seed) {
  const n = noise(seed + 11);
  const X = 24, W = 52, Y = 42, H = 50;
  x.save(); x.translate(50, 96); x.rotate(0.05); x.translate(-50, -96);
  x.fillStyle = 'rgba(0,0,0,0.35)'; x.beginPath(); x.ellipse(51, 96, W * 0.6, 2.4, 0, 0, TAU); x.fill();
  // back half, peeking out above the fold
  x.beginPath(); x.moveTo(X + 3, Y + 3); x.lineTo(X + W - 2, Y - 4); x.lineTo(X + W, Y + 6); x.lineTo(X + 2, Y + 10); x.closePath();
  x.fillStyle = '#7c160f'; x.fill();
  // front half
  const front = () => { x.beginPath(); x.moveTo(X, Y + 6); x.quadraticCurveTo(50, Y + 3, X + W, Y + 6); x.lineTo(X + W - 0.5, Y + H); x.quadraticCurveTo(50, Y + H + 1, X + 0.5, Y + H - 0.5); x.closePath(); };
  front();
  const g = x.createLinearGradient(X, Y, X + W, Y + H);
  g.addColorStop(0, '#c63022'); g.addColorStop(0.55, '#a8221a'); g.addColorStop(1, '#7a150e');
  x.fillStyle = g; x.fill();
  x.save(); front(); x.clip();
  for (let i = 0; i < 34; i++) { const s = 0.4 + n() * 1.2; x.fillStyle = `rgba(240,${195 + n() * 40},110,${0.5 + n() * 0.4})`; x.fillRect(X + n() * W, Y + 6 + n() * H, s, s * 0.8); }
  const fold = x.createLinearGradient(0, Y + 6, 0, Y + 14);
  fold.addColorStop(0, 'rgba(0,0,0,0.35)'); fold.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = fold; x.fillRect(X, Y + 6, W, 8);
  x.restore();
  // a round seal over the fold: 封
  x.fillStyle = '#f2e3c4'; x.beginPath(); x.arc(50, Y + 27, 8, 0, TAU); x.fill();
  x.strokeStyle = '#9a1c12'; x.lineWidth = 1; x.beginPath(); x.arc(50, Y + 27, 6.6, 0, TAU); x.stroke();
  x.fillStyle = '#9a1c12'; x.font = `700 8px ${BRUSH}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('封', 50, Y + 27.5);
  front(); x.strokeStyle = 'rgba(60,8,4,0.55)'; x.lineWidth = 0.5; x.stroke();
  x.restore();
}

export function draw(kind, ctx, w, h, text, isFolded = false, seed = 1) {
  if (kind === 'note') { ctx.save(); ctx.scale(w / 100, h / 100); if (isFolded) folded(ctx, seed); else note(ctx, text); ctx.restore(); return; }
  const im = ART[kind];
  if (im) ctx.drawImage(im, 0, 0, w, h);
}
export const DRAWN_IN_CODE = ['note'];
