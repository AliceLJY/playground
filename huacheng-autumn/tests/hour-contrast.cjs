// Browser regression: computed text/background colours, composited over both
// black and white scene pixels. Run via tools/journal-check.cjs --contrast-only.
async function hourContrast(page) {
 return page.locator('[data-hour]').evaluateAll(els=>{
  const rgba=s=>s.match(/[\d.]+/g).map(Number);
  const luminance=rgb=>rgb.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  return els.map(el=>{
   const style=getComputedStyle(el),fg=rgba(style.color),bg=rgba(style.backgroundColor),alpha=bg[3]??1;
   const contrasts=[0,255].map(under=>{
    const back=bg.slice(0,3).map(v=>v*alpha+under*(1-alpha));
    const text=fg.slice(0,3).map((v,i)=>v*(fg[3]??1)+back[i]*(1-(fg[3]??1)));
    const a=luminance(text),b=luminance(back);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
   });
   return {text:el.textContent,color:style.color,background:style.backgroundColor,minimum:Math.min(...contrasts)};
  });
 });
}
module.exports={hourContrast};
