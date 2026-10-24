// 剖视窗：前檐明间东柱的柱头铺作，放大约 2.6 倍，从柱头到瓦面切出一段。
// 传力顺序（瓦→椽→槫→替木→令栱→二跳→一跳→栌斗→柱）一层层点亮。
import { join } from "node:path";
import { homedir } from "node:os";
const SKILL = join(homedir(), ".claude/skills/anatomy");
const A = await import(join(SKILL, "kit/audit.mjs"));

export function buildInset({ k, G, M, AZIMUTH, ELEVATION }) {
  const W = 300;
  const H = 300;
  // 局部坐标：柱头在原点，x 沿墙，y 向外（朝观众），z 向上
  const pts = [
    [-40, -34, -50], [40, -34, -50], [-40, 56, -50], [40, 56, -50],
    [-40, -34, 128], [40, 56, 128], [-40, 56, 128], [40, -34, 128],
  ];
  const P = k.fitProjection(pts, W, H, { pad: 10, azimuth: 24, elevation: 24 });
  const R = A.recorder(P, {});
  const LOAD = new Map();
  const S = (paths, style) => k.solidSvg(paths, style);
  const put = (load, mat, at, svg, shape) => {
    const name = R.nameFor(`in.${load}`);
    R.put({ piece: "in", at, svg, shapes: [R.solid({ ...shape, name, owner: "inset" })], name });
    LOAD.set(name, [load, mat]);
  };
  const box = (load, mat, x0, x1, y0, y1, z0, z1) => {
    const plan = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), d: Math.abs(y1 - y0), r: 0.5 };
    put(load, mat, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], S(k.slabOf(plan, Math.min(z0, z1), Math.abs(z1 - z0), P, 2, 0.3), { tone: "hi" }), A.slab(plan, Math.min(z0, z1), Math.abs(z1 - z0), {}, 2));
  };
  const dou = (load, a, b, wa, wb, z, h) => {
    box(load, "zhu", a - wa / 2 + 1.2, a + wa / 2 - 1.2, b - wb / 2 + 1.2, b + wb / 2 - 1.2, z, z + h * 0.45);
    box(load, "zhu", a - wa / 2, a + wa / 2, b - wb / 2, b + wb / 2, z + h * 0.45, z + h);
  };
  // 柱（只切一段）
  const F = G.frameAlong([0, 0, -50], [0, 0, 1]);
  put("zhu", "zhu", [0, 0, -25], S(G.disc(0, 50, M.COLUMN_D / 2, F, P), { tone: "hi" }), A.disc(F, 0, 50, M.COLUMN_D / 2));
  // 栌斗
  box("ludou", "zhu", -10.5, 10.5, -9.5, 9.5, 0, 7);
  box("ludou", "zhu", -14.5, 14.5, -13, 13, 7, 11);
  for (const sa of [-1, 1]) for (const sb of [-1, 1]) box("ludou", "zhu", sa * 5.5, sa * 14.5, sb * 5, sb * 13, 11, 18);
  // 一跳华栱、泥道栱
  box("hua1", "zhubai", -5.5, 5.5, -32, 27, 11, 32);
  for (const s of [-1, 1]) box("hua1", "zhubai", s * 5.5, s * 35, -5, 5, 11, 26);
  dou("hua1", 0, 19, 18, 16, 32, 6);
  for (const s of [-1, 1]) dou("hua1", s * 28, 0, 14, 16, 26, 6);
  // 二跳华栱（明间是四椽栿梁头）
  box("hua2", "zhubai", -5.5, 5.5, 27, 52, 38, 59);
  box("hua2", "zhu", -9.7, 9.7, -46, 27, 38, 63.5);
  dou("hua2", 0, 47, 18, 16, 59, 6);
  // 令栱、散斗、替木
  for (const s of [-1, 1]) box("linggong", "zhubai", s * 5, s * 35, 42, 52, 65, 80);
  for (const s of [-1, 1]) dou("linggong", s * 28, 47, 14, 16, 80, 6);
  box("timu", "zhu", -44, 44, 42, 52, 86, 96);
  // 橑檐槫
  const FT = G.frameAlong([-46, 47, 106.5], [1, 0, 0]);
  put("tuan", "zhu2", [0, 47, 106.5], S(G.disc(0, 92, 10.5, FT, P), { tone: "hi" }), A.disc(FT, 0, 92, 10.5));
  // 几根椽与一块屋面
  const slope = Math.atan(M.juZhe().ping / 197);
  const dir = [0, Math.cos(slope), -Math.sin(slope)];
  for (const x of [-9, 9]) {
    const from = [x, -10, 117 + 4.5 + 57 * Math.tan(slope)];
    const len = 92 / Math.cos(slope);
    const FR = G.frameAlong(from, dir);
    put("wa", "zhu2", G.add3(from, G.mul3(dir, len / 2)), S(G.disc(0, len, 4.5, FR, P), { tone: "hi" }), A.disc(FR, 0, len, 4.5));
  }
  // 屋面板
  {
    const o = [-18, -10, 117 + 9 + 57 * Math.tan(slope)];
    const u = [1, 0, 0];
    const n = G.unit3(G.cross3(u, dir));
    const Fp = { o, a: n[2] > 0 ? n : G.mul3(n, -1), u, v: null };
    Fp.v = G.cross3(Fp.a, Fp.u);
    const len = 92 / Math.cos(slope);
    const corners = [[0, 0], [36, 0], [36, len], [0, len]].map(([a, b]) => {
      const p = G.add3(G.add3(o, G.mul3(u, a)), G.mul3(dir, b));
      return [G.dot3(G.sub3(p, o), Fp.u), G.dot3(G.sub3(p, o), Fp.v)];
    });
    const lines = [];
    for (let a = 10; a < 34; a += 16.4) for (const off of [-4.8, 4.8]) {
      const p0 = G.add3(G.add3(G.add3(o, G.mul3(Fp.a, 12)), G.mul3(u, a + off)), G.mul3(dir, 0));
      const p1 = G.add3(p0, G.mul3(dir, len));
      lines.push(k.segment(p0, p1, P));
    }
    const id = R.nameFor("in.wa");
    R.put({ piece: "in", at: G.add3(o, G.mul3(dir, len / 2)), svg: S(G.prismOf(Fp, corners, 0, 12, P), { tone: "hi" }) + k.lineSvg(lines.join(""), { tone: "lo" }), shapes: [R.solid(A.prism(Fp, corners, 0, 12, { name: id, owner: "inset" }))], name: id });
    LOAD.set(id, ["wa", "wa"]);
  }
  A.settle(R, P, { states: [0] });
  R.items.sort((a, b) => a.key - b.key);
  const body = R.items.map((item) => {
    const [load, mat] = LOAD.get(item.name);
    return `<g class="it m-${mat}" data-load="${load}">${item.svg}</g>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg nc-inset-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="剖视窗：前檐明间柱头铺作放大，屋顶的重量从瓦和椽经橑檐槫、替木、令栱、两跳华栱、栌斗传到檐柱。">${body}</svg>`;
  const list = M.LOAD_PATH.map((l, i) => `<li data-load-step="${l.id}"><span>${i + 1}</span>${l.name}<em>${l.fen}</em></li>`).join("");
  const html = `<div class="nc-inset" data-inset hidden><div class="nc-inset-win">${svg}</div><div class="nc-inset-cap"><b>剖视窗 · 前檐明间柱头铺作</b><ol>${list}</ol></div></div>`;
  const script = `
;(() => {
  const box = document.querySelector("[data-inset]");
  if (!box) return;
  const order = ${JSON.stringify(M.LOAD_PATH.map((l) => l.id))};
  const parts = [...box.querySelectorAll("[data-load]")];
  const rows = [...box.querySelectorAll("[data-load-step]")];
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  let i = -1, timer = 0;
  function show(n) {
    const id = order[n];
    parts.forEach((p) => p.dataset.load === id ? p.setAttribute("data-on", "") : p.removeAttribute("data-on"));
    rows.forEach((r) => r.dataset.loadStep === id ? r.setAttribute("data-on", "") : r.removeAttribute("data-on"));
  }
  window.__ncInset = {
    start() { if (timer) return; box.hidden = false; if (still.matches) { show(order.length - 1); return; } i = -1; const step = () => { i = (i + 1) % (order.length + 2); if (i < order.length) show(i); else show(-1); timer = setTimeout(step, i < order.length ? 900 : 700); }; step(); },
    stop(hide) { clearTimeout(timer); timer = 0; show(-1); if (hide) box.hidden = true; },
  };
})();
`;
  return { html, script };
}
