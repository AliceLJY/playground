// 最靓的仔 · 几何。整只虫全部由代码搭出（没有模型文件），update(state) 按 model.js 的点摆姿势。
import * as THREE from 'three';
import { LEGS, SUBSYSTEMS } from './model.js';

const CHITIN = { color: 0x4a1d0c, roughness: 0.42, metalness: 0.0, clearcoat: 0.55, clearcoatRoughness: 0.28, sheen: 0.2, sheenColor: new THREE.Color(0xb3522a), sheenRoughness: 0.5 };
const BAND = { color: 0xe8cf8c, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.3 };
const EYE = { color: 0x120806, roughness: 0.12, clearcoat: 1.0, clearcoatRoughness: 0.05 };
const MEMBRANE = { color: 0xe2a955, roughness: 0.3, transparent: true, opacity: 0.62, side: THREE.DoubleSide, clearcoat: 0.5, depthWrite: false };
const TEGMEN = { color: 0x6a2d12, roughness: 0.38, clearcoat: 0.55, clearcoatRoughness: 0.3, side: THREE.DoubleSide, sheen: 0.4, sheenColor: new THREE.Color(0xc46a3a) };

const mat = (p) => new THREE.MeshPhysicalMaterial(p);
const v = (a) => new THREE.Vector3(a[0], a[1], a[2]);

/** 沿 +Z 的圆柱（从原点到 z=len），两端略收 */
function rod(len, r0, r1, seg = 10) {
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
  g.rotateX(Math.PI / 2); g.translate(0, 0, len / 2);
  return g;
}
function ellipsoid(rx, ry, rz, seg = 24) { const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.75)); g.scale(rx, ry, rz); return g; }

