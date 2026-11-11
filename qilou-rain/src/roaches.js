// 骑楼雨夜 · 蟑螂的样子与姿势。全部用实例化网格画（几十只合成几次绘制），三足步态脚钉在地上，翻肚、扑翅、起身都在这里摆。
// 外形依据美洲大蠊：红褐油亮、前胸背板淡黄边加两块深斑、鞭状长触角、带刺的胫节、后足最长、腹部一节一节；步态分组同 gz-roach/src/model.js。
import * as THREE from 'three';

const MAX = 30, RODS = 44, SEGS = 5;
const _m = new THREE.Matrix4(), _mb = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _k = new THREE.Vector3(), _d = new THREE.Vector3(), _n = new THREE.Vector3(), _t = new THREE.Vector3(), _u = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _c = new THREE.Color(), _hc = new THREE.Color(1.6, 1.9, 1.3);
const smooth = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

const LEGS = [
  { side: -1, hip: [-0.18, 0.2, -0.38], rest: [-0.46, -0.62], group: 0, l1: 0.3, l2: 0.36 },
  { side: 1, hip: [0.18, 0.2, -0.38], rest: [0.46, -0.62], group: 1, l1: 0.3, l2: 0.36 },
  { side: -1, hip: [-0.22, 0.2, -0.14], rest: [-0.64, 0.0], group: 1, l1: 0.38, l2: 0.44 },
  { side: 1, hip: [0.22, 0.2, -0.14], rest: [0.64, 0.0], group: 0, l1: 0.38, l2: 0.44 },
  { side: -1, hip: [-0.2, 0.2, 0.12], rest: [-0.56, 0.84], group: 0, l1: 0.48, l2: 0.64 },
  { side: 1, hip: [0.2, 0.2, 0.12], rest: [0.56, 0.84], group: 1, l1: 0.48, l2: 0.64 },
];
const LOOK = {
  runner: { s: 1.2, body: '#5a1c0a', leg: '#2e1008', belly: '#8a5a2a', abd: [0.26, 0.11, 0.64], shield: [0.28, 0.095, 0.25], h: 0.25 },
  flyer: { s: 0.95, body: '#7a3612', leg: '#3a180a', belly: '#9a6a34', abd: [0.23, 0.1, 0.62], shield: [0.24, 0.085, 0.22], h: 0.25 },
  charger: { s: 2.4, body: '#3c160a', leg: '#200e08', belly: '#6a4424', abd: [0.34, 0.18, 0.62], shield: [0.39, 0.2, 0.37], h: 0.3 },
};

