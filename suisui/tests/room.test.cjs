// The shared shelf's rules (multiplayer README 1–8, plan.md section 8), on a fake clock.
const test=require('node:test'),assert=require('node:assert/strict');
const load=()=>import('../server/room.mjs');

async function setup(seed=3){
  const M=await load();
  let t=1000,tk=0,nid=0;
  const R=M.createRoom({now:()=>t,seed,token:()=>(++tk).toString(16).padStart(32,'0'),noteId:()=>(++nid).toString(16).padStart(8,'0')});
  const log=[];
  const send=o=>{for(const [to,m] of o.to)log.push({to,m});for(const m of o.all)log.push({to:'*',m});return o;};
  const join=(n=1,c=1,tok)=>{const r=M.join(R,M.parse(JSON.stringify({t:'hi',n,c,...(tok?{tok}:{})})));send(r.o);return r.me;};
  const say=(me,msg)=>{const m=M.parse(JSON.stringify(msg));assert.ok(m,`message refused by parse: ${JSON.stringify(msg)}`);return send(M.handle(R,me.tok,m));};
  const reply=(o,me)=>o.to.filter(([to])=>to===me.tok).map(([,m])=>m).pop();
  const advance=ms=>{const end=t+ms;while(t<end){t=Math.min(end,t+100);send(M.tick(R));}};
  return{M,R,log,join,say,reply,advance,clock:()=>t};
}
const idle=(R,except=[])=>R.slots.find(s=>s.st==='idle'&&!s.q.length&&s.kind!=='note'&&!except.includes(s.i));

test('parse keeps only the known shapes: no extra fields, no free text, numbers in range',async()=>{
  const {M}=await setup();
  const ok=[{t:'hi',n:0,c:11},{t:'p',i:11,x:0,y:1,d:1},{t:'c',i:0},{t:'c',i:3,h:1},{t:'u',i:2},{t:'s',i:5,g:'swipe',ox:.2,oy:.9,vx:-4000,vy:20},{t:'n'},{t:'a'}];
  for(const m of ok)assert.ok(M.parse(JSON.stringify(m)),JSON.stringify(m));
  const bad=[{t:'hi',n:64,c:0},{t:'hi',n:1,c:1,name:'阿明'},{t:'hi',n:1,c:1,tok:'abc'},{t:'p',i:12,x:0,y:0,d:0},{t:'p',i:1,x:1.5,y:0,d:0},
    {t:'c',i:'3'},{t:'s',i:1,g:'kick',ox:0,oy:0},{t:'s',i:1,g:'tap',ox:0,oy:0,text:'hi'},{t:'n',text:'又要开会'},{t:'n',id:'deadbeef'},{t:'say',x:1},[1,2]];
  for(const m of bad)assert.equal(M.parse(JSON.stringify(m)),null,JSON.stringify(m));
  assert.equal(M.parse('{"t":"a"'),null);assert.equal(M.parse('x'.repeat(600)),null);
});

test('rule 1: one shared shelf of 12, every visitor gets the same snapshot; online counts live people',async()=>{
  const {R,log,join}=await setup();
  const a=join(1,1),b=join(2,2);
  const w=log.filter(x=>x.m.t==='W');
  assert.equal(w.length,2);assert.equal(w[0].m.slots.length,12);
  assert.deepEqual(w[0].m.slots.map(s=>s.k),w[1].m.slots.map(s=>s.k));
  assert.equal(w[1].m.online,2);assert.notEqual(a.pid,b.pid);assert.match(a.tok,/^[0-9a-f]{32}$/);
});

