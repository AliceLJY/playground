// 渲染后端（WebGL 版）：渲染器、天穹、江水和程序纹理。WebGPU 版在 gfx-webgpu.js，接口相同，打包时二选一。
import * as THREE from 'three';
import { noWebGL } from './nogl.js';

export const backend = 'WebGL';
export function createRenderer(canvas, coarse) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
  catch (e) { noWebGL(); throw e; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;            // 一帧里有阴影、倒影、主画面三遍，合起来计数
  renderer.shadowMap.autoUpdate = !coarse;   // 桌面：人和船的影子逐帧更新；手机：只烘一次建筑的影子，人用圆片影
  return renderer;
}
export const ready = () => Promise.resolve();
export function gpuName(renderer) { const gl = renderer.getContext(), x = gl.getExtension('WEBGL_debug_renderer_info'); return x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : 'unknown'; }
export const frameInfo = renderer => { const r = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; renderer.info.reset(); return r; };

// 把相机按水面镜像过去：位置和视线方向的 y 都翻转
export function mirror(rc, camera, y, d) {
  rc.fov = camera.fov; rc.aspect = camera.aspect; rc.near = camera.near; rc.far = camera.far; rc.updateProjectionMatrix();
  camera.getWorldDirection(d);
  rc.position.set(camera.position.x, 2 * y - camera.position.y, camera.position.z);
  rc.up.set(0, 1, 0); rc.lookAt(rc.position.x + d.x, rc.position.y - d.y, rc.position.z + d.z);
}

export function makeSky(SUN, FOG) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(4200, 24, 12), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { uSun: { value: SUN }, uHor: { value: FOG }, uZen: { value: new THREE.Color('#86a9c2') } },
  vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: `varying vec3 vD; uniform vec3 uSun, uHor, uZen;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y); }
    float fbm(vec2 p){ return vn(p) * .5 + vn(p * 2.03 + 7.) * .25 + vn(p * 4.1 + 13.) * .125; }
        void main(){ vec3 d = normalize(vD); float h = clamp(d.y, 0., 1.);
      vec3 c = mix(uHor, uZen, pow(h, .55));
      vec2 cp = d.xz / (d.y + .14) * 1.3;
      float cl = smoothstep(.42, .72, fbm(cp * vec2(.55, 1.5) + 3.));
      c = mix(c, min(uHor * 1.2, vec3(1.)), cl * smoothstep(.03, .2, d.y) * .6);
      c += vec3(1., .85, .6) * pow(max(dot(d, uSun), 0.), 24.) * .35;
      gl_FragColor = vec4(c, 1.);
      #include <colorspace_fragment>
    }`,
}));
  sky.setColors = (hor, zen) => { sky.material.uniforms.uHor.value = hor; sky.material.uniforms.uZen.value = zen; };
  return sky;
}

export function makeWater(SUN, FOG, y, DEN) {
const waterMat = new THREE.ShaderMaterial({
  uniforms: { uT: { value: 0 }, uCam: { value: new THREE.Vector3() }, uSun: { value: SUN }, uFog: { value: FOG }, uDeep: { value: new THREE.Color('#77845f') }, uSky: { value: new THREE.Color('#cdd6d2') }, uDen: { value: 0.0019 }, uRefl: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uUse: { value: 0 } },
  vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: `varying vec3 vW; uniform float uT, uDen, uUse; uniform vec3 uCam, uSun, uFog, uDeep, uSky; uniform sampler2D uRefl; uniform vec2 uRes;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y); }
    float fbm(vec2 p){ return vn(p) * .5 + vn(p * 2.03 + 7.) * .25 + vn(p * 4.1 + 13.) * .125; }
    float h(vec2 p){ return fbm(p * .3 + vec2(uT * .22, uT * .09)) * 2.6 + fbm(p * 1.1 - vec2(uT * .35, uT * .1)) * .8 + sin((p.x + p.y) * .21 + uT * .5) * .25; }
    void main(){ vec2 p = vW.xz; float e = .3;
      float hx = h(p + vec2(e, 0.)) - h(p - vec2(e, 0.)), hz = h(p + vec2(0., e)) - h(p - vec2(0., e));
      float dist = length(uCam - vW), amp = .55 / (1. + dist * .005);
      vec3 n = normalize(vec3(-hx * amp, 1., -hz * amp)), v = normalize(uCam - vW);
      float fr = pow(1. - max(dot(n, v), 0.), 3.);
      vec2 suv = gl_FragCoord.xy / uRes;
      vec3 refl = texture2D(uRefl, clamp(vec2(suv.x, 1. - suv.y) + n.xz * .09, .002, .998)).rgb;   // 倒影：镜像相机拍的一遍，按水面法线扰动
      vec3 c = mix(uDeep, mix(uSky, refl, uUse), clamp(.16 + uUse * .1 + fr * .85, 0., 1.));
      float sp = max(dot(reflect(-v, n), uSun), 0.); c += vec3(1., .94, .78) * (pow(sp, 160.) * 1.6 + pow(sp, 24.) * .18);
      c += (hx + hz) * .02 * amp;
      c = mix(c, uFog, 1. - exp(-dist * dist * uDen * uDen));
      gl_FragColor = vec4(c, 1.);
      #include <colorspace_fragment>
    }`,
});
  waterMat.uniforms.uDen.value = DEN;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(9000, 5200), waterMat);
  mesh.rotation.x = -Math.PI / 2; mesh.position.set(0, y, 900);
  let rt = null; const rc = new THREE.PerspectiveCamera(), _d = new THREE.Vector3(), _sz = new THREE.Vector2();
  function reflect(renderer, scene, camera) {
    renderer.getDrawingBufferSize(_sz); const w = Math.max(2, _sz.x >> 1), h = Math.max(2, _sz.y >> 1);
    if (!rt) rt = new THREE.WebGLRenderTarget(w, h); else if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
    mirror(rc, camera, y, _d);
    mesh.visible = false; renderer.setRenderTarget(rt); renderer.render(scene, rc); renderer.setRenderTarget(null); mesh.visible = true;
    waterMat.uniforms.uRefl.value = rt.texture; waterMat.uniforms.uRes.value.copy(_sz); waterMat.uniforms.uUse.value = 1;
  }
  return { mesh, reflect, noReflect() { waterMat.uniforms.uUse.value = 0; }, update(t, cam) { waterMat.uniforms.uT.value = t; waterMat.uniforms.uCam.value.copy(cam); }, setColors(deep, sky, fog) { waterMat.uniforms.uDeep.value = deep; waterMat.uniforms.uSky.value = sky; waterMat.uniforms.uFog.value = fog; } };
}

