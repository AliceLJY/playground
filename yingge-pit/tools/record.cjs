// Frame-exact gameplay recording for 打回乐池, run by hand (not part of CI). Adapted from slipper-smash/tools/record.cjs.
// Needs an existing Playwright install, Google Chrome and ffmpeg; this repository installs none of them.
//   python3 -m http.server 8951 --bind 127.0.0.1          (inside yingge-pit/)
//   NODE_PATH="$(npm root -g)" node tools/record.cjs <output.mp4> [--mode solo|duo] [--seed N] [--seconds S] [--react 0.30] [--sd 0.12] [--no-drum] [--events out.json] [--size 540x960] [--dpr 2]
// The round is played with real touch input: the page's own title screen is tapped, then the recorder taps the pad of each
// lane whose iron rod lights, after a normally distributed delay (default 0.30 +- 0.12 s, the spec's shaky-thumb player;
// in duo, the thumb on that side), rings the gong when it glows
// and goes for the red ball. --seconds stops early (the "first 30 seconds" clip); otherwise it records to the result card.
// --no-drum switches off the game's background drum point (for cuts that get their own score); --events writes every game
// event (hit, miss, gong, ...) with its video time, for syncing music to the picture.
// The page's clock is taken over before it loads: every video frame advances the game by exactly 1/60 s, and the game's
// AudioContext is swapped for an offline one whose currentTime follows that clock, so every sound lands on its frame.
const {chromium}=require('playwright');
const {spawn}=require('child_process');
const fs=require('fs'),path=require('path'),os=require('os');

const args=process.argv.slice(2),flag=(name,def)=>{const i=args.indexOf('--'+name);return i>=0?args[i+1]:def;};
const out=args.find(a=>a.endsWith('.mp4'));if(!out){console.error('usage: record.cjs <output.mp4> [--mode solo|duo] [--seed N] [--seconds S]');process.exit(2);}
const mode=flag('mode','solo'),seed=+flag('seed',11),react=+flag('react',0.30),sd=+flag('sd',0.12),limit=+flag('seconds',0),[W,H]=flag('size','540x960').split('x').map(Number),DPR=+flag('dpr',2);
const noDrum=args.includes('--no-drum'),eventsOut=flag('events',null);
const base=flag('base','http://127.0.0.1:8951/index.html'),FPS=60,FRAME=1000/FPS;
const work=fs.mkdtempSync(path.join(os.tmpdir(),'yingge-pit-rec-')),videoOnly=path.join(work,'video.mp4'),wav=path.join(work,'audio.wav');

// Runs in the page before any of its scripts. Same as slipper-smash's recorder.
function takeOverClock(){
  let vnow=0,queue=[],nextId=1;const wall=Date.now();
  performance.now=()=>vnow;Date.now=()=>wall+vnow;
  window.requestAnimationFrame=cb=>{const id=nextId++;queue.push({id,cb});return id;};
  window.cancelAnimationFrame=id=>{queue=queue.filter(q=>q.id!==id);};
  class RecordingAudioContext extends OfflineAudioContext{
    constructor(){super(2,48000*240,48000);this._t0=vnow;window.__rec.audio=this;window.__rec.audioStart=vnow;}
    get currentTime(){return(vnow-this._t0)/1000;}
    get state(){return'running';}
    resume(){return Promise.resolve();}
  }
  window.AudioContext=RecordingAudioContext;window.webkitAudioContext=RecordingAudioContext;
  window.__rec={audio:null,audioStart:0,get now(){return vnow;},
    step(ms){vnow+=ms;const q=queue;queue=[];for(const {cb} of q){try{cb(vnow);}catch(e){console.error(e);}}},
    async renderWav(videoStart,videoEnd){
      const ctx=window.__rec.audio,sr=48000,lead=Math.max(0,Math.round((window.__rec.audioStart-videoStart)/1000*sr)),n=Math.round((videoEnd-videoStart)/1000*sr);
      const buf=ctx?await ctx.startRendering():null,L=buf?buf.getChannelData(0):null,R=buf?buf.getChannelData(1):null;
      const bytes=new Uint8Array(44+n*4),v=new DataView(bytes.buffer),txt=(o,s)=>{for(let i=0;i<s.length;i++)bytes[o+i]=s.charCodeAt(i);};
      txt(0,'RIFF');v.setUint32(4,36+n*4,true);txt(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);
      v.setUint32(24,sr,true);v.setUint32(28,sr*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);txt(36,'data');v.setUint32(40,n*4,true);
      for(let i=0;i<n;i++){const j=i-lead,l=L&&j>=0&&j<L.length?L[j]:0,r=R&&j>=0&&j<R.length?R[j]:0;
        v.setInt16(44+i*4,Math.max(-1,Math.min(1,l))*32767,true);v.setInt16(46+i*4,Math.max(-1,Math.min(1,r))*32767,true);}
      let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));
      window.__rec.wavB64=btoa(s);return window.__rec.wavB64.length;
    }
  };
}

