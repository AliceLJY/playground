// Walk-in exhibit. It opens on the 2D plan, where furniture is dragged in from a library (plan2d.js). Switching to 3D
// builds the house from that layout: orbit it, switch preset views, walk in through the front door, drag the sun through
// a winter day, cut the walls down, swap the wood tone, replay the build from the plan.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as C from './core.js';
import { createKit } from './kit.js';
import { buildExtra, buildStairs } from './extras.js';
import { buildHouse } from './house.js';
import { createPlan2D } from './plan2d.js';
import planUrl from '../assets/floorplan.jpg';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const COARSE = matchMedia('(pointer:coarse)').matches;
const canvas = $('c');

// light: 'studio' is a fixed high key light for looking at the model; 'sun' is the real winter-solstice sun at S.minute.
const S = { mode2d: true, mode: 'orbit', view: 'hero', style: 'oak', light: 'studio', cut: false, night: false, labels: true, auto: false, minute: 10 * 60, touring: false };

// ---------------- renderer, scene, light ----------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
const DPR = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(DPR);
renderer.toneMapping = THREE.NeutralToneMapping;       // keeps white walls white; the filmic curve turned them grey
renderer.shadowMap.enabled = true;
renderer.shadowMap.autoUpdate = false;       // the scene is static most of the time; shadows are redrawn only when something moves
const scene = new THREE.Scene();
const DAY_BG = new THREE.Color(0xf3efe8), NIGHT_BG = new THREE.Color(0x10151f);
scene.background = DAY_BG.clone();
const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 400);
camera.rotation.order = 'YXZ';
const hemi = new THREE.HemisphereLight(0xffffff, 0xe6ded2, 2.2);   // three.js light units are physical: a white wall under fill alone shows intensity / pi
const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(COARSE ? 2048 : 4096);
// The light always sits 55 m from the centre, so a tight depth range keeps the bias small in metres;
// a looser one let a sunlit sliver show where walls meet the ceiling.
Object.assign(sun.shadow.camera, { left: -17, right: 17, top: 17, bottom: -17, near: 30, far: 80 });
sun.shadow.bias = -0.00004; sun.shadow.normalBias = 0.008;
scene.add(hemi, sun, sun.target);

const pm = new THREE.PMREMGenerator(renderer);
const envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
pm.dispose();
const kit = createKit(THREE, RoundedBoxGeometry, { envTex });

// The 2D plan owns the furniture layout; every edit there marks the 3D furniture as stale.
let furnDirty = false;
const plan = createPlan2D({ getStyle: () => S.style, onChange: (layout) => { C.setLayout(layout); furnDirty = true; } });
C.setLayout(plan.layout());

const H = buildHouse();
scene.add(H.group);
const stairs = mergeByMaterial(buildStairs(kit, THREE));
scene.add(stairs);

// the source plan lying on the ground, shown while the house grows out of it
const planMesh = new THREE.Mesh(new THREE.PlaneGeometry(C.IW * C.M, C.IH * C.M), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, toneMapped: false }));
planMesh.rotation.x = -Math.PI / 2;
planMesh.position.set((C.IW / 2 - C.CX) * C.M, 0.02, (C.IH / 2 - C.CY) * C.M);
planMesh.visible = false;
scene.add(planMesh);

// one lamp per room for the night scene
const lamps = C.house.rooms.map((r) => {
  const p = new THREE.PointLight(0xffc98a, 0, 9, 1.6);
  p.position.set(C.toX(r.center_px[0]), 2.35, C.toZ(r.center_px[1]));
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 28), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d6, emissiveIntensity: 0.3 }));
  b.position.set(p.position.x, C.WALL_H - 0.02, p.position.z);
  scene.add(p, b);
  return { p, b };
});

