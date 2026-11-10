// 圣家堂：全部形体。外部（塔、三个立面、后殿、街区）与内部（柱林、拱顶、彩窗、祭坛）分两组，按镜头在里在外切换显示。
import * as THREE from 'three';
import * as C from './core.js';

// ---------- 小工具 ----------
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function canvasTex(w, h, draw, { repeat = [1, 1], srgb = true, aniso = 8 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

// 把大量小部件攒成几个 InstancedMesh：同一种基础形体一次绘制。
function batcher(group, material, { cast = true, receive = true } = {}) {
  const GEO = {
    box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10), taper: new THREE.CylinderGeometry(0.3, 0.5, 1, 10),
    cone: new THREE.ConeGeometry(0.5, 1, 8), ball: new THREE.SphereGeometry(0.5, 10, 7), ring: new THREE.TorusGeometry(0.5, 0.16, 6, 14),
    prism: (() => { const s = new THREE.Shape(); s.moveTo(-0.5, 0); s.lineTo(0.5, 0); s.lineTo(0, 1); s.closePath(); const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }); g.translate(0, 0, -0.5); return g; })(),
  };
  const lists = {};
  const push = (kind, pos, scl, rot, color) => {
    (lists[kind] ||= []).push({ pos: [...pos], scl: [...scl], rot: rot ? [...rot] : null, color });
  };
  const api = {
    box: (x, y, z, sx, sy, sz, color, ry = 0) => push('box', [x, y + sy / 2, z], [sx, sy, sz], ry ? [0, ry, 0] : null, color),
    cyl: (x, y, z, r, h, color) => push('cyl', [x, y + h / 2, z], [r * 2, h, r * 2], null, color),
    taper: (x, y, z, r, h, color) => push('taper', [x, y + h / 2, z], [r * 2, h, r * 2], null, color),
    cone: (x, y, z, r, h, color) => push('cone', [x, y + h / 2, z], [r * 2, h, r * 2], null, color),
    ball: (x, y, z, r, color, sy = 1) => push('ball', [x, y, z], [r * 2, r * 2 * sy, r * 2], null, color),
    ring: (x, y, z, r, color) => push('ring', [x, y, z], [r * 2, r * 2, r * 2], [Math.PI / 2, 0, 0], color),
    prism: (x, y, z, w, h, d, color, ry = 0) => push('prism', [x, y, z], [w, h, d], ry ? [0, ry, 0] : null, color),
    // 任意朝向的杆：从 a 到 b
    rod: (a, b, r, color, kind = 'cyl') => {
      const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
      const q = new THREE.Quaternion().setFromUnitVectors(UP, d.normalize());
      (lists[kind] ||= []).push({ pos: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], scl: [r * 2, len, r * 2], quat: q, color });
    },
    raw: (kind, pos, scl, rot, color) => push(kind, pos, scl, rot, color),
    build() {
      const out = [];
      for (const [kind, arr] of Object.entries(lists)) {
        const mesh = new THREE.InstancedMesh(GEO[kind], material, arr.length);
        arr.forEach((it, i) => {
          if (it.quat) _q.copy(it.quat); else if (it.rot) _q.setFromEuler(_e.set(it.rot[0], it.rot[1], it.rot[2])); else _q.identity();
          _m.compose(_p.set(...it.pos), _q, _s.set(...it.scl)); mesh.setMatrixAt(i, _m); mesh.setColorAt(i, _c.set(it.color || '#ffffff'));
        });
        mesh.castShadow = cast; mesh.receiveShadow = receive; mesh.frustumCulled = false; group.add(mesh); out.push(mesh);
      }
      return out;
    },
  };
  return api;
}

