// sRGB framebuffer measurements. CIE76 uses D65/2° Lab, not RGB distances.
export function hsv([r,g,b]) {
  const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
  let h=d===0?0:max===r?((g-b)/d)%6:max===g?(b-r)/d+2:(r-g)/d+4;
  return [(h*60+360)%360,max?d/max:0,max/255];
}
export function lab(rgb) {
  const [r,g,b]=rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
  const f=t=>t>216/24389?Math.cbrt(t):(24389/27*t+16)/116;
  const x=f((r*.4124564+g*.3575761+b*.1804375)/.95047),y=f(r*.2126729+g*.7151522+b*.072175),z=f((r*.0193339+g*.119192+b*.9503041)/1.08883);
  return [116*y-16,500*(x-y),200*(y-z)];
}
export const deltaE=(a,b)=>Math.hypot(...lab(a).map((v,i)=>v-lab(b)[i]));
export const brightness=rgb=>(rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722)/255;
export function summarizePixels(full,isolated,mask,width,height,dpr,leafMask,faceIds) {
  const stride=3,w=Math.floor(width/stride),h=Math.floor(height/stride),count=w*h;
  const codes=new Uint8Array(count),colors=new Uint8Array(count*3),sums=Array.from({length:7},()=>[0,0,0,0]);
  let yellowGreen=0,highSat=0,topSaturation=0,topCount=0,leafCount=0,leafBrightness=0,leafWhite=0;
  const blocks=new Map();
  // Codes: sky 1, ground 2, plants 3, rex 4, grazer 5, ptero 6.
  const classify=i=>mask[i]<25&&mask[i+1]<25&&mask[i+2]>230?1:mask[i]<25&&mask[i+1]>230&&mask[i+2]<25?2:mask[i]>230&&mask[i+1]<25?3:mask[i]>230&&mask[i+1]>230&&mask[i+2]>230?4:mask[i]>230&&mask[i+1]>230&&mask[i+2]<25?5:mask[i]<25&&mask[i+1]>230&&mask[i+2]>230?6:0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    const n=y*w+x,i=((y*stride+1)*width+x*stride+1)*4;
    const rgb=[full[i],full[i+1],full[i+2]], [hue,s,v]=hsv(rgb);
    if(hue>=70&&hue<=110&&s>=.15&&v>=.1)yellowGreen++;
    if(s>.65&&v>.2)highSat++;
    if(y*stride+1>=height*.85){topSaturation+=s;topCount++;}
    const code=classify(i);
    // Erode masks by one actual framebuffer pixel, removing AA boundaries.
    if([i-4,i+4,i-width*4,i+width*4].some(j=>classify(j)!==code))continue;
    codes[n]=code;colors.set(isolated.subarray(i,i+3),n*3);
    if(code){for(let c=0;c<3;c++)sums[code][c]+=isolated[i+c];sums[code][3]++;}
    if(leafMask&&code===3&&[i,i-4,i+4,i-width*4,i+width*4].every(j=>leafMask[j]>230)){
      const rgb=Array.from(isolated.subarray(i,i+3)),[,s,v]=hsv(rgb);
      leafCount++;leafBrightness+=brightness(rgb);if(s<.15&&v>.8)leafWhite++;
    }
    if(faceIds&&code===2&&[i-4,i+4,i-width*4,i+width*4].every(j=>[0,1,2].every(c=>faceIds[j+c]===faceIds[i+c]))){
      const category=Math.floor(faceIds[i+1]/64),y=faceIds[i+1]%64;
      if(category===1||category===2){
        const key=faceIds[i]+','+y+','+faceIds[i+2];
        if(!blocks.has(key))blocks.set(key,{top:[0,0],side:[0,0]});
        const part=blocks.get(key)[category===2?'top':'side'];
        part[0]+=brightness(Array.from(isolated.subarray(i,i+3)));part[1]++;
      }
    }
  }
  const mean=a=>a[3]?a.slice(0,3).map(v=>v/a[3]):null;
  const sky=mean(sums[1]),ground=mean(sums[2]);
  const creatures={};
  for(const [code,type] of [[4,'rex'],[5,'grazer'],[6,'ptero']]) {
    const distances=new Uint16Array(count);distances.fill(10000);
    for(let i=0;i<count;i++)if(codes[i]===code)distances[i]=0;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;distances[i]=Math.min(distances[i],x?distances[i-1]+1:10000,y?distances[i-w]+1:10000);}
    for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){const i=y*w+x;distances[i]=Math.min(distances[i],x<w-1?distances[i+1]+1:10000,y<h-1?distances[i+w]+1:10000);}
    const ring=[0,0,0,0],skyRing=[0,0,0,0];
    for(let i=0;i<count;i++)if((codes[i]===2||codes[i]===1)&&distances[i]>=4*dpr/stride&&distances[i]<=32*dpr/stride){const target=codes[i]===2?ring:skyRing;for(let c=0;c<3;c++)target[c]+=colors[i*3+c];target[3]++;}
    const body=mean(sums[code]),surrounding=mean(ring);
    creatures[type]={pixels:sums[code][3],groundPixels:ring[3],rgb:body,groundRgb:surrounding,deltaE:body&&surrounding?deltaE(body,surrounding):null,deltaL:body&&surrounding?Math.abs(lab(body)[0]-lab(surrounding)[0]):null,skyPixels:skyRing[3],skyRgb:mean(skyRing),skyDeltaE:body&&skyRing[3]?deltaE(body,mean(skyRing)):null};
  }
  const sh=sky?hsv(sky)[0]:null,gh=ground?hsv(ground)[0]:null,diff=sh!==null&&gh!==null?Math.abs(sh-gh):null;
  const paired=[...blocks.values()].filter(b=>b.top[1]>=3&&b.side[1]>=3);
  const sunRatio=paired.length?paired.reduce((sum,b)=>sum+(b.top[0]/b.top[1])/(b.side[0]/b.side[1]),0)/paired.length:null;
  return {sampledPixels:count,yellowGreen:yellowGreen/count,highSat:highSat/count,topSkySaturation:topCount?topSaturation/topCount:null,
    leaves:{pixels:leafCount,brightness:leafCount?leafBrightness/leafCount:null,lowSaturationBrightFraction:leafCount?leafWhite/leafCount:null},
    sunlight:{blocks:paired.length,topBackRatio:sunRatio},skyRgb:sky,groundRgb:ground,skyPixels:sums[1][3],groundPixels:sums[2][3],skyHue:sh,groundHue:gh,skyGroundHueGap:diff===null?null:Math.min(diff,360-diff),creatures};
}
// Thresholds are specified in SPEC; night is measured under the actual warm lamp.
export function paletteFailures(scenes) {
  const failures=[];
  for(const {view,metrics:m} of scenes) {
    const check=(ok,text)=>{if(!ok)failures.push(view+': '+text);};
    check(m.sampledPixels>50000,'frame sample must exist');
    const yellowLimit=view==='hero'?.40:view==='night'?.28:.32;
    check(m.yellowGreen<=yellowLimit,'70–110° pixel fraction exceeds '+(view==='hero'?'.40':view==='night'?'.28':'.32'));
    check(m.highSat<=.28,'HSV S>.65 pixels exceed .28');
    check(m.skyPixels>100&&m.groundPixels>100,'sky and ground samples must exist');
    check(m.skyRgb&&m.skyRgb.reduce((a,b)=>a+b,0)/3>=(view==='night'?8:80),'sky must contain visible nonblack color');
    check(m.skyGroundHueGap>=35,'sky/ground hue gap below 35°');
    if(view==='hero')check(m.topSkySaturation>=.35,'upper 15% saturation below .35');
    if(view==='hero'||view==='wide'){
      check(m.leaves?.pixels>=100,'at least 100 material-ID leaf samples required');
      check(m.leaves?.brightness>=.28,'leaf brightness below .28');
      check(m.leaves?.lowSaturationBrightFraction<.01,'low-saturation bright leaf pixels reach 1%');
      check(m.sunlight?.blocks>=10,'at least 10 paired terrain blocks required');
      check(m.sunlight?.topBackRatio>=1.5,'sunlit top / back side brightness ratio below 1.5');
    }
    if(view==='hero')for(const type of ['rex','grazer']){
      const c=m.creatures[type];check(c.pixels>=30&&c.groundPixels>=30,type+' and adjacent ground must both occur');
      check(c.deltaE>=18,type+' / ground CIE76 ΔE below 18');
    }
    if(view==='hero'){const c=m.creatures.ptero;check(c.pixels>=30&&c.skyPixels>=30,'ptero and adjacent sky must occur');check(c.skyDeltaE>=18,'ptero / sky CIE76 ΔE below 18');}
    if(view==='wide'){const c=m.creatures.ptero;check(c.pixels>=30&&c.groundPixels>=30,'wide ptero and adjacent ground must occur');check(c.deltaE>=18,'wide ptero / ground CIE76 ΔE below 18');}
    if(view==='night'){
      const c=m.creatures.rex;check(c.pixels>=30&&c.groundPixels>=30,'night rex and adjacent ground must occur');
      check(c.deltaE>=12,'lamp-lit rex / ground CIE76 ΔE below 12');
    }
  }
  return failures;
}
