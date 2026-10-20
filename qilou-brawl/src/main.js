// 骑楼擂台 · 画面、输入、HUD。玩法逻辑全在 core.js（Node 里也能跑），这里只读它的状态来摆角色、放动作。
import * as pc from 'playcanvas';
import { Scene, Character, Animation, SkyDome } from '@viggle/splat-engine';
import C from './core.js';
import { buildStreet, addLights } from './street.js';
import { sfx, renderOffline } from './audio.js';

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const REC = q.has('record'); // 录屏：先停在标题 2.5 s，再让自动驾驶打完整局，对白自动翻页，所有发声记时间供离线渲染音轨
const VIEW = q.get('view'), AUTO = q.has('auto') || REC, SEED = +(q.get('seed') || 5), FAST = +(q.get('fast') || 1);
if (REC) window.__qilouRec = [];
const ASSET = './assets/';
const DEG = 180 / Math.PI;
// core 的朝向 a 是 forward=(sin a, cos a)；动作库片段的正面在 setRotation 角度 = a·180/π 时朝 +z。
// 两段片段和动作库其他片段朝向不一致，要额外补：格斗架势待机 -90°（截图量的）；文字生成的出拳 +45°
// （命中时刻量「盆骨到伸得最远的手」的方向，刺拳、直拳、上勾拳、阿婆拍都在 -135° 上下，2026-10-20）。
// 改素材文件里根骨的旋转不行：引擎不按文件的竖直轴解读根骨，按 Y、按 Z 转都会让人倒下。
const yawOf = (a) => a * DEG;
const CLIP_YAW = { idle: -90, punch: 45 };

// 片段：名字 → 文件。出拳连段若缺，退到前踢。
const CLIPS = {
  idle: 'fighting_stance_idle', stand: 'standing_idle', run: 'running', walk: 'walking', kick: 'front_kick', spin: 'spinning_back_kick',
  round: 'round_kick', roll: 'dodge_roll_forward', block: 'block', hurt: 'head_hit_reaction', hurt2: 'hit_reaction_front',
  down: 'knocked_down_backwards', getup: 'getting_up_after_knockdown', cheer: 'cheering', punch: 'punch_combo'
};
// 每个招式对应的片段段落：[片段, 起点秒, 段长秒]。播放速度 = 段长 / 招式时长。
const MOVE_CLIP = { // 段落按片段里拳脚打到最远的那一帧对齐招式的命中时刻（逐帧截图量的：刺拳 0.45 s、上勾拳 1.35 s、前踢 0.45 s）
  jab: ['punch', .165, .75], cross: ['punch', .77, .6], upper: ['punch', .97, .9],
  kick: ['kick', 0, .95], spin: ['spin', 0, 1.5],
  slap: ['punch', .04, .75], belly: ['run', 0, 2.13], bite: ['kick', 0, .8], sweep: ['round', 0, 1.2], leap: ['run', 0, 2.13]
};
const CHARS = { player: 'wusheng', apo: 'apo', baozugong: 'baozugong', lionhead: 'lionhead' };
const NAMES = { apo: '早茶阿婆', baozugong: '包租公', lionhead: '醒狮头' };
const LINES = [
  [['阿婆', '后生仔，饮咗茶未啊？'], ['阿龙', '擂台开锣，借借路！']],
  [['包租公', '呢条街嘅铺租，你交咗未？'], ['阿龙', '我系嚟打擂台嘅！']],
  [['包租公', '想过去？问过我个肚腩先！']],
  [['醒狮头', '想上擂台？先过我呢关！'], ['阿龙', '醒狮点睛，今晚系我！']]
];
const PHASE2_LINE = ['醒狮头', '采青！街坊，帮手！'];

