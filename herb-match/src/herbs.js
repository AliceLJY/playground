// Flat herb characters for 药性配对, drawn with canvas paths. Mint, ginger and chrysanthemum are ported from the
// 2026-10-19 中药定义接龙 short (Remotion SVG); the rest follow the same rules: flat fills, one darker outline colour,
// a face from the same kit. Every drawing fits a circle of radius about 56 around its origin.
(function(root){
'use strict';
const C={ink:'#3B2A1E',blush:'#F28C8C',mouth:'#7A2E2E',sweat:'#6EC3F0'};
const P=d=>new Path2D(d);
const MINT={stem:P('M0 260 C 4 160, -4 60, 0 -20'),l1:P('M0 120 C -120 90, -170 -10, -150 -90 C -60 -80, -10 20, 0 120 Z'),l2:P('M0 120 C 120 90, 170 -10, 150 -90 C 60 -80, 10 20, 0 120 Z'),
  l3:P('M0 -10 C -90 -40, -110 -150, -60 -230 C 20 -190, 40 -90, 0 -10 Z'),l4:P('M0 -10 C 90 -40, 110 -150, 60 -230 C -20 -190, -40 -90, 0 -10 Z')};
const GINGER={body:P('M-190 40 C -230 -40, -150 -110, -90 -80 C -80 -160, 10 -190, 40 -120 C 90 -190, 200 -150, 180 -60 C 250 -30, 230 80, 150 90 C 120 150, 10 150, -20 100 C -80 140, -190 120, -190 40 Z'),
  lines:P('M-120 60 q20 -10 40 0 M60 40 q25 -8 45 4 M-20 -70 q15 -8 30 0')};

// face: mood 'smug' (arched eyes), 'calm' (dot eyes), 'happy' (^ ^), 'worry' (dots + sweat), 'oops' (x x)
function face(ctx,o){
  const s=o.s||1,col=o.color||C.ink;ctx.save();ctx.scale(s,s);ctx.lineCap='round';ctx.strokeStyle=col;ctx.fillStyle=col;ctx.lineWidth=7;
  const m=o.mood||'smug';
  if(m==='smug'){ctx.beginPath();ctx.moveTo(-34,-8);ctx.quadraticCurveTo(-24,-18,-14,-8);ctx.moveTo(14,-8);ctx.quadraticCurveTo(24,-18,34,-8);ctx.stroke();}
  else if(m==='happy'){ctx.beginPath();ctx.moveTo(-34,-4);ctx.lineTo(-24,-16);ctx.lineTo(-14,-4);ctx.moveTo(14,-4);ctx.lineTo(24,-16);ctx.lineTo(34,-4);ctx.stroke();}
  else if(m==='oops'){ctx.beginPath();for(const x of[-24,24]){ctx.moveTo(x-8,-16);ctx.lineTo(x+8,0);ctx.moveTo(x+8,-16);ctx.lineTo(x-8,0);}ctx.stroke();}
  else{ctx.beginPath();ctx.arc(-24,-8,8,0,6.283);ctx.arc(24,-8,8,0,6.283);ctx.fill();}
  if(o.blush!==false){ctx.globalAlpha=0.55;ctx.fillStyle=C.blush;ctx.beginPath();ctx.ellipse(-42,14,12,7,0,0,6.283);ctx.ellipse(42,14,12,7,0,0,6.283);ctx.fill();ctx.globalAlpha=1;}
  if(o.open||m==='oops'||m==='worry'){ctx.fillStyle=C.mouth;ctx.beginPath();ctx.ellipse(0,22,m==='worry'?8:12,m==='worry'?8:11,0,0,6.283);ctx.fill();}
  else{ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(-12,18);ctx.quadraticCurveTo(0,28,12,18);ctx.stroke();}
  if(m==='worry'){ctx.fillStyle=C.sweat;ctx.beginPath();ctx.moveTo(48,-40);ctx.quadraticCurveTo(36,-18,48,-10);ctx.quadraticCurveTo(60,-18,48,-40);ctx.fill();}
  ctx.restore();
}
function blob(ctx,pts,fill,stroke,w){ctx.beginPath();ctx.moveTo(pts[0],pts[1]);for(let i=2;i<pts.length;i+=6)ctx.bezierCurveTo(pts[i],pts[i+1],pts[i+2],pts[i+3],pts[i+4],pts[i+5]);ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=w||5;ctx.stroke();}}
function ellipse(ctx,x,y,rx,ry,rot,fill,stroke,w){ctx.beginPath();ctx.ellipse(x,y,rx,ry,rot||0,0,6.283);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=w||4;ctx.stroke();}}

