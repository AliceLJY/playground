// 雪线小木屋 — the page. Everything is built in code: no models, no image files.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  SEED, mulberry32, clamp, SUMMIT_R, DECK_Y, CLOUD_Y, MOON_DIR, BUILDINGS, HERO_BOX, SATELLITES, FLAG_LINES, phaseOf,
  windowStates, windowLevel, VIEWS, createRig, fovFor, shiftFor, screenBox,
  STORIES, FINALE_LINE, summitOf, createGame, focusPose, homePose, pickSummit, skyAt, windowOn, ROOM, EYE, SPOTS, createVisit, project,
} from './core.js';

const canvas = document.getElementById('scene');
const params = new URLSearchParams(location.search);
const rnd = mulberry32(SEED);
const R = (a, b) => a + (b - a) * rnd();

let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
catch (e) { document.getElementById('fail').style.display = 'grid'; throw e; }
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
const FOG = new THREE.Color(0.034, 0.052, 0.115);
scene.fog = new THREE.FogExp2(FOG, 0.0055);
const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 900);

// ---------------- textures drawn on a canvas ----------------
function canvasTex(w, h, draw, repeat = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 4;
  return t;
}
const trnd = mulberry32(7);
const woodTex = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#8c5c38'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 16) {                         // stacked logs: a dark seam and a soft highlight on each
    g.fillStyle = 'rgba(40,22,10,.55)'; g.fillRect(0, y, w, 2);
    g.fillStyle = 'rgba(255,214,160,.10)'; g.fillRect(0, y + 4, w, 3);
    for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(${trnd() < 0.5 ? '50,28,12' : '190,140,90'},${0.05 + trnd() * 0.1})`; g.fillRect(trnd() * w, y + 3 + trnd() * 12, 6 + trnd() * 30, 1); }
  }
});
const stoneTex = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#8a8172'; g.fillRect(0, 0, w, h);
  for (let row = 0; row < 4; row++) for (let col = -1; col < 4; col++) {
    const x = col * 40 + (row % 2) * 20 + trnd() * 4, y = row * 32, v = 118 + Math.floor(trnd() * 46);
    g.fillStyle = `rgb(${v},${v - 8},${v - 22})`; g.fillRect(x + 2, y + 2, 36, 28);
  }
});
const roofTex = canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 8) { g.fillStyle = 'rgba(0,0,0,.30)'; g.fillRect(0, y, w, 1.5); for (let x = (y / 8) % 2 ? 0 : 5; x < w; x += 10) { g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(x, y, 1, 8); } }
}, 3);
const plasterTex = canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = '#ece5d6'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${trnd() < 0.5 ? '120,105,85' : '255,255,255'},${trnd() * 0.07})`; g.fillRect(trnd() * w, trnd() * h, 2 + trnd() * 4, 2 + trnd() * 3); }
});

const std = (o) => new THREE.MeshStandardMaterial(o);
const MATS = {
  rock: std({ color: 0x2b303b, roughness: 0.96, flatShading: true }),
  rockDark: std({ color: 0x1c2029, roughness: 1, flatShading: true }),
  snow: std({ color: 0xdde6f4, roughness: 0.82 }),
  wood: std({ map: woodTex, roughness: 0.78 }),
  woodDark: std({ color: 0x4a2f1d, roughness: 0.8 }),
  plank: std({ color: 0x80603f, roughness: 0.72, map: woodTex }),
  stone: std({ map: stoneTex, roughness: 0.9 }),
  plaster: std({ map: plasterTex, roughness: 0.97 }),
  roofRed: std({ color: 0xa3312b, roughness: 0.48, map: roofTex }),
  roofGreen: std({ color: 0x2f6650, roughness: 0.5, map: roofTex }),
  iron: std({ color: 0x23262d, roughness: 0.6, metalness: 0.4 }),
  pine: std({ color: 0x1d3b31, roughness: 0.9, flatShading: true }),
  flagY: std({ color: 0xe9b93a, roughness: 0.8, side: THREE.DoubleSide }),
  cloth: std({ color: 0xc9423a, roughness: 0.85, side: THREE.DoubleSide }),
  cream: std({ color: 0xe8dcc0, roughness: 0.9, side: THREE.DoubleSide }),
  cat: std({ color: 0xd9832b, roughness: 0.92 }),
  quilt: std({ color: 0x3f5f9a, roughness: 0.95 }),
};

// ---------------- geometry collector: everything static is merged per material ----------------
const bins = {}, roomBins = {};
let curBins = bins, curSummit = null;      // curSummit tags windows, lamps and lights with the summit they stand on
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3();
let origin = new THREE.Matrix4();                       // current local frame (a summit, a hut)
function put(mat, geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  M4.compose(V.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz, 'YXZ')), S.set(sx, sy, sz)).premultiply(origin);
  g.applyMatrix4(M4);
  (curBins[mat] = curBins[mat] || []).push(g);
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r0, r1, h, n = 12) => new THREE.CylinderGeometry(r0, r1, h, n);
const cone = (r, h, n = 12) => new THREE.ConeGeometry(r, h, n);
// Gable prism: ridge along x, base w by d at y = 0, apex at y = h.
function prism(w, h, d) {
  const a = [-w / 2, 0, -d / 2], b = [-w / 2, 0, d / 2], c = [-w / 2, h, 0], a2 = [w / 2, 0, -d / 2], b2 = [w / 2, 0, d / 2], c2 = [w / 2, h, 0];
  const tris = [b, b2, c2, b, c2, c, a2, a, c, a2, c, c2, a, b, c, b2, a2, c2, a, a2, b2, a, b2, b];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tris.flat()), 3));
  const uv = []; for (const p of tris) uv.push(p[0] / 3, (p[1] + Math.abs(p[2])) / 3);
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  g.computeVertexNormals();
  return g;
}

// ---------------- lights that are things in the picture ----------------
const windows = [];     // { m: Matrix4, owner, state }
const lamps = [];       // warm emissive blobs: { m: Matrix4 }
const bulbs = [];       // string lights
const owners = [];      // hover boxes: { box: THREE.Box3, id }
const swayers = [];     // { obj, phase, amp } lanterns and pennants that move
const smokes = [];      // chimney tops in world space
const pointLights = [];
function worldM(x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) { return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz)).premultiply(origin); }
// A window on a wall: (x, y, z) centre on the wall face, ry = direction the wall faces.
function win(owner, x, y, z, ry, w = 0.62, h = 0.86, shutters = false, open = false) {
  const nx = Math.sin(ry), nz = Math.cos(ry), tx = Math.cos(ry), tz = -Math.sin(ry);
  if (!open) put('woodDark', box(w + 0.18, h + 0.18, 0.1), x + nx * 0.03, y, z + nz * 0.03, ry);
  else for (const s of [-1, 1]) {                       // ground floor of the main house: the room inside looks out through these
    put('woodDark', box(0.09, h + 0.18, 0.1), x + tx * s * (w / 2 + 0.045) + nx * 0.03, y, z + tz * s * (w / 2 + 0.045) + nz * 0.03, ry);
    put('woodDark', box(w + 0.18, 0.09, 0.1), x + nx * 0.03, y + s * (h / 2 + 0.045), z + nz * 0.03, ry);
  }
  put('woodDark', box(0.05, h, 0.03), x + nx * 0.105, y, z + nz * 0.105, ry);
  put('woodDark', box(w, 0.05, 0.03), x + nx * 0.105, y, z + nz * 0.105, ry);
  put('snow', box(w + 0.26, 0.07, 0.2), x + nx * 0.1, y - h / 2 - 0.1, z + nz * 0.1, ry);
  if (shutters) for (const s of [-1, 1]) put('roofGreen', box(0.3, h + 0.06, 0.05), x + tx * s * (w / 2 + 0.26) + nx * 0.05, y, z + tz * s * (w / 2 + 0.26) + nz * 0.05, ry);
  windows.push({ m: worldM(x + nx * 0.09, y, z + nz * 0.09, ry, w, h, 1), owner, summit: curSummit });
}
function lamp(x, y, z, s = 0.2, light = 0) {
  lamps.push({ m: worldM(x, y, z, 0, s, s * 1.25, s), summit: curSummit });
  if (light) { const p = new THREE.Vector3(x, y, z).applyMatrix4(origin); pointLights.push({ p, i: light, summit: curSummit }); }
}
function lantern(x, y, z, light = 0) {            // a lantern hanging from a short arm on a post
  put('woodDark', cyl(0.06, 0.08, y, 6), x, y / 2, z);
  put('woodDark', box(0.5, 0.06, 0.06), x + 0.2, y - 0.05, z);
  put('iron', box(0.24, 0.05, 0.24), x + 0.4, y - 0.16, z);
  put('snow', box(0.3, 0.06, 0.3), x + 0.4, y - 0.12, z);
  lamp(x + 0.4, y - 0.34, z, 0.2, light);
}
function pineTree(x, z, h = 3, y = 0) {
  put('woodDark', cyl(0.1, 0.14, h * 0.3, 6), x, y + h * 0.15, z);
  for (let i = 0; i < 3; i++) {
    const r = h * (0.36 - i * 0.085), hh = h * 0.42, yy = y + h * (0.3 + i * 0.22) + hh / 2;
    put('pine', cone(r, hh, 7), x, yy, z, R(0, 3));
    put('snow', cone(r * 0.72, hh * 0.6, 7), x, yy + hh * 0.22, z, R(0, 3));
  }
}