let scene, sim, bot, chars = new Map(), have = new Set(), started = false, paused = false, talk = null;
let winCam = false, camYaw = 0, camDist = 5.2, camPos = new pc.Vec3(0, 3, -4), camLook = new pc.Vec3(0, 1, 2), shake = 0;
const keys = new Set(), stick = { x: 0, y: 0 }, pressed = {};
window.__qilou = { ready: false };

async function boot() {
  const canvas = $('game');
  scene = await Scene.create(canvas, { fov: 52, depth: true, far: 220, antialias: true, maxPixelRatio: VIEW ? 1 : 2, preserveDrawingBuffer: !!VIEW });
  scene.start();
  SkyDome.create(scene, { topColor: '#3B3A6B', bottomColor: '#F6A96B' });
  const st = buildStreet(scene.app, { halfW: C.HALF_W });
  scene.app.root.addChild(st.root); addLights(scene.app, scene.app.root);
  setLoad(.1, '搭骑楼街');
  const files = Object.entries(CLIPS);
  let n = 0;
  await Promise.all(files.map(async ([key, file]) => {
    try { await Animation.loadGlb(scene, `${ASSET}motions/${file}.glb`, key); have.add(key); } catch (e) { if (key !== 'punch') throw e; }
    setLoad(.1 + .5 * (++n / files.length), '动作');
  }));
  for (const f of new Set(Object.values(CHARS))) Character.prefetch(`${ASSET}chars/${f}.vsplat`);
  sim = C.create({ seed: SEED });
  await ensureChar(sim.player);
  setLoad(.85, '角色');
  // 先把四个角色各加载一次，开打时不卡
  await Promise.all(['apo', 'baozugong', 'lionhead'].map((k) => fetch(`${ASSET}chars/${CHARS[k]}.vsplat`).then((r) => r.arrayBuffer()).catch(() => null)));
  setLoad(1, '');
  $('loading').classList.add('hidden');
  if (!VIEW && !AUTO) $('title').classList.remove('hidden');
  scene.app.on('update', frame);
  bindInput();
  window.__qilou = { ready: true, sim: () => sim, info, start: startGame, setPaused: (p) => (paused = p), snapshot, facing,
    renderAudio: (t0, seconds) => renderOffline(window.__qilouRec || [], t0, seconds), recStart: () => { recT = 0; } };
  if (VIEW) setupView(VIEW); else if (REC) $('title').classList.remove('hidden'); else if (AUTO) startGame();
}
function setLoad(f, label) { $('load-fill').style.width = (f * 100).toFixed(0) + '%'; if (label) $('load-label').textContent = label; }

async function ensureChar(o) {
  if (chars.has(o.id)) return chars.get(o.id);
  const v = { o, c: null, key: '', loading: true };
  chars.set(o.id, v);
  v.c = await Character.load(scene, `${ASSET}chars/${CHARS[o.kind]}.vsplat`, { position: { x: o.x, y: 0, z: o.z } });
  v.loading = false;
  return v;
}

