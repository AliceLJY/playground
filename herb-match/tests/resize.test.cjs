const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../src/core.js'),B=C.CFG.box;
const overlap=(a,b)=>a.x+B.half>b.x-B.half&&b.x+B.half>a.x-B.half&&a.y+B.bottom>b.y-B.top&&b.y+B.bottom>a.y-B.top;
test('rotation relays live herbs and cards without restarting the round',()=>{
  let herbs=0,cards=0;
  for(const level of [null,'human','shaky'])for(let seed=1;seed<=12;seed++){
    const g=C.create({seed,aspect:390/664}),s=g.state,p=level?C.pilot(level,seed):()=>{};
    for(let tick=0;tick<75*120&&s.phase!=='over';tick++){
      p(g);g.step(C.CFG.step);s.events.length=0;
      for(let i=0;i<s.herbs.length;i++)for(let j=i+1;j<s.herbs.length;j++)assert.ok(!overlap(s.herbs[i],s.herbs[j]),'herbs remain separate after rotation while falling');
      if(tick%240!==180)continue;
      const before={t:s.t,score:s.score,combo:s.combo,slips:s.slips.slice(),ids:s.herbs.map(h=>h.id)};
      const aspect=[844/340,320/568,390/664][Math.floor(tick/240)%3];
      assert.equal(typeof g.resize,'function','live rounds need a resize operation');g.resize(aspect);
      assert.equal(s.W,1000*Math.min(1.9,Math.max(.45,aspect)));
      assert.deepEqual(s.L,C.layout(s.W),'baskets use the same layout as a fresh round');
      assert.deepEqual({t:s.t,score:s.score,combo:s.combo,slips:s.slips.slice(),ids:s.herbs.map(h=>h.id)},before);
      for(const h of s.herbs){herbs++;assert.ok(h.x-B.half>=s.L.x0&&h.x+B.half<=s.L.x1);assert.ok(h.y-B.top>=140&&h.y+B.bottom<=800);}
      for(let i=0;i<s.herbs.length;i++)for(let j=i+1;j<s.herbs.length;j++)assert.ok(!overlap(s.herbs[i],s.herbs[j]),'relocated herbs must not overlap');
      for(const c of s.cards){cards++;assert.ok(c.x>=0&&c.x+c.w<=s.W&&c.y>=140&&c.y+c.h<=740);for(const h of s.herbs)assert.ok(!(h.x+B.half>c.x&&h.x-B.half<c.x+c.w&&h.y+B.bottom>c.y&&h.y-B.top<c.y+c.h),'relocated card covers a herb');}
    }
    assert.equal(s.phase,'over');assert.ok(s.result.time<75.05);
  }
  assert.ok(herbs>100&&cards>10,'rotation samples must include live herbs and cards');
});
test('resizing releases a held herb and preserves its identity',()=>{
  const g=C.create({seed:2,aspect:1.9}),s=g.state;while(!s.herbs.length)g.step(C.CFG.step);
  const h=s.herbs[0];g.grab(h.x,h.y);g.carry(h,1800,600);
  assert.equal(typeof g.resize,'function');g.resize(320/568);
  assert.ok(s.herbs.includes(h)&&!h.grabbed);assert.ok(h.x+B.half<=s.L.x1);
});
