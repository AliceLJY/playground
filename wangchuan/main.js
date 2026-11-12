// 鹿柴 · 辋川卧游
// 移步换景：一句诗一幅画，一幅一幅往山里走。每一景里镜头向左展、往里推一小段，推到头在云气里换到下一景。
// 画不拆层、不补画；每幅配一张深度图，着色器按深度让近处比远处多动一点。
(() => {
  'use strict';

  const L = LuzhaiLayout, { R, N, SCENES, END } = L;
  const IDLE = 4;               // 手松开多久后恢复自己走

  const canvas = document.getElementById('scroll');
  const poem = document.getElementById('poem');
  const note = document.getElementById('note');
  const hint = document.getElementById('hint');
  const muteBtn = document.getElementById('mute');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const params = new URLSearchParams(location.search);
  const fixedT = params.has('t') ? parseFloat(params.get('t')) : null; // 验收用：冻结在某一秒
  const fixedG = params.has('g') ? parseFloat(params.get('g')) : null; // 验收用：固定在行程某处

  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
  if (!gl) { document.getElementById('fallback').style.display = 'flex'; return; }

  const VS = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
  const FS = `
precision highp float;
uniform sampler2D uTex, uDepth;
uniform vec2 uRes, uPar, uLight, uLightR;
uniform vec2 uTr[4];
uniform float uCx, uZoom, uPush, uTime, uR, uVeil, uPaper, uWarm, uGlow, uShadow, uDusk, uSun;

const vec3 PAPER = vec3(0.885, 0.795, 0.625);
const vec3 MIST = vec3(0.880, 0.720, 0.400);

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0., a = .5; for(int i=0;i<5;i++){ v += a*noise(p); p = p*2.03 + 7.1; a *= .5; } return v; }

void main(){
  vec2 p = gl_FragCoord.xy / uRes.y;
  vec2 sc = p - vec2(uRes.x / uRes.y * 0.5, 0.5);     // 屏幕正中为原点
  vec3 col;
  float paperNoise = fbm(vec2(p.x * 38.0, p.y * 160.0)) * 0.6 + fbm(vec2(p.x * 9.0, p.y * 7.0)) * 0.4;
  vec3 paper = PAPER * (0.97 + 0.07 * (paperNoise - 0.5));

  if (uPaper < 0.5) {
    // 镜头：向左展、往里推。往里推的时候近处的东西比远处的涨得快，所以按深度反推回去取样。
    vec2 w = vec2(uCx, 0.5) + sc / uZoom;
    vec2 uv = vec2(w.x / uR, 1.0 - w.y);
    float d = texture2D(uDepth, clamp(uv, 0., 1.)).r;
    for (int k = 0; k < 2; k++) {
      float nd = d - 0.30;
      vec2 ww = vec2(uCx, 0.5) + sc / (uZoom * (1.0 + uPush * nd));
      uv = vec2(ww.x / uR, 1.0 - ww.y) + nd * uPar * vec2(1.0 / uR, 1.0);
      d = texture2D(uDepth, clamp(uv, 0., 1.)).r;
    }
    vec2 q = clamp(uv, vec2(0.0015, 0.002), vec2(0.9985, 0.998));
    col = texture2D(uTex, q).rgb;

    // 傍晚的暖意：越往里走日头越低，向阳的右边染得略暖一点
    col *= mix(vec3(1.0), vec3(1.045, 1.0, 0.93), uWarm * (0.35 + 0.65 * q.x));

    // 远处的气：很淡，慢慢流，慢慢一呼一吸
    float far = smoothstep(0.42, 0.06, d);
    float band = smoothstep(0.10, 0.38, w.y) * smoothstep(0.98, 0.60, w.y);
    float n = fbm(vec2(w.x * 1.25 - uTime * 0.011, w.y * 2.4 + uTime * 0.004));
    float breath = 0.5 + 0.5 * sin(uTime * 0.42);
    col = mix(col, MIST, far * band * smoothstep(0.38, 0.78, n) * (0.10 + 0.08 * breath));

    // 返景：落下来的那片暖色，是染出来的，不是光柱。
    vec2 e = (q - uLight) / uLightR;
    float g = exp(-dot(e, e));
    // 影：枝叶的碎影，加上树干拉长的斜影。斜影取自这幅画自己的树干——沿日头方向往上找，那里暗，这里就落影。
    float leaf = smoothstep(0.46, 0.66, fbm(vec2(q.x * uR * 44.0 + uTime * 0.03, q.y * 60.0 - uTime * 0.012)));
    // 日头在右边、很低：每根树干的影子从树根起向左拖出去，日头越低拖得越长、越平
    float trunk = 0.0;
    vec2 dir = normalize(vec2(-1.0, 0.34 - 0.16 * uSun));
    float len = 0.42 + 0.50 * uSun;
    for (int k = 0; k < 4; k++) {
      vec2 rel = vec2((q.x - uTr[k].x) * uR, q.y - uTr[k].y);
      float along = dot(rel, dir), across = abs(rel.x * dir.y - rel.y * dir.x);
      float wdt = 0.016 + 0.030 * along + 0.006 * noise(vec2(along * 30.0, float(k)));
      trunk = max(trunk, smoothstep(wdt, wdt * 0.35, across) * smoothstep(-0.01, 0.03, along) * smoothstep(len, len * 0.55, along));
    }
    float shade = clamp(leaf * 0.55 + trunk * 0.95, 0.0, 1.0) * uShadow;
    float flick = 0.86 + 0.14 * sin(uTime * 0.31 + 1.3) * sin(uTime * 0.13);
    // 画是勾线平涂的，上面不画光；这片暖色是叠上去的：先把绢色提亮染暖，再在光里压出影子
    float lit = g * flick * uGlow;
    col = col * (1.0 + vec3(0.30, 0.22, 0.02) * lit) + vec3(0.16, 0.10, 0.00) * lit * (1.0 - 0.85 * shade);
    col *= 1.0 - 0.30 * shade * smoothstep(0.05, 0.6, g) * min(1.0, uGlow * 1.6);
    // 日头落下去以后，林子略略沉下来
    col *= mix(vec3(1.0), vec3(0.84, 0.86, 0.90), uDusk);

    // 换景：云气从疏到密漫上来，把这一景盖住
    float vn = fbm(vec2(p.x * 1.6 + uTime * 0.02, p.y * 2.6 - uTime * 0.008));
    float cover = smoothstep(0.0, 1.0, uVeil * 1.7 - (1.0 - vn) * 0.7);
    col = mix(col, MIST * (0.98 + 0.06 * (vn - 0.5)), cover);
  } else {
    // 卷尾素纸：从云气里淡出来
    float vn = fbm(vec2(p.x * 1.6 + uTime * 0.02, p.y * 2.6 - uTime * 0.008));
    float cover = smoothstep(0.0, 1.0, uVeil * 1.7 - (1.0 - vn) * 0.7);
    col = mix(paper, MIST * (0.98 + 0.06 * (vn - 0.5)), cover);
  }
  col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) * 0.012;   // 细颗粒，免得色带
  gl_FragColor = vec4(col, 1.0);
}`;

  function compile(type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  for (const n of ['uTex', 'uDepth', 'uRes', 'uPar', 'uLight', 'uLightR', 'uCx', 'uZoom', 'uPush', 'uTime', 'uR', 'uVeil', 'uPaper', 'uWarm', 'uGlow', 'uShadow', 'uDusk', 'uSun', 'uTr']) U[n] = gl.getUniformLocation(prog, n);

  function loadTex(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        let source = img;
        if (img.width > max) { // 老手机贴图上限不够就缩一下
          const c = document.createElement('canvas'); c.width = max; c.height = Math.round(img.height * max / img.width);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); source = c;
        }
        const t = gl.createTexture();
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        res(t);
      };
      img.onerror = rej; img.src = src;
    });
  }
  const tex = SCENES.map(() => null);   // 每景 { color, depth }，后面的景在后台陆续载入
  const loadScene = (i) => Promise.all([loadTex(`assets/${SCENES[i].key}.jpg`), loadTex(`assets/${SCENES[i].key}-depth.jpg`)])
    .then(([color, depth]) => { tex[i] = { color, depth }; });

  let W = 1, H = 1, aspect = 1;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.round(innerWidth * dpr); H = Math.round(innerHeight * dpr);
    canvas.width = W; canvas.height = H; aspect = innerWidth / innerHeight;
    gl.viewport(0, 0, W, H);
  }

  let g = 0, vel = 0, dragging = false, lastX = 0, lastMove = 0, lastTouch = -1e9;
  let t0 = performance.now(), prev = t0, wipe = 0;
  // 走到还没载好的景之前先停在云里等
  const limit = () => { let i = 0; while (i < N && tex[i]) i++; return i >= N ? END : i - 0.02; };
  const clampG = (x) => Math.max(0, Math.min(limit(), x));

  function onDown(e) { dragging = true; lastX = e.clientX; vel = 0; canvas.classList.add('dragging'); lastTouch = performance.now(); startAudio(); }
  function onMove(e) {
    if (!dragging) return;
    const dg = (e.clientX - lastX) / (innerHeight * 0.85); lastX = e.clientX;   // 手往右拨，卷子往左展，人往里走
    g = clampG(g + dg);
    const now = performance.now(); const dt = Math.max(1, now - lastMove) / 1000; lastMove = now;
    vel = vel * 0.6 + (dg / dt) * 0.4; lastTouch = now;
  }
  function onUp() { dragging = false; canvas.classList.remove('dragging'); lastTouch = performance.now(); }
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); onDown(e); });
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  addEventListener('wheel', (e) => {
    const d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) / innerHeight;
    g = clampG(g + d * 0.6); vel = 0; lastTouch = performance.now(); startAudio();
  }, { passive: true });
  addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === ' ') { vel = 0.5; lastTouch = performance.now(); startAudio(); }
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { vel = -0.5; lastTouch = performance.now(); startAudio(); }
  });
  addEventListener('resize', resize);

  const state = { scene: 0, u: 0 };
  function frame(now) {
    const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
    const t = fixedT !== null ? fixedT : (now - t0) / 1000;

    if (fixedG !== null) g = Math.max(0, Math.min(END, fixedG));
    else if (!dragging) {
      if (Math.abs(vel) > 0.004) { g = clampG(g + vel * dt); vel *= Math.pow(0.04, dt); }
      else if (!reduced && t > L.HOLD && now - lastTouch > IDLE * 1000) {
        const i = Math.min(N, Math.floor(g));
        const secs = i < N ? SCENES[i].seconds : 14;
        g = clampG(g + Math.min(1, (t - L.HOLD) / 5) * dt / secs);      // 起步很缓
      }
    }
    const i = Math.min(N, Math.floor(g)), u = g >= END ? 1 : g - i;
    state.scene = i; state.u = u;
    const veil = L.veil(i, u);

    gl.uniform2f(U.uRes, W, H); gl.uniform1f(U.uTime, t); gl.uniform1f(U.uR, R); gl.uniform1f(U.uVeil, veil);
    if (i < N && tex[i]) {
      const s = SCENES[i], cam = L.camera(i, u, aspect), e = L.ease(u);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex[i].color);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tex[i].depth);
      gl.uniform1i(U.uTex, 0); gl.uniform1i(U.uDepth, 1); gl.uniform1f(U.uPaper, 0);
      const sway = reduced ? 0 : 1;
      gl.uniform2f(U.uPar,
        sway * (0.0085 * Math.sin(t * 0.23) + 0.0030 * Math.sin(t * 0.61 + 0.7)) + Math.max(-0.02, Math.min(0.02, vel * 0.03)),
        sway * 0.0035 * Math.sin(t * 0.17 + 1.1));
      gl.uniform1f(U.uCx, cam.cx); gl.uniform1f(U.uZoom, cam.zoom); gl.uniform1f(U.uPush, 0.55 * e);
      gl.uniform1f(U.uWarm, s.warm);

      // 光：第三景里从右边照进来、落到苔上；第四景里停在苔上，树影慢慢挪，末了移走
      let lx = 0, ly = 0, glow = 0, shadow = 0, dusk = 0, sun = 0;
      if (s.light) {
        const li = s.light; lx = li.u; ly = li.v;
        if (li.enterFrom) {
          const k = L.ease(L.clamp01(u / li.arrive));
          lx = li.enterFrom[0] + (li.u - li.enterFrom[0]) * k; ly = li.enterFrom[1] + (li.v - li.enterFrom[1]) * k;
          glow = 0.35 + 0.45 * k; shadow = 0.35 + 0.50 * k; sun = 0.2 * u;
        } else {
          const gone = L.ease(L.clamp01((u - li.leave) / (1 - L.FADE - li.leave)));
          lx = li.u - 0.05 * u; ly = li.v - 0.012 * u;
          glow = 0.85 * (1 - gone); shadow = 1; dusk = gone; sun = 0.3 + 0.7 * u;
        }
        gl.uniform2f(U.uLightR, li.ru, li.rv);
      } else gl.uniform2f(U.uLightR, 0.05, 0.05);
      gl.uniform2f(U.uLight, lx, ly);
      gl.uniform1f(U.uGlow, s.light ? glow : 0);
      gl.uniform1f(U.uShadow, shadow); gl.uniform1f(U.uDusk, dusk); gl.uniform1f(U.uSun, sun);
      gl.uniform2fv(U.uTr, new Float32Array((s.trunks || [[9, 9], [9, 9], [9, 9], [9, 9]]).flat()));
    } else {
      gl.uniform1f(U.uPaper, 1);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // 卷尾的诗：素纸从云气里出来以后，从右往左一行行显出来
    const h = innerHeight;
    poem.style.transform = `translate3d(${((aspect - L.POEM_W) / 2 * h).toFixed(1)}px, ${((0.47 - L.POEM_H / 2) * h).toFixed(1)}px, 0)`;
    if (i >= N && u > L.FADE * 0.7) wipe = Math.min(112, wipe + dt * 10); else if (i < N) wipe = 0;
    if (params.has('poem')) wipe = 112;
    poem.style.opacity = i >= N && wipe > 0 ? '1' : '0';
    poem.style.setProperty('--wipe', (wipe - 12).toFixed(1) + '%');
    note.style.opacity = i >= N && wipe >= 110 ? '1' : '0';

    setVoiceLevel(i < N ? SCENES[i].voice : 0.08);
    requestAnimationFrame(frame);
  }

  // —— 声音：林间的风，远处的人语。要等第一次触碰才能响（浏览器规矩）。
  // 人语在第二景最清楚（「但闻人语响」），越往里走越远。
  let ac = null, master = null, voiceBus = null, muted = false;
  function setVoiceLevel(v) { if (voiceBus) voiceBus.gain.setTargetAtTime(v, ac.currentTime, 1.2); }
  function startAudio() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ac = new AC(); master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination);
    master.gain.linearRampToValueAtTime(muted ? 0 : 1, ac.currentTime + 3);
    voiceBus = ac.createGain(); voiceBus.gain.value = SCENES[Math.min(N - 1, state.scene)].voice; voiceBus.connect(master);
    hint.classList.remove('on'); muteBtn.classList.add('on');

    const len = ac.sampleRate * 4, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0; // 粉噪，听着比白噪柔
    for (let k = 0; k < len; k++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913; d[k] = (b0 + b1 + b2 + w * 0.1848) * 0.16; }
    function bed(type, freq, q, base, depth, rate) {
      const s = ac.createBufferSource(); s.buffer = buf; s.loop = true;
      const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const gn = ac.createGain(); gn.gain.value = base;
      const lfo = ac.createOscillator(); lfo.frequency.value = rate; const lg = ac.createGain(); lg.gain.value = depth;
      lfo.connect(lg); lg.connect(gn.gain); s.connect(f); f.connect(gn); gn.connect(master); s.start(); lfo.start();
    }
    bed('bandpass', 420, 0.5, 0.42, 0.20, 0.07);    // 风过林梢
    bed('highpass', 2600, 0.3, 0.050, 0.035, 0.11); // 叶子的细响

    Promise.all(['assets/voice1.mp3', 'assets/voice2.mp3'].map((url) => fetch(url).then((r) => r.arrayBuffer()).then((a) => new Promise((ok, no) => ac.decodeAudioData(a, ok, no)))))
      .then((voices) => {
        const say = (buffer, when, pan, gain) => {
          const s = ac.createBufferSource(); s.buffer = buffer; const gn = ac.createGain(); gn.gain.value = gain;
          s.connect(gn);
          if (ac.createStereoPanner) { const pn = ac.createStereoPanner(); pn.pan.value = pan; gn.connect(pn); pn.connect(voiceBus); } else gn.connect(voiceBus);
          s.start(when);
        };
        let next = ac.currentTime + 2.5;
        (function loop() { // 一声喊，一声应，隔一阵再来一回
          say(voices[0], next, -0.55, 0.95); say(voices[1], next + 3.4, -0.25, 0.80);
          next += 11 + Math.random() * 6;
          setTimeout(loop, Math.max(1000, (next - ac.currentTime - 2) * 1000));
        })();
      }).catch(() => {});
  }
  muteBtn.addEventListener('click', (e) => {
    e.stopPropagation(); startAudio(); muted = !muted; muteBtn.classList.toggle('off', muted);
    if (master) master.gain.setTargetAtTime(muted ? 0 : 1, ac.currentTime, 0.3);
  });
  muteBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  document.addEventListener('visibilitychange', () => { if (ac) (document.hidden ? ac.suspend() : ac.resume()); });

  // 先载第一景就开场，其余的在后台按顺序接着载
  const first = fixedG !== null ? Math.min(N - 1, Math.floor(fixedG)) : 0;
  loadScene(first).then(() => {
    resize(); t0 = prev = performance.now();
    if (fixedT === null) setTimeout(() => { if (!ac) hint.classList.add('on'); }, 2500);
    if (fixedT === null) setTimeout(() => hint.classList.remove('on'), 11000);
    requestAnimationFrame(frame);
    window.__luzhai = { get g() { return g; }, state, loaded: () => tex.map(Boolean) };
    (async () => { for (let k = 0; k < N; k++) if (!tex[k]) { try { await loadScene(k); } catch (e) { break; } } })();
  }).catch(() => { document.getElementById('fallback').style.display = 'flex'; });
})();
