// NODE_PATH="$(npm root -g)" node tests/events-browser.cjs
// Isolated preview, no requests to the live office. Baseline comes from the local HEAD.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'tools/shots'),T=Date.parse('2026-11-02T02:00:00Z');
const assets=['index.html','office.js','office-core.js','style.css','demo-script.json','mv.js','mv-script.json'];
const baseline=Object.fromEntries(assets.map(f=>[f,execFileSync('git',['show',`HEAD:ai-office/${f}`],{cwd:root})]));
const report={checks:[],frames:[],errors:[],baseline:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()};
const check=(name,value)=>{report.checks.push({name,passed:!!value});console.log(value?'PASS':'FAIL',name);assert.ok(value,name);};
let feed={...JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/state-scene.json'))),demo:false,visitors:0,notices:[],meets:[],meetsToday:{},quota:{}};
feed.roster=JSON.parse(fs.readFileSync(path.join(root,'demo-script.json'))).roster.map(a=>({...a,status:'idle',statusSince:new Date(T).toISOString()}));
feed.scene={meeting:null,call:null,dispatched:[],disk:null,guard:null};feed.events=[];
(async()=>{let server,browser;
 try{
 server=http.createServer((req,res)=>{const u=new URL(req.url,'http://x'),old=u.pathname.startsWith('/baseline/'),f=u.pathname.split('/').at(-1)||'index.html';if(!assets.includes(f)){res.writeHead(404);return res.end();}res.setHeader('content-type',f.endsWith('.js')?'text/javascript':f.endsWith('.json')?'application/json':f.endsWith('.css')?'text/css':'text/html');res.end(old?baseline[f]:fs.readFileSync(path.join(root,f)));}).listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
 browser=await chromium.launch({channel:'chrome',headless:true});report.browser=browser.version();const base=`http://127.0.0.1:${server.address().port}`;
 async function pageAt(query,viewport={width:390,height:664},prefix=''){
  const context=await browser.newContext({viewport,deviceScaleFactor:2});const p=await context.newPage();p.on('pageerror',e=>report.errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&m.text().startsWith('frame'))report.errors.push(m.text());});
  await p.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==base)return route.abort();if(u.pathname.endsWith('api/state'))return route.fulfill({json:feed});if(u.pathname.endsWith('/visit'))return route.fulfill({json:{ok:true}});return route.continue();});
  await p.clock.install({time:T});await p.goto(base+prefix+'/'+query);await p.waitForFunction(()=>window.__PLAYTEST__?.ready,{},{polling:50,timeout:15000});if(query)await p.evaluate(()=>window.__PLAYTEST__.step(0));return p;
 }
 async function shot(p,name){const state=await p.evaluate(()=>window.__PLAYTEST__.snapshot());report.frames.push({name,state});await p.screenshot({path:path.join(out,name+'.png')});return state;}
 for(const view of ['argue','snack','melon','quota','supper'])for(const wide of [false,true]){
  const name=view+(wide?'-landscape':''),p=await pageAt('?view='+view,wide?{width:1455,height:782}:{width:390,height:664});const state=await shot(p,name);
  console.log(name,JSON.stringify({actual:state.actualView,phase:state[view]?.phase,ids:state[view]?.ids,actors:state.actors.filter(a=>a.activity===view).map(a=>({id:a.id,x:a.x,y:a.y,moving:a.moving}))}));
  check(name+' actual event',state.actualView===view);check(name+' no overflow',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  check(name+' event bodies visible',await p.evaluate(view=>{const s=window.__PLAYTEST__.snapshot(),c=document.querySelector('#office').getBoundingClientRect(),v=document.querySelector('#room-viewport').getBoundingClientRect(),scale=c.width/s.logicalSize[0],actors=view==='supper'?[s.guard]:s.actors.filter(a=>a.activity===view);return actors.length>0&&actors.every(a=>c.y+(a.y-44)*scale>=v.top&&c.y+(a.y+18)*scale<=v.bottom);},view));
  if(['snack','supper'].includes(view))check(name+' food delivered',state.food.some(f=>f.kind===(view==='snack'?'biscuit':'noodles')));
  if(view==='argue'){const ids=state.argue.ids,actors=state.actors.filter(a=>ids.includes(a.id));check(name+' one cloud/two hidden people',Math.hypot(actors[0].x-actors[1].x,actors[0].y-actors[1].y)<.1&&!state.nameplates.some(p=>ids.includes(p.id)));}
  if(view==='quota'){await p.locator('#team-tab').click();check(name+' drawer quota status',(await p.locator('#roster').innerText()).includes('额度用完 · 罚站中'));}
  await p.context().close();
 }
 for(const view of ['argue','snack','melon','quota','supper']){const p=await pageAt('?wall=1&view='+view,{width:1455,height:782}),s=await shot(p,'events-wall-'+view);check('wall '+view,s.actualView===view);check('wall hides photo',!await p.locator('#photo').isVisible());await p.context().close();}
 for(const t of [10,31.5,53.6,75.9]){
  const p=await pageAt('?mv=1&hold=1',{width:540,height:960}),b=await pageAt('?mv=1&hold=1',{width:540,height:960},'/baseline');
  for(const page of [p,b])await page.evaluate(t=>window.__PLAYTEST__.step(t*1000),t);
  check('MV exact pixels '+t,(await p.locator('#office').screenshot()).equals(await b.locator('#office').screenshot()));await p.context().close();await b.context().close();
 }
 // Full feed validation is shared with the core; test it through an actual HTTP poll too.
 const p=await pageAt('');const valid=structuredClone(feed);
 for(const patch of [{quota:{artist:'bad'}},{scene:{...feed.scene,snack:{id:'artist',at:new Date(T).toISOString(),task:'must reject'}}},{scene:{...feed.scene,supper:{ids:['nope'],at:new Date(T).toISOString()}}}]){
  feed={...structuredClone(valid),...patch};feed.roster[0].name='must reject';await p.clock.runFor(10010);check('bad new snapshot rejects whole feed',!(await p.locator('#roster').innerText()).includes('must reject'));feed=structuredClone(valid);await p.clock.runFor(10010);
 }
 await p.context().close();feed=valid;
 const live=await pageAt('');feed={...valid,quota:{artist:new Date(T+MINS(60)).toISOString()}};await live.clock.runFor(10010);await live.evaluate(()=>window.__PLAYTEST__.step(15000));check('real poll applies quota',(await live.evaluate(()=>window.__PLAYTEST__.snapshot())).actors.find(a=>a.id==='artist').activity==='quota');await live.context().close();feed=valid;
 const opening=await pageAt('?demo=1');for(let t=0;t<=30;t++){if(t)await opening.evaluate(()=>window.__PLAYTEST__.step(1000));if(t%5===0)await shot(opening,'events-opening-'+String(t).padStart(2,'0'));}await opening.context().close();
 const sub=await pageAt('?view=snack',{width:320,height:568},'/playground/ai-office');check('static subpath works',(await shot(sub,'events-subpath')).actualView==='snack');await sub.context().close();
 check('no page errors',report.errors.length===0);report.result='PASS';console.log(JSON.stringify({checks:report.checks.length,frames:report.frames.length,result:report.result}));
 }catch(e){report.result='FAIL';report.failure=e.stack;console.error(e);process.exitCode=1;}finally{fs.writeFileSync(path.join(out,'events-browser.json'),JSON.stringify(report,null,2));await browser?.close();server?.close();}
})();
function MINS(n){return n*60000;}
