#!/usr/bin/env python3
"""细雨剑门演示片的配乐：numpy 合成，时间只读 tools/demo.cjs 写的 events.json。

用法（需要 numpy，例如 ~/.venv-kokoro/bin/python3）：
    python3 tools/demo-music.py <events.json> <输出.wav> [种子]

作曲意图：D 商调（D E G A C）五声，琴的味道。
- 开场立轴：低音 D、A 持续音轻轻铺底，两声琴。
- 入画：三个往上走的泛音，雨声淡入。
- 找路：慢旋律在中音区游走，句尾落在 D 或 A；长音带「吟」（揉弦颤音），部分音从下方「绰」上来。
- 找到一处：一声泛音，音高与游戏里四句各自的拨弦一致（D E G A，高八度），下面垫一声低音 D。
- 转回关楼：驴铃四响，雨势加大，旋律停，换一句下行的 A G E D。
- 结尾立轴：D、A、D 琶音收束，泛音 D 收尾，持续音与雨一起淡出。
混响用合成的立体声衰减噪声做卷积；母带同小螃蟹：tanh 轻驱动，采样峰值 -3 dBFS。
"""
import json
import sys
import wave

import numpy as np

ev = json.load(open(sys.argv[1], encoding="utf-8"))
OUT = sys.argv[2]
rng = np.random.default_rng(int(sys.argv[3]) if len(sys.argv) > 3 else 23)
SR = 48000
T = ev["seconds"]
N = int(round(T * SR))
mix = np.zeros((N, 2))

ENTER, OUTRO, TURN = ev["enter"], ev["outro"], ev["endTurn"]
FOUND = ev["found"]                                   # id -> seconds
LINE = {"path": 0, "far": 1, "back": 2, "gate": 3}
NAMES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def hz(n):
    return 440 * 2 ** ((NAMES[n[0]] + 12 * (int(n[1]) + 1) - 69) / 12)


SCALE = ["D3", "E3", "G3", "A3", "C4", "D4", "E4", "G4", "A4", "C5", "D5"]


def put(t, sig, gain, pan=0.0):
    i = int(round(t * SR))
    if i >= N or i < 0:
        return
    sig = sig[: N - i] * gain
    mix[i: i + len(sig), 0] += sig * np.sqrt(0.5 * (1 - pan))
    mix[i: i + len(sig), 1] += sig * np.sqrt(0.5 * (1 + pan))


def qin(f, dur=3.4, yin=False, chuo=False):
    """Plucked string, additive: slightly stretched partials, higher ones die faster; optional 吟 (vibrato) and 绰 (slide up)."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    bend = np.ones(n)
    if chuo:
        bend *= 2 ** (-(1 / 12) * np.clip(1 - t / 0.14, 0, 1) ** 2)
    if yin:
        bend *= 1 + 0.0035 * np.sin(2 * np.pi * 5.2 * t) * np.clip((t - 0.35) / 0.4, 0, 1) * np.exp(-t / 2.5)
    phase = 2 * np.pi * f * np.cumsum(bend) / SR
    y = np.zeros(n)
    for k in range(1, 9):
        y += (1 / k ** 1.15) * np.sin(k * (1 + 0.0004 * k * k) * phase) * np.exp(-t * (0.9 + 0.75 * (k - 1)) * (f / 220) ** 0.3)
    y *= np.minimum(1, t / 0.003)
    nz = rng.uniform(-1, 1, int(0.02 * SR)) * np.linspace(1, 0, int(0.02 * SR)) * 0.25   # pick noise
    y[: len(nz)] += np.convolve(nz, np.ones(6) / 6, "same")
    return y / 2.2


def fan(f, dur=4.5):
    """泛音 (harmonic): nearly pure, glassy, long."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * f * t) + 0.18 * np.sin(4 * np.pi * f * t) * np.exp(-t * 3)
    return y * np.minimum(1, t / 0.002) * np.exp(-t / 1.4)


def bell(t0):
    for hit in range(4):
        t = t0 + hit * (0.33 + rng.uniform(0, 0.12))
        base = 1180 + rng.uniform(0, 40)
        for mul, amp, dec in ((1, 0.09, 0.9), (2.71, 0.05, 0.5), (5.2, 0.025, 0.25)):
            n = int((dec + 0.05) * SR)
            tt = np.arange(n) / SR
            put(t, np.sin(2 * np.pi * base * mul * tt) * np.minimum(1, tt / 0.004) * np.exp(-tt / (dec / 5)), amp * (1 - hit * 0.15) * 2.4, 0.35)


# ---- drone: low D and A, slow breathing, fades in over the opening and out after the outro
t = np.arange(N) / SR
lvl = np.clip(t / 3.0, 0, 1) * np.clip((T - t) / 4.0, 0, 1)
# (D2 kept quiet: at full level it hummed under everything on the spectrogram, 2026-10-23)
drone = (0.45 * np.sin(2 * np.pi * hz("D2") * t) + 0.8 * np.sin(2 * np.pi * hz("A2") * t + 1.3) + 0.4 * np.sin(2 * np.pi * hz("D3") * t + 0.4)) \
    * (0.75 + 0.25 * np.sin(2 * np.pi * 0.07 * t)) * lvl * 0.032
