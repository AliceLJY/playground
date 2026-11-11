// A single generated nearest-filtered atlas. No imported raster assets.
export function createTerrainAtlas(THREE,palette) {
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=16;
  const ctx=canvas.getContext('2d'),image=ctx.createImageData(256,16);
  const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  const t=palette.texture,names=['grassTop','grassSide','dirt','stone','sand','logEnd','log','plank','leaf','amber','ore','amber','amber','fern','water','pine'];
  const shift=(base,n)=>base.map(v=>v+n),mix=(a,b,k)=>a.map((v,i)=>Math.round(v*(1-k)+b[i]*k));
  for(let tile=0;tile<16;tile++)for(let y=0;y<16;y++)for(let x=0;x<16;x++){
    const [hex,amp]=t[names[tile]],base=rgb(hex),hash=(Math.imul(x+17*tile,374761393)^Math.imul(y,668265263))>>>0,grain=(((hash^hash>>>13)>>>0)%(amp*2+1))-amp;
    let c=shift(base,grain),alpha=255;
    if(tile===0){if((x*3+y*7)%13<1)c=shift(rgb(palette.grassLight),grain);if((x+y*3)%19===0)c=shift(base,-9);}
    if(tile===1&&y<3+(x*7%3))c=shift(rgb(t.grassTop[0]),grain-3);
    if([1,2].includes(tile)&&(x+y*5)%23<2&&y>4)c=shift(base,-16);
    if([3,10].includes(tile)){
      if(y===(Math.floor(x/5)%2?10:6)||(x+y*2)%31===0)c=shift(rgb(t.stone[0]),-20);
      if(y===2&&x>2&&x<12)c=shift(rgb(t.stone[0]),18);
      if(tile===10&&((x-5)**2+(y-5)**2<7||(x-11)**2+(y-11)**2<9))c=shift(base,grain+12);
    }
    if(tile===4&&(x*3+y)%17===0)c=shift(base,-18);
    if(tile===5){const ring=Math.floor(Math.max(Math.abs(x-7.5),Math.abs(y-7.5)));if(ring%3===0||x===1||y===1||x===14||y===14)c=shift(base,-30);}
    if(tile===6)c=shift(base,((x+Math.floor(y/5))%5<2?-17:12)+grain);
    if(tile===7){if(y%5===0||(x===(Math.floor(y/5)%2?11:4)&&y%5<4))c=shift(base,-29);else if(y%5===1)c=shift(base,17);else if((x*2+y)%17<2)c=shift(base,-12);}
    if(tile===8||tile===13||tile===15){
      // Small edge gaps read as foliage, with no pale painted flecks.
      if(tile!==15&&x===0&&y>=4&&y<=7)alpha=0;
      if(tile===8)c=shift(rgb(palette.leafShades[(x*3+y*7)%17<2?3:(x+y*3)%7<2?0:(x*5+y)%9<3?2:1]),grain);
      if(tile===15&&(x+y*2)%7<3)c=shift(rgb(palette.pineLight),grain);
      if(tile===13&&Math.abs(x-7.5)<1)c=shift(base,10);
    }
    if(tile===9){alpha=168;if(x===2||y===2)c=mix(base,[245,220,158],.65);if(Math.abs(x-y-2)<2&&x>5&&x<12)c=shift(base,-40);}
    if(tile===14&&y%6===0&&(x+y)%7<3)c=shift(base,9);
    image.data.set([...c.map(v=>Math.max(0,Math.min(255,v))),alpha],(y*256+tile*16+x)*4);
  }
  ctx.putImageData(image,0,0);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=texture.minFilter=THREE.NearestFilter;texture.generateMipmaps=false;return texture;
}
export function createWaterTexture(THREE,atlas){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=16;canvas.getContext('2d').drawImage(atlas.image,224,0,16,16,0,0,16,16);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(95,95);texture.magFilter=texture.minFilter=THREE.NearestFilter;texture.generateMipmaps=false;return texture;
}
export function createSkyTexture(THREE,sky,night=false){
  const canvas=document.createElement('canvas');canvas.width=1;canvas.height=256;const ctx=canvas.getContext('2d'),gradient=ctx.createLinearGradient(0,0,0,256);
  gradient.addColorStop(0,night?sky.nightTop:sky.zenith);gradient.addColorStop(.35,night?sky.nightHorizon:sky.middle);gradient.addColorStop(.5,night?sky.nightHorizon:sky.horizon);gradient.addColorStop(1,night?sky.nightHorizon:sky.horizon);ctx.fillStyle=gradient;ctx.fillRect(0,0,1,256);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.mapping=THREE.EquirectangularReflectionMapping;texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;return texture;
}
