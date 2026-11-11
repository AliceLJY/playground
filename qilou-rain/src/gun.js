// 骑楼雨夜 · 手里的东西：右手高压喷雾枪（黄机身、透明药罐、金属喷管），左手一只红凉拖。挂在相机上，只在主画面里画。
import * as THREE from 'three';

// 贴图都在打开页面时画到画布上：一张颜色、一张凹凸兼粗糙度，没有图片文件
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function canvasPair(w, h, paint) {
  const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const cc = mk(), bc = mk(), c = cc.getContext('2d'), b = bc.getContext('2d');
  b.fillStyle = '#808080'; b.fillRect(0, 0, w, h);
  paint(c, b, w, h);
  const map = new THREE.CanvasTexture(cc); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8; map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const bump = new THREE.CanvasTexture(bc); bump.anisotropy = 8; bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  return { map, bump };
}
function speckle(ctx, r, w, h, n, col, a0, a1, s0, s1) { for (let i = 0; i < n; i++) { ctx.globalAlpha = a0 + r() * (a1 - a0); ctx.fillStyle = col; const s = s0 + r() * (s1 - s0); ctx.beginPath(); ctx.ellipse(r() * w, r() * h, s, s * (0.5 + r()), r() * 3, 0, 7); ctx.fill(); } ctx.globalAlpha = 1; }
function scratches(c, b, r, w, h, n, col) { for (let i = 0; i < n; i++) { const x = r() * w, y = r() * h, len = 8 + r() * r() * 110, ang = (r() - 0.5) * 0.7 + (r() < 0.75 ? Math.PI / 2 : 0), x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len; const lw = 0.5 + r() * 1.4;
  for (const [ctx, st, al] of [[c, col, 0.25 + r() * 0.55], [b, '#303030', 0.6]]) { ctx.globalAlpha = al; ctx.strokeStyle = st; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke(); } } c.globalAlpha = b.globalAlpha = 1; }
