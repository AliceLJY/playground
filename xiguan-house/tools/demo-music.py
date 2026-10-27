#!/usr/bin/env python3
"""西关大屋演示片的配乐：numpy 合成，时间只读 tools/demo.cjs 写的 events.json。

用法（需要 numpy，例如 ~/.venv-kokoro/bin/python3）：
    python3 tools/demo-music.py <events.json> <输出.wav> [种子]

作曲意图：G 徵调五声（G A B D E），扬琴的味道（两根弦微微失谐、亮的起音、金属泛音），84 BPM 轻快往前走。
- 底：低音 G、D 持续音；每小节一个和弦根音（G E C D 循环），八分音符扬琴琶音；每拍一声轻梆子。
- 卡点全部由模型时间线推出来：events.json 里记了每次推开 / 合上的起点、方向、速度，加上 model.js 的 TIMELINE。
  推开时：趟栊滑进墙里一段木头摩擦声；大门贴墙、前坡扣上、三面墙落地各一声闷响（落在「碰到」那一刻，即每段的 78%）；
  屋面掀起一声风；满洲窗推到顶一串玻璃清响。合上时：每样东西回到原位一声轻木鱼。
- 落款页：一声扫音，盖章、按手印各一声闷鼓加落定音，收在 G 的琶音上。
混响与母带同 nanchan-temple/tools/demo-music.py；响度另用 ffmpeg loudnorm 到 -14 LUFS。
"""
import json
import sys
import wave

import numpy as np

ev = json.load(open(sys.argv[1], encoding="utf-8"))
OUT = sys.argv[2]
rng = np.random.default_rng(int(sys.argv[3]) if len(sys.argv) > 3 else 11)
SR = 48000
T = ev["seconds"]
N = int(round(T * SR))
mix = np.zeros((N, 2))
TL = ev["timeline"]
TT = ev["T"]
END = ev["end"]
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


def yangqin(f, dur=1.6, bright=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for det in (1.0, 1.0025):
        for k in range(1, 8):
            y += (bright ** (k - 1)) * (1 / k ** 1.2) * np.sin(2 * np.pi * f * det * k * (1 + 0.0006 * k * k) * t) * np.exp(-t * (2.4 + 1.6 * (k - 1)) * (f / 300) ** 0.25)
    y += rng.normal(0, 1, n) * np.exp(-t * 300) * 0.25  # 琴竹敲弦的那一下
    return y * np.minimum(1, t / 0.0015) / 4.2


def bangzi():
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    return (np.sin(2 * np.pi * 1650 * t) + 0.4 * np.sin(2 * np.pi * 2900 * t)) * np.exp(-t * 70)


def muyu(f=820):
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 1.63 * t)) * np.exp(-t * 38) * np.minimum(1, t / 0.0008)


def thump(f0=62, dur=0.7, hard=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = f0 * (1 + 0.9 * np.exp(-t * 30))
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7)
    y += rng.normal(0, 1, n) * np.exp(-t * 45) * 0.25 * hard
    return y


def slide(dur):
    """木头在槽里滑：带通噪声，音高跟着速度往上再落下。"""
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = rng.normal(0, 1, n)
    env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.5
    # 简单的一阶低通 + 差分，做出木头的「沙沙」
    lp = np.zeros(n)
    a = 0.08
    for i in range(1, n):
        lp[i] = lp[i - 1] + a * (noise[i] - lp[i - 1])
    rough = 1 + 0.6 * np.sin(2 * np.pi * 23 * t) * env
    return lp * env * rough * 3.0


