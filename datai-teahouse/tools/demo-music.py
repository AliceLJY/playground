#!/usr/bin/env python3
"""搭台体验片的配乐与音效：numpy 合成，时间只读 tools/demo.cjs 写的 events.json。

用法（需要 numpy）：python3 tools/demo-music.py <events.json> <输出.wav> [种子]

- 底：茶楼早市的人声嗡嗡（粉噪声低通）和偶尔一声瓷碗、蒸笼相碰；上面一条原创的 D 宫五声小曲，高胡拉、扬琴跟，84 BPM，
  句子短、留气口，像茶楼电台里放的广东小曲，不抢画面。
- 卡点：游戏自己的音效日志（events.json 的 sounds，demo.cjs 每帧读一次、按视频时间记，跳过段里的不记），
  按名字各合成一种：斟茶是带通噪声往上扫、叩指两记木响、揭盖瓷音、翻报纸两下纸响、夹一件竹笼轻响、落座离席擦地、
  点心车四下轱辘、唔该两声、落单铅笔、壶上桌瓷落、出品蒸笼、加水注水。
- 片头一声碰铃起，署名页一声扫音、盖章与按指纹各一声落定。
母带：短混响、软限幅、峰值 -3 dB；响度另用 ffmpeg loudnorm 到 -14 LUFS。
"""
import json
import sys
import wave

import numpy as np

ev = json.load(open(sys.argv[1], encoding="utf-8"))
OUT = sys.argv[2]
rng = np.random.default_rng(int(sys.argv[3]) if len(sys.argv) > 3 else 31)
SR = 48000
FPS = ev["fps"]
T = ev["seconds"]
N = int(round(T * SR))
mix = np.zeros((N, 2))
END = ev["marks"]["end"]
NAMES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def hz(n):
    sharp = 1 if "#" in n else 0
    return 440 * 2 ** ((NAMES[n[0]] + sharp + 12 * (int(n[-1]) + 1) - 69) / 12)


def put(t, sig, gain, pan=0.0):
    i = int(round(t * SR))
    if i >= N or i < 0 or len(sig) == 0:
        return
    sig = sig[: N - i] * gain
    mix[i: i + len(sig), 0] += sig * np.sqrt(0.5 * (1 - pan))
    mix[i: i + len(sig), 1] += sig * np.sqrt(0.5 * (1 + pan))


def lowpass(x, a):
    y = np.zeros_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += a * (x[i] - acc)
        y[i] = acc
    return y


def bandnoise(dur, f0, f1=None, q=4.0, env=None):
    """带通噪声，中心频率从 f0 扫到 f1（二阶谐振滤波，逐样本改系数）。"""
    n = int(dur * SR)
    x = rng.normal(0, 1, n)
    f1 = f0 if f1 is None else f1
    fc = f0 + (f1 - f0) * np.linspace(0, 1, n)
    y = np.zeros(n)
    y1 = y2 = 0.0
    for i in range(n):
        w = 2 * np.pi * fc[i] / SR
        r = np.exp(-w / (2 * q))
        a1, a2 = 2 * r * np.cos(w), -r * r
        v = x[i] + a1 * y1 + a2 * y2
        y[i] = v - y2
        y2, y1 = y1, v
    y /= max(1e-9, np.abs(y).max())
    if env is None:
        env = np.sin(np.pi * np.arange(n) / n)
    return y * env


def tone(f, dur, f_end=None, wave_="sine", decay=6.0, attack=0.005):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f_end = f if f_end is None else f_end
    freq = f * (f_end / f) ** (t / dur)
    ph = 2 * np.pi * np.cumsum(freq) / SR
    if wave_ == "tri":
        y = 2 / np.pi * np.arcsin(np.sin(ph))
    else:
        y = np.sin(ph)
    return y * np.minimum(1, t / attack) * np.exp(-t * decay)


