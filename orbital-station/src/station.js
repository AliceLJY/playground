// Procedural station, shuttle and robotic arm. Every mesh carries userData.layer (metal / glass /
// emissive) and userData.role (what the part is for); tests read both, so nothing is decoration.
import * as THREE from 'three';
import { RING, HUB, PORT, TRUSS, mulberry, armAt, shuttleAt, stationRcs, ringAngle, sunDir } from './core.js';

export const ROLES = {
  'ring-hull': 'pressurised habitat torus', 'ring-ribs': 'hull frames between the 24 modules', 'ring-glass': 'inner window band onto the garden',
  'ring-mullions': 'window frames', 'ring-portholes': 'cabin windows on the outer roof', 'garden-floor': 'soil and paths on the deck',
  'garden-trees': 'trees on the garden deck', 'garden-strips': 'daylight strips on the deck ceiling', 'garden-lamps': 'path lamps',
  'spokes': 'four transit spokes to the hub', 'spoke-lights': 'lift-shaft windows on the spokes', 'bearing': 'rotating collar where spokes meet the hub',
  'hub-core': 'non-rotating central hub', 'hub-blanket': 'thermal blanket band', 'port-adapter': 'docking tunnel', 'port-collar': 'docking ring',
  'port-petals': 'alignment guide petals', 'port-latches': 'capture hooks', 'latch-lights': 'hook status lights', 'port-lights': 'approach lights',
  'port-target': 'alignment target for the shuttle camera', 'rcs': 'attitude thruster quads', 'rcs-plume': 'thruster exhaust', 'engines': 'reboost engines',
  'truss': 'lattice spine to the power section', 'radiators': 'heat radiators', 'wing-booms': 'solar wing masts', 'wing-cells': 'solar cell blankets',
  'wing-frames': 'blanket frames', 'antenna': 'ground-link mast and feed', 'antenna-dish': 'ground-link reflector (painted)', 'arm': 'robotic arm', 'arm-light': 'arm work light',
  'shuttle-hull': 'shuttle pressure hull', 'shuttle-ring': 'shuttle docking ring', 'shuttle-glass': 'shuttle windows', 'shuttle-cabin': 'lit cabin behind windows',
  'shuttle-engine': 'shuttle main engine', 'shuttle-fins': 'shuttle radiator fins', 'nav-lights': 'red/green/white navigation lights', 'shuttle-rcs': 'shuttle thrusters',
  'shuttle-plume': 'shuttle thruster exhaust',
};
const D = Math.PI / 180;

// Procedural panel seams, per-panel tint, wear and roughness variation for metal (no textures).
// Mode 0 uses the lathe uv (counts per unit uv); mode 1 is triplanar on object space (size in metres).
function panelMetal(params, panel = { mode: 1, a: 2.2, b: 2.2, wear: 0.5 }) {
  const m = new THREE.MeshStandardMaterial(params);
  m.userData.panel = panel;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uPanel = { value: new THREE.Vector4(panel.mode, panel.a, panel.b, panel.wear) };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 panelUv;\nvarying vec2 vPanelUv;\nvarying vec3 vObj;\nvarying vec3 vObjN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPanelUv = panelUv; vObj = position; vObjN = normal;\n#ifdef USE_INSTANCING\nvObj = (instanceMatrix * vec4(position, 1.0)).xyz;\n#endif');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
uniform vec4 uPanel; varying vec2 vPanelUv; varying vec3 vObj; varying vec3 vObjN;
float ph(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float pn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(ph(i), ph(i + vec2(1, 0)), f.x), mix(ph(i + vec2(0, 1)), ph(i + 1.0), f.x), f.y); }
vec2 panelCoord(){
  if (uPanel.x < 0.5) return vPanelUv * uPanel.yz;
  vec3 n = abs(normalize(vObjN));
  vec3 q = vObj / uPanel.y;
  return n.x > n.y && n.x > n.z ? q.zy : (n.y > n.z ? q.xz : q.xy);
}`).replace('#include <color_fragment>', `#include <color_fragment>
vec2 pc = panelCoord(); vec2 cell = floor(pc); vec2 f = abs(fract(pc) - 0.5);
float seam = smoothstep(0.5, 0.47, max(f.x, f.y));
float tint = 0.9 + 0.14 * ph(cell);
float wear = pn(pc * 0.7 + 3.1) * pn(pc * 2.3);
diffuseColor.rgb *= mix(0.42, 1.0, seam) * tint * (1.0 - uPanel.w * 0.22 * wear);
float panelRough = 0.12 * (ph(cell + 7.0) - 0.5) + uPanel.w * 0.18 * wear + (1.0 - seam) * 0.25;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + panelRough, 0.04, 1.0);');
  };
  m.customProgramCacheKey = () => 'panel' + panel.mode;
  return m;
}
const withPanelUv = (g) => { g.setAttribute('panelUv', g.attributes.uv); return g; };

