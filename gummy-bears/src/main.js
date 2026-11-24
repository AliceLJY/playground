// Gummy Bears: translucent soft-body bears on a white table. The physics lives in physics.js (no package);
// this file draws it with Three.js and wires the pointer, the control card and the __PLAYTEST__ hooks.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { World, FLAVORS, DT, POUR } from './physics.js';
import { mergedIndex, computeNormals } from './mesh.js';
import { SCENARIOS, runOnWorld } from './scenarios.js';
import { SHADOW, frame, projectionMatrix, screenToPlane, screenBox, pickParticle, project, toScreen } from './view.js';

const params = new URLSearchParams(location.search);
const canvas = document.querySelector('#scene');
const $ = (s) => document.querySelector(s);
// Two tiers. "low" (phones, coarse pointers, narrow screens): no refraction (transmission), a cheaper
// shadow map, a coarser bear surface and fewer bears. Both are written down in SPEC.md.
const coarse = matchMedia('(pointer: coarse)').matches;
const quality = params.get('quality') === 'low' || params.get('quality') === 'high' ? params.get('quality') : (coarse || Math.min(innerWidth, innerHeight) < 600 ? 'low' : 'high');
const HIGH = quality === 'high';
const seedParam = Number.parseInt(params.get('seed') || '', 10);

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  const fail = $('#fail'); fail.hidden = false;
  fail.textContent = '这个页面需要 WebGL 才能显示三维的软糖熊。请换一个支持 WebGL 的浏览器，或打开硬件加速后再试。';
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, HIGH ? 2 : 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
// Neutral tone mapping keeps the candy colours saturated (ACES tends to wash bright translucent colours to grey).
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
const PAPER = new THREE.Color('#fbfaf7');
renderer.setClearColor(PAPER, 1);
renderer.info.autoReset = false;

const world = new World({ seed: Number.isFinite(seedParam) ? seedParam : 7, quality });
const tpl = world.tpl, NV = tpl.surface.positions.length, TRI = tpl.surface.indices.length / 3, N = world.n;

// ---------- scene ----------
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(26, 1, 0.5, 200);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.9;
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(4, 9, 6);
scene.add(sun);

