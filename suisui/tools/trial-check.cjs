// Browser checks that came out of an outside playtest report (VERIFICATION.md, 2026-11-24 外部试玩复核). Each section is
// one reported symptom, written to be red on the code that was reported and green after the fix. By hand, not in CI:
//   python3 -m http.server 8971 --bind 127.0.0.1        (inside suisui/)
//   NODE_PATH="$(npm root -g)" node tools/trial-check.cjs <output-dir> [page-url]
// It starts its own room server (Node) on a free port. Viewports: the tester's desktop 1280x521 and phone 390x664.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path');
const out=process.argv[2]||'trial-out',base=(process.argv[3]||'http://127.0.0.1:8971/index.html').replace(/[?#].*$/,'');
fs.mkdirSync(out,{recursive:true});
const report={checks:[],notes:[]};let failed=0;
const check=(name,pass,detail)=>{report.checks.push({name,pass:!!pass,detail});if(!pass)failed++;console.log(pass?'ok  ':'FAIL',name,detail==null?'':JSON.stringify(detail));};
const note=(name,detail)=>{report.notes.push({name,detail});console.log('info',name,JSON.stringify(detail));};
const VIEWPORTS={desktop:{viewport:{width:1280,height:521}},phone:{viewport:{width:390,height:664},deviceScaleFactor:2,hasTouch:true,isMobile:true}};
const only=process.argv[4]?new Set(process.argv[4].split(',')):null;   // e.g. "1,4" runs only those sections
const want=n=>!only||only.has(String(n));

(async()=>{
  const S=await import('../server/room-server.mjs'),M=await import('../server/room.mjs');
  // a seed whose shelf starts with exactly two worries, so one more can still be put up and the next must wait
  let seed=1;for(;seed<500;seed++){const r=M.createRoom({seed});if(r.slots.filter(s=>s.kind==='note').length===2)break;}
  let srv=null,roomUrl='';   // every section gets its own fresh room, so what one writes does not change what the next sees
  const browser=await chromium.launch();
  const open=async(name,query,{delay=0}={})=>{
    const ctx=await browser.newContext(VIEWPORTS[name]),page=await ctx.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    // delay > 0: the room answers late, like a slow phone connection (the offline shelf is up in the meantime)
    if(delay)await page.routeWebSocket(/room\/ws/,ws=>{const buf=[];ws.onMessage(m=>buf.push(m));setTimeout(()=>{const up=ws.connectToServer();up.onMessage(m=>ws.send(m));ws.onMessage(m=>up.send(m));buf.forEach(m=>up.send(m));},delay);});
    await page.goto(`${base}?room=${encodeURIComponent(roomUrl)}${query||''}`);
    await page.waitForFunction(()=>window.__suisui&&window.__suisui.ready);
    return{name,ctx,page,errors};
  };
  const P=p=>p.page.evaluate(()=>window.__suisui.probe());
  const inRoom=p=>p.page.waitForFunction(()=>window.__suisui.probe().mode==='room',null,{polling:50,timeout:15000});
  const rect=(p,sel)=>p.page.evaluate(s=>{const e=document.querySelector(s);if(!e)return null;const b=e.getBoundingClientRect();return{x:b.left,y:b.top,w:b.width,h:b.height};},sel);
  const hit=(a,b)=>a&&b&&a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;
  const ctx={check,note,open,P,inRoom,rect,hit,out,path,browser,want};
  try{
    for(const sec of sections){
      srv=await S.startRoom({port:0,seed});roomUrl=`ws://127.0.0.1:${srv.port}/room/ws`;
      try{await sec(ctx);}finally{await srv.stop().catch(()=>{});}
    }
  }catch(e){check('trial check ran to the end',false,e.stack||e.message);}
  finally{await browser.close();}
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,1));
  console.log(failed?`${failed} check(s) failed`:'all checks passed');
  process.exit(failed?1:0);
})();

const sections=[];

// 1. The reported "1–2 s after opening, the offline 5x3 shelf turns into the room's 4x3, and the how-to hint flashes away".
//    The shelf swap itself is the room taking over (see VERIFICATION); what must not happen is the hint going away before
//    the visitor has done a single thing.
sections.push(async(c)=>{
  if(!c.want(1))return;
  for(const name of Object.keys(VIEWPORTS)){
    const p=await c.open(name,'',{delay:1200});
    const solo=await c.P(p),soloTitle=await c.rect(p,'h1');
    await c.inRoom(p);
    const room=await c.P(p),roomTitle=await c.rect(p,'h1');
    c.note(`1. ${name}: offline shelf then room`,{cols:[solo.cols,room.cols],rows:[solo.rows,room.rows],titleX:[Math.round(soloTitle.x),Math.round(roomTitle.x)],sameThings:JSON.stringify(solo.slots.map(s=>s.kind))===JSON.stringify(room.slots.map(s=>s.kind))});
    const hintOn=await p.page.evaluate(()=>{const h=document.querySelector('#hint');return{cls:h.className,opacity:getComputedStyle(h).opacity};});
    c.check(`1. ${name}: entering the room does not take the how-to hint away before the first smash`,!/\bgone\b/.test(hintOn.cls)&&hintOn.opacity==='1',hintOn);
    await p.ctx.close();
  }
});

