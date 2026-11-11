// 小橘偷虾记 · art: every picture is drawn in code on a 2D canvas, no image files.
// The rooms (floor, furniture, shadows) are painted once per layout into an offscreen layer by paintRoom();
// fish, steam, the door light, the cats and the people are drawn every frame. Texture noise comes from a fixed hash,
// never Math.random, so fixed-view screenshots repeat exactly.
(function(root){
'use strict';
const TAU=Math.PI*2;
function hash(a,b,c){let h=(Math.imul(a|0,374761393)+Math.imul(b|0,668265263)+Math.imul((c|0)+1,1442695041))|0;h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return (h>>>0)/4294967296;}
function rgb(c){if(c.startsWith('rgb'))return c.match(/[\d.]+/g).slice(0,3).map(Number);c=c.replace('#','');return [parseInt(c.slice(0,2),16),parseInt(c.slice(2,4),16),parseInt(c.slice(4,6),16)];}
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

// A shallow extrusion inside the original footprint. Every top is lit from upper left;
// the dark lower/right skirt and both floor shadows share that light direction.
function volume(ctx,x,y,w,h,s,col,d,r){
  const topH=h-d,rx=d*.48;
  ctx.save();ctx.shadowColor='rgba(33,17,7,.38)';ctx.shadowBlur=s*.25+d*.5;ctx.shadowOffsetX=d*.75;ctx.shadowOffsetY=d;
  ctx.fillStyle='#4a2c18';rr(ctx,x,y,w,h,r);ctx.fill();ctx.restore();
  ctx.save();ctx.shadowColor='rgba(27,13,5,.65)';ctx.shadowBlur=s*.045;ctx.shadowOffsetY=s*.025;
  ctx.fillStyle='#4c301d';rr(ctx,x,y,w,h,r);ctx.fill();ctx.restore();
  const skirt=ctx.createLinearGradient(x,y,x+w,y+h);skirt.addColorStop(0,shade(col,-.24));skirt.addColorStop(1,shade(col,-.53));
  ctx.fillStyle=skirt;rr(ctx,x,y,w,h,r);ctx.fill();
  const top=ctx.createLinearGradient(x,y,x+w,y+topH);top.addColorStop(0,shade(col,.18));top.addColorStop(.5,col);top.addColorStop(1,shade(col,-.13));
  ctx.fillStyle=top;rr(ctx,x,y,w-rx,topH,r);ctx.fill();
  ctx.strokeStyle=shade(col,-.36);ctx.lineWidth=Math.max(.7,s*.012);rr(ctx,x+.5,y+.5,w-rx-1,topH-1,r);ctx.stroke();
  ctx.strokeStyle=shade(col,.46);ctx.lineWidth=Math.max(.7,s*.014);ctx.beginPath();ctx.moveTo(x+r,y+s*.025);ctx.lineTo(x+w-rx-r,y+s*.025);ctx.moveTo(x+s*.025,y+r);ctx.lineTo(x+s*.025,y+topH-r);ctx.stroke();
}
function fabric(ctx,x,y,w,h,s,seed){
  ctx.save();rr(ctx,x,y,w,h,s*.08);ctx.clip();
  ctx.strokeStyle='rgba(255,247,219,.065)';ctx.lineWidth=Math.max(.45,s*.006);
  for(let yy=y;yy<y+h;yy+=s*.035){ctx.beginPath();ctx.moveTo(x,yy);ctx.lineTo(x+w,yy);ctx.stroke();}
  ctx.strokeStyle='rgba(70,47,27,.055)';
  for(let xx=x;xx<x+w;xx+=s*.045){ctx.beginPath();ctx.moveTo(xx,y);ctx.lineTo(xx,y+h);ctx.stroke();}
  speckle(ctx,x,y,w,h,Math.round(w*h/s),'#6d4b32',.1,seed,s*.012);ctx.restore();
}
function warmPatch(ctx,x,y,w,h,s){
  ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
  // Feather the beam laterally and along its falloff; no hard polygon pasted on the boards.
  ctx.translate(x+w*.18,y-s*.35);ctx.rotate(-.49);ctx.scale(1,2.2);
  const g=ctx.createRadialGradient(0,0,0,0,0,s*2.5);g.addColorStop(0,'rgba(255,215,125,.34)');g.addColorStop(.65,'rgba(255,215,125,.13)');g.addColorStop(1,'rgba(255,215,125,0)');
  ctx.fillStyle=g;ctx.fillRect(-s*2.5,-s*2.5,s*5,s*5);ctx.restore();
}

function woodFloor(ctx,x,y,w,h,s,seed,base){
  const ph=s/3;ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
  ctx.fillStyle=base;ctx.fillRect(x,y,w,h);
  for(let r=0;r*ph<h;r++){
    const py=y+r*ph;let px=x-hash(r,seed,0)*s*2,k=0;
    while(px<x+w){
      const len=s*(1.5+hash(r,k,seed)*1.8),t=hash(k,r,seed+7);
      const g=ctx.createLinearGradient(0,py,0,py+ph);g.addColorStop(0,shade(base,(t-.5)*.22+.05));g.addColorStop(1,shade(base,(t-.5)*.22-.07));
      ctx.fillStyle=g;ctx.fillRect(px,py,len,ph);
      ctx.strokeStyle=shade(base,-.32);ctx.lineWidth=Math.max(.6,s/110);ctx.globalAlpha=.23;
      for(let q=0;q<7;q++){const gy=py+ph*(.2+.6*hash(k,q,r));ctx.beginPath();ctx.moveTo(px+2,gy);
        ctx.bezierCurveTo(px+len*.3,gy+ph*.22*(hash(q,k,1)-.5),px+len*.66,gy-ph*.2*(hash(q,k,2)-.5),px+len-2,gy+ph*.1*(hash(q,k,3)-.5));ctx.stroke();}
      if(hash(k,r,seed+3)>.78){ctx.globalAlpha=.45;ell(ctx,px+len*(.2+.6*hash(r,k,9)),py+ph/2,ph*.24,ph*.13);ctx.stroke();}
      ctx.globalAlpha=.1;ctx.fillStyle='#f9d398';
      for(let v=0;v<8;v++){const sx=px+hash(v,k+r*11,seed)*len,sy=py+hash(v,r,seed+4)*ph;ctx.fillRect(sx,sy,s*(.025+.09*hash(v,k,seed)),Math.max(.4,s*.006));}
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
  shadow(ctx,s,()=>{ctx.fillStyle=c1;rr(ctx,x,y,w,h,s*.045);ctx.fill();},.45);
  const b=Math.min(w,h)*.075;
  ctx.fillStyle=c2;rr(ctx,x+b*.4,y+b*.4,w-b*.8,h-b*.8,s*.025);ctx.fill();
  ctx.fillStyle=c1;rr(ctx,x+b*.8,y+b*.8,w-b*1.6,h-b*1.6,s*.02);ctx.fill();
  ctx.strokeStyle=shade(c2,-.12);ctx.lineWidth=Math.max(.65,s*.011);ctx.strokeRect(x+b*.2,y+b*.2,w-b*.4,h-b*.4);ctx.strokeRect(x+b*1.4,y+b*1.4,w-b*2.8,h-b*2.8);
  // A continuous vine, paired leaves and brick-red rosettes. Scales down to corridor mats.
  const flower=(fx,fy,z)=>{ctx.fillStyle=shade(c2,.22);for(let j=0;j<7;j++){const a=j*TAU/7;ell(ctx,fx+Math.cos(a)*z*.45,fy+Math.sin(a)*z*.45,z*.42,z*.3,a);ctx.fill();}ctx.fillStyle=shade(c2,-.12);ell(ctx,fx,fy,z*.36,z*.36);ctx.fill();ctx.strokeStyle=shade(c1,-.12);ctx.lineWidth=Math.max(.4,s*.006);ctx.beginPath();ctx.arc(fx,fy,z*.2,.2,Math.PI*1.7);ctx.stroke();};
  const vine=(horizontal,px,py,len)=>{ctx.save();ctx.translate(px,py);if(!horizontal)ctx.rotate(Math.PI/2);
    ctx.strokeStyle=shade(c3,-.3);ctx.lineWidth=Math.max(.55,s*.012);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(len,0);ctx.stroke();
    const step=Math.max(s*.38,b*2.6),n=Math.max(1,Math.floor(len/step));
    for(let i=0;i<n;i++){const q=(i+.5)*len/n,z=Math.min(b*.55,s*.1);flower(q,0,z);ctx.fillStyle=shade(c3,-.3);
      for(const sd of [-1,1]){ell(ctx,q-len/n*.23,sd*z*.5,z*.75,z*.25,sd*.55);ctx.fill();ell(ctx,q+len/n*.18,sd*z*.7,z*.6,z*.22,-sd*.65);ctx.fill();
        ctx.strokeStyle=shade(c3,-.2);ctx.lineWidth=Math.max(.5,s*.008);ctx.beginPath();ctx.moveTo(q+z,0);ctx.bezierCurveTo(q+len/n*.35,sd*z*.15,q+len/n*.28,sd*z*1.4,q+len/n*.1,sd*z*1.1);ctx.stroke();}}
    ctx.restore();};
  vine(true,x+b,y+b,w-2*b);vine(true,x+b,y+h-b,w-2*b);vine(false,x+b,y+b,h-2*b);vine(false,x+w-b,y+b,h-2*b);
  ctx.save();ctx.beginPath();ctx.rect(x+b*1.7,y+b*1.7,w-b*3.4,h-b*3.4);ctx.clip();ctx.globalAlpha=.18;
  for(let yy=y+b*2.3;yy<y+h-b;yy+=s*.6)for(let xx=x+b*2.3;xx<x+w-b;xx+=s*.6)flower(xx,yy,s*.1);
  ctx.restore();
  fabric(ctx,x,y,w,h,s,seed);
  if(fringe){ctx.strokeStyle=shade(c1,-.06);ctx.lineWidth=Math.max(.65,s*.013);
    for(let yy=y+s*.02;yy<y+h-s*.02;yy+=s*.042){ctx.beginPath();ctx.moveTo(x,yy);ctx.lineTo(x-s*.065,yy+s*.018);ctx.moveTo(x+w,yy);ctx.lineTo(x+w+s*.065,yy+s*.018);ctx.stroke();}}
}

function roomEdge(ctx,x,y,w,h,s){
  // Wall top and inner skirting stay inside the board, including phones with no outer padding.
  const d=s*.085;
  const g=ctx.createLinearGradient(x,y,x+w,y+h);g.addColorStop(0,'#a87749');g.addColorStop(1,'#694328');
  ctx.strokeStyle=g;ctx.lineWidth=d;ctx.strokeRect(x+d/2,y+d/2,w-d,h-d);
  ctx.strokeStyle='#d5ab73';ctx.lineWidth=Math.max(.7,s*.014);ctx.beginPath();ctx.moveTo(x+d,y+h-d);ctx.lineTo(x+d,y+d);ctx.lineTo(x+w-d,y+d);ctx.stroke();
  ctx.strokeStyle='rgba(47,25,12,.55)';ctx.lineWidth=s*.025;ctx.strokeRect(x+d,y+d,w-2*d,h-2*d);
  ctx.save();ctx.shadowColor='rgba(39,19,6,.28)';ctx.shadowBlur=s*.1;ctx.shadowOffsetX=s*.035;ctx.shadowOffsetY=s*.05;
  ctx.strokeStyle='rgba(48,25,12,.3)';ctx.lineWidth=1;ctx.strokeRect(x+d,y+d,w-2*d,h-2*d);ctx.restore();
}

function gridLines(ctx,G,cols,rows,walk){
  ctx.save();ctx.strokeStyle='rgba(20,8,0,.16)';ctx.lineWidth=1;
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)if(walk(r*cols+c))ctx.strokeRect(G.ox+c*G.s+.5,G.oy+r*G.s+.5,G.s-1,G.s-1);
  ctx.restore();
}

// ---------- living-room furniture
function plant(ctx,x,y,r,seed){
  shadow(ctx,r*3,()=>{ctx.fillStyle='#854b30';ell(ctx,x+r*.07,y+r*.13,r*.64,r*.62);ctx.fill();});
  const pot=ctx.createRadialGradient(x-r*.2,y-r*.2,0,x,y,r*.7);pot.addColorStop(0,'#d99b65');pot.addColorStop(1,'#774027');ctx.fillStyle=pot;ell(ctx,x,y,r*.62,r*.6);ctx.fill();
  ctx.fillStyle='#e5b782';ell(ctx,x,y-r*.025,r*.53,r*.5);ctx.fill();ctx.fillStyle='#49321d';ell(ctx,x,y-r*.025,r*.45,r*.42);ctx.fill();
  for(let i=0;i<13;i++){const a=i/13*TAU+hash(i,seed)*.5,l=r*(.72+.37*hash(seed,i)),lx=x+Math.cos(a)*l*.55,ly=y+Math.sin(a)*l*.55;
    ctx.fillStyle='rgba(20,41,12,.25)';ell(ctx,lx+r*.05,ly+r*.09,l*.46,l*.21,a);ctx.fill();
    const g=ctx.createLinearGradient(lx-r*.2,ly-r*.2,lx+r*.2,ly+r*.2);g.addColorStop(0,i%2?'#8baf4c':'#6d9b42');g.addColorStop(1,i%2?'#3c682a':'#355d28');ctx.fillStyle=g;ell(ctx,lx,ly,l*.46,l*.19,a);ctx.fill();
    ctx.strokeStyle='rgba(205,219,122,.4)';ctx.lineWidth=Math.max(.5,r*.035);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(lx+Math.cos(a)*l*.36,ly+Math.sin(a)*l*.36);ctx.stroke();}
  ctx.fillStyle='#91b657';ell(ctx,x-r*.08,y-r*.08,r*.19,r*.16);ctx.fill();
}

function woodBox(ctx,x,y,w,h,s,col,seed){
  volume(ctx,x,y,w,h,s,col,s*.2,s*.05);
  ctx.save();rr(ctx,x+s*.03,y+s*.03,w-s*.16,h-s*.25,s*.03);ctx.clip();
  const vert=h>w;ctx.lineWidth=Math.max(.55,s*.009);
  for(let i=0;i<16;i++){const t=(i+.5)/16;ctx.strokeStyle=i%3===0?shade(col,.24):shade(col,-.22);ctx.globalAlpha=.4;ctx.beginPath();
    if(vert){const gx=x+w*t;ctx.moveTo(gx,y);ctx.bezierCurveTo(gx+s*.07*(hash(i,seed)-.5),y+h*.3,gx-s*.07*(hash(seed,i)-.5),y+h*.7,gx,y+h);}
    else{const gy=y+h*t;ctx.moveTo(x,gy);ctx.bezierCurveTo(x+w*.3,gy+s*.07*(hash(i,seed)-.5),x+w*.7,gy-s*.07*(hash(seed,i)-.5),x+w,gy);}ctx.stroke();}
  ctx.restore();
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
  shadow(ctx,s,()=>{ctx.fillStyle='#ae7943';ell(ctx,x+s*.02,y+s*.04,s*.29,s*.28);ctx.fill();});
  const g=ctx.createRadialGradient(x-s*.07,y-s*.08,0,x,y,s*.27);g.addColorStop(0,'#fffbdc');g.addColorStop(.55,'#ffe5a2');g.addColorStop(1,'#c99551');ctx.fillStyle=g;ell(ctx,x,y,s*.27,s*.26);ctx.fill();
  ctx.save();ell(ctx,x,y,s*.26,s*.25);ctx.clip();ctx.strokeStyle='rgba(166,111,42,.3)';ctx.lineWidth=Math.max(.6,s*.011);
  for(let i=0;i<18;i++){const a=i/18*TAU;ctx.beginPath();ctx.moveTo(x+Math.cos(a)*s*.09,y+Math.sin(a)*s*.09);ctx.lineTo(x+Math.cos(a)*s*.27,y+Math.sin(a)*s*.26);ctx.stroke();}ctx.restore();
  ctx.fillStyle='#fff7d0';ell(ctx,x,y,s*.1,s*.095);ctx.fill();ctx.strokeStyle='#d9b264';ctx.lineWidth=s*.014;ell(ctx,x,y,s*.1,s*.095);ctx.stroke();
}

function glow(ctx,x,y,r,col,a){ctx.save();ctx.globalCompositeOperation='lighter';const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,alpha(col,a));g.addColorStop(1,alpha(col,0));ctx.fillStyle=g;ctx.fillRect(x-r,y-r,2*r,2*r);ctx.restore();}
function bookshelf(ctx,x,y,w,h,s){
  woodBox(ctx,x+s*.06,y+s*.02,w-s*.12,h-s*.04,s,'#85542f',5);
  const ix=x+s*.16,iw=w-s*.35,sh=(h-s*.28)/6;
  const cols=['#aa5940','#416c7a','#c9a45b','#697b49','#865769','#cdbb94','#394f67','#b67b49'];
  for(let k=0;k<6;k++){
    const sy=y+s*.08+k*sh;
    const recess=ctx.createLinearGradient(ix,sy,ix+iw,sy+sh);recess.addColorStop(0,'#35271a');recess.addColorStop(1,'#62442a');ctx.fillStyle=recess;ctx.fillRect(ix,sy,iw,sh-s*.07);
    let by=sy+s*.065,i=0;
    while(by<sy+sh-s*.13){const th=s*(.055+.055*hash(k,i,2)),len=iw*(.64+.3*hash(i,k,5));
      if(hash(k,i,11)>.87){by+=th*1.8;i++;continue;}
      const col=cols[Math.floor(hash(i,k,7)*cols.length)];ctx.fillStyle=shade(col,-.35);ctx.fillRect(ix+s*.02,by+s*.023,len,th);ctx.fillStyle=col;ctx.fillRect(ix,by,len,th-s*.014);
      ctx.fillStyle=shade(col,.35);ctx.fillRect(ix,by,len,s*.012);ctx.fillStyle='#ddc69a';ctx.fillRect(ix+len-s*.06,by+s*.01,s*.018,th-s*.03);
      if(th>s*.075){ctx.fillStyle='rgba(240,219,178,.5)';ctx.fillRect(ix+s*.09,by+th*.43,len*.32,s*.012);}by+=th;i++;}
    volume(ctx,x+s*.12,sy+sh-s*.1,w-s*.26,s*.095,s,'#a06f41',s*.05,s*.008);
    if(k===2){ctx.fillStyle='#c9b58c';rr(ctx,ix+s*.09,sy+sh-s*.3,s*.32,s*.19,s*.03);ctx.fill();ctx.fillStyle='#957752';ctx.fillRect(ix+s*.08,sy+sh-s*.17,s*.35,s*.035);}
    if(k===4){ctx.fillStyle='#bf8b58';ell(ctx,ix+iw*.75,sy+sh*.3,s*.09,s*.12);ctx.fill();ctx.fillStyle='#e0bc7d';ell(ctx,ix+iw*.74,sy+sh*.27,s*.04,s*.065);ctx.fill();}
  }
  // Trailing sprig over the top shelf, not a new obstacle.
  ctx.strokeStyle='#536e30';ctx.lineWidth=s*.025;ctx.beginPath();ctx.moveTo(x+s*.6,y+s*.25);ctx.bezierCurveTo(x+s*.9,y+s*.4,x+s*.55,y+s*.7,x+s*.82,y+s*.94);ctx.stroke();
  for(let i=0;i<6;i++){ctx.fillStyle=i%2?'#7f9b43':'#567b33';ell(ctx,x+s*(.71+(i%2)*.13),y+s*(.34+i*.1),s*.095,s*.045,i%2?.6:-.5);ctx.fill();}
  plant(ctx,x+w*.5,y+s*.32,s*.27,9);
}

function tankStatic(ctx,x,y,w,h,s){
  volume(ctx,x+s*.045,y+s*.045,w-s*.09,h-s*.035,s,'#6f674b',s*.11,s*.055);
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
  const base='#c4a17a',bx=x+s*.07,by=y+s*.1,bw=w-s*.14,bh=h-s*.17;
  volume(ctx,bx,by,bw,bh,s,base,s*.14,s*.18);
  // The back is along the lower wall; plump seats face up into the room.
  for(let i=0;i<2;i++){const sx=x+s*.37+i*(w-s*.74)/2,sw=(w-s*.74)/2-s*.025;
    volume(ctx,sx,y+s*.24,sw,h-s*.84,s,shade(base,.08),s*.055,s*.12);
    const g=ctx.createRadialGradient(sx+sw*.3,y+s*.5,s*.01,sx+sw*.55,y+h*.43,sw);g.addColorStop(0,'rgba(255,244,215,.26)');g.addColorStop(1,'rgba(62,36,20,.08)');ctx.fillStyle=g;rr(ctx,sx+s*.02,y+s*.26,sw-s*.05,h-s*.93,s*.1);ctx.fill();
    fabric(ctx,sx,y+s*.24,sw,h-s*.84,s,21+i);}
  for(const ax of [bx,x+w-s*.34]){volume(ctx,ax,by,s*.27,bh-s*.08,s,shade(base,.09),s*.1,s*.13);fabric(ctx,ax,by,s*.27,bh-s*.18,s,22);}
  volume(ctx,x+s*.29,y+h-s*.56,w-s*.58,s*.42,s,shade(base,.13),s*.09,s*.13);fabric(ctx,x+s*.29,y+h-s*.56,w-s*.58,s*.32,s,23);
  // Two stuffed pillows with a tucked seam; one has broad woven checks.
  for(const [px,py,rot,col,check] of [[.32,.69,-.24,'#788447',false],[.72,.68,.23,'#ce8650',true]]){
    ctx.save();ctx.translate(x+w*px,y+h*py);ctx.rotate(rot);volume(ctx,-s*.25,-s*.22,s*.5,s*.43,s,col,s*.045,s*.08);
    ctx.save();rr(ctx,-s*.23,-s*.2,s*.44,s*.34,s*.065);ctx.clip();
    if(check){ctx.strokeStyle='rgba(255,226,161,.65)';ctx.lineWidth=s*.055;for(let i=-2;i<=2;i++){ctx.beginPath();ctx.moveTo(i*s*.12,-s*.22);ctx.lineTo(i*s*.12,s*.18);ctx.moveTo(-s*.25,i*s*.11);ctx.lineTo(s*.25,i*s*.11);ctx.stroke();}}
    fabric(ctx,-s*.25,-s*.22,s*.5,s*.38,s,24);ctx.restore();ctx.strokeStyle=shade(col,-.28);ctx.lineWidth=.7;rr(ctx,-s*.21,-s*.18,s*.4,s*.3,s*.065);ctx.stroke();ctx.restore();}
  ctx.save();ctx.translate(x+w*.59,y+h*.39);ctx.rotate(.09);
  shadow(ctx,s*.5,()=>{ctx.fillStyle='#eee0bb';rr(ctx,-s*.25,-s*.26,s*.5,s*.77,s*.035);ctx.fill();},.5);
  const tg=ctx.createLinearGradient(-s*.25,0,s*.25,0);tg.addColorStop(0,'#e3d2ad');tg.addColorStop(.4,'#fbefd2');tg.addColorStop(.68,'#c8b48c');tg.addColorStop(1,'#eee0bb');ctx.fillStyle=tg;rr(ctx,-s*.25,-s*.26,s*.5,s*.77,s*.035);ctx.fill();
  ctx.strokeStyle='rgba(126,102,67,.35)';ctx.lineWidth=s*.018;for(let i=-5;i<=5;i++){const xx=i*s*.043;ctx.beginPath();ctx.moveTo(xx,-s*.24);ctx.bezierCurveTo(xx+s*.025,0,xx-s*.025,s*.25,xx,s*.5);ctx.stroke();}
  ctx.strokeStyle='#eee0bb';ctx.lineWidth=s*.015;for(let i=-6;i<=6;i++){ctx.beginPath();ctx.moveTo(i*s*.035,s*.5);ctx.lineTo(i*s*.035-s*.01,s*.59);ctx.stroke();}ctx.restore();
}

function catBed(ctx,x,y,s){
  shadow(ctx,s,()=>{ctx.fillStyle='#92493a';ell(ctx,x+s*.02,y+s*.06,s*.44,s*.42);ctx.fill();});
  const g=ctx.createRadialGradient(x-s*.12,y-s*.16,s*.05,x,y,s*.46);g.addColorStop(0,'#e1aa73');g.addColorStop(.65,'#b4724b');g.addColorStop(1,'#723b2c');ctx.fillStyle=g;ell(ctx,x,y,s*.43,s*.41);ctx.fill();
  ctx.fillStyle='#63422d';ell(ctx,x,y-s*.01,s*.31,s*.29);ctx.fill();
  const lining=ctx.createRadialGradient(x,y+s*.06,0,x,y,s*.3);lining.addColorStop(0,'#f5e0b6');lining.addColorStop(1,'#b79161');ctx.fillStyle=lining;ell(ctx,x,y+s*.015,s*.28,s*.26);ctx.fill();
  for(let i=0;i<90;i++){const a=hash(i,31)*TAU,r=s*(.3+.07*hash(i,32));ctx.strokeStyle=i%2?'#f1d2a0':'#c39761';ctx.lineWidth=s*.025;ctx.beginPath();ctx.moveTo(x+Math.cos(a)*r,y+Math.sin(a)*r*.95);ctx.lineTo(x+Math.cos(a)*(r+s*.035),y+Math.sin(a)*(r+s*.035)*.95);ctx.stroke();}
  ctx.save();ell(ctx,x,y,s*.27,s*.25);ctx.clip();speckle(ctx,x-s*.27,y-s*.25,s*.54,s*.5,90,'#987044',.22,31,s*.022);ctx.restore();
  for(const a of [.6,1.5,2.4]){const px=x+Math.cos(a)*s*.37,py=y+Math.sin(a)*s*.35;ctx.fillStyle='#efd4a7';ell(ctx,px,py,s*.035,s*.028,a);ctx.fill();for(let i=-1;i<=1;i++){ell(ctx,px+i*s*.03,py-s*.045,s*.014,s*.018);ctx.fill();}}
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
  // The low table casts onto the rug, with a separate short shadow under each leg.
  ctx.save();ctx.shadowColor='rgba(36,19,8,.48)';ctx.shadowBlur=s*.18;ctx.shadowOffsetX=s*.1;ctx.shadowOffsetY=s*.15;
  ctx.fillStyle='rgba(40,23,12,.38)';rr(ctx,x+s*.15,y+s*.2,w-s*.23,h-s*.2,s*.12);ctx.fill();ctx.restore();
  for(const [lx,ly] of [[x+s*.2,y+s*.2],[x+w-s*.3,y+s*.2],[x+s*.2,y+h-s*.3],[x+w-s*.3,y+h-s*.3]]){
    ctx.save();ctx.shadowColor='rgba(29,14,5,.8)';ctx.shadowBlur=s*.06;ctx.shadowOffsetX=s*.09;ctx.shadowOffsetY=s*.1;ctx.fillStyle='#59361e';rr(ctx,lx,ly,s*.15,s*.23,s*.025);ctx.fill();ctx.restore();}
}

function coffeeTableTop(ctx,x,y,w,h,s,a){
  ctx.save();ctx.globalAlpha=a;
  const col='#ac7542',tx=x+s*.1,ty=y+s*.09,tw=w-s*.2,th=h-s*.3;
  volume(ctx,tx,ty,tw,th,s,col,s*.09,s*.11);
  ctx.save();rr(ctx,tx+s*.025,ty+s*.025,tw-s*.1,th-s*.14,s*.08);ctx.clip();
  for(let i=0;i<24;i++){const gy=ty+th*(i+.5)/24;ctx.strokeStyle=i%3===0?'rgba(255,220,161,.21)':'rgba(87,43,17,.24)';ctx.lineWidth=Math.max(.5,s*.01);ctx.beginPath();ctx.moveTo(tx,gy);ctx.bezierCurveTo(tx+tw*.3,gy+s*.06*Math.sin(i),tx+tw*.7,gy-s*.045*Math.sin(i+.3),tx+tw,gy);ctx.stroke();}
  ctx.strokeStyle='rgba(82,41,16,.2)';ctx.lineWidth=s*.012;ell(ctx,tx+tw*.74,ty+th*.64,s*.13,s*.032);ctx.stroke();ctx.restore();
  // Slightly raised magazine, page block visible on lower and right edges.
  ctx.save();ctx.translate(x+w*.28,y+h*.38);ctx.rotate(-.16);volume(ctx,-s*.34,-s*.23,s*.68,s*.46,s,'#e8dfc9',s*.035,s*.015);
  ctx.fillStyle='#bf6544';ctx.fillRect(-s*.3,-s*.19,s*.59,s*.11);ctx.fillStyle='#6d8569';ctx.fillRect(-s*.28,-s*.04,s*.2,s*.15);ctx.strokeStyle='#a79c86';ctx.lineWidth=s*.012;for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(-s*.015,-s*.03+i*s*.05);ctx.lineTo(s*.25,-s*.03+i*s*.05);ctx.stroke();}ctx.restore();
  const mx=x+w*.78,my=y+h*.32;
  shadow(ctx,s*.6,()=>{ctx.fillStyle='#c4a786';ell(ctx,mx+s*.015,my+s*.025,s*.18,s*.16);ctx.fill();},.7);
  ctx.strokeStyle='#e6d6b8';ctx.lineWidth=s*.04;ell(ctx,mx+s*.16,my+s*.005,s*.065,s*.068);ctx.stroke();
  ctx.fillStyle='#bba584';ell(ctx,mx+s*.015,my+s*.045,s*.13,s*.13);ctx.fill();
  ctx.fillStyle='#fcf0d6';ell(ctx,mx,my-s*.015,s*.135,s*.115);ctx.fill();ctx.fillStyle='#633b23';ell(ctx,mx,my-s*.015,s*.095,s*.077);ctx.fill();
  ctx.strokeStyle='#fff9e5';ctx.lineWidth=s*.018;ctx.beginPath();ctx.ellipse(mx,my-s*.015,s*.116,s*.096,0,Math.PI,TAU);ctx.stroke();ctx.restore();
}

function wallMass(ctx,x,y,w,h,s){
  const g=ctx.createLinearGradient(x,y,x+w,y+h);g.addColorStop(0,'#5e4a3c');g.addColorStop(1,'#43342a');ctx.fillStyle=g;ctx.fillRect(x,y,w,h);
  ctx.strokeStyle='rgba(0,0,0,.18)';ctx.lineWidth=1;for(let yy=y+s*.25;yy<y+h;yy+=s*.25){ctx.beginPath();ctx.moveTo(x,yy);ctx.lineTo(x+w,yy);ctx.stroke();}
  speckle(ctx,x,y,w,h,Math.round(w*h/(s*1.2)),'#ffffff',.05,41,Math.max(1,s/50));
  ctx.strokeStyle='rgba(255,230,200,.18)';ctx.lineWidth=1.5;ctx.strokeRect(x+1,y+1,w-2,h-2);
}
function bathroom(ctx,x,y,w,h,s){
  const floor=ctx.createLinearGradient(x,y,x+w,y+h);floor.addColorStop(0,'#d7ded8');floor.addColorStop(1,'#a5b9b8');ctx.fillStyle=floor;ctx.fillRect(x,y,w,h);
  const t=s*.33;ctx.lineWidth=Math.max(.6,s*.01);
  for(let yy=y;yy<y+h;yy+=t)for(let xx=x;xx<x+w;xx+=t){
    ctx.fillStyle=hash(Math.round((xx-x)/t),Math.round((yy-y)/t),14)>.5?'rgba(255,255,246,.1)':'rgba(74,113,119,.04)';ctx.fillRect(xx+1,yy+1,t-1,t-1);
    ctx.strokeStyle='rgba(68,99,104,.27)';ctx.strokeRect(xx+.5,yy+.5,t,t);ctx.strokeStyle='rgba(255,255,255,.26)';ctx.beginPath();ctx.moveTo(xx+1,yy+t-1);ctx.lineTo(xx+1,yy+1);ctx.lineTo(xx+t-1,yy+1);ctx.stroke();}
  const tx=x+w*.5,ty=y+h*.78;
  volume(ctx,tx-s*.36,ty+s*.16,s*.72,s*.38,s,'#dee3d7',s*.1,s*.08);
  shadow(ctx,s,()=>{ctx.fillStyle='#96a8a3';ell(ctx,tx+s*.035,ty+s*.09,s*.33,s*.39);ctx.fill();});
  const porcelain=ctx.createLinearGradient(tx-s*.3,ty-s*.4,tx+s*.3,ty+s*.4);porcelain.addColorStop(0,'#fffdf0');porcelain.addColorStop(.55,'#e8ebdf');porcelain.addColorStop(1,'#a5b9b6');ctx.fillStyle=porcelain;ell(ctx,tx,ty,s*.31,s*.38);ctx.fill();
  ctx.fillStyle='#869e9e';ell(ctx,tx,ty-s*.035,s*.21,s*.27);ctx.fill();ctx.fillStyle='#c6dbd5';ell(ctx,tx,ty+s*.015,s*.15,s*.2);ctx.fill();ctx.strokeStyle='#fffdf0';ctx.lineWidth=s*.034;ctx.beginPath();ctx.ellipse(tx,ty,s*.27,s*.34,0,Math.PI,TAU);ctx.stroke();
  ctx.fillStyle='#adbbb0';ell(ctx,tx,ty+s*.29,s*.055,s*.025);ctx.fill();
  const sx=x+w*.5,sy=y+h*.2;
  volume(ctx,sx-s*.46,sy-s*.37,s*.92,s*.79,s,'#e5e6d4',s*.14,s*.18);
  const basin=ctx.createRadialGradient(sx+s*.08,sy+s*.07,s*.03,sx,sy,s*.34);basin.addColorStop(0,'#d7e6dc');basin.addColorStop(.65,'#a5bdb7');basin.addColorStop(1,'#6f9290');ctx.fillStyle=basin;ell(ctx,sx,sy-s*.025,s*.32,s*.23);ctx.fill();
  ctx.strokeStyle='#fffcec';ctx.lineWidth=s*.023;ctx.beginPath();ctx.ellipse(sx,sy-s*.025,s*.35,s*.26,0,Math.PI,TAU);ctx.stroke();ctx.fillStyle='#6b807a';ell(ctx,sx+s*.03,sy+s*.07,s*.028,s*.024);ctx.fill();
  volume(ctx,sx-s*.045,sy-s*.37,s*.09,s*.25,s,'#9bacaa',s*.04,s*.025);ctx.fillStyle='#f7fcf7';ctx.fillRect(sx-s*.025,sy-s*.34,s*.025,s*.15);
  rug(ctx,x+w*.2,y+h*.48,w*.6,s*.55,s,'#7fa9b3','#c8d8cd','#456b77',51,false);
  // Divider with a lit wall top, dark inner face and baseboard.
  volume(ctx,x-s*.035,y,s*.13,h,s,'#a78860',s*.11,s*.015);ctx.fillStyle='#ead7ac';ctx.fillRect(x-s*.035,y,s*.035,h-s*.11);
}

function shoeCabinet(ctx,x,y,s){
  woodBox(ctx,x+s*.08,y+s*.06,s*.84,s*.88,s,'#a06b3d',61);
  ctx.strokeStyle='#654023';ctx.lineWidth=s*.015;ctx.beginPath();ctx.moveTo(x+s*.14,y+s*.81);ctx.lineTo(x+s*.8,y+s*.81);ctx.stroke();
  ctx.fillStyle='#c8ac74';rr(ctx,x+s*.43,y+s*.84,s*.16,s*.025,s*.012);ctx.fill();
  for(const [dx,dy,col,rot] of [[.3,.31,'#eee6ce',.2],[.49,.29,'#eee6ce',.1],[.62,.6,'#bf6b51',-.3],[.79,.58,'#bf6b51',-.2]]){
    ctx.save();ctx.translate(x+s*dx,y+s*dy);ctx.rotate(rot);shadow(ctx,s*.35,()=>{ctx.fillStyle=shade(col,-.32);ell(ctx,s*.015,s*.025,s*.075,s*.16);ctx.fill();},.8);
    ctx.fillStyle=col;ell(ctx,0,0,s*.07,s*.16);ctx.fill();ctx.fillStyle=shade(col,-.46);ell(ctx,0,-s*.06,s*.042,s*.058);ctx.fill();
    ctx.strokeStyle=shade(col,.4);ctx.lineWidth=s*.012;for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(-s*.035,s*(.015+i*.027));ctx.lineTo(s*.035,s*(.015+i*.027));ctx.stroke();}ctx.restore();}
}

