// 骑楼雨夜 · 渲染后端：渲染器与泛光、湿地面倒影、程序纹理、天穹、雨丝。全部由着色器算出，没有贴图文件。
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export const FOG = new THREE.Color('#0e1626');
const NOISE = `
  float gH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float gN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(gH(i), gH(i + vec2(1., 0.)), f.x), mix(gH(i + vec2(0., 1.)), gH(i + vec2(1., 1.)), f.x), f.y); }`;

export function createRenderer(canvas, quality) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !quality.bloom, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.dpr));
  renderer.shadowMap.enabled = quality.shadow; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.info.autoReset = false;
  return renderer;
}
export function gpuName(renderer) {
  const gl = renderer.getContext(), x = gl.getExtension('WEBGL_debug_renderer_info');
  return x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : 'unknown';
}
export const frameInfo = renderer => { const r = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; renderer.info.reset(); return r; };

// 画面管线：有泛光时走合成器（霓虹才会晕开），没有时直接画
export function createPipeline(renderer, scene, camera, quality) {
  let composer = null, bloom = null;
  const size = new THREE.Vector2();
  function build() {
    if (!quality.bloom) { composer = null; return; }
    renderer.getDrawingBufferSize(size);
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.5, 0.7, 0.92);
    composer.addPass(bloom);
    composer.addPass(new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
        void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; if (!(c.r >= 0. && c.g >= 0. && c.b >= 0.)) c = vec3(0.); c = min(c, vec3(60.)); float l = dot(c, vec3(.2126, .7152, .0722));
          c = mix(c, c * vec3(.86, .98, 1.12), (1. - smoothstep(.0, .35, l)) * .55);
          c = mix(c, c * vec3(1.08, 1.0, .9), smoothstep(.4, 1.4, l) * .5);
          c = mix(vec3(l), c, 1.08);
          c *= 1.12;
          vec2 d = vUv - .5; c *= 1. - smoothstep(.4, .98, length(d * vec2(1., .8))) * .36;
          gl_FragColor = vec4(c, 1.); }`,
    }));
    composer.addPass(new OutputPass());
  }
  build();
  return {
    render() { if (composer) composer.render(); else renderer.render(scene, camera); },
    resize(w, h) { renderer.setSize(w, h, false); if (composer) composer.setSize(w, h); },
    rebuild: build,
  };
}

// 世界材质：顶点色 + 按材质号算出磨损、水渍、砖缝、石板缝、锈迹（反照率、凹凸、粗糙度三样一起变）+ 烘在顶点上的霓虹光 + （地面）倒影
// 材质号：0 灰泥墙 1 青砖 2 木 3 卷闸 4 麻石板 5 柏油 6 广场石 7 金属与杂件 8 瓦
export function worldMaterial(shared, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: opts.wet ? 0.5 : 0.86, metalness: 0 });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uT = shared.uT; sh.uniforms.uRefl = shared.uRefl; sh.uniforms.uRes = shared.uRes; sh.uniforms.uUse = shared.uUse;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aMat; attribute vec3 aGlow; varying float vMat; varying vec3 vGlow; varying vec3 vWp; varying vec3 vWn;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMat = aMat; vGlow = aGlow; vWp = position; vWn = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vMat; varying vec3 vGlow; varying vec3 vWp; varying vec3 vWn; uniform float uT, uUse; uniform sampler2D uRefl; uniform vec2 uRes;' + NOISE + `
      float gF(vec2 p){ return gN(p) * .55 + gN(p * 2.1 + 5.) * .3 + gN(p * 4.3 + 11.) * .15; }
      float gF5(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 5; i++) { s += a * gN(p); p = p * 2.03 + 17.; a *= .5; } return s; }
      vec2 gH2(vec2 p){ return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
      float gVor(vec2 x){ vec2 n = floor(x), f = fract(x), mg = vec2(0.), mr = vec2(0.); float md = 8.;
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 g = vec2(float(i), float(j)), r = g + gH2(n + g) - f; float d = dot(r, r); if (d < md) { md = d; mr = r; mg = g; } }
        md = 8.;
        for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) { vec2 g = mg + vec2(float(i), float(j)), r = g + gH2(n + g) - f; if (dot(mr - r, mr - r) > 1e-5) md = min(md, dot(.5 * (mr + r), normalize(r - mr))); }
        return md; }
      float gCrk(vec2 p, float nk){ if (nk <= 0.) return 1.; float v = gVor(p + (gN(p * 3.1) - .5) * .35); return mix(1., smoothstep(.003, .014, v), smoothstep(.42, .6, gN(p * .45 + 31.)) * nk); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      float mId = floor(vMat + .5), kD = 1., hB = 0., kR = 1.; vec3 kT = vec3(1.); vec3 an = abs(vWn);
      float uu = an.x > an.z ? vWp.z : vWp.x; float wall = 1. - step(.6, an.y);
      float grain = gN(vWp.xz * 2.3 + vWp.y * 1.9);
      float blotch = gF(vec2(uu * .45, vWp.y * .45));
      float drip = gN(vec2(uu * 2.6, vWp.y * .16)) * gN(vec2(uu * 7.3 + 3., vWp.y * .5));
      float low = wall * smoothstep(1.3, 0., vWp.y);
      float vdist = length(vViewPosition), nearK = smoothstep(17., 5., vdist), nearC = smoothstep(7., 2., vdist);
      vec2 pq = wall > .5 ? vec2(uu, vWp.y) : vWp.xz; vec4 kU = vec4(0.);
      float fine = .5, pit = 0.;
      if (nearK > 0.) { float fw = max(length(dFdx(pq)), length(dFdy(pq)));
        fine = .5 + (gN(pq * 46.) - .5) * .5 * smoothstep(.5, .12, fw * 46.) + (gN(pq * 130. + 3.) - .5) * .5 * smoothstep(.5, .12, fw * 130.) + (gN(pq * 390. + 9.) - .5) * .4 * smoothstep(.5, .12, fw * 390.);
        pit = smoothstep(.8, .86, gN(pq * 170. + 21.)) * smoothstep(.5, .12, fw * 170.); }
      if (mId == 0.) {
        float pf = gF5(pq * 1.15 + 9.) + low * .05 + (fine - .5) * .05;
        float peel = smoothstep(.615, .635, pf), lip = smoothstep(.585, .615, pf) - peel;
        float crk = gCrk(pq * 1.25, nearK);
        float brow = floor(vWp.y * 9.), bbx = uu * 3.6 + mod(brow, 2.) * .5;
        float bm = smoothstep(0., .1, abs(fract(vWp.y * 9.) - .5)) * smoothstep(0., .045, abs(fract(bbx) - .5));
        float st = gN(vec2(uu * 9., vWp.y * .22)) * gN(vec2(uu * 23. + 3., vWp.y * .6));
        kD = (.84 + .2 * grain) * (.72 + .46 * blotch) * (1. - .2 * smoothstep(.2, .6, drip) - .3 * smoothstep(.3, .62, st)) * (.5 + .5 * crk) * (1. + .12 * lip);
        kT = mix(vec3(1.), vec3(.74, .86, .7), low * .65 * blotch + .2 * smoothstep(.45, .7, drip));
        kD *= 1. - .4 * low;
        kU = vec4(mix(vec3(.2, .195, .185), vec3(.3, .15, .1) * (.6 + .7 * gH(vec2(floor(bbx), brow))), bm) * (.7 + .5 * fine) * (1. - .45 * low), peel);
        hB = .3 * grain - 1.3 * peel + .5 * lip - 1.1 * (1. - crk) + bm * .5 * peel; kR = 1.05 - .3 * smoothstep(.3, .6, drip) - .15 * smoothstep(.3, .62, st);
      } else if (mId == 1.) {
        float row = floor(vWp.y * 9.), bx = uu * 3.6 + mod(row, 2.) * .5;
        float mortar = smoothstep(0., .1, abs(fract(vWp.y * 9.) - .5)) * smoothstep(0., .045, abs(fract(bx) - .5));
        float id = gH(vec2(floor(bx), row));
        kD = (.5 + .5 * mortar) * (.72 + .5 * id) * (.82 + .26 * grain) * (.75 + .4 * blotch) * (1. - .3 * smoothstep(.25, .6, drip));
        kT = mix(vec3(1.), vec3(.7, .9, .66), low * .7 + .3 * step(.82, id));
        float chip = smoothstep(.6, .7, gN(vec2(bx, vWp.y * 9.) * 2.7 + 5.)) * (1. - mortar) ; kD *= (1. - .35 * low) * (.5 + .5 * gCrk(pq * 1.1 + 40., nearK)); hB = mortar * .9 + id * .2; kR = 1.1 - .3 * id;
      } else if (mId == 2.) {
        float pl = smoothstep(0., .08, abs(fract(uu * 4.) - .5));
        float gr = gN(vec2(uu * 5., vWp.y * 26.)) * .6 + gN(vec2(uu * 11., vWp.y * 60.)) * .4;
        kD = (.72 + .28 * pl) * (.74 + .4 * gr) * (.8 + .3 * blotch); hB = pl * .6 + gr * .4; kR = .9;
      } else if (mId == 3.) {
        float cor = abs(sin(vWp.y * 34.));
        float rust = smoothstep(.5, .72, gF(vec2(uu * 1.6, vWp.y * 1.2 + 4.))) + .7 * smoothstep(.3, .6, drip);
        float scr = smoothstep(.93, 1., gN(vec2(uu * 1.4 + vWp.y * 9., vWp.y * 2.2)));
        kD = (.62 + .38 * cor) * (.8 + .25 * grain) * (1. - .3 * low) + scr * .25;
        kT = mix(vec3(1.), vec3(1.25, .62, .34), clamp(rust, 0., 1.) * .6);
        hB = cor * .8 + scr; kR = .55 + .5 * clamp(rust, 0., 1.);
      } else if (mId == 4.) {
        vec2 g2 = vec2(vWp.x * .8 + mod(floor(vWp.z * 1.25), 2.) * .5, vWp.z * 1.25);
        float joint = smoothstep(0., .035, abs(fract(g2.y) - .5)) * smoothstep(0., .022, abs(fract(g2.x) - .5));
        float id = gH(floor(g2 + .5));
        float spk = mix(.25, gN(vWp.xz * 19.) * gN(vWp.xz * 9. + 3.), smoothstep(22., 4., length(vViewPosition)));
        kD = (.55 + .45 * joint) * (.78 + .34 * id) * (.8 + .5 * spk) * (.8 + .3 * gF(vWp.xz * .5));
        kT = mix(vec3(1.), vec3(.86, .93, 1.04), id * .5);
        hB = joint * .9 + spk * .3; kR = .75 + .3 * id;
      } else if (mId == 5.) {
        float lod = smoothstep(26., 5., length(vViewPosition));
        float agg = mix(.5, gN(vWp.xz * 11.) * .6 + gN(vWp.xz * 23.) * .4, lod);
        float cr = gCrk(vWp.xz * .5, smoothstep(30., 8., vdist));
        float patchK = step(.72, gN(floor(vWp.xz * vec2(.22, .13)) + 3.)) * step(.08, fract(vWp.x * .22)) * step(.05, fract(vWp.z * .13));
        float oil = smoothstep(.62, .75, gF(vWp.xz * .7 + 20.));
        kD = (.82 + .3 * agg) * (.6 + .4 * cr) * (1. - .2 * patchK) * (.8 + .3 * gF(vWp.xz * .3)) * (1. - .3 * oil);
        hB = agg * .12 + cr * .12 - patchK * .15; kR = 1. - .5 * oil;
      } else if (mId == 6.) {
        vec2 g2 = vWp.xz * .5; float joint = smoothstep(0., .03, abs(fract(g2.x) - .5)) * smoothstep(0., .03, abs(fract(g2.y) - .5));
        float id = gH(floor(g2 + .5));
        kD = (.55 + .45 * joint) * (.8 + .3 * id) * (.82 + .3 * grain) * (.8 + .3 * gF(vWp.xz * .4)); hB = joint + grain * .3; kR = .8 + .25 * id;
      } else if (mId == 8.) {
        float til = abs(sin(uu * 14.)) * smoothstep(0., .2, fract(vWp.y * 5. + vWp.x * 2.));
        kD = (.6 + .4 * til) * (.8 + .3 * blotch); hB = til; kR = .7;
      } else {
        float scr = smoothstep(.9, 1., gN(vec2(uu * 3. + vWp.y * 14., vWp.y * 3.)));
        kD = (.84 + .2 * grain) * (.8 + .3 * blotch) * (1. - .25 * smoothstep(.3, .6, drip) * wall) + scr * .12;
        kT = mix(vec3(1.), vec3(1.2, .7, .45), smoothstep(.62, .8, blotch) * .35 * wall);
        hB = grain * .3 + scr; kR = .7 + .4 * blotch;
      }
      if (mId < 3.5 || mId > 6.5) { kD *= (.9 + .2 * fine) * (1. - .3 * pit); hB += fine * .05 - pit * .1; }
      diffuseColor.rgb = mix(diffuseColor.rgb * kD * kT, kU.rgb, kU.a);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor * kR, .08, 1.);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      { vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition); float dhx = dFdx(hB), dhy = dFdy(hB);
        vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx); float det = dot(dpx, r1);
        vec3 nb = abs(det) * normal - sign(det) * (dhx * r1 + dhy * r2) * .16;
        if (dot(nb, nb) > 1e-14) normal = normalize(nb); }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vGlow * diffuseColor.rgb;');
    if (opts.wet) {
      sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      { float pud = smoothstep(.34, .6, gN(vWp.xz * .33) * .62 + gN(vWp.xz * 1.4 + 9.) * .38);
        float edge = smoothstep(.0, .5, pud) * (1. - smoothstep(.5, 1., pud));
        float dry = mId == 4. ? .5 : 1.;
        float wet = (.45 + .55 * pud) * dry;
        vec2 rp = vWp.xz * (5. + 6. * pud);
        vec2 rip = (vec2(gN(rp + uT * 1.7), gN(rp + 7. - uT * 1.4)) - .5) * (.02 - .013 * pud) + dFdx(hB) * .02 * (1. - pud);
        vec2 cell = floor(vWp.xz * 1.6), fc = fract(vWp.xz * 1.6) - .5;
        float ph = fract(uT * 1.9 + gH(cell) * 7.), born = step(.72, gH(cell + floor(uT * 1.9 + gH(cell) * 7.)));
        vec2 off = vec2(gH(cell + 3.), gH(cell + 9.)) * .5 - .25; float rr = length(fc - off);
        float ringW = born * smoothstep(.05, .0, abs(rr - ph * .42)) * (1. - ph);
        rip += (fc - off) / (rr + .01) * ringW * .03;
        vec2 suv = gl_FragCoord.xy / uRes; vec2 q = vec2(suv.x, 1. - suv.y) + rip;
        vec3 rf = texture2D(uRefl, clamp(q, .002, .998)).rgb * .4;
        rf += texture2D(uRefl, clamp(q + vec2(0., .018), .002, .998)).rgb * .22;
        rf += texture2D(uRefl, clamp(q - vec2(0., .022), .002, .998)).rgb * .2;
        rf += texture2D(uRefl, clamp(q + vec2(0., .05), .002, .998)).rgb * .1;
        rf += texture2D(uRefl, clamp(q - vec2(0., .06), .002, .998)).rgb * .08;
        float fr = .1 + .9 * pow(1. - max(dot(normalize(vViewPosition), normal), 0.), 3.);
        outgoingLight = outgoingLight * (1. - .4 * wet - .12 * edge) + rf * fr * wet * 1.5 * uUse;
        float splash = born * smoothstep(.06, .0, rr) * smoothstep(.25, .0, ph);
        outgoingLight += vec3(.5, .56, .66) * (splash * .5 + ringW * .12) * smoothstep(40., 4., length(vViewPosition)); }
      #include <opaque_fragment>`);
    }
  };
  mat.customProgramCacheKey = () => 'qilou-world-5-' + (opts.wet ? 'wet' : 'dry');
  return mat;
}

