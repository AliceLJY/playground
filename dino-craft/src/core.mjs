// Shared deterministic world/survival rules. No renderer or DOM dependencies.
export const BLOCKS = {1:['草土','#648845','dirt'],2:['泥土','#826344','dirt'],3:['岩石','#829080','stone'],4:['细沙','#c7bc86','sand'],5:['原木','#73543a','wood'],6:['叶簇','#365d37','leaf'],7:['铁矿','#72979b','ore'],8:['琥珀','#ffb64b','amber'],9:['木板','#b88d56','plank'],10:['火把','#efb75a','torch'],11:['灯笼','#ffd178','lantern']};
export const SLOTS = [9,3,2,5,10,11];
export const RECIPES = [
 {name:'木板 ×4',cost:{wood:1},give:{plank:4},desc:'搭墙和屋顶'},
 {name:'火把 ×4',cost:{wood:1,plank:1},give:{torch:4},desc:'放在地上照亮营地'},
 {name:'灯笼 ×1',cost:{ore:1,torch:2},give:{lantern:1},desc:'更明亮的营地灯'},
 {name:'头灯电池 +60',cost:{amber:1,stone:2},give:{battery:60},desc:'H 打开头灯'},
 {name:'木板 ×8',cost:{wood:1,stone:2},give:{plank:8},desc:'石斧加工，省木料'},
 {name:'烤肉 ×2',cost:{meat:1,wood:1},give:{food:2},desc:'F 食用，恢复饥饿与生命'}
];
export function createVoxelKernel(seed=731) {
 const N=16,H=48;
 function hash(x,z,y=0){let n=Math.imul(x|0,374761393)^Math.imul(z|0,668265263)^Math.imul(y|0,1274126177)^Math.imul(seed|0,1597334677);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;}
 function noise(x,z){const a=Math.floor(x),b=Math.floor(z);let u=x-a,v=z-b;u=u*u*(3-2*u);v=v*v*(3-2*v);return (hash(a,b)*(1-u)+hash(a+1,b)*u)*(1-v)+(hash(a,b+1)*(1-u)+hash(a+1,b+1)*u)*v;}
 function rawHeight(x,z){const n=noise(x/42,z/42),m=noise(x/13,z/13);let h=12+Math.floor(n*12+m*4);const river=Math.abs(x-34-Math.sin(z/38)*13);h=Math.min(h,8+Math.floor(river*.72));const start=Math.max(0,1-Math.hypot(x,z)/11);return Math.floor(h*(1-start)+17*start);}
 function rawTree(gx,gz){const x=gx*8+Math.floor(hash(gx,gz,21)*6)+1,z=gz*8+Math.floor(hash(gx,gz,23)*6)+1,h=height(x,z),r=hash(gx,gz,25);if(h<13||Math.hypot(x-.5,z-7.5)<9||Math.hypot(x,z)<8||r<.24)return null;return {x,z,h,kind:r>.57?0:r>.37?1:2,high:7+Math.floor(hash(gx,gz,28)*6)};}
 const heights=new Map(),trees=new Map();
 function height(x,z){x=Math.floor(x);z=Math.floor(z);const id=x+','+z;if(heights.has(id))return heights.get(id);if(heights.size>=8192)heights.clear();const h=rawHeight(x,z);heights.set(id,h);return h;}
 function tree(x,z){const id=x+','+z;if(trees.has(id))return trees.get(id);if(trees.size>=1024)trees.clear();const t=rawTree(x,z);trees.set(id,t);return t;}
 function base(x,y,z){if(y<0)return 3;if(y>=H)return 0;const h=height(x,z);if(y>h)return 0;if(y===h)return h<14?4:1;if(y>h-3)return 2;const r=hash(x,z,y);return r>.986?8:r>.96?7:3;}
 function plant(t,x,y,z){const dx=x-t.x,dz=z-t.z,dy=y-t.h;if(t.kind===0){if(dx===0&&dz===0&&dy>0&&dy<=t.high)return 5;const level=t.high-dy;if(level>=-1&&level<=6){const rad=Math.min(3,1+Math.floor(level/2));if(Math.abs(dx)<=rad&&Math.abs(dz)<=rad&&Math.abs(dx)+Math.abs(dz)<=rad+1)return 6;}}else if(t.kind===1){if(dx===0&&dz===0&&dy>0&&dy<=3)return 5;if(dy>=2&&dy<=4&&Math.abs(dx)+Math.abs(dz)<=4&&(dx===0||dz===0||Math.abs(dx)===Math.abs(dz)))return 6;}else if(dy===1&&Math.abs(dx)+Math.abs(dz)<=2&&(dx===0||dz===0))return 6;return 0;}
 function block(x,y,z){x=Math.floor(x);y=Math.floor(y);z=Math.floor(z);let b=base(x,y,z);if(b||y<0||y>=H)return b;const gx=Math.floor(x/8),gz=Math.floor(z/8);for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){const t=tree(gx+i,gz+j);if(t&&(b=plant(t,x,y,z)))return b;}return 0;}
 function generate(cx,cz,edits=[]){const W=N+2,arr=new Uint8Array(W*W*H),ix=(x,y,z)=>(y*W+z+1)*W+x+1;
  for(let z=-1;z<=N;z++)for(let x=-1;x<=N;x++){const wx=cx*N+x,wz=cz*N+z,h=height(wx,wz);for(let y=0;y<=h;y++)arr[ix(x,y,z)]=y===h?(h<14?4:1):y>h-3?2:hash(wx,wz,y)>.986?8:hash(wx,wz,y)>.96?7:3;}
  for(let gx=Math.floor((cx*N-4)/8);gx<=Math.floor((cx*N+N+4)/8);gx++)for(let gz=Math.floor((cz*N-4)/8);gz<=Math.floor((cz*N+N+4)/8);gz++){const t=tree(gx,gz);if(!t)continue;for(let z=Math.max(-1,t.z-cz*N-4);z<=Math.min(N,t.z-cz*N+4);z++)for(let x=Math.max(-1,t.x-cx*N-4);x<=Math.min(N,t.x-cx*N+4);x++)for(let y=t.h+1;y<=Math.min(H-1,t.h+t.high+1);y++){const b=plant(t,x+cx*N,y,z+cz*N);if(b&&!arr[ix(x,y,z)])arr[ix(x,y,z)]=b;}}
  for(const [x,y,z,b] of edits){const lx=x-cx*N,lz=z-cz*N;if(lx>=-1&&lx<=N&&lz>=-1&&lz<=N&&y>=0&&y<H)arr[ix(lx,y,lz)]=b;}
  return arr;
 }
 function mesh(cx,cz,edits=[]){
  const a=generate(cx,cz,edits),W=18;
  const get=(x,y,z)=>y<0?3:y>=H?0:a[(y*W+z+1)*W+x+1];
  const dims=[N,H,N],p=[],n=[],c=[],uv=[],tiles=[],indices=[];
  let quads=0;
  const atlasTile=(b,d,sgn)=>b===1?(d===1?(sgn>0?0:2):1):b===5?(d===1?5:6):({2:2,3:3,4:4,6:8,7:10,8:9,9:7,10:11,11:12}[b]);
  // One padded neighbour ring supplies face culling and corner AO across seams.
  for(let d=0;d<3;d++){
   const u=(d+1)%3,v=(d+2)%3,mask=new Int32Array(dims[u]*dims[v]),pos=[0,0,0],q=[0,0,0];q[d]=1;
   for(pos[d]=-1;pos[d]<dims[d];pos[d]++){
    let k=0;
    for(pos[v]=0;pos[v]<dims[v];pos[v]++)for(pos[u]=0;pos[u]<dims[u];pos[u]++){
     const a=get(...pos),b=get(pos[0]+q[0],pos[1]+q[1],pos[2]+q[2]);
     const val=a&&!b&&pos[d]>=0?a:!a&&b&&pos[d]<dims[d]-1?-b:0;
     if(!val){mask[k++]=0;continue;}
     const outside=[...pos];outside[d]+=val>0?1:0;
     let packed=0,corner=0;
     for(const [su,sv] of [[-1,-1],[1,-1],[1,1],[-1,1]]){
      const sideU=[...outside],sideV=[...outside],diagonal=[...outside];
      sideU[u]+=su;sideV[v]+=sv;diagonal[u]+=su;diagonal[v]+=sv;
      const occupied=p=>{const b=get(...p);return b!==0&&b!==8;};
      const a=occupied(sideU)?1:0,b=occupied(sideV)?1:0,diag=occupied(diagonal)?1:0;
      packed|=(a&&b?0:3-a-b-diag)<<(corner++*2);
     }
     mask[k++]=Math.sign(val)*(Math.abs(val)+(packed<<4));
    }
    for(let j=0;j<dims[v];j++)for(let i=0;i<dims[u];){
     const k=i+j*dims[u],val=mask[k];if(!val){i++;continue;}
     const packed=Math.abs(val)>>4,ao=[0,1,2,3].map(i=>(packed>>(i*2))&3);
     // A nonuniform corner field stays one voxel wide, preserving local creases.
     const uniform=ao.every(v=>v===ao[0]);
     let w=1,h=1;
     if(uniform){
      while(i+w<dims[u]&&mask[k+w]===val)w++;
      outer:while(j+h<dims[v]){for(let b=0;b<w;b++)if(mask[k+b+h*dims[u]]!==val)break outer;h++;}
     }
     const o=[0,0,0],du=[0,0,0],dv=[0,0,0];o[d]=pos[d]+1;o[u]=i;o[v]=j;du[u]=w;dv[v]=h;
     const base=p.length/3,sgn=val>0?1:-1,b=Math.abs(val)&15,shade=d===1?(sgn>0?1:.65):d===0?.88:.78;
     const fx=cx*N+o[0]+(du[0]+dv[0])*.5-(d===0&&sgn>0?.01:0),fz=cz*N+o[2]+(du[2]+dv[2])*.5-(d===2&&sgn>0?.01:0),fy=o[1]+(du[1]+dv[1])*.5-(d===1&&sgn>0?.01:0);
     let tile=atlasTile(b,d,sgn);
     if(b===6){
      tile=13;
      if(fy>height(fx,fz)+1.5){
       tile=8;
       const gx=Math.floor(fx/8),gz=Math.floor(fz/8);
       for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){
        const t=tree(gx+i,gz+j);
        if(t&&t.kind===0&&plant(t,Math.floor(fx),Math.floor(fy),Math.floor(fz))===6)tile=15;
       }
      }
     }
     let corner=0;
     for(const [s,t] of [[0,0],[1,0],[1,1],[0,1]]){
      const xyz=[o[0]+du[0]*s+dv[0]*t+cx*N,o[1]+du[1]*s+dv[1]*t,o[2]+du[2]*s+dv[2]*t+cz*N];
      p.push(...xyz);n.push(d===0?sgn:0,d===1?sgn:0,d===2?sgn:0);
      const occlusion=ao[corner++];
      const brightness=shade*(b===6?.72+occlusion*.0933333333:.46+occlusion*.18);c.push(brightness,brightness,brightness);
      // Vertical faces keep +Y up, including the grass fringe and bark grain.
      uv.push(d===0?xyz[2]:xyz[0],d===1?xyz[2]:xyz[1]);tiles.push(tile);
     }
     const diagonal=ao[0]+ao[2]>ao[1]+ao[3];
     const tri=diagonal?[0,1,3,1,2,3]:[0,1,2,0,2,3];
     for(let t=0;t<6;t+=3)indices.push(base+tri[t],base+tri[t+(sgn>0?1:2)],base+tri[t+(sgn>0?2:1)]);
     quads++;for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++)mask[k+xx+yy*dims[u]]=0;i+=w;
    }
   }
  }
  return {position:new Float32Array(p),normal:new Float32Array(n),color:new Float32Array(c),uv:new Float32Array(uv),tile:new Float32Array(tiles),index:new Uint32Array(indices),quads};
 }
 return {hash,noise,height,tree,block,mesh,generate};
}

