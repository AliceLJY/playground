// node tools/preview.cjs [out-dir] [--width 480]
// CPU composition preview for the ten shots, for machines without WebGL (e.g. a CI box or a cloud
// browser that cannot create a GL context). It rasterises the very same Three.js scene graph and the
// very same camera functions, flat-shaded, with an analytic Earth, atmosphere and sun.
// It checks framing, silhouettes and what is in front of what. It is NOT a picture of the WebGL page:
// no shadows, no PBR reflections, no panel shader, no tone mapping. Real screenshots: browser-check.cjs.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const outDir = path.resolve(args.find(a => !a.startsWith('--')) || path.join(root, 'shots', 'preview'));
const W0 = Number((args[args.indexOf('--width') + 1]) || 480);

function crc32(buf) { let c, crc = ~0; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 255; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return ~crc >>> 0; }
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w * 3; x++) raw[y * (w * 3 + 1) + 1 + x] = rgb[y * w * 3 + x]; }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
// 3x5 digit font for labels.
const FONT = { 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001001001001', 8: '111101111101111', 9: '111101111001111' };
function label(img, w, text, x0, y0, s = 2) {
  for (const [i, ch] of [...text].entries()) { const f = FONT[ch]; if (!f) continue; for (let k = 0; k < 15; k++) if (f[k] === '1') for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) { const x = x0 + i * 4 * s + (k % 3) * s + dx, y = y0 + Math.floor(k / 3) * s + dy; const o = (y * w + x) * 3; img[o] = 111; img[o + 1] = 227; img[o + 2] = 255; } }
}
const hash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz); let r = 0;
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) r += hash(xi + a, yi + b, zi + c) * (a ? u : 1 - u) * (b ? v : 1 - v) * (c ? w : 1 - w);
  return r;
}
const fbm = (x, y, z) => vnoise(x, y, z) * 0.5 + vnoise(x * 2.03 + 7, y * 2.03, z * 2.03) * 0.25 + vnoise(x * 4.1, y * 4.1 + 3, z * 4.1) * 0.125;

