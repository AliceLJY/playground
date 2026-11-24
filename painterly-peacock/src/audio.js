// Small synthesized sounds (Web Audio, nothing loaded). Muted until the sound button is pressed; the
// AudioContext is only created on that press, so a muted page never starts audio.
export function createAudio() {
  let ctx = null, master = null, on = false, noiseBuf = null, seed = 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const vary = (x, k = 0.06) => x * (1 + (rnd() * 2 - 1) * k);
  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1;
    return true;
  }
  const env = (g, t, a, peak, r) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + r); };
  function noise({ dur = 0.2, f0 = 1200, f1 = 1200, q = 0.8, type = 'bandpass', peak = 0.2, attack = 0.01 }) {
    const t = ctx.currentTime, src = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf; src.loop = true; flt.type = type; flt.Q.value = q;
    flt.frequency.setValueAtTime(vary(f0), t); flt.frequency.exponentialRampToValueAtTime(vary(f1), t + dur);
    env(g, t, attack, peak, dur); src.connect(flt).connect(g).connect(master); src.start(t, rnd() * 0.5); src.stop(t + attack + dur + 0.05);
  }
  function tone({ f0 = 440, f1 = f0, dur = 0.15, type = 'sine', peak = 0.15, attack = 0.005, at = 0 }) {
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(vary(f0, 0.04), t); o.frequency.exponentialRampToValueAtTime(vary(f1, 0.04), t + dur);
    env(g, t, attack, peak, dur); o.connect(g).connect(master); o.start(t); o.stop(t + attack + dur + 0.05);
  }
  const SOUNDS = {
    step: () => noise({ dur: 0.05, f0: 900, f1: 500, q: 1.2, peak: 0.05 }),
    fanOpen: () => { noise({ dur: 0.9, f0: 500, f1: 3200, q: 0.6, peak: 0.12, attack: 0.25 }); tone({ f0: 330, f1: 495, dur: 0.6, type: 'triangle', peak: 0.025, attack: 0.2 }); },
    fanClose: () => noise({ dur: 0.7, f0: 2600, f1: 450, q: 0.6, peak: 0.09, attack: 0.15 }),
    jump: () => noise({ dur: 0.18, f0: 700, f1: 1800, q: 0.7, peak: 0.07 }),
    land: () => { tone({ f0: 120, f1: 60, dur: 0.18, peak: 0.2 }); noise({ dur: 0.12, f0: 600, f1: 300, q: 0.9, peak: 0.08 }); },
    peck: (e) => { tone({ f0: e.strong ? 1500 : 1900, f1: 900, dur: 0.05, type: 'square', peak: e.strong ? 0.05 : 0.03 }); noise({ dur: 0.04, f0: 3000, f1: 2000, q: 2, peak: 0.05 }); },
    pluck: () => { tone({ f0: 880, f1: 1320, dur: 0.12, type: 'triangle', peak: 0.04 }); noise({ dur: 1.2, f0: 1800, f1: 700, q: 1.4, peak: 0.03, attack: 0.1 }); },
    grip: () => tone({ f0: 1400, f1: 1100, dur: 0.05, type: 'square', peak: 0.025 }),
    return: () => { tone({ f0: 660, dur: 0.35, type: 'triangle', peak: 0.05 }); tone({ f0: 990, dur: 0.5, type: 'triangle', peak: 0.04, at: 0.09 }); },
  };
  return {
    get on() { return on; },
    async toggle() {
      if (!on && !ensure()) return false;
      on = !on;
      if (ctx) { if (on && ctx.state === 'suspended') await ctx.resume(); master.gain.setTargetAtTime(on ? 0.5 : 0, ctx.currentTime, 0.03); }
      return on;
    },
    play(events) {
      if (!on || !ctx) return;
      let steps = 0;
      for (const e of events) {
        if (e.type === 'step' && ++steps > 1) continue; // two feet in one frame make one tap
        const s = SOUNDS[e.type]; if (s) s(e);
      }
    },
    setSeed(n) { seed = (Math.abs(n | 0) % 2147483646) + 1; },
  };
}
