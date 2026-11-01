/* MV mode (?mv=1): plays mv-script.json through the real engine for the short film 「像素办公室的一天」.
   The page time is the only clock: the recorder steps it frame by frame, and everything here (time of day, light,
   camera, subtitles, fades) is computed from it, so a frame never depends on how fast it was captured.
   Loaded only when ?mv=1; the live and demo office never run this file. Also loads in Node for a dry run. */
(function (root) {
  'use strict';
  const BEIJING = 8 * 3600000;
  const toMs = hhmm => { const [h, m] = hhmm.split(':').map(Number); return Date.parse('2026-11-01T00:00:00Z') - BEIJING + (h * 60 + m) * 60000; };
  const lerp = (a, b, k) => a + (b - a) * k, clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const ease = k => k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  const mix = (c1, c2, k) => '#' + [0, 2, 4].map(i => Math.round(lerp(parseInt(c1.slice(1 + i, 3 + i), 16), parseInt(c2.slice(1 + i, 3 + i), 16), k)).toString(16).padStart(2, '0')).join('');

  function create(script, C) {
    const keys = script.clock.map(([at, hhmm]) => [at * 1000, toMs(hhmm)]);
    const WIDE = { cx: 180, cy: 208, z: 1 };                 // whole room: logical y 12..404 fills the 1080×1176 canvas
    let cursor = 0, lightsOffAt = null;
    const fired = {}, log = [], arrived = new Set(), queued = new Set(), inside = new Set();
    let lastHello = null, lastThanks = null, lastDelivery = null, bossInside = false;
    const cams = script.camera.filter(c => c.at != null).map(c => ({ ...c, start: c.at * 1000 })).sort((p, q) => p.start - q.start);
    const subs = script.subtitles.filter(s => s.at != null).map(s => ({ ...s, start: s.at * 1000, end: s.until * 1000 }));

    function clock(ms) {
      if (ms <= keys[0][0]) return keys[0][1];
      for (let i = 1; i < keys.length; i++) if (ms <= keys[i][0]) {
        const [t0, c0] = keys[i - 1], [t1, c1] = keys[i];
        return c0 + (c1 - c0) * (ms - t0) / (t1 - t0);
      }
      return keys.at(-1)[1];
    }
    const hours = ms => ((clock(ms) + BEIJING) % 86400000) / 3600000;
    // Day → dusk 16:40–17:40, dusk → night 20:40–21:50: the room is drawn twice and the two lights blended.
    function light(ms) {
      const h = hours(ms);
      if (h < 16.67) return { a: 'day', b: 'day', w: 0 };
      if (h < 17.67) return { a: 'day', b: 'dusk', w: ease((h - 16.67) / 1) };
      if (h < 20.67) return { a: 'dusk', b: 'dusk', w: 0 };
      if (h < 21.83) return { a: 'dusk', b: 'night', w: ease((h - 20.67) / 1.16) };
      return { a: 'night', b: 'night', w: 0 };
    }
    // Page colours follow the light too, so the night room does not sit in a daytime page.
    function palette(ms) {
      const { a, b, w } = light(ms), P = { day: ['#eee9dd', '#253334', '#72796e'], dusk: ['#eadbc3', '#3a2f26', '#83705a'], night: ['#22292d', '#efe6cf', '#9aa39c'] };
      return P[a].map((c, i) => mix(c, P[b][i], w));
    }
    const say = (type, ms, extra = {}) => log.push({ type, t: +(ms / 1000).toFixed(3), ...extra });
    function trigger(name, ms) {
      if (fired[name] != null) return; fired[name] = ms;
      for (const c of script.camera) if (c.on === name) cams.push({ ...c, start: ms + (c.after || 0) * 1000 });
      for (const s of script.subtitles) if (s.on === name) { const start = ms + (s.after || 0) * 1000; subs.push({ ...s, start, end: start + s.dur * 1000 }); }
      cams.sort((p, q) => p.start - q.start); subs.sort((p, q) => p.start - q.start);
    }

    function start(sim) {
      for (const a of sim.actors) { sim.setStatus(a.id, 'off'); a.x = C.door.x; a.y = C.door.y; a.path = []; a.dest = null; }
      sim.boss.x = C.door.x; sim.boss.y = C.door.y; sim.boss.path = []; sim.boss.dest = null; sim.bossTarget = { ...C.door }; sim.bossAway = true;
    }
    // Fire every scripted event whose time has come (called before each 20 ms engine step).
    function tick(ms, sim) {
      while (cursor < script.events.length && script.events[cursor].at * 1000 <= ms) {
        const e = script.events[cursor++], at = new Date(clock(ms)).toISOString();
        if (e.notice) sim.notice({ text: e.notice, at });
        else if (e.visitors != null) sim.setVisitors(e.visitors);
        else if (e.treat) sim.treat(e.treat, at);
        else if ('boss' in e) { sim.bossTarget = e.boss === 'desk' ? { ...C.bossDesk } : e.boss === 'door' ? { ...C.door } : null; sim.bossAway = e.boss === 'door'; if (e.boss === 'door') say('boss-leaving', ms); }
        else if (e.lights === 'off') { lightsOffAt = ms; say('lights-off', ms); }
        else if (e.id) { sim.setStatus(e.id, e.status, at); say('status', ms, { id: e.id, status: e.status }); if (e.status === 'off') arrived.delete(e.id); }
      }
    }
    // Watch the engine after each step and note what happened, frame-accurately, for the music (events.json).
    function observe(ms, sim) {
      for (const a of sim.actors) {
        const home = C.home(a.i), atHome = C.distance(a, home) < 1;
        if ((a.status === 'busy' || a.status === 'idle') && atHome && !arrived.has(a.id)) { arrived.add(a.id); inside.add(a.id); say('arrive', ms, { id: a.id }); }
        if (a.status === 'done' && a.doneArrived != null && !fired[`done:${a.id}:${a.changed}`]) { fired[`done:${a.id}:${a.changed}`] = ms; say('confetti', ms, { id: a.id }); }
        if (a.status === 'waiting' && !a.path.length && a.dest && !queued.has(`${a.id}:${a.changed}`)) { queued.add(`${a.id}:${a.changed}`); say('knock', ms, { id: a.id }); }
        if (a.status === 'off' && C.distance(a, C.door) < 1 && inside.has(a.id)) { inside.delete(a.id); say('exit', ms, { id: a.id }); }
      }
      if (!bossInside && C.distance(sim.boss, C.bossDesk) < 1 && !sim.bossAway) { bossInside = true; say('boss-in', ms); }
      if (sim.bossAway && bossInside && C.distance(sim.boss, C.door) < 1) { bossInside = false; say('boss-out', ms); }
      const d = sim.delivery;
      if (d && d.phase === 'holding' && lastDelivery !== d.arrived) { lastDelivery = d.arrived; say('paper', ms); trigger('paper', ms); }
      const hello = sim.greeting();
      if (hello && hello.at !== lastHello) { lastHello = hello.at; say('hello', ms); trigger('hello', ms); }
      const thanks = sim.thanksNow();
      if (thanks && thanks.at !== lastThanks) { lastThanks = thanks.at; say('thanks', ms, { kind: thanks.kind }); trigger('thanks', ms); }
      const L = light(ms);
      if (L.b === 'dusk' && L.w > 0 && fired.dusk == null) { fired.dusk = ms; say('dusk', ms); }
      if (L.b === 'night' && L.w > 0 && fired.night == null) { fired.night = ms; say('night', ms); }
    }

    // Camera: {cx, cy} is the logical point at the canvas centre, z the zoom over the whole-room framing.
    function camera(ms) {
      let cur = { ...WIDE };
      for (const c of cams) {
        if (c.start > ms) break;
        const target = c.to === 'wide' ? { ...WIDE } : { cx: c.to[0], cy: c.to[1], z: c.zoom || 1 };
        const k = ease(clamp((ms - c.start) / (c.dur * 1000)));
        cur = { cx: lerp(cur.cx, target.cx, k), cy: lerp(cur.cy, target.cy, k), z: lerp(cur.z, target.z, k) };
      }
      const hw = 180 / cur.z, hh = 196 / cur.z;
      return { cx: clamp(cur.cx, hw, 360 - hw), cy: clamp(cur.cy, 12 + hh, 404 - hh), z: cur.z };
    }
    // Canvas transform for a 1080×1176 canvas: 3 device pixels per logical pixel at the wide framing.
    function view(ms) {
      const { cx, cy, z } = camera(ms), s = 3 * z;
      return { s, ox: 540 - cx * s, oy: 588 - cy * s, z };
    }
    function subtitle(ms) {
      for (const s of subs) if (ms >= s.start && ms < s.end) return { text: s.text, alpha: clamp(Math.min((ms - s.start) / 250, (s.end - ms) / 250)) };
      return null;
    }
    // Lights off: quick drop to a moonlit dark, then all the way to black for the cut to the signature card.
    function darkness(ms) {
      if (lightsOffAt == null || ms < lightsOffAt) return 0;
      const t = (ms - lightsOffAt) / 1000;
      return t < .25 ? lerp(0, .78, t / .25) : t < 1.6 ? .78 : Math.min(1, lerp(.78, 1, (t - 1.6) / 1.2));
    }
    return { clock, hours, light, palette, start, tick, observe, camera, view, subtitle, darkness, log, seconds: script.seconds, title: script.title, WIDE };
  }

  // ---- browser-only drawing (helpers come from office.js: r, text) ----
  // Busy monitors scroll a few lines of code and blink a cursor; the CC close-up needs the screen to be alive.
  function drawUnder(ctx, sim, h, ms) {
    const t = ms / 1000;
    for (const a of sim.actors) {
      if (a.status !== 'busy' || a.path.length || a.i === 10) continue;
      const [x, y] = h.C.desks[a.i];
      h.r(ctx, '#213b40', x - 10, y - 10, 20, 12);
      const scroll = Math.floor(t * 2.5 + a.i * 3);
      for (let row = 0; row < 4; row++) {
        const n = scroll + row, len = 3 + ((n * 7919 + a.i * 131) % 11), indent = (n * 31 % 3) * 2;
        h.r(ctx, row === 3 ? '#cfe3c4' : ['#71a29a', '#5c8d83', '#90b8a3', '#7fb0a0'][n % 4], x - 8 + indent, y - 9 + row * 3, Math.min(len, 15 - indent), 1);
      }
      if (Math.floor(t * 2.2 + a.i) % 2) h.r(ctx, '#e8f1df', x + 6, y - 1, 1, 2);
    }
    // The front door stands open while someone is passing through it.
    const near = [...sim.actors, ...sim.visitors, sim.boss].some(p => h.C.distance(p, h.C.door) < 22);
    if (near) { h.r(ctx, '#2c3a33', 330, 376, 16, 22); h.r(ctx, '#f0d79a', 331, 397, 14, 1); h.r(ctx, '#99a288', 344, 373, 4, 27); h.r(ctx, '#f5e3af', 345, 386, 1, 3); }
  }

  // Ambient light over the people too: a warm wash at dusk, a deep blue at night with a pool of light at each desk
  // where someone is still working, so the night room reads as night and the two left are lit by their screens.
  function drawOver(ctx, sim, h, ms, L) {
    const w = { day: 0, dusk: 0, night: 0 }; w[L.a] += 1 - L.w; w[L.b] += L.w;
    if (w.dusk > 0) { ctx.fillStyle = `rgba(214, 120, 52, ${(0.13 * w.dusk).toFixed(3)})`; ctx.fillRect(0, 0, 360, 420); }
    if (w.night > 0) {
      ctx.fillStyle = `rgba(14, 20, 46, ${(0.5 * w.night).toFixed(3)})`; ctx.fillRect(0, 0, 360, 420);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const a of sim.actors) {
        if (a.status !== 'busy' || a.path.length) continue;
        const [x, y] = h.C.desks[a.i], g = ctx.createRadialGradient(x, y + 6, 2, x, y + 6, 34);
        g.addColorStop(0, `rgba(150, 200, 170, ${(0.32 * w.night).toFixed(3)})`); g.addColorStop(1, 'rgba(150, 200, 170, 0)');
        ctx.fillStyle = g; ctx.fillRect(x - 36, y - 30, 72, 72);
      }
      // The reading lamp by the sofa stays on until the lights go out.
      const g = ctx.createRadialGradient(114, 266, 1, 114, 266, 26); g.addColorStop(0, `rgba(250, 210, 130, ${(0.28 * w.night).toFixed(3)})`); g.addColorStop(1, 'rgba(250, 210, 130, 0)');
      ctx.fillStyle = g; ctx.fillRect(86, 238, 56, 56); ctx.restore();
    }
  }

  function mount(doc) {
    doc.body.classList.add('mv');
    const el = (tag, id, parent = doc.body) => { const n = doc.createElement(tag); n.id = id; parent.append(n); return n; };
    const title = el('div', 'mv-title'), sub = el('div', 'mv-sub'), day = el('canvas', 'mv-day'), sign = el('div', 'mv-sign'), dark = el('div', 'mv-dark');
    title.innerHTML = '<span class="mv-name"></span><time class="mv-clock"></time>';
    sub.innerHTML = '<span></span>';
    day.width = 1080; day.height = 120;
    sign.textContent = '我的AI小木屋 · 一起工作，也一起发呆';
    return { title, sub, day, sign, dark };
  }
  // Title clock, subtitle, page colours, a small sun/moon on a day bar, and the final fade. All from page time.
  function updateDom(ui, mv, ms, fmt) {
    const [bg, ink, muted] = mv.palette(ms), st = document.body.style;
    st.setProperty('--mv-bg', bg); st.setProperty('--mv-ink', ink); st.setProperty('--mv-muted', muted);
    ui.title.querySelector('.mv-name').textContent = mv.title;
    ui.title.querySelector('.mv-clock').textContent = fmt(mv.clock(ms));
    const s = mv.subtitle(ms), span = ui.sub.querySelector('span');
    if (s) { if (span.textContent !== s.text) span.textContent = s.text; ui.sub.style.opacity = s.alpha.toFixed(3); } else { ui.sub.style.opacity = '0'; }
    const dk = mv.darkness(ms); ui.dark.style.opacity = (dk >= 1 ? 1 : Math.max(0, (dk - .78) / .22)).toFixed(3);
    const g = ui.day.getContext('2d'), h = mv.hours(ms), k = clamp((h - 8.5) / (24 - 8.5));
    g.clearRect(0, 0, 1080, 120);
    const px = (c, x, y, w, hh) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, hh); };
    for (let x = 120; x < 960; x += 12) px(muted + '88', x, 66, 6, 3);
    for (let i = 0; i <= 5; i++) px(muted, 120 + i * 168 - 2, 58, 4, 18);
    const x = 120 + k * 840, sun = h < 17.5, moon = h >= 19;
    if (sun) { px('#e9b84a', x - 15, 45, 30, 30); px('#f6d77a', x - 9, 51, 12, 6); for (const [dx, dy] of [[-27, 57], [21, 57], [-3, 33], [-3, 81]]) px('#e9b84a', x + dx, dy, 6, 6); }
    else if (moon) { px('#efe2b0', x - 9, 45, 18, 30); px('#efe2b0', x - 15, 51, 30, 18); px('#d6c78f', x - 6, 54, 6, 6); px('#d6c78f', x + 3, 63, 6, 3); }
    else { px('#e08a4c', x - 15, 51, 30, 24); px('#f0b26a', x - 9, 51, 18, 6); px(muted, x - 24, 75, 48, 3); }
  }

  const api = { create, drawUnder, drawOver, mount, updateDom, toMs };
  if (typeof module !== 'undefined') module.exports = api;
  root.OfficeMV = api;
})(typeof window === 'undefined' ? globalThis : window);
