// 人物：成形的躯干、会弯的手肘和膝盖、画出来的脸和衣服（skins.js 的两张图集）。全体共用二十来个 InstancedMesh。
import * as THREE from 'three';
import { agentWorld, GAIT, PHASE_PER_M, POSE_RATE, footAt, legIK, gaitY } from './core.js';
import { atlasMat } from './gfx.js';
import { faceAtlas, clothAtlas } from './skins.js';

const _root = new THREE.Matrix4(), _loc = new THREE.Matrix4(), _out = new THREE.Matrix4();
const _p = new THREE.Vector3(), _o = new THREE.Vector3(), _s = new THREE.Vector3(), _mid = new THREE.Vector3(), _end = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qy = new THREE.Quaternion(), _e = new THREE.Euler(), _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0), ID = new THREE.Quaternion();
const DOWN = new THREE.Vector3(0, -1, 0);
const D2R = Math.PI / 180;

// 头：经纬网格上叠几个鼓包（鼻梁、眉弓、眼窝、颧、唇、下巴、耳），侧面看有轮廓。经度 0 在正前，贴图横向绕头一圈、接缝在后脑
const BUMPS = [[0, -6, 7, 13, 0.17], [0, -27, 12, 4, 0.03], [0, -45, 15, 9, 0.07]];
for (const s of [-1, 1]) BUMPS.push([s * 17, 12, 13, 5, 0.035], [s * 19, 5, 9, 6, -0.045], [s * 30, -12, 14, 12, 0.03], [s * 88, 0, 5, 10, 0.1]);
function headGeo(lons, lats) {
  const pos = [], uv = [], idx = [], W = lons.length;
  for (const lat of lats) for (const lon of lons) {
    const la = lat * D2R, lo = lon * D2R; let r = 1;
    for (const [bl, bt, sl, st, a] of BUMPS) { const dx = (lon - bl) * Math.cos(la) / sl, dy = (lat - bt) / st; r += a * Math.exp(-dx * dx - dy * dy); }
    const jaw = lat < -14 ? 1 - 0.3 * Math.min(1, (-14 - lat) / 46) : 1;   // 下颌往下收
    pos.push(Math.sin(lo) * Math.cos(la) * r * jaw, Math.sin(la) * r, Math.cos(lo) * Math.cos(la) * r * (lat < -14 ? 0.6 + 0.4 * jaw : 1));
    uv.push(0.5 + lon / 360, 0.5 + lat / 180);
  }
  for (let i = 0; i < lats.length - 1; i++) for (let j = 0; j < W - 1; j++) { const a = i * W + j, b = a + W; idx.push(a, b, b + 1, a, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const sym = a => [...a.slice().reverse().map(v => -v), 0, ...a];
const HEAD_NEAR = [sym([7, 14, 21, 29, 38, 50, 64, 78, 88, 98, 115, 140, 180]), [90, 70, 52, 38, 26, 17, 11, 5, -1, -7, -13, -20, -27, -34, -42, -52, -65, -90]];
const HEAD_FAR = [sym([12, 30, 60, 90, 135, 180]), [90, 55, 25, 5, -12, -28, -45, -65, -90]];
const NEAR2 = 24 * 24;   // 离镜头 24 米内用细的头

export function createPeople(scene, sim, opts = {}) {
  const N = sim.agents.length, lite = !!opts.lite;   // lite：手机档，少几圈面
  const mat = new THREE.MeshLambertMaterial();
  const faces = faceAtlas(lite ? 256 : 512), cloth = clothAtlas(lite ? 256 : 512);
  const matFace = atlasMat(faces.tex, faces.mask, faces.cols, faces.rows), matCloth = atlasMat(cloth.tex, cloth.mask, cloth.cols, cloth.rows);
  const seg = new THREE.CapsuleGeometry(0.5, 1, lite ? 1 : 2, lite ? 5 : 6).translate(0, -0.5, 0);             // 肢段：上关节在原点、下关节在 -1，两头是圆的，接缝被球面盖住
  const lathe = pts => {   // 自下而上给点，面才朝外；转半圈让贴图接缝落在背后，纵向贴图坐标按高度重排
    const g = new THREE.LatheGeometry(pts.slice().reverse().map(([r, y]) => new THREE.Vector2(r, y)), lite ? 10 : 16).rotateY(Math.PI);
    const ps = g.attributes.position, uv = g.attributes.uv, y0 = pts[pts.length - 1][1], y1 = pts[0][1];
    for (let i = 0; i < ps.count; i++) uv.setY(i, (ps.getY(i) - y0) / (y1 - y0));
    return g;
  };
  // 用图集的部件：不用实例色，每个实例带「选哪一格」和「染什么色」
  const mkAtlas = (geo, m, share) => {
    const im = new THREE.InstancedMesh(geo, m, N); im.frustumCulled = false; im.castShadow = !!opts.shadows;
    const cell = share ? share.cell : new THREE.InstancedBufferAttribute(new Float32Array(N * 2), 2), tint = share ? share.tint : new THREE.InstancedBufferAttribute(new Float32Array(N * 3).fill(1), 3);
    geo.setAttribute('aCell', cell); geo.setAttribute('aTint', tint); im.cell = cell; im.tint = tint;
    for (let i = 0; i < N; i++) im.setMatrixAt(i, ZERO);
    scene.add(im); return im;
  };
  const skin = (im, i, cx, cy, c, k = 1) => { im.cell.setXY(i, cx, cy); _c.set(c).multiplyScalar(k); im.tint.setXYZ(i, _c.r, _c.g, _c.b); };
  const box = new THREE.BoxGeometry(1, 1, 1);
  const mk = (geo, n = N, m = mat, shadow = true) => {
    const im = new THREE.InstancedMesh(geo, m, n); im.frustumCulled = false; im.castShadow = shadow && !!opts.shadows;
    for (let i = 0; i < n; i++) { im.setMatrixAt(i, ZERO); im.setColorAt(i, _c.set('#fff')); }
    scene.add(im); return im;
  };
  const M = {
    thigh: mk(seg, N * 2), shin: mk(seg, N * 2), foot: mk(box, N * 2),
    upper: mk(seg, N * 2), fore: mk(seg, N * 2), hand: mk(new THREE.SphereGeometry(1, 6, 5), N * 2),
    torso: mkAtlas(lathe([[0, 1.08], [0.2, 1.06], [0.44, 0.92], [0.52, 0.7], [0.5, 0.2], [0.47, -0.4], [0.58, -0.92], [0.57, -1.02], [0, -1.02]]), matCloth),
    skirt: mkAtlas(lathe([[0, 0.02], [0.5, 0], [0.56, -0.2], [0.68, -0.5], [0.86, -0.8], [1, -1], [0.96, -1.02], [0, -1.02]]), matCloth),
    pelvis: mk(new THREE.SphereGeometry(1, lite ? 8 : 10, lite ? 5 : 7)), neck: mk(seg),
    bun: mk(new THREE.SphereGeometry(1, 6, 5)),
    cone: mk(new THREE.ConeGeometry(1, 1, 12)), cap: mk(new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2)), top: mk(new THREE.CylinderGeometry(0.72, 0.8, 1, 10)), brim: mk(new THREE.CylinderGeometry(1, 1, 1, 10)),
    queue: mk(seg), chest: mk(box), pole: mk(box), basket: mk(new THREE.CylinderGeometry(1, 0.8, 1, 8), N * 2), prop: mk(box),
    blob: mk(new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2), N, new THREE.MeshBasicMaterial({ color: 0x1a1612, transparent: true, opacity: 0.26, depthWrite: false }), false),
  };
  M.headFar = mkAtlas(headGeo(...HEAD_FAR), matFace);
  const headNear = lite ? null : mkAtlas(headGeo(...HEAD_NEAR), matFace);   // 细的那档每帧只装离镜头近的人（count 跟着变），远处的人不为它多画三角面；手机只用粗的
  let nNear = 0;
  const PAIR = new Set(['thigh', 'shin', 'foot', 'upper', 'fore', 'hand', 'basket']);
  const col = (im, i, c, k = 1) => im.setColorAt(i, _c.set(c).multiplyScalar(k));
  sim.agents.forEach((a, i) => {
    const L = a.look, bare = a.kind === 'coolie' || a.kind === 'hawker' || a.kind === 'boatwoman';
    for (const j of [0, 1]) {
      col(M.thigh, i * 2 + j, L.bottom, j ? 0.94 : 1); col(M.shin, i * 2 + j, L.bottom, j ? 0.9 : 0.96); col(M.foot, i * 2 + j, bare ? L.skin : '#1c1a18', 0.9);
      col(M.upper, i * 2 + j, L.gown || L.top, 0.95); col(M.fore, i * 2 + j, L.gown || L.top, 0.92); col(M.hand, i * 2 + j, L.skin);
      col(M.basket, i * 2 + j, j ? '#a88c58' : '#b59a62');
    }
    // 胯和裤腿同色，看上去是一条裤子
    col(M.pelvis, i, L.gown || L.bottom, 0.98);
    col(M.neck, i, L.skin, 0.9);
    skin(M.torso, i, L.cloth, 1, L.gown && a.kind !== 'merchant' ? L.gown : L.top); skin(M.skirt, i, L.cloth, 0, L.gown || L.top); skin(M.headFar, i, L.face, 0, L.skin);
    col(M.bun, i, L.hair || '#17140f'); col(M.queue, i, L.face === 2 ? L.hair : '#17140f');
    col(M.cone, i, L.hatColor); col(M.cap, i, L.hatColor); col(M.top, i, L.hatColor); col(M.brim, i, L.hat === 'official' ? '#b23a2e' : L.hatColor, L.hat === 'straw' || L.hat === 'official' ? 1 : 0.9);
    col(M.chest, i, '#c9a86c'); col(M.pole, i, '#8a7152'); col(M.prop, i, L.propColor || '#c9a24a');
  });
  for (const k in M) if (M[k].instanceColor) M[k].instanceColor.needsUpdate = true;
  // 每人十三个姿势参数：两臂（抬、弯、外摆）、前倾、两腿（摆、弯）、身高起伏、走路的比重；换动作时逐帧向目标靠
  const NP = 13, sm = new Float32Array(N * NP), tg = new Float32Array(NP), seen = new Uint8Array(N);
  let lastT = -1;

  const put = (im, idx, x, y, z, q, sx, sy, sz) => { _loc.compose(_p.set(x, y, z), q, _s.set(sx, sy, sz)); _out.multiplyMatrices(_root, _loc); im.setMatrixAt(idx, _out); };
  const hide = (im, idx) => im.setMatrixAt(idx, ZERO);
  // 两段肢体：根部转 a（绕 x）并外摆 sp（绕 z），关节再弯 b；返回末端位置在 _end、末段朝向在 _q2
  function limb(imA, imB, idx, px, py, pz, a, sp, b, l1, l2, d1, d2) {
    _e.set(a, 0, sp, 'ZXY'); _q.setFromEuler(_e);
    put(imA, idx, px, py, pz, _q, d1, l1, d1);
    _mid.copy(DOWN).multiplyScalar(l1).applyQuaternion(_q); _mid.x += px; _mid.y += py; _mid.z += pz;
    _e.set(b, 0, 0); _qb.setFromEuler(_e); _q2.copy(_q).multiply(_qb);
    put(imB, idx, _mid.x, _mid.y, _mid.z, _q2, d2, l2, d2);
    _end.copy(DOWN).multiplyScalar(l2).applyQuaternion(_q2).add(_mid);
  }

  function update(t, cam) {
    const dt = lastT < 0 ? 0 : Math.min(0.1, Math.max(0, t - lastT)); lastT = t;
    const kp = 1 - Math.exp(-dt * POSE_RATE), kw = 1 - Math.exp(-dt * 7);
    nNear = 0;
    for (let i = 0; i < N; i++) {
      const a = sim.agents[i], w = agentWorld(sim, a), L = a.look;
      if (w.hidden) { seen[i] = 0; for (const k in M) { if (PAIR.has(k)) { hide(M[k], i * 2); hide(M[k], i * 2 + 1); } else hide(M[k], i); } continue; }
      const pose = a.pose, ph = a.pose === 'bear' ? t * 1.25 * PHASE_PER_M + i : a.phase, sw = Math.sin(ph), cw = Math.cos(ph);
      const walking = pose === 'walk' || pose === 'carry' || pose === 'pole' || pose === 'bear';
      const gown = !!L.gown, idle = Math.sin(t * 1.3 + i * 1.7);
      let tA = 0, tB = 0, kA = 0.04, kB = 0.04, uA = 0.06 * idle, uB = -0.06 * idle, eA = -0.18, eB = -0.18, sA = 0.1, sB = 0.1, y = 0, lean = 0;
      if (walking) { uA = cw * 0.42; uB = -cw * 0.42; eA = -0.3 - 0.2 * Math.max(0, -cw); eB = -0.3 - 0.2 * Math.max(0, cw); lean = 0.05; }
      if (gown && (pose === 'stand' || (pose === 'walk' && i % 3 === 0))) { uA = uB = -0.42; eA = eB = -1.5; sA = sB = -0.3; }     // 袖手
      if (pose === 'carry' || pose === 'carry-stand') { uA = -2.5; eA = -0.75; sA = 0.25; lean += 0.05; }
      if (pose === 'pole' || pose === 'pole-stand') { uA = -1.25; eA = -1.5; sA = 0.05; if (walking) uB = sw * 0.25; }   // 挑担：歇脚时手也扶着扁担
      if (pose === 'bear') { uA = uB = -0.2; eA = eB = -0.25; sA = sB = 0.32; lean = 0.08; }
      if (pose === 'talk') { uA = -0.75 + 0.3 * Math.sin(t * 2.1 + i); eA = -1.1 + 0.4 * Math.sin(t * 2.7 + i * 2); uB = -0.2; eB = -0.5; }
      if (pose === 'wave') { uA = -2.7 + 0.25 * Math.sin(t * 5 + i); eA = -0.5 - 0.4 * Math.sin(t * 5 + i); sA = 0.4; uB = -0.5; eB = -0.9; }
      if (pose === 'write') { uA = -0.75; eA = -1.25 + 0.05 * Math.sin(t * 7); uB = -0.7; eB = -1.3; sA = sB = -0.15; lean = 0.14; }
      if (pose === 'paint') { uA = -1.25 + 0.12 * Math.sin(t * 2.6); eA = -0.4 + 0.2 * Math.sin(t * 3.4); uB = -0.3; eB = -0.9; }
      if (pose === 'shave') { uA = -1.5 + 0.1 * Math.sin(t * 4); eA = -0.9; uB = -1.35; eB = -1.0; sA = sB = -0.1; lean = 0.12; }
      if (pose === 'hand') { uA = uB = -1.15; eA = eB = -0.35; sA = sB = -0.1; lean = 0.3; kA = kB = 0.35; tA = tB = -0.25; }
      if (pose === 'catch') { uA = uB = -1.7 + 0.5 * Math.sin(t * 9); eA = eB = -0.5; sA = sB = -0.08; lean = 0.2; }
      if (pose === 'ready') { uA = uB = -0.5; eA = eB = -1.0; }
      if (pose === 'weigh') { uA = -2.5 + 0.08 * idle; eA = -0.4; uB = -2.3; eB = -0.5; }
      if (pose === 'scull') { const s = Math.sin(t * 2.2 + i); uA = -1.0 + 0.4 * s; uB = -0.9 + 0.4 * s; eA = eB = -0.7 + 0.3 * s; sA = sB = -0.12; lean = 0.14 + 0.12 * s; tA = 0.25; tB = -0.2; kA = 0.3; kB = 0.1; }
      if (pose === 'sit') { tA = tB = -1.5; kA = kB = 1.45; y = -0.42; uA = uB = -0.5; eA = eB = -0.9; sA = sB = -0.05; }
      // 过渡：手臂、前倾和站坐姿势的腿逐帧向目标靠；刚出现的人直接取目标值，不从零滑过来
      tg[0] = uA; tg[1] = uB; tg[2] = eA; tg[3] = eB; tg[4] = sA; tg[5] = sB; tg[6] = lean; tg[7] = tA; tg[8] = tB; tg[9] = kA; tg[10] = kB; tg[11] = y; tg[12] = walking ? 1 : 0;
      const o = i * NP;
      if (!seen[i]) { for (let k = 0; k < NP; k++) sm[o + k] = tg[k]; seen[i] = 1; }
      else { for (let k = 0; k < 12; k++) sm[o + k] += (tg[k] - sm[o + k]) * kp; sm[o + 12] += (tg[12] - sm[o + 12]) * kw; if (Math.abs(tg[12] - sm[o + 12]) < 0.004) sm[o + 12] = tg[12]; }
      uA = sm[o]; uB = sm[o + 1]; eA = sm[o + 2]; eB = sm[o + 3]; sA = sm[o + 4]; sB = sm[o + 5]; lean = sm[o + 6]; tA = sm[o + 7]; tB = sm[o + 8]; kA = sm[o + 9]; kB = sm[o + 10]; y = sm[o + 11];
      const wk = sm[o + 12];
      if (wk > 0) {
        // 腿：脚的位置由步态给出（着地时钉在地上），再反解出大腿和膝盖的角度，所以不会打滑。
        // 走着的时候腿不做平滑（一平滑脚就滑）；只在起步、停步的零点几秒里和站姿混一下
        const st = GAIT.cycle / 2 / a.scale, gy = gaitY(ph, st);
        const fa = footAt(ph, 0, st), fb = footAt(ph, 1, st);
        const ia = legIK(fa.f, GAIT.hip + gy - GAIT.ankle - fa.lift), ib = legIK(fb.f, GAIT.hip + gy - GAIT.ankle - fb.lift);
        tA += (ia.a - tA) * wk; kA += (ia.b - kA) * wk; tB += (ib.a - tB) * wk; kB += (ib.b - kB) * wk; y += (gy - y) * wk;
      }
      const sc = a.scale;
      _e.set(lean, w.h, 0, 'YXZ'); _qy.setFromEuler(_e);
      _root.compose(_p.set(w.x, w.y + y * sc, w.z), _qy, _s.set(sc, sc, sc));
      const girth = a.girth || 1;
      // 腿与脚
      for (const j of [0, 1]) {
        limb(M.thigh, M.shin, i * 2 + j, j ? -0.085 : 0.085, GAIT.hip, 0, j ? tB : tA, 0, j ? kB : kA, GAIT.thigh, GAIT.shin, 0.16, 0.125);
        if (gown && pose !== 'sit') { hide(M.thigh, i * 2 + j); hide(M.shin, i * 2 + j); }   // 长袍底下只露出脚，腿不从袍子前面穿出来
        put(M.foot, i * 2 + j, _end.x, Math.max(0.035 - y, _end.y - 0.015), _end.z + 0.06, pose === 'sit' ? _q2 : ID, 0.095, 0.07, 0.24);
      }
      // 躯干与下摆
      put(M.torso, i, 0, 1.125, 0, ID, 0.4 * girth, 0.335, 0.25 * girth);   // 上衣下摆盖过胯，腿从下摆里出来
      put(M.pelvis, i, 0, 0.86, 0, ID, 0.16 * girth, 0.1, 0.092 * girth);   // 胯：把躯干和两条腿接起来
      if (gown) { _e.set(pose === 'sit' ? -0.9 : walking ? 0.03 : 0, 0, 0); _q.setFromEuler(_e); put(M.skirt, i, 0, 1.02, 0, _q, 0.37 * girth, pose === 'sit' ? 0.6 : 0.84, 0.31 * girth); }
      else hide(M.skirt, i);
      // 手臂与手
      const slv = gown ? 1.5 : 1;
      for (const j of [0, 1]) {
        limb(M.upper, M.fore, i * 2 + j, j ? -0.235 : 0.235, 1.4, 0, j ? uB : uA, (j ? -1 : 1) * (j ? sB : sA), j ? eB : eA, 0.28, 0.26, 0.12 * slv, 0.1 * slv);
        put(M.hand, i * 2 + j, _end.x, _end.y, _end.z, ID, 0.045, 0.055, 0.045);
      }
      // 头、头发、眼睛
      put(M.neck, i, 0, 1.5, 0, ID, 0.1, 0.07, 0.1);
      // 头：近处用细的那档（有鼻梁眉弓），远处用粗的；站着的人头会慢慢左右看
      const near = !lite && cam && (w.x - cam.x) * (w.x - cam.x) + (w.z - cam.z) * (w.z - cam.z) < NEAR2;
      _e.set(walking ? 0 : 0.03 * Math.sin(t * 0.7 + i), walking ? 0 : 0.16 * Math.sin(t * 0.37 + i * 2.3), 0); _q.setFromEuler(_e);
      if (near) { put(headNear, nNear, 0, 1.585, 0.008, _q, 0.1, 0.128, 0.112); headNear.cell.setXY(nNear, L.face, 0); headNear.tint.setXYZ(nNear, M.headFar.tint.getX(i), M.headFar.tint.getY(i), M.headFar.tint.getZ(i)); nNear++; hide(M.headFar, i); }
      else put(M.headFar, i, 0, 1.585, 0.008, _q, 0.1, 0.128, 0.112);
      const hair = L.hairStyle;
      if (hair === 'bun') put(M.bun, i, 0, 1.685, -0.075, ID, 0.055, 0.05, 0.055); else hide(M.bun, i);
      if (L.queue) { _e.set(0.1 + (walking ? sw * 0.07 : 0), 0, 0); _q.setFromEuler(_e); put(M.queue, i, 0, 1.56, -0.11, _q, 0.045, 0.62, 0.045); } else hide(M.queue, i);
      // 帽
      const hat = L.hat;
      if (hat === 'cone' || hat === 'straw' || hat === 'official') put(M.cone, i, 0, hat === 'straw' ? 1.74 : 1.77, 0, ID, hat === 'cone' ? 0.34 : 0.25, hat === 'cone' ? 0.17 : hat === 'official' ? 0.14 : 0.1, hat === 'cone' ? 0.34 : 0.25); else hide(M.cone, i);
      if (hat === 'cap' || hat === 'scarf') put(M.cap, i, 0, 1.635, 0.004, ID, 0.111, hat === 'scarf' ? 0.14 : 0.1, 0.123); else hide(M.cap, i);
      if (hat === 'top') { put(M.top, i, 0, 1.8, 0, ID, 0.125, 0.21, 0.125); put(M.brim, i, 0, 1.695, 0, ID, 0.18, 0.022, 0.18); }
      else { hide(M.top, i); if (hat === 'straw') put(M.brim, i, 0, 1.7, 0, ID, 0.27, 0.02, 0.27); else if (hat === 'official') put(M.brim, i, 0, 1.86, 0, ID, 0.035, 0.07, 0.035); else if (hat === 'cap') put(M.brim, i, 0, 1.74, 0, ID, 0.02, 0.028, 0.02); else hide(M.brim, i); }
      // 手里的东西
      if (a.carry === 'chest') put(M.chest, i, 0.23, 1.68, 0.02, ID, 0.56, 0.46, 0.46); else hide(M.chest, i);
      if (a.carry === 'pole') {
        put(M.pole, i, 0.17, 1.47, 0, ID, 0.04, 0.04, 2.1);
        const bob = walking ? Math.sin(a.phase * 2) * 0.04 : 0;
        put(M.basket, i * 2, 0.17, 0.62 + bob, 0.98, ID, 0.24, 0.26, 0.24); put(M.basket, i * 2 + 1, 0.17, 0.62 - bob, -0.98, ID, 0.24, 0.26, 0.24);
      } else { hide(M.pole, i); hide(M.basket, i * 2); hide(M.basket, i * 2 + 1); }
      const pr = L.prop;
      if (pr === 'staff') put(M.prop, i, 0.36, 0.85, 0.16, ID, 0.035, 1.7, 0.035);
      else if (pr === 'book') put(M.prop, i, 0, 1.12, 0.3, ID, 0.22, 0.03, 0.16);
      else hide(M.prop, i);
      if (a.boat < 0 || sim.boats[a.boat].land) { _out.makeScale(0.36 * sc, 1, 0.36 * sc); _out.setPosition(w.x, w.y + 0.03, w.z); M.blob.setMatrixAt(i, _out); } else hide(M.blob, i);
    }
    for (const k in M) M[k].instanceMatrix.needsUpdate = true;
    if (headNear) { headNear.count = nNear; headNear.instanceMatrix.needsUpdate = true; headNear.cell.needsUpdate = true; headNear.tint.needsUpdate = true; }
  }
  M.blob.visible = !opts.shadows;
  // 验收用：哪些部件还停在默认的纯白（说明漏了上色）
  // 圆片影用的是纯黑材质，不看它；用图集的部件看的是染色属性
  const uncoloured = () => Object.keys(M).filter(k => { const c = (M[k].tint || M[k].instanceColor).array; return k !== 'blob' && c[0] === 1 && c[1] === 1 && c[2] === 1; });
  // 验收用：实际用到了几种脸、几种衣型
  const variety = () => ({ faces: new Set(sim.agents.map(a => a.look.face)).size, cloth: new Set(sim.agents.map(a => a.look.cloth)).size, atlas: [faces.canvas.width, faces.canvas.height, cloth.canvas.width, cloth.canvas.height] });
  return { update, meshes: M, headNear, uncoloured, variety: () => ({ ...variety(), near: nNear }), atlases: { faces, cloth } };
}
