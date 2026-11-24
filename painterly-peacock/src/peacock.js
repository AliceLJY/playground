// The bird and its stage as a Three.js scene graph, built entirely from code (no images, no models).
// Every frame, update(pose) places the parts from the pose solved in core.js; nothing here moves on its own.
// Colours are vertex colours written as sRGB hex; no instanceColor anywhere (it renders white in this setup).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { K, FEATHERS, BODY, NECK, LEG, WING, BEAK, EYE_SIZE, toWorld } from './core.js';

export const PALETTE = {
  ivory: '#efe6d3', shadow: '#5b4530', ink: '#2a2924',
  teal: '#0f4c4f', tealDeep: '#0a3436', tealLight: '#2f7f78', neck: '#165a6e', breast: '#1b5f78',
  gold: '#8c6a26', bronze: '#6e5a2a', vane: '#17504a', vaneTip: '#2f6450', thigh: '#2c3a34',
  eyeGold: '#9a7a2c', eyeTeal: '#1d7f74', eyeNavy: '#12305e',
  leg: '#8c8274', beak: '#a3988a', face: '#eee8da', wingBar: '#7f6a42', wingDark: '#3a3226', primaries: '#8a5a32',
};
// Every mesh carries a role from this list (what it is for).
export const ROLES = {
  body: 'body, breast and the small covert feathers on the lower back',
  wing: 'folded wings that open in a jump',
  'neck-seg': 'neck segments between the joints',
  'neck-joint': 'rounded neck joints',
  head: 'head, beak, face stripes, eyes and crest',
  thighs: 'feathered thighs, mostly tucked under the body',
  legs: 'bare shanks',
  feet: 'toes',
  shafts: 'train feather shafts (one instance per feather id)',
  vanes: 'train feather vanes (one instance per feather id, used for picking)',
  eyes: 'eye spots of the train feathers',
  'ground-shadow': 'shadow catcher on the ivory ground',
  paper: 'screen-space canvas grain and vignette',
};

const C = (hex) => new THREE.Color(hex);
function paint(geometry, color) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (g.attributes.uv) g.deleteAttribute('uv');
  const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    if (typeof color === 'function') c.copy(color(p.getX(i), p.getY(i), p.getZ(i))); else c.set(color);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const xf = (g, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) => g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s)));
const merge = (parts) => { const g = mergeGeometries(parts); g.computeVertexNormals(); return g; };
const hash3 = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };

// Painterly material: vertex colours broken up by elongated brush-stroke noise in object space (so strokes
// stay on the object as it moves) plus a fine static grain in screen space.
const PAINT_GLSL = `
varying vec3 vPaintP;
float pHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float pNoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(pHash(i), pHash(i + vec3(1,0,0)), f.x), mix(pHash(i + vec3(0,1,0)), pHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(pHash(i + vec3(0,0,1)), pHash(i + vec3(1,0,1)), f.x), mix(pHash(i + vec3(0,1,1)), pHash(i + vec3(1,1,1)), f.x), f.y), f.z); }
float sHash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }`;
export function paintMaterial({ brush = 0.22, scale = 18, stretch = [1, 3.5, 1], grain = 0.025, ...opts } = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, ...opts });
  m.userData.paint = { brush, scale, stretch, grain };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uBrush = { value: brush }; sh.uniforms.uBrushScale = { value: new THREE.Vector3(scale * stretch[0], scale * stretch[1], scale * stretch[2]) }; sh.uniforms.uGrain = { value: grain };
    sh.vertexShader = 'varying vec3 vPaintP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vPaintP = position;');
    sh.fragmentShader = 'uniform float uBrush; uniform vec3 uBrushScale; uniform float uGrain;\n' + PAINT_GLSL + '\n' + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
  float n1 = pNoise(vPaintP * uBrushScale), n2 = pNoise(vPaintP * uBrushScale.yxz * 0.37 + 7.0);
  diffuseColor.rgb *= 1.0 + uBrush * ((n1 - 0.5) + 0.6 * (n2 - 0.5));`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
  gl_FragColor.rgb += (sHash(floor(gl_FragCoord.xy)) - 0.5) * uGrain;`);
  };
  m.customProgramCacheKey = () => `paint-${brush}-${scale}-${stretch.join(',')}-${grain}`;
  return m;
}

