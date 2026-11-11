// Offline regressions: execute the real page input and artwork with a recording Canvas/DOM.
// The point sampler checks emitted geometry; browser rasterization/antialiasing still needs a browser check.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const C=require('../src/core.js'),Art=require('../src/art.js').SneakArt;

const identity=()=>[1,0,0,1,0,0];
const point=(m,x,y)=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
function inside(p,poly){
  let hit=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[i],b=poly[j];
    if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;
  }
  return hit;
}
function distance(p,a,b){
  const dx=b[0]-a[0],dy=b[1]-a[1],n=dx*dx+dy*dy;
  const k=n?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/n)):0;
  return Math.hypot(p[0]-a[0]-k*dx,p[1]-a[1]-k*dy);
}
class CanvasRecorder{
  constructor(){this.m=identity();this.clips=[];this.stack=[];this.ops=[];this.globalAlpha=1;this.lineWidth=1;}
  save(){this.stack.push({m:[...this.m],clips:[...this.clips],globalAlpha:this.globalAlpha,lineWidth:this.lineWidth,fillStyle:this.fillStyle,strokeStyle:this.strokeStyle});}
  restore(){Object.assign(this,this.stack.pop());}
  setTransform(...m){this.m=m;}
  translate(x,y){const p=point(this.m,x,y);this.m[4]=p[0];this.m[5]=p[1];}
  scale(x,y){this.m[0]*=x;this.m[1]*=x;this.m[2]*=y;this.m[3]*=y;}
  rotate(a){const [b,c,d,e,x,y]=this.m,co=Math.cos(a),si=Math.sin(a);this.m=[b*co+d*si,c*co+e*si,d*co-b*si,e*co-c*si,x,y];}
  beginPath(){this.paths=[];}
  moveTo(x,y){this.paths.push([point(this.m,x,y)]);}
  lineTo(x,y){this.paths.at(-1).push(point(this.m,x,y));}
  closePath(){this.paths.at(-1).push(this.paths.at(-1)[0]);}
  quadraticCurveTo(x1,y1,x2,y2){
    const a=this.paths.at(-1).at(-1),b=point(this.m,x1,y1),c=point(this.m,x2,y2);
    for(let i=1;i<=64;i++){const t=i/64,u=1-t;this.paths.at(-1).push([u*u*a[0]+2*u*t*b[0]+t*t*c[0],u*u*a[1]+2*u*t*b[1]+t*t*c[1]]);}
  }
  bezierCurveTo(x1,y1,x2,y2,x3,y3){
    const a=this.paths.at(-1).at(-1),b=point(this.m,x1,y1),c=point(this.m,x2,y2),d=point(this.m,x3,y3);
    for(let i=1;i<=32;i++){const t=i/32,u=1-t;this.paths.at(-1).push([u**3*a[0]+3*u*u*t*b[0]+3*u*t*t*c[0]+t**3*d[0],u**3*a[1]+3*u*u*t*b[1]+3*u*t*t*c[1]+t**3*d[1]]);}
  }
  ellipse(x,y,rx,ry,a,start,end){
    const path=[];for(let i=0;i<=64;i++){const t=start+(end-start)*i/64,px=Math.cos(t)*rx,py=Math.sin(t)*ry;path.push(point(this.m,x+px*Math.cos(a)-py*Math.sin(a),y+px*Math.sin(a)+py*Math.cos(a)));}this.paths.push(path);
  }
  arc(x,y,r,start,end){this.ellipse(x,y,r,r,0,start,end);}
  rect(x,y,w,h){this.paths.push([[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]].map(p=>point(this.m,...p)));}
  roundRect(x,y,w,h){this.rect(x,y,w,h);}
  clip(){this.clips.push(this.paths);}
  paint(kind){this.ops.push({kind,paths:this.paths,clips:[...this.clips],style:kind==='fill'?this.fillStyle:this.strokeStyle,alpha:this.globalAlpha,width:this.lineWidth*Math.hypot(this.m[0],this.m[1])});}
  fill(){this.paint('fill');}
  stroke(){this.paint('stroke');}
  fillRect(x,y,w,h){const old=this.paths;this.beginPath();this.rect(x,y,w,h);this.fill();this.paths=old;}
  strokeRect(x,y,w,h){const old=this.paths;this.beginPath();this.rect(x,y,w,h);this.stroke();this.paths=old;}
  clearRect(){this.ops=[];}
  createLinearGradient(){return {addColorStop(){}};}
  createRadialGradient(){return {addColorStop(){}};}
  measureText(text){return {width:text.length*8};}
  setLineDash(){}
  fillText(){}
  drawImage(){}
  getImageData(x,y){
    const p=[x+.5,y+.5],hit=this.ops.some(op=>op.alpha>0&&op.clips.every(clip=>clip.some(poly=>inside(p,poly)))&&op.paths.some(poly=>op.kind==='fill'?inside(p,poly):poly.slice(1).some((b,i)=>distance(p,poly[i],b)<=op.width/2)));
    return {data:new Uint8ClampedArray([0,0,0,hit?255:0])};
  }
}

