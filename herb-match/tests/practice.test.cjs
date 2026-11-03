const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../src/core.js');
const answer=(s,b)=>C.reviewIntent(s,{type:'answer',basket:b});
const next=s=>C.reviewIntent(s,{type:'continue'});
const current=s=>s.items[s.index];
const correct=s=>answer(s,C.HERBS[current(s).k].nature);
function round(seed,level='human'){
  const g=C.create({seed}),pilot=C.pilot(level,seed);
  while(g.state.phase!=='over'){pilot(g);g.step(C.CFG.step);g.state.events.length=0;}
  return g;
}

test('real rounds supply only their unique slips; answer/continue sequences master every herb',()=>{
  let wrong=0,repeats=0,mastered=0;
  for(let seed=1;seed<=12;seed++){
    const g=round(seed),before=structuredClone(g.state.result),slips=before.slips;
    wrong+=before.wrong;repeats+=slips.length-new Set(slips.map(x=>x.k)).size;
    let s=C.createReview(slips);const keys=s.items.map(x=>x.k),seen=new Map();
    assert.deepEqual(keys,[...new Set(slips.map(x=>x.k))]);assert.ok(keys.length>1);
    // The same basket intentions used by touch and keyboard, followed by explicit continuation.
    while(s.phase!=='done'){
      const k=current(s).k,old=structuredClone(s);seen.set(k,(seen.get(k)||0)+1);
      const result=correct(s);assert.deepEqual(s,old,'answer must not mutate the previous state');
      assert.equal(result.phase,'feedback');s=next(result);
    }
    for(const item of s.items){assert.equal(item.streak,2);assert.equal(seen.get(item.k),2);mastered++;}
    assert.deepEqual(g.state.result,before,'review leaves the original score, slips and time untouched');
  }
  assert.ok(wrong>50&&repeats>10&&mastered>50,'samples really contain wrong answers, repeated slips and mastered herbs');
});

test('a wrong answer resets only that herb, retains its label until continue, and can recover',()=>{
  let s=C.createReview([{k:8,chosen:3},{k:12,chosen:0}]);
  s=next(correct(s));s=next(correct(s));assert.deepEqual(s.items.map(x=>x.streak),[1,1]);
  s=answer(s,3);assert.deepEqual(s.items.map(x=>x.streak),[0,1]);
  assert.deepEqual(s.feedback,{ok:false,chosen:3});assert.equal(current(s).k,8);
  assert.equal(answer(s,2),s,'another answer cannot close a wrong-answer label');
  assert.equal(C.reviewIntent(s,{type:'wait',seconds:90}),s,'no clock can expire a review label');
  s=next(s);assert.equal(current(s).k,12);
  s=next(correct(s));assert.equal(current(s).k,8);
  s=next(correct(s));assert.equal(s.phase,'question');assert.equal(current(s).streak,1);
  s=next(correct(s));assert.equal(s.phase,'done');assert.ok(s.items.every(x=>x.streak===2));
});

test('completed or abandoned review clears on exit; a new normal round has no review residue',()=>{
  for(const completed of [false,true]){
    const g=round(5),before=structuredClone(g.state.result);let s=C.createReview(before.slips);
    if(completed)while(s.phase!=='done')s=next(correct(s));else s=answer(s,(C.HERBS[current(s).k].nature+1)%4);
    s=C.reviewIntent(s,{type:'exit'});assert.equal(s,null);assert.deepEqual(g.state.result,before);
    const again=C.createReview(before.slips);assert.ok(again.items.every(x=>x.streak===0));
    const fresh=C.create({seed:5});assert.equal(fresh.state.t,0);assert.equal(fresh.state.score,0);assert.deepEqual(fresh.state.slips,[]);
    while(!fresh.state.herbs.some(h=>fresh.state.t-h.born>=C.CFG.popIn))fresh.step(C.CFG.step);
    const h=fresh.state.herbs[0];assert.equal(fresh.tapBasket(C.HERBS[h.k].nature),true);assert.equal(fresh.state.correct,1);
  }
});

test('one herb still needs two answers; invalid answers and empty or malformed slips cannot advance',()=>{
  let s=C.createReview([{k:8,chosen:3},{k:8,chosen:-1},{k:99,chosen:0},{k:0,chosen:0},{k:0,chosen:99},null]);
  assert.deepEqual(s.items,[{k:8,streak:0}]);
  for(const b of [-1,4,NaN,'2',undefined])assert.equal(answer(s,b),s);
  assert.equal(next(s),s);s=next(correct(s));assert.equal(s.phase,'question');
  s=next(correct(s));assert.equal(s.phase,'done');assert.equal(answer(s,2),s);assert.equal(next(s),s);
  for(const slips of [[],null,undefined])assert.equal(C.createReview(slips).phase,'done');
  assert.equal(C.createReview(round(5,'precise').state.result.slips).items.length,0);
});
