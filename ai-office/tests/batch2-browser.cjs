// NODE_PATH="$(npm root -g)" node tests/batch2-browser.cjs [base-url]
// A supplied base serves current files; the HEAD baseline and live-shaped feeds remain isolated.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'tools/shots'),T=Date.parse('2026-11-02T02:00:00Z'),C=require('../office-core.js');
const assets=['index.html','office.js','office-core.js','style.css','demo-script.json','mv.js','mv-script.json'];
const baseline=Object.fromEntries(assets.map(f=>[f,execFileSync('git',['show',`HEAD:ai-office/${f}`],{cwd:root})]));
const report={checks:[],frames:[],errors:[],baseline:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()};
const check=(name,value)=>{report.checks.push({name,passed:!!value});console.log(value?'PASS':'FAIL',name);assert.ok(value,name);};
let feed={...JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/state-scene.json'))),demo:false,visitors:0,notices:[],meets:[],meetsToday:{},quota:{},scene:C.emptyScene(),events:[]};
feed.roster=JSON.parse(fs.readFileSync(path.join(root,'demo-script.json'))).roster.map(a=>({...a,status:'busy',statusSince:new Date(T).toISOString()}));feed.stats.today.meetings=1;
(async()=>{let server,browser;
 try {
 server=http.createServer((req,res)=>{const u=new URL(req.url,'http://x'),old=u.pathname.startsWith('/baseline/'),f=u.pathname.split('/').at(-1)||'index.html';if(!assets.includes(f)){res.writeHead(404);return res.end();}res.setHeader('content-type',f.endsWith('.js')?'text/javascript':f.endsWith('.json')?'application/json':f.endsWith('.css')?'text/css':'text/html');res.end(old?baseline[f]:fs.readFileSync(path.join(root,f)));}).listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));
 const local=`http://127.0.0.1:${server.address().port}`,base=(process.argv[2]||local).replace(/\/$/,'');browser=await chromium.launch({channel:'chrome',headless:true});report.browser=browser.version();
 async function pageAt(query,wide=false,prefix='',record=false){
  const viewport=wide?{width:1455,height:782}:{width:390,height:664};
  const context=await browser.newContext({viewport,deviceScaleFactor:2,...(record?{recordVideo:{dir:path.join(out,'batch2-video'),size:viewport}}:{})});const p=await context.newPage();p.on('pageerror',e=>report.errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&m.text().startsWith('frame'))report.errors.push(m.text());});
  await p.route('**/*',route=>{const u=new URL(route.request().url());if(![new URL(base).origin,local].includes(u.origin))return route.abort();if(u.pathname.endsWith('api/state'))return route.fulfill({json:feed});if(u.pathname.endsWith('/visit'))return route.fulfill({json:{ok:true}});return route.continue();});
  await p.clock.install({time:T});await p.goto((prefix?local:base)+prefix+'/'+query);await p.waitForFunction(()=>window.__PLAYTEST__?.ready,{},{polling:50,timeout:15000});if(query && !record)await p.evaluate(()=>window.__PLAYTEST__.step(0));return p;
 }
 async function shot(p,name){const state=await p.evaluate(()=>window.__PLAYTEST__.snapshot());report.frames.push({name,state});await p.screenshot({path:path.join(out,name+'.png')});return state;}
 for(const view of ['souvenir','radar'])for(const wide of [false,true]){
  const p=await pageAt('?view='+view,wide),name=view+(wide?'-landscape':''),s=await shot(p,name);console.log(name,JSON.stringify({actual:s.actualView,phase:s[view]?.phase,actor:s.actors.find(a=>a.activity===view),card:s.radarCard,food:s.food}));
  check(name+' achieved scene',s.actualView===view);check(name+' no overflow',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  check(name+' body visible',await p.evaluate(view=>{const s=window.__PLAYTEST__.snapshot(),a=s.actors.find(a=>a.activity===view),c=document.querySelector('#office').getBoundingClientRect(),v=document.querySelector('#room-viewport').getBoundingClientRect(),scale=c.width/s.logicalSize[0];return a && c.y+(a.y-43)*scale>=v.top && c.y+(a.y+18)*scale<=v.bottom;},view));
  check(name+' delivered prop',view==='radar'?s.radarCard?.n===13:s.food.some(f=>f.kind==='papers')&&s.food.some(f=>f.kind==='cloud'));
  await p.context().close();
 }
 const board=await pageAt('');await board.evaluate(()=>{window.__PLAYTEST__.step(10000);const c=document.querySelector('#office');document.querySelector('#room-viewport').scrollTop=420*c.getBoundingClientRect().width/360;});const b=await shot(board,'board-meetings');check('board count survives absent event',b.meetingBoard==='今天开过 1 次会'&&!b.events.some(e=>e.kind==='meeting'));await board.context().close();
 for(const t of [10,31.5,53.6,75.9]){
  const p=await pageAt('?mv=1&hold=1'),b=await pageAt('?mv=1&hold=1',false,'/baseline');for(const page of [p,b]){await page.setViewportSize({width:540,height:960});await page.evaluate(t=>window.__PLAYTEST__.step(t*1000),t);}check('MV exact pixels '+t,(await p.locator('#office').screenshot()).equals(await b.locator('#office').screenshot()));await p.context().close();await b.context().close();
 }
 const live=await pageAt(''),valid=structuredClone(feed);
 for(const patch of [{scene:{...C.emptyScene(),radar:{at:new Date(T).toISOString(),n:13,added:7,title:'SECRET'}}},{scene:{...C.emptyScene(),souvenir:{at:'bad'}}},{events:Array(501).fill({kind:'souvenir',at:new Date(T).toISOString()})}]){
  feed={...structuredClone(valid),...patch};feed.roster[0].name='must reject';await live.clock.runFor(10010);check('malformed feed rejected atomically',!(await live.locator('#roster').innerText()).includes('must reject'));
 }
 feed=structuredClone(valid);feed.roster[0].name='poll accepted';await live.clock.runFor(10010);check('valid real poll accepted after rejected feeds',(await live.locator('#roster').innerText()).includes('poll accepted'));await live.context().close();feed=valid;
 // Same normal entry, default renderer/DPR; no fixed-view hooks change the artwork.
 const opening=await pageAt('?demo=1',false,'',true);for(let t=0;t<=30;t++){if(t)await new Promise(r=>setTimeout(r,1000));if(t===10)await opening.locator('#today-tab').click();if(t===15)await opening.locator('#team-tab').click();if(t%5===0)await shot(opening,'batch2-opening-'+t);}const opened=await opening.evaluate(()=>window.__PLAYTEST__.snapshot());check('normal opening advances with default animation loop',opened.elapsed>=30000&&opened.elapsed<32000);check('default draw p95 budget',opened.renderP95Ms<12);const video=opening.video();await opening.context().close();await video.saveAs(path.join(out,'batch2-opening.webm'));
 for(const view of ['souvenir','radar']){const p=await pageAt('?wall=1&view='+view,true);check('wall '+view,(await shot(p,'batch2-wall-'+view)).actualView===view);await p.context().close();}
 const sub=await pageAt('?view=radar',false,'/playground/ai-office');await sub.setViewportSize({width:320,height:568});check('static Pages subpath and 320 viewport',(await shot(sub,'batch2-subpath')).actualView==='radar'&&await sub.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await sub.context().close();
 check('no page errors',report.errors.length===0);report.result='PASS';console.log(JSON.stringify({checks:report.checks.length,frames:report.frames.length,result:report.result}));
 }catch(e){report.result='FAIL';report.failure=e.stack;console.error(e);process.exitCode=1;}finally{fs.writeFileSync(path.join(out,'batch2-browser.json'),JSON.stringify(report,null,2));await browser?.close();server?.close();}
})();