async function main() {
  const THREE = await import('three');
  const core = await import(path.join(root, 'src/core.js'));
  const { buildStation } = await import(path.join(root, 'src/station.js'));
  const st = buildStation(2026);
  fs.mkdirSync(outDir, { recursive: true });
  const viewports = [['desktop', 1440, 900], ['portrait', 390, 664]];
  const results = [];
  for (const [vpName, vw, vh] of viewports) {
    const aspect = vw / vh, W = vpName === 'desktop' ? W0 : Math.round(W0 * 0.5), H = Math.round(W / aspect);
    const tiles = [];
    for (const shot of core.SHOTS) {
      const t = shot.at; st.update(t); st.root.updateMatrixWorld(true);
      const pose = core.shotPoseAt(shot.key, t, aspect), s = core.sunDir(t), vis = core.sunVisibility([0, 0, 0], s);
      const cam = new THREE.PerspectiveCamera(pose.fov, aspect, 0.25, 5000); cam.position.set(...pose.position); cam.up.set(...pose.up); cam.lookAt(...pose.target); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
      const vp = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      const img = new Float32Array(W * H * 3), depth = new Float32Array(W * H).fill(Infinity);
      // Background: Earth, atmosphere and sun per pixel.
      const inv = new THREE.Matrix4().copy(cam.projectionMatrixInverse), ray = new THREE.Vector3(), camPos = cam.position;
      const C = core.EARTH.center, R = core.EARTH.radius;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        ray.set((x + 0.5) / W * 2 - 1, 1 - (y + 0.5) / H * 2, 0.5).applyMatrix4(inv).applyMatrix4(cam.matrixWorld).sub(camPos).normalize();
        const d = [ray.x, ray.y, ray.z], o = [camPos.x, camPos.y, camPos.z];
        let col = [0.012, 0.018, 0.04];
        const hit = core.earthHit(o, d);
        const oc = core.sub(o, C), b = core.dot(oc, d), closest = Math.sqrt(Math.max(0, core.dot(oc, oc) - b * b));
        if (hit < Infinity) {
          const p = core.add(o, core.scale(d, hit)), n = core.norm(core.sub(p, C)), ndl = core.dot(n, s);
          const q = core.scale(n, 2.2), land = fbm(q[0] + 3, q[1] + 3, q[2] + 3) > 0.53 ? 1 : 0, cloud = Math.max(0, fbm(n[0] * 3.1, n[1] * 3.1 + 40, n[2] * 3.1) - 0.48) * 3;
          const alb = land ? [0.12, 0.17, 0.07] : [0.02, 0.09, 0.2], lit = Math.max(0, ndl) * 1.3;
          col = alb.map((a, i) => a * lit + Math.min(1, cloud) * 0.9 * lit + (ndl < 0 ? land * 0.02 * [1, 0.6, 0.3][i] : 0));
          const rim = Math.pow(1 - Math.max(0, -core.dot(n, d)), 3);
          col = col.map((c, i) => c + rim * [0.15, 0.3, 0.7][i] * Math.max(0, Math.min(1, ndl * 2 + 0.5)));
        } else {
          const hgt = (closest - R) / (R * 0.022);
          if (b < 0 && hgt < 12) {
            const mid = core.add(o, core.scale(d, -b)), up = core.norm(core.sub(mid, C)), sunUp = core.dot(up, s), forward = Math.pow(Math.max(0, core.dot(d, s)), 18);
            const dens = Math.exp(-Math.max(hgt, 0) * 1.6), litShell = Math.max(0, Math.min(1, (sunUp + 0.35) / 0.55));
            const dawn = Math.exp(-((sunUp * 6) ** 2)) * (0.35 + 3 * forward);
            col = col.map((c, i) => c + dens * ([0.28, 0.55, 1][i] * 0.85 * litShell + [1, 0.45, 0.16][i] * dawn));
          }
          const sd = core.dot(d, s);
          if (sd > 0.99988) col = [6, 5.6, 5]; else if (sd > 0.98) col = col.map((c, i) => c + Math.exp(-(1 - sd) * 400) * [1, 0.8, 0.6][i] * 0.8);
        }
        img.set(col, (y * W + x) * 3);
      }
      // Rasterise station triangles.
      const meshes = []; st.root.traverse(m => { if (m.isMesh && m.visible) meshes.push(m); });
      const order = (m) => (m.userData.layer === 'glass' || m.userData.role.includes('plume') ? 1 : 0);
      meshes.sort((a, b) => order(a) - order(b));
      const A = new THREE.Vector3(), B = new THREE.Vector3(), Cv = new THREE.Vector3(), nrm = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), mw = new THREE.Matrix4(), im = new THREE.Matrix4(), ic = new THREE.Color();
      let tris = 0;
      for (const m of meshes) {
        const g = m.geometry, pos = g.attributes.position, idx = g.index, colAttr = g.attributes.color, mat = m.material;
        const layer = m.userData.layer, glass = layer === 'glass' && m.userData.role !== 'wing-cells', plume = m.userData.role.includes('plume');
        if (plume && mat.opacity < 0.01) continue;
        const count = m.isInstancedMesh ? m.count : 1, triCount = (idx ? idx.count : pos.count) / 3;
        const base = mat.color ? mat.color.clone() : new THREE.Color(1, 1, 1), emis = mat.emissive && mat.emissiveIntensity > 0 && (mat.emissive.r + mat.emissive.g + mat.emissive.b) > 0.05 ? mat.emissive.clone().multiplyScalar(mat.emissiveIntensity) : null;
        for (let inst = 0; inst < count; inst++) {
          if (m.isInstancedMesh) { m.getMatrixAt(inst, im); mw.multiplyMatrices(m.matrixWorld, im); } else mw.copy(m.matrixWorld);
          let tint = null; if (m.isInstancedMesh && m.instanceColor) { m.getColorAt(inst, ic); tint = ic.clone(); }
          for (let f = 0; f < triCount; f++) {
            const ia = idx ? idx.getX(f * 3) : f * 3, ib = idx ? idx.getX(f * 3 + 1) : f * 3 + 1, icc = idx ? idx.getX(f * 3 + 2) : f * 3 + 2;
            A.fromBufferAttribute(pos, ia).applyMatrix4(mw); B.fromBufferAttribute(pos, ib).applyMatrix4(mw); Cv.fromBufferAttribute(pos, icc).applyMatrix4(mw);
            e1.subVectors(B, A); e2.subVectors(Cv, A); nrm.crossVectors(e1, e2).normalize();
            const toCam = new THREE.Vector3().subVectors(camPos, A); if (nrm.dot(toCam) < 0) nrm.negate();
            let c;
            if (emis) c = (tint || emis).toArray().map((v, i) => (tint ? v * mat.emissiveIntensity : v));
            else if (plume) c = [0.8 * mat.opacity, 0.9 * mat.opacity, mat.opacity];
            else {
              const a = colAttr ? [colAttr.getX(ia), colAttr.getY(ia), colAttr.getZ(ia)] : base.toArray();
              const diff = Math.max(0, nrm.x * s[0] + nrm.y * s[1] + nrm.z * s[2]) * 1.7 * vis, amb = 0.1 + 0.14 * Math.max(0, -nrm.y) + (m.userData.layer === 'organic' ? 0.55 : 0);
              const metal = mat.metalness || 0;
              c = a.map(v => v * (diff * (1 - 0.35 * metal) + amb + metal * 0.08 * (0.6 - 0.4 * nrm.y)));
            }
            // Project.
            const pa = A.clone().applyMatrix4(vp), pb = B.clone().applyMatrix4(vp), pc = Cv.clone().applyMatrix4(vp);
            const wa = new THREE.Vector4(A.x, A.y, A.z, 1).applyMatrix4(vp).w, wb = new THREE.Vector4(B.x, B.y, B.z, 1).applyMatrix4(vp).w, wc = new THREE.Vector4(Cv.x, Cv.y, Cv.z, 1).applyMatrix4(vp).w;
            if (wa < 0.25 || wb < 0.25 || wc < 0.25) continue;
            const sx = [pa, pb, pc].map(p => (p.x + 1) / 2 * W), sy = [pa, pb, pc].map(p => (1 - p.y) / 2 * H), sz = [wa, wb, wc];
            const minX = Math.max(0, Math.floor(Math.min(...sx))), maxX = Math.min(W - 1, Math.ceil(Math.max(...sx))), minY = Math.max(0, Math.floor(Math.min(...sy))), maxY = Math.min(H - 1, Math.ceil(Math.max(...sy)));
            if (minX > maxX || minY > maxY) continue;
            const area = (sx[1] - sx[0]) * (sy[2] - sy[0]) - (sx[2] - sx[0]) * (sy[1] - sy[0]); if (Math.abs(area) < 1e-9) continue;
            tris++;
            for (let py = minY; py <= maxY; py++) for (let px = minX; px <= maxX; px++) {
              const X = px + 0.5, Y = py + 0.5;
              const w0 = ((sx[1] - X) * (sy[2] - Y) - (sx[2] - X) * (sy[1] - Y)) / area, w1 = ((sx[2] - X) * (sy[0] - Y) - (sx[0] - X) * (sy[2] - Y)) / area, w2 = 1 - w0 - w1;
              if (w0 < 0 || w1 < 0 || w2 < 0) continue;
              const z = 1 / (w0 / sz[0] + w1 / sz[1] + w2 / sz[2]), k = py * W + px;
              if (z >= depth[k]) continue;
              if (glass || plume) { const al = glass ? 0.3 : 0.6; for (let i = 0; i < 3; i++) img[k * 3 + i] = img[k * 3 + i] * (1 - al) + c[i] * al + (glass ? 0.02 : 0); }
              else { depth[k] = z; img.set(c, k * 3); }
            }
          }
        }
      }
      const out = new Uint8Array(W * H * 3);
      for (let i = 0; i < img.length; i++) { const v = img[i] / (1 + img[i] * 0.55); out[i] = Math.round(255 * Math.pow(Math.min(1, Math.max(0, v * 1.25)), 1 / 2.2)); }
      label(out, W, String(shot.index + 1), 6, 6);
      const name = `${String(shot.index + 1).padStart(2, '0')}-${shot.key}-${vpName}.png`;
      fs.writeFileSync(path.join(outDir, name), png(W, H, out));
      tiles.push({ out, W, H });
      results.push({ shot: shot.key, viewport: vpName, file: name, triangles: tris });
      console.log('wrote', name, tris, 'triangles drawn');
    }
    // Contact sheet: 5 columns x 2 rows.
    const { W: TW, H: TH } = tiles[0], cols = 5, rows = 2, pad = 4, SW = cols * TW + (cols + 1) * pad, SH = rows * TH + (rows + 1) * pad, sheet = new Uint8Array(SW * SH * 3).fill(18);
    tiles.forEach((tile, i) => { const ox = pad + (i % cols) * (TW + pad), oy = pad + Math.floor(i / cols) * (TH + pad); for (let y = 0; y < TH; y++) sheet.set(tile.out.subarray(y * TW * 3, (y + 1) * TW * 3), ((oy + y) * SW + ox) * 3); });
    fs.writeFileSync(path.join(outDir, `sheet-${vpName}.png`), png(SW, SH, sheet));
  }
  fs.writeFileSync(path.join(outDir, 'preview.json'), JSON.stringify(results, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
