import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CYCLE, SHOTS, PORT, ViewController, shotAt, phaseAt, shuttleAt, sunDir, sunVisibility, mod, clamp, ringAngle, RING_PERIOD, dot } from './core.js';
import { buildStation } from './station.js';
import { buildEarth } from './earth.js';

const params = new URLSearchParams(location.search);
const byIndex = Number(params.get('view'));
const requested = SHOTS.find(s => s.key === params.get('view')) || (byIndex >= 1 && byIndex <= 10 ? SHOTS[byIndex - 1] : null);
const fail = document.querySelector('#fail');
const canvas = document.querySelector('#scene');
const mobile = () => innerWidth < 700 || matchMedia('(pointer:coarse)').matches;
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (error) {
  fail.hidden = false; fail.textContent = '无法启动三维画面：' + error.message;
  window.__PLAYTEST__ = { ready: false, error: String(error.message) };
  throw error;
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.autoClear = false; renderer.info.autoReset = false;
const gl = renderer.getContext(), dbg = gl.getExtension('WEBGL_debug_renderer_info');
const gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);

// Foreground: the station. Background: stars, Earth, atmosphere, sun (own depth range).
const scene = new THREE.Scene(), bg = new THREE.Scene();
bg.background = new THREE.Color('#03050b');
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.25, 2600);
const bgCamera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 5, 200000);
const station = buildStation(2026); scene.add(station.root);
const earth = buildEarth(); bg.add(earth.group);

// Reflections: a dark sky above and Earth-blue glow below, baked once (no image files).
{
  const envScene = new THREE.Scene();
  const env = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vD; void main(){ float y = vD.y; vec3 c = mix(vec3(0.09, 0.2, 0.36), vec3(0.004, 0.006, 0.012), smoothstep(-0.55, 0.15, y)); c += vec3(0.35, 0.5, 0.75) * exp(-pow((y + 0.5) * 6.0, 2.0)) * 0.5; gl_FragColor = vec4(c, 1.0); }' }));
  envScene.add(env);
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(envScene, 0.02).texture; scene.environmentIntensity = 0.9; pm.dispose();
}
const sunLight = new THREE.DirectionalLight('#fff4e6', 3.4);
sunLight.castShadow = true; sunLight.shadow.mapSize.set(mobile() ? 1024 : 2048, mobile() ? 1024 : 2048);
Object.assign(sunLight.shadow.camera, { left: -110, right: 110, top: 110, bottom: -110, near: 10, far: 520 });
sunLight.shadow.bias = -0.0004; sunLight.shadow.normalBias = 0.06;
scene.add(sunLight, sunLight.target);
const earthShine = new THREE.HemisphereLight('#161c28', '#2b4e78', 0.55); scene.add(earthShine);
station.root.traverse(o => { if (o.isMesh) { const glassy = o.userData.layer === 'glass' || o.userData.layer === 'emissive' || o.userData.role === 'rcs-plume'; o.castShadow = !glassy; o.receiveShadow = !glassy; } });

// ---- UI ----
const $ = (s) => document.querySelector(s);
const shotNav = $('#shots'), playBtn = $('#play'), tourBtn = $('#tour'), clock = $('#clock'), fadeEl = $('#fade');
SHOTS.forEach((s, i) => {
  const b = document.createElement('button'); b.dataset.view = s.key; b.type = 'button';
  b.innerHTML = `<span class="num">${String(i + 1).padStart(2, '0')}</span><span class="label">${s.name}</span>`;
  b.setAttribute('aria-label', `机位 ${i + 1}：${s.name}`);
  b.addEventListener('click', () => selectView(s.key));
  shotNav.append(b);
});
const CAPTIONS = {
  establish: '地球上空，环形居住区由四根辐条连到中央枢纽，下方桁架挑出太阳翼。',
  truss: '沿中轴桁架往下，掠过散热板和对地天线，尽头是太阳翼。',
  ring: '居住区绕中轴稳定旋转，一圈约 30 秒，枢纽和桁架不跟着转。',
  garden: '走进环内：花园甲板沿着环往上弯，头顶是采光带，窗外是枢纽。',
  approach: '接驳艇离开待命点，沿走廊飞向对接口上方的入口点。',
  align: '在口上方停住：横向偏差和滚转角一起归零，再沿轴线慢慢下降。',
  port: '对接口细部：导向瓣对正，接驳艇以约 0.12 米每秒碰上对接环。',
  settle: '缓冲环吃进一点又顶回，十二个挂钩依次锁紧，灯由黄变绿。',
  sunrise: '飞出地球的影子：太阳从地平线后面升起，空间站成了剪影。',
  axis: '沿着旋转轴往下看：整圈居住区像车轮一样转，接驳艇离港返回待命点。',
};
const ui = { kicker: $('#shot-en'), name: $('#shot-name'), caption: $('#shot-caption'), phase: $('#phase'), dist: $('#t-dist'), lat: $('#t-lat'), roll: $('#t-roll'), latch: $('#t-latch') };