function tag(mesh, layer, role) { mesh.userData.layer = layer; mesh.userData.role = role; mesh.name = role; return mesh; }
function profileRoundRect(inner, outer, half, rc, steps = 4) {
  // Ring cross-section, open on the inner wall between the glass edges (the window slot).
  const pts = [];
  const arc = (cx, cy, a0, a1) => { for (let i = 0; i <= steps; i++) { const a = a0 + (a1 - a0) * i / steps; pts.push(new THREE.Vector2(cx + rc * Math.cos(a), cy + rc * Math.sin(a))); } };
  pts.push(new THREE.Vector2(inner, RING.glassLow));
  arc(inner + rc, -half + rc, Math.PI, 1.5 * Math.PI);
  arc(outer - rc, -half + rc, 1.5 * Math.PI, 2 * Math.PI);
  arc(outer - rc, half - rc, 0, 0.5 * Math.PI);
  arc(inner + rc, half - rc, 0.5 * Math.PI, Math.PI);
  pts.push(new THREE.Vector2(inner, RING.glassHigh));
  return pts;
}
function instanced(geometry, material, matrices, layer, role) {
  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
  return tag(mesh, layer, role);
}
const M = () => new THREE.Matrix4();
function beam(a, b, thick) {
  // Box from point a to point b, square section `thick`.
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), mid = va.clone().add(vb).multiplyScalar(0.5);
  const dir = vb.clone().sub(va), l = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return M().compose(mid, q, new THREE.Vector3(thick, l, thick));
}

