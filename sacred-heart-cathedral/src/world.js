// 石室圣心大教堂：公用小工具、贴图、彩窗色光，以及内部（束柱、肋拱、彩窗、圣所）。外部见 exterior.js。
import * as THREE from 'three';
import * as C from './core.js';
import { buildExterior } from './exterior.js';

// ---------- 小工具 ----------
export function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function canvasTex(w, h, draw, { repeat = [1, 1], srgb = true, aniso = 8, wrap = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

// 尖券的轮廓点：半宽 a，起脚高 spring，券高 rise（rise 不小于 a）。从右下角逆时针到左下角。
export function archPts(w, spring, rise, n = 12, y0 = 0, cx = 0) {
  const a = w / 2, h = Math.max(rise, a * 1.001), c = (h * h - a * a) / (2 * a), R = a + c, top = Math.atan2(h, c), pts = [[cx + a, y0]];
  for (let i = 0; i <= n; i++) { const f = top * i / n; pts.push([cx - c + R * Math.cos(f), y0 + spring + R * Math.sin(f)]); }
  for (let i = n - 1; i >= 0; i--) { const f = top * i / n; pts.push([cx + c - R * Math.cos(f), y0 + spring + R * Math.sin(f)]); }
  pts.push([cx - a, y0]); return pts;
}
export function archShape(w, spring, rise, y0 = 0, cx = 0, Cls = THREE.Shape) { const s = new Cls(); archPts(w, spring, rise, 12, y0, cx).forEach(([x, y], i) => i ? s.lineTo(x, y) : s.moveTo(x, y)); s.closePath(); return s; }
export function circlePath(cx, cy, r) { const p = new THREE.Path(); p.absarc(cx, cy, r, 0, Math.PI * 2, true); return p; }

// 一片带洞的墙：从 a 到 b（[x,z]），底 y0 顶 y1，厚 thick。holes：{u,y,w,spring,rise} 尖券洞，或 {u,y,r} 圆洞；gable 是顶上再加多高的山尖。
export function slab(group, mat, { a, b, y0 = 0, y1, thick = 0.8, holes = [], gable = 0, cast = true }) {
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz), sh = new THREE.Shape();
  sh.moveTo(0, 0); sh.lineTo(len, 0); sh.lineTo(len, y1 - y0); if (gable) sh.lineTo(len / 2, y1 - y0 + gable); sh.lineTo(0, y1 - y0); sh.closePath();
  for (const h of holes) sh.holes.push(h.r ? circlePath(h.u, h.y - y0, h.r) : archShape(h.w, h.spring, h.rise, h.y - y0, h.u, THREE.Path));
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false, curveSegments: 20 }); g.translate(0, 0, -thick / 2);
  const m = new THREE.Mesh(g, mat), X = new THREE.Vector3(dx / len, 0, dz / len), Z = new THREE.Vector3().crossVectors(X, UP);
  m.matrixAutoUpdate = false; m.matrix.makeBasis(X, UP, Z).setPosition(a[0], y0, a[1]); m.castShadow = cast; m.receiveShadow = cast; group.add(m); return m;
}
// 一圈券边线脚（外券减内券），立在 XY 平面、朝 +Z 挤出 depth
export function archRingGeo(w, spring, rise, band, depth) {
  const s = archShape(w + band * 2, spring, rise + band); s.holes.push(archShape(w, spring, rise, 0, 0, THREE.Path));
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 16 });
}

// 沿一条折线扫一个截面，攒成一个几何：外部的券边圆线脚用。nOf(i) 给每个点截面「朝外」的方向（单位向量）；
// profile 是 [横向, 朝外] 的点列（单位长度乘 r）。
export function sweepGeo(paths) {
  const pos = [], nor = [], idx = [], T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), V = new THREE.Vector3();
  for (const { pts, nOf, profile, r } of paths) {
    const n = profile.length, base = pos.length / 3, pn = profile.map((_, i) => { const a = profile[Math.max(0, i - 1)], b = profile[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dy / l, -dx / l]; });
    pts.forEach((q, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; T.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize(); N.set(...nOf(i)); N.addScaledVector(T, -N.dot(T)).normalize(); B.crossVectors(T, N);
      profile.forEach(([px, py], k) => { pos.push(q[0] + B.x * px * r + N.x * py * r, q[1] + B.y * px * r + N.y * py * r, q[2] + B.z * px * r + N.z * py * r); V.copy(B).multiplyScalar(pn[k][0]).addScaledVector(N, pn[k][1]).normalize(); nor.push(V.x, V.y, V.z); }); });
    for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < n - 1; k++) { const a = base + i * n + k, b = a + n; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx); return g;
}

// 把大量小部件攒成几个 InstancedMesh：同一种基础形体一次绘制。
export function batcher(group, material, { cast = true, receive = true } = {}) {
  const GEO = {
    box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10), taper: new THREE.CylinderGeometry(0.3, 0.5, 1, 10),
    cone: new THREE.ConeGeometry(0.5, 1, 8), flare: new THREE.CylinderGeometry(0.5, 0.36, 1, 12), ball: new THREE.SphereGeometry(0.5, 10, 7), bead: new THREE.SphereGeometry(0.5, 7, 5), spike: new THREE.ConeGeometry(0.5, 1, 4),
    oct: new THREE.CylinderGeometry(0.5, 0.5, 1, 8), hoop: new THREE.TorusGeometry(0.5, 0.06, 5, 20),
    prism: (() => { const s = new THREE.Shape(); s.moveTo(-0.5, 0); s.lineTo(0.5, 0); s.lineTo(0, 1); s.closePath(); const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }); g.translate(0, 0, -0.5); return g; })(),
  };
  const lists = {};
  const push = (kind, pos, scl, rot, color, quat) => (lists[kind] ||= []).push({ pos, scl, rot, color, quat });
  const api = {
    box: (x, y, z, sx, sy, sz, color, ry = 0) => push('box', [x, y + sy / 2, z], [sx, sy, sz], ry ? [0, ry, 0] : null, color),
    cyl: (x, y, z, r, h, color, kind = 'cyl') => push(kind, [x, y + h / 2, z], [r * 2, h, r * 2], null, color),
    cone: (x, y, z, r, h, color) => push('cone', [x, y + h / 2, z], [r * 2, h, r * 2], null, color),
    spike: (x, y, z, r, h, color, ry = Math.PI / 4) => push('spike', [x, y + h / 2, z], [r * 2, h, r * 2], [0, ry, 0], color),
    // 半径不到 0.3 米的小球（卷叶、花饰、灯泡）用低面数的那一种：远看一样，面数少一半多
    ball: (x, y, z, r, color, sy = 1) => push(r < 0.3 ? 'bead' : 'ball', [x, y, z], [r * 2, r * 2 * sy, r * 2], null, color),
    hoop: (x, y, z, r, color, rot) => push('hoop', [x, y, z], [r * 2, r * 2, r * 2], rot || null, color),
    // 三角山花：底边中点在 (x,y,z)，宽 w 高 h 厚 d，ry 是朝向
    prism: (x, y, z, w, h, d, color, ry = 0) => push('prism', [x, y, z], [w, h, d], ry ? [0, ry, 0] : null, color),
    rod: (a, b, r, color, kind = 'cyl') => { const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length(); push(kind, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [r * 2, len, r * 2], null, color, new THREE.Quaternion().setFromUnitVectors(UP, d.normalize())); },
    build() {
      for (const [kind, arr] of Object.entries(lists)) {
        const mesh = new THREE.InstancedMesh(GEO[kind], material, arr.length);
        arr.forEach((it, i) => {
          if (it.quat) _q.copy(it.quat); else if (it.rot) _q.setFromEuler(_e.set(it.rot[0], it.rot[1], it.rot[2])); else _q.identity();
          _m.compose(_p.set(...it.pos), _q, _s.set(...it.scl)); mesh.setMatrixAt(i, _m); mesh.setColorAt(i, _c.set(it.color || '#ffffff'));
        });
        mesh.castShadow = cast; mesh.receiveShadow = receive; mesh.frustumCulled = false; group.add(mesh);
      }
    },
  };
  return api;
}

