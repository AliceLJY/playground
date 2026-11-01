// 花城秋岸 — metres at miniature scale, +Y up, river to -Z.
// Reuses snowline-cabin's seeded generation, projection and auto/manual rig structure.
// Geometry descriptors here are consumed by main.js and tested without Three.js.
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const mix = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
export const smooth = t => t * t * (3 - 2 * t);
export const dist = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
export const mulberry32 = seed => () => { let t = seed += 0x6d2b79f5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
export const SEED = 20261101, LOOP_S = 40, IDLE_S = 4.5, RETURN_S = 3;
export const COLORS = ['#D6246E', '#F07A2A', '#F2B833', '#DA94B3'];
export const BASE = { width: 44, depth: 33, radius: 2, top: 0, bottom: -1.6 };
export const BRIDGE = { x: -5.5, z0: -7, z1: 10.5, width: 2.6, top: 5.6, bottom: 5.15, railTop: 6.6 };
export const PAGODA = { x: 11.8, z: -6, base: 2.5, radius: 2.15, floorH: 1.65, floors: 9 };
export const CANTON = { x: -33, z: -43, base: -0.8, height: 33, antenna: 9, twist: Math.PI * 0.72 };
export const TRAM = { z: 0, floor: 0.65, height: 2.35, width: 2.65, carLength: 3.8, gap: 0.25, cars: 4, roofTop: 3.92, wheelBottom: 0.26, noseOverhang: 0.18, sideOverhang: 0.065, clipX: 21.3 };
export const box = (id, center, size) => ({ id, center, size, min: center.map((v,i)=>v-size[i]/2), max: center.map((v,i)=>v+size[i]/2) });
export const bounds = (points, pad = 0) => ({ min: [0,1,2].map(i=>Math.min(...points.map(p=>p[i]))-pad), max: [0,1,2].map(i=>Math.max(...points.map(p=>p[i]))+pad) });
export const distanceBox = (p,b) => Math.hypot(...p.map((v,i)=>Math.max(b.min[i]-v, v-b.max[i], 0)));
export const boxCorners = b => [b.min[0],b.max[0]].flatMap(x=>[b.min[1],b.max[1]].flatMap(y=>[b.min[2],b.max[2]].map(z=>[x,y,z])));
export function insideBase(x,z) { const qx=Math.max(Math.abs(x)-(BASE.width/2-BASE.radius),0), qz=Math.max(Math.abs(z)-(BASE.depth/2-BASE.radius),0); return Math.hypot(qx,qz)<=BASE.radius; }
const beam = (a,b,width=0.06) => ({ a,b,width });
export function makeLayout(seed=SEED, mobile=false) {
  const rnd=mulberry32(seed), R=(a,b)=>lerp(a,b,rnd());
  const surfaces=[
    box('base',[0,-0.8,0],[44,1.6,33]),
    box('road',[0,0.1,6],[42.4,0.2,7]),
    box('track-grass',[0,0.15,0],[42.4,0.3,3.7]),
    box('front-walk',[0,0.2,12.5],[40.8,0.4,4.6]),
    box('promenade',[0,0.2,-6.1],[42,0.4,7.4]),
    box('bridge',[-5.5,5.375,1.75],[2.6,0.45,17.5]),
    box('station',[1.1,0.275,-2.4],[13.6,0.55,1.2]),
  ];
  const steps=[], piers=[], rails=[], clusters=[];
  for(const z of [-6,2,9.5]) piers.push(box('pier',[-5.5,2.65,z],[0.65,5,0.65]));
  const stairCount=24;
  for(const z of [BRIDGE.z0,BRIDGE.z1]) {
    for(let i=0;i<stairCount;i++) { const top=BRIDGE.top-(i+1)*(BRIDGE.top-0.4)/stairCount; steps.push(box('stair',[-3.98+i*0.28,top/2,z],[0.28,top,2.5])); }
    for(const s of [-1,1]) {
      for(let i=0;i<=stairCount;i+=4) {const x=-4.12+i*0.28, y=BRIDGE.top-i*(BRIDGE.top-0.4)/stairCount; rails.push(beam([x,y,z+s*1.2],[x,y+1,z+s*1.2],0.045));}
      rails.push(beam([-4.12,6.6,z+s*1.2],[2.6,1.4,z+s*1.2],0.05));
    }
  }
  for(const side of [-1,1]) {
    const x=BRIDGE.x+side*1.24;
    rails.push(beam([x,6.6,BRIDGE.z0],[x,6.6,BRIDGE.z1],0.05));
    rails.push(beam([x,5.9,BRIDGE.z0],[x,5.9,BRIDGE.z1],0.045));
    for(let z=BRIDGE.z0;z<=BRIDGE.z1;z+=1.2) rails.push(beam([x,5.6,z],[x,6.6,z],0.04));
    for(let j=0;j<35;j++) {
      const z=BRIDGE.z0+0.25+j*0.5, depth=R(1.65,Math.abs(z)<2?2.35:3.0), color=(Math.floor(j/4)+ (side===1?1:0))%4;
      clusters.push({ side, segment:j, center:[x+side*0.18,6.45,z], depth, radius:R(.72,.95), color });
    }
  }
  // Flowers continue along the stair rails and climb the piers.
  for(const z of [BRIDGE.z0,BRIDGE.z1]) for(const side of [-1,1]) for(let i=0;i<13;i++) clusters.push({side,segment:null,center:[-4+i*0.52,6.45-i*0.402,z+side*1.28],depth:R(.95,1.8),radius:.72,color:i%4});
  for(const p of piers) for(let j=0;j<5;j++) clusters.push({side:1,segment:null,center:[p.center[0]+0.4,1+j*0.85,p.center[2]],depth:0.6,radius:0.32,color:j%4});
  // Full spirals show flowers on every pier face, including the hero-facing face.
  for(const p of piers)for(let j=0;j<15;j++){
    const a=j*.92;clusters.push({side:1,segment:null,center:[p.center[0]+Math.cos(a)*.43,.7+j*.29,p.center[2]+Math.sin(a)*.43],depth:.55,radius:.32,color:Math.floor(j/3)%4});
  }
  const bracts=[];
  clusters.forEach((c,ci)=>{
    const n=mobile?400:900;
    for(let i=0;i<n;i++) {
      const a=R(0,Math.PI*2), k=R(0,1), rad=c.radius*Math.sqrt(rnd())*(1-0.55*k);
      bracts.push({cluster:ci,color:c.color,shade:R(0.72,1.22),p:[c.center[0]+Math.cos(a)*rad,c.center[1]-k*c.depth+R(-0.1,0.15),c.center[2]+Math.sin(a)*rad],rot:[R(0,6.28),R(0,6.28),R(0,6.28)],scale:R(.12,.19)});
    }
  });
  const treeSpecs=[
    [-18,12.8,0.4,'banyan'],[-10,13.5,0.4,'banyan'],[7.5,13.8,0.4,'banyan'],[17.7,11.8,0.4,'banyan'],
    [-17,-5.8,0.4,'banyan'],[-11.8,-8,0.4,'banyan'],[2,-7.6,0.4,'banyan'],[19,-6,0.4,'banyan'],
    [-20,-3,0.4,'palm'],[19,-11.5,0.4,'palm'],[-2,-8.4,0.4,'palm'],
    [7.4,-8.7,1.5,'silk'],[17.3,-8.6,1.5,'silk'],[13.8,-11.7,1,'silk'],[16,-2.6,0.7,'silk']
  ];
  const trees=treeSpecs.map(([x,z,y,kind],id)=>{
    const h=kind==='palm'?R(5,6.2):kind==='silk'?R(4.7,5.5):R(3.8,4.8), leaves=[], flowers=[], branches=[];
    const root=[x,y,z], crown=[x,y+h,z];
    const leafCount=kind==='silk'?(mobile?110:190):(mobile?2400:5200);
    const tips=[];
    if(kind==='palm') {
      // Ten curved rachises, each with paired pinnae pointing down and out.
      for(let j=0;j<10;j++) {
        const a=j*Math.PI*2/10+R(-.12,.12),len=R(2.1,2.65),rise=R(.65,1.05);
        const point=u=>[x+Math.cos(a)*len*u+.22,y+h+rise*Math.sin(Math.PI*u)-.95*u*u,z+Math.sin(a)*len*u];
        let prev=point(0);
        for(let k=1;k<=12;k++){const q=point(k/12);branches.push(beam(prev,q,.032*(1-k/18)));prev=q;}
        for(let k=1;k<=28;k++)for(const side of [-1,1]){
          const u=k/30,q=point(u),length=(.22+.6*Math.sin(Math.PI*u))*(mobile?.9:1);
          leaves.push({p:[q[0]+side*.035*Math.sin(a),q[1],q[2]-side*.035*Math.cos(a)],rot:[.7,Math.PI/2-a+side*.9,side*.7],scale:[.065,length,1],shade:.25+.55*u});
        }
      }
    } else {
      for(let j=0;j<7;j++) {
        const a=j*2.399+R(-.2,.2),r=R(1.1,2.1),fork=[x+Math.cos(a)*.6,y+h*.63,z+Math.sin(a)*.6],tip=[x+Math.cos(a)*r,y+h+R(-.55,.55),z+Math.sin(a)*r];
        branches.push({...beam([x,y+h*.36,z],fork,.13),taper:.6});branches.push({...beam(fork,tip,.085),taper:.38});tips.push(tip);
      }
      for(let j=0;j<leafCount;j++) {
        const tip=tips[j%tips.length],a=R(0,6.28),rad=Math.cbrt(rnd())*.95,vy=R(-.65,.65);
        leaves.push({normal:[Math.cos(a)*rad,vy*1.5,Math.sin(a)*rad],p:[tip[0]+Math.cos(a)*rad,tip[1]+vy,tip[2]+Math.sin(a)*rad],rot:[R(-1.2,1.2),R(0,6.28),R(-1.5,1.5)],scale:[R(.095,.15),R(.15,.23),1],shade:clamp(.12+.5*rad/.95+.25*vy/.65+R(-.15,.15),0,1)});
      }
    }
    if(kind==='silk') for(let j=0;j<(mobile?210:240);j++) {
      const tip=tips[j%tips.length],a=R(0,6.28),r=Math.sqrt(rnd())*1.12;
      flowers.push({p:[tip[0]+Math.cos(a)*r,tip[1]+R(-0.55,0.65),tip[2]+Math.sin(a)*r],rot:[R(-1.2,1.2),R(0,6.28),R(0,6.28)],size:R(.09,.14),shade:R(0.7,1.15)});
    }
    return {id,kind,root,h,branches,leaves,flowers,crownBox:bounds([...leaves,...flowers].map(a=>a.p),kind==='palm'?0.9:0.6)};
  });
  const levels=Array.from({length:9},(_,i)=>{
    const radius=PAGODA.radius-i*0.108, bottom=PAGODA.base+i*PAGODA.floorH;
    return {radius,bottom,top:bottom+PAGODA.floorH,windows:Array.from({length:8},(_,side)=>{
      const a=(side+0.5)*Math.PI/4, r=radius*Math.cos(Math.PI/8)+0.055;
      const dusk=[[0,2,5],[0,3,6],[1,3,5],[0,4],[2],[5],[],[3],[]];
      const extra=[[1,6],[2,5],[0,6],[2,6],[0,5],[1,3],[0,4],[6],[2]];
      const onAt=dusk[i].includes(side)?.38+.035*((i+side)%4):extra[i].includes(side)?.72+.035*((i+side)%4):2;
      const aboveDoor=i===0&&side===0;return {p:[PAGODA.x+Math.sin(a)*r,bottom+(aboveDoor?1.3:0.77),PAGODA.z+Math.cos(a)*r],angle:a,onAt,lit:onAt<.55,w:aboveDoor?0.28:0.38,h:aboveDoor?0.3:0.78};
    })};
  });
  const lamps=[];for(let x=-19;x<=20;x+=4.8) for(const z of [-9.1,14.7]) lamps.push([x,0.4,z]);
  const pagodaBox=box('pagoda',[PAGODA.x,10.85,PAGODA.z],[5.2,17.1,5.2]);
  const cantonBox=box('canton',[CANTON.x,CANTON.base+(CANTON.height+CANTON.antenna)/2,CANTON.z],[7,42,7]);
  const cantonBase=box('canton-bank',[CANTON.x,-1.325,-48],[10,1.05,18]);
  const waterSurface=box('board-water',[0,0.1,-13.15],[44,0,6.7]);
  const obstacles=[...surfaces.filter(s=>s.id==='bridge'),...piers,...steps,...trees.map(t=>({...t.crownBox,id:'tree-'+t.id})),pagodaBox,
    box('tram-range',[0,1.95,0],[BASE.width,3.7,2.8]),
    ...[-1,1].map(s=>box('bridge-rail',[BRIDGE.x+s*1.3,6.1,1.75],[0.16,1.1,17.5]))];
  return {cantonBase,waterSurface,surfaces,steps,piers,rails,clusters,bracts,trees,levels,lamps,obstacles,pagodaBox,cantonBox,baseBox:box('base',[0,-0.8,0],[44,1.6,33])};
}
// The 24 main columns connect corresponding points on two relatively twisted ellipses.
export function cantonPoint(a,t) {
  const bx=Math.cos(a)*3.3,bz=Math.sin(a)*2.6,ta=a+CANTON.twist;
  return [CANTON.x+lerp(bx,Math.cos(ta)*2.85,t),CANTON.base+CANTON.height*t,CANTON.z+lerp(bz,Math.sin(ta)*2.35,t)];
}
export function cantonStructure() {
  const columns=Array.from({length:24},(_,i)=>beam(cantonPoint(i*Math.PI/12,0),cantonPoint(i*Math.PI/12,1),0.09));
  const rings=Array.from({length:46},(_,i)=>Array.from({length:49},(_,j)=>cantonPoint(j/48*Math.PI*2,i/45)));
  const braces=[];for(let j=0;j<15;j++) for(let i=0;i<24;i++) braces.push(beam(cantonPoint(i*Math.PI/12,j/15),cantonPoint((i+1)*Math.PI/12,(j+1)/15),0.035));
  return {columns,rings,braces};
}
// A station pause in each direction. Cars run past the board edge and are actually clipped in the shader.
export const TRAM_PERIOD=64;
export function tramAt(t) {
  let q=((t%64)+64)%64, dir=q<32?1:-1; q%=32;
  let x,stopped=false;
  if(q<12)x=lerp(-31,-1.5,smooth(q/12));
  else if(q<17){x=-1.5;stopped=true;}
  else if(q<30)x=lerp(-1.5,31,smooth((q-17)/13)); else{x=31;stopped=true;}
  x*=dir;
  const length=TRAM.cars*TRAM.carLength+(TRAM.cars-1)*TRAM.gap+2*TRAM.noseOverhang;
  const raw=box('tram',[x,(TRAM.wheelBottom+TRAM.roofTop)/2,TRAM.z],[length,TRAM.roofTop-TRAM.wheelBottom,TRAM.width+2*TRAM.sideOverhang]);
  const clipped={min:[Math.max(raw.min[0],-TRAM.clipX),...raw.min.slice(1)],max:[Math.min(raw.max[0],TRAM.clipX),...raw.max.slice(1)]};
  return {x,dir,stopped,cars:Array.from({length:4},(_,i)=>x+(i-1.5)*(TRAM.carLength+TRAM.gap)),raw,clipped,visible:clipped.min[0]<clipped.max[0]};
}
// Closed Catmull-Rom curve, reparameterised by a dense arc-length table. Prevents fast bulges between keys.
export const PATH_KEYS=[
  {name:'hero',pos:[35,32,49],target:[0,7,-3]},
  {name:'approach',pos:[-10,16,23],target:[-4,3,0]},
  {name:'bridge',pos:[-13.5,9.2,8],target:[-3.5,3.2,0]},
  {name:'front',pos:[5,12,9],target:[4,7,-4]},
  {name:'pagoda',pos:[13,20,28],target:[12,15,-8]},
  {name:'rise',pos:[22,29,34],target:[2,6,-7]},
  {name:'wide',pos:[29,43,53],target:[0,7,-7]},
];
const cr=(a,b,c,d,t)=>0.5*(2*b+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);
function rawPath(u) { const n=PATH_KEYS.length,s=((u%1+1)%1)*n,i=Math.floor(s),t=s-i,K=j=>PATH_KEYS[(i+j+n)%n], at=f=>[0,1,2].map(a=>cr(K(-1)[f][a],K(0)[f][a],K(1)[f][a],K(2)[f][a],t));return{pos:at('pos'),target:at('target')}; }
const ARC=[0];for(let i=1;i<=4096;i++)ARC.push(ARC[i-1]+dist(rawPath((i-1)/4096).pos,rawPath(i/4096).pos));
export const PATH_LENGTH=ARC.at(-1);
export const VIEWS=Object.fromEntries(PATH_KEYS.map((k,i)=>[k.name,lerp(ARC[Math.floor(i/7*4096)],ARC[Math.ceil(i/7*4096)],i/7*4096%1)/PATH_LENGTH]).filter(([k])=>['hero','bridge','pagoda','wide'].includes(k)));
export function pathAt(u) { const d=((u%1+1)%1)*PATH_LENGTH;let lo=0,hi=4096;while(hi-lo>1){const m=(lo+hi)>>1;if(ARC[m]<=d)lo=m;else hi=m;}return rawPath((lo+(d-ARC[lo])/(ARC[hi]-ARC[lo]))/4096); }
export const fovFor=aspect=>aspect<0.8?90:56;
export const shiftFor=aspect=>aspect<0.8?[0,0.44]:[0.38,0];
export function project(p,cam,target,aspect) {
  const f=target.map((v,i)=>v-cam[i]),len=Math.hypot(...f),fw=f.map(v=>v/len),rl=Math.hypot(fw[2],fw[0]),r=[-fw[2]/rl,0,fw[0]/rl],up=[-r[2]*fw[1],r[2]*fw[0]-r[0]*fw[2],r[0]*fw[1]],d=p.map((v,i)=>v-cam[i]),dot=v=>v.reduce((s,x,i)=>s+x*d[i],0),z=dot(fw),t=Math.tan(fovFor(aspect)*Math.PI/360),sh=shiftFor(aspect);
  return {x:dot(r)/(z*t*aspect)+sh[0],y:dot(up)/(z*t)+sh[1],z};
}
export function screenBox(b,cam,target,aspect){const ps=boxCorners(b).map(p=>project(p,cam,target,aspect));return{x0:(Math.min(...ps.map(p=>p.x))+1)/2,x1:(Math.max(...ps.map(p=>p.x))+1)/2,y0:(1-Math.max(...ps.map(p=>p.y)))/2,y1:(1-Math.min(...ps.map(p=>p.y)))/2,front:ps.every(p=>p.z>0)};}
const spherical=(p,t)=>{const d=p.map((v,i)=>v-t[i]),r=Math.hypot(...d);return{r,az:Math.atan2(d[0],d[2]),el:Math.asin(clamp(d[1]/r,-1,1))};};
const cartesian=(s,t)=>[t[0]+s.r*Math.cos(s.el)*Math.sin(s.az),t[1]+s.r*Math.sin(s.el),t[2]+s.r*Math.cos(s.el)*Math.cos(s.az)];
export function createRig({u=0,auto=true}={}) {
  const r={u,auto,mode:auto?'auto':'manual',idle:0,held:false,pos:pathAt(u).pos,look:pathAt(u).target};let sph=spherical(r.pos,r.look),returnFrom=null,returnTo=null,k=0;
  r.grab=()=>{sph=spherical(r.pos,r.look);r.mode='manual';r.idle=0;};
  // Keep manual zoom within 32 m of the route: a 3 s smoothstep return then stays below 0.3 m/frame.
  // This still permits a full orbit; far-side zoom-out stops earlier than the open river side.
  const constrain=()=>{let nearest=null,best=Infinity;for(let i=0;i<800;i++){const p=pathAt(i/800).pos,d=dist(p,r.pos);if(d<best){best=d;nearest=p;}}if(best>32)r.pos=mix(nearest,r.pos,32/best);sph=spherical(r.pos,r.look);};
  r.drag=(az,el)=>{if(r.mode!=='manual')r.grab();r.idle=0;sph.az-=az;sph.el=clamp(sph.el+el,0.12,1.35);r.pos=cartesian(sph,r.look);constrain();};
  r.zoom=f=>{if(r.mode!=='manual')r.grab();r.idle=0;sph.r=clamp(sph.r*f,10,95);r.pos=cartesian(sph,r.look);constrain();};
  r.setAuto=on=>{r.grab();r.auto=on;};
  r.reset=()=>{r.u=0;r.pos=pathAt(0).pos;r.look=pathAt(0).target;r.auto=true;r.mode='auto';r.idle=0;};
  r.update=dt=>{
    if(r.mode==='auto'){r.u=(r.u+dt/LOOP_S)%1;const p=pathAt(r.u);r.pos=p.pos;r.look=p.target;}
    else if(r.mode==='manual') {if(!r.held)r.idle+=dt;if(r.auto&&r.idle>=IDLE_S){
      // Rejoin the nearest point, not the stale point from before a long manual orbit.
      let best=Infinity;for(let i=0;i<1600;i++){const p=pathAt(i/1600),d=dist(p.pos,r.pos);if(d<best){best=d;r.u=i/1600;}}
      returnFrom={pos:r.pos.slice(),target:r.look.slice()};returnTo=pathAt(r.u);k=0;r.mode='return';
    }} else {k=Math.min(1,k+dt/RETURN_S);r.pos=mix(returnFrom.pos,returnTo.pos,smooth(k));r.look=mix(returnFrom.target,returnTo.target,smooth(k));if(k>=1-1e-9){r.mode='auto';r.pos=returnTo.pos;r.look=returnTo.target;}}
    return {pos:r.pos.slice(),target:r.look.slice()};
  };return r;
}
// Linear RGB light/sky values; material HEX colours are converted by Three.js.
const HOURS=[
 {low:[.80,.75,.68],mid:[.76,.71,.65],top:[.73,.72,.70],key:[1,.94,.84],keyInt:3.1,hemi:1.35,lights:0,sunY:.8},
 {low:[.59,.37,.18],mid:[.35,.32,.27],top:[.25,.28,.30],key:[1,.68,.33],keyInt:2.3,hemi:1.05,lights:.62,sunY:.32},
 {low:[.014,.022,.055],mid:[.008,.015,.042],top:[.003,.006,.019],key:[.38,.52,.9],keyInt:.32,hemi:.38,lights:1,sunY:.08}
];
export function skyAt(h){h=clamp(h,0,1);const i=h<=0.55?0:1,k=smooth(i===0?h/0.55:(h-0.55)/0.45),a=HOURS[i],b=HOURS[i+1];return Object.fromEntries(Object.keys(a).map(f=>[f,Array.isArray(a[f])?mix(a[f],b[f],k):lerp(a[f],b[f],k)]));}