export function createMaterials() {
  const hull = panelMetal({ color: '#c3c8ce', metalness: 0.72, roughness: 0.38, side: THREE.DoubleSide }, { mode: 0, a: 96, b: 7, wear: 0.6 });
  const hullDark = panelMetal({ color: '#5a6069', metalness: 0.8, roughness: 0.42 }, { mode: 1, a: 1.6, b: 1.6, wear: 0.4 });
  const frame = new THREE.MeshStandardMaterial({ color: '#3d434b', metalness: 0.85, roughness: 0.48 });
  const hubMetal = panelMetal({ color: '#b8bdc3', metalness: 0.75, roughness: 0.36 }, { mode: 1, a: 2.4, b: 2.4, wear: 0.55 });
  const blanket = panelMetal({ color: '#b99653', metalness: 0.55, roughness: 0.55 }, { mode: 1, a: 1.1, b: 1.1, wear: 0.9 });
  const radiator = panelMetal({ color: '#dfe2e3', metalness: 0.15, roughness: 0.62 }, { mode: 1, a: 1.2, b: 1.2, wear: 0.3 });
  const glass = new THREE.MeshStandardMaterial({ color: '#9fd4ff', metalness: 0.1, roughness: 0.06, transparent: true, opacity: 0.26, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.6 });
  const cells = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.35, roughness: 0.22, envMapIntensity: 1.4, side: THREE.DoubleSide });
  const soil = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0, roughness: 0.95, side: THREE.DoubleSide });
  const leaf = new THREE.MeshStandardMaterial({ color: '#4f8a3c', metalness: 0, roughness: 0.85, flatShading: true });
  const bark = new THREE.MeshStandardMaterial({ color: '#6a4a33', metalness: 0, roughness: 0.9 });
  const emissive = (c, k) => new THREE.MeshStandardMaterial({ color: '#111111', emissive: c, emissiveIntensity: k, metalness: 0, roughness: 0.7 });
  return {
    hull, hullDark, frame, hubMetal, blanket, radiator, glass, cells, soil, leaf, bark,
    window: emissive('#ffc98a', 2.6), strip: emissive('#fff1d6', 3.2), lamp: emissive('#ffe2a8', 3.4), cyan: emissive('#6fe3ff', 3.0),
    latch: new THREE.MeshStandardMaterial({ color: '#111111', emissive: '#ffffff', emissiveIntensity: 2.6, metalness: 0, roughness: 0.6 }),
    plume: new THREE.MeshBasicMaterial({ color: '#cfe9ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    nav: new THREE.MeshStandardMaterial({ color: '#111111', emissive: '#ffffff', emissiveIntensity: 3, roughness: 0.6 }),
  };
}

function buildRing(mat, rng) {
  const ring = new THREE.Group(); ring.name = 'ring';
  const hull = withPanelUv(new THREE.LatheGeometry(profileRoundRect(RING.inner, RING.outer, RING.half, 2), 192));
  ring.add(tag(new THREE.Mesh(hull, mat.hull), 'metal', 'ring-hull'));
  // Glass band closing the inner slot.
  const glass = new THREE.CylinderGeometry(RING.inner - 0.05, RING.inner - 0.05, RING.glassHigh - RING.glassLow, 192, 1, true);
  glass.translate(0, (RING.glassHigh + RING.glassLow) / 2, 0);
  const glassMesh = tag(new THREE.Mesh(glass, mat.glass), 'glass', 'ring-glass'); glassMesh.renderOrder = 2; ring.add(glassMesh);
  // 24 module frames: a slightly fatter closed cross-section over 1.4 degrees of arc.
  const ribProfile = profileRoundRect(RING.inner - 0.35, RING.outer + 0.35, RING.half + 0.35, 2.3);
  ribProfile.push(new THREE.Vector2(RING.inner - 0.35, RING.glassLow));
  const rib = new THREE.LatheGeometry(ribProfile, 3, -0.7 * D, 1.4 * D);
  const ribs = []; for (let i = 0; i < 24; i++) ribs.push(M().makeRotationY(i * 15 * D));
  ring.add(instanced(rib, mat.hullDark, ribs, 'metal', 'ring-ribs'));
  const mull = [];
  for (let i = 0; i < 120; i++) { const a = i * 3 * D; mull.push(M().compose(new THREE.Vector3(Math.cos(a) * (RING.inner - 0.1), 0.4, -Math.sin(a) * (RING.inner - 0.1)), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a), new THREE.Vector3(0.22, RING.glassHigh - RING.glassLow, 0.26))); }
  ring.add(instanced(new THREE.BoxGeometry(1, 1, 1), mat.frame, mull, 'metal', 'ring-mullions'));
  // Roof portholes: three rows per module, a few cabins dark.
  const holes = [];
  for (let i = 0; i < 24; i++) for (let k = 0; k < 6; k++) for (const r of [59.6, 62.1, 64.6]) {
    if (rng() < 0.22) continue;
    const a = (i * 15 + 2.2 + k * 1.85) * D;
    holes.push(M().compose(new THREE.Vector3(Math.cos(a) * r, RING.half + 0.02, -Math.sin(a) * r), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a), new THREE.Vector3(0.55, 0.12, 0.9)));
  }
  ring.add(instanced(new THREE.BoxGeometry(1, 1, 1), mat.window, holes, 'emissive', 'ring-portholes'));
  // Garden deck on the inside of the outer wall: soil, paths and grass as vertex colours.
  const floor = new THREE.CylinderGeometry(RING.floor, RING.floor, 9.2, 256, 8, true);
  const colors = []; const pos = floor.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), a = Math.atan2(pos.getZ(i), pos.getX(i));
    const path = Math.abs(y + 0.6 * Math.sin(a * 9)) < 0.7;
    const g = 0.75 + 0.25 * Math.sin(a * 37 + y * 1.7);
    colors.push(...(path ? [0.62, 0.55, 0.45] : [0.2 * g, 0.38 * g, 0.16 * g]));
  }
  floor.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  ring.add(tag(new THREE.Mesh(floor, mat.soil), 'organic', 'garden-floor'));
  // Trees grow toward the axis. Trunks and canopies share instance matrices.
  const trunks = [], crowns = [];
  for (let i = 0; i < 260; i++) {
    const a = rng() * Math.PI * 2, y = (rng() - 0.5) * 7.4;
    if (Math.abs(y + 0.6 * Math.sin(a * 9)) < 1.3) continue;
    const h = 1.6 + rng() * 2.4, r = RING.floor - h / 2;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-Math.cos(a), 0, -Math.sin(a)));
    trunks.push(M().compose(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), q, new THREE.Vector3(0.16, h, 0.16)));
    const cr = RING.floor - h - 0.4, s = 0.8 + rng() * 0.9;
    crowns.push(M().compose(new THREE.Vector3(Math.cos(a) * cr, y, Math.sin(a) * cr), q, new THREE.Vector3(s, s * 1.25, s)));
  }
  ring.add(instanced(new THREE.CylinderGeometry(0.5, 0.7, 1, 5), mat.bark, trunks, 'organic', 'garden-trees'));
  ring.add(instanced(new THREE.IcosahedronGeometry(1, 0), mat.leaf, crowns, 'organic', 'garden-trees'));
  // Daylight strips on the deck ceiling and path lamps.
  const strips = [];
  for (let i = 0; i < 48; i++) { const a = (i * 7.5 + 3.75) * D; strips.push(M().compose(new THREE.Vector3(Math.cos(a) * 60.5, RING.half - 0.25, -Math.sin(a) * 60.5), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a), new THREE.Vector3(1.1, 0.1, 5.2))); }
  ring.add(instanced(new THREE.BoxGeometry(1, 1, 1), mat.strip, strips, 'emissive', 'garden-strips'));
  const lamps = [];
  for (let i = 0; i < 144; i++) { const a = i * 2.5 * D, y = -0.6 * Math.sin(a * 9) + (i % 2 ? 0.95 : -0.95); lamps.push(M().compose(new THREE.Vector3(Math.cos(a) * (RING.floor - 0.35), y, Math.sin(a) * (RING.floor - 0.35)), new THREE.Quaternion(), new THREE.Vector3(0.14, 0.14, 0.14))); }
  ring.add(instanced(new THREE.SphereGeometry(1, 6, 4), mat.lamp, lamps, 'emissive', 'garden-lamps'));
  // Spokes and the rotating bearing collar.
  const spokes = [], collars = [], lights = [];
  for (let i = 0; i < 4; i++) {
    const a = (i * 90 + 45) * D, c = Math.cos(a), s = -Math.sin(a);
    spokes.push(beam([c * 8.2, 0, s * 8.2], [c * (RING.inner + 0.3), 0, s * (RING.inner + 0.3)], 1));
    for (const r of [14, 26, 38, 50]) collars.push(beam([c * (r - 0.4), 0, s * (r - 0.4)], [c * (r + 0.4), 0, s * (r + 0.4)], 1));
    for (let r = 11; r < 54; r += 2.2) lights.push(M().compose(new THREE.Vector3(c * r, 1.36, s * r), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a), new THREE.Vector3(0.7, 0.08, 0.3)));
  }
  const spokeGeo = new THREE.CylinderGeometry(1.3, 1.3, 1, 18); withPanelUv(spokeGeo);
  ring.add(instanced(spokeGeo, mat.hubMetal, spokes, 'metal', 'spokes'));
  ring.add(instanced(new THREE.CylinderGeometry(1.65, 1.65, 1, 18), mat.hullDark, collars, 'metal', 'spokes'));
  ring.add(instanced(new THREE.BoxGeometry(1, 1, 1), mat.window, lights, 'emissive', 'spoke-lights'));
  const bearing = new THREE.CylinderGeometry(8.4, 8.4, 4.4, 48, 1, true);
  ring.add(tag(new THREE.Mesh(bearing, mat.hullDark), 'metal', 'bearing'));
  ring.add(tag(new THREE.Mesh(new THREE.TorusGeometry(8.4, 0.5, 8, 48).rotateX(Math.PI / 2).translate(0, 2.2, 0), mat.frame), 'metal', 'bearing'));
  ring.add(tag(new THREE.Mesh(new THREE.TorusGeometry(8.4, 0.5, 8, 48).rotateX(Math.PI / 2).translate(0, -2.2, 0), mat.frame), 'metal', 'bearing'));
  // Interior lights for the garden walk; they rotate with the deck.
  for (const psi of [196, 212, 228]) { const l = new THREE.PointLight('#ffe6c2', 160, 26, 2); const a = psi * D; l.position.set(Math.cos(a) * 61, 3.3, Math.sin(a) * 61); ring.add(l); }
  return ring;
}

