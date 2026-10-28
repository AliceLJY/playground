#!/usr/bin/env python3
"""凸透镜成像演示片的配乐：numpy 合成，时间只读 tools/record.cjs 写的 <片>.events.json。

用法（需要 numpy，例如 ~/.venv-kokoro/bin/python3）：
    python3 tools/demo-music.py <events.json> <输出.wav> <总时长秒> [种子]
总时长包括接在后面的署名页：音乐一直垫到片尾（署名页底下要有音乐）。

作曲意图：C 宫调五声（C D E G A），木琴拨弦的味道，88 BPM 轻快往前走，像在实验室里一边动手一边想。
- 底：低音 C、G 持续音；每小节一个和弦根音（C A F G 循环），八分音符琶音，只用五声音。
- 开场主线问题：一声颤音铃，提出问题。
- 每找到一种情况：一声钟琴，音高一次比一次高（焦点、缩小、等大、放大、不成像、虚像），下面垫一个低音。
- 焦点上「不成像」：琶音停一小节，只剩持续音和一个悬着的四度，等它落空。
- 用眼睛看到虚像：一串往上走的泛音。
- 揭晓：C 大和弦琶音收束，音乐转成慢的长音一直垫到署名页结束，最后淡出。
混响同 nanchan-temple/tools/demo-music.py；母带 tanh 轻驱动，响度另用 ffmpeg loudnorm 到 -14 LUFS。
"""
import json
import sys
import wave

import numpy as np

ev = json.load(open(sys.argv[1], encoding="utf-8"))
OUT = sys.argv[2]
T = float(sys.argv[3])
rng = np.random.default_rng(int(sys.argv[4]) if len(sys.argv) > 4 else 11)
SR = 48000
N = int(round(T * SR))
mix = np.zeros((N, 2))
FOUND = ev["found"]
MARK = {m["label"]: m["t"] for m in ev["marks"]}
ANSWER = FOUND.get("near", MARK["answer"]) + 2.4
NAMES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def hz(n):
    return 440 * 2 ** ((NAMES[n[0]] + 12 * (int(n[-1]) + 1) - 69) / 12)


def put(t, sig, gain, pan=0.0):
    i = int(round(t * SR))
    if i >= N or i < 0:
        return
    sig = sig[: N - i] * gain
    mix[i: i + len(sig), 0] += sig * np.sqrt(0.5 * (1 - pan))
    mix[i: i + len(sig), 1] += sig * np.sqrt(0.5 * (1 + pan))


def mallet(f, dur=1.4):   # marimba-like: fundamental plus the 4th partial, quick decay
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * f * t) * np.exp(-t * 3.2) + 0.35 * np.sin(2 * np.pi * f * 3.93 * t) * np.exp(-t * 14)
    return y * np.minimum(1, t / 0.0015)


def glock(f, dur=3.0):    # glockenspiel: bright, long ring
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for mul, amp, dec in ((1, 1, 1.3), (2.76, 0.4, 0.5), (5.4, 0.18, 0.2)):
        y += amp * np.sin(2 * np.pi * f * mul * t) * np.exp(-t / dec)
    return y * np.minimum(1, t / 0.002) / 1.6


def pad(f, dur):          # soft sustained tone for the slow ending
    n = int(dur * SR)
    t = np.arange(n) / SR
    env = np.minimum(1, t / 0.8) * np.minimum(1, (dur - t) / 1.2)
    return (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t + 0.5)) * np.clip(env, 0, 1) * (1 + 0.04 * np.sin(2 * np.pi * 4.5 * t))


def trill(f, dur=1.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    g = np.sin(2 * np.pi * f * t) * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 9 * t))) + np.sin(2 * np.pi * f * 9 / 8 * t) * (0.5 - 0.5 * np.sign(np.sin(2 * np.pi * 9 * t)))
    return g * np.exp(-t * 1.6) * np.minimum(1, t / 0.003)


t = np.arange(N) / SR
fade = np.clip(t / 1.5, 0, 1) * np.clip((T - t) / 3.0, 0, 1)
drone = (0.6 * np.sin(2 * np.pi * hz("C2") * t) + 0.6 * np.sin(2 * np.pi * hz("G2") * t + 0.7)) * (0.85 + 0.15 * np.sin(2 * np.pi * 0.07 * t)) * fade * 0.028
mix += drone[:, None]