// Coloured soft shadows. Each particle of each bear stamps a soft round spot onto a top-down map of the
// table, tinted with its bear's colour (light through red jelly falls red). Spots are combined with a
// per-channel minimum, so one bear's spots do not stack into black and overlapping bears mix their tints.
// Drawn as points with a per-vertex colour attribute (not instanceColor).
const SH = SHADOW;
const shadowRT = new THREE.WebGLRenderTarget(HIGH ? 900 : 420, HIGH ? 660 : 308, { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
const shadowScene = new THREE.Scene();
const shadowCam = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
const shadowGeo = new THREE.BufferGeometry();
const shadowPos = new Float32Array(world.cap * N * 3), shadowTint = new Float32Array(world.cap * N * 3);
shadowGeo.setAttribute('position', new THREE.BufferAttribute(shadowPos, 3).setUsage(THREE.DynamicDrawUsage));
shadowGeo.setAttribute('tint', new THREE.BufferAttribute(shadowTint, 3).setUsage(THREE.DynamicDrawUsage));
const shadowMat = new THREE.ShaderMaterial({
  uniforms: { uLight: { value: new THREE.Vector2(...SH.light) }, uBounds: { value: new THREE.Vector4(SH.x0, SH.z0, SH.w, SH.d) }, uPx: { value: shadowRT.width / SH.w }, uShape: { value: new THREE.Vector4(SH.radius[0], SH.radius[1], SH.strength, SH.falloff) } },
  vertexShader: `
    uniform vec2 uLight; uniform vec4 uBounds; uniform float uPx; uniform vec4 uShape;
    attribute vec3 tint; varying vec3 vTint; varying float vA;
    void main() {
      vec2 g = position.xz + uLight * position.y;
      vec2 ndc = (g - uBounds.xy) / uBounds.zw * 2.0 - 1.0;
      gl_Position = vec4(ndc, 0.0, 1.0);
      float radius = uShape.x + uShape.y * position.y;
      gl_PointSize = 2.0 * radius * uPx;
      vA = uShape.z / (1.0 + uShape.w * position.y);
      vTint = tint;
    }`,
  fragmentShader: `
    varying vec3 vTint; varying float vA;
    void main() {
      float d = length(gl_PointCoord - 0.5) * 2.0;
      float g = exp(-d * d * 3.2) * (1.0 - smoothstep(0.8, 1.0, d));
      gl_FragColor = vec4(mix(vec3(1.0), vTint, vA * g), 1.0);
    }`,
  blending: THREE.CustomBlending, blendEquation: THREE.MinEquation, depthTest: false, depthWrite: false, transparent: true,
});
const shadowPoints = new THREE.Points(shadowGeo, shadowMat);
shadowPoints.frustumCulled = false;
shadowScene.add(shadowPoints);

// The table: the page's own white, darkened only by the shadow map. Not tone mapped, so it matches the page.
const table = new THREE.Mesh(new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
  uniforms: { uShadow: { value: shadowRT.texture }, uBounds: { value: new THREE.Vector4(SH.x0, SH.z0, SH.w, SH.d) }, uPaper: { value: PAPER.clone() } },
  vertexShader: `varying vec2 vXZ; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vXZ = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `
    uniform sampler2D uShadow; uniform vec4 uBounds; uniform vec3 uPaper; varying vec2 vXZ;
    void main() {
      vec2 uv = (vXZ - uBounds.xy) / uBounds.zw;
      vec3 s = vec3(1.0);
      if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) s = texture2D(uShadow, uv).rgb;
      gl_FragColor = vec4(uPaper * s, 1.0);
      #include <colorspace_fragment>
    }`,
  toneMapped: false,
}));
scene.add(table);

// Bears: one merged mesh per flavour (at most five draw calls), skinned on the CPU from the physics lattice.
const index = new THREE.BufferAttribute(mergedIndex(tpl.surface.indices, NV, world.cap), 1);
const meshes = FLAVORS.map((f) => {
  const geo = new THREE.BufferGeometry();
  geo.setIndex(index);
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(world.cap * NV * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(world.cap * NV * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geo.setDrawRange(0, 0);
  const mesh = new THREE.Mesh(geo, bearMaterial(f));
  mesh.frustumCulled = false; mesh.visible = false;
  scene.add(mesh);
  return mesh;
});
function bearMaterial(f) {
  const deep = new THREE.Color(f.color), white = new THREE.Color(1, 1, 1);
  const common = { roughness: 0.16, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, ior: 1.42, specularIntensity: 0.7 };
  if (HIGH) {
    // Refraction with absorption: the thicker the jelly the light crosses, the deeper the colour.
    const m = new THREE.MeshPhysicalMaterial({ ...common, color: white.clone().lerp(deep, 0.5), transmission: 1, thickness: 1.2, attenuationColor: deep, attenuationDistance: f.clarity ? 2.6 : 0.6 });
    // Thickness follows the view angle: full through the middle of a limb, thin at its silhouette.
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <transmission_fragment>', THREE.ShaderChunk.transmission_fragment.replace('material.thickness = thickness;', 'material.thickness = thickness * ( 0.2 + 0.8 * pow( saturate( dot( normal, normalize( vViewPosition ) ) ), 0.7 ) );'));
    };
    return m;
  }
  // Phone tier: no refraction pass. Plain transparency, deeper colour and less see-through in the middle.
  const m = new THREE.MeshPhysicalMaterial({ ...common, color: deep, transparent: true, depthWrite: true });
  const uDeep = { value: deep.clone() }, uEdge = { value: white.clone().lerp(deep, f.clarity ? 0.35 : 0.55) }, uAlpha = { value: new THREE.Vector2(f.clarity ? 0.32 : 0.55, f.clarity ? 0.62 : 0.93) };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uDeep, uEdge, uAlpha });
    sh.fragmentShader = 'uniform vec3 uDeep; uniform vec3 uEdge; uniform vec2 uAlpha;\n' + sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      float nv = saturate( dot( normal, normalize( vViewPosition ) ) );
      diffuseColor.rgb = mix( uEdge, uDeep, pow( nv, 0.65 ) );
      diffuseColor.a = mix( uAlpha.x, uAlpha.y, nv );`);
  };
  return m;
}

