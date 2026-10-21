// Rules, readability and knowledge checks for 药性配对. Every threshold comes from SPEC.md; the play checks run real simulated rounds.
const test=require('node:test'),assert=require('node:assert');
const C=require('../src/core.js'),{CFG,H,HERBS,NATURES}=C;
const ASPECTS=[0.46,0.5625,0.75,1.0,1.6,1.78],SEEDS=[1,2,3,4,5,6,7,8,9,10,11,12];
function play(seed,aspect,level,watch){
  const g=C.create({seed,aspect}),p=typeof level==='function'?level:level?C.pilot(level,seed):null;let n=0;
  while(g.state.phase!=='over'&&n++<200*120){if(p)p(g);g.step(CFG.step);if(watch)watch(g.state,g);g.state.events.length=0;}
  return g.state;
}
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
// a herb's drawn extent (body plus name plate) and a card rectangle overlap?
const hits=(h,c)=>h.x+CFG.box.half>c.x&&h.x-CFG.box.half<c.x+c.w&&h.y+CFG.box.bottom>c.y&&h.y-CFG.box.top<c.y+c.h;

test('same seed and screen shape give the same round',()=>{
  const a=play(7,0.5625,'human').result,b=play(7,0.5625,'human').result;
  assert.deepStrictEqual(a,b,'spec 6: a fixed seed must replay identically, the fixed views depend on it');
  assert.notDeepStrictEqual(play(8,0.5625,'human').result,a,'a different seed should give a different round');
});

test('herb table: four per nature, every taste line names its own nature, no herb on the shelf twice',()=>{
  assert.strictEqual(HERBS.length,16,'spec 5: sixteen herbs');
  assert.strictEqual(new Set(HERBS.map(h=>h.name)).size,16,'spec 5: a herb is listed once');
  NATURES.forEach((n,i)=>{
    const own=HERBS.filter(h=>h.nature===i);
    assert.strictEqual(own.length,4,`spec 5: basket ${n.label} should hold four herbs, has ${own.length}`);
    for(const h of own){
      const nat=h.taste.split('，')[1].split('；')[0];   // the part after the tastes, before any toxicity note
      assert.ok(nat.endsWith(n.label),`spec 5: ${h.name} 性味「${h.taste}」does not end in ${n.label}`);
      for(const other of NATURES)if(other!==n)assert.ok(!nat.includes(other.label),`spec 5: ${h.name} 性味 mixes natures`);
      assert.ok(h.note.length>=6&&h.note.length<=20,`spec 4: ${h.name} note is ${h.note.length} characters, card fits 6-20`);
    }
  });
});

test('a round lasts 75 seconds whatever the player does',()=>{
  for(const level of [null,'precise','human','shaky']){
    const r=play(3,0.5625,level).result;
    assert.ok(Math.abs(r.time-CFG.round)<0.05,`spec 5: ${level||'idle'} round lasted ${r.time.toFixed(2)}s, expected ${CFG.round}`);
  }
  assert.ok(CFG.round>=60&&CFG.round<=90,'spec 5: a round is 60-90 seconds');
});

test('readability: at most 4 herbs falling, never overlapping, inside the lane and below the score bar',()=>{
  for(const aspect of ASPECTS)for(const seed of SEEDS)for(const level of [null,'human']){
    const L=C.layout(H*Math.min(1.9,Math.max(0.45,aspect)));
    const s=play(seed,aspect,level,s=>{
      const hs=s.herbs.filter(h=>!h.grabbed);
      for(const h of hs)assert.ok(h.x-CFG.box.half>=L.x0-0.5&&h.x+CFG.box.half<=L.x1+0.5,`spec 3: herb at x ${h.x.toFixed(0)} leaves the lane (aspect ${aspect})`);
      for(const h of hs)assert.ok(h.y+CFG.box.bottom<=CFG.basketTop,`spec 3: herb name plate at ${(h.y+CFG.box.bottom).toFixed(0)} reaches into the basket row at ${CFG.basketTop}`);
      for(const h of hs)assert.ok(h.y-CFG.box.top>=CFG.hudBottom,`spec 3: herb top at ${(h.y-CFG.box.top).toFixed(0)} runs under the score bar that ends at ${CFG.hudBottom}`);
      for(let i=0;i<hs.length;i++)for(let j=i+1;j<hs.length;j++)
        assert.ok(Math.abs(hs[i].x-hs[j].x)>=2*CFG.box.half,`spec 3: two herbs share a column at t ${s.t.toFixed(2)} (aspect ${aspect}, seed ${seed})`);
    });
    assert.ok(s.peakLive<=CFG.maxLive,`spec 3: ${s.peakLive} herbs at once, ceiling ${CFG.maxLive}`);
  }
});

