const test=require('node:test'),assert=require('node:assert/strict');
test('R3 color math uses sRGB HSV and D65 Lab',async()=>{
 const {hsv,lab,deltaE}=await import('../src/palette-metrics.mjs');
 assert.deepEqual(hsv([0,255,0]),[120,1,1]);assert.ok(Math.abs(lab([255,255,255])[0]-100)<.001);assert.equal(lab([0,0,0])[0],0);
 assert.ok(Math.abs(deltaE([255,255,255],[0,0,0])-100)<.001);
});
test('R3 thresholds reject the actual original green framebuffer measurements',async()=>{
 const {paletteFailures}=await import('../src/palette-metrics.mjs');
 const old=require('./fixtures/r3-before-metrics.json');
 assert.ok(paletteFailures(old.scenes).includes('hero: 70–110° pixel fraction exceeds .40'));
 assert.ok(paletteFailures(old.scenes).includes('hero: HSV S>.65 pixels exceed .28'));
});
test('R3 water atlas grain stays inside its declared symmetric sRGB amplitude',async()=>{
 const THREE=await import('three'),{PALETTE}=await import('../src/palettes.mjs'),{createTerrainAtlas}=await import('../src/textures.mjs');
 const original=global.document;
 try {
  let pixels;
  const ctx={createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:image=>{pixels=image.data;}};
  global.document={createElement:()=>({width:0,height:0,getContext:()=>ctx})};
  const palette=PALETTE;
   const texture=createTerrainAtlas(THREE,palette),[hex,amplitude]=palette.texture.water,base=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
   for(let y=0;y<16;y++)for(let x=0;x<16;x++)for(let c=0;c<3;c++){
    const delta=pixels[(y*256+224+x)*4+c]-base[c];
    assert.ok(delta>=-amplitude&&delta<=amplitude+9,`water grain ${delta} outside declared range [-${amplitude},${amplitude+9}]`);
   }texture.dispose();
 }finally{if(original===undefined)delete global.document;else global.document=original;}
});

test('R4 checks reject measured old C sky and foliage', async () => {
 const {paletteFailures}=await import('../src/palette-metrics.mjs');
 const old=require('./fixtures/r4-before-metrics.json');
 assert.deepEqual(paletteFailures(old.scenes),[
  'hero: upper 15% saturation below .35',
  'hero: leaf brightness below .28',
  'hero: low-saturation bright leaf pixels reach 1%',
  'wide: low-saturation bright leaf pixels reach 1%'
 ]);
});

test('R4 generated broadleaf, pine and fern pixels remain green with transparent gaps', async () => {
 const THREE=await import('three');
 const {PALETTE}=await import('../src/palettes.mjs');
 const {createTerrainAtlas}=await import('../src/textures.mjs');
 const {hsv,brightness}=await import('../src/palette-metrics.mjs');
 const original=global.document;
 let pixels;
 try {
  const context={createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:image=>{pixels=image.data;}};
  global.document={createElement:()=>({getContext:()=>context})};
  const atlas=createTerrainAtlas(THREE,PALETTE);
  for(const tile of [8,13,15]) {
   let opaque=0,holes=0,total=0;
   for(let y=0;y<16;y++)for(let x=0;x<16;x++) {
    const i=(y*256+tile*16+x)*4;
    if(!pixels[i+3]){holes++;continue;}
    const rgb=Array.from(pixels.subarray(i,i+3));
    const [h,s,v]=hsv(rgb);
    assert.ok(h>=85&&h<=150&&s>.3&&v<.75,`tile ${tile} must contain green foliage pixels`);
    total+=brightness(rgb);opaque++;
   }
   assert.ok(opaque>230,`tile ${tile} needs opaque foliage`);
   assert.equal(holes,tile===15?0:4,`tile ${tile} has its authored edge gaps`);
   assert.ok(total/opaque>=.25,`tile ${tile} albedo must retain readable midtones`);
  }
  atlas.dispose();
 } finally {
  if(original===undefined)delete global.document;else global.document=original;
 }
});