// ---------------- summits ----------------
const wob = (a, s) => 1 + 0.1 * Math.sin(3 * a + s) + 0.06 * Math.sin(5 * a + s * 2.3) + 0.04 * Math.sin(9 * a + s * 0.7);
function summit(r, seed, depth = 46) {
  const sr = mulberry32(seed);
  // displace by position so the three copies of a shared corner move together and no cracks open
  const h3 = (x, y, z) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed) * 43758.5453; return s - Math.floor(s); };
  const g2 = new THREE.CylinderGeometry(r, r * 1.75 + 6, depth, 18, 7).toNonIndexed(); g2.translate(0, -depth / 2 - 0.08, 0);
  const q = g2.attributes.position, s0 = sr() * 6;
  for (let i = 0; i < q.count; i++) {
    const x = q.getX(i), y = q.getY(i), z = q.getZ(i), rr = Math.hypot(x, z); if (rr < 1e-4) continue;
    const a = Math.atan2(z, x), t = -y / depth, k = wob(a, s0) * (1 + (h3(Math.round(x * 20), Math.round(y * 20), Math.round(z * 20)) - 0.5) * 0.3 * Math.min(1, t * 6)) * (1 + 0.25 * Math.sin(t * 9 + a * 2 + s0) * t);
    q.setXYZ(i, x * k, y, z * k);
  }
  g2.computeVertexNormals();
  put('rock', g2);
  // snow cap, a little wider than the rock so the rim is white, with lumps on the edge
  const cap = new THREE.CylinderGeometry(r * 1.0, r * 1.05, 0.7, 26, 1).toNonIndexed(), c = cap.attributes.position;
  for (let i = 0; i < c.count; i++) { const x = c.getX(i), z = c.getZ(i); if (Math.hypot(x, z) < 1e-4) continue; const k = wob(Math.atan2(z, x), s0) * 1.03; c.setX(i, x * k); c.setZ(i, z * k); }
  cap.computeVertexNormals(); put('snow', cap, 0, -0.35, 0);   // its top is the y = 0 surface; the rock top sits 8 cm lower so the two never fight
  for (let i = 0; i < Math.round(r * 1.6); i++) { const a = sr() * 6.283, k = wob(a, s0) * r * (0.9 + sr() * 0.14), s = 0.5 + sr() * 0.9; put('snow', new THREE.SphereGeometry(1, 8, 6), Math.cos(a) * k, -0.25 - sr() * 0.5, Math.sin(a) * k, 0, 0, 0, s * 1.3, s * 0.7, s * 1.3); }
  for (let i = 0; i < Math.round(r * 0.9); i++) { const a = sr() * 6.283, k = wob(a, s0) * r * (0.82 + sr() * 0.1), y = -2 - sr() * 9, s = 0.5 + sr() * 0.8; put('snow', new THREE.SphereGeometry(1, 7, 5), Math.cos(a) * k * (1 - y * 0.03), y, Math.sin(a) * k * (1 - y * 0.03), 0, 0, 0, s, s * 0.35, s); }
}

// ---------------- small houses for the far summits ----------------
function hut(owner, x, z, ry, kind, opt = {}) {
  const w = opt.w || 2.7, d = opt.d || 2.3, h = opt.h || 1.9, rh = opt.rh || 1.5;
  const save = origin; origin = worldM(x, 0, z, ry);
  const wall = kind === 'hut-white' ? 'plaster' : 'wood', roof = kind === 'hut-red' ? 'roofRed' : kind === 'hut-green' ? 'roofGreen' : 'woodDark';
  put('stone', box(w + 0.3, 0.3, d + 0.3), 0, 0.15, 0);
  put(wall, box(w, h, d), 0, 0.3 + h / 2, 0);
  put(wall, prism(w, rh * 0.86, d), 0, 0.3 + h, 0);
  put(roof, prism(w + 0.5, rh, d + 0.7), 0, 0.3 + h - 0.06, 0);
  put('snow', prism(w + 0.56, rh * 0.8, (d + 0.7) * 0.8), 0, 0.3 + h + rh * 0.2 + 0.06, 0);
  put('woodDark', box(0.6, 1.2, 0.08), -w * 0.22, 0.9, d / 2 + 0.03);
  win(owner, w * 0.2, 0.3 + h * 0.56, d / 2, 0, 0.55, 0.7);
  win(owner, w / 2, 0.3 + h * 0.56, 0, Math.PI / 2, 0.5, 0.7);
  win(owner, -w * 0.1, 0.3 + h * 0.56, -d / 2, Math.PI, 0.5, 0.7);
  if (opt.chimney) { put('stone', box(0.45, 1.5, 0.45), w * 0.25, 0.3 + h + rh * 0.55, -d * 0.12); put('snow', box(0.55, 0.1, 0.55), w * 0.25, 0.3 + h + rh * 0.55 + 0.8, -d * 0.12); smokes.push(new THREE.Vector3(w * 0.25, 0.3 + h + rh * 0.55 + 0.9, -d * 0.12).applyMatrix4(origin)); }
  if (opt.porch) { put('woodDark', box(1.3, 0.08, 0.9), -w * 0.22, 1.75, d / 2 + 0.45); for (const s of [-1, 1]) put('woodDark', box(0.08, 1.45, 0.08), -w * 0.22 + s * 0.55, 1.02, d / 2 + 0.82); put('snow', box(1.4, 0.1, 1.0), -w * 0.22, 1.84, d / 2 + 0.45); lamp(-w * 0.22, 1.5, d / 2 + 0.6, 0.2, opt.light || 0); }
  const m = origin.clone(); origin = save;
  const b = new THREE.Box3(new THREE.Vector3(-w / 2 - 0.3, 0, -d / 2 - 0.4), new THREE.Vector3(w / 2 + 0.3, 0.3 + h + rh, d / 2 + 0.4)).applyMatrix4(m);
  owners.push({ box: b, id: owner });
}

