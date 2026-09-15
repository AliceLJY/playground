'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),C=require('../src/core.js');
function seconds(s,input,n){for(let i=0;i<Math.round(n*60);i++)C.step(s,input,1/60);}
function riding(){const s=C.create();C.start(s);s.encountered=true;s.assist=true;return s;}
test('intro is still; calico encounter pauses and can be declined once',()=>{const s=C.create();seconds(s,{},5);assert.equal(s.distance,0);C.start(s);seconds(s,{},4);assert.equal(s.phase,'challenge');const at=s.distance;seconds(s,{forward:true},5);assert.equal(s.distance,at);C.decline(s);seconds(s,{},8);assert.equal(s.phase,'ride');assert.equal(s.race,null);});
test('free steering changes heading and continues on that bearing after release',()=>{const s=riding();s.assist=false;seconds(s,{forward:true},1);seconds(s,{left:true,forward:true},.4);const h=s.heading;assert(h>.3);seconds(s,{forward:true},.3);assert.equal(s.heading,h);assert(s.x<-1);});
test('enabled navigation completes more than a full loop and remains on roads',()=>{const s=riding();seconds(s,{forward:true},55);assert(s.distance>C.END);assert.equal(s.phase,'ride');assert.equal(s.collisions,0);assert(C.nearest(s.x,s.z).distance<3);});
test('branch is connected, traversable and rejoins ring',()=>{const s=riding(),p=C.at(C.BRANCH,15);Object.assign(s,{x:p.x,z:p.z,heading:p.heading});seconds(s,{forward:true},6);assert.equal(s.roadId,'lane');assert.equal(s.collisions,0);seconds(s,{forward:true},13);assert.equal(s.roadId,'ring');assert.equal(s.collisions,0);});
test('brake overrules boost; parking stays still',()=>{const s=riding();seconds(s,{forward:true},2);seconds(s,{boost:true,brake:true},2);assert.equal(s.speed,0);s.cruising=false;const p=[s.x,s.z];seconds(s,{},3);assert.deepEqual([s.x,s.z],p);assert.equal(s.boosting,false);});
test('boost accelerates, depletes and recovers while released',()=>{const s=riding();seconds(s,{forward:true},2);seconds(s,{boost:true},2);assert(s.speed>17);assert(s.boost<55);const b=s.boost;seconds(s,{forward:true},2);assert(s.boost>b);assert(s.speed<13.2);});
test('free driving crosses grass without a road corridor wall or heading correction',()=>{const s=riding();s.assist=false;s.x=-99;s.z=-65;s.heading=0;seconds(s,{forward:true},2);assert.equal(s.heading,0);assert.equal(s.collisions,0);assert.equal(s.phase,'ride');assert(s.z<-80);assert(C.nearest(s.x,s.z).distance>10);});
test('countdown prevents false start and pause freezes both riders',()=>{const s=riding();C.accept(s);const p=[s.x,s.z,s.race.aiAt];seconds(s,{forward:true,boost:true},2);assert.deepEqual([s.x,s.z,s.race.aiAt],p);C.pause(s);const r=JSON.stringify(s);seconds(s,{forward:true},10);assert.equal(JSON.stringify(s),r);C.pause(s);seconds(s,{forward:true},2);assert.equal(s.race.status,'racing');assert(s.speed>0);});
test('orange can win by accelerating and boosting through ordered checkpoints',()=>{const s=riding();C.accept(s);seconds(s,{forward:true,boost:true},50);assert.equal(s.phase,'result');assert.equal(s.race.winner,'orange');assert.equal(s.race.gate,5);assert.equal(s.collisions,0);});
test('calico wins against cruise-only play; no unearned completion',()=>{const s=riding();C.accept(s);seconds(s,{},50);assert.equal(s.phase,'result');assert.equal(s.race.winner,'calico');assert(s.race.gate<5);});
test('skip ahead cannot collect a later gate before earlier ones',()=>{const s=riding();C.accept(s);seconds(s,{},3.1);const p=C.at(C.MAIN,C.GATES[3]);Object.assign(s,{x:p.x,z:p.z,heading:p.heading});C.step(s,{},1/60);assert.equal(s.race.gate,0);});
test('optional stops are spatial, pause progress and award only once',()=>{const s=riding(),p=C.at(C.MAIN,C.STOPS[0].at);Object.assign(s,{x:p.x,z:p.z});assert(C.interact(s));const d=s.distance;seconds(s,{forward:true},3);assert.equal(s.distance,d);C.close(s);assert(C.interact(s));assert.deepEqual(s.visits,['tea']);});
test('large and invalid timestep cannot skip streets',()=>{const s=riding();s.speed=18;C.step(s,{boost:true},300);assert(s.distance<=.901);const d=s.distance;C.step(s,{},NaN);assert.equal(s.distance,d);});