// 倒影：把相机按地面镜像过去再拍一遍（半分辨率），地面材质按屏幕坐标取样
export function createReflection(renderer, shared) {
  const rc = new THREE.PerspectiveCamera(), d = new THREE.Vector3(), sz = new THREE.Vector2();
  rc.layers.set(0);
  let rt = null;
  return {
    render(scene, camera, hide) {
      renderer.getDrawingBufferSize(sz);
      const w = Math.max(2, sz.x >> 1), h = Math.max(2, sz.y >> 1);
      if (!rt) rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType }); else if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
      rc.fov = camera.fov; rc.aspect = camera.aspect; rc.near = 0.2; rc.far = camera.far; rc.updateProjectionMatrix();
      camera.getWorldDirection(d);
      rc.position.set(camera.position.x, -camera.position.y, camera.position.z);
      rc.up.set(0, 1, 0); rc.lookAt(rc.position.x + d.x, rc.position.y - d.y, rc.position.z + d.z);
      for (const o of hide) o.visible = false;
      const sm = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(rt); renderer.render(scene, rc); renderer.setRenderTarget(null);
      renderer.shadowMap.autoUpdate = sm;
      for (const o of hide) o.visible = true;
      shared.uRefl.value = rt.texture; shared.uRes.value.copy(sz); shared.uUse.value = 1;
    },
    off() { shared.uUse.value = 0; },
  };
}

