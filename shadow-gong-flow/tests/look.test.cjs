// Composition rules from SPEC.md §6, measured on real matches: silhouettes come from the puppet rigs posed by
// simulation state, and positions go through the same camera framing function the game renders with.
const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../src/core.js');
const R=require('../src/rig.js');
const G=require('../src/stage.js');
const ASPECTS={'16:9':16/9,'4:3':4/3,'19.5:9':19.5/9};
const frac=(aspect,p)=>G.project(G.frame(aspect,'play'),aspect,p);
const pct=v=>(v*100).toFixed(1)+'%';

// Run a seeded match one simulation step at a time and let the caller inspect every step.
function sample(seed,human,visit){
  const s=C.create({seed});C.start(s);
  for(let f=0;f<120*900&&!['won','lost'].includes(s.phase);f++){s.events.length=0;C.run(s,1/120,C.autopilot(s,{human}));visit(s);}
  return s;
}
function heightFrac(kind,actor,aspect,t){
  const b=R.bounds(kind,R.pose(kind,actor,t));
  return frac(aspect,{x:actor.x,y:b.maxY}).y-frac(aspect,{x:actor.x,y:b.minY}).y;
}
const quantile=(a,q)=>{const v=a.slice().sort((x,y)=>x-y);return v[Math.min(v.length-1,Math.floor(q*v.length))];};

test('the play shot frames the cloth: 86–96% of a 16:9 width, standing line 18–30% up at every aspect',()=>{
  const a=16/9,width=frac(a,{x:G.screen.right,y:2}).x-frac(a,{x:G.screen.left,y:2}).x;
  assert.ok(width>=.86&&width<=.96,'cloth width '+pct(width));
  for(const [name,aspect] of Object.entries(ASPECTS)){
    const f=frac(aspect,{x:0,y:G.floor}).y;assert.ok(f>=.18&&f<=.30,`${name}: standing line at ${pct(f)}`);
  }
});

test('the lamp sits 60% up the cloth and the corners fall under 35% of its brightness',()=>{
  const lum=(x,y)=>G.luminance(G.clothLinear(x,y)),c=lum(G.hot.x,G.hot.y),{left,right,bottom,top}=G.screen;
  assert.ok(Math.abs((G.hot.y-bottom)/(top-bottom)-.6)<1e-9);
  for(const [x,y] of [[left,bottom],[right,bottom],[left,top],[right,top]])assert.ok(lum(x,y)/c<.35,`corner ${x},${y} at ${pct(lum(x,y)/c)}`);
  let prev=Infinity;for(let r=0;r<=1;r+=.05){const v=lum(G.hot.x+r*right,G.hot.y-r*(G.hot.y-bottom));assert.ok(v<=prev+1e-12,'brightness keeps falling away from the lamp');prev=v;}
});

test('standing silhouettes: the hero is 24–34% of the frame height at 16:9 (at least 18% at 4:3), the rat king 38–52%',()=>{
  const hero=[],hero43=[],rat=[];
  for(const seed of [4,6])sample(seed,false,s=>{
    const p=s.player;
    if(['idle','walk','guard'].includes(p.state)){hero.push(heightFrac('player',p,16/9,s.time));hero43.push(heightFrac('player',p,4/3,s.time));}
    for(const e of s.enemies)if(e.kind==='rat'&&['idle','walk'].includes(e.state)&&!e.depth)rat.push(heightFrac('rat',e,16/9,s.time));
  });
  assert.ok(hero.length>500&&rat.length>100,'enough standing frames were sampled');
  for(const q of [.05,.5,.95]){
    assert.ok(quantile(hero,q)>=.24&&quantile(hero,q)<=.34,`hero ${q} quantile ${pct(quantile(hero,q))}`);
    assert.ok(quantile(rat,q)>=.38&&quantile(rat,q)<=.52,`rat king ${q} quantile ${pct(quantile(rat,q))}`);
  }
  assert.ok(quantile(hero43,.05)>=.18,'hero at 4:3 '+pct(quantile(hero43,.05)));
});

test('every telegraph shows the whole attacker inside the 4–96% safe area at 16:9, 4:3 and 19.5:9',()=>{
  let count=0;
  for(const human of [false,true])for(const seed of [2,9,15])sample(seed,human,s=>{
    for(const ev of s.events){
      if(ev.type!=='telegraph')continue;
      const e=s.enemies.find(x=>x.id===ev.id),b=R.bounds(e.kind,R.pose(e.kind,e,s.time));count++;
      for(const [name,aspect] of Object.entries(ASPECTS))for(const [x,y] of [[b.minX,b.minY],[b.maxX,b.maxY],[b.minX,b.maxY],[b.maxX,b.minY]]){
        const f=frac(aspect,{x,y});
        assert.ok(f.x>=.04&&f.x<=.96&&f.y>=.04&&f.y<=.96,`${e.kind}.${ev.move} telegraph at ${name}: corner (${pct(f.x)}, ${pct(f.y)})`);
      }
    }
  });
  assert.ok(count>200,'telegraphs checked: '+count);
});

test('empty chairs in the foreground stay out of the play shot and below the standing line',()=>{
  for(const [name,aspect] of Object.entries(ASPECTS)){
    const floor=frac(aspect,{x:0,y:G.floor}).y;
    for(const row of G.chairs)for(let i=0;i<row.count;i++){
      const x=(i-(row.count-1)/2)*row.spacing,top=frac(aspect,{x,y:row.y+row.h,z:row.z}).y;
      assert.ok(top<Math.min(0,floor-.02),`${name}: chair top at ${pct(top)}`);
    }
  }
});
