#!/usr/bin/env python3
"""西关大屋演示片的配乐：numpy 合成，时间只读 tools/demo.cjs 写的 events.json。

用法（需要 numpy，例如 ~/.venv-kokoro/bin/python3）：
    python3 tools/demo-music.py <events.json> <输出.wav> [种子]

作曲意图：G 宫五声，广东音乐的明亮味道，96 BPM 往上走：高胡（拉弦、揉音）唱一条原创旋律，扬琴轻轻弹上行分解和弦，和弦只用大调（G C D G ｜ G C G D），每两小节一声碰铃。
- 10-27 第一版用了低音持续嗡声、短促琶音、满拍梆子和一个小调和弦，Alice 听成「日本鬼子进村那种鬼鬼祟祟的感觉」，这几样都去掉了。
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


# ---------- 底：明亮、连贯，往上走（10-27 第一版低音嗡声＋短促琶音＋满拍梆子，被听成「鬼子进村」那种鬼祟感，改掉） ----------
def gaohu(f, dur):
    """高胡：拉弦，60 ms 起音、带 5.5 Hz 揉音，音头稍亮。"""
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


BPM = 96
BEAT = 60 / BPM
# 全用大调和弦：G C D G ｜ G C G D
CHORDS = [("G3", "B3", "D4"), ("C4", "E4", "G4"), ("D4", "F#4", "A4"), ("G3", "B3", "D4"),
          ("G3", "B3", "D4"), ("C4", "E4", "G4"), ("G3", "B3", "D4"), ("D4", "F#4", "A4")]
BASS = ["G2", "C3", "D3", "G2", "G2", "C3", "G2", "D3"]
# 原创旋律，G 宫五声，一句一句往上走（每小节四拍，元组：音名、拍数）
MELODY = [[("D5", 1), ("E5", 1), ("G5", 1), ("A5", 1)], [("B5", 1.5), ("A5", 0.5), ("G5", 1), ("E5", 1)],
          [("D5", 1), ("E5", 1), ("G5", 1), ("B5", 1)], [("A5", 3), ("G5", 1)],
          [("G5", 1), ("A5", 1), ("B5", 1), ("D6", 1)], [("E6", 1.5), ("D6", 0.5), ("B5", 1), ("A5", 1)],
          [("G5", 1), ("A5", 1), ("B5", 0.5), ("A5", 0.5), ("G5", 1)], [("G5", 4)]]
tb, bar = 0.2, 0
while tb < END - 0.05:
    ch, mel = CHORDS[bar % 8], MELODY[bar % 8]
    # 扬琴：柔和的上行分解和弦，每拍两个音，力度轻
    notes = [ch[0], ch[1], ch[2], ch[1]] * 2
    for k, nme in enumerate(notes):
        te = tb + k * BEAT / 2
        if te >= END:
            break
        put(te, yangqin(hz(nme) * 2, 1.8, 0.7), (0.10 if k % 4 == 0 else 0.065) * min(1, te / 1.0), (k % 4 - 1.5) * 0.18)
    # 低音：只在第一拍轻轻一下，不持续
    put(tb, yangqin(hz(BASS[bar % 8]), 2.2, 0.5), 0.12, -0.1)
    # 高胡旋律（开头一小节只有伴奏，第二小节起进）
    if bar >= 1:
        tt = tb
        for nme, beats in mel:
            d = beats * BEAT
            if tt + 0.05 < END:
                put(tt, gaohu(hz(nme), min(d, END - tt) * 0.96), 0.13, 0.15)
            tt += d
    if bar % 2 == 0 and tb > 0.5:
        put(tb, bell(), 0.035, 0.4)
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