// Which slot of which flavour mesh each bear occupies, and which sleeping bears are already drawn.
let slotOf = [], perFlavor = [0, 0, 0, 0, 0], drawnAsleep = [];
function resetSlots() { slotOf = []; perFlavor = [0, 0, 0, 0, 0]; drawnAsleep = []; }
function syncMeshes() {
  const ranges = FLAVORS.map(() => [Infinity, -1]);
  for (let b = 0; b < world.count; b++) {
    const B = world.bears[b];
    if (!slotOf[b]) {
      slotOf[b] = { flavor: B.flavor, slot: perFlavor[B.flavor]++ };
      const c = new THREE.Color(FLAVORS[B.flavor].color), clear = FLAVORS[B.flavor].clarity;
      // Shadow tint: the flavour colour, a little darker; the near-clear pineapple casts a pale warm grey.
      const t = clear ? [0.62, 0.58, 0.46] : [c.r * 0.82, c.g * 0.82, c.b * 0.82];
      for (let i = 0; i < N; i++) shadowTint.set(t, (b * N + i) * 3);
      shadowGeo.attributes.tint.needsUpdate = true;
    }
    if (B.asleep && drawnAsleep[b]) continue;
    drawnAsleep[b] = B.asleep;
    const { flavor, slot } = slotOf[b], geo = meshes[flavor].geometry;
    world.skin(b, geo.attributes.position.array, slot * NV * 3);
    computeNormals(geo.attributes.position.array, geo.attributes.normal.array, tpl.surface.indices, NV, slot);
    ranges[flavor][0] = Math.min(ranges[flavor][0], slot); ranges[flavor][1] = Math.max(ranges[flavor][1], slot);
  }
  meshes.forEach((m, f) => {
    const geo = m.geometry;
    geo.setDrawRange(0, perFlavor[f] * TRI * 3);
    m.visible = perFlavor[f] > 0;
    const [a, z] = ranges[f];
    if (z < 0) return;
    for (const name of ['position', 'normal']) { const attr = geo.attributes[name]; attr.clearUpdateRanges(); attr.addUpdateRange(a * NV * 3, (z - a + 1) * NV * 3); attr.needsUpdate = true; }
  });
  // Shadow points: every particle.
  const n = world.count * N, x = world.x;
  for (let i = 0; i < n * 3; i++) shadowPos[i] = x[i];
  shadowGeo.attributes.position.needsUpdate = true;
  shadowGeo.setDrawRange(0, n);
}
// ---------- camera ----------
let cam;
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  cam = frame(w, h, world.arena);
  camera.position.set(...cam.eye); camera.up.set(0, 1, 0); camera.lookAt(...cam.target);
  camera.near = cam.near; camera.far = cam.far; camera.fov = cam.fov; camera.aspect = cam.aspect;
  camera.projectionMatrix.fromArray(projectionMatrix(cam));
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  camera.updateMatrixWorld();
}
addEventListener('resize', resize);
resize();

// ---------- drawing ----------
let frames = 0, ready = false;
function draw() {
  syncMeshes();
  renderer.info.reset();
  renderer.setRenderTarget(shadowRT);
  renderer.setClearColor(0xffffff, 1); renderer.clear();
  renderer.render(shadowScene, shadowCam);
  renderer.setRenderTarget(null);
  renderer.setClearColor(PAPER, 1);
  renderer.render(scene, camera);
  if (++frames >= 3 && !ready) { ready = true; document.documentElement.dataset.ready = '1'; }
}