// 程序纹理：按顶点上的材质号，在片元里给瓦、木板、篾席、砖石加纹路（不用任何贴图）
export function detail(mat) {
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aMat; varying float vMat; varying vec3 vOp; varying vec3 vOn;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMat = aMat; vOp = position; vOn = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying float vMat; varying vec3 vOp; varying vec3 vOn;
      float dHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float dNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(dHash(i), dHash(i + vec2(1., 0.)), f.x), mix(dHash(i + vec2(0., 1.)), dHash(i + vec2(1., 1.)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      { float m = floor(vMat + .5), k = 1.; vec3 p = vOp; vec3 an = abs(vOn);
        float u = an.x > an.z ? p.z : p.x;                      // 沿墙面或屋脊的水平方向
        float grain = dNoise(p.xz * 2.3 + p.y * 1.7);
        if (m == 1.) { float v = an.x > an.z ? p.x : p.z; k = (.74 + .26 * smoothstep(.0, .3, abs(fract(u * 2.6) - .5))) * (.9 + .1 * step(.5, fract(v * 1.6 + p.y * 1.6))) * (.9 + .2 * grain); }
        else if (m == 2.) { float a = an.y > .6 ? p.x : p.y; k = (.8 + .2 * smoothstep(0., .07, abs(fract(a * 2.4) - .5))) * (.9 + .16 * dNoise(vec2(a * 3., (p.z + p.x) * 14.))); }
        else if (m == 3.) { float w1 = step(.5, fract((u + p.y) * 5.)), w2 = step(.5, fract((u - p.y) * 5.)); k = .8 + .12 * w1 + .12 * w2; }
        else if (m == 4.) { float row = floor(p.y * 3.3); k = (.84 + .16 * smoothstep(0., .08, abs(fract(p.y * 3.3) - .5)) * smoothstep(0., .05, abs(fract(u * 1.5 + mod(row, 2.) * .5) - .5))) * (.92 + .14 * grain); }
        else { k = .93 + .12 * grain; }
        diffuseColor.rgb *= k; }`);
  };
  return mat;
}


// 图集材质：脸和衣服都画在一张分格的画布上，每个人用实例属性 aCell 选格、aTint 染色。
// mask 是同样分格的灰度图：白处乘上 aTint（皮肤、布料），黑处保持画上去的原色（眼白、头发、纽扣）。
export function atlasMat(tex, mask, cols, rows) {
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uMask = { value: mask }; sh.uniforms.uCell = { value: new THREE.Vector2(1 / cols, 1 / rows) };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aCell; attribute vec3 aTint; uniform vec2 uCell; varying vec3 vTint;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = (uv + aCell) * uCell; vTint = aTint;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uMask; varying vec3 vTint;')
      .replace('#include <map_fragment>', 'diffuseColor.rgb *= texture2D(map, vMapUv).rgb * mix(vec3(1.), vTint, texture2D(uMask, vMapUv).r);');
  };
  return mat;
}
