// 骑楼雨夜 · 入口：把逻辑（core）、场景（world）、虫（roaches）、特效、手持物、声音、界面接到一起，处理输入与主循环。
import * as THREE from 'three';
import * as C from './core.js';
import { createRenderer, createPipeline, createReflection, makeSky, makeRain, gpuName, frameInfo, FOG } from './gfx.js';
import { buildWorld } from './world.js';
import { createRoaches } from './roaches.js';
import { createFx } from './fx.js';
import { createGun } from './gun.js';
import { createAudio } from './audio.js';
import { createUI, loadSettings, saveSettings } from './ui.js';

window.__errors = [];
window.addEventListener('error', e => window.__errors.push(String(e.message)));
window.addEventListener('unhandledrejection', e => window.__errors.push(String(e.reason)));

const QUALITY = {
  low: { name: 'low', dpr: 1, bloom: false, reflect: false, shadow: false, rain: 900, particles: 300 },
  mid: { name: 'mid', dpr: 1.5, bloom: true, reflect: true, shadow: false, rain: 1600, particles: 500 },
  high: { name: 'high', dpr: 2, bloom: true, reflect: true, shadow: true, rain: 2600, particles: 800 },
};
const params = new URLSearchParams(location.search);
const settings = loadSettings();
const coarse = matchMedia('(pointer: coarse)').matches;
const quality = { ...(QUALITY[params.get('q') || settings.quality] || (coarse ? QUALITY.mid : QUALITY.high)) };
const STEP = 1 / 60;

const canvas = document.getElementById('view');
const ui = createUI(settings, quality);
ui.setTouch(coarse || params.has('touch'));
let touchMode = coarse || params.has('touch');
const audio = createAudio(); audio.setVolume(settings.vol);

const app = { mode: 'boot', sim: null, seed: +(params.get('seed') || 0) || (Date.now() % 100000), frozen: false, auto: null, bot: null, view: null, fps: 60, frame: { calls: 0, tris: 0 }, retries: 0, ready: false };
let renderer, pipeline, reflection, scene, camera, world, roaches, fx, gun, rain, flash, titleSim;
const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); blank.needsUpdate = true;
const shared = { uT: { value: 0 }, uRefl: { value: blank }, uRes: { value: new THREE.Vector2(1, 1) }, uUse: { value: 0 } };
const look = { yaw: C.START.yaw, pitch: 0, dx: 0, dy: 0 };
const keys = new Set(), inp = { fire: false, slap: false, use: false, reload: false, jump: false, mx: 0, mz: 0, tFire: false, tUse: false };
let trauma = 0, acc = 0, time = 0, last = 0, tickT = 0, emptyT = 0, lastHit = 0, locked = false, everLocked = false, dragging = false;
const _dir = new THREE.Vector3(), _tmp = new THREE.Vector3();

function boot() {
  ui.boot('正在下雨', 0.15);
  renderer = createRenderer(canvas, quality);
  scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(FOG.getHex(), 0.017); scene.background = FOG.clone();
  camera = new THREE.PerspectiveCamera(72, 1, 0.03, 950); camera.rotation.order = 'YXZ'; camera.layers.enable(1); scene.add(camera);
  scene.add(makeSky());
  scene.add(new THREE.HemisphereLight('#51648f', '#1a1418', 0.7));
  const moon = new THREE.DirectionalLight('#8fa2d8', 0.3); moon.position.set(-30, 60, -20); scene.add(moon);
  for (const [x, y, z, c] of [[0, 5, -46, '#ff5030'], [0, 5, -17, '#30d0c0'], [0, 5, 14, '#ff50c0'], [0, 5.5, 50, '#ffc080'], [22, 4, 0, '#ffcf80']]) { const l = new THREE.PointLight(c, 16, 30, 1.7); l.position.set(x, y, z); scene.add(l); }
  flash = new THREE.SpotLight('#fff1dc', 7, 48, 0.56, 0.75, 0.35); flash.position.set(0.1, -0.06, -0.44); flash.target.position.set(0, -0.6, -12);
  flash.castShadow = quality.shadow; flash.shadow.mapSize.set(1024, 1024); flash.shadow.camera.near = 0.4; flash.shadow.camera.far = 48; flash.shadow.bias = -0.0015; flash.shadow.normalBias = 0.03;
  camera.add(flash, flash.target);
  const hand = new THREE.PointLight('#ffe6c4', 0.16, 1.5, 2); hand.position.set(0.02, 0.08, -0.05); camera.add(hand);
  setTimeout(() => {
    ui.boot('正在砌骑楼', 0.45);
    setTimeout(() => {
      world = buildWorld(shared, quality); scene.add(world.group);
      ui.boot('正在放蟑螂', 0.8);
      roaches = createRoaches(scene, quality); fx = createFx(scene, quality); gun = createGun(camera, quality);
      rain = makeRain(quality.rain); scene.add(rain.mesh);
      pipeline = createPipeline(renderer, scene, camera, quality);
      reflection = quality.reflect ? createReflection(renderer, shared) : null;
      resize(); window.addEventListener('resize', resize);
      bind();
      toTitle();
      const v = params.get('view'), a = params.get('auto');
      if (v) gotoView(v); else if (a) { start(app.seed); setAuto(a); }
      requestAnimationFrame(t => { last = t; requestAnimationFrame(frame); });
      setTimeout(() => { app.ready = true; ui.bootDone(); }, 250);
    }, 30);
  }, 30);
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h; camera.fov = w < h ? 86 : 72; camera.updateProjectionMatrix();
  pipeline.resize(w, h); fx.resize(w, h, renderer.getPixelRatio());
}

