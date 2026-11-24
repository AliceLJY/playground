// Camera framing and screen geometry, as plain math with no Three.js, so Node tests can check it.
// The camera looks at the table from the front and above. Its distance and a sideways/vertical shift of the
// projection are chosen so the whole table area (with room for a pile) lands inside the "bear region" of
// the screen: the part not used by the title and the control card. The same numbers drive the renderer,
// pointer picking and the __PLAYTEST__ screen coordinates.
import { ARENA } from './physics.js';

// Layout breakpoint and the pixel sizes the page's CSS uses for the title and the card. Keep in step with
// index.template.html (the browser check measures the real elements against the region).
export const PHONE_MAX_WIDTH = 700;
export const LAYOUT = {
  desktop: { titleBottom: 248, cardLeftFromRight: 360, margin: 28 },
  phone: { titleBottom: 78, cardTopFromBottom: 214, margin: 10 },
};
// Narrow or clearly portrait screens put the card under the bears instead of beside them.
export const isPhoneLayout = (w, h = 0) => w < PHONE_MAX_WIDTH || h > w * 1.15;

// The part of the screen the bears may use, in pixels.
export function bearRegion(w, h) {
  if (isPhoneLayout(w, h)) {
    const L = LAYOUT.phone;
    return { x0: L.margin, x1: w - L.margin, y0: L.titleBottom, y1: Math.max(L.titleBottom + 120, h - L.cardTopFromBottom) };
  }
  const L = LAYOUT.desktop;
  return { x0: L.margin, x1: Math.max(L.margin + 200, w - L.cardLeftFromRight), y0: Math.min(L.titleBottom, h * 0.4), y1: h - L.margin };
}

// Points that must fit: the table area's corners at the table and at pile height.
const PILE = 1.8;
export function framePoints(A = ARENA) {
  const pts = [];
  for (const x of [-A.x, A.x]) for (const z of [-A.z, A.z]) for (const y of [0, PILE]) pts.push([x, y, z]);
  return pts;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };

// Camera basis like Three.js Object3D.lookAt for a camera: z points from the target to the eye.
export function basis(eye, target) {
  const z = norm(sub(eye, target)), x = norm(cross([0, 1, 0], z)), y = cross(z, x);
  return { x, y, z };
}

// A camera: eye, target, vertical field of view (degrees), aspect, and the projection shift (NDC units).
export function project(cam, p) {
  const { x, y, z } = basis(cam.eye, cam.target), d = sub(p, cam.eye);
  const vx = dot(d, x), vy = dot(d, y), vz = dot(d, z); // vz < 0 in front of the camera
  const f = 1 / Math.tan((cam.fov * Math.PI) / 360);
  return { x: (f / cam.aspect) * vx / -vz + cam.shift[0], y: f * vy / -vz + cam.shift[1], depth: -vz };
}
export const toScreen = (ndc, w, h) => ({ x: ((ndc.x + 1) / 2) * w, y: ((1 - ndc.y) / 2) * h });

// The view for a screen of w × h pixels.
export function frame(w, h, arena = ARENA, { region: regionOverride } = {}) {
  const phone = isPhoneLayout(w, h);
  const elevation = phone ? 62 : 56, fov = phone ? 32 : 26;
  const target = [0, 0.5, 0], dir = [0, Math.sin((elevation * Math.PI) / 180), Math.cos((elevation * Math.PI) / 180)];
  const aspect = w / h, region = regionOverride || bearRegion(w, h);
  // Region in NDC.
  const R = { x0: (region.x0 / w) * 2 - 1, x1: (region.x1 / w) * 2 - 1, y0: 1 - (region.y1 / h) * 2, y1: 1 - (region.y0 / h) * 2 };
  const pts = framePoints(arena);
  const extents = (d) => {
    const cam = { eye: target.map((t, k) => t + dir[k] * d), target, fov, aspect, shift: [0, 0] };
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { const q = project(cam, p); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
    return { x0, x1, y0, y1 };
  };
  const fits = (e) => e.x1 - e.x0 <= R.x1 - R.x0 && e.y1 - e.y0 <= R.y1 - R.y0;
  let lo = 6, hi = 400;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (fits(extents(mid))) hi = mid; else lo = mid; }
  const e = extents(hi);
  const shift = [(R.x0 + R.x1) / 2 - (e.x0 + e.x1) / 2, (R.y0 + R.y1) / 2 - (e.y0 + e.y1) / 2];
  return { eye: target.map((t, k) => t + dir[k] * hi), target, fov, aspect, shift, near: 0.5, far: hi * 3, region, width: w, height: h, phone };
}

