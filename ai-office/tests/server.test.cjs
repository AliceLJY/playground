const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const root = path.resolve(__dirname, '..');
const core = import('../server/core.mjs');
const DAY = Date.parse('2026-11-01T06:00:00Z'), NIGHT = Date.parse('2026-11-01T16:00:00Z');

test('mtime boundaries, inactivity, night hours and ambiguity', async () => {
  const { mtimeStatus, inactive, isNight } = await core;
  for (const [age, status] of [[0,'busy'],[179999,'busy'],[180000,'idle'],[1799999,'idle'],[1800000,'idle']]) assert.equal(mtimeStatus({running:true,mtime:DAY-age},DAY),status);
  assert.equal(mtimeStatus({running:true,mtime:NIGHT-1800000},NIGHT),'off');
  assert.equal(mtimeStatus({running:true,mtime:NIGHT-1799999},NIGHT),'idle');
  for (const mtime of [undefined, NaN, 0, DAY+120000]) assert.equal(mtimeStatus({running:true,mtime},DAY),'unknown');
  assert.equal(mtimeStatus({running:null,mtime:DAY},DAY),'unknown');
  assert.equal(mtimeStatus({running:false},DAY),'off');
  assert.equal(inactive(DAY-1800000,DAY,'busy'),'idle');
  assert.equal(inactive(NIGHT-1800000,NIGHT,'busy'),'off');
  for (const [time, expected] of [['2026-11-01T14:59:59Z',false],['2026-11-01T15:00:00Z',true],['2026-11-01T23:59:59Z',true],['2026-11-02T00:00:00Z',false]]) assert.equal(isNight(Date.parse(time)),expected);
});

test('CC checks live sessions, badge and unreadable status; Codex parser excludes host processes',async()=>{
  const {deriveSignal}=await core, {codexRunning,sessionTime}=await import('../server/collectors.mjs');
  assert.equal(sessionTime(DAY),DAY);assert.equal(sessionTime(new Date(DAY).toISOString()),DAY);assert.ok(Number.isNaN(sessionTime({})));
  const cc=s=>deriveSignal({type:'cc'},s,{},DAY);
  assert.equal(cc({sessions:[]}).status,'off');
  assert.equal(cc({sessions:[{alive:true,status:'busy',at:DAY},{alive:false,status:'busy',at:DAY}]}).badge,'1');
  assert.equal(cc({sessions:[{alive:true,status:'busy',at:DAY}]}).status,'busy');
  assert.equal(cc({sessions:[{alive:true,status:'idle',at:DAY}]}).status,'idle');
  assert.equal(cc({sessions:[{alive:true,status:'unexpected',at:DAY}]}).status,'unknown');
  assert.equal(cc({sessions:[],uncertain:true}).status,'unknown');
  assert.equal(codexRunning('123 /usr/local/bin/codex exec task'),true);
  for(const line of ['123 /x/codex app-server','123 /x/codex mcp-server','123 /x/codex login','123 /Applications/ChatGPT.app/Contents/cua_node codex','123 /Users/test/.codex/plugins/cache/chrome/extension-host codex','123 /bin/sh codex','123 /usr/bin/node /x/codex.js','123 /x/notcodex exec']) assert.equal(codexRunning(line),false,line);
});

test('push wins for exactly ten minutes, then unknown stays unknown; stable statusSince',async()=>{
  const {reduceMember,iso}=await core;
  let prev={status:'waiting',statusSince:iso(DAY),push:{at:DAY,status:'waiting'},lastSignalAt:DAY};
  assert.equal(reduceMember({type:'launchd'},{error:true},prev,DAY+599999).status,'waiting');
  assert.equal(reduceMember({type:'launchd'},{error:true},prev,DAY+600000).status,'unknown');
  const same=reduceMember({type:'codex'},{running:true},{status:'busy',statusSince:iso(DAY)},DAY+10000);
  assert.equal(same.statusSince,iso(DAY));
  assert.equal(reduceMember({type:'push'},{},{},DAY).status,'idle');
  assert.equal(reduceMember({type:'push'},{},{lastSignalAt:NIGHT-1800000},NIGHT).status,'off');
  assert.equal(reduceMember({type:'codex'},{running:false},{lastSignalAt:NIGHT-1800000},NIGHT).status,'off');
  for(const type of ['cc','codex','launchd','etwin','artifacts','push']) assert.equal(reduceMember({type},{error:true},{status:'busy',lastSignalAt:DAY-3600000},DAY).status,'unknown');
});