function roachIcon(ctx, s) { ctx.fillStyle = '#16120e'; ctx.strokeStyle = '#16120e'; ctx.lineWidth = s * 0.05; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.ellipse(0, s * 0.08, s * 0.2, s * 0.36, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.ellipse(0, -s * 0.3, s * 0.15, s * 0.12, 0, 0, 7); ctx.fill();
  for (const sd of [-1, 1]) { for (const [y0, dx, dy] of [[-0.12, 0.42, -0.2], [0.05, 0.46, 0.06], [0.22, 0.42, 0.34]]) { ctx.beginPath(); ctx.moveTo(sd * s * 0.14, s * y0); ctx.lineTo(sd * s * 0.3, s * (y0 + dy * 0.3)); ctx.lineTo(sd * s * dx, s * (y0 + dy)); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(sd * s * 0.06, -s * 0.4); ctx.quadraticCurveTo(sd * s * 0.2, -s * 0.62, sd * s * 0.4, -s * 0.52); ctx.stroke(); } }
// 机身：旧黄漆、两头警示斜纹、禁蟑标、铭牌、掉漆露铁、划痕、缝里的灰
function bodySkin() { return canvasPair(1024, 512, (c, b, w, h) => { const r = rng(7);
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#c99410'); g.addColorStop(0.5, '#dba916'); g.addColorStop(1, '#c08a0e'); c.fillStyle = g; c.fillRect(0, 0, w, h);
  speckle(c, r, w, h, 260, '#8a6208', 0.03, 0.12, 6, 46); speckle(c, r, w, h, 180, '#f0c84a', 0.03, 0.1, 4, 30);
  for (const y0 of [0, h - 70]) { c.save(); c.beginPath(); c.rect(0, y0, w, 70); c.clip(); c.fillStyle = '#16171a'; c.fillRect(0, y0, w, 70); c.fillStyle = '#d9a514'; for (let x = -80; x < w + 80; x += 64) { c.beginPath(); c.moveTo(x, y0 + 70); c.lineTo(x + 32, y0 + 70); c.lineTo(x + 72, y0); c.lineTo(x + 40, y0); c.fill(); } c.restore(); b.fillStyle = '#8c8c8c'; b.fillRect(0, y0, w, 70); }
  for (const y of [78, h - 78]) { c.fillStyle = 'rgba(30,22,6,.55)'; c.fillRect(0, y - 2, w, 4); b.fillStyle = '#383838'; b.fillRect(0, y - 3, w, 6); }
  for (const u of [0.63, 0.13]) { const cx = u * w, cy = h * 0.44; c.save(); c.translate(cx, cy); c.rotate(u > 0.5 ? -Math.PI / 2 : Math.PI / 2);
    c.fillStyle = '#ece6d6'; c.beginPath(); c.arc(0, 0, 92, 0, 7); c.fill(); roachIcon(c, 120); c.strokeStyle = '#c0281c'; c.lineWidth = 15; c.beginPath(); c.arc(0, 0, 84, 0, 7); c.stroke(); c.beginPath(); c.moveTo(-60, -60); c.lineTo(60, 60); c.stroke();
    c.fillStyle = '#16171a'; c.fillRect(-150, 112, 300, 62); c.fillStyle = '#ece6d6'; c.font = '700 40px system-ui, "PingFang SC", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('高压除虫 13', 0, 144);
    c.restore(); b.save(); b.translate(cx, cy); b.fillStyle = '#8e8e8e'; b.beginPath(); b.arc(0, 0, 92, 0, 7); b.fill(); b.restore(); }
  // 掉漆：边缘和随机几处露出底下的铁
  for (let i = 0; i < 70; i++) { const x = r() * w, y = r() < 0.6 ? (r() < 0.5 ? 60 + r() * 40 : h - 100 + r() * 40) : r() * h, n = 3 + (r() * 5 | 0); c.fillStyle = r() < 0.5 ? '#6f6a5e' : '#4a3a22'; b.fillStyle = '#4a4a4a'; for (const ctx of [c, b]) { ctx.beginPath(); for (let k = 0; k < n; k++) ctx.ellipse(x + (r() - 0.5) * 22, y + (r() - 0.5) * 12, 3 + r() * 9, 2 + r() * 5, r() * 3, 0, 7); ctx.fill(); } }
  scratches(c, b, r, w, h, 150, '#f6e6a8'); scratches(c, b, r, w, h, 60, '#5a4a20');
  speckle(c, r, w, h, 90, '#2a2008', 0.05, 0.2, 10, 60); speckle(b, r, w, h, 2400, '#909090', 0.2, 0.5, 0.6, 1.6); }); }
// 手套：织纹、缝线、掌背防滑胶条
function gloveSkin() { return canvasPair(256, 256, (c, b, w, h) => { const r = rng(21); c.fillStyle = '#23262b'; c.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) { const k = ((x + y) / 4) % 2; c.fillStyle = k ? '#2c3036' : '#1b1e22'; c.fillRect(x, y, 4, 4); b.fillStyle = k ? '#9a9a9a' : '#6a6a6a'; b.fillRect(x, y, 4, 4); }
  speckle(c, r, w, h, 60, '#3d3528', 0.08, 0.25, 6, 26); speckle(c, r, w, h, 40, '#0c0d0f', 0.1, 0.3, 6, 30); }); }
function rubberSkin() { return canvasPair(256, 256, (c, b, w, h) => { const r = rng(5); c.fillStyle = '#1a1b1e'; c.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 16) { b.fillStyle = '#b0b0b0'; b.fillRect(0, y, w, 8); c.fillStyle = '#22242a'; c.fillRect(0, y, w, 8); }
  speckle(c, r, w, h, 90, '#5a5348', 0.06, 0.22, 3, 20); scratches(c, b, r, w, h, 40, '#6a6a6a'); speckle(b, r, w, h, 900, '#909090', 0.2, 0.5, 0.6, 1.4); }); }
function metalSkin() { return canvasPair(256, 256, (c, b, w, h) => { const r = rng(11); c.fillStyle = '#a3a8ad'; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 500; i++) { const y = r() * h; c.globalAlpha = 0.08 + r() * 0.15; c.strokeStyle = r() < 0.5 ? '#e8ecf0' : '#5a6068'; c.lineWidth = 0.6 + r(); c.beginPath(); c.moveTo(0, y); c.lineTo(w, y + (r() - 0.5) * 3); c.stroke(); } c.globalAlpha = 1;
  speckle(c, r, w, h, 50, '#6a4a22', 0.08, 0.3, 3, 16); speckle(b, r, w, h, 700, '#606060', 0.2, 0.5, 0.6, 1.6); }); }
