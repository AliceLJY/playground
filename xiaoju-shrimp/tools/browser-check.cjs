// Browser acceptance for spec 7 and 8.7–8.8: every fixed view reports the state it was asked for, no page errors,
// cells at least 40 CSS px on phones, and a real tap moves the cat. Read every screenshot afterwards.
// Usage: NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <out-dir> [page-url]
const {chromium}=require('playwright'),path=require('path'),fs=require('fs');
const OUT=process.argv[2]||'/tmp/sneak-shots',BASE=(process.argv[3]||'http://127.0.0.1:8811/xiaoju-shrimp/').replace(/\/?$/,'/');fs.mkdirSync(OUT,{recursive:true});
(async()=>{
  const b=await chromium.launch();const out=[];
  for(const [vw,vh,tag] of [[390,664,'phone'],[320,568,'small'],[1280,800,'desk']]){
    for(const v of ['start','hiss','table','exit','clear',null]){
      const p=await b.newPage({viewport:{width:vw,height:vh},deviceScaleFactor:1});const errs=[];
      p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
      await p.goto(BASE+(v?'?view='+v:''));
      await p.waitForFunction(()=>window.__PLAYTEST__&&window.__PLAYTEST__.ready,null,{polling:100});
      await p.waitForTimeout(300);
      const snap=await p.evaluate(()=>window.__PLAYTEST__.snapshot());
      const f=path.join(OUT,`${tag}-${v||'entry'}.png`);await p.screenshot({path:f});
      out.push({tag,v,ok:v?snap.view===v:true,cell:snap.cell,phase:snap.phase,under:snap.under,errs});
      await p.close();
    }
  }
  // real input: tap a cell on the phone layout and see the cat move
  const p=await b.newPage({viewport:{width:390,height:664}});
  await p.goto(BASE);await p.waitForFunction(()=>window.__PLAYTEST__&&window.__PLAYTEST__.ready,null,{polling:100});
  await p.click('#go');
  const box=await p.evaluate(()=>{const c=document.getElementById('board').getBoundingClientRect();const s=window.__PLAYTEST__.snapshot();return {x:c.left,y:c.top,w:c.width,h:c.height,cell:s.cell};});
  const ox=(box.w-box.cell*7)/2,oy=(box.h-box.cell*9)/2;
  const t0=Date.now();await p.mouse.click(box.x+ox+3.5*box.cell,box.y+oy+8.5*box.cell);
  await p.waitForFunction(()=>window.__PLAYTEST__.snapshot().catOcc!==56,null,{polling:10,timeout:3000});
  const lat=Date.now()-t0;
  const hint=await p.evaluate(()=>document.getElementById('msg').textContent);
  if(!/出口/.test(hint)){console.error('FAIL playtest 1: the hint line does not name the exit:',hint);process.exitCode=1;}
  await p.waitForTimeout(1500);const s2=await p.evaluate(()=>window.__PLAYTEST__.snapshot());
  await p.screenshot({path:path.join(OUT,'phone-tapped.png')});
  out.push({tap:'(3,8)',catAt:s2.cat,msUntilOccChanged:lat});
  console.log(JSON.stringify(out,null,0).replace(/},{/g,'},\n{'));
  const bad=out.filter(o=>o.v!==undefined&&(!o.ok||o.errs.length||(o.tag!=='desk'&&o.cell<40)));
  if(bad.length||out[out.length-1].catAt===56){console.error('FAIL',JSON.stringify(bad));process.exitCode=1;}else console.log('browser check OK');
  await b.close();
})();
