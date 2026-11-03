#!/usr/bin/env python3
"""一条消息的旅程 · 演示片配乐（没有配音）：法式街头手风琴三拍子小圆舞曲，像橘猫骑车穿过小街。
numpy 离线合成，时间只读 tools/record.cjs 写的 events.json。

用法（需要 numpy，例如 ~/.venv-kokoro/bin/python3）：
    python3 tools/demo-music.py <events.json> <输出.wav>

刻意和本仓其他演示片拉开距离（像素连连看是方波芯片乐，打地鼠是尤克里里口哨马林巴，凸透镜是木琴五声琶音，
像素办公室是电钢八音盒）：这里一个方波、三角波琶音、木琴都不用。
- 乐器：手风琴（两组略微失谐的锯齿波 + 低通 + 风箱颤音，即 musette 味道）唱一条原创 G 大调旋律；
  圆润的正弦低音轻轻落在第一拍（第一版是拨弦低音提琴，Alice 嫌「嘭」太吵），手风琴左手和弦在第二、三拍；关卡段加鼓刷（滤波噪声）。
- 156 BPM 的 3/4 拍，八小节一句：G G D7 D7 G C D7 G。标题段只有长和弦；失败提示期间旋律照走，底下再垫一层轻的长和弦（第一版整段停掉，第 3 关空箱子后听着像断了一下）。
- 事件：点按一声木块轻响，发车两声自行车铃「叮铃」，送到车铃 + 一个手风琴大三和弦，
  卡在半路（漏站 / 空箱子）一声刹车吱声加两个往下的轻铃音。按钮一声轻嗒。
- 署名页：收在 G 和弦长音，1.8 s、2.8 s 各一声轻铃落定（盖印章、按指纹），最后 1 秒淡出。
母带：tanh 轻驱动，峰值 -3 dBFS；响度另用 ffmpeg loudnorm 单独做成 wav 再混流（别在混流时带 -shortest）。
"""
import json, sys, wave
import numpy as np

ev = json.load(open(sys.argv[1], encoding="utf-8"))
OUT = sys.argv[2]
SR = 44100
T = ev["seconds"]
N = int(round(T * SR))
mix = np.zeros((N, 2))
rng = np.random.default_rng(11)
marks = ev["marks"]
sec = sorted((s["t"], s["kind"]) for s in ev["sections"])
END = next((m["t"] for m in marks if m["name"] == "endcard"), T)
FIRST_LEVEL = next((t for t, k in sec if k.startswith("level")), 0)
BPM = 156
beat = 60 / BPM
bar = 3 * beat

hz = lambda m: 440 * 2 ** ((m - 69) / 12)

def add(sig, t0, gain=1.0, pan=0.0):
    i = int(t0 * SR)
    if i >= N or i < 0:
        return
    s = sig[: N - i]
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    mix[i:i + len(s), 0] += s * gain * l
    mix[i:i + len(s), 1] += s * gain * r

def lowpass(x, fc):
    a = np.exp(-2 * np.pi * fc / SR); y = np.empty_like(x); acc = 0.0
    for i in range(len(x)):
        acc = (1 - a) * x[i] + a * acc; y[i] = acc
    return y

def adsr(n, a=0.03, r=0.08):
    e = np.ones(n); na, nr = int(a * SR), int(r * SR)
    e[:na] = np.linspace(0, 1, max(1, na))[:na]
    if nr: e[-nr:] *= np.linspace(1, 0, nr)
    return e

def accordion(midis, dur, bright=1800):
    n = int(dur * SR); t = np.arange(n) / SR; x = np.zeros(n)
    for m in midis:
        f = hz(m)
        for det in (-0.0025, 0.0025):  # two reeds a hair apart: the musette shimmer
            ph = (f * (1 + det) * t) % 1
            x += 2 * ph - 1
    x = lowpass(lowpass(x / (2 * len(midis)), bright), bright * 1.6)  # two poles: reedy, not buzzy
    x *= 1 + 0.12 * np.sin(2 * np.pi * 5.5 * t)  # bellows tremolo
    return x * adsr(n, 0.035, min(0.1, dur * 0.4))

def pluck(midi, dur, damp=0.996):  # Karplus-Strong double-bass pizzicato
    f = hz(midi); p = int(SR / f); n = int(dur * SR)
    buf = rng.uniform(-1, 1, p); buf = lowpass(buf, 700); out = np.empty(n)
    for i in range(n):
        out[i] = buf[i % p]
        buf[i % p] = damp * 0.5 * (buf[i % p] + buf[(i + 1) % p])
    return out * adsr(n, 0.002, 0.05)

def softbass(midi, dur):  # round sine bass with a slow attack: no thump
    n = int(dur * SR); t = np.arange(n) / SR; f = hz(midi)
    x = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)
    return x * np.minimum(1, t / 0.06) * np.exp(-t / (dur * 0.6))

def chime(midi, dur, gain_hi=0.3):
    n = int(dur * SR); t = np.arange(n) / SR; f = hz(midi)
    return (np.sin(2 * np.pi * f * t) + gain_hi * np.sin(2 * np.pi * 2 * f * t)) * np.minimum(1, t / 0.004) * np.exp(-t / (dur * 0.45))

