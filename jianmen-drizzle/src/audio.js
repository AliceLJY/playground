// 细雨剑门 sounds, all synthesised: drizzle (filtered noise), a plucked string per found line, a donkey bell at the end.
let ctx = null, master = null, rainGain = null, muted = false;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9; master.connect(ctx.destination);
  // Drizzle: two seconds of noise, looped, band-limited, with a slow swell.
  const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  let b = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.6 + b * 2.2; }
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4200;
  rainGain = ctx.createGain(); rainGain.gain.value = 0;
  const lfo = ctx.createOscillator(), lfoGain = ctx.createGain(); lfo.frequency.value = 0.07; lfoGain.gain.value = 0.012;
  lfo.connect(lfoGain).connect(rainGain.gain); lfo.start();
  src.connect(hp).connect(lp).connect(rainGain).connect(master); src.start();
  rainGain.gain.setTargetAtTime(0.045, ctx.currentTime, 2.5);
}

export function setRain(level) { if (ctx && rainGain) rainGain.gain.setTargetAtTime(0.045 * level, ctx.currentTime, 1.5); }

export function setMuted(m) { muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.1); }
export const isMuted = () => muted;

// Karplus-Strong pluck, a soft guqin-like note.
const NOTES = [293.66, 329.63, 392.0, 440.0]; // D E G A, one per line of the poem
export function pluck(line) {
  if (!ctx) return;
  const f = NOTES[line % NOTES.length], sr = ctx.sampleRate, dur = 3.2, n = Math.floor(sr * dur);
  const buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0), P = Math.round(sr / f), ring = new Float32Array(P);
  for (let i = 0; i < P; i++) ring[i] = (Math.random() * 2 - 1) * 0.6;
  let k = 0, prev = 0;
  for (let i = 0; i < n; i++) { const v = ring[k]; const nv = 0.4985 * (v + prev); prev = v; ring[k] = nv; d[i] = v; k = (k + 1) % P; }
  const s = ctx.createBufferSource(); s.buffer = buf;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
  const g = ctx.createGain(); g.gain.value = 0.32;
  s.connect(lp).connect(g).connect(master); s.start();
}

// A small bell shaken a few times: inharmonic partials with fast decay.
export function bell() {
  if (!ctx) return;
  const t0 = ctx.currentTime + 0.05;
  for (let hit = 0; hit < 4; hit++) {
    const t = t0 + hit * (0.32 + Math.random() * 0.12), base = 1180 + Math.random() * 40;
    for (const [mul, amp, dec] of [[1, 0.09, 0.9], [2.71, 0.05, 0.5], [5.2, 0.025, 0.25]]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = base * mul; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp * (1 - hit * 0.15), t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      o.connect(g).connect(master); o.start(t); o.stop(t + dec + 0.05);
    }
  }
}
