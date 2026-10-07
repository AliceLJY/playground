// 微缩街角·走进去 — rendering, input, sound. Everything that moves is decided in core.js; this file draws it.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HorizontalTiltShiftShader } from 'three/addons/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/addons/shaders/VerticalTiltShiftShader.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as C from './core.js';

const Q = new URLSearchParams(location.search);
const VIEW = C.VIEW_SCRIPTS[Q.get('view')] ? Q.get('view') : null;
const AIM = ['door', 'street', 'roof'].includes(Q.get('aim')) ? Q.get('aim') : null;
const DEBUG = Q.get('debug') === '1';
const CALM = Q.get('calm') === '1';            // 安心版: no figure, no E0/E2-E5, doorbell only
const TILT = Q.get('tilt');                     // test override only: 'off' or 'on'
const COARSE = matchMedia('(pointer: coarse)').matches;
// Tilt-shift runs three's two shaders twice: a fine pair, then a coarse pair 9x wider. The 9-tap kernel alone, spread wide,
// copies thin lines (rain) into a comb of sharp ghosts; the fine pair fills the gaps so the blur is smooth.
// The focus line follows the store front on screen; within ±FOCUS_BAND of it nothing is blurred.
const TILT_K = [0.67, 6.0];                    // tap spacing = K·max(|focus - v| - band, 0) CSS pixels

// ---------------- page ----------------
document.head.insertAdjacentHTML('beforeend', `<style>
html,body{margin:0;height:100%;overflow:hidden;background:${C.COLORS.sky};overscroll-behavior:none;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;-webkit-touch-callout:none}
#c{position:fixed;left:0;top:0;width:100%;height:100%;display:block;touch-action:none;outline:none}
#hint{position:fixed;left:12px;bottom:calc(10px + env(safe-area-inset-bottom));max-width:calc(100% - 24px);font:12px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",system-ui,sans-serif;color:rgba(214,222,234,.75);pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 2px rgba(0,0,0,.7)}
#hint b{color:${C.COLORS.accent};font-weight:600}
#dbg{position:fixed;left:12px;top:10px;font:12px/1.45 ui-monospace,Menlo,monospace;color:${C.COLORS.accent};pointer-events:none;white-space:pre;text-shadow:0 1px 2px #000}
body.noui #hint,body.noui #dbg{display:none}
#dark{position:fixed;inset:0;background:#000;opacity:0;pointer-events:none}
#joy{position:fixed;left:0;top:0;width:${2 * C.PAD.radius}px;height:${2 * C.PAD.radius}px;margin:${-C.PAD.radius}px 0 0 ${-C.PAD.radius}px;border-radius:50%;box-sizing:border-box;border:1.5px solid rgba(214,222,234,.5);background:rgba(214,222,234,.08);pointer-events:none;display:none}
#joy i{position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(214,222,234,.38)}
</style>`);
const canvas = document.createElement('canvas');
canvas.id = 'c';
document.body.prepend(canvas);
const hintEl = document.createElement('div');
hintEl.id = 'hint';
const darkEl = document.body.appendChild(Object.assign(document.createElement('div'), { id: 'dark' }));
const joyEl = document.body.appendChild(Object.assign(document.createElement('div'), { id: 'joy', innerHTML: '<i></i>' })), joyKnob = joyEl.firstChild;
document.body.appendChild(hintEl);
const dbgEl = DEBUG ? document.body.appendChild(Object.assign(document.createElement('div'), { id: 'dbg' })) : null;

// ---------------- renderer, scene ----------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.info.autoReset = false;               // the composer renders several passes; count the whole frame
const scene = new THREE.Scene();
scene.background = new THREE.Color(C.COLORS.sky);
scene.fog = new THREE.FogExp2(C.COLORS.sky, 0);
const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 600);
camera.rotation.order = 'YXZ';

