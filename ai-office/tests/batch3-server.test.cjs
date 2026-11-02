const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),http=require('node:http'),{once}=require('node:events'),{randomBytes}=require('node:crypto');
const C=require('../office-core.js'),T=Date.parse('2026-11-02T02:00:07Z'),M=60000,iso=n=>new Date(n).toISOString(),secret='BATCH3_FINDINGS_PRIVATE_SENTINEL_9372';
async function setup(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'office-batch3-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));let now=T;
 const audit=path.join(dir,'audit.jsonl');await fs.writeFile(audit,line(T-M));
 const config={historyDir:path.join(dir,'history'),makotoAudit:audit,radarLedgers:[],roster:['cc','codex','kimi'].map((id,i)=>({id,name:id==='cc'?'CC':id,role:'伙伴',color:'#739C82',desk:i,source:{type:'push'}}))};
 const {createOffice}=await import('../server/office-server.mjs');const opts={config,token:randomBytes(24).toString('hex'),stateFile:path.join(dir,'state.json'),clock:()=>now,collector:async()=>({}),sceneCollector:async()=>({})};
 const office=await createOffice(opts);office.server.listen(0,'127.0.0.1');await once(office.server,'listening');t.after(()=>new Promise(r=>office.server.close(r)));const base=`http://127.0.0.1:${office.server.address().port}`;
 return {office,opts,base,dir,audit,clock:n=>now=n,post:(route,body,auth=opts.token)=>fetch(base+route,{method:'POST',headers:{authorization:'Bearer '+auth,'content-type':'application/json'},body:JSON.stringify(body)}),get:async route=>(await fetch(base+route)).json()};
}
function line(ts,exit_code=2,event='live.pre_tool_use'){return JSON.stringify({ts:iso(ts),event,exit_code,session_id:secret,tool_name:secret,findings:[{message:secret,snippet:secret}]})+'\n';}
const today={visitors:0,treats:0,meetings:0,handoffs:0,calls:0};
function archive(day){const at=day+'T02:00:07.123Z';return {day,events:[{at,kind:'gate',id:'cc',ok:false}],stats:{today},timeline:[{at,id:'cc',s:'done'}]};}
test('HTTP timeline survives restart, startup adds full roster once; archive stores it, snapshots exclude it',async t=>{
 const x=await setup(t);await x.office.poll();let state=JSON.parse(await fs.readFile(x.opts.stateFile));assert.equal(state.scene.timeline.length,3);assert.deepEqual(state.scene.timeline.map(e=>e.s),x.office.snapshot().roster.map(a=>a.status));
 await x.office.poll();assert.equal(JSON.parse(await fs.readFile(x.opts.stateFile)).scene.timeline.length,3);
 x.clock(T+M);await x.post('/api/report',{id:'cc',status:'busy',summary:secret});state=JSON.parse(await fs.readFile(x.opts.stateFile));assert.equal(state.scene.timeline.length,4);assert.equal(state.scene.timeline.at(-1).s,'busy');
 const {createOffice}=await import('../server/office-server.mjs');const next=await createOffice(x.opts);await next.poll();state=JSON.parse(await fs.readFile(x.opts.stateFile));assert.equal(state.scene.timeline.length,7);assert.equal(new Set(state.scene.timeline.slice(-3).map(e=>e.at)).size,1);
 const saved=structuredClone(state.scene.timeline);x.clock(Date.parse('2026-11-02T16:00:00Z'));await next.poll();
 const old=JSON.parse(await fs.readFile(path.join(x.dir,'history','2026-11-02.json')));assert.deepEqual(old.timeline,saved);assert.ok(old.timeline.every(e=>Object.keys(e).sort().join(',')==='at,id,s'));
 assert.equal(JSON.parse(await fs.readFile(x.opts.stateFile)).scene.timeline.length,3);
 for(const route of ['/api/state','/guest/api/state']){const snap=await x.get(route);assert.equal(snap.timeline,undefined);assert.equal(snap.scene.timeline,undefined);}
});
test('authenticated gate HTTP validates strictly, 30 second same-id dedupe and persistent counts without status changes',async t=>{
 const x=await setup(t);await x.office.poll();const before=x.office.snapshot().roster;
 assert.equal((await x.post('/api/gate',{id:'cc',ok:false},'wrong')).status,401);
 for(const body of [{id:'cc',ok:0},{id:'cc',ok:'false'},{id:'nope',ok:true},{id:'cc',ok:false,findings:secret},{id:'cc'},null])assert.equal((await x.post('/api/gate',body)).status,400);
 assert.equal((await x.post('/api/gate',{id:'codex',ok:false})).status,200);x.clock(T+29999);assert.equal((await x.post('/api/gate',{id:'codex',ok:true})).status,200);assert.equal(x.office.snapshot().stats.gatesPassedTotal,0);
 x.clock(T+30000);await x.post('/api/gate',{id:'codex',ok:true});assert.equal(x.office.snapshot().stats.gatesPassedTotal,1);assert.equal(x.office.snapshot().stats.gatesBlockedTotal,1);assert.deepEqual(x.office.snapshot().roster,before);
 for(const route of ['/api/state','/guest/api/state']){const s=await x.get(route);C.validateSceneFields(s);assert.equal(s.scene.gate.ok,true);if(route.includes('guest'))assert.equal(Date.parse(s.scene.gate.at)%M,0);}
 assert.equal((await x.post('/guest/api/gate',{id:'cc',ok:true})).status,404);
 const {createOffice}=await import('../server/office-server.mjs');assert.equal((await createOffice(x.opts)).snapshot().stats.gatesPassedTotal,1);
});
test('makoto startup skips old rows, exit 0 ignored, partial lines preserved, bursts coalesced and secrets never escape',async t=>{
 const logs=[],orig=console.error;console.error=(...v)=>logs.push(v.join(' '));t.after(()=>console.error=orig);
 const x=await setup(t);await x.office.poll();assert.equal(x.office.snapshot().stats.gatesBlockedTotal,0);
 await fs.appendFile(x.audit,line(T,0));await x.office.poll();assert.equal(x.office.snapshot().stats.gatesBlockedTotal,0);
 const row=line(T);await fs.appendFile(x.audit,row.slice(0,-5));await x.office.poll();assert.equal(x.office.snapshot().stats.gatesBlockedTotal,0);await fs.appendFile(x.audit,row.slice(-5));await x.office.poll();assert.equal(x.office.snapshot().stats.gatesBlockedTotal,1);
 x.clock(T+M);await fs.appendFile(x.audit,line(T+M)+line(T+M+1,2,'live.stop')+line(T+M+2,2,'live.subagent_stop'));await x.office.poll();assert.equal(x.office.snapshot().stats.gatesBlockedTotal,4);assert.equal(x.office.snapshot().scene.gate.n,4);assert.equal(x.office.snapshot().events.filter(e=>e.kind==='gate').length,1);
 x.clock(T+2*M);await fs.appendFile(x.audit,line(T+2*M));await x.office.poll();assert.equal(x.office.snapshot().events.filter(e=>e.kind==='gate').length,2);
 for(const text of [await fs.readFile(x.opts.stateFile,'utf8'),JSON.stringify(await x.get('/api/state')),JSON.stringify(await x.get('/guest/api/state')),JSON.stringify(x.office.snapshot().events),logs.join('\n')])assert.ok(!text.includes(secret));
 assert.ok(!JSON.stringify(x.office.snapshot()).includes('findings'));
});
test('makoto truncation/replacement starts at new EOF; subsequent new row is seen',async t=>{
 const x=await setup(t);await x.office.poll();await fs.writeFile(x.audit,'{}\n');await x.office.poll();assert.equal(x.office.snapshot().stats.gatesBlockedTotal,0);
 await fs.appendFile(x.audit,line(T));await x.office.poll();assert.equal(x.office.snapshot().stats.gatesBlockedTotal,1);
 await fs.rename(x.audit,x.audit+'.old');await fs.writeFile(x.audit,line(T)+line(T));await x.office.poll();assert.equal(x.office.snapshot().stats.gatesBlockedTotal,1);
 await fs.appendFile(x.audit,line(T));await x.office.poll();assert.equal(x.office.snapshot().stats.gatesBlockedTotal,2);
});
test('audit tail caps each read at 256 KiB, skips oversized/malformed lines and accepts UTC microseconds',async t=>{
 const x=await setup(t),{auditTail}=await import('../server/makoto.mjs'),tail=auditTail(x.audit);await tail.start();
 await fs.appendFile(x.audit,'x'.repeat(256*1024)+'\n'+line(T));assert.deepEqual(await tail.read(),[]);assert.deepEqual(await tail.read(),[T]);
 await fs.appendFile(x.audit,'not json\n'+line(T,2,'untrusted')+'{"ts":"2026-11-02T14:06:39.081093Z","event":"live.stop","exit_code":2,"findings":["'+secret+'"]}\n');assert.deepEqual(await tail.read(),[Date.parse('2026-11-02T14:06:39.081Z')]);
 assert.deepEqual(await auditTail(null).read(),[]);assert.deepEqual(await auditTail('').start(),[]);
});
test('history lists newest 14 real valid files, old shapes accepted, malformed/oversize/extra fields return opaque 404',async t=>{
 const x=await setup(t),dir=x.opts.config.historyDir;await fs.mkdir(dir);
 for(let i=1;i<=20;i++){const day='2026-10-'+String(i).padStart(2,'0');await fs.writeFile(path.join(dir,day+'.json'),JSON.stringify(archive(day)));}
 const bads={'2026-10-21.json':'broken '+secret,'2026-10-22.json':JSON.stringify({...archive('2026-10-22'),timeline:[{at:iso(T),id:'cc',s:'busy',findings:secret}]}),'2026-10-23.json':' '.repeat(2*1024*1024+1)+secret,'2026-10-24.json':JSON.stringify({...archive('2026-10-24'),events:[{at:'2026-10-24T02:00:00Z',kind:'gate',id:'cc',ok:'no',findings:secret}]})};
 for(const [f,v] of Object.entries(bads))await fs.writeFile(path.join(dir,f),v);
 await fs.mkdir(path.join(dir,'2026-10-25.json'));await fs.symlink(path.join(dir,'2026-10-20.json'),path.join(dir,'2026-10-26.json'));
 let list=await x.get('/api/history');assert.equal(list.days.length,14);assert.equal(list.days[0].day,'2026-10-20');assert.equal(list.days.at(-1).day,'2026-10-07');assert.deepEqual(Object.keys(list.days[0]).sort(),['day','events','timeline']);
 for(const day of ['2026-10-01','2026-10-21','2026-10-22','2026-10-23','2026-10-24','2026-10-25','2026-10-26','2026-02-30','2026-1-01','2026-10-20.json','nope']){const res=await fetch(x.base+'/api/history/'+day);assert.equal(res.status,404,day);assert.equal(await res.text(),'{"error":"Not found"}');}
 const old=archive('2026-10-20');delete old.timeline;await fs.writeFile(path.join(dir,'2026-10-20.json'),JSON.stringify(old));assert.deepEqual((await x.get('/api/history/2026-10-20')).timeline,[]);
});
test('history cache avoids reparsing unchanged files; mtime change invalidates it',async t=>{
 const x=await setup(t),dir=x.opts.config.historyDir;await fs.mkdir(dir);const file=path.join(dir,'2026-11-02.json');await fs.writeFile(file,JSON.stringify(archive('2026-11-02')));
 const {historyReader}=await import('../server/history.mjs'),reader=historyReader(dir,x.opts.config.roster),parse=JSON.parse;let parses=0;JSON.parse=(v,...args)=>{if(String(v).startsWith('{"day"'))parses++;return parse(v,...args);};
 try {await reader.list();await reader.list();await reader.get('2026-11-02');assert.equal(parses,1);const data=archive('2026-11-02');data.events=[];await fs.writeFile(file,JSON.stringify(data));assert.equal((await reader.list())[0].events,0);assert.equal(parses,2);}finally{JSON.parse=parse;}
});
test('history guest rounds every at, Pages-only CORS, shared limiter and raw/encoded traversal 404',async t=>{
 const x=await setup(t),dir=x.opts.config.historyDir;await fs.mkdir(dir);await fs.writeFile(path.join(dir,'2026-11-02.json'),JSON.stringify(archive('2026-11-02')));
 for(const origin of ['https://aliceljy.github.io','https://example.com']){
  const r=await fetch(x.base+'/guest/api/history/2026-11-02',{headers:{origin}});assert.equal(r.status,200);assert.equal(r.headers.get('access-control-allow-origin'),origin.includes('aliceljy')?origin:null);const data=await r.json();for(const e of [...data.events,...data.timeline])assert.equal(Date.parse(e.at)%M,0);
 }
 for(const p of ['/api/history/../state','/api/history/%2e%2e/state','/guest/api/history/%2e%2e/%2e%2e/api/state','/api/history/2026-11-02/../2026-11-02']){
  const result=await new Promise((resolve,reject)=>{http.get({hostname:'127.0.0.1',port:new URL(x.base).port,path:p},res=>{let data='';res.on('data',c=>data+=c);res.on('end',()=>resolve({status:res.statusCode,data}));}).on('error',reject);});assert.equal(result.status,404,p);assert.equal(result.data,'{"error":"Not found"}');
 }
 let last;for(let i=0;i<121;i++)last=await fetch(x.base+'/guest/api/history',{headers:{origin:'https://aliceljy.github.io'}});assert.equal(last.status,429);assert.equal(last.headers.get('access-control-allow-origin'),'https://aliceljy.github.io');
});