function shieldGeo() {
  const g = new THREE.SphereGeometry(1, 24, 14), pc = g.attributes.position, cols = new Float32Array(pc.count * 3);
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
// 前翅盖：中缝、翅脉、靠后变深；只留上半球，下面露出一节节的腹部
function wingCoverGeo() {
  const g = new THREE.SphereGeometry(1, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), pc = g.attributes.position, cols = new Float32Array(pc.count * 3);
  for (let i = 0; i < pc.count; i++) {
    const x = pc.getX(i), y = pc.getY(i), z = pc.getZ(i);
    const seam = 1 - 0.6 * Math.exp(-((x / 0.05) ** 2)), vein = 0.86 + 0.14 * Math.sin(Math.abs(x) * 34 + z * 7) * Math.sin(z * 11), tail = 1 - 0.35 * smooth((z - 0.2) / 0.8), rim = 1 - 0.4 * smooth((0.25 - y) / 0.4);
    const k = seam * vein * tail * rim;
    cols.set([k, k * 0.96, k * 0.92], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}

// 壳面细节：翅脉、毛孔、划痕、水珠都按部件自身坐标在着色器里算（反照率、凹凸、粗糙度一起变），不用贴图文件
// kind 0 前翅盖 1 前胸背板 2 头、腹节、腿
function detail(mat, kind) {
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLp = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
      varying vec3 vLp;
      float rH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float rN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(rH(i), rH(i + vec2(1., 0.)), f.x), mix(rH(i + vec2(0., 1.)), rH(i + vec2(1., 1.)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      float rk = 1., rh = 0., rr = 1.; vec2 q = vLp.xz; float fwq = max(length(dFdx(vLp)), length(dFdy(vLp)));
      float pore = (rN(q * 60.) - .5) * smoothstep(.5, .1, fwq * 60.) + (rN(q * 23. + 4.) - .5) * smoothstep(.5, .1, fwq * 23.);
      float mott = rN(q * 3.3 + 7.) * .6 + rN(q * 8.1) * .4;
      float drop = smoothstep(.83, .9, rN(vLp.xz * 15. + vLp.y * 9.)) * smoothstep(.5, .1, fwq * 15.);
      ${kind === 0 ? `
      float ax = abs(vLp.x), fan = ax * (10. - vLp.z * 3.) + (rN(q * 5.) - .5) * .5;
      float vein = smoothstep(.0, .07, abs(fract(fan) - .5)) , xv = smoothstep(.0, .1, abs(fract(vLp.z * 8. + rN(vec2(floor(fan), 3.)) * 5.) - .5));
      float vk = mix(1., min(vein, mix(1., xv, .4)), smoothstep(.6, .15, fwq * 17.));
      float seam = smoothstep(.0, .035, ax);
      rk = (.78 + .22 * vk) * (.55 + .45 * seam) * (.78 + .4 * mott) * (1. + .5 * pore * .3);
      rk *= 1. + .5 * smoothstep(.55, .95, length(vLp.xz * vec2(1., .8)));
      rh = vk * .3 + seam * .8 + pore * .04 + drop * .3; rr = 1.2 - .3 * vk + .6 * (1. - mott) - .6 * drop;` : kind === 1 ? `
      float ring = .5 + .5 * sin(length(q) * 46. + rN(q * 4.) * 5.);
      float scr = smoothstep(.93, .99, rN(vec2(q.x * 3. + q.y * 22., q.y * 2.)));
      rk = (.8 + .34 * mott) * (.9 + .1 * ring * smoothstep(.5, .95, length(q))) * (1. - .25 * scr) * (1. + pore * .12);
      rh = ring * .15 * smoothstep(.5, .95, length(q)) + pore * .04 - scr * .3 + drop * .3; rr = .9 + .5 * (1. - mott) + scr - .6 * drop;` : `
      float band = .5 + .5 * sin(vLp.y * 26. + vLp.z * 9.);
      rk = (.74 + .4 * mott) * (.85 + .15 * band) * (1. + pore * .2);
      rh = band * .25 + pore * .05 + drop * .3; rr = 1.1 + .6 * (1. - mott) - .6 * drop;`}
      diffuseColor.rgb *= rk;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor * rr, .05, 1.);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      { vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition); float dhx = dFdx(rh), dhy = dFdy(rh);
        vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx); float det = dot(dpx, r1);
        vec3 nb = abs(det) * normal - sign(det) * (dhx * r1 + dhy * r2) * .1;
        if (dot(nb, nb) > 1e-14) normal = normalize(nb); }`);
  };
  mat.customProgramCacheKey = () => 'qilou-roach2-' + kind;
  return mat;
}

export function createRoaches(scene, quality) {
  const cm = () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.05, clearcoat: 0.9, clearcoatRoughness: 0.16 });
  const chitinW = detail(cm(), 0), chitinS = detail(cm(), 1);
  const plain = detail(new THREE.MeshPhysicalMaterial({ roughness: 0.3, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.25 }), 2);
  const mk = (geo, mat, n) => {
    const im = new THREE.InstancedMesh(geo, mat, n);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.castShadow = quality.shadow; im.receiveShadow = false; im.count = 0;
    im.setColorAt(0, _c.set('#fff'));
    scene.add(im); return im;
  };
  const rodG = new THREE.CylinderGeometry(0.5, 1, 1, 6, 1); rodG.translate(0, 0.5, 0);
  const wingG = new THREE.CircleGeometry(1, 14); wingG.rotateX(-Math.PI / 2); wingG.translate(1, 0, 0);
  const abd = mk(wingCoverGeo(), chitinW, MAX), shield = mk(shieldGeo(), chitinS, MAX), head = mk(new THREE.SphereGeometry(1, 14, 10), plain, MAX);
  const segs = mk(new THREE.SphereGeometry(1, 14, 8), plain, MAX * SEGS);
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
      const L = LOOK[e.type];
      let st = state.get(e.id);
      if (!st) { st = { phase: e.phase, pitch: 0, wing: 0 }; state.set(e.id, st); }
      seen.add(e.id);
      const emerge = e.state === 'emerge' ? smooth(e.t / 0.7) : 1;
      const fade = e.dead ? 1 - smooth((e.deadT - 4.6) / 1.3) : 1;
      const s = L.s * (0.35 + 0.65 * emerge) * Math.max(0.001, fade);
      const stride = 0.95 * L.s, flying = e.type === 'flyer' && e.y > 0.25 && !e.dead, moving = Math.min(1, e.speed / 1.2);
      st.phase += dt * Math.min(11, e.speed / stride) + (e.speed < 0.3 ? dt * 0.25 : 0);
      const tele = e.state === 'windup' || e.state === 'aim';
      const rear = e.state === 'windup' && e.type === 'runner' ? smooth(e.t / 0.18) * 0.7 : e.state === 'windup' ? -0.12 : e.state === 'aim' ? 0.35 : e.state === 'dive' ? -0.55 : flying ? 0.12 : 0;
      st.pitch += (rear - st.pitch) * Math.min(1, dt * 14);
      st.wing += ((flying ? 1 : 0) - st.wing) * Math.min(1, dt * 10);
      const flip = e.flip, upside = flip > 0.5;
      const bob = flying ? Math.sin(t * 9 + e.phase) * 0.05 : 0;
      const shake = e.state === 'windup' && e.type === 'charger' ? Math.sin(t * 70) * 0.03 : tele ? Math.sin(t * 55) * 0.012 : 0;
      const by = e.y - (1 - emerge) * 0.5 * L.s + (upside ? 0.36 * s * Math.sin(flip * Math.PI * 0.5) : 0) + bob + Math.sin(flip * Math.PI) * 0.5 * s;
      const wob = upside || flying ? 0 : Math.sin(st.phase * Math.PI * 2) * 0.09 * moving;
      _e.set(st.pitch, e.yaw + wob, flip * Math.PI + wob * 0.4, 'YXZ'); _q.setFromEuler(_e);
      _mb.compose(_p.set(e.x + shake, by, e.z), _q, _s.set(s, s, s));
      const hit = e.hitT < 0.09 && !e.dead ? 1 : 0;
      const tint = (hex, k = 1) => { _c.set(hex); if (hit) _c.lerp(_hc, 0.4); if (e.dead) _c.multiplyScalar(0.7); return _c.multiplyScalar(k); };
      part(abd, n, 0, L.h + 0.01, 0.22, L.abd[0], L.abd[1] * 1.5, L.abd[2], -0.04); abd.setColorAt(n, tint(L.body, 1.15));
      part(shield, n, 0, L.h + 0.045, -0.36, L.shield[0], L.shield[1], L.shield[2], -0.12); shield.setColorAt(n, tint(e.type === 'charger' ? '#9a8468' : '#b8b0a8'));
      const nod = tele ? 0.25 : Math.sin(t * 6 + e.phase) * 0.06;
      part(head, n, 0, 0.2, -0.64, 0.14, 0.12, 0.15, 0.5 + nod); head.setColorAt(n, tint(L.leg, 1.3));
      const breath = 1 + Math.sin(t * (e.dead ? 0 : 5) + e.phase) * 0.05;
      for (let k = 0; k < SEGS; k++) {
        const w = L.abd[0] * (0.96 - k * 0.11) * breath;
        part(segs, n * SEGS + k, 0, L.h - 0.045, -0.02 + k * 0.19, w, 0.085, 0.125);
        segs.setColorAt(n * SEGS + k, tint(k % 2 ? L.leg : L.belly, k % 2 ? 1.2 : 1));
      }
      const eye = e.dead ? 0 : tele ? 0.036 + 0.014 * Math.sin(t * 40) : e.state === 'charge' || e.state === 'dive' ? 0.032 : 0.016;
      for (const sd of [-1, 1]) {
        const k = n * 2 + (sd > 0 ? 1 : 0);
        part(eyes, k, sd * 0.1, 0.25, -0.72, eye, eye * 1.5, eye);
        const flap = 0.25 + 0.95 * Math.sin(t * 95 + e.phase);
        _e.set(0, 0, sd > 0 ? flap : Math.PI - flap); _q2.setFromEuler(_e);
        const w = st.wing;
        _m.compose(_p.set(sd * 0.08, L.h + 0.13, 0.05), _q2, _s.set(0.55 * w + 1e-4, 1, 0.3 * w + 1e-4)).premultiply(_mb);
        wings.setMatrixAt(k, _m);
      }
      const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw), rx = Math.cos(e.yaw), rz = -Math.sin(e.yaw);
      const grounded = !upside && !flying && emerge > 0.6;
      const legCol = tint(L.leg), base = n * RODS;
      for (let i = 0; i < RODS; i++) rods.setColorAt(base + i, legCol);
      for (let li = 0; li < 6; li++) {
        const G = LEGS[li], o = base + li * 5;
        local(G.hip[0], G.hip[1], G.hip[2], _a);
        if (grounded) {
          const u = (st.phase + G.group * 0.5) % 1;
          let off, lift = 0;
          if (u < 0.5) off = (0.25 - u) * stride; else { const w = (u - 0.5) * 2; off = (-0.25 + w * 0.5) * stride; lift = Math.sin(w * Math.PI) * 0.18 * L.s; }
          off *= moving; lift *= moving;
          let lx = G.rest[0] * L.s, lz = G.rest[1] * L.s, ly = 0;
          if (li < 2 && st.pitch > 0.1) { const k = st.pitch / 0.7; lz -= 0.3 * L.s * k; ly = (0.6 + 0.14 * Math.sin(t * 30 + li * 2)) * L.s * k; lx *= 1 - 0.3 * k; }
          _b.set(e.x + rx * lx - fx * (lz - off), e.y + lift + ly + 0.05 * s, e.z + rz * lx - fz * (lz - off));
          _t.set(_b.x + (rx * G.side * 0.15 + fx * 0.07) * s, e.y + lift + ly * 0.9, _b.z + (rz * G.side * 0.15 + fz * 0.07) * s);
        } else {
          const tw = upside ? Math.sin(t * (e.dead ? 17 * Math.max(0, 1 - e.deadT / 2.5) : 11) + li * 1.7) * 0.12 : Math.sin(t * 7 + li) * 0.04;
          const curl = upside ? 0.5 : 0.62;
          local(G.rest[0] * curl + tw * G.side, upside ? -0.2 + tw : -0.16, G.rest[1] * curl * 0.9, _b);
          local(G.rest[0] * curl * 0.8 + tw * G.side, upside ? -0.34 + tw : -0.3, G.rest[1] * curl * 0.9 - 0.06, _t);
        }
        const l1 = G.l1 * s, l2 = G.l2 * s;
        _d.subVectors(_b, _a); let dist = _d.length();
        if (dist > (l1 + l2) * 0.98) { dist = (l1 + l2) * 0.98; _b.copy(_a).addScaledVector(_d.normalize(), dist); } else _d.multiplyScalar(1 / (dist || 1e-4));
        const a1 = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), hgt = Math.sqrt(Math.max(0, l1 * l1 - a1 * a1));
        local(G.hip[0] + G.side * 0.4, G.hip[1] + 1.2, G.hip[2], _n).sub(_a);
        _n.addScaledVector(_d, -_n.dot(_d)).normalize();
        _k.copy(_a).addScaledVector(_d, a1).addScaledVector(_n, hgt);
        rod(o, _a, _k, 0.062 * s); rod(o + 1, _k, _b, 0.036 * s); rod(o + 2, _b, _t, 0.018 * s);
        for (let j = 0; j < 2; j++) {
          _u.copy(_k).lerp(_b, 0.3 + j * 0.34); _p.copy(_u).addScaledVector(_n, 0.1 * s);
          rod(o + 3 + j, _u, _p, 0.014 * s);
        }
      }
      const flare = tele ? 1 : 0, whip = Math.sin(t * 7 + e.phase), whip2 = Math.sin(t * 11.3 + e.phase * 2);
      for (const sd of [-1, 1]) {
        const o = base + 30 + (sd > 0 ? 4 : 0);
        local(sd * 0.07, 0.28, -0.74, _a);
        for (let j = 1; j <= 4; j++) {
          const u = j / 4, sw = (whip * 0.1 + whip2 * 0.05 * sd) * u * u * (1 + moving);
          local(sd * (0.07 + (0.34 + flare * 0.5) * Math.pow(u, 1.2)) + sw, 0.28 + 0.3 * Math.sin(u * 2.6) + sw * 0.6, -0.74 - (1.5 - flare * 0.5) * u, _b);
          rod(o + j - 1, _a, _b, (0.02 - j * 0.0035) * s);
          _a.copy(_b);
        }
        const c = base + 38 + (sd > 0 ? 1 : 0);
        local(sd * 0.1, 0.24, 0.8, _a); local(sd * 0.24, 0.27, 1.08, _b); rod(c, _a, _b, 0.022 * s);
        const open = e.dead ? 0.2 : tele ? 1 : 0.35 + 0.3 * Math.sin(t * 9 + e.phase);
        local(sd * 0.07, 0.13, -0.74, _a); local(sd * (0.015 + open * 0.085), 0.07, -0.9, _b); rod(c + 2, _a, _b, 0.03 * s);
        local(sd * 0.09, 0.14, -0.7, _a); local(sd * 0.15, 0.02 + whip2 * 0.02, -0.84, _b); rod(c + 4, _a, _b, 0.014 * s);
      }
      n++;
    }
    for (const id of state.keys()) if (!seen.has(id)) state.delete(id);
    abd.count = shield.count = head.count = n; segs.count = n * SEGS; rods.count = n * RODS; wings.count = eyes.count = n * 2;
    for (const im of [abd, shield, head, segs, rods, wings, eyes]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
  }
  return { update, meshes: [abd, shield, head, segs, rods, wings, eyes] };
}
