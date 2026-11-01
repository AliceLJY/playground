const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const root = path.resolve(__dirname, '..');
const scene = import('../server/scene.mjs');
const DAY = Date.parse('2026-11-01T06:00:00Z'), MIN = 60_000;
const ROSTER = new Set(['cc', 'codex', 'kimi', 'agy', 'grok', 'muse']);

test('wrappers in ps: one engine per wrapper whatever the subshells, readers and dry runs are not hand-offs, muse only for ask/wait', async () => {
  const { dispatchedFrom } = await scene;
  const ps = [
    '101 /bin/bash /Users/a/scripts/codex-run.sh -C /x -m write -f task.md',
    '102 /bin/bash /Users/a/scripts/codex-run.sh -C /x -m write -f task.md',
    '103 bash /Users/a/scripts/kimi-run.sh -t 120 hello',
    '104 /x/python -I /Users/a/scripts-bin/muse-vm.py status',
    '105 /bin/zsh -c grep codex-run.sh notes.md',
    '106 /usr/bin/less /Users/a/scripts/agy-gui-run.sh',
    '107 /Users/a/scripts/grok-clean.sh -p review'
  ].join('\n');
  assert.deepEqual(dispatchedFrom(ps, undefined, ROSTER), ['codex', 'grok', 'kimi']);
  assert.deepEqual(dispatchedFrom('201 /x/python -I /y/muse-vm.py wait /z', undefined, ROSTER), ['muse']);
  assert.deepEqual(dispatchedFrom('301 bash /s/codex-run.sh x', undefined, new Set(['cc'])), [], 'an engine not on the roster is not drawn');
  const { dispatchScan, reduceScene, emptyScene } = await scene;
  const tree = ['10 1 claude', '11 10 /Users/a/.local/share/claude/versions/2.1.314', '12 10 /Users/a/.local/share/claude/versions/2.1.314',
    '20 11 /bin/zsh -c source snap', '21 20 /bin/bash /s/codex-run.sh -f t', '22 21 /bin/bash /s/codex-run.sh -f t',
    '30 12 /bin/zsh -c source snap', '31 30 /x/python -I /y/muse-vm.py wait /z'].join('\n');
  const two = dispatchScan(tree, undefined, ROSTER);
  assert.deepEqual(two.dispatched, ['codex', 'muse']); assert.deepEqual(two.windows, { 11: ['codex'], 12: ['muse'] }, 'two windows, one hand-off each');
  let s = emptyScene(DAY); for (const k of [1, 2, 3]) s = reduceScene(s, two, DAY + k * 10_000);
  assert.equal(s.huddle, null, 'no meeting across windows'); assert.equal(s.stats.handoffsTotal, 2);
  const same = dispatchScan(tree + '\n40 20 /bin/bash /s/kimi-run.sh hi', undefined, ROSTER);
  assert.deepEqual(same.windows[11], ['codex', 'kimi']);
});

test('disk percent and the nightly backup log: patrol while running, done with ok from FAIL=0, nothing without a start line', async () => {
  const { diskPercent, guardFrom } = await scene;
  assert.equal(diskPercent('Filesystem 1024-blocks Used Available Capacity iused ifree %iused Mounted on\n/dev/disk3s5 971350180 900000000 60000000 94% 1 2 0% /System/Volumes/Data\n'), 94);
  assert.equal(diskPercent('garbage'), null);
  const start = '=== 2026-10-31 22:30:04 备份开始 ===';
  assert.deepEqual(guardFrom(`${start}\n--- [x] ---\n✓ push 成功`), { phase: 'patrol', at: Date.parse('2026-10-31T22:30:04+08:00'), ok: null });
  assert.deepEqual(guardFrom(`${start}\n=== 2026-10-31 23:04:07 完成 (FAIL=0) ===`), { phase: 'done', at: Date.parse('2026-10-31T23:04:07+08:00'), ok: true });
  assert.equal(guardFrom(`${start}\n=== 2026-10-31 23:04:07 完成 (FAIL=2) ===`).ok, false);
  assert.equal(guardFrom('something else'), null);
});

