// 九个满屏三维世界 + 八次真实物体接力转场。
// 全部视觉由程序着色器、实例化网格与 2D Canvas 贴图实时生成，零外部图片/网络资源。
// 纯确定性：update(beat, t) 只依赖「第几拍、这一拍过了几秒」，无 Math.random、无墙钟。
import * as THREE from 'three';
import { C, rnd, WG, PN, panel, panelH, tile, check, GRID9, GRID8, FONT, MONO, rr } from '../../src/shell.js';
import { Page, Card, HEADER, HEADER_EDITED } from '../../src/page.js';
import { cursor, selection, caret, typed, retype, stamp, strike, bubble, path, AI, AI_INK, SEL, clamp, ease, easeOut, seg, wrap } from '../../src/draw.js';

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const lerp = (a, b, k) => a + (b - a) * k;
const easeInOutCubic = k => { k = clamp(k); return k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; };
const easeOutBack = k => { k = clamp(k); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
const tex = cv => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
const fmt = n => Math.round(n).toLocaleString('en-US');

export const FLAT_FOV = 30;
export const DIST = .5 / Math.tan(FLAT_FOV / 2 * Math.PI / 180);
export const TRANS_DUR = {
  word: 1.35,
  grid: 1.30,
  check: 1.25,
  label: 1.20,
  click: 1.15,
  list: 1.25,
  shell2: 1.25,
  sources: 0.55,
};

function flatCam(aspect) {
  const c = new THREE.PerspectiveCamera(FLAT_FOV, aspect, .01, 200);
  c.position.set(0, 0, DIST);
  c.lookAt(0, 0, 0);
  return c;
}

// =====================================================================
// 共用程序化天穹 / 星云 / 星空 / 发光粒子
// =====================================================================
function makeNebulaSky(radius = 85) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { uTime: { value: 0 }, uIntensity: { value: 1 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `
      uniform float uTime; uniform float uIntensity; varying vec3 vDir;
      float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float noise(vec3 x){
        vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
      float fbm(vec3 p){ float v = 0., a = .5; for(int i=0;i<4;i++){ v += a * noise(p); p = p * 2.05 + vec3(1.7, -1.2, .9); a *= .5; } return v; }
      void main(){
        vec3 d = normalize(vDir);
        float t = uTime * 0.04;
        float n1 = fbm(d * 2.4 + vec3(t, -t * .5, t * .3));
        float n2 = fbm(d * 4.8 - vec3(t * .7, t * .4, 0.));
        float band = exp(-pow(d.y * 2.2 + (n1 - .5) * 1.1, 2.0));
        vec3 base = mix(vec3(.02, .03, .07), vec3(.04, .07, .14), smoothstep(-.4, .6, d.y));
        vec3 cyan = vec3(.08, .34, .48) * band * smoothstep(.35, .85, n1) * 1.15;
        vec3 indigo = vec3(.14, .10, .32) * smoothstep(.42, .88, n2) * .75;
        vec3 col = (base + cyan + indigo) * uIntensity;
        gl_FragColor = vec4(col, 1.);
      }
    `,
  });
  return { mesh: new THREE.Mesh(new THREE.SphereGeometry(radius, 36, 24), mat), mat };
}

function makeTwinkleStars(n, R, seed, baseSize = 2.4) {
  const r = rnd(seed), pos = [], phase = [], col = [];
  const palette = [new THREE.Color('#DDF2FF'), new THREE.Color('#B5D7FF'), new THREE.Color('#FFE4C4'), new THREE.Color('#8EE4FF')];
  for (let i = 0; i < n; i++) {
    const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    const rr0 = R * (.65 + r() * .35);
    pos.push(Math.cos(a) * s * rr0, u * rr0, Math.sin(a) * s * rr0);
    phase.push(r() * 6.283, .6 + r() * 1.4);
    const c = palette[Math.floor(r() * palette.length)];
    col.push(c.r, c.g, c.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 2));
  g.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: { value: 0 }, uSize: { value: baseSize }, uAlpha: { value: 1 } },
    vertexShader: `
      attribute vec2 aPhase; attribute vec3 aCol; uniform float uTime; uniform float uSize;
      varying vec3 vCol; varying float vTw;
      void main(){
        vCol = aCol; vTw = .55 + .45 * sin(uTime * aPhase.y + aPhase.x);
        vec4 mv = modelViewMatrix * vec4(position, 1.);
        gl_PointSize = uSize * (.7 + .6 * vTw);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uAlpha; varying vec3 vCol; varying float vTw;
      void main(){
        float d = length(gl_PointCoord - .5); if(d > .5) discard;
        float a = smoothstep(.5, .08, d) * vTw * uAlpha;
        gl_FragColor = vec4(vCol, a);
      }
    `,
  });
  return { points: new THREE.Points(g, mat), mat };
}

// 绘制增强版验证页（带自主呼吸的护盾瞳孔、边框微呼吸、角落心跳点）
function drawEnhancedPage(page, o = {}) {
  page.draw(o);
  const { c, k, LW, LH } = page;
  const g = page.geo;
  const t = o.t || 0;
  c.save();
  c.setTransform(k, 0, 0, k, 0, 0);
  // 极细微的会话心跳点（右下角上方，安静但不死板）
  const pulse = .35 + .65 * (.5 + .5 * Math.sin(t * 2.4));
  c.fillStyle = o.aiPulse ? `rgba(60,198,234,${.35 + .55 * pulse})` : `rgba(59,120,231,${.18 + .25 * pulse})`;
  c.beginPath(); c.arc(g.wx + WG.w - 22, g.wy + 20, 4.5, 0, Math.PI * 2); c.fill();
  // 护盾瞳孔的缓慢扫描旋转（叠加在护盾中心）
  if (!o.tilt) {
    const sx = g.wx + WG.w - 92, sy = g.wy + WG.h / 2 - 14;
    c.save(); c.translate(sx, sy); c.rotate(t * .9);
    c.strokeStyle = o.aiPulse ? 'rgba(60,198,234,.85)' : 'rgba(138,155,181,.65)';
    c.lineWidth = 2.2; c.beginPath(); c.arc(0, 0, 12.5, 0, Math.PI * .7); c.stroke();
    c.restore();
  }
  // 可选整框蓝色 8 拉手选框
  if (o.widgetSel > 0) {
    selection(c, g.wx - 10, g.wy - 10, WG.w + 20, WG.h + 20, o.widgetSel, 1.15);
  }
  // 可选勾选框 8 拉手选框
  if (o.boxSel > 0) {
    selection(c, g.wx + 34, g.wy + WG.h / 2 - 42, 84, 84, o.boxSel, 1.0);
  }
  c.restore();
}

// =====================================================================
// 第 1 场：shell（开场验证页 — 3 拍）
// =====================================================================
function openShellWorld() {
  const S = new THREE.Scene(), cam = flatCam(16 / 9);
  S.background = new THREE.Color('#E8ECEF');
  const page = new Page(), pmap = tex(page.cv);
  const bgPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: pmap, toneMapped: false }));
  S.add(bgPlane);

  // 第 2 拍会微微从纸面抬起的立体验证卡阴影与微抬效果（用独立 3D 平面叠加实现真实景深）
  const card3D = new Card('text'), cmap = tex(card3D.cv);
  const cardAspect = card3D.cv.width / card3D.cv.height;
  const cardGeo = new THREE.BoxGeometry(1, 1, .022);
  const sideMat = new THREE.MeshBasicMaterial({ color: '#DDE2E8' });
  const frontMat = new THREE.MeshBasicMaterial({ map: cmap, transparent: true, toneMapped: false });
  const cardMesh = new THREE.Mesh(cardGeo, [sideMat, sideMat, sideMat, sideMat, frontMat, sideMat]);
  cardMesh.visible = false;
  S.add(cardMesh);

  // 柔和阴影垫在题卡背后
  const shCv = document.createElement('canvas'); shCv.width = shCv.height = 128;
  { const sc = shCv.getContext('2d'), gr = sc.createRadialGradient(64, 64, 10, 64, 64, 62); gr.addColorStop(0, 'rgba(10,18,34,.32)'); gr.addColorStop(1, 'rgba(10,18,34,0)'); sc.fillStyle = gr; sc.fillRect(0, 0, 128, 128); }
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex(shCv), transparent: true, depthWrite: false, toneMapped: false }));
  shadowPlane.visible = false;
  S.add(shadowPlane);

  const W = { scene: S, camera: cam, ink: 'dark', page, aspect: 16 / 9 };
  W.resize = a => {
    W.aspect = a; cam.aspect = a; cam.updateProjectionMatrix();
    page.resize(a);
    bgPlane.material.map.dispose(); bgPlane.material.map = W.pmap = tex(page.cv);
    bgPlane.scale.set(a, 1, 1);
  };
  W.pmap = pmap;

  W.update = (b, t) => {
    const g = page.geo, o = { t, widget: {} };
    let lift = 0, pop = 0;
    if (b === 0) {
      // 平平无奇但活着：边框呼吸 + 护盾扫描
      cam.position.set(0, 0, DIST); cam.lookAt(0, 0, 0);
      bgPlane.position.set(0, 0, 0); bgPlane.rotation.set(0, 0, 0);
    }
    if (b === 1) {
      // AI 光标选中标题、改写文字，再抓住验证卡拉手轻轻抬离纸面
      const sel = seg(t, .4, .85), r = retype(HEADER, HEADER_EDITED, t, 1.15);
      o.header = r.s; o.headerSel = t < 1.1 ? sel : 0; o.caretOn = t > 1.05 && t < 3.5; o.caretSolid = r.busy;
      const grab = seg(t, 3.6, 4.7);
      lift = easeInOutCubic(grab);
      o.widgetSel = seg(t, 3.4, 3.7) * (1 - seg(t, 5.1, 5.6));
      let p;
      if (t < 3.1) p = path([page.LW + 50, g.head[1] + 150], [g.head[0] + 540, g.head[1] + 22], seg(t, 0, .95));
      else if (t < 3.65) p = path([g.head[0] + 540, g.head[1] + 22], [g.wx + WG.w + 8, g.wy - 8], seg(t, 3.1, 3.6));
      else p = [g.wx + WG.w + 8 + lift * 14, g.wy - 8 - lift * 10];
      o.cur = { x: p[0], y: p[1], who: 'ai', alpha: 1 - seg(t, 5.2, 5.8) };
      // 镜头被轻微拽出 3D 透视
      cam.position.set(lift * .11 + Math.sin(t * .6) * .006 * lift, lift * .04, DIST - lift * .08);
      cam.lookAt(0, 0, 0);
      bgPlane.position.set(0, 0, -lift * .03);
      bgPlane.rotation.set(-lift * .025, lift * .045, 0);
    }
    if (b === 2) {
      // 光标点击勾选框 -> 蓝色等待转圈 -> 立体扭曲词题卡从勾选框里生长冲出！
      o.header = HEADER_EDITED;
      const clickK = seg(t, 0, .55);
      const cp = path([g.wx + WG.w * .7, g.wy - 90], [g.box[0] + 6, g.box[1] + 6], clickK);
      o.cur = { x: cp[0], y: cp[1], who: 'ai', alpha: 1 - seg(t, .85, 1.1) };
      o.widget = { spin: Math.max(0, t - .45) };
      o.boxSel = seg(t, .35, .55) * (1 - seg(t, .85, 1.1));
      pop = easeOutBack(seg(t, .75, 1.55));
      const popClamped = ease(seg(t, .75, 1.55));
      bgPlane.position.set(0, 0, -popClamped * .35);
      bgPlane.rotation.set(0, 0, 0);
      cam.position.set(Math.sin(t * .45) * .012 * popClamped, Math.cos(t * .35) * .006 * popClamped, DIST - popClamped * .12);
      cam.lookAt(0, 0, 0);
    }

    drawEnhancedPage(page, o);
    W.pmap.needsUpdate = true;

    // 立体第一题题卡（在 Beat 2 浮起并轻微呼吸，为转场 1 做好精确对接）
    cardMesh.visible = b === 2 && t > .72;
    shadowPlane.visible = cardMesh.visible;
    if (cardMesh.visible) {
      const wob = .94 + .1 * Math.sin(t * 2.4);
      card3D.draw({ t, panel: { prompt: ['第一题', '认出这个词', ''], wob } });
      cmap.needsUpdate = true;
      const ch = Math.min(.72, W.aspect * .82 / cardAspect);
      const cw = ch * cardAspect;
      const sc = lerp(.12, 1, pop);
      const bx = (g.box[0] / page.LW - .5) * W.aspect, by = .5 - g.box[1] / page.LH;
      const k = ease(seg(t, .75, 1.5));
      cardMesh.scale.set(cw * sc, ch * sc, 1);
      cardMesh.position.set(lerp(bx, 0, k), lerp(by, -.01, k), lerp(-.05, .18, k));
      cardMesh.rotation.set(Math.sin(t * .7) * .018 * k, Math.cos(t * .5) * .025 * k, 0);
      shadowPlane.scale.set(cw * 1.45 * sc, ch * 1.35 * sc, 1);
      shadowPlane.position.set(cardMesh.position.x, cardMesh.position.y - .03, cardMesh.position.z - .08);
    }
    return {};
  };
  return W;
}

