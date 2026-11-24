// node tools/preview.cjs [out-dir] [--width 480] [--cover path.png]
// CPU composition preview of the five fixed scenes, for machines without WebGL (a CI box, or a cloud
// browser that cannot create a GL context). It rasterises the very same Three.js scene graph, reached by the
// very same play (playScene from a fixed seed) and the very same camera function, flat-shaded with one key
// light over the ivory ground. It checks framing, silhouettes and what is in front of what.
// It is NOT a picture of the WebGL page: no shadows, no brush noise, no grain, no tone mapping, no UI text.
// Real screenshots: tools/browser-check.cjs.
// --cover writes the 640x480 homepage cover (full fan, 4:3, drawn at twice the size and averaged down).
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
const srgbToLin = (v) => Math.pow(v, 2.2);
const LIGHT = (() => { const v = [-3.5, 6, 4.5], l = Math.hypot(...v); return v.map(x => x / l); })();

function render(THREE, core, bird, sceneName, aspect, W, H, frame = null) {
  const sim = core.createSim({ seed: 7, aspect });
  const result = core.playScene(sim, sceneName);
  bird.update(sim.state.pose);
  const pose = frame ? { ...core.cameraFor(aspect), ...frame(core.cameraFor(aspect)) } : core.cameraFor(aspect);
  const cam = new THREE.PerspectiveCamera(pose.fov, aspect, 0.3, 80); cam.position.set(...pose.position); cam.up.set(0, 1, 0); cam.lookAt(...pose.target); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const vp = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  const ivory = new THREE.Color('#efe6d3');
  const bg = [ivory.r, ivory.g, ivory.b];
  const img = new Float32Array(W * H * 3), depth = new Float32Array(W * H).fill(Infinity);
  for (let k = 0; k < W * H; k++) img.set(bg, k * 3);
  const meshes = []; bird.root.traverse(m => { if (m.isMesh && m.visible) meshes.push(m); });
  const A = new THREE.Vector3(), B = new THREE.Vector3(), Cv = new THREE.Vector3(), nrm = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), mw = new THREE.Matrix4(), im = new THREE.Matrix4(), v4 = new THREE.Vector4(), camPos = cam.position;
  let tris = 0;
  for (const m of meshes) {
    const g = m.geometry, pos = g.attributes.position, idx = g.index, colAttr = g.attributes.color;
    const count = m.isInstancedMesh ? m.count : 1, triCount = (idx ? idx.count : pos.count) / 3;
    for (let inst = 0; inst < count; inst++) {
      if (m.isInstancedMesh) { m.getMatrixAt(inst, im); mw.multiplyMatrices(m.matrixWorld, im); } else mw.copy(m.matrixWorld);
      for (let f = 0; f < triCount; f++) {
        const ia = idx ? idx.getX(f * 3) : f * 3, ib = idx ? idx.getX(f * 3 + 1) : f * 3 + 1, ic = idx ? idx.getX(f * 3 + 2) : f * 3 + 2;
        A.fromBufferAttribute(pos, ia).applyMatrix4(mw); B.fromBufferAttribute(pos, ib).applyMatrix4(mw); Cv.fromBufferAttribute(pos, ic).applyMatrix4(mw);
        e1.subVectors(B, A); e2.subVectors(Cv, A); nrm.crossVectors(e1, e2).normalize();
        if (nrm.dot(new THREE.Vector3().subVectors(camPos, A)) < 0) nrm.negate();
        const a = [0, 1, 2].map(i => (colAttr.getComponent(ia, i) + colAttr.getComponent(ib, i) + colAttr.getComponent(ic, i)) / 3);
        const diff = Math.max(0, nrm.x * LIGHT[0] + nrm.y * LIGHT[1] + nrm.z * LIGHT[2]) * 1.15, amb = 0.42 + 0.2 * nrm.y;
        const c = a.map(v => v * (diff + amb));
        const w = [A, B, Cv].map(P => v4.set(P.x, P.y, P.z, 1).applyMatrix4(vp).w);
        if (w.some(v => v < 0.3)) continue;
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
          depth[k] = z; img.set(c, k * 3);
        }
      }
    }
  }
  const out = new Uint8Array(W * H * 3);
  for (let i = 0; i < img.length; i++) out[i] = Math.round(255 * Math.pow(Math.min(1, Math.max(0, img[i])), 1 / 2.2));
  return { out, tris, result, snapshot: sim.snapshot() };
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
  const { buildPeacock } = await import(path.join(root, 'src/peacock.js'));
  const bird = buildPeacock();
  if (coverPath) {
    // The cover frames the bird tighter than the page does (same camera position, narrower lens).
    const { out } = render(THREE, core, bird, 'display', 4 / 3, 1280, 960, (c) => ({ fov: c.fov * 0.62, target: [c.target[0], 1.12, c.target[2]] }));
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
    for (const [i, name] of core.SCENES.entries()) {
      const { out, tris, result, snapshot } = render(THREE, core, bird, name, aspect, W, H);
      label(out, W, String(i + 1), 6, 6);
      const file = `${String(i + 1).padStart(2, '0')}-${name}-${vpName}.png`;
      fs.writeFileSync(path.join(outDir, file), png(W, H, out));
      results.push({ scene: name, viewport: vpName, file, reached: result, action: snapshot.action, counts: snapshot.counts, trianglesDrawn: tris });
      console.log('wrote', file, result, snapshot.action, tris, 'triangles drawn');
    }
  }
  fs.writeFileSync(path.join(outDir, 'preview.json'), JSON.stringify({ note: 'CPU composition preview, not WebGL screenshots', results }, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
