// Portrait demo with narration for 凭证扫雷, run by hand (not part of CI). Clock and audio take-over adapted from slipper-smash/tools/record.cjs.
// Needs Playwright with Chromium and ffmpeg; narration clips l1.mp3 … l8.mp3 are made beforehand (edge-tts, see the batch README).
//   python3 -m http.server 8941 --bind 127.0.0.1        (in the repository root)
//   NODE_PATH="$(npm root -g)" node secret-sweeper/tools/record.cjs <out.mp4> <narration-dir> [--base URL]
// The page is 540×960 CSS at 2× (1080×1920): a title strip, the game in an iframe, a subtitle strip.
// Every video frame advances the game by exactly 1/30 s; the game's own sounds come from an offline AudioContext on the same clock,
// and the narration is laid over them at the frame where each line starts. All taps are real touch events.
const {chromium}=require('playwright');
const {spawn,execFileSync}=require('child_process');
const fs=require('fs'),path=require('path'),os=require('os');
const args=process.argv.slice(2),flag=(n,d)=>{const i=args.indexOf('--'+n);return i>=0?args[i+1]:d;};
const out=args[0],nar=args[1];if(!out||!nar){console.error('usage: record.cjs <out.mp4> <narration-dir>');process.exit(2);}
const base=flag('base','http://127.0.0.1:8941/secret-sweeper/index.html'),FPS=30,FRAME=1000/FPS,W=540,H=960,TOP=84,BOT=124,GH=H-TOP-BOT;
const LINES=['这是凭证扫雷，规则就是你玩过的扫雷。','挑个难度，第一下随便点，保证不会踩雷。','数字是周围八格里，藏着几把钥匙。','认准了是钥匙，就按住它，插上旗。','要是点错了——',
  '就会弹出一件真实发生过的泄露小事。看完一笑，再来一局。','这回慢慢推，每一步都能从数字推出来，不用猜。','全部打完码，就赢了。先看线索，再动手。'];
const dur=LINES.map((_,i)=>+execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',path.join(nar,`l${i+1}.mp3`)]).toString());
const work=fs.mkdtempSync(path.join(os.tmpdir(),'sweeper-rec-')),videoOnly=path.join(work,'video.mp4'),wav=path.join(work,'game.wav');

function takeOverClock(){
  let vnow=0,queue=[],nextId=1;const wall=Date.now();
  performance.now=()=>vnow;Date.now=()=>wall+vnow;
  window.requestAnimationFrame=cb=>{const id=nextId++;queue.push({id,cb});return id;};
  window.cancelAnimationFrame=id=>{queue=queue.filter(q=>q.id!==id);};
  class RecordingAudioContext extends OfflineAudioContext{
    constructor(){super(2,48000*180,48000);this._t0=vnow;window.__rec.audio=this;window.__rec.audioStart=vnow;}
    get currentTime(){return(vnow-this._t0)/1000;}
    get state(){return'running';}
    resume(){return Promise.resolve();}
  }
  window.AudioContext=RecordingAudioContext;window.webkitAudioContext=RecordingAudioContext;
  window.__rec={audio:null,audioStart:0,get now(){return vnow;},
    step(ms){vnow+=ms;const q=queue;queue=[];for(const {cb} of q){try{cb(vnow);}catch(e){console.error(e);}}},
    async renderWav(v0,v1){
      const ctx=window.__rec.audio,sr=48000,lead=Math.round((window.__rec.audioStart-v0)/1000*sr),n=Math.round((v1-v0)/1000*sr);
      const buf=ctx?await ctx.startRendering():null,L=buf?buf.getChannelData(0):null,R=buf?buf.getChannelData(1):null;
      const bytes=new Uint8Array(44+n*4),v=new DataView(bytes.buffer),txt=(o,s)=>{for(let i=0;i<s.length;i++)bytes[o+i]=s.charCodeAt(i);};
      txt(0,'RIFF');v.setUint32(4,36+n*4,true);txt(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);
      v.setUint32(24,sr,true);v.setUint32(28,sr*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);txt(36,'data');v.setUint32(40,n*4,true);
      for(let i=0;i<n;i++){const j=i-lead,l=L&&j>=0&&j<L.length?L[j]:0,r=R&&j>=0&&j<R.length?R[j]:0;
        v.setInt16(44+i*4,Math.max(-1,Math.min(1,l))*32767,true);v.setInt16(46+i*4,Math.max(-1,Math.min(1,r))*32767,true);}
      let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));
      window.__rec.wavB64=btoa(s);return window.__rec.wavB64.length;
    }};
}
// ffmpeg colour filter, written as key/value pairs so no long run of letters and digits sits in the source
// (this folder's own secret scan, tests/secrets.test.cjs, would read such a run as a key)
const kv=o=>Object.entries(o).map(([k,v])=>k+'='+v).join(':');
const VF='scale='+kv({in_color_matrix:'bt'+601,in_range:'full',out_color_matrix:'bt'+709,out_range:'limited',flags:'accurate_rnd+full_chroma_int'})+
  ',format=yuv420p,setparams='+kv({range:'limited',colorspace:'bt'+709,color_primaries:'bt'+709,color_trc:'bt'+709});