test('rule 3: pressing claims; a second person queues as 第 2 位 and gets the next thing with a full 5 s turn',async()=>{
  const {M,R,log,join,say,reply,advance}=await setup();
  const a=join(),b=join(2,2),s=idle(R);
  assert.equal(reply(say(a,{t:'c',i:s.i}),a).t,'K');
  assert.equal(s.st,'held');
  const q=reply(say(b,{t:'c',i:s.i}),b);assert.equal(q.t,'K');assert.equal(q.q,2,'B is told 第 2 位');
  assert.equal(reply(say(b,{t:'s',i:s.i,g:'tap',ox:.5,oy:.5}),b).t,'X','B cannot smash while A has it');
  const before=s.kind;say(a,{t:'s',i:s.i,g:'tap',ox:.4,oy:.4});
  assert.equal(s.st,'broken');
  const S=log.filter(x=>x.m.t==='S').pop().m;assert.equal(S.k,before);assert.equal(S.by,a.pid);
  // still flying apart on screen: no refill before the break has finished
  advance(M.breakMs(before,'tap'));assert.equal(s.st,'broken','refilled while the break animation was still playing');
  advance(M.T.margin+100);assert.equal(s.st,'entering');
  advance(M.T.enter+100);assert.equal(s.st,'held');assert.equal(s.by,b.tok,'the next thing goes to the head of the queue');
  assert.equal(s.until-s.since,M.T.turn,'B gets a full turn, counted from when the new thing has landed');
  advance(M.T.turn+200);assert.equal(s.st,'idle','an unused turn passes on');
});

test('plan 8.1: a smash that loses the race is refused with the true state of the slot, so the page can roll back',async()=>{
  const {R,join,say,reply}=await setup();
  const a=join(),b=join(2,2),s=idle(R);
  say(a,{t:'c',i:s.i});
  const x=reply(say(b,{t:'s',i:s.i,g:'tap',ox:.1,oy:.1}),b);
  assert.equal(x.t,'X');assert.equal(x.slot.st,'held');assert.equal(x.slot.by,a.pid);assert.equal(x.slot.k,s.kind);assert.equal(x.slot.v,s.v);
});

test('plan 8.9: a late release after a timeout cannot free the next person\'s turn; renewals stop at 6 s',async()=>{
  const {M,R,join,say,reply,advance}=await setup();
  const a=join(),b=join(2,2),c=join(3,3),s=idle(R);
  say(a,{t:'c',i:s.i});say(b,{t:'c',i:s.i});
  advance(M.T.hold+200);assert.equal(s.by,b.tok,'A timed out, B has it');
  assert.equal(reply(say(a,{t:'u',i:s.i}),a).t,'X');assert.equal(s.by,b.tok,'late release from A left B alone');
  // B keeps pressing while C waits: renewals stop 6 s into B's turn and C gets it
  say(c,{t:'c',i:s.i});const since=s.since;
  for(let k=0;k<10&&s.by===b.tok;k++){say(b,{t:'c',i:s.i,h:1});advance(900);}
  assert.equal(s.by,c.tok,'holding cannot be renewed forever while someone waits');
  assert.ok(R.now()-since<=M.T.holdMax+1000,'B lost it within about 6 s of the turn starting');
});

test('rule 3: queues stop at 5; one slot per person, pressing another leaves the first queue',async()=>{
  const {R,join,say,reply}=await setup();
  const a=join(),s=idle(R),t2=idle(R,[s.i]);
  say(a,{t:'c',i:s.i});
  const others=[1,2,3,4,5,6].map(k=>join(k,k));
  const r=others.map(p=>reply(say(p,{t:'c',i:s.i}),p));
  assert.deepEqual(r.slice(0,5).map(x=>x.q),[2,3,4,5,6]);assert.equal(r[5].t,'X');assert.equal(r[5].why,'queue-full');
  say(others[0],{t:'c',i:t2.i});
  assert.ok(!s.q.includes(others[0].tok),'pressing another slot left the first queue');assert.equal(t2.by,others[0].tok);
});

