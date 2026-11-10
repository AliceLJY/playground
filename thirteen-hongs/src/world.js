// 十三行江岸：把布局搭成 three 场景。全部形体由代码生成，贴图只有运行时画的画布（旗、招牌、地面噪点）。
import * as THREE from 'three';
import { FACTORIES, LANES, FRONT, WATER_Y, GARDEN, YARDS, SCALE, SHED, STALLS, POLES, JETTIES, STEPS, BOUND, EVENT, DECK, rng } from './core.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _c = new THREE.Color(), _n = new THREE.Matrix3();

function prismGeo() {
  const A = [-.5, 0, -.5], B = [.5, 0, -.5], C = [0, 1, -.5], D = [-.5, 0, .5], E = [.5, 0, .5], F = [0, 1, .5];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([D, E, F, B, A, C, A, D, F, A, F, C, E, B, C, E, C, F].flat(), 3));
  g.computeVertexNormals();
  return g;
}
function archGeo() { // 半圆筒壳，轴沿 z，拱顶朝上
  const g = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true, 0, Math.PI).toNonIndexed();
  g.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)));
  return g;
}
const UNIT = {
  box: new THREE.BoxGeometry(1, 1, 1).toNonIndexed(),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10).toNonIndexed(),
  cone: new THREE.ConeGeometry(1, 1, 10).toNonIndexed(),
  ball: new THREE.IcosahedronGeometry(1, 1),
  half: new THREE.CircleGeometry(1, 12, 0, Math.PI).toNonIndexed(),
  prism: prismGeo(), arch: archGeo(),
};

export class Builder {
  constructor(seed = 7, mat = 0) { this.p = []; this.n = []; this.c = []; this.m = []; this.mat = mat; this.r = rng(seed); }
  xf(x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0) { _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); return _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)); }
  add(g, m, color, jit = 0) {
    const pos = g.attributes.position, nor = g.attributes.normal;
    _c.set(color); if (jit) _c.multiplyScalar(1 + (this.r() - 0.5) * jit);
    _n.getNormalMatrix(m);
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(m); this.p.push(_v.x, _v.y, _v.z);
      _v.fromBufferAttribute(nor, i).applyMatrix3(_n).normalize(); this.n.push(_v.x, _v.y, _v.z);
      this.c.push(_c.r, _c.g, _c.b); this.m.push(this.mat);
    }
    return this;
  }
  box(x, y0, z, sx, h, sz, color, ry = 0, jit = 0, rx = 0, rz = 0) { return this.add(UNIT.box, this.xf(x, y0 + h / 2, z, sx, h, sz, ry, rx, rz), color, jit); }
  cyl(x, y0, z, r, h, color, jit = 0, rx = 0, rz = 0) { return this.add(UNIT.cyl, this.xf(x, y0 + h / 2, z, r, h, r, 0, rx, rz), color, jit); }
  cone(x, y0, z, r, h, color, jit = 0) { return this.add(UNIT.cone, this.xf(x, y0 + h / 2, z, r, h, r), color, jit); }
  ball(x, y, z, rx, ry, rz, color, jit = 0) { return this.add(UNIT.ball, this.xf(x, y, z, rx, ry, rz), color, jit); }
  prism(x, y0, z, w, h, len, color, ry = 0, jit = 0) { const k = this.mat; this.mat = 1; this.add(UNIT.prism, this.xf(x, y0, z, w, h, len, ry), color, jit); this.mat = k; return this; }
  half(x, y, z, r, color, ry = 0) { return this.add(UNIT.half, this.xf(x, y, z, r, r, 1, ry), color); }
  arch(x, y0, z, r, h, len, color, ry = 0, jit = 0) { const k = this.mat; this.mat = 3; this.add(UNIT.arch, this.xf(x, y0, z, r, h, len, ry), color, jit); this.mat = k; return this; }
  geo(m, color, g, jit = 0) { return this.add(g, m, color, jit); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aMat', new THREE.Float32BufferAttribute(this.m, 1));
    return g;
  }
  mesh(mat) { return new THREE.Mesh(this.geometry(), mat); }
  get tris() { return this.p.length / 9; }
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const FLAG_DRAW = {
  dk(g, w, h) { g.fillStyle = '#c8102e'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(w * 0.3, 0, w * 0.12, h); g.fillRect(0, h * 0.42, w, h * 0.16); },
  es(g, w, h) { g.fillStyle = '#c1272d'; g.fillRect(0, 0, w, h); g.fillStyle = '#f2c230'; g.fillRect(0, h * 0.25, w, h * 0.5); },
  us(g, w, h) { for (let i = 0; i < 13; i++) { g.fillStyle = i % 2 ? '#f4f1e8' : '#b22234'; g.fillRect(0, i * h / 13, w, h / 13 + 1); } g.fillStyle = '#2b3a67'; g.fillRect(0, 0, w * 0.42, h * 7 / 13); g.fillStyle = '#f4f1e8'; for (let i = 0; i < 15; i++) g.fillRect(w * 0.05 + (i % 5) * w * 0.075, h * 0.07 + Math.floor(i / 5) * h * 0.15, 3, 3); },
  se(g, w, h) { g.fillStyle = '#2a5d9f'; g.fillRect(0, 0, w, h); g.fillStyle = '#f2c230'; g.fillRect(w * 0.3, 0, w * 0.12, h); g.fillRect(0, h * 0.42, w, h * 0.16); },
  gb(g, w, h) { g.fillStyle = '#243a73'; g.fillRect(0, 0, w, h); const d = (c, lw) => { g.strokeStyle = c; g.lineWidth = lw; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke(); }; d('#f4f1e8', h * 0.2); d('#c8102e', h * 0.07); g.fillStyle = '#f4f1e8'; g.fillRect(w * 0.4, 0, w * 0.2, h); g.fillRect(0, h * 0.35, w, h * 0.3); g.fillStyle = '#c8102e'; g.fillRect(w * 0.44, 0, w * 0.12, h); g.fillRect(0, h * 0.41, w, h * 0.18); },
  nl(g, w, h) { ['#ae1c28', '#f4f1e8', '#21468b'].forEach((c, i) => { g.fillStyle = c; g.fillRect(0, i * h / 3, w, h / 3 + 1); }); },
  plain(g, w, h) { g.fillStyle = '#efe6cf'; g.fillRect(0, 0, w, h); g.fillStyle = '#a8523c'; g.fillRect(0, 0, w, h * 0.12); g.fillRect(0, h * 0.88, w, h * 0.12); },
};
function signTex(text, bg = '#3a1f1a', fg = '#e9c66a', vertical = false) {
  const n = text.length, w = vertical ? 64 : 64 * n, h = vertical ? 64 * n : 64;
  return canvasTex(w, h, g => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = fg; g.lineWidth = 3; g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = fg; g.font = '600 44px "Songti SC","STSong","Noto Serif CJK SC",serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    [...text].forEach((ch, i) => vertical ? g.fillText(ch, 32, 34 + i * 64) : g.fillText(ch, 32 + i * 64, 34));
  });
}

