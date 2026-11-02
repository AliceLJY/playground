(function () {
  'use strict';
  const C = CoalCore, D = CoalData, $ = id => document.getElementById(id);
  const canvas = $('game'), renderer = CoalArt.createRenderer(canvas), audio = CoalAudio.create();
  const query = new URLSearchParams(location.search), requested = query.get('view') || '';
  let seed = (Number(query.get('seed')) >>> 0) || 7, selected = 0, progress = 1;
  let s = C.create(seed), started = false, paused = false, frozen = false, actualView = '', shownPhase = -1;
  let accumulator = 0, lastTime = 0, ix = 0, iy = 0, pointer = null, originX = 0, originY = 0;
  const keys = new Set(), costs = new Float64Array(600); let samples = 0;
  try { progress = C.unlocked(localStorage.getItem('coal-breakout-progress-v1')); } catch (_) { /* storage is optional */ }
  function fmt(t) { const sec = Math.max(0, Math.ceil(t)); return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0'); }
  function release() { ix = 0; iy = 0; keys.clear(); if (pointer !== null && canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer); pointer = null; }
  function resize() {
    const box = $('field').getBoundingClientRect(), scale = Math.min(box.width / 360, box.height / 520), dpr = Math.min(2, devicePixelRatio || 1);
    canvas.style.width = scale * 360 + 'px'; canvas.style.height = scale * 520 + 'px';
    canvas.width = Math.round(scale * 360 * dpr); canvas.height = Math.round(canvas.width * 520 / 360); renderer.draw(s);
  }
  function menu() {
    started = false; paused = false; frozen = false; actualView = ''; release(); audio.pause();
    $('title').hidden = false; $('upgrade').hidden = true; $('pause').hidden = true; $('result').hidden = true;
    $('levels').replaceChildren();
    D.levels.forEach((level, i) => {
      const b = document.createElement('button'); b.innerHTML = '<b>' + (i + 1).toString().padStart(2, '0') + '</b>' + (i < progress ? level.name : '尚未解锁');
      b.disabled = i >= progress; b.classList.toggle('selected', i === selected); b.onclick = () => { selected = i; menu(); }; $('levels').append(b);
    });
    $('brief-title').textContent = D.levels[selected].subtitle; $('brief-text').textContent = D.levels[selected].briefing;
    $('start').textContent = '出发 · ' + D.levels[selected].name;
    drawTitle();
  }
  function drawTitle() {
    const g = $('title-art').getContext('2d'); g.clearRect(0, 0, 520, 216); g.imageSmoothingEnabled = false;
    g.strokeStyle = '#36505E'; g.setLineDash([5, 9]); g.beginPath(); g.ellipse(260, 137, 172, 53, 0, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    CoalArt.sprite(g, renderer.atlas, 0, 260, 119, 108);
    CoalArt.sprite(g, renderer.atlas, 1, 104, 136, 56); CoalArt.sprite(g, renderer.atlas, 2, 395, 112, 56);
    CoalArt.sprite(g, renderer.atlas, 3, 354, 178, 36); g.fillStyle = '#72F1C4'; g.fillRect(143, 95, 10, 3); g.fillRect(166, 78, 6, 3);
    g.fillStyle = '#FF5DA2'; g.fillRect(365, 45, 5, 5); g.fillRect(150, 174, 4, 4);
  }
  function start(level = selected, fixedSeed = seed, stress = false) {
    selected = level; seed = fixedSeed; s = C.create(seed, selected, stress); started = true; paused = false; frozen = false; shownPhase = -1;
    release(); accumulator = 0; actualView = ''; $('title').hidden = true; $('pause').hidden = true; $('result').hidden = true; $('upgrade').hidden = true;
    audio.resume(); syncUI(); renderer.draw(s);
  }
  function togglePause(value = !paused) {
    if (!started || s.phase >= 2 || s.phase === 1) return;
    paused = value; release(); $('pause').hidden = !paused; accumulator = 0;
    if (paused) audio.pause(); else audio.resume();
  }
  function pick(index) { release(); C.step(s, 0, 0, index); shownPhase = -1; syncUI(); }
  function upgrade() {
    release(); $('cards').replaceChildren();
    for (let i = 0; i < 3; i++) {
      const id = s.offer[i], card = D.cards[id], b = document.createElement('button'); b.className = 'card'; b.disabled = !card;
      if (card) b.innerHTML = '<span class="icon">' + card.icon + '</span><strong>' + card.name + '</strong><em>' + card.tag + ' · ' + (s.cards[id] + 1) + '/3</em><span>' + card.desc + '</span>';
      else b.textContent = '已全部精通'; b.onclick = () => pick(i); $('cards').append(b);
    }
  }
  function result() {
    release(); audio.pause();
    if (s.phase === 2 && selected + 1 < D.levels.length) {
      progress = Math.max(progress, selected + 2);
      try { localStorage.setItem('coal-breakout-progress-v1', String(progress)); } catch (_) { /* in-session progress still works */ }
    }
    $('result-heading').textContent = s.phase === 2 ? selected === 2 ? '三关突围！小队今天下班了。' : '突围成功 · 下一场灾难已解锁' : '这次先歇一歇，再来。';
    $('next').hidden = s.phase !== 2 || selected >= 2; $('save-status').textContent = '';
    drawPoster();
  }
  function drawPoster() {
    const g = $('poster').getContext('2d'), w = 720;
    g.imageSmoothingEnabled = false; g.fillStyle = '#101827'; g.fillRect(0, 0, w, 1080);
    g.strokeStyle = '#24394A'; g.lineWidth = 1; for (let x = 0; x < w; x += 24) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 1080); g.stroke(); } for (let y = 0; y < 1080; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.strokeStyle = '#72F1C4'; g.lineWidth = 3; g.strokeRect(24, 24, 672, 1032);
    g.textAlign = 'left'; g.fillStyle = '#72F1C4'; g.font = '18px monospace'; g.fillText('TINY COAL / BIG TROUBLE', 54, 77);
    g.fillStyle = '#F4F1DE'; g.font = '900 70px sans-serif'; g.fillText('煤球突围', 48, 166);
    g.fillStyle = s.phase === 2 ? '#72F1C4' : '#FF5DA2'; g.font = 'bold 25px sans-serif'; g.fillText(s.phase === 2 ? '今日灾难，已清除。' : '这颗煤球，还会回来。', 54, 218);
    CoalArt.sprite(g, renderer.atlas, 0, 360, 340, 180);
    CoalArt.sprite(g, renderer.atlas, 1, 190, 386, 64); CoalArt.sprite(g, renderer.atlas, 2, 514, 335, 64);
    g.fillStyle = '#F4F1DE'; g.font = 'bold 32px sans-serif'; g.fillText('0' + (selected + 1) + ' / ' + s.stage.name, 54, 490);
    g.fillStyle = '#9CAFBa'; g.font = '19px sans-serif'; g.fillText('存活时间', 54, 542); g.fillText('击败数量', 366, 542);
    g.fillStyle = '#FFD166'; g.font = 'bold 55px monospace'; g.fillText(fmt(s.tick / 60), 50, 603); g.fillText(String(s.kills), 366, 603);
    g.fillStyle = '#9CAFBA'; g.font = '18px sans-serif'; g.fillText('这次带上的工作流', 54, 660);
    let row = 0;
    for (let i = 0; i < 8; i++) if (s.cards[i]) {
      const x = 54 + (row % 2) * 310, y = 695 + Math.floor(row / 2) * 32;
      g.fillStyle = '#72F1C4'; g.font = '17px sans-serif'; g.fillText(D.cards[i].name + ' ×' + s.cards[i], x, y); row++;
    }
    if (!row) { g.fillStyle = '#9CAFBA'; g.fillText('轻装出发，下次升级。', 54, 700); }
    CoalQR.draw(g, D.url, 446, 824, 205);
    g.fillStyle = '#F4F1DE'; g.font = 'bold 24px sans-serif'; g.fillText('我的AI小木屋', 54, 926);
    g.fillStyle = '#9CAFBA'; g.font = '18px sans-serif'; g.fillText('扫一下，带你的小队出发。', 54, 962);
    g.font = '14px monospace'; g.fillText('SEED ' + s.seed + ' · ' + (s.phase === 2 ? 'CLEAR' : 'TRY AGAIN'), 54, 1017);
  }
  async function save() {
    const button = $('save'); button.disabled = true;
    try {
      const blob = await new Promise(resolve => $('poster').toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('图片未能生成');
      const file = new File([blob], 'coal-breakout.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
        try { await navigator.share({ files: [file], title: '煤球突围' }); $('save-status').textContent = '分享图已交给系统。'; return; }
        catch (e) { if (e.name === 'AbortError') { $('save-status').textContent = '已取消，可随时再保存。'; return; } }
      }
      const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      $('save-status').textContent = '已下载 PNG 图片。';
    } catch (e) { $('save-status').textContent = '保存未成功，请再试一次。'; }
    finally { button.disabled = false; }
  }
  function syncUI() {
    $('stage-label').textContent = '0' + (selected + 1) + ' / ' + s.stage.name;
    $('clock').textContent = s.boss >= 0 ? fmt(s.tick / 60) : fmt((s.stage.duration - s.tick) / 60);
    $('hearts').textContent = '♥'.repeat(Math.max(0, s.hp)) + '♡'.repeat(s.maxHP - Math.max(0, s.hp)); $('hearts').setAttribute('aria-label', '生命 ' + s.hp);
    $('rank').textContent = '等级 ' + s.level + ' · 击败 ' + s.kills;
    const previous = s.level <= 1 ? 0 : s.nextXP - 10 - s.level * 5;
    $('xp-fill').style.width = Math.min(100, (s.xp - previous) / (s.nextXP - previous) * 100) + '%';
    const n = $('notice'); n.className = '';
    if (s.warning) { n.textContent = '⚠ 额度重置 ' + (s.warning / 60).toFixed(1) + ' 秒 · 先找空地！'; n.className = 'danger'; }
    else if (s.off) { n.textContent = '停火 ' + (s.off / 60).toFixed(1) + ' 秒 · 只管躲，别停下'; n.className = 'danger'; }
    else if (s.burst) { n.textContent = '额度已回满 · 火力爆发！'; n.className = 'burst'; }
    else if (s.boss >= 0) { n.textContent = '首领 / ' + s.stage.boss + (selected === 0 ? ' · 白边是真身' : selected === 2 ? ' · 黄框变红前离开' : ' · 逆着引力走'); n.className = 'boss'; }
    else n.textContent = s.stage.hint;
    $('boss-meter').hidden = s.boss < 0; if (s.boss >= 0) $('boss-meter').firstElementChild.style.width = Math.max(0, s.eHP[s.boss] / s.stage.bossHP * 100) + '%';
    if (shownPhase !== s.phase) {
      shownPhase = s.phase; $('upgrade').hidden = s.phase !== 1; $('result').hidden = s.phase < 2;
      if (s.phase === 1) upgrade(); if (s.phase >= 2) result();
    }
  }
  function input() {
    if (keys.size) { ix = +(keys.has('ArrowRight') || keys.has('KeyD')) - +(keys.has('ArrowLeft') || keys.has('KeyA')); iy = +(keys.has('ArrowDown') || keys.has('KeyS')) - +(keys.has('ArrowUp') || keys.has('KeyW')); }
  }
  function advance(ms) {
    accumulator += Math.max(0, ms);
    while (accumulator + 1e-8 >= 1000 / 60) { input(); C.step(s, ix, iy, -2); accumulator -= 1000 / 60; audio.update(s); }
    syncUI(); renderer.draw(s);
  }
  function frame(time) {
    const dt = lastTime ? Math.min(100, time - lastTime) : 0; lastTime = time;
    const begin = performance.now();
    if (started && !paused && !frozen && !document.hidden) advance(dt); else renderer.draw(s);
    costs[samples++ % costs.length] = performance.now() - begin;
    requestAnimationFrame(frame);
  }
  canvas.addEventListener('pointerdown', e => {
    if (!started || paused || s.phase !== 0 || pointer !== null) return;
    pointer = e.pointerId; originX = e.clientX; originY = e.clientY; canvas.setPointerCapture(pointer); ix = 0; iy = 0;
  });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerId !== pointer) return;
    const dx = e.clientX - originX, dy = e.clientY - originY, d = Math.hypot(dx, dy);
    ix = d < 3 ? 0 : dx / Math.max(28, d); iy = d < 3 ? 0 : dy / Math.max(28, d);
    if (d > 55) { originX = e.clientX - dx / d * 55; originY = e.clientY - dy / d * 55; }
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, e => { if (e.pointerId === pointer) release(); });
  window.addEventListener('keydown', e => {
    if (e.code === 'Escape' || e.code === 'KeyP') { togglePause(); return; }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'].includes(e.code) && started && !paused && s.phase === 0) { e.preventDefault(); keys.add(e.code); }
  });
  window.addEventListener('keyup', e => { keys.delete(e.code); ix = 0; iy = 0; });
  window.addEventListener('blur', () => { release(); togglePause(true); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { release(); togglePause(true); audio.pause(); } });
  window.addEventListener('resize', resize);
  $('start').onclick = () => start(); $('retry').onclick = () => start(); $('next').onclick = () => start(Math.min(2, selected + 1));
  $('skip').onclick = () => pick(-1); $('pause-button').onclick = () => togglePause(); $('resume').onclick = () => togglePause(false);
  $('pause-retry').onclick = () => start(); $('back-title').onclick = menu; $('result-home').onclick = menu; $('save').onclick = save;
  async function sound() {
    try { const on = await audio.toggle(); $('sound').textContent = on ? '声音' : '静音'; $('sound').setAttribute('aria-pressed', String(on)); $('sound').setAttribute('aria-label', on ? '关闭声音' : '开启声音'); $('title-sound').textContent = '声音：' + (on ? '开 · 点此关闭' : '关 · 点此开启'); }
    catch (_) { $('title-sound').textContent = '声音暂不可用 · 仍可静音游玩'; }
  }
  $('sound').onclick = sound; $('title-sound').onclick = sound;
  function fixed(view) {
    if (!['hero', 'levelup', 'boss', 'result', 'stress'].includes(view)) return;
    start(view === 'boss' ? 2 : 0, view === 'boss' ? 1 : 7, view === 'stress');
    const pilot = CoalPilot.create('precise', seed), target = view === 'hero' ? 5040 : view === 'boss' ? 11820 : view === 'stress' ? 28 : 18000;
    for (let f = 0; f < 22000 && s.phase < 2; f++) {
      if (view === 'levelup' && s.phase === 1) break;
      if (s.tick >= target && s.phase !== 1) break;
      const a = pilot(s); C.step(s, a[0], a[1], a[2]);
    }
    const valid = view === 'hero' && s.tick === 5040 || view === 'levelup' && s.phase === 1 || view === 'boss' && s.boss >= 0 && s.warning > 0 && s.phase < 2 || view === 'result' && s.phase === 2 || view === 'stress' && s.live >= 300;
    actualView = valid ? view : 'failed'; frozen = true; shownPhase = -1; syncUI(); renderer.draw(s);
  }
  function snapshot() { return { ...C.snapshot(s), requestedView: requested, actualView, started, paused, frozen, progress, input: [ix, iy], pixelRatio: devicePixelRatio, renderRatio: canvas.width / 360, canvas: [canvas.width, canvas.height], drawCalls: renderer.calls, sound: audio.enabled, audioState: audio.state }; }
  // Basic public playtest contract; extra diagnostic controls require an explicit URL flag/view.
  window.__PLAYTEST__ = { ready: false, snapshot, reset: () => start(selected, seed), setSeed: n => { seed = (Number(n) >>> 0) || 1; start(selected, seed); }, step: ms => { if (started && !paused) advance(Math.min(300000, Math.max(0, Number(ms) || 0))); return snapshot(); } };
  if (requested || query.has('test')) Object.assign(window.__PLAYTEST__, {
    start, freeze: value => { frozen = value; }, state: () => s, choose: pick,
    metrics: () => { const v = Array.from(costs.slice(0, Math.min(samples, costs.length))).sort((a, b) => a - b); return { samples, p95: v[Math.floor(v.length * .95)], max: v[v.length - 1], drawCalls: renderer.calls }; },
    resetMetrics: () => { samples = 0; costs.fill(0); },
    paint: only => renderer.draw(s, only),
    simulate: (frames, mode = 'precise') => { const p = CoalPilot.create(mode, seed); for (let i = 0; i < frames && s.phase < 2; i++) { const a = p(s); C.step(s, ...a); } syncUI(); renderer.draw(s); return snapshot(); }
  });
  menu(); resize(); if (requested) fixed(requested); window.__PLAYTEST__.ready = true; requestAnimationFrame(frame);
})();