export function buildRoach() {
  const root = new THREE.Group();
  const parts = []; // { mesh, sys, explode:[x,y,z], shell:boolean, base:material props }
  const register = (mesh, sys, explode = [0, 0, 0], shell = false) => {
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData.sys = sys; mesh.userData.explode = explode; mesh.userData.shell = shell;
    mesh.userData.home = mesh.position.clone();
    parts.push(mesh); return mesh;
  };

  // ---------- 身体（随抬头角转动的组） ----------
  const body = new THREE.Group(); root.add(body);
  // 胸部核心：中胸 + 后胸
  const thorax = new THREE.Mesh(ellipsoid(8.2, 2.6, 5.0), mat({ ...CHITIN, color: 0x3d1709 }));
  thorax.position.set(1.0, 0.9, 0); body.add(register(thorax, 'core', [0, 0, 0]));
  // 前胸背板：盾 + 边上淡黄一圈
  const pron = new THREE.Group(); pron.position.set(8.4, 2.0, 0); body.add(pron);
  // 前胸背板：一块穹顶盾，用顶点色画出淡黄的边和中间两块深色斑（认美洲大蠊就认这块）
  const shieldG = ellipsoid(5.8, 1.7, 6.0, 40); const pc = shieldG.attributes.position, cols = new Float32Array(pc.count * 3);
  const dark = new THREE.Color(0x2e1006), mid = new THREE.Color(0x5a240e), pale = new THREE.Color(0xe9d39a), cc = new THREE.Color();
  for (let i = 0; i < pc.count; i++) {
    const x = pc.getX(i) / 5.8, y = pc.getY(i) / 1.7, z = pc.getZ(i) / 6.0, r = Math.hypot(x * 1.05, z);
    if (y < -0.2) cc.copy(dark); else {
      const edge = THREE.MathUtils.smoothstep(r, 0.91, 0.955);
      const spot = Math.exp(-(((Math.abs(z) - 0.3) / 0.24) ** 2 + ((x - 0.05) / 0.5) ** 2)); // 两块对称深斑
      cc.copy(mid).lerp(dark, Math.min(1, spot * 1.3)).lerp(pale, edge);
    }
    cols.set([cc.r, cc.g, cc.b], i * 3);
  }
  shieldG.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const shield = new THREE.Mesh(shieldG, mat({ ...CHITIN, color: 0xffffff, vertexColors: true })); shield.scale.y = 0.9;
  pron.add(register(shield, 'pronotum', [0, 7, 0], true));
  // 头：朝下的小椭球、两只复眼、口器、触角
  const head = new THREE.Group(); head.position.set(13.0, -0.7, 0); head.rotation.z = -0.75; body.add(head);
  const skull = new THREE.Mesh(ellipsoid(2.0, 2.7, 2.9), mat({ ...CHITIN, color: 0x3a150a })); head.add(register(skull, 'head', [8, 2, 0]));
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(ellipsoid(0.8, 1.55, 0.55), mat(EYE)); eye.position.set(0.7, 0.8, 2.5 * s); eye.rotation.x = -0.2 * s; head.add(register(eye, 'head', [8, 2, 0]));
    const palp = new THREE.Mesh(rod(2.2, 0.28, 0.16), mat({ ...CHITIN, color: 0x6a3418 })); palp.position.set(1.2, -2.6, 0.9 * s); palp.lookAt(new THREE.Vector3(3.5, -4.5, 1.6 * s).add(palp.position)); head.add(register(palp, 'head', [8, 2, 0]));
  }
  // 墨镜：只在「最靓的仔」姿态里戴上
  const shades = new THREE.Group(); shades.position.set(1.95, 1.0, 0); head.add(shades);
  const lensM = mat({ color: 0x0b0b10, roughness: 0.08, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02 });
  const goldM = mat({ color: 0xd9a441, roughness: 0.25, metalness: 1 });
  for (const s of [-1, 1]) {
    const lens = new THREE.Mesh(ellipsoid(0.32, 1.05, 1.35, 20), lensM); lens.position.z = 1.32 * s; lens.rotation.x = 0.12 * s; shades.add(lens);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.09, 6, 28), goldM); rim.scale.set(1.05, 1.35, 1); rim.rotation.y = Math.PI / 2; rim.position.set(0.05, 0, 1.32 * s); shades.add(rim);
    const arm = new THREE.Mesh(rod(2.4, 0.08, 0.08, 5), goldM); arm.position.set(0, 0.5, 2.6 * s); arm.lookAt(new THREE.Vector3(-2.2, 0.7, 2.9 * s)); shades.add(arm);
  }
  const bridge = new THREE.Mesh(rod(0.6, 0.08, 0.08, 5), goldM); bridge.position.set(0.05, 0.45, -0.3); shades.add(bridge);
  shades.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  shades.visible = false;
  // 触角：10 节链
  const antennae = [];
  for (const s of [-1, 1]) {
    const base = new THREE.Group(); base.position.set(1.7, 1.7, 1.1 * s); head.add(base);
    let parent = base; const chain = [];
    for (let i = 0; i < 10; i++) {
      const r0 = 0.22 - i * 0.014, len = 3.4;
      const m = new THREE.Mesh(rod(len, r0, r0 - 0.012, 6), mat({ ...CHITIN, color: 0x6b331a, clearcoat: 0.6 }));
      m.castShadow = i < 7; m.receiveShadow = false; m.userData.sys = 'head'; m.userData.explode = [8, 2, 0]; m.userData.home = m.position.clone(); parts.push(m);
      parent.add(m); const next = new THREE.Group(); next.position.z = len; m.add(next); chain.push(m); parent = next;
    }
    antennae.push({ side: s, base, chain });
  }
  // 腹部：9 节，越往后越窄；尾须两根
  for (let i = 0; i < 9; i++) {
    const t = i / 8, w = 5.0 - 2.6 * t * t, h = 1.8 - 0.9 * t;
    const seg = new THREE.Mesh(ellipsoid(1.7, h, w), mat({ ...CHITIN, color: i % 2 ? 0x4a1d0c : 0x55230f }));
    seg.position.set(-3.8 - i * 1.65, 0.2 - 0.35 * t, 0);
    body.add(register(seg, 'abdomen', [-10, 3, 0], true));
  }
  for (const s of [-1, 1]) {
    const c = new THREE.Mesh(rod(5.0, 0.42, 0.1, 7), mat({ ...CHITIN, color: 0x6b331a })); c.position.set(-17.2, -0.4, 1.0 * s);
    c.lookAt(new THREE.Vector3(-21.5, 0.2, 3.6 * s)); body.add(register(c, 'abdomen', [-10, 3, 0]));
  }
  // 翅：前翅鞘（革质，像风衣）+ 后翅（膜质折扇）
  const wings = [];
  for (const s of [-1, 1]) {
    const hinge = new THREE.Group(); hinge.position.set(3.6, 2.6, 0.35 * s); body.add(hinge);
    const teg = new THREE.Mesh(ellipsoid(12.4, 0.75, 3.7, 32), mat(TEGMEN)); teg.position.set(-11.0, -0.35, 2.55 * s); teg.rotation.set(0.12 * s, 0.07 * s, 0.07);
    hinge.add(register(teg, 'wings', [0, 7, 7 * s], true));
    const vein = new THREE.Mesh(rod(21.5, 0.12, 0.05, 5), mat({ ...TEGMEN, color: 0x8a4420 })); vein.position.set(0.0, 0.3, 1.6 * s); vein.lookAt(new THREE.Vector3(-21.5, -1.0, 4.4 * s)); hinge.add(register(vein, 'wings', [0, 7, 7 * s], true));
    // 后翅：5 片褶，绕根部扇开
    const fan = new THREE.Group(); fan.position.set(0.2, -0.75, 1.0 * s); hinge.add(fan);
    const pleats = [];
    for (let i = 0; i < 5; i++) {
      const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(-19, -1.4); shape.quadraticCurveTo(-20.5, 0.6, -18.5, 2.4); shape.lineTo(0, 1.6); shape.lineTo(0, 0);
      const g = new THREE.ShapeGeometry(shape, 6); g.rotateX(-Math.PI / 2);
      const p = new THREE.Mesh(g, mat({ ...MEMBRANE, color: i % 2 ? 0xe2a955 : 0xd8995a }));
      p.castShadow = false; p.receiveShadow = false; p.userData.sys = 'wings'; p.userData.explode = [0, 7, 7 * s]; p.userData.home = p.position.clone(); p.userData.pleat = i; parts.push(p);
      fan.add(p); pleats.push(p);
    }
    wings.push({ side: s, hinge, teg, fan, pleats });
  }

  // ---------- 腿：每段一个组，放在世界坐标 ----------
  const R = [[0.7, 0.55, 0.42, 0.3], [0.85, 0.7, 0.5, 0.34], [1.0, 0.92, 0.6, 0.38]]; // 基节/股节/胫节/跗节半径，按前中后
  const legs = LEGS.map((L) => {
    const r = R[L.pair];
    const g = {};
    const LEG = { ...CHITIN, color: 0x6a2c12 };
    const mk = (len, ra, rb, extra) => { const grp = new THREE.Group(); const m = new THREE.Mesh(rod(len, ra, rb), mat(LEG)); grp.add(register(m, 'legs' + L.pair, [L.pair === 0 ? 7 : L.pair === 2 ? -7 : 0, 1.5, 10 * L.side])); if (extra) extra(grp, m); root.add(grp); return grp; };
    g.coxa = mk(L.coxa, r[0], r[0] * 0.85);
    g.femur = mk(L.femur, r[1] * 0.9, r[1] * 1.05, (grp) => { // 股节鼓一点（肌肉）
      const bulge = new THREE.Mesh(ellipsoid(r[1] * 1.25, r[1] * 1.15, L.femur * 0.34), mat(LEG)); bulge.position.z = L.femur * 0.45; grp.add(register(bulge, 'legs' + L.pair, [L.pair === 0 ? 7 : L.pair === 2 ? -7 : 0, 1.5, 10 * L.side]));
    });
    g.tibia = mk(L.tibia, r[2], r[2] * 0.75, (grp) => { // 胫节带刺
      const n = L.pair === 2 ? 8 : 6;
      for (let i = 0; i < n; i++) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.17, L.pair === 2 ? 1.25 : 0.9, 6), mat({ ...CHITIN, color: 0x7a3a1a }));
        const z = L.tibia * (0.18 + 0.72 * i / (n - 1)); const ang = (i % 2 ? 1 : -1) * 0.75;
        sp.position.set(Math.sin(ang) * r[2] * 0.9, -Math.cos(ang) * r[2] * 0.9, z);
        sp.lookAt(new THREE.Vector3(Math.sin(ang) * 3, -Math.cos(ang) * 3, z - 2.2)); sp.rotateX(Math.PI / 2);
        grp.add(register(sp, 'legs' + L.pair, [L.pair === 0 ? 7 : L.pair === 2 ? -7 : 0, 1.5, 10 * L.side]));
      }
    });
    g.tarsus = mk(L.tarsus, r[3], r[3] * 0.7, (grp) => { // 5 节跗节的珠 + 两枚爪
      for (let i = 1; i <= 4; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(r[3] * 1.15, 8, 6), mat({ ...CHITIN, color: 0x5a2812 })); b.position.z = L.tarsus * i / 5; grp.add(register(b, 'legs' + L.pair, [L.pair === 0 ? 7 : L.pair === 2 ? -7 : 0, 1.5, 10 * L.side])); }
      for (const s of [-1, 1]) { const claw = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.0, 6), mat({ ...CHITIN, color: 0x2a0e05 })); claw.position.set(0.28 * s, -0.1, L.tarsus + 0.3); claw.rotation.x = Math.PI / 2 + 0.5; claw.rotation.z = 0.5 * s; grp.add(register(claw, 'legs' + L.pair, [L.pair === 0 ? 7 : L.pair === 2 ? -7 : 0, 1.5, 10 * L.side])); }
    });
    // 关节球，遮缝
    g.joints = [0, 1, 2].map((i) => { const j = new THREE.Mesh(new THREE.SphereGeometry([r[0] * 1.1, r[1] * 1.0, r[2] * 1.0][i], 10, 8), mat({ ...CHITIN, color: 0x5a2812 })); root.add(register(j, 'legs' + L.pair, [L.pair === 0 ? 7 : L.pair === 2 ? -7 : 0, 1.5, 10 * L.side])); return j; });
    return { L, ...g };
  });

  // 每个 mesh 自己的材质（高亮/隐身时各改各的）
  const _tmp = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0);
  const _x = new THREE.Vector3(1, 0, 0);
  // 段组的 +Z 从 a 指向 b；长度按真实距离拉伸（模型已保骨长，这里只吸收跗节那 0.9 mm 抬高）；竖直段换参考轴防翻转
  const place = (grp, a, b, len) => {
    grp.position.copy(a); _tmp.subVectors(b, a); const d = _tmp.length();
    _m.lookAt(b, a, Math.abs(_tmp.y / (d || 1)) > 0.95 ? _x : _up); grp.quaternion.setFromRotationMatrix(_m);
    grp.scale.set(1, 1, len ? d / len : 1);
  };

  const api = {
    root, body, parts, legs, antennae, wings, head, shades,
    /** 摆姿势：state 来自 model.pose() */
    update(state, explode = 0) {
      body.position.set(state.pos[0], state.pos[1], state.pos[2]);
      body.rotation.z = state.pitch;
      // 触角：后掠角 + 弯曲 + 轻摆
      const sweep = (state.antennaDeg * Math.PI) / 180;
      for (const a of antennae) {
        // 体坐标里的指向：前伸 → 后掠，略向上；再换到头的局部坐标（头绕 Z 低了 0.55 rad）
        const lift = 0.32 - 0.25 * state.swag + 0.05 * Math.sin(state.t * 2.1 + a.side);
        const d = new THREE.Vector3(Math.cos(sweep), Math.sin(lift), a.side * Math.sin(sweep)).normalize().applyAxisAngle(new THREE.Vector3(0, 0, 1), 0.55);
        _m.lookAt(d, new THREE.Vector3(), _up); a.base.quaternion.setFromRotationMatrix(_m);
        for (let i = 0; i < a.chain.length; i++) {
          const m = a.chain[i];
          // 弯成弧：跑动时往外飘，展品姿态里往下垂成两条「马尾」
          m.rotation.y = -a.side * (0.05 - 0.03 * state.swag);
          m.rotation.x = 0.035 * Math.sin(state.t * 3.3 + i * 0.5 + a.side) * (1 + 2 * state.v) + 0.11 * state.swag + 0.02 * (1 - state.swag);
        }
      }
      // 墨镜从上方落到脸上
      shades.visible = state.swag > 0.05; shades.position.y = 1.0 + 6 * (1 - state.swag) ** 2; shades.scale.setScalar(Math.min(1, state.swag * 1.4));
      // 翅：前翅鞘掀开，后翅扇开
      for (const w of wings) {
        const o = state.wings;
        w.hinge.rotation.set(w.side * -0.95 * o, w.side * 0.55 * o, 0.25 * o);
        w.teg.visible = true;
        for (const p of w.pleats) { const k = p.userData.pleat; p.rotation.y = w.side * (0.04 + 0.19 * k) * o; p.visible = o > 0.02; p.scale.setScalar(0.35 + 0.65 * o); }
      }
      // 腿
      for (const g of legs) {
        const s = state.legs.find((l) => l.id === g.L.id);
        const H = v(s.H), C = v(s.C), K = v(s.K), A = v(s.A), P = v(s.P);
        if (explode > 0) { const e = new THREE.Vector3(...g.coxa.children[0].userData.explode).multiplyScalar(explode); H.add(e); C.add(e); K.add(e); A.add(e); P.add(e); }
        place(g.coxa, H, C, g.L.coxa); place(g.femur, C, K, g.L.femur); place(g.tibia, K, A, g.L.tibia); place(g.tarsus, A, P, g.L.tarsus);
        g.joints[0].position.copy(C); g.joints[1].position.copy(K); g.joints[2].position.copy(A);
      }
      // 身体部件爆炸
      for (const p of parts) {
        if (!p.userData.home) continue;
        if (p.parent === body || p.parent === pron || p.parent === head || p.parent?.parent === body) {
          const e = p.userData.explode;
          if (p.parent === body) p.position.set(p.userData.home.x + e[0] * explode, p.userData.home.y + e[1] * explode, p.userData.home.z + e[2] * explode);
        }
      }
      pron.position.set(8.4, 2.0 + 7 * explode, 0);
      head.position.set(13.0 + 8 * explode, -0.7 + 2 * explode, 0);
      for (const w of wings) w.hinge.position.set(3.6, 2.6 + 7 * explode, (0.35 + 7 * explode) * w.side);
    },
    /** 显示模式：focus = 子系统 id 或 null；xray 让壳变透明；accent 高亮色 */
    setMode({ focus = null, xray = false, accent = 0xe8572a } = {}) {
      for (const p of parts) {
        const m = p.material; const sys = p.userData.sys;
        if (m.userData.baseOpacity === undefined) { m.userData.baseOpacity = m.opacity; m.userData.baseTransparent = m.transparent; m.userData.baseDepth = m.depthWrite; }
        const isFocus = focus && sys === focus;
        const ghost = focus ? !isFocus : xray && p.userData.shell;
        m.transparent = ghost || m.userData.baseTransparent;
        m.opacity = ghost ? (xray && !focus ? 0.2 : 0.18) : m.userData.baseOpacity;
        m.needsUpdate = true;
        m.depthWrite = ghost ? false : m.userData.baseDepth;
        if (isFocus) { if (m.userData.baseColor === undefined) m.userData.baseColor = m.color.getHex(); m.color.setHex(0x1c6f62); } else if (m.userData.baseColor !== undefined) m.color.setHex(m.userData.baseColor);
        m.emissive.setHex(isFocus ? accent : 0x000000); m.emissiveIntensity = isFocus ? 0.35 : 0;
        p.castShadow = !ghost && p.userData.pleat === undefined;
      }
    },
  };
  return api;
}

export const SUBSYSTEM_IDS = SUBSYSTEMS.map((s) => s.id);
