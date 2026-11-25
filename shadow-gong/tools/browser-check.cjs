// Browser acceptance for 灯影守夜, run by hand (not part of CI or the build).
// Needs an existing Playwright install and Google Chrome; this repository does not install either.
//   python3 -m http.server 8917 --bind 127.0.0.1          (inside shadow-gong/)
//   NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <output-dir> [base-url] [--full | --orientation-only | --align-only]
// Writes screenshots and report.json into <output-dir>. --full also plays a whole match in real time (about 3 minutes).
// --align-only checks that the picture agrees with the verdict (hero facing, weapon on the gong, sparks on the gong,
// standing room, hints clear of the action, touch buttons); it prints PASS/FAIL lines and exits 1 on any failure.
// --pads-only runs just its last part: the touch buttons on narrow phones, upright and sideways.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path');
const args=process.argv.slice(2),full=args.includes('--full'),orientationOnly=args.includes('--orientation-only'),padsOnly=args.includes('--pads-only'),alignOnly=padsOnly||args.includes('--align-only'),pos=args.filter(a=>!a.startsWith('--'));
const out=pos[0]||'browser-check',base=pos[1]||'http://127.0.0.1:8917/index.html',origin=new URL(base).origin;
fs.mkdirSync(out,{recursive:true});
const shot=name=>path.join(out,name+'.png');

