const test=require('node:test');
const assert=require('node:assert/strict');
const C=require(process.env.CORE||'../src/core.js');

// A stunned moth lying at the hero's feet, nothing else on stage.
function stunnedMothAtFeet(x=.6){
  const s=C.create({seed:5});C.start(s,{wave:0});C.beginWave(s,0);s.spawnIdx=99;s.events.length=0;
  const e=C.spawn(s,'moth',1,{x,state:'idle'});e.cool=99;e.face=-1;
  Object.assign(e,{y:.45,fallFrom:.45,fallFromX:x,fallToX:x});C.setState(e,'stun',C.KINDS.moth.stun);
  Object.assign(s.player,{x:0,face:1});
  return[s,e];
}
const runFor=(s,sec,input={})=>{for(let t=0;t<sec;t+=1/60)C.run(s,1/60,input);};

test('J on a stunned enemy at the feet executes it',()=>{
  const [s]=stunnedMothAtFeet();
  C.run(s,1/60,{attackPressed:true});runFor(s,.8);
  assert.equal(s.stats.exec,1);
});

// Duet's play report: "it is stunned, press J" was on screen, J was pressed, executes stayed 0.
// A press made while the hero is still staggering from a hit used to live only for the 0.22 s input
// buffer and was dropped; it now waits for the hero while the enemy stays stunned and in reach.
test('J pressed during a hit stagger still executes the stunned enemy once the hero can act',()=>{
  const [s,e]=stunnedMothAtFeet();
  C.setState(s.player,'hurt',.4);
  C.run(s,1/60,{attackPressed:true});runFor(s,1);
  assert.equal(s.stats.exec,1,`hero ${s.player.state}, moth ${e.state}`);
});

test('the held press does not fire once the stun is over',()=>{
  const [s,e]=stunnedMothAtFeet();
  C.setState(s.player,'hurt',2.5);                      // stagger outlasts the 1.5 s stun
  C.run(s,1/60,{attackPressed:true});runFor(s,3);
  assert.equal(s.stats.exec,0);assert.notEqual(e.state,'dead');
});

test('execute reach stays the designed 2.0',()=>{
  assert.equal(C.PLAYER.exec.reach,2);
  const [far]=stunnedMothAtFeet(2.3);C.run(far,1/60,{attackPressed:true});runFor(far,.8);assert.equal(far.stats.exec,0);
  const [near]=stunnedMothAtFeet(1.9);C.run(near,1/60,{attackPressed:true});runFor(near,.8);assert.equal(near.stats.exec,1);
});
