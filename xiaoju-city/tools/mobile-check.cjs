// NODE_PATH="$(npm root -g)" node tools/mobile-check.cjs <source-or-built-url> <out-dir>
const {chromium}=require('playwright'),fs=require('node:fs');
const [base,out]=process.argv.slice(2);if(!base||!out)throw Error('URL and output directory required');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=metal']});const reports=[];let failed=0;
 for(const [w,h] of [[390,664],[844,390]]){
  const context=await browser.newContext({viewport:{width:w,height:h},hasTouch:true,isMobile:true,deviceScaleFactor:2});
  const page=await context.newPage(),errors=[],checks=[];page.on('pageerror',e=>errors.push(String(e)));
  const check=(name,ok,data)=>{checks.push({name,ok:!!ok,data});if(!ok)failed++;console.log(`${ok?'PASS':'FAIL'} ${w}x${h} ${name}${data===undefined?'':' '+JSON.stringify(data)}`);};
  for(const saved of [false,true]){
   await page.goto(base);await page.waitForFunction(()=>window.__PLAYTEST__?.ready,null,{polling:100});if(saved){await page.evaluate(()=>localStorage.setItem('xiaoju-city/v1',JSON.stringify({x:0,z:0,heading:0,visits:[],cruising:true,assist:false,savedAt:Date.now()})));await page.reload();await page.waitForFunction(()=>window.__PLAYTEST__?.ready,null,{polling:100});}
   const state=saved?'saved':'no-save',titleButtons=await page.locator('#start,#fresh').evaluateAll(es=>es.filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {id:e.id,x:r.x,y:r.y,w:r.width,h:r.height,inside:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,hit:e.contains(hit)};}));
   check(`${state}: title actions are fully visible and reachable`,titleButtons.every(b=>b.inside&&b.hit&&b.h>=44),titleButtons);
   const geometry=await page.evaluate(()=>{
    const snapshot=__PLAYTEST__.snapshot(),visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden';},blocks=[...document.querySelectorAll('button,.intro-panel>.eyebrow,#intro h1,#intro p')].filter(visible).map(e=>({id:e.id||e.tagName+'.'+e.className,r:e.getBoundingClientRect()}));
    const overlap=(a,b)=>Math.max(0,Math.min(a.x+a.width,b.right)-Math.max(a.x,b.left))*Math.max(0,Math.min(a.y+a.height,b.bottom)-Math.max(a.y,b.top)),riderArea=snapshot.rider.width*snapshot.rider.height;
    const rider=blocks.map(b=>({id:b.id,ratio:overlap(snapshot.rider,b.r)/riderArea})).filter(b=>b.ratio>0),left=Math.min(...snapshot.title.map(b=>b.x)),right=Math.max(...snapshot.title.map(b=>b.x+b.width));
    const buildings=snapshot.title.map(b=>{const area=b.width*b.height;return {id:b.id,heightRatio:b.height/innerHeight,cover:blocks.reduce((n,block)=>n+overlap(b,block.r),0)/area};});
    return {rider,buildingsWidth:(right-left)/innerWidth,buildings};
   });
   check(`${state}: rider overlaps every button/text block by less than 10%`,geometry.rider.every(b=>b.ratio<.10),geometry.rider);
   check(`${state}: dancing buildings span at least 60% width`,geometry.buildingsWidth>=.60,geometry.buildingsWidth);
   check(`${state}: each building meets the viewport height threshold`,geometry.buildings.every(b=>b.heightRatio>=(h>w?.12:.25)),geometry.buildings);
   check(`${state}: text and buttons cover less than 25% of each building`,geometry.buildings.every(b=>b.cover<.25),geometry.buildings);
   await page.screenshot({path:`${out}/${w}x${h}-title${saved?'':'-no-save'}.png`});
  }
  await page.locator('#start').click();await page.locator('#dialog-action').click();await page.waitForFunction(()=>__PLAYTEST__.snapshot().phase==='ride',null,{polling:100});
  async function overlaps(modalOnly){return page.evaluate(modalOnly=>{
   const visible=e=>{const r=e.getBoundingClientRect(),style=getComputedStyle(e);return r.width>0&&r.height>0&&style.visibility!=='hidden'&&style.display!=='none';};
   const buttons=[...document.querySelectorAll(modalOnly?'#modal button':'button')].filter(visible).map(e=>({id:e.id||e.dataset.control||e.textContent.trim(),kind:'button',r:e.getBoundingClientRect()}));
   const readouts=[...document.querySelectorAll('.place,.speed-readout,.boost-meter')].filter(visible).map(e=>({id:e.className,kind:'readout',r:e.getBoundingClientRect()}));
   const items=[...buttons,...readouts],overlaps=[];for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){const a=items[i],b=items[j];if(a.kind==='readout'&&b.kind==='readout')continue;if(a.r.left<b.r.right&&a.r.right>b.r.left&&a.r.top<b.r.bottom&&a.r.bottom>b.r.top)overlaps.push({a:a.id,b:b.id});}return overlaps;
  },modalOnly);}
  const rideOverlaps=await overlaps(false);check('acceptance 8: ride buttons and readouts do not overlap',rideOverlaps.length===0,rideOverlaps);
  const textOverlaps=await page.evaluate(()=>{const nodes=[];for(const root of document.querySelectorAll('.speed-readout,.boost-meter')){const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);while(walker.nextNode()){const node=walker.currentNode;if(!node.textContent.trim())continue;const range=document.createRange();range.selectNode(node);const r=range.getBoundingClientRect();if(r.width&&r.height)nodes.push({id:node.textContent.trim(),r});}}const overlaps=[];for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){const a=nodes[i],b=nodes[j];if(a.r.left<b.r.right&&a.r.right>b.r.left&&a.r.top<b.r.bottom&&a.r.bottom>b.r.top)overlaps.push({a:a.id,b:b.id});}return overlaps;});
  check('speed and boost text nodes do not overlap',textOverlaps.length===0,textOverlaps);await page.screenshot({path:`${out}/${w}x${h}-ride.png`});
  const touch=await page.locator('.touch-controls button').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {id:e.dataset.control,w:r.width,h:r.height,inside:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};}));check('touch controls are at least 44 px and reachable',touch.every(b=>b.w>=44&&b.h>=44&&b.inside&&b.hit),touch);
  await page.locator('#route-map').click();await page.locator('[data-place="qilou-rain"]').click();await page.locator('#dialog-action').click();await page.waitForFunction(()=>['challenge','hotspot'].includes(__PLAYTEST__.snapshot().phase),null,{polling:100,timeout:30000});if((await page.evaluate(()=>__PLAYTEST__.snapshot().phase))==='challenge')await page.locator('#dialog-secondary').click();await page.waitForFunction(()=>__PLAYTEST__.snapshot().phase==='hotspot',null,{polling:100,timeout:60000});
  const cardOverlaps=await overlaps(true);check('acceptance 8: card buttons and readouts do not overlap',cardOverlaps.length===0,cardOverlaps);await page.screenshot({path:`${out}/${w}x${h}-card.png`});
  check('zero page errors',errors.length===0,errors);reports.push({w,h,dpr:2,checks});await context.close();
 }
 await browser.close();fs.writeFileSync(`${out}/mobile-report.json`,JSON.stringify(reports,null,2));process.exitCode=failed?1:0;
})().catch(e=>{console.error(e);process.exit(1);});
