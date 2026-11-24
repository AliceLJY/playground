// The island diorama as a Three.js scene graph, built entirely from code: terrain, the cut faces of the
// block, the water body, plants, reef life and the animals. Shapes are schematic, not reconstructions.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  BLOCK, WATER, CRATER, PALETTE, height, terrainColor, islandS, fbm, mulberry, lerp, clamp, smooth, mod, CYCLE,
  vegetation, HERD, herdAt, FLYERS, flyerAt, SWIMMERS, swimmerAt, SHELLS, shellAt, SCHOOLS, schoolAt, coastRadius, ISLAND,
} from './core.js';

// Every mesh carries a layer (how it is shaded) and a role from this list (what it is for).
export const ROLES = {
  terrain: 'island, reef flat and sea floor',
  strata: 'rock layers on the four cut faces and the base of the block',
  plinth: 'display base under the block',
  'water-surface': 'sea surface with small waves',
  'water-wall': 'the cut faces of the water body',
  waterline: 'bright line where the surface meets the cut',
  lava: 'glowing pool in the crater',
  smoke: 'puffs rising from the crater',
  conifers: 'tall cone-shaped trees on the lower slopes',
  cycads: 'stout trees with a crown of fronds near the shore',
  ferns: 'ground ferns',
  rocks: 'boulders on the beach and the sea floor',
  'coral-branch': 'branching coral on the reef flat',
  'coral-mound': 'mound coral on the reef flat',
  'sea-fans': 'flat fans on the reef edge',
  'sea-lilies': 'stalked filter feeders on the reef edge',
  sponges: 'tube sponges on the drop-off',
  'herd-body': 'body of a long-necked plant-eater',
  'herd-neck': 'neck and head of a long-necked plant-eater',
  'herd-legs': 'legs of the plant-eaters',
  'flyer-body': 'body of a gliding reptile',
  'flyer-wings': 'wings of the gliding reptiles',
  'swimmer-body': 'body, neck and head of a long-necked sea reptile',
  'swimmer-flippers': 'flippers of the sea reptiles',
  shells: 'spiral-shelled swimmers',
  fish: 'two fish schools',
};
export const LAYERS = ['ground', 'plant', 'animal', 'water', 'emissive', 'air'];

const C = (hex) => new THREE.Color(hex);
// Non-indexed copy with a per-vertex colour from fn(x, y, z) or a flat colour; uv dropped so parts merge.
function paint(geometry, color) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.deleteAttribute('uv');
  const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    if (typeof color === 'function') c.copy(color(p.getX(i), p.getY(i), p.getZ(i))); else c.set(color);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const at = (g, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) => {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r, 'XYZ')), new THREE.Vector3(...s));
  return g.applyMatrix4(m);
};
const merge = (parts) => { const g = mergeGeometries(parts); g.computeVertexNormals(); return g; };
const gradient = (lo, hi, y0, y1) => { const a = C(lo), b = C(hi); return (x, y) => a.clone().lerp(b, clamp((y - y0) / (y1 - y0))); };
function mat(layer, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, flatShading: layer !== 'ground', ...opts });
  return m;
}
function mesh(name, role, layer, geometry, material) {
  const m = new THREE.Mesh(geometry, material); m.name = name; m.userData = { role, layer }; return m;
}
function instanced(name, role, layer, geometry, material, count) {
  const m = new THREE.InstancedMesh(geometry, material, count); m.name = name; m.userData = { role, layer };
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; return m;
}
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3();
function place(im, i, p, rotY = 0, s = 1, rotX = 0, rotZ = 0) {
  tmpE.set(rotX, rotY, rotZ, 'YXZ'); tmpQ.setFromEuler(tmpE);
  if (Array.isArray(s)) tmpS.set(...s); else tmpS.set(s, s, s);
  im.setMatrixAt(i, tmpM.compose(tmpV.set(...p), tmpQ, tmpS));
}

