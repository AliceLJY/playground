// 骑楼雨夜 · 渲染后端：渲染器与泛光、湿地面倒影、程序纹理、天穹、雨丝。全部由着色器算出，没有贴图文件。
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

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
    composer.addPass(new OutputPass());
  }
  build();
  return {
    render() { if (composer) composer.render(); else renderer.render(scene, camera); },
    resize(w, h) { renderer.setSize(w, h, false); if (composer) composer.setSize(w, h); },
    rebuild: build,
  };
}

// 世界材质：顶点色 + 按材质号加纹路 + 烘在顶点上的霓虹光 + （地面）倒影
export function worldMaterial(shared, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: opts.wet ? 0.5 : 0.86, metalness: 0 });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uT = shared.uT; sh.uniforms.uRefl = shared.uRefl; sh.uniforms.uRes = shared.uRes; sh.uniforms.uUse = shared.uUse;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aMat; attribute vec3 aGlow; varying float vMat; varying vec3 vGlow; varying vec3 vWp; varying vec3 vWn;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMat = aMat; vGlow = aGlow; vWp = position; vWn = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vMat; varying vec3 vGlow; varying vec3 vWp; varying vec3 vWn; uniform float uT, uUse; uniform sampler2D uRefl; uniform vec2 uRes;' + NOISE)
      .replace('#include <color_fragment>', `#include <color_fragment>
      float mId = floor(vMat + .5), kD = 1.; vec3 an = abs(vWn);
      float uu = an.x > an.z ? vWp.z : vWp.x;
      float grain = gN(vWp.xz * 2.3 + vWp.y * 1.9);
      float streak = gN(vec2(uu * 1.7, vWp.y * .22));
      if (mId == 0.) { kD = (.84 + .2 * grain) * (.7 + .4 * streak) * (.9 + .1 * gN(vec2(uu * 14., vWp.y * 14.))); }
      else if (mId == 1.) { float row = floor(vWp.y * 9.); kD = (.8 + .2 * smoothstep(0., .1, abs(fract(vWp.y * 9.) - .5)) * smoothstep(0., .04, abs(fract(uu * 3.6 + mod(row, 2.) * .5) - .5))) * (.86 + .2 * grain) * (.82 + .24 * streak); }
      else if (mId == 2.) { kD = (.8 + .2 * smoothstep(0., .08, abs(fract(uu * 4.) - .5))) * (.9 + .16 * gN(vec2(uu * 4., vWp.y * 16.))); }
      else if (mId == 3.) { kD = .72 + .28 * abs(sin(vWp.y * 34.)); }
      else if (mId == 4.) { float rz = floor(vWp.z * 1.25); kD = (.78 + .22 * smoothstep(0., .03, abs(fract(vWp.z * 1.25) - .5)) * smoothstep(0., .02, abs(fract(vWp.x * .8 + mod(rz, 2.) * .5) - .5))) * (.88 + .2 * grain); }
      else if (mId == 5.) { kD = .8 + .3 * gN(vWp.xz * 9.) * gN(vWp.xz * 1.1 + 3.); }
      else if (mId == 6.) { kD = (.8 + .2 * smoothstep(0., .03, abs(fract(vWp.x * .5) - .5)) * smoothstep(0., .03, abs(fract(vWp.z * .5) - .5))) * (.88 + .2 * grain); }
      diffuseColor.rgb *= kD;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      { vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition); float dhx = dFdx(kD), dhy = dFdy(kD);
        vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx); float det = dot(dpx, r1);
        normal = normalize(abs(det) * normal - sign(det) * (dhx * r1 + dhy * r2) * .22); }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vGlow * diffuseColor.rgb;');
    if (opts.wet) {
      sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      { float pud = smoothstep(.34, .6, gN(vWp.xz * .33) * .62 + gN(vWp.xz * 1.4 + 9.) * .38);
        float dry = mId == 4. ? .42 : 1.;
        float wet = (.5 + .5 * pud) * dry;
        vec2 rp = vWp.xz * (5. + 6. * pud);
        vec2 rip = (vec2(gN(rp + uT * 1.7), gN(rp + 7. - uT * 1.4)) - .5) * (.02 - .013 * pud);
        float ring = sin(length(fract(vWp.xz * .9 + gH(floor(vWp.xz * .9) + floor(uT * 1.6))) - .5) * 60. - uT * 16.);
        rip += ring * .003 * pud;
        vec2 suv = gl_FragCoord.xy / uRes; vec2 q = vec2(suv.x, 1. - suv.y) + rip;
        vec3 rf = texture2D(uRefl, clamp(q, .002, .998)).rgb * .4;
        rf += texture2D(uRefl, clamp(q + vec2(0., .018), .002, .998)).rgb * .22;
        rf += texture2D(uRefl, clamp(q - vec2(0., .022), .002, .998)).rgb * .2;
        rf += texture2D(uRefl, clamp(q + vec2(0., .05), .002, .998)).rgb * .1;
        rf += texture2D(uRefl, clamp(q - vec2(0., .06), .002, .998)).rgb * .08;
        float fr = .1 + .9 * pow(1. - max(dot(normalize(vViewPosition), normal), 0.), 3.);
        outgoingLight = outgoingLight * (1. - .35 * wet) + rf * fr * wet * 1.5 * uUse; }
      #include <opaque_fragment>`);
    }
  };
  mat.customProgramCacheKey = () => 'qilou-world-' + (opts.wet ? 'wet' : 'dry');
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