function page(level=0,dpr=1,view=null){
  const listeners={},elements={},rect={left:13,top:21,width:404,height:468};
  let nextFrame,now=0,pose;
  const calls=[],rawCtx=new CanvasRecorder();
  // Capture the real Canvas API stream, including transforms, colours, text and gradient stops.
  const boardCtx=view?new Proxy(rawCtx,{
    get(target,key){
      const value=target[key];if(typeof value!=='function')return value;
      return (...args)=>{
        calls.push([key,...args]);const result=value.apply(target,args);
        if(key==='createLinearGradient'||key==='createRadialGradient')return {addColorStop(...stops){calls.push(['addColorStop',...stops]);}};
        return result;
      };
    },
    set(target,key,value){calls.push(['set',key,typeof value==='object'?'gradient':value]);target[key]=value;return true;}
  }):rawCtx;
  const board={getContext:()=>boardCtx,getBoundingClientRect:()=>rect,addEventListener:(name,fn)=>listeners[name]=fn};
  const document={body:{classList:{toggle(){}}},hidden:false,
    getElementById:id=>id==='board'?board:(elements[id]||=( {hidden:true} )),
    createElement:()=>{const ctx=new CanvasRecorder();return {getContext:()=>ctx};},
    querySelectorAll:()=>[],addEventListener(){}};
  const art={...Art,cat(ctx,x,y,s,ang,o){if(ctx===boardCtx&&o.kind==='orange')pose={x,y,s,ang,o:{...o}};return Art.cat(ctx,x,y,s,ang,o);}};
  const sandbox={SneakCore:C,SneakArt:art,document,location:{search:'?level='+(level+1)+(view?'&view='+view:'')},URLSearchParams,
    innerWidth:430,innerHeight:664,devicePixelRatio:dpr,performance:{now:()=>now},
    addEventListener:(name,fn)=>listeners[name]=fn,requestAnimationFrame:fn=>nextFrame=fn};
  sandbox.window=sandbox;
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/game.js'),'utf8'),sandbox,{filename:'game.js'});
  const render=(ms=0)=>{now+=ms;nextFrame(now);};
  render();if(!view){sandbox.__PLAYTEST__.setSeed(9);render();}
  return {sandbox,elements,render,calls,get pose(){return pose;},get state(){return sandbox.__sneak.state;},
    click(x,y){listeners.pointerdown({clientX:rect.left+x,clientY:rect.top+y});},
    key(code){listeners.keydown({code,preventDefault(){}});},
    step(ms){sandbox.__PLAYTEST__.step(ms);render();}};
}
function shape(p){const ctx=new CanvasRecorder();Art.cat(ctx,p.x,p.y,p.s,p.ang,p.o);return ctx;}
// Sample the backmost painted tail centreline point, including curled tails.
const tailEdge=p=>shape(p).ops.find(op=>op.kind==='stroke').paths[0].reduce((a,b)=>
  (a[0]-p.x)*Math.cos(p.ang)+(a[1]-p.y)*Math.sin(p.ang)<
  (b[0]-p.x)*Math.cos(p.ang)+(b[1]-p.y)*Math.sin(p.ang)?a:b);
function standing(dpr=1){
  const p=page(0,dpr),s=p.state;
  // Reach (3,8) through the actual pointer handler and simulation, not a state jump.
  const {cell}=p.sandbox.__PLAYTEST__.snapshot(),ox=(404-cell*7)/2;
  p.click(ox+3.5*cell,8.5*cell);for(let i=0;i<12;i++)p.step(100);
  assert.equal(s.cat.at,59,'the real tap must walk from the bed to (3,8)');
  assert.equal(s.phase,'play');return p;
}