// ---- Ground: terrain, cut faces, base ----
const STEP = 1.2;
function buildTerrain() {
  const nx = Math.round((BLOCK.x1 - BLOCK.x0) / STEP), nz = Math.round((BLOCK.z1 - BLOCK.z0) / STEP);
  const g = new THREE.PlaneGeometry(BLOCK.x1 - BLOCK.x0, BLOCK.z1 - BLOCK.z0, nx, nz);
  g.rotateX(-Math.PI / 2); g.translate((BLOCK.x0 + BLOCK.x1) / 2, 0, (BLOCK.z0 + BLOCK.z1) / 2);
  const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = height(x, z); p.setY(i, y);
    c.set(terrainColor(x, z, y));
    const v = 1 + 0.12 * fbm(x * 0.5, z * 0.5);              // small speckle so flats are not one flat colour
    col.set([c.r * v, c.g * v, c.b * v], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.deleteAttribute('uv'); g.computeVertexNormals();
  return { geometry: g, nx, nz };
}
// Rock layers, slightly folded, darker with depth: the same colours on all four cuts.
export function strataColor(x, y, z) {
  const fold = 3.2 * fbm(x * 0.04 + z * 0.04, 3.1) + 1.4 * Math.sin((x - z) * 0.07);
  const band = Math.floor((y + fold - BLOCK.bottom) / 6.5), list = PALETTE.strata;
  const c = C(list[((band % list.length) + list.length) % list.length]);
  return c.multiplyScalar(lerp(0.62, 1, smooth((y - BLOCK.bottom) / 50)) * (1 + 0.1 * fbm(x * 0.6 + z * 0.6, y * 0.6)));
}
function buildCuts() {
  const parts = [];
  const edge = (pts) => {
    // pts: points along the edge in order, the face faces outward (right-hand winding when viewed from outside).
    const n = pts.length, pos = [], col = [], c = new THREE.Color(), rows = 14;
    for (let i = 0; i < n - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
      const t0 = height(x0, z0), t1 = height(x1, z1);
      for (let r = 0; r < rows; r++) {
        const a0 = lerp(t0, BLOCK.bottom, r / rows), a1 = lerp(t0, BLOCK.bottom, (r + 1) / rows), b0 = lerp(t1, BLOCK.bottom, r / rows), b1 = lerp(t1, BLOCK.bottom, (r + 1) / rows);
        const quad = [[x0, a0, z0], [x0, a1, z0], [x1, b1, z1], [x0, a0, z0], [x1, b1, z1], [x1, b0, z1]];
        for (const q of quad) { pos.push(...q); c.copy(strataColor(...q)); col.push(c.r, c.g, c.b); }
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    parts.push(g);
  };
  const along = (a, b, fixed, axis) => { const out = []; for (let v = a; Math.sign(b - a) * (b - v) >= -1e-6; v += Math.sign(b - a) * STEP) out.push(axis === 'x' ? [v, fixed] : [fixed, v]); return out; };
  edge(along(BLOCK.x0, BLOCK.x1, BLOCK.z1, 'x'));   // front
  edge(along(BLOCK.z1, BLOCK.z0, BLOCK.x1, 'z'));   // east
  edge(along(BLOCK.x1, BLOCK.x0, BLOCK.z0, 'x'));   // back
  edge(along(BLOCK.z0, BLOCK.z1, BLOCK.x0, 'z'));   // west
  const base = paint(at(new THREE.PlaneGeometry(BLOCK.x1 - BLOCK.x0, BLOCK.z1 - BLOCK.z0), { p: [(BLOCK.x0 + BLOCK.x1) / 2, BLOCK.bottom, (BLOCK.z0 + BLOCK.z1) / 2], r: [Math.PI / 2, 0, 0] }), PALETTE.strata[3]);
  base.deleteAttribute('normal'); parts.push(base);
  const g = mergeGeometries(parts.map(p => { if (p.attributes.normal) p.deleteAttribute('normal'); return p; })); g.computeVertexNormals();
  return g;
}

// ---- Water ----
const WSTEP = 2;
export const waveAt = (x, z, t) => 0.16 * Math.sin(x * 0.21 + t * 1.3) + 0.11 * Math.sin(z * 0.27 - t * 1.1 + x * 0.05) + 0.05 * Math.sin((x + z) * 0.6 + t * 2.1);
export function waterColor(x, z) {
  const floor = height(x, z);
  if (floor > -0.9) return C('#e8f3ef');                      // surf on the shore
  const shallow = C('#58cfc3'), deep = C('#1c6b97');
  return shallow.lerp(deep, smooth((-floor - 3) / 22));
}
function buildWater() {
  const nx = Math.round((BLOCK.x1 - BLOCK.x0) / WSTEP), nz = Math.round((BLOCK.z1 - BLOCK.z0) / WSTEP);
  const surf = new THREE.PlaneGeometry(BLOCK.x1 - BLOCK.x0, BLOCK.z1 - BLOCK.z0, nx, nz);
  surf.rotateX(-Math.PI / 2); surf.translate((BLOCK.x0 + BLOCK.x1) / 2, WATER, (BLOCK.z0 + BLOCK.z1) / 2); surf.deleteAttribute('uv');
  const p = surf.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const c = waterColor(p.getX(i), p.getZ(i)); col.set([c.r, c.g, c.b], i * 3); }
  surf.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const surface = mesh('water surface', 'water-surface', 'water', surf, mat('water', { transparent: true, opacity: 0.5, roughness: 0.1, depthWrite: false, flatShading: false }));
  surface.renderOrder = 3;
  // Walls: from the floor up to the surface on each cut, lighter at the top, darker in the deep.
  const top = C('#5fc3d4'), bottom = C('#0b2c4e');
  const walls = [], lineSegs = [];
  const wall = (name, pts) => {
    const pos = [], cl = [], rows = 10;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], f0 = Math.min(height(x0, z0), WATER), f1 = Math.min(height(x1, z1), WATER);
      if (f0 >= WATER && f1 >= WATER) continue;
      for (let r = 0; r < rows; r++) {
        const a0 = lerp(WATER, f0, r / rows), a1 = lerp(WATER, f0, (r + 1) / rows), b0 = lerp(WATER, f1, r / rows), b1 = lerp(WATER, f1, (r + 1) / rows);
        for (const q of [[x0, a0, z0], [x0, a1, z0], [x1, b1, z1], [x0, a0, z0], [x1, b1, z1], [x1, b0, z1]]) {
          pos.push(...q); const c = top.clone().lerp(bottom, smooth(-q[1] / 60)); cl.push(c.r, c.g, c.b);
        }
      }
      lineSegs.push(x0, WATER + 0.05, z0, x1, WATER + 0.05, z1);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3)); g.computeVertexNormals();
    const m = mesh(name, 'water-wall', 'water', g, mat('water', { transparent: true, opacity: 0.34, roughness: 0.08, depthWrite: false, side: THREE.DoubleSide, flatShading: false }));
    m.renderOrder = 2; walls.push(m);
  };
  const along = (a, b, fixed, axis) => { const out = []; for (let v = a; Math.sign(b - a) * (b - v) >= -1e-6; v += Math.sign(b - a) * WSTEP) out.push(axis === 'x' ? [v, fixed] : [fixed, v]); return out; };
  wall('water wall front', along(BLOCK.x0, BLOCK.x1, BLOCK.z1, 'x'));
  wall('water wall east', along(BLOCK.z1, BLOCK.z0, BLOCK.x1, 'z'));
  wall('water wall back', along(BLOCK.x1, BLOCK.x0, BLOCK.z0, 'x'));
  wall('water wall west', along(BLOCK.z0, BLOCK.z1, BLOCK.x0, 'z'));
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lineSegs, 3));
  const line = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#d9fbff', transparent: true, opacity: 0.85 }));
  line.name = 'waterline'; line.userData = { role: 'waterline', layer: 'water' };
  return { surface, walls, line };
}