const COL = { ...C.COLORS, ...C.EXTRA_COLORS };
const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
const glow = (c) => new THREE.MeshBasicMaterial({ color: c });
const glassMat = () => new THREE.MeshLambertMaterial({ color: COL.glass, transparent: true, opacity: C.GLASS_OPACITY, depthWrite: false, side: THREE.DoubleSide });
const MATS = {
  sidewalk: lam(COL.sidewalk), stripe: lam(COL.stripe),
  storeWall: lam(COL.storeWall), 'storeWall:upper': lam(COL.storeWall), storeRoof: lam(COL.storeRoof), storeFloor: lam(COL.storeFloor),
  nextWall: lam(COL.nextWall), 'nextWall:upper': lam(COL.nextWall), nextRoof: lam(COL.nextRoof), nextFloor: lam(COL.nextFloor),
  glass: glassMat(), glassTransom: glassMat(), frame: lam(COL.frame), sign: glow(COL.storeLight), sign2: glow(COL.nextLight),
  signText: glow(COL.signText), sign2Text: glow(COL.sign2Text),
  shelf: new THREE.MeshLambertMaterial({ color: COL.shelf, emissive: 0x262b33 }), shelfBoard: lam(COL.shelfBoard), freezerBody: lam(COL.freezerBody), freezer: glow(COL.freezer),
  storeCeiling: new THREE.MeshLambertMaterial({ color: COL.storeCeiling, emissive: 0x30343a }), counter: lam(COL.counter), dark: glow(COL.dark), mat: lam(COL.mat), storeLightPanel: glow(COL.storeLight), nextLightPanel: glow(COL.nextLight),
  bar: lam(COL.bar), stool: lam(COL.stool), shelf2: lam(COL.shelf2), vendBody: lam(COL.vendBody), vending: glow(COL.vending),
  pole: lam(COL.pole), lamp: glow(COL.lamp), bench: lam(COL.bench), fence: lam(COL.fence),
  annex: lam(COL.annex), annexFloor: lam(COL.annexFloor), backGlow: glow(COL.backGlow),
  freezer0: glow(COL.freezer), freezer1: glow(COL.freezer), freezer2: glow(COL.freezer), freezer3: glow(COL.freezer), freezer4: glow(COL.freezer),
};
const boxGeo = (b) => new THREE.BoxGeometry(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0).translate((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
const byMat = {};
for (const b of C.visualBoxes()) (byMat[b.mat] ||= []).push(boxGeo(b));
const MESH = {};
for (const [k, list] of Object.entries(byMat)) {
  if (!MATS[k]) throw new Error('no material for ' + k);
  MESH[k] = new THREE.Mesh(mergeGeometries(list), MATS[k]);
  scene.add(MESH[k]);
}
// base: street-coloured top (the road is the base top itself) and dark sides that hide once you stand inside
const H = C.BASE.half;
const baseTop = new THREE.Mesh(new THREE.PlaneGeometry(2 * H, 2 * H).rotateX(-Math.PI / 2), lam(COL.street));
scene.add(baseTop);
const baseSides = new THREE.Mesh(new THREE.BoxGeometry(2 * H, C.BASE.thick, 2 * H).translate(0, -C.BASE.thick / 2 - 0.002, 0), lam(COL.baseSide));
scene.add(baseSides);
// the 200 x 200 street-coloured ground that fades in after s = 0.5
const bigGround = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2).translate(0, -0.03, 0),
  new THREE.MeshLambertMaterial({ color: COL.street, transparent: true, opacity: 0 }));
bigGround.renderOrder = -1;
scene.add(bigGround);
// floor lines: tiles in the store, planks next door
function gridLines(x0, x1, z0, z1, step, y, color, alongZ = true, alongX = true) {
  const v = [];
  if (alongZ) for (let x = x0 + step; x < x1 - 1e-6; x += step) v.push(x, y, z0, x, y, z1);
  if (alongX) for (let z = z0 + step; z < z1 - 1e-6; z += step) v.push(x0, y, z, x1, y, z);
  const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color }));
}
const G = C.FLOOR_GRID;
const floorGrid = gridLines(G.x0, G.x1, G.z0, G.z1, G.step, G.y, COL.storeGrid);
scene.add(floorGrid);
const ceilingGrid = gridLines(G.x0, G.x1, G.z0, G.z1, G.step, C.STORE.h - 0.215, COL.ceilingGrid);   // suspended-ceiling grid
scene.add(ceilingGrid);
scene.add(gridLines(C.NEXT.x0 + C.WALL_T, C.NEXT.x1 - C.WALL_T, C.NEXT.z0 + C.WALL_T, C.NEXT.z1 - C.WALL_T, 0.32, G.y, '#4A3B30', false, true));
// sliding door leaves: glass with a dark frame
const leafFrame = (w, h) => mergeGeometries([[w, 0.05, 0, h / 2 - 0.025], [w, 0.05, 0, -h / 2 + 0.025], [0.035, h, -w / 2 + 0.0175, 0], [0.035, h, w / 2 - 0.0175, 0]]
  .map(([bw, bh, x, y]) => new THREE.BoxGeometry(bw, bh, 0.05).translate(x, y, 0)));
