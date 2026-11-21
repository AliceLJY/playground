'use strict';
// Symptoms from the 2026-11-22 play reports (Alice + Duet), written as checks before the fixes.
const test=require('node:test'),assert=require('node:assert/strict'),C=require('../src/core.js');
const DT=1/60;
function seconds(s,input,n){for(let i=0;i<Math.round(n*60);i++)C.step(s,input,DT);}
function approach(id,metresBefore,kmh){const h=C.HOTSPOTS.find(p=>p.id===id),p=C.at(h.road,h.at-metresBefore),s=C.create();C.start(s);Object.assign(s,{x:p.x,z:p.z,heading:p.heading,speed:kmh/3.6,encountered:true,assist:true,cruising:true});return {h,s};}

test('a short brake tap inside a ring, with auto-forward on, parks the bike and opens the card',()=>{
 // What a person does: see the hint, tap ↓ for about 0.45 s, let go. Auto-forward must not pull the bike back out.
 const {h,s}=approach('qilou-rain',3,8.5*3.6);
 let entered=false;for(let i=0;i<120&&!entered;i++){C.step(s,{},DT);entered=s.hotspotInside===h.id;}
 assert.ok(entered,'rider reaches the ring');
 seconds(s,{brake:true},.45);
 for(let i=0;i<90&&s.phase==='ride';i++)C.step(s,{},DT);
 assert.equal(s.phase,'hotspot','released brake inside the ring should still open the card');assert.equal(s.dialog,h.id);
});

test('braking after a human reaction time at 30 km/h still stops inside the ring',()=>{
 // Hint appears on entry; a person reacts ~0.45 s later. The bike must come to rest inside the trigger zone.
 const {h,s}=approach('qilou-brawl',10,30);
 let t=0,entered=false;for(let i=0;i<240&&!entered;i++){C.step(s,{forward:true,boost:true},DT);entered=s.hotspotInside===h.id;}
 assert.ok(entered,'rider reaches the ring');
 for(;t<.45;t+=DT)C.step(s,{forward:true,boost:true},DT);
 seconds(s,{brake:true},.8);
 for(let i=0;i<90&&s.phase==='ride';i++)C.step(s,{},DT);
 assert.equal(s.phase,'hotspot','a late-but-human brake should still open the entrance');
});

test('the calico challenge waits until the rider has been through a doorway',()=>{
 const s=C.create();C.start(s);seconds(s,{},6);
 assert.notEqual(s.phase,'challenge','first minute belongs to the doorways, not the race');
 const t=C.create();C.start(t);t.visits=['datai-teahouse'];seconds(t,{},6);
 assert.equal(t.phase,'challenge','after one doorway the calico can still invite a race');
});

test('accepting a race resets the course position so the HUD does not claim a lead at 0.0 s',()=>{
 const s=C.create();C.start(s);s.encountered=true;const far=C.at(C.MAIN,C.END*.6);Object.assign(s,{x:far.x,z:far.z,heading:far.heading});seconds(s,{forward:true},.5);
 assert.ok(s.routeAt>100);C.accept(s);
 assert.ok(s.routeAt<s.race.aiAt,`routeAt ${s.routeAt.toFixed(1)} should be behind the calico at the start`);
});