// ---- Plants ----
function conifer() {
  const trunk = paint(at(new THREE.CylinderGeometry(0.22, 0.42, 4, 6), { p: [0, 2, 0] }), '#5a4030');
  const tiers = [[3.4, 5.2, 4.6, '#2f5a35'], [2.7, 4.4, 8.0, '#36663a'], [1.8, 3.8, 11.0, '#40733f']].map(([r, h, y, c]) => paint(at(new THREE.ConeGeometry(r, h, 7), { p: [0, y, 0] }), c));
  return merge([trunk, ...tiers]);
}
function cycad() {
  const trunk = paint(at(new THREE.CylinderGeometry(0.55, 0.75, 4.4, 7), { p: [0, 2.2, 0] }), (x, y) => C(Math.sin(y * 7) > 0.4 ? '#7a6644' : '#5f4e35'));
  const fronds = [];
  for (let k = 0; k < 10; k++) {
    const a = k / 10 * Math.PI * 2, tilt = 0.75 + 0.35 * (k % 2);
    const f = paint(new THREE.ConeGeometry(0.45, 3.4, 4), (x, y) => C('#4d6e26').lerp(C('#7a9a3a'), clamp((y + 1.7) / 3.4)));
    f.scale(1, 1, 0.25); f.translate(0, 1.7, 0); f.rotateZ(-tilt); f.rotateY(a); f.translate(0, 4.4, 0);
    fronds.push(f);
  }
  return merge([trunk, ...fronds]);
}
function fern() {
  const fronds = [];
  for (let k = 0; k < 7; k++) {
    const f = paint(new THREE.ConeGeometry(0.28, 1.6, 4), (x, y) => C('#3f6a2c').lerp(C('#6f9a40'), clamp((y + 0.8) / 1.6)));
    f.scale(1, 1, 0.3); f.translate(0, 0.8, 0); f.rotateZ(-1.0 - 0.2 * (k % 3)); f.rotateY(k / 7 * Math.PI * 2); f.translate(0, 0.25, 0);
    fronds.push(f);
  }
  return merge(fronds);
}

