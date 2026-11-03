// NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <page-url> <output-dir>
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path');
const [base,out]=process.argv.slice(2);if(!base||!out)throw Error('Provide page URL and output directory');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});const report={base,browser:browser.version(),checks:[],runs:[]};
 const check=(name,pass,detail)=>{report.checks.push({name,pass:!!pass,detail});console.log(`${pass?'PASS':'FAIL'} ${name}: ${JSON.stringify(detail)}`);};
 for(const [width,height] of [[390,664],[320,568],[844,340],[1365,900]]){
  const ctx=await browser.newContext({viewport:{width,height},hasTouch:width<900,deviceScaleFactor:width<900?2:1});const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.waitForFunction(()=>window.__ready,null,{polling:100});
  const copy=await page.locator('header,.hint').allTextContents();
  check(`${width} visitor copy replaces filenames`,!copy.join('').includes('.json')&&copy.join('').includes('八'),copy);
  const walk=page.locator('a[href="../floorplan-walk/"]');check(`${width} link to furniture and walk-in page`,await walk.count()>0,await walk.allTextContents());
  if(await walk.count()) {const response=await page.request.get(new URL('../floorplan-walk/dist/',base).href);check(`${width} local walk-in build available`,response.ok(),response.status());}
  await page.screenshot({path:path.join(out,`${width}-three.png`)});
  await page.locator('#tab-plan').click();
  const imageLink=page.locator('#pane-plan a:has(img)');const full=page.locator('#pane-plan a').filter({hasText:'放大看尺寸'});
  check(`${width} CAD image and labelled control link to original`,await imageLink.count()===1&&await full.count()===1,await page.locator('#pane-plan a').allTextContents());
  if(await full.count()){
   const b=await full.boundingBox();check(`${width} original control is >=44px`,b.height>=44,b);
   const href=await full.getAttribute('href');check(`${width} same original for image and button`,href===await imageLink.getAttribute('href'),href);
   const popupWait=page.waitForEvent('popup');await full.click();const popup=await popupWait;await popup.waitForLoadState();
   const img=await popup.locator('img').evaluate(i=>({loaded:i.complete&&i.naturalWidth>0,width:i.naturalWidth}));check(`${width} original image opens at readable resolution`,img.loaded&&img.width>1000,img);await popup.close();
  }
  await page.screenshot({path:path.join(out,`${width}-plan.png`)});
  for(const tab of ['render','sun','three']){await page.locator('#tab-'+tab).click();check(`${width} ${tab} tab still works`,await page.locator('#pane-'+tab).isVisible(),null);}
  check(`${width} all images loaded and no overflow`,await page.evaluate(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0)&&document.documentElement.scrollWidth<=innerWidth),null);
  check(`${width} zero page errors`,errors.length===0,errors);report.runs.push({width,height,dpr:await page.evaluate(()=>devicePixelRatio)});await ctx.close();
 }
 await browser.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));process.exitCode=report.checks.some(c=>!c.pass)?1:0;
})();
