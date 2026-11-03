const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const {once}=require('node:events'),{randomBytes}=require('node:crypto');
const root=path.resolve(__dirname,'..'),DAY=Date.parse('2026-11-02T02:00:00Z'),origin='https://aliceljy.github.io';
async function setup(t){
 const {createOffice}=await import('../server/office-server.mjs');await fs.mkdir(path.join(root,'tools/.test-data'),{recursive:true});
 const dir=await fs.mkdtemp(path.join(root,'tools/.test-data/reception-')),stateFile=path.join(dir,'state.json');let now=DAY;
 const opts={config:JSON.parse(await fs.readFile(path.join(root,'config.example.json'),'utf8')),token:randomBytes(24).toString('hex'),stateFile,clock:()=>now,collector:async()=>({}),sceneCollector:async()=>({})};
 opts.config.makotoAudit=null;
 const office=await createOffice(opts);await office.poll();office.server.listen(0,'127.0.0.1');await once(office.server,'listening');t.after(()=>new Promise(r=>office.server.close(r)));
 const base=`http://127.0.0.1:${office.server.address().port}`;
 return {office,opts,base,stateFile,clock:v=>{now=v;},post:(body,headers={})=>fetch(base+'/guest/meet',{method:'POST',headers:{'content-type':'application/json',origin,...headers},body:JSON.stringify(body)})};
}
test('meet HTTP rejects bad kind/tag/body and credentials, preflight allows only Pages',async t=>{
 const x=await setup(t),v='a'.repeat(16);
 for(const body of [{kind:'free',v},{kind:'pitch',v:'no'},{kind:'pitch',v:1234567890123456},{kind:'pitch',v,token:'not-accepted'},{kind:'pitch',v,pad:'x'.repeat(257)},null,[]]) assert.equal((await x.post(body)).status,400);
 assert.equal((await x.post({kind:'pitch',v},{authorization:'invalid'})).status,400);
 assert.equal((await x.post({kind:'pitch',v},{'x-office-key':'invalid'})).status,400);
 const chunk=await new Promise((resolve,reject)=>{const req=http.request(x.base+'/guest/meet',{method:'POST',headers:{origin,'content-type':'application/json'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.write(' '.repeat(160));req.end(' '.repeat(160));});assert.equal(chunk,400);
 const opt=await fetch(x.base+'/guest/meet',{method:'OPTIONS',headers:{origin,'access-control-request-method':'POST','access-control-request-headers':'content-type'}});
 assert.equal(opt.status,204);assert.equal(opt.headers.get('access-control-allow-origin'),origin);assert.equal(opt.headers.get('access-control-allow-headers'),'content-type');assert.equal(await opt.text(),'');
 const bad=await fetch(x.base+'/guest/meet',{method:'OPTIONS',headers:{origin:'https://example.org'}});assert.equal(bad.status,404);assert.equal(bad.headers.get('access-control-allow-origin'),null);
});
test('meet cooldown exactly five minutes, another tag allowed, both feeds/private shape/reload/Beijing day',async t=>{
 const x=await setup(t),v='b'.repeat(16),before=x.office.snapshot().roster;
 const first=await x.post({kind:'pitch',v});assert.equal(first.status,200);assert.equal(first.headers.get('access-control-allow-origin'),origin);const entry=await first.json();
 x.clock(DAY+1);const limited=await x.post({kind:'learn',v});assert.equal(limited.status,429);assert.equal(limited.headers.get('retry-after'),'300');assert.equal(limited.headers.get('access-control-allow-origin'),origin);
 assert.equal((await x.post({kind:'chat',v:'c'.repeat(32)})).status,200);
 x.clock(DAY+299999);assert.equal((await x.post({kind:'research',v})).status,429);x.clock(DAY+300000);assert.equal((await x.post({kind:'research',v})).status,200);
 for(const endpoint of ['/api/state','/guest/api/state']){const data=await(await fetch(x.base+endpoint,{headers:{origin}})).json();assert.equal(data.meets.length,3);assert.deepEqual(data.meets[0],{kind:'pitch',at:entry.at});assert.deepEqual(data.meetsToday,{pitch:1,chat:1,research:1});assert.equal(data.stats.meetsTotal,3);assert.equal(data.stats.today.meets,3);assert.ok(data.events.every(e=>e.kind==='reception'));
 if(endpoint.includes('guest')){assert.deepEqual(Object.keys(data).sort(),['updatedAt','roster','notices','demo','visitors','visitorsTotal','treats','treatsToday','meets','meetsToday','quota','scene','stats','events','noticesToday','guest'].sort());assert.deepEqual(data.notices,[]);for(const a of data.roster)assert.ok(Object.keys(a).every(k=>['id','desk','awayLabel','awayPost','look','courier','name','role','color','status','statusSince','badge','workedToday'].includes(k)));}
 }
 assert.deepEqual(x.office.snapshot().roster,before,'meet must never change real state');
 await x.office.flush();const stored=JSON.parse(await fs.readFile(x.stateFile,'utf8'));assert.ok(stored.meets.every(m=>Object.keys(m).sort().join(',')==='at,kind'));assert.ok(!JSON.stringify(stored).includes(v));
 const {createOffice}=await import('../server/office-server.mjs');const reload=await createOffice(x.opts);assert.equal(reload.snapshot().meets.length,3);assert.equal(reload.snapshot().stats.meetsTotal,3);
 x.clock(Date.parse('2026-11-02T16:00:00Z'));assert.deepEqual(x.office.snapshot().meetsToday,{});assert.equal(x.office.snapshot().stats.today.meets,0);assert.equal((await x.post({kind:'learn',v})).status,200);assert.equal(x.office.snapshot().stats.today.meets,1);
});
test('meet stores 50, exposes 10, timestamps distinct, shared global budget limits new tags',async t=>{
 const x=await setup(t);
 for(let i=0;i<120;i++){const r=await x.post({kind:'chat',v:i.toString(16).padStart(16,'0')});assert.equal(r.status,200,`request ${i}`);}
 const r=await x.post({kind:'pitch',v:'f'.repeat(16)});assert.equal(r.status,429);assert.ok(Number(r.headers.get('retry-after'))>0);
 const snap=x.office.snapshot();assert.equal(snap.meets.length,10);assert.equal(new Set(snap.meets.map(m=>m.at)).size,10);assert.equal(snap.stats.meetsTotal,120);assert.equal(snap.meetsToday.chat,120);
 await x.office.flush();const saved=JSON.parse(await fs.readFile(x.stateFile,'utf8'));assert.equal(saved.meets.length,50);
});
