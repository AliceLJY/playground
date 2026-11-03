// 30 s returning-tour recording; --first-visit records the new phone introduction.
// Recording overhead makes this a motion/interaction check, not the fps benchmark.
const {chromium}=require('playwright'),fs=require('fs'),path=require('path');
(async()=>{
 const out=path.resolve(process.argv[2]||'shots/r2/opening'),base=process.argv[3]||'file://'+path.resolve(__dirname,'../dist/index.html');fs.mkdirSync(out,{recursive:true});
 const firstVisit=process.argv.includes('--first-visit'),viewport=firstVisit?{width:390,height:664}:{width:1440,height:900};
 const browser=await chromium.launch({channel:'chrome',headless:true}),ctx=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:firstVisit,hasTouch:firstVisit,recordVideo:{dir:out,size:viewport}}),page=await ctx.newPage(),errors=[],frames=[];
 try{
  page.on('pageerror',e=>errors.push(e.message));await page.goto(base+(firstVisit?'':'?intro=skip'));await page.waitForFunction(()=>window.__huacheng?.ready,null,{polling:100});const start=Date.now();
  for(const at of [0,5,10,15,20,25,30]){
   await page.waitForTimeout(Math.max(0,at*1000-(Date.now()-start)));
   if(firstVisit&&at===5)await page.locator('[data-place=bridge]').tap();
   if(at===10){await page.mouse.move(firstVisit?260:1020,firstVisit?240:530);await page.mouse.down();await page.mouse.move(firstVisit?180:920,firstVisit?260:550,{steps:15});await page.mouse.up();}
   if(firstVisit&&at===15)await page.locator('[data-journal=exit]').tap();
   if(at===20){await page.mouse.move(firstVisit?240:1000,firstVisit?240:450);await page.mouse.wheel(0,-70);}
   if(firstVisit&&at===25)await page.locator('#journal-start').tap();
   frames.push({at,snapshot:await page.evaluate(()=>window.__PLAYTEST__.snapshot())});await page.screenshot({path:path.join(out,at+'.png')});
  }
  const video=page.video();await ctx.close();fs.renameSync(await video.path(),path.join(out,'opening-30s.webm'));
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({errors,frames},null,2));console.log(JSON.stringify({errors,frames:frames.map(f=>({at:f.at,view:f.snapshot.state.view,calls:f.snapshot.info.calls}))}));if(errors.length)process.exitCode=1;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
