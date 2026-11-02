// NODE_PATH="$(npm root -g)" node tests/reception-browser.cjs
// Ephemeral static preview + bounded HTTP fixture; never calls the running office.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'tools/shots'),T=Date.parse('2026-11-02T02:00:00Z');
const assets=['index.html','office.js','office-core.js','style.css','demo-script.json','mv.js','mv-script.json'];
const baseline=Object.fromEntries(assets.map(f=>[f,execFileSync('git',['show',`HEAD:ai-office/${f}`],{cwd:root})]));
const report={checks:[],frames:[],errors:[],baseline:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()};
const check=(name,value)=>{report.checks.push({name,passed:!!value});console.log(value?'PASS':'FAIL',name);assert.ok(value,name);};
const feed={...JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/state-scene.json'))),guest:false,visitors:0,notices:[],meets:[],meetsToday:{}};delete feed.guest;
feed.roster=JSON.parse(fs.readFileSync(path.join(root,'demo-script.json'))).roster.map(a=>({...a,status:'idle',statusSince:new Date(T).toISOString()}));
feed.scene={meeting:null,call:null,dispatched:[],disk:null,guard:null};feed.stats.meetsTotal=0;feed.stats.today.meets=0;feed.events=[];
(async()=>{
 fs.mkdirSync(out,{recursive:true});let server,browser;
 try {
 server=http.createServer((req,res)=>{const u=new URL(req.url,'http://x'),old=u.pathname.startsWith('/baseline/');const f=u.pathname.split('/').at(-1)||'index.html';if(!assets.includes(f)){res.writeHead(404);return res.end();}res.setHeader('content-type',f.endsWith('.js')?'text/javascript':f.endsWith('.json')?'application/json':f.endsWith('.css')?'text/css':'text/html');res.end(old?baseline[f]:fs.readFileSync(path.join(root,f)));}).listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
 browser=await chromium.launch({channel:'chrome',headless:true});report.browser=browser.version();const base=`http://127.0.0.1:${server.address().port}`;
 async function pageAt(query,viewport={width:390,height:664},prefix='') {
  const context=await browser.newContext({viewport,deviceScaleFactor:2});const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==base)return route.abort();if(url.pathname.endsWith('api/state'))return route.fulfill({json:feed});if(url.pathname.endsWith('/visit'))return route.fulfill({json:{ok:true}});return route.continue();});
  await page.clock.install({time:T});await page.goto(base+prefix+'/'+query);await page.waitForFunction(()=>window.__PLAYTEST__?.ready,{},{polling:50});if(query)await page.evaluate(()=>window.__PLAYTEST__.step(0));return page;
 }
 async function shot(p,name){const state=await p.evaluate(()=>window.__PLAYTEST__.snapshot());report.frames.push({name,state});await p.screenshot({path:path.join(out,name+'.png')});return state;}
 for(const [name,vp] of [['reception',{width:390,height:664}],['reception-landscape',{width:1455,height:782}]]) {
  const p=await pageAt('?view=reception',vp);const state=await shot(p,name);check(name+' actual state',state.actualView==='reception');check(name+' hosts idle',state.reception.hosts.every(id=>state.actors.find(a=>a.id===id)?.status==='idle'));check(name+' seated in room',state.reception.venue==='meeting'&&state.reception.phase==='talking');
  check(name+' no horizontal overflow',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.close();
 }
 for(const vp of [{width:390,height:664},{width:320,height:568},{width:412,height:700}]) {
  const p=await pageAt('?demo=1',vp);await p.locator('#meet-toggle').click();
  check('four fixed menu choices '+vp.width,await p.locator('#meet-menu button').count()===4);
  check('menu visible, >=44px, outside canvas '+vp.width,await p.evaluate(()=>{const canvas=document.querySelector('#room-viewport').getBoundingClientRect();return [...document.querySelectorAll('#meet-menu button,.treat-row button')].every(b=>{const r=b.getBoundingClientRect();return r.height>=44&&r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=canvas.top&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b;});}));
  await shot(p,'reception-menu-'+vp.width);await p.locator('#meet-menu [data-kind=chat]').click();await p.evaluate(()=>window.__PLAYTEST__.step(16000));check('demo menu plays locally '+vp.width,(await p.evaluate(()=>window.__PLAYTEST__.snapshot())).reception?.kind==='chat');await p.close();
 }
 // Two independent live pages: initiating page queues immediately, observer receives on 10-second poll.
 const local=await pageAt(''),observer=await pageAt('');let requests=0;
 await local.route('**/guest/meet',async route=>{requests++;const b=route.request().postDataJSON();check('POST has only kind/tag',Object.keys(b).sort().join(',')==='kind,v'&&/^[a-f0-9]{16}$/.test(b.v));const at=new Date(T+1).toISOString();feed.meets=[{kind:b.kind,at}];feed.meetsToday[b.kind]=1;feed.stats.meetsTotal=feed.stats.today.meets=1;return route.fulfill({json:{ok:true,at}});});
 await local.locator('#meet-toggle').click();await local.locator('[data-kind=pitch]').click();await local.waitForFunction(()=>document.querySelector('#meet-note').textContent.includes('收到了'),{},{polling:50});
 await local.evaluate(()=>window.__PLAYTEST__.step(16000));check('local follows guest downstairs',await local.locator('#room-viewport').evaluate(e=>e.scrollTop>300));check('local owns reception',(await local.evaluate(()=>window.__PLAYTEST__.snapshot())).reception?.local===true);
 await observer.clock.runFor(10020);await observer.waitForFunction(()=>window.__PLAYTEST__.snapshot().meetQueue.length||window.__PLAYTEST__.snapshot().reception,{},{polling:50});await observer.evaluate(()=>window.__PLAYTEST__.step(16000));
 const ls=await local.evaluate(()=>window.__PLAYTEST__.snapshot()),os=await observer.evaluate(()=>window.__PLAYTEST__.snapshot());check('same hosts in two pages',JSON.stringify(ls.reception.hosts)===JSON.stringify(os.reception.hosts));check('observer not owner',os.reception.local===false);
 if(await observer.locator('#photo').isVisible())await observer.locator('#photo-close').click();
 for(let n=0;n<35;n++){await local.evaluate(()=>window.__PLAYTEST__.step(1000));if(await local.locator('#photo-text').textContent()==='谈完了，留张洽谈合照')break;await local.waitForTimeout(20);}
 await local.waitForFunction(()=>document.querySelector('#photo-text').textContent.includes('洽谈合照'),{},{polling:50});await local.evaluate(()=>window.__PLAYTEST__.step(5000));check('local handshake photo',await local.locator('#photo').isVisible());await shot(local,'reception-photo');fs.writeFileSync(path.join(out,'reception-keepsake.png'),Buffer.from((await local.locator('#photo-img').getAttribute('src')).split(',')[1],'base64'));
 await observer.evaluate(()=>window.__PLAYTEST__.step(35000));check('observer has no reception photo',!(await observer.locator('#photo-text').textContent()).includes('洽谈合照'));check('only one POST',requests===1);
 await local.route('**/guest/meet',route=>route.fulfill({status:429,headers:{'retry-after':'300'},json:{error:'limited'}}));await local.locator('#photo-close').click();await local.locator('#meet-toggle').click();await local.locator('[data-kind=chat]').click();await local.waitForFunction(()=>document.querySelector('#meet-note').textContent.includes('5 分钟'),{},{polling:50});await shot(local,'reception-limited');
 await local.close();await observer.close();
 const wall=await pageAt('?wall=1',{width:1455,height:782});await wall.evaluate(()=>window.__PLAYTEST__.step(16000));check('wall plays reception',!!(await wall.evaluate(()=>window.__PLAYTEST__.snapshot())).reception);check('wall hides controls/photo',!await wall.locator('#meet-toggle').isVisible()&&!await wall.locator('#photo').isVisible());await shot(wall,'reception-wall');await wall.close();
 // Invalid new fields reject the complete feed; valid data is retained.
 const valid=structuredClone(feed),bad=await pageAt('');feed.meets=[{kind:'bad',at:new Date(T).toISOString()}];feed.roster[0].name='must not apply';await bad.clock.runFor(10020);check('bad feed rejected',await bad.locator('#roster').innerText().then(t=>!t.includes('must not apply')));Object.assign(feed,valid);await bad.close();
 const queued=structuredClone(feed);feed.meets=[{kind:'chat',at:new Date(T).toISOString()},{kind:'learn',at:new Date(T+1).toISOString()}];const hidden=await pageAt('');await hidden.evaluate(()=>window.__PLAYTEST__.step(1000));await hidden.clock.fastForward(121000);await hidden.evaluate(()=>window.__PLAYTEST__.step(60000));check('background queue expires by wall clock',!(await hidden.evaluate(()=>window.__PLAYTEST__.snapshot())).reception && (await hidden.evaluate(()=>window.__PLAYTEST__.snapshot())).meetQueue.length===0);await hidden.close();Object.assign(feed,queued);
 const fresh=structuredClone(feed);feed.meets=[{kind:'chat',at:new Date(T-120001).toISOString()}];const stale=await pageAt('');await stale.evaluate(()=>window.__PLAYTEST__.step(1000));check('older than two minutes not played',!(await stale.evaluate(()=>window.__PLAYTEST__.snapshot())).reception);await stale.close();Object.assign(feed,fresh);
 for(const width of [320,390]) {const p=await pageAt('?view=games',{width,height:664});check('games view still fits all active nameplates '+width,await p.evaluate(()=>{const s=window.__PLAYTEST__.snapshot(),r=document.querySelector('#office').getBoundingClientRect(),v=document.querySelector('#room-viewport').getBoundingClientRect(),scale=r.width/360;return s.actors.filter(a=>a.game).length>=6&&s.actors.filter(a=>a.game).every(a=>{const plate=s.nameplates.find(p=>p.id===a.id);return plate&&r.y+(plate.y+plate.h)*scale<=v.bottom;});}));await p.close();}
 // Default opening: real step samples, no test-only position setters.
 const opening=await pageAt('?demo=1');for(let s=0;s<=30;s++){if(s)await opening.evaluate(()=>window.__PLAYTEST__.step(1000));if(s%5===0)await shot(opening,'reception-opening-'+String(s).padStart(2,'0'));}await opening.close();
 for(const t of [10,31.5,53.6,75.9]) {
  const p=await pageAt('?mv=1&hold=1',{width:540,height:960}),b=await pageAt('?mv=1&hold=1',{width:540,height:960},'/baseline');
  for(const page of [p,b])await page.evaluate(t=>window.__PLAYTEST__.step(t*1000),t);
  const pixels=await p.locator('#office').screenshot(),old=await b.locator('#office').screenshot();check('MV pixels unchanged '+t,pixels.equals(old));await shot(p,'reception-mv-'+t);await p.close();await b.close();
 }
 // A real-time 30s recording from the normal page, including opening the menu and the first reception.
 const recordContext=await browser.newContext({viewport:{width:390,height:664},deviceScaleFactor:2,recordVideo:{dir:path.join(out,'reception-recording'),size:{width:390,height:664}}});
 const rec=await recordContext.newPage();rec.on('pageerror',e=>report.errors.push(e.message));await rec.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 await rec.goto(base+'/?demo=1');await rec.waitForFunction(()=>window.__PLAYTEST__?.ready,{},{polling:50});
 await rec.waitForTimeout(1000);await rec.locator('#meet-toggle').click();await rec.waitForTimeout(1000);await rec.locator('#meet-menu [data-kind=learn]').click();
 for(let i=0;i<28;i++)await rec.waitForTimeout(1000);
 report.opening=await rec.evaluate(()=>window.__PLAYTEST__.snapshot());check('real-time draw callback p95 <12ms',report.opening.renderP95Ms<12);
 await rec.close();await recordContext.close();await fs.promises.rename(await rec.video().path(),path.join(out,'reception-opening.webm'));
 check('no page errors',report.errors.length===0);report.result='PASS';console.log(JSON.stringify({result:report.result,checks:report.checks.length,frames:report.frames.length,errors:report.errors,browser:report.browser}));
 }catch(e){report.result='FAIL';report.failure=e.stack;console.error(e);process.exitCode=1;}finally{fs.writeFileSync(path.join(out,'reception-browser.json'),JSON.stringify(report,null,2));await browser?.close();server?.close();}
})();