def brush(dur, level):
    n = int(dur * SR); src = rng.normal(0, 1, n); x = lowpass(src, 3200) - lowpass(src, 600)
    return x * np.exp(-np.arange(n) / SR / (dur * 0.5)) * level

def bell(t0, gain):  # bicycle bell: inharmonic partials, two strikes
    for k, dt in enumerate((0, 0.13)):
        n = int(1.2 * SR); t = np.arange(n) / SR; x = np.zeros(n)
        for ratio, amp, dec in ((1, 1, 0.5), (2.76, 0.5, 0.3), (5.40, 0.25, 0.15), (8.93, 0.12, 0.08)):
            x += amp * np.sin(2 * np.pi * 2350 * ratio * t) * np.exp(-t / dec)
        x *= 1 + 0.3 * np.sin(2 * np.pi * 18 * t)
        add(x * 0.25, t0 + dt, gain * (0.8 if k else 1), pan=0.35)

fail_spans = [(m["t"], m["t"] + 2.6) for m in marks if m["name"] in ("fail", "emptybox")]
ducked = lambda t: any(a <= t < b for a, b in fail_spans)
def in_level(t):
    for i, (t0, k) in enumerate(sec):
        t1 = sec[i + 1][0] if i + 1 < len(sec) else T
        if t0 <= t < t1: return k.startswith("level") or k == "final"
    return False

CH = {"G": (43, [59, 62, 67]), "D7": (38, [60, 62, 66]), "C": (36, [60, 64, 67])}
PROG = ["G", "G", "D7", "D7", "G", "C", "D7", "G"]
MEL = [[67, 71, 74], [79, None, 78], [76, 74, 72], [74, None, None], [71, 74, 79], [81, 79, 76], [78, 74, 72], [71, None, None]]

t = 0.0; b = 0
while t < T:
    name = PROG[b % 8] if t < END else "G"
    root, chord = CH[name]
    if t < FIRST_LEVEL or t >= END:  # title and end card: one long held chord per bar, no rhythm
        add(accordion(chord + [root + 24], bar * 1.02, 1400), t, 0.10)
        if t >= END: add(softbass(root + 12, bar), t, 0.10)
    else:
        add(softbass((root if b % 2 == 0 else root + 7) + 12, beat * 1.8), t, 0.085, pan=-0.1)  # soft round bass on beat 1
        for j in (1, 2):                                                                   # pah pah
            add(accordion(chord, beat * 0.55, 1600), t + j * beat, 0.075, pan=-0.25)
        if in_level(t):
            add(brush(beat * 0.9, 0.035), t, 1, pan=0.2)
            for j in (1, 2): add(brush(beat * 0.35, 0.02), t + j * beat, 1, pan=0.2)
        for j, m in enumerate(MEL[b % 8]):
            if m is None: continue
            tt = t + j * beat
            if tt >= END: continue
            ln = 1
            while j + ln < 3 and MEL[b % 8][j + ln] is None: ln += 1
            add(accordion([m, m + 12] if b % 16 >= 8 else [m], beat * ln * 0.95, 2400), tt, 0.10, pan=0.15)
    t += bar; b += 1

# under each failure note: a soft held chord, so the music never thins out while the player reads it
for a0, a1 in fail_spans:
    bi = int(a0 // bar); name = PROG[bi % 8]
    add(accordion(CH[name][1] + [CH[name][0] + 24], a1 - a0, 1300), a0, 0.07, pan=-0.1)

for m in marks:
    nm, tt = m["name"], m["t"]
    if nm == "tap":  # wood block tick
        n = int(0.06 * SR); x = np.arange(n) / SR
        add((np.sin(2 * np.pi * 1250 * x) + 0.4 * np.sin(2 * np.pi * 2900 * x)) * np.exp(-x / 0.012), tt, 0.16, pan=0.1)
    elif nm == "button":
        n = int(0.03 * SR); add(lowpass(rng.normal(0, 1, n), 3000) * np.exp(-np.arange(n) / SR / 0.006), tt, 0.12)
    elif nm == "ride":
        bell(tt, 0.5)
    elif nm == "deliver":
        bell(tt, 0.4)
        add(accordion([67, 71, 74, 79], 1.6, 2600), tt + 0.12, 0.13)
    elif nm in ("fail", "emptybox"):
        n = int(0.45 * SR); x = np.arange(n) / SR  # brake squeal
        f = 3300 - 700 * x / 0.45
        sq = np.sin(2 * np.pi * np.cumsum(f) / SR) * (1 + 0.5 * np.sin(2 * np.pi * 30 * x)) * adsr(n, 0.01, 0.15)
        add(sq, tt, 0.05, pan=0.3)
        add(chime(71, 0.5), tt + 0.15, 0.07); add(chime(67, 0.7), tt + 0.42, 0.07)  # two soft falling notes

for d, m in ((1.8, 79), (2.8, 86)):  # end card: stamp and fingerprint settle on two soft chimes, no drum
    add(chime(m, 1.4), END + d, 0.07, pan=0.1)

f = int(1.0 * SR); mix[-f:] *= np.linspace(1, 0, f)[:, None]
mix = np.tanh(mix * 1.3)
mix *= 10 ** (-3 / 20) / max(1e-9, np.abs(mix).max())
with wave.open(OUT, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype("<i2").tobytes())
print(OUT, round(T, 2), "s")
