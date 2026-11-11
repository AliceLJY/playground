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

function page(level=0,dpr=1){
  const listeners={},elements={},rect={left:13,top:21,width:404,height:468};
  let nextFrame,now=0,pose;
  const boardCtx=new CanvasRecorder();
  const board={getContext:()=>boardCtx,getBoundingClientRect:()=>rect,addEventListener:(name,fn)=>listeners[name]=fn};
  const document={body:{classList:{toggle(){}}},hidden:false,
    getElementById:id=>id==='board'?board:(elements[id]||=( {hidden:true} )),
    createElement:()=>{const ctx=new CanvasRecorder();return {getContext:()=>ctx};},
    querySelectorAll:()=>[],addEventListener(){}};
  const art={...Art,cat(ctx,x,y,s,ang,o){if(ctx===boardCtx&&o.kind==='orange')pose={x,y,s,ang,o:{...o}};return Art.cat(ctx,x,y,s,ang,o);}};
  const sandbox={SneakCore:C,SneakArt:art,document,location:{search:'?level='+(level+1)},URLSearchParams,
    innerWidth:430,innerHeight:664,devicePixelRatio:dpr,performance:{now:()=>now},
    addEventListener:(name,fn)=>listeners[name]=fn,requestAnimationFrame:fn=>nextFrame=fn};
  sandbox.window=sandbox;
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/game.js'),'utf8'),sandbox,{filename:'game.js'});
  const render=(ms=0)=>{now+=ms;nextFrame(now);};
  render();sandbox.__PLAYTEST__.setSeed(9);render();
  return {sandbox,elements,render,get pose(){return pose;},get state(){return sandbox.__sneak.state;},
    click(x,y){listeners.pointerdown({clientX:rect.left+x,clientY:rect.top+y});},
    key(code){listeners.keydown({code,preventDefault(){}});},
    step(ms){sandbox.__PLAYTEST__.step(ms);render();}};
}
function shape(p){const ctx=new CanvasRecorder();Art.cat(ctx,p.x,p.y,p.s,p.ang,p.o);return ctx;}
const tailTip=p=>shape(p).ops.find(op=>op.kind==='stroke').paths[0].at(-1);
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
    const p=standing(dpr),s=p.state,[x,y]=tailTip(p.pose),{cell}=p.sandbox.__PLAYTEST__.snapshot();
    assert.equal(Math.floor((x-(404-cell*7)/2)/cell),2,'the rendered tail tip really lies in neighbouring column 2');
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
    const [x,y]=tailTip(p.pose);s.cat.target=s.L.door;p.click(x,y);
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
  const edge=page(2,2),[x,y]=tailTip(edge.pose),{cell}=edge.sandbox.__PLAYTEST__.snapshot();
  assert.ok(x>(404-cell*7)/2+cell*7&&x<404,'the drawn tail is outside the grid but inside the canvas');
  edge.state.setTarget(13);edge.click(x,y);
  assert.equal(edge.state.cat.target,-1,'grid bounds must not discard a click on the visible tail');
});

test('cold read 1: standing tail sway uses the last rendered pose, and stale masks are cleared between clicks',()=>{
  const p=standing(2),s=p.state;
  for(const ms of [200,800,1200,900]){
    p.render(ms);
    const [x,y]=tailTip(p.pose);s.setTarget(56);p.click(x,y);
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
