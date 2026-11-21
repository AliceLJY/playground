// Rules, pacing, legibility and layout checks for 小黑煤球盖广州. Thresholds come from SPEC.md section 8 and are measured on real simulated play.
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../src/core.js'),B=require('../src/buildings.js');
const SEEDS=Array.from({length:20},(_,i)=>i+1);
const med=a=>{a=[...a].sort((x,y)=>x-y);return a[a.length>>1];};
const cache={};
const runs=level=>cache[level]||(cache[level]=SEEDS.map(s=>C.run(B,s,level,{limit:3600*3}).state));

test('buildings: three, in order, data consistent with the painting grid',()=>{
  assert.deepEqual(B.map(b=>b.name),['骑楼','陈家祠','镇海楼']);
  for(const b of B){
    assert.equal(b.cells.length,b.rows,`${b.name}: one string per brick row`);
    b.cells.forEach((r,i)=>assert.equal(r.length,b.cols+(i%2),`${b.name} row ${i}: running bond needs ${b.cols+(i%2)} cells`));
    const n=b.cells.join('').replace(/\./g,'').length;
    assert.equal(n,b.total,`${b.name}: total equals the bricks in the grid`);
    assert.equal(b.stages[b.stages.length-1].upTo,b.total,`${b.name}: last stage ends at the top`);
    for(let i=1;i<b.stages.length;i++)assert.ok(b.stages[i].upTo>b.stages[i-1].upTo,`${b.name}: stages go up`);
    for(const ch of b.cells.join(''))if(ch!=='.')assert.ok('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.indexOf(ch)<b.palette.length,`${b.name}: palette index in range`);
    assert.ok(b.total>B[0].total*0.9,'later buildings are not smaller than the first');
  }
});

test('spec 8.1: same seed gives the same game',()=>{
  const a=C.run(B,7,'normal').state,b=C.run(B,7,'normal').state;
  assert.deepEqual({t:a.t,lv:a.lv,bt:a.buildTimes,coins:a.coins},{t:b.t,lv:b.lv,bt:b.buildTimes,coins:b.coins});
});

test('spec 8.2: a normal first-time player finishes 骑楼 in 2.5-7 minutes (median), never over 9',()=>{
  const t=runs('normal').map(s=>s.buildTimes[0]/60);
  assert.ok(t.every(x=>x>0),'every run finished the first building');
  const m=med(t);
  assert.ok(m>=2.5&&m<=7,`median first building ${m.toFixed(2)} min outside 2.5-7`);
  assert.ok(Math.max(...t)<=9,`slowest first building ${Math.max(...t).toFixed(2)} min over 9`);
});

test('spec 8.3: never tapping the building still finishes 骑楼 within 15 minutes',()=>{
  const t=runs('idle').map(s=>s.buildTimes[0]/60);
  assert.ok(Math.max(...t)<=15,`idle first building took ${Math.max(...t).toFixed(2)} min`);
  assert.ok(med(t)>med(runs('normal').map(s=>s.buildTimes[0]/60)),'tapping must help on the first building');
});

test('spec 8.4: each building takes longer than the one before; all three within 40 minutes',()=>{
  for(const level of ['normal','idle']){
    const st=runs(level);assert.ok(st.every(s=>s.phase==='album'),`${level}: every run reached the album`);
    const m=[0,1,2].map(i=>med(st.map(s=>s.buildTimes[i])));
    assert.ok(m[1]>m[0]&&m[2]>m[1],`${level}: medians ${m.map(x=>(x/60).toFixed(1)).join(' / ')} min do not grow`);
    const total=med(st.map(s=>s.buildTimes.reduce((a,b)=>a+b,0)))/60;
    assert.ok(total<=40,`${level}: three buildings take ${total.toFixed(1)} min`);
  }
});

test('spec 8.5: all four upgrades get used, none prices itself out',()=>{
  for(const s of runs('normal'))for(const k of C.KINDS)assert.ok(s.stats.buy[k]>=3,`seed ${s.seed}: ${k} bought only ${s.stats.buy[k]} times`);
  // on the last building every upgrade is still being bought
  for(const seed of SEEDS.slice(0,6)){
    const seen={};C.run(B,seed,'normal',{watch:(s)=>{if(s.bi===2)for(const e of s.events)if(e.type==='buy')seen[e.kind]=1;}});
    for(const k of C.KINDS)assert.ok(seen[k],`seed ${seed}: ${k} never bought on 镇海楼`);
  }
});

test('spec 8.6: the goal is always on screen; the first hint points at the building, then at an affordable card',()=>{
  const g=C.create({buildings:B,seed:3});
  assert.equal(g.hint().target,'building','first thing the player is told: tap the building');
  for(let i=0;i<5;i++){g.tap();g.step(0.2);}
  for(let i=0;i<300&&!g.canBuy('hire');i++)g.step(0.1);
  assert.equal(g.hint().target,'hire','after five taps and enough coins the hint points at 招煤球');
  for(const s of SEEDS.slice(0,5)){
    let checked=0,n=0;C.run(B,s,'normal',{watch:(st,gg)=>{if(st.phase!=='play'||(n++%50))return;checked++;
      const goal=gg.goal();assert.match(goal.text,/^(还剩|最后) \d+ 块！?$/);assert.ok(goal.stageName&&goal.stageSize>0,'target line has a name and a size');
      const h=gg.hint();assert.ok(h.text.length>0,'there is always a hint line');
      if(C.KINDS.includes(h.target))assert.ok(gg.canBuy(h.target),`hint points at ${h.target} but it cannot be bought`);}});
    assert.ok(checked>20);
  }
  const g2=C.create({buildings:B,seed:1});g2.state.laid=B[0].total-10;
  assert.equal(g2.goal().text,'最后 10 块！','last tenth switches to 最后 N 块！');
});

test('spec 8.7: the sample really contains the skill, the tea cart, all three events and the stage reveals',()=>{
  const st=runs('normal');const sum=k=>st.reduce((a,s)=>a+s.stats[k],0);
  assert.ok(st.every(s=>s.stats.skill>=3),'skill used several times in every run');
  assert.ok(sum('tea')>=SEEDS.length,'tea cart collected');
  assert.ok(sum('teaMissed')>0,'and sometimes missed (the normal pilot is not perfect)');
  assert.ok(sum('wind')>0&&sum('bricks')>0,'wind and old-brick events happen');
  assert.ok(st.every(s=>s.stats.stages===B.reduce((a,b)=>a+b.stages.length,0)),'every stage of every building completed and announced');
  // the first event is always the tea cart, early enough to be met in the first minute
  const g=C.create({buildings:B,seed:9});while(!g.state.event&&g.state.t<60)g.step(0.1);
  assert.ok(g.state.event&&g.state.event.kind==='tea'&&g.state.t<45,'tea cart arrives within the first 45 s');
  const g3=C.create({buildings:B,seed:9});while(!g3.skillReady())g3.step(0.1);assert.ok(g3.state.t<=26,'skill first ready by 26 s');
});

test('rules: taps are rate limited, buying respects money and the shed, save/load round-trips',()=>{
  const g=C.create({buildings:B,seed:2});
  assert.equal(g.tap(),true);assert.equal(g.tap(),false,'second tap in the same instant is ignored');
  g.step(0.11);assert.equal(g.tap(),true);
  assert.equal(g.buy('hire'),false,'cannot buy without coins');
  g.state.coins=1e6;while(g.buy('hire'));assert.equal(g.state.balls,g.cap(),'hiring stops at the shed size');
  const o=JSON.parse(JSON.stringify(g.save()));const h=C.create({buildings:B,seed:5});assert.ok(h.load(o));
  assert.deepEqual([h.state.balls,h.state.lv,h.state.coins],[g.state.balls,g.state.lv,g.state.coins]);
  assert.equal(h.load({v:2}),false,'unknown saves are refused');
});

test('spec 8.8: buttons never overlap each other or the readouts, stay on screen, and are at least 44 px',()=>{
  const VPS=[[360,560],[360,640],[375,553],[390,664],[412,700],[430,760]];
  for(const [w,h] of VPS)for(const b of B)for(const safe of [0,20]){
    const L=C.layout(w,h,b.aspect,safe),tag=`${w}x${h} ${b.name} safe ${safe}`;
    const btns=[...L.cards.map(c=>({n:'card '+c.kind,r:c})),{n:'skill',r:L.skill},{n:'album',r:L.album}];
    for(const x of btns){
      assert.ok(x.r.w>=44&&x.r.h>=44,`${tag}: ${x.n} smaller than 44 px`);
      assert.ok(x.r.x>=0&&x.r.y>=0&&x.r.x+x.r.w<=w&&x.r.y+x.r.h<=h-safe,`${tag}: ${x.n} off screen`);
    }
    for(let i=0;i<btns.length;i++)for(let j=i+1;j<btns.length;j++)assert.ok(!C.overlaps(btns[i].r,btns[j].r),`${tag}: ${btns[i].n} overlaps ${btns[j].n}`);
    const reads=[{n:'goal row',r:L.goal},{n:'coins',r:{x:0,y:0,w:150,h:52}},{n:'progress',r:{x:w-50-8-118,y:0,w:118,h:46}}];
    for(const x of btns)for(const rd of reads)if(x.n!=='album'||rd.n==='goal row')assert.ok(!C.overlaps(x.r,rd.r),`${tag}: ${x.n} covers ${rd.n}`);
    assert.ok(!C.overlaps(L.album,{x:w-50-8-118,y:0,w:118,h:46}),`${tag}: album button covers the progress bar`);
    const R=L.building;assert.ok(R.y>=L.stage.y&&R.x>=0&&R.x+R.w<=w&&R.y+R.h<=L.ground+0.5,`${tag}: building leaves the stage`);
    assert.ok(R.h>=(L.ground-L.stage.y)*0.5||R.w>=w*0.8,`${tag}: building too small (${R.w.toFixed(0)}x${R.h.toFixed(0)})`);
    assert.ok(L.button.y+L.button.h<=h-safe&&L.button.w>=200&&L.button.h>=44,`${tag}: overlay button off screen`);
    // the tea cart along its whole path: inside the stage, never over a card or the skill button
    for(const p of [0,0.25,0.5,0.75,1])for(const dir of [1,-1]){
      const er=C.eventRect(L,{t:p*10,event:{kind:'tea',start:0,end:10,dir}});
      assert.ok(er.x>=0&&er.x+er.w<=w&&er.y>=L.stage.y,`${tag}: tea cart off stage at ${p}`);
      for(const c of L.cards)assert.ok(!C.overlaps(er,c),`${tag}: tea cart over a card`);
      assert.ok(!C.overlaps(er,L.skill),`${tag}: tea cart over the skill button`);
    }
  }
});
