(function (root) {
  'use strict';
  // Original compact encoder: QR Model 2, version 4, byte mode, ECC L, mask 0.
  // Deliberately fixed-size: capacity 78 UTF-8 bytes, enough for the public game URL.
  function encode(text) {
    const bytes = new TextEncoder().encode(text);
    if (bytes.length > 78) throw new RangeError('QR v4-L byte payload exceeds 78 bytes');
    const bits = [];
    const put = (value, count) => { for (let k = count - 1; k >= 0; k--) bits.push(value >>> k & 1); };
    put(4, 4); put(bytes.length, 8); for (const b of bytes) put(b, 8);
    put(0, Math.min(4, 640 - bits.length)); while (bits.length % 8) bits.push(0);
    const words = []; for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = b * 2 + bits[i + j]; words.push(b); }
    for (let k = 0; words.length < 80; k++) words.push(k % 2 ? 0x11 : 0xEC);
    function mul(a, b) { let c = 0; while (b) { if (b & 1) c ^= a; b >>>= 1; a <<= 1; if (a & 256) a ^= 0x11D; } return c; }
    let poly = [1], power = 1;
    for (let n = 0; n < 20; n++) { const next = new Array(poly.length + 1).fill(0); for (let j = 0; j < poly.length; j++) { next[j] ^= poly[j]; next[j + 1] ^= mul(poly[j], power); } poly = next; power = mul(power, 2); }
    const ecc = new Array(20).fill(0);
    for (const word of words) { const factor = word ^ ecc.shift(); ecc.push(0); for (let j = 0; j < 20; j++) ecc[j] ^= mul(poly[j + 1], factor); }
    const stream = []; for (const word of words.concat(ecc)) for (let k = 7; k >= 0; k--) stream.push(word >>> k & 1);
    const n = 33, cells = Array.from({ length: n }, () => Array(n).fill(0)), reserved = Array.from({ length: n }, () => Array(n).fill(false));
    function set(x, y, value) { if (x >= 0 && y >= 0 && x < n && y < n) { cells[y][x] = +!!value; reserved[y][x] = true; } }
    function finder(cx, cy) { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)); set(cx + dx, cy + dy, d !== 2 && d !== 4); } }
    for (let i = 0; i < n; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    finder(3, 3); finder(n - 4, 3); finder(3, n - 4);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(26 + dx, 26 + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    // Format L / mask 0 with BCH(15,5) and XOR 0x5412: 0x77C4.
    const format = 0x77C4, bit = i => format >>> i & 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(n - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, n - 15 + i, bit(i));
    set(8, n - 8, 1);
    let at = 0;
    for (let right = n - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < n; vert++) {
        const y = ((right + 1) & 2) === 0 ? n - 1 - vert : vert;
        for (let j = 0; j < 2; j++) { const x = right - j; if (!reserved[y][x]) cells[y][x] = (stream[at++] || 0) ^ +((x + y) % 2 === 0); }
      }
    }
    return cells;
  }
  function draw(g, text, x, y, size) {
    const cells = encode(text), unit = Math.floor(size / (cells.length + 8)), width = unit * (cells.length + 8);
    g.fillStyle = '#FFFFFF'; g.fillRect(x, y, width, width); g.fillStyle = '#111111';
    cells.forEach((row, yy) => row.forEach((v, xx) => { if (v) g.fillRect(x + (xx + 4) * unit, y + (yy + 4) * unit, unit, unit); }));
    return width;
  }
  const api = { encode, draw };
  if (typeof module !== 'undefined') module.exports = api; else root.CoalQR = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
