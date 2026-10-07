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
#joyHint{position:fixed;left:0;top:0;width:${2 * C.PAD.radius}px;height:${2 * C.PAD.radius}px;margin:${-C.PAD.radius}px 0 0 ${-C.PAD.radius}px;border-radius:50%;box-sizing:border-box;border:2px solid rgb(214,222,234);box-shadow:0 0 0 1.5px rgba(16,20,28,.9),inset 0 0 0 1.5px rgba(16,20,28,.9);background:rgba(214,222,234,.12);opacity:.25;pointer-events:none;display:none}
</style>`);
const canvas = document.createElement('canvas');
canvas.id = 'c';
document.body.prepend(canvas);
const hintEl = document.createElement('div');
hintEl.id = 'hint';
const darkEl = document.body.appendChild(Object.assign(document.createElement('div'), { id: 'dark' }));
const joyEl = document.body.appendChild(Object.assign(document.createElement('div'), { id: 'joy', innerHTML: '<i></i>' })), joyKnob = joyEl.firstChild;
const joyHintEl = document.body.appendChild(Object.assign(document.createElement('div'), { id: 'joyHint' }));   // where the joystick is, before it is pressed
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
// Round 8: inside the grocery the sky light (hemisphere) and the moon reach only ~30% (SPEC 环境光压到约 30%); the bulbs and
// the tube make the light. Done per material by scaling those two lights in three's lighting chunk.
const INSIDE_AMBIENT = { value: 0.3 };
function inside(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uAmb = INSIDE_AMBIENT;
    const chunk = THREE.ShaderChunk.lights_fragment_begin
      .replace('irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );', 'irradiance += uAmb * getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );')
      .replace('getSunLightInfo( sunLight, directLight );', 'getSunLightInfo( sunLight, directLight ); directLight.color *= uAmb;');
    if (!chunk.includes('uAmb * getHemisphere') || !chunk.includes('directLight.color *= uAmb')) throw new Error('lighting chunk changed upstream');
    sh.fragmentShader = 'uniform float uAmb;\n' + sh.fragmentShader.replace('#include <lights_fragment_begin>', chunk);
  };
  mat.customProgramCacheKey = () => 'inside-ambient';
  return mat;
}
const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
const lamIn = (c) => inside(lam(c));
const glow = (c) => new THREE.MeshBasicMaterial({ color: c });
const glassMat = () => new THREE.MeshLambertMaterial({ color: COL.glass, transparent: true, opacity: C.GLASS_OPACITY, depthWrite: false, side: THREE.DoubleSide });
const MATS = {
  sidewalk: lam(COL.sidewalk), stripe: lam(COL.stripe),
  storeWall: lamIn(COL.storeWall), storeRoof: lam(COL.storeRoof), storeFloor: lamIn(COL.storeFloor), storeFacade: lam(COL.storeFacade), 'storeFacade:upper': lam(COL.storeFacade),
  nextWall: lamIn(COL.nextWall), 'nextWall:upper': lamIn(COL.nextWall), nextRoof: lam(COL.nextRoof), nextFloor: lamIn(COL.nextFloor),
  glass: glassMat(), windowGlass: new THREE.MeshLambertMaterial({ color: COL.windowGlass, transparent: true, opacity: C.WINDOW.opacity, depthWrite: false, side: THREE.FrontSide }),   // one face toward the camera: the pane is 0.35 once, not twice
  frame: lam(COL.frame), sign: lam(COL.oldSign), sign2: lam(COL.nextDark), signText: lam(COL.oldSignText), sign2Text: lam(COL.sign2Text), awning: lam(COL.awning),
  shelf: lamIn(COL.shelf), shelfBoard: lamIn(COL.shelfBoard), goods: lamIn(COL.goods), goods2: lamIn(COL.goods2), goods3: lamIn(COL.goods3),
  freezerBody: lamIn(COL.chest), chestLid: lamIn(COL.chestLid), counter: lamIn(COL.counter), tvBody: lamIn(COL.tvBody), register: lamIn(COL.register),
  box: lamIn(COL.box), boxOut: lam(COL.box), hang: lamIn(COL.hang), cord: lamIn(COL.cord), storeCeiling: lamIn(COL.storeCeiling), dark: glow(COL.dark), mat: lamIn(COL.mat),
  nextLightPanel: lam(COL.nextDark), bar: lamIn(COL.bar), stool: lamIn(COL.stool), shelf2: lamIn(COL.shelf2), vendBody: lam(COL.vendBody), vending: glow(COL.vending),
  pole: lam(COL.pole), lamp: glow(COL.lamp), bench: lam(COL.bench), fence: lam(COL.fence),
  annex: lamIn(COL.annex), annexFloor: lamIn(COL.annexFloor), backGlow: glow(COL.backGlow),
};
const boxGeo = (b) => new THREE.BoxGeometry(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0).translate((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
const byMat = {};
for (const b of C.visualBoxes()) (byMat[b.mat] ||= []).push(boxGeo(b));
const MESH = {};
const CASTERS = ['shelf', 'shelfBoard', 'goods', 'goods2', 'goods3', 'box', 'counter', 'freezerBody', 'tvBody', 'register', 'hang'];   // what the one shadow-casting light draws
const RECEIVERS = ['storeFloor', 'storeWall', 'shelf', 'shelfBoard', 'goods', 'goods2', 'goods3', 'box', 'counter', 'freezerBody', 'chestLid'];
for (const [k, list] of Object.entries(byMat)) {
  if (!MATS[k]) throw new Error('no material for ' + k);
  MESH[k] = new THREE.Mesh(mergeGeometries(list), MATS[k]);
  MESH[k].castShadow = CASTERS.includes(k); MESH[k].receiveShadow = RECEIVERS.includes(k);
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
// floor lines: worn tiles in the grocery, planks next door
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
const ceilingGrid = gridLines(G.x0, G.x1, G.z0, G.z1, 1.2, C.STORE.h - 0.215, COL.ceilingGrid);   // old ceiling boards
scene.add(ceilingGrid);
scene.add(gridLines(C.NEXT.x0 + C.WALL_T, C.NEXT.x1 - C.WALL_T, C.NEXT.z0 + C.WALL_T, C.NEXT.z1 - C.WALL_T, 0.32, G.y, '#3A2E25', false, true));
// sliding door leaves: glass in an old aluminium frame
const leafFrame = (w, h) => mergeGeometries([[w, 0.05, 0, h / 2 - 0.025], [w, 0.05, 0, -h / 2 + 0.025], [0.035, h, -w / 2 + 0.0175, 0], [0.035, h, w / 2 - 0.0175, 0]]
  .map(([bw, bh, x, y]) => new THREE.BoxGeometry(bw, bh, 0.05).translate(x, y, 0)));
const leaves = C.doorLeaves(C.newDoors()).map((lf) => {
  const w = lf.x1 - lf.x0, h = lf.y1 - lf.y0, g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(w - 0.04, h - 0.05, 0.02), MATS.glass));
  g.add(new THREE.Mesh(leafFrame(w, h), MATS.frame));
  scene.add(g);
  return g;
});
// lights: a dim night outside; inside the grocery two bare bulbs and one flickering tube (round 8). Only the bulb over the
// aisles casts shadows (a spot pointing down, so one shadow pass); the bulb over the till and the tube do not.
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
scene.add(new THREE.HemisphereLight(0xb8c6e2, 0x2a3242, 2.7));
const moon = new THREE.DirectionalLight(0xa8bddc, 0.55);
moon.position.set(-10, 22, 14);
scene.add(moon);
const LIGHT = { bulbTill: 20, bulbAisle: 28, tube: 18 };
if (Q.get('lights')) Q.get('lights').split(',').map(Number).forEach((v, i) => { if (v >= 0) LIGHT[['bulbTill', 'bulbAisle', 'tube', 'amb'][i]] = v; });   // tuning only
if (LIGHT.amb != null) INSIDE_AMBIENT.value = LIGHT.amb;
const [B0, B1] = C.GROCERY.bulbs, TB = C.GROCERY.tube;
const bulbTill = new THREE.PointLight(COL.bulb, LIGHT.bulbTill, 5.0, 2);
bulbTill.position.set(B0[0], B0[1] - 0.06, B0[2]);
scene.add(bulbTill);
const bulbAisle = new THREE.SpotLight(COL.bulb, LIGHT.bulbAisle, 6.0, 1.15, 0.6, 2);
bulbAisle.position.set(B1[0], B1[1] - 0.06, B1[2]);
bulbAisle.target.position.set(B1[0], 0, B1[2]);
bulbAisle.castShadow = true; bulbAisle.shadow.mapSize.set(1024, 1024); bulbAisle.shadow.bias = -0.0008; bulbAisle.shadow.camera.near = 0.3; bulbAisle.shadow.camera.far = 7.5;
scene.add(bulbAisle, bulbAisle.target);
const tubeLight = new THREE.PointLight(COL.tube, LIGHT.tube, 5.5, 2);
tubeLight.position.set((TB.x0 + TB.x1) / 2, TB.y - 0.1, TB.z);
scene.add(tubeLight);
const streetLamp = new THREE.PointLight(COL.lamp, 9, 14, 1.3);
streetLamp.position.set(C.LAMP.x, C.LAMP.top - 0.45, C.LAMP.z + 0.3);
scene.add(streetLamp);
// the bulbs, the tube and the old television themselves
const bulbMat = [glow(COL.bulb), glow(COL.bulb)], tubeMat = glow(COL.tube);
const bulbMeshes = C.GROCERY.bulbs.map(([x, y, z], i) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), bulbMat[i]); m.position.set(x, y, z); scene.add(m); return m; });
const tubeMesh = new THREE.Mesh(new THREE.BoxGeometry(TB.x1 - TB.x0, 0.045, 0.045).translate((TB.x0 + TB.x1) / 2, TB.y, TB.z), tubeMat);
scene.add(tubeMesh);
const tvCanvas = document.createElement('canvas'); tvCanvas.width = 64; tvCanvas.height = 48;
const tvCtx = tvCanvas.getContext('2d', { willReadFrequently: true }), tvTex = new THREE.CanvasTexture(tvCanvas);
tvTex.magFilter = THREE.NearestFilter; tvTex.colorSpace = THREE.SRGBColorSpace;
const tvMat = new THREE.MeshBasicMaterial({ map: tvTex, color: 0xffffff });
const TVS = C.GROCERY.tv;
const tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(TVS.z1 - TVS.z0, TVS.y1 - TVS.y0).rotateY(-Math.PI / 2).translate(TVS.x - 0.004, (TVS.y0 + TVS.y1) / 2, (TVS.z0 + TVS.z1) / 2), tvMat);
scene.add(tvScreen);
const tvRnd = C.rng(4242);
let tvState = null;
function drawTv(tv, t) {                           // snow: grey noise, cold-tinted; P2: black glass with the store behind you and a figure in it
  const W = 64, Hh = 48, img = tvCtx.createImageData(W, Hh), d = img.data, lv = tv.level;
  if (tv.reflect) {
    const fx = Math.round(tv.u * W);
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      const i = 4 * (y * W + x), refl = 14 + 22 * (1 - y / Hh);         // the faint shop behind you, darker low down
      const head = Math.hypot(x - fx, y - 12) < 4.2, body = Math.abs(x - fx) < 5 - (y < 18 ? 2 : 0) && y > 16;
      const v = (head || body ? 3 : refl) * lv;
      d[i] = v * 0.9; d[i + 1] = v; d[i + 2] = v * 1.15; d[i + 3] = 255;
    }
  } else if (tv.snow) {
    for (let i = 0; i < W * Hh; i++) { const v = (60 + tvRnd() * 170) * lv; d[4 * i] = v * 0.85; d[4 * i + 1] = v * 0.95; d[4 * i + 2] = v; d[4 * i + 3] = 255; }
  } else for (let i = 0; i < W * Hh; i++) { d[4 * i] = d[4 * i + 1] = d[4 * i + 2] = 2; d[4 * i + 3] = 255; }
  tvCtx.putImageData(img, 0, 0); tvTex.needsUpdate = true;
  tvState = { reflect: tv.reflect, snow: tv.snow, u: tv.u, t, level: lv };
}
// warm light from the little window on the wet pavement (the only lit window on the street)
const puddleCanvas = document.createElement('canvas'); puddleCanvas.width = puddleCanvas.height = 64;
{ const g = puddleCanvas.getContext('2d'), gr = g.createRadialGradient(32, 10, 2, 32, 22, 40); gr.addColorStop(0, 'rgba(255,180,90,0.55)'); gr.addColorStop(1, 'rgba(255,180,90,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
const puddleMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(puddleCanvas), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const puddle = new THREE.Mesh(new THREE.PlaneGeometry(C.WINDOW.x1 - C.WINDOW.x0 + 1.2, 2.2).rotateX(-Math.PI / 2).translate((C.WINDOW.x0 + C.WINDOW.x1) / 2, C.SIDEWALK_H + 0.004, C.FACADE_Z + 1.1), puddleMat);
scene.add(puddle);
// what hides while you rise out of a building
// ---------------- the scare version: figures, staff door, the dog ----------------
const figMat = new THREE.MeshBasicMaterial({ color: C.HORROR.figure.color });
function makeFigure() {                             // faceless silhouette: capsule body (a little flattened front to back), round head
  const f = C.HORROR.figure, g = new THREE.Group(), top = f.h - 2 * f.headR - 0.01;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(f.bodyR, top - 2 * f.bodyR, 6, 16), figMat);
  body.position.y = top / 2; body.scale.z = 0.72;
  const head = new THREE.Mesh(new THREE.SphereGeometry(f.headR, 18, 12), figMat);
  head.position.y = top + 0.01 + f.headR;
  body.castShadow = head.castShadow = true;
  g.add(body, head); g.visible = false; scene.add(g);
  return g;
}
const figPersist = makeFigure(), figScare = makeFigure(), figAisle = makeFigure();
let figureHidden = false;                           // test hook: render the same frame without the figure
const placeAt = (g, p) => { g.position.set(p.x, C.SIDEWALK_H, p.z); g.rotation.y = p.yaw; };
const placeFigure = (g, spot) => placeAt(g, C.HORROR.spots[spot]);
const leafPivot = new THREE.Group();
leafPivot.position.set(C.BACKDOOR.hx, C.SIDEWALK_H, C.BACKDOOR.hz);
const leafMat = lamIn(COL.backDoor);
leafPivot.add(new THREE.Mesh(new THREE.BoxGeometry(C.BACKDOOR.w, C.BACKDOOR.h, 0.04).translate(C.BACKDOOR.w / 2, C.BACKDOOR.h / 2, 0), leafMat));
scene.add(leafPivot);
// the stray dog (round 8 追加): boxes for body, head, snout, ears, four legs and a tail; legs swing as it walks
const dogMat = lamIn(COL.dog), dogDark = lamIn(COL.dogDark);
const dog = new THREE.Group(), dogBody = new THREE.Group();
const dbox = (w, h, l, x, y, z, m = dogMat) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), m); b.position.set(x, y, z); b.castShadow = true; return b; };
dogBody.add(dbox(0.26, 0.24, 0.55, 0, 0.42, 0));                          // body (the dog faces -z in its own frame)
const dogHead = new THREE.Group(); dogHead.position.set(0, 0.5, -0.3);
dogHead.add(dbox(0.2, 0.18, 0.2, 0, 0.04, -0.06), dbox(0.11, 0.09, 0.12, 0, -0.01, -0.21, dogDark), dbox(0.05, 0.08, 0.04, -0.07, 0.15, -0.02, dogDark), dbox(0.05, 0.08, 0.04, 0.07, 0.15, -0.02, dogDark));
dogBody.add(dogHead);
const dogLegs = [[-0.09, -0.2], [0.09, -0.2], [-0.09, 0.2], [0.09, 0.2]].map(([x, z]) => { const p = new THREE.Group(); p.position.set(x, 0.33, z); p.add(dbox(0.07, 0.33, 0.07, 0, -0.165, 0)); dogBody.add(p); return p; });
const dogTail = new THREE.Group(); dogTail.position.set(0, 0.5, 0.27); dogTail.add(dbox(0.04, 0.04, 0.24, 0, 0, 0.12)); dogBody.add(dogTail);
dog.add(dogBody); dog.visible = false; scene.add(dog);
let dogPose = null;
function poseDog(v, t) {
  dog.visible = !!v; dogPose = v ? { ...v } : null;
  if (!v) return;
  dog.position.set(v.x, C.SIDEWALK_H, v.z); dog.rotation.y = v.yaw;
  const swing = ['enter', 'walk', 'out'].includes(v.phase) ? Math.sin(v.legs) * 0.45 : 0;
  dogLegs.forEach((l, i) => { l.rotation.x = (i === 0 || i === 3 ? 1 : -1) * swing; });
  dogBody.position.y = -0.1 * v.crouch; dogHead.position.y = 0.5 - 0.08 * v.crouch; dogHead.rotation.x = v.sniff ? 0.6 : -0.15 * v.crouch;
  dogBody.rotation.z = v.shake !== null ? Math.sin(v.shake * 40) * 0.18 * Math.max(0, 1 - v.shake) : 0;
  dogTail.rotation.x = v.tail === 'tuck' ? 1.1 : v.tail === 'wag' ? -0.5 : -0.35;
  dogTail.rotation.y = v.tail === 'wag' ? Math.sin(t * 16) * 0.6 : 0;
}
// what follows the shop lights: the bulb and tube meshes (the bulbs and tube light their own way), and the window glow
const LIFT = { store: ['storeRoof', 'storeCeiling', 'storeFacade:upper', 'sign', 'signText', 'hang', 'cord'], next: ['nextRoof', 'nextWall:upper', 'sign2', 'sign2Text', 'nextLightPanel'] };
const ROOM_LIFT = { store: ['storeRoof', 'storeCeiling', 'hang', 'cord'], next: ['nextRoof', 'nextLightPanel'] };   // the room view: roof, ceiling and what hangs from it off; walls and the back room's roof stay

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
let wanderRun = null;                              // the wanderer hook's state between calls
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
    // round 8 beds: the tube's buzz (sawtooth 100 Hz through a bandpass), the television's snow (high-passed noise), the chest
    // freezer's drone (sawtooth 58 Hz, lowpassed) and rain drumming on the tin awning (sparse clicks through a bandpass)
    const buzz = ctx.createGain(); buzz.gain.value = 0; buzz.connect(master);
    { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 100; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 600; bp.Q.value = 0.7; o.connect(bp); bp.connect(buzz); o.start(); }
    const snow = ctx.createGain(); snow.gain.value = 0; snow.connect(master);
    { const n = ctx.createBufferSource(); n.buffer = buf; n.loop = true; const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500; n.connect(hp); hp.connect(snow); n.start(0, 0.7); }
    const freezer = ctx.createGain(); freezer.gain.value = 0; freezer.connect(master);
    const fo = ctx.createOscillator(); fo.type = 'sawtooth'; fo.frequency.value = 58; const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 220; fo.connect(fl); fl.connect(freezer); fo.start();
    const awning = ctx.createGain(); awning.gain.value = 0; awning.connect(master);
    { const ab = ctx.createBuffer(1, len, ctx.sampleRate), ad = ab.getChannelData(0), r2 = C.rng(11); for (let i = 0; i < len; i++) ad[i] = r2() < 0.004 ? (r2() * 2 - 1) : ad[Math.max(0, i - 1)] * 0.86;
      const n = ctx.createBufferSource(); n.buffer = ab; n.loop = true; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 0.9; n.connect(bp); bp.connect(awning); n.start(); }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    audio = { ctx, lp, g, master, buzz, snow, freezer, awning, noise: buf, log: [], played: sim.S.t, tubeWas: 1 };
  } catch (e) { audio = { state: 'failed: ' + e.message }; }
}

// One-off sounds, all synthesised. Peaks come from core.audioLevels: bell about 2x the bed, bang about 4x.
// The ear follows the camera (for the knocking, which is placed in 3D); older browsers only have setPosition/setOrientation.
function setListener(L, c) {
  const cp = Math.cos(c.pitch), f = [-Math.sin(c.yaw) * cp, Math.sin(c.pitch), -Math.cos(c.yaw) * cp];
  if (L.positionX) {
    L.positionX.value = c.x; L.positionY.value = c.y; L.positionZ.value = c.z;
    L.forwardX.value = f[0]; L.forwardY.value = f[1]; L.forwardZ.value = f[2]; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
  } else { if (L.setPosition) L.setPosition(c.x, c.y, c.z); if (L.setOrientation) L.setOrientation(f[0], f[1], f[2], 0, 1, 0); }
}
const KNOCK = { gap: 0.17, panner: { model: 'HRTF', distance: 'inverse', ref: 3, rolloff: 0.5 } };   // falls to half by about 9 m away
function playSound(kind, lv, ev = {}) {
  const { ctx, master } = audio, t = ctx.currentTime, env = (peak, attack, decay) => { const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay); g.connect(master); return g; };
  const osc = (type, f, dest, start = t, stop = t + 1.5) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.connect(dest); o.start(start); o.stop(stop); return o; };
  const placed = (pos) => {                         // a PannerNode at a point in the shop (as for the knocking)
    const pan = ctx.createPanner(), P = KNOCK.panner;
    pan.panningModel = P.model; pan.distanceModel = P.distance; pan.refDistance = P.ref; pan.rolloffFactor = P.rolloff;
    if (pan.positionX) { pan.positionX.value = pos[0]; pan.positionY.value = pos[1]; pan.positionZ.value = pos[2]; } else pan.setPosition(...pos);
    pan.connect(master); return pan;
  };
  const noiseBurst = (dest, type, f, q, start, dur) => { const n = ctx.createBufferSource(); n.buffer = audio.noise; const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; n.connect(b); b.connect(dest); n.start(start, Math.random() * 1.2, dur); return b; };
  if (kind === 'bell') {                           // round 8: a little hanging shop bell, jingling three times as the door swings
    for (const [k, dt] of [[1, 0], [0.7, 0.11], [0.45, 0.24]]) for (const [f, a] of [[2093, 1], [2794, 0.6], [3729, 0.35]]) {
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t + dt); g.gain.linearRampToValueAtTime(lv.bell * k * a * 0.6, t + dt + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.5); g.connect(master);
      osc('sine', f * (1 + 0.004 * dt), g, t + dt, t + dt + 0.55);
    }
    audio.log.push({ kind, at: t, simT: ev.t, peak: lv.bell, base: lv.base, voice: 'hanging bell' });
  } else if (kind === 'crackle') {                 // the tube ticking as it flickers
    const g = env(lv.base * 0.5, 0.002, 0.06); noiseBurst(g, 'highpass', 3000, 0.7, t, 0.08);
    audio.log.push({ kind, at: t, simT: ev.t, peak: lv.base * 0.5, base: lv.base });
  } else if (kind === 'paw') {                     // claws on the floor
    const peak = lv.base * C.AUDIO.paw, pan = placed(ev.pos), g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035); g.connect(pan); noiseBurst(g, 'bandpass', 2400, 2.5, t, 0.05);
    audio.log.push({ kind, at: t, simT: ev.t, peak, base: lv.base, pos: ev.pos.slice() });
  } else if (kind === 'shake') {                   // shaking the rain off: wet flapping noise, about 0.9 s
    const peak = lv.base * C.AUDIO.shake, pan = placed(ev.pos), g = ctx.createGain(), am = ctx.createGain(), lfo = ctx.createOscillator();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.08); g.gain.setValueAtTime(peak, t + 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    lfo.frequency.value = 13; const lg = ctx.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(am.gain); am.gain.value = 0.5; lfo.start(t); lfo.stop(t + 0.95);
    am.connect(g); g.connect(pan); noiseBurst(am, 'lowpass', 1800, 0.7, t, 0.95);
    audio.log.push({ kind, at: t, simT: ev.t, peak, base: lv.base, pos: ev.pos.slice() });
  } else if (kind === 'growl') {                   // a low growl: low-passed noise and a 75 Hz buzz, swelling at about 4 Hz, for ev.dur s
    const dur = ev.dur || 3, peak = lv.base * C.AUDIO.growl, pan = placed(ev.pos), g = ctx.createGain(), am = ctx.createGain(), lfo = ctx.createOscillator();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.25); g.gain.setValueAtTime(peak, t + dur - 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lfo.frequency.value = 4.2; const lg = ctx.createGain(); lg.gain.value = 0.35; lfo.connect(lg); lg.connect(am.gain); am.gain.value = 0.65; lfo.start(t); lfo.stop(t + dur);
    am.connect(g); g.connect(pan); noiseBurst(am, 'lowpass', 190, 1.2, t, dur); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300; lp.connect(am); osc('sawtooth', 75, lp, t, t + dur);
    audio.log.push({ kind, at: t, simT: ev.t, peak, base: lv.base, pos: ev.pos.slice(), length: dur });
  } else if (kind === 'whimper') {                 // one whimper: a sine falling 1100 -> 650 Hz with a little vibrato
    const peak = lv.base * C.AUDIO.whimper, pan = placed(ev.pos), g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5); g.connect(pan);
    const o = osc('sine', 1100, g, t, t + 0.52); o.frequency.exponentialRampToValueAtTime(650, t + 0.45);
    const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 9; vg.gain.value = 25; vib.connect(vg); vg.connect(o.frequency); vib.start(t); vib.stop(t + 0.52);
    audio.log.push({ kind, at: t, simT: ev.t, peak, base: lv.base, pos: ev.pos.slice() });
  } else if (kind === 'slam') {                    // low thump falling 110 -> 38 Hz plus a short lowpassed noise burst
    const g = env(lv.slam, 0.004, 0.45), o = osc('sine', 110, g, t, t + 0.6); o.frequency.exponentialRampToValueAtTime(38, t + 0.3);
    const n = ctx.createBufferSource(); n.buffer = audio.noise; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1200;
    n.connect(f); f.connect(env(lv.slam * 0.6, 0.002, 0.3)); n.start(t, Math.random() * 1.5, 0.4);
    audio.log.push({ kind, at: t, peak: lv.slam, base: lv.base });
  } else if (kind === 'sting') {                   // one dissonant high cluster (a minor second), under 0.6 s
    const g = env(lv.sting, 0.006, 0.5), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 700; hp.connect(g);
    osc('sawtooth', 1396.9, hp, t, t + 0.56); osc('sawtooth', 1479.98, hp, t, t + 0.56);
    audio.log.push({ kind, at: t, peak: lv.sting, base: lv.base, length: 0.506 });
  } else if (kind === 'knock') {                   // three knocks on the staff door from behind it: a low thud and a short wooden tap each, placed in 3D
    const peak = lv.base * ev.mult, pan = ctx.createPanner(), P = KNOCK.panner;
    pan.panningModel = P.model; pan.distanceModel = P.distance; pan.refDistance = P.ref; pan.rolloffFactor = P.rolloff;
    if (pan.positionX) { pan.positionX.value = ev.pos[0]; pan.positionY.value = ev.pos[1]; pan.positionZ.value = ev.pos[2]; } else pan.setPosition(...ev.pos);
    pan.connect(master);
    for (let i = 0; i < 3; i++) {
      const t0 = t + i * KNOCK.gap, g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(peak, t0 + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14); g.connect(pan);
      const o = osc('sine', 150, g, t0, t0 + 0.16); o.frequency.setValueAtTime(150, t0); o.frequency.exponentialRampToValueAtTime(70, t0 + 0.1);
      const n = ctx.createBufferSource(); n.buffer = audio.noise; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.2;
      const ng = ctx.createGain(); ng.gain.setValueAtTime(0.0001, t0); ng.gain.linearRampToValueAtTime(peak * 0.5, t0 + 0.002); ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
      n.connect(bp); bp.connect(ng); ng.connect(pan); n.start(t0, Math.random() * 1.5, 0.08);
    }
    const at = (a, i) => (pan[a] ? pan[a].value : ev.pos[i]);
    audio.log.push({ kind, at: t, simT: ev.t, peak, base: lv.base, mult: ev.mult, pos: ev.pos.slice(), panner: { x: at('positionX', 0), y: at('positionY', 1), z: at('positionZ', 2), model: pan.panningModel, distance: pan.distanceModel }, knocks: 3 });
  }
}

// ---------------- draw the simulation ----------------
const hints = {
  outside: COARSE ? '单指拖动转 · <b>双指张开</b>放大，走进去' : '拖动旋转 · <b>滚轮往前</b>放大，走进去',
  inside: COARSE ? '<b>左边摇杆</b>走 · 右边拖动转头 · <b>捏合</b>看整间店' : '<b>W S</b> 前后 · <b>A D</b> 横移 · <b>← →</b> 转身 · 拖动也能转 · <b>滚轮往后</b>看整间店',
  street: COARSE ? '<b>左边摇杆</b>走 · 右边拖动转头 · <b>捏合</b>出来' : '<b>W S</b> 前后 · <b>A D</b> 横移 · <b>← →</b> 转身 · 拖动也能转 · <b>滚轮往后</b>或 Esc 出来',
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
    if (b.id === 'store') { ceilingGrid.visible = a > 0.5; const lit = on.includes('hang') ? a > 0.5 : true; for (const m of bulbMeshes) m.visible = lit; tubeMesh.visible = lit; }
    for (const k of LIFT[b.id]) setAlpha(k, on.includes(k) ? a : 1);
  }
  if (dbgDoors.length) dbgDoors.forEach((l, i) => { l.visible = S.doors[i].k < C.DOOR_PASS; });
  // scare version: what the state machine says this instant
  const V = sim.levels();
  figPersist.visible = !figureHidden && !!V.figure; if (V.figure) placeFigure(figPersist, V.figure);
  figScare.visible = !figureHidden && V.scare; if (V.scare) placeFigure(figScare, 'backroom');
  figAisle.visible = !figureHidden && V.aisle !== null; if (V.aisle !== null) placeAt(figAisle, C.aisleSpot(C.GROCERY.aisles[V.aisle]));
  leafPivot.rotation.y = -C.leafAngle(V.back);
  // round 8 lights: bulbs and tube (E0/E5 darkness, E2 one by one, the tube's flicker), the TV, the glow on the pavement
  bulbTill.intensity = LIGHT.bulbTill * V.bulbs[0]; bulbAisle.intensity = LIGHT.bulbAisle * V.bulbs[1]; tubeLight.intensity = LIGHT.tube * V.tube;
  bulbMat.forEach((m, i) => m.color.set(COL.bulb).multiplyScalar(0.15 + 0.85 * V.bulbs[i])); tubeMat.color.set(COL.tube).multiplyScalar(0.12 + 0.88 * V.tube);
  if (!tvState || tvState.reflect !== V.tv.reflect || V.tv.snow || tvState.snow !== V.tv.snow || tvState.level !== V.tv.level) drawTv(V.tv, S.t);
  puddleMat.opacity = 0.35 + 0.65 * V.bulbs[0];
  poseDog(V.dog, S.t);
  camera.position.x += V.shake[0]; camera.position.y += V.shake[1]; camera.position.z += V.shake[2];   // the picture shakes, the walker does not
  darkEl.style.opacity = String(0.55 * V.darken);
  for (const v of S.h.vibes) if (v.t > vibePlayed && v.t <= S.t) { try { if (typeof navigator.vibrate === 'function') navigator.vibrate(v.pattern); } catch { /* not allowed here */ } }
  vibePlayed = Math.max(vibePlayed, S.t);
  if (audio && audio.ctx) {
    const now = audio.ctx.currentTime;
    audio.lp.frequency.setTargetAtTime(L.lowpass, now, 0.08); audio.g.gain.setTargetAtTime(L.volume, now, 0.08);
    for (const k of ['buzz', 'snow', 'freezer', 'awning']) audio[k].gain.setTargetAtTime(V.audio[k], now, 0.015);
    const tubeOn = V.tube > 0 ? 1 : 0;
    if (tubeOn !== audio.tubeWas && S.mode !== 'orbit') playSound('crackle', V.audio, { t: S.t });   // the tube ticks as it flickers
    audio.tubeWas = tubeOn;
    setListener(audio.ctx.listener, c);
    for (const ev of S.h.sounds) if (ev.t > audio.played && ev.t <= S.t) playSound(ev.kind, V.audio, ev);
    audio.played = Math.max(audio.played, S.t);
  }
  const hintOn = C.joyHint(S.mode, pad, COARSE);   // faint ring in the middle of the joystick spot (touch screens only)
  joyHintEl.style.display = hintOn ? 'block' : 'none';
  if (hintOn) { joyHintEl.style.left = cssW * C.PAD.left / 2 + 'px'; joyHintEl.style.top = cssH * (1 + C.PAD.low) / 2 + 'px'; }
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
  if (e.code.startsWith('Arrow')) e.preventDefault();          // the arrows walk and turn; they must not scroll the page
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k of Object.keys(keys)) keys[k] = false; });
// W S and the up/down arrows walk, A D step sideways, the left/right arrows and Q E turn (round 6)
function applyKeys() {
  if (sim.S.mode !== 'walk') return;
  const k = { fwd: keys.KeyW || keys.ArrowUp, back: keys.KeyS || keys.ArrowDown, left: keys.KeyA, right: keys.KeyD,
    turnL: keys.ArrowLeft || keys.KeyQ, turnR: keys.ArrowRight || keys.KeyE, run: keys.ShiftLeft || keys.ShiftRight };
  const m = C.keyMotion(k, sim.S.player.yaw), on = !!(m.vx || m.vz || m.turn);
  if (!on) { if (keyDriving) { sim.drive(0, 0); sim.turn(0); keyDriving = false; } return; }
  sim.drive(m.vx, m.vz); sim.turn(m.turn);
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
  pad: () => { sync(); return { joy: pad.joy, pinching: pad.pinching, joyShown: joyEl.style.display === 'block', joyAt: [parseFloat(joyEl.style.left) || 0, parseFloat(joyEl.style.top) || 0], hint: hintEl.textContent,
    pending: pad.pending, ring: { shown: joyHintEl.style.display === 'block', at: [parseFloat(joyHintEl.style.left) || 0, parseFloat(joyHintEl.style.top) || 0], opacity: Number(getComputedStyle(joyHintEl).opacity), size: joyHintEl.offsetWidth }, coarse: COARSE }; },
  walkTo: (x, z) => sim.walkTo(x, z),
  step: (dt = 1 / 60, n = 1) => { sim.S.auto = false; for (let i = 0; i < n; i++) sim.update(dt); sync(); return sim.snapshot(); },
  // steps with whatever keys are held right now, through the page's own key handling (round 6, K1)
  keyStep: (dt = 1 / 60, n = 1) => { sim.S.auto = false; for (let i = 0; i < n; i++) { applyKeys(); sim.update(dt); } sync(); return sim.snapshot(); },
  // the first-visit wanderer (core.createWanderer), its keys fed through the page's key handling; quarter of a second per frame
  // the first-visit wanderer (core.createWanderer), its keys fed through the page's key handling, a quarter of a second per
  // frame. `stop` names an event to pause at (the same wanderer carries on with resume: true); otherwise it runs to E4 or maxT.
  wander: ({ seed = 1, aim = 'door', maxT = 90, chunk = 0.25, stop = 'E4', resume = false } = {}) => new Promise((resolve) => {
    sim.S.auto = false;
    if (!resume || !wanderRun) wanderRun = { w: C.createWanderer(sim, seed, { aim }), t0: sim.S.t };
    const { w, t0 } = wanderRun, dt = 1 / 60, map = { fwd: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', turnL: 'ArrowLeft', turnR: 'ArrowRight', run: 'ShiftLeft' };
    const tick = () => {
      for (let i = 0; i < Math.round(chunk / dt); i++) {
        if (sim.horror().fired[stop] != null || sim.S.t - t0 >= maxT - 1e-9) {
          for (const c of Object.values(map)) keys[c] = false;
          applyKeys(); sync(); resolve({ t: sim.S.t - t0, t0, log: w.log, rear: w.rear }); return;
        }
        const k = w.decide(dt);
        for (const [a, c] of Object.entries(map)) keys[c] = !!k[a];
        applyKeys(); sim.update(dt);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }),
  solids: () => C.solids(sim.S.doors, sim.levels().back),   // the staff door where it really is
  screenBox: () => { sync(); return { ...screenBoxOf(C.SCREEN_POINTS.base), model: screenBoxOf(C.SCREEN_POINTS.model) }; },
  // extra hooks used by tools/browser-check.cjs
  walkRoute: (p) => sim.walkRoute(p),
  stopWalk: () => { sim.S.player.route = null; },              // test hook: the scripted visit stops where E4 caught it
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
      // round 8: the grocery's lights as drawn (relative to full), the television, how many lights there are and how many cast shadows
      shop: { bulbs: [bulbTill.intensity / LIGHT.bulbTill, bulbAisle.intensity / LIGHT.bulbAisle], tube: tubeLight.intensity / LIGHT.tube, tv: tvState && { ...tvState },
        // the names the earlier checks read: shop lamps = the brighter bulb, glow = the TV screen, freezers -> the TV (one value)
        lamp: Math.max(bulbTill.intensity / LIGHT.bulbTill, bulbAisle.intensity / LIGHT.bulbAisle), glow: tvState ? tvState.level : 1, freezers: [tvState ? tvState.level : 1],
        lights: (() => { let n = 0, sh = 0; scene.traverse((o) => { if (o.isLight && o.visible && o.intensity > 0) { n++; if (o.castShadow) sh++; } }); return { n, shadows: sh }; })() },
      dog: dog.visible ? { ...dogPose, drawn: true } : null,
      figures: { counterOrWindow: figPersist.visible, backroom: figScare.visible, aisle: figAisle.visible, color: '#' + figMat.color.getHexString() }, leaf: -C.BACKDOOR.dir * leafPivot.rotation.y, darkOverlay: Number(darkEl.style.opacity || 0),
      camera: [camera.position.x, camera.position.y, camera.position.z],   // drawn camera (the simulation's plus any shake)
      drawnRoofs: { ...Object.fromEntries(['storeRoof', 'storeCeiling', 'hang', 'nextRoof', 'nextLightPanel', 'annex', 'storeWall'].map((k) => [k, MESH[k].visible ? MESH[k].material.opacity : 0])), ceilingGrid: ceilingGrid.visible ? 1 : 0, bulbs: bulbMeshes[0].visible ? 1 : 0 },
      audio: audio ? (audio.ctx ? audio.ctx.state : audio.state) : 'not started', tiltOn: tiltPasses[0][0].enabled, focusY, fov: camera.fov, hfov: C.hfov(camera.fov, cssW / cssH), rainSegments: N_RAIN };
  },
  core: C,
  horror: () => { const h = sim.horror(); return { ...h, figure: h.figure }; },
  trigger: (name) => { const ok = sim.trigger(name); sync(); return ok; },
  levels: () => sim.levels(),
  audioLog: () => (audio && audio.log ? audio.log.slice() : null),
  // round 8: the bed gains the simulation asks for now (A6), and what the nodes are actually set to
  audioGains: () => { const V = sim.levels(), L = sim.looksNow(); return { planned: { rain: L.volume, ...V.audio }, nodes: audio && audio.ctx ? Object.fromEntries(['buzz', 'snow', 'freezer', 'awning'].map((k) => [k, audio[k].gain.value]).concat([['rain', audio.g.gain.value]])) : null }; },
  // the television's screen as drawn (64 x 48): mean brightness, and in P2 the figure's pixels against the reflection around it
  tvPixels: () => {
    const d = tvCtx.getImageData(0, 0, 64, 48).data, lum = (i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    let all = 0, fig = 0, nf = 0, ring = 0, nr = 0; const fx = Math.round((tvState ? tvState.u : 0.5) * 64);
    for (let y = 0; y < 48; y++) for (let x = 0; x < 64; x++) { const v = lum(4 * (y * 64 + x)); all += v; if (Math.abs(x - fx) <= 2 && y >= 22 && y <= 40) { fig += v; nf++; } else if (Math.abs(x - fx) >= 9 && Math.abs(x - fx) <= 14 && y >= 22 && y <= 40) { ring += v; nr++; } }
    return { mean: all / (64 * 48), figure: fig / nf, around: ring / nr, state: tvState && { ...tvState } };
  },
  hideFigure: (on) => { figureHidden = !!on; sync(); },
  figureMask: (on) => { figMat.color.set(on ? '#ffffff' : C.HORROR.figure.color); sync(); },   // paint the figure white to find its pixels
  // Can the camera see these points? Frustum, then a ray against every opaque mesh (glass, rain, lines and the figures skipped).
  visibility: (pts) => {
    sync(); scene.updateMatrixWorld(); camera.updateMatrixWorld();   // the staff door leaf moves in sync(): without the scene update its matrix is the last drawn frame's
    const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const opaque = []; scene.traverse((o) => { if (o.isMesh && o.visible && !(o.material.transparent) && !o.parent?.isGroup || (o.isMesh && o.parent === leafPivot)) opaque.push(o); });
    const solid = opaque.filter((o) => !figPersist.children.includes(o) && !figScare.children.includes(o) && o !== bigGround);
    const rc = new THREE.Raycaster(), from = camera.position.clone();
    return pts.map((p) => { const q = new THREE.Vector3(...p), dist = from.distanceTo(q); rc.set(from, q.clone().sub(from).normalize()); rc.far = dist - 0.05;
      const hit = rc.intersectObjects(solid, false)[0]; return { inFrustum: fr.containsPoint(q), blockedBy: hit ? (hit.object.parent === leafPivot ? 'staffDoorLeaf' : (Object.entries(MESH).find(([, m]) => m === hit.object) || ['other'])[0]) : null }; });
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
