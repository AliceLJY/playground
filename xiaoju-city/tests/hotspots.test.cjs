'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),C=require('../src/core.js');
const root=path.resolve(__dirname,'../..'),workflow=fs.readFileSync(path.join(root,'.github/workflows/pages.yml'),'utf8');
function atHotspot(h){const p=C.at(h.road,h.at),s=C.create();C.start(s);Object.assign(s,{x:p.x,z:p.z,heading:p.heading,cruising:false,assist:false,encountered:true});return s;}
test('acceptance 1: all 14 target directories and publishing destinations exist',()=>{
 assert.equal(C.HOTSPOTS.length,14);
 for(const h of C.HOTSPOTS){assert.ok(fs.statSync(path.join(root,h.id)).isDirectory(),`${h.id} directory`);assert.ok(workflow.includes(`_site/${h.id}`),`${h.id} in pages.yml`);}
});
test('acceptance 2: riding through at 15 km/h only hints, stopping for 0.6 s opens',()=>{
 const h=C.HOTSPOTS.find(p=>p.id==='qilou-rain'),start=C.at(h.road,h.at-6),s=atHotspot(h);Object.assign(s,{x:start.x,z:start.z,heading:start.heading,speed:15/3.6});let sawHint=false;
 for(let i=0;i<180&&C.nearest(s.x,s.z,[h.road]).at<h.at+6;i++){C.step(s,{forward:true},1/60);sawHint||=s.hotspotHint===h.id;}
 assert.equal(s.phase,'ride','15 km/h pass-through must not open the card');assert.ok(sawHint,'pass-through must produce the lightweight hint');
 const parked=atHotspot(h);for(let i=0;i<35;i++)C.step(parked,{},1/60);
 assert.equal(parked.phase,'ride','0.583 s is shorter than the dwell window');C.step(parked,{},1/60);
 assert.equal(parked.phase,'hotspot');assert.equal(parked.dialog,h.id);
});
test('acceptance 3: routes exist from the origin and riverside to all 14 entrances',()=>{
 const origin=C.create(),river=C.create(),p=C.at(C.MAIN,C.END*.84);Object.assign(river,{x:p.x,z:p.z});let count=0;
 for(const from of [origin,river])for(const h of C.HOTSPOTS){const route=C.planRoute(from,h.id);assert.ok(route&&route.points.length,`${h.id} route`);count++;}
 assert.equal(count,28);
});
test('acceptance 4: entrance circles have 14 m separation and stay beside a road',()=>{
 const roads=[...C.ROADS,...C.PATHS];let minimum=Infinity,maximumRoadDistance=0;
 for(let i=0;i<C.HOTSPOTS.length;i++){const h=C.HOTSPOTS[i],p=C.at(h.road,h.at),nearest=C.nearest(p.x,p.z,roads);maximumRoadDistance=Math.max(maximumRoadDistance,nearest.distance);assert.ok(nearest.distance<=nearest.road.width+3,`${h.id} is ${nearest.distance.toFixed(2)} m from ${nearest.road.id}`);for(let j=i+1;j<C.HOTSPOTS.length;j++){const q=C.at(C.HOTSPOTS[j].road,C.HOTSPOTS[j].at),d=Math.hypot(p.x-q.x,p.z-q.z);minimum=Math.min(minimum,d);assert.ok(d>=14,`${h.id} / ${C.HOTSPOTS[j].id}: ${d.toFixed(2)} m`);}}
 assert.ok(minimum>=14);assert.ok(maximumRoadDistance<1e-9);
});
test('real navigation parks at an entrance and opens its card',()=>{
 const s=C.create();C.start(s);s.encountered=true;assert.ok(C.navigate(s,'qilou-rain'));
 for(let i=0;i<3600&&s.phase==='ride';i++)C.step(s,{},1/60);
 assert.equal(s.phase,'hotspot');assert.equal(s.dialog,'qilou-rain');assert.equal(s.speed,0);
});
