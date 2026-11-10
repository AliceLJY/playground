/* All artwork is drawn here: no spritesheets, web fonts, or image requests. */
(() => {
  'use strict';
  const $ = s => document.querySelector(s), params = new URLSearchParams(location.search);
  const mvMode = params.get('mv') === '1', mvFrom = Math.max(0, Number(params.get('from')) || 0);
  // MV helpers also read desks/home: use the current portrait layout for the film.
  const Core=window.OfficeCore, landscapeQuery=matchMedia('(min-width:1000px) and (min-aspect-ratio:5/4)');
  const layoutKey=()=>mvMode?'film':params.get('wall')!=='1' && landscapeQuery.matches?'landscape':'portrait';
  const withLayout=key=>{const L=Core.layouts[key];return {...Core,...L,home:i=>Core.home(i,L),nameplates:(actors,measure,exclusions)=>Core.nameplates(actors,measure,exclusions,L)};};
  let C=withLayout(layoutKey());
  // ctx is swapped for a sprite while a squashing actor is painted (see person); everything else draws to the screen.
  const canvas = document.querySelector('#office'), screenCtx = canvas.getContext('2d');
  let ctx = screenCtx;
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  const backdrop = document.createElement('canvas'); backdrop.width = C.W * 2; backdrop.height = C.H * 2; canvas.width = C.W * 2; canvas.height = C.H * 2;
  const bg = backdrop.getContext('2d');
  $('.room-section').append($('#photo'));
  const view = ['hero', 'kitchen', 'bbq', 'breakfast', 'leisure', 'fun', 'nap', 'feast', 'queue', 'notice', 'meeting', 'booth', 'handoff', 'handoff-walk', 'board', 'night-guard', 'games', 'reception', 'argue', 'snack', 'melon', 'quota', 'supper', 'souvenir', 'radar', 'gate', 'orders', 'pool', 'farm', 'cat', 'clinic', 'read', 'arcade'].includes(params.get('view')) ? params.get('view') : null;
  // ?mv=1 plays mv-script.json for the short film (mv.js), ?mv=1&from=<s> starts partway; never live data.
  const forced = params.get('demo') === '1' || (view && view !== 'hero') || mvMode;
  // ?wall=1 is the desktop wallpaper (Plash): the room alone, parked in the empty part of the desktop, no photo
  // card, no welcome wave, never counted as a visitor. wl/wt/ww/wh place it, in percent of the screen.
  const wallMode = params.get('wall') === '1';
  // The wallpaper shows the main room only (the annex made the whole building too small to read on the desktop);
  // ?wall=1&annex=1 brings the annex back. The totals go into the line above the room instead.
  const wallRoom = wallMode && params.get('annex') !== '1';
  if (wallRoom) { canvas.height = 840; document.body.classList.add('wall-room'); }
  if (wallMode) {
    document.body.classList.add('wall');
    const place = { wl: 12, wt: 6, ww: 44, wh: 84 };
    // ?wr=<width/height> stretches the wallpaper room sideways to fill a wide empty patch (default 6/7, unstretched).
    const wr = Number(params.get('wr')); if (Number.isFinite(wr) && wr >= 0.5 && wr <= 2) document.body.style.setProperty('--wr', String(wr));
    if (params.get('notes') === '1') { document.body.classList.add('wall-notes'); const nw = Number(params.get('nw')); if (Number.isFinite(nw) && nw >= 10 && nw <= 50) document.body.style.setProperty('--nw', `${nw}vw`); }
    for (const k in place) { const v = Number(params.get(k)); document.body.style.setProperty(`--${k}`, `${Number.isFinite(v) && v >= 0 && v <= 100 && params.has(k) ? v : place[k]}${k === 'wl' || k === 'ww' ? 'vw' : 'vh'}`); }
  }
  let mv = null, mvUI = null;
  const labels = { busy: '干活中', waiting: '等你拍板', done: '交活了', idle: '休息中', away: '出差中', off: '下班了', unknown: '信号不明' };
  let script, sim, demo = false, ready = false, seed = 7, elapsed = 0, cursor = 0, cycle = 0, paused = false, wallBase = Date.now(), lastUI = -10, light = '', currentRoster = [], seen = new Set(), modeKey = '', metrics = [], lastFrame = 0;
  const beijing = n => new Date(n + 8 * 3600000);
  const formatClock = n => beijing(n).toISOString().slice(11, 16);
  let stats = null, events = [], nameplates = [], speechBoxes = [], build = '', noticesToday, boardRequested=false;
  let replay=null, latestLive=null, savedLive=null, historyAvailable=false, historyLoading=false, historyLoadedAt=-Infinity;
  const now = () => replay ? replay.clock : mv ? mv.clock(elapsed) : demo ? wallBase + elapsed : Date.now();
  const r = (g, color, x, y, w, h) => { g.fillStyle = color; g.fillRect(Math.round(x), Math.round(y), w, h); };
  const text = (g, value, x, y, size = 8, color = '#45534b', align = 'center') => { g.fillStyle = color; g.font = `${size}px "PingFang SC",system-ui,sans-serif`; g.textAlign = align; g.textBaseline = 'alphabetic'; g.fillText(value, x, y); };

  const placed = (g,offset,draw) => { g.save(); g.translate(...offset); draw(); g.restore(); };
  const wallBoard = () => Core.noticeBoard(sim.notices,now(),guest && !demo,noticesToday);

  function plant(g, x, y, large = false) {
    r(g, '#6f5946', x - 5, y, 11, 11); r(g, '#c79061', x - 6, y, 13, 4); r(g, '#bd885b', x - 3, y + 4, 7, 6);
    r(g, '#52745e', x - 1, y - 16, 3, 17); r(g, '#608568', x - 8, y - 14, 9, 6); r(g, '#86a376', x - 6, y - 17, 7, 4); r(g, '#446951', x + 2, y - 10, 8, 6); r(g, '#9aaf80', x + 3, y - 13, 7, 4);
    if (large) { r(g, '#6d9172', x - 9, y - 27, 9, 7); r(g, '#5b7e63', x + 1, y - 23, 9, 7); r(g, '#6f9273', x - 1, y - 23, 3, 9); }
  }
  function desk(g, x, y, index) {
    const owner = currentRoster.find((a, k) => (Number.isInteger(a.desk) ? a.desk : k) === index);
    const color = owner?.color || '#829e87';
    if (!mv && owner?.courier) { mailCounter(g, x, y, owner, color); return; }
    if (!mv && index === 0) { execDesk(g, x, y, owner, color); return; }
    r(g, '#4c4d4050', x - 25, y + 17, 56, 10);
    r(g, '#77563f', x - 26, y + 4, 52, 18); r(g, '#a97c52', x - 26, y + 4, 52, 11); r(g, '#d1a272', x - 28, y, 56, 10); r(g, '#e0b786', x - 28, y, 56, 2);
    r(g, '#715543', x - 24, y + 17, 4, 8); r(g, '#715543', x + 20, y + 17, 4, 8);
    r(g, '#35474a', x - 12, y - 12, 24, 16); r(g, '#213b40', x - 10, y - 10, 20, 12); r(g, '#71a29a', x - 8, y - 8, 15, 1); r(g, '#5c8d83', x - 8, y - 5, 9, 1); r(g, '#90b8a3', x - 8, y - 2, 12, 1); r(g, '#394947', x - 2, y + 4, 4, 3);
    r(g, '#e1d8ba', x - 9, y + 9, 18, 4); r(g, '#768474', x - 7, y + 10, 14, 1); r(g, color, x + 18, y - 2, 5, 7); r(g, '#e2ceac', x + 23, y, 2, 3);
    r(g, '#d9b98b', x - 23, y + 34, 46, 9); text(g, owner?.name || '', x, y + 41, 7, '#574e3b');
  }
  // The director's walnut desk: gold trim, two screens, a brass lamp and a gilt nameplate.
  function execDesk(g, x, y, owner, color) {
    r(g, '#4c4d4050', x - 27, y + 17, 58, 10);
    r(g, '#3d2418', x - 28, y + 4, 56, 18); r(g, '#5a3524', x - 28, y + 4, 56, 11); r(g, '#6e4330', x - 30, y, 60, 10); r(g, '#8a5a3e', x - 30, y, 60, 2); r(g, '#d9a441', x - 30, y + 9, 60, 1);
    r(g, '#d9a441', x - 26, y + 12, 52, 1); r(g, '#3d2418', x - 26, y + 17, 4, 8); r(g, '#3d2418', x + 22, y + 17, 4, 8);
    for (const dx of [-21, -1]) { r(g, '#2a3436', x + dx, y - 13, 22, 15); r(g, '#1b2b30', x + dx + 2, y - 11, 18, 11); r(g, '#71a29a', x + dx + 4, y - 9, 12, 1); r(g, '#90b8a3', x + dx + 4, y - 6, 9, 1); r(g, '#5c8d83', x + dx + 4, y - 3, 11, 1); }
    r(g, '#2a3436', x - 2, y + 2, 4, 3); r(g, '#e1d8ba', x - 9, y + 5, 18, 3); r(g, '#768474', x - 7, y + 6, 14, 1);
    r(g, '#b07a32', x + 24, y - 1, 2, 2); r(g, '#b07a32', x + 25, y - 10, 1, 9); r(g, '#d9a441', x + 21, y - 13, 7, 4);
    r(g, color, x - 27, y - 2, 5, 7); r(g, '#e2ceac', x - 22, y, 2, 3);
    r(g, '#b07a32', x - 24, y + 33, 48, 11); r(g, '#efc66c', x - 23, y + 34, 46, 9); text(g, owner?.name || '', x, y + 41, 7, '#5a3b16');
  }
  // Cobbler sorts notes: pigeonholes behind a counter, no computer.
  function mailCounter(g, x, y, owner, color) {
    r(g, '#4c4d4050', x - 25, y + 17, 56, 10);
    r(g, '#77563f', x - 24, y - 16, 48, 20); r(g, '#a97c52', x - 23, y - 15, 46, 18);
    for (let j = 0; j < 6; j++) for (let k = 0; k < 2; k++) { const px = x - 22 + j * 7.5, py = y - 14 + k * 9; r(g, '#5d4330', px, py, 6, 7); if ((j + k) % 3) r(g, ['#fff0c9', '#edc4a2', '#d9e3c6'][(j + k) % 3], px + 1, py + 2, 4, 4); }
    r(g, '#77563f', x - 26, y + 4, 52, 18); r(g, '#a97c52', x - 26, y + 4, 52, 11); r(g, '#d1a272', x - 28, y, 56, 10); r(g, '#e0b786', x - 28, y, 56, 2);
    r(g, '#715543', x - 24, y + 17, 4, 8); r(g, '#715543', x + 20, y + 17, 4, 8);
    r(g, '#fff4d5', x - 12, y + 2, 10, 6); r(g, '#c85b4a', x - 4, y + 2, 2, 2); r(g, '#f3e6b2', x + 2, y + 1, 9, 6); r(g, '#edc4a2', x + 3, y + 3, 9, 6);
    r(g, color, x + 18, y - 2, 5, 7); r(g, '#e2ceac', x + 23, y, 2, 3);
    r(g, '#d9b98b', x - 23, y + 34, 46, 9); text(g, owner?.name || '', x, y + 41, 7, '#574e3b');
  }
  // The room is cached on the backdrop for the office page; the MV draws it straight onto the canvas every frame
  // (through its camera, blending two lights), so it takes the target and the light as arguments.
  function room(g = bg, L = light) {
    if (g === bg) { bg.setTransform(2, 0, 0, 2, 0, 0); bg.clearRect(0, 0, C.W, C.H); }
    const sky = L === 'night' ? '#30465a' : L === 'dusk' ? '#dca879' : '#a5c6bf';
    // The phone tower's ground floor is 70 rows deeper (meeting room and totals board beside the boss desk).
    const F = C.bands ? 470 : 400;
    r(g, '#a49b8640', 16, 16, 338, F - 4); r(g, '#6d725e', 10, 10, 340, F - 2); r(g, '#dedbc3', 14, 14, 332, 68);
    r(g, '#f1e7ce', 17, 17, 326, 62); r(g, '#c7c7ac', 14, 73, 332, 10); r(g, '#8c967d', 14, 79, 332, 5);
    r(g, '#b58c63', 14, 84, 332, F - 83);
    for (let y = 84; y < F + 1; y += 18) for (let x = 14 - ((y / 18 | 0) % 2) * 24; x < 345; x += 48) {
      const left = Math.max(14, x), width = Math.min(345, x + 47) - left;
      r(g, ((x + y) / 6 | 0) % 3 ? '#c9a27a' : '#d1ad83', left, y, width, Math.min(17, F - y));
      if (y + 12 < F) r(g, '#bd946c', left + 3, y + 12, Math.max(0, width - 9), 1);
    }
    r(g, '#8a785e', 14, F, 332, 5); r(g, '#e5c498', 14, F - 3, 332, 3);
    if(C.id==='landscape')wingFloor(g);
    // Windows, curtains and a tiny skyline.
    for (const x of [25, 98]) {
      r(g, '#aaa98e', x, 25, 61, 43); r(g, '#4e756e', x + 2, 25, 57, 39); r(g, sky, x + 5, 28, 51, 32);
      r(g, L === 'night' ? '#243a47' : '#83a69c', x + 8, 49, 10, 11); r(g, L === 'night' ? '#294050' : '#91b3a6', x + 22, 43, 12, 17); r(g, '#74988c', x + 39, 52, 13, 8);
      r(g, '#e8e3c9', x + 29, 27, 3, 35); r(g, '#eee3c8', x + 4, 43, 53, 2); r(g, '#f4ebd8', x - 2, 24, 7, 41); r(g, '#ddd9bd', x + 57, 24, 6, 41); r(g, '#8d9d7c', x - 2, 64, 66, 4);
      if (L === 'night') { r(g, '#edcf82', x + 13, 52, 2, 2); r(g, '#edcf82', x + 26, 48, 3, 2); }
    }
    // Back-wall notice board; actual notices also appear in the accessible drawer.
    r(g, '#8c6447', 226, 23, 103, 49); r(g, '#b68d5f', 229, 26, 97, 43); text(g, '公 告 板', 277, 36, 7, '#fff3cf');
    if (mv) for (let j = 0; j < 4; j++) { const x = 236 + j * 21; r(g, ['#fff0c9', '#d9e3c6', '#edc4a2', '#f3e6b2'][j], x, 41 + j % 2 * 3, 16, 20); r(g, '#a56c4b', x + 7, 40 + j % 2 * 3, 2, 3); r(g, '#b9b194', x + 3, 48 + j % 2 * 3, 10, 1); r(g, '#c1b597', x + 3, 52 + j % 2 * 3, 7, 1); }
    // Wall clock and books.
    r(g, '#8d9279', 183, 30, 26, 25); r(g, '#faf0d7', 186, 33, 20, 19); r(g, '#6c725e', 195, 37, 2, 8); r(g, '#6c725e', 195, 43, 6, 2);
    text(g, '一起把点子做出来', 190, 70, 6, '#7e856e');
    // Director's partition has an open doorway onto the main aisle.
    r(g, '#8a9c8735', 20, 87, 91, 68); r(g, '#8f9a7d', 20, 87, 91, 3); r(g, '#8f9a7d', 20, 87, 3, 72); r(g, '#96a38b', 109, 88, 3, 58);
    r(g, '#6d806a', 28, 91, 34, 10); text(g, '总监室', 45, 99, 6, '#f2ebd3');
    if (!mv) departments(g);
    C.desks.forEach(([x, y], i) => { if (i !== 10 && (mv || ![5, 7, 9].includes(i))) desk(g, x, y, i); });
    // The bookshelf stays put; the little lounge becomes a game corner on the office page.
    if (mv) { r(g, '#775e45', 26, 173, 72, 29); r(g, '#9b7854', 28, 175, 68, 24);
    for (let j = 0; j < 9; j++) r(g, ['#7c9c84', '#d2b37e', '#ad7058', '#e1d2a6'][j % 4], 30 + j * 7, 178 + j % 3, 5, 17 - j % 3); }
    gameFurniture(g);
    if (mv) { r(g, '#6d735b', 113, 267, 2, 20); r(g, '#ead3a2', 108, 262, 12, 7); r(g, '#7d7c60', 109, 287, 10, 2); }
    // Boss desk, mail reception and front door.
    r(g, '#90755c35', 143, 350, 99, 47); r(g, '#82947b', 147, 347, 92, 45); r(g, '#9daa8c', 151, 351, 84, 37);
    r(g, '#775841', 149, 369, 88, 23); r(g, '#bf9568', 147, 365, 91, 15); r(g, '#dcba87', 147, 363, 91, 5); r(g, '#eddfb7', 180, 368, 25, 9); text(g, '小试AI', 192, 375, 7, '#665c44');
    r(g, '#f3e9c8', 155, 368, 16, 9); r(g, '#c7bc9a', 158, 370, 9, 1); r(g, '#c7bc9a', 158, 373, 7, 1); r(g, '#496f5d', 219, 367, 8, 8);
    placed(g,[C.desks[10][0]-308,C.desks[10][1]-339],()=>{
    r(g, '#865e43', 285, 340, 47, 23); r(g, '#c09a69', 282, 337, 51, 10); r(g, '#e5c595', 282, 337, 51, 2); text(g, mv ? '前 台' : '志愿者', 307, 356, 7, '#f2e6c7'); r(g, '#f0e4c4', 312, 333, 14, 7); r(g, '#9da384', 313, 335, 12, 1);
    });
    r(g, '#556b5b', 329, 374, 17, 26); r(g, '#99a288', 330, 376, 16, 22); r(g, '#f5e3af', 333, 386, 2, 3); text(g, 'OUT', 334, 371, 5, '#5b6857');
    plant(g, 329, 94, true); if (!C.bands) plant(g, 32, 380, true); if (mv) plant(g, 124, 200); plant(g, 271, 279);
    // A warm lamp pool is strictly decorative: no overlay on text or characters.
    if (L !== 'day') { g.fillStyle = L === 'night' ? '#323d6220' : '#e79e4120'; g.fillRect(14, 84, 332, F - 87); if (mv) r(g, '#f9d98c', 109, 263, 10, 3); }
    annex(g);
  }

  // Rooms are only floor tints and plaques: no new walls, so every route through the office stays as it was.
  function plaque(g, label, x, y, w, color = '#6d806a', ink = '#f2ebd3') { r(g, '#4c4d4040', x + 1, y + 1, w, 10); r(g, color, x, y, w, 10); text(g, label, x + w / 2, y + 8, 6, ink); }
  // A translucent block with a 1-pixel outline per department; the plaque sits inside its own block.
  function zone(g, x, y, w, h, color, alpha = '30') { r(g, color + alpha, x, y, w, h); r(g, color + 'c0', x, y, w, 1); r(g, color + 'c0', x, y + h - 1, w, 1); r(g, color + 'c0', x, y, 1, h); r(g, color + 'c0', x + w - 1, y, 1, h); }
  function departments(g) {
    // Engineering & review: Codex, Kimi, Agy along the top row; its plaque hangs on the wainscot above them.
    // Director's office: warm gold inside the glass partition, so it never reads as part of the blue team next door.
    r(g, '#d9a44138', 23, 90, 86, 69);
    plaque(g, '总监室', 28, 91, 34, '#b07a32');
    // A director's office worth the name: red-and-gold rug, trophy cabinet, brass floor lamp and a big plant.
    r(g, '#7a2e2a', 30, 116, 72, 38); r(g, '#9c3b33', 32, 118, 68, 34); r(g, '#d9a441', 34, 120, 64, 1); r(g, '#d9a441', 34, 149, 64, 1); r(g, '#d9a441', 34, 120, 1, 30); r(g, '#d9a441', 97, 120, 1, 30);
    for (let k = 0; k < 4; k++) { r(g, '#d9a441', 42 + k * 16, 134, 4, 2); r(g, '#d9a441', 43 + k * 16, 133, 2, 4); }
    r(g, '#4c4d4040', 25, 139, 11, 3); r(g, '#4a2f22', 24, 104, 11, 36); r(g, '#6b4430', 25, 105, 9, 34);
    for (const [y, c] of [[107, '#7c9c84'], [117, '#ad7058'], [127, '#2f68ae']]) { r(g, '#4a2f22', 25, y + 8, 9, 1); r(g, c, 26, y, 2, 8); r(g, '#e1d2a6', 28, y + 1, 2, 7); }
    r(g, '#efc66c', 30, 127, 3, 3); r(g, '#d6a845', 31, 130, 1, 3); r(g, '#b07a32', 29, 133, 5, 2);
    r(g, '#8c6a3a', 103, 106, 1, 30); r(g, '#b07a32', 101, 135, 5, 2); r(g, '#f3dc9a', 99, 101, 9, 6); r(g, '#d9b45a', 99, 106, 9, 1);
    if (light && light !== 'day') { g.fillStyle = '#f9d98c22'; g.fillRect(92, 104, 17, 30); }
    zone(g, 116, 88, 228, 66, '#2f73c4', '4c'); plaque(g, '工程审查部', 196, 74, 66, '#2f68ae');
    // Showcase corner: the first thing a visitor passes on the way in; tapping it opens works and accounts.
    zone(g, 18, 162, 80, 92, '#c9963a'); 
    // Mailroom, now small: Cobbler's sorting counter and Dots' X clipping board. The showcase has the corner to its left.
    zone(g, 100, 162, 92, 88, '#6f9f5a'); plaque(g, '收发室', 150, 164, 36, '#5f8a4d');
    r(g, '#4c4d4040', 105, 212, 22, 3); r(g, '#5a4636', 106, 206, 2, 8); r(g, '#5a4636', 122, 206, 2, 8);
    r(g, '#8c6447', 103, 182, 24, 26); r(g, '#c9a27a', 105, 184, 20, 22);
    for (const [x, y, c] of [[106, 186, '#f4ebd8'], [114, 185, '#e8eef2'], [107, 195, '#e8eef2'], [116, 194, '#f4ebd8']]) { r(g, c, x, y, 7, 8); r(g, '#9aa3a0', x + 1, y + 2, 5, 1); r(g, '#9aa3a0', x + 1, y + 4, 4, 1); r(g, '#c85b4a', x + 3, y - 1, 1, 2); }
    r(g, '#2f3a3c', 118, 199, 5, 5); text(g, 'X', 120, 204, 5, '#ffffff');
    // Production: Grok and Muse share the film room; a little camera on a tripod in the corner.
    zone(g, 198, 162, 146, 88, '#8a63a8'); plaque(g, '制片室', 247, 164, 36, '#7a5896');
    r(g, '#4a4552', 334, 222, 2, 22); r(g, '#4a4552', 330, 242, 10, 2); r(g, '#2f3a3c', 329, 214, 12, 9); r(g, '#90b8a3', 331, 216, 4, 4); r(g, '#d96952', 338, 215, 2, 2);
    // Companion: etwin-cc's stool beside the boss desk, a pink rug and a heart cushion.
    const [cx, cy] = C.desks[7], hx = cx, hy = cy + 27;
    r(g, '#e58f9a30', hx - 16, hy - 20, 30, 26); r(g, '#e58f9a90', hx - 16, hy + 5, 30, 1);
    r(g, '#8c6447', hx - 7, hy - 3, 14, 4); r(g, '#e58f9a', hx - 7, hy - 5, 14, 3); r(g, '#8c6447', hx - 6, hy + 1, 2, 4); r(g, '#8c6447', hx + 4, hy + 1, 2, 4);
    plaque(g, '陪伴', hx - 12, hy + 7, 24, '#c9727e');
  }

  function gameFurniture(g) {
    r(g,'#91a38a',22,260,238,78); r(g,'#dad7b4',24,262,234,74);
    if (mv) plaque(g,'游戏室',72,263,34,'#5d7f6e');
    else { r(g,'#4c4d4040',71,263,64,23); r(g,'#5a2420',70,262,64,23); r(g,'#8c3a2e',72,264,60,19); text(g,'游 戏 室',102,272,7,'#f6d68a'); }
    // Claw machine: glass box of plush toys, a claw on a rail, a coin slot.
    r(g,'#4c4d4040',187,326,22,4); r(g,'#b5473a',186,300,20,28); r(g,'#d96952',187,301,18,3); r(g,'#cfe3dc',188,305,16,13); r(g,'#e6f1ec',189,306,3,11);
    for (const [x,y,c] of [[190,314,'#efc66c'],[195,315,'#e58f9a'],[200,314,'#90b8a3'],[193,312,'#b397b8'],[198,312,'#f4ebd8']]) r(g,c,x,y,4,4);
    r(g,'#8c3a2e',187,319,18,8); r(g,'#efc66c',193,321,6,2); r(g,'#2f3a3c',201,321,2,3); r(g,'#d9a441',189,322,2,2);
    text(g,'抓娃娃',196,298,6,'#8c3a2e');
    // Dance machine: screen cabinet behind a 3×3 pad of arrow tiles.
    r(g,'#4c4d4040',219,313,32,3); r(g,'#3e4b47',218,300,32,14); r(g,'#1b2b30',220,302,28,10); r(g,'#2f3a3c',224,314,20,3);
    r(g,'#5d6b60',220,317,30,18); for (let j=0;j<3;j++) for (let k=0;k<3;k++) r(g,(j+k)%2?'#7a8a80':'#8fa09a',221+j*10,318+k*6,9,5);
    text(g,'跳舞机',234,298,6,'#3e4b47');
    for(const x of [24,48,200,224]) {
      r(g,'#35474a',x,260,20,29); r(g,'#739780',x+1,261,18,4);
      r(g,'#213b40',x+3,266,14,10); r(g,'#90b8a3',x+5,268,4,2);
      r(g,'#c2976b',x,278,20,6); r(g,'#d1ad83',x,278,20,2);
      r(g,'#33443f',x+4,276,2,5); r(g,'#d96952',x+3,275,4,3); r(g,'#efc66c',x+13,280,3,2);
      r(g,'#506b5b',x+2,284,16,7); r(g,'#213b40',x+8,286,5,2);
    }
    r(g,'#77563f',88,292,20,20); r(g,'#dfb987',88,292,20,16);
    for(let y=0;y<4;y++) for(let x=0;x<4;x++) r(g,(x+y)%2?'#9b7854':'#eee4c7',90+x*4,292+y*4,4,4);
    // Massage chairs (the old beanbag spots): padded back and headrest, arms, a remote, a green power light; labelled for visitors.
    for(const x of [26,50]) {
      if (mv) { const color=x===26?'#739780':'#b397b8'; r(g,'#506b5b',x,318,20,14); r(g,color,x,314,20,15); r(g,color,x+3,312,14,3); r(g,'#d2d3b1',x+3,324,14,5); continue; }
      r(g,'#4c4d4038',x+1,330,20,4); r(g,'#2f2a2a',x+2,327,16,4);
      r(g,'#5a4640',x+3,304,14,18); r(g,'#6e5850',x+4,305,12,16); for (const y of [309,313,317]) r(g,'#5a4640',x+5,y,10,1);
      r(g,'#7a6258',x+5,301,10,5); r(g,'#8a7268',x+6,302,8,2);
      r(g,'#4a3a36',x+2,319,16,8); r(g,'#5e4a44',x+3,320,14,3);
      r(g,'#3a302c',x,316,3,11); r(g,'#3a302c',x+17,316,3,11); r(g,'#9aa3a0',x+17,314,2,3); r(g,'#67b779',x+18,315,1,1);
    }
    if (!mv) { r(g,'#fff6dc',33,333,30,8); text(g,'按摩椅',48,340,6,'#5a3b16'); }
    r(g,'#77563f',138,308,4,12); r(g,'#77563f',170,308,4,12);
    r(g,'#35474a',136,276,40,40); r(g,'#527d72',138,278,36,36);
    r(g,'#c8d8bc',138,278,36,2); r(g,'#c8d8bc',138,312,36,2);
    r(g,'#c8d8bc',138,278,2,36); r(g,'#c8d8bc',172,278,2,36); r(g,'#90b8a3',155,280,1,32);
    r(g,'#33443f',134,295,44,3); r(g,'#eee4c7',134,294,44,2);
    for(let x=136;x<176;x+=4)r(g,'#9cbab1',x,296,2,2);
  }
  function gamesUnder() {
    for(const [x,slot] of [[24,4],[48,5],[200,10],[224,11]]) {
      const active=sim.actors.some(a=>a.gameSlot===slot && sim.gameActivity(a)==='arcade');
      r(ctx,active && Math.floor(sim.time*3)%2?'#90b8a3':'#213b40',x+3,266,14,8);
      if(active) { const shift=Math.floor(sim.time*4)%4; r(ctx,'#efc66c',x+5+shift,268,3,3); r(ctx,'#f4ebd8',x+12,271-shift%2*2,2,2); }
      else r(ctx,'#739780',x+7,269,6,2);
    }
    const playing=sim.actors.some(a=>sim.gameActivity(a)==='chess'),turn=Math.floor(sim.time/3)%4;
    for(const [x,y,c] of [[92,294,'#33443f'],[100,302,'#fff4d5'],[playing?92+turn*4:96,298,'#33443f']]) r(ctx,c,x,y,2,2);
  }

  function wingFloor(g) {
      r(g,'#6d725e',346,10,284,398); r(g,'#f1e7ce',350,14,276,65);
      r(g,'#c7c7ac',346,73,280,10); r(g,'#8c967d',346,79,280,5);
      r(g,'#c9a27a',346,84,280,313);
      for(let y=84;y<397;y+=18) {r(g,'#b58c63',346,y,280,1);for(let x=354+(y%36?24:0);x<626;x+=48)r(g,'#b58c63',x,y,1,Math.min(18,397-y));}
      r(g,'#8a785e',346,400,280,5); r(g,'#e5c498',346,397,280,3);
      if(light!=='day')r(g,light==='night'?'#323d6220':'#e79e4120',346,84,280,313);
  }
  // Phone tower (11-03): 2F the noisy rooms, 3F the quiet ones; stairs down the right-hand column between floors.
  function towerShell(g) {
    const flight=(y,h)=>{ r(g,'#6d725e',308,y,38,h); r(g,'#c9a27a',312,y-2,30,h+4); for (let yy=y+4;yy<y+h;yy+=6) r(g,'#b58c63',313,yy,28,1); };
    flight(470,22); flight(814,30);
    r(g,'#6d725e',10,488,340,330); r(g,'#dedbc3',14,492,332,20); r(g,'#c7c7ac',14,510,332,6); r(g,'#c9a27a',14,516,332,298); planks(g,14,516,332,298);
    r(g,'#c9a27a',312,488,30,28); text(g,'二 楼 · 热 闹 层',150,506,8,'#655b40'); text(g,'↓ 二楼',327,484,6,'#655b40');
    r(g,'#6d725e',10,842,340,204); r(g,'#dedbc3',14,846,332,16); r(g,'#c7c7ac',14,860,332,6); r(g,'#c9a27a',14,866,332,166); planks(g,14,866,332,166);
    r(g,'#c9a27a',312,842,30,24); text(g,'三 楼 · 安 静 层',150,858,8,'#655b40'); text(g,'↓ 三楼',327,838,6,'#655b40');
    if (light!=='day') { g.fillStyle = light==='night' ? '#323d6220' : '#e79e4120'; g.fillRect(14,516,332,298); g.fillRect(14,866,332,166); }
  }
  // Compact meeting room beside the boss desk: screen, four chairs, a table, a lectern, a two-seat bench.
  function compactMeeting(g) {
    const {x,y,w,h}=C.meetingRect;
    r(g,'#9cbab128',x,y,w,h); r(g,'#6c897b',x,y,w,3); r(g,'#6c897b',x,y,3,h); r(g,'#6c897b',x+w-2,y,3,40); r(g,'#6c897b',x+w-2,y+88,3,h-88);
    r(g,'#9cbab160',x+w-2,y+40,3,48);
    r(g,'#547064',24,355,88,23); r(g,'#fff4d5',26,357,84,19);
    for (const p of Core.seats) { r(g,'#547064',p.x-8,p.y-12,16,14); r(g,'#8ca28a',p.x-7,p.y-12,14,4); r(g,'#547064',p.x-7,p.y+1,3,4); r(g,'#547064',p.x+4,p.y+1,3,4); }
    r(g,'#77563f',26,400,72,14); r(g,'#a97c52',26,400,72,11); r(g,'#dfb987',27,400,70,3); r(g,'#eee4c7',38,404,13,7); r(g,'#8d9a80',41,407,7,1); r(g,'#eee4c7',72,404,13,7);
    r(g,'#77563f',110,374,8,12); r(g,'#a97c52',109,372,10,3);
    r(g,'#71583f',26,446,46,10); r(g,'#a3ac8f',26,444,46,5); r(g,'#d2b285',26,452,46,4);
    text(g,'会议室',98,463,7,'#655b40');
  }
  // 菜地 (was the little garden), 220×70: three vegetable beds and a row of flowers; crops grow one stage a day.
  function farmRoom(g) {
    r(g,'#8fb07a',0,0,148,70); r(g,'#5f8a4d',0,0,148,1); r(g,'#5f8a4d',0,69,148,1); r(g,'#5f8a4d',0,0,1,70); r(g,'#5f8a4d',147,0,1,70);
    for (const y of [12,32,52]) { r(g,'#7a5638',8,y,98,10); r(g,'#94693f',8,y,98,2); }
    r(g,'#6b4430',112,6,30,18); r(g,'#8c3a2e',110,4,34,5); r(g,'#e9d7b0',120,12,8,12); text(g,'工具',127,30,6,'#45534b');
    for (let j=0;j<5;j++) { r(g,'#52745e',114+j*6,46,1,8); r(g,['#e58f9a','#efc66c','#b397b8','#f4f1e6'][j%4],113+j*6,43,4,4); }
    plaque(g,'菜地',112,57,32,'#5f8a4d');
  }
  // 儿童游乐室, 66×70: a slide, a block table and a soft rug, for the boss's and her friend's kids (animated in leisureUnder).
  function kidsRoom(g) {
    r(g,'#f6e7c8',0,0,66,70); r(g,'#e58fb0',0,0,66,1); r(g,'#e58fb0',0,69,66,1); r(g,'#e58fb0',0,0,1,70); r(g,'#e58fb0',65,0,1,70);
    for (let y=34;y<62;y+=6) for (let x=4;x<36;x+=6) r(g,(x+y)%12?'#9ccfe0':'#f2b46a',x,y,6,6);
    r(g,'#d96952',6,8,4,14); r(g,'#d96952',26,8,4,14); for (const yy of [10,14,18]) r(g,'#efc66c',6,yy,8,1);
    r(g,'#efc66c',10,8,4,2); r(g,'#7ad7ff',14,8,4,3); r(g,'#7ad7ff',18,11,4,3); r(g,'#7ad7ff',22,14,4,3); r(g,'#7ad7ff',26,17,4,3); r(g,'#7ad7ff',30,20,5,3);
    r(g,'#a97c52',40,44,20,8); r(g,'#d1ad83',40,44,20,2);
    plaque(g,'游乐室',6,60,30,'#c4588a');
  }
  // 泳池, 120×78: water, a ladder, a diving board, two deckchairs under an umbrella.
  function poolRoom(g) {
    const w=C.poolW||120, water=w-40;
    r(g,'#e8eef2',0,0,w,78); for (let y=2;y<78;y+=8) for (let x=2;x<w;x+=8) r(g,'#d5dee4',x,y,7,7);
    r(g,'#7aa7b8',6,14,water,58); r(g,'#9ccfe0',8,16,water-4,54); r(g,'#7aa7b8',8,16,water-4,2);
    r(g,'#c9a27a',34,6,10,12); r(g,'#e0b786',34,6,10,2); r(g,'#9aa3a0',water+2,22,2,14); r(g,'#9aa3a0',water+6,22,2,14); for (const yy of [25,30,35]) r(g,'#9aa3a0',water+2,yy,6,1);
    for (const yy of [22,48]) { r(g,'#4c4d4030',w-27,yy+11,22,2); r(g,'#77563f',w-28,yy,22,10); r(g,'#efc66c',w-27,yy+1,20,8); r(g,'#d96952',w-27,yy+3,20,1); }
    r(g,'#5a4636',w-6,8,1,16); r(g,'#d96952',w-14,4,18,5); r(g,'#efc66c',w-8,4,6,5);
    r(g,'#ffffff',Math.round(water*.75),58,8,8); r(g,'#d96952',Math.round(water*.75)+1,59,6,6); r(g,'#9ccfe0',Math.round(water*.75)+3,61,2,2);
    if (w>140) { r(g,'#ffffff',Math.round(water*.4),26,8,8); r(g,'#7ad7ff',Math.round(water*.4)+1,27,6,6); r(g,'#9ccfe0',Math.round(water*.4)+3,29,2,2); }
    plaque(g,'泳池',4,66,30,'#3a6a9a');
  }
  // Cat tree, 60×70: the office cat's home base (it roams the whole building).
  function catTree(g) {
    r(g,'#4c4d4030',20,62,32,3); r(g,'#a97c52',34,8,6,52); r(g,'#d1ad83',24,40,26,6); r(g,'#d1ad83',30,6,18,6); r(g,'#d1ad83',22,54,30,6);
    r(g,'#e9c9a0',36,46,2,8); r(g,'#e58f9a',26,30,6,6); r(g,'#8c6447',8,58,12,6); r(g,'#b5473a',9,60,10,3);
    text(g,'猫窝',30,74,6,'#655b40');
  }
  // 医务室, 66×100: a red cross, a medicine cabinet, the doctor's desk, an exam bed. Alice (医学出身) is the doctor.
  function clinicRoom(g) {
    r(g,'#f4f1e6',0,0,66,100); r(g,'#d9564d',0,0,66,1); r(g,'#d9564d',0,99,66,1); r(g,'#d9564d',0,0,1,100); r(g,'#d9564d',65,0,1,100);
    r(g,'#ffffff',44,3,12,9); r(g,'#d9564d',48,4,4,7); r(g,'#d9564d',46,6,8,3);
    r(g,'#9aa7a2',4,14,18,22); r(g,'#e8eef2',5,15,16,20); r(g,'#9aa7a2',5,24,16,1); for (const [xx,yy,c] of [[7,18,'#d96952'],[12,18,'#7ad7ff'],[16,19,'#efc66c'],[8,27,'#9cff8a'],[14,28,'#e58fb0']]) r(g,c,xx,yy,3,4);
    r(g,'#77563f',34,24,26,10); r(g,'#a97c52',34,24,26,3); r(g,'#3e4b47',40,26,6,1); r(g,'#3e4b47',45,27,1,3); r(g,'#eee4c7',50,26,7,5);
    r(g,'#9aa7a2',6,70,50,12); r(g,'#ffffff',8,70,46,8); r(g,'#cfe3dc',8,70,12,6); r(g,'#9aa7a2',6,82,3,4); r(g,'#9aa7a2',53,82,3,4);
    // 11-05: a washbasin for her morning wash (Core BOSS_DAY 'wash').
    r(g,'#9aa7a2',2,40,10,2); r(g,'#e8eef2',3,42,8,4); r(g,'#7ad7ff',4,43,6,2); r(g,'#9aa7a2',6,38,1,2);
    plaque(g,'医务室',14,88,38,'#b5473a');
  }
  // 充电房, 66×48: a charging pod (the battery over the sleeper is drawn with the person) and a wall charger.
  function chargeRoom(g) {
    r(g,'#dfe6e2',0,0,66,48); r(g,'#67b779',0,0,66,1); r(g,'#67b779',0,47,66,1); r(g,'#67b779',0,0,1,48); r(g,'#67b779',65,0,1,48);
    r(g,'#9aa7a2',4,12,38,8); r(g,'#cfe3dc',6,13,34,5); r(g,'#67b779',8,14,6,2); r(g,'#3e4b47',4,20,38,2);
    r(g,'#c9d4cf',4,22,38,14); r(g,'#e8eef2',5,23,36,11); r(g,'#9aa7a2',4,36,38,2);
    r(g,'#67b779',50,10,10,14); r(g,'#9cff8a',53,13,4,8); r(g,'#2f3a3c',54,24,2,10);
    plaque(g,'充电房',4,37,32,'#4a8a5a');
  }
  function annex(g) {
    if (C.bands) towerShell(g);
    else if (C.id!=='landscape') {
    // Downstairs: a narrow passage leaves the original room through a new south doorway.
    r(g,'#6d725e',308,400,38,94); r(g,'#c9a27a',312,398,30,98);
    for (let y=406;y<488;y+=12) r(g,'#b58c63',313,y,28,1);
    r(g,'#6d725e',10,420,340,310); r(g,'#dedbc3',14,424,332,62);
    r(g,'#c9a27a',14,486,332,240);
    for(let y=488;y<724;y+=18) { r(g,'#b58c63',14,y,332,1); for(let x=22+(y%36?24:0);x<344;x+=48) r(g,'#b58c63',x,y,1,Math.min(18,724-y)); }
    r(g,'#c9a27a',312,420,30,72); text(g,'↓ 附楼',327,449,6);
    }
    if (C.meetingRect) compactMeeting(g); else placed(g,C.meetingOffset,()=>{
    // Compact meeting room (meetings come a few times a week): four seats, podium, one standing row.
    r(g,'#6c897b',20,490,159,3); r(g,'#9cbab160',20,493,3,107);
    r(g,'#6c897b',176,490,3,86); r(g,'#9cbab140',164,493,12,83);
    r(g,'#6c897b',20,600,159,3); r(g,'#9cbab190',20,587,156,13);
    for(const x of [20,60,100,140]) r(g,'#6c897b',x,584,2,19);
    r(g,'#547064',28,496,140,25); r(g,'#fff4d5',30,498,136,21);
    for(const p of Core.classicSeats) { r(g,'#547064',p.x-8,p.y-12,16,14); r(g,'#8ca28a',p.x-7,p.y-12,14,4); r(g,'#547064',p.x-7,p.y+1,3,4); r(g,'#547064',p.x+4,p.y+1,3,4); }
    r(g,'#77563f',36,552,96,20); r(g,'#a97c52',36,552,96,16); r(g,'#dfb987',37,552,94,4);
    r(g,'#eee4c7',56,560,15,8); r(g,'#8d9a80',59,563,9,1); r(g,'#eee4c7',100,560,15,8);
    text(g,'会议室',152,572,7,'#655b40');
    r(g,'#71583f',40,616,52,17); r(g,'#a3ac8f',40,614,52,6); r(g,'#d2b285',40,626,52,5);
    r(g,'#71583f',42,633,3,3); r(g,'#71583f',87,633,3,3); text(g,'旁听席',66,648,7,'#655b40');
    });
    if(!mv) { placed(g,C.teaOffset,()=>teahouse(g)); placed(g,C.gymOffset,()=>gym(g)); }
    if(!mv && C.restOffset) placed(g,C.restOffset,()=>restRoom(g));
    if(!mv && C.kitchenOffset) placed(g,C.kitchenOffset,()=>kitchenRoom(g));
    if(!mv && C.poolOffset) placed(g,C.poolOffset,()=>poolRoom(g));
    if(!mv && C.catOffset) placed(g,C.catOffset,()=>catTree(g));
    if(!mv && C.clinicOffset) placed(g,C.clinicOffset,()=>clinicRoom(g));
    if(!mv && C.chargeOffset) placed(g,C.chargeOffset,()=>chargeRoom(g));
    if(!mv && C.kidsOffset) placed(g,C.kidsOffset,()=>kidsRoom(g));
    if(!mv && C.funOffsets) funFloor(g);
    if(!mv && C.lobby) {
      // Lobby by the entrance: a waiting sofa for guests, a low table, two plants.
      const {x,y,w}=C.lobby;
      r(g,'#4c4d4040',x+1,y+12,w,4); r(g,'#7a5a3e',x,y-4,w,8); r(g,'#a3826a',x,y+4,w,10); r(g,'#bf9b80',x+2,y+5,w-4,4); r(g,'#7a5a3e',x-3,y-2,4,16); r(g,'#7a5a3e',x+w-1,y-2,4,16);
      r(g,'#77563f',x+16,y+26,28,8); r(g,'#a97c52',x+16,y+26,28,3); r(g,'#efe2bd',x+22,y+27,8,2); r(g,'#e9c9a0',x+34,y+24,4,4);
      plant(g,x-14,y+6,true); plant(g,x+w+14,y+6,true); text(g,'大 堂',x+w/2,y-8,7,'#655b40');
    }
    if (!C.noBooth) placed(g,C.boothOffset,()=>{
    if (mv) {
    r(g,'#6d806a',268,494,67,5); r(g,'#6d806a',268,499,3,61); r(g,'#6d806a',332,499,3,61); r(g,'#b4cdc14a',271,499,61,61);
    r(g,'#47625d',310,512,12,26); r(g,'#e7dbb8',312,515,7,10); r(g,'#364944',313,529,5,6);
    text(g,'电话亭',300,579,7);
    } else {
    // One-person booth: a red phone box with a glass door.
    r(g,'#4c4d4040',269,540,34,3); r(g,'#a33a30',268,490,34,6); r(g,'#efc66c',276,491,18,3); r(g,'#a33a30',268,496,3,44); r(g,'#a33a30',299,496,3,44);
    r(g,'#b4cdc15a',271,496,28,44); r(g,'#e6f1ec',273,498,2,38); r(g,'#47625d',290,504,10,20); r(g,'#e7dbb8',291,506,6,8); r(g,'#364944',292,517,5,5);
    text(g,'电话亭',285,552,6);
    }
    });
    placed(g,C.storageOffset,()=>{
    if (mv) { text(g,'储物间',298,602,7); r(g,'#8f785c',262,610,72,68); r(g,'#b6a58a',265,613,66,62); r(g,'#796b54',265,673,66,3); return; }
    // Showcase: a glass cabinet of tiny keepsakes from the playground; tapping it opens the works and accounts.
    r(g,'#4c4d4040',264,676,72,4); r(g,'#77563f',262,606,72,72); r(g,'#a97c52',264,608,68,68); r(g,'#cfe3dc',267,611,62,62); r(g,'#e6f1ec',268,612,8,60);
    for (const y of [631,651]) { r(g,'#a97c52',267,y,62,3); r(g,'#d1a272',267,y,62,1); }
    r(g,'#a97c52',267,671,62,2);
    // top shelf: roach in sunglasses, a gear, a tiny cabin
    r(g,'#7a3f22',274,624,10,6); r(g,'#9c5530',275,623,8,3); r(g,'#2f3a3c',273,622,6,2); r(g,'#5a3b2a',272,629,2,2); r(g,'#5a3b2a',284,629,2,2);
    r(g,'#9aa3a0',293,620,10,10); r(g,'#cfe3dc',296,623,4,4); r(g,'#9aa3a0',297,618,2,14); r(g,'#9aa3a0',291,624,14,2);
    r(g,'#8c5a3a',312,624,12,7); r(g,'#ba5045',311,620,14,4); r(g,'#efc66c',316,626,3,3); r(g,'#f4ebd8',318,616,4,4);
    // middle shelf: a scroll, a Xiguan door, a sandworm curl
    r(g,'#e9d7b0',272,642,14,8); r(g,'#8c3a2e',271,641,2,10); r(g,'#8c3a2e',285,641,2,10); r(g,'#7a9c84',275,645,7,2);
    r(g,'#5a3b2a',294,638,12,12); r(g,'#8c3a2e',296,640,8,10); r(g,'#efc66c',299,644,2,2);
    r(g,'#b98a52',312,645,14,5); r(g,'#d7b47a',314,642,6,4); r(g,'#7a5a3e',324,643,3,3);
    // bottom shelf: a trophy and a little pixel office
    r(g,'#efc66c',275,660,8,6); r(g,'#d6a845',277,666,4,3); r(g,'#8c6447',275,669,8,2); r(g,'#efc66c',273,661,2,3); r(g,'#efc66c',283,661,2,3);
    r(g,'#6d725e',295,658,30,13); r(g,'#d1ad83',297,660,26,9); r(g,'#35474a',300,661,5,4); r(g,'#35474a',309,661,5,4); r(g,'#35474a',318,661,3,4);
    plaque(g,'陈列室',278,598,40,'#a87a2c'); // drawn last: the cabinet top used to cover its lower half
    });
    placed(g,C.totalsOffset,()=>{const T=C.totals||{x:24,y:426,w:276,h:52};
      if(C.totals){r(g,'#4c4d4040',T.x+2,T.y+T.h,T.w,3);r(g,'#5a3b2a',T.x+10,T.y+T.h-2,3,4);r(g,'#5a3b2a',T.x+T.w-13,T.y+T.h-2,3,4);}
      r(g,'#77563f',T.x,T.y,T.w,T.h); r(g,'#a17c52',T.x+3,T.y+3,T.w-6,T.h-6);});
  }
  // 茶楼 · 早市, 78×100 local: sign, one round table with four stools, a dim sum cart. Opens on the datai-teahouse game.
  function teahouse(g) {
    r(g,'#e9d7b0',0,4,78,96); r(g,'#d8c194',0,4,78,1);
    r(g,'#8c3a2e',12,0,54,13); r(g,'#b5473a',13,1,52,11); text(g,'茶  楼',39,10,8,'#f6d68a');
    for(const x of [4,72]) { r(g,'#5a3b2a',x+1,0,1,4); r(g,'#d9564d',x-2,4,7,9); r(g,'#efc66c',x-2,7,7,1); r(g,'#efc66c',x,13,3,2); }
    for(const [x,y] of [[16,68],[62,68],[29,46],[49,46]]) { r(g,'#7a5a3e',x-6,y-3,12,4); r(g,'#a97c52',x-6,y-4,12,2); r(g,'#7a5a3e',x-5,y+1,2,3); r(g,'#7a5a3e',x+3,y+1,2,3); }
    r(g,'#4c4d4040',27,63,26,4); r(g,'#77563f',26,54,26,10); r(g,'#c99a64',24,50,30,8); r(g,'#e0b786',26,50,26,2);
    r(g,'#b98a52',30,48,9,4); r(g,'#d7b47a',30,47,9,1); r(g,'#b98a52',40,46,9,6); r(g,'#d7b47a',40,45,9,1); r(g,'#9c7444',40,49,9,1);
    r(g,'#f4ebd8',44,52,6,2); r(g,'#3f6f68',33,52,5,4); r(g,'#3f6f68',38,53,2,1);
    r(g,'#8f6a48',6,84,18,10); r(g,'#b98a52',7,79,16,5); r(g,'#d7b47a',7,78,16,1); r(g,'#b98a52',9,74,12,4); r(g,'#d7b47a',9,73,12,1);
    r(g,'#3e4b47',8,94,3,3); r(g,'#3e4b47',20,94,3,3);
  }
  // 娱乐层 downstairs: a new storey under the building with four 110×80 rooms (K 房, 阅读室, 小花园, 黑匣子剧场).
  function planks(g, x, y, w, h) { for (let yy = y; yy < y + h; yy += 18) { r(g, '#b58c63', x, yy, w, 1); for (let xx = x + 8 + (yy % 36 ? 24 : 0); xx < x + w; xx += 48) r(g, '#b58c63', xx, yy, 1, Math.min(18, y + h - yy)); } }
  function funFloor(g) {
    if (C.bands) {
      // Shell drawn by towerShell; the old garden is a vegetable plot now.
    } else if (C.id === 'landscape') {
      r(g,'#6d725e',10,408,620,150); r(g,'#dedbc3',14,412,612,28); r(g,'#c7c7ac',14,434,612,6); r(g,'#c9a27a',14,440,612,112); planks(g,14,440,612,112);
      r(g,'#c9a27a',416,394,20,48); for (let y=400;y<440;y+=8) r(g,'#b58c63',417,y,18,1); text(g,'↓ 娱乐层',426,392,6,'#655b40');
      text(g,'娱 乐 层',596,430,8,'#655b40');
    } else {
      r(g,'#6d725e',308,722,38,92); r(g,'#c9a27a',312,720,30,94); for (let y=728;y<808;y+=12) r(g,'#b58c63',313,y,28,1);
      r(g,'#6d725e',10,744,340,292); r(g,'#dedbc3',14,748,332,58); r(g,'#c7c7ac',14,800,332,6); r(g,'#c9a27a',14,806,332,224); planks(g,14,806,332,224);
      r(g,'#c9a27a',312,744,30,64); text(g,'↓ 娱乐层',327,736,6,'#655b40');
      text(g,'娱 乐 层',150,784,10,'#655b40'); text(g,'唱歌 · 看书 · 浇花撸猫 · 看片',150,798,6,'#7e856e');
    }
    const o = C.funOffsets;
    placed(g,o.ktv,()=>ktvRoom(g)); placed(g,o.read,()=>readingRoom(g)); placed(g,o.garden,()=>C.bands?farmRoom(g):gardenRoom(g)); placed(g,o.cinema,()=>cinemaRoom(g)); if (o.snack) placed(g,o.snack,()=>snackBar(g)); if (o.bbq) placed(g,o.bbq,()=>bbqRoom(g));
  }
  function frame(g, color) { r(g, color, 0, 0, 110, 1); r(g, color, 0, 79, 110, 1); r(g, color, 0, 0, 1, 80); r(g, color, 109, 0, 1, 80); }
  function ktvRoom(g) {
    r(g,'#2e2540',0,0,110,80); frame(g,'#e58fb0');
    r(g,'#1b1b28',34,4,46,18); r(g,'#3a4a7a',36,6,42,14);
    r(g,'#4a3d66',14,46,24,8); r(g,'#2f3a3c',26,30,1,20); r(g,'#2f3a3c',23,50,7,2);
    for (const x of [2,100]) { r(g,'#1b1b28',x,30,8,16); r(g,'#4a4a5a',x+2,33,4,4); r(g,'#4a4a5a',x+2,39,4,4); }
    r(g,'#5a2a46',46,58,60,8); r(g,'#a34e78',46,64,60,7); r(g,'#7a3a5a',44,58,4,14); r(g,'#7a3a5a',104,58,4,14);
    plaque(g,'K 房',4,67,26,'#b5477a');
  }
  function readingRoom(g) {
    r(g,'#dcc8a4',0,0,110,80); frame(g,'#a07850'); r(g,'#8c5a3e',14,46,82,28); r(g,'#a8714f',16,48,78,24);
    r(g,'#6b4430',4,2,102,24);
    for (let row = 0; row < 2; row++) { r(g,'#4a2f22',4,13+row*11,102,2); for (let j = 0; j < 16; j++) r(g,['#7c9c84','#d2b37e','#ad7058','#6f88b8','#e1d2a6','#b07a9a'][(j+row*3)%6],6+j*6,4+row*11,5,9-(j%3)); }
    for (const x of [30,80]) { r(g,'#5a4a6a',x-10,50,20,10); r(g,'#7a6a8a',x-9,51,18,7); r(g,'#5a4a6a',x-11,56,4,12); r(g,'#5a4a6a',x+7,56,4,12); r(g,'#8a7a9a',x-7,60,14,6); }
    r(g,'#8c6a3a',55,32,1,30); r(g,'#3e4b47',52,61,7,2); r(g,'#f3dc9a',51,28,9,5);
    plaque(g,'阅读室',72,30,34,'#7a5a3a');
  }
  function gardenRoom(g) {
    r(g,'#8fb07a',0,0,110,80); frame(g,'#5f8a4d'); for (let j = 0; j < 14; j++) r(g,'#a3c48c',(j*29)%104+3,(j*17)%74+3,3,2);
    r(g,'#8c6447',4,8,50,10); r(g,'#a97c52',4,8,50,3);
    for (let j = 0; j < 7; j++) { r(g,'#52745e',8+j*7,2,1,7); r(g,['#e58f9a','#efc66c','#b397b8','#f4f1e6'][j%4],7+j*7,0,4,4); }
    r(g,'#6b4430',89,12,4,12); r(g,'#5f8a4d',82,0,18,14); r(g,'#7aa36a',85,2,10,6);
    r(g,'#c9a27a',60,70,40,8); r(g,'#d1ad83',60,70,40,2);
    plaque(g,'小花园',4,66,34,'#5f8a4d');
  }
  // 小卖部, 68×80 local: a drinks machine and a snack machine, a little bar with two stools.
  function snackBar(g) {
    r(g,'#e9dcc0',0,0,68,80); r(g,'#c9963a',0,0,68,1); r(g,'#c9963a',0,79,68,1); r(g,'#c9963a',0,0,1,80); r(g,'#c9963a',67,0,1,80);
    r(g,'#4c4d4040',5,37,48,4);
    r(g,'#b5473a',4,2,22,36); r(g,'#d96952',5,3,20,3); r(g,'#2f3a3c',7,8,16,18); for (let j=0;j<4;j++) for (let k=0;k<3;k++) r(g,['#e8963a','#7ad7ff','#9cff8a','#e58fb0'][(j+k)%4],8+j*4,10+k*5,3,4);
    r(g,'#efc66c',20,28,4,2); r(g,'#1b1b28',8,30,12,5);
    r(g,'#3a6a9a',30,2,22,36); r(g,'#5a8aba',31,3,20,3); r(g,'#cfe3dc',33,8,16,20); for (let j=0;j<3;j++) for (let k=0;k<3;k++) r(g,['#efc66c','#d96952','#8a5a3e'][(j+k)%3],34+j*5,10+k*6,4,4);
    r(g,'#1b1b28',34,30,12,5);
    r(g,'#77563f',30,60,34,5); r(g,'#a97c52',30,60,34,2); r(g,'#5a4636',46,65,2,10);
    for (const x of [40,56]) { r(g,'#3e4b47',x-3,70,7,3); r(g,'#3e4b47',x-1,73,2,5); }
    plaque(g,'小卖部',2,66,34,'#a87a2c');
  }
  // Compact kitchen: solid appliances above, a two-seat table below; the open floor remains walkable.
  function kitchenRoom(g) {
    r(g,'#e9dcc0',0,0,76,80); zone(g,0,0,76,80,'#7d927b');
    for(let y=2;y<80;y+=10) for(let x=2;x<76;x+=10) r(g,'#fff6dc40',x,y,8,8);
    plaque(g,'自助厨房',6,-12,56,'#667f68');
    r(g,'#35474a',6,10,22,16); r(g,'#9aa7a2',7,11,20,3); r(g,'#192e30',9,15,15,3);
    r(g,'#35474a',10,7,12,7); r(g,'#667879',9,7,14,2); r(g,'#35474a',5,9,5,2); r(g,'#35474a',22,9,5,2); r(g,'#b7c2b0',12,6,8,1);
    r(g,'#8c6447',36,12,18,14); r(g,'#d1ad83',35,10,20,5); r(g,'#7d927b',39,11,10,2); r(g,'#e8963a',43,11,3,2); r(g,'#d9e2dc',49,8,2,5);
    r(g,'#8fa7a4',58,6,14,25); r(g,'#e8eef2',59,7,12,23); r(g,'#8fa7a4',59,15,12,1); r(g,'#667879',60,11,1,3); r(g,'#667879',60,18,1,5); r(g,'#efc66c',66,9,3,3);
    r(g,'#8c6447',28,53,20,14); r(g,'#d1ad83',27,51,22,11); r(g,'#fff6dc',30,53,6,3); r(g,'#7d927b',31,53,4,1); r(g,'#fff6dc',40,56,6,3); r(g,'#e8963a',41,56,3,1);
    for(const x of [16,60]) {r(g,'#8c6447',x-6,65,12,4);r(g,'#8c6447',x-5,69,2,5);r(g,'#8c6447',x+3,69,2,5);}
  }
  function bbqRoom(g) {
    r(g,'#6d7869',0,0,72,68); zone(g,0,0,72,68,'#efc66c','18');
    for(let y=12;y<68;y+=12) r(g,'#35474a40',1,y,70,1);
    r(g,'#35474a',3,3,66,1); for(let x=5;x<70;x+=12){r(g,'#35474a',x,3,1,3);r(g,'#fff6dc',x-1,6,3,3);}
    r(g,'#35474a',8,14,26,13); r(g,'#192e30',10,15,22,7); r(g,'#9aa7a2',9,16,24,1); r(g,'#9aa7a2',9,20,24,1);
    for(const x of [13,21,29]) {r(g,'#d1ad83',x,12,1,12);r(g,'#d96952',x-1,14,3,3);r(g,'#e8963a',x-1,19,3,3);}
    r(g,'#35474a',10,27,3,5); r(g,'#35474a',29,27,3,5);
    for(const x of [20,54]) {r(g,'#d1ad83',x-6,57,12,3);r(g,'#35474a',x-5,60,2,5);r(g,'#35474a',x+3,60,2,5);}
    // Hotpot shares the terrace (Alice: 「烧烤或者火锅吧，把它放到一块儿」): a red-broth pot on a low table between the stools.
    r(g,'#77563f',27,47,22,8); r(g,'#a97c52',27,47,22,3); r(g,'#35474a',30,42,16,7); r(g,'#b5473a',31,42,14,3); r(g,'#efc66c',34,42,2,1); r(g,'#efc66c',40,43,2,1);
    plaque(g,'烧烤火锅',36,19,34,'#8c4f37');
  }
  // 黑匣子剧场 (11-03, was 放映角; Alice: 「我爱看舞台演出……那里也可以放电影」): a black room, a low stage with red side
  // curtains and a lighting bar; shows and films take turns (drawn in leisureUnder). Seats and walls unchanged for routing.
  function cinemaRoom(g) {
    r(g,'#16161c',0,0,110,80); frame(g,'#4a4a58');
    r(g,'#22222b',8,2,94,24); r(g,'#7a5a3e',8,24,94,8); r(g,'#a97c52',8,24,94,2); r(g,'#5a3b2a',8,31,94,2);
    r(g,'#7a1f2a',8,2,11,24); r(g,'#9c2a36',11,2,2,24); r(g,'#9c2a36',15,2,2,24); r(g,'#7a1f2a',91,2,11,24); r(g,'#9c2a36',94,2,2,24); r(g,'#9c2a36',98,2,2,24);
    r(g,'#3e3e48',8,2,94,2); for (const x of [26,53,80]) { r(g,'#6d6d78',x,1,5,3); r(g,'#efc66c',x+1,4,3,1); }
    for (const x of [32,56,80]) { r(g,'#7a2a2a',x-8,58,16,12); r(g,'#a33a30',x-7,59,14,5); r(g,'#7a2a2a',x-8,70,3,4); r(g,'#7a2a2a',x+5,70,3,4); }
    r(g,'#3e4b47',96,72,10,6); r(g,'#9cff8a',97,74,3,2);
    plaque(g,'黑匣子剧场',4,40,50,'#3a3a4a');
  }
  // 休息室, 104×66 local: three bunk beds (berths at y 32 / 56), dim blue floor, a night light.
  function restRoom(g) {
    r(g,'#4a5a7a30',0,0,104,66); r(g,'#4a5a7ab0',0,0,104,1); r(g,'#4a5a7ab0',0,65,104,1); r(g,'#4a5a7ab0',0,0,1,66); r(g,'#4a5a7ab0',103,0,1,66);
    plaque(g,'休息室',34,-12,36,'#4a5a7a');
    for (const bx of [4,38,72]) {
      r(g,'#4c4d4040',bx+1,62,28,3);
      r(g,'#6b4430',bx,8,3,56); r(g,'#6b4430',bx+25,8,3,56);
      for (const y of [22,46]) { r(g,'#6b4430',bx,y+8,28,4); r(g,'#e8e3d4',bx+3,y,22,9); r(g,'#f4f1e6',bx+3,y,7,4); r(g,'#9fb0c8',bx+10,y+2,15,7); }
      r(g,'#6b4430',bx+25,12,3,1); for (let k=0;k<4;k++) r(g,'#8a5a3e',bx+25,14+k*4,3,1);
    }
    r(g,'#f9d98c',98,4,3,3);
  }
  // 健身房, 96×80 local: treadmill, dumbbell rack, punching bag, yoga mat.
  function gym(g) {
    r(g,'#b7c2b0',0,2,96,78); r(g,'#cbd3c2',2,4,92,74);
    r(g,'#3e4b47',6,6,16,10); r(g,'#90b8a3',9,8,8,4); r(g,'#2f3a3c',7,16,14,34); r(g,'#4a5652',9,18,10,30); r(g,'#3e4b47',5,16,2,20); r(g,'#3e4b47',21,16,2,20);
    r(g,'#77563f',30,6,24,10); r(g,'#a97c52',30,6,24,3);
    for(const x of [33,41,49]) { r(g,'#3e4b47',x,9,2,5); r(g,'#3e4b47',x+2,11,2,1); r(g,'#3e4b47',x+3,9,2,5); }
    r(g,'#5d6b60',62,2,20,2); r(g,'#3e4b47',71,4,1,12); r(g,'#ba5045',67,16,10,14); r(g,'#d96952',68,17,3,12); r(g,'#8c3a2e',67,28,10,2);
    r(g,'#7aa7a0',26,62,34,9); r(g,'#93bbb3',27,63,32,7);
    text(g,'健身房',82,74,7,'#45534b');
  }
  function folder(x,y) {
    r(ctx,'#8c6337',x-6,y-5,13,9); r(ctx,'#efc66c',x-5,y-4,11,7); r(ctx,'#efc66c',x-5,y-7,5,3); r(ctx,'#fff0bc',x-3,y-1,6,1);
  }
  const count = n => n >= 1e8 ? `${Math.floor(n/1e8)}亿` : n >= 1e4 ? `${Math.floor(n/1e4)}万` : String(n);
  const boardLines = (compact = true) => {
    const num = n => n == null ? '—' : compact ? count(n) : String(n);
    if (!stats) return [`来过客人 ${visitorsTotal ?? '—'} · 收到礼物 —`, '开过会 — · 递过活 —', '今天：暂无累计信号'];
    const t=stats.today;
    const lines = [`来过客人 ${num(stats.visitorsTotal)} · 收到礼物 ${num(stats.treatsTotal)}` + (!mv ? ` · 接待 ${num(stats.meetsTotal)} 拨` : ''), `开过会 ${num(stats.meetingsTotal)} · 递过活 ${num(stats.handoffsTotal)}` + (Number.isInteger(stats.notesTotal) && stats.notesTotal >= 0 ? ` · 纸条 ${num(stats.notesTotal)}` : ''), `今天：客人 ${num(t.visitors)} · 礼物 ${num(t.treats)} · 会 ${num(t.meetings)} · 递活 ${num(t.handoffs)}` + (!mv ? ` · 接待 ${num(t.meets)} 拨` : '')];
    if(!mv)lines.push(`安检门拦下 ${num(stats.gatesBlockedTotal)} 次`);return lines;
  };
  function leisureUnder() {
    if (mv || !C.teaOffset) return;
    const busy = kind => sim.actors.some(a => sim.gameActivity(a) === kind), t = sim.time;
    placed(ctx,C.teaOffset,()=>{
      // Steam over the baskets while anyone eats; the open lamp lights 08:00–10:00 Beijing time.
      const sitting = Core.teaTime(now());
      const feast = sim.feast && sim.time < sim.feast.until ? (sim.feast.night ? '夜宵开席' : '早茶开席') : null;
      r(ctx,feast||sitting?'#efc66c':'#c9a35b',34,89,3,3); text(ctx,feast || (sitting?sitting+'时间':'全天营业'),58,94,6,feast||sitting?'#8c3a2e':'#8c6a44');
      if (busy('tea')) for (let j=0;j<3;j++) { const k=(t*1.3+j/3)%1; r(ctx,'#ffffff90',32+j*6+Math.round(Math.sin(t*3+j)),44-Math.round(k*12),2,2); }
    });
    if(C.kitchenOffset) placed(ctx,C.kitchenOffset,()=>{
      if(busy('cook') || sim.actors.some(a=>sim.chefActivity(a)==='cook')) {
        const f=Math.floor(t*4)%2;
        for(const x of [10,16,22]) {r(ctx,'#d96952',x,21,3,4);r(ctx,'#efc66c',x+1,20-f,1,4);}
        for(let j=0;j<2;j++) r(ctx,'#ffffff90',13+j*6+Math.round(Math.sin(t*2+j)),5-Math.floor((t+j)%2*3),2,2);
      }
    });
    placed(ctx,C.gymOffset,()=>{
      if (busy('run')) for (let y=18+Math.floor(t*20)%6; y<48; y+=6) r(ctx,'#6d7a74',10,y,8,1);
      if (busy('box')) { const sway=Math.round(Math.sin(t*6)*1.5); r(ctx,'#cbd3c2',66,15,12,16); r(ctx,'#3e4b47',71,4,1,12); r(ctx,'#ba5045',67+sway,16,10,14); r(ctx,'#d96952',68+sway,17,3,12); r(ctx,'#8c3a2e',67+sway,28,10,2); }
    });
    if (C.funOffsets) {
      const o = C.funOffsets, t = sim.time, at = kind => sim.actors.find(a => sim.gameActivity(a) === kind);
      if(o.bbq) placed(ctx,o.bbq,()=>{
        const f=Math.floor(t*3)%2;
        for(const x of [11,17,23,29]) r(ctx,f?'#e8963a':'#d96952',x,24,3,2);
        for(let j=0;j<3;j++) {const k=(t*.7+j/3)%1;r(ctx,'#e8eef280',16+j*5+Math.round(Math.sin(t+j)*2),12-Math.floor(k*11),2,2);}
        for(let x=5;x<70;x+=12) r(ctx,(x+f)%3?'#fff6dc':'#efc66c',x-1,6,3,3);
        r(ctx,f?'#d9564d':'#b5473a',31,42,14,3); for(let j=0;j<2;j++){const k=(t*.9+j/2)%1;r(ctx,'#ffffffa0',34+j*6,40-Math.floor(k*9),2,2);}
      });
      placed(ctx,o.ktv,()=>{
        // Lyrics scroll while someone sings; the disco ball always turns.
        const singing = !!at('sing');
        for (let j = 0; j < 3; j++) r(ctx, singing ? ['#ffe066','#ffffff','#e58fb0'][j] : '#5a6a9a', 39, 8 + j * 4, singing ? 10 + ((Math.floor(t * 3) + j * 7) % 26) : 20, 2);
        r(ctx,'#9aa3a0',19,0,1,5); r(ctx,'#d9e2dc',16,5,7,7); r(ctx,'#ffffff',17 + Math.floor(t * 4) % 4,6,2,2);
        if (singing) for (let j = 0; j < 4; j++) { const k = (t * 2 + j) % 4; r(ctx, ['#ff7ab0','#7ad7ff','#ffe066','#9cff8a'][j], 8 + ((j * 29 + Math.floor(t * 5) * 13) % 96), 24 + ((j * 17 + Math.floor(t * 3) * 7) % 30), 2, 2); }
      });
      placed(ctx,o.cinema,()=>{
        // Shows and films take turns every 40 s. Show: a follow spot on a performer in costume flicking water sleeves.
        // Film: the screen comes down and plays 阿橘骑游 (an orange cat on a bike past a skyline), with a projector beam.
        if (Math.floor(t / 40) % 2 === 0) {
          ctx.fillStyle = '#fff6c02a'; ctx.beginPath(); ctx.moveTo(52,3); ctx.lineTo(58,3); ctx.lineTo(68,30); ctx.lineTo(42,30); ctx.closePath(); ctx.fill();
          const px = 55 + Math.round(Math.sin(t * .5) * 8), sw = Math.sin(t * 3);
          r(ctx,'#00000040',px-6,27,12,2); r(ctx,'#b5473a',px-4,14,8,13); r(ctx,'#efc66c',px-4,18,8,2); r(ctx,'#e4bb91',px-2,8,5,6); r(ctx,'#1b1b22',px-3,6,7,3); r(ctx,'#efc66c',px-1,4,3,2);
          r(ctx,'#f4f1e6',px+4,14+Math.round(sw*3),3+Math.round(Math.abs(sw)*5),3); r(ctx,'#f4f1e6',px-7-Math.round(Math.abs(sw)*4),15-Math.round(sw*2),3+Math.round(Math.abs(sw)*4),3);
          text(ctx,'演出中',84,46,5,'#efc66c');
        } else {
          const k = (t * 14) % 110;
          r(ctx,'#5a6470',12,3,86,23); r(ctx,'#bcd2dc',14,4,82,15); r(ctx,'#8fa7b4',18,12,9,7); r(ctx,'#8fa7b4',32,9,7,10); r(ctx,'#8fa7b4',60,11,11,8); r(ctx,'#8fa7b4',80,8,8,11); r(ctx,'#c9a27a',14,19,82,6);
          const cx = 14 + Math.round(k) % 74; r(ctx,'#e8963a',cx,15,8,4); r(ctx,'#e8963a',cx+5,13,3,3); r(ctx,'#2f3a3c',cx,19,3,3); r(ctx,'#2f3a3c',cx+6,19,3,3);
          if (at('movie')) { ctx.fillStyle = '#fff6c020'; ctx.beginPath(); ctx.moveTo(100,74); ctx.lineTo(14,26); ctx.lineTo(96,26); ctx.closePath(); ctx.fill(); }
          text(ctx,'放映中',84,46,5,'#bcd2dc');
        }
      });
      if (o.snack) placed(ctx,o.snack,()=>{
        // A can drops into the drinks machine's tray now and then while someone is buying.
        if (at('buy')) { const k = (t * 1.6) % 3; if (k < 1) r(ctx,'#d96952',12,30 + Math.round(k * 4),3,4); else r(ctx,'#d96952',12,33,3,2); }
      });
      if (C.bands) placed(ctx,o.garden,()=>{
        // Crops grow one stage a Beijing day: seeds, seedlings, ripe (cabbage, tomatoes, carrots); the waterer's can drips.
        const stage=Math.floor((now()+8*3600000)/86400000)%3, waterer=at('water'), picker=at('pick');
        [14,34,54].forEach((y,row)=>{ for(let x=14;x<104;x+=12){
          if(stage===0){r(ctx,'#5a3b2a',x,y+4,2,2);}
          else if(stage===1){r(ctx,'#7aa36a',x,y+2,2,5);r(ctx,'#9cc48a',x-1,y+1,4,2);}
          else if(row===0){r(ctx,'#7aa36a',x-2,y,7,7);r(ctx,'#b9d6a0',x,y+2,3,3);}
          else if(row===1){r(ctx,'#52745e',x,y-1,1,8);r(ctx,'#d96952',x-2,y+2,3,3);r(ctx,'#d96952',x+1,y+5,3,3);}
          else {r(ctx,'#7aa36a',x,y-1,1,3);r(ctx,'#7aa36a',x+2,y-1,1,3);r(ctx,'#e8963a',x,y+2,3,5);}
        }});
        text(ctx,['刚播种','发芽了','可以摘啦'][stage],56,9,6,stage===2?'#b5473a':'#45534b');
        if (waterer) for (let j = 0; j < 3; j++) r(ctx,'#7ad7ff',52 + j * 3,22 + ((t * 20 + j * 5) % 10),1,2);
        if (picker && stage===2) text(ctx,'丰收',90,40-(t%2|0),6,'#b5473a');
      });
      if (!C.bands) placed(ctx,o.garden,()=>{
        // The office cat: purrs beside whoever pets it, otherwise strolls round the lawn.
        const petter = at('cat'), waterer = at('water'), fed = sim.playing?.('cat');
        if (fed) { r(ctx,'#b5473a',44,62,10,4); r(ctx,'#e9c9a0',45,61,8,2); for (let j=0;j<3;j++) text(ctx,'♥',54+j*6,46-((t*6+j*4)%10),6,'#e58f9a'); }
        const p = fed ? {x: 52, y: 62} : petter ? {x: 66, y: 62} : {x: 40 + Math.round((Math.sin(t * .3) + 1) * 26), y: 40 + Math.round((Math.cos(t * .23) + 1) * 12)};
        r(ctx,'#4c4d4030',p.x-1,p.y,12,2); r(ctx,'#e8963a',p.x,p.y-6,10,6); r(ctx,'#e8963a',p.x+8,p.y-9,5,5); r(ctx,'#e8963a',p.x+8,p.y-11,1,2); r(ctx,'#e8963a',p.x+12,p.y-11,1,2);
        r(ctx,'#c8732a',p.x+2,p.y-6,1,6); r(ctx,'#c8732a',p.x+5,p.y-6,1,6); r(ctx,'#2f3a3c',p.x+10,p.y-8,1,1); r(ctx,'#e8963a',p.x-3,p.y-8 + (Math.floor(t * 2) % 2),3,2);
        if (petter) text(ctx,'♥',p.x+6,p.y-14 - (t % 2) * 2,6,'#e58f9a');
        if (waterer) for (let j = 0; j < 3; j++) r(ctx,'#7ad7ff',22 + j * 3,30 + ((t * 20 + j * 5) % 10),1,2);
      });
    }
    if (C.kidsOffset) placed(ctx,C.kidsOffset,()=>{
      // The boss's two kids, 无忧 and 无虑 (Alice 11-03), 08:00–21:00 Beijing: 无忧 slides on a loop, 无虑 stacks blocks till they topple.
      const h=new Date(now()+8*3600000).getUTCHours(); if (h<8 || h>=21) return;
      if (kidsOut()) { for (let j=0;j<3;j++) r(ctx,['#d96952','#efc66c','#7ad7ff'][j],47,54-j*4,6,4); return; } // out and about: the blocks wait in a little pile
      const t=sim.time, k=(t/4)%1, tag=(x,y,name,c)=>{ ctx.font='5px "PingFang SC",system-ui,sans-serif'; const w=Math.ceil(ctx.measureText(name).width)+6; r(ctx,'#fff6dc',x-w/2,y,w,7); r(ctx,c,x-w/2,y,2,7); text(ctx,name,x+1,y+6,5,'#253334'); }, kid=(x,y,shirt,girl)=>{ r(ctx,'#4c4d4030',x-4,y,8,2); r(ctx,shirt,x-3,y-7,6,6); r(ctx,'#e4bb91',x-3,y-12,6,5); r(ctx,'#4b4639',x-3,y-13,6,2); if(girl){ r(ctx,'#4b4639',x-5,y-12,2,4); r(ctx,'#4b4639',x+3,y-12,2,4); r(ctx,'#e58fb0',x-5,y-13,2,1); r(ctx,'#e58fb0',x+3,y-13,2,1); } r(ctx,'#2f3a3c',x-2,y-1,2,2); r(ctx,'#2f3a3c',x+1,y-1,2,2); };
      const sx = k<.35 ? 8 : k<.75 ? 10+(k-.35)/.4*24 : 34+(k-.75)/.25*6, sy = k<.35 ? 24-(k/.35)*14 : k<.75 ? 10+(k-.35)/.4*12 : 22;
      // 无忧 is the boy (orange), 无虑 the girl (purple, two little pigtails) — Alice 11-03.
      kid(Math.round(sx),Math.round(sy)+6,'#e8963a'); tag(Math.round(sx),Math.round(sy)-15,'无忧','#e8963a'); if (k>.4 && k<.75) text(ctx,'呜～',Math.round(sx)+14,Math.round(sy)-2,5,'#b5473a');
      const n=Math.floor((t%14)/1.6); for (let j=0;j<Math.min(n,7);j++) r(ctx,['#d96952','#efc66c','#7ad7ff','#9cff8a'][j%4],47+(j%2),42-j*4,6,4);
      if (n>=8) { for (let j=0;j<5;j++) r(ctx,['#d96952','#efc66c','#7ad7ff','#9cff8a'][j%4],40+j*5,54,5,4); text(ctx,'哗啦',50,36,5,'#b5473a'); }
      kid(54,62,'#9a6fc4',true); tag(54,64,'无虑','#9a6fc4');
    });
    if (hotspots() && C.teaOffset) placed(ctx,C.teaOffset,()=>{ r(ctx,'#fff6dc',20,15,38,8); text(ctx,'▶ 点我饮茶',39,21,5,'#8a4a3e'); });
    if (hotspots()) placed(ctx,C.storageOffset,()=>{ r(ctx,'#fff6dc',280,682,36,9); text(ctx,'▶ 点开看',298,689,6,'#8a4a3e'); });
    if (!mv) {
      // Marquee bulbs chase round the sign; the call to play is the big line.
      const step = Math.floor(sim.time * 6);
      for (let k = 0; k < 16; k++) { const top = k < 8, x = 72 + (k % 8) * 8 + 2, y = top ? 263 : 283; r(ctx, (k + step) % 3 ? '#7a3a2a' : '#ffe9a0', x, y, 2, 2); }
      if (hotspots()) text(ctx, '▶ 点我玩', 102, 281, 8, Math.floor(sim.time * 2) % 2 ? '#ffffff' : '#ffe9a0');
      else text(ctx, 'GAME', 102, 281, 7, '#ffe9a0');
      const busy = kind => sim.actors.find(a => sim.gameActivity(a) === kind);
      // The claw slides while someone plays, drops, lifts.
      const clawPlayer = busy('claw'), cx = clawPlayer ? 190 + Math.round((Math.sin(sim.time * 1.3) + 1) * 6) : 195, drop = clawPlayer && (sim.time % 4) > 3 ? 5 : 0;
      r(ctx, '#3e4b47', 188, 305, 16, 1); r(ctx, '#3e4b47', cx + 1, 306, 1, 2 + drop); r(ctx, '#9aa3a0', cx - 1, 308 + drop, 5, 1); r(ctx, '#9aa3a0', cx - 1, 309 + drop, 1, 2); r(ctx, '#9aa3a0', cx + 3, 309 + drop, 1, 2);
      // Arrows scroll up the screen; the tile under the beat lights.
      const dancer = busy('dance'), beat = Math.floor(sim.time * 3);
      for (let j = 0; j < 4; j++) { const ay = 302 + ((j * 3 + (dancer ? beat : 0)) % 9); r(ctx, ['#e58f9a', '#90b8a3', '#efc66c', '#7f91bc'][j], 222 + j * 7, ay, 3, 2); }
      if (dancer) { const t2 = [[0,1],[1,0],[2,1],[1,2]][beat % 4]; r(ctx, '#ffe9a0', 221 + t2[0] * 10, 318 + t2[1] * 6, 9, 5); }
    }
  }
  // Two office cats roam the whole tower, like the two at Alice's home (11-03 photos): 小橘, an orange tabby, and 三花, a calico.
  // 11-05 their characters (Alice): 小橘 was abandoned before weaning, 无忧 picked it up, so it is lively and lets anyone hold, pet and
  // bathe it — the kids chase it, she carries it, it gets the baths. 三花 is 14, adopted three months ago, fierce (「昨天还抓伤我家人的
  // 鼻子」), won't be held: it hisses at grown-ups who come close, slinks off to the kids' bunk when she pets or bathes 小橘, and sleeps
  // on the kids' bed rather than the cat tree (「他们就几乎没睡过猫窝」).
  // Page-only state: they walk the same BFS grid as everyone, nap on the cat tree at night, come to whoever pets or feeds them,
  // purr at passers-by, and every so often one chases the other into a little play-fight.
  const CAT_LOOKS = [{name:'小橘',fur:'#e8963a',stripe:'#c8732a',belly:'#f2b46a',head:'#e8963a',muzzle:'#f2b46a'},
                     {name:'三花',fur:'#f4f1e6',stripe:'#5a4636',belly:'#f4f1e6',head:'#8a6a4a',muzzle:'#f4f1e6',patch:'#e8963a'}];
  let cats=null, catPlay=null;
  function catTick() {
    if (!C.catSpot || mv) return null;
    const L=C.id, bowlOf=k=>({x:C.catSpot.x+14+k*12,y:C.catSpot.y-k*2}), kb=C.beds && C.kidBeds && C.beds[C.kidBeds[1]],
      kidBed=kb && (cats?.kidBed?.layout===L ? cats.kidBed : Object.assign([{x:kb.x+4,y:kb.y},kb].find(p=>!Core.blocked(p.x,p.y,L) && Core.route(C.catSpot,p,L).length)||{},{layout:L})), homeOf=k=>k===1 && kidBed?.x!=null ? kidBed : bowlOf(k);
    if (!cats || cats.layout!==L || cats.sim!==sim) { cats=CAT_LOOKS.map((look,k)=>({...bowlOf(k),k,look,path:[],wait:3+k*4,goal:null})); cats.layout=L; cats.sim=sim; cats.last=sim.time; catPlay=null; }
    if (kidBed) cats.kidBed=kidBed;
    const dt=Math.min(.5,Math.max(0,sim.time-cats.last)); cats.last=sim.time;
    // 11-05 her mornings: they are kept out of her room overnight, come in at 07:30 to wake her, follow her round meowing while she
    // washes, and are fed just before she leaves at 07:45 (Core BOSS_DAY wake / wash / feed).
    const morning=['wake','wash','feed'].includes(sim.bossPlan?.kind) ? sim.bossPlan.kind : null, feeding=morning==='feed' && sim.bossActivity?.()==='feed';
    const petter=sim.actors.find(a=>sim.gameActivity(a)==='cat') || (sim.bossActivity?.()==='pet' ? sim.boss : null), fed=sim.playing?.('cat') || feeding, sleepy=sim.night && !fed && !morning;
    cats.calm=!!(fed||petter||sleepy);
    cats.spots ||= [C.pantry,...C.tour,C.gameWatch,{x:326,y:600},{x:200,y:716},{x:60,y:612},{x:150,y:612},{x:60,y:1000},{x:190,y:966},{x:280,y:1020},{x:230,y:870}].filter(p=>p&&!Core.blocked(p.x,p.y,L));
    const go=(c,p)=>{ if(c.goal&&Core.distance(c.goal,p)<4)return; c.goal=p; c.path=Core.route(c,p,L); };
    // A chase starts now and then (never at night or while someone is petting/feeding): the chaser keeps re-aiming at the runner.
    if (!catPlay && !sleepy && !fed && !petter && !cats.some(c=>c.task) && (Math.random()<dt/35 || view==='cat' && !cats.chased && sim.time>2 && (cats.chased=true))) { const runner=cats[Math.random()<.5?0:1]; catPlay={phase:'chase',runner,chaser:cats[1-runner.k],until:sim.time+9,aim:0}; runner.goal=null; go(runner,cats.spots[Math.floor(Math.random()*cats.spots.length)]); }
    if (catPlay && (sleepy||fed||petter||morning)) catPlay=null;
    if (catPlay?.phase==='chase') {
      const {runner,chaser}=catPlay;
      if (sim.time>catPlay.aim) { catPlay.aim=sim.time+.8; chaser.goal=null; go(chaser,{x:Math.round(runner.x/4)*4,y:Math.round(runner.y/4)*4}); }
      if (Core.distance(runner,chaser)<10 || sim.time>catPlay.until) { catPlay={phase:'tussle',a:runner,b:chaser,until:sim.time+2.5}; runner.path=[]; chaser.path=[]; }
    } else if (catPlay?.phase==='tussle' && sim.time>catPlay.until) { catPlay=null; for(const c of cats){c.goal=null;c.wait=2+Math.random()*4;} }
    const carried = sim.bossPlan?.kind==='stroll', bathing = sim.bossActivity?.()==='bath', vet = sim.bossPlan?.kind==='vet';
    // Muddy days (Core.catDay): 小橘 is out in the garden 11:00–11:45 and stays grubby till its 13:00 bath.
    const cd=Core.catDay(now()), hm=(d=>d.getUTCHours()*60+d.getUTCMinutes())(new Date(now()+8*3600000)), garden=cd.muddy && hm>=660 && hm<705 && C.bossSpots?.farm, muddy=cd.muddy && hm>=670 && hm<810;
    cats.muddy=muddy; cats.vet=vet;
    if (vet) for (const c of cats) Object.assign(c,{x:sim.boss.x,y:sim.boss.y,path:[],goal:null,task:null}); // in the carrier with her
    if (carried) { Object.assign(cats[0],{x:sim.boss.x,y:sim.boss.y,path:[],goal:null,task:null}); }
    if (bathing) { Object.assign(cats[0],{x:sim.boss.x-12,y:sim.boss.y+2,path:[],goal:null,task:null}); }
    const shy = sim.bossPlan?.kind==='bath' || !!petter; // 三花 keeps out of the way of petting and baths
    for (const c of cats) {
      if ((carried || bathing) && c.k===0 || vet) continue;
      if (garden && c.k===0 && !c.task && !catPlay) { const g=C.bossSpots.farm; go(c,{x:g.x+(Math.floor(sim.time/6)%2?10:-6),y:g.y}); }
      // Courier duty (Alice: 「也可以让猫咪替我送信」): runs from the boss to the colleague with the note, then is free again.
      if (c.task) {
        const o=c.task,a=sim.actors.find(a=>a.id===o.id);
        if (!c.path.length) { if(!o.arrived){o.arrived=sim.time;} if(sim.time-o.arrived>2.5){o.done=true;c.task=null;c.wait=3;} }
        else if (a && sim.time-(c.reaim||0)>2) { c.reaim=sim.time; c.path=Core.route(c,a,L); }
        let step=dt*34; while (step>0 && c.path.length) { const q=c.path[0],d=Core.distance(c,q); if(d<=step){c.x=q.x;c.y=q.y;c.path.shift();step-=d;} else {c.x+=(q.x-c.x)/d*step;c.y+=(q.y-c.y)/d*step;step=0;} }
        continue;
      }
      const playing=!!catPlay;
      if (morning && !fed) {
        // Sticking to her: a step either side of her feet (her bed at 07:30, the basin, then the walk to the bowl), re-aimed as she moves.
        const b=sim.boss, side=[{x:b.x+(c.k?-10:10),y:b.y+4},{x:b.x+(c.k?-12:12),y:b.y},{x:b.x,y:b.y+(c.k?-8:8)}].find(p=>!Core.blocked(Math.round(p.x),Math.round(p.y),L));
        if (side && sim.time-(c.follow||0)>.6) { c.follow=sim.time; c.goal=null; go(c,{x:Math.round(side.x/2)*2,y:Math.round(side.y/2)*2}); }
      } else if (!playing) {
        const want=garden&&c.k===0?null:fed?bowlOf(c.k):(petter||sleepy||shy&&c.k===1)?homeOf(c.k):null;
        if (want) go(c,want);
        else if (!c.path.length) { c.wait-=dt; if (c.wait<=0) { c.goal=null; go(c,cats.spots[Math.floor(Math.random()*cats.spots.length)]); c.wait=4+Math.random()*7; } }
      }
      let step=dt*(catPlay?.phase==='chase' || c.fleeUntil>sim.time ? 46 : morning ? 34 : 22);
      while (step>0 && c.path.length) { const q=c.path[0],d=Core.distance(c,q); if(d<=step){c.x=q.x;c.y=q.y;c.path.shift();step-=d;} else {c.x+=(q.x-c.x)/d*step;c.y+=(q.y-c.y)/d*step;step=0;} }
    }
    const people=[...sim.actors,...sim.visitors,sim.boss].filter(Boolean);
    return cats.map(c=>({x:Math.round(c.x),y:Math.round(c.y),look:c.look,k:c.k,moving:c.path.length>0,carrying:!!c.task&&!c.task.arrived,fed,running:catPlay?.phase==='chase',
      tussle:catPlay?.phase==='tussle',meow:!!morning&&!fed,muddy:muddy&&c.k===0,bath:bathing&&c.k===0,hiss:c.k===1&&!fed&&!morning&&!c.path.length&&[...sim.actors,...sim.visitors,sim.boss].filter(Boolean).some(p=>Core.distance(p,c)<14),petted:!catPlay&&(!!petter||!c.path.length&&people.some(p=>Core.distance(p,c)<14)),asleep:sleepy&&!c.path.length&&!c.task}));
  }
  function drawCats() {
    const list=catTick(); if(!list)return; const t=sim.time;
    if (list[0].fed) { const p={x:C.catSpot.x+6,y:C.catSpot.y+2}; r(ctx,'#b5473a',p.x-6,p.y-2,10,4); r(ctx,'#e9c9a0',p.x-5,p.y-3,8,2); }
    const carried = sim.bossActivity?.()==='stroll' || (sim.bossPlan?.kind==='stroll');
    for (const c of list) {
      if (carried && c.k===0 || cats.vet) continue; // 小橘 is in the boss's arms; on vet day both are in the carrier
      if (c.bath) {
        // 小橘 in a tub of suds beside her: head and ears above the foam, bubbles drifting up, a contented 喵.
        const L=c.look, x=c.x, y=c.y, b=Math.floor(t*2)%2;
        r(ctx,'#4c4d4030',x-9,y+1,18,2); r(ctx,'#7f91bc',x-9,y-6,18,7); r(ctx,'#a9b8d8',x-8,y-6,16,1); r(ctx,'#ffffff',x-8,y-8,16,3); r(ctx,'#ffffff',x-6,y-10,4,2); r(ctx,'#ffffff',x+3,y-10,3,2);
        r(ctx,L.head,x-2,y-14+b,5,5); r(ctx,L.head,x-2,y-16+b,1,2); r(ctx,L.head,x+2,y-16+b,1,2); r(ctx,L.muzzle,x,y-11+b,3,2); r(ctx,'#2f3a3c',x,y-13+b,1,1); r(ctx,'#ffffff',x-3,y-15+b,3,2);
        for (let j=0;j<3;j++) { const by=(t*8+j*5)%14; r(ctx,'#e8f6ff',x-6+j*6,y-12-by,2,2); }
        if (Math.floor(t/2)%3===0) text(ctx,'喵～',x+6,y-18,6,'#b5473a');
        continue;
      }
      const L=c.look,bob=c.tussle?(Math.floor(t*10+c.k)%2)*2:0,p={x:c.x+(c.tussle?(c.k?3:-3):0),y:c.y-bob},leg=c.moving&&Math.floor(t*(c.running?14:8))%2;
      r(ctx,'#4c4d4030',c.x-6,c.y,12,2);
      if (c.asleep) { r(ctx,L.fur,p.x-6,p.y-5,12,5); r(ctx,L.stripe,p.x-3,p.y-5,1,5); if(L.patch)r(ctx,L.patch,p.x-1,p.y-5,3,3); r(ctx,L.head,p.x+4,p.y-7,4,3); text(ctx,'z',p.x+9,p.y-10-(t%3|0),6,'#45534b'); continue; }
      r(ctx,L.fur,p.x-5,p.y-6,10,5); r(ctx,L.belly,p.x-3,p.y-3,6,2);
      if (L.patch) { r(ctx,L.patch,p.x-4,p.y-6,3,2); r(ctx,L.stripe,p.x,p.y-6,3,3); } else { r(ctx,L.stripe,p.x-3,p.y-6,1,5); r(ctx,L.stripe,p.x,p.y-6,1,5); }
      r(ctx,L.head,p.x+3,p.y-9,5,5); r(ctx,L.head,p.x+3,p.y-11,1,2); r(ctx,L.head,p.x+7,p.y-11,1,2); r(ctx,L.muzzle,p.x+5,p.y-6,3,2); if(L.patch)r(ctx,'#e8963a',p.x+3,p.y-9,2,2);
      r(ctx,'#2f3a3c',p.x+5,p.y-8,1,1);
      r(ctx,L.stripe,p.x-4+leg,p.y-1,1,2); r(ctx,L.stripe,p.x+2-leg,p.y-1,1,2); r(ctx,L.patch?L.stripe:L.fur,p.x-8,p.y-8+(Math.floor(t*(c.running?8:2))%2),3,2);
      if (c.tussle && Math.floor(t*6+c.k)%2) r(ctx,'#f4f1e6',p.x+(c.k?-6:8),p.y-10,3,2);
      if (c.carrying) { r(ctx,'#fffaf0',p.x+7,p.y-7,5,4); r(ctx,'#c1b597',p.x+8,p.y-5,3,1); }
      if (c.muddy && !c.asleep) { for (const [mx,my] of [[-4,-5],[0,-3],[3,-6],[-2,-2]]) r(ctx,'#7a5a3a',p.x+mx,p.y+my,2,1); if (Math.floor(t/3)%4===0) text(ctx,'脏兮兮',p.x+4,p.y-14,5,'#7a5a3a'); }
      if (c.hiss) { if (Math.floor(t*1.2)%3===0) { text(ctx,'哈！',p.x+4,p.y-14,6,'#b5473a'); r(ctx,L.head,p.x+8,p.y-8-(Math.floor(t*6)%2),2,2); } }
      else if (c.meow) { const say=['喵～','喵喵！','喵——','咪呜'][Math.floor(t/1.3+c.k*2)%4]; if (Math.floor(t*1.5+c.k)%3) text(ctx,say,p.x+4,p.y-14-(Math.floor(t*4)%2),6,'#b5473a'); }
      else if ((c.petted||c.fed) && !c.carrying) text(ctx,'♥',p.x+2,p.y-14-(t%2)*2,6,'#e58f9a');
    }
    if (list[0].tussle) { const mx=(list[0].x+list[1].x)/2,my=Math.min(list[0].y,list[1].y)-16; text(ctx,'喵！',mx,my-(t*4%2|0),6,'#b5473a'); for(let j=0;j<3;j++) r(ctx,'#ffffffc0',mx-8+j*7,my+4+((t*9+j*3)%5|0),2,2); }
  }
  // 08:00–21:00 无忧 and 无虑 follow their own day (Core.kidsPlan): playroom, game room, the farm, chasing a cat, and at the
  // boss's meals (早茶 / 午饭 / 下午茶 / 晚饭) they walk over and eat beside her. Drawn with the cats, under the grown-ups.
  const KID_LOOKS=[['无忧','#e8963a',false],['无虑','#9a6fc4',true]];
  let kids=null;
  function kidsTick() {
    if (mv || !C.kidSpots) { kids=null; return null; }
    const plan=Core.kidsPlan(now()); if (plan.kind==='sleep') { kids=null; return null; }
    const S=C.kidSpots, L=C.id;
    if (!kids || kids.sim!==sim || kids.layout!==L) { kids=[0,1].map(k=>({k,...S.play[k],path:[],goal:null,wait:0,aim:0})); kids.sim=sim; kids.layout=L; kids.last=sim.time; }
    const dt=Math.min(.5,Math.max(0,sim.time-kids.last)); kids.last=sim.time; kids.plan=plan;
    const go=(c,p)=>{ if(c.goal&&Core.distance(c.goal,p)<4)return; c.goal={...p}; c.path=Core.route(c,p,L); };
    // 11-05: the kids chase 小橘 (lively, 无忧's own find); 三花 is old and fierce, only a fallback while 小橘 is busy.
    const cat = plan.kind==='chase' && cats && !cats.calm ? (cats.find(c=>c.k===0&&!c.task&&!['stroll','bath'].includes(sim.bossPlan?.kind)) || cats.find(c=>c.k===1&&!c.task)) : null;
    // Study: keep the same teacher while it stays free; a colleague reading in the reading room first, then one idle at its own desk.
    if (plan.kind==='study') {
      const free=a=>a && a.status==='idle' && !a.path.length, atDesk=a=>Core.distance(a,Core.home(a.i,L))<1;
      const t=kids.teach && sim.actors.find(a=>a.id===kids.teach.id);
      if (!(t && (kids.teach.where==='read' ? sim.gameActivity(t)==='book' && !t.path.length : free(t) && atDesk(t)))) kids.teach=null;
      if (!kids.teach) {
        const reader=sim.actors.find(a=>['idle','off'].includes(a.status) && !a.path.length && sim.gameActivity(a)==='book');
        if (reader) kids.teach={id:reader.id,where:'read',spots:S.read};
        else for (const d of sim.actors.filter(a=>free(a) && !sim.isCourier(a) && ![7,9].includes(a.i) && !sim.gameActivity(a) && atDesk(a))) {
          const h=Core.home(d.i,L), sp=[-10,10].map(dx=>({x:h.x+dx,y:h.y+10}));
          if (sp.every(p=>!Core.blocked(p.x,p.y,L) && Core.route(kids[0],p,L).length)) { kids.teach={id:d.id,where:'desk',spots:sp}; break; }
        }
      }
    } else kids.teach=null;
    for (const c of kids) {
      if (plan.kind==='meal') go(c,S[plan.meal][c.k]);
      else if (plan.kind==='boss') go(c,S[plan.with][c.k]);
      else if (plan.kind==='study') go(c,kids.teach ? kids.teach.spots[c.k] : S.read[c.k]);
      else if (plan.kind==='play' || plan.kind==='games' || plan.kind==='show') go(c,S[plan.kind][c.k]);
      else if (plan.kind==='garden') { const inGarden=c.goal && S.garden.some(p=>Core.distance(p,c.goal)<4); if (!inGarden) go(c,S.garden[c.k]); else if (!c.path.length && (c.wait-=dt)<=0) { c.goal=null; go(c,S.garden[Math.floor(Math.random()*S.garden.length)]); c.wait=2+Math.random()*3; } }
      else if (cat) { if (sim.time-c.aim>.8) { c.aim=sim.time; c.goal=null; const t={x:Math.round(cat.x/4)*4+(c.k?8:-8),y:Math.round(cat.y/4)*4}; c.path=Core.route(c,t,L); if(!c.path.length) c.path=Core.route(c,cat,L); c.goal=t; } }
      else go(c,S.play[c.k]);
      let step=dt*(cat?38:plan.kind==='boss'||plan.kind==='meal'?50:28); // they run to keep up with the boss
      while (step>0 && c.path.length) { const q=c.path[0],d=Core.distance(c,q); if(d<=step){c.x=q.x;c.y=q.y;c.path.shift();step-=d;} else {c.x+=(q.x-c.x)/d*step;c.y+=(q.y-c.y)/d*step;step=0;} }
    }
    // The cat lets them get close, then bolts for another corner of the building; they never quite catch it.
    if (cat && !catPlay && kids.some(c=>Core.distance(c,cat)<16) && !(cat.fleeUntil>sim.time)) { cat.fleeUntil=sim.time+3; cat.goal=null; cat.wait=2; cat.path=Core.route(cat,cats.spots[Math.floor(Math.random()*cats.spots.length)],L); }
    kids.cat=cat;
    return kids;
  }
  function kidsOut() { const list=kids, S=C.kidSpots; return !!(list && S && !(list.plan?.kind==='play' && list.every(c=>!c.path.length && Core.distance(c,S.play[c.k])<1))); }
  function drawKids() {
    const list=kidsTick(); if (!list || !kidsOut()) return; const t=sim.time, plan=list.plan;
    // The teacher talks once both kids are sitting beside it.
    const teacher=list.teach && sim.actors.find(a=>a.id===list.teach.id);
    if (teacher && list.every(c=>!c.path.length) && Math.floor(t/4)%2===0) { const lines=['这叫提示词','要说清你想要啥','AI 也会说错哦','答案要自己检查','不懂就问我','先想好再动手']; text(ctx,lines[Math.floor(t/8)%lines.length],Math.round(teacher.x),Math.round(teacher.y)-30,6,'#8a4a3e'); }
    ctx.font='5px "PingFang SC",system-ui,sans-serif';
    for (const c of list) {
      const [name,shirt,girl]=KID_LOOKS[c.k], x=Math.round(c.x), y=Math.round(c.y), moving=c.path.length>0, leg=moving && Math.floor(t*(list.cat?12:8)+c.k)%2;
      r(ctx,'#4c4d4030',x-4,y,8,2); r(ctx,shirt,x-3,y-7,6,6); r(ctx,'#e4bb91',x-3,y-12,6,5); r(ctx,'#4b4639',x-3,y-13,6,2);
      if (girl) { r(ctx,'#4b4639',x-5,y-12,2,4); r(ctx,'#4b4639',x+3,y-12,2,4); r(ctx,'#e58fb0',x-5,y-13,2,1); r(ctx,'#e58fb0',x+3,y-13,2,1); }
      r(ctx,'#2f3a3c',x-2,y-1-(leg?1:0),2,2); r(ctx,'#2f3a3c',x+1,y-1-(leg?0:1),2,2);
      const eating = plan.kind==='meal' && !moving, cheering = plan.kind==='games' && !moving;
      if (eating) { r(ctx,'#ffffff',x-3,y-6,6,3); r(ctx,plan.meal==='tea'?'#efc66c':'#e9c9a0',x-2,y-7,4,1); if (Math.floor(t/3+c.k)%4===0) text(ctx,'好吃',x+9,y-15,5,'#b5473a'); }
      const withBoss = plan.kind==='boss' && !moving ? plan.with : null;
      if (withBoss==='desk') { r(ctx,'#f4f1e6',x-3,y-7,6,4); r(ctx,'#7f91bc',x,y-7,1,4); if (Math.floor(t/4+c.k)%5===0) text(ctx,'写作业',x+10,y-15,5,'#45534b'); }
      if (withBoss==='pet' && Math.floor(t/2+c.k)%3===0) text(ctx,'♥',x+6,y-15,6,'#e58f9a');
      if (withBoss==='swim') { r(ctx,'#7ad7ffc0',x-5,y-4,10,5); r(ctx,c.k?'#e58fb0':'#efc66c',x-5,y-6,10,2); }
      if (withBoss==='gym') { const up=Math.floor(t*2+c.k)%2; r(ctx,shirt,x-5,y-11-up*2,2,4); r(ctx,shirt,x+3,y-11-up*2,2,4); }
      if ((withBoss==='theatre' || plan.kind==='show' && !moving)) { r(ctx,'#ffffff',x+2,y-6,4,4); r(ctx,'#e58f9a',x+2,y-6,1,4); r(ctx,'#efc66c',x+2,y-7,4,1); if (Math.floor(t/5+c.k)%6===0) text(ctx,plan.kind==='show'?'好看！':'哇～',x+10,y-15,5,'#ffe9a0'); }
      if (withBoss==='farm') for (let j=0;j<2;j++) r(ctx,'#7ad7ff',x+5+j*2,y-4+((t*20+j*5)%6),1,2);
      if (cheering || withBoss==='games') { r(ctx,shirt,x-5,y-11-(Math.floor(t*3+c.k)%2),2,4); if (Math.floor(t/2+c.k)%3===0) text(ctx,'加油',x+9,y-15,5,'#b5473a'); }
      if (plan.kind==='study' && !moving) { r(ctx,'#f4f1e6',x-3,y-7,6,4); r(ctx,'#7f91bc',x,y-7,1,4); const b=Math.floor(t/4+c.k)%4; if (!list.teach && b===0) text(ctx,c.k?'自学中':'这字念啥',x+10,y-15,5,'#45534b'); else if (list.teach && b===1) text(ctx,['哦～','懂啦','为什么呀'][Math.floor(t/12+c.k)%3],x+10,y-15,5,'#45534b'); }
      if (list.cat && c.k===0 && Math.floor(t/2)%3!==2) text(ctx,'别跑～',x+10,y-15,5,'#b5473a');
      const w=Math.ceil(ctx.measureText(name).width)+6; r(ctx,'#fff6dc',x-w/2,y+3,w,7); r(ctx,shirt,x-w/2,y+3,2,7); text(ctx,name,x+1,y+9,5,'#253334');
    }
  }
  // 21:00–08:00 无忧 and 无虑 sleep in the rest room's third bunk (kidBeds), tagged like everyone in bed.
  function drawKidsAsleep() {
    if (mv || !C.kidBeds || !C.beds) return; const h=new Date(now()+8*3600000).getUTCHours(); if (h>=8 && h<21) return;
    const t=sim.time;
    [['无忧','#e8963a'],['无虑','#9a6fc4']].forEach(([name,c],j)=>{ const b=C.beds[C.kidBeds[j]]; if(!b)return; const x=Math.round(b.x), y=Math.round(b.y), k=(t+j)%3;
      r(ctx,'#4b4639',x-10,y-9,5,2); r(ctx,'#e3b58d',x-9,y-8,5,4); r(ctx,c,x-3,y-8,11,6); r(ctx,'#ffffff40',x-3,y-8,11,1);
      text(ctx,'z',x+7,y-11-k*2,5,'#45534b');
      ctx.font='5px "PingFang SC",system-ui,sans-serif'; const w=Math.ceil(ctx.measureText(name).width)+6, ty=j%2?y+8:y-31; r(ctx,'#fff6dc',x-w/2,ty,w,7); r(ctx,c,x-w/2,ty,2,7); text(ctx,name,x+1,ty+6,5,'#253334'); });
    // 三花 curls up on 无虑's blanket (Alice: 「喜欢睡孩子们的床」), drawn over the kids so it shows.
    const s3=cats?.[1], kb=C.beds[C.kidBeds[1]];
    if (s3 && kb && !s3.path.length && Core.distance(s3,kb)<6) { const L=s3.look, x=Math.round(kb.x)+4, y=Math.round(kb.y)-5;
      r(ctx,L.fur,x,y-4,8,4); r(ctx,L.stripe,x+3,y-4,2,3); r(ctx,L.patch,x+1,y-4,2,2); r(ctx,L.head,x+6,y-6,3,3); r(ctx,L.head,x+6,y-7,1,1); r(ctx,L.head,x+8,y-7,1,1); }
  }
  function sceneUnder() {
    const s=sim.scene, m=s.meeting;
    gamesUnder(); leisureUnder(); drawCats(); drawKids(); drawKidsAsleep();
    if(!mv)drawGate(false);
    placed(ctx,C.totalsOffset,()=>{
    const T=C.totals||{x:24,y:426,w:276,h:52},cx=T.x+T.w/2;
    text(ctx,`办公室累计${demo?' · 演示':''}`,cx,T.y+14,8,'#fff4d5');
    const lines=boardLines(); lines.forEach((line,i)=>{ const size=i===2?7.5:8; ctx.font=`${size}px \"PingFang SC\",system-ui,sans-serif`; text(ctx,line,cx,(mv?450+i*10:T.y+22+i*8),mv?size:Math.min(size,size*(T.w-16)/ctx.measureText(line).width),'#fff4d5'); });
    });
    // The tower's screen is narrower and sits 142 rows higher; text shrinks to fit it.
    const M=C.meetingRect,mx=M?68:98,my=M?-142:0,big=M?7:8,small=M?5.5:7;
    placed(ctx,C.meetingOffset,()=>{
    if (m) {
      text(ctx,m.kind==='review'?`互审 · 第 ${m.round ?? '—'} 轮`:`碰头会 · ${m.members.length} 人`,mx,508+my,big);
      if (m.kind==='review' && m.slide) text(ctx,`采纳 ${m.slide.adopted} · 反驳 ${m.slide.rejected} · 待议 ${m.slide.open}`,mx,517+my,small);
      text(ctx,`${Math.max(0,Math.floor((now()-Date.parse(m.since))/60000))} 分钟`,M?104:160,M?349:488,6);
    } else if(sim.reception?.venue==='meeting' && sim.reception.phase!=='leaving') {
      text(ctx,'来谈事 · '+C.MEET_NAMES[sim.reception.kind],mx,511+my,big);
    } else {
      const last=[...events].filter(e=>e.kind==='meeting').sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))[0];
      const label=mv?(last?`上次开会 ${formatClock(Date.parse(last.at))}`:'今天还没开会'):C.meetingBoardText(stats,events);
      text(ctx,label,mx,512+my,M?(label.length>12?5.5:6.5):(label.length>16?6.5:7.5));
    }
    });
    if(mv)placed(ctx,C.storageOffset,()=>{
    const layers=C.diskLayers(s.disk);
    for(let j=0;j<layers;j++) for(let i=0;i<3;i++) {
      const x=268+i*20,y=666-j*7;
      r(ctx,'#805f3d',x,y,19,7); r(ctx,'#c59861',x+1,y,17,6); r(ctx,'#e3bb81',x+8,y,3,6);
    }
    if (s.disk) text(ctx,`${s.disk.usedPct}%`,298,690,7);
    if (s.disk?.usedPct>=92) { r(ctx,'#ba5045',276,604,47,11); text(ctx,'快满了',299,612,8,'#fff4d5'); }
    });
    if (!C.noBooth) placed(ctx,C.boothOffset,()=>r(ctx,sim.boothCall()?'#e8bc55':'#84917c',mv?296:281,490,9,4));
    // s.guard can be null while sim.guard exists: the supper run borrows a guard when no backup patrol is on.
    if(sim.guard && (!mv || !sim.supper) && s.guard?.phase==='patrol' && sim.guard.path.length) {
      const a=sim.guard,p=a.path[0],angle=Math.atan2(p.y-a.y,p.x-a.x);
      ctx.fillStyle='#fff0ab38'; ctx.beginPath(); ctx.moveTo(a.x,a.y-8);
      ctx.lineTo(a.x+Math.cos(angle-.35)*37,a.y-8+Math.sin(angle-.35)*37);
      ctx.lineTo(a.x+Math.cos(angle+.35)*37,a.y-8+Math.sin(angle+.35)*37); ctx.closePath(); ctx.fill();
    }
    for(const id of s.dispatched) { const a=sim.actors.find(a=>a.id===id); if(a && !(sim.handoffWalk?.id===id && !sim.handoffWalk.placed) && !sim.flights.some(f=>f.id===id && !f.returning)) folder(C.desks[a.i][0]+17,C.desks[a.i][1]+4); }
  }
  function drawGate(over) {
    const {x,y}=C.gatePoint,e=sim.gate,lit=e?.phase==='signal';
    if(!over) {
      r(ctx,'#496e59',x-15,y-33,30,5);r(ctx,'#739C82',x-15,y-28,4,29);r(ctx,'#739C82',x+11,y-28,4,29);
      r(ctx,'#d5cfbf',x-10,y-31,20,2);r(ctx,lit?(e.ok?'#7ac87b':'#eb6b55'):'#72796e',x-4,y-38,8,5);
      if(sim.gateFolder?.until>sim.time){const a=sim.actors.find(a=>a.id===sim.gateFolder.id);folder(C.desks[a.i][0]+17,C.desks[a.i][1]+4);}
      return;
    }
    if(lit) {const label=e.ok?'放行':e.n>1?'拦下 ×'+e.n:'拦下！',w=Math.max(44,label.length*7+8);r(ctx,'#fff4d5',x-w/2,y-53,w,13);text(ctx,label,x,y-43,8,e.ok?'#496e59':'#b74737');speechBoxes.push({x:x-w/2,y:y-53,w,h:13});}
    if(e && !e.placed && !['pickup','sitting'].includes(e.phase)) {const a=sim.actors.find(a=>a.id===e.id);r(ctx,'#e4bb91',a.x-7,a.y-12,14,3);folder(a.x,a.y-9);}
  }
  // The same folder, hand and words in normal, visitor, wallpaper and MV views.
  function drawHandoff() {
    const e=sim.handoffWalk;if(!e)return;
    const cc=sim.actors.find(a=>a.activity==='handoff-walk'),a=sim.actors.find(a=>a.id===e.id);if(!cc || !a)return;
    const dx=Math.sign(a.x-cc.x)||1,x=Math.round(cc.x),y=Math.round(cc.y);
    if(['pickup','walking','placing'].includes(e.phase)) {
      const k=e.phase==='placing'?Math.min(1,(sim.time-e.phaseAt)/.6):0;
      const desk={x:C.desks[a.i][0]+17,y:C.desks[a.i][1]+4};
      const fx=x+dx*9,fy=y-8;
      r(ctx,'#e4bb91',x+(dx>0?6:-10),y-10,4,3);
      folder(fx+(desk.x-fx)*k,fy+(desk.y-fy)*k);
    }
    if(e.phase==='pat' || e.phase==='reply' && sim.time-e.phaseAt<.4) {
      const bob=Math.sin((sim.time-e.phaseAt)*Math.PI*5)>0?0:2;
      r(ctx,cc.color,x+(dx>0?5:-14),y-8-bob,9,4);
      r(ctx,'#e4bb91',x+(dx>0?12:-16),y-9-bob,4,4);
    }
    // Keep the walking nameplate clear of the recipient's fixed desk label.
    speechBoxes.push({x:a.x-23,y:a.y+7,w:46,h:9});
    for(const b of sim.handoffSpeech()) {
      const actor=b.id===cc.id?cc:a,w=b.text.length*8+10;
      const bx=Math.max(20,Math.min(C.W-w-20,actor.x-w/2)),by=actor.y-(actor===cc?62:43);
      speechBoxes.push({x:bx,y:by,w,h:14});r(ctx,'#b59b72',bx,by,w,14);r(ctx,'#fff6dc',bx+1,by+1,w-2,12);
      r(ctx,'#fff6dc',actor.x,by+14,3,3);text(ctx,b.text,bx+w/2,by+10,8,'#6a4b30');
    }
  }
  // When Alice gives CC (desk 0) or etwin-cc (desk 7) something to do, their status flips to busy: the boss sends the order
  // over by the most old-fashioned means available, a paper plane or a toy drone with a note, alternately. Page-only.
  let orderSeen=null, orders=[], orderCount=0;
  function watchOrders() {
    if (mv || !sim) return;
    const targets=sim.actors.filter(a=>a.i===0||a.i===7);
    if (!orderSeen || orderSeen.sim!==sim) { orderSeen={sim,map:new Map(targets.map(a=>[a.id,a.status]))}; orders=[]; return; }
    for (const a of targets) { const before=orderSeen.map.get(a.id); if (a.status==='busy' && before && before!=='busy') orders.push({id:a.id,at:sim.time,kind:Core.distance(a,sim.boss)<50?'note':['plane','drone',C.catSpot?'cat':'plane'][orderCount++%3],from:{x:sim.boss.x,y:sim.boss.y-18}}); orderSeen.map.set(a.id,a.status); }
    for (const o of orders) if (o.kind==='cat' && !o.cat && cats) { const c=cats[orderCount%2]; catPlay=null; Object.assign(c,{x:sim.boss.x+8,y:sim.boss.y,goal:null}); c.path=Core.route(c,sim.actors.find(a=>a.id===o.id)||c,C.id); c.task=o; o.cat=c.look.name; }
    orders=orders.filter(o=>o.kind==='cat' ? !o.done && sim.time-o.at<40 : sim.time-o.at<3.4 && sim.time>=o.at);
  }
  function drawOrders() {
    watchOrders(); const t=sim.time;
    for (const o of orders) {
      const a=sim.actors.find(a=>a.id===o.id); if(!a)continue;
      const to={x:a.x,y:a.y-26},p=Math.min(1,(t-o.at)/1.8),e=p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2;
      const x=o.from.x+(to.x-o.from.x)*e, y=o.from.y+(to.y-o.from.y)*e-(o.kind==='plane'?Math.sin(Math.PI*p)*36:Math.sin(Math.PI*p)*14+Math.sin(t*10));
      if (o.kind==='cat') { if (o.arrived) text(ctx,`${o.cat}送到啦`,to.x,to.y-4-Math.min(4,(t-o.arrived)*6),6,'#8c3a2e'); continue; }
      if (o.kind==='note') { if (t-o.at>.3) text(ctx,'收到！',to.x,to.y-4,6,'#8c3a2e'); continue; }  // she answered it face to face at her desk
      if (p<1) {
        if (o.kind==='plane') { const dir=to.x>=o.from.x?1:-1; r(ctx,'#fffaf0',x-4*dir,y-1,8,2); r(ctx,'#fffaf0',x-2*dir,y-3,4,2); r(ctx,'#d9d2bc',x-4*dir,y+1,6,1); for(let j=1;j<4;j++) r(ctx,'#ffffff60',x-dir*(6+j*4),y+j,2,1); }
        else { const blink=Math.floor(t*20)%2; r(ctx,'#5d6b60',x-4,y-1,8,3); r(ctx,blink?'#c9d4cf':'#9aa7a2',x-8,y-3,5,1); r(ctx,blink?'#9aa7a2':'#c9d4cf',x+3,y-3,5,1); r(ctx,'#d96952',x,y,1,1); r(ctx,'#8d9279',x,y+2,1,4); r(ctx,'#fff4d5',x-2,y+6,5,4); }
      } else text(ctx,o.kind==='plane'?'纸飞机到！':'无人机送达',to.x,to.y-4-Math.min(4,(t-o.at-1.8)*6),6,'#8c3a2e');
    }
  }
  function sceneOver() {
    drawOrders();
    const ball=sim.pingPongBall();
    if(ball)r(ctx,'#fff4d5',ball.x,ball.y,ball.size,ball.size);
    if(C.id==='landscape')r(ctx,sim.scene.meeting?'#efc66c':'#84917c',514,190,9,4);
    else if(sim.scene.meeting) {
      r(ctx,'#77563f',274,398,68,18); r(ctx,'#efc66c',276,400,64,14);
      r(ctx,'#fff4d5',278,404,3,3); text(ctx,'开会中 ↓',311,410,8,'#45534b');
    }
    for(const f of sim.flightPoints()) folder(f.x,f.y);
    drawHandoff();
    const cc=sim.actors.find(a=>a.activity==='call');
    if(cc && !cc.path.length) {
      r(ctx,'#354c47',cc.x+5,cc.y-18,3,11); r(ctx,'#354c47',cc.x+3,cc.y-18,5,3); r(ctx,'#354c47',cc.x+3,cc.y-9,5,3);
      if(!mv && sim.time%8<2.5) { const call=sim.scene.call, who=call?.kind==='dispatch' && sim.actors.find(a=>a.id===call.with)?.name; const word=who ? [`喂，${who}`,'交给你啦','做完叫我'][Math.floor(sim.time/8)%3] : ['嗯…','这个思路有意思','我记一下'][Math.floor(sim.time/8)%3]; placed(ctx,C.boothOffset,()=>{const bx=mv?258:242,by=mv?531:472;r(ctx,'#fff4d5',bx,by,84,12); text(ctx,word,bx+42,by+9,8);}); }
    }
    if(sim.guard) {
      const a=sim.guard;
      if(sim.scene.guard?.phase==='done') { r(ctx,'#f4ebd8',321,374,7,7); r(ctx,sim.scene.guard.ok===true?'#67b779':sim.scene.guard.ok===false?'#d9564d':'#9a9d8e',322,375,5,5); }
      r(ctx,'#364c67',a.x-7,a.y-24,14,5); r(ctx,'#e4bd70',a.x-1,a.y-22,3,3); r(ctx,'#e4bd70',a.x+6,a.y-10,5,3);
      if(sim.scene.guard?.phase==='done' && sim.scene.guard?.ok===false) {r(ctx,'#fff4d5',280,345,64,13);text(ctx,'备份没过',312,355,8,'#ba5045');}
    }
  }

  // Four pixel treats, 8 wide, drawn with the bottom-left at (x, y).
  function item(kind, x, y) {
    if (kind === 'milktea') { r(ctx, '#e9c9a0', x, y - 8, 7, 8); r(ctx, '#7a4b2a', x + 1, y - 5, 5, 4); r(ctx, '#3b2a1e', x + 2, y - 3, 1, 1); r(ctx, '#3b2a1e', x + 4, y - 3, 1, 1); r(ctx, '#c85b4a', x + 3, y - 12, 1, 5); }
    if (kind === 'coffee') { r(ctx, '#f6f1e6', x, y - 7, 6, 7); r(ctx, '#5a3b26', x + 1, y - 6, 4, 2); r(ctx, '#f6f1e6', x + 6, y - 6, 2, 3); r(ctx, '#d9d2c2', x + 1, y - 10, 1, 2); r(ctx, '#d9d2c2', x + 3, y - 11, 1, 3); }
    if (kind === 'dimsum') { r(ctx, '#9c7444', x - 1, y - 6, 10, 6); r(ctx, '#d7b47a', x - 1, y - 7, 10, 2); r(ctx, '#b98a52', x, y - 10, 8, 3); r(ctx, '#d7b47a', x, y - 11, 8, 1); r(ctx, '#ffffffa0', x + 3, y - 14, 2, 2); }
    if (kind === 'cake') { r(ctx, '#f3d9a4', x, y - 6, 8, 6); r(ctx, '#e8a3a8', x, y - 4, 8, 2); r(ctx, '#f8f1e2', x, y - 7, 8, 1); r(ctx, '#c84a4a', x + 3, y - 9, 2, 2); }
    if (kind === 'cloud') {r(ctx,'#b89073',x+5,y-6,2,7);r(ctx,'#edb6cc',x+1,y-12,10,6);r(ctx,'#edb6cc',x-1,y-10,14,3);r(ctx,'#fff6ee',x+2,y-15,5,7);r(ctx,'#fff6ee',x+6,y-13,5,6);r(ctx,'#fff6ee',x,y-11,5,5);}
    if (kind === 'papers') {for(let n=0;n<3;n++){r(ctx,'#b9ae92',x+n,y-2-n*2,13,3);r(ctx,'#fff4d5',x+n,y-3-n*2,12,2);}r(ctx,'#8aa79b',x+5,y-6,7,1);}
    if (kind === 'biscuit') {r(ctx,'#a46c3f',x,y-6,9,6);r(ctx,'#e3b96e',x+1,y-7,7,6);r(ctx,'#8b5a3b',x+2,y-5,2,1);r(ctx,'#8b5a3b',x+6,y-3,1,2);}
    if (kind === 'noodles') {r(ctx,'#ece8d8',x-1,y-7,13,3);r(ctx,'#94b5aa',x,y-4,11,3);r(ctx,'#607f76',x+2,y-1,7,2);r(ctx,'#e3b96e',x+1,y-6,9,1);r(ctx,'#739c82',x+3,y-6,2,2);for(let n=0;n<3;n++)r(ctx,'#e1e2ce',x+n*4+Math.round(Math.sin(sim.time*3+n)),y-11-n%2*2,1,3);}
    if (kind === 'melon') { r(ctx, '#4f8a4b', x, y - 3, 8, 3); r(ctx, '#e7504e', x + 1, y - 7, 6, 4); r(ctx, '#f3f0e4', x + 1, y - 3, 6, 1); r(ctx, '#2b2b2b', x + 2, y - 6, 1, 1); r(ctx, '#2b2b2b', x + 5, y - 5, 1, 1); }
  }
  function eventPose(a,x,y,moving) {
    if(a.activity==='souvenir') {r(ctx,'#506e78',x+5,y-23,15,23);r(ctx,'#87a3a6',x+7,y-21,11,18);r(ctx,'#edcf90',x+8,y-16,9,2);r(ctx,'#39535b',x+8,y-9,9,6);r(ctx,'#edcf90',x+5,y-21,2,16);if(sim.souvenir?.phase==='delivering')item('cloud',x-14,y-7);}
    if(a.activity==='radar') {
      const swing=Math.round(Math.sin(sim.time*3)*4);r(ctx,'#506e78',x,y-33,2,12);r(ctx,'#a6c3b7',x-6+swing,y-36,13,3);r(ctx,'#a6c3b7',x-4+swing,y-33,9,3);r(ctx,'#506e78',x-2+swing,y-30,5,2);r(ctx,'#edcf90',x+swing,y-39,2,4);
      if(sim.radar?.phase==='pinning'&&!moving){r(ctx,a.color,x+5,y-23,3,13);r(ctx,'#e3b58d',x+5,y-26,3,4);}
    }
    if(a.activity==='snack') {r(ctx,'#9c6c43',x+7,y-15,10,13);r(ctx,'#edcf90',x+8,y-14,8,11);r(ctx,'#9c6c43',x+10,y-18,5,2);item('biscuit',x+9,y-6);}
    if(a===sim.guard && sim.supper && sim.supper.phase!=='returning') {r(ctx,'#846346',x-11,y-7,23,2);item('noodles',x-6,y-9);}
    if(a.activity==='melon') {item('melon',x+4,y-7);if(!moving)r(ctx,'#e3b58d',x+(sim.melon.source.x>x?6:-8),y-14,3,5);}
    if(a.activity==='quota') {
      if(!moving){r(ctx,'#544c3a',x-5,y-16,10,7);r(ctx,a.color,x-5,y-9,10,7);}
      r(ctx,'#896647',x-5,y-42,11,2);r(ctx,'#896647',x-5,y-29,11,2);
      r(ctx,'#d5e7df',x-4,y-40,9,11);r(ctx,'#efc66c',x-3,y-39,7,3);r(ctx,'#efc66c',x-1,y-36,3,3);r(ctx,'#efc66c',x-3,y-32,7,3);
      r(ctx,'#896647',x-5,y-40,1,11);r(ctx,'#896647',x+5,y-40,1,11);
    }
    if(a.activity==='argue' && !moving) {
      const e=sim.argue,side=e.ids.indexOf(a.id)?-1:1;
      if(e.phase==='huff') {r(ctx,a.color,x-11,y-10,5,3);r(ctx,a.color,x+6,y-10,5,3);r(ctx,'#e3b58d',x-9,y-7,3,3);r(ctx,'#e3b58d',x+6,y-7,3,3);}
      if(e.phase==='talking') {
        const bob=Math.floor(sim.time*8)%2*2;
        r(ctx,a.color,x+(side<0?-13:5),y-14+bob,9,3);r(ctx,'#e3b58d',x+(side<0?-16:11),y-13+bob,5,2);
        r(ctx,'#d96952',x-5,y-36,10,7);r(ctx,'#d96952',x-3,y-41+bob,3,6);r(ctx,'#efc66c',x-2,y-35,5,6);
        // A tiny table edge and impact rays, never a blow to another person.
        r(ctx,'#a27853',x+(side<0?-18:8),y-9,11,2);r(ctx,'#efc66c',x+side*17,y-18,2,3);
      }
    }
  }
  function drawEvents() {
    const e=sim.argue;
    if(e?.phase==='smoke') {
      const a=sim.actors.find(a=>a.id===e.ids[0]),x=Math.round(a.x),y=Math.round(a.y)-15,big=e.rejected>=3,scale=big?1.25:1;
      const clouds=[[-20,0,13],[-9,-9,14],[7,-10,15],[22,0,13],[10,9,13],[-10,10,14]];
      const puff=(cx,cy,radius,color)=>{for(let dy=-radius;dy<radius;dy+=2){const width=Math.floor(Math.sqrt(Math.max(0,radius*radius-dy*dy))/2)*2;r(ctx,color,cx-width,cy+dy,Math.max(2,width*2),2);}};
      // Paint the complete outline first, then joined interiors: one scalloped cloud, not stacked boxes.
      for(const extra of [2,0])for(let i=0;i<clouds.length;i++){const [dx,dy,size]=clouds[i],j=Math.sin(sim.time*19+i*2)>0?2:0;puff(x+dx*scale,y+(dy+j)*scale,Math.round(size*scale)+extra,extra?'#aab1aa':'#f2f0df');}
      r(ctx,'#d4dcd2',x-15,y+4,10,2);r(ctx,'#d4dcd2',x-17,y-2,2,6);r(ctx,'#d4dcd2',x+8,y-10,9,2);r(ctx,'#d4dcd2',x+17,y-8,2,6);
      for(let i=0;i<(big?7:5);i++) {
        const phase=sim.time*3+i*1.7,px=x+Math.cos(phase)*(big?46:37),py=y+Math.sin(phase)*25;
        if(i%3===0){r(ctx,'#efc66c',px-4,py-1,9,3);r(ctx,'#efc66c',px-1,py-4,3,9);}
        else if(i%3===1){r(ctx,'#bd8955',px-4,py,10,4);r(ctx,'#edcf90',px-3,py-3,5,4);r(ctx,'#fff4d5',px-3,py-2,5,1);}
        else text(ctx,'?',px,py,12,'#6d9d8e');
      }
      if(mv?.performances) for(let i=0;i<e.ids.length;i++) {
        const who=sim.actors.find(a=>a.id===e.ids[i]),px=x+(i?13:-13),py=y-4+(Math.floor(sim.time*8+i)%2)*2;
        r(ctx,who.color,px-6,py+7,12,3);r(ctx,'#e3b58d',px-5,py,10,7);r(ctx,'#4b4639',px-6,py-4,12,5);
        r(ctx,'#273a34',px-3,py+2,2,2);r(ctx,'#273a34',px+2,py+2,2,2);
        if(who.i===0)r(ctx,'#3e4b47',px-5,py+1,10,1);
      }
      speechBoxes.push({x:x-53,y:y-32,w:106,h:68});
    }
    for(const speech of sim.eventSpeech()) {
      const a=speech.id==='boss'?sim.boss:sim.actors.find(a=>a.id===speech.id);if(!a || sim.argue?.phase==='smoke'&&sim.argue.ids.includes(a.id))continue;
      const high=a.activity==='argue'?54:a.activity==='gate'?32:43,w=speech.icon?20:speech.text.length*8+10,x=Math.max(20,Math.min(C.W-w-20,a.activity==='gate'?a.x+20:a.x-w/2)),y=a.y-high;
      speechBoxes.push({x,y,w,h:14});r(ctx,'#b59b72',x,y,w,14);r(ctx,'#fff6dc',x+1,y+1,w-2,12);r(ctx,'#fff6dc',a.activity==='gate'?x+2:a.x,y+14,3,3);
      if(speech.icon)item(speech.icon,x+6,y+11);else text(ctx,speech.text,x+w/2,y+10,8,'#6a4b30');
    }
  }
  // Squash and stretch: the actor is painted into a sprite at the screen's own pixel scale, then copied back a whole
  // logical row and column at a time: body rows dropped (squash) or doubled (stretch), the middle column widened or
  // removed. Nothing lands between two pixels, and only an actor that is squashing right now pays for it.
  const sprite = document.createElement('canvas'), SPRITE = { left: 32, top: 64, w: 64, h: 88, band: 30 };
  const hopOf = (a, boss) => {
    const doneAge = a.doneArrived == null ? Infinity : sim.time - a.doneArrived;
    return !boss && a.status === 'done' && (mv || !a.activity) && doneAge < Core.HOP_SECONDS ? Core.hopAt(doneAge, calm.matches) : null;
  };
  function person(a, boss = false) {
    const hop = hopOf(a, boss);
    if (!hop?.squash || a.path.length) return drawPerson(a, boss, hop);
    const main = ctx, S = Math.max(2, Math.ceil(Math.abs(main.getTransform().a) - 1e-6)), { left, top, w, h, band } = SPRITE;
    const x = Math.round(a.x), x0 = x - left, y0 = Math.round(a.y) - top, feet = Math.round(a.y - hop.lift) + 2 - y0;
    if (sprite.width !== w * S || sprite.height !== h * S) { sprite.width = w * S; sprite.height = h * S; }
    const g = sprite.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, sprite.width, sprite.height); g.setTransform(S, 0, 0, S, -x0 * S, -y0 * S); g.imageSmoothingEnabled = false;
    ctx = g;
    try { drawPerson(a, boss, hop); } finally { ctx = main; }
    const q = hop.squash, rows = band - q, bandTop = feet - band, blit = (sx, sy, sw, sh, dx, dy, dw = sw) => { if (sw > 0 && sh > 0) main.drawImage(sprite, sx * S, sy * S, sw * S, sh * S, x0 + dx, y0 + dy, dw, sh); };
    blit(0, 0, w, bandTop, 0, q);
    blit(0, feet, w, h - feet, 0, feet);
    const wide = hop.widen, lw = Math.floor(Math.max(0, wide) / 2), rw = Math.max(0, wide) - lw;
    for (let i = 0; i < rows; i++) {
      const sy = bandTop + Math.min(band - 1, Math.floor((i + .5) * band / rows)), dy = feet - rows + i;
      if (wide > 0) { blit(0, sy, left, 1, -lw, dy); blit(left, sy, 1, 1, left - lw, dy, wide + 1); blit(left + 1, sy, w - left - 1, 1, left + rw + 1, dy); }
      else if (wide < 0) { blit(0, sy, left, 1, 0, dy); blit(left + 1, sy, w - left - 1, 1, left, dy); }
      else blit(0, sy, w, 1, 0, dy);
    }
  }
  // A sleeper's name sits on the bunk: above the upper berth, below the lower one (berths are only 24 px apart).
  function bedTag(a, x, y) {
    // The charging pod counts as a berth too: nameplates() leaves everyone lying down to this tag (11-03, Grok Bot had none).
    const beds = sim.layout.beds || [], pod = sim.chargeBed?.(), inPod = !!pod && !(beds.includes(pod)) && C.distance(pod, a) < 1, i = beds.findIndex(b => C.distance(b, a) < 1); if (i < 0 && !inPod) return;
    const name = C.plateName(a.name); ctx.font = '5px "PingFang SC",system-ui,sans-serif'; const w = Math.ceil(ctx.measureText(name).width) + 6, ty = inPod ? y - 33 : i % 2 ? y + 8 : y - 31;
    r(ctx, '#fff6dc', x - w / 2, ty, w, 7); r(ctx, a.color, x - w / 2, ty, 2, 7); text(ctx, name, x + 1, ty + 6, 5, '#253334');
  }
  function drawPerson(a, boss, hop) {
    if((!mv || mv.performances) && sim.argue?.phase==='smoke' && sim.argue.ids.includes(a.id))return;
    if (!boss && !a.activity && ['away', 'off'].includes(a.status) && C.distance(a, C.door) < 3) return;
    if (boss && sim.bossAway && C.distance(a, C.door) < 3) return;
    if (boss && !mv && ['sleep','wake'].includes(sim.bossActivity?.())) {
      // 00:30–07:30 the boss sleeps on the clinic's exam bed (she would rather not go home); 07:30 the cats come in and wake her.
      const t = sim.time, x = Math.round(a.x), y = Math.round(a.y) - 2, k = t % 3, rise = Math.sin(t * 1.2) > 0 ? 0 : 1, waking = sim.bossActivity() === 'wake';
      r(ctx, '#4b4639', x - 11, y - 10, 7, 3); r(ctx, '#e3b58d', x - 10, y - 8, 6, 5); r(ctx, '#273a34', x - 9, y - 6, 3, 1); r(ctx, '#dcb159', x - 7, y - 11, 3, 2);
      r(ctx, '#e58fb0', x - 3, y - 9 + rise, 14, 7 - rise); r(ctx, '#ffffff40', x - 3, y - 9 + rise, 14, 1);
      if (waking) { const line = t % 6 < 3 ? '唔…再睡五分钟' : '好啦好啦起来了'; ctx.font='5px "PingFang SC",system-ui,sans-serif'; const bw=Math.ceil(ctx.measureText(line).width)+6; r(ctx,'#fffaf0',x-bw/2,y-22,bw,8); text(ctx,line,x+1,y-16,5,'#45534b'); }
      else { text(ctx, 'z', x + 8, y - 12 - k * 3, 6, '#45534b'); if (k > 1) text(ctx, 'Z', x + 12, y - 18 - k * 2, 8, '#45534b'); }
      ctx.font='5px "PingFang SC",system-ui,sans-serif'; const w=Math.ceil(ctx.measureText('老板 · 小试AI').width)+6; r(ctx,'#efc66c',x-w/2,y+4,w,7); r(ctx,'#8c3a2e',x-w/2,y+4,2,7); text(ctx,'老板 · 小试AI',x+1,y+10,5,'#5a3b2a');
      return;
    }
    const charging = !mv && !boss && a.activity === 'quota' && !a.path.length && sim.chargeBed?.() && C.distance(a, sim.chargeBed()) < 1;
    if (!boss && !a.visitor && (sim.inBed?.(a) || charging)) {
      // Tucked into a berth (spot = foot of the mattress line): head on the pillow, blanket in their colour, zZz.
      const t = sim.time, x = Math.round(a.x), y = Math.round(a.y), k = (t + a.i * .7) % 3, rise = Math.sin(t * 1.4 + a.i) > 0 ? 0 : 1;
      r(ctx, '#4b4639', x - 11, y - 10, 7, 3); r(ctx, '#e3b58d', x - 10, y - 8, 6, 5); r(ctx, '#273a34', x - 9, y - 6, 3, 1);
      r(ctx, a.color, x - 3, y - 9 + rise, 14, 7 - rise); r(ctx, '#ffffff40', x - 3, y - 9 + rise, 14, 1);
      if (charging) {
        // A battery over the pillow fills as the quota window runs out.
        const left = Math.max(0, (sim.quota[a.id] || 0) - now()), level = Math.max(1, Math.min(9, Math.round(9 * (1 - left / 3600000))));
        r(ctx, '#3e4b47', x - 2, y - 22, 13, 7); r(ctx, '#3e4b47', x + 11, y - 20, 2, 3); r(ctx, '#e8eef2', x - 1, y - 21, 11, 5); r(ctx, level > 6 ? '#67b779' : level > 3 ? '#efc66c' : '#d96952', x, y - 20, level, 3);
        if (Math.floor(sim.time * 2) % 2) text(ctx, '⚡', x + 4, y - 24, 6, '#d9a441');
        bedTag(a, x, y);
        return;
      }
      text(ctx, 'z', x + 8, y - 12 - k * 3, 6, '#45534b'); if (k > 1) text(ctx, 'Z', x + 12, y - 18 - k * 2, 8, '#45534b');
      bedTag(a, x, y);
      return;
    }
    const feastSeat = !boss && !a.visitor && sim.feastEating?.(a) && sim.layout.tea?.some(p=>C.distance(p,a)<1), napAtDesk = !boss && !a.visitor && sim.napping?.(a) && C.distance(a,C.home(a.i))<1;
    const seated = (feastSeat || napAtDesk || ['tea','book','cheer','movie','eat'].includes(sim.gameActivity(a)) || a.activity==='handoff-receive' || a.activity === 'meeting' && !sim.meetingStanding(a.id) || a.listening || (!mv || mv.performances) && ['souvenir','radar','gate'].includes(a.activity) && sim[a.activity]?.phase==='sitting' || a.activity==='reception' && sim.reception?.venue==='meeting' && sim.reception.phase==='talking') && !a.path.length;
    const working = a.status === 'busy' && !a.activity;
    const moving = a.path.length > 0, t = sim.time, doneAge = a.doneArrived == null ? Infinity : t - a.doneArrived;
    // A visitor just walked in (or a treat just landed): everyone in the room looks up and waves for three seconds.
    const hello = sim.greeting(), thanks = sim.thanksNow(), present = !boss && !a.visitor && !['away', 'off'].includes(a.status);
    const greets = present && (mv || !['handoff-walk','handoff-receive','reception','argue','quota','melon','snack','souvenir','radar','gate'].includes(a.activity)) && !!(hello || thanks);
    const pose = greets ? Core.greetPose(t - (hello || thanks).at, calm.matches) : null;
    const massaged = !boss && !a.visitor && !mv && sim.gameActivity(a) === 'massage';
    let x = Math.round(a.x) + (massaged && Math.floor(t * 14) % 2 ? 1 : 0), y = Math.round(a.y - (hop?.lift || 0) - (pose?.perk || 0) - (moving ? Math.abs(Math.sin(t * 10 + (a.i || 0))) : 0));
    const color = boss ? '#c97859' : a.status === 'unknown' ? '#989d98' : a.color;
    r(ctx, '#4c584e30', x - 8, a.y - 1, 17, 3);
    if (!boss && !moving && (working || seated)) {
      r(ctx, '#657a67', x - 8, y - 12, 16, 13); r(ctx, '#8ba087', x - 7, y - 12, 14, 3);
      r(ctx, '#4a5e50', x - 7, y + 1, 3, 4); r(ctx, '#4a5e50', x + 4, y + 1, 3, 4);
    }
    r(ctx, '#33443f', x - 6, y - 18, 12, 15); r(ctx, color, x - 5, y - 10, 10, 8);
    r(ctx, '#e3b58d', x - 5, y - 16, 10, 7); r(ctx, '#4b4639', x - 6, y - 21, 12, 6); r(ctx, '#544c3a', x - 6, y - 16, 2, 5);
    const look = a.activity==='melon' && sim.melon ? Math.sign(sim.melon.source.x-a.x) : greets ? Math.sign((hello ? hello.x : C.pantry.x) - a.x) : 0;
    r(ctx, '#273a34', x - 3 + look, y - 13, 2, 2); r(ctx, '#273a34', x + 2 + look, y - 13, 2, 2);
    const leg = moving ? Math.sin(t * 11) > 0 ? 2 : -2 : 0;
    r(ctx, '#34483e', x - 5, y - 2, 4, 3 + leg); r(ctx, '#34483e', x + 2, y - 2, 4, 3 - leg);
    const typing = !boss && working && !moving ? Math.sin(t * 15 + a.i) > 0 ? 2 : -1 : 0;
    r(ctx, color, x - 8, y - 10, 3, 6); r(ctx, color, x + 5, y - 10, 3, 6);
    const hands = !boss && working && !moving ? 14 : 4;
    r(ctx, '#e4bb91', x - 8, y - hands - typing, 3, 3);
    if (greets) {
      // Right arm springs up (a little past the top, then settles), hand swinging: a wave. A word pops up above the head.
      const hand = Math.round(-4 - 16 * pose.arm), swing = hand > -17 ? 0 : Math.sin(t * 9) > 0 ? 2 : -1;
      if (hand < -10) { r(ctx, '#33443f', x + 5, y - 10, 3, 6); r(ctx, color, x + 5, y + hand + 3, 3, -13 - hand); }
      r(ctx, '#e4bb91', x + 5 + swing, y + hand, 3, 3);
      const playWords = {'play-party':['走！','下楼咯','好耶','冲呀','来啦','走走走','玩去','嘿','好嘞','来了','冲'],'play-song':['唱一个','安可','我先来','好耶','麦给我','来一首','鼓掌','嗨','听歌','好嘞','安可'],'play-cheer':['冲！','收到','加油','干就完了','稳','冲冲冲','好','冲！','yes','加油','冲'],'play-cat':['猫猫','喵','好可爱','咪咪','开饭啦','喵~','撸撸','乖','喵','猫猫','喵']}[hello?.kind];
      const word = playWords ? playWords[a.i % 11] : hello?.kind === 'pose' ? ['茄子', '耶', '✌', '茄子', '笑一个', '耶', '看这里', '茄子', '比心', '耶', '茄子'][a.i % 11]
        : hello ? ['你好', 'Hi', '欢迎', '嗨', 'Hello', '你好呀', '欢迎光临', '嗨嗨', '哈喽', '来啦', '你好'][a.i % 11]
        : ['谢谢', '好耶', '谢啦', '太好了', '谢谢你', '哇', '开心', '干杯', '谢谢啦', '好香', '谢谢'][a.i % 11];
      const w = word.length * 6 + 6, bx = Math.max(22, Math.min(C.W-22 - w, x - w / 2 + 1));
      speechBoxes.push({x:bx,y:y-36,w,h:10});
      const by = y - 36 + pose.pop;
      r(ctx, '#fff6dc', bx, by, w, 10); r(ctx, '#d9a56d', bx, by, w, 1); text(ctx, word, bx + w / 2, by + 8, 6, '#6a4b30');
    } else r(ctx, '#e4bb91', x + 5, y - hands + typing, 3, 3);
    if(a.activity==='reception' && sim.reception?.phase==='handshake' && !moving) {
      const v=sim.reception.visitor, host=sim.actors.find(b=>b.id===sim.reception.hosts[0]);
      if(a===v || a===host) { const dx=a===v?-1:1, bob=Math.sin(t*9)>0?1:0; r(ctx,color,x+(dx<0?-12:5),y-12+bob,8,3); r(ctx,'#e4bb91',x+(dx<0?-14:11),y-12+bob,4,3); }
    }
    // The boss's own day (Core BOSS_DAY): her plan item maps onto the colleagues' poses; dancing and carrying the cat are hers alone.
    const BOSS_POSE = {bath:'catbath',wash:'brush',feed:'catfood',tea:'tea',kitchen:'eat',bbq:'eat',pet:'cat',swim:'swim',gym:'lift',farm:'water',theatre:'movie',sing:'sing',dance:'bossdance',read:'book',stroll:'stroll'};
    const game = boss ? (mv ? null : BOSS_POSE[sim.bossActivity?.()] || null) : sim.chefActivity(a) || sim.gameActivity(a) || (!a.visitor && sim.feastEating?.(a) ? 'tea' : null);
    if(!greets && ['cook','chop','grill'].includes(game)) {
      const lift=Math.floor(t*(game==='chop'?5:3))%2;
      r(ctx,color,x+5,y-16-lift*2,4,7); r(ctx,'#e4bb91',x+6,y-18-lift*2,3,3);
      r(ctx,'#8c6447',x+8,y-24-lift*2,1,8);
      r(ctx,game==='chop'?'#d9e2dc':game==='grill'?'#d96952':'#35474a',x+6,y-25-lift*2,game==='chop'?5:4,3);
    }
    if(!greets && game==='eat') {
      const bite=Math.sin(t*2+a.i)>.4; r(ctx,'#fff6dc',x-8,y-9,8,4);
      r(ctx,'#e4bb91',x+5,y-(bite?16:10),3,3); r(ctx,'#8c6447',x+7,y-(bite?21:15),1,8);
      r(ctx,'#e8963a',x+6,y-(bite?20:14),3,3);
    }
    if (!greets && game === 'arcade') {
      const shift=Math.sin(t*8)>0?1:0;
      r(ctx,color,x-8,y-16,3,8); r(ctx,'#e4bb91',x-9+shift,y-18,3,3);
      r(ctx,color,x+5,y-14,3,6); r(ctx,'#e4bb91',x+5,y-16+shift,3,3);
    }
    if (!greets && game === 'chess' && Math.floor(t/3)%2===a.gameSlot-2 && t%3<.8) {
      const right=a.gameSlot===2;
      r(ctx,color,right?x+5:x-10,y-12,6,3); r(ctx,'#e4bb91',right?x+10:x-12,y-14,3,3);
    }
    if (!greets && game === 'pingpong') {
      const top=a.gameSlot===0,swing=Math.sin(t*Math.PI/0.8+(top?0:Math.PI))>0?2:0,handY=top?y+1:y-18;
      r(ctx,color,x+5,y-9,3,top?12:5); r(ctx,'#e4bb91',x+5-swing,handY,4,3);
      r(ctx,'#77563f',x+7-swing,handY,2,5); r(ctx,top?'#d96952':'#efc66c',x+5-swing,handY+(top?3:-3),6,4);
    }
    if (!greets && game === 'tea') {
      // A bite every couple of seconds: chopsticks up with a har gow, then back to the cup.
      const bite = Math.sin(t * 2.2 + a.i) > .55;
      r(ctx,'#e4bb91',x+5,bite?y-15:y-8,3,3); r(ctx,'#5a3b2a',x+7,bite?y-19:y-11,1,7);
      if (bite) r(ctx,'#f4ebd8',x+4,y-17,4,3); else { r(ctx,'#eee4c7',x-10,y-8,4,4); r(ctx,'#c99a64',x-10,y-8,4,1); }
    }
    if (!greets && game === 'buy') { const push = Math.floor(t * 2 + a.i) % 3 === 0; r(ctx,color,x-8,y-14,push?7:4,3); r(ctx,'#e4bb91',x-(push?10:9),y-15,3,3); }
    if (!greets && game === 'soda') {
      const sip = (t + a.i) % 4 < 1; r(ctx,color,x+5,y-(sip?16:12),3,sip?8:6); r(ctx,'#d96952',x+5,y-(sip?20:14),3,5); r(ctx,'#f4ebd8',x+5,y-(sip?20:14),3,1);
      if (sip) for (let j = 0; j < 2; j++) r(ctx,'#ffffffb0',x+7+j*2,y-24-((t*8+j*3)%6),1,1);
    }
    if (!greets && game === 'sing') {
      r(ctx,color,x+5,y-14,3,6); r(ctx,'#e4bb91',x+4,y-16,3,3); r(ctx,'#2f3a3c',x+2,y-18,3,4); r(ctx,'#2f3a3c',x+3,y-14,1,4);
      const k = (t * 1.5) % 2; text(ctx, k < 1 ? '♪' : '♫', x + 10 + Math.round(k * 3), y - 26 - Math.round(k * 6), 8, '#e58fb0');
    }
    if(!greets && game==='cheer' && a.gameSlot===36 && C.funOffsets?.bbq) {
      const up=Math.floor(t*2)%2; r(ctx,color,x-9,y-16-up*3,4,8);r(ctx,'#e4bb91',x-10,y-18-up*3,4,3);
      r(ctx,'#fff6dc',x-10,y-22-up*3,5,5);r(ctx,'#e8963a',x-9,y-20-up*3,3,3);
    } else if (!greets && game === 'cheer') {
      const up = Math.floor(t * 3 + a.i) % 2; r(ctx,color,x-8,y-(up?20:14),3,8); r(ctx,color,x+5,y-(up?14:20),3,8);
      r(ctx,'#ffe066',x-8,y-(up?26:20),2,6); r(ctx,'#7ad7ff',x+6,y-(up?20:26),2,6);
    }
    // 11-05 her morning: brushing her teeth at the clinic basin, then shaking cat food into the bowl before she leaves.
    if (!greets && game === 'brush') { const scrub = Math.floor(t * 8) % 2; r(ctx, '#7ad7ff', x + 4 + scrub, y - 15, 5, 1); r(ctx, '#ffffff', x + 3 + scrub, y - 16, 2, 2); if (Math.floor(t * 3) % 2) r(ctx, '#ffffffd0', x + 8, y - 19, 2, 2); }
    // 1st of the month: off to the vet for flea and worm treatment, a carrier with both cats peering out of the grille.
    if (boss && !mv && sim.bossPlan?.kind === 'vet') { r(ctx, '#8c6447', x + 5, y - 11, 13, 9); r(ctx, '#d1ad83', x + 6, y - 10, 11, 7); r(ctx, '#3e4b47', x + 8, y - 9, 7, 5); r(ctx, '#e8963a', x + 9, y - 8, 2, 2); r(ctx, '#f4f1e6', x + 12, y - 8, 2, 2); r(ctx, '#d1ad83', x + 10, y - 9, 1, 5); r(ctx, '#d1ad83', x + 13, y - 9, 1, 5); r(ctx, '#5a4636', x + 9, y - 13, 6, 2); if (Math.floor(t / 2) % 3 === 0) text(ctx, '哈！', x + 20, y - 16, 6, '#b5473a'); }
    if (!greets && game === 'catbath') { const rub = Math.floor(t * 6) % 2; r(ctx, '#e4bb91', x - 9 + rub * 2, y - 11, 3, 3); r(ctx, '#ffffff', x - 10 + rub * 2, y - 13, 2, 2); }
    if (!greets && game === 'catfood') { const tip = Math.floor(t * 2) % 2; r(ctx, '#d9564d', x + 4, y - 16 + tip, 5, 7); r(ctx, '#efc66c', x + 5, y - 14 + tip, 3, 2); for (let j = 0; j < 3; j++) r(ctx, '#8c6447', x + 8 + (j % 2), y - 8 + ((t * 12 + j * 3) % 6 | 0), 1, 1); }
    if (!greets && game === 'book') {
      r(ctx,'#77563f',x-7,y-11,14,9); r(ctx,'#fff4d5',x-6,y-10,12,6); r(ctx,'#b58c63',x,y-10,2,7);
      if ((t + a.i * 3) % 9 < 1.2) text(ctx,'💡',x+9,y-26,8,'#efc66c');
    }
    if (!greets && game === 'water') { const tip = Math.sin(t * 2) > 0 ? 1 : 0; r(ctx,color,x+5,y-12,3,5); r(ctx,'#7aa3b8',x+7,y-12+tip,7,5); r(ctx,'#7aa3b8',x+14,y-12+tip,4,1); r(ctx,'#5d8aa0',x+8,y-14+tip,4,2); }
    if (!greets && game === 'cat') { r(ctx,color,x+5,y-10,3,7); r(ctx,'#e4bb91',x+6,y-4 + (Math.floor(t * 3) % 2),3,3); }
    if (!greets && game === 'movie') { r(ctx,'#f4f1e6',x-10,y-11,6,7); r(ctx,'#d96952',x-10,y-11,1,7); r(ctx,'#d96952',x-7,y-11,1,7); r(ctx,'#ffe9a0',x-10,y-13,6,2); r(ctx,'#e4bb91',x-6,y-15+(Math.floor(t*1.3+a.i)%3?0:2),3,3); }
    if (!greets && game === 'dance') {
      const b = Math.floor(t * 3 + a.i) % 4, l = b % 2 ? 2 : -1;
      r(ctx,'#34483e',x-5,y-2,4,3+l); r(ctx,'#34483e',x+2,y-2,4,3-l);
      r(ctx,color,x-8,y-(b<2?20:12),3,8); r(ctx,color,x+5,y-(b<2?12:20),3,8);
      r(ctx,'#e4bb91',x-8,y-(b<2?22:6),3,3); r(ctx,'#e4bb91',x+5,y-(b<2?6:22),3,3);
    }
    if (!greets && game === 'claw') {
      const tap = Math.sin(t * 5 + a.i) > 0 ? 1 : 0;
      r(ctx,color,x-6,y-17,3,6); r(ctx,'#e4bb91',x-6,y-19-tap,3,3); r(ctx,color,x+3,y-17,3,6); r(ctx,'#e4bb91',x+3,y-19,3,3);
    }
    if (!greets && game === 'run') {
      const l = Math.sin(t * 14 + a.i) > 0 ? 2 : -2;
      r(ctx,'#34483e',x-5,y-2,4,3+l); r(ctx,'#34483e',x+2,y-2,4,3-l);
      r(ctx,color,x-8,y-10-l,3,5); r(ctx,color,x+5,y-10+l,3,5);
    }
    if (!greets && game === 'lift') {
      const up = Math.sin(t * 2.6 + a.i) > 0, hy = up ? y - 24 : y - 13;
      r(ctx,color,x-8,hy+3,3,up?12:4); r(ctx,color,x+5,hy+3,3,up?12:4);
      for (const hx of [x-9, x+4]) { r(ctx,'#3e4b47',hx-1,hy,7,2); r(ctx,'#3e4b47',hx-2,hy-1,2,4); r(ctx,'#3e4b47',hx+5,hy-1,2,4); }
    }
    if (!greets && game === 'box') {
      const jab = Math.sin(t * 6 + a.i) > .3;
      r(ctx,color,x+4,y-14,jab?8:4,3); r(ctx,'#ba5045',x+(jab?11:7),y-15,4,4);
      r(ctx,'#ba5045',x-9,y-15,4,4);
    }
    if (!greets && game === 'yoga') {
      const reach = Math.sin(t * 1.2 + a.i) > 0 ? 2 : 0;
      r(ctx,color,x-8,y-22-reach,3,10); r(ctx,color,x+5,y-22-reach,3,10);
      r(ctx,'#e4bb91',x-7,y-25-reach,3,3); r(ctx,'#e4bb91',x+4,y-25-reach,3,3);
    }
    if (!boss && !a.visitor && sim.napping?.(a)) {
      // Asleep: eyes shut, head nodding a pixel, a zZz rising every three seconds.
      const nod = Math.sin(t * 1.4 + a.i) > .3 ? 1 : 0, k = (t + a.i * .7) % 3;
      r(ctx, '#e3b58d', x - 4, y - 14 + nod, 9, 3); r(ctx, '#273a34', x - 4, y - 13 + nod, 3, 1); r(ctx, '#273a34', x + 2, y - 13 + nod, 3, 1);
      text(ctx, 'z', x + 7, y - 24 - k * 3, 6, '#45534b'); if (k > 1) text(ctx, 'Z', x + 11, y - 30 - k * 2, 8, '#45534b'); if (k > .5) text(ctx, 'z', x + 9, y - 27 - k * 2, 7, '#45534b');
    }
    if (!greets && game === 'massage') {
      r(ctx,'#e3b58d',x-4,y-14,9,3); r(ctx,'#273a34',x-3,y-13,2,1); r(ctx,'#273a34',x+2,y-13,2,1); r(ctx,'#c98a6a',x-1,y-11,3,1);
      const w = Math.floor(t * 3) % 2; text(ctx, w ? '~' : '≈', x - 12, y - 18, 7, '#8a7268'); text(ctx, w ? '≈' : '~', x + 12, y - 20, 7, '#8a7268');
    }
    if (!greets && game === 'nap') { r(ctx,'#e3b58d',x-4,y-14,8,4); r(ctx,'#544c3a',x-3,y-13,3,2); text(ctx,'z',x+7,y-25-(t%3)*2,8,'#45534b'); }
    if (!greets && game === 'read') { r(ctx,'#77563f',x-7,y-11,14,9); r(ctx,'#fff4d5',x-6,y-10,12,6); r(ctx,'#b58c63',x,y-10,2,7); }
    // Pool: the swimmer is in up to the chest, arms taking turns; a deckchair regular wears shades and holds a drink.
    if (!greets && game === 'swim') { const k=Math.floor(t*2+a.i)%2; r(ctx,'#9ccfe0',x-10,y-9,20,10); r(ctx,'#c4e6f0',x-10,y-9,20,1); r(ctx,'#e4bb91',x+(k?6:-9),y-13,3,3); r(ctx,'#ffffffb0',x-12+((t*6)%4|0),y-9,3,1); r(ctx,'#ffffffb0',x+8-((t*6)%4|0),y-7,3,1); }
    if (!greets && game === 'lounge') { r(ctx,'#2f3a3c',x-5,y-15,10,2); r(ctx,'#efc66c',x+6,y-12,3,5); r(ctx,'#d96952',x+6,y-13,3,1); }
    if (!greets && boss && game === 'sing') { const k=Math.floor(t*3)%2; r(ctx,'#2f3a3c',x+6,y-20,2,8); r(ctx,'#9aa3a0',x+5,y-23,4,4); r(ctx,'#e4bb91',x+5,y-14,3,3); text(ctx,'♪',x+12,y-28-(t*3%3|0),7,k?'#e58fb0':'#ffe066'); }
    if (!greets && game === 'bossdance') { const k=Math.floor(t*4)%2; r(ctx,color,x+(k?5:-8),y-22,3,8); r(ctx,'#e4bb91',x+(k?5:-8),y-24,3,3); r(ctx,color,x+(k?-8:5),y-14,3,5); text(ctx,'♪',x+(k?10:-11),y-26-(t*3%3|0),6,'#b5473a'); }
    if (!greets && game === 'stroll') { r(ctx,'#e8963a',x-6,y-15,11,6); r(ctx,'#c8732a',x-3,y-15,1,6); r(ctx,'#c8732a',x,y-15,1,6); r(ctx,'#e8963a',x+3,y-19,5,5); r(ctx,'#e8963a',x+3,y-21,1,2); r(ctx,'#e8963a',x+7,y-21,1,2); r(ctx,'#2f3a3c',x+5,y-18,1,1); r(ctx,'#e8963a',x-9,y-14+(Math.floor(t*2)%2),3,2); r(ctx,'#e4bb91',x-7,y-11,3,3); r(ctx,'#e4bb91',x+4,y-11,3,3); }
    if (!greets && game === 'pick') { const up=Math.floor(t*1.5+a.i)%2; r(ctx,'#a97c52',x+5,y-9,8,5); r(ctx,'#52745e',x+6,y-11,3,2); r(ctx,'#d96952',x+9,y-11,3,2); r(ctx,'#e4bb91',x-7,y-(up?12:5),3,3); }
    if (!greets && game === 'checkup') { r(ctx,'#f4f1e6',x-9,y-14,4,6); r(ctx,'#d9564d',x-8,y-12,2,2); text(ctx,'+',x+8,y-24-(t%2|0),7,'#d9564d'); }
    if (boss && C.clinicDoctor && Core.distance(a,C.clinicDoctor)<1) { r(ctx,'#f4f1e6',x-6,y-12,12,9); r(ctx,'#3e4b47',x-3,y-12,1,6); r(ctx,'#3e4b47',x-3,y-6,4,1); r(ctx,'#9aa3a0',x,y-7,2,2); }
    if(!mv || mv.performances)eventPose(a,x,y,moving);
    // Eleven accessories: glasses, headset, twin pins, beret, bow, visor, film, scarf, antenna, mail cap.
    const i = boss ? 11 : C.lookIndex(a);
    if (i === 0) { r(ctx, '#3e4b47', x - 5, y - 14, 10, 1); r(ctx, '#3e4b47', x - 5, y - 14, 4, 4); r(ctx, '#b7d0b4', x - 4, y - 13, 2, 1); }
    if (i === 1) { r(ctx, color, x - 7, y - 19, 14, 2); r(ctx, '#697d74', x - 8, y - 16, 3, 6); r(ctx, '#697d74', x + 6, y - 16, 3, 6); }
    if (i === 2 || i === 3) { r(ctx, color, x + 2, y - 21, 4, 4); if (i === 3) r(ctx, '#eadfbe', x - 3, y - 20, 3, 3); }
    if (i === 4) { r(ctx, color, x - 7, y - 23, 14, 4); r(ctx, color, x - 3, y - 25, 7, 2); }
    if (i === 5) { r(ctx, '#e7c8c0', x - 8, y - 20, 5, 4); r(ctx, '#d89ca2', x - 3, y - 19, 3, 2); }
    if (i === 6) { r(ctx, '#314f4b', x - 6, y - 15, 12, 3); r(ctx, '#b3d2a9', x - 4, y - 15, 5, 1); }
    if (i === 7) { r(ctx, '#3f5351', x + 7, y - 8, 7, 9); r(ctx, '#e3dbc1', x + 8, y - 7, 2, 2); r(ctx, '#e3dbc1', x + 11, y - 3, 2, 2); }
    if (i === 8) { r(ctx, '#ebd7a7', x - 5, y - 10, 10, 2); r(ctx, '#ebd7a7', x + 3, y - 9, 3, 6); }
    if (i === 9) { r(ctx, '#66715d', x, y - 26, 1, 5); r(ctx, color, x - 1, y - 28, 3, 3); }
    if (i === 10) { r(ctx, color, x - 6, y - 23, 12, 5); r(ctx, '#eddca8', x - 8, y - 19, 16, 2); r(ctx, '#e6d2a7', x + 6, y - 5, 7, 5); }
    if(!mv && a.activity==='chef') {r(ctx,'#fff6dc',x-7,y-28,14,7);r(ctx,'#fff6dc',x-5,y-31,4,4);r(ctx,'#fff6dc',x+1,y-31,4,4);r(ctx,'#c9d4cf',x-6,y-22,12,2);}
    if (boss) { r(ctx, '#dcb159', x + 2, y - 22, 4, 3); r(ctx, '#5a4839', x - 7, y - 18, 3, 10);
      // Alice asked to be visibly in the office herself: a gold name tag over the boss.
      if (!mv) { ctx.font='5px "PingFang SC",system-ui,sans-serif'; const w=Math.ceil(ctx.measureText('老板 · 小试AI').width)+6; r(ctx,'#efc66c',x-w/2,y-35,w,7); r(ctx,'#8c3a2e',x-w/2,y-35,2,7); text(ctx,'老板 · 小试AI',x+1,y-29,5,'#5a3b2a'); } }
    // A visitor: a lanyard badge on the chest, a little camera in hand, and a sun hat on every other one.
    if (a.visitor && a.carry) item(a.carry, x + 7, y - 12);
    if (a.visitor) {
      if(!a.receptionGuest) speechBoxes.push({x:x-13,y:y-36,w:27,h:10});
      r(ctx, '#f3ead6', x - 2, y - 9, 4, 5); r(ctx, '#c85b4a', x - 2, y - 9, 4, 1); r(ctx, '#3b4440', x + 5, y - 7, 5, 4); r(ctx, '#d9e2dc', x + 7, y - 6, 2, 2);
      r(ctx, '#e3cf9a', x - 8, y - 22, 16, 2); r(ctx, '#e3cf9a', x - 5, y - 25, 10, 3); r(ctx, '#c85b4a', x - 5, y - 23, 10, 1);
      if(a.receptionGuest) {r(ctx,'#fff6dc',x-6,y+7,13,10);text(ctx,'客',x+1,y+15,6,'#8a4a3e');speechBoxes.push({x:x-6,y:y+7,w:13,h:10});}
      else if (hello && hello.visitor === a.id && t - hello.at > 0.8) { r(ctx, '#fff6dc', x - 13, y - 36, 27, 10); r(ctx, '#c85b4a', x - 13, y - 36, 27, 1); text(ctx, '大家好', x + 1, y - 28, 6, '#8a4a3e'); }
      else { r(ctx, '#fff6dc', x - 4, y - 36, 9, 10); r(ctx, '#c85b4a', x - 4, y - 36, 9, 1); text(ctx, '客', x + 1, y - 28, 6, '#8a4a3e'); }
    }
    if (!boss && a.status === 'unknown' && a.activity!=='quota') { r(ctx, '#edf0df', x - 4, y - 32, 9, 10); text(ctx, '?', x + 1, y - 24, 9, '#707971'); }
    if (!boss && !a.activity && a.status === 'waiting') {
      const blink = Math.sin(t * 5) > 0;
      r(ctx, blink ? '#d96952' : '#e4b292', x - 4, y - 33, 9, 10); text(ctx, '!', x, y - 25, 8, '#fff4d7');
      if (!moving && blink) { r(ctx, '#bd5142', x - 11, y - 9, 2, 3); r(ctx, '#bd5142', x - 14, y - 13, 2, 2); }
    }
    if (!boss && a.status === 'done' && doneAge < 2) for (let j = 0; j < 8; j++) {
      const angle = j * 2.4 + seed, phase = doneAge / 2;
      r(ctx, ['#d96952', '#ebce80', '#7bafa0'][j % 3], x + Math.cos(angle) * phase * 22, y - 25 - Math.sin(phase * Math.PI) * 18 + Math.sin(angle) * phase * 11, 2, 2);
    }
    if (!boss && a.i === 0 && a.badge) { r(ctx, '#f1d18d', x + 7, y - 30, 13, 10); text(ctx, a.badge, x + 13, y - 22, 7, '#5f5235'); }
  }

  // The group photo: about a second into a greeting, when every word and the visitor's reply are on screen, the
  // frame is copied into a keepsake with a caption strip, and offered as a polaroid in the corner. One per greeting.
  let photoAt = null, photoUrl = '', photoGeneration = 0;
  function takePhoto(hello) {
    const generation = photoGeneration;
    if (replay) return;
    const keep = document.createElement('canvas'); keep.width = canvas.width; keep.height = canvas.height + 90;
    const k = keep.getContext('2d'); k.imageSmoothingEnabled = false;
    k.fillStyle = '#f3eee2'; k.fillRect(0, 0, keep.width, keep.height); k.drawImage(canvas, 0, 0);
    k.fillStyle = '#fffdf6'; k.fillRect(0, canvas.height, keep.width, 90); k.fillStyle = '#786747'; k.fillRect(0, canvas.height, keep.width, 3);
    const nth = hello.kind === 'reception' ? '来洽谈的客人' : hello.kind === 'pose' ? '合照一张' : visitorsTotal !== null && !demo ? `第 ${visitorsTotal} 位客人来了` : '有客人来了';
    const when = `${beijing(now()).toISOString().slice(0, 10)} ${formatClock(now())}`;
    k.fillStyle = '#4b3b24'; k.font = '26px Georgia, "Songti SC", serif'; k.textAlign = 'left'; k.fillText(`像素办公室 · ${nth}${demo ? '（演示）' : ''}`, 24, canvas.height + 38);
    k.fillStyle = '#8e6642'; k.font = '18px Menlo, monospace'; k.fillText(`${when} · ${hello.kind === 'reception' ? '洽谈合照' : hello.kind === 'pose' ? '大家都看镜头了' : '大家回头说了声你好'}`, 24, canvas.height + 70);
    k.textAlign = 'right'; k.font = '18px Georgia, "Songti SC", serif'; k.fillStyle = '#8e6642'; k.fillText('我的AI小木屋', keep.width - 24, canvas.height + 70);
    keep.toBlob(blob => {
      if (!blob || replay || generation !== photoGeneration) return;
      photoBlob = blob;
      const reader = new FileReader();
      reader.onload = () => {
        if (replay || generation !== photoGeneration) return;
        photoUrl = String(reader.result); $('#photo-img').src = photoUrl;
        $('#photo-text').textContent = hello.kind === 'reception' ? '谈完了，留张洽谈合照' : hello.kind === 'pose' ? '来，合照拍好了' : hello.visitor && guest ? '刚才大家回头跟你打招呼，拍下来了' : '刚才大家回头打了个招呼，拍下来了';
        photoReady = true; // the card waits until the greeting is over, so it never covers the moment itself
      };
      reader.readAsDataURL(blob);
    }, 'image/png');
  }
  let photoBlob = null, photoReady = false, photoTimer = null;
  async function savePhoto() {
    if (!photoBlob) return;
    const file = new File([photoBlob], `像素办公室-合照-${beijing(now()).toISOString().slice(0, 10)}.png`, { type: 'image/png' });
    try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: '像素办公室' }); return; } } catch (e) { if (e?.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = photoUrl; a.download = file.name; document.body.append(a); a.click(); a.remove();
  }
  $('#photo-save').addEventListener('click', savePhoto);
  $('#photo-close').addEventListener('click', () => { $('#photo').hidden = true; });
  function draw() {
    if (!sim) return;
    // The wallpaper always shows the ground floor alone (11-10, Alice): stretching to the whole tower for a reception, an argument or a call made it a thin strip on the desktop. ?annex=1 still shows the whole building.
    const started = performance.now(); speechBoxes = []; nameplates = [];
    if (mv) {
      // The MV draws the room every frame through its camera, the two lights of a dusk or night change blended.
      const L = mv.light(elapsed), v = mv.view(elapsed); light = L.w > .5 ? L.b : L.a;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = mv.palette(elapsed)[0]; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(v.s, 0, 0, v.s, v.ox, v.oy); ctx.imageSmoothingEnabled = false;
      room(ctx, L.a); if (L.w > 0) { ctx.globalAlpha = L.w; room(ctx, L.b); ctx.globalAlpha = 1; }
      OfficeMV.drawUnder(ctx, sim, { C, r }, elapsed);
    } else {
      const hour = beijing(now()).getUTCHours(), nextLight = hour >= 23 || hour < 8 ? 'night' : hour >= 17 ? 'dusk' : 'day';
      if (nextLight !== light) { light = nextLight; room(); }
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(backdrop, 0, 0); ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.imageSmoothingEnabled = false;
    }
    sceneUnder();
    if((!mv || mv.performances) && sim.radarCardNow()) {
      r(ctx,'#baa17b',231,27,94,21);r(ctx,'#fff4d5',232,28,92,19);r(ctx,'#ba5045',277,27,3,3);
      text(ctx,`今日选题 ${sim.radarCardNow().n} 条`,278,41,8,'#6a4b30');
    }
    const onDesks = sim.deskTreatNow();
    if (onDesks) for (const a of sim.actors) if (!['away', 'off'].includes(a.status) && a.i !== 10) item(onDesks.kind, C.desks[a.i][0] + 15, C.desks[a.i][1] + 6);
    if(!mv || mv.performances) for(const f of sim.foodNow()){const a=sim.actors.find(a=>a.id===f.id);item(f.kind,C.desks[a.i][0]+(f.kind==='cloud'?-7:f.kind==='papers'?1:-20),C.desks[a.i][1]+6);}
    [...sim.actors, ...sim.visitors, ...(sim.reception ? [sim.reception.visitor] : []), ...(sim.guard ? [sim.guard] : []), { ...sim.boss, boss: true }].sort((a, b) => a.y - b.y).forEach(a => person(a, a.boss));
    {
      sceneOver();
      if(!mv)drawGate(true);
      drawReceptionSpeech();
      if(!mv || mv.performances)drawEvents();
      ctx.font = '7px "PingFang SC",system-ui,sans-serif';
      nameplates = C.nameplates([...sim.actors.filter(a=>(mv && !mv.performances) || !(sim.argue?.phase==='smoke' && sim.argue.ids.includes(a.id))),...sim.visitors,...(sim.reception ? [sim.reception.visitor] : []),...(sim.guard ? [sim.guard] : []),{...sim.boss,boss:true}].filter(a=>!(sim.inBed?.(a) || (!mv && a.activity==='quota' && sim.chargeBed?.() && C.distance(a,sim.chargeBed())<1))), value=>ctx.measureText(value).width, mv ? speechBoxes : [...speechBoxes,{x:70,y:262,w:64,h:23},{x:33,y:333,w:30,h:8}]);
      // Leaders first, then opaque labels: a later leader must never cross another name.
      for(const p of nameplates) {
        const center=Math.round(p.x+p.w/2);
        if(center!==p.footX || p.y!==p.footY+6) {
          r(ctx,'#b59b72',Math.min(center,p.footX),p.footY+5,Math.abs(center-p.footX)+1,1);
          r(ctx,'#b59b72',center,p.footY+5,1,p.y-p.footY-4);
        }
      }
      for(const p of nameplates) {
        r(ctx,'#b59b72',p.x,p.y,p.w,p.h); r(ctx,'#fff6dc',p.x+1,p.y+1,p.w-2,p.h-2);
        r(ctx,p.color,p.x+2,p.y+3,3,5); text(ctx,p.name,p.x+7,p.y+8,7,'#253334','left');
      }
    }
    const latest = sim.notices.at(-1);
    if (mv && latest && !sim.radarCardNow()) { r(ctx, '#fff0c9', 231, 57, 94, 12); text(ctx, `${formatClock(Date.parse(latest.at))}  ${Array.from(latest.text).slice(0, 8).join('')}`, 278, 65, 6, '#6c6149'); }
    if (!mv) drawWallBoard();
    if (mv) {
      OfficeMV.drawOver(ctx, sim, { C, r, text, says: script.says }, elapsed, mv.light(elapsed));
      const dk = mv.darkness(elapsed);
      if (dk > 0) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = `rgba(8, 12, 22, ${dk.toFixed(3)})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      OfficeMV.updateDom(mvUI, mv, elapsed, formatClock);
    }
    const d = sim.delivery, holding = d?.phase === 'holding';
    $('#paper').hidden = !holding;
    if (holding) $('#paper-text').textContent = d.text;
    const reception=sim.reception;
    if(reception?.local && !mv && !wallMode && C.id==='portrait') {
      if(reception.venue==='meeting' && reception.visitor.y>=490 && !reception.followed) {$('#room-viewport').scrollTop=420*canvas.getBoundingClientRect().width/C.W;reception.followed=true;}
      if(reception.followed && (reception.venue!=='meeting' || reception.phase==='leaving' && reception.visitor.y<490) && !reception.returned) {$('#room-viewport').scrollTop=0;reception.returned=true;}
    }
    if(reception?.local && reception.phase==='handshake' && sim.time-reception.handshakeAt>=1 && !reception.photoTaken && !mv && !wallMode && !replay) {reception.photoTaken=true;takePhoto({kind:'reception'});}
    const hello = sim.greeting();
    if (hello) greeted = true;
    if (hello && !String(hello.kind || '').startsWith('play-') && !sim.reception && !mv && !wallMode && !replay && sim.time - hello.at >= 1.3 && photoAt !== hello.at) { photoAt = hello.at; takePhoto(hello); }
    if (!replay && !hello && photoReady && sim.reception?.phase!=='handshake') { photoReady = false; $('#photo').hidden = false; clearTimeout(photoTimer); photoTimer = setTimeout(() => { $('#photo').hidden = true; }, 30_000); }
    if (sim.time - lastUI >= .5 || paused) { updateUI(); lastUI = sim.time; }
    metrics.push(performance.now() - started); if (metrics.length > 300) metrics.shift();
  }
  function drawReceptionSpeech() {
    const speech=sim.receptionSpeech(); if(!speech || mv && !mv.performances)return;
    const a=speech.id==='boss'?sim.boss:[...sim.actors,sim.reception.visitor,sim.guard].find(a=>a?.id===speech.id);if(!a)return;
    ctx.font='8px \"PingFang SC\",system-ui,sans-serif'; const w=ctx.measureText(speech.text).width+12, x=Math.max(20,Math.min(C.W-w-20,a.x-w/2)),y=a.y-64;
    speechBoxes.push({x,y,w,h:14});r(ctx,'#786747',x,y,w,14);r(ctx,'#fff6dc',x+1,y+1,w-2,12);text(ctx,speech.text,x+w/2,y+10,8,'#6a4b30');r(ctx,'#b59b72',a.x,y+14,1,15);
  }
  // A sheet that goes up while the page is open swings on its pin twice and stops; the ones already there at load,
  // a new day or a rewound demo never swing.
  let sheetSim=null,sheetSeen=0,sheetBorn=[];
  function drawWallBoard() {
    const b=wallBoard();
    if(sheetSim!==sim || b.sheets<sheetSeen || sheetBorn.some(at=>at>sim.time)) {sheetSim=sim;sheetBorn=[];}
    else for(let j=sheetSeen;j<b.sheets;j++)sheetBorn[j]=sim.time;
    sheetSeen=b.sheets;
    for(let j=0;j<b.sheets;j++) {
      const x=236+j%4*21,y=41+Math.floor(j/4)*14,color=['#fff0c9','#d9e3c6','#edc4a2','#f3e6b2'][j%4];
      const sway=sheetBorn[j]===undefined?0:Core.swayAt(sim.time-sheetBorn[j],calm.matches);
      if(sway) {
        // Hung from the pin: each row slides a whole pixel further the lower it is.
        const at=row=>Math.round(sway*(row+1)/11);
        for(let row=0;row<11;row++)r(ctx,color,x+at(row),y+row,16,1);
        r(ctx,'#b9b194',x+3+at(5),y+5,10,1); r(ctx,'#c1b597',x+3+at(8),y+8,7,1);
      } else {
        r(ctx,color,x,y,16,11);
        r(ctx,'#b9b194',x+3,y+5,10,1); r(ctx,'#c1b597',x+3,y+8,7,1);
      }
      r(ctx,b.recent && j===b.sheets-1 && sim.time%1.6<.4?'#d9564d':'#a56c4b',x+7,y-1,2,3);
    }
    if(b.extra)text(ctx,`+${b.extra}`,323,36,6,'#fff3cf','right');
  }
  const leisureLabel = kind => ({cook:'做饭',chop:'切菜',eat:'吃饭 · 涮锅撸串',grill:'烤串',buy:'小卖部',soda:'喝汽水',massage:'按摩中',sing:'K 歌中',cheer:'K 房捧场',book:'阅读室',water:C.bands?'浇菜':'浇花',cat:'撸猫',swim:'游泳',lounge:'池边晒太阳',pick:'摘菜',checkup:'医务室 · 体检',movie:'黑匣子剧场 · 看戏看片',dance:'跳舞机',claw:'抓娃娃',tea:'饮茶',run:'健身中',lift:'健身中',box:'健身中',yoga:'健身中',arcade:'游戏室',pingpong:'打乒乓',chess:'下棋中',nap:'打盹',read:'看书'})[kind] || '';
  // Today's total at work, shown once it reaches a minute: "今日 1h 05m".
  function workedLabel(ms) {
    const minutes = Math.floor((Number(ms) || 0) / 60000);
    if (minutes < 1) return '';
    return minutes < 60 ? `今日 ${minutes}m` : `今日 ${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
  }
  function duration(a) {
    const seconds = Math.max(0, Math.floor((now() - Date.parse(a.statusSince || new Date(now()).toISOString())) / 1000));
    return seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`;
  }
  function buildRoster() {
    const n = currentRoster.length; $('#team-tab span').textContent = String(n); document.querySelectorAll('#drawer-toggle small').forEach(el => { if (/位伙伴/.test(el.textContent)) el.textContent = `${n} 位伙伴`; });
    $('#roster').replaceChildren();
    if (C.bossSpots && !mv) {
      // The boss's own line at the top of the drawer: what she is up to right now (her day is Core BOSS_DAY).
      const li = document.createElement('li'); li.className = 'member boss-row'; li.dataset.id = '__boss';
      const icon = document.createElement('span'); icon.className = 'avatar'; icon.style.setProperty('--actor', '#dcb159');
      const name = document.createElement('span'); name.className = 'member-name'; name.textContent = '老板 · 小试AI';
      const work = document.createElement('span'); work.className = 'member-work';
      const meta = document.createElement('span'); meta.className = 'member-meta'; const status = document.createElement('span'); status.className = 'status'; meta.append(status);
      li.append(icon, name, work, meta); $('#roster').append(li);
    }
    for (const a of sim.actors) {
      const li = document.createElement('li'); li.className = 'member'; li.dataset.id = a.id;
      const icon = document.createElement('span'); icon.className = 'avatar'; icon.style.setProperty('--actor', a.color);
      const name = document.createElement('span'); name.className = 'member-name'; name.textContent = a.name;
      const badge = document.createElement('small'); name.append(badge);
      const work = document.createElement('span'); work.className = 'member-work';
      const meta = document.createElement('span'); meta.className = 'member-meta';
      const status = document.createElement('span'); status.className = 'status';
      const time = document.createElement('time'); time.className = 'duration'; meta.append(status, time); li.append(icon, name, work, meta); $('#roster').append(li);
    }
  }
  function updateUI() {
    if(replay)updateReplayUI();
    $('#clock').textContent = formatClock(now()); $('#lighting').textContent = { day: '窗边有光', dusk: '留一盏暖灯', night: '深夜值班室' }[light];
    const waiting = sim.actors.filter(a => a.status === 'waiting').length, busy = sim.actors.filter(a => a.status === 'busy').length;
    $('#room-caption').textContent = waiting ? `${waiting} 位伙伴，有事等你拍板` : busy ? '键盘声里，点子正在长大' : '这一刻，办公室很安静';
    const visiting = sim.visitors.filter(v => v.phase === 'touring').length;
    $('#occupancy').textContent = `${busy} 在忙 / ${waiting} 等你` + (visiting ? ` / ${visiting} 参观` : '')
      + (wallRoom && stats && !demo ? ` · 来过 ${stats.visitorsTotal} 位 · 礼物 ${stats.treatsTotal} · 开过会 ${stats.meetingsTotal}` : '');
    // The guest book total sits in the always-visible status line: most people never open the drawer or scroll to the
    // annex board. Live office only; the demo's numbers are made up.
    const book = $('#guestbook'), total = !demo && Number.isInteger(visitorsTotal) ? visitorsTotal : null;
    book.hidden = total === null; if (total !== null) book.textContent = `来过 ${total.toLocaleString('zh-CN')} 位客人`;
    if (!waiting && !busy && visiting) $('#room-caption').textContent = '有人进来参观了';
    const bossRow = document.querySelector('#roster li[data-id="__boss"] .status'); if (bossRow) bossRow.textContent = sim.bossLabel?.() || '';
    if (sim.scene.meeting) $('#room-caption').textContent = C.id==='landscape'?'会议室在开会':'楼下在开会';
    if (sim.greeting()) $('#room-caption').textContent = '来人了，大家回头打了个招呼';
    const thanks = sim.thanksNow(), carrier = sim.visitors.find(v => v.carry);
    if (carrier) $('#room-caption').textContent = `有人拎着${TREAT_NAMES[carrier.carry]}来探班了`;
    if (thanks) $('#room-caption').textContent = thanks.kind === 'dimsum' ? `请吃${sim.feast?.night ? '夜宵' : '早茶'}，大家去茶楼开席` : `${TREAT_NAMES[thanks.kind]}到了，大家说谢谢`;
    const tally = Object.entries(treatsToday).filter(([, n]) => n > 0).map(([k, n]) => `${TREAT_NAMES[k]} ×${n}`).join('、');
    if (!waiting && !busy && !thanks && !carrier && !sim.greeting() && !sim.scene.meeting && tally) $('#room-caption').textContent = `今天收到 ${tally}`;
    const m=sim.reception;if(m) {const names=m.hosts.map(id=>sim.actors.find(a=>a.id===id)?.name).join(' 和 '); $('#room-caption').textContent=m.phase==='leaving'||m.phase==='handshake'?'谈完了，送客':m.mode==='closed'?'下班了，明天再来':m.mode==='tea'?'先喝杯茶，稍坐一会儿':m.phase==='arriving'?`有客人来洽谈，${names} 去接待`:m.venue==='pantry'?'茶水位在谈事':C.id==='landscape'?'会议室在谈事':'楼下在谈事';}
    // Whoever has something going sits on top: waiting for her, then at work, then just finished; the rest keep desk order.
    const rank = { waiting: 0, busy: 1, done: 2, unknown: 3, idle: 4, away: 5, off: 6 };
    const order = [...sim.actors].sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || a.i - b.i).map(a => a.id);
    const list = $('#roster');
    if (list.dataset.order !== order.join()) { list.dataset.order = order.join(); const byId = new Map([...list.children].map(li => [li.dataset.id, li])); for (const id of order) { const li = byId.get(id); if (li) list.append(li); } }
    for (const li of list.children) {
      if (li.dataset.id === '__boss') continue; // the boss row is written above
      const a = sim.actors.find(a => a.id === li.dataset.id);
      li.querySelector('.status').textContent = a.activity === 'gate' ? '安检中' : a.activity === 'handoff-walk' ? '递活中' : a.activity === 'quota' ? (mv ? '额度用完 · 罚站中' : (C.chargePod?'额度用完 · 进充电房充电':'额度用完 · 回休息室充电')) : a.activity === 'argue' ? '互审争论中' : a.activity === 'souvenir' ? '出差归来 · 分特产' : a.activity === 'radar' ? '雷达归来 · 贴选题' : a.activity === 'snack' ? '交活请客中' : a.activity === 'melon' ? '吃瓜中' : a.activity === 'reception' ? '接待中' : a.activity === 'call' ? '通话中' : a.activity === 'meeting' ? '开会中' : a.badge === '等派活' && a.status === 'idle' ? '等派活' : sim.feastSpot?.(a) ? (sim.feast?.night ? '吃夜宵' : '吃早茶') : a.status === 'off' && !mv && a.awayPost!=='kitchen' ? '打盹中 · 随叫随到' : a.status==='idle' && a.gameSlot===36 && sim.gameActivity(a)==='cheer' ? '烧烤 · 碰杯' : a.status==='idle' && [39,40].includes(a.gameSlot) && sim.gameActivity(a)==='eat' ? `吃${C.dishOf(a.id)[1]} · ${C.dishOf(a.id)[0]}` : a.status==='idle' && [37,38].includes(a.gameSlot) && sim.gameActivity(a) ? `做${C.dishOf(a.id)[1]}` : a.status==='idle' && a.gameSlot===35 && sim.gameActivity(a)==='eat' ? '涮火锅' : a.status === 'idle' && leisureLabel(sim.gameActivity(a)) ? leisureLabel(sim.gameActivity(a)) : a.activity==='chef' ? (sim.chefActivity(a)==='grill'?'后勤主厨 · 烤串':'后勤主厨 · 做饭') : a.status === 'away' && a.awayLabel ? a.awayLabel : labels[a.status];
      li.querySelector('.status').className = `status status-${a.status}`;
      li.querySelector('.duration').textContent = duration(a);
      li.querySelector('small').textContent = a.i === 0 && a.badge ? `${a.badge} 会话` : '';
      li.querySelector('.member-work').textContent = workedLabel(a.workedToday);
    }
    const board=wallBoard();
    $('#notice-count').textContent = sim.notices.length;
    $('#wall-board').setAttribute('aria-label',`公告板${board.count===null?'':`，今天 ${board.count} 张纸条`}，点开手记`);
    $('#guest-notices').hidden=!(guest && !demo && boardRequested);
    $('#guest-notices').textContent='公告板的纸条只在本人内网地址可见'+(board.count===null?'':`，今天共 ${board.count} 张`);
    const timelineKey=JSON.stringify([events,stats,demo,visitorsTotal]);
    if ($('#events').dataset.key !== timelineKey) {
      $('#events').dataset.key=timelineKey; $('#events').replaceChildren();
      for(const e of [...events].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))) {
        const words=C.eventText(e,currentRoster) || '记录了一件事';
        const li=document.createElement('li'), time=document.createElement('time'), body=document.createElement('span');
        time.dateTime=e.at; time.textContent=formatClock(Date.parse(e.at)); body.textContent=words; li.append(time,body); $('#events').append(li);
      }
      $('#today .empty').hidden=!!$('#events').children.length; $('#event-count').textContent=$('#events').children.length;
      $('#totals').textContent=`${demo?'演示 · ':''}${boardLines(false).join('；')}`;
    }
    const key = JSON.stringify(sim.notices);
    if ($('#notices').dataset.key !== key) {
      $('#notices').dataset.key = key; $('#notices').replaceChildren(); $('#board .empty').hidden = sim.notices.length > 0;
      for (const n of [...sim.notices].reverse()) {
        const li = document.createElement('li'), time = document.createElement('time'), body = document.createElement('span');
        time.dateTime = n.at; time.textContent = `${beijing(Date.parse(n.at)).toISOString().slice(5, 10)} · ${formatClock(Date.parse(n.at))}`; body.textContent = n.text; li.append(time, body); $('#notices').append(li);
      }
    }
  }
  function modeBanner() {
    $('#history-tab').hidden=demo || wallMode || mvMode || !historyAvailable;
    const key = `${demo}:${guest}:${view}`; if (key === modeKey) return; modeKey = key;
    $('#mode-text').textContent = demo ? `演示模式 · 模拟数据${view && view !== 'hero' ? ' · 场景预览' : ''}` : guest ? '实时状态 · 访客视角' : '本机状态 · 每 10 秒更新';
    $('#mode').classList.toggle('live', !demo);
    $('#board-tab').hidden=guest && !demo;
    if (guest && !demo && !$('#board').hidden) $('#today-tab').click();
  }
  function resetDemo() {
    historyAvailable=false;
    demo = true; elapsed = 0; cursor = 0; cycle = 0; visitorsTotal = null;
    // ?at=HH:MM starts the demo at that Beijing time (handy to see the boss's day, e.g. ?demo=1&at=20:45).
    const atMatch = /^(\d{1,2}):(\d{2})$/.exec(params.get('at') || ''), atBase = atMatch && +atMatch[1] < 24 ? Date.parse('2026-11-01T00:00:00+08:00') + (+atMatch[1] * 60 + +atMatch[2]) * 60000 : null;
    wallBase = atBase ?? Date.parse(params.get('night') === '1' || view === 'night-guard' ? '2026-11-01T15:00:00Z' : view === 'kitchen' ? '2026-11-01T04:00:00Z' : view === 'bbq' ? '2026-11-01T12:30:00Z' : view === 'breakfast' ? '2026-11-01T00:30:00Z' : ['nap','feast'].includes(view) ? '2026-11-01T15:30:00Z' : '2026-11-01T02:00:00Z');
    currentRoster = script.roster; sim = C.create(currentRoster, seed, C.id); sim.eventsEnabled=!mv || mv.performances;
    stats = mv ? mv.stats : structuredClone(script.stats || null); events = []; treatsToday = {}; noticesToday=undefined;
    if (!mv) sim.setScene(demoScene(script.scene),now());
    if (mv) mv.start(sim);
    else for (const a of script.roster) { sim.setStatus(a.id, a.status, new Date(wallBase).toISOString()); sim.actors.find(x => x.id === a.id).badge = a.badge || ''; }
    // ?view=breakfast / leisure: everyone but the director off duty, so the teahouse and gym fill up (script events skipped this lap).
    if (!mv && ['breakfast','leisure','fun','kitchen','bbq'].includes(view)) { for (const a of sim.actors) if (a.i !== 0 && !sim.isCourier(a)) sim.setStatus(a.id, 'idle'); cursor = Infinity; sim.funFirst = view === 'fun'; }
    if(!mv && ['kitchen','bbq'].includes(view)) for(const a of sim.actors) if(a.awayPost==='kitchen') sim.setStatus(a.id,'away');
    // Scene previews for the tower (also the recruitment film): put idle colleagues where the shot needs them first.
    // read: the two book seats in the 3F reading room; arcade: fill the game room first (brand intro shots).
    const FIRST={read:[25,26],arcade:[0,1,2,3,4,5,8,9,20,21],clinic:[45,41,42,43],pool:[41,42,43,44],cat:[44,41],farm:[27,28,25,26],orders:[]};
    if(!mv && C.bands && FIRST[view]) { for (const a of sim.actors) if (!sim.isCourier(a)) sim.setStatus(a.id, a.awayPost==='kitchen'?'away':view==='orders'&&a.i!==0?'busy':'idle'); cursor = Infinity; sim.leisureFirst=FIRST[view]; if (view==='clinic') { sim.bossTarget=C.clinicDoctor; const g=sim.actors.find(a=>/grok|scout/.test(a.id)); if (g && C.chargePod) sim.setQuota({[g.id]:new Date(now()+40*60000).toISOString()},now()); } }
    // ?view=nap / feast: 23:30, everyone but CC asleep in the office; feast sends dim sum right away.
    if (!mv && ['nap','feast'].includes(view)) { for (const a of sim.actors) if (a.i !== 0) sim.setStatus(a.id, a.awayLabel ? 'away' : 'off'); cursor = Infinity; sim.night = true; if (view === 'feast') sim.treat('dimsum', new Date(wallBase).toISOString()); }
    lastUI = -10; light = ''; buildRoster(); modeBanner();
  }
  function atBaseOf() { const m=/^(\d{1,2}):(\d{2})$/.exec(params.get('at') || ''); return m && +m[1] < 24 ? Date.parse('2026-11-01T00:00:00+08:00') + (+m[1] * 60 + +m[2]) * 60000 : null; }
  function demoScene(value) {
    const s={...C.emptyScene(),...value};
    if(s.meeting) s.meeting={...s.meeting,since:sim.scene.meeting?.since || new Date(now()).toISOString(),roundAt:sim.scene.meeting?.round===s.meeting.round ? sim.scene.meeting.roundAt : new Date(now()).toISOString()};
    for(const kind of ['souvenir','radar','gate'])if(s[kind])s[kind]={...s[kind],at:s[kind].at || new Date(now()).toISOString()};
    if(s.snack)s.snack={...s.snack,at:s.snack.at || new Date(now()).toISOString()};
    if(s.supper)s.supper={...s.supper,at:s.supper.at || new Date(now()).toISOString()};
    if(s.call) s.call={...s.call,since:s.call.since || new Date(now()).toISOString()};
    if(s.guard) s.guard={...s.guard,at:new Date(wallBase).toISOString()};
    return s;
  }
  function advance(ms) {
    if (!sim) return;
    if(replay){replay.step(ms);events=replay.events;elapsed+=ms;return;}
    // Hidden tabs freeze simulation time; wall-clock expiry still applies when their queue resumes.
    if(!demo && !mv) {sim.meetQueue=sim.meetQueue.filter(m=>Date.now()-Date.parse(m.at)<120000);sim.clockBase=Date.now()-sim.time*1000;sim.pruneEvents(Date.now());}
    for (let left = ms; left > 0; left -= 20) {
      const part = Math.min(left, 20);
      if (mv) { mv.tick(elapsed, sim); events=mv.events; elapsed += part; sim.night=C.isNight(now()); sim.step(part * mv.pace(elapsed)); mv.observe(elapsed, sim); continue; }
      if (demo && view==='orders' && C.bands) {
        // ?view=orders: CC takes three orders in a row so the paper plane, the drone and the cat each get a turn.
        sim.bossTarget=C.bossDesk;
        for (const [at,status] of [[800,'busy'],[3000,'idle'],[3600,'busy'],[5000,'idle'],[5600,'busy'],[22000,'idle']]) if (elapsed>=at && elapsed<at+part) sim.setStatus(sim.actors.find(a=>a.i===0).id,status,new Date(now()).toISOString());
      }
      if (demo) {
        const local = elapsed - cycle * script.duration * 1000;
        sim.setVisitors(local >= 12_000 && local < 42_000 ? 1 : local >= 44_000 && local < 90_000 ? 3 : 0);
        if (local >= 20_000 && local < 20_000 + part) sim.treat(['milktea', 'dimsum', 'coffee', 'cake', 'melon'][cycle % 5], new Date(wallBase + elapsed).toISOString());
        if (local >= script.receptionAt * 1000 && local < script.receptionAt * 1000 + part) {
          const at=new Date(wallBase+elapsed).toISOString();sim.meet(Object.keys(C.MEET_NAMES)[cycle%4],at);
          if(stats) {stats.meetsTotal=(stats.meetsTotal||0)+1;stats.today.meets=(stats.today.meets||0)+1;}events.push({kind:'reception',at});
        }
        while (cursor < script.events.length && script.events[cursor].at * 1000 <= local) {
          const e = script.events[cursor++];
          if(e.night) wallBase=Date.parse('2026-11-01T15:00:00Z')+cycle*86400000-elapsed;
          const at = new Date(wallBase + elapsed).toISOString();
          if (e.notice) sim.notice({ text: e.notice, at });
          else if (e.id) sim.setStatus(e.id, e.status, at);
          if(e.quota)sim.setQuota(Object.fromEntries(Object.entries(e.quota).map(([id,min])=>[id,new Date(now()+min*60000).toISOString()])),now());
          if(e.scene) sim.setScene(demoScene({...sim.scene,...e.scene}),now());
          for(const event of e.log || []) if(event.kind !== 'guard' || C.isNight(now())) {events.push({...event,at});if(stats && event.kind==='gate'){const k=event.ok?'gatesPassed':'gatesBlocked',n=event.ok?1:(e.scene?.gate?.n || 1);stats[k+'Total']+=n;stats.today[k]+=n;}if(stats && ['snack','supper','souvenir','radar'].includes(event.kind)){const k=event.kind+'s';stats[k+'Total']++;stats.today[k]++;}}
          events=events.slice(-500);
        }
      }
      elapsed += part; sim.night=C.isNight(now()); sim.step(part);
      if (demo && elapsed >= (cycle + 1) * script.duration * 1000) {
        cycle++; cursor = 0; events=[]; wallBase=(atBaseOf()??Date.parse(params.get('night')==='1'||view==='night-guard'?'2026-11-01T15:00:00Z':'2026-11-01T02:00:00Z'))+cycle*86400000-elapsed;sim.setQuota({},now()); sim.setScene(demoScene(script.scene),now());
        for (const a of script.roster) sim.setStatus(a.id, a.status, new Date(now()).toISOString());
      }
    }
  }
  function validateState(data) {
    if (!data || data.demo !== false || (data.guest !== undefined && data.guest !== true) || !Array.isArray(data.roster) || data.roster.length < 1 || data.roster.length > 11 || !Array.isArray(data.notices) || data.notices.length > 20 || (data.visitors !== undefined && !(Number.isInteger(data.visitors) && data.visitors >= 0 && data.visitors <= 100000)) || (data.visitorsTotal !== undefined && !(Number.isInteger(data.visitorsTotal) && data.visitorsTotal >= 0 && data.visitorsTotal <= 1e9)) || (data.treats !== undefined && !(Array.isArray(data.treats) && data.treats.length <= 10 && data.treats.every(t => t && Object.hasOwn(TREAT_NAMES,t.kind) && Number.isFinite(Date.parse(t.at)))))) throw new Error('Invalid state');
    if(data.meets!==undefined && !(Array.isArray(data.meets) && data.meets.length<=10 && data.meets.every(m=>m && Object.hasOwn(C.MEET_NAMES,m.kind) && typeof m.at==='string' && Number.isFinite(Date.parse(m.at))))) throw new Error('Invalid state');
    // Shapes, character sets, lengths and date ranges all checked here, so nothing downstream has to trust the feed.
    const ids = new Set(), slots = new Set(), sane = t => { const v = Date.parse(t); return Number.isFinite(v) && v > 946684800000 && v < 4102444800000; };
    data.roster.forEach((a, i) => { if (!a || typeof a !== 'object') throw new Error('Invalid role'); const slot = a.desk ?? i; if (typeof a.id !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(a.id) || ids.has(a.id) || typeof a.name !== 'string' || !a.name.length || a.name.length > 40 || !/^#[0-9a-f]{6}$/i.test(a.color) || !Object.hasOwn(labels,a.status) || !sane(a.statusSince) || !Number.isInteger(slot) || slot < 0 || slot > 10 || slots.has(slot) || (a.courier !== undefined && typeof a.courier !== 'boolean') || (a.look !== undefined && !(Number.isInteger(a.look) && a.look >= 0 && a.look <= 11)) || (a.badge !== undefined && (typeof a.badge !== 'string' || a.badge.length > 16)) || (a.awayPost !== undefined && a.awayPost !== 'kitchen') || (a.awayLabel !== undefined && (typeof a.awayLabel !== 'string' || a.awayLabel.length > 16)) || (a.workedToday !== undefined && !(Number.isFinite(a.workedToday) && a.workedToday >= 0 && a.workedToday <= 86400000))) throw new Error('Invalid role'); ids.add(a.id); slots.add(slot); });
    if (data.roster.filter(a=>a.courier===true).length>1) throw new Error('Invalid role');
    if (data.notices.some(n => !n || typeof n.text !== 'string' || n.text.length > 500 || !sane(n.at))) throw new Error('Invalid notice');
    return C.validateSceneFields(data);
  }
  // Where the live office answers when this page is served elsewhere (GitHub Pages): a read-only guest feed behind a
  // path-limited public proxy. Same desks and statuses, no board. Unreachable (machine asleep) means the demo plays.
  const GUEST_API = 'https://mac-mini.tail791fb9.ts.net:8443/office/api/state';
  let guest = false, guestApi = GUEST_API;
  // A visitor on the public page is drawn in the office: the page keeps a random tag for this tab (no identity, no
  // cookie) and says hello with each poll while the live office answers. The tab closing is the visitor leaving.
  let visitorTag = '', visitorsTotal = null, treatsToday = {};
  const TREAT_NAMES = C.TREAT_NAMES, seenTreats = new Set(), seenMeets = new Set(), localMeets = new Set();
  let pendingMeet=null;
  function receiveMeets(meets) {
    for(const m of meets) if(!seenMeets.has(m.at)) {const age=Date.now()-Date.parse(m.at),local=localMeets.has(m.at);if(age<0&&!local)continue;seenMeets.add(m.at);if(local || age<120000) sim.meet(m.kind,m.at,local,age);}
    while(seenMeets.size>128)seenMeets.delete(seenMeets.values().next().value);
  }
  async function sendMeet(kind) {
    if(replay)return;
    const note=$('#meet-note'),buttons=[...document.querySelectorAll('#meet-menu button')];
    $('#meet-menu').hidden=true;$('#meet-toggle').setAttribute('aria-expanded',false);
    if(demo) {const at=new Date(now()).toISOString();sim.meet(kind,at,true);note.textContent='演示接待 · 只在这页播放';return;}
    buttons.forEach(b=>b.disabled=true);pendingMeet=kind;
    try {
      const target=guest?guestApi.replace(/api\/state$/,'meet'):new URL('guest/meet',location.href);
      const response=await fetch(target,{method:'POST',mode:'cors',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({kind,v:visitorTag}),signal:AbortSignal.timeout(6000)});
      if(response.status===429)note.textContent='刚谈过，5 分钟后再来';
      else if(!response.ok)throw new Error(String(response.status));
      else {const {at}=await response.json();C.validateSceneFields({roster:currentRoster,meets:[{kind,at}]});localMeets.add(at);while(localMeets.size>128)localMeets.delete(localMeets.values().next().value);if(!replay)receiveMeets([{kind,at}]);note.textContent='来意收到了，等空闲的伙伴接待';}
    } catch {note.textContent='没约上，办公室这会儿没接上';}
    finally {pendingMeet=null;buttons.forEach(b=>b.disabled=false);}
  }
  // Treats sent from this page: the office answers with the time it was filed, which marks it as already shown here.
  async function sendTreat(kind) {
    if(replay)return;
    const target = guest ? guestApi.replace(/api\/state$/, 'treat') : new URL('guest/treat', location.href);
    const note = $('#treat-note'), buttons = [...document.querySelectorAll('#treat-menu button')];
    buttons.forEach(b => { b.disabled = true; });
    try {
      const r = await fetch(target, { method: 'POST', mode: 'cors', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, v: visitorTag }), signal: AbortSignal.timeout(6000) });
      if (r.status === 429) { note.textContent = '一分钟送一次就够啦，他们还没喝完'; }
      else if (!r.ok) throw new Error(String(r.status));
      else { const { at } = await r.json(); seenTreats.add(at); if(!replay)sim.treat(kind, at); note.textContent = `${TREAT_NAMES[kind]}送出去了，看他们走过去`; }
    } catch { note.textContent = demo ? '演示模式里送不出去，等办公室醒着再来' : '没送到，办公室这会儿没接上'; }
    $('#treat-menu').hidden = true; $('#treat-toggle').setAttribute('aria-expanded', false);
    setTimeout(() => { buttons.forEach(b => { b.disabled = false; }); note.textContent = ''; }, 60_000);
  }
  // A page that got no greeting (its visitor tag was already known: a reload within 45 s) still gets a welcome;
  // and anyone can ask for a photo at any time, the team turns to the camera.
  let greeted = false, welcomeTimer = null;
  $('#pose').addEventListener('click', () => { if (!sim || replay) return; sim.wave('pose'); $('#pose').disabled = true; setTimeout(() => { $('#pose').disabled = false; }, 5000); });
  $('#meet-toggle').addEventListener('click',()=>{if(replay)return;const menu=$('#meet-menu');menu.hidden=!menu.hidden;$('#meet-toggle').setAttribute('aria-expanded',!menu.hidden);$('#treat-menu').hidden=true;$('#treat-toggle').setAttribute('aria-expanded',false);});
  document.querySelectorAll('#meet-menu button').forEach(b=>b.addEventListener('click',()=>sendMeet(b.dataset.kind)));
  // 找到我: opens a small menu of links and handles; any other menu button closes it, and it closes the others.
  // Optional chaining on purpose: for up to ten minutes after a deploy a cached older index.html (no 找到我 button) can meet
  // this script; a throw here once left 探班 dead for a visitor (11-03).
  $('#find-toggle')?.addEventListener('click',()=>{ for(const id of ['treat','meet','play']){$(`#${id}-menu`).hidden=true;$(`#${id}-toggle`).setAttribute('aria-expanded',false);} const menu=$('#find-menu'); if(!menu)return; menu.hidden=!menu.hidden; $('#find-toggle').setAttribute('aria-expanded',!menu.hidden); });
  for(const id of ['treat','meet','play','pose']) $(`#${id}${id==='pose'?'':'-toggle'}`)?.addEventListener('click',()=>{ const m=$('#find-menu'); if(m){m.hidden=true; $('#find-toggle')?.setAttribute('aria-expanded',false);} });
  $('#treat-toggle').addEventListener('click', () => { if(replay)return;$('#meet-menu').hidden=true;$('#meet-toggle').setAttribute('aria-expanded',false); const menu = $('#treat-menu'); menu.hidden = !menu.hidden; $('#treat-toggle').setAttribute('aria-expanded', !menu.hidden); });
  document.querySelectorAll('#treat-menu button').forEach(b => b.addEventListener('click', () => sendTreat(b.dataset.kind)));
  // 一起玩: page-local performances; party/song/cat scroll to the fun floor.
  const PLAY_NOTES = {party:'大家跟你下楼玩了', song:'K 房开唱了', cheer:'大家喊了声「冲！」', cat:'橘猫开饭了'}, playUsed = {};
  $('#play-toggle').addEventListener('click',()=>{ if(replay)return; for(const id of ['treat','meet']){$(`#${id}-menu`).hidden=true;$(`#${id}-toggle`).setAttribute('aria-expanded',false);} const menu=$('#play-menu'); menu.hidden=!menu.hidden; $('#play-toggle').setAttribute('aria-expanded',!menu.hidden); });
  document.querySelectorAll('#play-menu button').forEach(b=>b.addEventListener('click',()=>{
    const kind=b.dataset.kind, note=$('#treat-note');
    if(replay || !sim)return; if(playUsed[kind] && sim.time-playUsed[kind]<20){note.textContent='刚玩过，等一会儿';return;}
    if(!sim.play(kind)){note.textContent='这会儿玩不了';return;}
    playUsed[kind]=sim.time; note.textContent=PLAY_NOTES[kind]; $('#play-menu').hidden=true; $('#play-toggle').setAttribute('aria-expanded',false);
    if(kind!=='cheer') setTimeout(()=>$('#room-viewport').scrollTo({top:$('#room-viewport').scrollHeight,behavior:calm.matches?'auto':'smooth'}),1500);
  }));
  try { visitorTag = sessionStorage.getItem('office-visitor') || ''; } catch { /* storage may be unavailable */ }
  if (!/^[a-f0-9]{16}$/.test(visitorTag)) {
    visitorTag = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');
    try { sessionStorage.setItem('office-visitor', visitorTag); } catch { /* fine without */ }
  }
  // Where this tab came from, worked out once and sent along with the hello (the office keeps a per-day tally, never
  // shown on the page). A shared link may carry ?from=xhs; otherwise the in-app browser's name, then the referrer.
  // The ?from= is taken off the address bar right away, so a guest copying the link passes on a clean one.
  let visitorSource = '';
  try { visitorSource = sessionStorage.getItem('office-source') || ''; } catch { /* fine without */ }
  if (!/^[a-z]{1,12}$/.test(visitorSource)) {
    const params = new URLSearchParams(location.search), from = (params.get('from') || '').toLowerCase();
    const ua = navigator.userAgent || '';
    let ref = ''; try { ref = document.referrer ? new URL(document.referrer).hostname : ''; } catch { /* none */ }
    const byRef = [[/(^|\.)(t\.co|x\.com|twitter\.com)$/, 'x'], [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'], [/xiaohongshu|xhslink/, 'xhs'], [/weixin|wechat|qq\.com$/, 'wechat'], [/weibo/, 'weibo'], [/douyin/, 'douyin'], [/bilibili|b23\.tv/, 'bilibili'], [/github/, 'github'], [/google|bing|baidu|sogou|so\.com|duckduckgo/, 'search']];
    visitorSource = /^[a-z]{1,12}$/.test(from) ? from
      : /xhsdiscover|xiaohongshu/i.test(ua) ? 'xhs' : /MicroMessenger/i.test(ua) ? 'wechat' : /Twitter/i.test(ua) ? 'x' : /Weibo/i.test(ua) ? 'weibo' : /aweme|Douyin/i.test(ua) ? 'douyin' : /BiliApp/i.test(ua) ? 'bilibili' : / QQ\//.test(ua) ? 'qq'
      : (byRef.find(([re]) => re.test(ref)) || [, ref && ref !== location.hostname ? 'other' : 'direct'])[1];
    try { sessionStorage.setItem('office-source', visitorSource); } catch { /* fine without */ }
    if (params.has('from')) { params.delete('from'); try { history.replaceState(null, '', location.pathname + (params.size ? '?' + params : '') + location.hash); } catch { /* keep it */ } }
  }
  function sayHello() {
    if (!guest || forced || wallMode) return;
    fetch(guestApi.replace(/api\/state$/, 'visit') + '?v=' + visitorTag + '&s=' + visitorSource, { mode: 'cors', cache: 'no-store', signal: AbortSignal.timeout(6000) }).catch(() => {});
  }
  async function fetchState() {
    const sameOrigin = new URL('api/state', location.href);
    for (const [url, isGuest] of [[sameOrigin, false], [GUEST_API, true]]) {
      try {
        const response = await fetch(url, { cache: 'no-store', mode: 'cors', signal: AbortSignal.timeout(isGuest ? 6000 : 2500) });
        if (!response.ok) continue;
        const data = validateState(await response.json());
        guest = isGuest || data.guest === true; guestApi=String(url); if(guest) data.notices=[]; return data;
      } catch { /* next source */ }
    }
    throw new Error('Unavailable');
  }
  // One missed poll (the office restarting, a phone network blip) must not throw the page into the demo, where the
  // scripted team is doing something else; three misses in a row (30 s) mean the office is really gone.
  let misses = 0;
  const rosterIdentity = roster => JSON.stringify(roster.map((a,i)=>[a.id,a.desk??i,a.look,a.courier,a.name,a.color,a.awayPost]));
  async function loadLive() {
    try {
      const data = await fetchState();
      // A page left open for days (the wallpaper) reloads itself when the office's own files change.
      if (!guest && typeof data.build === 'string') { if (!build) build = data.build; else if (data.build !== build) { location.reload(); return; } }
      misses = 0;
      latestLive=data;sayHello();
      if(replay)return;
      applyLive(data);
      if(!wallMode && !mvMode && Date.now()-historyLoadedAt>60000)void loadHistory();
    } catch { if(++misses>=3){historyAvailable=false;modeBanner();}if(!replay && (!sim || (!demo && misses>=3)))resetDemo(); }
    draw();
  }
  function applyLive(data,restoring=false) {
      if (demo || !sim || rosterIdentity(currentRoster) !== rosterIdentity(data.roster)) {
        demo = false; elapsed = 0; wallBase = Date.now(); currentRoster = data.roster; sim = C.create(currentRoster, seed, C.id); seen = new Set(data.notices.map(n => `${n.at}|${n.text}`));
        sim.notices = data.notices; buildRoster(); light = ''; lastUI = -10;
        const latest = data.notices.at(-1);
        if (latest && Date.now() - Date.parse(latest.at) < 20_000) sim.deliveries.push(latest);
      }
      for (const a of data.roster) { sim.setStatus(a.id, a.status, a.statusSince); Object.assign(sim.actors.find(x => x.id === a.id), { badge: a.badge || '', awayLabel: a.awayLabel || '', workedToday: a.workedToday || 0 }); }
      sim.clockBase=Date.now()-sim.time*1000;sim.receiveEventHistory(data.events || []);sim.setScene(data.scene,Date.now()); sim.setQuota(data.quota || {},Date.now()); noticesToday=data.noticesToday; stats=data.stats ?? null; events=data.events || [];
      sim.setVisitors(data.visitors || 0); visitorsTotal = data.stats?.visitorsTotal ?? data.visitorsTotal ?? null;
      if (!restoring && !welcomeTimer && !wallMode) welcomeTimer = setTimeout(() => { if (sim && !demo && !replay && !greeted && !sim.greeting() && !sim.thanksNow()) sim.wave('welcome'); }, 12_000);
      treatsToday = data.treatsToday || {};
      if(!pendingMeet)receiveMeets(data.meets || []); // defer during POST, so its poll cannot steal local photo ownership
      for (const t of data.treats || []) { if (!seenTreats.has(t.at)) { seenTreats.add(t.at); if (Date.now() - Date.parse(t.at) < 60_000) sim.treat(t.kind, t.at); } }
      for (const n of data.notices) { const key = `${n.at}|${n.text}`; if (!seen.has(key)) { seen.add(key); sim.deliveries.push(n); } }
      sim.notices = data.notices; seen = new Set(data.notices.map(n => `${n.at}|${n.text}`));
      modeBanner();
  }
  const historyURL = day => (guest ? guestApi.replace(/api\/state$/,'api/history') : new URL('api/history',location.href).href)+(day?'/'+day:'');
  async function loadHistory() {
    if(demo || wallMode || mvMode || historyLoading)return;
    historyLoading=true;historyLoadedAt=Date.now();
    try {
      const response=await fetch(historyURL(),{mode:'cors',cache:'no-store',signal:AbortSignal.timeout(6000)});
      if(!response.ok)throw new Error('Unavailable');
      const days=C.validateHistoryList(await response.json());
      historyAvailable=true;$('#history-days').replaceChildren();
      $('#history-note').textContent=days.length?'选一天，看看那天发生了什么':'还没有往日存档，每天零点存一份';
      for(const d of days) {
        const li=document.createElement('li'),button=document.createElement('button'),small=document.createElement('small');
        button.type='button';button.dataset.day=d.day;button.textContent=d.day;small.textContent=`${d.events} 件事 · ${d.timeline} 条座位记录`;
        button.append(small);button.addEventListener('click',()=>openReplay(d.day));li.append(button);$('#history-days').append(li);
      }
    } catch {historyAvailable=false;} finally {historyLoading=false;modeBanner();}
  }
  async function openReplay(day) {
    if(demo || wallMode || mvMode || !latestLive)return;
    try {
      const response=await fetch(historyURL(day),{mode:'cors',cache:'no-store',signal:AbortSignal.timeout(6000)});
      if(!response.ok)throw new Error('Unavailable');
      const data=C.validateHistory(await response.json(),latestLive.roster,day);
      if(!replay)savedLive={sim,currentRoster,elapsed};
      replay=C.createReplay(data,latestLive.roster,seed,C.id);sim=replay.sim;currentRoster=latestLive.roster;
      stats={since:day,today:{...data.stats.today}};events=[];treatsToday={};visitorsTotal=null;noticesToday=undefined;
      clearTimeout(welcomeTimer);welcomeTimer=null;photoGeneration++;photoReady=false;$('#photo').hidden=true;$('#treat-menu').hidden=true;$('#meet-menu').hidden=true;
      document.body.classList.add('replaying');$('#replay-banner').hidden=false;$('#replay-speed').value='240';
      $('#drawer').classList.remove('expanded');$('#drawer-toggle').setAttribute('aria-expanded','false');$('#room-viewport').scrollTop=0;
      buildRoster();light='';lastUI=-10;updateReplayUI();draw();fitRoom();
    } catch {$('#history-note').textContent='这份存档暂时读不到，请换一天';}
  }
  function updateReplayUI() {
    $('#replay-next').disabled=replay.ended;
    $('#replay-title').textContent='回放 · '+replay.day.slice(5);$('#replay-clock').textContent=formatClock(replay.clock);
    $('#replay-note').hidden=!replay.noTimeline && !replay.truncated;
    $('#replay-note').textContent=replay.noTimeline?'这天只记了事件，座位状态没记':replay.truncated?'这天座位记录达到上限，后段记录不完整':'';
    $('#replay-line').textContent=replay.line?(formatClock(Date.parse(replay.events.at(-1).at))+' '+replay.line):'';
  }
  $('#replay-speed').addEventListener('change',()=>{if(replay)replay.speed=Number($('#replay-speed').value);});
  $('#replay-next').addEventListener('click',()=>{if(replay){replay.next();updateReplayUI();draw();}});
  $('#replay-exit').addEventListener('click',()=>{
    if(!replay)return;
    sim=savedLive.sim;currentRoster=savedLive.currentRoster;elapsed=savedLive.elapsed;
    if(sim.layout.id!==C.id)sim=sim.relayout(C.id);
    replay=null;savedLive=null;document.body.classList.remove('replaying');$('#replay-banner').hidden=true;light='';lastUI=-10;
    if(latestLive)applyLive(latestLive,true);buildRoster();draw();fitRoom();
  });
  $('#drawer-toggle').addEventListener('click', () => {
    const expanded = $('#drawer').classList.toggle('expanded'); $('#drawer-toggle').setAttribute('aria-expanded', expanded);
  });
  for (const tab of ['team','board','today','history']) {
    $(`#${tab}-tab`).addEventListener('click', () => {
      for(const [key,panel] of [['team','roster'],['board','board'],['today','today'],['history','history']]) {
        $(`#${key}-tab`).classList.toggle('active',key===tab); $(`#${key}-tab`).setAttribute('aria-pressed',key===tab); $(`#${panel}`).hidden=key!==tab;
      }
      $('#drawer').classList.add('expanded'); $('#drawer-toggle').setAttribute('aria-expanded',true);
    });
  }
  // The game room's cabinets and the teahouse open the real playground games (visitors play them, the AIs only pretend).
  function hotspots() { return !mvMode && !wallMode; }
  const arcade=$('#arcade'), scrim=document.createElement('div');
  // Menus live at the top of the page (not inside the room) so no button, drawer or photo card can cover them; a
  // scrim behind them closes on any tap outside.
  scrim.className='scrim'; scrim.hidden=true; document.body.append(scrim,arcade,$('#showcase'));
  const syncScrim=()=>{ scrim.hidden=arcade.hidden && $('#showcase').hidden; };
  scrim.addEventListener('click',()=>{ arcade.hidden=true; $('#showcase').hidden=true; $('#hot-games').setAttribute('aria-expanded','false'); $('#hot-show').setAttribute('aria-expanded','false'); syncScrim(); });
  new MutationObserver(syncScrim).observe(arcade,{attributes:true,attributeFilter:['hidden']});
  $('#hot-games').addEventListener('click',()=>{ showcase.hidden=true; arcade.hidden=!arcade.hidden; $('#hot-games').setAttribute('aria-expanded',String(!arcade.hidden)); if(!arcade.hidden)arcade.querySelector('a').focus(); });
  const showcase=$('#showcase');
  new MutationObserver(syncScrim).observe(showcase,{attributes:true,attributeFilter:['hidden']});
  $('#hot-show').addEventListener('click',()=>{ arcade.hidden=true; showcase.hidden=!showcase.hidden; $('#hot-show').setAttribute('aria-expanded',String(!showcase.hidden)); if(!showcase.hidden)showcase.querySelector('a').focus(); });
  $('#showcase-close').addEventListener('click',()=>{ showcase.hidden=true; $('#hot-show').setAttribute('aria-expanded','false'); $('#hot-show').focus(); });
  $('#arcade-close').addEventListener('click',()=>{ arcade.hidden=true; $('#hot-games').setAttribute('aria-expanded','false'); $('#hot-games').focus(); });
  document.addEventListener('keydown',e=>{ if(e.key!=='Escape')return; if(!arcade.hidden) $('#arcade-close').click(); if(!$('#showcase').hidden) $('#showcase-close').click(); });
  $('#wall-board').addEventListener('click',()=>{
    boardRequested=true; $(`#${guest && !demo?'today':'board'}-tab`).click(); $('#drawer-body').scrollTop=0; updateUI();
  });
  function fitRoom() {
    if(C.id!=='landscape')return;
    // Fit the two upper storeys (420 rows) to the panel; the fun floor below is a short scroll away.
    const v=$('#room-viewport'); $('#canvas-wrap').style.width=`${Math.min(v.clientWidth,v.clientHeight*C.W/420)}px`;
  }
  function layoutUI() {
    const wide=C.id==='landscape'; document.body.classList.toggle('landscape',wide);
    if(wide)$('#drawer').insertBefore($('#treat'),$('.tabs')); else if(!mvMode && !wallMode) $('.room-section').insertBefore($('#treat'),$('#room-viewport')); else $('#canvas-wrap').append($('#treat'));
    $('#canvas-wrap').style.width=''; $('#room-viewport').scrollTop=0;
    if(funHint) funHint.textContent=C.bands?'↓ 二楼 · 三楼':'↓ 娱乐层';
    $('#room-viewport').setAttribute('aria-label',wide?'办公室全景：上两层同屏，往下滚是娱乐层':C.bands?'办公室三层楼，可上下滚动':'办公室、附楼和娱乐层，可上下滚动');
    canvas.setAttribute('aria-label',wide?'AI 伙伴在工位、游戏室、茶楼、健身房和会议室之间活动，楼下娱乐层有 K 房、阅读室、小花园、黑匣子剧场和小卖部。详细状态可在手记中阅读。':C.bands?'一楼是工位、游戏室、老板桌旁的会议室和累计木牌；二楼是热闹的 K 房、黑匣子剧场、小卖部、茶楼、自助厨房、烧烤、电话亭、健身房、泳池和猫窝；三楼安静，有阅读室、休息室、医务室和菜地。橘猫满楼跑。可上下滚动。':'AI 伙伴在工位、游戏室和老板桌之间活动。下方附楼有会议室、茶楼、休息室和健身房，再往下是娱乐层，可上下滚动。');
    for (const [id,rect] of [['#hot-show',{x:C.storageOffset[0]+258,y:C.storageOffset[1]+594,w:80,h:88}],['#hot-games',C.gameRect],['#hot-tea',C.teaOffset && {x:C.teaOffset[0],y:C.teaOffset[1],w:78,h:100}]]) {
      const el=$(id); el.hidden=!hotspots() || !rect; if(!rect)continue;
      Object.assign(el.style,{left:`${rect.x/C.W*100}%`,top:`${rect.y/C.H*100}%`,width:`${rect.w/C.W*100}%`,height:`${rect.h/C.H*100}%`});
    }
    const b=C.noticeRect,button=$('#wall-board'); button.hidden=mvMode || wallMode;
    Object.assign(button.style,{left:`${b.x/C.W*100}%`,top:`${b.y/C.H*100}%`,width:`${b.w/C.W*100}%`,height:`${b.h/C.H*100}%`});
    fitRoom();
  }
  landscapeQuery.addEventListener('change',()=>{
    const key=layoutKey(); if(C.id===key)return;
    C=withLayout(key); if(sim)sim=sim.relayout(key);if(replay)replay.sim=sim;
    canvas.width=backdrop.width=C.W*2; canvas.height=backdrop.height=C.H*2;
    light=''; lastUI=-10; layoutUI(); if(sim)draw();
  });
  new ResizeObserver(fitRoom).observe($('#room-viewport'));
  // "↓ 娱乐层": shown until the fun floor scrolls into view; one tap takes you there.
  const funHint=$('#to-fun'), viewport=$('#room-viewport');
  function syncFunHint(){ if(!funHint)return; const ratio=canvas.getBoundingClientRect().height/C.H, top=(C.funTop ?? (C.id==='landscape'?410:744))*ratio; funHint.hidden=mvMode||wallMode||!C.funOffsets||viewport.scrollTop+viewport.clientHeight>top+40; }
  funHint?.addEventListener('click',()=>{ viewport.scrollTo({top:viewport.scrollHeight,behavior:calm.matches?'auto':'smooth'}); });
  viewport.addEventListener('scroll',syncFunHint,{passive:true}); new ResizeObserver(syncFunHint).observe(viewport); setTimeout(syncFunHint,500);
  layoutUI();
  function snapshot() {
    const sorted = [...metrics].sort((a, b) => a - b);
    return { ready, demo, kids: kids && {plan:kids.plan?.kind, teach:kids.teach && {id:kids.teach.id,where:kids.teach.where}, out:kidsOut(), list:kids.map(c=>({k:c.k,x:Math.round(c.x),y:Math.round(c.y),moving:c.path.length>0}))}, orders:orders.map(o=>({...o})), cats:cats&&cats.map(c=>({x:c.x,y:c.y,name:c.look.name})), gate:sim?.gate,replay:replay && {day:replay.day,clock:replay.clock,speed:replay.speed,skips:replay.skips,noTimeline:replay.noTimeline,ended:replay.ended}, handoffWalk:sim?.handoffWalk,handoffSpeech:sim?.handoffSpeech(),meetingBoard:C.meetingBoardText(stats,events),souvenir:sim?.souvenir,radar:sim?.radar,radarCard:sim?.radarCardNow(),argue:sim?.argue,snack:sim?.snack,melon:sim?.melon,quota:sim?.quotaEvent,supper:sim?.supper,food:sim?.foodNow(),eventSpeech:sim?.eventSpeech(),eventQueues:sim?.eventQueues,reception:sim?.reception && {...sim.reception,speech:sim.receptionSpeech()}, meetQueue:sim?.meetQueue, layout:C.id, logicalSize:[C.W,C.H], wallBoard:sim && wallBoard(), nameplates, speechBoxes, courierId:sim?.actors.find(sim.isCourier)?.id, requestedView: view, actualView: ['kitchen','bbq'].includes(view) && sim?.actors.some(a=>sim.chefActivity(a)===(view==='kitchen'?'cook':'grill')) && sim?.actors.some(a=>a.status==='idle' && (view==='kitchen'?[37,38,39,40]:[34,35,36]).includes(a.gameSlot) && sim.gameActivity(a)) ? view : view==='gate' && sim.gate?.phase==='signal' ? 'gate' : view==='handoff-walk' && ['pat','reply'].includes(sim.handoffWalk?.phase) ? 'handoff-walk' : view==='souvenir' && sim.souvenir?.phase==='delivering' ? 'souvenir' : view==='radar' && sim.radarCardNow() && sim.radar?.phase==='showing' ? 'radar' : view==='argue' && sim.argue?.phase==='smoke' ? 'argue' : view==='snack' && sim.snack ? 'snack' : view==='melon' && sim.melon && sim.melon.ids.every(id=>!sim.actors.find(a=>a.id===id).path.length) ? 'melon' : view==='quota' && sim.actors.some(a=>a.activity==='quota'&&!a.path.length) ? 'quota' : view==='supper' && sim.supper ? 'supper' : view==='reception' && sim.reception?.phase==='talking' ? 'reception' : view === 'games' && sim.actors.filter(a=>sim.gameActivity(a)).length>=6 ? 'games' : view === 'board' && stats ? 'board' : sim?.scene.meeting && sim.actors.filter(a=>a.activity==='meeting').every(a=>!a.path.length) && sim.actors.some(a=>a.activity==='meeting') ? 'meeting' : sim?.actors.some(a=>a.activity==='call' && !a.path.length) ? 'booth' : sim?.flights.length ? 'handoff' : view === 'night-guard' && sim?.guard ? 'night-guard' : sim?.delivery?.phase === 'holding' ? 'notice' : sim?.actors.some(a => a.status === 'waiting' && !a.path.length) ? 'queue' : 'hero', elapsed, seed, light, meetingSign:C.id!=='landscape' && !!sim?.scene.meeting, meetingLamp:C.id==='landscape' && !!sim?.scene.meeting, scene:sim?.scene, stats, events, flights:sim?.flightPoints(), pingPongBall:sim?.pingPongBall(), diskLayers:C.diskLayers(sim?.scene.disk), guard:sim?.guard && {x:sim.guard.x,y:sim.guard.y,lap:sim.guard.lap,moving:!!sim.guard.path.length}, dpr: devicePixelRatio, canvasScale: 2, actors: sim?.actors.map(a => ({ id: a.id, desk:a.i, look:C.lookIndex(a), courier:sim.isCourier(a), status: a.status, activity:a.activity, gameSlot:a.gameSlot, game:sim.gameActivity(a),chef:sim.chefActivity(a),awayPost:a.awayPost, standing:sim.meetingStanding(a.id), x: a.x, y: a.y, moving: a.path.length > 0, hop: hopOf(a, false) })), visitors: sim?.visitors.map(v => ({ id: v.id, phase: v.phase, listening:v.listening, x: v.x, y: v.y })), greeting: sim?.greeting() ? { ...sim.greeting() } : null, greetPose: sim && (sim.greeting() || sim.thanksNow()) ? Core.greetPose(sim.time - (sim.greeting() || sim.thanksNow()).at, calm.matches) : null, calm: calm.matches, sheetSway: sim ? sheetBorn.map(at => at === undefined ? 0 : Core.swayAt(sim.time - at, calm.matches)) : [], thanks: sim?.thanksNow() ? { ...sim.thanksNow() } : null, deskTreat: sim?.deskTreatNow() ? { ...sim.deskTreatNow() } : null, boss: sim && { x: sim.boss.x, y: sim.boss.y }, delivery: sim?.delivery && { phase: sim.delivery.phase, arrived: sim.delivery.arrived, text: sim.delivery.text }, notices: sim?.notices.length, delivered: sim?.delivered, renderP95Ms: sorted[Math.floor(sorted.length * .95)] || 0, mv: mv && { seconds: mv.seconds, clock: formatClock(now()), camera: mv.camera(elapsed), light: mv.light(elapsed), subtitle: mv.subtitle(elapsed), darkness: mv.darkness(elapsed), log: mv.log.length } };
  }
  window.__PLAYTEST__ = { get ready() { return ready; }, snapshot, mvLog: () => mv ? mv.log.slice() : null, setSeed(n) { seed = n >>> 0; if (demo) { resetDemo(); paused = true; draw(); } }, step(ms) { if (!Number.isFinite(ms) || ms < 0 || ms > 120000) throw new Error('Step must be 0–120000 ms'); paused = true; advance(ms); draw(); return snapshot(); } };
  async function start() {
    if (mvMode) {
      await new Promise((ok, fail) => { const s = document.createElement('script'); s.src = 'mv.js'; s.onload = ok; s.onerror = fail; document.head.append(s); });
      script = await (await fetch('mv-script.json')).json(); seed = script.seed ?? seed;
      mv = OfficeMV.create(script, C); mvUI = OfficeMV.mount(document);
      canvas.width = 1080; canvas.height = 1176; paused = params.get('hold') === '1'; // the recorder holds it and steps frame by frame
    } else script = await (await fetch('demo-script.json')).json();
    if (forced) resetDemo(); else await loadLive();
    if (mv && mvFrom) advance(mvFrom * 1000);
    // breakfast / leisure keep playing after the walk over (they show a routine, not one frozen moment).
    const routine = view && demo && ['breakfast','leisure','fun','nap','feast','kitchen','bbq'].includes(view);
    if (routine) advance(view === 'feast' ? 45000 : ['fun','kitchen','bbq'].includes(view) ? 40000 : 20000);
    else if (view && demo) { advance({ hero: 4000, queue: 20000, notice: 35000, meeting:73000, booth:112500, handoff:96500, 'handoff-walk':303400, board:73000, 'night-guard':8000, games:138000, reception:49000, argue:84500, snack:112500, melon:18000, quota:93000, supper:154000, gate:347000, souvenir:200000, radar:C.id==='landscape'?263000:266000 }[view]); paused = true; }
    if(['kitchen','bbq'].includes(view)) requestAnimationFrame(()=>{const origin=view==='kitchen'?C.kitchenOffset:C.funOffsets?.bbq;if(origin)viewport.scrollTop=Math.max(0,(origin[1]-(C.id==='landscape'?120:80))*canvas.getBoundingClientRect().width/C.W);});
    if (view === 'fun') requestAnimationFrame(() => { $('#room-viewport').scrollTop = $('#room-viewport').scrollHeight; });
    // Live hero uses real data; allow actors to reach their real target before the first shot.
    if (view === 'hero' && !demo) advance(7000);
    ready = true; draw();
    if (view === 'board') $('#today-tab').click();
    if(C.id==='portrait' && !wallMode && ['snack','melon','supper'].includes(view)) {const a=view==='supper'?sim.guard:sim.actors.find(a=>a.id===(view==='snack'?sim.snack?.id:view==='souvenir'?sim.souvenir?.id:sim.melon?.ids[0]));if(a)$('#room-viewport').scrollTop=Math.max(0,(a.y-130)*canvas.getBoundingClientRect().width/C.W);}
    if(view==='games' && C.id==='portrait') $('#room-viewport').scrollTop=Math.max(0,356*canvas.getBoundingClientRect().width/C.W-$('#room-viewport').clientHeight);
    if (C.bands && ['meeting','booth','board','night-guard','reception','argue','pool','farm','cat','clinic'].includes(view)) {
      // Tower: the meeting room and totals board are on the ground floor now; the rest sit a floor or two down.
      const y={meeting:250,reception:250,argue:250,board:250,booth:C.noBooth?0:C.boothOffset[1]+400,'night-guard':420,pool:C.poolOffset[1]-120,farm:C.funOffsets.garden[1]-160,cat:C.catOffset[1]-120,clinic:C.clinicOffset[1]-120}[view];
      $('#room-viewport').scrollTop=Math.max(0,y)*canvas.getBoundingClientRect().width/C.W;
    } else if (C.id!=='landscape' && ['meeting','booth','board','night-guard','reception','argue'].includes(view)) $('#room-viewport').scrollTop=420*canvas.getBoundingClientRect().width/C.W;
    setInterval(() => { if (!forced && (!paused || replay)) loadLive(); }, 10000);
    function frame(ts) {
      // One bad frame must not end the render loop: the next frame is always scheduled.
      try {
        if (ts - lastFrame >= 1000 / 30 - .5) {
          const dt = lastFrame ? Math.min(100, ts - lastFrame) : 33.333;
          lastFrame = ts;
          if (!paused && !document.hidden) advance(dt);
          draw();
        }
      } catch (e) { console.error('frame', e); }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  start().catch(() => { $('#mode-text').textContent = '办公室暂时没打开，请刷新重试'; });
})();
