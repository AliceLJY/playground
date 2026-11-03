#!/usr/bin/env python3
"""像素连连看演示片配乐：numpy 离线合成的轻快芯片乐，时间全部读 tools/record.cjs 写的 events.json。

用法（需要 numpy，例如 ~/.venv-kokoro/bin/python3）：
    python3 tools/demo-music.py <events.json> <输出.wav>

- 段落取 events 的 sections：title 慢琶音铺底；intro/intro5 上行小过门；play 112 BPM 主律动（方波旋律、三角波低音、噪声鼓）；
  play5 同一律动换到 A 小调更紧一点；ff 快进时双倍踩镲；photo/final 一声号角接大和弦；outro 署名页轻琶音，最后 1 秒淡出。
- 重音取 marks：每次消牌一声拨弦，连着消就沿五声音阶往上走；认错一声下行「嘟嘟」；提示一串亮晶晶；剪辑点一声扫频；
  署名页 1.8 秒、2.8 秒（盖印章、按煤球）各一声落定音。
- 母带：tanh 轻驱动，峰值 -3 dBFS；响度另用 ffmpeg loudnorm 单独做（别在混流时带 loudnorm 加 -shortest，会把结尾吃掉）。
"""
import json
import sys
import wave

import numpy as np

ev = json.load(open(sys.argv[1], encoding="utf-8"))
OUT = sys.argv[2]
rng = np.random.default_rng(11)
SR = 44100
T = ev["seconds"]
N = int(round(T * SR))
mix = np.zeros((N, 2))
SEC = sorted((s["t"], s["kind"]) for s in ev["sections"])
sections = [(t0, SEC[k + 1][0] if k + 1 < len(SEC) else T, kind) for k, (t0, kind) in enumerate(SEC)]
marks = lambda name: [m for m in ev["marks"] if m["name"] == name]
BPM = 112
BEAT = 60 / BPM
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


def env(n, a=0.005, r=0.12):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / r)


def tone(f, dur, kind="sq", a=0.004, r=0.15):
    n = int(dur * SR)
    t = np.arange(n) / SR
    ph = (f * t) % 1
    if kind == "sq":
        w = np.where(ph < 0.25, 1.0, -1.0) * 0.6   # 25% 方波，软一点
    elif kind == "tri":
        w = 2 * np.abs(2 * ph - 1) - 1
    else:
        w = np.sin(2 * np.pi * f * t)
    return w * env(n, a, r)


def noise(dur, r):
    n = int(dur * SR)
    return rng.uniform(-1, 1, n) * env(n, 0.001, r)


def kick(t):
    n = int(0.18 * SR)
    tt = np.arange(n) / SR
    f = 110 * np.exp(-tt * 28) + 45
    put(t, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 18), 0.55)


PROG = {  # 每小节和弦根音与三和弦（C 大调 / A 小调）
    "major": [("C", ["C4", "E4", "G4"]), ("A", ["A3", "C4", "E4"]), ("F", ["F3", "A3", "C4"]), ("G", ["G3", "B3", "D4"])],
    "minor": [("A", ["A3", "C4", "E4"]), ("F", ["F3", "A3", "C4"]), ("C", ["C4", "E4", "G4"]), ("G", ["G3", "B3", "D4"])],
}
MEL = ["E5", "G5", "A5", "G5", "E5", "D5", "C5", "D5", "E5", "G5", "C6", "A5", "G5", "E5", "D5", "E5"]