(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const ctx=await browser.newContext({viewport:{width:W,height:H},deviceScaleFactor:DPR,hasTouch:true,isMobile:true});
  await ctx.addInitScript(takeOverClock);
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'?seed='+seed);
  const isReady=()=>page.evaluate(()=>!!(window.__yingge&&window.__yingge.ready));
  for(let i=0;i<500&&!await isReady();i++){await page.evaluate(ms=>window.__rec.step(ms),FRAME);await page.waitForTimeout(20);}
  for(let i=0;i<30;i++)await page.evaluate(ms=>window.__rec.step(ms),FRAME);
  if(!await isReady())throw new Error('game did not become ready');
  if(noDrum)await page.evaluate(()=>window.__yingge.ambient(false));
  // the round's seed: Math.random is seeded so the real title-screen start picks the same round every time
  await page.evaluate(sd=>{let a=sd>>>0;Math.random=()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};},seed);

  const ff=spawn('ffmpeg',['-y','-hide_banner','-loglevel','error','-f','image2pipe','-framerate',String(FPS),'-c:v','mjpeg','-i','-',
    '-vf','scale=in_color_matrix=bt601:in_range=full:out_color_matrix=bt709:out_range=limited:flags=accurate_rnd+full_chroma_int,format=yuv420p,'+
      'setparams=range=limited:colorspace=bt709:color_primaries=bt709:color_trc=bt709',
    '-c:v','libx264','-preset','slow','-crf','18','-r',String(FPS),videoOnly],{stdio:['pipe','inherit','inherit']});
  const done=new Promise((res,rej)=>ff.on('close',c=>c===0?res():rej(new Error('ffmpeg exited '+c))));
  const videoStart=await page.evaluate(()=>window.__rec.now);let frames=0,overAt=-1;
  const shoot=async()=>{const jpg=await page.screenshot({type:'jpeg',quality:92});if(!ff.stdin.write(jpg))await new Promise(r=>ff.stdin.once('drain',r));frames++;};
  const step=()=>page.evaluate(ms=>{window.__rec.step(ms);return window.__yingge.probe();},FRAME);
  // a seeded reaction-time source for the recorder's thumbs
  let rs=(seed*7919+3)>>>0;const rnd=()=>{rs=(rs*1664525+1013904223)>>>0;return rs/4294967296;},gauss=()=>{let u=0;while(u===0)u=rnd();return Math.sqrt(-2*Math.log(u))*Math.cos(6.2831853*rnd());};
  const pending=[],seen=new Set();let gongPlanned=false,ballFor=-1,p=await step(),now=0;
  const at=(dt,fn)=>pending.push({t:now+dt,fn});
  const touch=(x,y)=>page.touchscreen.tap(x,y);
  // title: pick the mode on the title screen with a real tap, then tap to start
  for(let i=0;i<Math.round(1.6*FPS);i++){await shoot();p=await step();now+=1/FPS;}
  if(mode==='duo'){const b=await page.evaluate(()=>window.__yingge.toCss(695,1842));await touch(b.x,b.y);}   // the 双人 button
  for(let i=0;i<Math.round(0.9*FPS);i++){await shoot();p=await step();now+=1/FPS;}
  await touch(W/2,H*0.45);
  const timeline=[],events=[],seenEv=new Set();let lastPhase='';
  while(true){
    await shoot();p=await step();now+=1/FPS;
    const s=p.state;if(!s){continue;}
    if(s.phase!==lastPhase){timeline.push({t:+(frames/FPS).toFixed(2),phase:s.phase,wave:s.wave});lastPhase=s.phase;events.push({v:+(frames/FPS).toFixed(3),type:'phase',phase:s.phase,wave:s.wave,phaseT:0});}
    if(eventsOut){const lg=await page.evaluate(()=>window.__yingge.log.slice());for(const e of lg){const k=e.type+'|'+e.lane+'|'+e.player+'|'+e.t;if(!seenEv.has(k)){seenEv.add(k);events.push({v:+(frames/FPS).toFixed(3),...e});}}}
    // react to each lit lane once, with the thumb on that lane's side
    s.litIds.forEach((id,lane)=>{if(id==null||seen.has(id+':'+lane))return;seen.add(id+':'+lane);
      const pads=p.pads.filter(r=>r.lane===lane),pad=mode==='duo'&&lane===1?pads[Math.floor(rnd()*pads.length)]:pads[0];
      at(Math.max(0.06,react+sd*gauss()),()=>touch(pad.x+pad.w*(0.3+0.4*rnd()),pad.y+pad.h*(0.3+0.4*rnd())));});
    if(s.phase==='wave'&&s.meter>=8&&!gongPlanned){gongPlanned=true;at(0.5+0.2*rnd(),()=>{gongPlanned=false;return touch(p.gong.x,p.gong.y);});}
    if(s.ball&&ballFor!==s.wave&&rnd()<0.05){ballFor=s.wave;at(0.05,async()=>{const q=await page.evaluate(()=>window.__yingge.probe());if(q.state&&q.state.ball)await touch(q.state.ball.x,q.state.ball.y);});}
    for(let i=0;i<pending.length;i++)if(pending[i].t<=now){const f=pending.splice(i--,1)[0];await f.fn();}
    if(p.screen==='result'&&overAt<0)overAt=frames;
    if(overAt>=0&&frames-overAt>=Math.round(5*FPS))break;
    if(limit&&frames>=limit*FPS)break;
    if(frames>FPS*180)throw new Error('run did not finish in 180 s of video');
    if(frames%(FPS*10)===0)process.stdout.write(`  ${frames/FPS}s recorded, ${s.phase} wave ${s.wave+1} level ${s.level}\n`);
  }
  ff.stdin.end();await done;
  const videoEnd=await page.evaluate(()=>window.__rec.now),len=await page.evaluate(([a,b])=>window.__rec.renderWav(a,b),[videoStart,videoEnd]);
  const parts=[];for(let i=0;i<len;i+=4e6)parts.push(await page.evaluate(([a,b])=>window.__rec.wavB64.slice(a,b),[i,i+4e6]));
  fs.writeFileSync(wav,Buffer.from(parts.join(''),'base64'));
  const stats=await page.evaluate(()=>{const p=window.__yingge.probe();return p.state&&p.state.result;});
  const log=await page.evaluate(()=>window.__yingge.log.slice(-20));
  await browser.close();
  await new Promise((res,rej)=>{const m=spawn('ffmpeg',['-y','-hide_banner','-loglevel','error','-i',videoOnly,'-i',wav,'-c:v','copy',
    '-af','loudnorm=I=-16:TP=-1.5:LRA=11','-c:a','aac','-b:a','192k','-ar','48000','-shortest','-movflags','+faststart',out],{stdio:'inherit'});m.on('close',c=>c===0?res():rej(new Error('mux exited '+c)));});
  fs.writeFileSync(path.join(work,'timeline.json'),JSON.stringify(timeline));
  if(eventsOut)fs.writeFileSync(eventsOut,JSON.stringify({fps:FPS,frames,events},null,0));
  console.log(JSON.stringify({out,mode,seed,frames,seconds:+(frames/FPS).toFixed(2),stats,errors,timeline,lastEvents:log.slice(-6),work},null,1));
})().catch(e=>{console.error(e);process.exit(1);});
