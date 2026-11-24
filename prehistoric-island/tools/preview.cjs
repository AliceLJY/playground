// node tools/preview.cjs [out-dir] [--width 480] [--cover path.png]
// CPU composition preview of the six shots, for machines without WebGL (a CI box, or a cloud browser that
// cannot create a GL context). It rasterises the very same Three.js scene graph and the very same camera
// functions, flat-shaded with one sun and a sky gradient, water blended at its own opacity.
// It checks framing, silhouettes and what is in front of what. It is NOT a picture of the WebGL page:
// no shadows, no PBR reflections, no tone mapping. Real screenshots: tools/browser-check.cjs.
// --cover writes the 640x480 homepage cover (overview shot, 4:3, drawn at twice the size and averaged down).
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const outDir = path.resolve(args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--'))) || path.join(root, 'shots', 'preview'));
const W0 = Number(opt('--width') || 480);
const coverPath = opt('--cover');

function crc32(buf) { let c, crc = ~0; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 255; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return ~crc >>> 0; }
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w * 3; x++) raw[y * (w * 3 + 1) + 1 + x] = rgb[y * w * 3 + x]; }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const FONT = { 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001001001001', 8: '111101111101111', 9: '111101111001111' };
function label(img, w, text, x0, y0, s = 2) {
  for (const [i, ch] of [...text].entries()) { const f = FONT[ch]; if (!f) continue; for (let k = 0; k < 15; k++) if (f[k] === '1') for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) { const x = x0 + i * 4 * s + (k % 3) * s + dx, y = y0 + Math.floor(k / 3) * s + dy; const o = (y * w + x) * 3; img[o] = 20; img[o + 1] = 20; img[o + 2] = 20; } }
}
// Same gradient as the page's sky shader.
function skyColor(dy) {
  const mixv = (a, b, u) => a.map((v, i) => v + (b[i] - v) * u), sm = (e0, e1, x) => { const u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return u * u * (3 - 2 * u); };
  const top = [0.16, 0.36, 0.62], hor = [0.86, 0.80, 0.66], low = [0.50, 0.56, 0.60];
  const lin = dy > 0 ? mixv(hor, top, Math.pow(sm(0, 0.6, dy), 0.8)) : mixv(hor, low, sm(0, 0.25, -dy));
  return lin.map(v => Math.pow(v, 2.2));                          // the shader writes sRGB-ish values straight out
}

async function render(THREE, core, island, shot, aspect, W, H) {
  const t = shot.at; island.update(t); island.root.updateMatrixWorld(true);
  const pose = core.shotPoseAt(shot.key, t, aspect), s = core.SUN;
  const cam = new THREE.PerspectiveCamera(pose.fov, aspect, 0.5, 5000); cam.position.set(...pose.position); cam.up.set(...pose.up); cam.lookAt(...pose.target); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const vp = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  const img = new Float32Array(W * H * 3), depth = new Float32Array(W * H).fill(Infinity);
  const inv = cam.projectionMatrixInverse, ray = new THREE.Vector3(), camPos = cam.position;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    ray.set((x + 0.5) / W * 2 - 1, 1 - (y + 0.5) / H * 2, 0.5).applyMatrix4(inv).applyMatrix4(cam.matrixWorld).sub(camPos).normalize();
    img.set(skyColor(ray.y), (y * W + x) * 3);
  }
  const meshes = []; island.root.traverse(m => { if (m.isMesh && m.visible) meshes.push(m); });
  const clear = (m) => m.material.transparent;
  meshes.sort((a, b) => (clear(a) ? 1 : 0) - (clear(b) ? 1 : 0) || (a.renderOrder - b.renderOrder));
  const A = new THREE.Vector3(), B = new THREE.Vector3(), Cv = new THREE.Vector3(), nrm = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), mw = new THREE.Matrix4(), im = new THREE.Matrix4(), v4 = new THREE.Vector4();
  let tris = 0;
  for (const m of meshes) {
    const g = m.geometry, pos = g.attributes.position, idx = g.index, colAttr = g.attributes.color, mat = m.material;
    const alpha = mat.transparent ? mat.opacity : 1, emissive = m.userData.layer === 'emissive' && mat.emissiveIntensity > 0;
    const count = m.isInstancedMesh ? m.count : 1, triCount = (idx ? idx.count : pos.count) / 3;
    for (let inst = 0; inst < count; inst++) {
      if (m.isInstancedMesh) { m.getMatrixAt(inst, im); mw.multiplyMatrices(m.matrixWorld, im); } else mw.copy(m.matrixWorld);
      for (let f = 0; f < triCount; f++) {
        const ia = idx ? idx.getX(f * 3) : f * 3, ib = idx ? idx.getX(f * 3 + 1) : f * 3 + 1, ic = idx ? idx.getX(f * 3 + 2) : f * 3 + 2;
        A.fromBufferAttribute(pos, ia).applyMatrix4(mw); B.fromBufferAttribute(pos, ib).applyMatrix4(mw); Cv.fromBufferAttribute(pos, ic).applyMatrix4(mw);
        e1.subVectors(B, A); e2.subVectors(Cv, A); nrm.crossVectors(e1, e2).normalize();
        if (nrm.dot(new THREE.Vector3().subVectors(camPos, A)) < 0) nrm.negate();
        let c;
        if (emissive) c = mat.emissive.toArray().map(v => v * mat.emissiveIntensity);
        else {
          const a = colAttr ? [0, 1, 2].map(i => (colAttr.getComponent(ia, i) + colAttr.getComponent(ib, i) + colAttr.getComponent(ic, i)) / 3) : mat.color.toArray();
          const diff = Math.max(0, nrm.x * s[0] + nrm.y * s[1] + nrm.z * s[2]) * 1.35, amb = 0.32 + 0.18 * nrm.y;
          c = a.map(v => v * (diff + amb));
        }
        const w = [A, B, Cv].map(P => v4.set(P.x, P.y, P.z, 1).applyMatrix4(vp).w);
        if (w.some(v => v < 0.5)) continue;
        const pp = [A, B, Cv].map(P => P.clone().applyMatrix4(vp));
        const sx = pp.map(p => (p.x + 1) / 2 * W), sy = pp.map(p => (1 - p.y) / 2 * H);
        const minX = Math.max(0, Math.floor(Math.min(...sx))), maxX = Math.min(W - 1, Math.ceil(Math.max(...sx))), minY = Math.max(0, Math.floor(Math.min(...sy))), maxY = Math.min(H - 1, Math.ceil(Math.max(...sy)));
        if (minX > maxX || minY > maxY) continue;
        const area = (sx[1] - sx[0]) * (sy[2] - sy[0]) - (sx[2] - sx[0]) * (sy[1] - sy[0]); if (Math.abs(area) < 1e-9) continue;
        tris++;
        for (let py = minY; py <= maxY; py++) for (let px = minX; px <= maxX; px++) {
          const X = px + 0.5, Y = py + 0.5;
          const w0 = ((sx[1] - X) * (sy[2] - Y) - (sx[2] - X) * (sy[1] - Y)) / area, w1 = ((sx[2] - X) * (sy[0] - Y) - (sx[0] - X) * (sy[2] - Y)) / area, w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const z = 1 / (w0 / w[0] + w1 / w[1] + w2 / w[2]), k = py * W + px;
          if (z >= depth[k]) continue;
          if (alpha < 1) { for (let i = 0; i < 3; i++) img[k * 3 + i] = img[k * 3 + i] * (1 - alpha) + c[i] * alpha; }
          else { depth[k] = z; img.set(c, k * 3); }
        }
      }
    }
  }
  const out = new Uint8Array(W * H * 3);
  for (let i = 0; i < img.length; i++) { const v = img[i] / (1 + img[i] * 0.35); out[i] = Math.round(255 * Math.pow(Math.min(1, Math.max(0, v * 1.15)), 1 / 2.2)); }
  return { out, tris };
}
function downsample(src, W, H, f) {
  const w = W / f, h = H / f, out = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let i = 0; i < 3; i++) {
    let sum = 0; for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) sum += src[((y * f + dy) * W + x * f + dx) * 3 + i];
    out[(y * w + x) * 3 + i] = Math.round(sum / (f * f));
  }
  return out;
}

