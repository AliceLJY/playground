// Portrait demo film for 一条消息的旅程, run by hand (not part of CI): title → five levels → the all-clear card → signature end card.
// Needs Playwright, Google Chrome and ffmpeg already on the machine; this repository installs none of them.
//   python3 -m http.server 8942 --bind 127.0.0.1          (inside message-pipe/)
//   NODE_PATH="$(npm root -g)" node tools/record.cjs <video-only.mp4> <events.json> [--endcard <dir with endcard.html>] [--base URL]
// The page's clock (performance.now, Date.now, requestAnimationFrame, setTimeout and CSS animations) is taken over before it
// loads, and every video frame advances it by exactly 1/30 s, then screenshots at device pixels (540×960 CSS × 2 = 1080×1920).
// Taps are real mouse clicks on the cells; a fading ring shows where the finger landed.
// events.json lists the video time of every tap, ride, failure, delivery and card, for tools/demo-music.py.
const {chromium}=require('playwright');
const {spawn}=require('child_process');
const fs=require('fs');

const args=process.argv.slice(2),flag=(n,d)=>{const i=args.indexOf('--'+n);return i>=0?args[i+1]:d;};
const [out,evOut]=args;
if(!out||!evOut){console.error('usage: record.cjs <video.mp4> <events.json> [--endcard dir] [--base url]');process.exit(2);}
const base=flag('base','http://127.0.0.1:8942/index.html'),endDir=flag('endcard',null),FPS=30,FRAME=1000/FPS,W=540,H=960,DPR=2;

function takeOverClock(){
  let vnow=0,queue=[],nextId=1,timers=[];const wall=Date.now();
  performance.now=()=>vnow;Date.now=()=>wall+vnow;
  window.requestAnimationFrame=cb=>{const id=nextId++;queue.push({id,cb});return id;};
  window.cancelAnimationFrame=id=>{queue=queue.filter(q=>q.id!==id);};
  window.setTimeout=(cb,ms)=>{const id=nextId++;timers.push({id,cb,at:vnow+(ms||0)});return id;};
  window.clearTimeout=id=>{timers=timers.filter(t=>t.id!==id);};
  const seen=new WeakMap();
  window.__rec={get now(){return vnow;},
    step(ms){
      vnow+=ms;
      const due=timers.filter(t=>t.at<=vnow);timers=timers.filter(t=>t.at>vnow);for(const t of due){try{t.cb();}catch(e){console.error(e);}}
      const q=queue;queue=[];for(const {cb} of q){try{cb(vnow);}catch(e){console.error(e);}}
      for(const a of document.getAnimations()){if(!seen.has(a)){seen.set(a,vnow);a.pause();}a.currentTime=vnow-seen.get(a);}
    },
    touch(x,y){ // a ring where the finger lands; CSS animation stepped on the same clock
      if(!document.getElementById('rec-touch-style')){const st=document.createElement('style');st.id='rec-touch-style';
        st.textContent='.rec-touch{position:fixed;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;border:4px solid #fff;background:#ffffff40;pointer-events:none;z-index:99;animation:rec-touch .5s ease-out forwards}@keyframes rec-touch{from{transform:scale(.55);opacity:1}to{transform:scale(1.35);opacity:0}}';
        document.head.appendChild(st);}
      const d=document.createElement('div');d.className='rec-touch';d.style.left=x+'px';d.style.top=y+'px';document.body.appendChild(d);
      window.setTimeout(()=>d.remove(),600);
    }
  };
}

