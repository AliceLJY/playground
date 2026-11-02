(function (root) {
  'use strict';
  const C = { bg: '#101827', floor: '#182637', grid: '#24394A', mint: '#72F1C4', pink: '#FF5DA2', red: '#FF665E', yellow: '#FFD166', ink: '#111111', white: '#F4F1DE' };
  const glyphs = { '?': ['01110','11011','00011','00110','00100','00000','00100'], '0': ['01110','11011','11011','11011','01110'], '1': ['00100','01100','00100','00100','01110'], '!': ['00100','00100','00100','00000','00100'] };
  function pixelText(g, char, x, y, scale, color) {
    g.fillStyle = color;
    (glyphs[char] || glyphs['?']).forEach((row, yy) => [...row].forEach((v, xx) => { if (v === '1') g.fillRect(x + xx * scale, y + yy * scale, scale, scale); }));
  }
  function atlas() {
    const a = document.createElement('canvas'); a.width = 320; a.height = 48;
    const g = a.getContext('2d'); g.imageSmoothingEnabled = false;
    function box(x, y, w, h, color) { g.fillStyle = color; g.fillRect(x, y, w, h); }
    // Tile 0: body, two legs, antenna. No arms. White sticker silhouette surrounds the black shape.
    const shape = new Set();
    for (let y = 11; y <= 30; y++) for (let x = 6; x <= 25; x++) if ((x - 15.5) ** 2 + (y - 20.5) ** 2 < 99) shape.add(x + ',' + y);
    for (let y = 31; y <= 36; y++) { shape.add('11,' + y); shape.add('20,' + y); }
    for (let y = 4; y <= 11; y++) shape.add('17,' + y);
    for (const key of shape) { const [x, y] = key.split(',').map(Number); box(x - 1, y - 1, 3, 3, '#FFFFFF'); }
    for (const key of shape) { const [x, y] = key.split(',').map(Number); box(x, y, 1, 1, C.ink); }
    box(15, 1, 5, 4, '#FFFFFF'); box(16, 1, 3, 4, C.pink); box(15, 2, 5, 2, C.pink);
    box(10, 18, 3, 3, '#FFFFFF'); box(19, 18, 3, 3, '#FFFFFF'); box(14, 25, 5, 1, '#FFFFFF');
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
  function makeFloor() {
    const c = document.createElement('canvas'); c.width = 360; c.height = 520; const g = c.getContext('2d');
    g.fillStyle = C.floor; g.fillRect(0, 0, 360, 520); g.strokeStyle = C.grid; g.lineWidth = 1;
    for (let x = 0; x <= 360; x += 24) { g.beginPath(); g.moveTo(x + .5, 0); g.lineTo(x + .5, 520); g.stroke(); }
    for (let y = 0; y <= 520; y += 24) { g.beginPath(); g.moveTo(0, y + .5); g.lineTo(360, y + .5); g.stroke(); }
    g.fillStyle = '#304956'; for (let y = 24; y < 520; y += 96) for (let x = 24; x < 360; x += 96) { g.fillRect(x - 2, y, 5, 1); g.fillRect(x, y - 2, 1, 5); }
    g.strokeStyle = '#3C5962'; g.strokeRect(6.5, 6.5, 347, 507);
    g.fillStyle = '#304956'; g.textAlign = 'center'; g.font = 'bold 24px monospace'; g.fillText('{  COAL  }', 180, 250);
    g.font = '9px monospace'; g.fillText('KEEP YOUR LITTLE LIGHT ON', 180, 268);
    return c;
  }
  function createRenderer(canvas) {
    const g = canvas.getContext('2d', { alpha: false }), a = atlas(), floor = makeFloor();
    let calls = 0;
    function draw(s, only = '') {
      const scale = canvas.width / 360; g.setTransform(scale, 0, 0, scale, 0, 0); g.imageSmoothingEnabled = false;
      g.globalAlpha = 1; g.drawImage(floor, 0, 0); calls = 1;
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
        for (let h = 0; h < 2 + s.cards[0]; h++) {
          const angle = s.tick * .025 + h * Math.PI * 2 / (2 + s.cards[0]);
          g.globalAlpha = s.off ? .35 : 1; sprite(g, a, 1 + h % 3, s.x + Math.cos(angle) * 25, s.y + Math.sin(angle) * 25, 18); calls++;
        }
      }
      g.globalAlpha = 1;
      if (only !== 'background') {
        // Hero is drawn last: feedback and helpers never erase the white silhouette.
        sprite(g, a, 0, s.x, s.y, 36); calls++;
        if (s.invuln && !only) { g.strokeStyle = s.invuln % 12 < 6 ? C.white : C.pink; g.lineWidth = 1; g.beginPath(); g.arc(s.x, s.y + 1, 19, 0, Math.PI * 2); g.stroke(); calls++; }
      }
      g.globalAlpha = 1; return calls;
    }
    return { draw, atlas: a, canvas, colors: C, sprite, get calls() { return calls; } };
  }
  root.CoalArt = { colors: C, atlas, sprite, createRenderer };
})(globalThis);