// ---- Reef ----
function branchCoral() {
  const parts = [], rnd = mulberry(5);
  const grow = (base, dir, len, r, depth) => {
    const end = base.clone().addScaledVector(dir, len);
    const g = new THREE.CylinderGeometry(r * 0.7, r, len, 5); g.translate(0, len / 2, 0);
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)));
    g.translate(base.x, base.y, base.z); parts.push(paint(g, depth > 1 ? '#f0955f' : '#d9774f'));
    if (depth < 2) for (let k = 0; k < 2; k++) grow(end, dir.clone().add(new THREE.Vector3(rnd() - 0.5, 0.3, rnd() - 0.5).multiplyScalar(1.2)).normalize(), len * 0.72, r * 0.7, depth + 1);
  };
  for (let k = 0; k < 3; k++) grow(new THREE.Vector3((k - 1) * 0.5, 0, 0), new THREE.Vector3((k - 1) * 0.4, 1, 0.2).normalize(), 1.2, 0.22, 0);
  return merge(parts);
}
const moundCoral = () => merge([paint(at(new THREE.IcosahedronGeometry(1, 1), { p: [0, 0.35, 0], s: [1.2, 0.7, 1.1] }), (x, y, z) => C(Math.sin(x * 9) * Math.sin(z * 9) > 0 ? '#c9a64a' : '#a9873a'))]);
function seaFan() {
  const disc = paint(at(new THREE.CircleGeometry(1.3, 9, 0, Math.PI), { p: [0, 0.3, 0] }), (x, y) => C('#b4505a').lerp(C('#e07a6a'), clamp(y / 1.6)));
  const stem = paint(at(new THREE.CylinderGeometry(0.06, 0.1, 0.4, 4), { p: [0, 0.2, 0] }), '#7a3a3e');
  return merge([disc, stem]);
}
function seaLily() {
  const stalk = paint(at(new THREE.CylinderGeometry(0.06, 0.09, 2.4, 5), { p: [0, 1.2, 0] }), '#a7845f');
  const arms = [];
  for (let k = 0; k < 6; k++) { const a = paint(new THREE.ConeGeometry(0.08, 1.1, 4), '#e2c08f'); a.translate(0, 0.55, 0); a.rotateZ(-0.6); a.rotateY(k / 6 * Math.PI * 2); a.translate(0, 2.4, 0); arms.push(a); }
  return merge([stalk, ...arms]);
}
const sponge = () => merge([paint(at(new THREE.CylinderGeometry(0.42, 0.3, 1.8, 7, 1, true), { p: [0, 0.9, 0] }), (x, y) => C('#c38d3a').lerp(C('#e0b062'), clamp(y / 1.8))), paint(at(new THREE.CylinderGeometry(0.3, 0.22, 1.2, 7, 1, true), { p: [0.6, 0.6, 0.2] }), '#b77d30')]);
const rock = () => merge([paint(at(new THREE.DodecahedronGeometry(1, 0), { s: [1.3, 0.8, 1] }), (x, y) => C('#6d655c').lerp(C('#8b8174'), clamp(y + 0.5)))]);