function hullGeo(L, B, D, o = {}) {
  const { bow = 0.2, stern = 0.45, sheer = 0.5, sternSheer = 1, rise = 0.5, free = 0.5 } = o;
  const g = new THREE.BoxGeometry(B, D, L, 2, 2, 12), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i); const z = p.getZ(i);
    const e = 2 * z / L, v = y / D + 0.5, ee = Math.abs(e) ** 2.4;
    x *= (1 - ee * (1 - (e > 0 ? bow : stern))) * (0.6 + 0.4 * v);
    y += sheer * e * e * (e > 0 ? 1 : sternSheer) + (1 - v) * rise * e * e + free - D / 2;
    p.setXYZ(i, x, y, z);
  }
  const ng = g.toNonIndexed(); ng.computeVertexNormals();
  return ng;
}
const I = new THREE.Matrix4();
const BOAT_BUILD = {
  sampan(b) {
    b.geo(I, '#5b4636', hullGeo(6.2, 1.7, 0.7, { free: 0.42, sheer: 0.35 }), 0.1);
    b.box(0, 0.28, 0, 1.25, 0.05, 4.6, '#8a7152');
    b.arch(0, 0.33, 0.5, 0.72, 0.95, 2.5, '#b89b63', 0, 0.08); b.arch(0, 0.33, -0.9, 0.76, 1.0, 0.8, '#9c8250');
    b.box(0.35, 0.9, -3.3, 0.06, 0.06, 3.4, '#6b5540', 0.25, 0, -0.45);
    b.box(0, 0.36, 2.5, 0.5, 0.2, 0.4, '#7a2f2a');
  },
  ferry(b) {
    b.geo(I, '#54412f', hullGeo(9.4, 2.5, 0.9, { free: 0.6, sheer: 0.4 }), 0.1);
    b.box(0, 0.45, 0, 1.9, 0.06, 7, '#8a7152');
    b.arch(0, 0.5, 0.4, 1.1, 1.35, 5.2, '#a8905c', 0, 0.06);
    for (const z of [-2, 0.4, 2.8]) b.arch(0, 0.5, z, 1.13, 1.38, 0.12, '#6b5540');
    b.box(0.5, 1.2, -4.9, 0.07, 0.07, 4.4, '#6b5540', 0.2, 0, -0.4);
  },
  chop(b) {
    b.geo(I, '#4a3a2c', hullGeo(17, 4.3, 1.7, { free: 1.0, sheer: 0.55, bow: 0.35, stern: 0.55 }), 0.08);
    b.box(0, 0.9, 0, 3.5, 0.08, 14.5, '#8b7355');
    b.box(0, 0.95, -1.9, 3.7, 1.1, 8.6, '#7a6146', 0, 0.05);
    b.arch(0, 2.05, -1.9, 1.95, 1.25, 8.9, '#8d7a55', 0, 0.05);
    for (let z = -5.8; z <= 2.1; z += 1.3) b.arch(0, 2.05, z, 1.99, 1.29, 0.14, '#5c4b36');
    for (const z of [-4.2, -1.9, 0.4]) for (const s of [-1, 1]) b.box(s * 1.86, 1.25, z, 0.05, 0.55, 1.1, '#2a221c');
    b.cyl(0, 0.9, 2.75, 0.13, 9.5, '#5b4636'); b.box(0, 9.9, 2.75, 0.06, 0.5, 0.9, '#b23a2e');
    b.box(0, 1.0, -7.2, 2.6, 0.5, 2.0, '#6b5540'); b.box(0, -0.6, -8.7, 0.16, 2.6, 1.3, '#3d3026');
    b.box(0.9, 1.9, -9.6, 0.09, 0.09, 6.5, '#6b5540', 0.12, 0, -0.33);
    b.box(0, 0.95, 7.2, 0.5, 0.5, 0.5, '#3d3026');
  },
  flower(b) {
    b.geo(I, '#3f3028', hullGeo(21, 5.3, 1.6, { free: 1.05, sheer: 0.35, bow: 0.5, stern: 0.6 }), 0.06);
    b.box(0, 1.0, 0, 4.9, 0.1, 19, '#7a5a3a');
    b.box(0, 1.1, -0.5, 4.3, 2.5, 13, '#2f5d4a');
    for (let z = -6; z <= 5; z += 1.57) for (const s of [-1, 1]) { b.box(s * 2.17, 1.9, z, 0.05, 1.3, 0.95, '#c9a24a'); b.box(s * 2.2, 2.05, z, 0.05, 0.9, 0.6, '#3a2420'); }
    b.box(0, 3.6, -0.5, 5.3, 0.16, 14, '#2a2623');
    b.box(0, 3.76, -1.5, 3.8, 2.1, 8.6, '#7a2f2a');
    for (let z = -5; z <= 2; z += 1.4) for (const s of [-1, 1]) b.box(s * 1.92, 4.3, z, 0.05, 1.0, 0.8, '#d9b860');
    b.box(0, 5.86, -1.5, 4.9, 0.18, 9.8, '#2a2623'); b.box(0, 6.04, -1.5, 3.2, 0.25, 8, '#39332d');
    for (let z = -7; z <= 6; z += 1.3) for (const s of [-1, 1]) b.box(s * 2.55, 3.76, z, 0.07, 0.75, 0.07, '#c9a24a');
    for (const s of [-1, 1]) b.box(s * 2.55, 4.45, -0.5, 0.07, 0.07, 13.4, '#c9a24a');
    for (const s of [-1, 1]) b.box(s * 1.5, 1.1, 8.2, 0.2, 3.2, 0.2, '#8f2f26'); b.box(0, 4.1, 8.2, 3.8, 0.35, 0.3, '#c9a24a'); b.box(0, 4.45, 8.2, 4.4, 0.14, 0.7, '#2a2623');
    for (let z = -6.5; z <= 5.6; z += 2.4) for (const s of [-1, 1]) b.ball(s * 2.62, 3.3, z, 0.2, 0.26, 0.2, '#d6452f');
    b.ball(-1.2, 3.6, 8.3, 0.24, 0.3, 0.24, '#d6452f'); b.ball(1.2, 3.6, 8.3, 0.24, 0.3, 0.24, '#d6452f');
  },
  junk(b) {
    b.geo(I, '#4b382b', hullGeo(30, 7.8, 4.2, { free: 2.4, sheer: 1.2, sternSheer: 2.2, bow: 0.42, stern: 0.7, rise: 1.4 }), 0.06);
    b.box(0, 2.2, 0.5, 6.4, 0.12, 21, '#8b7355');
    b.box(0, 2.3, -10.5, 6.2, 2.0, 7, '#6a4f3a'); b.box(0, 4.3, -12, 5.6, 1.6, 5, '#7a5a40'); b.box(0, 5.9, -12, 5.9, 0.14, 5.4, '#8b7355');
    b.box(0, 3.4, -15.1, 4.6, 3.2, 0.2, '#e8dcc0'); b.box(0, 4.2, -15.22, 3.0, 1.2, 0.1, '#b23a2e');
    for (const s of [-1, 1]) { b.box(s * 3.95, 1.75, 2, 0.08, 0.35, 23, '#d8caa6'); b.ball(s * 2.2, 3.1, 13.2, 0.1, 0.4, 0.5, '#f1ead8'); b.ball(s * 2.28, 3.1, 13.3, 0.1, 0.18, 0.2, '#15151a'); }
    b.cyl(0, 2.2, 8.5, 0.2, 13, '#5b4636'); b.cyl(0, 2.2, 0, 0.27, 19, '#5b4636'); b.cyl(0, 5.9, -11, 0.16, 9, '#5b4636');
    b.box(0, 21.2, 0, 0.05, 0.6, 1.6, '#b23a2e'); b.box(0, 15.2, 8.5, 0.05, 0.45, 1.2, '#b23a2e');
    b.box(0, -1.2, -15.6, 0.3, 5, 2.4, '#3d3026');
    for (const z of [3, 5, 6.5]) b.cyl(-1.6 + z * 0.3, 2.3, z - 1, 0.42, 0.8, '#7a6146', 0.1);
  },
};
BOAT_BUILD.sedan = b => {
  for (const s of [-1, 1]) b.box(s * 0.43, 0.84, 0, 0.06, 0.06, 4.7, '#5b4636');
  b.box(0, 0.5, 0, 0.84, 0.07, 1.05, '#3d3026'); b.mat = 0;
  for (const s of [-1, 1]) { b.box(s * 0.42, 0.57, 0, 0.04, 1.3, 1.05, '#2f5d4a'); b.box(s * 0.445, 1.15, 0.05, 0.02, 0.45, 0.5, '#1d1815'); }
  b.box(0, 0.57, -0.52, 0.84, 1.3, 0.04, '#2f5d4a'); b.box(0, 1.5, 0.52, 0.84, 0.37, 0.03, '#27405e');
  b.box(0, 1.87, 0, 1.0, 0.07, 1.2, '#1f1b18'); b.prism(0, 1.94, 0, 1.0, 0.16, 1.2, '#2a2623'); b.ball(0, 2.14, 0, 0.07, 0.07, 0.07, '#c9a24a');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * 0.41, 0.5, sz * 0.51, 0.05, 1.4, 0.05, '#7a2f2a');
};
function lugSail(b, x, y0, z, w, h, color = '#9a5a3c') {
  b.box(x + 0.08, y0, z - w * 0.18, 0.05, h, w, color, 0, 0.05);
  for (let i = 0; i <= 6; i++) b.box(x + 0.12, y0 + i * h / 6 - 0.05, z - w * 0.18, 0.09, 0.1, w + 0.2, '#5c3a28');
}
const SAIL_BUILD = {
  chop(b) { lugSail(b, 0, 0, 2.75, 5.6, 6.6, '#b59463'); },
  junk(b) { lugSail(b, 0, 0.9, 8.5, 6.5, 9.4); lugSail(b, 0, 1.4, 0, 9, 14.5); lugSail(b, 0, 4.6, -11, 4.4, 5.6); },
};
const SAIL_BASE = { chop: 3.0, junk: 2.4 };