// ---------------- furniture ----------------
// Every piece is merged into one mesh per material, so a sofa is a handful of draw calls instead of dozens.
function mergeByMaterial(root) {
  root.updateMatrixWorld(true);
  const groups = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld);
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const key = o.material.uuid + (o.castShadow ? 'c' : 'n');
    if (!groups.has(key)) groups.set(key, { mat: o.material, cast: o.castShadow, geos: [] });
    groups.get(key).geos.push(geo);
  });
  const out = new THREE.Group();
  for (const { mat, cast, geos } of groups.values()) {
    const m = new THREE.Mesh(mergeGeometries(geos, false), mat);
    geos.forEach((g) => g.dispose());
    m.castShadow = cast && !mat.transparent; m.receiveShadow = !mat.transparent;
    out.add(m);
  }
  root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  return out;
}
let furn = new THREE.Group(), items = [];
scene.add(furn);
function buildFurniture(styleKey) {
  furn.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  scene.remove(furn);
  furn = new THREE.Group(); items = [];
  for (const spec of C.furnitureSpecs(styleKey)) {
    if (spec.stair) continue;
    const raw = spec.type.startsWith('x:')
      ? buildExtra(spec, kit, THREE, C.STYLES[styleKey])
      : kit.build({ type: spec.type, w: spec.w, d: spec.d, color: spec.color, cx: spec.seedx, cy: spec.seedy, ...spec.opts });
    const g = mergeByMaterial(raw);
    g.position.set(spec.x, 0, spec.z);
    g.rotation.y = spec.yaw;
    furn.add(g);
    items.push({ spec, g });
  }
  scene.add(furn);
}

// ---------------- camera poses ----------------
const fitCam = new THREE.PerspectiveCamera();
const CORNERS = [C.EXTENT.x0, C.EXTENT.x1].flatMap((x) => [C.EXTENT.z0, C.EXTENT.z1].flatMap((z) => [0, C.WALL_H].map((y) => new THREE.Vector3(x, y, z))));
const aspect = () => canvas.clientWidth / Math.max(1, canvas.clientHeight);
// Whole-house views pull back until the house fits between the title and the toolbar; room views keep their distance.
function fitted(p) {
  if (!p.fit) return { ...p };
  fitCam.fov = p.fov; fitCam.aspect = aspect(); fitCam.updateProjectionMatrix();
  const narrow = aspect() < 0.8;
  // on a tall screen the house is turned so its long side runs up the screen
  if (narrow && p.azNarrow !== undefined) p = { ...p, az: p.azNarrow };
  const top = narrow ? 0.7 : 0.8, bottom = narrow ? -0.44 : -0.66, side = narrow ? 0.92 : 0.88;
  let r = narrow ? p.r * 0.7 : p.r;
  for (let i = 0; i < 80; i++, r *= 1.04) {
    fitCam.position.set(...C.posePosition(p, r));
    fitCam.up.set(0, 1, 0);
    fitCam.lookAt(p.target[0], p.target[1], p.target[2]);
    fitCam.updateMatrixWorld();
    if (CORNERS.every((c) => { const v = c.clone().project(fitCam); return Math.abs(v.x) <= side && v.y <= top && v.y >= bottom; })) break;
  }
  return { ...p, r };
}
function setPose(p) {
  camera.fov = p.fov; camera.updateProjectionMatrix();
  camera.position.set(...C.posePosition(p));
  controls.target.set(p.target[0], p.target[1], p.target[2]);
  camera.up.set(0, 1, 0);
  camera.lookAt(controls.target);
}
function currentPose() {
  const o = camera.position.clone().sub(controls.target), r = o.length();
  return { target: controls.target.toArray(), r, polar: Math.acos(THREE.MathUtils.clamp(o.y / r, -1, 1)), az: Math.atan2(o.x, o.z), fov: camera.fov };
}
function mixPose(a, b, k) {
  let daz = b.az - a.az; daz = Math.atan2(Math.sin(daz), Math.cos(daz));
  return { target: a.target.map((v, i) => C.lerp(v, b.target[i], k)), r: C.lerp(a.r, b.r, k), polar: C.lerp(a.polar, b.polar, k), az: a.az + daz * k, fov: C.lerp(a.fov, b.fov, k) };
}

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.12;
controls.maxPolarAngle = 1.45; controls.minDistance = 3; controls.maxDistance = 220;
controls.autoRotateSpeed = 0.7;
controls.addEventListener('start', () => { tween = null; if (S.auto) setAuto(false); markView(null); });

// ---------------- state setters ----------------
let needs = true, tween = null, grow = null;
const invalidate = (shadow = false) => { needs = true; if (shadow) renderer.shadowMap.needsUpdate = true; };

