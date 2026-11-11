// 把整座园子搭起来：麻石铺地、三片连通的水面、天空远山，再叫各个部件。
import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import * as C from './core.js';
import { Batch, sph, instanced, rng, makeTextures, makeMaterials } from './kit.js';
import { buildHall, buildCorridorBridge, buildOctPavilion, buildWalls, buildPondEdge, buildFar } from './architecture.js';
import { buildKapok, buildLychee, buildJack, buildBamboo, buildBanana, buildVine, buildBonsai, buildYing, buildLotus, buildKoi, buildProps, buildOutside } from './plants.js';

function buildGround(scene, M, T) {
  // 整个院子铺麻石条板（铺地用什么石没查到来源，是示意）；水面处挖空
  const B = C.BOUNDS, sh = new THREE.Shape(); sh.moveTo(B.x0 - 1, -(B.z1 + 1)); sh.lineTo(B.x1 + 1, -(B.z1 + 1)); sh.lineTo(B.x1 + 1, -(B.z0 - 1)); sh.lineTo(B.x0 - 1, -(B.z0 - 1)); sh.lineTo(B.x0 - 1, -(B.z1 + 1));
  const hole = new THREE.Path(); C.POND.forEach((p, i) => i ? hole.lineTo(p.x, -p.z) : hole.moveTo(p.x, -p.z)); hole.closePath(); sh.holes.push(hole);
  const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); { const a = g.attributes.uv.array, p = g.attributes.position.array; for (let i = 0; i < a.length / 2; i++) { a[i * 2] = p[i * 3] * 0.24; a[i * 2 + 1] = p[i * 3 + 2] * 0.24; } }
  const ground = new THREE.Mesh(g, M.paving); ground.receiveShadow = true; scene.add(ground);
  { const S = 450, o = new THREE.Shape(); o.moveTo(-S, -S); o.lineTo(S, -S); o.lineTo(S, S); o.lineTo(-S, S); o.lineTo(-S, -S); const h2 = new THREE.Path(); h2.moveTo(B.x0 - 0.9, -(B.z1 + 0.9)); h2.lineTo(B.x0 - 0.9, -(B.z0 - 0.9)); h2.lineTo(B.x1 + 0.9, -(B.z0 - 0.9)); h2.lineTo(B.x1 + 0.9, -(B.z1 + 0.9)); h2.closePath(); o.holes.push(h2); const og = new THREE.ShapeGeometry(o); og.rotateX(-Math.PI / 2); { const a = og.attributes.uv.array, p = og.attributes.position.array; for (let i = 0; i < a.length / 2; i++) { a[i * 2] = p[i * 3] * 0.3; a[i * 2 + 1] = p[i * 3 + 2] * 0.3; } } const out = new THREE.Mesh(og, new THREE.MeshStandardMaterial({ map: T.grass, roughness: 1 })); out.position.y = -0.02; out.receiveShadow = true; scene.add(out); }
  // 池壁：石砌，直上直下
  const pos = [], idx = [], uv = [], O = C.POND; let acc = 0;
  O.forEach((p, i) => { const q = O[(i + 1) % O.length], len = Math.hypot(q.x - p.x, q.z - p.z), k = pos.length / 3; pos.push(p.x, 0.0, p.z, p.x, -1.3, p.z, q.x, 0.0, q.z, q.x, -1.3, q.z); uv.push(acc, 0, acc, 0.65, acc + len * 0.5, 0, acc + len * 0.5, 0.65); acc += len * 0.5; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); });
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); wg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); wg.setIndex(idx); wg.computeVertexNormals();
  scene.add(new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ map: T.granite, color: '#9a968a', roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 8 })   /* 北岸那段池壁和敞厅台基的南立面在同一个平面上（z = RECT.z0），两个面抢深度会闪条纹；让池壁在深度上退后一点，重合处始终是台基在前 */));
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(26, 14), new THREE.MeshStandardMaterial({ color: '#2b3a30', roughness: 1 })); bed.rotation.x = -Math.PI / 2; bed.position.set(4.6, -1.3, 4.4); scene.add(bed);
}