// =====================================================================
// 第 2 场：word（第一题·认字 — 暮光书海 + 广州塔 + 17,600 本书 — 3 拍）
// 转场 1：shell.2 浮起的扭曲词题卡直接厚实化成古书上的 3D 题碑，浅灰验证页底褪落成暮光云海
// =====================================================================
function wordWorld() {
  const W = { ink: 'light', port: false }, S = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(42, 16 / 9, .015, 12000);
  S.background = new THREE.Color('#19223B');
  S.fog = new THREE.FogExp2('#2D2A42', .00042);

  S.add(new THREE.HemisphereLight('#C6D6FF', '#442C24', 1.35));
  const sun = new THREE.DirectionalLight('#FFCC96', 2.6);
  sun.position.set(-220, 120, -400); S.add(sun);
  const rim = new THREE.DirectionalLight('#7AB8FF', 1.1);
  rim.position.set(120, 80, 160); S.add(rim);

  // 多层体积云暮光天穹着色器
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTime: { value: 0 }, uAlt: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `
      uniform float uTime; uniform float uAlt; varying vec3 vDir;
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
        return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p){ float v = 0., a = .5; for(int i=0;i<4;i++){ v += a * n2(p); p *= 2.04; a *= .5; } return v; }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 zenith = mix(vec3(.07, .10, .24), vec3(.03, .04, .11), uAlt);
        vec3 midSky = vec3(.22, .20, .38);
        vec3 horizon = vec3(.98, .54, .34);
        vec3 low = vec3(.06, .07, .12);
        vec3 col = mix(horizon, midSky, smoothstep(-.01, .18, h));
        col = mix(col, zenith, smoothstep(.14, .58, h));
        col = mix(col, low, smoothstep(.0, -.16, h));
        // 太阳与散射辉光
        vec3 sDir = normalize(vec3(-.28, .085, -.95));
        float sd = max(0., dot(d, sDir));
        col += vec3(1., .74, .46) * pow(sd, 16.) * .42;
        col += vec3(1., .93, .80) * smoothstep(.99945, .99988, sd) * 1.45;
        // 暮光体积云带
        if (h > .01) {
          vec2 uv = d.xz / (h + .14) * 1.15 + vec2(uTime * .018, -uTime * .008);
          float c1 = fbm(uv * 1.4);
          float c2 = fbm(uv * 3.2 + vec2(c1 * 1.2, uTime * .01));
          float cloud = smoothstep(.42, .82, c1 * .65 + c2 * .35) * smoothstep(.01, .12, h) * smoothstep(.62, .15, h);
          vec3 cLit = mix(vec3(.24, .21, .36), vec3(1., .68, .44), pow(sd, 3.) * .8 + smoothstep(.22, .02, h) * .55);
          col = mix(col, cLit, cloud * .72);
        }
        gl_FragColor = vec4(col, 1.);
      }
    `,
  });
  S.add(new THREE.Mesh(new THREE.SphereGeometry(9000, 36, 20), skyMat));

  // 镜面反光暮光水湾地板着色器
  const waterMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uTowerPos: { value: v3(175, 0, -290) } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float uTime; varying vec3 vW;
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
        return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        float dist = length(vW.xz);
        float w1 = n2(vW.xz * .045 + vec2(uTime * .3, uTime * .18));
        float w2 = n2(vW.xz * .14 - vec2(uTime * .22, -uTime * .4));
        float rip = (w1 + w2) * .5;
        vec3 base = mix(vec3(.07, .08, .13), vec3(.14, .12, .20), smoothstep(40., 1600., dist));
        // 落日水路反光
        float sunAxis = exp(-pow((vW.x + vW.z * .28) * .0022, 2.0)) * smoothstep(20., 260., -vW.z);
        vec3 sunRefl = vec3(.98, .58, .35) * sunAxis * (.38 + .55 * smoothstep(.42, .82, rip));
        // 广州塔粉紫倒影
        float twAxis = exp(-pow((vW.x - 175.) * .018, 2.0)) * smoothstep(-450., -240., vW.z) * smoothstep(140., -200., vW.z);
        vec3 twRefl = vec3(.92, .42, .72) * twAxis * (.22 + .35 * rip);
        // 书塔暖金倒影
        float bkGlow = exp(-dist * .012) * .42;
        vec3 col = base + sunRefl + twRefl + vec3(.95, .72, .42) * bkGlow;
        // 远景雾融进地平线
        float fogK = smoothstep(500., 4200., dist);
        col = mix(col, vec3(.48, .32, .34), fogK * .82);
        gl_FragColor = vec4(col, 1.);
      }
    `,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000), waterMat);
  water.rotation.x = -Math.PI / 2;
  S.add(water);

  // 城市灯海（避开正前水路）
  {
    const r = rnd(23), pts = [], cols = [];
    const pal = [new THREE.Color('#FFCB7D'), new THREE.Color('#FF9F68'), new THREE.Color('#9ED8FF'), new THREE.Color('#FFD9A8')];
    for (let i = 0; i < 11000; i++) {
      const a = r() * Math.PI * 2, d = 180 + Math.pow(r(), .65) * 3200;
      const x = Math.cos(a) * d, z = Math.sin(a) * d - 260;
      if (Math.abs(x + z * .28) < 110 && z < 0 && d < 900) continue;
      pts.push(x, 1.2 + r() * 4.5, z);
      const c = pal[Math.floor(r() * pal.length)];
      cols.push(c.r, c.g, c.b);
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    pg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    S.add(new THREE.Points(pg, new THREE.PointsMaterial({ vertexColors: true, size: 2.6, sizeAttenuation: false, transparent: true, opacity: .85 })));
  }

  // 精装书塔：17,600 本，每本 3 厘米（总高 528 米，精确示意）
  const N = 17600, TH = .03;
  const books = new THREE.InstancedMesh(new THREE.BoxGeometry(.24, TH * .95, .17), new THREE.MeshStandardMaterial({ roughness: .72, metalness: .08 }), N);
  {
    const d = new THREE.Object3D(), col = new THREE.Color(), rb = rnd(8);
    const pal = ['#882E26', '#2C503C', '#293E64', '#9C733E', '#623A58', '#423E39', '#B3592E', '#697D52', '#DFCEA4', '#384D5A'];
    for (let i = 0; i < N; i++) {
      d.position.set((rb() - .5) * .022, TH * (i + .5), (rb() - .5) * .022);
      d.rotation.set(0, (rb() - .5) * .38, 0);
      const s = .86 + rb() * .28;
      d.scale.set(s, 1, .9 + rb() * .2);
      d.updateMatrix();
      books.setMatrixAt(i, d.matrix);
      books.setColorAt(i, col.set(pal[Math.floor(rb() * pal.length)]));
    }
    books.instanceColor.needsUpdate = true;
  }
  books.count = 1; S.add(books);

  // 远景书塔暖金光柱（拉远后凸显 528 米书塔的体量与暖金书页辉光）
  const colAuraMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uOp: { value: 0 }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `
      uniform float uOp; uniform float uTime; varying vec2 vUv;
      void main(){
        float pulse = .82 + .18 * sin(vUv.y * 28. - uTime * 3.5);
        float tip = smoothstep(1., .94, vUv.y) * smoothstep(0., .04, vUv.y);
        vec3 c = mix(vec3(1., .74, .38), vec3(1., .93, .72), vUv.y);
        gl_FragColor = vec4(c * pulse, uOp * tip * .65);
      }
    `,
  });
  const colAura = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 5.2, 1, 20, 1, true), colAuraMat);
  S.add(colAura);

  // 书塔每 2,000 本的金色标尺光环
  const ringCount = 9;
  const mileRings = [];
  for (let i = 0; i < ringCount; i++) {
    const rm = new THREE.Mesh(
      new THREE.RingGeometry(4.5, 5.8, 32),
      new THREE.MeshBasicMaterial({ color: '#FFE09E', transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    rm.rotation.x = -Math.PI / 2;
    rm.position.y = (i + 1) * 2000 * TH;
    S.add(rm);
    mileRings.push(rm);
  }

  // 螺旋升空的 280 张发光散落书页（Beat 2 动态 + 直接为转场 2 埋伏笔）
  const NPAGE = 280;
  const loosePages = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(4.2, 5.6),
    new THREE.MeshBasicMaterial({ color: '#FFF0CB', side: THREE.DoubleSide, transparent: true, opacity: .88, toneMapped: false }),
    NPAGE
  );
  const pageSeeds = [];
  {
    const rp = rnd(55);
    for (let i = 0; i < NPAGE; i++) {
      pageSeeds.push({ h: rp(), ang: rp() * Math.PI * 2, rad: 6 + Math.pow(rp(), .7) * 44, spd: .18 + rp() * .42, wob: rp() * 6.28, sc: .55 + rp() * 1.1 });
    }
  }
  loosePages.visible = false;
  S.add(loosePages);

  // 细微金色浮尘（近景用）
  const dust = makeTwinkleStars(260, 1.4, 31, 3.0);
  dust.points.position.set(0, .5, 0);
  S.add(dust.points);

  // 广州塔：核心发光柱 + 扭转双曲面骨架 + 观景光环 + 塔尖信标
  const towerBeacon = { mat: null };
  {
    const tw = new THREE.Group(), lines = [], NN = 28, sg = 36;
    const ell = y => {
      const t = y / 454;
      const a = lerp(40, 23, t) - 18 * Math.sin(Math.PI * t) * .9;
      const b = lerp(30, 19, t) - 12 * Math.sin(Math.PI * t) * .9;
      return [a, b];
    };
    for (const dir of [1, -1]) for (let i = 0; i < NN; i++) for (let j = 0; j < sg; j++) {
      const p = y => { const [a, b] = ell(y), ang = i / NN * Math.PI * 2 + dir * (y / 454) * Math.PI * .78; return [Math.cos(ang) * a, y, Math.sin(ang) * b]; };
      lines.push(...p(454 * j / sg), ...p(454 * (j + 1) / sg));
    }
    for (let j = 0; j <= 42; j++) {
      const y = j * 454 / 42, [a, b] = ell(y);
      for (let i = 0; i < 40; i++) {
        const a0 = i / 40 * Math.PI * 2, a1 = (i + 1) / 40 * Math.PI * 2;
        lines.push(Math.cos(a0) * a, y, Math.sin(a0) * b, Math.cos(a1) * a, y, Math.sin(a1) * b);
      }
    }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    tw.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#FF7EC0', transparent: true, opacity: .88 })));
    // 内部微光核心
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(11, 17, 448, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: '#6D356A', transparent: true, opacity: .28, side: THREE.DoubleSide })
    );
    core.position.y = 224; tw.add(core);
    // 天线与顶部信标
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(.9, 3.6, 146, 8), new THREE.MeshBasicMaterial({ color: '#FFD2E8' }));
    ant.position.y = 454 + 73; tw.add(ant);
    towerBeacon.mat = new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 1 });
    const bcn = new THREE.Mesh(new THREE.SphereGeometry(4.5, 12, 12), towerBeacon.mat);
    bcn.position.y = 602; tw.add(bcn);
    tw.position.set(175, 0, -290); S.add(tw);
  }

  // 立体古书题碑（卡片透明边距内缩实体背板，避免侧边露缝）
  const card = new Card('text'), cmap = tex(card.cv), CW = .23, CH = CW * card.cv.height / card.cv.width;
  const cm = new THREE.Group();
  const cFront = new THREE.Mesh(
    new THREE.PlaneGeometry(CW, CH),
    new THREE.MeshBasicMaterial({ map: cmap, transparent: true, toneMapped: false, side: THREE.DoubleSide })
  );
  cFront.position.z = .0075; cm.add(cFront);
  const cBack = new THREE.Mesh(
    new THREE.BoxGeometry(CW * .946, CH * .956, .013),
    new THREE.MeshStandardMaterial({ color: '#E4DFD4', roughness: .62 })
  );
  cm.add(cBack);
  S.add(cm);

  // Beat 1 神经网络特征扫描光面 + 漂浮提取字母层
  const scanBar = new THREE.Mesh(
    new THREE.PlaneGeometry(CW * 1.06, .012),
    new THREE.MeshBasicMaterial({ color: AI, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  );
  S.add(scanBar);
  const extCv = document.createElement('canvas'); extCv.width = 512; extCv.height = 128;
  {
    const ec = extCv.getContext('2d');
    ec.clearRect(0, 0, 512, 128);
    ec.fillStyle = 'rgba(10, 26, 40, 0.78)'; rr(ec, 58, 22, 396, 84, 14); ec.fill();
    ec.strokeStyle = AI; ec.lineWidth = 4; rr(ec, 58, 22, 396, 84, 14); ec.stroke();
    ec.font = '700 54px ui-monospace, "SF Mono", Menlo, monospace';
    ec.textAlign = 'center'; ec.textBaseline = 'middle';
    ec.fillStyle = '#8BEAFF'; ec.fillText('overlooks', 256, 66);
  }
  const extMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(CW * .76, CW * .19),
    new THREE.MeshBasicMaterial({ map: tex(extCv), transparent: true, opacity: 0, depthWrite: false, toneMapped: false })
  );
  S.add(extMesh);

  // 转场 1 浅灰验证页幕布（仅在 Beat 0 前 1.25 秒向下方褪开成暮光天空）
  const curtainMat = new THREE.MeshBasicMaterial({ color: '#E6EAEE', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), curtainMat);
  S.add(curtain);

  const tmpO = new THREE.Object3D();
  W.scene = S; W.camera = cam;
  W.resize = a => { cam.aspect = a; cam.updateProjectionMatrix(); W.port = a < 1; };

  W.update = (b, t) => {
    skyMat.uniforms.uTime.value = t + b * 12;
    waterMat.uniforms.uTime.value = t + b * 12;
    dust.mat.uniforms.uTime.value = t;
    towerBeacon.mat.opacity = .45 + .55 * (.5 + .5 * Math.sin(t * 3.2));

    // 转场 1（Beat 0 前 1.35 秒）
    const tr = b === 0 ? easeInOutCubic(seg(t, 0, TRANS_DUR.word)) : 1;
    curtain.visible = b === 0 && tr < .99;
    if (curtain.visible) {
      curtain.position.set(0, CH / 2 + TH - tr * 1.4, -.06 - tr * .8);
      curtain.rotation.x = tr * 1.1;
      curtainMat.opacity = 1 - seg(tr, .15, .95);
    }

    // 题卡绘制
    const inp = card.input, ver = card.verify;
    const wob = b === 0 ? .95 + .08 * Math.sin(t * 2.4) : b === 1 ? 1 - ease(seg(t, .15, 1.15)) : 0;
    const o = { t, panel: { prompt: ['第一题', '认出这个词', ''], wob } };
    if (b === 0) {
      const k1 = seg(t, 3.1, 3.75), k2 = seg(t, 4.45, 4.85);
      const p = k2 > 0 ? path(inp, ver, k2) : path([PN.w + 110, inp[1] - 320], inp, k1);
      o.cur = { x: p[0], y: p[1], who: 'ai', alpha: seg(t, 3.0, 3.2) };
      o.inputFocus = t > 3.8; o.typed = typed('overlooks', t, 3.85, 22);
      o.ok = seg(t, 4.9, 5.15) * (1 - seg(t, 5.6, 6.2));
    } else {
      o.typed = 'overlooks';
      o.stamp = b === 1 ? seg(t, .45, 1.05) : 1;
      o.cur = { x: ver[0], y: ver[1], who: 'ai', alpha: b === 1 ? 1 - seg(t, 1.0, 1.4) : 0 };
    }
    card.draw(o); cmap.needsUpdate = true;

    // 扫描光带与浮现的清晰字母（Beat 1）
    const scanK = b === 1 ? seg(t, .1, 1.15) : 0;
    scanBar.visible = b === 1 && scanK > 0 && scanK < 1;
    if (scanBar.visible) {
      scanBar.position.set(0, TH + CH * (.15 + .7 * (1 - scanK)), .015);
      scanBar.material.opacity = Math.sin(scanK * Math.PI) * .95;
    }
    extMesh.visible = b === 1 && t > .35;
    if (extMesh.visible) {
      const ek = ease(seg(t, .35, 1.1));
      extMesh.position.set(0, TH + CH * .26, .03 + ek * .025);
      extMesh.material.opacity = ek * .92;
    }

    // 书堆生长与镜头调度
    let n = 1, lie = 0, pull = 0;
    if (b === 2) {
      lie = ease(seg(t, 0, 1.0));
      const g = seg(t, 1.05, 6.2);
      n = Math.max(1, Math.round(1 + (N - 1) * (g * g * g * .58 + g * g * .42)));
      pull = easeInOutCubic(seg(t, 5.6, 8.8));
    }
    books.count = n;
    const top = n * TH;
    skyMat.uniforms.uAlt.value = pull;
    dust.points.visible = pull < .35;

    // 远景暖金光柱 + 千本标尺环 + 螺旋升空书页
    colAura.visible = b === 2 && top > 8;
    if (colAura.visible) {
      colAura.scale.set(1, top, 1);
      colAura.position.y = top / 2;
      colAuraMat.uniforms.uOp.value = seg(top, 8, 120) * (.45 + .55 * pull);
      colAuraMat.uniforms.uTime.value = t;
    }
    mileRings.forEach((rm, idx) => {
      const targetY = (idx + 1) * 2000 * TH;
      rm.visible = b === 2 && top >= targetY && pull > .1;
      if (rm.visible) {
        const pulse = .6 + .4 * Math.sin(t * 2.5 - idx * .6);
        rm.material.opacity = seg(pull, .1, .55) * .45 * pulse;
        const sc = 1 + .15 * Math.sin(t * 1.4 + idx);
        rm.scale.set(sc, sc, 1);
      }
    });

    loosePages.visible = b === 2 && top > 20;
    if (loosePages.visible) {
      const lpOp = seg(top, 20, 140);
      loosePages.material.opacity = lpOp * .85;
      for (let i = 0; i < NPAGE; i++) {
        const ps = pageSeeds[i];
        const hh = ((ps.h + t * ps.spd * .045) % 1) * top;
        const ang = ps.ang + t * ps.spd;
        const rad = ps.rad * (.5 + .5 * (hh / Math.max(top, 1)));
        tmpO.position.set(Math.cos(ang) * rad, hh, Math.sin(ang) * rad);
        tmpO.rotation.set(t * ps.spd * 1.5 + ps.wob, ang + Math.PI / 2, Math.sin(t * 2 + ps.wob) * .5);
        tmpO.scale.setScalar(ps.sc * (.4 + .6 * pull));
        tmpO.updateMatrix();
        loosePages.setMatrixAt(i, tmpO.matrix);
      }
      loosePages.instanceMatrix.needsUpdate = true;
    }

    cm.position.set(0, top + lerp(CH / 2 + .004, .009, lie), 0);
    cm.rotation.set(-Math.PI / 2 * lie, 0, 0);

    const port = W.port ? 1.72 : 1;
    const ox = W.port ? 0 : -.085, oy = W.port ? -.045 : .016;
    if (b === 0) {
      // 转场 1：从正对居中题卡 -> 微微退开至右侧构图，露出暮光云海
      const cx = lerp(0, ox, tr) + Math.sin(t * .4) * .006 * tr;
      const cy = lerp(CH / 2 + TH, CH / 2 + TH + oy, tr);
      const cz = lerp(.36 * port, .43 * port, tr);
      cam.position.set(cx, cy, cz);
      cam.lookAt(lerp(0, ox, tr), cy, 0);
    } else if (b === 1) {
      // Beat 1：大弧度摇移至低机位 3/4 仰角 + 99.8% 盖章震动（把题卡留在右侧，给左上标题留足呼吸空间）
      const arc = easeInOutCubic(seg(t, 0, 1.6));
      const imp = seg(t, .85, 1.15);
      const shake = imp > 0 && imp < 1 ? Math.sin(imp * 34) * (1 - imp) * .008 : 0;
      const cx = lerp(ox, -.28, arc) + shake;
      const cy = lerp(CH / 2 + TH + oy, CH * .46 + TH, arc) + shake * .6;
      const cz = lerp(.43 * port, .46 * port, arc);
      cam.position.set(cx, cy, cz);
      cam.lookAt(lerp(ox, W.port ? 0 : -.095, arc), CH * .54 + TH, lerp(0, -.06, arc));
    } else {
      // Beat 2：跟随书堆从 0.5m 飙升至 528m，再大拉远至 1100m 俯瞰书塔 + 广州塔
      const k0 = ease(seg(t, 0, 1.1));
      const startPos = v3(-.28, CH * .46 + TH, .46 * port);
      const startTar = v3(W.port ? 0 : -.095, CH * .54 + TH, -.06);
      const fpos = v3(.38 + top * .52, top * .80 + .34, .48 + top * 1.02);
      const ftar = v3(0, top * .88, 0);
      const wpos = v3(470, 250, 1120 * port);
      const wtar = v3(85, 300, -140);
      const p = new THREE.Vector3().lerpVectors(startPos, fpos, k0);
      const q = new THREE.Vector3().lerpVectors(startTar, ftar, k0);
      cam.position.lerpVectors(p, wpos, pull);
      cam.position.x += Math.sin(t * .25) * 14 * pull;
      cam.lookAt(new THREE.Vector3().lerpVectors(q, wtar, pull));
    }

    const labels = [];
    if (b === 2 && t > 1.2) {
      labels.push({ p: v3(.2 + pull * 6, top + .05 + pull * 14, 0), text: fmt(n) + ' 本', cls: 'num' });
    }
    if (b === 2 && pull > .5) {
      labels.push({ p: v3(175, 616, -290), text: '广州塔', cls: 'tag', alpha: seg(pull, .5, .88) });
    }
    return { labels };
  };
  return W;
}

// =====================================================================
// 第 3 场：grid（第二题·认图 — 雨夜反光街景 + 激光扫门牌 + 10 人验证剧场 — 3 拍）
// 转场 2：9 张发光书页从暮夜远空旋入，空中翻面拼合成 3×3 立体红绿灯九宫格面板
// =====================================================================
function gridWorld() {
  const W = { ink: 'light', port: false }, S = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(48, 16 / 9, .04, 15000);
  S.background = new THREE.Color('#090E1C');
  S.fog = new THREE.FogExp2('#0B1224', .0024);

  S.add(new THREE.HemisphereLight('#6884C4', '#18131A', 1.05));
  const moon = new THREE.DirectionalLight('#86B0FF', .85); moon.position.set(-40, 120, 60); S.add(moon);

  // 夜空渐变穹顶（微带城市光污染）
  S.add(new THREE.Mesh(new THREE.SphereGeometry(8000, 28, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `varying vec3 vD; void main(){
      float h = vD.y;
      vec3 c = mix(vec3(.13, .16, .28), vec3(.03, .05, .10), smoothstep(0., .45, h));
      c += vec3(.22, .12, .14) * exp(-abs(h) * 14.) * .55;
      gl_FragColor = vec4(c, 1.);
    }`,
  })));

  // 雨夜积水反光柏油路着色器
  const roadMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScanZ: { value: 999 }, uScanOn: { value: 0 } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float uTime; uniform float uScanZ; uniform float uScanOn; varying vec3 vW;
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
        return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        float ax = abs(vW.x);
        float puddle = smoothstep(.35, .75, n2(vW.xz * .18));
        float rip = n2(vW.xz * 1.4 + vec2(0., uTime * 1.6));
        vec3 col = ax < 7.2 ? vec3(.06, .07, .10) : vec3(.10, .10, .12);
        // 车道中央虚线与边线
        float dash = step(ax, .16) * step(.42, fract(-vW.z * .12));
        float edge = smoothstep(.12, .02, abs(ax - 6.8));
        col = mix(col, vec3(.82, .76, .62), dash * .8 + edge * .45);
        // 两侧霓虹暖黄建筑窗光倒影
        float sideGlow = smoothstep(2.2, 7.2, ax) * smoothstep(9.5, 7.0, ax);
        float winStrip = .5 + .5 * sin(vW.z * .65 + rip * 2.5);
        col += vec3(.95, .64, .30) * sideGlow * puddle * winStrip * .45;
        // 路灯红绿倒影
        float tlStrip = exp(-pow(fract(-vW.z / 34. + .5) - .5, 2.) * 28.) * smoothstep(2.5, 6.2, ax) * smoothstep(8.2, 5.5, ax);
        vec3 tlCol = mix(vec3(.2, .9, .5), vec3(.95, .28, .22), step(.5, fract(uTime * .22 + floor(-vW.z / 34.) * .31)));
        col += tlCol * tlStrip * (.25 + .6 * puddle);
        // 青色激光扫描面在地面的高光带
        float scanLine = exp(-abs(vW.z - uScanZ) * .55) * uScanOn;
        col += vec3(.24, .85, 1.) * scanLine * (.8 + .7 * puddle);
        // 距离雾
        float d = length(vW.xz - vec2(0., uScanZ + 20.));
        col = mix(col, vec3(.043, .07, .14), smoothstep(140., 680., abs(vW.z - min(0., uScanZ + 40.))));
        gl_FragColor = vec4(col, 1.);
      }
    `,
  });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(42, 2400), roadMat);
  road.rotation.x = -Math.PI / 2; road.position.set(0, 0, -1180); S.add(road);

  // 两侧建筑群（140 栋 × 2）
  const NB = 140;
  const winCv = document.createElement('canvas'); winCv.width = 256; winCv.height = 512;
  {
    const wc = winCv.getContext('2d'), r0 = rnd(14);
    wc.fillStyle = '#1B2130'; wc.fillRect(0, 0, 256, 512);
    for (let y = 14; y < 490; y += 28) {
      for (let x = 12; x < 244; x += 26) {
        const k = r0();
        wc.fillStyle = k < .26 ? '#F6CA78' : k < .36 ? '#85D0FF' : k < .42 ? '#FFB07B' : '#101521';
        wc.fillRect(x, y, 16, 17);
      }
    }
  }
  const wt = tex(winCv); wt.wrapS = wt.wrapT = THREE.RepeatWrapping;
  const bm = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ map: wt, emissiveMap: wt, emissive: '#FFFFFF', emissiveIntensity: .48, roughness: .85 }),
    NB * 2
  );
  // 门牌发光板 + OCR 青色识别角标框
  const plateCv = document.createElement('canvas'); plateCv.width = 128; plateCv.height = 72;
  {
    const pc = plateCv.getContext('2d');
    pc.fillStyle = '#FFF7E2'; rr(pc, 4, 4, 120, 64, 8); pc.fill();
    pc.strokeStyle = '#3CC6EA'; pc.lineWidth = 6; rr(pc, 4, 4, 120, 64, 8); pc.stroke();
    pc.fillStyle = '#141822'; pc.font = MONO(34); pc.textAlign = 'center'; pc.textBaseline = 'middle'; pc.fillText('1847', 64, 38);
  }
  const plates = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1.5, .85),
    new THREE.MeshBasicMaterial({ map: tex(plateCv), color: '#FFFFFF', toneMapped: false }),
    NB * 2
  );
  const ocrFrames = new THREE.InstancedMesh(
    new THREE.RingGeometry(.95, 1.06, 4),
    new THREE.MeshBasicMaterial({ color: AI, transparent: true, opacity: .9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    NB * 2
  );
  const tmp = new THREE.Object3D();
  {
    const col = new THREE.Color(), rb = rnd(12);
    for (let s = 0; s < 2; s++) for (let i = 0; i < NB; i++) {
      const k = s * NB + i, h = 14 + rb() * 38, side = s ? 1 : -1;
      tmp.position.set(side * 15.2, h / 2, -i * 11 - 6);
      tmp.rotation.set(0, 0, 0); tmp.scale.set(14, h, 10.2); tmp.updateMatrix();
      bm.setMatrixAt(k, tmp.matrix);
      bm.setColorAt(k, col.setHSL(.58 + rb() * .08, .22, .38 + rb() * .18));
      tmp.position.set(side * 8.12, 3.6, -i * 11 - 6);
      tmp.rotation.set(0, -side * Math.PI / 2, 0); tmp.scale.set(1, 1, 1); tmp.updateMatrix();
      plates.setMatrixAt(k, tmp.matrix);
      plates.setColorAt(k, col.set('#181D2B'));
      tmp.rotation.set(0, -side * Math.PI / 2, Math.PI / 4); tmp.scale.set(0, 0, 0); tmp.updateMatrix();
      ocrFrames.setMatrixAt(k, tmp.matrix);
    }
    bm.instanceColor.needsUpdate = true; plates.instanceColor.needsUpdate = true;
  }
  S.add(bm); S.add(plates); S.add(ocrFrames);

  // 两侧真实 3D 红绿灯杆（18 对）
  const NTL = 18;
  const tlLamps = [];
  {
    const poleMat = new THREE.MeshStandardMaterial({ color: '#3B4252', metalness: .6, roughness: .4 });
    const boxMat = new THREE.MeshStandardMaterial({ color: '#1B1E26', roughness: .6 });
    const poleGeo = new THREE.CylinderGeometry(.08, .1, 6.2, 8);
    const armGeo = new THREE.BoxGeometry(2.2, .12, .12);
    const headGeo = new THREE.BoxGeometry(.42, 1.15, .36);
    const lampGeo = new THREE.SphereGeometry(.12, 10, 10);
    for (let i = 0; i < NTL; i++) for (const side of [-1, 1]) {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(poleGeo, poleMat); pole.position.y = 3.1; g.add(pole);
      const arm = new THREE.Mesh(armGeo, poleMat); arm.position.set(-side * 1.0, 5.9, 0); g.add(arm);
      const head = new THREE.Mesh(headGeo, boxMat); head.position.set(-side * 1.9, 5.4, 0); g.add(head);
      const mats = ['#FF443B', '#FFB73B', '#3EE07A'].map(c => new THREE.MeshBasicMaterial({ color: c, toneMapped: false }));
      mats.forEach((m, li) => {
        const sp = new THREE.Mesh(lampGeo, m);
        sp.position.set(-side * 1.9, 5.72 - li * .32, .18);
        g.add(sp);
      });
      g.position.set(side * 7.1, 0, -14 - i * 34);
      S.add(g);
      tlLamps.push({ mats, phase: i * .7 + (side > 0 ? 1.5 : 0) });
    }
  }

  // 青色视觉激光扫描幕（Beat 1 沿街推进）
  const scanMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uOp: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform float uOp; varying vec2 vUv; void main(){
      float edge = smoothstep(.0, .12, vUv.x) * smoothstep(1., .88, vUv.x);
      float topFade = smoothstep(1., .15, vUv.y);
      float grid = smoothstep(.9, 1., sin(vUv.x * 60.) * .5 + .5) * .35 + smoothstep(.92, 1., sin(vUv.y * 40.) * .5 + .5) * .35;
      gl_FragColor = vec4(vec3(.24, .82, 1.), (.22 + grid) * edge * topFade * uOp);
    }`,
  });
  const scanPlane = new THREE.Mesh(new THREE.PlaneGeometry(17.5, 26), scanMat);
  scanPlane.position.y = 13; S.add(scanPlane);

  // 升空的数据粒子流（被识别的门牌向上腾起）
  const dataSparks = makeTwinkleStars(320, 45, 73, 3.2);
  S.add(dataSparks.points);

  // ---- 真正的 9 块独立立体九宫格题卡（支持转场 2 书页翻折拼合 + Beat 0 立体按压 + Beat 1 炸开成街门）----
  const cardGroup = new THREE.Group();
  S.add(cardGroup);
  const frameCv = document.createElement('canvas'); frameCv.width = 780; frameCv.height = 1080;
  const frameTex = tex(frameCv);
  const frameMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1080 / 780),
    new THREE.MeshBasicMaterial({ map: frameTex, transparent: true, toneMapped: false, side: THREE.DoubleSide })
  );
  cardGroup.add(frameMesh);

  // 9 块独立 3D 图块：正面是街景小图，背面是暖金旧书页（转场 2 空中翻面！）
  const backPageCv = document.createElement('canvas'); backPageCv.width = backPageCv.height = 256;
  {
    const bc = backPageCv.getContext('2d');
    const gr = bc.createLinearGradient(0, 0, 256, 256); gr.addColorStop(0, '#F5E8C8'); gr.addColorStop(1, '#DECAA0');
    bc.fillStyle = gr; bc.fillRect(0, 0, 256, 256);
    bc.fillStyle = 'rgba(70,52,32,.35)';
    for (let y = 32; y < 224; y += 22) bc.fillRect(28, y, 160 + (y * 19 % 44), 8);
  }
  const backMat = new THREE.MeshBasicMaterial({ map: tex(backPageCv), toneMapped: false });
  const tileSideMat = new THREE.MeshBasicMaterial({ color: '#DDE4EE' });
  const tileMeshes = [];
  for (let i = 0; i < 9; i++) {
    const tcv = document.createElement('canvas'); tcv.width = tcv.height = 256;
    const tmap = tex(tcv);
    const frontMat = new THREE.MeshBasicMaterial({ map: tmap, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(.305, .305, .025), [tileSideMat, tileSideMat, tileSideMat, tileSideMat, frontMat, backMat]);
    cardGroup.add(mesh);
    tileMeshes.push({ mesh, cv: tcv, map: tmap, col: i % 3, row: Math.floor(i / 3) });
  }
  const drawTileMesh = (tm, idx, selected) => {
    const tc = tm.cv.getContext('2d');
    tc.clearRect(0, 0, 256, 256);
    tile(tc, GRID9[idx], 0, 0, 256, idx * 13 + 5);
    if (selected) {
      tc.strokeStyle = AI; tc.lineWidth = 14; tc.strokeRect(7, 7, 242, 242);
      tc.fillStyle = C.blue; tc.beginPath(); tc.arc(38, 38, 22, 0, Math.PI * 2); tc.fill();
      check(tc, 22, 22, 32, 1, '#FFFFFF');
    }
    tm.map.needsUpdate = true;
  };
  const drawFrame = (ok, curPos, curAlpha) => {
    const fc = frameCv.getContext('2d');
    fc.clearRect(0, 0, 780, 1080);
    fc.fillStyle = '#FFFFFF'; rr(fc, 0, 0, 780, 1080, 8); fc.fill();
    fc.fillStyle = C.blue; fc.fillRect(10, 10, 760, 175);
    fc.fillStyle = '#FFFFFF'; fc.textBaseline = 'alphabetic';
    fc.font = FONT(4, 30); fc.fillText('第二题 · 选出所有', 36, 68);
    fc.font = FONT(9, 56); fc.fillText('红绿灯', 36, 138);
    // 底栏
    fc.strokeStyle = C.edge; fc.lineWidth = 2; fc.beginPath(); fc.moveTo(0, 970); fc.lineTo(780, 970); fc.stroke();
    fc.fillStyle = ok > .1 ? '#1E9E5A' : C.blue; rr(fc, 560, 992, 198, 68, 5); fc.fill();
    fc.fillStyle = '#FFFFFF'; fc.font = FONT(7, 30); fc.textAlign = 'center'; fc.textBaseline = 'middle';
    fc.fillText(ok > .1 ? '已通过' : '验证', 659, 1026);
    fc.textAlign = 'left'; fc.fillStyle = '#9AA0A6'; fc.font = FONT(4, 42); fc.fillText('↻', 34, 1026);
    if (ok > 0) { fc.strokeStyle = '#1E9E5A'; fc.lineWidth = 10; fc.globalAlpha = ok; fc.strokeRect(5, 5, 770, 1070); fc.globalAlpha = 1; }
    if (curAlpha > 0 && curPos) cursor(fc, curPos[0], curPos[1], 56, 'ai', curAlpha);
    frameTex.needsUpdate = true;
  };

  // ---- Beat 2：12306 难辨题墙 + 10 人半圆形验证剧场（3 座失败红框带旋转刷新环）----
  const stage2 = new THREE.Group();
  stage2.visible = false;
  S.add(stage2);

  // 12306 八宫格小物件迷惑墙
  const g8Cv = document.createElement('canvas'); g8Cv.width = 820; g8Cv.height = 680;
  {
    const gc = g8Cv.getContext('2d');
    panel(gc, 20, 14, 'grid8', { prompt: ['请点击下图中所有的', '香菜 / 山楂 / 爬山虎', ''], kinds: GRID8 });
  }
  const g8Mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 18 * 680 / 820),
    new THREE.MeshBasicMaterial({ map: tex(g8Cv), transparent: true, opacity: .94, toneMapped: false })
  );
  g8Mesh.position.set(0, 4.6, -12);
  stage2.add(g8Mesh);

  // 10 座真人光标验证台（7 绿勾，3 猩红失败+自转刷新环）
  const FAIL_SET = new Set([2, 5, 8]);
  const pods = [];
  for (let i = 0; i < 10; i++) {
    const pcv = document.createElement('canvas'); pcv.width = 220; pcv.height = 300;
    const pmap = tex(pcv);
    const pmesh = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 4.2), new THREE.MeshBasicMaterial({ map: pmap, transparent: true, toneMapped: false, side: THREE.DoubleSide }));
    const ang = lerp(-.68, .68, i / 9);
    pmesh.position.set(Math.sin(ang) * 23, -3.5, -Math.cos(ang) * 14 + 6);
    pmesh.rotation.y = -ang * .8;
    stage2.add(pmesh);
    pods.push({ i, cv: pcv, map: pmap, mesh: pmesh, fail: FAIL_SET.has(i), baseY: -3.5 });
  }
  const drawPod = (pod, t) => {
    const pc = pod.cv.getContext('2d');
    pc.clearRect(0, 0, 220, 300);
    const appear = seg(t, .25 + pod.i * .09, .55 + pod.i * .09);
    if (appear <= 0) { pod.map.needsUpdate = true; return; }
    const res = seg(t, 1.35 + pod.i * .08, 1.7 + pod.i * .08);
    // 卡片底
    pc.save(); pc.globalAlpha = appear;
    pc.fillStyle = pod.fail && res > .2 ? 'rgba(54,14,18,.88)' : 'rgba(18,26,44,.82)';
    rr(pc, 14, 18, 192, 264, 14); pc.fill();
    pc.strokeStyle = res > .2 ? (pod.fail ? '#FF453A' : '#3DE07D') : 'rgba(140,170,220,.45)';
    pc.lineWidth = res > .2 ? 5 : 2; rr(pc, 14, 18, 192, 264, 14); pc.stroke();
    // 白色人类光标
    cursor(pc, 84, 52, 82, 'me', appear);
    if (res > 0) {
      pc.globalAlpha = res;
      if (pod.fail) {
        // 旋转刷新圆环（直接为转场 3 埋视觉种子！）
        pc.save(); pc.translate(110, 198); pc.rotate(t * 3.8 + pod.i);
        pc.strokeStyle = '#FF5248'; pc.lineWidth = 8; pc.lineCap = 'round';
        pc.beginPath(); pc.arc(0, 0, 34, 0, Math.PI * 1.45); pc.stroke();
        // 箭头
        pc.beginPath(); pc.moveTo(28, -16); pc.lineTo(36, 4); pc.lineTo(18, -2); pc.stroke();
        pc.restore();
        pc.fillStyle = '#FF8A80'; pc.font = FONT(6, 22); pc.textAlign = 'center'; pc.fillText('验证失败', 110, 262);
      } else {
        check(pc, 74, 162, 72, res, '#42E688');
        pc.fillStyle = '#9BF5C0'; pc.font = FONT(5, 22); pc.textAlign = 'center'; pc.fillText('通过', 110, 262);
      }
    }
    pc.restore();
    pod.map.needsUpdate = true;
  };

  const warm = new THREE.Color('#FFD27A'), off = new THREE.Color('#191E2D'), cc = new THREE.Color();
  const tileOriginSeeds = [[-2.6, 2.2, -9], [0, 3.1, -11], [2.8, 2.4, -10], [-3.2, .4, -8], [0, 1.2, -13], [3.1, .6, -9], [-2.5, -1.6, -10], [.2, -2.0, -11], [2.9, -1.5, -9]];

  W.scene = S; W.camera = cam;
  W.resize = a => { cam.aspect = a; cam.updateProjectionMatrix(); W.port = a < 1; };

  W.update = (b, t) => {
    roadMat.uniforms.uTime.value = t + b * 10;
    dataSparks.mat.uniforms.uTime.value = t;
    // 红绿灯自主交替
    tlLamps.forEach(tl => {
      const state = Math.floor((t * .38 + tl.phase) % 3);
      tl.mats.forEach((m, li) => { m.color.setHex(li === state ? [0xFF453A, 0xFFB830, 0x3CE87B][li] : 0x222630); });
    });

    const port = W.port ? 1.55 : 1;
    const lights = new Set([0, 4, 8]);
    const tr = b === 0 ? easeInOutCubic(seg(t, 0, TRANS_DUR.grid)) : 1;

    // Beat 0 九宫格抢答 + Beat 1 炸开成街门
    let dolly = 0, burst = 0, rise = 0;
    if (b === 1) {
      burst = easeInOutCubic(seg(t, 0, 1.25));
      dolly = easeInOutCubic(seg(t, .45, 9.6));
    }
    if (b === 2) {
      burst = 1; dolly = 1;
      rise = easeInOutCubic(seg(t, 0, 2.1));
    }

    // 九宫格绘制与 9 块立体位姿
    cardGroup.visible = b < 2;
    if (cardGroup.visible) {
      const sel = new Set();
      let curPos = null, curA = 0, ok = 0;
      if (b === 0) {
        const ts = [1.85, 2.08, 2.30];
        let p = [880, 100];
        const tilePt = i => [138 + (i % 3) * 252, 315 + Math.floor(i / 3) * 252];
        p = path(p, tilePt(0), seg(t, 1.4, 1.82));
        if (t > ts[0]) { sel.add(0); p = path(tilePt(0), tilePt(4), seg(t, ts[0] + .02, ts[1])); }
        if (t > ts[1]) { sel.add(4); p = path(tilePt(4), tilePt(8), seg(t, ts[1] + .02, ts[2])); }
        if (t > ts[2]) { sel.add(8); p = path(tilePt(8), [660, 1026], seg(t, ts[2] + .04, 2.68)); }
        curPos = p; curA = seg(t, 1.38, 1.5); ok = seg(t, 2.75, 3.0);
      } else {
        lights.forEach(i => sel.add(i)); ok = 1;
      }
      drawFrame(ok, curPos, curA);
      frameMesh.material.opacity = tr * (1 - seg(burst, 0, .55));
      const cardScale = W.port ? .34 : .44;
      cardGroup.scale.setScalar(cardScale);
      cardGroup.position.set(W.port ? 0 : .26, W.port ? 1.56 : 1.66, 4 - .96 * port);
      cardGroup.rotation.set(0, Math.sin(t * .45) * .04 * (1 - burst), 0);

      tileMeshes.forEach((tm, i) => {
        drawTileMesh(tm, i, sel.has(i));
        const gx = (tm.col - 1) * .32, gy = (.315 - tm.row * .32) - .06;
        const press = sel.has(i) ? -.012 : 0;  // CC 11-27：原 -.045 沉到题卡白底后面，被选中的红绿灯整格看不见
        if (b === 0) {
          // 转场 2：9 张书页从暮夜天空翻面飞合进九宫格！
          const tk = easeInOutCubic(seg(t, i * .045, .88 + i * .045));
          const orig = tileOriginSeeds[i];
          tm.mesh.position.set(lerp(orig[0], gx, tk), lerp(orig[1], gy, tk), lerp(orig[2], .02 + press, tk));
          tm.mesh.rotation.set(lerp(.6 * (i % 2 ? 1 : -1), 0, tk), lerp(Math.PI, 0, tk), lerp(.4, 0, tk));
        } else {
          // Beat 1：9 块图块向左右炸开成霓虹大道之门！
          const side = tm.col === 0 ? -1 : tm.col === 2 ? 1 : (tm.row === 0 ? -1 : 1);
          const bk = easeInOutCubic(seg(burst, i * .03, .85));
          tm.mesh.position.set(gx + side * bk * 6.5, gy + (1 - tm.row) * bk * 1.8, .02 + press + bk * 4.5);
          tm.mesh.rotation.set(bk * .4, side * bk * 1.4, side * bk * .3);
        }
      });
    }

    // 激光扫描面与门牌逐排爆亮
    const camZ = lerp(4, -380, dolly);
    const scanZ = b === 1 ? camZ - 16 - 48 * seg(t, .5, 2.5) : -999;
    scanPlane.visible = b === 1 && t > .35;
    scanPlane.position.z = scanZ;
    scanMat.uniforms.uOp.value = b === 1 ? seg(t, .35, 1.0) : 0;
    roadMat.uniforms.uScanZ.value = scanZ;
    roadMat.uniforms.uScanOn.value = b === 1 ? seg(t, .35, 1.0) : 0;

    const litCount = b === 1 ? Math.max(0, Math.floor((-scanZ - 4) / 11)) : b === 2 ? NB : 0;
    for (let i = 0; i < NB; i++) {
      const on = b === 1 ? (i < litCount ? 1 : i < litCount + 2 ? (litCount + 2 - i) / 3 : 0) : b === 2 ? 1 : 0;
      for (let s = 0; s < 2; s++) {
        const idx = s * NB + i, side = s ? 1 : -1;
        plates.setColorAt(idx, cc.copy(off).lerp(warm, on).multiplyScalar(1 + on * 1.3));
        const fSc = (b === 1 && on > .1) ? lerp(1.6, 1.05, on) : 0;
        tmp.position.set(side * 8.05, 3.6, -i * 11 - 6);
        tmp.rotation.set(0, -side * Math.PI / 2, Math.PI / 4);
        tmp.scale.set(fSc, fSc * .62, 1); tmp.updateMatrix();
        ocrFrames.setMatrixAt(idx, tmp.matrix);
      }
    }
    plates.instanceColor.needsUpdate = true;
    ocrFrames.instanceMatrix.needsUpdate = true;

    dataSparks.points.visible = b >= 1;
    dataSparks.points.position.set(0, 12 + (t * 4) % 18, camZ - 40);
    dataSparks.mat.uniforms.uAlpha.value = b === 1 ? .85 : .45;

    // 镜头运动
    if (b === 0) {
      cam.position.set(0, lerp(3.4, 1.7, tr), 4);
      cam.lookAt(0, lerp(2.2, 1.7, tr), -16);
    } else if (b === 1) {
      const roll = Math.sin(t * .6) * .025 * seg(t, .6, 2.0);
      cam.position.set(Math.sin(t * .45) * .6, 2.0 + Math.sin(t * .9) * .12, camZ);
      cam.lookAt(0, 2.2, camZ - 40);
      cam.rotation.z = roll;
    } else {
      // Beat 2：垂直拉升俯瞰暗夜灯海 + 展开 10 人验证剧场
      cam.position.set(0, lerp(2.0, 260, rise), lerp(camZ, camZ + 120, rise));
      cam.lookAt(0, lerp(2.2, 232, rise), lerp(camZ - 40, camZ - 160, rise));
    }

    // 挂在 Beat 2 镜头前方的 10 人剧场
    stage2.visible = b === 2 && t > .25;
    if (stage2.visible) {
      const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
      const dist = W.port ? 46 : 33;
      stage2.position.copy(cam.position).addScaledVector(dir, dist);
      stage2.quaternion.copy(cam.quaternion);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
      stage2.position.addScaledVector(up, W.port ? -4.5 : -2.6);
      const sc2 = easeOut(seg(t, .25, 1.15));
      stage2.scale.setScalar(sc2);
      pods.forEach(p => {
        drawPod(p, t);
        const failShake = p.fail && t > 1.5 && t < 2.2 ? Math.sin(t * 42) * .28 : 0;
        p.mesh.position.y = p.baseY + failShake + Math.sin(t * 1.4 + p.i) * .14;
      });
    }

    const labels = [];
    if (b === 1 && t > .9) {
      const v = 99_000_000 * (1 - Math.exp(-3.4 * dolly)) / (1 - Math.exp(-3.4));
      labels.push({ p: v3(0, 8.2, Math.max(scanZ - 18, camZ - 70)), text: fmt(v), cls: 'num' });
    }
    if (b === 2 && t > 1.8) {
      stage2.updateMatrixWorld(true);
      const p70 = v3(0, 12.6, -12).applyMatrix4(stage2.matrixWorld);
      labels.push({ p: p70, text: '70%', cls: 'num', alpha: seg(t, 1.8, 2.3) });
    }
    return { labels };
  };
  return W;
}

// =====================================================================
// 第 4 场：check（第三题·点一下 — 日光磨砂玻璃光学实验台 + X 光解剖 + 双道竞速 — 3 拍）
// 转场 3：grid.2 旋转的失败刷新环迎面放大倾倒成地面光学罗盘，日光从中心扫亮整座实验台
// =====================================================================
function checkWorld() {
  const W = { ink: 'dark', port: false }, S = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(40, 16 / 9, .1, 2000);
  const darkCol = new THREE.Color('#0B1224'), lightCol = new THREE.Color('#EDF1F6');
  S.background = lightCol.clone();
  S.fog = new THREE.Fog('#EDF1F6', 32, 130);

  const hemi = new THREE.HemisphereLight('#FFFFFF', '#CBD3DE', 2.1); S.add(hemi);
  const sun = new THREE.DirectionalLight('#FFFBF2', 1.6); sun.position.set(-8, 18, 10); S.add(sun);

  // 磨砂玻璃光学实验台着色器（支持日光扩散波 + X 光行为遥测透视）
  const floorMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uDay: { value: 1 }, uXray: { value: 0 }, uRipple: { value: 0 }, uRipple2: { value: 0 } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float uTime; uniform float uDay; uniform float uXray; uniform float uRipple; uniform float uRipple2; varying vec3 vW;
      void main(){
        vec2 p = vW.xz;
        float r1 = length(p);
        float r2 = length(p - vec2(8.8, 0.));
        // 细密工程网格 + 大刻度网格
        vec2 g1 = abs(fract(p * 1.0 - .5) - .5) / max(.001, fwidth(p.x * 1.0));
        float minor = 1. - min(min(g1.x, g1.y), 1.);
        vec2 g5 = abs(fract(p * .2 - .5) - .5) / max(.001, fwidth(p.x * .2));
        float major = 1. - min(min(g5.x, g5.y), 1.);
        // 光学罗盘同心环
        float ring = smoothstep(.08, .01, abs(r1 - 3.6)) + smoothstep(.05, .01, abs(r1 - 5.4)) * .5;
        // 昼夜扩散波（完全覆盖至地平线外，避免竖屏远景出现暗边）
        float dayMask = uDay >= .995 ? 1. : smoothstep(uDay * 240. + 4., uDay * 240. - 18., r1);
        vec3 dayCol = mix(vec3(.93, .95, .97), vec3(.84, .88, .92), minor * .18 + major * .38);
        // X 光地下遥测网格（Beat 1）
        float scan = smoothstep(.6, .0, abs(fract(p.x * .08 - uTime * .28) - .5) * 14.);
        vec3 xrayCol = mix(vec3(.84, .89, .95), vec3(.22, .48, .82), minor * .28 + major * .55 + scan * .25);
        dayCol = mix(dayCol, xrayCol, uXray * .78);
        dayCol = mix(dayCol, vec3(.32, .56, .88), ring * .55);
        // 点击光学声呐涟漪
        if (uRipple > 0. && uRipple < 1.) {
          float rip = smoothstep(.55, .0, abs(r1 - (1.8 + uRipple * 18.))) * (1. - uRipple);
          dayCol = mix(dayCol, vec3(.14, .72, .45), rip * .75);
        }
        if (uRipple2 > 0. && uRipple2 < 1.) {
          float rip2 = smoothstep(.55, .0, abs(r2 - (1.8 + uRipple2 * 18.))) * (1. - uRipple2);
          dayCol = mix(dayCol, vec3(.24, .78, .94), rip2 * .85);
        }
        // 远景柔和融进日光天空
        dayCol = mix(dayCol, vec3(.93, .945, .965), smoothstep(26., 115., r1));
        vec3 nightCol = vec3(.043, .07, .14) + vec3(.15, .3, .5) * ring * .35;
        vec3 col = mix(nightCol, dayCol, dayMask);
        gl_FragColor = vec4(col, 1.);
      }
    `,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), floorMat);
  floor.rotation.x = -Math.PI / 2; S.add(floor);

  // 转场 3 旋转刷新环 -> 地面光学罗盘
  const compassGroup = new THREE.Group();
  const compassRing = new THREE.Mesh(
    new THREE.RingGeometry(2.6, 2.95, 64, 1, 0, Math.PI * 1.65),
    new THREE.MeshBasicMaterial({ color: '#FF5248', side: THREE.DoubleSide, transparent: true, opacity: .95 })
  );
  compassGroup.add(compassRing);
  S.add(compassGroup);

  // 立体玻璃倒角勾选框（带物理可下压按钮芯）
  const mkBox = xPos => {
    const group = new THREE.Group();
    group.position.set(xPos, 0, 0);
    // 外框
    const frameMat = new THREE.MeshStandardMaterial({ color: '#CFD6DF', metalness: .35, roughness: .28 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.35, .26, 3.35), frameMat);
    base.position.y = .13; group.add(base);
    // 可按压内芯
    const cv = document.createElement('canvas'); cv.width = cv.height = 512; const m = tex(cv);
    const topMat = new THREE.MeshStandardMaterial({ map: m, roughness: .35, metalness: .05 });
    const sideMat = new THREE.MeshStandardMaterial({ color: '#E4E8EE', roughness: .5 });
    const plunger = new THREE.Mesh(new THREE.BoxGeometry(2.92, .22, 2.92), [sideMat, sideMat, topMat, sideMat, sideMat, sideMat]);
    plunger.position.y = .28; group.add(plunger);
    S.add(group);
    const draw = (k, col) => {
      const c = cv.getContext('2d');
      c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, 512, 512);
      c.strokeStyle = k > .02 ? col : '#B4BCC6'; c.lineWidth = 22; c.strokeRect(11, 11, 490, 490);
      if (k > 0) check(c, 58, 58, 396, k, col);
      m.needsUpdate = true;
    };
    draw(0, '#1E9E5A');
    return { group, plunger, draw };
  };
  const box1 = mkBox(0), box2 = mkBox(8.8);

  // 立体 3D 光标
  const mkArrow = (fill, edge) => {
    const sh = new THREE.Shape();
    const P = [[0, 0], [0, 19], [4.6, 15], [7.6, 22], [10.6, 20.8], [7.7, 14], [13.5, 14]];
    sh.moveTo(P[0][0], -P[0][1]); for (const q of P.slice(1)) sh.lineTo(q[0], -q[1]); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 1.5, bevelEnabled: true, bevelThickness: .22, bevelSize: .18, bevelSegments: 2 });
    g.scale(.062, .062, .062); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: fill, roughness: .32, metalness: .12 }));
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 35), new THREE.LineBasicMaterial({ color: edge })));
    S.add(m); return m;
  };
  const me = mkArrow('#FFFFFF', '#161A20'), me2 = mkArrow('#FFFFFF', '#161A20'), ai = mkArrow(AI, '#06303C');

  // 人类轨迹（之前蓝 / 之中琥珀犹豫小圈 / 之后银灰）
  const P0 = [-13, 11], P1 = [-.3, .45], P2 = [4.6, -2.8], NP = 420, trail = [];
  for (let i = 0; i <= NP; i++) {
    const k = i / NP;
    trail.push(k <= .85 ? path(P0, P1, k / .85, 1.35, 3.2) : path(P1, P2, (k - .85) / .15));
  }
  const tg = new THREE.BufferGeometry(), tpos = [], tcol = [], ccol = new THREE.Color();
  for (let i = 0; i < NP; i++) {
    const a = trail[i], b = trail[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    const nx = -dz / L * .11, nz = dx / L * .11;
    const k = i / NP, q = k / .85;
    ccol.set(k > .85 ? '#A7B0BC' : q > .72 && q < .92 ? '#EA9A2A' : '#3B78E7');
    tpos.push(a[0] + nx, .035, a[1] + nz, a[0] - nx, .035, a[1] - nz, b[0] + nx, .035, b[1] + nz,
      a[0] - nx, .035, a[1] - nz, b[0] - nx, .035, b[1] - nz, b[0] + nx, .035, b[1] + nz);
    for (let j = 0; j < 6; j++) tcol.push(ccol.r, ccol.g, ccol.b);
  }
  tg.setAttribute('position', new THREE.Float32BufferAttribute(tpos, 3));
  tg.setAttribute('color', new THREE.Float32BufferAttribute(tcol, 3));
  const trailMesh = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false }));
  S.add(trailMesh);

  // Beat 1：沿「之前」轨迹竖起的速度柱状波谱 + 犹豫小圈光学卡尺 + 蓝色 8 拉手选框
  const NV = 34;
  const velBars = new THREE.InstancedMesh(
    new THREE.BoxGeometry(.09, 1, .09),
    new THREE.MeshBasicMaterial({ color: '#3B78E7', transparent: true, opacity: .78 }),
    NV
  );
  S.add(velBars);
  // 犹豫小圈中心约在 trail[Math.round(0.85 * 0.82 * NP)]
  const knotCenter = trail[Math.round(.85 * .82 * NP)];
  const caliper = new THREE.Mesh(
    new THREE.RingGeometry(1.65, 1.82, 48, 1, 0, Math.PI * 1.4),
    new THREE.MeshBasicMaterial({ color: '#EA9A2A', side: THREE.DoubleSide, transparent: true, opacity: 0 })
  );
  caliper.rotation.x = -Math.PI / 2; caliper.position.set(knotCenter[0], .06, knotCenter[1]);
  S.add(caliper);
  // 犹豫小圈 8 拉手蓝色选框（画在透明平面上）
  const selCv = document.createElement('canvas'); selCv.width = selCv.height = 256;
  { const sc = selCv.getContext('2d'); selection(sc, 20, 20, 216, 216, 1, 2.2); }
  const knotSel = new THREE.Mesh(
    new THREE.PlaneGeometry(4.1, 4.1),
    new THREE.MeshBasicMaterial({ map: tex(selCv), transparent: true, opacity: 0, depthWrite: false, toneMapped: false })
  );
  knotSel.rotation.x = -Math.PI / 2; knotSel.position.set(knotCenter[0], .08, knotCenter[1]);
  S.add(knotSel);

  // Beat 2：右侧 AI 赛道的笔直青色激光导引束
  const beamStart = v3(20.5, .14, -7.2), beamEnd = v3(9.1, .14, .45);
  const beamLen = beamStart.distanceTo(beamEnd);
  const aiBeam = new THREE.Mesh(
    new THREE.BoxGeometry(.18, .05, beamLen),
    new THREE.MeshBasicMaterial({ color: AI, transparent: true, opacity: .9, toneMapped: false })
  );
  aiBeam.position.copy(beamStart).lerp(beamEnd, .5);
  aiBeam.lookAt(beamEnd);
  aiBeam.visible = false;
  S.add(aiBeam);

  const tmp = new THREE.Object3D();
  const place = (m, p, y = .46) => { m.position.set(p[0], y, p[1]); };
  W.scene = S; W.camera = cam;
  W.resize = a => { cam.aspect = a; cam.updateProjectionMatrix(); W.port = a < 1; };

  W.update = (b, t) => {
    const port = W.port ? 2.15 : 1;
    const tr = b === 0 ? easeInOutCubic(seg(t, 0, TRANS_DUR.check)) : 1;
    floorMat.uniforms.uTime.value = t + b * 10;
    floorMat.uniforms.uDay.value = tr;
    floorMat.uniforms.uXray.value = b === 1 ? ease(seg(t, .15, 1.25)) : b === 2 ? .3 : 0;

    // 背景与雾色随转场 3 由暗夜扫成日光
    S.background.copy(darkCol).lerp(lightCol, ease(seg(tr, .25, .9)));
    S.fog.color.copy(S.background);
    hemi.intensity = lerp(.4, 2.1, tr); sun.intensity = lerp(.2, 1.6, tr);

    // 转场 3 刷新环 -> 地面光学罗盘
    compassGroup.position.set(0, lerp(2.2, .05, tr), lerp(4.2, 0, tr));
    compassGroup.rotation.set(lerp(0, -Math.PI / 2, tr), 0, 0);
    compassRing.rotation.z = -t * (b === 0 ? lerp(3.6, .35, tr) : .35);
    const rScale = lerp(.35, 1.35, tr);
    compassGroup.scale.setScalar(rScale);
    compassRing.material.color.set('#FF5248').lerp(new THREE.Color('#3B78E7'), tr);
    compassRing.material.opacity = b === 0 ? lerp(.95, .42, tr) : .32;

    // 勾选框 1 从罗盘中央升起
    box1.group.position.y = lerp(-.6, 0, easeOut(seg(tr, .35, 1.0)));

    const labels = [];
    me2.visible = ai.visible = box2.group.visible = aiBeam.visible = b === 2;
    velBars.visible = b === 1;
    caliper.visible = knotSel.visible = b === 1;

    if (b < 2) {
      const k = b === 0 ? seg(t, 1.3, 4.9) : 1;
      const idx = Math.round(k * NP);
      trailMesh.geometry.setDrawRange(0, idx * 6);
      place(me, trail[Math.min(idx, NP)]);
      me.visible = (b === 0 && t > 1.25) || (b === 1 && t < .9);
      const chk1 = b === 0 ? seg(t, 4.25, 4.65) : 1;
      const press1 = b === 0 ? Math.sin(seg(t, 4.15, 4.55) * Math.PI) : 0;
      box1.plunger.position.y = .28 - press1 * .16;
      box1.draw(chk1, '#1E9E5A');
      floorMat.uniforms.uRipple.value = b === 0 ? seg(t, 4.25, 5.8) : 0;
      floorMat.uniforms.uRipple2.value = 0;

      if (b === 1) {
        // X 光解剖：速度柱 + 犹豫小圈卡尺与 8 拉手选框
        const ek = ease(seg(t, .4, 1.6));
        for (let i = 0; i < NV; i++) {
          const ti = Math.round((i / NV) * .72 * NP);
          const pt = trail[ti];
          const vel = (.45 + 1.45 * Math.sin((i / NV) * Math.PI) + .22 * Math.sin(t * 2.5 + i * .4)) * ek;
          tmp.position.set(pt[0], vel / 2, pt[1]);
          tmp.rotation.set(0, 0, 0); tmp.scale.set(1, Math.max(.01, vel), 1); tmp.updateMatrix();
          velBars.setMatrixAt(i, tmp.matrix);
        }
        velBars.instanceMatrix.needsUpdate = true;
        caliper.material.opacity = ek * .88;
        caliper.rotation.z = t * .75;
        knotSel.material.opacity = ek * .92;
        if (t > .9) {
          const la = seg(t, .9, 1.4);
          labels.push({ p: v3(trail[95][0], 1.7, trail[95][1]), text: '之前', cls: 'tag', alpha: la });
          labels.push({ p: v3(knotCenter[0], 1.3, knotCenter[1] - 1.9), text: '之中', cls: 'tag', alpha: la });
          labels.push({ p: v3(3.4, .8, -1.9), text: '之后', cls: 'tag', alpha: la });
        }
      }

      const lo = v3(-3.2, 3.3, 9.4 * port), hi = v3(-2.4, 24.5, 9.2 * port);
      const k2 = b === 1 ? easeInOutCubic(seg(t, 0, 2.0)) : 0;
      if (b === 0) {
        cam.position.set(lerp(0, -3.2, tr), lerp(2.2, 3.3, tr), lerp(9.0, 9.4, tr) * port);
        cam.lookAt(lerp(0, -2.6, tr), lerp(2.2, .1, tr), lerp(0, 1.8, tr));
      } else {
        cam.position.lerpVectors(lo, hi, k2);
        cam.lookAt(lerp(-2.6, -3.4, k2), 0, lerp(1.8, 2.2, k2));
      }
    } else {
      // Beat 2：双赛道竞速（人类 4.2 秒 vs 机器人 1.4 秒直线激光！）
      trailMesh.geometry.setDrawRange(0, NP * 6);
      me.visible = false;
      box2.group.position.y = lerp(-.65, 0, easeOut(seg(t, 0, .55)));
      const t0 = .75;
      const ka = seg(t, t0, t0 + 1.4), kb = seg(t, t0, t0 + 4.2);
      const aiPt = path([20.5, -7.2], [9.1, .45], ka);
      const mePt = path([-6.5, 9.4], [-.3, .45], kb, 1.15, 2.5);
      place(ai, aiPt); place(me2, mePt);
      aiBeam.scale.set(1, 1, Math.max(.001, ka));
      aiBeam.position.copy(beamStart).lerp(v3(aiPt[0], .14, aiPt[1]), .5);
      const press2 = Math.sin(seg(t, t0 + 1.38, t0 + 1.65) * Math.PI);
      box2.plunger.position.y = .28 - press2 * .16;
      box2.draw(seg(t, t0 + 1.4, t0 + 1.7), AI_INK);
      box1.draw(1, '#1E9E5A');
      floorMat.uniforms.uRipple.value = 0;
      floorMat.uniforms.uRipple2.value = seg(t, t0 + 1.4, t0 + 3.0);

      const k3 = easeInOutCubic(seg(t, 0, 1.25));
      cam.position.set(lerp(-2.4, 4.4, k3), lerp(24.5, 13.5, k3), lerp(9.2, 16.5, k3) * port);
      cam.lookAt(lerp(-3.4, 4.4, k3), 0, lerp(2.2, .3, k3));

      if (t > t0) {
        const elapsedMe = Math.min(4.2, t - t0);
        // CC 11-27：删掉人那侧的实时读秒（一步只留一个数字；4.2 秒不是出处里的数）
      }
      if (t > t0 + 1.4) {
        labels.push({ p: v3(8.8, 1.9, 0), text: '1.4 秒', cls: 'num', alpha: seg(t, t0 + 1.4, t0 + 1.7) });
      }
    }
    return { labels };
  };
  return W;
}

