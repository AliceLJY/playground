(function () {
  'use strict';
  // Chapter 2 「下塔进城」 view: street-level ground from the OSM grid, trees, bike docks, stop beacons, minimap, HUD,
  // and the two cats as sprites. Logic lives in town-core.js; the scene, sky and tower come from game.js (window.XJT_ENGINE).
  const E = window.XJT_ENGINE, TC = window.XJTOWN, TOWN = window.XJT_TOWN;
  if (!E || !TC || !TOWN) return;
  const { scene, camera, LED } = E;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const lerp = (a, b, t) => a + (b - a) * t;
  const $ = id => document.getElementById(id);
  const Q = new URLSearchParams(location.search);
  const S2 = TC.SURF;
  let G = null, nav = null, built = false;
  const world = new THREE.Group(); world.visible = false; scene.add(world);

  // ---------- frames ----------
  const XF = ['runA', 'runB', 'runC', 'runD', 'rideA', 'rideB', 'rideC', 'rideStop', 'stand', 'cheer', 'scan', 'win'].map(n => 'town-' + n);
  const SF = ['runBackA', 'runBackB', 'runFrontA', 'runFrontB', 'runLeftA', 'runLeftB', 'runRightA', 'runRightB', 'rideBackA', 'rideBackB', 'rideFrontA', 'rideFrontB',
    'rideLeftA', 'rideLeftB', 'rideRightA', 'rideRightB', 'scan', 'selfie', 'stand', 'win'].map(n => 'sanhua-town-' + n);
  let framesLoaded = false;
  function loadFrames() { if (framesLoaded) return; framesLoaded = true; [...XF, ...SF].forEach(n => E.loadCat(n)); }
  // sprite planes are 1:2 (width:height) in game.js; scale the groups so 小橘 stands about 1.75 m, 三花姐 a little taller
  const XJ_SCALE = 0.62, SH_SCALE = 0.66;

  // ---------- build the street scene once ----------
  const PAL = { [S2.ROAD]: [112, 110, 106],   // under the road ribbons: reads as a kerb where the 1 m texels bleed out
    [S2.GROUND]: [207, 198, 180], [S2.GREEN]: [110, 154, 90], [S2.WATER]: [61, 95, 120], [S2.BUILDING]: [150, 140, 128], [S2.FOOTBRIDGE]: [232, 226, 214] };
  let mapCanvas = null, groundMat = null, stopBeacons = [], stopLabels = [], dockBikes = null, bikeTaken = [];
  function build() {
    if (built) return; built = true;
    G = TC.decodeGrid(TOWN); nav = TC.buildNav(G);
    for (let i = 0; i < TOWN.stops.length; i++) TC.field(G, nav, i);
    // ground texture: one texel per metre; water is left transparent so the chapter-1 river surface shows through
    const cv = document.createElement('canvas'); cv.width = G.W; cv.height = G.H;
    const g = cv.getContext('2d'), im = g.createImageData(G.W, G.H), d = im.data;
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < G.cells.length; i++) {
      const v = G.cells[i], c = PAL[v] || PAL[S2.GROUND], n = v === S2.GREEN ? (rnd() - 0.5) * 8 : 0;   // flat colours: per-texel noise reads as 1 m mosaic up close
      d[i * 4] = c[0] + n; d[i * 4 + 1] = c[1] + n; d[i * 4 + 2] = c[2] + n; d[i * 4 + 3] = v === S2.WATER ? 0 : 255;
    }
    g.putImageData(im, 0, 0);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
    groundMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0, alphaTest: 0.5 });
    // paving detail: a fine tile grid on plazas and pavements, asphalt grain on roads (world-space, so it never smears)
    groundMat.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW; float gh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }')
        .replace('#include <map_fragment>', `#include <map_fragment>
          { // diffuseColor is linear here: road ≈ 0.05, grass ≈ 0.2, paving ≈ 0.5
            float lum = dot(diffuseColor.rgb, vec3(0.333));
            vec2 t = fract(vGW.xz / 1.2); float seam = 1.0 - smoothstep(0.0, 0.035, min(min(t.x, 1.0 - t.x), min(t.y, 1.0 - t.y)));
            float aa = clamp(1.0 - fwidth(vGW.x) * 2.5, 0.0, 1.0);
            if (lum > 0.35) diffuseColor.rgb *= (1.0 - seam * 0.13 * aa) * (0.97 + 0.06 * gh(floor(vGW.xz / 1.2)) * aa);
            else if (lum < 0.1) diffuseColor.rgb *= 0.94 + 0.12 * gh(floor(vGW.xz * 5.0)) * aa;
            else diffuseColor.rgb *= 0.9 + 0.2 * gh(floor(vGW.xz * 3.0)) * aa; }`);
    };
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(G.W, G.H), groundMat);
    plane.rotation.x = -Math.PI / 2; plane.position.set(G.X0 + G.W / 2, 0.08, G.Z0 + G.H / 2);
    world.add(plane);

    // road surfaces as ribbons along the OSM centre lines: crisp edges the 1 m texture cannot give
    const RW = { primary: 16, primary_link: 8, secondary: 13, secondary_link: 7, tertiary: 10, tertiary_link: 6, unclassified: 7, residential: 6, living_street: 5 };
    const rp = [];
    const pushTri = (a, c, b) => rp.push(a[0], 0.11, a[1], b[0], 0.11, b[1], c[0], 0.11, c[1]);   // wound so the face points up (+y); x east, z south
    for (const r of TOWN.roads) {
      const w = (RW[r.k] || 6) / 2, p = r.p;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3], L = Math.hypot(bx - ax, bz - az); if (L < 0.01) continue;
        const nx = -(bz - az) / L * w, nz = (bx - ax) / L * w;
        const A = [ax + nx, az + nz], B = [bx + nx, bz + nz], C = [bx - nx, bz - nz], D = [ax - nx, az - nz];
        pushTri(A, C, B); pushTri(A, D, C);
      }
      for (let i = 0; i < p.length; i += 2) for (let k = 0; k < 12; k++) {   // round joints
        const a0 = k / 12 * Math.PI * 2, a1 = (k + 1) / 12 * Math.PI * 2;
        pushTri([p[i], p[i + 1]], [p[i] + Math.cos(a1) * w, p[i + 1] + Math.sin(a1) * w], [p[i] + Math.cos(a0) * w, p[i + 1] + Math.sin(a0) * w]);
      }
    }
    const roadGeo = new THREE.BufferGeometry(); roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); roadGeo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(rp.length).map((_, k) => k % 3 === 1 ? 1 : 0), 3));
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x3c3e46, roughness: 0.88, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1 });
    roadMat.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvRW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vRW; float rh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }')
        .replace('#include <map_fragment>', '#include <map_fragment>\n float aa = clamp(1.0 - fwidth(vRW.x) * 2.5, 0.0, 1.0); diffuseColor.rgb *= 0.93 + 0.14 * rh(floor(vRW.xz * 5.0)) * aa;');
    };
    const roadMesh = new THREE.Mesh(roadGeo, roadMat); roadMesh.frustumCulled = false; world.add(roadMesh);

    // lane dashes on the bigger roads
    const dashes = [];
    for (const r of TOWN.roads) {
      if (!['primary', 'secondary', 'tertiary', 'primary_link'].includes(r.k)) continue;
      let carry = 0;
      for (let i = 0; i + 3 < r.p.length; i += 2) {
        const ax = r.p[i], az = r.p[i + 1], bx = r.p[i + 2], bz = r.p[i + 3], L = Math.hypot(bx - ax, bz - az);
        for (let u = carry; u < L; u += 9) { const x = ax + (bx - ax) * u / L, z = az + (bz - az) * u / L; if (TC.surf(G, x, z) === S2.ROAD) dashes.push([x, z, Math.atan2(bx - ax, bz - az)]); }
        carry = (carry - L) % 9; if (carry < 0) carry += 9;
      }
    }
    const dashMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.18, 3), new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.6 }), dashes.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    dashes.forEach(([x, z, a], i) => { e.set(-Math.PI / 2, 0, a); q.setFromEuler(e); m4.compose(V3(x, 0.13, z), q, V3(1, 1, 1)); dashMesh.setMatrixAt(i, m4); });
    world.add(dashMesh);

    // street trees (pavements beside roads) and park trees (on green), one instanced trunk + one instanced crown
    const trees = []; let tr = 11;
    const rnd2 = () => (tr = (tr * 48271) % 2147483647) / 2147483647;
    const freeFor = (x, z) => TC.surf(G, x, z) === S2.GROUND && !TOWN.docks.some(dk => Math.hypot(dk.x - x, dk.z - z) < 7) && !TOWN.stops.some(s => Math.hypot(s.x - x, s.z - z) < 12) && Math.hypot(x - TOWN.start.x, z - TOWN.start.z) > 10;
    const offs = { primary: 11.5, secondary: 9, tertiary: 7.5, primary_link: 6, secondary_link: 5.5, tertiary_link: 5, unclassified: 6, residential: 5, living_street: 4.5 };
    for (const r of TOWN.roads) {
      const off = offs[r.k] || 5;
      for (let i = 0; i + 3 < r.p.length; i += 2) {
        const ax = r.p[i], az = r.p[i + 1], bx = r.p[i + 2], bz = r.p[i + 3], L = Math.hypot(bx - ax, bz - az); if (L < 1) continue;
        const nx = -(bz - az) / L, nz = (bx - ax) / L;
        for (let u = 6; u < L; u += 16) for (const sd of [1, -1]) { const x = ax + (bx - ax) * u / L + nx * off * sd, z = az + (bz - az) * u / L + nz * off * sd; if (freeFor(x, z)) trees.push([x, z, 0.8 + rnd2() * 0.5]); }
      }
    }
    for (let z = G.Z0 + 4; z < G.Z0 + G.H; z += 9) for (let x = G.X0 + 4; x < G.X0 + G.W; x += 9) {
      const jx = x + (rnd2() - 0.5) * 6, jz = z + (rnd2() - 0.5) * 6;
      if (TC.surf(G, jx, jz) === S2.GREEN && rnd2() < 0.45 && Math.hypot(jx - TOWN.start.x, jz - TOWN.start.z) > 10 && !TC.blockedAt(G, jx, jz, true)) trees.push([jx, jz, 0.9 + rnd2() * 0.7]);
    }
    const N = Math.min(trees.length, 4000);
    // trees between the camera and her dissolve (screen-door) instead of filling the frame
    const nearFade = mat => { mat.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvec4 twp = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\ntwp = instanceMatrix * twp;\n#endif\nvTW = (modelMatrix * twp).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTW;').replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n{ float d = distance(vTW, cameraPosition); float keep = smoothstep(4.0, 9.0, d); vec2 q = floor(gl_FragCoord.xy); if (keep < 0.999 && fract(sin(dot(q, vec2(12.9898, 78.233))) * 43758.5453) > keep) discard; }');
    }; return mat; };
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.22, 2.6, 6), nearFade(new THREE.MeshStandardMaterial({ color: 0x6b5140, roughness: 0.9 })), N);
    const crownGeo = new THREE.IcosahedronGeometry(1.45, 1); crownGeo.scale(1, 0.9, 1);
    const crown = new THREE.InstancedMesh(crownGeo, nearFade(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true })), N);
    const cc = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const [x, z, s] = trees[i];
      m4.compose(V3(x, 1.3 * s, z), q.identity(), V3(s, s, s)); trunk.setMatrixAt(i, m4);
      m4.compose(V3(x, 3.4 * s, z), q.setFromAxisAngle(V3(0, 1, 0), x * 1.7), V3(s, s, s)); crown.setMatrixAt(i, m4);
      crown.setColorAt(i, cc.setHSL(0.27 + ((x * 13 + z * 7) % 10) / 160, 0.42, 0.3 + ((x + z) % 5) / 60));
    }
    world.add(trunk, crown); E.townStats.trees = N;

    // shared-bike docks: three mint bikes on a grey pad each (instanced parts)
    const bikes = []; TOWN.docks.forEach((dk, di) => {
      // the rack stands 1.8 m to the side of the spot she scans from, on whichever side is pavement
      const px = -Math.sin(dk.a), pz = Math.cos(dk.a), sd = TC.surf(G, dk.x + px * 1.8, dk.z + pz * 1.8) === S2.GROUND && !TC.blockedAt(G, dk.x + px * 1.8, dk.z + pz * 1.8, true) ? 1 : -1;
      dk.rx = dk.x + px * 1.8 * sd; dk.rz = dk.z + pz * 1.8 * sd;
      for (let k = -1; k <= 1; k++) bikes.push({ di, x: dk.rx + Math.cos(dk.a) * k * 0.9, z: dk.rz + Math.sin(dk.a) * k * 0.9, a: dk.a });
    });
    E.bikeCap = bikes.length + 40;
    const mint = new THREE.MeshStandardMaterial({ color: 0x5fd3c0, roughness: 0.45, metalness: 0.1, emissive: 0x5fd3c0, emissiveIntensity: 0.18 }), dark = new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.7 }), grey = new THREE.MeshStandardMaterial({ color: 0x9a9fa6, roughness: 0.6, metalness: 0.4 });
    const parts = [
      [new THREE.TorusGeometry(0.33, 0.045, 6, 18), dark, 0, 0.35, 0.55, Math.PI / 2],
      [new THREE.TorusGeometry(0.33, 0.045, 6, 18), dark, 0, 0.35, -0.55, Math.PI / 2],
      [new THREE.BoxGeometry(0.07, 0.07, 1.05), mint, 0, 0.62, 0, 0],
      [new THREE.BoxGeometry(0.07, 0.55, 0.07), mint, 0, 0.62, -0.28, 0],
      [new THREE.BoxGeometry(0.07, 0.55, 0.07), mint, 0, 0.62, 0.45, 0],
      [new THREE.BoxGeometry(0.22, 0.06, 0.3), dark, 0, 0.92, -0.28, 0],
      [new THREE.BoxGeometry(0.34, 0.2, 0.26), dark, 0, 0.88, 0.62, 0],
      [new THREE.BoxGeometry(0.5, 0.04, 0.04), grey, 0, 0.95, 0.47, 0]
    ];
    dockBikes = parts.map(([geo, mat, px, py, pz, rx]) => {
      const im = new THREE.InstancedMesh(geo, mat, E.bikeCap); im.userData = { px, py, pz, rx }; im.frustumCulled = false;
      world.add(im); return im;
    });
    const pad = new THREE.InstancedMesh(new THREE.BoxGeometry(3.6, 0.06, 1.6), new THREE.MeshStandardMaterial({ color: 0x8b9096, roughness: 0.8 }), TOWN.docks.length);
    TOWN.docks.forEach((dk, i) => { m4.compose(V3(dk.rx, 0.1, dk.rz), q.setFromAxisAngle(V3(0, 1, 0), -dk.a), V3(1, 1, 1)); pad.setMatrixAt(i, m4); });
    world.add(pad);
    E.bikes = bikes; placeBikes();

    // stop beacons: a tall red light column you can see over the blocks, plus a name board
    TOWN.stops.forEach((st, i) => {
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 70, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xff5a5a, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      beam.position.set(st.x, 35, st.z); world.add(beam);
      const ring = new THREE.Mesh(new THREE.RingGeometry(TC.TCFG.stopReach - 0.6, TC.TCFG.stopReach, 48), new THREE.MeshBasicMaterial({ color: 0xff5a5a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(st.x, 0.14, st.z); world.add(ring);
      const lab = makeLabel(st.label, st.name); lab.position.set(st.x, 6, st.z); world.add(lab);
      stopBeacons.push({ beam, ring }); stopLabels.push(lab);
    });
    // bridge decks over the water, with rails; 海心桥 gets its white arch and hangers
    // decks share the paving colour, so a deck lying over land does not read as a wall
    const deckMat = new THREE.MeshStandardMaterial({ color: 0xcfc6b4, roughness: 0.85, metalness: 0.02 }), railMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.4, metalness: 0.3 });
    const decks = [], rails = [];
    const overWater = (x, z, nx, nz, w) => [1, -1].some(sd => TC.surf(G, x + nx * (w / 2 + 2) * sd, z + nz * (w / 2 + 2) * sd) === S2.WATER);
    let archPts = null;
    const onDeck = (o, x, z) => { for (let i = 0; i + 3 < o.p.length; i += 2) { const ax = o.p[i], az = o.p[i + 1], bx = o.p[i + 2], bz = o.p[i + 3], vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz || 1, t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L2)); if (Math.hypot(x - ax - vx * t, z - az - vz * t) < o.w / 2 - 0.3) return true; } return false; };
    for (const br of TOWN.bridges || []) {
      const p = br.p;
      if (br.foot && (!archPts || p.length > archPts.length)) archPts = p;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3], L = Math.hypot(bx - ax, bz - az); if (L < 0.5) continue;
        const nx = -(bz - az) / L, nz = (bx - ax) / L, mx = (ax + bx) / 2, mz = (az + bz) / 2;
        if (!overWater(mx, mz, nx, nz, br.w)) continue;
        const a = Math.atan2(bx - ax, bz - az);
        decks.push([mx, mz, a, L + 0.6, br.w]);
        // rails in 2 m pieces, each only where its outer side is open water and no other bridge deck runs through it
        // (OSM draws 海心桥 as two overlapping ways, and the X-shaped footbridges cross each other's decks)
        const np = Math.max(1, Math.round(L / 2));
        for (let k = 0; k < np; k++) {
          const u = (k + 0.5) / np, cx = ax + (bx - ax) * u, cz = az + (bz - az) * u;
          for (const sd of [1, -1]) {
            const rx = cx + nx * br.w / 2 * sd, rz = cz + nz * br.w / 2 * sd;
            if (TC.surf(G, cx + nx * (br.w / 2 + 1.5) * sd, cz + nz * (br.w / 2 + 1.5) * sd) === S2.WATER && !TOWN.bridges.some(o => o !== br && onDeck(o, rx, rz))) rails.push([rx, rz, a, L / np + 0.05]);
          }
        }
      }
    }
    const deckMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.9, 1), deckMat, decks.length);
    decks.forEach(([x, z, a, L, w], i) => { m4.compose(V3(x, -0.34, z), q.setFromAxisAngle(V3(0, 1, 0), a), V3(w, 1, L)); deckMesh.setMatrixAt(i, m4); });
    const railMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 1.1, 1), railMat, rails.length);
    rails.forEach(([x, z, a, L], i) => { m4.compose(V3(x, 0.6, z), q.setFromAxisAngle(V3(0, 1, 0), a), V3(1, 1, L)); railMesh.setMatrixAt(i, m4); });
    world.add(deckMesh, railMesh);
    if (archPts) {   // 海心桥's arch: a white tube rising about 40 m over the middle of the deck
      const pts = []; for (let i = 0; i < archPts.length; i += 2) pts.push(V3(archPts[i], 0, archPts[i + 1]));
      const curve = new THREE.CatmullRomCurve3(pts), arch = [], hang = [];
      for (let k = 0; k <= 80; k++) { const u = k / 80, pp = curve.getPointAt(u); arch.push(V3(pp.x, 1 + 40 * Math.sin(Math.PI * u), pp.z)); if (k % 4 === 2 && k > 4 && k < 76) hang.push([pp.x, pp.z, 40 * Math.sin(Math.PI * u)]); }
      world.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arch), 120, 0.8, 10, false), railMat));
      const hm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 5), railMat, hang.length);
      hang.forEach(([x, z, h], i) => { m4.compose(V3(x, 1 + h / 2, z), q.identity(), V3(1, h, 1)); hm.setMatrixAt(i, m4); });
      world.add(hm);
    }
    // blob shadows under the cats
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
    E.shadows = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), shadowMat); m.rotation.x = -Math.PI / 2; world.add(m); return m; });
    buildMinimap();
  }
  function placeBikes() {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), off = new THREE.Vector3();
    let n = 0;
    E.bikes.forEach((b, i) => {
      if (bikeTaken[i] || n >= E.bikeCap) return;
      q.setFromAxisAngle(V3(0, 1, 0), -b.a + Math.PI / 2);
      dockBikes.forEach(im => {
        const u = im.userData; off.set(u.px, u.py, u.pz).applyQuaternion(q);
        q2.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), u.rx));
        m4.compose(V3(b.x + off.x, off.y + 0.1, b.z + off.z), q2, V3(1, 1, 1)); im.setMatrixAt(n, m4);
      });
      n++;
    });
    dockBikes.forEach(im => { im.count = n; im.instanceMatrix.needsUpdate = true; });
  }
  function makeLabel(a, b) {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 160; const g = cv.getContext('2d');
    g.fillStyle = 'rgba(29,26,34,.86)'; roundRect(g, 8, 8, 496, 144, 28); g.fill();
    g.strokeStyle = '#ff5a5a'; g.lineWidth = 6; g.stroke();
    g.fillStyle = '#fff6e8'; g.font = '800 60px -apple-system,"PingFang SC",sans-serif'; g.textAlign = 'center'; g.fillText(a + ' · 打卡点', 256, 78);
    g.font = '500 30px -apple-system,"PingFang SC",sans-serif'; g.fillStyle = '#ffcf98'; g.fillText(b, 256, 124);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false })); sp.scale.set(7.2, 2.25, 1); sp.userData.cv = cv; sp.userData.g = g;
    return sp;
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function markStamped(i) {
    const { beam, ring } = stopBeacons[i]; beam.material.color.set(0xffcf6a); beam.material.opacity = 0.14; ring.material.color.set(0xffcf6a);
    const lab = stopLabels[i], g = lab.userData.g, st = TOWN.stops[i];
    g.clearRect(0, 0, 512, 160); g.fillStyle = 'rgba(255,246,232,.92)'; roundRect(g, 8, 8, 496, 144, 28); g.fill(); g.strokeStyle = '#c0392b'; g.lineWidth = 6; g.stroke();
    g.fillStyle = '#c0392b'; g.font = '800 60px -apple-system,"PingFang SC",sans-serif'; g.textAlign = 'center'; g.fillText(st.label + ' · 已打卡', 256, 96);
    lab.material.map.needsUpdate = true;
  }
  function resetStops() {
    TOWN.stops.forEach((st, i) => {
      const { beam, ring } = stopBeacons[i]; beam.material.color.set(0xff5a5a); beam.material.opacity = 0.32; ring.material.color.set(0xff5a5a);
      const lab = makeLabel(st.label, st.name); lab.position.copy(stopLabels[i].position); world.remove(stopLabels[i]); stopLabels[i] = lab; world.add(lab);
    });
  }

  // ---------- minimap: 1 px per 2 m, north up, centred on 小橘 ----------
  let mini = null;
  function buildMinimap() {
    const cv = document.createElement('canvas'), W = Math.ceil(G.W / 2), H = Math.ceil(G.H / 2); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'), im = g.createImageData(W, H), d = im.data;
    const MP = { [S2.ROAD]: [92, 94, 104], [S2.GROUND]: [196, 188, 170], [S2.GREEN]: [126, 168, 104], [S2.WATER]: [70, 118, 158], [S2.BUILDING]: [120, 108, 104], [S2.FOOTBRIDGE]: [255, 226, 160] };
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const v = G.cells[Math.min(G.H - 1, j * 2) * G.W + Math.min(G.W - 1, i * 2)], c = MP[v] || [0, 0, 0], k = (j * W + i) * 4; d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255; }
    g.putImageData(im, 0, 0);
    g.fillStyle = '#2fbfa8'; TOWN.docks.forEach(dk => { g.beginPath(); g.arc((dk.x - G.X0) / 2, (dk.z - G.Z0) / 2, 2.6, 0, Math.PI * 2); g.fill(); });
    mapCanvas = cv;
    mini = $('t-map').getContext('2d');
  }
  function drawMinimap() {
    const c = $('t-map'), dpr = Math.min(2, window.devicePixelRatio || 1), size = c.clientWidth || 140;
    if (c.width !== Math.round(size * dpr)) { c.width = c.height = Math.round(size * dpr); }
    const g = mini, W = c.width, span = 520;                 // metres across
    const k = W / span, cx = (T.x - G.X0) / 2, cz = (T.z - G.Z0) / 2;
    g.save(); g.clearRect(0, 0, W, W);
    g.beginPath(); g.arc(W / 2, W / 2, W / 2 - 1, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#3d5f78'; g.fillRect(0, 0, W, W);
    g.imageSmoothingEnabled = false;
    g.drawImage(mapCanvas, cx - span / 4, cz - span / 4, span / 2, span / 2, 0, 0, W, W);
    const toMap = (x, z) => [W / 2 + (x - T.x) * k, W / 2 + (z - T.z) * k];
    if (route.length > 1) {      // the suggested route, dashed, under the markers
      g.setLineDash([5 * dpr, 4 * dpr]); g.lineWidth = 3 * dpr; g.strokeStyle = '#ff8a3d'; g.beginPath();
      route.forEach(([x, z], k) => { const [px, py] = toMap(x, z); if (k) g.lineTo(px, py); else g.moveTo(px, py); });
      g.stroke(); g.setLineDash([]);
    }
    TOWN.stops.forEach((st, i) => {
      let [x, y] = toMap(st.x, st.z); const r = W / 2 - 12 * dpr, dx = x - W / 2, dy = y - W / 2, L = Math.hypot(dx, dy);
      const out = L > r; if (out) { x = W / 2 + dx / L * r; y = W / 2 + dy / L * r; }
      g.beginPath(); g.arc(x, y, (out ? 5 : 7) * dpr, 0, Math.PI * 2);
      g.fillStyle = T.stamps.includes(i) ? '#ffcf6a' : '#ff5a5a'; g.fill(); g.lineWidth = 2 * dpr; g.strokeStyle = '#fff'; g.stroke();
    });
    if (R) { const [x, y] = toMap(R.x, R.z); g.beginPath(); g.arc(x, y, 5 * dpr, 0, Math.PI * 2); g.fillStyle = '#f4ead8'; g.fill(); g.strokeStyle = '#2b2a2e'; g.lineWidth = 2.5 * dpr; g.stroke(); }
    // 小橘: an arrow pointing the way she faces
    g.translate(W / 2, W / 2); g.rotate(T.h);
    g.beginPath(); g.moveTo(0, -9 * dpr); g.lineTo(6.5 * dpr, 7 * dpr); g.lineTo(0, 3.5 * dpr); g.lineTo(-6.5 * dpr, 7 * dpr); g.closePath();
    g.fillStyle = '#e8892c'; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.5 * dpr; g.stroke();
    g.restore();
    g.beginPath(); g.arc(W / 2, W / 2, W / 2 - 1, 0, Math.PI * 2); g.lineWidth = 2 * dpr; g.strokeStyle = 'rgba(255,246,232,.7)'; g.stroke();
    g.beginPath(); g.arc(W / 2, 10 * dpr, 8 * dpr, 0, Math.PI * 2); g.fillStyle = 'rgba(22,18,30,.85)'; g.fill();
    g.fillStyle = '#fff6e8'; g.font = `700 ${11 * dpr}px -apple-system,sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('北', W / 2, 10.5 * dpr); g.textBaseline = 'alphabetic';
  }

  // ---------- state ----------
  let T = null, R = null, rivalPilot = null, race = true, active = false, ended = false, seed = 1, hintDone = {}, hintNow = null, hintSince = 0;
  let pull = 1, countdown = 0, introT = 0, introSwing = 0, camYaw = 0, camInit = false, stepPhase = 0, rStepPhase = 0, lastStampN = 0, rivalNoted = {}, endTimer = 0;
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  const input = E.input;
  function enter(opts) {
    opts = opts || {};
    build(); loadFrames();
    seed = opts.seed || E.seed(); race = opts.race !== undefined ? opts.race : E.race();
    T = TC.createTown(G, seed); R = race ? TC.createTownRival(G, T) : null;
    rivalPilot = race ? TC.makePilot(G, nav, 'rival', seed + TC.TCFG.rival.seedOffset) : null;
    active = true; ended = false; introT = 0; countdown = COUNT; hintDone = {}; hintNow = null; lastStampN = 0; rivalNoted = {}; camInit = false; camYaw = T.h;
    bikeTaken = []; placeBikes(); resetStops();
    world.visible = true; E.setChapter(2);
    $('t-hud').hidden = false; $('pad').hidden = false; $('t-end').hidden = true; $('t-race').hidden = !race;
    document.body.classList.add('ch2'); padFor(2);
    $('t-ready').hidden = false; $('t-count').textContent = '3'; $('hint').hidden = true;
    const q = new URLSearchParams(location.search); q.set('ch', '2'); q.delete('view'); history.replaceState(null, '', '?' + q.toString());   // a reload stays in chapter 2
  }
  // the start: a card that says what to do, and 3-2-1 before anyone moves (Duet: the clock and 三花姐 used to start at once)
  const COUNT = 3.6;
  function updateCountdown(dt) {
    countdown -= dt;
    const n = Math.ceil(countdown - 0.6);
    $('t-count').textContent = n > 0 ? String(n) : '跑！';
    $('t-ready').classList.toggle('go', n <= 0);
    if (countdown <= 0) { $('t-ready').hidden = true; showHint('start'); }
  }
  // phone layout for chapter 2: steering (← →) and E under the left thumb, ↑ ↓ under the right (Duet: one thumb could not do ↑ and ← → at once)
  function padFor(ch) {
    const pad = $('pad'), dpad = pad.querySelector('.dpad'), keys = E.padKeys;
    let steer = pad.querySelector('.steer');
    if (ch === 2) {
      if (!steer) { steer = document.createElement('div'); steer.className = 'steer'; pad.insertBefore(steer, pad.firstChild); }
      steer.append(keys.act, keys.left, keys.right);
    } else if (steer) {
      dpad.insertBefore(keys.left, keys.down); dpad.insertBefore(keys.right, keys.down.nextSibling); pad.insertBefore(keys.act, dpad); steer.remove();
    }
  }
  function exit() {
    active = false; world.visible = false; $('t-hud').hidden = true; $('t-end').hidden = true; $('t-ready').hidden = true; document.body.classList.remove('ch2'); padFor(1);
    const q = new URLSearchParams(location.search); q.delete('ch'); q.delete('view'); history.replaceState(null, '', q.toString() ? '?' + q.toString() : location.pathname);
  }

  const hints = {
    start: '按住 <b>↑</b> 跑，<b>← →</b> 转弯。打卡点是小地图上的红点、街上的红光柱',
    dock: '这是共享单车点：按 <b>E</b> 扫一辆，路上快很多',
    ride: '骑车松手会溜、转弯要早；按 <b>E</b> 随时锁车',
    nobike: '海心桥不让骑车：按 <b>E</b> 锁车，走过去',
    stop: '跑进红圈就盖章'
  };
  function showHint(id) { if (hintDone[id] || hintNow === id) return; hintNow = id; hintSince = T.time; const el = $('hint'); el.innerHTML = hints[id]; el.hidden = false; }
  function clearHint(id) { hintDone[id] = true; if (hintNow === id) { hintNow = null; $('hint').hidden = true; } }
  function note(text) { hintNow = 'note'; hintSince = T.time; const el = $('hint'); el.innerHTML = text; el.hidden = false; }

  // ---------- per frame ----------
  function tick(dt) {
    if (!active) return;
    if (countdown > 0) { E.takeAct(); updateCountdown(dt); }
    else if (!ended) {
      const inp = { up: input.up, down: input.down, left: input.left, right: input.right, act: E.takeAct() };
      TC.stepTown(G, T, inp, dt);
      if (R) { if (R.holdT > 0) R.holdT -= dt; else if (!R.done) TC.stepTown(G, R, rivalPilot(R), dt); else R.time += dt; }   // holdT: check hook only
      handleEvents();
    }
    placeCats(dt); updateCamera(dt); updateHUD(); drawMinimap(); hintLogic();
    stopLabels.forEach((lab, i) => { const st = TOWN.stops[i], d = Math.hypot(st.x - T.x, st.z - T.z); lab.material.opacity = clamp((d - 10) / 12, 0, 1); lab.visible = lab.material.opacity > 0.02; });
    E.setCatPos(E.catPosVec.set(T.x, 1, T.z));
    if (ended) { endTimer += dt; }
  }
  function handleEvents() {
    while (T.events.length) {
      const e = T.events.shift();
      if (e.type === 'scan') { const dk = TC.nearDock(G, T); if (dk) { const i = E.bikes.findIndex((b, k) => !bikeTaken[k] && TOWN.docks[b.di] === dk); if (i >= 0) { bikeTaken[i] = true; placeBikes(); } } clearHint('dock'); }
      if (e.type === 'ride') { E.flash('ok'); showHint('ride'); }
      if (e.type === 'walk' && E.bikes.length < E.bikeCap) { E.bikes.push({ di: -1, x: T.x + Math.cos(T.h) * 1.1, z: T.z + Math.sin(T.h) * 1.1, a: T.h + Math.PI / 2 }); placeBikes(); }   // the bike she locks stays where she left it
      if (e.type === 'walk') { if (hintNow === 'ride') clearHint('ride'); if (hintNow === 'nobike') clearHint('nobike'); }   // only retire a hint that was actually shown
      if (e.type === 'no-bike') showHint('nobike');
      if (e.type === 'bump') E.shake(T.riding ? 0.35 : 0.18);
      if (e.type === 'stamp') { E.flash('ok'); markStamped(e.stop); clearHint('stop'); if (hintNow === 'start') clearHint('start'); note(`盖章 · ${TOWN.stops[e.stop].label}（${e.n}/3）`); }
      if (e.type === 'done') finish();
    }
    if (!R) return;
    while (R.events.length) {
      const e = R.events.shift();
      if (e.type === 'stamp' && (hintNow === null || hintNow === 'note')) note(`三花姐在${TOWN.stops[e.stop].label}盖了章（${e.n}/3）`);
      if (e.type === 'done' && !T.done) note('三花姐三处都打完了！');
    }
    if (R.posing && !rivalNoted['pose' + R.stamps.length] && Math.hypot(R.x - T.x, R.z - T.z) < 80) { rivalNoted['pose' + R.stamps.length] = true; if (hintNow === null) note('三花姐停下来自拍了'); }
  }
  function hintLogic() {
    if (hintNow === 'start' && (T.time > 9 || T.dist > 40)) clearHint('start');
    if (!hintDone.dock && TC.actionAt(G, T) === 'scan' && hintNow !== 'nobike') showHint('dock');
    if (hintNow === 'dock' && !TC.nearDock(G, T)) { hintNow = null; $('hint').hidden = true; }
    if (hintNow === 'ride' && T.time - hintSince > 6) clearHint('ride');
    if (!hintDone.stop && T.stamps.length === 0 && TOWN.stops.some(s => Math.hypot(s.x - T.x, s.z - T.z) < 40) && hintNow === null) showHint('stop');
    if (hintNow === 'note' && T.time - hintSince > 4) { hintNow = null; $('hint').hidden = true; }
  }
  const fwdV = h => V3(Math.sin(h), 0, -Math.cos(h));
  const smoothT = t => t * t * (3 - 2 * t);
  function updateCamera(dt) {
    // the camera swings round behind her heading; distance and height ease between running and riding
    // opening shot: from in front of her, the tower behind her; it swings round behind her over 3 s, or at once when she moves
    introT += dt; if (T.dist > 2 || Math.abs(T.speed) > 0.5) introT = Math.max(introT, 3);
    const swing = introT < 3 ? Math.PI * (1 - smoothT(clamp((introT - 0.8) / 2.2, 0, 1))) : 0;
    introSwing = swing;
    const want = T.h + swing;
    if (!camInit) { camYaw = want; }
    camYaw += TC.wrapAngle(want - camYaw) * Math.min(1, dt * (swing > 0.01 ? 30 : T.riding ? 3.2 : 4.5));
    const sw = swing / Math.PI, dist = (T.riding ? 7.5 : 6.5) + 6 * sw, h = 2.6 - 1.1 * sw;
    const f = fwdV(camYaw), target = V3(T.x, 0, T.z).addScaledVector(f, -dist).add(V3(0, h, 0));
    // keep the camera out of buildings: pull it in along the line to her if the spot is inside a block
    // a block between her and the camera: bring the camera in front of it and lift it a little (Duet: stuck to a wall after the 西塔 stamp)
    let keep = 1;
    for (let k = 1; k <= 16; k++) {
      const u = k / 16, x = lerp(T.x, target.x, u), z = lerp(T.z, target.z, u);
      if (TC.surf(G, x, z) === S2.BUILDING) { keep = Math.max(0.4, (k - 1.5) / 16); target.set(lerp(T.x, target.x, keep), h + (1 - keep) * 1.6, lerp(T.z, target.z, keep)); break; }
    }
    pull = lerp(pull, keep, Math.min(1, dt * 6));
    if (!camInit) { camPos.copy(target); camInit = true; } else camPos.lerp(target, 1 - Math.pow(0.0005, dt));
    camLook.set(T.x, 1.0, T.z).addScaledVector(f, 4 * pull);     // pulled in against a wall: look at her, not past her
    if (swing > 0.01) camLook.y += 7 * sw;      // tilt up a little at first so the tower rises behind her
    camera.position.copy(camPos); E.applyShake(camera); camera.lookAt(camLook);
    E.camFillAt(camera.position, V3(T.x, 1, T.z));
  }
  // facing on screen: compare the cat's heading with the camera's
  function facing(h) {
    const f = fwdV(h), cf = V3(camLook.x - camPos.x, 0, camLook.z - camPos.z).normalize(), cr = V3(-cf.z, 0, cf.x);
    const a = f.dot(cf), b = f.dot(cr);
    if (a > 0.55) return 'Back'; if (a < -0.55) return 'Front'; return b > 0 ? 'Right' : 'Left';
  }
  function billboard(group) { group.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(camera.position.clone().setY(group.position.y), group.position, V3(0, 1, 0))); }
  function placeCats(dt) {
    const cat = E.cat, rv = E.rival;
    cat.visible = true; cat.scale.setScalar(XJ_SCALE);
    cat.position.set(T.x, 3.0 * XJ_SCALE / 2 + 0.05, T.z); billboard(cat);
    stepPhase += Math.abs(T.speed) * dt;
    let name;
    if (T.done) name = 'win';
    else if (T.mode === 'stamp') name = 'cheer';
    else if (T.mode === 'scan') name = 'scan';
    else if (T.riding) name = Math.abs(T.speed) < 0.4 ? 'rideStop' : 'ride' + 'ABC'[Math.floor(stepPhase / 1.6) % 3];
    else if (Math.abs(T.speed) < 0.4 && introSwing > Math.PI / 2) name = 'cheer';    // opening shot, camera in front: she holds up the 488 m postcard
    else name = Math.abs(T.speed) < 0.4 ? 'stand' : 'run' + 'ABCD'[Math.floor(stepPhase / 0.85) % 4];
    E.setFrame(E.catMat, E.catSprite, 'town-' + name, 1);
    E.catSprite.position.set(0, 0, 0);
    E.catSprite.rotation.z = T.riding && !T.done ? clamp((input.left ? -1 : input.right ? 1 : 0) * Math.min(1, T.speed / 10) * 0.09, -0.1, 0.1) * -1 : 0;
    E.shadows[0].position.set(T.x, 0.13, T.z); E.shadows[0].scale.setScalar(T.riding ? 1.3 : 1);
    rv.visible = !!R;
    E.shadows[1].visible = !!R;
    if (!R) return;
    rv.scale.setScalar(SH_SCALE);
    rv.position.set(R.x, 3.5 * SH_SCALE / 2 + 0.05, R.z); billboard(rv);
    rStepPhase += Math.abs(R.speed) * dt;
    let rn;
    if (R.done) rn = 'win';
    else if (R.posing || R.mode === 'stamp') rn = 'selfie';
    else if (R.mode === 'scan') rn = 'scan';
    else if (Math.abs(R.speed) < 0.4) rn = 'stand';
    else { const fc = facing(R.h); rn = (R.riding ? 'ride' : 'run') + fc + ((Math.floor(rStepPhase / (R.riding ? 1.6 : 0.9)) % 2) ? 'B' : 'A'); }
    E.setFrame(E.rivalMat, E.rivalSprite, 'sanhua-town-' + rn, 1);
    E.rivalSprite.rotation.z = 0;
    E.shadows[1].position.set(R.x, 0.12, R.z); E.shadows[1].scale.setScalar(R.riding ? 1.3 : 1.05);
    E.rivalFrame = rn;
  }
  const fmt = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  function nextTarget() { return TC.nextStop(G, nav, T); }
  // the route to the suggested stop, traced down its path field from where she stands (refreshed 4x a second)
  let route = [], routeAt = -1, routeStop = -1, routeLen = 0, steerPt = null;
  function updateRoute(nt) {
    if (nt < 0) { route = []; steerPt = null; return; }
    if (T.time - routeAt < 0.25 && routeStop === nt && routeAt <= T.time) return;
    routeAt = T.time; routeStop = nt;
    const layer = T.riding ? 1 : 0;
    route = TC.tracePath(G, nav, nt, T.x, T.z, layer, 900);
    routeLen = 0; for (let k = 1; k < route.length; k++) routeLen += Math.hypot(route[k][0] - route[k - 1][0], route[k][1] - route[k - 1][1]);
    steerPt = TC.lookahead(G, nav, nt, T.x, T.z, layer, 40);
  }
  function updateHUD() {
    const list = $('t-stops');
    TOWN.stops.forEach((st, i) => { const li = list.children[i]; li.classList.toggle('done', T.stamps.includes(i)); });
    const nt = nextTarget();
    updateRoute(nt);
    if (nt >= 0) {
      const st = TOWN.stops[nt], p = steerPt || st, dx = p.x - T.x, dz = p.z - T.z;
      $('t-next').innerHTML = `${T.stamps.length ? '再去' : '先去'} <b>${st.label}</b> <span>路程约 ${Math.max(0, Math.round(routeLen / 10) * 10)} 米</span>`;
      const ang = Math.atan2(dx, -dz) - camYaw;     // points at the next stretch of the route, not straight at the stop
      $('t-arrow').style.transform = `rotate(${ang}rad)`;
    } else $('t-next').innerHTML = '三处都打完了';
    $('t-time').textContent = fmt(T.done ? T.doneAt : T.time);
    const sv = TC.surf(G, T.x, T.z);
    $('t-mode').textContent = T.mode === 'scan' ? '扫码中…' : T.mode === 'lock' ? '锁车中…' : T.riding ? (sv === S2.ROAD ? '骑车 · 路上快' : sv === S2.GREEN ? '骑车 · 草地很慢' : '骑车 · 广场慢一点') : sv === S2.GREEN ? '跑步 · 草地' : '跑步';
    $('t-mode').classList.toggle('slow', T.riding && sv !== S2.ROAD);
    $('t-mode').classList.toggle('riding', T.riding);
    const act = TC.actionAt(G, T), actKey = E.padKeys.act;
    actKey.querySelector('b').textContent = act === 'lock' ? '锁车' : '扫车';
    actKey.classList.toggle('ready', !!act);
    actKey.setAttribute('aria-disabled', act ? 'false' : 'true');
    if (R) {
      const d = Math.round(Math.hypot(R.x - T.x, R.z - T.z)), ahead = R.stamps.length > T.stamps.length || (R.stamps.length === T.stamps.length && R.done);
      $('t-race').querySelector('span').innerHTML = R.done ? '三花姐 <b>已打完</b>' : `三花姐 <b>${R.stamps.length}/3</b> · ${R.posing ? '在自拍' : R.riding ? '骑车中' : '跑着'} · 离你 ${d} 米`;
      $('t-race').classList.toggle('ahead', ahead);
    }
  }
  function finish() {
    ended = true; endTimer = 0;
    const res = R ? TC.townResult(T, R) : null;
    $('t-verdict').hidden = !res;
    if (res) $('t-verdict').textContent = res.won ? (res.margin === null ? `赢了！三花姐才打了 ${res.rivalStamps} 处` : `赢了！比三花姐早 ${res.margin < 60 ? res.margin.toFixed(1) + ' 秒' : fmt(res.margin)}`) : `三花姐先打完，早你 ${res.margin < 60 ? res.margin.toFixed(1) + ' 秒' : fmt(res.margin)}`;
    $('t-e-time').textContent = fmt(T.doneAt); $('t-e-bike').textContent = Math.round(T.bikeDist); $('t-e-run').textContent = Math.round(T.dist - T.bikeDist);
    $('t-e-order').textContent = T.stamps.map(i => TOWN.stops[i].label).join(' → ');
    makeCard(res);
    $('hint').hidden = true; $('pad').hidden = true;
    setTimeout(() => { if (ended && active) { $('t-end').hidden = false; $('t-hud').hidden = true; } }, 1800);
  }
  // the stamp card: three red seals in the order you reached them
  let cardUrl = null;
  function makeCard(res) {
    const cv = document.createElement('canvas'), W = 1200, H = 800; cv.width = W; cv.height = H; const g = cv.getContext('2d');
    g.fillStyle = '#fffaf0'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#e8d9bd'; g.lineWidth = 3; g.strokeRect(24, 24, W - 48, H - 48);
    g.fillStyle = '#1d1a22'; g.font = '800 52px -apple-system,"PingFang SC",sans-serif'; g.fillText('下塔进城 · 打卡明信片', 70, 112);
    g.font = '500 26px -apple-system,"PingFang SC",sans-serif'; g.fillStyle = '#5a5060';
    g.fillText('广州塔 → 海心桥 → 海心沙 · 西塔 · 东塔（OpenStreetMap 真实街区）', 70, 178);
    T.stamps.forEach((si, k) => {
      const cx = 230 + k * 370, cy = 400, st = TOWN.stops[si];
      g.save(); g.translate(cx, cy); g.rotate((k - 1) * 0.12);
      g.strokeStyle = '#c0392b'; g.lineWidth = 10; g.beginPath(); g.arc(0, 0, 130, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 112, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#c0392b'; g.textAlign = 'center'; g.font = '800 64px -apple-system,"PingFang SC",sans-serif'; g.fillText(st.label, 0, 10);
      g.font = '600 22px -apple-system,"PingFang SC",sans-serif'; g.fillText(st.name.length > 9 ? st.name.slice(0, 9) + '…' : st.name, 0, 52);
      g.font = '700 20px -apple-system,sans-serif'; g.fillText('No.' + (k + 1), 0, -56);
      g.restore();
    });
    g.textAlign = 'left'; g.fillStyle = '#1d1a22'; g.font = '700 30px -apple-system,"PingFang SC",sans-serif';
    const day = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '.');
    const line = (res ? (res.won ? (res.margin === null ? '比三花姐先打完' : `比三花姐早 ${Math.round(res.margin)} 秒`) : res.margin < 10 ? '三花姐先打完一步' : `三花姐先打完，早 ${fmt(res.margin)}`) + ' · ' : '') + `用时 ${fmt(T.doneAt)} · 骑车 ${Math.round(T.bikeDist)} 米 · ${day}`;
    g.fillText(line, 70, 650);
    g.font = '500 22px -apple-system,"PingFang SC",sans-serif'; g.fillStyle = '#5a5060'; g.fillText('我的AI小木屋 · 地图 © OpenStreetMap contributors', 70, 700);
    cardUrl = cv.toDataURL('image/png'); $('t-card').src = cardUrl; $('t-save').href = cardUrl;
  }

  // ---------- fixed views for checks: real autopilot pushed forward, never hand-placed ----------
  function autoplay(until, maxS) {
    const pilot = TC.makePilot(G, nav, 'precise', seed);
    while (!until() && T.time < (maxS || 600)) {
      TC.stepTown(G, T, pilot(T), 1 / 30);
      if (R && !R.done) TC.stepTown(G, R, rivalPilot(R), 1 / 30);
      handleEvents();
    }
  }
  function applyView(v) {
    if (v === 'start') return 'start';
    countdown = 0; $('t-ready').hidden = true;
    if (v === 'ride') { let rode = 0; autoplay(() => { if (T.riding && T.speed > 12 && TC.surf(G, T.x, T.z) === S2.ROAD) rode++; return rode > 30; }); return T.riding ? 'ride' : 'ride-failed'; }
    if (v === 'stop') { autoplay(() => T.stamps.length >= 1 && T.mode !== 'stamp'); T.time += 0; return T.stamps.length ? 'stop' : 'stop-failed'; }
    if (v === 'bridge') { autoplay(() => TC.surf(G, T.x, T.z) === S2.FOOTBRIDGE && T.z < -250); return TC.surf(G, T.x, T.z) === S2.FOOTBRIDGE ? 'bridge' : 'bridge-failed'; }
    if (v === 'end') { autoplay(() => T.done); return T.done ? 'end' : 'end-failed'; }
    return null;
  }

  const API = {
    enter, exit, tick, applyView,
    active: () => active,
    snapshot: () => T ? ({ chapter: 2, x: +T.x.toFixed(2), z: +T.z.toFixed(2), h: +T.h.toFixed(3), speed: +T.speed.toFixed(2), riding: T.riding, mode: T.mode, stamps: T.stamps.slice(), done: T.done, time: +T.time.toFixed(2), ended,
      action: TC.actionAt(G, T), hint: hintNow, rival: R ? { x: +R.x.toFixed(1), z: +R.z.toFixed(1), stamps: R.stamps.slice(), riding: R.riding, posing: !!R.posing, done: R.done, frame: E.rivalFrame } : null, frame: E.catMat.map && E.catMat.map.userData.name,
      camYaw: +camYaw.toFixed(3), bumps: T.bumps, hits: T.hits || 0, trees: E.townStats.trees }) : { chapter: 2, ready: false },
    teleport: (x, z, h) => { T.x = x; T.z = z; if (h !== undefined) T.h = h; T.speed = 0; camInit = false; },
    jump: (stopIdx) => { const st = TOWN.stops[stopIdx]; T.x = st.x; T.z = st.z + TC.TCFG.stopReach + 2; T.h = 0; T.speed = 0; camInit = false; },
    rivalAt: (dx, dz, h, speed, holdT) => { if (!R) return; R.x = T.x + dx; R.z = T.z + dz; if (h !== undefined) R.h = h; R.speed = speed || 0; R.holdT = holdT || 0; R.posing = false; },
    stampAll: () => { for (let i = 0; i < 3; i++) if (!T.stamps.includes(i)) { const st = TOWN.stops[i]; T.x = st.x; T.z = st.z; TC.stepTown(G, T, {}, 1 / 30); while (T.mode === 'stamp') TC.stepTown(G, T, {}, 1 / 30); handleEvents(); } },
    docks: () => TOWN.docks.slice(), stops: () => TOWN.stops.slice(),
    surf: (x, z) => TC.surf(G, x, z), blocked: (x, z, r) => TC.blockedAt(G, x, z, r),
    rivalFinish: t => { if (R) { R.done = true; R.doneAt = t; R.stamps = [0, 1, 2]; } },
    skipCountdown: () => { countdown = 0; $('t-ready').hidden = true; },
    countdown: () => countdown,
    route: () => ({ len: routeLen, pts: route.length, steer: steerPt }),
    calmRival: () => { if (R) { R.x = TOWN.start.x - 300; R.z = TOWN.start.z + 100; } },
    result: () => (T && R ? TC.townResult(T, R) : null)
  };
  window.XJT_TOWNVIEW = API;
  $('t-again').addEventListener('click', () => enter({ seed: E.seed() + 1 }));
  $('t-tower').addEventListener('click', () => { exit(); E.backToTower(); });
})();
// direct entry for checks and links: ?ch=2 (with &view=start|ride|bridge|stop|end for the fixed views)
(function () {
  const Q = new URLSearchParams(location.search);
  if (Q.get('ch') !== '2' || !window.XJT_TOWNVIEW) return;
  const V = window.XJT_TOWNVIEW;
  document.getElementById('intro').hidden = true;
  V.enter({ seed: +Q.get('seed') || 1, race: Q.get('race') !== '0' });
  window.__townView = Q.get('view') ? V.applyView(Q.get('view')) : 'play';
})();
