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
  const type={type:'etwin'}, sig={running:true,mtime:DAY,activity:true};
  let p=reduceMember(type,sig,{},DAY); assert.equal(p.status,'busy');
  p=reduceMember(type,{...sig,activity:false},p,DAY+59999);assert.equal(p.status,'busy');
  p=reduceMember(type,{...sig,activity:false},p,DAY+60000);assert.equal(p.status,'done');
  assert.equal(reduceMember(type,{...sig,activity:false},p,DAY+80000).status,'idle');
  assert.equal(reduceMember(type,{...sig,activity:false},p,DAY+180000).status,'idle');
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
  assert.deepEqual(Object.keys(publicState.roster[0]).sort(),['badge','color','id','name','role','status','statusSince']);
  for(const p of ['/server/office-server.mjs','/config.example.json','/state.json','/token','/%2e%2e/config.json'])assert.equal((await fetch(base+p)).status,404);
  for(let i=0;i<22;i++){time+=2000;assert.equal((await post('/api/notice',{text:'item '+i})).status,200);}
  const restart=await createOffice(options);await restart.poll();assert.equal(restart.snapshot().notices.length,20);assert.equal(restart.snapshot().roster[0].status,'waiting');
  assert.equal((await fs.stat(stateFile)).mode&0o777,0o600);
  const disk=await fs.readFile(stateFile,'utf8');assert.ok(!disk.includes('/private/hidden'));assert.ok(!disk.includes(token));
  time+=10000;await restart.poll({save:false});assert.equal(await fs.readFile(stateFile,'utf8'),disk,'read-only once must not overwrite persistent state');
  time=DAY+600000;await restart.poll();assert.equal(restart.snapshot().roster[0].status,'idle');
  time=DAY+1200000;
  for(let i=0;i<120;i++){
    time=DAY+1200000+Math.floor(i/11)*2000;
    assert.equal((await post('/api/report',{id:config.roster[i%11].id,status:'idle'})).status,200);
  }
  assert.equal((await post('/api/report',{id:config.roster[10].id,status:'idle'})).status,429);
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
  await fs.writeFile(file,'rotated\n');assert.equal((await etwinActivity(file,memory)).activity,false);
  await fs.mkdir(path.join(dir,'nested'));await fs.writeFile(path.join(dir,'nested/new.txt'),'x');
  assert.ok((await latestMtime(dir)).mtime>0);await assert.rejects(latestMtime(dir,1));
});
