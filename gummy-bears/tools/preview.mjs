// node tools/preview.mjs [out-dir]          (default shots/cpu-preview)
// node tools/preview.mjs --cover path.png  (640×480 homepage cover; convert to webp afterwards)
// CPU preview of the four fixed scenes (row, stretch, fling landing, full pile) at desktop 1440×900 (drawn at
// half size) and phone 390×664, for machines without WebGL. It runs the very same physics, scenes and camera
// framing as the page, and rasterises the skinned bear surfaces with a rough stand-in for the page's look:
// thickness-tinted colour, a sun and a highlight, and the same coloured soft shadow spots on the table.
// It is NOT a picture of the WebGL page: no refraction, no environment reflections, no tone mapping, and the
// title and card are only outlined. Real screenshots come from tools/browser-check.cjs.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { World, FLAVORS } from '../src/physics.js';
import { SCENARIOS, SEED, runOnWorld } from '../src/scenarios.js';
import { SHADOW, frame, project, toScreen, screenRay, basis } from '../src/view.js';
import { computeNormals } from '../src/mesh.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const coverAt = args.indexOf('--cover');
const outDir = path.resolve(coverAt < 0 && args[0] ? args[0] : path.join(root, 'shots', 'cpu-preview'));

function crc32(buf) { let c, crc = ~0; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 255; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return ~crc >>> 0; }
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1); }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const srgbToLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const linToSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const hex = (h) => [1, 3, 5].map(i => srgbToLin(parseInt(h.slice(i, i + 2), 16) / 255));
const PAPER = hex('#fbfaf7');

// Same spots as the page's shadow pass: centre pushed by the light, radius and strength by height, tint by flavour.
function shadowMap(world) {
  const X0 = SHADOW.x0, Z0 = SHADOW.z0, RES = 30, GW = SHADOW.w * RES, GD = SHADOW.d * RES, map = new Float32Array(GW * GD * 3).fill(1);
  const L = SHADOW.light;
  for (let b = 0; b < world.count; b++) {
    const f = FLAVORS[world.bears[b].flavor], c = hex(f.color), tint = f.clarity ? [0.62, 0.58, 0.46] : c.map(v => v * 0.82);
    for (let i = b * world.n; i < (b + 1) * world.n; i++) {
      const y = world.x[i * 3 + 1], gx = world.x[i * 3] + L[0] * y, gz = world.x[i * 3 + 2] + L[1] * y, rad = SHADOW.radius[0] + SHADOW.radius[1] * y, a = SHADOW.strength / (1 + SHADOW.falloff * y);
      const cx = (gx - X0) * RES, cz = (gz - Z0) * RES, rp = rad * RES;
      for (let z = Math.max(0, Math.floor(cz - rp)); z <= Math.min(GD - 1, Math.ceil(cz + rp)); z++) for (let x = Math.max(0, Math.floor(cx - rp)); x <= Math.min(GW - 1, Math.ceil(cx + rp)); x++) {
        const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz) / rp; if (d >= 1) continue;
        const g = Math.exp(-d * d * 3.2) * (1 - smooth(0.8, 1, d)), k = (z * GW + x) * 3;
        for (let ch = 0; ch < 3; ch++) map[k + ch] = Math.min(map[k + ch], 1 + (tint[ch] - 1) * a * g);
      }
    }
  }
  return (x, z) => { const i = Math.floor((x - X0) * RES), j = Math.floor((z - Z0) * RES); if (i < 0 || j < 0 || i >= GW || j >= GD) return [1, 1, 1]; const k = (j * GW + i) * 3; return [map[k], map[k + 1], map[k + 2]]; };
}
function smooth(e0, e1, x) { const u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return u * u * (3 - 2 * u); }

