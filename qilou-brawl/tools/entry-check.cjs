// First visit / skip / return / unavailable storage. Run against source or published URL.
// NODE_PATH="$(npm root -g)" node tools/entry-check.cjs <url> <out-dir>
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
const [base,out]=process.argv.slice(2);
fs.mkdirSync(out,{recursive:true});
const readyFn=()=>window.__qilou?.ready, stateFn=()=>{const s=__qilou.info();return {lesson:!!s.practice,normal:!s.practice&&s.wave===0&&s.enemies===4&&s.hp===100&&s.t===0};};
const skip='#practice-skip',menu='#practice',menuStart=null,storageKey='qilou-practice-seen';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',args:['--enable-gpu','--ignore-gpu-blocklist']});
 const report={browser:browser.version(),runs:[],errors:[]};
 try{for(const [width,height] of [[390,664],[320,568],[844,340],[1365,900]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:width<1000,isMobile:width<1000,deviceScaleFactor:width<1000?2:1});
  const page=await context.newPage(),checks=[];
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  const check=(name,ok)=>{checks.push({name,pass:!!ok});assert.ok(ok,`${width}x${height}: ${name}`);};
  const ready=()=>page.waitForFunction(readyFn,null,{polling:100,timeout:90000});
  const state=()=>page.evaluate(stateFn);
  const usable=sel=>page.locator(sel).evaluate(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});
  const click=async sel=>{await page.locator(sel).scrollIntoViewIfNeeded();if(width<1000)await page.tap(sel);else await page.click(sel);await page.waitForTimeout(100);};
  const shot=async name=>{await page.screenshot({path:`${out}/${width}x${height}-${name}.png`});};
  await page.goto(base);await ready();await page.evaluate(()=>localStorage.clear());await page.reload();await ready();
  await click('#start');check('first Start enters the lesson',(await state()).lesson);
  check('skip is visible, >=44px and directly clickable',await usable(skip));await shot('first');
  await page.reload();await ready();await click('#start');check('abandoning the lesson does not mark it done',(await state()).lesson);
  if(width===1365){await page.focus(skip);await page.keyboard.press('Space');await page.waitForTimeout(100);}else await click(skip);check('skip enters original play with clean state',(await state()).normal);await shot('skipped');
  check('skip is remembered',await page.evaluate(key=>localStorage.getItem(key)==='1',storageKey));
  await page.reload();await ready();await click('#start');check('return Start enters original play',(await state()).normal);await shot('return');
  await page.reload();await ready();await page.locator(menu).scrollIntoViewIfNeeded();check('menu lesson entry retained',await usable(menu));await shot('menu');
  await click(menu);if(menuStart)await click(menuStart);check('menu still enters lesson',(await state()).lesson);
  // Access denial and quota failure must both remain first visits, even after Skip.
  for(const failure of ['read','write']){
   await page.evaluate(()=>localStorage.clear());
   const p=await context.newPage();
   p.on('pageerror',e=>report.errors.push(e.message));p.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
   await p.addInitScript(failure=>{if(failure==='read')Object.defineProperty(window,'localStorage',{get(){throw new Error('storage denied');}});else Storage.prototype.setItem=function(){throw new Error('quota exceeded');};},failure);
   await p.goto(base);await p.waitForFunction(readyFn,null,{polling:100,timeout:90000});await p.click('#start');await p.waitForTimeout(100);
   check(`${failure} failure enters lesson`,(await p.evaluate(stateFn)).lesson);
   await p.click(skip);await p.waitForTimeout(100);check(`${failure} failure still allows skip`,(await p.evaluate(stateFn)).normal);
   await p.reload();await p.waitForFunction(readyFn,null,{polling:100,timeout:90000});await p.click('#start');await p.waitForTimeout(100);check(`${failure} failure reoffers lesson on return`,(await p.evaluate(stateFn)).lesson);await p.close();
  }
  const bypass=new URL(base);bypass.searchParams.set('intro','skip');await page.goto(bypass.href);await ready();await click('#start');check('automation bypass reaches original play',(await state()).normal);
  check('bypass does not write visit history',await page.evaluate(key=>localStorage.getItem(key)===null,storageKey));
  await page.goto(base);await ready();await page.evaluate(()=>__qilou.start());await page.waitForTimeout(100);check('existing start hook still bypasses the lesson',(await state()).normal);
  const recording=new URL(base);recording.searchParams.set('record','');await page.goto(recording.href);await ready();await page.evaluate(()=>__qilou.recStart());await page.waitForFunction(()=>__qilou.info().t>0,null,{polling:100,timeout:20000});
  check('record mode still starts the original brawl',await page.evaluate(()=>!__qilou.info().practice&&__qilou.info().phase==='fight'&&__qilou.info().t>0));await shot('record');
  report.runs.push({width,height,dpr:width<1000?2:1,checks});await context.close();console.log(`PASS ${width}x${height}: ${checks.length} checks`);
 }
 assert.deepEqual(report.errors,[]);
 }finally{await browser.close();fs.writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