// ---------------- the lodge on the main summit ----------------
function buildLodge() {
  summit(SUMMIT_R, 11);
  const [keep, tower, wing, stall] = BUILDINGS, ky = keep.y0, kx = keep.cx, kz = keep.cz, hw = keep.w / 2, hd = keep.d / 2, f1 = 2.7;
  // stone base, deck, railing with a string of lights
  const dw = keep.w + 3.6, dd = keep.d + 3.4;
  put('stone', box(dw, DECK_Y - 0.12, dd), kx, (DECK_Y - 0.12) / 2, kz);
  put('plank', box(dw + 0.2, 0.14, dd + 0.2), kx, DECK_Y - 0.06, kz);
  const rail = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 1.3)), ry = Math.atan2(-(z1 - z0), x1 - x0);
    for (let i = 0; i <= n; i++) { const k = i / n; put('woodDark', box(0.1, 0.95, 0.1), x0 + (x1 - x0) * k, DECK_Y + 0.47, z0 + (z1 - z0) * k); put('snow', box(0.16, 0.06, 0.16), x0 + (x1 - x0) * k, DECK_Y + 0.98, z0 + (z1 - z0) * k); }
    put('woodDark', box(len, 0.08, 0.08), (x0 + x1) / 2, DECK_Y + 0.9, (z0 + z1) / 2, ry); put('woodDark', box(len, 0.05, 0.05), (x0 + x1) / 2, DECK_Y + 0.45, (z0 + z1) / 2, ry);
    for (let i = 0; i < n; i++) for (let j = 1; j <= 3; j++) { const k = (i + j / 4) / n, sag = Math.sin((j / 4) * Math.PI) * 0.16; bulbs.push(new THREE.Vector3(x0 + (x1 - x0) * k, DECK_Y + 0.84 - sag, z0 + (z1 - z0) * k)); }
  };
  const ex = dw / 2, ez = dd / 2;
  rail(kx - ex, kz + ez, kx - 1.1, kz + ez); rail(kx + 1.1, kz + ez, kx + ex, kz + ez);
  rail(kx + ex, kz + ez, kx + ex, kz + 3.9); rail(kx - ex, kz + ez, kx - ex, kz - 0.2);
  rail(kx + ex, kz - ez, kx - 2.6, kz - ez); rail(kx + ex, kz - 1.9, kx + ex, kz - ez);
  for (let i = 0; i < 4; i++) { put('plank', box(2.1, 0.16, 0.42), kx, DECK_Y - 0.14 - i * 0.2, kz + ez + 0.3 + i * 0.4); put('snow', box(2.1, 0.04, 0.2), kx, DECK_Y - 0.05 - i * 0.2, kz + ez + 0.42 + i * 0.4); }

  // main house: log ground floor, plaster upper floor with dark timbers, steep red roof under snow
  put('wood', box(keep.w, f1, keep.d), kx, ky + f1 / 2, kz);
  put('plaster', box(keep.w - 0.06, keep.wallH - f1, keep.d - 0.06), kx, ky + f1 + (keep.wallH - f1) / 2, kz);
  put('woodDark', box(keep.w + 0.16, 0.2, keep.d + 0.16), kx, ky + f1, kz);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put('woodDark', box(0.22, keep.wallH, 0.22), kx + sx * hw, ky + keep.wallH / 2, kz + sz * hd);
  for (const x of [-2.2, 0.2, 2.6]) for (const sz of [-1, 1]) put('woodDark', box(0.12, keep.wallH - f1, 0.06), kx + x, ky + f1 + (keep.wallH - f1) / 2, kz + sz * (hd + 0.0));
  put('plaster', prism(keep.w - 0.06, keep.roofH * 0.82, keep.d - 0.06), kx, ky + keep.wallH, kz);
  put('roofRed', prism(keep.w + 1.3, keep.roofH, keep.d + 1.6), kx, ky + keep.wallH - 0.12, kz);
  put('snow', prism(keep.w + 1.36, keep.roofH * 0.8, (keep.d + 1.6) * 0.8), kx, ky + keep.wallH + keep.roofH * 0.2 + 0.04, kz);
  for (const sz of [-1, 1]) put('snow', box(keep.w + 1.3, 0.12, 0.3), kx, ky + keep.wallH - 0.12, kz + sz * (keep.d / 2 + 0.78), 0, sz * 0.72);
  // chimney
  put('stone', box(0.9, 3.0, 0.9), kx + 2.3, ky + keep.wallH + 2.2, kz - 0.9); put('snow', box(1.05, 0.14, 1.05), kx + 2.3, ky + keep.wallH + 3.75, kz - 0.9);
  smokes.push(new THREE.Vector3(kx + 2.3, ky + keep.wallH + 3.9, kz - 0.9));
  // door under the balcony, porch lamp
  put('woodDark', box(1.0, 1.9, 0.1), kx - 3.3, ky + 0.95, kz + hd + 0.04); put('plank', box(0.84, 1.74, 0.06), kx - 3.3, ky + 0.92, kz + hd + 0.09);
  lamp(kx - 2.45, ky + 1.95, kz + hd + 0.22, 0.17, 9);
  // balcony on the upper floor with an outside stair up to it
  const by = ky + f1;
  put('plank', box(3.4, 0.12, 1.3), kx - 2.9, by, kz + hd + 0.65); for (const x of [-4.5, -1.3]) put('woodDark', box(0.12, f1, 0.12), kx + x, ky + f1 / 2, kz + hd + 1.2);
  for (let i = 0; i <= 4; i++) put('woodDark', box(0.08, 0.85, 0.08), kx - 4.55 + i * 0.82, by + 0.45, kz + hd + 1.26);
  put('woodDark', box(3.4, 0.07, 0.07), kx - 2.9, by + 0.86, kz + hd + 1.26); put('snow', box(3.4, 0.05, 0.14), kx - 2.9, by + 0.92, kz + hd + 1.26);
  for (let i = 0; i < 6; i++) bulbs.push(new THREE.Vector3(kx - 4.3 + i * 0.56, by + 0.76 - Math.sin((i / 5) * Math.PI) * 0.1, kz + hd + 1.28));
  const steps = 9; for (let i = 0; i < steps; i++) { const k = (i + 0.5) / steps; put('plank', box(0.5, 0.1, 1.0), kx + 3.3 - k * 4.5, ky + k * f1, kz + hd + 0.62); }
  put('woodDark', box(4.9, 0.08, 0.08), kx + 1.05, ky + f1 / 2 + 0.9, kz + hd + 1.12, 0, 0, Math.atan2(f1, 4.5)); for (const k of [0.1, 0.5, 0.9]) put('woodDark', box(0.08, 0.95, 0.08), kx + 3.3 - k * 4.5, ky + k * f1 + 0.45, kz + hd + 1.12);
  // windows: ground floor fewer (door and stair take the front), upper floor a full row, some with shutters
  win('keep', kx - 1.4, ky + 1.45, kz + hd, 0, 0.7, 0.9, true, true);
  for (const x of [-3.3, -1.5, 0.3, 2.1, 3.7]) win('keep', kx + x, by + 1.45, kz + hd, 0, x === -3.3 ? 0.8 : 0.66, x === -3.3 ? 1.5 : 0.9, x > -3);
  for (const x of [-2.4, -0.2, 2.0, 3.8]) { win('keep', kx + x, ky + 1.45, kz - hd, Math.PI, 0.66, 0.9, false, true); win('keep', kx + x, by + 1.45, kz - hd, Math.PI, 0.66, 0.9, x > 0); }
  for (const z of [-1.6, 1.4]) { win('keep', kx - hw, by + 1.45, kz + z, -Math.PI / 2, 0.66, 0.9); win('keep', kx + hw, by + 1.45, kz + z, Math.PI / 2, 0.66, 0.9, true); }
  win('keep', kx - hw, ky + 1.45, kz + 1.6, -Math.PI / 2, 0.66, 0.9, false, true);
  for (const sz of [-1, 1]) win('keep', kx + (sz > 0 ? hw : -hw), ky + keep.wallH + 1.2, kz, sz > 0 ? Math.PI / 2 : -Math.PI / 2, 0.6, 0.7);
  owners.push({ id: 'keep', box: new THREE.Box3(new THREE.Vector3(kx - hw - 0.7, 0, kz - hd - 0.8), new THREE.Vector3(kx + hw + 0.7, ky + keep.h, kz + hd + 1.4)) });

  // round lookout tower: stone below, plaster above, a wooden gallery, red cone under snow, yellow pennant
  const tx = tower.cx, tz = tower.cz, tr = tower.w / 2;
  put('stone', cyl(tr, tr + 0.25, 4.2, 16), tx, 2.1, tz); put('plaster', cyl(tr - 0.06, tr, tower.wallH - 4.2, 16), tx, 4.2 + (tower.wallH - 4.2) / 2, tz);
  put('woodDark', cyl(tr + 0.08, tr + 0.08, 0.18, 16), tx, 4.2, tz);
  const gy = 8.0; put('plank', cyl(tr + 0.95, tr + 0.75, 0.16, 16), tx, gy, tz);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283, x = tx + Math.cos(a) * (tr + 0.85), z = tz + Math.sin(a) * (tr + 0.85); put('woodDark', box(0.08, 0.85, 0.08), x, gy + 0.5, z); put('woodDark', box(0.08, 0.9, 0.08), tx + Math.cos(a) * (tr + 0.5), gy - 0.5, tz + Math.sin(a) * (tr + 0.5), -a, 0, 0.5); for (const j of [0.33, 0.66]) { const b = ((i + j) / 12) * 6.283; bulbs.push(new THREE.Vector3(tx + Math.cos(b) * (tr + 0.87), gy + 0.86 - 0.08, tz + Math.sin(b) * (tr + 0.87))); } }
  put('woodDark', new THREE.TorusGeometry(tr + 0.85, 0.04, 5, 24), tx, gy + 0.92, tz, 0, Math.PI / 2);
  put('woodDark', cyl(tr + 0.5, tr + 0.3, 0.2, 16), tx, tower.wallH, tz);
  put('roofRed', cone(tr + 0.75, tower.roofH, 16), tx, tower.wallH + tower.roofH / 2, tz); put('snow', cone((tr + 0.75) * 0.74, tower.roofH * 0.74, 16), tx, tower.wallH + tower.roofH * (1 - 0.37) + 0.05, tz);
  put('snow', new THREE.TorusGeometry(tr + 0.7, 0.12, 5, 20), tx, tower.wallH + 0.14, tz, 0, Math.PI / 2);
  put('iron', cyl(0.03, 0.03, 1.5, 5), tx, tower.wallH + tower.roofH + 0.7, tz);
  for (let lv = 0; lv < 3; lv++) for (let i = 0; i < 4; i++) { const a = (i / 4) * 6.283 + lv * 0.9 + 0.5, y = 2.6 + lv * 2.5, rr = lv === 0 ? tr + 0.13 : tr - 0.02; win('tower', tx + Math.sin(a) * rr, y, tz + Math.cos(a) * rr, a, 0.26, 0.95); }
  for (let i = 0; i < 4; i++) { const a = (i / 4) * 6.283 + 0.2; win('tower', tx + Math.sin(a) * (tr - 0.03), gy + 1.25, tz + Math.cos(a) * (tr - 0.03), a, 0.5, 0.7); }
  lamp(tx + 1.6, gy + 1.5, tz + 1.9, 0.16, 7);
  owners.push({ id: 'tower', box: new THREE.Box3(new THREE.Vector3(tx - tr - 1, 0, tz - tr - 1), new THREE.Vector3(tx + tr + 1, tower.h, tz + tr + 1)) });

  // lower wing: woodshed and workshop under a green roof, an open porch with a woodpile
  const wx = wing.cx, wz = wing.cz, ww = wing.w, wd = wing.d, wy = wing.y0;
  put('stone', box(ww + 0.3, wy, wd + 0.3), wx, wy / 2, wz); put('wood', box(ww, wing.wallH, wd), wx, wy + wing.wallH / 2, wz);
  put('wood', prism(wd, wing.roofH * 0.84, ww), wx, wy + wing.wallH, wz, Math.PI / 2);
  put('roofGreen', prism(wd + 2.6, wing.roofH, ww + 1.2), wx, wy + wing.wallH - 0.1, wz + 0.8, Math.PI / 2); put('snow', prism(wd + 2.66, wing.roofH * 0.78, (ww + 1.2) * 0.78), wx, wy + wing.wallH + wing.roofH * 0.22 + 0.02, wz + 0.8, Math.PI / 2);
  for (const sx of [-1, 1]) put('woodDark', box(0.16, wing.wallH + 0.1, 0.16), wx + sx * (ww / 2 - 0.1), wy + wing.wallH / 2, wz + wd / 2 + 1.75);
  put('plank', box(ww, 0.12, 1.9), wx, wy + 0.02, wz + wd / 2 + 0.95);
  for (let r = 0; r < 4; r++) for (let i = 0; i < 6 - r; i++) put('wood', cyl(0.16, 0.16, 1.0, 7), wx - 1.6 + i * 0.34 + r * 0.17, wy + 0.26 + r * 0.29, wz + wd / 2 + 0.55, 0, Math.PI / 2);
  put('snow', box(2.0, 0.08, 1.05), wx - 0.9, wy + 1.4, wz + wd / 2 + 0.55);
  put('iron', cyl(0.12, 0.12, 1.6, 7), wx + 1.2, wy + wing.wallH + 1.8, wz - 1.2); smokes.push(new THREE.Vector3(wx + 1.2, wy + wing.wallH + 2.7, wz - 1.2));
  put('woodDark', box(0.9, 1.7, 0.1), wx + 1.3, wy + 0.85, wz + wd / 2 + 0.04);
  win('wing', wx - 1.2, wy + 1.55, wz + wd / 2, 0, 0.7, 0.8); win('wing', wx + ww / 2, wy + 1.5, wz - 1.0, Math.PI / 2, 0.7, 0.8, true); win('wing', wx + ww / 2, wy + 1.5, wz + 1.2, Math.PI / 2, 0.7, 0.8, true);
  win('wing', wx - 0.6, wy + 1.5, wz - wd / 2, Math.PI, 0.7, 0.8); win('wing', wx + 1.2, wy + 1.5, wz - wd / 2, Math.PI, 0.7, 0.8);
  lamp(wx + 0.2, wy + 2.35, wz + wd / 2 + 1.5, 0.18, 8);
  owners.push({ id: 'wing', box: new THREE.Box3(new THREE.Vector3(wx - ww / 2 - 0.6, 0, wz - wd / 2 - 0.6), new THREE.Vector3(wx + ww / 2 + 0.6, wy + wing.h, wz + wd / 2 + 2)) });

  // tea stall on the lower terrace: striped awning, counter, stools, a kettle, a hanging lamp
  const sx0 = stall.cx, sz0 = stall.cz;
  for (const a of [-1, 1]) for (const b of [-1, 1]) put('woodDark', box(0.1, b > 0 ? 1.9 : 2.3, 0.1), sx0 + a * 1.2, (b > 0 ? 1.9 : 2.3) / 2, sz0 + b * 0.8);
  for (let i = 0; i < 6; i++) put(i % 2 ? 'cream' : 'cloth', box(0.45, 0.05, 2.0), sx0 - 1.13 + i * 0.45, 2.14, sz0, 0, -0.2);
  put('snow', box(2.75, 0.07, 1.1), sx0, 2.28, sz0 - 0.45, 0, -0.2);
  put('plank', box(2.3, 0.9, 0.6), sx0, 0.45, sz0 - 0.3); put('plank', box(2.5, 0.08, 0.8), sx0, 0.92, sz0 - 0.3);
  put('iron', cyl(0.16, 0.2, 0.26, 8), sx0 - 0.6, 1.1, sz0 - 0.3); for (const x of [0.1, 0.45, 0.8]) put('cream', cyl(0.07, 0.05, 0.1, 7), sx0 + x, 1.01, sz0 - 0.2);
  for (const x of [-0.7, 0.6]) put('woodDark', cyl(0.2, 0.2, 0.42, 8), sx0 + x, 0.21, sz0 + 0.75);
  lamp(sx0, 1.72, sz0 + 0.1, 0.17, 8);
  owners.push({ id: 'stall', box: new THREE.Box3(new THREE.Vector3(sx0 - 1.5, 0, sz0 - 1.1), new THREE.Vector3(sx0 + 1.5, 2.6, sz0 + 1.1)) });

  // signs of life: a snowman, a sled, a path of flat stones, lantern posts, snowy pines
  put('snow', new THREE.SphereGeometry(0.5, 10, 8), -4.6, 0.42, 8.0); put('snow', new THREE.SphereGeometry(0.34, 10, 8), -4.6, 1.1, 8.0); put('cloth', cyl(0.36, 0.36, 0.1, 10), -4.6, 0.86, 8.0); put('iron', cyl(0.18, 0.2, 0.3, 8), -4.6, 1.5, 8.0);
  put('cloth', box(1.2, 0.07, 0.5), -1.4, 0.32, 9.6, 0.5); for (const s of [-1, 1]) put('woodDark', box(1.4, 0.06, 0.06), -1.4 + s * 0.1, 0.12, 9.6 + s * 0.2, 0.5);
  for (let i = 0; i < 7; i++) put('stone', cyl(0.38, 0.4, 0.08, 7), kx + Math.sin(i * 1.3) * 0.35, 0.03, kz + ez + 2.3 + i * 0.75, i);
  lantern(-2.2, 2.3, 11.2, 7); lantern(9.6, 2.2, 6.4); lantern(-9.8, 2.2, 3.4); lantern(2.4, 2.1, -9.6);
  for (const [x, z, h] of [[-10.3, -5.2, 4.6], [-8.6, -8.2, 3.6], [-3.4, -10.6, 4.9], [5.4, -9.6, 3.9], [10.2, -4.6, 4.4], [11.2, 2.6, 3.2], [-10.8, 6.4, 3.8], [7.6, 9.0, 3.3], [-7.2, 9.6, 2.8], [0.6, -11.4, 3.1]]) pineTree(x, z, h);
}

