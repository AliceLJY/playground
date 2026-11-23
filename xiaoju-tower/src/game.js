(function () {
  'use strict';
  const X = window.XJT, C = X.CFG;
  const Q = new URLSearchParams(location.search);
  const VIEW = Q.get('view');
  let SEED = +Q.get('seed') || ((Date.now() / 1000) | 0) % 9973 + 1;
  const MODES = ['day', 'dusk', 'night'], MODE_NAME = { day: '白天', dusk: '黄昏', night: '夜晚' };
  const clockMode = X.timeMode(X.gzClock().hour);
  let MODE = MODES.includes(Q.get('time')) ? Q.get('time') : clockMode;
  let following = MODE === clockMode && !Q.get('time');
  const pageStart = performance.now();
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

  // ---------- renderer ----------
  const host = document.getElementById('world');
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.3, 14000);
  scene.fog = new THREE.Fog(0xf6d9a8, 900, 7000);

  const hemi = new THREE.HemisphereLight(0xfff1dc, 0x8a8778, 1.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe2b0, 2.2);
  scene.add(sun); scene.add(sun.target);
  const camFill = new THREE.DirectionalLight(0xfff4e6, 0.9); scene.add(camFill); scene.add(camFill.target);

  // ---------- time of day (driven by highest point reached) ----------
  const KEYS = [
    { p: 0.00, top: 0x9ec6e8, hor: 0xf6d9a8, sun: 0xffe2b0, si: 2.4, hi: 1.05, night: 0, sunEl: 0.42, exp: 1.0 },
    { p: 0.45, top: 0x6f8fc4, hor: 0xf3a36a, sun: 0xffb46e, si: 2.0, hi: 0.85, night: 0, sunEl: 0.16, exp: 1.0 },
    { p: 0.72, top: 0x3c3f78, hor: 0xe0705a, sun: 0xff7a50, si: 1.1, hi: 0.55, night: 0.35, sunEl: 0.02, exp: 1.05 },
    { p: 0.88, top: 0x1d2350, hor: 0x6a4a7a, sun: 0x8a6ab0, si: 0.35, hi: 0.32, night: 0.8, sunEl: -0.06, exp: 1.1 },
    { p: 1.00, top: 0x0c1030, hor: 0x2a2a55, sun: 0x6a7ab8, si: 0.2, hi: 0.25, night: 1, sunEl: -0.12, exp: 1.12 }
  ];
  const cA = new THREE.Color(), cB = new THREE.Color();
  function sky(p) {
    let i = 0; while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i++;
    const a = KEYS[i], b = KEYS[i + 1], t = smooth(clamp((p - a.p) / (b.p - a.p), 0, 1));
    const col = k => cA.setHex(a[k]).lerp(cB.setHex(b[k]), t).clone();
    return { top: col('top'), hor: col('hor'), sun: col('sun'), si: lerp(a.si, b.si, t), hi: lerp(a.hi, b.hi, t), night: lerp(a.night, b.night, t), sunEl: lerp(a.sunEl, b.sunEl, t), exp: lerp(a.exp, b.exp, t) };
  }
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSun: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 0.3, -1) }, uNight: { value: 0 } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }',
    fragmentShader: `uniform vec3 uTop,uHor,uSun,uSunDir; uniform float uNight; varying vec3 vDir;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
      void main(){ float e = clamp(vDir.y, -0.2, 1.0); vec3 c = mix(uHor, uTop, pow(max(e,0.0), 0.55));
        float s = max(dot(normalize(vDir), normalize(uSunDir)), 0.0); c += uSun * (pow(s, 60.0)*1.6 + pow(s, 6.0)*0.35) * (1.0 - uNight*0.8);
        vec3 q = floor(normalize(vDir) * 260.0); float star = step(0.9965, h(q)) * uNight * smoothstep(0.05, 0.4, e); c += vec3(star);
        gl_FragColor = vec4(c, 1.0); }`
  });
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(12000, 32, 16), skyMat);
  skyDome.frustumCulled = false; skyDome.renderOrder = -1;
  scene.add(skyDome);

  // ---------- shared LED shader hook ----------
  const LED = { uTime: { value: 0 }, uNight: { value: 0 }, uShow: { value: 0 }, uOn: { value: 0 }, uChapter: { value: -1 }, uLocal: { value: 0 } };
  function withLED(mat, strength) {
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, LED);
      sh.uniforms.uLedK = { value: strength };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
          vec4 wpp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wpp = instanceMatrix * wpp;
          #endif
          vWP = (modelMatrix * wpp).xyz;`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
          varying vec3 vWP; uniform float uTime, uNight, uShow, uLedK, uOn, uChapter, uLocal;
          vec3 ledPal(float x){ x = fract(x); vec3 a=vec3(1.0,0.35,0.63), b=vec3(1.0,0.70,0.28), c=vec3(0.35,0.82,1.0);
            return x<0.333 ? mix(a,b,x*3.0) : x<0.666 ? mix(b,c,(x-0.333)*3.0) : mix(c,a,(x-0.666)*3.0); }
          float hsh(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
          vec3 pick5(float x, vec3 a, vec3 b, vec3 c, vec3 d, vec3 e){ x = fract(x)*5.0; float f = smoothstep(0.0,1.0,fract(x)); int i = int(floor(x));
            if(i==0) return mix(a,b,f); if(i==1) return mix(b,c,f); if(i==2) return mix(c,d,f); if(i==3) return mix(d,e,f); return mix(e,a,f); }
          // 「湾区新韵」six chapters, colours from the 2025-11-11 Yangcheng Evening News description
          vec3 bay(float ch, float h, float a, float T, float loc){
            vec3 cyan=vec3(0.2,0.75,1.0), rose=vec3(1.0,0.32,0.62), lilac=vec3(0.72,0.55,1.0), blue=vec3(0.22,0.32,1.0), purple=vec3(0.58,0.28,0.95),
                 green=vec3(0.3,0.95,0.5), silver=vec3(0.9,0.92,1.0), deep=vec3(0.32,0.08,0.62), crimson=vec3(0.85,0.07,0.12), gold=vec3(1.0,0.78,0.28);
            if (ch < 0.5) { float w = 0.5+0.5*sin(h*9.0 - T*1.2 + a*6.2832); vec3 c = mix(cyan, rose, w); return mix(c, lilac, pow(1.0-abs(w*2.0-1.0), 6.0)*0.6); }
            if (ch < 1.5) { vec3 base = mix(blue, purple, h); float sp = smoothstep(0.8,1.0, sin(a*25.13 + h*20.0 - T*2.0)*sin(h*30.0 + T*1.3)); return mix(base, rose, sp); }
            if (ch < 2.5) { return pick5(a + h*3.0 - T*0.25, blue, green, rose, purple, silver); }
            if (ch < 3.5) { float d = abs(h - 0.61); float x = d*4.0 - T*0.3; vec3 c = pick5(x, green, purple, rose, green, purple); return c * smoothstep(0.0, 0.08, loc*1.4 - d); }
            if (ch < 4.5) { float cur = smoothstep(1.0 - loc*1.25 - 0.06, 1.0 - loc*1.25, h); float st = pow(max(0.0, sin(h*60.0 + T*6.0 + floor(a*24.0)*1.7)), 40.0); return deep*cur*0.9 + silver*st*cur; }
            float sp = step(0.982, hsh(floor(vWP*0.6) + floor(T*6.0))); return mix(crimson, gold*1.3, sp);
          }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float ang = atan(vWP.z, vWP.x) / 6.2831853 + 0.5;
          float hh01 = clamp(vWP.y / 454.0, 0.0, 1.0);
          float Tt = uTime * (1.0 + uShow * 1.5);
          vec3 led;
          if (uChapter < -0.5) { float band = vWP.y / 70.0 - Tt * 0.08 + ang; led = ledPal(band) * (0.55 + 0.45 * sin(vWP.y * 0.09 - Tt * 1.2)); }
          else led = bay(uChapter, hh01, ang, Tt, uLocal);
          totalEmissiveRadiance += led * uLedK * (uOn * (0.6 + uNight * 0.5) + uShow * 1.0);`);
    };
    return mat;
  }

  // ---------- tower ----------
  const tower = new THREE.Group(); scene.add(tower);
  const towerMat = withLED(new THREE.MeshStandardMaterial({ color: 0xeef1f4, metalness: 0.35, roughness: 0.42 }), 1.0);
  const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 8, 1, false); unitCyl.translate(0, 0.5, 0);
  const beams = [];
  const P = (c, k) => { const p = X.colPoint(c, k / C.rings); return V3(p.x, p.y, p.z); };
  for (let c = 0; c < C.cols; c++) for (let k = 0; k < C.rings; k++) beams.push([P(c, k), P(c, k + 1), 0.62]);
  for (let k = 0; k <= C.rings; k++) for (let c = 0; c < C.cols; c++) beams.push([P(c, k), P(c + 1, k), k % 2 ? 0.26 : 0.34]);
  for (let c = 0; c < C.cols; c++) for (let k = 0; k < C.rings; k++) beams.push([P(c, k), P(c + 1, k + 1), 0.13]);
  const beamMesh = new THREE.InstancedMesh(unitCyl, towerMat, beams.length);
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), up = V3(0, 1, 0), tmpV = new THREE.Vector3();
  beams.forEach(([a, b, r], i) => {
    tmpV.subVectors(b, a); const len = tmpV.length();
    q4.setFromUnitVectors(up, tmpV.normalize());
    m4.compose(a, q4, V3(r, len, r)); beamMesh.setMatrixAt(i, m4);
  });
  tower.add(beamMesh);

  // concrete core
  const coreGeo = new THREE.CylinderGeometry(1, 1, C.height + 6, 40, 1, true); coreGeo.translate(0, C.height / 2, 0);
  const coreTex = (() => {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256; const g = cv.getContext('2d');
    g.fillStyle = '#9aa0a8'; g.fillRect(0, 0, 64, 256);
    for (let y = 0; y < 256; y += 8) { g.fillStyle = '#7c838c'; g.fillRect(0, y, 64, 1); }
    return new THREE.CanvasTexture(cv);
  })();
  coreTex.wrapS = coreTex.wrapT = THREE.RepeatWrapping; coreTex.repeat.set(6, 30); coreTex.colorSpace = THREE.SRGBColorSpace;
  const core = new THREE.Mesh(coreGeo, withLED(new THREE.MeshStandardMaterial({ map: coreTex, roughness: 0.9, metalness: 0.05 }), 0.25));
  core.scale.set(7, 1, 5.5); tower.add(core);

  // platforms (base + checkpoints + top) follow the tower cross-section
  function sectionShape(t, grow) {
    const s = new THREE.Shape();
    for (let i = 0; i <= 72; i++) {
      const cc = (i / 72) * C.cols, c0 = Math.floor(cc) % C.cols, f = cc - Math.floor(cc);
      const a = X.colPoint(c0, t), b = X.colPoint(c0 + 1, t);
      let x = lerp(a.x, b.x, f), z = lerp(a.z, b.z, f); const r = Math.hypot(x, z); x *= (r + grow) / r; z *= (r + grow) / r;
      if (i) s.lineTo(x, -z); else s.moveTo(x, -z);
    }
    return s;
  }
  const platMat = withLED(new THREE.MeshStandardMaterial({ color: 0xd9dde3, roughness: 0.6, metalness: 0.2 }), 0.6);
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x9ad0ff, roughness: 0.1, metalness: 0.6, transparent: true, opacity: 0.35, emissive: 0xffd9a0, emissiveIntensity: 0 });
  const platforms = [];
  [...C.checkpoints, C.rings].forEach(k => {
    const t = k / C.rings, yy = X.ringY(k);
    const slab = new THREE.Mesh(new THREE.ExtrudeGeometry(sectionShape(t, -2.2), { depth: 1.6, bevelEnabled: false }), platMat);
    slab.rotation.x = -Math.PI / 2; slab.position.y = yy - 1.7; tower.add(slab);
    const glass = new THREE.Mesh(new THREE.ExtrudeGeometry(sectionShape(t, -3.2), { depth: k === C.rings ? 5 : 3.4, bevelEnabled: false }), glassMat);
    glass.rotation.x = -Math.PI / 2; glass.position.y = yy - 0.1; tower.add(glass);
    platforms.push({ k, slab, glass });
  });
  // antenna mast
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 6.5, 146, 16), withLED(new THREE.MeshStandardMaterial({ color: 0xf2f3f5, metalness: 0.4, roughness: 0.4 }), 1.2));
  mast.position.y = C.height + 73; tower.add(mast);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff3030 }));
  beacon.position.y = C.height + 147; tower.add(beacon);
  // bubble tram ring on top
  const tramRing = new THREE.Group(); tramRing.position.y = C.height + 1.5; tower.add(tramRing);
  const capMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.85, emissive: 0xffb347, emissiveIntensity: 0 });
  const caps = new THREE.InstancedMesh(new THREE.SphereGeometry(1.5, 14, 10), capMat, 16);
  // the track tilts: one side of the ring sits near 450 m, the other near 460 m (same curve as X.finalePose('tram'))
  const tramY = a => { const T = X.FINALE.tram; return lerp(T.y0, T.y1, 0.5 - 0.5 * Math.cos(a - Math.PI * 0.5)) - (C.height + 1.5); };
  const TRAM_R = Math.hypot(X.colPoint(0, 1).x, X.colPoint(0, 1).z) + 2.5;
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; m4.compose(V3(Math.cos(a) * TRAM_R, tramY(a), Math.sin(a) * TRAM_R * 0.78), q4.identity(), V3(1, 0.85, 1)); caps.setMatrixAt(i, m4); }
  tramRing.add(caps);

  // ---------- ground, river, city ----------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000), new THREE.MeshStandardMaterial({ color: 0x5d6a58, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.2; scene.add(ground);
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(120, 48), new THREE.MeshStandardMaterial({ color: 0xc9c2b4, roughness: 0.9 }));
  plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0; scene.add(plaza);
  const CITY = window.XJT_CITY || { b: [], w: [] };
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x3d5f78, roughness: 0.15, metalness: 0.6 });
  CITY.w.forEach(flat => {
    if (flat.length < 6) return;
    const s = new THREE.Shape(); for (let i = 0; i < flat.length; i += 2) (i ? s.lineTo : s.moveTo).call(s, flat[i], -flat[i + 1]);
    const m = new THREE.Mesh(new THREE.ShapeGeometry(s), waterMat); m.rotation.x = -Math.PI / 2; m.position.y = 0.05; scene.add(m);
  });
  // buildings: one merged geometry; walls carry (u,v) metres for procedural windows
  const cityMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.1 });
  cityMat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, LED);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aWin; varying vec3 vWin;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWin = aWin;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vWin; uniform float uNight; float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        diffuseColor.rgb *= mix(1.0, 0.32, uNight);
        if (vWin.z > 0.5) { vec2 cell = floor(vWin.xy / vec2(3.2, 3.4)); vec2 f = fract(vWin.xy / vec2(3.2, 3.4));
          float win = step(0.18, f.x) * step(f.x, 0.82) * step(0.25, f.y) * step(f.y, 0.8);
          float on = step(0.55, hh(cell + vWin.z * 13.0));
          float aa = clamp(1.0 - max(fwidth(vWin.x / 3.2), fwidth(vWin.y / 3.4)) * 1.5, 0.0, 1.0);
          float glow = mix(0.18, win * on, aa);
          diffuseColor.rgb *= 1.0 - win * 0.25 * aa;
          totalEmissiveRadiance += vec3(1.0, 0.76, 0.45) * glow * uNight * 1.1; }`);
  };
  // OSM has the two supertall towers only as a podium / a point: raise them at their OSM spot with their public heights
  const LANDMARKS = CITY.l || [];
  LANDMARKS.forEach(l => {
    if (l.h < 100) return;
    const n = l.label === '西塔' ? 12 : 8, r = l.label === '西塔' ? 32 : 36, rec = [l.h];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + (n === 8 ? Math.PI / 8 : 0); rec.push(l.x + Math.cos(a) * r, l.z - Math.sin(a) * r); }
    CITY.b.push(rec);
  });
  (function buildCity() {
    const pos = [], nor = [], col = [], win = [];
    const pal = [0xd8d2c6, 0xc9cdd2, 0xb8bec6, 0xe2dccf, 0xa9b2bb, 0xcfc4b0];
    const cc = new THREE.Color();
    CITY.b.forEach((rec, bi) => {
      const h = rec[0], n = (rec.length - 1) / 2; if (n < 3) return;
      const pts = []; for (let i = 0; i < n; i++) pts.push(new THREE.Vector2(rec[1 + i * 2], rec[2 + i * 2]));
      cc.setHex(pal[bi % pal.length]); if (h > 120) cc.lerp(new THREE.Color(0x8fb2cc), 0.45);
      const seed = (bi % 97) / 97 + 1;
      let u = 0;
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n], len = a.distanceTo(b);
        const nx = (b.y - a.y) / (len || 1), nz = -(b.x - a.x) / (len || 1);
        const quad = [[a.x, 0, a.y, u, 0], [b.x, 0, b.y, u + len, 0], [b.x, h, b.y, u + len, h], [a.x, 0, a.y, u, 0], [b.x, h, b.y, u + len, h], [a.x, h, a.y, u, h]];
        // CCW in x,z with +z south: outward normal is (dz, -dx) rotated → use computed and flip if needed
        quad.forEach(q => { pos.push(q[0], q[1], q[2]); nor.push(-nx, 0, -nz); col.push(cc.r, cc.g, cc.b); win.push(q[3], q[4], seed); });
        u += len;
      }
      const tris = THREE.ShapeUtils.triangulateShape(pts, []);
      tris.forEach(t => t.forEach(ix => { pos.push(pts[ix].x, h, pts[ix].y); nor.push(0, 1, 0); col.push(cc.r * 0.92, cc.g * 0.92, cc.b * 0.92); win.push(0, 0, 0); }));
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aWin', new THREE.Float32BufferAttribute(win, 3));
    const city = new THREE.Mesh(g, cityMat); city.material.side = THREE.DoubleSide; scene.add(city);
    window.__cityTris = pos.length / 9;
  })();

  // ---------- the cat: three keyed sprite frames from the model sheet (assets/cat-*.webp) ----------
  const cat = new THREE.Group(); scene.add(cat);
  const loader = new THREE.TextureLoader();
  const catTex = {};
  const SH = ['climbA', 'pullA', 'climbB', 'pullB', 'brace', 'rest', 'cheer', 'hit'].map(n => 'sanhua-' + n);
  ['climbA', 'pullA', 'climbB', 'pullB', 'brace', 'rest', 'runA', 'runB', 'runC', 'runD', ...SH].forEach(n => { const t = loader.load('assets/cat-' + n + '.webp'); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; catTex[n] = t; });
  const catMat = new THREE.MeshStandardMaterial({ map: catTex.climbA, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.85, metalness: 0 });
  const CAT_H = 3.0;
  const catSprite = new THREE.Mesh(new THREE.PlaneGeometry(CAT_H / 2, CAT_H), catMat);
  cat.add(catSprite);
  // 三花姐: her own frames, half a head taller than 小橘
  const rival = new THREE.Group(); scene.add(rival); rival.visible = false;
  const rivalMat = new THREE.MeshStandardMaterial({ map: catTex['sanhua-climbA'], transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.85, metalness: 0 });
  const RIVAL_H = 3.5;
  const rivalSprite = new THREE.Mesh(new THREE.PlaneGeometry(RIVAL_H / 2, RIVAL_H), rivalMat);
  rival.add(rivalSprite);

  // ---------- 蜘蛛侠栈道: open-air spiral stair round the core, 168 → 335 m ----------
  const ST = C.stairs, STAIR_Y0 = X.ringY(ST.fromK), STAIR_Y1 = X.ringY(ST.toK), STAIR_PITCH = 14, STAIR_R = 2.6;
  function stairPoint(yy) {   // a point on the walking line, with the outward direction
    const a = ((yy - STAIR_Y0) / STAIR_PITCH) * Math.PI * 2 - Math.PI / 2;
    const p = V3(Math.cos(a) * (7 + STAIR_R), yy, Math.sin(a) * (5.5 + STAIR_R));
    return { p, out: V3(p.x, 0, p.z).normalize(), a };
  }
  const stairMat = new THREE.MeshStandardMaterial({ color: 0xb9bec6, metalness: 0.5, roughness: 0.5, emissive: 0xffb347, emissiveIntensity: 0 });
  const nSteps = Math.round((STAIR_Y1 - STAIR_Y0) / 0.32);
  const steps = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 0.12, 0.7), stairMat, nSteps);
  for (let i = 0; i < nSteps; i++) {
    const sp = stairPoint(STAIR_Y0 + i * 0.32), tang = Math.atan2(sp.out.x, sp.out.z);
    m4.compose(sp.p.clone().add(V3(0, -0.06, 0)), q4.setFromAxisAngle(up, tang), V3(1, 1, 1)); steps.setMatrixAt(i, m4);
  }
  tower.add(steps);
  const railPts = []; for (let yy = STAIR_Y0; yy <= STAIR_Y1; yy += 0.5) { const sp = stairPoint(yy); railPts.push(sp.p.clone().addScaledVector(sp.out, 1.25).add(V3(0, 1.1, 0))); }
  const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts), railPts.length * 2, 0.06, 5, false), stairMat); tower.add(rail);

  // ---------- after the top: ride cabin, drop-ride seat ring, 488 m deck ----------
  const mastR = yy => 6.5 + (0.8 - 6.5) * (yy - C.height) / 146;
  const deckY = X.FINALE.deckY;
  const DECK_OUT = mastR(deckY) + 6;
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(DECK_OUT, DECK_OUT - 0.6, 0.5, 48), new THREE.MeshStandardMaterial({ color: 0xcfd3d9, roughness: 0.7, metalness: 0.2 }));
  deck.position.y = deckY - 0.25; tower.add(deck);
  const deckRail = new THREE.Mesh(new THREE.CylinderGeometry(DECK_OUT - 0.1, DECK_OUT - 0.1, 1.2, 48, 1, true), new THREE.MeshStandardMaterial({ color: 0x9ad0ff, roughness: 0.1, metalness: 0.4, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
  deckRail.position.y = deckY + 0.6; tower.add(deckRail);
  const deckTop = new THREE.Mesh(new THREE.TorusGeometry(DECK_OUT - 0.1, 0.06, 6, 64), new THREE.MeshStandardMaterial({ color: 0xe8ebef, metalness: 0.6, roughness: 0.3 }));
  deckTop.rotation.x = Math.PI / 2; deckTop.position.y = deckY + 1.2; tower.add(deckTop);
  // the ride cabin she sits in on the tram
  const cabin = new THREE.Mesh(new THREE.SphereGeometry(1.5, 18, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.3, depthWrite: false, emissive: 0xffb347, emissiveIntensity: 0.15 }));
  cabin.scale.set(1.25, 1.1, 1.25); cabin.visible = false; scene.add(cabin);
  // 极速云霄: a ring of seats that climbs the antenna and drops (one instanced mesh, re-placed every frame)
  const SEATS = 20;
  const seatRing = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.35, 0.9), new THREE.MeshStandardMaterial({ color: 0xff6a3d, roughness: 0.5, metalness: 0.3, emissive: 0xff6a3d, emissiveIntensity: 0.25 }), SEATS);
  seatRing.visible = false; seatRing.frustumCulled = false; scene.add(seatRing);
  function placeSeats(yy) {
    const r = mastR(yy) + 0.6;
    for (let i = 0; i < SEATS; i++) { const a = (i / SEATS) * Math.PI * 2; m4.compose(V3(Math.cos(a) * r, yy, Math.sin(a) * r), q4.setFromAxisAngle(up, -a), V3(1, 1, 1)); seatRing.setMatrixAt(i, m4); }
    seatRing.instanceMatrix.needsUpdate = true;
  }

  // ---------- pigeons (instanced) ----------
  const pigeonBody = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshStandardMaterial({ color: 0x8b93a1, roughness: 0.8 }), 240);
  const pigeonWing = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.03, 0.16), new THREE.MeshStandardMaterial({ color: 0x6d7482, roughness: 0.8 }), 480);
  const pigeonHead = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshStandardMaterial({ color: 0x55707a, roughness: 0.7 }), 240);
  [pigeonBody, pigeonWing, pigeonHead].forEach(m => { m.frustumCulled = false; scene.add(m); });
  let flyers = [];

  // ---------- black kite (黑鸢): big dark-brown raptor with a forked tail, exaggerated for readability ----------
  const kBrown = new THREE.MeshStandardMaterial({ color: 0x4a3426, roughness: 0.85 }), kLight = new THREE.MeshStandardMaterial({ color: 0x8a6a4c, roughness: 0.8 }), kGold = new THREE.MeshStandardMaterial({ color: 0xe2b23a });
  function makeKiteModel() {
    const kite = new THREE.Group(); scene.add(kite);
    const kBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.4, 6, 12), kBrown); kBody.rotation.x = Math.PI / 2; kite.add(kBody);
    const kHead = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), kLight); kHead.position.z = 1.05; kite.add(kHead);
    const kBeak = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 8), kGold); kBeak.rotation.x = Math.PI / 2; kBeak.position.set(0, -0.06, 1.38); kite.add(kBeak);
    const wings = [-1, 1].map(sx => {
      const root = new THREE.Group(); root.position.x = 0.3 * sx; kite.add(root);
      const inner = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 1.1), kBrown); inner.position.x = 1.2 * sx; root.add(inner);
      const tip = new THREE.Group(); tip.position.x = 2.4 * sx; root.add(tip);
      const outer = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.06, 0.8), kLight); outer.position.x = 1.0 * sx; tip.add(outer);
      return { root, tip, sx };
    });
    [-1, 1].forEach(sx => { const t = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 1.2), kBrown); t.position.set(0.18 * sx, 0, -1.4); t.rotation.y = 0.28 * sx; kite.add(t); });
    return { group: kite, wings, pos: new THREE.Vector3(0, 200, 60), away: null };
  }
  const KM = makeKiteModel(), KR = makeKiteModel();   // KR dives at 三花姐
  const kite = KM.group, kWings = KM.wings;
  const laneMat = new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0, depthWrite: false });
  const lane = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1, 10, 1, true), laneMat); lane.renderOrder = 2; scene.add(lane);
  function updateRivalKite(dt) {
    const g = KR.group, kp = race && R ? X.kitePhase(R) : { phase: 'calm' }, tm = LED.uTime.value;
    if (kp.phase === 'warn' && kp.k.status === 'locked') {
      const tgt = colFrame(kp.k.target, R.t), strikePt = tgt.p.clone().addScaledVector(tgt.out, 1.2).add(V3(0, 0.6, 0));
      const side = new THREE.Vector3().crossVectors(tgt.dir, tgt.out).normalize();
      const hover = tgt.p.clone().addScaledVector(tgt.out, 6).addScaledVector(side, -2.4).add(V3(0, 5 + Math.sin(tm * 3) * 0.5, 0));
      const d = clamp((kp.p - 0.8) / 0.2, 0, 1);
      KR.pos.lerp(d > 0 ? hover.clone().lerp(strikePt, d * d) : hover, d > 0 ? 1 : 1 - Math.pow(0.02, dt));
      g.position.copy(KR.pos); g.lookAt(strikePt); g.visible = true;
      KR.wings.forEach(w => { const f = Math.sin(tm * 6 * (d > 0 ? 0.15 : 2.2)) * 0.45; w.root.rotation.z = w.sx * f; w.tip.rotation.z = w.sx * f * 0.6; });
      if (kp.k.status === 'locked') KR.away = { dir: tgt.out.clone().add(V3(0, 0.4, 0)).normalize() };
    } else if (KR.away && KR.away.dir) {
      KR.away.t = (KR.away.t || 0) + dt; KR.pos.addScaledVector(KR.away.dir, dt * 22); g.position.copy(KR.pos); g.lookAt(KR.pos.clone().add(KR.away.dir));
      KR.wings.forEach(w => { const f = Math.sin(tm * 15) * 0.45; w.root.rotation.z = w.sx * f; w.tip.rotation.z = w.sx * f * 0.6; });
      if (KR.away.t > 2.5) KR.away = null;
    } else g.visible = false;
  }
  let kiteAway = null;   // {from, dir, t}
  const kitePos = KM.pos;
  function updateKite(dt) {
    const kp = X.kitePhase(S), tm = LED.uTime.value, yy = X.y(S);
    let want, look = null, flap = 1;
    if (kp.phase === 'warn' && kp.k.status === 'locked') {
      const tgt = colFrame(kp.k.target, S.t), strikePt = tgt.p.clone().addScaledVector(tgt.out, 1.2).add(V3(0, 0.6, 0));
      const side = new THREE.Vector3().crossVectors(tgt.dir, tgt.out).normalize();   // screen-right as seen by the camera
      const hover = tgt.p.clone().addScaledVector(tgt.out, 6.5).addScaledVector(side, 2.4).add(V3(0, 5 + Math.sin(tm * 3) * 0.5, 0));
      const d = clamp((kp.p - 0.8) / 0.2, 0, 1);
      want = d > 0 ? hover.clone().lerp(strikePt, d * d) : hover; look = strikePt; flap = d > 0 ? 0.15 : 2.2;
      kitePos.lerp(want, d > 0 ? 1 : 1 - Math.pow(0.02, dt));
      // the locked column glows red above and below the cat
      const a = colFrame(kp.k.target, clamp(S.t - 7 / C.height, 0, 1)).p, b = colFrame(kp.k.target, clamp(S.t + 9 / C.height, 0, 1)).p;
      const dir = b.clone().sub(a); lane.position.copy(a).addScaledVector(dir, 0.5); lane.scale.set(1, dir.length(), 1); lane.quaternion.setFromUnitVectors(up, dir.normalize());
      laneMat.opacity = 0.18 + 0.22 * Math.abs(Math.sin(tm * 9));
    } else {
      laneMat.opacity = Math.max(0, laneMat.opacity - dt * 3);
      if (kiteAway) {
        kiteAway.t += dt; kitePos.copy(kiteAway.from).addScaledVector(kiteAway.dir, kiteAway.t * 22).add(V3(0, kiteAway.t * kiteAway.t * 6, 0)); look = kitePos.clone().add(kiteAway.dir); flap = 2.5;
        if (kiteAway.t > 2.5) kiteAway = null;
      } else {
        const r = Math.hypot(X.colPoint(0, S.t).x, X.colPoint(0, S.t).z) + 38, a = tm * 0.3;
        want = V3(Math.cos(a) * r, yy + 48, Math.sin(a) * r); look = V3(Math.cos(a + 0.2) * r, yy + 48, Math.sin(a + 0.2) * r); flap = 0.5;
        kitePos.lerp(want, 1 - Math.pow(0.3, dt));
      }
    }
    kite.position.copy(kitePos); if (look) kite.lookAt(look);
    kite.visible = !finale && S.mode !== 'stairs' && (yy > X.CFG.kite.minY - 30 || kiteAway !== null);
    kWings.forEach(w => { const f = Math.sin(tm * 6 * flap) * 0.45 * Math.min(1, flap); w.root.rotation.z = w.sx * f; w.tip.rotation.z = w.sx * f * 0.6; });
  }

  // ---------- wind streaks ----------
  const windN = 140, windGeo = new THREE.BufferGeometry(), windPos = new Float32Array(windN * 6);
  windGeo.setAttribute('position', new THREE.BufferAttribute(windPos, 3));
  const windLines = new THREE.LineSegments(windGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
  windLines.frustumCulled = false; scene.add(windLines);
  const windSeeds = Array.from({ length: windN }, () => [Math.random(), Math.random(), Math.random()]);

  // ---------- state & input ----------
  let S = X.createState(SEED);
  let race = Q.get('race') !== '0', R = null, rivalPilot = null, rivalNoted = {};
  function makeRival() { R = race ? X.createRival(S) : null; rivalPilot = race ? X.makePilot('rival', SEED + C.rival.seedOffset, { snack: 'xiajiao' }) : null; rivalNoted = {}; }
  makeRival();
  let playing = false, ended = false, showT = 0, dayP = 0, camYaw = 0, camYawTarget = 0, shake = 0;
  let finale = null, postcard = null, wantPostcard = false, pendingPick = null, choiceDismissed = null;
  const input = { up: false, down: false, left: false, right: false, brace: false, act: false };
  const keyMap = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'brace' };
  const pickKeys = { KeyE: 1, KeyQ: 2 };
  const padKeys = {}; document.querySelectorAll('#pad .key').forEach(b => { padKeys[b.dataset.act] = b; });
  const held = { key: {}, ptr: {} };
  function refreshInput() { for (const k of Object.keys(input)) { input[k] = !!(held.key[k] || held.ptr[k]); padKeys[k] && padKeys[k].classList.toggle('on', input[k]); } }
  addEventListener('keydown', e => { if (pickKeys[e.code] && playing && !e.repeat && choiceOn) { e.preventDefault(); pick(pickKeys[e.code]); return; } const a = keyMap[e.code]; if (!a) return; e.preventDefault(); if (!playing && !ended && (a === 'up' || a === 'brace') && !introEl.hidden) { start(); } held.key[a] = true; refreshInput(); });
  addEventListener('keyup', e => { const a = keyMap[e.code]; if (!a) return; held.key[a] = false; refreshInput(); });
  addEventListener('blur', () => { held.key = {}; held.ptr = {}; refreshInput(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { held.key = {}; held.ptr = {}; refreshInput(); } });
  Object.entries(padKeys).forEach(([act, b]) => {
    const on = e => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (_) {} held.ptr[act] = true; refreshInput(); };
    const off = () => { held.ptr[act] = false; refreshInput(); };
    b.addEventListener('pointerdown', on); ['pointerup', 'pointercancel', 'lostpointercapture', 'pointerleave'].forEach(ev => b.addEventListener(ev, off));
    b.addEventListener('contextmenu', e => e.preventDefault());
  });
  // drag the view sideways
  let drag = null;
  host.addEventListener('pointerdown', e => { drag = { x: e.clientX, yaw: camYawTarget }; });
  addEventListener('pointermove', e => { if (drag) camYawTarget = clamp(drag.yaw - (e.clientX - drag.x) * 0.006, -1.1, 1.1); });
  addEventListener('pointerup', () => { drag = null; });

  // ---------- UI ----------
  const $ = id => document.getElementById(id);
  const kiteEl = $('kite-bar');
  const introEl = $('intro'), endEl = $('ending'), hudEl = $('hud'), padEl = $('pad'), hintEl = $('hint'), gustEl = $('gust-bar'), flashEl = $('flash');
  const staminaEl = document.querySelector('.stamina'), staminaLabel = document.querySelector('.stamina span');
  const fmt = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const raceEl = $('h-race'), choiceEl = $('choice'), pcEl = $('postcard');
  const hints = { climb: '按住 <b>↑</b> 往上爬', rest: '停在横梁上不动，体力会慢慢回来', shift: '鸽子挡路？停在横梁上按 <b>← →</b> 换一根柱子', gust: '起风了！按住 <b>抓紧</b>，扛过去再松开', waist: '过了塔腰，柱子往外倒，更费体力，多歇', low: '体力不够了？松开 <b>↑</b>，小橘会抓住最近的横梁歇着', kite: '黑鸢盯上你了！在横梁上按 <b>←</b> 或 <b>→</b> 换一根柱子躲开（在柱子中间就先松手抓横梁）' };
  const hintDone = {}; let hintNow = null, hintSince = 0;
  function showHint(id) { if (hintDone[id] || hintNow === id) return; hintNow = id; hintSince = S.time; hintEl.innerHTML = hints[id]; hintEl.hidden = false; }
  function clearHint(id) { hintDone[id] = true; if (hintNow === id) { hintNow = null; hintEl.hidden = true; } }
  let bestKey = 'xjt-best';
  function start() {
    playing = true; ended = false; introEl.hidden = true; endEl.hidden = true; pcEl.hidden = true; hudEl.hidden = false; padEl.hidden = false;
    raceEl.hidden = !race;
    showHint('climb');
  }
  function reset(seed) {
    if (seed) SEED = seed; S = X.createState(SEED); makeRival(); dayP = X.skyProgress(MODE, 0); showT = 0; ended = false; flyers = [];
    finale = null; postcard = null; wantPostcard = false; pendingPick = null; choiceDismissed = null; setChoice(null);
    seatRing.visible = false; cabin.visible = false; cat.scale.setScalar(1); camInit = false; KR.away = null;
    Object.keys(hintDone).forEach(k => delete hintDone[k]); hintNow = null; hintEl.hidden = true;
  }
  // 自己爬 / 跟三花姐比
  function setRace(on) {
    race = on; $('vs-race').setAttribute('aria-pressed', on); $('vs-solo').setAttribute('aria-pressed', !on);
    document.querySelector('.race-rule').hidden = !on; makeRival();
  }
  $('vs-race').addEventListener('click', () => setRace(true)); $('vs-solo').addEventListener('click', () => setRace(false));
  setRace(race);
  // contextual choice: the stair at 168 m, a snack at 423 m
  let choiceOn = null;
  const CHOICES = {
    fork: { q: '蜘蛛侠栈道入口 · 168 米。<br>走栈道：慢，但风和黑鸢都碰不到你。爬外面：快，但险。', a: '走栈道', b: '爬外面', bk: '↑' },
    snack: { q: '旋转餐厅 · 423 米。吃份点心，体力上限 +30，撑最后那段仰角？<br><small>吃要 2.5 秒；不吃就按 ↑ 接着爬。</small>', a: '双皮奶', b: '虾饺', bk: 'Q' }
  };
  function setChoice(kind) {
    if (choiceOn === kind) return; choiceOn = kind; choiceEl.hidden = !kind;
    if (!kind) return;
    const c = CHOICES[kind]; choiceEl.querySelector('.q').innerHTML = c.q;
    const [a, b] = choiceEl.querySelectorAll('.opt'); a.querySelector('b').textContent = c.a; b.querySelector('b').textContent = c.b; b.querySelector('kbd').textContent = c.bk;
    if (hintNow && hintNow !== 'note') { hintNow = null; hintEl.hidden = true; }
  }
  function pick(n) {
    if (choiceOn === 'fork') { if (n === 1) pendingPick = 'stairs'; else { choiceDismissed = 'fork'; setChoice(null); } }
    else if (choiceOn === 'snack') pendingPick = n === 1 ? 'shuangpinai' : 'xiajiao';
  }
  choiceEl.querySelectorAll('.opt').forEach(b => b.addEventListener('click', () => pick(+b.dataset.pick)));
  function updateChoice() {
    let want = null;
    if (playing && X.atFork(S)) want = choiceDismissed === 'fork' ? null : 'fork';
    else if (playing && X.canEat(S)) want = 'snack';
    if (!X.atFork(S) && choiceDismissed === 'fork' && X.atNode(S) !== C.stairs.fromK) choiceDismissed = null;
    setChoice(want);
  }
  const modeBtn = $('mode');
  function showMode() { modeBtn.innerHTML = `${MODE_NAME[MODE]}模式 <small>${following ? '跟广州时间' : '点一下换'}</small>`; }
  modeBtn.addEventListener('click', () => { MODE = MODES[(MODES.indexOf(MODE) + 1) % 3]; following = MODE === clockMode; dayP = X.skyProgress(MODE, S.maxY / C.height); showMode(); });
  showMode();
  $('start').addEventListener('click', start);
  $('again').addEventListener('click', () => { reset(SEED + 1); start(); });
  $('again2').addEventListener('click', () => { reset(SEED + 1); start(); });
  $('ride-tram').addEventListener('click', () => startRide('tram'));
  $('ride-drop').addEventListener('click', () => startRide('drop'));

  // ---------- per-frame ----------
  const catPos = new THREE.Vector3(), catOut = new THREE.Vector3(), catUp = new THREE.Vector3(), camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  let camInit = false, climbPhase = 0, lastY = 0;
  function colFrame(c, t) {
    const p = X.colPoint(c, t), o = X.outward(c, t), e = X.colEnds(((c % C.cols) + C.cols) % C.cols);
    const dir = V3(e.p1.x - e.p0.x, e.p1.y - e.p0.y, e.p1.z - e.p0.z).normalize();
    return { p: V3(p.x, p.y, p.z), out: V3(o.x, 0, o.z), dir };
  }
  let frameName = 'climbA';
  const MOVE = 1.4;   // metres gained per hand-over-hand move
  // body pauses while the hand reaches, then pulls up: displayed progress inside one move
  const pullEase = u => u < 0.42 ? 0.06 * u / 0.42 : 0.06 + 0.94 * smooth((u - 0.42) / 0.58);
  function placeCat(dt) {
    if (finale) return placeFinale();
    if (S.mode === 'stairs' || (S.mode === 'eat')) {
      if (S.mode === 'stairs') {
        const sp = stairPoint(S.stairY), tang = V3(-Math.sin(sp.a) * (5.5 + STAIR_R), 0, Math.cos(sp.a) * (7 + STAIR_R)).normalize();
        catOut.copy(sp.out); catUp.set(0, 1, 0);
        catPos.copy(sp.p).add(V3(0, 1.45, 0));
        const right = new THREE.Vector3().crossVectors(catUp, catOut).normalize();
        cat.position.copy(catPos); cat.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, catUp, catOut));
        // going up the spiral she moves to the screen-LEFT (tangent · screen-right < 0), and the run frames face left
        const moving = S.climbing || (S.mode === 'stairs' && input.down), ph = Math.floor(S.stairY / 0.1);
        frameName = moving ? 'run' + 'ABCD'[ph % 4] : 'rest';
        catSprite.position.set(0, moving && ph % 2 ? 0.08 : 0, 0); catSprite.rotation.z = moving ? 0.06 : 0;
        void tang;
      } else frameName = 'rest';
      setFrame(catMat, catSprite, frameName, frameName.startsWith('run') ? 0.86 : 1);
      return;
    }
    let f;
    if (S.mode === 'shift' && S.anim) {
      const a = S.anim, k = Math.round(S.t * C.rings), t = k / C.rings, A = colFrame(a.from, t), B = colFrame(a.to, t), u = smooth(a.p);
      f = { p: A.p.clone().lerp(B.p, u), out: A.out.clone().lerp(B.out, u).normalize(), dir: A.dir.clone().lerp(B.dir, u).normalize() };
    } else f = colFrame(S.col, S.t);
    catOut.copy(f.out); catUp.copy(f.dir);
    catPos.copy(f.p).addScaledVector(f.out, 1.0);
    const right = new THREE.Vector3().crossVectors(catUp, catOut).normalize();
    const out2 = new THREE.Vector3().crossVectors(right, catUp).normalize();
    const mv = climbPhase / MOVE, u = mv - Math.floor(mv);
    const lagOff = S.mode === 'climb' ? (pullEase(u) - u) * MOVE : 0;
    cat.position.copy(catPos).addScaledVector(catUp, 0.15 + lagOff);
    cat.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, catUp, out2));
    const yNow = X.y(S); if (S.mode === 'climb' && Math.abs(yNow - lastY) < 1) climbPhase += Math.abs(yNow - lastY); lastY = yNow;
    const tm = S.time, braced = S.braced, falling = S.mode === 'fall';
    const resting = !input.up && !input.down && !falling && !braced && S.mode === 'climb' && X.atNode(S) >= 0;
    let roll = 0, bob = 0, jitter = 0;
    if (braced) { frameName = 'brace'; jitter = 0.03; }
    else if (falling) { frameName = 'pullA'; roll = Math.sin(tm * 16) * 0.35; }
    else if (resting && S.stamina > 25) { frameName = 'rest'; bob = Math.sin(tm * 2) * 0.03; }
    else { const side = Math.floor(mv) % 2 ? 'B' : 'A'; frameName = (u < 0.42 ? 'climb' : 'pull') + side; bob = 0; }
    if (S.mode === 'shift' && S.anim) roll = Math.sin(smooth(S.anim.p) * Math.PI) * 0.22 * -S.anim.dir;
    const gp = X.gustPhase(S); if (gp.phase === 'gust' && gp.g) roll += Math.sin(tm * 9) * 0.05 + 0.06 * gp.g.dir;
    setFrame(catMat, catSprite, frameName, frameName === 'climbB' ? 0.92 : 1);   // climbB was drawn on its own and comes out a little larger
    catSprite.position.set((Math.random() - 0.5) * jitter, bob, 0);
    catSprite.rotation.z = roll;
  }
  function setFrame(mat, sprite, name, sizeFix) {
    if (mat.map !== catTex[name]) { mat.map = catTex[name]; mat.needsUpdate = true; }
    const im = catTex[name].image; if (im && im.width) sprite.scale.x = (im.width / im.height) * 2 * sizeFix;   // frames differ in aspect
    sprite.scale.y = sizeFix;
  }
  // 三花姐 on her own column, same hand-over-hand rhythm
  let rivalPhase = 0, rivalLastY = 0;
  function placeRival() {
    rival.visible = !!(race && R) && !finale;
    if (!rival.visible) return;
    let f;
    if (R.mode === 'shift' && R.anim) {
      const a = R.anim, t = Math.round(R.t * C.rings) / C.rings, A = colFrame(a.from, t), B = colFrame(a.to, t), u = smooth(a.p);
      f = { p: A.p.clone().lerp(B.p, u), out: A.out.clone().lerp(B.out, u).normalize(), dir: A.dir.clone().lerp(B.dir, u).normalize() };
    } else f = colFrame(R.col, Math.min(R.t, 1));
    const right = new THREE.Vector3().crossVectors(f.dir, f.out).normalize(), out2 = new THREE.Vector3().crossVectors(right, f.dir).normalize();
    const yNow = X.y(R); if (R.mode === 'climb' && Math.abs(yNow - rivalLastY) < 1) rivalPhase += Math.abs(yNow - rivalLastY); rivalLastY = yNow;
    const mv = rivalPhase / MOVE, u = mv - Math.floor(mv);
    const lagOff = R.mode === 'climb' && R.climbing ? (pullEase(u) - u) * MOVE : 0;
    rival.position.copy(f.p).addScaledVector(f.out, 1.0).addScaledVector(f.dir, 0.3 + lagOff);
    rival.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, f.dir, out2));
    let name, roll = 0;
    if (R.done) name = 'cheer';
    else if (R.mode === 'fall') { name = 'hit'; roll = Math.sin(R.time * 14) * 0.25; }
    else if (R.braced) name = 'brace';
    else if (R.mode === 'eat' || (R.resting && R.stamina > 20)) name = 'rest';
    else name = (u < 0.42 ? 'climb' : 'pull') + (Math.floor(mv) % 2 ? 'B' : 'A');
    if (R.mode === 'shift' && R.anim) roll = Math.sin(smooth(R.anim.p) * Math.PI) * 0.22 * -R.anim.dir;
    setFrame(rivalMat, rivalSprite, 'sanhua-' + name, 1);
    rivalSprite.rotation.z = roll;
  }
  // ---------- after the top ----------
  function startRide(kind) {
    finale = { kind, t: 0 }; endEl.hidden = true; postcard = null; LED.uShow.value = 0;
  }
  const fwd = new THREE.Vector3(), lft = new THREE.Vector3();
  const PC_LOOK = (() => { const L = LANDMARKS.length ? LANDMARKS : [{ x: 0, z: -1000, h: 200 }]; return V3(L.reduce((a, l) => a + l.x, 0) / L.length, 120, L.reduce((a, l) => a + l.z, 0) / L.length); })();
  function placeFinale() {
    const pose = X.finalePose(finale.kind, finale.t);
    cat.scale.setScalar(0.62); seatRing.visible = false; cabin.visible = false;
    if (pose.phase === 'deck' || pose.phase === 'postcard') {
      // 488 m outdoor deck, looking north over 海心沙 towards 西塔 and 东塔
      // camera held up at 2.2 m, 3 m in from the rail: the deck floor stays out of the line to 海心沙 (31° down)
      const edge = V3(PC_LOOK.x, 0, PC_LOOK.z).normalize().multiplyScalar(DECK_OUT - 3);
      camPos.set(edge.x, deckY + 2.2, edge.z); camLook.copy(PC_LOOK);
      fwd.subVectors(camLook, camPos).normalize(); lft.crossVectors(up, fwd).normalize();
      const fh = V3(fwd.x, 0, fwd.z).normalize();
      cat.scale.setScalar(0.45);
      catPos.copy(camPos).addScaledVector(fh, 2.4).addScaledVector(lft, 0.95 * Math.min(1, camera.aspect)); catPos.y = deckY + CAT_H / 2 * 0.45;
      cat.position.copy(catPos); cat.lookAt(catPos.clone().sub(V3(fwd.x, 0, fwd.z)));   // plane faces the camera: we see her back and her look over the shoulder
      catOut.copy(fwd).negate().setY(0).normalize(); catUp.set(0, 1, 0);
      setFrame(catMat, catSprite, 'rest', 1); catSprite.position.set(0, 0, 0); catSprite.rotation.z = 0;
      if (pose.phase === 'postcard' && !postcard && !wantPostcard) wantPostcard = true;
      return;
    }
    if (finale.kind === 'tram') {
      const rr = TRAM_R, a = pose.angle + Math.PI * 0.5;
      catPos.set(Math.cos(a) * rr, pose.y, Math.sin(a) * rr * 0.78);
      cabin.visible = true; cabin.position.copy(catPos);
      catOut.set(catPos.x, 0, catPos.z).normalize(); catUp.set(0, 1, 0);
      setFrame(catMat, catSprite, 'rest', 1);
      camPos.copy(catPos).addScaledVector(catOut, 9).add(V3(0, 3.2, 0)); camLook.copy(catPos).add(V3(0, 0.5, 0));
    } else {
      const r = mastR(pose.y) + 1.1;
      catPos.set(0, pose.y, -r); catOut.set(0, 0, -1); catUp.set(0, 1, 0);
      seatRing.visible = true; placeSeats(pose.y - 0.95);
      setFrame(catMat, catSprite, pose.phase === 'falling' ? 'brace' : 'rest', 1);
      camPos.set(3.2, pose.y + (pose.phase === 'falling' ? 2.2 : 1.2), -r - 4.6); camLook.set(0, pose.y - 0.6, -r);
      if (pose.phase === 'falling') shake = Math.max(shake, 0.25);
    }
    cat.position.copy(catPos);
    const right = new THREE.Vector3().crossVectors(catUp, catOut).normalize();
    cat.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, catUp, new THREE.Vector3().crossVectors(right, catUp).normalize()));
    catSprite.position.set(0, 0, 0); catSprite.rotation.z = 0;
  }
  // the postcard: the frame just rendered, cropped, with the three landmarks named from OSM
  function makePostcard() {
    const src = renderer.domElement, W = src.width, H = src.height, portrait = W < H;
    const cw = portrait ? 800 : 1200, ch = portrait ? 1200 : 800, frame = 28, foot = portrait ? 124 : 96;
    const sw = portrait ? Math.min(W, H * 2 / 3) : W, sh = portrait ? H : Math.min(H, W * 2 / 3), sx = (W - sw) / 2, sy = (H - sh) / 2;
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const g = cv.getContext('2d');
    g.fillStyle = '#fffaf0'; g.fillRect(0, 0, cw, ch);
    const iw = cw - frame * 2, ih = ch - frame - foot;
    g.drawImage(src, sx, sy, sw, sh, frame, frame, iw, ih);
    const labels = [];
    const v = new THREE.Vector3();
    LANDMARKS.forEach(l => {
      v.set(l.x, l.h < 100 ? 2 : l.h, l.z).project(camera);
      const px = (v.x * 0.5 + 0.5) * W, py = (-v.y * 0.5 + 0.5) * H;
      const x = frame + (px - sx) / sw * iw, y = frame + (py - sy) / sh * ih;
      labels.push({ label: l.label, name: l.name, x, y, inside: v.z < 1 && x > frame && x < cw - frame && y > frame && y < frame + ih });
    });
    const fs = portrait ? 26 : 24;
    labels.forEach(L => {
      if (!L.inside) return;
      const txt = L.label === '海心沙' ? '海心沙' : `${L.label} · ${L.name}`;
      g.font = `700 ${fs}px -apple-system,"PingFang SC",sans-serif`;
      const tw = g.measureText(txt).width, lift = L.label === '海心沙' ? 70 : 46;
      let bx = clamp(L.x - tw / 2 - 10, frame + 6, cw - frame - tw - 26), by = clamp(L.y - lift - fs, frame + 6, frame + ih - fs - 20);
      g.strokeStyle = '#fffaf0'; g.lineWidth = 3; g.beginPath(); g.moveTo(L.x, L.y); g.lineTo(L.x, by + fs + 14); g.stroke();
      g.fillStyle = '#fffaf0'; g.beginPath(); g.arc(L.x, L.y, 6, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(29,26,34,.82)'; g.fillRect(bx, by, tw + 20, fs + 14);
      g.fillStyle = '#fff6e8'; g.fillText(txt, bx + 10, by + fs + 3);
      L.box = { x: bx, y: by, w: tw + 20, h: fs + 14 };
    });
    g.fillStyle = '#1d1a22'; g.font = `800 ${portrait ? 34 : 32}px -apple-system,"PingFang SC",sans-serif`;
    g.fillText('广州塔 · 488 米', frame, ch - foot + 46);
    const res = X.raceResult(S, R || {}), d = X.gzClock(); void d;
    const day = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '.');
    g.font = `500 ${portrait ? 20 : 19}px -apple-system,"PingFang SC",sans-serif`; g.fillStyle = '#5a5060';
    const raceLine = race && res ? (res.won ? '比三花姐先到顶' : '三花姐先到一步') + ' · ' : '';
    g.fillText(`${raceLine}${finale.kind === 'tram' ? '坐过摩天轮' : '坐过极速云霄'} · 用时 ${fmt(S.doneAt)} · ${day}`, frame, ch - foot + 78);
    if (portrait) g.fillText('我的AI小木屋 · 地图 © OpenStreetMap', frame, ch - foot + 106);
    else { g.textAlign = 'right'; g.fillText('我的AI小木屋 · 地图 © OpenStreetMap', cw - frame - 90, ch - foot + 78); g.textAlign = 'left'; }
    g.strokeStyle = '#c0392b'; g.lineWidth = 3; g.beginPath(); g.arc(cw - frame - 46, ch - foot + 34, 26, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#c0392b'; g.font = '700 15px -apple-system,"PingFang SC",sans-serif'; g.textAlign = 'center'; g.fillText('广州', cw - frame - 46, ch - foot + 40); g.textAlign = 'left';
    const url = cv.toDataURL('image/png');
    postcard = { url, labels, w: cw, h: ch, portrait };
    $('pc-img').src = url; $('pc-save').href = url;
    pcEl.hidden = false;
  }
  function updatePigeons(dt) {
    let n = 0, w = 0;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = V3(1, 1, 1);
    const showPig = (pos, yaw, flap) => {
      q.setFromAxisAngle(up, yaw); m.compose(pos, q, V3(1, 0.85, 1.35)); pigeonBody.setMatrixAt(n, m);
      const hp = pos.clone().add(V3(Math.sin(yaw) * 0.22, 0.15, Math.cos(yaw) * 0.22)); m.compose(hp, q, sc); pigeonHead.setMatrixAt(n, m);
      [-1, 1].forEach(sx => { const wq = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 0, 1), sx * flap)); const wp = pos.clone().add(V3(Math.cos(yaw) * 0.2 * sx, 0.05, -Math.sin(yaw) * 0.2 * sx)); m.compose(wp, wq, sc); pigeonWing.setMatrixAt(w++, m); });
      n++;
    };
    const near = X.y(S);
    for (const pg of S.pigeons.values()) {
      const yy = X.ringY(pg.k) + 1.6; if (Math.abs(yy - near) > 160 || n >= 200) continue;
      const f = colFrame(pg.c, yy / C.height); const pos = f.p.addScaledVector(f.out, 1.0).add(V3(0, 0.15, 0));
      showPig(pos, Math.atan2(f.out.x, f.out.z) + Math.sin(S.time * 0.7 + pg.c) * 0.5, 0.1 + Math.abs(Math.sin(S.time * 1.3 + pg.k)) * 0.1);
    }
    flyers = flyers.filter(fl => (fl.t += dt) < 3);
    flyers.forEach(fl => { const pos = fl.p.clone().addScaledVector(fl.v, fl.t).add(V3(0, fl.t * fl.t * 1.5, 0)); showPig(pos, fl.yaw, Math.sin(fl.t * 40) * 0.9); });
    pigeonBody.count = n; pigeonHead.count = n; pigeonWing.count = w;
    pigeonBody.instanceMatrix.needsUpdate = pigeonHead.instanceMatrix.needsUpdate = pigeonWing.instanceMatrix.needsUpdate = true;
  }
  function updateWind(dt, gp) {
    const on = gp.phase === 'gust' ? 1 : gp.phase === 'warn' ? 0.25 * gp.p : 0;
    windLines.material.opacity = lerp(windLines.material.opacity, on * 0.55, dt * 6);
    const dir = gp.g ? gp.g.dir : 1;
    const right = new THREE.Vector3().crossVectors(catUp, catOut).normalize();
    for (let i = 0; i < windN; i++) {
      const sd = windSeeds[i]; sd[0] = (sd[0] + dt * (0.6 + sd[2]) * (on > 0.5 ? 1.6 : 0.4)) % 1;
      const along = (sd[0] - 0.5) * 30 * dir;
      const base = catPos.clone().addScaledVector(right, along).addScaledVector(catUp, (sd[1] - 0.5) * 16).addScaledVector(catOut, (sd[2] - 0.3) * 8);
      const end = base.clone().addScaledVector(right, 1.8 * dir);
      windPos.set([base.x, base.y, base.z, end.x, end.y, end.z], i * 6);
    }
    windGeo.attributes.position.needsUpdate = true;
  }
  function updateCamera(dt) {
    camYaw = lerp(camYaw, camYawTarget, dt * 4);
    if (!drag) camYawTarget *= Math.pow(0.4, dt);
    const out = catOut.clone().applyAxisAngle(up, camYaw);
    let dist = 10.5, lift = -0.8, look = 2.2;
    if (finale) { /* placeFinale set camPos / camLook */ }
    else if (ended) { // orbit pull-back for the light show
      const a = showT * 0.12, r = lerp(14, 520, smooth(clamp(showT / 9, 0, 1)));
      camPos.set(Math.cos(a) * r, C.height + lerp(2, 170, smooth(clamp(showT / 9, 0, 1))), Math.sin(a) * r);
      camLook.set(0, C.height - lerp(0, 160, smooth(clamp(showT / 9, 0, 1))), 0);
    } else {
      if (S.mode === 'stairs') { dist = 9; lift = 0.6; }
      const want = catPos.clone().addScaledVector(out, dist).add(V3(0, lift, 0));
      if (!camInit) { camPos.copy(want); camInit = true; } else camPos.lerp(want, 1 - Math.pow(0.002, dt));
      camLook.copy(catPos).add(V3(0, look, 0));
    }
    camera.position.copy(camPos);
    if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; shake = Math.max(0, shake - dt * 1.5); }
    camera.lookAt(camLook);
    camFill.position.copy(camera.position); camFill.target.position.copy(catPos);
  }
  function applySky() {
    const k = sky(dayP);
    skyMat.uniforms.uTop.value.copy(k.top); skyMat.uniforms.uHor.value.copy(k.hor); skyMat.uniforms.uSun.value.copy(k.sun); skyMat.uniforms.uNight.value = k.night;
    const sd = V3(-0.6, k.sunEl, -0.8).normalize(); skyMat.uniforms.uSunDir.value.copy(sd);
    sun.position.copy(catPos).addScaledVector(sd, 500); sun.target.position.copy(catPos); sun.color.copy(k.sun); sun.intensity = k.si;
    hemi.intensity = k.hi; scene.fog.color.copy(k.hor);
    camFill.intensity = lerp(0.9, 0.35, k.night);
    renderer.toneMappingExposure = k.exp;
    LED.uNight.value = k.night; glassMat.emissiveIntensity = k.night * 0.6; capMat.emissiveIntensity = k.night * 1.2 + LED.uShow.value;
    beacon.material.color.setHSL(0, 1, 0.35 + 0.25 * (Math.sin(LED.uTime.value * 3) > 0 ? 1 : 0));
  }
  function placeBanners() {   // on narrow screens the warning bars and hints sit right under the height meter, whatever its height
    const m = document.querySelector('.meter').getBoundingClientRect();
    if (m.height) document.documentElement.style.setProperty('--hud-bottom', Math.round(m.bottom + 8) + 'px');
  }
  if (window.ResizeObserver) new ResizeObserver(placeBanners).observe(document.querySelector('.meter'));
  addEventListener('resize', placeBanners);
  function updateHUD(gp) {
    const yy = X.y(S);
    $('h-now').textContent = Math.round(yy);
    const nextCp = C.checkpoints.find(k => k > S.checkpointK);
    const ci = C.checkpoints.indexOf(nextCp);
    $('h-next').textContent = S.mode === 'stairs' ? '蜘蛛侠栈道 · 出口 334 米' : nextCp ? `下一个歇脚台 · ${C.checkpointNames[ci]}\u00a0${C.checkpointRealY[ci]}\u00a0米` : '最后一段 · 塔顶 454 米';
    const fill = $('stamina-fill'); fill.style.width = clamp(S.stamina / S.staminaMax * 100, 0, 100) + '%'; fill.classList.toggle('low', S.stamina < 30); fill.classList.toggle('boost', S.staminaMax > C.stamina);
    const resting = !!S.resting && S.stamina < 99.5;
    staminaEl.classList.toggle('resting', resting); staminaLabel.textContent = S.mode === 'eat' ? '吃点心…' : resting ? '歇脚中 ↑' : S.settling ? '抓横梁…' : S.staminaMax > C.stamina ? '体力 +30' : '体力';
    $('s-time').textContent = fmt(S.time); $('s-falls').textContent = S.falls + S.gustFalls;
    gustEl.classList.toggle('on', gp.phase === 'warn' || gp.phase === 'gust');
    gustEl.classList.toggle('blowing', gp.phase === 'gust');
    gustEl.dataset.dir = gp.g ? gp.g.dir : 1;
    gustEl.querySelector('.fill').style.width = (gp.phase === 'warn' ? gp.p * 100 : gp.phase === 'gust' ? (1 - gp.p) * 100 : 0) + '%';
    gustEl.querySelector('.label').textContent = gp.phase === 'gust' ? '刮风中 · 别松手' : '起风了 · 按住抓紧';
    padKeys.brace.classList.toggle('urgent', gp.phase === 'warn' || gp.phase === 'gust');
    const shelter = X.sheltered(S);
    if (shelter) { gustEl.classList.remove('on'); padKeys.brace.classList.remove('urgent'); }
    if (race && R) {
      const gap = Math.round(X.raceGap(S, R)), b = raceEl.querySelector('b'), sm = raceEl.querySelector('span');
      sm.innerHTML = R.done ? '三花姐 <b>已登顶</b>' : `三花姐 <b>${gap > 0 ? '+' : gap < 0 ? '−' : '±'}${Math.abs(gap)}</b> 米<small>${gap > 0 ? '在你上面' : gap < 0 ? '在你下面' : '并排'}</small>`;
      raceEl.classList.toggle('ahead', gap > 0 || R.done); raceEl.classList.toggle('behind', gap < 0 && !R.done); void b;
    }
    const kp = X.kitePhase(S), kOn = kp.phase === 'warn' && kp.k.status === 'locked';
    kiteEl.classList.toggle('on', kOn); kiteEl.querySelector('.fill').style.width = (kOn ? kp.p * 100 : 0) + '%';
    padKeys.left.classList.toggle('urgent', kOn); padKeys.right.classList.toggle('urgent', kOn);
  }
  const eventLog = [];
  function handleEvents() {
    while (S.events.length) {
      const e = S.events.shift(); eventLog.push(e.type); if (eventLog.length > 200) eventLog.shift();
      if (e.type === 'pigeon') { const f = colFrame(e.col, X.ringY(e.k) / C.height); flyers.push({ p: f.p.addScaledVector(f.out, 1.0), v: f.out.clone().multiplyScalar(5).add(V3(0, 2, 0)), yaw: Math.atan2(f.out.x, f.out.z), t: 0 }); flash('hit'); shake = 0.35; }
      if (e.type === 'gust-fall' || e.type === 'lost-grip') { flash('hit'); shake = 0.6; }
      if (e.type === 'gust-held') { flash('ok'); clearHint('gust'); }
      if (e.type === 'checkpoint') { flash('ok'); const i = C.checkpoints.indexOf(e.k); if (i >= 0) note(`到了 · ${C.checkpointNames[i]} ${C.checkpointRealY[i]} 米，体力回满`); }
      if (e.type === 'kite-warn' && !hintDone.kite) showHint('kite');
      if (e.type === 'kite-dodged') { flash('ok'); clearHint('kite'); kiteAway = { from: kitePos.clone(), dir: colFrame(e.col, S.t).out.add(V3(0, 0.3, 0)).normalize(), t: 0 }; }
      if (e.type === 'kite-hit') { flash('hit'); shake = 0.8; if (hintNow === 'kite') { hintNow = null; hintEl.hidden = true; } kiteAway = { from: kitePos.clone(), dir: colFrame(e.col, S.t).out.add(V3(0, 0.5, 0)).normalize(), t: 0 }; }
      if (e.type === 'shifted') clearHint('shift');
      if (e.type === 'stairs-in') { flash('ok'); note('进了蜘蛛侠栈道：这里风和黑鸢都碰不到你。按住 <b>↑</b> 跑台阶，到 334 米出口出来'); }
      if (e.type === 'stairs-out') note('出了栈道，334 米。外面又有风了');
      if (e.type === 'snack') { flash('ok'); note(`吃了一份${C.snack.names[e.name]}，体力上限 +${C.snack.bonus}`); }
      if (e.type === 'top') finish();
    }
    if (!R) return;
    while (R.events.length) {
      const e = R.events.shift(), near = Math.abs(X.y(R) - X.y(S)) < 40;
      if ((e.type === 'gust-fall' || e.type === 'kite-hit') && near && !rivalNoted[e.type]) { rivalNoted[e.type] = true; if (hintNow === null || hintNow === 'note') note(e.type === 'gust-fall' ? '三花姐没抓紧，被风刮下去一截！' : '三花姐被黑鸢撞下去一截！'); }
      if (e.type === 'lost-grip' && !rivalNoted.lost) { rivalNoted.lost = true; if (hintNow === null || hintNow === 'note') note('三花姐硬撑过头，体力用光滑下去了'); }
      if (e.type === 'snack' && near) note('三花姐在旋转餐厅吃了个虾饺');
      if (e.type === 'top' && !S.done) note('三花姐先登顶了，在上面等你');
    }
  }
  // ---------- tower lights on Guangzhou time ----------
  let lightProg = { on: false }, litSince = null, lightsSeen = null;
  function updateLights(dt) {
    const real = X.gzClock(), elapsed = (performance.now() - pageStart) / 1000;
    let vsec = X.virtualSec(MODE, following, real.sec, S.maxY / C.height);
    if (!following && MODE !== 'dusk') vsec += elapsed;
    if (MODE === 'dusk') {
      if (X.lightsOn(vsec)) { if (litSince === null) litSince = LED.uTime.value; lightProg = X.lightProgram(X.LIGHTS.on + (LED.uTime.value - litSince)); }
      else { litSince = null; lightProg = { on: false }; }
    } else lightProg = X.lightProgram(vsec + (following ? (Date.now() % 1000) / 1000 : 0));
    if (Q.get('chapter') !== null) { const n = +Q.get('chapter'); lightProg = n < 0 ? { on: true, program: 'classic', chapter: -1, local: 0.5 } : { on: true, program: 'bay', chapter: n, name: X.BAY_CHAPTERS[n], local: 0.65 }; }   // check-only override
    if (lightsSeen === false && lightProg.on && playing) note('19:00，广州塔亮灯了');
    lightsSeen = lightProg.on;
    LED.uOn.value = lerp(LED.uOn.value, lightProg.on ? 1 : 0, Math.min(1, dt * 2));
    if (lightProg.on) { LED.uChapter.value = lightProg.program === 'bay' ? lightProg.chapter : -1; LED.uLocal.value = lightProg.local; }
    const el = $('h-light');
    if (lightProg.on) el.textContent = lightProg.program === 'bay' ? `塔灯 · 湾区新韵 · ${lightProg.name}` : '塔灯 · 经典小蛮腰';
    else el.textContent = X.virtualSec(MODE, following, real.sec, S.maxY / C.height) >= X.LIGHTS.off || (MODE === 'night' && following) ? '塔灯 · 23:00 已熄' : '塔灯 · 19:00 亮';
  }
  function note(text) { hintNow = 'note'; hintSince = S.time; hintEl.innerHTML = text; hintEl.hidden = false; }
  let flashTimer = 0;
  function flash(kind) { flashEl.className = kind; clearTimeout(flashTimer); flashTimer = setTimeout(() => { flashEl.className = ''; }, 120); }
  function hintLogic(gp) {
    const yy = X.y(S);
    if (hintNow === 'climb' && yy > 6) clearHint('climb');
    if (gp.phase === 'warn' && !hintDone.gust && !X.sheltered(S) && !choiceOn) showHint('gust');
    if (hintNow === 'gust' && gp.phase === 'calm') { hintNow = null; hintEl.hidden = true; }
    if (hintDone.climb && !hintDone.shift && X.atNode(S) >= 0) { const k = X.atNode(S); if (S.pigeons.has(k + ':' + S.col)) showHint('shift'); }
    if (S.stamina < 60 && !hintDone.low && hintNow !== 'gust' && hintNow !== 'note' && !choiceOn) showHint('low');
    if (hintNow === 'low' && S.resting) clearHint('low');
    if (yy > X.waist().t * C.height + 5 && !hintDone.waist && hintNow === null) showHint('waist');
    if (hintNow === 'waist' && S.time - hintSince > 5) clearHint('waist');
    if (hintNow === 'shift' && S.time - hintSince > 10) clearHint('shift');
    if (hintNow === 'note' && S.time - hintSince > 4) { hintNow = null; hintEl.hidden = true; }
  }
  function finish() {
    ended = true; playing = false; showT = 0;
    endEl.querySelector('h1').innerHTML = MODE === 'day' ? '454 米，<br>整座城在脚下。' : lightProg.on ? '454 米，<br>全城亮灯。' : '23 点熄灯了，<br>城市还醒着。';
    $('e-time').textContent = fmt(S.doneAt); $('e-falls').textContent = S.falls + S.gustFalls; $('e-pigeons').textContent = S.pigeonHits; $('e-kites').textContent = S.kiteHits;
    $('e-route').textContent = S.stairsUsed ? '走了蜘蛛侠栈道' : '一路爬外面';
    const v = $('e-verdict'), res = race && R ? X.raceResult(S, R) : null; v.hidden = !res;
    if (res) v.textContent = res.won ? (res.margin === null ? `赢了！三花姐还在 ${Math.round(res.rivalY)} 米` : `赢了！比三花姐早 ${res.margin.toFixed(1)} 秒`) : `三花姐先到，早你 ${res.margin.toFixed(1)} 秒`;
    padEl.hidden = true; hintEl.hidden = true; hudEl.hidden = true; gustEl.classList.remove('on'); kiteEl.classList.remove('on'); setChoice(null);
    setTimeout(() => { if (ended && !finale) { endEl.hidden = false; } }, 4500);
  }

  function resize() {
    const w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 68 : 60; camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize); resize();

  // fixed views for checks
  function applyView(v) {
    const map = { base: 0.02, waist: X.waist().t, top: 0.985 };
    if (!(v in map)) return;
    S.t = Math.round(map[v] * C.rings) / C.rings; S.maxY = X.y(S); S.checkpointK = Math.max(0, ...C.checkpoints.filter(k => k <= Math.round(S.t * C.rings)));
    dayP = X.skyProgress(MODE, S.maxY / C.height); introEl.hidden = true; hudEl.hidden = false; padEl.hidden = false; playing = false;
  }
  if (VIEW) applyView(VIEW);

  let last = performance.now(), frames = 0, fpsT = 0, fps = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    tick(dt);
    renderer.render(scene, camera);
    if (wantPostcard) { wantPostcard = false; makePostcard(); }
    frames++; fpsT += dt; if (fpsT > 1) { fps = frames / fpsT; frames = 0; fpsT = 0; }
    requestAnimationFrame(frame);
  }
  function tick(dt) {
    LED.uTime.value += dt;
    if (playing) {
      input.act = pendingPick || false; pendingPick = null;
      X.step(S, input, dt);
      if (R && !R.done) X.step(R, rivalPilot(R), dt);
      handleEvents();
    }
    if (finale) finale.t += dt;
    stairMat.emissiveIntensity = playing && X.atFork(S) ? 0.5 + 0.4 * Math.sin(LED.uTime.value * 5) : 0;
    if (ended && !finale) { showT += dt; LED.uShow.value = smooth(clamp(showT / 3, 0, 1)) * (lightProg.on ? 1 : 0); tramRing.rotation.y += dt * 0.08; }
    else LED.uShow.value = 0;
    dayP = lerp(dayP, X.skyProgress(MODE, S.maxY / C.height), Math.min(1, dt * 0.8));
    const gp = X.gustPhase(S);
    updateLights(dt); placeCat(dt); placeRival(); updateKite(dt); updateRivalKite(dt); updatePigeons(dt); updateWind(dt, gp); updateCamera(dt); applySky();
    if (playing) { updateHUD(gp); hintLogic(gp); updateChoice(); }
    else if (VIEW) updateHUD(gp);
    if (gp.phase === 'gust' && playing) shake = Math.max(shake, 0.08);
  }
  requestAnimationFrame(frame);

  window.__PLAYTEST__ = {
    ready: true,
    snapshot: () => ({ frame: frameName, race, rivalY: R ? +X.y(R).toFixed(2) : null, rivalCol: R ? R.col : null, rivalMode: R ? R.mode : null, rivalDone: R ? R.done : null, gap: R ? +X.raceGap(S, R).toFixed(1) : null, choice: choiceOn, staminaMax: S.staminaMax, ate: S.ate, stairsUsed: S.stairsUsed, finale: finale ? X.finalePose(finale.kind, finale.t).phase : null, postcard: postcard ? { labels: postcard.labels, w: postcard.w, h: postcard.h } : null, kite: X.kitePhase(S).phase, kiteHits: S.kiteHits, timeMode: MODE, following, lights: lightProg.on ? (lightProg.name || 'classic') : 'off', dayP: +dayP.toFixed(3), y: +X.y(S).toFixed(2), col: S.col, mode: S.mode, stamina: +S.stamina.toFixed(1), falls: S.falls, gustFalls: S.gustFalls, pigeonHits: S.pigeonHits, time: +S.time.toFixed(2), done: S.done, playing, ended, hint: hintNow, gust: X.gustPhase(S).phase, fps: +fps.toFixed(1), calls: renderer.info.render.calls, tris: renderer.info.render.triangles, cityTris: window.__cityTris, input: Object.assign({}, input) }),
    reset: seed => { reset(seed); },
    setSeed: n => { reset(n); },
    start: () => start(),
    step: ms => { const n = Math.round(ms / (1000 / 60)); for (let i = 0; i < n; i++) tick(1 / 60); },
    jumpToKite: () => { S.gusts = S.gusts.filter(g => g.start > S.time + 60); const k = S.kites[S.kiteIdx]; if (k) S.time = k.warnAt - 0.2; },
    hits: () => eventLog.slice(),
    teleport: (t, col) => { S.mode = 'climb'; S.anim = null; S.t = t; if (col != null) S.col = col; S.maxY = Math.max(S.maxY, X.y(S)); S.checkpointK = Math.max(S.checkpointK, ...C.checkpoints.filter(k => X.ringY(k) <= X.y(S) + 0.01)); },
    // put 三花姐 a given number of metres above (+) or below (−) 小橘, on her own column
    rivalAt: dy => { if (!R) return; R.t = clamp(S.t + dy / C.height, 0, 0.999); R.maxY = X.y(R); R.time = S.time; },
    calm: () => { S.gusts = S.gusts.filter(g => g.start > S.time + 120); S.kites = S.kites.filter(k => k.warnAt > S.time + 120); S.kiteIdx = 0; S.gustIdx = 0; if (R) { R.gusts = R.gusts.filter(g => g.start > R.time + 120); R.kites = R.kites.filter(k => k.warnAt > R.time + 120); R.kiteIdx = 0; R.gustIdx = 0; } },
    setRace: on => setRace(!!on)
  };
})();