test('artifact mtime edges, one-shot completion, stale mirror, Muse absence and etwin pulse',async()=>{
  const {reduceMember}=await core;
  for(const type of [{type:'artifacts'},{type:'artifacts',returnAway:true}]){
    let p=reduceMember(type,{mtime:DAY-1000},{},DAY);assert.equal(p.status,'done');
    p=reduceMember(type,{mtime:DAY-1000},p,DAY+20000);assert.equal(p.status,type.returnAway?'away':'idle');
    assert.equal(reduceMember(type,{mtime:DAY-1000},p,DAY+30000).status,type.returnAway?'away':'idle');
    assert.equal(reduceMember(type,{mtime:DAY+29000},p,DAY+30000).status,'done');
    assert.equal(reduceMember(type,{error:true},p,DAY+40000).status,'unknown');
    assert.equal(reduceMember(type,{empty:true},p,DAY+40000).status,'away');
  }
  assert.equal(reduceMember({type:'artifacts'},{mtime:DAY-7200000},{},DAY).status,'away');
  const type={type:'etwin'};
  assert.equal(reduceMember(type,{running:true,mtime:DAY,activity:false,started:false},{},DAY).status,'idle','a fresh log alone (self-loop wake-up, heartbeat) is not work');
  let p=reduceMember(type,{running:true,mtime:DAY,activity:false,started:true},{},DAY); assert.equal(p.status,'busy','a reply was requested');
  p=reduceMember(type,{running:true,mtime:DAY+100000,activity:false,started:false},p,DAY+100000);assert.equal(p.status,'busy','still answering');
  p=reduceMember(type,{running:true,mtime:DAY+120000,activity:true,started:false},p,DAY+120000);assert.equal(p.status,'done','the reply landed');
  assert.equal(reduceMember(type,{running:true,mtime:DAY+120000,activity:false,started:false},p,DAY+139999).status,'done');
  assert.equal(reduceMember(type,{running:true,mtime:DAY+130000,activity:false,started:false},p,DAY+140000).status,'idle');
  p=reduceMember(type,{running:true,mtime:DAY,activity:false,started:true},{},DAY);
  assert.equal(reduceMember(type,{running:true,mtime:DAY,activity:false,started:false},p,DAY+180000).status,'idle','a query that never answered times out of busy');
  assert.equal(reduceMember(type,{running:false},p,DAY).status,'off');
});

test('80 Unicode characters, control stripping, notice first line and redaction',async()=>{
  const {cleanText,cleanNotice,taskCategory}=await core;
  assert.equal(Array.from(cleanText('😀'.repeat(90))).length,80);
  assert.equal(cleanText('a\u0000b\u202Ec\n'),'abc');
  assert.equal(cleanNotice('first\r\nprivate second'),'first');
  assert.equal(cleanNotice('first\u2028private'),'first');
  assert.ok(!cleanNotice('/private/'+'a'.repeat(80)+' hidden-after-prefix').includes('hidden-after-prefix'));
  const n=cleanNotice('检查 /Users/example/private 和 someone@example.com @private ￥123.45 及 400 元');
  for(const secret of ['/Users/','someone','@private','123','400']) assert.ok(!n.includes(secret));
  assert.equal(taskCategory('开发 /Users/example/private，账号 100000000'), '编程');
  assert.equal(taskCategory('无分类的私人内容'),'处理任务');
});

test('per-actor two-second and global sliding-minute limits; board truncation',async()=>{
  const {RateLimiter,appendNotice}=await core; const r=new RateLimiter();
  assert.equal(r.take('x',DAY),true);assert.equal(r.take('x',DAY+1999),false);assert.equal(r.take('x',DAY+2000),true);
  const global=new RateLimiter();for(let i=0;i<120;i++)assert.equal(global.take(String(i),DAY),true);
  assert.equal(global.take('new',DAY+59999),false);assert.equal(global.take('new',DAY+60000),true);
  let board=[];for(let i=0;i<25;i++)board=appendNotice(board,`notice ${i}`,DAY+i*2000);
  assert.equal(board.length,20);assert.equal(board[0].text,'notice 5');assert.equal(board.at(-1).text,'notice 24');
});

