// 骑楼雨夜 · 会动的小东西：喷雾与溅浆粒子、沙井盖、补给箱、掉落的药罐、目标光柱。
import * as THREE from 'three';
import { DRAINS, CRATES, EXTRACT, rng } from './core.js';

export function createFx(scene, quality) {
  const N = quality.particles, r = rng(77);
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 4), size = new Float32Array(N);
  const vel = new Float32Array(N * 3), life = new Float32Array(N), max = new Float32Array(N), s0 = new Float32Array(N), s1 = new Float32Array(N), drag = new Float32Array(N), grav = new Float32Array(N), base = new Float32Array(N * 4);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aCol', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, uniforms: { uScale: { value: 600 } },
    vertexShader: 'attribute vec4 aCol; attribute float aSize; uniform float uScale; varying vec4 vC; void main(){ vC = aCol; vec4 mv = modelViewMatrix * vec4(position, 1.); gl_PointSize = aSize * uScale / max(.2, -mv.z); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec4 vC; void main(){ float d = length(gl_PointCoord - .5) * 2.; float a = smoothstep(1., .25, d) * vC.a; if (a < .004) discard; gl_FragColor = vec4(vC.rgb, a); }',
  });
  const points = new THREE.Points(g, mat); points.frustumCulled = false; points.layers.set(1); scene.add(points);
  let cursor = 0;
  function emit(x, y, z, vx, vy, vz, lf, a, b, R, G, Bc, A, dr = 2, gr = 0) {
    const i = cursor; cursor = (cursor + 1) % N;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    life[i] = lf; max[i] = lf; s0[i] = a; s1[i] = b; drag[i] = dr; grav[i] = gr;
    base[i * 4] = R; base[i * 4 + 1] = G; base[i * 4 + 2] = Bc; base[i * 4 + 3] = A;
  }
  const jit = k => (r() - 0.5) * 2 * k;
  function spray(o, d, vx, vz) {
    for (let k = 0; k < 5; k++) {
      const sp = 20 + r() * 6, t = r() * 0.03;
      emit(o.x + d.x * t * sp, o.y + d.y * t * sp, o.z + d.z * t * sp, d.x * sp + jit(1.7) + vx, d.y * sp + jit(1.7), d.z * sp + jit(1.7) + vz, 0.4 + r() * 0.22, 0.04, 0.8 + r() * 0.4, 0.86, 0.96, 0.9, 0.34, 3.2, -1.5);
    }
  }
  function burst(x, y, z, kind, n = 26) {
    for (let k = 0; k < n; k++) {
      const a = r() * 6.283, up = 2 + r() * 5, sp = 1 + r() * 4.5, goo = k % 3 !== 0;
      if (kind === 'goo') emit(x, y, z, Math.cos(a) * sp, up, Math.sin(a) * sp, 0.5 + r() * 0.5, goo ? 0.16 : 0.07, goo ? 0.04 : 0.05, goo ? 0.72 : 0.3, goo ? 0.86 : 0.14, goo ? 0.3 : 0.05, 0.9, 1.2, 13);
      else if (kind === 'steam') emit(x + jit(0.6), y, z + jit(0.6), jit(0.6), 0.8 + r() * 1.4, jit(0.6), 0.9 + r() * 0.6, 0.2, 0.9, 0.7, 0.85, 0.7, 0.25, 0.6, -0.4);
      else emit(x, y, z, Math.cos(a) * sp * 1.6, up * 0.7, Math.sin(a) * sp * 1.6, 0.25 + r() * 0.25, 0.1, 0.02, 1.6, 1.3, 0.6, 1, 2, 9);
    }
  }
  function stepParticles(dt) {
    for (let i = 0; i < N; i++) {
      if (life[i] <= 0) { size[i] = 0; continue; }
      life[i] -= dt;
      const k = Math.max(0, life[i] / max[i]), dk = Math.max(0, 1 - drag[i] * dt);
      vel[i * 3] *= dk; vel[i * 3 + 1] = vel[i * 3 + 1] * dk - grav[i] * dt; vel[i * 3 + 2] *= dk;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (pos[i * 3 + 1] < 0.02) { pos[i * 3 + 1] = 0.02; vel[i * 3 + 1] = 0; vel[i * 3] *= 0.5; vel[i * 3 + 2] *= 0.5; }
      size[i] = s0[i] + (s1[i] - s0[i]) * (1 - k);
      col[i * 4] = base[i * 4]; col[i * 4 + 1] = base[i * 4 + 1]; col[i * 4 + 2] = base[i * 4 + 2]; col[i * 4 + 3] = base[i * 4 + 3] * Math.min(1, k * 2.2);
    }
    g.attributes.position.needsUpdate = true; g.attributes.aCol.needsUpdate = true; g.attributes.aSize.needsUpdate = true;
  }

  // 沙井盖、光柱
  const iron = new THREE.MeshStandardMaterial({ color: '#3a3d40', roughness: 0.55, metalness: 0.7 });
  const beamG = new THREE.CylinderGeometry(0.2, 0.75, 5, 16, 1, true); beamG.translate(0, 2.5, 0);
  const beamM = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
  const drains = DRAINS.map(d => {
    const lid = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.07, 20), iron); lid.add(disc);
    for (let k = -2; k <= 2; k++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(1.3 - Math.abs(k) * 0.16, 0.03, 0.06), iron); bar.position.set(0, 0.045, k * 0.24); lid.add(bar); }
    lid.traverse(o => { o.castShadow = quality.shadow; });
    const beam = new THREE.Mesh(beamG, beamM(new THREE.Color(0.2, 0.9, 0.3))); beam.position.set(d.x, 0, d.z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.05, 6, 28), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 3, 0.8) })); ring.rotation.x = Math.PI / 2; ring.position.set(d.x, 0.04, d.z);
    scene.add(lid, beam, ring);
    return { lid, beam, ring, d };
  });
  const exitBeam = new THREE.Mesh(beamG, beamM(new THREE.Color(0.4, 1.3, 1.8))); exitBeam.position.set(EXTRACT.x, 0, EXTRACT.z); exitBeam.visible = false; scene.add(exitBeam);
  // 补给箱与掉落药罐
  const red = new THREE.MeshStandardMaterial({ color: '#b8281c', roughness: 0.6 }), lit = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.4, 0.8) }), canM = new THREE.MeshStandardMaterial({ color: '#e8c020', roughness: 0.4, metalness: 0.3, emissive: '#4a3a00' });
  const crates = CRATES.map(c => {
    const gp = new THREE.Group(); gp.position.set(c.x, 0, c.z);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.6), red); box.position.y = 0.3; box.castShadow = quality.shadow;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.08, 0.62), lit); strip.position.y = 0.42;
    const cans = new THREE.Group();
    for (let k = 0; k < 2; k++) { const cn = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.34, 10), canM); cn.position.set(-0.18 + k * 0.36, 0.77, 0); cans.add(cn); }
    gp.add(box, strip, cans); scene.add(gp);
    return { gp, strip, cans };
  });
  const drops = [];
  for (let k = 0; k < 8; k++) { const cn = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.36, 10), canM); const halo = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 6, 20), lit); halo.rotation.x = Math.PI / 2; halo.position.y = -0.28; cn.add(halo); cn.visible = false; scene.add(cn); drops.push(cn); }

  function update(sim, dt, t) {
    stepParticles(dt);
    for (const D of drains) {
      const d = sim.drains.find(q => q.id === D.d.id), k = d.sealed ? 1 : d.prog, e = k * k * (3 - 2 * k);
      D.lid.position.set(D.d.x + (1 - e) * 1.35, 0.05 + Math.sin(e * Math.PI) * 0.25 + (1 - e) * 0.02, D.d.z + (1 - e) * 0.5);
      D.lid.rotation.set(0, (1 - e) * 0.8, (1 - e) * 0.16);
      D.beam.visible = !d.sealed; D.ring.visible = !d.sealed;
      D.beam.material.opacity = 0.05 + 0.02 * Math.sin(t * 3 + D.d.x);
      D.beam.rotation.y = t * 0.3;
    }
    exitBeam.visible = sim.extractOpen; exitBeam.rotation.y = t * 0.4;
    crates.forEach((C, i) => { const on = sim.crates[i].t <= 0; C.cans.visible = on; C.strip.visible = on; });
    drops.forEach((m, i) => { const d = sim.drops[i]; m.visible = !!d; if (d) { m.position.set(d.x, 0.5 + Math.sin(t * 3 + i) * 0.08, d.z); m.rotation.y = t * 2; m.scale.setScalar(d.t > 19 ? Math.max(0.2, (22 - d.t) / 3) : 1); } });
  }
  return { update, spray, burst, resize(h, dpr) { mat.uniforms.uScale.value = h * dpr * 0.9; } };
}
