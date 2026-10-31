(function (root) {
  'use strict';
  const W = 360, H = 420;
  const desks = [
    [65, 112], [157, 112], [229, 112], [301, 112], [157, 194],
    [53, 224], [229, 194], [301, 269], [301, 194], [157, 269], [308, 339]
  ];
  const rest = [[35, 294], [61, 294], [87, 294], [35, 324], [61, 324], [87, 324], [116, 294], [116, 323], [35, 351], [68, 351], [308, 362]];
  const door = { x: 340, y: 388 }, bossDesk = { x: 195, y: 352 }, handoff = { x: 221, y: 352 };
  const obstacles = desks.map(([x, y], i) => ({ x: x - (i === 10 ? 23 : 27), y: y - 9, w: i === 10 ? 46 : 54, h: 29 }));
  obstacles.push({ x: 150, y: 366, w: 84, h: 28 }, { x: 22, y: 269, w: 78, h: 10 });
  obstacles.push({ x: 26, y: 173, w: 72, h: 29 }, { x: 109, y: 88, w: 3, h: 58 });
  for (const [x, y] of [[119,198],[266,277],[323,93],[27,378]]) obstacles.push({ x, y, w: 12, h: 13 });
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const home = i => ({ x: desks[i][0], y: desks[i][1] + 27 });
  const queuePoint = i => ({ x: [247, 273, 273, 247, 221, 195, 195, 221, 247, 273, 299][i % 11], y: [352, 352, 325, 325, 325, 325, 300, 300, 300, 300, 300][i % 11] });
  const blocked = (x, y) => x < 18 || x > 342 || y < 88 || y > 398 || obstacles.some(o => x > o.x - 4 && x < o.x + o.w + 4 && y > o.y - 3 && y < o.y + o.h + 3);

  // Fixed 4-pixel floor grid. At this room size BFS is simpler than a navigation dependency.
  function route(from, to) {
    const key = p => `${p.x},${p.y}`;
    const snap = p => ({ x: Math.round(p.x / 4) * 4, y: Math.round(p.y / 4) * 4 });
    const start = snap(from), goal = snap(to), q = [start], seen = new Map([[key(start), null]]);
    let index = 0, end;
    while (index < q.length) {
      const p = q[index++];
      if (p.x === goal.x && p.y === goal.y) { end = p; break; }
      for (const [dx, dy] of [[0, 4], [4, 0], [0, -4], [-4, 0]]) {
        const n = { x: p.x + dx, y: p.y + dy }, k = key(n);
        if (!seen.has(k) && !blocked(n.x, n.y)) { seen.set(k, p); q.push(n); }
      }
    }
    if (!end) return [];
    const points = [to];
    for (let p = end; p && key(p) !== key(start); p = seen.get(key(p))) points.push(p);
    points.reverse();
    return points.filter((p, i, a) => i === 0 || i === a.length - 1 || (a[i - 1].x !== a[i + 1].x && a[i - 1].y !== a[i + 1].y));
  }

  function create(roster, seed = 7) {
    let randomState = seed >>> 0;
    const random = () => { randomState = (1664525 * randomState + 1013904223) >>> 0; return randomState / 4294967296; };
    const sim = { time: 0, seed, actors: roster.map((r, i) => ({ ...r, i, ...home(i), status: 'idle', changed: 0, path: [], dest: null })), boss: { ...bossDesk, path: [], dest: null }, notices: [], deliveries: [], delivery: null, delivered: 0, nextWander: 0 };
    function moveTo(a, p) {
      if (a.dest && distance(a.dest, p) < 1) return;
      a.dest = { ...p }; a.path = route(a, p);
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
      sim.time += dt;
      const waiting = sim.actors.filter(a => a.status === 'waiting' && (a.i !== 10 || !sim.delivery));
      if (!sim.delivery && sim.deliveries.length) {
        sim.delivery = { ...sim.deliveries.shift(), phase: 'walking', arrived: null };
        sim.actors[10].dest = null;
      }
      for (const a of sim.actors) {
        let target;
        if (a.i === 10 && sim.delivery) target = sim.delivery.phase === 'returning' ? home(10) : handoff;
        else if (a.status === 'busy' || a.status === 'unknown' || a.status === 'done' && (a.doneArrived == null || sim.time - a.doneArrived < 2)) target = home(a.i);
        else if (a.status === 'waiting') target = queuePoint(Math.max(0, waiting.indexOf(a)));
        else if (a.status === 'away' || a.status === 'off') target = door;
        else if (a.status === 'idle' && [4, 5, 9, 10].includes(a.i)) target = home(a.i);
        else target = { x: rest[a.i][0], y: rest[a.i][1] };
        moveTo(a, target); travel(a, dt);
        if (a.status === 'done' && a.doneArrived == null && distance(a, home(a.i)) < 1) a.doneArrived = sim.time;
      }
      if (sim.delivery) {
        const d = sim.delivery, courier = sim.actors[10];
        if (d.phase === 'walking' && distance(courier, handoff) < 1 && distance(sim.boss, bossDesk) < 1) { d.phase = 'holding'; d.arrived = sim.time; }
        if (d.phase === 'holding' && sim.time - d.arrived >= 8) { d.phase = 'returning'; courier.dest = null; sim.delivered++; }
        if (d.phase === 'returning' && distance(courier, home(10)) < 1) sim.delivery = null;
      }
      if (waiting.length || sim.delivery) moveTo(sim.boss, bossDesk);
      else if (sim.time >= sim.nextWander) {
        moveTo(sim.boss, [{ x: 125, y: 169 }, { x: 198, y: 247 }, bossDesk, { x: 115, y: 351 }][Math.floor(random() * 4)]);
        sim.nextWander = sim.time + 7 + random() * 5;
      }
      travel(sim.boss, dt * (waiting.length || sim.delivery ? 1 : 0.5));
    }
    function step(ms) { for (let left = ms; left > 0; left -= 20) tick(Math.min(left, 20) / 1000); }
    return Object.assign(sim, { step, setStatus, notice });
  }
  const api = { W, H, desks, rest, home, door, handoff, bossDesk, blocked, queuePoint, create, distance, route };
  if (typeof module !== 'undefined') module.exports = api;
  root.OfficeCore = api;
})(typeof window === 'undefined' ? globalThis : window);