test('hand-offs and meetings: one-on-one is a hand-off; two engines from one window, at once or in turn, is a meeting; ten quiet minutes close it', async () => {
  const { reduceScene, emptyScene, sceneView } = await scene;
  let s = emptyScene(DAY), t = DAY;
  const tick = (dispatched, dt = 10_000) => { t += dt; s = reduceScene(s, { dispatched }, t); };
  tick(['codex']); tick(['codex']); tick([]);
  assert.equal(s.stats.handoffsTotal, 1); assert.equal(s.huddle, null, 'one-on-one: a hand-off');
  tick([], 4 * MIN); tick(['kimi']);
  assert.ok(s.huddle, 'asking a second one within ten minutes: a meeting'); assert.equal(s.stats.meetingsTotal, 1); assert.deepEqual(s.huddle.members, ['cc', 'codex', 'kimi']);
  tick(['kimi', 'grok']); assert.deepEqual(s.huddle.members, ['cc', 'codex', 'grok', 'kimi']); assert.equal(s.stats.handoffsTotal, 3); assert.equal(s.stats.meetingsTotal, 1);
  tick([]); tick([], 9 * MIN); assert.ok(s.huddle, 'a pause under ten minutes keeps the meeting');
  tick([], 2 * MIN); assert.equal(s.huddle, null); assert.equal(s.stats.meetingsTotal, 1);
  tick(['codex']); tick([], MIN); tick([], 11 * MIN); assert.equal(s.huddle, null, 'a fresh one-on-one after the meeting is just a hand-off');
  const kinds = s.events.map(e => e.kind);
  assert.deepEqual(kinds, ['handoff', 'return', 'handoff', 'meeting', 'handoff', 'return', 'return', 'meeting-end', 'handoff', 'return']);
  const view = sceneView(s, ROSTER, t);
  assert.equal(view.scene.meeting, null); assert.equal(view.stats.today.meetings, 1); assert.ok(view.events.every(e => new Date(e.at).getUTCSeconds() === 0), 'times rounded to the minute');
});

test('a mutual review CC announces stays open across rounds, takes over a running huddle, carries the tally, and ends on end', async () => {
  const { reduceScene, applyMeeting, emptyScene, sceneView } = await scene;
  let s = emptyScene(DAY), t = DAY;
  t += 10_000; s = reduceScene(s, { dispatched: ['kimi', 'agy', 'grok'] }, t);
  assert.ok(s.huddle);
  s = applyMeeting(s, { state: 'start', round: 1 }, t);
  assert.equal(s.huddle, null); assert.ok(s.review); assert.equal(s.stats.meetingsTotal, 1, 'the huddle turning into a review is still one meeting');
  assert.equal(s.events.find(e => e.kind === 'meeting').review, true);
  for (let k = 0; k < 20; k++) { t += 10_000; s = reduceScene(s, { dispatched: [] }, t); }
  assert.ok(s.review, 'nobody out while CC weighs the findings: the meeting stays');
  s = applyMeeting(s, { state: 'round', round: 3, adopted: 3, rejected: 1, open: 0 }, t);
  const v = sceneView(s, ROSTER, t).scene.meeting;
  assert.equal(v.kind, 'review'); assert.equal(v.round, 3); assert.deepEqual(v.slide, { adopted: 3, rejected: 1, open: 0 }); assert.deepEqual(v.members, ['cc', 'agy', 'grok', 'kimi']);
  s = applyMeeting(s, { state: 'end' }, t + MIN);
  assert.equal(s.review, null); assert.equal(s.events.at(-1).kind, 'meeting-end');
  s = applyMeeting(s, { state: 'start' }, t + 2 * MIN); s = reduceScene(s, {}, t + 2 * MIN + 91 * MIN);
  assert.equal(s.review, null, 'a review nobody closed ends after 90 minutes'); assert.equal(s.stats.meetingsTotal, 2);
});

test('the phone booth: start counts once, a second start is the same call, end or an hour closes it', async () => {
  const { applyCall, reduceScene, emptyScene } = await scene;
  let s = applyCall(emptyScene(DAY), { state: 'start' }, DAY);
  s = applyCall(s, { state: 'start' }, DAY + MIN); assert.equal(s.stats.callsTotal, 1);
  s = applyCall(s, { state: 'end' }, DAY + 30 * MIN); assert.equal(s.call, null);
  s = applyCall(s, { state: 'start' }, DAY + 40 * MIN); s = reduceScene(s, {}, DAY + 101 * MIN); assert.equal(s.call, null); assert.equal(s.events.at(-1).kind, 'call-end');
});

