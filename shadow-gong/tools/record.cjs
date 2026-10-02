// Frame-exact gameplay recording for 灯影守夜, run by hand (not part of CI or the build).
// Needs an existing Playwright install, Google Chrome and ffmpeg; this repository installs none of them.
//   python3 -m http.server 8917 --bind 127.0.0.1          (inside shadow-gong/)
//   NODE_PATH="$(npm root -g)" node tools/record.cjs <output.mp4> [--seed N] [--seconds S] [--size 1920x1080] [--base URL]
// The page's clock is taken over before it loads: every video frame advances the game by exactly 1/60 s,
// CSS animations are stepped on the same clock, and the game's AudioContext is swapped for an offline one
// whose currentTime follows that clock, so every sound lands on the frame that caused it.
const {chromium}=require('playwright');
const {spawn}=require('child_process');
const fs=require('fs'),path=require('path'),os=require('os');

const args=process.argv.slice(2),flag=(name,def)=>{const i=args.indexOf('--'+name);return i>=0?args[i+1]:def;};
const out=args.find(a=>a.endsWith('.mp4'));if(!out){console.error('usage: record.cjs <output.mp4> [--seed N] [--seconds S]');process.exit(2);}
const seed=+flag('seed',19),limit=+flag('seconds',0),[W,H]=flag('size','1920x1080').split('x').map(Number);
const base=flag('base','http://127.0.0.1:8917/index.html'),FPS=60,FRAME=1000/FPS;
const work=fs.mkdtempSync(path.join(os.tmpdir(),'shadow-gong-rec-')),videoOnly=path.join(work,'video.mp4'),wav=path.join(work,'audio.wav');

