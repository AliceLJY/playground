// NODE_PATH="$(npm root -g)" node tools/overlay-check.cjs [shots-dir]
// Two layout rules, measured in a real browser against the fixture preview (no real office, no network):
//   1. every button of the top row (找到我 … 拍张合照) lies inside the page and inside its own panel;
//   2. the group-photo card never lies over the room: its box and the room viewport's box do not intersect.
// Written 2026-11-11 against a build where 拍张合照 ran 41 px past a 1440-wide page and the card sat on the map.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {createPreview}=require('./preview.cjs');
const out=process.argv[2]&&path.resolve(process.argv[2]);
const VIEWPORTS=[
  {name:'desktop-1440',width:1440,height:810},
  {name:'desktop-1280',width:1280,height:720},
  {name:'phone-390',width:390,height:664,touch:true},
  {name:'phone-412',width:412,height:700,touch:true},
  {name:'phone-360',width:360,height:600,touch:true},
];
const failures=[];
const check=(name,ok,details)=>{console.log(`${ok?'ok  ':'FAIL'} ${name}${ok?'':' '+JSON.stringify(details)}`);if(!ok)failures.push(name);};
(async()=>{
  const server=createPreview();await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}/`;
  if(out)fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({headless:true});
  try{
    for(const vp of VIEWPORTS){
      const context=await browser.newContext({viewport:{width:vp.width,height:vp.height},deviceScaleFactor:2,hasTouch:!!vp.touch,isMobile:!!vp.touch});
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.route('https://**/*',route=>route.abort());
      await page.clock.install({time:new Date('2026-11-01T07:30:00Z')});
      await page.goto(base+'?demo=1');await page.waitForFunction(()=>window.__PLAYTEST__?.ready,null,{polling:100,timeout:20000});
      const row=await page.evaluate(()=>{
        const box=e=>{const b=e.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom};};
        const treat=document.querySelector('#treat'),panel=treat.parentElement;
        return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,panel:box(panel),buttons:[...document.querySelectorAll('#treat .treat-row button')].map(b=>({id:b.id,...box(b),h:b.getBoundingClientRect().height}))};
      });
      check(`${vp.name} row has five buttons`,row.buttons.length===5,row.buttons.map(b=>b.id));
      const outside=row.buttons.filter(b=>b.left<-0.5||b.right>row.width+0.5||b.left<row.panel.left-0.5||b.right>row.panel.right+0.5);
      check(`${vp.name} every top-row button inside the page and its panel`,outside.length===0,{width:row.width,panel:row.panel,outside});
      check(`${vp.name} top-row buttons at least 36 px tall`,row.buttons.every(b=>b.h>=36),row.buttons.map(b=>[b.id,b.h]));
      check(`${vp.name} no horizontal page overflow`,row.scrollWidth<=row.width,row);
      if(out)await page.screenshot({path:path.join(out,`${vp.name}-row.png`)});
      // Ask for a photo; the card appears once the greeting is over.
      await page.locator('#pose').click();await page.clock.runFor(1800);
      await page.waitForFunction(()=>document.querySelector('#photo-img').naturalWidth>0,null,{polling:100,timeout:20000});
      for(let i=0;i<20&&await page.locator('#photo').isHidden();i++)await page.clock.runFor(500);
      check(`${vp.name} photo card shown`,await page.locator('#photo').isVisible());
      await page.waitForTimeout(150); // real time: layout observers (the floor hint moving clear of the card) run on the next rendered frame
      const card=await page.evaluate(()=>{
        const box=e=>{const b=e.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,w:b.width,h:b.height};};
        const p=box(document.querySelector('#photo')),room=box(document.querySelector('#room-viewport'));
        const ix=Math.max(0,Math.min(p.right,room.right)-Math.max(p.left,room.left)),iy=Math.max(0,Math.min(p.bottom,room.bottom)-Math.max(p.top,room.top));
        const save=document.querySelector('#photo-save'),close=document.querySelector('#photo-close'),mid=e=>{const b=e.getBoundingClientRect();return document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);};
        const hint=document.querySelector('#to-fun'),h=hint&&!hint.hidden?box(hint):null;
        const hx=h?Math.max(0,Math.min(p.right,h.right)-Math.max(p.left,h.left)):0,hy=h?Math.max(0,Math.min(p.bottom,h.bottom)-Math.max(p.top,h.top)):0;
        return {hint:h,hintOverlap:Math.round(hx*hy),photo:p,room,overlap:Math.round(ix*iy),width:innerWidth,height:innerHeight,save:box(save),close:box(close),saveHit:mid(save)===save,closeHit:mid(close)===close};
      });
      check(`${vp.name} photo card does not cover the room`,card.overlap===0,card);
      if(vp.touch)check(`${vp.name} floor hint is on screen while the card is up`,!!card.hint,card.hint);
      check(`${vp.name} photo card clear of the floor hint`,card.hintOverlap===0,{hint:card.hint,photo:card.photo});
      check(`${vp.name} photo card inside the page`,card.photo.left>=-0.5&&card.photo.top>=-0.5&&card.photo.right<=card.width+0.5&&card.photo.bottom<=card.height+0.5,card);
      check(`${vp.name} room keeps at least 150 px of height beside the card`,card.room.h>=150,card.room);
      check(`${vp.name} save and close reachable, 44 px tall`,card.saveHit&&card.closeHit&&card.save.h>=44&&card.close.h>=44,card);
      if(out)await page.screenshot({path:path.join(out,`${vp.name}-photo.png`)});
      await page.locator('#photo-close').click();check(`${vp.name} close hides the card`,await page.locator('#photo').isHidden());
      check(`${vp.name} no page errors`,errors.length===0,errors);
      await context.close();
    }
  }finally{await browser.close();server.close();}
  if(failures.length){console.error(`\n${failures.length} failed`);process.exit(1);}
  console.log('\nall passed');
})().catch(e=>{console.error(e);process.exit(1);});