// 程序纹理：按顶点上的材质号，在片元里给瓦、木板、篾席、砖石加纹路（不用任何贴图）
function detail(mat) {
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aMat; varying float vMat; varying vec3 vOp; varying vec3 vOn;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMat = aMat; vOp = position; vOn = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying float vMat; varying vec3 vOp; varying vec3 vOn;
      float dHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float dNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(dHash(i), dHash(i + vec2(1., 0.)), f.x), mix(dHash(i + vec2(0., 1.)), dHash(i + vec2(1., 1.)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      { float m = floor(vMat + .5), k = 1.; vec3 p = vOp; vec3 an = abs(vOn);
        float u = an.x > an.z ? p.z : p.x;                      // 沿墙面或屋脊的水平方向
        float grain = dNoise(p.xz * 2.3 + p.y * 1.7);
        if (m == 1.) { float v = an.x > an.z ? p.x : p.z; k = (.74 + .26 * smoothstep(.0, .3, abs(fract(u * 2.6) - .5))) * (.9 + .1 * step(.5, fract(v * 1.6 + p.y * 1.6))) * (.9 + .2 * grain); }
        else if (m == 2.) { float a = an.y > .6 ? p.x : p.y; k = (.8 + .2 * smoothstep(0., .07, abs(fract(a * 2.4) - .5))) * (.9 + .16 * dNoise(vec2(a * 3., (p.z + p.x) * 14.))); }
        else if (m == 3.) { float w1 = step(.5, fract((u + p.y) * 5.)), w2 = step(.5, fract((u - p.y) * 5.)); k = .8 + .12 * w1 + .12 * w2; }
        else if (m == 4.) { float row = floor(p.y * 3.3); k = (.84 + .16 * smoothstep(0., .08, abs(fract(p.y * 3.3) - .5)) * smoothstep(0., .05, abs(fract(u * 1.5 + mod(row, 2.) * .5) - .5))) * (.92 + .14 * grain); }
        else { k = .93 + .12 * grain; }
        diffuseColor.rgb *= k; }`);
  };
  return mat;
}

export function buildWorld(scene, sim, opts = {}) {
  const R = rng(1805), rr = (a, b) => a + R() * (b - a), pk = a => a[Math.floor(R() * a.length)];
  const matWorld = detail(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const matBoat = detail(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  const B = new Builder(11), P = new Builder(12), FAR = new Builder(13);   // 建筑 / 小件 / 远景
  const signs = [];
  const TRIM = '#f6f1e4', DARK = '#2e2620', STONE = '#a39a86', WOOD = '#8a6f4d';
  const TILE = ['#6e6b63', '#7a7468', '#67645e', '#85705f'];

  // ---- 地面、驳岸、石阶、栈桥 ----
  const paving = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#c9bc9f'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { const v = 150 + Math.floor(R() * 70); g.fillStyle = `rgba(${v},${v - 10},${v - 34},0.16)`; g.fillRect(R() * w, R() * h, 1 + R() * 5, 1 + R() * 3); }
    g.strokeStyle = 'rgba(90,80,60,0.14)'; for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.moveTo(i * 32 + (i % 2) * 9, 0); g.lineTo(i * 32 + (i % 2) * 9, h); g.stroke(); }
  });
  paving.wrapS = paving.wrapT = THREE.RepeatWrapping; paving.repeat.set(60, 36);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 260), new THREE.MeshLambertMaterial({ map: paving }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(-51, 0, -130); ground.receiveShadow = true; scene.add(ground);
  // 陆地铺满北岸（小溪留一道口），铺石只在商馆区
  const landMat = new THREE.MeshLambertMaterial({ color: '#b9b190' });
  B.mat = 4;
  for (const [x0, x1] of [[-2600, 152.5], [158, 2600]]) {
    const land = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, 2600), landMat);
    land.rotation.x = -Math.PI / 2; land.position.set((x0 + x1) / 2, -0.04, -1300.9); land.receiveShadow = true; scene.add(land);
    B.box((x0 + x1) / 2, -4.5, -0.45, x1 - x0, 4.5, 0.9, STONE); B.box((x0 + x1) / 2, 0, -0.5, x1 - x0, 0.14, 1.0, '#b7ae99');
  }
  for (let x = -248; x < 148; x += 2.2) B.box(x, -3.6, 0.02, 2.1, 3.4, 0.06, STONE, 0, 0.12);
  for (const s of STEPS) {
    const w = s.x1 - s.x0, cx = (s.x0 + s.x1) / 2;
    for (let i = 0; i < 6; i++) B.box(cx, -4.5, 0.35 + i * 0.7, w, 4.5 - (i + 1) * 0.22, 0.7, '#aaa18c', 0, 0.06);
    for (const x of [s.x0 - 0.3, s.x1 + 0.3]) B.box(x, -4.5, 2.1, 0.6, 4.6, 4.2, STONE);
    for (const x of [s.x0 - 0.3, s.x1 + 0.3]) P.cyl(x, 0.1, -0.3, 0.2, 0.9, '#7d7566');
  }
  B.mat = 2; P.mat = 2;
  for (const j of JETTIES) {
    const w = j.x1 - j.x0, cx = (j.x0 + j.x1) / 2;
    for (let z = 0.3; z < j.z1; z += 0.62) B.box(cx, -0.16, z, w, 0.16, 0.58, WOOD, 0, 0.16);
    for (let z = 1; z < j.z1; z += 3.2) for (const x of [j.x0 + 0.2, j.x1 - 0.2]) { B.cyl(x, -4.5, z, 0.16, 4.4, '#5b4636'); P.cyl(x, 0, z, 0.13, 0.75, '#5b4636'); }
  }
  B.mat = 4; P.mat = 0;
  // 小溪与石桥（东端）
  B.box(152.5, -4.5, -115, 0.9, 4.5, 230, STONE); B.box(158, -4.5, -115, 0.9, 4.5, 230, STONE);
  B.box(155.3, 0.1, -30, 7.6, 0.4, 3.4, '#aaa18c'); for (const z of [-31.6, -28.4]) B.box(155.3, 0.5, z, 7.6, 0.7, 0.25, STONE);
  const eastGround = new THREE.Mesh(new THREE.PlaneGeometry(380, 70), ground.material);
  eastGround.rotation.x = -Math.PI / 2; eastGround.position.set(348, 0, -35); eastGround.receiveShadow = true; scene.add(eastGround);
  const creekCover = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 260), ground.material); // 铺石平面只到 x=149，补到小溪西岸
  creekCover.rotation.x = -Math.PI / 2; creekCover.position.set(150.7, 0, -130); scene.add(creekCover);

  B.mat = 0;
  // ---- 商馆 ----
  function rearRanges(f, w, H, z0) {
    let z = z0;
    for (let k = 0; k < 6; k++) {
      const len = rr(18, 26), ww = w * rr(0.78, 0.96), hh = H * rr(0.62, 0.85), cx = f.cx + rr(-0.6, 0.6);
      B.mat = 4; B.box(cx, 0, z - len / 2, ww, hh, len, k % 2 ? '#d6cdb8' : '#b9b3a4', 0, 0.06); B.mat = 0;
      B.prism(cx, hh, z - len / 2, ww + 0.8, rr(2.2, 3.2), len + 0.4, pk(TILE), 0, 0.08);
      z -= len + rr(1.5, 5);
    }
  }
  function facade(f) {
    const w = 20.5, cx = f.cx, z = FRONT;
    if (f.style === 'hong') {
      const H = 8.4, brick = f.wall;
      B.mat = 4; B.box(cx, 0, z - 7, w, H, 14, brick, 0, 0.03);
      for (const s of [-1, 1]) { B.box(cx + s * (w / 2 - 0.2), 0, z - 7, 0.5, H + 2.2, 14.6, '#8d8d86'); B.box(cx + s * (w / 2 - 0.2), H + 2.2, z - 7, 0.7, 0.25, 15, '#55534d'); }
      B.prism(cx, H, z - 7, 14.4, 2.6, w - 0.6, pk(TILE), Math.PI / 2);
      B.mat = 2; B.box(cx, 0, z + 0.04, 3.6, 3.9, 0.1, '#4d241f'); B.box(cx, 0, z + 0.1, 0.08, 3.9, 0.06, '#2a1512');
      B.box(cx, 3.9, z + 0.1, 4.6, 0.3, 0.3, '#3a2a22');
      B.box(cx, 5.75, z + 1.0, 9, 0.16, 2.6, pk(TILE), 0, 0, 0.28); for (const s of [-1, 1]) B.box(cx + s * 4.1, 0, z + 2.0, 0.24, 5.4, 0.24, '#5a2a22');
      for (const s of [-1, 1]) { P.ball(cx + s * 2.5, 4.3, z + 1.7, 0.33, 0.42, 0.33, '#d6452f'); for (const dx of [5.4, 8.1]) { B.box(cx + s * dx, 1.3, z + 0.04, 1.5, 1.7, 0.08, '#3a2a22'); for (let i = -1; i <= 1; i++) B.box(cx + s * dx + i * 0.4, 1.3, z + 0.09, 0.07, 1.7, 0.04, '#8a7152'); } }
      B.box(cx, 5.6, z + 0.06, w - 1.4, 1.9, 0.1, '#5b4132'); for (let x = -9; x <= 9; x += 1.5) { B.box(cx + x, 5.6, z + 0.12, 0.12, 1.9, 0.06, '#8a7152'); B.box(cx + x + 0.75, 5.9, z + 0.12, 1.0, 1.1, 0.04, '#231b16'); }
      B.mat = 0; signs.push({ text: f.hong, x: cx, y: 4.75, z: z + 0.32, w: 3.6, h: 1.2 });
      rearRanges(f, w, H, z - 15);
      return;
    }
    const H = f.storeys * 4.7 + 0.8, sb = f.style === 'veranda' ? 3.2 : 0, fz = z - sb;
    const shut = pk(['#4f7a5c', '#3f6a58', '#55808c', '#6b7d4f']);
    B.box(cx, 0, z - 7 - sb / 2, w, H, 14 - sb, f.wall, 0, 0.02);
    const bays = 5, bw = w / bays;
    for (let b = 0; b < bays; b++) {
      const bx = cx - w / 2 + bw * (b + 0.5);
      for (let s = 0; s < f.storeys; s++) {
        const y0 = s * 4.7;
        if (s === 0 && !sb) {
          B.box(bx, 0, fz + 0.03, 2.36, 2.6, 0.05, TRIM); B.half(bx, 2.6, fz + 0.056, 1.18, TRIM);
          B.box(bx, 0, fz + 0.07, 2.0, 2.6, 0.05, DARK); B.half(bx, 2.6, fz + 0.096, 1.0, DARK);
          if (b !== 2) B.box(bx, 0, fz + 0.1, 2.0, 1.0, 0.05, '#5b4132');
        } else {
          B.box(bx, y0 + 1.2, fz + 0.03, 1.3, 2.4, 0.06, DARK);
          for (const s2 of [-1, 1]) B.box(bx + s2 * 0.98, y0 + 1.2, fz + 0.06, 0.6, 2.4, 0.08, shut, 0, 0.1);
          B.box(bx, y0 + 1.06, fz + 0.12, 2.6, 0.14, 0.26, TRIM); B.box(bx, y0 + 3.6, fz + 0.1, 1.7, 0.18, 0.2, TRIM);
        }
      }
    }
    for (let s = 1; s <= f.storeys; s++) B.box(cx, s * 4.7 - 0.1, fz + 0.1, w + 0.3, 0.3, 0.4, TRIM);
    for (const s of [-1, 1]) B.box(cx + s * (w / 2 - 0.25), 0, fz + 0.06, 0.5, H, 0.12, TRIM);
    B.box(cx, H, z - 0.25, w + 0.3, 0.3, 0.7, TRIM);
    for (let x = -w / 2 + 0.4; x <= w / 2 - 0.3; x += 0.85) B.box(cx + x, H + 0.3, z - 0.25, 0.2, 0.7, 0.2, TRIM);
    B.box(cx, H + 1.0, z - 0.25, w + 0.2, 0.16, 0.4, TRIM);
    B.prism(cx, H - 0.2, z - 7.4, 13, 2.4, w - 1, pk(TILE), Math.PI / 2);
    if (f.style === 'arcade') {
      B.prism(cx, H + 1.16, z - 0.3, 8, 2.1, 0.5, f.wall); B.box(cx, H + 1.16, z - 0.28, 8.4, 0.18, 0.6, TRIM);
      B.ball(cx, H + 1.95, z - 0.02, 0.5, 0.5, 0.06, DARK);
    }
    if (f.style === 'veranda') {
      for (let s = 0; s < f.storeys; s++) {
        const y0 = s * 4.7;
        if (s) B.box(cx, y0 - 0.3, z - sb / 2, w, 0.3, sb + 0.3, TRIM);
        for (let i = 0; i <= 5; i++) { const x = cx - w / 2 + 0.5 + i * (w - 1) / 5; B.cyl(x, y0, z - 0.35, 0.26, 4.4, TRIM); B.box(x, y0 + 4.05, z - 0.35, 0.75, 0.35, 0.75, TRIM); B.box(x, y0, z - 0.35, 0.75, 0.3, 0.75, TRIM); }
        if (s) { B.box(cx, y0 + 0.95, z - 0.35, w - 1, 0.12, 0.16, TRIM); for (let x = -w / 2 + 0.9; x < w / 2 - 0.6; x += 0.5) B.box(cx + x, y0, z - 0.35, 0.08, 0.95, 0.08, TRIM); }
        for (const b of [0, 2, 4]) if (s === 0) { const bx = cx - w / 2 + bw * (b + 0.5); B.box(bx, 0, fz + 0.07, 1.7, 3.0, 0.06, '#4a3328'); }
      }
      B.box(cx, H - 0.35, z - sb / 2, w + 0.5, 0.35, sb + 0.9, TRIM);
    }
    if (f.style === 'portico') {
      const pw = 9.4, pd = 6.4, pz = z + pd / 2;
      B.box(cx, 0, pz, pw, 4.7, pd, f.wall);
      for (const dx of [-3, 0, 3]) { B.box(cx + dx, 0, z + pd + 0.03, 2.0, 2.7, 0.06, DARK); B.half(cx + dx, 2.7, z + pd + 0.07, 1.0, DARK); }
      for (const s of [-1, 1]) for (const dz of [1.7, 4.6]) { B.box(cx + s * (pw / 2 + 0.03), 0, z + dz, 0.06, 2.7, 1.8, DARK); }
      B.box(cx, 4.7, pz, pw + 0.5, 0.3, pd + 0.5, TRIM);
      for (const dx of [-4.2, -1.45, 1.45, 4.2]) { B.cyl(cx + dx, 5.0, z + pd - 0.5, 0.33, 4.5, TRIM); B.box(cx + dx, 9.3, z + pd - 0.5, 0.9, 0.3, 0.9, TRIM); B.box(cx + dx, 5.0, z + pd - 0.5, 0.9, 0.3, 0.9, TRIM); }
      for (const s of [-1, 1]) B.cyl(cx + s * 4.2, 5.0, z + 2.6, 0.33, 4.5, TRIM);
      B.box(cx, 5.9, z + pd - 0.5, pw - 0.8, 0.12, 0.16, TRIM); for (let x = -4; x <= 4; x += 0.5) B.box(cx + x, 5.0, z + pd - 0.5, 0.08, 0.9, 0.08, TRIM);
      B.box(cx, 9.6, pz, pw + 0.3, 0.6, pd + 0.3, TRIM);
      B.prism(cx, 10.2, pz, pw + 0.6, 2.3, pd + 0.6, f.wall); B.box(cx, 10.2, pz, pw + 0.9, 0.14, pd + 0.9, TRIM);
    }
    rearRanges(f, w, H, z - 15);
  }
  FACTORIES.forEach(facade);

  // ---- 两条巷：铺面、招牌、灯笼 ----
  const CHARS = ['茶', '瓷', '絲', '漆', '扇', '畫', '銀', '蓆', '香', '藥'];
  for (const l of LANES) {
    const wide = l.x1 - l.x0 > 6;
    let n = 0;
    for (let z = FRONT - 5; z > l.zEnd + 6; z -= wide ? 7 : 6) for (const s of [-1, 1]) {
      const x = s < 0 ? l.x0 : l.x1, cloth = pk(['#b9a37a', '#8d4a3a', '#4f6a78', '#c8b98f', '#6d7a56']);
      P.box(x - s * 0.9, 2.7, z, 1.8, 0.08, 3.6, cloth, 0, 0.1, 0, s * 0.3);
      P.box(x - s * 0.5, 0, z, 0.9, 0.85, 3.0, '#6b5540', 0, 0.1);
      for (let i = 0; i < 4; i++) P.box(x - s * 0.5, 0.85, z - 1.1 + i * 0.75, 0.5, rr(0.15, 0.4), 0.5, pk(['#e8dcc0', '#3f6a8c', '#b23a2e', '#d9b860', '#5d7f5a']));
      B.box(x - s * 0.04, 0, z, 0.08, 2.5, 2.6, '#3a2a22');
      if (wide) { signs.push({ text: CHARS[n % CHARS.length], x: x - s * 1.9, y: 3.6, z: z + 1.9, w: 0.7, h: 0.7, ry: Math.PI / 2, both: true }); P.box(x - s * 1.0, 3.95, z + 1.9, 2.0, 0.06, 0.06, '#3a2a22'); n++; }
      else if (n++ % 2 === 0) P.ball(x - s * 0.9, 2.3, z + 1.8, 0.18, 0.24, 0.18, '#d6452f');
    }
    for (const s of [-1, 1]) {   // 巷子两侧连续的铺屋墙与披檐
      const x = s < 0 ? l.x0 : l.x1, len = FRONT - 14 - l.zEnd, zc = (FRONT - 14 + l.zEnd) / 2;
      B.mat = 4; B.box(x + s * 0.45, 0, zc, 0.9, 6.2, len, s < 0 ? '#b5b0a2' : '#a9a69b', 0, 0.02); B.mat = 0;
      B.box(x - s * 0.5, 4.3, zc, 1.9, 0.14, len, pk(TILE), 0, 0, 0, s * 0.32);
      for (let z = FRONT - 17; z > l.zEnd + 4; z -= wide ? 7 : 6) B.box(x - s * 0.02, 4.9, z + 3.4, 0.06, 0.9, 1.2, '#2e2620');
    }
    const ze = l.zEnd, cx = l.cx, lw = l.x1 - l.x0;
    for (const s of [-1, 1]) B.box(cx + s * (lw / 2 - 0.3), 0, ze + 1.5, 0.4, 4.6, 0.4, '#5a2a22');
    B.box(cx, 4.4, ze + 1.5, lw, 0.45, 0.5, '#5a2a22'); B.prism(cx, 4.85, ze + 1.5, 1.6, 0.7, lw + 0.8, pk(TILE), Math.PI / 2);
    B.box(cx, 0, ze - 0.4, lw + 2, 7, 0.8, '#8f8c82'); B.box(cx, 0, ze + 0.03, 2.4, 3.2, 0.06, '#1d1815');
  }

  // ---- 花园（新英国馆、荷兰馆前，示意） ----
  {
    const g = GARDEN, cx = (g.x0 + g.x1) / 2, w = g.x1 - g.x0, d = g.z1 - g.z0;
    B.box(cx, 0, (g.z0 + g.z1) / 2, w - 0.6, 0.06, d - 0.6, '#7d9a62');
    B.box(cx, 0.02, (g.z0 + g.z1) / 2, 3, 0.06, d - 0.6, '#cdbf9f');
    const rail = (x, z, len, ry) => { P.box(x, 0, z, len, 0.5, 0.3, '#b7ae99', ry); P.box(x, 1.45, z, len, 0.07, 0.07, '#33382f', ry); P.box(x, 0.9, z, len, 0.05, 0.05, '#33382f', ry); };
    rail(cx, g.z1, w, 0); rail(g.x0, (g.z0 + g.z1) / 2, d, Math.PI / 2); rail(g.x1, (g.z0 + g.z1) / 2, d, Math.PI / 2);
    for (let x = g.x0; x <= g.x1 + 0.01; x += 0.5) P.box(x, 0.5, g.z1, 0.05, 1.05, 0.05, '#33382f');
    for (let z = g.z0 + 0.5; z < g.z1; z += 0.5) for (const x of [g.x0, g.x1]) P.box(x, 0.5, z, 0.05, 1.05, 0.05, '#33382f');
    for (const [x, z, s] of [[g.x0 + 4, -44, 1], [g.x1 - 4, -43, 1.1], [g.x0 + 5, -55, 0.8], [g.x1 - 5, -56, 0.9], [cx - 9.5, -48, 0.7], [cx + 9.5, -50, 0.75]]) tree(P, x, 0, z, s);
    for (let i = 0; i < 12; i++) P.ball(rr(g.x0 + 2, g.x1 - 2), 0.4, rr(g.z0 + 9, g.z1 - 2), 0.7, 0.45, 0.7, pk(['#5d8a52', '#6f9a58', '#c8667a', '#e3d36a']), 0.1);
  }
  function tree(b, x, y, z, s = 1) {
    b.cyl(x, y, z, 0.28 * s, 3.2 * s, '#5b4636');
    for (let i = 0; i < 7; i++) { const a = i * 0.9; b.ball(x + Math.cos(a) * 1.5 * s * (i ? 1 : 0), y + (3.6 + (i % 3) * 0.9) * s, z + Math.sin(a) * 1.5 * s * (i ? 1 : 0), 1.9 * s, 1.5 * s, 1.9 * s, pk(['#4f7a4a', '#5d8a52', '#456e45', '#6b9455']), 0.1); }
  }
  tree(P, -147, 0, -12, 1.5); tree(P, -146.5, 0, -40, 1.2); tree(P, 144.5, 0, -18, 1.3);

  // ---- 货场 ----
  const TEA = '#c9a86c';
  function chest(b, x, y, z, ry = 0, c = TEA) { b.box(x, y, z, 0.56, 0.46, 0.46, c, ry, 0.14); }
  for (const y of YARDS) {
    const w = y.x1 - y.x0, d = y.z1 - y.z0;
    if (y.goods === 'tea') {
      const x1 = y.id === 'tea' ? y.x1 - 1.5 : y.x1;   // 名场面那一摞单独做成会减少的
      for (let x = y.x0 + 0.4; x < x1 - 0.3; x += 0.6) for (let z = y.z0 + 0.35; z < y.z1 - 0.2; z += 0.5) { const hN = 1 + Math.floor(R() * 4); for (let k = 0; k < hN; k++) chest(P, x, k * 0.47, z, rr(-0.05, 0.05)); }
      P.box((y.x0 + y.x1) / 2, 0, y.z0 + 0.1, w, 1.9, 0.05, '#b89b63', 0, 0.05);
    } else if (y.goods === 'crate') {
      for (let i = 0; i < 26; i++) { const x = rr(y.x0 + 0.7, y.x1 - 0.7), z = rr(y.z0 + 0.6, y.z1 - 0.6), k = Math.floor(R() * 2); P.box(x, k * 0.75, z, 1.1, 0.75, 0.8, pk(['#9a7a52', '#8a6c46', '#a88a60']), rr(-0.2, 0.2), 0.1); if (!k) for (const s of [-0.3, 0.3]) P.box(x, 0.36, z + s, 1.14, 0.06, 0.05, '#4a3a2c', 0); }
      for (let i = 0; i < 6; i++) P.cyl(rr(y.x0 + 0.5, y.x1 - 0.5), 0, y.z1 - 0.5, 0.3, 0.7, pk(['#3f6a8c', '#e8e4d8', '#5d7f8a']), 0.1);
    } else if (y.goods === 'bale') {
      for (let i = 0; i < 20; i++) P.box(rr(y.x0 + 0.6, y.x1 - 0.6), Math.floor(R() * 2) * 0.6, rr(y.z0 + 0.5, y.z1 - 0.5), 1.0, 0.6, 0.7, pk(['#e3dccb', '#d6ccb4', '#cbbf9f']), rr(-0.3, 0.3), 0.08);
    } else {
      for (let i = 0; i < 16; i++) { const x = y.x0 + 0.6 + (i % 8) * 1.0, z = y.z0 + 1 + Math.floor(i / 8) * 1.4; P.cyl(x, 0, z, 0.42, 1.0, '#7a5a3a', 0.12); P.cyl(x, 0.2, z, 0.44, 0.06, '#2e2620'); P.cyl(x, 0.75, z, 0.44, 0.06, '#2e2620'); }
    }
  }
  // 过秤的三脚架
  { const s = SCALE; for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.5; P.box(s.x + Math.sin(a) * 0.9, 0, s.z - 2 + Math.cos(a) * 0.9, 0.09, 3.5, 0.09, '#5b4636', 0, 0, Math.cos(a) * 0.5, -Math.sin(a) * 0.5); }
    P.box(s.x, 2.5, s.z - 2, 2.2, 0.06, 0.06, '#3d3026', 0.5); P.box(s.x - 0.75, 1.45, s.z - 1.6, 0.02, 1.05, 0.02, '#2a221c'); chest(P, s.x - 0.75, 1.0, s.z - 1.6, 0.5); P.cyl(s.x + 0.8, 1.9, s.z - 2.45, 0.1, 0.25, '#3a3a3e');
    for (let i = 0; i < 5; i++) chest(P, s.x + 0.2 + (i % 3) * 0.62, Math.floor(i / 3) * 0.47, s.z - 3.3); P.box(s.x + 2.2, 0, s.z - 2.1, 0.9, 0.8, 0.6, '#6b5540'); }
  // 税口小屋（示意）
  { const h = SHED, cx = (h.x0 + h.x1) / 2, cz = (h.z0 + h.z1) / 2 - 0.4, w = h.x1 - h.x0 - 1.4, d = 4.4;
    B.box(cx, 0, cz, w, 0.25, d, '#aaa18c'); B.box(cx, 0.25, cz - 0.6, w - 0.6, 2.9, d - 1.6, '#b8b2a2');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box(cx + sx * (w / 2 - 0.25), 0.25, cz + sz * (d / 2 - 0.25), 0.22, 3.0, 0.22, '#7a2f2a');
    B.prism(cx, 3.25, cz, d + 1.4, 1.5, w + 1.2, '#67645e', Math.PI / 2); B.box(cx, 0.25, cz + 0.75, 1.3, 2.2, 0.08, '#2e2620');
    P.box(cx + 2.4, 0, h.z1 - 0.9, 1.6, 0.8, 0.7, '#6b5540'); P.cyl(cx - w / 2 - 0.2, 0, h.z1 - 0.6, 0.06, 5.2, '#5b4636'); P.box(cx - w / 2 + 0.35, 4.2, h.z1 - 0.6, 1.1, 0.8, 0.03, '#d9b860'); }
  // 摊档
  for (const s of STALLS) {
    const g = s.goods, um = (c) => { P.cyl(s.x, 0, s.z - 0.2, 0.05, 2.6, '#5b4636'); P.cone(s.x, 2.3, s.z - 0.2, 1.9, 0.6, c, 0.08); };
    if (g === 'fruit') { um('#c8b98f'); for (const dx of [-0.8, 0, 0.8]) { P.cyl(s.x + dx, 0, s.z + 0.2, 0.36, 0.4, '#a8905c'); for (let i = 0; i < 6; i++) P.ball(s.x + dx + rr(-0.22, 0.22), 0.45, s.z + 0.2 + rr(-0.22, 0.22), 0.1, 0.1, 0.1, pk(['#e0902f', '#d6c04a', '#b8402e', '#7da04a'])); } }
    else if (g === 'tea') { um('#8d4a3a'); P.box(s.x, 0, s.z + 0.2, 1.8, 0.75, 0.7, '#6b5540'); P.cyl(s.x - 0.5, 0.75, s.z + 0.2, 0.16, 0.24, '#7a4a32'); for (let i = 0; i < 4; i++) P.cyl(s.x + i * 0.22, 0.75, s.z + 0.2, 0.06, 0.07, '#e8e4d8'); P.cyl(s.x + 1.3, 0, s.z + 0.1, 0.3, 0.55, '#3d3a36'); }
    else if (g === 'congee') { um('#b9a37a'); P.cyl(s.x - 0.5, 0, s.z + 0.2, 0.36, 0.6, '#5a4a40'); P.cyl(s.x - 0.5, 0.6, s.z + 0.2, 0.33, 0.25, '#2e2620'); P.box(s.x + 0.6, 0, s.z + 0.2, 1.0, 0.7, 0.6, '#6b5540'); for (let i = 0; i < 3; i++) P.cyl(s.x + 0.35 + i * 0.25, 0.7, s.z + 0.2, 0.09, 0.07, '#e8e4d8'); for (const dx of [-0.2, 0.9]) P.box(s.x + dx, 0, s.z + 1.5, 0.35, 0.35, 0.35, '#7a6146'); }
    else if (g === 'fan') { um('#4f6a78'); P.box(s.x, 0, s.z + 0.2, 1.9, 0.8, 0.6, '#6b5540'); P.box(s.x, 0.8, s.z - 0.1, 1.9, 1.0, 0.05, '#5b4636'); for (let i = 0; i < 5; i++) P.half(s.x - 0.75 + i * 0.37, 1.1, s.z - 0.06, 0.2, pk(['#e8dcc0', '#b23a2e', '#d9b860', '#5d8a7a'])); }
    else if (g === 'barber') { P.box(s.x, 0, s.z, 0.4, 0.42, 0.4, '#7a2f2a'); P.box(s.x + 1.2, 0, s.z - 0.8, 0.5, 1.0, 0.4, '#7a2f2a'); P.cyl(s.x + 1.2, 1.0, s.z - 0.8, 0.22, 0.12, '#b8a14a'); P.cyl(s.x - 1.4, 0, s.z - 0.9, 0.04, 1.9, '#5b4636'); }
    else if (g === 'easel') { for (const dx of [-0.35, 0.35]) P.box(s.x + dx, 0, s.z - 0.35, 0.05, 1.7, 0.05, '#5b4636', 0, 0, -0.14); P.box(s.x, 0, s.z - 0.7, 0.05, 1.6, 0.05, '#5b4636', 0, 0, 0.3); P.box(s.x, 0.85, s.z - 0.3, 0.95, 0.65, 0.03, '#efe6cf', 0, 0, -0.14); P.box(s.x, 1.0, s.z - 0.27, 0.8, 0.12, 0.02, '#e9dcc0', 0, 0, -0.14); P.box(s.x, 0.9, s.z - 0.27, 0.8, 0.07, 0.02, '#8d4a3a', 0, 0, -0.14); P.box(s.x, 1.26, s.z - 0.3, 0.9, 0.22, 0.02, '#a9c0cc', 0, 0, -0.14); P.box(s.x - 0.9, 0, s.z + 0.5, 0.35, 0.4, 0.35, '#7a6146'); }
    else if (g === 'rest') { for (let i = 0; i < 4; i++) chest(P, s.x - 1.5 + i, 0, s.z + (i % 2) * 0.9 - 0.4 - 0.05); P.box(s.x + 1.2, 0.9, s.z - 1.2, 0.04, 0.04, 2.0, '#8a7152', 0.7); }
    else if (g === 'sailors') { P.cyl(s.x, 0, s.z, 0.38, 0.85, '#7a5a3a'); P.cyl(s.x, 0.85, s.z, 0.1, 0.2, '#3d5a40'); }
  }
  // 给坐着的人垫个箱凳
  for (const a of sim.agents) if (a.boat < 0 && a.pose === 'sit' && a.role !== 'porter' && !STALLS.some(s => (s.goods === 'rest' || s.goods === 'barber') && Math.abs(s.x - a.x) < 2.5 && Math.abs(s.z - a.z) < 2.1)) P.box(a.x, 0, a.z - 0.05, 0.4, 0.42, 0.4, '#7a6146');
  for (const p of sim.porters) if (p.slot % 2) chest(P, p.x, 0, p.z, 0.1);

  // ---- 旗杆与旗 ----
  const flags = [];
  for (const p of POLES) {
    P.box(p.x, 0, p.z, 1.1, 0.5, 1.1, '#b7ae99'); P.cyl(p.x, 0.5, p.z, 0.16, 15, '#f1ecdf'); P.cyl(p.x, 15.5, p.z, 0.1, 8, '#f1ecdf'); P.box(p.x, 15.3, p.z, 1.6, 0.08, 0.08, '#f1ecdf'); P.ball(p.x, 23.6, p.z, 0.18, 0.18, 0.18, '#d9b860');
    for (const s of [-1, 1]) P.box(p.x + s * 0.95, 7.9, p.z, 0.03, 15, 0.03, '#77705f', 0, 0, 0, s * 0.11);
    const g = new THREE.PlaneGeometry(5.6, 3.4, 12, 3); g.translate(2.8, 0, 0);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: canvasTex(160, 100, FLAG_DRAW[opts.plainFlags ? 'plain' : p.flag]), side: THREE.DoubleSide }));
    m.position.set(p.x + 0.12, 21.4, p.z); m.userData.base = g.attributes.position.array.slice(); m.userData.ph = p.x * 0.1;
    scene.add(m); flags.push(m);
  }

  // ---- 西边铺屋、东岸、北面城郭屋顶（都是示意） ----
  for (let x = -154; x > -470; ) { const w = rr(5.5, 9), h = rr(5, 8); B.box(x - w / 2, 0, -11, w - 0.2, h, 14, pk(['#a5a59c', '#b3ac9c', '#9a9a92', '#c2b8a2']), 0, 0.05); B.prism(x - w / 2, h, -11, 15, rr(1.6, 2.6), w, pk(TILE), Math.PI / 2, 0.06); B.box(x - w / 2, 0, -3.94, w * 0.4, 2.3, 0.08, DARK); B.box(x - w / 2, 2.9, -3.2, w - 0.6, 0.07, 1.6, pk(['#b9a37a', '#8d4a3a', '#6d7a56']), 0, 0.1, 0.25); x -= w; }
  for (let x = 162; x < 520; ) { const w = rr(6, 11), h = rr(4.5, 7.5), z = rr(-22, -12); B.box(x + w / 2, 0, z, w - 0.3, h, 14, pk(['#a5a59c', '#b3ac9c', '#c2b8a2']), 0, 0.05); B.prism(x + w / 2, h, z, 15, rr(1.6, 2.6), w, pk(TILE), Math.PI / 2, 0.06); x += w; if (R() < 0.3) { tree(FAR, x + 2, 0, rr(-8, -4), rr(0.9, 1.4)); x += 5; } }
  for (let i = 0; i < 900; i++) {
    const x = rr(-760, 800), z = rr(-700, -20), inRow = x > -150 && x < 148 && z > -175;
    if (inRow || (z > -30 && x > -470 && x < 520)) continue;
    const w = rr(7, 16), d = rr(8, 22), h = rr(4, 8);
    FAR.box(x, 0, z, w, h, d, pk(['#aaa79c', '#b9b3a4', '#9f9d94', '#c4bca8']), 0, 0.06); FAR.prism(x, h, z, w + 0.6, rr(1.6, 2.8), d + 0.6, pk(TILE), 0, 0.08);
    if (i % 9 === 0) tree(FAR, x + w, 0, z, rr(1.2, 2.2));
  }
  for (let i = 0; i < 9; i++) FAR.cone(rr(-1900, 1900), -5, rr(-2300, -1700), rr(420, 760), rr(130, 300), '#a9b3a0', 0.08);
  // ---- 对岸河南（示意）与远处下游的洋船桅影（示意：洋船实际泊在黄埔） ----
  FAR.box(0, -3, 760, 3600, 3.3, 860, '#9aa37e'); FAR.box(0, -4, 331, 3600, 4.2, 1, STONE);
  for (let i = 0; i < 90; i++) { const x = rr(-900, 900), z = rr(338, 420); if (i % 3) { const w = rr(7, 14), h = rr(4, 6.5); FAR.box(x, 0.3, z, w, h, 10, pk(['#b3ac9c', '#c4bca8', '#a5a59c']), 0, 0.05); FAR.prism(x, h + 0.3, z, 11, 2, w + 0.5, pk(TILE), Math.PI / 2); } else tree(FAR, x, 0.3, z, rr(1.4, 2.6)); }
  { const x = -70, z = 372; FAR.box(x, 0.3, z, 26, 6, 16, '#a4443a'); FAR.prism(x, 6.3, z, 19, 4, 29, '#5d6a52', Math.PI / 2); FAR.box(x, 0.3, z - 14, 12, 4.5, 6, '#a4443a'); FAR.prism(x, 4.8, z - 14, 8.5, 2.6, 14, '#5d6a52', Math.PI / 2); for (let i = 0; i < 8; i++) tree(FAR, x + rr(-34, 34), 0.3, z + rr(-4, 22), rr(2, 3)); }
  for (const [x, z, s] of [[760, 190, 1], [840, 240, 0.9], [905, 170, 0.8]]) {
    FAR.geo(new THREE.Matrix4().compose(new THREE.Vector3(x, WATER_Y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 1.3, 0)), new THREE.Vector3(s, s, s)), '#3d342c', hullGeo(46, 11, 7, { free: 4.5, sheer: 0.8, bow: 0.3, stern: 0.6 }));
    for (const [dz, h] of [[13, 36], [0, 42], [-13, 30]]) { const mx = x + Math.sin(1.3) * dz * s, mz = z + Math.cos(1.3) * dz * s; FAR.cyl(mx, WATER_Y + 4 * s, mz, 0.4 * s, h * s, '#4a4036'); for (const f of [0.35, 0.6, 0.83]) FAR.box(mx, WATER_Y + (4 + h * f) * s, mz, 0.5 * s, 0.9 * s, (17 - f * 9) * s, '#d8d0b8', 1.3 + Math.PI / 2); }
  }

  const world = B.mesh(matWorld); world.castShadow = true; world.receiveShadow = true; scene.add(world);
  const props = P.mesh(matWorld); props.castShadow = true; props.receiveShadow = true; scene.add(props);
  const far = FAR.mesh(matWorld); scene.add(far);

  // 招牌
  for (const s of signs) {
    const vertical = s.h > s.w * 1.5;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), new THREE.MeshBasicMaterial({ map: signTex(s.text, '#3a1f1a', '#e9c66a', vertical), side: s.both ? THREE.DoubleSide : THREE.FrontSide }));
    m.position.set(s.x, s.y, s.z); m.rotation.y = s.ry || 0; scene.add(m);
  }

  // ---- 名场面：货场里会少下去的那一摞、艇上会多起来的那一摞 ----
  const chestGeo = new THREE.BoxGeometry(0.56, 0.46, 0.46), chestMat = new THREE.MeshLambertMaterial({ color: TEA });
  const yardStack = new THREE.InstancedMesh(chestGeo, chestMat, EVENT.chests), boatStack = new THREE.InstancedMesh(chestGeo, chestMat, EVENT.chests);
  for (let i = 0; i < EVENT.chests; i++) {
    _m.makeTranslation(36.9, 0.23 + Math.floor(i / 5) * 0.47, -11.4 + (i % 5) * 0.62); yardStack.setMatrixAt(i, _m);
    _m.makeTranslation(-0.72 + (i % 3) * 0.72, DECK.chop + 0.3 + Math.floor(i / 9) * 0.47, 3.7 + (Math.floor(i / 3) % 3) * 0.62); boatStack.setMatrixAt(i, _m);
  }
  yardStack.castShadow = true; scene.add(yardStack);

  // ---- 船 ----
  const geoCache = {}, sailCache = {};
  const boats = sim.boats.map(b => {
    if (!geoCache[b.type]) { const bb = new Builder(21, 2); BOAT_BUILD[b.type](bb); geoCache[b.type] = bb.geometry(); }
    const g = new THREE.Group(); const hull = new THREE.Mesh(geoCache[b.type], matBoat); hull.castShadow = !!opts.shadows; g.add(hull);
    let sail = null;
    if (SAIL_BUILD[b.type] && (b.id === 0 || b.sail > 0)) {
      if (!sailCache[b.type]) { const sb = new Builder(22, 3); SAIL_BUILD[b.type](sb); sailCache[b.type] = sb.geometry(); }
      sail = new THREE.Mesh(sailCache[b.type], matBoat); sail.position.y = SAIL_BASE[b.type]; g.add(sail);
    }
    if (b.id === 0) g.add(boatStack);
    scene.add(g);
    return { g, sail };
  });

  let tris = B.tris + P.tris + FAR.tris;
  return {
    flags, boats, yardStack, boatStack, staticTris: tris,
    update(t) {
      for (const f of flags) {
        const pos = f.geometry.attributes.position, base = f.userData.base;
        for (let i = 0; i < pos.count; i++) { const x = base[i * 3]; pos.setZ(i, Math.sin(x * 1.3 - t * 3.4 + f.userData.ph) * 0.07 * x * (1 + 0.3 * Math.sin(t * 0.7 + f.userData.ph))); pos.setY(i, base[i * 3 + 1] - x * 0.05 + Math.sin(x * 0.9 - t * 2.1) * 0.02 * x); }
        pos.needsUpdate = true; f.rotation.y = -0.5 + 0.12 * Math.sin(t * 0.31 + f.userData.ph);
      }
      sim.boats.forEach((b, i) => {
        const o = boats[i]; o.g.visible = !b.hidden;
        if (b.land) { o.g.position.set(b.x, Math.abs(Math.sin(t * 4.6)) * 0.02, b.z); o.g.rotation.set(0, b.h, 0); return; }
        const k = b.type === 'sampan' ? 1 : 0.5;
        o.g.position.set(b.x, WATER_Y + Math.sin(t * 1.1 + b.bob) * 0.05 * k, b.z);
        o.g.rotation.set(Math.sin(t * 0.9 + b.bob) * 0.02 * k, b.h, Math.sin(t * 1.3 + b.bob * 2) * 0.03 * k);
        if (o.sail && b.id === 0) { o.sail.visible = b.sail > 0.02; o.sail.scale.y = Math.max(0.02, b.sail); }
      });
      yardStack.count = Math.max(0, EVENT.chests - sim.event.picked);
      boatStack.count = sim.event.loaded;
    },
  };
}
