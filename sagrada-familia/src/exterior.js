// 圣家堂外部：外壳、中殿侧墙、三个立面、十八座塔。第二轮重做：立面从「体块加凸起」改成成组的构件。
import * as THREE from 'three';
import * as C from './core.js';
import { batcher, glassTexture, towerTexture, towerProfile, MIXED } from './world.js';

const UP = new THREE.Vector3(0, 1, 0);
// 三种石头：新建部分浅米白，老的诞生立面深褐灰，受难立面骨白
export const STONE = {
  NEW: '#efe9dc', NEW2: '#e2dacb', NEW3: '#d3cab9', WHITE: '#fbf8f1', ROOF: '#cfc7b6',
  OLD: '#9d907c', OLD2: '#857966', OLD3: '#b3a58e', OLD4: '#6f6454',
  BONE: '#f1ebdf', BONE2: '#ddd5c4', BONE3: '#c9c0ad', HOLE: '#1d1915', BRONZE: '#3b3229',
};
const FRUIT = ['#d84a2f', '#e8b923', '#7ab648', '#f08a24', '#c94f9b', '#fbf8f1'];

// 让石缝贴图按世界坐标铺：大体块不拉伸，石块大小处处一致
export function worldStone(mat, scale = 14) {
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSW; varying vec3 vSN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 swp = vec4(transformed, 1.); vec3 swn = objectNormal;
        #ifdef USE_INSTANCING
          swp = instanceMatrix * swp; swn = mat3(instanceMatrix) * swn;
        #endif
        vSW = (modelMatrix * swp).xyz; vSN = mat3(modelMatrix) * swn;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vSW; varying vec3 vSN;')
      .replace('#include <map_fragment>', `vec3 san = abs(normalize(vSN)); vec2 suv = san.y > .6 ? vSW.xz : (san.x > san.z ? vSW.zy : vSW.xy);
        diffuseColor *= texture2D(map, suv / ${scale.toFixed(1)});`);
  };
  mat.customProgramCacheKey = () => 'wstone' + scale;
  return mat;
}

// 在一个立面上摆东西：u 沿墙面横向，y 向上，d 是离墙面往外多远
function face(B, ox, oz, normal) {
  const xn = normal !== '+z', sg = normal === '-x' ? -1 : 1, ry = normal === '+x' ? Math.PI / 2 : normal === '-x' ? -Math.PI / 2 : 0;
  const to3 = (u, y, d) => xn ? [ox + sg * d, y, oz + u] : [ox + u, y, oz + d];
  const F = {
    to3, ry,
    box: (u, y, d, w, h, dep, color) => B.raw('box', to3(u, y + h / 2, d), xn ? [dep, h, w] : [w, h, dep], null, color),
    rod: (a, b, r, color, kind = 'cyl') => B.rod(to3(...a), to3(...b), r, color, kind),
    ball: (u, y, d, r, color, sy = 1) => B.raw('ball', to3(u, y, d), [r * 2, r * 2 * sy, r * 2], null, color),
    cone: (u, y, d, r, h, color) => B.raw('cone', to3(u, y + h / 2, d), [r * 2, h, r * 2], null, color),
    drip: (u, y, d, r, h, color) => B.raw('cone', to3(u, y - h / 2, d), [r * 2, h, r * 2], [Math.PI, 0, 0], color),     // 倒挂的钟乳
    spike: (u, y, d, r, h, color) => B.raw('spike', to3(u, y + h / 2, d), [r * 2, h, r * 2], [0, ry + Math.PI / 4, 0], color),
    taper: (u, y, d, r, h, color) => B.raw('taper', to3(u, y + h / 2, d), [r * 2, h, r * 2], null, color),
    cyl: (u, y, d, r, h, color) => B.raw('cyl', to3(u, y + h / 2, d), [r * 2, h, r * 2], null, color),
    lancet: (u, y, d, w, h, color) => B.raw('lancet', to3(u, y, d), [w, h, 1], [0, ry, 0], color),
    disc: (u, y, d, r, color) => B.raw('disc', to3(u, y, d), [r * 2, r * 2, 1], [0, ry, 0], color),
    hoop: (u, y, d, r, color, thick = 1) => B.raw('hoop', to3(u, y, d), [r * 2, r * 2, r * 2 * thick], [0, ry, 0], color),
    prism: (u, y, d, w, h, dep, color) => B.raw('prism', to3(u, y, d), [w, h, dep], [0, xn ? Math.PI / 2 : 0, 0], color),
    // 抛物线券的边框：两根立边加一道券
    arch(u, y0, d, half, jamb, rise, r, color, segs = 10, kind = 'cyl') {
      F.rod([u - half, y0, d], [u - half, y0 + jamb, d], r, color, kind); F.rod([u + half, y0, d], [u + half, y0 + jamb, d], r, color, kind);
      let prev = [u - half, y0 + jamb, d];
      for (let i = 1; i <= segs; i++) { const t = -1 + 2 * i / segs, p = [u + t * half, y0 + jamb + rise * (1 - t * t), d]; F.rod(prev, p, r, color, kind); prev = p; }
    },
    // 一个小立像：身子、头，有的举着手
    fig(u, y, d, s, color, pose = 0) {
      F.taper(u, y, d, 0.26 * s, 1.15 * s, color); F.ball(u, y + 1.32 * s, d, 0.2 * s, color);
      if (pose === 1) F.rod([u, y + 0.95 * s, d], [u + 0.45 * s, y + 1.5 * s, d + 0.1], 0.07 * s, color);
      if (pose === 2) { F.rod([u - 0.2 * s, y + 0.9 * s, d], [u - 0.5 * s, y + 0.5 * s, d + 0.15], 0.07 * s, color); F.rod([u + 0.2 * s, y + 0.9 * s, d], [u + 0.5 * s, y + 0.5 * s, d + 0.15], 0.07 * s, color); }
    },
    // 棱角分明的受难立面雕像：方块拼的
    block(u, y, d, s, color, lean = 0) {
      B.raw('box', to3(u, y + 0.75 * s, d), xn ? [0.42 * s, 1.5 * s, 0.6 * s] : [0.6 * s, 1.5 * s, 0.42 * s], [lean * (xn ? 1 : 0), 0, lean * (xn ? 0 : 1)], color);
      B.raw('box', to3(u + lean * 0.9 * s, y + 1.72 * s, d), [0.36 * s, 0.4 * s, 0.36 * s], [0, 0.5, 0], color);
      B.raw('box', to3(u, y + 1.32 * s, d), xn ? [0.36 * s, 0.26 * s, 0.95 * s] : [0.95 * s, 0.26 * s, 0.36 * s], null, color);
    },
  };
  return F;
}

