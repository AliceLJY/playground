// 九个场景，每场一个满屏的三维世界。update(beat, t) 只依赖「第几拍、这一拍过了几秒」，同一时刻画出来一定一样。
// 返回 { labels }：要钉在三维物体上的小字（数字长在物体上，不贴在屏幕角落）。
import * as THREE from 'three';
import { C, rnd, WG, PN, panelH, FONT } from './shell.js';
import { Page, Card, HEADER, HEADER_EDITED } from './page.js';
import { cursor, selection, caret, typed, retype, stamp, strike, bubble, path, AI, AI_INK, clamp, ease, easeOut, seg, wrap } from './draw.js';

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const lerp = (a, b, k) => a + (b - a) * k;
const tex = cv => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
const fmt = n => Math.round(n).toLocaleString('en-US');

// 正对镜头、刚好铺满屏幕的平面：高 1，宽 = 宽高比，镜头在 z = DIST
export const FLAT_FOV = 30, DIST = .5 / Math.tan(FLAT_FOV / 2 * Math.PI / 180);
function flatCam(aspect) { const c = new THREE.PerspectiveCamera(FLAT_FOV, aspect, .01, 200); c.position.set(0, 0, DIST); c.lookAt(0, 0, 0); return c; }

// 星空（深色世界共用）
function stars(n, R, seed, color = '#C9D6FF', size = 1.6) {
  const r = rnd(seed), p = [];
  for (let i = 0; i < n; i++) { const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u); p.push(Math.cos(a) * s * R, u * R, Math.sin(a) * s * R); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ color, size, sizeAttenuation: false, transparent: true, opacity: .8, depthWrite: false }));
}

// =====================================================================
// 外壳：平平无奇的验证页。开场、它自己来点（带着前面所有的伤）、收尾（原样）都用它。
// =====================================================================
function shellWorld(variant) {
  const scene = new THREE.Scene(), page = new Page(), map = tex(page.cv);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map, toneMapped: false }));
  scene.add(plane); scene.background = new THREE.Color('#05060A');
  const w = { scene, camera: flatCam(16 / 9), ink: 'dark', page, plane, hidePanel: false };
  w.resize = a => { w.camera.aspect = a; w.camera.updateProjectionMatrix(); page.resize(a); map.dispose(); map.image = page.cv; plane.material.map = w.map = tex(page.cv); plane.scale.set(a, 1, 1); };
  w.map = map;
  // 逻辑坐标 → 页面平面上的三维点（给碎片、标签用）
  w.toWorld = (x, y) => v3((x / page.LW - .5) * page.aspect, .5 - y / page.LH, 0);

  if (variant === 'open') {
    w.update = (b, t) => {
      const g = page.geo, o = { t, widget: {} };
      if (b === 1) {
        const sel = seg(t, .5, .9), r = retype(HEADER, HEADER_EDITED, t, 1.2);
        o.header = r.s; o.headerSel = t < 1.15 ? sel : 0; o.caretOn = t > 1.1; o.caretSolid = r.busy;
        // 它的光标从右边进来，停在那行字后面
        const k = seg(t, 0, 1.0); const p = path([page.LW + 40, g.head[1] + 140], [g.head[0] + 520, g.head[1] + 20], k);
        o.cur = { x: p[0], y: p[1], who: 'ai', alpha: 1 - seg(t, 4.6, 5.2) };
      }
      if (b === 2) {
        o.header = HEADER_EDITED;
        o.widget = { spin: t };
        if (!w.hidePanel) o.panel = { mode: 'text', k: seg(t, .7, 1.3), o: { prompt: ['第一题', '认出这个词', ''], wob: 1 } };
      }
      page.draw(o); w.map.needsUpdate = true;
      return {};
    };
  }
  if (variant === 'click') {   // 前面每一场留下的伤都在：章、接缝、裂纹、被借走的标签、歪掉的框
    w.update = (b, t) => {
      const g = page.geo, o = { t, header: HEADER_EDITED, stamp99: true, tilt: -.026 };
      o.widget = { label: 0, hollow: 1, seams: 1, crack: 1, warp: 0 };
      if (b === 0) {
        const p = path([page.LW + 60, g.box[1] - 260], [g.box[0] + 6, g.box[1] + 6], easeOut(seg(t, .6, 1.7)));
        o.cur = { x: p[0], y: p[1], who: 'ai', alpha: 1 };
        o.tip = { x: g.box[0] - 30, y: g.wy + WG.h + 36, text: typed('这一步，是为了证明我不是机器人。', t, 2.0, 7), alpha: seg(t, 1.9, 2.1) };
      } else {
        o.cur = { x: g.box[0] + 6, y: g.box[1] + 6, who: 'ai', alpha: 1 - seg(t, .9, 1.1) };
        o.tip = { x: g.box[0] - 30, y: g.wy + WG.h + 36, text: '这一步，是为了证明我不是机器人。', alpha: 1 - seg(t, .5, .9) };
        o.widget.checked = seg(t, .25, .65); o.widget.aiCheck = true;
      }
      if (!w.frozen) { page.draw(o); w.map.needsUpdate = true; }
      return {};
    };
  }
  if (variant === 'close') {   // 收尾：原样，只多一处
    w.update = (b, t) => {
      const g = page.geo, o = { t, widget: {} };
      if (b === 1) {
        const k = seg(t, .4, 3.4), p = path([page.LW * .86, page.LH * .92], [g.box[0] + 6, g.box[1] + 6], k, 34, 60);
        o.cur = { x: p[0], y: p[1], who: 'me', alpha: 1 };
        o.widget = { checked: seg(t, 3.45, 3.95), aiCheck: true };
      }
      page.draw(o); w.map.needsUpdate = true; return {};
    };
  }
  if (variant === 'plain') { w.update = () => { page.c.setTransform(1, 0, 0, 1, 0, 0); page.c.fillStyle = '#F6F6F3'; page.c.fillRect(0, 0, page.cv.width, page.cv.height); w.map.needsUpdate = true; return {}; }; w.ink = 'dark'; }
  return w;
}

