// 人物：每个人由十来个方块、球、锥拼成，全体共用十几个 InstancedMesh（十几次绘制画完所有人）。
import * as THREE from 'three';
import { agentWorld } from './core.js';

const _root = new THREE.Matrix4(), _loc = new THREE.Matrix4(), _out = new THREE.Matrix4();
const _p = new THREE.Vector3(), _o = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _qy = new THREE.Quaternion(), _e = new THREE.Euler(), _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);

export function createPeople(scene, sim) {
  const N = sim.agents.length;
  const mat = new THREE.MeshLambertMaterial();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const mk = (geo, n = N, m = mat) => { const im = new THREE.InstancedMesh(geo, m, n); im.frustumCulled = false; for (let i = 0; i < n; i++) { im.setMatrixAt(i, ZERO); im.setColorAt(i, _c.set('#fff')); } scene.add(im); return im; };
  const M = {
    leg: mk(box, N * 2), arm: mk(box, N * 2), torso: mk(box), gown: mk(box),
    head: mk(new THREE.SphereGeometry(1, 8, 6)),
    cone: mk(new THREE.ConeGeometry(1, 1, 10)), cap: mk(new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2)), top: mk(new THREE.CylinderGeometry(0.72, 0.8, 1, 10)), brim: mk(new THREE.CylinderGeometry(1, 1, 1, 10)),
    queue: mk(box), chest: mk(box), pole: mk(box), basket: mk(new THREE.CylinderGeometry(1, 0.8, 1, 8), N * 2),
    blob: mk(new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2), N, new THREE.MeshBasicMaterial({ color: 0x1a1612, transparent: true, opacity: 0.26, depthWrite: false })),
  };
  const col = (im, i, c, k = 1) => im.setColorAt(i, _c.set(c).multiplyScalar(k));
  sim.agents.forEach((a, i) => {
    const L = a.look;
    col(M.leg, i * 2, L.bottom); col(M.leg, i * 2 + 1, L.bottom, 0.92); col(M.arm, i * 2, L.top, 0.94); col(M.arm, i * 2 + 1, L.top, 0.94);
    col(M.torso, i, L.top); col(M.gown, i, L.gown || '#000'); col(M.head, i, L.skin);
    col(M.cone, i, L.hatColor); col(M.cap, i, L.hatColor); col(M.top, i, L.hatColor); col(M.brim, i, L.hatColor, L.hat === 'straw' ? 1 : 0.9);
    col(M.queue, i, '#17140f'); col(M.chest, i, '#c9a86c'); col(M.pole, i, '#8a7152'); col(M.basket, i * 2, '#b59a62'); col(M.basket, i * 2 + 1, '#a88c58');
  });
  for (const k in M) if (M[k].instanceColor) M[k].instanceColor.needsUpdate = true;

  // local = T(pivot) · Rx(rx) · T(offset) · S(size)
  function part(im, idx, px, py, pz, rx, ox, oy, oz, sx, sy, sz, rz = 0) {
    _e.set(rx, 0, rz); _q.setFromEuler(_e);
    _o.set(ox, oy, oz).applyQuaternion(_q); _p.set(px + _o.x, py + _o.y, pz + _o.z);
    _loc.compose(_p, _q, _s.set(sx, sy, sz));
    _out.multiplyMatrices(_root, _loc); im.setMatrixAt(idx, _out);
  }
  const hide = (im, idx) => im.setMatrixAt(idx, ZERO);

  function update(t) {
    for (let i = 0; i < N; i++) {
      const a = sim.agents[i], w = agentWorld(sim, a), L = a.look;
      if (w.hidden) { for (const k in M) { hide(M[k], k === 'leg' || k === 'arm' || k === 'basket' ? i * 2 : i); if (k === 'leg' || k === 'arm' || k === 'basket') hide(M[k], i * 2 + 1); } continue; }
      const pose = a.pose, sw = Math.sin(a.phase), walking = pose === 'walk' || pose === 'carry' || pose === 'pole';
      let legA = 0, legB = 0, armA = 0, armB = 0, y = 0, lean = 0, armZ = 0;
      const idle = Math.sin(t * 1.3 + i * 1.7);
      if (walking) { legA = sw * 0.62; legB = -sw * 0.62; armA = -sw * (L.gown ? 0.25 : 0.5); armB = sw * (L.gown ? 0.25 : 0.5); y = Math.abs(Math.cos(a.phase)) * 0.035; lean = 0.05; }
      if (pose === 'carry' || pose === 'carry-stand') { armA = -2.75; lean += 0.06; }
      if (pose === 'pole') { armA = -1.1; armB = 0.25; }
      if (pose === 'stand') { armA = idle * 0.05; armB = -idle * 0.05; }
      if (pose === 'talk') { armA = -0.7 + 0.45 * Math.sin(t * 2.1 + i); armB = -0.15 + 0.1 * idle; }
      if (pose === 'wave') { armA = -2.5 + 0.5 * Math.sin(t * 5 + i); armB = -0.4; }
      if (pose === 'write') { armA = -1.15 + 0.06 * Math.sin(t * 6); armB = -1.0; lean = 0.12; }
      if (pose === 'paint') { armA = -1.3 + 0.18 * Math.sin(t * 2.6); armB = -0.3; }
      if (pose === 'shave') { armA = -1.5 + 0.12 * Math.sin(t * 4); armB = -1.35; lean = 0.1; }
      if (pose === 'weigh') { armA = -2.2 + 0.1 * idle; armB = -2.0; }
      if (pose === 'scull') { const s = Math.sin(t * 2.2 + i); armA = -1.15 + 0.4 * s; armB = -1.0 + 0.4 * s; lean = 0.12 + 0.1 * s; legA = 0.2; legB = -0.2; }
      if (pose === 'sit') { legA = legB = -1.45; y = -0.4; armA = armB = -0.45; }
      const sc = a.scale;
      _e.set(lean, w.h, 0, 'YXZ'); _qy.setFromEuler(_e);
      _root.compose(_p.set(w.x, w.y + y * sc, w.z), _qy, _s.set(sc, sc, sc));
      const gown = !!L.gown, sh = 1.38;
      part(M.leg, i * 2, 0.1, 0.84, 0, legA, 0, -0.42, 0, 0.15, 0.84, 0.17);
      part(M.leg, i * 2 + 1, -0.1, 0.84, 0, legB, 0, -0.42, 0, 0.15, 0.84, 0.17);
      part(M.torso, i, 0, 0.82, 0, 0, 0, 0.31, 0, 0.44, 0.64, 0.25);
      if (gown) part(M.gown, i, 0, 0.98, 0, pose === 'sit' ? -0.7 : 0, 0, -0.4, 0, 0.48, 0.82, 0.3); else hide(M.gown, i);
      part(M.arm, i * 2, 0.28, sh, 0, armA, 0, -0.29, 0, 0.11, 0.6, 0.12, armZ);
      part(M.arm, i * 2 + 1, -0.28, sh, 0, armB, 0, -0.29, 0, 0.11, 0.6, 0.12);
      part(M.head, i, 0, 1.6, 0.01, 0, 0, 0, 0, 0.125, 0.14, 0.13);
      const hat = L.hat;
      if (hat === 'cone' || hat === 'straw') part(M.cone, i, 0, 1.69, 0, 0, 0, 0.07, 0, hat === 'straw' ? 0.25 : 0.33, hat === 'straw' ? 0.1 : 0.17, hat === 'straw' ? 0.25 : 0.33); else hide(M.cone, i);
      if (hat === 'cap' || hat === 'scarf') part(M.cap, i, 0, 1.63, 0, 0, 0, 0, 0, 0.135, hat === 'scarf' ? 0.15 : 0.12, 0.14); else hide(M.cap, i);
      if (hat === 'top') { part(M.top, i, 0, 1.7, 0, 0, 0, 0.11, 0, 0.14, 0.22, 0.14); part(M.brim, i, 0, 1.7, 0, 0, 0, 0, 0, 0.2, 0.025, 0.2); } else { hide(M.top, i); if (hat === 'straw') part(M.brim, i, 0, 1.7, 0, 0, 0, 0, 0, 0.27, 0.02, 0.27); else hide(M.brim, i); }
      if (L.queue) part(M.queue, i, 0, 1.56, -0.13, 0.12 + (walking ? sw * 0.08 : 0), 0, -0.3, 0, 0.05, 0.6, 0.05); else hide(M.queue, i);
      if (a.carry === 'chest') part(M.chest, i, 0.2, 1.52, 0.02, 0, 0, 0.24, 0, 0.56, 0.46, 0.46); else hide(M.chest, i);
      if (a.carry === 'pole') {
        part(M.pole, i, 0.16, 1.46, 0, 0, 0, 0, 0, 0.04, 0.04, 2.1);
        const bob = walking ? Math.sin(a.phase * 2) * 0.04 : 0;
        part(M.basket, i * 2, 0.16, 0.62 + bob, 0.98, 0, 0, 0, 0, 0.24, 0.26, 0.24); part(M.basket, i * 2 + 1, 0.16, 0.62 - bob, -0.98, 0, 0, 0, 0, 0.24, 0.26, 0.24);
      } else { hide(M.pole, i); hide(M.basket, i * 2); hide(M.basket, i * 2 + 1); }
      if (a.boat < 0) { _out.makeScale(0.34 * sc, 1, 0.34 * sc); _out.setPosition(w.x, w.y + 0.03, w.z); M.blob.setMatrixAt(i, _out); } else hide(M.blob, i);
    }
    for (const k in M) M[k].instanceMatrix.needsUpdate = true;
  }
  let tris = 0; for (const k in M) { const g = M[k].geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3 * M[k].count; }
  return { update, meshes: M, tris };
}