test('cold read 1: standing tail outside the cat cell stops instead of targeting its neighbour',()=>{
  for(const dpr of [1,2]){
    const p=standing(dpr),s=p.state,[x,y]=tailEdge(p.pose),{cell}=p.sandbox.__PLAYTEST__.snapshot();
    assert.equal(Math.floor((x-(404-cell*7)/2)/cell),2,'the rendered tail edge really lies in neighbouring column 2');
    s.setTarget(56);p.click(x,y);
    assert.equal(s.cat.target,-1,'clicking the drawn tail at (2,8) must stop Xiaoju at (3,8)');
    assert.equal(p.elements.msg.textContent,'小橘停下了。');
    p.step(1200);assert.equal(s.cat.at,59,'the tail tap must not start a walk to the left');
  }
});

test('cold read 1: moving tails follow all three levels, four facings, stride interpolation and sway',()=>{
  for(const level of [0,1,2])for(const dir of [0,1,2,3])for(const ms of [20,70]){
    const p=page(level,2),s=p.state;
    s.cat.at=[44,52,17][level];s.san.p=0;
    p.key(['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'][dir]);p.step(100);p.render(ms);
    assert.equal(s.phase,'play');assert.ok(s.cat.move,'the sample must actually be walking');
    const [x,y]=tailEdge(p.pose);s.cat.target=s.L.door;p.click(x,y);
    assert.equal(s.cat.target,-1,`level ${level+1}, direction ${dir}, interpolation ${ms} ms: drawn tail must stop`);
    assert.equal(s.cat.queued,null,'stop also clears any queued step');
    // At this early stride the head protrudes into the destination cell before catOcc moves there.
    const q=p.pose,co=Math.cos(q.ang),si=Math.sin(q.ang),bob=Math.abs(Math.sin(q.o.walk*Math.PI*2))*.02;
    s.cat.target=s.L.door;p.click(q.x+q.s*(.4+bob)*co,q.y+q.s*(.4+bob)*si);
    assert.equal(s.cat.target,-1,`level ${level+1}, direction ${dir}: protruding head must stop before the occupied cell changes`);
  }
});

test('cold read 1: head, ears, paws, body and whiskers issue stop, with the original cell fallback intact',()=>{
  const p=standing(2),s=p.state;
  // Local points on the actual figure, including an outer whisker endpoint.
  for(const [x,y] of [[.27,0],[.325,-.20],[.17,.17],[-.30,0],[.48,.16],[0,.40]]){
    const q=p.pose,co=Math.cos(q.ang),si=Math.sin(q.ang);
    s.setTarget(56);p.click(q.x+q.s*(x*co-y*si),q.y+q.s*(x*si+y*co));
    assert.equal(s.cat.target,-1,`body point (${x},${y}) or occupied-cell fallback must stop`);
  }
});

test('cold read 1: empty floor beside the tail still walks, and an out-of-grid visible tail still stops',()=>{
  const p=standing(),q=p.pose,s=p.state;
  p.click(q.x-q.s*.72,q.y-q.s*.30);
  assert.equal(s.cat.target,58,'empty floor in the tail cell must remain a walk target');
  // Table level starts facing west at the right edge; its tail extends into canvas padding.
  const edge=page(2,2),[x,y]=tailEdge(edge.pose),{cell}=edge.sandbox.__PLAYTEST__.snapshot();
  assert.ok(x>(404-cell*7)/2+cell*7&&x<404,'the drawn tail is outside the grid but inside the canvas');
  edge.state.setTarget(13);edge.click(x,y);
  assert.equal(edge.state.cat.target,-1,'grid bounds must not discard a click on the visible tail');
});

test('cold read 1: standing tail sway uses the last rendered pose, and stale masks are cleared between clicks',()=>{
  const p=standing(2),s=p.state;
  for(const ms of [200,800,1200,900]){
    p.render(ms);
    const [x,y]=tailEdge(p.pose);s.setTarget(56);p.click(x,y);
    assert.equal(s.cat.target,-1,'every sampled sway must stop on the current drawn tail');
    // Still inside the neighbour cell, but clear of the entire tail, including its swept bounding box.
    p.click(p.pose.x-p.pose.s*.72,p.pose.y-p.pose.s*.42);
    assert.equal(s.cat.target,58,'the previous hit must not remain in the one-pixel mask');
    s.stop();
  }
});