mix += drone[:, None]

# ---- drizzle: band-limited noise from 入画, heavier during the ending turn, gone by the end
noise = rng.normal(0, 1, (N, 2))
spec = np.fft.rfft(noise, axis=0)
fr = np.fft.rfftfreq(N, 1 / SR)
spec *= ((fr > 500) & (fr < 5000))[:, None] * (1 / np.sqrt(np.maximum(fr, 1) / 1000))[:, None]
rain = np.fft.irfft(spec, n=N, axis=0)
rain /= np.abs(rain).max()
rlvl = np.clip((t - ENTER) / 2.5, 0, 1) * (1 + 0.6 * np.clip((t - TURN) / 2.0, 0, 1) * np.clip((OUTRO + 1 - t) / 2.0, 0.4, 1)) * np.clip((T - t) / 3.5, 0, 1)
mix += rain * (rlvl * 0.05)[:, None]

# ---- opening scroll: two notes
put(0.5, qin(hz("A3")), 0.28, -0.15)
put(1.6, qin(hz("D4"), yin=True), 0.26, 0.1)
# ---- 入画: rising harmonics
for k, n in enumerate(("D5", "E5", "A5")):
    put(ENTER + 0.05 + 0.28 * k, fan(hz(n)), 0.13, -0.3 + 0.3 * k)

# ---- found: harmonic at the game's note (D E G A) an octave up, with a low D under it
accents = []
for gid, ft in FOUND.items():
    note = ("D5", "E5", "G5", "A5")[LINE[gid]]
    put(ft, fan(hz(note), 5.0), 0.2, 0.25 if LINE[gid] % 2 else -0.25)
    put(ft + 0.02, qin(hz("D3"), 3.8), 0.24, 0.0)
    accents.append(ft)

# ---- wandering melody between 入画 and the ending turn
cur = SCALE.index("A3")
tm = ENTER + 2.4
phrase = 0
while tm < TURN - 1.2:
    if any(abs(tm - a) < 0.55 for a in accents):
        tm += 0.6
        continue
    step = rng.choice([-2, -1, -1, 1, 1, 2, 0])
    cur = int(np.clip(cur + step, 0, 8))
    phrase += 1
    end_of_phrase = phrase % 5 == 0
    if end_of_phrase:
        cur = SCALE.index(rng.choice(["D4", "A3", "D3"]))
    f = hz(SCALE[cur])
    long = end_of_phrase or rng.uniform() < 0.25
    put(tm, qin(f, 3.8 if long else 2.6, yin=long, chuo=rng.uniform() < 0.3), 0.22 if long else 0.17, rng.uniform(-0.25, 0.25))
    if rng.uniform() < 0.18:                          # occasional open fifth / octave below, a two-string sound
        put(tm + 0.01, qin(f / (1.5 if rng.uniform() < 0.5 else 2), 2.8), 0.12, rng.uniform(-0.2, 0.2))
    tm += (1.9 if end_of_phrase else rng.choice([0.85, 1.0, 1.25, 1.5]))

# ---- ending turn: donkey bell, then a falling line A G E D
bell(TURN + 0.1)
for k, n in enumerate(("A4", "G4", "E4", "D4")):
    put(TURN + 1.2 + 0.85 * k, qin(hz(n), 3.6, yin=(k == 3)), 0.2, 0.15 - 0.1 * k)

# ---- outro: rolled D A D, harmonic D on top
for k, n in enumerate(("D3", "A3", "D4")):
    put(OUTRO + 0.25 + 0.09 * k, qin(hz(n), 4.5, yin=(k == 2)), 0.22, -0.2 + 0.2 * k)
put(OUTRO + 0.6, fan(hz("D5"), 5.5), 0.16, 0.0)

# ---- reverb: synthetic stereo hall, convolved
L = int(2.6 * SR)
tt = np.arange(L) / SR
ir = rng.normal(0, 1, (L, 2)) * np.exp(-tt * 6.9 / 2.6)[:, None]
ir[: int(0.02 * SR)] = 0
for ch in (0, 1):                                      # darken the tail
    ir[:, ch] = np.convolve(ir[:, ch], np.ones(8) / 8, "same")
ir /= np.sqrt((ir ** 2).sum(axis=0))
M = 1 << int(np.ceil(np.log2(N + L)))
wet = np.stack([np.fft.irfft(np.fft.rfft(mix[:, ch], M) * np.fft.rfft(ir[:, ch], M), M)[:N] for ch in (0, 1)], axis=1)
out = mix + wet * 0.55

# ---- master: gentle tanh drive, -3 dBFS sample peak
out = np.tanh(1.3 * out / np.abs(out).max()) / np.tanh(1.3)
out = out / np.abs(out).max() * 10 ** (-3 / 20)
with wave.open(OUT, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((np.clip(out, -1, 1) * 32767).astype("<i2").tobytes())
print(f"{OUT}: {T:.2f} s, events enter {ENTER:.2f} found {', '.join(f'{k} {v:.2f}' for k, v in FOUND.items())} turn {TURN:.2f} outro {OUTRO:.2f}")