// ---------- 状态切换 ----------
function toTitle() { app.mode = 'title'; titleSim = C.createSim(9, { god: true }); app.sim = titleSim; ui.show('title'); }
function start(seed) {
  app.seed = seed || (Date.now() % 100000);
  app.sim = C.createSim(app.seed); app.mode = 'play'; app.frozen = false; app.view = null; acc = 0; trauma = 0;
  look.yaw = C.START.yaw; look.pitch = 0; ui.reset(); ui.show('none'); audio.start();
  for (const e of app.sim.events) onEvent(e);
  if (!touchMode && !app.auto) lock();
}
function pause() { if (app.mode !== 'play') return; app.mode = 'paused'; ui.show('paused'); release(); clearInput(); }
function resume() { if (app.mode !== 'paused') return; app.mode = 'play'; ui.show('none'); audio.resume(); if (!touchMode) lock(); }
function end(kind) { app.mode = kind; ui.fillEnd(app.sim); setTimeout(() => { if (app.mode === kind) ui.show(kind); }, kind === 'dead' ? 900 : 600); release(); clearInput(); }
function lock() { if (canvas.requestPointerLock) { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* 锁不住就用拖动转头 */ } } canvas.focus({ preventScroll: true }); }
function release() { if (document.pointerLockElement) document.exitPointerLock(); }
function clearInput() { keys.clear(); inp.fire = inp.use = inp.tFire = inp.tUse = false; inp.mx = inp.mz = 0; dragging = false; }
// 自动驾驶时镜头跟着它的瞄准方向走，带一点缓动，录出来不至于一帧一甩
function follow(input) { look.yaw += C.wrap(input.yaw - look.yaw) * 0.2; look.pitch += (input.pitch - look.pitch) * 0.2; }
function setAuto(level) { app.auto = level || null; app.bot = level ? C.makeBot(level, app.seed) : null; }

ui.onAct(a => {
  audio.start();
  if (a === 'start') { app.retries = 0; start(); }
  else if (a === 'restart') { app.retries++; start(); }
  else if (a === 'resume') resume();
  else if (a === 'help' || a === 'settings') ui.panel(a);
  else if (a === 'close') ui.panel(null);
  else if (a === 'volume') audio.setVolume(settings.vol);
  else if (a.startsWith('quality:')) { settings.quality = a.slice(8); saveSettings(settings); location.reload(); }
});

