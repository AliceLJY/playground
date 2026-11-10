// 把整座园子搭起来：地面、荷塘水面、石板路、天空远景，再叫各个部件。
import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import * as C from './core.js';
import { Batch, box, cyl, sph, blob, instanced, rng, lerp, pick, makeTextures, makeMaterials } from './kit.js';
import { buildPavilion, buildCorridor, buildBridge, buildWalls } from './architecture.js';
import { buildBanyan, buildKapok, buildBamboo, buildBanana, buildBonsai, buildFlowers, buildSmallTrees, buildRockery, buildPondEdge, buildLotus, buildKoi, buildProps } from './plants.js';

// 石板路的中线：从园门口弯到水榭踏步；另有石桌周围和南面一带的铺地
const stepsFoot = C.pavToWorld((C.PAV.stepsX[0] + C.PAV.stepsX[1]) / 2, C.PAV.zFront + C.PAV.stepsLen + 0.2);
const PATH = [{ x: 0.6, z: 21.8 }, { x: 0.7, z: 18.0 }, { x: 0.5, z: 14.0 }, { x: 0.2, z: 12.2 }, { x: -0.7, z: 10.6 }, { x: -2.0, z: 9.3 }, stepsFoot];
const PATH2 = [{ x: 9.75, z: -2.0 }, { x: 8.4, z: -3.6 }, { x: 6.0, z: -4.8 }, { x: 2.0, z: -5.4 }, { x: -3.0, z: -5.0 }, { x: -6.4, z: -3.2 }, { x: -9.0, z: -1.4 }, { x: C.GATE.x, z: 2.4 }, { x: -7.4, z: 5.4 }, { x: -5.2, z: 7.6 }, { x: -4.3, z: 8.3 }];
const PATH3 = [{ x: 11.3, z: 4.25 }, { x: 12.6, z: 5.6 }, { x: 12.8, z: 8.2 }, { x: 11.0, z: 11.2 }, { x: 9.6, z: 13.6 }, { x: 8.4, z: 14.2 }];
function distToPath(path, x, z) { let best = 1e9; for (let i = 0; i < path.length - 1; i++) { const a = path[i], b = path[i + 1], dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz))); best = Math.min(best, Math.hypot(x - a.x - dx * t, z - a.z - dz * t)); } return best; }
export function isPaved(x, z) {
  if (C.inPond(x, z)) return false;
  if (distToPath(PATH, x, z) < 1.3) return true;
  if (Math.hypot((x - C.TABLE.x - 0.8) / 1.45, z - C.TABLE.z - 0.5) < 2.3) return true;
  if (z > 14.0 && x > -0.9 && x < (z > 15.2 ? 5.2 : 8.6) && z < 21.9) return true;
  if (distToPath(PATH2, x, z) < 0.8 || distToPath(PATH3, x, z) < 0.85) return true;
  return false;
}

function buildGround(scene, M, T, outline) {
  const S = 60, sh = new THREE.Shape(); sh.moveTo(-S, -S); sh.lineTo(S, -S); sh.lineTo(S, S); sh.lineTo(-S, S); sh.lineTo(-S, -S);
  const hole = new THREE.Path(); outline.forEach((p, i) => i ? hole.lineTo(p.x, -p.z) : hole.moveTo(p.x, -p.z)); hole.closePath(); sh.holes.push(hole);
  const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); g.attributes.uv.array.forEach((v, k, a) => { a[k] = v * 0.35; });
  const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: T.grass, roughness: 1 })); ground.receiveShadow = true; scene.add(ground);
  // 池壁：从岸边垂到水下
  const pos = [], idx = [], uv = [];
  outline.forEach((p, i) => { pos.push(p.x, 0.0, p.z, p.x, -1.3, p.z); uv.push(i * 0.4, 0, i * 0.4, 1); });
  for (let i = 0; i < outline.length; i++) { const a = i * 2, c = ((i + 1) % outline.length) * 2; idx.push(a, c, a + 1, a + 1, c, c + 1); }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); wg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); wg.setIndex(idx); wg.computeVertexNormals();
  const wall = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ map: T.granite, color: '#8f8b80', roughness: 1, side: THREE.DoubleSide })); scene.add(wall);
}