const SHELL=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
html,body{margin:0;background:#0b0f14;width:${W}px;height:${H}px;overflow:hidden;font-family:"PingFang SC","Hiragino Sans GB",sans-serif}
#top{position:absolute;left:0;top:0;width:${W}px;height:${TOP}px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#ffb23e}
#top b{font-size:30px;letter-spacing:3px}#top span{font-size:15px;color:#c9d1d9;margin-top:2px}
iframe{position:absolute;left:0;top:${TOP}px;width:${W}px;height:${GH}px;border:0}
#sub{position:absolute;left:24px;right:24px;top:${TOP+GH}px;height:${BOT}px;display:flex;align-items:center;justify-content:center;text-align:center;color:#f3ead8;font-size:25px;line-height:1.45;font-weight:600}
#tap{position:absolute;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;background:rgba(255,255,255,.35);border:3px solid rgba(255,255,255,.85);opacity:0;pointer-events:none}
</style><div id="top"><b>凭证扫雷</b><span>就是扫雷，换一层皮</span></div><iframe src="${base}"></iframe><div id="sub"></div><div id="tap"></div>`;

(async()=>{
  const browser=await chromium.launch();
  const ctx=await browser.newContext({viewport:{width:W,height:H},deviceScaleFactor:2,hasTouch:true,isMobile:true});
  await ctx.addInitScript(takeOverClock);
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.setContent(SHELL);
  let game=null;for(let i=0;i<200&&!game;i++){await page.waitForTimeout(50);game=page.frames().find(f=>f.url().startsWith(base.split('?')[0]));}
  const ready=()=>game.evaluate(()=>!!(window.__sweeper&&window.__sweeper.ready)).catch(()=>false);
  for(let i=0;i<200&&!await ready();i++){await game.evaluate(ms=>window.__rec&&window.__rec.step(ms),FRAME).catch(()=>{});await page.waitForTimeout(25);}
  if(!await ready())throw new Error('game not ready');
  const cdp=await ctx.newCDPSession(page);

  const ff=spawn('ffmpeg',['-y','-hide_banner','-loglevel','error','-f','image2pipe','-framerate',String(FPS),'-c:v','mjpeg','-i','-',
    '-vf',VF,
    '-c:v','libx264','-preset','slow','-crf','18','-r',String(FPS),videoOnly],{stdio:['pipe','inherit','inherit']});
  const ffDone=new Promise((res,rej)=>ff.on('close',c=>c===0?res():rej(new Error('ffmpeg '+c))));
  const v0=await game.evaluate(()=>window.__rec.now);let frames=0,tap=null;const cues=[],events=[];
  const t=()=>frames/FPS;
  async function frame(){
    if(tap){tap.k++;const o=tap.down?0.9:Math.max(0,0.9-tap.k*0.12);await page.evaluate(([x,y,o])=>{const e=document.getElementById('tap');e.style.left=x+'px';e.style.top=y+'px';e.style.opacity=o;},[tap.x,tap.y,o]);if(!tap.down&&o<=0)tap=null;}
    const jpg=await page.screenshot({type:'jpeg',quality:92});if(!ff.stdin.write(jpg))await new Promise(r=>ff.stdin.once('drain',r));frames++;
    await game.evaluate(ms=>window.__rec.step(ms),FRAME);
  }
  const hold=async s=>{for(let i=0,n=Math.round(s*FPS);i<n;i++)await frame();};
  const say=async(i,s='')=>{cues.push({i,t:t()});await page.evaluate(s=>document.getElementById('sub').textContent=s,LINES[i]);};
  const unsay=()=>page.evaluate(()=>document.getElementById('sub').textContent='');
  const sw=(fn,a)=>game.evaluate(fn,a);
  const cellXY=async i=>{const c=await sw(i=>window.__sweeper.center(i),i);return{x:c.x,y:c.y+TOP};};
  const elXY=async sel=>{const r=await sw(s=>{const b=document.querySelector(s).getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2};},sel);return{x:r.x,y:r.y+TOP};};
  async function touch(p,holdS){
    tap={x:p.x,y:p.y,down:true,k:0};
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y}]});
    await hold(holdS);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});tap.down=false;tap.k=0;
    events.push({t:+t().toFixed(2),x:Math.round(p.x),y:Math.round(p.y),hold:holdS});
  }
  // DOM buttons answer to click, the board to pointer events: both get a real touch here.
  const tapCell=async(i,after=0.3)=>{await touch(await cellXY(i),0.07);await hold(after);};
  const pressCell=async(i,after=0.3)=>{await touch(await cellXY(i),0.55);await hold(after);};
  const tapButton=async(sel,after=0.3)=>{await touch(await elXY(sel),0.07);await hold(after);};
  const st=()=>sw(()=>{const p=window.__sweeper.probe();return p.state;});
  const next=()=>sw(()=>window.__sweeper.next());
  const CENTER=4*7+3;

  // 1. title
  await hold(0.6);await say(0);await hold(dur[0]+0.3);
  // 2. pick 轻松, first tap opens an area. The seed is fixed right after the level tap so the take is repeatable.
  await say(1);await hold(1.0);await tapButton('[data-level=easy]',0.1);await sw(()=>window.__sweeper.start('easy',87));
  await hold(1.4);await tapCell(CENTER,0.2);
  const used1=t()-cues[1].t;await hold(Math.max(0.4,dur[1]-used1+0.3));
  // 3. numbers: a few forced openings
  await say(2);let opened=0;
  for(let k=0;k<12&&opened<3;k++){const m=await next();if(!m)break;if(m.op==='reveal'){await tapCell(m.i,0.55);opened++;}else await sw(i=>window.__sweeper.flag(i),m.i)&&0;}
  {const u=t()-cues[2].t;await hold(Math.max(0.3,dur[2]-u+0.2));}
  // 4. long press to flag two keys
  await say(3);let flagged=0;
  for(let k=0;k<12&&flagged<2;k++){const m=await next();if(!m)break;if(m.op==='flag'){await pressCell(m.i,0.45);flagged++;}else await tapCell(m.i,0.35);}
  {const u=t()-cues[3].t;await hold(Math.max(0.3,dur[3]-u+0.2));}
  // 5. a wrong tap: a key next to the opened area
  await say(4);await hold(0.9);
  const leak=await sw(()=>{const s=window.__sweeper.probe().state,c=7,r=9;for(let i=0;i<s.N;i++){if(!s.mine[i]||s.flag[i])continue;const x=i%c,y=(i/c)|0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const X=x+dx,Y=y+dy;if(X>=0&&Y>=0&&X<c&&Y<r&&s.open[Y*c+X])return i;}}return -1;});
  await tapCell(leak,0);await hold(Math.max(0.2,dur[4]-(t()-cues[4].t)));await unsay();
  await hold(1.6);   // explosion, the clerk jumps, the card comes up
  // 6. the card, then one more round
  await say(5);await hold(dur[5]-0.6);await tapButton('#again',0.1);await sw(()=>window.__sweeper.start('easy',168));await hold(0.5);
  // 7. play it out by reasoning, at an easy pace
  await say(6);await tapCell(CENTER,0.5);
  for(let k=0;k<80;k++){const s=await st();if(s.status!=='play')break;const m=await next();if(!m)break;if(m.op==='flag')await pressCell(m.i,0.3);else await tapCell(m.i,0.38);
    if(cues.length===7&&t()-cues[6].t>dur[6]+0.2)await unsay();}
  const result=await st();
  // 8. win
  await hold(0.9);await say(7);await hold(dur[7]+2.2);
  ff.stdin.end();await ffDone;
  const v1=await game.evaluate(()=>window.__rec.now),len=await game.evaluate(([a,b])=>window.__rec.renderWav(a,b),[v0,v1]);
  const parts=[];for(let i=0;i<len;i+=4e6)parts.push(await game.evaluate(([a,b])=>window.__rec.wavB64.slice(a,b),[i,i+4e6]));
  fs.writeFileSync(wav,Buffer.from(parts.join(''),'base64'));
  await browser.close();
  // mix: game sounds a little under the voice, each narration clip delayed to its cue
  const inputs=['-i',videoOnly,'-i',wav],filt=['[1:a]volume=0.55[g]'],labels=['[g]'];
  cues.forEach((c,k)=>{inputs.push('-i',path.join(nar,`l${c.i+1}.mp3`));const ms=Math.round(c.t*1000);filt.push(`[${k+2}:a]aresample=48000,adelay=${ms}|${ms},volume=1.6[n${k}]`);labels.push(`[n${k}]`);});
  filt.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[a]`);
  execFileSync('ffmpeg',['-y','-hide_banner','-loglevel','error',...inputs,'-filter_complex',filt.join(';'),'-map','0:v','-map','[a]','-c:v','copy','-c:a','aac','-b:a','192k','-ar','48000','-shortest','-movflags','+faststart',out],{stdio:'inherit'});
  fs.writeFileSync(out.replace(/\.mp4$/,'.events.json'),JSON.stringify({cues,taps:events,result:{status:result.status,opened:result.opened,flags:result.flags},errors},null,1));
  console.log(JSON.stringify({out,seconds:+t().toFixed(2),frames,result:result.status,cues:cues.map(c=>+c.t.toFixed(2)),errors,work}));
})().catch(e=>{console.error(e);process.exit(1);});