// ---- State ----
const view = new ViewController();
let time = requested ? requested.at : 0, wall = 0, playing = !requested, last = performance.now(), ready = false, mode = requested ? 'shot' : 'tour', frames = 0;
let seed = 2026;
const controls = new OrbitControls(camera, canvas); controls.enabled = false; controls.enableDamping = true; controls.dampingFactor = 0.08; controls.minDistance = 14; controls.maxDistance = 420; controls.enablePan = false;
let lastPose = null;
if (requested) { view.mode = 'shot'; view.key = requested.key; }
function selectView(key) {
  if (mode === 'free') { controls.enabled = false; lastPose = { position: camera.position.toArray(), target: controls.target.toArray(), up: [0, 1, 0], fov: camera.fov }; }
  mode = 'shot'; view.select(key, lastPose, wall); syncButtons(); kick();
}
function startTour() { mode = 'tour'; controls.enabled = false; view.tour(time); playing = true; syncButtons(); kick(); }
tourBtn.addEventListener('click', () => (mode === 'tour' ? selectView(view.key) : startTour()));
playBtn.addEventListener('click', () => { playing = !playing; syncButtons(); kick(); });
addEventListener('keydown', (e) => { if (e.code === 'Space' && !/INPUT|SELECT|BUTTON/.test(document.activeElement?.tagName || '')) { e.preventDefault(); playing = !playing; syncButtons(); kick(); } });
canvas.addEventListener('pointerdown', () => {
  if (mode === 'free' || !lastPose || view.key === 'garden' || view.key === 'sunrise') return;
  mode = 'free'; controls.target.set(0, 4, 0); camera.up.set(0, 1, 0); controls.enabled = true; controls.update(); syncButtons();
});
controls.addEventListener('change', kick);
function syncButtons() {
  for (const b of shotNav.children) b.setAttribute('aria-current', mode !== 'free' && b.dataset.view === view.key ? 'true' : 'false');
  tourBtn.setAttribute('aria-pressed', String(mode === 'tour'));
  tourBtn.textContent = mode === 'tour' ? '连播中' : '一键连播';
  playBtn.textContent = playing ? 'Ⅱ 暂停' : '▶ 播放'; playBtn.setAttribute('aria-label', playing ? '暂停' : '播放');
}
syncButtons();

