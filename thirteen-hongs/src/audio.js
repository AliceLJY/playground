// 声音：全部用 Web Audio 现场合成，没有任何音频文件。叫卖是按粤语声调走向做的拟声，不是真人说话。
const VOWEL = { a: [800, 1250], o: [520, 900], e: [480, 1850], i: [310, 2300], u: [360, 720] };
// 声调（相对基频）：1 高平 2 高升 3 中平 4 低降 5 低升 6 低平
const TONE = { 1: [1.5, 1.5], 2: [1.02, 1.46], 3: [1.26, 1.26], 4: [0.96, 0.8], 5: [0.9, 1.14], 6: [1, 1] };
const CALLS = [
  [['e', 3, 0.26], ['a', 4, 0.75]],                                  // 靓茶
  [['a', 6, 0.22], ['a', 1, 0.24], ['o', 2, 0.8]],                    // 卖生果
  [['e', 5, 0.22], ['a', 2, 0.24], ['u', 1, 0.6]],                    // 艇仔粥
  [['a', 5, 0.2], ['e', 3, 0.2], ['i', 4, 0.22], ['e', 3, 0.7]],      // 有靓瓷器
  [['a', 4, 0.24], ['i', 3, 0.7]],                                    // 葵扇
];

export function createAudio() {
  let ctx = null, master, noise, water, crowd, muted = false, nextCall = 4, nextCreak = 3, nextBell = 40, lastStage = '', lastLoaded = 0, stepAcc = 0;
  const L = { x: 0, z: 0, yaw: 0 };
  function start() {
    if (ctx) { ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = noise.getChannelData(0); let b = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = b * 0.97 + w * 0.03; d[i] = w * 0.5 + b * 6; }
    water = loop(520, 'lowpass', 0.5); crowd = loop(620, 'bandpass', 0.7);
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.27; lg.gain.value = 0.05; lfo.connect(lg); lg.connect(water.g.gain); lfo.start();
  }
  function loop(freq, type, q) {
    const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(master); s.start();
    return { s, f, g };
  }
  function spot(x, z, ref = 16) {
    const dx = x - L.x, dz = z - L.z, d = Math.hypot(dx, dz);
    const g = ctx.createGain(); g.gain.value = Math.min(1, ref / (ref + d * d / ref));
    const rx = dx * Math.cos(L.yaw) - dz * Math.sin(L.yaw);
    let out = g;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-0.9, Math.min(0.9, rx / (d + 8))); g.connect(p); out = p; }
    out.connect(master);
    return g;
  }
  function call(x, z, phrase, base) {
    const out = spot(x, z, 22); let t = ctx.currentTime + 0.05;
    for (const [v, tone, dur] of phrase) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      const [f0, f1] = TONE[tone]; o.frequency.setValueAtTime(base * f0, t); o.frequency.linearRampToValueAtTime(base * f1, t + dur * 0.8);
      const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 5.5; vg.gain.value = dur > 0.5 ? base * 0.02 : 0; vib.connect(vg); vg.connect(o.frequency); vib.start(t); vib.stop(t + dur + 0.1);
      const env = ctx.createGain(); env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(0.5, t + 0.04); env.gain.setValueAtTime(0.5, t + dur * 0.7); env.gain.linearRampToValueAtTime(0, t + dur);
      for (const [k, fq] of VOWEL[v].entries()) { const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = fq; f.Q.value = 7; const g = ctx.createGain(); g.gain.value = k ? 0.5 : 1; o.connect(f); f.connect(g); g.connect(env); }
      env.connect(out); o.start(t); o.stop(t + dur + 0.05); t += dur + 0.03;
    }
  }
  function burst(x, z, { freq = 900, q = 1, dur = 0.2, gain = 0.5, type = 'bandpass', ref = 14 } = {}) {
    const s = ctx.createBufferSource(); s.buffer = noise; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const e = ctx.createGain(), t = ctx.currentTime; e.gain.setValueAtTime(gain, t); e.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(e); e.connect(spot(x, z, ref)); s.start(t, Math.random() * 2, dur + 0.05);
  }
  function creak(x, z) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; const t = ctx.currentTime, f0 = 90 + Math.random() * 60;
    o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * (1.2 + Math.random() * 0.5), t + 0.5);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 9;
    const e = ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(0.25, t + 0.1); e.gain.linearRampToValueAtTime(0, t + 0.55);
    o.connect(f); f.connect(e); e.connect(spot(x, z, 12)); o.start(t); o.stop(t + 0.6);
  }
  function metal(x, z, base, dur, gain, ref) {
    const out = spot(x, z, ref), t = ctx.currentTime;
    for (const [m, a] of [[1, 1], [1.48, 0.6], [2.03, 0.45], [2.71, 0.3], [3.4, 0.16]]) {
      const o = ctx.createOscillator(); o.frequency.setValueAtTime(base * m * 1.04, t); o.frequency.exponentialRampToValueAtTime(base * m, t + 0.3);
      const e = ctx.createGain(); e.gain.setValueAtTime(gain * a, t); e.gain.exponentialRampToValueAtTime(0.001, t + dur / m ** 0.5);
      o.connect(e); e.connect(out); o.start(t); o.stop(t + dur);
    }
  }
  return {
    start, get on() { return !!ctx; },
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.8; }, get muted() { return muted; },
    update(dt, sim, cam, walkSpeed) {
      if (!ctx || ctx.state !== 'running') return;
      L.x = cam.x; L.z = cam.z; L.yaw = cam.yaw;
      const high = Math.min(1, Math.max(0, (cam.y - 3) / 120));
      const nearRiver = Math.max(0, 1 - Math.abs(cam.z - 8) / 90), nearSquare = Math.max(0, 1 - Math.hypot(cam.x * 0.25, cam.z + 30) / 70);
      water.g.gain.value += ((0.05 + 0.2 * nearRiver) * (1 - high * 0.6) - water.g.gain.value) * 0.05;
      crowd.g.gain.value += ((0.02 + 0.13 * nearSquare) * (1 - high * 0.5) - crowd.g.gain.value) * 0.05;
      const dts = dt;
      if ((nextCall -= dts) < 0) { nextCall = 3.5 + Math.random() * 6; const hs = sim.agents.filter(a => a.kind === 'hawker' && a.boat < 0); const h = hs[Math.floor(Math.random() * hs.length)]; call(h.x, h.z, CALLS[Math.floor(Math.random() * CALLS.length)], 150 + Math.random() * 90); }
      if ((nextCreak -= dts) < 0) { nextCreak = 2 + Math.random() * 4; const b = sim.boats[1 + Math.floor(Math.random() * (sim.boats.length - 1))]; if (Math.random() < 0.5) creak(b.x, b.z); else burst(b.x, b.z, { freq: 1400, q: 0.8, dur: 0.35, gain: 0.35 }); }
      if ((nextBell -= dts) < 0) { nextBell = 50 + Math.random() * 40; metal(-70, 372, 196, 6, 0.25, 160); }
      const e = sim.event;
      if (e.stage !== lastStage) { if (e.stage === 'depart') metal(sim.boats[0].x, sim.boats[0].z, 310, 3.2, 0.4, 40); if (e.stage === 'inspect') creak(45, 16); lastStage = e.stage; }
      if (e.loaded !== lastLoaded) { if (e.loaded > lastLoaded) burst(40, 15, { freq: 180, q: 1.2, dur: 0.22, gain: 1.4, type: 'lowpass', ref: 20 }); lastLoaded = e.loaded; }
      if (walkSpeed > 0.3) { stepAcc += walkSpeed * dt; if (stepAcc > 0.75) { stepAcc = 0; burst(cam.x, cam.z, { freq: 260, q: 1.5, dur: 0.07, gain: 0.5, type: 'lowpass' }); } }
    },
  };
}
