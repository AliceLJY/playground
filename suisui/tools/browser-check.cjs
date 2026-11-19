// Browser acceptance for 碎碎平安 (SPEC 6.5–6.9), run by hand (not part of CI). Needs Playwright with its Chromium.
//   python3 -m http.server 8971 --bind 127.0.0.1            (inside suisui/)
//   NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <output-dir> [page-url]
// page-url defaults to http://127.0.0.1:8971/index.html; online it is https://aliceljy.github.io/playground/suisui/
// Writes screenshots and report.json into <output-dir>; exits 1 when any check fails. Read the screenshots afterwards.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path');
const out=process.argv[2]||'check-out',base=process.argv[3]||'http://127.0.0.1:8971/index.html';
const page0=new URL(base),dir=page0.pathname.replace(/[^/]*$/,'');
const rel=u=>{const x=new URL(u);return x.origin===page0.origin&&x.pathname.startsWith(dir)?x.pathname.slice(dir.length):null;};
const ALLOWED=new Set(['','index.html','src/core.js','src/game.js','src/draw.js','src/sound.js','vendor/dissolve-atlas.js']);
fs.mkdirSync(out,{recursive:true});
const SIZES={iphone:{viewport:{width:390,height:664},deviceScaleFactor:3,hasTouch:true,isMobile:true},
  android:{viewport:{width:412,height:700},deviceScaleFactor:2.625,hasTouch:true,isMobile:true},
  desktop:{viewport:{width:1280,height:720},deviceScaleFactor:1}};