async function main() {
  const THREE = await import('three');
  const core = await import(path.join(root, 'src/core.js'));
  const { buildIsland } = await import(path.join(root, 'src/world.js'));
  const island = buildIsland(7);
  if (coverPath) {
    const { out } = await render(THREE, core, island, core.SHOTS[0], 4 / 3, 1280, 960);
    fs.mkdirSync(path.dirname(path.resolve(coverPath)), { recursive: true });
    fs.writeFileSync(path.resolve(coverPath), png(640, 480, downsample(out, 1280, 960, 2)));
    console.log('wrote cover', coverPath);
    return;
  }
  fs.mkdirSync(outDir, { recursive: true });
  const viewports = [['desktop', 1440, 900], ['phone', 390, 664]];
  const results = [];
  for (const [vpName, vw, vh] of viewports) {
    const aspect = vw / vh, W = vpName === 'desktop' ? W0 : Math.round(W0 * 0.5), H = Math.round(W / aspect);
    const tiles = [];
    for (const shot of core.SHOTS) {
      const { out, tris } = await render(THREE, core, island, shot, aspect, W, H);
      label(out, W, String(shot.index + 1), 6, 6);
      const name = `${String(shot.index + 1).padStart(2, '0')}-${shot.key}-${vpName}.png`;
      fs.writeFileSync(path.join(outDir, name), png(W, H, out));
      tiles.push({ out, W, H });
      results.push({ shot: shot.key, viewport: vpName, file: name, trianglesDrawn: tris });
      console.log('wrote', name, tris, 'triangles drawn');
    }
    const { W: TW, H: TH } = tiles[0], cols = 3, rows = 2, pad = 4, SW = cols * TW + (cols + 1) * pad, SH = rows * TH + (rows + 1) * pad, sheet = new Uint8Array(SW * SH * 3).fill(18);
    tiles.forEach((tile, i) => { const ox = pad + (i % cols) * (TW + pad), oy = pad + Math.floor(i / cols) * (TH + pad); for (let y = 0; y < TH; y++) sheet.set(tile.out.subarray(y * TW * 3, (y + 1) * TW * 3), ((oy + y) * SW + ox) * 3); });
    fs.writeFileSync(path.join(outDir, `sheet-${vpName}.png`), png(SW, SH, sheet));
  }
  fs.writeFileSync(path.join(outDir, 'preview.json'), JSON.stringify({ note: 'CPU composition preview, not WebGL screenshots', results }, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
