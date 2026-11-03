// Composition checks: the board, the clerk, the counters and the buttons fit and do not overlap on phone and desktop shapes.
const test=require('node:test'),assert=require('node:assert');
const C=require('../src/core.js');
const VIEWS=[[390,664],[320,568],[412,700],[390,844],[844,340],[1365,900],[1280,720]];
const inside=(r,w,h)=>r.x>=0&&r.y>=0&&r.x+r.w<=w+0.5&&r.y+r.h<=h+0.5;
const overlap=(a,b)=>a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;
// minimum cell size (CSS px) per screen: phone portrait is the target. Cells cap at 72 px on big screens, so the board may not fill its area there.
const MIN_CELL=(w,h)=>w/h>1.15?(h<400?24:40):(w<360?28:36);

test('spec 3: board, clerk, counters, readout and buttons fit and stay apart',()=>{
  for(const [w,h] of VIEWS)for(const id of ['easy','normal','hard']){
    const l=C.layout(w,h,id),tag=`${w}x${h} ${id}`;
    assert.ok(inside(l.board,w,h),'spec 3: board leaves the screen '+tag);
    assert.ok(l.board.cell>=MIN_CELL(w,h),`spec 3: cells ${l.board.cell}px below ${MIN_CELL(w,h)}px on ${tag}`);
    const fill=Math.max(l.board.w/l.area.w,l.board.h/l.area.h);assert.ok(fill>=0.9||l.board.cell===72,`spec 3: board fills only ${(fill*100).toFixed(0)}% of its area on ${tag}`);
    for(const [k,b] of Object.entries(l.btn)){
      assert.ok(b.w>=44&&b.h>=44,`spec 3: button ${k} ${b.w}x${b.h} under 44px on ${tag}`);
      assert.ok(inside(b,w,h),`spec 3: button ${k} off screen on ${tag}`);
      assert.ok(!overlap(b,l.board),`spec 3: button ${k} covers the board on ${tag}`);
    }
    assert.ok(!overlap(l.btn.mode,l.btn.restart)&&!overlap(l.btn.restart,l.btn.menu),'spec 3: buttons overlap '+tag);
    for(const [k,r] of [['clerk',l.guyBox],['counter',l.counterBox],['readout',l.readout],['bubble',l.bubble]]){
      assert.ok(inside(r,w,h),`spec 3: ${k} off screen on ${tag} ${JSON.stringify(r)}`);
      assert.ok(!overlap(r,l.board),`spec 3: ${k} covers the board on ${tag}`);
    }
    assert.ok(l.bubble.w>=60,`spec 3: speech bubble only ${l.bubble.w}px wide on ${tag}`);
    assert.ok(!overlap(l.guyBox,l.counterBox)&&!overlap(l.bubble,l.counterBox)&&!overlap(l.guyBox,l.readout)&&!overlap(l.bubble,l.readout)&&!overlap(l.counterBox,l.readout),'spec 3: hud pieces overlap on '+tag);
    assert.ok(l.guy.s>=2,'spec 3: clerk drawn smaller than 2x on '+tag);
  }
});

test('spec 3: every cell centre maps back to that cell (taps land where they look)',()=>{
  for(const [w,h] of VIEWS){const l=C.layout(w,h,'hard'),L=C.LEVELS.hard,b=l.board;
    for(let i=0;i<L.cols*L.rows;i++){const x=b.x+(i%L.cols+0.5)*b.cell,y=b.y+(Math.floor(i/L.cols)+0.5)*b.cell;assert.strictEqual(C.cellAt(l,x,y),i);}
    assert.strictEqual(C.cellAt(l,b.x-1,b.y),-1);assert.strictEqual(C.cellAt(l,b.x+b.w,b.y+b.h-1),-1);
  }
});
