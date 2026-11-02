const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{once}=require('node:events'),{randomBytes}=require('node:crypto');
const C=require('../office-core.js'),T=Date.parse('2026-11-02T06:00:07Z'),M=60000,iso=n=>new Date(n).toISOString();
async function setup(t,locked=false){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'office-batch2-http-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 let now=T,mtime=T-200*M;const ledger=path.join(dir,'radar.md');await fs.writeFile(ledger,'2026-11-02 | SECRET TITLE | PRIVATE LINK | PRIVATE BODY\n');
 const {createOffice}=await import('../server/office-server.mjs'),{collectRadar}=await import('../server/scene.mjs');
 const config={makotoAudit:null,historyDir:path.join(dir,locked?'locked/archive':'archive'),radarLedgers:[ledger,path.join(dir,'absent')],roster:[{id:'cc',name:'CC',role:'director',color:'#D18A65',desk:0,source:{type:'push'}},...['grok','doubao'].map((id,i)=>({id,name:id==='grok'?'Grok Bot':'豆包',role:'scout',color:'#8DA66F',desk:i+1,source:{type:'artifacts',returnAway:true}}))]};
 const opts={config,token:randomBytes(24).toString('hex'),stateFile:path.join(dir,'state.json'),clock:()=>now,collector:async()=>({mtime}),sceneCollector:async options=>({radarCount:await collectRadar(options.radarLedgers,now)})};
 const office=await createOffice(opts);office.server.listen(0,'127.0.0.1');await once(office.server,'listening');t.after(()=>new Promise(r=>office.server.close(r)));const base=`http://127.0.0.1:${office.server.address().port}`;
 return {office,opts,base,dir,clock:n=>now=n,artifact:n=>mtime=n,rows:n=>fs.writeFile(ledger,Array(n).fill('2026-11-02 | SECRET TITLE | PRIVATE LINK | PRIVATE BODY').join('\n')),post:(route,body)=>fetch(base+route,{method:'POST',headers:{authorization:'Bearer '+opts.token,'content-type':'application/json'},body:JSON.stringify(body)})};
}
test('actual artifact reducer + ledger collector: startup baseline, simultaneous done, both feeds private, restart no replay',async t=>{
 const x=await setup(t);await x.office.poll();assert.equal(x.office.snapshot().stats.radarsTotal,0);assert.equal(x.office.snapshot().roster.find(a=>a.id==='grok').status,'away');
 x.clock(T+M);x.artifact(T+M);await x.rows(8);await x.office.poll();const a=x.office.snapshot();assert.equal(a.stats.radarsTotal,1);assert.equal(a.stats.today.radars,1);assert.deepEqual(a.scene.radar,{at:iso(T+M),n:8,added:7});assert.equal(a.stats.souvenirsTotal,1);assert.equal(a.stats.snacksTotal,0);assert.ok(!a.events.some(e=>e.kind==='snack'));assert.equal(a.roster.find(a=>a.id==='doubao').status,'done');
 for(const route of ['/api/state','/guest/api/state']){const f=await(await fetch(x.base+route)).json();C.validateSceneFields(f);const encoded=JSON.stringify(f);for(const secret of ['SECRET TITLE','PRIVATE LINK','PRIVATE BODY'])assert.ok(!encoded.includes(secret));assert.deepEqual(Object.keys(f.scene.radar).sort(),['added','at','n']);assert.deepEqual(Object.keys(f.scene.souvenir),['at']);if(route.includes('guest'))for(const k of ['radar','souvenir'])assert.equal(Date.parse(f.scene[k].at)%M,0);}
 x.clock(T+M+21000);await x.office.poll();assert.ok(x.office.snapshot().roster.filter(a=>a.id!=='cc').every(a=>a.status==='away'));
 await x.office.flush();await x.rows(13);const {createOffice}=await import('../server/office-server.mjs'),restart=await createOffice(x.opts);await restart.poll();assert.equal(restart.snapshot().stats.radarsTotal,1);assert.equal(restart.snapshot().stats.souvenirsTotal,1);
 x.clock(T+2*M);await x.rows(14);await restart.poll();assert.equal(restart.snapshot().scene.radar.added,1);assert.equal(restart.snapshot().stats.radarsTotal,2);
 x.clock(T+3*M);x.artifact(T+3*M);await restart.poll();assert.equal(restart.snapshot().stats.souvenirsTotal,1);
 x.clock(T+4*M);await restart.poll();x.clock(T+181*M);x.artifact(T+181*M);await restart.poll();assert.equal(restart.snapshot().stats.souvenirsTotal,2);await restart.flush();
 assert.ok(!JSON.stringify(JSON.parse(await fs.readFile(x.opts.stateFile))).includes('SECRET TITLE'));
});
test('HTTP rollover archives before report, snapshots never expose yesterday, restart across midnight only seeds radar',async t=>{
 const x=await setup(t);await x.office.poll();await x.post('/api/meeting',{state:'start',round:1});x.clock(T+3000);assert.equal((await x.post('/api/meeting',{state:'end'})).status,200);await x.office.flush();const before=x.office.snapshot();
 x.clock(Date.parse('2026-11-02T16:00:00Z'));await x.post('/api/report',{id:'cc',status:'busy'});const saved=JSON.parse(await fs.readFile(path.join(x.dir,'archive','2026-11-02.json')));assert.equal(saved.stats.today.meetings,1);assert.equal(saved.events.length,before.events.length);
 for(const route of ['/api/state','/guest/api/state']){const f=await(await fetch(x.base+route)).json();assert.ok(f.events.every(e=>Date.parse(e.at)>=Date.parse('2026-11-02T16:00:00Z')));assert.equal(f.stats.today.meetings,0);}
 const {createOffice}=await import('../server/office-server.mjs');x.clock(Date.parse('2026-11-03T16:00:00Z'));const next=await createOffice({...x.opts,sceneCollector:async()=>({radarCount:13})});await next.poll();assert.equal(next.snapshot().stats.radarsTotal,0);assert.equal(next.snapshot().scene.radar,null);await next.flush();
});
test('archive permission failure leaves HTTP report healthy and keeps today separate',async t=>{
 const x=await setup(t,true);await x.office.poll();await fs.mkdir(path.dirname(x.opts.config.historyDir),{mode:0o500});const error=console.error,logs=[];console.error=(...v)=>logs.push(v.join(' '));
 try{x.clock(T+86400000);assert.equal((await x.post('/api/report',{id:'cc',status:'busy'})).status,200);assert.equal(x.office.snapshot().roster.find(a=>a.id==='cc').status,'busy');assert.ok(logs.some(l=>l.includes('history archive failed')));}finally{console.error=error;await fs.chmod(path.dirname(x.opts.config.historyDir),0o700);}
});
test('invalid config paths rejected before reading state',async()=>{
 const {validateConfig}=await import('../server/office-server.mjs');const roster=[{id:'cc',name:'CC',role:'director',color:'#D18A65',source:{type:'push'}}];
 for(const fields of [{historyDir:''},{historyDir:1},{radarLedgers:'file'},{radarLedgers:[null]},{radarLedgers:Array(9).fill('x')}])assert.throws(()=>validateConfig({roster,...fields}));
});
