#!/usr/bin/env python3
"""南禅寺大殿演示片的配乐：numpy 合成，时间只读 tools/demo.cjs 写的 events.json。

用法（需要 numpy，例如 ~/.venv-kokoro/bin/python3）：
    python3 tools/demo-music.py <events.json> <输出.wav> [种子]

作曲意图：D 宫调五声（D E F# A B），筝的味道，76 BPM 一直往前走，不让画面干。
- 底：低音 D、A 持续音；每小节一个和弦根音（D B E A 循环），八分音符拨弦琶音。
- 鼓：轻的扁鼓在一、三拍；第 1 步夯台基时两声重鼓。
- 每次按下一步：一声木鱼，同时一个高音泛音提示。
- 天黑：一声磬，琶音换到高八度、拨弦变稀。
- 拆开：一串往上走的泛音；装回：往下落回。
- 结尾一句话：D A D 琶音收束，磬声收尾。
混响同 jianmen-drizzle/tools/demo-music.py；母带 tanh 轻驱动，响度另用 ffmpeg loudnorm 到 -14 LUFS。
"""
import json
import sys
import wave

import numpy as np

ev = json.load(open(sys.argv[1], encoding="utf-8"))
OUT = sys.argv[2]
rng = np.random.default_rng(int(sys.argv[3]) if len(sys.argv) > 3 else 7)
SR = 48000
T = ev["seconds"]
N = int(round(T * SR))
mix = np.zeros((N, 2))
STEPS, NIGHT, END = ev["steps"], ev["night"], ev["ending"]
NAMES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def hz(n):
    sharp = 1 if "#" in n else 0
    return 440 * 2 ** ((NAMES[n[0]] + sharp + 12 * (int(n[-1]) + 1) - 69) / 12)


def put(t, sig, gain, pan=0.0):
    i = int(round(t * SR))
    if i >= N or i < 0:
        return
    sig = sig[: N - i] * gain
    mix[i: i + len(sig), 0] += sig * np.sqrt(0.5 * (1 - pan))
    mix[i: i + len(sig), 1] += sig * np.sqrt(0.5 * (1 + pan))


def zheng(f, dur=2.2, bright=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for k in range(1, 10):
        y += (bright ** (k - 1)) * (1 / k ** 1.05) * np.sin(2 * np.pi * f * k * (1 + 0.0003 * k * k) * t) * np.exp(-t * (1.6 + 1.1 * (k - 1)) * (f / 220) ** 0.3)
    y *= np.minimum(1, t / 0.002)
    return y / 2.4


def fan(f, dur=3.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t) + 0.15 * np.sin(4 * np.pi * f * t) * np.exp(-t * 3)) * np.minimum(1, t / 0.002) * np.exp(-t / 1.1)


def drum(dur=0.6, f0=95, hard=False):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = f0 * (1 + (1.2 if hard else 0.6) * np.exp(-t * 28))
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * (6 if hard else 11))
    y += rng.normal(0, 1, n) * np.exp(-t * 60) * (0.35 if hard else 0.15)
    return y


def muyu():
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    return (np.sin(2 * np.pi * 820 * t) + 0.5 * np.sin(2 * np.pi * 1340 * t)) * np.exp(-t * 38) * np.minimum(1, t / 0.0008)


