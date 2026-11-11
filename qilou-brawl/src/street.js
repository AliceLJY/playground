// 西关骑楼街：程序化搭建，无外部模型。构件一件件搭（柱础、柱头、雀替、满洲窗、百叶、阳台、山花、趟栊、招牌），
// 按材质合并成十来个网格。街道沿 +z，宽 HALF_W*2；两侧骑楼骑在人行道上，擂台在 z≈41–52。
// 表面是 textures.js 算出来的贴图（灰泥、青砖、麻石、花阶砖、木），颜色靠顶点色调；招牌的字在图集里。
import * as pc from 'playcanvas';
import { makeTextures, ATLAS, ARENA, SIGN_TEXT } from './textures.js';

const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgb = (c) => typeof c === 'string' ? hex(c) : c;
const FACE = [ // 法线，四角 (sx,sy,sz) 符号
  [[1,0,0],[[1,-1,-1],[1,1,-1],[1,1,1],[1,-1,1]]],
  [[-1,0,0],[[-1,-1,1],[-1,1,1],[-1,1,-1],[-1,-1,-1]]],
  [[0,1,0],[[-1,1,-1],[-1,1,1],[1,1,1],[1,1,-1]]],
  [[0,-1,0],[[-1,-1,1],[-1,-1,-1],[1,-1,-1],[1,-1,1]]],
  [[0,0,1],[[1,-1,1],[1,1,1],[-1,1,1],[-1,-1,1]]],
  [[0,0,-1],[[-1,-1,-1],[-1,1,-1],[1,1,-1],[1,-1,-1]]]
];
class Builder {
  constructor(tile = 1) { this.p = []; this.n = []; this.c = []; this.u = []; this.i = []; this.tile = tile; this.uo = 0; this.vo = 0; }
  // o.shade 整体明暗；o.g=[底,顶] 竖向渐变（墙脚的脏）；o.skip 不要的面法线，如 'y-'
  box(cx, cy, cz, sx, sy, sz, color, o = {}) {
    const [r, g, b] = rgb(color), sh = o.shade ?? 1, gr = o.g || [1, 1], t = this.tile;
    for (const [nrm, corners] of FACE) {
      if (o.skip && o.skip.includes((nrm[0] ? 'x' : nrm[1] ? 'y' : 'z') + (nrm[0] + nrm[1] + nrm[2] > 0 ? '+' : '-'))) continue;
      const base = this.p.length / 3, kf = sh * (nrm[1] < 0 ? .6 : 1);
      for (const [a, bb, cc] of corners) {
        const x = cx + a * sx / 2, y = cy + bb * sy / 2, z = cz + cc * sz / 2, k = kf * (bb < 0 ? gr[0] : gr[1]);
        this.p.push(x, y, z); this.n.push(...nrm);
        this.c.push(Math.min(255, r * k), Math.min(255, g * k), Math.min(255, b * k), 255);
        if (nrm[0]) this.u.push(z / t + this.uo, y / t + this.vo); else if (nrm[2]) this.u.push(x / t + this.uo, y / t + this.vo); else this.u.push(x / t + this.uo, z / t + this.vo);
      }
      this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  // 旋转体：prof 是 [半径, 高度, 明暗] 列表，自下而上（顶面要从外沿往圆心写，法线才朝上）。o.axis='z-' 时轴朝街口躺倒；o.rib 隔瓣明暗
  lathe(cx, cy, cz, prof, seg, color, o = {}) {
    const [r, g, b] = rgb(color), base = this.p.length / 3, m = prof.length, t = this.tile, zax = o.axis === 'z-', rib = o.rib || 0;
    for (let j = 0; j < m; j++) {
      const [pr, py, k0 = 1] = prof[j], a = prof[Math.max(0, j - 1)], c = prof[Math.min(m - 1, j + 1)];
      let ny = -(c[0] - a[0]), nr = c[1] - a[1]; const l = Math.hypot(ny, nr) || 1; ny /= l; nr /= l;
      for (let s = 0; s <= seg; s++) {
        const th = s / seg * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th), k = k0 * (1 + (s & 1 ? rib : -rib));
        if (zax) { this.p.push(cx + cs * pr, cy + sn * pr, cz - py); this.n.push(cs * nr, sn * nr, -ny); } else { this.p.push(cx + cs * pr, cy + py, cz + sn * pr); this.n.push(cs * nr, ny, sn * nr); }
        this.c.push(Math.min(255, r * k), Math.min(255, g * k), Math.min(255, b * k), 255);
        this.u.push(s / seg * Math.max(1, Math.round(pr * 6.28 / t)), (cy + py) / t);
      }
    }
    for (let j = 0; j < m - 1; j++) for (let s = 0; s < seg; s++) {
      const a = base + j * (seg + 1) + s, d = a + seg + 1;
      this.i.push(a, d, a + 1, a + 1, d, d + 1);
    }
  }
  // 朝着看的人的一块面：right 是看的人的右手方向，rect 是图集里的像素框
  quad(c, right, up, w, h, rect, aw, ah, color = [255, 255, 255]) {
    const base = this.p.length / 3, n = [right[1] * up[2] - right[2] * up[1], right[2] * up[0] - right[0] * up[2], right[0] * up[1] - right[1] * up[0]];
    const [r, g, b] = rgb(color), [x, y, rw, rh] = rect || [0, 0, 1, 1], e = rect ? 1.5 : 0;
    const u0 = (x + e) / aw, u1 = (x + rw - e) / aw, v0 = (y + e) / ah, v1 = (y + rh - e) / ah;
    for (const [sr, su, uu, vv] of [[-1, -1, u0, v1], [1, -1, u1, v1], [1, 1, u1, v0], [-1, 1, u0, v0]]) {
      this.p.push(c[0] + right[0] * sr * w / 2 + up[0] * su * h / 2, c[1] + right[1] * sr * w / 2 + up[1] * su * h / 2, c[2] + right[2] * sr * w / 2 + up[2] * su * h / 2);
      this.n.push(...n); this.c.push(r, g, b, 255); this.u.push(uu, vv);
    }
    this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  // 小三角旗
  tri(a, b, c, color) {
    const base = this.p.length / 3, [r, g, bl] = rgb(color);
    for (const p of [a, b, c, a, c, b]) { this.p.push(...p); this.n.push(0, 0, -1); this.c.push(r, g, bl, 255); this.u.push(0, 0); }
    this.i.push(base, base + 1, base + 2, base + 3, base + 4, base + 5);
  }
  entity(app, name, material, shadows) {
    const mesh = new pc.Mesh(app.graphicsDevice);
    mesh.setPositions(this.p); mesh.setNormals(this.n); mesh.setColors32(this.c); mesh.setUvs(0, this.u); mesh.setIndices(this.i); mesh.update();
    const e = new pc.Entity(name);
    e.addComponent('render', { meshInstances: [new pc.MeshInstance(mesh, material)], castShadows: !!shadows, receiveShadows: !!shadows });
    return e;
  }
}

const PAL = {
  wall: ['#EAD6AC', '#E9C79C', '#D8CBAE', '#EEDDBD', '#E6BEA3', '#C9D4C3', '#D9C1B8', '#C8D3DA', '#EBCF8E'],
  trim: '#F4EAD4', pillar: '#E0CDA8', red: '#C8242B', gold: '#F2B230', green: '#3F7D63', blue: '#3E6E9E', wood: '#8A5632', dark: '#2B2730',
  shutter: ['#3F6F5C', '#7A4A2A', '#31586F', '#6B3028'], cloth: ['#E9E3D2', '#D94B4B', '#4E86B8', '#F0C24A', '#7FB48A', '#E9A7B8']
};
const GLASS = ['#D7262E', '#F2B230', '#3F7D63', '#3E6E9E', '#E77FA0'];
const LANTERN = [[.02, -.2, .6], [.09, -.195, .7], [.15, -.15, .85], [.195, -.08, 1], [.21, 0, 1.08], [.195, .08, 1.05], [.15, .15, .95], [.09, .195, .8], [.02, .2, .65]];
// 阳光走的方向：从街口右后方低低地照过来，右排骑楼的影子压住半条街，左排立面和迎面的招牌吃到暖光
export const SUN = (() => { const v = [.2, -.5, .84], l = Math.hypot(...v); return v.map((x) => x / l); })();

// 按台边切开软影多边形；顶点是 [x, z, alpha]，交点插值保留原来的软边。
function splitBlob(poly, axis, edge, sign) {
  const inside = [], outside = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], da = (a[axis] - edge) * sign, db = (b[axis] - edge) * sign;
    (da >= 0 ? inside : outside).push(a);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db), p = a.map((v, k) => v + (b[k] - v) * t);
      p[axis] = edge; inside.push(p); outside.push(p);
    }
  }
  return [inside, outside];
}