test('cold read 2: every corridor wall emits three seams and a finite, nonempty speckle loop',()=>{
  const L=C.level(1);
  for(const s of [40,52,80]){
    const ctx=new CanvasRecorder(),ox=11,oy=17;Art.paintRoom(ctx,L,{ox,oy,s},false);
    const walls=L.kind.flatMap((k,i)=>k==='#'&&i%L.cols<4?[i]:[]);
    assert.ok(walls.length>0,'the sample must actually contain corridor walls');
    for(const i of walls){
      const x=ox+(i%L.cols)*s,y=oy+Math.floor(i/L.cols)*s;
      const seams=ctx.ops.filter(op=>op.kind==='stroke'&&op.style==='rgba(0,0,0,.18)'&&op.paths[0].length===2&&op.paths[0][0][0]===x&&op.paths[0][1][0]===x+s&&op.paths[0][0][1]>y&&op.paths[0][0][1]<y+s);
      assert.equal(seams.length,3,`wall ${i} at ${s}px: all three brick seams must actually be stroked`);
      const noise=ctx.ops.filter(op=>op.kind==='fill'&&op.style==='#ffffff'&&op.alpha===.05&&op.paths[0][0][0]>=x&&op.paths[0][0][0]<x+s&&op.paths[0][0][1]>=y&&op.paths[0][0][1]<y+s);
      assert.equal(noise.length,Math.round(s/1.2),`wall ${i} at ${s}px: the speckle loop must actually paint its dots`);
      assert.ok([...seams,...noise].every(op=>op.paths.flat(2).every(Number.isFinite)),'wall detail coordinates must all be finite');
    }
  }
});

test('round 2: every fixed view emits identical Canvas calls after wall time advances',()=>{
  const views=[['start','hiss','table','exit','clear'],['start','heard','hug','exit','clear'],['start','warn','stop','exit','clear']];
  for(const level of [0,1,2])for(const view of views[level]){
    const p=page(level,2,view),hook=p.sandbox.__PLAYTEST__;
    assert.equal(hook.snapshot().view,view,'the real fixed-view pilot must reach the requested state');
    const beforeState=JSON.stringify(hook.snapshot());
    p.calls.length=0;p.sandbox.__sneak.paint();const first=JSON.stringify(p.calls);
    assert.ok(p.calls.length>100,'the sample must actually paint the room and its animated objects');
    for(const ms of [1700,2300]){
      p.render(ms);p.calls.length=0;p.sandbox.__sneak.paint();
      assert.equal(JSON.stringify(p.calls),first,`level ${level+1}/${view}: wall time changed the Canvas calls`);
      assert.equal(JSON.stringify(hook.snapshot()),beforeState,'the fixed simulation must stay frozen');
    }
  }
});

function widthAt(poly,x){
  const ys=[];
  for(let i=1;i<poly.length;i++){
    const [ax,ay]=poly[i-1],[bx,by]=poly[i];
    if((ax<=x&&bx>x)||(bx<=x&&ax>x))ys.push(ay+(by-ay)*(x-ax)/(bx-ax));
  }
  return ys.length?Math.max(...ys)-Math.min(...ys):0;
}
function paintedStyle(ctx,x,y){
  const p=[x,y];
  return ctx.ops.findLast(op=>op.alpha>0&&op.clips.every(clip=>clip.some(poly=>inside(p,poly)))&&
    op.paths.some(poly=>op.kind==='fill'?inside(p,poly):poly.slice(1).some((b,i)=>distance(p,poly[i],b)<=op.width/2)))?.style;
}

test('round 3: painted cats have a larger head, narrower neck and shoulders, and rounded hips',()=>{
  for(const kind of ['orange','calico'])for(const walk of [-1,.125])for(const puff of [false,true]){
    const ctx=shape({x:0,y:0,s:1000,ang:0,o:{kind,walk,puff,t:0,hitMask:true}});
    const gradients=ctx.ops.filter(op=>op.kind==='fill'&&typeof op.style==='object'&&op.clips.length===0);
    assert.equal(gradients.length,2,'sample the actual shaded body and head contours');
    const body=gradients[0].paths[0],head=gradients[1].paths[0],bob=walk<0?0:Math.abs(Math.sin(walk*Math.PI*2))*20;
    const hip=widthAt(body,-160+bob),shoulder=widthAt(body,64+bob),neck=widthAt(body,164+bob);
    const bodyWidth=Math.max(...body.map(p=>p[1]))-Math.min(...body.map(p=>p[1]));
    const headWidth=Math.max(...head.map(p=>p[1]))-Math.min(...head.map(p=>p[1]));
    assert.ok(hip>=shoulder*1.15,`${kind}: hips ${hip.toFixed(1)} must be at least 15% wider than shoulders ${shoulder.toFixed(1)}`);
    assert.ok(neck<shoulder*.8,`${kind}: the neck must visibly narrow`);
    const ratio=headWidth/bodyWidth;
    assert.ok(ratio>=1.15&&ratio<=1.30,`${kind}: actual head/body width ${ratio.toFixed(3)} must be 1.15–1.30`);
  }
});