// ---------------- the seven smaller summits ----------------
const satTops = {};
function buildSatellites() {
  SATELLITES.forEach((s, i) => {
    origin = new THREE.Matrix4().makeTranslation(s.x, s.y, s.z); curSummit = s.id;
    summit(s.r, 100 + i * 17, 40);
    const ph = phaseOf(i);
    if (s.id === 'red-hut') { hut(s.id, -0.4, 0.2, 0.9, 'hut-red', { chimney: true }); lantern(2.6, 1.9, 2.2, 6); pineTree(-3.2, -2.0, 3.0); }
    if (s.id === 'white-porch') { hut(s.id, 0.2, -0.3, -0.7, 'hut-white', { porch: true, light: 7 }); pineTree(2.6, -2.4, 2.6); }
    if (s.id === 'bare-lantern') { lantern(0.2, 2.3, 0.1, 6); put('rock', new THREE.DodecahedronGeometry(0.7), -1.2, 0.3, 0.9, 0.4); put('snow', new THREE.SphereGeometry(0.6, 7, 5), -1.2, 0.72, 0.9, 0, 0, 0, 1, 0.4, 1); }
    if (s.id === 'beacon') {
      put('stone', cyl(0.95, 1.2, 4.4, 10), 0, 2.2, 0); put('woodDark', cyl(1.35, 1.2, 0.2, 10), 0, 4.4, 0); put('roofRed', cone(1.5, 1.9, 10), 0, 5.6, 0); put('snow', cone(1.1, 1.4, 10), 0, 5.9, 0);
      for (let k = 0; k < 3; k++) { const a = k * 2.1 + 0.4; win(s.id, Math.sin(a) * 1.02, 3.2, Math.cos(a) * 1.02, a, 0.3, 0.7); }
      put('iron', cyl(0.03, 0.03, 1.6, 5), 0, 7.2, 0); satTops.beacon = new THREE.Vector3(0, 7.7, 0).applyMatrix4(origin);
      owners.push({ id: s.id, box: new THREE.Box3(new THREE.Vector3(-1.6, 0, -1.6), new THREE.Vector3(1.6, 6.6, 1.6)).applyMatrix4(origin) });
    }
    if (s.id === 'hamlet-east') { hut(s.id + '-a', -2.6, 1.6, 0.5, 'hut-wood', { chimney: true }); hut(s.id + '-b', 2.4, 2.2, -0.4, 'hut-wood', { w: 2.2, d: 2.0 }); hut(s.id + '-c', 0.6, -2.8, 2.6, 'hut-green', { porch: true, light: 6 }); lantern(-0.2, 2.1, 0.4); pineTree(4.6, -1.8, 2.8); }
    if (s.id === 'hamlet-north') { hut(s.id + '-a', -3.0, 1.2, 0.3, 'hut-red', { chimney: true, w: 3.0 }); hut(s.id + '-b', 1.4, 3.0, -0.2, 'hut-wood'); hut(s.id + '-c', 2.6, -1.6, 1.2, 'hut-white', { porch: true, light: 6 }); for (const [x, z, h] of [[-4.6, -3.0, 4.0], [-2.0, -4.6, 3.3], [0.6, -5.0, 4.4], [4.8, 2.6, 3.0], [-5.6, 0.2, 3.2]]) pineTree(x, z, h); }
    if (s.id === 'cairn') {
      for (let k = 0; k < 5; k++) put('stone', cyl(0.75 - k * 0.12, 0.85 - k * 0.12, 0.3, 7), 0.2 * Math.sin(k * 2), 0.15 + k * 0.3, 0.1 * Math.cos(k * 3), k);
      put('snow', new THREE.SphereGeometry(0.3, 7, 5), 0, 1.72, 0, 0, 0, 0, 1, 0.5, 1); put('woodDark', cyl(0.04, 0.05, 3.2, 5), 0.9, 1.6, -0.4); satTops.cairn = new THREE.Vector3(0.9, 3.2, -0.4).applyMatrix4(origin);
      pineTree(-2.2, 1.0, 3.6); pineTree(1.8, 1.9, 2.7); pineTree(-0.6, -2.4, 3.1); lamp(0.5, 0.5, 0.9, 0.14);
    }
    void ph;
  });
  origin = new THREE.Matrix4(); curSummit = null;
}

