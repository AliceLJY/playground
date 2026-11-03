// NODE_PATH="$(npm root -g)" node tools/b3-check.cjs <out-dir> <base-url>
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path');
const out=process.argv[2],base=process.argv[3];fs.mkdirSync(out,{recursive:true});
const checks=[],check=(name,pass,detail)=>{checks.push({name,pass:!!pass,detail});console.log(pass?'ok':'FAIL',name);};
(async()=>{const b=await chromium.launch({channel:'chrome'}),renderers=[];
 for(const [width,height] of [[390,664],[1365,900],[320,568],[844,340]]){
  const p=await b.newPage({viewport:{width,height},deviceScaleFactor:1}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base);await p.waitForFunction(()=>window.__gearRepair?.ready,null,{polling:50});
  renderers.push(await p.evaluate(()=>{const c=document.querySelector('canvas'),g=c.getContext('webgl2')||c.getContext('webgl'),e=g.getExtension('WEBGL_debug_renderer_info');return e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):'unavailable';}));
  const hint=await p.locator('#sub').evaluate(e=>{const r=e.getBoundingClientRect();return {text:e.textContent,x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:r.width,h:r.height,visible:getComputedStyle(e).display!=='none',fits:e.scrollWidth<=e.clientWidth};});
  check(`${width}: opening instruction is visible and uncut`,hint.text==='先看红点，再点返修后'&&hint.visible&&hint.w>0&&hint.h>0&&hint.x>=0&&hint.right<=width&&hint.bottom<=height&&hint.fits,hint);
  const s=await p.evaluate(()=>window.__gearRepair.state());
  check(`${width}: original remains the deliberate faulty comparison`,s.version==='original'&&s.cycle.original.bad===60,s.cycle);
  const pr=await p.evaluate(()=>window.__gearRepair.probe());
  check(`${width}: overview gears stay between the HUD bars`,Object.values(pr.bboxes).every(r=>r.x0>=0&&r.x1<=width&&r.y0>=pr.safe.y0&&r.y1<=pr.safe.y1),pr);
  await p.screenshot({path:path.join(out,`${width}-original.png`)});
  await p.locator('[data-version="repaired"]').filter({hasText:'返修后'}).click();
  const r=await p.evaluate(()=>window.__gearRepair.state());
  check(`${width}: repaired switch still works`,r.version==='repaired'&&r.cycle.repaired.bad===0,r.cycle);
  await p.screenshot({path:path.join(out,`${width}-repaired.png`)});
  check(`${width}: no page errors`,errors.length===0,errors);await p.close();
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({browser:b.version(),renderers,checks},null,2));await b.close();if(checks.some(c=>!c.pass))process.exitCode=1;
})();
