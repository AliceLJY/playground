// Rules and budget checks for 碎碎平安. Every threshold comes from SPEC.md.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('fs'),path=require('path');
const C=require('../src/core.js'),{KINDS,KIND_IDS,G}=C;
const SCREENS={iphone:[390,664],android:[412,700],desktop:[1280,720],tablet:[820,1100],wide:[1920,1000]};

test('spec 6.1: same seed gives the same shelf, and no two neighbours are the same kind',()=>{
  for(const [w,h] of Object.values(SCREENS)){
    const L=C.layout(w,h);
    for(let seed=1;seed<=40;seed++){
      const a=C.createShelf(seed,L.count,L.cols),b=C.createShelf(seed,L.count,L.cols);
      assert.deepEqual(a.kinds,b.kinds,'fixed views depend on a seed replaying the same shelf');
      a.kinds.forEach((k,i)=>{
        assert.ok(KINDS[k],`unknown kind ${k}`);
        for(const n of C.neighbours(a.kinds,i,L.cols))assert.notEqual(n,k,`seed ${seed} ${w}x${h}: slot ${i} (${k}) sits next to the same kind`);
      });
    }
  }
});

test('spec 1: every shelf has at least two worries to burn, each with words on it',()=>{
  for(const [w,h] of Object.values(SCREENS)){
    const L=C.layout(w,h);
    for(let seed=1;seed<=60;seed++){
      const s=C.createShelf(seed,L.count,L.cols);
      const notes=s.kinds.map((k,i)=>k==='note'?i:-1).filter(i=>i>=0);
      assert.ok(notes.length>=2,`seed ${seed} ${w}x${h}: only ${notes.length} worry notes`);
      for(const i of notes)assert.ok(s.notes[i].length>0,`seed ${seed}: note at ${i} has no text`);
      assert.equal(new Set(notes.map(i=>s.notes[i])).size,notes.length,`seed ${seed} ${w}x${h}: two slips say the same worry`);
    }
  }
});

test('spec 6.1: across many shelves every kind shows up, worries and porcelain most',()=>{
  const n=Object.fromEntries(KIND_IDS.map(k=>[k,0]));
  for(let seed=1;seed<=300;seed++)for(const k of C.createShelf(seed,12,3).kinds)n[k]++;
  for(const k of KIND_IDS)assert.ok(n[k]>0,`${k} never appeared in 300 shelves`);
  const porcelain=n.meiping+n.plate+n.ru,all=Object.values(n).reduce((a,b)=>a+b,0);
  assert.ok(porcelain/all>0.2&&porcelain/all<0.45,`porcelain share ${(porcelain/all).toFixed(2)} outside 0.2–0.45`);
  assert.ok(n.note>n.sugar&&n.note>n.book,'worry notes should be more common than the rare kinds');
});