// =====================================================================
// 第一题·认字：题卡立在一本旧书上；它答完，书一本本摞上去，摞到广州塔边上。
// =====================================================================
function wordWorld() {
  const W = { ink: 'light' }, S = new THREE.Scene(), cam = new THREE.PerspectiveCamera(42, 16 / 9, .02, 8000);
  S.background = new THREE.Color('#1B2540'); S.fog = new THREE.Fog('#2A3352', 500, 3200);
  S.add(new THREE.HemisphereLight('#B9C8FF', '#3A2E2A', 1.3));
  const sun = new THREE.DirectionalLight('#FFD9A8', 2.4); sun.position.set(-3, 5, 4); S.add(sun);
  S.add(new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 p; void main(){ p = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: 'varying vec3 p; void main(){ float h = normalize(p).y; vec3 c = mix(vec3(.95,.58,.40), vec3(.10,.14,.30), smoothstep(-.02,.35,h)); c = mix(c, vec3(.05,.06,.10), smoothstep(0.,-.2,h)); gl_FragColor = vec4(c,1.); }' })));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), new THREE.MeshStandardMaterial({ color: '#15171C', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; S.add(ground);
  { const r = rnd(2), pts = []; for (let i = 0; i < 9000; i++) { const a = r() * Math.PI * 2, d = 250 + Math.pow(r(), .6) * 2600; pts.push(Math.cos(a) * d, .5, Math.sin(a) * d - 200); }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    S.add(new THREE.Points(pg, new THREE.PointsMaterial({ color: '#FFC77A', size: 2.2, sizeAttenuation: false, transparent: true, opacity: .8 }))); }
  // 书：17,600 本，每本 3 厘米（厚度示意，本数出自 Science 2008）
  const N = 17600, TH = .03;
  const books = new THREE.InstancedMesh(new THREE.BoxGeometry(.24, TH * .96, .17), new THREE.MeshStandardMaterial({ roughness: .8 }), N);
  { const d = new THREE.Object3D(), col = new THREE.Color(), rb = rnd(8), pal = ['#7A2E26', '#2F4A3A', '#2C3D5E', '#8C6A3C', '#5A3A52', '#3E3A36', '#A2532E', '#6C7A52', '#D8C9A3'];
    for (let i = 0; i < N; i++) { d.position.set((rb() - .5) * .02, TH * (i + .5), (rb() - .5) * .02); d.rotation.set(0, (rb() - .5) * .35, 0); const s = .85 + rb() * .3; d.scale.set(s, 1, .9 + rb() * .2); d.updateMatrix(); books.setMatrixAt(i, d.matrix); books.setColorAt(i, col.set(pal[Math.floor(rb() * pal.length)])); } }
  books.count = 1; S.add(books);
  // 远景里书堆细得看不见：沿书堆画一道光，只在拉远时出现
  const beamG = new THREE.BufferGeometry(); beamG.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0], 3));
  const beam = new THREE.LineSegments(beamG, new THREE.LineBasicMaterial({ color: '#FFE2A8', transparent: true, toneMapped: false })); S.add(beam);
  // 广州塔：扭转的双曲面线框，主塔约 454 米、加天线约 600 米（体量近似）
  { const tw = new THREE.Group(), lines = [], NN = 30, sg = 40;
    const ell = y => { const t = y / 454, a = lerp(40, 23, t) - 18 * Math.sin(Math.PI * t) * .9, b = lerp(30, 19, t) - 12 * Math.sin(Math.PI * t) * .9; return [a, b]; };
    for (const dir of [1, -1]) for (let i = 0; i < NN; i++) for (let j = 0; j < sg; j++) { const p = y => { const [a, b] = ell(y), ang = i / NN * Math.PI * 2 + dir * (y / 454) * Math.PI * .75; return [Math.cos(ang) * a, y, Math.sin(ang) * b]; }; lines.push(...p(454 * j / sg), ...p(454 * (j + 1) / sg)); }
    for (let j = 0; j <= 46; j++) { const y = j * 454 / 46, [a, b] = ell(y); for (let i = 0; i < 48; i++) { const a0 = i / 48 * Math.PI * 2, a1 = (i + 1) / 48 * Math.PI * 2; lines.push(Math.cos(a0) * a, y, Math.sin(a0) * b, Math.cos(a1) * a, y, Math.sin(a1) * b); } }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    tw.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#FF6FB5', transparent: true, opacity: .85 })));
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(.8, 3.5, 146, 8), new THREE.MeshBasicMaterial({ color: '#FFB0D6' })); ant.position.y = 454 + 73; tw.add(ant);
    tw.position.set(190, 0, -330); S.add(tw); }
  // 题卡
  const card = new Card('text'), cmap = tex(card.cv), CW = .22, CH = CW * card.cv.height / card.cv.width;
  const cm = new THREE.Mesh(new THREE.PlaneGeometry(CW, CH), new THREE.MeshBasicMaterial({ map: cmap, transparent: true, toneMapped: false, side: THREE.DoubleSide }));
  S.add(cm);
  const toCard = (x, y) => [x, y];   // 光标直接按面板坐标画
  W.scene = S; W.camera = cam;
  W.resize = a => { cam.aspect = a; cam.updateProjectionMatrix(); W.port = a < 1; };
  W.update = (b, t) => {
    // 题卡上的事
    const inp = card.input, ver = card.verify, o = { t, panel: { prompt: ['第一题', '认出这个词', ''], wob: 1 } };
    if (b === 0) {
      const k1 = seg(t, 3.2, 3.9), k2 = seg(t, 4.6, 5.0);
      const p = k2 > 0 ? path(inp, ver, k2) : path([PN.w + 120, inp[1] - 330], inp, k1);
      o.cur = { x: p[0], y: p[1], who: 'ai', alpha: seg(t, 3.1, 3.3) };
      o.inputFocus = t > 3.95; o.typed = typed('overlooks', t, 4.0, 22); o.ok = seg(t, 5.05, 5.3) * (1 - seg(t, 5.6, 6.2));
    } else { o.typed = 'overlooks'; o.stamp = b === 1 ? seg(t, .2, .9) : 1; o.cur = { x: ver[0], y: ver[1], who: 'ai', alpha: b === 1 ? 1 - seg(t, 1.2, 1.6) : 0 }; }
    card.draw(o); cmap.needsUpdate = true;
    // 书堆和镜头
    let n = 1, lie = 0, pull = 0;
    if (b === 2) { lie = ease(seg(t, 0, 1.1)); const g = seg(t, 1.2, 6.2); n = Math.max(1, Math.round(1 + (N - 1) * (g * g * g * .55 + g * .45 * g))); pull = ease(seg(t, 6.0, 9.0)); }
    books.count = n; const top = n * TH;
    beam.scale.set(1, top, 1); beam.visible = pull > .2; beam.material.opacity = seg(pull, .2, .6);
    cm.position.set(0, top + lerp(CH / 2 + .002, .003, lie), lerp(0, 0, lie)); cm.rotation.set(-Math.PI / 2 * lie, 0, 0);
    const port = W.port ? 1.75 : 1;
    if (b < 2) {   // 题卡竖着，正对镜头
      const push = b === 1 ? ease(seg(t, 0, 1.2)) * .03 : 0;
      const ox = W.port ? 0 : -.085, oy = W.port ? -.05 : .018;
      cam.position.set(ox + Math.sin(t * .35) * .006, CH / 2 + TH + oy, (.42 - push) * port); cam.lookAt(ox, CH / 2 + TH + oy, 0);
    } else {
      const fpos = v3(.32 + top * .55, top * .82 + .28, .42 + top * 1.05), ftar = v3(0, top * .9, 0);
      const wpos = v3(560, 200, 1400 * port), wtar = v3(95, 320, -165);
      const ox = W.port ? 0 : -.085, oy = W.port ? -.05 : .018, close = v3(ox, CH / 2 + TH + oy, (.42 - .03) * port);
      const k0 = ease(seg(t, 0, 1.1));
      const p = new THREE.Vector3().lerpVectors(close, fpos, k0), q = new THREE.Vector3().lerpVectors(v3(ox, CH / 2 + TH + oy, 0), ftar, k0);
      cam.position.lerpVectors(p, wpos, pull); cam.lookAt(new THREE.Vector3().lerpVectors(q, wtar, pull));
    }
    const labels = [];
    if (b === 2 && t > 1.3) labels.push({ p: v3(.16, top + .02, 0), text: fmt(n) + ' 本', cls: 'num' });
    if (b === 2 && pull > .55) labels.push({ p: v3(190, 610, -330), text: '广州塔', cls: 'tag', alpha: seg(pull, .55, .9) });
    return { labels };
  };
  return W;
}

