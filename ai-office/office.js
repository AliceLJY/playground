/* All artwork is drawn here: no spritesheets, web fonts, or image requests. */
(() => {
  'use strict';
  const C = window.OfficeCore, canvas = document.querySelector('#office'), ctx = canvas.getContext('2d');
  const backdrop = document.createElement('canvas'); backdrop.width = 720; backdrop.height = 840;
  const bg = backdrop.getContext('2d');
  const $ = s => document.querySelector(s), params = new URLSearchParams(location.search);
  const view = ['hero', 'queue', 'notice'].includes(params.get('view')) ? params.get('view') : null;
  const forced = params.get('demo') === '1' || view === 'queue' || view === 'notice';
  const labels = { busy: '干活中', waiting: '等你拍板', done: '交活了', idle: '休息中', away: '出差中', off: '下班了', unknown: '信号不明' };
  let script, sim, demo = false, ready = false, seed = 7, elapsed = 0, cursor = 0, cycle = 0, paused = false, wallBase = Date.now(), lastUI = -10, light = '', currentRoster = [], seen = new Set(), modeKey = '', metrics = [], lastFrame = 0;
  const beijing = n => new Date(n + 8 * 3600000);
  const formatClock = n => beijing(n).toISOString().slice(11, 16);
  const now = () => demo ? wallBase + elapsed : Date.now();
  const r = (g, color, x, y, w, h) => { g.fillStyle = color; g.fillRect(Math.round(x), Math.round(y), w, h); };
  const text = (g, value, x, y, size = 8, color = '#45534b', align = 'center') => { g.fillStyle = color; g.font = `${size}px "PingFang SC",system-ui,sans-serif`; g.textAlign = align; g.textBaseline = 'alphabetic'; g.fillText(value, x, y); };

  function plant(g, x, y, large = false) {
    r(g, '#6f5946', x - 5, y, 11, 11); r(g, '#c79061', x - 6, y, 13, 4); r(g, '#bd885b', x - 3, y + 4, 7, 6);
    r(g, '#52745e', x - 1, y - 16, 3, 17); r(g, '#608568', x - 8, y - 14, 9, 6); r(g, '#86a376', x - 6, y - 17, 7, 4); r(g, '#446951', x + 2, y - 10, 8, 6); r(g, '#9aaf80', x + 3, y - 13, 7, 4);
    if (large) { r(g, '#6d9172', x - 9, y - 27, 9, 7); r(g, '#5b7e63', x + 1, y - 23, 9, 7); r(g, '#6f9273', x - 1, y - 23, 3, 9); }
  }
  function desk(g, x, y, index) {
    const color = currentRoster[index]?.color || '#829e87';
    r(g, '#4c4d4050', x - 25, y + 17, 56, 10);
    r(g, '#77563f', x - 26, y + 4, 52, 18); r(g, '#a97c52', x - 26, y + 4, 52, 11); r(g, '#d1a272', x - 28, y, 56, 10); r(g, '#e0b786', x - 28, y, 56, 2);
    r(g, '#715543', x - 24, y + 17, 4, 8); r(g, '#715543', x + 20, y + 17, 4, 8);
    r(g, '#35474a', x - 12, y - 12, 24, 16); r(g, '#213b40', x - 10, y - 10, 20, 12); r(g, '#71a29a', x - 8, y - 8, 15, 1); r(g, '#5c8d83', x - 8, y - 5, 9, 1); r(g, '#90b8a3', x - 8, y - 2, 12, 1); r(g, '#394947', x - 2, y + 4, 4, 3);
    r(g, '#e1d8ba', x - 9, y + 9, 18, 4); r(g, '#768474', x - 7, y + 10, 14, 1); r(g, color, x + 18, y - 2, 5, 7); r(g, '#e2ceac', x + 23, y, 2, 3);
    r(g, '#d9b98b', x - 23, y + 34, 46, 9); text(g, currentRoster[index]?.name || '', x, y + 41, 7, '#574e3b');
  }
  function room() {
    bg.setTransform(2, 0, 0, 2, 0, 0); bg.clearRect(0, 0, 360, 420);
    const sky = light === 'night' ? '#30465a' : light === 'dusk' ? '#dca879' : '#a5c6bf';
    r(bg, '#a49b8640', 16, 16, 338, 396); r(bg, '#6d725e', 10, 10, 340, 398); r(bg, '#dedbc3', 14, 14, 332, 68);
    r(bg, '#f1e7ce', 17, 17, 326, 62); r(bg, '#c7c7ac', 14, 73, 332, 10); r(bg, '#8c967d', 14, 79, 332, 5);
    r(bg, '#b58c63', 14, 84, 332, 317);
    for (let y = 84; y < 401; y += 18) for (let x = 14 - ((y / 18 | 0) % 2) * 24; x < 345; x += 48) {
      const left = Math.max(14, x), width = Math.min(345, x + 47) - left;
      r(bg, ((x + y) / 6 | 0) % 3 ? '#c9a27a' : '#d1ad83', left, y, width, 17);
      r(bg, '#bd946c', left + 3, y + 12, Math.max(0, width - 9), 1);
    }
    r(bg, '#8a785e', 14, 400, 332, 5); r(bg, '#e5c498', 14, 397, 332, 3);
    // Windows, curtains and a tiny skyline.
    for (const x of [25, 98]) {
      r(bg, '#aaa98e', x, 25, 61, 43); r(bg, '#4e756e', x + 2, 25, 57, 39); r(bg, sky, x + 5, 28, 51, 32);
      r(bg, light === 'night' ? '#243a47' : '#83a69c', x + 8, 49, 10, 11); r(bg, light === 'night' ? '#294050' : '#91b3a6', x + 22, 43, 12, 17); r(bg, '#74988c', x + 39, 52, 13, 8);
      r(bg, '#e8e3c9', x + 29, 27, 3, 35); r(bg, '#eee3c8', x + 4, 43, 53, 2); r(bg, '#f4ebd8', x - 2, 24, 7, 41); r(bg, '#ddd9bd', x + 57, 24, 6, 41); r(bg, '#8d9d7c', x - 2, 64, 66, 4);
      if (light === 'night') { r(bg, '#edcf82', x + 13, 52, 2, 2); r(bg, '#edcf82', x + 26, 48, 3, 2); }
    }
    // Back-wall notice board; actual notices also appear in the accessible drawer.
    r(bg, '#8c6447', 226, 23, 103, 49); r(bg, '#b68d5f', 229, 26, 97, 43); text(bg, '公 告 板', 277, 36, 7, '#fff3cf');
    for (let j = 0; j < 4; j++) { const x = 236 + j * 21; r(bg, ['#fff0c9', '#d9e3c6', '#edc4a2', '#f3e6b2'][j], x, 41 + j % 2 * 3, 16, 20); r(bg, '#a56c4b', x + 7, 40 + j % 2 * 3, 2, 3); r(bg, '#b9b194', x + 3, 48 + j % 2 * 3, 10, 1); r(bg, '#c1b597', x + 3, 52 + j % 2 * 3, 7, 1); }
    // Wall clock and books.
    r(bg, '#8d9279', 183, 30, 26, 25); r(bg, '#faf0d7', 186, 33, 20, 19); r(bg, '#6c725e', 195, 37, 2, 8); r(bg, '#6c725e', 195, 43, 6, 2);
    text(bg, '一起把点子做出来', 190, 70, 6, '#7e856e');
    // Director's partition has an open doorway onto the main aisle.
    r(bg, '#8a9c8735', 20, 87, 91, 68); r(bg, '#8f9a7d', 20, 87, 91, 3); r(bg, '#8f9a7d', 20, 87, 3, 72); r(bg, '#96a38b', 109, 88, 3, 58);
    r(bg, '#6d806a', 28, 91, 34, 10); text(bg, '总监室', 45, 99, 6, '#f2ebd3');
    C.desks.forEach(([x, y], i) => { if (i !== 10) desk(bg, x, y, i); });
    // Low bookshelf, reading lamp, patterned rug and two soft benches.
    r(bg, '#775e45', 26, 173, 72, 29); r(bg, '#9b7854', 28, 175, 68, 24);
    for (let j = 0; j < 9; j++) r(bg, ['#7c9c84', '#d2b37e', '#ad7058', '#e1d2a6'][j % 4], 30 + j * 7, 178 + j % 3, 5, 17 - j % 3);
    r(bg, '#a8b39a', 23, 265, 84, 66); r(bg, '#dad7b4', 27, 269, 76, 58);
    for (let y = 272; y < 325; y += 6) r(bg, '#c5c5a3', 29, y, 71, 1);
    r(bg, '#506b5b', 23, 274, 78, 18); r(bg, '#739780', 25, 271, 74, 17); r(bg, '#8cac90', 27, 273, 70, 6);
    r(bg, '#486354', 23, 287, 5, 12); r(bg, '#486354', 96, 287, 5, 12); r(bg, '#597462', 28, 292, 68, 5);
    r(bg, '#8f6a4d', 27, 313, 71, 9); r(bg, '#c2976b', 26, 309, 73, 7);
    r(bg, '#6d735b', 113, 267, 2, 20); r(bg, '#ead3a2', 108, 262, 12, 7); r(bg, '#7d7c60', 109, 287, 10, 2);
    // Boss desk, mail reception and front door.
    r(bg, '#90755c35', 143, 350, 99, 47); r(bg, '#82947b', 147, 347, 92, 45); r(bg, '#9daa8c', 151, 351, 84, 37);
    r(bg, '#775841', 149, 369, 88, 23); r(bg, '#bf9568', 147, 365, 91, 15); r(bg, '#dcba87', 147, 363, 91, 5); r(bg, '#eddfb7', 180, 368, 25, 9); text(bg, '小试AI', 192, 375, 7, '#665c44');
    r(bg, '#f3e9c8', 155, 368, 16, 9); r(bg, '#c7bc9a', 158, 370, 9, 1); r(bg, '#c7bc9a', 158, 373, 7, 1); r(bg, '#496f5d', 219, 367, 8, 8);
    r(bg, '#865e43', 285, 340, 47, 23); r(bg, '#c09a69', 282, 337, 51, 10); r(bg, '#e5c595', 282, 337, 51, 2); text(bg, '前 台', 307, 356, 7, '#f2e6c7'); r(bg, '#f0e4c4', 312, 333, 14, 7); r(bg, '#9da384', 313, 335, 12, 1);
    r(bg, '#556b5b', 329, 374, 17, 26); r(bg, '#99a288', 330, 376, 16, 22); r(bg, '#f5e3af', 333, 386, 2, 3); text(bg, 'OUT', 334, 371, 5, '#5b6857');
    plant(bg, 329, 94, true); plant(bg, 32, 380, true); plant(bg, 124, 200); plant(bg, 271, 279);
    // A warm lamp pool is strictly decorative: no overlay on text or characters.
    if (light !== 'day') { bg.fillStyle = light === 'night' ? '#323d6220' : '#e79e4120'; bg.fillRect(14, 84, 332, 313); r(bg, '#f9d98c', 109, 263, 10, 3); }
  }

  function person(a, boss = false) {
    if (!boss && ['away', 'off'].includes(a.status) && C.distance(a, C.door) < 3) return;
    const moving = a.path.length > 0, t = sim.time, doneAge = a.doneArrived == null ? Infinity : t - a.doneArrived;
    const bounce = !boss && a.status === 'done' && doneAge < 2 ? Math.abs(Math.sin(doneAge * 7)) * 6 : 0;
    let x = Math.round(a.x), y = Math.round(a.y - bounce - (moving ? Math.abs(Math.sin(t * 10 + (a.i || 0))) : 0));
    const color = boss ? '#c97859' : a.status === 'unknown' ? '#989d98' : a.color;
    r(ctx, '#4c584e30', x - 8, a.y - 1, 17, 3);
    if (!boss && !moving && a.status === 'busy') {
      r(ctx, '#657a67', x - 8, y - 12, 16, 13); r(ctx, '#8ba087', x - 7, y - 12, 14, 3);
      r(ctx, '#4a5e50', x - 7, y + 1, 3, 4); r(ctx, '#4a5e50', x + 4, y + 1, 3, 4);
    }
    r(ctx, '#33443f', x - 6, y - 18, 12, 15); r(ctx, color, x - 5, y - 10, 10, 8);
    r(ctx, '#e3b58d', x - 5, y - 16, 10, 7); r(ctx, '#4b4639', x - 6, y - 21, 12, 6); r(ctx, '#544c3a', x - 6, y - 16, 2, 5);
    r(ctx, '#273a34', x - 3, y - 13, 2, 2); r(ctx, '#273a34', x + 2, y - 13, 2, 2);
    const leg = moving ? Math.sin(t * 11) > 0 ? 2 : -2 : 0;
    r(ctx, '#34483e', x - 5, y - 2, 4, 3 + leg); r(ctx, '#34483e', x + 2, y - 2, 4, 3 - leg);
    const typing = !boss && a.status === 'busy' && !moving ? Math.sin(t * 15 + a.i) > 0 ? 2 : -1 : 0;
    r(ctx, color, x - 8, y - 10, 3, 6); r(ctx, color, x + 5, y - 10, 3, 6);
    const hands = !boss && a.status === 'busy' && !moving ? 14 : 4;
    r(ctx, '#e4bb91', x - 8, y - hands - typing, 3, 3); r(ctx, '#e4bb91', x + 5, y - hands + typing, 3, 3);
    // Eleven accessories: glasses, headset, twin pins, beret, bow, visor, film, scarf, antenna, mail cap.
    const i = boss ? 11 : a.i;
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
    if (!boss && a.status === 'unknown') { r(ctx, '#edf0df', x - 4, y - 32, 9, 10); text(ctx, '?', x + 1, y - 24, 9, '#707971'); }
    if (!boss && a.status === 'waiting') {
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

  function draw() {
    if (!sim) return;
    const started = performance.now();
    const hour = beijing(now()).getUTCHours(), nextLight = hour >= 23 || hour < 8 ? 'night' : hour >= 17 ? 'dusk' : 'day';
    if (nextLight !== light) { light = nextLight; room(); }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, 720, 840); ctx.drawImage(backdrop, 0, 0); ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.imageSmoothingEnabled = false;
    [...sim.actors, { ...sim.boss, boss: true }].sort((a, b) => a.y - b.y).forEach(a => person(a, a.boss));
    const latest = sim.notices.at(-1);
    if (latest) { r(ctx, '#fff0c9', 231, 57, 94, 12); text(ctx, `${formatClock(Date.parse(latest.at))}  ${Array.from(latest.text).slice(0, 8).join('')}`, 278, 65, 6, '#6c6149'); }
    const d = sim.delivery, holding = d?.phase === 'holding';
    $('#paper').hidden = !holding;
    if (holding) $('#paper-text').textContent = d.text;
    if (sim.time - lastUI >= .5 || paused) { updateUI(); lastUI = sim.time; }
    metrics.push(performance.now() - started); if (metrics.length > 300) metrics.shift();
  }
  function duration(a) {
    const seconds = Math.max(0, Math.floor((now() - Date.parse(a.statusSince || new Date(now()).toISOString())) / 1000));
    return seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`;
  }
  function buildRoster() {
    $('#roster').replaceChildren();
    for (const a of sim.actors) {
      const li = document.createElement('li'); li.className = 'member'; li.dataset.id = a.id;
      const icon = document.createElement('span'); icon.className = 'avatar'; icon.style.setProperty('--actor', a.color);
      const name = document.createElement('span'); name.className = 'member-name'; name.textContent = a.name;
      const badge = document.createElement('small'); name.append(badge);
      const meta = document.createElement('span'); meta.className = 'member-meta';
      const status = document.createElement('span'); status.className = 'status';
      const time = document.createElement('time'); time.className = 'duration'; meta.append(status, time); li.append(icon, name, meta); $('#roster').append(li);
    }
  }
  function updateUI() {
    $('#clock').textContent = formatClock(now()); $('#lighting').textContent = { day: '窗边有光', dusk: '留一盏暖灯', night: '深夜值班室' }[light];
    const waiting = sim.actors.filter(a => a.status === 'waiting').length, busy = sim.actors.filter(a => a.status === 'busy').length;
    $('#room-caption').textContent = waiting ? `${waiting} 位伙伴，有事等你拍板` : busy ? '键盘声里，点子正在长大' : '这一刻，办公室很安静';
    $('#occupancy').textContent = `${busy} 在忙 / ${waiting} 等你`;
    for (const li of $('#roster').children) {
      const a = sim.actors.find(a => a.id === li.dataset.id);
      li.querySelector('.status').textContent = a.badge === '等派活' && a.status === 'idle' ? '等派活' : labels[a.status];
      li.querySelector('.status').className = `status status-${a.status}`;
      li.querySelector('.duration').textContent = duration(a);
      li.querySelector('small').textContent = a.i === 0 && a.badge ? `${a.badge} 会话` : '';
    }
    $('#notice-count').textContent = sim.notices.length;
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
    const key = `${demo}:${view}`; if (key === modeKey) return; modeKey = key;
    $('#mode').textContent = demo ? `演示模式 · 模拟数据${view === 'queue' || view === 'notice' ? ' · 场景预览' : ''}` : '本机状态 · 每 10 秒更新';
    $('#mode').classList.toggle('live', !demo);
  }
  function resetDemo() {
    demo = true; elapsed = 0; cursor = 0; cycle = 0;
    wallBase = view ? Date.parse('2026-01-01T02:00:00Z') : Date.now();
    currentRoster = script.roster; sim = C.create(currentRoster, seed);
    for (const a of script.roster) { sim.setStatus(a.id, a.status, new Date(wallBase).toISOString()); sim.actors.find(x => x.id === a.id).badge = a.badge || ''; }
    lastUI = -10; light = ''; buildRoster(); modeBanner();
  }
  function advance(ms) {
    for (let left = ms; left > 0; left -= 20) {
      const part = Math.min(left, 20);
      if (demo) {
        const local = elapsed - cycle * script.duration * 1000;
        while (cursor < script.events.length && script.events[cursor].at * 1000 <= local) {
          const e = script.events[cursor++], at = new Date(wallBase + elapsed).toISOString();
          if (e.notice) sim.notice({ text: e.notice, at });
          else sim.setStatus(e.id, e.status, at);
        }
      }
      elapsed += part; sim.step(part);
      if (demo && elapsed >= (cycle + 1) * script.duration * 1000) {
        cycle++; cursor = 0;
        for (const a of script.roster) sim.setStatus(a.id, a.status, new Date(now()).toISOString());
      }
    }
  }
  function validateState(data) {
    if (!data || data.demo !== false || !Array.isArray(data.roster) || data.roster.length !== 11 || !Array.isArray(data.notices) || data.notices.length > 20) throw new Error('Invalid state');
    const ids = new Set();
    for (const a of data.roster) { if (typeof a.id !== 'string' || ids.has(a.id) || typeof a.name !== 'string' || !/^#[0-9a-f]{6}$/i.test(a.color) || !labels[a.status] || !Number.isFinite(Date.parse(a.statusSince))) throw new Error('Invalid role'); ids.add(a.id); }
    if (data.notices.some(n => typeof n.text !== 'string' || !Number.isFinite(Date.parse(n.at)))) throw new Error('Invalid notice');
    return data;
  }
  async function loadLive() {
    try {
      // Relative to the page directory, so Pages' /playground/ai-office/ prefix works too.
      const response = await fetch(new URL('api/state', location.href), { cache: 'no-store', signal: AbortSignal.timeout(2500) });
      if (!response.ok) throw new Error('Unavailable');
      const data = validateState(await response.json());
      if (demo || !sim || currentRoster.map(a => a.id).join() !== data.roster.map(a => a.id).join()) {
        demo = false; elapsed = 0; wallBase = Date.now(); currentRoster = data.roster; sim = C.create(currentRoster, seed); seen = new Set(data.notices.map(n => `${n.at}|${n.text}`));
        sim.notices = data.notices; buildRoster(); light = ''; lastUI = -10;
        const latest = data.notices.at(-1);
        if (latest && Date.now() - Date.parse(latest.at) < 20_000) sim.deliveries.push(latest);
      }
      for (const a of data.roster) { sim.setStatus(a.id, a.status, a.statusSince); Object.assign(sim.actors.find(x => x.id === a.id), { badge: a.badge || '' }); }
      for (const n of data.notices) { const key = `${n.at}|${n.text}`; if (!seen.has(key)) { seen.add(key); sim.deliveries.push(n); } }
      sim.notices = data.notices; seen = new Set(data.notices.map(n => `${n.at}|${n.text}`));
      modeBanner();
    } catch { if (!demo) resetDemo(); }
    draw();
  }
  $('#drawer-toggle').addEventListener('click', () => {
    const expanded = $('#drawer').classList.toggle('expanded'); $('#drawer-toggle').setAttribute('aria-expanded', expanded);
  });
  for (const [tab, other, panel, otherPanel] of [['team', 'board', 'roster', 'board'], ['board', 'team', 'board', 'roster']]) {
    $(`#${tab}-tab`).addEventListener('click', () => {
      $(`#${tab}-tab`).classList.add('active'); $(`#${tab}-tab`).setAttribute('aria-pressed', true); $(`#${other}-tab`).classList.remove('active'); $(`#${other}-tab`).setAttribute('aria-pressed', false);
      $(`#${panel}`).hidden = false; $(`#${otherPanel}`).hidden = true;
      $('#drawer').classList.add('expanded'); $('#drawer-toggle').setAttribute('aria-expanded', true);
    });
  }
  function snapshot() {
    const sorted = [...metrics].sort((a, b) => a - b);
    return { ready, demo, requestedView: view, actualView: sim?.delivery?.phase === 'holding' ? 'notice' : sim?.actors.some(a => a.status === 'waiting' && !a.path.length) ? 'queue' : 'hero', elapsed, seed, light, dpr: devicePixelRatio, canvasScale: 2, actors: sim?.actors.map(a => ({ id: a.id, status: a.status, x: a.x, y: a.y, moving: a.path.length > 0 })), boss: sim && { x: sim.boss.x, y: sim.boss.y }, delivery: sim?.delivery && { phase: sim.delivery.phase, arrived: sim.delivery.arrived, text: sim.delivery.text }, notices: sim?.notices.length, delivered: sim?.delivered, renderP95Ms: sorted[Math.floor(sorted.length * .95)] || 0 };
  }
  window.__PLAYTEST__ = { get ready() { return ready; }, snapshot, setSeed(n) { seed = n >>> 0; if (demo) { resetDemo(); paused = true; draw(); } }, step(ms) { if (!Number.isFinite(ms) || ms < 0 || ms > 120000) throw new Error('Step must be 0–120000 ms'); paused = true; advance(ms); draw(); return snapshot(); } };
  async function start() {
    script = await (await fetch('demo-script.json')).json();
    if (forced) resetDemo(); else await loadLive();
    if (view && demo) { advance({ hero: 4000, queue: 20000, notice: 35000 }[view]); paused = true; }
    // Live hero uses real data; allow actors to reach their real target before the first shot.
    if (view === 'hero' && !demo) advance(7000);
    ready = true; draw();
    setInterval(() => { if (!forced && !paused) loadLive(); }, 10000);
    function frame(ts) {
      if (ts - lastFrame >= 1000 / 30 - .5) {
        const dt = lastFrame ? Math.min(100, ts - lastFrame) : 33.333;
        lastFrame = ts;
        if (!paused && !document.hidden) advance(dt);
        draw();
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  start().catch(() => { $('#mode').textContent = '办公室暂时没打开，请刷新重试'; });
})();
