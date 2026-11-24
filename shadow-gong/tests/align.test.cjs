// Does the picture agree with the verdict? A play report (2026-11-24) said the new hero sprite and the judgement did
// not line up: at a perfect parry the attacker ended up behind the hero's face, blades slid under the gong into his
// waist, and he stood inside the rat king. These checks sample real matches (both autopilots, several seeds) at the
// step a blow is judged, and measure what the renderer will draw: the hero from the sprite atlas (flowsprite.drawn),
// the opponents from the rig. World units; the hero stands 2.83 tall and his gong is 0.29 in radius.
const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../src/core.js');
const R=require('../src/rig.js');
const G=require('../src/stage.js');
const F=require('../src/flowsprite.js');

const heroDrawn=(s)=>F.drawn(s.player,s.time,R.pose('player',s.player,s.time),G.screen.left,G.screen.right);
// How far a part of the hero's silhouette (his body column, the square around his gong) reaches into an opponent's
// trunk, measured only at the heights that part occupies: a rat king leaning in has his shoulders above the hero's head.
const reach=(part,kind,solved)=>{const t=R.trunk(kind,solved,part.minY,part.maxY);return t?Math.max(0,Math.min(part.maxX,t.maxX)-Math.max(part.minX,t.minX)):0;};

// One pass over the matches; every test below reads from it.
let cache=null;
function sample(){
  if(cache)return cache;
  const blows=[],room=()=>({steps:0,body:0,gong:0,bodyAt:'',gongAt:''}),crowd={rat:room(),scissors:room()};
  for(const human of [false,true])for(const seed of [2,4,7,9,15]){
    const s=C.create({seed});C.start(s);let lastDodge=-9;
    for(let f=0;f<120*900&&!['won','lost'].includes(s.phase);f++){
      s.events.length=0;C.run(s,1/120,C.autopilot(s,{human}));
      const p=s.player;if(p.state==='dodge')lastDodge=s.time;
      for(const ev of s.events){
        if(ev.type!=='strike'||!['perfect','block'].includes(ev.outcome))continue;
        const e=s.enemies.find(x=>x.id===ev.id);if(!e)continue;
        const tip=R.point(e.kind,R.solve(e.kind,R.pose(e.kind,e,s.time)),'weapon'),d=heroDrawn(s);
        blows.push({seed,human,kind:e.kind,move:ev.move,strike:ev.strike,outcome:ev.outcome,state:e.state,face:p.face,from:-e.face,
          bodyAhead:(e.x-p.x)*p.face,tipAhead:(tip.x-p.x)*p.face,gap:Math.hypot(tip.x-d.gong.x,tip.y-d.gong.y),r:d.gong.r,
          where:`${e.kind}.${ev.move}#${ev.strike} seed ${seed}${human?' shaky':''} t=${s.time.toFixed(2)}`});
      }
      // standing room: how far the hero's drawn box reaches into a grounded opponent's trunk, in world units.
      // A dodge rolls through on purpose (and slides clear just after); a body fading in or out is not on the cloth yet.
      if(s.phase==='fight'&&p.state!=='dodge'&&s.time-lastDodge>.4&&p.state!=='dead'){
        const d=heroDrawn(s);
        for(const e of s.enemies){
          if(!crowd[e.kind]||['dead','intro','enter'].includes(e.state)||(e.depth||0)>0)continue;
          const solved=R.solve(e.kind,R.pose(e.kind,e,s.time)),c=crowd[e.kind];c.steps++;
          for(const part of ['body','gong']){
            const v=d.parts[part]?reach(d.parts[part],e.kind,solved):0;
            if(v>c[part]){c[part]=v;c[part+'At']=`seed ${seed}${human?' shaky':''} t=${s.time.toFixed(2)} hero ${p.state} x=${p.x.toFixed(2)}, ${e.kind} ${e.state} x=${e.x.toFixed(2)}`;}
          }
        }
      }
    }
  }
  return cache={blows,crowd};
}
const perfects=()=>sample().blows.filter(b=>b.outcome==='perfect');
const worst=(list,key)=>list.reduce((a,b)=>b[key]>a[key]?b:a);

