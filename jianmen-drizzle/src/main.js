// 细雨剑门：PINOC/JST-2 splat scene of Gao Jianfu's 1926 landscape, rendered with PlayCanvas.
import * as pc from 'playcanvas';
import C from './core.js';
import { initAudio, setRain, setMuted, isMuted, pluck, bell } from './audio.js';

const { FEEL, TARGETS } = C;
const q = new URLSearchParams(location.search);
const VIEW = q.get('view'), STILL = q.has('still'), AUTO = q.has('auto'), DEMO = q.has('demo'), SEAM = q.get('seam') !== 'off';
// ?demo: normal opening, then after 入画 the autopilot turns slowly to each place and pauses after each find (for recording a walkthrough)
const AUTO_SPEED = +q.get('speed') || (DEMO ? 32 : 60);
const NO_HUD = q.get('hud') === '0', NO_RAIN = q.get('rain') === '0';
const TESTING = !!(VIEW || STILL || AUTO || q.has('seam') || NO_HUD || NO_RAIN);
const PAPER = [0.887, 0.865, 0.813];            // scene paper colour, median of bright grey splats (SPEC 第 5 节)
const $ = (id) => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches;
// Phones get the half-density scene (360k splats, 4.4 MB) unless ?q=full; ?q=lite forces it anywhere.
const SCENE = (q.get('q') === 'lite' || (isTouch && q.get('q') !== 'full')) ? 'assets/scene-lite.sog' : 'assets/scene.sog';

// ---------- shader: drifting mist, the seam veil, and the opening ink reveal ----------
const MODIFY_GLSL = /* glsl */`
uniform float uTime;
uniform float uSeam;
uniform float uMist;
uniform float uReveal;
uniform vec3 uPaper;
float jmHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float jmNoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(jmHash(i), jmHash(i + vec3(1.0,0.0,0.0)), f.x), mix(jmHash(i + vec3(0.0,1.0,0.0)), jmHash(i + vec3(1.0,1.0,0.0)), f.x), f.y),
             mix(mix(jmHash(i + vec3(0.0,0.0,1.0)), jmHash(i + vec3(1.0,0.0,1.0)), f.x), mix(jmHash(i + vec3(0.0,1.0,1.0)), jmHash(i + vec3(1.0,1.0,1.0)), f.x), f.y), f.z);
}
// The modify chunk is included before the format's read code; declare getColor so the
// centre hook can tell mist from rock (the SOG reader fills it once getCenter() has run).
#ifdef GSPLAT_SEPARATE_OPACITY
vec3 getColor();
vec3 jmRgb() { return getColor(); }
#else
vec4 getColor();
vec3 jmRgb() { return getColor().rgb; }
#endif
float jmMist(vec3 c) {
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  float sat = max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b);
  return smoothstep(0.62, 0.85, lum) * (1.0 - smoothstep(0.06, 0.14, sat));
}
void modifySplatCenter(inout vec3 center) {
  float m = jmMist(jmRgb()) * uMist;
  if (m > 0.001) {
    // Mist drifts: a slow looping flow, mostly sideways, scaled by distance so far cloud moves as much on screen.
    vec3 p = center * 1.7;
    vec3 flow = vec3(sin(uTime * 0.13 + p.y * 3.1 + p.z * 1.7), 0.25 * sin(uTime * 0.09 + p.x * 2.3), cos(uTime * 0.11 + p.x * 2.9 + p.y * 1.3));
    center += flow * 0.035 * length(center) * m;
  }
}
void modifySplatRotationScale(vec3 originalCenter, vec3 modifiedCenter, inout vec4 rotation, inout vec3 scale) {}
void modifySplatColor(vec3 center, inout vec4 color) {
  // The panorama's two ends meet straight behind the capture point and do not line up:
  // fade both sides into pale water, fully covered at the seam, with a ragged edge.
  float lon = atan(center.x, -center.z);
  float d = 3.14159265 - abs(lon);
  float edge = jmNoise(vec3(center.y * 4.0, lon * 3.0, uTime * 0.05)) * 0.7 + jmNoise(vec3(center.y * 11.0, 1.3, uTime * 0.08)) * 0.3;
  float w = 0.12 + 0.20 * edge;
  float veil = (1.0 - smoothstep(0.0, w, d)) * uSeam;
  veil = max(veil, (1.0 - smoothstep(0.0, 0.035, d)) * uSeam);
  // Read it as a waterfall dropping out of the cloud: pale water with streaks running downward.
  float fall = jmNoise(vec3(lon * 60.0, center.y * 9.0 + uTime * 1.6, 0.5)) * 0.6 + jmNoise(vec3(lon * 140.0, center.y * 20.0 + uTime * 2.6, 2.0)) * 0.4;
  vec3 water = uPaper * (0.80 + 0.24 * fall);
  color.rgb = mix(color.rgb, water, veil);
  color.a *= 1.0 - 0.5 * veil * veil;
  // Opening: the painting "bleeds" into the scene, splats appearing by a noise threshold.
  float rn = jmNoise(center * 3.0 + 7.1);
  color.a *= smoothstep(rn - 0.08, rn + 0.08, uReveal * 1.25 - 0.12);
}
`;