// ---------------- inside the main house: one room, built apart and shown only while you are in it ----------------
const roomLampAt = [];
let fireAt = null;
function buildRoom() {
  curBins = roomBins; origin = new THREE.Matrix4();
  const { x0, x1, z0, z1, y0, y1 } = ROOM, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0, h = y1 - y0, T = 0.12;
  put('plank', box(w + 2 * T, 0.08, d + 2 * T), cx, y0 - 0.04, cz);
  put('woodDark', box(w + 2 * T, 0.1, d + 2 * T), cx, y1 + 0.05, cz);
  for (const x of [-3.6, -1.0, 1.6]) put('wood', box(0.2, 0.2, d), x, y1 - 0.1, cz);
  // a wall with openings: along x (at z = fixed) or along z (at x = fixed); holes are { c, w, yb, yt }
  const wall = (alongX, fixed, a0, a1, holes) => {
    const seg = (c, len, yb, yt) => { if (len <= 0.001 || yt - yb <= 0.001) return; alongX ? put('wood', box(len, yt - yb, T), c, (yb + yt) / 2, fixed) : put('wood', box(T, yt - yb, len), fixed, (yb + yt) / 2, c); };
    let edge = a0;
    for (const o of holes.slice().sort((p, q) => p.c - q.c)) { seg((edge + o.c - o.w / 2) / 2, o.c - o.w / 2 - edge, y0, y1); seg(o.c, o.w, y0, o.yb); seg(o.c, o.w, o.yt, y1); edge = o.c + o.w / 2; }
    seg((edge + a1) / 2, a1 - edge, y0, y1);
  };
  const W1 = { w: 0.7, yb: DECK_Y + 1.0, yt: DECK_Y + 1.9 };
  wall(true, z0 - T / 2, x0 - T, x1 + T, [-3.4, -1.2, 1.0, 2.8].map((c) => ({ c, ...W1 })));          // four windows on the moon side
  wall(true, z1 + T / 2, x0 - T, x1 + T, [{ c: -2.4, ...W1 }]);
  wall(false, x0 - T / 2, z0, z1, []);
  put('woodDark', box(0.95, 1.85, 0.06), -3.75, y0 + 0.925, z1 - 0.03); put('iron', box(0.06, 0.06, 0.06), -3.42, y0 + 0.95, z1 - 0.08);      // the door, seen from inside
  wall(false, x1 + T / 2, z0, z1, []);
  // hearth on the east wall, under the chimney
  put('stone', box(0.9, 0.12, 2.3), 2.85, y0 + 0.06, -0.9);
  for (const z of [-1.82, 0.02]) put('stone', box(0.7, 1.15, 0.36), 2.95, y0 + 0.58, z);
  put('stone', box(0.7, 0.3, 2.2), 2.95, y0 + 1.3, -0.9); put('woodDark', box(0.86, 0.09, 2.4), 2.9, y0 + 1.5, -0.9);
  put('stone', box(0.5, h - 1.55, 1.5), 3.05, y0 + 1.55 + (h - 1.55) / 2, -0.9); put('rockDark', box(0.08, 1.15, 1.5), 3.26, y0 + 0.58, -0.9);
  for (const [z, r] of [[-1.15, 0.2], [-0.7, -0.3], [-0.92, 0.5]]) put('woodDark', cyl(0.09, 0.09, 0.62, 6), 2.95, y0 + 0.22 + Math.abs(r) * 0.12, z, r, Math.PI / 2);
  put('cream', cyl(0.05, 0.05, 0.16, 6), 2.8, y0 + 1.63, -1.6); put('iron', cyl(0.11, 0.13, 0.2, 8), 2.85, y0 + 1.65, -0.2);
  fireAt = new THREE.Vector3(2.95, y0 + 0.42, -0.9);
  // rug, and the cat asleep by the fire
  put('cloth', cyl(1.05, 1.05, 0.02, 20), 0.9, y0 + 0.012, -0.5); put('cream', cyl(0.78, 0.78, 0.02, 20), 0.9, y0 + 0.018, -0.5);
  const cx2 = 1.75, cz2 = -0.55;
  put('cat', new THREE.SphereGeometry(1, 12, 9), cx2, y0 + 0.15, cz2, 0.5, 0, 0, 0.3, 0.15, 0.2);
  put('cat', new THREE.SphereGeometry(0.11, 10, 8), cx2 + 0.24, y0 + 0.16, cz2 - 0.12);
  for (const s2 of [-1, 1]) put('cat', cone(0.04, 0.08, 4), cx2 + 0.25 + s2 * 0.045, y0 + 0.27, cz2 - 0.12 + s2 * 0.045);
  put('cat', new THREE.TorusGeometry(0.2, 0.035, 5, 10, Math.PI), cx2 - 0.12, y0 + 0.05, cz2 + 0.1, 0.4, Math.PI / 2);
  // table by the west wall: lamp, teapot, two cups, an open book; two stools
  put('plank', box(0.95, 0.06, 1.25), -3.5, y0 + 0.74, 0.25); for (const a of [-1, 1]) for (const b of [-1, 1]) put('woodDark', box(0.07, 0.72, 0.07), -3.5 + a * 0.4, y0 + 0.36, 0.25 + b * 0.55);
  put('iron', cyl(0.08, 0.1, 0.05, 8), -3.65, y0 + 0.8, -0.1); put('iron', cyl(0.015, 0.015, 0.22, 5), -3.65, y0 + 0.9, -0.1); roomLampAt.push([-3.65, y0 + 1.08, -0.1, 0.085]);
  put('iron', cyl(0.1, 0.12, 0.16, 8), -3.4, y0 + 0.85, 0.55); for (const z of [0.3, 0.75]) put('cream', cyl(0.045, 0.035, 0.07, 7), -3.15, y0 + 0.805, z);
  put('cream', box(0.3, 0.02, 0.4), -3.55, y0 + 0.78, 0.3, 0.2);
  for (const [x, z] of [[-2.7, 0.0], [-3.4, 1.3]]) put('woodDark', cyl(0.19, 0.17, 0.44, 9), x, y0 + 0.22, z);
  // bed in the south-east corner
  put('woodDark', box(2.3, 0.34, 1.38), 1.75, y0 + 0.17, 2.6); put('woodDark', box(0.1, 0.9, 1.38), 2.86, y0 + 0.45, 2.6);
  put('cream', box(2.16, 0.16, 1.26), 1.72, y0 + 0.42, 2.6); put('quilt', box(1.45, 0.1, 1.3), 1.35, y0 + 0.54, 2.6); put('cream', box(0.42, 0.12, 0.7), 2.5, y0 + 0.56, 2.6);
  // bookshelf in the north-west corner
  put('woodDark', box(0.34, 1.9, 1.8), -4.22, y0 + 0.95, -2.1);
  const br = mulberry32(77), spines = ['cloth', 'roofGreen', 'flagY', 'cream', 'quilt', 'iron'];
  for (let row = 0; row < 4; row++) { put('plank', box(0.36, 0.04, 1.7), -4.2, y0 + 0.3 + row * 0.45, -2.1); let z = -2.9; while (z < -1.4) { const tW = 0.05 + br() * 0.07, tH = 0.24 + br() * 0.14; put(spines[Math.floor(br() * spines.length)], box(0.22, tH, tW), -4.08, y0 + 0.32 + row * 0.45 + tH / 2, z + tW / 2); z += tW + 0.012; if (br() < 0.12) z += 0.2; } }
  // a coat by the door, a lantern from the ceiling beam
  put('cloth', box(0.42, 0.9, 0.1), -1.2, y0 + 1.3, z1 - 0.06); put('iron', box(0.5, 0.04, 0.04), -1.2, y0 + 1.77, z1 - 0.03);
  put('iron', cyl(0.012, 0.012, 0.5, 4), -1.0, y1 - 0.45, 0.6); put('iron', box(0.2, 0.04, 0.2), -1.0, y1 - 0.7, 0.6); roomLampAt.push([-1.0, y1 - 0.86, 0.6, 0.11]);
  curBins = bins;
}

buildLodge();
buildSatellites();
buildRoom();

// merge and add
const world = new THREE.Group(); scene.add(world);
for (const [k, list] of Object.entries(bins)) {
  const mesh = new THREE.Mesh(mergeGeometries(list, false), MATS[k]);
  mesh.castShadow = k !== 'cloth' && k !== 'cream'; mesh.receiveShadow = true; world.add(mesh);
  list.forEach((g) => g.dispose());
}

const room = new THREE.Group(); room.visible = false; scene.add(room);
for (const [k, list] of Object.entries(roomBins)) { const mesh = new THREE.Mesh(mergeGeometries(list, false), MATS[k]); mesh.receiveShadow = true; room.add(mesh); list.forEach((g) => g.dispose()); }
const roomLamps = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.6, 2.2, 0.95) }), roomLampAt.length);
roomLampAt.forEach((l, i) => roomLamps.setMatrixAt(i, M4.compose(V.set(l[0], l[1], l[2]), Q.identity(), S.set(l[3], l[3] * 1.2, l[3])))); room.add(roomLamps);
const fire = new THREE.Group(); fire.position.copy(fireAt); room.add(fire);
{ const fg = new THREE.ConeGeometry(0.17, 0.5, 7); fg.translate(0, 0.25, 0);
  for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color: new THREE.Color(i === 1 ? 2.6 : 2.0, i === 1 ? 1.25 : 0.7, 0.22), transparent: true, opacity: 0.92 })); f.position.set(0, 0, (i - 1) * 0.24); fire.add(f); } }
const fireLight = new THREE.PointLight(0xff8436, 0, 10, 1.6); fireLight.position.set(fireAt.x - 0.5, fireAt.y + 0.3, fireAt.z); scene.add(fireLight);
const tableLight = new THREE.PointLight(0xffc27a, 0, 7, 1.8); tableLight.position.set(-3.5, ROOM.y0 + 1.15, 0.1); scene.add(tableLight);
const spotRings = SPOTS.map((sp) => { const r = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.27, 28), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.4, 0.6), transparent: true, opacity: 0.85, side: THREE.DoubleSide })); r.rotation.x = -Math.PI / 2; r.position.set(sp.x, ROOM.y0 + 0.03, sp.z); room.add(r); return r; });

// windows: one instanced plane each, brightness in the instance colour (values above 1 are what blooms)
const WARM = new THREE.Color(1.0, 0.56, 0.2), COLD = new THREE.Color(0.035, 0.05, 0.09), LIT = 3.4;
const states = windowStates(windows.length);
const winMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), windows.length);
windows.forEach((w, i) => winMesh.setMatrixAt(i, w.m));
const tmpC = new THREE.Color();
let hoverId = null;
const litAmt = {};                         // summit id -> 0..1, how far its lamps have come on
const dayOn = new Float32Array(windows.length).fill(1);
const stagger = windows.map((_, i) => mulberry32(900 + i)());
const amtOf = (summit, k = 0) => (summit ? clamp(litAmt[summit] * 1.6 - k * 0.6, 0, 1) : 1);
function paintWindows(t) {
  for (let i = 0; i < windows.length; i++) {
    const L = windowLevel(states[i], t, i) * dayOn[i] * amtOf(windows[i].summit, stagger[i]) * (hoverId && windows[i].owner === hoverId ? 1.5 : 1);
    tmpC.copy(COLD).lerp(WARM, Math.min(1, L * 1.4)).multiplyScalar(1 + (LIT - 1) * Math.min(1.5, L));
    if (L === 0) tmpC.copy(COLD);
    winMesh.setColorAt(i, tmpC);
  }
  winMesh.instanceColor.needsUpdate = true;
}
paintWindows(0); scene.add(winMesh);

const lampMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), lamps.length);
const LAMP_ON = new THREE.Color(4.2, 2.3, 0.8), LAMP_OFF = new THREE.Color(0.06, 0.06, 0.08);
lamps.forEach((l, i) => { lampMesh.setMatrixAt(i, l.m); lampMesh.setColorAt(i, LAMP_ON); }); scene.add(lampMesh);
const bulbMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 6, 5), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.6, 2.2, 0.9) }), bulbs.length);
bulbs.forEach((b, i) => bulbMesh.setMatrixAt(i, M4.makeTranslation(b.x, b.y, b.z))); scene.add(bulbMesh);
const liveLights = pointLights.sort((a, b) => b.i - a.i).slice(0, 8).map((l) => { const p = new THREE.PointLight(0xffa860, l.i * 2.2, 15, 1.8); p.position.copy(l.p); scene.add(p); return { p, base: l.i * 2.2, summit: l.summit }; });