const leaves = C.doorLeaves(C.newDoors()).map((lf) => {
  const w = lf.x1 - lf.x0, h = lf.y1 - lf.y0, g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(w - 0.04, h - 0.05, 0.02), MATS.glass));
  g.add(new THREE.Mesh(leafFrame(w, h), MATS.frame));
  scene.add(g);
  return g;
});
// lights: a dim night, warm shop interiors, one street lamp
// The hemisphere light is set so flat ground reads close to its palette value (the palette is already a night palette).
scene.add(new THREE.HemisphereLight(0xb8c6e2, 0x2a3242, 2.7));
const moon = new THREE.DirectionalLight(0xa8bddc, 0.55);
moon.position.set(-10, 22, 14);
scene.add(moon);
const storeLamps = [];
for (const [x, z] of [[0.6, -4.4], [5.6, -2.6]]) {           // two ceiling-height lamps light the store evenly
  const l = new THREE.PointLight(COL.storeLight, 5.5, 13, 1.15);
  storeLamps.push(l);
  l.position.set(x, 2.7, z);
  scene.add(l);
}
const nextLamp = new THREE.PointLight(COL.nextLight, 4.5, 9, 1.15);
nextLamp.position.set(-6, 2.6, -3.4);
scene.add(nextLamp);
const streetLamp = new THREE.PointLight(COL.lamp, 9, 14, 1.3);
streetLamp.position.set(C.LAMP.x, C.LAMP.top - 0.45, C.LAMP.z + 0.3);
scene.add(streetLamp);
// what hides while you rise out of a building
// ---------------- the scare version: figure, staff door, what dims with the shop lights ----------------
const figMat = new THREE.MeshBasicMaterial({ color: C.HORROR.figure.color });
function makeFigure() {                             // faceless silhouette: capsule body (a little flattened front to back), round head
  const f = C.HORROR.figure, g = new THREE.Group(), top = f.h - 2 * f.headR - 0.01;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(f.bodyR, top - 2 * f.bodyR, 6, 16), figMat);
  body.position.y = top / 2; body.scale.z = 0.72;
  const head = new THREE.Mesh(new THREE.SphereGeometry(f.headR, 18, 12), figMat);
  head.position.y = top + 0.01 + f.headR;
  g.add(body, head); g.visible = false; scene.add(g);
  return g;
}
const figPersist = makeFigure(), figScare = makeFigure();
let figureHidden = false;                           // test hook: render the same frame without the figure
const placeFigure = (g, spot) => { const p = C.HORROR.spots[spot]; g.position.set(p.x, C.SIDEWALK_H, p.z); g.rotation.y = p.yaw; };
const leafPivot = new THREE.Group();
leafPivot.position.set(C.BACKDOOR.hx, C.SIDEWALK_H, C.BACKDOOR.hz);
const leafMat = lam(COL.shelf);
leafPivot.add(new THREE.Mesh(new THREE.BoxGeometry(C.BACKDOOR.w, C.BACKDOOR.h, 0.04).translate(C.BACKDOOR.w / 2, C.BACKDOOR.h / 2, 0), leafMat));
scene.add(leafPivot);
// The shop's own light: lamps, every glow inside, and the inside-only surfaces follow it (E0 and E5 blackouts).
const DIM_COLOR = ['storeFloor', 'shelf', 'shelfBoard', 'freezerBody', 'counter', 'mat', 'storeLightPanel', 'sign', 'backGlow'].map((k) => MATS[k]).concat([leafMat, floorGrid.material, ceilingGrid.material]);
const DIM_EMISSIVE = [MATS.storeCeiling, MATS.shelf];
const baseColor = new Map(DIM_COLOR.concat(Object.keys(MATS).filter((k) => /^freezer\d$/.test(k)).map((k) => MATS[k])).map((m) => [m, m.color.clone()]));
const baseEmissive = new Map(DIM_EMISSIVE.map((m) => [m, m.emissive.clone()]));
const LIFT = { store: ['storeRoof', 'storeCeiling', 'storeWall:upper', 'glassTransom', 'sign', 'signText', 'storeLightPanel'], next: ['nextRoof', 'nextWall:upper', 'sign2', 'sign2Text', 'nextLightPanel'] };
const ROOM_LIFT = { store: ['storeRoof', 'storeCeiling', 'storeLightPanel'], next: ['nextRoof', 'nextLightPanel'] };   // the room view: roof and ceiling off, walls and the back room's roof stay

// ---------------- rain: one LineSegments, positions computed on the GPU from a fixed seed ----------------
const N_RAIN = 2400;
const rainGeo = new THREE.BufferGeometry();
{
  const seed = new Float32Array(N_RAIN * 8), endp = new Float32Array(N_RAIN * 2), rnd = C.rng(20261007);
  for (let i = 0; i < N_RAIN; i++) {
    const s = [rnd(), rnd(), rnd(), rnd()];
    for (let j = 0; j < 2; j++) { seed.set(s, (2 * i + j) * 4); endp[2 * i + j] = j; }
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N_RAIN * 6), 3));
  rainGeo.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
  rainGeo.setAttribute('endp', new THREE.BufferAttribute(endp, 1));
}
const fp = (b) => new THREE.Vector4(b.x0, b.z0, b.x1, b.z1);
const rainMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: {
    uTime: { value: 0 }, uMix: { value: 0 }, uCam: { value: new THREE.Vector3() }, uLen: { value: 0.35 },
    uA: { value: fp(C.STORE) }, uB: { value: fp(C.NEXT) }, uC: { value: fp(C.ANNEX) }, uTops: { value: new THREE.Vector3(C.STORE.h, C.NEXT.h, C.ANNEX.h) },
    uColor: { value: new THREE.Color(C.COLORS.rain) }, uOpacity: { value: C.RAIN_OPACITY }, uH: { value: 9.5 }, uShown: { value: 1 },
  },
  vertexShader: /* glsl */`
    uniform float uTime, uMix, uLen, uH, uShown; uniform vec3 uCam; uniform vec4 uA, uB, uC; uniform vec3 uTops;
    attribute vec4 seed; attribute float endp;
    bool inside(vec3 p) {
      return (p.x > uA.x && p.x < uA.z && p.z > uA.y && p.z < uA.w && p.y < uTops.x + 0.05)
          || (p.x > uB.x && p.x < uB.z && p.z > uB.y && p.z < uB.w && p.y < uTops.y + 0.05)
          || (p.x > uC.x && p.x < uC.z && p.z > uC.y && p.z < uC.w && p.y < uTops.z + 0.05);   // no rain in the back room
    }
    void main() {
      if (fract((seed.x + seed.y) * 43.758) > uShown) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }   // fewer streaks outside
      float speed = 7.5 * (0.85 + 0.3 * seed.w);
      float y01 = fract(seed.z - uTime * speed / 9.5);   // fixed cycle, so changing the height never makes streaks jump
      vec3 inBox = vec3(-13.0 + 26.0 * seed.x, 0.2 + y01 * uH, -13.0 + 26.0 * seed.y);
      float a = seed.x * 6.2831853, r = 0.6 + 11.4 * sqrt(seed.y);
      vec3 round = vec3(uCam.x + r * cos(a), uCam.y - 3.0 + y01 * uH, uCam.z + r * sin(a));
      vec3 head = mix(inBox, round, uMix), tail = head - vec3(0.0, uLen, 0.0);
      if (inside(head) || inside(tail)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
      gl_Position = projectionMatrix * viewMatrix * vec4(endp < 0.5 ? head : tail, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 uColor; uniform float uOpacity;
    void main() { gl_FragColor = vec4(uColor, uOpacity); }`,
});
const rain = new THREE.LineSegments(rainGeo, rainMat);
rain.frustumCulled = false;
rain.renderOrder = 2;
scene.add(rain);

