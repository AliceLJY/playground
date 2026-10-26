// 题目、结果与计分的检查。阈值都来自 SPEC.md；分布检查穷举全部 4^8 种答法，不抽样。
const test=require('node:test'),assert=require('node:assert');
const C=require('../src/core.js'),{PILLARS,QUESTIONS,SOURCES,WITHHELD,score}=C;

function* allAnswers(){
  const n=QUESTIONS.length,a=new Array(n).fill(0);
  while(true){
    yield a.slice();
    let i=n-1;while(i>=0&&a[i]===3){a[i]=0;i--;}
    if(i<0)return;a[i]++;
  }
}
function distribution(qs){
  const cnt={};let tot=0;
  for(const a of allAnswers()){const r=C.scoreWith(qs,a).id;cnt[r]=(cnt[r]||0)+1;tot++;}
  return{cnt,tot};
}
const inBand=(d,id)=>{const s=(d.cnt[id]||0)/d.tot;return s>=0.12&&s<=0.22;};
const exact=distribution(QUESTIONS);

test('six pillars, eight questions, four options each',()=>{
  assert.deepStrictEqual(PILLARS.map(p=>p.name),['文武生','小生','正印花旦','二帮花旦','丑生','武生'],'spec 2: the result set is the six pillars, in troupe order');
  assert.strictEqual(QUESTIONS.length,8,'spec 3: eight questions');
  QUESTIONS.forEach((q,i)=>{
    assert.strictEqual(q.opts.length,4,`spec 3: question ${i+1} needs four options`);
    const ids=q.opts.map(o=>o[1]);
    assert.strictEqual(new Set(ids).size,4,`spec 3: question ${i+1} gives two options to the same pillar`);
    ids.forEach(id=>assert.ok(C.pillar(id),`question ${i+1} points at unknown pillar ${id}`));
  });
});

test('every pillar can be reached from at least five questions',()=>{
  for(const p of PILLARS){
    const n=QUESTIONS.filter(q=>q.opts.some(o=>o[1]===p.id)).length;
    assert.ok(n>=5,`spec 3: ${p.name} appears in only ${n} questions, a player can barely land on it`);
  }
});

test('random answering lands on each pillar between 12% and 22%',()=>{
  assert.strictEqual(exact.tot,4**8);
  for(const p of PILLARS){
    const share=(exact.cnt[p.id]||0)/exact.tot;
    assert.ok(inBand(exact,p.id),`spec 3: ${p.name} comes up ${(share*100).toFixed(1)}% of all answer sets, outside 12%–22%`);
  }
});

test('the band check is not vacuous: a lopsided question table fails it',()=>{
  // 把每道题里指向小生的选项改指武生：武生应超过 22%，小生应掉到 0，两边都要被抓到
  const lop=QUESTIONS.map(q=>({q:q.q,opts:q.opts.map(([t,id])=>[t,id==='xs'?'ws':id])}));
  const d=distribution(lop);
  assert.ok(!inBand(d,'ws'),'a table that funnels 小生 answers into 武生 must push 武生 out of the band');
  assert.ok(!inBand(d,'xs'),'and 小生 must fall out of the band');
});

test('same answers give the same result; every tie goes to the tied pillar picked last',()=>{
  const a=[0,1,2,3,0,1,2,3];
  assert.deepStrictEqual(score(a),score(a));
  let ties=0;
  for(const ans of allAnswers()){
    const r=score(ans),top=Math.max(...Object.values(r.scores));
    const tied=Object.keys(r.scores).filter(k=>r.scores[k]===top);
    if(tied.length<2)continue;
    ties++;
    const picks=QUESTIONS.map((q,i)=>q.opts[ans[i]][1]);
    let want=null;for(let i=picks.length-1;i>=0;i--)if(tied.includes(picks[i])){want=picks[i];break;}
    if(r.id!==want)assert.fail(`spec 3: answers ${ans.join('')} tie ${tied.join('/')}, expected ${want}, got ${r.id}`);
  }
  assert.ok(ties>1000,`ties should be common enough to matter, saw only ${ties}`);
});

test('a sweep toward one pillar returns that pillar',()=>{
  for(const p of PILLARS){
    const a=QUESTIONS.map(q=>{const i=q.opts.findIndex(o=>o[1]===p.id);return i<0?0:i;});
    assert.strictEqual(score(a).id,p.id,`picking ${p.name} whenever offered should return ${p.name}`);
  }
});

test('questions and portraits never assume the player is a man or a woman',()=>{
  const bad=/[男女他她]|先生|小姐|哥|姐/;
  QUESTIONS.forEach((q,i)=>{
    assert.ok(!bad.test(q.q),`spec 2: question ${i+1} carries a gendered word: ${q.q}`);
    q.opts.forEach(o=>assert.ok(!bad.test(o[0]),`spec 2: an option in question ${i+1} carries a gendered word: ${o[0]}`));
  });
  PILLARS.forEach(p=>{
    assert.ok(!bad.test(p.portrait),`spec 2: the portrait for ${p.name} carries a gendered word`);
    assert.ok(!bad.test(p.label),`spec 2: the label for ${p.name} carries a gendered word`);
  });
});

test('every fact names sources that exist, and unverified claims stay off the page',()=>{
  const all=JSON.stringify(PILLARS);
  for(const w of WITHHELD)assert.ok(!all.includes(w),`spec 4: "${w}" is not verified yet and must not appear on the page`);
  PILLARS.forEach(p=>{
    assert.ok(p.facts.length>=3,`spec 4: ${p.name} needs at least three facts`);
    p.facts.forEach(f=>{
      assert.ok(f.src.length>=1,`spec 4: a fact for ${p.name} has no source`);
      f.src.forEach(s=>assert.ok(SOURCES[s],`spec 4: ${p.name} cites unknown source ${s}`));
    });
    assert.ok(p.role,`spec 2: ${p.name} needs its role in 帝女花`);
  });
});

test('no real-identity details on the page data',()=>{
  const all=JSON.stringify(C);
  for(const w of ['李菁雅','文化发展集团','演艺事业部'])assert.ok(!all.includes(w),`spec 7 / AGENTS 7: "${w}" must not appear`);
});

test('the share-card fact points at a real fact and every colour is a full hex',()=>{
  PILLARS.forEach(p=>{
    assert.ok(Number.isInteger(p.hook)&&p.facts[p.hook],`spec 5: ${p.name} share card needs a valid fact index, has ${p.hook}`);
    assert.match(p.color,/^#[0-9A-F]{6}$/i,`spec 5: ${p.name} colour should be #RRGGBB`);
  });
  assert.strictEqual(new Set(PILLARS.map(p=>p.color)).size,6,'spec 5: six pillars need six different colours');
});
