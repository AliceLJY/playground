'use strict';
// 煤球下班 · 微信小游戏版。玩法与数值照搬 ../index.html，界面改为全部画在画布上（横屏）。
const W = 960, H = 540, ROUND = 60, PLAYER_Y = 461, BEST_KEY = 'sooty-office-best-v1', SOUND_KEY = 'sooty-office-sound-v1';
const info = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync());
const SW = info.windowWidth, SH = info.windowHeight, DPR = info.pixelRatio || 2;
const safe = info.safeArea && info.safeArea.width ? info.safeArea : {left: 0, top: 0, right: SW, bottom: SH, width: SW, height: SH};
const canvas = wx.createCanvas();
canvas.width = Math.round(SW * DPR); canvas.height = Math.round(SH * DPR);
const screen = canvas.getContext('2d');

// 舞台上方留一条读数栏（不挡掉落物），舞台按安全区剩余部分等比放大居中，两侧余下的地方做方向键。
const BAR = 46, PAD = 8;
const scale = Math.min((safe.height - BAR - 2 * PAD) / H, (safe.width - 2 * PAD) / W);
const stageW = W * scale, stageH = H * scale;
const stageLeft = safe.left + (safe.width - stageW) / 2, stageTop = safe.top + BAR + (safe.height - BAR - stageH) / 2, barY = stageTop - BAR;
const sideButtons = stageLeft >= 44;
const buttonBox = side => side === 'L'
  ? {x: 6, y: stageTop + stageH * .18, w: stageLeft - 14, h: stageH * .64}
  : {x: stageLeft + stageW + 8, y: stageTop + stageH * .18, w: SW - stageLeft - stageW - 14, h: stageH * .64};

// 舞台先画到离屏画布（整数倍像素、略大于屏幕再缩小，保住像素边缘），再贴到屏幕上。
const K = Math.min(3, Math.max(1, Math.ceil(stageW * DPR / W)));
const layer = wx.createCanvas(); layer.width = W * K; layer.height = H * K;
const bg = wx.createCanvas(); bg.width = W * K; bg.height = H * K;
let ctx = layer.getContext('2d');

let mode = 'ready', elapsed = 0, score = 0, combo = 0, caught = 0, lives = 3;
let best = 0, items = [], particles = [], popups = [], spawnIn = 0, spawnCount = 0;
let player = {x: 480, invincible: 0, moving: false}, lastTime = 0, visualTime = 0, shake = 0;
let pointerId = null, pointerTarget = null, soundOn = false, audio = null;
const keys = new Set(), sideTouches = new Map();
let card = null;
try { const saved = Number(wx.getStorageSync(BEST_KEY)); if (Number.isFinite(saved) && saved >= 0) best = Math.floor(saved); } catch (_) { /* 存储不可用也能玩 */ }
try { soundOn = wx.getStorageSync(SOUND_KEY) === 'on'; } catch (_) {}

