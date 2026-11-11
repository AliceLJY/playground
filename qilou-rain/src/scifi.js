// 骑楼雨夜 · 科幻层：封锁罩、巡逻无人机与探照灯、全息警示牌、井口的卵囊、广州塔（会往上扫的光环与天线光柱）。
// 全部是自发光或叠加混合的着色器网格，跟着 shared.uT 动，不参与碰撞。文字是运行时画在画布上的。
import * as THREE from 'three';
import { DRAINS, rng } from './core.js';

const add = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false };

// 广州塔：下大、腰细（约 63% 高处）、顶略收，24 根斜柱加环梁，顶面是斜的，上面一根天线
function tower(shared, cx, cz, H) {
  const pos = [], col = [], c = new THREE.Color(), v = new THREE.Vector3(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3();
  const box = new THREE.BoxGeometry(1, 1, 1).toNonIndexed(), bp = box.attributes.position;
  const K = H / 250, rb = 23 * K, rw = 8.6 * K, rt = 14.5 * K, tw = 0.63, ell = 0.82;
  const rad = t => Math.sqrt(rw * rw + (t < tw ? (rb * rb - rw * rw) / (tw * tw) : (rt * rt - rw * rw) / ((1 - tw) * (1 - tw))) * (t - tw) * (t - tw));
  const top = a => 1 - 0.07 * (1 + Math.cos(a - 0.6)) * 0.5;
  const P = (a, t, tt) => v.set(cx + Math.cos(a) * rad(t) , t * H * tt, cz + Math.sin(a) * rad(t) * ell).clone();
  const beam = (A, B, w, t) => { d.subVectors(B, A); const len = d.length(); q.setFromUnitVectors(up, d.normalize()); m.compose(A.clone().add(B).multiplyScalar(0.5), q, s.set(w * K, len, w * K));
    c.setHSL((0.92 - t * 0.78 + 1) % 1, 1, 0.52); for (let i = 0; i < bp.count; i++) { v.fromBufferAttribute(bp, i).applyMatrix4(m); pos.push(v.x, v.y, v.z); col.push(c.r, c.g, c.b); } };
  const N = 24, SEG = 16, twist = 0.9;
  for (let k = 0; k < N; k++) { const a0 = k / N * Math.PI * 2; for (let j = 0; j < SEG; j++) { const t0 = j / SEG, t1 = (j + 1) / SEG, tt = top(a0 + twist); beam(P(a0 + twist * t0, t0, tt), P(a0 + twist * t1, t1, tt), 0.62, t0); }
    for (let j = 0; j < SEG; j += 2) { const t0 = j / SEG, t1 = (j + 2) / SEG, tt = top(a0 + twist); beam(P(a0 + twist * t0, t0, tt), P(a0 + twist * t1 - Math.PI * 2 / N, t1, tt), 0.22, t0); } }
  for (let j = 1; j <= 44; j++) { const t = j / 44; for (let k = 0; k < N; k++) { const a0 = k / N * Math.PI * 2 + twist * t, a1 = a0 + Math.PI * 2 / N; beam(P(a0, t, top(a0 + twist * (1 - t))), P(a1, t, top(a1 + twist * (1 - t))), 0.2, t); } }
  for (const [y0, y1, w] of [[0.9, 1.12, 1.5], [1.12, 1.24, 1.0], [1.24, 1.34, 0.55]]) beam(new THREE.Vector3(cx, y0 * H, cz), new THREE.Vector3(cx, y1 * H, cz), w, 0.98);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mat = new THREE.ShaderMaterial({ fog: false, uniforms: { uT: shared.uT, uH: { value: H } },
    vertexShader: 'attribute vec3 color; varying vec3 vC; varying float vY; void main(){ vC = color; vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `uniform float uT, uH; varying vec3 vC; varying float vY;
      void main(){ float t = vY / uH; float scan = smoothstep(.06, 0., abs(fract(t - uT * .11) - .5) - .0) ; float tw = .8 + .2 * sin(vY * .9 + uT * 3.);
        vec3 c = vC * (1.0 * tw + 2.6 * pow(scan, 3.)); if (t > 1.) c = mix(vec3(.75, .85, 1.), vec3(1., .2, .15), step(.5, fract(uT * .8))) * 1.6; gl_FragColor = vec4(c, 1.); }` });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false;
  // 天线光柱：两片交叉的竖片，往上淡出
  const bg = new THREE.BufferGeometry(), bw = 2.2, y0 = 1.34 * H, y1 = y0 + 520, bpz = [];
  for (const [dx, dz] of [[1, 0], [0, 1]]) bpz.push(cx - dx * bw, y0, cz - dz * bw, cx + dx * bw, y0, cz + dz * bw, cx + dx * bw, y1, cz + dz * bw, cx - dx * bw, y0, cz - dz * bw, cx + dx * bw, y1, cz + dz * bw, cx - dx * bw, y1, cz - dz * bw);
  bg.setAttribute('position', new THREE.Float32BufferAttribute(bpz, 3));
  const bm = new THREE.Mesh(bg, new THREE.ShaderMaterial({ ...add, uniforms: { uT: shared.uT, uY: { value: new THREE.Vector2(y0, y1) } },
    vertexShader: 'varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: 'uniform float uT; uniform vec2 uY; varying float vY; void main(){ float k = 1. - (vY - uY.x) / (uY.y - uY.x); float p = .7 + .3 * sin(vY * .05 - uT * 6.); gl_FragColor = vec4(vec3(.5, .85, 1.) * k * k * p * .5, 1.); }' }));
  bm.frustumCulled = false;
  return [mesh, bm];
}

// 封锁罩：罩住整片街区的穹顶，六边形网格，靠近地平线才显，隔一阵有一圈光往上扫
function dome(shared) {
  return new THREE.Mesh(new THREE.SphereGeometry(520, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.5), new THREE.ShaderMaterial({ ...add, side: THREE.BackSide, uniforms: { uT: shared.uT },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `uniform float uT; varying vec3 vP;
      float hex(vec2 p){ p.x *= 1.1547; p.y += mod(floor(p.x), 2.) * .5; p = abs(fract(p) - .5); return abs(max(p.x * 1.5 + p.y, p.y * 2.) - 1.); }
      void main(){ vec3 d = normalize(vP); float el = d.y, az = atan(d.z, d.x);
        float g = smoothstep(.09, .0, hex(vec2(az * 14., el * 26.)));
        float low = smoothstep(.34, .03, el) * smoothstep(.0, .04, el);
        float sweep = smoothstep(.05, 0., abs(el - fract(uT * .07) * .7));
        float fl = .75 + .25 * sin(uT * 2.3 + az * 9.);
        vec3 c = mix(vec3(.15, .7, .95), vec3(1., .35, .12), smoothstep(.0, .12, .12 - el)) * (g * .1 * low * fl + sweep * (.05 + g * .4) * low);
        gl_FragColor = vec4(c, 1.); }` }));
}

// 全息警示牌：画布上写字，着色器加扫描线、闪烁、偶尔横向错位
function holoTexture() {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 1024; const g = cv.getContext('2d');
  const panel = (i, big, small, tag) => { const y = i * 256; g.save(); g.translate(0, y);
    g.strokeStyle = '#fff'; g.lineWidth = 5; g.strokeRect(14, 14, 996, 228); g.lineWidth = 2; g.strokeRect(26, 26, 972, 204);
    for (let k = 0; k < 9; k++) { g.fillStyle = k % 2 ? '#fff' : 'rgba(255,255,255,.25)'; g.beginPath(); g.moveTo(40 + k * 22, 214); g.lineTo(54 + k * 22, 214); g.lineTo(66 + k * 22, 190); g.lineTo(52 + k * 22, 190); g.fill(); }
    g.beginPath(); g.moveTo(120, 52); g.lineTo(196, 172); g.lineTo(44, 172); g.closePath(); g.lineWidth = 9; g.stroke(); g.fillStyle = '#fff'; g.fillRect(114, 88, 12, 48); g.fillRect(114, 146, 12, 12);
    g.font = '900 96px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif'; g.textBaseline = 'middle'; g.fillText(big, 232, 100);
    g.font = '600 38px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif'; g.fillText(small, 260, 196); g.font = '700 26px ui-monospace, Menlo, monospace'; g.textAlign = 'right'; g.fillText(tag, 986, 50); g.restore(); };
  panel(0, '虫害红色预警', '西关片区已封锁 · 居民留在室内', 'GZ-PEST // LV.5'); panel(1, '封锁区 禁止通行', '沙井口正在消杀 · 请绕行', 'SECTOR 07 // SEALED');
  panel(2, '末班撤离船', '长堤轮渡 · 井盖封好即开', 'EVAC // 00:07'); panel(3, '巨型蜚蠊 出没', '远喷 近拍 · 看准预警再动', 'BIO-HAZARD // B.A-13');
  const t = new THREE.CanvasTexture(cv); t.anisotropy = 8; return t;
}
function holos(shared) {
  const pos = [], uv = [], tint = [], seed = [];
  const put = (x, y, z, w, ry, row, color, sd) => { const h = w * 0.25, cx = Math.cos(ry) * w / 2, sz = -Math.sin(ry) * w / 2, c = new THREE.Color(color), v0 = 1 - (row + 1) * 0.25, v1 = 1 - row * 0.25;
    const q = [[-1, -1, 0, v0], [1, -1, 1, v0], [1, 1, 1, v1], [-1, -1, 0, v0], [1, 1, 1, v1], [-1, 1, 0, v1]];
    for (const [a, b, u, vv] of q) { pos.push(x + a * cx, y + b * h / 2, z + a * sz); uv.push(u, vv); tint.push(c.r, c.g, c.b); seed.push(sd); } };
  put(0, 8.6, -30, 8.4, Math.PI, 0, '#ff3a2a', 0.1); put(0, 8.6, -30.05, 8.4, 0, 0, '#ff3a2a', 0.1);
  put(0, 8.2, 2, 7.6, Math.PI, 3, '#ffb020', 0.4); put(0, 8.2, 2.05, 7.6, 0, 3, '#ffb020', 0.4);
  put(0, 9.0, 36.5, 9, Math.PI, 2, '#27e0d0', 0.7); put(0, 9.0, 36.55, 9, 0, 2, '#27e0d0', 0.7);
  for (const [i, d] of DRAINS.entries()) { put(d.x, 3.5, d.z - 2.6, 3.4, Math.PI, 1, '#ff5a2a', 0.2 + i * 0.23); put(d.x, 3.5, d.z + 2.6, 3.4, 0, 1, '#ff5a2a', 0.2 + i * 0.23); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('aTint', new THREE.Float32BufferAttribute(tint, 3)); g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
  const mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ ...add, side: THREE.FrontSide, fog: true, uniforms: { ...THREE.UniformsLib.fog, uT: shared.uT, uMap: { value: holoTexture() } },
    vertexShader: `attribute vec3 aTint; attribute float aSeed; varying vec2 vUv; varying vec3 vTint; varying float vSeed, vWy;
      #include <fog_pars_vertex>
      void main(){ vUv = uv; vTint = aTint; vSeed = aSeed; vWy = position.y; vec4 mvPosition = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uT; uniform sampler2D uMap; varying vec2 vUv; varying vec3 vTint; varying float vSeed, vWy;
      #include <fog_pars_fragment>
      float h1(float x){ return fract(sin(x * 91.7) * 43758.5); }
      void main(){ float row = floor(vUv.y * 4.), ly = fract(vUv.y * 4.); float gt = floor(uT * 7. + vSeed * 50.), gl = step(.9, h1(gt)) * step(.5, h1(floor(ly * 9.) + gt));
        vec2 u = vec2(vUv.x + gl * .03 * (h1(gt + 2.) - .5), vUv.y); float a = texture2D(uMap, u).a, a2 = texture2D(uMap, u + vec2(.004, 0.)).a;
        float scan = .7 + .3 * sin(vWy * 90. - uT * 9.), fl = .82 + .18 * sin(uT * 31. + vSeed * 20.) * step(.6, h1(floor(uT * 3.) + vSeed));
        float off = step(.04, h1(floor(uT * 1.3) + vSeed * 7.));
        vec3 c = vTint * (a * 1.5 + .07 * step(.03, ly) * step(ly, .97)) + vec3(.2, .7, 1.) * a2 * .35;
        gl_FragColor = vec4(c * scan * fl * (.25 + .75 * off), 1.);
      #include <fog_fragment>
      }` }));
  // 投影器：牌子下面一道往下的光
  return mesh;
}

// 井口的卵囊与黏液脉络：一鼓一鼓地亮
function pods(shared) {
  const r = rng(77), pos = [], nor = [], seed = [], kind = [], ball = new THREE.SphereGeometry(1, 10, 8).toNonIndexed(), bp = ball.attributes.position, v = new THREE.Vector3();
  const blob = (x, y, z, sx, sy, sz, sd, k) => { for (let i = 0; i < bp.count; i++) { v.fromBufferAttribute(bp, i); nor.push(v.x, v.y, v.z); pos.push(x + v.x * sx, y + v.y * sy, z + v.z * sz); seed.push(sd); kind.push(k); } };
  for (const d of DRAINS) {
    for (let i = 0; i < 14; i++) { const a = r() * Math.PI * 2, rr = 1.25 + r() * 1.3, s = 0.1 + r() * r() * 0.26, sd = r(); blob(d.x + Math.cos(a) * rr, s * 0.8, d.z + Math.sin(a) * rr, s, s * 1.25, s, sd, 0); if (r() < 0.5) blob(d.x + Math.cos(a) * rr + s * 0.9, s * 0.5, d.z + Math.sin(a) * rr + s * 0.4, s * 0.6, s * 0.75, s * 0.6, r(), 0); }
    for (let i = 0; i < 9; i++) { const a = r() * Math.PI * 2; let x = d.x + Math.cos(a) * 1.05, z = d.z + Math.sin(a) * 1.05, dir = a; for (let j = 0; j < 9; j++) { dir += (r() - 0.5) * 0.9; const L = 0.34; blob(x + Math.cos(dir) * L / 2, 0.012, z + Math.sin(dir) * L / 2, L * 0.62 * Math.abs(Math.cos(dir)) + 0.035, 0.02, L * 0.62 * Math.abs(Math.sin(dir)) + 0.035, j / 9, 1); x += Math.cos(dir) * L; z += Math.sin(dir) * L; } }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1)); g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
  return new THREE.Mesh(g, new THREE.ShaderMaterial({ fog: true, uniforms: { ...THREE.UniformsLib.fog, uT: shared.uT },
    vertexShader: `attribute float aSeed, aKind; varying vec3 vN, vV; varying float vS, vK;
      #include <fog_pars_vertex>
      uniform float uT;
      void main(){ vS = aSeed; vK = aKind; vec3 p = position; float pulse = sin(uT * (1.6 + aSeed) + aSeed * 40.); if (aKind < .5) p += normal * .02 * pulse;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.); vN = normalize(normalMatrix * normal); vV = normalize(-mvPosition.xyz); gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uT; varying vec3 vN, vV; varying float vS, vK;
      #include <fog_pars_fragment>
      void main(){ float nv = max(dot(normalize(vN), normalize(vV)), 0.); float pulse = .5 + .5 * sin(uT * (1.6 + vS) + vS * 40.);
        vec3 c;
        if (vK < .5) { float core = pow(nv, 2.2); c = mix(vec3(.02, .09, .03), vec3(.45, 1.5, .3), core * (.35 + .65 * pulse)) + vec3(.5, .9, .4) * pow(1. - nv, 3.) * .5; c += vec3(.9, 1., .5) * smoothstep(.93, 1., nv) * .5; }
        else { float run = smoothstep(.2, 0., abs(fract(vS - uT * .35) - .5) - .1); c = vec3(.08, .5, .12) * (.35 + 1.4 * run); }
        gl_FragColor = vec4(c, 1.);
      #include <fog_fragment>
      }` }));
}

// 巡逻无人机：机身、四个旋翼臂、红蓝警灯、一道扫来扫去的探照光
function drones(shared) {
  const group = new THREE.Group(), list = [];
  const body = new THREE.MeshStandardMaterial({ color: '#22262c', roughness: 0.5, metalness: 0.6 }), coneG = new THREE.CylinderGeometry(0.12, 2.6, 16, 20, 1, true); coneG.translate(0, -8, 0);
  const coneM = () => new THREE.ShaderMaterial({ ...add, uniforms: { uC: { value: new THREE.Color('#bfe8ff') } }, vertexShader: 'varying float vY; varying vec3 vN, vV; void main(){ vY = -position.y / 16.; vec4 mv = modelViewMatrix * vec4(position, 1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }', fragmentShader: 'uniform vec3 uC; varying float vY; varying vec3 vN, vV; void main(){ float e = pow(abs(dot(normalize(vN), normalize(vV))), 1.5); gl_FragColor = vec4(uC * (1. - vY) * (1. - vY) * e * .34, 1.); }' });
  const paths = [[0, -34, 15, 9, 13.5, 0.19, 0], [0, 6, 12, 8, 12.5, -0.16, 2], [0, 48, 17, 13, 15, 0.13, 4], [24, 0, 7, 3, 13, 0.2, 1]];
  for (const [cx, cz, rx, rz, y, sp, ph] of paths) {
    const d = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), body); hull.scale.set(1.25, 0.5, 1); d.add(hull);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.6, 3) })); eye.position.set(0, -0.2, 0); d.add(eye);
    const rot = [];
    for (const [ax, az] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.08), body); arm.position.set(ax * 0.45, 0.02, az * 0.45); arm.rotation.y = -ax * az * Math.PI / 4; d.add(arm);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.03, 6, 18), body); ring.rotation.x = Math.PI / 2; ring.position.set(ax * 0.78, 0.06, az * 0.78); d.add(ring);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.012, 0.06), new THREE.MeshBasicMaterial({ color: '#5a6068', transparent: true, opacity: 0.6 })); blade.position.copy(ring.position); d.add(blade); rot.push(blade); }
    const red = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff2a1a' })), blue = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: '#2a6aff' }));
    red.position.set(0.5, 0.14, 0); blue.position.set(-0.5, 0.14, 0); d.add(red, blue);
    const beam = new THREE.Mesh(coneG, coneM()); beam.position.y = -0.2; d.add(beam);
    group.add(d); list.push({ d, cx, cz, rx, rz, y, sp, ph, rot, red, blue, beam });
  }
  return { group, update(t) { for (const o of list) { const a = t * o.sp + o.ph; o.d.position.set(o.cx + Math.cos(a) * o.rx, o.y + Math.sin(t * 0.7 + o.ph) * 0.4, o.cz + Math.sin(a) * o.rz); o.d.rotation.y = -a + (o.sp > 0 ? 0 : Math.PI);
      o.beam.rotation.set(Math.sin(t * 0.6 + o.ph) * 0.4, 0, Math.cos(t * 0.45 + o.ph * 2) * 0.4); for (const b of o.rot) b.rotation.y = t * 40;
      const k = Math.floor(t * 4 + o.ph) % 2; o.red.material.color.setRGB(k ? 3 : 0.25, 0.05, 0.04); o.blue.material.color.setRGB(0.04, k ? 0.1 : 0.5, k ? 0.3 : 3.2); } } };
}

export function buildScifi(shared, quality) {
  const group = new THREE.Group(), dr = drones(shared);
  group.add(...tower(shared, 70, 286, 150), dome(shared), holos(shared), pods(shared), dr.group);
  return { group, update: dr.update };
}