// ---------- sound: short, cute, synthesised on the spot (no audio files) ----------
// A soft "boop" when a bear lands (louder for a harder landing, pitch by flavour and size), a little upward
// "chirp" when one is picked up, and a springy "boing" with a wobble when a stretched bear is let go.
// Browsers only allow sound after a tap or click, so it starts on the first touch of a bear or a button.
const sound = (() => {
  let ac = null, out = null, on = true, lastAt = 0, live = 0;
  const PITCH = [660, 590, 740, 520, 820];             // cherry, orange, lemon, apple, pineapple
  function start() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ac = new AC(); out = ac.createGain(); out.gain.value = 0.5; out.connect(ac.destination);
  }
  // One voice: a sine (plus a quieter octave) gliding from f0 to f1, with an optional decaying wobble.
  function voice(f0, f1, dur, gain, wobble = 0) {
    if (!on || !ac || ac.state !== 'running' || live > 8) return;
    const t = ac.currentTime + 0.005, g = ac.createGain(), o = ac.createOscillator(), o2 = ac.createOscillator(), g2 = ac.createGain();
    o.type = 'sine'; o2.type = 'triangle';
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
    o2.frequency.setValueAtTime(f0 * 2, t); o2.frequency.exponentialRampToValueAtTime(f1 * 2, t + dur * 0.8);
    if (wobble) {
      const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 16;
      lg.gain.setValueAtTime(f0 * wobble, t); lg.gain.exponentialRampToValueAtTime(1, t + dur);
      lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.02);
    }
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g2.gain.value = 0.18;
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(out);
    o.start(t); o2.start(t); o.stop(t + dur + 0.02); o2.stop(t + dur + 0.02);
    live++; o.onended = () => { live--; };
  }
  const pitchOf = (b) => { const bear = world.bears[b]; const f = bear ? PITCH[bear.flavor] || 640 : 640; const sz = bear && bear.scale ? bear.scale : 1; return f / sz; };
  return {
    start,
    get on() { return on; }, set on(v) { on = v; },
    land(b, speed) {
      const now = performance.now(); if (now - lastAt < 35) return; lastAt = now;   // a pour is a patter, not a roar
      const k = Math.min(1, speed / 14); if (k < 0.08) return;
      const f = pitchOf(b) * (0.94 + 0.12 * Math.random());
      voice(f, f * 0.62, 0.09 + 0.05 * k, 0.05 + 0.25 * k);
    },
    grab(b) { const f = pitchOf(b); voice(f * 0.8, f * 1.25, 0.07, 0.12); },
    release(b, stretch) { if (stretch < 1.12) return; const f = pitchOf(b) / Math.min(1.8, stretch); voice(f * 1.1, f * 0.8, 0.32, 0.22, 0.12); },
  };
})();
let heardTo = 0, grabPeak = 1;   // grabPeak: the most this hold has stretched; by release the stretch has relaxed
function playEvents() {
  if (world.grabState) grabPeak = Math.max(grabPeak, world.stats.stretch);
  for (const e of world.events) if (e.t > heardTo) { if (e.kind === 'land') sound.land(e.bear, e.speed); }
  heardTo = world.time;
}
addEventListener('pointerdown', () => sound.start(), { capture: true });

// ---------- time ----------
let manual = false, last = performance.now(), acc = 0, uiTick = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!manual) {
    acc += dt; let k = 0;
    // At most two physics steps per drawn frame: a slow device runs in slow motion rather than falling behind.
    while (acc >= DT && k < 2) { world.step(); acc -= DT; k++; }
    if (k === 2) acc = Math.min(acc, DT);
    if (k) playEvents();
  }
  draw();
  if (++uiTick % 6 === 0) updateCard();
}