function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }
function label(text, x, y, size, color, align = 'left', family = 'monospace') { ctx.fillStyle = color; ctx.font = `bold ${size}px ${family}`; ctx.textAlign = align; ctx.fillText(text, x, y); }
function sprite(rows, x, y, s, palette) { for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) { const color = palette[rows[r][c]]; if (color) rect(x + c * s, y + r * s, s, s, color); } }
const coalSprite = ['...xx.xxxx....', '..xxxxxxxxx...', '.xxxxxxxxxxx..', 'xxxxxxxxxxxxx.', '.xxWWxxxWWxxx.', 'xxxWKxxxWKxxxx', '.xxWWxxxWWxxx.', 'xxxxxxxxxxxxx.', '.xxxxPPxxxxx..', '..xxxxxxxxx...', '...xxxxxxx....'];
const coffeeSprite = ['..ss..ss....', '...s...s....', '............', '.dddddddddd.', '..wwwwwwwdd.', '..wwwwwww.dd', '..ooooooo.dd', '..ooooooo.dd', '..wwwwwwwdd.', '..wwwwwww...', '...ddddd....'];
const bugSprite = ['..d.....d...', '...d...d....', '.ddddddddd..', '..rrrrrrr...', 'ddrrwrrwrdd.', '..rrwrrwr...', 'ddrrrrrrrdd.', '..rrrrrrr...', '.ddddddddd..', '..d.....d...'];
const heartSprite = ['.xx.xx.', 'xxxxxxx', 'xxxxxxx', '.xxxxx.', '..xxx..', '...x...'];
function coal(x, y, moving = false, ghost = false) {
  if (ghost) ctx.globalAlpha = .45;
  rect(x - 25, y + 24, 54, 6, 'rgba(108,128,109,.25)');
  const step = moving ? Math.sin(visualTime * 19) * 3 : 0;
  rect(x - 16, y + 17 + step, 12, 7, '#ba8052'); rect(x + 7, y + 17 - step, 12, 7, '#ba8052');
  sprite(coalSprite, x - 28, y - 25 + Math.sin(visualTime * 5) * 1.5, 4, {x: '#273431', W: '#fffde3', K: '#273431', P: '#d99276'});
  rect(x - 32, y + 3, 7, 9, '#273431'); rect(x + 24, y + 3, 7, 9, '#273431');
  if (ghost) ctx.globalAlpha = 1;
}
function coffee(x, y, s = 3) { sprite(coffeeSprite, x - 6 * s, y - 5 * s, s, {s: '#91a58c', d: '#485d43', w: '#fff9dc', o: '#e9a65b'}); }
function bug(x, y, s = 3) { sprite(bugSprite, x - 6 * s, y - 5 * s, s, {d: '#a34742', r: '#df7b61', w: '#fff6d6'}); }
function plant(x, y, k = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  rect(-3, -54, 6, 44, '#526e47'); rect(-20, -53, 17, 12, '#789956'); rect(-25, -58, 13, 9, '#789956'); rect(2, -70, 17, 13, '#5f814b'); rect(12, -77, 10, 13, '#5f814b'); rect(2, -39, 21, 11, '#8aa760'); rect(-19, -34, 16, 11, '#5f814b'); rect(-15, -15, 32, 7, '#ae7e57'); rect(-12, -8, 26, 24, '#c4966b'); rect(-7, -5, 5, 17, '#d9b18a'); ctx.restore();
}
function monitor(x, y) { rect(x + 5, y + 63, 64, 5, '#8d9d80'); rect(x + 32, y + 45, 10, 19, '#5c725b'); rect(x, y, 80, 51, '#526c59'); rect(x + 5, y + 5, 70, 37, '#b1c9a7'); rect(x + 10, y + 10, 59, 27, '#3e6556'); rect(x + 15, y + 16, 16, 3, '#a2c68c'); rect(x + 15, y + 23, 31, 3, '#7ca77b'); rect(x + 15, y + 30, 23, 2, '#d9c18a'); rect(x + 35, y + 45, 8, 2, '#c8d0b1'); }
function office() {
  rect(0, 0, W, H, '#d5dfc5'); rect(0, 0, W, 16, '#8ba17c'); rect(0, 16, W, 7, '#c0cead');
  for (let x = 0; x < W; x += 96) rect(x, 23, 2, 304, '#ccd7bb');
  rect(327, 48, 304, 188, '#b6c4a3'); rect(332, 43, 294, 186, '#5d7965'); rect(340, 51, 278, 169, '#eee2b8'); rect(347, 58, 264, 153, '#d8dfbe');
  rect(347, 58, 264, 79, '#e6ddba'); rect(347, 137, 264, 74, '#c9d4b4'); rect(538, 78, 31, 31, '#f5c985'); rect(532, 85, 43, 17, '#f5c985');
  const buildings = [[351, 159, 31, 52], [390, 135, 36, 76], [432, 169, 47, 42], [484, 147, 28, 64], [523, 159, 40, 52], [570, 126, 35, 85]];
  for (const [x, y, w, h] of buildings) { rect(x, y, w, h, '#a9bc9c'); for (let wy = y + 9; wy < 204; wy += 15) for (let wx = x + 6; wx < x + w - 4; wx += 12) rect(wx, wy, 4, 5, '#d8dcb3'); }
  rect(477, 52, 7, 162, '#68866d'); rect(340, 126, 278, 7, '#68866d'); rect(324, 222, 309, 10, '#8ca17d'); rect(320, 232, 318, 6, '#b6c4a3');
  rect(65, 75, 166, 7, '#8c9c77'); rect(70, 82, 5, 9, '#657c5d'); rect(217, 82, 5, 9, '#657c5d');
  ['#c2926a', '#9baf8c', '#809982', '#d6bc7d', '#9eae8b'].forEach((c, i) => { rect(77 + i * 17, 40 + (i % 2) * 7, 12, 35 - (i % 2) * 7, c); rect(79 + i * 17, 46 + (i % 2) * 7, 8, 2, '#e7e1b9'); }); plant(205, 65, .45);
  rect(79, 130, 104, 79, '#96aa86'); rect(84, 135, 94, 69, '#f0e9c9'); label('LESS BUG', 131, 159, 11, '#708064', 'center'); label('MORE', 131, 175, 10, '#9a9c77', 'center'); label('COFFEE', 131, 192, 13, '#ab8551', 'center');
  rect(750, 87, 68, 65, '#8ba17e'); rect(756, 81, 56, 65, '#f5efd2'); rect(750, 87, 68, 53, '#f5efd2'); rect(779, 91, 5, 6, '#6b815f'); rect(779, 131, 5, 6, '#6b815f'); rect(759, 111, 6, 5, '#6b815f'); rect(798, 111, 6, 5, '#6b815f'); rect(779, 106, 4, 13, '#5c725a'); rect(779, 115, 16, 4, '#5c725a');
  rect(733, 183, 127, 53, '#9eaf89'); rect(738, 188, 117, 43, '#e9e5bc'); label('18:00', 796, 210, 19, '#70815d', 'center'); label('TIME TO GO!', 796, 224, 8, '#98a17b', 'center');
  rect(0, 316, W, 12, '#a9b998'); rect(0, 328, W, 6, '#6f8c70'); rect(0, 334, W, 206, '#b6c6a0');
  for (let y = 350; y < H; y += 40) { rect(0, y, W, 2, '#a8bb95'); for (let x = (y % 80 ? 0 : 48); x < W; x += 96) rect(x, y, 2, 40, '#a8bb95'); }
  rect(0, 334, W, 18, 'rgba(148,171,133,.38)');
  rect(38, 313, 252, 12, '#78916d'); rect(46, 325, 235, 8, '#9aab83'); rect(53, 333, 10, 65, '#7e926d'); rect(263, 333, 10, 65, '#7e926d'); monitor(85, 245); rect(90, 315, 84, 5, '#dce1bc'); rect(194, 296, 16, 17, '#f2dfba'); rect(210, 299, 7, 10, '#b1b79a'); rect(202, 287, 2, 7, '#a7b599');
  rect(659, 313, 262, 12, '#78916d'); rect(668, 325, 246, 8, '#9aab83'); rect(676, 333, 10, 65, '#7e926d'); rect(896, 333, 10, 65, '#7e926d'); monitor(763, 245); rect(760, 315, 90, 5, '#dce1bc'); plant(706, 297, .7);
  rect(176, 353, 60, 13, '#889d78'); rect(182, 337, 48, 24, '#889d78'); rect(187, 341, 38, 13, '#a0b48c'); rect(202, 366, 7, 29, '#718968'); rect(182, 395, 46, 5, '#718968');
  rect(791, 353, 60, 13, '#889d78'); rect(797, 337, 48, 24, '#889d78'); rect(802, 341, 38, 13, '#a0b48c'); rect(817, 366, 7, 29, '#718968'); rect(797, 395, 46, 5, '#718968');
  plant(33, 394, .8); plant(931, 395, .85);
  rect(0, 508, W, 32, '#a2b68f'); rect(0, 508, W, 3, '#718c68');
  label('SOOTY & CO.', 25, 530, 10, '#718b66'); label('EST. 09:00 — OUT. 18:00', W - 22, 530, 9, '#718b66', 'right');
  for (let y = 3; y < H; y += 4) rect(0, y, W, 1, 'rgba(24,55,43,.024)');
}

