#!/usr/bin/env python3
"""「像素办公室的一天」的配乐：numpy 合成，时间只读 tools/mv-record.cjs 写的 events.json。

用法（需要 numpy，例如 ~/.venv-kokoro/bin/python3）：
    python3 tools/mv-music.py <events.json> <输出.wav> [种子]

作曲意图：轻快、治愈，像一间小办公室的白噪音里有人哼歌。C 大调，100 拍/分，和弦 IV–V–iii–vi（F G Em Am）循环。
- 开门：八音盒两声，铺底 pad 淡入；每有一位伙伴走到工位，就在八音盒上往上走一个五声音（十个人一路往上）。
- 白天：电钢 pad + 拨弦低音 + 轻沙锤 + 软底鼓，八音盒在和弦音上走两小节一句的旋律。
- 事件点缀（落在事件那一帧，不量化）：交活撒彩带＝一串上行的亮音加闪光噪声；纸条到＝两声铃；
  有人进门打招呼＝do-mi-sol 三声，0.8 秒后访客回一声；奶茶到、大家道谢＝更亮的四音琶音；排队敲门＝木鱼两下。
- 傍晚：鼓退掉只剩沙锤，旋律降一个八度；下班出门每人一声往下走的拨弦。
- 深夜：只剩 pad 和稀疏的八音盒。关灯：开关一声「咔」，最后一个和弦，2.5 秒内淡到无声。
- 署名尾板：八音盒把开头的动机轻轻再弹一遍；1.8 s、2.8 s 两声落定音（Mixkit hard-pop-click -10 dB 叠 deep-impact -20 dB，
  story-video sfx-library，Mixkit License）。
母带：tanh 轻驱动，采样峰值 -3 dBFS；成片合轨时再 loudnorm 到 -16 LUFS。
"""
import json
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

ev = json.load(open(sys.argv[1], encoding="utf-8"))
OUT = sys.argv[2]
rng = np.random.default_rng(int(sys.argv[3]) if len(sys.argv) > 3 else 11)
SR = 48000
T = ev["seconds"]
N = int(round(T * SR))
mix = np.zeros((N, 2))
EVENTS = ev["events"]
first = lambda kind: next((e["t"] for e in EVENTS if e["type"] == kind), None)
every = lambda kind: [e["t"] for e in EVENTS if e["type"] == kind]
OFFICE = ev["office"]
DUSK = first("dusk") or OFFICE
NIGHT = first("night") or OFFICE
LIGHTS = first("lights-off") or OFFICE - 3
CARD = ev.get("endcard", {}).get("start")

BPM = round(100 * ev.get("speed", 1))   # the film played 1.2× faster gets a 120 bpm score
BEAT = 60 / BPM
BAR = 4 * BEAT
NAMES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def hz(n):
    return 440 * 2 ** ((NAMES[n[0]] + 12 * (int(n[-1]) + 1) - 69) / 12)


def put(t, sig, gain, pan=0.0):
    i = int(round(t * SR))
    if i >= N or i + len(sig) <= 0:
        return
    if i < 0:
        sig, i = sig[-i:], 0
    sig = sig[: N - i] * gain
    mix[i: i + len(sig), 0] += sig * np.sqrt(0.5 * (1 - pan))
    mix[i: i + len(sig), 1] += sig * np.sqrt(0.5 * (1 + pan))


def env(n, a, d):
    t = np.arange(n) / SR
    return np.minimum(1, t / a) * np.exp(-t / d)


def box(f, dur=1.6):
    """Music box / glockenspiel tine: fundamental + the inharmonic 2.76 and 5.4 partials, quick decay."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 6) + 0.12 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 12)
    return y * env(n, 0.002, dur / 3.2)


def pluck(f, dur=1.2):
    """Soft nylon-ish pluck for the bass and the arrive / exit steps."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = sum((1 / k ** 1.4) * np.sin(2 * np.pi * f * k * t) * np.exp(-t * (2.2 + 1.6 * k)) for k in range(1, 7))
    return y * np.minimum(1, t / 0.004)


