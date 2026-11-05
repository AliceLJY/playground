// 刀马旦精灵 · 页面：动作小窗循环播放 + 试玩舞台。逻辑在 core.js，帧数据在 clips.js。
(function () {
  const CLIPS = self.DMD_CLIPS, D = self.DMD;
  const imgs = {};
  const loads = Object.keys(CLIPS).map((k) => new Promise((ok) => {
    const im = new Image(); im.onload = ok; im.onerror = ok; im.src = `assets/${k}.webp`; imgs[k] = im;
  }));
  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  function draw(g, name, frame, x, y, face, scale) {
    const im = imgs[name], c = D.cellOf(CLIPS[name], frame);
    if (!im || !im.naturalWidth) return;
    g.save(); g.translate(x, y); g.scale(face * scale, scale);
    g.drawImage(im, c.sx, c.sy, c.w, c.h, c.dx, c.dy, c.w, c.h);
    g.restore();
  }

  // —— 动作小窗：循环动作照常循环，单次动作播完停半秒再重播。
  const minis = [...document.querySelectorAll('canvas[data-clip]')].map((cv) => {
    const name = cv.dataset.clip, clip = CLIPS[name];
    const scale = Math.min((cv.width - 20) / clip.cell[0], (cv.height - 16) / clip.cell[1]);
    return { cv, g: cv.getContext('2d'), name, clip, scale, frame: 0, acc: 0, hold: 0 };
  });
  function stepMini(m, dt) {
    if (m.hold > 0) { m.hold -= dt; if (m.hold <= 0) m.frame = 0; return; }
    m.acc += dt;
    while (m.acc >= m.clip.ms[m.frame % m.clip.ms.length]) {
      m.acc -= m.clip.ms[m.frame % m.clip.ms.length];
      m.frame++;
      if (m.frame >= m.clip.count) { if (m.clip.loop) m.frame = 0; else { m.frame = m.clip.count - 1; m.hold = 600; break; } }
    }
  }
  function drawMini(m) {
    const { g, cv, clip, scale } = m;
    g.clearRect(0, 0, cv.width, cv.height);
    const ax = cv.width / 2 + (clip.anchor[0] - clip.cell[0] / 2) * scale;
    draw(g, m.name, m.frame, ax, cv.height - 8, 1, scale);
  }

  // —— 舞台
  const stage = document.getElementById('stage'), sg = stage.getContext('2d');
  const GROUND = 380;
  const keys = { left: false, right: false, run: false };
  let player = D.create(CLIPS, { x: 300, minX: 90, maxX: stage.width - 90 });

  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'arrowleft') keys.left = true;
    else if (k === 'arrowright') keys.right = true;
    else if (k === 'shift') keys.run = true;
    else if (k === 'j') D.trigger(player, 'attack');
    else if (k === 'k' || k === ' ') D.trigger(player, 'jump');
    else if (k === 'h') D.trigger(player, 'hurt');
    else return;
    if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
  });
  addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'arrowleft') keys.left = false;
    if (k === 'arrowright') keys.right = false;
    if (k === 'shift') keys.run = false;
  });
  addEventListener('blur', () => { keys.left = keys.right = false; });
  document.querySelectorAll('.pad button').forEach((b) => {
    const k = b.dataset.k;
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    if (k === 'run') {
      b.addEventListener('click', () => { keys.run = !keys.run; b.setAttribute('aria-pressed', String(keys.run)); });
    } else if (k === 'left' || k === 'right') {
      const set = (v) => { keys[k] = v; };
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); set(true); });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => set(false));
    } else {
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); D.trigger(player, k); });
    }
  });

  function drawStage() {
    const w = stage.width, h = stage.height;
    const sky = sg.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, cssVar('--stage-top')); sky.addColorStop(1, cssVar('--stage-mid'));
    sg.fillStyle = sky; sg.fillRect(0, 0, w, GROUND);
    const floor = sg.createLinearGradient(0, GROUND, 0, h);
    floor.addColorStop(0, cssVar('--floor')); floor.addColorStop(1, cssVar('--floor-deep'));
    sg.fillStyle = floor; sg.fillRect(0, GROUND, w, h - GROUND);
    sg.fillStyle = 'rgba(0,0,0,.2)';
    sg.beginPath(); sg.ellipse(player.x, GROUND, 66, 9, 0, 0, Math.PI * 2); sg.fill();
    draw(sg, player.state, player.frame, player.x, GROUND, player.face, 1);
  }

  // —— 统一试玩钩子（AGENTS.md 第 3 节）
  let ready = false, paused = false;
  self.__PLAYTEST__ = {
    get ready() { return ready; },
    snapshot: () => ({ state: player.state, frame: player.frame, x: Math.round(player.x), face: player.face, run: keys.run, plays: { ...player.plays } }),
    reset: () => { player = D.create(CLIPS, { x: 300, minX: 90, maxX: stage.width - 90 }); },
    step: (ms) => { paused = true; for (let t = 0; t < ms; t += 16) { D.step(player, keys, 16); minis.forEach((m) => stepMini(m, 16)); } drawStage(); minis.forEach(drawMini); },
    trigger: (a) => D.trigger(player, a),
  };

  let last = performance.now();
  function tick(t) {
    const dt = Math.min(50, t - last); last = t;
    if (!paused) { D.step(player, keys, dt); minis.forEach((m) => stepMini(m, dt)); }
    drawStage(); minis.forEach(drawMini);
    requestAnimationFrame(tick);
  }
  Promise.all(loads).then(() => {
    ready = true;
    const view = new URLSearchParams(location.search).get('view');
    if (view) document.getElementById({ stills: 'stills', actions: 'actions', stage: 'play' }[view] || 'play')?.scrollIntoView();
    requestAnimationFrame(tick);
  });
})();