// ---------- app ----------
const canvas = $('game');
const app = new pc.Application(canvas, {
  graphicsDeviceOptions: { antialias: false, alpha: false, preserveDrawingBuffer: TESTING },
  mouse: null, touch: null, keyboard: null
});
app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2);
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);
window.addEventListener('resize', () => app.resizeCanvas());

const camera = new pc.Entity('camera');
camera.addComponent('camera', { clearColor: new pc.Color(PAPER[0], PAPER[1], PAPER[2]), fov: FEEL.fovStart, nearClip: 0.01, farClip: 60 });
app.root.addChild(camera);

let material = null;
const uni = { uTime: 12, uSeam: SEAM ? 1 : 0, uMist: 1, uReveal: 0 };
function setUniforms() {
  if (!material) return;
  for (const k in uni) material.setParameter(k, uni[k]);
  material.setParameter('uPaper', PAPER);
}

// ---------- view state ----------
const isPortrait = () => innerHeight > innerWidth;
const restFov = () => (isPortrait() ? FEEL.fovRestPortrait : FEEL.fovRest);
const look = { yaw: FEEL.startYaw, pitch: FEEL.startPitch, fov: isPortrait() ? FEEL.fovStartPortrait : FEEL.fovStart };
const aim = { ...look };                       // where input points; `look` eases toward it
let state = C.create(), started = false, endingTurn = false, outroShown = false, autoAt = 0;

const PRESETS = {
  hero: { yaw: FEEL.startYaw, pitch: FEEL.startPitch, fov: restFov() },
  gate: { yaw: 19, pitch: 47, fov: 50 },
  back: { yaw: 180, pitch: 5, fov: restFov() }
};

function placeCamera() {
  camera.setEulerAngles(look.pitch, -look.yaw, 0);
  // eye sits a little in front of the neck pivot, so turning the head gives real parallax
  const f = C.dir(look.yaw, look.pitch);
  camera.setPosition(f[0] * FEEL.neck, f[1] * FEEL.neck * 0.5, f[2] * FEEL.neck);
  // look.fov is the field of view across the shorter screen side, so a portrait phone sees as wide as a laptop sees tall
  camera.camera.horizontalFov = canvas.clientHeight > canvas.clientWidth;
  camera.camera.fov = look.fov;
}

// ---------- input: drag to look, wheel / pinch to zoom, arrows / WASD ----------
const pointers = new Map(); let pinch0 = 0, fov0 = 0;
const degPerPx = () => look.fov / Math.max(240, Math.min(canvas.clientWidth, canvas.clientHeight)) * 1.1;
canvas.addEventListener('pointerdown', (e) => {
  if (!started) return;
  canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); canvas.classList.add('drag');
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); fov0 = aim.fov; }
  hideHow();
});
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId); if (!p || !started || endingTurn) return;
  if (pointers.size === 1) {
    aim.yaw = C.wrap(aim.yaw - (e.clientX - p.x) * degPerPx());
    aim.pitch = C.clamp(aim.pitch + (e.clientY - p.y) * degPerPx(), FEEL.pitchMin, FEEL.pitchMax);
  }
  p.x = e.clientX; p.y = e.clientY;
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0 > 0) aim.fov = C.clamp(fov0 * pinch0 / d, FEEL.fovMin, FEEL.fovMax); }
});
const up = (e) => { pointers.delete(e.pointerId); if (!pointers.size) canvas.classList.remove('drag'); pinch0 = 0; };
canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
canvas.addEventListener('wheel', (e) => { if (!started) return; e.preventDefault(); aim.fov = C.clamp(aim.fov * Math.exp(e.deltaY * 0.0012), FEEL.fovMin, FEEL.fovMax); }, { passive: false });
const keys = new Set();
addEventListener('keydown', (e) => { keys.add(e.code); if (started) hideHow(); });
addEventListener('keyup', (e) => keys.delete(e.code));
function keyLook(dt) {
  if (!started || endingTurn) return;
  const s = 70 * dt * look.fov / 72;
  if (keys.has('ArrowLeft') || keys.has('KeyA')) aim.yaw = C.wrap(aim.yaw - s);
  if (keys.has('ArrowRight') || keys.has('KeyD')) aim.yaw = C.wrap(aim.yaw + s);
  if (keys.has('ArrowUp') || keys.has('KeyW')) aim.pitch = C.clamp(aim.pitch + s, FEEL.pitchMin, FEEL.pitchMax);
  if (keys.has('ArrowDown') || keys.has('KeyS')) aim.pitch = C.clamp(aim.pitch - s, FEEL.pitchMin, FEEL.pitchMax);
}