// ---------- 输入 ----------
function bind() {
  const turn = (dx, dy) => { const k = 0.0023 * settings.sens; look.yaw -= dx * k; look.pitch = C.clamp(look.pitch - dy * k, -1.45, 1.45); look.dx += dx * 0.01; look.dy += dy * 0.01; };
  window.addEventListener('keydown', e => {
    if (e.code === 'Escape' || e.code === 'KeyP') { if (ui.panelOpen) ui.panel(null); else if (app.mode === 'play') pause(); else if (app.mode === 'paused') resume(); return; }
    if (app.mode !== 'play') return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'KeyK') inp.slap = true;
    if (e.code === 'KeyR') inp.reload = true;
    if (e.code === 'Space') inp.jump = true;
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => { clearInput(); if (app.mode === 'play' && !app.auto) pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); if (app.mode === 'play' && !app.auto) pause(); audio.suspend(); } else audio.resume(); });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (locked) everLocked = true; else if (app.mode === 'play' && everLocked && !touchMode && !app.auto) pause();
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  // 鼠标
  canvas.addEventListener('mousedown', e => {
    if (app.mode !== 'play' || touchMode) return;
    if (!locked) { lock(); dragging = true; }
    if (e.button === 0) inp.fire = true; else if (e.button === 2) inp.slap = true;
  });
  window.addEventListener('mouseup', e => { if (e.button === 0) inp.fire = false; dragging = false; });
  window.addEventListener('mousemove', e => { if (app.mode === 'play' && !touchMode && (locked || dragging)) turn(e.movementX, e.movementY); });
  // 触屏：左半边走、右半边看；按钮发出和键盘一样的意图
  const stick = document.querySelector('#touch .stick'), nub = stick.firstElementChild;
  let moveId = -1, lookId = -1, ox = 0, oy = 0, lx = 0, ly = 0;
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    if (!touchMode) { touchMode = true; ui.setTouch(true); }
    if (app.mode !== 'play') return;
    e.preventDefault();
    if (e.clientX < window.innerWidth * 0.45 && moveId < 0) { moveId = e.pointerId; ox = e.clientX; oy = e.clientY; stick.style.left = ox + 'px'; stick.style.top = oy + 'px'; stick.style.opacity = 1; nub.style.transform = ''; }
    else if (lookId < 0) { lookId = e.pointerId; lx = e.clientX; ly = e.clientY; }
  });
  const endTouch = e => {
    if (e.pointerId === moveId) { moveId = -1; inp.mx = inp.mz = 0; stick.style.opacity = 0; }
    if (e.pointerId === lookId) lookId = -1;
  };
  window.addEventListener('pointermove', e => {
    if (e.pointerId === moveId) {
      let dx = (e.clientX - ox) / 52, dy = (e.clientY - oy) / 52; const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      inp.mx = dx; inp.mz = -dy; nub.style.transform = `translate(${dx * 34}px, ${dy * 34}px)`;
    } else if (e.pointerId === lookId) { turn((e.clientX - lx) * 2.4, (e.clientY - ly) * 2.4); lx = e.clientX; ly = e.clientY; }
  });
  for (const t of ['pointerup', 'pointercancel']) window.addEventListener(t, endTouch);
  const hold = (id, down, up, drag) => {
    const b = document.getElementById(id); let pid = -1, px = 0, py = 0;
    b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); pid = e.pointerId; px = e.clientX; py = e.clientY; b.classList.add('down'); try { b.setPointerCapture(pid); } catch (err) { /* 老浏览器没有也行 */ } down(); });
    const rel = e => { if (e.pointerId !== pid) return; pid = -1; b.classList.remove('down'); up && up(); };
    b.addEventListener('pointermove', e => { if (drag && e.pointerId === pid) { turn((e.clientX - px) * 2.4, (e.clientY - py) * 2.4); px = e.clientX; py = e.clientY; } });
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(t, rel);
  };
  hold('b-fire', () => { inp.tFire = true; }, () => { inp.tFire = false; }, true);
  hold('b-slap', () => { inp.slap = true; });
  hold('b-jump', () => { inp.jump = true; });
  hold('b-reload', () => { inp.reload = true; });
  hold('b-use', () => { inp.tUse = true; }, () => { inp.tUse = false; });
  document.getElementById('b-pause').addEventListener('click', () => pause());
}
function readInput(dt) {
  const k = c => keys.has(c);
  let mx = inp.mx, mz = inp.mz;
  if (k('KeyW')) mz += 1; if (k('KeyS')) mz -= 1; if (k('KeyD')) mx += 1; if (k('KeyA')) mx -= 1;
  const ty = (k('ArrowLeft') ? 1 : 0) - (k('ArrowRight') ? 1 : 0), tp = (k('ArrowUp') ? 1 : 0) - (k('ArrowDown') ? 1 : 0);
  look.yaw += ty * 2.4 * dt; look.pitch = C.clamp(look.pitch + tp * 1.5 * dt, -1.45, 1.45);
  const out = { mx, mz, yaw: look.yaw, pitch: look.pitch, fire: inp.fire || inp.tFire || k('KeyJ') || k('Enter'), slap: inp.slap, use: k('KeyE') || k('KeyL') || inp.tUse, reload: inp.reload, jump: inp.jump, sprint: k('ShiftLeft') || k('ShiftRight') || Math.hypot(inp.mx, inp.mz) > 0.92 };
  inp.slap = inp.reload = inp.jump = false;
  return out;
}