export function makeSky() {
  return new THREE.Mesh(new THREE.SphereGeometry(900, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uHor: { value: new THREE.Color('#2a2338') }, uZen: { value: new THREE.Color('#05070d') }, uGlow: { value: new THREE.Color('#5a3a2a') } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `varying vec3 vD; uniform vec3 uHor, uZen, uGlow;` + NOISE + `
      void main(){ vec3 d = normalize(vD); float h = clamp(d.y, 0., 1.);
        vec3 c = mix(uHor, uZen, pow(h, .42));
        float cl = gN(d.xz / (d.y + .2) * 1.6 + 3.) * .6 + gN(d.xz / (d.y + .2) * 4.) * .4;
        c += uGlow * cl * smoothstep(.0, .5, 1. - h) * .5;
        gl_FragColor = vec4(c, 1.);
      }`,
  }));
}

// 雨丝：一批线段围着相机循环下落，位置在顶点着色器里算
export function makeRain(count) {
  const pos = new Float32Array(count * 6), seed = new Float32Array(count * 2), end = new Float32Array(count * 2);
  let a = 9;
  const r = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  for (let i = 0; i < count; i++) {
    const x = r() * 30 - 15, y = r() * 16, z = r() * 30 - 15, s = r();
    pos.set([x, y, z, x, y, z], i * 6); seed.set([s, s], i * 2); end.set([0, 1], i * 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uT: { value: 0 }, uCam: { value: new THREE.Vector3() } },
    vertexShader: `attribute float aSeed, aEnd; uniform float uT; uniform vec3 uCam; varying float vA;
      void main(){ vec3 p = position; float sp = 17. + aSeed * 9.;
        p.y = mod(p.y - uT * sp, 16.);
        p.xz = mod(p.xz - uCam.xz + 15., 30.) - 15. + uCam.xz;
        p.y += uCam.y - 5.;
        p += vec3(.035, 1., .012) * aEnd * (.55 + aSeed * .5);
        vec4 mv = viewMatrix * vec4(p, 1.);
        vA = (.16 + .3 * aSeed) * smoothstep(34., 4., -mv.z) * smoothstep(.3, 1.6, -mv.z);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(vec3(.62, .74, .95) * vA, vA); }',
  });
  const mesh = new THREE.LineSegments(g, m);
  mesh.frustumCulled = false; mesh.layers.set(1);
  return { mesh, update(t, cam) { m.uniforms.uT.value = t; m.uniforms.uCam.value.copy(cam); } };
}
