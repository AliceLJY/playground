// 小橘偷虾记 · art: every picture is drawn in code on a 2D canvas, no image files.
// The rooms (floor, furniture, shadows) are painted once per layout into an offscreen layer by paintRoom();
// fish, steam, the door light, the cats and the people are drawn every frame. Texture noise comes from a fixed hash,
// never Math.random, so fixed-view screenshots repeat exactly.
(function(root){
'use strict';
const TAU=Math.PI*2;
function hash(a,b,c){let h=(Math.imul(a|0,374761393)+Math.imul(b|0,668265263)+Math.imul((c|0)+1,1442695041))|0;h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return (h>>>0)/4294967296;}
function rgb(c){c=c.replace('#','');return [parseInt(c.slice(0,2),16),parseInt(c.slice(2,4),16),parseInt(c.slice(4,6),16)];}
function shade(c,k){const [r,g,b]=rgb(c),f=v=>Math.round(k>=0?v+(255-v)*k:v*(1+k));return `rgb(${f(r)},${f(g)},${f(b)})`;}
function alpha(c,a){const [r,g,b]=rgb(c);return `rgba(${r},${g},${b},${a})`;}
function rr(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
function ell(ctx,x,y,rx,ry,rot){ctx.beginPath();ctx.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),rot||0,0,TAU);}
// a soft contact shadow under a piece of furniture: offset down-right, blurred
function shadow(ctx,s,fn,k){ctx.save();ctx.shadowColor=`rgba(25,12,4,${.5*(k||1)})`;ctx.shadowBlur=s*.22;ctx.shadowOffsetX=s*.05;ctx.shadowOffsetY=s*.09;fn();ctx.restore();}
function speckle(ctx,x,y,w,h,n,col,a,seed,sz){ctx.save();ctx.fillStyle=col;ctx.globalAlpha=a;for(let i=0;i<n;i++){const r=sz*(.5+hash(i,seed,3));ctx.fillRect(x+hash(i,seed,1)*w,y+hash(i,seed,2)*h,r,r);}ctx.restore();}
function label(ctx,text,x,y,size,col,bg){ctx.font=`700 ${size}px -apple-system,"PingFang SC",sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
  if(bg){const w=ctx.measureText(text).width+size*.7;ctx.fillStyle=bg;rr(ctx,x-w/2,y-size*.68,w,size*1.36,size*.4);ctx.fill();}
  ctx.fillStyle=col;ctx.fillText(text,x,y);}

// ---------- surfaces
// wooden floorboards running left-right, three boards per cell, each its own tone with grain, knots and seams
function woodFloor(ctx,x,y,w,h,s,seed,base){
  const ph=s/3;ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
  ctx.fillStyle=base;ctx.fillRect(x,y,w,h);
  for(let r=0;r*ph<h;r++){
    const py=y+r*ph;let px=x-hash(r,seed,0)*s*2,k=0;
    while(px<x+w){
      const len=s*(1.5+hash(r,k,seed)*1.8),t=hash(k,r,seed+7);
      const g=ctx.createLinearGradient(0,py,0,py+ph);g.addColorStop(0,shade(base,(t-.5)*.22+.05));g.addColorStop(1,shade(base,(t-.5)*.22-.07));
      ctx.fillStyle=g;ctx.fillRect(px,py,len,ph);
      ctx.strokeStyle=shade(base,-.32);ctx.lineWidth=Math.max(.6,s/110);ctx.globalAlpha=.32;
      for(let q=0;q<3;q++){const gy=py+ph*(.2+.6*hash(k,q,r));ctx.beginPath();ctx.moveTo(px+2,gy);
        ctx.bezierCurveTo(px+len*.3,gy+ph*.22*(hash(q,k,1)-.5),px+len*.66,gy-ph*.2*(hash(q,k,2)-.5),px+len-2,gy+ph*.1*(hash(q,k,3)-.5));ctx.stroke();}
      if(hash(k,r,seed+3)>.86){ctx.globalAlpha=.45;ell(ctx,px+len*(.2+.6*hash(r,k,9)),py+ph/2,ph*.24,ph*.13);ctx.stroke();}
      ctx.globalAlpha=1;ctx.fillStyle=shade(base,-.45);ctx.fillRect(px+len-1,py,1.2,ph);
      px+=len;k++;
    }
    ctx.fillStyle=shade(base,-.42);ctx.fillRect(x,py+ph-1,w,1);
    ctx.fillStyle='rgba(255,235,200,.07)';ctx.fillRect(x,py,w,1);
  }
  ctx.restore();
}
// woven rug: border band, patterned field, fringe on the short sides, fibre speckle
function rug(ctx,x,y,w,h,s,c1,c2,c3,seed,fringe){
  shadow(ctx,s,()=>{ctx.fillStyle=c1;rr(ctx,x,y,w,h,s*.05);ctx.fill();},.5);
  const b=Math.min(w,h)*.11;
  ctx.fillStyle=c2;rr(ctx,x+b*.5,y+b*.5,w-b,h-b,s*.03);ctx.fill();
  ctx.fillStyle=c1;rr(ctx,x+b,y+b,w-2*b,h-2*b,s*.02);ctx.fill();
  // field motif: small diamonds on a grid
  ctx.save();ctx.beginPath();ctx.rect(x+b,y+b,w-2*b,h-2*b);ctx.clip();
  const st=Math.max(8,s*.28);ctx.fillStyle=c3;ctx.globalAlpha=.55;
  for(let yy=y+b+st/2;yy<y+h;yy+=st)for(let xx=x+b+st/2+((yy-y)/st%2?st/2:0);xx<x+w;xx+=st){ctx.beginPath();ctx.moveTo(xx,yy-st*.22);ctx.lineTo(xx+st*.16,yy);ctx.lineTo(xx,yy+st*.22);ctx.lineTo(xx-st*.16,yy);ctx.fill();}
  ctx.restore();
  speckle(ctx,x,y,w,h,Math.round(w*h/(s*.6)),'#ffffff',.08,seed,Math.max(1,s/60));
  speckle(ctx,x,y,w,h,Math.round(w*h/(s*.6)),'#000000',.08,seed+1,Math.max(1,s/60));
  if(fringe){ctx.strokeStyle=shade(c2,.5);ctx.lineWidth=Math.max(1,s/70);ctx.globalAlpha=.8;
    for(let yy=y+2;yy<y+h-1;yy+=Math.max(3,s*.06)){ctx.beginPath();ctx.moveTo(x,yy);ctx.lineTo(x-s*.07,yy+1);ctx.moveTo(x+w,yy);ctx.lineTo(x+w+s*.07,yy+1);ctx.stroke();}ctx.globalAlpha=1;}
}
// darkens the floor along the room's edges, as if the walls stand just outside the grid
function roomEdge(ctx,x,y,w,h,s){
  const d=s*.28;
  const side=(gx0,gy0,gx1,gy1,rx,ry,rw,rh)=>{const g=ctx.createLinearGradient(gx0,gy0,gx1,gy1);g.addColorStop(0,'rgba(30,14,4,.45)');g.addColorStop(1,'rgba(30,14,4,0)');ctx.fillStyle=g;ctx.fillRect(rx,ry,rw,rh);};
  side(x,0,x+d,0,x,y,d,h);side(x+w,0,x+w-d,0,x+w-d,y,d,h);side(0,y,0,y+d,x,y,w,d);side(0,y+h,0,y+h-d,x,y+h-d,w,d);
  ctx.strokeStyle='#2a1a10';ctx.lineWidth=Math.max(2,s*.06);ctx.strokeRect(x-ctx.lineWidth/2,y-ctx.lineWidth/2,w+ctx.lineWidth,h+ctx.lineWidth);
}
function gridLines(ctx,G,cols,rows,walk){
  ctx.save();ctx.strokeStyle='rgba(20,8,0,.16)';ctx.lineWidth=1;
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)if(walk(r*cols+c))ctx.strokeRect(G.ox+c*G.s+.5,G.oy+r*G.s+.5,G.s-1,G.s-1);
  ctx.restore();
}

// ---------- living-room furniture
function plant(ctx,x,y,r,seed){
  shadow(ctx,r*3,()=>{ctx.fillStyle='#8a4b2c';ell(ctx,x,y,r*.62,r*.62);ctx.fill();});
  ctx.fillStyle='#5d3420';ell(ctx,x,y,r*.5,r*.5);ctx.fill();
  for(let i=0;i<9;i++){const a=i/9*TAU+hash(i,seed)*.6,l=r*(.75+.35*hash(seed,i)),lx=x+Math.cos(a)*l*.55,ly=y+Math.sin(a)*l*.55;
    ctx.fillStyle=i%2?'#4f8a3c':'#3d7432';ell(ctx,lx,ly,l*.42,l*.2,a);ctx.fill();
    ctx.strokeStyle='rgba(20,50,10,.5)';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(lx+Math.cos(a)*l*.3,ly+Math.sin(a)*l*.3);ctx.stroke();}
  ctx.fillStyle='#6aa850';ell(ctx,x,y,r*.18,r*.18);ctx.fill();
}
function woodBox(ctx,x,y,w,h,s,col,seed){
  shadow(ctx,s,()=>{ctx.fillStyle=shade(col,-.25);rr(ctx,x,y,w,h,s*.05);ctx.fill();});
  ctx.fillStyle=col;rr(ctx,x+s*.03,y+s*.03,w-s*.06,h-s*.06,s*.04);ctx.fill();
  ctx.save();ctx.beginPath();ctx.rect(x+s*.03,y+s*.03,w-s*.06,h-s*.06);ctx.clip();
  ctx.strokeStyle=shade(col,-.22);ctx.lineWidth=Math.max(.7,s/90);ctx.globalAlpha=.5;
  const vert=h>w;for(let i=0;i<7;i++){const t=(i+.5)/7;ctx.beginPath();
    if(vert){const gx=x+w*t;ctx.moveTo(gx,y);ctx.bezierCurveTo(gx+s*.04*(hash(i,seed)-.5),y+h*.3,gx-s*.04*(hash(seed,i)-.5),y+h*.7,gx,y+h);}
    else{const gy=y+h*t;ctx.moveTo(x,gy);ctx.bezierCurveTo(x+w*.3,gy+s*.04*(hash(i,seed)-.5),x+w*.7,gy-s*.04*(hash(seed,i)-.5),x+w,gy);}ctx.stroke();}
  ctx.restore();
  ctx.strokeStyle='rgba(255,230,190,.25)';ctx.lineWidth=1;rr(ctx,x+s*.04,y+s*.04,w-s*.08,h-s*.08,s*.035);ctx.stroke();
}
function tvCabinet(ctx,x,y,w,h,s){
  woodBox(ctx,x+s*.06,y+s*.04,w-s*.12,h-s*.08,s,'#7a4a2a',3);
  // TV, seen from above: a long black slab on a stand, screen facing the room
  const tx=x+w*.5,ty=y+h*.42;
  shadow(ctx,s,()=>{ctx.fillStyle='#2b2d33';rr(ctx,tx-s*.16,ty-s*.42,s*.32,s*.84,s*.04);ctx.fill();});
  ctx.fillStyle='#1a1b20';rr(ctx,tx-s*.08,ty-s*1.2,s*.13,s*2.4,s*.04);ctx.fill();
  ctx.fillStyle='#3a3d48';ctx.fillRect(tx+s*.04,ty-s*1.15,s*.02,s*2.3);
  ctx.fillStyle='rgba(120,170,255,.35)';ctx.fillRect(tx+s*.055,ty-s*1.15,s*.012,s*2.3);
  // books and a remote
  ctx.fillStyle='#b5523b';rr(ctx,x+s*.2,y+h*.78,s*.55,s*.32,s*.03);ctx.fill();ctx.fillStyle='#e9dcc0';ctx.fillRect(x+s*.22,y+h*.78+s*.3,s*.5,s*.03);
  ctx.fillStyle='#3d6b8a';rr(ctx,x+s*.24,y+h*.78-s*.05,s*.45,s*.28,s*.03);ctx.fill();
  ctx.fillStyle='#222';rr(ctx,x+s*.55,y+h*.66,s*.12,s*.3,s*.04);ctx.fill();
  plant(ctx,x+w*.5,y+s*.55,s*.42,4);
}
function lampAt(ctx,x,y,s){
  shadow(ctx,s,()=>{ctx.fillStyle='#f3e2bd';ell(ctx,x,y,s*.27,s*.27);ctx.fill();});
  const g=ctx.createRadialGradient(x-s*.05,y-s*.05,s*.02,x,y,s*.27);g.addColorStop(0,'#fff8e0');g.addColorStop(1,'#e9c98a');ctx.fillStyle=g;ell(ctx,x,y,s*.25,s*.25);ctx.fill();
  ctx.strokeStyle='#c8a46a';ctx.lineWidth=1;for(let i=1;i<4;i++){ell(ctx,x,y,s*.25*i/4,s*.25*i/4);ctx.stroke();}
}
function glow(ctx,x,y,r,col,a){ctx.save();ctx.globalCompositeOperation='lighter';const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,alpha(col,a));g.addColorStop(1,alpha(col,0));ctx.fillStyle=g;ctx.fillRect(x-r,y-r,2*r,2*r);ctx.restore();}
function bookshelf(ctx,x,y,w,h,s){
  woodBox(ctx,x+s*.08,y+s*.02,w-s*.14,h-s*.04,s,'#6b3f22',5);
  const ix=x+s*.16,iw=w-s*.3,sh=(h-s*.1)/6;
  const COLS=['#a8432f','#2f5d7c','#c9a14a','#3f6d3a','#7b3f6e','#d8cbb0','#28466b','#b86a2a','#5a5048'];
  for(let k=0;k<6;k++){
    const sy=y+s*.06+k*sh;ctx.fillStyle='#3a2212';ctx.fillRect(ix,sy+s*.04,iw,sh-s*.06);
    let by=sy+s*.06,i=0;
    while(by<sy+sh-s*.08){const th=s*(.06+.06*hash(k,i,2)),len=iw*(.62+.36*hash(i,k,5));if(hash(k,i,11)>.9){by+=th*1.5;i++;continue;}
      const col=COLS[Math.floor(hash(i,k,7)*COLS.length)];ctx.fillStyle=col;ctx.fillRect(ix,by,len,th-1);
      ctx.fillStyle=shade(col,.3);ctx.fillRect(ix+len-s*.06,by,s*.03,th-1);ctx.fillStyle='rgba(0,0,0,.25)';ctx.fillRect(ix,by+th-2,len,1);by+=th;i++;}
    ctx.fillStyle='#7c4b2a';ctx.fillRect(x+s*.1,sy+sh-s*.03,w-s*.18,s*.05);
  }
  plant(ctx,x+w*.52,y+s*.38,s*.3,9);
}
function tankStatic(ctx,x,y,w,h,s){
  shadow(ctx,s,()=>{ctx.fillStyle='#4a2f1d';rr(ctx,x+s*.05,y+s*.06,w-s*.1,h-s*.12,s*.06);ctx.fill();});
  const ix=x+s*.13,iy=y+s*.14,iw=w-s*.26,ih=h-s*.28;
  const g=ctx.createLinearGradient(ix,iy,ix,iy+ih);g.addColorStop(0,'#5fc6d6');g.addColorStop(.6,'#2f8fae');g.addColorStop(1,'#226a86');
  ctx.fillStyle=g;ctx.fillRect(ix,iy,iw,ih);
  // gravel along the bottom and stones
  for(let i=0;i<70;i++){const gx=ix+hash(i,1,4)*iw,gy=iy+ih*(.78+.2*hash(i,2,4));ctx.fillStyle=['#c8b28a','#9c8a6c','#e0d4b6','#7a6c58'][i%4];ell(ctx,gx,gy,s*.03,s*.022,hash(i,3));ctx.fill();}
  for(const [px,py,r] of [[.18,.7,.11],[.78,.75,.09],[.5,.82,.07]]){ctx.fillStyle='#6f7a80';ell(ctx,ix+iw*px,iy+ih*py,s*r*1.3,s*r);ctx.fill();ctx.fillStyle='rgba(255,255,255,.25)';ell(ctx,ix+iw*px-s*.03,iy+ih*py-s*.03,s*r*.6,s*r*.4);ctx.fill();}
  // water plants
  for(const [px,n,col] of [[.12,6,'#3e9a4a'],[.88,5,'#4fae5a'],[.62,4,'#2f7d3c']]){for(let i=0;i<n;i++){const bx=ix+iw*px,a=-Math.PI/2+(i-(n-1)/2)*.32;ctx.strokeStyle=col;ctx.lineWidth=s*.05;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(bx,iy+ih*.9);ctx.quadraticCurveTo(bx+Math.cos(a)*s*.25,iy+ih*.9+Math.sin(a)*s*.35,bx+Math.cos(a)*s*.35+s*.05,iy+ih*.9+Math.sin(a)*s*.62);ctx.stroke();}}
  ctx.strokeStyle='#b9e6ee';ctx.lineWidth=Math.max(1.5,s*.03);ctx.strokeRect(ix,iy,iw,ih);
}
function tankDynamic(ctx,x,y,w,h,s,t){
  const ix=x+s*.13,iy=y+s*.14,iw=w-s*.26,ih=h-s*.28;
  ctx.save();ctx.beginPath();ctx.rect(ix,iy,iw,ih);ctx.clip();
  // caustic shimmer
  ctx.globalAlpha=.16;ctx.strokeStyle='#e8fbff';ctx.lineWidth=Math.max(1,s*.02);
  for(let i=0;i<6;i++){ctx.beginPath();for(let k=0;k<=12;k++){const px=ix+iw*k/12,py=iy+ih*(.12+i*.12)+Math.sin(k*.9+t*1.6+i)*s*.04;k?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.stroke();}
  ctx.globalAlpha=1;
  // three fish swimming laps
  for(let f=0;f<3;f++){const sp=.35+f*.12,a=t*sp+f*2.1,fx=ix+iw*(.5+.38*Math.sin(a)),fy=iy+ih*(.3+f*.17+.06*Math.sin(a*2.3)),dir=Math.cos(a)>=0?1:-1,fs=s*(.13-f*.015);
    const wag=Math.sin(t*9+f)*.35;ctx.save();ctx.translate(fx,fy);ctx.scale(dir,1);
    ctx.fillStyle=f===1?'#f6f0e6':'#ff8a2a';ctx.beginPath();ctx.moveTo(-fs*.8,0);ctx.lineTo(-fs*1.35,-fs*.45+wag*fs*.3);ctx.lineTo(-fs*1.35,fs*.45+wag*fs*.3);ctx.fill();
    ell(ctx,0,0,fs,fs*.45);ctx.fill();if(f===1){ctx.fillStyle='#ff7a2a';ell(ctx,-fs*.2,0,fs*.3,fs*.3);ctx.fill();}
    ctx.fillStyle='#111';ell(ctx,fs*.55,-fs*.1,fs*.1,fs*.1);ctx.fill();ctx.restore();}
  // bubbles rising from the bottom right
  for(let b=0;b<5;b++){const k=((t*.45+b*.21)%1),bx=ix+iw*(.84+.04*Math.sin(t*3+b)),by=iy+ih*(.9-k*.85);ctx.strokeStyle=`rgba(255,255,255,${.7*(1-k)})`;ctx.lineWidth=1;ell(ctx,bx,by,s*.025+b%2*s*.01,s*.025+b%2*s*.01);ctx.stroke();}
  ctx.restore();
  // glass shine over everything
  ctx.fillStyle='rgba(255,255,255,.14)';ctx.beginPath();ctx.moveTo(ix+iw*.06,iy);ctx.lineTo(ix+iw*.2,iy);ctx.lineTo(ix+iw*.08,iy+ih);ctx.lineTo(ix-iw*.06+iw*.06,iy+ih);ctx.fill();
}
function sofa(ctx,x,y,w,h,s){
  const base='#c98e4a';
  shadow(ctx,s,()=>{ctx.fillStyle=shade(base,-.2);rr(ctx,x+s*.06,y+s*.12,w-s*.12,h-s*.16,s*.18);ctx.fill();});
  // back rest along the bottom, arm rests left and right, two seat cushions
  ctx.fillStyle=shade(base,-.12);rr(ctx,x+s*.06,y+h-s*.5,w-s*.12,s*.42,s*.16);ctx.fill();
  for(const ax of [x+s*.06,x+w-s*.34]){ctx.fillStyle=shade(base,-.06);rr(ctx,ax,y+s*.12,s*.28,h-s*.24,s*.14);ctx.fill();ctx.fillStyle='rgba(255,255,255,.18)';rr(ctx,ax+s*.05,y+s*.18,s*.1,h-s*.5,s*.05);ctx.fill();}
  for(let i=0;i<2;i++){const cx0=x+s*.36+i*(w-s*.72)/2,cw=(w-s*.72)/2-s*.03;ctx.fillStyle=base;rr(ctx,cx0,y+s*.2,cw,h-s*.72,s*.1);ctx.fill();
    ctx.strokeStyle=shade(base,-.2);ctx.lineWidth=1;rr(ctx,cx0+s*.04,y+s*.24,cw-s*.08,h-s*.8,s*.08);ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,.16)';ell(ctx,cx0+cw*.4,y+s*.45,cw*.3,s*.14);ctx.fill();}
  speckle(ctx,x+s*.06,y+s*.12,w-s*.12,h-s*.16,240,'#5a4a3a',.12,21,Math.max(1,s/55));
  // pillows and a knit throw
  ctx.save();ctx.translate(x+s*.55,y+h-s*.62);ctx.rotate(-.25);ctx.fillStyle='#6b8a4a';rr(ctx,-s*.2,-s*.15,s*.4,s*.3,s*.08);ctx.fill();ctx.strokeStyle='#4f6b33';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-s*.15,0);ctx.lineTo(s*.15,0);ctx.stroke();ctx.restore();
  ctx.save();ctx.translate(x+w-s*.58,y+h-s*.64);ctx.rotate(.3);ctx.fillStyle='#d9824a';rr(ctx,-s*.21,-s*.16,s*.42,s*.32,s*.08);ctx.fill();ctx.strokeStyle='#f3c79a';ctx.lineWidth=1.2;
    for(let i=-2;i<=2;i++){ctx.beginPath();ctx.moveTo(i*s*.07,-s*.15);ctx.lineTo(i*s*.07,s*.15);ctx.moveTo(-s*.2,i*s*.055);ctx.lineTo(s*.2,i*s*.055);ctx.stroke();}ctx.restore();
  ctx.save();ctx.translate(x+w*.63,y+h*.36);ctx.rotate(.12);ctx.fillStyle='#efe6d2';rr(ctx,-s*.24,-s*.3,s*.48,s*.6,s*.04);ctx.fill();
  ctx.strokeStyle='#cbbd9f';ctx.lineWidth=1;for(let i=-2;i<=2;i++){ctx.beginPath();ctx.moveTo(i*s*.08,-s*.29);ctx.lineTo(i*s*.08,s*.29);ctx.stroke();}
  ctx.strokeStyle='#efe6d2';for(let i=-5;i<=5;i++){ctx.beginPath();ctx.moveTo(i*s*.04,s*.3);ctx.lineTo(i*s*.04,s*.36);ctx.stroke();}ctx.restore();
}
function catBed(ctx,x,y,s){
  shadow(ctx,s,()=>{ctx.fillStyle='#a8463c';ell(ctx,x,y,s*.42,s*.4);ctx.fill();});
  const g=ctx.createRadialGradient(x,y,s*.1,x,y,s*.42);g.addColorStop(0,'#c7574a');g.addColorStop(1,'#8f3a31');ctx.fillStyle=g;ell(ctx,x,y,s*.42,s*.4);ctx.fill();
  ctx.fillStyle='#f1e4cc';ell(ctx,x,y+s*.02,s*.27,s*.25);ctx.fill();speckle(ctx,x-s*.25,y-s*.22,s*.5,s*.46,60,'#c8b28f',.5,31,Math.max(1,s/40));
  ctx.fillStyle='#f6e9d3';for(const [a,b] of [[-.3,.33],[.05,.35],[.3,.3]]){ell(ctx,x+a*s,y+b*s,s*.035,s*.03);ctx.fill();}
}
function doorTop(ctx,x,y,s,dir){ // a doorway in the wall at the top of cell (x,y)
  ctx.fillStyle='#2a1a10';ctx.fillRect(x-s*.06,y-s*.08,s*.14,s*.18);ctx.fillRect(x+s*.92,y-s*.08,s*.14,s*.18);
  ctx.fillStyle='#e9c37a';ctx.fillRect(x+s*.08,y-s*.06,s*.84,s*.07);
  // the door leaf, swung open into the room along the right jamb
  ctx.save();ctx.translate(x+s*.98,y+s*.04);ctx.rotate(dir||Math.PI*.62);shadow(ctx,s,()=>{ctx.fillStyle='#8a5631';ctx.fillRect(0,-s*.05,s*.82,s*.1);});ctx.fillStyle='#d6b06a';ell(ctx,s*.72,0,s*.04,s*.04);ctx.fill();ctx.restore();
}
function doorLight(ctx,x,y,s,pulse,col){ // warm light pouring in through a doorway at the top edge of a cell
  ctx.save();ctx.globalCompositeOperation='lighter';
  const g=ctx.createLinearGradient(0,y,0,y+s*1.5);g.addColorStop(0,alpha(col,.55+.25*pulse));g.addColorStop(1,alpha(col,0));
  ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(x+s*.08,y);ctx.lineTo(x+s*.92,y);ctx.lineTo(x+s*1.12,y+s*1.5);ctx.lineTo(x-s*.12,y+s*1.5);ctx.fill();ctx.restore();
}
function coffeeTableUnder(ctx,x,y,w,h,s){
  // the dark gap under the table, darker in the middle: this is where 小橘 hides
  const g=ctx.createRadialGradient(x+w/2,y+h/2,s*.2,x+w/2,y+h/2,Math.max(w,h)*.62);g.addColorStop(0,'rgba(15,6,0,.72)');g.addColorStop(1,'rgba(15,6,0,.38)');
  ctx.fillStyle=g;rr(ctx,x+s*.04,y+s*.04,w-s*.08,h-s*.08,s*.1);ctx.fill();
}
function coffeeTableTop(ctx,x,y,w,h,s,a){
  ctx.save();ctx.globalAlpha=a;
  const col='#9a6a3e';
  // legs show at the corners
  ctx.fillStyle='#5a3a20';for(const [lx,ly] of [[x+s*.16,y+s*.16],[x+w-s*.28,y+s*.16],[x+s*.16,y+h-s*.28],[x+w-s*.28,y+h-s*.28]])ctx.fillRect(lx,ly,s*.12,s*.12);
  shadow(ctx,s,()=>{ctx.fillStyle=shade(col,-.3);rr(ctx,x+s*.08,y+s*.1,w-s*.16,h-s*.22,s*.12);ctx.fill();},1.3);
  ctx.fillStyle=col;rr(ctx,x+s*.1,y+s*.1,w-s*.2,h-s*.26,s*.1);ctx.fill();
  ctx.save();ctx.beginPath();ctx.roundRect(x+s*.1,y+s*.1,w-s*.2,h-s*.26,s*.1);ctx.clip();
  ctx.strokeStyle=shade(col,-.25);ctx.lineWidth=Math.max(.8,s/80);ctx.globalAlpha=a*.55;
  for(let i=0;i<9;i++){const gy=y+s*.14+(h-s*.34)*i/8;ctx.beginPath();ctx.moveTo(x,gy);ctx.bezierCurveTo(x+w*.3,gy+s*.05*(hash(i,2)-.5),x+w*.7,gy-s*.05*(hash(i,3)-.5),x+w,gy);ctx.stroke();}
  ctx.restore();ctx.globalAlpha=a;
  // front edge (thickness of the top) and a highlight
  ctx.fillStyle=shade(col,-.38);rr(ctx,x+s*.1,y+h-s*.2,w-s*.2,s*.06,s*.03);ctx.fill();
  ctx.fillStyle='rgba(255,236,200,.22)';rr(ctx,x+s*.16,y+s*.14,w-s*.32,s*.05,s*.03);ctx.fill();
  // a mug and a magazine on top
  ctx.fillStyle='#e9e2d4';ell(ctx,x+w*.78,y+h*.32,s*.13,s*.13);ctx.fill();ctx.fillStyle='#6b4026';ell(ctx,x+w*.78,y+h*.32,s*.09,s*.09);ctx.fill();
  ctx.save();ctx.translate(x+w*.28,y+h*.4);ctx.rotate(-.2);ctx.fillStyle='#d8d0c0';ctx.fillRect(-s*.3,-s*.2,s*.6,s*.4);ctx.fillStyle='#c0583c';ctx.fillRect(-s*.26,-s*.16,s*.52,s*.12);ctx.restore();
  ctx.restore();
}

// ---------- hallway
function wallMass(ctx,x,y,w,h,s){
  const g=ctx.createLinearGradient(x,y,x+w,y+h);g.addColorStop(0,'#5e4a3c');g.addColorStop(1,'#43342a');ctx.fillStyle=g;ctx.fillRect(x,y,w,h);
  ctx.strokeStyle='rgba(0,0,0,.18)';ctx.lineWidth=1;for(let yy=y+s*.25;yy<y+h;yy+=s*.25){ctx.beginPath();ctx.moveTo(x,yy);ctx.lineTo(x+w,yy);ctx.stroke();}
  speckle(ctx,x,y,w,h,Math.round(w*h/(s*1.2)),'#ffffff',.05,41,Math.max(1,s/50));
  ctx.strokeStyle='rgba(255,230,200,.18)';ctx.lineWidth=1.5;ctx.strokeRect(x+1,y+1,w-2,h-2);
}
function bathroom(ctx,x,y,w,h,s){
  // tiled floor behind a wall, with a toilet, a basin and a bath mat
  ctx.fillStyle='#d8dfe2';ctx.fillRect(x,y,w,h);
  const t=s*.33;ctx.strokeStyle='#aab6bb';ctx.lineWidth=1;
  for(let yy=y;yy<y+h;yy+=t){ctx.beginPath();ctx.moveTo(x,yy);ctx.lineTo(x+w,yy);ctx.stroke();}
  for(let xx=x;xx<x+w;xx+=t){ctx.beginPath();ctx.moveTo(xx,y);ctx.lineTo(xx,y+h);ctx.stroke();}
  ctx.fillStyle='rgba(30,40,50,.25)';ctx.fillRect(x,y,w,h);
  const tx=x+w*.5,ty=y+h*.78;
  shadow(ctx,s,()=>{ctx.fillStyle='#f4f6f6';rr(ctx,tx-s*.36,ty+s*.25,s*.72,s*.32,s*.08);ctx.fill();});
  ctx.fillStyle='#f4f6f6';ell(ctx,tx,ty,s*.3,s*.38);ctx.fill();ctx.fillStyle='#c8d6dc';ell(ctx,tx,ty-s*.04,s*.18,s*.24);ctx.fill();
  const sx=x+w*.5,sy=y+h*.2;shadow(ctx,s,()=>{ctx.fillStyle='#eef2f3';rr(ctx,sx-s*.45,sy-s*.36,s*.9,s*.72,s*.2);ctx.fill();});
  ctx.fillStyle='#bcd0d8';ell(ctx,sx,sy,s*.3,s*.22);ctx.fill();ctx.fillStyle='#9aa';ctx.fillRect(sx-s*.03,sy-s*.36,s*.06,s*.14);
  ctx.fillStyle='#6fa6c8';rr(ctx,x+w*.2,y+h*.48,w*.6,s*.55,s*.08);ctx.fill();ctx.strokeStyle='#9cc7e0';ctx.setLineDash([3,3]);rr(ctx,x+w*.2+3,y+h*.48+3,w*.6-6,s*.55-6,s*.06);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle='#3a2c24';ctx.fillRect(x-s*.04,y,s*.12,h);
}
function shoeCabinet(ctx,x,y,s){
  woodBox(ctx,x+s*.08,y+s*.06,s*.84,s*.88,s,'#8a5a36',61);
  // a pair of sneakers and a pair of slippers on top
  for(const [dx,dy,col,rot] of [[.3,.32,'#e6e1d6',.2],[.48,.3,'#e6e1d6',.1],[.6,.68,'#c75a4a',-.3],[.78,.66,'#c75a4a',-.2]]){
    ctx.save();ctx.translate(x+s*dx,y+s*dy);ctx.rotate(rot);ctx.fillStyle=col;ell(ctx,0,0,s*.07,s*.16);ctx.fill();ctx.fillStyle='rgba(0,0,0,.2)';ell(ctx,0,-s*.05,s*.04,s*.06);ctx.fill();ctx.restore();}
}
function playMat(ctx,x,y,s){
  const cols=['#e86a5a','#f2c14e','#5aaee8','#6cc56a'];
  for(let i=0;i<4;i++){ctx.fillStyle=cols[i];ctx.fillRect(x+(i%2)*s*.5,y+((i/2)|0)*s*.5,s*.5,s*.5);}
  ctx.strokeStyle='rgba(0,0,0,.2)';ctx.lineWidth=1;ctx.strokeRect(x+.5,y+.5,s-1,s-1);ctx.beginPath();ctx.moveTo(x+s/2,y);ctx.lineTo(x+s/2,y+s);ctx.moveTo(x,y+s/2);ctx.lineTo(x+s,y+s/2);ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,.18)';ctx.fillRect(x,y,s,s);
}

// ---------- dinner table
function tableTop(ctx,x,y,w,h,s){
  woodFloor(ctx,x,y,w,h,s*1.7,77,'#7e4a2a');
  ctx.fillStyle='rgba(255,240,215,.08)';ctx.fillRect(x,y,w,h);
  // a linen runner down the middle, under the dishes
  ctx.fillStyle='rgba(240,230,210,.55)';ctx.fillRect(x+w*.3,y,w*.4,h);
  ctx.strokeStyle='rgba(170,70,50,.55)';ctx.lineWidth=Math.max(1.5,s*.03);for(const ex of [x+w*.3+s*.08,x+w*.7-s*.08]){ctx.beginPath();ctx.moveTo(ex,y);ctx.lineTo(ex,y+h);ctx.stroke();}
  speckle(ctx,x+w*.3,y,w*.4,h,400,'#8a7a60',.12,71,Math.max(1,s/60));
  // varnish: a broad soft sheen from the window at the top right
  const sh=ctx.createLinearGradient(x+w,y,x+w*.2,y+h*.7);sh.addColorStop(0,'rgba(255,248,230,.28)');sh.addColorStop(.45,'rgba(255,248,230,.06)');sh.addColorStop(1,'rgba(255,248,230,0)');ctx.fillStyle=sh;ctx.fillRect(x,y,w,h);
  // bevelled edge of the table top
  ctx.strokeStyle='#6b3e1e';ctx.lineWidth=Math.max(3,s*.07);ctx.strokeRect(x+ctx.lineWidth/2,y+ctx.lineWidth/2,w-ctx.lineWidth,h-ctx.lineWidth);
  ctx.strokeStyle='rgba(255,220,170,.35)';ctx.lineWidth=1;ctx.strokeRect(x+s*.08,y+s*.08,w-s*.16,h-s*.16);
}
function plateAt(ctx,x,y,rx,ry,s){
  shadow(ctx,s,()=>{ctx.fillStyle='#e6e1d6';ell(ctx,x,y,rx,ry);ctx.fill();});
  const g=ctx.createRadialGradient(x-rx*.2,y-ry*.3,1,x,y,rx);g.addColorStop(0,'#ffffff');g.addColorStop(1,'#dcd6ca');ctx.fillStyle=g;ell(ctx,x,y,rx,ry);ctx.fill();
  ctx.strokeStyle='#5f8fb8';ctx.lineWidth=Math.max(1,s*.022);ell(ctx,x,y,rx*.84,ry*.84);ctx.stroke();
  ctx.strokeStyle='rgba(0,0,0,.08)';ctx.lineWidth=1;ell(ctx,x,y,rx*.62,ry*.62);ctx.stroke();
}
function shrimp(ctx,x,y,s,rot){ // a cooked shrimp curled into a C, about s across
  ctx.save();ctx.translate(x,y);ctx.rotate(rot||0);
  ctx.strokeStyle='#c0461f';ctx.lineWidth=Math.max(.8,s*.03);ctx.beginPath();ctx.moveTo(s*.32,-s*.06);ctx.quadraticCurveTo(s*.62,-s*.3,s*.55,-s*.5);ctx.moveTo(s*.3,-s*.02);ctx.quadraticCurveTo(s*.7,-s*.1,s*.72,-s*.36);ctx.stroke();
  for(let i=0;i<6;i++){const a=-.3+i*.48,r=s*.24,px=Math.cos(a)*r,py=Math.sin(a)*r,sz=s*(.15-i*.012);
    ctx.fillStyle=i%2?'#ff7d52':'#ff9a6e';ell(ctx,px,py,sz,sz*.9,a);ctx.fill();ctx.fillStyle='#fff1e6';ell(ctx,px-Math.cos(a)*sz*.35,py-Math.sin(a)*sz*.35,sz*.5,sz*.25,a+Math.PI/2);ctx.fill();}
  const ta=-.3+6*.48;ctx.fillStyle='#e85a30';ctx.beginPath();ctx.moveTo(Math.cos(ta)*s*.22,Math.sin(ta)*s*.22);ctx.lineTo(Math.cos(ta+.5)*s*.4,Math.sin(ta+.5)*s*.4);ctx.lineTo(Math.cos(ta-.15)*s*.42,Math.sin(ta-.15)*s*.42);ctx.fill();
  ctx.fillStyle='#222';ell(ctx,Math.cos(-.3)*s*.3,Math.sin(-.3)*s*.3-s*.04,s*.025,s*.025);ctx.fill();
  ctx.restore();
}
function soupPot(ctx,x,y,s){ // centre of a 2x1 block
  for(const sx of [-1,1]){ctx.fillStyle='#3a3a40';rr(ctx,x+sx*s*.52-s*.14,y-s*.08,s*.28,s*.16,s*.06);ctx.fill();}
  shadow(ctx,s,()=>{ctx.fillStyle='#5b5e66';ell(ctx,x,y,s*.5,s*.46);ctx.fill();},1.2);
  const g=ctx.createRadialGradient(x-s*.15,y-s*.15,s*.05,x,y,s*.5);g.addColorStop(0,'#a8acb4');g.addColorStop(1,'#4b4e56');ctx.fillStyle=g;ell(ctx,x,y,s*.5,s*.46);ctx.fill();
  const b=ctx.createRadialGradient(x,y,s*.05,x,y,s*.4);b.addColorStop(0,'#e3a24a');b.addColorStop(1,'#b8682a');ctx.fillStyle=b;ell(ctx,x,y,s*.4,s*.36);ctx.fill();
  for(let i=0;i<9;i++){const a=hash(i,5)*TAU,r=s*.28*Math.sqrt(hash(i,6));ctx.fillStyle=i%3?'#f4ead2':'#5a9a3a';const px=x+Math.cos(a)*r,py=y+Math.sin(a)*r*.9;if(i%3)ctx.fillRect(px-s*.04,py-s*.04,s*.08,s*.08);else{ell(ctx,px,py,s*.06,s*.03,a);ctx.fill();}}
  ctx.fillStyle='rgba(255,240,200,.35)';for(let i=0;i<6;i++){ell(ctx,x+s*.2*Math.cos(i*1.7),y+s*.18*Math.sin(i*2.3),s*.025,s*.02);ctx.fill();}
  ctx.strokeStyle='#8a8d95';ctx.lineWidth=s*.05;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x+s*.12,y+s*.08);ctx.lineTo(x+s*.62,y-s*.3);ctx.stroke();
}
function steam(ctx,x,y,s,t){
  ctx.save();ctx.lineCap='round';
  for(let i=0;i<3;i++){const k=(t*.5+i/3)%1,a=Math.sin(k*Math.PI)*.45;ctx.strokeStyle=`rgba(255,255,255,${a})`;ctx.lineWidth=s*(.05+.05*k);
    ctx.beginPath();const bx=x+(i-1)*s*.18;for(let j=0;j<=8;j++){const py=y-s*.05-k*s*.5-j*s*.06,px=bx+Math.sin(j*.9+t*3+i)*s*.06;j?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.stroke();}
  ctx.restore();
}
function riceCooker(ctx,x,y,s){
  shadow(ctx,s,()=>{ctx.fillStyle='#e8e4dc';rr(ctx,x-s*.42,y-s*.4,s*.84,s*.8,s*.3);ctx.fill();});
  const g=ctx.createRadialGradient(x-s*.12,y-s*.14,s*.05,x,y,s*.5);g.addColorStop(0,'#ffffff');g.addColorStop(1,'#cfc9be');ctx.fillStyle=g;rr(ctx,x-s*.42,y-s*.4,s*.84,s*.8,s*.3);ctx.fill();
  ctx.strokeStyle='#b5aea0';ctx.lineWidth=1.2;ell(ctx,x,y-s*.02,s*.3,s*.28);ctx.stroke();
  ctx.fillStyle='#3a3f46';rr(ctx,x-s*.14,y+s*.26,s*.28,s*.1,s*.03);ctx.fill();ctx.fillStyle='#7fe08a';ctx.fillRect(x-s*.1,y+s*.29,s*.06,s*.04);
  ctx.fillStyle='#8a8d95';rr(ctx,x-s*.08,y-s*.12,s*.16,s*.08,s*.03);ctx.fill();
}
function riceBowl(ctx,x,y,s){
  shadow(ctx,s,()=>{ctx.fillStyle='#f3efe6';ell(ctx,x,y,s*.27,s*.27);ctx.fill();});
  ctx.strokeStyle='#5f8fb8';ctx.lineWidth=Math.max(1,s*.025);ell(ctx,x,y,s*.25,s*.25);ctx.stroke();
  ctx.fillStyle='#fbfaf4';ell(ctx,x,y,s*.2,s*.2);ctx.fill();speckle(ctx,x-s*.17,y-s*.17,s*.34,s*.34,40,'#d8d2c2',.7,81,Math.max(1,s/50));
}
function greensDish(ctx,x,y,s){ // centre of a 2x1 block: an oval plate of stir-fried greens
  plateAt(ctx,x,y,s*.86,s*.4,s);
  for(let i=0;i<11;i++){const a=hash(i,13)*TAU,r=Math.sqrt(hash(i,14)),px=x+Math.cos(a)*r*s*.5,py=y+Math.sin(a)*r*s*.2;
    ctx.save();ctx.translate(px,py);ctx.rotate(a);ctx.fillStyle=i%2?'#3f8a32':'#5aa848';ell(ctx,0,0,s*.16,s*.07);ctx.fill();ctx.fillStyle='#d8e8b0';ctx.fillRect(-s*.15,-s*.012,s*.18,s*.024);ctx.restore();}
  for(let i=0;i<8;i++){ctx.fillStyle='#f4ecc8';ell(ctx,x+(hash(i,15)-.5)*s*.9,y+(hash(i,16)-.5)*s*.35,s*.025,s*.02);ctx.fill();}
}
function windowSill(ctx,x,y,s){ // cell at the top-right: a window in the wall above, a sill the cat jumped from
  ctx.fillStyle='#d9cbb2';ctx.fillRect(x,y,s,s*.3);
  const g=ctx.createLinearGradient(0,y,0,y+s*.24);g.addColorStop(0,'#9fd0ef');g.addColorStop(1,'#d8eef8');ctx.fillStyle=g;ctx.fillRect(x+s*.08,y+s*.03,s*.84,s*.2);
  ctx.fillStyle='#f4efe4';ctx.fillRect(x+s*.48,y+s*.03,s*.04,s*.2);ctx.fillStyle='#b8a888';ctx.fillRect(x,y+s*.24,s,s*.07);
  ctx.save();ctx.globalCompositeOperation='lighter';const l=ctx.createLinearGradient(0,y+s*.3,0,y+s*1.3);l.addColorStop(0,'rgba(200,230,255,.35)');l.addColorStop(1,'rgba(200,230,255,0)');ctx.fillStyle=l;ctx.fillRect(x-s*.2,y+s*.3,s*1.2,s);ctx.restore();
}
function ownerSide(ctx,x,y,w,s){ // the row below the table: floor and her chair
  woodFloor(ctx,x,y,w,s,s,91,'#6e4628');
  ctx.fillStyle='rgba(15,6,0,.45)';ctx.fillRect(x,y,w,s*.25);
}

// ---------- characters
const ORANGE={body:'#f29a3a',light:'#ffcf8e',dark:'#c2621a',line:'#7a3a0c',ear:'#f6b8a8'};
const CALICO={body:'#f6f1e6',light:'#ffffff',dark:'#cfc6b4',line:'#5a4a3a',ear:'#f2b2a8',black:'#2c2826',orange:'#e2873a'};
// a cat seen from above, nose pointing along angle ang; o.walk is the stride phase 0..1 or -1 standing,
// o.t seconds (tail sway), o.kind 'orange'|'calico', o.puff for a hissing cat (fur up, ears flat), o.carry shows the shrimp
function cat(ctx,x,y,s,ang,o){
  const P=o.kind==='calico'?CALICO:ORANGE,walking=o.walk>=0,ph=walking?o.walk*TAU:0,bob=walking?Math.abs(Math.sin(ph))*s*.02:0,puff=o.puff?1.12:1;
  ctx.save();ctx.translate(x,y);
  if(!o.hitMask){ctx.fillStyle='rgba(30,12,2,.32)';ell(ctx,s*.05,s*.08,s*.42,s*.27,ang);ctx.fill();}
  ctx.rotate(ang);ctx.translate(bob,0);
  // tail
  const sway=Math.sin(o.t*(walking?6:2)+(o.seed||0))*(o.puff?.15:walking?.3:.55);
  ctx.lineCap='round';
  const tail=()=>{ctx.beginPath();ctx.moveTo(-s*.3,0);ctx.quadraticCurveTo(-s*.58,sway*s*.5,-s*.74,sway*s*.2+s*.14*Math.sign(sway||1));};
  tail();ctx.strokeStyle=P.line;ctx.lineWidth=s*.12*puff;ctx.stroke();tail();ctx.strokeStyle=o.kind==='calico'?P.black:P.body;ctx.lineWidth=s*.085*puff;ctx.stroke();
  if(o.kind!=='calico'){ctx.save();ctx.setLineDash([s*.04,s*.05]);tail();ctx.strokeStyle=P.dark;ctx.lineWidth=s*.085;ctx.stroke();ctx.restore();}
  // paws: diagonal pairs step together
  const st=walking?Math.sin(ph)*s*.07:0;
  for(const [px,py,k] of [[.17,-.16,1],[.17,.16,-1],[-.2,-.15,-1],[-.2,.15,1]]){ctx.fillStyle=P.line;ell(ctx,s*px+st*k,s*py*1.08,s*.07,s*.055);ctx.fill();ctx.fillStyle=o.kind==='calico'?P.light:P.light;ell(ctx,s*px+st*k,s*py*1.08,s*.055,s*.042);ctx.fill();}
  // body
  const bry=(o.kind==='calico'?.19:.215)*puff;
  ctx.fillStyle=P.line;ell(ctx,-s*.04,0,s*.33*puff,s*bry+s*.015);ctx.fill();
  const g=ctx.createRadialGradient(-s*.06,-s*.06,s*.02,-s*.04,0,s*.34);g.addColorStop(0,P.light);g.addColorStop(.55,P.body);g.addColorStop(1,P.dark);
  ctx.fillStyle=g;ell(ctx,-s*.04,0,s*.32*puff,s*bry);ctx.fill();
  ctx.save();ell(ctx,-s*.04,0,s*.32*puff,s*bry);ctx.clip();
  if(o.kind==='calico'){ctx.fillStyle=P.black;ell(ctx,-s*.18,-s*.1,s*.15,s*.12,.4);ctx.fill();ell(ctx,-s*.33,s*.06,s*.08,s*.08);ctx.fill();ctx.fillStyle=P.orange;ell(ctx,s*.04,s*.11,s*.13,s*.1,-.3);ctx.fill();ell(ctx,-s*.26,-s*.04,s*.06,s*.05);ctx.fill();}
  else{ctx.strokeStyle=P.dark;ctx.lineWidth=s*.035;ctx.globalAlpha=.8;for(let i=0;i<5;i++){const sx=-s*.3+i*s*.1;ctx.beginPath();ctx.moveTo(sx,-s*.25);ctx.quadraticCurveTo(sx+s*.05,0,sx,s*.25);ctx.stroke();}
    ctx.globalAlpha=.5;ctx.fillStyle=P.dark;ell(ctx,-s*.06,0,s*.28,s*.05);ctx.fill();
    // 「肌肉小橘」: broad shoulders
    ctx.globalAlpha=.35;ctx.fillStyle=P.light;ell(ctx,s*.12,-s*.12,s*.09,s*.06);ctx.fill();ell(ctx,s*.12,s*.12,s*.09,s*.06);ctx.fill();}
  ctx.restore();
  // head and ears
  const hx=s*.27,hr=s*.155;
  for(const sd of [-1,1]){const tip=o.puff?[s*.2,sd*s*.24]:[s*.33,sd*s*.21];
    ctx.fillStyle=P.line;ctx.beginPath();ctx.moveTo(tip[0],tip[1]);ctx.lineTo(s*.17,sd*s*.1);ctx.lineTo(s*.36,sd*s*.05);ctx.fill();
    ctx.fillStyle=o.kind==='calico'?(sd<0?P.black:P.orange):P.body;ctx.beginPath();ctx.moveTo(tip[0]+(o.puff?.01:-.005)*s,tip[1]-sd*s*.02);ctx.lineTo(s*.19,sd*s*.1);ctx.lineTo(s*.34,sd*s*.06);ctx.fill();
    ctx.fillStyle=P.ear;ctx.beginPath();ctx.moveTo((tip[0]+s*.26)/2,(tip[1]+sd*s*.1)/2+sd*s*.02);ctx.lineTo(s*.23,sd*s*.1);ctx.lineTo(s*.31,sd*s*.08);ctx.fill();}
  ctx.fillStyle=P.line;ell(ctx,hx,0,hr+s*.014,hr*.95+s*.014);ctx.fill();
  const hg=ctx.createRadialGradient(hx-s*.04,-s*.04,s*.01,hx,0,hr);hg.addColorStop(0,P.light);hg.addColorStop(1,P.body);ctx.fillStyle=hg;ell(ctx,hx,0,hr,hr*.95);ctx.fill();
  if(o.kind==='calico'){ctx.save();ell(ctx,hx,0,hr,hr*.95);ctx.clip();ctx.fillStyle=P.black;ell(ctx,hx-s*.04,-s*.1,s*.12,s*.09);ctx.fill();ctx.fillStyle=P.orange;ell(ctx,hx-s*.05,s*.11,s*.1,s*.08);ctx.fill();ctx.restore();}
  else{ctx.strokeStyle=P.dark;ctx.lineWidth=s*.022;for(const dy of [-.05,0,.05]){ctx.beginPath();ctx.moveTo(hx-s*.1,dy*s);ctx.lineTo(hx+s*.0,dy*s*.6);ctx.stroke();}}
  // face: eyes, nose, whiskers (a hissing cat opens its mouth)
  ctx.fillStyle=o.puff?'#ffe14a':'#2a1a10';for(const sd of [-1,1]){ell(ctx,hx+s*.085,sd*s*.06,s*.026,s*.021);ctx.fill();}
  if(o.puff){ctx.fillStyle='#111';for(const sd of [-1,1]){ell(ctx,hx+s*.088,sd*s*.06,s*.008,s*.018);ctx.fill();}ctx.fillStyle='#8a1f1f';ell(ctx,hx+s*.14,0,s*.035,s*.045);ctx.fill();}
  ctx.fillStyle='#e07a7a';ell(ctx,hx+s*.15,0,s*.018,s*.022);ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,.75)';ctx.lineWidth=Math.max(.6,s*.008);
  for(const sd of [-1,1])for(const k of [-.04,.02]){ctx.beginPath();ctx.moveTo(hx+s*.13,sd*s*.04);ctx.lineTo(hx+s*.21,sd*(s*.14+k*s));ctx.stroke();}
  if(o.carry)shrimp(ctx,hx+s*.24,s*.02,s*.42,Math.PI*.5);
  ctx.restore();
}
// the child, sitting or walking, seen from above, facing angle ang
function kid(ctx,x,y,s,ang,o){
  ctx.save();ctx.translate(x,y);
  ctx.fillStyle='rgba(30,12,2,.3)';ell(ctx,s*.05,s*.08,s*.36,s*.3);ctx.fill();
  ctx.rotate(ang);
  const walking=o.walk>=0,st=walking?Math.sin(o.walk*TAU)*s*.08:0;
  // legs (sitting: out in front; walking: stepping)
  ctx.fillStyle='#3e5f8a';
  if(o.sit){ell(ctx,s*.2,-s*.09,s*.17,s*.07);ctx.fill();ell(ctx,s*.2,s*.09,s*.17,s*.07);ctx.fill();ctx.fillStyle='#f4f1ea';ell(ctx,s*.38,-s*.09,s*.05,s*.05);ctx.fill();ell(ctx,s*.38,s*.09,s*.05,s*.05);ctx.fill();}
  else{ell(ctx,st,-s*.08,s*.1,s*.06);ctx.fill();ell(ctx,-st,s*.08,s*.1,s*.06);ctx.fill();}
  // body: striped t-shirt
  ctx.fillStyle='#2f5d86';ell(ctx,-s*.02,0,s*.17,s*.25);ctx.fill();
  ctx.save();ell(ctx,-s*.02,0,s*.16,s*.24);ctx.clip();ctx.fillStyle='#6fb4e8';ctx.fillRect(-s*.2,-s*.3,s*.4,s*.6);ctx.fillStyle='#f4f1ea';for(let i=-3;i<=3;i++)ctx.fillRect(-s*.2+((i+3)%2)*0,i*s*.08-s*.015,s*.4,s*.03);ctx.restore();
  // arms reaching forward (holding the toy when sitting)
  ctx.fillStyle='#6fb4e8';ell(ctx,s*.1,-s*.2,s*.12,s*.05,-.4);ctx.fill();ell(ctx,s*.1,s*.2,s*.12,s*.05,.4);ctx.fill();
  ctx.fillStyle='#f2c9a4';ell(ctx,s*.2,-s*.15,s*.045,s*.045);ctx.fill();ell(ctx,s*.2,s*.15,s*.045,s*.045);ctx.fill();
  // head: hair from above with two little bunches
  ctx.fillStyle='#4a2c1c';ell(ctx,-s*.02,-s*.19,s*.07,s*.06);ctx.fill();ell(ctx,-s*.02,s*.19,s*.07,s*.06);ctx.fill();
  ctx.fillStyle='#e8504a';ell(ctx,-s*.01,-s*.14,s*.03,s*.03);ctx.fill();ell(ctx,-s*.01,s*.14,s*.03,s*.03);ctx.fill();
  ctx.fillStyle='#f2c9a4';ell(ctx,s*.04,0,s*.15,s*.14);ctx.fill();
  ctx.fillStyle='#5a3422';ctx.beginPath();ctx.ellipse(s*.02,0,s*.15,s*.145,0,Math.PI*.42,Math.PI*1.58);ctx.fill();
  ctx.fillStyle='#2a1a10';ell(ctx,s*.13,-s*.05,s*.02,s*.02);ctx.fill();ell(ctx,s*.13,s*.05,s*.02,s*.02);ctx.fill();
  ctx.restore();
}
// her toy: a little xylophone; notes float up while it plays
function toy(ctx,x,y,s,on,t){
  shadow(ctx,s,()=>{ctx.fillStyle='#5a3a20';rr(ctx,x-s*.28,y-s*.12,s*.56,s*.24,s*.04);ctx.fill();});
  const cs=['#e8504a','#f2a33a','#f2d74e','#6cc56a','#4aa8e8','#9a6ad8'];
  for(let i=0;i<6;i++){ctx.fillStyle=cs[i];rr(ctx,x-s*.25+i*s*.085,y-s*.1+(i*.012)*s,s*.07,s*.2-i*s*.02,s*.02);ctx.fill();}
  if(on)for(let i=0;i<3;i++){const k=(t*.8+i/3)%1;ctx.globalAlpha=1-k;label(ctx,i%2?'♪':'♫',x+s*(.1+.2*Math.sin(i*2+t)),y-s*(.25+k*.6),s*.26,'#7ee08a');ctx.globalAlpha=1;}
}
// the owner at her seat below the table: shoulders, arms with bowl and chopsticks, head bent over the bowl or raised to look
function owner(ctx,x,y,s,o){
  ctx.save();ctx.translate(x,y);
  const look=o.state===2||o.dash,warn=o.state===1;
  // chair back below her
  ctx.fillStyle='#4a2c18';rr(ctx,-s*.55,s*.28,s*1.1,s*.22,s*.08);ctx.fill();
  // shoulders and torso in a knit sweater
  ctx.fillStyle='rgba(20,8,0,.35)';ell(ctx,s*.04,s*.16,s*.68,s*.32);ctx.fill();
  const sw=ctx.createLinearGradient(0,-s*.3,0,s*.4);sw.addColorStop(0,'#d88a6a');sw.addColorStop(1,'#a85a42');ctx.fillStyle=sw;ell(ctx,0,s*.1,s*.64,s*.3);ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,.15)';ctx.lineWidth=1;for(let i=-4;i<=4;i++){ctx.beginPath();ctx.moveTo(i*s*.13,-s*.1);ctx.lineTo(i*s*.13,s*.35);ctx.stroke();}
  // arms forward onto the table edge
  const chop=o.state===0&&!o.dash?Math.sin(o.t*7)*s*.05:0;
  ctx.fillStyle='#c4704f';
  ctx.beginPath();ctx.moveTo(-s*.5,0);ctx.quadraticCurveTo(-s*.55,-s*.35,-s*.32,-s*.52);ctx.lineTo(-s*.2,-s*.46);ctx.quadraticCurveTo(-s*.38,-s*.3,-s*.3,s*.02);ctx.fill();
  ctx.beginPath();ctx.moveTo(s*.5,0);ctx.quadraticCurveTo(s*.55,-s*.35,s*.36,-s*.55+chop);ctx.lineTo(s*.24,-s*.48+chop);ctx.quadraticCurveTo(s*.38,-s*.3,s*.3,s*.02);ctx.fill();
  // rice bowl in her left hand, chopsticks in her right
  riceBowl(ctx,-s*.3,-s*.62,s*.85);
  ctx.fillStyle='#f2c9a4';ell(ctx,-s*.24,-s*.5,s*.07,s*.06);ctx.fill();ell(ctx,s*.3,-s*.53+chop,s*.07,s*.06);ctx.fill();
  ctx.strokeStyle='#7a4a24';ctx.lineWidth=Math.max(1.5,s*.025);ctx.lineCap='round';
  const cx=look?s*.42:s*.3,cy=look?-s*.75:-s*.9+chop*2;
  ctx.beginPath();ctx.moveTo(s*.32,-s*.5+chop);ctx.lineTo(cx-s*.06,cy);ctx.moveTo(s*.34,-s*.5+chop);ctx.lineTo(cx+s*.04,cy+s*.02);ctx.stroke();
  // head: bent down = we see the crown and a bun; raised = her face turned up at the table
  const hy=look?-s*.18:-s*.08,hr=s*.25;
  ctx.fillStyle='#2b201c';ell(ctx,0,hy+s*.14,s*.12,s*.1);ctx.fill();ctx.fillStyle='#c8a04a';ctx.fillRect(-s*.1,hy+s*.12,s*.2,s*.03);
  if(look){ // face turned up to the table, drawn front-on: hair cap with bangs, eyes looking up at the cat
    ctx.fillStyle='#2b201c';ell(ctx,0,hy,hr*1.02,hr);ctx.fill();ell(ctx,0,hy-hr*.95,s*.11,s*.09);ctx.fill();
    ctx.fillStyle='#f0c8a4';ell(ctx,0,hy+hr*.1,hr*.8,hr*.78);ctx.fill();
    ctx.fillStyle='#2b201c';ctx.beginPath();ctx.ellipse(0,hy-hr*.12,hr*.9,hr*.5,0,Math.PI,TAU);
    for(let i=4;i>=0;i--){const bx=-hr*.8+i*hr*.4;ctx.quadraticCurveTo(bx+hr*.2,hy+hr*.12,bx,hy-hr*.12);}ctx.fill();
    const by=hy+hr*.2;ctx.fillStyle='#fff';for(const sd of [-1,1]){ell(ctx,sd*hr*.32,by,hr*.17,hr*.14);ctx.fill();}
    ctx.fillStyle='#1a1210';for(const sd of [-1,1]){ell(ctx,sd*hr*.32,by-hr*.04,hr*.09,hr*.09);ctx.fill();}
    ctx.strokeStyle='#2b201c';ctx.lineWidth=Math.max(1.5,s*.022);for(const sd of [-1,1]){ctx.beginPath();ctx.moveTo(sd*hr*.14,by-hr*.24+(o.dash?hr*.06:0));ctx.lineTo(sd*hr*.5,by-hr*.28-(o.dash?hr*.06:0));ctx.stroke();}
    ctx.fillStyle='rgba(230,130,120,.5)';for(const sd of [-1,1]){ell(ctx,sd*hr*.52,by+hr*.22,hr*.12,hr*.07);ctx.fill();}
    ctx.fillStyle='#8a2a2a';if(o.dash){ell(ctx,0,hy+hr*.62,hr*.13,hr*.11);ctx.fill();}else{ctx.fillRect(-hr*.1,hy+hr*.6,hr*.2,Math.max(1,hr*.05));}}
  else{ctx.fillStyle='#2b201c';ell(ctx,0,hy,hr,hr*.95);ctx.fill();ctx.strokeStyle='rgba(255,255,255,.12)';ctx.lineWidth=1.2;for(let i=-3;i<=3;i++){ctx.beginPath();ctx.moveTo(i*s*.05,hy-hr*.9);ctx.quadraticCurveTo(i*s*.07,hy,i*s*.05,hy+hr*.8);ctx.stroke();}
    ctx.fillStyle='#f0c8a4';ctx.beginPath();ctx.ellipse(0,hy-hr*.82,hr*.5,hr*.18,0,Math.PI,TAU);ctx.fill();
    if(warn){ctx.fillStyle='#ffd75e';for(const sd of [-1,1]){ell(ctx,sd*s*.08,hy-hr*.9,s*.022,s*.016);ctx.fill();}}}
  ctx.restore();
}
function vignette(ctx,x,y,w,h){
  const g=ctx.createRadialGradient(x+w/2,y+h*.45,Math.min(w,h)*.35,x+w/2,y+h/2,Math.hypot(w,h)*.62);
  g.addColorStop(0,'rgba(20,8,0,0)');g.addColorStop(1,'rgba(20,8,0,.42)');ctx.fillStyle=g;ctx.fillRect(x,y,w,h);
}

// ---------- room composition, per level. G = {ox, oy, s} in CSS px; L = the built level from core.js
function paintRoom(ctx,L,G,labels){
  const s=G.s,X=c=>G.ox+c*s,Y=r=>G.oy+r*s,W=L.cols*s,H=L.rows*s,id=L.def.id;
  const lab=(text,c,r,w,h,dy)=>{if(labels)label(ctx,text,X(c+w/2),Y(r+h)-s*(dy||.16),Math.max(9,s*.16),'rgba(255,248,232,.92)','rgba(40,22,10,.55)');};
  ctx.save();ctx.beginPath();ctx.rect(G.ox,G.oy,W,H);ctx.clip();
  if(id==='living'){
    woodFloor(ctx,X(0),Y(0),W,H,s,11,'#9c6234');
    rug(ctx,X(1.3),Y(1.45),s*4.4,s*5.2,s,'#e8d7b4','#b8573e','#c98a5a',7,true);
    roomEdge(ctx,X(0),Y(0),W,H,s);
    gridLines(ctx,G,L.cols,L.rows,L.walk);
    tvCabinet(ctx,X(0),Y(1),s,s*6,s);
    lampAt(ctx,X(.5),Y(6.45),s);glow(ctx,X(.5),Y(6.45),s*1.9,'#ffcf7a',.32);
    bookshelf(ctx,X(6),Y(1),s,s*6,s);
    tankStatic(ctx,X(2),Y(2),s*3,s*2,s);
    coffeeTableUnder(ctx,X(2),Y(4),s*3,s*2,s);
    sofa(ctx,X(4),Y(7),s*2,s*2,s);
    catBed(ctx,X(.5),Y(8.5),s);
    doorTop(ctx,X(6),Y(0),s);
    plant(ctx,X(6.5),Y(8.5),s*.4,17);
    lab('电视柜',0,1,1,6,.3);lab('书柜',6,1,1,6,.3);lab('沙发',4,7,2,2,.22);
    label(ctx,'窝',X(.5),Y(8.88),Math.max(10,s*.17),'#ffe9c8','rgba(40,22,10,.6)');
  }else if(id==='hall'){
    woodFloor(ctx,X(0),Y(0),W,H,s,23,'#94582f');
    roomEdge(ctx,X(0),Y(0),W,H,s);
    for(let i=0;i<L.N;i++){const c=i%L.cols,r=(i/L.cols)|0,k=L.kind[i];
      if(k==='~')rug(ctx,X(c)+s*.08,Y(r)+s*.1,s*.84,s*.8,s,'#4f8296','#e9dcc0','#cfe3ea',i,true);}
    gridLines(ctx,G,L.cols,L.rows,L.walk);
    for(let i=0;i<L.N;i++)if(L.kind[i]==='#'&&i%L.cols<4)wallMass(ctx,X(i%L.cols),Y((i/L.cols)|0),s,s,s);
    bathroom(ctx,X(5),Y(0),s*2,H,s);
    shoeCabinet(ctx,X(4),Y(3),s);shoeCabinet(ctx,X(4),Y(5),s);
    playMat(ctx,X(0),Y(4),s);
    doorTop(ctx,X(4),Y(0),s,Math.PI*.5);
    ctx.fillStyle='#2a1a10';ctx.fillRect(X(2)-s*.06,Y(9)-s*.1,s*.12,s*.1);ctx.fillRect(X(3)-s*.06,Y(9)-s*.1,s*.12,s*.1);
    lab('卫生间',5,0,2,9,4.4);lab('鞋柜',4,3,1,1,.12);lab('鞋柜',4,5,1,1,.12);
    label(ctx,'客厅 ↓',X(2.5),Y(8.84),Math.max(10,s*.17),'#ffe9c8','rgba(40,22,10,.6)');
    for(let i=0;i<L.N;i++)if(L.kind[i]==='~')label(ctx,'可躲',X(i%L.cols+.5),Y(((i/L.cols)|0)+.5),Math.max(10,s*.19),'#fff8e8','rgba(30,40,50,.45)');
  }else{
    tableTop(ctx,X(0),Y(0),W,s*(L.rows-1),s);
    ownerSide(ctx,X(0),Y(L.rows-1),W,s);
    gridLines(ctx,G,L.cols,L.rows,L.walk);
    windowSill(ctx,X(6),Y(0),s);
    soupPot(ctx,X(2),Y(1.5),s);
    riceCooker(ctx,X(5.5),Y(3.5),s);riceBowl(ctx,X(6.5),Y(3.5),s);
    greensDish(ctx,X(3),Y(4.5),s);
    ctx.fillStyle='rgba(120,80,40,.35)';ell(ctx,X(3.5),Y(6.5),s*.55,s*.46);ctx.fill();
    ctx.strokeStyle='rgba(90,55,25,.5)';ctx.lineWidth=1;for(let i=1;i<5;i++){ell(ctx,X(3.5),Y(6.5),s*.55*i/5,s*.46*i/5);ctx.stroke();}
    plateAt(ctx,X(3.5),Y(6.5),s*.46,s*.38,s);
    // the edge to jump down from: the table edge on the left, a little drop shadow beyond it
    ctx.fillStyle='rgba(20,8,0,.5)';ctx.fillRect(X(0),Y(3)+s*.08,s*.1,s*.84);
    lab('汤锅',1,1,2,1,-.02);lab('饭锅',5,3,2,1,-.02);lab('菜',2,4,2,1,-.02);
    label(ctx,'窗台',X(6.5),Y(.86),Math.max(10,s*.16),'#ffe9c8','rgba(40,22,10,.6)');
  }
  ctx.restore();
}

root.SneakArt={hash,shade,alpha,label,glow,cat,kid,toy,owner,shrimp,steam,tankDynamic,doorLight,coffeeTableTop,vignette,paintRoom,plateAt};
})(typeof self!=='undefined'?self:this);