test('real HTTP auth, payload cap, 429, privacy allowlist, persistence and push restart',async t=>{
  const {createOffice}=await import('../server/office-server.mjs');
  await fs.mkdir(path.join(root,'tools/.test-data'),{recursive:true});
  const dir=await fs.mkdtemp(path.join(root,'tools/.test-data/http-')),stateFile=path.join(dir,'state.json');
  const config=JSON.parse(await fs.readFile(path.join(root,'config.example.json')));
  const token=randomBytes(24).toString('hex');let time=DAY;
  const options={config,token,stateFile,clock:()=>time,collector:async()=>({})};
  const office=await createOffice(options);await office.poll();
  office.server.listen(0,'127.0.0.1');await once(office.server,'listening');
  t.after(()=>new Promise(resolve=>{office.server.close(resolve);office.server.closeAllConnections();}));
  const base=`http://127.0.0.1:${office.server.address().port}`;
  const post=(p,body,auth=token)=>fetch(base+p,{method:'POST',headers:{'content-type':'application/json',...(auth?{Authorization:`Bearer ${auth}`}:{})},body:JSON.stringify(body)});
  assert.equal((await post('/api/notice',{text:'test'},'')).status,401);
  assert.equal((await post('/api/report',{id:config.roster[0].id,status:'busy'},'incorrect')).status,401);
  assert.equal((await post('/api/notice',{text:'x'.repeat(5000)})).status,413);
  assert.equal((await post('/api/report',{id:'nope',status:'busy'})).status,400);
  assert.equal((await post('/api/report',{id:config.roster[0].id,status:'invalid'})).status,400);
  assert.equal((await post('/api/notice',{text:'hello\nsecret'})).status,200);
  assert.equal((await post('/api/notice',{text:'too fast'})).status,429);
  const id=config.roster[0].id;
  assert.equal((await post('/api/report',{id,status:'waiting',summary:'写作 /private/hidden '+ '字'.repeat(100)})).status,200);
  assert.equal((await post('/api/report',{id,status:'busy'})).status,429);
  let publicState=await (await fetch(base+'/api/state')).json();
  assert.equal(publicState.roster[0].status,'waiting');assert.equal(publicState.notices[0].text,'hello');
  assert.deepEqual(Object.keys(publicState.roster[0]).sort(),['badge','color','desk','id','name','role','status','statusSince','workedToday']);
  for(const p of ['/server/office-server.mjs','/config.example.json','/state.json','/token','/%2e%2e/config.json'])assert.equal((await fetch(base+p)).status,404);
  for(let i=0;i<22;i++){time+=2000;assert.equal((await post('/api/notice',{text:'item '+i})).status,200);}
  const restart=await createOffice(options);await restart.poll();assert.equal(restart.snapshot().notices.length,20);assert.equal(restart.snapshot().roster[0].status,'waiting');
  assert.equal((await fs.stat(stateFile)).mode&0o777,0o600);
  const disk=await fs.readFile(stateFile,'utf8');assert.ok(!disk.includes('/private/hidden'));assert.ok(!disk.includes(token));
  time+=10000;await restart.poll({save:false});assert.equal(await fs.readFile(stateFile,'utf8'),disk,'read-only once must not overwrite persistent state');
  time=DAY+600000;await restart.poll();assert.equal(restart.snapshot().roster[0].status,'idle');
  time=DAY+1200000;
  const n=config.roster.length;
  for(let i=0;i<120;i++){
    time=DAY+1200000+Math.floor(i/n)*2000;
    assert.equal((await post('/api/report',{id:config.roster[i%n].id,status:'idle'})).status,200);
  }
  assert.equal((await post('/api/report',{id:config.roster.at(-1).id,status:'idle'})).status,429);
  const http=require('node:http');
  const streamed=await new Promise((resolve,reject)=>{
    const req=http.request(base+'/api/notice',{method:'POST',headers:{'content-type':'application/json',Authorization:`Bearer ${token}`}},res=>{res.resume();resolve(res.statusCode)});
    req.on('error',reject);req.write('x'.repeat(3000));req.end('x'.repeat(2000));
  });assert.equal(streamed,413,'chunked bodies are bounded too');
});

test('etwin appended lines count only; initial/rotated logs do not replay; partial lines wait',async()=>{
  const {etwinActivity,latestMtime}=await import('../server/collectors.mjs');
  await fs.mkdir(path.join(root,'tools/.test-data'),{recursive:true});
  const dir=await fs.mkdtemp(path.join(root,'tools/.test-data/signals-')),file=path.join(dir,'activity.log');
  await fs.writeFile(file,'[bot] bot → someone: private\n');
  let read=await etwinActivity(file,{});assert.equal(read.activity,false);let memory=read.memory;
  await fs.appendFile(file,'[bot] bot → someone: never display this');
  read=await etwinActivity(file,memory);assert.equal(read.activity,false);
  await fs.appendFile(file,'\n');read=await etwinActivity(file,memory);assert.equal(read.activity,true);assert.equal(read.memory.activityCount,1);assert.ok(!JSON.stringify(read).includes('display'));memory={...memory,...read.memory};
  read=await etwinActivity(file,memory);assert.equal(read.activity,false);
  await fs.appendFile(file,'[self-loop 2026-11-01T07:05:12.820Z] 醒来检查...\n[claude] query kind=self-loop toolMode=chat\n');
  read=await etwinActivity(file,memory);assert.equal(read.started,false,'self-loop is not work');memory={...memory,...read.memory};
  await fs.appendFile(file,'[claude] query kind=reactive toolMode=chat model=opus\n');
  read=await etwinActivity(file,memory);assert.equal(read.started,true);assert.equal(read.activity,false);memory={...memory,...read.memory};
  await fs.appendFile(file,'[claude] query kind=distill\n');
  read=await etwinActivity(file,memory);assert.equal(read.started,true);memory={...memory,...read.memory};
  await fs.writeFile(file,'rotated\n');assert.equal((await etwinActivity(file,memory)).activity,false);
  await fs.mkdir(path.join(dir,'nested'));await fs.writeFile(path.join(dir,'nested/new.txt'),'x');
  assert.ok((await latestMtime(dir)).mtime>0);await assert.rejects(latestMtime(dir,1));
});