// ---------- pointer: grab, stretch, press, fling ----------
const cursor = $('#cursor');
let drag = null;
const pickAt = (sx, sy) => pickParticle(cam, sx, sy, world.x, world.count * N, world.r * 1.25);
canvas.addEventListener('pointerdown', (e) => {
  if (drag) return;
  const hit = pickAt(e.clientX, e.clientY);
  if (!hit) return;
  e.preventDefault();
  manual = false;
  const bi = Math.floor(hit.particle / N), li = hit.particle % N;
  world.grab(bi, li, hit.point);
  grabPeak = 1; sound.grab(bi);
  drag = { id: e.pointerId, anchor: hit.point };
  canvas.setPointerCapture(e.pointerId);
  setCursor(e, 'grab');
});
canvas.addEventListener('pointermove', (e) => {
  if (drag && e.pointerId === drag.id) { world.moveGrab(screenToPlane(cam, e.clientX, e.clientY, drag.anchor)); setCursor(e, 'grab'); return; }
  if (e.pointerType === 'mouse') setCursor(e, pickAt(e.clientX, e.clientY) ? 'hover' : '');
});
const end = (e) => { if (!drag || e.pointerId !== drag.id) return; if (world.grabState) sound.release(world.grabState.bi, Math.max(grabPeak, world.stats.stretch)); world.release(); drag = null; setCursor(e, e.pointerType === 'mouse' ? 'hover' : 'off'); };
canvas.addEventListener('pointerup', end);
canvas.addEventListener('pointercancel', end);
canvas.addEventListener('pointerleave', (e) => { if (!drag) setCursor(e, 'off'); });
function setCursor(e, state) {
  if (e.pointerType !== 'mouse') { cursor.dataset.state = 'off'; return; }
  cursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
  cursor.dataset.state = state || 'idle';
}

// ---------- the card ----------
const enabled = new Set([0, 1, 2, 3, 4]);
const swatches = $('#swatches');
FLAVORS.forEach((f, i) => {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'swatch'; b.style.setProperty('--c', f.color);
  b.setAttribute('aria-pressed', 'true'); b.setAttribute('aria-label', f.name + ' ' + f.en); b.title = f.name + ' · ' + f.en;
  if (f.clarity) b.classList.add('clear');
  b.addEventListener('click', () => {
    if (enabled.has(i) && enabled.size === 1) return; // at least one flavour stays on
    enabled.has(i) ? enabled.delete(i) : enabled.add(i);
    b.setAttribute('aria-pressed', String(enabled.has(i)));
    $('#flavor-note').textContent = [...enabled].map(k => FLAVORS[k].name).join(' · ');
  });
  swatches.append(b);
});
$('#flavor-note').textContent = FLAVORS.map(f => f.name).join(' · ');
const soft = $('#softness');
soft.value = String(Math.round(world.softness * 100));
soft.addEventListener('input', () => world.setSoftness(Number(soft.value) / 100));
const soundBtn = $('#sound');
function syncSound() { soundBtn.setAttribute('aria-pressed', String(sound.on)); soundBtn.textContent = sound.on ? '声音 开' : '声音 关'; }
soundBtn.addEventListener('click', () => { sound.on = !sound.on; sound.start(); syncSound(); });
syncSound();
$('#pour').addEventListener('click', () => { manual = false; world.pour(POUR, [...enabled]); updateCard(); });
$('#reset').addEventListener('click', () => { manual = false; resetWorld(); });
function resetWorld() { world.release(); drag = null; world.reset(); heardTo = 0; resetSlots(); updateCard(); }
const BODY = 2.1; // nose-to-toe length of a bear in table units, for the bounce reading
function updateCard() {
  const s = world.stats;
  $('#r-stretch').textContent = '×' + s.stretch.toFixed(2);
  $('#r-max').textContent = '×' + s.maxStretch.toFixed(2);
  $('#r-bounce').textContent = Math.round((s.bounce / BODY) * 100) + '%';
  $('#r-count').textContent = `${world.count + world.pending} / ${world.cap}`;
  const full = world.count + world.pending >= world.cap, pour = $('#pour');
  pour.disabled = full; pour.textContent = full ? `已满 ${world.cap} 只` : '再倒一些';
}

