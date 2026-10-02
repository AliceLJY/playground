/* Three.js layer: the lit cloth, the theatre around it, shadow puppets drawn on canvases, sparks and glints.
   Every effect is computed in world space or in a mesh's own UVs; nothing samples screen-space resolution,
   so the default render scale and pixel ratio cannot shift an effect away from where it belongs. */
(function(root){
'use strict';
const THREE=root.THREE,G=root.GongStage,R=root.GongRig;
const PAL=G.palette,K=220;                       // canvas pixels per world unit for puppet parts
const col=h=>new THREE.Color(h);

// ---- canvas drawing in a part's own frame (joint at the origin, y up, world units) ---------------
function partCanvas(w,h,ax,ay,k=K){
  const c=document.createElement('canvas');c.width=Math.max(4,Math.round(w*k));c.height=Math.max(4,Math.round(h*k));
  const g=c.getContext('2d');g.setTransform(c.width/w,0,0,-c.height/h,ax*c.width,(1-ay)*c.height);
  g.lineJoin='round';g.lineCap='round';return{c,g};
}
let seed=1;const rnd=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
function path(points,close=true){const p=new Path2D();points.forEach(([x,y],i)=>i?p.lineTo(x,y):p.moveTo(x,y));if(close)p.closePath();return p;}
function smooth(points){ // closed Catmull-Rom through the points, for soft leather outlines
  const p=new Path2D(),n=points.length;
  p.moveTo(points[0][0],points[0][1]);
  for(let i=0;i<n;i++){const p0=points[(i-1+n)%n],p1=points[i],p2=points[(i+1)%n],p3=points[(i+2)%n];
    p.bezierCurveTo(p1[0]+(p2[0]-p0[0])/6,p1[1]+(p2[1]-p0[1])/6,p2[0]-(p3[0]-p1[0])/6,p2[1]-(p3[1]-p1[1])/6,p2[0],p2[1]);}
  p.closePath();return p;
}
function leather(g,shape,fill,{ink=PAL.ink,line=.035,grain=.5}={}){
  g.save();g.fillStyle=fill;g.fill(shape);g.clip(shape);
  const b=40*grain;for(let i=0;i<b;i++){g.fillStyle=rnd()<.5?'rgba(255,236,200,.07)':'rgba(30,12,4,.08)';g.beginPath();g.ellipse((rnd()-.5)*2,(rnd()-.5)*3,.02+rnd()*.05,.008+rnd()*.02,rnd()*3,0,7);g.fill();}
  g.restore();
  if(line){g.lineWidth=line;g.strokeStyle=ink;g.stroke(shape);}
}
function cut(g,fn){g.save();g.globalCompositeOperation='destination-out';g.fillStyle='#000';g.strokeStyle='#000';fn();g.restore();}
function holes(g,list){for(const [x,y,rx,ry,rot=0,kind='oval'] of list){g.beginPath();if(kind==='diamond'){g.moveTo(x,y+ry);g.lineTo(x+rx,y);g.lineTo(x,y-ry);g.lineTo(x-rx,y);g.closePath();}else g.ellipse(x,y,rx,ry,rot,0,7);g.fill();}}
function grid(x0,y0,x1,y1,dx,dy,fn){for(let y=y0;y<=y1+1e-9;y+=dy)for(let x=x0;x<=x1+1e-9;x+=dx)fn(x,y,Math.round((y-y0)/dy));}
function strokeIn(g,shape,color,width){g.save();g.clip(shape);g.lineWidth=width;g.strokeStyle=color;g.stroke(shape);g.restore();}

// ---- the puppets' art: one function per part, all facing +x ---------------------------------
const ART={
  'player.head'(g){
    const s=smooth([[-.1,.03],[-.22,.18],[-.24,.32],[-.16,.5],[0,.56],[.14,.52],[.22,.42],[.33,.28],[.27,.24],[.29,.2],[.25,.17],[.27,.14],[.21,.07],[.1,.02],[.06,-.04],[-.08,-.04]]);
    leather(g,s,PAL.skin,{grain:.3});
    cut(g,()=>{g.fill(smooth([[.04,.12],[.17,.1],[.23,.2],[.21,.33],[.15,.42],[.06,.44],[.02,.3]]));});  // hollow face, the cloth shows through
    g.lineWidth=.022;g.strokeStyle=PAL.ink;
    g.beginPath();g.moveTo(.1,.36);g.quadraticCurveTo(.17,.39,.22,.35);g.stroke();               // eye
    g.beginPath();g.moveTo(.08,.42);g.quadraticCurveTo(.16,.46,.23,.42);g.stroke();              // brow
    g.beginPath();g.moveTo(.2,.16);g.lineTo(.25,.17);g.stroke();                                 // mouth
    g.fillStyle=PAL.ink;g.beginPath();g.ellipse(.17,.365,.018,.014,0,0,7);g.fill();
    const hair=smooth([[-.1,.04],[-.23,.2],[-.24,.36],[-.14,.52],[.02,.57],[.14,.52],[.04,.47],[-.06,.36],[-.04,.2],[-.02,.08]]);
    leather(g,hair,PAL.ink,{line:0,grain:.2});
    g.beginPath();g.ellipse(-.07,.62,.1,.085,0,0,7);g.fillStyle=PAL.ink;g.fill();                // bun
    const ribbon=path([[-.12,.6],[-.3,.66],[-.36,.56],[-.24,.58],[-.31,.5],[-.14,.56]]);leather(g,ribbon,PAL.robe,{line:.018});
    g.lineWidth=.02;g.strokeStyle=PAL.ink;g.beginPath();g.arc(-.02,.27,.05,-1.2,1.6);g.stroke();  // ear
  },
  'player.torso'(g){
    const s=smooth([[-.22,.02],[.22,.02],[.27,.3],[.25,.55],[.19,.74],[.07,.8],[-.07,.8],[-.21,.73],[-.27,.42]]);
    leather(g,s,PAL.robe);
    cut(g,()=>{grid(-.02,.16,.06,.64,.08,.08,(x,y,r)=>holes(g,[[x+(r%2)*.04-.02,y,.026,.032,0,'diamond']]));holes(g,[[-.15,.5,.035,.035],[-.15,.36,.03,.03],[.16,.4,.03,.03]]);});
    g.save();g.clip(s);g.fillStyle=PAL.gong;g.fill(path([[-.08,.81],[.09,.81],[.04,.66],[-.03,.66]]));g.fillStyle=PAL.jade;g.fillRect(-.3,.0,.6,.1);g.restore();
    g.lineWidth=.035;g.strokeStyle=PAL.ink;g.stroke(s);
  },
  'player.skirt'(g){
    const s=smooth([[-.22,.06],[.22,.06],[.3,-.2],[.42,-.5],[.1,-.52],[-.12,-.5],[-.42,-.48],[-.3,-.2]]);
    leather(g,s,PAL.robe);
    g.save();g.clip(s);g.fillStyle=PAL.jade;g.fillRect(-.5,-.56,1,.13);g.restore();
    cut(g,()=>{for(let i=0;i<7;i++){const x=-.33+i*.11;holes(g,[[x,-.34,.035,.05,0,'diamond'],[x+.055,-.2,.02,.02]]);}});
    g.lineWidth=.035;g.strokeStyle=PAL.ink;g.stroke(s);
  },
  'player.leg'(g){
    const s=smooth([[-.1,.03],[.1,.03],[.08,-.5],[.07,-.92],[.16,-.98],[.16,-1.08],[-.11,-1.08],[-.08,-.92],[-.09,-.5]]);
    leather(g,s,PAL.jade);
    g.save();g.clip(s);g.fillStyle=PAL.ink;g.fillRect(-.2,-1.12,.42,.18);g.restore();
    cut(g,()=>{for(let i=0;i<5;i++)holes(g,[[0,-.15-i*.15,.025,.04,0,'diamond']]);});
    g.lineWidth=.03;g.strokeStyle=PAL.ink;g.stroke(s);
  },
  'player.upper'(g){const s=smooth([[-.08,.03],[.08,.03],[.08,-.3],[.06,-.47],[-.06,-.47],[-.08,-.3]]);leather(g,s,PAL.robe);cut(g,()=>holes(g,[[0,-.12,.022,.022],[0,-.26,.022,.022],[0,-.4,.018,.018]]));g.lineWidth=.03;g.strokeStyle=PAL.ink;g.stroke(s);},
  'player.lower'(g){
    const s=smooth([[-.07,.03],[.07,.03],[.07,-.26],[.05,-.3],[-.05,-.3],[-.07,-.26]]);leather(g,s,PAL.robe);
    g.save();g.clip(s);g.fillStyle=PAL.gong;g.fillRect(-.1,-.31,.2,.06);g.restore();g.lineWidth=.03;g.strokeStyle=PAL.ink;g.stroke(s);
    const hand=smooth([[-.05,-.29],[.05,-.29],[.07,-.38],[.03,-.44],[-.04,-.43],[-.06,-.36]]);leather(g,hand,PAL.skin,{line:.025,grain:.2});
  },
  'player.stick'(g){
    const s=path([[-.025,.04],[.025,.04],[.022,-.62],[-.022,-.62]]);leather(g,s,'#6B3E22',{line:.022,grain:.2});
    const knob=new Path2D();knob.ellipse(0,-.69,.058,.07,0,0,7);leather(g,knob,PAL.robe,{line:.022});
  },
  'player.gong'(g){
    const c=-.414,disc=new Path2D();disc.arc(0,c,.4,0,7);
    g.save();g.clip(disc);const gr=g.createRadialGradient(-.08,c+.08,.02,0,c,.42);gr.addColorStop(0,'#F2CE77');gr.addColorStop(.7,PAL.gong);gr.addColorStop(1,'#8A5A1E');g.fillStyle=gr;g.fill(disc);g.restore();
    g.lineWidth=.016;g.strokeStyle='rgba(60,30,8,.55)';for(const r of [.32,.22,.11]){g.beginPath();g.arc(0,c,r,0,7);g.stroke();}
    cut(g,()=>{for(let i=0;i<14;i++){const a=i/14*Math.PI*2;holes(g,[[Math.cos(a)*.36,c+Math.sin(a)*.36,.016,.016]]);}});
    g.fillStyle='#F7DB93';g.beginPath();g.arc(0,c,.06,0,7);g.fill();
    g.lineWidth=.04;g.strokeStyle=PAL.ink;g.beginPath();g.arc(0,c,.4,0,7);g.stroke();
    g.lineWidth=.03;g.strokeStyle=PAL.robe;g.beginPath();g.moveTo(-.03,.03);g.lineTo(-.02,-.02);g.moveTo(.03,.03);g.lineTo(.02,-.02);g.stroke();
  },
  'moth.body'(g){
    const s=smooth([[-.36,0],[-.26,.05],[-.08,.08],[.08,.11],[.2,.1],[.3,.07],[.36,.02],[.36,-.03],[.28,-.08],[.12,-.1],[-.06,-.08],[-.26,-.05]]);
    leather(g,s,'#8B7356');
    g.save();g.clip(s);g.fillStyle='rgba(225,205,165,.5)';g.beginPath();g.ellipse(.12,.0,.1,.09,0,0,7);g.fill();
    g.strokeStyle='rgba(40,20,8,.65)';g.lineWidth=.022;for(let i=0;i<5;i++){g.beginPath();g.moveTo(-.3+i*.065,-.08);g.lineTo(-.28+i*.065,.08);g.stroke();}g.restore();
    g.lineWidth=.03;g.strokeStyle=PAL.ink;g.stroke(s);
    cut(g,()=>holes(g,[[.29,.02,.026,.026]]));
    g.lineWidth=.014;g.strokeStyle=PAL.ink;                                        // feathery antennae
    for(const d of [1,-1]){g.beginPath();g.moveTo(.33,.02*d);g.quadraticCurveTo(.42,.14*d,.36,.2*d);g.stroke();for(let i=1;i<6;i++){const u=i/6,x=.33+.09*u*(1-u)*4*.5+.03*u,y=(.02+.18*u)*d;g.beginPath();g.moveTo(x,y);g.lineTo(x-.035,y+.02*d);g.stroke();}}
  },
  'moth.wing'(g){                                                                   // upper pair; the lower pair is the same art mirrored
    const hind=smooth([[-.06,.02],[-.12,.36],[-.3,.46],[-.47,.36],[-.44,.16],[-.2,.04]]);
    leather(g,hind,'#5E4A37');
    g.save();g.clip(hind);g.strokeStyle='rgba(235,215,175,.45)';g.lineWidth=.03;g.stroke(smooth([[-.12,.34],[-.3,.43],[-.44,.34],[-.42,.17]]));g.restore();
    g.lineWidth=.026;g.strokeStyle=PAL.ink;g.stroke(hind);
    const fore=smooth([[.06,.02],[.2,.24],[.32,.5],[.36,.67],[.22,.66],[.02,.56],[-.1,.44],[-.06,.2]]);
    leather(g,fore,PAL.moth);
    g.save();g.clip(fore);g.strokeStyle='rgba(40,22,10,.5)';g.lineWidth=.014;for(const [x,y] of [[.3,.62],[.14,.62],[-.04,.5],[-.08,.3]]){g.beginPath();g.moveTo(.02,.04);g.quadraticCurveTo(x*.5,y*.5,x,y);g.stroke();}
    g.fillStyle='rgba(230,210,170,.4)';g.beginPath();g.ellipse(.1,.5,.16,.05,.6,0,7);g.fill();g.restore();
    cut(g,()=>{g.beginPath();g.arc(.14,.4,.075,0,7);g.arc(.14,.4,.04,0,7,true);g.fill();for(const [x,y] of [[.3,.6],[.2,.64],[-.02,.52],[-.3,.42],[-.42,.28]])holes(g,[[x,y,.016,.016]]);});
    g.fillStyle=PAL.ink;g.beginPath();g.arc(.14,.4,.038,0,7);g.fill();
    g.lineWidth=.028;g.strokeStyle=PAL.ink;g.stroke(fore);
  },
  'scissors.blade'(g){
    const s=path([[-.07,0],[.07,.03],[.055,.7],[.012,1.22],[-.03,.9],[-.07,.45]]);leather(g,s,PAL.steel,{grain:.25});
    g.lineWidth=.02;g.strokeStyle='#DCE3E8';g.beginPath();g.moveTo(.06,.08);g.lineTo(.05,.7);g.lineTo(.014,1.18);g.stroke();
    g.strokeStyle='rgba(40,50,60,.6)';g.lineWidth=.012;g.beginPath();g.moveTo(-.03,.1);g.lineTo(-.01,.85);g.stroke();
    g.lineWidth=.028;g.strokeStyle=PAL.ink;g.stroke(s);
  },
  'scissors.handle'(g){
    const shank=path([[-.05,.02],[.05,.02],[.06,-.52],[-.06,-.52]]);leather(g,shank,PAL.steel,{line:.025,grain:.2});
    const ring=new Path2D();ring.ellipse(0,-.76,.21,.24,0,0,7);leather(g,ring,PAL.handle,{line:.03});
    cut(g,()=>{g.beginPath();g.ellipse(0,-.76,.12,.15,0,0,7);g.fill();});
    g.lineWidth=.025;g.strokeStyle=PAL.ink;g.beginPath();g.ellipse(0,-.76,.12,.15,0,0,7);g.stroke();
  },
  'scissors.screw'(g){
    const s=new Path2D();s.arc(0,0,.16,0,7);leather(g,s,PAL.crown,{line:.03,grain:.2});
    cut(g,()=>holes(g,[[-.06,.03,.045,.05],[.06,.03,.045,.05]]));
    g.fillStyle=PAL.ink;g.beginPath();g.arc(-.05,.02,.022,0,7);g.arc(.07,.02,.022,0,7);g.fill();
    g.lineWidth=.02;g.beginPath();g.moveTo(-.05,-.07);g.quadraticCurveTo(0,-.1,.05,-.07);g.stroke();
  },
  'rat.body'(g){
    const s=smooth([[-.5,.0],[.42,.0],[.62,.5],[.6,1.05],[.45,1.5],[.25,1.82],[-.15,1.86],[-.48,1.6],[-.62,1.1],[-.66,.5]]);
    leather(g,s,PAL.fur);
    g.save();g.clip(s);g.fillStyle='#6E5D52';g.beginPath();g.ellipse(.32,.75,.26,.6,.1,0,7);g.fill();
    g.fillStyle=PAL.sash;g.fill(path([[-.7,1.45],[-.55,1.62],[.7,.55],[.62,.32]]));
    g.fillStyle=PAL.crown;for(let i=0;i<5;i++){g.beginPath();g.arc(-.45+i*.26,1.42-i*.2,.03,0,7);g.fill();}g.restore();
    cut(g,()=>{for(let i=0;i<26;i++){const x=-.5+rnd()*.9,y=.15+rnd()*1.55;g.beginPath();g.ellipse(x,y,.05,.012,.6+rnd()*.4,0,7);g.fill();}});
    g.lineWidth=.045;g.strokeStyle=PAL.ink;g.stroke(s);
  },
  'rat.head'(g){
    const s=smooth([[-.3,.0],[-.34,.28],[-.2,.5],[.05,.58],[.3,.48],[.55,.32],[.86,.2],[.9,.12],[.8,.06],[.5,.02],[.25,-.06],[.0,-.1]]);
    leather(g,s,PAL.fur);
    const ear=new Path2D();ear.arc(-.08,.62,.22,0,7);leather(g,ear,'#5A4A42',{line:.035});
    cut(g,()=>{g.beginPath();g.arc(-.07,.62,.12,0,7);g.fill();holes(g,[[.05,.2,.04,.012,.2],[.15,.12,.04,.012,.2],[-.12,.15,.05,.014,.4]]);});
    g.fillStyle='#C98C7A';g.globalAlpha=.55;g.beginPath();g.arc(-.07,.62,.12,0,7);g.fill();g.globalAlpha=1;
    g.fillStyle='#E14B32';g.beginPath();g.ellipse(.36,.34,.055,.045,0,0,7);g.fill();g.fillStyle='#FFE9C2';g.beginPath();g.arc(.375,.355,.015,0,7);g.fill();
    g.fillStyle=PAL.ink;g.beginPath();g.arc(.88,.14,.04,0,7);g.fill();
    g.fillStyle='#EFE0BC';g.fill(path([[.62,.04],[.7,.04],[.69,-.08],[.63,-.08]]));g.lineWidth=.015;g.strokeStyle=PAL.ink;g.stroke(path([[.62,.04],[.7,.04],[.69,-.08],[.63,-.08]]));
    g.lineWidth=.012;for(const [x,y] of [[1.1,.3],[1.12,.16],[1.05,.04]]){g.beginPath();g.moveTo(.82,.15);g.lineTo(x*.92,y);g.stroke();}
    const crown=path([[-.15,.5],[.22,.56],[.26,.82],[.15,.68],[.05,.86],[-.04,.66],[-.14,.8]]);leather(g,crown,PAL.crown,{line:.025,grain:.2});
    cut(g,()=>holes(g,[[.05,.62,.025,.025],[-.08,.6,.02,.02],[.17,.63,.02,.02]]));
    g.lineWidth=.04;g.strokeStyle=PAL.ink;g.stroke(s);
  },
  'rat.upper'(g){const s=smooth([[-.15,.05],[.15,.05],[.16,-.4],[.12,-.78],[-.12,-.78],[-.16,-.4]]);leather(g,s,PAL.fur);cut(g,()=>{for(let i=0;i<4;i++)holes(g,[[0,-.18-i*.16,.05,.012,.5]]);});g.lineWidth=.04;g.strokeStyle=PAL.ink;g.stroke(s);},
  'rat.lower'(g){
    const s=smooth([[-.13,.05],[.13,.05],[.13,-.5],[.1,-.66],[-.1,-.66],[-.13,-.5]]);leather(g,s,PAL.fur);g.lineWidth=.04;g.strokeStyle=PAL.ink;g.stroke(s);
    const claw=smooth([[-.11,-.62],[.11,-.62],[.15,-.72],[.08,-.8],[-.06,-.8],[-.13,-.72]]);leather(g,claw,'#8C6F66',{line:.03,grain:.2});
  },
  'rat.ladle'(g){
    const s=path([[-.035,.1],[.035,.1],[.03,-1.52],[-.03,-1.52]]);leather(g,s,'#6B3E22',{line:.024,grain:.2});
    const bowl=new Path2D();bowl.moveTo(-.25,-1.56);bowl.quadraticCurveTo(-.24,-1.86,0,-1.86);bowl.quadraticCurveTo(.24,-1.86,.25,-1.56);bowl.closePath();
    leather(g,bowl,PAL.gong,{line:.03,grain:.2});g.fillStyle='#E8A33A';g.beginPath();g.ellipse(0,-1.58,.22,.05,0,0,7);g.fill();
    g.fillStyle='#E8A33A';g.beginPath();g.ellipse(.12,-1.92,.025,.045,0,0,7);g.fill();
  },
  'rat.jar'(g){
    const s=smooth([[-.12,.04],[.12,.04],[.1,-.06],[.25,-.2],[.28,-.42],[.18,-.58],[-.18,-.58],[-.28,-.42],[-.25,-.2],[-.1,-.06]]);
    leather(g,s,'#7A3A26');g.save();g.clip(s);g.fillStyle=PAL.gong;g.fillRect(-.3,-.32,.6,.08);g.restore();
    cut(g,()=>{for(let i=0;i<5;i++)holes(g,[[-.18+i*.09,-.28,.02,.02]]);});g.lineWidth=.035;g.strokeStyle=PAL.ink;g.stroke(s);
    g.lineWidth=.025;g.strokeStyle='#C9A24A';g.beginPath();g.moveTo(-.1,.04);g.lineTo(-.06,.1);g.lineTo(.06,.1);g.lineTo(.1,.04);g.stroke();
  },
  'rat.thigh'(g){const s=smooth([[-.24,.08],[.2,.08],[.26,-.3],[.12,-.8],[-.12,-.8],[-.26,-.3]]);leather(g,s,PAL.fur);cut(g,()=>{for(let i=0;i<5;i++)holes(g,[[(rnd()-.5)*.25,-.15-i*.13,.05,.012,.5]]);});g.lineWidth=.04;g.strokeStyle=PAL.ink;g.stroke(s);},
  'rat.shin'(g){const s=smooth([[-.1,.05],[.1,.05],[.11,-.6],[.24,-.72],[.24,-.8],[-.14,-.8],[-.12,-.6]]);leather(g,s,PAL.fur);g.save();g.clip(s);g.fillStyle='#8C6F66';g.fillRect(-.3,-.84,.6,.18);g.restore();g.lineWidth=.035;g.strokeStyle=PAL.ink;g.stroke(s);},
  'rat.tail'(g,w,h){const s=smooth([[.02,h*.45],[-w*.5,h*.35],[-w*.96,h*.12],[-w*.96,-h*.12],[-w*.5,-h*.35],[.02,-h*.45]]);leather(g,s,'#8C6F66',{line:.022,grain:.2});}
};
const artKey={player:{head:'player.head',torso:'player.torso',skirt:'player.skirt',legB:'player.leg',legF:'player.leg',armBu:'player.upper',armFu:'player.upper',armBl:'player.lower',armFl:'player.lower',stick:'player.stick',gong:'player.gong'},
  moth:{body:'moth.body',wingF:'moth.wing',wingB:'moth.wing'},
  scissors:{bladeF:'scissors.blade',bladeB:'scissors.blade',handleF:'scissors.handle',handleB:'scissors.handle',screw:'scissors.screw'},
  rat:{body:'rat.body',head:'rat.head',armBu:'rat.upper',armFu:'rat.upper',armBl:'rat.lower',armFl:'rat.lower',ladle:'rat.ladle',jar:'rat.jar',thighB:'rat.thigh',thighF:'rat.thigh',shinB:'rat.shin',shinF:'rat.shin',tail1:'rat.tail',tail2:'rat.tail',tail3:'rat.tail'}};
const glowParts={player:['gong'],moth:['wingF','wingB'],scissors:['bladeF','bladeB'],rat:['ladle','jar']};

function createWorld(canvas){
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.localClippingEnabled=true;
  const scene=new THREE.Scene();scene.background=col(PAL.dark);
  const camera=new THREE.PerspectiveCamera(G.FOV,16/9,.1,200);
  const maxAniso=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  const texCache={},tex=(key,make)=>{if(texCache[key])return texCache[key];const c=make();const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=maxAniso;return texCache[key]=t;};
  const {left,right,bottom,top}=G.screen;
  const clip=[new THREE.Plane(new THREE.Vector3(1,0,0),-left),new THREE.Plane(new THREE.Vector3(-1,0,0),right),new THREE.Plane(new THREE.Vector3(0,1,0),-bottom),new THREE.Plane(new THREE.Vector3(0,-1,0),top)];

  // the cloth: lamp falloff evaluated per fragment from world position with the stage's own numbers
  const lin=h=>new THREE.Vector3(...G.hex(h).map(G.toLinear));
  const cloth=new THREE.Mesh(new THREE.PlaneGeometry(right-left,top-bottom),new THREE.ShaderMaterial({
    uniforms:{uCenter:{value:lin(PAL.screenCenter)},uEdge:{value:lin(PAL.screenEdge)},uHot:{value:new THREE.Vector2(G.hot.x,G.hot.y)},uR:{value:new THREE.Vector2(G.falloff.rx,G.falloff.ry)},
      uIn:{value:G.falloff.inner},uOut:{value:G.falloff.outer},uLamp:{value:1},uTime:{value:0}},
    vertexShader:'varying vec2 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xy;gl_Position=projectionMatrix*viewMatrix*w;}',
    fragmentShader:`uniform vec3 uCenter,uEdge;uniform vec2 uHot,uR;uniform float uIn,uOut,uLamp,uTime;varying vec2 vW;
      void main(){float d=min(1.,length((vW-uHot)/uR));float t=smoothstep(uIn,uOut,d);vec3 c=mix(uCenter,uEdge,t)*uLamp;
        float weave=.012*sin(vW.x*95.)*sin(vW.y*95.)+.01*sin(vW.y*7.+uTime*.6)*(1.-t);gl_FragColor=vec4(c*(1.+weave),1.);
        #include <colorspace_fragment>
      }`}));
  cloth.position.set((left+right)/2,(top+bottom)/2,0);scene.add(cloth);

  // carved ground strip (a scenery piece): a balustrade the puppets stand on
  const groundTex=tex('ground',()=>{const w=right-left,h=-bottom,{c,g}=partCanvas(w,h,0,1,96);
    const base=path([[0,0],[w,0],[w,-h],[0,-h]]);leather(g,base,'#22130C',{line:0,grain:2});
    cut(g,()=>{for(let x=.18;x<w;x+=.36)holes(g,[[x,-.36,.035,.17]]);for(let x=.9;x<w;x+=1.8)holes(g,[[x,-1.15,.14,.07,0,'diamond'],[x-.3,-1.15,.04,.04],[x+.3,-1.15,.04,.04]]);});
    g.fillStyle='#4A2C1C';g.fillRect(0,-.1,w,.1);g.fillRect(0,-.62,w,.06);
    return c;});
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(right-left,-bottom),new THREE.MeshBasicMaterial({map:groundTex,transparent:true,alphaTest:.05,color:0xffffff}));
  ground.position.set(0,bottom/2,.012);ground.renderOrder=1;scene.add(ground);
  const groundTint=.75;

  // the theatre: frame posts and beams in front of the cloth, curtains and empty chairs in the dark
  const frameTex=(w,h,vertical)=>tex('frame'+w+'x'+h,()=>{const {c,g}=partCanvas(w,h,0,0,64);
    g.fillStyle=PAL.wood;g.fillRect(0,0,w,h);g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=.02;
    for(let i=0;i<14;i++){g.beginPath();if(vertical){const x=rnd()*w;g.moveTo(x,0);g.bezierCurveTo(x+.1,h*.3,x-.1,h*.7,x,h);}else{const y=rnd()*h;g.moveTo(0,y);g.bezierCurveTo(w*.3,y+.1,w*.7,y-.1,w,y);}g.stroke();}
    g.fillStyle=PAL.woodRed;if(vertical)g.fillRect(w*.32,0,w*.36,h);else g.fillRect(0,h*.32,w,h*.36);
    g.fillStyle=PAL.woodGold;if(vertical){g.fillRect(w*.3,0,w*.04,h);g.fillRect(w*.66,0,w*.04,h);}else{g.fillRect(0,h*.3,w,h*.04);g.fillRect(0,h*.66,w,h*.04);}
    return c;});
  const frameMat=(w,h,v)=>new THREE.MeshBasicMaterial({map:frameTex(w,h,v),color:0x8a7a70});
  const N=G.need,post=N.right-right,beam=N.top-top,rail=bottom-N.bottom;
  for(const [w,h,x,y,v] of [[post,N.top-N.bottom,(N.left+left)/2,(N.top+N.bottom)/2,1],[post,N.top-N.bottom,(N.right+right)/2,(N.top+N.bottom)/2,1],[N.right-N.left,beam,0,(top+N.top)/2,0],[N.right-N.left,rail,0,(bottom+N.bottom)/2,0]]){
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,.5),frameMat(w,h,v));m.position.set(x,y,.26);scene.add(m);
  }
  const valanceTex=tex('valance',()=>{const w=N.right-N.left,h=.9,{c,g}=partCanvas(w,h,0,1,64);
    const sw=path([[0,0],[w,0],[w,-.5],...Array.from({length:12},(_,i)=>[w-(i+.5)*w/12,-.5-(i%2?0:.32)]),[0,-.5]]);leather(g,sw,'#7E2218',{line:0,grain:3});
    g.fillStyle=PAL.woodGold;g.fillRect(0,-.08,w,.05);g.fillRect(0,-.36,w,.035);for(let i=0;i<12;i++){g.beginPath();g.arc((i+.5)*w/12,-.68,.07,0,7);g.fill();}return c;});
  const valance=new THREE.Mesh(new THREE.PlaneGeometry(N.right-N.left,.9),new THREE.MeshBasicMaterial({map:valanceTex,transparent:true,alphaTest:.05,color:0xb09a8c}));
  valance.position.set(0,top-.45+.02,.52);scene.add(valance);
  const curtainTex=tex('curtain',()=>{const {c,g}=partCanvas(6,15,0,0,40);
    for(let x=0;x<6;x+=.5){const gr=g.createLinearGradient(x,0,x+.5,0);gr.addColorStop(0,'#1d0806');gr.addColorStop(.45,'#4a1510');gr.addColorStop(1,'#160604');g.fillStyle=gr;g.fillRect(x,0,.5,15);}
    const fade=g.createLinearGradient(0,0,0,15);fade.addColorStop(0,'rgba(10,4,3,.7)');fade.addColorStop(.5,'rgba(10,4,3,0)');fade.addColorStop(1,'rgba(10,4,3,.6)');g.fillStyle=fade;g.fillRect(0,0,6,15);return c;});
  for(const sx of [-1,1]){const cur=new THREE.Mesh(new THREE.PlaneGeometry(6,15),new THREE.MeshBasicMaterial({map:curtainTex,color:0x9a8a80}));cur.position.set(sx*(N.right+3.05),2.6,.2);if(sx<0)cur.scale.x=-1;scene.add(cur);}
  // the empty house: each row of seat backs is one quad, rim-lit by the cloth's glow
  G.chairs.forEach((row,ri)=>{
    const W=row.count*row.spacing+.6,H=row.h+.2;
    const rowTex=tex('row'+ri,()=>{const {c,g}=partCanvas(W,H,.5,0,64);
      for(let j=0;j<row.count;j++){const x=(j-(row.count-1)/2)*row.spacing,hw=row.w/2;
        const back=smooth([[x-hw,.02],[x+hw,.02],[x+hw+.03,row.h*.72],[x+hw*.8,row.h*.97],[x,row.h],[x-hw*.8,row.h*.97],[x-hw-.03,row.h*.72]]);
        leather(g,back,'#170D09',{line:0,grain:.4});g.save();g.clip(back);const gr=g.createLinearGradient(0,row.h,0,row.h*.78);gr.addColorStop(0,'rgba(244,180,104,.5)');gr.addColorStop(1,'rgba(244,180,104,0)');g.fillStyle=gr;g.fillRect(x-hw-.1,row.h*.7,row.w+.2,row.h*.35);
        g.strokeStyle='rgba(0,0,0,.45)';g.lineWidth=.025;g.beginPath();g.moveTo(x,row.h*.15);g.lineTo(x,row.h*.85);g.stroke();g.restore();
        g.fillStyle='#0F0806';g.fillRect(x+hw+.02,.02,row.spacing-row.w-.04,row.h*.42);}
      return c;});
    const m=new THREE.Mesh(new THREE.PlaneGeometry(W,H).translate(0,H/2,0),new THREE.MeshBasicMaterial({map:rowTex,transparent:true,alphaTest:.05}));
    m.position.set(0,row.y,row.z);scene.add(m);
  });

  // dust in front of the cloth, lit by the lamp glow
  const dustN=90,dustGeo=new THREE.BufferGeometry(),dustPos=new Float32Array(dustN*3),dustCol=new Float32Array(dustN*4),dust=[];
  for(let i=0;i<dustN;i++)dust.push({x:(rnd()-.5)*17,y:bottom+rnd()*(top-bottom),z:.6+rnd()*2.5,v:.05+rnd()*.12,p:rnd()*6});
  dustGeo.setAttribute('position',new THREE.BufferAttribute(dustPos,3));dustGeo.setAttribute('color',new THREE.BufferAttribute(dustCol,4));
  const dotTex=tex('dot',()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),gr=g.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.35,'rgba(255,255,255,.6)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);return c;});
  const dustPts=new THREE.Points(dustGeo,new THREE.PointsMaterial({size:.07,map:dotTex,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
  scene.add(dustPts);

  // ---- puppets ----------------------------------------------------------------------------
  const puppets=new Map(),actorLayer={player:.09,rat:.05,scissors:.06,moth:.07};
  function partTexture(kind,part){
    const key=artKey[kind][part.name];if(!key)return null;
    return tex(kind+':'+part.name,()=>{seed=7+part.name.length*13+kind.length;const [w,h]=part.size,{c,g}=partCanvas(w,h,part.anchor[0],part.anchor[1]);
      if(part.name==='bladeB')g.scale(-1,1);if(part.name==='wingB')g.scale(1,-1);ART[key](g,w,h);return c;});
  }
  function makePuppet(kind,id){
    const meshes=[],glows=[];
    for(const part of R.rigs[kind]){
      if(!part.art)continue;const t=partTexture(kind,part);if(!t)continue;
      const [w,h]=part.size,[ax,ay]=part.anchor,geo=new THREE.PlaneGeometry(w,h).translate((.5-ax)*w,(.5-ay)*h,0);
      const mat=new THREE.MeshBasicMaterial({map:t,transparent:true,alphaTest:.04,depthWrite:false,side:THREE.DoubleSide,clippingPlanes:clip});
      const m=new THREE.Mesh(geo,mat);m.matrixAutoUpdate=false;m.renderOrder=10+part.z;scene.add(m);meshes.push({m,part});
      if(glowParts[kind].includes(part.name)){
        const gm=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,clippingPlanes:clip,color:0}));
        gm.matrixAutoUpdate=false;gm.renderOrder=40;scene.add(gm);glows.push({m:gm,part,name:part.name});
      }
    }
    const rodGeo=new THREE.BufferGeometry();rodGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(18),3));
    const rods=new THREE.LineSegments(rodGeo,new THREE.LineBasicMaterial({color:col(PAL.ink),transparent:true,opacity:.45,clippingPlanes:clip}));rods.renderOrder=9;scene.add(rods);
    return{kind,id,meshes,glows,rods,glow:0,flash:0,tint:0};
  }
  function dropPuppet(p){for(const {m} of p.meshes.concat(p.glows)){scene.remove(m);m.geometry.dispose();m.material.dispose();}scene.remove(p.rods);p.rods.geometry.dispose();p.rods.material.dispose();}
  const rodPoints={player:['neck','handF','handB'],moth:['rod'],scissors:['rod'],rat:['neck','handF','handB']};
  function poseInto(pp,actor,t,lamp){
    const pose=R.pose(pp.kind,actor,t),solved=R.solve(pp.kind,pose),z=actorLayer[pp.kind]+(actor.id||0)*.0013;
    const depth=actor.depth||0,fade=1-.72*depth,dark=1-.55*depth;
    for(const {m,part} of pp.meshes){
      const a=solved[part.name].m;m.matrix.set(a[0],a[2],0,a[4],a[1],a[3],0,a[5],0,0,1,z+part.z*.002,0,0,0,1);m.matrixWorldNeedsUpdate=true;
      const k=lamp*dark*(1+pp.flash*.8);m.material.color.setRGB(k*(1+pp.tint*.6),k*(1-pp.tint*.35),k*(1-pp.tint*.4));m.material.opacity=fade;
    }
    for(const {m,part} of pp.glows){const a=solved[part.name].m;m.matrix.set(a[0],a[2],0,a[4],a[1],a[3],0,a[5],0,0,1,z+part.z*.002+.004,0,0,0,1);m.matrixWorldNeedsUpdate=true;}
    const pos=pp.rods.geometry.attributes.position;let i=0;
    for(const name of rodPoints[pp.kind]){const q=R.point(pp.kind,solved,name);pos.setXYZ(i++,q.x,q.y,z-.001);pos.setXYZ(i++,q.x+(name==='handB'?-.25:.2)*(actor.face||1),bottom-.6,z-.001);}
    while(i<6)pos.setXYZ(i++,0,-99,0);pos.needsUpdate=true;pp.rods.material.opacity=.45*fade;
    return solved;
  }

  // ---- sparks, glints, overlays -----------------------------------------------------------
  const SPARKS=220,sparkGeo=new THREE.BufferGeometry(),sparkPos=new Float32Array(SPARKS*3),sparkCol=new Float32Array(SPARKS*4),sparks=[];
  sparkGeo.setAttribute('position',new THREE.BufferAttribute(sparkPos,3));sparkGeo.setAttribute('color',new THREE.BufferAttribute(sparkCol,4));
  const sparkPts=new THREE.Points(sparkGeo,new THREE.PointsMaterial({size:.2,map:dotTex,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
  sparkPts.renderOrder=60;sparkPts.frustumCulled=false;scene.add(sparkPts);
  function burst(at,n,palette,speed=5,life=.45,size=1){
    for(let i=0;i<n;i++){
      const a=rnd()*Math.PI*2,v=speed*(.35+rnd()*.9),c=col(palette[i%palette.length]);
      const r0=rnd()*.32*size;sparks.push({x:at.x+Math.cos(a)*r0,y:at.y+Math.sin(a)*r0*.8,z:.13,vx:Math.cos(a)*v,vy:Math.sin(a)*v*.8+1.2,life:life*(.6+rnd()*.7),age:0,r:c.r,g:c.g,b:c.b,size});
    }
    while(sparks.length>SPARKS)sparks.shift();
  }
  const starTex=tex('star',()=>{const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');g.translate(64,64);
    const gr=g.createRadialGradient(0,0,0,0,0,60);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.2,'rgba(255,255,255,.5)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;
    for(let i=0;i<4;i++){g.rotate(Math.PI/2);g.beginPath();g.moveTo(0,-62);g.quadraticCurveTo(4,0,0,0);g.quadraticCurveTo(-4,0,0,-62);g.fill();}
    g.beginPath();g.arc(0,0,16,0,7);g.fill();return c;});
  const stars=[];for(let i=0;i<8;i++){const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:starTex,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true}));sp.visible=false;sp.renderOrder=70;scene.add(sp);stars.push({sp,age:9,life:.4,id:0});}
  function star(at,color,id,scale=1.6){const s=stars.find(x=>x.age>=x.life)||stars[0];s.age=0;s.life=.42;s.id=id;s.base=scale;s.sp.material.color.set(color);s.sp.position.set(at.x,at.y,.15);s.sp.visible=true;}
  const markTex=tex('mark',()=>{const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');g.translate(64,64);
    g.strokeStyle='rgba(255,236,190,1)';g.lineWidth=7;g.beginPath();g.arc(0,0,40,0,7);g.stroke();g.fillStyle='rgba(255,210,107,.9)';g.beginPath();g.arc(0,0,22,0,7);g.fill();
    g.fillStyle='rgba(60,20,10,1)';g.beginPath();g.moveTo(-8,-12);g.lineTo(12,0);g.lineTo(-8,12);g.closePath();g.fill();return c;});
  const marks=new Map();
  const overlay=(frag,blend)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({uniforms:{uA:{value:0}},transparent:true,depthTest:false,depthWrite:false,blending:blend,
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:frag}));m.frustumCulled=false;m.renderOrder=999;m.visible=false;scene.add(m);return m;};
  const flash=overlay('uniform float uA;varying vec2 vUv;void main(){float v=1.-.55*length(vUv-.5);gl_FragColor=vec4(vec3(1.,.93,.78)*uA*v,1.);}',THREE.AdditiveBlending);
  const wound=overlay('uniform float uA;varying vec2 vUv;void main(){float v=smoothstep(.25,.75,length(vUv-.5)*1.25);gl_FragColor=vec4(.25,0.,0.,v*uA);}',THREE.NormalBlending);

  // ---- per-frame sync --------------------------------------------------------------------
  let gongGlow=0,hurtTint=0;
  const glintOf=(e)=>{const k=e.state==='attack'?e.tel.findIndex((v,i)=>v&&!e.done[i]):-1;if(k<0)return null;const st=e.move.strikes[k];return{red:!!st.unblockable,eta:(st.hit-e.clock)/e.rate};};
  function fx(ev,s){
    const solvedOf=id=>{const a=id===0?s.player:s.enemies.find(e=>e.id===id);if(!a)return null;return{a,solved:R.solve(id===0?'player':a.kind,R.pose(id===0?'player':a.kind,a,s.time))};};
    if(ev.type==='telegraph'){const o=solvedOf(ev.id);if(o){const q=R.point(o.a.kind,o.solved,o.a.kind==='moth'?'eye':ev.unblockable?'jar':'weapon');star(q,ev.unblockable?PAL.danger:PAL.glint,ev.id,ev.unblockable?2.2:1.7);}}
    else if(ev.type==='parry'){
      const o=solvedOf(0),q=o?R.point('player',o.solved,'gong'):ev.at;
      if(ev.perfect){burst(q,ev.sparks,['#FFFFFF',PAL.spark,PAL.spark,'#FFE8B0'],6.5,.55);star(q,'#FFFFFF',0,2.6);gongGlow=1;}
      else burst(q,ev.sparks,[PAL.sparkDull,'#8A4F22'],3.2,.3);
    }
    else if(ev.type==='hit')burst(ev.at,ev.sparks,['#F2E4C6','#E8C98E',PAL.spark],ev.counter?4.5:3,.35);
    else if(ev.type==='deflect')burst(ev.at,ev.sparks,['#DCE3E8','#FFFFFF',PAL.sparkDull],4,.3);
    else if(ev.type==='execute'){burst(ev.at,ev.sparks,['#FFFFFF',PAL.spark,PAL.robe,'#FFE8B0'],7,.7);star(ev.at,'#FFFFFF',0,3.2);gongGlow=1;}
    else if(ev.type==='bossDown'){burst(ev.at,ev.sparks,['#FFFFFF',PAL.spark,'#FFE8B0',PAL.crown],8,1.1);star(ev.at,'#FFFFFF',0,4.5);}
    else if(ev.type==='hurt'){hurtTint=1;burst(ev.at,6,['#2B1D14','#5A3A28'],2.5,.4);}
    else if(ev.type==='flit')burst(ev.at,5,['#C9B79C','#F2E4C6'],2,.3);
    else if(ev.type==='stun'){const o=solvedOf(ev.id);if(o)burst({x:o.a.x,y:(o.a.y||0)+1.2},8,['#FFE8B0'],2,.5);}
  }
  function sync(s,real,dtReal,scale=1){
    const lamp=(.78+.22*s.player.hp/s.player.maxHp)*(1+.03*Math.sin(real*7.3)+.02*Math.sin(real*13.1+1));
    const flare=s.feel.flare;cloth.material.uniforms.uLamp.value=lamp*(1+flare);cloth.material.uniforms.uTime.value=real;
    ground.material.color.setScalar(groundTint*Math.max(.4,lamp*(1+flare)));
    const k=lamp*(1+Math.max(-.3,flare)*.65);
    // actors
    const alive=new Set([0]);
    const actors=[{id:0,kind:'player',a:s.player}].concat(s.enemies.map(e=>({id:e.id,kind:e.kind,a:e})));
    for(const {id,kind,a} of actors){
      alive.add(id);let pp=puppets.get(id);if(!pp){pp=makePuppet(kind,id);puppets.set(id,pp);}
      if(id===0)pp.tint=hurtTint;
      poseInto(pp,a,s.time,k);
      const g=id===0?{red:false,eta:0,amount:gongGlow}:glintOf(a);
      for(const {m,name} of pp.glows){
        let amount=0,color=PAL.glint;
        if(id===0){amount=gongGlow*1.4;color='#FFF6DA';}
        else if(g&&(kind!=='rat'||(name==='jar')===g.red)){amount=.45+.55*Math.max(0,1-g.eta/.45);color=g.red?PAL.danger:PAL.glint;}
        m.visible=amount>.01;m.material.color.set(color).multiplyScalar(amount*k);
      }
      if(kind!=='player'&&a.state==='stun'&&!a.execBy){
        let mk=marks.get(id);if(!mk){mk=new THREE.Sprite(new THREE.SpriteMaterial({map:markTex,transparent:true,depthWrite:false}));mk.renderOrder=80;scene.add(mk);marks.set(id,mk);}
        const b=R.bounds(kind,R.pose(kind,a,s.time));mk.position.set(a.x,b.maxY+.45,.16);const p=1+.12*Math.sin(real*9);mk.scale.set(.62*p,.62*p,1);
      }else if(marks.has(id)){scene.remove(marks.get(id));marks.get(id).material.dispose();marks.delete(id);}
    }
    for(const [id,pp] of puppets)if(!alive.has(id)||(id!==0&&!s.enemies.some(e=>e.id===id))){if(id!==0){dropPuppet(pp);puppets.delete(id);}}
    // sparks and glints run on real time, slowed with the game but never frozen solid
    const sdt=dtReal*Math.max(.35,Math.min(1,scale));
    for(const p of sparks){p.age+=sdt;p.vy-=9*sdt;p.vx*=Math.exp(-sdt*2.5);p.x+=p.vx*sdt;p.y+=p.vy*sdt;}
    for(let i=sparks.length-1;i>=0;i--)if(sparks[i].age>=sparks[i].life)sparks.splice(i,1);
    for(let i=0;i<SPARKS;i++){const p=sparks[i];if(p){const f=1-p.age/p.life;sparkPos.set([p.x,p.y,p.z],i*3);sparkCol.set([p.r,p.g,p.b,Math.min(1,f*1.6)],i*4);}else{sparkPos.set([0,-99,0],i*3);sparkCol[i*4+3]=0;}}
    sparkGeo.attributes.position.needsUpdate=true;sparkGeo.attributes.color.needsUpdate=true;
    for(const st of stars){if(st.age<st.life){st.age+=sdt;const u=st.age/st.life,sc=st.base*(u<.12?u/.12:1)*(1+.2*Math.sin(u*20));st.sp.scale.set(sc,sc,1);st.sp.material.opacity=Math.max(0,1-Math.max(0,u-.25)/.75);st.sp.visible=st.age<st.life;}else st.sp.visible=false;}
    for(let i=0;i<dustN;i++){const d=dust[i];d.y+=d.v*dtReal;d.x+=Math.sin(real*.3+d.p)*.02*dtReal;if(d.y>top+.5)d.y=bottom-.3;dustPos.set([d.x,d.y,d.z],i*3);const glow=.1+.5*(1-G.clothMix(d.x,d.y));dustCol.set([1,.8,.55,glow*lamp*(.6+.4*Math.sin(real*1.3+d.p))],i*4);}
    dustGeo.attributes.position.needsUpdate=true;dustGeo.attributes.color.needsUpdate=true;
    gongGlow=Math.max(0,gongGlow-dtReal*3.2);hurtTint=Math.max(0,hurtTint-dtReal*4);
    flash.material.uniforms.uA.value=Math.max(0,flare)*.42;flash.visible=flare>.01;
    wound.material.uniforms.uA.value=Math.max(0,-flare)*1.4+.35*Math.max(0,1-s.player.hp/40)*(s.player.hp>0?1:0);wound.visible=wound.material.uniforms.uA.value>.01;
  }
  function frameCamera(aspect,view,feel,real){
    const f=G.frame(aspect,view==='wide'?'wide':'play');camera.fov=f.fov;camera.aspect=aspect;
    let px=f.pos.x,py=f.pos.y,pz=f.pos.z,tx=f.target.x,ty=f.target.y;
    if(feel&&feel.push>0){const k=feel.push;px+=(feel.pushAt.x-px)*k;py+=(feel.pushAt.y-py)*k;pz-=(pz)*k;tx+=(feel.pushAt.x-tx)*k*1.2;ty+=(feel.pushAt.y-ty)*k*1.2;}
    if(feel&&feel.shake>0){const h=2*Math.tan(f.fov*Math.PI/360)*f.pos.z,a=feel.shake*h;const sx=Math.sin(real*91)*a,sy=Math.cos(real*77)*a;px+=sx;tx+=sx;py+=sy;ty+=sy;}
    camera.position.set(px,py,pz);camera.lookAt(tx,ty,0);camera.updateProjectionMatrix();
  }
  return{renderer,scene,camera,cloth,puppets,fx,sync,frameCamera,
    render(){renderer.render(scene,camera);},
    resize(w,h,pr){renderer.setPixelRatio(pr);renderer.setSize(w,h,false);},
    // for render readings: the hero's body, and every other moving thing that could stand between it and the cloth
    layers(){
      const body=[],rest=[sparkPts,dustPts,flash,wound,...stars.map(x=>x.sp),...marks.values()];
      for(const [id,pp] of puppets){const own=pp.meshes.map(x=>x.m);if(id===0)body.push(...own);else rest.push(...own);rest.push(...pp.glows.map(x=>x.m),pp.rods);}
      return{body,rest};
    }};
}
root.GongWorld={createWorld};
})(typeof globalThis!=='undefined'?globalThis:this);
