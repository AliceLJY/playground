// 骑楼雨夜 · 手里的东西：右手高压喷雾枪（黄机身、透明药罐、金属喷管），左手一只红凉拖。挂在相机上，只在主画面里画。
import * as THREE from 'three';

export function createGun(camera, quality) {
  const root = new THREE.Group(); root.scale.setScalar(0.34); camera.add(root);
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.05, ...o });
  const yellow = M('#d8a514', { roughness: 0.42 }), dark = M('#141518', { roughness: 0.7 }), metal = M('#9aa0a6', { roughness: 0.28, metalness: 0.9 }), glove = M('#1c1f24', { roughness: 0.9 }), sleeve = M('#27303a', { roughness: 0.95 });
  const box = (w, h, d, m, x, y, z, p) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); p.add(o); return o; };
  const cyl = (r0, r1, h, m, x, y, z, p, rx = 0) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, 14), m); o.position.set(x, y, z); o.rotation.x = rx; p.add(o); return o; };
  const gun = new THREE.Group(); root.add(gun);
  const cap = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.3, 6, 14), yellow); cap.rotation.x = Math.PI / 2; cap.scale.set(0.86, 1, 1.12); gun.add(cap);
  box(0.03, 0.02, 0.2, dark, 0, 0.115, 0.0, gun); box(0.03, 0.05, 0.02, dark, 0, 0.09, -0.09, gun); box(0.03, 0.05, 0.02, dark, 0, 0.09, 0.09, gun);
  cyl(0.066, 0.066, 0.03, dark, 0, 0, -0.14, gun, Math.PI / 2); cyl(0.066, 0.066, 0.03, dark, 0, 0, 0.16, gun, Math.PI / 2);
  cyl(0.05, 0.062, 0.05, dark, 0, 0, 0.235, gun, Math.PI / 2);
  cyl(0.024, 0.024, 0.3, metal, 0, 0.012, -0.37, gun, Math.PI / 2); cyl(0.036, 0.03, 0.05, metal, 0, 0.012, -0.24, gun, Math.PI / 2); cyl(0.03, 0.02, 0.045, dark, 0, 0.012, -0.53, gun, Math.PI / 2);
  box(0.05, 0.15, 0.065, dark, 0, -0.13, 0.12, gun).rotation.x = 0.28; box(0.012, 0.05, 0.03, metal, 0, -0.085, 0.06, gun);
  cyl(0.03, 0.03, 0.05, metal, 0, -0.085, -0.08, gun);
  const tank = cyl(0.062, 0.056, 0.2, new THREE.MeshStandardMaterial({ color: '#dfe8e0', transparent: true, opacity: 0.32, roughness: 0.1, depthWrite: false }), 0, -0.21, -0.08, gun);
  const liquid = cyl(0.052, 0.048, 0.18, new THREE.MeshStandardMaterial({ color: '#c8d840', emissive: '#5a6a10', roughness: 0.3, transparent: true, opacity: 0.85 }), 0, -0.21, -0.08, gun);
  box(0.085, 0.1, 0.11, glove, 0, -0.13, 0.13, gun).rotation.x = 0.28; box(0.09, 0.09, 0.4, sleeve, 0.02, -0.2, 0.36, gun).rotation.x = -0.3;
  const tip = new THREE.Object3D(); tip.position.set(0, 0.012, -0.56); gun.add(tip);
  const mist = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.8, 2.6), transparent: true, opacity: 0.7 })); mist.position.copy(tip.position); gun.add(mist);
  // 凉拖
  const slip = new THREE.Group(); root.add(slip);
  const sole = M('#c8281c', { roughness: 0.6 }), strap = M('#f2efe6', { roughness: 0.6 });
  box(0.12, 0.028, 0.3, sole, 0, 0, 0, slip); box(0.1, 0.03, 0.08, sole, 0, 0, -0.17, slip);
  box(0.018, 0.02, 0.17, strap, 0.03, 0.04, -0.07, slip).rotation.y = 0.33; box(0.018, 0.02, 0.17, strap, -0.03, 0.04, -0.07, slip).rotation.y = -0.33;
  box(0.09, 0.09, 0.11, glove, 0, -0.04, 0.16, slip); box(0.09, 0.09, 0.4, sleeve, 0, -0.07, 0.42, slip).rotation.x = -0.15;
  root.traverse(o => { o.layers.set(1); if (o.isMesh) o.castShadow = false; });
  const st = { bob: 0, swayX: 0, swayY: 0, fire: 0, kick: 0, lower: 0 };
  const tipW = new THREE.Vector3();
  function update(p, dt, t, look, mode) {
    const playing = mode === 'play';
    st.bob += dt * Math.min(1.6, p.speed / 4) * 9;
    st.swayX += (-look.dx * 0.6 - st.swayX) * Math.min(1, dt * 10); st.swayY += (look.dy * 0.6 - st.swayY) * Math.min(1, dt * 10);
    st.fire += ((p.firing ? 1 : 0) - st.fire) * Math.min(1, dt * 18);
    const reload = p.reloadT > 0 ? Math.sin(Math.min(1, (1.4 - p.reloadT) / 1.4) * Math.PI) : 0;
    st.lower += (((p.sprinting ? 0.55 : 0) + reload) - st.lower) * Math.min(1, dt * 9);
    const bx = Math.sin(st.bob) * 0.012 * Math.min(1, p.speed / 3), by = Math.abs(Math.cos(st.bob)) * 0.012 * Math.min(1, p.speed / 3);
    const jx = st.fire * (Math.sin(t * 61) * 0.004), jy = st.fire * (Math.sin(t * 47) * 0.004);
    gun.position.set(0.36 + bx + st.swayX * 0.05 + jx, -0.3 - by + st.swayY * 0.05 - st.lower * 0.32 + jy, -0.74 + st.fire * 0.03);
    gun.rotation.set(0.02 - st.lower * 0.7 + st.swayY * 0.1, 0.07 + st.swayX * 0.12 + st.lower * 0.3, st.swayX * 0.1 - reload * 0.5);
    const lv = Math.max(0.02, p.tank / 100) * (reload > 0.5 ? 0 : 1);
    liquid.scale.y = lv; liquid.position.y = -0.21 - 0.09 * (1 - lv); liquid.visible = lv > 0.03;
    mist.visible = p.firing; mist.scale.setScalar(1 + Math.sin(t * 90) * 0.3);
    // 凉拖：平时垂在左下角，拍的时候从左上抡到中间
    const s = p.slapT, sw = s < 0.34 ? s / 0.34 : 1, ease = sw < 0.38 ? sw / 0.38 : 1, back = sw < 0.38 ? 0 : (sw - 0.38) / 0.62;
    if (s < 0.34 && playing) {
      slip.position.set(-0.42 + ease * 0.5 - back * 0.2, 0.2 - ease * 0.42 - back * 0.3, -0.62 - ease * 0.34 + back * 0.2);
      slip.rotation.set(-1.25 + ease * 1.5, 0.5 - ease * 0.6, 0.9 - ease * 1.1);
    } else { slip.position.set(-0.52 - bx, -0.86 - by - st.lower * 0.1, -0.62); slip.rotation.set(0.9, 0.35, 0.3); }
    root.visible = mode !== 'title';
    tip.getWorldPosition(tipW);
    return tipW;
  }
  return { update, root };
}