function fabricSkin() { return canvasPair(256, 256, (c, b, w, h) => { const r = rng(3); c.fillStyle = '#3d4c5c'; c.fillRect(0, 0, w, h);
  for (let i = 0; i < w; i += 3) { c.fillStyle = i % 6 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.12)'; c.fillRect(i, 0, 1.5, h); c.fillRect(0, i, w, 1.5); b.fillStyle = i % 6 ? '#8c8c8c' : '#6c6c6c'; b.fillRect(i, 0, 1.5, h); b.fillRect(0, i, w, 1.5); }
  speckle(c, r, w, h, 70, '#11161c', 0.1, 0.35, 8, 40); speckle(c, r, w, h, 200, '#5a6a7a', 0.2, 0.5, 0.5, 1.4); }); }
function gaugeFace() { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d'); c.fillStyle = '#e9e4d4'; c.beginPath(); c.arc(64, 64, 62, 0, 7); c.fill();
  c.strokeStyle = '#1a1a1a'; for (let i = 0; i <= 20; i++) { const a = Math.PI * 0.75 + i / 20 * Math.PI * 1.5; c.lineWidth = i % 5 ? 2 : 4; c.beginPath(); c.moveTo(64 + Math.cos(a) * (i % 5 ? 50 : 44), 64 + Math.sin(a) * (i % 5 ? 50 : 44)); c.lineTo(64 + Math.cos(a) * 57, 64 + Math.sin(a) * 57); c.stroke(); }
  c.strokeStyle = '#c0281c'; c.lineWidth = 7; c.beginPath(); c.arc(64, 64, 53, Math.PI * 1.9, Math.PI * 2.25); c.stroke(); c.fillStyle = '#1a1a1a'; c.font = '700 16px system-ui'; c.textAlign = 'center'; c.fillText('MPa', 64, 96);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; }

// 一只握着东西的手套手：掌、四指三节、拇指两节、指节垫、腕口。坐标系：握的东西竖在 -x 一侧，四指朝 -z 伸出后向 -x 卷
function buildHand(mat, pad, trim, curl, thumbCurl) {
  const h = new THREE.Group();
  const cap = (r, len, m, p) => { const o = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 5, 10), m); o.rotation.x = Math.PI / 2; o.position.z = -len / 2; p.add(o); return o; };
  const palm = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.05, 6, 12), mat); palm.scale.set(0.62, 1.05, 1.15); palm.position.set(0.012, 0, 0.012); h.add(palm);
  const L = [[0.036, 0.027, 0.022], [0.04, 0.03, 0.024], [0.038, 0.028, 0.022], [0.03, 0.022, 0.019]], R = [0.0125, 0.013, 0.0125, 0.011];
  for (let f = 0; f < 4; f++) {
    let p = new THREE.Group(); p.position.set(0.006, 0.036 - f * 0.024, -0.03); p.rotation.y = curl[0]; p.rotation.x = (1.5 - f) * 0.05; h.add(p);
    const kn = new THREE.Mesh(new THREE.SphereGeometry(0.0155, 10, 8), pad); kn.scale.set(1.15, 0.8, 1); kn.position.set(0.006, 0, -0.002); p.add(kn);
    for (let k = 0; k < 3; k++) { cap(R[f] * (1 - k * 0.08), L[f][k], mat, p); if (k < 2) { const j = new THREE.Mesh(new THREE.SphereGeometry(R[f] * 1.08, 8, 6), mat); j.position.z = -L[f][k]; p.add(j); const n = new THREE.Group(); n.position.z = -L[f][k]; n.rotation.y = curl[k + 1]; p.add(n); p = n; } }
  }
  let t = new THREE.Group(); t.position.set(0.002, 0.04, 0.018); t.rotation.set(-0.5, thumbCurl[0], 0); h.add(t);
  cap(0.0155, 0.034, mat, t); const t2 = new THREE.Group(); t2.position.z = -0.034; t2.rotation.y = thumbCurl[1]; t.add(t2); cap(0.014, 0.028, mat, t2);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.07, 0.05), pad); back.position.set(0.034, 0, 0.012); h.add(back);
  for (let k = 0; k < 3; k++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.06, 0.006), trim); s.position.set(0.039, 0, -0.004 + k * 0.016); h.add(s); }
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.03, 0.03, 14), mat); cuff.rotation.x = Math.PI / 2; cuff.scale.set(0.7, 1, 1.1); cuff.position.set(0.012, -0.002, 0.058); h.add(cuff);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.012, 14), trim); band.rotation.x = Math.PI / 2; band.scale.set(0.7, 1, 1.1); band.position.set(0.012, -0.002, 0.07); h.add(band);
  return h;
}
function sleeve(mat, trim, len) { const g = new THREE.Group(); const a = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.052, len, 14, 6), mat); const pc = a.geometry.attributes.position; for (let i = 0; i < pc.count; i++) { const y = pc.getY(i), k = 1 + 0.05 * Math.sin(y * 60 + pc.getX(i) * 40); pc.setX(i, pc.getX(i) * k); pc.setZ(i, pc.getZ(i) * k); } a.geometry.computeVertexNormals(); a.rotation.x = Math.PI / 2; a.position.z = len / 2; g.add(a);
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.041, 0.022, 14), trim); c.rotation.x = Math.PI / 2; c.position.z = 0.011; g.add(c); return g; }

