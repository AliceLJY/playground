// NODE_PATH="$(npm root -g)" node tools/mobile-check.cjs <source-or-built-url> <out-dir>
const {chromium}=require('playwright'),fs=require('node:fs');
const [base,out]=process.argv.slice(2);if(!base||!out)throw Error('URL and output directory required');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=metal']});let failed=0;const reports=[];
 for(const [w,h] of [[390,664],[320,568],[844,340],[844,300],[1365,900]]){
  const ctx=await browser.newContext({viewport:{width:w,height:h},hasTouch:w<1000,isMobile:w<1000,deviceScaleFactor:w<1000?2:1}),p=await ctx.newPage(),checks=[],errors=[];
  p.on('pageerror',e=>errors.push(String(e)));const check=(name,ok,data)=>{checks.push({name,ok:!!ok,data});if(!ok)failed++;console.log(`${ok?'PASS':'FAIL'} ${w}x${h} ${name}`);};
  await p.goto(base);await p.waitForFunction(()=>typeof splashInspect==='function',null,{polling:100});
  const meta=await p.evaluate(()=>{const c=document.querySelector('#view'),g=c.getContext('webgl2'),e=g.getExtension('WEBGL_debug_renderer_info');return {renderer:g.getParameter(e.UNMASKED_RENDERER_WEBGL),dpr:devicePixelRatio,renderRatio:c.width/innerWidth,three:THREE.REVISION};});
  const start=await p.locator('#start').evaluate(e=>{const r=e.getBoundingClientRect(),f=document.querySelector('.menu-footer').getBoundingClientRect();return {top:r.top,bottom:r.bottom,footer:f.top,inside:r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};});
  check('start visible and clickable before any scroll',start.inside&&start.hit&&start.bottom<=start.footer,start);
  await p.screenshot({path:`${out}/${w}x${h}-intro.png`});
  await p.locator('#start').click();await p.waitForFunction(()=>splashInspect().phase==='playing',null,{polling:100});
  await p.screenshot({path:`${out}/${w}x${h}-playing.png`});
  const layout=await p.evaluate(()=>{
   const r=s=>{const e=document.querySelector(s),b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,visible:!!e.getClientRects().length};};
   const pairs=[['.radar-wrap','#joystick'],['.radar-wrap','.scorebar'],['.radar-wrap','.touch-actions']];
   const targets=[...document.querySelectorAll('.touch-actions button')].filter(e=>e.getClientRects().length).map(e=>{const b=e.getBoundingClientRect();return {id:e.id,x:b.x,y:b.y,w:b.width,h:b.height,hit:e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)),inside:b.left>=0&&b.top>=0&&b.right<=innerWidth&&b.bottom<=innerHeight};});
   // The clear 140x80 CSS-pixel rectangle beside the crosshair must accept continuous look input.
   const aim={x:innerWidth*.54,y:100,w:140,h:80};let clear=true;for(let y=aim.y;y<=aim.y+aim.h;y+=10)for(let x=aim.x;x<=aim.x+aim.w;x+=10)if(document.elementFromPoint(x,y)?.id!=='look-zone')clear=false;
   return {radar:r('.radar-wrap'),overlaps:pairs.filter(([a,b])=>{a=r(a);b=r(b);return a.visible&&b.visible&&a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}),targets,aim,clear};
  });
  check('radar stays clear of joystick and score',layout.overlaps.length===0,layout);
  if(h<=340){check('short landscape radar is <=90px tall',layout.radar.h<=90);const tools=layout.targets.filter(t=>['touch-jump','touch-switch','touch-bomb'].includes(t.id));check('secondary actions share one compact row',new Set(tools.map(t=>Math.round(t.y))).size===1);check('continuous 140x80 look area remains clear',layout.clear,layout.aim);}
  check('touch actions >=44px, visible and clickable',layout.targets.every(b=>b.w>=44&&b.h>=44&&b.hit&&b.inside),layout.targets);
  if(w===844){
   const before=await p.evaluate(()=>splashInspect().view.yaw);await p.mouse.move(w*.55,120);await p.mouse.down();await p.mouse.move(w*.55+80,130,{steps:5});await p.mouse.up();
   check('dragging clear look area turns the camera',Math.abs((await p.evaluate(()=>splashInspect().view.yaw))-before)>.2);
  }
  check('zero page errors',errors.length===0,errors);reports.push({w,h,meta,checks});await ctx.close();
 }
 await browser.close();fs.writeFileSync(`${out}/report.json`,JSON.stringify(reports,null,2));process.exitCode=failed?1:0;
})().catch(e=>{console.error(e);process.exit(1);});
