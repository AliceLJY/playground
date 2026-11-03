// NODE_PATH="$(npm root -g)" node tools/entry-check.cjs <base-url> <out-dir>
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
const [base,out]=process.argv.slice(2);fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'chrome'}),report={browser:browser.version(),runs:[],errors:[]};
 try{for(const [width,height] of [[390,664],[320,568],[844,340],[1365,900]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:width<1000,isMobile:width<1000,deviceScaleFactor:width<1000?2:1}),page=await context.newPage(),checks=[];
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  const check=(name,ok)=>{checks.push({name,pass:!!ok});assert.ok(ok,`${width}x${height}: ${name}`);};
  const ready=()=>page.waitForFunction(()=>window.__slipper?.ready,null,{polling:100});
  const state=()=>page.evaluate(()=>__slipper.probe());
  const click=async sel=>{if(width<1000)await page.tap(sel);else await page.click(sel);};
  const shot=n=>page.screenshot({path:`${out}/${width}x${height}-${n}.png`});
  const choices=async()=>{
   const rows=await page.locator('#mode-choices button').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {...r.toJSON(),visible:!!e.getClientRects().length,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),description:e.querySelector('small')?.textContent};}));
   check('two equally sized, visible >=44px primary choices',rows.length===2&&rows.every(r=>r.visible&&r.hit&&r.width>=44&&r.height>=44&&r.x>=0&&r.y>=0&&r.right<=width&&r.bottom<=height&&r.description)&&Math.abs(rows[0].width-rows[1].width)<1&&Math.abs(rows[0].height-rows[1].height)<1);
   check('narrow screens stack, wide screens place choices side by side',width<=480?rows[0].bottom<rows[1].top:rows[0].right<rows[1].left&&rows[0].top===rows[1].top);
   check('former night entry exists only inside primary choices',await page.locator('#night-entry').count()===1&&await page.locator('#mode-choices #night-entry').count()===1);
  };
  await page.goto(base);await ready();await page.evaluate(()=>localStorage.clear());await page.reload();await ready();
  check('fresh visit stays at title with no selected game',(await state()).screen==='title'&&(await state()).state===null);await choices();await shot('first');
  await click('#casual-entry');check('casual button enters original play',(await state()).state.mode==='casual'&&!(await state()).gestureActive);await shot('casual');
  await page.reload();await ready();check('return visit still offers both modes',(await state()).screen==='title');await choices();await shot('return');
  await click('#night-entry');check('night button opens existing rules',(await state()).screen==='nightMenu');await shot('rules');
  await click('#night-back');check('back cancels night choice',(await state()).screen==='title'&&(await state()).state===null);await choices();
  await page.focus('#casual-entry');await page.keyboard.press('Enter');check('keyboard activates the casual button',(await state()).state.mode==='casual');
  await page.reload();await ready();await click('#night-entry');await click('#night-start');check('existing rule button still starts night watch',(await state()).state.mode==='night');
  // Full real-input victory is covered by night-check; this is the return/revisit path.
  await page.evaluate(()=>__slipper.advance(25));await page.waitForTimeout(100);check('idle night genuinely reaches a result',(await state()).screen==='result');
  await click('#night-return');await choices();await shot('result-return');
  await page.reload();await ready();await choices();check('finishing night does not change default on reload',(await state()).screen==='title');
  report.runs.push({width,height,dpr:width<1000?2:1,checks});await context.close();console.log(`PASS ${width}x${height}: ${checks.length} checks`);
 }
 assert.deepEqual(report.errors,[]);
 }finally{await browser.close();fs.writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
