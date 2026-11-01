// Adapted from snowline-cabin/tools/shot.cjs. All four views by default, sequential GPU work.
// NODE_PATH="$(npm root -g)" node tools/shot.cjs [out-dir] [base-url]
// One shot: node tools/shot.cjs out.png '?view=bridge' [width] [height] [dpr] [base-url]
const {chromium}=require('playwright'),fs=require('fs'),path=require('path');
(async()=>{const args=process.argv.slice(2),single=args[0]?.endsWith('.png'),out=args[0]||path.resolve(__dirname,'../shots/r1');
 const base=(single?args[5]:args[1])||'file://'+path.resolve(__dirname,'../dist/index.html'),w=single?+(args[2]||1440):1440,h=single?+(args[3]||900):900,dpr=single?+(args[4]||1):1;
 fs.mkdirSync(single?path.dirname(out):out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true}),reports=[];
 try{for(const query of single?[args[1]||'?view=hero']:['hero','bridge','pagoda','wide'].map(v=>'?view='+v)){
 const context=await browser.newContext({viewport:{width:w,height:h},deviceScaleFactor:dpr,isMobile:w<600,hasTouch:w<600}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(base+query);await page.waitForFunction(()=>window.__huacheng?.ready,null,{polling:100,timeout:30000});await page.waitForTimeout(700);
 const data=await page.evaluate(()=>({state:window.__huacheng.state(),info:window.__huacheng.info(),subjects:window.__huacheng.subjectBoxes(),ui:window.__huacheng.uiBoxes()}));
 const expected=new URLSearchParams(query).get('view');if(expected&&data.state.view!==expected)throw Error('Requested '+expected+', got '+data.state.view);
 const file=single?out:path.join(out,expected+'.png');await page.screenshot({path:file});reports.push({file,base,query,browser:browser.version(),...data,errors});console.log(JSON.stringify({file,view:data.state.view,calls:data.info.calls,renderer:data.info.renderer,fps:data.info.fps,errors}));await context.close();
 }fs.writeFileSync(single?out+'.json':path.join(out,'shots.json'),JSON.stringify(reports,null,2));if(reports.some(r=>r.errors.length))process.exitCode=1;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
