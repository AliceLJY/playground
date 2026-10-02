// Procedural floor textures (oak / walnut planks, tiles, stone), drawn on a canvas from a fixed seed.
// Copied from the author's floor-plan film project (web/src/v2/textures.js); only the import line changed.
import * as THREE from 'three';
import { rng } from './core.js';

function canvasTex(canvas, metersPerTile, colorSpace = THREE.SRGBColorSpace) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = colorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / metersPerTile, 1 / metersPerTile);
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

const hex = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));

// 木地板：板宽 0.19 m、板长 0.9–2.2 m 错缝，每块板色差 + 顺纹细线 + 少量节疤
export function woodFloor({ seed = 7, base, dark, light, size = 4, px = 2048 }) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d');
  const r = rng(seed);
  const ppm = px / size;
  const plankW = 0.19 * ppm;
  const rows = Math.round(px / plankW);
  const pw = px / rows;
  for (let row = 0; row < rows; row++) {
    let x = -r() * 2.0 * ppm;
    const y0 = row * pw;
    while (x < px) {
      const len = (0.9 + r() * 1.3) * ppm;
      const k = r();
      const col = k < 0.5 ? mix(dark, base, k * 2) : mix(base, light, (k - 0.5) * 2);
      const drawAt = (ox) => {
        g.fillStyle = hex(col);
        g.fillRect(x + ox, y0, len, pw);
        // 顺纹：细线沿板长方向，微微起伏
        const lines = 14 + Math.floor(r() * 10);
        for (let i = 0; i < lines; i++) {
          const yy = y0 + r() * pw;
          const amp = 0.6 + r() * 2.2, freq = 0.004 + r() * 0.01, ph = r() * 6.28;
          g.strokeStyle = `rgba(${dark[0] - 20},${dark[1] - 20},${dark[2] - 20},${0.05 + r() * 0.12})`;
          g.lineWidth = 0.6 + r() * 1.4;
          g.beginPath();
          for (let s = 0; s <= 24; s++) {
            const xx = x + ox + (len * s) / 24;
            const yv = yy + Math.sin(xx * freq + ph) * amp;
            if (s) g.lineTo(xx, yv); else g.moveTo(xx, yv);
          }
          g.stroke();
        }
        if (r() < 0.12) {   // 节疤
          const kx = x + ox + r() * len, ky = y0 + pw * (0.3 + r() * 0.4);
          const grd = g.createRadialGradient(kx, ky, 0, kx, ky, 6 + r() * 6);
          grd.addColorStop(0, `rgba(${dark[0] - 40},${dark[1] - 40},${dark[2] - 40},0.55)`);
          grd.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = grd;
          g.fillRect(kx - 14, ky - 14, 28, 28);
        }
        // 板缝
        g.fillStyle = `rgba(${Math.max(0, dark[0] - 60)},${Math.max(0, dark[1] - 60)},${Math.max(0, dark[2] - 60)},0.55)`;
        g.fillRect(x + ox, y0, 1.6, pw);
        g.fillRect(x + ox, y0 + pw - 1.4, len, 1.4);
      };
      drawAt(0);
      if (x + len > px) drawAt(-px);   // 横向无缝平铺
      x += len;
    }
  }
  return canvasTex(c, size);
}

// 方砖：砖色随机微差 + 灰缝
export function tiles({ seed = 11, base, jitter = 10, grout = [160, 156, 150], tile = 0.6, size = 2.4, px = 1024 }) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d');
  const r = rng(seed);
  const n = Math.round(size / tile), tp = px / n;
  g.fillStyle = hex(grout);
  g.fillRect(0, 0, px, px);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const d = (r() - 0.5) * jitter;
    g.fillStyle = hex(base.map((v) => Math.round(v + d)));
    g.fillRect(i * tp + 2, j * tp + 2, tp - 4, tp - 4);
    for (let s = 0; s < 40; s++) {   // 石材细斑
      g.fillStyle = `rgba(0,0,0,${r() * 0.035})`;
      g.fillRect(i * tp + r() * tp, j * tp + r() * tp, 2 + r() * 6, 2 + r() * 6);
    }
  }
  return canvasTex(c, size);
}
