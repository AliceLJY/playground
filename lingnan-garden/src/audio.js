// 园子里的声音，全部现场合成：池水、鸟叫、偶尔一声檐下风铃。
export function createAudio() {
  let ctx = null, master = null, muted = false, next = 0, chime = 3;
  const A = {
    muted: false,
    start() {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ctx.destination);
      const len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0); let b = 0;
      for (let i = 0; i < len; i++) { b = b * 0.97 + (Math.random() * 2 - 1) * 0.03; d[i] = b * 6; }
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.6;
      A.waterGain = ctx.createGain(); A.waterGain.gain.value = 0.05; src.connect(f); f.connect(A.waterGain); A.waterGain.connect(master); src.start();
    },
    setMuted(m) { muted = A.muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.5, ctx.currentTime, 0.05); },
    bird() {
      const t0 = ctx.currentTime, base = 2400 + Math.random() * 1800, n = 2 + (Math.random() * 4 | 0), pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null; if (pan) { pan.pan.value = Math.random() * 2 - 1; pan.connect(master); }
      for (let i = 0; i < n; i++) { const o = ctx.createOscillator(), g = ctx.createGain(), t = t0 + i * (0.09 + Math.random() * 0.05); o.type = 'sine'; o.frequency.setValueAtTime(base * (1 + Math.random() * 0.2), t); o.frequency.exponentialRampToValueAtTime(base * (0.75 + Math.random() * 0.5), t + 0.07); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.08); o.connect(g); g.connect(pan || master); o.start(t); o.stop(t + 0.1); }
    },
    ring() { const t = ctx.currentTime; for (const [f, v] of [[1568, 0.03], [2093, 0.02], [3136, 0.01]]) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f * (1 + (Math.random() - 0.5) * 0.01); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0004, t + 2.2); o.connect(g); g.connect(master); o.start(t); o.stop(t + 2.3); } },
    update(dt, nearWater) {
      if (!ctx || ctx.state !== 'running') return;
      A.waterGain.gain.setTargetAtTime(0.03 + 0.09 * nearWater, ctx.currentTime, 0.4);
      next -= dt; if (next <= 0) { A.bird(); next = 0.8 + Math.random() * 3.5; }
      chime -= dt; if (chime <= 0) { A.ring(); chime = 9 + Math.random() * 14; }
    },
  };
  return A;
}