// ---------- 状态 → 动作 ----------
function wantAnim(o) {
  const kind = o.kind, st = o.state;
  if (st === 'attack') {
    const [clip, from, segLen] = MOVE_CLIP[o.move]; const M = C.MOVES[o.move];
    const c = have.has(clip) ? clip : 'kick', len = c === clip ? segLen : 1.23, at = c === clip ? from : 0;
    return { clip: c, loop: clip === 'run', rate: len / M.dur * (kind !== 'player' && o.phase2 ? 1.15 : 1) * (kind === 'player' && sim.gongT > 0 ? C.FEEL.gong.rate : 1), at };
  }
  switch (st) {
    case 'move': return kind === 'player' ? (o.speed > 3 ? { clip: 'run', loop: true, rate: o.speed / 4.6 } : { clip: 'walk', loop: true, rate: 1.4 }) : { clip: kind === 'lionhead' || kind === 'apo' ? 'run' : 'walk', loop: true, rate: kind === 'apo' ? .8 : 1.1 };
    case 'roll': return { clip: 'roll', rate: 1.1 / C.FEEL.roll.dur };
    case 'block': return { clip: 'block', loop: true, rate: 1, at: .6 };
    case 'hurt': return { clip: 'hurt', rate: 2.6 };
    case 'broken': return { clip: 'hurt2', rate: 1.8 };
    case 'down': case 'dead': return { clip: 'down', rate: 1.27 / C.FEEL.down * 1.2 };
    case 'getup': return { clip: 'getup', rate: 1.8 / C.FEEL.getup };
    case 'win': return { clip: 'cheer', loop: true, rate: 1 };
    default: return { clip: kind === 'apo' || kind === 'baozugong' ? 'stand' : 'idle', loop: true, rate: 1 };
  }
}
function syncChar(v, dt) {
  const o = v.o, c = v.c; if (!c) return;
  c.setPosition(o.x, 0, o.z);
  const w = wantAnim(o);
  const key = `${o.state}|${o.move || ''}|${w.clip}`;
  if (key !== v.key || o.st < v.lastSt - 1e-6) {
    const fade = o.state === 'attack' ? .06 : o.state === 'hurt' ? .05 : .15;
    if (v.key === '') c.playAnimation(w.clip, { loop: !!w.loop, rootMotion: false });
    else c.crossfadeTo(w.clip, { duration: fade, loop: !!w.loop, rootMotion: false });
    // 侧身补偿和动作淡入同步过渡：两段骨骼混合时的侧身量与补偿量此消彼长，身体不会甩
    const to = CLIP_YAW[w.clip] || 0;
    v.yawFrom = v.key === '' ? to : (v.yawOff ?? to); v.yawTo = to; v.yawT = 0; v.yawDur = v.key === '' ? 0 : fade;
    if (w.at) c.animationTime = w.at;
    v.key = key;
  }
  v.lastSt = o.st;
  v.yawT = Math.min(v.yawDur || 0, (v.yawT || 0) + dt);
  v.yawOff = v.yawDur ? v.yawFrom + (v.yawTo - v.yawFrom) * (v.yawT / v.yawDur) : v.yawTo;
  c.setRotation(0, yawOf(o.a) + v.yawOff, 0);
  c.playbackSpeed = sim.hitstop > 0 ? .02 : w.rate;
  // 受击闪白、出招前闪金（预警）、二阶段泛红
  let tint = 0, col = { r: 1, g: 1, b: 1 };
  if (v.flash > 0) { v.flash -= dt; tint = Math.max(0, v.flash / .12) * .7; }
  else if (o.kind !== 'player' && o.state === 'attack' && o.warned && o.st < C.MOVES[o.move].hit) { tint = .3 + .15 * Math.sin(performance.now() / 40); col = C.MOVES[o.move].heavy ? { r: 1, g: .15, b: .1 } : { r: 1, g: .85, b: .3 }; }
  else if (o.kind === 'player' && sim.gongT > 0) { tint = .18; col = { r: 1, g: .6, b: .1 }; }
  c.setTint(tint, col);
  if (o.dead && !v.gone) { v.gone = true; c.setActive(false); }
}