// ---------------- debug: solid boxes ----------------
let dbgStatic = null, dbgDoors = [];
if (DEBUG) {
  const edges = (b) => new THREE.EdgesGeometry(boxGeo(b));
  const all = C.solids();
  dbgStatic = new THREE.LineSegments(mergeGeometries(all.filter((s) => s.kind !== 'door').map(edges)), new THREE.LineBasicMaterial({ color: 0xff5a5a }));
  scene.add(dbgStatic);
  dbgDoors = all.filter((s) => s.kind === 'door').map((s) => { const l = new THREE.LineSegments(edges(s), new THREE.LineBasicMaterial({ color: 0xffd23a })); scene.add(l); return l; });
}

// ---------------- post: tilt-shift (three's own shaders) ----------------
// Only the scene render is multisampled; the blur passes run on the composer's plain buffers (MSAA on every pass cost
// a quarter of the frame rate at pixel ratio 2).
class MsaaRenderPass extends RenderPass {
  constructor(sc, cam) { super(sc, cam); this.msaa = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }); this.copy = new ShaderPass(CopyShader); }
  setSize(w, h) { this.msaa.setSize(w, h); }
  render(renderer, writeBuffer, readBuffer, dt, mask) { super.render(renderer, writeBuffer, this.msaa, dt, mask); this.copy.render(renderer, readBuffer, this.msaa); }
}
const composer = new EffectComposer(renderer);
composer.addPass(new MsaaRenderPass(scene, camera));
// three's shader with one change: the blur weight is measured from the edge of the clear band instead of from the focus line.
function banded(shader) {
  const fs = shader.fragmentShader.replace('uniform float r;', 'uniform float r;\n\t\tuniform float band;').replace('abs( r - vUv.y )', 'max( abs( r - vUv.y ) - band, 0.0 )');
  if (!fs.includes('uniform float band;') || !fs.includes('- band, 0.0 )')) throw new Error('tilt-shift shader changed upstream: ' + shader.name);
  return { ...shader, name: shader.name + 'Banded', uniforms: { ...shader.uniforms, band: { value: C.FOCUS_BAND } }, fragmentShader: fs };
}
const tiltPasses = TILT_K.map((k) => [new ShaderPass(banded(HorizontalTiltShiftShader)), new ShaderPass(banded(VerticalTiltShiftShader)), k]);
for (const [h, v] of tiltPasses) { composer.addPass(h); composer.addPass(v); }
composer.addPass(new OutputPass());

// ---------------- simulation ----------------
const sim = C.createSim({ aspect: innerWidth / Math.max(1, innerHeight), calm: CALM });
let cssW = 1, cssH = 1;
function resize() {
  cssW = Math.max(1, innerWidth); cssH = Math.max(1, innerHeight);
  const pr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pr); renderer.setSize(cssW, cssH, false);
  composer.setPixelRatio(pr); composer.setSize(cssW, cssH);
  camera.aspect = cssW / cssH;
  sim.setAspect(cssW / cssH);
  if (typeof pad !== 'undefined') pad.resize(cssW, cssH);
}
addEventListener('resize', resize);