def yangqin(f, dur=1.6, bright=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for det in (1.0, 1.0025):
        for k in range(1, 8):
            y += (bright ** (k - 1)) * (1 / k ** 1.2) * np.sin(2 * np.pi * f * det * k * (1 + 0.0006 * k * k) * t) * np.exp(-t * (2.4 + 1.6 * (k - 1)) * (f / 300) ** 0.25)
    y += rng.normal(0, 1, n) * np.exp(-t * 300) * 0.25
    return y * np.minimum(1, t / 0.0015) / 4.2


def gaohu(f, dur):
    n = int((dur + 0.25) * SR)
    t = np.arange(n) / SR
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.5 * t) * np.clip((t - 0.12) / 0.2, 0, 1)
    ph = 2 * np.pi * np.cumsum(f * vib) / SR
    y = np.zeros(n)
    for k, amp in ((1, 1), (2, 0.55), (3, 0.38), (4, 0.22), (5, 0.12), (6, 0.07)):
        y += amp * np.sin(k * ph)
    env = np.minimum(1, t / 0.06) * np.clip((dur + 0.25 - t) / 0.25, 0, 1)
    return y * env / 2.3


def bell(f=2637, dur=1.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * f * 2.76 * t)) * np.exp(-t * 3.2) * np.minimum(1, t / 0.001)


def thump(f0=62, dur=0.7, hard=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = f0 * (1 + 0.9 * np.exp(-t * 30))
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7)
    y += rng.normal(0, 1, n) * np.exp(-t * 45) * 0.25 * hard
    return y


def porcelain(f=2650, dur=0.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t) + 0.45 * np.sin(2 * np.pi * f * 1.49 * t) + 0.2 * np.sin(2 * np.pi * f * 2.7 * t)) * np.exp(-t * 14) * np.minimum(1, t / 0.001)


def muyu(f=820):
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 1.63 * t)) * np.exp(-t * 38) * np.minimum(1, t / 0.0008)


