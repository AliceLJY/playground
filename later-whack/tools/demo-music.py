#!/usr/bin/env python3
"""办公室打地鼠演示片配乐：numpy 离线合成的活泼可爱小调子，时间全部读 tools/record.cjs 写的 events.json。

用法（需要 numpy，例如 ~/.venv-kokoro/bin/python3）：
    python3 tools/demo-music.py <events.json> <输出.wav>

- title：八音盒上行琶音。
- play / ff / finale：140 BPM，C 大调 C–Am–F–G，方波主旋律（跳音）、三角波「嘭嚓」低音、轻鼓；快进那段加沙锤十六分、旋律升八度；
  最后几秒（finale）回到原样，倒数时鼓点加密。
- result：小号角上行 + 大和弦「下班！」。outro：署名页底下垫八音盒琶音，最后 1.2 秒淡出。
- 重音取 marks：每次敲中一声木琴，连击越高越往五声音阶上走；敲错蓝牌「嘟—嘟」下行；敲到绿牌一声弹簧「啵嘤」。
- 母带：tanh 轻驱动，峰值 -3 dBFS；响度另用 ffmpeg loudnorm 单独做。
"""
import json
import sys
import wave

import numpy as np

ev = json.load(open(sys.argv[1], encoding="utf-8"))
OUT = sys.argv[2]
rng = np.random.default_rng(7)
SR = 44100
T = ev["seconds"]
N = int(round(T * SR))
mix = np.zeros((N, 2))
SEC = sorted((s["t"], s["kind"]) for s in ev["sections"])
spans = {kind: (t0, SEC[k + 1][0] if k + 1 < len(SEC) else T) for k, (t0, kind) in enumerate(SEC)}
marks = lambda name: [m for m in ev["marks"] if m["name"] == name]
BPM = 140
BEAT = 60 / BPM
E8 = BEAT / 2
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


def env(n, a=0.004, r=0.12):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / r)


def tone(f, dur, kind="sq", a=0.004, r=0.12, bend=0.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    fr = f * (1 + bend * np.exp(-t * 30))
    ph = np.cumsum(fr) / SR % 1
    if kind == "sq":
        w = np.where(ph < 0.25, 1.0, -1.0) * 0.55
    elif kind == "tri":
        w = 2 * np.abs(2 * ph - 1) - 1
    elif kind == "bell":   # 八音盒 / 木琴：基音 + 高泛音
        w = np.sin(2 * np.pi * ph) + 0.35 * np.sin(2 * np.pi * (3.0 * np.cumsum(fr) / SR)) * np.exp(-t * 18)
    else:
        w = np.sin(2 * np.pi * ph)
    return w * env(n, a, r)


def noise(dur, r):
    n = int(dur * SR)
    return rng.uniform(-1, 1, n) * env(n, 0.001, r)


def kick(t, g=0.5):
    n = int(0.16 * SR)
    tt = np.arange(n) / SR
    f = 130 * np.exp(-tt * 30) + 50
    put(t, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 20), g)


def snare(t, g=0.16):
    put(t, noise(0.12, 0.05), g, 0.1)
    put(t, tone(220, 0.08, "sin", r=0.04), g * 0.6)


def hat(t, g=0.05, pan=0.3):
    put(t, noise(0.03, 0.01), g, pan)


CHORDS = [("C3", ["C4", "E4", "G4"]), ("A2", ["A3", "C4", "E4"]), ("F2", ["F3", "A3", "C4"]), ("G2", ["G3", "B3", "D4"])]
# 每小节 8 个八分音符；None = 休止。蹦蹦跳跳的小调子，第 4、8 小节收一下。
MELODY = [
    ["E5", "G5", "C6", None, "G5", None, "E5", "G5"],
    ["A5", None, "G5", "E5", "C5", None, "D5", None],
    ["F5", "A5", "C6", None, "A5", None, "F5", "A5"],
    ["G5", None, "B5", None, "D6", None, None, None],
    ["E5", "G5", "C6", None, "D6", "C6", "A5", "G5"],
    ["A5", None, "C6", "A5", "G5", None, "E5", None],
    ["F5", None, "A5", "G5", "F5", None, "D5", "E5"],
    ["C5", None, "G4", None, "C5", None, None, None],
]


