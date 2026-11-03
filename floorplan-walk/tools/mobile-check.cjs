// NODE_PATH="$(npm root -g)" node tools/mobile-check.cjs <built-page-url> <output-dir>
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path');
const [base,out]=process.argv.slice(2);if(!base||!out)throw Error('Provide page URL and output directory');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true}),report={base,browser:browser.version(),checks:[],runs:[]};
 const check=(name,pass,detail)=>{report.checks.push({name,pass:!!pass,detail});console.log(`${pass?'PASS':'FAIL'} ${name}: ${JSON.stringify(detail)}`);};
 for(const [width,height] of [[390,664],[320,568],[844,340],[1365,900]]){
  const touch=width<900,ctx=await browser.newContext({viewport:{width,height},hasTouch:touch,deviceScaleFactor:touch?2:1});const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.waitForFunction(()=>window.__house?.ready,null,{polling:100});
  const reachable=selector=>page.locator(selector).evaluateAll(bs=>bs.length>0&&bs.every(b=>{const r=b.getBoundingClientRect(),e=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.height>=44&&r.width>=44&&r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&(e===b||b.contains(e));}));
  await page.screenshot({path:path.join(out,`${width}-initial.png`)});
  if(touch){
   const more=page.locator('#moreTools');const has=await more.count()===1;
   check(`${width} visible more-tools entry and undo/redo`,has&&await reachable('#moreTools,[data-p2="undo"],[data-p2="redo"]'),has);
   if(has){
    await more.tap();check(`${width} all extra tools reachable`,await reachable('#extraTools button'),null);
    await page.screenshot({path:path.join(out,`${width}-tools.png`)});
    const before=await page.evaluate(()=>window.__house.plan.layout().length);
    await page.locator('[data-p2="clear"]').tap();check(`${width} existing clear intent works`,await page.evaluate(()=>window.__house.plan.layout().length)===0,null);
    await page.locator('[data-p2="undo"]').tap();check(`${width} undo restores furniture`,await page.evaluate(()=>window.__house.plan.layout().length)===before,before);
    if(await more.getAttribute('aria-expanded')==='true')await more.tap();
   }
  }
  const cats=page.locator('#libnav button');check(`${width} direct furniture category entries`,await cats.count()>=4,await cats.allTextContents());
  if(await cats.count()){
   if(touch)check(`${width} first four category targets visible`,await reachable('#libnav button:nth-child(-n+4)'),null);
   for(const ci of [1,2,3,0]){
    await cats.nth(ci).click();await page.waitForTimeout(200);
    const visible=await page.locator(`#lib [data-key="${ci}:0"]`).evaluate(el=>{const r=el.getBoundingClientRect(),w=document.querySelector('#libwrap').getBoundingClientRect();return r.x>=w.x&&r.right<=w.right&&r.y>=w.y&&r.bottom<=w.bottom;});
    check(`${width} category ${ci} brings first card into view`,visible,null);
    const before=await page.evaluate(()=>window.__house.plan.layout().length);
    await page.locator(`#lib [data-key="${ci}:0"]`).click();
    check(`${width} category ${ci} card still adds furniture`,await page.evaluate(()=>window.__house.plan.layout().length)===before+1,null);
    await page.locator('[data-p2="undo"]').click();
   }
   await cats.nth(1).click();await page.waitForTimeout(200);await page.screenshot({path:path.join(out,`${width}-living.png`)});
  }
  const gpu=await page.evaluate(()=>{const g=document.querySelector('#c').getContext('webgl2'),e=g.getExtension('WEBGL_debug_renderer_info');return e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):'unknown';});
  await page.locator('[data-mode="3d"]').click();await page.waitForFunction(()=>!window.__house.probe().growing,null,{polling:100});await page.waitForTimeout(5500);
  await page.screenshot({path:path.join(out,`${width}-3d.png`)});
  check(`${width} 3D opens after editing`,await page.evaluate(()=>!window.__house.probe().mode2d),null);
  check(`${width} no page errors or horizontal overflow`,errors.length===0&&await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),errors);
  report.runs.push({width,height,dpr:await page.evaluate(()=>devicePixelRatio),gpu});await ctx.close();
 }
 await browser.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));process.exitCode=report.checks.some(c=>!c.pass)?1:0;
})();