def groove(t0, t1, mode="major", hats=1):
    b = 0
    t = t0
    while t < t1 - 0.01:
        bar = int(b // 4) % 4
        root, chord = PROG[mode][bar]
        beat = b % 4
        if beat in (0, 2):
            kick(t)
        if beat in (1, 3):
            put(t, noise(0.12, 0.05), 0.16, 0.1)                      # 军鼓（噪声）
        for h in range(2 * hats):
            put(t + h * BEAT / (2 * hats), noise(0.04, 0.012), 0.07, 0.3)  # 踩镲
        put(t, tone(hz(root + "2"), BEAT * 0.95, "tri", r=0.35), 0.32)      # 三角波低音
        if beat == 0:
            for k, nn in enumerate(chord):
                put(t, tone(hz(nn), BEAT * 3.8, "sin", a=0.02, r=0.9), 0.06, -0.3 + 0.3 * k)
        mel = MEL[int(b * 2) % len(MEL)]
        put(t, tone(hz(mel), BEAT * 0.45, "sq", r=0.1), 0.085, -0.15)
        if b % 2 == 1:
            put(t + BEAT / 2, tone(hz(MEL[(int(b * 2) + 1) % len(MEL)]), BEAT * 0.4, "sq", r=0.08), 0.06, 0.15)
        b += 1
        t = t0 + b * BEAT


def arps(t0, t1, notes, step, gain):
    k = 0
    t = t0
    while t < t1 - 0.01:
        put(t, tone(hz(notes[k % len(notes)]), step * 1.6, "tri", r=0.25), gain, (-0.4, 0.4)[k % 2])
        k += 1
        t = t0 + k * step


def riser(t0, t1):
    n = int((t1 - t0) * SR)
    if n <= 0:
        return
    tt = np.arange(n) / SR
    f = 300 + 900 * (tt / tt[-1]) ** 2
    put(t0, np.sin(2 * np.pi * np.cumsum(f) / SR) * (tt / tt[-1]) * 0.6, 0.08)
    arps(t0, t1, ["C5", "E5", "G5", "C6"], BEAT / 2, 0.08)


def fanfare(t, big=False):
    for k, nn in enumerate(["G4", "C5", "E5", "G5"]):
        put(t + k * 0.09, tone(hz(nn), 0.35, "sq", r=0.2), 0.11)
    for k, nn in enumerate(["C4", "E4", "G4", "C5"] + (["E5"] if big else [])):
        put(t + 0.36, tone(hz(nn), 2.6, "sin", a=0.03, r=1.4), 0.1, -0.3 + 0.15 * k)
    put(t + 0.36, noise(1.2, 0.4), 0.05)
    kick(t + 0.36)


for t0, t1, kind in sections:
    if kind == "title":
        arps(t0, t1, ["C4", "G4", "E5", "G4"], BEAT / 2, 0.09)
        put(t0, tone(hz("C3"), t1 - t0, "tri", a=0.3, r=3), 0.18)
    elif kind in ("intro", "intro5"):
        riser(t0, t1)
    elif kind in ("play", "play5b"):
        groove(t0, t1, "major")
    elif kind == "play5":
        groove(t0, t1, "minor")
    elif kind == "ff":
        groove(t0, t1, "major", hats=2)
    elif kind in ("photo", "final"):
        fanfare(t0, big=kind == "final")
        arps(t0 + 0.9, t1, ["C5", "E5", "G5", "E5"], BEAT / 2, 0.06)
    elif kind == "outro":
        arps(t0, t1, ["C4", "G4", "E5", "G4", "A3", "E4", "C5", "E4"], BEAT, 0.07)
        put(t0, tone(hz("C3"), t1 - t0, "tri", a=0.2, r=4), 0.15)
        for dt in (1.8, 2.8):  # 署名页盖印章、按煤球
            kick(t0 + dt)
            put(t0 + dt, tone(hz("G5" if dt < 2 else "C6"), 0.4, "sin", r=0.18), 0.16)
    elif kind == "cut":
        n = int(0.35 * SR)
        tt = np.arange(n) / SR
        put(t0 - 0.2, np.sin(2 * np.pi * np.cumsum(1400 - 3200 * tt) / SR) * np.exp(-tt * 6), 0.06)
        put(t0 - 0.2, noise(0.35, 0.2), 0.05)

# 消牌：一声拨弦，连着消就沿五声音阶往上走（隔久了回到起点）
PENTA = ["C5", "D5", "E5", "G5", "A5", "C6", "D6", "E6"]
k, last = 0, -9
for m in marks("match"):
    k = k + 1 if m["t"] - last < 2.0 else 0
    last = m["t"]
    f = hz(PENTA[min(k, len(PENTA) - 1)])
    put(m["t"], tone(f, 0.25, "sin", a=0.002, r=0.09) + 0.4 * tone(f * 2, 0.25, "sin", a=0.002, r=0.05), 0.2 if not m.get("fast") else 0.12, 0.2)
for m in marks("wrong"):
    put(m["t"], tone(hz("E4"), 0.14, "sq", r=0.07), 0.13)
    put(m["t"] + 0.15, tone(hz("C4"), 0.2, "sq", r=0.1), 0.13)
for m in marks("hint"):
    for j, nn in enumerate(["C6", "E6", "G6", "C7"]):
        put(m["t"] + j * 0.06, tone(hz(nn), 0.3, "sin", r=0.12), 0.07, -0.3 + 0.2 * j)

# 母带：结尾 1 秒淡出，tanh 轻驱动，峰值 -3 dBFS
fade = int(1.0 * SR)
mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
mix = np.tanh(mix * 1.4)
mix *= 10 ** (-3 / 20) / max(1e-9, np.abs(mix).max())
with wave.open(OUT, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype("<i2").tobytes())
print(f"{OUT}: {T:.2f} 秒，{len(marks('match'))} 次消牌")
