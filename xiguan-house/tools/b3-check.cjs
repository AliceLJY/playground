const skipIntro = url => { const u = new URL(url); u.searchParams.set('intro', 'skip'); return u.href; };
// NODE_PATH="$(npm root -g)" node tools/b3-check.cjs <out-dir> <base-url>
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path');
const out=process.argv[2],base=process.argv[3];fs.mkdirSync(out,{recursive:true});
const checks=[],check=(name,pass,detail)=>{checks.push({name,pass:!!pass,detail});console.log(pass?'ok':'FAIL',name);};
(async()=>{const b=await chromium.launch({channel:'chrome'});
 for(const [width,height] of [[390,664],[1365,900],[1440,810],[320,568],[844,340]]){
  const p=await b.newPage({viewport:{width,height},deviceScaleFactor:1}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(skipIntro(base));await p.waitForFunction(()=>window.__xiguan?.ready,null,{polling:50});
  await p.locator('#toggle').click();await p.waitForTimeout(350);
  const pause=await p.locator('#inspect-pause').count();check(`${width}: mid-motion inspection control exists`,pause);
  if(pause){
   await p.locator('#inspect-pause').click();const at=await p.evaluate(()=>window.__xiguan.s);await p.waitForTimeout(650);
   check(`${width}: paused pose remains between endpoints`,await p.evaluate(at=>!window.__xiguan.busy&&window.__xiguan.s===at&&at>0&&at<window.__xiguan.T,at),at);
   await p.screenshot({path:path.join(out,`${width}-paused.png`)});
   await p.locator('#inspect-pause').focus();await p.keyboard.press('Space');
  }
  await p.waitForFunction(()=>!window.__xiguan.busy&&window.__xiguan.s===window.__xiguan.T,null,{polling:50,timeout:10000});
  const buttons=p.locator('.landmark');check(`${width}: three named landmarks appear after opening`,await buttons.count()===3);
  await p.screenshot({path:path.join(out,`${width}-open.png`)});
  if(await buttons.count()===3){
   const geometry=await buttons.evaluateAll(bs=>bs.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};}));
   check(`${width}: landmark targets fit, do not overlap and are 44px`,geometry.every((r,i)=>r.x>=0&&r.y>=0&&r.right<=width&&r.bottom<=height&&r.w>=44&&r.h>=44&&r.hit&&geometry.slice(i+1).every(q=>r.right<=q.x||q.right<=r.x||r.bottom<=q.y||q.bottom<=r.y)),geometry);
   // 2026-11-11 review: the 天井 label sat on the door god's shrine and the opened doors beside it. A label may rest on floor,
   // walls and the folded-back roof, never on furniture or the doors. Pieces are taken from the model by name and projected
   // with the page's own projection; each piece's screen outline (convex hull) is tested against the label's box by
   // separating axes, and a label fails when it reaches more than 2 px into a piece.
   const covered=await p.evaluate(()=>{const KEEP=/^(鱼缸|花盆|盆栽|神台|香炉|神楼|八仙桌|桌脚|桌牙|椅|书桌|书$|茶几|茶壶|门官|满洲窗|大门|脚门|趟栊)/,V=XG.worldVerts(window.__xiguan.s);
    const hull=pts=>{pts=[...pts].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const cr=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]),lo=[],up=[];for(const q of pts){while(lo.length>1&&cr(lo.at(-2),lo.at(-1),q)<=0)lo.pop();lo.push(q);}for(const q of pts.reverse()){while(up.length>1&&cr(up.at(-2),up.at(-1),q)<=0)up.pop();up.push(q);}return lo.slice(0,-1).concat(up.slice(0,-1));};
    const depth=(poly,r)=>{const box=[[r.left,r.top],[r.right,r.top],[r.right,r.bottom],[r.left,r.bottom]],axes=[[1,0],[0,1]];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],n=Math.hypot(b[0]-a[0],b[1]-a[1]);if(n>1e-6)axes.push([-(b[1]-a[1])/n,(b[0]-a[0])/n]);}
     let least=Infinity;for(const [ax,ay] of axes){const pr=q=>q.map(v=>v[0]*ax+v[1]*ay),A=pr(poly),B=pr(box),o=Math.min(Math.max(...A),Math.max(...B))-Math.max(Math.min(...A),Math.min(...B));if(o<=0)return 0;least=Math.min(least,o);}return least;};
    const pieces=XG.SOLIDS.map((sd,i)=>({name:sd.name,poly:hull(V[i].map(v=>window.__xiguan.project(v)))})).filter(o=>KEEP.test(o.name));
    return {pieces:pieces.length,labels:[...document.querySelectorAll('.landmark')].map(e=>{const r=e.getBoundingClientRect();return {label:e.textContent,on:[...new Set(pieces.filter(o=>depth(o.poly,r)>2).map(o=>o.name))]};})};});
   check(`${width}: no landmark label lies on furniture or the opened doors`,covered.pieces>30&&covered.labels.every(l=>l.on.length===0),covered);if(!covered.labels.every(l=>l.on.length===0))console.log('   ',JSON.stringify(covered.labels));
   for(let i=0;i<3;i++){
    if(i===1){await buttons.nth(i).focus();await p.keyboard.press('Enter');}else await buttons.nth(i).click();const st=await p.evaluate(()=>({s:window.__xiguan.s,busy:window.__xiguan.busy,detail:window.__xiguan.detail,open:document.querySelector('#detail-dialog').open,text:document.querySelector('#detail-dialog').innerText}));
    check(`${width} landmark ${i}: opens magnified explanation without closing house`,st.open&&!st.busy&&st.s===3.4&&st.detail?.zoom>1&&st.text.length>20,st);
    const ink=await p.evaluate(()=>{const c=document.querySelector('#detail-canvas'),g=c.getContext('2d'),d=g.getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=16)if(d[i]<170&&d[i+1]<170&&d[i+2]<170)n++;return n;});
    check(`${width} landmark ${i}: close-up contains rendered geometry`,ink>50,ink);
    await p.screenshot({path:path.join(out,`${width}-detail-${i}.png`)});
    await p.keyboard.press('Escape');
   }
  }
  await p.locator('#toggle').click();
  if(pause){
   await p.waitForTimeout(350);await p.locator('#inspect-pause').click();const at=await p.evaluate(()=>window.__xiguan.s);await p.waitForTimeout(350);
   check(`${width}: closing can also pause without changing direction`,await p.evaluate(at=>window.__xiguan.s===at&&!window.__xiguan.busy&&window.__xiguan.target===0,at));
   await p.locator('#inspect-pause').click();
  }
  await p.waitForFunction(()=>!window.__xiguan.busy,null,{polling:50,timeout:10000});
  check(`${width}: closes normally`,await p.evaluate(()=>window.__xiguan.s===0));
  check(`${width}: no page errors`,errors.length===0,errors);await p.close();
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({browser:b.version(),checks},null,2));await b.close();if(checks.some(c=>!c.pass))process.exitCode=1;
})();