def qing(f=880, dur=5.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for mul, amp, dec in ((1, 1, 2.2), (2.76, 0.5, 1.2), (5.4, 0.25, 0.6), (8.9, 0.12, 0.3)):
        y += amp * np.sin(2 * np.pi * f * mul * t) * np.exp(-t / dec)
    return y * np.minimum(1, t / 0.003) / 2


t = np.arange(N) / SR
fade = np.clip(t / 1.2, 0, 1) * np.clip((T - t) / 2.5, 0, 1)
drone = (0.6 * np.sin(2 * np.pi * hz("D2") * t) + 0.7 * np.sin(2 * np.pi * hz("A2") * t + 1.1)) * (0.8 + 0.2 * np.sin(2 * np.pi * 0.09 * t)) * fade * 0.03
mix += drone[:, None]

BEAT = 60 / 76
ROOTS = [("D3", "A3", "D4", "F#4", "A4", "F#4", "D4", "A3"),
         ("B2", "F#3", "B3", "D4", "F#4", "D4", "B3", "F#3"),
         ("E3", "B3", "E4", "F#4", "B4", "F#4", "E4", "B3"),
         ("A2", "E3", "A3", "B3", "E4", "B3", "A3", "E3")]
start = 0.3
bar = 0
tb = start
while tb < END + 0.2:
    pat = ROOTS[bar % 4]
    night = tb >= NIGHT
    for k, nme in enumerate(pat):
        te = tb + k * BEAT / 2
        if te >= END:
            break
        if night and k % 2:
            continue
        f = hz(nme) * (2 if night else 1)
        put(te, zheng(f, 1.8, 0.75), (0.20 if k == 0 else 0.13) * (1 if te > 1 else te), (k % 4 - 1.5) * 0.12)
    for beat in (0, 2):
        tt = tb + beat * BEAT
        if 1.0 < tt < END:
            put(tt, drum(), 0.16 if beat == 0 else 0.10, 0.0)
    tb += 4 * BEAT
    bar += 1

# 第 1 步：夯土两声
put(STEPS[0] + 0.25, drum(0.9, 70, True), 0.55)
put(STEPS[0] + 0.85, drum(0.9, 70, True), 0.5)
# 每一步：木鱼 + 泛音
HI = ["D5", "E5", "F#5", "A5", "B5", "D6", "E6", "F#6", "A6", "B5", "D5"]
for i, s in enumerate(STEPS):
    put(s, muyu(), 0.32, 0.3)
    put(s + 0.04, fan(hz(HI[i])), 0.12, -0.2)
# 天黑：磬
put(NIGHT, qing(hz("A5")), 0.28, 0.0)
# 拆开：上行泛音；装回：下行
for k, n in enumerate(("D5", "E5", "F#5", "A5", "B5", "D6")):
    put(STEPS[9] + 0.3 + 0.22 * k, fan(hz(n), 2.5), 0.11, -0.3 + 0.12 * k)
for k, n in enumerate(("D6", "B5", "A5", "F#5", "E5", "D5")):
    put(STEPS[10] + 0.3 + 0.26 * k, fan(hz(n), 2.5), 0.11, 0.3 - 0.12 * k)
# 结尾：D A D 琶音 + 磬
for k, n in enumerate(("D3", "A3", "D4", "F#4", "A4")):
    put(END + 0.05 + 0.11 * k, zheng(hz(n), 3.5, 0.8), 0.22, -0.3 + 0.15 * k)
put(END + 0.6, qing(hz("D5"), 4.5), 0.22, 0.0)

L = int(2.2 * SR)
tt = np.arange(L) / SR
ir = rng.normal(0, 1, (L, 2)) * np.exp(-tt * 6.9 / 2.2)[:, None]
ir[: int(0.02 * SR)] = 0
for ch in (0, 1):
    ir[:, ch] = np.convolve(ir[:, ch], np.ones(8) / 8, "same")
ir /= np.sqrt((ir ** 2).sum(axis=0))
M = 1 << int(np.ceil(np.log2(N + L)))
wet = np.stack([np.fft.irfft(np.fft.rfft(mix[:, ch], M) * np.fft.rfft(ir[:, ch], M), M)[:N] for ch in (0, 1)], axis=1)
out = mix + wet * 0.4
out = np.tanh(1.3 * out / np.abs(out).max()) / np.tanh(1.3)
out = out / np.abs(out).max() * 10 ** (-3 / 20)
with wave.open(OUT, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((np.clip(out, -1, 1) * 32767).astype("<i2").tobytes())
print(f"{OUT}: {T:.2f} s, steps {len(STEPS)}, night {NIGHT:.2f}, ending {END:.2f}")