function tone(frequency, duration = .09, type = 'square', volume = .035) {
  if (!soundOn || !audio) return;
  try { const o = audio.createOscillator(), g = audio.createGain(); o.type = type; o.frequency.value = frequency; g.gain.setValueAtTime(volume, audio.currentTime); g.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration); o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + duration); } catch (_) { /* 声音可选 */ }
}
function enableAudio() { try { if (!wx.createWebAudioContext) return false; if (!audio) audio = wx.createWebAudioContext(); if (audio.state === 'suspended' && audio.resume) audio.resume(); return true; } catch (_) { return false; } }
function toggleSound() { soundOn = !soundOn; if (soundOn && !enableAudio()) soundOn = false; try { wx.setStorageSync(SOUND_KEY, soundOn ? 'on' : 'off'); } catch (_) {} if (soundOn) tone(660); }
function buzz() { try { wx.vibrateShort && wx.vibrateShort({type: 'medium'}); } catch (_) {} }

function pad3(n) { return String(n).padStart(3, '0'); }
function timerText() { const s = Math.max(0, Math.ceil(ROUND - elapsed)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
function comboText() { return combo ? `${combo} 连击 · ${Math.min(3, 1 + Math.floor(combo / 5))}× COFFEE` : 'LET\'S MAKE IT TO 18:00'; }
function releaseControls() { keys.clear(); sideTouches.clear(); pointerId = null; pointerTarget = null; player.moving = false; }
function showCard(tag, title, lines, button, hint) { card = {tag, title, lines, button, hint}; }
function start() {
  mode = 'playing'; elapsed = 0; score = 0; combo = 0; caught = 0; lives = 3; items = []; particles = []; popups = []; spawnIn = .55; spawnCount = 0; shake = 0; player = {x: 480, invincible: 0, moving: false}; releaseControls();
  card = null; lastTime = Date.now(); if (soundOn) enableAudio();
}
function pause() {
  if (mode === 'playing') { mode = 'paused'; releaseControls(); showCard('TAKE A LITTLE BREAK', '摸鱼时间', ['喘口气，咖啡和 bug 都会等你。'], '继续 →', '倒计时也在休息'); }
  else if (mode === 'paused') { mode = 'playing'; lastTime = Date.now(); card = null; }
}
function finish(win) {
  mode = 'over'; releaseControls(); const record = score > best;
  if (record) { best = score; try { wx.setStorageSync(BEST_KEY, String(best)); } catch (_) {} }
  showCard(win ? '18:00 · 今日工位已关闭' : 'LOW BATTERY · 休息一下也没关系', win ? '准点下班！' : '小煤球需要充电',
    [`接住 ${caught} 杯咖啡，获得 ${score} 分。`, record ? '刷新个人最佳！' : win ? '把工作留在工位，快乐带回家。' : '下次一定能顺利下班。'], '再来一局 →', '');
  tone(win ? 880 : 150, .3, 'triangle', .08);
}
function burst(x, y, color) { for (let i = 0; i < 12; i++) particles.push({x, y, vx: (Math.random() - .5) * 160, vy: -50 - Math.random() * 120, life: .6, color}); }
function spawn() {
  const type = spawnCount === 0 || Math.random() > .38 ? 'coffee' : 'bug'; let x = spawnCount === 0 ? 480 : 55 + Math.random() * 850;
  for (let n = 0; n < 8 && items.some(i => i.y < 105 && Math.abs(i.x - x) < 65); n++) x = 55 + Math.random() * 850;
  items.push({type, x, y: -24, speed: (type === 'coffee' ? 126 : 142) + elapsed * 1.55 + Math.random() * 23}); spawnCount++;
}
function update(dt) {
  if (mode !== 'playing') return;
  elapsed = Math.min(ROUND, elapsed + dt); player.invincible = Math.max(0, player.invincible - dt); shake = Math.max(0, shake - dt);
  const direction = (keys.has('R') ? 1 : 0) - (keys.has('L') ? 1 : 0);
  const oldX = player.x;
  if (direction) { player.x += direction * 410 * dt; pointerTarget = null; }
  else if (pointerTarget !== null) { const diff = pointerTarget - player.x; player.x += Math.sign(diff) * Math.min(Math.abs(diff), 600 * dt); }
  player.x = Math.max(35, Math.min(W - 35, player.x)); player.moving = Math.abs(oldX - player.x) > .25;
  spawnIn -= dt; if (spawnIn <= 0) { spawn(); spawnIn = Math.max(.34, .79 - elapsed * .006); }
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]; item.y += item.speed * dt;
    const hit = Math.abs(item.x - player.x) < (item.type === 'coffee' ? 35 : 32) && Math.abs(item.y - PLAYER_Y) < 30;
    if (hit) {
      items.splice(i, 1);
      if (item.type === 'coffee') { combo++; caught++; const points = 10 * Math.min(3, 1 + Math.floor(combo / 5)); score += points; popups.push({x: item.x, y: PLAYER_Y - 38, text: `+${points}`, life: .85, color: '#fffbe1'}); burst(item.x, item.y, '#f4d481'); tone(520 + Math.min(combo, 12) * 45); }
      else if (player.invincible === 0) { lives--; combo = 0; player.invincible = 1.65; shake = .2; popups.push({x: player.x, y: PLAYER_Y - 40, text: 'BUG! −1', life: 1, color: '#a7453d'}); burst(item.x, item.y, '#df8669'); tone(110, .18, 'sawtooth', .035); buzz(); if (lives === 0) { finish(false); return; } }
    } else if (item.y > H + 24) { items.splice(i, 1); if (item.type === 'coffee') combo = 0; }
  }
  for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 400 * dt; p.life -= dt; if (p.life <= 0) particles.splice(i, 1); }
  for (let i = popups.length - 1; i >= 0; i--) { popups[i].y -= 26 * dt; popups[i].life -= dt; if (popups[i].life <= 0) popups.splice(i, 1); }
  if (elapsed >= ROUND) finish(true);
}