export function rng(seed){return ()=>{seed|=0;seed=seed+0x6d2b79f5|0;let t=Math.imul(seed^seed>>>15,1|seed);t^=t+Math.imul(t^t>>>7,61|t);return ((t^t>>>14)>>>0)/4294967296;};}
export function dirtyChunks(x,z){
 const cx=Math.floor(x/16),cz=Math.floor(z/16),lx=(x%16+16)%16,lz=(z%16+16)%16;
 const dx=lx===0?-1:lx===15?1:0,dz=lz===0?-1:lz===15?1:0,a=[[cx,cz]];
 if(dx)a.push([cx+dx,cz]);if(dz)a.push([cx,cz+dz]);
 if(dx&&dz)a.push([cx+dx,cz+dz]);
 return a;
}
export function createGame(seed=731){const k=createVoxelKernel(seed),random=rng(seed),edits=new Map(),creatures=[],drops=[],events=[],p={x:.5,y:19,z:7.5,vy:0,yaw:0,pitch:.1,hp:100,hunger:100,battery:100,stamina:100,ground:false};p.y=k.height(p.x,p.z)+1;
 const clear=(x,z,yaw)=>{
  const y=k.height(x,z)+2.65;
  for(let d=0;d<=6;d+=.1)if(k.block(x-Math.sin(yaw)*d,y,z-Math.cos(yaw)*d))return false;
  for(let bx=Math.floor(x)-5;bx<=x+5;bx++)for(let bz=Math.floor(z)-5;bz<=z+5;bz++){
   if(Math.hypot(bx+.5-x,bz+.5-z)>5)continue;
   for(let by=k.height(bx,bz)+1;by<48;by++)if([5,6].includes(k.block(bx,by,bz)))return false;
  }
  return true;
 };
 if(!clear(p.x,p.z,0)){
  search:for(let radius=1;radius<=6;radius++)for(let x=-radius;x<=radius;x++)for(const z of [-radius,radius]){
   const px=x+.5,pz=z+7.5;if(k.height(px,pz)<14)continue;
   const yaw=Math.atan2(-(1-px),-(-15-pz));
   if(clear(px,pz,yaw)){p.x=px;p.z=pz;p.y=k.height(px,pz)+1;p.yaw=yaw;break search;}
  }
 }
 const g={seed,k,random,p,edits,creatures,drops,events,time:0,day:1,phase:.26,night:false,dead:false,won:false,headlamp:false,spin:0,shotTimer:0,mineTimer:0,placeTimer:0,selected:0,inventory:{wood:3,plank:16,stone:4,dirt:0,sand:0,leaf:0,ore:0,amber:1,torch:0,lantern:0,meat:0,food:0,battery:0},stats:{distance:0,shots:0,hits:0,kills:0,mined:0,placed:0,bites:0,warnings:0,crafted:0,shelterSeconds:0},sheltered:false,changed:[],nextId:1,respawn:0};
 g.block=(x,y,z)=>{x=Math.floor(x);y=Math.floor(y);z=Math.floor(z);const v=edits.get(`${x},${y},${z}`);return v===undefined?k.block(x,y,z):v;};
 g.setBlock=(x,y,z,b)=>{if(y<1||y>=47)return false;edits.set(`${x},${y},${z}`,b);g.changed.push(...dirtyChunks(x,z));return true;};
 g.spawn=(type,x,z)=>{if(creatures.length>=18)return;const e={id:g.nextId++,type,x,z,y:k.height(x,z)+1,hp:type==='rex'?180:type==='grazer'?48:60,maxHp:type==='rex'?180:type==='grazer'?48:60,yaw:0,age:random()*9,warning:0,cool:type==='ptero'?9+random()*9:2+random()*3,flee:0,hit:0,dead:0,anchorX:x,anchorZ:z,dive:false};creatures.push(e);return e;};
 g.spawn('rex',1,-15);g.spawn('rex',-27,-26);
 for(let i=0;i<8;i++)g.spawn('grazer',8+random()*13,-6+random()*15);
 for(let i=0;i<4;i++)g.spawn('ptero',-20+random()*38,-8+random()*32);
 return g;
}
export function rayBlock(g,ox,oy,oz,dx,dy,dz,range=6){let lx=Math.floor(ox),ly=Math.floor(oy),lz=Math.floor(oz);for(let d=0;d<=range;d+=.075){const x=Math.floor(ox+dx*d),y=Math.floor(oy+dy*d),z=Math.floor(oz+dz*d),b=g.block(x,y,z);if(b)return {x,y,z,b,d,nx:lx-x,ny:ly-y,nz:lz-z,px:lx,py:ly,pz:lz};lx=x;ly=y;lz=z;}return null;}
export function direction(p){const c=Math.cos(p.pitch);return [-Math.sin(p.yaw)*c,Math.sin(p.pitch),-Math.cos(p.yaw)*c];}
export function craft(g,i){const r=RECIPES[i];if(!r||g.dead)return false;for(const [key,n] of Object.entries(r.cost))if((g.inventory[key]||0)<n)return false;for(const [key,n] of Object.entries(r.cost))g.inventory[key]-=n;for(const [key,n] of Object.entries(r.give)){if(key==='battery')g.p.battery=Math.min(160,g.p.battery+n);else g.inventory[key]=(g.inventory[key]||0)+n;}g.stats.crafted++;g.events.push({type:'craft',name:r.name});return true;}
export function eat(g){const key=g.inventory.food?'food':g.inventory.meat?'meat':null;if(!key||g.dead)return false;g.inventory[key]--;g.p.hunger=Math.min(100,g.p.hunger+(key==='food'?45:24));g.p.hp=Math.min(100,g.p.hp+(key==='food'?15:5));return true;}
export function shelter(g){const p=g.p,x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z);let roof=false,walls=0;for(let h=2;h<=4;h++)if(g.block(x,y+h,z))roof=true;for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){for(let a=1;a<=2;a++)if(g.block(x+dx*a,y+1,z+dz*a)){walls++;break;}}return roof&&walls>=2;}
// Ground creatures are solid to the player. A dinosaur is long, so its body is a capsule along its heading
// (model extents: rex head +3.65, tail -5.99, half-width 1.32; grazer +2.27, -4.03, .78), not a circle.
// A move is refused only when it ends inside a body AND brings the two closer, so anything already
// overlapping can always separate.
const BODY={rex:{front:2.9,back:-5.2,r:.75,h:3.8},grazer:{front:1.7,back:-3.4,r:.6,h:2.5}};
// Horizontal gap between a point and the body; Infinity when a player standing at height y is above or below it.
export function bodyDistance(e,x,z,y){const b=BODY[e.type];if(y!==undefined&&(y>=e.y+b.h||y+1.8<=e.y))return Infinity;const fx=Math.sin(e.yaw),fz=Math.cos(e.yaw),dx=x-e.x,dz=z-e.z,t=Math.max(b.back,Math.min(b.front,dx*fx+dz*fz));return Math.hypot(dx-fx*t,dz-fz*t)-b.r;}
function crowded(g,x,z){const p=g.p;for(const e of g.creatures){if(!BODY[e.type]||e.dead)continue;const d=bodyDistance(e,x,z,p.y);if(d<.3&&d<bodyDistance(e,p.x,p.z,p.y))return true;}return false;}
// Trunks and player-built blocks stand above the natural surface; hills are not obstacles, creatures climb them.
// Leaves do not stop a dinosaur: with fern clumps every few blocks a rex-sized body would be boxed in, and
// brushing through foliage reads as natural. Trunks and walls do stop it.
function obstacle(g,x,y,z){const b=g.block(x,y,z);return b&&b!==6&&Math.floor(y)>g.k.height(x,z);}
// A creature is a circle on the ground; tree and built cells push it out along the nearest face or corner,
// so it slides round a trunk instead of stopping at it or passing through. Returns the corrected spot.
function pushOut(g,e,x,z){const R=e.type==='rex'?.8:.5,top=e.type==='rex'?3:2,y=g.k.height(x,z)+1;
 for(let pass=0;pass<2;pass++)for(let cx=Math.floor(x-R);cx<=Math.floor(x+R);cx++)for(let cz=Math.floor(z-R);cz<=Math.floor(z+R);cz++){
  let solid=false;for(let h=.5;h<top;h++)if(obstacle(g,cx+.5,y+h,cz+.5)){solid=true;break;}
  if(!solid)continue;
  const px=Math.max(cx,Math.min(x,cx+1)),pz=Math.max(cz,Math.min(z,cz+1)),dx=x-px,dz=z-pz,d=Math.hypot(dx,dz);
  if(d>=R)continue;
  if(d<1e-6){const l=x-cx,r=cx+1-x,b=z-cz,f=cz+1-z,m=Math.min(l,r,b,f);if(m===l)x=cx-R;else if(m===r)x=cx+1+R;else if(m===b)z=cz-R;else z=cz+1+R;}
  else{x=px+dx/d*R;z=pz+dz/d*R;}
 }
 return [x,z];}