export function buildStreet(app, { halfW = 3.6, z0 = -8, z1 = 58, seed = 3, small = false, shadows = true } = {}) {
  let s = seed; const rand = () => (s = (s * 16807) % 2147483647) / 2147483647, pick = (a) => a[Math.floor(rand() * a.length)];
  const T = makeTextures(app.graphicsDevice, { small });
  const B = { plaster: new Builder(4), brick: new Builder(2), granite: new Builder(4), tile: new Builder(1.6), wood: new Builder(2), plain: new Builder(1), glow: new Builder(1), lit: new Builder(1), paint: new Builder(1), arena: new Builder(1) };
  const P = B.plaster, W = B.wood, PL = B.plain, G = B.glow;
  let boxN = 0, boardN = 0, coupletN = 0;
  const boxRect = (i) => [(i % ATLAS.box.n) * ATLAS.box.w, ATLAS.box.y[Math.floor(i / ATLAS.box.n) % 2], ATLAS.box.w, ATLAS.box.h];
  const boardRect = (i) => [(i % ATLAS.board.n) * ATLAS.board.w, ATLAS.board.y0 + Math.floor(i / ATLAS.board.n) % ATLAS.board.rows * ATLAS.board.h, ATLAS.board.w, ATLAS.board.h];
  const coupletRect = (i) => [(i % ATLAS.couplet.n) * ATLAS.couplet.w, ATLAS.couplet.y0, ATLAS.couplet.w, ATLAS.couplet.h];
  const sign = (b, c, right, w, h, rect) => b.quad(c, right, [0, 1, 0], w, h, rect, ATLAS.W, ATLAS.H);
  const lantern = (x, y, z, k = 1, color = PAL.red) => {
    G.lathe(x, y, z, LANTERN.map(([r, yy, sh]) => [r * k, yy * k, sh]), 16, color, { rib: .07 });
    G.box(x, y + .23 * k, z, .09 * k, .05 * k, .09 * k, PAL.gold); G.box(x, y - .23 * k, z, .09 * k, .05 * k, .09 * k, PAL.gold);
    G.box(x, y - .36 * k, z, .03 * k, .22 * k, .03 * k, '#E0A020'); PL.box(x, y + .4 * k, z, .012, .3 * k, .012, PAL.dark);
  };
  const kumquat = (x, z, k = 1) => { // 年桔：陶盆、树冠、橙果
    PL.lathe(x, .14, z, [[.16 * k, 0, .7], [.22 * k, .3 * k, 1], [.24 * k, .32 * k, 1.05], [.2 * k, .33 * k, .5]], 9, '#9A4A2C');
    PL.box(x, .14 + .5 * k, z, .05, .4 * k, .05, '#5A4028');
    PL.lathe(x, .14 + .62 * k, z, [[.02, 0, .6], [.26 * k, .08 * k, .7], [.38 * k, .26 * k, .85], [.42 * k, .46 * k, 1], [.36 * k, .68 * k, 1.1], [.22 * k, .86 * k, 1.2], [.02, .98 * k, 1.25]], 12, '#3C8A49', { rib: .1 });
    for (let q = 0; q < 30; q++) { const a = rand() * 6.283, h = .12 + rand() * .76, r = (.44 - Math.abs(h - .44) * .52) * k; G.lathe(x + Math.cos(a) * r, .14 + .62 * k + h * k, z + Math.sin(a) * r, [[.01, -.04, .7], [.04, -.02, .9], [.045, .01, 1.1], [.01, .04, 1.15]], 6, '#F59A1C'); }
  };

  // ---- 街面：横铺麻石，两侧石牙子和排水明沟 ----
  const zc0 = (z0 + z1) / 2, len = z1 - z0, sideX = halfW + .15;
  B.granite.box(0, -.05, zc0, halfW * 2 + .2, .1, len, '#FFFFFF');
  for (const side of [-1, 1]) {
    PL.box(side * (halfW - .14), .003, zc0, .16, .006, len, '#2E2A27'); // 明沟
    B.granite.box(side * (halfW + .1), .07, zc0, .24, .16, len, '#C9C2B6', { g: [.7, 1] });
    B.tile.box(side * (sideX + 1.62), .07, zc0, 3.1, .14, len, '#FFFFFF');
  }
  for (const [mx, mz] of [[1.3, 6], [-1.6, 17], [.8, 27.5], [-1.1, 36]]) { PL.lathe(mx, .001, mz, [[.36, 0, .8], [.35, .008, 1], [.3, .008, .8], [.29, .004, .6], [.02, .004, .7]], 18, '#6A645B'); for (let k = -2; k <= 2; k++) PL.box(mx + k * .1, .006, mz, .03, .006, .44 - Math.abs(k) * .06, '#3E3A35'); } // 沙井盖

  // ---- 两侧骑楼 ----
  for (const side of [-1, 1]) {
    const toStreet = -side, R = [0, 0, side]; // 站在街上看这一侧立面时的右手方向
    let z = z0, bay = 0;
    while (z < z1) {
      const w = 3.6 + Math.floor(rand() * 3) * .6, floors = 2 + Math.floor(rand() * 2), wall = pick(PAL.wall);
      const zc = z + w / 2, xF = side * sideX, xB = side * (sideX + 3.2), H1 = 3.5, Hf = 2.95, top = H1 + floors * Hf;
      const wallDark = rgb(wall).map((c) => c * .72), fx = (d) => xF + toStreet * d; // fx(d)：从立面往街心探出 d
      P.uo = rand(); P.vo = rand(); B.brick.uo = rand(); W.uo = rand();
      // 柱：麻石柱础、色带墙裙、柱头线脚，一开间一根
      for (const pz of bay === 0 ? [z, z + w] : [z + w]) {
        P.box(xF, H1 / 2, pz, .54, H1, .54, PAL.pillar, { g: [.7, 1] });
        B.granite.box(xF, .32, pz, .68, .36, .68, '#B9B2A6'); PL.box(xF, .52, pz, .62, .05, .62, '#8E877C');
        P.box(xF, .85, pz, .57, .6, .57, wallDark, { g: [.75, 1] });
        P.box(xF, H1 - .66, pz, .66, .1, .66, PAL.trim); P.box(xF, H1 - .56, pz, .74, .08, .74, PAL.trim); P.box(xF, H1 - .78, pz, .6, .06, .6, PAL.trim);
        if (rand() < .6) { // 柱上的红纸对联，朝街口和朝街心各一张
          sign(B.paint, [xF, 2.05, pz - .275], [-1, 0, 0], .26, 1.14, coupletRect(coupletN++));
          sign(B.paint, [fx(.275), 2.05, pz], R, .26, 1.14, coupletRect(coupletN++));
        }
        PL.box(xF + side * .2, (H1 + top) / 2, pz + .34, .07, top - H1, .07, '#4E6658'); // 落水管
      }
      // 梁、雀替、梁上横匾
      P.box(xF, H1 - .26, zc, .5, .52, w - .54, PAL.trim, { g: [.86, 1] });
      for (const e of [-1, 1]) for (let k = 0; k < 3; k++) P.box(xF, H1 - .6 - k * .09, zc + e * (w / 2 - .34 - (2 - k) * .12), .34, .09, .24 - k * .0, PAL.trim, { shade: .94 });
      const bw = Math.min(w - 1.5, 2.5);
      W.box(fx(.26), H1 - .26, zc, .03, .5, bw + .12, '#3A2416'); sign(B.paint, [fx(.28), H1 - .26, zc], R, bw, bw * 120 / 512 * 1.06, boardRect(boardN++));
      // 骑楼顶棚与木梁、吊灯
      P.box(side * (sideX + 1.6), H1 + .03, zc, 3.3, .1, w, '#CDBB98', { shade: .62 });
      for (const bz of [z + .27, zc]) W.box(side * (sideX + 1.6), H1 - .1, bz, 3.1, .16, .14, '#6B4A30', { shade: .7 });
      PL.box(side * (sideX + 1.6), H1 - .35, zc, .012, .5, .012, PAL.dark); G.lathe(side * (sideX + 1.6), H1 - .68, zc, [[.02, .14, .5], [.2, .06, .9], [.22, 0, 1.2], [.06, -.03, 1.3]], 8, '#FFD9A0');
      // 铺面：青砖墙、门、趟栊或货架、灯箱
      B.brick.box(xB, H1 / 2, zc, .2, H1, w, '#FFFFFF', { g: [.6, .95], shade: .82 });
      const kind = rand(), dw = Math.min(2.1, w * .46), dz = zc + (rand() - .5) * (w - dw - 1.1), xS = xB + toStreet * .11;
      W.box(xS, 1.32, dz - dw / 2 - .07, .1, 2.64, .14, '#5B3A22'); W.box(xS, 1.32, dz + dw / 2 + .07, .1, 2.64, .14, '#5B3A22'); W.box(xS, 2.66, dz, .12, .16, dw + .34, '#5B3A22');
      B.granite.box(xS + toStreet * .1, .19, dz, .34, .1, dw + .3, '#A9A294'); // 门槛石
      if (kind < .5) { // 开着门：里头亮着，门口看得见货架和柜台的剪影
        G.box(xS - toStreet * .03, 1.32, dz, .03, 2.5, dw, pick(['#FFC877', '#FFE2A8', '#FFD08A']));
        for (let k = 0; k < 3; k++) PL.box(xS, .75 + k * .62, dz, .05, .06, dw * .92, '#3A2618');
        for (let k = 0; k < 9; k++) PL.box(xS + toStreet * .01, .9 + (k % 3) * .62, dz + (k / 3 - 1.3 + rand() * .3) * dw * .28, .05, .22 + rand() * .16, .12 + rand() * .14, pick(['#7A3A22', '#2F4F46', '#8A6A2A', '#5A2A2A', '#41506A']));
        W.box(xS + toStreet * .22, .6, dz - dw * .2, .4, .9, dw * .5, '#7A4E2E');
      } else if (kind < .8) { // 趟栊：木门半掩，横木栅一排
        W.box(xS, 1.32, dz - dw * .26, .05, 2.5, dw * .48, '#6E2B22'); G.box(xS - toStreet * .03, 1.32, dz + dw * .25, .03, 2.5, dw * .5, '#F2B66A');
        for (let k = 0; k < 9; k++) W.box(xS + toStreet * .06, .42 + k * .26, dz, .07, .075, dw, '#4A2D1B');
        W.box(xS + toStreet * .06, 1.32, dz - dw / 2 + .04, .09, 2.5, .08, '#4A2D1B'); W.box(xS + toStreet * .06, 1.32, dz + dw / 2 - .04, .09, 2.5, .08, '#4A2D1B');
      } else { // 关着的木板门，贴一张红纸
        W.box(xS, 1.32, dz, .05, 2.5, dw, pick(['#6B4A30', '#3F5E50', '#6E2B22']));
        PL.box(xS + toStreet * .03, 1.75, dz, .012, .4, .4, '#B81A1F'); G.box(xS + toStreet * .04, 1.75, dz, .012, .16, .16, '#E9B94B', { shade: .8 });
      }
      const lw = Math.min(dw + .5, 2.3); PL.box(xS + toStreet * .04, 3.0, dz, .1, lw * .25 + .06, lw + .06, '#1C1A1C'); sign(B.lit, [xS + toStreet * .1, 3.0, dz], R, lw, lw * .25, boardRect(boardN++));
      // 门口的家当：木箱、蒸笼、条凳、年桔
      const px = side * (sideX + 2.45), pz0 = dz + (dz > zc ? -1 : 1) * (dw / 2 + .55), prop = rand();
      if (prop < .28) { W.box(px, .37, pz0, .5, .46, .6, '#9A7446'); W.box(px + .04, .8, pz0 - .03, .44, .4, .5, '#8A673C'); W.box(px - side * .55, .32, pz0 + .1, .42, .36, .42, '#A47C4C'); }
      else if (prop < .5) { for (let k = 0; k < 4; k++) PL.lathe(px, .14 + k * .15, pz0, [[.27, 0, .8], [.28, .13, 1], [.27, .14, .7]], 12, '#C9A56A'); PL.lathe(px, .74, pz0, [[.28, 0, 1], [.2, .08, 1.1], [.03, .11, 1.15]], 12, '#B8935A'); W.box(px, .1, pz0, .5, .5, .5, '#7A5634', { skip: 'y-' }); }
      else if (prop < .7) { W.box(px, .5, pz0, .32, .05, 1.3, '#8A5E38'); for (const e of [-.5, .5]) W.box(px, .32, pz0 + e, .26, .36, .06, '#6E4A2C'); }
      else if (prop < .88) kumquat(px, pz0, .9 + rand() * .3);
      // 楼上：墙身、壁柱、层间线脚
      P.box(side * (sideX + 1.6), H1 + floors * Hf / 2, zc, 3.4, floors * Hf, w, wall, { g: [.88, 1], skip: 'y-' });
      for (const pz of [z + .01, z + w - .01]) P.box(fx(.04), (H1 + top) / 2, pz, .1, top - H1, .34, PAL.trim, { g: [.9, 1] });
      const style = Math.floor(rand() * 3), sh = pick(PAL.shutter);
      for (let f = 0; f < floors; f++) {
        const yb = H1 + f * Hf;
        P.box(fx(.07), yb + .06, zc, .18, .12, w, PAL.trim); P.box(fx(.04), yb + .17, zc, .12, .1, w, PAL.trim, { shade: .93 });
        const nWin = w > 4.4 ? 3 : 2, balcony = rand() < .5 && f > 0; // 阳台只放二层以上：镜头最高 5.6 m，一层的阳台会怼到镜头上
        for (let k = 0; k < nWin; k++) {
          const wz = z + (k + .5) * w / nWin, wy = yb + 1.52;
          P.box(fx(.04), wy, wz, .1, 1.84, 1.08, PAL.trim); P.box(fx(.1), wy + .98, wz, .2, .1, 1.26, PAL.trim); P.box(fx(.08), wy - .96, wz, .16, .08, 1.2, PAL.trim); // 窗套、窗楣、窗台
          PL.box(fx(.07), wy, wz, .06, 1.66, .9, '#262B33', { shade: .8 });
          if (style === 0) { // 满洲窗：彩色玻璃小格，木棂子
            for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 3; gx++) G.box(fx(.1), wy - .6 + gy * .4, wz - .29 + gx * .29, .03, .36, .25, GLASS[(gy * 3 + gx * 2 + k + f) % GLASS.length], { shade: (gy + gx) & 1 ? .5 : .68 });
            for (const gz of [-.145, .145]) W.box(fx(.118), wy, wz + gz, .03, 1.66, .045, '#3A2416'); for (const gy of [-.4, 0, .4]) W.box(fx(.118), wy + gy, wz, .03, .045, .9, '#3A2416');
          } else if (style === 1) { // 百叶窗：两扇，一扇半开
            const open = rand() < .45;
            for (const e of [-1, 1]) {
              const half = open && e > 0, lz = wz + e * (half ? .56 : .23), lx = half ? .3 : .1;
              W.box(fx(lx), wy, lz, half ? .42 : .04, 1.6, half ? .04 : .43, sh);
              if (!half) for (let q = 0; q < 9; q++) W.box(fx(lx + .025), wy - .68 + q * .17, lz, .02, .05, .36, sh, { shade: 1.25 });
            }
            if (open) G.box(fx(.08), wy, wz + .1, .03, 1.5, .5, '#F6C97A', { shade: .8 });
          } else { // 玻璃窗：细木棂，有的亮着灯
            const litW = rand() < .4;
            (litW ? G : PL).box(fx(.1), wy, wz, .02, 1.58, .84, litW ? '#F3C377' : '#3D4A5A', { shade: litW ? .85 : 1 });
            W.box(fx(.115), wy, wz, .03, 1.6, .06, PAL.trim); for (const gy of [-.4, .2]) W.box(fx(.115), wy + gy, wz, .03, .05, .86, PAL.trim);
          }
          if (!balcony && rand() < .3) { // 竹竿晾衫
            PL.box(fx(.6), wy + .74, wz, 1.1, .03, .03, '#B79A55');
            for (let q = 0; q < 3; q++) { const cx = fx(.3 + q * .3), ch = .4 + rand() * .35; PL.box(cx, wy + .72 - ch / 2, wz, .24, ch, .02, pick(PAL.cloth)); }
          }
          if (!balcony && rand() < .16) { PL.box(fx(.3), yb + .5, wz + .1, .44, .34, .7, '#C9C7BF'); PL.box(fx(.525), yb + .5, wz + .1, .01, .26, .56, '#55585C'); }
        }
        if (balcony) { // 阳台：挑板、宝瓶栏杆
          const by = yb + .28; P.box(fx(.33), by, zc, .66, .12, w - .6, PAL.trim, { g: [.8, 1] });
          for (let q = 0; q <= Math.floor((w - .8) / .2); q++) P.box(fx(.6), by + .4, z + .4 + q * .2, .07, .68, .07, PAL.trim);
          for (const e of [0, 1]) for (let q = 0; q < 2; q++) P.box(fx(.2 + q * .2), by + .4, z + .36 + e * (w - .72), .07, .68, .07, PAL.trim);
          P.box(fx(.6), by + .78, zc, .14, .09, w - .56, PAL.trim); for (const e of [0, 1]) P.box(fx(.33), by + .78, z + .36 + e * (w - .72), .66, .09, .12, PAL.trim);
          if (rand() < .6) for (let q = 0; q < 3; q++) PL.lathe(fx(.4), by + .08, z + .8 + q * (w - 1.6) / 2, [[.08, 0, .8], [.11, .16, 1], [.02, .17, .6], [.16, .3, .8], [.1, .46, 1.05], [.02, .5, 1.1]], 7, q & 1 ? '#3F7B4A' : '#356B45');
        }
      }
      // 女儿墙与山花
      P.box(fx(.06), top + .08, zc, .3, .16, w + .04, PAL.trim); P.box(xF, top + .42, zc, .26, .56, w, wall, { g: [.9, 1] }); P.box(fx(.03), top + .74, zc, .34, .1, w + .02, PAL.trim);
      const gable = rand();
      if (gable < .45) { // 阶梯山花，嵌一块字号匾
        P.box(xF, top + 1.1, zc, .28, .64, w * .5, wall); P.box(fx(.02), top + 1.46, zc, .34, .1, w * .5 + .1, PAL.trim);
        P.box(xF, top + 1.74, zc, .28, .48, w * .26, wall); P.box(fx(.02), top + 2.02, zc, .34, .09, w * .26 + .1, PAL.trim);
        sign(B.paint, [fx(.15), top + 1.1, zc], R, w * .4, w * .4 * 120 / 512, boardRect(boardN++));
        for (const e of [-1, 1]) PL.lathe(xF, top + .8, zc + e * (w / 2 - .12), [[.1, 0, .9], [.12, .12, 1], [.05, .16, .9], [.11, .3, 1.05], [.02, .42, 1.1]], 7, PAL.trim);
      } else if (gable < .75) { // 镂空栏杆女儿墙
        for (let q = 0; q <= Math.floor((w - .4) / .22); q++) P.box(xF, top + 1.02, z + .2 + q * .22, .08, .5, .08, PAL.trim);
        P.box(xF, top + 1.31, zc, .26, .1, w, PAL.trim);
        for (const e of [-1, 0, 1]) P.box(xF, top + 1.12, zc + e * (w / 2 - .1), .3, .78, .22, PAL.trim);
      } else P.box(xF, top + .98, zc, .28, .4, w * .36, PAL.trim);
      // 挑出来的竖灯箱，两面有字
      const nBox = rand() < .3 ? 2 : rand() < .85 ? 1 : 0;
      for (let q = 0; q < nBox; q++) {
        const k = .9 + rand() * .35, bwid = .5 * k, bh = bwid * 420 / 170, sy = H1 + 1.25 + bh / 2 + rand() * (floors * Hf - bh - 1.5), sz = z + .7 + rand() * (w - 1.4), sx = fx(.3 + bwid / 2), rc = boxRect(boxN++); // 灯箱底边不低于 4.75 m，离镜头远一点
        PL.box(sx, sy, sz, bwid + .05, bh + .05, .13, '#1A1A1E'); PL.box(fx(.18), sy + bh * .36, sz, .4, .04, .04, '#222'); PL.box(fx(.18), sy - bh * .36, sz, .4, .04, .04, '#222');
        sign(B.lit, [sx, sy, sz - .07], [-1, 0, 0], bwid, bh, rc); sign(B.lit, [sx, sy, sz + .07], [1, 0, 0], bwid, bh, rc);
      }
      if (rand() < .85) lantern(fx(.02), H1 - 1.08, zc + (rand() - .5) * .6, 1.25);
      z += w; bay++;
    }
  }
  // ---- 街上空：灯笼串、三角彩旗、电线 ----
  for (let z = 4; z < 40; z += 6) {
    for (let x = -halfW + .3; x <= halfW - .29; x += .82) { const y = 6.55 - Math.cos(x / halfW * 1.25) * .62; lantern(x, y, z, .62, (Math.round(x / .82) & 1) ? PAL.red : '#F2A21E'); }
    for (let q = 0; q < 40; q++) PL.box(-halfW + .1 + q * (halfW * 2 - .2) / 39, 6.82 - Math.cos((-halfW + q * halfW * 2 / 39) / halfW * 1.25) * .62, z, .2, .012, .012, PAL.dark);
  }
  for (let z = 7; z < 40; z += 6) for (let q = 0; q < 22; q++) {
    const x = -halfW + .2 + q * (halfW * 2 - .4) / 21, y = 7.5 - Math.cos(x / halfW * 1.3) * .5;
    PL.tri([x - .15, y, z], [x + .15, y, z], [x, y - .36, z], pick([PAL.red, PAL.gold, '#2E7D5B', '#2C5E9E', '#E9E3D2']));
  }
  // ---- 擂台：回纹红地毯、四角桩与围绳、背板横幅、大鼓与铜锣、令旗、梅花桩、年桔 ----
  const R0 = 41, R1 = 52, rc = (R0 + R1) / 2, cw = halfW * 2 - .5;
  PL.box(0, .025, rc, halfW * 2 - .3, .05, R1 - R0 + .2, '#6E1216');
  B.arena.quad([0, .056, rc], [-1, 0, 0], [0, 0, 1], cw, R1 - R0, ARENA.carpet, ARENA.W, ARENA.H);
  for (const x of [-halfW + .3, halfW - .3]) for (const z of [R0 + .2, R1 - .2]) {
    W.lathe(x, 0, z, [[.16, 0, .7], [.14, .1, 1], [.11, .2, 1], [.11, 1.62, 1], [.15, 1.68, 1.05], [.15, 1.76, 1]], 10, '#8A4A2A');
    G.lathe(x, 1.76, z, [[.15, 0, .7], [.17, .1, 1], [.1, .22, 1.15], [.02, .3, 1.2]], 10, PAL.gold);
  }
  for (const y of [.8, 1.3]) { for (const x of [-halfW + .3, halfW - .3]) PL.box(x, y, rc, .05, .05, R1 - R0 - .4, y > 1 ? '#D9A93A' : '#B3161C'); PL.box(0, y, R1 - .2, halfW * 2 - .6, .05, .05, y > 1 ? '#D9A93A' : '#B3161C'); }
  // 背板：两根红柱架起横幅，柱上对联，檐口一排灯笼
  for (const x of [-3.25, 3.25]) { W.lathe(x, 0, R1 + .7, [[.22, 0, .7], [.19, .12, 1], [.16, .3, 1], [.16, 4.9, 1], [.22, 5, 1]], 12, '#A3262B'); B.granite.box(x, .15, R1 + .7, .6, .3, .6, '#B9B2A6'); }
  W.box(0, 3.5, R1 + .78, 6.7, 2.2, .12, '#7E1418'); B.arena.quad([0, 3.5, R1 + .7], [-1, 0, 0], [0, 1, 0], 6.3, 6.3 * 290 / 1024, ARENA.banner, ARENA.W, ARENA.H);
  for (let q = 0; q < 34; q++) PL.box(-3.07 + q * .186, 1.2, R1 + .8 + (q & 1) * .05, .19, 2.4, .06, q & 1 ? '#8E1A1E' : '#A8242A', { g: [.8, 1] }); // 横幅下的绒幕
  G.box(0, 2.38, R1 + .74, 6.3, .09, .04, '#C9962E', { shade: .8 }); for (let q = 0; q < 42; q++) G.box(-3.07 + q * .15, 2.27, R1 + .74, .03, .14, .02, '#C9962E', { shade: .7 });
  G.lathe(0, 1.3, R1 + .76, [[.62, 0, .7], [.6, .03, .9], [.5, .04, 1], [.47, .02, .6], [.02, .02, .55]], 24, '#C9962E', { axis: 'z-' });
  W.box(0, 4.78, R1 + .7, 7.4, .2, .5, '#5A3A22'); for (let q = 0; q < 15; q++) PL.box(-3.5 + q * .5, 4.95, R1 + .6, .44, .12, .62, q & 1 ? '#2F6B4E' : '#39795A'); PL.box(0, 5.06, R1 + .7, 7.6, .1, .3, '#2A5A42');
  sign(B.paint, [-3.25, 2.3, R1 + .53], [-1, 0, 0], .3, 1.32, coupletRect(0)); sign(B.paint, [3.25, 2.3, R1 + .53], [-1, 0, 0], .3, 1.32, coupletRect(1));
  for (const x of [-2.4, -.8, .8, 2.4]) lantern(x, 4.3, R1 + .5, 1.15);
  // 大鼓
  W.box(-2.5, .28, R1 + .15, .9, .08, .9, '#5A3A22'); for (const [ex, ez] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) W.box(-2.5 + ex * .38, .14, R1 + .15 + ez * .38, .09, .28, .09, '#5A3A22');
  PL.lathe(-2.5, .32, R1 + .15, [[.34, 0, .7], [.47, .2, .95], [.5, .42, 1.05], [.47, .64, 1], [.38, .84, .95]], 16, '#B3261E');
  PL.lathe(-2.5, 1.16, R1 + .15, [[.38, 0, .9], [.36, .02, 1], [.02, .03, 1.05]], 16, '#EAD9B4');
  for (let q = 0; q < 16; q++) { const a = q / 16 * 6.283; G.box(-2.5 + Math.cos(a) * .4, 1.1, R1 + .15 + Math.sin(a) * .4, .04, .04, .04, PAL.gold); }
  // 铜锣架
  for (const e of [-.45, .45]) W.box(2.5 + e, .8, R1 + .2, .08, 1.6, .08, '#5A3A22'); W.box(2.5, 1.6, R1 + .2, 1.1, .08, .08, '#5A3A22');
  PL.box(2.5, 1.45, R1 + .2, .012, .3, .012, PAL.dark); G.lathe(2.5, .98, R1 + .2, [[.36, -.05, .7], [.36, 0, .85], [.33, .03, 1], [.14, .03, .95], [.11, .06, 1.15], [.02, .07, 1.25]], 20, '#C9962E', { axis: 'z-' });
  // 令旗、梅花桩、年桔
  for (const [x, col] of [[-3.3, PAL.red], [3.3, PAL.gold], [-3.05, '#2E7D5B'], [3.05, '#2C5E9E']]) { PL.box(x, 3.4, R1 + 1.25, .04, 6.8, .04, '#B79A55'); PL.tri([x, 6.7, R1 + 1.25], [x, 5.8, R1 + 1.25], [x + (x < 0 ? .9 : -.9), 6.25, R1 + 1.25], col); }
  for (const [x, z, h] of [[1.2, .9, .5], [1.6, 1.15, .8], [.85, 1.25, 1.1], [1.3, 1.45, 1.4]]) W.lathe(x, 0, R1 + z - .35, [[.13, 0, .8], [.13, h, 1], [.02, h + .01, 1.1]], 10, '#9A6A3E');
  kumquat(-1.3, R1 + .55, 1.5); kumquat(-halfW + .5, R0 - .5, 1.2); kumquat(halfW - .5, R0 - .5, 1.2);
  // ---- 街尾：青砖墙上一座绿瓦牌楼 ----
  B.brick.box(0, 5, z1 + .5, halfW * 2 + 7, 10, 1, '#F0E8DA', { g: [.7, 1] });
  for (const x of [-2.6, 2.6]) P.box(x, 3.1, z1 - .1, .7, 6.2, .5, '#B3261E', { g: [.75, 1] });
  P.box(0, 6.5, z1 - .1, 6.6, .7, .56, PAL.trim); B.arena.quad([0, 6.5, z1 - .39], [-1, 0, 0], [0, 1, 0], 2.9, 2.9 * 138 / 512, ARENA.plaque, ARENA.W, ARENA.H);
  for (let k = 0; k < 3; k++) PL.box(0, 6.98 + k * .14, z1 - .1, 7.4 - k * .7, .14, .9 - k * .16, k & 1 ? '#39795A' : '#2F6B4E'); PL.box(0, 7.44, z1 - .1, 5.4, .12, .2, '#E2B04A');
  PL.box(0, 2.9, z1 - .02, 4.5, 5.8, .1, '#2A2422', { shade: .7 });

  // ---- 材质 ----
  const root = new pc.Entity('street');
  const surf = (t, gloss, bump = 1) => { const m = new pc.StandardMaterial(); m.diffuse = new pc.Color(1, 1, 1); m.diffuseVertexColor = true; m.vertexColorGamma = true; m.diffuseMap = t.map; m.normalMap = t.normal; m.bumpiness = bump; m.useMetalness = false; m.specular = new pc.Color(.22, .21, .2); m.gloss = gloss; m.glossMap = t.map; m.glossMapChannel = 'a'; m.update(); return m; };
  const M = { plaster: surf(T.plaster, 1, .9), brick: surf(T.brick, 1), granite: surf(T.granite, 1, 1.1), tile: surf(T.tile, 1, .8), wood: surf(T.wood, 1) };
  M.plain = new pc.StandardMaterial(); M.plain.diffuse = new pc.Color(1, 1, 1); M.plain.diffuseVertexColor = true; M.plain.vertexColorGamma = true; M.plain.gloss = .25; M.plain.specular = new pc.Color(.1, .1, .1); M.plain.cull = pc.CULLFACE_NONE; M.plain.update();
  M.glow = new pc.StandardMaterial(); M.glow.diffuse = new pc.Color(.5, .5, .5); M.glow.diffuseVertexColor = true; M.glow.emissive = new pc.Color(1, 1, 1); M.glow.emissiveVertexColor = true; M.glow.vertexColorGamma = true; M.glow.emissiveIntensity = .8; M.glow.gloss = .5; M.glow.specular = new pc.Color(.25, .2, .15); M.glow.update(); // 灯笼、窗玻璃：自己发光，也吃一点阳光，才有体积
  M.lit = new pc.StandardMaterial(); M.lit.diffuse = new pc.Color(0, 0, 0); M.lit.emissive = new pc.Color(1, 1, 1); M.lit.emissiveMap = T.signs; M.lit.emissiveIntensity = 1.25; M.lit.useLighting = false; M.lit.update();
  M.paint = new pc.StandardMaterial(); M.paint.diffuse = new pc.Color(1, 1, 1); M.paint.diffuseMap = T.signs; M.paint.gloss = .35; M.paint.specular = new pc.Color(.12, .12, .12); M.paint.update();
  M.arena = new pc.StandardMaterial(); M.arena.diffuse = new pc.Color(1, 1, 1); M.arena.diffuseMap = T.arena; M.arena.gloss = .12; M.arena.specular = new pc.Color(.05, .05, .05); M.arena.update();
  for (const k of Object.keys(B)) if (B[k].i.length) root.addChild(B[k].entity(app, 'street-' + k, M[k], shadows && k !== 'glow' && k !== 'lit'));
  // 脚下软影：一圈圈顶点、透明度由里到外淡出（材质要开着光照，关掉的话引擎会把顶点色丢掉）。站在背阴里也有这一团，人才踩在地上
  const blobMat = new pc.StandardMaterial(); blobMat.diffuse = new pc.Color(0, 0, 0); blobMat.specular = new pc.Color(0, 0, 0); blobMat.gloss = 0; blobMat.opacityVertexColor = true; blobMat.opacity = 1; blobMat.blendType = pc.BLEND_NORMAL; blobMat.depthWrite = false; blobMat.cull = pc.CULLFACE_NONE; blobMat.update();
  const blobData = (() => {
    const p = [], c = [], n = [], idx = [], SEG = 22, rings = [[0, .78], [.3, .7], [.55, .46], [.8, .16], [1, 0]]; // [半径比例, 不透明度]
    rings.forEach(([rr, a]) => { for (let q = 0; q < SEG; q++) { const th = q / SEG * 6.283; p.push(Math.cos(th) * .5 * rr, 0, Math.sin(th) * .5 * rr); n.push(0, 1, 0); c.push(0, 0, 0, Math.round(255 * a)); } });
    for (let j = 0; j < rings.length - 1; j++) for (let q = 0; q < SEG; q++) { const a = j * SEG + q, b = j * SEG + (q + 1) % SEG; idx.push(a, a + SEG, b, b, a + SEG, b + SEG); }
    const mesh = new pc.Mesh(app.graphicsDevice); mesh.setPositions(p); mesh.setNormals(n); mesh.setColors32(c); mesh.setIndices(idx); mesh.update();
    return { mesh, idx, vertices: c.filter((_, i) => i % 4 === 3).map((a, i) => [p[i * 3], p[i * 3 + 2], a]) };
  })();
  const blob = () => {
    const e = new pc.Entity('blob'), mi = new pc.MeshInstance(blobData.mesh, blobMat);
    e.addComponent('render', { meshInstances: [mi], castShadows: false, receiveShadows: false }); root.addChild(e);
    let clippedMesh, lastX, lastZ, lastSize;
    e.place = (x, z, size) => {
      if (x === lastX && z === lastZ && size === lastSize) return;
      lastX = x; lastZ = z; lastSize = size;
      // 底板比地毯每侧多 0.1 m，横向半宽 halfW - 0.15；裁剪跟底板实际外沿走。
      const x0 = (-halfW + .15 - x) / size, x1 = (halfW - .15 - x) / size, z0 = (R0 - .1 - z) / size, z1 = (R1 + .1 - z) / size;
      e.setLocalScale(size, 1, size);
      const onRing = x0 <= -.5 && x1 >= .5 && z0 <= -.5 && z1 >= .5;
      if (onRing || x0 >= .5 || x1 <= -.5 || z0 >= .5 || z1 <= -.5) {
        mi.mesh = blobData.mesh; e.setPosition(x, onRing ? .075 : .014, z); return;
      }
      // 仅跨台边时上传各自的网格；其余仍共用原网格。没有每帧向上追赶，停住也不会穿台。
      const p = [], n = [], c = [], idx = [];
      const emit = (poly, y) => {
        if (poly.length < 3) return;
        const base = p.length / 3;
        for (const [vx, vz, a] of poly) { p.push(vx, y, vz); n.push(0, 1, 0); c.push(0, 0, 0, Math.round(a)); }
        for (let k = 1; k < poly.length - 1; k++) idx.push(base, base + k, base + k + 1);
      };
      for (let i = 0; i < blobData.idx.length; i += 3) {
        let poly = blobData.idx.slice(i, i + 3).map(k => blobData.vertices[k]);
        for (const [axis, edge, sign] of [[0, x0, 1], [0, x1, -1], [1, z0, 1], [1, z1, -1]]) {
          const [inside, outside] = splitBlob(poly, axis, edge, sign);
          emit(outside, .014); poly = inside;
        }
        emit(poly, .075);
      }
      clippedMesh ||= new pc.Mesh(app.graphicsDevice);
      clippedMesh.setPositions(p); clippedMesh.setNormals(n); clippedMesh.setColors32(c); clippedMesh.setIndices(idx); clippedMesh.update();
      mi.mesh = clippedMesh; e.setPosition(x, 0, z);
    };
    return e;
  };
  // 投影替身：一个人形的旋转体，只进阳光的阴影贴图、镜头不画它，阳光下的人就有一条顺着光拉长的真影子
  const proxyLayer = new pc.Layer({ name: 'ShadowProxy' }); app.scene.layers.push(proxyLayer);
  const proxyMesh = (() => { const b = new Builder(1); b.lathe(0, 0, 0, [[.02, 0], [.17, .04], [.2, .5], [.25, .95], [.23, 1.3], [.1, 1.46], [.13, 1.58], [.12, 1.72], [.02, 1.8]], 10, '#000000'); const mesh = new pc.Mesh(app.graphicsDevice); mesh.setPositions(b.p); mesh.setNormals(b.n); mesh.setIndices(b.i); mesh.update(); return mesh; })();
  const proxy = () => { const e = new pc.Entity('shadow-proxy'); e.addComponent('render', { meshInstances: [new pc.MeshInstance(proxyMesh, M.plain)], layers: [proxyLayer.id], castShadows: true, receiveShadows: false }); root.addChild(e); return e; };
  return { root, ring: { z0: R0, z1: R1 }, blob, proxy, proxyLayer, tris: Object.values(B).reduce((a, b) => a + b.i.length / 3, 0), meshes: Object.values(B).filter((b) => b.i.length).length };
}

