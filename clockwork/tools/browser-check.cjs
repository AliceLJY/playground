// NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <page-url> <output-dir>
const {chromium}=require('playwright'), fs=require('node:fs'),path=require('node:path');
const [base,out]=process.argv.slice(2); if(!base||!out) throw Error('Provide page URL and output directory');
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const {shotRequest,assertFrozen,materialFailures,MATERIAL_LIMITS}=await import('./acceptance.mjs');
 const url=new URL(base);url.searchParams.set('debug','1');
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const report={base,browser:browser.version(),checks:[],runs:[]};
 const check=(name,pass,detail)=>{report.checks.push({name,pass:!!pass,detail});console.log(`${pass?'PASS':'FAIL'} ${name}: ${JSON.stringify(detail)}`);};
 try {
 for(const [width,height] of [[390,664],[320,568],[844,340],[1365,900]]){
  const touch=width<900,ctx=await browser.newContext({viewport:{width,height},hasTouch:touch,deviceScaleFactor:touch?2:1});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route('**/favicon.ico',route=>route.fulfill({status:204}));
  await page.goto(url.href);await page.waitForFunction(()=>!!window.__clockwork?.snapshot,null,{polling:100});
  const controls=await page.locator('#ui-panel button').evaluateAll(bs=>bs.map(b=>{const r=b.getBoundingClientRect();return {id:b.id,h:r.height,x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
  check(`${width} buttons fit and meet 44px target`,controls.every(r=>r.h>=44&&r.x>=0&&r.y>=0&&r.right<=width&&r.bottom<=height),controls);
  const hint=await page.locator('#ui-panel p').filter({visible:true}).allTextContents();
  check(`${width} gesture hint matches pointer`,touch?hint.join('').includes('单指')&&hint.join('').includes('双指')&&!hint.join('').includes('左键'):hint.join('').includes('左键'),hint);
  const present=await page.locator('#pause').count()===1&&await page.locator('#step').count()===1;
  check(`${width} pause and single step available`,present,null);
  if(present){
   await page.locator('#speed-slider').fill('180');
   await page.locator('#pause').click();await page.waitForTimeout(100);
   const before=await page.evaluate(()=>window.__clockwork.snapshot());await page.waitForTimeout(350);
   const stopped=await page.evaluate(()=>window.__clockwork.snapshot());
   check(`${width} pause freezes every moving shaft`,JSON.stringify(before.angles)===JSON.stringify(stopped.angles)&&stopped.speed===180&&stopped.paused,stopped);
   await page.locator('#step').click();await page.waitForTimeout(100);
   const stepped=await page.evaluate(()=>window.__clockwork.snapshot());
   const expected=-Math.PI*2/3600*.25;
   check(`${width} step advances 0.25 simulation seconds at unchanged speed`,Math.abs(stepped.angles.center-stopped.angles.center-expected)<1e-10&&Math.abs(stepped.angles.escape-stopped.angles.escape-expected*60)<1e-9&&stepped.speed===180&&stepped.paused,stepped);
   await page.waitForTimeout(200);
   check(`${width} step settles back to pause`,JSON.stringify(stepped.angles)===JSON.stringify((await page.evaluate(()=>window.__clockwork.snapshot())).angles),null);
   await page.locator('#pause').click();await page.waitForTimeout(200);
   check(`${width} resume keeps selected speed`,await page.evaluate(a=>!window.__clockwork.snapshot().paused&&window.__clockwork.snapshot().speed===180&&window.__clockwork.snapshot().angles.center<a,stepped.angles.center),null);
   await page.locator('#pause').click();
   const camera=await page.evaluate(()=>window.__clockwork.snapshot().camera);
   await page.mouse.move(width*.5,height*.65);await page.mouse.down();await page.mouse.move(width*.7,height*.7,{steps:8});await page.mouse.up();await page.waitForTimeout(300);
   check(`${width} camera still orbits while paused`,JSON.stringify(camera)!==JSON.stringify((await page.evaluate(()=>window.__clockwork.snapshot())).camera),null);
   await page.locator('#reset-cam').click();
  }
  await page.screenshot({path:path.join(out,`${width}.png`)});
  const gpu=await page.evaluate(()=>{const g=document.querySelector('canvas').getContext('webgl2');const e=g?.getExtension('WEBGL_debug_renderer_info');return e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):'unknown';});
  check(`${width} no page errors`,errors.length===0,errors);report.runs.push({width,height,dpr:await page.evaluate(()=>devicePixelRatio),gpu});await ctx.close();
 }
 // Fixed desktop camera/time, sequential GPU reads. The two broken variants
 // are rendered, not inferred from material class names or configuration.
 const ctx=await browser.newContext({viewport:{width:1440,height:810},deviceScaleFactor:1});
 try {
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route('**/favicon.ico',route=>route.fulfill({status:204}));
  await page.goto(url.href);await page.waitForFunction(()=>!!window.__clockwork?.sampleMaterials,null,{polling:100});
  const request=shotRequest('wide',1440,810);
  assertFrozen(await page.evaluate(r=>window.__clockwork.freeze(r),request),request,errors);
  const materials={limits:MATERIAL_LIMITS,requested:request,variants:[]};report.materials=materials;
  for(const variant of ['current','basic','no-environment']){
   const result=await page.evaluate(v=>window.__clockwork.sampleMaterials(v),variant);
   assertFrozen(result.state,request,errors);
   if(result.variant!==variant)throw Error(`Requested material variant ${variant}, got ${result.variant}`);
   for(const gear of ['great','center']){
    const stats=result.gears[gear];if(!stats)throw Error(`Missing ${gear} pixels`);
    const filename=`material-${variant}-${gear}.png`;
    fs.writeFileSync(path.join(out,filename),Buffer.from(stats.preview.split(',')[1],'base64'));
    delete stats.preview;stats.previewFile=filename;
    const failures=materialFailures(stats);
    check(`${variant} ${gear} ${variant==='current'?'has metal contrast and highlights':'is rejected by metal limits'}`,
     variant==='current'?failures.length===0:stats.samples>=MATERIAL_LIMITS.samples&&failures.some(k=>k==='range'||k==='highlightFraction'),{...stats,failures});
   }
   materials.variants.push(result);
  }
  // Sampling must restore materials, environment, visibility AND frozen pose.
  const restored=await page.evaluate(()=>window.__clockwork.sampleMaterials('current'));
  for(const gear of ['great','center']){
   const stats=restored.gears[gear];if(!stats)throw Error(`Missing restored ${gear} pixels`);
   const original=materials.variants[0].gears[gear];
   check(`${gear} material probe restores the render`,['samples','p05','p95','range','highlightFraction'].every(k=>Math.abs(stats[k]-original[k])<1e-9),null);
  }
  assertFrozen(await page.evaluate(()=>window.__clockwork.snapshot()),request,errors);
  await page.screenshot({path:path.join(out,'material-scene.png')});
  check('material probe no page errors',errors.length===0,errors);
 } finally {await ctx.close();}
 process.exitCode=report.checks.some(c=>!c.pass)?1:0;
 } catch(e) {report.failure=e.message;throw e;}
 finally {
  try {await browser.close();}
  finally {fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));}
 }
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