function blocked(g,x,y,z){for(const xx of [x-.27,x+.27])for(const zz of [z-.27,z+.27])for(const yy of [y+.001,y+1,y+1.7])if(g.block(xx,yy,zz))return true;return false;}
function damagePlayer(g,n){if(g.dead)return;g.p.hp=Math.max(0,g.p.hp-n);g.stats.bites++;g.events.push({type:'hurt',n});if(g.p.hp<=0){g.dead=true;g.events.push({type:'death'});}}
function shot(g,dx,dy,dz){const p=g.p,wall=rayBlock(g,p.x,p.y+1.62,p.z,dx,dy,dz,55);let best=null,dist=wall?wall.d:55;for(const e of g.creatures){if(e.dead)continue;const ey=e.y+(e.type==='rex'?2.0:e.type==='grazer'?.9:0),vx=e.x-p.x,vy=ey-p.y-1.62,vz=e.z-p.z,t=vx*dx+vy*dy+vz*dz,r=e.type==='rex'?1.65:e.type==='grazer'?1:.95;if(t<0||t>dist)continue;if(vx*vx+vy*vy+vz*vz-t*t<r*r){best=e;dist=t;}}
 g.stats.shots++;g.events.push({type:'shot',x:p.x+dx*dist,y:p.y+1.62+dy*dist,z:p.z+dz*dist,hit:!!best});if(best){best.hp-=12;best.hit=.15;best.flee=5;g.stats.hits++;g.events.push({type:'hit',id:best.id,n:12,x:best.x,y:best.y+2.5,z:best.z});if(best.hp<=0){best.dead=.001;g.stats.kills++;g.drops.push({x:best.x,y:g.k.height(best.x,best.z)+1.3,z:best.z,life:90});if(g.drops.length>24)g.drops.shift();g.events.push({type:'kill',id:best.id});}}}