// ---------- 主循环 ----------
let acc = 0, fps = 0, fpsN = 0, fpsT = 0, recT = -1, talkT = 0;
function frame(dt) {
  dt = Math.min(dt, .1); fpsN++; fpsT += dt; if (fpsT >= 1) { fps = fpsN / fpsT; fpsN = 0; fpsT = 0; }
  if (REC && recT >= 0) {
    recT += dt;
    if (!started && recT >= 2.5) { $('title').classList.add('hidden'); startGame(); }
    if (talk) { talkT += dt; if (talkT >= 2.4) { talkT = 0; nextLine(); } } else talkT = 0;
  }
  if (started && !paused && !talk && sim.phase === 'fight') {
    acc += dt * FAST;
    while (acc >= C.STEP) { acc -= C.STEP; C.step(sim, AUTO ? bot(sim) : readInput(), C.STEP); handleEvents(); for (const k in pressed) pressed[k] = false; }
  }
  for (const e of sim.enemies) if (!chars.has(e.id)) ensureChar(e);
  for (const v of chars.values()) syncChar(v, dt);
  updateCamera(dt);
  updateHud(dt);
  sfx.setTempo(sim.gongT > 0 ? 1.5 : sim.wave === 3 ? 1.2 : 1);
  sfx.tick(dt, started && sim.phase === 'fight');
}
function handleEvents() {
  for (const ev of sim.events) {
    const v = ev.id != null ? chars.get(ev.id) : null;
    switch (ev.type) {
      case 'hit': if (v) v.flash = .12; sfx.hit(ev.heavy); shake = Math.max(shake, ev.heavy ? .12 : .05); popup(ev); break;
      case 'whiff': case 'swing': sfx.whoosh(); break;
      case 'blocked': sfx.block(); break;
      case 'hurt': { const p = chars.get(0); if (p) p.flash = .15; sfx.hurt(); shake = .15; flashRed(); break; }
      case 'tell': sfx.tell(); break;
      case 'gong': sfx.gong(); banner('锣鼓喧天 · 二阶段'); break;
      case 'ko': sfx.smallGong(); break;
      case 'wave': if (ev.wave > 0 || started) say(LINES[ev.wave], C.WAVES[ev.wave].name); break;
      case 'phase2': say([PHASE2_LINE]); break;
      case 'clear': if (ev.wave < C.WAVES.length - 1) banner('往前走 ▲'); break;
      case 'win': sfx.gong(); winCam = true; setTimeout(() => showEnd(true), 2600); break;
      case 'lose': setTimeout(() => showEnd(false), 1400); break;
    }
  }
}

// ---------- 镜头 ----------
function updateCamera(dt) {
  const p = sim.player, k = 1 - Math.exp(-dt * (winCam ? 2 : 6));
  if (winCam) { camYaw += C.wrap(p.a + Math.PI - camYaw) * Math.min(1, dt * 1.5); camDist += (3.6 - camDist) * Math.min(1, dt * 2); }
  const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
  // 镜头不进骑楼：横向夹在街面以内
  const edge = C.HALF_W - 1.3, tx = Math.max(-edge, Math.min(edge, p.x * .55 - fx * camDist)), tz = p.z - fz * camDist, ty = 1.6 + camDist * .32;
  camPos.x += (tx - camPos.x) * k; camPos.y += (ty - camPos.y) * k; camPos.z += (tz - camPos.z) * k;
  const lx = p.x + fx * 1.6, lz = p.z + fz * 1.6;
  camLook.x += (lx - camLook.x) * k; camLook.y = 1.15; camLook.z += (lz - camLook.z) * k;
  shake = Math.max(0, shake - dt);
  const sx = (Math.random() - .5) * shake, sy = (Math.random() - .5) * shake;
  scene.cameraEntity.setPosition(camPos.x + sx, camPos.y + sy, camPos.z);
  scene.cameraEntity.lookAt(camLook.x, camLook.y, camLook.z);
}