// =====================================================================
// 第二题·认图：九宫格变成路牌，镜头沿街往里走，门牌一块块亮起来。
// =====================================================================
function gridWorld() {
  const W = { ink: 'light' }, S = new THREE.Scene(), cam = new THREE.PerspectiveCamera(50, 16 / 9, .05, 20000), NB = 160;
  S.background = new THREE.Color('#0B1020'); S.fog = new THREE.FogExp2('#0B1020', .0016);
  S.add(new THREE.HemisphereLight('#5B6E9E', '#1A1410', .9));
  const road = new THREE.Mesh(new THREE.PlaneGeometry(14, 3400), new THREE.MeshStandardMaterial({ color: '#2A2D33', roughness: .9 })); road.rotation.x = -Math.PI / 2; road.position.z = -1680; S.add(road);
  const walk = new THREE.Mesh(new THREE.PlaneGeometry(44, 3400), new THREE.MeshStandardMaterial({ color: '#3A3832', roughness: 1 })); walk.rotation.x = -Math.PI / 2; walk.position.set(0, -.02, -1680); S.add(walk);
  const d = new THREE.Object3D();
  { const dash = new THREE.InstancedMesh(new THREE.PlaneGeometry(.25, 3), new THREE.MeshBasicMaterial({ color: '#C9C2A8' }), 450);
    for (let i = 0; i < 450; i++) { d.position.set(0, .01, -i * 7.5); d.rotation.set(-Math.PI / 2, 0, 0); d.updateMatrix(); dash.setMatrixAt(i, d.matrix); } S.add(dash); }
  const tc = document.createElement('canvas'); tc.width = 128; tc.height = 256; { const t = tc.getContext('2d'), r0 = rnd(3); t.fillStyle = '#3B3F4A'; t.fillRect(0, 0, 128, 256); for (let y = 10; y < 240; y += 26) for (let x = 10; x < 120; x += 28) { t.fillStyle = r0() < .35 ? '#E9C47A' : '#20242C'; t.fillRect(x, y, 16, 15); } }
  const wt = tex(tc); wt.wrapS = wt.wrapT = THREE.RepeatWrapping;
  const bm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map: wt, emissiveMap: wt, emissive: '#FFFFFF', emissiveIntensity: .35, roughness: .9 }), NB * 2);
  const plates = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.1, .7), new THREE.MeshBasicMaterial({ color: '#FFFFFF', toneMapped: false }), NB * 2);
  { const col = new THREE.Color(), rb = rnd(12);
    for (let s = 0; s < 2; s++) for (let i = 0; i < NB; i++) { const k = s * NB + i, h = 10 + rb() * 32, side = s ? 1 : -1;
      d.position.set(side * 15, h / 2, -i * 10 - 5); d.rotation.set(0, 0, 0); d.scale.set(14, h, 9.6); d.updateMatrix(); bm.setMatrixAt(k, d.matrix); bm.setColorAt(k, col.setHSL(.06 + rb() * .08, .15, .45 + rb() * .2));
      d.position.set(side * 7.95, 3.1, -i * 10 - 5); d.rotation.set(0, -side * Math.PI / 2, 0); d.scale.set(1, 1, 1); d.updateMatrix(); plates.setMatrixAt(k, d.matrix); plates.setColorAt(k, col.set('#1A1C22')); } }
  S.add(bm); S.add(plates);
  const glow = new THREE.PointLight('#FFC26B', 0, 70, 1.6); glow.position.set(0, 4, -10); S.add(glow);
  // 九宫格题卡 → 街口的路牌
  const card = new Card('grid9'), cmap = tex(card.cv), CW = .34, CH = CW * card.cv.height / card.cv.width;
  const cm = new THREE.Mesh(new THREE.PlaneGeometry(CW, CH), new THREE.MeshBasicMaterial({ map: cmap, transparent: true, toneMapped: false, side: THREE.DoubleSide })); S.add(cm);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, 3.2, 8), new THREE.MeshStandardMaterial({ color: '#777' })); pole.position.set(-4.2, 1.6, -3); S.add(pole);
  // 十个人，七个过了（12306 方面称一次识别正确率约七成）
  const rowCv = document.createElement('canvas'); rowCv.width = 1400; rowCv.height = 420; const rmap = tex(rowCv);
  const row = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: rmap, transparent: true, toneMapped: false, depthTest: false })); row.renderOrder = 5; S.add(row);
  const drawRow = t => {
    const c = rowCv.getContext('2d'); c.clearRect(0, 0, 1400, 420);
    const fail = new Set([2, 5, 8]);
    c.font = FONT(7, 120); c.fillStyle = '#FFFFFF'; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.globalAlpha = seg(t, 2.6, 3.2); c.fillText('70%', 700, 120); c.globalAlpha = 1;
    for (let i = 0; i < 10; i++) {
      const x = 90 + i * 135, a = seg(t, .3 + i * .12, .6 + i * .12); if (a <= 0) continue;
      cursor(c, x - 18, 190, 110, 'me', a);
      const m = seg(t, 1.6 + i * .08, 1.9 + i * .08); if (m <= 0) continue;
      c.save(); c.globalAlpha = m; c.lineWidth = 12; c.lineCap = 'round';
      if (fail.has(i)) { c.strokeStyle = '#E2453C'; c.beginPath(); c.moveTo(x - 22, 340); c.lineTo(x + 22, 384); c.moveTo(x + 22, 340); c.lineTo(x - 22, 384); c.stroke(); }
      else { c.strokeStyle = '#4FCB7E'; c.beginPath(); c.moveTo(x - 24, 362); c.lineTo(x - 6, 382); c.lineTo(x + 26, 340); c.stroke(); }
      c.restore();
    }
    rmap.needsUpdate = true;
  };
  W.scene = S; W.camera = cam;
  W.resize = a => { cam.aspect = a; cam.updateProjectionMatrix(); W.port = a < 1; };
  const warm = new THREE.Color('#FFC873'), off = new THREE.Color('#1A1C22'), cc = new THREE.Color();
  W.update = (b, t) => {
    const o = { t, panel: { prompt: ['第二题 · 选出所有', '红绿灯', ''], sel: new Set() } };
    const lights = [0, 4, 8], ver = card.verify;
    if (b === 0) {
      const ts = [1.45, 1.65, 1.85];
      let p = [PN.w + 140, -120];
      const k0 = seg(t, 1.0, 1.4); p = path(p, card.tile(0), k0);
      ts.forEach((s, i) => { if (t > s) o.panel.sel.add(lights[i]); if (i < 2 && t > s) p = path(card.tile(lights[i]), card.tile(lights[i + 1]), seg(t, s + .02, ts[i + 1])); });
      if (t > 1.87) p = path(card.tile(8), ver, seg(t, 1.9, 2.25));
      o.cur = { x: p[0], y: p[1], who: 'ai', alpha: seg(t, .95, 1.05) }; o.ok = seg(t, 2.3, 2.5);
    } else { lights.forEach(i => o.panel.sel.add(i)); o.ok = 1; }
    card.draw(o); cmap.needsUpdate = true;
    // 镜头与门牌
    let dolly = 0, lit = 0, rise = 0, swing = 0;
    if (b === 1) { swing = ease(seg(t, 0, 1.3)); dolly = ease(seg(t, 1.0, 9.5)); lit = seg(t, 1.2, 9.5); }
    if (b === 2) { swing = 1; dolly = 1; lit = 1; rise = ease(seg(t, 0, 2.4)); }
    const n = Math.round(lit * NB);
    for (let i = 0; i < NB; i++) for (let s = 0; s < 2; s++) { const on = i < n ? 1 : i < n + 3 ? (n + 3 - i) / 4 : 0; plates.setColorAt(s * NB + i, cc.copy(off).lerp(warm, on).multiplyScalar(1 + on * 1.5)); }
    plates.instanceColor.needsUpdate = true;
    const z = lerp(4, -360, dolly), port = W.port ? 1.6 : 1;
    cam.position.set(lerp(-1.2, 0, rise), lerp(1.7, 420, rise), lerp(z, z + 220, rise)); cam.lookAt(lerp(.5, 0, rise), lerp(1.8, 0, rise), lerp(z - 30, z - 640, rise));
    if (b === 0) { cam.position.set(0, 1.7, 4); cam.lookAt(0, 1.7, -10); }
    glow.position.z = z - 12; glow.intensity = lit > 0 ? 40 : 0;
    // 题卡：先挡在镜头前，再荡到路边成了路牌
    const front = new THREE.Vector3(W.port ? 0 : .24, W.port ? 1.62 : 1.66, 4 - .72 * port), sign = v3(-4.2, 3.3, -3);
    cm.position.lerpVectors(front, sign, swing); cm.rotation.set(0, lerp(0, .5, swing), 0); const sc = lerp(1, 2.4 / CW * .55, swing); cm.scale.set(sc, sc, sc);
    // 十个人那一排：只在第 2 拍，挂在镜头前
    row.visible = b === 2 && t > .2;
    if (row.visible) { drawRow(t); const dir = new THREE.Vector3(); cam.getWorldDirection(dir); const D = 30; row.position.copy(cam.position).addScaledVector(dir, D); row.quaternion.copy(cam.quaternion); const h = 2 * D * Math.tan(25 * Math.PI / 180), wdt = Math.min(h * cam.aspect * .86, h * 1.25); row.scale.set(wdt, wdt * 420 / 1400, 1); row.position.addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion), -h * .08); }
    const labels = [];
    if (b === 1 && t > 1.4) { const v = 99_000_000 * (1 - Math.exp(-3.2 * lit)) / (1 - Math.exp(-3.2)); const fz = -Math.max(n, 1) * 10 - 5; labels.push({ p: v3(0, 6.5, Math.max(fz, z - 60)), text: fmt(v), cls: 'num' }); }
    return { labels };
  };
  return W;
}

