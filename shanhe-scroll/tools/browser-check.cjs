// NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <out-dir> [page-url]
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path');
const out=process.argv[2],base=process.argv[3]||'http://127.0.0.1:8942/shanhe-scroll/';fs.mkdirSync(out,{recursive:true});
const report={checks:[],runs:[]};const check=(name,pass,detail)=>{report.checks.push({name,pass:!!pass,detail});console.log(pass?'ok':'FAIL',name,JSON.stringify(detail??''));};
(async()=>{const browser=await chromium.launch({channel:'chrome'});report.browser=browser.version();
for(const [width,height] of [[390,664],[320,568],[844,340],[1365,900]]){
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:width===1365?1:2,hasTouch:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.waitForFunction(()=>document.querySelectorAll('.node').length===4,null,{polling:50});await page.waitForTimeout(600);
 async function toolbar(tag){const data=await page.evaluate(()=>{
  const bar=document.getElementById('topbar').getBoundingClientRect();const ids=['title','score','rank','crumb','btn-menu','btn-tour','btn-reset'];
  const items=ids.map(id=>{const e=document.getElementById(id);if(!e)return null;const r=e.getBoundingClientRect();return{id,x:r.x,y:r.y,w:r.width,h:r.height};}).filter(r=>r&&r.w&&r.h);
  return{bar:{x:bar.x,y:bar.y,w:bar.width,h:bar.height},items,overflow:document.documentElement.scrollWidth>innerWidth};});
  check(`${width} ${tag} title and score fit one line`,data.items.filter(r=>['title','score'].includes(r.id)).every(r=>r.h<=26&&r.y>=0&&r.y+r.h<=data.bar.h),data);
  check(`${width} ${tag} toolbar inside viewport`,!data.overflow&&data.items.every(r=>r.x>=0&&r.x+r.w<=width&&r.y>=0&&r.y+r.h<=height));
 }
 await toolbar('initial');
 const hint=await page.locator('#hint').boundingBox();check(`${width} instruction has readable width and at most two lines`,hint.width>=Math.min(288,width-32)&&hint.height<=70,hint);
 await page.screenshot({path:path.join(out,`${width}-initial.png`)});
 async function tool(id){if(await page.locator('#btn-menu').isVisible().catch(()=>false)){
   if(!await page.locator(id).isVisible())await page.locator('#btn-menu').click();
  }await page.locator(id).click();}
 if(width<=900){check(`${width} compact menu exists`,await page.locator('#btn-menu').count()===1);if(await page.locator('#btn-menu').count()){
  await page.locator('#btn-menu').click();for(const id of ['#btn-menu','#btn-tour','#btn-reset']){const r=await page.locator(id).boundingBox();check(`${width} ${id} touch size`,r.width>=44&&r.height>=44,r);}await page.screenshot({path:path.join(out,`${width}-menu.png`)});
 }}
 await tool('#btn-tour');await page.waitForTimeout(600);await toolbar('scene');
 const renderer=await page.evaluate(()=>{const g=document.getElementById('gl').getContext('webgl2'),ext=g?.getExtension('WEBGL_debug_renderer_info');return ext?g.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown';});
 await page.locator('#opts .opt').first().click();const score1=await page.locator('#score').textContent(),verdict=await page.locator('#verdict-text').textContent();
 await page.locator('#scene-next').click();await tool('#btn-tour');
 check(`${width} revisit restores feedback`,await page.locator('#verdict').evaluate(e=>e.classList.contains('show'))&&await page.locator('#verdict-text').textContent()===verdict);
 const opt=page.locator('#opts .opt').first();if(await opt.isEnabled())await opt.click();
 const score2=await page.locator('#score').textContent();check(`${width} revisiting does not add score`,score1===score2,{score1,score2});
 await page.locator('#opts').evaluate(e=>e.parentElement.parentElement.scrollTop=0);await page.waitForTimeout(400);await page.screenshot({path:path.join(out,`${width}-revisit.png`)});
 await tool('#btn-reset');check(`${width} reset clears score`,await page.locator('#score').textContent()==='0 分');await tool('#btn-tour');check(`${width} reset reopens quiz`,await page.locator('#opts .opt').first().isEnabled());
 if(width===1365){
  const nodes=await page.evaluate(async()=>{const {CHAPTERS}=await import(new URL('./data/timeline.js',location.href));return CHAPTERS.flatMap(c=>c.nodes).map(n=>({id:n.id,answer:n.quiz.options.findIndex(o=>o.key===n.quiz.answer),points:n.score.correct}));});
  let expected=0;
  for(let i=0;i<nodes.length;i++){
   if(i){await page.locator(`.node[data-id="${nodes[i].id}"]`).click();await page.locator('#card-enter').click();}
   await page.locator('#opts .opt').nth(nodes[i].answer).click();expected+=nodes[i].points;await page.locator('#scene-next').click();
  }
  check('four distinct nodes reach finale with exactly their combined score',await page.locator('#fin-score').textContent()===`共得 ${expected} 分`&&await page.locator('#finale').evaluate(e=>e.classList.contains('show')),{expected});
  await page.screenshot({path:path.join(out,'1365-finale.png')});
 }
 check(`${width} zero page errors`,errors.length===0,errors);report.runs.push({width,height,dpr:await page.evaluate(()=>devicePixelRatio),renderer});await context.close();
}
await browser.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));process.exitCode=report.checks.some(c=>!c.pass)?1:0;
})().catch(e=>{console.error(e);process.exit(1)});
