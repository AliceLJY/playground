// NODE_PATH="$(npm root -g)" node tools/reference-check.cjs <repository-root-url> <out-dir>
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path');
const [root,out]=process.argv.slice(2);if(!root||!out)throw Error('Repository root URL and output directory required');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=metal']}),context=await browser.newContext({viewport:{width:1365,height:900}}),page=await context.newPage();
 const base=root.replace(/\/$/,'')+'/aju-guangzhou-ride/',open=async()=>{await page.goto(base);await page.waitForFunction(()=>window.__ride?.ready,null,{polling:100});};
 await open();await page.screenshot({path:`${out}/aju-title.png`});
 await page.locator('#start').click();await page.locator('#route-map').click();await page.locator('[data-place="river"]').click();await page.screenshot({path:`${out}/aju-map.png`});
 await open();await page.locator('#start').click();await page.locator('#route-map').click();await page.locator('[data-place="tea"]').click();await page.locator('#dialog-action').click();await page.waitForFunction(()=>['challenge','ride'].includes(__ride.state.phase)&&__ride.state.routeNav?.status==='arrived'||__ride.state.phase==='challenge',null,{polling:100});if((await page.evaluate(()=>__ride.state.phase))==='challenge'){await page.locator('#dialog-secondary').click();await page.waitForFunction(()=>__ride.state.routeNav?.status==='arrived',null,{polling:100,timeout:60000});}await page.locator('#visit').click();await page.waitForFunction(()=>__ride.state.phase==='dialog',null,{polling:100});await page.screenshot({path:`${out}/aju-card.png`});
 for(const name of ['title','hotspot','map']){
  const reference=name==='hotspot'?'card':name,a=fs.readFileSync(path.join(out,`aju-${reference}.png`)).toString('base64'),b=fs.readFileSync(path.join(out,'..',`${name}.png`)).toString('base64');
  await page.setContent(`<style>body{margin:0;background:#f3ead8;font:16px sans-serif}div{display:flex;gap:12px;padding:12px}figure{margin:0;width:50%}figcaption{padding:8px 0}img{display:block;width:100%;height:auto}</style><div><figure><figcaption>阿橘的广州骑游 · 参考</figcaption><img src="data:image/png;base64,${a}"></figure><figure><figcaption>小橘逛花城 · 本版</figcaption><img src="data:image/png;base64,${b}"></figure></div>`);await page.screenshot({path:`${out}/compare-${name}.png`});
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