// Screen point (CSS pixels) → world ray {origin, dir}.
export function screenRay(cam, sx, sy) {
  const nx = (sx / cam.width) * 2 - 1 - cam.shift[0], ny = 1 - (sy / cam.height) * 2 - cam.shift[1];
  const f = 1 / Math.tan((cam.fov * Math.PI) / 360), { x, y, z } = basis(cam.eye, cam.target);
  const vx = (nx * cam.aspect) / f, vy = ny / f; // view-space direction (vx, vy, -1)
  return { origin: cam.eye.slice(), dir: norm([x[0] * vx + y[0] * vy - z[0], x[1] * vx + y[1] * vy - z[1], x[2] * vx + y[2] * vy - z[2]]) };
}
// Where a screen point meets the plane through p that faces the camera.
export function screenToPlane(cam, sx, sy, p) {
  const ray = screenRay(cam, sx, sy), n = basis(cam.eye, cam.target).z, t = dot(sub(p, ray.origin), n) / dot(ray.dir, n);
  return ray.origin.map((o, k) => o + ray.dir[k] * t);
}
// Screen box of a world box (CSS pixels).
export function screenBox(cam, box) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const x of [box.min[0], box.max[0]]) for (const y of [box.min[1], box.max[1]]) for (const z of [box.min[2], box.max[2]]) {
    const s = toScreen(project(cam, [x, y, z]), cam.width, cam.height);
    x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y);
  }
  return { x0, y0, x1, y1 };
}
// Column-major 4×4 projection matrix for Three.js, with the shift built in.
export function projectionMatrix(cam) {
  const f = 1 / Math.tan((cam.fov * Math.PI) / 360), n = cam.near, fa = cam.far;
  return [f / cam.aspect, 0, 0, 0, 0, f, 0, 0, -cam.shift[0], -cam.shift[1], -(fa + n) / (fa - n), -1, 0, 0, (-2 * fa * n) / (fa - n), 0];
}
// The nearest particle a screen ray hits (particles as spheres of radius rr). Returns {particle, point, t} or null.
export function pickParticle(cam, sx, sy, x, count, rr) {
  const { origin: o, dir: d } = screenRay(cam, sx, sy);
  let best = null;
  for (let i = 0; i < count; i++) {
    const cx = x[i * 3] - o[0], cy = x[i * 3 + 1] - o[1], cz = x[i * 3 + 2] - o[2], b = cx * d[0] + cy * d[1] + cz * d[2];
    const c2 = cx * cx + cy * cy + cz * cz - b * b;
    if (c2 > rr * rr || b <= 0) continue;
    const t = b - Math.sqrt(rr * rr - c2);
    if (!best || t < best.t) best = { particle: i, t };
  }
  if (best) best.point = o.map((v, k) => v + d[k] * best.t);
  return best;
}

// The coloured soft shadows (drawn by main.js on the GPU and by tools/preview.mjs on the CPU): each particle
// stamps a round soft spot on the table, pushed sideways by the light by `light` × its height, with radius
// radius[0] + radius[1] × height and strength strength / (1 + falloff × height), tinted with its flavour.
export const SHADOW = { light: [-0.62, -0.48], radius: [0.36, 0.42], strength: 0.72, falloff: 1.4, x0: -7.5, z0: -5.5, w: 15, d: 11 };
