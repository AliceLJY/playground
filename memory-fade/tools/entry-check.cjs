// NODE_PATH="$(npm root -g)" node tools/entry-check.cjs <base-url> <out-dir>
const { chromium } = require('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const [base,out]=process.argv.slice(2),checks=[];fs.mkdirSync(out,{recursive:true});
const check=(name,pass)=>{checks.push({name,pass});assert.ok(pass,name);};
(async()=>{
 const browser=await chromium.launch();
 try{
  for(const [width,height] of [[390,664],[320,568],[844,340],[1365,900]]){
   const p=await browser.newPage({viewport:{width,height},deviceScaleFactor:2}),errors=[];
   p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
   const ready=()=>p.waitForFunction(()=>window.__PLAYTEST__?.ready,null,{polling:50});
   const shot=name=>p.screenshot({path:path.join(out,`${width}-${name}.png`)});
   const fit=selector=>p.locator(selector).evaluate(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});
   await p.goto(base);await p.evaluate(()=>localStorage.clear());await p.reload();await ready();
   check(`${width}: experiment card directly follows original interaction`,await p.evaluate(()=>{
    const nav=document.querySelector('.experiment-menu'),interaction=document.querySelector('.interaction');
    return nav.previousElementSibling===interaction&&nav.textContent.includes('下一步：只给三次机会，把它留到第 180 天')&&__PLAYTEST__.snapshot().experiment===null;
   }));
   check(`${width}: original buttons stay in first viewport`,await fit('#recall')&&await fit('#pin')&&await fit('#scrub'));
   await shot('first');
   await p.locator('#skip-experiment').scrollIntoViewIfNeeded();
   check(`${width}: explicit skip is 44px and reachable`,await fit('#skip-experiment'));
   await shot('entry');await p.locator('#skip-experiment').click();
   check(`${width}: skip returns focus to original simulation`,await p.evaluate(()=>document.activeElement.id==='scrub'&&__PLAYTEST__.snapshot().experiment===null));
   await p.locator('#open-experiment').click();
   check(`${width}: original entry opens experiment only on click`,await p.evaluate(()=>__PLAYTEST__.snapshot().experiment?.phase==='plan'));
   await p.locator('#close-experiment').click();await p.waitForFunction(()=>__PLAYTEST__.snapshot().experiment===null,null,{polling:50});
   await p.reload();await ready();
   check(`${width}: revisit still offers card without auto-start`,await p.evaluate(()=>__PLAYTEST__.snapshot().experiment===null)&&await p.locator('#open-experiment').isVisible());
   await shot('return');check(`${width}: zero errors`,errors.length===0);await p.close();
  }
 }finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({browser:browser.version(),checks},null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