// pennants and the flag lines to the two hamlets
const pennants = [];
function pennant(top, phase, mat = 'flagY', s = 1) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, -0.5 * s, 0, 0.95 * s, -0.25 * s, 0]), 3)); g.computeVertexNormals();
  const m = new THREE.Mesh(g, MATS[mat]); m.position.copy(top); scene.add(m); pennants.push({ m, phase });
}
const tw = BUILDINGS[1];
pennant(new THREE.Vector3(tw.cx, tw.wallH + tw.roofH + 1.42, tw.cz), 0.3, 'flagY', 1.1);
pennant(new THREE.Vector3(BUILDINGS[0].cx - BUILDINGS[0].w / 2 - 0.5, DECK_Y + 9.2, 0), 1.7, 'flagY', 0.7);
if (satTops.beacon) pennant(satTops.beacon, 2.9, 'flagY', 0.9);
if (satTops.cairn) pennant(satTops.cairn, 4.4, 'cloth', 0.8);
{ const p = new THREE.Mesh(cyl(0.03, 0.03, 1.0, 5), MATS.iron); p.position.set(BUILDINGS[0].cx - BUILDINGS[0].w / 2 - 0.5, DECK_Y + 8.75, 0); scene.add(p); }
const FLAG_COLORS = [0x3d6fd1, 0xf0ede2, 0xc9423a, 0x3a9a63, 0xe9b93a].map((c) => new THREE.Color(c));
const flagItems = [];
for (const line of FLAG_LINES) {
  const s = SATELLITES.find((q) => q.id === line.to), a = new THREE.Vector3(...line.from), b = new THREE.Vector3(s.x, s.y + 2.6, s.z).add(new THREE.Vector3(-s.x, 0, -s.z).setLength(s.r * 0.7));
  const len = a.distanceTo(b), n = Math.floor(len / 0.95), sag = len * 0.085, pts = [];
  for (let i = 0; i <= n; i++) { const k = i / n, p = a.clone().lerp(b, k); p.y -= Math.sin(k * Math.PI) * sag; pts.push(p); if (i > 0 && i < n) flagItems.push({ p, ry: Math.atan2(b.x - a.x, b.z - a.z), i }); }
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x8a94ac, transparent: true, opacity: 0.6 })));
  put('woodDark', cyl(0.06, 0.08, 2.6, 6), b.x, s.y + 1.3, b.z);
}
const flagGeo = new THREE.PlaneGeometry(0.42, 0.5); flagGeo.translate(0, -0.25, 0);
const flagMesh = new THREE.InstancedMesh(flagGeo, new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide }), flagItems.length);
flagItems.forEach((f, i) => flagMesh.setColorAt(i, FLAG_COLORS[f.i % 5])); scene.add(flagMesh);
const lineBulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 6, 5), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 2.1, 0.9) }), flagItems.length);
flagItems.forEach((f, i) => lineBulbs.setMatrixAt(i, M4.makeTranslation(f.p.x, f.p.y + 0.06, f.p.z))); lineBulbs.visible = false; scene.add(lineBulbs);
{ // the two posts added after the merge loop above
  const extra = bins.woodDark.slice(-FLAG_LINES.length); const m = new THREE.Mesh(mergeGeometries(extra, false), MATS.woodDark); m.castShadow = true; world.add(m);
}

// ---------------- sky, moon, stars, clouds, snow, smoke ----------------
const moonDir = new THREE.Vector3(...MOON_DIR);
const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { uMoon: { value: moonDir }, uLow: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uTop: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() }, uGlowDir: { value: new THREE.Vector3(1, 0, 0) }, uMoonA: { value: 1 } },
  vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }',
  fragmentShader: `varying vec3 vD; uniform vec3 uMoon, uLow, uMid, uTop, uGlow, uGlowDir; uniform float uMoonA;
    void main(){ vec3 d = normalize(vD); float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
      vec3 c = mix(uLow, uMid, smoothstep(0.42, 0.62, h)); c = mix(c, uTop, smoothstep(0.6, 0.95, h));
      // the side of the sky where the sun has just gone or is about to come: a warm band low on the horizon
      float side = max(dot(normalize(vec3(d.x, 0.0, d.z) + 1e-5), normalize(vec3(uGlowDir.x, 0.0, uGlowDir.z))), 0.0);
      c += uGlow * pow(side, 2.5) * (1.0 - smoothstep(-0.05, 0.42, d.y)) * 0.75;
      float m = max(dot(d, uMoon), 0.0); c += (vec3(0.1, 0.13, 0.2) * pow(m, 14.0) * 0.4 + vec3(0.22, 0.27, 0.38) * pow(m, 160.0) * 0.5) * uMoonA;
      gl_FragColor = vec4(c, 1.0); }`,
}));
sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);
const moonTex = canvasTex(256, 256, (g, w) => {
  const gr = g.createRadialGradient(w * 0.42, w * 0.4, 10, w / 2, w / 2, w / 2); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.8, '#e6ebf5'); gr.addColorStop(1, '#c9d2e4');
  g.fillStyle = gr; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 2, 0, 7); g.fill();
  const mr = mulberry32(3); for (let i = 0; i < 26; i++) { const a = mr() * 7, r = mr() * w * 0.4, s = 5 + mr() * 24; g.fillStyle = `rgba(150,162,188,${0.1 + mr() * 0.16})`; g.beginPath(); g.arc(w / 2 + Math.cos(a) * r, w / 2 + Math.sin(a) * r, s, 0, 7); g.fill(); }
});
const moon = new THREE.Mesh(new THREE.CircleGeometry(27, 48), new THREE.MeshBasicMaterial({ map: moonTex, color: new THREE.Color(1.18, 1.22, 1.34), transparent: true, fog: false, depthWrite: false }));
let stars;
moon.position.copy(moonDir).multiplyScalar(520); moon.lookAt(0, 0, 0); moon.renderOrder = -9; scene.add(moon);
{ const n = 420, pos = new Float32Array(n * 3), sr = mulberry32(5); for (let i = 0; i < n; i++) { const a = sr() * 6.283, y = 0.08 + sr() * 0.9, r = Math.sqrt(1 - y * y); pos.set([Math.cos(a) * r * 560, y * 560, Math.sin(a) * r * 560], i * 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xbfd0ff, size: 1.5, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.75, depthWrite: false })); stars.renderOrder = -8; scene.add(stars); }

// clouds: camera-facing soft puffs, one draw call. A sea below the summits, plus thinner layers at other depths.
const cloudU = { uTime: { value: 0 }, uFog: { value: FOG }, uMoon: { value: moonDir }, uTint: { value: new THREE.Color(1, 1, 1) } };
function cloudLayer(n, place, opacity) {
  const base = new THREE.PlaneGeometry(2, 2), g = new THREE.InstancedBufferGeometry(); g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
  const off = new Float32Array(n * 4), par = new Float32Array(n * 3), cr2 = mulberry32(n * 13 + 1);
  for (let i = 0; i < n; i++) { const p = place(cr2); off.set(p, i * 4); par.set([cr2(), 0.5 + cr2() * 0.9, cr2() * 6.283], i * 3); }
  g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4)); g.setAttribute('aPar', new THREE.InstancedBufferAttribute(par, 3)); g.instanceCount = n;
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { ...cloudU, uOp: { value: opacity } },
    vertexShader: `attribute vec4 aOff; attribute vec3 aPar; uniform float uTime; varying vec2 vUv; varying float vFog; varying float vSeed; varying vec3 vW;
      void main(){ vUv = uv; vSeed = aPar.x; vec3 c = aOff.xyz; c.x = mod(c.x + uTime * (0.35 + aPar.y * 0.4) + 190.0, 380.0) - 190.0; c.y += sin(uTime * 0.07 + aPar.z) * 0.6; vW = c;
        vec4 mv = modelViewMatrix * vec4(c, 1.0); mv.xy += position.xy * aOff.w * vec2(1.0, 0.62); vFog = 1.0 - exp(-0.0055 * 0.0055 * mv.z * mv.z * 0.6); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uFog, uTint; uniform float uOp; varying vec2 vUv; varying float vFog; varying float vSeed; varying vec3 vW;
      void main(){ vec2 p = vUv * 2.0 - 1.0; float d = length(p); float a = smoothstep(1.0, 0.15, d); a *= a;
        float lump = 0.82 + 0.18 * sin(p.x * 5.0 + vSeed * 20.0) * sin(p.y * 4.0 + vSeed * 9.0);
        vec3 c = mix(vec3(0.045, 0.062, 0.125), vec3(0.23, 0.29, 0.44), smoothstep(-0.7, 0.9, p.y)) * lump * uTint; c = mix(c, uFog, clamp(vFog, 0.0, 0.92));
        float edge = smoothstep(190.0, 150.0, abs(vW.x));
        gl_FragColor = vec4(c, a * uOp * edge * (1.0 - vFog * 0.55)); }`,
  }));
  m.frustumCulled = false; m.renderOrder = 5; scene.add(m);
}
cloudLayer(300, (r) => { const a = r() * 6.283, d = 18 + Math.sqrt(r()) * 175; return [Math.cos(a) * d, CLOUD_Y - 4 - r() * 6, Math.sin(a) * d, 16 + r() * 24]; }, 0.48);
cloudLayer(90, (r) => { const a = r() * 6.283, d = 6 + r() * 60; return [Math.cos(a) * d, CLOUD_Y - 7 - r() * 6, Math.sin(a) * d, 18 + r() * 18]; }, 0.52);
cloudLayer(34, (r) => { const a = r() * 6.283, d = 60 + r() * 110; return [Math.cos(a) * d, -4 + r() * 22, Math.sin(a) * d, 14 + r() * 20]; }, 0.07);

// light snow
{ const n = 900, pos = new Float32Array(n * 3), sr = mulberry32(21); for (let i = 0; i < n; i++) pos.set([(sr() - 0.5) * 110, sr() * 60, (sr() - 0.5) * 110], i * 3);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.Points(g, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: cloudU,
    vertexShader: 'uniform float uTime; varying float vA; void main(){ vec3 p = position; p.y = mod(p.y - uTime * (1.1 + fract(p.x * 7.3) * 0.9), 60.0) - 14.0; p.x += sin(uTime * 0.5 + position.z) * 0.7 + uTime * 0.3; p.x = mod(p.x + 55.0, 110.0) - 55.0; vec4 mv = modelViewMatrix * vec4(p,1.0); if (p.x > -5.6 && p.x < 3.6 && abs(p.z) < 3.6 && p.y < 9.5) mv.z = 10.0; gl_PointSize = clamp(150.0 / -mv.z, 1.0, 5.0); vA = clamp(1.4 - (-mv.z) / 80.0, 0.0, 1.0); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(0.82, 0.88, 1.0, smoothstep(0.5, 0.1, d) * 0.55 * vA); }' }));
  m.frustumCulled = false; m.renderOrder = 6; scene.add(m); }