// ---------- HUD ----------
const cols = [...document.querySelectorAll('#jian .col')];
const ringFg = document.querySelector('#ring .fg'), RING_LEN = 2 * Math.PI * 26;
ringFg.style.strokeDasharray = RING_LEN;
// The poem slip starts as faint red tracing characters (描红); a find inks its line over them.
for (const g of TARGETS) cols[g.line].innerHTML = [...g.text].map((ch) => `<span class="ch">${ch}</span>`).join('');
function writeLine(line) {
  const col = cols[line], chars = [...col.querySelectorAll('.ch')];
  chars.forEach((s, i) => setTimeout(() => s.classList.add('on'), 120 + i * 260));
  const seal = document.createElement('i'); seal.className = 'seal'; col.appendChild(seal);
  setTimeout(() => col.classList.add('done'), 120 + chars.length * 260);
  $('jiancap').textContent = `已得 ${state.order.length} / 4`;
}

// Compass bar: ticks every 15° scroll as you turn; the four places sit on it, pinned to an edge when out of range.
const cmp = $('compass'), cmpTicks = [], cmpMarks = {};
for (let y = -180; y < 180; y += 15) { const t = document.createElement('i'); t.className = 'tk' + (y % 45 === 0 ? ' big' : ''); cmp.querySelector('.tks').appendChild(t); cmpTicks.push([y, t]); }
for (const g of TARGETS) { const m = document.createElement('b'); m.className = 'mk'; cmp.appendChild(m); cmpMarks[g.id] = m; }
function updateCompass() {
  const W = cmp.clientWidth; if (!W) return;
  const span = FEEL.compassSpan, px = W / 2 / span;
  for (const [y, t] of cmpTicks) { const dx = C.wrap(y - look.yaw); t.style.visibility = Math.abs(dx) > span ? 'hidden' : 'visible'; t.style.transform = `translateX(${(W / 2 + dx * px).toFixed(1)}px)`; }
  for (const m of C.compass(state, look)) {
    const el = cmpMarks[m.id];
    const text = (m.side < 0 ? '‹ ' : '') + m.mark + (m.level === 'up' ? '↑' : m.level === 'down' ? '↓' : '') + (m.side > 0 ? ' ›' : '');
    if (el.textContent !== text) el.textContent = text;
    const cls = `mk ${m.level}${m.found ? ' found' : ''}${m.side ? ' edge' : ''}`;
    if (el.className !== cls) el.className = cls;
    el.style.left = `${(W / 2 + m.dx * px).toFixed(1)}px`;
    el.style.transform = m.side < 0 ? 'translateX(0)' : m.side > 0 ? 'translateX(-100%)' : 'translateX(-50%)';   // pinned marks stay inside the bar
  }
}
let msgTimer = 0;
function say(text, small, hold = 4200) {
  const m = $('msg'); m.innerHTML = text + (small ? `<small>${small}</small>` : ''); m.classList.add('on');
  clearTimeout(msgTimer); msgTimer = setTimeout(() => m.classList.remove('on'), hold);
}
let hintId = null;
function showHint(id, text) { hintId = id; $('hint').textContent = text; $('hint').classList.add('on'); $('arrow').classList.add('on'); }
function hideHint() { hintId = null; $('hint').classList.remove('on'); $('arrow').classList.remove('on'); }
function updateArrow() {
  if (!hintId) return;
  const g = TARGETS.find((t) => t.id === hintId), dy = C.wrap(g.yaw - look.yaw), dp = g.pitch - look.pitch;
  $('arrow').style.transform = `rotate(${Math.atan2(-dp, dy) * 180 / Math.PI}deg)`;
}
let howShown = false;
function hideHow() { if (howShown) { $('how').classList.remove('on'); howShown = false; } }