// 4. "The toast sits on top of the title." A toast must not cover the title, the hint, the count or the buttons, and must
//    not eat taps. Checked with the entry toast and the longest one (two lines on a phone).
sections.push(async(c)=>{
  if(!c.want(4))return;
  for(const name of Object.keys(VIEWPORTS)){
    const p=await c.open(name,'');
    await c.inRoom(p);
    const longest='便签贴满了，你的排在候贴区第 3 张；也可以撕一张别人的换上';
    for(const [label,text] of [['entry toast',null],['longest toast',longest]]){
      if(text)await p.page.evaluate(t=>window.__suisui.toast(t),text);
      await p.page.waitForTimeout(350);   // past the fade-in
      const boxes={};for(const s of ['#toast','#roomline','h1','#hint','#count','#write','#all','#mute'])boxes[s]=await c.rect(p,s);
      const covered=['#roomline','h1','#hint','#count','#write','#all','#mute'].filter(s=>c.hit(boxes['#toast'],boxes[s]));
      const pe=await p.page.evaluate(()=>getComputedStyle(document.querySelector('#toast')).pointerEvents);
      await p.page.screenshot({path:c.path.join(c.out,`4-${name}-${label.replace(' ','-')}.png`)});
      c.check(`4. ${name}: ${label} covers none of title, hint, count, status line, buttons`,boxes['#toast']&&covered.length===0,{covered,toast:boxes['#toast']&&[boxes['#toast'].y,boxes['#toast'].h].map(Math.round)});
      c.check(`4. ${name}: ${label} lets taps through`,pe==='none',{pe});
    }
    await p.ctx.close();
  }
});

// 7. Phone 390x664: no sideways overflow, and with the input focused the 「贴上去」 button is not under a ~300 px soft
//    keyboard. A real keyboard cannot be had here, so this is geometry only: the button's bottom edge against 664 - 300,
//    for a keyboard that covers the bottom of the page (the common case where the layout viewport does not shrink).
sections.push(async(c)=>{
  if(!c.want(7))return;
  const KEYBOARD=300;
  for(const [label,query] of [['room','' ],['solo','&solo=1']]){
    const p=await c.open('phone',query);
    if(label==='room')await c.inRoom(p);
    const over=await p.page.evaluate(()=>({sw:document.documentElement.scrollWidth,iw:innerWidth,bw:document.body.scrollWidth}));
    c.check(`7. phone ${label}: nothing overflows sideways`,over.sw<=over.iw&&over.bw<=over.iw,over);
    await p.page.click('#write');
    await p.page.focus('#noteText');
    await p.page.keyboard.type('又要开会');
    const b=await c.rect(p,'#noteForm button[type=submit]'),inp=await c.rect(p,'#noteText'),d=await c.rect(p,'#dlg');
    const limit=664-KEYBOARD;
    const wide=await p.page.evaluate(()=>({sw:document.documentElement.scrollWidth,iw:innerWidth}));
    c.check(`7. phone ${label}: dialog open, nothing overflows sideways`,wide.sw<=wide.iw,wide);
    c.check(`7. phone ${label}: input focused, 「贴上去」 bottom edge is above a ${KEYBOARD} px keyboard`,b.y+b.h<=limit,{buttonBottom:Math.round(b.y+b.h),inputBottom:Math.round(inp.y+inp.h),dialog:[Math.round(d.y),Math.round(d.y+d.h)],limit});
    await p.page.screenshot({path:c.path.join(c.out,`7-${label}-dialog.png`)});
    // the other model: the layout viewport itself shrinks to what the keyboard leaves
    await p.page.setViewportSize({width:390,height:limit});
    await p.page.waitForTimeout(400);
    const b2=await c.rect(p,'#noteForm button[type=submit]'),d2=await c.rect(p,'#dlg');
    c.check(`7. phone ${label}: with the viewport shrunk to ${limit} px the whole dialog is inside it`,d2.y>=0&&d2.y+d2.h<=limit&&b2.y+b2.h<=limit,{dialog:[Math.round(d2.y),Math.round(d2.y+d2.h)],limit});
    await p.ctx.close();
  }
});