// Walking always uses the real sun, so light falls through the windows; from above the default is the studio light.
const lightMode = () => (S.night ? 'night' : S.mode === 'walk' || S.light === 'sun' ? 'sun' : 'studio');
function setMinute(min) {
  S.minute = Math.min(C.SUNSET, Math.max(C.SUNRISE, min));
  $('sun').value = String(S.minute);
  applyLight();
}
function setLight(mode) { S.light = mode; applyLight(); applyCeiling(); syncButtons(); }
function applyLight() {
  const mode = lightMode(), n = mode === 'night' ? 1 : 0;
  if (mode === 'studio') {
    sun.position.set(-19.6, 49, 15.7);                 // 55 m from the centre, like the real sun below
    sun.color.set(0xfff1dc);
    sun.intensity = 2.0;
  } else {
    const sp = C.sunAt(S.minute), v = C.sunVec(sp.az, Math.max(0.6, sp.alt)), lowK = C.clamp01(sp.alt / 12);
    sun.position.set(v[0] * 55, v[1] * 55, v[2] * 55);
    sun.color.setHSL(0.09, C.lerp(0.75, 0.25, lowK), C.lerp(0.65, 0.93, lowK));
    sun.intensity = n ? 0 : C.lerp(1.4, 3.0, lowK);
  }
  sun.target.position.set(0, 0, 0);
  $('clock').textContent = mode === 'night' ? '入夜' : mode === 'studio' ? '示意光' : C.clock(S.minute);
  sun.visible = !n;
  // indoors under a ceiling nothing bounces light for us, so walking gets a stronger, more even fill
  hemi.intensity = n ? 0.3 : S.mode === 'walk' ? 2.8 : mode === 'sun' ? 1.8 : 2.2;
  hemi.color.set(n ? 0x5a6a8a : 0xffffff);
  hemi.groundColor.set(n ? 0x1a1a22 : S.mode === 'walk' ? 0xf2ece0 : 0xe6ded2);
  scene.background.copy(n ? NIGHT_BG : DAY_BG);
  H.MAT.ground.opacity = n ? 0 : 0.2;
  renderer.toneMappingExposure = n ? 1.2 : 1.0;
  kit.setEnvK(n ? 0.15 : 1);
  for (const { p, b } of lamps) { p.intensity = n ? 5.5 : 0; b.material.emissiveIntensity = n ? 2 : 0.3; b.visible = !S.cut; }
  document.body.classList.toggle('night', !!n);
  invalidate(true);
}
function setNight(on) { S.night = !!on; applyLight(); syncButtons(); }
function setStyle(key) {
  if (!C.STYLES[key]) return;
  S.style = key;
  H.setStyle(key);
  buildFurniture(key);
  furnDirty = false;
  plan.restyle();
  syncButtons();
  invalidate(true);
}
// Seen from above the ceiling is left out; under the real sun it still casts its shadow so light only comes in through the windows.
function applyCeiling() { H.setCeiling(S.cut || grow ? 'off' : S.mode === 'walk' ? 'solid' : S.light === 'sun' && !S.night ? 'shadow' : 'off'); invalidate(true); }
function setCut(on) {
  if (S.mode === 'walk') return;
  S.cut = !!on;
  H.setCut(S.cut);
  applyCeiling();
  for (const { b } of lamps) b.visible = !S.cut;
  syncButtons();
  invalidate(true);
}
function setLabels(on) { S.labels = !!on; syncButtons(); invalidate(); }
function setAuto(on) { S.auto = !!on; controls.autoRotate = S.auto; syncButtons(); invalidate(); }
function markView(name) { S.view = name; syncButtons(); }
function setView(name, { instant = false } = {}) {
  if (!C.VIEWS[name]) return;
  if (S.mode === 'walk') exitWalk({ instant: true });
  if (grow) endGrow();
  const to = fitted(C.VIEWS[name]);
  if (S.auto) setAuto(false);
  if (instant) { setPose(to); tween = null; } else tween = { t: 0, dur: 1.0, from: currentPose(), to };
  markView(name);
  invalidate();
}