// ---------- 事件 → 声音、特效、界面 ----------
function onEvent(e) {
  if (window.__evlog) window.__evlog.push([e.type, e.kind || e.key || '']);
  const sim = app.sim, p = sim.player, live = app.mode === 'play';
  const near = (x, z, d) => Math.hypot(x - p.x, z - p.z) < d;
  switch (e.type) {
    case 'radio': if (live || app.view) { const [who, text] = C.RADIO[e.key]; ui.radio(who, text); audio.play('radio'); } break;
    case 'spawn': if (e.kind === 'charger' && live) ui.toast('带壳的来了'); break;
    case 'nest': audio.play('nest'); fx.burst(e.x, 0.2, e.z, 'steam', 14); break;
    case 'kill': fx.burst(e.x, e.y + 0.4, e.z, 'goo', e.kind === 'charger' ? 60 : 26); audio.play('kill'); ui.hit(true); trauma = Math.min(1, trauma + (e.how === 'slap' ? 0.3 : 0.12)); break;
    case 'hurt': { const rel = C.wrap(Math.atan2(-(e.x - p.x), -(e.z - p.z)) - p.yaw); ui.hurt(-rel); audio.play('hurt'); trauma = Math.min(1, trauma + 0.3 + e.dmg / 60); break; }
    case 'telegraph': if (near(e.x, e.z, 22)) audio.play('telegraph', e.kind); break;
    case 'charge': audio.play('charge'); break;
    case 'stun': audio.play('stun'); fx.burst(e.x, 0.8, e.z, 'spark', 30); if (near(e.x, e.z, 14)) trauma = Math.min(1, trauma + 0.45); if (live) ui.toast('翻肚了，快打'); break;
    case 'seal': audio.play('seal'); fx.burst(sim.drains.find(d => d.id === e.id).x, 0.2, sim.drains.find(d => d.id === e.id).z, 'steam', 24); if (live) ui.toast(e.n < 3 ? '井盖 ' + e.n + ' / 3' : '去渡口'); trauma = Math.min(1, trauma + 0.25); break;
    case 'pickup': audio.play('pickup'); break;
    case 'reload': audio.play('reload'); break;
    case 'empty': if (time - emptyT > 0.6) { emptyT = time; audio.play('empty'); } break;
    case 'slap': audio.play('slap'); break;
    case 'slapHit': audio.play('slapHit'); trauma = Math.min(1, trauma + 0.35); camera.getWorldDirection(_dir); fx.burst(p.x + _dir.x * 1.4, p.y + 1.2, p.z + _dir.z * 1.4, 'spark', 12); break;
    case 'jump': audio.play('jump'); break;
    case 'land': audio.play('land'); break;
    case 'win': audio.play('win'); if (live) end('won'); break;
    case 'dead': audio.play('dead'); if (live) end('dead'); break;
  }
}

