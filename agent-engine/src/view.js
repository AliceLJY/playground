// DOM side of "agent 引擎是什么". Everything that moves is a replay of what src/core.js computed: the loop's events,
// the gate's verdicts, the demo line on each card. Nothing here decides an outcome.
(function () {
  'use strict';
  const C = window.AgentCore;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  const root = document.documentElement;
  const scenes = $$('.scene'), stepsBox = $('#steps'), playBtn = $('#play'), barFill = $('#barfill');
  const query = C.parseView(location.search);
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const S = { cur: 0, mode: 'manual', playing: false, ended: false, settled: false, timers: [], dwellTimer: 0, dwell: [] };
  const later = (fn, ms) => S.timers.push(setTimeout(fn, ms));
  const clearTimers = () => { S.timers.forEach(clearTimeout); S.timers = []; };

  // ---------- step buttons ----------
  scenes.forEach((s, i) => {
    const b = el('button'); b.type = 'button';
    b.append(el('b', '', String(i + 1)), el('span', '', s.dataset.title));
    b.setAttribute('aria-label', '镜头 ' + (i + 1) + '：' + s.dataset.title);
    b.addEventListener('click', () => userGo(i));
    stepsBox.appendChild(b);
  });

  // ---------- scene 1: the three layers come in one after another ----------
  const layers = $$('.layer');
  function layersReset() { layers.forEach((l) => l.classList.remove('show')); }
  function layersSettle() { layers.forEach((l) => l.classList.add('show')); }
  function layersPlay() { layersReset(); [100, 500, 900].forEach((ms, i) => later(() => layers[i].classList.add('show'), ms)); }

  // ---------- scene 2: the API alone ----------
  const chatRun = C.apiOnly(C.scriptedModel, C.demoMessages());
  const chat = $('#chat');
  {
    const user = chatRun.messages[1], ai = chatRun.last, call = ai.toolCalls[0];
    const me = el('div', 'bub me', user.content);
    const bot = el('div', 'bub ai', ai.content);
    bot.appendChild(el('pre', '', JSON.stringify({ tool_call: { name: call.name, arguments: call.args } }, null, 2)));
    bot.appendChild(el('span', 'stamp', '没人执行 · 停在这里'));
    const huh = el('div', 'bub me', '……？');
    chat.append(me, bot, huh);
  }
  const bubbles = $$('.bub', chat), stamp = $('.stamp', chat);
  function chatReset() { bubbles.forEach((b) => b.classList.remove('show')); stamp.classList.remove('show'); }
  function chatSettle() { bubbles.forEach((b) => b.classList.add('show')); stamp.classList.add('show'); }
  function chatPlay() {
    chatReset();
    later(() => bubbles[0].classList.add('show'), 200); later(() => bubbles[1].classList.add('show'), 1100);
    later(() => stamp.classList.add('show'), 2300); later(() => bubbles[2].classList.add('show'), 3300);
  }

  // ---------- scene 3: the loop ----------
  const loopRun = C.runLoop({});
  const msgsBox = $('#msgs'), turnEl = $('#turn'), phaseEl = $('#phase'), arc = $('#arc'), stations = $$('#ring .st');
  const msgEls = loopRun.messages.map((m) => {
    const f = C.formatMessage(m), d = el('div', 'msg ' + f.cls);
    d.append(el('i', '', f.label + ' '), document.createTextNode(f.text + (f.note ? ' ' + f.note : '')));
    msgsBox.appendChild(d);
    return d;
  });
  const loopState = { turn: 0, phase: '待机', station: -1, shown: 0, done: false, applied: 0 };
  function loopReset() {
    loopState.turn = 0; loopState.phase = '待机'; loopState.station = -1; loopState.shown = 0; loopState.done = false; loopState.applied = 0;
    turnEl.textContent = '0'; phaseEl.textContent = '待机'; arc.style.strokeDashoffset = '100';
    stations.forEach((s) => s.classList.remove('active')); msgEls.forEach((m) => m.classList.remove('show'));
  }
  function loopApply(e) {
    loopState.turn = e.turn; turnEl.textContent = String(e.turn);
    const last = e.phase === 'output';
    loopState.phase = last ? '停：模型不再要工具' : C.STATION_NAMES[e.station] + (e.phase === 'gate' && !e.allow ? '（拒绝）' : '');
    phaseEl.textContent = loopState.phase;
    loopState.station = last ? -1 : e.station;
    stations.forEach((s, i) => s.classList.toggle('active', i === loopState.station));
    arc.style.strokeDashoffset = String(100 - 100 * (last ? 1 : e.station / 6));
    e.added.forEach((idx) => { msgEls[idx].classList.add('show'); loopState.shown++; });
    loopState.applied++; loopState.done = loopState.applied === loopRun.events.length;
  }
  function loopSettle() { loopReset(); loopRun.events.forEach(loopApply); }
  function loopPlay() {
    loopReset();
    loopRun.events.forEach((e, i) => later(() => loopApply(e), 300 + i * C.LOOP_EVENT_MS));
  }

  // ---------- scene 4: failure cards ----------
  const cardEls = $$('#cards .fc'), demos = C.cardDemos();
  cardEls.forEach((c, i) => { $('.live code', c).textContent = demos[C.CARD_KEYS[i]]; });
  function setFlip(c, on) { c.classList.toggle('flip', on); c.setAttribute('aria-pressed', on ? 'true' : 'false'); }
  const cardsBox = $('#cards');
  function toggleCard(c) { setFlip(c, !c.classList.contains('flip')); }
  cardsBox.addEventListener('click', (e) => { const c = e.target.closest('.fc'); if (c) toggleCard(c); });
  cardsBox.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('fc')) { e.preventDefault(); toggleCard(e.target); }
  });
  function cardsReset() { cardEls.forEach((c) => setFlip(c, false)); }
  function cardsSettle() { cardsReset(); query.flip.forEach((n) => setFlip(cardEls[n - 1], true)); }

  // ---------- scene 6: the world-state gate ----------
  const life = C.runLife();
  const nodes = $$('#lifeflow .node'), verdictBox = $('#verdict'), worldBox = $('#world'), retellEl = $('#retell');
  const verdictEls = life.steps.map((s) => {
    const sign = s.verdict.status === 'reject' ? '✕ ' : s.verdict.status === 'fix' ? '~ ' : '✓ ';
    const cls = s.verdict.status === 'reject' ? 'no' : s.verdict.status === 'fix' ? 'fix' : 'ok';
    const d = el('div', 'v'); d.appendChild(el('span', cls, sign + s.verdict.note));
    verdictBox.appendChild(d); return d;
  });
  const worldGhost = el('span', 'ghost', C.formatWorld(life.world)), worldNow = el('span', 'now', C.formatWorld(life.start));
  worldBox.append(worldGhost, worldNow);
  retellEl.textContent = life.retell;
  const lifeState = { lit: 0, verdicts: 0, updated: false };
  function lifeReset() {
    nodes.forEach((n) => n.classList.remove('lit')); verdictEls.forEach((v) => v.classList.remove('show'));
    worldNow.textContent = C.formatWorld(life.start); lifeState.lit = 0; lifeState.verdicts = 0; lifeState.updated = false;
  }
  function lifeLight(k) { nodes[k].classList.add('lit'); lifeState.lit = nodes.filter((n) => n.classList.contains('lit')).length; }
  function lifeVerdict(i) { verdictEls[i].classList.add('show'); lifeState.verdicts = i + 1; }
  function lifeWorld() { worldNow.textContent = C.formatWorld(life.world); lifeState.updated = true; }
  function lifeSettle() { lifeReset(); lifeLight(0); lifeLight(1); lifeVerdict(0); lifeVerdict(1); lifeVerdict(2); lifeLight(2); lifeWorld(); lifeLight(3); }
  function lifePlay() {
    lifeReset();
    later(() => lifeLight(0), 300);
    later(() => { lifeLight(1); lifeVerdict(0); }, 1400); later(() => lifeVerdict(1), 2500); later(() => lifeVerdict(2), 3500);
    later(() => { lifeLight(2); lifeWorld(); }, 4700); later(() => lifeLight(3), 5800);
  }

  // ---------- per-scene table ----------
  const SCENE = [
    { anim: 1400, reset: layersReset, settle: layersSettle, play: layersPlay },
    { anim: 3700, reset: chatReset, settle: chatSettle, play: chatPlay },
    { anim: 300 + loopRun.events.length * C.LOOP_EVENT_MS, reset: loopReset, settle: loopSettle, play: loopPlay },
    { anim: 600, reset: cardsReset, settle: cardsSettle, play: cardsReset },
    { anim: 600, reset() {}, settle() {}, play() {} },
    { anim: 6300, reset: lifeReset, settle: lifeSettle, play: lifePlay },
  ];
  // dwell uses the text that is on screen once the scene has settled, without the card backs that start hidden
  function visibleChars(s) {
    const c = s.cloneNode(true);
    $$('.fix', c).forEach((n) => n.remove());
    return c.textContent.replace(/\s+/g, '').length;
  }
  S.dwell = scenes.map((s, i) => C.dwellMs(visibleChars(s), SCENE[i].anim));

  // ---------- navigation ----------
  function show(i, animate) {
    clearTimers();
    S.cur = (i + scenes.length) % scenes.length;
    scenes.forEach((s, k) => s.classList.toggle('on', k === S.cur));
    $$('button', stepsBox).forEach((b, k) => b.setAttribute('aria-current', k === S.cur ? 'true' : 'false'));
    const sc = SCENE[S.cur];
    sc.reset();
    if (animate) { S.settled = false; sc.play(); later(() => { S.settled = true; }, sc.anim); }
    else { sc.settle(); S.settled = true; }
  }
  function dwellStart() {
    clearTimeout(S.dwellTimer);
    barFill.style.transition = 'none'; barFill.style.width = '0';
    if (!S.playing || root.classList.contains('still')) return;
    void barFill.offsetWidth;
    barFill.style.transition = 'width ' + S.dwell[S.cur] + 'ms linear'; barFill.style.width = '100%';
    S.dwellTimer = setTimeout(autoNext, S.dwell[S.cur]);
  }
  function autoNext() {
    if (!S.playing) return;
    if (S.cur >= scenes.length - 1) { S.playing = false; S.ended = true; S.mode = 'ended'; barFill.style.transition = 'none'; barFill.style.width = '100%'; label(); return; }
    show(S.cur + 1, true); dwellStart();
  }
  function label() { playBtn.textContent = S.playing ? '暂停播放' : S.ended ? '重新播放' : '自动播放'; }
  function stopAuto(mode) {
    clearTimeout(S.dwellTimer);
    S.playing = false; S.mode = mode || 'manual'; barFill.style.transition = 'none'; barFill.style.width = '0'; label();
  }
  function userGo(i) {
    stopAuto('manual'); S.ended = false; label();
    if (!reduced) root.classList.remove('still');
    show(i, !reduced);
    // coming from the pager at the bottom of a long scene: bring the top of the new scene into view
    const top = $('.stepper').getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.6) window.scrollTo({ top: window.scrollY + top - 8, behavior: reduced ? 'auto' : 'smooth' });
  }
  function startAuto(from) {
    root.classList.remove('still'); S.ended = false; S.playing = true; S.mode = 'auto'; label();
    show(from, true); dwellStart();
  }
  playBtn.addEventListener('click', () => {
    if (S.playing) { stopAuto('manual'); return; }
    startAuto(S.ended ? 0 : S.cur);
  });
  // anything the visitor does on the page means they are reading or exploring: autoplay hands over (the play button resumes it)
  const engage = (e) => { if (S.playing && !(e.target.closest && e.target.closest('#play'))) stopAuto('manual'); };
  ['pointerdown', 'keydown', 'wheel', 'touchmove'].forEach((t) => document.addEventListener(t, engage, { passive: true }));
  $('#prev').addEventListener('click', () => userGo(S.cur - 1));
  $('#next').addEventListener('click', () => userGo(S.cur + 1));
  document.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('.fc')) return;
    if (e.key === 'ArrowRight') userGo(S.cur + 1);
    else if (e.key === 'ArrowLeft') userGo(S.cur - 1);
  });

  // ---------- hook ----------
  const hook = {
    ready: false,
    core: C,
    go(n) { userGo(n - 1); },
    settle() { clearTimers(); SCENE[S.cur].settle(); S.settled = true; },
    state() {
      return {
        view: S.cur + 1, scenes: scenes.length, mode: S.mode, playing: S.playing, ended: S.ended, settled: S.settled,
        reduced, dwell: S.dwell.slice(),
        layers: { shown: layers.filter((l) => l.classList.contains('show')).length, total: layers.length },
        chat: { shown: bubbles.filter((b) => b.classList.contains('show')).length, total: bubbles.length, stamp: stamp.classList.contains('show') },
        loop: { turn: loopState.turn, phase: loopState.phase, station: loopState.station, messages: loopState.shown, total: msgEls.length, done: loopState.done },
        cards: { flipped: cardEls.map((c, i) => (c.classList.contains('flip') ? i + 1 : 0)).filter(Boolean), total: cardEls.length },
        life: { lit: lifeState.lit, verdicts: lifeState.verdicts, updated: lifeState.updated, world: worldNow.textContent, retell: retellEl.textContent },
      };
    },
  };
  window.__agentEngine = hook;

  // ---------- start ----------
  if (query.view) {
    root.classList.add('still'); S.mode = 'frozen'; label();
    show(query.view - 1, false);
  } else if (reduced) {
    root.classList.add('still'); S.mode = 'reduced'; label();
    show(0, false);
  } else {
    // the normal entry waits on scene 1 and plays its entrance; autoplay starts only when the visitor presses the button
    label();
    show(0, true);
  }
  hook.ready = true;
})();
