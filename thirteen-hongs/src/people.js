// 人物：圆润的躯干、会弯的手肘和膝盖、头发辫子眼睛。全体共用二十来个 InstancedMesh。
import * as THREE from 'three';
import { agentWorld } from './core.js';

const _root = new THREE.Matrix4(), _loc = new THREE.Matrix4(), _out = new THREE.Matrix4();
const _p = new THREE.Vector3(), _o = new THREE.Vector3(), _s = new THREE.Vector3(), _mid = new THREE.Vector3(), _end = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qy = new THREE.Quaternion(), _e = new THREE.Euler(), _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0), ID = new THREE.Quaternion();
const DOWN = new THREE.Vector3(0, -1, 0);

export function createPeople(scene, sim, opts = {}) {
  const N = sim.agents.length;
  const mat = new THREE.MeshLambertMaterial();
  const seg = new THREE.CylinderGeometry(0.5, 0.4, 1, 8).translate(0, -0.5, 0);          // 肢段：顶端在原点，向下一个单位
  const box = new THREE.BoxGeometry(1, 1, 1);
  const mk = (geo, n = N, m = mat, shadow = true) => {
    const im = new THREE.InstancedMesh(geo, m, n); im.frustumCulled = false; im.castShadow = shadow && !!opts.shadows;
    for (let i = 0; i < n; i++) { im.setMatrixAt(i, ZERO); im.setColorAt(i, _c.set('#fff')); }
    scene.add(im); return im;
  };
  const M = {
    thigh: mk(seg, N * 2), shin: mk(seg, N * 2), foot: mk(box, N * 2),
    upper: mk(seg, N * 2), fore: mk(seg, N * 2), hand: mk(new THREE.SphereGeometry(1, 6, 5), N * 2),
    torso: mk(new THREE.CapsuleGeometry(0.5, 1, 3, 10)), skirt: mk(new THREE.CylinderGeometry(0.55, 1, 1, 10).translate(0, -0.5, 0)),
    head: mk(new THREE.SphereGeometry(1, 10, 8)), hair: mk(new THREE.SphereGeometry(1.07, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.56)),
    eye: mk(new THREE.SphereGeometry(1, 5, 4), N * 2, mat, false), bun: mk(new THREE.SphereGeometry(1, 6, 5)),
    cone: mk(new THREE.ConeGeometry(1, 1, 12)), cap: mk(new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2)), top: mk(new THREE.CylinderGeometry(0.72, 0.8, 1, 10)), brim: mk(new THREE.CylinderGeometry(1, 1, 1, 10)),
    queue: mk(seg), chest: mk(box), pole: mk(box), basket: mk(new THREE.CylinderGeometry(1, 0.8, 1, 8), N * 2), prop: mk(box),
    blob: mk(new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2), N, new THREE.MeshBasicMaterial({ color: 0x1a1612, transparent: true, opacity: 0.26, depthWrite: false }), false),
  };
  const PAIR = new Set(['thigh', 'shin', 'foot', 'upper', 'fore', 'hand', 'eye', 'basket']);
  const col = (im, i, c, k = 1) => im.setColorAt(i, _c.set(c).multiplyScalar(k));
  sim.agents.forEach((a, i) => {
    const L = a.look, bare = a.kind === 'coolie' || a.kind === 'hawker' || a.kind === 'boatwoman';
    for (const j of [0, 1]) {
      col(M.thigh, i * 2 + j, L.bottom, j ? 0.94 : 1); col(M.shin, i * 2 + j, bare && i % 3 ? L.skin : L.bottom, j ? 0.94 : 1); col(M.foot, i * 2 + j, bare ? L.skin : '#1c1a18', 0.9);
      col(M.upper, i * 2 + j, L.gown || L.top, 0.95); col(M.fore, i * 2 + j, bare && i % 2 ? L.skin : (L.gown || L.top), 0.92); col(M.hand, i * 2 + j, L.skin);
      col(M.eye, i * 2 + j, '#1a1512'); col(M.basket, i * 2 + j, j ? '#a88c58' : '#b59a62');
    }
    col(M.torso, i, L.gown && a.kind !== 'merchant' ? L.gown : L.top); col(M.skirt, i, L.gown || L.top); col(M.head, i, L.skin);
    col(M.hair, i, L.hair || '#17140f'); col(M.bun, i, L.hair || '#17140f'); col(M.queue, i, '#17140f');
    col(M.cone, i, L.hatColor); col(M.cap, i, L.hatColor); col(M.top, i, L.hatColor); col(M.brim, i, L.hat === 'official' ? '#b23a2e' : L.hatColor, L.hat === 'straw' || L.hat === 'official' ? 1 : 0.9);
    col(M.chest, i, '#c9a86c'); col(M.pole, i, '#8a7152'); col(M.prop, i, L.propColor || '#c9a24a');
  });
  for (const k in M) if (M[k].instanceColor) M[k].instanceColor.needsUpdate = true;

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

  function update(t) {
    for (let i = 0; i < N; i++) {
      const a = sim.agents[i], w = agentWorld(sim, a), L = a.look;
      if (w.hidden) { for (const k in M) { if (PAIR.has(k)) { hide(M[k], i * 2); hide(M[k], i * 2 + 1); } else hide(M[k], i); } continue; }
      const pose = a.pose, ph = a.pose === 'bear' ? t * 4.6 + i : a.phase, sw = Math.sin(ph), cw = Math.cos(ph);
      const walking = pose === 'walk' || pose === 'carry' || pose === 'pole' || pose === 'bear';
      const gown = !!L.gown, idle = Math.sin(t * 1.3 + i * 1.7);
      let tA = 0, tB = 0, kA = 0.04, kB = 0.04, uA = 0.06 * idle, uB = -0.06 * idle, eA = -0.18, eB = -0.18, sA = 0.1, sB = 0.1, y = 0, lean = 0;
      if (walking) {
        const st = gown ? 0.4 : 0.6;
        tA = sw * st; tB = -sw * st; kA = 0.1 + 0.75 * Math.max(0, cw); kB = 0.1 + 0.75 * Math.max(0, -cw);
        uA = -sw * 0.5; uB = sw * 0.5; eA = -0.35 - 0.25 * Math.max(0, -sw); eB = -0.35 - 0.25 * Math.max(0, sw); y = Math.abs(cw) * 0.03 - 0.015; lean = 0.06;
      }
      if (gown && (pose === 'stand' || (pose === 'walk' && i % 3 === 0))) { uA = uB = -0.42; eA = eB = -1.5; sA = sB = -0.3; }     // 袖手
      if (pose === 'carry' || pose === 'carry-stand') { uA = -2.5; eA = -0.75; sA = 0.25; lean += 0.05; }
      if (pose === 'pole') { uA = -1.25; eA = -1.5; sA = 0.05; uB = sw * 0.25; }
      if (pose === 'bear') { uA = uB = -0.2; eA = eB = -0.25; sA = sB = 0.32; lean = 0.08; }
      if (pose === 'talk') { uA = -0.75 + 0.3 * Math.sin(t * 2.1 + i); eA = -1.1 + 0.4 * Math.sin(t * 2.7 + i * 2); uB = -0.2; eB = -0.5; }
      if (pose === 'wave') { uA = -2.7 + 0.25 * Math.sin(t * 5 + i); eA = -0.5 - 0.4 * Math.sin(t * 5 + i); sA = 0.4; uB = -0.5; eB = -0.9; }
      if (pose === 'write') { uA = -0.75; eA = -1.25 + 0.05 * Math.sin(t * 7); uB = -0.7; eB = -1.3; sA = sB = -0.15; lean = 0.14; }
      if (pose === 'paint') { uA = -1.25 + 0.12 * Math.sin(t * 2.6); eA = -0.4 + 0.2 * Math.sin(t * 3.4); uB = -0.3; eB = -0.9; }
      if (pose === 'shave') { uA = -1.5 + 0.1 * Math.sin(t * 4); eA = -0.9; uB = -1.35; eB = -1.0; sA = sB = -0.1; lean = 0.12; }
      if (pose === 'weigh') { uA = -2.5 + 0.08 * idle; eA = -0.4; uB = -2.3; eB = -0.5; }
      if (pose === 'scull') { const s = Math.sin(t * 2.2 + i); uA = -1.0 + 0.4 * s; uB = -0.9 + 0.4 * s; eA = eB = -0.7 + 0.3 * s; sA = sB = -0.12; lean = 0.14 + 0.12 * s; tA = 0.25; tB = -0.2; kA = 0.3; kB = 0.1; }
      if (pose === 'sit') { tA = tB = -1.5; kA = kB = 1.45; y = -0.42; uA = uB = -0.5; eA = eB = -0.9; sA = sB = -0.05; }
      const sc = a.scale;
      _e.set(lean, w.h, 0, 'YXZ'); _qy.setFromEuler(_e);
      _root.compose(_p.set(w.x, w.y + y * sc, w.z), _qy, _s.set(sc, sc, sc));
      const girth = a.girth || 1;
      // 腿与脚
      for (const j of [0, 1]) {
        const sx = j ? -0.1 : 0.1;
        limb(M.thigh, M.shin, i * 2 + j, sx, 0.88, 0, j ? tB : tA, 0, j ? kB : kA, 0.43, 0.42, 0.17, 0.13);
        put(M.foot, i * 2 + j, _end.x, Math.max(0.035 - y, _end.y + 0.02), _end.z + 0.06, _q2, 0.095, 0.07, 0.24);
      }
      // 躯干与下摆
      put(M.torso, i, 0, 1.15, 0, ID, 0.4 * girth, 0.3, 0.25 * girth);
      if (gown) { _e.set(pose === 'sit' ? -0.9 : walking ? 0.03 : 0, 0, 0); _q.setFromEuler(_e); put(M.skirt, i, 0, 1.02, 0, _q, 0.37 * girth, pose === 'sit' ? 0.6 : 0.84, 0.31 * girth); }
      else put(M.skirt, i, 0, 0.98, 0, ID, 0.4 * girth, 0.2, 0.27 * girth);
      // 手臂与手
      const slv = gown ? 1.5 : 1;
      for (const j of [0, 1]) {
        limb(M.upper, M.fore, i * 2 + j, j ? -0.235 : 0.235, 1.4, 0, j ? uB : uA, (j ? -1 : 1) * (j ? sB : sA), j ? eB : eA, 0.28, 0.26, 0.12 * slv, 0.1 * slv);
        put(M.hand, i * 2 + j, _end.x, _end.y, _end.z, ID, 0.045, 0.055, 0.045);
      }
      // 头、头发、眼睛
      put(M.head, i, 0, 1.585, 0.01, ID, 0.115, 0.135, 0.125);
      const hair = L.hairStyle;
      if (hair !== 'none') { _e.set(hair === 'queue' ? -0.95 : -0.35, 0, 0); _q.setFromEuler(_e); put(M.hair, i, 0, 1.585, 0.01, _q, 0.115, 0.135, 0.125); } else hide(M.hair, i);
      if (hair === 'bun') put(M.bun, i, 0, 1.69, -0.08, ID, 0.06, 0.055, 0.06); else hide(M.bun, i);
      put(M.eye, i * 2, 0.045, 1.6, 0.118, ID, 0.014, 0.018, 0.012); put(M.eye, i * 2 + 1, -0.045, 1.6, 0.118, ID, 0.014, 0.018, 0.012);
      if (L.queue) { _e.set(0.1 + (walking ? sw * 0.07 : 0), 0, 0); _q.setFromEuler(_e); put(M.queue, i, 0, 1.56, -0.125, _q, 0.05, 0.62, 0.05); } else hide(M.queue, i);
      // 帽
      const hat = L.hat;
      if (hat === 'cone' || hat === 'straw' || hat === 'official') put(M.cone, i, 0, hat === 'straw' ? 1.74 : 1.77, 0, ID, hat === 'cone' ? 0.34 : 0.25, hat === 'cone' ? 0.17 : hat === 'official' ? 0.14 : 0.1, hat === 'cone' ? 0.34 : 0.25); else hide(M.cone, i);
      if (hat === 'cap' || hat === 'scarf') put(M.cap, i, 0, 1.635, 0.005, ID, 0.128, hat === 'scarf' ? 0.15 : 0.11, 0.136); else hide(M.cap, i);
      if (hat === 'top') { put(M.top, i, 0, 1.81, 0, ID, 0.14, 0.22, 0.14); put(M.brim, i, 0, 1.7, 0, ID, 0.2, 0.025, 0.2); }
      else { hide(M.top, i); if (hat === 'straw') put(M.brim, i, 0, 1.7, 0, ID, 0.27, 0.02, 0.27); else if (hat === 'official') put(M.brim, i, 0, 1.86, 0, ID, 0.035, 0.07, 0.035); else if (hat === 'cap') put(M.brim, i, 0, 1.75, 0, ID, 0.022, 0.03, 0.022); else hide(M.brim, i); }
      // 手里的东西
      if (a.carry === 'chest') put(M.chest, i, 0.23, 1.68, 0.02, ID, 0.56, 0.46, 0.46); else hide(M.chest, i);
      if (a.carry === 'pole') {
        put(M.pole, i, 0.17, 1.47, 0, ID, 0.04, 0.04, 2.1);
        const bob = walking ? Math.sin(a.phase * 2) * 0.04 : 0;
        put(M.basket, i * 2, 0.17, 0.62 + bob, 0.98, ID, 0.24, 0.26, 0.24); put(M.basket, i * 2 + 1, 0.17, 0.62 - bob, -0.98, ID, 0.24, 0.26, 0.24);
      } else { hide(M.pole, i); hide(M.basket, i * 2); hide(M.basket, i * 2 + 1); }
      const pr = L.prop;
      if (pr === 'badge') put(M.prop, i, 0, 1.22, 0.128 * girth, ID, 0.17, 0.17, 0.02);
      else if (pr === 'staff') put(M.prop, i, 0.36, 0.85, 0.16, ID, 0.035, 1.7, 0.035);
      else if (pr === 'book') put(M.prop, i, 0, 1.12, 0.3, ID, 0.22, 0.03, 0.16);
      else hide(M.prop, i);
      if (a.boat < 0 || sim.boats[a.boat].land) { _out.makeScale(0.36 * sc, 1, 0.36 * sc); _out.setPosition(w.x, w.y + 0.03, w.z); M.blob.setMatrixAt(i, _out); } else hide(M.blob, i);
    }
    for (const k in M) M[k].instanceMatrix.needsUpdate = true;
  }
  M.blob.visible = !opts.shadows;
  return { update, meshes: M };
}