export function addLights(app, parent, { shadows = true, small = false, proxyLayer = null } = {}) {
  const sun = new pc.Entity('sun');
  sun.addComponent('light', {
    type: 'directional', color: new pc.Color(1, .78, .52), intensity: 2.1, castShadows: shadows,
    shadowResolution: small ? 1024 : 2048, shadowDistance: 46, numCascades: small ? 1 : 2, shadowBias: .25, normalOffsetBias: .06, shadowType: pc.SHADOW_PCF3_32F
  });
  sun.setRotation(new pc.Quat().setFromDirections(new pc.Vec3(0, -1, 0), new pc.Vec3(...SUN)));
  if (proxyLayer) sun.light.layers = [pc.LAYERID_WORLD, proxyLayer.id];
  parent.addChild(sun);
  const fill = new pc.Entity('fill'); // 天光：从上方偏蓝紫，补背阴面
  fill.addComponent('light', { type: 'directional', color: new pc.Color(.52, .56, .9), intensity: .55, castShadows: false });
  fill.setRotation(new pc.Quat().setFromDirections(new pc.Vec3(0, -1, 0), new pc.Vec3(-.35, -.8, -.5).normalize()));
  parent.addChild(fill);
  app.scene.ambientLight = new pc.Color(.4, .36, .42);
  // 傍晚的暖霭：远处的骑楼和擂台罩一层橙粉，街才有纵深
  app.scene.fog.type = pc.FOG_LINEAR; app.scene.fog.color = new pc.Color(.96, .66, .47); app.scene.fog.start = 16; app.scene.fog.end = 150;
  return { sun, fill };
}
