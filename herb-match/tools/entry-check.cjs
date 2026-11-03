// NODE_PATH="$(npm root -g)" node tools/entry-check.cjs <base-url> <out-dir>
const { chromium } = require('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const [base, out] = process.argv.slice(2), checks = [];
fs.mkdirSync(out,{recursive:true});
const check = (name, pass) => { checks.push({name,pass}); assert.ok(pass,name); };
(async () => {
 const browser = await chromium.launch({channel:'chrome'});
 try {
  for (const [width,height] of [[390,664],[320,568],[844,340],[1365,900]]) {
   const p = await browser.newPage({viewport:{width,height},deviceScaleFactor:width<900?2:1}), errors=[];
   p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
   const shot=name=>p.screenshot({path:path.join(out,`${width}-${name}.png`)});
   await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();
   await p.waitForFunction(()=>window.__herb?.ready,null,{polling:50});
   check(`${width}: normal first entry remains title`,await p.evaluate(()=>__herb.probe().screen==='title'));
   await p.keyboard.press('Enter');
   await p.evaluate(()=>__herb.advance(77).freeze());
   const hierarchy=()=>p.evaluate(()=>{
    const a=document.querySelector('#practice-start'),b=document.querySelector('#restart'),ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();
    const fits=e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));};
    return !a.hidden&&ar.width*ar.height>br.width*br.height&&getComputedStyle(a).backgroundColor==='rgb(184, 50, 42)'&&getComputedStyle(b).backgroundColor!=='rgb(184, 50, 42)'&&fits(a)&&fits(b)&&b.textContent==='再来一局';
   });
   check(`${width}: missed-herb review is larger and emphasized; restart visible >=44px`,await hierarchy());await shot('result');
   await p.locator('#restart').click();
   check(`${width}: skip starts original round`,await p.evaluate(()=>__herb.probe().screen==='play'&&__herb.probe().practice===null));
   await p.evaluate(()=>__herb.start(5).autopilot('human').advance(77).freeze());
   check(`${width}: next result still offers review as primary`,await hierarchy());
   await p.locator('#practice-start').click();
   check(`${width}: original practice entrance works`,await p.evaluate(()=>__herb.probe().screen==='practice'));
   while(await p.evaluate(()=>__herb.probe().practice.phase!=='done')){
    const nature=await p.evaluate(()=>{const s=__herb.probe().practice;return HerbCore.HERBS[s.items[s.index].k].nature;});
    await p.keyboard.press(String(nature+1));await p.locator('#practice-next').click();
   }
   await shot('completed');await p.locator('#practice-back').click();
   check(`${width}: completed review returns to same hierarchy`,await hierarchy());
   await p.evaluate(()=>__herb.start(5).autopilot('precise').advance(77).freeze());
   check(`${width}: no mistakes keeps restart primary`,await p.evaluate(()=>document.querySelector('#practice-start').hidden&&getComputedStyle(document.querySelector('#restart')).backgroundColor==='rgb(184, 50, 42)'));
   await shot('perfect');await p.reload();await p.waitForFunction(()=>window.__herb?.ready,null,{polling:50});
   check(`${width}: revisit still opens normal title`,await p.evaluate(()=>__herb.probe().screen==='title'));
   check(`${width}: zero page errors`,errors.length===0);await p.close();
  }
 } finally {fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({browser:browser.version(),checks},null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
