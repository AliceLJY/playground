// NODE_PATH="$(npm root -g)" node tools/browser-check.cjs [http://127.0.0.1:3191/]
// Start tools/preview.cjs first. No real office writes, browser downloads, or dependencies.
const {chromium}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const fixture=require('../tests/fixtures/state-scene.json');
const base=process.argv[2]||'http://127.0.0.1:3191/',root=path.resolve(__dirname,'..'),out=path.join(__dirname,'shots');
const report={checkedAt:new Date().toISOString(),base,checks:[],runs:[]};
const check=(name,passed,details)=>{report.checks.push({name,passed:!!passed,details});assert.ok(passed,name+': '+JSON.stringify(details));};
let browser,staticServer;
(async()=>{
  await fs.mkdir(out,{recursive:true});
  browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome',args:['--use-gl=angle','--use-angle=metal']}:{})});report.browser=browser.version();
  async function open(query,viewport={width:1280,height:1000},clock=true,prepare){
    const url=new URL(query,base).href,origin=new URL(url).origin;
    const context=await browser.newContext({viewport,deviceScaleFactor:2,hasTouch:viewport.width<701,isMobile:viewport.width<701});
    const page=await context.newPage(),errors=[],external=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&m.text().startsWith('frame'))errors.push(m.text());});
    // Missing API acceptance may attempt the documented public GET; block it and every other external request.
    await page.route('https://**/*',route=>{const u=new URL(route.request().url());if(!(u.hostname==='mac-mini.tail791fb9.ts.net'&&u.pathname==='/office/api/state'&&route.request().method()==='GET'))external.push(u.origin+u.pathname);return route.abort();});
    page.on('request',req=>{if(!req.url().startsWith(origin)&&!req.url().startsWith('data:')&&!req.url().startsWith('https:'))external.push(req.url());});
    if(clock)await page.clock.install({time:new Date('2026-11-01T07:30:00Z')});
    if(prepare)await prepare(page);
    await page.goto(url);await page.waitForFunction(()=>window.__PLAYTEST__?.ready,null,{polling:100,timeout:20000});
    return {context,page,errors,external};
  }
  async function save(run,name,actual){
    const snapshot=await run.page.evaluate(()=>window.__PLAYTEST__.snapshot());
    const layout=await run.page.evaluate(()=>{
      const box=e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,bottom:b.bottom,right:b.right};};
      const c=document.querySelector('#office'),p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let ink=0,total=0;
      for(let i=3;i<p.length;i+=4*41){total++;if(p[i]>100)ink++;}
      return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,canvas:box(c),canvasPixels:[c.width,c.height],room:box(document.querySelector('#room-viewport')),drawer:box(document.querySelector('#drawer')),banner:document.querySelector('#mode').textContent,ink:ink/total};
    });
    check(name+' no page errors',!run.errors.length,run.errors);check(name+' no external side effects',!run.external.length,run.external);
    check(name+' canvas painted',layout.ink>.8,layout.ink);check(name+' no horizontal overflow',layout.scrollWidth<=layout.width,layout);
    if(!snapshot.mv&&!name.startsWith('wall'))check(name+' drawer inside viewport',layout.drawer.x>=0&&layout.drawer.right<=layout.width+.5&&layout.drawer.bottom<=layout.height+.5,layout.drawer);
    if(actual)check(name+' actual state',snapshot.actualView===actual,snapshot.actualView);
    await run.page.screenshot({path:path.join(out,name+'.png')});report.runs.push({name,snapshot,layout});return snapshot;
  }
  for(const name of ['hero','queue','notice','meeting','booth','handoff','board','night-guard','games']){
    const run=await open(`?demo=1&view=${name}`),s=await save(run,name,name);
    check(name+' labelled demo',s.demo&&s.stats?.visitorsTotal===137&&await run.page.locator('#mode').textContent().then(x=>x.includes('演示')));
    if(name==='meeting'){check('meeting seated and two listeners',s.actors.filter(a=>a.activity==='meeting').length===3&&s.visitors.filter(v=>v.listening).length===2);check('second slide visible',s.scene.meeting.round===2);check('meeting caption visible',await run.page.locator('#room-caption').textContent()==='楼下在开会');check('meeting sign is lit',s.meetingSign && await run.page.evaluate(()=>[...document.querySelector('#office').getContext('2d').getImageData(277*2,401*2,1,1).data].join()==='239,198,108,255'));await run.page.evaluate(()=>document.querySelector('#room-viewport').scrollTop=0);await save(run,'meeting-main');await run.page.locator('#pose').click();await run.page.evaluate(()=>window.__PLAYTEST__.step(300));check('greeting overrides meeting caption',await run.page.locator('#room-caption').textContent().then(x=>x.includes('打了个招呼')));}
    if(name==='games'){check('six real idle colleagues play',s.actors.filter(a=>a.game).length===6&&s.actors.filter(a=>a.game).every(a=>a.status==='idle'));check('tennis pair plays in games view',s.actors.filter(a=>a.game==='pingpong').length===2&&s.pingPongBall?.size>=2);check('no meeting means no lit sign',!s.meetingSign && await run.page.evaluate(()=>[...document.querySelector('#office').getContext('2d').getImageData(277*2,401*2,1,1).data].join()!=='239,198,108,255'));}
    if(name==='booth')check('booth CC at target',s.actors.some(a=>a.activity==='call'&&a.x===296&&a.y===560));
    if(name==='handoff')check('folder is mid-flight',s.flights.length===1&&s.flights[0].progress>.4&&s.flights[0].progress<.6);
    if(name==='board'){check('today drawer visible',await run.page.locator('#today').isVisible());check('reverse chronological fixed templates',await run.page.locator('#events li').first().textContent().then(x=>x.includes('第 2 轮')));}
    if(name==='night-guard'){check('night guard moving',s.light==='night'&&s.guard?.moving);await run.page.evaluate(()=>document.querySelector('#room-viewport').scrollTop=600);await save(run,'night-guard-annex');}
    await run.context.close();
  }
  // The fixture is served unchanged, not injected through a simulation shortcut.
  const live=await open('?view=hero');await live.page.evaluate(()=>window.__PLAYTEST__.step(35000));await live.page.evaluate(()=>document.querySelector('#room-viewport').scrollTop=600);
  const l=await save(live,'live-fixture','meeting');check('unchanged fixture live',!l.demo&&l.scene.disk.usedPct===93&&l.stats.visitorsTotal===137&&l.actors.some(a=>a.id==='cc'));
  check('guest has Today, no notice tab',await live.page.locator('#today-tab').isVisible()&&await live.page.locator('#board-tab').isHidden());
  await live.page.locator('#today-tab').click();await save(live,'live-fixture-today');
  check('fixture event count',await live.page.locator('#events li').count()===fixture.events.length);
  await live.context.close();
  for(const width of [390,320]){
    const run=await open('?demo=1&view=meeting',{width,height:width===390?664:568});await save(run,'mobile-'+width+'-meeting','meeting');
    const readable=await run.page.evaluate(()=>document.querySelector('#office').getBoundingClientRect().width/360*8);check('mobile projection type >=6 CSS pixels '+width,readable>=6,readable);
    for(const id of ['team-tab','board-tab','today-tab','drawer-toggle']){const hit=await run.page.locator('#'+id).evaluate(el=>{const b=el.getBoundingClientRect();return b.height>=44&&b.y>=0&&b.bottom<=innerHeight&&el.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));});check(width+' reachable '+id,hit);}
    await run.page.locator('#today-tab').click();await save(run,'mobile-'+width+'-today');
    await run.page.locator('#team-tab').click();for(const row of await run.page.locator('.member').all()){await row.scrollIntoViewIfNeeded();check(width+' roster row reachable',await row.evaluate(el=>{const b=el.getBoundingClientRect();return b.y>=0&&b.bottom<=innerHeight&&el.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));}));}
    await run.context.close();
  }
  for(const width of [390,320]) {
    const run=await open('?view=games',{width,height:width===390?664:568});await save(run,'games-mobile-'+width,'games');await save(run,'mobile-'+width,'games');
    const visible=await run.page.evaluate(()=>{const c=document.querySelector('#office').getBoundingClientRect(),v=document.querySelector('#room-viewport'),b=v.getBoundingClientRect();return {scroll:v.scrollTop,top:c.y+240*c.width/360,bottom:c.y+344*c.width/360,left:c.x+20*c.width/360,right:c.x+192*c.width/360,clipBottom:b.bottom,clipTop:b.top,width:innerWidth};});
    check('games visible without scrolling '+width,visible.scroll===0&&visible.top>=visible.clipTop&&visible.bottom<=visible.clipBottom&&visible.left>=0&&visible.right<=visible.width,visible);
    const regions=[[27,266,14,8],[27,275,18,9],[88,284,20,16],[84,288,30,7],[140,278,30,34],[158,266,12,14],[158,309,12,14]];
    const sample=()=>run.page.evaluate(regions=>regions.map(([x,y,w,h])=>Array.from(document.querySelector('#office').getContext('2d').getImageData(x*2,y*2,w*2,h*2).data)),regions);
    const first=await sample(),diff=regions.map(()=>0);
    for(let i=0;i<12;i++){await run.page.evaluate(()=>window.__PLAYTEST__.step(250));const next=await sample();next.forEach((pixels,j)=>{diff[j]=Math.max(diff[j],pixels.filter((v,k)=>v!==first[j][k]).length);});}
    check('arcade chess tennis ball and both bats animate '+width,diff.every(n=>n>=16),diff);await save(run,'games-motion-'+width,'games');await run.context.close();
  }
  for(const meeting of [false,true]) {
    const run=await open('?view=hero',undefined,true,page=>page.route('**/api/state',route=>{
      const d=structuredClone(fixture);d.roster=Array.from({length:11},(_,desk)=>({...fixture.roster[0],id:desk?'a'+desk:'cc',name:desk?'AI '+desk:'CC',desk,status:'idle'}));d.visitors=0;d.notices=[];d.treats=[];d.events=[];d.scene={meeting:meeting?{...fixture.scene.meeting,members:d.roster.map(a=>a.id)}:null,call:null,dispatched:[],disk:null,guard:null};d.stats.notesTotal=37;return route.fulfill({json:d});
    }));
    await run.page.evaluate(()=>window.__PLAYTEST__.step(35000));
    if(meeting)await run.page.evaluate(()=>document.querySelector('#room-viewport').scrollTop=600);
    const s=await save(run,meeting?'meeting-overflow':'games-overflow');
    check('eleven actors use separate places '+meeting,new Set(s.actors.map(a=>a.x+','+a.y)).size===11);
    if(meeting)check('four seated, CC and six standing',s.actors.filter(a=>a.activity==='meeting'&&!a.standing).length===4&&s.actors.filter(a=>a.standing).length===7);
    else check('overflow uses two spectators and both game pairs',s.actors.filter(a=>a.game==='watch').length===2&&s.actors.filter(a=>a.game==='pingpong').length===2&&s.actors.filter(a=>a.game==='chess').length===2);
    check('c216e84 visitor total remains visible '+meeting,await run.page.locator('#guestbook').textContent().then(x=>x.includes('137')));
    await run.page.locator('#today-tab').click();check('000c40b paper count retained '+meeting,await run.page.locator('#totals').textContent().then(x=>x.includes('纸条 37')));
    await run.context.close();
  }
  // Observe actual Canvas calls and pixels, rather than asserting only desk constants.
  for(const treat of [false,true]){
    const run=await open('?view=hero',undefined,true,async page=>{
      await page.addInitScript(()=>{window.deskText=[];const original=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(value,x,y,...rest){if(value==='Dots')window.deskText.push({x,y});return original.call(this,value,x,y,...rest);};});
      await page.route('**/api/state',route=>{const d=structuredClone(fixture);d.roster.forEach(a=>a.status='busy');d.visitors=0;d.notices=[];d.events=[];d.treats=treat?[{kind:'milktea',at:d.updatedAt}]:[];const dots=d.roster.find(a=>a.desk===9);d.scene={meeting:null,call:null,dispatched:treat?[]:[dots.id],disk:null,guard:null};return route.fulfill({json:d});});
    });
    await run.page.evaluate(()=>window.__PLAYTEST__.step(35000));const s=await save(run,treat?'dots-milktea':'dots-folder');
    check('busy Dots at moved desk '+treat,s.actors.some(a=>a.x===229&&a.y===296&&a.status==='busy'));
    check('Dots nameplate rendered only at new desk '+treat,await run.page.evaluate(()=>window.deskText.length>0&&window.deskText.every(p=>p.x===229&&p.y===310)));
    const pixel=await run.page.evaluate(([x,y])=>Array.from(document.querySelector('#office').getContext('2d').getImageData(x*2,y*2,1,1).data),treat?[247,264]:[246,270]);
    check(treat?'milktea straw on moved desk':'folder on moved desk',pixel.join()===(treat?'200,91,74,255':'239,198,108,255'),pixel);
    if(treat)check('actual treat arrived',s.deskTreat?.kind==='milktea');await run.context.close();
  }
  for(const n of [1,2,3]){
    const run=await open('?view=hero',undefined,true,page=>page.route('**/api/state',route=>{const d=structuredClone(fixture);d.roster.forEach((a,i)=>a.status=i<n?'idle':'busy');d.visitors=0;d.notices=[];d.events=[];d.treats=[];d.scene={meeting:null,call:null,dispatched:[],disk:null,guard:null};return route.fulfill({json:d});}));
    await run.page.evaluate(()=>window.__PLAYTEST__.step(15000));const ballPositions=[];
    for(let i=0;i<16;i++){
      const s=await run.page.evaluate(()=>window.__PLAYTEST__.step(100));const b=s.pingPongBall;
      if(n===1)check('single idle never plays tennis '+i,b===null&&s.actors.filter(a=>a.game==='pingpong').length===0);
      else {check('paired tennis ball exists '+n+'/'+i,b&&s.actors.filter(a=>a.game==='pingpong').length===2);ballPositions.push(b.y);
        const solid=await run.page.evaluate(b=>{const pixels=document.querySelector('#office').getContext('2d').getImageData(b.x*2,b.y*2,b.size*2,b.size*2).data;return Array.from(pixels).every((v,i)=>v===[255,244,213,255][i%4]);},b);check('actual 3x3 tennis ball pixels '+n+'/'+i,b.size===3&&solid);
      }
      if(n===3)check('third idle uses arcade, no solo chess '+i,s.actors.filter(a=>a.game==='arcade').length===1&&s.actors.every(a=>a.game!=='chess'));
    }
    if(n>1)check('ball pixels travel '+n,Math.max(...ballPositions)-Math.min(...ballPositions)>=25,ballPositions);
    await save(run,'games-'+n+'-idle');await run.context.close();
  }
  // Main-room artwork outside the two intentional edits must match da99a72 byte for byte.
  // Identical busy-only feed avoids treating the requested idle routing changes as artwork regressions.
  const originals=new Map(['index.html','office.js','office-core.js','style.css'].map(file=>[file,execFileSync('git',['show',`da99a72:ai-office/${file}`],{cwd:root,encoding:'utf8'})]));
  const originalPage=async page=>{for(const [file,body]of originals)await page.route('**/'+file,route=>route.fulfill({body,contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'}));await page.route(new URL(base).href+'?*',route=>route.fulfill({body:originals.get('index.html'),contentType:'text/html'}));};
  const stableFeed=async page=>page.route('**/demo-script.json',route=>{const d=structuredClone(require('../demo-script.json'));d.roster.forEach(a=>a.status='busy');d.events=[];d.scene={meeting:null,dispatched:[],call:null,disk:null,guard:null};return route.fulfill({json:d});});
  const pixels=page=>page.evaluate(()=>Array.from(document.querySelector('#office').getContext('2d').getImageData(0,0,720,840).data));
  const before=await open('?demo=1&view=hero',undefined,true,async page=>{await originalPage(page);await stableFeed(page);}),after=await open('?demo=1&view=hero',undefined,true,stableFeed);
  const rawBefore=await pixels(before.page),rawAfter=await pixels(after.page),rectangles=[[20,240,192,346],[198,252,260,314]];let different=0,inside=0;
  for(let i=0;i<rawBefore.length;i++)if(rawBefore[i]!==rawAfter[i]){const x=Math.floor(i/4)%720/2,y=Math.floor(i/4/720)/2;if(rectangles.some(([l,t,r,b])=>x>=l&&x<r&&y>=t&&y<b))inside++;else different++;}
  check('da99a72 main room RGBA identical outside repair rectangles',different===0&&inside>0,{different,inside,rectangles});
  await before.page.screenshot({path:path.join(out,'room-before.png')});await after.page.screenshot({path:path.join(out,'room-after.png')});await before.context.close();await after.context.close();
  // Identical readback/capture steps on both sides: repeated getImageData can change Canvas rasterization.
  const mvTimes=[10,31.5,53.6,75.9],mvFrames=[];
  const mvBefore=await open('?mv=1&hold=1',{width:540,height:960},true,originalPage);let mvAt=0;
  for(const t of mvTimes){await mvBefore.page.evaluate(ms=>window.__PLAYTEST__.step(ms),(t-mvAt)*1000);mvAt=t;await save(mvBefore,`mv-reference-${t}`);const png=await mvBefore.page.locator('#office').screenshot();mvFrames.push(png);await fs.writeFile(path.join(out,t===10?'mv-before.png':`mv-before-${t}.png`),png);}await mvBefore.context.close();
  const mv=await open('?mv=1&hold=1',{width:540,height:960});mvAt=0;
  for(const [i,t] of mvTimes.entries()){await mv.page.evaluate(ms=>window.__PLAYTEST__.step(ms),(t-mvAt)*1000);mvAt=t;const m=await save(mv,t===10?'mv-hold':`mv-hold-${t}`);check('MV keeps original frame '+t,!!m.mv&&m.scene.meeting===null);check('MV exact screenshot matches da99a72 at '+t,mvFrames[i].equals(await mv.page.locator('#office').screenshot()));}await mv.context.close();
  const wall=await open('?wall=1',{width:1440,height:900});await wall.page.evaluate(()=>window.__PLAYTEST__.step(35000));await save(wall,'wall');check('wall hides photo and controls',await wall.page.locator('#treat').isHidden()&&await wall.page.locator('#photo').isHidden());await wall.context.close();
  // Normal entrance, genuine UI actions and 30 seconds of default movement.
  const run=await open('?demo=1',{width:390,height:664});const phases=new Set();let moved=0,previous;
  for(let second=0;second<=30;second++){
    if(second)await run.page.clock.runFor(1000);
    const s=await run.page.evaluate(()=>window.__PLAYTEST__.snapshot());
    if(previous&&s.actors.some((a,i)=>Math.hypot(a.x-previous[i].x,a.y-previous[i].y)>.1))moved++;previous=s.actors;s.actors.forEach(a=>phases.add(a.status));
    await run.page.screenshot({path:path.join(out,`opening-${String(second).padStart(2,'0')}.png`)});
  }
  check('30s real default movement',moved>12,{moved,phases:[...phases]});check('default status variety',['busy','done','waiting','away'].every(x=>phases.has(x)));
  check('default day has no guard',(await run.page.evaluate(()=>window.__PLAYTEST__.snapshot())).guard===null);
  await save(run,'default');await run.page.locator('#pose').click();await run.page.clock.runFor(1800);
  await run.page.waitForFunction(()=>document.querySelector('#photo-img').naturalWidth>0,null,{polling:100});
  check('photo includes annex',await run.page.locator('#photo-img').evaluate(e=>e.naturalWidth===720&&e.naturalHeight===1570));
  await run.page.clock.runFor(1500);await save(run,'photo');check('photo card fully visible',await run.page.locator('#photo').evaluate(el=>{const b=el.getBoundingClientRect(),room=document.querySelector('#room-viewport').getBoundingClientRect();return b.top>=room.top&&b.bottom<=room.bottom&&el.contains(document.elementFromPoint(b.x+b.width/2,b.y+2));}));check('photo card shown',await run.page.locator('#photo').isVisible());await run.page.locator('#photo-close').click();
  await run.page.locator('#treat-toggle').click();check('treat menu works',await run.page.locator('#treat-menu').isVisible());await run.context.close();
  // Incoming snapshot corruption must leave the current good scene intact on the first missed poll.
  const gift=await open('',{width:390,height:664},true,async page=>{
    await page.route('**/api/state',route=>route.fulfill({json:{...fixture,notices:[{at:fixture.updatedAt,text:'PRIVATE-NOTICE-CANARY'}]}}));
    await page.route('**/treat',route=>route.fulfill({json:{at:'2026-11-01T07:30:01Z',ok:true}}));
  });
  check('guest notice never reaches DOM or sim',!(await gift.page.content()).includes('PRIVATE-NOTICE-CANARY')&&(await gift.page.evaluate(()=>window.__PLAYTEST__.snapshot())).notices===0);
  await gift.page.locator('#treat-toggle').click();await gift.page.locator('[data-kind="coffee"]').click();await gift.page.waitForFunction(()=>document.querySelector('#treat-note').textContent.includes('送出去了'),null,{polling:100});
  await gift.page.evaluate(()=>window.__PLAYTEST__.step(1000));check('carrier caption overrides meeting',await gift.page.locator('#room-caption').textContent().then(x=>x.includes('来探班')));
  let thanked=false;for(let i=0;i<80;i++){const s=await gift.page.evaluate(()=>window.__PLAYTEST__.step(500));if(s.thanks){thanked=true;break;}}check('thanks caption overrides meeting',thanked&&await gift.page.locator('#room-caption').textContent().then(x=>x.includes('说谢谢')));
  await gift.page.evaluate(()=>window.__PLAYTEST__.step(25000));check('UI treat delivered through preview stub',(await gift.page.evaluate(()=>window.__PLAYTEST__.snapshot())).deskTreat?.kind==='coffee');await save(gift,'guest-treat');await gift.context.close();
  const corrupt=await open('',undefined,true,async page=>{let polls=0;await page.route('**/api/state',route=>{if(route.request().url().startsWith('https:'))return route.abort();const d=structuredClone(fixture);if(++polls>1)d.scene.dispatched=['unknown'];return route.fulfill({json:d});});});
  await corrupt.page.clock.runFor(11000);const stable=await corrupt.page.evaluate(()=>window.__PLAYTEST__.snapshot());check('reject entire malformed poll',!stable.demo&&stable.scene.dispatched.join()===fixture.scene.dispatched.join());await corrupt.context.close();
  const legacy=await open('',undefined,true,page=>page.route('**/api/state',route=>{const d=structuredClone(fixture);delete d.scene;delete d.stats;delete d.events;return route.fulfill({json:d});}));
  await legacy.page.evaluate(()=>window.__PLAYTEST__.step(15000));const old=await save(legacy,'legacy-empty');check('old server has empty annex',!old.demo&&!old.scene.meeting&&!old.scene.call&&!old.guard&&!old.diskLayers&&old.stats===null&&!old.events.length);await legacy.context.close();
  const guard=await open('',undefined,true,page=>page.route('**/api/state',route=>{const d=structuredClone(fixture);d.scene.guard.ok=false;return route.fulfill({json:d});}));
  await guard.page.clock.setSystemTime(new Date('2026-11-01T15:00:00Z'));await guard.page.evaluate(()=>window.__PLAYTEST__.step(1000));const fail=await save(guard,'guard-failed');check('failed backup visible at night',fail.guard&&fail.scene.guard.ok===false);check('red lamp survives actor drawing',await guard.page.evaluate(()=>[...document.querySelector('#office').getContext('2d').getImageData(324*2,377*2,1,1).data].join()==='217,86,77,255'));await guard.context.close();
  const green=await open('');await green.page.clock.setSystemTime(new Date('2026-11-01T15:00:00Z'));await green.page.evaluate(()=>window.__PLAYTEST__.step(1000));check('green lamp survives actor drawing',await green.page.evaluate(()=>[...document.querySelector('#office').getContext('2d').getImageData(324*2,377*2,1,1).data].join()==='103,183,121,255'));await save(green,'guard-done');await green.context.close();
  const real=await open('?demo=1',undefined,false);await real.page.waitForTimeout(2500);const perf=await save(real,'default-real-clock');check('render callback p95 under 12ms',perf.renderP95Ms>0&&perf.renderP95Ms<12,perf.renderP95Ms);
  report.renderer=await real.page.evaluate(()=>{const g=document.createElement('canvas').getContext('webgl'),e=g?.getExtension('WEBGL_debug_renderer_info');return e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):'unavailable (office uses Canvas 2D)';});await real.context.close();
  // The actual static asset set at a Pages-style prefix, with both APIs unavailable.
  const assets=new Map([['index.html','text/html'],['office.js','text/javascript'],['office-core.js','text/javascript'],['style.css','text/css'],['demo-script.json','application/json'],['mv.js','text/javascript'],['mv-script.json','application/json']]);
  staticServer=http.createServer(async(req,res)=>{const file=new URL(req.url,'http://localhost').pathname.replace(/^\/playground\/ai-office\//,'')||'index.html';if(!assets.has(file)){res.writeHead(404);res.end();return;}res.setHeader('content-type',assets.get(file));res.end(await fs.readFile(path.join(root,file)));});
  await new Promise(resolve=>staticServer.listen(0,'127.0.0.1',resolve));
  const fallback=await open(`http://127.0.0.1:${staticServer.address().port}/playground/ai-office/`,{width:390,height:664});const f=await save(fallback,'static-fallback');check('missing API labelled demo',f.demo&&await fallback.page.locator('#mode').textContent().then(x=>x.includes('演示模式 · 模拟数据')));await fallback.context.close();
  // Every opening sample is visible in these two full-frame contact sheets.
  for(const first of [0,16]){
    const frames=[];for(let i=first;i<Math.min(31,first+16);i++)frames.push({name:`${i}s`,url:'data:image/png;base64,'+(await fs.readFile(path.join(out,`opening-${String(i).padStart(2,'0')}.png`))).toString('base64')});
    const p=await browser.newPage();const data=await p.evaluate(async frames=>{const c=document.createElement('canvas');c.width=1170;c.height=2040;const g=c.getContext('2d');g.fillStyle='#eee9dd';g.fillRect(0,0,c.width,c.height);for(let j=0;j<frames.length;j++){const im=new Image();im.src=frames[j].url;await im.decode();const x=j%4*292,y=Math.floor(j/4)*510;g.drawImage(im,x,y+16,292,497);g.fillStyle='#253334';g.font='13px monospace';g.fillText(frames[j].name,x+4,y+13);}return c.toDataURL().split(',')[1];},frames);await fs.writeFile(path.join(out,`opening-contact-${first/16+1}.png`),Buffer.from(data,'base64'));await p.close();
  }
  report.result='passed';
})().catch(e=>{report.result='failed';report.error=e.stack;console.error(e.stack);process.exitCode=1;}).finally(async()=>{await browser?.close();if(staticServer)await new Promise(resolve=>staticServer.close(resolve));await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({result:report.result,checks:report.checks.length,runs:report.runs.length,error:report.error}));});
