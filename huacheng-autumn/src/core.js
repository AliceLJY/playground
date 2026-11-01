// 花城秋岸 — metres at miniature scale, +Y up, river to -Z.
// Reuses snowline-cabin's seeded generation, projection and auto/manual rig structure.
// Geometry descriptors here are consumed by main.js and tested without Three.js.
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const mix = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
export const smooth = t => t * t * (3 - 2 * t);
export const dist = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
export const mulberry32 = seed => () => { let t = seed += 0x6d2b79f5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
export const SEED = 20261101, LOOP_S = 60, IDLE_S = 4.5, RETURN_S = 3;
export const COLORS = ['#D6246E', '#F07A2A', '#F2B833', '#DA94B3'];
export const BASE = { width: 120, depth: 40, radius: 2, top: 0, bottom: -1.6 };
export const BRIDGE = { x: -5.5, z0: -7, z1: 10.5, width: 3.8, top: 5.6, bottom: 5.15, railTop: 6.6 };
export const PAGODA = { x: 43.8, z: -6, base: 2.5, radius: 2.15, floorH: 1.65, floors: 9 };
export const CANTON = { x: -67, z: -6, base: 0.4, height: 33, antenna: 9, twist: Math.PI * 0.72 };
export const TRAM = { z: 0, floor: 0.65, height: 2.35, width: 2.65, carLength: 3.8, gap: 0.25, cars: 4, roofTop: 3.92, wheelBottom: 0.26, noseOverhang: 0.18, sideOverhang: 0.065 };
export const box = (id, center, size) => ({ id, center, size, min: center.map((v,i)=>v-size[i]/2), max: center.map((v,i)=>v+size[i]/2) });
export const bounds = (points, pad = 0) => ({ min: [0,1,2].map(i=>Math.min(...points.map(p=>p[i]))-pad), max: [0,1,2].map(i=>Math.max(...points.map(p=>p[i]))+pad) });
export const distanceBox = (p,b) => Math.hypot(...p.map((v,i)=>Math.max(b.min[i]-v, v-b.max[i], 0)));
export const boxCorners = b => [b.min[0],b.max[0]].flatMap(x=>[b.min[1],b.max[1]].flatMap(y=>[b.min[2],b.max[2]].map(z=>[x,y,z])));
export function insideBase(x,z) { const qx=Math.max(Math.abs(x)-(BASE.width/2-BASE.radius),0), qz=Math.max(Math.abs(z)-(BASE.depth/2-BASE.radius),0); return Math.hypot(qx,qz)<=BASE.radius; }
const beam = (a,b,width=0.06) => ({ a,b,width });
export function makeLayout(seed=SEED, mobile=false) {
  const rnd=mulberry32(seed), R=(a,b)=>lerp(a,b,rnd());
  // Real bougainvillea runs magenta-heavy and mixes within a cascade; banding colours by segment read as a rainbow.
  const BRACT_WEIGHTS=[.45,.2,.15,.2], pickBract=()=>{let u=rnd();for(let i=0;i<3;i++){if((u-=BRACT_WEIGHTS[i])<0)return i;}return 3;};
  const surfaces=[
    box('base',[0,-0.8,0],[BASE.width,1.6,BASE.depth]),
    box('road',[0,0.1,6],[104,0.2,7]),
    box('track-grass',[0,0.15,0],[114,0.3,3.7]),
    box('front-walk',[0,0.2,12.5],[114,0.4,4.6]),
    box('promenade',[0,0.2,-7.9],[114,0.4,11]),
    box('bridge',[-5.5,5.375,1.75],[BRIDGE.width,0.45,17.5]),
    box('station-east',[45,0.275,-2.65],[18,0.55,1.5]),
    box('station-west',[-45,0.275,-2.65],[18,0.55,1.5]),
  ];
  const steps=[], piers=[], rails=[], clusters=[];
  for(const z of [-6,2,9.5]) piers.push(box('pier',[-5.5,2.65,z],[0.65,5,0.65]));
  const stairCount=24;
  for(const z of [BRIDGE.z0,BRIDGE.z1]) {
    for(let i=0;i<stairCount;i++) { const top=BRIDGE.top-(i+1)*(BRIDGE.top-0.4)/stairCount; steps.push(box('stair',[BRIDGE.x+BRIDGE.width/2+.14+i*.28,top/2,z],[.28,top,3.4])); }
    for(const s of [-1,1]) {
      for(let i=0;i<=stairCount;i+=4) {const x=BRIDGE.x+BRIDGE.width/2+i*.28, y=BRIDGE.top-i*(BRIDGE.top-0.4)/stairCount; rails.push(beam([x,y,z+s*1.65],[x,y+1,z+s*1.65],0.045));}
      rails.push(beam([BRIDGE.x+BRIDGE.width/2,6.6,z+s*1.65],[BRIDGE.x+BRIDGE.width/2+6.72,1.4,z+s*1.65],0.05));
    }
  }
  for(const side of [-1,1]) {
    const x=BRIDGE.x+side*(BRIDGE.width/2-.06);
    rails.push(beam([x,6.6,BRIDGE.z0],[x,6.6,BRIDGE.z1],0.05));
    rails.push(beam([x,5.9,BRIDGE.z0],[x,5.9,BRIDGE.z1],0.045));
    for(let z=BRIDGE.z0;z<=BRIDGE.z1;z+=1.2) rails.push(beam([x,5.6,z],[x,6.6,z],0.04));
    for(let j=0;j<35;j++) {
      const z=BRIDGE.z0+0.25+j*0.5, depth=R(1.4,2.0), color=pickBract();
      clusters.push({ side, segment:j, center:[x+side*.06,6.45,z], depth, radius:R(.72,1.02), color, sparse:j%7===3 });
    }
  }
  // A narrow curtain OUTSIDE each stair rail; no flowers over the treads or round the piers.
  for(const z of [BRIDGE.z0,BRIDGE.z1])for(const side of [-1,1])for(let i=0;i<9;i++){
    const x=BRIDGE.x+BRIDGE.width/2+.25+i*.55,top=BRIDGE.top-(x-(BRIDGE.x+BRIDGE.width/2))*(5.2/6.72);
    clusters.push({side,segment:null,stair:true,center:[x,top+.35,z+side*1.72],depth:Math.min(R(1,1.5),top-.5),radius:R(.50,.64),color:pickBract(),sparse:i%4===2});
  }
  // Exterior curtains only: keep the deck, stair treads, handrails and all pier faces free.
  const bracts=[];
  clusters.forEach((c,ci)=>{
    const n=(mobile?500:1050)*(c.sparse?.35:1);
    for(let i=0;i<n;i++) {
      const a=R(-Math.PI/2,Math.PI/2), k=R(0,1), rad=c.radius*R(.78,1)*(1-.55*k);
      bracts.push({cluster:ci,color:rnd()<.6?c.color:pickBract(),shade:R(.72,1.22),p:c.stair?[c.center[0]+Math.sin(a)*rad,c.center[1]-k*c.depth+R(-.04,.06),c.center[2]+c.side*(.04+Math.abs(Math.cos(a))*rad)]:[c.center[0]+c.side*(.04+Math.abs(Math.cos(a))*rad),c.center[1]-k*c.depth+R(-.04,.06),c.center[2]+Math.sin(a)*rad],rot:[R(0,6.28),R(0,6.28),R(0,6.28)],scale:R(.072,.114)});
    }
  });
  const treeSpecs=[
    [-18,12.8,0.4,'banyan'],[-10,13.5,0.4,'banyan'],[7.5,13.8,0.4,'banyan'],[17.7,11.8,0.4,'banyan'],
    [-17,-5.8,0.4,'banyan'],[-11.8,-6,0.4,'banyan'],
    [-20,-3,0.4,'palm'],[32,13.8,0.4,'palm'],[-2,-8.4,0.4,'palm'],
    [39.4,-8.7,1.5,'silk'],[49.3,-8.6,1.5,'silk'],[45.8,-11.7,1,'silk'],[48,-2.6,0.7,'silk'],
    [-48,13.5,.4,'banyan'],[-36,13.8,.4,'banyan'],[34,13.8,.4,'banyan'],[48,14,.4,'banyan'],[-34,-8,.4,'banyan'],[8,-4,.4,'banyan']
  ];
  const trees=treeSpecs.map(([x,z,y,kind],id)=>{
    const h=kind==='palm'?R(5,6.2):kind==='silk'?R(4.7,5.5):R(3.8,4.8), leaves=[], flowers=[], branches=[];
    const root=[x,y,z], crown=[x,y+h,z];
    const leafCount=kind==='silk'?(mobile?350:420):(mobile?2400:4200);
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
    if(kind==='silk') for(let j=0;j<(mobile?750:980);j++) {
      const tip=tips[j%tips.length],a=R(0,6.28),r=Math.sqrt(rnd())*1.12;
      flowers.push({p:[tip[0]+Math.cos(a)*r,tip[1]+R(-0.55,0.65),tip[2]+Math.sin(a)*r],rot:[R(-1.2,1.2),R(0,6.28),R(0,6.28)],size:R(.054,.084),shade:R(0.7,1.15)});
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
  const lamps=[];for(let x=-55;x<=56;x+=7.5) for(const z of [-12.8,14.7]) if(!(z<0&&x>22&&x<35))lamps.push([x,0.4,z]);
  const pagodaBox=box('pagoda',[PAGODA.x,10.85,PAGODA.z],[5.2,17.1,5.2]);
  const cantonBox=box('canton',[CANTON.x,CANTON.base+(CANTON.height+CANTON.antenna)/2,CANTON.z],[7,42,7]);
  const cantonBase=box('canton-bank',[CANTON.x,.2,CANTON.z],[13,.4,15]);
  const waterSurface=box('board-water',[0,0.1,-16.85],[120,0,6.3]);
  const archObstacles=[box('arch-left',[15,3.2,-14.5],[1,6.4,1]),box('arch-right',[15,3.2,-7.5],[1,6.4,1]),box('arch-crown',[15,8,-11],[1,4.5,8])];
  const obstacles=[...surfaces.filter(s=>s.id==='bridge'),...piers,...steps,...archObstacles,...lamps.map((p,i)=>box('lamp-'+i,[p[0],2.2,p[2]],[.4,4,.4])),box('west-roof',[-45,5,-1.4],[20,1,6.2]),box('east-vault',[45,4,0],[18,2,5.2]),...trees.map(t=>({...t.crownBox,id:'tree-'+t.id})),pagodaBox,
    box('tram-range',[0,1.95,0],[BASE.width,3.7,2.8]),
    ...[-1,1].map(s=>box('bridge-rail',[BRIDGE.x+s*(BRIDGE.width/2),6.1,1.75],[0.16,1.1,17.5]))];
  return {archObstacles,cantonBase,waterSurface,surfaces,steps,piers,rails,clusters,bracts,trees,levels,lamps,obstacles,pagodaBox,cantonBox,baseBox:box('base',[0,-0.8,0],[BASE.width,1.6,BASE.depth])};
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
// Endpoints contain the full train; 16 s dwell, 14 s travel each way.
export const TRAM_PERIOD=60;
export function tramAt(t) {
 const q=((t%TRAM_PERIOD)+TRAM_PERIOD)%TRAM_PERIOD,dir=q<30?1:-1,u=q%30,stopped=u<16;
 const x=dir*(-45+90*smooth(clamp((u-16)/14,0,1)));
 const length=TRAM.cars*TRAM.carLength+(TRAM.cars-1)*TRAM.gap+2*TRAM.noseOverhang;
 const raw=box('tram',[x,(TRAM.wheelBottom+TRAM.roofTop)/2,TRAM.z],[length,TRAM.roofTop-TRAM.wheelBottom,TRAM.width+2*TRAM.sideOverhang]);
 return {x,dir,stopped,station:stopped?(dir===1?'广州塔站':'赤岗塔站'):null,cars:Array.from({length:4},(_,i)=>x+(i-1.5)*(TRAM.carLength+TRAM.gap)),raw};
}
export const CAR_SPECS=Array.from({length:4},(_,i)=>({i,color:['#E2E5E3','#9DA5A8','#454D52','#DDE0DC'][i]}));
export const BOAT_SPECS=[{x:-18,z:-15.3,phase:0},{x:18,z:-18.1,phase:Math.PI}];
// Equal spacing on a capsule, continuous through both U-turns.
export function carAt(t,i) {
 const r=1.75,straight=104,arc=Math.PI*r,perimeter=2*(straight+arc);
 let d=((t*2.1+i*perimeter/4)%perimeter+perimeter)%perimeter,x,z,angle;
 if(d<straight){x=-52+d;z=4.25;angle=0;}
 else if((d-=straight)<arc){const a=-Math.PI/2+d/r;x=52+r*Math.cos(a);z=6+r*Math.sin(a);angle=-(a+Math.PI/2);}
 else if((d-=arc)<straight){x=52-d;z=7.75;angle=-Math.PI;}
 else {d-=straight;const a=Math.PI/2+d/r;x=-52+r*Math.cos(a);z=6+r*Math.sin(a);angle=-(a+Math.PI/2);}
 const co=Math.abs(Math.cos(angle)),si=Math.abs(Math.sin(angle));
 return {x,z,angle,raw:box('car-'+i,[x,.925,z],[4.58*co+1.87*si,1.45,4.58*si+1.87*co])};
}
export function boatAt(t,i) {
 const b=BOAT_SPECS[i],x=b.x+Math.sin(t*Math.PI/60+b.phase)*15,y=.4+Math.sin(t*.7+b.phase)*.035;
 return {x,y,z:b.z,raw:box('boat-'+i,[x,y+.325,b.z],[3.8,1.252,1.35])};
}
export const trafficAt=t=>[tramAt(t).raw,...CAR_SPECS.map((_,i)=>carAt(t,i).raw),...BOAT_SPECS.map((_,i)=>boatAt(t,i).raw)];
// Closed Catmull-Rom curve, reparameterised by a dense arc-length table. Prevents fast bulges between keys.
export const PATH_KEYS=[
 {name:'hero',pos:[75,48,112],target:[-9,12,-3]},
 {name:'station',pos:[-21,23,36],target:[-53,16,-3]},
 {name:'follow',pos:[-32,13,14],target:[-35,2,0]},
 {name:'bridge',pos:[-13.5,9.2,8],target:[-3.5,3.2,0]},
 {name:'park',pos:[8,16,18],target:[17,3,-8]},
 {name:'arch',pos:[29,3.2,-12],target:[-67,18,-6]},
 {name:'arch-exit',pos:[30,20,-24],target:[35,10,-6]},
 {name:'east-turn',pos:[64,27,-18],target:[44,12,-6]},
 {name:'pagoda',pos:[55,22,32],target:[22,14,-6]},
 {name:'rise',pos:[79,50,60],target:[-10,8,-4]},
 {name:'wide',pos:[86,78,124],target:[-10,10,-4]},
];
const cr=(a,b,c,d,t)=>0.5*(2*b+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);
function rawPath(u) { const n=PATH_KEYS.length,s=((u%1+1)%1)*n,i=Math.floor(s),t=s-i,K=j=>PATH_KEYS[(i+j+n)%n], at=f=>[0,1,2].map(a=>cr(K(-1)[f][a],K(0)[f][a],K(1)[f][a],K(2)[f][a],t));return{pos:at('pos'),target:at('target')}; }
const ARC=[0];for(let i=1;i<=4096;i++)ARC.push(ARC[i-1]+dist(rawPath((i-1)/4096).pos,rawPath(i/4096).pos)*(1+2*Math.exp(-((dist(rawPath(i/4096).pos,[-13.5,9.2,8])/13)**2))));
export const PATH_LENGTH=ARC.at(-1);
export const VIEWS=Object.fromEntries(PATH_KEYS.map((k,i)=>[k.name,lerp(ARC[Math.floor(i/PATH_KEYS.length*4096)],ARC[Math.ceil(i/PATH_KEYS.length*4096)],i/PATH_KEYS.length*4096%1)/PATH_LENGTH]).filter(([k])=>['hero','station','bridge','arch','pagoda','wide'].includes(k)));
export function pathAt(u) { const d=((u%1+1)%1)*PATH_LENGTH;let lo=0,hi=4096;while(hi-lo>1){const m=(lo+hi)>>1;if(ARC[m]<=d)lo=m;else hi=m;}return rawPath((lo+(d-ARC[lo])/(ARC[hi]-ARC[lo]))/4096); }
export function routeAt(u,time=u*LOOP_S) {
 const p=pathAt(u),seconds=((u%1)+1)%1*LOOP_S;
 const w=smooth(clamp((seconds-16)/1.5,0,1))*(1-smooth(clamp((seconds-20)/3,0,1)));
 const tr=tramAt(time),near=1-smooth(clamp((Math.abs(tr.x+38)-12)/10,0,1)),k=w*near;
 return {pos:mix(p.pos,[tr.x+12.7,13,14],k),target:mix(p.target,[tr.x+6,2,0],k),tracking:k};
}
export const fovFor=(aspect,pos)=>aspect<.8?90:56-(pos?9*(1-smooth(clamp(dist(pos,PATH_KEYS[0].pos)/25,0,1))):0);
export const shiftFor=(aspect,pos)=>aspect<0.8?[0,0.44]:[pos ? .18*smooth(clamp((pos[1]-35)/10,0,1))+.38*Math.exp(-((dist(pos,[-13.5,9.2,8])/25)**2)) : .18,0];
export function project(p,cam,target,aspect) {
  const f=target.map((v,i)=>v-cam[i]),len=Math.hypot(...f),fw=f.map(v=>v/len),rl=Math.hypot(fw[2],fw[0]),r=[-fw[2]/rl,0,fw[0]/rl],up=[-r[2]*fw[1],r[2]*fw[0]-r[0]*fw[2],r[0]*fw[1]],d=p.map((v,i)=>v-cam[i]),dot=v=>v.reduce((s,x,i)=>s+x*d[i],0),z=dot(fw),t=Math.tan(fovFor(aspect,cam)*Math.PI/360),sh=shiftFor(aspect,cam);
  return {x:dot(r)/(z*t*aspect)+sh[0],y:dot(up)/(z*t)+sh[1],z};
}
export function screenBox(b,cam,target,aspect){const ps=boxCorners(b).map(p=>project(p,cam,target,aspect));return{x0:(Math.min(...ps.map(p=>p.x))+1)/2,x1:(Math.max(...ps.map(p=>p.x))+1)/2,y0:(1-Math.max(...ps.map(p=>p.y)))/2,y1:(1-Math.min(...ps.map(p=>p.y)))/2,front:ps.every(p=>p.z>0)};}
const spherical=(p,t)=>{const d=p.map((v,i)=>v-t[i]),r=Math.hypot(...d);return{r,az:Math.atan2(d[0],d[2]),el:Math.asin(clamp(d[1]/r,-1,1))};};
const cartesian=(s,t)=>[t[0]+s.r*Math.cos(s.el)*Math.sin(s.az),t[1]+s.r*Math.sin(s.el),t[2]+s.r*Math.cos(s.el)*Math.cos(s.az)];
export function createRig({u=0,auto=true}={}) {
  const r={u,auto,mode:auto?'auto':'manual',idle:0,held:false,time:0,pos:pathAt(u).pos,look:pathAt(u).target};let sph=spherical(r.pos,r.look),returnFrom=null,returnTo=null,k=0;
  r.grab=()=>{sph=spherical(r.pos,r.look);r.mode='manual';r.idle=0;};
  // Keep manual zoom within 32 m of the route: a 3 s smoothstep return then stays below 0.3 m/frame.
  // This still permits a full orbit; far-side zoom-out stops earlier than the open river side.
  const constrain=()=>{let nearest=null,best=Infinity;for(let i=0;i<800;i++){const p=pathAt(i/800).pos,d=dist(p,r.pos);if(d<best){best=d;nearest=p;}}if(best>32)r.pos=mix(nearest,r.pos,32/best);sph=spherical(r.pos,r.look);};
  r.drag=(az,el)=>{if(r.mode!=='manual')r.grab();r.idle=0;sph.az-=az;sph.el=clamp(sph.el+el,0.12,1.35);r.pos=cartesian(sph,r.look);constrain();};
  r.zoom=f=>{if(r.mode!=='manual')r.grab();r.idle=0;sph.r=clamp(sph.r*f,10,260);r.pos=cartesian(sph,r.look);constrain();};
  r.setAuto=on=>{r.grab();r.auto=on;};
  r.reset=()=>{r.u=0;r.pos=pathAt(0).pos;r.look=pathAt(0).target;r.auto=true;r.mode='auto';r.idle=0;};
  r.update=(dt,time)=>{
    r.time=Number.isFinite(time)?time:r.time+dt;
    if(r.mode==='auto'){r.u=(r.u+dt/LOOP_S)%1;const p=routeAt(r.u,r.time);
      // A manually rejoined camera can be out of phase with the tram. Bound catch-up speed,
      // while leaving the normal, synchronized tour unchanged (its peak is below 12 m/s).
      const step=dist(r.pos,p.pos);r.pos=mix(r.pos,p.pos,step?Math.min(1,dt*12/step):1);r.look=p.target;}
    else if(r.mode==='manual') {if(!r.held)r.idle+=dt;if(r.auto&&r.idle>=IDLE_S){
      // Rejoin the nearest point, not the stale point from before a long manual orbit.
      let best=Infinity;for(let i=0;i<1600;i++){const p=routeAt(i/1600,r.time+RETURN_S),d=dist(p.pos,r.pos);if(d<best){best=d;r.u=i/1600;}}
      returnFrom={pos:r.pos.slice(),target:r.look.slice()};returnTo=routeAt(r.u,r.time+RETURN_S);k=0;r.mode='return';
    }} else {k=Math.min(1,k+dt/RETURN_S);r.pos=mix(returnFrom.pos,returnTo.pos,smooth(k));r.look=mix(returnFrom.target,returnTo.target,smooth(k));if(k>=1-1e-9){r.mode='auto';const end=routeAt(r.u,r.time);r.pos=end.pos;r.look=end.target;}}
    return {pos:r.pos.slice(),target:r.look.slice()};
  };return r;
}
// Linear RGB light/sky values; material HEX colours are converted by Three.js.
const HOURS=[
 {low:[.80,.75,.68],mid:[.76,.71,.65],top:[.73,.72,.70],key:[1,.94,.84],keyInt:3.1,hemi:1.35,lights:0,sunY:.8},
 {low:[.59,.37,.18],mid:[.35,.32,.27],top:[.25,.28,.30],key:[1,.68,.33],keyInt:2.8,hemi:1.05,lights:.62,sunY:.32},
 {low:[.014,.022,.055],mid:[.008,.015,.042],top:[.003,.006,.019],key:[.38,.52,.9],keyInt:.32,hemi:.38,lights:1,sunY:.08}
];
export function skyAt(h){h=clamp(h,0,1);const i=h<=0.55?0:1,k=smooth(i===0?h/0.55:(h-0.55)/0.45),a=HOURS[i],b=HOURS[i+1];return Object.fromEntries(Object.keys(a).map(f=>[f,Array.isArray(a[f])?mix(a[f],b[f],k):lerp(a[f],b[f],k)]));}
