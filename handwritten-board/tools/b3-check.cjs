// NODE_PATH="$(npm root -g)" node tools/b3-check.cjs <out-dir> <base-url>
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path');
const out=process.argv[2],base=process.argv[3];fs.mkdirSync(out,{recursive:true});
const checks=[],check=(name,pass,detail)=>{checks.push({name,pass:!!pass,detail});console.log(pass?'ok':'FAIL',name);};
(async()=>{const browser=await chromium.launch({channel:'chrome'});
 for(const [width,height] of [[390,664],[1365,900],[320,568],[844,340]]){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.waitForFunction(()=>window.__handBoard?.ready,null,{polling:50});
  const state=()=>page.evaluate(()=>window.__handBoard.state());
  const has=await page.locator('#page-first').count()&&await page.locator('#page-second').count();
  check(`${width}: both completed-page buttons exist`,has);
  if(has){
   for(const mode of ['page','flow']){
    if(mode==='flow')await page.locator('#pagemode').uncheck();
    await page.evaluate(()=>window.__handBoard.seek(window.__handBoard.duration()));
    for(const p of [0,1,0]){
     await page.locator(p?'#page-second':'#page-first').click();const s=await state();
     check(`${width} ${mode} ${p+1}: seek to completed page and pause`,s.mode==='page'&&s.paused&&Math.abs(s.time-s.marks.pageDone[p])<.001&&s.pageLabel===`${p+1} / 2`,s);
     check(`${width} ${mode} ${p+1}: complete ink, doodles and hidden hand`,s.hand.alpha<.001&&s.lines.filter(l=>l.page===p).every(l=>Math.abs(l.chars-l.revealed)<.01)&&s.doodles.filter(d=>d.page===p).every(d=>d.drawn>.999&&d.opacity>.9));
     await page.waitForTimeout(350);check(`${width} ${mode} ${p+1}: remains paused for reading`,Math.abs((await state()).time-s.time)<.001);
     if(p===0||mode==='page')await page.screenshot({path:path.join(out,`${width}-${mode}-page${p+1}.png`)});
    }
   }
   const geometry=await page.evaluate(()=>[...document.querySelectorAll('#bar button,#bar select')].map(e=>{const r=e.getBoundingClientRect();return {id:e.id,x:r.x,y:r.y,right:r.right,bottom:r.bottom,h:r.height,w:r.width};}));
   check(`${width}: controls fit viewport and page targets are 44px`,geometry.every(r=>r.x>=0&&r.y>=0&&r.right<=width&&r.bottom<=height&&(!r.id.startsWith("page-")||r.h>=44)),geometry);
  }
  check(`${width}: no page errors`,errors.length===0,errors);await page.close();
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({browser:browser.version(),checks},null,2));await browser.close();if(checks.some(c=>!c.pass))process.exitCode=1;
})();