// ---- Animals (schematic) ----
const HERD_SHOULDER = [3.6, 5.3, 0];
function herdBody() {
  const skin = gradient('#cdbf98', '#7b6d4f', 2, 7);
  const body = paint(at(new THREE.SphereGeometry(1, 12, 8), { p: [0, 4.6, 0], s: [5.4, 2.9, 2.8] }), skin);
  const tail = paint(at(new THREE.CylinderGeometry(0.18, 1.3, 10, 7), { p: [-9.4, 3.8, 0], r: [0, 0, Math.PI / 2 + 0.12] }), skin);
  const hump = paint(at(new THREE.SphereGeometry(1, 8, 6), { p: [0.6, 6.6, 0], s: [3.2, 1.2, 1.9] }), '#6e6146');
  return merge([body, tail, hump]);
}
function herdNeck() {
  // Built around the shoulder pivot (origin), pointing forward and up.
  const skin = gradient('#cdbf98', '#7b6d4f', -1, 2);
  const neck = paint(at(new THREE.CylinderGeometry(0.5, 1.15, 8.6, 8), { p: [0, 4.3, 0] }), skin);
  const head = paint(at(new THREE.SphereGeometry(1, 8, 6), { p: [0.55, 8.8, 0], s: [1.25, 0.62, 0.62] }), '#7b6d4f');
  const g = merge([neck, head]); g.rotateZ(-0.78); return g;
}
const herdLeg = () => merge([paint(at(new THREE.CylinderGeometry(0.62, 0.72, 4.5, 7), { p: [0, -2.25, 0] }), '#6c5f45')]);
function flyerBody() {
  const b = paint(at(new THREE.SphereGeometry(1, 8, 6), { s: [1.4, 0.35, 0.35] }), '#5b4636');
  const head = paint(at(new THREE.ConeGeometry(0.28, 1.6, 5), { p: [1.9, 0.1, 0], r: [0, 0, -Math.PI / 2] }), '#6b5240');
  const crest = paint(at(new THREE.ConeGeometry(0.12, 1.0, 4), { p: [1.2, 0.55, 0], r: [0, 0, 0.9] }), '#a0482e');
  return merge([b, head, crest]);
}
function flyerWing() {
  // One wing along +Z from the body; the other is the same shape mirrored through the instance matrix.
  const g = new THREE.BufferGeometry();
  // Normalised wing: unit half-span; scaled per flyer.
  const pts = [[0.5, 0, 0.1], [-0.7, 0, 0.1], [0.15, 0.04, 0.55], [0.5, 0, 0.1], [0.15, 0.04, 0.55], [0.35, 0.06, 1.0], [0.15, 0.04, 0.55], [-0.7, 0, 0.1], [-0.15, 0.02, 0.8], [0.15, 0.04, 0.55], [-0.15, 0.02, 0.8], [0.35, 0.06, 1.0]];
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
  return paint(g, (x, y, z) => C('#8a5a44').lerp(C('#c7865c'), clamp(z)));
}
function swimmerBody() {
  const skin = gradient('#c3cdc6', '#35535e', -0.6, 0.9);
  const body = paint(at(new THREE.SphereGeometry(1, 12, 8), { s: [3.4, 1.05, 1.7] }), skin);
  const neck = paint(at(new THREE.CylinderGeometry(0.28, 0.75, 6.5, 7), { p: [5.9, 0.6, 0], r: [0, 0, -Math.PI / 2 + 0.12] }), skin);
  const head = paint(at(new THREE.SphereGeometry(1, 8, 6), { p: [9.4, 1.0, 0], s: [0.85, 0.38, 0.45] }), '#35535e');
  const tail = paint(at(new THREE.ConeGeometry(0.6, 3.4, 6), { p: [-4.6, 0, 0], r: [0, 0, Math.PI / 2] }), skin);
  return merge([body, neck, head, tail]);
}
const swimmerFlipper = () => merge([paint(at(new THREE.SphereGeometry(1, 8, 5), { p: [0, 0, 1.4], s: [0.65, 0.12, 1.6] }), '#3f5f69')]);
function shell() {
  // A coiled shell: tube along a logarithmic spiral, ribbed in two tones, with a few short arms.
  const pts = []; for (let k = 0; k <= 60; k++) { const th = k / 60 * 3.2 * Math.PI, r = 0.14 * Math.exp(0.2 * th); pts.push(new THREE.Vector3(r * Math.cos(th), r * Math.sin(th), 0)); }
  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = new THREE.TubeGeometry(curve, 48, 0.3, 6, false);
  const pos = tube.attributes.position;
  for (let i = 0; i < pos.count; i++) { const ring = Math.floor(i / 7), sc = 0.25 + ring / 48 * 1.1, c = curve.getPointAt(Math.min(1, ring / 48)); pos.setXYZ(i, c.x + (pos.getX(i) - c.x) * sc, c.y + (pos.getY(i) - c.y) * sc, c.z + (pos.getZ(i) - c.z) * sc); }
  const body = paint(tube, (x, y) => C(Math.sin(Math.atan2(y, x) * 9) > 0 ? '#d8b98a' : '#8f6b45'));
  const arms = []; for (let k = 0; k < 5; k++) { const a = paint(new THREE.ConeGeometry(0.07, 0.9, 4), '#b07a5a'); a.translate(0, -0.45, 0); a.rotateZ(-0.4 + k * 0.2); a.translate(-0.9, -0.2, (k - 2) * 0.08); arms.push(a); }
  const g = merge([body, ...arms]); g.center(); return g;
}
function fishShape() {
  const body = paint(at(new THREE.OctahedronGeometry(1, 0), { s: [0.5, 0.2, 0.1] }), (x, y) => C(y > 0 ? '#4d7a92' : '#c9dde3'));
  const tail = paint(at(new THREE.ConeGeometry(0.16, 0.3, 3), { p: [-0.6, 0, 0], r: [0, 0, Math.PI / 2], s: [1, 1, 0.3] }), '#4d7a92');
  return merge([body, tail]);
}

