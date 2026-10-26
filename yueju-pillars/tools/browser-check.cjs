// 粤剧六柱测试的浏览器验收（SPEC 第 7 节 7–9 条），手动跑，不进 CI。
// 需要本机已有的 Playwright 与 Google Chrome，本仓不安装。
//   python3 -m http.server 8957 --bind 127.0.0.1          （在 yueju-pillars/ 里）
//   NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <输出目录> [base-url]
// 输出截图、六张分享图和 report.json；任何一条不过就以 1 退出。
const {chromium}=require('playwright');
const fs=require('fs');
const out=process.argv[2]||'check-out',base=process.argv[3]||'http://127.0.0.1:8957/index.html';
fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true});
  const page=await ctx.newPage(),errs=[],fails=[];
  page.on('pageerror',e=>errs.push(String(e)));
  const noScroll=async tag=>{if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth))fails.push(`${tag}: horizontal scroll`);};

  await page.goto(base);await page.waitForTimeout(300);
  await page.screenshot({path:`${out}/start.png`});await noScroll('start');
  await page.click('#go');await page.waitForTimeout(300);
  await page.screenshot({path:`${out}/q1.png`});await noScroll('q1');

  // 真按键走一遍：每题选指向丑生的那项，没有就选第一项；结果应是丑生（SPEC 3：只朝一根柱选，结果就是它）
  const pick=await page.evaluate(()=>window.__pillar.core.QUESTIONS.map(q=>Math.max(0,q.opts.findIndex(o=>o[1]==='cs'))));
  for(let i=0;i<pick.length;i++){
    if(i===3){await page.screenshot({path:`${out}/q4.png`});await noScroll('q4');}
    await page.locator('.opt').nth(pick[i]).click();await page.waitForTimeout(320);
  }
  await page.waitForTimeout(300);
  const played=await page.evaluate(()=>({id:window.__pillar.st.result,search:location.search}));
  if(played.id!=='cs'||played.search!=='?r=cs')fails.push(`played sweep: expected cs and ?r=cs, got ${JSON.stringify(played)}`);

  const cards=[];
  for(const id of ['wms','xs','zyhd','ebhd','cs','ws']){
    await page.goto(base+'?r='+id);await page.waitForFunction(()=>{const i=window.__pillar.st.img;return i&&(i.complete);},null,{polling:100});await page.waitForTimeout(200);
    const v=await page.evaluate(()=>({name:document.getElementById('rname').textContent,note:document.getElementById('viewing').textContent}));
    if(!v.note.includes('朋友分享给你的是'))fails.push(`?r=${id}: missing the shared-link note`);
    await page.screenshot({path:`${out}/r-${id}.png`,fullPage:true});await noScroll('r-'+id);
    await page.click('#card');await page.waitForTimeout(400);
    const L=await page.evaluate(()=>window.__pillar.st.cardLayout);
    if(!(L.portraitBottom<L.roleTop-20))fails.push(`card ${id}: portrait runs into the role title`);
    if(L.hasArt&&!(L.roleRight<=L.imgLeft-20))fails.push(`card ${id}: role name runs under the illustration`);
    if(!(Math.max(L.roleBottom,L.imgBottom)<=L.boxY-20))fails.push(`card ${id}: fact box overlaps the role or the illustration`);
    if(!(L.boxBottom<=L.foot-20))fails.push(`card ${id}: fact box runs into the footer`);
    if(fs.existsSync(require('path').join(__dirname,'..','img',id+'.webp'))&&!L.hasArt)fails.push(`card ${id}: illustration exists but was not drawn on the card`);
    const u=await page.evaluate(()=>document.getElementById('cardimg').src);
    fs.writeFileSync(`${out}/card-${id}.png`,Buffer.from(u.split(',')[1],'base64'));
    cards.push({id,name:v.name,...L});
  }
  // AGENTS 第 3 节：按「屏幕减掉浏览器栏」的可视高度测，开场「开锣」按钮要整个在首屏里，中心点点到的是它
  const fold=[];
  for(const [w,h] of [[390,664],[412,700],[360,600]]){
    const c2=await browser.newContext({viewport:{width:w,height:h},deviceScaleFactor:2,hasTouch:true,isMobile:true});
    const p2=await c2.newPage();await p2.goto(base);await p2.waitForTimeout(300);
    const r=await p2.evaluate(()=>{const b=document.getElementById('go').getBoundingClientRect();const e=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return{top:b.top,bottom:b.bottom,h:innerHeight,hit:!!e&&(e.id==='go'||e.closest('#go')!==null)};});
    fold.push({w,h,...r});
    if(!(r.bottom<=r.h&&r.top>=0&&r.hit))fails.push(`start ${w}x${h}: 开锣 button not fully on the first screen (${Math.round(r.top)}–${Math.round(r.bottom)} of ${r.h})`);
    await p2.screenshot({path:`${out}/start-${w}x${h}.png`});await c2.close();
  }
  const report={browser:browser.version(),played,cards,fold,errs,fails};
  fs.writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));
  console.log(fails.length?`FAIL\n- ${fails.join('\n- ')}`:'PASS',errs.length?`\npage errors: ${errs.join(' | ')}`:'');
  await browser.close();
  process.exit(fails.length||errs.length?1:0);
})();