test('explanation cards never cover a herb, its name plate, the score bar or the baskets',()=>{
  let checked=0;
  for(const aspect of ASPECTS)for(const seed of SEEDS)for(const level of ['human','shaky',null]){
    const W=H*Math.min(1.9,Math.max(0.45,aspect));
    play(seed,aspect,level,s=>{for(const c of s.cards){
      assert.ok(c.x>=0&&c.x+c.w<=W,`spec 3: card leaves the screen sideways (aspect ${aspect})`);
      assert.ok(c.y>=CFG.hudBottom&&c.y+c.h<=CFG.basketTop-60,`spec 3: card at y ${c.y}-${c.y+c.h} overlaps the score bar or the basket row`);
      for(const h of s.herbs)if(!h.grabbed){checked++;assert.ok(!hits(h,c),`spec 3: card covers ${HERBS[h.k].name} at t ${s.t.toFixed(2)} (aspect ${aspect}, seed ${seed}, ${level||'idle'})`);}
    }});
  }
  assert.ok(checked>1000,'expected cards and herbs on screen together, checked '+checked);
});

test('every slip gets its card: 98% for ordinary players, 95% for shaky hands',()=>{
  for(const [level,floor] of [['human',0.98],['shaky',0.95]]){
    let shown=0,slips=0;
    for(const aspect of ASPECTS)for(const seed of SEEDS){const s=play(seed,aspect,level);shown+=s.cardsShown;slips+=s.cardsShown+s.cardsDropped;}
    assert.ok(slips>100,'expected plenty of slips to explain');
    assert.ok(shown/slips>=floor,`spec 4: ${level} sees ${(100*shown/slips).toFixed(1)}% of explanation cards, floor ${floor*100}%`);
  }
});

test('scoring: right answers build a combo, a wrong one resets it and explains',()=>{
  assert.deepStrictEqual([0,1,4,5,9,10,15,40].map(C.multiplier),[1,1,1,2,2,3,4,4],'spec 5: ×2 from 5 in a row, ×3 from 10, capped at ×4');
  const g=C.create({seed:2,aspect:0.5625}),s=g.state;let right=0;
  while(right<6){g.step(CFG.step);const h=s.herbs.find(h=>s.t-h.born>0.3);if(h){assert.strictEqual(g.tapBasket(HERBS[h.k].nature),true);right++;}}
  assert.strictEqual(s.combo,6);
  let h;while(!(h=s.herbs.find(h=>s.t-h.born>0.3)))g.step(CFG.step);
  const wrongBasket=(HERBS[h.k].nature+2)%4,score=s.score;
  assert.strictEqual(g.tapBasket(wrongBasket),false);
  assert.strictEqual(s.combo,0,'spec 5: a wrong basket resets the combo');assert.strictEqual(s.score,score,'spec 5: a wrong basket scores nothing');
  assert.ok(s.cards.length+s.cardQueue.length===1&&(s.cards[0]||s.cardQueue[0]).chosen===wrongBasket,'spec 4: the card shows what was chosen');
});

test('taps and drags: tap regions tile the basket row; a drag onto a basket files that herb, a drag elsewhere puts it back',()=>{
  for(const aspect of ASPECTS){
    const W=H*Math.min(1.9,Math.max(0.45,aspect)),L=C.layout(W);
    for(let x=L.x0+1;x<L.x1-1;x+=3)assert.ok(C.basketAt(L,x,CFG.basketTop+20)>=0,`spec 3: dead strip at x ${x.toFixed(0)} in the basket row (aspect ${aspect})`);
    assert.strictEqual(C.basketAt(L,W/2,CFG.tapTop-5),-1,'spec 3: taps above the basket row do nothing');
    for(const b of L.baskets)assert.ok(b.w>=104,`spec 3: basket ${b.i} is ${b.w.toFixed(0)} wide, floor 104 (aspect ${aspect})`);
  }
  const g=C.create({seed:4,aspect:0.5625}),s=g.state;
  while(!s.herbs.some(h=>s.t-h.born>0.3))g.step(CFG.step);
  const h=s.herbs.find(h=>s.t-h.born>0.3),gx=h.x,gy=h.y;
  assert.strictEqual(g.grab(h.x+10,h.y-10),h);g.step(0.5);assert.strictEqual(h.y,gy,'a held herb does not fall');
  g.carry(h,40,300);assert.strictEqual(g.release(h,40,300),null);assert.ok(!h.grabbed&&h.x===gx&&s.herbs.includes(h),'dropped outside: back to its column');
  g.grab(h.x,h.y);const B=s.L.baskets[HERBS[h.k].nature];g.carry(h,B.cx,B.cy);
  assert.strictEqual(g.release(h,B.cx,B.cy),true);assert.ok(!s.herbs.includes(h));assert.strictEqual(s.correct,1);
});