(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const ctx=await browser.newContext({viewport:{width:W,height:H},deviceScaleFactor:DPR});
  await ctx.addInitScript(takeOverClock);
  try{await ctx.addInitScript(()=>{try{localStorage.clear();}catch(e){}});}catch(e){}
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base);
  for(let i=0;i<300&&!await page.evaluate(()=>!!(window.__pipe&&window.__pipe.ready));i++){await page.evaluate(ms=>window.__rec.step(ms),FRAME);await page.waitForTimeout(10);}
  for(let i=0;i<10;i++)await page.evaluate(ms=>window.__rec.step(ms),FRAME);

  const ff=spawn('ffmpeg',['-y','-hide_banner','-loglevel','error','-f','image2pipe','-framerate',String(FPS),'-c:v','mjpeg','-i','-',
    '-vf','scale=1080:1920:in_color_matrix=bt601:in_range=full:out_color_matrix=bt709:out_range=limited:flags=accurate_rnd+full_chroma_int,format=yuv420p,'+
      'setparams=range=limited:colorspace=bt709:color_primaries=bt709:color_trc=bt709',
    '-c:v','libx264','-preset','slow','-crf','18','-r',String(FPS),out],{stdio:['pipe','inherit','inherit']});
  const done=new Promise((res,rej)=>ff.on('close',c=>c===0?res():rej(new Error('ffmpeg exited '+c))));
  let frames=0;const marks=[],sections=[];
  const t=()=>+(frames/FPS).toFixed(3),mark=(name,extra)=>marks.push({t:t(),name,...extra}),section=kind=>sections.push({t:t(),kind});
  const write=async jpg=>{if(!ff.stdin.write(jpg))await new Promise(r=>ff.stdin.once('drain',r));frames++;};
  let lastSnap={};
  const shoot=async()=>{
    await write(await page.screenshot({type:'jpeg',quality:92}));
    const s=await page.evaluate(ms=>{window.__rec.step(ms);return window.__pipe.snapshot();},FRAME);
    if(s.phase!==lastSnap.phase){if(s.phase==='ride')mark('ride');if(s.phase==='cleared')mark('deliver');}
    if(s.fail&&!(lastSnap.fail))mark(s.fail.kind==='emptybox'?'emptybox':'fail');
    if(s.card!==lastSnap.card&&s.card)mark('card',{card:s.card});
    lastSnap=s;return s;
  };
  const hold=async sec=>{for(let i=0;i<Math.round(sec*FPS);i++)await shoot();};
  const until=async(fn,max=20)=>{for(let i=0;i<max*FPS;i++){const s=await shoot();if(fn(s))return s;}throw new Error('timed out waiting in the film');};
  const press=async(x,y)=>{await page.evaluate(([x,y])=>window.__rec.touch(x,y),[x,y]);await page.mouse.click(x,y);};
  const button=async(sel,pause=0.35)=>{const b=await page.locator(sel).boundingBox();await hold(pause);await press(b.x+b.width/2,b.y+b.height/2);mark('button');};
  const tapAll=async(taps,gap)=>{for(const i of taps){const p=await page.evaluate(i=>window.__pipe.cellCenter(i),i);await press(p.x,p.y);mark('tap');await hold(gap);}};
  const solution=()=>page.evaluate(()=>window.__pipe.solution());
  // the level's built-in shortcut: the cheapest taps that make the trap route (skips a station)
  const trapTaps=()=>page.evaluate(()=>window.__pipe.trap());
  const play=async(level,{gap,trap})=>{
    section('level'+level);
    await button('#c-go',1.6);                                  // intro card → 开始
    await hold(0.9);                                             // let the turning-arrow hint show once
    if(trap){
      await tapAll(await trapTaps(),gap);await hold(0.5);
      await button('#go',0.1);
      await until(s=>!!s.fail);await hold(2.4);                  // the cat stops, the skipped number blinks
      await until(s=>!s.fail,4);
    }
    await tapAll(await solution(),gap);await hold(0.45);
    await button('#go',0.1);
    await until(s=>s.card==='cleared',20);await hold(3.4);      // the lesson card
  };

  section('title');await hold(2.6);
  await button('#c-go',0);                                      // ▶ 开始第 1 关 → intro card
  await play(0,{gap:0.42});
  await button('#c-go',0);await play(1,{gap:0.28,trap:true});
  await button('#c-go',0);await play(2,{gap:0.28,trap:true});
  await button('#c-go',0);await play(3,{gap:0.16});
  await button('#c-go',0);await play(4,{gap:0.16});
  await button('#c-go',0);section('final');await hold(4.2);   // ▶ 看全部五段 → the all-clear card

  // signature end card, its own page at 1080×1920, seeked frame by frame
  if(endDir){
    section('endcard');mark('endcard');
    const ep=await (await browser.newContext({viewport:{width:1080,height:1920},deviceScaleFactor:1})).newPage();
    await ep.goto('file://'+endDir+'/endcard.html');await ep.waitForFunction(()=>window.__ready,null,{polling:100});
    const dur=await ep.evaluate(()=>window.__duration());
    for(let i=0;i<Math.round(dur*FPS);i++){await ep.evaluate(x=>window.__seek(x),i/FPS);await write(await ep.screenshot({type:'jpeg',quality:92}));}
  }
  ff.stdin.end();await done;await browser.close();
  fs.writeFileSync(evOut,JSON.stringify({seconds:+(frames/FPS).toFixed(3),fps:FPS,marks,sections},null,1));
  console.log(JSON.stringify({out,frames,seconds:+(frames/FPS).toFixed(2),errors},null,1));
  if(errors.length)process.exit(1);
})().catch(e=>{console.error(e);process.exit(1);});