// ---------- parts ----------
function bodyGeometry() {
  const teal = C(PALETTE.teal), deep = C(PALETTE.tealDeep), breast = C(PALETTE.breast), gold = C(PALETTE.gold), lightT = C(PALETTE.tealLight);
  const main = xf(new THREE.SphereGeometry(1, 30, 20), { s: [BODY.rx, BODY.ry, BODY.rz] });
  const chest = xf(new THREE.SphereGeometry(1, 22, 16), { p: [0, 0.05, 0.17], s: [0.135, 0.16, 0.19] });
  const parts = [paint(main, (x, y, z) => {
    const back = THREE.MathUtils.smoothstep(y, 0.02, 0.15) * THREE.MathUtils.smoothstep(-z, -0.05, 0.25);
    const c = deep.clone().lerp(teal, THREE.MathUtils.smoothstep(y, -0.18, 0.05)).lerp(breast, THREE.MathUtils.smoothstep(z, 0.12, 0.3) * 0.7);
    if (back > 0.2 && hash3(Math.round(x * 60), Math.round(y * 60), Math.round(z * 60)) > 0.55) c.lerp(gold, 0.55 * back);
    return c;
  }), paint(chest, (x, y) => breast.clone().lerp(deep, THREE.MathUtils.smoothstep(-y, 0.0, 0.16)))];
  // Small covert feathers over the lower back, hiding where the train quills meet the body.
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2, r = 0.03 + 0.05 * ((i * 7) % 5) / 5;
    const g = xf(new THREE.SphereGeometry(1, 8, 6), { p: [Math.cos(a) * r * 1.3, 0.155 + 0.01 * Math.sin(a * 3), -0.2 + Math.sin(a) * r], r: [-0.4, a, 0], s: [0.028, 0.012, 0.05] });
    parts.push(paint(g, i % 3 ? lightT : gold));
  }
  return merge(parts);
}
function wingGeometry() {
  const bar = C(PALETTE.wingBar), dark = C(PALETTE.wingDark), prim = C(PALETTE.primaries);
  const g = xf(new THREE.SphereGeometry(1, 20, 12), { p: [0, 0, WING.len / 2], s: [0.012, 0.075, WING.len / 2] });
  return merge([paint(g, (x, y, z) => (z > WING.len * 0.72 ? prim.clone() : Math.floor(z * 55) % 2 ? bar.clone() : dark.clone()))]);
}
function headGeometry() {
  const neck = C(PALETTE.neck), face = C(PALETTE.face), beak = C(PALETTE.beak), black = C('#141414'), crest = C(PALETTE.tealLight), crestTip = C(PALETTE.breast);
  const parts = [paint(xf(new THREE.SphereGeometry(1, 20, 14), { p: [0, 0.01, 0.045], s: [0.045, 0.05, 0.06] }), neck)];
  parts.push(paint(xf(new THREE.ConeGeometry(0.018, 0.065, 10), { p: [0, 0.0, BEAK - 0.0325], r: [Math.PI / 2, 0, 0] }), beak));
  for (const s of [-1, 1]) {
    parts.push(paint(xf(new THREE.SphereGeometry(1, 10, 8), { p: [s * 0.038, 0.022, 0.06], s: [0.008, 0.008, 0.026] }), face));
    parts.push(paint(xf(new THREE.SphereGeometry(1, 10, 8), { p: [s * 0.038, -0.004, 0.058], s: [0.008, 0.006, 0.024] }), face));
    parts.push(paint(xf(new THREE.SphereGeometry(0.009, 8, 6), { p: [s * 0.043, 0.01, 0.07] }), black));
  }
  for (let i = 0; i < 7; i++) {
    const a = (i - 3) * 0.13, h = 0.085;
    const stalk = xf(new THREE.CylinderGeometry(0.0025, 0.0025, h, 4), { p: [Math.sin(a) * h / 2, 0.05 + h / 2 * Math.cos(a) * 0.95, 0.03 - h / 2 * 0.3], r: [-0.3, 0, -a] });
    const tip = xf(new THREE.SphereGeometry(1, 8, 6), { p: [Math.sin(a) * h, 0.05 + h * Math.cos(a) * 0.95, 0.03 - h * 0.3], s: [0.01, 0.013, 0.006] });
    parts.push(paint(stalk, crest), paint(tip, crestTip));
  }
  return merge(parts);
}
function footGeometry() {
  const c = C(PALETTE.leg), parts = [];
  for (const a of [-0.45, 0, 0.45, Math.PI]) {
    const l = a === Math.PI ? 0.05 : LEG.foot;
    parts.push(paint(xf(new THREE.CylinderGeometry(0.009, 0.012, l, 6), { p: [Math.sin(a) * l / 2, 0.01, Math.cos(a) * l / 2], r: [Math.PI / 2, 0, 0] }).applyMatrix4(new THREE.Matrix4().makeRotationY(a)), c));
  }
  return merge(parts);
}
// Unit feather: y runs from the quill (0) to the tip (1) and is scaled by the feather's length; x (across the
// vane) and z (the vane's normal) are in metres.
function vaneGeometry() {
  const rows = 30, base = C(PALETTE.vane), tip = C(PALETTE.vaneTip), gold = C(PALETTE.gold), edge = C(PALETTE.tealDeep);
  const pos = [], col = [];
  const width = (v) => 0.012 + 0.07 * THREE.MathUtils.smoothstep(v, 0.12, 0.72) * (v > 0.9 ? Math.sqrt(Math.max(0, 1 - (v - 0.9) / 0.1)) : 1);
  const colour = (v, side) => base.clone().lerp(tip, THREE.MathUtils.smoothstep(v, 0.35, 0.8)).lerp(gold, 0.25 * THREE.MathUtils.smoothstep(v, 0.7, 0.95)).lerp(edge, side ? 0.45 : 0);
  for (let r = 0; r < rows; r++) {
    const v0 = 0.04 + (r / rows) * 0.96, v1 = 0.04 + ((r + 1) / rows) * 0.96;
    for (const s of [-1, 1]) {
      // loose barbs: the outer edge is ragged, like brushed strokes
      const j0 = 1 + 0.25 * (hash3(r, s, 1) - 0.5), j1 = 1 + 0.25 * (hash3(r + 1, s, 1) - 0.5);
      const a = [0, v0, 0], b = [0, v1, 0], c = [s * width(v1) * j1, v1 + 0.012, 0.006], d = [s * width(v0) * j0, v0 + 0.012, 0.006];
      const quad = s > 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
      for (const q of quad) { pos.push(...q); const cc = colour(q[1], q[0] !== 0); col.push(cc.r, cc.g, cc.b); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
function shaftGeometry() { return paint(xf(new THREE.BoxGeometry(0.006, 1, 0.006), { p: [0, 0.5, 0] }), (x, y) => C(PALETTE.bronze).lerp(C('#c9b98f'), 0.3 * (1 - y))); }
// Eye spot centred at the origin, facing ±z (drawn on both faces of the vane).
function eyeGeometry() {
  const parts = [], R = EYE_SIZE / 2;
  const ring = (rx, ry, colour, z, dy = 0) => xf(new THREE.CircleGeometry(1, 28), { p: [0, dy, z], s: [rx, ry, 1] });
  for (const face of [1, -1]) {
    const z = 0.0075 * face, flip = face < 0 ? [0, Math.PI, 0] : [0, 0, 0];
    const layers = [[R * 0.86, R, PALETTE.eyeGold, 0], [R * 0.62, R * 0.74, PALETTE.eyeTeal, 0.001], [R * 0.36, R * 0.44, PALETTE.eyeNavy, 0.002, -R * 0.08]];
    for (const [rx, ry, colour, dz, dy] of layers) {
      const g = ring(rx, ry, colour, 0, dy || 0); xf(g, { r: flip }); xf(g, { p: [0, 0, z + dz * face] });
      parts.push(paint(g, colour));
    }
  }
  return mergeGeometries(parts);
}

const NECK_SUB = 4, NECK_DRAWN = NECK.n * NECK_SUB;
// ---------- the whole bird ----------
export function buildPeacock() {
  const root = new THREE.Group(); root.name = 'peacock';
  const mk = (name, role, geometry, material, count) => {
    const m = count ? new THREE.InstancedMesh(geometry, material, count) : new THREE.Mesh(geometry, material);
    m.name = name; m.userData.role = role; m.matrixAutoUpdate = false; m.frustumCulled = false;
    if (count) m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = true; root.add(m); return m;
  };
  const featherMat = paintMaterial({ brush: 0.3, scale: 26, stretch: [3.5, 0.7, 1], side: THREE.DoubleSide, roughness: 0.6, metalness: 0.08 });
  const parts = {
    body: mk('body', 'body', bodyGeometry(), paintMaterial({ brush: 0.26, scale: 22, roughness: 0.7, metalness: 0.06 })),
    wings: [-1, 1].map(s => mk('wing-' + (s < 0 ? 'right' : 'left'), 'wing', wingGeometry(), paintMaterial({ brush: 0.18, scale: 30 }))),
    neckSeg: mk('neck-segments', 'neck-seg', paint(new THREE.CylinderGeometry(1, 1, 1, 12, 1, true), PALETTE.neck), paintMaterial({ brush: 0.25, scale: 6, roughness: 0.6, metalness: 0.1 }), NECK_DRAWN),
    neckJoint: mk('neck-joints', 'neck-joint', paint(new THREE.SphereGeometry(1, 12, 8), PALETTE.neck), paintMaterial({ brush: 0.25, scale: 6, roughness: 0.6, metalness: 0.1 }), NECK_DRAWN + 1),
    head: mk('head', 'head', headGeometry(), paintMaterial({ brush: 0.2, scale: 40, roughness: 0.6, metalness: 0.08 })),
    thighs: mk('thighs', 'thighs', paint(new THREE.SphereGeometry(0.5, 12, 8), PALETTE.thigh), paintMaterial({ brush: 0.3, scale: 30 }), 2),
    legs: mk('legs', 'legs', paint(new THREE.CylinderGeometry(1, 1, 1, 8), PALETTE.leg), paintMaterial({ brush: 0.15 }), 2),
    feet: mk('feet', 'feet', footGeometry(), paintMaterial({ brush: 0.15 }), 2),
    shafts: mk('feather-shafts', 'shafts', shaftGeometry(), paintMaterial({ brush: 0.1 }), K),
    vanes: mk('feather-vanes', 'vanes', vaneGeometry(), featherMat, K),
    eyes: mk('feather-eyes', 'eyes', eyeGeometry(), paintMaterial({ brush: 0.16, scale: 60, side: THREE.DoubleSide, roughness: 0.45, metalness: 0.15 }), K),
  };
  parts.shafts.castShadow = false; parts.eyes.castShadow = false;
  const M = new THREE.Matrix4(), X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), T = new THREE.Vector3(), Q = new THREE.Quaternion(), Sv = new THREE.Vector3();
  const setBasis = (target, x, y, z, o, i) => {
    M.makeBasis(X.set(...x), Y.set(...y), Z.set(...z)).setPosition(T.set(...o));
    if (i === undefined) target.matrix.copy(M); else target.setMatrixAt(i, M);
  };
  const up = new THREE.Vector3(0, 1, 0), A = new THREE.Vector3(), B = new THREE.Vector3();
  const segment = (im, i, a, b, r) => {
    A.set(...a); B.set(...b); const L = A.distanceTo(B);
    Q.setFromUnitVectors(up, B.clone().sub(A).normalize());
    M.compose(T.copy(A).add(B).multiplyScalar(0.5), Q, Sv.set(r, L, r)); im.setMatrixAt(i, M);
  };
  // The neck is drawn along a Catmull-Rom curve through the solver's joints, NECK_SUB short pieces per bone,
  // so the bones' corners read as one smooth S instead of a bent pipe; it tapers from 0.05 m to 0.026 m.
  // Only the drawing changes: the solver, the head frame and the beak still come from the joints themselves.
  const neckR = (u) => 0.05 - 0.024 * Math.min(1, u);
  const neckPts = Array.from({ length: NECK_DRAWN + 1 }, () => [0, 0, 0]);
  const catmull = (p0, p1, p2, p3, t, out) => {
    const t2 = t * t, t3 = t2 * t;
    for (let k = 0; k < 3; k++) out[k] = 0.5 * (2 * p1[k] + (p2[k] - p0[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t3);
    return out;
  };
  function update(pose) {
    const bf = pose.bodyFrame;
    setBasis(parts.body, bf.x, bf.y, bf.z, bf.o);
    pose.wings.forEach((w, i) => { const z = w.z, y = w.up, x = [y[1] * z[2] - y[2] * z[1], y[2] * z[0] - y[0] * z[2], y[0] * z[1] - y[1] * z[0]]; setBasis(parts.wings[i], x, y, z, w.o); });
    const n = pose.neck;
    for (let j = 0; j <= NECK_DRAWN; j++) {
      const i = Math.min(NECK.n - 1, Math.floor(j / NECK_SUB)), t = j / NECK_SUB - i;
      catmull(n[Math.max(0, i - 1)], n[i], n[i + 1], n[Math.min(NECK.n, i + 2)], t, neckPts[j]);
    }
    for (let j = 0; j < NECK_DRAWN; j++) segment(parts.neckSeg, j, neckPts[j], neckPts[j + 1], neckR((j + 0.5) / NECK_DRAWN));
    for (let j = 0; j <= NECK_DRAWN; j++) { const r = neckR(j / NECK_DRAWN); M.compose(T.set(...neckPts[j]), Q.identity(), Sv.set(r, r, r)); parts.neckJoint.setMatrixAt(j, M); }
    const h = pose.head; setBasis(parts.head, h.x, h.y, h.z, h.o);
    pose.legs.forEach((L, i) => {
      segment(parts.thighs, i, L.hip, L.knee, 0.1); segment(parts.legs, i, L.knee, L.foot, 0.017);
      const f = [Math.sin(L.heading), 0, Math.cos(L.heading)], x = [f[2], 0, -f[0]];
      setBasis(parts.feet, x, [0, 1, 0], f, L.foot, i);
    });
    for (const f of pose.feathers) {
      const F = FEATHERS[f.id], d = f.dir, s = f.side, nrm = [s[1] * d[2] - s[2] * d[1], s[2] * d[0] - s[0] * d[2], s[0] * d[1] - s[1] * d[0]];
      setBasis(parts.vanes, s, d.map(v => v * F.length), nrm, f.quill, f.id);
      setBasis(parts.shafts, s, d.map(v => v * F.length), nrm, f.quill, f.id);
      setBasis(parts.eyes, s, d, nrm, f.quill.map((v, k) => v + d[k] * F.length * F.eye), f.id);
    }
    for (const m of [parts.neckSeg, parts.neckJoint, parts.thighs, parts.legs, parts.feet, parts.shafts, parts.vanes, parts.eyes]) { m.instanceMatrix.needsUpdate = true; m.boundingSphere = null; }
    root.updateMatrixWorld(true);
  }
  return { root, parts, update };
}

export function buildStage() {
  const group = new THREE.Group(); group.name = 'stage';
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ color: PALETTE.shadow, opacity: 0.3 }));
  catcher.rotation.x = -Math.PI / 2; catcher.receiveShadow = true; catcher.name = 'ground-shadow'; catcher.userData.role = 'ground-shadow';
  group.add(catcher);
  // Screen-space canvas: weave, mottling, a warm vignette and fine grain over the whole picture.
  const paper = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)), new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: { uRes: { value: new THREE.Vector2(1, 1) }, uTint: { value: new THREE.Color(PALETTE.shadow) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform vec2 uRes; uniform vec3 uTint; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        vec2 px = vUv * uRes;
        float weave = 0.5 + 0.25 * sin(px.x * 1.9) * sin(px.y * 1.7);
        float mottle = n(vUv * vec2(5.0, 3.0)) * 0.6 + n(vUv * vec2(17.0, 9.0)) * 0.4;
        vec2 c = vUv - 0.5; float vig = smoothstep(0.38, 0.85, length(c * vec2(1.0, 1.15)));
        float grain = h(floor(px));
        float a = 0.035 * weave + 0.05 * mottle + 0.22 * vig + 0.03 * grain;
        gl_FragColor = vec4(uTint, a);
      }`,
  }));
  paper.frustumCulled = false; paper.renderOrder = 999; paper.name = 'paper'; paper.userData.role = 'paper';
  group.add(paper);
  return { group, catcher, paper };
}
export { toWorld };