test('visitors fold into one line per burst; today restarts at Beijing midnight; old state carries its totals', async () => {
  const { noteVisitor, noteTreat, emptyScene, migrateScene, sceneView } = await scene;
  const s = emptyScene(DAY);
  noteVisitor(s, DAY); noteTreat(s, 'cake', DAY + MIN); noteVisitor(s, DAY + 2 * MIN); noteVisitor(s, DAY + 15 * MIN);
  assert.deepEqual(s.events.map(e => [e.kind, e.n ?? e.treat]), [['visitor', 2], ['treat', 'cake'], ['visitor', 1]], 'a treat in between does not split the burst');
  const tomorrow = Date.parse('2026-11-01T16:30:00Z');
  const v = sceneView(s, ROSTER, tomorrow);
  assert.equal(v.events.length, 0); assert.equal(v.stats.today.visitors, 0); assert.equal(v.stats.visitorsTotal, 3);
  const m = migrateScene({ visitorsTotal: 398, treats: [{ kind: 'milktea', at: new Date(DAY).toISOString() }, { kind: 'coffee', at: '2026-10-30T01:00:00Z' }] }, DAY);
  assert.equal(m.stats.visitorsTotal, 398); assert.equal(m.stats.treatsTotal, 2); assert.equal(m.stats.today.treats, 1);
});

