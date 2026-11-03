/* MV mode (?mv=1): plays mv-script.json through the real engine for the short film 「像素办公室的一天」.
   The page time is the only clock: the recorder steps it frame by frame, and everything here (time of day, light,
   camera, subtitles, fades) is computed from it, so a frame never depends on how fast it was captured.
   Loaded only when ?mv=1; the live and demo office never run this file. Also loads in Node for a dry run. */
(function (root) {
  'use strict';
  const BEIJING = 8 * 3600000;
  const toMs = hhmm => { const [h, m, s = 0] = hhmm.split(':').map(Number); return Date.parse('2026-11-01T00:00:00Z') - BEIJING + (h * 60 + m) * 60000 + s * 1000; };
  const lerp = (a, b, k) => a + (b - a) * k, clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const ease = k => k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  const mix = (c1, c2, k) => '#' + [0, 2, 4].map(i => Math.round(lerp(parseInt(c1.slice(1 + i, 3 + i), 16), parseInt(c2.slice(1 + i, 3 + i), 16), k)).toString(16).padStart(2, '0')).join('');

  function create(script, C) {
    const keys = script.clock.map(([at, hhmm]) => [at * 1000, toMs(hhmm)]);
    const WIDE = { cx: 180, cy: 208, z: 1 };                 // whole room: logical y 12..404 fills the 1080×1176 canvas
    let cursor = 0, lightsOffAt = null, trackedGuard = null, trackedHandoff = null;
    const stats = JSON.parse(JSON.stringify(script.stats)), events = [];
    const fired = {}, log = [], arrived = new Set(), queued = new Set(), inside = new Set();
    let lastHello = null, lastThanks = null, lastDelivery = null, bossInside = false;
    const phases = {}, foods = new Set();
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
      sim.classicLeisure = true; // the published film keeps the pre-department game corner allocation
      sim.eventsEnabled = !!script.performances;
      for (const a of sim.actors) { sim.setStatus(a.id, 'off'); a.x = C.door.x; a.y = C.door.y; a.path = []; a.dest = null; }
      sim.boss.x = C.door.x; sim.boss.y = C.door.y; sim.boss.path = []; sim.boss.dest = null; sim.bossTarget = { ...C.door }; sim.bossAway = true;
    }
    // Fire every scripted event whose time has come (called before each 20 ms engine step).
    function tick(ms, sim) {
      // Cosmetic signal freshness follows the fictional day, never the machine clock.
      sim.clockBase = clock(ms) - sim.time * 1000;
      while (cursor < script.events.length && script.events[cursor].at * 1000 <= ms) {
        const e = script.events[cursor++], at = new Date(clock(ms)).toISOString();
        if (e.scene) {
          const next = { ...sim.scene, ...e.scene };
          if (e.scene.call) next.call = { ...e.scene.call, since: at };
          if (e.scene.meeting) next.meeting = { ...e.scene.meeting, since: sim.scene.meeting?.since || at, roundAt: at };
          if (e.scene.guard) next.guard = { ...e.scene.guard, at };
          for (const key of ['snack','souvenir','radar','supper']) if(e.scene[key]) next[key] = {...e.scene[key],at};
          if (e.scene.meeting && !sim.scene.meeting) { events.push({ kind:'meeting', at:next.meeting.since }); stats.meetingsTotal++; stats.today.meetings++; }
          if (e.scene.call && !sim.scene.call) { stats.callsTotal++; stats.today.calls++; }
          if (e.scene.dispatched) { const n=e.scene.dispatched.filter(id=>!sim.scene.dispatched.includes(id)).length; stats.handoffsTotal+=n; stats.today.handoffs+=n; }
          sim.setScene(next);
          for (const key of ['call','meeting','guard','dispatched']) if (key in e.scene) say(key, ms, { value: next[key] });
        }
        else if (e.notice) sim.notice({ text: e.notice, at });
        else if (e.visitors != null) { const n=Math.max(0,e.visitors-sim.visitorTarget);stats.visitorsTotal+=n;stats.today.visitors+=n;sim.setVisitors(e.visitors); }
        else if (e.treat) { stats.treatsTotal++; stats.today.treats++; sim.treat(e.treat, at); }
        else if (e.meet) { sim.meet(e.meet, at); say('meet',ms,{kind:e.meet}); }
        else if (e.quota) { sim.setQuota(Object.fromEntries(Object.entries(e.quota).map(([id,min])=>[id,new Date(clock(ms)+min*60000).toISOString()])),clock(ms)); }
        else if ('boss' in e) { sim.bossTarget = e.boss === 'desk' ? { ...C.bossDesk } : e.boss === 'door' ? { ...C.door } : null; sim.bossAway = e.boss === 'door'; if (e.boss === 'door') say('boss-leaving', ms); }
        else if (e.lights === 'off') { lightsOffAt = ms; say('lights-off', ms); }
        else if (e.id) { sim.setStatus(e.id, e.status, at); say('status', ms, { id: e.id, status: e.status }); if (e.status === 'off') arrived.delete(e.id); }
      }
    }
    // Watch the engine after each step and note what happened, frame-accurately, for the music (events.json).
    function observe(ms, sim) {
      trackedGuard = sim.guard && {x:sim.guard.x,y:sim.guard.y};
      const cc=sim.actors.find(a=>a.id==='cc') || sim.actors.find(a=>a.i===0), recipient=sim.actors.find(a=>a.id===sim.handoffWalk?.id);
      if(recipient)trackedHandoff={x:(cc.x+recipient.x)/2,y:(cc.y+recipient.y)/2-24};
      // The board records the actual start after everyone has walked downstairs, not the earlier summons.
      const meeting=sim.scene.meeting;
      if(script.performances && meeting && !fired['meeting-start:'+meeting.since] && meeting.members.every(id=>{const a=sim.actors.find(a=>a.id===id);return a && ['meeting','argue'].includes(a.activity) && !a.path.length && a.y>=490;})) {
        fired['meeting-start:'+meeting.since]=ms;
        const event=events.filter(e=>e.kind==='meeting').at(-1);if(event)event.at=new Date(clock(ms)).toISOString();
        say('meeting-start',ms,{storyTime:clock(ms)});
      }
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
      for (const kind of ['handoffWalk','reception','argue','snack','radar','souvenir','supper','melon','quotaEvent']) {
        const e=sim[kind], phase=e?.phase || (e?'active':'end'), key=kind+':'+phase+(kind==='argue'?':'+e?.round:'');
        if(phases[kind]!==key) { if(e || phases[kind]) {say(kind,ms,{phase,round:e?.round,ids:e?.ids || e?.hosts});trigger(key,ms);} phases[kind]=key; }
      }
      for(const f of sim.foodNow()) {const key=f.kind+':'+f.id;if(!foods.has(key)){foods.add(key);say('food',ms,{kind:f.kind,id:f.id});}}
      const caller = sim.actors.find(a => a.activity === 'call' && !a.path.length);
      if (caller && fired['call-seated'] == null) { fired['call-seated'] = ms; sim.scene.call.since = new Date(clock(ms)).toISOString(); say('call-seated', ms, { storyTime: clock(ms) }); }
      if (sim.guard?.lap && sim.scene.guard.phase === 'patrol') { sim.setScene({ ...sim.scene, guard: { ...sim.scene.guard, phase: 'done', ok: true } }); say('guard-done', ms); }
      const L = light(ms);
      if (L.b === 'dusk' && L.w > 0 && fired.dusk == null) { fired.dusk = ms; say('dusk', ms); }
      if (L.b === 'night' && L.w > 0 && fired.night == null) { fired.night = ms; say('night', ms); }
    }

    // Camera: {cx, cy} is the logical point at the canvas centre, z the zoom over the whole-room framing.
    function camera(ms) {
      let cur = { ...WIDE };
      for (const c of cams) {
        if (c.start > ms) break;
        const target = c.follow==='handoff' && trackedHandoff ? {cx:trackedHandoff.x,cy:trackedHandoff.y,z:c.zoom} : c.follow === 'guard' && trackedGuard ? {cx:trackedGuard.x,cy:trackedGuard.y,z:c.zoom} : c.to === 'wide' ? { ...WIDE } : { cx: c.to[0], cy: c.to[1], z: c.zoom || 1 };
        const progress = clamp((ms - c.start) / (c.dur * 1000)), k = c.linear ? progress : ease(progress);
        cur = { cx: lerp(cur.cx, target.cx, k), cy: lerp(cur.cy, target.cy, k), z: lerp(cur.z, target.z, k) };
      }
      const hw = 180 / cur.z, hh = 196 / cur.z;
      return { cx: clamp(cur.cx, hw, 360 - hw), cy: clamp(cur.cy, 12 + hh, C.H - 10 - hh), z: cur.z };
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
      return t < .25 ? lerp(0, .78, t / .25) : t < 1.0 ? .78 : Math.min(1, lerp(.78, 1, (t - 1.0) / .8));
    }
    const pace = ms => (script.pace || [[0,1]]).filter(p => p[0] * 1000 <= ms).at(-1)[1];
    return { stats, events, pace, clock, hours, light, palette, start, tick, observe, camera, view, subtitle, darkness, log, seconds: script.seconds, title: script.title, performances:!!script.performances, WIDE };
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
    if (w.dusk > 0) { ctx.fillStyle = `rgba(222, 122, 46, ${(0.22 * w.dusk).toFixed(3)})`; ctx.fillRect(0, 0, h.C.W, h.C.H); }
    const lamp = 0.45 * w.dusk + w.night;
    if (w.night > 0) {
      ctx.fillStyle = `rgba(14, 20, 46, ${(0.5 * w.night).toFixed(3)})`; ctx.fillRect(0, 0, h.C.W, h.C.H);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const a of sim.actors) {
        if (a.status !== 'busy' || a.path.length) continue;
        const [x, y] = h.C.desks[a.i], g = ctx.createRadialGradient(x, y + 6, 2, x, y + 6, 34);
        g.addColorStop(0, `rgba(150, 200, 170, ${(0.32 * w.night).toFixed(3)})`); g.addColorStop(1, 'rgba(150, 200, 170, 0)');
        ctx.fillStyle = g; ctx.fillRect(x - 36, y - 30, 72, 72);
      }
      ctx.restore();
    }
    // The reading lamp by the sofa comes on at dusk and stays on until the lights go out.
    if (lamp > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(114, 266, 1, 114, 266, 30); g.addColorStop(0, `rgba(250, 200, 120, ${(0.3 * lamp).toFixed(3)})`); g.addColorStop(1, 'rgba(250, 200, 120, 0)');
      ctx.fillStyle = g; ctx.fillRect(82, 234, 64, 64); ctx.restore();
    }
    // A phone conversation needs visible speech/hand motion even while the story clock holds at 11:30.
    // Quantized pixel gestures, driven only by page time; no CSS or wall-clock animation.
    const caller=sim.actors.find(a=>a.activity==='call' && !a.path.length);
    if(caller){
      const x=Math.round(caller.x),y=Math.round(caller.y),talk=Math.floor(ms/100)%4;
      h.r(ctx,'#e4bb91',x-2,y-12,5,3);
      h.r(ctx,'#544537',x-1,y-11,3,talk%2?2:1);
      h.r(ctx,'#e4bb91',x+5,y-13+(talk%2),3,3);
      if(talk<2){h.r(ctx,'#efc66c',x+12,y-19,2,3);h.r(ctx,'#efc66c',x+16,y-21,1,6);}
    }
    // The torch and all-clear lamp emit light; keep them visible above the night wash.
    if (sim.guard && !sim.supper && w.night > 0) {
      const a=sim.guard;
      if (sim.scene.guard.phase==='done' && sim.scene.guard.ok) h.r(ctx,'#67b779',322,375,5,5);
      else if (a.path.length) {
        const p=a.path[0],angle=Math.atan2(p.y-a.y,p.x-a.x);
        ctx.fillStyle='#fff0ab28';ctx.beginPath();ctx.moveTo(a.x,a.y-8);
        ctx.lineTo(a.x+Math.cos(angle-.35)*37,a.y-8+Math.sin(angle-.35)*37);
        ctx.lineTo(a.x+Math.cos(angle+.35)*37,a.y-8+Math.sin(angle+.35)*37);ctx.closePath();ctx.fill();
      }
    }
    // A real handful of confetti for a finished job (the engine's eight dots are too small to read in a close-up):
    // strips thrown up over the head, then fluttering down for two seconds.
    for (const a of sim.actors) {
      const age = a.status === 'done' && a.doneArrived != null ? sim.time - a.doneArrived : Infinity;
      if (age > 2.4) continue;
      const p = age / 2.4, x = Math.round(a.x), y = Math.round(a.y);
      for (let j = 0; j < 28; j++) {
        const spread = ((j * 37) % 29) / 28 - .5, lift = 18 + (j * 13) % 14;
        const up = Math.sin(Math.min(1, p / .22) * Math.PI / 2) * lift, fall = Math.max(0, p - .22) / .78 * (46 + (j * 7) % 18);
        const px = x + spread * 56 * Math.min(1, p * 3) + Math.sin(age * 7 + j) * 2, py = y - 26 - up + fall, flip = Math.floor(age * 10 + j) % 2;
        h.r(ctx, ['#d96952', '#ebce80', '#7bafa0', '#8f6fd6', '#f2a65a'][j % 5], px, py, flip ? 3 : 1, flip ? 1 : 3);
      }
    }
    // Scripted words over someone's head (the boss saying 好 when approving, 明天见 at the door), drawn last so
    // they stay readable at night.
    for (const sp of h.says || []) {
      if (ms < sp.at * 1000 || ms >= (sp.at + sp.dur) * 1000) continue;
      const who = sp.who === 'boss' ? sim.boss : sim.actors.find(a => a.id === sp.id);
      if (!who || (sp.who !== 'boss' && who.status === 'off' && h.C.distance(who, h.C.door) < 3)) continue;
      const x = Math.round(who.x), y = Math.round(who.y), wd = sp.text.length * 6 + 6, bx = Math.max(22, Math.min(338 - wd, x - wd / 2 + 1));
      h.r(ctx, '#fff6dc', bx, y - 36, wd, 10); h.r(ctx, '#c85b4a', bx, y - 36, wd, 1); h.text(ctx, sp.text, bx + wd / 2, y - 28, 6, '#6a4b30');
    }
  }

  function mount(doc) {
    doc.body.classList.add('mv');
    // Keep the carried note clear of the courier and the host in the delivery close-up.
    Object.assign(doc.querySelector('#paper').style, {top:'24px',bottom:'auto',left:'12%',width:'76%'});
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