// ---------- 彩窗光：把两侧窗子的色光「投」到内部所有表面上 ----------
// 不用真实光源：对每个像素沿光的方向倒推回墙面，看落点是不是在窗洞里，是就按那块玻璃的颜色加亮。
export const GLASS = { uGI: { value: new THREE.Vector3(1, 0.16, 0) } };
const GLASS_GLSL = /* glsl */`
uniform vec3 uGI;
varying vec3 vGW; varying vec3 vGN;
float gh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float lancet(vec2 p, float w, float h){ if (p.y < 0.) return 0.; float ax = abs(p.x) / w; if (ax > 1.) return 0.; return step(p.y, h + w * 1.8 * sqrt(max(1. - ax * ax, 0.))); }
vec3 sideGlass(vec3 wp, vec3 n, float s, float I, vec3 ca, vec3 cb, vec3 cc){
  if (I < .01) return vec3(0.);
  vec3 L = normalize(vec3(-s, -.62, -.16));
  float nl = max(dot(n, -L), 0.); if (nl <= 0.) return vec3(0.);
  float t = (wp.x - s * 22.5) / L.x; if (t < 0.) return vec3(0.);
  vec3 h = wp - L * t; float m = 0.;
  if (h.z > 3.) {
    if (h.z > 45.) return vec3(0.);
    float qx = (fract((h.z - 3.) / 7.) - .5) * 7.;
    m = max(lancet(vec2(abs(qx) - 1.55, h.y - 4.5), 1.25, 10.5), lancet(vec2(abs(qx) - 1.3, h.y - 19.5), 1.05, 6.5));
  } else {
    t = (wp.x - s * 30.) / L.x; if (t < 0.) return vec3(0.); h = wp - L * t;
    if (h.z < -27. || h.z > 3.) return vec3(0.);
    float qx = h.z + 12.;
    m = max(step(length(vec2(qx, h.y - 24.)), 5.), lancet(vec2(mod(abs(qx) + 1.6, 3.2) - 1.6, h.y - 5.), 1.1, 9.) * step(abs(qx), 8.));
  }
  if (m <= 0.) return vec3(0.);
  vec2 cell = floor(vec2(h.z * 2.6, h.y * 1.7));
  vec3 col = mix(ca, cb, smoothstep(.15, .85, gh(cell) * .7 + .3 * fract(h.y * .07)));
  col = mix(col, cc, step(.8, gh(cell + 7.3)));
  col = mix(vec3(dot(col, vec3(.3, .5, .2))) + .12, col, .72);
  return col * nl * I * .95 * exp(-t * .012);
}
vec3 glassLight(vec3 wp, vec3 n){
  return sideGlass(wp, n, 1., uGI.x, vec3(.10, .32, 1.), vec3(.12, .85, .45), vec3(.75, 1., .35))
       + sideGlass(wp, n, -1., uGI.y, vec3(1., .16, .06), vec3(1., .55, .05), vec3(1., .9, .25));
}`;
export function glassLit(mat, gain = 1) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uGI = GLASS.uGI;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW; varying vec3 vGN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 gwp = vec4(transformed, 1.); vec3 gn = objectNormal;
        #ifdef USE_INSTANCING
          gwp = instanceMatrix * gwp; gn = mat3(instanceMatrix) * gn;
        #endif
        vGW = (modelMatrix * gwp).xyz; vGN = mat3(modelMatrix) * gn;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + GLASS_GLSL)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * glassLight(vGW, normalize(vGN)) * ${gain.toFixed(2)};`);
  };
  mat.customProgramCacheKey = () => 'glass' + gain.toFixed(2);
  return mat;
}

// ---------- 贴图（全部现画）----------
const WARM = ['#d81f1f', '#f0541a', '#ff8c1a', '#ffc21a', '#fff07a', '#c2185b', '#ff6a3d'];
const COOL = ['#1f4fd6', '#2a8be0', '#35c9c0', '#3fbf5a', '#9fe060', '#e8f070', '#5a6fe8'];
const MIXED = ['#1f4fd6', '#35c9c0', '#ffc21a', '#f0541a', '#9fe060', '#c2185b', '#fff07a', '#2a8be0'];
function glassTexture(pal, seed, shape = 'lancet') {
  return canvasTex(128, 512, (g, w, h) => {
    const r = rng(seed); g.clearRect(0, 0, w, h);
    g.save(); g.beginPath();
    if (shape === 'lancet') { g.moveTo(4, h); g.lineTo(4, w * 0.9); g.quadraticCurveTo(4, 8, w / 2, 4); g.quadraticCurveTo(w - 4, 8, w - 4, w * 0.9); g.lineTo(w - 4, h); }
    else g.arc(w / 2, h / 2, w / 2 - 3, 0, 7);
    g.closePath(); g.clip();
    // 不规则的碎片：抖动网格上的四边形，颜色沿高度慢慢漂
    const nx = 5, ny = shape === 'lancet' ? 22 : 6, pts = [];
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) pts.push([(i + (i && i < nx ? (r() - 0.5) * 0.8 : 0)) * w / nx, (j + (j && j < ny ? (r() - 0.5) * 0.8 : 0)) * h / ny]);
    const P = (i, j) => pts[j * (nx + 1) + i];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const drift = Math.floor((j / ny) * (pal.length - 2) + r() * 2.2);
      g.fillStyle = pal[Math.min(pal.length - 1, drift)]; g.globalAlpha = 0.72 + r() * 0.28;
      g.beginPath(); for (const [a, b] of [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]]) g.lineTo(...P(a, b)); g.closePath(); g.fill();
      if (r() < 0.45) { g.beginPath(); g.moveTo(...P(i, j)); g.lineTo(...P(i + 1, j + 1)); g.strokeStyle = '#1a1410'; g.lineWidth = 1.2; g.stroke(); }
    }
    g.globalAlpha = 1; g.strokeStyle = '#17120e'; g.lineWidth = 1.6;
    for (let j = 0; j <= ny; j++) { g.beginPath(); for (let i = 0; i <= nx; i++) g.lineTo(...P(i, j)); g.stroke(); }
    for (let i = 0; i <= nx; i++) { g.beginPath(); for (let j = 0; j <= ny; j++) g.lineTo(...P(i, j)); g.stroke(); }
    if (shape !== 'lancet') { g.lineWidth = 3; for (let k = 0; k < 8; k++) { g.beginPath(); g.moveTo(w / 2, h / 2); g.lineTo(w / 2 + Math.cos(k * 0.785) * w, h / 2 + Math.sin(k * 0.785) * w); g.stroke(); } g.beginPath(); g.arc(w / 2, h / 2, w * 0.2, 0, 7); g.stroke(); }
    g.restore();
    g.strokeStyle = '#2b241c'; g.lineWidth = 5; g.beginPath();
    if (shape === 'lancet') { g.moveTo(4, h); g.lineTo(4, w * 0.9); g.quadraticCurveTo(4, 8, w / 2, 4); g.quadraticCurveTo(w - 4, 8, w - 4, w * 0.9); g.lineTo(w - 4, h); } else g.arc(w / 2, h / 2, w / 2 - 3, 0, 7);
    g.stroke();
  }, { aniso: 4 });
}
function stoneTexture(base, seed, lines = true) {
  return canvasTex(256, 256, (g, w, h) => {
    const r = rng(seed); g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { g.fillStyle = r() < 0.5 ? '#00000010' : '#ffffff12'; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); }
    if (lines) { g.strokeStyle = '#00000022'; g.lineWidth = 1; for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); for (let x = (y / 32 % 2) * 32; x < w; x += 64) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 32); g.stroke(); } } }
  });
}
// 塔身：一圈圈螺旋上升的百叶窗洞
function towerTexture(seed) {
  return canvasTex(256, 1024, (g, w, h) => {
    const r = rng(seed); const grad = g.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, '#e9dcc0'); grad.addColorStop(1, '#cdb994'); g.fillStyle = grad; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) { g.fillStyle = r() < 0.5 ? '#0000000d' : '#ffffff10'; g.fillRect(r() * w, r() * h, 1 + r() * 3, 2 + r() * 6); }
    const rows = 46;
    for (let j = 1; j < rows; j++) {
      const y = h - (j / rows) * h * 0.86 - h * 0.04, sh = h / rows * 0.6;
      for (let i = 0; i < 6; i++) { const x = ((i + 0.5) / 6 * w + j * 7) % w; g.fillStyle = '#3a2f25'; g.beginPath(); g.roundRect(x - 5, y - sh * 1.25, 10, sh * 1.25, 5); g.fill(); g.fillStyle = '#ffffff30'; g.fillRect(x - 7, y - 1, 14, 2); }
      g.fillStyle = '#00000018'; g.fillRect(0, y + 3, w, 2);
    }
    for (let i = 0; i < 4; i++) { g.fillStyle = '#ffffff1c'; g.fillRect((i / 4) * w - 3, 0, 6, h); }
  }, { repeat: [3, 1] });
}
function cityTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) { g.fillStyle = '#6d6a66'; g.fillRect(i * 21 + 6, j * 21 + 5, 9, 13); g.fillStyle = '#cfc8ba'; g.fillRect(i * 21 + 4, j * 21 + 18, 13, 2); }
    g.fillStyle = '#00000012'; g.fillRect(0, h - 20, w, 20);
  });
}
function floorTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#cfc7b8'; g.fillRect(0, 0, w, h); const r = rng(5);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { g.fillStyle = `hsl(38 12% ${70 + r() * 9}%)`; g.fillRect(i * 64 + 1, j * 64 + 1, 62, 62); }
    for (let i = 0; i < 1800; i++) { g.fillStyle = r() < 0.5 ? '#0000000c' : '#ffffff14'; g.fillRect(r() * w, r() * h, 2, 2); }
  }, { repeat: [1, 1] });
}
function rayTexture() {
  return canvasTex(64, 256, (g, w, h) => {
    const a = g.createLinearGradient(0, 0, 0, h); a.addColorStop(0, '#ffffffff'); a.addColorStop(0.5, '#ffffff66'); a.addColorStop(1, '#ffffff00'); g.fillStyle = a; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-in'; const b = g.createLinearGradient(0, 0, w, 0); b.addColorStop(0, '#fff0'); b.addColorStop(0.3, '#ffff'); b.addColorStop(0.7, '#ffff'); b.addColorStop(1, '#fff0'); g.fillStyle = b; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-out'; const r = rng(3); for (let i = 0; i < 9; i++) { g.fillStyle = `rgba(0,0,0,${0.15 + r() * 0.35})`; g.fillRect(r() * w, 0, 1 + r() * 4, h); }
  }, { srgb: false });
}

// ---------- 塔 ----------
function towerProfile(t) {
  // 返回 [半径, 高度] 的折线：下段近乎直，上段抛物线收尖。
  const top = { jesus: t.h - 19, mary: t.h - 9, evangelist: t.h - 9, apostle: t.h - 15 }[t.kind];
  const rTop = { jesus: 1.9, mary: 1.3, evangelist: 1.1, apostle: 0.85 }[t.kind], k = { jesus: 1.55, mary: 1.7, evangelist: 1.9, apostle: 2.3 }[t.kind];
  const pts = [], n = 40;
  for (let i = 0; i <= n; i++) { const u = i / n; pts.push(new THREE.Vector2(t.r0 + (rTop - t.r0) * Math.pow(u, k), t.y0 + (top - t.y0) * u)); }
  return { pts, top, rTop };
}

export function buildWorld(scene, { coarse = false } = {}) {
  const ext = new THREE.Group(), int = new THREE.Group(); ext.name = 'exterior'; int.name = 'interior'; scene.add(ext, int);
  const R = rng(2026);
  const stone = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92, map: stoneTexture('#dccdae', 11) });
  const plain = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 });
  const E = batcher(ext, plain);          // 外部小部件
  const ES = batcher(ext, stone);         // 外部大体块（带石缝）

  // ===== 地面与街区 =====
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshStandardMaterial({ color: '#8d8a84', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; ext.add(ground);
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(C.BLOCK + 8, C.BLOCK + 8), new THREE.MeshStandardMaterial({ color: '#cfc6b3', roughness: 1, map: floorTexture() }));
  plaza.material.map.repeat.set(24, 24); plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, 0.04, 0); plaza.receiveShadow = true; ext.add(plaza);
  const cityTex = cityTexture();
  const side = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, map: cityTex }), roof = new THREE.MeshStandardMaterial({ color: '#d8cfbd', roughness: 1 });
  const cityBoxes = [], treeSpots = [];
  const TONES = ['#e6dcc6', '#dfd2b8', '#e9e0cf', '#d6c8ac', '#e2d5bd', '#cfc3ad', '#ddcbb0'];
  for (const b of C.BLOCKS) {
    const half = C.BLOCK / 2;
    if (b.park) {
      const lawn = new THREE.Mesh(new THREE.PlaneGeometry(C.BLOCK, C.BLOCK), new THREE.MeshStandardMaterial({ color: '#5f9a47', roughness: 1 }));
      lawn.rotation.x = -Math.PI / 2; lawn.position.set(b.x, 0.05, b.z); lawn.receiveShadow = true; ext.add(lawn);
      for (const [px, pz, sx, sz] of [[0, 0, C.BLOCK, 5], [0, 0, 5, C.BLOCK], [0, 30, C.BLOCK * 0.7, 3.5], [0, -30, C.BLOCK * 0.7, 3.5]]) E.box(b.x + px, 0.06, b.z + pz, sx, 0.06, sz, '#d9cfb8');
      if (b.i > 0) { const pond = new THREE.Mesh(new THREE.CircleGeometry(21, 40), new THREE.MeshStandardMaterial({ color: '#4f8fa8', roughness: 0.12, metalness: 0.35 })); pond.scale.set(1, 1.5, 1); pond.rotation.x = -Math.PI / 2; pond.position.set(b.x - 18, 0.22, b.z + 2); ext.add(pond); E.ring(b.x - 18, 0.2, b.z + 2, 0.01, '#d9cfb8'); }
      for (let k = 0; k < 64; k++) { const tx = b.x + (R() - 0.5) * (C.BLOCK - 8), tz = b.z + (R() - 0.5) * (C.BLOCK - 8); if (b.i > 0 && Math.hypot((tx - b.x + 18) / 23, (tz - b.z - 2) / 34) < 1) continue; if (Math.abs(tx - b.x) < 4 || Math.abs(tz - b.z) < 4) continue; treeSpots.push([tx, tz, 0.8 + R() * 0.7]); }
      continue;
    }
    // 每个街块：四条边各五栋，四个切角各一栋，中间是矮的内院
    const depth = 15, edge = C.BLOCK - 2 * C.CHAMFER, n = 5, w = edge / n;
    for (let s = 0; s < 4; s++) {
      const a = s * Math.PI / 2, cs = Math.cos(a), sn = Math.sin(a);
      for (let k = 0; k < n; k++) {
        const u = -edge / 2 + w * (k + 0.5), v = half - depth / 2, hgt = 17 + R() * 9;
        cityBoxes.push({ x: b.x + u * cs - v * sn, z: b.z + u * sn + v * cs, sx: w - 0.3, sy: hgt, sz: depth, ry: -a, color: TONES[Math.floor(R() * TONES.length)] });
      }
      const cv = half - C.CHAMFER / 2 - 3, ca = a + Math.PI / 4;
      cityBoxes.push({ x: b.x + cv * Math.SQRT2 * Math.cos(ca) * 0.98, z: b.z + cv * Math.SQRT2 * Math.sin(ca) * 0.98, sx: C.CHAMFER * 1.38, sy: 19 + R() * 8, sz: 13, ry: -(ca - Math.PI / 2), color: TONES[Math.floor(R() * TONES.length)] });
    }
    cityBoxes.push({ x: b.x, z: b.z, sx: C.BLOCK - 2 * depth, sy: 5 + R() * 4, sz: C.BLOCK - 2 * depth, ry: 0, color: '#c9c0ae' });
  }
  const cityMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), [side, side, roof, roof, side, side], cityBoxes.length);
  cityBoxes.forEach((c, i) => { _m.compose(_p.set(c.x, c.sy / 2, c.z), _q.setFromEuler(_e.set(0, c.ry, 0)), _s.set(c.sx, c.sy, c.sz)); cityMesh.setMatrixAt(i, _m); cityMesh.setColorAt(i, _c.set(c.color)); });
  cityMesh.castShadow = cityMesh.receiveShadow = true; cityMesh.frustumCulled = false; ext.add(cityMesh);
  // 行道树：教堂这一格四周两排
  for (let k = -5; k <= 5; k++) if (k) for (const o of [C.BLOCK / 2 + 3.5, C.PITCH - C.BLOCK / 2 - 3.5]) { treeSpots.push([k * 11, o, 0.7], [k * 11, -o, 0.7], [o, k * 11, 0.7], [-o, k * 11, 0.7]); }
  const T = batcher(ext, plain);
  for (const [x, z, s] of treeSpots) { T.cyl(x, 0, z, 0.28 * s, 3.2 * s, '#6b5238'); T.ball(x, 4.6 * s, z, 2.6 * s, ['#4f8f3a', '#5c9e44', '#44803a', '#6aa84f'][Math.floor(R() * 4)], 0.95); }
  T.build();

  // ===== 教堂外壳 =====
  const LIGHT = '#e6dabd', MID = '#d6c6a2', DARK = '#b9a47f', WHITE = '#f3ecdc';
  const naveLen = C.Z_GLORY - C.Z_NAVE_END, naveMid = (C.Z_GLORY + C.Z_NAVE_END) / 2, transLen = C.Z_NAVE_END - C.Z_TRANS_END, transMid = (C.Z_NAVE_END + C.Z_TRANS_END) / 2;
  ES.box(0, 0, naveMid, 45.6, 31, naveLen, MID);                       // 侧廊一层
  ES.box(0, 31, naveMid, 31, 15, naveLen, LIGHT);                      // 中廊高出的一层
  ES.prism(0, 46, naveMid, 31, 8, naveLen, '#c7b594');                 // 中廊屋脊
  ES.box(0, 0, transMid, 60.6, 31, transLen, MID);
  ES.box(0, 31, transMid, 48, 15, transLen - 4, LIGHT);
  ES.prism(0, 46, transMid, transLen - 4, 8, 48, '#c7b594', Math.PI / 2);
  // 十字交叉上的八角鼓座
  ES.raw('cyl', [0, 52, C.CROSS.z], [29, 14, 29], [0, Math.PI / 8, 0], LIGHT);
  // 后殿：半圆 + 七间小礼拜堂 + 两座圣器室穹顶
  ES.cyl(C.APSE.x, 0, C.APSE.z, 18.3, 31, MID); ES.cyl(C.APSE.x, 31, C.APSE.z, 12.5, 19, LIGHT); ES.cone(C.APSE.x, 50, C.APSE.z, 12.5, 7, '#c7b594');
  for (let i = 0; i < 7; i++) { const a = Math.PI * (0.06 + 0.88 * i / 6), x = Math.cos(a) * 19.5, z = C.APSE.z - Math.sin(a) * 19.5; ES.cyl(x, 0, z, 3.6, 22, LIGHT); E.cone(x, 22, z, 3.8, 9, MID); E.taper(x, 31, z, 0.5, 6, WHITE); E.ball(x, 37.6, z, 0.75, ['#d84a2f', '#e8b923', '#3f9b55', '#ffffff'][i % 4]); }
  for (const sx of [-1, 1]) { const g = new THREE.LatheGeometry(Array.from({ length: 16 }, (_, i) => new THREE.Vector2(10 * Math.sqrt(1 - Math.pow(i / 15, 1.6)) + 0.4, i / 15 * 38)), 16); const m = new THREE.Mesh(g, stone); m.position.set(sx * 27, 0, -42); m.castShadow = m.receiveShadow = true; ext.add(m); E.taper(sx * 27, 38, -42, 0.6, 5, WHITE); E.ball(sx * 27, 43.5, -42, 0.9, '#e8b923'); }
  // 回廊：沿中殿两侧的矮廊
  for (const sx of [-1, 1]) { ES.box(sx * 26, 0, naveMid + 2, 6, 11, naveLen - 6, LIGHT); for (let k = 0; k < 6; k++) E.prism(sx * 26, 11, C.Z_NAVE_END + 6 + k * 6.5, 6, 3.4, 6, MID, Math.PI / 2); }
  // 侧廊与中廊檐口上一排尖山花和彩色果篮顶饰
  const FRUIT = ['#d84a2f', '#e8b923', '#7ab648', '#f08a24', '#c94f9b', '#f3ecdc'];
  for (let k = 0; k < C.BAYS; k++) {
    const z = C.BAY_Z0 + C.BAY * (k + 0.5);
    for (const sx of [-1, 1]) {
      E.prism(sx * 22.9, 31, z, 5.4, 6.5, 1.6, LIGHT, Math.PI / 2); E.taper(sx * 22.9, 37.5, z, 0.42, 3.2, WHITE); E.ball(sx * 22.9, 41.2, z, 0.8, FRUIT[(k * 2 + (sx > 0 ? 1 : 0)) % 6], 1.25);
      E.box(sx * 22.9, 0, z + 3.5, 1.8, 34, 1.5, LIGHT); E.cone(sx * 22.9, 34, z + 3.5, 1.1, 5, WHITE);
      E.prism(sx * 15.6, 46, z, 5, 6, 1.4, LIGHT, Math.PI / 2); E.taper(sx * 15.6, 52, z, 0.36, 2.8, WHITE); E.ball(sx * 15.6, 55.2, z, 0.7, FRUIT[(k * 2 + 3 + (sx > 0 ? 1 : 0)) % 6], 1.25);
    }
  }
  // 外墙上的窗（外面看是深色玻璃带一点彩）
  const extGlass = new THREE.MeshStandardMaterial({ map: glassTexture(MIXED, 91), transparent: true, alphaTest: 0.5, roughness: 0.25, metalness: 0.2, color: '#8f8a9c', emissive: '#20242e', emissiveIntensity: 1 });
  const extWins = [];
  for (let k = 0; k < C.BAYS; k++) for (const sx of [-1, 1]) for (const tier of C.WINDOW_TIERS) for (const o of [-1, 1]) {
    const x0 = sx * (tier.y > 18 ? 15.56 : 22.86), y = tier.y > 18 ? tier.y + 14 : tier.y, hh = tier.h + tier.w * 1.8;
    extWins.push({ pos: [x0, y + hh / 2, C.BAY_Z0 + C.BAY * (k + 0.5) + o * 1.5], scl: [tier.w * 2, hh, 1], ry: sx * Math.PI / 2 });
  }
  for (let i = 0; i < 7; i++) { const a = Math.PI * (0.1 + 0.8 * i / 6); extWins.push({ pos: [Math.cos(a) * 12.56, 41, C.APSE.z - Math.sin(a) * 12.56], scl: [2.4, 13, 1], ry: a + Math.PI / 2 }); }
  const ewMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), extGlass, extWins.length);
  extWins.forEach((w, i) => { _m.compose(_p.set(...w.pos), _q.setFromEuler(_e.set(0, w.ry, 0)), _s.set(...w.scl)); ewMesh.setMatrixAt(i, _m); }); ewMesh.frustumCulled = false; ext.add(ewMesh);

  // ===== 诞生立面（+X）：堆满雕刻、像融化的蜡 =====
  {
    const X = 30.3, zc = C.CROSS.z;
    ES.box(X + 1.2, 0, zc, 3, 44, 31, DARK);
    const CARVE = ['#c2ad86', '#b39c74', '#cdb991', '#a58f69', '#bba57c'];
    for (const [dz, wid, hgt] of [[0, 12, 50], [-10.4, 8.6, 34], [10.4, 8.6, 34]]) {
      E.prism(X + 3.6, hgt * 0.4, zc + dz, wid, hgt * 0.6, 2.6, DARK, Math.PI / 2);            // 尖山花
      E.box(X + 3.4, 0, zc + dz, 2.4, hgt * 0.4, wid, '#bfa980');
      E.box(X + 4.62, 0, zc + dz, 0.2, hgt * 0.27, wid * 0.42, '#231d16');                     // 门洞
      E.prism(X + 4.67, hgt * 0.27, zc + dz, wid * 0.42, wid * 0.4, 0.2, '#231d16', Math.PI / 2);
      // 雕刻：密密的小凸起，越往上越稀；山花边缘垂一圈钟乳
      const n = Math.round(wid * 42);
      for (let k = 0; k < n; k++) {
        const py = hgt * (0.04 + Math.pow(R(), 1.25) * 0.93), half = (wid / 2) * (py > hgt * 0.4 ? (1 - (py - hgt * 0.4) / (hgt * 0.6)) : 1), pz = zc + dz + (R() * 2 - 1) * half * 0.96;
        if (py < hgt * 0.27 + wid * 0.2 && Math.abs(pz - zc - dz) < wid * 0.23) continue;
        const rr = 0.13 + R() * R() * 0.42; E.ball(X + 4.86 + R() * 0.25, py, pz, rr, CARVE[k % 5], 0.7 + R() * 1.6);
      }
      for (let k = 0; k < 15; k++) { const u = (k + 0.5) / 15 * 2 - 1; E.raw('cone', [X + 4.9, hgt * 0.4 + (1 - Math.abs(u)) * hgt * 0.6 - 0.9, zc + dz + u * wid / 2], [0.42, 1.4 + R() * 1.5, 0.42], [Math.PI, 0, 0], '#c9b68d'); }
      // 门楣上的人物群：一排小立像
      const nf = dz ? 5 : 9; for (let k = 0; k < nf; k++) { const pz = zc + dz + (k - (nf - 1) / 2) * (wid * 0.5 / nf) * 1.5, py = hgt * 0.27 + wid * 0.4 + 0.5 + (dz ? 0 : (1 - Math.abs(k - 4) / 4) * 1.4); E.taper(X + 5.0, py, pz, 0.26, 1.25, '#d8c7a0'); E.ball(X + 5.0, py + 1.42, pz, 0.19, '#d8c7a0'); }
      E.box(X + 4.9, hgt * 0.27 + wid * 0.4, zc + dz, 0.5, 0.4, wid * 0.62, '#b39c74');
      E.taper(X + 4.4, hgt - 0.5, zc + dz, 0.5, 4.5, '#cdb991');
    }
    for (const dz of [-5.6, 5.6]) { E.cone(X + 3.6, 30, zc + dz, 1.1, 13, DARK); E.ball(X + 3.6, 43.4, zc + dz, 0.5, '#e8b923'); }
    // 中门顶上的柏树与白鸽
    E.cone(X + 3.4, 50, zc, 2.3, 12, '#3f7a3a'); E.cone(X + 3.4, 54, zc, 1.7, 9, '#4b8c44'); E.ball(X + 3.4, 63, zc, 0.5, '#d84a2f');
    for (let k = 0; k < 14; k++) { const a = k * 2.4, y = 51 + (k / 14) * 9; E.ball(X + 3.4 + Math.cos(a) * (2.3 - (y - 50) * 0.16), y, zc + Math.sin(a) * (2.3 - (y - 50) * 0.16), 0.22, '#ffffff'); }
    for (const dz of [-6.1, 6.1]) { E.taper(X + 5.2, 0, zc + dz, 0.55, 14, '#cdb990'); E.ball(X + 5.2, 14.5, zc + dz, 0.9, '#b9a47f', 0.7); }   // 两根棕榈柱
  }
  // ===== 受难立面（-X）：冷硬、像骨头 =====
  {
    const X = -30.3, zc = C.CROSS.z, BONE = '#e9e0cb';
    ES.box(X - 1.2, 0, zc, 3, 42, 30, '#e1d6bd');
    for (let k = 0; k < 6; k++) { const z = zc + (k - 2.5) * 5.2; E.rod([X - 13.5, 0, z], [X - 3, 19, z + (k < 3 ? 0.8 : -0.8)], 0.72, BONE, 'taper'); E.ball(X - 13.5, 0.4, z, 1.0, BONE, 0.6); }
    E.raw('box', [X - 6.5, 20, zc], [11.5, 0.7, 30], [0, 0, 0.2], '#ddd2ba');                                // 斜出的门廊顶
    for (let k = 0; k < 18; k++) { const z = zc + (k - 8.5) * 1.5; E.rod([X - 3.2, 29, z], [X - 2.6, 37.5, z], 0.26, BONE, 'taper'); }      // 上面一排十八根小骨柱
    E.box(X - 3, 28.2, zc, 1.6, 0.8, 28, BONE); E.prism(X - 2.8, 37.5, zc, 28, 8.5, 1.6, '#e1d6bd', Math.PI / 2);
    E.box(X - 2.8, 46, zc, 0.5, 6, 0.5, '#f3ecdc'); E.box(X - 2.8, 49.5, zc, 0.5, 0.5, 3.2, '#f3ecdc');        // 山花顶的十字
    for (const dz of [0, -9, 9]) { E.box(X - 2.95, 0, zc + dz, 0.2, dz ? 8 : 11, dz ? 3.2 : 4.6, '#2b241c'); }
    E.box(X - 3.4, 12.5, zc, 0.35, 4.2, 0.35, '#8a7c66'); E.box(X - 3.4, 15.2, zc, 0.35, 0.35, 2.6, '#8a7c66'); // 门上的十字架
    for (let k = 0; k < 40; k++) E.box(X - 2.95, 2 + R() * 24, zc + (R() * 2 - 1) * 14, 0.3, 0.6 + R() * 1.6, 0.6 + R() * 1.8, ['#d8ccb2', '#e9e0cb', '#cfc2a6'][k % 3]);
  }
  // ===== 荣耀立面（+Z）：最大的一面，现实中未完成，这里是示意 =====
  {
    const Z = C.Z_GLORY + 0.3;
    ES.box(0, 0, Z + 1.3, 45.6, 42, 3, LIGHT);
    for (let k = 0; k < 8; k++) { const x = (k - 3.5) * 5.9; E.taper(x, 0, Z + 10.5, 1.15, 23, WHITE); E.ball(x, 23.4, Z + 10.5, 1.5, '#e6dabd', 0.6); }
    E.box(0, 23.5, Z + 6.5, 47, 1.6, 10, LIGHT);
    for (let k = 0; k < 7; k++) { const x = (k - 3) * 5.9, big = k === 3; E.box(x, 0, Z + 2.9, big ? 4.4 : 3.2, big ? 13 : 9.5, 0.2, '#2b241c'); E.prism(x, big ? 13 : 9.5, Z + 2.9, big ? 4.4 : 3.2, big ? 4 : 3, 0.2, '#2b241c'); }
    for (let k = 0; k < 16; k++) { const x = (k - 7.5) * 2.9, hgt = 9 + (1 - Math.abs(k - 7.5) / 7.5) * 16 + (k % 2) * 3; E.cone(x, 25.1, Z + 6 + (k % 2) * 2.4, 1.5, hgt, WHITE); E.ball(x, 25.4 + hgt, Z + 6 + (k % 2) * 2.4, 0.5, FRUIT[k % 6]); }
    for (let k = 0; k < 3; k++) E.box(0, 0, Z + 15 + k * 1.1, 52 + k * 3, 0.45 - k * 0.14, 2, '#d9cfb8');
    const rose = new THREE.Mesh(new THREE.CircleGeometry(5.4, 40), extGlass.clone()); rose.material.map = glassTexture(MIXED, 44, 'rose'); rose.position.set(0, 33.5, Z + 2.85); ext.add(rose);
  }

  // ===== 十八座塔 =====
  const towerMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.88, map: towerTexture(7) });
  const bigTowerMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, map: towerTexture(9) }); bigTowerMat.map = bigTowerMat.map.clone(); bigTowerMat.map.repeat.set(6, 1);
  const glow = new THREE.MeshBasicMaterial({ color: '#fff4c8', toneMapped: false });
  const G = batcher(ext, glow, { cast: false, receive: false });
  const MOSAIC = [['#d8402b', '#f0c419', '#ffffff'], ['#f0c419', '#d8402b', '#ffffff'], ['#3f9b55', '#f0c419', '#ffffff'], ['#d8402b', '#ffffff', '#f0c419']];
  C.TOWERS.forEach((t, ti) => {
    const { pts, top, rTop } = towerProfile(t);
    const body = new THREE.Mesh(new THREE.LatheGeometry(pts, t.kind === 'apostle' ? 18 : 28), t.kind === 'apostle' ? towerMat : bigTowerMat);
    body.position.set(t.x, 0, t.z); body.rotation.y = ti * 0.7; body.castShadow = body.receiveShadow = true; ext.add(body);
    if (t.kind === 'apostle') {
      // 权杖形尖顶：黄色杆身、红环、白球，顶上一个带十字的圆盘
      const [a, b, c] = MOSAIC[ti % 4];
      E.taper(t.x, top, t.z, rTop * 0.95, 6.5, b); E.ring(t.x, top + 1.2, t.z, rTop * 1.5, a); E.ring(t.x, top + 3.4, t.z, rTop * 1.3, a);
      for (let k = 0; k < 6; k++) { const an = k * 1.047; E.ball(t.x + Math.cos(an) * rTop * 1.05, top + 5.2, t.z + Math.sin(an) * rTop * 1.05, 0.42, c); }
      E.ball(t.x, top + 7.6, t.z, 1.25, a, 1.25); E.ring(t.x, top + 9.4, t.z, 1.5, b);
      E.raw('cyl', [t.x, top + 11.6, t.z], [3.4, 0.5, 3.4], [Math.PI / 2, 0, (t.face === 'glory' ? 0 : Math.PI / 2)], c);
      E.box(t.x, top + 12.6, t.z, 0.4, 2.4, 0.4, c); E.ball(t.x, top + 11.6, t.z, 0.6, a);
      for (let k = 0; k < 4; k++) { const an = k * 1.571 + 0.6; E.ball(t.x + Math.cos(an) * 1.3, top + 10.2, t.z + Math.sin(an) * 1.3, 0.36, '#ffffff'); }
    } else if (t.kind === 'jesus') {
      // 17 米的四臂十字架，白釉面，夜里会亮
      E.taper(t.x, top, t.z, 1.9, 4, WHITE); E.box(t.x, top + 3.5, t.z, 1.7, 14.5, 1.7, '#ffffff');
      E.box(t.x, top + 10.2, t.z, 9.4, 1.7, 1.7, '#ffffff'); E.box(t.x, top + 10.2, t.z, 1.7, 1.7, 9.4, '#ffffff');
      for (const [dx, dz] of [[4.9, 0], [-4.9, 0], [0, 4.9], [0, -4.9]]) G.ball(t.x + dx, top + 11.05, t.z + dz, 0.75, '#fff4c8'); G.ball(t.x, top + 18.4, t.z, 0.8, '#fff4c8');
      for (let k = 0; k < 4; k++) { const an = k * 1.571 + 0.785; E.cone(t.x + Math.cos(an) * 10.6, t.y0 - 6, t.z + Math.sin(an) * 10.6, 1.6, 22, WHITE); }
    } else if (t.kind === 'mary') {
      E.taper(t.x, top, t.z, 1.3, 3, '#dfe9f2'); E.ring(t.x, top + 1, t.z, 1.9, '#3f6fd8');
      const star = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, 0), glow); star.position.set(t.x, top + 5.6, t.z); ext.add(star);
      for (let k = 0; k < 12; k++) { const v = new THREE.Vector3().setFromSphericalCoords(1, Math.acos(1 - 2 * (k + 0.5) / 12), k * 2.4); G.rod([t.x + v.x * 0.6, top + 5.6 + v.y * 0.6, t.z + v.z * 0.6], [t.x + v.x * 3.4, top + 5.6 + v.y * 3.4, t.z + v.z * 3.4], 0.55, '#fff7d6', 'cone'); }
    } else {
      // 福音塔顶：带翅膀的象征物，简化成一个白色的有翼体
      E.taper(t.x, top, t.z, 1.1, 3.2, WHITE); E.ball(t.x, top + 4.6, t.z, 1.25, '#ffffff', 1.2);
      const out = Math.atan2(t.x, t.z - C.CROSS.z);
      for (const sgn of [-1, 1]) E.raw('box', [t.x + Math.cos(out) * sgn * 1.9, top + 6, t.z - Math.sin(out) * sgn * 1.9], [3.4, 2.4, 0.3], [0, out, sgn * 0.5], '#ffffff');
      E.ball(t.x, top + 8.2, t.z, 0.5, '#f0c419');
    }
  });
  ES.build(); E.build(); G.build();

  // ====================== 内部 ======================
  const litStone = glassLit(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, map: stoneTexture('#cfc6b6', 21) }));
  const litPlain = glassLit(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 }));
  const litFloor = glassLit(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55, metalness: 0.05, map: floorTexture() }), 1.25);
  const I = batcher(int, litPlain, { cast: false, receive: false });
  // 地面：按平面外轮廓挖出来
  {
    const sh = new THREE.Shape(); sh.moveTo(-C.NAVE_HALF, -C.Z_GLORY); sh.lineTo(C.NAVE_HALF, -C.Z_GLORY); sh.lineTo(C.NAVE_HALF, -C.Z_NAVE_END); sh.lineTo(C.TRANS_HALF, -C.Z_NAVE_END); sh.lineTo(C.TRANS_HALF, -C.Z_TRANS_END);
    sh.lineTo(C.APSE.r, -C.Z_TRANS_END); sh.absarc(C.APSE.x, -C.APSE.z, C.APSE.r, 0, Math.PI, false); sh.lineTo(-C.TRANS_HALF, -C.Z_TRANS_END); sh.lineTo(-C.TRANS_HALF, -C.Z_NAVE_END); sh.lineTo(-C.NAVE_HALF, -C.Z_NAVE_END); sh.closePath();
    const g = new THREE.ShapeGeometry(sh, 24); const uv = g.attributes.uv, pos = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 6, pos.getY(i) / 6);
    const floor = new THREE.Mesh(g, litFloor); floor.rotation.x = -Math.PI / 2; int.add(floor);
  }
  // 圣坛台与台阶
  { const P = C.PRESBYTERY; for (let k = 0; k < 8; k++) I.box(0, 0, P.z0 - (k + 0.5) * (P.z0 - P.z1) / 8, 59.8, P.h * (k + 1) / 8, (P.z0 - P.z1) / 8, '#d8d0c2'); I.box(0, 0, (P.z1 + C.Z_TRANS_END) / 2, 59.8, P.h, P.z1 - C.Z_TRANS_END, '#d8d0c2'); I.cyl(C.APSE.x, 0, C.APSE.z, 17.9, P.h, '#d8d0c2'); }
  // 内墙（朝里的单面板）
  const wall = (x, y, z, w, h, ry, color = '#ffffff', mat = litStone) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat.clone()); m.material.onBeforeCompile = mat.onBeforeCompile; m.material.customProgramCacheKey = mat.customProgramCacheKey; m.material.color.set(color); m.material.map = mat.map.clone(); m.material.map.repeat.set(w / 8, h / 8); m.position.set(x, y + h / 2, z); m.rotation.y = ry; int.add(m); return m; };
  for (const sx of [-1, 1]) {
    wall(sx * C.NAVE_HALF, 0, naveMid, naveLen, C.H.aisle, -sx * Math.PI / 2, '#d9d1c2');                     // 侧廊外墙
    wall(sx * 15, C.H.aisle, naveMid, naveLen, C.H.nave - C.H.aisle, -sx * Math.PI / 2, '#e3dccf');           // 中廊高窗那一段
    wall(sx * C.TRANS_HALF, 0, transMid, transLen, C.H.nave, -sx * Math.PI / 2, '#d9d1c2');                   // 横厅尽端
    wall(sx * (C.NAVE_HALF + C.TRANS_HALF) / 2, 0, C.Z_NAVE_END, C.TRANS_HALF - C.NAVE_HALF, C.H.nave, Math.PI, '#d5cdbe');
    wall(sx * (15 + C.NAVE_HALF) / 2, C.H.aisle, C.Z_NAVE_END, C.NAVE_HALF - 15, C.H.nave - C.H.aisle, Math.PI, '#d5cdbe');
    wall(sx * (C.APSE.r + C.TRANS_HALF) / 2, 0, C.Z_TRANS_END, C.TRANS_HALF - C.APSE.r, C.H.nave, 0, '#d5cdbe');
  }
  wall(0, 0, C.Z_GLORY, 45, C.H.nave, Math.PI, '#d9d1c2');
  wall(0, C.H.nave, C.Z_TRANS_END, C.APSE.r * 2, 8, Math.PI, '#dcd4c6');
  { const g = new THREE.CylinderGeometry(C.APSE.r, C.APSE.r, C.H.nave + 6, 40, 1, true, Math.PI / 2, Math.PI); const m = new THREE.Mesh(g, litStone.clone()); m.material.onBeforeCompile = litStone.onBeforeCompile; m.material.customProgramCacheKey = litStone.customProgramCacheKey; m.material.side = THREE.BackSide; m.material.color.set('#dcd4c6'); m.material.map = litStone.map.clone(); m.material.map.repeat.set(7, 6); m.position.set(C.APSE.x, (C.H.nave + 6) / 2, C.APSE.z); int.add(m); }
  // 十字交叉的升高井壁
  for (const [x, z, ry] of [[0, C.CROSS.z - 7.5, 0], [0, C.CROSS.z + 7.5, Math.PI], [-7.5, C.CROSS.z, Math.PI / 2], [7.5, C.CROSS.z, -Math.PI / 2]]) wall(x, C.H.nave, z, 15, C.H.crossing - C.H.nave, ry, '#e9e3d6');

  // 拱顶：起伏的网面，每个双曲面中间一个采光口
  const oculi = [];
  const ceilMat = (new THREE.MeshBasicMaterial({ color: '#ffffff', vertexColors: true, side: THREE.BackSide, map: canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#efe9dc'; g.fillRect(0, 0, w, h); g.translate(w / 2, h / 2);
    for (let k = 0; k < 24; k++) { g.rotate(Math.PI / 12); g.fillStyle = k % 2 ? '#d9d0bd' : '#f8f4ea'; g.beginPath(); g.moveTo(0, 0); g.lineTo(w * 0.72, -9); g.lineTo(w * 0.72, 9); g.closePath(); g.fill(); }
    const rg = g.createRadialGradient(0, 0, 4, 0, 0, 46); rg.addColorStop(0, '#fff8e0'); rg.addColorStop(1, '#fff8e000'); g.fillStyle = rg; g.beginPath(); g.arc(0, 0, 46, 0, 7); g.fill();
  }) }));
  function vault(x0, x1, z0, z1, y, cell, lift) {
    const w = x1 - x0, d = z1 - z0, nx = Math.round(w / cell), nz = Math.round(d / cell), sx = nx * 8, sz = nz * 8;
    const g = new THREE.PlaneGeometry(w, d, sx, sz); const pos = g.attributes.position, uv = g.attributes.uv, cols = [];
    for (let i = 0; i < pos.count; i++) {
      const u = (pos.getX(i) + w / 2) / w * nx, v = (pos.getY(i) + d / 2) / d * nz, fu = u - Math.floor(u) - 0.5, fv = v - Math.floor(v) - 0.5, r = Math.hypot(fu, fv);
      // 双曲面的样子：每格中间往上收成一个喉口，格与格之间是下垂的肋
      const hh = Math.exp(-r * r * 9) * 1.0 + 0.35 * Math.cos(Math.min(r, 0.5) * Math.PI * 2) - 0.35;
      pos.setZ(i, lift * hh); uv.setXY(i, u, v);
      // 明暗直接烤进顶点色：喉口亮、肋的下缘暗，不依赖灯
      const sh = 0.5 + 0.42 * Math.max(0, hh + 0.6) / 1.6 + 0.3 * Math.exp(-r * r * 40); cols.push(sh, sh * 0.985, sh * 0.95);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); const m = new THREE.Mesh(g, ceilMat); m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); int.add(m);
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) oculi.push([x0 + (i + 0.5) * w / nx, y + lift * 0.76, z1 - (j + 0.5) * d / nz, cell * 0.13]);
  }
  vault(-15, 15, C.Z_NAVE_END, C.Z_GLORY, C.H.nave, 7.5, 4.2);                       // 中廊与内侧廊
  for (const sx of [-1, 1]) vault(sx > 0 ? 15 : -C.NAVE_HALF, sx > 0 ? C.NAVE_HALF : -15, C.Z_NAVE_END, C.Z_GLORY, C.H.aisle, 7.5, 3);
  for (const sx of [-1, 1]) vault(sx > 0 ? 7.5 : -C.TRANS_HALF, sx > 0 ? C.TRANS_HALF : -7.5, C.Z_TRANS_END, C.Z_NAVE_END, C.H.nave, 7.5, 4.2);
  vault(-7.5, 7.5, C.Z_TRANS_END, C.CROSS.z - 7.5, C.H.nave, 7.5, 4.2); vault(-7.5, 7.5, C.CROSS.z + 7.5, C.Z_NAVE_END, C.H.nave, 7.5, 4.2);
  vault(-7.5, 7.5, C.CROSS.z - 7.5, C.CROSS.z + 7.5, C.H.crossing, 5, 5);            // 十字交叉 60 米
  // 后殿：金色的半穹顶，正中一个大采光口
  { const g = new THREE.SphereGeometry(C.APSE.r, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2); const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#e9d9a8', roughness: 0.6, metalness: 0.25, side: THREE.BackSide, emissive: '#7a5d1c', emissiveIntensity: 0.35 })); m.scale.set(1, 1.35, 1); m.position.set(C.APSE.x, C.H.nave + 6, C.APSE.z); int.add(m); oculi.push([C.APSE.x, C.H.nave + 6 + C.APSE.r * 1.33, C.APSE.z, 2.6]); }
  const IG = batcher(int, new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), { cast: false, receive: false });
  for (const [x, y, z, r] of oculi) IG.raw('cyl', [x, y, z], [r * 2, 0.1, r * 2], null, '#fff6d8');

  // 柱林：柱身 → 节（挂灯）→ 一级分枝 → 二级细枝
  const trunkMat = glassLit(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.62, map: canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#00000016' : '#ffffff00'; g.fillRect(i * 8, 0, 8, h); } }, { repeat: [2, 1] }) }), 0.95);
  const K = batcher(int, trunkMat, { cast: false, receive: false });
  const COLC = { crossing: '#a24a3c', nave: '#6f7682', aisle: '#bdb7aa', apse: '#b9b2a3' };
  C.COLUMNS.forEach((c, ci) => {
    const col = c.kind === 'nave' && ci % 5 === 2 ? '#9a5546' : COLC[c.kind], pale = '#e6dfd0';
    K.raw('taper', [c.x, 0.9, c.z], [c.r * 3.2, 1.8, c.r * 3.2], null, col);                                    // 柱础
    K.rod([c.x, 1.6, c.z], [c.x, c.knot, c.z], c.r, col, 'taper');
    K.ball(c.x, c.knot + c.r * 0.5, c.z, c.r * 1.75, pale, 0.85);                                               // 节
    const lamps = c.kind === 'aisle' ? 4 : 6; for (let k = 0; k < lamps; k++) { const a = k * Math.PI * 2 / lamps + ci; IG.ball(c.x + Math.cos(a) * c.r * 1.7, c.knot + c.r * 0.5, c.z + Math.sin(a) * c.r * 1.7, c.r * 0.26, '#ffe9b0', 1.5); }
    const nb = c.kind === 'aisle' ? 4 : 5, reach = c.kind === 'crossing' ? 5.5 : c.kind === 'aisle' ? 3 : 4.2, mid = c.knot + (c.top - c.knot) * 0.58;
    for (let k = 0; k < nb; k++) {
      const a = k * Math.PI * 2 / nb + ci * 0.7, bx = c.x + Math.cos(a) * reach * 0.5, bz = c.z + Math.sin(a) * reach * 0.5;
      K.rod([c.x, c.knot + c.r, c.z], [bx, mid, bz], c.r * 0.36, pale, 'taper');
      K.ball(bx, mid, bz, c.r * 0.5, pale);
      for (let q = 0; q < 4; q++) { const a2 = a + (q - 1.5) * 0.55, rr = reach * (0.75 + (q % 2) * 0.3); K.rod([bx, mid, bz], [c.x + Math.cos(a2) * rr, c.top + 1.2, c.z + Math.sin(a2) * rr], c.r * 0.15, '#efe9dc', 'taper'); }
    }
  });
  K.build();

  // 彩窗（自发光的玻璃面片）
  const mkGlass = (pal, seed, shape) => new THREE.MeshBasicMaterial({ map: glassTexture(pal, seed, shape), transparent: true, alphaTest: 0.4, toneMapped: false });
  const glassCool = [mkGlass(COOL, 1), mkGlass(COOL, 2), mkGlass(COOL.slice().reverse(), 3)], glassWarm = [mkGlass(WARM, 4), mkGlass(WARM, 5), mkGlass(WARM.slice().reverse(), 6)], glassMixed = [mkGlass(MIXED, 7), mkGlass(MIXED.slice().reverse(), 8)];
  const roseCool = mkGlass(COOL, 9, 'rose'), roseWarm = mkGlass(WARM, 10, 'rose'), roseMixed = mkGlass(MIXED, 12, 'rose');
  const winGroups = new Map();
  const win = (mat, x, y, z, w, h, ry) => { (winGroups.get(mat) || winGroups.set(mat, []).get(mat)).push([x, y + h / 2, z, w, h, ry]); };
  let wi = 0;
  for (let k = 0; k < C.BAYS; k++) for (const sx of [-1, 1]) {
    const set = sx > 0 ? glassCool : glassWarm, z = C.BAY_Z0 + C.BAY * (k + 0.5);
    for (const tier of C.WINDOW_TIERS) for (const o of [-1, 1]) win(set[wi++ % 3], sx * (C.NAVE_HALF - 0.06), tier.y, z + o * (tier.y > 18 ? 1.3 : 1.55), tier.w * 2, tier.h + tier.w * 1.8, -sx * Math.PI / 2);
    win(sx > 0 ? roseCool : roseWarm, sx * (C.NAVE_HALF - 0.06), 16.2, z, 2.6, 2.6, -sx * Math.PI / 2);
    for (const o of [-1.6, 0, 1.6]) win(set[wi++ % 3], sx * (15 - 0.06), C.H.aisle + 3.5, z + o, 1.3, 8.5, -sx * Math.PI / 2);                       // 中廊高窗
  }
  for (const sx of [-1, 1]) {                                                                     // 横厅尽端：玫瑰窗 + 一排尖窗
    const set = sx > 0 ? glassCool : glassWarm, x = sx * (C.TRANS_HALF - 0.06);
    win(sx > 0 ? roseCool : roseWarm, x, 19, C.CROSS.z, 10, 10, -sx * Math.PI / 2);
    for (let k = 0; k < 5; k++) { const dz = (k - 2) * 3.2; if (k === 2) { win(set[k % 3], x, 9, C.CROSS.z, 2.2, 8.5, -sx * Math.PI / 2); continue; } win(set[k % 3], x, 5, C.CROSS.z + dz, 2.2, 12, -sx * Math.PI / 2); }
    for (let k = 0; k < 4; k++) win(set[(k + 1) % 3], x, 31, C.CROSS.z + (k - 1.5) * 4.4, 2.4, 11, -sx * Math.PI / 2);
  }
  win(roseMixed, 0, 24, C.Z_GLORY - 0.06, 12, 12, Math.PI);                                       // 荣耀门内侧
  for (let k = 0; k < 6; k++) { const x = (k - 2.5) * 6.4; win(glassMixed[k % 2], x, 12.5, C.Z_GLORY - 0.06, 2.6, 9, Math.PI); win(glassMixed[(k + 1) % 2], x, 36, C.Z_GLORY - 0.06, 2.2, 7, Math.PI); }
  for (let i = 0; i < 9; i++) { const a = Math.PI * (0.07 + 0.86 * i / 8), rr = C.APSE.r - 0.08, set = i < 3 ? glassCool : i > 5 ? glassWarm : glassMixed; win(set[i % set.length], Math.cos(a) * rr, 8, C.APSE.z - Math.sin(a) * rr, 2.6, 15, a - Math.PI / 2); win(set[(i + 1) % set.length], Math.cos(a) * rr, 27, C.APSE.z - Math.sin(a) * rr, 2.4, 13, a - Math.PI / 2); }
  const glassMeshes = [];
  for (const [mat, arr] of winGroups) {
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, arr.length);
    arr.forEach(([x, y, z, w, h, ry], i) => { _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(0, ry, 0)), _s.set(w, h, 1)); mesh.setMatrixAt(i, _m); });
    mesh.frustumCulled = false; int.add(mesh); glassMeshes.push(mesh);
  }
  const coolMats = [...glassCool, roseCool], warmMats = [...glassWarm, roseWarm], mixedMats = [...glassMixed, roseMixed];

  // 光柱：从每扇下层侧窗斜着打进来的两片交叉薄片
  const rayTex = rayTexture(), L = new THREE.Vector3(-1, -0.62, -0.16).normalize();
  const rayMat = col => new THREE.MeshBasicMaterial({ map: rayTex, color: col, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
  const rays = { cool: rayMat('#6fd0ff'), warm: rayMat('#ffb238') };
  function rayMesh(side) {
    const s = side === 'cool' ? 1 : -1, dir = new THREE.Vector3(L.x * s, L.y, L.z), verts = [], uvs = [], idx = [];
    const quad = (a, b, len) => { const n = verts.length / 3; for (const [p, v] of [[a, 0], [b, 0]]) { verts.push(p.x, p.y, p.z); uvs.push(p === a ? 0 : 1, 1 - v); } for (const p of [a, b]) { const e = p.clone().addScaledVector(dir, len); verts.push(e.x, e.y, e.z); uvs.push(p === a ? 0 : 1, 0); } idx.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); };
    for (let k = 0; k < C.BAYS; k++) for (const tier of C.WINDOW_TIERS) for (const o of [-1, 1]) {
      const z = C.BAY_Z0 + C.BAY * (k + 0.5) + o * (tier.y > 18 ? 1.3 : 1.55), x = s * (C.NAVE_HALF - 0.2), y0 = tier.y, y1 = tier.y + tier.h + tier.w, len = Math.min(46, (y1 + 1) / -L.y);
      quad(new THREE.Vector3(x, y0, z), new THREE.Vector3(x, y1, z), len);
      quad(new THREE.Vector3(x, (y0 + y1) / 2, z - tier.w), new THREE.Vector3(x, (y0 + y1) / 2, z + tier.w), len);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx);
    const m = new THREE.Mesh(g, rays[side]); m.renderOrder = 5; m.frustumCulled = false; int.add(m); return m;
  }
  rayMesh('cool'); rayMesh('warm');

  // 长椅
  for (const p of C.PEWS) { I.box(p.x, 0.38, p.z, p.hx * 2, 0.08, 0.5, '#5a3b26'); I.box(p.x, 0, p.z + 0.26, p.hx * 2, 0.95, 0.07, '#4a2f1e'); for (const e of [-1, 1]) I.box(p.x + e * p.hx, 0, p.z, 0.08, 0.95, 0.62, '#3f2819'); }
  // 祭台、华盖、十字架、管风琴
  {
    const y = C.PRESBYTERY.h, az = -22.5;
    I.box(0, y, az, 3.6, 1.05, 2, '#8c2f28'); I.box(0, y + 1.05, az, 3.9, 0.12, 2.3, '#e9e2d2');
    // 七边形华盖，悬在祭台上方，边上一圈灯
    const cano = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.3, 0.4, 7), new THREE.MeshStandardMaterial({ color: '#e9dfc0', roughness: 0.6, emissive: '#6e5518', emissiveIntensity: 0.35 })); cano.position.set(0, y + 9.4, az); int.add(cano);
    const cano2 = new THREE.Mesh(new THREE.ConeGeometry(3.0, 1.3, 7), cano.material); cano2.position.set(0, y + 10.25, az); int.add(cano2);
    for (let k = 0; k < 28; k++) { const a = k / 28 * Math.PI * 2; IG.ball(Math.cos(a) * 3.25, y + 9.05, az + Math.sin(a) * 3.25, 0.09, '#ffe9b0', 1.4); }
    for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2 + 0.2; I.rod([Math.cos(a) * 2.9, y + 9.6, az + Math.sin(a) * 2.9], [Math.cos(a) * 0.4, y + 22, az + Math.sin(a) * 0.4], 0.035, '#bfb28a'); }
    I.box(0, y + 3.6, az, 0.16, 3.6, 0.16, '#6b4a2a'); I.box(0, y + 6.1, az, 2.1, 0.16, 0.16, '#6b4a2a'); I.box(0, y + 4.6, az + 0.12, 0.3, 1.5, 0.12, '#e3c9a0');
    // 管风琴：一排排高低不一的银白音管
    for (let k = 0; k < 46; k++) { const x = (k - 22.5) * 0.28, hgt = 5.5 + Math.abs(Math.sin(k * 0.42)) * 6.5 + (k % 2); I.cyl(x, y, -37.5, 0.11, hgt, k % 3 ? '#dfe3e6' : '#c9ced2'); }
    for (const sx of [-1, 1]) for (let k = 0; k < 14; k++) I.cyl(sx * (7.2 + k * 0.3), y, -36.8 + k * 0.08, 0.12, 9.5 - k * 0.4, '#dfe3e6');
    I.box(0, y, -37.5, 13.4, 1.6, 1.4, '#6b4a2a');
    for (const sx of [-1, 1]) for (let k = 0; k < 6; k++) I.box(sx * (7 + k * 1.1), y, -25.5 - Math.abs(k - 2.5) * 0.5, 0.9, 1.0, 0.9, '#5a3b26');      // 圣职席
  }
  // 两侧的唱诗班楼座
  for (const sx of [-1, 1]) { I.box(sx * 18.9, 15.4, naveMid, 7, 0.5, naveLen - 4, '#e3dccf'); for (let k = 0; k < 40; k++) I.box(sx * 15.6, 15.9, C.Z_NAVE_END + 2.5 + k * 1.0, 0.12, 1.1, 0.12, '#cfc7b8'); I.box(sx * 15.6, 17, naveMid, 0.2, 0.12, naveLen - 4, '#bfb7a8'); }
  I.build(); IG.build();

  // 天穹
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1900, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: new THREE.Vector3(1, 0.6, 0.2).normalize() }, uHor: { value: new THREE.Color('#dfe6ea') }, uZen: { value: new THREE.Color('#7fa8cf') }, uGlow: { value: new THREE.Color('#fff0cc') } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `varying vec3 vD; uniform vec3 uSun, uHor, uZen, uGlow;
      void main(){ vec3 d = normalize(vD); float h = clamp(d.y, 0., 1.); vec3 c = mix(uHor, uZen, pow(h, .5));
        float s = max(dot(d, uSun), 0.); c += uGlow * (pow(s, 8.) * .35 + pow(s, 240.) * 1.6);
        gl_FragColor = vec4(c, 1.);
        #include <colorspace_fragment>
      }`,
  }));
  scene.add(sky);

  return {
    ext, int, sky, rays, ceilMat, coolMats, warmMats, mixedMats, extGlass,
    counts: { towers: C.TOWERS.length, columns: C.COLUMNS.length, cityBoxes: cityBoxes.length, trees: treeSpots.length, windows: [...winGroups.values()].reduce((a, b) => a + b.length, 0) },
  };
}