// ---------------- 2D plan <-> 3D scene ----------------
function setMode2D(on, { instant = false } = {}) {
  if (S.mode2d === on) return;
  S.mode2d = on;
  document.body.classList.toggle('m2d', on); document.body.classList.toggle('m3d', !on);
  if (on) {
    if (S.mode === 'walk') exitWalk({ instant: true });
    if (grow) endGrow();
    tween = null;
    if (S.auto) setAuto(false);
    plan.shown();
  } else {
    if (furnDirty) { buildFurniture(S.style); furnDirty = false; }
    resize();
    if (instant) setPose(fitted(C.VIEWS.hero)); else startGrow();     // the house grows out of the plan just left
    invalidate(true);
  }
}
document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode2D(b.dataset.mode === '2d')));
new ResizeObserver(() => document.documentElement.style.setProperty('--toph', $('top').offsetHeight + 'px')).observe($('top'));
$('subtitle').textContent = `首层 · ${C.house.rooms.length} 个房间 · ${C.house.rooms.reduce((a, r) => a + r.area_m2, 0).toFixed(1)} m² · 尺寸单位 mm`;

// ---------------- growing out of the plan ----------------
const GROW_T = 4.8;
function startGrow() {
  if (S.mode === 'walk') exitWalk({ instant: true });
  if (S.cut) setCut(false);
  if (S.auto) setAuto(false);
  tween = null;
  grow = { t: 0, from: fitted(C.VIEWS.top), to: fitted(C.VIEWS.hero) };
  controls.enabled = false;
  applyCeiling();
  markView('hero');
  applyGrow(0);
}
function applyGrow(t) {
  const pa = 1 - C.smooth(1.2, 2.0, t);
  planMesh.visible = pa > 0.001; planMesh.material.opacity = pa;
  const rise = C.smooth(0.8, 2.1, t);
  H.setRise(rise);
  H.full.group.visible = rise > 0.001;
  H.setFloorAlpha(C.smooth(1.5, 2.2, t));
  stairs.scale.y = Math.max(0.002, C.smooth(1.7, 2.3, t)); stairs.visible = t > 1.7;
  const n = items.length;
  items.forEach(({ g, spec }, i) => {
    const k = C.clamp01((t - (2.2 + (i / n) * 1.8)) / 0.45);
    g.visible = k > 0;
    g.position.y = (1 - C.easeOutBack(k)) * 1.6;
    g.scale.setScalar(Math.max(0.001, Math.min(1, k * 2)));
    void spec;
  });
  for (const { b } of lamps) b.visible = false;
  setPose(mixPose(grow.from, grow.to, C.easeInOut(C.clamp01((t - 0.9) / 2.4))));
}
function endGrow() {
  if (!grow) return;
  const to = grow.to;
  grow = null;
  planMesh.visible = false;
  H.setRise(1); H.full.group.visible = true; H.setFloorAlpha(1);
  stairs.scale.y = 1; stairs.visible = true;
  for (const { g } of items) { g.visible = true; g.position.y = 0; g.scale.setScalar(1); }
  for (const { b } of lamps) b.visible = !S.cut;
  setPose(to);
  controls.enabled = true;
  applyCeiling();
  invalidate(true);
}

