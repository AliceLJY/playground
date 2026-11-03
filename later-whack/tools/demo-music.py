#!/usr/bin/env python3
"""办公室打地鼠演示片配乐：numpy 离线合成的摇摆小调子，时间全部读 tools/record.cjs 写的 events.json。

用法（需要 numpy，例如 ~/.venv-kokoro/bin/python3）：
    python3 tools/demo-music.py <events.json> <输出.wav>

刻意和隔壁像素连连看的芯片乐拉开距离（那支是方波旋律、三角波低音、电子鼓）：这里一个方波都不用，
换成尤克里里扫弦（拨弦泛音叠出来）、口哨主旋律（正弦加颤音和滑音）、马林巴、拍手和沙锤，F 大调摇摆八分音符。

- title：尤克里里扫两下，口哨「嘟—嘀」打招呼。
- play / ff / finale：168 BPM 摇摆，F–Dm–B♭–C7，低音拨弦走一三拍，尤克里里二四拍切分扫弦，拍手在二四拍；
  快进段口哨升八度、沙锤十六分、马林巴加花；最后三秒拍手加密倒数。
- result：口哨上滑 + 扫弦大和弦 + 一串拍手。outro：署名页底下慢扫弦配马林巴，最后 1.2 秒淡出。
- 重音取 marks：每次敲中一声冒泡的「啵」（连击越高越亮），敲错蓝牌一声闷闷的下滑「呜哦」，敲到绿牌一声弹簧「啵嘤」。
- 母带：tanh 轻驱动，峰值 -3 dBFS；响度另用 ffmpeg loudnorm 单独做。
"""
import json
import sys
import wave

import numpy as np

ev = json.load(open(sys.argv[1], encoding="utf-8"))
OUT = sys.argv[2]
rng = np.random.default_rng(23)
SR = 44100
T = ev["seconds"]
N = int(round(T * SR))
mix = np.zeros((N, 2))
SEC = sorted((s["t"], s["kind"]) for s in ev["sections"])
spans = {kind: (t0, SEC[k + 1][0] if k + 1 < len(SEC) else T) for k, (t0, kind) in enumerate(SEC)}
marks = lambda name: [m for m in ev["marks"] if m["name"] == name]
BPM = 168
BEAT = 60 / BPM
SWING = BEAT * 0.64          # 摇摆：第二个八分音符往后挪
NAMES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def hz(n):
    acc = -1 if "b" in n[1:-1] else 0
    return 440 * 2 ** ((NAMES[n[0]] + acc + 12 * (int(n[-1]) + 1) - 69) / 12)


def put(t, sig, gain, pan=0.0):
    i = int(round(t * SR))
    if i >= N or i + len(sig) <= 0:
        return
    if i < 0:
        sig, i = sig[-i:], 0
    sig = sig[: N - i] * gain
    mix[i: i + len(sig), 0] += sig * np.sqrt(0.5 * (1 - pan))
    mix[i: i + len(sig), 1] += sig * np.sqrt(0.5 * (1 + pan))


def tt(dur):
    return np.arange(int(dur * SR)) / SR


def pluck(f, dur=0.6, bright=1.0):
    """拨弦：几条泛音各自衰减，高泛音死得快，像尤克里里 / 拨弦低音。"""
    t = tt(dur)
    w = np.zeros_like(t)
    for k in range(1, 9):
        w += np.sin(2 * np.pi * f * k * t) * np.exp(-t * (4 + k * 3.2 / bright)) / k ** 1.2
    return w * np.minimum(1, t / 0.002)


def strum(notes, t, gain, down=True, spread=0.014):
    order = notes if down else notes[::-1]
    for k, n in enumerate(order):
        put(t + k * spread, pluck(hz(n), 0.5), gain, -0.35 + 0.23 * k)