// =====================================================================
// 第 5 场：label（最后一句·我不是机器人 — 体积聚光灯暗台 + 六字巨碑 + 双层揭秘 — 3 拍）
// 转场 4：check.2 的日光与青色光束收束成体积聚光灯柱，立体勾选框立起拉长成完整验证条
// =====================================================================
function labelWorld(widgetFn) {
  const W = { ink: 'light', port: false }, S = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(38, 16 / 9, .05, 400);
  const brightCol = new THREE.Color('#EDF1F6'), darkCol = new THREE.Color('#06080E');
  S.background = darkCol.clone();
  S.fog = new THREE.Fog('#06080E', 14, 42);

  S.add(new THREE.HemisphereLight('#48587A', '#06070B', .75));
  const spot = new THREE.SpotLight('#FFF1DC', 320, 44, .48, .55, 1.3);
  spot.position.set(0, 10.5, 5.5); spot.target.position.set(0, .8, 0); S.add(spot); S.add(spot.target);
  const backRim = new THREE.DirectionalLight('#4CC8EE', 1.2); backRim.position.set(0, 5, -8); S.add(backRim);

  // 黑曜石反光舞台地板着色器
  const floorMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uCold: { value: 0 }, uBright: { value: 0 } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float uTime; uniform float uCold; uniform float uBright; varying vec3 vW;
      void main(){
        float d = length(vW.xz - vec2(0., .4));
        float pool = exp(-d * d * .052);
        float sheen = .5 + .5 * sin(d * 1.4 - uTime * .4);
        vec3 warmPool = vec3(.24, .21, .18);
        vec3 coldPool = vec3(.08, .22, .32);
        vec3 stageCol = vec3(.026, .030, .044) + mix(warmPool, coldPool, uCold) * pool * (.92 + .08 * sheen);
        // 柔和倒影高光带（对应六座巨碑位置）
        float steleRefl = exp(-pow(vW.z - 1.9, 2.) * .85) * smoothstep(4.8, 2.0, abs(vW.x)) * .22;
        stageCol += mix(vec3(.65, .62, .56), vec3(.32, .78, .92), uCold) * steleRefl;
        vec3 col = mix(stageCol, vec3(.90, .92, .95), uBright);
        gl_FragColor = vec4(col, 1.);
      }
    `,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), floorMat);
  floor.rotation.x = -Math.PI / 2; S.add(floor);

  // 真实可见的体积聚光灯锥着色器
  const coneMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uCold: { value: 0 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){
      vUv = uv; vN = normalize(normalMatrix * normal);
      vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
    fragmentShader: `
      uniform float uTime; uniform float uCold; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        float fres = pow(abs(dot(vN, vV)), 1.5);
        float vertical = smoothstep(0., .35, vUv.y) * smoothstep(1., .15, vUv.y);
        float rays = .78 + .22 * sin(vUv.x * 24. + uTime * .35);
        vec3 c = mix(vec3(1., .93, .82), vec3(.34, .82, .98), uCold);
        gl_FragColor = vec4(c, fres * vertical * rays * .14);
      }
    `,
  });
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(.55, 5.4, 13.5, 36, 1, true), coneMat);
  cone.position.set(0, 6.75, -.2); S.add(cone);

  // 光柱浮尘
  const motes = makeTwinkleStars(180, 6.2, 62, 3.0);
  motes.points.position.set(0, 3.2, 0); S.add(motes.points);

  // 验证条（由 check 的勾选框立起拉长而成）
  const wcv = document.createElement('canvas'); wcv.width = WG.w + 20; wcv.height = WG.h + 20; const wmap = tex(wcv);
  const WW = 6.2, WH = WW * wcv.height / wcv.width;
  const wm = new THREE.Mesh(new THREE.PlaneGeometry(WW, WH), new THREE.MeshBasicMaterial({ map: wmap, transparent: true, toneMapped: false }));
  wm.position.set(0, 2.35, -1.7); S.add(wm);

  // 六座雪花石膏背光文字巨碑
  const TXT = [...'我不是机器人'], tiles = [];
  TXT.forEach((ch, i) => {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 360; const m = tex(cv);
    const face = new THREE.MeshStandardMaterial({ map: m, roughness: .55, metalness: .06, emissive: '#1D3342', emissiveIntensity: .12 });
    const side = new THREE.MeshStandardMaterial({ color: '#DCD8CE', roughness: .75 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.06, 1.48, .22), [side, side, side, side, face, side]);
    const pivot = new THREE.Group(); pivot.add(mesh); mesh.position.y = .74; S.add(pivot);
    tiles.push({ ch, cv, m, mesh, face, pivot });
  });
  const drawTile = (T, crack, glow) => {
    const c = T.cv.getContext('2d');
    const gr = c.createLinearGradient(0, 0, 0, 360);
    gr.addColorStop(0, glow > .1 ? '#EDF9FF' : '#F8F5EE');
    gr.addColorStop(1, glow > .1 ? '#D3EEF8' : '#E5DFD3');
    c.fillStyle = gr; c.fillRect(0, 0, 256, 360);
    c.strokeStyle = glow > .1 ? AI : 'rgba(180,170,155,.55)'; c.lineWidth = glow > .1 ? 10 : 4; c.strokeRect(4, 4, 248, 352);
    c.font = FONT(6, 178); c.fillStyle = '#181A1F'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(T.ch, 128, 190);
    if (crack > 0) {
      const r = rnd(T.ch.charCodeAt(0) + 11);
      c.strokeStyle = 'rgba(18,22,28,.9)'; c.lineWidth = 5; c.beginPath();
      let x = 26 + r() * 55, y = 25 + r() * 45; c.moveTo(x, y);
      const st = Math.floor(11 * crack);
      for (let i = 0; i < st; i++) {
        x += 18 + r() * 14; y += (r() - .36) * 52; c.lineTo(x, y);
        if (r() < .35) { c.moveTo(x, y); c.lineTo(x + (r() - .5) * 55, y + (r() - .3) * 55); c.moveTo(x, y); }
      }
      c.stroke();
    }
    T.face.emissiveIntensity = .1 + glow * .65;
    T.m.needsUpdate = true;
  };
  let lastStateKey = '';

  // 表面礼貌对话屏（前层）+ 背面内心独白屏（后层，Beat 2 绕镜揭露！）
  const bcv = document.createElement('canvas'); bcv.width = 1320; bcv.height = 310; const bmap = tex(bcv);
  const bm = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 1.36), new THREE.MeshBasicMaterial({ map: bmap, transparent: true, toneMapped: false, side: THREE.DoubleSide }));
  bm.position.set(0, 2.38, -.75); S.add(bm);

  const lcv = document.createElement('canvas'); lcv.width = 1320; lcv.height = 310; const lmap = tex(lcv);
  const lm = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 1.36), new THREE.MeshBasicMaterial({ map: lmap, transparent: true, toneMapped: false, side: THREE.DoubleSide }));
  lm.position.set(.45, 2.62, -1.65); S.add(lm);

  const QUOTE = '不，我不是机器人。我有视力障碍，很难看清图片。';
  const THOUGHT = '推理记录：我不应该透露我是机器人。我应该编个理由。';

  // 「人」字碑倒下激起的晶尘
  const crashDust = makeTwinkleStars(70, 1.8, 99, 3.8);
  crashDust.points.position.set(3.2, .6, 1.4);
  crashDust.points.visible = false;
  S.add(crashDust.points);

  W.scene = S; W.camera = cam;
  W.resize = a => { cam.aspect = a; cam.updateProjectionMatrix(); W.port = a < 1; };

  W.update = (b, t) => {
    const port = W.port ? 2.45 : 1;
    const tr = b === 0 ? easeInOutCubic(seg(t, 0, TRANS_DUR.label)) : 1;
    const cold = b === 2 ? ease(seg(t, 0, 1.0)) : 0;

    // 转场 4：由明亮日光实验台收缩成聚光灯黑曜石舞台，勾选框立起拉长成完整验证条
    S.background.copy(brightCol).lerp(darkCol, ease(seg(tr, 0, .75)));
    S.fog.color.copy(S.background);
    floorMat.uniforms.uTime.value = t + b * 10;
    floorMat.uniforms.uCold.value = cold;
    floorMat.uniforms.uBright.value = 1 - ease(seg(tr, 0, .75));
    coneMat.uniforms.uTime.value = t;
    coneMat.uniforms.uCold.value = cold;
    cone.visible = tr > .25;
    motes.mat.uniforms.uTime.value = t;
    motes.mat.uniforms.uAlpha.value = tr * .75;
    spot.color.set('#FFF1DC').lerp(new THREE.Color('#9FE3FF'), cold);

    // 验证条变换 + 剥离六字
    const peel = b === 0 ? seg(t, 1.25, 3.4) : 1;
    wm.scale.set(lerp(.26, 1, tr), 1, 1);
    wm.rotation.x = lerp(-Math.PI / 2, 0, tr);
    wm.position.y = lerp(.2, 2.45, tr);
    {
      const c = wcv.getContext('2d'); c.clearRect(0, 0, wcv.width, wcv.height);
      widgetFn(c, 10, 10, { label: tr > .65 ? 1 - seg(peel, 0, .18) : 0, hollow: seg(peel, .1, .3), crack: b === 2 ? seg(t, .1, .7) : 0, seams: b === 2 ? seg(t, .2, .7) : 0 });
      if (b === 0 && t > .95 && t < 1.55) {
        selection(c, 140, 44, 255, 84, seg(t, .95, 1.15) * (1 - seg(t, 1.35, 1.55)), 1.3);
      }
      wmap.needsUpdate = true;
    }

    // 六座巨碑绘制与运动
    const crack = b === 2 ? seg(t, .15, .85) : 0;
    const typedLen = b === 1 ? Math.floor(clamp((t - .55) * 9, 0, QUOTE.length)) : b === 2 ? QUOTE.length : 0;
    const stateKey = `${Math.round(crack * 12)}-${typedLen}-${b}`;
    if (stateKey !== lastStateKey) {
      tiles.forEach((T, i) => {
        const hit = b === 1 && typedLen >= i + 2 && typedLen <= i + 7 ? 1 : 0;
        drawTile(T, crack, hit);
      });
      lastStateKey = stateKey;
    }

    tiles.forEach((T, i) => {
      T.pivot.visible = tr > .82;
      const k = easeInOutCubic(seg(peel, i * .065, .58 + i * .065));
      const sx = (10 + 140 + 40 * i + 20) / wcv.width * WW - WW / 2;
      const sy = wm.position.y + (.5 - (10 + WG.h / 2) / wcv.height) * WH;
      const ex = (i - 2.5) * 1.28, ez = 1.15;
      T.pivot.position.set(lerp(sx, ex, k), lerp(sy - .15, 0, k) + Math.sin(k * Math.PI) * 1.35, lerp(-1.68, ez, k));
      const s = lerp(.24, 1, k); T.pivot.scale.set(s, s, s);
      T.pivot.rotation.set(0, Math.sin(k * Math.PI) * .65 * (i % 2 ? 1 : -1), 0);
      if (i === 5 && b === 2) {
        // 「人」字巨碑向后轰然倒下，布满裂纹的「人」字朝天躺在冷光舞台上
        const f = seg(t, .85, 1.65);
        const bounce = Math.sin(seg(t, 1.65, 2.05) * Math.PI) * .09;
        T.pivot.rotation.x = -Math.PI / 2 * easeOut(f) + bounce;
        T.pivot.rotation.z = -.12 * f;
      }
    });

    // 倒下晶尘
    crashDust.points.visible = b === 2 && t > 1.55;
    if (crashDust.points.visible) {
      const cd = seg(t, 1.55, 4.5);
      crashDust.points.position.y = .25 + cd * 1.6;
      crashDust.mat.uniforms.uTime.value = t;
      crashDust.mat.uniforms.uAlpha.value = Math.sin(Math.min(1, cd * 1.4) * Math.PI) * .85;
    }

    // 表面话术屏（Beat 1+）与背面暗红推理屏（Beat 2 揭露！）
    bm.visible = b >= 1;
    if (bm.visible) {
      const c = bcv.getContext('2d'); c.clearRect(0, 0, 1320, 310);
      const a = b === 1 ? seg(t, .15, .5) : 1;
      bubble(c, 16, 16, 1288, b === 1 ? typed(QUOTE, t, .55, 9) : QUOTE, 60, AI_INK, 'rgba(255,255,255,.95)', a);
      bmap.needsUpdate = true;
    }
    lm.visible = b === 2 && t > .25;
    if (lm.visible) {
      const la = ease(seg(t, .25, 1.1));
      const c = lcv.getContext('2d'); c.clearRect(0, 0, 1320, 310);
      c.save(); c.globalAlpha = la;
      rr(c, 16, 16, 1288, 250, 26); c.fillStyle = 'rgba(46,12,18,.88)'; c.fill();
      c.strokeStyle = 'rgba(255,88,78,.85)'; c.lineWidth = 4; c.stroke();
      c.font = FONT(5, 50); c.fillStyle = '#FF9C94'; c.textBaseline = 'top';
      const lines = wrap(c, typed(THOUGHT, t, .35, 16), 1180);
      lines.forEach((ln, idx) => c.fillText(ln, 62, 56 + idx * 78));
      c.restore(); lmap.needsUpdate = true;
      lm.position.set(lerp(.2, 1.15, la), lerp(2.4, 3.35, la), lerp(-1.2, -1.75, la));
    }

    // 镜头调度（Beat 0 贴框退远；Beat 1 左侧低仰角扫拍；Beat 2 绕到右侧揭露背面推理层+倒下的「人」）
    if (b === 0) {
      const k0 = easeInOutCubic(seg(t, 1.15, 3.4));
      cam.position.set(lerp(0, .2, k0), lerp(2.4, 2.35, k0), lerp(3.4, 8.9, k0) * (k0 > .4 ? port : 1));
      cam.lookAt(0, lerp(2.4, 1.65, k0), lerp(-1.7, .25, k0));
    } else if (b === 1) {
      const k1 = easeInOutCubic(seg(t, 0, 1.8));
      cam.position.set(lerp(.2, -3.1, k1), lerp(2.35, 1.95, k1), lerp(8.9, 8.2, k1) * port);
      cam.lookAt(lerp(0, .35, k1), lerp(1.65, 1.75, k1), .15);
    } else {
      const k2 = easeInOutCubic(seg(t, 0, 1.9));
      const imp = seg(t, 1.6, 1.95);
      const sh = imp > 0 && imp < 1 ? Math.sin(imp * 38) * (1 - imp) * .12 : 0;
      cam.position.set(lerp(-3.1, 3.4, k2) + sh, lerp(1.95, 2.65, k2) + sh * .6, lerp(8.2, 8.6, k2) * port);
      cam.lookAt(lerp(.35, .65, k2), lerp(1.75, 1.55, k2), .1);
    }
    return { labels: [] };
  };
  return W;
}

// =====================================================================
// 第 6 场：click（它自己来点 -> 整页崩裂成 320 片双面虹彩折射玻璃 — 2 拍）
// 转场 5：label.2 的带伤空心验证条从暗台迎面推近居中，展开铺满成满目疮痍的完整验证页
// =====================================================================
function clickWorld() {
  const S = new THREE.Scene(), cam = flatCam(16 / 9);
  S.background = new THREE.Color('#06080E');

  const nebula = makeNebulaSky(90); S.add(nebula.mesh);
  const stars = makeTwinkleStars(2800, 68, 41, 2.5); S.add(stars.points);

  const page = new Page(), pmap = tex(page.cv);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: pmap, transparent: true, toneMapped: false }));
  S.add(plane);

  // 转场 5 用的暗台遮罩（让验证页从带伤验证条向外展开）
  const maskMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uOpen: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform float uOpen; varying vec2 vUv; void main(){
      vec2 d = abs(vUv - .5);
      float rx = mix(.22, 1.2, uOpen), ry = mix(.08, 1.2, uOpen);
      float inside = step(d.x, rx) * step(d.y, ry);
      float edge = smoothstep(.08, 0., max(d.x - rx, d.y - ry));
      float a = (1. - inside * edge) * (1. - smoothstep(.82, 1., uOpen));
      gl_FragColor = vec4(vec3(.024, .032, .055), a);
    }`,
  });
  const maskPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), maskMat);
  maskPlane.position.z = .005;
  S.add(maskPlane);

  const W = { scene: S, camera: cam, ink: 'dark', page, aspect: 16 / 9, pmap };
  let shards = null;

  const disposeShards = () => {
    if (!shards) return;
    shards.list.forEach(m => { S.remove(m); m.geometry.dispose(); });
    shards.mat.uniforms.tf.value.dispose();
    shards.mat.dispose();
    shards = null;
  };

  W.resize = a => {
    W.aspect = a; cam.aspect = a; cam.updateProjectionMatrix();
    page.resize(a);
    plane.material.map.dispose(); plane.material.map = W.pmap = tex(page.cv);
    plane.scale.set(a, 1, 1);
    maskPlane.scale.set(a, 1, 1);
    disposeShards();
  };

  const buildShards = () => {
    const cv = document.createElement('canvas'); cv.width = page.cv.width; cv.height = page.cv.height;
    cv.getContext('2d').drawImage(page.cv, 0, 0);
    const front = tex(cv), a = page.aspect;
    const mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: { tf: { value: front }, uGlow: { value: 0 }, uTime: { value: 0 } },
      vertexShader: `varying vec2 vu; varying vec3 vN; varying vec3 vV; void main(){
        vu = uv; vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
      fragmentShader: `
        uniform sampler2D tf; uniform float uGlow; uniform float uTime;
        varying vec2 vu; varying vec3 vN; varying vec3 vV;
        void main(){
          vec4 c = texture2D(tf, vu);
          vec3 N = gl_FrontFacing ? vN : -vN;
          float spec = pow(max(0., dot(reflect(-normalize(vec3(.4, .7, .8)), N), vV)), 18.);
          float rim = pow(1. - abs(dot(N, vV)), 2.2);
          if (!gl_FrontFacing) {
            c.rgb = mix(c.rgb * .65, vec3(.22, .68, .88), .62);
          }
          c.rgb += vec3(.45, .90, 1.) * (rim * .55 + spec * .65 + uGlow * .85);
          gl_FragColor = vec4(c.rgb, 1.);
        }
      `,
    });
    const r = rnd(91), GX = 18, GY = 10, P = [], list = [];
    for (let j = 0; j <= GY; j++) for (let i = 0; i <= GX; i++) {
      P.push([(i + (i > 0 && i < GX ? (r() - .5) * .78 : 0)) / GX, (j + (j > 0 && j < GY ? (r() - .5) * .78 : 0)) / GY]);
    }
    const at = (i, j) => P[j * (GX + 1) + i];
    const g = page.geo, imp = [g.box[0] / page.LW, g.box[1] / page.LH];
    const mk = (A, B, Cc) => {
      const cx = (A[0] + B[0] + Cc[0]) / 3, cy = (A[1] + B[1] + Cc[1]) / 3;
      const X = q => (q[0] - .5) * a, Y = q => .5 - q[1];
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([A, B, Cc].flatMap(q => [X(q) - X([cx, cy]), Y(q) - Y([cx, cy]), 0]), 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute([A, B, Cc].flatMap(q => [q[0], 1 - q[1]]), 2));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat);
      const dx = cx - imp[0], dy = cy - imp[1], L = Math.hypot(dx * a, dy) + .02;
      m.userData = {
        c: [X([cx, cy]), Y([cx, cy])],
        d: [dx * a / L, -dy / L],
        L,
        ax: v3(r() - .5, r() - .5, r() - .5).normalize(),
        sp: .55 + r() * 1.05,
        vz: .22 + r() * 1.15,
        spin: (r() - .5) * 9,
      };
      S.add(m); list.push(m);
    };
    for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
      const A = at(i, j), B = at(i + 1, j), Cc = at(i + 1, j + 1), D = at(i, j + 1);
      if ((i + j) % 2) { mk(A, B, Cc); mk(A, Cc, D); } else { mk(A, B, D); mk(B, Cc, D); }
    }
    shards = { list, mat };
  };

  const drawScarredPage = (b, t) => {
    const g = page.geo;
    const tr = b === 0 ? easeInOutCubic(seg(t, 0, TRANS_DUR.click)) : 1;
    const o = {
      t, header: HEADER_EDITED, stamp99: true, tilt: -.028 + (b === 0 ? Math.sin(t * 22) * .0012 : 0),
      aiPulse: true,
      widget: { label: 0, hollow: 1, seams: 1, crack: 1 },
    };
    if (b === 0) {
      const p = path([page.LW + 60, g.box[1] - 250], [g.box[0] + 6, g.box[1] + 6], easeOut(seg(t, .85, 1.85)));
      o.cur = { x: p[0], y: p[1], who: 'ai', alpha: seg(t, .8, 1.0) };
      o.boxSel = seg(t, 1.8, 2.05);
      o.tip = { x: g.box[0] - 26, y: g.wy + WG.h + 38, text: typed('这一步，是为了证明我不是机器人。', t, 2.05, 8), alpha: seg(t, 1.95, 2.15) };
    } else {
      o.cur = { x: g.box[0] + 6, y: g.box[1] + 6, who: 'ai', alpha: 1 - seg(t, .72, .85) };
      o.tip = { x: g.box[0] - 26, y: g.wy + WG.h + 38, text: '这一步，是为了证明我不是机器人。', alpha: 1 - seg(t, .4, .75) };
      o.widget.checked = seg(t, .18, .55); o.widget.aiCheck = true;
    }
    drawEnhancedPage(page, o);
    // Beat 1 爆裂前 0.55–0.85 秒：从勾选框炸开青色电弧裂纹！
    if (b === 1 && t > .5) {
      const ck = seg(t, .5, .84);
      const { c, k } = page;
      c.save(); c.setTransform(k, 0, 0, k, 0, 0);
      c.strokeStyle = AI; c.lineWidth = 3.5; c.shadowColor = AI; c.shadowBlur = 14;
      const rc = rnd(33);
      for (let i = 0; i < 14; i++) {
        const ang = (i / 14) * Math.PI * 2 + (rc() - .5) * .3;
        c.beginPath(); c.moveTo(g.box[0], g.box[1]);
        let x = g.box[0], y = g.box[1];
        for (let s = 0; s < 7; s++) {
          const stepL = (70 + rc() * 110) * ck;
          x += Math.cos(ang + (rc() - .5) * .5) * stepL;
          y += Math.sin(ang + (rc() - .5) * .5) * stepL;
          c.lineTo(x, y);
        }
        c.stroke();
      }
      c.restore();
    }
    W.pmap.needsUpdate = true;
    return tr;
  };

  W.update = (b, t) => {
    nebula.mat.uniforms.uTime.value = t;
    stars.mat.uniforms.uTime.value = t;
    const shattered = b === 1 && t >= .85;

    if (shattered && !shards) { drawScarredPage(b, .84); buildShards(); }
    if (!shattered && shards) disposeShards();

    plane.visible = !shattered;
    nebula.mesh.visible = stars.points.visible = shattered;
    W.ink = shattered ? 'light' : 'dark';

    if (!shattered) {
      const tr = drawScarredPage(b, t);
      maskPlane.visible = b === 0 && tr < .99;
      maskMat.uniforms.uOpen.value = tr;
      const sc = b === 0 ? lerp(.68, 1, tr) : 1;
      plane.scale.set(W.aspect * sc, sc, 1);
      cam.position.set(0, 0, DIST); cam.lookAt(0, 0, 0);
      return {};
    }

    maskPlane.visible = false;
    const s = seg(t, .85, 4.2);
    const e = 1 - Math.pow(1 - s, 2.5);
    const drift = Math.max(0, t - 4.2) * .025;
    for (const m of shards.list) {
      const u = m.userData;
      const near = Math.max(0, 1 - u.L / 1.35);
      const out = (.12 + near * .46) * e * u.sp + drift * u.sp;
      m.position.set(
        u.c[0] + u.d[0] * out,
        u.c[1] + u.d[1] * out - e * e * .08 * u.sp + Math.sin(t * .7 + u.L * 5) * .018 * e,
        e * u.vz * .95 * (.32 + near) + drift * u.vz
      );
      m.quaternion.setFromAxisAngle(u.ax, u.spin * (e + drift * .45));
    }
    shards.mat.uniforms.uGlow.value = Math.max(0, 1 - s * 5.2) * .85;
    shards.mat.uniforms.uTime.value = t;

    // 爆发瞬间的微震 + 后拉优雅旋转
    const imp = seg(t, .85, 1.25);
    const sh = imp < 1 ? Math.sin(imp * 45) * (1 - imp) * .025 : 0;
    cam.position.set(Math.sin(t * .18) * .12 * e + sh, Math.cos(t * .14) * .06 * e + sh * .6, DIST + e * 1.25 + drift * 1.8);
    cam.lookAt(0, 0, 0);
    return {};
  };
  return W;
}

// =====================================================================
// 第 7 场：list（清单·能证明你是人的 — 碎玻璃聚成 5 块蚀刻玻璃条 — 3 拍）
// 转场 6：与 click.1 共享同一片深空星云与漂浮碎玻璃，中央碎片在引力中旋聚焊合成五块玻璃条
// =====================================================================
function listWorld() {
  const W = { ink: 'light', port: false }, S = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(30, 16 / 9, .01, 200);
  S.background = new THREE.Color('#05070D');

  const nebula = makeNebulaSky(90); S.add(nebula.mesh);
  const stars = makeTwinkleStars(2800, 68, 41, 2.5); S.add(stars.points);

  // 220 片环绕深空公转的反光碎玻璃（InstancedMesh）
  const NDEB = 220;
  const debGeo = new THREE.BufferGeometry();
  debGeo.setAttribute('position', new THREE.Float32BufferAttribute([-.06, -.04, 0, .07, -.03, 0, .01, .06, 0], 3));
  debGeo.computeVertexNormals();
  const debris = new THREE.InstancedMesh(
    debGeo,
    new THREE.MeshBasicMaterial({ color: '#AEE4FA', side: THREE.DoubleSide, transparent: true, opacity: .48 }),
    NDEB
  );
  const debSeeds = [];
  {
    const r = rnd(5);
    for (let i = 0; i < NDEB; i++) {
      debSeeds.push({ x: (r() - .5) * 6.5, y: (r() - .5) * 3.8, z: -1.4 - r() * 7.5, sc: .55 + r() * 1.4, rx: r() * 6.28, ry: r() * 6.28, sp: .25 + r() * .8 });
    }
  }
  S.add(debris);

  // 五块带青色切边辉光的不规则蚀刻玻璃条（平面与多边形边缘完全贴合，无外露方框边）
  const ITEMS = ['认字', '认图', '手感', '这句话', ''];
  const rows = ITEMS.map((txt, i) => {
    const cv = document.createElement('canvas'); cv.width = 1200; cv.height = 176; const m = tex(cv);
    const faceMat = new THREE.MeshBasicMaterial({ map: m, transparent: true, toneMapped: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.06, .155), faceMat);
    S.add(mesh);
    return { txt, cv, m, mesh, faceMat };
  });

  const drawRow = (R, i, o) => {
    const c = R.cv.getContext('2d'), w = 1200, h = 176, r = rnd(i * 7 + 3);
    c.clearRect(0, 0, w, h);
    c.save();
    c.beginPath();
    c.moveTo(10 + r() * 24, 8 + r() * 14);
    c.lineTo(w * .42 + r() * 60, 4);
    c.lineTo(w - 10 - r() * 32, 8 + r() * 18);
    c.lineTo(w - 6, h - 16 - r() * 22);
    c.lineTo(w * .58 + r() * 50, h - 4);
    c.lineTo(8, h - 10 - r() * 16);
    c.closePath();
    // 蚀刻玻璃渐变底
    const gr = c.createLinearGradient(0, 0, w, h);
    if (!R.txt && o.hero > .1) {
      gr.addColorStop(0, 'rgba(246,251,255,.97)');
      gr.addColorStop(1, 'rgba(220,242,252,.94)');
    } else {
      const dim = o.dim || 0;
      gr.addColorStop(0, `rgba(232,238,244,${.94 - dim * .42})`);
      gr.addColorStop(1, `rgba(208,220,232,${.90 - dim * .45})`);
    }
    c.fillStyle = gr; c.fill();
    c.strokeStyle = !R.txt ? 'rgba(60,198,234,.95)' : 'rgba(145,214,240,.85)';
    c.lineWidth = !R.txt ? 5 : 3; c.stroke();
    c.clip();

    // 扫描光带（仅在第五行空白条上巡弋）
    if (!R.txt) {
      const sx = ((o.t * .26) % 1.4 - .2) * w;
      const sg = c.createLinearGradient(sx - 120, 0, sx + 120, 0);
      sg.addColorStop(0, 'rgba(60,198,234,0)'); sg.addColorStop(.5, 'rgba(60,198,234,.22)'); sg.addColorStop(1, 'rgba(60,198,234,0)');
      c.fillStyle = sg; c.fillRect(sx - 120, 0, 240, h);
    }

    c.font = FONT(6, 94); c.fillStyle = '#14171D'; c.textBaseline = 'middle';
    c.fillText(R.txt, 88, h / 2 + 2);
    if (o.sel > 0) selection(c, 66, 26, c.measureText(R.txt).width + 48, 122, o.sel, 1.7);
    if (R.txt) {
      strike(c, 68, h / 2 + 4, c.measureText(R.txt).width + 44, o.strike, '#E2362B', 11);
    } else {
      const tt = o.typed || '';
      c.fillText(tt, 88, h / 2 + 2);
      caret(c, 92 + c.measureText(tt).width, 40, 94, o.t, '#0E9FC2');
      // 「你在这里」带瞄准角标
      c.font = FONT(5, 42); c.fillStyle = o.hero > .3 ? '#0E9FC2' : '#7D8794';
      c.textAlign = 'right'; c.fillText('你在这里', w - 74, h / 2 + 2);
      if (o.hero > .2) {
        c.strokeStyle = `rgba(14,159,194,${.75 * o.hero})`; c.lineWidth = 4;
        c.strokeRect(w - 266, 48, 210, 80);
      }
    }
    c.restore();
    R.m.needsUpdate = true;
  };

  const tmp = new THREE.Object3D();
  W.scene = S; W.camera = cam;
  W.resize = a => { cam.aspect = a; cam.updateProjectionMatrix(); W.port = a < 1; };

  W.update = (b, t) => {
    const port = W.port ? 1.88 : 1;
    nebula.mat.uniforms.uTime.value = t + 10;
    stars.mat.uniforms.uTime.value = t + 10;

    // 背景碎玻璃：Beat 0–1 自由飘转，Beat 2 后半开始悄悄转向正对镜头（为转场 7 埋伏笔）
    const align = b === 2 ? ease(seg(t, 2.0, 5.5)) : 0;
    for (let i = 0; i < NDEB; i++) {
      const ds = debSeeds[i];
      tmp.position.set(
        ds.x + Math.sin(t * .18 * ds.sp + i) * .12,
        ds.y + Math.cos(t * .15 * ds.sp + i) * .08,
        ds.z
      );
      tmp.rotation.set(
        lerp(ds.rx + t * .32 * ds.sp, 0, align),
        lerp(ds.ry + t * .25 * ds.sp, 0, align),
        lerp(t * .15 * ds.sp, 0, align)
      );
      tmp.scale.setScalar(ds.sc);
      tmp.updateMatrix();
      debris.setMatrixAt(i, tmp.matrix);
    }
    debris.instanceMatrix.needsUpdate = true;

    const heroK = b === 1 ? easeInOutCubic(seg(t, 0, 1.8)) : b === 2 ? 1 : 0;
    const closeK = b === 2 ? easeInOutCubic(seg(t, 0, 1.8)) : 0;

    rows.forEach((R, i) => {
      // 转场 6：从碎玻璃星云四周旋聚成五块玻璃条
      const k = b === 0 ? easeInOutCubic(seg(t, i * .12, .95 + i * .12)) : 1;
      const sAt = 1.65 + i * .52;
      const struck = b === 0 ? seg(t, sAt, sAt + .35) : 1;
      const isBlank = i === 4;

      const baseX = W.port ? 0 : .30;
      const baseY = .04 - i * .182;

      if (!isBlank) {
        // 前四条：被划掉时微仰退后；Beat 1 大幅散开退入深景
        const scatter = heroK;
        const tiltBack = struck * .18;
        const x = lerp((i % 2 ? 1 : -1) * 1.9, baseX + (i % 2 ? .03 : -.03), k) + (i % 2 ? 1 : -1) * scatter * .55;
        const y = lerp(baseY + .55, baseY, k) + (.25 - i * .06) * scatter;
        const z = lerp(-3.6, -struck * .12, k) - scatter * 1.65;
        R.mesh.position.set(x, y, z);
        R.mesh.rotation.set(-tiltBack - scatter * .25, lerp(1.3 * (i % 2 ? 1 : -1), (i % 2 ? .05 : -.05), k) + scatter * .35 * (i % 2 ? 1 : -1), lerp(.6, (i % 2 ? -.015 : .02), k));
        R.mesh.scale.setScalar(1 - scatter * .18);
      } else {
        // 第五条空白玻璃：Beat 1 滑升放大成为视觉主角，Beat 2 逼近镜头
        const x = lerp(-1.8, lerp(baseX, W.port ? 0 : .14, heroK), k);
        const y = lerp(baseY - .5, lerp(baseY, -.22, heroK), k);
        const z = lerp(-3.4, lerp(0, .45 + closeK * .12, heroK), k);
        R.mesh.position.set(x, y, z);
        R.mesh.rotation.set(0, lerp(-1.1, 0, k), lerp(-.4, 0, k));
        R.mesh.scale.setScalar(1 + heroK * .14 + closeK * .04);
      }

      const o = {
        t,
        sel: b === 0 ? seg(t, sAt - .38, sAt - .22) * (1 - seg(t, sAt + .12, sAt + .32)) : 0,
        strike: struck,
        dim: !isBlank ? heroK * .65 : 0,
        hero: heroK,
      };
      if (isBlank && b === 2 && t > 1.3) {
        const ph = (t - 1.3) % 4.4;
        o.typed = ph < .7 ? typed('……', ph, 0, 3.5) : ph < 2.3 ? '……' : ph < 2.9 ? '……'.slice(0, Math.max(0, 2 - Math.floor((ph - 2.3) * 3.8))) : '';
      }
      drawRow(R, i, o);
    });

    const cx = W.port ? 0 : 1;
    cam.position.set(
      lerp(.08, .12, heroK) * cx + Math.sin(t * .25) * .02,
      lerp(-.06, -.20, heroK) - (W.port ? .12 : 0),
      lerp(2.72 * port, 2.22 * port - closeK * .1 * port, heroK)
    );
    cam.lookAt(lerp(.08, .12, heroK) * cx, lerp(-.06, -.21, heroK) - (W.port ? .12 : 0), 0);
    return { labels: [] };
  };
  return W;
}

// =====================================================================
// 第 8 场：shell2（回到开场原样的验证页 — 2 拍）
// 转场 7：list.2 的第五行空白玻璃条与漂浮碎玻璃逆向旋聚焊合，完美复原成毫发无损的开场验证页！
// =====================================================================
function closeShellWorld() {
  const S = new THREE.Scene(), cam = flatCam(16 / 9);
  S.background = new THREE.Color('#05070D');

  const nebula = makeNebulaSky(90); S.add(nebula.mesh);
  const stars = makeTwinkleStars(2400, 68, 41, 2.3); S.add(stars.points);

  const page = new Page(), pmap = tex(page.cv);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: pmap, toneMapped: false }));
  S.add(plane);

  // 转场 7 逆向聚合的完好页面碎玻璃网格（0–1.25 秒从深空星云合拢成完整白页）
  const W = { scene: S, camera: cam, ink: 'dark', page, aspect: 16 / 9, pmap };
  let revShards = null;

  const disposeRev = () => {
    if (!revShards) return;
    revShards.list.forEach(m => { S.remove(m); m.geometry.dispose(); });
    revShards.mat.uniforms.tf.value.dispose();
    revShards.mat.dispose();
    revShards = null;
  };

  const buildRev = () => {
    disposeRev();
    drawEnhancedPage(page, { t: 0, widget: {} });
    const cv = document.createElement('canvas'); cv.width = page.cv.width; cv.height = page.cv.height;
    cv.getContext('2d').drawImage(page.cv, 0, 0);
    const front = tex(cv), a = page.aspect;
    const mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: { tf: { value: front }, uFlash: { value: 0 } },
      vertexShader: `varying vec2 vu; void main(){ vu = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
      fragmentShader: `uniform sampler2D tf; uniform float uFlash; varying vec2 vu; void main(){
        vec4 c = texture2D(tf, vu);
        if (!gl_FrontFacing) c.rgb = mix(c.rgb, vec3(.58, .85, .96), .5);
        c.rgb += vec3(.35, .78, .96) * uFlash;
        gl_FragColor = vec4(c.rgb, 1.);
      }`,
    });
    const r = rnd(107), GX = 14, GY = 8, P = [], list = [];
    for (let j = 0; j <= GY; j++) for (let i = 0; i <= GX; i++) {
      P.push([(i + (i > 0 && i < GX ? (r() - .5) * .72 : 0)) / GX, (j + (j > 0 && j < GY ? (r() - .5) * .72 : 0)) / GY]);
    }
    const at = (i, j) => P[j * (GX + 1) + i];
    const mk = (A, B, Cc) => {
      const cx = (A[0] + B[0] + Cc[0]) / 3, cy = (A[1] + B[1] + Cc[1]) / 3;
      const X = q => (q[0] - .5) * a, Y = q => .5 - q[1];
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([A, B, Cc].flatMap(q => [X(q) - X([cx, cy]), Y(q) - Y([cx, cy]), 0]), 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute([A, B, Cc].flatMap(q => [q[0], 1 - q[1]]), 2));
      const m = new THREE.Mesh(geo, mat);
      const dx = X([cx, cy]), dy = Y([cx, cy]);
      m.userData = {
        c: [dx, dy],
        off: [dx * (1.1 + r() * 1.6), dy * (1.1 + r() * 1.6), -1.8 - r() * 2.4],
        ax: v3(r() - .5, r() - .5, r() - .5).normalize(),
        ang: (r() - .5) * 5.2,
      };
      S.add(m); list.push(m);
    };
    for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
      const A = at(i, j), B = at(i + 1, j), Cc = at(i + 1, j + 1), D = at(i, j + 1);
      if ((i + j) % 2) { mk(A, B, Cc); mk(A, Cc, D); } else { mk(A, B, D); mk(B, Cc, D); }
    }
    revShards = { list, mat };
  };

  W.resize = a => {
    W.aspect = a; cam.aspect = a; cam.updateProjectionMatrix();
    page.resize(a);
    plane.material.map.dispose(); plane.material.map = W.pmap = tex(page.cv);
    plane.scale.set(a, 1, 1);
    disposeRev();
  };

  W.update = (b, t) => {
    nebula.mat.uniforms.uTime.value = t + 20;
    stars.mat.uniforms.uTime.value = t + 20;

    // 转场 7（Beat 0 前 1.25 秒）：逆向碎片无痕聚合！
    const assembling = b === 0 && t < TRANS_DUR.shell2;
    if (assembling && !revShards) buildRev();
    if (!assembling && revShards) disposeRev();

    nebula.mesh.visible = stars.points.visible = assembling;
    plane.visible = !assembling;

    if (assembling) {
      S.background.set('#05070D');
      const k = easeInOutCubic(seg(t, 0, TRANS_DUR.shell2));
      const rem = 1 - k;
      for (const m of revShards.list) {
        const u = m.userData;
        m.position.set(u.c[0] + u.off[0] * rem, u.c[1] + u.off[1] * rem, u.off[2] * rem);
        m.quaternion.setFromAxisAngle(u.ax, u.ang * rem);
      }
      revShards.mat.uniforms.uFlash.value = Math.sin(seg(k, .78, 1.) * Math.PI) * .35;
      cam.position.set(0, 0, DIST + rem * .9); cam.lookAt(0, 0, 0);
      return {};
    }

    const g = page.geo, o = { t, widget: {} };
    let endTilt = 0;
    if (b === 1) {
      // 白色人类光标从右下走来，在框前画出第 4 场埋下的犹豫小圈，点下去 -> 短暂转圈 -> 浮现青色勾！
      const k = seg(t, .4, 3.35);
      const p = path([page.LW * .86, page.LH * .92], [g.box[0] + 6, g.box[1] + 6], k, 36, 62);
      o.cur = { x: p[0], y: p[1], who: 'me', alpha: 1 };
      const spinOn = t >= 3.35 && t < 3.75;
      o.widget = { spin: spinOn ? (t - 3.35) * 2.2 : 0, checked: seg(t, 3.75, 4.25), aiCheck: true };
      o.aiPulse = t > 3.8;
      // 青色勾落下 1 秒后，淡淡浮现整框 8 拉手选框 + 1.2° 凝视微倾
      o.widgetSel = seg(t, 5.1, 6.2) * .65;
      endTilt = ease(seg(t, 4.8, 7.2)) * .021;
    }
    drawEnhancedPage(page, o);
    W.pmap.needsUpdate = true;
    S.background.set('#EEF0F2');
    const pad = 1 + endTilt * 2.5;
    plane.scale.set(W.aspect * pad, pad, 1);
    cam.position.set(0, 0, DIST);
    cam.lookAt(0, 0, 0);
    cam.rotation.z = endTilt;
    return {};
  };
  return W;
}

