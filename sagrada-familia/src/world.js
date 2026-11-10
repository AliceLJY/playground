// 圣家堂：全部形体。外部（塔、三个立面、后殿、街区）与内部（柱林、拱顶、彩窗、祭坛）分两组，按镜头在里在外切换显示。
import * as THREE from 'three';
import * as C from './core.js';
import { buildExterior } from './exterior.js';

// ---------- 小工具 ----------
export function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function canvasTex(w, h, draw, { repeat = [1, 1], srgb = true, aniso = 8 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

// 把大量小部件攒成几个 InstancedMesh：同一种基础形体一次绘制。
export function batcher(group, material, { cast = true, receive = true } = {}) {
  const GEO = {
    box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10), taper: new THREE.CylinderGeometry(0.3, 0.5, 1, 10),
    cone: new THREE.ConeGeometry(0.5, 1, 8), ball: new THREE.SphereGeometry(0.5, 10, 7), ring: new THREE.TorusGeometry(0.5, 0.16, 6, 14),
    spike: new THREE.ConeGeometry(0.5, 1, 4), hoop: new THREE.TorusGeometry(0.5, 0.035, 4, 18), disc: new THREE.CircleGeometry(0.5, 16),
    // 抛物线尖券的平面形（朝 +Z），宽 1 高 1，直边占下面六成
    lancet: (() => { const s = new THREE.Shape(); s.moveTo(-0.5, 0); s.lineTo(0.5, 0); s.lineTo(0.5, 0.6); for (let i = 1; i <= 10; i++) { const u = 1 - i / 5; s.lineTo(u * 0.5, 0.6 + 0.4 * (1 - u * u)); } s.closePath(); return new THREE.ShapeGeometry(s); })(),
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
export const GLASS = { uGI: { value: new THREE.Vector3(1, 0.16, 0) }, uGL: { value: new THREE.Vector2(-0.62, -0.16) } };
const GLASS_GLSL = /* glsl */`
uniform vec3 uGI; uniform vec2 uGL;
varying vec3 vGW; varying vec3 vGN;
float gh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float lancet(vec2 p, float w, float h){ if (p.y < 0.) return 0.; float ax = abs(p.x) / w; if (ax > 1.) return 0.; return step(p.y, h + w * 1.8 * sqrt(max(1. - ax * ax, 0.))); }
// 沿光的方向倒推回墙面：落点在不在窗洞里、是哪块玻璃的颜色。返回 rgb=颜色，a=走了多远
vec4 glassHit(vec3 wp, float s, vec3 ca, vec3 cb, vec3 cc){
  vec3 L = normalize(vec3(-s, uGL.x, uGL.y));
  float t = (wp.x - s * 22.5) / L.x; if (t < 0.) return vec4(0.);
  vec3 h = wp - L * t; float m = 0.;
  if (h.z > 3.) {
    if (h.z > 45.) return vec4(0.);
    float qx = (fract((h.z - 3.) / 7.) - .5) * 7.;
    m = max(lancet(vec2(abs(qx) - 1.55, h.y - 4.5), 1.25, 10.5), lancet(vec2(abs(qx) - 1.3, h.y - 19.5), 1.05, 6.5));
    m = max(m, step(length(vec2(qx, h.y - 17.5)), 1.3));
  } else {
    t = (wp.x - s * 30.) / L.x; if (t < 0.) return vec4(0.); h = wp - L * t;
    if (h.z < -27. || h.z > 3.) return vec4(0.);
    float qx = h.z + 12.;
    m = max(step(length(vec2(qx, h.y - 24.)), 5.), lancet(vec2(mod(abs(qx) + 1.6, 3.2) - 1.6, h.y - 5.), 1.1, 9.) * step(abs(qx), 8.));
  }
  if (m <= 0.) return vec4(0.);
  vec2 cell = floor(vec2(h.z * 2.6, h.y * 1.7));
  vec3 col = mix(ca, cb, smoothstep(.15, .85, gh(cell) * .7 + .3 * fract(h.y * .07)));
  col = mix(col, cc, step(.8, gh(cell + 7.3)));
  col = mix(vec3(dot(col, vec3(.3, .5, .2))) + .12, col, .72);
  return vec4(col, t);
}
vec3 sideGlass(vec3 wp, vec3 n, float s, float I, vec3 ca, vec3 cb, vec3 cc){
  if (I < .01) return vec3(0.);
  vec3 L = normalize(vec3(-s, uGL.x, uGL.y));
  float nl = max(dot(n, -L), 0.); if (nl <= 0.) return vec3(0.);
  vec4 g = glassHit(wp, s, ca, cb, cc);
  return g.rgb * nl * I * .95 * exp(-g.a * .012);
}
vec3 glassLight(vec3 wp, vec3 n){
  return sideGlass(wp, n, 1., uGI.x, vec3(.10, .32, 1.), vec3(.12, .85, .45), vec3(.75, 1., .35))
       + sideGlass(wp, n, -1., uGI.y, vec3(1., .16, .06), vec3(1., .55, .05), vec3(1., .9, .25));
}`;
export function glassLit(mat, gain = 1) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uGI = GLASS.uGI; sh.uniforms.uGL = GLASS.uGL;
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
export const MIXED = ['#1f4fd6', '#35c9c0', '#ffc21a', '#f0541a', '#9fe060', '#c2185b', '#fff07a', '#2a8be0'];
export function glassTexture(pal, seed, shape = 'lancet') {
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
export function stoneTexture(base, seed, lines = true) {
  return canvasTex(512, 512, (g, w, h) => {
    const r = rng(seed); g.fillStyle = base; g.fillRect(0, 0, w, h);
    // 大块的深浅斑：风化、雨痕
    for (let i = 0; i < 70; i++) { const x = r() * w, y = r() * h, rad = 30 + r() * 90, gr = g.createRadialGradient(x, y, 2, x, y, rad); const dark = r() < 0.55; gr.addColorStop(0, dark ? 'rgba(70,60,45,0.05)' : 'rgba(255,255,255,0.08)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { g.save(); g.translate(ox, oy); g.fillRect(x - rad, y - rad, rad * 2, rad * 2); g.restore(); } }
    for (let i = 0; i < 9000; i++) { g.fillStyle = r() < 0.5 ? '#0000000b' : '#ffffff10'; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); }
    if (lines) { const rh = 32; for (let y = 0; y < h; y += rh) { g.fillStyle = '#0000001c'; g.fillRect(0, y, w, 1.5); g.fillStyle = '#ffffff18'; g.fillRect(0, y + 1.5, w, 1); const off = (y / rh % 2) * 40 + r() * 10; for (let x = off; x < w; x += 64 + (r() - 0.5) * 20) { g.fillStyle = '#00000016'; g.fillRect(x, y, 1.5, rh); if (r() < 0.3) { g.fillStyle = `rgba(${r() < 0.5 ? '60,50,35' : '255,255,255'},0.06)`; g.fillRect(x, y, 64, rh); } } } }
  });
}
// 塔身：一格格百叶窗洞螺旋上升，窗洞之间是竖向的墩和横向的石片
export function towerTexture(seed, { cols = 6, rows = 84 } = {}) {
  return canvasTex(256, 1024, (g, w, h) => {
    const r = rng(seed); const grad = g.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, '#fbf8f0'); grad.addColorStop(1, '#e9e3d6'); g.fillStyle = grad; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { const x = r() * w, y = r() * h, rad = 20 + r() * 60, gr = g.createRadialGradient(x, y, 2, x, y, rad); gr.addColorStop(0, r() < 0.6 ? 'rgba(80,70,50,0.07)' : 'rgba(255,255,255,0.1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
    for (let i = 0; i < 6000; i++) { g.fillStyle = r() < 0.5 ? '#0000000a' : '#ffffff10'; g.fillRect(r() * w, r() * h, 1 + r() * 2, 2 + r() * 5); }
    const cw = w / cols, rh = h * 0.8 / rows, y0 = h * 0.9;
    for (let j = 0; j < rows; j++) {
      const y = y0 - j * rh, k = j / rows, ow = cw * (0.5 - 0.14 * k), oh = rh * 0.56;
      for (let i = 0; i < cols; i++) {
        const x = ((i + 0.5) * cw + j * cw / 12) % w;
        for (const ox of [-w, 0, w]) { g.fillStyle = '#2e2620'; g.beginPath(); g.roundRect(x + ox - ow / 2, y - oh, ow, oh, [ow * 0.4, ow * 0.4, 1, 1]); g.fill(); g.fillStyle = '#ffffff55'; g.fillRect(x + ox - ow / 2 - 2, y, ow + 4, 1.6); g.fillStyle = '#00000022'; g.fillRect(x + ox - ow / 2 - 2, y + 1.6, ow + 4, 1.4); }
      }
    }
    // 塔身上一段竖排的字带（Sanctus），只画成一串彩色小方块
    for (let k = 0; k < 9; k++) { g.fillStyle = ['#c8452e', '#d9a520', '#c8452e', '#6a8f3c'][k % 4]; g.fillRect(w * 0.5 - 5, h * 0.2 + k * 15, 10, 10); }
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
export function towerProfile(t) {
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
  const stone = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92, map: stoneTexture('#f6f3ec', 11) });
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

  // ===== 教堂外壳、三个立面、十八座塔（见 exterior.js）=====
  const naveLen = C.Z_GLORY - C.Z_NAVE_END, naveMid = (C.Z_GLORY + C.Z_NAVE_END) / 2, transLen = C.Z_NAVE_END - C.Z_TRANS_END, transMid = (C.Z_NAVE_END + C.Z_TRANS_END) / 2;
  const { extGlass } = buildExterior({ ext, E, ES, R, stone, plain, coarse });
  ES.build(); E.build();

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
  {
    const tex = canvasTex(128, 128, (g, w, h) => { const rg = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2); rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.22, '#fff6dcee'); rg.addColorStop(0.5, '#ffeec066'); rg.addColorStop(1, '#ffe8b000'); g.fillStyle = rg; g.fillRect(0, 0, w, h); });
    const om = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, color: '#d8d2c0', fog: false }), oculi.length);
    oculi.forEach(([x, y, z, r], i) => { _m.compose(_p.set(x, y - 0.25, z), _q.setFromEuler(_e.set(Math.PI / 2, 0, 0)), _s.set(r * 5.2, r * 5.2, 1)); om.setMatrixAt(i, _m); }); om.frustumCulled = false; om.renderOrder = 4; int.add(om);
  }

  // 柱林：有棱的柱身一路扭上去（两个方向相反的螺旋叠在一起，越高棱越多越圆）→ 带灯的节 → 一级分枝 → 二级细枝
  const trunkMat = glassLit(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }), 0.95);
  const K = batcher(int, trunkMat, { cast: false, receive: false });
  // 四种石头：斑岩红（十字交叉）、玄武岩深灰（中廊）、花岗岩灰（侧廊）、砂岩米（后殿），棱数 12 / 10 / 8 / 6
  const COLK = { crossing: { c: '#9b4a3d', n: 12 }, nave: { c: '#5f6670', n: 10 }, aisle: { c: '#a8a49b', n: 8 }, apse: { c: '#cbc0a8', n: 6 } };
  function trunkGeo(r, knot, n) {
    const rings = 40, seg = coarse ? 40 : 60, pos = [], idx = [];
    for (let j = 0; j <= rings; j++) {
      const y = knot * j / rings, t = j / rings, flare = y < 1.8 ? 1 + 0.55 * Math.pow(1 - y / 1.8, 2) : 1, rad = r * (1.16 - 0.2 * t) * flare, amp = 0.2 * Math.pow(1 - t, 1.15) + 0.012, tw = t * Math.PI / n * 2.2;
      for (let i = 0; i <= seg; i++) { const th = i / seg * Math.PI * 2, p = 1 + amp * (Math.max(Math.cos(n * (th - tw)), Math.cos(n * (th + tw))) - 0.45); pos.push(Math.cos(th) * rad * p, y, Math.sin(th) * rad * p); }
    }
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) { const a0 = j * (seg + 1) + i, b0 = a0 + seg + 1; idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  for (const kind of Object.keys(COLK)) {
    const cols = C.COLUMNS.filter(c => c.kind === kind); if (!cols.length) continue;
    const mesh = new THREE.InstancedMesh(trunkGeo(cols[0].r, cols[0].knot, COLK[kind].n), trunkMat, cols.length);
    cols.forEach((c, i) => { _m.compose(_p.set(c.x, C.groundY(c.x, c.z), c.z), _q.identity(), _s.set(1, 1, 1)); mesh.setMatrixAt(i, _m); mesh.setColorAt(i, _c.set(COLK[kind].c)); }); mesh.frustumCulled = false; int.add(mesh);
  }
  C.COLUMNS.forEach((c, ci) => {
    const col = COLK[c.kind].c, pale = '#e9e3d6', mid2 = _c.set(col).lerp(new THREE.Color(pale), 0.55).getStyle();
    K.raw('cyl', [c.x, C.groundY(c.x, c.z) + 0.2, c.z], [c.r * 3.6, 0.4, c.r * 3.6], null, col);                 // 柱础的垫石
    // 节：一个椭球，周围嵌一圈椭圆的灯
    K.ball(c.x, c.knot + c.r * 0.9, c.z, c.r * 1.6, pale, 1.3); K.raw('taper', [c.x, c.knot - c.r * 0.3, c.z], [c.r * 2.9, c.r * 1.2, c.r * 2.9], [Math.PI, 0, 0], mid2);
    const lamps = c.kind === 'aisle' ? 4 : 6; for (let k = 0; k < lamps; k++) { const a = k * Math.PI * 2 / lamps + ci; IG.ball(c.x + Math.cos(a) * c.r * 1.42, c.knot + c.r * 0.9, c.z + Math.sin(a) * c.r * 1.42, c.r * 0.36, '#fff4d2', 1.75); }
    // 节上面一小段过渡柱，再分枝
    K.rod([c.x, c.knot + c.r * 1.8, c.z], [c.x, c.knot + c.r * 4.2, c.z], c.r * 0.78, mid2, 'taper');
    const nb = c.kind === 'aisle' ? 4 : 5, reach = c.kind === 'crossing' ? 5.5 : c.kind === 'aisle' ? 3 : 4.2, y0 = c.knot + c.r * 4, mid = y0 + (c.top - y0) * 0.55;
    for (let k = 0; k < nb; k++) {
      const a = k * Math.PI * 2 / nb + ci * 0.7, bx = c.x + Math.cos(a) * reach * 0.5, bz = c.z + Math.sin(a) * reach * 0.5;
      K.rod([c.x, y0, c.z], [bx, mid, bz], c.r * 0.42, pale, 'taper');
      K.ball(bx, mid, bz, c.r * 0.56, pale, 1.2);
      for (let q = 0; q < 4; q++) { const a2 = a + (q - 1.5) * 0.55, rr = reach * (0.75 + (q % 2) * 0.3); K.rod([bx, mid, bz], [c.x + Math.cos(a2) * rr, c.top + 1.2, c.z + Math.sin(a2) * rr], c.r * 0.17, '#efe9dc', 'taper'); }
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

  // 光柱：体积光。沿每条视线取若干点，每个点都用和地面色斑同一套算法问一句「这里被哪块玻璃照到了」，累加起来
  const volMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
    uniforms: { uGI: GLASS.uGI, uGL: GLASS.uGL, uK: { value: 1 }, uSteps: { value: coarse ? 12 : 26 } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform vec3 uGI; uniform vec2 uGL; uniform float uK, uSteps; varying vec3 vW;
      float gh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float lancet(vec2 p, float w, float h){ if (p.y < 0.) return 0.; float ax = abs(p.x) / w; if (ax > 1.) return 0.; return step(p.y, h + w * 1.8 * sqrt(max(1. - ax * ax, 0.))); }
      ${GLASS_GLSL.slice(GLASS_GLSL.indexOf('// 沿光的方向倒推回墙面'), GLASS_GLSL.indexOf('vec3 sideGlass('))}
      float room(vec3 p){ return step(abs(p.x), p.z > 3. ? 22.4 : 29.9) * step(p.y, p.z > 3. && abs(p.x) > 15. ? 30. : 46.); }
      void main(){
        vec3 ro = cameraPosition, rd = vW - ro; float far = min(length(rd), 80.); rd = normalize(rd);
        float n = uSteps, dt = far / n, j = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))));
        vec3 acc = vec3(0.);
        for (float i = 0.; i < 40.; i++) { if (i >= n) break; vec3 p = ro + rd * (i + j) * dt; if (p.y < 0. || room(p) < .5) continue;
          vec4 a = glassHit(p, 1., vec3(.10, .32, 1.), vec3(.12, .85, .45), vec3(.75, 1., .35)), b = glassHit(p, -1., vec3(1., .16, .06), vec3(1., .55, .05), vec3(1., .9, .25));
          acc += (a.rgb * uGI.x * exp(-a.a * .03) + b.rgb * uGI.y * exp(-b.a * .03)) * exp(-(i + j) * dt * .018); }
        gl_FragColor = vec4(acc * dt * .015 * uK, 1.);
      }`,
  });
  const vol = new THREE.Mesh(new THREE.BoxGeometry(61, 62, 92), volMat); vol.position.set(0, 31, 0); vol.renderOrder = 6; vol.frustumCulled = false; int.add(vol);
  const rays = { vol: volMat, mesh: vol };

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