// ---------------- sound: WebAudio rain, only after the first touch or key ----------------
let audio = null, vibePlayed = 0;
function startAudio() {
  if (audio) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) { audio = { state: 'unsupported' }; return; }
    const ctx = new Ctx(), len = Math.floor(ctx.sampleRate * 2), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0), rnd = C.rng(7);
    let b = 0;
    for (let i = 0; i < len; i++) { const w = rnd() * 2 - 1; b = 0.86 * b + 0.14 * w; d[i] = 0.6 * w + 0.9 * b; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 0.4;
    const g = ctx.createGain(); g.gain.value = 0;
    // master bus with a limiter, so the bang at 4x the bed never clips
    const master = ctx.createGain(); master.gain.value = 0.4;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -8; comp.knee.value = 4; comp.ratio.value = 10; comp.attack.value = 0.003; comp.release.value = 0.25;
    master.connect(comp); comp.connect(ctx.destination);
    src.connect(lp); lp.connect(g); g.connect(master); src.start();
    // fluorescent hum (120 Hz with an octave) and the freezer compressor drone (sawtooth 58 Hz, lowpassed)
    const fluor = ctx.createGain(); fluor.gain.value = 0; fluor.connect(master);
    for (const [f, a] of [[120, 1], [240, 0.4], [360, 0.15]]) { const o = ctx.createOscillator(); o.frequency.value = f; const og = ctx.createGain(); og.gain.value = a; o.connect(og); og.connect(fluor); o.start(); }
    const freezer = ctx.createGain(); freezer.gain.value = 0; freezer.connect(master);
    const fo = ctx.createOscillator(); fo.type = 'sawtooth'; fo.frequency.value = 58; const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 220; fo.connect(fl); fl.connect(freezer); fo.start();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    audio = { ctx, lp, g, master, fluor, freezer, noise: buf, log: [], played: sim.S.t };
  } catch (e) { audio = { state: 'failed: ' + e.message }; }
}

// One-off sounds, all synthesised. Peaks come from core.audioLevels: bell about 2x the bed, bang about 4x.
function playSound(kind, lv) {
  const { ctx, master } = audio, t = ctx.currentTime, env = (peak, attack, decay) => { const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay); g.connect(master); return g; };
  const osc = (type, f, dest, start = t, stop = t + 1.5) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.connect(dest); o.start(start); o.stop(stop); return o; };
  if (kind === 'bell') {                           // a plain two-tone chime: high then low, a major third apart
    for (const [f, dt] of [[659.25, 0], [523.25, 0.42]]) {
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t + dt); g.gain.linearRampToValueAtTime(lv.bell, t + dt + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.95); g.connect(master);
      osc('sine', f, g, t + dt, t + dt + 1.0); const h = ctx.createGain(); h.gain.value = 0.25; h.connect(g); osc('sine', f * 2, h, t + dt, t + dt + 1.0);
    }
    audio.log.push({ kind, at: t, peak: lv.bell, base: lv.base });
  } else if (kind === 'slam') {                    // low thump falling 110 -> 38 Hz plus a short lowpassed noise burst
    const g = env(lv.slam, 0.004, 0.45), o = osc('sine', 110, g, t, t + 0.6); o.frequency.exponentialRampToValueAtTime(38, t + 0.3);
    const n = ctx.createBufferSource(); n.buffer = audio.noise; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1200;
    n.connect(f); f.connect(env(lv.slam * 0.6, 0.002, 0.3)); n.start(t, Math.random() * 1.5, 0.4);
    audio.log.push({ kind, at: t, peak: lv.slam, base: lv.base });
  } else if (kind === 'sting') {                   // one dissonant high cluster (a minor second), under 0.6 s
    const g = env(lv.sting, 0.006, 0.5), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 700; hp.connect(g);
    osc('sawtooth', 1396.9, hp, t, t + 0.56); osc('sawtooth', 1479.98, hp, t, t + 0.56);
    audio.log.push({ kind, at: t, peak: lv.sting, base: lv.base, length: 0.506 });
  }
}

