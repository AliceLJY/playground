// 鹿柴 · 辋川卧游
// 世界坐标以「屏幕高度」为 1。画心占 x ∈ [0, R]，往左依次是隔水、卷尾素纸。
// 手卷从右往左看：开场停在画的右端（深林与返照），慢慢向左展开，卷尾是诗。
(() => {
  'use strict';

  const { R, MOUNT, POEM_X, POEM_H, POEM_W, LIGHT_U } = LuzhaiLayout;
  const HOLD = 7;               // 开场停多久才开始自己往左展
  const DRIFT = 0.05;           // 自动展卷速度（屏高/秒）
  const IDLE = 5;               // 手松开多久后恢复自动展卷

  const canvas = document.getElementById('scroll');
  const poem = document.getElementById('poem');
  const note = document.getElementById('note');
  const hint = document.getElementById('hint');
  const muteBtn = document.getElementById('mute');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const params = new URLSearchParams(location.search);
  const fixedT = params.has('t') ? parseFloat(params.get('t')) : null;      // 验收用：冻结在某一秒
  const fixedCam = params.has('cam') ? parseFloat(params.get('cam')) : null; // 验收用：固定卷到某处

  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
  if (!gl) { document.getElementById('fallback').style.display = 'flex'; return; }

  const VS = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
  const FS = `
precision highp float;
uniform sampler2D uTex, uDepth;
uniform vec2 uRes, uPar;
uniform float uCam, uTime, uR, uMount, uLight, uDusk, uLightU;
const vec3 uPaper = vec3(0.885, 0.795, 0.625);

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0., a = .5; for(int i=0;i<5;i++){ v += a*noise(p); p = p*2.03 + 7.1; a *= .5; } return v; }

void main(){
  vec2 p = gl_FragCoord.xy / uRes.y;
  float wx = uCam + p.x, wy = p.y;
  vec3 col;
  if (wx >= 0.0) {
    vec2 uv = vec2(wx / uR, 1.0 - wy);
    // 按深度做很小的前后错动：近处动得多，远处几乎不动。画本身不改。
    float d = texture2D(uDepth, clamp(uv, 0., 1.)).r;
    vec2 off = (d - 0.30) * uPar * vec2(1.0 / uR, 1.0);
    d = texture2D(uDepth, clamp(uv + off, 0., 1.)).r;
    off = (d - 0.30) * uPar * vec2(1.0 / uR, 1.0);
    vec2 q = clamp(uv + off, vec2(0.0015, 0.002), vec2(0.9985, 0.998));
    col = texture2D(uTex, q).rgb;

    // 气：只在远处、画面中段，很淡，慢慢流，慢慢一呼一吸
    float far = smoothstep(0.42, 0.06, d);
    float band = smoothstep(0.12, 0.38, wy) * smoothstep(0.98, 0.62, wy);
    float n = fbm(vec2(wx * 1.25 - uTime * 0.011, wy * 2.4 + uTime * 0.004));
    float breath = 0.5 + 0.5 * sin(uTime * 0.42);
    float mist = far * band * smoothstep(0.38, 0.78, n) * (0.16 + 0.12 * breath);
    col = mix(col, vec3(0.83, 0.74, 0.52), mist);

    // 返景：落在苔上的那片暖色，染出来的，不是光柱。慢慢往左移，久了淡去。
    vec2 L = vec2(uLightU - 0.050 * uLight, 0.805 - 0.012 * uLight);
    vec2 e = (uv - L) / vec2(0.060, 0.034);
    float g = exp(-dot(e, e));
    float flick = 0.86 + 0.14 * sin(uTime * 0.31 + 1.3) * sin(uTime * 0.13);
    float leaf = smoothstep(0.46, 0.66, fbm(vec2(uv.x * uR * 46.0 + uTime * 0.035, uv.y * 62.0 - uTime * 0.012)));
    float trunk = smoothstep(0.62, 0.80, noise(vec2((uv.x * uR + uv.y * 1.9) * 15.0 - uLight * 2.2, 3.7)));
    float shade = clamp(leaf * 0.75 + trunk * 0.85, 0.0, 1.0);
    float amt = g * flick * (1.0 - uDusk) * 0.42 * (1.0 - 0.80 * shade);
    col *= 1.0 - 0.20 * shade * smoothstep(0.05, 0.6, g) * (1.0 - uDusk);
    col += vec3(0.50, 0.36, 0.06) * amt * (0.55 + 0.45 * smoothstep(0.2, 0.8, d));
    // 树冠上一点余晖
    vec2 e2 = (uv - vec2(0.86 - 0.03 * uLight, 0.30)) / vec2(0.10, 0.16);
    col += vec3(0.20, 0.13, 0.02) * exp(-dot(e2, e2)) * (1.0 - uDusk) * 0.35 * flick;
    // 光移走之后，林子略略沉下来
    col *= mix(vec3(1.0), vec3(0.86, 0.87, 0.90), uDusk * smoothstep(0.35, 1.0, uv.x));
  } else if (wx > -uMount) {
    float w = fbm(vec2(wx * 220.0, wy * 9.0));
    col = vec3(0.235, 0.205, 0.155) + 0.035 * (w - 0.5);
    col *= 0.92 + 0.08 * smoothstep(0.0, 0.012, min(-wx, wx + uMount));
  } else {
    float f = fbm(vec2(wx * 38.0, wy * 160.0)) * 0.6 + fbm(vec2(wx * 9.0, wy * 7.0)) * 0.4;
    col = uPaper * (0.97 + 0.07 * (f - 0.5));
    col *= 0.94 + 0.06 * smoothstep(0.0, 0.05, -uMount - wx);
  }
  // 绢与纸的细颗粒，免得色带
  col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) * 0.012;
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
  for (const n of ['uTex', 'uDepth', 'uRes', 'uPar', 'uCam', 'uTime', 'uR', 'uMount', 'uLight', 'uDusk', 'uLightU']) U[n] = gl.getUniformLocation(prog, n);

  function loadTex(unit, src) {
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
        gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        res();
      };
      img.onerror = rej; img.src = src;
    });
  }

  let W = 1, H = 1, aspect = 1, dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.round(innerWidth * dpr); H = Math.round(innerHeight * dpr);
    canvas.width = W; canvas.height = H; aspect = innerWidth / innerHeight;
    gl.viewport(0, 0, W, H);
    cam = clampCam(cam);
  }
  const rightCam = () => LuzhaiLayout.rightCam(aspect);
  const startCam = () => LuzhaiLayout.startCam(aspect);
  const endCam = () => LuzhaiLayout.endCam(aspect);
  const clampCam = (c) => LuzhaiLayout.clampCam(c, aspect);

  let cam = 0, vel = 0, dragging = false, lastX = 0, lastMove = 0, lastTouch = -1e9;
  let t0 = performance.now(), prev = t0, wipe = 0;

  function onDown(e) { dragging = true; lastX = e.clientX; vel = 0; canvas.classList.add('dragging'); lastTouch = performance.now(); startAudio(); }
  function onMove(e) {
    if (!dragging) return;
    const dx = (e.clientX - lastX) / innerHeight; lastX = e.clientX;
    cam = clampCam(cam - dx);
    const now = performance.now(); const dt = Math.max(1, now - lastMove) / 1000; lastMove = now;
    vel = vel * 0.6 + (-dx / dt) * 0.4; lastTouch = now;
  }
  function onUp() { dragging = false; canvas.classList.remove('dragging'); lastTouch = performance.now(); }
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); onDown(e); });
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  addEventListener('wheel', (e) => {
    const d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) / innerHeight;
    cam = clampCam(cam + d * 0.9); vel = 0; lastTouch = performance.now(); startAudio();
  }, { passive: true });
  addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { vel = -0.9; lastTouch = performance.now(); startAudio(); }
    if (e.key === 'ArrowRight') { vel = 0.9; lastTouch = performance.now(); startAudio(); }
  });
  addEventListener('resize', resize);

  function frame(now) {
    const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
    const t = fixedT !== null ? fixedT : (now - t0) / 1000;

    if (fixedCam !== null) cam = clampCam(fixedCam);
    else if (!dragging) {
      if (Math.abs(vel) > 0.002) { cam = clampCam(cam + vel * dt); vel *= Math.pow(0.05, dt); }
      else if (!reduced && t > HOLD && now - lastTouch > IDLE * 1000) {
        const ease = Math.min(1, (t - HOLD) / 6);      // 起步很缓
        cam = clampCam(cam - DRIFT * ease * dt);
      }
    }

    // 呼吸般的轻微错动，加上展卷时的一点跟随
    const sway = reduced ? 0 : 1;
    const px = sway * (0.0085 * Math.sin(t * 0.23) + 0.0030 * Math.sin(t * 0.61 + 0.7)) + Math.max(-0.02, Math.min(0.02, vel * 0.012));
    const py = sway * 0.0035 * Math.sin(t * 0.17 + 1.1);
    const light = Math.min(1, t / 95);
    const dusk = Math.max(0, Math.min(1, (t - 85) / 50));

    gl.uniform1i(U.uTex, 0); gl.uniform1i(U.uDepth, 1);
    gl.uniform2f(U.uRes, W, H); gl.uniform2f(U.uPar, px, py);
    gl.uniform1f(U.uCam, cam); gl.uniform1f(U.uTime, t); gl.uniform1f(U.uR, R); gl.uniform1f(U.uMount, MOUNT);
    gl.uniform1f(U.uLight, light); gl.uniform1f(U.uDusk, dusk); gl.uniform1f(U.uLightU, LIGHT_U);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // 卷尾的诗：跟着卷子走；露出一半以后，从右往左一行行显出来
    const h = innerHeight, pw = POEM_W;
    const left = (POEM_X - pw / 2 - cam) * h, top = (0.47 - POEM_H / 2) * h;
    poem.style.transform = `translate3d(${left.toFixed(1)}px, ${top.toFixed(1)}px, 0)`;
    const seen = (cam + aspect - (POEM_X - pw / 2)) / pw;   // 题诗进屏的比例
    if (seen > 0.6) wipe = Math.min(112, wipe + dt * 10);
    if (params.has('poem')) wipe = 112;
    poem.style.opacity = wipe > 0 ? '1' : '0';
    poem.style.setProperty('--wipe', (wipe - 12).toFixed(1) + '%');
    note.style.transform = `translate3d(${((POEM_X - cam) * h).toFixed(1)}px, ${(0.86 * h).toFixed(1)}px, 0) translateX(-50%)`;
    note.style.opacity = wipe >= 110 ? '1' : '0';

    requestAnimationFrame(frame);
  }

  // —— 声音：林间的风，远处的人语。要等第一次触碰才能响（浏览器规矩）。
  let ac = null, master = null, muted = false;
  function startAudio() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ac = new AC(); master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination);
    master.gain.linearRampToValueAtTime(muted ? 0 : 1, ac.currentTime + 3);
    hint.classList.remove('on'); muteBtn.classList.add('on');

    const len = ac.sampleRate * 4, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0; // 粉噪，听着比白噪柔
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.16; }
    function bed(type, freq, q, base, depth, rate) {
      const s = ac.createBufferSource(); s.buffer = buf; s.loop = true;
      const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ac.createGain(); g.gain.value = base;
      const lfo = ac.createOscillator(); lfo.frequency.value = rate; const lg = ac.createGain(); lg.gain.value = depth;
      lfo.connect(lg); lg.connect(g.gain); s.connect(f); f.connect(g); g.connect(master); s.start(); lfo.start();
    }
    bed('bandpass', 420, 0.5, 0.42, 0.20, 0.07);   // 风过林梢
    bed('highpass', 2600, 0.3, 0.050, 0.035, 0.11); // 叶子的细响

    Promise.all(['assets/voice1.mp3', 'assets/voice2.mp3'].map((u) => fetch(u).then((r) => r.arrayBuffer()).then((a) => new Promise((ok, no) => ac.decodeAudioData(a, ok, no)))))
      .then((voices) => {
        const say = (buffer, when, pan, gain) => {
          const s = ac.createBufferSource(); s.buffer = buffer; const g = ac.createGain(); g.gain.value = gain;
          s.connect(g);
          if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(master); } else g.connect(master);
          s.start(when);
        };
        let next = ac.currentTime + 2.5;
        (function loop() { // 一声喊，一声应，隔很久再来一回
          say(voices[0], next, -0.55, 0.95); say(voices[1], next + 3.4, -0.25, 0.80);
          next += 13 + Math.random() * 8;
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

  Promise.all([loadTex(0, 'assets/luzhai.jpg'), loadTex(1, 'assets/luzhai-depth.jpg')]).then(() => {
    resize(); cam = startCam(); t0 = prev = performance.now();
    if (fixedT === null) setTimeout(() => { if (!ac) hint.classList.add('on'); }, 2500);
    if (fixedT === null) setTimeout(() => hint.classList.remove('on'), 11000);
    requestAnimationFrame(frame);
    window.__luzhai = { get cam() { return cam; }, startCam, endCam, rightCam, R, MOUNT, POEM_X };
  }).catch(() => { document.getElementById('fallback').style.display = 'flex'; });
})();
