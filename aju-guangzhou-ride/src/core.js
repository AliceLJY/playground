(function(root){
 'use strict';
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
 function makeRoad(id,knots,closed,width){
  const pts=[],n=knots.length;
  const get=i=>knots[closed?(i%n+n)%n:clamp(i,0,n-1)];
  for(let i=0;i<(closed?n:n-1);i++)for(let j=0;j<24;j++){
   const t=j/24,a=get(i-1),b=get(i),c=get(i+1),d=get(i+2);
   const calc=k=>.5*((2*b[k])+(-a[k]+c[k])*t+(2*a[k]-5*b[k]+4*c[k]-d[k])*t*t+(-a[k]+3*b[k]-3*c[k]+d[k])*t*t*t);
   pts.push({x:calc(0),z:calc(1)});
  }
  pts.push({...pts[closed?0:pts.length-1]});if(!closed)pts[pts.length-1]={x:knots.at(-1)[0],z:knots.at(-1)[1]};
  let length=0;pts.forEach((p,i)=>{if(i)length+=Math.hypot(p.x-pts[i-1].x,p.z-pts[i-1].z);p.at=length;});
  return {id,pts,length,closed,width};
 }
 const MAIN=makeRoad('ring',[[0,0],[0,-60],[-20,-105],[-75,-120],[-130,-90],[-140,-30],[-125,35],[-75,58],[-15,50],[18,23]],true,5.6);
 const END=MAIN.length;
 function at(road,s,offset=0){
  s=road.closed?(s%road.length+road.length)%road.length:clamp(s,0,road.length-.000001);
  let lo=0,hi=road.pts.length-1;while(hi-lo>1){const m=(hi+lo)>>1;if(road.pts[m].at<=s)lo=m;else hi=m;}
  const a=road.pts[lo],b=road.pts[hi],t=(s-a.at)/(b.at-a.at||1),angle=Math.atan2(-(b.x-a.x),-(b.z-a.z));
  const f=s/END;const y=road.id==='ring'&&f>.63&&f<.75?Math.sin((f-.63)/.12*Math.PI)*2.2:0;
  return {x:a.x+(b.x-a.x)*t+Math.cos(angle)*offset,z:a.z+(b.z-a.z)*t-Math.sin(angle)*offset,heading:angle,y};
 }
 const startBranch=at(MAIN,END*.25),endBranch=at(MAIN,END*.81);
 const BRANCH=makeRoad('lane',[[startBranch.x,startBranch.z],[-73,-70],[-62,-23],[-45,19],[endBranch.x,endBranch.z]],false,3.8);
 const ROADS=[MAIN,BRANCH];
 const SHORE=67,COURT={x:-99,z:-2,w:24,d:34};
 const gardenEntry=at(MAIN,END*.365),laneEntry=at(BRANCH,BRANCH.length*.61),riverEntry=at(MAIN,END*.84);
 const PATHS=[makeRoad('garden-path',[[gardenEntry.x,gardenEntry.z],[-101,-82],[-99,-48],[-92,-24],[-92,-6],[-99,-2]],false,2.7),makeRoad('court-path',[[laneEntry.x,laneEntry.z],[-80,-8],[-99,-2]],false,2.7),makeRoad('river-path',[[-99,-2],[-87,19],[riverEntry.x,riverEntry.z],[riverEntry.x,SHORE]],false,2.7)];
 function isWater(x,z){return z>=SHORE&&z<165;}
 function groundY(x,z){const n=nearest(x,z);return at(n.road,n.at).y*clamp((n.road.width+3-n.distance)/3,0,1);}
 function surface(x,z){if(isWater(x,z))return 'water';if(Math.abs(x-COURT.x)<COURT.w/2&&Math.abs(z-COURT.z)<COURT.d/2)return 'court';const n=nearest(x,z);if(n.distance<n.road.width+1.5)return 'road';if(nearest(x,z,PATHS).distance<3)return 'path';return 'grass';}
 function nearest(x,z,roadList=ROADS){
  let best={distance:Infinity};
  for(const road of roadList)for(let i=1;i<road.pts.length;i++){
   const a=road.pts[i-1],b=road.pts[i],dx=b.x-a.x,dz=b.z-a.z,len2=dx*dx+dz*dz;
   const t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(len2||1),0,1),px=a.x+dx*t,pz=a.z+dz*t,d=Math.hypot(x-px,z-pz);
   if(d<best.distance)best={road,at:a.at+(b.at-a.at)*t,x:px,z:pz,distance:d,heading:Math.atan2(-dx,-dz)};
  }
  return best;
 }
 const STOPS=[
  {id:'tea',at:END*.13,short:'西关茶香',title:'骑楼下，一盅茶',text:'“饮啖茶，慢慢嚟。”\n飞得再快，也可以停下来吃个包。',stamp:'茶香',color:'#b16c42'},
  {id:'tree',at:END*.48,short:'沙面花园',title:'榕树下，歇一歇',text:'车铃响过，花园里的猫抬起头。\n它给阿橘留了一小块树荫。',stamp:'花园',color:'#538974'},
  {id:'river',at:END*.84,short:'珠江来信',title:'江风里，寄个好天气',text:'穿过小巷，江面突然打开。\n今天跑过的风，都留在这张明信片里。',stamp:'江风',color:'#548f9d'}
 ];
 const DESTINATIONS=[{id:'tea',name:'西关茶楼',note:'骑楼下喝一盅茶',road:MAIN,at:STOPS[0].at},{id:'court',name:'街坊球场',note:'穿过花园，去球场兜圈',road:PATHS[0],at:PATHS[0].length},{id:'river',name:'珠江来信',note:'沿江骑一段，看广州塔',road:MAIN,at:STOPS[2].at}];
 function planRoute(s,id){
  const destination=DESTINATIONS.find(p=>p.id===id);if(!destination)return null;
  const roads=[...ROADS,...PATHS],n=nearest(s.x,s.z,roads);if(n.distance>4.5)return null;
  const riverAt=nearest(riverEntry.x,riverEntry.z,[PATHS[2]]).at;
  const anchors=new Map([[MAIN,[0,END*.25,END*.365,END*.81,STOPS[0].at,STOPS[1].at,STOPS[2].at,END]],[BRANCH,[0,BRANCH.length*.61,BRANCH.length]],[PATHS[0],[0,PATHS[0].length]],[PATHS[1],[0,PATHS[1].length]],[PATHS[2],[0,riverAt]]]);
  if(n.road===PATHS[2]&&n.at>riverAt+1)return null;
  anchors.get(n.road).push(n.at);anchors.get(destination.road).push(destination.at);
  const nodes=new Map(),key=p=>p.x.toFixed(1)+','+p.z.toFixed(1),node=p=>{const id=key(p);if(!nodes.has(id))nodes.set(id,{p,edges:[]});return id;};
  for(const [road,values]of anchors){const aa=[...new Set(values)].sort((a,b)=>a-b);for(let i=1;i<aa.length;i++){const a=aa[i-1],b=aa[i];if(b-a<.01)continue;const pa=at(road,a),pb=at(road,b),ia=node(pa),ib=node(pb),points=[];for(let d=a;d<b;d+=1.6)points.push({...at(road,d),road:road.id});points.push({...pb,road:road.id});nodes.get(ia).edges.push({to:ib,cost:b-a,points});nodes.get(ib).edges.push({to:ia,cost:b-a,points:points.slice().reverse()});}}
  const start=node(at(n.road,n.at)),goal=node(at(destination.road,destination.at)),dist=new Map([[start,0]]),prev=new Map(),todo=new Set(nodes.keys());
  while(todo.size){let current=null,best=Infinity;for(const id of todo){const d=dist.get(id)??Infinity;if(d<best){best=d;current=id;}}if(current===null||current===goal)break;todo.delete(current);for(const edge of nodes.get(current).edges){const d=best+edge.cost;if(d<(dist.get(edge.to)??Infinity)){dist.set(edge.to,d);prev.set(edge.to,{from:current,edge});}}}
  if(!dist.has(goal))return null;const chain=[];let cursor=goal;while(cursor!==start){const e=prev.get(cursor);if(!e)return null;chain.unshift(e.edge);cursor=e.from;}const points=chain.flatMap((e,i)=>i?e.points.slice(1):e.points);if(!points.length)points.push({...at(destination.road,destination.at),road:destination.road.id});
  return {id,name:destination.name,points,length:dist.get(goal),index:0,status:'active',remaining:dist.get(goal)};
 }
 function navigate(s,id){const route=planRoute(s,id);if(!route)return false;s.routeNav=route;s.assist=true;s.cruising=true;s.manual=0;return true;}
 const GATES=[.24,.43,.60,.78,.94].map(f=>f*END);
 function create(){const p=at(MAIN,0);return {phase:'intro',x:p.x,z:p.z,y:p.y,heading:p.heading,speed:0,distance:0,routeAt:0,roadId:'ring',lateral:0,pedal:0,elapsed:0,visits:[],bells:0,cruising:true,assist:false,manual:0,boost:100,boosting:false,collisions:0,collisionCooldown:0,encountered:false,race:null,dialog:null,crash:null,resumePhase:null,surface:'road',routeNav:null};}
 function start(s){s.phase='ride';}
 function near(s){return STOPS.find(p=>{const w=at(MAIN,p.at);return Math.hypot(s.x-w.x,s.z-w.z)<12;})||null;}
 function interact(s){const p=near(s);if(s.phase!=='ride'||!p||s.race?.status==='racing')return false;s.phase='dialog';s.dialog=p.id;s.speed=0;if(!s.visits.includes(p.id))s.visits.push(p.id);return true;}
 function close(s){if(s.phase==='dialog'){s.phase='ride';s.dialog=null;}}
 function pause(s){if(s.phase==='ride'||s.phase==='crash'){s.resumePhase=s.phase;s.phase='paused';s.speed=0;}else if(s.phase==='paused'){s.phase=s.resumePhase||'ride';s.resumePhase=null;}}
 function challenge(s){s.phase='challenge';s.speed=0;s.encountered=true;}
 function decline(s){s.phase='ride';s.encountered=true;}
 function accept(s){s.routeNav=null;const p=at(MAIN,22,-1.15);Object.assign(s,{phase:'ride',x:p.x,z:p.z,y:p.y,heading:p.heading,speed:0,boost:100,encountered:true,manual:0});s.race={status:'countdown',countdown:3,time:0,gate:0,aiAt:24,aiGate:0,winner:null};}
 function gatePass(x,z,g){const p=at(MAIN,GATES[g]);return Math.hypot(x-p.x,z-p.z)<12;}
 // Swept bicycle footprint against oriented boxes; catches thin posts at boost speed.
 function sweep(x,z,tx,tz,heading,obstacles,y=0){
  let best=null;
  for(const o of obstacles){
   if(o.minY>y+2||o.maxY<y+.15)continue;
   const co=Math.cos(o.angle||0),si=Math.sin(o.angle||0),radius=.56;
   if(Math.hypot(o.x-x,o.z-z)>Math.hypot(o.hx,o.hz)+Math.hypot(tx-x,tz-z)+2)continue;
   for(const offset of [-.65,0,.85]){
    const px=x-Math.sin(heading)*offset-o.x,pz=z-Math.cos(heading)*offset-o.z;
    const ax=co*px-si*pz,az=si*px+co*pz,dx=co*(tx-x)-si*(tz-z),dz=si*(tx-x)+co*(tz-z);
    let enter=0,leave=1,valid=true;
    for(const [v,d,h] of [[ax,dx,o.hx+radius],[az,dz,o.hz+radius]]){
     if(Math.abs(d)<1e-9){if(Math.abs(v)>h)valid=false;continue;}
     let near=(-h-v)/d,far=(h-v)/d;if(near>far)[near,far]=[far,near];enter=Math.max(enter,near);leave=Math.min(leave,far);
    }
    if(valid&&enter<=leave&&leave>=0&&enter<=1&&(!best||enter<best.t))best={t:Math.max(0,enter),obstacle:o};
   }
  }
  return best;
 }
 function beginCrash(s,kind,obstacles){
  const n=nearest(s.x,s.z);let safe={x:s.x,z:s.z,heading:s.heading,y:s.y};
  // Recover locally, preserving free-driving heading instead of snapping to the road.
  for(const d of [.75,1.25,2]){const x=s.x+Math.sin(s.heading)*d,z=s.z+Math.cos(s.heading)*d;if(!isWater(x,z)&&!sweep(x,z,x,z,s.heading,obstacles,groundY(x,z))){safe={x,z,heading:s.heading,y:groundY(x,z)};break;}}
  const side=((s.x-n.x)*Math.cos(s.heading)-(s.z-n.z)*Math.sin(s.heading))>0?-1:1;
  s.crash={time:0,kind,side,from:{x:s.x,z:s.z,heading:s.heading,y:s.y},safe};s.phase='crash';s.speed=0;s.boosting=false;s.collisions++;s.manual=0;
 }
 function advanceRace(s,dt,playerCanPass=true){
  const race=s.race;if(race?.status!=='racing')return;
  race.time+=dt;race.aiAt=Math.min(GATES.at(-1)+3,race.aiAt+(13.4+Math.sin(race.time*.6)*.7)*dt);
  const ai=at(MAIN,race.aiAt);
  if(playerCanPass&&race.gate<GATES.length&&gatePass(s.x,s.z,race.gate))race.gate++;
  if(race.aiGate<GATES.length&&gatePass(ai.x,ai.z,race.aiGate))race.aiGate++;
  if(race.gate===GATES.length||race.aiGate===GATES.length){race.status='finished';race.winner=race.gate===GATES.length?'orange':'calico';if(s.crash)s.crash.finishPending=true;else s.phase='result';s.speed=0;}
 }
 function step(s,input,dt,obstacles=[]){
  dt=clamp(Number.isFinite(dt)?dt:0,0,.05);if(s.phase!=='ride'&&s.phase!=='crash')return;
  s.elapsed+=dt;s.collisionCooldown=Math.max(0,s.collisionCooldown-dt);
  if(s.phase==='crash'){
   s.crash.time+=dt;advanceRace(s,dt,false);const c=s.crash,t=clamp((c.time-1.4)/1.8,0,1),ease=t*t*(3-2*t);
   s.x=c.from.x+(c.safe.x-c.from.x)*ease;s.z=c.from.z+(c.safe.z-c.from.z)*ease;s.y=c.from.y+(c.safe.y-c.from.y)*ease;s.heading=wrap(c.from.heading+wrap(c.safe.heading-c.from.heading)*ease);
   if(c.time>=3.8){s.crash=null;s.phase=c.finishPending?'result':'ride';s.collisionCooldown=1;s.manual=0;s.routeAt=nearest(s.x,s.z,[MAIN]).at;}
   return;
  }
  const race=s.race;
  if(race?.status==='countdown'){race.countdown-=dt;if(race.countdown<=0)race.status='racing';return;}
  const road=nearest(s.x,s.z),steer=Number(!!input.left)-Number(!!input.right);
  if(steer)s.manual=.75;else s.manual=Math.max(0,s.manual-dt);
  let navTarget=null,navTurn=0;
  if(s.assist&&s.routeNav?.status==='active'){
   const nav=s.routeNav,end=nav.points.at(-1);if(Math.hypot(s.x-end.x,s.z-end.z)<2){nav.status='arrived';nav.remaining=0;s.speed=0;s.boosting=false;s.cruising=false;s.assist=false;return;}
   while(nav.index<nav.points.length-1&&Math.hypot(s.x-nav.points[nav.index].x,s.z-nav.points[nav.index].z)<2.6)nav.index++;
   const p=nav.points[nav.index];if(Math.hypot(s.x-p.x,s.z-p.z)>14){nav.status='off-route';s.assist=false;}else{navTarget=nav.points[Math.min(nav.index+1,nav.points.length-1)];navTurn=wrap(Math.atan2(-(navTarget.x-s.x),-(navTarget.z-s.z))-s.heading);nav.remaining=Math.max(0,nav.length*(1-nav.index/Math.max(1,nav.points.length-1)));}
  }
  const wasBoosting=s.boosting;s.boosting=!!input.boost&&!input.brake&&s.boost>(wasBoosting?0:12)&&s.speed>2;
  s.boost=clamp(s.boost+dt*(s.boosting?-25:12),0,100);
  let target=input.brake?0:s.boosting?18:input.forward?13:s.cruising?8.5:0;
  if(surface(s.x,s.z)==='grass')target=Math.min(target,10);
  if(navTarget)target=Math.min(target,Math.abs(navTurn)>.8?1.5:Math.abs(navTurn)>.35?4:navTarget.road==='ring'?8.5:6);
  s.speed+=(target-s.speed)*(1-Math.exp(-dt*(input.brake?9:2.3)));
  if(s.speed<.015)s.speed=0;
  if(steer)s.heading=wrap(s.heading+steer*dt*(.35+Math.min(s.speed,16)*.065));
  else if(s.assist&&s.manual===0&&s.speed>.1){
   if(navTarget){s.heading=wrap(s.heading+clamp(navTurn,-dt*2.1,dt*2.1));}else{
   const forward=Math.cos(wrap(s.heading-road.heading))>=0?1:-1;
   const targetPoint=at(road.road,road.at+forward*(6+s.speed*.48));
   const desired=Math.atan2(-(targetPoint.x-s.x),-(targetPoint.z-s.z));
   s.heading=wrap(s.heading+clamp(wrap(desired-s.heading),-dt*1.7,dt*1.7));}
  }
  const ox=s.x,oz=s.z;s.x-=Math.sin(s.heading)*s.speed*dt;s.z-=Math.cos(s.heading)*s.speed*dt;
  let hit=sweep(ox,oz,s.x,s.z,s.heading,obstacles,s.y);
  if(hit){const f=Math.max(0,hit.t-.03);s.x=ox+(s.x-ox)*f;s.z=oz+(s.z-oz)*f;if(s.speed>1.8&&s.collisionCooldown===0){beginCrash(s,hit.obstacle.kind,obstacles);advanceRace(s,dt,false);return;}s.speed=0;s.boosting=false;}
  const n=nearest(s.x,s.z);
  if(isWater(s.x,s.z)){
   beginCrash(s,'珠江',obstacles);s.crash.water=true;s.crash.safe={x:ox,z:Math.min(oz,SHORE-2.4),y:groundY(ox,Math.min(oz,SHORE-2.4)),heading:s.heading};s.cruising=false;advanceRace(s,dt,false);return;
  }
  s.distance+=Math.hypot(s.x-ox,s.z-oz);s.pedal+=s.speed*dt*1.1;s.roadId=n.road.id;s.surface=surface(s.x,s.z);s.y=groundY(s.x,s.z);s.routeAt=nearest(s.x,s.z,[MAIN]).at;
  s.lateral=(s.x-n.x)*Math.cos(n.heading)-(s.z-n.z)*Math.sin(n.heading);
  if(!s.encountered&&s.distance>21&&Math.hypot(s.x-at(MAIN,30).x,s.z-at(MAIN,30).z)<10){challenge(s);return;}
  advanceRace(s,dt);
 }
 const api={END,MAIN,BRANCH,ROADS,PATHS,COURT,SHORE,DESTINATIONS,planRoute,navigate,isWater,groundY,surface,GATES,STOPS,create,start,step,near,interact,close,pause,challenge,accept,decline,at,nearest,clamp,wrap,sweep};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RideCore=api;
})(typeof window!=='undefined'?window:globalThis);
