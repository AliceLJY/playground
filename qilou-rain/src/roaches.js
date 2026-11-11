// 骑楼雨夜 · 蟑螂的样子与姿势。全部用实例化网格画（几十只合成几次绘制），三足步态脚钉在地上，翻肚、扑翅、起身都在这里摆。
// 外形依据美洲大蠊：红褐油亮、前胸背板淡黄边加两块深斑、长触角、后足最长；步态分组（左前-右中-左后 / 右前-左中-右后）同 gz-roach/src/model.js。
import * as THREE from 'three';
import { TYPES } from './core.js';

const MAX = 30, RODS = 18;
const _m = new THREE.Matrix4(), _mb = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _k = new THREE.Vector3(), _d = new THREE.Vector3(), _n = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _c = new THREE.Color(), _hc = new THREE.Color(1.6, 1.9, 1.3);
const smooth = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

const LEGS = [
  { side: -1, hip: [-0.18, 0.2, -0.38], rest: [-0.44, -0.6], group: 0, l1: 0.3, l2: 0.36 },
  { side: 1, hip: [0.18, 0.2, -0.38], rest: [0.44, -0.6], group: 1, l1: 0.3, l2: 0.36 },
  { side: -1, hip: [-0.22, 0.2, -0.14], rest: [-0.6, 0.0], group: 1, l1: 0.36, l2: 0.42 },
  { side: 1, hip: [0.22, 0.2, -0.14], rest: [0.6, 0.0], group: 0, l1: 0.36, l2: 0.42 },
  { side: -1, hip: [-0.2, 0.2, 0.12], rest: [-0.52, 0.8], group: 0, l1: 0.46, l2: 0.6 },
  { side: 1, hip: [0.2, 0.2, 0.12], rest: [0.52, 0.8], group: 1, l1: 0.46, l2: 0.6 },
];
const LOOK = {
  runner: { s: 1, body: '#4a1a0a', leg: '#30120a', abd: [0.26, 0.12, 0.64], shield: [0.27, 0.095, 0.24], h: 0.25 },
  flyer: { s: 0.78, body: '#6a3414', leg: '#3c1c0c', abd: [0.23, 0.11, 0.62], shield: [0.24, 0.085, 0.22], h: 0.25 },
  charger: { s: 2.1, body: '#3a1a0c', leg: '#22100a', abd: [0.34, 0.19, 0.62], shield: [0.38, 0.2, 0.36], h: 0.3 },
};