function render(world, cam, W, H) {
  const sx = W / cam.width, sy = H / cam.height, img = new Float32Array(W * H * 3), shadow = shadowMap(world);
  // Table and paper.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const r = screenRay(cam, (x + 0.5) / sx, (y + 0.5) / sy), t = -r.origin[1] / r.dir[1];
    const s = t > 0 ? shadow(r.origin[0] + r.dir[0] * t, r.origin[2] + r.dir[2] * t) : [1, 1, 1];
    img.set(PAPER.map((v, k) => v * s[k]), (y * W + x) * 3);
  }
  // Bears: depth-buffered, normals and flavour kept per pixel, shaded afterwards.
  const depth = new Float32Array(W * H).fill(Infinity), nbuf = new Float32Array(W * H * 3), fbuf = new Int8Array(W * H).fill(-1);
  const NV = world.tpl.surface.positions.length, idx = world.tpl.surface.indices, pos = new Float32Array(NV * 3), nrm = new Float32Array(NV * 3);
  const scr = new Float32Array(NV * 3);
  for (let b = 0; b < world.count; b++) {
    world.skin(b, pos, 0); computeNormals(pos, nrm, idx, NV, 0);
    for (let v = 0; v < NV; v++) { const q = project(cam, [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]]), s = toScreen(q, cam.width, cam.height); scr[v * 3] = s.x * sx; scr[v * 3 + 1] = s.y * sy; scr[v * 3 + 2] = q.depth; }
    const fl = world.bears[b].flavor;
    for (let t = 0; t < idx.length; t += 3) {
      const A = idx[t], B = idx[t + 1], C = idx[t + 2];
      const ax = scr[A * 3], ay = scr[A * 3 + 1], bx = scr[B * 3], by = scr[B * 3 + 1], cx = scr[C * 3], cy = scr[C * 3 + 1];
      const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
      if (area >= 0) continue; // back face (screen y points down, so front faces wind negative here)
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx))), y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
      for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
        const X = px + 0.5, Y = py + 0.5;
        const w0 = ((bx - X) * (cy - Y) - (cx - X) * (by - Y)) / area, w1 = ((cx - X) * (ay - Y) - (ax - X) * (cy - Y)) / area, w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * scr[A * 3 + 2] + w1 * scr[B * 3 + 2] + w2 * scr[C * 3 + 2], k = py * W + px;
        if (z >= depth[k]) continue;
        depth[k] = z; fbuf[k] = fl;
        for (let c = 0; c < 3; c++) nbuf[k * 3 + c] = w0 * nrm[A * 3 + c] + w1 * nrm[B * 3 + c] + w2 * nrm[C * 3 + c];
      }
    }
  }
  const { x: bx, y: by, z: bz } = basis(cam.eye, cam.target), sun = norm([4, 9, 6]);
  for (let k = 0; k < W * H; k++) {
    if (fbuf[k] < 0) continue;
    const f = FLAVORS[fbuf[k]], deep = hex(f.color), edge = deep.map(v => 1 + (v - 1) * (f.clarity ? 0.35 : 0.55));
    const px = k % W, py = (k / W) | 0, ray = screenRay(cam, (px + 0.5) / sx, (py + 0.5) / sy), V = ray.dir.map(v => -v);
    const n = norm([nbuf[k * 3], nbuf[k * 3 + 1], nbuf[k * 3 + 2]]), nv = Math.max(0, dot(n, V));
    const t = Math.pow(nv, 0.65), base = edge.map((e, c) => e + (deep[c] - e) * t), alpha = f.clarity ? 0.32 + 0.3 * nv : 0.55 + 0.38 * nv;
    const diff = 0.55 + 0.45 * Math.max(0, dot(n, sun)), hv = norm(sun.map((s, c) => s + V[c])), spec = Math.pow(Math.max(0, dot(n, hv)), 90) * 1.4 + Math.pow(1 - nv, 4) * 0.25;
    for (let c = 0; c < 3; c++) img[k * 3 + c] = img[k * 3 + c] * (1 - alpha) + base[c] * diff * alpha + spec;
  }
  void bx; void by; void bz;
  const out = new Uint8Array(W * H * 3);
  for (let i = 0; i < img.length; i++) out[i] = Math.round(255 * Math.min(1, Math.max(0, linToSrgb(Math.min(1, img[i])))));
  return out;
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };
// Outline a rectangle (where the page puts the title or the card) in light grey.
function outline(img, W, H, r, s, shade = 205) {
  const x0 = Math.round(r.x0 * s), x1 = Math.round(r.x1 * s), y0 = Math.round(r.y0 * s), y1 = Math.round(r.y1 * s);
  const put = (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) img.fill(shade, (y * W + x) * 3, (y * W + x) * 3 + 3); };
  for (let x = x0; x <= x1; x++) { put(x, y0); put(x, y1); }
  for (let y = y0; y <= y1; y++) { put(x0, y); put(x1, y); }
}
function downsample(src, W, H, f) {
  const w = W / f, h = H / f, out = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let i = 0; i < 3; i++) {
    let sum = 0; for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) sum += src[((y * f + dy) * W + x * f + dx) * 3 + i];
    out[(y * w + x) * 3 + i] = Math.round(sum / (f * f));
  }
  return out;
}