test('status slips: waiting beats busy, done fades, stale slips fall back to the mirror, badge counts',async()=>{
  const {reduceMember}=await core;
  const src={type:'statusfiles'};
  const sig=(slips,fallback={mtime:DAY-3*3600000})=>({slips,fallback});
  let p=reduceMember(src,sig([{status:'busy',at:DAY-60000}]),{},DAY); assert.equal(p.status,'busy'); assert.equal(p.badge,'1');
  p=reduceMember(src,sig([{status:'busy',at:DAY-60000},{status:'waiting',at:DAY-30000},{status:'busy',at:DAY-10000}]),p,DAY); assert.equal(p.status,'waiting'); assert.equal(p.badge,'1');
  p=reduceMember(src,sig([{status:'done',at:DAY-5*60000}]),p,DAY); assert.equal(p.status,'done');
  p=reduceMember(src,sig([{status:'done',at:DAY-11*60000}]),p,DAY); assert.equal(p.status,'away','old done → mirror says away (3h old)');
  p=reduceMember(src,sig([{status:'busy',at:DAY-121*60000}]),p,DAY); assert.equal(p.status,'away','stale busy ignored');
  p=reduceMember(src,sig([],{empty:true}),{},DAY); assert.equal(p.status,'away');
  p=reduceMember(src,sig([{status:'busy',at:DAY+600000}]),{},DAY); assert.notEqual(p.status,'busy','future slip not trusted');
  assert.equal(reduceMember(src,{error:true},{},DAY).status,'unknown');
});

test('status slip collector reads one-line json, skips bad or oversized files, missing dir is not fatal',async()=>{
  const {statusFiles}=await import('../server/collectors.mjs');
  const fs=require('node:fs'); const os=require('node:os'); const path=require('node:path');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'slips-')); const mirror=fs.mkdtempSync(path.join(os.tmpdir(),'mirror-'));
  fs.writeFileSync(path.join(mirror,'a.txt'),'x');
  fs.writeFileSync(path.join(dir,'媒体制作.json'),JSON.stringify({status:'busy',task:'做视频',at:'2026-11-01T14:30:00+08:00'}));
  fs.writeFileSync(path.join(dir,'bad.json'),'{not json');
  fs.writeFileSync(path.join(dir,'weird.json'),JSON.stringify({status:'off'}));
  fs.writeFileSync(path.join(dir,'big.json'),JSON.stringify({status:'busy',pad:'x'.repeat(5000)}));
  fs.writeFileSync(path.join(dir,'note.txt'),'{"status":"busy"}');
  const r=await statusFiles(dir,mirror);
  assert.equal(r.slips.length,1); assert.equal(r.slips[0].status,'busy'); assert.equal(r.slips[0].at,Date.parse('2026-11-01T14:30:00+08:00'));
  assert.ok(r.fallback.mtime>0); assert.equal('task' in r.slips[0],false,'task text never leaves the collector');
  const none=await statusFiles(path.join(dir,'missing'),mirror); assert.deepEqual(none.slips,[]);
});

test('stat-only artifacts: day subfolder mtime without listing, root alone is empty, missing root throws',async()=>{
  const {statOnlyMtime,beijingDate}=await import('../server/collectors.mjs');
  const fs=require('node:fs'); const os=require('node:os'); const path=require('node:path');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'statonly-')); const now=Date.now();
  assert.deepEqual(await statOnlyMtime(root,now),{empty:true});
  const today=path.join(root,beijingDate(now)); fs.mkdirSync(today); fs.writeFileSync(path.join(today,'clip.mp4'),'x');
  const r=await statOnlyMtime(root,now); assert.ok(Math.abs(r.mtime-fs.statSync(today).mtimeMs)<1);
  await assert.rejects(statOnlyMtime(path.join(root,'nope'),now));
});

