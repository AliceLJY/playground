// NODE_PATH="$(npm root -g)" node tests/handoff-browser.cjs [base-url]
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const C=require('../office-core.js'),root=path.resolve(__dirname,'..'),out=path.join(root,'tools/shots'),report={checks:[],frames:[],errors:[]};
const T=Date.parse('2026-11-02T12:00:00Z'),since=new Date(T).toISOString();
const check=(name,value)=>{report.checks.push({name,passed:!!value});assert.ok(value,name);};
(async()=>{let browser,server;
 try{
 fs.mkdirSync(out,{recursive:true});server=require('../tools/preview.cjs').createPreview();await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const base=process.argv[2]||`http://127.0.0.1:${server.address().port}/`;browser=await chromium.launch({channel:'chrome',headless:true});report.browser=browser.version();
 let feed=structuredClone(require('./fixtures/state-scene.json'));feed={...feed,visitors:0,notices:[],events:[],meets:[],quota:{},scene:C.emptyScene()};feed.roster.forEach(a=>{a.status='busy';a.statusSince=since;});
 async function open(query,wide=false){const context=await browser.newContext({viewport:wide?{width:1455,height:782}:{width:390,height:664},deviceScaleFactor:2}),p=await context.newPage();p.on('pageerror',e=>report.errors.push(e.message));
 await p.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==new URL(base).origin)return r.abort();if(u.pathname.endsWith('api/state'))return r.fulfill({json:feed});if(u.pathname.endsWith('/visit'))return r.fulfill({json:{ok:true}});return r.continue();});
 await p.clock.install({time:T});await p.goto(new URL(query,base).href);await p.waitForFunction(()=>window.__PLAYTEST__?.ready,null,{polling:50});await p.clock.pauseAt(await p.evaluate(()=>Date.now()+30));if(query.includes('demo=1'))await p.evaluate(()=>window.__PLAYTEST__.step(0));return p;}
 async function shot(p,name){const s=await p.evaluate(()=>window.__PLAYTEST__.snapshot());report.frames.push({name,state:s});await p.screenshot({path:path.join(out,name+'.png')});check(name+' no overflow',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));return s;}
 for(const wide of [false,true])for(const view of ['handoff-walk','booth']){
 const p=await open('?demo=1&view='+view,wide),name=view+(wide?'-landscape':''),s=await shot(p,name);check(name+' actual state',s.actualView===view);
 if(view==='handoff-walk'){
  check(name+' no call or flight',!s.flights.length&&!s.actors.some(a=>a.activity==='call'));check(name+' real speech',s.handoffSpeech.some(b=>b.text==='这个交给你'));
  check(name+' drawer status',(await p.locator('#roster').innerText()).includes('递活中'));
  check(name+' bodies and speech visible',await p.evaluate(()=>{const s=window.__PLAYTEST__.snapshot(),c=document.querySelector('#office').getBoundingClientRect(),v=document.querySelector('#room-viewport').getBoundingClientRect(),k=c.width/s.logicalSize[0];return s.actors.filter(a=>a.activity==='handoff-walk'||a.activity==='handoff-receive').every(a=>c.y+(a.y-62)*k>=v.top&&c.y+(a.y+18)*k<=v.bottom);}));
 }else{check(name+' absent Muse',s.scene.call.kind==='dispatch'&&s.actors.some(a=>a.id===s.scene.call.with&&a.status==='away'));check(name+' drawer status',(await p.locator('#roster').innerText()).includes('通话中'));}
 await p.context().close();}
 for(const query of ['?wall=1&demo=1&view=handoff-walk','?wall=1&demo=1&view=booth']){const p=await open(query,true),s=await shot(p,'handoff-wall-'+(query.includes('booth')?'booth':'walk'));check(query+' state',query.includes('booth')?s.actualView==='booth':s.actualView==='handoff-walk');await p.context().close();}
 // A real-shaped guest poll, including repeated 10-second snapshots, uses the same handoff engine.
 feed.guest=true;const p=await open('');check('guest feed accepted',!(await p.evaluate(()=>window.__PLAYTEST__.snapshot())).demo);
 feed.scene={...C.emptyScene(),call:{kind:'dispatch',with:'codex',since},dispatched:['codex']};await p.clock.runFor(10000);await p.waitForFunction(()=>window.__PLAYTEST__.snapshot().scene.call?.kind==='dispatch',null,{polling:50});await p.clock.runFor(3400);let s=await shot(p,'handoff-guest');check('guest walks',!!s.handoffWalk&&!s.flights.length);
 await p.clock.runFor(30000);s=await p.evaluate(()=>window.__PLAYTEST__.snapshot());check('guest repeated poll cannot replay',!s.handoffWalk&&!s.flights.length&&s.actors.find(a=>a.id==='cc').activity===null);await p.context().close();
 const sub=await open('/playground/ai-office/?demo=1&view=handoff-walk');check('Pages subpath',(await shot(sub,'handoff-subpath')).actualView==='handoff-walk');await sub.context().close();
 check('no page errors',!report.errors.length);report.result='PASS';
 }catch(e){report.result='FAIL';report.failure=e.stack;process.exitCode=1;console.error(e);}finally{fs.writeFileSync(path.join(out,'handoff-browser.json'),JSON.stringify(report,null,2));await browser?.close();server?.close();console.log(report.result,report.checks.length,'checks');}
})();