// ---------- drizzle: fine ink strokes that pan with the head ----------
const rc = $('rain'), rx = rc.getContext('2d');
let drops = [], rainLevel = 1, lastYaw = look.yaw, lastPitch = look.pitch;
function sizeRain() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  rc.width = Math.round(innerWidth * dpr); rc.height = Math.round(innerHeight * dpr);
  const n = Math.round(innerWidth * innerHeight / 5200), rnd = C.rng(7);
  drops = Array.from({ length: n }, () => ({ x: rnd() * rc.width, y: rnd() * rc.height, len: (10 + rnd() * 18) * dpr, v: (480 + rnd() * 420) * dpr, a: 0.22 + rnd() * 0.30, z: rnd() }));
}
sizeRain(); addEventListener('resize', sizeRain);
function drawRain(dt) {
  const W = rc.width, H = rc.height, pxPerDeg = Math.min(W, H) / look.fov;
  const dYaw = C.wrap(look.yaw - lastYaw), dPitch = look.pitch - lastPitch; lastYaw = look.yaw; lastPitch = look.pitch;
  rx.clearRect(0, 0, W, H);
  if ((!started && !VIEW) || NO_RAIN) return;
  const slant = 0.2, shown = Math.min(drops.length, Math.round(drops.length * 0.6 * rainLevel));
  rx.lineWidth = Math.max(1, (W / innerWidth) * 1.1); rx.lineCap = 'round';
  for (let i = 0; i < shown; i++) {
    const d = drops[i], par = 0.4 + 0.6 * d.z;
    d.x -= dYaw * pxPerDeg * par; d.y += dPitch * pxPerDeg * par;
    if (!STILL) { d.y += d.v * dt; d.x += d.v * dt * slant; }
    if (d.y > H) { d.y -= H + d.len; } if (d.y < -d.len) d.y += H + d.len;
    if (d.x > W) d.x -= W; if (d.x < 0) d.x += W;
    rx.strokeStyle = `rgba(43,41,37,${d.a * (0.5 + 0.5 * d.z)})`;
    rx.beginPath(); rx.moveTo(d.x, d.y); rx.lineTo(d.x - d.len * slant, d.y - d.len); rx.stroke();
  }
}

// ---------- events from the logic ----------
function onEvents(evs) {
  for (const e of evs) {
    if (e.type === 'found') {
      writeLine(e.line); pluck(e.line); if (DEMO) autoAt = state.t + 2.4;
      say(e.text, e.note || null, e.note ? 6000 : 4200);
      hideHint();
    } else if (e.type === 'hint') showHint(e.id, e.text);
    else if (e.type === 'hintOff') hideHint();
    else if (e.type === 'ending') {
      setTimeout(() => { endingTurn = true; rainLevel = 1.8; setRain(1.6); bell(); say('细雨骑驴入剑门', '四句写全了', 5200); }, FEEL.endDelay * 1000);
    } else if (e.type === 'done') showOutro();
  }
}

function showOutro() {
  if (outroShown) return; outroShown = true;
  const o = $('outro'); o.classList.remove('hidden');
  requestAnimationFrame(() => requestAnimationFrame(() => o.classList.remove('fade')));
}
$('stay').addEventListener('click', () => { $('outro').classList.add('fade'); endingTurn = false; rainLevel = 1.2; setRain(1); setTimeout(() => $('outro').classList.add('hidden'), 1600); });
$('again').addEventListener('click', () => location.reload());
$('sound').addEventListener('click', () => { setMuted(!isMuted()); $('sound').classList.toggle('off', isMuted()); });