// ---------------- draw the simulation ----------------
const hints = {
  outside: COARSE ? '单指拖动转 · <b>双指张开</b>放大，走进去' : '拖动旋转 · <b>滚轮往前</b>放大，走进去',
  inside: COARSE ? '<b>左边摇杆</b>走 · 右边拖动转头 · <b>捏合</b>看整间店' : '<b>W A S D</b> 走，Shift 跑 · <b>点地面</b>走过去 · 拖动转头 · <b>滚轮往后</b>看整间店 · Esc 出来',
  street: COARSE ? '<b>左边摇杆</b>走 · 右边拖动转头 · <b>捏合</b>出来' : '<b>W A S D</b> 走，Shift 跑 · <b>点地面</b>走过去 · 拖动转头 · <b>滚轮往后</b>或 Esc 出来',
  room: COARSE ? '拖动绕着转 · <b>张开</b>落回去 · <b>捏合</b>回到外面' : '拖动绕着转 · <b>滚轮往前</b>落回光标处 · <b>滚轮往后</b>回到外面 · Esc 出来',
};
function setAlpha(k, a) {                           // fade one lifted part (glass keeps its own opacity)
  const m = MESH[k], mat = m.material;
  m.visible = a > 0.01;
  if (k === 'glassTransom') { mat.opacity = C.GLASS_OPACITY * a; return; }
  const tr = a < 0.999;
  if (mat.transparent !== tr) { mat.transparent = tr; mat.depthWrite = !tr; mat.needsUpdate = true; }
  mat.opacity = a;
}
let hintNow = null, focusY = 0.5;
function sync() {
  const S = sim.S, L = sim.looksNow(), c = S.cam;
  camera.position.set(c.x, c.y, c.z);
  camera.rotation.set(c.pitch, c.yaw, 0, 'YXZ');
  camera.fov = L.fov;
  camera.near = C.clamp((c.y - C.groundAt(c.x, c.z)) * 0.02, 0.05, 2.5);
  camera.far = Math.max(400, S.orbit.r * 3);
  camera.aspect = cssW / cssH;
  camera.updateProjectionMatrix();
  scene.fog.density = L.fog;
  const t = TILT === 'off' ? 0 : TILT === 'on' ? 1 : L.tilt;
  focusY = C.focusLine(c, L.fov, cssW / cssH);
  for (const [ph, pv, k] of tiltPasses) {
    ph.enabled = pv.enabled = t > 0.001;
    ph.uniforms.h.value = (t * k) / cssW; pv.uniforms.v.value = (t * k) / cssH;
    ph.uniforms.r.value = pv.uniforms.r.value = 1 - focusY;          // shader v runs bottom-up
  }
  rainMat.uniforms.uTime.value = S.rainT; rainMat.uniforms.uMix.value = L.rainMix;
  rainMat.uniforms.uOpacity.value = L.rainOpacity; rainMat.uniforms.uH.value = L.rainHeight; rainMat.uniforms.uShown.value = L.rainShown;
  rainMat.uniforms.uCam.value.copy(camera.position); rainMat.uniforms.uLen.value = C.lerp(0.35, 0.55, L.rainMix);
  bigGround.visible = L.groundAlpha > 0.001; bigGround.material.opacity = L.groundAlpha;
  baseSides.visible = L.baseSides;
  C.doorLeaves(S.doors).forEach((lf, i) => leaves[i].position.set((lf.x0 + lf.x1) / 2, (lf.y0 + lf.y1) / 2, (lf.z0 + lf.z1) / 2));
  const RF = sim.roofs();
  for (const b of C.BUILDINGS) {
    const { a, parts } = RF[b.id], on = parts === 'room' ? ROOM_LIFT[b.id] : LIFT[b.id];
    if (b.id === 'store') ceilingGrid.visible = a > 0.5;
    for (const k of LIFT[b.id]) setAlpha(k, on.includes(k) ? a : 1);
  }
  if (dbgDoors.length) dbgDoors.forEach((l, i) => { l.visible = S.doors[i].k < C.DOOR_PASS; });
  // scare version: what the state machine says this instant
  const V = sim.levels();
  figPersist.visible = !figureHidden && !!V.figure; if (V.figure) placeFigure(figPersist, V.figure);
  figScare.visible = !figureHidden && V.scare; if (V.scare) placeFigure(figScare, 'backroom');
  leafPivot.rotation.y = -V.back;
  for (const l of storeLamps) l.intensity = 5.5 * V.light;
  for (const m of DIM_COLOR) m.color.copy(baseColor.get(m)).multiplyScalar(V.light);
  for (const m of DIM_EMISSIVE) m.emissive.copy(baseEmissive.get(m)).multiplyScalar(V.light);
  for (let i = 0; i < 5; i++) { const m = MATS['freezer' + i]; m.color.copy(baseColor.get(m)).multiplyScalar(V.freezer[i]); }
  camera.position.x += V.shake[0]; camera.position.y += V.shake[1]; camera.position.z += V.shake[2];   // the picture shakes, the walker does not
  darkEl.style.opacity = String(0.55 * V.darken);
  for (const v of S.h.vibes) if (v.t > vibePlayed && v.t <= S.t) { try { if (typeof navigator.vibrate === 'function') navigator.vibrate(v.pattern); } catch { /* not allowed here */ } }
  vibePlayed = Math.max(vibePlayed, S.t);
  if (audio && audio.ctx) {
    const now = audio.ctx.currentTime;
    audio.lp.frequency.setTargetAtTime(L.lowpass, now, 0.08); audio.g.gain.setTargetAtTime(L.volume, now, 0.08);
    audio.fluor.gain.setTargetAtTime(V.audio.fluor, now, 0.015); audio.freezer.gain.setTargetAtTime(V.audio.freezer, now, 0.015);
    for (const ev of S.h.sounds) if (ev.t > audio.played && ev.t <= S.t) playSound(ev.kind, V.audio);
    audio.played = Math.max(audio.played, S.t);
  }
  const j = pad.joy;                                // the floating joystick under the left thumb
  joyEl.style.display = j ? 'block' : 'none';
  if (j) {
    const dx = j.x - j.x0, dy = j.y - j.y0, d = Math.hypot(dx, dy), k = d > C.PAD.radius ? C.PAD.radius / d : 1;
    joyEl.style.left = j.x0 + 'px'; joyEl.style.top = j.y0 + 'px'; joyKnob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
  }
  const h = hints[sim.snapshot().level] || '';
  if (h !== hintNow) { hintEl.innerHTML = h; hintNow = h; }
}