test('guest feed: same desks, no board, no badge text, CORS only for the public page origin, nothing else under /guest',async t=>{
  const {createOffice}=await import('../server/office-server.mjs');
  await fs.mkdir(path.join(root,'tools/.test-data'),{recursive:true});
  const dir=await fs.mkdtemp(path.join(root,'tools/.test-data/http-')),stateFile=path.join(dir,'state.json');
  const config=JSON.parse(await fs.readFile(path.join(root,'config.example.json')));
  const token=randomBytes(24).toString('hex');
  const office=await createOffice({config,token,stateFile,clock:()=>DAY,collector:async()=>({})});await office.poll();
  office.server.listen(0,'127.0.0.1');await once(office.server,'listening');
  t.after(()=>new Promise(resolve=>{office.server.close(resolve);office.server.closeAllConnections();}));
  const base=`http://127.0.0.1:${office.server.address().port}`;
  await fetch(base+'/api/notice',{method:'POST',headers:{'content-type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({text:'private board line'})});
  const full=await (await fetch(base+'/api/state')).json(); assert.equal(full.notices.length,1);
  const r=await fetch(base+'/guest/api/state',{headers:{Origin:'https://aliceljy.github.io'}}); const g=await r.json();
  assert.equal(r.headers.get('access-control-allow-origin'),'https://aliceljy.github.io');
  assert.equal(g.guest,true); assert.equal(g.demo,false); assert.deepEqual(g.notices,[]); assert.equal(g.roster.length,config.roster.length);
  assert.deepEqual(g.roster.map(a=>a.id),full.roster.map(a=>a.id)); assert.ok(g.roster.every(a=>a.badge===''));
  const other=await fetch(base+'/guest/api/state',{headers:{Origin:'https://evil.example'}}); assert.equal(other.headers.get('access-control-allow-origin'),null);
  assert.equal((await fetch(base+'/guest/api/notice',{method:'POST'})).status,404);
  assert.equal((await fetch(base+'/guest/index.html')).status,404);
});

test('codex: a fresh rollout counts as busy without a process; old rollouts rest; rollout reader picks today/yesterday folders',async()=>{
  const {reduceMember}=await core; const src={type:'codex'};
  assert.equal(reduceMember(src,{running:false,rolloutMtime:DAY-60000},{},DAY).status,'busy');
  assert.equal(reduceMember(src,{running:false,rolloutMtime:DAY-4*60000},{},DAY).status,'idle');
  assert.equal(reduceMember(src,{running:false,rolloutMtime:DAY-40*60000},{},DAY).status,'idle');
  assert.equal(reduceMember(src,{running:true,rolloutMtime:DAY-40*60000},{},DAY).status,'busy');
  assert.equal(reduceMember(src,{running:false},{},DAY).status,'idle');
  const {latestRollout}=await import('../server/collectors.mjs');
  const fs=require('node:fs'); const os=require('node:os'); const path=require('node:path');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'codex-')); const now=Date.now(); const d=new Date(now).toISOString().slice(0,10).split('-');
  const day=path.join(root,...d); fs.mkdirSync(day,{recursive:true}); fs.writeFileSync(path.join(day,'rollout-x.jsonl'),'{}'); fs.writeFileSync(path.join(day,'other.txt'),'x');
  const r=await latestRollout(root,now); assert.ok(Math.abs(r.rolloutMtime-fs.statSync(path.join(day,'rollout-x.jsonl')).mtimeMs)<1);
  assert.deepEqual(await latestRollout(path.join(root,'nope'),now),{});
});

test('guest report: a bot key moves only its own desk; wrong key 403, no key for that bot 403, bad status 400, task text stays private',async t=>{
  const {createOffice}=await import('../server/office-server.mjs');
  await fs.mkdir(path.join(root,'tools/.test-data'),{recursive:true});
  const dir=await fs.mkdtemp(path.join(root,'tools/.test-data/http-')),stateFile=path.join(dir,'state.json');
  const config=JSON.parse(await fs.readFile(path.join(root,'config.example.json')));
  const token=randomBytes(24).toString('hex'); const key=randomBytes(24).toString('hex'); const helper=config.roster.find(a=>a.id==='helper')?.id||config.roster[9].id;
  let time=DAY; const office=await createOffice({config,token,botKeys:{[helper]:key},stateFile,clock:()=>time,collector:async()=>({})});await office.poll();
  office.server.listen(0,'127.0.0.1');await once(office.server,'listening');
  t.after(()=>new Promise(resolve=>{office.server.close(resolve);office.server.closeAllConnections();}));
  const base=`http://127.0.0.1:${office.server.address().port}`;
  const rep=(id,body,k=key)=>fetch(base+'/guest/report/'+id,{method:'POST',headers:{'content-type':'application/json','x-office-key':k},body:JSON.stringify(body)});
  assert.equal((await rep(helper,{status:'busy'},'wrong')).status,403);
  assert.equal((await rep(config.roster[0].id,{status:'busy'})).status,403,'key is bound to one desk');
  assert.equal((await rep(helper,{status:'unknown'})).status,400);
  assert.equal((await rep(helper,{status:'busy',task:'采集 /secret/path 很长'+'字'.repeat(100)})).status,200);
  const g=await (await fetch(base+'/guest/api/state')).json(); const me=g.roster.find(a=>a.id===helper);
  assert.equal(me.status,'busy'); assert.equal(JSON.stringify(g).includes('/secret'),false);
  time+=3000; assert.equal((await rep(helper,{status:'done'})).status,200);
  await assert.rejects(createOffice({config,token,botKeys:{nope:key},stateFile,clock:()=>time,collector:async()=>({})}));
});

test('an open bot desk takes reports with no key; other desks still refuse',async t=>{
  const {createOffice}=await import('../server/office-server.mjs');
  const dir=await fs.mkdtemp(path.join(root,'tools/.test-data/http-')),stateFile=path.join(dir,'state.json');
  const config=JSON.parse(await fs.readFile(path.join(root,'config.example.json')));
  const open_=config.roster.find(a=>a.id==='helper').id, other=config.roster[0].id;
  const office=await createOffice({config,token:randomBytes(24).toString('hex'),botKeys:{[open_]:'open'},stateFile,clock:()=>DAY,collector:async()=>({})});await office.poll();
  office.server.listen(0,'127.0.0.1');await once(office.server,'listening');
  t.after(()=>new Promise(resolve=>{office.server.close(resolve);office.server.closeAllConnections();}));
  const base=`http://127.0.0.1:${office.server.address().port}`;
  const rep=(id,body)=>fetch(base+'/guest/report/'+id,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await rep(open_,{status:'busy',task:'采集'})).status,200);
  assert.equal((await rep(other,{status:'busy'})).status,403);
  assert.equal((await rep(open_,{status:'nope'})).status,400);
  const g=await (await fetch(base+'/guest/api/state')).json(); assert.equal(g.roster.find(a=>a.id===open_).status,'busy');
});

