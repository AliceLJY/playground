// 渲染后端（WebGPU 版）：three 的 WebGPURenderer，着色用 TSL 节点写，和 gfx.js 的 GLSL 版逐项对应。
// 浏览器没有 WebGPU 时，WebGPURenderer 会自己退回 WebGL2 后端，HUD 上会写明。
import * as THREE from 'three';
import { noWebGL } from './nogl.js';
import { Fn, float, vec2, vec3, floor, fract, abs, sin, dot, mix, smoothstep, step, select, mod, max, pow, clamp, normalize, reflect, length, attribute, positionLocal, normalLocal, positionWorld, cameraPosition, uniform, texture, screenUV, uv, exp } from 'three/tsl';

export let backend = 'WebGPU';
let adapterName = 'unknown';
export function createRenderer(canvas, coarse) {
  let renderer;
  try { renderer = new THREE.WebGPURenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
  catch (e) { noWebGL(); throw e; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  return renderer;
}
export async function ready(renderer) {
  try { await renderer.init(); }
  catch (e) { noWebGL(); throw e; }   // WebGPU 和 WebGL2 回退都起不来
  const gpu = !!renderer.backend.isWebGPUBackend;
  backend = gpu ? 'WebGPU' : 'WebGL2 回退';
  try {
    if (gpu) { const ad = await navigator.gpu.requestAdapter(), i = ad && ad.info; adapterName = i ? `WebGPU ${i.vendor} ${i.architecture || ''} ${i.description || ''}`.trim() : 'WebGPU'; }
    else { const gl = renderer.getContext(), x = gl.getExtension('WEBGL_debug_renderer_info'); adapterName = x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : 'WebGL2'; }
  } catch { adapterName = backend; }
}
export const gpuName = () => adapterName;
export const frameInfo = renderer => ({ calls: renderer.info.render.drawCalls, tris: renderer.info.render.triangles });

const hash = Fn(([p]) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453)));
const noise = Fn(([p]) => {
  const i = floor(p), f = fract(p), u = f.mul(f).mul(f.mul(-2).add(3));
  return mix(mix(hash(i), hash(i.add(vec2(1, 0))), u.x), mix(hash(i.add(vec2(0, 1))), hash(i.add(vec2(1, 1))), u.x), u.y);
});
const fbm = Fn(([p]) => noise(p).mul(0.5).add(noise(p.mul(2.03).add(7)).mul(0.25)).add(noise(p.mul(4.1).add(13)).mul(0.125)));

export function makeSky(SUN, FOG) {
  const d = normalize(positionLocal), h = clamp(d.y, 0, 1);
  const hor = uniform(FOG), zen = uniform(new THREE.Color('#86a9c2')), sun = uniform(SUN);
  const cp = d.xz.div(max(d.y, 0).add(0.14)).mul(1.3);
  const cl = smoothstep(0.42, 0.72, fbm(cp.mul(vec2(0.55, 1.5)).add(3)));
  let c = mix(hor, zen, pow(h, 0.55));
  c = mix(c, hor.mul(1.2).min(vec3(1, 1, 1)), cl.mul(smoothstep(0.03, 0.2, d.y)).mul(0.6));
  c = c.add(vec3(1, 0.85, 0.6).mul(pow(max(dot(d, sun), 0), 24).mul(0.35)));
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false }); m.colorNode = c;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(4200, 24, 12), m);
  mesh.setColors = (h2, z2) => { hor.value = h2; zen.value = z2; };
  return mesh;
}

