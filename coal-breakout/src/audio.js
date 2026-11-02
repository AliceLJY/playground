(function (root) {
  'use strict';
  // Original 8-bit loop, notes and rests in plain text; no samples or fetched assets.
  const SCORE = 'E4 . G4 B4 D5 . B4 G4 E4 . A4 B4 G4 . D4 . C4 . E4 G4 B4 . G4 E4 D4 . A4 F4 E4 . . .';
  function create() {
    let ctx, master, enabled = false, lastBeat = -1, lastCue = -1;
    const notes = SCORE.split(' ');
    function note(name) { if (name === '.') return 0; const semi = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 }; return 440 * 2 ** ((semi[name[0]] + (Number(name[1]) - 4) * 12) / 12); }
    function tone(hz, length = .08, gain = .045, type = 'square', delay = 0) {
      if (!enabled || !hz) return;
      const o = ctx.createOscillator(), v = ctx.createGain(), t = ctx.currentTime + delay;
      o.type = type; o.frequency.value = hz; v.gain.setValueAtTime(0, t); v.gain.linearRampToValueAtTime(gain, t + .006); v.gain.exponentialRampToValueAtTime(.0001, t + length);
      o.connect(v); v.connect(master); o.start(t); o.stop(t + length + .02); o.onended = () => { o.disconnect(); v.disconnect(); };
    }
    async function toggle() {
      if (!ctx) { const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return false; ctx = new AC(); master = ctx.createGain(); master.gain.value = .65; master.connect(ctx.destination); }
      enabled = !enabled; if (enabled) { await ctx.resume(); tone(660, .08); } else await ctx.suspend(); return enabled;
    }
    function update(s) {
      if (!enabled || s.phase !== 0) return;
      const beat = Math.floor(s.tick / 15);
      if (beat !== lastBeat) { lastBeat = beat; if (!s.off) { tone(note(notes[beat % notes.length]), .12, .022, 'triangle'); if (beat % 4 === 0) tone(55, .09, .06, 'triangle'); } }
      if (s.event && lastCue !== s.tick) {
        lastCue = s.tick;
        if (s.event === 1 && s.kills % 3 === 0) tone(600 + (s.rng >>> 0) % 70, .04, .018);
        if (s.event === 3) tone(90, .2, .07, 'sawtooth');
        if ([2, 7, 8, 11].includes(s.event)) { tone(523, .1); tone(784, .14, .045, 'square', .09); }
      }
      if (s.warning && s.warning % 60 === 0) tone(180, .2, .08);
    }
    function pause() { if (ctx && enabled) ctx.suspend(); }
    function resume() { if (ctx && enabled) ctx.resume(); }
    return { toggle, update, pause, resume, get enabled() { return enabled; }, get state() { return ctx ? ctx.state : 'uncreated'; } };
  }
  root.CoalAudio = { create, SCORE };
})(globalThis);