// ---------- 固定机位（验收用）：状态由自动驾驶真实打出来，再定格 ----------
const SPOTS = { street: [0, -54, Math.PI, 0.02], signs: [0.5, -38, Math.PI, 0.16], drain: [-1.5, -27.5, Math.PI, -0.3], alley: [10, 0, -Math.PI / 2, 0.04], pier: [0, 43, Math.PI, 0.06], ferry: [0, 60.5, Math.PI, 0.12] };
const HUNTS = {
  nest: s => s.enemies.filter(e => !e.dead && e.state === 'chase' && Math.hypot(e.x - s.player.x, e.z - s.player.z) < 9).length >= 2 && s.enemies.find(e => !e.dead),
  bite: s => s.enemies.find(e => e.type === 'runner' && e.state === 'windup' && e.t > 0.2),
  flyer: s => s.enemies.find(e => e.type === 'flyer' && e.state === 'aim' && e.t > 0.3),
  charger: s => s.enemies.find(e => e.type === 'charger' && e.state === 'windup' && e.t > 0.5 && Math.hypot(e.x - s.player.x, e.z - s.player.z) < 12),
  stun: s => s.enemies.find(e => e.type === 'charger' && e.state === 'stun' && e.t > 0.4 && Math.hypot(e.x - s.player.x, e.z - s.player.z) < 12 && C.los(e.x, e.z, s.player.x, s.player.z)),
  spray: s => s.player.firing && s.enemies.find(e => !e.dead && e.hitT < 0.05),
};
function gotoView(name, seed = 5) {
  app.view = { requested: name, entered: null, seed }; app.auto = null;
  if (name === 'title') { toTitle(); app.view.entered = 'title'; return app.view; }
  const sim = C.createSim(seed); app.sim = sim; app.mode = 'play'; ui.reset(); ui.show('none');
  if (SPOTS[name]) {
    const [x, z, yaw, pitch] = SPOTS[name];
    sim.player.x = x; sim.player.z = z; look.yaw = sim.player.yaw = yaw; look.pitch = sim.player.pitch = pitch; app.view.entered = name;
  } else if (HUNTS[name] || name === 'won') {
    const bot = C.makeBot(name === 'won' ? 'precise' : 'shaky', seed); let hit = null;
    while (sim.state === 'play' && sim.t < 260) {
      C.stepSim(sim, 1 / 30, C.botInput(sim, bot, 1 / 30));
      if (name !== 'won') { hit = HUNTS[name](sim); if (hit) break; }
    }
    if (name === 'won' ? sim.state === 'won' : hit) {
      app.view.entered = name; app.view.t = sim.t;
      if (hit && hit.x !== undefined) { const p = sim.player, d = Math.hypot(hit.x - p.x, hit.z - p.z); look.yaw = Math.atan2(-(hit.x - p.x), -(hit.z - p.z)); look.pitch = Math.atan2(hit.y + 0.4 - C.P.eye, d); } else { look.yaw = bot.yaw; look.pitch = bot.pitch; }
      sim.player.yaw = look.yaw; sim.player.pitch = look.pitch;
      if (name === 'won') { app.mode = 'won'; ui.fillEnd(sim); ui.show('won'); }
    }
  }
  app.frozen = true;
  return app.view;
}

