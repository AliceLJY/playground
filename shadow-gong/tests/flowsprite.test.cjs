const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path');
const F=require('../src/flowsprite.js');
const C=require('../src/core.js');
const M=F.META,ASSETS=path.join(__dirname,'..','assets');

// WebP canvas size from the RIFF header (VP8X, VP8L or VP8 chunk)
function webpSize(buf){
  assert.equal(buf.toString('ascii',0,4),'RIFF');assert.equal(buf.toString('ascii',8,12),'WEBP');
  const kind=buf.toString('ascii',12,16);
  if(kind==='VP8X')return[1+buf.readUIntLE(24,3),1+buf.readUIntLE(27,3)];
  if(kind==='VP8L'){const b=buf.readUInt32LE(21);return[1+(b&0x3FFF),1+((b>>14)&0x3FFF)];}
  if(kind==='VP8 ')return[buf.readUInt16LE(26)&0x3FFF,buf.readUInt16LE(28)&0x3FFF];
  throw new Error('unknown webp chunk '+kind);
}

test('sprite atlas file is there, matches its metadata and fits a 4096 texture',()=>{
  const json=JSON.parse(fs.readFileSync(path.join(ASSETS,'tongluozai-atlas.json'),'utf8'));
  assert.deepEqual(json.anims,M.anims,'flowsprite.js carries the same frame table as the atlas json');
  const buf=fs.readFileSync(path.join(ASSETS,M.image));
  const [w,h]=webpSize(buf);
  assert.equal(w,M.cols*M.cell[0]);assert.equal(h,M.rows*M.cell[1]);
  assert.ok(w<=4096&&h<=4096,`atlas ${w}x${h} exceeds 4096`);
  assert.ok(M.count<=M.cols*M.rows);
  assert.equal(M.gong.length,M.count,'every frame has a gong position');
  for(const g of M.gong){assert.ok(g&&g.length===3&&g[2]>0);}
});

test('every animation has frames and every frame index is inside the atlas',()=>{
  for(const [name,frames] of Object.entries(M.anims)){
    assert.ok(frames.length>0,name+' is empty');
    for(const i of frames)assert.ok(Number.isInteger(i)&&i>=0&&i<M.count,`${name}: ${i}`);
  }
  for(const [name,h] of Object.entries(M.hit))assert.ok(h>=0&&h<M.anims[name].length,name);
});

test('every hero state picks a frame from the atlas over its whole duration',()=>{
  const states=['idle','walk','guard','parry','attack','execute','dodge','bounced','hurt','down','broken','dead','won'];
  for(const state of states){
    for(let u=0;u<=3;u+=.05){
      const p={state,st:u,stateDur:2.2,walkPhase:u*9,attackHit:.18,attackDur:.45,dodgeDur:.35};
      const i=F.frameFor(p,u+.3);
      assert.ok(Number.isInteger(i)&&i>=0&&i<M.count,`${state} at ${u.toFixed(2)} -> ${i}`);
    }
  }
});

test('a played match only ever asks for frames the atlas has',()=>{
  const s=C.create({seed:11});C.start(s,{wave:0});
  const seen=new Set();let n=0;
  for(let k=0;k<60*40;k++){
    const input={right:k%240<60,left:k%240>=200,blockDown:k%45<6,blockPressed:k%45===0,attackPressed:k%70===0,dodgePressed:k%300===150};
    C.run(s,1/60,input);seen.add(s.player.state);
    const i=F.frameFor(s.player,s.time);
    assert.ok(Number.isInteger(i)&&i>=0&&i<M.count,`${s.player.state} -> ${i}`);n++;
    if(s.over)break;
  }
  assert.ok(n>100&&seen.size>=3,`states seen: ${[...seen]}`);
});
