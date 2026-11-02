/* All artwork is drawn here: no spritesheets, web fonts, or image requests. */
(() => {
  'use strict';
  const $ = s => document.querySelector(s), params = new URLSearchParams(location.search);
  const mvMode = params.get('mv') === '1', mvFrom = Math.max(0, Number(params.get('from')) || 0);
  // MV helpers also read desks/home: use the current portrait layout for the film.
  const Core=window.OfficeCore, landscapeQuery=matchMedia('(min-width:1000px) and (min-aspect-ratio:5/4)');
  const layoutKey=()=>mvMode?'portrait':params.get('wall')!=='1' && landscapeQuery.matches?'landscape':'portrait';
  const withLayout=key=>{const L=Core.layouts[key];return {...Core,...L,home:i=>Core.home(i,L),nameplates:(actors,measure,exclusions)=>Core.nameplates(actors,measure,exclusions,L)};};
  let C=withLayout(layoutKey());
  const canvas = document.querySelector('#office'), ctx = canvas.getContext('2d');
  const backdrop = document.createElement('canvas'); backdrop.width = C.W * 2; backdrop.height = C.H * 2; canvas.width = C.W * 2; canvas.height = C.H * 2;
  const bg = backdrop.getContext('2d');
  $('.room-section').append($('#photo'));
  const view = ['hero', 'queue', 'notice', 'meeting', 'booth', 'handoff', 'board', 'night-guard', 'games', 'reception', 'argue', 'snack', 'melon', 'quota', 'supper', 'souvenir', 'radar'].includes(params.get('view')) ? params.get('view') : null;
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
    for (const k in place) { const v = Number(params.get(k)); document.body.style.setProperty(`--${k}`, `${Number.isFinite(v) && v >= 0 && v <= 100 && params.has(k) ? v : place[k]}${k === 'wl' || k === 'ww' ? 'vw' : 'vh'}`); }
  }
  let mv = null, mvUI = null;
  const labels = { busy: '干活中', waiting: '等你拍板', done: '交活了', idle: '休息中', away: '出差中', off: '下班了', unknown: '信号不明' };
  let script, sim, demo = false, ready = false, seed = 7, elapsed = 0, cursor = 0, cycle = 0, paused = false, wallBase = Date.now(), lastUI = -10, light = '', currentRoster = [], seen = new Set(), modeKey = '', metrics = [], lastFrame = 0;
  const beijing = n => new Date(n + 8 * 3600000);
  const formatClock = n => beijing(n).toISOString().slice(11, 16);
  let stats = null, events = [], nameplates = [], speechBoxes = [], build = '', noticesToday, boardRequested=false;
  const now = () => mv ? mv.clock(elapsed) : demo ? wallBase + elapsed : Date.now();
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
    r(g, '#4c4d4050', x - 25, y + 17, 56, 10);
    r(g, '#77563f', x - 26, y + 4, 52, 18); r(g, '#a97c52', x - 26, y + 4, 52, 11); r(g, '#d1a272', x - 28, y, 56, 10); r(g, '#e0b786', x - 28, y, 56, 2);
    r(g, '#715543', x - 24, y + 17, 4, 8); r(g, '#715543', x + 20, y + 17, 4, 8);
    r(g, '#35474a', x - 12, y - 12, 24, 16); r(g, '#213b40', x - 10, y - 10, 20, 12); r(g, '#71a29a', x - 8, y - 8, 15, 1); r(g, '#5c8d83', x - 8, y - 5, 9, 1); r(g, '#90b8a3', x - 8, y - 2, 12, 1); r(g, '#394947', x - 2, y + 4, 4, 3);
    r(g, '#e1d8ba', x - 9, y + 9, 18, 4); r(g, '#768474', x - 7, y + 10, 14, 1); r(g, color, x + 18, y - 2, 5, 7); r(g, '#e2ceac', x + 23, y, 2, 3);
    r(g, '#d9b98b', x - 23, y + 34, 46, 9); text(g, owner?.name || '', x, y + 41, 7, '#574e3b');
  }
  // The room is cached on the backdrop for the office page; the MV draws it straight onto the canvas every frame
  // (through its camera, blending two lights), so it takes the target and the light as arguments.
  function room(g = bg, L = light) {
    if (g === bg) { bg.setTransform(2, 0, 0, 2, 0, 0); bg.clearRect(0, 0, C.W, C.H); }
    const sky = L === 'night' ? '#30465a' : L === 'dusk' ? '#dca879' : '#a5c6bf';
    r(g, '#a49b8640', 16, 16, 338, 396); r(g, '#6d725e', 10, 10, 340, 398); r(g, '#dedbc3', 14, 14, 332, 68);
    r(g, '#f1e7ce', 17, 17, 326, 62); r(g, '#c7c7ac', 14, 73, 332, 10); r(g, '#8c967d', 14, 79, 332, 5);
    r(g, '#b58c63', 14, 84, 332, 317);
    for (let y = 84; y < 401; y += 18) for (let x = 14 - ((y / 18 | 0) % 2) * 24; x < 345; x += 48) {
      const left = Math.max(14, x), width = Math.min(345, x + 47) - left;
      r(g, ((x + y) / 6 | 0) % 3 ? '#c9a27a' : '#d1ad83', left, y, width, 17);
      r(g, '#bd946c', left + 3, y + 12, Math.max(0, width - 9), 1);
    }
    r(g, '#8a785e', 14, 400, 332, 5); r(g, '#e5c498', 14, 397, 332, 3);
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
    C.desks.forEach(([x, y], i) => { if (i !== 10) desk(g, x, y, i); });
    // The bookshelf stays put; the little lounge becomes a game corner on the office page.
    r(g, '#775e45', 26, 173, 72, 29); r(g, '#9b7854', 28, 175, 68, 24);
    for (let j = 0; j < 9; j++) r(g, ['#7c9c84', '#d2b37e', '#ad7058', '#e1d2a6'][j % 4], 30 + j * 7, 178 + j % 3, 5, 17 - j % 3);
    gameFurniture(g);
    r(g, '#6d735b', 113, 267, 2, 20); r(g, '#ead3a2', 108, 262, 12, 7); r(g, '#7d7c60', 109, 287, 10, 2);
    // Boss desk, mail reception and front door.
    r(g, '#90755c35', 143, 350, 99, 47); r(g, '#82947b', 147, 347, 92, 45); r(g, '#9daa8c', 151, 351, 84, 37);
    r(g, '#775841', 149, 369, 88, 23); r(g, '#bf9568', 147, 365, 91, 15); r(g, '#dcba87', 147, 363, 91, 5); r(g, '#eddfb7', 180, 368, 25, 9); text(g, '小试AI', 192, 375, 7, '#665c44');
    r(g, '#f3e9c8', 155, 368, 16, 9); r(g, '#c7bc9a', 158, 370, 9, 1); r(g, '#c7bc9a', 158, 373, 7, 1); r(g, '#496f5d', 219, 367, 8, 8);
    placed(g,[C.desks[10][0]-308,C.desks[10][1]-339],()=>{
    r(g, '#865e43', 285, 340, 47, 23); r(g, '#c09a69', 282, 337, 51, 10); r(g, '#e5c595', 282, 337, 51, 2); text(g, '前 台', 307, 356, 7, '#f2e6c7'); r(g, '#f0e4c4', 312, 333, 14, 7); r(g, '#9da384', 313, 335, 12, 1);
    });
    r(g, '#556b5b', 329, 374, 17, 26); r(g, '#99a288', 330, 376, 16, 22); r(g, '#f5e3af', 333, 386, 2, 3); text(g, 'OUT', 334, 371, 5, '#5b6857');
    plant(g, 329, 94, true); plant(g, 32, 380, true); plant(g, 124, 200); plant(g, 271, 279);
    // A warm lamp pool is strictly decorative: no overlay on text or characters.
    if (L !== 'day') { g.fillStyle = L === 'night' ? '#323d6220' : '#e79e4120'; g.fillRect(14, 84, 332, 313); r(g, '#f9d98c', 109, 263, 10, 3); }
    annex(g);
  }

  function gameFurniture(g) {
    r(g,'#91a38a',22,260,166,78); r(g,'#dad7b4',24,262,162,74);
    text(g,'游戏角',95,278,7,'#45534b');
    for(const x of [24,48]) {
      r(g,'#35474a',x,260,20,29); r(g,'#739780',x+1,261,18,4);
      r(g,'#213b40',x+3,266,14,10); r(g,'#90b8a3',x+5,268,4,2);
      r(g,'#c2976b',x,278,20,6); r(g,'#d1ad83',x,278,20,2);
      r(g,'#33443f',x+4,276,2,5); r(g,'#d96952',x+3,275,4,3); r(g,'#efc66c',x+13,280,3,2);
      r(g,'#506b5b',x+2,284,16,7); r(g,'#213b40',x+8,286,5,2);
    }
    r(g,'#77563f',88,284,20,20); r(g,'#dfb987',88,284,20,16);
    for(let y=0;y<4;y++) for(let x=0;x<4;x++) r(g,(x+y)%2?'#9b7854':'#eee4c7',90+x*4,284+y*4,4,4);
    for(const [x,color] of [[26,'#739780'],[50,'#b397b8']]) {
      r(g,'#506b5b',x,318,20,14); r(g,color,x,314,20,15); r(g,color,x+3,312,14,3);
      r(g,'#d2d3b1',x+3,324,14,5);
    }
    r(g,'#77563f',138,308,4,12); r(g,'#77563f',170,308,4,12);
    r(g,'#35474a',136,276,40,40); r(g,'#527d72',138,278,36,36);
    r(g,'#c8d8bc',138,278,36,2); r(g,'#c8d8bc',138,312,36,2);
    r(g,'#c8d8bc',138,278,2,36); r(g,'#c8d8bc',172,278,2,36); r(g,'#90b8a3',155,280,1,32);
    r(g,'#33443f',134,295,44,3); r(g,'#eee4c7',134,294,44,2);
    for(let x=136;x<176;x+=4)r(g,'#9cbab1',x,296,2,2);
  }
  function gamesUnder() {
    for(const [j,x] of [24,48].entries()) {
      const active=sim.actors.some(a=>a.gameSlot===j+4 && sim.gameActivity(a)==='arcade');
      r(ctx,active && Math.floor(sim.time*3)%2?'#90b8a3':'#213b40',x+3,266,14,8);
      if(active) { const shift=Math.floor(sim.time*4)%4; r(ctx,'#efc66c',x+5+shift,268,3,3); r(ctx,'#f4ebd8',x+12,271-shift%2*2,2,2); }
      else r(ctx,'#739780',x+7,269,6,2);
    }
    const playing=sim.actors.some(a=>sim.gameActivity(a)==='chess'),turn=Math.floor(sim.time/3)%4;
    for(const [x,y,c] of [[92,286,'#33443f'],[100,294,'#fff4d5'],[playing?92+turn*4:96,290,'#33443f']]) r(ctx,c,x,y,2,2);
  }

  function wingFloor(g) {
      r(g,'#6d725e',346,10,284,398); r(g,'#f1e7ce',350,14,276,65);
      r(g,'#c7c7ac',346,73,280,10); r(g,'#8c967d',346,79,280,5);
      r(g,'#c9a27a',346,84,280,313);
      for(let y=84;y<397;y+=18) {r(g,'#b58c63',346,y,280,1);for(let x=354+(y%36?24:0);x<626;x+=48)r(g,'#b58c63',x,y,1,Math.min(18,397-y));}
      r(g,'#8a785e',346,400,280,5); r(g,'#e5c498',346,397,280,3);
      if(light!=='day')r(g,light==='night'?'#323d6220':'#e79e4120',346,84,280,313);
  }
  function annex(g) {
    if (C.id!=='landscape') {
    // Downstairs: a narrow passage leaves the original room through a new south doorway.
    r(g,'#6d725e',308,400,38,94); r(g,'#c9a27a',312,398,30,98);
    for (let y=406;y<488;y+=12) r(g,'#b58c63',313,y,28,1);
    r(g,'#6d725e',10,420,340,310); r(g,'#dedbc3',14,424,332,62);
    r(g,'#c9a27a',14,486,332,240);
    for(let y=488;y<724;y+=18) { r(g,'#b58c63',14,y,332,1); for(let x=22+(y%36?24:0);x<344;x+=48) r(g,'#b58c63',x,y,1,Math.min(18,724-y)); }
    r(g,'#c9a27a',312,420,30,72); text(g,'↓ 附楼',327,449,6);
    }
    placed(g,C.meetingOffset,()=>{
    r(g,'#6c897b',20,490,220,3); r(g,'#9cbab160',20,493,3,137);
    r(g,'#6c897b',236,490,3,108); r(g,'#9cbab140',224,493,12,105);
    r(g,'#6c897b',20,630,184,3); r(g,'#9cbab190',20,617,184,13);
    for(const x of [20,76,132,200]) r(g,'#6c897b',x,614,2,19);
    r(g,'#547064',28,496,168,31); r(g,'#fff4d5',30,498,164,27);
    for(const p of Core.seats) { r(g,'#547064',p.x-8,p.y-12,16,14); r(g,'#8ca28a',p.x-7,p.y-12,14,4); r(g,'#547064',p.x-7,p.y+1,3,4); r(g,'#547064',p.x+4,p.y+1,3,4); }
    r(g,'#77563f',70,562,116,24); r(g,'#a97c52',70,562,116,20); r(g,'#dfb987',71,562,114,4);
    r(g,'#eee4c7',98,572,15,9); r(g,'#8d9a80',101,575,9,1); r(g,'#eee4c7',148,572,15,9);
    text(g,'会议室',130,600,7,'#655b40');
    r(g,'#71583f',76,650,52,17); r(g,'#a3ac8f',76,648,52,6); r(g,'#d2b285',76,660,52,5);
    r(g,'#71583f',78,667,3,3); r(g,'#71583f',123,667,3,3); text(g,'旁听席',102,684,7,'#655b40');
    });
    placed(g,C.boothOffset,()=>{
    r(g,'#6d806a',268,494,67,5); r(g,'#6d806a',268,499,3,61); r(g,'#6d806a',332,499,3,61); r(g,'#b4cdc14a',271,499,61,61);
    r(g,'#47625d',310,512,12,26); r(g,'#e7dbb8',312,515,7,10); r(g,'#364944',313,529,5,6);
    text(g,'电话亭',300,579,7);
    });
    placed(g,C.storageOffset,()=>{
    text(g,'储物间',298,602,7);
    r(g,'#8f785c',262,610,72,68); r(g,'#b6a58a',265,613,66,62); r(g,'#796b54',265,673,66,3);
    });
    placed(g,C.totalsOffset,()=>{r(g,'#77563f',24,426,276,52); r(g,'#a17c52',27,429,270,46);});
  }
  function folder(x,y) {
    r(ctx,'#8c6337',x-6,y-5,13,9); r(ctx,'#efc66c',x-5,y-4,11,7); r(ctx,'#efc66c',x-5,y-7,5,3); r(ctx,'#fff0bc',x-3,y-1,6,1);
  }
  const count = n => n >= 1e8 ? `${Math.floor(n/1e8)}亿` : n >= 1e4 ? `${Math.floor(n/1e4)}万` : String(n);
  const boardLines = (compact = true) => {
    const num = n => n == null ? '—' : compact ? count(n) : String(n);
    if (!stats) return [`来过客人 ${visitorsTotal ?? '—'} · 收到礼物 —`, '开过会 — · 递过活 —', '今天：暂无累计信号'];
    const t=stats.today;
    return [`来过客人 ${num(stats.visitorsTotal)} · 收到礼物 ${num(stats.treatsTotal)}` + (!mv ? ` · 接待 ${num(stats.meetsTotal)} 拨` : ''), `开过会 ${num(stats.meetingsTotal)} · 递过活 ${num(stats.handoffsTotal)}` + (Number.isInteger(stats.notesTotal) && stats.notesTotal >= 0 ? ` · 纸条 ${num(stats.notesTotal)}` : ''), `今天：客人 ${num(t.visitors)} · 礼物 ${num(t.treats)} · 会 ${num(t.meetings)} · 递活 ${num(t.handoffs)}` + (!mv ? ` · 接待 ${num(t.meets)} 拨` : '')];
  };
  function sceneUnder() {
    const s=sim.scene, m=s.meeting;
    gamesUnder();
    placed(ctx,C.totalsOffset,()=>{
    text(ctx,`办公室累计${demo?' · 演示':''}`,162,440,8,'#fff4d5');
    const lines=boardLines(); lines.forEach((line,i)=>{ const size=i===2?7.5:8; ctx.font=`${size}px \"PingFang SC\",system-ui,sans-serif`; text(ctx,line,162,450+i*10,mv?size:Math.min(size,size*260/ctx.measureText(line).width),'#fff4d5'); });
    });
    placed(ctx,C.meetingOffset,()=>{
    if (m) {
      text(ctx,m.kind==='review'?`互审 · 第 ${m.round ?? '—'} 轮`:`碰头会 · ${m.members.length} 人`,112,509,9);
      if (m.kind==='review' && m.slide) text(ctx,`采纳 ${m.slide.adopted} · 反驳 ${m.slide.rejected} · 待议 ${m.slide.open}`,112,521,8);
      text(ctx,`${Math.max(0,Math.floor((now()-Date.parse(m.since))/60000))} 分钟`,207,488,6);
    } else if(sim.reception?.venue==='meeting' && sim.reception.phase!=='leaving') {
      text(ctx,'来谈事 · '+C.MEET_NAMES[sim.reception.kind],128,508,8);
    } else {
      const last=[...events].filter(e=>e.kind==='meeting').sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))[0];
      const label=mv?(last?`上次开会 ${formatClock(Date.parse(last.at))}`:'今天还没开会'):C.meetingBoardText(stats,events);
      text(ctx,label,112,515,label.length>20?6.5:8);
    }
    });
    placed(ctx,C.storageOffset,()=>{
    const layers=C.diskLayers(s.disk);
    for(let j=0;j<layers;j++) for(let i=0;i<3;i++) {
      const x=268+i*20,y=666-j*7;
      r(ctx,'#805f3d',x,y,19,7); r(ctx,'#c59861',x+1,y,17,6); r(ctx,'#e3bb81',x+8,y,3,6);
    }
    if (s.disk) text(ctx,`${s.disk.usedPct}%`,298,690,7);
    if (s.disk?.usedPct>=92) { r(ctx,'#ba5045',276,604,47,11); text(ctx,'快满了',299,612,8,'#fff4d5'); }
    });
    placed(ctx,C.boothOffset,()=>r(ctx,s.call?'#e8bc55':'#84917c',296,490,9,4));
    if(sim.guard && s.guard.phase==='patrol' && sim.guard.path.length) {
      const a=sim.guard,p=a.path[0],angle=Math.atan2(p.y-a.y,p.x-a.x);
      ctx.fillStyle='#fff0ab38'; ctx.beginPath(); ctx.moveTo(a.x,a.y-8);
      ctx.lineTo(a.x+Math.cos(angle-.35)*37,a.y-8+Math.sin(angle-.35)*37);
      ctx.lineTo(a.x+Math.cos(angle+.35)*37,a.y-8+Math.sin(angle+.35)*37); ctx.closePath(); ctx.fill();
    }
    for(const id of s.dispatched) { const a=sim.actors.find(a=>a.id===id); if(a && !sim.flights.some(f=>f.id===id && !f.returning)) folder(C.desks[a.i][0]+17,C.desks[a.i][1]+4); }
  }
  function sceneOver() {
    const ball=sim.pingPongBall();
    if(ball)r(ctx,'#fff4d5',ball.x,ball.y,ball.size,ball.size);
    if(C.id==='landscape')r(ctx,sim.scene.meeting?'#efc66c':'#84917c',588,210,9,4);
    else if(sim.scene.meeting) {
      r(ctx,'#77563f',274,398,68,18); r(ctx,'#efc66c',276,400,64,14);
      r(ctx,'#fff4d5',278,404,3,3); text(ctx,'开会中 ↓',311,410,8,'#45534b');
    }
    for(const f of sim.flightPoints()) folder(f.x,f.y);
    const cc=sim.actors.find(a=>a.activity==='call');
    if(cc && !cc.path.length) {
      r(ctx,'#354c47',cc.x+5,cc.y-18,3,11); r(ctx,'#354c47',cc.x+3,cc.y-18,5,3); r(ctx,'#354c47',cc.x+3,cc.y-9,5,3);
      if(!mv && sim.time%8<2.5) { const call=sim.scene.call, who=call?.kind==='dispatch' && sim.actors.find(a=>a.id===call.with)?.name; const word=who ? [`喂，${who}`,'交给你啦','做完叫我'][Math.floor(sim.time/8)%3] : ['嗯…','这个思路有意思','我记一下'][Math.floor(sim.time/8)%3]; placed(ctx,C.boothOffset,()=>{r(ctx,'#fff4d5',258,531,84,12); text(ctx,word,300,540,8);}); }
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
      speechBoxes.push({x:x-53,y:y-32,w:106,h:68});
    }
    for(const speech of sim.eventSpeech()) {
      const a=speech.id==='boss'?sim.boss:sim.actors.find(a=>a.id===speech.id);if(!a || sim.argue?.phase==='smoke'&&sim.argue.ids.includes(a.id))continue;
      const high=a.activity==='argue'?54:43,w=speech.icon?20:speech.text.length*8+10,x=Math.max(20,Math.min(C.W-w-20,a.x-w/2)),y=a.y-high;
      speechBoxes.push({x,y,w,h:14});r(ctx,'#b59b72',x,y,w,14);r(ctx,'#fff6dc',x+1,y+1,w-2,12);r(ctx,'#fff6dc',a.x,y+14,3,3);
      if(speech.icon)item(speech.icon,x+6,y+11);else text(ctx,speech.text,x+w/2,y+10,8,'#6a4b30');
    }
  }
  function person(a, boss = false) {
    if(!mv && sim.argue?.phase==='smoke' && sim.argue.ids.includes(a.id))return;
    if (!boss && !a.activity && ['away', 'off'].includes(a.status) && C.distance(a, C.door) < 3) return;
    if (boss && sim.bossAway && C.distance(a, C.door) < 3) return;
    const seated = (a.activity === 'meeting' && !sim.meetingStanding(a.id) || a.listening || !mv && ['souvenir','radar'].includes(a.activity) && sim[a.activity]?.phase==='sitting' || a.activity==='reception' && sim.reception?.venue==='meeting' && sim.reception.phase==='talking') && !a.path.length;
    const working = a.status === 'busy' && !a.activity;
    const moving = a.path.length > 0, t = sim.time, doneAge = a.doneArrived == null ? Infinity : t - a.doneArrived;
    const bounce = !boss && a.status === 'done' && (mv || !a.activity) && doneAge < 2 ? Math.abs(Math.sin(doneAge * 7)) * 6 : 0;
    let x = Math.round(a.x), y = Math.round(a.y - bounce - (moving ? Math.abs(Math.sin(t * 10 + (a.i || 0))) : 0));
    const color = boss ? '#c97859' : a.status === 'unknown' ? '#989d98' : a.color;
    r(ctx, '#4c584e30', x - 8, a.y - 1, 17, 3);
    if (!boss && !moving && (working || seated)) {
      r(ctx, '#657a67', x - 8, y - 12, 16, 13); r(ctx, '#8ba087', x - 7, y - 12, 14, 3);
      r(ctx, '#4a5e50', x - 7, y + 1, 3, 4); r(ctx, '#4a5e50', x + 4, y + 1, 3, 4);
    }
    r(ctx, '#33443f', x - 6, y - 18, 12, 15); r(ctx, color, x - 5, y - 10, 10, 8);
    r(ctx, '#e3b58d', x - 5, y - 16, 10, 7); r(ctx, '#4b4639', x - 6, y - 21, 12, 6); r(ctx, '#544c3a', x - 6, y - 16, 2, 5);
    // A visitor just walked in (or a treat just landed): everyone in the room looks up and waves for three seconds.
    const hello = sim.greeting(), thanks = sim.thanksNow(), present = !boss && !a.visitor && !['away', 'off'].includes(a.status);
    const greets = present && (mv || !['reception','argue','quota','melon','snack','souvenir','radar'].includes(a.activity)) && !!(hello || thanks);
    const look = a.activity==='melon' && sim.melon ? Math.sign(sim.melon.source.x-a.x) : greets ? Math.sign((hello ? hello.x : C.pantry.x) - a.x) : 0;
    r(ctx, '#273a34', x - 3 + look, y - 13, 2, 2); r(ctx, '#273a34', x + 2 + look, y - 13, 2, 2);
    const leg = moving ? Math.sin(t * 11) > 0 ? 2 : -2 : 0;
    r(ctx, '#34483e', x - 5, y - 2, 4, 3 + leg); r(ctx, '#34483e', x + 2, y - 2, 4, 3 - leg);
    const typing = !boss && working && !moving ? Math.sin(t * 15 + a.i) > 0 ? 2 : -1 : 0;
    r(ctx, color, x - 8, y - 10, 3, 6); r(ctx, color, x + 5, y - 10, 3, 6);
    const hands = !boss && working && !moving ? 14 : 4;
    r(ctx, '#e4bb91', x - 8, y - hands - typing, 3, 3);
    if (greets) {
      // Right arm up, hand swinging: a wave. Then a word above the head, each desk its own.
      const swing = Math.sin(t * 9) > 0 ? 2 : -1;
      r(ctx, '#33443f', x + 5, y - 10, 3, 6); r(ctx, color, x + 5, y - 17, 3, 7); r(ctx, '#e4bb91', x + 5 + swing, y - 20, 3, 3);
      const word = hello?.kind === 'pose' ? ['茄子', '耶', '✌', '茄子', '笑一个', '耶', '看这里', '茄子', '比心', '耶', '茄子'][a.i % 11]
        : hello ? ['你好', 'Hi', '欢迎', '嗨', 'Hello', '你好呀', '欢迎光临', '嗨嗨', '哈喽', '来啦', '你好'][a.i % 11]
        : ['谢谢', '好耶', '谢啦', '太好了', '谢谢你', '哇', '开心', '干杯', '谢谢啦', '好香', '谢谢'][a.i % 11];
      const w = word.length * 6 + 6, bx = Math.max(22, Math.min(C.W-22 - w, x - w / 2 + 1));
      speechBoxes.push({x:bx,y:y-36,w,h:10});
      r(ctx, '#fff6dc', bx, y - 36, w, 10); r(ctx, '#d9a56d', bx, y - 36, w, 1); text(ctx, word, bx + w / 2, y - 28, 6, '#6a4b30');
    } else r(ctx, '#e4bb91', x + 5, y - hands + typing, 3, 3);
    if(a.activity==='reception' && sim.reception?.phase==='handshake' && !moving) {
      const v=sim.reception.visitor, host=sim.actors.find(b=>b.id===sim.reception.hosts[0]);
      if(a===v || a===host) { const dx=a===v?-1:1, bob=Math.sin(t*9)>0?1:0; r(ctx,color,x+(dx<0?-12:5),y-12+bob,8,3); r(ctx,'#e4bb91',x+(dx<0?-14:11),y-12+bob,4,3); }
    }
    const game = sim.gameActivity(a);
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
    if (!greets && game === 'nap') { r(ctx,'#e3b58d',x-4,y-14,8,4); r(ctx,'#544c3a',x-3,y-13,3,2); text(ctx,'z',x+7,y-25-(t%3)*2,8,'#45534b'); }
    if (!greets && game === 'read') { r(ctx,'#77563f',x-7,y-11,14,9); r(ctx,'#fff4d5',x-6,y-10,12,6); r(ctx,'#b58c63',x,y-10,2,7); }
    if(!mv)eventPose(a,x,y,moving);
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
    if (boss) { r(ctx, '#dcb159', x + 2, y - 22, 4, 3); r(ctx, '#5a4839', x - 7, y - 18, 3, 10); }
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
  let photoAt = null, photoUrl = '';
  function takePhoto(hello) {
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
      if (!blob) return;
      photoBlob = blob;
      const reader = new FileReader();
      reader.onload = () => {
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
    if(wallRoom) {const full=!!(sim.reception || sim.argue),height=full?C.H*2:840;if(canvas.height!==height){canvas.height=height;document.body.classList.toggle('wall-room',!full);fitRoom();}}
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
    if(!mv && sim.radarCardNow()) {
      r(ctx,'#baa17b',231,27,94,21);r(ctx,'#fff4d5',232,28,92,19);r(ctx,'#ba5045',277,27,3,3);
      text(ctx,`今日选题 ${sim.radarCardNow().n} 条`,278,41,8,'#6a4b30');
    }
    const onDesks = sim.deskTreatNow();
    if (onDesks) for (const a of sim.actors) if (!['away', 'off'].includes(a.status) && a.i !== 10) item(onDesks.kind, C.desks[a.i][0] + 15, C.desks[a.i][1] + 6);
    if(!mv) for(const f of sim.foodNow()){const a=sim.actors.find(a=>a.id===f.id);item(f.kind,C.desks[a.i][0]+(f.kind==='cloud'?-7:f.kind==='papers'?1:-20),C.desks[a.i][1]+6);}
    [...sim.actors, ...sim.visitors, ...(sim.reception ? [sim.reception.visitor] : []), ...(sim.guard ? [sim.guard] : []), { ...sim.boss, boss: true }].sort((a, b) => a.y - b.y).forEach(a => person(a, a.boss));
    {
      sceneOver();
      drawReceptionSpeech();
      if(!mv)drawEvents();
      ctx.font = '7px "PingFang SC",system-ui,sans-serif';
      nameplates = C.nameplates([...sim.actors.filter(a=>mv || !(sim.argue?.phase==='smoke' && sim.argue.ids.includes(a.id))),...sim.visitors,...(sim.reception ? [sim.reception.visitor] : []),...(sim.guard ? [sim.guard] : []),{...sim.boss,boss:true}], value=>ctx.measureText(value).width, speechBoxes);
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
    if (mv && latest) { r(ctx, '#fff0c9', 231, 57, 94, 12); text(ctx, `${formatClock(Date.parse(latest.at))}  ${Array.from(latest.text).slice(0, 8).join('')}`, 278, 65, 6, '#6c6149'); }
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
    if(reception?.local && reception.phase==='handshake' && sim.time-reception.handshakeAt>=1 && !reception.photoTaken && !mv && !wallMode) {reception.photoTaken=true;takePhoto({kind:'reception'});}
    const hello = sim.greeting();
    if (hello) greeted = true;
    if (hello && !sim.reception && !mv && !wallMode && sim.time - hello.at >= 1.3 && photoAt !== hello.at) { photoAt = hello.at; takePhoto(hello); }
    if (!hello && photoReady && sim.reception?.phase!=='handshake') { photoReady = false; $('#photo').hidden = false; clearTimeout(photoTimer); photoTimer = setTimeout(() => { $('#photo').hidden = true; }, 30_000); }
    if (sim.time - lastUI >= .5 || paused) { updateUI(); lastUI = sim.time; }
    metrics.push(performance.now() - started); if (metrics.length > 300) metrics.shift();
  }
  function drawReceptionSpeech() {
    const speech=sim.receptionSpeech(); if(!speech || mv)return;
    const a=[...sim.actors,sim.reception.visitor,sim.guard].find(a=>a?.id===speech.id);if(!a)return;
    ctx.font='8px \"PingFang SC\",system-ui,sans-serif'; const w=ctx.measureText(speech.text).width+12, x=Math.max(20,Math.min(C.W-w-20,a.x-w/2)),y=a.y-64;
    speechBoxes.push({x,y,w,h:14});r(ctx,'#786747',x,y,w,14);r(ctx,'#fff6dc',x+1,y+1,w-2,12);text(ctx,speech.text,x+w/2,y+10,8,'#6a4b30');r(ctx,'#b59b72',a.x,y+14,1,15);
  }
  function drawWallBoard() {
    const b=wallBoard();
    for(let j=0;j<b.sheets;j++) {
      const x=236+j%4*21,y=41+Math.floor(j/4)*14;
      r(ctx,['#fff0c9','#d9e3c6','#edc4a2','#f3e6b2'][j%4],x,y,16,11);
      r(ctx,'#b9b194',x+3,y+5,10,1); r(ctx,'#c1b597',x+3,y+8,7,1);
      r(ctx,b.recent && j===b.sheets-1 && sim.time%1.6<.4?'#d9564d':'#a56c4b',x+7,y-1,2,3);
    }
    if(b.extra)text(ctx,`+${b.extra}`,323,36,6,'#fff3cf','right');
  }
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
    if (sim.scene.meeting) $('#room-caption').textContent = C.id==='landscape'?'会议室在开会':'楼下在开会';
    if (sim.greeting()) $('#room-caption').textContent = '来人了，大家回头打了个招呼';
    const thanks = sim.thanksNow(), carrier = sim.visitors.find(v => v.carry);
    if (carrier) $('#room-caption').textContent = `有人拎着${TREAT_NAMES[carrier.carry]}来探班了`;
    if (thanks) $('#room-caption').textContent = `${TREAT_NAMES[thanks.kind]}到了，大家说谢谢`;
    const tally = Object.entries(treatsToday).filter(([, n]) => n > 0).map(([k, n]) => `${TREAT_NAMES[k]} ×${n}`).join('、');
    if (!waiting && !busy && !thanks && !carrier && !sim.greeting() && !sim.scene.meeting && tally) $('#room-caption').textContent = `今天收到 ${tally}`;
    const m=sim.reception;if(m) {const names=m.hosts.map(id=>sim.actors.find(a=>a.id===id)?.name).join(' 和 '); $('#room-caption').textContent=m.phase==='leaving'||m.phase==='handshake'?'谈完了，送客':m.mode==='closed'?'下班了，明天再来':m.mode==='tea'?'先喝杯茶，稍坐一会儿':m.phase==='arriving'?`有客人来洽谈，${names} 去接待`:m.venue==='pantry'?'茶水位在谈事':C.id==='landscape'?'会议室在谈事':'楼下在谈事';}
    // Whoever has something going sits on top: waiting for her, then at work, then just finished; the rest keep desk order.
    const rank = { waiting: 0, busy: 1, done: 2, unknown: 3, idle: 4, away: 5, off: 6 };
    const order = [...sim.actors].sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || a.i - b.i).map(a => a.id);
    const list = $('#roster');
    if (list.dataset.order !== order.join()) { list.dataset.order = order.join(); const byId = new Map([...list.children].map(li => [li.dataset.id, li])); for (const id of order) { const li = byId.get(id); if (li) list.append(li); } }
    for (const li of list.children) {
      const a = sim.actors.find(a => a.id === li.dataset.id);
      li.querySelector('.status').textContent = a.activity === 'quota' ? '额度用完 · 罚站中' : a.activity === 'argue' ? '互审争论中' : a.activity === 'souvenir' ? '出差归来 · 分特产' : a.activity === 'radar' ? '雷达归来 · 贴选题' : a.activity === 'snack' ? '交活请客中' : a.activity === 'melon' ? '吃瓜中' : a.activity === 'reception' ? '接待中' : a.activity === 'call' ? '通话中' : a.activity === 'meeting' ? '开会中' : a.badge === '等派活' && a.status === 'idle' ? '等派活' : a.status === 'away' && a.awayLabel ? a.awayLabel : labels[a.status];
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
        const words=C.eventText(e,currentRoster); if(!words) continue;
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
    const key = `${demo}:${guest}:${view}`; if (key === modeKey) return; modeKey = key;
    $('#mode-text').textContent = demo ? `演示模式 · 模拟数据${view && view !== 'hero' ? ' · 场景预览' : ''}` : guest ? '实时状态 · 访客视角' : '本机状态 · 每 10 秒更新';
    $('#mode').classList.toggle('live', !demo);
    $('#board-tab').hidden=guest && !demo;
    if (guest && !demo && !$('#board').hidden) $('#today-tab').click();
  }
  function resetDemo() {
    demo = true; elapsed = 0; cursor = 0; cycle = 0; visitorsTotal = null;
    wallBase = Date.parse(params.get('night') === '1' || view === 'night-guard' ? '2026-11-01T15:00:00Z' : '2026-11-01T02:00:00Z');
    currentRoster = script.roster; sim = C.create(currentRoster, seed, C.id); sim.eventsEnabled=!mv;
    stats = mv ? mv.stats : structuredClone(script.stats || null); events = []; treatsToday = {}; noticesToday=undefined;
    if (!mv) sim.setScene(demoScene(script.scene),now());
    if (mv) mv.start(sim);
    else for (const a of script.roster) { sim.setStatus(a.id, a.status, new Date(wallBase).toISOString()); sim.actors.find(x => x.id === a.id).badge = a.badge || ''; }
    lastUI = -10; light = ''; buildRoster(); modeBanner();
  }
  function demoScene(value) {
    const s={...C.emptyScene(),...value};
    if(s.meeting) s.meeting={...s.meeting,since:sim.scene.meeting?.since || new Date(now()).toISOString(),roundAt:sim.scene.meeting?.round===s.meeting.round ? sim.scene.meeting.roundAt : new Date(now()).toISOString()};
    for(const kind of ['souvenir','radar'])if(s[kind])s[kind]={...s[kind],at:s[kind].at || new Date(now()).toISOString()};
    if(s.snack)s.snack={...s.snack,at:s.snack.at || new Date(now()).toISOString()};
    if(s.supper)s.supper={...s.supper,at:s.supper.at || new Date(now()).toISOString()};
    if(s.call) s.call={since:new Date(now()).toISOString()};
    if(s.guard) s.guard={...s.guard,at:new Date(wallBase).toISOString()};
    return s;
  }
  function advance(ms) {
    if (!sim) return;
    // Hidden tabs freeze simulation time; wall-clock expiry still applies when their queue resumes.
    if(!demo && !mv) {sim.meetQueue=sim.meetQueue.filter(m=>Date.now()-Date.parse(m.at)<120000);sim.clockBase=Date.now()-sim.time*1000;sim.pruneEvents(Date.now());}
    for (let left = ms; left > 0; left -= 20) {
      const part = Math.min(left, 20);
      if (mv) { mv.tick(elapsed, sim); events=mv.events; elapsed += part; sim.night=C.isNight(now()); sim.step(part * mv.pace(elapsed)); mv.observe(elapsed, sim); continue; }
      if (demo) {
        const local = elapsed - cycle * script.duration * 1000;
        sim.setVisitors(local >= 12_000 && local < 42_000 ? 1 : local >= 44_000 && local < 90_000 ? 3 : 0);
        if (local >= 20_000 && local < 20_000 + part) sim.treat(['milktea', 'coffee', 'cake', 'melon'][cycle % 4], new Date(wallBase + elapsed).toISOString());
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
          for(const event of e.log || []) if(event.kind !== 'guard' || C.isNight(now())) {events.push({...event,at});if(stats && ['snack','supper','souvenir','radar'].includes(event.kind)){const k=event.kind+'s';stats[k+'Total']++;stats.today[k]++;}}
          events=events.slice(-500);
        }
      }
      elapsed += part; sim.night=C.isNight(now()); sim.step(part);
      if (demo && elapsed >= (cycle + 1) * script.duration * 1000) {
        cycle++; cursor = 0; events=[]; wallBase=Date.parse(params.get('night')==='1'||view==='night-guard'?'2026-11-01T15:00:00Z':'2026-11-01T02:00:00Z')+cycle*86400000-elapsed;sim.setQuota({},now()); sim.setScene(demoScene(script.scene),now());
        for (const a of script.roster) sim.setStatus(a.id, a.status, new Date(now()).toISOString());
      }
    }
  }
  function validateState(data) {
    if (!data || data.demo !== false || (data.guest !== undefined && data.guest !== true) || !Array.isArray(data.roster) || data.roster.length < 1 || data.roster.length > 11 || !Array.isArray(data.notices) || data.notices.length > 20 || (data.visitors !== undefined && !(Number.isInteger(data.visitors) && data.visitors >= 0 && data.visitors <= 100000)) || (data.visitorsTotal !== undefined && !(Number.isInteger(data.visitorsTotal) && data.visitorsTotal >= 0 && data.visitorsTotal <= 1e9)) || (data.treats !== undefined && !(Array.isArray(data.treats) && data.treats.length <= 10 && data.treats.every(t => t && Object.hasOwn(TREAT_NAMES,t.kind) && Number.isFinite(Date.parse(t.at)))))) throw new Error('Invalid state');
    if(data.meets!==undefined && !(Array.isArray(data.meets) && data.meets.length<=10 && data.meets.every(m=>m && Object.hasOwn(C.MEET_NAMES,m.kind) && typeof m.at==='string' && Number.isFinite(Date.parse(m.at))))) throw new Error('Invalid state');
    // Shapes, character sets, lengths and date ranges all checked here, so nothing downstream has to trust the feed.
    const ids = new Set(), slots = new Set(), sane = t => { const v = Date.parse(t); return Number.isFinite(v) && v > 946684800000 && v < 4102444800000; };
    data.roster.forEach((a, i) => { if (!a || typeof a !== 'object') throw new Error('Invalid role'); const slot = a.desk ?? i; if (typeof a.id !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(a.id) || ids.has(a.id) || typeof a.name !== 'string' || !a.name.length || a.name.length > 40 || !/^#[0-9a-f]{6}$/i.test(a.color) || !Object.hasOwn(labels,a.status) || !sane(a.statusSince) || !Number.isInteger(slot) || slot < 0 || slot > 10 || slots.has(slot) || (a.courier !== undefined && typeof a.courier !== 'boolean') || (a.look !== undefined && !(Number.isInteger(a.look) && a.look >= 0 && a.look <= 11)) || (a.badge !== undefined && (typeof a.badge !== 'string' || a.badge.length > 16)) || (a.awayLabel !== undefined && (typeof a.awayLabel !== 'string' || a.awayLabel.length > 16)) || (a.workedToday !== undefined && !(Number.isFinite(a.workedToday) && a.workedToday >= 0 && a.workedToday <= 86400000))) throw new Error('Invalid role'); ids.add(a.id); slots.add(slot); });
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
    const note=$('#meet-note'),buttons=[...document.querySelectorAll('#meet-menu button')];
    $('#meet-menu').hidden=true;$('#meet-toggle').setAttribute('aria-expanded',false);
    if(demo) {const at=new Date(now()).toISOString();sim.meet(kind,at,true);note.textContent='演示接待 · 只在这页播放';return;}
    buttons.forEach(b=>b.disabled=true);pendingMeet=kind;
    try {
      const target=guest?guestApi.replace(/api\/state$/,'meet'):new URL('guest/meet',location.href);
      const response=await fetch(target,{method:'POST',mode:'cors',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({kind,v:visitorTag}),signal:AbortSignal.timeout(6000)});
      if(response.status===429)note.textContent='刚谈过，5 分钟后再来';
      else if(!response.ok)throw new Error(String(response.status));
      else {const {at}=await response.json();C.validateSceneFields({roster:currentRoster,meets:[{kind,at}]});localMeets.add(at);while(localMeets.size>128)localMeets.delete(localMeets.values().next().value);receiveMeets([{kind,at}]);note.textContent='来意收到了，等空闲的伙伴接待';}
    } catch {note.textContent='没约上，办公室这会儿没接上';}
    finally {pendingMeet=null;buttons.forEach(b=>b.disabled=false);}
  }
  // Treats sent from this page: the office answers with the time it was filed, which marks it as already shown here.
  async function sendTreat(kind) {
    const target = guest ? guestApi.replace(/api\/state$/, 'treat') : new URL('guest/treat', location.href);
    const note = $('#treat-note'), buttons = [...document.querySelectorAll('#treat-menu button')];
    buttons.forEach(b => { b.disabled = true; });
    try {
      const r = await fetch(target, { method: 'POST', mode: 'cors', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, v: visitorTag }), signal: AbortSignal.timeout(6000) });
      if (r.status === 429) { note.textContent = '一分钟送一次就够啦，他们还没喝完'; }
      else if (!r.ok) throw new Error(String(r.status));
      else { const { at } = await r.json(); seenTreats.add(at); sim.treat(kind, at); note.textContent = `${TREAT_NAMES[kind]}送出去了，看他们走过去`; }
    } catch { note.textContent = demo ? '演示模式里送不出去，等办公室醒着再来' : '没送到，办公室这会儿没接上'; }
    $('#treat-menu').hidden = true; $('#treat-toggle').setAttribute('aria-expanded', false);
    setTimeout(() => { buttons.forEach(b => { b.disabled = false; }); note.textContent = ''; }, 60_000);
  }
  // A page that got no greeting (its visitor tag was already known: a reload within 45 s) still gets a welcome;
  // and anyone can ask for a photo at any time, the team turns to the camera.
  let greeted = false, welcomeTimer = null;
  $('#pose').addEventListener('click', () => { if (!sim) return; sim.wave('pose'); $('#pose').disabled = true; setTimeout(() => { $('#pose').disabled = false; }, 5000); });
  $('#meet-toggle').addEventListener('click',()=>{const menu=$('#meet-menu');menu.hidden=!menu.hidden;$('#meet-toggle').setAttribute('aria-expanded',!menu.hidden);$('#treat-menu').hidden=true;$('#treat-toggle').setAttribute('aria-expanded',false);});
  document.querySelectorAll('#meet-menu button').forEach(b=>b.addEventListener('click',()=>sendMeet(b.dataset.kind)));
  $('#treat-toggle').addEventListener('click', () => { $('#meet-menu').hidden=true;$('#meet-toggle').setAttribute('aria-expanded',false); const menu = $('#treat-menu'); menu.hidden = !menu.hidden; $('#treat-toggle').setAttribute('aria-expanded', !menu.hidden); });
  document.querySelectorAll('#treat-menu button').forEach(b => b.addEventListener('click', () => sendTreat(b.dataset.kind)));
  try { visitorTag = sessionStorage.getItem('office-visitor') || ''; } catch { /* storage may be unavailable */ }
  if (!/^[a-f0-9]{16}$/.test(visitorTag)) {
    visitorTag = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');
    try { sessionStorage.setItem('office-visitor', visitorTag); } catch { /* fine without */ }
  }
  function sayHello() {
    if (!guest || forced || wallMode) return;
    fetch(guestApi.replace(/api\/state$/, 'visit') + '?v=' + visitorTag, { mode: 'cors', cache: 'no-store', signal: AbortSignal.timeout(6000) }).catch(() => {});
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
  const rosterIdentity = roster => JSON.stringify(roster.map((a,i)=>[a.id,a.desk??i,a.look,a.courier,a.name,a.color]));
  async function loadLive() {
    try {
      const data = await fetchState();
      // A page left open for days (the wallpaper) reloads itself when the office's own files change.
      if (!guest && typeof data.build === 'string') { if (!build) build = data.build; else if (data.build !== build) { location.reload(); return; } }
      misses = 0;
      if (demo || !sim || rosterIdentity(currentRoster) !== rosterIdentity(data.roster)) {
        demo = false; elapsed = 0; wallBase = Date.now(); currentRoster = data.roster; sim = C.create(currentRoster, seed, C.id); seen = new Set(data.notices.map(n => `${n.at}|${n.text}`));
        sim.notices = data.notices; buildRoster(); light = ''; lastUI = -10;
        const latest = data.notices.at(-1);
        if (latest && Date.now() - Date.parse(latest.at) < 20_000) sim.deliveries.push(latest);
      }
      for (const a of data.roster) { sim.setStatus(a.id, a.status, a.statusSince); Object.assign(sim.actors.find(x => x.id === a.id), { badge: a.badge || '', awayLabel: a.awayLabel || '', workedToday: a.workedToday || 0 }); }
      sim.clockBase=Date.now()-sim.time*1000;sim.receiveEventHistory(data.events || []);sim.setScene(data.scene,Date.now()); sim.setQuota(data.quota || {},Date.now()); noticesToday=data.noticesToday; stats=data.stats ?? null; events=data.events || [];
      sim.setVisitors(data.visitors || 0); visitorsTotal = data.stats?.visitorsTotal ?? data.visitorsTotal ?? null; sayHello();
      if (!welcomeTimer && !wallMode) welcomeTimer = setTimeout(() => { if (sim && !demo && !greeted && !sim.greeting() && !sim.thanksNow()) sim.wave('welcome'); }, 12_000);
      treatsToday = data.treatsToday || {};
      if(!pendingMeet)receiveMeets(data.meets || []); // defer during POST, so its poll cannot steal local photo ownership
      for (const t of data.treats || []) { if (!seenTreats.has(t.at)) { seenTreats.add(t.at); if (Date.now() - Date.parse(t.at) < 60_000) sim.treat(t.kind, t.at); } }
      for (const n of data.notices) { const key = `${n.at}|${n.text}`; if (!seen.has(key)) { seen.add(key); sim.deliveries.push(n); } }
      sim.notices = data.notices; seen = new Set(data.notices.map(n => `${n.at}|${n.text}`));
      modeBanner();
    } catch { if (!sim || (!demo && ++misses >= 3)) resetDemo(); }
    draw();
  }
  $('#drawer-toggle').addEventListener('click', () => {
    const expanded = $('#drawer').classList.toggle('expanded'); $('#drawer-toggle').setAttribute('aria-expanded', expanded);
  });
  for (const tab of ['team','board','today']) {
    $(`#${tab}-tab`).addEventListener('click', () => {
      for(const [key,panel] of [['team','roster'],['board','board'],['today','today']]) {
        $(`#${key}-tab`).classList.toggle('active',key===tab); $(`#${key}-tab`).setAttribute('aria-pressed',key===tab); $(`#${panel}`).hidden=key!==tab;
      }
      $('#drawer').classList.add('expanded'); $('#drawer-toggle').setAttribute('aria-expanded',true);
    });
  }
  $('#wall-board').addEventListener('click',()=>{
    boardRequested=true; $(`#${guest && !demo?'today':'board'}-tab`).click(); $('#drawer-body').scrollTop=0; updateUI();
  });
  function fitRoom() {
    if(C.id!=='landscape')return;
    const v=$('#room-viewport'); $('#canvas-wrap').style.width=`${Math.min(v.clientWidth,v.clientHeight*C.W/C.H)}px`;
  }
  function layoutUI() {
    const wide=C.id==='landscape'; document.body.classList.toggle('landscape',wide);
    if(wide)$('#drawer').insertBefore($('#treat'),$('.tabs')); else if(!mvMode && !wallMode) $('.room-section').insertBefore($('#treat'),$('#room-viewport')); else $('#canvas-wrap').append($('#treat'));
    $('#canvas-wrap').style.width=''; $('#room-viewport').scrollTop=0;
    $('#room-viewport').setAttribute('aria-label',wide?'办公室全景，整栋楼同屏':'办公室与附楼，可上下滚动');
    canvas.setAttribute('aria-label',wide?'AI 伙伴在工位、游戏角、会议室和电话亭之间活动。整栋楼同屏，详细状态可在手记中阅读。':'AI 伙伴在工位、游戏角和老板桌之间活动。下方附楼有会议室、电话亭和累计看板，可上下滚动。');
    const b=C.noticeRect,button=$('#wall-board'); button.hidden=mvMode || wallMode;
    Object.assign(button.style,{left:`${b.x/C.W*100}%`,top:`${b.y/C.H*100}%`,width:`${b.w/C.W*100}%`,height:`${b.h/C.H*100}%`});
    fitRoom();
  }
  landscapeQuery.addEventListener('change',()=>{
    const key=layoutKey(); if(C.id===key)return;
    C=withLayout(key); if(sim)sim=sim.relayout(key);
    canvas.width=backdrop.width=C.W*2; canvas.height=backdrop.height=C.H*2;
    light=''; lastUI=-10; layoutUI(); if(sim)draw();
  });
  new ResizeObserver(fitRoom).observe($('#room-viewport'));
  layoutUI();
  function snapshot() {
    const sorted = [...metrics].sort((a, b) => a - b);
    return { ready, demo, meetingBoard:C.meetingBoardText(stats,events),souvenir:sim?.souvenir,radar:sim?.radar,radarCard:sim?.radarCardNow(),argue:sim?.argue,snack:sim?.snack,melon:sim?.melon,quota:sim?.quotaEvent,supper:sim?.supper,food:sim?.foodNow(),eventSpeech:sim?.eventSpeech(),eventQueues:sim?.eventQueues,reception:sim?.reception && {...sim.reception,speech:sim.receptionSpeech()}, meetQueue:sim?.meetQueue, layout:C.id, logicalSize:[C.W,C.H], wallBoard:sim && wallBoard(), nameplates, speechBoxes, courierId:sim?.actors.find(sim.isCourier)?.id, requestedView: view, actualView: view==='souvenir' && sim.souvenir?.phase==='delivering' ? 'souvenir' : view==='radar' && sim.radarCardNow() && sim.radar?.phase==='showing' ? 'radar' : view==='argue' && sim.argue?.phase==='smoke' ? 'argue' : view==='snack' && sim.snack ? 'snack' : view==='melon' && sim.melon && sim.melon.ids.every(id=>!sim.actors.find(a=>a.id===id).path.length) ? 'melon' : view==='quota' && sim.actors.some(a=>a.activity==='quota'&&!a.path.length) ? 'quota' : view==='supper' && sim.supper ? 'supper' : view==='reception' && sim.reception?.phase==='talking' ? 'reception' : view === 'games' && sim.actors.filter(a=>sim.gameActivity(a)).length>=6 ? 'games' : view === 'board' && stats ? 'board' : sim?.scene.meeting && sim.actors.filter(a=>a.activity==='meeting').every(a=>!a.path.length) && sim.actors.some(a=>a.activity==='meeting') ? 'meeting' : sim?.actors.some(a=>a.activity==='call' && !a.path.length) ? 'booth' : sim?.flights.length ? 'handoff' : view === 'night-guard' && sim?.guard ? 'night-guard' : sim?.delivery?.phase === 'holding' ? 'notice' : sim?.actors.some(a => a.status === 'waiting' && !a.path.length) ? 'queue' : 'hero', elapsed, seed, light, meetingSign:C.id!=='landscape' && !!sim?.scene.meeting, meetingLamp:C.id==='landscape' && !!sim?.scene.meeting, scene:sim?.scene, stats, events, flights:sim?.flightPoints(), pingPongBall:sim?.pingPongBall(), diskLayers:C.diskLayers(sim?.scene.disk), guard:sim?.guard && {x:sim.guard.x,y:sim.guard.y,lap:sim.guard.lap,moving:!!sim.guard.path.length}, dpr: devicePixelRatio, canvasScale: 2, actors: sim?.actors.map(a => ({ id: a.id, desk:a.i, look:C.lookIndex(a), courier:sim.isCourier(a), status: a.status, activity:a.activity, gameSlot:a.gameSlot, game:sim.gameActivity(a), standing:sim.meetingStanding(a.id), x: a.x, y: a.y, moving: a.path.length > 0 })), visitors: sim?.visitors.map(v => ({ id: v.id, phase: v.phase, listening:v.listening, x: v.x, y: v.y })), greeting: sim?.greeting() ? { ...sim.greeting() } : null, thanks: sim?.thanksNow() ? { ...sim.thanksNow() } : null, deskTreat: sim?.deskTreatNow() ? { ...sim.deskTreatNow() } : null, boss: sim && { x: sim.boss.x, y: sim.boss.y }, delivery: sim?.delivery && { phase: sim.delivery.phase, arrived: sim.delivery.arrived, text: sim.delivery.text }, notices: sim?.notices.length, delivered: sim?.delivered, renderP95Ms: sorted[Math.floor(sorted.length * .95)] || 0, mv: mv && { seconds: mv.seconds, clock: formatClock(now()), camera: mv.camera(elapsed), light: mv.light(elapsed), subtitle: mv.subtitle(elapsed), darkness: mv.darkness(elapsed), log: mv.log.length } };
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
    if (view && demo) { advance({ hero: 4000, queue: 20000, notice: 35000, meeting:73000, booth:112500, handoff:45500, board:73000, 'night-guard':8000, games:138000, reception:49000, argue:84500, snack:112500, melon:18000, quota:93000, supper:154000, souvenir:200000, radar:C.id==='landscape'?263000:266000 }[view]); paused = true; }
    // Live hero uses real data; allow actors to reach their real target before the first shot.
    if (view === 'hero' && !demo) advance(7000);
    ready = true; draw();
    if (view === 'board') $('#today-tab').click();
    if(C.id==='portrait' && !wallMode && ['snack','melon','supper'].includes(view)) {const a=view==='supper'?sim.guard:sim.actors.find(a=>a.id===(view==='snack'?sim.snack?.id:view==='souvenir'?sim.souvenir?.id:sim.melon?.ids[0]));if(a)$('#room-viewport').scrollTop=Math.max(0,(a.y-130)*canvas.getBoundingClientRect().width/C.W);}
    if(view==='games' && C.id==='portrait') $('#room-viewport').scrollTop=Math.max(0,356*canvas.getBoundingClientRect().width/C.W-$('#room-viewport').clientHeight);
    if (C.id!=='landscape' && ['meeting','booth','board','night-guard','reception','argue'].includes(view)) $('#room-viewport').scrollTop=420*canvas.getBoundingClientRect().width/C.W;
    setInterval(() => { if (!forced && !paused) loadLive(); }, 10000);
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