test('spec 6.2: every break uses a variant the vendored engine really registers',()=>{
  const src=fs.readFileSync(path.join(__dirname,'../vendor/dissolve-atlas.js'),'utf8');
  const registered=new Set([...src.matchAll(/^  ([a-z]+): \{/gm)].map(m=>m[1]).concat([...src.matchAll(/^VARIANTS\.([a-z]+) = \{/gm)].map(m=>m[1])));
  for(const fx of C.ENGINE_FX)assert.ok(registered.has(fx),`engine has no variant "${fx}"`);
  for(const k of KIND_IDS){
    assert.ok(C.ENGINE_FX.includes(KINDS[k].fx),`${k} breaks with unknown fx ${KINDS[k].fx}`);
    for(const g of ['tap','hold','swipe']){const o=C.plan(k,g,{x:10,y:10},{w:100,h:100},{x:300,y:-200});
      assert.ok(registered.has(o.preset),`${k}/${g} plans preset ${o.preset} that the engine lacks`);}
  }
});

test('spec 6.3: tap, hold and swipe split at 280 ms and 18 px, both sides of each edge',()=>{
  assert.equal(C.classify(0,0),'tap');
  assert.equal(C.classify(G.tapMs-1,G.moveTol-1),'tap');
  assert.equal(C.classify(G.tapMs,0),'hold');
  assert.equal(C.classify(G.tapMs+500,G.moveTol-1),'hold');
  assert.equal(C.classify(50,G.moveTol),'swipe');
  assert.equal(C.classify(900,G.moveTol+40),'swipe','moving far wins over holding long');
});

test('spec 2: a tap breaks from where it landed for shatter and snap; swipes fling at a usable speed',()=>{
  const box={w:120,h:120};
  assert.deepEqual(C.plan('plate','tap',{x:30,y:80},box).origin,{x:30,y:80});
  assert.deepEqual(C.plan('firecracker','tap',{x:200,y:-5},box).origin,{x:120,y:0},'points outside the item are clamped to its edge');
  assert.equal(C.plan('teapot','tap',{x:30,y:80},box).origin,undefined,'sand pours on its own clock, no origin');
  assert.equal(C.plan('book','tap',{x:100,y:10},box).origin,'right','dust blows away from the side that was hit');
  const slow=C.plan('meiping','swipe',{x:0,y:0},box,{x:30,y:0}).velocity;
  assert.ok(Math.abs(Math.hypot(slow.x,slow.y)-G.flingMin)<1e-6,'a slow drag still flings at the minimum speed');
  const fast=C.plan('meiping','swipe',{x:0,y:0},box,{x:-9000,y:9000}).velocity;
  assert.ok(Math.abs(Math.hypot(fast.x,fast.y)-G.flingMax)<1e-6&&fast.x<0&&fast.y>0,'fast flings are capped but keep their direction');
  const still=C.plan('meiping','swipe',{x:0,y:0},box,{x:0,y:0}).velocity;
  assert.ok(Number.isFinite(still.x)&&Number.isFinite(still.y),'zero velocity must not produce NaN');
  assert.equal(C.plan('liuli','hold',{x:5,y:5},box).preset,'charge');
});

test('spec 6.4: smash-all keeps grains on screen together under 16000 on every screen',()=>{
  for(const [name,[w,h]] of Object.entries(SCREENS)){
    const L=C.layout(w,h);
    for(let seed=1;seed<=40;seed++){
      const {kinds}=C.createShelf(seed,L.count,L.cols);
      const g=C.cascadeGrain(kinds,L.item);
      const sum=kinds.reduce((s,k)=>s+C.grainsFor(k,L.item,L.item,Math.max(g,KINDS[k].opts.grain||0)),0);
      assert.ok(sum<=G.budget,`${name} seed ${seed}: ${sum} grains at grain ${g}`);
      assert.ok(g<=6,`${name} seed ${seed}: grain ${g} is so coarse the smash-all looks blocky`);
    }
  }
});

test('spec 4: the shelf fits the visible screen with room for the title and the buttons',()=>{
  for(const [name,[w,h]] of Object.entries(SCREENS)){
    const L=C.layout(w,h);
    assert.ok(L.shelfW<=w,`${name}: shelf ${L.shelfW}px wider than ${w}px`);
    assert.ok(L.shelfH+C.HEADER+C.FOOTER+C.ROOM_BAR<=h,`${name}: shelf ${L.shelfH}px plus bars does not fit ${h}px`);
    assert.ok(L.rows>=3&&L.rows<=4,`${name}: ${L.rows} rows`);
    assert.ok(L.item>=60,`${name}: items only ${L.item}px, too small to hit`);
  }
  assert.equal(C.layout(390,664).cols,3);assert.equal(C.layout(820,1100).cols,4);assert.equal(C.layout(1280,720).cols,5);
});

test('spec 2: typed worries are one clean line of at most ten characters',()=>{
  assert.equal(C.cleanNote('  明天\n又要\t开会  '),'明天 又要 开会');
  assert.equal(C.cleanNote('一二三四五六七八九十十一'),'一二三四五六七八九十');
  assert.equal(C.cleanNote('\u0007'),'');
  assert.equal(Array.from(C.cleanNote('😤😤😤😤😤😤😤😤😤😤😤')).length,10,'emoji count as one character each, never split in half');
  // the dialog counts with no cap so it can say 「n/10」 the way the shelf will see the text (trimmed, spaces collapsed)
  assert.equal(Array.from(C.cleanNote('  一二三四五六七八九十 十一十二  ',Infinity)).length,15,'uncapped count ignores the outer spaces, keeps one inner space');
});

test('every collectible has its sprite on disk, the worry slip is the only thing drawn in code',()=>{
  const dir=path.join(__dirname,'../assets');
  assert.deepEqual([...C.SPRITES,'note'].sort(),[...KIND_IDS].sort(),'SPRITES should be every kind except the worry slip');
  let total=0;
  for(const k of C.SPRITES){
    const f=path.join(dir,k+'.webp');
    assert.ok(fs.existsSync(f),`missing sprite assets/${k}.webp`);
    const b=fs.readFileSync(f);total+=b.length;
    assert.equal(b.toString('ascii',0,4)+b.toString('ascii',8,12),'RIFFWEBP',`${k}.webp is not a webp file`);
    assert.ok(b.includes(Buffer.from('ALPH'))||b.includes(Buffer.from('VP8L')),`${k}.webp has no transparency, it would show a black box on the shelf`);
    assert.ok(b.length<160*1024,`${k}.webp is ${Math.round(b.length/1024)} KB, over the 160 KB budget per sprite`);
  }
  assert.ok(total<1.2*1024*1024,`sprites add up to ${Math.round(total/1024)} KB, over the 1.2 MB page budget`);
  const src=fs.readFileSync(path.join(__dirname,'../src/draw.js'),'utf8');
  assert.match(src,/^export const DRAWN_IN_CODE = \['note'\];$/m,'draw.js should draw only the worry slip in code');
});

test('spec 1: no kind fills the shelf, at most two of anything and three worries, also after refills',()=>{
  for(const [w,h] of Object.values(SCREENS)){
    const L=C.layout(w,h);
    for(let seed=1;seed<=60;seed++){
      const s=C.createShelf(seed,L.count,L.cols),kinds=s.kinds.slice();
      const check=(when)=>{const n={};for(const k of kinds)n[k]=(n[k]||0)+1;
        for(const k in n)assert.ok(n[k]<=(k==='note'?C.MAX_NOTES:C.MAX_SAME),`${w}x${h} seed ${seed} ${when}: ${n[k]} x ${k}`);};
      check('at start');
      for(let step=0;step<200;step++){const i=Math.floor(s.r()*kinds.length);kinds[i]=null;kinds[i]=C.pickKind(s.r,C.avoidFor(kinds,i,L.cols));}
      check('after 200 refills');
      kinds.forEach((k,i)=>{for(const n of C.neighbours(kinds,i,L.cols))assert.notEqual(n,k,`refill put two ${k} side by side`);});
    }
  }
});

test('room layout: always 12 slots, 3 x 4 on phones and 4 x 3 wider, and it fits with the room line',()=>{
  for(const [name,[w,h]] of Object.entries(SCREENS)){
    const L=C.roomLayout(w,h);
    assert.equal(L.count,12);assert.equal(L.cols*L.rows,12);
    assert.equal(L.cols,w<560?3:4,name);
    assert.ok(L.shelfW<=w,`${name}: shelf too wide`);
    assert.ok(L.shelfH+C.HEADER+C.FOOTER+C.ROOM_BAR+C.WAIT_BAR<=h,`${name}: ${L.shelfH}px shelf plus bars does not fit ${h}px`);
    assert.ok(L.item>=60,`${name}: items only ${L.item}px`);
  }
});
