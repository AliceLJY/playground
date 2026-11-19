// Two-browser acceptance for the shared room (multiplayer README, 验收). Starts a room server in this process on a
// free port, opens two separate Playwright contexts (A and B) on the page, and walks through:
//   1. A breaks a slot by a real tap; B sees it break and both get the same new thing.
//   2. A holds a slot; B presses it and is told 第 2 位; after A's burst the next thing goes to B (轮到你了); B breaks it.
//   3. With three notes up, B's note goes to the 候贴区; B never sees A's words (DOM and every canvas fillText checked).
//   4. B tears A's note: B's waiting note goes straight up, A is told which worry was burned.
//   5. The server stops: both pages fall back to single-player without page errors and can still break things.
//   python3 -m http.server 8971 --bind 127.0.0.1        (inside suisui/)
//   NODE_PATH="$(npm root -g)" node tools/room-check.cjs <output-dir> [page-url]
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path');
const out=process.argv[2]||'room-check-out',base=(process.argv[3]||'http://127.0.0.1:8971/index.html').replace(/[?#].*$/,'');
fs.mkdirSync(out,{recursive:true});
const report={checks:[]};let failed=0;
const check=(name,pass,detail)=>{report.checks.push({name,pass:!!pass,detail});if(!pass)failed++;console.log(pass?'ok  ':'FAIL',name,detail==null?'':JSON.stringify(detail));};
const A_WORDS='甲方又改需求',B_WORDS='乙的小烦恼';

(async()=>{
  const S=await import('../server/room-server.mjs'),M=await import('../server/room.mjs');
  // a seed whose shelf starts with exactly two notes, so A's note goes up and B's has to wait
  let seed=1;for(;seed<500;seed++){const r=M.createRoom({seed});if(r.slots.filter(s=>s.kind==='note').length===2)break;}
  const srv=await S.startRoom({port:0,seed});
  const roomUrl=`ws://127.0.0.1:${srv.port}/room/ws`;
  const browser=await chromium.launch();
  async function open(name,opts){
    const ctx=await browser.newContext(opts),page=await ctx.newPage(),errors=[];
    // record every string drawn on any canvas, to prove the other person's words never reach this screen
    await page.addInitScript(()=>{window.__drawn=[];const f=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(t,...a){window.__drawn.push(String(t));return f.call(this,t,...a);};});
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error'&&!/^WebSocket connection to '.*' failed/.test(m.text()))errors.push(m.text());});
    await page.goto(`${base}?room=${encodeURIComponent(roomUrl)}`);
    await page.waitForFunction(()=>window.__suisui&&window.__suisui.ready&&window.__suisui.probe().mode==='room',null,{polling:100,timeout:15000});
    return{name,ctx,page,errors};
  }
  const A=await open('A',{viewport:{width:1280,height:720}});
  const B=await open('B',{viewport:{width:390,height:664},deviceScaleFactor:2,hasTouch:true,isMobile:true});
  const P=p=>p.page.evaluate(()=>window.__suisui.probe());
  const waitFor=(p,fn,arg,ms=8000)=>p.page.waitForFunction(fn,arg,{polling:100,timeout:ms}).then(()=>true,()=>false);
  const centre=async(p,i)=>{const r=await p.page.evaluate(i=>window.__suisui.rect(i),i);return{x:r.x+r.w/2,y:r.y+r.h/2};};
  const tap=async(p,i)=>{const c=await centre(p,i);if(p.name==='B')await p.page.touchscreen.tap(c.x,c.y);else await p.page.mouse.click(c.x,c.y);};
  try{
    let a=await P(A),b=await P(B);
    check('both in the room with the same 12 things',a.slots.length===12&&JSON.stringify(a.slots.map(s=>s.kind))===JSON.stringify(b.slots.map(s=>s.kind)),{a:a.slots.map(s=>s.kind)});
    check('online count is 2 on both',a.online===2&&b.online===2,{a:a.online,b:b.online});
    check('the status line says who is in the room, me first',/^房间里 2 人：你·/.test(a.status)&&/^房间里 2 人：你·/.test(b.status),{a:a.status,b:b.status});
    const names=await Promise.all([A,B].map(p=>p.page.textContent('#roomline .who.me')));
    check('A and B are told apart by name',names[0]!==names[1]&&names[0].replace('你·','')!==names[1].replace('你·',''),names);
    check('the 候贴区 strip is on screen and says it is empty',await A.page.isVisible('#waitbar')&&a.waitbar.startsWith('候贴区空着'),{waitbar:a.waitbar});
    const sys=a.slots.find(s=>s.kind==='note');
    check('the shelf\'s own slips are labelled 大家的',sys&&sys.owner==='大家的',{owner:sys&&sys.owner});
    await A.page.screenshot({path:path.join(out,'A-start.png')});await B.page.screenshot({path:path.join(out,'B-start.png')});

    // 1. A breaks a free slot, B sees it and both get the same new thing
    const free=a.slots.map((s,i)=>({...s,i})).filter(s=>s.st==='idle'&&s.kind!=='note'&&!s.q.length);
    const i1=free[0].i,v0=a.slots[i1].v;
    await tap(A,i1);
    check('1. B sees A\'s slot break',await waitFor(B,([i,v])=>{const s=window.__suisui.probe().slots[i];return s.v>v&&(s.st==='broken'||!s.shown);},[i1,v0],4000));
    await B.page.waitForTimeout(150);await B.page.screenshot({path:path.join(out,'B-sees-break.png')});
    const settled=([i,v])=>{const s=window.__suisui.probe().slots[i];return s.v>v+1&&s.shown&&s.st==='idle';};
    const okA=await waitFor(A,settled,[i1,v0]),okB=await waitFor(B,settled,[i1,v0]);
    a=await P(A);b=await P(B);
    check('1. both get the same new thing in that slot',okA&&okB&&a.slots[i1].kind===b.slots[i1].kind&&a.slots[i1].v===b.slots[i1].v,{a:a.slots[i1],b:b.slots[i1]});

    // 2. A holds, B queues as 第 2 位, then it is B's turn
    const i2=free.find(s=>s.i!==i1).i;
    const c2=await centre(A,i2);
    await A.page.mouse.move(c2.x,c2.y);await A.page.mouse.down();
    await A.page.waitForTimeout(400);
    await tap(B,i2);
    const queued=await waitFor(B,i=>window.__suisui.probe().slots[i].tag==='你第 2 位',i2,3000);
    b=await P(B);
    const finger=await B.page.evaluate(()=>!!document.querySelector('.finger.down'));
    await B.page.screenshot({path:path.join(out,'B-queued.png')});
    check('2. B pressing a slot A is holding is told 你第 2 位',queued,{tag:b.slots[i2].tag,st:b.slots[i2].st});
    check('2. B sees A\'s finger on the shelf while A holds',finger);
    await A.page.mouse.up();
    const turn=await waitFor(B,i=>{const s=window.__suisui.probe().slots[i];return s.tag==='轮到你了'&&s.shown;},i2,7000);
    b=await P(B);
    await B.page.screenshot({path:path.join(out,'B-turn.png')});
    check('2. after A\'s burst the next thing is B\'s turn (轮到你了)',turn&&b.slots[i2].by===b.me,{slot:b.slots[i2],me:b.me});
    const before=b.smashes;await tap(B,i2);
    check('2. B can break it on their turn',await waitFor(B,([i,n])=>window.__suisui.probe().smashes===n+1&&!window.__suisui.probe().slots[i].shown,[i2,before],3000));

    // 3. notes: A's goes up (third), B's waits; B never sees A's words
    const write=async(p,text)=>{await p.page.click('#write');await p.page.fill('#noteText',text);await p.page.click('#noteForm button[type=submit]');};
    await write(A,A_WORDS);
    const up=await waitFor(A,w=>window.__suisui.probe().slots.some(s=>s.kind==='note'&&s.text===w&&s.shown),A_WORDS,5000);
    a=await P(A);
    const aSlot=a.slots.findIndex(s=>s.text===A_WORDS);
    check('3. A\'s note is on the shelf with A\'s words on A\'s screen',up&&aSlot>=0,{notes:a.slots.filter(s=>s.kind==='note').map(s=>s.text)});
    check('3. A sees it labelled 我写的',a.slots[aSlot].owner==='我写的',{owner:a.slots[aSlot].owner});
    await B.page.waitForTimeout(400);b=await P(B);
    check('3. on B\'s screen the same note is folded, no words',aSlot>=0&&b.slots[aSlot].kind==='note'&&b.slots[aSlot].folded&&b.slots[aSlot].text==='',{b:b.slots[aSlot]});
    const aName=(await A.page.textContent('#roomline .who.me')).replace(/^你·/,'');
    check('3. B sees whose it is: 「<A 的名字> 写的」',b.slots[aSlot].owner===`${aName} 写的`,{owner:b.slots[aSlot].owner,aName});
    await write(B,B_WORDS);
    const waits=await waitFor(B,()=>!!window.__suisui.probe().mine,null,4000);
    b=await P(B);
    await B.page.screenshot({path:path.join(out,'B-waiting.png')});
    check('3. with three notes up, B\'s note waits in the 候贴区',waits&&b.mine&&b.mine.pos===1,{mine:b.mine,wait:b.wait});
    check('3. the 候贴区 strip shows B\'s slip as 我的',await B.page.evaluate(()=>!!document.querySelector('#waitbar .slip.mine')&&document.querySelector('#waitbar').textContent.includes('我的')),{waitbar:b.waitbar});
    check('3. on A\'s screen the strip shows one slip waiting, not marked as A\'s',await waitFor(A,()=>document.querySelectorAll('#waitbar .slip').length===1&&!document.querySelector('#waitbar .slip.mine'),null,3000));
    // slips are brushed one character at a time, so join everything ever drawn and look for the words in a row
    const seen=(p,w)=>p.page.evaluate(w=>({dom:document.documentElement.outerHTML.includes(w)||document.body.innerText.includes(w),canvas:window.__drawn.filter((t,k,all)=>t!==all[k-1]).join('').includes(w),storage:JSON.stringify(localStorage).includes(w)}),w);
    const control=await seen(A,A_WORDS);
    check('3. control: the same check does find A\'s words on A\'s own screen',control.canvas,control);
    const leak=await seen(B,A_WORDS);
    check('3. A\'s words appear nowhere on B\'s side (DOM, canvas text, storage)',!leak.dom&&!leak.canvas&&!leak.storage,leak);
    check('3. while B has one waiting, A\'s note says it can be torn (「<A> 的 · 可撕」)',await waitFor(B,([i,n])=>window.__suisui.probe().slots[i].owner===`${n} 的 · 可撕`,[aSlot,aName],3000),{owner:(await P(B)).slots[aSlot].owner});

    // 4. B tears A's note: B's goes straight up there, A is told what was burned
    await tap(B,aSlot);
    const told=await waitFor(A,w=>window.__suisui.probe().toast.includes(w),A_WORDS,4000);
    a=await P(A);
    await A.page.screenshot({path:path.join(out,'A-told.png')});
    check('4. A is told 有人替你把「…」烧掉了',told,{toast:a.toast});
    const replaced=await waitFor(B,([i,w])=>{const s=window.__suisui.probe().slots[i];return s.kind==='note'&&s.text===w&&s.shown;},[aSlot,B_WORDS],6000);
    b=await P(B);a=await P(A);
    await B.page.screenshot({path:path.join(out,'B-torn.png')});
    check('4. B\'s waiting note went straight into that slot, no more waiting',replaced&&!b.mine,{slot:b.slots[aSlot],mine:b.mine});
    check('4. on A\'s screen B\'s note is folded',a.slots[aSlot].folded&&a.slots[aSlot].text==='',{a:a.slots[aSlot]});
    const leakA=await seen(A,B_WORDS),controlB=await seen(B,B_WORDS);
    check('4. B\'s words appear nowhere on A\'s side (and the check finds them on B\'s)',!leakA.dom&&!leakA.canvas&&!leakA.storage&&controlB.canvas,{leakA,controlB});

    // 5. smash-all from A leaves alone what B holds; then the server stops and both fall back to single-player
    // B has a slot claimed (as while pressing it), then A smashes all
    const i5=(await P(B)).slots.findIndex(s=>s.st==='idle'&&!s.q.length&&s.shown&&s.kind!=='note');
    await B.page.evaluate(i=>window.__suisui.claim(i),i5);   // the claim a press sends, without starting a charge here
    await waitFor(B,i=>window.__suisui.probe().slots[i].st==='held',i5,2000);
    await A.page.click('#all');
    const cd=await waitFor(A,()=>window.__suisui.probe().cd>25000,null,3000);
    check('5. smash-all starts a 30 s cooldown shown on the button',cd&&/全砸了 · \d+s/.test(await A.page.textContent('#all')),{button:await A.page.textContent('#all')});
    await A.page.waitForTimeout(400);
    const kept=(await P(B)).slots[i5];
    check('5. smash-all left alone the slot B is holding',kept.shown&&kept.st==='held',{slot:kept});
    await A.page.waitForTimeout(1100);await A.page.screenshot({path:path.join(out,'A-smash-all.png')});
    await srv.stop();
    const soloA=await waitFor(A,()=>window.__suisui.probe().mode==='solo',null,8000),soloB=await waitFor(B,()=>window.__suisui.probe().mode==='solo',null,8000);
    check('5. server gone: both back to single-player',soloA&&soloB);
    const lineA=(await P(A)).status;
    check('5. the status line says the room is not reachable',lineA.startsWith('没连上房间'),{status:lineA});
    check('5. my own slip is still marked 我写的 in single-player',(await P(B)).slots.some(s=>s.text===B_WORDS&&s.owner==='我写的'));
    await A.page.waitForTimeout(600);
    const n=(await P(A)).smashes;
    const iS=(await P(A)).slots.findIndex(s=>s.shown&&!s.busy);await tap(A,iS);
    check('5. single-player still breaks things',await waitFor(A,k=>window.__suisui.probe().smashes===k+1,n,3000));
    await A.page.screenshot({path:path.join(out,'A-solo.png')});await B.page.screenshot({path:path.join(out,'B-solo.png')});
    check('no page errors on either side',A.errors.length===0&&B.errors.length===0,{A:A.errors,B:B.errors});
  }catch(e){check('room check ran to the end',false,e.message);}
  finally{await browser.close();await srv.stop().catch(()=>{});}
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,1));
  console.log(failed?`${failed} check(s) failed`:'all checks passed');
  process.exit(failed?1:0);
})();