(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=metal']});
  const report={base,browser:browser.version(),runs:[]};
  async function open(query,options={}){
    const ctx=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1,...options});
    const page=await ctx.newPage(),errors=[],external=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    page.on('request',r=>{const u=r.url();if(!u.startsWith(origin)&&!u.startsWith('data:'))external.push(u);});
    await page.goto(base+query);
    await page.waitForFunction(()=>window.__duel&&window.__duel.ready,null,{polling:100,timeout:20000});
    return{ctx,page,errors,external};
  }
  const read=page=>page.evaluate(()=>({metrics:window.__duel.metrics,probe:window.__duel.probe()}));

  // B4 regression: a short orientation suggestion must yield to real combat hints.
  if(orientationOnly){
    let failures=0;
    for(const [width,height] of [[390,664],[320,568],[844,340],[844,300],[1365,900]]){
      const {ctx,page,errors,external}=await open('',{viewport:{width,height},deviceScaleFactor:width<1000?2:1,hasTouch:width<1000,isMobile:width<1000});
      const checks=[],portrait=width<height&&width<700;
      const check=(name,ok,data)=>{checks.push({name,ok:!!ok,data});if(!ok)failures++;console.log(`${ok?'PASS':'FAIL'} ${width}x${height} ${name}`);};
      await page.click('#start');await page.waitForTimeout(150);
      check('opening suggestion follows orientation',(await page.locator('#orientation').isVisible())===portrait);
      await page.screenshot({path:shot(`${width}x${height}-opening`)});
      await page.waitForFunction(()=>document.querySelector('#hint').classList.contains('on'),null,{polling:50});
      check('first combat hint immediately hides orientation',!await page.locator('#orientation').isVisible(),await page.locator('#hint').innerText());
      await page.screenshot({path:shot(`${width}x${height}-hint`)});
      if(portrait){
        // Pause before the first combat hint, so this tests the timer independently.
        await page.reload();await page.waitForFunction(()=>window.__duel?.ready,null,{polling:100});
        await page.click('#start');await page.click('#pause-button');await page.waitForTimeout(3200);
        check('suggestion expires after three seconds without a combat hint',!await page.locator('#orientation').isVisible());
      }
      await page.goto(base+'?view=hero&seed=11');await page.waitForFunction(()=>window.__duel?.ready,null,{polling:100});
      const state=await page.evaluate(()=>({view:__duel.view,frozen:__duel.frozen,stats:__duel.state.stats}));
      check('hero hook reached a real perfect parry',state.view==='hero'&&state.frozen&&state.stats.perfect>0,state);
      check('perfect-parry hint has no orientation overlay',!await page.locator('#orientation').isVisible()&&await page.locator('#hint').evaluate(e=>e.classList.contains('on')),await page.locator('#hint').innerText());
      await page.screenshot({path:shot(`${width}x${height}-parry`)});
      check('zero page errors and external requests',errors.length===0&&external.length===0,{errors,external});
      report.runs.push({width,height,checks,metrics:await page.evaluate(()=>__duel.metrics)});await ctx.close();
    }
    await browser.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));process.exitCode=failures?1:0;return;
  }

  // 2026-11-24 play report: "the new hero's moves and the judgement do not line up". Seeded matches driven by the
  // in-page autopilot are frozen on the frame a blow is judged, and __duel.align() reports what is on screen in CSS pixels.
  if(alignOnly){
    let failures=0;const checks=[];
    const check=(name,ok,data)=>{checks.push({name,ok:!!ok,data});if(!ok)failures++;console.log(`${ok?'PASS':'FAIL'} ${name}${data===undefined?'':'  '+JSON.stringify(data)}`);};
    const n1=v=>Math.round(v*10)/10,dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
    const hits=(a,b)=>a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom;
    // everything from the standing line up to the tallest head (the rat king's crown is 4.2 world units up), across the
    // cloth, as the resting camera frames it: a hint is fixed on the page, the hit push and shake last a fraction of a second
    const band=a=>({left:a.rest.cloth.left,right:a.rest.cloth.right,top:a.rest.floorY-4.4*a.rest.unit,bottom:a.rest.floorY+2});
    const frozen=async(page,ms=120000)=>{const t0=Date.now();while(Date.now()-t0<ms){if(await page.evaluate(()=>window.__duel.frozen))return true;await page.waitForTimeout(100);}return false;};
    {const {ctx,page}=await open('?view=hero');report.gpu=await page.evaluate(()=>__duel.metrics.gpu);await ctx.close();console.log('renderer: '+report.gpu);}
    if(!padsOnly){

    // 1. perfect parries from the right and from the left, at the reporter's desktop viewport (1280x521)
    for(const [name,wave,kind,from] of [['moth-from-right',0,'moth',1],['moth-from-left',0,'moth',-1],['blade-from-right',1,'scissors',1],['blade-from-left',1,'scissors',-1],['ratking',3,'rat',0]]){
      const {ctx,page,errors,external}=await open('?seed=11',{viewport:{width:1280,height:521}});
      await page.evaluate(([wave,kind,from])=>{__duel.start(wave);__duel.autopilot(true,{});
        __duel.freezeOn('parry',0,ev=>{if(!ev.perfect||ev.kind!==kind)return false;const e=__duel.state.enemies.find(x=>x.id===ev.id);if(!e||(from&&-e.face!==from))return false;window.__blow=ev.id;return true;});},[wave,kind,from]);
      const ok=await frozen(page);await page.waitForTimeout(120);
      const a=await page.evaluate(()=>({...__duel.align(),blow:window.__blow})),e=ok&&a.enemies.find(x=>x.id===a.blow),h=a.hero;
      check(`${name}: froze on a perfect parry`,ok&&e&&h&&h.gong,ok?{hero:h&&h.state,attacker:e&&`${e.kind} ${e.state} ${e.move}`}:undefined);
      if(ok&&e&&h&&h.gong){
        const side=-e.face,g=[h.gong.x,h.gong.y];
        check(`${name}: sprite faces the blow and the weapon is in front of him`,h.mirror===side&&(e.tip[0]-h.x)*h.mirror>0,{mirror:h.mirror,blowFrom:side,weaponAheadPx:n1((e.tip[0]-h.x)*h.mirror)});
        check(`${name}: weapon tip within one gong radius of the gong`,dist(e.tip,g)<=h.gong.r,{tipToGongPx:n1(dist(e.tip,g)),gongRadiusPx:n1(h.gong.r)});
        check(`${name}: sparks burst on the gong (centre of the live sparks within half a radius)`,a.sparks.n>=20&&dist(a.sparks.at,g)<=.5*h.gong.r,{sparks:a.sparks.n,sparksToGongPx:n1(dist(a.sparks.at,g)),gongRadiusPx:n1(h.gong.r)});
        if(kind!=='moth')check(`${name}: the hero's body is clear of the attacker's trunk and his gong reaches in by less than its radius`,e.into.body<=.5&&e.into.gong<=h.gong.r,{bodyIntoTrunkPx:n1(e.into.body),gongIntoTrunkPx:n1(e.into.gong),gongRadiusPx:n1(h.gong.r)});
        if(a.hint)check(`${name}: hint stays out of the action band and off the readouts`,!hits(a.hint,band(a))&&!a.hud.some(k=>hits(a.hint,k)),{hint:[n1(a.hint.top),n1(a.hint.bottom)],band:[n1(band(a).top),n1(band(a).bottom)],readouts:a.hud.map(k=>k.name),text:a.hint.text});
      }
      check(`${name}: zero page errors and external requests`,errors.length===0&&external.length===0,{errors,external});
      await page.screenshot({path:shot('align-'+name)});report.runs.push({name,align:a});await ctx.close();
    }
    // 2. the hero's own blow on the rat king: he must not stand inside him
    {
      const {ctx,page}=await open('?seed=11',{viewport:{width:1280,height:521}});
      await page.evaluate(()=>{__duel.start(3);__duel.autopilot(true,{});__duel.freezeOn('hit',0,ev=>{if(ev.kind!=='rat')return false;window.__blow=ev.id;return true;});});
      const ok=await frozen(page);await page.waitForTimeout(120);
      const a=await page.evaluate(()=>({...__duel.align(),blow:window.__blow})),e=ok&&a.enemies.find(x=>x.id===a.blow);
      check('ratking-struck: froze on the hero hitting the rat king',ok&&e&&a.hero);
      if(ok&&e&&a.hero)check('ratking-struck: the hero\'s body is clear of the rat king\'s trunk and his gong reaches in by less than its radius',e.into.body<=.5&&e.into.gong<=a.hero.gong.r,{bodyIntoTrunkPx:n1(e.into.body),gongIntoTrunkPx:n1(e.into.gong),gongRadiusPx:n1(a.hero.gong.r),heroState:a.hero.state});
      await page.screenshot({path:shot('align-ratking-struck')});report.runs.push({name:'ratking-struck',align:a});await ctx.close();
    }
    // 3. hints never cover the action: the frozen perfect-parry view (its hint is up) at desktop, phone portrait and landscape
    for(const [width,height,touch] of [[1280,521,false],[1280,720,false],[390,664,true],[844,390,true],[667,375,true]]){
      const tag=`${width}x${height}${touch?' touch':''}`;
      const {ctx,page}=await open('?view=hero&seed=11',{viewport:{width,height},deviceScaleFactor:touch?2:1,hasTouch:touch,isMobile:touch});
      await page.waitForTimeout(400);
      const a=await page.evaluate(()=>__duel.align()),b=band(a),box=r=>[n1(r.left),n1(r.top),n1(r.right),n1(r.bottom)];
      check(`${tag}: perfect-parry hint is showing`,!!a.hint,a.hint&&a.hint.text);
      if(a.hint){
        check(`${tag}: hint stays out of the action band (standing line up to the tallest head, across the cloth)`,!hits(a.hint,b),{hint:box(a.hint),band:box(b)});
        check(`${tag}: hint is inside the viewport`,a.hint.left>=0&&a.hint.top>=0&&a.hint.right<=width&&a.hint.bottom<=height,{hint:box(a.hint)});
        check(`${tag}: hint does not cover a readout (lamp oil, scene plate, sound and pause)`,!a.hud.some(k=>hits(a.hint,k)),{readouts:a.hud.map(k=>k.name)});
        if(touch)check(`${tag}: hint does not sit on a touch button, and no button covers a readout`,a.buttons.length===5&&!a.buttons.some(k=>hits(a.hint,k))&&!a.buttons.some(k=>a.hud.some(r=>hits(k,r))),{buttons:a.buttons.length});
      }
      const stage={heroHeightPx:n1(a.hero.box.bottom-a.hero.box.top),heroShareOfViewport:n1((a.hero.box.bottom-a.hero.box.top)/height*100)+'%',clothWidthShare:n1((a.cloth.right-a.cloth.left)/width*100)+'%',clothTopPx:n1(a.cloth.top),clothBottomPx:n1(a.cloth.bottom),floorPx:n1(a.floorY)};
      report.runs.push({name:'hint '+tag,stage,align:a});console.log('     '+tag+' stage: '+JSON.stringify(stage));
      await page.screenshot({path:shot(`align-hint-${width}x${height}`)});await ctx.close();
    }
    // 4. phone portrait with a real touch screen: the ticket lists touch controls, and every button sends its intent
    {
      const {ctx,page,errors,external}=await open('?seed=11',{viewport:{width:390,height:664},deviceScaleFactor:2,hasTouch:true,isMobile:true});
      const vis=sel=>page.locator(sel).isVisible();
      check('touch 390x664: the ticket lists the touch controls, not the keyboard',await vis('.touch-keys')&&!await vis('.desk-keys'),{touchKeys:await vis('.touch-keys'),deskKeys:await vis('.desk-keys')});
      const note=await page.locator('#start-note').innerText();
      check('touch 390x664: the note under the start button names no keyboard key',!/Esc/i.test(note),note);
      await page.screenshot({path:shot('align-touch-ticket')});
      const state=()=>page.evaluate(()=>{const s=__duel.state,p=s.player;return{state:p.state,x:p.x,paused:s.paused,phase:s.phase};});
      const centre=async key=>{const b=await page.locator(key.startsWith('#')?key:`#touch button[data-key="${key}"]`).boundingBox();return[b.x+b.width/2,b.y+b.height/2];};
      const seen=async(want,ms=400)=>{const t0=Date.now();let s;while(Date.now()-t0<ms){s=await state();if(s.state===want)return s;await page.waitForTimeout(16);}return s;};
      const restart=async()=>{await page.evaluate(()=>__duel.start(0));await page.waitForTimeout(250);};
      const cdp=await ctx.newCDPSession(page);
      const down=async key=>{const [x,y]=await centre(key);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});};
      const up=()=>cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await page.tap('#start');await page.waitForTimeout(250);
      check('touch 390x664: tapping the start button starts the match',(await state()).phase!=='menu',await state());
      for(const [key,label,want] of [['block','锣','guard'],['attack','槌','attack'],['dodge','闪','dodge']]){
        await restart();const [x,y]=await centre(key);await page.touchscreen.tap(x,y);const s=await seen(want);
        check(`touch 390x664: a tap on 「${label}」 puts the hero in ${want}`,s.state===want,s);
      }
      await restart();await down('block');await page.waitForTimeout(450);const held=await state();await up();await page.waitForTimeout(450);const released=await state();
      check('touch 390x664: holding 「锣」 keeps the guard up, letting go drops it',held.state==='guard'&&released.state==='idle',{held:held.state,after:released.state});
      await restart();const x0=(await state()).x;await down('right');await page.waitForTimeout(500);await up();const x1=(await state()).x;await page.waitForTimeout(300);const x2=(await state()).x;
      check('touch 390x664: holding ▶ walks right and stops on release',x1-x0>1&&Math.abs(x2-x1)<.1,{walked:n1(x1-x0),driftAfterRelease:n1(x2-x1)});
      await down('left');await page.waitForTimeout(400);const x3=(await state()).x;await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await page.waitForTimeout(300);const x4=(await state()).x;await page.waitForTimeout(300);const x5=(await state()).x;
      check('touch 390x664: holding ◀ walks left; a cancelled touch releases it',x3-x2<-.8&&Math.abs(x5-x4)<.1,{walked:n1(x3-x2),driftAfterCancel:n1(x5-x4)});
      const [px,py]=await centre('#pause-button');await page.touchscreen.tap(px,py);await page.waitForTimeout(200);const paused=(await state()).paused;
      await page.tap('#resume');await page.waitForTimeout(200);
      check('touch 390x664: 「歇」 pauses and 「接着演」 resumes',paused&&!(await state()).paused,{paused});
      const a=await page.evaluate(()=>__duel.align()),small=a.buttons.filter(b=>b.right-b.left<44||b.bottom-b.top<44),clash=[];
      for(let i=0;i<a.buttons.length;i++)for(let j=i+1;j<a.buttons.length;j++)if(hits(a.buttons[i],a.buttons[j]))clash.push(a.buttons[i].key+'/'+a.buttons[j].key);
      check('touch 390x664: five buttons, each at least 44 px, none overlapping',a.buttons.length===5&&!small.length&&!clash.length,{buttons:a.buttons.map(b=>`${b.key} ${n1(b.right-b.left)}x${n1(b.bottom-b.top)}`),clash});
      check('touch 390x664: zero page errors and external requests',errors.length===0&&external.length===0,{errors,external});
      await page.screenshot({path:shot('align-touch-play')});await ctx.close();
    }
    // 5. second play report: every hint the game can show, at every viewport: no orphaned last line (under three
    //    characters wide), still clear of the action band, the readouts and the buttons; and where the box sits
    for(const [width,height,touch] of [[1280,521,false],[1280,720,false],[390,664,false],[390,664,true],[320,568,true],[844,390,true],[667,375,true]]){
      const tag=`${width}x${height}${touch?' touch':''}`;
      const {ctx,page}=await open('?view=hero&seed=11',{viewport:{width,height},deviceScaleFactor:touch?2:1,hasTouch:touch,isMobile:touch});
      const texts=await page.evaluate(()=>__duel.hintTexts()),rows=[];
      for(const [id,text] of Object.entries(texts)){
        await page.evaluate(id=>__duel.showHint(id),id);await page.waitForTimeout(60);
        const m=await page.evaluate(()=>{const el=document.getElementById('hint'),r=document.createRange();r.selectNodeContents(el);
          const lines=[],em=parseFloat(getComputedStyle(el).fontSize),add=b=>{const l=lines.find(q=>Math.abs(q.top-b.top)<3);if(l){l.left=Math.min(l.left,b.left);l.right=Math.max(l.right,b.right);}else lines.push({top:b.top,left:b.left,right:b.right});};
          for(const tw=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);tw.nextNode();)for(let i=0;i<tw.currentNode.length;i++){r.setStart(tw.currentNode,i);r.setEnd(tw.currentNode,i+1);const b=r.getClientRects()[0];if(b)add(b);}
          lines.sort((a,b)=>a.top-b.top);
          // the text of the last line, read back by walking the characters
          // walk the characters: the text of the last line, and every place a line starts in the middle of a clause
          // (a new line may only begin after a comma, full stop, colon, exclamation mark or dash)
          const text=el.textContent,tw=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),bottom=lines[lines.length-1].top,split=[];let last='',k=0,prevTop=null;
          for(let node=tw.nextNode();node;node=tw.nextNode())for(let i=0;i<node.length;i++,k++){r.setStart(node,i);r.setEnd(node,i+1);const b=r.getClientRects()[0];if(!b)continue;
            if(Math.abs(b.top-bottom)<3)last+=text[k];
            if(prevTop!==null&&b.top-prevTop>3&&!/[，。：！—]/.test(text[k-1]))split.push(text.slice(Math.max(0,k-4),k)+' / '+text.slice(k,k+3));
            prevTop=b.top;}
          return{lines:lines.length,lastEm:(lines[lines.length-1].right-lines[lines.length-1].left)/em,last,split,a:__duel.align()};});
        const a=m.a,b=band(a),clear=!hits(a.hint,b)&&!a.hud.some(k=>hits(a.hint,k))&&!a.buttons.some(k=>hits(a.hint,k))&&a.hint.left>=0&&a.hint.top>=0&&a.hint.right<=width&&a.hint.bottom<=height;
        const gap=a.buttons.length?Math.min(...a.buttons.map(k=>Math.max(k.left-a.hint.right,a.hint.left-k.right,k.top-a.hint.bottom,a.hint.top-k.bottom))):null;
        rows.push({id,lines:m.lines,lastEm:n1(m.lastEm),last:m.last,split:m.split,clear,where:a.hint.bottom<=b.top?'above the action band':a.hint.top>=b.bottom?'below the standing line':'inside the band',top:n1(a.hint.top),bottom:n1(a.hint.bottom),gapToButtonsPx:gap===null?null:n1(gap)});
      }
      const orphans=rows.filter(r=>r.lines>1&&r.lastEm<3),blocked=rows.filter(r=>!r.clear),splits=rows.filter(r=>r.split.length);
      check(`${tag}: hints only break after punctuation, never inside a clause`,!splits.length,splits.map(r=>`${r.id}: ${r.split.join('; ')}`));
      check(`${tag}: no hint ends on an orphaned line (last line at least three characters wide), all ${rows.length} texts`,rows.length>=11&&!orphans.length,orphans.map(r=>`${r.id}: …/${r.last}`));
      check(`${tag}: every hint is clear of the action band, the readouts and the buttons, and inside the viewport`,!blocked.length,blocked.map(r=>r.id));
      const where=[...new Set(rows.map(r=>r.where))],ys=[Math.min(...rows.map(r=>r.top)),Math.max(...rows.map(r=>r.bottom))],gaps=rows.map(r=>r.gapToButtonsPx).filter(v=>v!==null);
      console.log(`     ${tag} hint box: ${where.join(' / ')}, y ${ys[0]}..${ys[1]} px, ${gaps.length?`nearest button ${Math.min(...gaps)} px away, `:''}up to ${Math.max(...rows.map(r=>r.lines))} lines`);
      report.runs.push({name:'hints '+tag,rows});
      await page.evaluate(()=>__duel.showHint('hurt'));await page.waitForTimeout(60);await page.screenshot({path:shot(`align-hints-${width}x${height}${touch?'-touch':''}`)});await ctx.close();
    }
    // 6. the ticket: every line of the key list starts at the same left edge, measured on the ink of its first glyph
    //    (a full-width bracket carries half a character of blank on its left and reads as an indent)
    for(const [touch,list] of [[true,'.touch-keys'],[false,'.desk-keys']]){
      const {ctx,page}=await open('',{viewport:touch?{width:390,height:664}:{width:1280,height:720},deviceScaleFactor:touch?2:1,hasTouch:touch,isMobile:touch});
      const edges=await page.evaluate(list=>{const g=document.createElement('canvas').getContext('2d'),out=[];
        for(const tagName of ['dt','dd'])for(const el of document.querySelectorAll(`${list} ${tagName}`)){
          const node=el.firstChild,text=node.data,i=text.search(/\S/),r=document.createRange();r.setStart(node,i);r.setEnd(node,i+1);
          const cs=getComputedStyle(el);g.font=`${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
          out.push({col:tagName,text,ink:r.getBoundingClientRect().left-g.measureText(text[i]).actualBoundingBoxLeft});}
        return out;},list);
      for(const col of ['dt','dd']){
        const rows=edges.filter(e=>e.col===col),lo=Math.min(...rows.map(e=>e.ink)),spread=Math.max(...rows.map(e=>e.ink))-lo;
        check(`ticket ${touch?'touch':'keyboard'} ${col==='dt'?'labels':'keys'}: first glyphs line up within 2 px`,rows.length===4&&spread<=2,{spreadPx:n1(spread),lines:rows.map(e=>`${e.text} +${n1(e.ink-lo)}`)});
      }
      await page.screenshot({path:shot('align-ticket-'+(touch?'touch':'keyboard'))});await ctx.close();
    }
    }
    // 7. 2026-11-25 report: on a 320-wide touch screen ▶ and 「槌」 sat on top of each other. On narrow phones, upright
    //    and sideways, the five buttons are each at least 44 px, at least 8 px apart (a thumb between two of them must
    //    not land on both), inside the viewport, off the readouts, and the centre of each one is that button
    for(const [width,height] of [[320,568],[360,640],[375,667],[390,664],[568,320],[640,360],[667,375],[844,390]]){
      const tag=`${width}x${height} touch`;
      const {ctx,page}=await open('?view=hero&seed=11',{viewport:{width,height},deviceScaleFactor:2,hasTouch:true,isMobile:true});
      await page.waitForTimeout(200);
      const a=await page.evaluate(()=>__duel.align()),bs=a.buttons,size=b=>`${b.key} ${n1(b.right-b.left)}x${n1(b.bottom-b.top)}`;
      const clash=[],gaps=[];
      for(let i=0;i<bs.length;i++)for(let j=i+1;j<bs.length;j++){if(hits(bs[i],bs[j]))clash.push(bs[i].key+'/'+bs[j].key);
        gaps.push(Math.max(bs[j].left-bs[i].right,bs[i].left-bs[j].right,bs[j].top-bs[i].bottom,bs[i].top-bs[j].bottom));}
      const small=bs.filter(b=>b.right-b.left<44||b.bottom-b.top<44),out=bs.filter(b=>b.left<0||b.top<0||b.right>width||b.bottom>height);
      const onTop=await page.evaluate(bs=>bs.filter(b=>{const el=document.elementFromPoint((b.left+b.right)/2,(b.top+b.bottom)/2);return !el||el.dataset.key!==b.key;}).map(b=>b.key),bs);
      check(`${tag}: five touch buttons, none overlapping another and at least 8 px apart`,bs.length===5&&!clash.length&&Math.min(...gaps)>=8,{clash,nearestGapPx:gaps.length?n1(Math.min(...gaps)):null});
      check(`${tag}: every touch button at least 44 px and inside the viewport`,bs.length===5&&!small.length&&!out.length,{buttons:bs.map(size),outside:out.map(b=>b.key)});
      check(`${tag}: the centre of every touch button is that button, and no button covers a readout`,!onTop.length&&!bs.some(k=>a.hud.some(r=>hits(k,r))),{covered:onTop,readouts:a.hud.map(k=>k.name)});
      report.runs.push({name:'pads '+tag,buttons:bs});
      await page.screenshot({path:shot(`align-pads-${width}x${height}`)});await ctx.close();
    }
    report.checks=checks;await browser.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,1));
    console.log(`${checks.length-failures}/${checks.length} alignment checks passed`);process.exitCode=failures?1:0;return;
  }

  // 1. fixed camera views (adaptive resolution locked, nothing else changed)
  for(const [name,query] of [['view-hero','?view=hero'],['view-hero-plain','?view=hero&plain=1'],['view-wide','?view=wide'],['view-stress','?view=stress']]){
    const {ctx,page,errors,external}=await open(query);await page.waitForTimeout(1300);
    const r=await read(page);await page.screenshot({path:shot(name)});
    report.runs.push({name,query,viewport:'1280x720',...r,errors,external});await ctx.close();
  }

  // 2. player default: no URL parameters, device pixel ratio 2, adaptive resolution on, real key presses
  {
    const {ctx,page,errors,external}=await open('',{deviceScaleFactor:2});
    await page.screenshot({path:shot('default-menu')});
    await page.click('#start');
    await page.evaluate(()=>window.__duel.freezeOn('parry',90,ev=>ev.perfect));
    let last=0,frozen=false;const t0=Date.now();
    while(Date.now()-t0<45000&&!frozen){
      const eta=await page.evaluate(()=>{const s=window.__duel.state;let best=null;
        for(const e of s.enemies){if(e.state!=='attack')continue;e.move.strikes.forEach((st,k)=>{if(e.tel[k]&&!e.done[k]){const t=(st.hit-e.clock)/e.rate;if(best===null||t<best)best=t;}});}return best;});
      if(eta!==null&&eta<.11&&Date.now()-last>500){await page.keyboard.down('k');last=Date.now();setTimeout(()=>page.keyboard.up('k').catch(()=>{}),180);}
      frozen=await page.evaluate(()=>window.__duel.frozen);
    }
    const r=await read(page),stats=await page.evaluate(()=>window.__duel.state.stats);
    await page.screenshot({path:shot('default-perfect-parry')});
    await page.evaluate(()=>{window.__duel.unfreeze();window.__duel.freezeOn('telegraph',120);});
    for(let i=0;i<200&&!(await page.evaluate(()=>window.__duel.frozen));i++)await page.waitForTimeout(100);
    await page.screenshot({path:shot('default-telegraph')});
    // mouse: right button guards, left button swings
    await page.evaluate(()=>window.__duel.unfreeze());
    await page.mouse.move(640,300);await page.mouse.down({button:'right'});await page.waitForTimeout(150);
    const guardByMouse=await page.evaluate(()=>window.__duel.state.player.state);
    await page.mouse.up({button:'right'});await page.waitForTimeout(400);
    await page.mouse.down({button:'left'});await page.waitForTimeout(60);
    const swingByMouse=await page.evaluate(()=>window.__duel.state.player.state);await page.mouse.up({button:'left'});
    report.runs.push({name:'default',viewport:'1280x720',keyboardPerfectParry:frozen,stats,guardByMouse,swingByMouse,...r,errors,external});
    await ctx.close();
  }

  // 3. touch on a phone-sized screen, landscape and portrait
  for(const [name,width,height] of [['touch-landscape',852,393],['touch-portrait',390,844]]){
    const {ctx,page,errors,external}=await open('',{viewport:{width,height},deviceScaleFactor:3,hasTouch:true,isMobile:true});
    await page.tap('#start');await page.waitForTimeout(3200);
    const cdp=await ctx.newCDPSession(page),tap=async(key,ms)=>{const b=await page.locator(`#touch button[data-key="${key}"]`).boundingBox();
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2}]});await page.waitForTimeout(ms);};
    const release=()=>cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await tap('block',120);const guardByTouch=await page.evaluate(()=>window.__duel.state.player.state);await release();await page.waitForTimeout(300);
    const x0=await page.evaluate(()=>window.__duel.state.player.x);await tap('right',500);await release();
    const walked=await page.evaluate(()=>window.__duel.state.player.x)-x0;
    const overflow=await page.evaluate(()=>({x:document.documentElement.scrollWidth>innerWidth,y:document.documentElement.scrollHeight>innerHeight}));
    const orientationTip=await page.locator('#orientation').isVisible();
    await page.screenshot({path:shot(name)});
    report.runs.push({name,viewport:`${width}x${height}`,guardByTouch,walked,overflow,orientationTip,metrics:await page.evaluate(()=>window.__duel.metrics),errors,external});
    await ctx.close();
  }

  // 4. optional: a whole match in real time with the in-page shaky autopilot, then a loss with no input
  if(full){
    const {ctx,page,errors,external}=await open('',{deviceScaleFactor:2});
    await page.click('#start');await page.evaluate(()=>window.__duel.autopilot(true,{human:true}));
    const t0=Date.now();let phase='',fps=[],pr=new Set();
    while(Date.now()-t0<420000){const s=await page.evaluate(()=>({phase:window.__duel.state.phase,m:window.__duel.metrics}));phase=s.phase;if(s.m.fps)fps.push(s.m.fps);pr.add(s.m.pixelRatio);if(phase==='won'||phase==='lost')break;await page.waitForTimeout(1000);}
    await page.waitForTimeout(2200);
    const seconds=(Date.now()-t0)/1000,title=await page.textContent('#result-title'),stats=await page.textContent('#result-stats');
    await page.screenshot({path:shot('full-result')});
    await page.click('#again');await page.evaluate(()=>window.__duel.autopilot(false));
    for(let i=0;i<240&&(await page.evaluate(()=>window.__duel.state.phase))!=='lost';i++)await page.waitForTimeout(1000);
    await page.waitForTimeout(2000);
    const lost=await page.textContent('#result-title'),retry=await page.textContent('#again');
    fps.sort((a,b)=>a-b);
    report.runs.push({name:'full-match',phase,seconds,title,stats,lost,retry,fpsMin:fps[0],fpsMedian:fps[fps.length>>1],pixelRatios:[...pr],errors,external});
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,1));
  console.log(JSON.stringify(report,null,1));
})().catch(e=>{console.error(e);process.exit(1);});