function buildPaving(scene, M, T) {
  const R = rng(141), b = [], cell = 0.98, col = new THREE.Color(), colors = [], tint = ['#f2eee4', '#e4e0d6', '#faf6ec', '#d8d4ca', '#ece6d8', '#e0dcd4'];
  for (let gx = C.BOUNDS.x0; gx < C.BOUNDS.x1; gx += cell) for (let gz = C.BOUNDS.z0; gz < C.BOUNDS.z1 + 0.9; gz += cell) {
    const cx = gx + cell / 2 + (R() - 0.5) * 0.2, cz = gz + cell / 2 + (R() - 0.5) * 0.2;
    if (!isPaved(cx, cz) || C.groundY(cx, cz) > 0.01 || C.blockedBy(cx, cz) === 'wall') { R(); continue; }
    const n = 5 + ((R() * 3) | 0), r0 = cell * 0.64, pts = [], a0 = R() * 6.28;
    for (let k = 0; k < n; k++) { const a = a0 + k * 6.283 / n + (R() - 0.5) * 0.6, r = r0 * (0.78 + R() * 0.3); pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
    if (pts.some(([x, z]) => C.inPond(x, z))) continue;
    const h = 0.035 + R() * 0.02, base = b.length / 3, c = col.set(pick(R, tint)).multiplyScalar(0.9 + R() * 0.2);
    // 顶面扇形 + 一圈侧边
    b.push(cx, h, cz); colors.push(c.r, c.g, c.b);
    for (const [x, z] of pts) { b.push(x, h, z); colors.push(c.r, c.g, c.b); }
    for (const [x, z] of pts) { b.push(x, 0, z); colors.push(c.r * 0.7, c.g * 0.7, c.b * 0.7); }
    for (let k = 0; k < n; k++) { const a = base + 1 + k, d = base + 1 + (k + 1) % n; (buildPaving.idx ||= []).push(base, d, a, a, d, a + n, d, d + n, a + n); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(b, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const uv = new Float32Array(b.length / 3 * 2); for (let i = 0; i < b.length / 3; i++) { uv[i * 2] = b[i * 3] * 0.6; uv[i * 2 + 1] = b[i * 3 + 2] * 0.6; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(buildPaving.idx); g.computeVertexNormals(); buildPaving.idx = null;
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: T.granite, vertexColors: true, roughness: 0.95 })); m.receiveShadow = true; m.castShadow = false; scene.add(m);
}

function buildSky(scene, anim, sunDir) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { uSun: { value: sunDir } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `varying vec3 vD; uniform vec3 uSun; void main(){ vec3 d = normalize(vD); float h = clamp(d.y, 0., 1.);
      vec3 c = mix(vec3(.74,.88,.98), vec3(.22,.52,.92), pow(h, .5)); c = mix(c, vec3(.93,.95,.9), smoothstep(.12, -.02, d.y));
      c += vec3(1., .9, .7) * pow(max(dot(d, uSun), 0.), 40.) * .35; gl_FragColor = vec4(c, 1.);
      #include <colorspace_fragment>
    }`,
  })); scene.add(sky);
  // 一朵朵鼓起来的白云，慢慢往东飘
  const R = rng(151), mat = new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false }), shade = new THREE.MeshBasicMaterial({ color: '#dfe8f4', fog: false }), clouds = [];
  for (const [x, y, z, s] of [[-40, 62, -190, 1.3], [60, 78, -210, 1.0], [150, 70, -120, 1.5], [-150, 66, -110, 1.2], [10, 96, -260, 0.9], [-90, 90, -230, 1.0], [120, 60, 150, 1.3], [-120, 70, 170, 1.2], [0, 80, 230, 1.1], [220, 74, 20, 1.2], [-230, 70, 10, 1.2]]) {
    const g = new THREE.Group(), puffs = [], under = [];
    for (let i = 0; i < 12; i++) { const px = (R() - 0.5) * 46 * s, pr = (7 + R() * 9) * s * (1 - Math.abs(px) / (40 * s)); puffs.push({ x: px, y: pr * 0.5 + R() * 3, z: (R() - 0.5) * 10 * s, s: pr, sy: pr * 0.8 }); under.push({ x: px, y: pr * 0.18, z: (R() - 0.5) * 8 * s, s: pr * 0.92, sy: pr * 0.5 }); }
    g.add(instanced(sph(1, 10, 8), shade, under, { cast: false, receive: false })); g.add(instanced(sph(1, 10, 8), mat, puffs, { cast: false, receive: false }));
    g.position.set(x, y, z); scene.add(g); clouds.push(g);
  }
  anim.push((t, dt) => { for (const c of clouds) { c.position.x += dt * 0.6; if (c.position.x > 300) c.position.x = -300; } });
  return sky;
}