export function update(g,input,dt){if(!Number.isFinite(dt)||dt<=0)return;dt=Math.min(dt,.05);g.events.length=0;if(g.dead)return;const p=g.p;g.time+=dt;g.phase=(.26+g.time/180)%1;g.day=1+Math.floor(g.time/180);g.night=g.phase>.72||g.phase<.17;if(g.time>=180&&!g.won){g.won=true;g.events.push({type:'survived'});}
 const mx=Math.max(-1,Math.min(1,input.moveX||0)),mz=Math.max(-1,Math.min(1,input.moveZ||0)),norm=Math.max(1,Math.hypot(mx,mz)),sprint=input.sprint&&p.stamina>1&&Math.hypot(mx,mz)>.1,speed=(sprint?6.8:4.1)*(p.y<10?.65:1),vx=(mx*Math.cos(p.yaw)-mz*Math.sin(p.yaw))/norm*speed,vz=(-mx*Math.sin(p.yaw)-mz*Math.cos(p.yaw))/norm*speed;
 p.stamina=Math.max(0,Math.min(100,p.stamina+dt*(sprint?-15:12)));const oldX=p.x,oldZ=p.z;
 for(const axis of ['x','z']){const v=axis==='x'?vx:vz,n=p[axis]+v*dt,tx=axis==='x'?n:p.x,tz=axis==='z'?n:p.z;if(crowded(g,tx,tz))continue;if(!blocked(g,tx,p.y,tz))p[axis]=n;else if(p.ground&&!blocked(g,tx,p.y+1.02,tz)){p[axis]=n;p.y+=1.02;}}
 if(input.jump&&p.ground){p.vy=7.6;p.ground=false;}p.vy-=22*dt;const ny=p.y+p.vy*dt;if(!blocked(g,p.x,ny,p.z)){p.y=ny;p.ground=false;}else{if(p.vy<0){p.y=Math.floor(p.y+.06);p.ground=true;}p.vy=0;}if(p.y<1){p.y=g.k.height(p.x,p.z)+1;p.vy=0;damagePlayer(g,15);}g.stats.distance+=Math.hypot(p.x-oldX,p.z-oldZ);
 p.hunger=Math.max(0,p.hunger-dt*(sprint?.45:.22));if(p.hunger<=0)damagePlayer(g,dt*3);if(g.headlamp){p.battery=Math.max(0,p.battery-dt*.75);if(!p.battery)g.headlamp=false;}
 g.sheltered=shelter(g);if(g.sheltered){g.stats.shelterSeconds+=dt;if(p.hunger>15)p.hp=Math.min(100,p.hp+dt*1.8);}
 const cp=Math.cos(p.pitch),dx=-Math.sin(p.yaw)*cp,dy=Math.sin(p.pitch),dz=-Math.cos(p.yaw)*cp;
 g.spin=Math.max(0,Math.min(1,g.spin+dt*(input.fire?2.2:-3)));g.shotTimer-=dt;if(input.fire&&g.spin>=.82&&g.shotTimer<=0){shot(g,dx,dy,dz);g.shotTimer=.085;}
 g.mineTimer-=dt;if(input.mine&&g.mineTimer<=0){g.mineTimer=.28;const r=rayBlock(g,p.x,p.y+1.62,p.z,dx,dy,dz);if(r&&r.y>0){g.setBlock(r.x,r.y,r.z,0);const key=BLOCKS[r.b][2];g.inventory[key]=(g.inventory[key]||0)+1;g.stats.mined++;g.events.push({type:'mine',x:r.x+.5,y:r.y+.5,z:r.z+.5,b:r.b});}}
 g.placeTimer-=dt;if(input.place&&g.placeTimer<=0){g.placeTimer=.23;const r=rayBlock(g,p.x,p.y+1.62,p.z,dx,dy,dz),b=SLOTS[g.selected],key=BLOCKS[b][2];if(r&&g.inventory[key]>0){const x=r.px,y=r.py,z=r.pz,overlap=Math.abs(x+.5-p.x)<.79&&Math.abs(z+.5-p.z)<.79&&y<p.y+1.8&&y+1>p.y;if(!overlap&&!g.block(x,y,z)&&g.setBlock(x,y,z,b)){g.inventory[key]--;g.stats.placed++;g.events.push({type:'place',x,y,z,b});}}}
 for(const e of g.creatures){e.age+=dt;e.hit=Math.max(0,e.hit-dt);if(e.dead){e.dead+=dt;continue;}const rx=p.x-e.x,rz=p.z-e.z,d=Math.hypot(rx,rz),safe=Math.max(.01,d),oldx=e.x,oldz=e.z;e.cool-=dt;e.flee=Math.max(0,e.flee-dt);
  if(e.type==='rex'){const aggro=d<(g.sheltered?7:g.night?36:25)||input.fire&&d<40;if(aggro){e.yaw=Math.atan2(rx,rz);if(e.warning>0){e.warning-=dt;if(e.warning<=0){if(d<4.8){const vy=p.y+1.2-e.y-1.4,len=Math.hypot(rx,rz,vy),wall=rayBlock(g,e.x,e.y+1.4,e.z,rx/len,vy/len,rz/len,len);if(!wall)damagePlayer(g,g.night?36:29);}e.cool=1.6;}}else if(d<5.7&&e.cool<=0){e.warning=.85;g.stats.warnings++;g.events.push({type:'warning',id:e.id,seconds:.85});}else if(d>4.4){const speed=g.night?4.8:3.3;e.x+=rx/safe*speed*dt;e.z+=rz/safe*speed*dt;}}else{e.x+=Math.sin(e.age*.2+e.id)*dt*.4;e.z+=Math.cos(e.age*.2+e.id)*dt*.4;}}
  else if(e.type==='grazer'){if(d<7||input.fire&&d<25)e.flee=3;const speed=e.flee?5: .6,ang=e.flee?Math.atan2(-rx,-rz):e.age*.2+e.id;e.yaw=ang;e.x+=Math.sin(ang)*speed*dt;e.z+=Math.cos(ang)*speed*dt;}
  else{if(!e.dive&&e.cool<=0&&d<28){e.dive=true;e.warning=1.1;e.diveX=p.x;e.diveZ=p.z;e.diveY=p.y+1;e.fromY=e.y;g.stats.warnings++;g.events.push({type:'warning',id:e.id,seconds:1.1});}if(e.dive){e.warning-=dt;if(e.warning<0){const dx=e.diveX-e.x,dz=e.diveZ-e.z,ds=Math.max(.01,Math.hypot(dx,dz));e.x+=dx/ds*8*dt;e.z+=dz/ds*8*dt;e.y+=(e.diveY-e.y)*dt*5;if(d<2&&Math.abs(e.y-p.y-1)<2){damagePlayer(g,14);e.dive=false;e.cool=12+g.random()*6;}else if(e.warning< -1.3){e.dive=false;e.cool=12+g.random()*6;}}}else{e.x=e.anchorX+Math.sin(e.age*.32)*9;e.z=e.anchorZ+Math.cos(e.age*.32)*9;e.y+=(g.k.height(e.x,e.z)+13-e.y)*dt;}e.yaw=Math.atan2(e.x-oldx,e.z-oldz);}
  if(e.type!=='ptero'){const nx=e.x,nz=e.z,mx=nx-oldx,mz=nz-oldz;e.x=oldx;e.z=oldz;
   e.avoidT=Math.max(0,(e.avoidT||0)-dt);const len=Math.hypot(mx,mz);
   if(len>1e-6){
    let [x,z]=pushOut(g,e,nx,nz);
    // Pushed almost straight back (dead ahead of a trunk, or along a flat face): step sideways instead,
    // and keep to that side for a while so the creature does not shuffle left and right.
    if(((x-oldx)*mx+(z-oldz)*mz)/(len*len)<.25){
     if(!e.avoidT)e.avoid=e.id%2?1:-1;e.avoidT=1.5;
     [x,z]=pushOut(g,e,oldx-mz*e.avoid,oldz+mx*e.avoid);
     if(Math.hypot(x-oldx,z-oldz)<len*.25)e.avoid=-e.avoid;
    }
    // Never step into the player's body.
    const p=g.p,was=bodyDistance(e,p.x,p.z,p.y);e.x=x;e.z=z;
    {const now=bodyDistance(e,p.x,p.z,p.y);if(now<.3&&now<was){e.x=oldx;e.z=oldz;}}
   }
   const target=g.k.height(e.x,e.z)+1;e.y+=(target-e.y)*Math.min(1,dt*12);}if(e.type!=='ptero'&&Math.hypot(e.x-oldx,e.z-oldz)>.00001)e.yaw=Math.atan2(e.x-oldx,e.z-oldz);
  // A dinosaur turns on the spot, and a long tail can swing through where the player stands. After every
  // move and turn, slide the animal away until its body is clear of the player.
  if(BODY[e.type]&&bodyDistance(e,p.x,p.z,p.y)<.3){const b=BODY[e.type],fx=Math.sin(e.yaw),fz=Math.cos(e.yaw),dx=p.x-e.x,dz=p.z-e.z,along=Math.max(b.back,Math.min(b.front,dx*fx+dz*fz));let ax=dx-fx*along,az=dz-fz*along,off=Math.hypot(ax,az);if(off-b.r<.3){const push=.3-(off-b.r);if(off<1e-4){ax=fz;az=-fx;off=1;}[e.x,e.z]=pushOut(g,e,e.x-ax/off*push,e.z-az/off*push);}}
  if(d>72){e.x=p.x+(g.random()-.5)*60;e.z=p.z-30-g.random()*10;e.anchorX=e.x;e.anchorZ=e.z;}
 }
 for(let i=g.creatures.length-1;i>=0;i--)if(g.creatures[i].dead>1.4)g.creatures.splice(i,1);
 g.respawn+=dt;if(g.respawn>12){g.respawn=0;const rex=g.creatures.filter(e=>e.type==='rex'&&!e.dead).length;if(g.night){for(let n=rex;n<3;n++){const a=g.random()*Math.PI*2,r=16+g.random()*9;g.spawn('rex',p.x+Math.sin(a)*r,p.z+Math.cos(a)*r);}}else if(rex<2)g.spawn('rex',p.x+(g.random()-.5)*32,p.z-28-g.random()*8);if(g.creatures.length<14)g.spawn('grazer',p.x+15,p.z-15);}
 for(let i=g.drops.length-1;i>=0;i--){const d=g.drops[i];d.life-=dt;if(Math.hypot(d.x-p.x,d.z-p.z)<3){g.inventory.meat+=2;g.events.push({type:'pickup'});g.drops.splice(i,1);}else if(d.life<=0)g.drops.splice(i,1);}
}