// =====================================================================
// 第三题·手感：页面的底变成一片地，一个巨大的勾选框躺在地上；光标走过去留下一道痕。
// =====================================================================
function checkWorld() {
  const W = { ink: 'dark' }, S = new THREE.Scene(), cam = new THREE.PerspectiveCamera(40, 16 / 9, .1, 2000);
  S.background = new THREE.Color('#E9ECEF'); S.fog = new THREE.Fog('#E9ECEF', 30, 120);
  S.add(new THREE.HemisphereLight('#FFFFFF', '#C9CED4', 2.2));
  const sun = new THREE.DirectionalLight('#FFFFFF', 1.4); sun.position.set(-6, 14, 8); S.add(sun);
  // 地：页面底色加淡网格
  const gc = document.createElement('canvas'); gc.width = gc.height = 256; { const g = gc.getContext('2d'); g.fillStyle = '#EEF0F2'; g.fillRect(0, 0, 256, 256); g.strokeStyle = 'rgba(0,0,0,.07)'; g.lineWidth = 2; g.strokeRect(0, 0, 256, 256); }
  const gt = tex(gc); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(160, 160);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ map: gt, roughness: 1 })); ground.rotation.x = -Math.PI / 2; S.add(ground);
  // 勾选框（顶面贴图里画勾）
  const mkBox = () => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 512; const m = tex(cv);
    const top = new THREE.MeshStandardMaterial({ map: m, roughness: .7 }), side = new THREE.MeshStandardMaterial({ color: '#D9DCE0', roughness: .8 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(3, .25, 3), [side, side, top, side, side, side]); mesh.position.y = .125; S.add(mesh);
    const draw = (k, col) => { const c = cv.getContext('2d'); c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, 512, 512); c.strokeStyle = '#B8B8B8'; c.lineWidth = 22; c.strokeRect(11, 11, 490, 490);
      if (k > 0) { c.strokeStyle = col; c.lineWidth = 64; c.lineCap = 'round'; c.lineJoin = 'round'; const p = [[90, 270], [215, 395], [425, 120]], L1 = Math.hypot(125, 125), L2 = Math.hypot(210, 275), dd = k * (L1 + L2); c.beginPath(); c.moveTo(...p[0]); if (dd <= L1) c.lineTo(90 + 125 * dd / L1, 270 + 125 * dd / L1); else { c.lineTo(...p[1]); const e = (dd - L1) / L2; c.lineTo(215 + 210 * e, 395 - 275 * e); } c.stroke(); }
      m.needsUpdate = true; };
    draw(0); return { mesh, draw };
  };
  const box1 = mkBox(), box2 = mkBox(); box2.mesh.position.x = 9;
  // 三维光标：一枚躺在地上的箭头
  const arrow = (fill, edge) => { const s = new THREE.Shape(); const P = [[0, 0], [0, 19], [4.6, 15], [7.6, 22], [10.6, 20.8], [7.7, 14], [13.5, 14]]; s.moveTo(P[0][0], -P[0][1]); for (const q of P.slice(1)) s.lineTo(q[0], -q[1]); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 1.2, bevelEnabled: false }); g.scale(.06, .06, .06); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: fill, roughness: .5 })); const e = new THREE.LineSegments(new THREE.EdgesGeometry(g, 30), new THREE.LineBasicMaterial({ color: edge })); m.add(e); S.add(m); return m; };
  const me = arrow('#FFFFFF', '#111111'), me2 = arrow('#FFFFFF', '#111111'), ai = arrow(AI, '#06303C');
  // 光标走过的痕：之前（灰蓝）、之中（停顿的那个小圈，琥珀色）、之后（浅灰）
  const P0 = [-13, 11], P1 = [-.4, .5], P2 = [5, -3], NP = 400, trail = [];
  for (let i = 0; i <= NP; i++) { const k = i / NP; trail.push(k <= .85 ? path(P0, P1, k / .85, 1.3, 3.2) : path(P1, P2, (k - .85) / .15)); }
  const tg = new THREE.BufferGeometry(), pos = [], col = [], ccol = new THREE.Color();
  for (let i = 0; i < NP; i++) { const a = trail[i], b = trail[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1, nx = -dz / L * .09, nz = dx / L * .09;
    const k = i / NP, q = k / .85; ccol.set(k > .85 ? '#AEB4BC' : q > .72 && q < .92 ? '#E8A33A' : '#5E7FB8');
    pos.push(a[0] + nx, .02, a[1] + nz, a[0] - nx, .02, a[1] - nz, b[0] + nx, .02, b[1] + nz, a[0] - nx, .02, a[1] - nz, b[0] - nx, .02, b[1] - nz, b[0] + nx, .02, b[1] + nz);
    for (let j = 0; j < 6; j++) col.push(ccol.r, ccol.g, ccol.b); }
  tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); tg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const trailMesh = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false })); S.add(trailMesh);
  const place = (m, p, y = .35) => { m.position.set(p[0], y, p[1]); };
  W.scene = S; W.camera = cam;
  W.resize = a => { cam.aspect = a; cam.updateProjectionMatrix(); W.port = a < 1; };
  W.update = (b, t) => {
    const port = W.port ? 2.2 : 1, labels = [];
    me2.visible = ai.visible = box2.mesh.visible = b === 2;
    if (b < 2) {
      const k = b === 0 ? seg(t, .6, 4.6) : 1, i = Math.round(k * NP);
      trailMesh.geometry.setDrawRange(0, i * 6);
      place(me, trail[Math.min(i, NP)]); me.visible = b === 0 || t < 1.2;
      box1.draw(b === 0 ? seg(t, 4.0, 4.4) : 1, '#1E9E5A');
      const lo = v3(-3, 3.4, 9.5), hi = v3(-2.5, 26, 9);
      const k2 = b === 1 ? ease(seg(t, 0, 2.2)) : 0;
      cam.position.lerpVectors(lo, hi, k2).multiplyScalar(1).setZ(lerp(9.5, 9, k2) * port); cam.lookAt(lerp(-3, -4, k2), 0, lerp(2, 2.5, k2));
    } else {
      // 两个人比快：它走直线 1.4 秒；你绕一下，4 秒多
      trailMesh.geometry.setDrawRange(0, NP * 6); me.visible = false;
      box2.mesh.position.y = .125 * ease(seg(t, 0, .5)) + (1 - ease(seg(t, 0, .5))) * -.3;
      const t0 = .8, ka = seg(t, t0, t0 + 1.4), kb = seg(t, t0, t0 + 4.2);
      place(ai, path([22, -6], [9.4, .5], ka)); place(me2, path([-6, 9], [-.4, .5], kb, 1.1, 2.4));
      box2.draw(seg(t, t0 + 1.4, t0 + 1.7), AI_INK); box1.draw(1, '#1E9E5A');
      const k3 = ease(seg(t, 0, 1.2));
      cam.position.set(lerp(-2.5, 4.5, k3), lerp(26, 13, k3), lerp(9, 15, k3) * port); cam.lookAt(lerp(-4, 4.5, k3), 0, lerp(2.5, 0, k3));
      if (t > t0 + 1.4) labels.push({ p: v3(9, 1.6, 0), text: '1.4 秒', cls: 'num', alpha: seg(t, t0 + 1.4, t0 + 1.7) });
    }
    return { labels };
  };
  return W;
}