function buildHub(mat, rng) {
  const hub = new THREE.Group(); hub.name = 'hub';
  const core = withPanelUv(new THREE.CylinderGeometry(HUB.radius, HUB.radius, HUB.top - HUB.bottom, 40, 1, false));
  core.translate(0, (HUB.top + HUB.bottom) / 2, 0);
  hub.add(tag(new THREE.Mesh(core, mat.hubMetal), 'metal', 'hub-core'));
  for (const [y0, y1] of [[-11, -4.4], [4.4, 9.5]]) { const b = new THREE.CylinderGeometry(HUB.radius + 0.12, HUB.radius + 0.12, y1 - y0, 40, 1, true); b.translate(0, (y0 + y1) / 2, 0); hub.add(tag(new THREE.Mesh(b, mat.blanket), 'metal', 'hub-blanket')); }
  const shoulder = new THREE.CylinderGeometry(HUB.adapterRadius + 0.8, HUB.radius, 1.6, 40); shoulder.translate(0, HUB.top + 0.8, 0);
  hub.add(tag(new THREE.Mesh(shoulder, mat.hubMetal), 'metal', 'hub-core'));
  const adapter = new THREE.CylinderGeometry(HUB.adapterRadius, HUB.adapterRadius, PORT.y - HUB.top - 2, 32); adapter.translate(0, (PORT.y + HUB.top + 2) / 2 - 0.6, 0);
  hub.add(tag(new THREE.Mesh(adapter, mat.hubMetal), 'metal', 'port-adapter'));
  const collar = new THREE.TorusGeometry(PORT.radius, 0.42, 12, 48).rotateX(Math.PI / 2).translate(0, PORT.y - 0.45, 0);
  hub.add(tag(new THREE.Mesh(collar, mat.hullDark), 'metal', 'port-collar'));
  const face = new THREE.CylinderGeometry(PORT.radius + 0.4, HUB.adapterRadius, 0.9, 40); face.translate(0, PORT.y - 1.1, 0);
  hub.add(tag(new THREE.Mesh(face, mat.hullDark), 'metal', 'port-collar'));
  const petals = [];
  for (let i = 0; i < 3; i++) { const a = i * 120 * D; const p = new THREE.Vector3(Math.cos(a) * 2.1, PORT.y + 0.35, Math.sin(a) * 2.1); const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a, 0.38, 'YZX')); petals.push(M().compose(p, q, new THREE.Vector3(0.12, 1.3, 1.1))); }
  hub.add(instanced(new THREE.BoxGeometry(1, 1, 1), mat.frame, petals, 'metal', 'port-petals'));
  const latches = [], lamps = [];
  for (let i = 0; i < PORT.latches; i++) { const a = (i * 30 + 15) * D; latches.push(M().compose(new THREE.Vector3(Math.cos(a) * 3.15, PORT.y - 0.55, Math.sin(a) * 3.15), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a), new THREE.Vector3(0.5, 0.55, 0.36))); lamps.push(M().compose(new THREE.Vector3(Math.cos(a) * 3.48, PORT.y - 0.55, Math.sin(a) * 3.48), new THREE.Quaternion(), new THREE.Vector3(0.12, 0.12, 0.12))); }
  hub.add(instanced(new THREE.BoxGeometry(1, 1, 1), mat.frame, latches, 'metal', 'port-latches'));
  const latchLights = instanced(new THREE.SphereGeometry(1, 8, 6), mat.latch, lamps, 'emissive', 'latch-lights');
  latchLights.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(PORT.latches * 3), 3); hub.add(latchLights);
  const approach = [];
  for (let i = 0; i < 8; i++) { const a = i * 45 * D; approach.push(M().compose(new THREE.Vector3(Math.cos(a) * 4.25, PORT.y - 1.45, Math.sin(a) * 4.25), new THREE.Quaternion(), new THREE.Vector3(0.22, 0.18, 0.22))); }
  hub.add(instanced(new THREE.BoxGeometry(1, 1, 1), mat.cyan, approach, 'emissive', 'port-lights'));
  // Alignment target on a short post beside the port: dark plate, lit cross.
  const post = new THREE.Group(); post.position.set(-4.2, HUB.top + 1.6, 1.2);
  post.add(tag(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.2, 8).translate(0, 1.6, 0), mat.frame), 'metal', 'port-target'));
  post.add(tag(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 1.1).translate(0, 3.25, 0), mat.hullDark), 'metal', 'port-target'));
  post.add(tag(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.1).translate(0, 3.3, 0), mat.cyan), 'emissive', 'port-target'));
  post.add(tag(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.8).translate(0, 3.3, 0), mat.cyan), 'emissive', 'port-target'));
  hub.add(post);
  // Attitude thruster quads: block plus four nozzles each; plumes scale with firing.
  const blocks = [], nozzles = [], plumes = [];
  for (let i = 0; i < 4; i++) {
    const a = (i * 90) * D, c = Math.cos(a), s = Math.sin(a), base = new THREE.Vector3(c * (HUB.radius + 0.55), 6.5, s * (HUB.radius + 0.55));
    blocks.push(M().compose(base, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a), new THREE.Vector3(1.1, 1.1, 1.1)));
    for (const d of [[0, 1, 0], [0, -1, 0], [-s, 0, c], [s, 0, -c]]) {
      const dir = new THREE.Vector3(...d), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      nozzles.push(M().compose(base.clone().addScaledVector(dir, 0.72), q, new THREE.Vector3(0.28, 0.4, 0.28)));
      if (d[1] === 1) plumes.push(M().compose(base.clone().addScaledVector(dir, 1.9), q, new THREE.Vector3(0.5, 2.2, 0.5)));
    }
  }
  hub.add(instanced(new THREE.BoxGeometry(1, 1, 1), mat.hullDark, blocks, 'metal', 'rcs'));
  hub.add(instanced(new THREE.CylinderGeometry(0.4, 1, 1, 10), mat.frame, nozzles, 'metal', 'rcs'));
  const plume = instanced(new THREE.ConeGeometry(1, 1, 10, 1, true).rotateX(Math.PI), mat.plume, plumes, 'emissive', 'rcs-plume'); plume.renderOrder = 3; hub.add(plume);
  // Reboost engines around the truss root, canted out so the exhaust clears the lattice.
  const bells = [];
  for (let i = 0; i < 4; i++) { const a = (i * 90 + 45) * D, q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a, -0.42, 'YZX')); bells.push(M().compose(new THREE.Vector3(Math.cos(a) * 4.4, HUB.bottom - 1.2, Math.sin(a) * 4.4), q, new THREE.Vector3(1, 1, 1))); }
  hub.add(instanced(new THREE.CylinderGeometry(0.55, 1.35, 2.6, 18, 1, true), mat.hullDark, bells, 'metal', 'engines'));
  return { hub, latchLights, plume };
}

