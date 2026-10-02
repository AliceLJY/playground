/* Synthesised sound for 灯影守夜: gong, wooden clapper, drums, blades and lamp. WebAudio only, no samples.
   Every call is a no-op until a user gesture has created the audio context. */
(function(root){
'use strict';
function createAudio(){
  let ctx=null,master=null,muted=false,noiseBuf=null,hum=null;
  function init(){
    if(ctx)return ctx;const AC=root.AudioContext||root.webkitAudioContext;if(!AC)return null;
    ctx=new AC();const comp=ctx.createDynamicsCompressor();comp.threshold.value=-14;comp.ratio.value=4;
    master=ctx.createGain();master.gain.value=muted?0:.85;master.connect(comp);comp.connect(ctx.destination);
    noiseBuf=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);const d=noiseBuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
    return ctx;
  }
  function env(g,t,attack,peak,decay){g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0002,peak),t+attack);g.gain.exponentialRampToValueAtTime(.0001,t+attack+decay);}
  function tone(type,f0,t,{attack=.003,peak=.3,decay=.3,f1=null,glide=.05,out=master,detune=0}={}){
    const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.detune.value=detune;o.frequency.setValueAtTime(f0,t);
    if(f1)o.frequency.exponentialRampToValueAtTime(f1,t+glide);env(g,t,attack,peak,decay);o.connect(g);g.connect(out);o.start(t);o.stop(t+attack+decay+.05);
  }
  function hiss(t,{attack=.002,peak=.2,decay=.2,type='bandpass',f=2000,q=1,f1=null,glide=.2,offset=0}={}){
    const s=ctx.createBufferSource(),fl=ctx.createBiquadFilter(),g=ctx.createGain();s.buffer=noiseBuf;fl.type=type;fl.frequency.setValueAtTime(f,t);fl.Q.value=q;
    if(f1)fl.frequency.exponentialRampToValueAtTime(f1,t+glide);env(g,t,attack,peak,decay);s.connect(fl);fl.connect(g);g.connect(master);s.start(t,offset);s.stop(t+attack+decay+.05);
  }
  const partials=[1,1.47,2.09,2.56,3.17,4.1];
  const S={
    // perfect parry: a bright small gong with a short upward glide, plus a cymbal shimmer
    gong(t){partials.forEach((r,i)=>tone('sine',520*r*.93,t,{f1:520*r,glide:.07,peak:.24/(1+i*.55),decay:1.5/(1+i*.3)}));hiss(t,{type:'highpass',f:4200,q:.7,peak:.22,decay:.4});tone('triangle',2600,t,{peak:.08,decay:.12});},
    gongBig(t){partials.forEach((r,i)=>tone('sine',300*r*1.04,t,{f1:300*r,glide:.25,peak:.3/(1+i*.5),decay:2.4/(1+i*.25)}));hiss(t,{type:'bandpass',f:6200,q:.6,peak:.3,decay:1.1});tone('sine',80,t,{f1:52,glide:.3,peak:.35,decay:.5});},
    // plain block: a wooden drum thud
    thud(t){tone('sine',190,t,{f1:92,glide:.12,peak:.55,decay:.2});hiss(t,{type:'lowpass',f:900,peak:.18,decay:.06});},
    // blockable telegraph: the wooden clapper of the band
    clap(t){tone('sine',1650,t,{peak:.2,decay:.05});hiss(t,{type:'bandpass',f:2300,q:5,peak:.3,decay:.045});},
    // red telegraph: two low drum strokes and a rising edge
    drum(t){for(const d of [0,.12]){tone('sine',120,t+d,{f1:70,glide:.15,peak:.5,decay:.22});hiss(t+d,{type:'lowpass',f:400,peak:.15,decay:.08});}tone('sawtooth',180,t,{f1:420,glide:.4,peak:.05,decay:.45});},
    slap(t){hiss(t,{type:'bandpass',f:1300,q:1.2,peak:.32,decay:.07});tone('sine',320,t,{f1:150,glide:.06,peak:.25,decay:.07});},
    slapBig(t){S.slap(t);tone('sine',620,t,{f1:240,glide:.1,peak:.25,decay:.12});hiss(t,{type:'highpass',f:3000,peak:.12,decay:.1});},
    clang(t){tone('square',880,t,{peak:.06,decay:.12});tone('square',1330,t,{peak:.05,decay:.1});hiss(t,{type:'highpass',f:3600,peak:.14,decay:.08});},
    hurt(t){tone('sine',120,t,{f1:48,glide:.2,peak:.6,decay:.28});hiss(t,{type:'lowpass',f:700,peak:.25,decay:.2});for(let i=0;i<4;i++)hiss(t+.05+i*.04+Math.random()*.03,{type:'bandpass',f:2500,q:3,peak:.08,decay:.02});},
    whoosh(t){hiss(t,{type:'bandpass',f:500,f1:2600,glide:.18,q:1.4,peak:.16,decay:.2});},
    swing(t){hiss(t,{type:'bandpass',f:900,f1:2200,glide:.1,q:1.8,peak:.09,decay:.1});},
    snip(t){hiss(t,{type:'highpass',f:5200,peak:.2,decay:.03});tone('sine',2900,t,{peak:.08,decay:.09});},
    flutter(t){for(let i=0;i<5;i++)hiss(t+i*.045,{type:'bandpass',f:700,q:2,peak:.07,decay:.03});},
    squeak(t){tone('sine',2100,t,{f1:3400,glide:.12,peak:.09,decay:.16});},
    ding(t){tone('sine',1760,t,{peak:.1,decay:.3});tone('sine',2640,t,{peak:.05,decay:.2});},
    roar(t){tone('sawtooth',150,t,{f1:85,glide:.6,peak:.18,decay:.7});hiss(t,{type:'lowpass',f:600,peak:.2,decay:.6});},
    ui(t){tone('sine',1200,t,{peak:.08,decay:.05});},
    // 开锣: an accelerating drum roll that lands on the gong
    open(t){let d=0,gap=.17;for(let i=0;i<10;i++){tone('sine',150,t+d,{f1:95,glide:.08,peak:.25+i*.02,decay:.1});d+=gap;gap*=.84;}S.gongBig(t+d+.05);},
    win(t){S.gongBig(t);[.5,.75,1.0].forEach((d,i)=>S.gong(t+d+i*.02));},
    lose(t){tone('sine',330,t,{f1:110,glide:1.2,peak:.18,decay:1.3});hiss(t,{type:'lowpass',f:1200,f1:200,glide:1,peak:.12,decay:1.1});}
  };
  function play(name){if(!ctx||muted||!S[name])return;try{S[name](ctx.currentTime+.004);}catch(e){/* audio is best effort */}}
  function ambience(on){
    if(!ctx)return;
    if(on&&!hum){const g=ctx.createGain();g.gain.value=.018;g.connect(master);const a=ctx.createOscillator(),b=ctx.createOscillator();a.frequency.value=55;b.frequency.value=82.6;a.connect(g);b.connect(g);a.start();b.start();hum={g,a,b};}
    else if(!on&&hum){hum.a.stop();hum.b.stop();hum.g.disconnect();hum=null;}
  }
  return{init,play,ambience,resume(){if(ctx&&ctx.state==='suspended')ctx.resume();},
    setMuted(m){muted=m;if(master)master.gain.value=m?0:.85;},get muted(){return muted;},get ready(){return!!ctx;}};
}
root.GongAudio={createAudio};
})(typeof globalThis!=='undefined'?globalThis:this);