test('artifacts with several drop points: newest anywhere counts, an optional missing one is skipped',async()=>{
  const {collect}=await import('../server/collectors.mjs');
  const fs=require('node:fs'); const os=require('node:os'); const path=require('node:path');
  const a=fs.mkdtempSync(path.join(os.tmpdir(),'dropA-')), b=fs.mkdtempSync(path.join(os.tmpdir(),'dropB-'));
  fs.writeFileSync(path.join(a,'old.json'),'x'); const past=new Date(Date.now()-3600000); fs.utimesSync(path.join(a,'old.json'),past,past);
  fs.writeFileSync(path.join(b,'new.mp4'),'x');
  const r=await collect({type:'artifacts',directories:[{path:a},{path:b},{path:path.join(b,'nope'),optional:true}]});
  assert.ok(Math.abs(r.mtime-fs.statSync(path.join(b,'new.mp4')).mtimeMs)<1);
  const missing=await collect({type:'artifacts',directories:[{path:path.join(b,'nope')}]}); assert.equal(missing.error,true);
});

test('one desk per engine: a live CLI run from any caller is busy, its end is a short done, a stopped bridge then rests on the run time',async()=>{
  const {reduceMember}=await core, {processCount,codexRunning}=await import('../server/collectors.mjs');
  const ps=['1 kimi-code','2 /Users/a/.kimi-code/bin/kimi -p hi','3 /opt/homebrew/bin/agy -p Goal: review','4 bash /Users/a/scripts/kimi-run.sh -f x','5 /x/kimi mcp','6 /opt/homebrew/bin/agy --version','7 /x/agy login'].join('\n');
  assert.equal(processCount(ps,['kimi','kimi-code']),2); assert.equal(processCount(ps,['agy']),1); assert.equal(processCount(ps,[]),0);
  assert.equal(codexRunning('123 /Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex exec --json task'),true,'the shim execs the binary inside the app bundle');
  assert.equal(codexRunning('123 /Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex -c forced_login_method="chatgpt" exec-server --remote https://x'),false);
  assert.equal(codexRunning('123 /Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex -c features.code_mode_host=true app-server'),false);
  const src={type:'launchd',label:'x',log:'y',processes:['kimi','kimi-code']};
  let p=reduceMember(src,{running:false,processes:2},{},DAY); assert.equal(p.status,'busy'); assert.equal(p.badge,'2','bridge off, two terminal/CC runs alive');
  p=reduceMember(src,{running:true,mtime:DAY-3600000,processes:1},p,DAY+10000); assert.equal(p.status,'busy'); assert.equal(p.badge,'1');
  p=reduceMember(src,{running:true,mtime:DAY-3600000,processes:0},p,DAY+20000); assert.equal(p.status,'done'); assert.equal(p.badge,'');
  p=reduceMember(src,{running:true,mtime:DAY-3600000,processes:0},p,DAY+40000); assert.equal(p.status,'idle','run ended 30 s ago, old log: resting, not busy');
  p=reduceMember(src,{running:false,processes:0},p,DAY+60000); assert.equal(p.status,'idle','bridge stopped but a run ended a minute ago');
  p=reduceMember(src,{running:false,processes:0},p,DAY+31*60000); assert.equal(p.status,'off','half an hour later the stopped bridge reads off');
  p=reduceMember(src,{running:true,mtime:DAY+32*60000-1000,processes:0},p,DAY+32*60000); assert.equal(p.status,'busy','bridge log fresh still counts'); assert.equal(p.badge,'');
  assert.equal(reduceMember(src,{running:true,mtime:DAY-60000},{},DAY).status,'busy','no processes field at all keeps the old rule');
});