// ---------------- walking ----------------
const WALK_FOV = 62;
const walk = { x: C.START.x, z: C.START.z, yaw: 0, pitch: 0, route: null, look: null };
const doors = C.newDoorState(0);
const keys = {}, joy = { x: 0, y: 0, id: null };
const LOOK_AT = [C.toX(650), 1.0, C.toZ(215)];          // where the tour ends up looking: sofas and the fireplace
function placeWalkCamera() {
  camera.position.set(walk.x, C.EYE_H, walk.z);
  camera.rotation.set(walk.pitch, walk.yaw, 0);
}
const yawTo = (x, z) => Math.atan2(-(x - walk.x), -(z - walk.z));
function enterWalk({ instant = false, tour = true } = {}) {
  if (S.mode === 'walk') return;
  if (grow) endGrow();
  if (S.cut) setCut(false);
  if (S.auto) setAuto(false);
  S.mode = 'walk';
  controls.enabled = false;
  tween = null;
  applyLight();
  Object.assign(walk, { x: C.START.x, z: C.START.z, yaw: 0, pitch: 0, route: null, look: null });
  doors.forEach((d) => { d.k = 0; d.want = 0; });
  H.setDoors(doors);
  applyCeiling();
  document.body.classList.add('walking');
  if (instant) { camera.fov = WALK_FOV; camera.updateProjectionMatrix(); placeWalkCamera(); }
  else {
    const p0 = camera.position.clone(), q0 = camera.quaternion.clone(), f0 = camera.fov;
    placeWalkCamera();
    const p1 = camera.position.clone(), q1 = camera.quaternion.clone();
    camera.position.copy(p0); camera.quaternion.copy(q0);
    tween = { t: 0, dur: 1.5, fn: (k) => { camera.position.lerpVectors(p0, p1, k); camera.quaternion.slerpQuaternions(q0, q1, k); camera.fov = C.lerp(f0, WALK_FOV, k); camera.updateProjectionMatrix(); },
      done: () => { camera.rotation.order = 'YXZ'; placeWalkCamera(); if (tour) startTour('tour'); } };
  }
  syncButtons();
  invalidate(true);
}
function exitWalk({ instant = false } = {}) {
  if (S.mode !== 'walk') return;
  S.mode = 'orbit'; S.touring = false; walk.route = null; walk.look = null;
  joy.x = joy.y = 0; joy.id = null;
  document.body.classList.remove('walking');
  applyLight();
  applyCeiling();
  const to = fitted(C.VIEWS.hero);
  if (instant) { setPose(to); controls.enabled = true; }
  else {
    const p0 = camera.position.clone(), q0 = camera.quaternion.clone(), f0 = camera.fov;
    setPose(to);
    const p1 = camera.position.clone(), q1 = camera.quaternion.clone();
    camera.position.copy(p0); camera.quaternion.copy(q0);
    tween = { t: 0, dur: 1.3, fn: (k) => { camera.position.lerpVectors(p0, p1, k); camera.quaternion.slerpQuaternions(q0, q1, k); camera.fov = C.lerp(f0, to.fov, k); camera.updateProjectionMatrix(); },
      done: () => { setPose(to); controls.enabled = true; } };
  }
  markView('hero');
  invalidate(true);
}
function startTour(name) {
  walk.route = { pts: C.ROUTES[name].map(([px, py]) => [C.toX(px), C.toZ(py)]), i: 0, end: name === 'tour' ? LOOK_AT : null };
  walk.stuck = 0; walk.routeT = 0;
  walk.look = null;
  S.touring = true;
  syncButtons();
}
function stopTour() { walk.route = null; walk.look = null; S.touring = false; syncButtons(); }
const turn = (cur, want, k) => cur + Math.atan2(Math.sin(want - cur), Math.cos(want - cur)) * k;
// One frame of walking. Returns true while anything is moving.
function stepWalkMode(dt) {
  let vx = 0, vz = 0, moving = false;
  const fx = -Math.sin(walk.yaw), fz = -Math.cos(walk.yaw);          // forward
  const manual = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - joy.y;
  const strafe = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + joy.x;
  if (Math.abs(manual) > 0.05 || Math.abs(strafe) > 0.05) {
    if (walk.route || walk.look) stopTour();
    const sp = keys.ShiftLeft || keys.ShiftRight ? C.RUN_SPEED : C.WALK_SPEED, mag = Math.min(1, Math.hypot(manual, strafe));
    vx = ((fx * manual - fz * strafe) / Math.hypot(manual, strafe)) * sp * mag;
    vz = ((fz * manual + fx * strafe) / Math.hypot(manual, strafe)) * sp * mag;
  } else if (walk.route) {
    const r = walk.route, [tx, tz] = r.pts[r.i], dx = tx - walk.x, dz = tz - walk.z, dist = Math.hypot(dx, dz);
    if (dist < 0.12) {
      if (++r.i >= r.pts.length) { walk.look = r.end; walk.route = null; S.touring = false; syncButtons(); }
    } else {
      vx = (dx / dist) * C.WALK_SPEED; vz = (dz / dist) * C.WALK_SPEED;
      walk.yaw = turn(walk.yaw, Math.atan2(-dx, -dz), 1 - Math.exp(-dt * 4));
      walk.pitch = turn(walk.pitch, -0.04, 1 - Math.exp(-dt * 3));
    }
    moving = true;
  } else if (walk.look) {
    const want = yawTo(walk.look[0], walk.look[2]), wp = Math.atan2(walk.look[1] - C.EYE_H, Math.hypot(walk.look[0] - walk.x, walk.look[2] - walk.z));
    walk.yaw = turn(walk.yaw, want, 1 - Math.exp(-dt * 3)); walk.pitch = turn(walk.pitch, wp, 1 - Math.exp(-dt * 3));
    if (Math.abs(Math.atan2(Math.sin(want - walk.yaw), Math.cos(want - walk.yaw))) < 0.004) walk.look = null;
    moving = true;
  }
  if (vx || vz) {
    const went = C.stepWalk(walk, vx, vz, dt, doors);
    moving = true;
    // furniture moved onto the route: give up instead of pushing against it for ever
    if (walk.route) { walk.routeT += dt; walk.stuck = went < C.WALK_SPEED * dt * 0.2 ? (walk.stuck || 0) + dt : 0; if (walk.stuck > 1.2 || walk.routeT > 40) stopTour(); }
  }
  const before = doors.map((d) => d.k);
  C.stepDoors(doors, walk.x, walk.z, dt);
  if (doors.some((d, i) => d.k !== before[i])) { H.setDoors(doors); renderer.shadowMap.needsUpdate = true; moving = true; }
  placeWalkCamera();
  return moving;
}
function lookBy(dx, dy) {
  if (walk.route || walk.look) stopTour();
  walk.yaw -= dx * 0.005;
  walk.pitch = THREE.MathUtils.clamp(walk.pitch - dy * 0.005, -1.2, 1.2);
  invalidate();
}