// —— 画面 ——
let bgReady = false;
function drawStage() {
  if (!bgReady) { ctx = bg.getContext('2d'); ctx.setTransform(K, 0, 0, K, 0, 0); office(); bgReady = true; ctx = layer.getContext('2d'); }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(bg, 0, 0); ctx.setTransform(K, 0, 0, K, 0, 0);
  if (mode === 'ready') { coffee(390, 280); coffee(605, 146); bug(258, 215); bug(707, 175); }
  for (const item of items) { rect(item.x - 13, 488, 26, 4, 'rgba(82,105,65,.1)'); if (item.type === 'coffee') coffee(item.x, item.y); else bug(item.x, item.y); }
  coal(player.x, PLAYER_Y, player.moving, player.invincible > 0 && Math.floor(visualTime * 12) % 2 === 0);
  for (const p of particles) { ctx.globalAlpha = Math.min(1, p.life * 2); rect(p.x, p.y, 5, 5, p.color); } ctx.globalAlpha = 1;
  for (const p of popups) { ctx.globalAlpha = Math.min(1, p.life * 2); label(p.text, p.x + 1, p.y + 1, 17, '#526448', 'center'); label(p.text, p.x, p.y, 17, p.color, 'center'); } ctx.globalAlpha = 1;
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath(); }
function text(g, s, x, y, size, color, align = 'left', weight = 'bold', family = 'sans-serif') { g.fillStyle = color; g.font = `${weight} ${size}px ${family}`; g.textAlign = align; g.textBaseline = 'alphabetic'; g.fillText(s, x, y); }
// 读数栏里的两个小按钮用屏幕坐标；卡片用舞台坐标。
const HUD = {sound: {x: stageLeft + stageW - 94, y: barY + 4, w: 44, h: 38}, pause: {x: stageLeft + stageW - 44, y: barY + 4, w: 44, h: 38}};
const CARD = {x: 190, y: 92, w: 580, h: 356}, CARD_BUTTON = {x: 320, y: 292, w: 320, h: 74};
function drawHud(g) {
  const top = barY, left = stageLeft, right = stageLeft + stageW;
  text(g, '今日战绩', left + 2, top + 15, 10, '#7c8874', 'left', 'normal');
  text(g, pad3(score), left + 2, top + 38, 21, '#26392f', 'left', 'bold', 'monospace'); text(g, '分', left + 44, top + 37, 10, '#7c8874', 'left', 'normal');
  text(g, '下班倒计时', left + stageW / 2, top + 15, 10, '#7c8874', 'center', 'normal');
  text(g, timerText(), left + stageW / 2, top + 38, 21, '#477354', 'center', 'bold', 'monospace');
  ctx = g; for (let i = 0; i < 3; i++) sprite(heartSprite, HUD.sound.x - 84 + i * 26, top + 14, 3, {x: i < lives ? '#dc7a59' : '#e0d2c4'}); ctx = layer.getContext('2d');
  const box = b => { g.strokeStyle = '#cdd6c5'; g.lineWidth = 1.5; roundRect(g, b.x + 4, b.y + 3, b.w - 8, b.h - 6, 5); g.stroke(); };
  const b = HUD.sound, cx = b.x + 16, cy = b.y + b.h / 2; box(b);
  g.fillStyle = '#26392f'; g.beginPath(); g.moveTo(cx - 6, cy - 4); g.lineTo(cx - 2, cy - 4); g.lineTo(cx + 3, cy - 9); g.lineTo(cx + 3, cy + 9); g.lineTo(cx - 2, cy + 4); g.lineTo(cx - 6, cy + 4); g.closePath(); g.fill();
  g.strokeStyle = '#26392f'; g.lineWidth = 1.8; g.beginPath();
  if (soundOn) { g.arc(cx + 3, cy, 6, -.9, .9); g.moveTo(cx + 3 + 10 * Math.cos(-.9), cy + 10 * Math.sin(-.9)); g.arc(cx + 3, cy, 10, -.9, .9); } else { g.moveTo(cx + 7, cy - 5); g.lineTo(cx + 15, cy + 5); g.moveTo(cx + 15, cy - 5); g.lineTo(cx + 7, cy + 5); }
  g.stroke();
  const p = HUD.pause, px = p.x + p.w / 2, py = p.y + p.h / 2; box(p);
  g.fillStyle = mode === 'playing' ? '#26392f' : '#b8c2b2';
  if (mode === 'paused') { g.beginPath(); g.moveTo(px - 5, py - 8); g.lineTo(px + 8, py); g.lineTo(px - 5, py + 8); g.closePath(); g.fill(); } else { g.fillRect(px - 6, py - 8, 4, 16); g.fillRect(px + 2, py - 8, 4, 16); }
}
function drawStageText(g) {
  if (mode === 'playing' && elapsed > 50) { text(g, '快下班啦！', 481, 41, 26, '#526448', 'center'); text(g, '快下班啦！', 480, 40, 26, '#a86a3b', 'center'); }
  text(g, comboText(), 480, 531, 18, combo ? '#aa703f' : '#718b66', 'center', 'bold', 'monospace');
}
function drawCard(g) {
  if (!card) return;
  g.fillStyle = 'rgba(219,231,206,.35)'; g.fillRect(0, 0, W, H);
  const c = CARD; g.fillStyle = 'rgba(52,78,62,.22)'; g.fillRect(c.x + 8, c.y + 8, c.w, c.h);
  g.fillStyle = 'rgba(255,253,240,.97)'; g.fillRect(c.x, c.y, c.w, c.h); g.strokeStyle = '#3f5846'; g.lineWidth = 3; g.strokeRect(c.x, c.y, c.w, c.h);
  text(g, card.tag, 480, c.y + 40, 15, '#78916c', 'center', 'normal', 'monospace');
  text(g, card.title, 480, c.y + 92, 40, '#26392f', 'center');
  card.lines.forEach((line, i) => text(g, line, 480, c.y + 138 + i * 32, 22, '#5f6e55', 'center', 'normal'));
  const b = CARD_BUTTON; g.fillStyle = '#344e3e'; g.fillRect(b.x, b.y + 5, b.w, b.h); g.fillStyle = pressedCard ? '#f5b97c' : '#efaa68'; g.fillRect(b.x, b.y + (pressedCard ? 4 : 0), b.w, b.h);
  g.strokeStyle = '#344e3e'; g.lineWidth = 3; g.strokeRect(b.x, b.y + (pressedCard ? 4 : 0), b.w, b.h);
  text(g, card.button, 480, b.y + 47 + (pressedCard ? 4 : 0), 28, '#26392f', 'center');
  text(g, card.hint || (sideButtons ? '两侧方向键，或手指拖动小煤球' : '手指拖动小煤球左右走'), 480, c.y + 318, 16, '#8c967d', 'center', 'normal');
  text(g, `个人最佳 ${pad3(best)}  ·  © 我的AI小木屋`, 480, c.y + 343, 14, '#a3ab95', 'center', 'normal');
}
function drawSideButton(side) {
  const b = buttonBox(side), down = [...sideTouches.values()].includes(side), g = screen;
  g.fillStyle = down ? '#dae5cd' : '#f7f7e9'; roundRect(g, b.x, b.y, b.w, b.h, 10); g.fill(); g.strokeStyle = '#a9bba2'; g.lineWidth = 1.5; g.stroke();
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, d = side === 'L' ? -1 : 1, a = Math.min(18, b.w * .28);
  g.strokeStyle = '#26392f'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx - d * a, cy); g.lineTo(cx + d * a, cy); g.moveTo(cx + d * a * .2, cy - a * .8); g.lineTo(cx + d * a, cy); g.lineTo(cx + d * a * .2, cy + a * .8); g.stroke(); g.lineCap = 'butt';
}
let pressedCard = false;
function render() {
  drawStage();
  const g = screen;
  g.setTransform(DPR, 0, 0, DPR, 0, 0); g.fillStyle = '#e8ede4'; g.fillRect(0, 0, SW, SH);
  const sx = shake > 0 ? Math.round((Math.random() - .5) * 6) * scale : 0, sy = shake > 0 ? Math.round((Math.random() - .5) * 4) * scale : 0;
  g.fillStyle = '#344e3e'; g.fillRect(stageLeft - 3, stageTop - 3, stageW + 6, stageH + 6);
  g.imageSmoothingEnabled = true; g.drawImage(layer, stageLeft + sx, stageTop + sy, stageW, stageH);
  g.setTransform(DPR * scale, 0, 0, DPR * scale, DPR * stageLeft, DPR * stageTop);
  g.save(); g.beginPath(); g.rect(0, 0, W, H); g.clip(); drawStageText(g); drawCard(g); g.restore();
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawHud(g);
  if (sideButtons) { drawSideButton('L'); drawSideButton('R'); }
}
function frame() {
  const now = Date.now(); const dt = Math.max(0, Math.min(.05, (now - lastTime) / 1000)); lastTime = now;
  if (mode !== 'paused') visualTime += dt; update(dt); render(); requestAnimationFrame(frame);
}