// ---------- 输入 ----------
function readInput() {
  let fw = 0, rt = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) fw += 1; if (keys.has('KeyS') || keys.has('ArrowDown')) fw -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) rt += 1; if (keys.has('KeyA') || keys.has('ArrowLeft')) rt -= 1;
  fw += stick.y; rt += stick.x;
  const f = [Math.sin(camYaw), Math.cos(camYaw)], r = [-Math.cos(camYaw), Math.sin(camYaw)];
  return {
    mx: f[0] * fw + r[0] * rt, mz: f[1] * fw + r[1] * rt, walk: keys.has('ShiftLeft'),
    punch: pressed.punch, kick: pressed.kick, roll: pressed.roll, gong: pressed.gong, block: keys.has('KeyQ') || pressed.blockHeld
  };
}
function bindInput() {
  addEventListener('keydown', (e) => {
    if (e.repeat) return; keys.add(e.code); sfx.unlock();
    if (talk && (e.code === 'Space' || e.code === 'Enter')) return nextLine();
    if (e.code === 'KeyJ') pressed.punch = true; if (e.code === 'KeyK') pressed.kick = true;
    if (e.code === 'Space') { pressed.roll = true; e.preventDefault(); } if (e.code === 'KeyE') pressed.gong = true;
    if (e.code === 'KeyM') { sfx.setMuted(!sfx.muted); $('mute').textContent = sfx.muted ? '🔇' : '🔊'; }
    if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  const cv = $('game'); let drag = null;
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointerdown', (e) => {
    sfx.unlock(); if (e.pointerType === 'touch') return touchStart(e);
    drag = { x: e.clientX, moved: 0, btn: e.button }; cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return touchMove(e);
    if (!drag) return; const dx = e.clientX - drag.x; drag.x = e.clientX; drag.moved += Math.abs(dx); camYaw -= dx * .006;
  });
  cv.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'touch') return touchEnd(e);
    if (drag && drag.moved < 6) { if (talk) nextLine(); else if (drag.btn === 2) pressed.kick = true; else pressed.punch = true; }
    drag = null;
  });
  cv.addEventListener('wheel', (e) => { camDist = Math.max(3.4, Math.min(9, camDist + e.deltaY * .004)); }, { passive: true });
  // 触屏：左下摇杆、右下按钮、其余区域拖动转镜头
  const stickEl = $('stick'), knob = $('knob');
  let stickId = null, camTouch = null, origin = null;
  function touchStart(e) {
    if (talk) return nextLine();
    if (e.clientX < innerWidth * .45 && e.clientY > innerHeight * .4 && stickId === null) {
      stickId = e.pointerId; origin = { x: e.clientX, y: e.clientY }; stickEl.style.left = (e.clientX - 60) + 'px'; stickEl.style.top = (e.clientY - 60) + 'px'; stickEl.classList.add('on');
    } else if (camTouch === null) camTouch = { id: e.pointerId, x: e.clientX };
  }
  function touchMove(e) {
    if (e.pointerId === stickId) {
      let dx = e.clientX - origin.x, dy = e.clientY - origin.y; const d = Math.hypot(dx, dy), m = 50;
      if (d > m) { dx *= m / d; dy *= m / d; } stick.x = dx / m; stick.y = -dy / m; knob.style.transform = `translate(${dx}px,${dy}px)`;
    } else if (camTouch && e.pointerId === camTouch.id) { camYaw -= (e.clientX - camTouch.x) * .008; camTouch.x = e.clientX; }
  }
  function touchEnd(e) {
    if (e.pointerId === stickId) { stickId = null; stick.x = stick.y = 0; knob.style.transform = ''; stickEl.classList.remove('on'); }
    if (camTouch && e.pointerId === camTouch.id) camTouch = null;
  }
  for (const b of document.querySelectorAll('#pad button')) {
    const act = b.dataset.act;
    b.addEventListener('pointerdown', (e) => { e.stopPropagation(); sfx.unlock(); if (act === 'block') pressed.blockHeld = true; else pressed[act] = true; b.classList.add('down'); });
    const up = () => { if (act === 'block') pressed.blockHeld = false; b.classList.remove('down'); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
  }
  $('start').addEventListener('click', () => { sfx.unlock(); startGame(); });
  $('again').addEventListener('click', () => again());
  $('mute').addEventListener('click', () => { sfx.setMuted(!sfx.muted); $('mute').textContent = sfx.muted ? '🔇' : '🔊'; });
  $('pause-btn').addEventListener('click', togglePause);
  if (matchMedia('(pointer:coarse)').matches) document.body.classList.add('touch');
}
function togglePause() { if (!started || sim.phase !== 'fight') return; paused = !paused; $('paused').classList.toggle('hidden', !paused); }

