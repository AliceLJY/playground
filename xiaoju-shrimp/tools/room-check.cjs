// Room polish regressions. Real Canvas pixels, cached paint calls and mobile text geometry.
// NODE_PATH="$(npm root -g)" node tools/room-check.cjs <out-dir> [page-url] [old-game.js]
// Optional old-game.js calibrates the toy-label overlap on an earlier game source.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const out=process.argv[2],base=process.argv[3]||'http://127.0.0.1:8811/xiaoju-shrimp/',old=process.argv[4];
if(!out)throw Error('Expected output directory');fs.mkdirSync(out,{recursive:true});
const overlaps=(a,b)=>a.x<b.x+b.w-.5&&a.x+a.w>b.x+.5&&a.y<b.y+b.h-.5&&a.y+a.h>b.y+.5;
(async()=>{const browser=await chromium.launch({channel:'chrome'}),results=[];let checks=0;
try{
 for(const [width,height,dpr,touch] of [[390,664,2,true],[320,568,2,true],[1440,810,1,false]]){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:dpr,isMobile:touch,hasTouch:touch});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  if(old)await page.route('**/src/game.js',route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync(old,'utf8')}));
  await page.addInitScript(()=>{
   window.__roomCheck={texts:new Map(),roomCalls:0,tableCalls:0};
   const fill=CanvasRenderingContext2D.prototype.fillText;
   CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...rest){
    const s=parseFloat(this.font.match(/[\d.]+px/)?.[0])||10,w=this.measureText(text).width;
    const item={text,x:x-w/2,y:y-s*.65,w,h:s*1.3};
    __roomCheck.texts.set(`${this.canvas.id||'cache'}:${text}:${x}:${y}`,item);return fill.call(this,text,x,y,...rest);
   };
   let art;Object.defineProperty(window,'SneakArt',{get(){return art},set(a){art=a;for(const [key,count] of [['paintRoom','roomCalls'],['coffeeTableTop','tableCalls']]){const f=a[key];a[key]=(...v)=>{__roomCheck[count]++;return f(...v);};}}});
  });
  for(let level=1;level<=3;level++){
   const url=new URL(base);url.search=`?level=${level}&view=start`;await page.goto(url.href);await page.waitForFunction(()=>__PLAYTEST__?.ready,null,{polling:50});
   const state=await page.evaluate(()=>__PLAYTEST__.snapshot());assert.equal(state.view,'start');assert.equal(state.level,level);
   const geometry=await page.evaluate(()=>{
    const visible=el=>!!el.getClientRects().length&&!el.closest('[hidden]');
    const nodes=[...document.querySelectorAll('#title,#stats>span,#legend>span,#msg')].filter(visible);
    return nodes.map(el=>{const r=el.getBoundingClientRect();return {text:el.textContent,x:r.x,y:r.y,w:r.width,h:r.height};});
   });
   for(const r of geometry)assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=width+.5&&r.y+r.h<=height+.5,`UI out of viewport: ${r.text}`);
   for(let i=0;i<geometry.length;i++)for(let j=i+1;j<geometry.length;j++)assert.ok(!overlaps(geometry[i],geometry[j]),`UI overlap: ${geometry[i].text} / ${geometry[j].text}`);
   const cache=await page.evaluate(()=>{const a=[__roomCheck.roomCalls,__roomCheck.tableCalls];for(let i=0;i<120;i++)__sneak.paint();return {before:a,after:[__roomCheck.roomCalls,__roomCheck.tableCalls]};});
   if(!old)assert.deepEqual(cache.before,cache.after,'static room/table must not be repainted in the frame loop');
   await page.screenshot({path:path.join(out,`${width}-L${level}.png`)});
   if(level===2){
    await page.evaluate(()=>{__PLAYTEST__.setSeed(1);for(let i=0;i<100&&!SneakCore.level(1).toyOn(__sneak.state.san.p);i++)__PLAYTEST__.step(100);__sneak.paint();});
    const text=await page.evaluate(()=>[...__roomCheck.texts.values()]);
    const timer=text.filter(t=>/她在听|玩具响|听不见|安静/.test(t.text)),rugs=text.filter(t=>t.text==='可躲');
    assert.ok(timer.some(t=>/玩具响/.test(t.text))&&timer.some(t=>/她在听/.test(t.text))&&rugs.length,'sample must contain both toy states and safe rugs');
    for(const a of timer)for(const b of rugs)assert.ok(!overlaps(a,b),`child status overlaps safe-rug label at ${width}px`);
   }
   checks++;results.push({width,height,dpr,level,cell:state.cell,cache});
  }
  // Default entry, picked level and result card: every visible button is reachable at its centre.
  for(const state of ['entry','clear']){
   const u=new URL(base);if(state==='clear')u.search='?level=3&view=clear';await page.goto(u.href);await page.waitForFunction(()=>__PLAYTEST__?.ready,null,{polling:50});
   const buttons=await page.locator('#card button').evaluateAll(nodes=>nodes.filter(el=>el.getClientRects().length).map(el=>{const r=el.getBoundingClientRect();return {text:el.textContent,x:r.x,y:r.y,w:r.width,h:r.height,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el||el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};}));
   assert.ok(buttons.length);for(const b of buttons)assert.ok(b.hit&&b.x>=0&&b.y>=0&&b.x+b.w<=width+.5&&b.y+b.h<=height+.5,`unreachable ${state} button at ${width}: ${b.text}`);
   for(let i=0;i<buttons.length;i++)for(let j=i+1;j<buttons.length;j++)assert.ok(!overlaps(buttons[i],buttons[j]),'buttons overlap');checks++;
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 const p=await browser.newPage();await p.goto(base);await p.waitForFunction(()=>__PLAYTEST__?.ready,null,{polling:50});
 const pixels=await p.evaluate(()=>{
  const s=100,c=document.createElement('canvas');c.width=700;c.height=900;const ctx=c.getContext('2d',{willReadFrequently:true});
  SneakArt.paintRoom(ctx,SneakCore.level(0),{ox:0,oy:0,s},false);
  const sample=(x,y,w=.035,h=.035)=>{const d=ctx.getImageData(Math.round(x*s),Math.round(y*s),Math.max(1,Math.round(w*s)),Math.max(1,Math.round(h*s))).data,a=[0,0,0];for(let i=0;i<d.length;i+=4)for(let k=0;k<3;k++)a[k]+=d[i+k]/(d.length/4);return a;};
  const lum=a=>.2126*a[0]+.7152*a[1]+.0722*a[2];
  const cabinet={top:lum(sample(.25,5.2)),right:lum(sample(.9,5.2)),bottom:lum(sample(.3,6.88)),shadow:lum(sample(1.02,5.2)),floor:lum(sample(1.17,5.2))};
  const light={upper:lum(sample(1.1,.2,2.5,.55)),lower:lum(sample(1.1,7.2,2.5,.55))};
  const strip=ctx.getImageData(153,195,22,420).data;let leaves=0,flowers=0;for(let i=0;i<strip.length;i+=4){if(strip[i+1]>strip[i]*.95&&strip[i+1]>strip[i+2]*1.2)leaves++;if(strip[i]>strip[i+1]*1.25&&strip[i+1]>strip[i+2]*1.1)flowers++;}
  ctx.clearRect(0,0,c.width,c.height);SneakArt.coffeeTableTop(ctx,0,0,300,200,s,1);
  const table={top:lum(sample(1.5,1.4)),right:lum(sample(2.88,1.4)),bottom:lum(sample(1.5,1.74))};
  return {cabinet,table,light,leaves,flowers};
 });
 fs.writeFileSync(path.join(out,'pixels.json'),JSON.stringify(pixels,null,2));
 for(const [name,item] of [['cabinet',pixels.cabinet],['table',pixels.table]]){
  assert.ok(item.right<item.top*.85,`${name}: right face must be at least 15% darker than top`);
  assert.ok(item.bottom<item.top*.85,`${name}: lower face must be at least 15% darker than top`);checks+=2;
 }
 assert.ok(pixels.cabinet.shadow<pixels.cabinet.floor*.97,'contact/cast shadow must visibly darken the floor to the right');
 assert.ok(pixels.light.upper>pixels.light.lower*1.04,'upper-left warm floor light must survive real rasterization');
 assert.ok(pixels.leaves>100&&pixels.flowers>100,'the rug border must actually contain repeated leaves and flowers');checks+=3;
 await p.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({checks,results,pixels},null,2));
 console.log(JSON.stringify(pixels));console.log(`room-check: ${checks} passed, 0 failed; 3 viewports, 3 rooms, 0 page errors; room/table caches reused`);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
