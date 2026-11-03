// NODE_PATH="$(npm root -g)" node tools/practice-check.cjs <out-dir> [page-url]
// Uses normal entry, real keyboard/touch and the existing time-advance hook (no planted results).
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path');
const out=process.argv[2],base=process.argv[3]||'http://127.0.0.1:8944/herb-match/';
fs.mkdirSync(out,{recursive:true});const report={base,checks:[],runs:[]};
const check=(name,pass,detail)=>{report.checks.push({name,pass:!!pass,detail});console.log(pass?'ok':'FAIL',name);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const probe=page=>page.evaluate(()=>window.__herb.probe());
(async()=>{
 const browser=await chromium.launch({channel:'chrome'});report.browser=browser.version();
 try{
 for(const [width,height] of [[390,664],[320,568],[844,340],[1365,900]]){
  const touch=width!==1365,context=await browser.newContext({viewport:{width,height},deviceScaleFactor:touch?2:1,hasTouch:touch,isMobile:touch}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base);await page.waitForFunction(()=>window.__herb?.ready,null,{polling:50});
  const herbs=await page.evaluate(()=>window.HerbCore.HERBS);
  const press=async id=>{const el=page.locator(id);if(touch)await el.tap();else await el.click();};
  // Let Chrome's mobile compositor catch up after a viewport rotation before capture.
  const snap=async name=>{await page.waitForTimeout(150);await page.screenshot({path:path.join(out,`${width}-${name}.png`)});report.runs.push({width,height,name,probe:await probe(page)});};
  async function layout(name){
   const result=await page.evaluate(()=>{
    const panel=document.getElementById('practice'),shown=e=>!!e.getClientRects().length;
    const buttons=[...panel.querySelectorAll('button')].filter(shown).map(e=>{
     const b=e.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
     return{id:e.id||e.textContent.trim(),w:b.width,h:b.height,inside:b.x>=0&&b.y>=0&&b.right<=innerWidth&&b.bottom<=innerHeight,hit:e.contains(hit)};
    });
    const texts=['name','streak','verdict','taste','note','summary'].map(id=>document.getElementById('practice-'+id)).filter(shown).map(e=>{const b=e.getBoundingClientRect();return{id:e.id,size:parseFloat(getComputedStyle(e).fontSize),inside:b.x>=0&&b.y>=0&&b.right<=innerWidth&&b.bottom<=innerHeight};});
    return{buttons,texts,scrollHeight:panel.scrollHeight,height:panel.clientHeight,overflow:panel.scrollHeight>panel.clientHeight};
   });
   check(`${width} ${name}: buttons visible, hit-tested and >=44px`,result.buttons.length>0&&result.buttons.every(b=>b.w>=44&&b.h>=44&&b.inside&&b.hit),result);
   check(`${width} ${name}: text visible >=16px; no vertical clipping`,result.texts.length>0&&result.texts.every(t=>t.inside&&t.size>=16)&&!result.overflow,result);
  }
  await page.keyboard.press('Enter');
  let normalInputs=0;
  for(let step=0;step<110&&(await probe(page)).screen==='play';step++){
   await page.evaluate(()=>window.__herb.advance(.85));const p=await probe(page);
   const front=p.state.herbs.filter(h=>h.age>=.18).sort((a,b)=>b.cy-a.cy)[0];
   if(front){const n=herbs.find(h=>h.name===front.name).nature;await page.keyboard.press(String(((normalInputs%3===0?n+1:n)%4)+1));normalInputs++;}
  }
  const original=(await probe(page)).state.result;
  check(`${width} real keys complete normal round and create slips`,normalInputs>30&&original?.wrong>5&&(await probe(page)).screen==='result',{normalInputs,wrong:original?.wrong});
  if(!original)throw new Error('normal input sequence did not reach result');
  const unique=[...new Set(original.slips.map(x=>x.k))];
  check(`${width} repeated slips actually sampled`,original.slips.length>unique.length&&unique.length>1);
  const details=page.locator('#review-list details').last();await details.locator('summary').click();await details.locator('.review-chosen').scrollIntoViewIfNeeded();
  const scroll=await page.locator('#review').evaluate(e=>e.scrollTop);
  const entry=await page.locator('#practice-start').boundingBox();
  check(`${width} optional entry visible and touch sized`,entry&&entry.width>=44&&entry.height>=44&&entry.y>=0&&entry.y+entry.height<=height,entry);
  await snap('result');await press('#practice-start');
  let p=await probe(page);
  check(`${width} entry really starts review of only these slips`,p.screen==='practice'&&same(p.practice.items.map(x=>x.k),unique));
  await layout('question');await snap('question');
  let answers=0,wrong=0,resets=0;const appearances=new Map(),keyFamilies=[['1','2','3','4'],['a','s','d','f'],['ArrowLeft','ArrowDown','ArrowUp','ArrowRight']];
  const first=p.practice.items[0].k;
  while((p=await probe(page)).practice?.phase!=='done'&&answers<90){
   const before=p.practice,item=before.items[before.index],n=herbs[item.k].nature,count=(appearances.get(item.k)||0)+1;appearances.set(item.k,count);
   const bad=item.k===first&&count===2,b=bad?(n+1)%4:n;
   if(answers%2===0)await press(`#practice-choices button:nth-child(${b+1})`);else await page.keyboard.press(keyFamilies[answers%3][b]);
   answers++;p=await probe(page);
   check(`${width} answer ${answers}: real input enters feedback`,p.practice.phase==='feedback'&&p.practice.feedback.chosen===b);
   if(bad){
    wrong++;if(item.streak===1&&p.practice.items[before.index].streak===0)resets++;
    check(`${width} mistake clears only this streak`,p.practice.items.every((x,i)=>x.streak===(i===before.index?0:before.items[i].streak)));
    const held=p.practice;
    await page.evaluate(()=>window.__herb.advance(90));await page.keyboard.press(String(n+1));
    await page.keyboard.down(String(n+1));await page.keyboard.down(String(n+1));await page.keyboard.up(String(n+1));
    check(`${width} 90 seconds and duplicate answers cannot dismiss label`,same((await probe(page)).practice,held));
    if(width===390){await page.setViewportSize({width:844,height:340});await layout('rotated feedback');check('rotation preserves review progress',same((await probe(page)).practice,held));await snap('rotated-feedback');await page.setViewportSize({width,height});}
    await layout('wrong label');await snap('wrong');
   }
   if(answers===1){await layout('correct label');await snap('correct');}
   if(answers%2===0)await press('#practice-next');else await page.keyboard.press(answers%3===0?'Space':'Enter');
  }
  p=await probe(page);
  check(`${width} completed with real mistakes, reset and retry`,wrong===1&&resets===1&&p.practice.phase==='done'&&p.practice.items.every(x=>x.streak===2),{answers,wrong,resets});
  check(`${width} completion counts actual mastered herbs`,await page.locator('#practice-summary').textContent()===`今天认熟了 ${unique.length} 味`);
  check(`${width} result unchanged by review`,same(p.state.result,original));
  await layout('done');await snap('done');await press('#practice-back');p=await probe(page);
  check(`${width} back clears review and preserves original result`,p.screen==='result'&&p.practice===null&&same(p.state.result,original));
  check(`${width} return keeps expanded slip and scroll position`,await details.evaluate(e=>e.open)&&Math.abs(await page.locator('#review').evaluate(e=>e.scrollTop)-scroll)<=1);
  // Abort a fresh practice, re-enter, finish again, then use its normal-round restart.
  await press('#practice-start');await page.keyboard.press('1');await press('#practice-back');await press('#practice-start');
  check(`${width} abandoned practice leaves no progress on re-entry`,(await probe(page)).practice.items.every(x=>x.streak===0));
  let guard=0;
  while((p=await probe(page)).practice.phase!=='done'&&guard++<40){
   const item=p.practice.items[p.practice.index];await page.keyboard.press(String(herbs[item.k].nature+1));await page.keyboard.press('Enter');
  }
  await press('#practice-restart');p=await probe(page);
  check(`${width} completion restart creates a clean normal round`,p.screen==='play'&&p.practice===null&&p.state.score===0&&p.state.t<.5&&p.state.wrong===0&&p.state.result===null);
  await page.evaluate(()=>window.__herb.advance(1));p=await probe(page);const h=p.state.herbs[0];await page.keyboard.press(String(herbs.find(x=>x.name===h.name).nature+1));
  check(`${width} normal keyboard works after review restart`,(await probe(page)).state.correct===1);await snap('normal-again');
  // A genuinely flawless round has no review entry.
  await page.evaluate(()=>window.__herb.start(3).autopilot('precise',3).advance(77));
  check(`${width} flawless round has no practice entry`,(await probe(page)).state.result.slips.length===0&&await page.locator('#practice-start').isHidden());
  if(width===320||width===844){
   // Let all herbs actually fall, then inspect every existing note, including toxicity and the longest line.
   await page.evaluate(()=>window.__herb.start(5).advance(77));await press('#practice-start');
   check(`${width} label coverage really includes all 16 herbs`,(await probe(page)).practice.items.length===16);
   for(let i=0;i<16;i++){
    const s=(await probe(page)).practice,item=s.items[s.index],h=herbs[item.k];
    await page.keyboard.press(String((h.nature+1)%4+1));await layout('label '+h.name);
    check(`${width} ${h.name} reuses existing taste and note`,await page.locator('#practice-taste').textContent()===h.taste+' · 归「'+['寒','凉','温','热'][h.nature]+'」篓'&&await page.locator('#practice-note').textContent()===h.note);
    if(item.k===0||item.k===12)await snap('label-'+h.id);
    await page.keyboard.press('Enter');
   }
   await press('#practice-back');
  }
  check(`${width} zero page errors`,errors.length===0,errors);await context.close();
 }
 }finally{await browser.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));}
 process.exitCode=report.checks.some(c=>!c.pass)?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