test('rules 4 and 5: notes queue when three are up; burning someone\'s note tells them and puts your waiting note there',async()=>{
  const {M,R,log,join,say,reply,advance}=await setup();
  const a=join(),b=join(2,2),c=join(3,3);
  // start from two system notes on the shelf so A's own note can go up
  R.slots.filter(s=>s.kind==='note').slice(2).forEach(s=>{s.kind='plate';s.note=null;});
  advance(6000);
  while(R.slots.filter(s=>s.kind==='note').length<3){const r=reply(say(a,{t:'n'}),a);assert.equal(r.t,'K');advance(6000);}
  const mine=R.slots.filter(s=>s.note&&s.note.owner===a.tok);assert.ok(mine.length>=1,'A has a note on the shelf');
  const w=reply(say(b,{t:'n'}),b);assert.equal(w.t,'K');assert.equal(w.wait,1,'B waits in the 候贴区');assert.match(w.n,/^[0-9a-f]{8}$/);
  assert.equal(reply(say(b,{t:'n'}),b).t,'X','one waiting note per person');
  advance(6000);say(c,{t:'n'});
  const target=mine[0];advance(M.T.enter+200);
  say(b,{t:'c',i:target.i});say(b,{t:'s',i:target.i,g:'tap',ox:.5,oy:.5});
  const S=log.filter(x=>x.m.t==='S').pop().m;assert.equal(S.torn,true);
  const T=log.filter(x=>x.m.t==='T').pop();assert.equal(T.to,a.tok,'only the owner hears about it');assert.equal(T.m.id,target.note===null?S.n.id:target.note.id);
  advance(M.breakMs('note','tap')+M.T.margin+200);
  assert.equal(target.kind,'note');assert.equal(target.note.owner,b.tok,'B\'s waiting note went straight into the torn slot');
  assert.equal(R.waitlist.length,1);assert.equal(R.waitlist[0].owner,c.tok,'C still waits, B jumped by tearing');
  // a burn by someone without a waiting note brings in the head of the 候贴区
  const other=R.slots.find(s=>s.kind==='note'&&s.st!=='broken'&&s!==target);advance(M.T.enter+200);
  say(a,{t:'c',i:other.i});say(a,{t:'s',i:other.i,g:'tap',ox:.5,oy:.5});advance(3000);
  assert.equal(other.note.owner,c.tok);assert.equal(R.waitlist.length,0);
});

test('plan 8.8: a note id is the server\'s; nobody can post under someone else\'s id, and posting is rate-limited',async()=>{
  const {R,join,say,reply,advance}=await setup();
  const a=join();advance(6000);
  const r1=reply(say(a,{t:'n'}),a);
  assert.equal(reply(say(a,{t:'n'}),a).why,'too-soon');
  advance(6000);const r2=reply(say(a,{t:'n'}),a);
  assert.notEqual(r1.n,r2.n);
});

test('rule 7: smash-all breaks only free slots with nobody waiting, then a 30 s cooldown that survives reconnecting',async()=>{
  const {M,R,log,join,say,reply,advance}=await setup();
  const a=join(),b=join(2,2),c=join(3,3),d=join(4,4);
  const held=idle(R),queued=idle(R,[held.i]);
  say(b,{t:'c',i:held.i});say(c,{t:'c',i:queued.i});say(d,{t:'c',i:queued.i});
  assert.equal(held.by,b.tok);assert.deepEqual(queued.q,[d.tok]);
  const r=reply(say(a,{t:'a'}),a);
  const A=log.filter(x=>x.m.t==='A').pop().m;
  assert.ok(!A.list.some(([i])=>i===held.i||i===queued.i),'slots someone holds or waits for are left alone');
  assert.equal(r.a,A.list.length);assert.ok(A.list.length>=5);
  A.list.forEach(([i,k,v,delay],n)=>{assert.equal(R.slots[i].v,v);assert.equal(delay,n*M.T.gap);});
  assert.equal(reply(say(a,{t:'a'}),a).why,'cooldown');
  M.leave(R,a.tok);const back=join(1,1,a.tok);assert.equal(back.pid,a.pid,'same session after reconnect');
  assert.equal(reply(say(back,{t:'a'}),back).why,'cooldown','reconnecting does not reset the cooldown');
  advance(M.T.allCooldown+100);assert.equal(reply(say(back,{t:'a'}),back).t,'K');
});

