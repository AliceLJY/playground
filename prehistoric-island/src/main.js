import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CYCLE, SHOTS, SUN, ViewController, shotAt, mod, HERD, FLYERS, SWIMMERS, SHELLS, SCHOOLS, BLOCK, CRATER } from './core.js';
import { buildIsland } from './world.js';

const params = new URLSearchParams(location.search);
const byIndex = Number(params.get('view'));
const requested = SHOTS.find(s => s.key === params.get('view')) || (byIndex >= 1 && byIndex <= SHOTS.length ? SHOTS[byIndex - 1] : null);
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
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.info.autoReset = false;
const gl = renderer.getContext(), dbg = gl.getExtension('WEBGL_debug_renderer_info');
const gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.5, 4000);
const island = buildIsland(7); scene.add(island.root);

// Sky: a gradient dome behind everything (a shader, no image), warm near the horizon, deeper blue overhead.
const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
  vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
  fragmentShader: 'varying vec3 vD; void main(){ float y = vD.y; vec3 top = vec3(0.16, 0.36, 0.62), hor = vec3(0.86, 0.80, 0.66), low = vec3(0.50, 0.56, 0.60); vec3 c = y > 0.0 ? mix(hor, top, pow(smoothstep(0.0, 0.6, y), 0.8)) : mix(hor, low, smoothstep(0.0, 0.25, -y)); gl_FragColor = vec4(c, 1.0); }' });
const sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), skyMat); sky.name = 'sky'; sky.frustumCulled = false; sky.renderOrder = -1;
scene.add(sky);
// Reflections: the same sky, baked once.
{
  const envScene = new THREE.Scene(); envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), skyMat));
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(envScene, 0.02).texture; scene.environmentIntensity = 0.55; pm.dispose();
}
const sunLight = new THREE.DirectionalLight('#fff0d8', 2.6);
sunLight.position.set(SUN[0] * 320, SUN[1] * 320, SUN[2] * 320); sunLight.target.position.set(0, -20, -20);
sunLight.castShadow = true; sunLight.shadow.mapSize.set(mobile() ? 1024 : 2048, mobile() ? 1024 : 2048);
Object.assign(sunLight.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, near: 40, far: 700 });
sunLight.shadow.bias = -0.0005; sunLight.shadow.normalBias = 0.08;
scene.add(sunLight, sunLight.target);
const skyLight = new THREE.HemisphereLight('#bcd6ee', '#4a3d30', 0.9); scene.add(skyLight);
island.root.traverse(o => {
  if (!o.isMesh) return;
  const clear = o.userData.layer === 'water' || o.userData.layer === 'emissive' || o.userData.layer === 'air';
  o.castShadow = !clear && o.userData.role !== 'ferns'; o.receiveShadow = !clear;
});

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
  overview: '一座火山小岛：山顶是火山口，山坡是针叶林和苏铁，岸边一圈沙滩，外面一圈浅浅的礁盘。',
  cutaway: '把海水连同海底一起切开：上面是岛，水面下是一圈浅浅的礁盘，再往外是陡坎和深海平原，右边切到一条海沟。',
  reef: '贴着水面往礁盘看：枝状珊瑚、团块珊瑚、海扇和海百合，鱼群在礁盘边上来回。',
  trench: '海沟那一侧的剖面：海床在这里陡然下切，一条长颈海生爬行动物沿着沟慢慢巡游。',
  beach: '东边的沙滩：三只长颈植食恐龙沿着海岸来回走，背后是树林和火山。',
  summit: '火山口：坑里有一小池熔岩，烟往上飘，几只翼龙绕着山顶盘旋。',
};
const ui = { kicker: $('#shot-en'), name: $('#shot-name'), caption: $('#shot-caption') };
$('#n-herd').textContent = HERD.length; $('#n-flyer').textContent = FLYERS.length; $('#n-swim').textContent = SWIMMERS.length;
$('#n-shell').textContent = SHELLS.length; $('#n-fish').textContent = SCHOOLS.reduce((a, s) => a + s.n, 0);