test('round 3: both cats retain visible triangular ears and four round white paws',()=>{
  for(const kind of ['orange','calico']){
    const ctx=shape({x:0,y:0,s:1000,ang:0,o:{kind,walk:-1,t:0,hitMask:true}});
    const ears=ctx.ops.filter(op=>op.kind==='fill'&&['#f6b8a8','#f2b2a8'].includes(op.style));
    assert.equal(ears.length,2,'both inner ears must actually be filled');
    for(const ear of ears){
      assert.ok(Math.max(...ear.paths[0].map(p=>Math.abs(p[1])))>=240,'the pink ear tip must project beyond the head');
      assert.ok(ear.paths[0].length<=4,'the inner ear must have a triangular contour');
      const triangle=ear.paths[0].slice(0,3),x=triangle.reduce((n,p)=>n+p[0],0)/3,y=triangle.reduce((n,p)=>n+p[1],0)/3;
      assert.equal(paintedStyle(ctx,x,y),ear.style,'later head paint must not cover the inner ear');
    }
    const paws=ctx.ops.filter(op=>op.kind==='fill'&&op.style==='#fff5e5'&&
      op.paths[0].every(p=>p[0]>-400&&Math.abs(p[1])>200));
    assert.equal(paws.length,4,'four separate white paws must actually be painted');
    for(const paw of paws){
      assert.ok(paw.paths[0].some(p=>Math.abs(p[1])>=270),'each paw must project outside the torso');
      const corners=paw.paths[0].slice(0,4),x=corners.reduce((n,p)=>n+p[0],0)/4,y=corners.reduce((n,p)=>n+p[1],0)/4;
      assert.equal(paintedStyle(ctx,x,y),'#fff5e5','later torso paint must not cover the white paw');
    }
  }
});

test('round 3: short curved bodies support a 40–45% head length, forward ears and highlighted eyes',()=>{
  for(const kind of ['orange','calico'])for(const walk of [-1,.125]){
    const ctx=shape({x:0,y:0,s:1000,ang:0,o:{kind,walk,t:0,hitMask:true}});
    const contours=ctx.ops.filter(op=>op.kind==='fill'&&typeof op.style==='object'&&op.clips.length===0);
    const [body,head]=contours.map(op=>op.paths[0]);
    const length=poly=>Math.max(...poly.map(p=>p[0]))-Math.min(...poly.map(p=>p[0]));
    const whole=Math.max(...head.map(p=>p[0]))-Math.min(...body.map(p=>p[0]));
    const ratio=length(head)/whole;
    assert.ok(ratio>=.40&&ratio<=.45,`${kind}: head/whole length ${ratio.toFixed(3)} must be .40–.45`);
    assert.ok(whole<=1050,'head and torso must fit within 1.05 drawing units');
    const ears=ctx.ops.filter(op=>op.kind==='fill'&&['#f6b8a8','#f2b2a8'].includes(op.style));
    for(const ear of ears){
      const triangle=ear.paths[0].slice(0,3),tip=triangle.reduce((a,b)=>Math.abs(a[1])>Math.abs(b[1])?a:b);
      const base=triangle.filter(p=>p!==tip),baseX=(base[0][0]+base[1][0])/2;
      assert.ok(tip[0]>baseX+60,'ear tip must point forward from its crown attachment');
      const [a,b,c]=triangle,area=Math.abs((b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1]))/2;
      assert.ok(area>=3000,'inner ears must retain a filled triangle instead of collapsing into thin spikes');
    }
    const paws=ctx.ops.filter(op=>op.kind==='fill'&&op.style==='#fff5e5'&&
      op.paths[0].every(p=>p[0]>-400&&Math.abs(p[1])>200));
    assert.equal(paws.length,4);
    for(const paw of paws)assert.ok(paw.paths[0].length>=16,'paw tips must have a round silhouette');
    const eyes=ctx.ops.filter(op=>op.kind==='fill'&&op.style==='#2a1a10');
    assert.equal(eyes.length,2,'the lifted head must paint two dark eyes');
    for(const eye of eyes){
      const poly=eye.paths[0],radius=(Math.max(...poly.map(p=>p[1]))-Math.min(...poly.map(p=>p[1])))/2;
      assert.ok(radius>=45,'each eye must have a visible dark disc');
    }
    assert.equal(ctx.ops.filter(op=>op.kind==='fill'&&op.style==='#ffffff'&&op.paths[0].every(p=>p[0]>350)).length,2,
      'both eyes must have a painted highlight');
  }
});


