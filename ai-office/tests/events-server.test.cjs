const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {once}=require('node:events'),{randomBytes}=require('node:crypto');
const root=path.resolve(__dirname,'..'),T=Date.parse('2026-11-02T02:00:00Z'),M=60000,iso=n=>new Date(n).toISOString();
async function setup(t){
 const {createOffice}=await import('../server/office-server.mjs');await fs.mkdir(path.join(root,'tools/.test-data'),{recursive:true});
 const dir=await fs.mkdtemp(path.join(root,'tools/.test-data/events-'));let now=T,signal={};
 const opts={config:{roster:[{id:'cc',name:'CC',role:'director',color:'#D18A65',desk:0,source:{type:'push'}},{id:'agy',name:'Agy',role:'artist',color:'#8DA66F',desk:1,source:{type:'push'}},{id:'codex',name:'Codex',role:'builder',color:'#6D9D8E',desk:2,source:{type:'push'}}]},token:randomBytes(24).toString('hex'),stateFile:path.join(dir,'state.json'),clock:()=>now,collector:async()=>signal,sceneCollector:async()=>({})};
 const office=await createOffice(opts);office.server.listen(0,'127.0.0.1');await once(office.server,'listening');t.after(()=>new Promise(r=>office.server.close(r)));
 const base=`http://127.0.0.1:${office.server.address().port}`;
 return {office,opts,base,clock:v=>now=v,signal:v=>signal=v,post:(route,body,auth=true)=>fetch(base+route,{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:'Bearer '+opts.token}:{})},body:JSON.stringify(body)})};
}
test('quota HTTP: token, roster whitelist, strict body, minutes bounds/default, clear and persistent reload',async t=>{
 const x=await setup(t);assert.equal((await x.post('/api/quota',{id:'agy'},false)).status,401);
 for(const body of [{id:'nope'},{id:'__proto__'},{id:'agy',minutes:301},{id:'agy',minutes:0},{id:'agy',minutes:-1},{id:'agy',minutes:1.5},{id:'agy',minutes:'60'},{id:'agy',clear:1},{id:'agy',task:'private'},null,[]])assert.equal((await x.post('/api/quota',body)).status,400);
 assert.equal((await x.post('/api/quota',{id:'agy'})).status,200);assert.equal(x.office.snapshot().quota.agy,iso(T+60*M));
 x.clock(T+3000);assert.equal((await x.post('/api/quota',{id:'agy',minutes:300})).status,200);assert.equal(x.office.snapshot().quota.agy,iso(T+3000+300*M));
 await x.office.flush();const stored=JSON.parse(await fs.readFile(x.opts.stateFile,'utf8'));assert.equal(stored.quota.agy,T+3000+300*M);
 const {createOffice}=await import('../server/office-server.mjs'),reloaded=await createOffice(x.opts);assert.deepEqual(reloaded.snapshot().quota,x.office.snapshot().quota);
 x.clock(T+6000);assert.equal((await x.post('/api/quota',{id:'agy',clear:true})).status,200);assert.deepEqual(x.office.snapshot().quota,{});assert.equal(x.office.snapshot().events.at(-1).clear,true);
 await x.office.flush();assert.deepEqual((await createOffice(x.opts)).snapshot().quota,{});
});
test('quota expires from both feeds without a poll; actual report transition to busy clears, repeated busy does not',async t=>{
 const x=await setup(t);await x.post('/api/report',{id:'agy',status:'busy'});await x.post('/api/quota',{id:'agy',minutes:1});x.clock(T+3000);await x.post('/api/report',{id:'agy',status:'busy'});assert.ok(x.office.snapshot().quota.agy);
 x.clock(T+M);for(const endpoint of ['/api/state','/guest/api/state'])assert.deepEqual((await(await fetch(x.base+endpoint)).json()).quota,{});
 x.clock(T+2*M);await x.post('/api/report',{id:'agy',status:'idle'});await x.post('/api/quota',{id:'agy'});x.clock(T+2*M+3000);await x.post('/api/report',{id:'agy',status:'busy'});assert.deepEqual(x.office.snapshot().quota,{});
 await x.office.flush();assert.deepEqual(JSON.parse(await fs.readFile(x.opts.stateFile,'utf8')).quota,{});
});
test('collector busy transition also clears quota; guest per-bot report follows the same observer',async t=>{
 const x=await setup(t);x.opts.config.roster.find(a=>a.id==='agy').source.type='codex';await x.office.poll();await x.post('/api/quota',{id:'agy'});x.signal({running:true});x.clock(T+1000);await x.office.poll();assert.deepEqual(x.office.snapshot().quota,{});
 // Dedicated public report fixture, no real credentials/configuration.
 const {createOffice}=await import('../server/office-server.mjs');x.clock(T+2000);const publicOffice=await createOffice({...x.opts,botKeys:{agy:'open'}});publicOffice.server.listen(0,'127.0.0.1');await once(publicOffice.server,'listening');t.after(()=>new Promise(r=>publicOffice.server.close(r)));
 const base=`http://127.0.0.1:${publicOffice.server.address().port}`,post=(route,body,auth=false)=>fetch(base+route,{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:'Bearer '+x.opts.token}:{})},body:JSON.stringify(body)});
 await post('/guest/report/agy',{status:'idle'});await post('/api/quota',{id:'agy'},true);x.clock(T+5000);assert.equal((await post('/guest/report/agy',{status:'busy'})).status,200);assert.deepEqual(publicOffice.snapshot().quota,{});
});
test('snack exact 9/10 minute threshold, hourly cap and independent colleagues',async()=>{
 const {reduceScene,emptyScene}=await import('../server/scene.mjs');let s=emptyScene(T);
 const change=(id,now,duration)=>{s=reduceScene(s,{transitions:[{id,before:{status:'busy',statusSince:iso(now-duration)},after:{status:'done'}}]},now);};
 change('agy',T,9*M);assert.equal(s.snack,undefined);change('agy',T,10*M);assert.deepEqual(s.snack,{id:'agy',at:iso(T)});assert.equal(s.stats.snacksTotal,1);assert.equal(s.stats.today.snacks,1);
 change('agy',T+59*M,10*M);assert.equal(s.stats.snacksTotal,1);change('codex',T+59*M,10*M);assert.equal(s.stats.snacksTotal,2);change('agy',T+60*M,10*M);assert.equal(s.stats.snacksTotal,3);
 assert.equal(s.events.filter(e=>e.kind==='snack').length,3);
});
test('supper Beijing 22:59/23:00/02:59/03:00, same night across midnight, next night allowed',async()=>{
 const {reduceScene,emptyScene}=await import('../server/scene.mjs');let s=emptyScene(T);const busy={agy:{status:'busy'},codex:{status:'idle'}};
 function at(time,members=busy){const n=Date.parse(time);s=reduceScene(s,{members},n);}
 at('2026-11-02T14:59:59Z');assert.equal(s.supper,undefined);at('2026-11-02T15:00:00Z',{agy:{status:'idle'}});assert.equal(s.supper,undefined);
 at('2026-11-02T15:00:01Z');assert.equal(s.stats.suppersTotal,1);assert.deepEqual(s.supper.ids,['agy']);at('2026-11-02T16:01:00Z');at('2026-11-02T18:59:59Z');assert.equal(s.stats.suppersTotal,1);
 at('2026-11-03T15:00:00Z');assert.equal(s.stats.suppersTotal,2);
 let late=reduceScene(emptyScene(T),{members:busy},Date.parse('2026-11-02T19:00:00Z'));assert.equal(late.supper,undefined);
 late=reduceScene(emptyScene(T),{members:busy},Date.parse('2026-11-02T18:59:59Z'));assert.equal(late.stats.suppersTotal,1);
});
test('snack and supper HTTP observations persist; both snapshots validate and guest carries no task text',async t=>{
 const x=await setup(t),secret='private-task-never-public';await x.post('/api/report',{id:'agy',status:'busy',summary:secret});x.clock(T+10*M);await x.post('/api/report',{id:'agy',status:'done'});
 assert.equal(x.office.snapshot().stats.snacksTotal,1);x.clock(Date.parse('2026-11-02T15:00:09Z'));await x.post('/api/report',{id:'codex',status:'busy',summary:secret});await x.post('/api/quota',{id:'agy'});
 for(const endpoint of ['/api/state','/guest/api/state']){const data=await(await fetch(x.base+endpoint)).json();assert.equal(data.scene.snack.id,'agy');assert.deepEqual(Object.keys(data.scene.snack).sort(),['at','id']);assert.equal(data.stats.suppersTotal,1);assert.deepEqual(data.scene.supper.ids,['codex']);require('../office-core.js').validateSceneFields(data);assert.ok(!JSON.stringify(data).includes(secret));if(endpoint.includes('guest'))assert.equal(Date.parse(data.scene.supper.at)%M,0);}
 await x.office.flush();const {createOffice}=await import('../server/office-server.mjs'),reload=await createOffice(x.opts);assert.equal(reload.snapshot().stats.snacksTotal,1);assert.equal(reload.snapshot().stats.suppersTotal,1);await reload.poll();assert.equal(reload.snapshot().stats.suppersTotal,1);
});
test('review uses per-round replacement, stable round timestamp, one argument log per since+round',async()=>{
 const {applyMeeting,emptyScene,sceneView}=await import('../server/scene.mjs');let s=applyMeeting(emptyScene(T),{state:'start',round:1,rejected:3,adopted:2},T);
 assert.equal(s.review.slide.rejected,3);s=applyMeeting(s,{state:'round',round:2,rejected:1},T+1000);assert.equal(s.review.slide.rejected,1);assert.equal(s.review.roundAt,T+1000);
 s=applyMeeting(s,{state:'round',round:2,rejected:5},T+2000);assert.equal(s.review.roundAt,T+1000);assert.equal(s.events.filter(e=>e.kind==='argue').length,2);
 s=applyMeeting(s,{state:'round',round:3},T+3000);assert.equal(s.review.slide,null);s=applyMeeting(s,{state:'round',round:1,rejected:2},T+4000);assert.equal(s.events.filter(e=>e.kind==='argue').length,2);assert.ok(sceneView(s,new Set(['cc']),T+4000).scene.meeting.roundAt);
});