def whistle(f, dur, glide=0.0, vib=0.016):
    """口哨：正弦 + 慢起颤音 + 一点气声，开头可带滑音。"""
    t = tt(dur)
    fr = f * (1 + glide * np.exp(-t * 22)) * (1 + vib * np.minimum(1, t / 0.12) * np.sin(2 * np.pi * 5.6 * t))
    ph = np.cumsum(fr) / SR
    a = np.minimum(1, t / 0.025) * np.minimum(1, (dur - t) / 0.05)
    breath = rng.uniform(-1, 1, len(t)) * 0.04
    return (np.sin(2 * np.pi * ph) + 0.08 * np.sin(4 * np.pi * ph)) * a + breath * a


def marimba(f, dur=0.5):
    t = tt(dur)
    return (np.sin(2 * np.pi * f * t) * np.exp(-t * 7) + 0.3 * np.sin(2 * np.pi * f * 3.9 * t) * np.exp(-t * 40)) * np.minimum(1, t / 0.001)


def hp_noise(dur, decay):
    n = int(dur * SR)
    x = rng.uniform(-1, 1, n)
    x = np.diff(np.concatenate([[0], x]))          # 一阶高通，去掉闷声
    return x * np.exp(-np.arange(n) / SR / decay)


def clap(t, g=0.13):
    for k, d in enumerate([0, 0.009, 0.019]):
        put(t + d, hp_noise(0.09 if k == 2 else 0.02, 0.03 if k == 2 else 0.006), g, 0.05)


def shaker(t, g=0.035, pan=-0.4):
    put(t, hp_noise(0.05, 0.015), g, pan)


CHORDS = [  # F 大调：F – Dm – B♭ – C7；低音根音、五音，尤克里里四根弦
    ("F2", "C3", ["F4", "A4", "C5", "F5"]),
    ("D2", "A2", ["D4", "F4", "A4", "D5"]),
    ("Bb1", "F2", ["Bb3", "D4", "F4", "Bb4"]),
    ("C2", "G2", ["C4", "E4", "G4", "Bb4"]),
]
# 口哨旋律：每小节 8 个（摇摆）八分音符，None = 休止，"-" = 延长上一个音。
MELODY = [
    ["C5", "-", "F5", "A5", "C6", "-", "A5", None],
    ["D5", "F5", "A5", "-", "F5", "D5", None, None],
    ["Bb4", "D5", "F5", "-", "D5", "F5", "G5", "-"],
    ["E5", "-", "G5", "Bb5", "C6", "-", None, None],
    ["A5", "G5", "F5", "-", "C5", "-", "F5", "G5"],
    ["A5", "-", "F5", "D5", "A4", "-", None, None],
    ["Bb4", "D5", "G5", "-", "F5", "E5", "D5", "-"],
    ["E5", "-", "C5", "-", "F5", "-", None, None],
]