def groove(t0, t1, up=False, busy=False):
    """t0 起按小节铺满到 t1：低音嘭嚓、和弦跳音、旋律、鼓。"""
    bar = 0
    t = t0
    while t < t1 - 1e-6:
        root, triad = CHORDS[bar % 4]
        mel = MELODY[bar % 8]
        for b in range(4):
            tb = t + b * BEAT
            if tb >= t1:
                break
            # 嘭（根音）— 嚓（和弦跳音）
            put(tb, tone(hz(root), BEAT * 0.45, "tri", r=0.16), 0.30)
            for k, nn in enumerate(triad):
                put(tb + E8, tone(hz(nn), E8 * 0.6, "sq", r=0.05), 0.045, -0.3 + 0.3 * k)
            kick(tb, 0.42 if b % 2 == 0 else 0.0)
            if b % 2 == 1:
                snare(tb)
            hat(tb + E8)
            if busy:
                for q in range(4):
                    hat(tb + q * BEAT / 4, 0.03, -0.4)
        for k, nn in enumerate(mel):
            tk = t + k * E8
            if nn is None or tk >= t1:
                continue
            f = hz(nn) * (2 if up else 1)
            put(tk, tone(f, E8 * 0.9, "sq", r=0.09), 0.10, 0.15)
            put(tk, tone(f * 2, E8 * 0.6, "bell", r=0.06), 0.035, -0.2)   # 一点亮晶晶的叠音
        bar += 1
        t += 4 * BEAT


# ---- title：八音盒上行琶音 ----
a, b = spans["title"]
for k, nn in enumerate(["C5", "E5", "G5", "C6", "E6", "G6", "E6", "C6", "G5", "C6", "E6", "G6"]):
    tk = a + 0.15 + k * 0.17
    if tk < b:
        put(tk, tone(hz(nn), 0.8, "bell", r=0.35), 0.16, -0.3 + 0.05 * k)

# ---- 正片：三段同一律动 ----
groove(spans["play"][0], spans["ff"][0])
groove(spans["ff"][0], spans["finale"][0], up=True, busy=True)
f0, f1 = spans["finale"]
groove(f0, f1)
for k in range(6):   # 最后三秒倒数：每拍一下小军鼓
    tk = f1 - 3 + k * 0.5
    if tk > f0:
        snare(tk, 0.12)

# ---- result：号角上行 + 大和弦 ----
r0, r1 = spans["result"]
for k, nn in enumerate(["G4", "C5", "E5", "G5"]):
    put(r0 + k * 0.11, tone(hz(nn), 0.16, "sq", r=0.1), 0.14)
for nn in ["C4", "E4", "G4", "C5", "E5", "G5", "C6"]:
    put(r0 + 0.46, tone(hz(nn), 2.4, "sq", a=0.01, r=0.9), 0.05, rng.uniform(-0.4, 0.4))
put(r0 + 0.46, tone(hz("C3"), 2.4, "tri", r=1.0), 0.3)
kick(r0 + 0.46, 0.5)
for k in range(10):
    put(r0 + 0.5 + k * 0.07, tone(hz(["C6", "E6", "G6", "C7"][k % 4]), 0.3, "bell", r=0.15), 0.07, 0.4 - 0.08 * k)

# ---- outro：署名页底下的八音盒 ----
o0, o1 = spans["outro"]
arp = ["C5", "G5", "E5", "G5", "A4", "E5", "C5", "E5", "F4", "C5", "A4", "C5", "G4", "D5", "B4", "D5"]
k = 0
t = o0 - 0.2
while t < o1:
    put(t, tone(hz(arp[k % len(arp)]), 1.0, "bell", r=0.4), 0.13, -0.25 + 0.5 * ((k % 4) / 3))
    if k % 4 == 0:
        put(t, tone(hz(arp[k % len(arp)]) / 2, 1.6, "tri", r=0.7), 0.12)
    k += 1
    t += BEAT * 0.75

# ---- 重音：敲中 / 敲错 / 弹开 ----
PENTA = ["C6", "D6", "E6", "G6", "A6", "C7", "D7", "E7"]
for m in marks("hit"):
    step = min(len(PENTA) - 1, (m.get("combo", 1) - 1) // 3)
    g = 0.11 if m.get("mult", 1) == 1 else 0.05
    put(m["t"], tone(hz(PENTA[step]), 0.25, "bell", a=0.001, r=0.08), g, rng.uniform(-0.3, 0.3))
for m in marks("wrong"):
    put(m["t"], tone(hz("E4"), 0.16, "sq", r=0.12), 0.16)
    put(m["t"] + 0.18, tone(hz("C4"), 0.3, "sq", r=0.2, bend=-0.08), 0.16)
for m in marks("bounce"):
    put(m["t"], tone(hz("A4"), 0.45, "sin", r=0.25, bend=0.6) * (1 + 0.4 * np.sin(np.arange(int(0.45 * SR)) / SR * 2 * np.pi * 18)), 0.16, 0.3)

# ---- 母带 ----
fade = int(1.2 * SR)
mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
mix = np.tanh(mix * 1.4)
mix *= 10 ** (-3 / 20) / max(1e-6, np.abs(mix).max())
pcm = (mix * 32767).astype("<i2")
with wave.open(OUT, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"{OUT}: {T:.2f} s, hits {len(marks('hit'))}, wrong {len(marks('wrong'))}, bounce {len(marks('bounce'))}")