function playMat(ctx,x,y,s){
  const cols=['#e86a5a','#f2c14e','#5aaee8','#6cc56a'];
  for(let i=0;i<4;i++){ctx.fillStyle=cols[i];ctx.fillRect(x+(i%2)*s*.5,y+((i/2)|0)*s*.5,s*.5,s*.5);}
  ctx.strokeStyle='rgba(0,0,0,.2)';ctx.lineWidth=1;ctx.strokeRect(x+.5,y+.5,s-1,s-1);ctx.beginPath();ctx.moveTo(x+s/2,y);ctx.lineTo(x+s/2,y+s);ctx.moveTo(x,y+s/2);ctx.lineTo(x+s,y+s/2);ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,.18)';ctx.fillRect(x,y,s,s);
}

// ---------- dinner table
function tableTop(ctx,x,y,w,h,s){
  woodFloor(ctx,x,y,w,h,s*1.7,77,'#99613b');
  warmPatch(ctx,x,y,w,h,s);
  // Linen retains the wood's warm light without turning the entire table into a pale block.
  const rx=x+w*.3,rw=w*.4;ctx.fillStyle='#d4bb91';ctx.fillRect(rx,y,rw,h);
  ctx.strokeStyle='#a65f43';ctx.lineWidth=s*.025;for(const ex of [rx+s*.065,rx+rw-s*.065]){ctx.beginPath();ctx.moveTo(ex,y);ctx.lineTo(ex,y+h);ctx.stroke();}
  fabric(ctx,rx,y,rw,h,s,71);
  // Small embroidered crosses alongside the two hems.
  ctx.strokeStyle='rgba(144,92,56,.33)';ctx.lineWidth=s*.012;
  for(let yy=y+s*.22;yy<y+h;yy+=s*.29)for(const xx of [rx+s*.15,rx+rw-s*.15]){ctx.beginPath();ctx.moveTo(xx-s*.025,yy-s*.025);ctx.lineTo(xx+s*.025,yy+s*.025);ctx.moveTo(xx+s*.025,yy-s*.025);ctx.lineTo(xx-s*.025,yy+s*.025);ctx.stroke();}
  ctx.fillStyle='#59341c';ctx.fillRect(x,y+h-s*.09,w,s*.09);ctx.fillRect(x+w-s*.07,y,s*.07,h);
  ctx.strokeStyle='#d4a369';ctx.lineWidth=s*.025;ctx.beginPath();ctx.moveTo(x+s*.04,y+h-s*.1);ctx.lineTo(x+s*.04,y+s*.04);ctx.lineTo(x+w-s*.08,y+s*.04);ctx.stroke();
  ctx.strokeStyle='rgba(255,220,170,.35)';ctx.lineWidth=1;ctx.strokeRect(x+s*.08,y+s*.08,w-s*.16,h-s*.2);
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
function soupPot(ctx,x,y,s){
  for(const sx of [-1,1])volume(ctx,x+sx*s*.52-s*.14,y-s*.08,s*.28,s*.18,s,'#44474a',s*.05,s*.06);
  shadow(ctx,s,()=>{ctx.fillStyle='#353e3f';ell(ctx,x+s*.04,y+s*.08,s*.52,s*.47);ctx.fill();},1.2);
  const wall=ctx.createLinearGradient(x-s*.5,y,x+s*.5,y+s*.4);wall.addColorStop(0,'#9aa7a0');wall.addColorStop(.35,'#5d6863');wall.addColorStop(1,'#303a3b');ctx.fillStyle=wall;ell(ctx,x+s*.015,y+s*.06,s*.51,s*.46);ctx.fill();
  const rim=ctx.createLinearGradient(x-s*.5,y-s*.45,x+s*.4,y+s*.4);rim.addColorStop(0,'#edf0df');rim.addColorStop(.4,'#b9c4b8');rim.addColorStop(.7,'#647675');rim.addColorStop(1,'#3a4445');ctx.fillStyle=rim;ell(ctx,x,y-s*.055,s*.5,s*.43);ctx.fill();
  ctx.fillStyle='#775125';ell(ctx,x,y-s*.055,s*.415,s*.355);ctx.fill();
  const b=ctx.createRadialGradient(x-s*.12,y-s*.18,0,x,y,s*.42);b.addColorStop(0,'#e1b660');b.addColorStop(1,'#b77530');ctx.fillStyle=b;ell(ctx,x,y-s*.025,s*.39,s*.32);ctx.fill();
  for(let i=0;i<12;i++){const a=hash(i,5)*TAU,r=s*.28*Math.sqrt(hash(i,6)),px=x+Math.cos(a)*r,py=y-s*.025+Math.sin(a)*r*.8;ctx.save();ctx.translate(px,py);ctx.rotate(a);ctx.fillStyle=i%3?'#efe1ae':'#6b903d';rr(ctx,-s*.04,-s*.03,s*.08,s*.06,s*.01);ctx.fill();ctx.fillStyle='rgba(255,248,201,.4)';ctx.fillRect(-s*.04,-s*.03,s*.08,s*.014);ctx.restore();}
  ctx.strokeStyle='#faf6dc';ctx.lineWidth=s*.026;ctx.beginPath();ctx.ellipse(x,y-s*.055,s*.47,s*.4,0,Math.PI*1.03,Math.PI*1.83);ctx.stroke();
  ctx.strokeStyle='#637574';ctx.lineWidth=s*.055;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x+s*.12,y+s*.08);ctx.lineTo(x+s*.62,y-s*.3);ctx.stroke();ctx.strokeStyle='#ccd3bf';ctx.lineWidth=s*.02;ctx.beginPath();ctx.moveTo(x+s*.12,y+s*.06);ctx.lineTo(x+s*.61,y-s*.32);ctx.stroke();
}