export function buildExterior({ ext, E, ES, R, stone, plain, coarse }) {
  const S = STONE, dens = coarse ? 0.6 : 1;
  worldStone(stone);
  const naveLen = C.Z_GLORY - C.Z_NAVE_END, naveMid = (C.Z_GLORY + C.Z_NAVE_END) / 2, transLen = C.Z_NAVE_END - C.Z_TRANS_END, transMid = (C.Z_NAVE_END + C.Z_TRANS_END) / 2;

  // ===== 外壳 =====
  ES.box(0, 0, naveMid, 45.6, 31, naveLen, S.NEW2);                    // 侧廊一层
  ES.box(0, 31, naveMid, 31, 15, naveLen, S.NEW);                      // 中廊高出的一层
  ES.prism(0, 46, naveMid, 31, 8, naveLen, S.ROOF);                    // 中廊屋脊
  ES.box(0, 0, transMid, 60.6, 31, transLen, S.NEW2);
  ES.box(0, 31, transMid, 48, 15, transLen - 4, S.NEW);
  ES.prism(0, 46, transMid, transLen - 4, 8, 48, S.ROOF, Math.PI / 2);
  ES.raw('cyl', [0, 52, C.CROSS.z], [29, 14, 29], [0, Math.PI / 8, 0], S.NEW);    // 十字交叉上的鼓座
  // 屋脊上一排小尖顶
  for (let k = 0; k < 12; k++) { const z = C.Z_NAVE_END + 2 + k * 3.6; E.raw('spike', [0, 55.3, z], [1.1, 3.2, 1.1], [0, Math.PI / 4, 0], S.WHITE); E.ball(0, 57.2, z, 0.32, FRUIT[k % 6]); }
  for (let k = 0; k < 14; k++) { const x = -23 + k * 3.55; if (Math.abs(x) < 15) continue; E.raw('spike', [x, 55.3, transMid], [1.1, 3.2, 1.1], [0, Math.PI / 4, 0], S.WHITE); }
  // 鼓座一圈尖券窗和小尖顶
  for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8 + Math.PI / 16, x = Math.sin(a) * 14.7, z = C.CROSS.z + Math.cos(a) * 14.7; E.raw('lancet', [x, 53, z], [2.2, 9.5, 1], [0, a, 0], S.HOLE); E.raw('spike', [Math.sin(a + Math.PI / 16) * 14.4, 66 + 2.5, C.CROSS.z + Math.cos(a + Math.PI / 16) * 14.4], [1.4, 5, 1.4], [0, a, 0], S.WHITE); }

  // 后殿：半圆 + 七间小礼拜堂 + 两座圣器室穹顶
  ES.cyl(C.APSE.x, 0, C.APSE.z, 18.3, 31, S.NEW3); ES.cyl(C.APSE.x, 31, C.APSE.z, 12.5, 19, S.NEW2); ES.cone(C.APSE.x, 50, C.APSE.z, 12.5, 7, S.ROOF);
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (0.06 + 0.88 * i / 6), cx = Math.cos(a), sz = -Math.sin(a), x = cx * 19.5, z = C.APSE.z + sz * 19.5;
    ES.cyl(x, 0, z, 3.6, 22, S.OLD3); E.cone(x, 22, z, 3.8, 9, S.OLD); E.taper(x, 31, z, 0.5, 6, S.WHITE); E.ball(x, 37.6, z, 0.75, FRUIT[i % 4]);
    // 小礼拜堂外墙：三扇尖券窗，檐口一圈滴水兽似的小凸
    const ry = Math.atan2(cx, sz);
    for (const o of [-0.5, 0, 0.5]) { const aa = a + o * 0.11, px = Math.cos(aa) * 23.14, pz = C.APSE.z - Math.sin(aa) * 23.14; E.raw('lancet', [px, 6, pz], [1.1, 10, 1], [0, Math.atan2(Math.cos(aa), -Math.sin(aa)), 0], S.HOLE); }
    for (let k = 0; k < 6; k++) { const aa = a + (k - 2.5) * 0.045; E.raw('cone', [Math.cos(aa) * 23.6, 21.6, C.APSE.z - Math.sin(aa) * 23.6], [0.5, 1.6, 0.5], [Math.PI / 2 * -sz, 0, Math.PI / 2 * -cx], S.OLD2); }
    // 礼拜堂之间的扶壁尖塔
    const ab = a + Math.PI * 0.88 / 12; if (i < 6) { const bx = Math.cos(ab) * 21.5, bz = C.APSE.z - Math.sin(ab) * 21.5; E.box(bx, 0, bz, 1.6, 30, 1.6, S.OLD3, ab); E.raw('spike', [bx, 30 + 4.5, bz], [1.7, 9, 1.7], [0, -ab, 0], S.OLD3); E.ball(bx, 39.6, bz, 0.4, FRUIT[(i + 2) % 5]); }
  }
  for (let i = 0; i < 9; i++) { const a = Math.PI * (0.08 + 0.84 * i / 8); E.raw('lancet', [Math.cos(a) * 12.56, 34, C.APSE.z - Math.sin(a) * 12.56], [2.2, 13, 1], [0, Math.atan2(Math.cos(a), -Math.sin(a)), 0], S.HOLE); E.raw('spike', [Math.cos(a + 0.16) * 12.4, 50 + 3, C.APSE.z - Math.sin(a + 0.16) * 12.4], [1.2, 6, 1.2], [0, a, 0], S.WHITE); }
  for (const sx of [-1, 1]) {
    const g = new THREE.LatheGeometry(Array.from({ length: 16 }, (_, i) => new THREE.Vector2(10 * Math.sqrt(1 - Math.pow(i / 15, 1.6)) + 0.4, i / 15 * 38)), 20); const m = new THREE.Mesh(g, stone); m.position.set(sx * 27, 0, -42); m.castShadow = m.receiveShadow = true; ext.add(m);
    E.taper(sx * 27, 38, -42, 0.6, 5, S.WHITE); E.ball(sx * 27, 43.5, -42, 0.9, '#e8b923');
    for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; E.raw('lancet', [sx * 27 + Math.sin(a) * 10.42, 2.5, -42 + Math.cos(a) * 10.42], [1.5, 6.5, 1], [0, a, 0], S.HOLE); }
    for (const yy of [11, 20, 28]) { const rr = 10 * Math.sqrt(1 - Math.pow(yy / 38, 1.6)) + 0.5; E.raw('hoop', [sx * 27, yy, -42], [rr * 2, rr * 2, 8], [Math.PI / 2, 0, 0], S.WHITE); }
  }

  // ===== 中殿侧墙：每个开间下层双尖券窗加圆窗，上层三联高窗，山花、卷叶、扶壁尖塔 =====
  const extGlass = new THREE.MeshStandardMaterial({ map: glassTexture(MIXED, 91), transparent: true, alphaTest: 0.5, roughness: 0.25, metalness: 0.2, color: '#4a4856', emissive: '#12151c', emissiveIntensity: 1 });
  const extWins = [];
  for (const sx of [-1, 1]) {
    const A = face(E, sx * 22.84, 0, sx > 0 ? '+x' : '-x'), U = face(E, sx * 15.54, 0, sx > 0 ? '+x' : '-x');
    // 回廊：贴着侧廊外墙的矮廊，一排小券洞
    ES.box(sx * 26, 0, naveMid + 2, 6, 9, naveLen - 6, S.NEW);
    for (let k = 0; k < 12; k++) { const z = C.Z_NAVE_END + 4.2 + k * 3.05; A.lancet(z, 1.2, 6.22, 1.9, 6, S.HOLE); A.arch(z, 1.2, 6.3, 1.0, 3.6, 2.4, 0.13, S.WHITE, 6); A.prism(z, 9, 3.2, 3, 2.2, 6, S.NEW2); }
    A.box(naveMid + 2, 9, 3.2, naveLen - 6, 0.35, 6.5, S.WHITE);
    for (let k = 0; k < C.BAYS; k++) {
      const z = C.BAY_Z0 + C.BAY * (k + 0.5);
      // 下层：玻璃面片（两扇）与边框
      for (const o of [-1, 1]) { extWins.push({ pos: [sx * 22.9, 11 + 7.6, z + o * 1.5], scl: [2.5, 15.2, 1], ry: sx * Math.PI / 2 }); A.arch(z + o * 1.5, 11, 0.12, 1.3, 9.2, 6, 0.2, S.WHITE, 8); }
      A.rod([z, 11, 0.12], [z, 24.5, 0.12], 0.16, S.WHITE);
      A.disc(z, 26.6, 0.1, 1.5, S.HOLE); A.hoop(z, 26.6, 0.14, 1.55, S.WHITE, 4); for (let q = 0; q < 6; q++) { const a = q * Math.PI / 3; A.rod([z, 26.6, 0.14], [z + Math.cos(a) * 1.5, 26.6 + Math.sin(a) * 1.5, 0.14], 0.07, S.WHITE); }
      A.box(z, 10.2, 0.2, C.BAY - 1.6, 0.4, 0.5, S.WHITE); A.box(z, 29.6, 0.25, C.BAY - 1.2, 0.5, 0.7, S.WHITE);
      // 山花：陡三角，里面一个小圆洞，边上卷叶，顶上果篮
      A.prism(z, 31, -0.3, 5.6, 7.6, 1.5, S.NEW); A.disc(z, 33.6, 0.5, 0.85, S.HOLE); A.hoop(z, 33.6, 0.52, 0.9, S.WHITE, 4);
      for (let q = 1; q < 6; q++) for (const e of [-1, 1]) A.ball(z + e * 2.8 * (1 - q / 6), 31 + 7.6 * q / 6, 0.2, 0.28, S.WHITE, 1.3);
      A.taper(z, 38.4, -0.3, 0.4, 2.6, S.WHITE); A.ball(z, 41.6, -0.3, 0.78, FRUIT[(k * 2 + (sx > 0 ? 1 : 0)) % 6], 1.25); A.ball(z, 42.5, -0.3, 0.3, '#5d9a3f');
      // 扶壁：分三段收进去，顶上方尖塔
      const zb = z + 3.5; A.box(zb, 0, 0.9, 1.9, 18, 2.2, S.NEW); A.box(zb, 18, 0.6, 1.6, 10, 1.6, S.NEW); A.box(zb, 28, 0.35, 1.3, 6, 1.1, S.NEW2);
      A.prism(zb, 18, 1.55, 1.9, 1.6, 0.9, S.WHITE); A.spike(zb, 34, 0.35, 0.95, 6.5, S.WHITE); A.ball(zb, 40.8, 0.35, 0.34, FRUIT[(k + 3) % 6]);
      for (const e of [-1, 1]) A.spike(zb + e * 0.75, 34, 0.5, 0.36, 2.6, S.WHITE);
      // 上层（中廊高窗）：三联深色尖券，边框，山花，小尖顶
      for (const o of [-1.75, 0, 1.75]) { const hh = o ? 9.2 : 11.4; U.lancet(z + o, 32.4, 0.08, 1.35, hh, S.HOLE); U.arch(z + o, 32.4, 0.12, 0.72, hh * 0.6, hh * 0.4, 0.12, S.WHITE, 6); }
      extWins.push({ pos: [sx * 15.6, 32.4 + 5.7, z], scl: [1.25, 11.2, 1], ry: sx * Math.PI / 2 });
      U.prism(z, 46, -0.2, 5.4, 6.6, 1.4, S.NEW); U.disc(z, 48, 0.52, 0.7, S.HOLE);
      for (let q = 1; q < 5; q++) for (const e of [-1, 1]) U.ball(z + e * 2.7 * (1 - q / 5), 46 + 6.6 * q / 5, 0.2, 0.24, S.WHITE, 1.3);
      U.taper(z, 52.6, -0.2, 0.34, 2.4, S.WHITE); U.ball(z, 55.6, -0.2, 0.66, FRUIT[(k * 2 + 3 + (sx > 0 ? 1 : 0)) % 6], 1.25);
      U.box(zb, 31, 0.3, 1.1, 15.5, 0.9, S.NEW2); U.spike(zb, 46.5, 0.3, 0.7, 5, S.WHITE);
      U.box(z, 45.4, 0.2, C.BAY - 0.8, 0.5, 0.6, S.WHITE);
    }
    // 横厅侧面（朝 ±Z 的那两小段）与端墙上部也开几扇窗
    for (const zz of [C.Z_NAVE_END - 0.1, C.Z_TRANS_END + 0.1]) for (const o of [0, 1]) { const x = sx * (25.5 + o * 2.4); E.raw('lancet', [x, 12, zz + (zz > -10 ? 0.25 : -0.25)], [1.4, 12, 1], [0, zz > -10 ? 0 : Math.PI, 0], S.HOLE); }
  }
  for (let i = 0; i < 7; i++) { const a = Math.PI * (0.1 + 0.8 * i / 6); extWins.push({ pos: [Math.cos(a) * 12.58, 41, C.APSE.z - Math.sin(a) * 12.58], scl: [1.9, 12.5, 1], ry: a + Math.PI / 2 }); }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  const ewMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), extGlass, extWins.length);
  extWins.forEach((w, i) => { _m.compose(_p.set(...w.pos), _q.setFromEuler(_e.set(0, w.ry, 0)), _s.set(...w.scl)); ewMesh.setMatrixAt(i, _m); }); ewMesh.frustumCulled = false; ext.add(ewMesh);

  // ===== 诞生立面（+X）：老石头，三座门廊层层退进去的券，边上垂着钟乳，堆满人物和植物 =====
  {
    const zc = C.CROSS.z, N = face(E, 37.0, zc, '+x');
    ES.box(33.6, 0, zc, 7.2, 41, 35, S.OLD);
    N.box(0, 0, 3, 34, 1.2, 9, S.OLD3); N.box(0, 1.2, 3, 32, 0.5, 7.5, S.OLD);                         // 台基
    const OLDS = [S.OLD, S.OLD2, S.OLD3, '#a89a84', '#93866f'];
    const portals = [[0, 12.4, 52, 'charity'], [-10.6, 8.4, 35, 'hope'], [10.6, 8.4, 35, 'faith']];
    for (const [u0, W, H, id] of portals) {
      const jamb = H * 0.2, rise = H * 0.22, big = id === 'charity';
      // 门廊侧墙与券：五层，一层比一层小、一层比一层靠里
      for (let i = 0; i < 5; i++) { const d = 5.6 - i * 0.62, half = W / 2 * (1 - i * 0.115), jb = jamb * (1 - i * 0.03), rs = rise * (1 - i * 0.09); N.arch(u0, 1.6, d, half, jb, rs, 0.34 - i * 0.02, OLDS[i % 5], 14); for (const e of [-1, 1]) N.box(u0 + e * half, 1.6, d - 0.3, 0.5, jb, 0.62, OLDS[(i + 2) % 5]); }
      N.lancet(u0, 1.6, 2.86, W * 0.56, (jamb + rise * 0.72) / 0.82, S.HOLE);
      // 门：中间一根立柱，柱上一尊像；门扇是深绿的铜门
      N.lancet(u0 - W * 0.13, 1.6, 2.9, W * 0.22, jamb * 0.9, '#31402f'); N.lancet(u0 + W * 0.13, 1.6, 2.9, W * 0.22, jamb * 0.9, '#31402f');
      N.taper(u0, 1.6, 3.3, 0.3, jamb * 0.72, S.OLD3); N.fig(u0, 1.6 + jamb * 0.74, 3.3, big ? 1.5 : 1.15, S.OLD3);
      // 券边上倒挂的钟乳：沿最外两层券垂下来
      for (let i = 0; i < 2; i++) { const d = 5.6 - i * 0.62, half = W / 2 * (1 - i * 0.115), jb = jamb * (1 - i * 0.03), rs = rise * (1 - i * 0.09), n = Math.round((big ? 30 : 20) * dens); for (let k = 0; k < n; k++) { const t = -0.96 + 1.92 * (k + 0.5) / n; N.drip(u0 + t * half, 1.6 + jb + rs * (1 - t * t) - 0.2, d + 0.05, 0.16 + R() * 0.14, 0.7 + R() * 1.7, OLDS[k % 5]); } }
      // 山花：陡尖的三角墙，贴在门廊前面，上面一层层小龛
      const gy = 1.6 + jamb + rise * 0.55, gh = H - gy;
      N.prism(u0, gy, 4.3, W * 1.02, gh, 2.0, S.OLD); N.prism(u0, gy + gh * 0.08, 5.2, W * 0.8, gh * 0.78, 0.6, S.OLD2);
      for (let tier = 0; tier < (big ? 5 : 4); tier++) {
        const ty = gy + gh * (0.06 + tier * 0.16), half = W / 2 * (1 - (ty - gy) / gh) - 0.6, n = Math.max(1, Math.floor(half * 2 / 1.25));
        N.box(u0, ty - 0.25, 5.45, half * 2 + 0.8, 0.25, 0.75, S.OLD3);                                                // 一道托着人物的檐
        for (let k = 0; k < n; k++) { const u = u0 + (k - (n - 1) / 2) * 1.25; N.lancet(u, ty, 5.52, 0.82, gh * 0.11, S.OLD4); N.arch(u, ty, 5.6, 0.44, gh * 0.066, gh * 0.044, 0.07, S.OLD3, 5); if ((k + tier) % 2 === 0 || n < 3) N.fig(u, ty, 5.85, 0.62 + (big ? 0.12 : 0), ['#b9ac95', '#a89b85', '#c4b8a2'][(k + tier) % 3], (k * 3 + tier) % 3); }
        for (let k = 0; k < Math.round(n * 1.5 * dens); k++) N.drip(u0 + (R() * 2 - 1) * (half + 0.3), ty - 0.25, 5.7, 0.09 + R() * 0.08, 0.3 + R() * 0.8, OLDS[k % 5]);
      }
      // 山花斜边上的卷叶与小尖顶
      for (let k = 1; k < 12; k++) for (const e of [-1, 1]) { const t = k / 12, u = u0 + e * W * 0.51 * (1 - t), y = gy + gh * t; N.ball(u, y, 4.9, 0.3, OLDS[k % 5], 1.5); if (k % 3 === 0) N.spike(u + e * 0.2, y, 4.4, 0.34, 2.4, S.OLD3); }
      // 门洞上方的主雕塑群：圣家一组人物站在券心下
      const cy = 1.6 + jamb * 0.98; N.box(u0, cy - 0.3, 3.6, W * 0.5, 0.3, 1.3, S.OLD3);
      for (let k = 0; k < (big ? 7 : 5); k++) N.fig(u0 + (k - (big ? 3 : 2)) * W * 0.075, cy, 3.7 + (k % 2) * 0.25, (big ? 1.25 : 1) * (k === (big ? 3 : 2) ? 1.2 : 1), '#b9ac95', k % 3);
      // 堆满石面的植物、鸟兽：小而密的凸起，越往上越稀
      const nb = Math.round(W * 13 * dens);
      for (let k = 0; k < nb; k++) { const t = Math.pow(R(), 1.3), y = gy + gh * t * 0.92, half = W / 2 * (1 - t) * 0.94, u = u0 + (R() * 2 - 1) * half; N.ball(u, y, 5.3 + R() * 0.15, 0.08 + R() * R() * 0.16, OLDS[k % 5], 0.6 + R() * 0.8); }
      // 顶饰
      if (big) {
        // 生命之树：绿色柏树，树上白鸽，顶上一个红色 T 形十字
        const ty = H - 3; N.taper(0, ty - 1, 4.2, 0.45, 3, S.OLD3);
        for (const [dy, r, h, c] of [[1.5, 2.4, 6.5, '#3d7a39'], [5, 1.95, 6, '#458540'], [8.5, 1.45, 5.5, '#4e9248'], [11.6, 0.9, 4.2, '#58a050']]) N.cone(0, ty + dy, 4.2, r, h, c);
        for (let k = 0; k < 18; k++) { const a = k * 2.4, yy = ty + 2.5 + (k / 18) * 11, rr = 2.3 - (yy - ty - 1.5) * 0.14; const p = N.to3(Math.sin(a) * rr, yy, 4.2 + Math.cos(a) * rr); E.raw('ball', p, [0.42, 0.3, 0.6], [0, a, 0], '#ffffff'); }
        N.box(0, ty + 15.6, 4.2, 0.22, 1.5, 0.22, '#c8452e'); N.box(0, ty + 16.9, 4.2, 1.1, 0.22, 0.22, '#c8452e'); N.ball(0, ty + 17.5, 4.2, 0.26, '#e8b923');
      } else { N.spike(u0, H - 0.6, 4.3, 0.6, 5, S.OLD3); N.ball(u0, H + 4.7, 4.3, 0.42, '#e8b923'); }
    }
    // 门廊之间两根棕榈柱：柱脚是乌龟，柱头一圈棕榈叶，上面是吹号的天使
    for (const u of [-5.9, 5.9]) {
      N.ball(u, 1.75, 6.4, 0.75, S.OLD2, 0.5); N.taper(u, 1.9, 6.4, 0.5, 15, S.OLD3);
      for (let k = 0; k < 9; k++) { const a = k * 0.7; N.rod([u, 16.6, 6.4], [u + Math.cos(a) * 1.3, 18.1, 6.4 + Math.sin(a) * 1.3], 0.2, S.OLD, 'cone'); }
      for (let k = 0; k < 4; k++) { const a = k * 1.57 + 0.5; N.fig(u + Math.cos(a) * 0.6, 18.3, 6.4 + Math.sin(a) * 0.6, 0.85, '#b9ac95', 1); }
    }
    // 四座钟塔脚下、立面顶上：一丛丛小尖顶
    for (let k = 0; k < 15; k++) { const u = -15.6 + k * 2.23, h = 5 + R() * 6; if (Math.abs(u) < 5.5 || (Math.abs(Math.abs(u) - 10.6) < 3.6)) continue; const dd = -1.2 - R() * 2; N.spike(u, 41, dd, 0.6, h, S.OLD3); N.ball(u, 41 + h + 0.3, dd, 0.28, FRUIT[k % 5]); }
    for (const u of [-16.6, 16.6]) { N.box(u, 0, 3.1, 1.6, 30, 3.4, S.OLD2); N.spike(u, 30, 3.1, 1.0, 8, S.OLD3); }
    // 钟塔之间的连桥
    for (const [u, y] of [[0, 60], [-11.5, 52], [11.5, 52]]) { N.box(u, y, -4, 6.4, 1.4, 1.6, S.OLD3); for (let k = 0; k < 5; k++) N.lancet(u + (k - 2) * 1.1, y + 0.2, -3.18, 0.6, 1.0, S.HOLE); }
  }

  // ===== 受难立面（-X）：冷硬、像骨头。六根斜撑的大柱托着门廊顶，下面是刀切一样的雕像 =====
  {
    const zc = C.CROSS.z, P = face(E, -37.0, zc, '-x');
    ES.box(-33.6, 0, zc, 7.2, 41, 35, S.BONE2);
    P.box(0, 0, 8, 36, 0.5, 18, S.BONE3); P.box(0, 0.5, 6.5, 33, 0.4, 14, S.BONE2);
    // 六根斜柱：下粗上细，两头鼓成关节
    for (let k = 0; k < 6; k++) {
      const u = (k - 2.5) * 5.4, top = [u * 0.86, 21, 3.4], base = [u, 0.6, 14.2], mid = top.map((v, i) => v * 0.45 + base[i] * 0.55);
      P.rod(base, mid, 0.95, S.BONE, 'taper'); P.rod(mid, top, 0.62, S.BONE, 'cyl'); P.ball(...base, 1.2, S.BONE, 0.55); P.ball(...top, 0.95, S.BONE, 0.8); P.ball(...mid, 0.78, S.BONE2, 0.9);
    }
    // 门廊顶：一片往外挑、往上翘的大斜板，板沿一道深槽
    E.raw('box', P.to3(0, 22.4, 6.4), [10, 0.8, 34], [0, 0, -0.22], S.BONE); E.raw('box', P.to3(0, 23.4, 10.9), [0.8, 1.6, 34.4], [0, 0, -0.22], S.BONE2);
    for (let k = 0; k < 16; k++) E.raw('box', P.to3((k - 7.5) * 2.1, 21.55, 6.4), [9.4, 0.5, 0.22], [0, 0, -0.22], S.BONE3);
    // 墙面：横向一道道硬棱，三扇门
    for (const y of [9.6, 13.8, 18.2]) P.box(0, y, 2.75, 31, 0.35, 0.5, S.BONE3);
    for (const [u, w, h] of [[0, 5.2, 9], [-9.4, 3.4, 7], [9.4, 3.4, 7]]) { P.box(u, 0.9, 2.9, w, h, 0.25, S.BRONZE); P.box(u, 0.9 + h, 2.95, w + 0.8, 0.6, 0.6, S.BONE3); P.box(u - w / 2 - 0.3, 0.9, 2.95, 0.5, h, 0.6, S.BONE3); P.box(u + w / 2 + 0.3, 0.9, 2.95, 0.5, h, 0.6, S.BONE3); for (let q = 0; q < 6; q++) P.box(u, 1.4 + q * (h - 1) / 6, 3.05, w - 0.5, 0.08, 0.06, '#5a4c3c'); }
    P.cyl(0, 0.9, 5.2, 0.42, 5.2, S.BONE2); P.block(0, 6.1, 5.2, 0.95, S.BONE3, 0.12);                               // 中门前的鞭笞柱
    // 雕像：三层，走成一个 S 形，每组两到四个棱角人物站在一块挑出的石板上
    const groups = [[-11.5, 1.2, 3], [-5.6, 1.2, 4], [5.6, 1.2, 3], [11.5, 1.2, 4], [11.2, 10.2, 3], [4.6, 10.6, 4], [-4.6, 10.6, 3], [-11.2, 10.2, 3], [-8.6, 15.2, 2], [8.6, 15.2, 3]];
    groups.forEach(([u, y, n], gi) => { if (y > 2) P.box(u, y - 0.4, 3.6, n * 1.05 + 0.6, 0.4, 1.7, S.BONE2); for (let k = 0; k < n; k++) P.block(u + (k - (n - 1) / 2) * 1.02, y, 3.7 + (k % 2) * 0.35, 1.05 + ((gi + k) % 3) * 0.12, [S.BONE2, S.BONE3, '#d6cdbb'][(gi + k) % 3], ((gi * 7 + k * 3) % 5 - 2) * 0.05); });
    // 正中高处的十字架与三个人
    P.box(0, 14.6, 4.6, 0.36, 6.2, 0.36, '#6f6250'); P.box(0, 19.2, 4.6, 3.6, 0.36, 0.36, '#6f6250'); P.block(0, 15.8, 4.95, 1.25, S.BONE3, 0);
    for (const e of [-1, 1]) P.block(e * 1.9, 13.2, 4.4, 1.05, S.BONE2, e * 0.1); P.box(0, 12.8, 4.2, 6.4, 0.4, 1.6, S.BONE2);
    // 上面一排十八根小骨柱，中间细两头粗；再上面是空的三角山花和十字
    P.box(0, 27.6, 2.9, 30, 0.9, 1.8, S.BONE);
    for (let k = 0; k < 18; k++) { const u = (k - 8.5) * 1.62, lean = (k - 8.5) * 0.02; P.rod([u, 28.5, 3.2], [u + lean, 37.6, 2.6], 0.2, S.BONE, 'cyl'); P.ball(u, 28.8, 3.2, 0.42, S.BONE, 1.3); P.ball(u + lean, 37.3, 2.6, 0.4, S.BONE, 1.3); P.ball(u + lean / 2, 33, 2.9, 0.26, S.BONE2, 1.6); }
    P.box(0, 37.6, 2.6, 30.5, 0.8, 1.7, S.BONE);
    P.rod([-15.2, 38.4, 2.6], [0, 49.5, 2.6], 0.42, S.BONE, 'box'); P.rod([15.2, 38.4, 2.6], [0, 49.5, 2.6], 0.42, S.BONE, 'box');
    P.prism(0, 38.4, 1.9, 29, 10.2, 0.5, S.BONE2); P.disc(0, 42, 2.2, 1.7, S.HOLE); P.hoop(0, 42, 2.25, 1.75, S.BONE, 4);
    for (const e of [-1, 1]) for (let k = 1; k < 5; k++) P.lancet(e * k * 2.6, 39, 2.2, 1.1, 6.5 - k * 1.2, S.HOLE);
    P.box(0, 49.5, 2.6, 0.5, 6.5, 0.5, S.WHITE); P.box(0, 53.4, 2.6, 3.4, 0.5, 0.5, S.WHITE);
    for (const u of [-16.6, 16.6]) { P.box(u, 0, 3.1, 1.6, 30, 3.4, S.BONE2); P.spike(u, 30, 3.1, 1.0, 8, S.BONE); }
    for (const [u, y] of [[0, 60], [-11.5, 53], [11.5, 53]]) { P.box(u, y, -4, 6.4, 1.4, 1.6, S.BONE); for (let k = 0; k < 5; k++) P.lancet(u + (k - 2) * 1.1, y + 0.2, -3.18, 0.6, 1.0, S.HOLE); }
  }

  // ===== 荣耀立面（+Z）：最大的一面，现实中未完成，这里按设计意向示意 =====
  {
    const GZ = C.Z_GLORY + 6.9, G = face(E, 0, GZ, '+z');
    ES.box(0, 0, C.Z_GLORY + 3.6, 45.6, 42, 7, S.NEW);
    for (const c of C.GLORY_COLS) { const u = c.x, d = c.z - GZ; G.taper(u, 0, d, 1.15, 23, S.WHITE); G.ball(u, 23.4, d, 1.5, S.NEW, 0.6); G.ball(u, 0.5, d, 1.5, S.NEW2, 0.5); }
    G.box(0, 23.5, 4.4, 47, 1.6, 8.8, S.NEW); G.box(0, 25.1, 4.4, 48, 0.4, 9.4, S.WHITE);
    for (let k = 0; k < 7; k++) { const u = (k - 3) * 5.9, big = k === 3, w = big ? 4.4 : 3.2, h = big ? 15 : 11; G.lancet(u, 0, 2.95, w, h, S.BRONZE); for (let i = 0; i < 3; i++) G.arch(u, 0, 3.2 + i * 0.5, w / 2 + 0.25 + i * 0.3, h * 0.6, h * 0.4 + i * 0.25, 0.2, i % 2 ? S.NEW2 : S.WHITE, 8); }
    // 门廊顶上一排双曲面形的灯笼顶：高低错落，底下一圈小洞
    for (let k = 0; k < 16; k++) { const u = (k - 7.5) * 2.9, h = 9 + (1 - Math.abs(k - 7.5) / 7.5) * 16 + (k % 2) * 3, d = 3.2 + (k % 2) * 2.6; G.cone(u, 25.5, d, 1.5, h, S.WHITE); G.ball(u, 25.8 + h, d, 0.5, FRUIT[k % 6]); G.cyl(u, 25.5, d, 1.55, 1.2, S.NEW2); for (const yy of [0.25, 0.5]) { const p = G.to3(u, 25.5 + h * yy, d); E.raw('hoop', p, [3 * (1 - yy) + 0.2, 3 * (1 - yy) + 0.2, 6], [Math.PI / 2, 0, 0], S.NEW3); } }
    // 立面墙：大玫瑰窗、两排尖券窗、檐口小尖顶
    for (let k = 0; k < 9; k++) { const u = (k - 4) * 4.6; if (Math.abs(u) < 6.5) continue; G.lancet(u, 27, 2.92, 1.8, 9, S.HOLE); G.arch(u, 27, 3.0, 0.95, 5.4, 3.6, 0.14, S.WHITE, 6); }
    for (let k = 0; k < 12; k++) { const u = (k - 5.5) * 3.9; G.spike(u, 42, 1.6, 0.8, 5 + (k % 3) * 1.6, S.WHITE); G.ball(u, 47.4 + (k % 3) * 1.6, 1.6, 0.34, FRUIT[k % 6]); }
    G.hoop(0, 33.5, 3.0, 5.7, S.WHITE, 5); for (let q = 0; q < 12; q++) { const a = q * Math.PI / 6; G.rod([0, 33.5, 3.0], [Math.cos(a) * 5.6, 33.5 + Math.sin(a) * 5.6, 3.0], 0.1, S.WHITE); } G.hoop(0, 33.5, 3.0, 2.2, S.WHITE, 4);
    for (let k = 0; k < 3; k++) G.box(0, 0, 10.4 + k * 1.1, 52 + k * 3, 0.45 - k * 0.14, 2, S.NEW3);
    const rose = new THREE.Mesh(new THREE.CircleGeometry(5.5, 40), extGlass.clone()); rose.material.map = glassTexture(MIXED, 44, 'rose'); rose.position.set(0, 33.5, GZ + 2.92); ext.add(rose);
  }

  // ===== 十八座塔 =====
  const mkTower = (seed, tint, repeat) => { const m = worldStoneless(new THREE.MeshStandardMaterial({ color: tint, roughness: 0.88, map: towerTexture(seed) })); m.map.repeat.set(repeat, 1); return m; };
  const tNew = mkTower(7, '#ffffff', 3), tOld = mkTower(8, '#b8ab96', 3), tBone = mkTower(10, '#f4efe4', 3), tBig = mkTower(9, '#ffffff', 6);
  const glow = new THREE.MeshBasicMaterial({ color: '#fff4c8', toneMapped: false });
  const GL = batcher(ext, glow, { cast: false, receive: false });
  const MOSAIC = [['#d8402b', '#f0c419', '#ffffff'], ['#f0c419', '#d8402b', '#ffffff'], ['#3f9b55', '#f0c419', '#ffffff'], ['#d8402b', '#ffffff', '#f0c419']];
  C.TOWERS.forEach((t, ti) => {
    const { pts, top, rTop } = towerProfile(t), apo = t.kind === 'apostle';
    const mat = !apo ? tBig : t.face === 'nativity' ? tOld : t.face === 'passion' ? tBone : tNew, rib = t.face === 'nativity' ? S.OLD3 : S.WHITE;
    const body = new THREE.Mesh(new THREE.LatheGeometry(pts, apo ? 20 : 32), mat);
    body.position.set(t.x, 0, t.z); body.rotation.y = ti * 0.7; body.castShadow = body.receiveShadow = true; ext.add(body);
    const rAt = y => { const u = Math.min(1, Math.max(0, (y - t.y0) / (top - t.y0))); const i = Math.min(pts.length - 2, Math.floor(u * (pts.length - 1))), f = u * (pts.length - 1) - i; return pts[i].x + (pts[i + 1].x - pts[i].x) * f; };
    // 竖向的肋：从下到上贴着抛物线轮廓；横向一圈圈石片
    const nr = apo ? 8 : t.kind === 'jesus' ? 16 : 12, segs = 7, yA = t.y0 + (top - t.y0) * 0.06;
    for (let k = 0; k < nr; k++) { const a = k * Math.PI * 2 / nr + ti; let prev = null; for (let s = 0; s <= segs; s++) { const y = yA + (top - yA) * s / segs, r = rAt(y) + 0.06, p = [t.x + Math.cos(a) * r, y, t.z + Math.sin(a) * r]; if (prev) E.rod(prev, p, apo ? 0.13 : 0.2, rib, 'box'); prev = p; } }
    const nh = apo ? 13 : 16; for (let k = 1; k <= nh; k++) { const y = t.y0 + (top - t.y0) * k / (nh + 1), r = rAt(y) + 0.1; E.raw('hoop', [t.x, y, t.z], [r * 2, r * 2, apo ? 5 : 8], [Math.PI / 2, 0, 0], rib); }
    if (apo) {
      // 塔身中段一圈阳台
      const yb = t.h * 0.46, rb = rAt(yb); E.raw('cyl', [t.x, yb, t.z], [rb * 2 + 1.1, 0.5, rb * 2 + 1.1], null, rib); for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; E.box(t.x + Math.cos(a) * (rb + 0.5), yb + 0.25, t.z + Math.sin(a) * (rb + 0.5), 0.14, 1.0, 0.14, rib); }
      E.raw('hoop', [t.x, yb + 1.25, t.z], [rb * 2 + 1.0, rb * 2 + 1.0, 3], [Math.PI / 2, 0, 0], rib);
      // 权杖形尖顶：一节节的马赛克，黄色杆身、红环、白球，顶上一个带十字的圆盘
      const [a, b, c] = MOSAIC[ti % 4];
      E.taper(t.x, top, t.z, rTop * 0.95, 6.5, b);
      for (let k = 0; k < 5; k++) E.raw('hoop', [t.x, top + 0.6 + k * 1.2, t.z], [rTop * 2.1 - k * 0.12, rTop * 2.1 - k * 0.12, 9], [Math.PI / 2, 0, 0], k % 2 ? c : a);
      E.ring(t.x, top + 1.2, t.z, rTop * 1.5, a); E.ring(t.x, top + 3.4, t.z, rTop * 1.3, a);
      for (let k = 0; k < 6; k++) { const an = k * 1.047; E.ball(t.x + Math.cos(an) * rTop * 1.05, top + 5.2, t.z + Math.sin(an) * rTop * 1.05, 0.42, c); }
      E.ball(t.x, top + 7.6, t.z, 1.25, a, 1.25); for (let k = 0; k < 8; k++) { const an = k * 0.785; E.ball(t.x + Math.cos(an) * 1.2, top + 7.6, t.z + Math.sin(an) * 1.2, 0.26, k % 2 ? b : c); }
      E.ring(t.x, top + 9.4, t.z, 1.5, b);
      E.raw('cyl', [t.x, top + 11.6, t.z], [3.4, 0.5, 3.4], [Math.PI / 2, 0, (t.face === 'glory' ? 0 : Math.PI / 2)], c);
      E.raw('hoop', [t.x, top + 11.6, t.z], [3.5, 3.5, 6], [0, t.face === 'glory' ? 0 : Math.PI / 2, 0], a);
      E.box(t.x, top + 12.6, t.z, 0.4, 2.4, 0.4, c); E.ball(t.x, top + 11.6, t.z, 0.6, a);
      for (let k = 0; k < 4; k++) { const an = k * 1.571 + 0.6; E.ball(t.x + Math.cos(an) * 1.3, top + 10.2, t.z + Math.sin(an) * 1.3, 0.36, '#ffffff'); }
    } else if (t.kind === 'jesus') {
      E.taper(t.x, top, t.z, 1.9, 4, S.WHITE); E.box(t.x, top + 3.5, t.z, 1.7, 14.5, 1.7, '#ffffff');
      E.box(t.x, top + 10.2, t.z, 9.4, 1.7, 1.7, '#ffffff'); E.box(t.x, top + 10.2, t.z, 1.7, 1.7, 9.4, '#ffffff');
      for (const [dx, dz] of [[4.9, 0], [-4.9, 0], [0, 4.9], [0, -4.9]]) GL.ball(t.x + dx, top + 11.05, t.z + dz, 0.75, '#fff4c8'); GL.ball(t.x, top + 18.4, t.z, 0.8, '#fff4c8');
      for (let k = 0; k < 4; k++) { const an = k * 1.571 + 0.785; E.cone(t.x + Math.cos(an) * 10.6, t.y0 - 6, t.z + Math.sin(an) * 10.6, 1.6, 22, S.WHITE); }
      for (let k = 0; k < 16; k++) { const an = k * Math.PI / 8, yy = t.y0 + 6, r = rAt(yy) + 0.05; E.raw('lancet', [t.x + Math.sin(an) * r, yy, t.z + Math.cos(an) * r], [2.2, 14, 1], [0, an, 0], S.HOLE); }
    } else if (t.kind === 'mary') {
      E.taper(t.x, top, t.z, 1.3, 3, '#dfe9f2'); E.ring(t.x, top + 1, t.z, 1.9, '#3f6fd8');
      const star = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, 0), glow); star.position.set(t.x, top + 5.6, t.z); ext.add(star);
      for (let k = 0; k < 12; k++) { const v = new THREE.Vector3().setFromSphericalCoords(1, Math.acos(1 - 2 * (k + 0.5) / 12), k * 2.4); GL.rod([t.x + v.x * 0.6, top + 5.6 + v.y * 0.6, t.z + v.z * 0.6], [t.x + v.x * 3.4, top + 5.6 + v.y * 3.4, t.z + v.z * 3.4], 0.55, '#fff7d6', 'cone'); }
      for (let k = 0; k < 12; k++) { const an = k * Math.PI / 6, yy = t.y0 + 5, r = rAt(yy) + 0.05; E.raw('lancet', [t.x + Math.sin(an) * r, yy, t.z + Math.cos(an) * r], [1.8, 11, 1], [0, an, 0], S.HOLE); }
    } else {
      E.taper(t.x, top, t.z, 1.1, 3.2, S.WHITE); E.ball(t.x, top + 4.6, t.z, 1.25, '#ffffff', 1.2);
      const out = Math.atan2(t.x, t.z - C.CROSS.z);
      for (const sgn of [-1, 1]) E.raw('box', [t.x + Math.cos(out) * sgn * 1.9, top + 6, t.z - Math.sin(out) * sgn * 1.9], [3.4, 2.4, 0.3], [0, out, sgn * 0.5], '#ffffff');
      E.ball(t.x, top + 8.2, t.z, 0.5, '#f0c419');
      for (let k = 0; k < 10; k++) { const an = k * Math.PI / 5, yy = t.y0 + 5, r = rAt(yy) + 0.05; E.raw('lancet', [t.x + Math.sin(an) * r, yy, t.z + Math.cos(an) * r], [1.5, 10, 1], [0, an, 0], S.HOLE); }
    }
  });
  GL.build();
  return { extGlass };
}
function worldStoneless(m) { return m; }
