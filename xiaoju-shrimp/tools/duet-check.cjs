// Checks for the 2026-11-25 Duet review of the win card.
// 1. While the win card is up, the canvas behind it no longer paints the large level-complete title (it showed through as a ghost).
// 2. Level 3 won after 「住手！」: the card's count and the 「当场被抓包」 medal must not contradict each other.
// Usage: NODE_PATH="$(npm root -g)" node tools/duet-check.cjs <out-dir> [page-url]
const {chromium}=require('playwright'),path=require('node:path'),fs=require('node:fs');
const OUT=process.argv[2]||'/tmp/sneak-duet',BASE=(process.argv[3]||'http://127.0.0.1:8811/xiaoju-shrimp/').replace(/\/?$/,'/');fs.mkdirSync(OUT,{recursive:true});
(async()=>{
 const b=await chromium.launch();let total=0,failed=0;
 const check=(tag,name,ok,data)=>{total++;if(!ok)failed++;console.log(`${ok?'PASS':'FAIL'} ${tag} ${name}${ok?'':' '+JSON.stringify(data)}`);};
 for(const [w,h,touch] of [[390,664,true],[320,568,true],[1280,800,false]]){
  for(const lv of [1,2,3]){
   const tag=`${w}x${h} L${lv}`,p=await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:touch?2:1,hasTouch:touch,isMobile:touch}),errs=[];
   p.on('pageerror',e=>errs.push(String(e)));
   await p.addInitScript(()=>{window.__drawn=[];const f=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(t,...a){if(this.canvas.id==='board')window.__drawn.push(String(t));return f.call(this,t,...a);};});
   await p.goto(`${BASE}?level=${lv}&view=clear`);await p.waitForFunction(()=>window.__PLAYTEST__&&window.__PLAYTEST__.ready,null,{polling:100});
   await p.waitForTimeout(200);await p.evaluate(()=>{window.__drawn.length=0;});await p.waitForTimeout(300);
   const r=await p.evaluate(()=>({card:!document.getElementById('card').hidden,title:document.querySelector('#cardbox h2')?.textContent,phase:window.__PLAYTEST__.snapshot().phase,drawn:[...new Set(window.__drawn)]}));
   await p.screenshot({path:path.join(OUT,`${w}x${h}-L${lv}-clear.png`)});
   check(tag,'win card is up on a cleared level',r.card&&r.phase==='cleared'&&r.title,r);
   check(tag,'canvas behind the card does not paint the level-complete title',r.drawn.length>0&&!r.drawn.includes(r.title)&&!r.drawn.some(t=>/关完成$/.test(t)),r);
   check(tag,'zero page errors',errs.length===0,errs);await p.close();
  }
  // level 3: play real seeds with the human autopilot until one is won after being caught with the shrimp
  const tag=`${w}x${h} L3 caught`,p=await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:touch?2:1,hasTouch:touch,isMobile:touch});
  await p.goto(`${BASE}?level=3`);await p.waitForFunction(()=>window.__PLAYTEST__&&window.__PLAYTEST__.ready,null,{polling:100});
  const r=await p.evaluate(()=>{
   const C=window.SneakCore,T=window.__PLAYTEST__;
   for(let sd=1;sd<60;sd++){T.setSeed(sd);const S=window.__sneak.state,pilot=C.human(S,sd);
    for(let n=0;n<6000&&S.phase!=='cleared';n++){pilot();T.step(1000*C.CFG.tick);}
    if(S.phase==='cleared'&&S.caughtWin&&S.hissed===0)return {sd,card:!document.getElementById('card').hidden,text:document.getElementById('cardbox').innerText,hud:document.getElementById('stats').innerText};}
   return null;});
  check(tag,'found a level-3 win after being caught, never sent back',r&&r.card,r);
  if(r){
   const caught=r.text.includes('当场被抓包');
   check(tag,'card does not say 「被发现 0 次」 next to 「当场被抓包」',caught&&!/被发现\s*0\s*次/.test(r.text),r);
   check(tag,'card does not claim she never noticed',!/没被.*发现/.test(r.text),r);
   await p.screenshot({path:path.join(OUT,`${w}x${h}-L3-caught-win.png`)});
  }
  await p.close();
 }
 await b.close();console.log(`${total-failed}/${total} passed`);process.exitCode=failed?1:0;
})().catch(e=>{console.error(e);process.exit(1);});