// 6. "The 候贴区 only takes one slip, and 'tear someone else's to get yours up' has no way in." Not changed: one waiting
//    slip each is the room's rule (README). This section only proves the way in exists and is a plain tap on a shelf note,
//    on a phone, whether the note is a visitor's or one of the shelf's own (大家的).
sections.push(async(c)=>{
  if(!c.want(6))return;
  const p=await c.open('phone','');
  await c.inRoom(p);
  const write=async t=>{await p.page.click('#write');await p.page.fill('#noteText',t);await p.page.click('#noteForm button[type=submit]');};
  await write('先贴的');
  await p.page.waitForFunction(()=>window.__suisui.probe().slots.some(s=>s.text==='先贴的'&&s.shown),null,{timeout:5000});
  await p.page.waitForTimeout(5300);
  await write('排队的');
  await p.page.waitForFunction(()=>!!window.__suisui.probe().mine,null,{timeout:4000});
  let st=await c.P(p);
  c.check('6. with a note waiting, the strip shows it as mine and the tip names the way in',/我的/.test(st.waitbar)&&/撕/.test(st.waitbar),{waitbar:st.waitbar});
  const target=st.slots.findIndex(s=>s.kind==='note'&&s.owner==='大家的'&&s.shown);
  const r=await p.page.evaluate(i=>window.__suisui.rect(i),target);
  await p.page.screenshot({path:c.path.join(c.out,'6-waiting.png')});
  await p.page.touchscreen.tap(r.x+r.w/2,r.y+r.h/2);
  const up=await p.page.waitForFunction(([i,w])=>{const s=window.__suisui.probe();return !s.mine&&s.slots[i].text===w&&s.slots[i].shown;},[target,'排队的'],{timeout:8000}).then(()=>true,()=>false);
  await p.page.screenshot({path:c.path.join(c.out,'6-after-tap.png')});
  c.check('6. tapping one of the shelf\'s own notes brings the waiting note up in that slot',up,{target});
  await p.ctx.close();
});

// 5. "While smash-all cools down, the button gets wider and nudges the buttons next to it every second."
//    Every label the cooldown can show (and the idle one) must leave all three buttons exactly where they are.
sections.push(async(c)=>{
  if(!c.want(5))return;
  for(const name of Object.keys(VIEWPORTS)){
    const p=await c.open(name,'');
    await c.inRoom(p);
    const labels=['全砸了','全砸了 · 30s','全砸了 · 29s','全砸了 · 20s','全砸了 · 10s','全砸了 · 9s','全砸了 · 1s'];
    const rows=await p.page.evaluate(labels=>{
      const all=document.querySelector('#all'),sel=['#write','#all','#mute'];
      const keep=all.textContent,out=[];
      for(const t of labels){all.textContent=t;out.push({t,b:sel.map(s=>{const r=document.querySelector(s).getBoundingClientRect();return[Math.round(r.left*10)/10,Math.round(r.width*10)/10];})});}
      all.textContent=keep;return out;
    },labels);
    const key=r=>JSON.stringify(r.b),moved=rows.filter(r=>key(r)!==key(rows[0])).map(r=>r.t);
    c.check(`5. ${name}: every cooldown label leaves #write, #all and #mute where they are`,moved.length===0,{idle:rows[0].b,moved,example:moved.length?rows.find(r=>r.t===moved[0]).b:null});
    // and for real: press it, then watch the shift of the neighbours over a few ticks
    await p.page.click('#all');
    await p.page.waitForFunction(()=>window.__suisui.probe().cd>25000,null,{timeout:4000});
    const xs=[];
    for(let k=0;k<3;k++){xs.push(await p.page.evaluate(()=>['#write','#all','#mute'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return[Math.round(r.left*10)/10,Math.round(r.width*10)/10];})));await p.page.waitForTimeout(1100);}
    await p.page.screenshot({path:c.path.join(c.out,`5-${name}-cooldown.png`)});
    c.check(`5. ${name}: during the real cooldown the three buttons stay put (and match the idle layout)`,xs.every(x=>JSON.stringify(x)===key(rows[0])),{idle:rows[0].b,xs});
    await p.ctx.close();
  }
});

