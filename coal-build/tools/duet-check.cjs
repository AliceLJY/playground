// Checks written from Duet's playtest report (2026-11-21, ?v=9651260). Run by hand like browser-check.cjs:
//   NODE_PATH="$(npm root -g)" node tools/duet-check.cjs <output-dir> [page-url]
// R1 the price pills never read 差 0 / 差 -N (Duet saw 差 -65 between finishing a building and the result card)
// R2 tapping the 糖水！点我 bubble collects the cart (Duet missed it three times)
// R3 tapping a card you cannot afford answers with words on screen within 150 ms (Duet: 点灰卡无任何反应)
// R4 the album and result cards are opaque: nothing behind them shows through (Duet saw Lv.9 through the result card)
// R5 bricks already laid stand out from the outline still to build (Duet: 新砌砖和半透明虚影颜色太近)
// R6 in 45 s of real-time play with real taps, announcements never overlap each other and no floating text sits on a card
// R7 the target-line label is never covered by the tea-cart bubble
// second report (?v=a265d04):
// R8 the target-line label does not sit on the masons on the bamboo plank
// R9 the hint arrow never covers a card's floating note (Lv.N / 还差 N)
// R10 floating notes about cards never sit on a walking coal ball
// R2b collecting the tea cart says so on screen (糖水真甜)
const {chromium}=require('playwright');const fs=require('fs'),path=require('path');
const out=process.argv[2]||'duet-out',base=(process.argv[3]||'http://127.0.0.1:8971/index.html').replace(/[?#].*$/,'');fs.mkdirSync(out,{recursive:true});
let failed=0;const check=(n,p,d)=>{if(!p)failed++;console.log(p?'ok  ':'FAIL',n,d==null?'':JSON.stringify(d).slice(0,400));};
const ov=(a,b)=>a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;
const PHONE={viewport:{width:390,height:664},deviceScaleFactor:2,hasTouch:true,isMobile:true};
(async()=>{
  const b=await chromium.launch();
  const open=async q=>{const ctx=await b.newContext(PHONE),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+q);await page.waitForFunction(()=>window.__coalbuild&&window.__coalbuild.ready,null,{polling:100,timeout:20000});return{ctx,page,errors};};
  const probe=page=>page.evaluate(()=>window.__coalbuild.probe());
  const tapAt=async(page,x,y)=>{const p=await probe(page);await page.touchscreen.tap(x+p.ox,y);};
  const start=async page=>{const p=await probe(page);await tapAt(page,p.layout.button.x+p.layout.button.w/2,p.layout.button.y+p.layout.button.h/2);};

  // R1
  {const {ctx,page}=await open('?seed=2');await start(page);const bad=[];
    for(let i=0;i<40;i++){const p=await page.evaluate(()=>window.__coalbuild.autoplay('normal',8));await page.waitForTimeout(60);
      const t=await page.evaluate(()=>window.__coalbuild.cardText());for(const k in t)if(/差 (-|0(\s|$))/.test(t[k]))bad.push({phase:p.phase,k,t:t[k]});if(p.phase!=='play')break;}
    await page.waitForTimeout(300);const t=await page.evaluate(()=>window.__coalbuild.cardText());for(const k in t)if(/差 (-|0(\s|$))/.test(t[k]))bad.push({phase:'done',k,t:t[k]});
    await page.screenshot({path:path.join(out,'r1-done.png')});
    check('R1: price pills never read 差 0 or a negative number',bad.length===0,bad.slice(0,4));await ctx.close();}

  // R2 + R7
  {const {ctx,page}=await open('?seed=4');await start(page);
    await page.evaluate(()=>{while(!window.__coalbuild.probe().event&&window.__coalbuild.probe().t<60)window.__PLAYTEST__.step(250);});
    await page.waitForTimeout(500);let p=await probe(page);
    const er=p.eventRect,bub=p.bubble||{x:er.x+4+33-40,y:p.layout.ground-76-12,w:80,h:24};
    await page.screenshot({path:path.join(out,'r2-tea.png')});
    const lr=p.labelRect;check('R7: the target-line label is not under the tea bubble',lr&&!ov(lr,bub),{label:lr,bubble:bub});
    const c0=p.coins;await tapAt(page,bub.x+bub.w/2,bub.y+bub.h/2);await page.waitForTimeout(80);p=await probe(page);
    check('R2: tapping the 糖水！点我 bubble collects the cart',!p.event&&p.coins>c0,{c0,coins:p.coins,event:p.event});
    await page.waitForTimeout(900);const tb2=await page.evaluate(()=>window.__coalbuild.textBoxes());
    check('R2b: one second later the screen still says 糖水真甜',tb2.some(t=>/糖水真甜/.test(t.t)),tb2.map(t=>t.t));await ctx.close();}

  // R3
  {const {ctx,page}=await open('?seed=3');await start(page);await page.waitForTimeout(300);let p=await probe(page);
    const c=p.layout.cards.find(c=>c.kind==='wage');const before=(await page.evaluate(()=>window.__coalbuild.textBoxes())).length;
    await tapAt(page,c.x+c.w/2,c.y+c.h/2);await page.waitForTimeout(150);const tb=await page.evaluate(()=>window.__coalbuild.textBoxes());
    await page.screenshot({path:path.join(out,'r3-grey-tap.png')});
    check('R3: tapping a card you cannot afford shows words within 150 ms',tb.length>before&&tb.some(t=>/差|还/.test(t.t)),tb.map(t=>t.t));await ctx.close();}

  // R4
  for(const v of ['album','done']){const {ctx,page}=await open('?view='+v);await page.waitForTimeout(v==='done'?2600:800);const p=await probe(page);
    const clip={x:p.ox,y:0,width:p.layout.w,height:Math.floor(p.layout.button.y-12)};
    const a=await page.screenshot({clip});await page.evaluate(()=>window.__coalbuild.bareOverlay(true));await page.waitForTimeout(200);const bshot=await page.screenshot({clip});
    check(`R4: ${v} card is opaque (same pixels with nothing drawn behind it)`,a.equals(bshot),{bytesA:a.length,bytesB:bshot.length});await ctx.close();}

  // R5
  {const {ctx,page}=await open('?view=hero');await page.waitForTimeout(800);const p=await probe(page);
    const lum=await page.evaluate(([R,fy])=>{const cv=document.getElementById('stage'),c=cv.getContext('2d'),d=window.__coalbuild.probe().dpr,ox=window.__coalbuild.probe().ox;
      const band=(y0,y1)=>{const x0=Math.round((ox+R.x+R.w*0.1)*d),w=Math.round(R.w*0.8*d),img=c.getImageData(x0,Math.round(y0*d),w,Math.round((y1-y0)*d)).data;let s=0;for(let i=0;i<img.length;i+=4)s+=0.299*img[i]+0.587*img[i+1]+0.114*img[i+2];return s/(img.length/4);};
      return{laid:band(fy+6,fy+26),ghost:band(fy-40,fy-14)};},[p.layout.building,p.frontRowY]);
    await page.screenshot({path:path.join(out,'r5-hero.png')});
    check('R5: the outline still to build is clearly lighter than laid bricks (≥ 45 levels)',lum.ghost-lum.laid>=45,lum);await ctx.close();}

  // R6
  {const {ctx,page,errors}=await open('?seed=6');await start(page);const clash=[];const L=(await probe(page)).layout;
    const t0=Date.now();let k=0;
    while(Date.now()-t0<60000){const p=await probe(page);
      if(k%7===3){const c=L.cards[(k>>3)%4];await tapAt(page,c.x+c.w/2,c.y+c.h/2);}
      else if(k%3===0&&C_KIND(p.hint.target)){const c=L.cards.find(c=>c.kind===p.hint.target);await tapAt(page,c.x+c.w/2,c.y+c.h/2);}
      else if(p.hint.target==='skill')await tapAt(page,L.skill.x+32,L.skill.y+32);
      else if(p.hint.target==='event'&&p.eventRect)await tapAt(page,p.eventRect.x+p.eventRect.w/2,p.eventRect.y+p.eventRect.h-20);
      else await tapAt(page,L.building.x+L.building.w/2,L.ground-12);
      k++;
      const tb=await page.evaluate(()=>window.__coalbuild.textBoxes());
      const big=tb.filter(t=>t.kind==='toast'||t.kind==='banner');
      for(let i=0;i<big.length;i++)for(let j=i+1;j<big.length;j++)if(ov(big[i],big[j]))clash.push([big[i].t,big[j].t]);
      for(const t of tb)for(const c of L.cards)if(ov(t,c))clash.push([t.t,'card '+c.kind]);
      const ab=await page.evaluate(()=>window.__coalbuild.arrowBoxes()),crew=await page.evaluate(()=>window.__coalbuild.crew()),pp=await probe(page);
      for(const t of tb.filter(t=>t.kind==='note')){for(const a of ab)if(ov(t,a))clash.push(['R9 '+t.t,'arrow']);for(const w of crew.walkers)if(ov(t,w))clash.push(['R10 '+t.t,'walker']);}
      if(pp.labelRect)for(const m of crew.masons)if(ov(pp.labelRect,m)){clash.push(['R8 target label','mason']);if(!globalThis.__r8){globalThis.__r8=1;console.log('R8 detail',JSON.stringify({label:pp.labelRect,mason:m,front:pp.frontRowY,stage:pp.stage,laid:pp.laid,b:pp.layout.building,stageY:pp.layout.stage.y}));}}
      await page.waitForTimeout(250);}
    await page.screenshot({path:path.join(out,'r6-after45s.png')});
    const uniq=[...new Set(clash.map(x=>x.join(' × ')))];
    const r=x=>uniq.filter(u=>u.startsWith(x));
    check('R6: 60 s of real play: no announcements overlap, no floating text on a card',uniq.filter(u=>!/^R(8|9|10) /.test(u)).length===0,uniq.filter(u=>!/^R(8|9|10) /.test(u)).slice(0,6));
    check('R8: the target label never sits on a mason',r('R8').length===0,r('R8'));
    check('R9: the hint arrow never covers a card note',r('R9').length===0,r('R9').slice(0,4));
    check('R10: card notes never sit on a walking coal ball',r('R10').length===0,r('R10').slice(0,4));
    check('no page errors',errors.length===0,errors);await ctx.close();}
  await b.close();console.log(failed?failed+' failed':'all duet checks passed');process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
function C_KIND(t){return['hire','shed','power','wage'].includes(t);}