export function makeWater(SUN, FOG, y, DEN) {
  const uT = uniform(0), sun = uniform(SUN), fog = uniform(FOG), deep = uniform(new THREE.Color('#77845f')), sky = uniform(new THREE.Color('#cdd6d2'));
  const hf = Fn(([p]) => fbm(p.mul(0.3).add(vec2(uT.mul(0.22), uT.mul(0.09)))).mul(2.6)
    .add(fbm(p.mul(1.1).sub(vec2(uT.mul(0.35), uT.mul(0.1)))).mul(0.8))
    .add(sin(p.x.add(p.y).mul(0.21).add(uT.mul(0.5))).mul(0.25)));
  const p = positionWorld.xz, e = 0.3;
  const hx = hf(p.add(vec2(e, 0))).sub(hf(p.sub(vec2(e, 0)))), hz = hf(p.add(vec2(0, e))).sub(hf(p.sub(vec2(0, e))));
  const toCam = cameraPosition.sub(positionWorld), dist = length(toCam), amp = float(0.55).div(dist.mul(0.005).add(1));
  const n = normalize(vec3(hx.mul(amp).negate(), 1, hz.mul(amp).negate())), v = normalize(toCam);
  const fr = pow(float(1).sub(max(dot(n, v), 0)), 3);
  const sp = max(dot(reflect(v.negate(), n), sun), 0);
  const rt = new THREE.RenderTarget(4, 4), use = uniform(0);
  const refl = texture(rt.texture, clamp(vec2(screenUV.x, screenUV.y.oneMinus()).add(n.xz.mul(0.09)), 0.002, 0.998)).rgb;
  let c = mix(deep, mix(sky, refl, use), clamp(fr.mul(0.85).add(0.16).add(use.mul(0.1)), 0, 1));
  c = c.add(vec3(1, 0.94, 0.78).mul(pow(sp, 160).mul(1.6).add(pow(sp, 24).mul(0.18))));
  c = c.add(hx.add(hz).mul(0.02).mul(amp));
  c = mix(c, fog, float(1).sub(exp(dist.mul(DEN).mul(dist.mul(DEN)).negate())));
  const m = new THREE.MeshBasicNodeMaterial({ fog: false }); m.colorNode = c;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(9000, 5200), m);
  mesh.rotation.x = -Math.PI / 2; mesh.position.set(0, y, 900);
  const rc = new THREE.PerspectiveCamera(), _d = new THREE.Vector3(), _sz = new THREE.Vector2();
  function renderMirror(renderer, scene, camera) {   // 不能叫 reflect：那是 TSL 里求反射向量的函数
    renderer.getDrawingBufferSize(_sz); const w = Math.max(2, _sz.x >> 1), h = Math.max(2, _sz.y >> 1);
    if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
    rc.fov = camera.fov; rc.aspect = camera.aspect; rc.near = camera.near; rc.far = camera.far; rc.updateProjectionMatrix();
    camera.getWorldDirection(_d);
    rc.position.set(camera.position.x, 2 * y - camera.position.y, camera.position.z);
    rc.up.set(0, 1, 0); rc.lookAt(rc.position.x + _d.x, rc.position.y - _d.y, rc.position.z + _d.z);
    mesh.visible = false; renderer.setRenderTarget(rt); renderer.render(scene, rc); renderer.setRenderTarget(null); mesh.visible = true;
    use.value = 1;
  }
  return { mesh, reflect: renderMirror, noReflect() { use.value = 0; }, update(t) { uT.value = t; }, setColors(d2, s2, f2) { deep.value = d2; sky.value = s2; fog.value = f2; } };
}

// 程序纹理：与 gfx.js 的 detail() 同一套公式
export function detail(src) {
  const mat = new THREE.MeshLambertNodeMaterial({ vertexColors: true, side: src.side });
  const m = floor(attribute('aMat', 'float').add(0.5)), p = positionLocal, an = abs(normalLocal);
  const u = select(an.x.greaterThan(an.z), p.z, p.x), v = select(an.x.greaterThan(an.z), p.x, p.z);
  const grain = noise(p.xz.mul(2.3).add(p.y.mul(1.7)));
  const line = (x, w) => smoothstep(0, w, abs(fract(x).sub(0.5)));
  const k1 = float(0.74).add(line(u.mul(2.6), 0.3).mul(0.26)).mul(float(0.9).add(step(0.5, fract(v.mul(1.6).add(p.y.mul(1.6)))).mul(0.1))).mul(float(0.9).add(grain.mul(0.2)));
  const a2 = select(an.y.greaterThan(0.6), p.x, p.y);
  const k2 = float(0.8).add(line(a2.mul(2.4), 0.07).mul(0.2)).mul(float(0.9).add(noise(vec2(a2.mul(3), p.z.add(p.x).mul(14))).mul(0.16)));
  const k3 = float(0.8).add(step(0.5, fract(u.add(p.y).mul(5))).mul(0.12)).add(step(0.5, fract(u.sub(p.y).mul(5))).mul(0.12));
  const row = floor(p.y.mul(3.3));
  const k4 = float(0.84).add(line(p.y.mul(3.3), 0.08).mul(line(u.mul(1.5).add(mod(row, 2).mul(0.5)), 0.05)).mul(0.16)).mul(float(0.92).add(grain.mul(0.14)));
  const k0 = float(0.93).add(grain.mul(0.12));
  const k = select(m.equal(1), k1, select(m.equal(2), k2, select(m.equal(3), k3, select(m.equal(4), k4, k0))));
  mat.colorNode = vec3(k);
  return mat;
}

// 图集材质：与 gfx.js 的 atlasMat() 同一套做法，用节点写
export function atlasMat(tex, mask, cols, rows) {
  const mat = new THREE.MeshLambertNodeMaterial();
  const p = uv().add(attribute('aCell', 'vec2')).mul(vec2(1 / cols, 1 / rows));
  mat.colorNode = texture(tex, p).rgb.mul(mix(vec3(1, 1, 1), attribute('aTint', 'vec3'), texture(mask, p).r));
  return mat;
}