export { render, png };
const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (!isMain) { /* imported for its helpers */ } else if (coverAt >= 0) {
  const file = path.resolve(args[coverAt + 1]);
  const world = new World({ seed: SEED });
  runOnWorld(world, SCENARIOS.pile);
  const W = 1280, H = 960, cam = frame(W, H, world.arena, { region: { x0: 40, x1: W - 40, y0: 150, y1: H - 90 } });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, png(640, 480, downsample(render(world, cam, W, H), W, H, 2)));
  console.log('wrote cover', file);
} else {
  fs.mkdirSync(outDir, { recursive: true });
  const results = [];
  for (const [vp, vw, vh, quality, scale] of [['desktop', 1440, 900, 'high', 0.5], ['phone', 390, 664, 'low', 1]]) {
    const W = Math.round(vw * scale), H = Math.round(vh * scale);
    for (const [i, key] of ['row', 'stretch', 'fling', 'pile'].entries()) {
      const world = new World({ seed: SEED, quality }), cam = frame(vw, vh, world.arena);
      const run = runOnWorld(world, SCENARIOS[key]);
      const img = render(world, cam, W, H);
      // Where the title and the card sit on the page (see LAYOUT in src/view.js and the CSS).
      if (cam.phone) { outline(img, W, H, { x0: 16, x1: vw - 16, y0: 12, y1: 64 }, scale); outline(img, W, H, { x0: 10, x1: vw - 10, y0: vh - 202, y1: vh - 10 }, scale); }
      else { outline(img, W, H, { x0: 40, x1: 580, y0: 36, y1: 238 }, scale); outline(img, W, H, { x0: vw - 336, x1: vw - 36, y0: 36, y1: 430 }, scale); }
      const name = `${String(i + 1).padStart(2, '0')}-${key}-${vp}.png`;
      fs.writeFileSync(path.join(outDir, name), png(W, H, img));
      const s = run.snapshot;
      results.push({ scene: key, viewport: vp, quality, file: name, simTime: s.time, bears: s.count, stretch: s.stretch, maxStretch: +run.notes.maxStretch.toFixed(3), moving: s.bears.filter(b => b.moving).length, volume: [Math.min(...s.bears.map(b => b.volume)), Math.max(...s.bears.map(b => b.volume))], landedAt: run.notes.landedAt, settledAt: run.notes.settledAt });
      console.log('wrote', name);
    }
  }
  fs.writeFileSync(path.join(outDir, 'preview.json'), JSON.stringify({ note: 'CPU preview from tools/preview.mjs, not WebGL screenshots: no refraction, reflections or tone mapping; title and card only outlined.', seed: SEED, results }, null, 2));
}
