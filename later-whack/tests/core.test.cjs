// Rules, difficulty and composition checks for 推到以后. Every threshold comes from SPEC.md and is measured on real simulated rounds.
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../src/core.js'),{CFG,LW}=C;
const SEEDS=Array.from({length:24},(_,i)=>i+1),WIDE=Array.from({length:40},(_,i)=>i+1);
const rounds=level=>WIDE.map(s=>C.run(s,level).result);
const share=(a,b)=>a/b;

test('spec 6.1: same seed gives the same round',()=>{
  assert.deepEqual(C.run(7,'human').result,C.run(7,'human').result,'fixed views depend on a seed replaying identically');
});

test('spec 6.2: most pop-ups are tails, 等她 is rare, observers a little more',()=>{
  const n={tail:0,wait:0,observer:0};
  for(const s of SEEDS){const r=C.run(s,'precise').result;for(const k in n)n[k]+=r.spawned[k];}
  const all=n.tail+n.wait+n.observer;
  assert.ok(share(n.wait,all)>=0.04&&share(n.wait,all)<=0.10,`等她 share ${(100*n.wait/all).toFixed(1)}% outside 4%-10%`);
  assert.ok(share(n.observer,all)>=0.10&&share(n.observer,all)<=0.20,`observer share ${(100*n.observer/all).toFixed(1)}% outside 10%-20%`);
  assert.ok(share(n.tail,all)>=0.70,`tails only ${(100*n.tail/all).toFixed(1)}%, spec wants at least 70%`);
});

test('spec 6.3: every pop-up is warned at least 0.35 s ahead; a tail always gives at least 0.8 s, less late than early',()=>{
  const early=[],late=[];let n=0;
  for(const s of SEEDS)C.run(s,'precise',st=>{for(const e of st.ents){if(e._seen)continue;e._seen=1;n++;
    assert.ok(e.upAt-e.born>=0.35,`warning lead ${(e.upAt-e.born).toFixed(2)} s under 0.35 s`);
    if(e.kind==='tail'){const w=e.leaveAt-e.fullAt;assert.ok(w>=0.8-1e-9,`tail reaction window ${w.toFixed(3)} s under 0.8 s at t=${e.born.toFixed(1)}`);(e.born<15?early:e.born>45?late:[]).push(w);}
  }});
  assert.ok(n>1000,'expected full rounds of pop-ups');
  const m=a=>a.reduce((x,y)=>x+y,0)/a.length;
  assert.ok(m(late)<m(early)-0.4,`late window ${m(late).toFixed(2)} s should be clearly shorter than early ${m(early).toFixed(2)} s`);
});

test('spec 6.4: faster and more at once as the round goes on, never more than 6',()=>{
  let first=0,last=0,peak=0,crowded=0;
  for(const s of SEEDS){let lp=0;C.run(s,'precise',st=>{for(const e of st.ents){if(e._seen)continue;e._seen=1;if(e.born<15)first++;if(e.born>=45)last++;}
    const live=st.ents.filter(e=>e.state!=='gone').length;peak=Math.max(peak,live);if(st.t>=40)lp=Math.max(lp,st.ents.filter(e=>e.state==='up').length);});
    if(lp>=3)crowded++;}
  assert.ok(last>=first*1.8,`last 15 s spawned ${last}, first 15 s ${first}: spec wants at least 1.8x`);
  assert.ok(crowded>=SEEDS.length*0.8,`only ${crowded}/${SEEDS.length} seeds had three up at once in the last 20 s`);
  assert.ok(peak<=6,`${peak} on screen at once, ceiling is 6`);
});

test('spec 6.5: precise thumb always gets through; a shaky human neither always wins nor always loses',()=>{
  const p=rounds('precise');
  assert.ok(p.every(r=>r.reason==='time'),'precise autopilot lost a round: the game is unfair even to perfect play');
  const h=rounds('human'),wins=h.filter(r=>r.reason==='time').length,rate=wins/h.length;
  assert.ok(rate>=0.25,`human win rate ${(rate*100).toFixed(0)}%: too hard (spec 25%-85%)`);
  assert.ok(rate<=0.85,`human win rate ${(rate*100).toFixed(0)}%: too easy (spec 25%-85%)`);
  for(const r of h)if(r.reason==='pile')assert.ok(r.time>=20,`a human round was lost at ${r.time} s, before the 20 s learning stretch ends`);
});

test('spec 6.6: whacking everything that pops up loses, and a fresh round plays normally again',()=>{
  const r=rounds('reckless'),lost=r.filter(x=>x.reason==='pile').length;
  assert.ok(lost>=r.length*0.8,`reckless autopilot lost only ${lost}/${r.length}: hammering 等她 and observers carries no pressure`);
  const g=C.create({seed:3}),pl=C.pilot('reckless',3);
  while(g.state.phase!=='over'){pl(g);g.step(CFG.step);g.state.events.length=0;}
  assert.equal(g.state.result.reason,'pile');
  const again=C.create({seed:3}),pp=C.pilot('precise',3);
  assert.equal(again.state.pile.length,0);assert.equal(again.state.score,0);assert.equal(again.state.lockUntil,0);
  while(again.state.phase!=='over'){pp(again);again.step(CFG.step);again.state.events.length=0;}
  assert.equal(again.state.result.reason,'time','after a reckless loss a new round must play out normally');
});