test('status slips from a sleeping box: busy is forgotten, waiting and done still count, then the desk is away',async()=>{
  const {reduceMember}=await core, {boxAsleep,statusFiles}=await import('../server/collectors.mjs');
  const src={type:'statusfiles'};
  const sig=(slips,asleep)=>({slips,asleep,fallback:{mtime:DAY-60*60000}});
  assert.equal(reduceMember(src,sig([{status:'busy',at:DAY-60000}],false),{},DAY).status,'busy');
  assert.equal(reduceMember(src,sig([{status:'busy',at:DAY-60000}],true),{},DAY).status,'away','asleep: a busy slip is a forgotten slip');
  assert.equal(reduceMember(src,sig([{status:'waiting',at:DAY-60000}],true),{},DAY).status,'waiting');
  assert.equal(reduceMember(src,sig([{status:'done',at:DAY-60000}],true),{},DAY).status,'done');
  assert.equal(reduceMember(src,sig([],true),{},DAY).status,'away','asleep with a fresh mirror is still away, not idle');
  assert.equal(reduceMember(src,sig([],false),{memory:{seenMtime:DAY-60*60000}},DAY).status,'idle');
  assert.equal(reduceMember(src,sig([{status:'busy',at:DAY-60000}],undefined),{},DAY).status,'busy','no marker file: old behaviour');
  let p=reduceMember(src,{...sig([],true),processes:1},{},DAY); assert.equal(p.status,'busy','a local Grok CLI run counts at the bot desk'); assert.equal(p.badge,'1');
  p=reduceMember(src,{...sig([],true),processes:0},p,DAY+10000); assert.equal(p.status,'done');
  p=reduceMember(src,{...sig([],true),processes:0},p,DAY+60000); assert.equal(p.status,'idle','run ended a minute ago, box asleep: idle, not away');
  p=reduceMember(src,{...sig([],true),processes:0},p,DAY+31*60000); assert.equal(p.status,'away');
  p=reduceMember(src,{...sig([{status:'waiting',at:DAY+40*60000}],true),processes:1},p,DAY+40*60000); assert.equal(p.status,'busy','a live run outranks a waiting slip for the moment');
  const fs=require('node:fs'); const os=require('node:os'); const path=require('node:path');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'awake-'));
  const f=path.join(dir,'上次同步.txt');
  fs.writeFileSync(f,'上次成功同步：11-01 14:59\n进度：已经和云电脑一致\n上次尝试：11-01 15:02 云电脑在休眠，没连上（正常）\n');
  assert.equal(await boxAsleep(f),true);
  fs.writeFileSync(f,'上次成功同步：11-01 14:59\n上次尝试：11-01 14:59 成功\n');
  assert.equal(await boxAsleep(f),false);
  fs.writeFileSync(f,'只有一行\n'); assert.equal(await boxAsleep(f),undefined);
  assert.equal(await boxAsleep(path.join(dir,'missing.txt')),undefined);
  const slips=fs.mkdtempSync(path.join(os.tmpdir(),'slips-')); fs.writeFileSync(path.join(slips,'a.json'),JSON.stringify({status:'busy',at:'2026-11-01T14:30:00+08:00'}));
  fs.writeFileSync(f,'上次成功同步：11-01 14:59\n上次尝试：11-01 14:59 成功\n');
  const r=await statusFiles(slips,null,f); assert.equal(r.asleep,false); assert.equal(r.slips.length,1);
});

test('minutes at work today: busy ticks add up, a long gap is skipped, midnight restarts, pushes count too',async()=>{
  const {reduceMember,beijingDay}=await core;
  const src={type:'launchd',label:'x',log:'y',processes:['kimi']};
  let p=reduceMember(src,{running:false,processes:1},{},DAY); assert.equal(p.status,'busy'); assert.equal(p.workedMs,0); assert.equal(p.workedDay,beijingDay(DAY));
  p=reduceMember(src,{running:false,processes:1},p,DAY+10000); assert.equal(p.workedMs,10000);
  p=reduceMember(src,{running:false,processes:0},p,DAY+20000); assert.equal(p.status,'done'); assert.equal(p.workedMs,20000,'the last busy interval counts');
  p=reduceMember(src,{running:false,processes:0},p,DAY+30000); assert.equal(p.workedMs,20000,'resting adds nothing');
  p=reduceMember(src,{running:false,processes:1},p,DAY+40000); p=reduceMember(src,{running:false,processes:1},p,DAY+40000+90000); assert.equal(p.workedMs,20000,'a 90 s gap (office down) is not counted');
  p=reduceMember(src,{running:false,processes:1},p,DAY+40000+100000); assert.equal(p.workedMs,30000);
  const midnight=Date.parse('2026-11-01T16:00:00Z');
  p=reduceMember(src,{running:false,processes:1},{...p,tickAt:midnight-5000,status:'busy'},midnight); assert.equal(p.workedMs,0,'a new Beijing day starts at zero'); assert.equal(p.workedDay,'2026-11-02');
  const pushed=reduceMember({type:'push'},{},{status:'busy',push:{at:DAY,status:'busy'},tickAt:DAY,workedDay:beijingDay(DAY),workedMs:0},DAY+5000); assert.equal(pushed.status,'busy'); assert.equal(pushed.workedMs,5000);
});