// chimney smoke: a few soft points per chimney
const SM_N = 9, smokePos = new Float32Array(smokes.length * SM_N * 3), smokeSeed = new Float32Array(smokes.length * SM_N);
{ const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(smokePos, 3)); g.setAttribute('aS', new THREE.BufferAttribute(smokeSeed, 1));
  for (let i = 0; i < smokeSeed.length; i++) smokeSeed[i] = (i % SM_N) / SM_N;
  smokes.forEach((s, i) => { for (let j = 0; j < SM_N; j++) smokePos.set([s.x, s.y, s.z], (i * SM_N + j) * 3); });
  const m = new THREE.Points(g, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: cloudU,
    vertexShader: 'attribute float aS; uniform float uTime; varying float vK; void main(){ float k = fract(aS + uTime * 0.085); vK = k; vec3 p = position + vec3(k * k * 2.6 + sin(k * 9.0 + aS * 30.0) * 0.18, k * 4.6, sin(k * 6.0 + aS * 11.0) * 0.2); vec4 mv = modelViewMatrix * vec4(p,1.0); gl_PointSize = (0.5 + k * 2.3) * 620.0 / -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying float vK; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(0.5, 0.55, 0.68, smoothstep(0.5, 0.0, d) * 0.22 * sin(vK * 3.1416)); }' }));
  m.frustumCulled = false; m.renderOrder = 7; scene.add(m); }

// shooting stars for the finale: line segments high on the moon side of the sky
const METEORS = 18, meteorPos = new Float32Array(METEORS * 6), meteorCol = new Float32Array(METEORS * 6), meteorSpec = [];
{ const mr = mulberry32(55), up3 = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < METEORS; i++) {
    const az = Math.atan2(MOON_DIR[0], MOON_DIR[2]) + (mr() - 0.5) * 1.5, el = 0.2 + mr() * 0.42;
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)), side = new THREE.Vector3().crossVectors(dir, up3).normalize();
    meteorSpec.push({ t0: 1.6 + i * 0.42 + mr() * 0.5, dur: 0.75 + mr() * 0.5, from: dir.clone().multiplyScalar(520), vel: side.multiplyScalar((mr() < 0.5 ? -1 : 1) * (0.5 + mr() * 0.5)).add(new THREE.Vector3(0, -0.7, 0)).normalize().multiplyScalar(120 + mr() * 60), len: 34 + mr() * 30 });
  } }
const meteorGeo = new THREE.BufferGeometry(); meteorGeo.setAttribute('position', new THREE.BufferAttribute(meteorPos, 3)); meteorGeo.setAttribute('color', new THREE.BufferAttribute(meteorCol, 3));
const meteors = new THREE.LineSegments(meteorGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
meteors.frustumCulled = false; meteors.renderOrder = -7; meteors.visible = false; scene.add(meteors);
function paintMeteors(ft) {
  for (let i = 0; i < METEORS; i++) {
    const m = meteorSpec[i], k = (ft - m.t0) / m.dur, on = k > 0 && k < 1, a = on ? Math.sin(k * Math.PI) : 0;
    V.copy(m.from).addScaledVector(m.vel, Math.max(0, ft - m.t0)); meteorPos.set([V.x, V.y, V.z], i * 6);
    S.copy(m.vel).normalize().multiplyScalar(-m.len * a).add(V); meteorPos.set([S.x, S.y, S.z], i * 6 + 3);
    meteorCol.set([4.5 * a, 4.6 * a, 5.2 * a, 0, 0, 0], i * 6);
  }
  meteorGeo.attributes.position.needsUpdate = true; meteorGeo.attributes.color.needsUpdate = true;
}

// ---------------- light ----------------
const moonLight = new THREE.DirectionalLight(0x9fb9ff, 2.3);
moonLight.target.position.set(0, 2, 0);
moonLight.position.set(MOON_DIR[0], 0.5, MOON_DIR[2]).normalize().multiplyScalar(80);   // the light sits higher than the disc: shorter, cleaner shadows moonLight.target.position.set(0, 2, 0);
moonLight.castShadow = true; moonLight.shadow.mapSize.set(2048, 2048);
Object.assign(moonLight.shadow.camera, { left: -30, right: 30, top: 30, bottom: -24, near: 10, far: 170 }); moonLight.shadow.bias = -0.0012; moonLight.shadow.normalBias = 0.09;
scene.add(moonLight, moonLight.target);
const hemi = new THREE.HemisphereLight(0x4f69ad, 0x0d1018, 0.6); scene.add(hemi);
let hour = -1;
function applyHour(h) {
  if (h === hour) return; hour = h;
  const k = skyAt(h), U = sky.material.uniforms;
  U.uLow.value.setRGB(...k.low); U.uMid.value.setRGB(...k.mid); U.uTop.value.setRGB(...k.top); U.uGlow.value.setRGB(...k.glow); U.uGlowDir.value.set(...k.glowDir); U.uMoonA.value = k.moon;
  FOG.setRGB(...k.fog); cloudU.uTint.value.setRGB(...k.cloud);
  moonLight.color.setRGB(...k.key); moonLight.intensity = k.keyInt; moonLight.position.set(...k.keyDir).multiplyScalar(80);
  hemi.intensity = k.hemi; hemi.color.setRGB(k.mid[0] * 6 + 0.1, k.mid[1] * 6 + 0.12, k.mid[2] * 5 + 0.2);
  moon.material.opacity = k.moon; stars.material.opacity = 0.75 * k.stars;
  for (let i = 0; i < windows.length; i++) dayOn[i] = windowOn(i, h) ? 1 : 0;
}

// ---------------- render pipeline: bloom only reaches what is brighter than white ----------------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.5, 1.0);
composer.addPass(bloom); composer.addPass(new OutputPass());

// ---------------- camera rig, input, UI ----------------
const viewName = params.get('view'), frozen = viewName in VIEWS || params.has('u');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const rig = createRig({ u: viewName in VIEWS ? VIEWS[viewName] : parseFloat(params.get('u')) || 0, auto: !reduce && params.get('auto') !== '0' });
const fixedT = params.has('t') ? parseFloat(params.get('t')) : frozen ? 12 : null;
let aspect = 1, scale = 1, W = 1, H = 1;
// ---------------- the game: lamps, stories, the hour, going inside ----------------
const allLit = frozen || params.get('lit') === 'all';
const game = createGame(allLit ? SATELLITES.map((q) => q.id) : []);
for (const q of SATELLITES) litAmt[q.id] = game.lit.has(q.id) ? 1 : 0;
let focusId = null, pendingLight = null, finaleT = allLit ? -2 : -1, finaleDue = -1;    // finaleT: -1 not yet, >= 0 running, -2 over
let inside = false; const visit = createVisit();
let hourWant = params.has('h') ? clamp(parseFloat(params.get('h')) || 0, 0, 1) : 0.5;
const $ = (id) => document.getElementById(id);
const SCALES = [1, 0.85, 0.7, 0.55];
let scaleIdx = 0;
function resize() {
  W = innerWidth; H = innerHeight; aspect = W / H;
  const pr = Math.min(devicePixelRatio || 1, 2) * SCALES[scaleIdx]; scale = pr;
  renderer.setPixelRatio(pr); renderer.setSize(W, H, false); composer.setPixelRatio(pr); composer.setSize(W, H);
  applyProjection();
}
function applyProjection() {
  camera.aspect = aspect; camera.fov = inside ? clamp(fovFor(aspect) * 1.8, 72, 92) : fovFor(aspect); camera.near = inside ? 0.06 : 0.5; camera.updateProjectionMatrix();
  const sh = inside ? [0, 0] : shiftFor(aspect); camera.projectionMatrix.elements[8] = -sh[0]; camera.projectionMatrix.elements[9] = -sh[1]; camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}
addEventListener('resize', resize); resize();

const autoBtn = document.querySelector('[data-act="auto"]');
const syncAuto = () => autoBtn.setAttribute('aria-pressed', String(rig.auto));
syncAuto();
document.getElementById('tools').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const act = b.dataset.act;
  if (act === 'in') rig.zoom(0.86); if (act === 'out') rig.zoom(1 / 0.86); if (act === 'reset') { rig.reset(); unfocus(false); } if (act === 'auto') rig.setAuto(!rig.auto);
  if (act === 'enter') enter();
  syncAuto();
});
const chip = $('chip'), story = $('story'), hint = $('hint');
function syncChip() { chip.textContent = game.done ? '七座都亮了' : `点灯 ${game.count} / ${SATELLITES.length}`; chip.classList.toggle('done', game.done); if (game.count > 0) hint.style.opacity = '0'; }
function showStory(name, line, withBack) { $('storyName').textContent = name; $('storyLine').textContent = line; $('back').style.display = withBack ? '' : 'none'; story.classList.add('on'); document.body.classList.add('focus'); }
function hideStory() { story.classList.remove('on'); document.body.classList.remove('focus'); }
// Fly to a summit; its lamps come on when the camera arrives.
function focus(id) {
  if (inside || finaleT >= 0 || !STORIES[id]) return;
  focusId = id; pendingLight = id; rig.flyTo(focusPose(id));
  showStory(STORIES[id].name, STORIES[id].line, true);
}
function unfocus(release = true) { focusId = null; pendingLight = null; if (finaleT < 0) hideStory(); if (release) { if (rig.auto) rig.release(); else rig.flyTo(homePose(), false); } }
function lightNow(id) {
  const r = game.light(id); syncChip();
  if (r.finale) finaleDue = 3.2;        // let the seventh summit glow for a moment, then the finale
  return r;
}
function startFinale() { finaleT = 0; focusId = null; pendingLight = null; showStory('', FINALE_LINE, false); rig.flyTo(homePose(), true); lineBulbs.visible = true; meteors.visible = true; }
$('back').addEventListener('click', () => unfocus());
syncChip();