// ---------- 主循环 ----------
let fpsAcc = 0, fpsN = 0, slowT = 0, frames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, Math.max(0.001, (now - last) / 1000)); last = now; time += dt;
  fpsAcc += dt; fpsN++;
  if (fpsAcc >= 0.5) { app.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; if (app.fps < 26 && app.mode === 'play' && !app.frozen) slowT += 0.5; else slowT = 0; if (slowT >= 3) degrade(); }
  advance(dt);
  draw(dt);
}
function advance(dt) {
  const sim = app.sim;
  if (app.mode === 'title') {
    const tz = -45 + Math.sin(time * 0.1) * 5, tx = Math.sin(time * 0.17) * 1.6;
    sim.player.x = tx; sim.player.z = tz; sim.player.vx = sim.player.vz = 0;
    C.stepSim(sim, Math.min(dt, 0.05), { yaw: Math.PI });
    for (const e of sim.events) if (e.type === 'kill' || e.type === 'nest' || e.type === 'stun') onEvent(e);
    return;
  }
  if (app.mode !== 'play' || app.frozen) { look.dx = look.dy = 0; return; }
  acc += dt; let n = 0;
  while (acc >= STEP && n < 5) {
    let input;
    if (app.auto) { input = C.botInput(sim, app.bot, STEP); follow(input); } else input = readInput(STEP);
    const hitBefore = sim.stats.hitT;
    C.stepSim(sim, STEP, input);
    for (const e of sim.events) onEvent(e);
    if (sim.stats.hitT > hitBefore && time - lastHit > 0.1) { lastHit = time; ui.hit(false); }
    if (sim.near && sim.near.using) { tickT -= STEP; if (tickT <= 0) { tickT = 0.3; audio.play('tick'); } }
    acc -= STEP; n++;
    if (app.mode !== 'play') break;
  }
  if (n === 5) acc = 0;
}
function draw(dt) {
  const sim = app.sim, p = sim.player, w = window.innerWidth, h = window.innerHeight;
  trauma = Math.max(0, trauma - dt * 1.5);
  const sh = trauma * trauma, bob = app.mode === 'play' ? Math.sin(time * 11) * 0.03 * Math.min(1, p.speed / 4) * (p.onGround ? 1 : 0) : 0;
  if (app.mode === 'title') {
    camera.position.set(p.x, 1.45 + Math.sin(time * 0.23) * 0.2, p.z);
    camera.rotation.set(0.1 + Math.sin(time * 0.13) * 0.05, Math.PI + Math.sin(time * 0.09) * 0.22, 0);
  } else {
    const dead = app.mode === 'dead' ? Math.min(1, (sim.t ? 1 : 0) * 1) : 0;
    camera.position.set(p.x, p.y + C.P.eye + bob - dead * 1.1, p.z);
    camera.rotation.set(look.pitch + Math.sin(time * 37) * sh * 0.035, look.yaw + Math.sin(time * 43 + 1) * sh * 0.035, Math.sin(time * 31 + 2) * sh * 0.03 + dead * 0.6);
  }
  camera.updateMatrixWorld();
  shared.uT.value = time;
  roaches.update(sim, app.frozen || app.mode === 'paused' ? 0 : dt, time);
  const tip = gun.update(p, dt, time, look, app.mode === 'title' ? 'title' : 'play');
  look.dx *= Math.max(0, 1 - dt * 12); look.dy *= Math.max(0, 1 - dt * 12);
  if (p.firing && app.mode === 'play') { camera.getWorldDirection(_dir); _tmp.copy(camera.position).addScaledVector(_dir, Math.max(2.5, p.aimDist || 9)).sub(tip).normalize(); fx.spray(tip, _tmp, p.vx, p.vz); }
  fx.update(sim, app.mode === 'paused' ? 0 : dt, time);
  rain.update(time, camera.position);
  flash.visible = app.mode !== 'title';
  let crawl = 0, buzz = 0;
  for (const e of sim.enemies) { if (e.dead) continue; const d = Math.hypot(e.x - p.x, e.z - p.z); if (d < 12) { if (e.type === 'flyer' && e.y > 0.5) buzz += 1 - d / 12; else if (e.speed > 0.5) crawl += 1 - d / 12; } }
  audio.mix(p.firing && app.mode === 'play', app.mode === 'play' ? crawl : 0, app.mode === 'play' ? buzz : 0);
  if (app.mode !== 'title') ui.hud(sim, camera, w, h, dt, touchMode);
  if (reflection && frames > 1) reflection.render(scene, camera, [world.ground, world.river]);
  pipeline.render(); frames++;
  app.frame = frameInfo(renderer);
}
// 帧率连续偏低时自动减负：先关倒影，再关泛光并降分辨率
function degrade() {
  slowT = 0;
  if (reflection) { reflection.off(); reflection = null; quality.reflect = false; return; }
  if (quality.bloom) { quality.bloom = false; quality.dpr = 1; renderer.setPixelRatio(1); pipeline.rebuild(); resize(); }
}

window.__qilou = {
  get sim() { return app.sim; }, get app() { return app; }, get scene() { return scene; }, get renderer() { return renderer; }, core: C, look,
  view: gotoView, start, setAuto, pause, resume,
  freeze(b) { app.frozen = !!b; },
  shot(x, y, z, yaw, pitch) { app.mode = 'play'; app.frozen = true; ui.show('none'); app.sim.player.x = x; app.sim.player.y = y - C.P.eye; app.sim.player.z = z; look.yaw = yaw; look.pitch = pitch; },
  info() { return { gpu: gpuName(renderer), quality: { ...quality }, dpr: renderer.getPixelRatio(), fps: Math.round(app.fps), calls: app.frame.calls, tris: app.frame.tris, mode: app.mode, view: app.view, errors: window.__errors.slice(), touch: touchMode, worldTris: world.tris, bakedLights: world.lights }; },
};
window.__PLAYTEST__ = {
  get ready() { return app.ready; },
  snapshot() { const s = app.sim, p = s.player; return { mode: app.mode, t: +s.t.toFixed(2), state: s.state, x: +p.x.toFixed(2), z: +p.z.toFixed(2), yaw: +look.yaw.toFixed(3), hp: Math.round(p.hp), tank: Math.round(p.tank), cans: p.cans, sealed: C.sealedCount(s), alive: C.aliveCount(s), kills: s.stats.kills, firing: p.firing, near: s.near ? s.near.id : null }; },
  reset() { start(app.seed); }, setSeed(n) { app.seed = n; },
  step(ms) { const n = Math.round(ms / 1000 / STEP); for (let i = 0; i < n && app.mode === 'play'; i++) { const input = app.auto ? C.botInput(app.sim, app.bot, STEP) : readInput(STEP); if (app.auto) follow(input); C.stepSim(app.sim, STEP, input); for (const e of app.sim.events) onEvent(e); } },
};
boot();