// ---------------- input: Pointer Events for mouse and touch ----------------
const pad = C.createTouchPad(sim, { width: innerWidth, height: innerHeight });
let mouse = null;                                   // mouse: drag turns / rotates, a click walks or lands (round-3 sensitivity)
const isMouse = (e) => e.pointerType === 'mouse';
canvas.addEventListener('pointerdown', (e) => {
  startAudio();
  try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointers may not be capturable */ }
  if (isMouse(e)) { mouse = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), live: false }; return; }
  pad.down(e.pointerId, e.clientX, e.clientY, performance.now());
});
canvas.addEventListener('pointermove', (e) => {
  if (!isMouse(e)) { pad.move(e.pointerId, e.clientX, e.clientY); return; }
  if (!mouse) return;
  const dx = e.clientX - mouse.x, dy = e.clientY - mouse.y;
  mouse.x = e.clientX; mouse.y = e.clientY;
  if (!mouse.live && Math.hypot(e.clientX - mouse.x0, e.clientY - mouse.y0) >= C.PAD.tapPx) mouse.live = true;
  if (!mouse.live) return;
  if (sim.S.mode === 'orbit') sim.rotate(-dx * C.ROT_MOUSE, -dy * C.ROT_MOUSE);
  else if (sim.S.mode === 'walk') sim.lookBy(dx * C.LOOK_MOUSE, dy * C.LOOK_MOUSE);
  else if (sim.S.mode === 'room') sim.roomRotate(-dx * C.ROT_MOUSE, -dy * C.ROT_MOUSE);
});
const pointerEnd = (e) => {
  if (!isMouse(e)) { pad.up(e.pointerId, e.clientX, e.clientY, performance.now(), e.type === 'pointercancel'); return; }
  if (mouse && !mouse.live && e.type === 'pointerup' && performance.now() - mouse.t0 < C.PAD.tapMs) sim.tapAt(e.clientX / cssW, e.clientY / cssH);
  mouse = null;
};
canvas.addEventListener('pointerup', pointerEnd);
canvas.addEventListener('pointercancel', pointerEnd);
// Wheel: outside it zooms; inside, one notch back = one level out, forward in the room view = land under the cursor.
// A level change needs a fresh notch: after one, the wheel is ignored until it has been still for 250 ms.
let wheelLast = 0, wheelArmed = true;
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY, now = performance.now(), mode = sim.S.mode;
  if (now - wheelLast > 250) wheelArmed = true;
  wheelLast = now;
  if (mode === 'orbit') { sim.zoomAt(Math.exp(C.clamp(dy, -240, 240) * 0.0012), e.clientX / cssW, e.clientY / cssH); return; }
  if (!wheelArmed || (mode !== 'walk' && mode !== 'room')) return;
  if (dy > 2 && sim.back()) wheelArmed = false;
  else if (dy < -2 && mode === 'room' && sim.landAt(e.clientX / cssW, e.clientY / cssH)) wheelArmed = false;
}, { passive: false });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
const keys = {};
let keyDriving = false;
addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  startAudio();
  keys[e.code] = true;
  if (e.code === 'Escape') sim.escape();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k of Object.keys(keys)) keys[k] = false; });
function applyKeys() {
  if (sim.S.mode !== 'walk') return;
  const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const s = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  if (!f && !s) { if (keyDriving) { sim.drive(0, 0); keyDriving = false; } return; }
  const yaw = sim.S.player.yaw, sp = keys.ShiftLeft || keys.ShiftRight ? C.RUN_SPEED : C.WALK_SPEED, n = Math.hypot(f, s);
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  sim.drive(((fx * f + rx * s) / n) * sp, ((fz * f + rz * s) / n) * sp);
  keyDriving = true;
}

// ---------------- loop, hooks ----------------
const v3 = new THREE.Vector3();
function screenBoxOf(points) {
  camera.updateMatrixWorld();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of points) { v3.set(p[0], p[1], p[2]).project(camera); const x = (v3.x + 1) / 2, y = (1 - v3.y) / 2; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}