function shieldGeo() {
  const g = new THREE.SphereGeometry(1, 20, 12), pc = g.attributes.position, cols = new Float32Array(pc.count * 3);
  const dark = new THREE.Color('#2a0e06'), mid = new THREE.Color('#6a3414'), pale = new THREE.Color('#b89858'), cc = new THREE.Color();
  for (let i = 0; i < pc.count; i++) {
    const x = pc.getX(i), y = pc.getY(i), z = pc.getZ(i), rr = Math.hypot(x, z);
    if (y < -0.15) cc.copy(dark);
    else {
      const edge = smooth((rr - 0.84) / 0.1), spot = Math.exp(-(((Math.abs(x) - 0.32) / 0.24) ** 2 + ((z - 0.05) / 0.5) ** 2));
      cc.copy(mid).lerp(dark, Math.min(1, spot * 1.25)).lerp(pale, edge);
    }
    cols.set([cc.r, cc.g, cc.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}
function abdGeo() {
  const g = new THREE.SphereGeometry(1, 18, 12), pc = g.attributes.position, cols = new Float32Array(pc.count * 3);
  for (let i = 0; i < pc.count; i++) {
    const x = pc.getX(i), y = pc.getY(i), z = pc.getZ(i);
    const seam = 1 - 0.45 * Math.exp(-((x / 0.07) ** 2)) * (y > 0 ? 1 : 0), band = y < 0 ? 0.6 + 0.4 * Math.abs(Math.sin(z * 9)) : 1, vein = y > 0 ? 0.9 + 0.1 * Math.sin(x * 26 + z * 5) : 1;
    const k = seam * band * vein * (0.82 + 0.3 * (y * 0.5 + 0.5));
    cols.set([k, k, k], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}

export function createRoaches(scene, quality) {
  const chitin = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.12 });
  const plain = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.1 });
  const mk = (geo, mat, n) => {
    const im = new THREE.InstancedMesh(geo, mat, n);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.castShadow = quality.shadow; im.receiveShadow = false; im.count = 0;
    im.setColorAt(0, _c.set('#fff'));
    scene.add(im); return im;
  };
  const rodG = new THREE.CylinderGeometry(0.55, 1, 1, 6, 1); rodG.translate(0, 0.5, 0);
  const wingG = new THREE.CircleGeometry(1, 14); wingG.rotateX(-Math.PI / 2); wingG.translate(1, 0, 0);
  const abd = mk(abdGeo(), chitin, MAX), shield = mk(shieldGeo(), chitin, MAX), head = mk(new THREE.SphereGeometry(1, 12, 8), plain, MAX);
  const rods = mk(rodG, plain, MAX * RODS);
  const wings = mk(wingG, new THREE.MeshStandardMaterial({ color: '#e8b060', transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, roughness: 0.3, emissive: '#3a2408' }), MAX * 2);
  wings.castShadow = false;
  const eyes = mk(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.3, 0.12) }), MAX * 2);
  eyes.castShadow = false;
  const state = new Map();

  function part(im, i, x, y, z, sx, sy, sz, rx = 0) {
    _e.set(rx, 0, 0); _q2.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q2, _s.set(sx, sy, sz)).premultiply(_mb);
    im.setMatrixAt(i, _m);
  }
  function rod(i, A, Bv, r) {
    _d.subVectors(Bv, A); const len = _d.length() || 1e-4;
    _q2.setFromUnitVectors(_up, _d.multiplyScalar(1 / len));
    _m.compose(A, _q2, _s.set(r, len, r));
    rods.setMatrixAt(i, _m);
  }
  const local = (x, y, z, out) => out.set(x, y, z).applyMatrix4(_mb);

  function update(sim, dt, t) {
    let n = 0;
    const seen = new Set();
    for (const e of sim.enemies) {
      if (n >= MAX) break;
      const L = LOOK[e.type], T = TYPES[e.type];
      let st = state.get(e.id);
      if (!st) { st = { phase: e.phase, pitch: 0, wing: 0, lift: 0 }; state.set(e.id, st); }
      seen.add(e.id);
      const emerge = e.state === 'emerge' ? smooth(e.t / 0.7) : 1;
      const fade = e.dead ? 1 - smooth((e.deadT - 4.6) / 1.3) : 1;
      const s = L.s * (0.35 + 0.65 * emerge) * Math.max(0.001, fade);
      const stride = 0.95 * L.s, flying = e.type === 'flyer' && e.y > 0.25 && !e.dead;
      st.phase += dt * Math.min(11, e.speed / stride) + (e.speed < 0.3 ? dt * 0.25 : 0);
      const rear = e.state === 'windup' && e.type === 'runner' ? smooth(e.t / 0.18) * 0.62 : e.state === 'windup' ? -0.12 : e.state === 'aim' ? 0.35 : e.state === 'dive' ? -0.55 : flying ? 0.12 : 0;
      st.pitch += (rear - st.pitch) * Math.min(1, dt * 14);
      st.wing += ((flying ? 1 : 0) - st.wing) * Math.min(1, dt * 10);
      const flip = e.flip, upside = flip > 0.5;
      const bob = flying ? Math.sin(t * 9 + e.phase) * 0.05 : 0;
      const shake = e.state === 'windup' && e.type === 'charger' ? Math.sin(t * 70) * 0.03 : 0;
      const by = e.y - (1 - emerge) * 0.5 * L.s + (upside ? 0.36 * s * Math.sin(flip * Math.PI * 0.5) : 0) + bob + Math.sin(flip * Math.PI) * 0.5 * s;
      _e.set(st.pitch, e.yaw, flip * Math.PI, 'YXZ'); _q.setFromEuler(_e);
      _mb.compose(_p.set(e.x + shake, by, e.z), _q, _s.set(s, s, s));
      const hit = e.hitT < 0.09 && !e.dead ? 1 : 0;
      const tint = (hex, k = 1) => { _c.set(hex); if (hit) _c.lerp(_hc, 0.7); if (e.dead) _c.multiplyScalar(0.7); return _c.multiplyScalar(k); };
      part(abd, n, 0, L.h, 0.22, L.abd[0], L.abd[1], L.abd[2]); abd.setColorAt(n, tint(L.body, 1.0));
      part(shield, n, 0, L.h + 0.045, -0.36, L.shield[0], L.shield[1], L.shield[2], -0.12); shield.setColorAt(n, tint(e.type === 'charger' ? '#9a8468' : '#b8b0a8'));
      part(head, n, 0, 0.21, -0.63, 0.125, 0.11, 0.13, 0.5); head.setColorAt(n, tint(L.leg, 1.2));
      const tele = (e.state === 'windup' || e.state === 'aim') ? 0.034 + 0.014 * Math.sin(t * 40) : e.state === 'charge' || e.state === 'dive' ? 0.03 : 0.012;
      for (const sd of [-1, 1]) {
        const k = n * 2 + (sd > 0 ? 1 : 0);
        part(eyes, k, sd * 0.085, 0.25, -0.7, e.dead ? 0 : tele, e.dead ? 0 : tele, e.dead ? 0 : tele);
        const flap = 0.25 + 0.95 * Math.sin(t * 95 + e.phase);
        _e.set(0, 0, sd > 0 ? flap : Math.PI - flap); _q2.setFromEuler(_e);
        const w = st.wing;
        _m.compose(_p.set(sd * 0.08, L.h + 0.13, 0.05), _q2, _s.set(0.55 * w + 1e-4, 1, 0.3 * w + 1e-4)).premultiply(_mb);
        wings.setMatrixAt(k, _m);
      }
      // 腿：走路时脚钉在地上（按身体朝向与相位算世界坐标），翻肚或在空中时按身体自己的坐标蜷着
      const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw), rx = Math.cos(e.yaw), rz = -Math.sin(e.yaw);
      const grounded = !upside && !flying && emerge > 0.6;
      const legCol = tint(L.leg), base = n * RODS;
      for (let li = 0; li < 6; li++) {
        const G = LEGS[li];
        local(G.hip[0], G.hip[1], G.hip[2], _a);
        if (grounded) {
          const u = (st.phase + G.group * 0.5) % 1, moving = Math.min(1, e.speed / 1.2);
          let off, lift = 0;
          if (u < 0.5) off = (0.25 - u) * stride; else { const w = (u - 0.5) * 2; off = (-0.25 + w * 0.5) * stride; lift = Math.sin(w * Math.PI) * 0.16 * L.s; }
          off *= moving; lift *= moving;
          let lx = G.rest[0] * L.s, lz = G.rest[1] * L.s, ly = 0;
          if (li < 2 && st.pitch > 0.1) { const k = st.pitch / 0.62; lz -= 0.25 * L.s * k; ly = (0.55 + 0.12 * Math.sin(t * 30 + li * 2)) * L.s * k; lx *= 1 - 0.3 * k; }
          _b.set(e.x + rx * lx - fx * (lz - off), e.y + lift + ly, e.z + rz * lx - fz * (lz - off));
        } else {
          const tw = upside ? Math.sin(t * (e.dead ? 17 * Math.max(0, 1 - e.deadT / 2.5) : 11) + li * 1.7) * 0.12 : Math.sin(t * 7 + li) * 0.04;
          const curl = upside ? 0.5 : 0.62;
          local(G.rest[0] * curl + tw * G.side, upside ? -0.2 + tw : -0.16, G.rest[1] * curl * 0.9, _b);
        }
        // 两段腿反解：膝盖朝上朝外
        const l1 = G.l1 * s, l2 = G.l2 * s;
        _d.subVectors(_b, _a); let dist = _d.length();
        if (dist > (l1 + l2) * 0.98) { dist = (l1 + l2) * 0.98; _b.copy(_a).addScaledVector(_d.normalize(), dist); } else _d.multiplyScalar(1 / (dist || 1e-4));
        const a1 = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), hgt = Math.sqrt(Math.max(0, l1 * l1 - a1 * a1));
        local(G.hip[0] + G.side * 0.4, G.hip[1] + 1.2, G.hip[2], _n).sub(_a);
        _n.addScaledVector(_d, -_n.dot(_d)).normalize();
        _k.copy(_a).addScaledVector(_d, a1).addScaledVector(_n, hgt);
        rod(base + li * 2, _a, _k, 0.06 * s); rod(base + li * 2 + 1, _k, _b, 0.034 * s);
        rods.setColorAt(base + li * 2, legCol); rods.setColorAt(base + li * 2 + 1, legCol);
      }
      // 触角与尾须
      const flare = e.state === 'windup' || e.state === 'aim' ? 1 : 0, sway = Math.sin(t * 5 + e.phase) * 0.08;
      for (const sd of [-1, 1]) {
        const o = base + 12 + (sd > 0 ? 3 : 0);
        local(sd * 0.06, 0.27, -0.72, _a); local(sd * (0.26 + flare * 0.3), 0.5 + flare * 0.1, -1.12 + flare * 0.3, _k); local(sd * (0.5 + flare * 0.5) + sway, 0.42 + sway, -1.72 + flare * 0.6, _b);
        rod(o, _a, _k, 0.016 * s); rod(o + 1, _k, _b, 0.01 * s);
        local(sd * 0.1, 0.25, 0.74, _a); local(sd * 0.22, 0.28, 1.0, _k);
        rod(o + 2, _a, _k, 0.022 * s);
        for (let j = 0; j < 3; j++) rods.setColorAt(o + j, legCol);
      }
      n++;
    }
    for (const id of state.keys()) if (!seen.has(id)) state.delete(id);
    abd.count = shield.count = head.count = n; rods.count = n * RODS; wings.count = eyes.count = n * 2;
    for (const im of [abd, shield, head, rods, wings, eyes]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
  }
  return { update, meshes: [abd, shield, head, rods, wings, eyes] };
}