// Runs in the page before any of its scripts.
function takeOverClock(){
  let vnow=0,queue=[],nextId=1;const wall=Date.now();
  performance.now=()=>vnow;Date.now=()=>wall+vnow;
  window.requestAnimationFrame=cb=>{const id=nextId++;queue.push({id,cb});return id;};
  window.cancelAnimationFrame=id=>{queue=queue.filter(q=>q.id!==id);};
  const seen=new WeakMap();
  class RecordingAudioContext extends OfflineAudioContext{
    constructor(){super(2,48000*360,48000);this._t0=vnow;window.__rec.audio=this;window.__rec.audioStart=vnow;}
    get currentTime(){return(vnow-this._t0)/1000;}
    get state(){return'running';}
    resume(){return Promise.resolve();}
  }
  window.AudioContext=RecordingAudioContext;window.webkitAudioContext=RecordingAudioContext;
  window.__rec={audio:null,audioStart:0,get now(){return vnow;},
    step(ms){
      vnow+=ms;const q=queue;queue=[];for(const {cb} of q){try{cb(vnow);}catch(e){console.error(e);}}
      for(const a of document.getAnimations()){if(!seen.has(a)){seen.set(a,vnow);a.pause();}a.currentTime=vnow-seen.get(a);}
    },
    // Render the offline audio and keep it as 16-bit stereo WAV aligned to the first video frame.
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
  const ctx=await browser.newContext({viewport:{width:W,height:H},deviceScaleFactor:1});
  await ctx.addInitScript(takeOverClock);
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`${base}?seed=${seed}`);
  const isReady=()=>page.evaluate(()=>!!(window.__duel&&window.__duel.ready));
  for(let i=0;i<500&&!await isReady();i++){await page.evaluate(ms=>window.__rec.step(ms),FRAME);await page.waitForTimeout(20);}  // the loop starts after async boot
  for(let i=0;i<30;i++)await page.evaluate(ms=>window.__rec.step(ms),FRAME);   // settle, upload textures
  if(!await isReady())throw new Error('game did not become ready within 10 s');

  // Screenshots are full-range BT.601 JPEG, and recent ffmpeg carries that range into the H.264 output unless told
  // otherwise; convert to limited-range BT.709 and tag it, the form players and upload transcoders expect.
  const ff=spawn('ffmpeg',['-y','-hide_banner','-loglevel','error','-f','image2pipe','-framerate',String(FPS),'-c:v','mjpeg','-i','-',
    '-vf','scale=in_color_matrix=bt601:in_range=full:out_color_matrix=bt709:out_range=limited:flags=accurate_rnd+full_chroma_int,format=yuv420p,'+
      'setparams=range=limited:colorspace=bt709:color_primaries=bt709:color_trc=bt709',
    '-c:v','libx264','-preset','slow','-crf','18','-r',String(FPS),videoOnly],{stdio:['pipe','inherit','inherit']});
  const done=new Promise((res,rej)=>ff.on('close',c=>c===0?res():rej(new Error('ffmpeg exited '+c))));
  const videoStart=await page.evaluate(()=>window.__rec.now);let frames=0,wonAt=-1,phase='menu';
  const shoot=async()=>{const jpg=await page.screenshot({type:'jpeg',quality:92});if(!ff.stdin.write(jpg))await new Promise(r=>ff.stdin.once('drain',r));frames++;};
  // Each step reports a few counters; the timeline keeps the video time (s) of every change, for checking frames and audio sync.
  const advance=()=>page.evaluate(ms=>{window.__rec.step(ms);const s=window.__duel.state;
    return{phase:s.phase,wave:s.wave,perfect:s.stats.perfect,block:s.stats.block,hurt:s.stats.hurt,exec:s.stats.exec,hp:Math.round(s.player.hp)};},FRAME);
  const timeline=[];let last={};
  const note=st=>{const d={};for(const k in st)if(st[k]!==last[k])d[k]=st[k];if(Object.keys(d).length)timeline.push({t:+(frames/FPS).toFixed(3),...d});last=st;phase=st.phase;};
  for(let i=0;i<Math.round(2.5*FPS);i++){await shoot();note(await advance());}            // the ticket menu
  await page.evaluate(()=>{window.__duel.start();window.__duel.autopilot(true,{human:true,lead:.09,sd:.05});});
  while(true){
    await shoot();note(await advance());
    if((phase==='won'||phase==='lost')&&wonAt<0)wonAt=frames;
    if(wonAt>=0&&frames-wonAt>=Math.round(5.5*FPS))break;                                  // hold on the result card
    if(limit&&frames>=limit*FPS)break;
    if(frames>FPS*350)throw new Error('run did not finish in 350 s of video (the offline audio holds 360 s)');
    if(frames%(FPS*10)===0)process.stdout.write(`  ${frames/FPS}s recorded, phase ${phase}, wave ${last.wave}\n`);
  }
  ff.stdin.end();await done;
  fs.writeFileSync(path.join(work,'timeline.json'),JSON.stringify(timeline));
  const videoEnd=await page.evaluate(()=>window.__rec.now),len=await page.evaluate(([a,b])=>window.__rec.renderWav(a,b),[videoStart,videoEnd]);
  const parts=[];for(let i=0;i<len;i+=4e6)parts.push(await page.evaluate(([a,b])=>window.__rec.wavB64.slice(a,b),[i,i+4e6]));
  fs.writeFileSync(wav,Buffer.from(parts.join(''),'base64'));
  const stats=await page.evaluate(()=>window.__duel.state.stats);
  await browser.close();
  await new Promise((res,rej)=>{const m=spawn('ffmpeg',['-y','-hide_banner','-loglevel','error','-i',videoOnly,'-i',wav,'-c:v','copy',
    '-af','loudnorm=I=-16:TP=-1.5:LRA=11','-c:a','aac','-b:a','192k','-ar','48000','-shortest','-movflags','+faststart',out],{stdio:'inherit'});m.on('close',c=>c===0?res():rej(new Error('mux exited '+c)));});
  console.log(JSON.stringify({out,seed,frames,seconds:+(frames/FPS).toFixed(2),phase,stats,errors,work,timeline:path.join(work,'timeline.json')},null,1));
})().catch(e=>{console.error(e);process.exit(1);});
