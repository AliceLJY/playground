// NODE_PATH="$(npm root -g)" node tools/b3-check.cjs <out-dir> <base-url>
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path');
const out=process.argv[2],base=process.argv[3];fs.mkdirSync(out,{recursive:true});
const checks=[],check=(name,pass,detail)=>{checks.push({name,pass:!!pass,detail});console.log(pass?'ok':'FAIL',name);};
(async()=>{
 const browser=await chromium.launch({channel:'chrome'});
 for(const slug of ['factcheck-1022','yingge-1021']) for(const [width,height] of [[390,664],[1365,900],[320,568],[844,340],[320,480]]){
  const key=`${slug}-${width}x${height}`,page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}?d=${slug}&view=hero`);await page.waitForFunction(()=>window.__replay?.ready,null,{polling:50});
  const geometry=await page.evaluate(()=>[...document.querySelectorAll('header button,header select')].filter(e=>!e.hidden).map(e=>{const r=e.getBoundingClientRect();return {id:e.id,x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};}));
  check(`${key}: controls fit and have 44px targets`,geometry.every(r=>r.x>=0&&r.y>=0&&r.right<=width&&r.bottom<=height&&r.h>=44&&r.w>=44&&r.hit),geometry);
  check(`${key}: visible node/timeline instructions`,await page.locator('#hint').count()>0 && await page.locator('#hint').isVisible());
  await page.screenshot({path:path.join(out,`${key}-hero.png`)});
  await page.locator('#play').click();
  const before=await page.evaluate(()=>window.__replay.state());
  const i=before.phases.findIndex(p=>p==='working'),c=before.cells[i];
  if(c) await page.mouse.click(c.x,c.y);
  await page.waitForTimeout(120);
  const selected=await page.evaluate(()=>({state:window.__replay.state(),hidden:document.querySelector('#detail').hidden,text:document.querySelector('#detail').textContent}));
  check(`${key}: node selection pauses and shows full task/status`,!selected.state.playing&&!selected.hidden&&/状态/.test(selected.text),selected);
  await page.evaluate(()=>window.__replay.seek(window.__replay.state().endT));
  await page.waitForTimeout(80);
  const end=await page.evaluate(()=>window.__replay.state());
  check(`${key}: end retains task-list entry`,await page.locator('#end-tasks').count()>0&&await page.locator('#end-tasks').isVisible());
  if(await page.locator('#end-tasks').count()){
   if(await page.locator('#detail-close').isVisible()) await page.locator('#detail-close').click();
   await page.locator('#end-tasks').click();
   const count=await page.locator('#task-list button').count();
   check(`${key}: final list contains every task`,count===end.cells.length,{count,expected:end.cells.length});
   await page.locator('#task-list button').last().click();
   const detail=await page.evaluate(()=>({t:window.__replay.state().t,playing:window.__replay.state().playing,hidden:document.querySelector('#detail').hidden,text:document.querySelector('#detail').textContent}));
   check(`${key}: final task detail does not restart playback`,!detail.hidden&&!detail.playing&&detail.t===end.endT&&/已交回/.test(detail.text),detail);
  }
  const detailGeometry=await page.evaluate(()=>{
    const d=document.querySelector('#detail'),r=d.getBoundingClientRect();
    return {top:r.top,bottom:r.bottom,onTop:d.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};
  });
  check(`${key}: details stay on screen above summary`,detailGeometry.top>=0&&detailGeometry.bottom<=height&&detailGeometry.onTop,detailGeometry);
  await page.screenshot({path:path.join(out,`${key}-end.png`)});
  check(`${key}: no page errors`,errors.length===0,errors);await page.close();
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({browser:browser.version(),checks},null,2));await browser.close();if(checks.some(c=>!c.pass))process.exitCode=1;
})();