// ---------------- labels ----------------
const labelEls = C.house.rooms.map((r) => {
  const el = document.createElement('div');
  el.className = 'room3';
  el.innerHTML = `<b>${r.name_zh}</b><span>${r.area_m2.toFixed(1)} ㎡</span>`;
  $('labels').appendChild(el);
  return { el, v: new THREE.Vector3(C.toX(r.center_px[0]), 0.4, C.toZ(r.center_px[1])) };
});
const tmp = new THREE.Vector3();
function updateLabels() {
  const show = S.labels && S.mode === 'orbit' && !grow && !(tween && tween.fn);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  for (const { el, v } of labelEls) {
    tmp.copy(v).project(camera);
    const ok = show && tmp.z < 1 && Math.abs(tmp.x) < 1.05 && Math.abs(tmp.y) < 1.05;
    el.style.opacity = ok ? '1' : '0';
    if (ok) el.style.transform = `translate(-50%,-50%) translate(${((tmp.x + 1) / 2) * w}px,${((1 - tmp.y) / 2) * h}px)`;
  }
}

// ---------------- UI ----------------
function syncButtons() {
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', S.mode === 'orbit' && b.dataset.view === S.view));
  const on = { walk: S.mode === 'walk', cut: S.cut, night: S.night, labels: S.labels, auto: S.auto, tour: S.touring, sunmode: lightMode() === 'sun' };
  document.querySelectorAll('[data-act]').forEach((b) => { if (b.dataset.act in on) b.classList.toggle('on', on[b.dataset.act]); });
  $('styleName').textContent = C.STYLES[S.style].zh;
  $('hint').textContent = S.mode === 'walk'
    ? (COARSE ? '左下摇杆走动 · 拖动画面转头 · 走近门会自己开' : 'W A S D 走动 · 拖动画面转头 · Shift 快走 · 走近门会自己开 · Esc 退出')
    : (COARSE ? '单指转动 · 双指缩放 · 回 2D 平面可以摆家具' : '拖动旋转 · 滚轮缩放 · 数字键 1–6 切机位 · T 回 2D 平面摆家具');
}
const ACTS = {
  walk: () => (S.mode === 'walk' ? exitWalk() : enterWalk()),
  cut: () => setCut(!S.cut),
  sunmode: () => { if (S.night) setNight(false); if (S.mode !== 'walk') setLight(S.light === 'sun' ? 'studio' : 'sun'); },
  night: () => setNight(!S.night),
  style: () => setStyle(S.style === 'oak' ? 'walnut' : 'oak'),
  labels: () => setLabels(!S.labels),
  auto: () => { if (S.mode === 'walk') exitWalk({ instant: true }); setAuto(!S.auto); },
  grow: () => startGrow(),
  tour: () => (S.touring ? stopTour() : startTour(walk.z > C.toZ(520) ? 'tour' : 'family')),
  exit: () => exitWalk(),
};
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => ACTS[b.dataset.act]()));
// whole 5-minute marks inside the day, so the clock never reads 14:58
$('sun').min = String(Math.ceil(C.SUNRISE / 5) * 5); $('sun').max = String(Math.floor(C.SUNSET / 5) * 5);
$('sun').addEventListener('input', (e) => { if (S.night) setNight(false); S.minute = +e.target.value; setLight('sun'); });
$('sunmeta').textContent = `${C.house.sun.place} · ${C.house.sun.date_zh}（假设）· 日出 ${C.house.sun.sunrise} · 日落 ${C.house.sun.sunset}`;