test('HTTP: meeting and call need the token, bad states 400; both feeds carry scene, stats with the backfill added, and events', async t => {
  const { createOffice } = await import('../server/office-server.mjs');
  await fs.mkdir(path.join(root, 'tools/.test-data'), { recursive: true });
  const dir = await fs.mkdtemp(path.join(root, 'tools/.test-data/room-'));
  const config = JSON.parse(await fs.readFile(path.join(root, 'config.example.json')));
  const ids = config.roster.map(a => a.id), token = randomBytes(24).toString('hex');
  let time = DAY, signal = { dispatched: [ids[1]], diskPct: 93, guard: null };
  const office = await createOffice({ config, token, stateFile: path.join(dir, 'state.json'), clock: () => time, collector: async () => ({}), sceneCollector: async () => signal, backfill: { since: '2026-06-24', meetingsTotal: 112, handoffsTotal: 900, callsTotal: 1 } });
  await office.poll(); office.server.listen(0, '127.0.0.1'); await once(office.server, 'listening');
  t.after(() => new Promise(resolve => { office.server.close(resolve); office.server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${office.server.address().port}`;
  const post = (p, body, auth = token) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, body: JSON.stringify(body) });
  assert.equal((await post('/api/meeting', { state: 'start' }, '')).status, 401);
  assert.equal((await post('/api/call', { state: 'start' }, 'nope')).status, 401);
  assert.equal((await post('/api/meeting', { state: 'party' })).status, 400);
  assert.equal((await post('/api/meeting', { state: 'start', round: 1 })).status, 200);
  time += 3000; assert.equal((await post('/api/call', { state: 'start' })).status, 200);
  assert.equal((await fetch(base + '/guest/api/meeting', { method: 'POST' })).status, 404, 'nothing to write on the public side');
  const full = await (await fetch(base + '/api/state')).json(), guest = await (await fetch(base + '/guest/api/state')).json();
  for (const feed of [full, guest]) {
    assert.equal(feed.scene.meeting.kind, 'review'); assert.equal(feed.scene.meeting.round, 1);
    assert.deepEqual(feed.scene.dispatched, [ids[1]]); assert.deepEqual(feed.scene.disk, { usedPct: 93 }); assert.ok(feed.scene.call);
    assert.equal(feed.stats.since, '2026-06-24'); assert.equal(feed.stats.meetingsTotal, 113); assert.equal(feed.stats.handoffsTotal, 901); assert.equal(feed.stats.callsTotal, 2);
    assert.ok(feed.events.some(e => e.kind === 'handoff') && feed.events.some(e => e.kind === 'round'));
    assert.ok(feed.events.every(e => Object.keys(e).every(k => ['at', 'kind', 'ids', 'round', 'minutes', 'treat', 'n', 'ok', 'review'].includes(k))), 'events are structured only');
  }
  const again = await createOffice({ config, token, stateFile: path.join(dir, 'state.json'), clock: () => time, collector: async () => ({}), sceneCollector: async () => signal });
  await again.poll(); assert.ok(again.snapshot().scene.meeting, 'the meeting survives a restart'); assert.equal(again.snapshot().stats.meetingsTotal, 1, 'no backfill: live count only');
});

test('an away label per desk: carried in both feeds, trimmed to 16, rejected when empty or too long', async () => {
  const { createOffice, validateConfig } = await import('../server/office-server.mjs');
  const config = JSON.parse(await fs.readFile(path.join(root, 'config.example.json')));
  config.roster[1].awayLabel = '云上打盹';
  await fs.mkdir(path.join(root, 'tools/.test-data'), { recursive: true });
  const dir = await fs.mkdtemp(path.join(root, 'tools/.test-data/away-'));
  const office = await createOffice({ config, token: randomBytes(24).toString('hex'), stateFile: path.join(dir, 'state.json'), clock: () => DAY, collector: async () => ({}), sceneCollector: async () => ({}) });
  await office.poll();
  assert.equal(office.snapshot().roster[1].awayLabel, '云上打盹'); assert.equal(office.snapshot().roster[0].awayLabel, undefined);
  for (const bad of ['', '   ', 'x'.repeat(17), 5]) { const c = structuredClone(config); c.roster[1].awayLabel = bad; assert.throws(() => validateConfig(c), /away label/, String(bad)); }
});

test('looks follow the person and the courier is named in the feed, wherever their desks are', async () => {
  const { createOffice, validateConfig } = await import('../server/office-server.mjs');
  const config = JSON.parse(await fs.readFile(path.join(root, 'config.example.json')));
  const courier = config.roster.find(a => a.source.type === 'courier');
  courier.look = 10;
  await fs.mkdir(path.join(root, 'tools/.test-data'), { recursive: true });
  const dir = await fs.mkdtemp(path.join(root, 'tools/.test-data/look-'));
  const office = await createOffice({ config, token: randomBytes(24).toString('hex'), stateFile: path.join(dir, 'state.json'), clock: () => DAY, collector: async () => ({}), sceneCollector: async () => ({}) });
  await office.poll();
  const feed = office.snapshot().roster;
  assert.deepEqual(feed.filter(a => a.courier).map(a => a.id), [courier.id]); assert.equal(feed.find(a => a.id === courier.id).look, 10);
  for (const bad of [-1, 12, 1.5, '3']) { const c = structuredClone(config); c.roster[0].look = bad; assert.throws(() => validateConfig(c), /look/, String(bad)); }
});

test('the guest feed counts today\'s notes without carrying any of them', async t => {
  const { createOffice } = await import('../server/office-server.mjs');
  const config = JSON.parse(await fs.readFile(path.join(root, 'config.example.json')));
  await fs.mkdir(path.join(root, 'tools/.test-data'), { recursive: true });
  const dir = await fs.mkdtemp(path.join(root, 'tools/.test-data/notes-'));
  let time = DAY; const token = randomBytes(24).toString('hex');
  const office = await createOffice({ config, token, stateFile: path.join(dir, 'state.json'), clock: () => time, collector: async () => ({}), sceneCollector: async () => ({}) });
  await office.poll(); office.server.listen(0, '127.0.0.1'); await once(office.server, 'listening');
  t.after(() => new Promise(resolve => { office.server.close(resolve); office.server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${office.server.address().port}`;
  for (const text of ['one', 'two']) { time += 3000; assert.equal((await fetch(base + '/api/notice', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ text }) })).status, 200); }
  const guest = await (await fetch(base + '/guest/api/state')).json();
  assert.equal(guest.noticesToday, 2); assert.deepEqual(guest.notices, []);
  assert.equal(JSON.stringify(guest).includes('two'), false);
});

test('a one-on-one hand-off rings the booth for half a minute; a meeting does not; the meeting line names everyone', async () => {
  const { reduceScene, emptyScene, sceneView } = await scene;
  let s = emptyScene(DAY), t = DAY;
  const tick = (dispatched, dt = 10_000) => { t += dt; s = reduceScene(s, { dispatched }, t); };
  tick(['codex']);
  let v = sceneView(s, ROSTER, t).scene.call; assert.equal(v.kind, 'dispatch'); assert.equal(v.with, 'codex');
  tick(['codex'], 31_000); assert.equal(sceneView(s, ROSTER, t).scene.call, null, 'back at the desk after half a minute');
  assert.equal(s.stats.callsTotal, 0, 'rings are not counted as calls');
  tick(['codex', 'kimi']); assert.ok(s.huddle); assert.equal(sceneView(s, ROSTER, t).scene.call, null, 'a second one turns it into a meeting, not a call');
  tick(['codex', 'kimi', 'grok']);
  assert.deepEqual(s.events.find(e => e.kind === 'meeting').ids, ['cc', 'codex', 'grok', 'kimi']);
});