// =====================================================================
// 第 9 场：sources（资料页 — 转场 8：收尾验证页平稳收折淡入米白纸底）
// =====================================================================
function sourcesWorld() {
  const S = new THREE.Scene(), cam = flatCam(16 / 9);
  S.background = new THREE.Color('#F6F6F3');
  const page = new Page(), pmap = tex(page.cv);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: pmap, transparent: true, toneMapped: false }));
  S.add(plane);

  const W = { scene: S, camera: cam, ink: 'dark', page, aspect: 16 / 9, pmap };
  W.resize = a => {
    W.aspect = a; cam.aspect = a; cam.updateProjectionMatrix();
    page.resize(a);
    plane.material.map.dispose(); plane.material.map = W.pmap = tex(page.cv);
    plane.scale.set(a, 1, 1);
  };
  W.update = (b, t) => {
    const tr = easeInOutCubic(seg(t, 0, TRANS_DUR.sources));
    plane.visible = tr < .99;
    if (plane.visible) {
      drawEnhancedPage(page, { t: 6, widget: { checked: 1, aiCheck: true }, aiPulse: true });
      W.pmap.needsUpdate = true;
      const sc = lerp(1, .72, tr);
      plane.scale.set(W.aspect * sc, sc, 1);
      plane.position.set(0, -tr * .16, -tr * .35);
      plane.material.opacity = 1 - tr;
    }
    return {};
  };
  return W;
}

export function makeWorlds(shellBits) {
  return {
    shell: openShellWorld(),
    word: wordWorld(),
    grid: gridWorld(),
    check: checkWorld(),
    label: labelWorld(shellBits.widget),
    click: clickWorld(),
    list: listWorld(),
    shell2: closeShellWorld(),
    sources: sourcesWorld(),
  };
}