function buildTruss(mat) {
  const g = new THREE.Group(); g.name = 'truss';
  const h = TRUSS.half, members = [];
  const corners = [[-h, -h], [h, -h], [h, h], [-h, h]];
  for (const [x, z] of corners) members.push(beam([x, TRUSS.top, z], [x, TRUSS.bottom, z], 0.28));
  for (let y = TRUSS.top; y > TRUSS.bottom - 0.1; y -= 4) {
    for (let k = 0; k < 4; k++) { const a = corners[k], b = corners[(k + 1) % 4]; members.push(beam([a[0], y, a[1]], [b[0], y, b[1]], 0.18)); if (y - 4 >= TRUSS.bottom) members.push(beam([a[0], y, a[1]], [b[0], y - 4, b[1]], 0.14)); }
  }
  g.add(instanced(new THREE.BoxGeometry(1, 1, 1), mat.frame, members, 'metal', 'truss'));
  // Radiators: two panels along +-Z with stiffener ribs.
  for (const sz of [1, -1]) {
    const p = new THREE.BoxGeometry(0.16, 18, 13); p.translate(0, -43, sz * (h + 7.4));
    g.add(tag(new THREE.Mesh(p, mat.radiator), 'metal', 'radiators'));
  }
  // Solar wings: booms along +-X, two blankets each.
  const booms = [beam([-TRUSS.wingOuter - 1, TRUSS.wingY, 0], [TRUSS.wingOuter + 1, TRUSS.wingY, 0], 0.9)];
  g.add(instanced(new THREE.CylinderGeometry(0.5, 0.5, 1, 12), mat.hullDark, booms, 'metal', 'wing-booms'));
  const wings = [];
  for (const sx of [1, -1]) for (const [a, b] of [[TRUSS.wingInner + 2, 52], [55, TRUSS.wingOuter]]) {
    const w = new THREE.Group(); w.position.set(sx * (a + b) / 2, TRUSS.wingY, 0); w.userData.wing = true;
    const span = b - a, plane = new THREE.PlaneGeometry(span, TRUSS.wingHalf * 2, 22, 6).rotateX(-Math.PI / 2);
    const col = [], pos = plane.attributes.position;
    for (let i = 0; i < pos.count; i++) { const u = (pos.getX(i) / span + 0.5) * 22, v = (pos.getZ(i) / (TRUSS.wingHalf * 2) + 0.5) * 6; const edge = (Math.round(u) % 2) ^ (Math.round(v) % 2); col.push(...(edge ? [0.07, 0.11, 0.24] : [0.1, 0.16, 0.33])); }
    plane.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    w.add(tag(new THREE.Mesh(plane, mat.cells), 'glass', 'wing-cells'));
    const frames = [beam([-span / 2, 0, -TRUSS.wingHalf], [span / 2, 0, -TRUSS.wingHalf], 0.22), beam([-span / 2, 0, TRUSS.wingHalf], [span / 2, 0, TRUSS.wingHalf], 0.22), beam([-span / 2, 0, -TRUSS.wingHalf], [-span / 2, 0, TRUSS.wingHalf], 0.22), beam([span / 2, 0, -TRUSS.wingHalf], [span / 2, 0, TRUSS.wingHalf], 0.22)];
    for (let k = 1; k < 4; k++) frames.push(beam([-span / 2 + span * k / 4, 0, -TRUSS.wingHalf], [-span / 2 + span * k / 4, 0, TRUSS.wingHalf], 0.1));
    w.add(instanced(new THREE.BoxGeometry(1, 1, 1), mat.frame, frames, 'metal', 'wing-frames'));
    g.add(w); wings.push(w);
  }
  // Ground-link antenna: mast from the truss, gimbal, dish facing down toward Earth.
  const ant = new THREE.Group(); ant.position.set(0, -30, 0);
  ant.add(tag(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 11, 8).rotateX(Math.PI / 2).translate(0, 0, -6.6), mat.frame), 'metal', 'antenna'));
  const dishPts = []; for (let i = 0; i <= 12; i++) { const r = i / 12 * 3.6; dishPts.push(new THREE.Vector2(r, r * r * 0.09)); }
  const dish = new THREE.LatheGeometry(dishPts, 32); dish.rotateX(Math.PI); dish.translate(0, -0.8, -12.4);
  ant.add(tag(new THREE.Mesh(dish, panelMetal({ color: '#d8dbdd', metalness: 0.45, roughness: 0.4, side: THREE.DoubleSide }, { mode: 1, a: 0.9, b: 0.9, wear: 0.3 })), 'metal', 'antenna-dish'));
  ant.add(tag(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.4, 6).translate(0, -1.9, -12.4), mat.frame), 'metal', 'antenna'));
  ant.add(tag(new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8).translate(0, 0, -12.4), mat.hullDark), 'metal', 'antenna'));
  g.add(ant);
  return { truss: g, wings };
}

