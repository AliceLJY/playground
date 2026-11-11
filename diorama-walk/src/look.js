// 外观：程序化表面（砖、灰泥、木板、混凝土、地砖、柏油、铁皮、旧漆金属、纸箱、底座木）、有字的招牌与灯箱、
// 一件件搭的构件（雨棚铁皮、水管、空调外机、水箱、电线、路灯）、湿地上的倒影、灯的光晕、最后一道调色。
// 全部在页面打开时由代码生成，没有贴图文件。只管画，不碰玩法（core.js 不动；构件都不是实体）。
// 表面着色的做法取自同仓 qilou-rain/src/gfx.js 的 worldMaterial（按材质号在标准材质的着色器里算反照率、凹凸），
// 这里改成按世界坐标挂在 Lambert / Phong 上，并只画外墙面：店内的墙面保持原样（店内不在这次范围）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as C from './core.js';

const NOISE = /* glsl */`
  float gH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float gN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(gH(i), gH(i + vec2(1., 0.)), f.x), mix(gH(i + vec2(0., 1.)), gH(i + vec2(1., 1.)), f.x), f.y); }
  float gF(vec2 p){ return gN(p) * .55 + gN(p * 2.1 + 5.) * .3 + gN(p * 4.3 + 11.) * .15; }
  // a line of half-width w (in cell units) at the cell edges, anti-aliased by its own screen footprint
  float edgeLine(float f, float w, float fw){ float e = min(f, 1. - f); return 1. - smoothstep(w - fw, w + fw, e); }`;

