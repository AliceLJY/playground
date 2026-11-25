// Results panel and menu footer checks from the 2026-11-25 Duet review.
// NODE_PATH="$(npm root -g)" node tools/results-check.cjs <source-or-built-url> <out-dir>
// The match clock is shortened by wrapping SplashCore.create in the page (game code untouched), so a real
// match reaches the real results panel in about two seconds.
const {chromium}=require('playwright'),fs=require('node:fs');
const [base,out]=process.argv.slice(2);if(!base||!out)throw Error('URL and output directory required');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=metal']});let failed=0,total=0;
 const check=(tag,name,ok,data)=>{total++;if(!ok)failed++;console.log(`${ok?'PASS':'FAIL'} ${tag} ${name}${ok?'':' '+JSON.stringify(data)}`);};
 // Results: phones (touch) and one desktop size, default 4v4 and the longest 6v6 table.
 for(const [w,h,touch] of [[390,844,true],[390,664,true],[844,390,true],[844,340,true],[1365,900,false]])for(const size of ['4','6']){
  const tag=`${w}x${h}${touch?' touch':''} ${size}v${size}`,ctx=await browser.newContext({viewport:{width:w,height:h},hasTouch:touch,isMobile:touch,deviceScaleFactor:touch?2:1}),p=await ctx.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(String(e)));
  await p.addInitScript(()=>{let core;Object.defineProperty(window,'SplashCore',{configurable:true,get(){return core;},set(c){const create=c.create;c.create=o=>{const s=create(o);s.time=1.5;return s;};core=c;}});});
  await p.goto(base);await p.waitForFunction(()=>typeof splashInspect==='function',null,{polling:100});
  await p.selectOption('#size',size);await p.locator('#start').click();
  await p.waitForFunction(()=>!document.getElementById('results').hidden,null,{polling:100,timeout:15000});await p.waitForTimeout(200);
  await p.screenshot({path:`${out}/${w}x${h}-${size}v${size}-results.png`});
  const r=await p.evaluate(()=>{
   const rows=[...document.querySelectorAll('#result-table tbody tr')].map(tr=>tr.cells[0].textContent);
   const again=document.getElementById('again'),b=again.getBoundingClientRect(),panel=document.querySelector('#results .panel').getBoundingClientRect();
   const hit=again.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));
   return {rows,again:{top:b.top,bottom:b.bottom,left:b.left,right:b.right,hit},panel:{top:panel.top,bottom:panel.bottom},inner:innerHeight,scrollTop:document.querySelector('#results .panel').scrollTop};
  });
  check(tag,'own row is not labelled 你（你）',r.rows.length===+size*2&&!r.rows.some(t=>t.includes('你（你）')),r.rows);
  check(tag,'再来一场 is fully on the first screen and its centre hits it',r.scrollTop===0&&r.again.top>=0&&r.again.bottom<=r.inner&&r.again.bottom<=r.panel.bottom+.5&&r.again.hit,r);
  if(r.again.hit){await p.locator('#again').click();check(tag,'再来一场 starts a new match',await p.evaluate(()=>splashInspect().phase==='playing'));}
  check(tag,'zero page errors',errors.length===0,errors);await ctx.close();
 }
 // Menu footer: every key cap carries a word saying what it does, on narrow windows without touch too.
 for(const [w,h,touch] of [[700,800,false],[390,664,false],[320,568,false],[1365,900,false],[390,664,true]]){
  const tag=`${w}x${h}${touch?' touch':''}`,ctx=await browser.newContext({viewport:{width:w,height:h},hasTouch:touch,isMobile:touch,deviceScaleFactor:touch?2:1}),p=await ctx.newPage();
  await p.goto(base);await p.waitForFunction(()=>typeof splashInspect==='function',null,{polling:100});
  await p.screenshot({path:`${out}/${w}x${h}${touch?'-touch':''}-menu.png`});
  const f=await p.evaluate(()=>{
   const span=document.querySelector('.menu-footer>span'),words=t=>(t||'').replace(/^["']|["']$/g,'').trim();
   const caps=[...span.querySelectorAll('kbd')].filter(k=>getComputedStyle(k).display!=='none');
   const spanSize=parseFloat(getComputedStyle(span).fontSize),spanAfter=words(getComputedStyle(span,'::after').content.replace(/^none$/,''));
   const labels=caps.map(k=>{const after=words(getComputedStyle(k,'::after').content.replace(/^(none|normal)$/,''));const next=spanSize>0?words(k.nextSibling&&k.nextSibling.nodeType===3?k.nextSibling.textContent:''):'';return {key:k.textContent,label:after||next};});
   const fb=document.querySelector('.menu-footer').getBoundingClientRect(),overflow=[...document.querySelectorAll('.menu-footer *')].some(e=>{const r=e.getBoundingClientRect();return r.width&&(r.left<-.5||r.right>innerWidth+.5);});
   return {labels,spanAfter,overflow,footerH:fb.height};
  });
  if(touch)check(tag,'touch footer explains the touch controls',f.spanAfter.length>0,f);
  else check(tag,'each visible key cap has a label',f.labels.length===3&&f.labels.every(l=>l.label.length>0),f);
  check(tag,'footer stays inside the window',!f.overflow,f);
  await ctx.close();
 }
 await browser.close();console.log(`${total-failed}/${total} passed`);process.exitCode=failed?1:0;
})().catch(e=>{console.error(e);process.exit(1);});
