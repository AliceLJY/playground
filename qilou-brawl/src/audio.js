// 声音全部现场合成，不带音频文件：拳脚打击、风声、铜锣、醒狮锣鼓点（大鼓 + 镲 + 锣）。
let ctx = null, master = null, music = null, muted = false, beatTimer = 0, beat = 0, tempo = 1;
function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = .7; master.connect(ctx.destination);
    music = ctx.createGain(); music.gain.value = .35; music.connect(master);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
let noiseBuf = null;
function noise() {
  if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate * .6, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const n = ctx.createBufferSource(); n.buffer = noiseBuf; return n;
}
function env(g, t, a, peak, d) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + a + d); }
function thump(out, t, f0, f1, dur, vol) {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  env(g, t, .004, vol, dur); o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + .05);
}
function hiss(out, t, type, freq, q, dur, vol) {
  const n = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  env(g, t, .003, vol, dur); n.connect(f); f.connect(g); g.connect(out); n.start(t); n.stop(t + dur + .05);
}
function gongAt(out, t, base, vol, dur) {
  for (const [r, v] of [[1, 1], [1.48, .6], [2.13, .45], [2.79, .3], [3.6, .2]]) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(base * r * 1.03, t); o.frequency.exponentialRampToValueAtTime(base * r, t + .25);
    env(g, t, .006, vol * v, dur * (1.2 - r * .15)); o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + .1);
  }
  hiss(out, t, 'bandpass', 3200, 1.2, .25, vol * .3);
}
export const sfx = {
  unlock() { ac(); },
  hit(heavy) { if (muted || !ac()) return; const t = ctx.currentTime; thump(master, t, heavy ? 140 : 190, 50, heavy ? .28 : .16, heavy ? 1 : .7); hiss(master, t, 'lowpass', heavy ? 1800 : 2600, .7, heavy ? .18 : .1, heavy ? .7 : .45); },
  whoosh() { if (muted || !ac()) return; const t = ctx.currentTime; hiss(master, t, 'bandpass', 900, 2.5, .16, .22); },
  block() { if (muted || !ac()) return; const t = ctx.currentTime; thump(master, t, 420, 160, .1, .45); hiss(master, t, 'highpass', 2500, .8, .08, .3); },
  hurt() { if (muted || !ac()) return; const t = ctx.currentTime; thump(master, t, 120, 40, .3, .9); },
  gong() { if (muted || !ac()) return; gongAt(master, ctx.currentTime, 196, .55, 2.6); },
  smallGong() { if (muted || !ac()) return; gongAt(master, ctx.currentTime, 520, .3, .9); },
  tell() { if (muted || !ac()) return; const t = ctx.currentTime; hiss(master, t, 'bandpass', 5200, 6, .12, .2); },
  setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : .7; },
  get muted() { return muted; },
  setTempo(x) { tempo = x; },
  // 醒狮锣鼓：每拍大鼓，反拍小镲，每四小节一记锣。由画面循环每帧调用。
  tick(dt, on) {
    if (!on || muted || !ctx) return;
    beatTimer -= dt; if (beatTimer > 0) return;
    const spb = .5 / tempo; beatTimer += spb; const t = ctx.currentTime + .02, b = beat++ % 16;
    thump(music, t, b % 4 === 0 ? 95 : 120, 45, .22, b % 4 === 0 ? 1 : .6);
    if (b % 2 === 1) hiss(music, t, 'highpass', 6000, .7, .09, .35);
    if (b === 6 || b === 14) thump(music, t + spb / 2, 120, 45, .18, .5);
    if (b === 0 && (beat >> 4) % 2 === 0) gongAt(music, t, 260, .35, 1.4);
  }
};