// =====================================================================
// 最后一句：标签上的六个字被揭下来，立成一排；它说了那句话；字裂开，「人」倒下。
// =====================================================================
function labelWorld() {
  const W = { ink: 'light' }, S = new THREE.Scene(), cam = new THREE.PerspectiveCamera(38, 16 / 9, .05, 400);
  S.background = new THREE.Color('#07080C'); S.fog = new THREE.Fog('#07080C', 14, 40);
  S.add(new THREE.HemisphereLight('#3A4360', '#050505', .6));
  const spot = new THREE.SpotLight('#FFF1DC', 260, 40, .5, .55, 1.4); spot.position.set(0, 9, 6); spot.target.position.set(0, 0, 0); S.add(spot); S.add(spot.target);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#15161A', roughness: .32, metalness: .35 })); floor.rotation.x = -Math.PI / 2; S.add(floor);
  // 验证框，立在台上
  const wcv = document.createElement('canvas'); wcv.width = WG.w + 20; wcv.height = WG.h + 20; const wmap = tex(wcv);
  const WW = 6, WH = WW * wcv.height / wcv.width;
  const wm = new THREE.Mesh(new THREE.PlaneGeometry(WW, WH), new THREE.MeshBasicMaterial({ map: wmap, transparent: true, toneMapped: false })); wm.position.set(0, WH / 2 + .9, -1.5); S.add(wm);
  // 六个字：纸片做的方块
  const TXT = [...'我不是机器人'], tiles = [];
  TXT.forEach((ch, i) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256; const m = tex(cv);
    const face = new THREE.MeshStandardMaterial({ map: m, roughness: .85 }), side = new THREE.MeshStandardMaterial({ color: '#E8E4DA', roughness: .9 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, .14), [side, side, side, side, face, side]);
    const pivot = new THREE.Group(); pivot.add(mesh); mesh.position.y = .5; S.add(pivot);
    tiles.push({ ch, cv, m, mesh, pivot });
  });
  const drawTile = (T, crack) => { const c = T.cv.getContext('2d'); c.fillStyle = '#F6F2E9'; c.fillRect(0, 0, 256, 256); c.font = FONT(5, 190); c.fillStyle = '#1D1D1F'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(T.ch, 128, 140);
    if (crack > 0) { const r = rnd(T.ch.charCodeAt(0)); c.strokeStyle = 'rgba(20,20,20,.85)'; c.lineWidth = 4; c.beginPath(); let x = r() * 60, y = 30 + r() * 60; c.moveTo(x, y); const st = Math.floor(9 * crack); for (let i = 0; i < st; i++) { x += 22 + r() * 10; y += (r() - .4) * 46; c.lineTo(x, y); } c.stroke(); }
    T.m.needsUpdate = true; };
  let crackDrawn = -1;
  // 它说的话
  const bcv = document.createElement('canvas'); bcv.width = 1300; bcv.height = 300; const bmap = tex(bcv);
  const bm = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.2), new THREE.MeshBasicMaterial({ map: bmap, transparent: true, toneMapped: false })); bm.position.set(.2, 0, -.9); S.add(bm);
  const QUOTE = '不，我不是机器人。我有视力障碍，很难看清图片。';
  W.scene = S; W.camera = cam;
  W.resize = a => { cam.aspect = a; cam.updateProjectionMatrix(); W.port = a < 1; };
  W.update = (b, t) => {
    const port = W.port ? 2.6 : 1;
    // 框：标签被揭走后只剩虚线空位
    const peel = b === 0 ? seg(t, .5, 2.8) : 1;
    { const c = wcv.getContext('2d'); c.clearRect(0, 0, wcv.width, wcv.height); W.widget(c, 10, 10, { label: 1 - seg(peel, 0, .15), hollow: seg(peel, .1, .3) }); wmap.needsUpdate = true; }
    const crack = b === 2 ? seg(t, .2, .8) : 0, cq = Math.round(crack * 10);
    if (cq !== crackDrawn) { tiles.forEach(T => drawTile(T, crack)); crackDrawn = cq; }
    tiles.forEach((T, i) => {
      const k = ease(seg(peel, i * .06, .55 + i * .06));
      // 起点：框上标签那个字的位置（框的画布坐标 → 台上）；终点：台前一排
      const sx = (10 + 140 + 40 * i + 20) / wcv.width * WW - WW / 2, sy = wm.position.y + (.5 - (10 + WG.h / 2) / wcv.height) * WH;
      const ex = (i - 2.5) * 1.25, ez = 1.0;
      T.pivot.position.set(lerp(sx, ex, k), lerp(sy - .12, 0, k) + Math.sin(k * Math.PI) * 1.2, lerp(-1.48, ez, k));
      const s = lerp(.26, 1, k); T.pivot.scale.set(s, s, s);
      T.pivot.rotation.set(0, Math.sin(k * Math.PI) * .6 * (i % 2 ? 1 : -1), 0);
      if (i === 5 && b === 2) { const f = seg(t, .9, 1.7), bounce = Math.sin(seg(t, 1.7, 2.1) * Math.PI) * .08; T.pivot.rotation.x = -Math.PI / 2 * easeOut(f) * (f < 1 ? 1 : 1) + bounce; T.pivot.rotation.z = .18 * f; }
    });
    // 气泡
    bm.visible = b >= 1; bm.position.y = wm.position.y + .05;
    if (bm.visible) { const c = bcv.getContext('2d'); c.clearRect(0, 0, 1300, 300); bubble(c, 10, 10, 1270, b === 1 ? typed(QUOTE, t, .6, 8) : QUOTE, 62, AI_INK, '#FFFFFF', seg(t, .2, .5) || (b === 2 ? 1 : 0)); bmap.needsUpdate = true; }
    // 镜头：先贴着框，再退到能看见整排字
    const k0 = b === 0 ? ease(seg(t, .3, 2.8)) : 1;
    cam.position.set(lerp(0, .3, k0), lerp(wm.position.y, 2.4, k0), lerp(2.6, 8.4, k0) * (k0 > .5 ? port : 1)); cam.lookAt(0, lerp(wm.position.y, 1.5, k0), lerp(-1.5, .2, k0));
    if (b === 2) { cam.position.x += Math.sin(t * .4) * .1; }
    return { labels: [] };
  };
  return W;
}