// ---------- 流程 ----------
function startGame() {
  $('title').classList.add('hidden'); $('hud').classList.remove('hidden');
  started = true; bot = C.makeBot(SEED * 7, 1);
  C.start(sim, { wave: 0 }); handleEvents(); sim.events.length = 0;
}
function again() {
  $('end').classList.add('hidden');
  if (sim.phase === 'lose') { C.retry(sim); for (const v of chars.values()) if (v.o.dead && !sim.enemies.includes(v.o)) chars.delete(v.o.id); }
  else { for (const v of chars.values()) if (v.c && v.o.kind !== 'player') v.c.destroy(); chars = new Map([[0, chars.get(0)]]); const p = chars.get(0); sim = C.create({ seed: SEED + 1 }); p.o = sim.player; p.key = ''; winCam = false; camYaw = 0; camDist = 5.2; startGame(); }
}
function say(lines, title) {
  if (title) banner(title);
  if (!lines || !lines.length || (AUTO && !REC) || VIEW) return;
  talk = { lines: lines.slice(), i: 0 }; showLine();
}
function showLine() { const [who, text] = talk.lines[talk.i]; $('dialog').innerHTML = `<b>${who}</b>${text}<small>空格 / 点击 继续</small>`; $('dialog').classList.add('on'); }
function nextLine() { if (!talk) return; talk.i++; if (talk.i >= talk.lines.length) { talk = null; $('dialog').classList.remove('on'); } else showLine(); }
function showEnd(win) {
  $('end').classList.remove('hidden');
  $('end-title').textContent = win ? '醒狮点睛 · 阿龙夺魁' : '阿龙倒地';
  $('end-sub').textContent = win ? `击败 ${sim.kills} 人 · 用时 ${fmt(sim.t)}${sim.retries ? ` · 重来 ${sim.retries} 次` : ''}` : `倒在「${C.WAVES[sim.wave].name}」。从这一段重新开始？`;
  $('again').textContent = win ? '再打一场' : '再来';
}
const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// ---------- HUD ----------
let bannerT = 0;
function banner(text) { const b = $('banner'); b.textContent = text; b.classList.remove('on'); void b.offsetWidth; b.classList.add('on'); bannerT = 2.2; }
function flashRed() { const f = $('hurt-flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }
function popup(ev) {
  if (!scene || !ev.id) return; const o = sim.enemies.find((e) => e.id === ev.id); if (!o) return;
  const s = scene.cameraEntity.camera.worldToScreen(new pc.Vec3(o.x, 1.9, o.z));
  const el = document.createElement('div'); el.className = 'pop' + (ev.heavy ? ' big' : ''); el.textContent = Math.round(ev.dmg);
  el.style.left = s.x + 'px'; el.style.top = s.y + 'px'; $('popups').appendChild(el); setTimeout(() => el.remove(), 700);
}
function updateHud(dt) {
  if (!started) return;
  const p = sim.player;
  $('p-fill').style.width = (p.hp / C.PLAYER.hp * 100) + '%';
  $('gong-fill').style.width = (sim.gongT > 0 ? sim.gongT / C.FEEL.gong.dur * 100 : sim.gong) + '%';
  $('gong').classList.toggle('ready', sim.gong >= C.FEEL.gong.max && sim.gongT <= 0);
  $('gong').classList.toggle('active', sim.gongT > 0);
  $('combo').classList.toggle('on', sim.combo >= 3); $('combo-n').textContent = sim.combo;
  $('wave-name').textContent = sim.wave >= 0 ? `${C.WAVES[sim.wave].name}  ${sim.wave + 1} / ${C.WAVES.length}` : '';
  const boss = sim.enemies.find((e) => e.kind === 'lionhead' && !e.dead);
  $('boss').classList.toggle('on', !!boss);
  if (boss) $('boss-fill').style.width = (boss.hp / boss.maxHp * 100) + '%';
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('banner').classList.remove('on'); }
}

// ---------- 固定机位（验收用）----------
function setupView(v) {
  started = true; $('title').classList.add('hidden'); $('hud').classList.remove('hidden'); bot = C.makeBot(SEED * 7, 1);
  const w0 = v === 'stress' ? 2 : v === 'boss' ? 3 : 0;
  C.start(sim, { wave: w0 }); if (w0) sim.player.z = C.WAVES[w0].z0 + 4;
  const runFor = v === 'hero' ? 1.2 : v === 'stress' ? 6 : v === 'boss' ? 5 : 0.5;
  while (sim.t < runFor && sim.phase === 'fight') { C.step(sim, bot(sim), C.STEP); }
  sim.events.length = 0; paused = true;
  if (v === 'wide') { camDist = 9; camYaw = 0.35; }
  window.__qilou.view = v;
}
function info() {
  const p = sim.player;
  return { phase: sim.phase, wave: sim.wave, t: +sim.t.toFixed(2), hp: p.hp, x: +p.x.toFixed(2), z: +p.z.toFixed(2), state: p.state, enemies: sim.enemies.filter((e) => !e.dead).length,
    chars: [...chars.values()].filter((v) => v.c).length, anims: [...have], fps: Math.round(fps) };
}
// 验收用：从左右锁骨骨骼的世界坐标算身体实际朝向，和逻辑朝向比。返回角度差（度，-180..180）。
function facing(id = 0) {
  const v = chars.get(id); if (!v || !v.c) return null;
  const arm = v.c.armature, names = arm.boneNames, L = names.indexOf('clavicle_l'), R = names.indexOf('clavicle_r');
  const ml = arm.getBoneWorldMatrix(L), mr = arm.getBoneWorldMatrix(R); if (!ml || !mr) return null;
  const pl = ml.getTranslation(), pr = mr.getTranslation();
  const lx = pr.x - pl.x, lz = pr.z - pl.z;            // 左→右
  const body = Math.atan2(lz, -lx);                      // 身体正前方（符号用跑步已确认朝前的截图校准过），记成和 core 一样的 atan2(x, z)
  let d = (body - v.o.a) * DEG; d = (((d % 360) + 540) % 360) - 180; // JS 的 % 对负数取负，先折一次
  // 出拳方向：盆骨到水平方向伸得最远的那只手
  const pel = arm.getBoneWorldMatrix(arm.pelvisBoneIndex).getTranslation();
  let reach = null, far = 0;
  for (const h of ['hand_l', 'hand_r']) { const m = arm.getBoneWorldMatrix(names.indexOf(h)); if (!m) continue; const t = m.getTranslation(), dx = t.x - pel.x, dz = t.z - pel.z, r = Math.hypot(dx, dz); if (r > far) { far = r; reach = Math.atan2(dx, dz); } }
  let rd = reach == null ? null : (reach - v.o.a) * DEG; if (rd != null) rd = (((rd % 360) + 540) % 360) - 180;
  return { diff: Math.round(d), reach: rd == null ? null : Math.round(rd), far: +far.toFixed(2), state: v.o.state, move: v.o.move || '', st: v.o.st, clip: v.key.split('|')[2] };
}
function snapshot() {
  const cam = scene.cameraEntity.camera, p = sim.player;
  const pts = [[p.x, 0, p.z], [p.x, 1.7, p.z]].map(([x, y, z]) => cam.worldToScreen(new pc.Vec3(x, y, z)));
  return { feet: pts[0], head: pts[1], w: innerWidth, h: innerHeight };
}

boot().catch((e) => { console.error(e); $('load-label').textContent = '加载失败：' + e.message; window.__qilou = { ready: false, error: String(e && e.stack || e) }; });