function steam(ctx,x,y,s,t){
  ctx.save();ctx.lineCap='round';
  for(let i=0;i<3;i++){const k=(t*.5+i/3)%1,a=Math.sin(k*Math.PI)*.45;ctx.strokeStyle=`rgba(255,255,255,${a})`;ctx.lineWidth=s*(.05+.05*k);
    ctx.beginPath();const bx=x+(i-1)*s*.18;for(let j=0;j<=8;j++){const py=y-s*.05-k*s*.5-j*s*.06,px=bx+Math.sin(j*.9+t*3+i)*s*.06;j?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.stroke();}
  ctx.restore();
}
function riceCooker(ctx,x,y,s){
  volume(ctx,x-s*.43,y-s*.4,s*.86,s*.85,s,'#d9dfd1',s*.13,s*.27);
  const lid=ctx.createLinearGradient(x-s*.3,y-s*.3,x+s*.3,y+s*.3);lid.addColorStop(0,'#fffbe6');lid.addColorStop(1,'#b1bbae');ctx.fillStyle=lid;ell(ctx,x-s*.02,y-s*.07,s*.34,s*.31);ctx.fill();
  ctx.strokeStyle='#8c9c92';ctx.lineWidth=s*.014;ell(ctx,x-s*.02,y-s*.07,s*.34,s*.31);ctx.stroke();
  ctx.fillStyle='#3a4945';rr(ctx,x-s*.14,y+s*.24,s*.28,s*.09,s*.025);ctx.fill();ctx.fillStyle='#92d09a';ctx.fillRect(x-s*.1,y+s*.265,s*.06,s*.03);
  volume(ctx,x-s*.1,y-s*.17,s*.16,s*.1,s,'#7e8c83',s*.03,s*.025);
  ctx.fillStyle='#4d615e';for(let i=0;i<3;i++){ell(ctx,x+s*.16+i*s*.04,y-s*.19,s*.009,s*.015);ctx.fill();}
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
// o.t seconds (rigid tail sway), o.tail 'ring' (default)|'curl', o.kind 'orange'|'calico',
// o.puff for a hissing cat (ears flat, narrowed eyes, open mouth), o.carry shows the shrimp
function cat(ctx,x,y,s,ang,o){
  const calico=o.kind==='calico',P=calico?CALICO:ORANGE;
  const walking=o.walk>=0,ph=walking?o.walk*TAU:0;
  const bob=walking?Math.abs(Math.sin(ph))*s*.02:0,puff=o.puff?1.12:1;
  const stride=walking?Math.sin(ph)*s*.065:0;
  const shoulder=.008+(walking?Math.sin(ph)*.014:0);
  const hip=-.008-(walking?Math.sin(ph)*.012:0);
  const white='#fff5e5',small=s<=48;
  ctx.save();ctx.translate(x,y);
  if(!o.hitMask){
    // A fading contact shadow stays tucked under the torso, without an outlined second silhouette.
    ctx.save();ctx.translate(s*.025,s*.035);ctx.rotate(ang);ctx.scale(1,.48);
    const contact=ctx.createRadialGradient(-s*.04,0,s*.06,-s*.04,0,s*.47);
    contact.addColorStop(0,'rgba(30,12,2,.18)');
    contact.addColorStop(.65,'rgba(30,12,2,.09)');
    contact.addColorStop(1,'rgba(30,12,2,0)');
    ctx.fillStyle=contact;ell(ctx,-s*.04,0,s*.47,s*.47);ctx.fill();ctx.restore();
  }
  ctx.rotate(ang);ctx.translate(bob,0);
  ctx.lineJoin='round';ctx.lineCap='round';

  // Both the tapered contour and transverse rings follow this sampled centreline.
  // Rotate the whole tail at its root so its circle or spiral keeps its shape during a stride.
  const root=[-.30,.08],curves=o.tail==='curl'?[
    [-.47,.07,-.52,.20,-.65,.18],
    [-.84,.16,-.90,-.08,-.75,-.17],
    [-.60,-.24,-.54,-.02,-.68,0],
    [-.75,.01,-.76,-.07,-.70,-.09]
  ]:[
    [-.52,.08,-.68,.27,-.56,.45],
    [-.42,.64,-.12,.50,-.18,.31],
    [-.22,.19,-.40,.19,-.43,.32]
  ];
  const compact=o.tail!=='curl';
  const centres=[root];
  let start=root;
  for(const [ax,ay,bx,by,cx,cy] of curves){
    for(let i=1;i<=12;i++){
      const t=i/12,u=1-t;
      const x=u*u*u*start[0]+3*u*u*t*ax+3*u*t*t*bx+t*t*t*cx;
      const y=u*u*u*start[1]+3*u*u*t*ay+3*u*t*t*by+t*t*t*cy;
      centres.push(compact?[root[0]+(x-root[0])*.85,root[1]+(y-root[1])*.85]:[x,y]);
    }
    start=[cx,cy];
  }
  const edges=centres.map(([x,y],i)=>{
    const prev=centres[Math.max(0,i-1)],next=centres[Math.min(centres.length-1,i+1)];
    const dx=next[0]-prev[0],dy=next[1]-prev[1],length=Math.hypot(dx,dy);
    const radius=.075-.055*i/(centres.length-1),nx=-dy/length*radius,ny=dx/length*radius;
    return [[x+nx,y+ny],[x-nx,y-ny]];
  });
  const tail=()=>{
    ctx.beginPath();ctx.moveTo(s*edges[0][0][0],s*edges[0][0][1]);
    for(const edge of edges.slice(1))ctx.lineTo(s*edge[0][0],s*edge[0][1]);
    const end=centres.at(-1),prev=centres.at(-2),length=Math.hypot(end[0]-prev[0],end[1]-prev[1]);
    ctx.quadraticCurveTo(s*(end[0]+(end[0]-prev[0])/length*.03),s*(end[1]+(end[1]-prev[1])/length*.03),
      s*edges.at(-1)[1][0],s*edges.at(-1)[1][1]);
    for(const edge of edges.slice(0,-1).reverse())ctx.lineTo(s*edge[1][0],s*edge[1][1]);
    ctx.closePath();
  };
  const band=(from,to)=>{
    ctx.beginPath();ctx.moveTo(s*edges[from][0][0],s*edges[from][0][1]);
    for(let i=from+1;i<=to;i++)ctx.lineTo(s*edges[i][0][0],s*edges[i][0][1]);
    for(let i=to;i>=from;i--)ctx.lineTo(s*edges[i][1][0],s*edges[i][1][1]);
    ctx.closePath();ctx.fill();
  };
  const sway=Math.sin((o.t||0)*(walking?6:2)+(o.seed||0))*(o.puff?.025:walking?.055:.075);
  ctx.save();ctx.translate(s*root[0],s*root[1]);ctx.rotate(sway);ctx.translate(-s*root[0],-s*root[1]);
  tail();ctx.fillStyle=P.body;ctx.fill();
  // Keep the first stroke on the visible centreline for the input regression sampler.
  ctx.beginPath();ctx.moveTo(s*centres[0][0],s*centres[0][1]);
  for(const [tx,ty] of centres.slice(1))ctx.lineTo(s*tx,s*ty);
  ctx.strokeStyle=P.light;ctx.lineWidth=s*.018;ctx.stroke();
  ctx.save();tail();ctx.clip();ctx.fillStyle=calico?P.black:P.dark;
  for(const fraction of [.28,.46,.64,.79]){
    const i=Math.round((centres.length-1)*fraction);band(i,i+2);
  }
  ctx.fillStyle=white;band(centres.length-6,centres.length-1);
  ctx.restore();tail();ctx.strokeStyle=P.line;ctx.lineWidth=s*.016;ctx.stroke();ctx.restore();

  // Feet run fore/aft underneath the cat. The body occludes their roots, leaving rounded tips.
  for(const [px,sd,k] of [[.015,-1,1],[.015,1,-1],[-.275,-1,-1],[-.275,1,1]]){
    const front=px>0,lx=s*px*.8+stride*k,offset=front?shoulder:hip;
    ctx.fillStyle=calico&&px<0&&sd<0?P.orange:P.body;
    ell(ctx,lx,s*(sd*.225+offset*.3),s*.052,s*.036);ctx.fill();
    ctx.strokeStyle=P.line;ctx.lineWidth=s*.014;ctx.stroke();
    ctx.fillStyle=white;
    ell(ctx,lx+s*.012,s*(sd*(front?.254:.264)+offset*.3),s*.034,s*.024);ctx.fill();
  }

  // Retain the curved shoulder, waist and haunches, compressing only their fore/aft axis.
  ctx.save();ctx.scale(.8,1);
  const body=()=>{
    ctx.beginPath();ctx.moveTo(s*.245,s*(-.075+shoulder)*puff);
    ctx.bezierCurveTo(s*.17,s*(-.105+shoulder)*puff,s*.13,s*(-.19+shoulder)*puff,s*.035,s*(-.20+shoulder)*puff);
    ctx.bezierCurveTo(-s*.055,-s*.195*puff,-s*.10,-s*.195*puff,-s*.17,s*(-.215+hip)*puff);
    ctx.bezierCurveTo(-s*.30,s*(-.25+hip)*puff,-s*.47,s*(-.22+hip)*puff,-s*.475,s*hip);
    ctx.bezierCurveTo(-s*.48,s*(.18+hip)*puff,-s*.36,s*(.245+hip)*puff,-s*.24,s*(.23+hip)*puff);
    ctx.bezierCurveTo(-s*.14,s*.225*puff,-s*.11,s*.195*puff,-s*.035,s*.19*puff);
    ctx.bezierCurveTo(s*.085,s*(.20+shoulder)*puff,s*.14,s*(.15+shoulder)*puff,s*.205,s*(.085+shoulder)*puff);
    ctx.quadraticCurveTo(s*.27,s*shoulder,s*.245,s*(-.075+shoulder)*puff);ctx.closePath();
  };
  const g=ctx.createRadialGradient(-s*.11,-s*.055,s*.02,-s*.08,0,s*.39);
  g.addColorStop(0,P.light);g.addColorStop(.55,P.body);g.addColorStop(1,P.dark);
  body();ctx.fillStyle=g;ctx.fill();ctx.strokeStyle=P.line;ctx.lineWidth=s*.018;ctx.stroke();
  ctx.save();body();ctx.clip();
  if(calico){
    ctx.fillStyle=P.black;ell(ctx,-s*.28,-s*.14,s*.15,s*.115,.35);ctx.fill();
    ell(ctx,-s*.36,s*.11,s*.105,s*.085,-.4);ctx.fill();
    ctx.fillStyle=P.orange;ell(ctx,s*.02,s*.12,s*.14,s*.105,-.3);ctx.fill();
    ell(ctx,-s*.21,-s*.065,s*.08,s*.065,.3);ctx.fill();
  }else{
    // Stagger the flank bars and omit a heavy centre seam, which can read as a shell.
    const bars=small?[-.30,-.12,.055]:[-.33,-.20,-.075,.055];
    ctx.strokeStyle=P.dark;ctx.lineWidth=s*(small?.034:.027);
    for(const sd of [-1,1])for(const tx of bars){
      const shift=sd>0?.028:0;
      ctx.beginPath();ctx.moveTo(s*(tx+.035+shift),sd*s*.035);
      ctx.bezierCurveTo(s*(tx+.015+shift),sd*s*.085,s*(tx-.035+shift),sd*s*.14,s*(tx-.075+shift),sd*s*.18);ctx.stroke();
    }
  }
  ctx.restore();ctx.restore();

  // Broad cheeks and a lifted face make the head larger than the shortened torso.
  ctx.save();ctx.scale(1,puff);
  const head=()=>{
    ctx.beginPath();ctx.moveTo(s*.15,0);
    ctx.bezierCurveTo(s*.15,-s*.17,s*.21,-s*.28,s*.33,-s*.28);
    ctx.bezierCurveTo(s*.46,-s*.28,s*.55,-s*.18,s*.56,-s*.07);
    ctx.quadraticCurveTo(s*.59,0,s*.56,s*.07);
    ctx.bezierCurveTo(s*.55,s*.18,s*.46,s*.28,s*.33,s*.28);
    ctx.bezierCurveTo(s*.21,s*.28,s*.15,s*.17,s*.15,0);ctx.closePath();
  };
  const hg=ctx.createRadialGradient(s*.37,-s*.07,s*.01,s*.34,0,s*.31);
  hg.addColorStop(0,P.light);hg.addColorStop(1,P.body);
  head();ctx.fillStyle=hg;ctx.fill();ctx.strokeStyle=P.line;ctx.lineWidth=s*.018;ctx.stroke();
  ctx.save();head();ctx.clip();
  if(calico){
    ctx.fillStyle=P.black;ell(ctx,s*.25,-s*.18,s*.10,s*.12,.25);ctx.fill();
    ctx.fillStyle=P.orange;ell(ctx,s*.29,s*.16,s*.13,s*.13,-.3);ctx.fill();
  }else{
    // The M stays on the rear forehead, leaving the front half free for the lifted face.
    ctx.strokeStyle=P.dark;ctx.lineWidth=s*(small?.019:.014);
    ctx.beginPath();ctx.moveTo(s*.25,-s*.065);ctx.lineTo(s*.30,-s*.032);
    ctx.lineTo(s*.263,0);ctx.lineTo(s*.30,s*.032);ctx.lineTo(s*.25,s*.065);ctx.stroke();
  }
  ctx.restore();

  // Enlarge the established forward-leaning triangles, keeping their roots on the crown.
  for(const sd of [-1,1]){
    const earX=o.puff?.20:.385,earY=o.puff?.36:.355;
    ctx.beginPath();ctx.moveTo(s*.185,sd*s*.18);
    ctx.lineTo(s*earX,sd*s*earY);ctx.lineTo(s*.39,sd*s*.17);ctx.closePath();
    ctx.fillStyle=calico?(sd<0?P.black:P.orange):P.body;ctx.fill();
    ctx.strokeStyle=P.line;ctx.lineWidth=s*.017;
    ctx.beginPath();ctx.moveTo(s*.185,sd*s*.18);ctx.lineTo(s*earX,sd*s*earY);ctx.lineTo(s*.39,sd*s*.17);ctx.stroke();
    ctx.beginPath();ctx.moveTo(s*.225,sd*s*.205);
    ctx.lineTo(s*(o.puff?.215:.36),sd*s*(o.puff?.32:.323));ctx.lineTo(s*.365,sd*s*.20);ctx.closePath();
    ctx.fillStyle=P.ear;ctx.fill();
  }
  ctx.fillStyle=white;
  for(const sd of [-1,1]){ell(ctx,s*.515,sd*s*.04,s*.043,s*.055);ctx.fill();}
  for(const sd of [-1,1]){
    ctx.fillStyle='#2a1a10';ell(ctx,s*.438,sd*s*.125,s*.053,s*(o.puff?.028:.055),sd*.10);ctx.fill();
    ctx.fillStyle='#ffffff';ell(ctx,s*.449,sd*s*.125-s*.014,s*.016,s*(o.puff?.009:.017));ctx.fill();
    if(o.puff){
      ctx.strokeStyle=P.line;ctx.lineWidth=s*.018;ctx.beginPath();
      ctx.moveTo(s*.40,sd*s*.085);ctx.lineTo(s*.414,sd*s*.18);ctx.stroke();
    }
  }
  ctx.fillStyle='#de8581';ctx.beginPath();ctx.moveTo(s*.55,-s*.019);
  ctx.quadraticCurveTo(s*.588,0,s*.55,s*.019);ctx.closePath();ctx.fill();
  ctx.strokeStyle=P.line;ctx.lineWidth=s*.011;
  ctx.beginPath();ctx.moveTo(s*.568,0);ctx.lineTo(s*.584,0);
  for(const sd of [-1,1]){ctx.moveTo(s*.584,0);ctx.quadraticCurveTo(s*.596,sd*s*.03,s*.562,sd*s*.055);}
  ctx.stroke();
  if(o.puff){ctx.fillStyle='#8a1f1f';ell(ctx,s*.572,0,s*.022,s*.032);ctx.fill();}
  ctx.strokeStyle='rgba(255,255,255,.8)';ctx.lineWidth=Math.max(.6,s*.008);
  for(const sd of [-1,1])for(const k of [-.025,.025]){
    ctx.beginPath();ctx.moveTo(s*.512,sd*s*.085);
    ctx.lineTo(s*(.56+k),sd*s*.245);ctx.stroke();
  }
  ctx.restore();
  if(o.carry)shrimp(ctx,s*.65,0,s*.42,Math.PI*.5);
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
  g.addColorStop(0,'rgba(20,8,0,0)');g.addColorStop(1,'rgba(20,8,0,.16)');ctx.fillStyle=g;ctx.fillRect(x,y,w,h);
}

// ---------- room composition, per level. G = {ox, oy, s} in CSS px; L = the built level from core.js
function paintRoom(ctx,L,G,labels){
  const s=G.s,X=c=>G.ox+c*s,Y=r=>G.oy+r*s,W=L.cols*s,H=L.rows*s,id=L.def.id;
  const lab=(text,c,r,w,h,dy)=>{if(labels)label(ctx,text,X(c+w/2),Y(r+h)-s*(dy||.16),Math.max(8,s*.14),'rgba(255,248,232,.88)','rgba(40,22,10,.28)');};
  ctx.save();ctx.beginPath();ctx.rect(G.ox,G.oy,W,H);ctx.clip();
  if(id==='living'){
    woodFloor(ctx,X(0),Y(0),W,H,s,11,'#b47a42');
    warmPatch(ctx,X(0),Y(0),W,H,s);
    rug(ctx,X(1.3),Y(1.45),s*4.4,s*5.2,s,'#e8d7b4','#b8573e','#788048',7,true);
    roomEdge(ctx,X(0),Y(0),W,H,s);
    gridLines(ctx,G,L.cols,L.rows,L.walk);
    glow(ctx,X(.5),Y(6.45),s*1.8,'#ffcf7a',.22);
    tvCabinet(ctx,X(0),Y(1),s,s*6,s);
    lampAt(ctx,X(.5),Y(6.45),s);glow(ctx,X(.5),Y(6.45),s*.48,'#ffcf7a',.18);
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
    woodFloor(ctx,X(0),Y(0),W,H,s,23,'#ac7040');
    warmPatch(ctx,X(0),Y(0),W,H,s);
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
    lab('汤锅',1,1,2,1,.18);lab('饭锅',5,3,2,1,.18);lab('菜',2,4,2,1,.18);
    label(ctx,'窗台',X(6.5),Y(.86),Math.max(10,s*.16),'#ffe9c8','rgba(40,22,10,.6)');
  }
  ctx.restore();
}

root.SneakArt={hash,shade,alpha,label,glow,cat,kid,toy,owner,shrimp,steam,tankDynamic,doorLight,coffeeTableTop,vignette,paintRoom,plateAt};
})(typeof self!=='undefined'?self:this);
