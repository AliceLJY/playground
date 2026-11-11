// Display-referred Rec.709 luma (sRGB bytes / 255), HSV saturation and circular hue.
// Self-contained so Playwright can run this same function on decoded GPU PNGs.
function measurePixels({full,subject,background,sky,mask,width,height}){
 const y=(d,i)=>(.2126*d[i]+.7152*d[i+1]+.0722*d[i+2])/255;
 const hsv=(d,i)=>{const r=d[i]/255,g=d[i+1]/255,b=d[i+2]/255,m=Math.max(r,g,b),n=Math.min(r,g,b),c=m-n;let h=c===0?0:m===r?((g-b)/c+6)%6:m===g?(b-r)/c+2:(r-g)/c+4;return{h:h*Math.PI/3,s:m?c/m:0,v:m};};
 const lum=[],city={n:0,y:0,x:0,z:0,w:0},air={n:0,y:0,x:0,z:0,w:0};let gray=0,sum=0,warm=0;
 const add=(a,d,i)=>{a.n++;a.y+=y(d,i);const c=hsv(d,i);if(c.s>=.01&&c.v>=.05){a.x+=Math.cos(c.h)*c.s;a.z+=Math.sin(c.h)*c.s;a.w+=c.s;}};
 for(let p=0;p<width*height;p++){
  const i=p*4,l=y(full,i);lum.push(l);sum+=l;if(hsv(full,i).s<.12)gray++;
  if(full[i]>150&&full[i]-full[i+2]>25&&full[i+1]>90)warm++;
  const x=p%width,yy=Math.floor(p/width);
  if(x>0&&x<width-1&&yy>0&&yy<height-1&&[p,p-1,p+1,p-width,p+width].every(q=>mask[q*4]>250))add(city,subject,i);
  else if(mask[i]<2&&Math.max(...[0,1,2].map(k=>Math.abs(background[i+k]-sky[i+k])))<=3)add(air,background,i);
 }
 lum.sort((a,b)=>a-b);const p5=lum[Math.floor(lum.length*.05)],p95=lum[Math.floor(lum.length*.95)];
 const finish=a=>({pixels:a.n,luma:a.y/a.n,hue:(Math.atan2(a.z,a.x)*180/Math.PI+360)%360,hueCoherence:Math.hypot(a.x,a.z)/a.w});
 const c=finish(city),s=finish(air),dh=Math.abs(c.hue-s.hue);
 return{p5,p95,span:p95-p5,meanLuma:sum/(width*height),warmFraction:warm/(width*height),grayFraction:gray/(width*height),city:c,sky:s,lumaGap:Math.abs(c.luma-s.luma),hueGap:Math.min(dh,360-dh),width,height};
}
module.exports={measurePixels};