def eighth(t, k):
    return t + (k // 2) * BEAT + (SWING if k % 2 else 0)


def melody(t0, t1, up=False, gain=0.11):
    bar, t = 0, t0
    while t < t1 - 1e-6:
        row = MELODY[bar % 8]
        for k, n in enumerate(row):
            if n is None or n == "-":
                continue
            ln = 1
            while k + ln < 8 and row[k + ln] == "-":
                ln += 1
            tk = eighth(t, k)
            if tk >= t1:
                break
            dur = min(eighth(t, k + ln) - tk if k + ln < 8 else 4 * BEAT - (tk - t), t1 - tk) * 0.92
            put(tk, whistle(hz(n) * (2 if up else 1), max(0.08, dur), glide=-0.04 if k == 0 else 0.0), gain, 0.15)
        bar += 1
        t += 4 * BEAT


def groove(t0, t1, busy=False):
    bar, t = 0, t0
    while t < t1 - 1e-6:
        root, fifth, uke = CHORDS[bar % 4]
        for b in range(4):
            tb = t + b * BEAT
            if tb >= t1:
                break
            if b in (0, 2):
                put(tb, pluck(hz(root if b == 0 else fifth), 0.5, bright=0.6), 0.34)
            else:
                clap(tb)
                strum(uke, tb, 0.05, down=True)
                if tb + SWING < t1:
                    strum(uke, tb + SWING, 0.035, down=False)
            shaker(tb + SWING)
            if busy:
                for q in range(4):
                    shaker(tb + q * BEAT / 4, 0.025, 0.4)
                if b % 2 == 0:
                    put(tb + SWING, marimba(hz(uke[(bar + b) % 4]) * 2, 0.3), 0.06, -0.3)
        bar += 1
        t += 4 * BEAT


# ---- title：扫两下弦，口哨打招呼 ----
a, b = spans["title"]
strum(CHORDS[0][2], a + 0.2, 0.08)
strum(CHORDS[3][2], a + 0.2 + SWING * 2, 0.07, down=False)
put(a + 0.9, whistle(hz("C5"), 0.32, glide=-0.06), 0.12)
put(a + 1.3, whistle(hz("F5"), 0.7, glide=0.05), 0.12)
strum(CHORDS[0][2], b - 0.35, 0.06)

# ---- 正片 ----
groove(spans["play"][0], spans["ff"][0])
melody(spans["play"][0], spans["ff"][0])
groove(spans["ff"][0], spans["finale"][0], busy=True)
melody(spans["ff"][0], spans["finale"][0], up=True, gain=0.08)
f0, f1 = spans["finale"]
groove(f0, f1)
melody(f0, f1)
for k in range(9):   # 最后三秒：拍手加密倒数
    tk = f1 - 3 + k * 0.33
    if tk > f0:
        clap(tk, 0.1)

# ---- result：口哨上滑 + 扫弦大和弦 + 一串拍手 ----
r0, r1 = spans["result"]
put(r0, whistle(hz("C6"), 0.9, glide=-0.25), 0.13)
for k in range(3):
    strum(["F4", "A4", "C5", "F5"], r0 + 0.35 + k * 0.16, 0.08 - 0.015 * k, down=k % 2 == 0)
put(r0 + 0.35, pluck(hz("F2"), 1.6, bright=0.6), 0.4)
for k in range(8):
    clap(r0 + 0.5 + k * 0.12, 0.08)

# ---- outro：慢扫弦 + 马林巴 ----
o0, o1 = spans["outro"]
t, k = o0 - 0.1, 0
while t < o1:
    root, fifth, uke = CHORDS[[0, 2, 3, 0][k % 4]]
    strum(uke, t, 0.05, spread=0.03)
    put(t, pluck(hz(root), 1.2, bright=0.6), 0.22)
    for j, n in enumerate([uke[1], uke[3], uke[2]]):
        put(t + 0.36 + j * 0.36, marimba(hz(n) * 2, 0.6), 0.07, -0.3 + 0.3 * j)
    k += 1
    t += 1.45

# ---- 重音：敲中冒泡 / 敲错下滑 / 弹开弹簧 ----
for m in marks("hit"):
    lift = min(1.0, (m.get("combo", 1) - 1) / 24)
    f0b = 520 * (1 + lift)
    t = tt(0.07)
    f = f0b * (1 + 1.6 * t / 0.07)
    pop = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 45)
    put(m["t"], pop, 0.16 if m.get("mult", 1) == 1 else 0.07, rng.uniform(-0.3, 0.3))
for m in marks("wrong"):
    t = tt(0.45)
    f = 330 * (1 - 0.45 * t / 0.45)
    ph = np.cumsum(f) / SR
    put(m["t"], (np.sin(2 * np.pi * ph) + 0.4 * np.sin(4 * np.pi * ph)) * np.minimum(1, t / 0.02) * np.exp(-t * 3.5), 0.18)
for m in marks("bounce"):
    t = tt(0.45)
    f = 440 * (1 + 0.6 * np.exp(-t * 30)) * (1 + 0.4 * np.sin(2 * np.pi * 18 * t))
    put(m["t"], np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 4), 0.15, 0.3)

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