test('round 3: both tail options have a thick root, rings, pale tip and rigid sway',()=>{
  for(const kind of ['orange','calico'])for(const tail of ['ring','curl']){
    const options={kind,tail,walk:-1,t:0,hitMask:true};
    const ctx=shape({x:0,y:0,s:1000,ang:0,o:options});
    const contour=ctx.ops[0].paths[0],centre=ctx.ops.find(op=>op.kind==='stroke').paths[0];
    const root=centre[0],tip=centre.at(-1);
    const rootWidth=Math.hypot(contour[0][0]-root[0],contour[0][1]-root[1]);
    const tipWidth=Math.min(...contour.map(p=>Math.hypot(p[0]-tip[0],p[1]-tip[1])));
    assert.ok(rootWidth>tipWidth*2,'curled tail must taper from root to tip');
    const bands=ctx.ops.filter(op=>op.kind==='fill'&&op.clips.length&&
      [kind==='orange'?'#c2621a':'#2c2826','#fff5e5'].includes(op.style));
    assert.ok(bands.length>=4,'paint at least three transverse rings and a pale tip');
    const swayed=shape({x:0,y:0,s:1000,ang:0,o:{...options,t:.8}}).ops.find(op=>op.kind==='stroke').paths[0];
    assert.equal(swayed.length,centre.length,'sway keeps the same sampled curl');
    for(let i=1;i<centre.length;i++)assert.ok(Math.abs(Math.hypot(...centre[i].map((v,j)=>v-centre[0][j]))-
      Math.hypot(...swayed[i].map((v,j)=>v-swayed[0][j])))<.001,'tail sway must preserve its curled shape');
    assert.ok(Math.hypot(tip[0]-swayed.at(-1)[0],tip[1]-swayed.at(-1)[1])>1,'tail really sways');
  }
  const ring=shape({x:0,y:0,s:1000,ang:0,o:{kind:'orange',tail:'ring',walk:-1,t:0,hitMask:true}});
  assert.equal(paintedStyle(ring,-342,327),undefined,'the ring must leave visible floor in its centre');
  const curl=shape({x:0,y:0,s:1000,ang:0,o:{kind:'orange',tail:'curl',walk:-1,t:0,hitMask:true}});
  assert.ok(Math.min(...curl.ops[0].paths[0].map(p=>p[0]))<Math.min(...ring.ops[0].paths[0].map(p=>p[0]))-100,
    'the raised curl must visibly extend behind the compact side ring');
  const implicit=shape({x:0,y:0,s:1000,ang:0,o:{kind:'orange',walk:-1,t:0,hitMask:true}});
  assert.deepEqual(implicit.ops[0].paths,ring.ops[0].paths,'the game defaults to tail A');
});

test('round 3: introductory name tags clear the enlarged head during real northward input',()=>{
  const p=standing(2),labels=[],original=p.sandbox.SneakArt.label;
  p.sandbox.SneakArt.label=(ctx,text,x,y,size,...rest)=>{
    labels.push({text,x,y,size});return original(ctx,text,x,y,size,...rest);
  };
  p.key('ArrowUp');p.step(100);p.step(300);
  assert.ok(Math.abs(p.pose.ang+Math.PI/2)<1e-9,'sample a rendered north-facing stride, then its standing pose');
  assert.equal(p.state.cat.at,52,'the real arrow input must reach the open floor above');
  const tag=labels.findLast(label=>label.text==='你 · 小橘');
  assert.ok(tag,'sample the actual introductory tag while it is still visible');
  const q=p.pose,ctx=shape({...q,o:{...q.o,hitMask:true}});
  const head=ctx.ops.filter(op=>op.kind==='fill'&&typeof op.style==='object'&&!op.clips.length).at(-1).paths[0];
  const top=Math.min(...head.map(point=>point[1]));
  assert.ok(tag.y+tag.size*.68<=top-1,'introductory tag must leave at least 1 CSS px above the actual enlarged head');
});
