// 西关骑楼街：程序化搭建，无外部模型。所有方块合并成少数几个网格（一种材质一个），手机上 draw call 保持个位数。
// 街道沿 +z，宽 HALF_W*2；两侧骑楼骑在人行道上，擂台在 z≈40–52。
import * as pc from 'playcanvas';

const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const FACE = [ // normal, then 4 corners as (sx,sy,sz) signs
  [[1,0,0],[[1,-1,-1],[1,1,-1],[1,1,1],[1,-1,1]]],
  [[-1,0,0],[[-1,-1,1],[-1,1,1],[-1,1,-1],[-1,-1,-1]]],
  [[0,1,0],[[-1,1,-1],[-1,1,1],[1,1,1],[1,1,-1]]],
  [[0,-1,0],[[-1,-1,1],[-1,-1,-1],[1,-1,-1],[1,-1,1]]],
  [[0,0,1],[[1,-1,1],[1,1,1],[-1,1,1],[-1,-1,1]]],
  [[0,0,-1],[[-1,-1,-1],[-1,1,-1],[1,1,-1],[1,-1,-1]]]
];
class Builder {
  constructor() { this.p = []; this.n = []; this.c = []; this.i = []; }
  box(cx, cy, cz, sx, sy, sz, color, shade = 1) {
    const [r, g, b] = typeof color === 'string' ? hex(color) : color;
    for (const [nrm, corners] of FACE) {
      const base = this.p.length / 3;
      // cheap baked light: tops brighter, bottoms darker, sides by direction
      const k = shade * (nrm[1] > 0 ? 1.08 : nrm[1] < 0 ? .55 : nrm[0] !== 0 ? .82 : .95);
      for (const [a, bb, cc] of corners) {
        this.p.push(cx + a * sx / 2, cy + bb * sy / 2, cz + cc * sz / 2);
        this.n.push(...nrm);
        this.c.push(Math.min(255, r * k), Math.min(255, g * k), Math.min(255, b * k), 255);
      }
      this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  entity(app, name, material) {
    const mesh = new pc.Mesh(app.graphicsDevice);
    mesh.setPositions(this.p); mesh.setNormals(this.n); mesh.setColors32(this.c); mesh.setIndices(this.i); mesh.update();
    const e = new pc.Entity(name);
    e.addComponent('render', { meshInstances: [new pc.MeshInstance(mesh, material)], castShadows: false, receiveShadows: false });
    return e;
  }
}

const PAL = {
  wall: ['#E8D3A9', '#E9C9A0', '#D9C8A8', '#EBD8B8', '#E3BFA2', '#CFD6C6'],
  trim: '#F3E6CC', pillar: '#D8C29A', shadow: '#8C7A63', brick: '#5B6470', road: '#7B7369', walk: '#A99C88',
  red: '#D7262E', gold: '#F2B230', green: '#3F7D63', blue: '#3E6E9E', wood: '#7A4A2A', dark: '#2B2730'
};
const GLASS = ['#D7262E', '#F2B230', '#3F7D63', '#3E6E9E', '#E77FA0'];
const SIGNS = ['#D7262E', '#1F3A5F', '#2E5E3E', '#F2B230'];

export function buildStreet(app, { halfW = 3.6, z0 = -8, z1 = 58, seed = 3 } = {}) {
  let s = seed; const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const solid = new Builder(), glow = new Builder();
  // road and kerbs
  solid.box(0, -.05, (z0 + z1) / 2, halfW * 2 + .2, .1, z1 - z0, PAL.road);
  for (let z = z0; z < z1; z += 1.2) solid.box(0, .002, z, .08, .01, .5, '#9E9586'); // faded lane dashes
  const sideX = halfW + .15;
  for (const side of [-1, 1]) {
    const xKerb = side * (halfW + .1);
    solid.box(xKerb, .06, (z0 + z1) / 2, .2, .12, z1 - z0, '#9A8F80');
    // arcade walkway under the buildings
    solid.box(side * (sideX + 1.5), .07, (z0 + z1) / 2, 3, .14, z1 - z0, PAL.walk);
    let z = z0;
    while (z < z1) {
      const w = 3.6 + Math.floor(rand() * 3) * .6, floors = 2 + Math.floor(rand() * 2), wall = PAL.wall[Math.floor(rand() * PAL.wall.length)];
      const zc = z + w / 2, xFront = side * sideX, xBack = side * (sideX + 3.2);
      const H1 = 3.4, Hf = 2.9, top = H1 + floors * Hf;
      // colonnade pillars at both ends of the bay, and a square arch between them
      for (const pz of [z + .2, z + w - .2]) solid.box(xFront, H1 / 2, pz, .42, H1, .42, PAL.pillar);
      solid.box(xFront, H1 - .25, zc, .4, .5, w - .4, PAL.trim);
      solid.box(xFront, H1 - .62, z + .62, .3, .26, .42, PAL.trim);
      solid.box(xFront, H1 - .62, z + w - .62, .3, .26, .42, PAL.trim);
      // shopfront deep inside the arcade
      solid.box(xBack, H1 / 2, zc, .2, H1, w, PAL.shadow, .9);
      if (rand() < .7) glow.box(xBack - side * .12, 1.3, zc, .05, 1.8, w * .55, rand() < .5 ? '#FFC877' : '#FFE2A8');
      // ceiling of the arcade
      solid.box(side * (sideX + 1.6), H1 + .02, zc, 3.2, .1, w, '#C9B48E');
      // upper floors
      solid.box(side * (sideX + 1.6), H1 + floors * Hf / 2, zc, 3.4, floors * Hf, w, wall);
      for (let f = 0; f < floors; f++) {
        const yb = H1 + f * Hf;
        solid.box(xFront - side * .02, yb + .05, zc, .14, .12, w, PAL.trim);
        const nWin = w > 4.4 ? 3 : 2;
        for (let k = 0; k < nWin; k++) {
          const wz = z + (k + .5) * w / nWin;
          solid.box(xFront - side * .05, yb + 1.45, wz, .06, 1.7, .95, PAL.trim);
          // 满洲窗：彩色玻璃小格
          for (let gy = 0; gy < 3; gy++) for (let gx = 0; gx < 2; gx++)
            glow.box(xFront - side * .09, yb + 1.0 + gy * .45, wz - .2 + gx * .4, .03, .38, .34, GLASS[(gy * 2 + gx + k + f) % GLASS.length]);
          if (rand() < .4) solid.box(xFront - side * .25, yb + .55, wz, .4, .08, 1.1, PAL.dark); // balcony ledge
        }
      }
      // parapet with gable
      solid.box(xFront, top + .35, zc, .3, .7, w, PAL.trim);
      if (rand() < .5) solid.box(xFront, top + .85, zc, .3, .4, w * .4, PAL.trim);
      // vertical shop sign hanging out over the walkway
      if (rand() < .75) {
        const sc = SIGNS[Math.floor(rand() * SIGNS.length)], sy = H1 + 1.2 + rand() * 1.6, sz = z + .8 + rand() * (w - 1.6);
        solid.box(xFront - side * .55, sy, sz, .9, 2.0, .14, sc);
        for (let c = 0; c < 4; c++) solid.box(xFront - side * .55, sy + .7 - c * .45, sz + .075, .45, .3, .02, PAL.gold, .95);
      }
      // red lanterns under the arch
      if (rand() < .8) { const ly = H1 - .95; glow.box(xFront - side * .3, ly, zc, .36, .42, .36, PAL.red); glow.box(xFront - side * .3, ly - .3, zc, .1, .18, .1, PAL.gold); }
      z += w;
    }
  }
  // lantern strings across the street, hung above the highest camera (main.js caps it at 5.6 m)
  for (let z = 4; z < 40; z += 6) for (let x = -halfW; x <= halfW; x += .9)
    glow.box(x, 6.4 - Math.cos(x / halfW * 1.2) * .5, z, .22, .26, .22, (Math.round(x / .9) & 1) ? PAL.red : PAL.gold);
  // 擂台：地面高度的红毯方台，四角桩，背后横幅与鼓架
  const R0 = 41, R1 = 52;
  solid.box(0, .02, (R0 + R1) / 2, halfW * 2 - .3, .05, R1 - R0, '#A3262B');
  solid.box(0, .05, (R0 + R1) / 2, halfW * 2 - 1.1, .02, R1 - R0 - .8, '#C23A35');
  for (const x of [-halfW + .3, halfW - .3]) for (const z of [R0 + .2, R1 - .2]) {
    solid.box(x, .9, z, .22, 1.8, .22, PAL.wood);
    glow.box(x, 1.9, z, .3, .3, .3, PAL.gold);
  }
  for (const x of [-halfW + .3, halfW - .3]) solid.box(x, 1.3, (R0 + R1) / 2, .04, .04, R1 - R0, PAL.gold);
  solid.box(0, 1.3, R1 - .2, halfW * 2 - .6, .04, .04, PAL.gold);
  solid.box(0, 3.4, R1 + .6, 6.4, 2.2, .2, PAL.red);
  solid.box(0, 3.4, R1 + .48, 5.8, 1.7, .04, PAL.gold);
  for (let k = 0; k < 4; k++) solid.box(-1.8 + k * 1.2, 3.4, R1 + .44, .9, .9, .02, PAL.red);
  solid.box(-2.6, .6, R1 + .3, .9, 1.2, .9, '#8C3A1E'); solid.box(-2.6, 1.22, R1 + .3, .85, .05, .85, '#E9D7B0'); // drum
  // far wall closing the view
  solid.box(0, 4, z1 + .5, halfW * 2 + 7, 8, 1, '#CBB894');

  const app2 = app;
  const mat = new pc.StandardMaterial();
  mat.diffuse = new pc.Color(1, 1, 1); mat.diffuseVertexColor = true; mat.useLighting = true; mat.update();
  const glowMat = new pc.StandardMaterial();
  glowMat.diffuse = new pc.Color(0, 0, 0); glowMat.emissive = new pc.Color(1, 1, 1); glowMat.emissiveVertexColor = true; glowMat.emissiveIntensity = 1.15; glowMat.useLighting = false; glowMat.update();
  const root = new pc.Entity('street');
  root.addChild(solid.entity(app2, 'street-solid', mat));
  root.addChild(glow.entity(app2, 'street-glow', glowMat));
  return { root, ring: { z0: R0, z1: R1 } };
}

export function addLights(app, parent) {
  const sun = new pc.Entity('sun');
  sun.addComponent('light', { type: 'directional', color: new pc.Color(1, .82, .62), intensity: 1.15, castShadows: false });
  sun.setEulerAngles(38, 125, 0);
  parent.addChild(sun);
  const fill = new pc.Entity('fill');
  fill.addComponent('light', { type: 'directional', color: new pc.Color(.55, .55, .85), intensity: .35, castShadows: false });
  fill.setEulerAngles(60, -60, 0);
  parent.addChild(fill);
  app.scene.ambientLight = new pc.Color(.42, .36, .40);
}