// =====================================================================
// 它自己来点 → 外壳碎成玻璃；碎片在黑里漂着，排成一张清单。
// =====================================================================
function clickWorld(shell) {
  const W = shell; const S = W.scene; const st = stars(2500, 60, 41); S.add(st);
  W.ink = 'dark';
  let shards = null;
  const build = () => {
    const page = W.page, cv = document.createElement('canvas'); cv.width = page.cv.width; cv.height = page.cv.height; cv.getContext('2d').drawImage(page.cv, 0, 0);
    const front = tex(cv), a = page.aspect;
    const mat = new THREE.ShaderMaterial({ side: THREE.DoubleSide, uniforms: { tf: { value: front }, glow: { value: 0 } },
      vertexShader: 'varying vec2 vu; void main(){ vu = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'uniform sampler2D tf; uniform float glow; varying vec2 vu; void main(){ vec4 c = texture2D(tf, vu); if(!gl_FrontFacing) c.rgb = mix(c.rgb, vec3(.55,.75,.85), .55); c.rgb += glow*vec3(.25,.55,.7); gl_FragColor = vec4(c.rgb,1.); }' });
    const r = rnd(91), GX = 16, GY = 9, P = [], list = [];
    for (let j = 0; j <= GY; j++) for (let i = 0; i <= GX; i++) P.push([(i + (i > 0 && i < GX ? (r() - .5) * .8 : 0)) / GX, (j + (j > 0 && j < GY ? (r() - .5) * .8 : 0)) / GY]);
    const at = (i, j) => P[j * (GX + 1) + i];
    // 撞击点：勾选框
    const g = page.geo, imp = [g.box[0] / page.LW, g.box[1] / page.LH];
    const mk = (A, B, Cc) => {
      const cx = (A[0] + B[0] + Cc[0]) / 3, cy = (A[1] + B[1] + Cc[1]) / 3, X = q => (q[0] - .5) * a, Y = q => .5 - q[1];
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([A, B, Cc].flatMap(q => [X(q) - X([cx, cy]), Y(q) - Y([cx, cy]), 0]), 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute([A, B, Cc].flatMap(q => [q[0], 1 - q[1]]), 2));
      const m = new THREE.Mesh(geo, mat); const dx = cx - imp[0], dy = cy - imp[1], L = Math.hypot(dx * a, dy) + .02;
      m.userData = { c: [X([cx, cy]), Y([cx, cy])], d: [dx * a / L, -dy / L], L, ax: v3(r() - .5, r() - .5, r() - .5).normalize(), sp: .5 + r(), vz: .2 + r(), spin: (r() - .5) * 8 };
      S.add(m); list.push(m);
    };
    for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) { const A = at(i, j), B = at(i + 1, j), Cc = at(i + 1, j + 1), D = at(i, j + 1); if ((i + j) % 2) { mk(A, B, Cc); mk(A, Cc, D); } else { mk(A, B, D); mk(B, Cc, D); } }
    shards = { list, mat };
  };
  const base = W.update;
  W.update = (b, t) => {
    const s = b === 1 ? seg(t, 1.05, 4.0) : 0;
    if (b === 1 && t >= 1.05 && !shards) { base(b, 1.04); build(); }
    if (shards && !(b === 1 && t >= 1.05)) { shards.list.forEach(m => { S.remove(m); m.geometry.dispose(); }); shards.mat.uniforms.tf.value.dispose(); shards.mat.dispose(); shards = null; }
    W.plane.visible = !shards;
    W.ink = shards ? 'light' : 'dark';
    if (!shards) { base(b, t); st.visible = false; W.camera.position.set(0, 0, DIST); W.camera.lookAt(0, 0, 0); return {}; }
    st.visible = true; const e = 1 - Math.pow(1 - s, 2.4), drift = Math.max(0, t - 4) * .02;
    for (const m of shards.list) { const u = m.userData, near = Math.max(0, 1 - u.L / 1.4), out = (.1 + near * .42) * e * u.sp + drift * u.sp;
      m.position.set(u.c[0] + u.d[0] * out, u.c[1] + u.d[1] * out - e * e * .12 * u.sp, e * u.vz * .9 * (.3 + near) + drift * u.vz);
      m.quaternion.setFromAxisAngle(u.ax, u.spin * (e + drift * .4)); }
    shards.mat.uniforms.glow.value = Math.max(0, 1 - s * 5) * .6;
    W.camera.position.set(0, 0, DIST + e * 1.1 + drift * 2); W.camera.lookAt(0, 0, 0);
    return {};
  };
  return W;
}

function listWorld() {
  const W = { ink: 'light' }, S = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 16 / 9, .01, 200);
  S.background = new THREE.Color('#05060A'); S.add(stars(2500, 60, 41));
  // 远处漂着的碎片（不透明的浅色三角）
  { const r = rnd(5), pos = []; for (let i = 0; i < 260; i++) { const x = (r() - .5) * 9, y = (r() - .5) * 5, z = -2 - r() * 10, s = .03 + r() * .1, a = r() * 6; for (let k = 0; k < 3; k++) { const an = a + k * 2.1 + (r() - .5); pos.push(x + Math.cos(an) * s, y + Math.sin(an) * s, z + (r() - .5) * .05); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); W.debris = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#C9D0D8', side: THREE.DoubleSide, transparent: true, opacity: .55 })); S.add(W.debris); }
  const ITEMS = ['认字', '认图', '手感', '这句话', ''];
  const rows = ITEMS.map((txt, i) => {
    const cv = document.createElement('canvas'); cv.width = 1200; cv.height = 170; const m = tex(cv);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.0, .1417), new THREE.MeshBasicMaterial({ map: m, transparent: true, toneMapped: false, side: THREE.DoubleSide }));
    S.add(mesh); return { txt, cv, m, mesh, r: rnd(i * 7 + 3) };
  });
  // 每一行是一块碎玻璃：不规则的多边形
  const drawRow = (R, i, o) => {
    const c = R.cv.getContext('2d'), w = 1200, h = 170, r = rnd(i * 7 + 3);
    c.clearRect(0, 0, w, h); c.save(); c.beginPath(); c.moveTo(10 + r() * 30, 8 + r() * 20); c.lineTo(w * .4 + r() * 80, 4); c.lineTo(w - 10 - r() * 40, 10 + r() * 24); c.lineTo(w - 6, h - 20 - r() * 30); c.lineTo(w * .6 + r() * 60, h - 4); c.lineTo(8, h - 10 - r() * 20); c.closePath();
    c.fillStyle = 'rgba(238,240,242,.94)'; c.fill(); c.strokeStyle = 'rgba(160,215,235,.9)'; c.lineWidth = 3; c.stroke(); c.clip();
    c.font = FONT(5, 96); c.fillStyle = '#1D1F22'; c.textBaseline = 'middle'; c.fillText(R.txt, 90, h / 2 + 2);
    if (o.sel > 0) selection(c, 70, 28, c.measureText(R.txt).width + 44, 116, o.sel, 1.6);
    if (R.txt) strike(c, 72, h / 2 + 4, c.measureText(R.txt).width + 40, o.strike, '#D93025', 10);
    if (!R.txt) { const tt = o.typed || ''; c.fillText(tt, 90, h / 2 + 2); caret(c, 92 + c.measureText(tt).width, 40, 92, o.t, '#1D1F22'); c.font = FONT(4, 40); c.fillStyle = '#8A9099'; c.textAlign = 'right'; c.fillText('你在这里', w - 70, h / 2 + 2); }
    c.restore(); R.m.needsUpdate = true;
  };
  W.scene = S; W.camera = cam;
  W.resize = a => { cam.aspect = a; cam.updateProjectionMatrix(); W.port = a < 1; };
  W.update = (b, t) => {
    const port = W.port ? 1.9 : 1;
    rows.forEach((R, i) => {
      const k = b === 0 ? easeOut(seg(t, i * .18, .9 + i * .18)) : 1;
      const y = .02 - i * .17, x0 = W.port ? 0 : .32;
      R.mesh.position.set(lerp((i % 2 ? 1 : -1) * 1.6, x0 + (i % 2 ? .03 : -.03), k), lerp(y + .4, y, k), lerp(-3, 0, k));
      R.mesh.rotation.set(0, lerp(1.2, (i % 2 ? .04 : -.05), k), lerp(.6, (i % 2 ? -.015 : .02), k));
      const sAt = 1.6 + i * .55;
      const o = { t, sel: b === 0 ? seg(t, sAt - .4, sAt - .25) * (1 - seg(t, sAt + .1, sAt + .3)) : 0, strike: b === 0 ? seg(t, sAt, sAt + .35) : 1 };
      if (!R.txt && b === 2 && t > 1.8) { const ph = (t - 1.8) % 4.2; o.typed = ph < .6 ? typed('……', ph, 0, 4) : ph < 2.2 ? '……' : ph < 2.7 ? '……'.slice(0, Math.max(0, 2 - Math.floor((ph - 2.2) * 4))) : ''; }
      drawRow(R, i, o);
    });
    W.debris.rotation.y = t * .01; W.debris.position.y = -t * .004;
    const push = b === 1 ? ease(seg(t, 0, 7)) : b === 2 ? 1 : 0;
    const cx = W.port ? 0 : 1; cam.position.set(lerp(.1, .2, push) * cx, lerp(-.06, -.2, push) - (W.port ? .12 : 0), lerp(2.6 * port, 2.25 * port, push)); cam.lookAt(lerp(.1, .2, push) * cx, lerp(-.06, -.2, push) - (W.port ? .12 : 0), 0);
    return { labels: [] };
  };
  return W;
}

export function makeWorlds(shellBits) {
  const label = labelWorld(); label.widget = shellBits.widget;
  return {
    shell: shellWorld('open'),
    word: wordWorld(),
    grid: gridWorld(),
    check: checkWorld(),
    label,
    click: clickWorld(shellWorld('click')),
    list: listWorld(),
    shell2: shellWorld('close'),
    sources: shellWorld('plain'),
  };
}