// —— 触控 ——
const toStage = t => ({x: (t.clientX - stageLeft) / scale, y: (t.clientY - stageTop) / scale});
const inBox = (p, b, padding = 0) => p.x >= b.x - padding && p.x <= b.x + b.w + padding && p.y >= b.y - padding && p.y <= b.y + b.h + padding;
function sideOf(t) {
  if (!sideButtons) return null;
  const p = {x: t.clientX, y: t.clientY};
  if (p.y < stageTop) return null;
  if (p.x < stageLeft) return 'L'; if (p.x > stageLeft + stageW) return 'R'; return null;
}
function syncKeys() { keys.clear(); for (const s of sideTouches.values()) keys.add(s); }
function onTouchStart(e) {
  for (const t of e.changedTouches || []) {
    const p = toStage(t), raw = {x: t.clientX, y: t.clientY};
    if (inBox(raw, HUD.sound, 4)) { toggleSound(); continue; }
    if (card) { if (inBox(p, CARD_BUTTON, 18)) pressedCard = t.identifier; continue; }
    if (inBox(raw, HUD.pause, 4)) { pause(); continue; }
    if (mode !== 'playing') continue;
    const side = sideOf(t);
    if (side) { sideTouches.set(t.identifier, side); syncKeys(); continue; }
    if (p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H) { pointerId = t.identifier; pointerTarget = p.x; }
  }
}
function onTouchMove(e) {
  for (const t of e.changedTouches || []) {
    if (t.identifier === pointerId && mode === 'playing') pointerTarget = toStage(t).x;
    if (sideTouches.has(t.identifier)) { const side = sideOf(t); if (side) sideTouches.set(t.identifier, side); else sideTouches.delete(t.identifier); syncKeys(); }
  }
}
function onTouchEnd(e) {
  for (const t of e.changedTouches || []) {
    if (pressedCard !== false && t.identifier === pressedCard) { pressedCard = false; if (inBox(toStage(t), CARD_BUTTON, 18)) { if (mode === 'paused') pause(); else start(); } }
    if (t.identifier === pointerId) { pointerId = null; pointerTarget = null; }
    if (sideTouches.delete(t.identifier)) syncKeys();
  }
}
function onTouchCancel(e) { pressedCard = false; for (const t of e.changedTouches || []) { if (t.identifier === pointerId) { pointerId = null; pointerTarget = null; } sideTouches.delete(t.identifier); } syncKeys(); }
wx.onTouchStart(onTouchStart); wx.onTouchMove(onTouchMove); wx.onTouchEnd(onTouchEnd); wx.onTouchCancel(onTouchCancel);
wx.onHide(() => { releaseControls(); if (mode === 'playing') pause(); });
showCard('17:59 · 下班前的最后一分钟', '小煤球，开工啦！', ['接住咖啡，避开 bug。', '守住 3 颗小红心，撑到下班！'], '开始上班 →', '');
lastTime = Date.now(); requestAnimationFrame(frame);
