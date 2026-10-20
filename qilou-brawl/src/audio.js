// 声音全部现场合成，不带音频文件：拳脚打击、风声、铜锣、醒狮锣鼓点（大鼓 + 镲 + 锣）。
// 同一套合成既能实时播放，也能录屏时离线渲染成音轨（renderOffline）：录屏模式下每次发声都记下时间。
let ctx = null, live = null, muted = false, beatTimer = 0, beat = 0, tempo = 1;
const rec = () => (typeof window !== 'undefined' && window.__qilouRec) || null;
const log = (name, arg) => { const r = rec(); if (r) r.push({ t: performance.now(), name, arg }); };

// 一套「乐器」：给定 AudioContext 和两路输出，按指定时刻发声
function voices(c, master, music) {
  let noiseBuf = null;
  const noise = () => {
    if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate * .6, c.sampleRate); const d = noiseBuf.getChannelData(0); let s = 12345; for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = s / 1073741823.5 - 1; } }
    const n = c.createBufferSource(); n.buffer = noiseBuf; return n;
  };
  const env = (g, t, a, peak, d) => { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + a + d); };
  const thump = (out, t, f0, f1, dur, vol) => {
    const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, .004, vol, dur); o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + .05);
  };
  const hiss = (out, t, type, freq, q, dur, vol) => {
    const n = noise(), f = c.createBiquadFilter(), g = c.createGain(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    env(g, t, .003, vol, dur); n.connect(f); f.connect(g); g.connect(out); n.start(t); n.stop(t + dur + .05);
  };
  const gongAt = (out, t, base, vol, dur) => {
    for (const [r, v] of [[1, 1], [1.48, .6], [2.13, .45], [2.79, .3], [3.6, .2]]) {
      const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(base * r * 1.03, t); o.frequency.exponentialRampToValueAtTime(base * r, t + .25);
      env(g, t, .006, vol * v, dur * (1.2 - r * .15)); o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + .1);
    }
    hiss(out, t, 'bandpass', 3200, 1.2, .25, vol * .3);
  };
  return {
    hit: (t, heavy) => { thump(master, t, heavy ? 140 : 190, 50, heavy ? .28 : .16, heavy ? 1 : .7); hiss(master, t, 'lowpass', heavy ? 1800 : 2600, .7, heavy ? .18 : .1, heavy ? .7 : .45); },
    whoosh: (t) => hiss(master, t, 'bandpass', 900, 2.5, .16, .22),
    block: (t) => { thump(master, t, 420, 160, .1, .45); hiss(master, t, 'highpass', 2500, .8, .08, .3); },
    hurt: (t) => thump(master, t, 120, 40, .3, .9),
    gong: (t) => gongAt(master, t, 196, .55, 2.6),
    smallGong: (t) => gongAt(master, t, 520, .3, .9),
    tell: (t) => hiss(master, t, 'bandpass', 5200, 6, .12, .2),
    // 醒狮锣鼓的一拍：每拍大鼓，反拍小镲，每两拍补一记，每四小节一记锣
    drum: (t, { b, spb, gongBar }) => {
      thump(music, t, b % 4 === 0 ? 95 : 120, 45, .22, b % 4 === 0 ? 1 : .6);
      if (b % 2 === 1) hiss(music, t, 'highpass', 6000, .7, .09, .35);
      if (b === 6 || b === 14) thump(music, t + spb / 2, 120, 45, .18, .5);
      if (b === 0 && gongBar) gongAt(music, t, 260, .35, 1.4);
    }
  };
}
// 总线：音乐与音效汇到 master，再过一级压缩防止锣、鼓、拳脚叠在一起时削顶（2026-10-20 录屏音轨量出 57 处削顶）
function bus(c) {
  const comp = c.createDynamicsCompressor(); comp.threshold.value = -12; comp.knee.value = 6; comp.ratio.value = 8; comp.attack.value = .003; comp.release.value = .15;
  comp.connect(c.destination);
  const master = c.createGain(); master.gain.value = .55; master.connect(comp);
  const music = c.createGain(); music.gain.value = .4; music.connect(master);
  return { master, music };
}
function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC(); const { master, music } = bus(ctx);
    live = { master, v: voices(ctx, master, music) };
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
const play = (name, arg) => { log(name, arg); if (!muted && ac()) live.v[name](ctx.currentTime, arg); };

export const sfx = {
  unlock() { ac(); },
  hit(heavy) { play('hit', heavy); },
  whoosh() { play('whoosh'); },
  block() { play('block'); },
  hurt() { play('hurt'); },
  gong() { play('gong'); },
  smallGong() { play('smallGong'); },
  tell() { play('tell'); },
  setMuted(m) { muted = m; if (live) live.master.gain.value = m ? 0 : .55; },
  get muted() { return muted; },
  setTempo(x) { tempo = x; },
  // 由画面循环每帧调用；节拍计时不依赖声卡，录屏时没有声卡也照样记拍子
  tick(dt, on) {
    if (!on) return;
    beatTimer -= dt; if (beatTimer > 0) return;
    const spb = .5 / tempo; beatTimer += spb;
    const arg = { b: beat % 16, spb, gongBar: ((beat >> 4) % 2) === 0 }; beat++;
    log('drum', arg);
    if (!muted && ctx) live.v.drum(ctx.currentTime + .02, arg);
  }
};

// 录屏用：把记下的发声事件离线渲染成 WAV（base64）。t0 是视频第一帧对应的 performance.now()。
export async function renderOffline(events, t0, seconds) {
  const sr = 44100, c = new OfflineAudioContext(2, Math.ceil(sr * seconds), sr);
  const { master, music } = bus(c);
  const v = voices(c, master, music);
  for (const e of events) { const t = (e.t - t0) / 1000 + (e.name === 'drum' ? .02 : 0); if (t >= 0 && t < seconds - .05) v[e.name](t, e.arg); }
  const buf = await c.startRendering();
  const n = buf.length, L = buf.getChannelData(0), R = buf.getChannelData(1), out = new DataView(new ArrayBuffer(44 + n * 4));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); w(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
  out.setUint32(24, sr, true); out.setUint32(28, sr * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * 4, true);
  for (let i = 0, o = 44; i < n; i++, o += 4) { out.setInt16(o, Math.max(-1, Math.min(1, L[i])) * 32767, true); out.setInt16(o + 2, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
  const bytes = new Uint8Array(out.buffer); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