// ---------- test hooks ----------
function snapshot() {
  const s = world.snapshot(), info = renderer.info.render;
  s.bears.forEach((b) => { const q = screenBox(cam, b.box); b.screen = { x0: +q.x0.toFixed(1), y0: +q.y0.toFixed(1), x1: +q.x1.toFixed(1), y1: +q.y1.toFixed(1) }; const c = toScreen(project(cam, b.position), cam.width, cam.height); b.centre = [+c.x.toFixed(1), +c.y.toFixed(1)]; });
  return {
    ...s, ready, manual, viewport: [innerWidth, innerHeight], region: cam.region, phoneLayout: cam.phone,
    render: { quality, transmission: HIGH, drawCalls: info.calls, triangles: info.triangles, points: info.points, pixelRatio: renderer.getPixelRatio(), renderer: rendererName(), bearTriangles: TRI, bearVertices: NV },
  };
}
function rendererName() {
  try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch { return 'unknown'; }
}
const drive = () => { manual = true; };
window.__PLAYTEST__ = {
  get ready() { return ready; },
  snapshot,
  reset() { drive(); resetWorld(); draw(); return snapshot(); },
  setSeed(n) { drive(); world.setSeed(Number(n)); resetWorld(); draw(); return snapshot(); },
  step(ms = 1000) { drive(); const n = Math.max(1, Math.round(ms / 1000 / DT)); for (let i = 0; i < n; i++) world.step(); draw(); updateCard(); return snapshot(); },
  // Grab bear `bear` by a named part (head, snout, earL, earR, body, back, armL, armR, legL, legR) and pull
  // it toward the screen point [x, y] (CSS pixels): the point is taken on the plane through the part that
  // faces the camera. Call step() to let it move; grab again to move the hand; release() to let go.
  grab(bear, part = 'head', to) {
    drive();
    const g = world.grabState;
    const li = typeof part === 'number' ? part : (world.partParticle[part] ?? world.partParticle.body);
    const same = g && g.bi === bear && g.li === li;
    const o = (bear * N + li) * 3, here = same ? drag?.anchor || [world.x[o], world.x[o + 1], world.x[o + 2]] : [world.x[o], world.x[o + 1], world.x[o + 2]];
    const target = to ? screenToPlane(cam, to[0], to[1], here) : here;
    if (same) world.moveGrab(target); else { world.grab(bear, li, target); drag = { id: -1, anchor: here }; }
    return snapshot();
  },
  release() { drive(); world.release(); drag = null; return snapshot(); },
  pour(count = POUR) { drive(); const n = world.pour(count, [...enabled]); updateCard(); return { poured: n, ...snapshot() }; },
  setSoftness(v) { world.setSoftness(Number(v)); soft.value = String(Math.round(world.softness * 100)); return snapshot(); },
  // Back to real time (the hooks above freeze the clock so a test sees exactly the steps it asked for).
  resume() { manual = false; return snapshot(); },
  pointScreen(p) { return toScreen(project(cam, p), cam.width, cam.height); },
  // Replay one of the fixed scenes (row, stretch, fling, pile) exactly as the Node tests run them, then draw.
  // A scene that ends holding a bear (stretch) keeps holding it until release().
  scenario(name) {
    drive(); drag = null;
    const { notes } = runOnWorld(world, SCENARIOS[name]);
    if (world.grabState) drag = { id: -1, anchor: null };
    resetSlots(); updateCard(); draw();
    return { notes, ...snapshot() };
  },
};

updateCard();
requestAnimationFrame((t) => { last = t; loop(t); });
