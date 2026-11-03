const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../src/race-core.js');
function tick(s,input,seconds){for(let t=0;t<seconds;t+=1/60)C.step(s,input,1/60);}
function start(){const s=C.create();s.riders.slice(1).forEach(r=>r.finished=true);C.start(s);tick(s,{},3.4);return s;}
test('optional auto pedal matches manual throttle without changing default idle',()=>{
 const idle=start(),auto=start(),manual=start();
 tick(idle,{},1.5);tick(auto,{autoPedal:true},1.5);tick(manual,{forward:true},1.5);
 assert.equal(idle.riders[0].speed,0);
 assert.ok(auto.riders[0].speed>9,'auto pedal must move without a third held touch');
 assert.deepEqual(auto.riders,manual.riders,'auto pedal must use the existing throttle physics');
});
test('auto pedal supports two-finger drift; brake overrides it and pause freezes it',()=>{
 const s=start();tick(s,{autoPedal:true},1.5);tick(s,{autoPedal:true,left:true,drift:true},.7);
 assert.ok(s.riders[0].charge>8,'steer + drift must charge while auto pedalling');
 tick(s,{autoPedal:true,brake:true},1.5);assert.equal(s.riders[0].speed,0);
 C.pause(s);const before=JSON.stringify(s);tick(s,{autoPedal:true},1);assert.equal(JSON.stringify(s),before);
});