// ---------- frame loop ----------
let revealT = 0, fpsBuf = [], last = performance.now();
app.on('update', (dtRaw) => {
  const dt = Math.min(dtRaw, 0.1);
  const now = performance.now(); fpsBuf.push(now - last); last = now; if (fpsBuf.length > 240) fpsBuf.shift();
  keyLook(dt);
  if ((AUTO || DEMO) && started && !endingTurn && state.t >= autoAt) Object.assign(aim, C.autopilot(state, aim, dt, { speed: AUTO_SPEED }));
  if (endingTurn) { const a = C.autopilot({ phase: 'ending' }, aim, dt, { speed: 28 }); aim.yaw = a.yaw; aim.pitch = a.pitch; aim.fov += (55 - aim.fov) * Math.min(1, dt * 0.6); }
  // ease the view toward the aim
  const k = Math.min(1, dt * 10);
  look.yaw = C.wrap(look.yaw + C.wrap(aim.yaw - look.yaw) * k);
  look.pitch += (aim.pitch - look.pitch) * k;
  look.fov += (aim.fov - look.fov) * Math.min(1, dt * 4);
  placeCamera();
  if (started) onEvents(C.step(state, look, dt));
  // ring
  ringFg.style.strokeDashoffset = RING_LEN * (1 - (state.phase === 'look' ? C.ring(state) : 0));
  updateArrow();
  updateCompass();
  if (!STILL) uni.uTime += dt;
  if (started && uni.uReveal < 1) { revealT += dt; uni.uReveal = Math.min(1, revealT / 3.2); }
  setUniforms();
  drawRain(dt);
});

// ---------- loading ----------
function loadScene(onProgress) {
  return new Promise((resolve, reject) => {
    const asset = new pc.Asset('scene', 'gsplat', { url: SCENE });
    asset.on('error', (err) => reject(new Error(String(err))));
    asset.on('progress', (got, total) => onProgress(total ? got / total : 0));
    asset.ready(() => {
      const e = new pc.Entity('scene'); e.addComponent('gsplat', { asset }); app.root.addChild(e);
      const tryMat = (n = 0) => {
        const m = e.gsplat.material;
        if (!m) { if (n > 120) reject(new Error('gsplat material never appeared')); else requestAnimationFrame(() => tryMat(n + 1)); return; }
        m.shaderChunks.glsl.set('gsplatModifyVS', MODIFY_GLSL); m.update(); material = m; setUniforms(); resolve();
      };
      tryMat();
    });
    app.assets.add(asset); app.assets.load(asset);
  });
}

function begin(skipIntro) {
  started = true;
  if (!NO_HUD) { $('hud').classList.remove('hidden'); $('sound').classList.remove('hidden'); }
  if (skipIntro) { $('intro').classList.add('hidden'); uni.uReveal = 1; return; }
  $('intro').classList.add('fade'); setTimeout(() => $('intro').classList.add('hidden'), 1700);
  aim.fov = restFov();
  if (DEMO) autoAt = 4.5;
  setTimeout(() => { $('how').classList.add('on'); howShown = true; }, 2600);
  setTimeout(hideHow, 12000);
  state.lastFind = 0;
}

window.__jianmen = {
  ready: false, error: null,
  info: () => {
    const s = [...fpsBuf].sort((a, b) => a - b), med = s.length ? 1000 / s[Math.floor(s.length / 2)] : 0;
    return { phase: state.phase, found: [...state.order], look: { ...look }, hint: state.hint, fps: Math.round(med), started, outro: outroShown, pixelRatio: app.graphicsDevice.maxPixelRatio, size: [canvas.width, canvas.height], scene: SCENE };
  },
  look: (yaw, pitch, fov) => { Object.assign(aim, { yaw, pitch, fov: fov ?? aim.fov }); Object.assign(look, aim); placeCamera(); }
};

app.start();
(async () => {
  try {
    await loadScene((p) => { $('loadline').textContent = p ? `研墨中… ${Math.round(p * 100)}%` : '研墨中…'; });
    $('loadline').textContent = ''; $('enter').disabled = false;
    if (VIEW || AUTO) {
      const p = PRESETS[VIEW] || PRESETS.hero; Object.assign(aim, p); Object.assign(look, p); placeCamera();
      begin(true);
    }
    window.__jianmen.ready = true;
  } catch (err) {
    window.__jianmen.error = String(err && err.stack || err); $('loadline').textContent = '加载失败：' + err.message;
  }
})();
$('enter').addEventListener('click', () => { initAudio(); begin(false); });
