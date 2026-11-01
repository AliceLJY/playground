// Arrange untouched reference/r3/r4 screenshots in an HTML contact sheet, then capture it.
// NODE_PATH="$(npm root -g)" node tools/compare.cjs [reference-frame-directory]
const fs=require('fs'),path=require('path'),{chromium}=require('playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'shots/r5');
 const ref=process.argv[2]||'/Volumes/ColdData/产出/2026-11-01-花城海珠-三维场景/原帖视频/frames';
 const img=p=>'data:image/'+(p.endsWith('.jpg')?'jpeg':'png')+';base64,'+fs.readFileSync(p).toString('base64');
 let html='<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#e8e4de;color:#2e3440;font:20px system-ui}header{padding:24px}h1{font-size:30px;margin:0 0 8px}section{display:grid;grid-template-columns:repeat(3,720px)}figure{margin:0;border:1px solid #c5c3bd}figcaption{padding:12px}img{display:block;width:718px;height:449px;object-fit:contain;background:#d5d3ce}</style><header><h1>花城秋岸 · 第五轮读图对照</h1>左：原帖　中：第四轮　右：第五轮。原图保持颜色，仅等比例缩放排版。原帖为质感参考；两轮按同名机位对照，hero 因放大构图调整过距离和视场，其余三个机位坐标不变。</header><section>';
 for(const [f,v] of [['f1','hero'],['f13','bridge'],['f13','pagoda'],['f1','wide']])for(const [label,p] of [[`原帖 ${f}`,path.join(ref,f+'.jpg')],[`第四轮 ${v}`,path.join(root,'shots/r4',v+'.png')],[`第五轮 ${v} · 白天`,path.join(out,v+'.png')]])html+=`<figure><figcaption>${label}</figcaption><img src="${img(p)}"></figure>`;
 html+='</section>';fs.writeFileSync(path.join(out,'compare.html'),html);
 const browser=await chromium.launch({channel:'chrome',headless:true});try{const pg=await browser.newPage({viewport:{width:2160,height:1200},deviceScaleFactor:1});await pg.setContent(html);await pg.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));await pg.screenshot({path:path.join(out,'compare.png'),fullPage:true});}finally{await browser.close();}
 console.log(path.join(out,'compare.png'));
})().catch(e=>{console.error(e);process.exitCode=1;});