test('spec 6.7: the samples really contain the things under test',()=>{
  const h=rounds('human'),sum=k=>h.reduce((a,r)=>a+r[k],0);
  assert.ok(sum('wrong')>=10,`human rounds misread 等她 only ${sum('wrong')} times: the penalty is never exercised`);
  assert.ok(sum('bounced')>=10,`human rounds bounced off observers only ${sum('bounced')} times`);
  assert.ok(sum('missed')>=20,`human rounds let only ${sum('missed')} tails slip`);
  assert.ok(sum('cleared')>=5,`a combo of 10 cleared the pile only ${sum('cleared')} times`);
  const kids=new Set();for(const s of SEEDS)C.run(s,'precise',st=>{for(const e of st.ents)if(e.kind==='wait')kids.add(e.holder);});
  assert.ok(kids.has('wuyou')&&kids.has('wulv')&&kids.has('adult'),'无忧, 无虑 and grown-ups should all hold up 等她');
});

test('spec 6.8: signs stay on screen, never overlap a neighbour, and the tap box covers person and sign',()=>{
  let frames=0;
  for(const s of SEEDS.slice(0,8))C.run(s,'human',st=>{
    const up=st.ents.filter(e=>e.state!=='gone');
    const rs=up.map(e=>({e,r:C.signRect(e,st.t)}));
    for(const {e,r} of rs){
      assert.ok(r.x>=0&&r.x+r.w<=LW,`${e.kind} sign at x ${r.x}-${r.x+r.w} leaves the 0-${LW} frame`);
      assert.ok(r.y>=26,`${e.kind} sign top ${r.y} runs into the top bar`);
      const b=C.hitBox(e.cell),{x,y}=C.cellXY(e.cell);
      assert.ok(r.x>=b.x-1&&r.x+r.w<=b.x+b.w+1&&r.y>=b.y-1,`${e.kind} sign is outside its own tap box`);
      assert.ok(y-24>=b.y&&y<=b.y+b.h,'the person must be inside the tap box');
      assert.equal(C.cellAt(x,y-20),e.cell);
    }
    for(let i=0;i<rs.length;i++)for(let j=i+1;j<rs.length;j++){const a=rs[i].r,b=rs[j].r;
      assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y,`signs of desks ${rs[i].e.cell} and ${rs[j].e.cell} overlap`);}
    frames++;
  });
  assert.ok(frames>120*30);
  for(let c=0;c<9;c++)for(let d=c+1;d<9;d++){const a=C.hitBox(c),b=C.hitBox(d);
    assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y,`tap boxes ${c} and ${d} overlap`);}
});

test('spec 2: signs only say generic things',()=>{
  for(const t of [...C.TAILS,C.WAIT,C.OBSERVE]){
    assert.ok(!/[0-9A-Za-z._/\\:@]/.test(t),`sign text "${t}" contains digits, letters or path characters`);
    assert.ok(t.length*6+6<=C.CELL-2||t.length<=7,`sign text "${t}" is wider than one desk`);
  }
});

test('rules: tail scores with doubling combo, 等她 costs 50 and the combo, observer only wastes time',()=>{
  assert.deepEqual([1,3,4,7,8,11,12,30].map(C.multiplier),[1,1,2,2,4,4,8,8]);
  const g=C.create({seed:9}),s=g.state;
  const until=f=>{for(let i=0;i<120*60&&s.phase!=="over";i++){s.pile.length=0;g.step(CFG.step);const e=f();if(e)return e;}};
  const at=e=>{const {x,y}=C.cellXY(e.cell);return[x,y-20];};
  const tail=until(()=>s.ents.find(e=>e.kind==='tail'&&e.state==='up'));
  assert.equal(g.tap(...at(tail)).type,'hit');assert.equal(s.score,10);assert.equal(s.combo,1);
  const wait=until(()=>s.ents.find(e=>e.kind==='wait'&&e.state==='up'));
  s.score=120;s.combo=5;assert.equal(g.tap(...at(wait)).type,'wrong');assert.equal(s.score,70);assert.equal(s.combo,0);
  assert.equal(wait.state,'up','a 等她 that was hit keeps waiting');
  const obs=until(()=>s.t>=s.lockUntil&&s.ents.find(e=>e.kind==='observer'&&e.state==='up'));
  s.combo=3;const before=s.score;assert.equal(g.tap(...at(obs)).type,'bounce');
  assert.equal(s.score,before);assert.equal(s.combo,3,'hitting an observer keeps the combo');assert.equal(obs.state,'up','an observer stays put');
  assert.ok(Math.abs(s.lockUntil-s.t-0.7)<1e-9,'the slipper bounces off for 0.7 s');
  assert.equal(g.tap(...at(obs)).type,'locked','taps during the bounce do nothing');
  assert.equal(g.tap(1,30).type,'locked');
});

test('rules: three missed tails end the round; a combo of 10 fixes one from the pile',()=>{
  const g=C.create({seed:4}),s=g.state;
  while(s.phase!=='over')g.step(CFG.step);
  assert.equal(s.result.reason,'pile');assert.equal(s.pile.length,3);
  const h=C.create({seed:4}),t=h.state;t.pile=['先这样吧','回头再修'];t.combo=9;
  for(let i=0;i<120*20;i++){h.step(CFG.step);const e=t.ents.find(x=>x.kind==='tail'&&x.state==='up');if(e){const {x,y}=C.cellXY(e.cell);h.tap(x,y-20);break;}}
  assert.equal(t.combo,10);assert.equal(t.pile.length,1);assert.equal(t.stats.cleared,1);
});

test('rules: tapping an empty desk breaks the combo and blocks the slipper for 0.25 s',()=>{
  const g=C.create({seed:1}),s=g.state;g.step(0.1);s.combo=6;
  assert.equal(g.tap(75,120).type,'whiff');assert.equal(s.combo,0);
  assert.equal(g.tap(75,120).type,'locked');g.step(0.26);assert.equal(g.tap(75,120).type,'whiff');
});
