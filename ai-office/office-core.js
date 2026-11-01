(function (root) {
  'use strict';
  const W = 360, H = 740;
  const desks = [
    [65, 112], [157, 112], [229, 112], [301, 112], [157, 194],
    [53, 224], [229, 194], [301, 269], [301, 194], [157, 269], [308, 339]
  ];
  const mvRest = [[35, 294], [61, 294], [87, 294], [35, 324], [61, 324], [87, 324], [116, 294], [116, 323], [35, 351], [68, 351], [308, 362]];
  const games = [[80,304,'chess'],[116,304,'chess'],[36,294,'arcade'],[60,294,'arcade'],[36,328,'nap'],[64,328,'read'],[88,332,'watch'],[116,332,'watch'],[36,356,'watch'],[64,356,'watch']].map(([x,y,kind])=>({x,y,kind}));
  const rest = [...games.map(p=>[p.x,p.y]),[308,366]], gameWatch = {x:92,y:356};
  const door = { x: 340, y: 388 }, bossDesk = { x: 195, y: 352 }, handoff = { x: 221, y: 352 }, pantry = { x: 198, y: 247 };
  const obstacles = desks.map(([x, y], i) => ({ x: x - (i === 10 ? 23 : 27), y: y - 9, w: i === 10 ? 46 : 54, h: 29 }));
  obstacles.push({ x: 150, y: 366, w: 84, h: 28 });
  obstacles.push({ x: 26, y: 173, w: 72, h: 29 }, { x: 109, y: 88, w: 3, h: 58 });
  for (const [x, y] of [[119,198],[266,277],[323,93],[27,378]]) obstacles.push({ x, y, w: 12, h: 13 });
  // The fixed MV keeps its old lounge; ordinary pages use the corner's solid cabinets and seat backs.
  const mvObstacles = [...obstacles,{x:22,y:269,w:78,h:10}];
  obstacles.push({x:24,y:260,w:20,h:22},{x:48,y:260,w:20,h:22},{x:88,y:284,w:20,h:16},{x:26,y:312,w:20,h:6},{x:54,y:312,w:20,h:6});
  const podium = { x: 208, y: 536 }, booth = { x: 296, y: 560 };
  const seats = [[76,548],[108,548],[140,548],[172,548]].map(([x,y]) => ({x,y}));
  const standing = [40,72,104,136,168,200].map(x=>({x,y:612}));
  const audience = [{x:88,y:664},{x:116,y:664}];
  const patrol = [door, {x:244,y:700}, {x:28,y:700}, {x:244,y:648}, {x:248,y:492}, {x:340,y:492}, door, {x:198,y:247}, {x:125,y:169}, door];
  obstacles.push({x:70,y:562,w:116,h:24}, {x:20,y:490,w:3,h:140}, {x:236,y:490,w:3,h:108}, {x:20,y:630,w:184,h:3}, {x:76,y:648,w:52,h:6});
  obstacles.push({x:268,y:494,w:3,h:66}, {x:332,y:494,w:3,h:66}, {x:310,y:512,w:12,h:26}, {x:266,y:616,w:64,h:60});
  const emptyScene = () => ({meeting:null, dispatched:[], call:null, disk:null, guard:null});
  const diskLayers = disk => disk ? Math.ceil(disk.usedPct / 12.5) : 0;
  const isNight = time => { const h = new Date(time + 8 * 3600000).getUTCHours(); return h >= 23 || h < 8; };
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const home = i => ({ x: desks[i][0], y: desks[i][1] + 27 });
  const queuePoint = i => ({ x: [247, 273, 273, 247, 221, 195, 195, 221, 247, 273, 299][i % 11], y: [352, 352, 325, 325, 325, 325, 300, 300, 300, 300, 300][i % 11] });
  const blocked = (x, y, legacy = false) => x < 18 || x > 342 || y < 88 || y > 720 || (y > 398 && y < 490 && x < 312) || (legacy ? mvObstacles : obstacles).some(o => x > o.x - 4 && x < o.x + o.w + 4 && y > o.y - 3 && y < o.y + o.h + 3);

  // Fixed 4-pixel floor grid. At this room size BFS is simpler than a navigation dependency.
  function route(from, to, legacy = false) {
    const key = p => `${p.x},${p.y}`;
    const snap = p => ({ x: Math.round(p.x / 4) * 4, y: Math.round(p.y / 4) * 4 });
    const start = snap(from), goal = snap(to), q = [start], seen = new Map([[key(start), null]]);
    let index = 0, end;
    while (index < q.length) {
      const p = q[index++];
      if (p.x === goal.x && p.y === goal.y) { end = p; break; }
      for (const [dx, dy] of [[0, 4], [4, 0], [0, -4], [-4, 0]]) {
        const n = { x: p.x + dx, y: p.y + dy }, k = key(n);
        if (!seen.has(k) && !blocked(n.x, n.y, legacy)) { seen.set(k, p); q.push(n); }
      }
    }
    if (!end) return [];
    const points = [to];
    for (let p = end; p && key(p) !== key(start); p = seen.get(key(p))) points.push(p);
    points.reverse();
    return points.filter((p, i, a) => i === 0 || i === a.length - 1 || (a[i - 1].x !== a[i + 1].x && a[i - 1].y !== a[i + 1].y));
  }

  function create(roster, seed = 7, legacy = false) {
    let randomState = seed >>> 0;
    const random = () => { randomState = (1664525 * randomState + 1013904223) >>> 0; return randomState / 4294967296; };
    const sim = { time: 0, seed, actors: roster.map((r, i) => { const slot = Number.isInteger(r.desk) && r.desk >= 0 && r.desk < desks.length ? r.desk : i; return { ...r, i: slot, ...home(slot), status: 'idle', changed: 0, path: [], dest: null }; }), boss: { ...bossDesk, path: [], dest: null }, bossTarget: null, notices: [], deliveries: [], delivery: null, delivered: 0, nextWander: 0 };
    sim.scene = emptyScene(); sim.flights = []; sim.night = false; sim.guard = null;
    const director = () => sim.actors.find(a => a.id === 'cc') || sim.actors.find(a => a.i === 0);
    const deskPoint = a => ({x:desks[a.i][0] + 17, y:desks[a.i][1] + 4});
    const ccPoint = () => { const a = director(); return a && a.activity ? {x:a.x,y:a.y-12} : a ? deskPoint(a) : null; };
    function setScene(value) {
      const next = value || emptyScene(), before = sim.scene.dispatched;
      for (const id of new Set([...before, ...next.dispatched])) {
        if (before.includes(id) === next.dispatched.includes(id)) continue;
        const a = sim.actors.find(a => a.id === id), cc = ccPoint(); if (!a || !cc) continue;
        const returning = !next.dispatched.includes(id);
        sim.flights = sim.flights.filter(f => f.id !== id);
        sim.flights.push({id, returning, at:sim.time, from:returning ? deskPoint(a) : cc, to:returning ? deskPoint(director()) : deskPoint(a)});
      }
      if (next.guard?.at !== sim.scene.guard?.at || next.guard?.phase !== sim.scene.guard?.phase) sim.guard = null;
      sim.scene = JSON.parse(JSON.stringify(next));
    }
    function flightPoints() {
      return sim.flights.map(f => { const t = Math.min(1, (sim.time-f.at)); return {...f, x:f.from.x+(f.to.x-f.from.x)*t, y:f.from.y+(f.to.y-f.from.y)*t-48*4*t*(1-t), progress:t}; });
    }
    function meetingTarget(id) {
      if (!sim.scene.meeting?.members.includes(id)) return null;
      if (director()?.id === id) return podium;
      const i = sim.scene.meeting.members.filter(id => id !== director()?.id).indexOf(id);
      return seats[i] || standing[i-seats.length];
    }
    const meetingStanding = id => { const p=meetingTarget(id); return p === podium || standing.includes(p); };
    let gameMembers = '';
    function assignGames() {
      if (legacy) return;
      const idle=sim.actors.filter(a=>a.status==='idle' && a.i!==10 && !meetingTarget(a.id) && !(a===director() && sim.scene.call)).sort((a,b)=>a.i-b.i);
      const key=idle.map(a=>a.id).join(','); if(key===gameMembers) return; gameMembers=key;
      const slots=idle.length===1 ? [2] : games.slice(0,idle.length).map((_,i)=>i);
      for(const a of sim.actors) if(!idle.includes(a) || !slots.includes(a.gameSlot)) a.gameSlot=null;
      const pending=idle.filter(a=>a.gameSlot==null);
      for(const slot of slots) if(!idle.some(a=>a.gameSlot===slot)) pending.shift().gameSlot=slot;
    }
    function gameActivity(a) {
      if(legacy || a.status!=='idle' || a.activity || a.gameSlot==null || a.path.length || distance(a,games[a.gameSlot])>=1) return null;
      const p=games[a.gameSlot];
      if(p.kind==='chess' && ![0,1].every(slot=>sim.actors.some(b=>b.gameSlot===slot && b.status==='idle' && !b.activity && !b.path.length && distance(b,games[slot])<1))) return null;
      return p.kind;
    }
    function tickGuard(dt) {
      if (!sim.night || !sim.scene.guard) { sim.guard = null; return; }
      if (!sim.guard) sim.guard = {id:'night-guard',i:30,color:'#526a83',status:'guard',...door,path:[],dest:null,lap:0,waypoint:1};
      const a = sim.guard;
      if (sim.scene.guard.phase === 'done' || a.lap) moveTo(a,door);
      else {
        moveTo(a,patrol[a.waypoint]);
        if (distance(a,patrol[a.waypoint]) < 1) { if (++a.waypoint === patrol.length) { a.lap++; a.waypoint = 0; } }
      }
      travel(a,dt*.42);
    }
    function moveTo(a, p) {
      if (a.dest && distance(a.dest, p) < 1) return;
      a.dest = { ...p }; a.path = route(a, p, legacy);
    }
    function setStatus(id, status, since) {
      const a = sim.actors.find(a => a.id === id);
      if (!a) return;
      if (a.status !== status) { a.status = status; a.changed = sim.time; a.doneArrived = null; a.dest = null; }
      if (since) a.statusSince = since;
    }
    function notice(n) {
      sim.notices.push({ ...n }); sim.notices = sim.notices.slice(-20);
      sim.deliveries.push({ ...n });
    }
    function travel(a, dt) {
      let budget = dt * 59;
      while (a.path.length && budget > 0) {
        const p = a.path[0], d = distance(a, p);
        if (d < budget) { a.x = p.x; a.y = p.y; budget -= d; a.path.shift(); }
        else { a.x += (p.x - a.x) / d * budget; a.y += (p.y - a.y) / d * budget; budget = 0; }
      }
    }
    function tick(dt) {
      sim.time += dt; sim.flights = sim.flights.filter(f => sim.time - f.at < 1); tickGuard(dt); assignGames();
      const waiting = sim.actors.filter(a => a.status === 'waiting' && (a.i !== 10 || !sim.delivery));
      if (!sim.delivery && sim.deliveries.length) {
        sim.delivery = { ...sim.deliveries.shift(), phase: 'walking', arrived: null };
        const c = sim.actors.find(a => a.i === 10); if (c) c.dest = null;
      }
      for (const a of sim.actors) {
        let target;
        a.activity = a === director() && sim.scene.call ? 'call' : meetingTarget(a.id) ? 'meeting' : null;
        if (a.activity === 'call') target = booth;
        else if (a.activity === 'meeting') target = meetingTarget(a.id);
        else if (a.i === 10 && sim.delivery) target = sim.delivery.phase === 'returning' ? home(10) : handoff;
        else if (a.status === 'busy' || a.status === 'unknown' || a.status === 'done' && (!legacy || a.doneArrived == null || sim.time - a.doneArrived < 2)) target = home(a.i);
        else if (a.status === 'waiting') target = queuePoint(Math.max(0, waiting.indexOf(a)));
        else if (a.status === 'away' || a.status === 'off') target = door;
        else if (a.status === 'idle' && (a.i === 10 || legacy && [4, 5, 9].includes(a.i))) target = home(a.i);
        else target = legacy ? { x: mvRest[a.i][0], y: mvRest[a.i][1] } : games[a.gameSlot];
        moveTo(a, target); travel(a, dt);
        if (a.status === 'done' && a.doneArrived == null && distance(a, home(a.i)) < 1) a.doneArrived = sim.time;
      }
      if (sim.delivery) {
        const d = sim.delivery, courier = sim.actors.find(a => a.i === 10);
        if (d.phase === 'walking' && courier && !courier.activity && distance(courier, handoff) < 1 && distance(sim.boss, bossDesk) < 1) { d.phase = 'holding'; d.arrived = sim.time; }
        if (d.phase === 'holding' && sim.time - d.arrived >= 8) { d.phase = 'returning'; courier.dest = null; sim.delivered++; }
        if (d.phase === 'returning' && courier && distance(courier, home(10)) < 1) sim.delivery = null;
      }
      // A scripted walk (the MV opening the door in the morning, turning the lights off at night) overrides the rest.
      if (sim.bossTarget) moveTo(sim.boss, sim.bossTarget);
      else if (waiting.length || sim.delivery) moveTo(sim.boss, bossDesk);
      else if (sim.time >= sim.nextWander) {
        moveTo(sim.boss, [{ x: 125, y: 169 }, { x: 198, y: 247 }, bossDesk, { x: 115, y: 351 }][Math.floor(random() * 4)]);
        sim.nextWander = sim.time + 7 + random() * 5;
      }
      travel(sim.boss, dt * (sim.bossTarget || waiting.length || sim.delivery ? 1 : 0.5));
    }
    // Visitors: people looking at the public page. Each comes in through the door, strolls between a few spots the
    // host also uses (all known walkable), lingers, and leaves through the door when the count drops. Five at most.
    const tour = [{ x: 125, y: 169 }, { x: 198, y: 247 }, { x: 273, y: 300 }, { x: 115, y: 351 }, ...(!legacy ? [gameWatch] : [])];
    sim.visitors = []; sim.visitorTarget = 0; sim.visitorSeq = 0; sim.hello = null;
    // Treats: a visitor picks something from the menu; a visitor figure carries it to the pantry spot, everyone at
    // work says thanks for a few seconds, and a cup sits on every occupied desk for a while.
    const TREATS = ['milktea', 'coffee', 'cake', 'melon'];
    sim.treats = []; sim.thanks = null; sim.deskTreat = null; sim.carrier = null;
    function treat(kind, at) { if (TREATS.includes(kind)) sim.treats.push({ kind, at }); }
    const thanksNow = () => sim.thanks && sim.time - sim.thanks.at < GREET_SECONDS ? sim.thanks : null;
    const deskTreatNow = () => sim.deskTreat && sim.time < sim.deskTreat.until ? sim.deskTreat : null;
    function tickTreats(dt) {
      if (!sim.carrier && sim.treats.length) {
        const next = sim.treats.shift();
        let v = sim.visitors.find(x => x.phase === 'touring' && !x.carry);
        if (!v) {
          const seq = ++sim.visitorSeq;
          v = { id: `runner-${seq}`, visitor: true, runner: true, i: 20 + seq % 4, color: '#c9a35b', x: door.x, y: door.y, path: [], dest: null, phase: 'touring', until: null, status: 'visiting' };
          sim.visitors.push(v);
        }
        v.carry = next.kind; v.dest = null; sim.carrier = v.id;
      }
      const v = sim.carrier && sim.visitors.find(x => x.id === sim.carrier);
      if (!v) { sim.carrier = null; return; }
      if (distance(v, pantry) < 1) {
        sim.thanks = { at: sim.time, kind: v.carry }; sim.deskTreat = { kind: v.carry, until: sim.time + 120 };
        v.carry = null; sim.carrier = null; v.dest = null; v.until = null;
        if (v.runner) { v.phase = 'leaving'; }
      }
    }
    const GREET_SECONDS = 3;
    const greeting = () => sim.hello && sim.time - sim.hello.at < GREET_SECONDS ? sim.hello : null;
    // A wave on request (a page that got no greeting, or a visitor asking for a photo): everyone turns to the door.
    function wave(kind = 'welcome') { sim.hello = { at: sim.time, visitor: null, kind, x: door.x, y: door.y }; }
    function setVisitors(n) { sim.visitorTarget = Math.max(0, Math.min(5, Math.floor(Number(n) || 0))); }
    function tickVisitors(dt) {
      // Runners (sent with a treat when nobody is visiting) are not counted against the visitor target.
      const touring = () => sim.visitors.filter(v => v.phase === 'touring' && !v.runner).length;
      while (touring() < sim.visitorTarget && sim.visitors.length < 5) {
        const seq = ++sim.visitorSeq;
        sim.visitors.push({ id: `visitor-${seq}`, visitor: true, i: 20 + seq % 4, color: ['#e9a23b', '#d9605a', '#5fa8d3', '#8f6fd6'][seq % 4], x: door.x, y: door.y, path: [], dest: null, phase: 'touring', until: null, status: 'visiting' });
        // Someone just came in: everyone at work looks up from the keyboard and says hello for a few seconds.
        sim.hello = { at: sim.time, visitor: `visitor-${seq}`, x: door.x, y: door.y };
      }
      let extra = touring() - sim.visitorTarget;
      for (const v of sim.visitors) if (extra > 0 && v.phase === 'touring' && !v.runner && !v.carry) { v.phase = 'leaving'; v.dest = null; v.until = null; extra--; }
      const listeners = sim.scene.meeting ? sim.visitors.filter(v => v.phase === 'touring' && !v.runner && !v.carry).slice(0,2) : [];
      for (const v of sim.visitors) {
        const seat = listeners.indexOf(v), wasListening = v.listening;
        v.listening = seat >= 0;
        if (wasListening && !v.listening) { v.dest = null; v.until = null; }
        if (v.listening) { moveTo(v,audience[seat]); travel(v,dt*.7); continue; }
        if (v.phase === 'leaving') { moveTo(v, door); travel(v, dt * 0.8); continue; }
        if (v.carry) { moveTo(v, pantry); travel(v, dt * 0.8); continue; }
        if (!v.dest) { moveTo(v, tour[Math.floor(random() * tour.length)]); v.until = null; }
        else if (!v.path.length) {
          if (v.until == null) v.until = sim.time + 4 + random() * 6;
          else if (sim.time >= v.until) { const next = tour.filter(t => distance(t, v) > 1); moveTo(v, next[Math.floor(random() * next.length)]); v.until = null; }
        }
        travel(v, dt * 0.7);
      }
      sim.visitors = sim.visitors.filter(v => !(v.phase === 'leaving' && distance(v, door) < 1));
    }
    function step(ms) { for (let left = ms; left > 0; left -= 20) { const dt = Math.min(left, 20) / 1000; tick(dt); tickTreats(dt); tickVisitors(dt); } }
    return Object.assign(sim, { setScene, meetingTarget, meetingStanding, gameActivity, flightPoints, step, setStatus, notice, setVisitors, greeting, wave, GREET_SECONDS, treat, thanksNow, deskTreatNow, TREATS, pantry });
  }
  const TREAT_NAMES = {milktea:'奶茶',coffee:'咖啡',cake:'蛋糕',melon:'西瓜'};
  // Structured public signals only. Missing extension fields mean an old office, not made-up zeros.
  function validateSceneFields(data) {
    const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
    const int = (v,max=1e9) => Number.isInteger(v) && v >= 0 && v <= max;
    const iso = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Date.parse(v) > 946684800000 && Date.parse(v) < 4102444800000 && new Date(v.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10) === v.slice(0,10);
    const ids = new Set(data.roster.map(a => a.id)), list = v => Array.isArray(v) && v.length <= 11 && v.every(id => ids.has(id)) && new Set(v).size === v.length;
    const fail = () => { throw new Error('Invalid scene state'); };
    if (data.scene !== undefined) {
      const s = data.scene; if (!object(s) || !list(s.dispatched) || s.dispatched.some(id => id === 'cc' || data.roster.find(a=>a.id===id)?.desk === 0)) fail();
      if (s.meeting !== null) { const m=s.meeting; if (!object(m) || !['review','huddle'].includes(m.kind) || !iso(m.since) || !list(m.members) || !m.members.length || !(m.round === null || int(m.round,10000)) || !(m.slide === null || object(m.slide) && ['adopted','rejected','open'].every(k=>int(m.slide[k],100000)))) fail(); }
      if (s.call !== null && !(object(s.call) && iso(s.call.since))) fail();
      if (s.disk !== null && !(object(s.disk) && Number.isFinite(s.disk.usedPct) && s.disk.usedPct >= 0 && s.disk.usedPct <= 100)) fail();
      if (s.guard !== null && !(object(s.guard) && ['patrol','done'].includes(s.guard.phase) && iso(s.guard.at) && (s.guard.ok === null || typeof s.guard.ok === 'boolean'))) fail();
    }
    if (data.stats !== undefined) {
      const s=data.stats; if (!object(s) || typeof s.since !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.since) || !iso(s.since+'T00:00:00Z') || new Date(s.since).toISOString().slice(0,10)!==s.since || !['visitorsTotal','treatsTotal','meetingsTotal','handoffsTotal','callsTotal'].every(k=>int(s[k])) || !object(s.today) || !['visitors','treats','meetings','handoffs','calls'].every(k=>int(s.today[k]))) fail();
    }
    if (data.events !== undefined) {
      const keys = ['at','kind','ids','round','minutes','treat','n','ok','review'];
      if (!Array.isArray(data.events) || data.events.length > 40) fail();
      for (const e of data.events) {
        if (!object(e) || Object.keys(e).some(k=>!keys.includes(k)) || !iso(e.at) || typeof e.kind !== 'string' || !/^[a-z-]{1,16}$/.test(e.kind) || (e.ids !== undefined && !list(e.ids)) || (e.round !== undefined && !int(e.round,10000)) || (e.minutes !== undefined && !int(e.minutes,1440)) || (e.n !== undefined && !int(e.n,100000)) || (e.treat !== undefined && !Object.hasOwn(TREAT_NAMES,e.treat)) || (e.ok !== undefined && typeof e.ok !== 'boolean') || (e.review !== undefined && typeof e.review !== 'boolean')) fail();
        if ((e.kind === 'handoff' && e.ids?.length !== 2) || (e.kind === 'return' && e.ids?.length !== 1) || (e.kind === 'meeting' && !e.ids?.length) || (e.kind === 'round' && e.round === undefined) || (e.kind === 'meeting-end' && e.minutes === undefined) || (e.kind === 'treat' && e.treat === undefined) || (e.kind === 'visitor' && e.n === undefined) || (e.kind === 'guard' && e.ok === undefined)) fail();
      }
    }
    return data;
  }
  function eventText(e,roster) {
    const name = id => roster.find(a=>a.id===id)?.name || '', names = (e.ids || []).map(name);
    switch(e.kind) {
      case 'handoff': return `${names[0]} 把一份活递给 ${names[1]}`;
      case 'return': return `${names[0]} 交回来了`;
      case 'meeting': return `CC 叫上 ${names.filter(n=>n!=='CC').join('、')}${e.review ? ' 开互审会' : ' 碰了个头'}`;
      case 'round': return `互审进到第 ${e.round} 轮`;
      case 'meeting-end': return `散会，开了 ${e.minutes} 分钟`;
      case 'call': return 'CC 去电话亭打长途（问外面的顾问）';
      case 'call-end': return '电话打完了';
      case 'treat': return `有人送来${['milktea','coffee'].includes(e.treat)?'一杯':e.treat==='cake'?'一块':'一份'}${TREAT_NAMES[e.treat]}`;
      case 'visitor': return `来了 ${e.n} 位客人`;
      case 'guard': return `夜班保安巡完一圈，备份${e.ok?' ✓':'没过'}`;
      default: return null;
    }
  }
  const api = { games, gameWatch, standing, podium, seats, booth, audience, patrol, emptyScene, diskLayers, isNight, validateSceneFields, eventText, TREAT_NAMES, W, H, desks, rest, home, door, handoff, bossDesk, pantry, blocked, queuePoint, create, distance, route };
  if (typeof module !== 'undefined') module.exports = api;
  root.OfficeCore = api;
})(typeof window === 'undefined' ? globalThis : window);