// ---------- 彩窗光：把窗子的色光「投」到内部所有表面上 ----------
// 不用真实光源：对每个像素沿光的方向倒推回墙面，看落点是不是在窗洞里，是就按那块玻璃的颜色加亮。
// uGI = (东侧窗, 西侧窗, 南面玫瑰窗) 各有多亮；uGL = (光往下的斜率, 往北的斜率)。
export const GLASS = { uGI: { value: new THREE.Vector3(1, 0.12, 0.3) }, uGL: { value: new THREE.Vector2(-0.6, -0.12) } };
const f = v => Number(v).toFixed(3), W = C.WIN;
const GLASS_GLSL = /* glsl */`
uniform vec3 uGI; uniform vec2 uGL;
float gh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float lancet(vec2 p, float w, float h){ if (p.y < 0.) return 0.; float ax = abs(p.x) / w; if (ax > 1.) return 0.; return step(p.y, h + w * 1.6 * sqrt(max(1. - ax * ax, 0.))); }
vec3 gpal(float h){ return h < .3 ? vec3(.12, .3, 1.) : h < .52 ? vec3(1., .14, .1) : h < .72 ? vec3(1., .72, .12) : h < .86 ? vec3(.15, .8, .35) : vec3(.95, .9, .8); }
vec3 gcol(vec2 cell){ vec3 c = gpal(gh(cell)); return mix(vec3(dot(c, vec3(.3, .5, .2))) + .1, c, .8); }
// 开间内的相对位置：返回离开间中线的距离；不在有窗的开间里返回 99
float bayQ(float z){
  if (z < ${f(C.Z_TOWER)} && z > ${f(C.Z_CROSS0)}) return (fract((${f(C.Z_TOWER)} - z) / ${f(C.NAVE_BAY)}) - .5) * ${f(C.NAVE_BAY)};
  if (z < ${f(C.Z_CROSS1)} && z > ${f(C.Z_APSE)}) return (fract((${f(C.Z_CROSS1)} - z) / ${f(C.CH_BAY)}) - .5) * ${f(C.CH_BAY)};
  return 99.;
}
// 高窗的光到对面的高墙为止，不穿过去照到侧廊里。
// 侧面的窗（s=1 东，s=-1 西）：高侧窗、小礼拜堂的窗、横厅尽端的玫瑰窗。返回 rgb=颜色，a=光走了多远
vec4 sideHit(vec3 wp, float s){
  vec3 L = normalize(vec3(-s, uGL.x, uGL.y)); vec4 best = vec4(0.);
  float t = (wp.x - s * ${f(C.AX - 0.3)}) / L.x;
  if (t > 0. && s * wp.x > -${f(C.AX + 0.6)}) { vec3 h = wp - L * t; float q = bayQ(h.z);
    float m = max(lancet(vec2(abs(q) - ${f(W.clere.off)}, h.y - ${f(W.clere.sill)}), ${f(W.clere.w)}, ${f(W.clere.h)}), step(length(vec2(q, h.y - ${f(W.clere.ocY)})), ${f(W.clere.ocR)}));
    if (m > 0.) best = vec4(gcol(floor(vec2(h.z * 3.1, h.y * 2.2))) * .3, t); }
  t = (wp.x - s * ${f(C.CHAP)}) / L.x;
  if (t > 0. && best.a == 0.) { vec3 h = wp - L * t; float q = bayQ(h.z);
    float m = max(lancet(vec2(abs(q) - ${f(W.chapel.off)}, h.y - ${f(W.chapel.sill)}), ${f(W.chapel.w)}, ${f(W.chapel.h)}), step(length(vec2(q, h.y - ${f(W.chapel.ocY)})), ${f(W.chapel.ocR)}));
    // 光要穿过两道拱廊才到中殿：过拱廊那一刻比券顶还高就被墙挡住
    float sx = s * wp.x;
    if (sx < ${f(C.AISLE)}) { float y1 = wp.y - L.y * (wp.x - s * ${f(C.AISLE)}) / L.x; if (y1 > 7.2) m = 0.; }
    if (sx < ${f(C.AX)}) { float y2 = wp.y - L.y * (wp.x - s * ${f(C.AX)}) / L.x; if (y2 > 9.4) m = 0.; }
    if (m > 0.) best = vec4(gcol(floor(vec2(h.z * 3.4, h.y * 2.6)) + 31.), t); }
  t = (wp.x - s * ${f(C.TRANS)}) / L.x;
  if (t > 0. && best.a == 0.) { vec3 h = wp - L * t; vec2 d = vec2(h.z - ${f((C.Z_CROSS0 + C.Z_CROSS1) / 2)}, h.y - ${f(W.transRose.y)}); float r = length(d);
    if (r < ${f(W.transRose.r)}) best = vec4(gcol(vec2(floor(atan(d.y, d.x) * 2.546), floor(r * 1.4)) + 57.), t); }
  return best;
}
vec4 roseHit(vec3 wp){
  vec3 L = normalize(vec3(0., -.62, -1.)); float t = (wp.z - ${f(C.Z_FRONT)}) / L.z; if (t < 0.) return vec4(0.);
  vec3 h = wp - L * t; vec2 d = vec2(h.x, h.y - ${f(W.rose.y)}); float r = length(d); if (r > ${f(W.rose.r)}) return vec4(0.);
  return vec4(gcol(vec2(floor(atan(d.y, d.x) * 2.546), floor(r * 1.5)) + 91.), t);
}
vec3 glassLight(vec3 wp, vec3 n){
  vec3 acc = vec3(0.);
  for (int k = 0; k < 2; k++) { float s = k == 0 ? 1. : -1., I = k == 0 ? uGI.x : uGI.y; if (I < .2) continue;
    vec3 L = normalize(vec3(-s, uGL.x, uGL.y)); float nl = max(dot(n, -L), 0.); if (nl <= 0.) continue;
    vec4 g = sideHit(wp, s); acc += g.rgb * nl * I * exp(-g.a * .035); }
  if (uGI.z > .2) { float nl = max(dot(n, normalize(vec3(0., .62, 1.))), 0.); if (nl > 0.) { vec4 g = roseHit(wp); acc += g.rgb * nl * uGI.z * exp(-g.a * .02); } }
  return acc;
}`;
// 石面的大块深浅、雨水冲出的竖向痕、贴地返潮：取一张可平铺的灰度噪声图，按世界坐标用三种尺度各取一次，
// 盖住石纹贴图每 5 米一重复的规律。比在着色器里现算噪声省得多（手机上也要跑）。
let grimeTex = null;
export function grimeTexture() {
  if (grimeTex) return grimeTex;
  grimeTex = canvasTex(256, 256, (g, w, h) => {
    const r = rng(404); g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    const blob = (x, y, rad, col) => { for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { const gr = g.createRadialGradient(x + ox, y + oy, 1, x + ox, y + oy, rad); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(128,128,128,0)'); g.fillStyle = gr; g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2); } };
    for (let i = 0; i < 90; i++) blob(r() * w, r() * h, 12 + r() * 60, r() < 0.55 ? `rgba(40,40,40,${0.18 + r() * 0.3})` : `rgba(230,230,230,${0.15 + r() * 0.25})`);
    for (let i = 0; i < 3000; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.06)'; g.fillRect(r() * w, r() * h, 2, 2); }
  }, { srgb: false, aniso: 2 });
  return grimeTex;
}
const GRIME_GLSL = /* glsl */`
uniform sampler2D uGrime;
vec3 gGrime(vec3 p, float k){
  vec3 tn = abs(normalize(vGN)); vec2 q = tn.y > .6 ? p.xz : (tn.x > tn.z ? p.zy : p.xy);
  float a = texture2D(uGrime, q * .034).r * .6 + texture2D(uGrime, q * .13 + .37).r * .4;
  float s = texture2D(uGrime, vec2(q.x * .32, q.y * .018) + .61).r;
  float low = 1. - smoothstep(-1.2, 2.2, p.y);
  float m = (a - .5) * .9 + (s - .5) * .55 - low * .16;
  return vec3(1.) + k * vec3(m, m * .96, m * .86);
}`;
// 堂内吊灯的暖光：中殿那一排吊灯、两边侧廊的两排，各当一条线光源（到线段的距离衰减），不投影。
// 强度和颜色由 uWarm 统一调；uDim 是拱顶处还剩几成亮（往上渐暗）。
export const WARM = { uWarm: { value: new THREE.Vector3(0, 0, 0) }, uDim: { value: 0.6 } };
const WARM_GLSL = () => /* glsl */`
uniform vec3 uWarm; uniform float uDim;
float lineL(vec3 wp, vec3 n, vec3 a, float z0, float z1){ vec3 c = vec3(a.x, a.y, clamp(wp.z, z1, z0)), d = c - wp; float l2 = dot(d, d);
  return (max(dot(n, d * inversesqrt(l2 + 1e-4)), 0.) * .7 + .3) / (1. + l2 * .03); }
vec3 warmLight(vec3 wp, vec3 n){
  float acc = lineL(wp, n, vec3(0., 12.4, 0.), ${f(C.naveMid(1))}, ${f(C.Z_CROSS1 - 7.5)})
    + .6 * (lineL(wp, n, vec3(-7.7, 7.9, 0.), ${f(C.naveMid(1))}, ${f(C.naveMid(5))}) + lineL(wp, n, vec3(7.7, 7.9, 0.), ${f(C.naveMid(1))}, ${f(C.naveMid(5))}));
  return acc * uWarm; }`;
// 给材质打补丁：world = 贴图按世界坐标铺（大体块不拉伸）；glass = 接收彩窗色光的强度；
// grime = 石面斑驳的强度；inside = 堂内材质（上部渐暗、吊灯暖光）。贴图带 userData.bump 的同时按世界坐标做凹凸。
export function patch(mat, { world = 0, glass = 0, grime = 0, inside = 0 } = {}) {
  if (world && mat.map && mat.map.userData.bump && !mat.bumpMap) { mat.bumpMap = mat.map.userData.bump; mat.bumpScale = mat.map.userData.bumpScale || 1.6; }
  mat.onBeforeCompile = sh => {
    sh.uniforms.uGI = GLASS.uGI; sh.uniforms.uGL = GLASS.uGL; sh.uniforms.uWarm = WARM.uWarm; sh.uniforms.uDim = WARM.uDim; if (grime) sh.uniforms.uGrime = { value: grimeTexture() };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW; varying vec3 vGN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 gwp = vec4(transformed, 1.); vec3 gn = objectNormal;
        #ifdef USE_INSTANCING
          gwp = instanceMatrix * gwp; gn = mat3(instanceMatrix) * gn;
        #endif
        vGW = (modelMatrix * gwp).xyz; vGN = mat3(modelMatrix) * gn;`);
    const head = `#include <common>
varying vec3 vGW; varying vec3 vGN;
vec2 gTuv(){ vec3 tn = abs(normalize(vGN)); return (tn.y > .6 ? vGW.xz : (tn.x > tn.z ? vGW.zy : vGW.xy)) * ${f(world || 1)}; }
` + (glass ? GLASS_GLSL : '') + (grime ? GRIME_GLSL : '') + (inside ? WARM_GLSL() : '');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', head);
    if (world) {
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `
      #ifdef USE_MAP
        diffuseColor *= texture2D(map, gTuv());
      #endif`);
      // 凹凸也按世界坐标取样；三向投影换面的那一下导数会跳，跳得太大就不算凹凸
      sh.fragmentShader = sh.fragmentShader.replace('#include <bumpmap_pars_fragment>', THREE.ShaderChunk.bumpmap_pars_fragment
        .replace('vec2 dSTdx = dFdx( vBumpMapUv );', 'vec2 gUv = gTuv(); vec2 dSTdx = dFdx( gUv );').replace('vec2 dSTdy = dFdy( vBumpMapUv );', 'vec2 dSTdy = dFdy( gUv ); if (dot(dSTdx, dSTdx) + dot(dSTdy, dSTdy) > .02) return vec2(0.);')
        .replaceAll('vBumpMapUv', 'gUv'));
    }
    if (grime || inside) sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' +
      (grime ? `diffuseColor.rgb *= gGrime(vGW, ${f(grime)});\n` : '') + (inside ? 'diffuseColor.rgb *= mix(1., uDim, smoothstep(4., 27., vGW.y));\n' : ''));
    let emi = '';
    if (glass) emi += ` totalEmissiveRadiance += diffuseColor.rgb * glassLight(vGW, normalize(vGN)) * ${f(glass)};`;
    if (inside) emi += ' totalEmissiveRadiance += diffuseColor.rgb * warmLight(vGW, normalize(vGN));';
    if (emi) sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + emi);
  };
  mat.customProgramCacheKey = () => ['p', world, glass, grime, inside, mat.bumpMap ? 'b' : ''].join('/');
  return mat;
}

