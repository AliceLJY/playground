// 碎碎平安 · every sound is synthesised on the spot (Web Audio), no audio files.
// Each play varies pitch by about ±6% so repeated breaks never sound like a machine gun.

export class Sound {
  constructor() { this.ac = null; this.muted = false; this.live = 0; this.noiseBuf = null; }

  // Browsers only start audio inside a user gesture: call this from the first pointerdown.
  unlock() {
    if (!this.ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ac = new AC(); } catch { return; }
      const comp = this.ac.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 6;
      this.out = this.ac.createGain(); this.out.gain.value = 0.8;
      this.out.connect(comp); comp.connect(this.ac.destination);
      const len = this.ac.sampleRate;
      this.noiseBuf = this.ac.createBuffer(1, len, this.ac.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ac.state === 'suspended') this.ac.resume();
  }

  get ready() { return !!this.ac && !this.muted && this.ac.state === 'running'; }

  env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }

  noise(t, dur, type, freq, q, peak, attack = 0.004, sweepTo) {
    const s = this.ac.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = this.ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = this.ac.createGain(); this.env(g, t, attack, peak, dur);
    s.connect(f); f.connect(g); g.connect(this.out);
    s.start(t, Math.random() * 0.5); s.stop(t + attack + dur + 0.05);
  }

  tone(t, freq, dur, peak, type = 'sine', glideTo, attack = 0.003) {
    const o = this.ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    const g = this.ac.createGain(); this.env(g, t, attack, peak, dur);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + attack + dur + 0.05);
  }

  play(kind, level = 1) {
    if (!this.ready || this.live > 10) return;
    this.live++; setTimeout(() => this.live--, 700);
    const t = this.ac.currentTime + 0.005, p = 1 + (Math.random() * 0.12 - 0.06), v = level, R = Math.random;
    switch (kind) {
      case 'porcelain':
        this.noise(t, 0.16, 'bandpass', 3200 * p, 0.9, 0.55 * v);
        this.tone(t, 150 * p, 0.12, 0.35 * v, 'sine', 70);
        for (let i = 0; i < 6; i++) this.tone(t + R() * 0.22, (2300 + R() * 3200) * p, 0.06 + R() * 0.2, 0.08 * v);
        break;
      case 'glass':
        this.noise(t, 0.12, 'highpass', 4500 * p, 0.7, 0.45 * v);
        for (let i = 0; i < 10; i++) this.tone(t + R() * 0.3, (3200 + R() * 4200) * p, 0.15 + R() * 0.35, 0.06 * v);
        break;
      case 'crumble':
        this.noise(t, 0.75, 'lowpass', 900 * p, 0.6, 0.45 * v, 0.02);
        for (let i = 0; i < 14; i++) this.noise(t + R() * 0.6, 0.02, 'bandpass', (1200 + R() * 1500) * p, 2, 0.12 * v);
        break;
      case 'burn':
        this.noise(t, 0.9, 'bandpass', 1100 * p, 0.8, 0.22 * v, 0.12, 2400);
        for (let i = 0; i < 18; i++) this.noise(t + R() * 0.9, 0.012, 'highpass', 2500, 1, (0.1 + R() * 0.15) * v);
        break;
      case 'whoosh':
        this.noise(t, 0.55, 'bandpass', 380 * p, 1.4, 0.35 * v, 0.08, 1700);
        break;
      case 'melt':
        this.tone(t, 560 * p, 0.5, 0.18 * v, 'sine', 170);
        this.tone(t + 0.32, 900 * p, 0.12, 0.12 * v, 'sine', 380);
        this.tone(t + 0.55, 760 * p, 0.12, 0.1 * v, 'sine', 320);
        break;
      case 'pop':
        this.noise(t, 0.06, 'highpass', 700 * p, 0.7, 0.9 * v, 0.001);
        this.tone(t, 110 * p, 0.09, 0.5 * v, 'sine', 45, 0.001);
        break;
      case 'swirl':
        this.noise(t, 0.85, 'bandpass', 280 * p, 4, 0.4 * v, 0.1, 2600);
        this.tone(t, 220 * p, 0.8, 0.06 * v, 'triangle', 660);
        break;
      case 'chip':
        [880, 660, 440, 330, 220].forEach((f, i) => this.tone(t + i * 0.055, f * p, 0.06, 0.1 * v, 'square'));
        break;
      case 'appear':
        this.tone(t, 1250 * p, 0.05, 0.035 * v);
        break;
    }
  }

  // Rising hum while a hold heats up; set(c) with c in 0..1, stop() when it bursts or is let go.
  charge() {
    if (!this.ready) return { set() {}, stop() {} };
    const t = this.ac.currentTime, o = this.ac.createOscillator(), f = this.ac.createBiquadFilter(), g = this.ac.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(110, t);
    f.type = 'lowpass'; f.frequency.setValueAtTime(500, t); f.Q.value = 6;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.15);
    o.connect(f); f.connect(g); g.connect(this.out); o.start(t);
    let done = false;
    return {
      set: (c) => { if (done) return; const n = this.ac.currentTime; o.frequency.setTargetAtTime(110 + c * c * 520, n, 0.03); f.frequency.setTargetAtTime(500 + c * 2600, n, 0.03); },
      stop: () => { if (done) return; done = true; const n = this.ac.currentTime; g.gain.cancelScheduledValues(n); g.gain.setTargetAtTime(0.0001, n, 0.03); o.stop(n + 0.2); },
    };
  }
}