function buildFar(scene, M) {
  const R = rng(161), b = new Batch();
  // 远山：两层，越远越淡
  for (const [r, h, col, n] of [[330, 60, '#7fa7c9', 26], [240, 42, '#6f9fb4', 30]]) {
    const mat = new THREE.MeshBasicMaterial({ color: col, fog: false }), items = [];
    for (let i = 0; i < n; i++) { const a = i / n * 6.283 + R() * 0.1; items.push({ x: Math.cos(a) * r, y: -4, z: Math.sin(a) * r, sx: 46 + R() * 40, sy: h * (0.5 + R() * 0.7), sz: 46 + R() * 40, ry: R() * 6 }); }
    scene.add(instanced(new THREE.ConeGeometry(1, 1, 7), mat, items, { cast: false, receive: false }));
  }
  // 远处的塔：八角九层，站在小山上
  const px = -23, pz = -131, base = 14, tm = new THREE.MeshStandardMaterial({ color: '#f1dcd2', roughness: 0.9 }), em = new THREE.MeshStandardMaterial({ color: '#b46a5a', roughness: 0.8 });
  b.add(new THREE.ConeGeometry(46, 22, 9), new THREE.MeshBasicMaterial({ color: '#6fa06a', fog: false }), px, 4, pz);
  let y = base; for (let i = 0; i < 9; i++) { const r = 2.5 - i * 0.17, h = 1.75; b.add(cyl(r * 0.94, r, h, 8), tm, px, y + h / 2, pz); b.add(cyl(r * 1.02, r * 1.55, 0.26, 8), em, px, y + h + 0.08, pz); y += h + 0.22; }
  b.add(new THREE.ConeGeometry(1.1, 1.6, 8), em, px, y + 0.8, pz); b.add(cyl(0.07, 0.12, 2.4, 6), new THREE.MeshStandardMaterial({ color: '#c9a53a', roughness: 0.5 }), px, y + 2.6, pz);
  b.flush(scene, { cast: false, receive: false });
}

export function buildWorld(scene, { coarse, sunDir }) {
  const prof = [], tick = n => prof.push([n, Math.round(performance.now())]); tick('start');
  const T = makeTextures(), M = makeMaterials(T), anim = []; tick('tex');
  // 岸线抹圆一点；行走判定仍用原来的折线
  const curve = new THREE.CatmullRomCurve3(C.POND.map(p => new THREE.Vector3(p.x, 0, p.z)), true, 'catmullrom', 0.35);
  const outline = curve.getPoints(140).slice(0, -1).map(p => ({ x: p.x, z: p.z }));
  buildGround(scene, M, T, outline); tick('buildGround');
  // 水面：带倒影
  const ws = new THREE.Shape(); outline.forEach((p, i) => i ? ws.lineTo(p.x, -p.z) : ws.moveTo(p.x, -p.z)); ws.closePath();
  const water = new Water(new THREE.ShapeGeometry(ws), { textureWidth: coarse ? 384 : 768, textureHeight: coarse ? 384 : 768, waterNormals: T.waterNormal, sunDirection: sunDir.clone(), sunColor: 0xfff2d0, waterColor: 0x1d5a48, distortionScale: 0.55, alpha: 1, fog: false });
  water.rotation.x = -Math.PI / 2; water.position.y = C.WATER_Y; water.material.uniforms.size.value = 0.55; scene.add(water);
  anim.push((t) => { water.material.uniforms.time.value = t * 0.28; });
  buildPaving(scene, M, T); tick('buildPaving');
  buildWalls(scene, M); tick('buildWalls');
  const pav = buildPavilion(scene, M, anim); tick('buildPavilion');
  buildCorridor(scene, M); buildBridge(scene, M); tick('buildCorridor');
  buildPondEdge(scene, M, outline); buildLotus(scene, M, anim); buildKoi(scene, M, anim); tick('buildPondEdge');
  buildBanyan(scene, M); buildKapok(scene, M, anim); buildBamboo(scene, M, anim); buildBanana(scene, M, anim); tick('buildBanyan');
  buildBonsai(scene, M); buildProps(scene, M); buildRockery(scene, M); buildSmallTrees(scene, M); tick('buildBonsai');
  buildFlowers(scene, M, anim, isPaved); tick('buildFlowers');
  buildFar(scene, M); tick('buildFar');
  const sky = buildSky(scene, anim, sunDir);
  return { update(t, dt) { for (const f of anim) f(t, dt); }, sky, water, pav, prof };
}