addEventListener('keydown', (e) => {
  if (e.target.matches('input,select,textarea') || e.altKey) return;
  const mod = e.metaKey || e.ctrlKey;
  if (S.mode2d) {                                   // on the plan: T goes to 3D, C swaps the wood, the rest edits furniture
    if (!mod && e.code === 'KeyT') return setMode2D(false);
    if (!mod && e.code === 'KeyC') return ACTS.style();
    plan.handleKey(e);
    return;
  }
  if (mod) return;
  keys[e.code] = true;
  if (e.repeat) return;
  if (e.code === 'KeyT' && S.mode !== 'walk') return setMode2D(true);
  const digit = /^Digit([1-6])$/.exec(e.code);
  if (digit) return setView(C.VIEW_KEYS[+digit[1] - 1]);
  const map = { KeyF: 'walk', KeyX: 'cut', KeyN: 'night', KeyC: 'style', KeyL: 'labels', KeyO: 'auto', KeyG: 'grow', KeyT: 'tour', KeyR: 'sunmode' };
  if (e.code === 'Escape' && S.mode === 'walk') return exitWalk();
  if (map[e.code] && !(S.mode !== 'walk' && e.code === 'KeyT')) ACTS[map[e.code]]();
  invalidate();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k of Object.keys(keys)) keys[k] = false; });

let drag = null;
canvas.addEventListener('pointerdown', (e) => { if (S.mode === 'walk' && !drag) { drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); } });
canvas.addEventListener('pointermove', (e) => { if (drag && e.pointerId === drag.id) { lookBy(e.clientX - drag.x, e.clientY - drag.y); drag.x = e.clientX; drag.y = e.clientY; } });
const endDrag = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
{
  const el = $('joy'), knob = el.firstElementChild, R = 46;
  const upd = (e) => {
    const r = el.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const L = Math.hypot(dx, dy); if (L > R) { dx *= R / L; dy *= R / L; }
    joy.x = dx / R; joy.y = dy / R; knob.style.transform = `translate(${dx}px,${dy}px)`;
  };
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); joy.id = e.pointerId; el.setPointerCapture(e.pointerId); upd(e); });
  el.addEventListener('pointermove', (e) => { if (e.pointerId === joy.id) upd(e); });
  const end = (e) => { if (e.pointerId !== joy.id) return; joy.id = null; joy.x = joy.y = 0; knob.style.transform = ''; };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
  invalidate();
}
new ResizeObserver(resize).observe(canvas);

// ---------------- loop ----------------
const metrics = { calls: 0, triangles: 0, fps: 0, frames: 0 };
let last = performance.now(), fpsAcc = 0, fpsN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (S.mode2d) return;
  let active = false;
  if (grow) {
    grow.t += dt;
    if (grow.t >= GROW_T) endGrow(); else applyGrow(grow.t);
    renderer.shadowMap.needsUpdate = true; active = true;
  } else if (tween) {
    tween.t += dt;
    const k = C.easeInOut(C.clamp01(tween.t / tween.dur));
    if (tween.fn) tween.fn(k); else setPose(mixPose(tween.from, tween.to, k));
    if (tween.t >= tween.dur) { const d = tween.done; tween = null; if (d) d(); }
    active = true;
  } else if (S.mode === 'walk') {
    active = stepWalkMode(dt);
  } else {
    const before = doors.map((d) => d.k);
    C.restDoors(doors, dt);
    if (doors.some((d, i) => d.k !== before[i])) { H.setDoors(doors); renderer.shadowMap.needsUpdate = true; active = true; }
    if (controls.update()) active = true;
  }
  if (!active && !needs) return;
  needs = false;
  renderer.render(scene, camera);
  updateLabels();
  metrics.calls = renderer.info.render.calls; metrics.triangles = renderer.info.render.triangles; metrics.frames++;
  if (active) { fpsAcc += dt; fpsN++; if (fpsAcc >= 0.5) { metrics.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; $('fps').textContent = `${metrics.fps} fps · ${metrics.calls} calls`; } }
}