BEAT = 60 / 88
BARS = [("C3", "G3", "C4", "E4", "G4", "E4", "C4", "G3"),
        ("A2", "E3", "A3", "C4", "E4", "C4", "A3", "E3"),
        ("F2", "C3", "F3", "A3", "C4", "A3", "F3", "C3"),
        ("G2", "D3", "G3", "A3", "D4", "A3", "G3", "D3")]
focal_t = FOUND.get("focal")
rest = (MARK["focal"] + 1.2, (focal_t or MARK["focal"] + 4) + 0.2)   # the arpeggio holds its breath while nothing sharpens
tb, bar = 0.4, 0
while tb < ANSWER:
    pat = BARS[bar % 4]
    for k, nme in enumerate(pat):
        te = tb + k * BEAT / 2
        if te >= ANSWER:
            break
        if rest[0] <= te < rest[1]:
            continue
        put(te, mallet(hz(nme)), (0.19 if k == 0 else 0.12) * min(1, te / 2), (k % 4 - 1.5) * 0.14)
    tb += 4 * BEAT
    bar += 1

put(0.5, trill(hz("G5")), 0.10, 0.2)                      # the opening question
if "guess" in MARK:
    put(MARK["guess"] + 1.9, mallet(hz("E5"), 0.8), 0.18, 0.3)
ORDER = ["focus", "far", "two", "mid", "focal", "near"]
HI = {"focus": "C5", "far": "D5", "two": "E5", "mid": "G5", "focal": "A5", "near": "C6"}
for k in ORDER:
    if k not in FOUND:
        continue
    s = FOUND[k]
    if k == "focal":                                      # a suspended fourth that does not resolve
        put(s, glock(hz("F5"), 3.5), 0.16, -0.2)
        put(s + 0.03, glock(hz("C5"), 3.5), 0.12, 0.2)
        continue
    put(s, glock(hz(HI[k])), 0.22, 0.15)
    put(s + 0.02, mallet(hz("C3"), 1.8), 0.20, 0.0)
if "near" in FOUND:                                       # looking through the lens: rising harmonics
    for i, n in enumerate(("C5", "D5", "E5", "G5", "A5", "C6")):
        put(FOUND["near"] + 0.35 + 0.16 * i, glock(hz(n), 2.2), 0.08, -0.3 + 0.12 * i)
# the answer: C major arpeggio, then slow long tones under the rule and the signature page
for i, n in enumerate(("C3", "G3", "C4", "E4", "G4", "C5")):
    put(ANSWER + 0.12 * i, mallet(hz(n), 2.5), 0.22, -0.3 + 0.12 * i)
slow = [("C3", "E4", "G4"), ("A2", "E4", "A4"), ("F2", "C4", "A4"), ("G2", "D4", "G4")]
tb, i = ANSWER + 0.6, 0
while tb < T - 0.5:
    dur = min(4 * BEAT * 2, T - tb + 1.5)
    for n in slow[i % 4]:
        put(tb, pad(hz(n), dur), 0.045 if n[-1] in "23" else 0.03, 0.0)
    put(tb, mallet(hz(slow[i % 4][2]) * 2, 1.6), 0.07, 0.25)
    tb += 4 * BEAT * 2
    i += 1

L = int(2.0 * SR)
tt = np.arange(L) / SR
ir = rng.normal(0, 1, (L, 2)) * np.exp(-tt * 6.9 / 2.0)[:, None]
ir[: int(0.02 * SR)] = 0
for ch in (0, 1):
    ir[:, ch] = np.convolve(ir[:, ch], np.ones(8) / 8, "same")
ir /= np.sqrt((ir ** 2).sum(axis=0))
M = 1 << int(np.ceil(np.log2(N + L)))
wet = np.stack([np.fft.irfft(np.fft.rfft(mix[:, ch], M) * np.fft.rfft(ir[:, ch], M), M)[:N] for ch in (0, 1)], axis=1)
out = mix + wet * 0.35
out *= np.clip((T - t) / 3.0, 0, 1)[:, None]
out = np.tanh(1.3 * out / np.abs(out).max()) / np.tanh(1.3)
out = out / np.abs(out).max() * 10 ** (-3 / 20)
with wave.open(OUT, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((np.clip(out, -1, 1) * 32767).astype("<i2").tobytes())
print(f"{OUT}: {T:.2f} s, finds {', '.join(f'{k} {FOUND[k]:.1f}' for k in ORDER if k in FOUND)}, answer {ANSWER:.1f}")
