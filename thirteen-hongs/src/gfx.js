// 渲染后端（WebGL 版）：渲染器、天穹、江水和程序纹理。WebGPU 版在 gfx-webgpu.js，接口相同，打包时二选一。
import * as THREE from 'three';

export const backend = 'WebGL';
export function createRenderer(canvas, coarse) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = !coarse;   // 桌面：人和船的影子逐帧更新；手机：只烘一次建筑的影子，人用圆片影
  return renderer;
}
export const ready = () => Promise.resolve();
export function gpuName(renderer) { const gl = renderer.getContext(), x = gl.getExtension('WEBGL_debug_renderer_info'); return x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : 'unknown'; }
export const frameInfo = renderer => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles });

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

export function makeWater(SUN, FOG, y) {
const waterMat = new THREE.ShaderMaterial({
  uniforms: { uT: { value: 0 }, uCam: { value: new THREE.Vector3() }, uSun: { value: SUN }, uFog: { value: FOG }, uDeep: { value: new THREE.Color('#77845f') }, uSky: { value: new THREE.Color('#cdd6d2') }, uNear: { value: 140 }, uFar: { value: 1500 } },
  vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: `varying vec3 vW; uniform float uT, uNear, uFar; uniform vec3 uCam, uSun, uFog, uDeep, uSky;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y); }
    float fbm(vec2 p){ return vn(p) * .5 + vn(p * 2.03 + 7.) * .25 + vn(p * 4.1 + 13.) * .125; }
    float h(vec2 p){ return fbm(p * .3 + vec2(uT * .22, uT * .09)) * 2.6 + fbm(p * 1.1 - vec2(uT * .35, uT * .1)) * .8 + sin((p.x + p.y) * .21 + uT * .5) * .25; }
    void main(){ vec2 p = vW.xz; float e = .3;
      float hx = h(p + vec2(e, 0.)) - h(p - vec2(e, 0.)), hz = h(p + vec2(0., e)) - h(p - vec2(0., e));
      float dist = length(uCam - vW), amp = .55 / (1. + dist * .005);
      vec3 n = normalize(vec3(-hx * amp, 1., -hz * amp)), v = normalize(uCam - vW);
      float fr = pow(1. - max(dot(n, v), 0.), 3.);
      vec3 c = mix(uDeep, uSky, clamp(.16 + fr * .85, 0., 1.));
      float sp = max(dot(reflect(-v, n), uSun), 0.); c += vec3(1., .94, .78) * (pow(sp, 160.) * 1.6 + pow(sp, 24.) * .18);
      c += (hx + hz) * .02 * amp;
      c = mix(c, uFog, smoothstep(uNear, uFar, dist));
      gl_FragColor = vec4(c, 1.);
      #include <colorspace_fragment>
    }`,
});
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(9000, 5200), waterMat);
  mesh.rotation.x = -Math.PI / 2; mesh.position.set(0, y, 900);
  return { mesh, update(t, cam) { waterMat.uniforms.uT.value = t; waterMat.uniforms.uCam.value.copy(cam); }, setColors(deep, sky, fog) { waterMat.uniforms.uDeep.value = deep; waterMat.uniforms.uSky.value = sky; waterMat.uniforms.uFog.value = fog; } };
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