test('guest visits: a tagged hello counts for 45 s, bad tags 400, CORS only for the public page, count in both feeds',async t=>{
  const {createOffice}=await import('../server/office-server.mjs');
  await fs.mkdir(path.join(root,'tools/.test-data'),{recursive:true});
  const dir=await fs.mkdtemp(path.join(root,'tools/.test-data/visit-'));
  const config=JSON.parse(await fs.readFile(path.join(root,'config.example.json')));
  let time=DAY; const office=await createOffice({config,token:randomBytes(24).toString('hex'),stateFile:path.join(dir,'state.json'),clock:()=>time,collector:async()=>({})});
  await office.poll(); office.server.listen(0,'127.0.0.1'); await once(office.server,'listening');
  t.after(()=>new Promise(resolve=>{office.server.close(resolve);office.server.closeAllConnections();}));
  const base=`http://127.0.0.1:${office.server.address().port}`;
  const hello=(tag,origin='https://aliceljy.github.io')=>fetch(`${base}/guest/visit?v=${tag}`,{headers:{origin}});
  let r=await hello('0123456789abcdef'); assert.equal(r.status,200); assert.equal(r.headers.get('access-control-allow-origin'),'https://aliceljy.github.io'); assert.equal(r.headers.get('cache-control'),'no-store');
  assert.equal((await hello('nope')).status,400); assert.equal((await hello('')).status,400);
  r=await hello('fedcba9876543210','https://evil.example'); assert.equal(r.status,200); assert.equal(r.headers.get('access-control-allow-origin'),null,'no CORS for other origins');
  assert.equal((await hello('0123456789abcdef')).status,429,'same tab twice within two seconds');
  assert.equal((await (await fetch(base+'/api/state')).json()).visitors,2);
  assert.equal((await (await fetch(base+'/guest/api/state')).json()).visitors,2,'the public feed carries only the count');
  time+=46000; assert.equal((await (await fetch(base+'/api/state')).json()).visitors,0,'silent tabs have left');
  assert.equal((await fetch(base+'/guest/visit',{method:'POST'})).status,404);
  let full=await (await fetch(base+'/api/state')).json(); assert.equal(full.visitorsTotal,2,'two tags ever heard');
  time+=3000; assert.equal((await hello('0123456789abcdef')).status,200);
  full=await (await fetch(base+'/api/state')).json(); assert.equal(full.visitorsTotal,3,'a tab back after 45 s of silence is a new visit'); assert.equal(full.visitors,1);
  time+=3000; await hello('0123456789abcdef'); assert.equal((await (await fetch(base+'/api/state')).json()).visitorsTotal,3,'the same open tab is not counted twice');
  const again=await createOffice({config,token:randomBytes(24).toString('hex'),stateFile:path.join(dir,'state.json'),clock:()=>time,collector:async()=>({})});
  await again.poll(); assert.equal(again.snapshot().visitorsTotal,3,'the guest book survives a restart'); assert.equal(again.snapshot().visitors,0);
});

test('guest feed rounds times to the minute; the /guest/ tree has a per-address budget with Retry-After',async t=>{
  const {createOffice}=await import('../server/office-server.mjs');
  await fs.mkdir(path.join(root,'tools/.test-data'),{recursive:true});
  const dir=await fs.mkdtemp(path.join(root,'tools/.test-data/limit-'));
  const config=JSON.parse(await fs.readFile(path.join(root,'config.example.json')));
  const token=randomBytes(24).toString('hex'); let time=DAY+90_000+7_000;
  const office=await createOffice({config,token,stateFile:path.join(dir,'state.json'),clock:()=>time,collector:async()=>({})});
  await office.poll(); office.server.listen(0,'127.0.0.1'); await once(office.server,'listening');
  t.after(()=>new Promise(resolve=>{office.server.close(resolve);office.server.closeAllConnections();}));
  const base=`http://127.0.0.1:${office.server.address().port}`;
  await fetch(base+'/api/report',{method:'POST',headers:{'content-type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({id:config.roster[0].id,status:'busy'})});
  time+=35_000; await office.poll();
  const full=(await (await fetch(base+'/api/state')).json()).roster[0], guest=(await (await fetch(base+'/guest/api/state')).json()).roster[0];
  assert.equal(full.statusSince,new Date(DAY+97_000).toISOString()); assert.equal(guest.statusSince,new Date(DAY+60_000).toISOString(),'guest sees the minute, not the second');
  assert.equal(full.workedToday,35_000); assert.equal(guest.workedToday,0,'35 s of work rounds down to no full minute');
  const get=(ip,p='/guest/api/state')=>fetch(base+p,{headers:{'x-forwarded-for':`1.2.3.4, ${ip}`}});
  for(let i=0;i<120;i++) assert.equal((await get('9.9.9.9')).status,200,`request ${i+1}`);
  const over=await get('9.9.9.9'); assert.equal(over.status,429); assert.ok(Number(over.headers.get('retry-after'))>0&&Number(over.headers.get('retry-after'))<=60);
  assert.equal((await get('9.9.9.9','/guest/visit?v=0123456789abcdef')).status,429,'the budget covers the whole /guest/ tree');
  assert.equal((await get('8.8.8.8')).status,200,'another address is unaffected (the proxy-appended last entry counts, not the spoofable first)');
  assert.equal((await fetch(base+'/api/state')).status,200,'the private feed is not budgeted');
  time+=61_000; assert.equal((await get('9.9.9.9')).status,200,'a minute later the budget is back');
});