// ---------- 贴图（全部现画）----------
// 花岗岩：条石横缝齐、竖缝错开。每块石头深浅、冷暖不一（实拍正立面一块块看得出来），块边略暗、缝深；
// 同一套分块再画一张高度图（userData.bump）：石面微凸、边上倒角、缝凹进去，给材质做凹凸。
export function graniteTexture(base, seed, { course = 48, block = 110, joint = 0.13, vary = 1 } = {}) {
  const N = 512, r = rng(seed), blocks = [];
  for (let y = 0, row = 0; y < N; y += course, row++) {
    const x0 = (row % 2) * block / 2 + (r() - .5) * 40; let x = 0;
    while (x < N) { let bw = Math.round(block * (0.6 + r() * 0.8)); if (N - x - bw < block * 0.45) bw = N - x; blocks.push({ x: x0 + x, y, w: bw, h: Math.min(course, N - y), l: r() * 2 - 1, g: r(), k: r() }); x += bw; }
  }
  const each = (fn) => { for (const b of blocks) for (const o of [-N, 0, N]) fn({ ...b, x: b.x + o }); };
  const map = canvasTex(N, N, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    each(b => {
      const a = Math.abs(b.l) * 0.17 * vary;
      g.fillStyle = b.l > 0 ? `rgba(255,247,230,${a})` : `rgba(62,48,34,${a})`; g.fillRect(b.x, b.y, b.w, b.h);
      if (b.g < 0.28) { g.fillStyle = `rgba(128,128,134,${0.10 * vary})`; g.fillRect(b.x, b.y, b.w, b.h); }          // 偏灰的石
      else if (b.g > 0.84) { g.fillStyle = `rgba(176,112,78,${0.08 * vary})`; g.fillRect(b.x, b.y, b.w, b.h); }     // 偏粉的石
      g.strokeStyle = `rgba(40,30,20,${(0.05 + 0.05 * b.k) * vary})`; g.lineWidth = 4; g.strokeRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6);   // 块边风化
    });
    for (let i = 0; i < 14000; i++) { const t = r(); g.fillStyle = t < 0.42 ? 'rgba(38,28,18,.08)' : t < 0.78 ? 'rgba(255,255,255,.08)' : t < 0.93 ? 'rgba(115,92,68,.10)' : 'rgba(20,18,16,.14)'; g.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r() * 1.5); }
    for (let i = 0; i < 30; i++) { const x = r() * w, y = r() * h, rad = 30 + r() * 100, gr = g.createRadialGradient(x, y, 2, x, y, rad); gr.addColorStop(0, r() < 0.6 ? 'rgba(60,45,30,.08)' : 'rgba(255,255,255,.05)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
    each(b => { g.fillStyle = `rgba(32,24,15,${joint + 0.1})`; g.fillRect(b.x, b.y, 2.5, b.h); g.fillRect(b.x, b.y, b.w, 2.5); g.fillStyle = 'rgba(255,250,236,.16)'; g.fillRect(b.x, b.y + 2.5, b.w, 1.5); });
  });
  map.userData.bump = canvasTex(N, N, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    each(b => { const v = 180 + Math.round(b.l * 22); for (let k = 0; k < 6; k++) { const c = Math.round(70 + (v - 70) * (k + 1) / 6); g.fillStyle = `rgb(${c},${c},${c})`; g.fillRect(b.x + 2 + k, b.y + 2 + k, b.w - 4 - 2 * k, b.h - 4 - 2 * k); } });
    for (let i = 0; i < 40; i++) { const x = r() * w, y = r() * h, rad = 6 + r() * 16, gr = g.createRadialGradient(x, y, 1, x, y, rad); gr.addColorStop(0, r() < 0.5 ? 'rgba(0,0,0,.16)' : 'rgba(255,255,255,.12)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  }, { srgb: false });
  return map;
}
// 一扇尖窗的彩色玻璃：边上一圈红白格，顶上金色华盖，中间一个带光环的人物，底下一条字带。题材是示意。
export function lightTexture(seed, pale = false) {
  return canvasTex(128, 512, (g, w, h) => {
    const r = rng(seed), pick = a => a[Math.floor(r() * a.length)];
    g.fillStyle = pale ? pick(['#e9e2c4', '#dfe8ee', '#efe6cf']) : pick(['#1a3fb8', '#1d57c8', '#16308f']); g.fillRect(0, 0, w, h);
    for (let y = -w; y < h; y += 22) for (let x = -22; x < w; x += 22) { g.fillStyle = pale ? `rgba(${r() < 0.5 ? '70,130,230' : '240,190,60'},${0.12 + r() * 0.25})` : `rgba(${r() < 0.5 ? '90,150,255' : '20,40,140'},${0.25 + r() * 0.3})`; g.beginPath(); g.moveTo(x + 11, y); g.lineTo(x + 22, y + 11); g.lineTo(x + 11, y + 22); g.lineTo(x, y + 11); g.closePath(); g.fill(); }
    g.fillStyle = '#f2b21e'; g.fillRect(12, 40, w - 24, 46); g.fillStyle = '#ffe17a'; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(18 + k * 25, 86); g.lineTo(30 + k * 25, 44); g.lineTo(42 + k * 25, 86); g.fill(); }
    const robe = pick(['#d21f1f', '#f4f1e6', '#1e9a4a', '#7a2bb0', '#e8a41a', '#c2185b']), robe2 = pick(['#1c3fae', '#f4f1e6', '#b01818', '#e0b020']), cx = w / 2 + (r() - .5) * 14, top = 150 + r() * 40;
    g.fillStyle = '#ffd95a'; g.beginPath(); g.arc(cx, top, 24, 0, 7); g.fill(); g.fillStyle = '#f1c9a0'; g.beginPath(); g.arc(cx, top + 2, 14, 0, 7); g.fill();
    g.fillStyle = robe; g.beginPath(); g.moveTo(cx - 14, top + 16); g.lineTo(cx + 14, top + 16); g.lineTo(cx + 40, 430); g.lineTo(cx - 40, 430); g.closePath(); g.fill();
    g.fillStyle = robe2; g.beginPath(); g.moveTo(cx + 4, top + 30); g.lineTo(cx + 34, 300); g.lineTo(cx + 40, 430); g.lineTo(cx + 6, 430); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(20,14,10,.55)'; g.lineWidth = 1.4; for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(cx - 10 + k * 5, top + 30); g.lineTo(cx - 36 + k * 14, 428); g.stroke(); }
    g.fillStyle = '#2a9a4a'; g.fillRect(12, 430, w - 24, 36); g.fillStyle = '#f4f1e6'; g.fillRect(12, 466, w - 24, 30);
    // 一块块玻璃深浅不一、铅条不全是直线：照片里窗是许多小块拼的。画面仍是示意，不对应哪扇真窗
    for (let i = 0; i < 160; i++) { const x = r() * w, y = r() * h, sz = 6 + r() * 14; g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${0.06 + r() * 0.1})` : `rgba(0,0,20,${0.08 + r() * 0.12})`; g.beginPath(); g.moveTo(x, y); g.lineTo(x + sz, y + r() * 4); g.lineTo(x + sz * (0.6 + r() * 0.5), y + sz); g.lineTo(x - r() * 4, y + sz * 0.8); g.closePath(); g.fill(); }
    g.strokeStyle = 'rgba(20,14,10,.6)'; g.lineWidth = 1; for (let i = 0; i < 70; i++) { let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 3; k++) { x += (r() - 0.5) * 26; y += (r() - 0.5) * 26; g.lineTo(x, y); } g.stroke(); }
    for (let y = 0; y < h; y += 14) for (const x of [0, w - 12]) { g.fillStyle = (y / 14) % 2 ? '#e01c1c' : '#f6f2e8'; g.fillRect(x, y, 12, 14); }
    g.strokeStyle = '#14100c'; g.lineWidth = 2; for (let y = 0; y < h; y += 46) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } for (const x of [12, w / 2, w - 12]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  }, { aniso: 4, wrap: false });
}
// 圆窗：kind=rose 是放射的花格（中心四叶、十六根辐条、外圈一环小圆）；quatre 是小的四叶窗。stone 给了就把石花格也画上（外部用）。
export function roundTexture(seed, kind, { stone = null, dark = false } = {}) {
  return canvasTex(512, 512, (g, w) => {
    const r = rng(seed), c = w / 2, R = w / 2 - 4, cols = dark ? ['#2a3550', '#3a2a3a', '#263a44', '#40364a', '#1f2a3a'] : ['#1f4fd6', '#d81f1f', '#ffc21a', '#2aa85a', '#f4f1e6', '#8a2bc0', '#2a8be0'];
    g.clearRect(0, 0, w, w); g.save(); g.beginPath(); g.arc(c, c, R, 0, 7); g.clip();
    const n = kind === 'rose' ? 16 : 4;
    for (let ring = 5; ring >= 1; ring--) for (let k = 0; k < n * 2; k++) { g.fillStyle = cols[Math.floor(r() * cols.length)]; g.beginPath(); g.moveTo(c, c); g.arc(c, c, R * ring / 5, k * Math.PI / n, (k + 1) * Math.PI / n); g.closePath(); g.fill(); }
    g.strokeStyle = dark ? '#0f1218' : '#14100c'; g.lineWidth = 1.5; for (let k = 0; k < n * 2; k++) { g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(k * Math.PI / n) * R, c + Math.sin(k * Math.PI / n) * R); g.stroke(); } for (let ring = 1; ring <= 5; ring++) { g.beginPath(); g.arc(c, c, R * ring / 5, 0, 7); g.stroke(); }
    g.restore();
    if (stone) {
      g.strokeStyle = stone; g.fillStyle = stone; g.lineCap = 'round';
      if (kind === 'rose') {
        g.lineWidth = 9; for (let k = 0; k < n; k++) { const a = k * Math.PI * 2 / n; g.beginPath(); g.moveTo(c + Math.cos(a) * R * 0.2, c + Math.sin(a) * R * 0.2); g.lineTo(c + Math.cos(a) * R * 0.7, c + Math.sin(a) * R * 0.7); g.stroke(); }
        g.lineWidth = 8; for (let k = 0; k < n; k++) { const a = (k + 0.5) * Math.PI * 2 / n; g.beginPath(); g.arc(c + Math.cos(a) * R * 0.62, c + Math.sin(a) * R * 0.62, R * 0.115, 0, 7); g.stroke(); g.beginPath(); g.arc(c + Math.cos(a) * R * 0.85, c + Math.sin(a) * R * 0.85, R * 0.125, 0, 7); g.stroke(); }
        g.lineWidth = 11; g.beginPath(); g.arc(c, c, R * 0.72, 0, 7); g.stroke(); g.beginPath(); g.arc(c, c, R * 0.2, 0, 7); g.stroke(); g.lineWidth = 7; for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; g.beginPath(); g.arc(c + Math.cos(a) * R * 0.09, c + Math.sin(a) * R * 0.09, R * 0.07, 0, 7); g.stroke(); }
      } else { g.lineWidth = 26; for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; g.beginPath(); g.moveTo(c + Math.cos(a) * R * 0.42, c + Math.sin(a) * R * 0.42); g.lineTo(c + Math.cos(a) * R, c + Math.sin(a) * R); g.stroke(); } }
      g.lineWidth = 16; g.beginPath(); g.arc(c, c, R - 6, 0, 7); g.stroke();
    }
  }, { aniso: 4, wrap: false });
}
// 窗券头的四叶窗（从里面看）：圆洞里是暗的石花格，花格里一个四叶形的彩色玻璃，四片叶之间各一个小圆玻璃。
// 照片里券头就是一个四叶窗加几个小圆；具体画面查不到，颜色是示意。
export function quatrefoilTexture(seed) {
  return canvasTex(256, 256, (g, w) => {
    const r = rng(seed), c = w / 2, R = w / 2 - 2, lobe = R * 0.34, d = R * 0.36, cols = ['#1f4fd6', '#d81f1f', '#ffc21a', '#2aa85a', '#2a8be0'];
    g.clearRect(0, 0, w, w); g.fillStyle = '#5a5045'; g.beginPath(); g.arc(c, c, R, 0, 7); g.fill();
    const foil = () => { g.beginPath(); for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; g.moveTo(c + Math.cos(a) * d + lobe, c + Math.sin(a) * d); g.arc(c + Math.cos(a) * d, c + Math.sin(a) * d, lobe, 0, 7); } g.rect(c - d, c - d, d * 2, d * 2); };
    g.save(); foil(); g.clip(); g.fillStyle = r() < 0.5 ? '#1d3fb8' : '#b81d22'; g.fillRect(0, 0, w, w);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; g.fillStyle = cols[Math.floor(r() * cols.length)]; g.beginPath(); g.arc(c + Math.cos(a) * d * 1.15, c + Math.sin(a) * d * 1.15, lobe * 0.62, 0, 7); g.fill(); }
    g.fillStyle = '#ffd23a'; g.beginPath(); g.arc(c, c, lobe * 0.55, 0, 7); g.fill(); g.fillStyle = '#d81f1f'; g.beginPath(); g.arc(c, c, lobe * 0.3, 0, 7); g.fill();
    g.strokeStyle = '#14100c'; g.lineWidth = 2; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(a) * R, c + Math.sin(a) * R); g.stroke(); }
    g.restore(); g.strokeStyle = '#2e2822'; g.lineWidth = 5; foil(); g.stroke();
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4, x = c + Math.cos(a) * R * 0.74, y = c + Math.sin(a) * R * 0.74; g.fillStyle = k % 2 ? '#ffc21a' : '#e8b020'; g.beginPath(); g.arc(x, y, R * 0.12, 0, 7); g.fill(); g.strokeStyle = '#2e2822'; g.lineWidth = 3; g.stroke(); }
    g.strokeStyle = '#2e2822'; g.lineWidth = 6; g.beginPath(); g.arc(c, c, R - 3, 0, 7); g.stroke();
  }, { aniso: 4, wrap: false });
}
function brickTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    const r = rng(9); g.fillStyle = '#9c8670'; g.fillRect(0, 0, w, h);
    for (let y = 0, row = 0; y < h; y += 16, row++) for (let x = -32 + (row % 2) * 16; x < w; x += 32) { const t = r(); g.fillStyle = `hsl(${13 + t * 9} ${30 + r() * 10}% ${40 + r() * 8}%)`; g.fillRect(x + 1.5, y + 1.5, 29, 13); }
  });
}
function floorTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    const r = rng(5); g.fillStyle = '#4b463f'; g.fillRect(0, 0, w, h);
    for (let j = 0; j < 2; j++) for (let i = 0; i < 4; i++) { g.fillStyle = `hsl(32 8% ${27 + r() * 9}%)`; g.fillRect(i * 64 + 1 + (j % 2) * 32 - 32, j * 128 + 1, 62, 126); g.fillRect(i * 64 + 1 + (j % 2) * 32 + 224, j * 128 + 1, 62, 126); }
    for (let i = 0; i < 5000; i++) { g.fillStyle = r() < 0.5 ? '#0000001c' : '#ffffff16'; g.fillRect(r() * w, r() * h, 1.5, 1.5); }
  });
}

export function buildWorld(scene, { coarse = false } = {}) {
  const ext = new THREE.Group(), int = new THREE.Group(); ext.name = 'exterior'; int.name = 'interior'; scene.add(ext, int);
  const extInfo = buildExterior({ ext, coarse });

  // ====================== 内部 ======================
  const gran = graniteTexture('#dccfba', 21, { joint: 0.02, vary: 0.45 }); gran.userData.bumpScale = 0.6;
  const stone = patch(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92, map: gran }), { world: 0.22, glass: 1, grime: 0.55, inside: 1 });
  const plain = patch(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 }), { glass: 1, inside: 1 });
  const floorMat = patch(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, metalness: 0.05, map: floorTexture() }), { world: 0.3, glass: 1.5, inside: 1 });
  const I = batcher(int, plain, { cast: false, receive: false }), S = batcher(int, stone, { cast: false, receive: false });
  const IG = batcher(int, new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), { cast: false, receive: false });
  // 门槛石（堂内这一侧）：盖住门洞底下和地面同在 y=0 的墙洞底，免得从里外两边看门槛都闪；外面那一侧见 exterior.js
  // 顶面 2.5 毫米，比外面那块（5 毫米）低一点：在门口两块都画时由外面那块盖住，不互相抢
  S.box(0, -0.05, 38.0, 4.2, 0.0525, 0.8, '#dccfba'); for (const s of [-1, 1]) S.box(s * C.TOWER.cx, -0.05, 38.0, 2.8, 0.0525, 0.8, '#dccfba');
  const wallOpt = { cast: false }, ST = '#e9dcc4', ST2 = '#d9c9ad', ST3 = '#f1e7d2';
  const add = (geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; int.add(m); return m; };

  // 地面
  const zc = (C.Z_CROSS0 + C.Z_CROSS1) / 2;
  for (const [x, z, w, d] of [[0, (C.Z_FRONT + C.Z_APSE) / 2, C.CHAP * 2, C.Z_FRONT - C.Z_APSE], [0, zc, C.TRANS * 2, C.Z_CROSS0 - C.Z_CROSS1]]) { const m = add(new THREE.PlaneGeometry(w, d), floorMat, x, x === 0 && w > 30 ? 0.004 : 0, z); m.rotation.x = -Math.PI / 2; }
  { const m = add(new THREE.CircleGeometry(C.APSE_R + 0.6, 24), floorMat, 0, 0.002, C.Z_APSE); m.rotation.x = -Math.PI / 2; }
  // 圣所台与三级台阶
  for (let k = 0; k < 3; k++) I.box(0, 0, C.SANCT.z0 - (k + 0.5) * 0.4, C.AX * 2 - 0.6, C.SANCT.h * (k + 1) / 3, 0.4, '#6a6259');
  I.box(0, 0, (C.SANCT.z1 + C.Z_APSE) / 2, C.AX * 2 - 0.5, C.SANCT.h, C.SANCT.z1 - C.Z_APSE, '#6a6259'); I.cyl(0, 0, C.Z_APSE, C.APSE_R + 0.2, C.SANCT.h, '#6a6259');

  // ---- 墙 ----
  const TOP = 30, cl = W.clere, cp = W.chapel;
  const clereHoles = u => [{ u: u - cl.off, y: cl.sill, w: cl.w * 2, spring: cl.h, rise: 1.0 }, { u: u + cl.off, y: cl.sill, w: cl.w * 2, spring: cl.h, rise: 1.0 }, { u, y: cl.ocY, r: cl.ocR }];
  const chapHoles = u => [{ u: u - cp.off, y: cp.sill, w: cp.w * 2, spring: cp.h, rise: 0.85 }, { u: u + cp.off, y: cp.sill, w: cp.w * 2, spring: cp.h, rise: 0.85 }, { u, y: cp.ocY, r: cp.ocR }];
  const bays = []; for (let k = 0; k < C.NAVE_BAYS; k++) bays.push({ z0: C.naveLine(k), len: C.NAVE_BAY, door: k === C.SIDE_DOOR_BAY }); for (let j = 0; j < C.CH_BAYS; j++) bays.push({ z0: C.chLine(j), len: C.CH_BAY, chancel: true });
  for (const s of [-1, 1]) {
    for (const b of bays) {
      const z1 = b.z0 - b.len, u = b.len / 2;
      // 中殿高墙：下面一个通侧廊的大尖券，上面高侧窗
      slab(int, stone, { a: [s * C.AX, b.z0], b: [s * C.AX, z1], y1: TOP, thick: 0.9, holes: [{ u, y: 0, w: b.len - 1.25, spring: C.H.arcadeSpring, rise: C.H.arcadeApex - C.H.arcadeSpring + 0.4 }, ...clereHoles(u)], ...wallOpt });
      // 侧廊与小礼拜堂之间的券
      slab(int, stone, { a: [s * C.AISLE, b.z0], b: [s * C.AISLE, z1], y1: C.H.aisle + 0.6, thick: 0.8, holes: [{ u, y: 0, w: b.len - 1.6, spring: 4.6, rise: 2.7 }], ...wallOpt });
      // 小礼拜堂外墙：双尖窗加四叶圆窗；有边门的那一间开门
      slab(int, stone, { a: [s * C.CHAP, b.z0], b: [s * C.CHAP, z1], y1: C.H.chapel + 2.4, thick: 0.5, holes: b.door ? [{ u, y: 0, w: 2.0, spring: 2.5, rise: 1.3 }] : chapHoles(u), ...wallOpt });
      S.box(s * (C.AISLE + C.CHAP) / 2, 0, z1, C.CHAP - C.AISLE, C.H.chapel + 2.4, 0.8, ST2);        // 小礼拜堂之间的隔墙
      // 高墙上的线脚与四叶圆饰
      S.box(s * (C.AX - 0.5), 13.5, b.z0 - u, 0.22, 0.28, b.len, ST3); S.box(s * (C.AX - 0.5), 10.9, b.z0 - u, 0.16, 0.2, b.len, ST3);
      for (const o of [-1.25, 1.25]) { S.hoop(s * (C.AX - 0.47), 12.25, b.z0 - u + o, 0.42, ST3, [0, Math.PI / 2, 0]); S.hoop(s * (C.AX - 0.47), 12.25, b.z0 - u + o, 0.2, ST2, [0, Math.PI / 2, 0]); }
    }
    // 塔基：朝中殿、朝侧廊各一个券门；塔基里面的天花
    slab(int, stone, { a: [s * 5.95, C.Z_FRONT], b: [s * 5.95, C.Z_TOWER], y1: TOP, thick: 1.5, holes: [{ u: (C.Z_FRONT - C.Z_TOWER) / 2 + 0.1, y: 0, w: 3.0, spring: 4.4, rise: 2.4 }], ...wallOpt });
    slab(int, stone, { a: [s * 5.55, C.Z_TOWER + 0.75], b: [s * C.CHAP, C.Z_TOWER + 0.75], y1: C.H.aisle + 0.6, thick: 1.5, holes: [{ u: C.TOWER.cx - 5.55, y: 0, w: 3.0, spring: 4.4, rise: 2.4 }], ...wallOpt });
    I.box(s * 10, 9.2, (C.Z_FRONT + C.Z_TOWER) / 2, 7.6, 0.3, 8.3, '#b9a98c');
    // 横厅：尽端的墙开玫瑰窗；与侧廊相接的两面墙各开一个券
    slab(int, stone, { a: [s * C.TRANS, C.Z_CROSS0], b: [s * C.TRANS, C.Z_CROSS1], y1: TOP, thick: 0.6, holes: [{ u: 5.2, y: W.transRose.y, r: W.transRose.r }], ...wallOpt });
    for (const z of [C.Z_CROSS0, C.Z_CROSS1]) slab(int, stone, { a: [s * C.AX, z], b: [s * C.TRANS, z], y1: TOP, thick: 0.9, holes: [{ u: 2.5, y: 0, w: 3.6, spring: C.H.arcadeSpring, rise: 3.2 }], ...wallOpt });
    slab(int, stone, { a: [s * C.AX, C.Z_APSE], b: [s * C.CHAP, C.Z_APSE], y1: C.H.aisle + 0.6, thick: 0.6, ...wallOpt });                    // 侧廊北端
  }
  // 南墙：三座门和玫瑰窗
  slab(int, stone, { a: [-C.CHAP, C.Z_FRONT], b: [C.CHAP, C.Z_FRONT], y1: TOP, thick: 0.6, holes: [{ u: C.CHAP, y: 0, w: 3.1, spring: 3.3, rise: 2.0 }, { u: C.CHAP - 10, y: 0, w: 2.1, spring: 2.6, rise: 1.4 }, { u: C.CHAP + 10, y: 0, w: 2.1, spring: 2.6, rise: 1.4 }, { u: C.CHAP, y: W.rose.y, r: W.rose.r }], ...wallOpt });
  // 后殿：五面墙，每面一对长窗
  const AP = []; { const R = C.APSE_R / Math.cos(Math.PI / 10); for (let i = 0; i <= 5; i++) { const a = Math.PI * i / 5; AP.push([R * Math.cos(a), C.Z_APSE - R * Math.sin(a)]); } }
  for (let i = 0; i < 5; i++) { const a = AP[i + 1], b = AP[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]), ap = W.apse; slab(int, stone, { a, b, y1: TOP, thick: 0.6, holes: [{ u: len / 2 - ap.off, y: ap.sill, w: ap.w * 2, spring: ap.h, rise: 1.0 }, { u: len / 2 + ap.off, y: ap.sill, w: ap.w * 2, spring: ap.h, rise: 1.0 }], ...wallOpt }); }
  for (const [x, z] of AP) { S.cyl(x * 0.97, 0, C.Z_APSE + (z - C.Z_APSE) * 0.97, 0.2, C.H.spring, ST); S.cyl(x * 0.97, C.H.spring, C.Z_APSE + (z - C.Z_APSE) * 0.97, 0.3, 0.35, ST3, 'oct'); }
  // 后殿窗下的一圈盲券
  for (let i = 0; i < 5; i++) { const a = AP[i + 1], b = AP[i]; for (const t of [0.25, 0.75]) I.rod([a[0] + (b[0] - a[0]) * t * 0.98, 1.2, a[1] + (b[1] - a[1]) * t * 0.98 + 0.25], [a[0] + (b[0] - a[0]) * t * 0.98, 5.6, a[1] + (b[1] - a[1]) * t * 0.98 + 0.25], 0.09, ST3); }

  // ---- 肋拱顶 ----
  const brick = brickTexture(); brick.repeat.set(1, 1);
  const vaultMat = new THREE.MeshBasicMaterial({ color: '#ffffff', vertexColors: true, side: THREE.DoubleSide, map: brick });
  // 肋：截面不是圆棍，是一道带尖棱的圆线脚、两侧各一道凹槽和一道小圆线（照片里拱顶的肋就是这样一束线）。
  // 沿肋的轨迹把截面扫成一整条，比一节节圆柱接起来面数还少；贴图只画每 0.55 米一道的石缝。
  const ribTex = canvasTex(64, 64, (g, w, h) => { const r = rng(77); g.fillStyle = '#d2c6b0'; g.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.5 ? 'rgba(60,48,36,.12)' : 'rgba(255,255,255,.12)'; g.fillRect(r() * w, r() * h, 1.2, 1.2); } g.fillStyle = 'rgba(70,58,44,.55)'; g.fillRect(0, 0, 2, h); });
  // 和拱面一样不吃灯光，明暗直接写在顶点上（截面的凹凸、越高越暗），总亮度由 main.js 跟拱面一起调
  const ribMat = new THREE.MeshBasicMaterial({ color: '#ffffff', vertexColors: true, map: ribTex }), RB = batcher(int, new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#4c4438' }), { cast: false, receive: false });
  const PROF_BIG = [[-1.5, -0.4], [-1.5, 0.12], [-1.3, 0.42], [-1.0, 0.5], [-0.78, 0.36], [-0.58, 0.66], [-0.38, 1.02], [-0.14, 1.26], [0, 1.36], [0.14, 1.26], [0.38, 1.02], [0.58, 0.66], [0.78, 0.36], [1.0, 0.5], [1.3, 0.42], [1.5, 0.12], [1.5, -0.4]];
  const PROF_SMALL = [[-1.1, -0.4], [-1.1, 0.25], [-0.75, 0.55], [-0.45, 0.75], [-0.2, 1.02], [0, 1.1], [0.2, 1.02], [0.45, 0.75], [0.75, 0.55], [1.1, 0.25], [1.1, -0.4]];
  const profNorm = P => P.map((_, i) => { const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dy / l, -dx / l]; });
  const NB = profNorm(PROF_BIG), NS = profNorm(PROF_SMALL);
  const rP = [], rN = [], rU = [], rC = [], rI = [];
  // 截面上凹槽里暗、圆线脚上亮：直接写进顶点颜色，环境光底下也看得出一道道线
  const shadeOf = P => P.map(([x, y], i) => i === 0 || i === P.length - 1 ? 0.32 : Math.min(1, 0.32 + 0.68 * Math.pow(Math.max(0, (y + 0.1) / 1.45), 1.4) + (Math.abs(x) > 0.9 && y > 0.3 ? 0.3 : 0))), SB = shadeOf(PROF_BIG), SS = shadeOf(PROF_SMALL);
  const _t = new THREE.Vector3(), _n = new THREE.Vector3(), _b = new THREE.Vector3(), _v = new THREE.Vector3();
  // pts：轨迹上的点；c：肋所在竖平面里一个偏下的点，截面的尖棱朝它（朝向拱里面）；r：截面尺度
  function sweep(pts, c, r, big) {
    r *= 0.8; const P = big ? PROF_BIG : PROF_SMALL, PN = big ? NB : NS, base = rP.length / 3, n = P.length; let len = 0;
    pts.forEach((q, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; _t.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
      _n.set(c[0] - q[0], c[1] - q[1], c[2] - q[2]); _n.addScaledVector(_t, -_n.dot(_t)).normalize(); _b.crossVectors(_t, _n).normalize();
      if (i) len += Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1], q[2] - pts[i - 1][2]);
      P.forEach(([px, py], k) => { rP.push(q[0] + _b.x * px * r + _n.x * py * r, q[1] + _b.y * px * r + _n.y * py * r, q[2] + _b.z * px * r + _n.z * py * r);
        _v.copy(_b).multiplyScalar(PN[k][0]).addScaledVector(_n, PN[k][1]).normalize(); rN.push(_v.x, _v.y, _v.z); rU.push(len / 0.55, k / (n - 1)); const sh = (big ? SB : SS)[k] * (1 - 0.4 * THREE.MathUtils.smoothstep(q[1], 8, 28)); rC.push(sh * 0.8, sh * 0.78, sh * 0.74); });
    });
    for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < n - 1; k++) { const a = base + i * n + k, b = a + n; rI.push(a, a + 1, b, a + 1, b + 1, b); }
    ribCount += pts.length - 1;
  }
  const P = t => Math.pow(Math.max(0, 1 - Math.abs(t)), 0.56);
  const vPos = [], vCol = [], vUv = [], vIdx = []; let ribCount = 0;
  function crossVault(x0, x1, z0, z1, spring, apex, { n = 10, ribR = 0.15 } = {}) {
    const base = vPos.length / 3, rise = apex - spring, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hx = (x1 - x0) / 2, hz = (z1 - z0) / 2;
    const Y = (u, v) => spring + rise * Math.max(P(u), P(v));
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const u = i / n * 2 - 1, v = j / n * 2 - 1, y = Y(u, v), k = (y - spring) / rise, groin = Math.abs(Math.abs(u) - Math.abs(v));
      vPos.push(cx + u * hx, y, cz + v * hz); vUv.push((cx + u * hx) * 0.9, (cz + v * hz) * 0.9 + y * 0.5);
      const sh = (0.3 + 0.42 * k) * (0.8 + 0.2 * Math.min(1, groin * 4)); vCol.push(sh * 1.04, sh * 0.9, sh * 0.82);
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = base + j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1; vIdx.push(a, c, b, b, c, d); }
    const big = ribR >= 0.15, m = big ? 14 : 10, line = (fn, r, c) => { const pts = []; for (let i = 0; i <= m; i++) pts.push(fn(i / m * 2 - 1)); sweep(pts, c, r, big); };
    line(t => [cx + t * hx, Y(t, t) - 0.1, cz + t * hz], ribR, [cx, spring, cz]); line(t => [cx + t * hx, Y(t, t) - 0.1, cz - t * hz], ribR, [cx, spring, cz]);   // 两条对角肋
    line(t => [cx + t * hx, Y(t, 1) - 0.14, z0], ribR * 1.4, [cx, spring, z0]); line(t => [x0, Y(1, t) - 0.08, cz + t * hz], ribR * 0.85, [x0, spring, cz]); line(t => [x1, Y(1, t) - 0.08, cz + t * hz], ribR * 0.85, [x1, spring, cz]);
    RB.ball(cx, apex - 0.18, cz, ribR * 2.6, '#efe4cc', 0.7);                                                                                           // 拱心石
    return { cx, cz, apex };
  }
  const keys = [];
  keys.push(crossVault(-C.AX, C.AX, C.Z_TOWER, C.Z_FRONT, C.H.spring, C.H.vault));
  for (const b of bays) keys.push(crossVault(-C.AX, C.AX, b.z0 - b.len, b.z0, C.H.spring, C.H.vault));
  keys.push(crossVault(-C.AX, C.AX, C.Z_CROSS1, C.Z_CROSS0, C.H.spring, C.H.vault, { ribR: 0.19 }));
  for (const s of [-1, 1]) {
    crossVault(s > 0 ? C.AX : -C.TRANS, s > 0 ? C.TRANS : -C.AX, C.Z_CROSS1, C.Z_CROSS0, C.H.spring, C.H.vault);
    for (const b of bays) { crossVault(s > 0 ? C.AX : -C.AISLE, s > 0 ? C.AISLE : -C.AX, b.z0 - b.len, b.z0, C.H.arcadeSpring, C.H.aisle, { n: 8, ribR: 0.11 }); crossVault(s > 0 ? C.AISLE : -C.CHAP, s > 0 ? C.CHAP : -C.AISLE, b.z0 - b.len, b.z0, 5.2, C.H.chapel, { n: 6, ribR: 0.09 }); }
  }
  // 后殿：从五面墙的转角往拱心石收的伞形拱
  { const base = vPos.length / 3, n = 8, rise = C.H.vault - C.H.spring, seg = 5 * 4;
    const rim = t => { const i = Math.min(4, Math.floor(t * 5)), q = t * 5 - i; return [AP[i][0] + (AP[i + 1][0] - AP[i][0]) * q, AP[i][1] + (AP[i + 1][1] - AP[i][1]) * q]; };
    for (let j = 0; j <= n; j++) for (let i = 0; i <= seg; i++) { const [rx, rz] = rim(i / seg), q = j / n, web = Math.abs(((i / 4) % 1) - 0.5) * 2, y = C.H.spring + rise * (P(1 - q) * (0.86 + 0.14 * web) + 0.14 * q * (1 - web)); vPos.push(rx * (1 - q), Math.min(y, C.H.vault), C.Z_APSE + (rz - C.Z_APSE) * (1 - q)); vUv.push(rx * 0.55, rz * 0.55 + y * 0.3); const sh = 0.36 + 0.5 * q; vCol.push(sh * 1.06, sh * 0.9, sh * 0.8); }
    for (let j = 0; j < n; j++) for (let i = 0; i < seg; i++) { const a = base + j * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1; vIdx.push(a, c, b, b, c, d); }
    for (const [x, z] of AP) { const pts = [[x, C.H.spring, z]]; for (let i = 1; i <= 12; i++) { const q = i / 12; pts.push([x * (1 - q), C.H.spring + rise * P(1 - q) - 0.1, C.Z_APSE + (z - C.Z_APSE) * (1 - q)]); } sweep(pts, [0, C.H.spring, C.Z_APSE], 0.15, true); }
    RB.ball(0, C.H.vault - 0.2, C.Z_APSE, 0.5, '#efe4cc', 0.7); }
  { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(vPos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(vCol, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(vUv, 2)); g.setIndex(vIdx); const m = new THREE.Mesh(g, vaultMat); m.frustumCulled = false; int.add(m); }
  { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(rP, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(rN, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(rU, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(rC, 3)); g.setIndex(rI); const m = new THREE.Mesh(g, ribMat); m.frustumCulled = false; int.add(m); }

  // ---- 柱头：每根细柱一个钟形柱头，外面贴几片往外、往下卷的叶子（照片里束柱柱头就是一圈卷叶），上面压八角顶板 ----
  // shafts：[x, z, r, 朝外的方向角]；叶子只贴朝外那一半，靠柱芯那面看不见就不做。返回以柱心为原点、高 H 的一个合并几何。
  function capitalGeo(shafts, H, { leaves = 3, out = null } = {}) {
    const pos = [], idx = [], seg = 10, rows = 3;
    const add = (pts, cols, rowsN) => { const b = pos.length / 3; pts.forEach(p => pos.push(...p)); for (let j = 0; j < rowsN - 1; j++) for (let i = 0; i < cols - 1; i++) { const a = b + j * cols + i, c = a + cols; idx.push(a, c, a + 1, a + 1, c, c + 1); } };
    for (const [sx, sz, r, face] of shafts) {
      const bellR = h => r * (1 + 0.5 * Math.pow(h / H, 1.6));
      const ring = []; for (let j = 0; j <= rows; j++) for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2, h = H * j / rows, rr = bellR(h); ring.push([sx + Math.cos(a) * rr, h, sz + Math.sin(a) * rr]); }
      add(ring, seg + 1, rows + 1);
      const n = leaves, spread = n > 2 ? 0.8 : 0.55;
      for (let l = 0; l < n; l++) {
        const a = face + (n === 1 ? 0 : (l / (n - 1) - 0.5) * 2 * spread), ox = Math.cos(a), oz = Math.sin(a), tx = -oz, tz = ox;
        if (out && ox * out[0] + oz * out[1] < -0.1) continue;
        const W = r * (n > 2 ? 1.1 : 1.25), S = [0, 0.3, 0.58, 0.8, 0.93, 1], U = [0, 0.34, 0.66, 0.88, 0.95, 0.84], O = [0, 0.02, 0.06, 0.17, 0.28, 0.32], Wd = [0.4, 0.85, 1, 0.9, 0.7, 0.35], pts = [];
        S.forEach((_, j) => { const h = U[j] * H, rr = bellR(Math.min(h, H)) + O[j] * H * 0.9; for (const [u, bulge] of [[-0.5, 0], [0, 0.14], [0.5, 0]]) { const w = u * W * Wd[j], o = rr + bulge * W; pts.push([sx + ox * o + tx * w, h, sz + oz * o + tz * w]); } });
        add(pts, 3, S.length);
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  const capMat = patch(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.82, map: gran, side: THREE.DoubleSide }), { world: 0.22, glass: 1.1, grime: 0.3, inside: 1 });
  const capInst = (geo, list, color) => { const m = new THREE.InstancedMesh(geo, capMat, list.length); list.forEach(([x, y, z, ry], i) => { _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(0, ry, 0)), _s.set(1, 1, 1)); m.setMatrixAt(i, _m); m.setColorAt(i, _c.set(color)); }); m.frustumCulled = false; int.add(m); };

  // ---- 束柱 ----
  // 截面是一个圆芯外面抱八根细柱；到拱廊起脚处一圈卷叶柱头，朝中殿的那三根细柱继续升到拱顶起脚。
  function pierGeo(r, h) {
    const seg = 48, rings = 2, pos = [], idx = [];
    for (let j = 0; j <= rings; j++) for (let i = 0; i <= seg; i++) { const th = i / seg * Math.PI * 2, rr = r * 0.74; pos.push(Math.cos(th) * rr, h * j / rings, Math.sin(th) * rr); }
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + seg + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  const pierMat = patch(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, map: gran }), { world: 0.22, glass: 1.1, grime: 0.45, inside: 1 });
  for (const kind of ['nave', 'cross']) {
    const ps = C.PIERS.filter(p => p.kind === kind), hgt = C.H.arcadeSpring - 0.9, mesh = new THREE.InstancedMesh(pierGeo(ps[0].r, hgt), pierMat, ps.length);
    ps.forEach((p, i) => { _m.compose(_p.set(p.x, 0.9, p.z), _q.identity(), _s.set(1, 1, 1)); mesh.setMatrixAt(i, _m); mesh.setColorAt(i, _c.set(ST)); }); mesh.frustumCulled = false; int.add(mesh);
  }
  for (const p of C.PIERS) {
    const s = Math.sign(p.x), r = p.r, y = C.H.arcadeSpring;
    S.cyl(p.x, 0, p.z, r * 1.32, 0.5, ST2, 'oct'); S.cyl(p.x, 0.5, p.z, r * 1.14, 0.4, ST, 'oct');                                 // 柱础
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, big = k % 2 === 0, rr = big ? r * 0.36 : r * 0.22, d = big ? r * 0.72 : r * 0.78; S.cyl(p.x + Math.cos(a) * d, 0.9, p.z + Math.sin(a) * d, rr, y - 1.5, ST); S.cyl(p.x + Math.cos(a) * d, 0.75, p.z + Math.sin(a) * d, rr * 1.35, 0.22, ST2); }
    S.cyl(p.x, y - 0.75, p.z, r * 0.8, 0.14, ST3, 'oct');                                                                          // 柱颈一圈线脚
    S.cyl(p.x, y - 0.1, p.z, r * 1.32, 0.2, ST3, 'oct');                           // 柱头与顶板
    // 朝中殿那一面的三根附柱，一直升到拱顶起脚
    for (const [o, rr] of [[0, 0.2], [-0.3, 0.13], [0.3, 0.13]]) S.cyl(p.x - s * (0.5 + (o ? -0.07 : 0.06)), y + 0.24, p.z + o, rr, C.H.spring - y - 0.24, ST);
    S.cyl(p.x - s * 0.5, C.H.spring, p.z, 0.62, 0.2, ST3, 'oct');
    if (p.kind === 'cross') for (const dz of [-1, 1]) S.cyl(p.x - s * 0.2, y + 0.24, p.z + dz * 0.75, 0.16, C.H.spring - y - 0.24, ST);
  }
  // 拱廊起脚处：每根细柱一个卷叶柱头；拱顶起脚处：朝中殿那三根附柱一组卷叶柱头（几何朝 -X 做，西侧的转 180°）
  for (const kind of ['nave', 'cross']) {
    const ps = C.PIERS.filter(p => p.kind === kind), r = ps[0].r, shafts = [];
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, big = k % 2 === 0; shafts.push([Math.cos(a) * (big ? r * 0.72 : r * 0.78), Math.sin(a) * (big ? r * 0.72 : r * 0.78), big ? r * 0.36 : r * 0.22, a]); }
    capInst(capitalGeo(shafts, 0.62, { leaves: 3 }), ps.map(p => [p.x, C.H.arcadeSpring - 0.72, p.z, 0]), ST3);
  }
  { const g = capitalGeo([[-0.06, 0, 0.2, Math.PI], [0.07, -0.3, 0.13, Math.PI * 1.3], [0.07, 0.3, 0.13, Math.PI * 0.7]], 0.55, { leaves: 3, out: [-1, 0] });
    capInst(g, C.PIERS.map(p => [p.x - Math.sign(p.x) * 0.5, C.H.spring - 0.55, p.z, p.x > 0 ? 0 : Math.PI]), ST3); }
  // 贴墙的半柱：侧廊外侧墩、塔基转角
  for (const s of [-1, 1]) { for (const b of bays) { S.cyl(s * (C.AISLE - 0.45), 0, b.z0 - b.len, 0.3, 5.2, ST); S.cyl(s * (C.AISLE - 0.45), 5.2, b.z0 - b.len, 0.42, 0.22, ST3, 'oct'); S.cyl(s * (C.AX + 0.5), 0, b.z0 - b.len, 0.22, C.H.arcadeSpring, ST); }
    for (const [o, rr] of [[0, 0.2], [-0.3, 0.13], [0.3, 0.13]]) S.cyl(s * (C.AX - 0.55), 0, C.Z_TOWER + o, rr, C.H.spring, ST); S.cyl(s * (C.AX - 0.5), C.H.spring, C.Z_TOWER, 0.62, 0.2, ST3, 'oct'); }

  // ---- 彩窗（自发光的玻璃面片）----
  const mkLight = seed => new THREE.MeshBasicMaterial({ map: lightTexture(seed), toneMapped: false }), mkRound = (seed, kind) => new THREE.MeshBasicMaterial({ map: roundTexture(seed, kind), transparent: true, alphaTest: 0.5, toneMapped: false });
  const eastL = [1, 2, 3, 4].map(mkLight), westL = [5, 6, 7, 8].map(mkLight), apseL = [9, 10, 11].map(k => new THREE.MeshBasicMaterial({ map: lightTexture(k, true), toneMapped: false }));
  const mkQuatre = seed => new THREE.MeshBasicMaterial({ map: quatrefoilTexture(seed), transparent: true, alphaTest: 0.5, toneMapped: false });
  const eastQ = mkQuatre(12), westQ = mkQuatre(13), eastRose = mkRound(14, 'rose'), westRose = mkRound(15, 'rose'), southRose = mkRound(16, 'rose');
  const winGroups = new Map(); let wi = 0;
  const win = (mat, x, y, z, w, h, ry) => { (winGroups.get(mat) || winGroups.set(mat, []).get(mat)).push([x, y, z, w, h, ry]); };
  for (const s of [-1, 1]) {
    const set = s > 0 ? eastL : westL, q = s > 0 ? eastQ : westQ, ry = -s * Math.PI / 2;
    for (const b of bays) { const z = b.z0 - b.len / 2;
      for (const o of [-1, 1]) { win(set[wi++ % 4], s * (C.AX + 0.3), cl.sill + (cl.h + 1.0) / 2, z + o * cl.off, cl.w * 2, cl.h + 1.0, ry); if (!b.door) win(set[wi++ % 4], s * (C.CHAP + 0.1), cp.sill + (cp.h + 0.85) / 2, z + o * cp.off, cp.w * 2, cp.h + 0.85, ry); }
      win(q, s * (C.AX + 0.3), cl.ocY, z, cl.ocR * 2, cl.ocR * 2, ry); if (!b.door) win(q, s * (C.CHAP + 0.1), cp.ocY, z, cp.ocR * 2, cp.ocR * 2, ry);
      if (b.door) I.box(s * (C.CHAP + 0.12), 0, z, 0.1, 3.9, 2.1, '#5a2a22');
    }
    win(s > 0 ? eastRose : westRose, s * (C.TRANS + 0.1), W.transRose.y, zc, W.transRose.r * 2, W.transRose.r * 2, ry);
  }
  win(southRose, 0, W.rose.y, C.Z_FRONT + 0.1, W.rose.r * 2, W.rose.r * 2, Math.PI);
  for (let i = 0; i < 5; i++) { const a = AP[i + 1], b = AP[i], mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, dx = (b[0] - a[0]), dz = (b[1] - a[1]), len = Math.hypot(dx, dz), ry = Math.atan2(-dz, dx), ap = W.apse, nx = -dz / len, nz = dx / len;
    for (const o of [-1, 1]) win(apseL[(i + (o > 0 ? 1 : 0)) % 3], mx + dx / len * o * ap.off - nx * 0.12, ap.sill + (ap.h + 1) / 2, mz + dz / len * o * ap.off - nz * 0.12, ap.w * 2, ap.h + 1, ry); }
  // 石头的玫瑰窗花格（内侧看是暗的剪影）
  const tracery = new THREE.MeshBasicMaterial({ map: roundTexture(1, 'rose', { stone: '#5d5345' }), transparent: true, alphaTest: 0.5 }); tracery.map = (() => canvasTex(512, 512, (g, w) => { const c = w / 2, R = w / 2 - 4, n = 16; g.clearRect(0, 0, w, w); g.strokeStyle = '#5d5345'; g.lineCap = 'round';
    g.lineWidth = 9; for (let k = 0; k < n; k++) { const a = k * Math.PI * 2 / n; g.beginPath(); g.moveTo(c + Math.cos(a) * R * 0.2, c + Math.sin(a) * R * 0.2); g.lineTo(c + Math.cos(a) * R * 0.7, c + Math.sin(a) * R * 0.7); g.stroke(); }
    g.lineWidth = 8; for (let k = 0; k < n; k++) { const a = (k + 0.5) * Math.PI * 2 / n; g.beginPath(); g.arc(c + Math.cos(a) * R * 0.62, c + Math.sin(a) * R * 0.62, R * 0.115, 0, 7); g.stroke(); g.beginPath(); g.arc(c + Math.cos(a) * R * 0.85, c + Math.sin(a) * R * 0.85, R * 0.125, 0, 7); g.stroke(); }
    g.lineWidth = 11; g.beginPath(); g.arc(c, c, R * 0.72, 0, 7); g.stroke(); g.beginPath(); g.arc(c, c, R * 0.2, 0, 7); g.stroke(); g.lineWidth = 14; g.beginPath(); g.arc(c, c, R - 5, 0, 7); g.stroke(); }, { wrap: false }))();
  const noPre = []; { const m1 = add(new THREE.PlaneGeometry(W.rose.r * 2.02, W.rose.r * 2.02), tracery, 0, W.rose.y, C.Z_FRONT - 0.05, Math.PI); m1.renderOrder = 2; noPre.push(m1);
    for (const s of [-1, 1]) noPre.push(add(new THREE.PlaneGeometry(W.transRose.r * 2.02, W.transRose.r * 2.02), tracery, s * (C.TRANS - 0.05), W.transRose.y, zc, -s * Math.PI / 2)); }
  for (const [mat, arr] of winGroups) {
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, arr.length);
    arr.forEach(([x, y, z, w, h, ry], i) => { _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(0, ry, 0)), _s.set(w, h, 1)); mesh.setMatrixAt(i, _m); });
    mesh.frustumCulled = false; int.add(mesh); if (mat.alphaTest) noPre.push(mesh);
  }
  const eastMats = [...eastL, eastQ, eastRose], westMats = [...westL, westQ, westRose], southMats = [southRose], apseMats = apseL;

  // ---- 体积光：沿每条视线取若干点，每个点都问一句「这里被哪块玻璃照到了」----
  const volMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
    uniforms: { uGI: GLASS.uGI, uGL: GLASS.uGL, uK: { value: 1 }, uSteps: { value: coarse ? 8 : 12 } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float uK, uSteps; varying vec3 vW;
      ${GLASS_GLSL.slice(0, GLASS_GLSL.indexOf('vec3 glassLight('))}
      float room(vec3 p){ float ax = abs(p.x); float top = ax < ${f(C.AX)} ? 28. : (p.z < ${f(C.Z_CROSS0)} && p.z > ${f(C.Z_CROSS1)}) ? 28. : ax < ${f(C.AISLE)} ? 11. : 8.5; return step(ax, ${f(C.TRANS)}) * step(p.y, top) * step(${f(C.Z_APSE - 5)}, p.z) * step(p.z, ${f(C.Z_FRONT)}); }
      void main(){
        vec3 ro = cameraPosition, rd = vW - ro; float far = min(length(rd), 46.); rd = normalize(rd);
        float n = uSteps, dt = far / n, j = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))));
        vec3 acc = vec3(0.);
        for (float i = 0.; i < 40.; i++) { if (i >= n) break; vec3 p = ro + rd * (i + j) * dt; if (p.y < 0. || room(p) < .5) continue;
          vec3 q = vec3(0.);
          if (uGI.x > .2) { vec4 a = sideHit(p, 1.); q += a.rgb * uGI.x * exp(-a.a * .05); }
          if (uGI.y > .2) { vec4 b = sideHit(p, -1.); q += b.rgb * uGI.y * exp(-b.a * .05); }
          if (uGI.z > .2) { vec4 c = roseHit(p); q += c.rgb * uGI.z * .45 * exp(-c.a * .03); }
          acc += q * exp(-(i + j) * dt * .02); }
        gl_FragColor = vec4(acc * dt * .02 * uK, 1.);
      }`,
  });
  const vol = new THREE.Mesh(new THREE.BoxGeometry(34, 30, 80), volMat); vol.position.set(0, 15, 0); vol.renderOrder = 6; vol.frustumCulled = false; int.add(vol); noPre.push(vol);

  // ---- 陈设 ----
  const WOOD = '#6a4428', WOOD2 = '#52321c';
  for (const p of C.PEWS) { I.box(p.x, 0.42, p.z, p.hx * 2, 0.07, 0.42, WOOD); I.box(p.x, 0, p.z + 0.24, p.hx * 2, 0.98, 0.06, WOOD2); for (const e of [-1, 1]) { I.box(p.x + e * p.hx, 0, p.z, 0.07, 0.86, 0.56, WOOD2); I.ball(p.x + e * p.hx, 0.98, p.z + 0.2, 0.12, WOOD2); } }
  // 圣所栏杆（白色铁花，只画成一排细柱加扶手）
  for (const s of [-1, 1]) { I.box(s * (C.AX + 1.3) / 2, 0.86, C.SANCT.z0 + 0.65, C.AX - 1.3, 0.07, 0.12, '#e9e4d8'); for (let k = 0; k < 12; k++) I.box(s * (1.45 + k * 0.32), 0, C.SANCT.z0 + 0.65, 0.05, 0.86, 0.05, '#e9e4d8'); I.box(s * C.AX, 0, (C.Z_APSE + C.SANCT.z1) / 2, 0.3, 1.9, C.SANCT.z1 - C.Z_APSE, ST2); }
  { // 祭台：前面是铺红布的祭台，后面靠后殿是白色主祭台，正中一座小尖塔龛
    const y = C.SANCT.h, A = C.ALTAR, Hh = C.HIGH_ALTAR, WH = '#f1ede2', GOLD = '#d9b860';
    I.box(A.x, y, A.z, 3.0, 0.98, 1.0, '#7c1f24'); I.box(A.x, y + 0.98, A.z, 3.2, 0.08, 1.15, '#f4f0e6'); I.box(A.x, y + 0.5, A.z + 0.51, 0.5, 0.34, 0.02, GOLD);
    // 主祭台整体放大一号：照片里它有五六米高
    const K = 1.5, sc = (B, ox, oy, oz) => ({ box: (x, yy, z, sx, sy, sz, c) => B.box(ox + (x - ox) * K, oy + (yy - oy) * K, oz + (z - oz) * K, sx * K, sy * K, sz * K, c), prism: (x, yy, z, w, h, d, c) => B.prism(ox + (x - ox) * K, oy + (yy - oy) * K, oz + (z - oz) * K, w * K, h * K, d * K, c), spike: (x, yy, z, r, h, c) => B.spike(ox + (x - ox) * K, oy + (yy - oy) * K, oz + (z - oz) * K, r * K, h * K, c), cyl: (x, yy, z, r, h, c, kind) => B.cyl(ox + (x - ox) * K, oy + (yy - oy) * K, oz + (z - oz) * K, r * K, h * K, c, kind), ball: (x, yy, z, r, c, sy) => B.ball(ox + (x - ox) * K, oy + (yy - oy) * K, oz + (z - oz) * K, r * K, c, sy) });
    const HA = sc(I, Hh.x, y, Hh.z + 0.9), HG = sc(IG, Hh.x, y, Hh.z + 0.9);
    HA.box(Hh.x, y, Hh.z, 5.0, 0.3, 2.0, WH); HA.box(Hh.x, y + 0.3, Hh.z - 0.2, 4.4, 1.0, 1.3, WH); HA.box(Hh.x, y + 1.3, Hh.z - 0.45, 4.6, 0.12, 0.9, WH);
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) { const x = sx * (0.95 + k * 0.6); HA.box(x, y + 1.42, Hh.z - 0.6, 0.5, 1.0, 0.35, WH); HA.prism(x, y + 2.42, Hh.z - 0.6, 0.56, 0.5, 0.36, WH); HA.box(x, y + 1.55, Hh.z - 0.41, 0.28, 0.7, 0.03, '#cfc6b0'); }
    HA.box(Hh.x, y + 1.42, Hh.z - 0.6, 1.2, 2.6, 0.9, WH); HA.box(Hh.x, y + 1.8, Hh.z - 0.14, 0.8, 1.9, 0.04, '#e8d9a8'); HA.prism(Hh.x, y + 4.02, Hh.z - 0.6, 1.5, 1.0, 0.92, WH); HA.spike(Hh.x, y + 4.6, Hh.z - 0.6, 0.42, 2.4, WH); HA.box(Hh.x, y + 7.0, Hh.z - 0.6, 0.06, 0.5, 0.06, GOLD); HA.box(Hh.x, y + 7.25, Hh.z - 0.6, 0.3, 0.06, 0.06, GOLD);
    for (const sx of [-1, 1]) { HA.spike(Hh.x + sx * 0.72, y + 4.0, Hh.z - 0.6, 0.14, 1.2, WH); HA.spike(Hh.x + sx * 2.3, y + 2.4, Hh.z - 0.6, 0.16, 1.0, WH); }
    // 龛里的圣心像：只做成一个红袍的小立像
    HA.cyl(Hh.x, y + 2.0, Hh.z - 0.25, 0.2, 1.0, '#a8242a', 'taper'); HA.ball(Hh.x, y + 3.12, Hh.z - 0.25, 0.13, '#e8c9a8'); HA.box(Hh.x, y + 2.5, Hh.z - 0.2, 0.62, 0.12, 0.1, '#f1ede2');
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) { HA.cyl(Hh.x + sx * (0.9 + k * 0.6), y + 1.42, Hh.z + 0.05, 0.03, 0.5 + k * 0.08, GOLD); HG.ball(Hh.x + sx * (0.9 + k * 0.6), y + 1.99 + k * 0.08, Hh.z + 0.05, 0.045, '#ffd98a', 1.6); }
    // 侧廊北端的两座小祭台
    for (const sx of [-1, 1]) { const x = sx * 7.7, z = C.Z_APSE + 1.0; I.box(x, 0, z, 2.4, 1.0, 0.9, WH); I.box(x, 1.0, z - 0.2, 1.3, 2.2, 0.5, WH); I.prism(x, 3.2, z - 0.2, 1.5, 0.9, 0.52, WH); I.spike(x, 3.9, z - 0.2, 0.2, 1.3, WH); I.cyl(x, 1.3, z + 0.02, 0.16, 0.9, sx > 0 ? '#3a5fb0' : '#8a5a3a', 'taper'); I.ball(x, 2.3, z + 0.02, 0.11, '#e8c9a8'); }
    // 圣所一侧柱上的十字架
    I.box(C.AX - 0.2, 3.0, C.Z_CROSS1 + 0.95, 0.07, 1.5, 0.07, '#6a452c'); I.box(C.AX - 0.2, 4.0, C.Z_CROSS1 + 0.95, 0.7, 0.07, 0.07, '#6a452c'); I.box(C.AX - 0.2, 3.5, C.Z_CROSS1 + 1.0, 0.12, 0.6, 0.05, '#d8c4a6');
  }
  // 吊灯：中殿每个开间一盏，黑铁的两圈枝灯
  const chand = (x, y, z, r, drop) => { I.rod([x, y, z], [x, y + drop, z], 0.02, '#2a2622'); I.cyl(x, y + 0.2, z, 0.06, 1.3, '#1f1c19'); for (const [rr, yy, n] of [[r, 0, 12], [r * 0.6, 0.6, 8]]) { for (let k = 0; k < n; k++) { const a = k * Math.PI * 2 / n; I.rod([x, y + yy + 0.7, z], [x + Math.cos(a) * rr, y + yy + 0.25, z + Math.sin(a) * rr], 0.018, '#1f1c19'); IG.ball(x + Math.cos(a) * rr, y + yy + 0.42, z + Math.sin(a) * rr, 0.05, '#ffe2a0', 1.5); } } };
  keys.forEach((k, i) => { if (i === 0 || i % 2 || k.cz < C.Z_CROSS1 - 6) return; chand(0, 12.0, k.cz, 1.2, k.apex - 12.4); });
  chand(0, 9.5, C.Z_CROSS1 - 7.5, 1.1, C.H.vault - 10.2);
  for (const s of [-1, 1]) bays.forEach((b, i) => { if (!b.chancel && i % 2 === 1) chand(s * 7.7, 7.6, b.z0 - b.len / 2, 0.45, 2.9); });
  // 侧廊墩上的苦路浮雕（白色小龛，示意）
  for (const s of [-1, 1]) for (let k = 1; k < C.NAVE_BAYS; k++) { I.box(s * (C.AISLE - 0.5), 2.2, C.naveLine(k), 0.1, 0.8, 0.6, '#efeadc'); I.prism(s * (C.AISLE - 0.5), 3.0, C.naveLine(k), 0.6, 0.3, 0.1, '#efeadc', Math.PI / 2); }
  // 门：从里面看是深红的木门扇。门扇内面比门洞侧面往里凸 2 厘米——原先两面重合，镜头一动门边就一条条闪
  for (const d of C.DOORS) if (d.axis === 'x') for (const e of [-1, 1]) I.box(d.x + e * (d.half + 0.03), 0, C.Z_FRONT - 0.5, 0.1, d.half > 1.2 ? 4.4 : 3.4, d.half * 1.0, '#5e1f1c');
  I.build(); IG.build(); S.build(); RB.build();

  // 圣所的暖光：祭台周围点着灯，照片里这一块是金色的
  const altarLight = new THREE.PointLight('#ffc070', 22, 26, 1.4); altarLight.position.set(0, 6.5, C.Z_APSE + 1.5); int.add(altarLight);
  // 天穹
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1900, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: new THREE.Vector3(1, 0.6, 0.2).normalize() }, uHor: { value: new THREE.Color('#dfe6ea') }, uZen: { value: new THREE.Color('#7fa8cf') }, uGlow: { value: new THREE.Color('#fff0cc') } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `varying vec3 vD; uniform vec3 uSun, uHor, uZen, uGlow;
      void main(){ vec3 d = normalize(vD); float h = clamp(d.y, 0., 1.); vec3 c = mix(uHor, uZen, pow(h, .5));
        float s = max(dot(d, uSun), 0.); c += uGlow * (pow(s, 8.) * .3 + pow(s, 240.) * 1.6);
        gl_FragColor = vec4(c, 1.);
        #include <colorspace_fragment>
      }`,
  }));
  scene.add(sky);

  return {
    ext, int, sky, noPre, city: extInfo.city, doorVoids: extInfo.voids, rays: { vol: volMat, mesh: vol }, vaultMat, ribMat, eastMats, westMats, southMats, apseMats,
    counts: { piers: C.PIERS.length, ribs: ribCount, windows: [...winGroups.values()].reduce((a, b) => a + b.length, 0), pews: C.PEWS.length, ...extInfo.counts },
  };
}
