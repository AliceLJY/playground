(function (root) {
  'use strict';
  const C = { bg: '#101827', floor: '#182637', grid: '#24394A', mint: '#72F1C4', pink: '#FF5DA2', red: '#FF665E', yellow: '#FFD166', ink: '#111111', white: '#F4F1DE' };
  const glyphs = { '?': ['01110','11011','00011','00110','00100','00000','00100'], '0': ['01110','11011','11011','11011','01110'], '1': ['00100','01100','00100','00100','01110'], '!': ['00100','00100','00100','00000','00100'] };
  function pixelText(g, char, x, y, scale, color) {
    g.fillStyle = color;
    (glyphs[char] || glyphs['?']).forEach((row, yy) => [...row].forEach((v, xx) => { if (v === '1') g.fillRect(x + xx * scale, y + yy * scale, scale, scale); }));
  }
  // Small deterministic generator for art only; the simulation never reads it.
  function hash(seed) {
    let t = seed >>> 0;
    return () => { t = (t + 0x6D2B79F5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
  }
  // Hero cell: 32 x 48 sprite pixels. eye 0/1/2 = looking left/ahead/right (antenna leans the other way); leg 0 stand, 1/2 stride.
  function hero(g, ox, eye, leg) {
    function box(x, y, w, h, color) { g.fillStyle = color; g.fillRect(ox + x, y, w, h); }
    const shape = new Map(), lean = eye === 0 ? 1 : eye === 2 ? -1 : 0;
    for (let y = 11; y <= 30; y++) for (let x = 6; x <= 25; x++) if ((x - 15.5) ** 2 + (y - 20.5) ** 2 < 99) shape.set(x + ',' + y, 'body');
    const left = leg === 1 ? 34 : 36, right = leg === 2 ? 34 : 36;
    for (let y = 31; y <= left; y++) shape.set('11,' + y, 'leg');
    for (let y = 31; y <= right; y++) shape.set('20,' + y, 'leg');
    shape.set('10,' + left, 'leg'); shape.set('21,' + right, 'leg');
    for (let y = 4; y <= 11; y++) shape.set((17 + (y < 8 ? lean : 0)) + ',' + y, 'leg');
    for (const key of shape.keys()) { const [x, y] = key.split(',').map(Number); box(x - 1, y - 1, 3, 3, '#FFFFFF'); }
    for (const [key, part] of shape) {
      const [x, y] = key.split(',').map(Number);
      let color = C.ink;
      if (part === 'body') {
        const hl = (x - 11.5) ** 2 + (y - 15.5) ** 2, rim = (x - 15.5) * .6 + (y - 20.5) * .8;
        if (hl < 5) color = '#3A3E4A'; else if (hl < 16) color = '#24272F'; else if (rim > 7.2) color = '#060608';
        else if ((x * 7 + y * 3) % 11 === 0 && rim < 4) color = '#1C1E25';
      }
      box(x, y, 1, 1, color);
    }
    box(10, 13, 2, 1, '#5C6272'); box(10, 14, 1, 1, '#5C6272');
    const tip = 16 + lean;
    box(tip - 1, 1, 5, 4, '#FFFFFF'); box(tip, 1, 3, 4, C.pink); box(tip - 1, 2, 5, 2, C.pink); box(tip, 2, 1, 1, '#FFC2DD');
    const e = eye - 1;
    box(10 + e, 18, 3, 3, '#FFFFFF'); box(19 + e, 18, 3, 3, '#FFFFFF'); box(14 + e, 25, 5, 1, '#FFFFFF');
  }
  function atlas() {
    const a = document.createElement('canvas'); a.width = 32 * 19; a.height = 48;
    const g = a.getContext('2d'); g.imageSmoothingEnabled = false;
    function box(x, y, w, h, color) { g.fillStyle = color; g.fillRect(x, y, w, h); }
    // Tile 0: body, two legs, antenna. No arms. White sticker silhouette surrounds the black shape.
    hero(g, 0, 1, 0);
    // Tiles 10–18: the same hero in three looking directions times three leg poses.
    for (let eye = 0; eye < 3; eye++) for (let leg = 0; leg < 3; leg++) hero(g, (10 + eye * 3 + leg) * 32, eye, leg);
    // Friendly satellite characters: original tiny terminal creatures, each with two feet.
    for (let n = 1; n <= 3; n++) {
      const x = n * 32, col = n === 2 ? C.yellow : n === 3 ? C.pink : C.mint;
      box(x + 6, 12, 20, 17, C.ink); box(x + 8, 10, 16, 21, col);
      box(x + 10, 14, 12, 10, C.bg); box(x + 12, 17, 2, 3, col); box(x + 18, 17, 2, 3, col);
      box(x + 10, 31, 3, 3, C.ink); box(x + 20, 31, 3, 3, C.ink); box(x + 14, 7, 4, 3, col);
    }
    // 4 question cloud, 5 token, 6 rate goblin, 7 compressor, 8 mimic, 9 boss.
    for (let n = 4; n <= 9; n++) {
      const x = n * 32, col = n === 4 ? '#AF83EF' : n === 5 ? '#7B9AEF' : n === 7 ? C.yellow : C.pink;
      box(x + 5, 10, 22, 22, C.ink); box(x + 7, 8, 18, 26, C.ink);
      box(x + 6, 11, 20, 20, col); box(x + 8, 9, 16, 24, col);
      box(x + 9, 10, 13, 2, '#FFFFFF55'); box(x + 7, 29, 18, 3, '#00000033');
      if (n === 4 || n === 9) pixelText(g, '?', x + 11, 13, 2, C.bg);
      if (n === 5) { pixelText(g, '0', x + 8, 17, 1, C.bg); pixelText(g, '1', x + 18, 17, 1, C.bg); }
      if (n === 6) { box(x + 8, 15, 5, 3, C.bg); box(x + 19, 15, 5, 3, C.bg); box(x + 12, 23, 8, 2, C.bg); }
      if (n === 7) { box(x + 9, 18, 5, 5, C.bg); box(x + 18, 18, 5, 5, C.bg); box(x + 13, 19, 6, 3, C.white); }
      if (n === 8) { box(x + 8, 16, 16, 12, C.bg); box(x + 9, 17, 3, 3, C.white); box(x + 20, 17, 3, 3, C.white); }
    }
    return a;
  }
  function sprite(g, a, tile, x, y, size = 32, height = size * 1.5) {
    g.drawImage(a, tile * 32, 0, 32, 48, Math.round(x - size / 2), Math.round(y - height * .47), size, height);
  }
  // Floor stones per level, in 2-unit pixels (180 x 260). Slate flagstones with grout, bevels, cracks and
  // coal dust; dim circuit traces in the grout; vent grates; a coal-rubble border that darkens into the edge.
  const palettes = [
    { stones: ['#243246', '#29384D', '#1F2C3E', '#2D3C52', '#223044', '#2F3849'], accent: '#5B3C78' },
    { stones: ['#1E303B', '#223541', '#1B2C36', '#263945', '#1D2F3A', '#2A3640'], accent: '#3E4C5E' },
    { stones: ['#262840', '#2A2D46', '#22243A', '#2E3049', '#24263D', '#30303F'], accent: '#6A3A2A' }
  ];
  function shade(hex, d) {
    const n = parseInt(hex.slice(1), 16), f = v => Math.max(0, Math.min(255, v + d));
    return '#' + ((f(n >> 16) << 16) | (f(n >> 8 & 255) << 8) | f(n & 255)).toString(16).padStart(6, '0');
  }
  function makeFloor(level) {
    const W = 180, H = 260, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), rnd = hash(9173 + level * 101), pal = palettes[level] || palettes[0];
    const px = (x, y, color) => { g.fillStyle = color; g.fillRect(x, y, 1, 1); };
    const nodes = [], embers = [];
    g.fillStyle = '#070B12'; g.fillRect(0, 0, W, H);
    // Flagstones on a 12-pixel grid: singles, long slabs and big 2 x 2 slabs, each with its own tone,
    // soft blotches, a lit top-left bevel, a dark lower-right lip, chips, cracks and dust. Grout stays dark.
    const cols = 15, rows = 22, taken = new Uint8Array(cols * rows);
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      if (taken[row * cols + col]) continue;
      const r = rnd(), free = (c, rr) => c < cols && rr < rows && !taken[rr * cols + c];
      let cw = 1, ch = 1;
      if (r < .12 && free(col + 1, row) && free(col, row + 1) && free(col + 1, row + 1)) { cw = 2; ch = 2; }
      else if (r < .34 && free(col + 1, row)) cw = 2;
      else if (r < .46 && free(col, row + 1)) ch = 2;
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) taken[(row + y) * cols + col + x] = 1;
      const x0 = col * 12, y0 = row * 12, w = cw * 12, h = ch * 12;
      if (cw === 1 && ch === 1 && rnd() < .05 && row > 1 && row < 20 && col > 0 && col < 14) {
        // Vent grate.
        g.fillStyle = '#05080D'; g.fillRect(x0 + 1, y0 + 1, 10, 10);
        g.fillStyle = '#2E3846'; g.fillRect(x0 + 1, y0 + 1, 10, 1); g.fillRect(x0 + 1, y0 + 1, 1, 10); g.fillRect(x0 + 1, y0 + 10, 10, 1); g.fillRect(x0 + 10, y0 + 1, 1, 10);
        g.fillStyle = '#3F4B5D'; for (let k = 0; k < 4; k++) g.fillRect(x0 + 2, y0 + 3 + k * 2, 8, 1);
        continue;
      }
      const base = shade(pal.stones[Math.floor(rnd() * pal.stones.length)], Math.floor(rnd() * 19) - 7);
      g.fillStyle = base; g.fillRect(x0 + 1, y0 + 1, w - 1, h - 1);
      for (let k = 0; k < 1 + cw * ch; k++) {
        const bx = x0 + 2 + rnd() * (w - 5), by = y0 + 2 + rnd() * (h - 5), rx = 1.5 + rnd() * 3, ry = 1 + rnd() * 2, tone = shade(base, rnd() < .5 ? 4 : -4);
        g.fillStyle = tone;
        for (let y = Math.floor(by - ry); y <= by + ry; y++) for (let x = Math.floor(bx - rx); x <= bx + rx; x++)
          if (((x - bx) / rx) ** 2 + ((y - by) / ry) ** 2 <= 1 && x > x0 && x < x0 + w - 1 && y > y0 && y < y0 + h - 1) g.fillRect(x, y, 1, 1);
      }
      g.fillStyle = shade(base, 13); g.fillRect(x0 + 1, y0 + 1, w - 2, 1); g.fillRect(x0 + 1, y0 + 1, 1, h - 2);
      g.fillStyle = shade(base, -9); g.fillRect(x0 + 1, y0 + h - 1, w - 1, 1); g.fillRect(x0 + w - 1, y0 + 1, 1, h - 1);
      if (rnd() < .35) px(x0 + (rnd() < .5 ? 1 : w - 1), y0 + (rnd() < .5 ? 1 : h - 1), '#070B12');
      if (rnd() < .3 + cw * ch * .05) {
        let x = x0 + 3 + Math.floor(rnd() * (w - 6)), y = y0 + 2;
        const len = 4 + rnd() * (h - 4);
        for (let k = 0; k < len && y < y0 + h - 1; k++) { px(x, y, '#090E16'); if (rnd() < .6) px(x + 1, y, shade(base, 10)); y++; x += rnd() < .25 ? 1 : rnd() < .25 ? -1 : 0; if (x <= x0 + 1 || x >= x0 + w - 2) break; }
      }
      for (let k = 0; k < cw * ch * 3; k++) if (rnd() < .5) px(x0 + 2 + Math.floor(rnd() * (w - 4)), y0 + 2 + Math.floor(rnd() * (h - 4)), rnd() < .65 ? shade(base, -7) : shade(base, 9));
    }
    // Circuit traces through the grout lines: dim copper-mint wire with bright vias.
    for (let t = 0; t < 7; t++) {
      let x = (1 + Math.floor(rnd() * 13)) * 12, y = (1 + Math.floor(rnd() * 20)) * 12;
      const len = 3 + Math.floor(rnd() * 5);
      nodes.push([x, y]);
      for (let k = 0; k < len; k++) {
        const horizontal = k % 2 === 0, steps = 12 * (1 + Math.floor(rnd() * 3)), dir = rnd() < .5 ? -1 : 1;
        for (let j = 0; j < steps; j++) {
          if (horizontal) x += dir; else y += dir;
          if (x < 12 || x > 168 || y < 12 || y > 252) break;
          px(x, y, '#1F4D47'); if (j % 6 === 0) px(x, y, '#2B6E63');
        }
        x = Math.max(12, Math.min(168, x)); y = Math.max(12, Math.min(252, y));
        g.fillStyle = '#2B6E63'; g.fillRect(x - 1, y - 1, 2, 2); nodes.push([x, y]);
      }
    }
    // Per-level accent: glitch moss (hallucination), torn token paper (context), scorched hazard paint (quota).
    for (let k = 0; k < 26; k++) {
      const x = 10 + Math.floor(rnd() * (W - 20)), y = 10 + Math.floor(rnd() * (H - 20));
      if (level === 1) { g.fillStyle = '#9AA8B4'; g.fillRect(x, y, 4, 3); g.fillStyle = '#4C5B68'; g.fillRect(x + 1, y + 1, 2, 1); g.fillRect(x, y + 3, 4, 1); }
      else if (level === 2) { if (k % 3 === 0) { g.fillStyle = '#4A3A1E'; for (let j = 0; j < 6; j++) g.fillRect(x + j, y + (j % 2), 1, 1); } else px(x, y, '#2A1E24'); }
      else { g.fillStyle = pal.accent; g.fillRect(x, y, 1 + (k % 2), 1); if (k % 4 === 0) px(x + 1, y + 1, '#8E5BB0'); }
    }
    // Coal pebbles and a few embers.
    for (let k = 0; k < 90; k++) {
      const x = Math.floor(rnd() * W), y = Math.floor(rnd() * H), big = rnd() < .3;
      g.fillStyle = '#080B11'; g.fillRect(x, y, big ? 2 : 1, big ? 2 : 1);
      if (big) px(x, y, '#2B313D');
      if (rnd() < .08) embers.push([x + 1, y + 1]);
    }
    // Rubble border: lumps of coal piling up toward the edge, dithered darker as it nears the wall.
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
      if (edge > 9) continue;
      const bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]][y & 3][x & 3] / 16;
      if ((10 - edge) / 10 * .9 > bayer) px(x, y, edge < 3 ? '#04060A' : '#070A10');
    }
    for (let k = 0; k < 190; k++) {
      const side = k % 4, t = rnd(), r = 1 + Math.floor(rnd() * 4), d = Math.floor(rnd() * 8);
      const x = side === 0 ? d : side === 1 ? W - 1 - d : Math.floor(t * W), y = side === 2 ? d : side === 3 ? H - 1 - d : Math.floor(t * H);
      g.fillStyle = '#0E1118'; g.fillRect(x - r, y - r, r * 2 + 1, r * 2);
      g.fillStyle = '#2F3542'; g.fillRect(x - r, y - r, r + 1, 1); g.fillRect(x - r, y - r, 1, r);
      if (r > 2) { g.fillStyle = '#1C2029'; g.fillRect(x - r + 1, y - r + 1, r, r - 1); }
      g.fillStyle = '#05070B'; g.fillRect(x - r + 1, y + r - 1, r * 2, 1);
      if (rnd() < .07) embers.push([x, y]);
    }
    return { canvas: c, nodes, embers };
  }
  // Props, also in 2-unit pixels. Sprite rows: `up` rows of height above the footprint, then the footprint
  // (hw x hh pixels = the collision box), then the drop shadow. Every piece has a dark outline, lit top-left, dark side.
  const propUp = [14, 10, 7, 10];
  function makeProp(kind, hw, hh) {
    const up = propUp[kind], c = document.createElement('canvas'); c.width = hw + 4; c.height = up + hh + 4;
    const g = c.getContext('2d'), rnd = hash(400 + kind);
    const box = (x, y, w, h, color) => { g.fillStyle = color; g.fillRect(x, y, w, h); };
    const lights = [];
    // Contact shadow toward the lower right, like the hero and enemy shadows.
    box(3, up + 4, hw, hh - 1, 'rgba(1,2,6,.5)'); box(2, up + hh, hw + 2, 3, 'rgba(1,2,6,.4)');
    if (kind === 0) {
      // Server rack: lit lid, front with drive bays and LEDs, ventilated darker side panel.
      box(0, 0, hw, up + hh, '#04060A');
      box(1, 1, hw - 2, 7, '#4A5464'); box(1, 1, hw - 2, 1, '#77839A'); box(1, 1, 1, 7, '#66728A'); box(3, 3, hw - 6, 3, '#3B4452');
      box(1, 8, hw - 2, 1, '#0B0F15');
      box(1, 9, hw - 5, up + hh - 11, '#252D3A'); box(1, 9, 1, up + hh - 11, '#3A4555');
      box(hw - 4, 9, 3, up + hh - 11, '#161C25');
      for (let y = 11; y < up + hh - 3; y += 3) box(hw - 3, y, 1, 1, '#05070B');
      for (let r = 0, y = 11; y + 3 < up + hh - 2; r++, y += 5) {
        box(3, y, hw - 9, 4, '#121820'); box(3, y, hw - 9, 1, '#38434F'); box(3, y + 3, hw - 9, 1, '#0A0D12');
        for (let k = 9; k < hw - 7; k += 2) box(k, y + 2, 1, 1, '#1F2833');
        lights.push([4, y + 1, r % 3 === 1 ? C.pink : C.mint], [6, y + 1, C.mint], [hw - 8, y + 2, r % 2 ? C.yellow : C.mint]);
      }
      box(1, up + hh - 2, hw - 2, 1, '#0A0E14');
    } else if (kind === 1) {
      // Token crates: one big plank crate with a small crate on top; metal corners; braces stencilled on a label.
      const crate = (x, y, w, h, top) => {
        box(x, y, w, h, '#1E0F07');
        box(x + 1, y + 1, w - 2, top, '#B07644'); box(x + 1, y + 1, w - 2, 1, '#D49A60'); box(x + 1, y + 1, 1, top, '#C78B54');
        box(x + 2, y + 2, w - 4, 1, '#94603A');
        box(x + 1, y + 1 + top, w - 2, h - top - 2, '#7C4B28');
        for (let p = y + 3 + top; p < y + h - 2; p += 3) box(x + 1, p, w - 2, 1, '#5C3519');
        box(x + 1, y + 1 + top, 1, h - top - 2, '#9A6640'); box(x + w - 3, y + 1 + top, 2, h - top - 2, '#4D2A13');
        box(x + 1, y + 1 + top, w - 2, 1, '#3E2110');
        for (const [cx, cy] of [[x + 1, y + 1 + top], [x + w - 3, y + 1 + top], [x + 1, y + h - 3], [x + w - 3, y + h - 3]]) { box(cx, cy, 2, 2, '#6B7280'); box(cx, cy, 1, 1, '#A7AFBC'); }
      };
      crate(0, up - 2, hw, hh + 3, 6);
      crate(2, 0, 12, up + 3, 4);
      const lx = Math.floor(hw / 2) - 6, ly = up + 9;
      box(lx, ly, 13, 9, '#C99A64'); box(lx, ly, 13, 1, '#E2B77F'); box(lx, ly + 8, 13, 1, '#8A5E36');
      const ink = '#2A1508';
      box(lx + 3, ly + 1, 2, 1, ink); box(lx + 2, ly + 2, 1, 2, ink); box(lx + 1, ly + 4, 1, 1, ink); box(lx + 2, ly + 5, 1, 2, ink); box(lx + 3, ly + 7, 2, 1, ink);
      box(lx + 8, ly + 1, 2, 1, ink); box(lx + 10, ly + 2, 1, 2, ink); box(lx + 11, ly + 4, 1, 1, ink); box(lx + 10, ly + 5, 1, 2, ink); box(lx + 8, ly + 7, 2, 1, ink);
    } else if (kind === 2) {
      // Coal heap: a dark mound, faceted lumps piled on it, glowing ember seams between them.
      const cx = hw / 2, cy = up + hh / 2 + 1, rx = hw / 2, ry = hh / 2 + up / 2;
      for (let y = 0; y < up + hh; y++) for (let x = 0; x < hw; x++) {
        const d = ((x + .5 - cx) / rx) ** 2 + ((y + .5 - cy) / ry) ** 2;
        if (d <= 1) box(x, y, 1, 1, d > .82 ? '#030405' : '#0C0E12');
      }
      const lumps = [];
      for (let k = 0; k < 13; k++) {
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * .72;
        lumps.push([Math.round(cx + Math.cos(a) * rx * d), Math.round(cy + Math.sin(a) * ry * d * .9 - 1), 2 + Math.floor(rnd() * 3.5)]);
      }
      lumps.sort((p, q) => p[1] - q[1]);
      for (const [lx, ly, r] of lumps) {
        for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
          if (Math.abs(x) * .9 + Math.abs(y) * 1.2 > r + .4) continue;
          const lit = -x * .8 - y, edge = Math.abs(x) * .9 + Math.abs(y) * 1.2 > r - .7;
          box(lx + x, ly + y, 1, 1, edge ? '#040506' : lit > r * .55 ? '#454B58' : lit > 0 ? '#282C35' : lit > -r * .5 ? '#181B21' : '#0D0F13');
        }
        box(lx - Math.floor(r / 2), ly - Math.floor(r / 2), 1, 1, '#7A8294');
      }
      for (let k = 0; k < 6; k++) {
        const [lx, ly] = lumps[Math.floor(rnd() * lumps.length)], x = lx + 2, y = ly + 1;
        box(x, y, 1, 1, '#B4421B'); box(x + 1, y, 1, 1, '#7A2A12');
        lights.push([x, y, k % 3 ? '#FF7A2E' : '#FFC266']);
      }
    } else {
      // Old terminal: beige CRT on a squat stand, cracked green screen, keyboard slab in front, dangling cable.
      box(1, 0, hw - 2, up + hh - 5, '#2A2721');
      box(2, 1, hw - 4, up + hh - 7, '#BDB4A0'); box(2, 1, hw - 4, 1, '#E6DECA'); box(2, 1, 1, up + hh - 7, '#D6CDB8');
      box(hw - 5, 2, 3, up + hh - 8, '#8C8474'); box(2, up + hh - 7, hw - 4, 1, '#7A7364');
      box(4, 3, hw - 10, 13, '#151511'); box(5, 4, hw - 12, 11, '#0D2C24'); box(5, 4, hw - 12, 1, '#1E4A3E');
      box(6, 6, 1, 1, C.mint); box(7, 7, 1, 1, C.mint); box(6, 8, 1, 1, C.mint); box(9, 8, 3, 1, C.mint); box(6, 11, 5, 1, '#3E8F78');
      box(11, 4, 1, 2, '#4C6E62'); box(12, 6, 1, 2, '#4C6E62'); box(13, 8, 1, 1, '#4C6E62');
      box(4, 18, hw - 10, 1, '#9C947F'); for (let k = 5; k < hw - 6; k += 3) box(k, 19, 1, 1, '#6E6858');
      box(1, up + hh - 5, hw - 3, 5, '#24211B'); box(2, up + hh - 5, hw - 5, 1, '#A59D88'); box(2, up + hh - 4, hw - 5, 3, '#6E6858');
      for (let k = 3; k < hw - 4; k += 2) box(k, up + hh - 3, 1, 1, '#3E3A31');
      box(hw - 2, up + 4, 1, hh - 6, '#B03A6A'); box(hw - 1, up + hh - 3, 2, 1, '#B03A6A');
      lights.push([hw - 6, up + hh - 9, C.yellow]);
    }
    return { canvas: c, hw, hh, up, lights, screen: kind === 3 };
  }
  // Dithered light disc (radius r pixels) used to cut a lit hole out of the dark layer.
  function disc(r, color, alpha) {
    const c = document.createElement('canvas'); c.width = c.height = r * 2; const g = c.getContext('2d');
    const bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
    g.fillStyle = color;
    for (let y = 0; y < r * 2; y++) for (let x = 0; x < r * 2; x++) {
      const d = Math.hypot(x + .5 - r, y + .5 - r) / r;
      if (d >= 1) continue;
      const level = Math.min(1, (1 - d) * 1.7), step = Math.floor(level * 4) / 4 + (level * 4 % 1 > bayer[y & 3][x & 3] / 16 ? .25 : 0);
      if (step <= 0) continue;
      g.globalAlpha = Math.min(1, step) * alpha; g.fillRect(x, y, 1, 1);
    }
    return c;
  }
  function vignette(W, H, color, strength) {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
    g.fillStyle = color;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = (x + .5) / W * 2 - 1, dy = (y + .5) / H * 2 - 1, d = Math.max(0, Math.hypot(dx * .95, dy) - .55) / .75;
      const level = Math.min(1, d * d) * 4, a = (Math.floor(level) + (level % 1 > bayer[y & 3][x & 3] / 16 ? 1 : 0)) / 4;
      if (a <= 0) continue;
      g.globalAlpha = a * strength; g.fillRect(x, y, 1, 1);
    }
    return c;
  }
  function createRenderer(canvas) {
    const g = canvas.getContext('2d', { alpha: false }), a = atlas(), floors = [], props = root.CoalData.props.map((p, kind) => makeProp(kind, p.hw, p.hh));
    const dark = document.createElement('canvas'); dark.width = 180; dark.height = 260; const dg = dark.getContext('2d'); dg.imageSmoothingEnabled = false;
    const hole = disc(64, '#000000', 1), warm = disc(46, '#FFA24A', .3), edge = vignette(180, 260, '#020409', .8), hurtEdge = vignette(180, 260, '#FF2A3A', .85);
    let calls = 0, face = 1;
    function floorFor(level) { return floors[level] || (floors[level] = makeFloor(level)); }
    function prop(s, i, alpha) {
      const p = props[s.oKind[i]], x = s.ox[i] - s.ohw[i], y = s.oy[i] - s.ohh[i] - p.up * 2;
      g.globalAlpha = alpha; g.drawImage(p.canvas, x, y, p.canvas.width * 2, p.canvas.height * 2); g.globalAlpha = 1; calls++;
    }
    function draw(s, only = '') {
      const scale = canvas.width / 360; g.setTransform(scale, 0, 0, scale, 0, 0); g.imageSmoothingEnabled = false;
      const floor = floorFor(s.stageIndex), t = s.tick, hp = Math.max(0, s.hp) / s.maxHP;
      g.globalAlpha = 1; g.drawImage(floor.canvas, 0, 0, 360, 520); calls = 1;
      // Props sit on the floor; ones swallowed by the context wall linger as faint ghosts.
      for (let i = 0; i < s.oOn.length; i++) if (s.oOn[i] || s.ohw[i]) prop(s, i, s.oOn[i] ? 1 : .22);
      // Keep your light on: warm pool around the hero that shrinks with lost hearts and flickers during a cease-fire.
      const flicker = s.off ? (t % 9 < 3 ? .7 : .86) : 1, radius = (0.78 + 0.22 * hp) * flicker * (1 + Math.sin(t * .05) * .02);
      g.globalCompositeOperation = 'lighter'; const wr = 92 * radius; g.drawImage(warm, s.x - wr, s.y - wr + 6, wr * 2, wr * 2); g.globalCompositeOperation = 'source-over';
      dg.globalCompositeOperation = 'source-over'; dg.clearRect(0, 0, 180, 260); dg.fillStyle = 'rgba(3,5,12,.42)'; dg.fillRect(0, 0, 180, 260);
      dg.globalCompositeOperation = 'destination-out'; const hr = 64 * radius; dg.drawImage(hole, s.x / 2 - hr, (s.y + 6) / 2 - hr, hr * 2, hr * 2);
      dg.globalCompositeOperation = 'source-over'; dg.drawImage(edge, 0, 0);
      g.drawImage(dark, 0, 0, 360, 520); calls += 3;
      // Emissive bits stay bright in the dark: rack LEDs, ember cracks, terminal screens, circuit vias.
      for (let i = 0; i < s.oOn.length; i++) if (s.oOn[i]) {
        const p = props[s.oKind[i]], x = s.ox[i] - s.ohw[i], y = s.oy[i] - s.ohh[i] - p.up * 2;
        for (let k = 0; k < p.lights.length; k++) {
          const l = p.lights[k], on = ((t >> 4) + k * 7 + i * 3) % 11;
          if (on < 2) continue;
          g.fillStyle = l[2]; g.globalAlpha = on < 4 ? .55 : 1; g.fillRect(x + l[0] * 2, y + l[1] * 2, 2, 2); calls++;
        }
        if (s.oKind[i] === 2) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = .2 + ((t >> 3) % 5) * .02; g.drawImage(warm, x - 6, y - 4, p.canvas.width * 2 + 12, p.canvas.height * 2 + 8); g.globalCompositeOperation = 'source-over'; calls++; }
        if (p.screen) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = .1 + (t % 47 < 3 ? .12 : 0); g.fillStyle = C.mint; g.fillRect(x + 4, y - 2, 30, 30); g.globalCompositeOperation = 'source-over'; calls++; }
        g.globalAlpha = 1;
      }
      g.fillStyle = C.mint;
      for (let k = 0; k < floor.nodes.length; k++) { const n = floor.nodes[k], pulse = (t + k * 37) % 150; if (pulse < 24) { g.globalAlpha = 1 - pulse / 24; g.fillRect(n[0] * 2 - 2, n[1] * 2 - 2, 4, 4); calls++; } }
      g.fillStyle = '#FF8A3D';
      for (let k = 0; k < floor.embers.length; k++) { const e = floor.embers[k]; if ((t + k * 53) % 120 < 50) { g.globalAlpha = .8; g.fillRect(e[0] * 2, e[1] * 2, 2, 2); calls++; } }
      g.globalAlpha = 1;
      if (s.wall > 0) {
        const w = s.wall;
        g.fillStyle = '#10131E'; g.fillRect(0, 0, w, 520); g.fillRect(360 - w, 0, w, 520); g.fillRect(0, 0, 360, w); g.fillRect(0, 520 - w, 360, w);
        g.strokeStyle = C.yellow; g.setLineDash([4, 4]); g.strokeRect(w, w, 360 - w * 2, 520 - w * 2); g.setLineDash([]);
        g.fillStyle = '#596379'; g.font = '8px monospace';
        for (let y = 16; y < 520; y += 16) { g.fillText('tokens', 1, y); g.fillText('...ctx', 361 - w, y); }
        calls += 70;
      }
      if (only !== 'background' && only !== 'hero') {
        for (let i = 0; i < s.zOn.length; i++) if (s.zOn[i]) {
          const x = s.zx[i] - 43, y = s.zy[i] - 43, warn = s.tick - s.zBorn[i] < 72;
          g.fillStyle = warn ? '#FFD16618' : '#FF665E66'; g.fillRect(x, y, 86, 86);
          g.strokeStyle = warn ? C.yellow : C.red; g.lineWidth = 2; g.setLineDash(warn ? [6, 4] : []); g.strokeRect(x, y, 86, 86); g.setLineDash([]);
          g.textAlign = 'center'; g.font = 'bold 12px monospace'; g.fillStyle = warn ? C.yellow : C.white;
          g.fillText(warn ? '↓ ' + ((72 - s.tick + s.zBorn[i]) / 60).toFixed(1) : '429', x + 43, y + 47); calls += 3;
        }
        for (let i = 0; i < s.gOn.length; i++) if (s.gOn[i]) {
          const x = Math.round(s.gx[i]), y = Math.round(s.gy[i]);
          g.globalAlpha = s.gFake[i] && s.tick % 76 < 10 ? .45 : 1;
          if (s.gReveal[i]) {
            g.strokeStyle = C.pink; g.beginPath(); g.arc(x, y, 14 + (s.tick - s.gReveal[i]) / 5, 0, Math.PI * 2); g.stroke();
            sprite(g, a, 8, x, y, 21); calls += 2;
          } else {
            g.fillStyle = '#0B2D2E'; g.fillRect(x - 4, y - 4, 9, 9);
            g.fillStyle = C.mint; g.fillRect(x - 2, y - 4, 5, 9); g.fillRect(x - 4, y - 2, 9, 5);
            g.fillStyle = s.gFake[i] ? C.pink : C.white; g.fillRect(x - 1, y - 2, 2, 3); calls += 4;
          }
        }
        g.globalAlpha = 1;
        for (let i = 0; i < s.eOn.length; i++) if (s.eOn[i]) {
          const kind = s.eKind[i], age = s.tick - s.eBorn[i], x = s.ex[i], y = s.ey[i];
          let tile = kind === 0 ? 4 : kind === 1 ? 5 : kind === 2 ? 6 : kind === 3 ? 7 : kind === 4 ? 8 : 9;
          const size = kind >= 5 ? 64 : kind === 3 ? 36 : 28;
          if (age < 36) { g.strokeStyle = C.yellow; g.beginPath(); g.arc(x, y, 16, 0, Math.PI * 2); g.stroke(); calls++; }
          g.globalAlpha = age < 36 ? .35 : kind === 6 ? .4 : 1;
          g.fillStyle = '#00000045'; g.fillRect(x - size * .3, y + size * .22, size * .6, 4); calls++;
          if (kind === 5) { g.strokeStyle = C.white; g.lineWidth = 2; g.strokeRect(x - 25, y - 26, 50, 52); calls++; }
          sprite(g, a, tile, x, y + (kind === 0 ? Math.sin(s.tick * .07 + i) * 2 : 0), size); calls++;
          if (kind === 5) { g.fillStyle = C.bg; g.fillRect(x - 17, y - 10, 34, 18); g.fillStyle = C.white; g.font = 'bold 13px monospace'; g.textAlign = 'center'; g.fillText(s.stageIndex === 2 ? '429' : s.stageIndex === 1 ? '∞' : '?', x, y + 3); calls += 2; }
          if (s.eFlash[i]) { g.fillStyle = '#FFFFFF'; g.fillRect(x - 3, y - 3, 6, 6); calls++; }
        }
        g.globalAlpha = 1;
        for (let b = 0; b < s.bOn.length; b++) if (s.bOn[b]) {
          const beam = s.bKind[b]; g.strokeStyle = beam ? C.yellow : C.mint; g.lineWidth = beam ? 3 + s.cards[1] : 2;
          g.beginPath(); g.moveTo(s.bx[b] - s.bvx[b] * (beam ? 4 : 1.4), s.by[b] - s.bvy[b] * (beam ? 4 : 1.4)); g.lineTo(s.bx[b], s.by[b]); g.stroke(); calls++;
        }
        const orbit = s.data.hero.orbit;
        for (let h = 0; h < 2 + s.cards[0]; h++) {
          const angle = s.tick * .025 + h * Math.PI * 2 / (2 + s.cards[0]);
          g.globalAlpha = s.off ? .35 : 1; sprite(g, a, 1 + h % 3, s.x + Math.cos(angle) * orbit, s.y + Math.sin(angle) * orbit, 24); calls++;
        }
      }
      g.globalAlpha = 1;
      if (only !== 'background') {
        // Hero is drawn last: 2 units per sprite pixel, looks where it walks, strides while moving.
        const moving = Math.abs(s.vx) + Math.abs(s.vy) > .2;
        if (s.vx < -.3) face = 0; else if (s.vx > .3) face = 2; else if (moving) face = 1;
        const stride = moving ? 1 + ((t >> 3) & 1) : 0, bob = moving && stride === 1 ? -2 : 0;
        g.fillStyle = 'rgba(2,3,8,.5)'; g.fillRect(s.x - 18, s.y + 25, 36, 6); g.fillRect(s.x - 12, s.y + 31, 24, 2);
        sprite(g, a, 10 + face * 3 + stride, s.x, s.y + bob, 64, 96); calls += 3;
        if (s.invuln > 74 && !only) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = .55; sprite(g, a, 10 + face * 3 + stride, s.x, s.y + bob, 64, 96); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; calls++; }
        // A prop whose base is in front of the hero's feet covers the hero, see-through so the hero stays readable.
        for (let i = 0; i < s.oOn.length; i++) if (s.oOn[i]) {
          const p = props[s.oKind[i]], top = s.oy[i] - s.ohh[i];
          if (s.y + 22 < top && s.y + 30 > top - p.up * 2 && Math.abs(s.x - s.ox[i]) < s.ohw[i] + 24) prop(s, i, .5);
        }
        if (s.invuln && !only) { g.strokeStyle = s.invuln % 12 < 6 ? C.white : C.pink; g.lineWidth = 1; g.beginPath(); g.arc(s.x, s.y - 4, 28, 0, Math.PI * 2); g.stroke(); calls++; }
      }
      // Hit flash: red edges for the first 18 frames of an ordinary hit (a revival's longer shield does not flash).
      if (!only && s.invuln > 66 && s.invuln <= 84) { g.globalAlpha = (s.invuln - 66) / 18; g.drawImage(hurtEdge, 0, 0, 360, 520); g.globalAlpha = 1; calls++; }
      g.globalAlpha = 1; return calls;
    }
    return { draw, atlas: a, canvas, colors: C, sprite, get calls() { return calls; } };
  }
  root.CoalArt = { colors: C, atlas, sprite, createRenderer };
})(globalThis);