test('whole rounds by autopilot: idle, precise and human play',()=>{
  const idle=SEEDS.map(seed=>play(seed,0.5625,null).result);
  assert.ok(idle.every(r=>r.score===0&&r.filed===0&&r.missed>=30),'spec 5: nobody playing files nothing and drops every herb');
  const precise=[],human=[];
  for(const seed of SEEDS)for(const aspect of [0.5625,1.78]){precise.push(play(seed,aspect,'precise'));human.push(play(seed,aspect,'human'));}
  assert.ok(precise.every(s=>s.result.accuracy===1&&s.result.missed===0),'spec 5: flawless play files every herb correctly');
  assert.ok(precise.every(s=>s.seen.every(n=>n>=2)),'spec 5: every herb shows up at least twice in a round');
  const filed=mean(precise.map(s=>s.result.filed));assert.ok(filed>=45&&filed<=65,`spec 5: flawless play files ${filed.toFixed(1)} herbs, expected 45-65`);
  const acc=mean(human.map(s=>s.result.accuracy)),hf=mean(human.map(s=>s.result.filed)),miss=mean(human.map(s=>s.result.missed));
  assert.ok(acc>=0.68&&acc<=0.8,`spec 5: human-like accuracy ${(acc*100).toFixed(1)}%, expected 68-80%`);
  assert.ok(hf>=40,`spec 5: human-like play files ${hf.toFixed(1)} herbs, floor 40`);
  assert.ok(miss<=2,`spec 5: human-like play drops ${miss.toFixed(2)} herbs a round, ceiling 2`);
  assert.ok(mean(human.map(s=>s.result.score))<0.5*mean(precise.map(s=>s.result.score)),'spec 5: knowing the natures must be worth more than half the score');
});

test('shaky hands: the round still plays through and wobbly taps rarely change the basket',()=>{
  const shaky=[],human=[];
  for(const seed of SEEDS)for(const aspect of [0.46,0.5625,1.78]){shaky.push(play(seed,aspect,'shaky').result);human.push(play(seed,aspect,'human').result);}
  assert.ok(shaky.every(r=>Math.abs(r.time-CFG.round)<0.05&&r.filed>=35),'spec 5: shaky play finishes the round and files at least 35');
  const sa=mean(shaky.map(r=>r.accuracy)),ha=mean(human.map(r=>r.accuracy));
  assert.ok(sa>=0.6,`spec 5: shaky accuracy ${(sa*100).toFixed(1)}%, floor 60%`);
  assert.ok(ha-sa<=0.12,`spec 3: shaky hands lose ${((ha-sa)*100).toFixed(1)} points of accuracy to wobble, ceiling 12`);
  // only the shake, no wrong knowledge and no double taps: how often does the finger land in the wrong basket?
  const P=C.PILOTS;P.wobble={react:P.shaky.react,know:1,noise:P.shaky.noise,gap:P.shaky.gap,double:0};
  try{
    for(const [aspect,ceiling] of [[0.46,0.15],[0.5625,0.09],[0.75,0.04],[1.78,0.02]]){
      const w=SEEDS.map(seed=>{const r=play(seed,aspect,'wobble').result;return r.wrong/r.filed;});
      assert.ok(mean(w)<=ceiling,`spec 3: at aspect ${aspect} wobble alone lands in the wrong basket ${(mean(w)*100).toFixed(1)}% of taps, ceiling ${ceiling*100}%`);
    }
  }finally{delete P.wobble;}
});

test('the result keeps what went wrong, for the closing card',()=>{
  const s=play(5,0.5625,'human'),r=s.result;
  assert.strictEqual(r.slips.length,r.wrong+r.missed,'every slip is listed');
  for(const x of r.slips)assert.ok(x.chosen===-1||x.chosen!==HERBS[x.k].nature,'a slip is a miss or a wrong basket');
  assert.strictEqual(r.correct+r.wrong,r.filed);
});