def whoosh(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = rng.normal(0, 1, n)
    lp = np.zeros(n)
    for i in range(1, n):
        a = 0.02 + 0.10 * np.sin(np.pi * t[i] / dur)
        lp[i] = lp[i - 1] + a * (noise[i] - lp[i - 1])
    return lp * np.sin(np.pi * t / dur) ** 2 * 2.2


# ---------- 底：茶楼的人声与瓷器 ----------
hum = lowpass(rng.normal(0, 1, N), 0.012)
hum = lowpass(hum, 0.02)
hum /= np.abs(hum).max()
sway = 0.75 + 0.25 * np.sin(2 * np.pi * 0.07 * np.arange(N) / SR + 1.0)
fade = np.minimum(1, np.arange(N) / (1.5 * SR)) * np.clip((END - np.arange(N) / SR) / 1.0, 0, 1)
mix[:, 0] += hum * sway * fade * 0.075
mix[:, 1] += np.roll(hum, 977) * sway * fade * 0.075
t_ = 2.0
while t_ < END - 1:
    put(t_, porcelain(1900 + rng.uniform(-400, 600), 0.3), 0.03, rng.uniform(-0.7, 0.7))
    t_ += rng.uniform(2.5, 6.0)

# ---------- 曲：D 宫五声，84 BPM，短句留气口 ----------
BPM = 84
BEAT = 60 / BPM
CHORDS = [("D4", "F#4", "A4"), ("G3", "B3", "D4"), ("D4", "F#4", "A4"), ("A3", "C#4", "E4"),
          ("D4", "F#4", "A4"), ("B3", "D4", "F#4"), ("G3", "B3", "D4"), ("A3", "C#4", "E4")]
BASS = ["D3", "G2", "D3", "A2", "D3", "B2", "G2", "A2"]
MELODY = [[("A5", 1), ("B5", 0.5), ("A5", 0.5), ("F#5", 1), ("E5", 1)], [("D5", 2), (None, 2)],
          [("F#5", 1), ("A5", 1), ("B5", 1.5), ("A5", 0.5)], [("E5", 2.5), (None, 1.5)],
          [("A5", 1), ("B5", 1), ("D6", 1), ("B5", 1)], [("A5", 1.5), ("F#5", 0.5), ("E5", 2)],
          [("D5", 1), ("E5", 1), ("F#5", 0.5), ("E5", 0.5), ("D5", 1)], [("D5", 3), (None, 1)]]
tb, bar = 1.2, 0
while tb < END - 0.05:
    ch, mel = CHORDS[bar % 8], MELODY[bar % 8]
    notes = [ch[0], ch[1], ch[2], ch[1]] * 2
    for k, nme in enumerate(notes):
        te = tb + k * BEAT / 2
        if te >= END:
            break
        put(te, yangqin(hz(nme) * 2, 1.8, 0.7), (0.08 if k % 4 == 0 else 0.05) * min(1, te / 1.5), (k % 4 - 1.5) * 0.18)
    put(tb, yangqin(hz(BASS[bar % 8]), 2.2, 0.5), 0.10, -0.1)
    if bar >= 1:
        tt = tb
        for nme, beats in mel:
            d = beats * BEAT
            if nme and tt + 0.05 < END:
                put(tt, gaohu(hz(nme), min(d, END - tt) * 0.92), 0.11, 0.15)
            tt += d
    tb += 4 * BEAT
    bar += 1

# ---------- 游戏音效卡点 ----------
def add(a, b):
    """两段长度不同的信号相加，短的补零。"""
    n = max(len(a), len(b))
    return np.pad(a, (0, n - len(a))) + np.pad(b, (0, n - len(b)))


def sfx(name):
    if name == "pour":
        return add(bandnoise(1.3, 420, 1300, 2.5) * 0.9, 0.12 * tone(520, 1.2, 1180, decay=1.5, attack=0.1)), 0.42
    if name == "knock":
        a = np.zeros(int(0.5 * SR)); k = tone(1750, 0.08, 900, "tri", decay=40); a[: len(k)] += k; j = int(0.16 * SR); a[j: j + len(k)] += k
        return a + np.pad(bandnoise(0.05, 2400, q=3), (0, len(a) - int(0.05 * SR))) * 0.5, 0.45
    if name == "lid":
        return porcelain(2650, 0.4), 0.4
    if name == "paper":
        a = np.zeros(int(0.45 * SR)); x = bandnoise(0.13, 2800, 3600, 1.2); a[: len(x)] += x; y = bandnoise(0.18, 2200, 2800, 1.2); j = int(0.17 * SR); a[j: j + len(y)] += y * 0.8
        return a, 0.38
    if name == "pick":
        a = np.zeros(int(0.8 * SR)); x = bandnoise(0.08, 900, q=4); a[: len(x)] += x * 0.6; p = porcelain(3100, 0.15); j = int(0.55 * SR); a[j: j + len(p)] += p * 0.5
        return a, 0.35
    if name == "sit":
        return lowpass(rng.normal(0, 1, int(0.3 * SR)), 0.03) * np.sin(np.pi * np.linspace(0, 1, int(0.3 * SR))) * 4 + np.pad(tone(110, 0.25, 70, "tri", decay=8), (int(0.05 * SR), 0)), 0.5
    if name == "leave":
        a = np.zeros(int(1.0 * SR)); x = lowpass(rng.normal(0, 1, int(0.3 * SR)), 0.03) * 4; a[: len(x)] += x * np.sin(np.pi * np.linspace(0, 1, len(x)))
        for j in (0.45, 0.8):
            s = thump(140, 0.12, 0.4); i = int(j * SR); a[i: i + len(s)] += s * 0.5
        return a, 0.45
    if name == "cart":
        a = np.zeros(int(0.8 * SR))
        for i in range(4):
            x = lowpass(rng.normal(0, 1, int(0.09 * SR)), 0.05) * 5 * np.sin(np.pi * np.linspace(0, 1, int(0.09 * SR))); j = int(i * 0.13 * SR); a[j: j + len(x)] += x
        return a + np.pad(tone(180, 0.5, 150, "tri", decay=4), (0, len(a) - int(0.5 * SR))) * 0.25, 0.3
    if name == "call":
        a = np.zeros(int(0.5 * SR)); a[: int(0.14 * SR)] += tone(660, 0.14, 880, "tri", decay=6); j = int(0.16 * SR); a[j: j + int(0.18 * SR)] += tone(880, 0.18, 760, "tri", decay=6)
        return a, 0.32
    if name == "pen":
        a = np.zeros(int(0.3 * SR)); x = bandnoise(0.08, 4000, 5000, 1.5); a[: len(x)] += x; y = bandnoise(0.1, 3800, 4600, 1.5); j = int(0.14 * SR); a[j: j + len(y)] += y
        return a, 0.3
    if name == "potdown":
        a = np.zeros(int(0.7 * SR)); a[: int(0.3 * SR)] += porcelain(2400, 0.3); x = lowpass(rng.normal(0, 1, int(0.12 * SR)), 0.04) * 4; a[: len(x)] += x * 0.4; p = porcelain(1900, 0.25); j = int(0.3 * SR); a[j: j + len(p)] += p * 0.5
        return a, 0.42
    if name == "steamer":
        a = np.zeros(int(0.3 * SR)); x = bandnoise(0.12, 1100, q=2); a[: len(x)] += x; y = bandnoise(0.1, 1300, q=2); j = int(0.09 * SR); a[j: j + len(y)] += y * 0.7
        return a, 0.32
    if name == "refill":
        a = np.zeros(int(1.4 * SR)); x = bandnoise(1.0, 300, 900, 2); a[: len(x)] += x; p = porcelain(2650, 0.3); j = int(1.0 * SR); a[j: j + len(p)] += p * 0.6
        return a, 0.35
    if name == "dry":
        return bandnoise(0.2, 700, q=6) * 0.8, 0.25
    return None, 0


last = {}
for vt, name in ev["sounds"]:   # demo.cjs 已按视频时间记好，跳过段里的没记
    if vt >= END - 0.3:            # 署名页上不放茶楼里的动静
        continue
    if name in last and vt - last[name] < 0.12:   # 连按时同名音效不叠成一团
        continue
    last[name] = vt
    sig, gain = sfx(name)
    if sig is not None:
        put(vt, sig, gain, {"knock": 0.1, "pour": -0.05, "cart": 0.5, "potdown": 0.2, "steamer": 0.3}.get(name, 0.0))

# 点击的小木鱼（轻，让人感到是在按按钮）
for tp in ev["taps"]:
    put(tp["t"], muyu(980), 0.12, 0.25)

# ---------- 片头、署名页 ----------
put(0.3, bell(), 0.06, 0.2)
put(END, whoosh(1.2), 0.18, 0.0)
for k, nme in enumerate(("D3", "A3", "D4", "F#4", "A4")):
    put(END + 0.05 + 0.12 * k, yangqin(hz(nme), 3.0, 0.85), 0.2, -0.3 + 0.15 * k)
m = ev["marks"]
if "seal" in m:
    put(m["seal"], thump(70, 0.8, 1.2), 0.45, 0.0)
    put(m["seal"] + 0.02, muyu(640), 0.25, 0.0)
    put(m["thumb"], thump(85, 0.6, 0.8), 0.35, 0.1)
    put(m["thumb"] + 0.05, bell(hz("D6"), 3.0), 0.12, 0.0)

# ---------- 混响与母带 ----------
L = int(1.6 * SR)
tt = np.arange(L) / SR
ir = rng.normal(0, 1, (L, 2)) * np.exp(-tt * 6.9 / 1.6)[:, None]
ir[: int(0.015 * SR)] = 0
for ch in (0, 1):
    ir[:, ch] = np.convolve(ir[:, ch], np.ones(8) / 8, "same")
ir /= np.sqrt((ir ** 2).sum(axis=0))
M = 1 << int(np.ceil(np.log2(N + L)))
wet = np.stack([np.fft.irfft(np.fft.rfft(mix[:, ch], M) * np.fft.rfft(ir[:, ch], M), M)[:N] for ch in (0, 1)], axis=1)
out = mix + wet * 0.28
out = np.tanh(1.3 * out / np.abs(out).max()) / np.tanh(1.3)
out = out / np.abs(out).max() * 10 ** (-3 / 20)
with wave.open(OUT, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((out * 32767).astype("<i2").tobytes())
print(f"wrote {OUT}: {T:.2f}s, sounds placed from {len(ev['sounds'])} log entries")