test('the gong the simulation aims at is the gong the sprite holds up while guarding',()=>{
  const want=C.PLAYER.gong;assert.ok(want,'core.js states where the gong is held');
  const M=F.META,w=M.worldPerPx,frames=new Set([...M.anims.guard,...M.anims.parry]);
  for(const i of frames){
    const [gx,gy,gr]=M.gong[i],x=(gx-M.root[0])*w,y=(M.root[1]-gy)*w,r=gr*w;
    assert.ok(Math.abs(x-want.x)<=.05&&Math.abs(y-want.y)<=.03&&Math.abs(r-want.r)<=.02,`frame ${i}: gong at (${x.toFixed(3)}, ${y.toFixed(3)}) r ${r.toFixed(3)}, core says (${want.x}, ${want.y}) r ${want.r}`);
  }
});

test('the sprite mirrors with the hero: gong and body box swap sides, nothing else moves',()=>{
  const p={x:1,y:0,face:1,state:'guard',st:.2},a=F.drawn(p,3,{x:1,y:0,face:1},-8,8),b=F.drawn({...p,face:-1},3,{x:1,y:0,face:-1},-8,8);
  assert.equal(a.frame,b.frame);
  assert.ok(a.gong.x>1&&b.gong.x<1,'the gong is on the side the hero faces');
  assert.ok(Math.abs((a.gong.x-1)+(b.gong.x-1))<1e-9&&Math.abs(a.gong.y-b.gong.y)<1e-9);
  assert.ok(Math.abs((a.box.maxX-1)+(b.box.minX-1))<1e-9,'the body box mirrors about the feet');
});

test('at a perfect parry the hero faces the blow: attacker and weapon are in front of him, from the left and from the right',()=>{
  const list=perfects(),left=list.filter(b=>b.from<0),right=list.filter(b=>b.from>0);
  assert.ok(left.length>=40&&right.length>=40,`perfect parries sampled from the left ${left.length}, from the right ${right.length}`);
  for(const b of list){
    assert.equal(b.face,b.from,`${b.where}: the hero faces ${b.face}, the blow came from ${b.from}`);
    assert.ok(b.bodyAhead>0,`${b.where}: the attacker's body is ${(-b.bodyAhead).toFixed(2)} behind the hero's feet`);
    assert.ok(b.tipAhead>0,`${b.where}: the weapon is ${(-b.tipAhead).toFixed(2)} behind the hero's feet (${b.state})`);
  }
});

test('at a perfect parry the weapon rests on the gong: its tip is within one gong radius of the gong centre',()=>{
  const list=perfects(),by={};
  for(const b of list)(by[b.kind]=by[b.kind]||[]).push(b);
  for(const kind of ['moth','scissors','rat'])assert.ok((by[kind]||[]).length>=30,`perfect parries against ${kind}: ${(by[kind]||[]).length}`);
  assert.ok(list.some(b=>b.move==='thrust')&&list.some(b=>b.move==='snip'&&b.strike===1)&&list.some(b=>b.move==='ladle'&&b.strike===2),'thrusts, second snips and third ladle swings were all parried');
  for(const kind of Object.keys(by)){
    const w=worst(by[kind],'gap');
    assert.ok(w.gap<=w.r,`${w.where}: weapon tip ${w.gap.toFixed(2)} from the gong centre, gong radius ${w.r.toFixed(2)} (${w.state})`);
  }
});

test('a plain block also meets the gong, before the push-back: tip within two gong radii',()=>{
  const list=sample().blows.filter(b=>b.outcome==='block');
  assert.ok(list.length>=40,'plain blocks sampled: '+list.length);
  const w=worst(list,'gap');
  assert.ok(w.gap<=2*w.r,`${w.where}: weapon tip ${w.gap.toFixed(2)} from the gong centre, gong radius ${w.r.toFixed(2)}`);
});

test('the hero is not drawn inside a grounded opponent: the gong may touch the rat king or a blade, its centre never goes in',()=>{
  const {crowd}=sample(),r=F.META.gong[F.META.anims.guard[0]][2]*F.META.worldPerPx;
  for(const kind of ['rat','scissors']){
    const c=crowd[kind];
    assert.ok(c.steps>3000,`${kind}: steps sampled ${c.steps}`);
    assert.ok(c.body<=.02,`${kind}: the hero's body is ${c.body.toFixed(2)} inside its trunk at ${c.bodyAt}`);
    assert.ok(c.gong<=r,`${kind}: the gong reaches ${c.gong.toFixed(2)} into its trunk (gong radius ${r.toFixed(2)}) at ${c.gongAt}`);
  }
});
