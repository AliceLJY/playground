// Checks for the 2026-11-25 Duet review: the intro Start button leaves the cat's head clear, and the
// 自动前行 / 自动导航 toggles are coloured by their state, not by which button they are.
// NODE_PATH="$(npm root -g)" node tools/duet-check.cjs <source-or-built-url> <out-dir>
const {chromium}=require('playwright'),fs=require('node:fs');
const [base,out]=process.argv.slice(2);if(!base||!out)throw Error('URL and output directory required');fs.mkdirSync(out,{recursive:true});
const lum=c=>{const m=c.match(/[\d.]+/g).map(Number);return .2126*m[0]+.7152*m[1]+.0722*m[2];};
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=metal']});let failed=0,total=0;
 const check=(tag,name,ok,data)=>{total++;if(!ok)failed++;console.log(`${ok?'PASS':'FAIL'} ${tag} ${name}${ok?'':' '+JSON.stringify(data)}`);};
 for(const [w,h,touch] of [[390,844,true],[414,896,true],[390,664,true],[375,667,true],[360,740,true],[320,568,true],[844,390,true],[844,300,true],[1024,768,true],[390,664,false],[1365,900,false],[1440,900,false]]){
  const tag=`${w}x${h}${touch?' touch':''}`,ctx=await browser.newContext({viewport:{width:w,height:h},hasTouch:touch,isMobile:touch,deviceScaleFactor:touch?2:1}),p=await ctx.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(String(e)));
  await p.goto(base);await p.waitForFunction(()=>window.__ride?.ready,null,{polling:100});await p.waitForTimeout(1200);
  await p.screenshot({path:`${out}/${w}x${h}${touch?"-touch":""}-intro.png`});
  const g=await p.evaluate(()=>{const s=document.getElementById('start').getBoundingClientRect();return {start:{x:s.x,y:s.y,w:s.width,h:s.height},head:window.__ride.catHead};});
  const s=g.start,c=g.head,gap=4,hit=c&&s.x<c.x+c.w+gap&&s.x+s.w+gap>c.x&&s.y<c.y+c.h+gap&&s.y+s.h+gap>c.y;
  check(tag,'Start button leaves the cat head clear',c&&!hit,g);
  check(tag,'Start button inside the viewport',s.x>=0&&s.y>=0&&s.x+s.w<=w&&s.y+s.h<=h,s);
  // ride, then compare the two toggles in both states
  await p.locator('#start').click();
  if(touch)await p.locator('#dialog-action').waitFor({state:'visible'});else await p.waitForTimeout(500);   // narrow windows also ask before departing
  if(await p.locator('#dialog-action').isVisible())await p.locator('#dialog-action').click();
  await p.waitForFunction(()=>__ride.state.phase==='ride',null,{polling:100});await p.waitForTimeout(200);
  const read=()=>p.evaluate(()=>['cruise','assist'].map(id=>{const e=document.getElementById(id),cs=getComputedStyle(e);return {id,pressed:e.getAttribute('aria-pressed'),text:e.textContent,bg:cs.backgroundColor,fg:cs.color};}));
  const judge=(name,t)=>{const on=t.filter(b=>b.pressed==='true'),off=t.filter(b=>b.pressed==='false');
   const same=a=>a.every(b=>b.bg===a[0].bg&&b.fg===a[0].fg);
   check(tag,name,same(on)&&same(off)&&on.every(b=>off.every(o=>lum(b.bg)<lum(o.bg)-40)),t);};
  judge('toggles at start: on is dark, off is light',await read());
  await p.locator('#cruise').click();await p.locator('#assist').click();await p.waitForTimeout(300);
  const flipped=await read();
  check(tag,'both toggles flipped',flipped[0].pressed==='false'&&flipped[1].pressed==='true',flipped);
  judge('toggles after flipping: colours follow state',flipped);
  await p.screenshot({path:`${out}/${w}x${h}${touch?"-touch":""}-ride.png`});
  // ride HUD: speed readout and boost meter pieces do not overlap each other or the controls; the keyboard hint is for keyboards only
  const hud=await p.evaluate(()=>{
   const box=(name,e)=>{if(!e||!e.getClientRects().length)return null;const b=e.getBoundingClientRect();return b.width&&b.height?{name,x:b.x,y:b.y,w:b.width,h:b.height}:null;};
   const q=s=>document.querySelector(s);
   // the big digits: use their ink box, not the 43 px font's line box (which carries empty space above and below the digits)
   const ink=(name,e)=>{const b=box(name,e);if(!b)return null;const cs=getComputedStyle(e),c=document.createElement('canvas').getContext('2d');c.font=`${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const m=c.measureText(e.textContent),base=b.y+(b.h-(m.fontBoundingBoxAscent+m.fontBoundingBoxDescent))/2+m.fontBoundingBoxAscent;return {name,x:b.x,y:base-m.actualBoundingBoxAscent,w:b.w,h:m.actualBoundingBoxAscent+m.actualBoundingBoxDescent};};
   const parts=[ink('速度数字',q('#speed')),box('km/h 街头骑士',q('.speed-readout small')),(()=>{const t=q('.boost-meter>span').firstChild,r=document.createRange();r.selectNodeContents(t);const b=r.getBoundingClientRect();return b.width?{name:'冲刺',x:b.x,y:b.y,w:b.width,h:b.height}:null;})(),box('100%',q('#boost-value')),box('冲刺条',q('.boost-meter>div')),box('冲刺说明',q('.boost-meter small'))].filter(Boolean);
   const others=[box('底栏',q('.bottom-bar')),box('路线图',q('#route-map')),box('地点',q('.place')),...[...document.querySelectorAll('.touch-controls button')].map(e=>box('触控'+e.textContent,e))].filter(Boolean);
   const hit=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y,bad=[];
   for(let i=0;i<parts.length;i++){for(let j=i+1;j<parts.length;j++)if(hit(parts[i],parts[j]))bad.push([parts[i].name,parts[j].name]);for(const o of others)if(hit(parts[i],o))bad.push([parts[i].name,o.name]);}
   const hint=q('.boost-meter small'),shown=!!hint&&!!hint.getClientRects().length&&getComputedStyle(hint).visibility!=='hidden';
   return {bad,hintShown:shown,hintText:hint?.textContent,parts};});
  check(tag,'speed and boost readouts overlap nothing',hud.bad.length===0,hud);
  if(touch)check(tag,'touch screens do not show the keyboard hint',!hud.hintShown,hud);
  else check(tag,'keyboard screens still show the keyboard hint',hud.hintShown&&/Shift/.test(hud.hintText),hud);
  check(tag,'zero page errors',errors.length===0,errors);await ctx.close();
 }
 await browser.close();console.log(`${total-failed}/${total} passed`);process.exitCode=failed?1:0;
})().catch(e=>{console.error(e);process.exit(1);});