test('swept bicycle blocks a thin post and a rotated wall without tunnelling',()=>{
 const post={x:0,z:-2,hx:.08,hz:.08,angle:0,minY:0,maxY:3,kind:'路灯'};
 assert(C.sweep(0,0,0,-8,0,[post]));
 assert(C.sweep(0,0,0,-8,0,[{...post,hx:3,hz:.1,angle:Math.PI/4}]));
 assert.equal(C.sweep(0,0,0,-8,0,[{...post,minY:4,maxY:5}]),null);
});
test('impact falls, pauses, gets up automatically and cannot drive through during cooldown',()=>{
 const s=C.create();C.start(s);s.encountered=true;s.heading=0;s.speed=18;s.cruising=false;s.assist=false;
 const wall={x:0,z:-2,hx:4,hz:.1,angle:0,minY:0,maxY:3,kind:'墙'};
 for(let i=0;i<10&&s.phase==='ride';i++)C.step(s,{forward:true,boost:true},.05,[wall]);
 assert.equal(s.phase,'crash');assert.equal(s.speed,0);assert(s.z>-2);const distance=s.distance;
 C.pause(s);const t=s.crash.time;C.step(s,{},.05,[wall]);assert.equal(s.crash.time,t);C.pause(s);assert.equal(s.phase,'crash');
 for(let i=0;i<78;i++)C.step(s,{},.05,[wall]);assert.equal(s.phase,'ride');assert.equal(s.crash,null);assert.equal(s.distance,distance);
 // Recovery immunity avoids repeated falls, never removes physical blocking.
 s.x=0;s.z=0;s.heading=0;s.speed=18;s.collisionCooldown=1;for(let i=0;i<10;i++)C.step(s,{forward:true},.05,[wall]);assert(s.z>-2);assert.equal(s.collisions,1);
});
test('rival keeps racing during a fall and a finish waits until remount',()=>{
 const s=C.create();C.accept(s);s.race.status='racing';s.race.aiGate=4;s.race.aiAt=C.GATES.at(-1)-13;
 s.phase='crash';s.speed=0;s.crash={time:0,kind:'路沿',side:1,from:{x:s.x,z:s.z,y:s.y,heading:s.heading},safe:{x:s.x,z:s.z,y:s.y,heading:s.heading}};
 for(let i=0;i<30;i++)C.step(s,{},.05);assert.equal(s.race.status,'finished');assert.equal(s.race.winner,'calico');assert.equal(s.phase,'crash');assert.equal(s.race.gate,0);
 for(let i=0;i<50;i++)C.step(s,{},.05);assert.equal(s.phase,'result');assert.equal(s.crash,null);
});

test('fall after leaving a finished race does not reopen the old result',()=>{
 const s=C.create();C.start(s);s.encountered=true;s.race={status:'finished',winner:'orange'};s.phase='crash';s.crash={time:3.79,from:{x:s.x,z:s.z,y:s.y,heading:s.heading},safe:{x:s.x,z:s.z,y:s.y,heading:s.heading}};C.step(s,{},.05);assert.equal(s.phase,'ride');
});

test('navigation defaults off and only explicit navigation follows road bends',()=>{const s=C.create();assert.equal(s.assist,false);C.start(s);s.encountered=true;const p=C.at(C.MAIN,C.END*.72);Object.assign(s,{x:p.x,z:p.z,heading:p.heading});const heading=s.heading;seconds(s,{},2);assert.equal(s.heading,heading);s.assist=true;seconds(s,{},2);assert.notEqual(s.heading,heading);});
test('water is a physical surface and recovery preserves heading and stops automatic pedalling',()=>{const s=riding();s.assist=false;s.x=50;s.z=C.SHORE-2;s.heading=Math.PI;s.speed=13;seconds(s,{forward:true},.3);assert.equal(s.phase,'crash');assert.equal(s.crash.water,true);assert.equal(s.cruising,false);const h=s.heading;seconds(s,{},4);assert.equal(s.phase,'ride');assert.equal(s.heading,h);assert(s.z<C.SHORE-2);assert.equal(s.speed,0);});
test('court and garden paths have traversable ground instead of projected road height',()=>{assert.equal(C.surface(C.COURT.x,C.COURT.z),'court');assert.equal(C.groundY(C.COURT.x,C.COURT.z),0);const s=riding();Object.assign(s,{assist:false,x:C.COURT.x,z:-16,heading:Math.PI});seconds(s,{forward:true},2);assert.equal(s.phase,'ride');assert.equal(s.collisions,0);assert(s.z>0);assert.equal(s.surface,'court');});
