// Procedural Earth, atmosphere, sun and stars for the background pass. No textures: continents,
// clouds and city lights come from 3D value noise evaluated on the sphere in the fragment shader.
import * as THREE from 'three';
import { EARTH, mulberry } from './core.js';

const NOISE = `
float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + 1.0), f.x), f.y), f.z); }
float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++) { s += a * n3(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
`;

export function buildEarth() {
  const group = new THREE.Group(); group.name = 'earth';
  const uniforms = { uSun: { value: new THREE.Vector3(0, 1, 0) }, uSpin: { value: 0 }, uCam: { value: new THREE.Vector3() } };
  const surface = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `varying vec3 vN; varying vec3 vW; uniform float uSpin;
      varying vec3 vP; void main(){ vN = normalize(normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
      float c = cos(uSpin), s = sin(uSpin); vP = vec3(c * vN.x - s * vN.z, vN.y, s * vN.x + c * vN.z);
      gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 uSun; uniform vec3 uCam; varying vec3 vN; varying vec3 vW; varying vec3 vP;
      ${NOISE}
      void main(){
        vec3 n = normalize(vN), v = normalize(uCam - vW);
        float land = smoothstep(0.52, 0.56, fbm(vP * 2.2 + 3.0) + 0.08 * fbm(vP * 9.0));
        float dry = smoothstep(0.45, 0.65, fbm(vP * 4.0 + 20.0)) * (1.0 - smoothstep(0.55, 0.85, abs(vP.y)));
        float ice = smoothstep(0.82, 0.9, abs(vP.y) + 0.06 * fbm(vP * 6.0));
        vec3 ocean = mix(vec3(0.010, 0.045, 0.12), vec3(0.03, 0.14, 0.26), smoothstep(0.42, 0.53, fbm(vP * 2.2 + 3.0)));
        vec3 ground = mix(vec3(0.07, 0.13, 0.045), vec3(0.34, 0.26, 0.15), dry);
        vec3 albedo = mix(ocean, ground, land); albedo = mix(albedo, vec3(0.85, 0.9, 0.95), ice);
        float cloud = smoothstep(0.5, 0.75, fbm(vP * 3.1 + vec3(0.0, 40.0, 0.0)) * 0.7 + 0.3 * fbm(vP * 11.0));
        float ndl = dot(n, uSun), day = smoothstep(-0.08, 0.18, ndl), lit = max(ndl, 0.0);
        vec3 col = albedo * lit * 1.35 + cloud * vec3(0.95, 0.97, 1.0) * lit * 1.1;
        // Specular glint on open ocean.
        vec3 hv = normalize(uSun + v); col += (1.0 - land) * (1.0 - cloud) * pow(max(dot(n, hv), 0.0), 60.0) * vec3(1.0, 0.92, 0.8) * 0.9 * step(0.0, ndl);
        // Warm band at the terminator, city lights on the night side.
        col += vec3(0.5, 0.22, 0.08) * cloud * exp(-pow(ndl * 9.0, 2.0)) * 0.35;
        float city = land * (1.0 - ice) * smoothstep(0.62, 0.78, fbm(vP * 38.0)) * (1.0 - cloud * 0.8);
        col += vec3(1.0, 0.68, 0.32) * city * (1.0 - day) * 0.55;
        float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        col = mix(col, vec3(0.32, 0.55, 1.0) * (0.15 + day), rim * 0.55 * smoothstep(-0.25, 0.25, ndl));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH.radius, 192, 128), surface);
  earth.position.set(...EARTH.center); earth.userData.role = 'earth'; group.add(earth);
  const air = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 uSun; uniform vec3 uCam; varying vec3 vW;
      void main(){
        // Analytic shell glow: optical depth along the view ray grazing a thin shell, lit by the sun.
        vec3 c = vec3(${EARTH.center.join(',')}), ray = normalize(vW - uCam), oc = uCam - c;
        float b = dot(oc, ray), closest = sqrt(max(dot(oc, oc) - b * b, 0.0));
        float hgt = (closest - ${EARTH.radius.toFixed(1)}) / ${(EARTH.radius * 0.022).toFixed(1)};
        float blocked = step(closest, ${EARTH.radius.toFixed(1)}) * step(0.0, -b);
        float dens = exp(-max(hgt, 0.0) * 1.6) * (1.0 - smoothstep(-0.6, 0.0, -hgt) * 0.0);
        vec3 mid = uCam + ray * max(-b, 0.0), up = normalize(mid - c);
        float sunUp = dot(up, uSun), litShell = smoothstep(-0.35, 0.2, sunUp);
        float forward = pow(max(dot(ray, uSun), 0.0), 18.0);
        vec3 blue = vec3(0.28, 0.55, 1.0) * litShell;
        vec3 dawn = vec3(1.0, 0.45, 0.16) * exp(-pow(sunUp * 6.0, 2.0)) * (0.35 + 3.0 * forward);
        vec3 col = (blue * 0.85 + dawn) * dens;
        col *= mix(1.0, 0.35, blocked);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(EARTH.radius * 1.03, 160, 100), air);
  shell.position.set(...EARTH.center); shell.renderOrder = 2; group.add(shell);
  // Sun disc and glow on a camera-facing quad, far behind the Earth so the depth test eclipses it.
  const sunMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 vUv; void main(){ float r = length(vUv); float disc = smoothstep(0.035, 0.028, r);
      float glow = exp(-r * 9.0) * 0.9 + exp(-r * 3.2) * 0.12; float rays = (0.5 + 0.5 * cos(atan(vUv.y, vUv.x) * 6.0)) * exp(-r * 6.0) * 0.18;
      vec3 c = vec3(1.0, 0.97, 0.9) * disc * 6.0 + vec3(1.0, 0.82, 0.6) * (glow + rays);
      gl_FragColor = vec4(c, 1.0); }`,
  });
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sunMat); sun.scale.setScalar(52000); sun.renderOrder = 1; sun.userData.role = 'sun'; group.add(sun);
  // Stars: fixed seeded field on a far sphere, a little colour, brighter ones rare.
  const rng = mulberry(77), n = 3600, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = rng() * 2 - 1, a = rng() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    pos.set([r * Math.cos(a) * 90000, u * 90000, r * Math.sin(a) * 90000], i * 3);
    const m = Math.pow(rng(), 6), warm = rng();
    col.set(warm < 0.2 ? [1, 0.85, 0.7] : warm > 0.85 ? [0.75, 0.85, 1] : [1, 1, 1], i * 3);
    size[i] = 1 + m * 2.6;
    for (let k = 0; k < 3; k++) col[i * 3 + k] *= 0.35 + 0.65 * m + 0.25;
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('color', new THREE.BufferAttribute(col, 3)); sg.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const starMat = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 1 } }, transparent: true, depthWrite: false, vertexColors: true,
    vertexShader: `attribute float size; varying vec3 vC; uniform float uScale; void main(){ vC = color; gl_PointSize = size * uScale; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vC, smoothstep(0.5, 0.15, d)); }` });
  const stars = new THREE.Points(sg, starMat); stars.userData.role = 'stars'; stars.frustumCulled = false; group.add(stars);
  function update(t, sunDir, camera, pixelRatio) {
    uniforms.uSun.value.set(...sunDir); uniforms.uSpin.value = t * 0.004; uniforms.uCam.value.copy(camera.position);
    sun.position.copy(camera.position).addScaledVector(uniforms.uSun.value, 600000 / 10);
    sun.quaternion.copy(camera.quaternion); stars.position.copy(camera.position); starMat.uniforms.uScale.value = pixelRatio;
  }
  return { group, earth, shell, sun, stars, update };
}