// ---- Placement on the reef and floor (deterministic) ----
export function reefPlacements(seed = 31) {
  const rnd = mulberry(seed), out = [];
  const pick = (type, n, ok, spacing) => {
    for (let k = 0, tries = 0; k < n && tries < n * 80; tries++) {
      const x = lerp(BLOCK.x0 + 2, BLOCK.x1 - 2, rnd()), z = lerp(BLOCK.z0 + 2, BLOCK.z1 - 2, rnd()), y = height(x, z), s = islandS(x, z);
      if (!ok(y, s) || out.some(p => Math.hypot(p.x - x, p.z - z) < spacing)) continue;
      out.push({ type, x, y, z, rot: rnd() * Math.PI * 2, scale: lerp(0.8, 1.5, rnd()) }); k++;
    }
  };
  pick('branch', 70, (y, s) => y < -2 && y > -7.5 && s > 1.05 && s < 1.48, 1.6);
  pick('mound', 50, (y, s) => y < -2 && y > -7.5 && s > 1.02 && s < 1.5, 1.8);
  pick('fan', 30, (y, s) => y < -4 && y > -16 && s > 1.3 && s < 1.6, 2.2);
  pick('lily', 40, (y, s) => y < -5 && y > -20 && s > 1.35 && s < 1.7, 1.4);
  pick('sponge', 30, (y, s) => y < -10 && y > -32 && s > 1.5 && s < 1.9, 2.4);
  pick('rock', 60, (y, s) => (y > 0.3 && y < 2.6 && s > 0.85) || y < -36, 4);
  return out;
}