test('rule 8 / plan 8.6: leaving lets go of the slot, the queue place and the waiting note',async()=>{
  const {M,R,join,say,advance}=await setup();
  const a=join(),b=join(2,2);advance(6000);
  while(R.slots.filter(x=>x.kind==='note').length<3){say(b,{t:'n'});advance(6000);}
  advance(6000);say(a,{t:'n'});
  const s=idle(R),t2=idle(R,[s.i]);
  say(a,{t:'c',i:s.i});say(b,{t:'c',i:t2.i});say(a,{t:'c',i:t2.i});
  assert.ok(t2.q.includes(a.tok));assert.ok(R.waitlist.some(w=>w.owner===a.tok));
  M.leave(R,a.tok);
  assert.ok(!t2.q.includes(a.tok));assert.ok(!R.waitlist.some(w=>w.owner===a.tok));
  assert.ok(R.slots.every(x=>x.by!==a.tok));
});

test('every break is held at least as long as the engine shows it',async()=>{
  const {M}=await setup();const C=require('../src/core.js');
  for(const k of C.KIND_IDS){const d=C.KINDS[k].opts.duration;if(d)assert.ok(M.breakMs(k,'tap')>=d,k);}
  assert.ok(M.breakMs('candle','tap')>=1800,'melt runs 1.8 s in the engine');
});

test('fingers go out as one batch with only the latest position per person',async()=>{
  const {M,R,join,say}=await setup();
  const a=join(),b=join(2,2);
  say(a,{t:'p',i:1,x:.1,y:.2,d:1});say(a,{t:'p',i:1,x:.3,y:.4,d:1});say(b,{t:'p',i:7,x:.5,y:.5,d:0});
  const P=M.flushPointers(R);assert.equal(P.list.length,2);assert.deepEqual(P.list.find(x=>x[0]===a.pid),[a.pid,1,.3,.4,1]);
  assert.equal(M.flushPointers(R),null);
});

test('plan 8.11 and README: the fullest snapshot still fits one frame, and nothing outbound carries free text',async()=>{
  const {M,R,log,join,say,advance}=await setup();
  const people=Array.from({length:50},(_,k)=>join(k%64,k%12));
  advance(6000);
  people.slice(0,25).forEach((p,k)=>say(p,{t:'n'}));
  R.slots.forEach((s,k)=>{say(people[25+(k%12)],{t:'c',i:s.i});for(let j=0;j<5;j++)say(people[(k*5+j)%50],{t:'c',i:s.i});});
  const W=JSON.stringify(M.view(R,people[0].tok));
  assert.ok(Buffer.byteLength(W)<16000,`snapshot ${Buffer.byteLength(W)} bytes`);
  advance(20000);
  const allowed=/^([A-Za-z]{1,2}|tap|hold|swipe|idle|held|broken|entering|gather|rain|print|busy|not-yours|queue-full|too-soon|already-waiting|waitlist-full|cooldown|[0-9a-f]{8}|[0-9a-f]{32}|[a-z]+)$/;
  const strings=[];const walk=v=>{if(typeof v==='string')strings.push(v);else if(v&&typeof v==='object')Object.values(v).forEach(walk);};
  log.forEach(x=>walk(x.m));
  const odd=[...new Set(strings)].filter(s=>!allowed.test(s));
  assert.deepEqual(odd,[],'an outbound string that is not a code, kind, id or token');
});

test('two people in the room never share a name, so 「青柚 写的」 means one person',async()=>{
  const {R,join}=await setup();
  const people=Array.from({length:20},()=>join(5,3));
  const names=people.map(p=>p.n);
  assert.equal(new Set(names).size,20,'every live visitor has a different name');
  assert.equal(people[0].n,5,'the first keeps the name they asked for');
});