// the hour slider
const hourEl = $('hour'); hourEl.value = String(Math.round(hourWant * 1000));
hourEl.addEventListener('input', () => { hourWant = hourEl.value / 1000; });

// going inside: a short fade, then you stand in the room
const fadeEl = $('fade');
function setInside(on) {
  inside = on; room.visible = on; document.body.classList.toggle('inside', on);
  fireLight.intensity = on ? 7 : 0; tableLight.intensity = on ? 6 : 0;
  if (on) { visit.go(0); syncSpot(); hideStory(); focusId = null; pendingLight = null; }
  applyProjection();
}
function syncSpot() { $('spotName').textContent = SPOTS[visit.spot].name; spotRings.forEach((r, i) => { r.visible = i !== visit.spot; }); }
function fadeThen(fn) { fadeEl.style.opacity = '1'; setTimeout(() => { fn(); fadeEl.style.opacity = '0'; }, 380); }
function enter() { if (!inside && finaleT < 0 || finaleT === -2 && !inside) fadeThen(() => setInside(true)); }
function leave() { if (inside) fadeThen(() => setInside(false)); }
$('leave').addEventListener('click', leave);
const ptrs = new Map(); let pinch = 0;
let tapStart = null;
canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); pinch = 0; tapStart = ptrs.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 } : null; });
canvas.addEventListener('pointermove', (e) => {
  const p = ptrs.get(e.pointerId);
  if (!p) { if (e.pointerType === 'mouse') hover(e.clientX, e.clientY); return; }
  const dx = e.clientX - p[0], dy = e.clientY - p[1]; p[0] = e.clientX; p[1] = e.clientY;
  if (tapStart) { tapStart.moved += Math.abs(dx) + Math.abs(dy); if (tapStart.moved < 8) return; }      // a finger that barely moves is a tap, not a drag
  if (inside) { if (ptrs.size === 1) visit.look((dx / H) * 2.2, (dy / H) * 1.6); return; }
  if (finaleT >= 0) return;
  if (ptrs.size === 1) rig.drag((dx / H) * 3.0, (dy / H) * 2.2);
  else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) rig.zoom(clamp(pinch / d, 0.8, 1.25)); pinch = d; }
});
const up = (e) => {
  ptrs.delete(e.pointerId); pinch = 0;
  if (tapStart && e.type === 'pointerup' && tapStart.moved < 8 && performance.now() - tapStart.t < 450) onTap(e.clientX, e.clientY);
  tapStart = null;
};
function onTap(x, y) {
  if (inside) {              // tap a ring on the floor to stand there
    let best = -1, bd = 80;
    SPOTS.forEach((sp, i) => { if (i === visit.spot) return; V.set(sp.x, ROOM.y0, sp.z).project(camera); if (V.z > 1) return; const d = Math.hypot((V.x * 0.5 + 0.5) * W - x, (-V.y * 0.5 + 0.5) * H - y); if (d < bd) { bd = d; best = i; } });
    if (best >= 0) { visit.go(best); syncSpot(); }
    return;
  }
  ndc.set((x / W) * 2 - 1, -(y / H) * 2 + 1); ray.setFromCamera(ndc, camera);
  const id = pickSummit(ray.ray.origin.toArray(), ray.ray.direction.toArray());
  if (id === 'lodge') { if (focusId) unfocus(); } else if (id) focus(id);
}
canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
canvas.addEventListener('pointerleave', () => { hoverId = null; });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); if (inside || finaleT >= 0) return; rig.zoom(Math.exp(clamp(e.deltaY, -120, 120) * 0.0014)); }, { passive: false });
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), hit = new THREE.Vector3();
function hover(x, y) {
  if (inside) { hoverId = null; return; }
  ndc.set((x / W) * 2 - 1, -(y / H) * 2 + 1); ray.setFromCamera(ndc, camera);
  let best = null, bd = Infinity;
  for (const o of owners) if (ray.ray.intersectBox(o.box, hit)) { const d = hit.distanceTo(camera.position); if (d < bd) { bd = d; best = o.id; } }
  hoverId = best;
}

// ---------------- frame loop ----------------
let last = performance.now(); let t = 0, fps = 60, slow = 0, fast = 0, calls = 0, tris = 0, frames = 0;
const camV = new THREE.Vector3(), tgtV = new THREE.Vector3();
function frame() {
  const now = performance.now(), dt = Math.min((now - last) / 1000, 0.1); last = now;
  t = fixedT !== null ? fixedT : t + dt;
  const p = inside ? visit.pose() : frozen ? rig.update(0) : rig.update(dt);
  camV.set(...p.pos); tgtV.set(...p.target); camera.position.copy(camV); camera.lookAt(tgtV);
  cloudU.uTime.value = t;
  applyHour(hourWant);
  // lamps: a summit lights when the camera has arrived; brightness eases up
  if (pendingLight && rig.mode !== 'fly') { lightNow(pendingLight); pendingLight = null; }
  for (const q of SATELLITES) { const want = game.lit.has(q.id) ? 1 : 0; litAmt[q.id] = frozen ? want : litAmt[q.id] + (want - litAmt[q.id]) * Math.min(1, dt * 1.1); }
  for (let i = 0; i < lamps.length; i++) lampMesh.setColorAt(i, tmpC.copy(LAMP_OFF).lerp(LAMP_ON, amtOf(lamps[i].summit)));
  lampMesh.instanceColor.needsUpdate = true;
  for (const l of liveLights) l.p.intensity = l.base * amtOf(l.summit);
  if (finaleDue > 0) { finaleDue -= dt; if (finaleDue <= 0) startFinale(); }
  if (finaleT >= 0) { finaleT += dt; paintMeteors(finaleT); if (finaleT > 11.5) { finaleT = -2; meteors.visible = false; hideStory(); rig.release(); } }
  if (inside) { const fl = 0.8 + 0.14 * Math.sin(t * 9.1) + 0.08 * Math.sin(t * 23.7); fireLight.intensity = 7 * fl; fire.children.forEach((f, i) => { f.scale.set(1 + 0.12 * Math.sin(t * 11 + i * 2), 0.8 + 0.3 * Math.abs(Math.sin(t * 7.3 + i * 1.9)), 1); }); }
  paintWindows(t);
  for (const pn of pennants) { pn.m.rotation.y = 0.5 + Math.sin(t * 1.3 + pn.phase) * 0.35 + Math.sin(t * 3.1 + pn.phase * 2) * 0.12; pn.m.rotation.z = Math.sin(t * 2.2 + pn.phase) * 0.12; }
  for (let i = 0; i < flagItems.length; i++) { const f = flagItems[i]; M4.compose(f.p, Q.setFromEuler(E.set(Math.sin(t * 2.4 + i * 0.7) * 0.32, f.ry + Math.sin(t * 1.1 + i * 0.4) * 0.25, 0, 'YXZ')), S.set(1, 1, 1)); flagMesh.setMatrixAt(i, M4); }
  flagMesh.instanceMatrix.needsUpdate = true;
  renderer.info.reset(); composer.render();
  calls = renderer.info.render.calls; tris = renderer.info.render.triangles; frames++;
  // render scale follows the measured frame rate: down quickly, up slowly
  if (dt > 0) { fps += (1 / dt - fps) * 0.05; if (fps < 44) { slow += dt; fast = 0; } else if (fps > 57) { fast += dt; slow = 0; } else { slow = 0; fast = 0; } }
  if (!frozen && slow > 1.5 && scaleIdx < SCALES.length - 1) { scaleIdx++; slow = 0; resize(); }
  if (!frozen && fast > 12 && scaleIdx > 0) { scaleIdx--; fast = 0; resize(); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------------- hooks for acceptance ----------------
const rectOf = (el) => { const r = el.getBoundingClientRect(); return { x0: r.left / W, x1: r.right / W, y0: r.top / H, y1: r.bottom / H }; };
window.__cabin = {
  get ready() { return frames > 3; },
  state: () => ({ mode: rig.mode, auto: rig.auto, u: rig.u, cam: camera.position.toArray(), target: tgtV.toArray(), t, hover: hoverId, lit: [...game.lit], focus: focusId, finale: finaleT, inside, spot: SPOTS[visit.spot].id, hour, hold: rig.hold }),
  info: () => ({ fps, calls, tris, dpr: devicePixelRatio, pixelRatio: scale, scaleIdx, w: W, h: H, fov: camera.fov, windows: windows.length, lamps: lamps.length, bulbs: bulbs.length, lights: Math.min(pointLights.length, 8), summits: SATELLITES.length + 1 }),
  heroBox: () => screenBox(HERO_BOX, camera.position.toArray(), tgtV.toArray(), aspect),
  copyBox: () => rectOf(document.getElementById('copy')),
  uiBoxes: () => Object.fromEntries(['.brand', '.badge', '.chip', '.copy', '.tele', '.tools', '.hour', '.story', '.indoor'].filter((q) => { const el = document.querySelector(q), cs = getComputedStyle(el); return cs.display !== 'none' && cs.opacity !== '0'; }).map((s) => [s, rectOf(document.querySelector(s))])),
  jump: (u) => rig.jump(u),
  focus, unfocus, enter: (now) => (now ? setInside(true) : enter()), leave: (now) => (now ? setInside(false) : leave()),
  setHour: (h) => { hourWant = clamp(h, 0, 1); hourEl.value = String(Math.round(hourWant * 1000)); },
  goSpot: (i) => { visit.go(i); syncSpot(); },
  spotOnScreen: (i) => { V.set(SPOTS[i].x, ROOM.y0, SPOTS[i].z).project(camera); return { x: (V.x * 0.5 + 0.5) * W, y: (-V.y * 0.5 + 0.5) * H, front: V.z < 1 }; },
  summitOnScreen: (id) => { const q = SATELLITES.find((k) => k.id === id); V.set(q.x, q.y + 1.2, q.z).project(camera); return { x: (V.x * 0.5 + 0.5) * W, y: (-V.y * 0.5 + 0.5) * H, front: V.z < 1 }; },
  rig,
};