export function createGun(camera, quality) {
  const root = new THREE.Group(); root.scale.setScalar(0.34); camera.add(root);
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.05, ...o });
  const skinB = bodySkin(), skinG = gloveSkin(), skinR = rubberSkin(), skinM = metalSkin(), skinF = fabricSkin();
  const rep = (t, x, y) => { const c = t.clone(); c.repeat.set(x, y); c.needsUpdate = true; return c; };
  const yellow = new THREE.MeshStandardMaterial({ map: skinB.map, bumpMap: skinB.bump, bumpScale: 1.6, roughnessMap: skinB.bump, roughness: 0.75, metalness: 0.1 });
  const dark = new THREE.MeshStandardMaterial({ map: rep(skinR.map, 2, 2), bumpMap: rep(skinR.bump, 2, 2), bumpScale: 1.4, roughness: 0.78, metalness: 0.05 });
  const metal = new THREE.MeshStandardMaterial({ map: skinM.map, bumpMap: skinM.bump, bumpScale: 0.6, roughnessMap: skinM.bump, roughness: 0.6, metalness: 0.9 });
  const brass = new THREE.MeshStandardMaterial({ map: skinM.map, color: '#d8a850', bumpMap: skinM.bump, bumpScale: 0.6, roughness: 0.38, metalness: 0.9 });
  const glove = new THREE.MeshStandardMaterial({ map: rep(skinG.map, 3, 3), bumpMap: rep(skinG.bump, 3, 3), bumpScale: 1.2, roughness: 0.92 });
  const pad = M('#3c4148', { roughness: 0.6, bumpMap: rep(skinR.bump, 2, 2), bumpScale: 1 }), trim = M('#c9a21a', { roughness: 0.7 });
  const cloth = new THREE.MeshStandardMaterial({ map: rep(skinF.map, 3, 4), bumpMap: rep(skinF.bump, 3, 4), bumpScale: 1.2, roughness: 0.95 });
  const red = M('#b8281c', { roughness: 0.5 }), white = M('#e8e4d8', { roughness: 0.6 });
  const box = (w, h, d, m, x, y, z, p) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); p.add(o); return o; };
  const cyl = (r0, r1, h, m, x, y, z, p, rx = 0, seg = 20) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m); o.position.set(x, y, z); o.rotation.x = rx; p.add(o); return o; };
  const lathe = (pts, m, z, p) => { const o = new THREE.Mesh(new THREE.LatheGeometry(pts.map(q => new THREE.Vector2(q[0], q[1])), 28), m); o.rotation.x = Math.PI / 2; o.position.z = z; p.add(o); return o; };
  const tube = (pts, r, m, p, seg = 24) => { const o = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(q => new THREE.Vector3(...q))), seg, r, 8), m); p.add(o); return o; };
  const H = Math.PI / 2, gun = new THREE.Group(); root.add(gun);
  // 机身：贴图筒身 + 两头车出来的胶套、前肩、箍
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.064, 0.25, 36, 1, true), yellow); body.rotation.x = H; body.position.z = 0.0; gun.add(body);
  lathe([[0.064, -0.002], [0.069, 0], [0.069, 0.012], [0.064, 0.014], [0.062, 0.03], [0.052, 0.052], [0.04, 0.06], [0.036, 0.075], [0.03, 0.078]], dark, -0.125 - 0.078 + 0.078, gun).rotation.x = -H;
  lathe([[0.064, -0.002], [0.07, 0], [0.07, 0.014], [0.066, 0.016], [0.066, 0.024], [0.07, 0.026], [0.07, 0.036], [0.064, 0.04], [0.056, 0.056], [0.036, 0.064], [0.03, 0.058], [0.022, 0.058], [0.02, 0.064], [0.0, 0.064]], dark, 0.125, gun);
  cyl(0.019, 0.019, 0.012, brass, 0, 0, 0.192, gun, H); cyl(0.008, 0.008, 0.02, metal, 0, 0, 0.2, gun, H, 8);
  for (const z of [-0.07, 0.065]) { const o = new THREE.Mesh(new THREE.TorusGeometry(0.0655, 0.0035, 6, 36), metal); o.position.z = z; gun.add(o); box(0.012, 0.014, 0.012, metal, 0, 0.07, z, gun); }
  // 提手：一根弯管加两个座
  tube([[0, 0.066, -0.1], [0, 0.105, -0.095], [0, 0.125, -0.06], [0, 0.128, 0.0], [0, 0.125, 0.045], [0, 0.105, 0.07], [0, 0.066, 0.075]], 0.011, dark, gun);
  for (const z of [-0.1, 0.075]) cyl(0.017, 0.02, 0.012, metal, 0, 0.068, z, gun);
  // 喷管：座、散热片、铜接头、管、喷嘴
  cyl(0.024, 0.024, 0.3, metal, 0, 0.012, -0.37, gun, H); cyl(0.036, 0.03, 0.05, metal, 0, 0.012, -0.235, gun, H);
  for (let k = 0; k < 5; k++) cyl(0.031 - k * 0.001, 0.031 - k * 0.001, 0.007, dark, 0, 0.012, -0.275 - k * 0.02, gun, H);
  cyl(0.03, 0.03, 0.03, brass, 0, 0.012, -0.215, gun, H, 6); cyl(0.027, 0.027, 0.02, brass, 0, 0.012, -0.5, gun, H, 6); cyl(0.03, 0.02, 0.045, dark, 0, 0.012, -0.53, gun, H); cyl(0.012, 0.012, 0.012, brass, 0, 0.012, -0.556, gun, H);
  // 握把（防滑胶套）、扳机与护圈
  const grip = box(0.046, 0.15, 0.062, dark, 0, -0.13, 0.12, gun); grip.rotation.x = 0.28;
  for (let k = 0; k < 6; k++) box(0.05, 0.006, 0.066, pad, 0, -0.06 + k * 0.022 - 0.07, 0, grip);
  box(0.01, 0.05, 0.022, metal, 0, -0.088, 0.062, gun).rotation.x = -0.2;
  tube([[0, -0.064, 0.02], [0, -0.1, 0.0], [0, -0.135, 0.02], [0, -0.14, 0.075]], 0.005, dark, gun, 12);
  // 压力表：壳、表盘、指针、玻璃
  cyl(0.036, 0.036, 0.028, dark, 0, 0.082, 0.14, gun); cyl(0.038, 0.038, 0.006, metal, 0, 0.097, 0.14, gun);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.032, 24), new THREE.MeshStandardMaterial({ map: gaugeFace(), roughness: 0.5 })); face.rotation.x = -H; face.position.set(0, 0.0975, 0.14); gun.add(face);
  box(0.003, 0.002, 0.026, red, 0.006, 0.0995, 0.134, gun).rotation.y = 0.7; cyl(0.004, 0.004, 0.004, dark, 0, 0.1, 0.14, gun);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.032, 24), new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.16, roughness: 0.05, depthWrite: false })); glass.rotation.x = -H; glass.position.set(0, 0.1015, 0.14); gun.add(glass);
  cyl(0.008, 0.008, 0.03, brass, 0, 0.068, 0.14, gun);
  // 药罐：箍、透明罐、药水、刻度、底
  cyl(0.03, 0.03, 0.05, metal, 0, -0.085, -0.08, gun); cyl(0.064, 0.064, 0.014, metal, 0, -0.115, -0.08, gun, 0, 24); cyl(0.058, 0.05, 0.016, dark, 0, -0.315, -0.08, gun, 0, 24);
  const tank = cyl(0.062, 0.056, 0.2, new THREE.MeshStandardMaterial({ color: '#dfe8e0', transparent: true, opacity: 0.3, roughness: 0.08, depthWrite: false }), 0, -0.21, -0.08, gun, 0, 28);
  const liquid = cyl(0.052, 0.048, 0.18, new THREE.MeshStandardMaterial({ color: '#c8d840', emissive: '#5a6a10', roughness: 0.25, transparent: true, opacity: 0.85 }), 0, -0.21, -0.08, gun, 0, 24);
  for (let k = 0; k < 7; k++) box(k % 2 ? 0.012 : 0.022, 0.003, 0.002, white, -0.02, -0.14 - k * 0.022, -0.08 + 0.0605 - k * 0.0006, gun);
  // 软管：药罐底到机身后段
  tube([[0.03, -0.3, -0.08], [0.075, -0.335, -0.03], [0.092, -0.27, 0.05], [0.082, -0.15, 0.1], [0.06, -0.04, 0.13], [0.045, 0.02, 0.15]], 0.0105, dark, gun, 32);
  cyl(0.014, 0.014, 0.016, brass, 0.03, -0.3, -0.08, gun, H, 8); cyl(0.014, 0.014, 0.016, brass, 0.047, 0.026, 0.15, gun, 0, 8);
  // 会亮的部分：机身侧面一排状态灯、喷管根的能量环、药罐口一圈光
  const led = c => new THREE.MeshBasicMaterial({ color: new THREE.Color(c[0], c[1], c[2]) }), cyan = led([0.3, 2.4, 2.6]), amberL = led([2.6, 1.5, 0.2]);
  for (let k = 0; k < 4; k++) { const a = 2.8, o = box(0.005, 0.008, 0.007, k < 3 ? cyan : amberL, Math.sin(a) * -0.066, Math.cos(a) * -0.066, 0.076 + k * 0.011, gun); o.rotation.z = -a; }
  for (const z of [-0.262, -0.302, -0.342]) { const o = new THREE.Mesh(new THREE.TorusGeometry(0.0335, 0.0028, 6, 24), cyan); o.position.set(0, 0.012, z); gun.add(o); }
  { const o = new THREE.Mesh(new THREE.TorusGeometry(0.063, 0.003, 6, 30), led([0.9, 2.2, 0.3])); o.rotation.x = H; o.position.set(0, -0.125, -0.08); gun.add(o); }
  // 右手与袖子
  const rh = buildHand(glove, pad, trim, [0.5, 1.25, 1.0, 0.8], [1.9, 0.5]); rh.scale.setScalar(1.5); rh.position.set(0.04, -0.15, 0.128); rh.rotation.set(0.28, 0, 0); gun.add(rh);
  const rs = sleeve(cloth, trim, 0.5); rs.scale.set(1.25, 1.25, 1); rs.position.set(0.058, -0.185, 0.225); rs.rotation.set(0.5, 0.22, 0); gun.add(rs);
  const tip = new THREE.Object3D(); tip.position.set(0, 0.012, -0.56); gun.add(tip);
  const mist = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.8, 2.6), transparent: true, opacity: 0.7 })); mist.position.copy(tip.position); gun.add(mist);
  // 凉拖：鞋底、鞋面带、夹脚柱、底纹，左手从后跟捏住
  const slip = new THREE.Group(); root.add(slip);
  const sole = M('#c8281c', { roughness: 0.62, bumpMap: rep(skinR.bump, 1, 3), bumpScale: 1.2 }), strap = M('#c8281c', { roughness: 0.45 });
  const outline = () => { const sh = new THREE.Shape(), P = [[0, -0.2], [0.045, -0.19], [0.064, -0.14], [0.066, -0.06], [0.054, 0.03], [0.05, 0.1], [0.04, 0.145], [0, 0.16], [-0.04, 0.145], [-0.05, 0.1], [-0.052, 0.03], [-0.062, -0.06], [-0.06, -0.14], [-0.042, -0.19]]; sh.moveTo(P[0][0], P[0][1]); sh.splineThru(P.slice(1).concat([P[0]]).map(q => new THREE.Vector2(q[0], q[1]))); return sh; };
  const slab = (d, m, y) => { const g = new THREE.ExtrudeGeometry(outline(), { depth: d, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2, curveSegments: 20 }); g.rotateX(Math.PI / 2); const o = new THREE.Mesh(g, m); o.position.y = y; slip.add(o); return o; };
  const topSkin = canvasPair(256, 512, (c, b, w, h) => { const r = rng(33); c.fillStyle = '#e9dcc4'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 10) for (let x = (y / 10 % 2) * 5; x < w; x += 10) { b.fillStyle = '#a8a8a8'; b.beginPath(); b.arc(x, y, 2.4, 0, 7); b.fill(); c.fillStyle = 'rgba(120,96,60,.18)'; c.beginPath(); c.arc(x, y, 2.4, 0, 7); c.fill(); }
    const fp = (x, y, rx, ry, a) => { c.globalAlpha = a; c.fillStyle = '#6a5236'; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, 7); c.fill(); }; fp(128, 400, 52, 70, 0.3); fp(128, 190, 60, 90, 0.26); for (let k = 0; k < 5; k++) fp(60 + k * 34, 70 - Math.sin(k * 0.8) * 16, 13, 17, 0.3); c.globalAlpha = 1;
    speckle(c, r, w, h, 80, '#3a2c1a', 0.05, 0.2, 4, 24); scratches(c, b, r, w, h, 30, '#fff6e0'); });
  slab(0.022, sole, 0); const top = slab(0.004, new THREE.MeshStandardMaterial({ map: topSkin.map, bumpMap: topSkin.bump, bumpScale: 1.2, roughness: 0.8 }), 0.012);
  { const uv = top.geometry.attributes.uv, pc = top.geometry.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, (pc.getX(i) + 0.07) / 0.14, (0.17 - pc.getZ(i)) / 0.38); }
  for (let k = 0; k < 9; k++) box(0.1 - Math.abs(k - 4) * 0.008, 0.004, 0.012, M('#8a1c14'), 0, -0.03, -0.15 + k * 0.035, slip);
  for (const sd of [-1, 1]) tube([[0, 0.012, -0.12], [sd * 0.012, 0.04, -0.1], [sd * 0.04, 0.052, -0.04], [sd * 0.056, 0.03, 0.02], [sd * 0.054, 0.012, 0.04]], 0.008, strap, slip, 16);
  cyl(0.009, 0.009, 0.03, strap, 0, 0.022, -0.12, slip, 0, 10); cyl(0.014, 0.014, 0.004, strap, 0, 0.038, -0.12, slip, 0, 10);
  const lh = buildHand(glove, pad, trim, [0.15, 0.5, 0.5, 0.4], [1.2, 0.9]); lh.scale.set(-1.5, 1.5, 1.5); lh.rotation.z = Math.PI / 2; lh.position.set(0, -0.06, 0.2); slip.add(lh);
  const ls = sleeve(cloth, trim, 0.5); ls.scale.set(1.25, 1.25, 1); ls.position.set(0, -0.07, 0.3); ls.rotation.set(0.15, 0, 0); slip.add(ls);
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
    gun.position.set(0.33 + bx + st.swayX * 0.05 + jx, -0.3 - by + st.swayY * 0.05 - st.lower * 0.32 + jy, -0.74 + st.fire * 0.03);
    gun.rotation.set(0.04 - st.lower * 0.7 + st.swayY * 0.1, 0.16 + st.swayX * 0.12 + st.lower * 0.3, -0.2 + st.swayX * 0.1 - reload * 0.5);
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
