// NODE_PATH="$(npm root -g)" node tests/batch3-browser.cjs
// Real isolated office HTTP server with temporary history/audit; never contacts production.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{once}=require('node:events'),{randomBytes}=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.join(root,'tools/shots'),C=require('../office-core.js'),T=Date.parse('2026-11-03T02:00:07Z'),H=Date.parse('2026-11-02T02:00:00Z'),M=60000,iso=n=>new Date(n).toISOString();
const report={checks:[],frames:[],errors:[],requests:[]};
const check=(name,value)=>{report.checks.push({name,passed:!!value});console.log(value?'PASS':'FAIL',name);assert.ok(value,name);};
(async()=>{let dir,office,browser;try{
 dir=await fs.mkdtemp(path.join(os.tmpdir(),'office-batch3-browser-'));await fs.mkdir(path.join(dir,'history'));
 const demo=JSON.parse(await fs.readFile(path.join(root,'demo-script.json'))),roster=demo.roster.map((a,i)=>({...a,id:['cc','codex','kimi','agy','etwin','grok','muse','doubao','dots','cobbler'][i],source:{type:'push'}}));
 let now=T;const {createOffice}=await import('../server/office-server.mjs'),token=randomBytes(24).toString('hex');
 office=await createOffice({config:{roster,makotoAudit:null,radarLedgers:[],historyDir:path.join(dir,'history')},token,stateFile:path.join(dir,'state.json'),clock:()=>now,collector:async()=>({}),sceneCollector:async()=>({})});await office.poll();office.server.listen(0,'127.0.0.1');await once(office.server,'listening');const base=`http://127.0.0.1:${office.server.address().port}`;
 const post=(body)=>{now+=2001;return fetch(base+'/api/report',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)});};
 for(const a of roster)await post({id:a.id,status:'busy'});
 const hist={day:'2026-11-02',stats:{today:{visitors:1,treats:0,meetings:0,handoffs:0,calls:0,gatesBlocked:1,gatesPassed:1}},timeline:[{at:iso(H),id:'cc',s:'idle'},{at:iso(H),id:'codex',s:'done'},{at:iso(H+185*M),id:'cc',s:'busy'}],events:[{at:iso(H),kind:'gate',id:'codex',ok:false},{at:iso(H+180*M),kind:'visitor',n:1},{at:iso(H+181*M),kind:'gate',id:'codex',ok:true}]};
 await fs.writeFile(path.join(dir,'history','2026-11-02.json'),JSON.stringify(hist));
 await fs.writeFile(path.join(dir,'history','2026-11-01.json'),JSON.stringify({day:'2026-11-01',stats:{today:hist.stats.today},events:[{at:'2026-11-01T02:00:00Z',kind:'visitor',n:1}]}));
 browser=await chromium.launch({channel:'chrome',headless:true});report.browser=browser.version();
 async function pageAt(query='',wide=false,guest=false){
  const context=await browser.newContext({viewport:wide?{width:1455,height:782}:{width:390,height:664},deviceScaleFactor:2});const p=await context.newPage();
  p.on('pageerror',e=>report.errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&m.text().startsWith('frame'))report.errors.push(m.text());});
  p.on('request',req=>report.requests.push({method:req.method(),url:req.url()}));
  await p.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.origin===new URL(base).origin)return route.continue();
   // A static Pages-origin page obtains all data through the real guest routes.
   if(u.hostname==='mac-mini.tail791fb9.ts.net') {
    if(!guest)return route.abort();
    const target=base+'/guest/'+u.pathname.replace(/^\/office\//,'')+u.search;
    const r=await fetch(target,{headers:{origin:'https://aliceljy.github.io'}});return route.fulfill({status:r.status,headers:Object.fromEntries(r.headers),body:await r.text()});
   }
   if(guest && u.hostname==='aliceljy.github.io') {
    const f=u.pathname.split('/').at(-1)||'index.html';if(!['index.html','office.js','office-core.js','style.css','demo-script.json'].includes(f))return route.fulfill({status:404,body:''});
    return route.fulfill({contentType:f.endsWith('.js')?'text/javascript':f.endsWith('.json')?'application/json':f.endsWith('.css')?'text/css':'text/html',body:await fs.readFile(path.join(root,f))});
   }
   return route.abort();
  });
  await p.clock.install({time:T});await p.goto((guest?'https://aliceljy.github.io/playground/ai-office/':base+'/')+query);await p.waitForFunction(()=>window.__PLAYTEST__?.ready,{},{polling:50});await p.evaluate(()=>window.__PLAYTEST__.step(0));return p;
 }
 async function shot(p,name){const s=await p.evaluate(()=>window.__PLAYTEST__.snapshot());report.frames.push({name,state:s});await p.screenshot({path:path.join(out,name+'.png')});return s;}
 async function open(p,day='2026-11-02'){await p.waitForFunction(()=>!document.querySelector('#history-tab').hidden,{},{polling:50});await p.locator('#history-tab').click();await p.locator(`[data-day="${day}"]`).click();await p.waitForFunction(()=>!!window.__PLAYTEST__.snapshot().replay,{},{polling:50});}
 for(const wide of [false,true]){
  const p=await pageAt('',wide);await p.waitForFunction(()=>!document.querySelector('#history-tab').hidden,{},{polling:50});await p.locator('#history-tab').click();if(!wide)await shot(p,'replay-list');await p.locator('[data-day="2026-11-02"]').click();await p.waitForFunction(()=>!!window.__PLAYTEST__.snapshot().replay,{},{polling:50});
  const initial=await p.evaluate(()=>window.__PLAYTEST__.snapshot());check('start one minute before first evidence '+wide,initial.replay.clock===H-M);check('no invented statuses before timeline '+wide,initial.actors.every(a=>a.status==='unknown'));
  let s=await p.evaluate(()=>window.__PLAYTEST__.step(800));check('clock advances '+wide,s.replay.clock>initial.replay.clock);check('no record remains unknown '+wide,s.actors.find(a=>a.id==='kimi').status==='unknown');
  await shot(p,wide?'replay-landscape':'replay');check('banner readable/in viewport '+wide,await p.locator('#replay-banner').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;}));
  check('interactions hidden '+wide,await p.locator('#treat').isHidden());
  const req=report.requests.length;await p.evaluate(()=>{document.querySelector('#treat-menu button').click();document.querySelector('#meet-menu button').click();document.querySelector('#pose').click();});await p.clock.runFor(100);
  check('no interaction requests '+wide,!report.requests.slice(req).some(r=>/\/(meet|treat)(?:\?|$)/.test(r.url)));
  s=await p.evaluate(()=>window.__PLAYTEST__.step(4500));check('20 idle minutes skip '+wide,s.replay.skips===1 && s.replay.clock>=H+179*M);
  await p.locator('#replay-speed').selectOption('60');check('speed changes '+wide,(await p.evaluate(()=>window.__PLAYTEST__.snapshot())).replay.speed===60);
  const beforeNext=await p.evaluate(()=>window.__PLAYTEST__.snapshot());await p.locator('#replay-next').click();const afterNext=await p.evaluate(()=>window.__PLAYTEST__.step(1000));check('next event replayed '+wide,afterNext.events.length>beforeNext.events.length && (await p.locator('#replay-line').innerText()).endsWith(C.eventText(afterNext.events.at(-1),roster)));
  check('no photo during replay '+wide,await p.locator('#photo').isHidden());
  // A real poll returns a changed live status while replay is active; it must be parked until exit.
  await post({id:'kimi',status:'waiting'});await p.clock.runFor(10010);check('real poll does not replace replay '+wide,(await p.evaluate(()=>window.__PLAYTEST__.snapshot())).actors.find(a=>a.id==='kimi').status==='unknown');
  await p.locator('#replay-exit').click();s=await p.evaluate(()=>window.__PLAYTEST__.snapshot());check('exit applies latest live immediately '+wide,!s.replay&&s.actors.find(a=>a.id==='kimi').status==='waiting');
  await open(p,'2026-11-01');check('event-only warning '+wide,(await p.locator('#replay-note').innerText())==='这天只记了事件，座位状态没记');s=await p.evaluate(()=>window.__PLAYTEST__.step(2000));check('old archive seats all unknown '+wide,s.actors.every(a=>a.status==='unknown'));await p.context().close();
 }
 for(const wide of [false,true]){
  const p=await pageAt('?view=gate',wide),s=await shot(p,wide?'gate-red-landscape':'gate-red');console.log('gate view',wide,s.gate?.phase,s.elapsed);check('red view achieved '+wide,s.actualView==='gate'&&s.gate.ok===false&&s.gate.n===3);check('demo block total includes merged n '+wide,s.stats.gatesBlockedTotal===s.gate.n && s.stats.today.gatesBlocked===s.gate.n);check('red lamp pixels visible '+wide,await p.evaluate(()=>{const d=document.querySelector('#office').getContext('2d').getImageData(124*2,128*2,1,1).data;return d[0]===235&&d[1]===107&&d[2]===85;}));
  const rows=await p.evaluate(()=>{const ctx=document.querySelector('#office').getContext('2d'),draw=ctx.fillText,rows=[];ctx.fillText=function(t,x,y,...rest){if(/^(办公室累计|来过客人|开过会|今天：客人|安检门拦下)/.test(t)){const m=this.measureText(t);rows.push({text:t,top:y-m.actualBoundingBoxAscent,bottom:y+m.actualBoundingBoxDescent,width:m.width});}return draw.call(this,t,x,y,...rest);};try{window.__PLAYTEST__.step(0);}finally{ctx.fillText=draw;}return rows;});
  check('all five board rows fit without overlap '+wide,rows.length===5 && rows.every((r,i)=>r.width<=260.1 && r.top>=430 && r.bottom<=478 && (!i || r.top>=rows[i-1].bottom-.25)));report.boardMetrics??=[];report.boardMetrics.push({wide,rows});
  if(!wide){let g;for(let i=0;i<160;i++){g=await p.evaluate(()=>window.__PLAYTEST__.step(250));if(g.gate?.ok&&g.gate.phase==='signal')break;}check('green phase reached',g.gate?.ok&&g.gate.phase==='signal');await shot(p,'gate-green');check('green lamp pixels visible',await p.evaluate(()=>{const d=document.querySelector('#office').getContext('2d').getImageData(124*2,128*2,1,1).data;return d[0]===122&&d[1]===200&&d[2]===123;}));}
  await p.context().close();
 }
 const guest=await pageAt('',false,true);await open(guest);let visitBefore=report.requests.filter(r=>r.url.includes('/visit?')).length;await guest.clock.runFor(10010);check('guest visit heartbeat continues in replay',report.requests.filter(r=>r.url.includes('/visit?')).length>visitBefore);check('Pages uses guest history',report.requests.some(r=>r.url.includes(':8443/office/api/history/2026-11-02')));await guest.context().close();
 for(const query of ['?demo=1','?wall=1']){const p=await pageAt(query);check('no history in '+query,await p.locator('#history-tab').isHidden());await p.context().close();}
 // Empty history is a useful supported state, not a failed request.
 for(const day of ['2026-11-01','2026-11-02'])await fs.rename(path.join(dir,'history',day+'.json'),path.join(dir,day+'.json'));
 const empty=await pageAt();await empty.locator('#history-tab').click();check('empty archive copy',(await empty.locator('#history-note').innerText())==='还没有往日存档，每天零点存一份');await empty.context().close();
 check('no page errors',report.errors.length===0);report.result='PASS';console.log(JSON.stringify({checks:report.checks.length,frames:report.frames.length,result:report.result}));
 }catch(e){report.result='FAIL';report.failure=e.stack;console.error(e);process.exitCode=1;}finally{await fs.writeFile(path.join(out,'batch3-browser.json'),JSON.stringify(report,null,2));await browser?.close();if(office)await new Promise(r=>office.server.close(r));if(dir)await fs.rm(dir,{recursive:true,force:true});}
})();