const report={base,checks:[],runs:[]};let failed=0;
const check=(name,pass,detail)=>{report.checks.push({name,pass:!!pass,detail});if(!pass)failed++;console.log(pass?'ok  ':'FAIL',name,detail==null?'':JSON.stringify(detail));};
const url=q=>base.replace(/[?#].*$/,'')+q;

(async()=>{
  const browser=await chromium.launch();report.browser=browser.version();
  async function open(query,size){
    const ctx=await browser.newContext(SIZES[size]),page=await ctx.newPage(),errors=[],stray=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    page.on('request',r=>{const u=r.url();if(u.startsWith('data:'))return;const p=rel(u);if(p==null||!ALLOWED.has(p))stray.push(u);});
    await page.goto(url(query));
    await page.waitForFunction(()=>window.__suisui&&window.__suisui.ready&&window.__PLAYTEST__.ready,null,{polling:100,timeout:20000});
    return{ctx,page,errors,stray};
  }
  const probe=page=>page.evaluate(()=>window.__suisui.probe());
  // share of non-transparent pixels in each item canvas, and in the particle overlay
  const inked=page=>page.evaluate(()=>[...document.querySelectorAll('.slot canvas')].map(c=>{const x=c.getContext('2d'),d=x.getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=16)if(d[i]>20)n++;return n/(d.length/16);}));
  const overlayInk=page=>page.evaluate(()=>{const c=document.querySelector('.dust-overlay'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=32)if(d[i]>20)n++;return n;});

  for(const size of Object.keys(SIZES)){
    const tag=s=>`${size} ${s}`;
    // 6.5 fixed view hero: no errors, own files only, every slot drawn
    let {ctx,page,errors,stray}=await open('?view=hero',size);
    await page.waitForTimeout(300);
    const p0=await probe(page),ink=await inked(page);
    await page.screenshot({path:path.join(out,size+'-hero.png')});
    check(tag('hero: view reported, seed 1'),p0.view==='hero'&&p0.seed===1,{view:p0.view,seed:p0.seed});
    check(tag('hero: every slot has a visible item with real pixels (>= 12% inked)'),ink.length===p0.slots.length&&ink.every(v=>v>=0.12)&&p0.slots.every(s=>s.shown),{ink:ink.map(v=>+v.toFixed(2))});
    check(tag('hero: at least two worries, at most two of anything else'),(()=>{const n={};p0.slots.forEach(s=>n[s.kind]=(n[s.kind]||0)+1);return(n.note||0)>=2&&Object.entries(n).every(([k,v])=>v<=(k==='note'?3:2));})(),p0.slots.map(s=>s.kind).join(','));

    // 6.9 layout: header, count and the three buttons fully on screen, no overlaps, hit areas >= 44 px
    const boxes=await page.evaluate(()=>Object.fromEntries(['h1','#count','#write','#all','#mute','#shelf'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return[s,{x:r.left,y:r.top,w:r.width,h:r.height}];})));
    const vw=SIZES[size].viewport.width,vh=SIZES[size].viewport.height;
    const inside=Object.entries(boxes).filter(([,b])=>!(b.x>=0&&b.y>=0&&b.x+b.w<=vw+0.5&&b.y+b.h<=vh+0.5)).map(([k])=>k);
    check(tag('layout: title, count, shelf and buttons inside the visible viewport'),inside.length===0,{outside:inside});
    const over=(a,b)=>a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;
    const keys=Object.keys(boxes),clash=[];for(let i=0;i<keys.length;i++)for(let j=i+1;j<keys.length;j++)if(over(boxes[keys[i]],boxes[keys[j]]))clash.push(keys[i]+'/'+keys[j]);
    check(tag('layout: no two of them overlap'),clash.length===0,{clash});
    check(tag('layout: buttons at least 44 px tall and wide'),['#write','#all','#mute'].every(k=>boxes[k].h>=44&&boxes[k].w>=44),{buttons:['#write','#all','#mute'].map(k=>[boxes[k].w,boxes[k].h])});
    const hit=await page.evaluate(()=>['#write','#all','#mute'].every(s=>{const r=document.querySelector(s).getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest(s);}));
    check(tag('layout: the centre of each button reaches that button'),hit);

    // 6.6 a real tap (touch on phones, mouse on desktop) breaks the item, counts, shows words, refills
    const r0=await page.evaluate(()=>window.__suisui.rect(0));
    const cx=r0.x+r0.w*0.45,cy=r0.y+r0.h*0.45;
    if(SIZES[size].hasTouch)await page.touchscreen.tap(cx,cy);else await page.mouse.click(cx,cy);
    await page.waitForTimeout(140);
    const p1=await probe(page),ov=await overlayInk(page);
    await page.screenshot({path:path.join(out,size+'-tap.png')});
    check(tag('tap: item hidden, count +1, words floating, particles on the overlay'),!p1.slots[0].shown&&p1.smashes===1&&p1.floats>=1&&ov>50,{shown:p1.slots[0].shown,smashes:p1.smashes,floats:p1.floats,overlay:ov});
    await page.waitForFunction(()=>{const s=window.__suisui.probe().slots[0];return s.shown&&!s.busy;},null,{polling:100,timeout:4000}).catch(()=>{});
    const p2=await probe(page);
    check(tag('tap: the slot is refilled within 4 s and not with a neighbour\'s kind'),p2.slots[0].shown&&!p2.slots[0].busy&&p2.slots[0].kind!==p2.slots[1].kind&&p2.slots[0].kind!==p2.slots[p2.cols].kind,{slot0:p2.slots[0]});

    // 6.7 hold: press without moving; the charge bar fills, then it bursts by itself
    const r1=await page.evaluate(()=>window.__suisui.rect(1));
    await page.mouse.move(r1.x+r1.w/2,r1.y+r1.h/2);await page.mouse.down();
    await page.waitForTimeout(800);
    const ph=await probe(page),bar=await page.evaluate(()=>{const s=document.querySelectorAll('.slot')[1];return{charging:s.classList.contains('charging'),c:+getComputedStyle(s).getPropertyValue('--c')};});
    await page.screenshot({path:path.join(out,size+'-hold.png')});
    check(tag('hold: charging after 800 ms, bar part-filled, not counted yet'),ph.charging===1&&bar.charging&&bar.c>0.2&&bar.c<1&&ph.smashes===1,{charging:ph.charging,bar,smashes:ph.smashes});
    await page.waitForTimeout(700);
    const pb=await probe(page);
    check(tag('hold: bursts by itself at full charge, counted once'),pb.charging===0&&pb.smashes===2,{charging:pb.charging,smashes:pb.smashes});
    await page.mouse.up();await page.waitForTimeout(200);
    check(tag('hold: letting go after the burst does not count again'),(await probe(page)).smashes===2);

    // 6.7 swipe: press and drag fast to the right
    const r2=await page.evaluate(()=>window.__suisui.rect(2));
    await page.mouse.move(r2.x+r2.w*0.3,r2.y+r2.h/2);await page.mouse.down();
    for(let k=1;k<=6;k++){await page.mouse.move(r2.x+r2.w*0.3+k*12,r2.y+r2.h/2-k*2);await page.waitForTimeout(10);}
    await page.mouse.up();await page.waitForTimeout(160);
    const ps=await probe(page);
    await page.screenshot({path:path.join(out,size+'-swipe.png')});
    check(tag('swipe: flung, counted once'),ps.smashes===3&&!ps.slots[2].shown,{smashes:ps.smashes,slot2:ps.slots[2]});
    await ctx.close();

    // 6.8 a typed worry lands on the shelf with its words
    ({ctx,page,errors,stray}=await open('?view=note',size));
    await page.waitForTimeout(250);
    await page.screenshot({path:path.join(out,size+'-note.png')});
    const open1=await page.evaluate(()=>document.querySelector('#dlg').open);
    await page.fill('#noteText','  明天又要\n交周报了啊啊啊  ');
    await page.click('#noteForm button[type=submit]');
    await page.waitForTimeout(1600);
    const pn=await probe(page);
    await page.screenshot({path:path.join(out,size+'-note-pasted.png')});
    check(tag('note: dialog opens, the typed worry (cleaned, 10 chars) is on the shelf'),open1&&pn.slots.some(s=>s.kind==='note'&&s.text==='明天又要 交周报了啊'&&s.shown),{notes:pn.slots.filter(s=>s.kind==='note').map(s=>s.text)});

    // smash all: everything goes, the shelf comes back
    await page.click('#all');await page.waitForTimeout(500);
    await page.screenshot({path:path.join(out,size+'-all.png')});
    const n=(await probe(page)).slots.length;
    await page.waitForTimeout(n*70+300);   // smash-all breaks one slot every 70 ms
    const pa=await probe(page);
    await page.waitForFunction(()=>window.__suisui.probe().slots.every(s=>s.shown&&!s.busy),null,{polling:150,timeout:6000}).catch(()=>{});
    const pz=await probe(page);
    check(tag('smash all: every slot breaks and every slot is refilled within 6 s'),pa.smashes===pz.slots.length&&pz.slots.every(s=>s.shown&&!s.busy),{smashes:pa.smashes,left:pz.slots.filter(s=>!s.shown||s.busy).length});
    check(tag('no page errors, nothing fetched outside its own files'),errors.length===0&&stray.length===0,{errors,stray});
    report.runs.push({size,kinds:p0.slots.map(s=>s.kind)});
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,1));
  console.log(failed?`${failed} check(s) failed`:'all checks passed');
  process.exit(failed?1:0);
})();