def whoosh(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = rng.normal(0, 1, n)
    lp = np.zeros(n)
    for i in range(1, n):
        a = 0.02 + 0.10 * np.sin(np.pi * t[i] / dur)
        lp[i] = lp[i - 1] + a * (noise[i] - lp[i - 1])
    return lp * np.sin(np.pi * t / dur) ** 2 * 2.2


def glass(f=2093, dur=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for mul, amp, dec in ((1, 1, 0.9), (2.32, 0.5, 0.5), (4.25, 0.3, 0.3), (6.8, 0.15, 0.18)):
        y += amp * np.sin(2 * np.pi * f * mul * t) * np.exp(-t / dec)
    return y * np.minimum(1, t / 0.002) / 2


def qing(f=880, dur=4.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for mul, amp, dec in ((1, 1, 2.2), (2.76, 0.5, 1.2), (5.4, 0.25, 0.6)):
        y += amp * np.sin(2 * np.pi * f * mul * t) * np.exp(-t / dec)
    return y * np.minimum(1, t / 0.003) / 2


def at(run, s):
    """时间线上的 s 秒，在视频里是第几秒。"""
    if run["dir"] == "open":
        return run["t"] + s / run["speed"]
    return run["t"] + (TT - s) / run["speed"]


# ---------- 底 ----------
t = np.arange(N) / SR
fade = np.clip(t / 1.0, 0, 1) * np.clip((T - t) / 2.0, 0, 1)
drone = (0.6 * np.sin(2 * np.pi * hz("G2") * t) + 0.6 * np.sin(2 * np.pi * hz("D3") * t + 0.7)) * (0.8 + 0.2 * np.sin(2 * np.pi * 0.11 * t)) * fade * 0.028
mix += drone[:, None]

BEAT = 60 / 84
ROOTS = [("G3", "D4", "G4", "B4", "D5", "B4", "G4", "D4"),
         ("E3", "B3", "E4", "G4", "B4", "G4", "E4", "B3"),
         ("C4", "G4", "C5", "E5", "G5", "E5", "C5", "G4"),
         ("D3", "A3", "D4", "E4", "A4", "E4", "D4", "A3")]
tb, bar = 0.25, 0
while tb < END + 0.1:
    pat = ROOTS[bar % 4]
    for k, nme in enumerate(pat):
        te = tb + k * BEAT / 2
        if te >= END:
            break
        put(te, yangqin(hz(nme), 1.4, 0.8), (0.17 if k == 0 else 0.11) * min(1, te / 1.2), (k % 4 - 1.5) * 0.15)
    for beat in range(4):
        tt = tb + beat * BEAT
        if 0.8 < tt < END:
            put(tt, bangzi(), 0.07 if beat % 2 else 0.11, 0.35)
    tb += 4 * BEAT
    bar += 1

# ---------- 卡点 ----------
LAND = ["doors", "roofF", "wallF", "wallL", "wallR"]
for run in ev["runs"]:
    sp = run["speed"]
    if run["dir"] == "open":
        a, b, _ = TL["tang"]
        put(at(run, a), slide((b - a) / sp * 0.85), 0.20 if sp == 1 else 0.14, -0.2)
        for key in LAND:
            a, b, _ = TL[key]
            hit = a + 0.78 * (b - a)
            heavy = key.startswith("wall")
            put(at(run, hit), thump(55 if heavy else 75, 0.8, 1.0 if heavy else 0.6), 0.42 if heavy else 0.30, {"wallL": -0.5, "wallR": 0.5}.get(key, 0))
            if key == "doors":
                put(at(run, hit) + 0.01, muyu(560), 0.18, 0.1)
        a, b, _ = TL["roofB"]
        put(at(run, a), whoosh(min(1.6, (b - a) / sp)), 0.20, 0.1)
        a, b, _ = TL["sash"]
        for k, f in enumerate((hz("D7"), hz("G6"), hz("B6"))):
            put(at(run, a + 0.8 * (b - a)) + 0.07 * k, glass(f), 0.07, 0.4 - 0.2 * k)
    else:
        for k, key in enumerate(("sash", "wallR", "wallL", "wallF", "roofB", "roofF", "doors", "tang")):
            a, b, _ = TL[key]
            put(at(run, a), muyu(760 + 40 * k), 0.14, (k % 3 - 1) * 0.3)
for c in ev["clicks"]:
    put(c, muyu(980), 0.22, 0.25)

# ---------- 落款页 ----------
put(END, whoosh(1.2), 0.18, 0.0)
for k, n in enumerate(("G3", "D4", "G4", "B4", "D5")):
    put(END + 0.05 + 0.12 * k, yangqin(hz(n), 3.0, 0.85), 0.20, -0.3 + 0.15 * k)
put(ev["seal"], thump(70, 0.8, 1.2), 0.45, 0.0)
put(ev["seal"] + 0.02, muyu(640), 0.25, 0.0)
put(ev["thumb"], thump(85, 0.6, 0.8), 0.35, 0.1)
put(ev["thumb"] + 0.05, qing(hz("G5")), 0.20, 0.0)

# ---------- 混响与母带 ----------
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
out = np.tanh(1.3 * out / np.abs(out).max()) / np.tanh(1.3)
out = out / np.abs(out).max() * 10 ** (-3 / 20)
with wave.open(OUT, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((out * 32767).astype("<i2").tobytes())
print(f"wrote {OUT}: {T:.2f}s")