def pad(freqs, dur, bright=1.0):
    """Electric-piano-ish pad: sine + soft 2nd harmonic per note, slow attack and release, slight chorus."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for f in freqs:
        for det in (-0.6, 0.6):
            y += np.sin(2 * np.pi * (f + det) * t) + 0.18 * bright * np.sin(4 * np.pi * (f + det) * t) * np.exp(-t * 1.5)
    shape = np.minimum(1, t / 0.35) * np.minimum(1, np.maximum(0, dur - t) / 0.5)
    return y * shape / (2 * len(freqs))


def noise_hit(dur, lo, hi, decay):
    n = int(dur * SR)
    x = rng.normal(0, 1, n)
    X = np.fft.rfft(x)
    fr = np.fft.rfftfreq(n, 1 / SR)
    X *= (fr > lo) & (fr < hi)
    y = np.fft.irfft(X, n)
    y /= np.abs(y).max() + 1e-9
    return y * env(n, 0.001, decay)


def kick():
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    f = 110 * np.exp(-t * 18) + 48
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.002, 0.12)


def woodblock(f=880):
    n = int(0.18 * SR)
    t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 2.3 * t)) * env(n, 0.0005, 0.03)


def sfx(name):
    path = Path.home() / "Downloads/sync-bridge/cc-skills/story-video/references/sfx-library" / name
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype="<f4").astype(float)


CHORDS = [("F3", "A3", "C4", "E4"), ("G3", "B3", "D4", "F4"), ("E3", "G3", "B3", "D4"), ("A3", "C4", "E4", "G4")]
ROOTS = ["F2", "G2", "E2", "A2"]
PENTA = ["C5", "D5", "E5", "G5", "A5", "C6", "D6", "E6", "G6", "A6"]

# ---- harmony bed: one chord per bar from the first bar to the lights going out
end_music = LIGHTS + 0.15
bar = 0
while bar * BAR < end_music:
    t0 = bar * BAR
    ch = CHORDS[bar % 4]
    night = t0 >= NIGHT
    dusk = DUSK <= t0 < NIGHT
    lvl = min(1, (t0 + BAR) / 4) * (0.8 if night else 1)
    put(t0, pad([hz(n) for n in ch], BAR + 0.5, bright=0.6 if night else 1), 0.11 * lvl)
    if 4.0 <= t0 < NIGHT:                                    # bass from the first arrivals until night
        put(t0, pluck(hz(ROOTS[bar % 4]), 1.6), 0.13)
        put(t0 + 2 * BEAT, pluck(hz(ROOTS[bar % 4]) * (1.5 if bar % 2 else 1), 1.2), 0.09)
    for b in range(8):                                       # off-beat shaker, eighths
        tb = t0 + b * BEAT / 2
        if 4.0 <= tb < NIGHT and b % 2 == 1:
            put(tb, noise_hit(0.08, 5000, 12000, 0.018), 0.05 if not dusk else 0.035, 0.3)
    if 6.0 <= t0 < DUSK:                                     # soft kick on 1 and 3 during the day
        put(t0, kick(), 0.2)
        put(t0 + 2 * BEAT, kick(), 0.14)
    bar += 1

# ---- melody: two-bar phrases on chord tones, the second bar answering the first; sparse at night
accents = sorted(every("arrive") + every("confetti") + every("hello") + every("thanks") + every("paper") + every("knock"))
motif = [0, 2, 4, 2, 5, 4, 2, 1]                            # scale steps, reused and varied each phrase
t = 2 * BAR
phrase = 0
while t < end_music - BAR:
    night = t >= NIGHT
    dusk = DUSK <= t < NIGHT
    octave = 0.5 if dusk else 1.0
    steps = motif if phrase % 2 == 0 else [s + int(rng.choice([-1, 0, 1])) for s in motif][::-1]
    for k, s in enumerate(steps):
        tn = t + k * BEAT
        if night and k % 2:                                  # night: half the notes
            continue
        if any(abs(tn - a) < 0.35 for a in accents):         # leave room for the event sounds
            continue
        f = hz(PENTA[int(np.clip(s + (phrase // 4) % 2, 0, 7))]) * octave
        put(tn, box(f, 1.8 if night else 1.3), (0.13 if night else 0.17) * (0.85 if k % 2 else 1), -0.25 + 0.5 * ((k * 3) % 5) / 4)
    t += 2 * BAR
    phrase += 1

# ---- opening: two music-box notes as the door opens
put(0.3, box(hz("G5"), 2.4), 0.16, -0.2)
put(0.9, box(hz("C6"), 2.6), 0.15, 0.2)

# ---- arrive: each colleague at the desk is one step up the pentatonic scale
for k, ta in enumerate(every("arrive")):
    put(ta, box(hz(PENTA[min(k, len(PENTA) - 1)]), 1.4), 0.15, -0.4 + 0.8 * (k % 5) / 4)

# ---- confetti: a quick upward run plus sparkle noise
for tc in every("confetti"):
    for k, n in enumerate(["C6", "E6", "G6", "A6", "C6", "E6"]):
        put(tc + 0.04 * k, box(hz(n) * (2 if k > 3 else 1), 1.0), 0.09, -0.5 + 0.2 * k)
    put(tc, noise_hit(0.9, 6000, 14000, 0.25), 0.05, 0.2)

# ---- paper: two bells
for tp in every("paper"):
    put(tp, box(hz("E6"), 1.8), 0.16, 0.3)
    put(tp + 0.22, box(hz("C6"), 2.2), 0.15, 0.3)

# ---- hello: do-mi-sol from the room, the visitor answers 0.8 s later
for th in every("hello"):
    for k, n in enumerate(["C5", "E5", "G5"]):
        put(th + 0.09 * k, box(hz(n), 1.6), 0.14, -0.3 + 0.3 * k)
    put(th + 0.8, box(hz("G5"), 1.4), 0.12, 0.5)
    put(th + 0.95, box(hz("C6"), 1.8), 0.12, 0.5)

# ---- thanks: brighter four-note arpeggio, twice
for tt in every("thanks"):
    for rep in range(2):
        for k, n in enumerate(["C6", "E6", "G6", "C6"]):
            put(tt + rep * 0.5 + 0.08 * k, box(hz(n) * (2 if k == 3 else 1), 1.4), 0.11, -0.3 + 0.2 * k)

# ---- knock: two woodblock taps per colleague reaching the queue
for tk in every("knock"):
    put(tk, woodblock(820), 0.2, 0.15)
    put(tk + 0.16, woodblock(860), 0.16, 0.15)

# ---- exit: one soft pluck per person leaving, stepping down
for k, tx in enumerate(every("exit")):
    put(tx, pluck(hz(["G4", "E4", "D4", "C4", "A3", "G3", "E3", "D3", "C3", "A2"][min(k, 9)]), 1.4), 0.14, 0.35)

# ---- lights off: switch click, last chord, fade
put(LIGHTS, noise_hit(0.05, 1500, 6000, 0.008), 0.22, 0.4)
put(LIGHTS + 0.05, pad([hz(n) for n in ("C3", "G3", "C4", "D4", "E4")], 3.0, bright=0.5), 0.2)
put(LIGHTS + 0.1, box(hz("E5"), 3.0), 0.1)

# ---- signature card: the opening motif once more, and the two settling hits
if CARD is not None:
    for k, n in enumerate(["G5", "C6", "E6"]):
        put(CARD + 0.35 + 0.45 * k, box(hz(n), 2.6), 0.12, -0.2 + 0.2 * k)
    put(CARD + 1.2, pad([hz(n) for n in ("F3", "A3", "C4", "E4")], 4.2, bright=0.6), 0.1)
    pop, impact = sfx("sfx-hard-pop-click.mp3"), sfx("sfx-deep-impact.mp3")
    for s in ev["endcard"].get("sfx", [1.8, 2.8]):
        put(CARD + s, pop / (np.abs(pop).max() + 1e-9), 10 ** (-10 / 20) * 0.5)
        put(CARD + s - 0.18, impact / (np.abs(impact).max() + 1e-9), 10 ** (-20 / 20) * 0.5)   # impact's onset is 180 ms in

# ---- fade the office music to nothing after lights off; the card part starts clean
tt = np.arange(N) / SR
office_gain = np.clip((LIGHTS + 2.6 - tt) / 2.4, 0, 1)
if CARD is not None:
    office_gain = np.where(tt >= CARD, 1.0, office_gain)
mix *= office_gain[:, None]
mix *= np.clip(tt / 0.05, 0, 1)[:, None] * np.clip((T - tt) / 0.6, 0, 1)[:, None]

# ---- small room reverb
L = int(1.4 * SR)
ir_t = np.arange(L) / SR
ir = rng.normal(0, 1, (L, 2)) * np.exp(-ir_t * 6.9 / 1.4)[:, None]
ir[: int(0.012 * SR)] = 0
for ch in (0, 1):
    ir[:, ch] = np.convolve(ir[:, ch], np.ones(10) / 10, "same")
ir /= np.sqrt((ir ** 2).sum(axis=0))
M = 1 << int(np.ceil(np.log2(N + L)))
wet = np.stack([np.fft.irfft(np.fft.rfft(mix[:, ch], M) * np.fft.rfft(ir[:, ch], M), M)[:N] for ch in (0, 1)], axis=1)
out = mix + wet * 0.35

out = np.tanh(1.2 * out / np.abs(out).max()) / np.tanh(1.2)
out = out / np.abs(out).max() * 10 ** (-3 / 20)
with wave.open(OUT, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((np.clip(out, -1, 1) * 32767).astype("<i2").tobytes())
print(f"{OUT}: {T:.2f} s; arrive {len(every('arrive'))}, confetti {len(every('confetti'))}, hello {len(every('hello'))}, thanks {len(every('thanks'))}, knock {len(every('knock'))}, exit {len(every('exit'))}, dusk {DUSK:.2f}, night {NIGHT:.2f}, lights {LIGHTS:.2f}, card {CARD}")
