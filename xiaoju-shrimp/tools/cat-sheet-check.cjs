// Offline browser check. Run with an existing Playwright installation.
// NODE_PATH="$(npm root -g)" node tools/cat-sheet-check.cjs <out-dir>
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const out=process.argv[2];
if(!out)throw new Error('Expected output directory');
fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await chromium.launch();
  try{
    const page=await browser.newPage({viewport:{width:1500,height:1200},deviceScaleFactor:2});
    const errors=[],network=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route(/^https?:/,route=>{network.push(route.request().url());return route.abort();});
    await page.goto(pathToFileURL(path.join(__dirname,'cat-sheet.html')).href);
    await page.waitForFunction(()=>window.__CAT_SHEET__?.ready,null,{polling:50});
    const variants=await page.evaluate(()=>[...document.querySelectorAll('canvas')].map(canvas=>{
      const {width,height}=canvas,data=canvas.getContext('2d').getImageData(0,0,width,height).data;
      let pixels=0,minX=width,minY=height,maxX=-1,maxY=-1;
      for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]){
        pixels++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
      }
      return {name:canvas.getAttribute('aria-label'),pixels,clipped:minX<=1||minY<=1||maxX>=width-2||maxY>=height-2};
    }));
    assert.equal(variants.length,104,'both tails, coats, sizes, facings, frames and states must render');
    for(const v of variants){assert.ok(v.pixels>100,`${v.name}: empty canvas`);assert.ok(!v.clipped,`${v.name}: clipped cat`);}
    const masks=await page.evaluate(()=>{
      const picture=document.createElement('canvas'),mask=document.createElement('canvas');
      picture.width=picture.height=mask.width=mask.height=384;
      const a=picture.getContext('2d'),b=mask.getContext('2d');
      const fill=a.fill.bind(a);
      let fills=0,checked=0,different=0,ringHoles=0;
      // Omit only the first normal fill, the contact shadow. All remaining RGBA must match hitMask.
      a.fill=(...args)=>{if(fills++>0)fill(...args);};
      for(const kind of ['orange','calico'])for(const tail of ['ring','curl'])for(const size of [40,64,96])
      for(const angle of [0,Math.PI/2,Math.PI,-Math.PI/2])for(const walk of [-1,.125])for(const t of [0,.8])
      for(const state of ['normal','puff','carry']){
        for(const ctx of [a,b]){
          ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,384,384);ctx.scale(2,2);
        }
        fills=0;
        const options={kind,tail,walk,t,[state]:true};
        SneakArt.cat(a,96,96,size,angle,options);
        SneakArt.cat(b,96,96,size,angle,{...options,hitMask:true});
        const actual=a.getImageData(0,0,384,384).data,hit=b.getImageData(0,0,384,384).data;
        if(actual.some((value,i)=>value!==hit[i]))different++;
        if(tail==='ring'&&t===0&&walk===-1&&angle===0&&state==='normal'){
          const x=Math.floor((96-.342*size)*2),y=Math.floor((96+.327*size)*2);
          if(b.getImageData(x,y,1,1).data[3]===0)ringHoles++;
        }
        checked++;
      }
      return {checked,different,ringHoles};
    });
    assert.equal(masks.checked,576,'sample both tails, coats, three sizes, four facings, two strides/times and three states');
    assert.equal(masks.different,0,'hitMask must match every visible RGBA pixel after omitting the contact shadow');
    assert.equal(masks.ringHoles,6,'both coats at every size must leave a real unclickable hole inside tail A');
    assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
    await page.screenshot({path:path.join(out,'r3-cat-sheet.png'),fullPage:true});
    fs.writeFileSync(path.join(out,'r3-cat-sheet.json'),JSON.stringify({variants,masks,errors,network},null,2));
    console.log('cat-sheet-check: 104 variants, 0 clipped, 576 exact hitMask matches, 6 open ring centres, 0 page errors, 0 network requests');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