export function buildIsland(seed = 7) {
  const root = new THREE.Group(); root.name = 'prehistoric island';
  const t0 = buildTerrain();
  const terrain = mesh('terrain', 'terrain', 'ground', t0.geometry, mat('ground', { roughness: 0.92 }));
  const cuts = mesh('cut faces', 'strata', 'ground', buildCuts(), mat('ground', { roughness: 0.95, flatShading: true }));
  const pw = BLOCK.x1 - BLOCK.x0 + 2 * BLOCK.plinth, pd = BLOCK.z1 - BLOCK.z0 + 2 * BLOCK.plinth;
  const plinth = mesh('plinth', 'plinth', 'ground', paint(at(new THREE.BoxGeometry(pw, 5, pd), { p: [(BLOCK.x0 + BLOCK.x1) / 2, BLOCK.bottom - 2.5, (BLOCK.z0 + BLOCK.z1) / 2] }), (x, y) => C(PALETTE.plinth).lerp(C('#4a3f36'), clamp((y - BLOCK.bottom + 5) / 5) * 0.6)), mat('ground', { roughness: 0.6, flatShading: true }));
  root.add(terrain, cuts, plinth);
  const water = buildWater(); root.add(water.surface, ...water.walls, water.line);

  // Crater: lava pool and smoke.
  // The crater is a bowl (floor 34.6 m, 37.7 m at 3 m out, rim 38.6 m at its lowest): 2.6 m of lava floods the floor
  // about 2.5 m out and the bowl walls trim the disc's edge, still well below the rim.
  const lavaY = height(CRATER[0], CRATER[2]) + 2.6;
  const lava = mesh('lava', 'lava', 'emissive', new THREE.CircleGeometry(3.4, 20).rotateX(-Math.PI / 2).translate(CRATER[0], lavaY, CRATER[2]), new THREE.MeshStandardMaterial({ color: '#100604', emissive: '#ff4400', emissiveIntensity: 2.0, roughness: 0.6 }));
  const smoke = instanced('smoke', 'smoke', 'air', new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: '#a8a199', roughness: 1, transparent: true, opacity: 0.3, depthWrite: false }), 7);
  smoke.renderOrder = 4;
  root.add(lava, smoke);

  // Plants.
  const plants = vegetation(seed), plantMeshes = {};
  for (const [type, geo, role] of [['conifer', conifer(), 'conifers'], ['cycad', cycad(), 'cycads'], ['fern', fern(), 'ferns']]) {
    const list = plants.filter(p => p.type === type);
    const im = instanced(role, role, 'plant', geo, mat('plant'), list.length);
    list.forEach((p, i) => place(im, i, [p.x, p.y - 0.3, p.z], p.rot, p.scale, p.lean, p.lean * 0.7));
    im.instanceMatrix.needsUpdate = true; plantMeshes[type] = im; root.add(im);
  }
  // Reef and floor.
  const reef = reefPlacements();
  for (const [type, geo, role] of [['branch', branchCoral(), 'coral-branch'], ['mound', moundCoral(), 'coral-mound'], ['fan', seaFan(), 'sea-fans'], ['lily', seaLily(), 'sea-lilies'], ['sponge', sponge(), 'sponges'], ['rock', rock(), 'rocks']]) {
    const list = reef.filter(p => p.type === type);
    const im = instanced(role, role, type === 'rock' ? 'ground' : 'plant', geo, mat(type === 'rock' ? 'ground' : 'plant', { flatShading: true, side: type === 'fan' ? THREE.DoubleSide : THREE.FrontSide }), list.length);
    list.forEach((p, i) => place(im, i, [p.x, p.y - (type === 'rock' ? 0.4 : 0.1), p.z], p.rot, type === 'rock' ? p.scale * 1.4 : p.scale));
    im.instanceMatrix.needsUpdate = true; root.add(im);
  }

  // Animals.
  const herdBodies = HERD.map((a, i) => { const m = mesh('herd body ' + (i + 1), 'herd-body', 'animal', herdBody(), mat('animal')); root.add(m); return m; });
  const herdNecks = HERD.map((a, i) => { const m = mesh('herd neck ' + (i + 1), 'herd-neck', 'animal', herdNeck(), mat('animal')); root.add(m); return m; });
  const legs = instanced('herd legs', 'herd-legs', 'animal', herdLeg(), mat('animal'), HERD.length * 4); root.add(legs);
  const flyerBodies = instanced('flyer bodies', 'flyer-body', 'animal', flyerBody(), mat('animal'), FLYERS.length);
  const wings = instanced('flyer wings', 'flyer-wings', 'animal', flyerWing(), mat('animal', { side: THREE.DoubleSide }), FLYERS.length * 2);
  root.add(flyerBodies, wings);
  const swimmers = SWIMMERS.map((w, i) => { const m = mesh('swimmer ' + (i + 1), 'swimmer-body', 'animal', swimmerBody(), mat('animal')); root.add(m); return m; });
  const flippers = instanced('swimmer flippers', 'swimmer-flippers', 'animal', swimmerFlipper(), mat('animal', { side: THREE.DoubleSide }), SWIMMERS.length * 4); root.add(flippers);
  const shells = instanced('shells', 'shells', 'animal', shell(), mat('animal'), SHELLS.length); root.add(shells);
  const fishCount = SCHOOLS.reduce((a, s) => a + s.n, 0);
  const fish = instanced('fish', 'fish', 'animal', fishShape(), mat('animal', { roughness: 0.4, metalness: 0.2 }), fishCount); root.add(fish);

  const surfPos = water.surface.geometry.attributes.position;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  function update(t) {
    // Waves (only near the surface; the island hides the water under it).
    for (let i = 0; i < surfPos.count; i++) surfPos.setY(i, WATER + waveAt(surfPos.getX(i), surfPos.getZ(i), t));
    surfPos.needsUpdate = true; water.surface.geometry.computeVertexNormals();
    // Smoke: seven puffs on staggered loops of 7 s, born above the rim so they never sit on the lava.
    for (let k = 0; k < 7; k++) {
      const u = mod(t / 7 + k / 7, 1), r = lerp(1.2, 6.5, u);
      place(smoke, k, [CRATER[0] + 3 * u * Math.sin(k * 2.1) + 6 * u, lavaY + 9 + 26 * u, CRATER[2] + 3 * u * Math.cos(k * 2.1) - 2 * u], k, r);
    }
    smoke.instanceMatrix.needsUpdate = true;
    // Herd.
    HERD.forEach((a, i) => {
      const h = herdAt(i, t), s = h.size, rot = -h.heading;
      herdBodies[i].position.set(...h.position); herdBodies[i].rotation.set(0, rot, 0); herdBodies[i].scale.setScalar(s);
      const sh = new THREE.Vector3(...HERD_SHOULDER).multiplyScalar(s).applyAxisAngle(up, rot).add(new THREE.Vector3(...h.position));
      herdNecks[i].position.copy(sh); herdNecks[i].rotation.set(0, rot, h.neck, 'YXZ'); herdNecks[i].scale.setScalar(s);
      [[3.1, 1.4], [3.1, -1.4], [-3.0, 1.4], [-3.0, -1.4]].forEach(([lx, lz], k) => {
        const hip = new THREE.Vector3(lx * s, 4.4 * s, lz * s).applyAxisAngle(up, rot).add(new THREE.Vector3(...h.position));
        const swing = 0.32 * Math.sin(h.step + (k === 0 || k === 3 ? 0 : Math.PI)) * (k < 2 ? 1 : -1);
        e.set(0, rot, swing, 'YXZ'); q.setFromEuler(e); legs.setMatrixAt(i * 4 + k, m4.compose(hip, q, sv.set(s, s, s)));
      });
    });
    legs.instanceMatrix.needsUpdate = true;
    // Flyers.
    FLYERS.forEach((f, i) => {
      const a = flyerAt(i, t);
      e.set(0, -a.heading, a.bank, 'YXZ'); q.setFromEuler(e); flyerBodies.setMatrixAt(i, m4.compose(v.set(...a.position), q, sv.set(1, 1, 1)));
      for (const side of [1, -1]) {
        e.set(side * a.flap, -a.heading, a.bank, 'YXZ'); q.setFromEuler(e);
        const local = new THREE.Quaternion().setFromEuler(new THREE.Euler(side * a.flap, 0, 0));
        const qq = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a.heading, a.bank, 'YXZ')).multiply(local);
        wings.setMatrixAt(i * 2 + (side > 0 ? 0 : 1), m4.compose(v.set(...a.position), qq, sv.set(a.span * 0.45, a.span * 0.45, side * a.span * 0.5)));
      }
    });
    flyerBodies.instanceMatrix.needsUpdate = true; wings.instanceMatrix.needsUpdate = true;
    // Swimmers.
    SWIMMERS.forEach((w, i) => {
      const s = swimmerAt(i, t), rot = -s.heading;
      swimmers[i].position.set(...s.position); swimmers[i].rotation.set(0, rot, 0.05 * s.stroke); swimmers[i].scale.setScalar(s.size);
      [[1.6, 1], [1.6, -1], [-1.8, 1], [-1.8, -1]].forEach(([lx, side], k) => {
        const root2 = new THREE.Vector3(lx * s.size, -0.3 * s.size, side * 1.2 * s.size).applyAxisAngle(up, rot).add(new THREE.Vector3(...s.position));
        const flap = 0.45 * s.stroke * (k < 2 ? 1 : -0.7);
        const qq = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, 0)).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(side * (0.25 + flap), side > 0 ? -0.35 : 0.35, 0)));
        flippers.setMatrixAt(i * 4 + k, m4.compose(root2, qq, sv.set(s.size, s.size, side * s.size)));
      });
    });
    flippers.instanceMatrix.needsUpdate = true;
    SHELLS.forEach((sh, k) => { const a = shellAt(k, t); place(shells, k, a.position, -a.heading, a.size, 0, 0.15 * Math.sin(t + k)); });
    shells.instanceMatrix.needsUpdate = true;
    let n = 0;
    SCHOOLS.forEach((sc, j) => { for (const f of schoolAt(j, t).members) place(fish, n++, f.position, -f.heading, 1.6); });
    fish.instanceMatrix.needsUpdate = true;
  }
  update(0);
  return { root, update, plants, reef, lavaY, parts: { terrain, cuts, water, lava, smoke, herdBodies, herdNecks, legs, flyerBodies, wings, swimmers, flippers, shells, fish, plantMeshes } };
}