// Surface kinds (the GLSL below switches on SURF):
export const K = { BRICK: 1, PLASTER: 2, FRONT: 3, CONCRETE: 4, PAVING: 5, ASPHALT: 6, TIN: 7, METAL: 8, CARD: 9, BENCH: 10, PLINTH: 11, ROOF: 12, TILE: 13 };
// Which faces are the outside: 0 all of them, 1 the faces on the building's outer boundary plus the front pieces (uBox = x0, z0, x1, z1)
const SURFACE_GLSL = /* glsl */`
  vec3 an = abs(vWn); float flat_ = step(.6, an.y);
  float uu = an.x > an.z ? vWp.z : vWp.x; vec2 pq = flat_ > .5 ? vWp.xz : vec2(uu, vWp.y);
  float hB = 0., kS = 0.; vec3 alb = diffuseColor.rgb; bool ext = true;
  #if SURF_EXT == 1
    ext = (an.x > .5 && ((vWn.x > 0. && vWp.x > uBox.z - .01) || (vWn.x < 0. && vWp.x < uBox.x + .01)))
       || (an.z > .5 && ((vWn.z > 0. && vWp.z > uBox.w - .01) || (vWn.z < 0. && vWp.z < uBox.y + .01)))
       || (vWp.z > uBox.w - .205 && vWn.z > -.5 && vWn.y < .5);
  #endif
  // the shared noises, cheap versions on big flat ground (most of the hero picture: one value noise each, not three)
  float grain = gN(pq * 9.3), blotch = gN(pq * .45 + 3.) * .65 + gN(pq * 1.1 + 8.) * .35, drip = 0.;
  if (flat_ < .5) drip = gN(vec2(uu * 2.6, vWp.y * .16)) * gN(vec2(uu * 7.3 + 3., vWp.y * .5));   // rain streaks running down walls
  float low = (1. - flat_) * smoothstep(1.1, .12, vWp.y);                                   // rising damp and splash-back
  if (ext) {
  #if SURF == 1 || SURF == 3 || SURF == 2 || SURF == 13
    // ---- a wall: brick, plaster over brick, the shop front's boards; a band of small tiles at the foot
    bool wood = false, tile = false;
    #if SURF == 3
      wood = vWp.x > 2.95 && vWp.y < 2.8 && an.z > .5;
    #endif
    #if SURF != 13
      tile = vWp.y < .5 && !wood && flat_ < .5;
    #else
      tile = true;
    #endif
    float row = floor(vWp.y / .075), bxu = uu / .235 + mod(row, 2.) * .5;
    vec2 cfw = fwidth(vec2(bxu, vWp.y / .075));
    float mort = max(edgeLine(fract(bxu), .055, cfw.x), edgeLine(fract(vWp.y / .075), .16, cfw.y));
    mort = mix(mort, .26, smoothstep(.12, .3, max(cfw.x, cfw.y)));                         // far away: the average, not moire
    float bid = gH(vec2(floor(bxu), row)), clink = step(.86, gH(vec2(floor(bxu) + 7., row)));
    vec3 brickC = mix(vec3(.12, .042, .024), vec3(.18, .066, .036), bid);
    brickC = mix(brickC, vec3(.065, .032, .022), clink);
    brickC *= .85 + .3 * gN(vec2(uu * 23., vWp.y * 31.));
    vec3 brick = mix(brickC, vec3(.11, .1, .088), mort);
    float bh = (1. - mort) * (.7 + .3 * bid);
    if (wood) {
      // vertical tongue-and-groove boards, dark red-brown paint worn through to grey wood at the edges and low down
      float pu = uu / .11, pfw = fwidth(pu);
      float groove = edgeLine(fract(pu), .05, pfw);
      float gr = gN(vec2(pu * 3., vWp.y * 2.2)) * .6 + gN(vec2(pu * 9., vWp.y * 7.)) * .4;
      float wear = smoothstep(.55, .75, gF(vec2(uu * 1.7, vWp.y * 1.3) + 9.) + .25 * low + .2 * smoothstep(2.2, 2.75, vWp.y));
      vec3 paint = vec3(.13, .045, .03) * (.85 + .3 * gH(vec2(floor(pu), 1.)));
      vec3 bare = vec3(.1, .085, .065) * (.7 + .5 * gr);
      alb = mix(mix(paint * (.9 + .2 * gr), bare, wear), vec3(.025, .02, .018), groove);
      hB = (1. - groove) * .8 + gr * .25 - wear * .25;
    } else if (tile) {
      // 5 cm mosaic tiles, mostly off-white, grimy grout, a few missing
      vec2 tc = vec2(uu, vWp.y) / .05; vec2 tfw = fwidth(tc);
      float grout = max(edgeLine(fract(tc.x), .08, tfw.x), edgeLine(fract(tc.y), .08, tfw.y));
      grout = mix(grout, .3, smoothstep(.3, .55, max(tfw.x, tfw.y)));
      float tid = gH(floor(tc) + 3.), miss = step(.965, gH(floor(tc) + 11.));
      vec3 tileC = mix(vec3(.2, .205, .19), vec3(.13, .17, .16), step(.7, tid)) * (.75 + .3 * tid);
      alb = mix(mix(tileC, vec3(.07, .065, .06), grout), brickC * .6, miss);
      hB = (1. - grout) * .6 - miss; kS = .25 * (1. - grout);
      alb *= 1. - .35 * smoothstep(.3, .0, vWp.y - .12) ;                                  // splash dirt
      alb = mix(alb, vec3(.04, .036, .03), step(.47, vWp.y) * step(vWp.y, .5));          // top edge trim
    } else {
      alb = brick; hB = bh;
      #if SURF == 2
        // old plaster (a dull cream once), peeling off in patches to the brick underneath
        float pf = gF(pq * 1.1 + 4.) + .08 * low;
        float peel = smoothstep(.6, .63, pf), lip = smoothstep(.57, .6, pf) - peel;
        vec3 plaster = vec3(.17, .15, .115) * (.8 + .4 * blotch) * (.9 + .2 * grain);
        alb = mix(plaster, brick, peel); alb *= 1. - .25 * lip;
        hB = mix(grain * .3, bh * .6 - .8, peel) + lip * .6;
      #endif
    }
    // weathering on all of it: streaks from the top, a darker damp band low down, grime under the eave
    float topK = smoothstep(2.6, 3.5, vWp.y);
    alb *= (1. - .32 * smoothstep(.25, .6, drip) * (.5 + .5 * topK)) * (.82 + .3 * blotch) * (1. - .42 * low);
    alb = mix(alb, alb * vec3(.75, .88, .72), low * .6 * blotch);
  #elif SURF == 4 || SURF == 12
    // ---- concrete: fascia, coping, parapets, sills; the flat roofs (12) with tar-sealed joints and standing water
    float stain = smoothstep(.2, .65, drip) * (1. - flat_);
    alb = vec3(.1, .097, .09) * (.78 + .35 * blotch) * (.9 + .2 * grain) * (1. - .45 * stain);
    alb = mix(alb, alb * vec3(.8, .9, .78), smoothstep(.55, .8, blotch) * .5);
    hB = grain * .4 + blotch * .3;
    #if SURF == 12
    if (flat_ > .5) {
      vec2 sc = vWp.xz / vec2(2.4, 2.0) + gN(vWp.xz * .7) * .04; vec2 sfw = fwidth(sc);
      float seam = max(edgeLine(fract(sc.x), .025, sfw.x), edgeLine(fract(sc.y), .03, sfw.y));
      float pud = smoothstep(.6, .7, gN(vWp.xz * .5 + 21.));
      float tarP = step(.8, gH(floor(sc) + 5.)) * smoothstep(.45, .6, gN(vWp.xz * 1.7));
      float corner = smoothstep(.9, .3, min(min(vWp.x - uBox.x, uBox.z - vWp.x), min(vWp.z - uBox.y, uBox.w - vWp.z)));
      alb *= .72;                                                                            // weathered dark grey, not a lit floor
      alb = mix(alb, vec3(.025, .024, .024), max(seam * .4, tarP * .75));
      alb = mix(alb, vec3(.03, .045, .02), corner * smoothstep(.35, .65, blotch) * .8);     // moss and silt along the parapets
      alb *= 1. - .3 * pud; kS = .2 + .9 * pud + .3 * seam;
      hB = hB * (1. - pud) - seam * .5;
    }
    #endif
  #elif SURF == 5
    // ---- pavement: 50 cm concrete slabs, a row of long kerb stones at the edge, all wet
    float kerb = step(3.2, vWp.z) * step(vWp.z, 3.52) + (1. - flat_) * step(3.45, vWp.z);
    vec2 sc = kerb > .5 ? vec2(vWp.x / .9, (vWp.z - 3.2) / .32) : vWp.xz / .5; vec2 sfw = fwidth(sc);
    float joint = max(edgeLine(fract(sc.x), .025, sfw.x), edgeLine(fract(sc.y), .025, sfw.y));
    joint = mix(joint, .1, smoothstep(.3, .55, max(sfw.x, sfw.y)));
    float sid = gH(floor(sc) + kerb * 13.);
    vec3 slab = mix(vec3(.038, .04, .045), vec3(.056, .056, .058), sid) * (.8 + .35 * blotch) * (.88 + .24 * grain);
    if (kerb > .5) slab = vec3(.085, .085, .085) * (.75 + .3 * sid) * (.85 + .3 * grain);
    float wet = smoothstep(.45, .7, gN(vWp.xz * .4 + 7.));
    alb = mix(slab, vec3(.014, .014, .016), joint * .8) * (1. - .35 * wet);
    kS = (.35 + .9 * wet) * (1. - joint); hB = (1. - joint) * .5 + grain * .2;
  #elif SURF == 6
    // ---- asphalt: aggregate, patched and cracked, oil, puddles
    float aggK = 1. - smoothstep(.02, .08, length(fwidth(vWp.xz))), agg = .5;
    if (aggK > 0.) agg = gN(vWp.xz * 27.) * .6 + gN(vWp.xz * 61.) * .4;
    float patchK = step(.74, gN(floor(vWp.xz * vec2(.25, .4)) + 3.));
    float crack = smoothstep(.015, .0, abs(gN(vWp.xz * 1.3) - .5) - .002) * smoothstep(.5, .7, blotch);
    float oil = smoothstep(.66, .8, gN(vWp.xz * .7 + 20.)), pud = smoothstep(.6, .72, gN(vWp.xz * .35 + 2.));
    alb = vec3(.025, .026, .03) * (.85 + mix(.12, .4, aggK) * agg) * (1. - .2 * patchK) * (.8 + .35 * blotch) * (1. - .35 * oil);
    alb *= 1. - .5 * crack; alb *= 1. - .4 * pud;
    kS = .25 + .3 * oil + 1.1 * pud; hB = agg * .25 * aggK - crack * .6;
  #elif SURF == 7
    // ---- corrugated tin, painted once, rust bleeding from the fixings and along the troughs
    float cor = .5 + .5 * sin(vWp.x * 6.2831 / .076);
    float rust = smoothstep(.5, .75, gF(vec2(vWp.x * 1.4, vWp.z * 2.2 + vWp.y * 3.))) + .6 * smoothstep(.75, 1., gN(vec2(vWp.x * 13., vWp.z * .8)));
    alb = diffuseColor.rgb * (.65 + .35 * cor) * (.85 + .25 * grain);
    alb = mix(alb, vec3(.2, .07, .025), clamp(rust, 0., 1.) * .75);
    hB = cor * (1. - flat_ * 0.) ; kS = .5 * (1. - clamp(rust, 0., 1.));
  #elif SURF == 8
    // ---- painted metal: scuffs, rust specks, darker towards the bottom
    float scr = smoothstep(.93, 1., gN(vec2(uu * 3. + vWp.y * 14., vWp.y * 3.)));
    float rust = smoothstep(.68, .8, gF(pq * 3.1 + 7.)) + .5 * low;
    alb = diffuseColor.rgb * (.82 + .25 * grain) * (.85 + .25 * blotch) * (1. - .3 * smoothstep(.3, .6, drip));
    alb = mix(alb, vec3(.12, .05, .02), clamp(rust, 0., 1.) * .55) + scr * .04;
    hB = grain * .2 + scr * .4; kS = .3;
  #elif SURF == 9
    // ---- cardboard: flutes, packing tape, wet at the bottom
    float fl = .5 + .5 * sin(uu * 220.);
    float tape = step(abs(uu - floor(uu / .7) * .7 - .35), .025) * (1. - flat_) + flat_ * step(abs(fract(vWp.x * 1.43) - .5), .04);
    alb = diffuseColor.rgb * (.88 + .08 * fl) * (.85 + .25 * blotch);
    alb = mix(alb, vec3(.33, .3, .22), tape * .7);
    alb *= 1. - .45 * smoothstep(.45, .12, vWp.y);
    hB = fl * .1;
  #elif SURF == 10
    // ---- bench: slats along its length, worn grain
    float sl = vWp.z / .11 + .3, sfw = fwidth(sl), gap = edgeLine(fract(sl), .08, sfw) * flat_;
    float gr = gN(vec2(vWp.x * 3., sl * 9.)) * .6 + gN(vec2(vWp.x * 11., sl * 23.)) * .4;
    alb = mix(diffuseColor.rgb * (.75 + .45 * gr) * (.8 + .3 * blotch), vec3(.01), gap);
    hB = (1. - gap) * .6 + gr * .3; kS = .1;
  #elif SURF == 11
    // ---- the model's base: dark lacquered walnut
    float gr = gN(vec2(uu * 1.4, vWp.y * 40.)) * .6 + gN(vec2(uu * 4., vWp.y * 120.)) * .4;
    alb = vec3(.04, .022, .013) * (.7 + .6 * gr);
    hB = gr * .2; kS = .8;
  #endif
    diffuseColor.rgb = alb;
  }`;