// ---- State ----
const view = new ViewController();
let time = requested ? requested.at : 0, wall = 0, playing = !requested, last = performance.now(), ready = false, mode = requested ? 'shot' : 'tour', frames = 0;
let seed = 7;
const controls = new OrbitControls(camera, canvas); controls.enabled = false; controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = 20; controls.maxDistance = 520; controls.enablePan = false; controls.maxPolarAngle = Math.PI * 0.62;
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
// Capture phase: runs before OrbitControls' own pointerdown listener, so the first drag already orbits.
// The orbit centre is what the shot was looking at, so pressing does not swing the view away.
canvas.addEventListener('pointerdown', () => {
  if (mode === 'free' || !lastPose) return;
  mode = 'free'; controls.target.set(...lastPose.target); camera.up.set(0, 1, 0); controls.enabled = true; controls.update(); syncButtons();
}, { capture: true });
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
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  kick();
}
addEventListener('resize', resize);

const tmp = new THREE.Vector3();
function applyPose(pose) {
  camera.position.set(...pose.position); camera.up.set(...pose.up); camera.lookAt(...pose.target); camera.fov = pose.fov; camera.updateProjectionMatrix();
  lastPose = pose;
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (document.hidden) return;
  wall += dt;
  if (playing) time += dt;
  // A paused fixed view only skips redraws once the page has reported ready: the first frames must all be
  // drawn, or `ready` (set after the third frame) never comes true and checks wait forever.
  else if (ready && !dirty && mode !== 'free' && !view.moving) return;
  render();
}
let dirty = true; function kick() { dirty = true; }
function render() {
  dirty = false;
  const aspect = innerWidth / innerHeight;
  island.update(time);
  let fade = 0;
  if (mode === 'free') controls.update();
  else { const pose = view.pose(time, aspect, wall); fade = pose.fade || 0; applyPose(pose); }
  fadeEl.style.opacity = fade.toFixed(3);
  sky.position.copy(camera.position);
  renderer.info.reset(); renderer.render(scene, camera);
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
  const c = mod(time); clock.textContent = `${fmt(c)} / ${fmt(CYCLE)}`;
}
const fmt = (t) => `00:${String(Math.floor(t)).padStart(2, '0')}`;

// Unified play-test hook (optional; normal play never depends on it).
function snapshot() {
  const info = renderer.info;
  return {
    ready, requestedView: requested ? requested.key : null, view: mode === 'free' ? 'free' : view.key, mode, playing,
    time, cycle: mod(time), shot: shotAt(time).key, fade: Number(fadeEl.style.opacity || 0),
    creatures: { herd: HERD.length, flyers: FLYERS.length, swimmers: SWIMMERS.length, shells: SHELLS.length, fish: SCHOOLS.reduce((a, s) => a + s.n, 0) },
    drawCalls: info.render.calls, triangles: info.render.triangles, renderer: gpu, pixelRatio: renderer.getPixelRatio(), viewport: [innerWidth, innerHeight],
    camera: { position: camera.position.toArray(), target: mode === 'free' ? controls.target.toArray() : (lastPose ? lastPose.target : [0, 0, 0]), fov: camera.fov },
  };
}
// Screen position (0..1, y down) of a world point through the current camera, for pixel checks.
function pointScreen(p) { tmp.set(...p).project(camera); return { x: (tmp.x + 1) / 2, y: (1 - tmp.y) / 2, z: tmp.z }; }
function setView(k) {
  const s = SHOTS.find(x => x.key === k) || SHOTS[Number(k) - 1]; if (!s) return snapshot();
  mode = 'shot'; controls.enabled = false; view.jump(s.key); time = s.at; playing = false; shownShot = ''; syncButtons(); render(); return snapshot();
}
window.__ISLAND__ = { pointScreen, setView, setTime: (t) => { time = t; render(); return snapshot(); }, play: () => { playing = true; syncButtons(); },
  pause: () => { playing = false; syncButtons(); render(); }, tour: startTour, block: BLOCK, crater: CRATER, lavaY: island.lavaY };
window.__PLAYTEST__ = {
  get ready() { return ready; }, snapshot, setView, views: SHOTS.map(s => s.key),
  reset: () => { time = 0; mode = 'tour'; view.tour(0); playing = true; render(); return snapshot(); },
  setSeed: (n) => { seed = n; return seed; }, // the scene is fixed; kept for the shared tool contract
  step: (ms) => { time += ms / 1000; render(); return snapshot(); },
};
resize(); requestAnimationFrame((t) => { last = t; frame(t); });