function buildArm(mat) {
  // Base on the hub roof; joints are nested groups so angles compose like a real arm.
  const base = new THREE.Group(); base.position.set(0.6, HUB.top + 0.05, -4.7); base.name = 'arm';
  const yaw = new THREE.Group(); base.add(yaw);
  yaw.add(tag(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.85, 1.2, 16).translate(0, 0.6, 0), mat.hullDark), 'metal', 'arm'));
  const shoulder = new THREE.Group(); shoulder.position.y = 1.4; yaw.add(shoulder);
  shoulder.add(tag(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.3, 16).rotateZ(Math.PI / 2), mat.frame), 'metal', 'arm'));
  shoulder.add(tag(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 7.6, 12).translate(0, 3.8, 0), mat.radiator), 'metal', 'arm'));
  const elbow = new THREE.Group(); elbow.position.y = 7.6; shoulder.add(elbow);
  elbow.add(tag(new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 1.1, 16).rotateZ(Math.PI / 2), mat.frame), 'metal', 'arm'));
  elbow.add(tag(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 6.8, 12).translate(0, 3.4, 0), mat.radiator), 'metal', 'arm'));
  const wrist = new THREE.Group(); wrist.position.y = 6.8; elbow.add(wrist);
  wrist.add(tag(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.9, 12).rotateZ(Math.PI / 2), mat.frame), 'metal', 'arm'));
  wrist.add(tag(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.3, 1.2, 12).translate(0, 0.8, 0), mat.hullDark), 'metal', 'arm'));
  const lamp = tag(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.2).translate(0.38, 0.9, 0), mat.lamp), 'emissive', 'arm-light'); wrist.add(lamp);
  return { arm: base, joints: { yaw, shoulder, elbow, wrist } };
}