// Each drawer: (ctx, t, f) where f = {mood, open}; t in seconds for idle motion.
const DRAW={
  huanglian(ctx,t,f){ // 黄连: the knobbly yellow "chicken-claw" rhizome
    ctx.lineJoin='round';
    for(const[a,l]of[[-0.9,52],[-0.3,60],[0.3,58],[0.85,50]]){ctx.save();ctx.rotate(a);ctx.fillStyle='#D6A93A';ctx.strokeStyle='#8E6B1C';ctx.lineWidth=5;
      ctx.beginPath();ctx.roundRect(-13,-l,26,l+8,13);ctx.fill();ctx.stroke();
      ctx.strokeStyle='rgba(142,107,28,0.6)';ctx.lineWidth=3;for(let y=-l+14;y<-6;y+=12){ctx.beginPath();ctx.moveTo(-10,y);ctx.lineTo(10,y+2);ctx.stroke();}ctx.restore();}
    blob(ctx,[-48,6,-50,-26,-20,-34,0,-30,22,-34,52,-24,48,8,46,40,-46,40,-48,6],'#E2B847','#8E6B1C',5);
    ctx.save();ctx.translate(0,10);face(ctx,{...f,s:0.62});ctx.restore();
  },
  jinyinhua(ctx,t,f){ // 金银花: a white flower and a yellow one on one stem
    ctx.lineCap='round';
    ellipse(ctx,-30,34,26,12,-0.5,'#6FB66B');ellipse(ctx,30,36,26,12,0.5,'#6FB66B');
    for(const[col,rot,dx]of[['#FFFDF4',-0.55,-6],['#F2C230',0.55,6]]){ctx.save();ctx.translate(dx,20);ctx.rotate(rot);
      ctx.fillStyle=col;ctx.strokeStyle='#C8A64A';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-9,0);ctx.lineTo(-7,-52);ctx.quadraticCurveTo(-22,-64,-16,-74);ctx.quadraticCurveTo(0,-62,4,-58);ctx.quadraticCurveTo(18,-70,24,-60);ctx.quadraticCurveTo(14,-54,8,-50);ctx.lineTo(9,0);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.strokeStyle='#8E6B1C';ctx.lineWidth=2.5;for(const sx of[-3,2,7]){ctx.beginPath();ctx.moveTo(sx*0.4,-56);ctx.lineTo(sx,-86);ctx.stroke();ellipse(ctx,sx,-88,2.6,3.6,0,'#8E6B1C');}ctx.restore();}
    ellipse(ctx,0,14,30,26,0,'#FFF6D8','#C8A64A',4);
    ctx.save();ctx.translate(0,12);face(ctx,{...f,s:0.5});ctx.restore();
  },
  juhua(ctx,t,f){ // 菊花: white petals round a yellow face, as in the short
    ctx.save();ctx.scale(0.5,0.5);ctx.rotate(t*0.4);
    for(let a=0;a<36;a++){ctx.save();ctx.rotate(a*Math.PI/18);ellipse(ctx,0,-78,11,46,0,'#FFFDF4','#E2D6B0',3);ctx.restore();}
    ctx.restore();ctx.save();ctx.scale(0.5,0.5);ellipse(ctx,0,0,58,58,0,'#F2C230');face(ctx,{...f,s:0.95,blush:false,mood:f.mood==='smug'?'calm':f.mood});ctx.restore();
  },
  shigao(ctx,t,f){ // 石膏: a white crystal lump
    ctx.lineJoin='round';const pts=[-46,-20,-24,-50,18,-54,50,-22,46,30,10,52,-38,40];
    ctx.beginPath();ctx.moveTo(pts[0],pts[1]);for(let i=2;i<pts.length;i+=2)ctx.lineTo(pts[i],pts[i+1]);ctx.closePath();ctx.fillStyle='#F6F4EE';ctx.fill();ctx.strokeStyle='#9A9488';ctx.lineWidth=5;ctx.stroke();
    ctx.fillStyle='#E1DCD0';ctx.beginPath();ctx.moveTo(18,-54);ctx.lineTo(50,-22);ctx.lineTo(46,30);ctx.lineTo(26,6);ctx.closePath();ctx.fill();
    ctx.strokeStyle='rgba(154,148,136,0.55)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-24,-50);ctx.lineTo(-14,-22);ctx.lineTo(26,6);ctx.moveTo(-14,-22);ctx.lineTo(-38,40);ctx.stroke();
    ctx.save();ctx.translate(-4,8);face(ctx,{...f,s:0.6});ctx.restore();
  },
  bohe(ctx,t,f){ // 薄荷: the mint from the short
    ctx.save();ctx.scale(0.21,0.21);ctx.translate(0,20);ctx.rotate(Math.sin(t*1.7)*0.07);
    ctx.strokeStyle='#2F7A45';ctx.lineWidth=14;ctx.lineCap='round';ctx.stroke(MINT.stem);
    ctx.fillStyle='#4FAE6A';ctx.fill(MINT.l1);ctx.fill(MINT.l2);ctx.fillStyle='#62C27C';ctx.fill(MINT.l3);ctx.fill(MINT.l4);
    ctx.translate(0,-60);face(ctx,{...f,s:1.1});ctx.restore();
  },
  gegen(ctx,t,f){ // 葛根: a thick fibrous slice of root
    ctx.lineJoin='round';ctx.fillStyle='#C99A62';ctx.strokeStyle='#8F6232';ctx.lineWidth=5;
    ctx.beginPath();ctx.roundRect(-50,-34,100,78,18);ctx.fill();ctx.stroke();
    ctx.fillStyle='#EBD3A8';ctx.beginPath();ctx.roundRect(-44,-44,88,70,16);ctx.fill();ctx.stroke();
    ctx.strokeStyle='rgba(169,118,58,0.45)';ctx.lineWidth=3;for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(0,-9,34-i*11,26-i*8,0,0,6.283);ctx.stroke();}
    ctx.save();ctx.translate(0,-8);face(ctx,{...f,s:0.55});ctx.restore();
  },
  luohanguo(ctx,t,f){ // 罗汉果: a round brown fruit with fine stripes
    ellipse(ctx,0,4,50,48,0,'#8E5A2E','#5E3A1C',5);
    ctx.strokeStyle='rgba(94,58,28,0.55)';ctx.lineWidth=3;for(const k of[-0.6,-0.2,0.2,0.6]){ctx.beginPath();ctx.ellipse(0,4,50*Math.abs(k)+4,48,0,-1.4,1.4);ctx.stroke();}
    ellipse(ctx,-18,-18,14,8,-0.6,'rgba(255,240,210,0.35)');
    ctx.strokeStyle='#5E3A1C';ctx.lineWidth=6;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(0,-44);ctx.quadraticCurveTo(4,-58,14,-60);ctx.stroke();
    ctx.save();ctx.translate(0,8);face(ctx,{...f,s:0.6,color:'#FFF3DC'});ctx.restore();
  },
  dongguapi(ctx,t,f){ // 冬瓜皮: a curved strip of green wax-gourd rind, pale flesh side up
    ctx.lineJoin='round';
    blob(ctx,[-56,-6,-40,-40,40,-40,56,-6,52,22,30,44,0,44,-30,44,-52,22,-56,-6],'#4E8B4A','#2F5E2C',5);
    blob(ctx,[-44,-2,-30,-28,30,-28,44,-2,40,16,24,30,0,30,-24,30,-40,16,-44,-2],'#E9F0D8');
    ctx.fillStyle='rgba(255,255,255,0.75)';for(const[x,y]of[[-46,8],[-24,36],[18,38],[46,10],[0,-34]]){ctx.beginPath();ctx.ellipse(x,y,4,2.5,0.3,0,6.283);ctx.fill();}
    ctx.save();ctx.translate(0,4);face(ctx,{...f,s:0.52});ctx.restore();
  },
  shengjiang(ctx,t,f){ // 生姜: the ginger from the short
    ctx.save();ctx.scale(0.25,0.25);ctx.translate(0,10+Math.sin(t*2.1)*5);
    ctx.fillStyle='#D9A75B';ctx.fill(GINGER.body);ctx.strokeStyle='#A9763A';ctx.lineWidth=8;ctx.stroke(GINGER.body);
    ctx.lineWidth=6;ctx.lineCap='round';ctx.stroke(GINGER.lines);ctx.translate(10,-10);face(ctx,{...f,s:1.1});ctx.restore();
  },
  chenpi(ctx,t,f){ // 陈皮: a curled piece of dried orange peel
    ctx.lineJoin='round';
    blob(ctx,[-54,10,-54,-30,-20,-50,10,-46,40,-42,58,-14,52,14,46,40,14,52,-14,48,-40,44,-54,30,-54,10],'#D9741F','#9C4D10',5);
    blob(ctx,[-36,6,-34,-18,-12,-30,8,-28,30,-24,40,-6,36,12,30,30,8,36,-12,34,-30,30,-38,20,-36,6],'#F3C27C');
    ctx.fillStyle='rgba(156,77,16,0.35)';for(const[x,y]of[[-46,-14],[-30,-40],[44,-30],[48,24],[-40,36],[20,46]]){ctx.beginPath();ctx.arc(x,y,3,0,6.283);ctx.fill();}
    ctx.save();ctx.translate(0,2);face(ctx,{...f,s:0.55});ctx.restore();
  },
  dazao(ctx,t,f){ // 大枣: a red date
    ellipse(ctx,0,4,44,54,0.12,'#B42A2A','#7A1616',5);
    ctx.strokeStyle='rgba(122,22,22,0.55)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-30,-26);ctx.quadraticCurveTo(-22,-8,-32,12);ctx.moveTo(30,30);ctx.quadraticCurveTo(22,40,28,52);ctx.stroke();
    ellipse(ctx,-14,-28,12,7,-0.7,'rgba(255,220,200,0.45)');
    ctx.strokeStyle='#6B4A26';ctx.lineWidth=6;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(6,-48);ctx.lineTo(12,-62);ctx.stroke();
    ctx.save();ctx.translate(0,8);face(ctx,{...f,s:0.6,color:'#FFF3DC'});ctx.restore();
  },
  aiye(ctx,t,f){ // 艾叶: grey-green serrated leaves, silvery underside
    ctx.save();ctx.rotate(Math.sin(t*1.4)*0.05);
    const leaf=(rot,len,col)=>{ctx.save();ctx.rotate(rot);ctx.beginPath();ctx.moveTo(0,0);
      for(let i=0;i<=6;i++){const y=-len*i/6,w=Math.sin(Math.PI*i/6)*len*0.32;ctx.lineTo(-w-(i%2?6:0),y);}
      for(let i=6;i>=0;i--){const y=-len*i/6,w=Math.sin(Math.PI*i/6)*len*0.32;ctx.lineTo(w+(i%2?6:0),y);}
      ctx.closePath();ctx.fillStyle=col;ctx.fill();ctx.strokeStyle='#5E7A58';ctx.lineWidth=3;ctx.stroke();ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-len*0.9);ctx.stroke();ctx.restore();};
    ctx.translate(0,48);leaf(-0.75,74,'#C9D3C2');leaf(0.75,74,'#C9D3C2');leaf(0,104,'#8FA98A');
    ctx.translate(0,-50);face(ctx,{...f,s:0.5});ctx.restore();
  },
  fuzi(ctx,t,f){ // 附子: a dark lateral root tuber with small side roots
    ellipse(ctx,-40,26,12,10,0.5,'#5A3820','#3A2412',4);ellipse(ctx,40,24,12,10,-0.5,'#5A3820','#3A2412',4);
    blob(ctx,[0,-56,26,-56,46,-20,46,8,46,40,24,52,0,52,-24,52,-46,40,-46,8,-46,-20,-26,-56,0,-56],'#6E4528','#3A2412',5);
    ctx.strokeStyle='rgba(58,36,18,0.6)';ctx.lineWidth=3;for(const y of[-30,30]){ctx.beginPath();ctx.moveTo(-22,y);ctx.quadraticCurveTo(0,y+6,22,y);ctx.stroke();}
    ctx.save();ctx.translate(0,2);face(ctx,{...f,s:0.6,color:'#FFF3DC'});ctx.restore();
  },
  rougui(ctx,t,f){ // 肉桂: rolled bark quills
    for(const[dx,dy,rot]of[[-16,-20,-0.25],[16,-14,0.2]]){ctx.save();ctx.translate(dx,dy);ctx.rotate(rot);ctx.fillStyle='#8A4B2A';ctx.strokeStyle='#5A2E16';ctx.lineWidth=4;
      ctx.beginPath();ctx.roundRect(-14,-44,28,88,10);ctx.fill();ctx.stroke();ellipse(ctx,0,-44,14,6,0,'#B06B3E','#5A2E16',3);ctx.restore();}
    ctx.fillStyle='#9C5A33';ctx.strokeStyle='#5A2E16';ctx.lineWidth=5;ctx.beginPath();ctx.roundRect(-46,-6,92,50,20);ctx.fill();ctx.stroke();
    ellipse(ctx,-46,19,9,25,0,'#C47E4E','#5A2E16',4);ctx.strokeStyle='#5A2E16';ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(-46,19,7,0.5,5.5);ctx.stroke();
    ctx.save();ctx.translate(4,18);face(ctx,{...f,s:0.48,color:'#FFF3DC'});ctx.restore();
  },
  ganjiang(ctx,t,f){ // 干姜: pale dried ginger slices
    ellipse(ctx,-14,-18,40,30,-0.3,'#E7CD8C','#A88A44',5);
    ctx.save();ctx.translate(8,10);ellipse(ctx,0,0,48,38,0.15,'#F0DCA4','#A88A44',5);
    ctx.strokeStyle='rgba(168,138,68,0.5)';ctx.lineWidth=2.5;for(const k of[0.4,0.7]){ctx.beginPath();ctx.ellipse(0,0,48*k,38*k,0.15,0,6.283);ctx.stroke();}
    face(ctx,{...f,s:0.55});ctx.restore();
  },
  hujiao(ctx,t,f){ // 胡椒: a heap of peppercorns
    for(const[x,y,r]of[[-38,28,16],[38,30,16],[-22,40,14],[24,42,14],[0,46,13],[-44,0,14],[44,2,14]]){ellipse(ctx,x,y,r,r,0,'#2E2A26','#15120F',3);ellipse(ctx,x-r*0.35,y-r*0.35,r*0.3,r*0.22,-0.6,'rgba(255,255,255,0.25)');}
    ellipse(ctx,0,-4,42,42,0,'#3A332D','#15120F',4);
    ctx.strokeStyle='rgba(255,255,255,0.12)';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,-4,30,3.6,5.4);ctx.stroke();
    ctx.save();ctx.translate(0,-2);face(ctx,{...f,s:0.52,color:'#FFF3DC'});ctx.restore();
  }
};
function drawHerb(ctx,id,t,f){const d=DRAW[id];if(d)d(ctx,t,f||{});}
root.HerbArt={drawHerb,face,DRAW};
})(typeof self!=='undefined'?self:this);