function resize() {
  const pr = Math.min(devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = bgCamera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  kick();
}
addEventListener('resize', resize);

const tmp = new THREE.Vector3();
function applyPose(pose) {
  camera.position.set(...pose.position); camera.up.set(...pose.up); camera.lookAt(...pose.target); camera.fov = pose.fov; camera.updateProjectionMatrix();
  lastPose = pose;
}
function updateWorld() {
  station.update(time);
  const s = sunDir(time), vis = sunVisibility([0, 0, 0], s);
  const low = 1 - clamp((dot(s, [0, 1, 0]) + 0.5) / 0.6);
  sunLight.position.set(s[0] * 260, s[1] * 260, s[2] * 260); sunLight.target.position.set(0, -20, 0);
  sunLight.intensity = 3.4 * vis; sunLight.color.setRGB(1, 0.95 - 0.22 * low, 0.88 - 0.4 * low);
  earthShine.intensity = 0.22 + 0.5 * vis * (0.4 + 0.6 * Math.max(s[1], 0));
  return { s, vis };
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (document.hidden) return;
  wall += dt;
  if (playing) time += dt;
  // A paused fixed view (?view=…) only skips redraws once the page has reported ready: the first frames
  // must all be drawn, or `ready` (set after the third frame) never comes true and checks wait forever.
  else if (ready && !dirty && mode !== 'free' && !view.moving) return;
  render();
}
let dirty = true; function kick() { dirty = true; }
function render() {
  dirty = false;
  const aspect = innerWidth / innerHeight;
  const { s, vis } = updateWorld();
  let fade = 0;
  if (mode === 'free') { controls.update(); }
  else {
    const pose = view.pose(time, aspect, wall); fade = pose.fade || 0; applyPose(pose);
  }
  fadeEl.style.opacity = fade.toFixed(3);
  bgCamera.position.copy(camera.position); bgCamera.quaternion.copy(camera.quaternion); bgCamera.fov = camera.fov; bgCamera.aspect = camera.aspect; bgCamera.updateProjectionMatrix();
  earth.update(time, s, bgCamera, renderer.getPixelRatio());
  renderer.info.reset(); renderer.clear(); renderer.render(bg, bgCamera); renderer.clearDepth(); renderer.render(scene, camera);
  updateUi(); frames++;
  if (!ready && frames > 2) { ready = true; document.body.dataset.ready = '1'; }
}
let shownShot = '';
function updateUi() {
  const key = mode === 'free' ? 'free' : view.key;
  if (key !== shownShot) {
    shownShot = key; const meta = SHOTS.find(x => x.key === key);
    ui.kicker.textContent = meta ? `机位 ${String(meta.index + 1).padStart(2, '0')} · ${meta.en}` : '自由环绕';
    ui.name.textContent = meta ? meta.name : '拖动转着看';
    ui.caption.textContent = meta ? CAPTIONS[key] : '松手后点任一机位或「一键连播」回到镜头。';
    syncButtons();
  }
  const p = phaseAt(time), d = shuttleAt(time);
  ui.phase.textContent = `对接 · ${p.name}`;
  ui.dist.textContent = `${Math.max(0, d.distance).toFixed(d.distance < 10 ? 2 : 1)} m`;
  ui.lat.textContent = `${d.lateral < 20 ? d.lateral.toFixed(2) : '—'} m`;
  ui.roll.textContent = `${d.lateral < 20 ? (d.rollError * 180 / Math.PI).toFixed(1) : '—'}°`;
  ui.latch.textContent = `${d.latched} / ${PORT.latches}`;
  const c = mod(time); clock.textContent = `${fmt(c)} / ${fmt(CYCLE)}`;
}
const fmt = (t) => `00:${String(Math.floor(t)).padStart(2, '0')}`;

// Unified play-test hook (optional; normal play never depends on it).
function snapshot() {
  const d = shuttleAt(time), info = renderer.info;
  return {
    ready, requestedView: requested ? requested.key : null, view: mode === 'free' ? 'free' : view.key, mode, playing,
    time, cycle: mod(time), shot: shotAt(time).key, phase: phaseAt(time).key, fade: Number(fadeEl.style.opacity || 0),
    docking: { distance: d.distance, lateral: d.lateral, axisDeg: d.axisError * 180 / Math.PI, rollDeg: d.rollError * 180 / Math.PI, latched: d.latched },
    ringRpm: 60 / RING_PERIOD, ringAngle: ringAngle(time) % (2 * Math.PI), sunVisible: sunVisibility([0, 0, 0], sunDir(time)),
    drawCalls: info.render.calls, triangles: info.render.triangles, renderer: gpu, pixelRatio: renderer.getPixelRatio(), viewport: [innerWidth, innerHeight],
    camera: { position: camera.position.toArray(), fov: camera.fov },
  };
}
function partScreen(name) {
  const o = station.root.getObjectByName(name); if (!o) return null;
  o.getWorldPosition(tmp); tmp.project(camera); return { x: (tmp.x + 1) / 2, y: (1 - tmp.y) / 2, z: tmp.z };
}
// Screen position (0..1, y down) of a world point through the current camera, for pixel checks.
function pointScreen(p) { tmp.set(...p).project(camera); return { x: (tmp.x + 1) / 2, y: (1 - tmp.y) / 2, z: tmp.z }; }
window.__ORBITAL__ = { pointScreen, setView: (k) => { mode = 'shot'; view.mode = 'shot'; view.key = k; view.from = null; view.pending = null; view.fadeAt = -1; time = SHOTS.find(s => s.key === k).at; playing = false; shownShot = ''; syncButtons(); render(); return snapshot(); },
  setTime: (t) => { time = t; render(); return snapshot(); }, play: () => { playing = true; syncButtons(); }, pause: () => { playing = false; syncButtons(); render(); }, tour: startTour, partScreen };
window.__PLAYTEST__ = {
  get ready() { return ready; }, snapshot,
  reset: () => { time = 0; mode = 'tour'; view.tour(0); playing = true; render(); return snapshot(); },
  setSeed: (n) => { seed = n; return seed; }, // the scene is deterministic; kept for the shared tool contract
  step: (ms) => { time += ms / 1000; render(); return snapshot(); },
};
resize(); requestAnimationFrame((t) => { last = t; frame(t); });