// 3. "With the 5 s limit, closing the dialog loses the words." The room can turn a note down (too soon / already one
//    waiting); the words must not vanish with the dialog.
sections.push(async(c)=>{
  if(!c.want(3))return;
  const p=await c.open('desktop','');
  await c.inRoom(p);
  const write=async t=>{await p.page.click('#write');await p.page.fill('#noteText',t);await p.page.click('#noteForm button[type=submit]');};
  const dlgState=()=>p.page.evaluate(()=>({open:document.querySelector('#dlg').open,v:document.querySelector('#noteText').value,msg:document.querySelector('#noteMsg')?.textContent||''}));
  await write('第一张');
  await p.page.waitForFunction(()=>window.__suisui.probe().slots.some(s=>s.text==='第一张'&&s.shown),null,{timeout:5000});
  await write('第二张心事');                                   // well inside 5 s of the first
  await p.page.waitForTimeout(1200);
  let d=await dlgState();
  await p.page.screenshot({path:c.path.join(c.out,'3-too-soon.png')});
  c.check('3. a note turned down for being too soon is not lost: the dialog comes back with the words in it',d.open&&d.v==='第二张心事',d);
  c.check('3. ...and says why',/五秒|慢一点/.test(d.msg),d);
  if(d.open)await p.page.click('#noteCancel');
  await p.page.waitForTimeout(4500);                          // 5 s since the first one has passed
  await write('第三张');                                       // three worries are up, so this one waits in the 候贴区
  await p.page.waitForFunction(()=>!!window.__suisui.probe().mine,null,{timeout:4000});
  await p.page.waitForTimeout(5300);
  await write('第四张');                                       // only one waiting note each: turned down
  await p.page.waitForFunction(()=>/已经有一张/.test(window.__suisui.probe().toast),null,{timeout:4000});
  await p.page.click('#write');
  d=await dlgState();
  c.check('3. a note turned down for "already one waiting" is kept: the next time the box opens it is still there',d.open&&d.v==='第四张',d);
  await p.ctx.close();
});

// 2. "The dialog says at most ten characters, the input allows twenty and silently cuts the rest." Whatever the visitor
//    sees in the box must be what lands on the shelf, and going over has to be said out loud.
sections.push(async(c)=>{
  if(!c.want(2))return;
  const long='明天又要交周报了啊真烦人呀',emoji='😀😀😀😀😀😀😀😀😀😀😀😀';   // 13 characters; 12 emoji (24 UTF-16 units)
  for(const name of Object.keys(VIEWPORTS)){
    const p=await c.open(name,'&solo=1');
    const count=s=>Array.from(s).length;
    await p.page.click('#write');
    await p.page.keyboard.type(long);
    let v=await p.page.inputValue('#noteText');
    const typed=await p.page.evaluate(()=>({n:document.querySelector('#noteLeft')?.textContent||'',cls:document.querySelector('#noteLeft')?.className||''}));
    await p.page.screenshot({path:c.path.join(c.out,`2-${name}-typed.png`)});
    c.check(`2. ${name}: typing 13 characters leaves at most 10 in the box (what you see is what lands)`,count(v)<=10,{shown:v,n:count(v)});
    c.check(`2. ${name}: going over 10 is said out loud (counter reads 10/10 and is marked full)`,/10\s*\/\s*10/.test(typed.n)&&/\bfull\b/.test(typed.cls),typed);
    await p.page.fill('#noteText','');
    await p.page.fill('#noteText',emoji);
    v=await p.page.inputValue('#noteText');
    c.check(`2. ${name}: pasting 12 emoji also stops at 10 characters`,count(v)<=10,{n:count(v)});
    // an IME composition (pinyin being typed) must not be cut mid-way; once committed it is clipped like anything else
    await p.page.fill('#noteText','');
    const cdp=await p.ctx.newCDPSession(p.page);
    await p.page.focus('#noteText');
    await cdp.send('Input.imeSetComposition',{text:'mingtianyaojiaozhoubaole',selectionStart:24,selectionEnd:24});
    const mid=await p.page.inputValue('#noteText');
    await cdp.send('Input.insertText',{text:long});
    v=await p.page.inputValue('#noteText');
    c.check(`2. ${name}: a composition in progress is left alone, the committed text is clipped to 10`,mid.length>10&&count(v)===10,{mid,committed:v});
    await p.page.fill('#noteText','');
    await p.page.keyboard.type('又要开会');
    const ok=await p.page.evaluate(()=>({v:document.querySelector('#noteText').value,n:document.querySelector('#noteLeft')?.textContent||'',cls:document.querySelector('#noteLeft')?.className||''}));
    c.check(`2. ${name}: a short note is untouched and the counter is quiet`,ok.v==='又要开会'&&/4\s*\/\s*10/.test(ok.n)&&!/\bfull\b/.test(ok.cls),ok);
    await p.page.click('#noteForm button[type=submit]');
    await p.page.waitForFunction(()=>window.__suisui.probe().slots.some(s=>s.text==='又要开会'),null,{timeout:4000}).then(()=>c.check(`2. ${name}: the short note reaches the shelf`,true),()=>c.check(`2. ${name}: the short note reaches the shelf`,false));
    await p.ctx.close();
  }
});
