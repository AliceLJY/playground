// 骑楼雨夜 · 声音全部用 Web Audio 现合成：雨、喷雾、凉拖、爬动、扑翅、冲撞、盖井盖。没有音频文件。
import { rng } from './core.js';

export function createAudio() {
  let ctx = null, master = null, noiseBuf = null, sprayG = null, skitG = null, buzzG = null, vol = 0.7;
  const r = rng(404), vary = () => 1 + (r() - 0.5) * 0.12;
  function start() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = vol; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
    const loop = (type, freq, q, gain) => {
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = gain; s.connect(f).connect(g).connect(master); s.start();
      return g;
    };
    loop('lowpass', 900, 0.3, 0.16); loop('bandpass', 5200, 0.7, 0.05);
    sprayG = loop('bandpass', 3400, 1.1, 0); skitG = loop('bandpass', 7800, 6, 0);
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 96;
    const lf = ctx.createOscillator(); lf.frequency.value = 31; const lg = ctx.createGain(); lg.gain.value = 40; lf.connect(lg).connect(o.frequency);
    buzzG = ctx.createGain(); buzzG.gain.value = 0; const bf = ctx.createBiquadFilter(); bf.type = 'lowpass'; bf.frequency.value = 900;
    o.connect(bf).connect(buzzG).connect(master); o.start(); lf.start();
  }
  function noise(dur, type, freq, gain, q = 1, slide = 0) {
    if (!ctx) return;
    const t = ctx.currentTime, s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = vary();
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f).connect(g).connect(master); s.start(t, r() * 1.5, dur + 0.05);
  }
  function tone(freq, dur, type, gain, slide = 1, delay = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + delay, o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq * vary(), t);
    if (slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  const fx = {
    slap() { noise(0.12, 'bandpass', 1400, 0.25, 0.8, 0.5); },
    slapHit() { noise(0.16, 'lowpass', 2600, 0.9, 0.6, 0.2); tone(150, 0.16, 'sine', 0.6, 0.4); },
    kill() { noise(0.22, 'lowpass', 1200, 0.5, 0.8, 0.3); tone(520, 0.09, 'square', 0.07, 0.4); },
    hurt() { tone(90, 0.3, 'sawtooth', 0.4, 0.5); noise(0.2, 'lowpass', 700, 0.5); },
    telegraph(kind) { if (kind === 'charger') { tone(60, 0.9, 'sawtooth', 0.35, 1.8); noise(0.9, 'bandpass', 500, 0.3, 2, 2.4); } else if (kind === 'flyer') tone(180, 0.6, 'sawtooth', 0.14, 2.2); else tone(1900, 0.1, 'square', 0.05, 1.5); },
    charge() { noise(0.9, 'lowpass', 500, 0.6, 0.7, 0.6); },
    stun() { tone(220, 0.5, 'triangle', 0.5, 0.5); noise(0.35, 'bandpass', 2200, 0.7, 3, 0.4); tone(70, 0.4, 'sine', 0.7, 0.5); },
    reload() { noise(0.08, 'highpass', 3000, 0.3); tone(300, 0.06, 'square', 0.1, 0.7, 0.25); tone(620, 0.06, 'square', 0.1, 1, 1.05); },
    empty() { tone(220, 0.08, 'square', 0.08); },
    pickup() { tone(660, 0.09, 'triangle', 0.22); tone(990, 0.14, 'triangle', 0.22, 1, 0.08); },
    seal() { tone(110, 0.6, 'triangle', 0.7, 0.6); noise(0.3, 'bandpass', 1800, 0.8, 4, 0.5); tone(523, 0.2, 'triangle', 0.2, 1, 0.25); tone(784, 0.4, 'triangle', 0.2, 1, 0.42); },
    tick() { noise(0.04, 'bandpass', 900, 0.25, 6); },
    radio() { tone(880, 0.05, 'square', 0.06); tone(1320, 0.07, 'square', 0.06, 1, 0.07); },
    nest() { noise(0.6, 'bandpass', 6000, 0.3, 3, 0.5); tone(70, 0.5, 'sine', 0.4, 0.7); },
    win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.5, 'triangle', 0.22, 1, i * 0.14)); },
    dead() { tone(196, 1.2, 'sawtooth', 0.3, 0.3); },
    jump() { noise(0.07, 'lowpass', 500, 0.12); },
    land() { noise(0.1, 'lowpass', 300, 0.3); },
  };
  return {
    start, play(name, a) { if (ctx && fx[name]) fx[name](a); },
    setVolume(v) { vol = v; if (master) master.gain.value = v; },
    suspend() { if (ctx) ctx.suspend(); }, resume() { if (ctx) ctx.resume(); },
    // 持续声按当前状态调音量：喷雾、近处爬动、扑翅
    mix(firing, crawl, buzz) {
      if (!ctx) return;
      const t = ctx.currentTime;
      sprayG.gain.setTargetAtTime(firing ? 0.5 : 0, t, 0.03); skitG.gain.setTargetAtTime(Math.min(0.22, crawl * 0.07), t, 0.08); buzzG.gain.setTargetAtTime(Math.min(0.16, buzz * 0.1), t, 0.08);
    },
    get on() { return !!ctx; },
  };
}