// Patch a Lambert or Phong material (keeping whatever onBeforeCompile it already has, e.g. main.js's indoor ambient).
export function surface(mat, kind, { box = null, low = false } = {}) {
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  const uBox = { value: box ? new THREE.Vector4(box.x0, box.z0, box.x1, box.z1) : new THREE.Vector4() };
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uBox = uBox;
    sh.defines = { ...(sh.defines || {}), SURF: kind, SURF_EXT: box && !box.roof ? 1 : 0, SURF_LOW: low ? 1 : 0 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp; varying vec3 vWn;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(position, 1.)).xyz; vWn = normalize(mat3(modelMatrix) * normal);');
    const fs = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp; varying vec3 vWn; uniform vec4 uBox;' + NOISE)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + SURFACE_GLSL)
      .replace('#include <specularmap_fragment>', '#include <specularmap_fragment>\nspecularStrength = kS;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      { vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition); float dhx = dFdx(hB), dhy = dFdy(hB);
        vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx); float det = dot(dpx, r1);
        vec3 nb = abs(det) * normal - sign(det) * (dhx * r1 + dhy * r2) * .05;
        if (dot(nb, nb) > 1e-14) normal = normalize(nb); }`);
    for (const k of ['varying vec3 vWp;', 'SURF ==', 'specularStrength = kS', 'dFdx(hB)']) if (!fs.includes(k)) throw new Error('surface shader: three chunk changed upstream (' + k + ')');
    sh.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => prevKey() + '|surf' + kind + (box ? 'b' : '') + (low ? 'l' : '');
  return mat;
}
export const phong = (c, shininess = 40) => new THREE.MeshPhongMaterial({ color: c, specular: 0x8a929c, shininess });

// ---------------- lettering: one canvas for every sign, lightbox, notice and the vending machine's front ----------------
// All names are made up and ordinary. Regions are in canvas pixels (1024 x 1024).
const FONT_SANS = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif';
const FONT_BRUSH = '"Kaiti SC","STKaiti","KaiTi","Noto Serif CJK SC",serif';
export const ATLAS = {
  sign: [0, 0, 1024, 180], lightbox: [0, 190, 180, 324], next: [190, 190, 512, 112], neon: [190, 312, 512, 64],
  hours: [710, 190, 150, 200], flyer: [870, 190, 150, 200], fu: [710, 400, 120, 120], vend: [190, 390, 200, 290], poster: [400, 390, 300, 220],
};
export function drawAtlas() {
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const g = c.getContext('2d'), r = C.rng(5150);
  g.clearRect(0, 0, 1024, 1024);
  const clip = ([x, y, w, h], fn) => { g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x, y); fn(w, h); g.restore(); };
  const grime = (w, h, n, a) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(30,22,14,${a * r()})`; g.beginPath(); g.ellipse(r() * w, r() * h, 4 + r() * 30, 2 + r() * 12, r() * 3, 0, Math.PI * 2); g.fill(); } };
  // the shop's lightbox sign: cream panel lit from inside, red brush characters, one tube going at the right end
  clip(ATLAS.sign, (w, h) => {
    const bg = g.createLinearGradient(0, 0, w, 0); bg.addColorStop(0, '#d8cfae'); bg.addColorStop(0.12, '#f4ecd2'); bg.addColorStop(0.7, '#f1e8cc'); bg.addColorStop(0.9, '#cfc29b'); bg.addColorStop(1, '#9d906c');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 3; i++) { g.fillStyle = 'rgba(255,250,235,.25)'; g.fillRect(0, 20 + i * 62, w * 0.86, 8); }   // the tubes behind the panel
    g.fillStyle = '#a3241b'; g.font = `bold 128px ${FONT_BRUSH}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('利 民 杂 货', w * 0.47, h * 0.42);
    g.fillStyle = '#3b2a1d'; g.font = `600 30px ${FONT_SANS}`; g.fillText('烟 酒  ·  汽 水  ·  日 用 百 货', w * 0.47, h * 0.84);
    grime(w, h, 26, 0.18);
    g.strokeStyle = '#2a211a'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
  });
  // the small lightbox: white, red characters, a blue rim
  clip(ATLAS.lightbox, (w, h) => {
    g.fillStyle = '#f3f1ea'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2f62b8'; g.lineWidth = 12; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#c4221a'; g.font = `900 104px ${FONT_SANS}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('烟', w / 2, h * 0.3); g.fillText('酒', w / 2, h * 0.7); grime(w, h, 8, 0.15);
  });
  // next door's painted board: closed for good, faded gold on dark green, paint flaking
  clip(ATLAS.next, (w, h) => {
    g.fillStyle = '#1d2e26'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#9b8550'; g.font = `bold 78px ${FONT_BRUSH}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('好 味 面 家', w / 2, h / 2 + 4);
    for (let i = 0; i < 60; i++) { g.fillStyle = r() < 0.5 ? 'rgba(70,60,48,.9)' : 'rgba(20,30,26,.85)'; g.fillRect(r() * w, r() * h, 2 + r() * 14, 1 + r() * 6); }
    grime(w, h, 20, 0.35);
  });
  // red neon "open" over the window: tubes drawn with a glow
  clip(ATLAS.neon, (w, h) => {
    g.font = `600 46px ${FONT_SANS}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = '#ff2a1a'; g.shadowBlur = 18; g.fillStyle = '#ff3a26'; g.fillText('营 业 中', w / 2, h / 2 + 2); g.fillText('营 业 中', w / 2, h / 2 + 2);
    g.shadowBlur = 0; g.fillStyle = '#ffd7cc'; g.font = `400 46px ${FONT_SANS}`; g.globalAlpha = 0.7; g.fillText('营 业 中', w / 2, h / 2 + 2); g.globalAlpha = 1;
  });
  // paper notices: opening hours, a flyer with tear-off strips, a red 福 diamond, a peeling film poster
  clip(ATLAS.hours, (w, h) => {
    g.fillStyle = '#e4dcc4'; g.fillRect(0, 0, w, h); g.fillStyle = '#2b2622'; g.textAlign = 'center';
    g.font = `bold 26px ${FONT_SANS}`; g.fillText('营业时间', w / 2, 46); g.font = `22px ${FONT_SANS}`; g.fillText('早 7:00', w / 2, 96); g.fillText('晚 23:00', w / 2, 132);
    g.font = `16px ${FONT_SANS}`; g.fillText('夜间请按门铃', w / 2, 176); grime(w, h, 10, 0.25);
  });
  clip(ATLAS.flyer, (w, h) => {
    g.fillStyle = '#d9d6c9'; g.fillRect(0, 0, w, h); g.fillStyle = '#1c3d8a'; g.textAlign = 'center'; g.font = `bold 30px ${FONT_SANS}`; g.fillText('高价回收', w / 2, 44);
    g.fillStyle = '#333'; g.font = `18px ${FONT_SANS}`; g.fillText('旧家电 · 旧手机', w / 2, 80); g.fillText('上门收购', w / 2, 106);
    for (let i = 0; i < 7; i++) { g.fillStyle = i % 3 === 1 ? 'rgba(0,0,0,0)' : '#cfcbbd'; g.fillRect(4 + i * 20, 130, 18, 70); g.fillStyle = '#555'; g.fillRect(12 + i * 20, 138, 2, 54); }
    grime(w, h, 10, 0.3);
  });
  clip(ATLAS.fu, (w, h) => {
    g.translate(w / 2, h / 2); g.rotate(Math.PI / 4); g.fillStyle = '#b81d18'; g.fillRect(-40, -40, 80, 80); g.rotate(-Math.PI / 4);
    g.fillStyle = '#e7c35a'; g.font = `bold 54px ${FONT_BRUSH}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('福', 0, 3);
  });
  clip(ATLAS.vend, (w, h) => {          // rows of cans and bottles behind the vending machine's glass
    g.fillStyle = '#20262c'; g.fillRect(0, 0, w, h);
    const cols = ['#c8352b', '#2c6ec2', '#e9c43a', '#2d9a5a', '#e4e4e4', '#e07b2b'];
    for (let row = 0; row < 4; row++) { g.fillStyle = '#3a4048'; g.fillRect(0, 62 + row * 70, w, 4);
      for (let k = 0; k < 6; k++) { g.fillStyle = cols[(row * 2 + k) % cols.length]; const x = 10 + k * 31, top = 18 + row * 70; g.fillRect(x, top, 22, 42); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x + 3, top + 4, 4, 34); } }
    g.fillStyle = '#111'; g.fillRect(0, h - 10, w, 10);
  });
  clip(ATLAS.poster, (w, h) => {        // an old film poster, mostly torn off
    g.fillStyle = '#3e3a36'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#7a2d22'; g.fillRect(10, 10, w * 0.62, h - 20); g.fillStyle = '#d6b06a'; g.font = `bold 40px ${FONT_SANS}`; g.fillText('雨夜', 30, 70);
    g.fillStyle = '#cfc6b0'; g.fillRect(w * 0.55, 20, w * 0.4, h * 0.55);
    for (let i = 0; i < 40; i++) { g.fillStyle = '#3e3a36'; g.beginPath(); g.moveTo(w * 0.35 + r() * w * 0.7, r() * h); g.lineTo(w * 0.35 + r() * w * 0.7, r() * h); g.lineTo(w * 0.3 + r() * w * 0.7, r() * h); g.fill(); }
    grime(w, h, 20, 0.35);
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
// a quad facing +z (or rotated about y), showing one atlas region
function atlasQuad(region, cx, cy, cz, w, h, ry = 0) {
  const [x, y, rw, rh] = ATLAS[region], g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (x + uv.getX(i) * rw) / 1024, 1 - (y + (1 - uv.getY(i)) * rh) / 1024);
  return g.rotateY(ry).translate(cx, cy, cz);
}

// ---------------- a soft round glow (sprites) and the streaks lit things leave on wet ground ----------------
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.45)'); gr.addColorStop(0.6, 'rgba(255,255,255,.1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const REFL = {
  vertex: /* glsl */`attribute vec4 aSpot; attribute vec3 aCol; varying vec2 vQ; varying vec3 vCol; varying float vGrp; varying vec3 vW;
    void main(){ vQ = aSpot.xy; vCol = aCol; vGrp = aSpot.z; vW = position; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.); }`,
  fragment: /* glsl */`uniform float uTime, uShop; varying vec2 vQ; varying vec3 vCol; varying float vGrp; varying vec3 vW;` + NOISE + `
    void main(){
      // a long soft smear towards the street, broken up by ripples (rain on the puddles)
      float a = exp(-vQ.x * vQ.x * 3.2) * exp(-vQ.y * vQ.y * 1.6);
      float rip = gN(vec2(vW.x * 9., vW.z * 2.2 - uTime * 1.3)) * .6 + gN(vec2(vW.x * 23. + 3., vW.z * 6. + uTime * 2.1)) * .4;
      float pud = smoothstep(.3, .7, gN(vW.xz * .9 + 4.));
      a *= (.35 + .9 * rip) * (.45 + .75 * pud);
      float lv = vGrp > .5 ? uShop : 1.;
      gl_FragColor = vec4(vCol * a * lv, 1.);
    }`,
};

// ---------------- the dressing: everything that is built here ----------------
export function buildLook(scene, { low = false, matFor, MESH, dressBoxes, boxGeo }) {
  const out = { lit: [], halos: [], uniforms: { uTime: { value: 0 }, uShop: { value: 1 } } };
  const add = (key, geo, mat, { cast = false, recv = false, order = 0 } = {}) => {
    const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = recv; m.renderOrder = order; scene.add(m);
    if (MESH[key]) { MESH[key].geometry = mergeGeometries([MESH[key].geometry, geo.index ? geo.toNonIndexed() : geo].map((x) => (x.index ? x.toNonIndexed() : x))); scene.remove(m); return MESH[key]; }
    MESH[key] = m; return m;
  };
  // boxes from dress.js, merged per material and per building they fade with ('mat@store' fades with the store's roof)
  const byMat = {}, lifted = { store: new Set(), next: new Set() }, room = { store: new Set(), next: new Set() };
  const keyOf = (mat, lift, inRoom = true) => { if (!lift) return mat; const k = mat + '@' + lift; lifted[lift].add(k); if (inRoom) room[lift].add(k); return k; };
  for (const b of dressBoxes) (byMat[keyOf(b.mat, b.lift, b.room)] ||= []).push(boxGeo(b));
  out.lifted = lifted; out.room = room;
  // round things: drainpipes on the front corners, the rooftop water tanks on their stands, vent stacks, the lamp
  const cyl = (r0, r1, h, x, y, z, seg = 12) => new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y + h / 2, z);
  const S = C.STORE, N = C.NEXT, FZ = C.FACADE_Z, F = C.SIDEWALK_H;
  const pipes = [];
  for (const x of [S.x0 + 0.1, S.x1 - 0.1]) {
    pipes.push(cyl(0.045, 0.045, 3.3 - 0.32, x, 0.32, FZ + 0.07), cyl(0.055, 0.045, 0.12, x, 3.2, FZ + 0.07));
    pipes.push(new THREE.CylinderGeometry(0.045, 0.045, 0.3, 10).rotateX(Math.PI / 2.6).translate(x, 0.24, FZ + 0.16));   // shoe, turned out onto the pavement
    for (const y of [0.9, 1.8, 2.7]) pipes.push(new THREE.BoxGeometry(0.12, 0.03, 0.09).translate(x, y, FZ + 0.045));
  }
  pipes.push(cyl(0.045, 0.045, 3.1, N.x0 + 0.1, 0.3, FZ + 0.07));
  (byMat.pipe ||= []).push(...pipes);
  const tank = [cyl(0.55, 0.55, 0.95, 7.4, S.h + 0.55, -7.3, 20), cyl(0.57, 0.57, 0.05, 7.4, S.h + 1.5, -7.3, 20), cyl(0.12, 0.12, 0.08, 7.4, S.h + 1.55, -7.3)], tankN = [];
  for (const [dx, dz] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) tank.push(new THREE.BoxGeometry(0.06, 0.55, 0.06).translate(7.4 + dx, S.h + 0.275, -7.3 + dz));
  tank.push(new THREE.BoxGeometry(1.0, 0.05, 1.0).translate(7.4, S.h + 0.53, -7.3));
  tankN.push(cyl(0.42, 0.42, 0.7, -5.2, N.h + 0.05, -6.4, 18), cyl(0.44, 0.44, 0.05, -5.2, N.h + 0.75, -6.4, 18));
  (byMat[keyOf('tank', 'store')] ||= []).push(...tank); (byMat[keyOf('tank', 'next')] ||= []).push(...tankN);
  (byMat[keyOf('metalDark', 'store')] ||= []).push(cyl(0.05, 0.05, 0.9, 4.8, S.h, -6.8, 8), cyl(0.08, 0.06, 0.12, 4.8, S.h + 0.9, -6.8, 8));
  (byMat[keyOf('metalDark', 'next')] ||= []).push(cyl(0.05, 0.05, 0.6, -6.3, N.h, -3.5, 8));
  // the street lamp: a tapering pole, a curved arm, a shallow head with a lit lens under it (the light stays where it was)
  const L = C.LAMP, lampGeo = [cyl(0.16, 0.18, 0.3, L.x, F, L.z, 14), cyl(0.05, 0.075, L.top - F - 0.08, L.x, F + 0.3, L.z, 12)];
  const arm = new THREE.CatmullRomCurve3([new THREE.Vector3(L.x, L.top - 0.35, L.z), new THREE.Vector3(L.x, L.top - 0.05, L.z + 0.12), new THREE.Vector3(L.x, L.top, L.z + 0.45), new THREE.Vector3(L.x, L.top - 0.08, L.z + 0.8)]);
  lampGeo.push(new THREE.TubeGeometry(arm, 16, 0.035, 8, false));
  lampGeo.push(new THREE.CylinderGeometry(0.12, 0.26, 0.16, 16).translate(L.x, L.top - 0.12, L.z + 0.85));
  (byMat.pole ||= []).push(...lampGeo);
  const lensGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.02, 16).translate(L.x, L.top - 0.205, L.z + 0.85);
  // geometry -> meshes (one per material key)
  const CAST = ['acUnit', 'tank', 'hatch', 'lightbox'];
  for (const [k, list] of Object.entries(byMat)) {
    const base = k.split('@')[0];
    // each key gets its own material (each fades on its own when the camera rises out of a building)
    add(k, mergeGeometries(list.map((x) => (x.index ? x.toNonIndexed() : x)).map((x) => { for (const a of Object.keys(x.attributes)) if (!['position', 'normal', 'uv'].includes(a)) x.deleteAttribute(a); return x; })), matFor(base), { cast: CAST.includes(base) });
  }
  add('lamp', lensGeo, matFor('lamp'));
  // overhead and wall cables: sagging lines from the lamp to the shop fronts, a bundle under the fascia
  const v = [], sag = (a, b, d, n = 14) => { for (let i = 0; i < n; i++) { const p = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - d * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]; v.push(...p(i / n), ...p((i + 1) / n)); } };
  sag([L.x, L.top - 0.3, L.z], [S.x0 + 0.4, 3.28, FZ + 0.05], 0.35); sag([L.x, L.top - 0.3, L.z], [N.x0 + 1.2, 3.06, FZ + 0.05], 0.4);
  sag([L.x, L.top - 0.32, L.z], [-12.5, 4.0, 3.2], 0.5); sag([L.x, L.top - 0.32, L.z], [12.5, 3.9, 3.0], 0.7, 24);
  sag([S.x0 + 0.4, 3.28, FZ + 0.05], [S.x1 - 0.3, 3.27, FZ + 0.05], 0.06, 30); sag([S.x0 + 0.4, 3.24, FZ + 0.04], [2.38, 3.24, FZ + 0.04], 0.04, 10);
  const cables = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(v, 3)), new THREE.LineBasicMaterial({ color: 0x07080a }));
  scene.add(cables); out.cables = cables;
  // lettering: the lit signs (follow the shop's lights), the painted ones and notices (lit by the scene)
  const atlas = drawAtlas();
  const litMat = new THREE.MeshBasicMaterial({ map: atlas, color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -1 });
  const neonMat = new THREE.MeshBasicMaterial({ map: atlas, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const paintMat = new THREE.MeshLambertMaterial({ map: atlas, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -1 });
  const vendMat = new THREE.MeshBasicMaterial({ map: atlas, color: new THREE.Color(0.07, 0.07, 0.07), polygonOffset: true, polygonOffsetFactor: -1 });
  const d = S.door;
  const signGeo = [atlasQuad('sign', d.cx, 3.08, FZ + 0.062, 2.5, 0.44)];
  signGeo.push(atlasQuad('lightbox', 3.13 - 0.002, 2.6, FZ + 0.34, 0.46, 0.88, -Math.PI / 2), atlasQuad('lightbox', 3.29 + 0.002, 2.6, FZ + 0.34, 0.46, 0.88, Math.PI / 2));
  out.sign = add('signText', mergeGeometries(signGeo), litMat);
  out.neon = add('neon', atlasQuad('neon', (C.WINDOW.x0 + C.WINDOW.x1) / 2, 2.735, FZ + 0.01, 1.3, 0.16), neonMat, { order: 3 });
  add('sign2Text', atlasQuad('next', N.door.cx, 2.725, FZ + 0.052, 1.6, 0.35), paintMat);
  const papers = [atlasQuad('hours', 3.62, 1.55, FZ + 0.004, 0.24, 0.32), atlasQuad('flyer', -1.2, 1.5, FZ + 0.004, 0.24, 0.32), atlasQuad('poster', -0.4, 1.45, FZ + 0.004, 0.75, 0.55),
    atlasQuad('flyer', -6.9, 1.4, FZ + 0.004, 0.24, 0.32), atlasQuad('poster', -8.2, 1.5, FZ + 0.004, 0.75, 0.55)];
  add('papers', mergeGeometries(papers), paintMat);
  add('vendFront', atlasQuad('vend', 6.4, F + 1.15, FZ + 0.722, 0.74, 1.2), vendMat);
  out.fuGeo = atlasQuad('fu', 0, 0, 0, 0.2, 0.2); out.paintMat = paintMat;
  out.lit.push(litMat, neonMat);
  // glows: the lightbox sign, the small lightbox, the neon, the lamp (sprites, additive, no depth write)
  const gt = glowTexture(), halo = (x, y, z, sx, sy, color, op, shop) => {
    const m = new THREE.SpriteMaterial({ map: gt, color, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const s = new THREE.Sprite(m); s.position.set(x, y, z); s.scale.set(sx, sy, 1); s.renderOrder = 4; scene.add(s); out.halos.push({ s, op, shop }); return s;
  };
  halo(d.cx, 3.08, FZ + 0.35, 3.6, 1.15, 0xffe2ad, 0.55, true);
  halo(3.21, 2.6, FZ + 0.33, 1.0, 1.4, 0xffd0c0, 0.35, true);
  halo((C.WINDOW.x0 + C.WINDOW.x1) / 2, 2.735, FZ + 0.12, 1.9, 0.5, 0xff3a22, 0.45, true);
  halo(L.x, L.top - 0.24, L.z + 0.85, 1.5, 1.5, 0xffb768, 0.7, false);
  // reflections on the wet ground: under the sign (pavement, out into the street), the lightbox, the neon, the lamp
  const rv = [], rs = [], rc = [], refl = (cx, cz, w, len, y, col, grp) => {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz, z1 = cz + len;
    const P = [[x0, z0, -1, 0], [x1, z0, 1, 0], [x1, z1, 1, 1], [x0, z0, -1, 0], [x1, z1, 1, 1], [x0, z1, -1, 1]];
    for (const [x, z, qx, qz] of P) { rv.push(x, y, z); rs.push(qx, qz * 2 - 0.3, grp, 0); rc.push(...col); }
  };
  const ys = F + 0.003;
  refl(d.cx, FZ + 1.15, 2.6, ROAD0() - FZ - 1.15, ys, [0.85, 0.72, 0.48], 1);
  refl(d.cx, ROAD0(), 2.4, 3.2, 0.003, [0.5, 0.42, 0.28], 1);
  refl(3.21, FZ + 0.65, 0.5, 2.0, ys, [0.6, 0.3, 0.22], 1);
  refl((C.WINDOW.x0 + C.WINDOW.x1) / 2, FZ + 1.6, 1.4, 1.9, ys, [0.7, 0.09, 0.05], 1);
  refl(L.x, L.z + 0.2, 1.3, ROAD0() - L.z - 0.2, ys, [0.75, 0.48, 0.2], 0);
  refl(L.x, ROAD0(), 1.4, 4.0, 0.003, [0.6, 0.38, 0.16], 0);
  const rg = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(rv, 3)).setAttribute('aSpot', new THREE.Float32BufferAttribute(rs, 4)).setAttribute('aCol', new THREE.Float32BufferAttribute(rc, 3));
  const rm = new THREE.ShaderMaterial({ uniforms: out.uniforms, vertexShader: REFL.vertex, fragmentShader: REFL.fragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3 });
  const reflMesh = new THREE.Mesh(rg, rm); reflMesh.renderOrder = 1; reflMesh.frustumCulled = false; scene.add(reflMesh); out.refl = reflMesh;
  return out;
}
const ROAD0 = () => 3.5;

// Final grade: a little cold in the shadows, warm in the lights, darker towards the corners. Pure colour, no noise,
// so it moves no pixel from one frame to the next.
export const GradeShader = {
  name: 'Grade',
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.3 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: /* glsl */`uniform sampler2D tDiffuse; uniform float uVig; varying vec2 vUv;
    void main(){ vec4 t = texture2D(tDiffuse, vUv); vec3 c = t.rgb; float l = dot(c, vec3(.2126, .7152, .0722));
      c = mix(c, c * vec3(.9, .97, 1.1), (1. - smoothstep(.0, .25, l)) * .5);
      c = mix(c, c * vec3(1.06, 1.0, .92), smoothstep(.3, 1.2, l) * .5);
      vec2 d = vUv - .5; c *= 1. - smoothstep(.45, 1.0, length(d * vec2(1., .85))) * uVig;
      gl_FragColor = vec4(c, t.a); }`,
};
