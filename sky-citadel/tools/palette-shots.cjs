// Browser-native Canvas montage: no image or graphics dependencies to install.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.NODE_PATH||'/opt/homebrew/lib/node_modules']}));
const {renderViews}=require('./palette-render.cjs');
async function montage(pg,rows,file,cellWidth=960){
 const images=rows.map(row=>row.map(({file,label})=>({label,src:'data:image/png;base64,'+fs.readFileSync(file).toString('base64')})));
 const png=await pg.evaluate(async({images,cellWidth})=>{const h=cellWidth*900/1440,c=document.createElement('canvas');c.width=cellWidth*images[0].length;c.height=(h+34)*images.length;const g=c.getContext('2d');g.fillStyle='#102233';g.fillRect(0,0,c.width,c.height);g.font='bold 24px system-ui';
  for(let y=0;y<images.length;y++)for(let x=0;x<images[y].length;x++){const {src,label}=images[y][x],im=new Image();im.src=src;await im.decode();g.drawImage(im,x*cellWidth,y*(h+34)+34,cellWidth,h);g.fillStyle='#ffe2ab';g.fillText(label,x*cellWidth+14,y*(h+34)+25);}return c.toDataURL('image/png').split(',')[1];
 },{images,cellWidth});fs.writeFileSync(file,Buffer.from(png,'base64'));
}
(async()=>{
 const base=process.argv[2]||'file://'+path.resolve(__dirname,'../dist/index.html');
 if(!process.argv.includes('--montage-only'))for(const p of 'abc'){
  const r=await renderViews({base,out:'shots/r3-'+p,query:'palette='+p,periods:true});assert.deepEqual(r.errors,[]);
  for(const v of r.views){assert.equal(v.snapshot.palette,p);assert.equal(v.snapshot.view,v.view);assert.equal(v.snapshot.simTime,12);assert.ok(v.snapshot.drawMax<=15);}
  r.periods.forEach((v,hour)=>{assert.equal(v.snapshot.hour,hour);assert.equal(v.snapshot.palette,p);assert.ok(Number.isFinite(v.metrics.span)&&v.metrics.city.pixels>50000);});
  const noon=r.periods[1],night=r.periods[3];assert.ok(night.metrics.meanLuma<noon.metrics.meanLuma);assert.ok(night.metrics.warmFraction>=.003);assert.equal(noon.snapshot.stars,0);assert.equal(night.snapshot.stars,500);console.log('PASS palette '+p+': cameras, four rendered periods, night windows, draw calls and zero errors');
 }
 const browser=await chromium.launch({channel:'chrome',headless:true});try{const pg=await browser.newPage();
 await montage(pg,[... 'abc'].map(p=>['hero','night'].map(v=>({file:`shots/r3-${p}/${v}.png`,label:p.toUpperCase()+' / '+(p==='a'?'GOLDEN DUSK':p==='b'?'CLEAR SKY':'AZURE & AMBER')+' / '+v.toUpperCase()}))),'shots/r3-palette-options.png');
 for(const view of ['hero','night','wide'])await montage(pg,[[{file:`shots/r3-before/${view}.png`,label:'BEFORE / '+view.toUpperCase()},{file:`shots/r3-c/${view}.png`,label:'C / AFTER / '+view.toUpperCase()}]],`shots/r3-compare-${view}.png`,1440);
 await montage(pg,[...'abc'].map(p=>['dawn','noon','dusk','night'].map(v=>({file:`shots/r3-${p}/time-${v}.png`,label:p.toUpperCase()+' / '+v.toUpperCase()}))),'shots/r3-four-periods.png',720);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