export function snapshot(g){return {seed:g.seed,time:+g.time.toFixed(2),day:g.day,night:g.night,dead:g.dead,won:g.won,player:{x:+g.p.x.toFixed(2),y:+g.p.y.toFixed(2),z:+g.p.z.toFixed(2),yaw:g.p.yaw,pitch:g.p.pitch,hp:+g.p.hp.toFixed(1),hunger:+g.p.hunger.toFixed(1),battery:+g.p.battery.toFixed(1)},spin:g.spin,headlamp:g.headlamp,sheltered:g.sheltered,inventory:{...g.inventory},stats:{...g.stats},creatures:g.creatures.map(e=>({id:e.id,type:e.type,x:e.x,y:e.y,z:e.z,hp:e.hp,warning:e.warning,dead:e.dead,dive:e.dive,flee:e.flee})),drops:g.drops.length,edits:g.edits.size};}

export class Quality {
 constructor(){this.level=0;this.slow=0;this.fast=0;this.cool=0;}
 sample(ms,dt=1/60,budget=18){this.cool=Math.max(0,this.cool-dt);this.slow=ms>budget?this.slow+1:Math.max(0,this.slow-2);this.fast=ms<budget*.99?this.fast+1:Math.max(0,this.fast-12);if(!this.cool&&this.slow>=45&&this.level<3){this.level++;this.slow=0;this.fast=0;this.cool=3;return true;}if(!this.cool&&this.fast>=240&&this.level>0){this.level--;this.fast=0;this.cool=3;return true;}return false;}
 get scale(){return [1,.85,.7,.55][this.level];}
}