export function buildShuttle(mat) {
  const s = new THREE.Group(); s.name = 'shuttle';
  const hullMat = panelMetal({ color: '#e7e8e6', metalness: 0.35, roughness: 0.45 }, { mode: 0, a: 16, b: 5, wear: 0.5 });
  const pts = [[1.15, 0], [1.5, 0.35], [2.1, 1.3], [2.25, 2.2], [2.25, 6.4], [1.95, 8.6], [1.45, 9.6], [0.95, 9.9]].map(([r, y]) => new THREE.Vector2(r, y));
  s.add(tag(new THREE.Mesh(withPanelUv(new THREE.LatheGeometry(pts, 36)), hullMat), 'metal', 'shuttle-hull'));
  s.add(tag(new THREE.Mesh(new THREE.TorusGeometry(1.22, 0.24, 10, 36).rotateX(Math.PI / 2).translate(0, 0.08, 0), mat.hullDark), 'metal', 'shuttle-ring'));
  const sp = []; for (let i = 0; i < 3; i++) { const a = (i * 120 + 60) * D; sp.push(M().compose(new THREE.Vector3(Math.cos(a) * 0.95, -0.25, Math.sin(a) * 0.95), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a, -0.38, 'YZX')), new THREE.Vector3(0.1, 0.8, 0.75))); }
  s.add(instanced(new THREE.BoxGeometry(1, 1, 1), mat.frame, sp, 'metal', 'shuttle-ring'));
  // Cabin: lit interior band behind a glass band (two layers, so the windows read as glass).
  const cabin = new THREE.CylinderGeometry(2.2, 2.2, 0.9, 36, 1, true, -40 * D, 80 * D); cabin.translate(0, 2.9, 0);
  s.add(tag(new THREE.Mesh(cabin, mat.window), 'emissive', 'shuttle-cabin'));
  const gl = new THREE.CylinderGeometry(2.3, 2.3, 1.0, 36, 1, true, -42 * D, 84 * D); gl.translate(0, 2.9, 0);
  const glm = tag(new THREE.Mesh(gl, mat.glass), 'glass', 'shuttle-glass'); glm.renderOrder = 2; s.add(glm);
  s.add(tag(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.35, 1.9, 20, 1, true).translate(0, 10.8, 0), mat.hullDark), 'metal', 'shuttle-engine'));
  const fins = [];
  for (const sx of [1, -1]) fins.push(M().compose(new THREE.Vector3(sx * 3.2, 7.2, 0), new THREE.Quaternion(), new THREE.Vector3(2.2, 2.6, 0.12)));
  s.add(instanced(new THREE.BoxGeometry(1, 1, 1), mat.radiator, fins, 'metal', 'shuttle-fins'));
  const navGeo = new THREE.SphereGeometry(0.17, 8, 6);
  const nav = instanced(navGeo, mat.nav, [M().setPosition(4.35, 7.2, 0), M().setPosition(-4.35, 7.2, 0), M().setPosition(0, 9.95, 0)], 'emissive', 'nav-lights');
  nav.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array([1, 0.08, 0.06, 0.12, 0.9, 0.3, 1, 1, 1]), 3); s.add(nav);
  const rcs = [], puffs = [];
  for (let i = 0; i < 4; i++) { const a = (i * 90 + 45) * D, base = new THREE.Vector3(Math.cos(a) * 2.3, 1.7, Math.sin(a) * 2.3); rcs.push(M().compose(base, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a), new THREE.Vector3(0.55, 0.55, 0.55))); const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)); puffs.push(M().compose(base.clone().addScaledVector(dir, 1.1), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir), new THREE.Vector3(0.35, 1.5, 0.35))); }
  s.add(instanced(new THREE.BoxGeometry(1, 1, 1), mat.hullDark, rcs, 'metal', 'shuttle-rcs'));
  const plumeMat = mat.plume.clone(); const puff = instanced(new THREE.ConeGeometry(1, 1, 10, 1, true).rotateX(Math.PI), plumeMat, puffs, 'emissive', 'shuttle-plume'); puff.renderOrder = 3; s.add(puff);
  const flood = new THREE.SpotLight('#eaf4ff', 0, 60, 0.55, 0.5, 1.6); flood.position.set(0, 0.6, 0); flood.target.position.set(0, -10, 0); s.add(flood, flood.target);
  return { shuttle: s, puff, plumeMat, flood, nav };
}