// ---------------- hooks for checks and recording ----------------
function renderNow() { renderer.shadowMap.needsUpdate = true; renderer.render(scene, camera); updateLabels(); metrics.calls = renderer.info.render.calls; metrics.triangles = renderer.info.render.triangles; }
window.__house = {
  ready: false, state: S, metrics, core: C, plan, to3d: (o) => setMode2D(false, o), to2d: () => setMode2D(true), dev: { sun, hemi, H, camera, walk, lamps, renderNow, placeWalkCamera },
  setView: (n, o) => { setView(n, o); renderNow(); }, setMinute: (m) => { setMinute(m); renderNow(); }, setNight: (b) => { setNight(b); renderNow(); },
  setLight: (m) => { setLight(m); renderNow(); }, setStyle: (k) => { setStyle(k); renderNow(); }, setCut: (b) => { setCut(b); renderNow(); }, setLabels: (b) => { setLabels(b); renderNow(); },
  grow: startGrow, enterWalk, exitWalk, startTour,
  // Jump to the end of a route by running the real walking code at a fixed step, then freeze there.
  walkTo(name = 'tour') {
    if (S.mode !== 'walk') enterWalk({ instant: true, tour: false });
    const log = C.autopilot(name, { doors });
    Object.assign(walk, { x: log.pos.x, z: log.pos.z, route: null, look: null });
    walk.yaw = yawTo(LOOK_AT[0], LOOK_AT[2]);
    walk.pitch = Math.atan2(LOOK_AT[1] - C.EYE_H, Math.hypot(LOOK_AT[0] - walk.x, LOOK_AT[2] - walk.z));
    H.setDoors(doors); placeWalkCamera(); renderNow();
    return { done: log.done, t: log.t, minClear: log.minClear, crossings: log.crossings };
  },
  probe: () => ({ mode2d: S.mode2d, pieces: plan.layout().length, built: items.length, mode: S.mode, view: S.view, walk: { x: walk.x, z: walk.z, yaw: walk.yaw }, doors: doors.map((d) => d.k), dpr: DPR,
    buffer: [renderer.domElement.width, renderer.domElement.height], growing: !!grow, tweening: !!tween, ...metrics }),
  // Where the house sits on screen: bounding box of the footprint corners as fractions of the viewport.
  screenBox() {
    camera.updateMatrixWorld();
    const pts = CORNERS.map((c) => c.clone().project(camera));
    const xs = pts.map((p) => (p.x + 1) / 2), ys = pts.map((p) => (1 - p.y) / 2);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  },
  // Mean luminance (0-255, display values) of a viewport rectangle given as fractions.
  luma(x0, y0, x1, y1) {
    renderNow();
    const gl = renderer.getContext(), W = renderer.domElement.width, Hh = renderer.domElement.height;
    const px = Math.floor(x0 * W), py = Math.floor((1 - y1) * Hh), w = Math.max(1, Math.floor((x1 - x0) * W)), h = Math.max(1, Math.floor((y1 - y0) * Hh));
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(px, py, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let s = 0;
    for (let i = 0; i < buf.length; i += 4) s += 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2];
    return s / (w * h);
  },
};

// ---------------- start ----------------
new THREE.TextureLoader().load(planUrl, (tex) => {
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  planMesh.material.map = tex; planMesh.material.needsUpdate = true;
  resize();
  buildFurniture(S.style);
  H.setDoors(doors);
  if (Q.get('style')) setStyle(Q.get('style'));
  setMinute(Q.has('minute') ? +Q.get('minute') : S.minute);
  if (Q.has('minute') || Q.get('light') === 'sun') setLight('sun');
  if (Q.get('night') === '1') setNight(true);
  if (Q.get('labels') === '0') setLabels(false);
  if (Q.get('debug') === '1') document.body.classList.add('debug');
  // Any ?view= goes straight to that 3D state; without it the page opens on the 2D plan.
  const view = Q.get('view');
  setPose(fitted(C.VIEWS.hero));
  if (view && view !== '2d') {
    setMode2D(false, { instant: true });
    if (view === 'walk') window.__house.walkTo('tour');
    else if (view === 'cut') { setCut(true); setView('hero', { instant: true }); }
    else if (C.VIEWS[view]) setView(view, { instant: true });
  } else plan.shown();
  syncButtons();
  renderNow();
  requestAnimationFrame(frame);
  window.__house.ready = true;
});