const gl = renderer.getContext();
const gpu = (() => { try { const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch { return 'unknown'; } })();
const frameTimes = [];
let lastCalls = 0, lastTris = 0;
window.__diorama = {
  ready: false,
  state: () => sim.snapshot(),
  enter: (aim) => { const ok = sim.enter(aim); sync(); return ok; },
  exit: () => { const ok = sim.exit(); sync(); return ok; },
  back: () => { const ok = sim.back(); sync(); return ok; },
  escape: () => { const ok = sim.escape(); sync(); return ok; },
  landAt: (sx, sy) => { const ok = sim.landAt(sx, sy); sync(); return ok; },
  groundPoint: (sx, sy) => sim.groundPoint(sx, sy),
  roomRotate: (a, b) => { sim.roomRotate(a, b); sync(); },
  roofs: () => sim.roofs(),
  pad: () => { sync(); return { joy: pad.joy, pinching: pad.pinching, joyShown: joyEl.style.display === 'block', joyAt: [parseFloat(joyEl.style.left) || 0, parseFloat(joyEl.style.top) || 0], hint: hintEl.textContent }; },
  walkTo: (x, z) => sim.walkTo(x, z),
  step: (dt = 1 / 60, n = 1) => { sim.S.auto = false; for (let i = 0; i < n; i++) sim.update(dt); sync(); return sim.snapshot(); },
  solids: () => C.solids(sim.S.doors, sim.levels().back),   // the staff door where it really is
  screenBox: () => { sync(); return { ...screenBoxOf(C.SCREEN_POINTS.base), model: screenBoxOf(C.SCREEN_POINTS.model) }; },
  // extra hooks used by tools/browser-check.cjs
  walkRoute: (p) => sim.walkRoute(p),
  zoomAt: (f, sx, sy) => { const r = sim.zoomAt(f, sx, sy); sync(); return r; },
  rotate: (a, b) => { sim.rotate(a, b); sync(); },
  place: (x, z, yaw) => { const r = sim.place(x, z, yaw); sync(); return r; },
  drive: (vx, vz) => sim.drive(vx, vz),
  lookAt: (x, y, z) => sim.lookAt(x, y, z),
  auto: (on) => { sim.S.auto = !!on; },
  ui: (on) => { document.body.classList.toggle('noui', !on); },
  toScreen: (x, y, z) => { sync(); camera.updateMatrixWorld(); v3.set(x, y, z).project(camera); return [((v3.x + 1) / 2) * cssW, ((1 - v3.y) / 2) * cssH]; },
  info: () => {
    const n = frameTimes.length, span = n > 1 ? (frameTimes[n - 1] - frameTimes[0]) / 1000 : 0;
    return { calls: lastCalls, triangles: lastTris, dpr: renderer.getPixelRatio(), deviceDpr: window.devicePixelRatio, buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
      css: [cssW, cssH], gpu, fps: span > 0 ? (n - 1) / span : 0,
      // what is actually drawn for the scare version: shop light and glow relative to normal, the figures, the staff door, the dark overlay
      shop: { lamp: storeLamps[0].intensity / 5.5, glow: MATS.storeCeiling.emissive.r / baseEmissive.get(MATS.storeCeiling).r,
        freezers: [0, 1, 2, 3, 4].map((i) => MATS['freezer' + i].color.r / baseColor.get(MATS['freezer' + i]).r) },
      figures: { counterOrWindow: figPersist.visible, backroom: figScare.visible, color: '#' + figMat.color.getHexString() }, leaf: -leafPivot.rotation.y, darkOverlay: Number(darkEl.style.opacity || 0),
      camera: [camera.position.x, camera.position.y, camera.position.z],   // drawn camera (the simulation's plus any shake)
      drawnRoofs: { ...Object.fromEntries(['storeRoof', 'storeCeiling', 'storeLightPanel', 'nextRoof', 'nextLightPanel', 'annex', 'storeWall'].map((k) => [k, MESH[k].visible ? MESH[k].material.opacity : 0])), ceilingGrid: ceilingGrid.visible ? 1 : 0 },
      audio: audio ? (audio.ctx ? audio.ctx.state : audio.state) : 'not started', tiltOn: tiltPasses[0][0].enabled, focusY, fov: camera.fov, hfov: C.hfov(camera.fov, cssW / cssH), rainSegments: N_RAIN };
  },
  core: C,
  horror: () => { const h = sim.horror(); return { ...h, figure: h.figure }; },
  trigger: (name) => { const ok = sim.trigger(name); sync(); return ok; },
  levels: () => sim.levels(),
  audioLog: () => (audio && audio.log ? audio.log.slice() : null),
  hideFigure: (on) => { figureHidden = !!on; sync(); },
  figureMask: (on) => { figMat.color.set(on ? '#ffffff' : C.HORROR.figure.color); sync(); },   // paint the figure white to find its pixels
  // Can the camera see these points? Frustum, then a ray against every opaque mesh (glass, rain, lines and the figures skipped).
  visibility: (pts) => {
    sync(); camera.updateMatrixWorld();
    const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const opaque = []; scene.traverse((o) => { if (o.isMesh && o.visible && !(o.material.transparent) && !o.parent?.isGroup || (o.isMesh && o.parent === leafPivot)) opaque.push(o); });
    const solid = opaque.filter((o) => !figPersist.children.includes(o) && !figScare.children.includes(o) && o !== bigGround);
    const rc = new THREE.Raycaster(), from = camera.position.clone();
    return pts.map((p) => { const q = new THREE.Vector3(...p), dist = from.distanceTo(q); rc.set(from, q.clone().sub(from).normalize()); rc.far = dist - 0.05;
      const hit = rc.intersectObjects(solid, false)[0]; return { inFrustum: fr.containsPoint(q), blockedBy: hit ? (Object.entries(MESH).find(([, m]) => m === hit.object) || ['other'])[0] : null }; });
  },
};

resize();
if (VIEW) { C.runView(sim, VIEW, VIEW === 'mid' ? AIM : null); sim.S.auto = false; }
sync();
let last = performance.now(), frames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  if (sim.S.auto) { applyKeys(); sim.update(dt); }
  sync();
  renderer.info.reset();
  composer.render(dt);
  lastCalls = renderer.info.render.calls; lastTris = renderer.info.render.triangles;
  frameTimes.push(now);
  while (frameTimes.length > 2 && now - frameTimes[0] > 2000) frameTimes.shift();
  if (dbgEl) { const S = sim.S; dbgEl.textContent = `s ${S.s.toFixed(3)}  z ${S.z.toFixed(3)}  ${S.mode}\ndoors ${S.doors.map((d) => d.k.toFixed(2)).join(' ')}\ncalls ${lastCalls}  fps ${window.__diorama.info().fps.toFixed(0)}`; }
  if (++frames === 2) window.__diorama.ready = true;
}
requestAnimationFrame(frame);
