// NODE_PATH="$(npm root -g)" node tools/regression-check.cjs <out-dir> [page-url]
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path');
const out=process.argv[2],base=process.argv[3]||'http://127.0.0.1:8942/herb-match/';
fs.mkdirSync(out,{recursive:true});const report={checks:[],runs:[]};
function check(name,pass,detail){report.checks.push({name,pass:!!pass,detail});console.log(pass?'ok':'FAIL',name,JSON.stringify(detail??''));}
(async()=>{const browser=await chromium.launch({channel:'chrome'});report.browser=browser.version();
for(const [width,height] of [[390,664],[320,568],[844,340],[1365,900]]){
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:width===1365?1:2,hasTouch:true}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.waitForFunction(()=>window.__herb?.ready,null,{polling:50});
 // Real start and keyboard filing before the simulated complete round.
 await page.keyboard.press('Enter');await page.evaluate(()=>window.__herb.advance(1).freeze());
 const filed=(await page.evaluate(()=>window.__herb.probe())).state.filed;
 await page.evaluate(()=>window.__herb.freeze(false));await page.keyboard.press('1');
 check(`${width} real keyboard files a herb`,(await page.evaluate(()=>window.__herb.probe())).state.filed>filed);
 await page.evaluate(()=>window.__herb.start(5).advance(77).freeze());await page.waitForTimeout(100);
 const p=await page.evaluate(()=>window.__herb.probe()),unique=[...new Set(p.state.result.slips.map(x=>x.k))];
 const summaries=page.locator('#review-list summary');
 check(`${width} complete review list`,unique.length>6&&await summaries.count()===unique.length,{unique:unique.length,rendered:await summaries.count()});
 await page.screenshot({path:path.join(out,`${width}-result.png`)});
 if(await summaries.count()){
  const before=p.state.result;
  for(let i=0;i<await summaries.count();i++){
   const el=summaries.nth(i);await el.scrollIntoViewIfNeeded();await el.click();
   const info=await el.evaluate(e=>{const d=e.parentElement,b=e.getBoundingClientRect(),t=d.querySelector('.review-taste');return{open:d.open,w:b.width,h:b.height,taste:getComputedStyle(t).fontSize,note:d.querySelector('.review-note').textContent};});
   check(`${width} review ${i} expands without shrinking text`,info.open&&info.w>=44&&info.h>=44&&parseFloat(info.taste)>=16&&info.note.length>0,info);
   if(i===await summaries.count()-1){await el.locator('..').locator('.review-chosen').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`${width}-last-slip.png`)});}
  }
  check(`${width} review does not restart`,JSON.stringify((await page.evaluate(()=>window.__herb.probe())).state.result)===JSON.stringify(before));
  await page.keyboard.press('Enter');check(`${width} Enter on a review is not restart`,(await page.evaluate(()=>window.__herb.probe())).screen==='result');
  const restart=page.locator('#restart');const box=await restart.boundingBox();check(`${width} restart visible and touch sized`,box&&box.height>=44&&box.y>=0&&box.y+box.height<=height,box);
  await restart.click();check(`${width} only restart button starts next round`,(await page.evaluate(()=>window.__herb.probe())).screen==='play');
 }else{
  await page.evaluate(()=>window.__herb.freeze(false));await page.mouse.click(width*.3,height*.55);
  check(`${width} touching review does not restart`,(await page.evaluate(()=>window.__herb.probe())).screen==='result');
 }
 check(`${width} zero page errors`,!errors.length,errors);report.runs.push({width,height,dpr:await page.evaluate(()=>devicePixelRatio)});await context.close();
}
const context=await browser.newContext({viewport:{width:390,height:664}}),page=await context.newPage();await page.goto(base);await page.waitForFunction(()=>window.__herb?.ready,null,{polling:50});
await page.goto(base+'?view=flip');await page.waitForFunction(()=>window.__herb?.ready,null,{polling:50});
const before=await page.evaluate(()=>window.__herb.probe());check('rotation samples live herbs and cards',before.state.herbs.length>0&&before.state.cards.length>0);
for(const [width,height] of [[844,300],[844,340],[320,568],[390,664]]){
 await page.setViewportSize({width,height});await page.waitForTimeout(100);const p=await page.evaluate(()=>window.__herb.probe());
 check(`rotate ${width}x${height} relays world`,Math.abs(p.view.W-Math.min(1.9,Math.max(.45,width/height))*1000)<.01,p.view);
 check(`rotate ${width}x${height} preserves round`,p.state.t===before.state.t&&p.state.score===before.state.score&&p.state.filed===before.state.filed);
 await page.screenshot({path:path.join(out,`rotate-${width}x${height}.png`)});
}
await context.close();await browser.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));process.exitCode=report.checks.some(c=>!c.pass)?1:0;
})().catch(e=>{console.error(e);process.exit(1)});