function buildSky(scene, anim, sunDir) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { uSun: { value: sunDir } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `varying vec3 vD; uniform vec3 uSun; void main(){ vec3 d = normalize(vD); float h = clamp(d.y, 0., 1.);
      vec3 c = mix(vec3(.84,.9,.93), vec3(.5,.67,.86), pow(h, .6)); c = mix(c, vec3(.9,.92,.9), smoothstep(.14, -.02, d.y));
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

function buildHills(scene) {
  const R = rng(161);
  for (const [r, h, col, n] of [[330, 60, '#7fa7c9', 26], [240, 42, '#6f9fb4', 30]]) {
    const mat = new THREE.MeshBasicMaterial({ color: col, fog: false }), items = [];
    for (let i = 0; i < n; i++) { const a = i / n * 6.283 + R() * 0.1; items.push({ x: Math.cos(a) * r, y: -4, z: Math.sin(a) * r, sx: 46 + R() * 40, sy: h * (0.5 + R() * 0.7), sz: 46 + R() * 40, ry: R() * 6 }); }
    scene.add(instanced(new THREE.ConeGeometry(1, 1, 7), mat, items, { cast: false, receive: false }));
  }
}

export function buildWorld(scene, { coarse, sunDir, flatWater = false, still = false }) {
  const prof = [], tick = n => prof.push([n, Math.round(performance.now())]); tick('start');
  const T = makeTextures(), M = makeMaterials(T), anim = []; tick('tex');
  buildGround(scene, M, T); tick('ground');
  // 水面：一张带倒影的水，盖住长方池、水道和八角池
  const ws = new THREE.Shape(); C.POND.forEach((p, i) => i ? ws.lineTo(p.x, -p.z) : ws.moveTo(p.x, -p.z)); ws.closePath();
  // 诊断开关 ?flatwater：不要倒影，换成一张平静的纯色水面，用来判断画面问题是不是出在倒影上
  let water;
  if (flatWater) { water = new THREE.Mesh(new THREE.ShapeGeometry(ws), new THREE.MeshStandardMaterial({ color: 0x2c6b58, roughness: 0.25, metalness: 0.1 })); water.rotation.x = -Math.PI / 2; water.position.y = C.WATER_Y; water.receiveShadow = true; scene.add(water); }
  else {
  water = new Water(new THREE.ShapeGeometry(ws), { textureWidth: coarse ? 512 : 768, textureHeight: coarse ? 512 : 768, waterNormals: T.waterNormal, sunDirection: sunDir.clone(), sunColor: 0xfff2d0, waterColor: 0x4a6a1c, distortionScale: 0.5, alpha: 1, fog: false });
  water.rotation.x = -Math.PI / 2; water.position.y = C.WATER_Y; water.material.uniforms.size.value = 0.55; scene.add(water);
  // 倒影柔化：倒影贴图比屏幕小，砖缝、窗格这类细线映进去再被波纹扰动，视角一动就一格一格地闪。
  // 给倒影贴图开多级渐远，采样时往模糊的一级偏，细线化成一片颜色。
  { const rt = water.material.uniforms.mirrorSampler.value; rt.generateMipmaps = true; rt.minFilter = THREE.LinearMipmapLinearFilter;
    const key = 'mirrorCoord.xy / mirrorCoord.w + distortion )', fs = water.material.fragmentShader;
    if (!fs.includes(key)) throw new Error('Water shader changed: reflection sample line not found');
    let fs2 = fs.replace(key, 'mirrorCoord.xy / mirrorCoord.w + distortion, 2.2 )');
    // 池水是浑的深绿（实拍三座园都是），不是映着蓝天的清水：垂直看下去多一些水色，倒影只在斜看时强
    const k2 = 'vec3 scatter = max( 0.0, dot( surfaceNormal, eyeDirection ) ) * waterColor;';
    if (fs2.includes(k2)) fs2 = fs2.replace(k2, 'vec3 scatter = ( 0.55 + 0.45 * max( 0.0, dot( surfaceNormal, eyeDirection ) ) ) * waterColor * 1.5;').replace('reflectionSample + specularLight, reflectance );', 'reflectionSample * vec3( 0.86, 0.94, 0.8 ) + specularLight, reflectance * 0.8 );');
    water.material.fragmentShader = fs2; water.material.needsUpdate = true; }
  anim.push((t) => { water.material.uniforms.time.value = t * 0.28; });
  }
  buildWalls(scene, M); tick('walls');
  buildHall(scene, M); tick('hall');
  buildCorridorBridge(scene, M); buildOctPavilion(scene, M); buildPondEdge(scene, M); tick('bridge');
  buildLotus(scene, M, still ? [] : anim); buildKoi(scene, M, anim);   // 诊断开关 ?still：荷叶荷花不摇 tick('lotus');
  buildKapok(scene, M, anim); buildLychee(scene, M); buildJack(scene, M); buildBamboo(scene, M); buildBanana(scene, M, anim); buildVine(scene, M); tick('trees');
  buildBonsai(scene, M); buildProps(scene, M); buildYing(scene, M, T, anim); buildOutside(scene, M); tick('props');
  buildFar(scene, M); buildHills(scene); tick('far');
  const sky = buildSky(scene, anim, sunDir);
  return { update(t, dt) { for (const f of anim) f(t, dt); }, sky, water, prof };
}