export function buildStation(seed = 2026) {
  const rng = mulberry(seed), mat = createMaterials();
  const root = new THREE.Group(); root.name = 'station';
  const ring = buildRing(mat, rng); root.add(ring);
  const { hub, latchLights, plume } = buildHub(mat, rng); root.add(hub);
  const { truss, wings } = buildTruss(mat); root.add(truss);
  const { arm, joints } = buildArm(mat); root.add(arm);
  const sh = buildShuttle(mat); root.add(sh.shuttle);
  const green = new THREE.Color('#34c759'), amber = new THREE.Color('#ffb340'), off = new THREE.Color('#2a2f36');
  function update(t) {
    ring.rotation.y = ringAngle(t);
    const s = shuttleAt(t);
    sh.shuttle.position.set(...s.position); sh.shuttle.quaternion.set(...s.quaternion);
    sh.plumeMat.opacity = 0.75 * s.rcs; sh.puff.visible = s.rcs > 0;
    sh.flood.intensity = s.distance < 45 && s.distance > -1 && !s.latched ? 900 : 0;
    const blink = (t * 1.25) % 1 < 0.12 ? 1 : 0.15; sh.nav.setColorAt(2, new THREE.Color(blink, blink, blink)); sh.nav.instanceColor.needsUpdate = true;
    for (let i = 0; i < PORT.latches; i++) latchLights.setColorAt(i, i < s.latched ? green : s.capture ? amber : off);
    latchLights.instanceColor.needsUpdate = true;
    const r = stationRcs(t); mat.plume.opacity = 0.8 * r; plume.visible = r > 0;
    const a = armAt(t); joints.yaw.rotation.y = a.yaw; joints.shoulder.rotation.x = -a.shoulder + Math.PI / 2 - 0.6; joints.elbow.rotation.x = a.elbow - 2.2; joints.wrist.rotation.x = a.wrist;
    // Wings track the sun about their boom (X) axis.
    const d = sunDir(t), ang = Math.atan2(d[2], d[1]);
    for (const w of wings) w.rotation.x = ang;
  }
  update(0);
  return { root, ring, hub, truss, arm, joints, shuttle: sh.shuttle, wings, materials: mat, latchLights, update };
}
