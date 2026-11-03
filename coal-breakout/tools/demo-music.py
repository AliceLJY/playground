#!/usr/bin/env python3
"""煤球突围演示片配乐：numpy 离线合成的芯片乐，时间只读 tools/demo.cjs 写的 events.json / events-short.json。

用法（需要 numpy，例如 ~/.venv-kokoro/bin/python3）：
    python3 tools/demo-music.py <events.json> <输出.wav> [种子]

游戏自己的芯片乐在无头浏览器里录不到，所以按事件重新合成一段同风格的。段落取 events 里的 sections
（demo.cjs 在每个剪辑点和每个改变段落的事件处写一条），重音取 marks：
- off（停火）：鼓全停，只剩心跳和下行低持续音；burst（爆发）：镲 + 双倍鼓 + 高八度旋律；warning：交替警报音。
- title：三角波低音 + 慢琶音；groove：150 BPM 主律动（方波旋律、三角波低音、噪声鼓），选卡时只留铺底；boss：D 小调重段。
- result：击败首领的号角之后是轻和弦；outro：署名尾页上收在 A 小调，琶音一直垫到最后一秒，两次落印各一声，最后 1 秒淡出。
- 每个剪辑点（换关、跳过开局、精简版的「快进到首领」）一声扫频。
母带：tanh 轻驱动，采样峰值 -3 dBFS。响度在合成前用 ffmpeg loudnorm 单独做成 wav 再混流——
别在混流那一步带 loudnorm 加 -shortest：那样音轨会比画面短几秒（第一版就这样丢了结尾 3 秒）。
"""
import json
import sys
import wave

import numpy as np

ev = json.load(open(sys.argv[1], encoding="utf-8"))
OUT = sys.argv[2]
rng = np.random.default_rng(int(sys.argv[3]) if len(sys.argv) > 3 else 7)
SR = 44100
T = ev["seconds"]
N = int(round(T * SR))
mix = np.zeros((N, 2))
M = {}
for m in ev["marks"]:
    M.setdefault(m["name"], []).append(m["t"])
first = lambda k, d=None: M[k][0] if k in M else d

ALL = lambda k: M.get(k, [])
LEVELUP, PICKED = ALL("levelup"), ALL("picked")
END = first("endcard", T)
# sections come from the film's own timeline (demo.cjs writes them at every cut and every section-changing event)
SEC = sorted((x["t"], x["kind"]) for x in ev["sections"])
sections = [(t0, SEC[k + 1][0] if k + 1 < len(SEC) else T, kind) for k, (t0, kind) in enumerate(SEC)]
BPM = 150
BEAT = 60 / BPM
NAMES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def hz(n):
    acc = 1 if len(n) == 3 and n[1] == "#" else 0
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


def env(n, a=0.004, r=0.04):
    t = np.arange(n) / SR
    e = np.minimum(1, t / a)
    tail = int(r * SR)
    if tail and n > tail:
        e[-tail:] *= np.linspace(1, 0, tail)
    return e


def pulse(f, dur, duty=0.25, decay=None, vib=0.0):
    n = max(1, int(dur * SR))
    t = np.arange(n) / SR
    ph = f * t + (vib * np.sin(2 * np.pi * 6 * t) * np.clip(t - 0.12, 0, None) * 0.6 if vib else 0)
    y = np.where((ph % 1) < duty, 1.0, -1.0)
    y = np.convolve(y, np.ones(3) / 3, "same")      # take the edge off the aliasing a little
    e = env(n, 0.003, min(0.05, dur * 0.3))
    if decay:
        e *= np.exp(-t / decay)
    return y * e


def tri(f, dur, decay=None):
    n = max(1, int(dur * SR))
    t = np.arange(n) / SR
    y = 2 * np.abs(2 * ((f * t) % 1) - 1) - 1
    y = np.round(y * 7.5) / 7.5                     # 4-bit staircase, NES-ish
    e = env(n, 0.002, min(0.03, dur * 0.3))
    if decay:
        e *= np.exp(-t / decay)
    return y * e


WHITE = rng.uniform(-1, 1, SR * 2)


def noise(dur, decay, hp=False):
    n = int(dur * SR)
    y = WHITE[rng.integers(0, len(WHITE) - n):][:n].copy()
    if hp:
        y = y - np.convolve(y, np.ones(4) / 4, "same")
    t = np.arange(n) / SR
    return y * np.exp(-t / decay) * env(n, 0.001, 0.005)


def kick(t0, g=0.55):
    n = int(0.18 * SR)
    t = np.arange(n) / SR
    f = 150 * np.exp(-t / 0.03) + 45
    put(t0, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.07), g)


def snare(t0, g=0.28):
    put(t0, noise(0.16, 0.05), g, 0.05)
    put(t0, tri(190, 0.08, 0.04), g * 0.6)


def hat(t0, g=0.08, open_=False):
    put(t0, noise(0.2 if open_ else 0.04, 0.06 if open_ else 0.012, hp=True), g, -0.2)


def crash(t0, g=0.22):
    put(t0, noise(1.6, 0.45, hp=True), g, 0.1)


def sweep(t0, f0, f1, dur, g):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = f0 * (f1 / f0) ** (t / dur)
    y = np.where((np.cumsum(f) / SR % 1) < 0.5, 1.0, -1.0) * env(n, 0.01, 0.1)
    put(t0, y, g)


def arp(t0, notes, step, g, duty=0.25, pan=0.0, dur=None):
    for k, nn in enumerate(notes):
        put(t0 + k * step, pulse(hz(nn), dur or step * 1.6, duty, decay=0.25), g, pan)


# card pauses: groove thins to pad between a level-up and its pick
pauses = []
for lu in sorted(LEVELUP):
    nxt = [p for p in PICKED if p > lu]
    pauses.append((lu, nxt[0] if nxt else lu + 0.6))


def in_pause(t):
    return any(a <= t < b for a, b in pauses)


GROOVE_A = [("A", ["A4", "C5", "E5", "C5", "D5", "C5", "B4", "G4"]), ("F", ["A4", "C5", "F5", "E5", "D5", "C5", "D5", "E5"]),
            ("C", ["G4", "C5", "E5", "G5", "E5", "D5", "C5", "D5"]), ("G", ["B4", "D5", "G5", "D5", "B4", "A4", "B4", "D5"])]
BOSS_A = [("D", ["D5", "F5", "A5", "F5", "C#5", "E5", "A5", "E5"]), ("A#", ["D5", "F5", "A#5", "F5", "D5", "F5", "A5", "F5"]),
          ("G", ["D5", "G5", "A#5", "G5", "C#5", "E5", "G5", "E5"]), ("A", ["C#5", "E5", "A5", "E5", "C#5", "A4", "C#5", "E5"])]
ROOT = {"A": "A2", "F": "F2", "C": "C3", "G": "G2", "D": "D3", "A#": "A#2"}

for (s0, s1, kind) in sections:
    if s0 is None or s1 is None or s1 <= s0:
        continue
    bar = 4 * BEAT
    nb = int(np.ceil((s1 - s0) / bar))
    for b in range(nb):
        tb = s0 + b * bar
        for step in range(8):                        # eighth notes
            t = tb + step * BEAT / 2
            if t >= s1:
                break
            pz = in_pause(t)
            if kind == "title":
                chord = GROOVE_A[b % 4]
                put(t, tri(hz(ROOT[chord[0]]), BEAT * 0.45), 0.30)
                if step % 2 == 0:
                    put(t, pulse(hz(chord[1][step]), BEAT * 0.4, 0.125, decay=0.2), 0.07, 0.3)
            elif kind in ("groove", "boss", "burst"):
                prog = BOSS_A if kind == "boss" else GROOVE_A
                chord = prog[b % 4]
                root = hz(ROOT[chord[0]])
                bass = root * (2 if step % 2 else 1)
                put(t, tri(bass, BEAT * 0.42), 0.34 if not pz else 0.2)
                if not pz:
                    if step in (0, 4) or (kind != "groove" and step in (3, 7)):
                        kick(t, 0.5)
                    if step in (2, 6):
                        snare(t)
                    hat(t, 0.07 if step % 2 else 0.05)
                    if kind == "burst":
                        hat(t + BEAT / 4, 0.05)
                        if step in (1, 5):
                            kick(t, 0.35)
                    lead = chord[1][step]
                    octave = 2 if kind == "burst" else 1
                    if kind == "groove" and b % 8 >= 4 and step % 2:
                        continue                     # breathe: half the notes in the second phrase
                    put(t, pulse(hz(lead) * octave, BEAT * 0.45, 0.25 if kind != "boss" else 0.5, decay=0.18), 0.13 if kind != "burst" else 0.11, 0.15)
                else:
                    if step % 4 == 0:
                        for k, nn in enumerate(chord[1][:3]):
                            put(t, pulse(hz(nn) / 2, BEAT * 2, 0.5, decay=0.6), 0.045, -0.3 + 0.3 * k)
            elif kind == "result":
                if step == 0:
                    for k, nn in enumerate(("C4", "E4", "G4", "B4")):
                        put(t + k * 0.06, pulse(hz(nn), bar * 0.9, 0.125, decay=0.8), 0.06, -0.3 + 0.2 * k)
                    put(t, tri(hz("C3"), bar * 0.9, 1.2), 0.28)
                if step % 2 == 1:
                    put(t, pulse(hz(["E5", "G5", "C6", "G5"][step // 2]), BEAT * 0.3, 0.125, decay=0.1), 0.05, 0.4)
            elif kind == "warning":
                put(t, tri(hz("A2"), BEAT * 0.42), 0.3)
                if step in (0, 4):
                    kick(t, 0.4)
                hat(t, 0.04)
            elif kind == "off":
                if step in (0, 3):
                    kick(t, 0.42 if step == 0 else 0.28)    # heartbeat
            elif kind == "outro":
                pass

# ---------------------------------------------------------------- warning siren (alternating, every quarter second) and cease-fire drone
for (s0, s1, kind) in sections:
    if kind == "warning":
        t, k = s0, 0
        while t < s1 - 0.05:
            put(t, pulse(hz("E6") if k % 2 == 0 else hz("A#5"), 0.2, 0.5, decay=0.12), 0.09, 0.25 if k % 2 else -0.25)
            t += 0.25
            k += 1
    if kind == "off":
        n = int((s1 - s0) * SR)
        tt = np.arange(n) / SR
        f = hz("A2") * 2 ** (-tt / max(1, s1 - s0) / 12 * 2)
        dr = np.where((np.cumsum(f) / SR % 1) < 0.5, 1.0, -1.0)
        dr = np.convolve(dr, np.ones(40) / 40, "same") * np.minimum(1, tt / 0.15) * (0.6 + 0.4 * np.sin(2 * np.pi * 2 * tt))
        put(s0, dr, 0.12)
for t in ALL("off"):
    put(t, noise(0.6, 0.3, hp=True), 0.12)      # the guns cutting out

# ---------------------------------------------------------------- accents
for t in ALL("start"):
    arp(t, ["A4", "C5", "E5", "A5"], 0.07, 0.15)
    crash(t + 0.3, 0.12)
for lu in LEVELUP:
    arp(lu, ["C5", "E5", "G5", "C6", "E6"], 0.055, 0.15, 0.125)
    crash(lu, 0.16)
for p in PICKED:
    put(p, pulse(hz("G6"), 0.12, 0.25, decay=0.05), 0.12)
for a in ALL("auto") + ALL("autoMore"):
    arp(a, ["E6", "A6"], 0.08, 0.14, 0.125)
for t in ALL("boss"):
    kick(t, 0.9)
    put(t, tri(hz("D2"), 1.8, 0.7), 0.5)
    for k, nn in enumerate(("A4", "G#4", "G4", "F#4")):
        put(t + 0.1 + 0.18 * k, pulse(hz(nn), 0.3, 0.5, decay=0.2), 0.12)
    crash(t, 0.2)
for t in ALL("won"):
    arp(t, ["C5", "E5", "G5", "C6", "G5", "C6", "E6"], 0.09, 0.15, 0.25, dur=0.3)
    put(t + 0.63, pulse(hz("C6"), 1.2, 0.25, decay=0.6, vib=1), 0.13)
    crash(t, 0.2)
for t in ALL("title3") + ALL("cut") + ALL("skipped"):
    sweep(t - 0.05, 1600, 200, 0.45, 0.06)           # a whoosh at every edit
for t in ALL("warning"):
    crash(t, 0.1)
for t in ALL("burst") + ALL("hookBurst"):
    crash(t, 0.28)
    kick(t, 0.9)
    arp(t, ["A5", "C6", "E6", "A6"], 0.05, 0.13, 0.25)
for t in ALL("bridge"):
    arp(t, ["E5", "A5", "C6", "E6"], 0.07, 0.14, 0.25, dur=0.5)
    crash(t, 0.14)
# ---------------------------------------------------------------- outro over the endcard: keeps going until the last second, then a 1 s fade
if END < T:
    for k, nn in enumerate(("A3", "C4", "E4", "A4")):
        put(END + k * 0.05, pulse(hz(nn), T - END, 0.125, decay=8), 0.04, -0.3 + 0.2 * k)
    put(END, tri(hz("A2"), T - END, 8), 0.2)
    crash(END, 0.14)
    t, k = END + 0.4, 0
    seq = ["E5", "A5", "C6", "E6", "C6", "A5"]
    while t < T - 0.2:
        put(t, pulse(hz(seq[k % 6]), 0.3, 0.125, decay=0.15), 0.05, 0.35 if k % 2 else -0.35)
        if k % 4 == 0:
            put(t, tri(hz(["A2", "F2", "C3", "G2"][(k // 4) % 4]), BEAT * 1.8, 0.8), 0.14)
        t += BEAT / 2
        k += 1
    for st in (1.8, 2.8):                          # the two stamps landing
        kick(END + st, 0.35)
        put(END + st, noise(0.05, 0.01), 0.18)

# ---------------------------------------------------------------- small room, then master and final fade
L = int(0.9 * SR)
tt = np.arange(L) / SR
ir = rng.normal(0, 1, (L, 2)) * np.exp(-tt * 6.9 / 0.9)[:, None]
ir[: int(0.012 * SR)] = 0
ir /= np.sqrt((ir ** 2).sum(axis=0))
FM = 1 << int(np.ceil(np.log2(N + L)))
wet = np.stack([np.fft.irfft(np.fft.rfft(mix[:, ch], FM) * np.fft.rfft(ir[:, ch], FM), FM)[:N] for ch in (0, 1)], axis=1)
out = mix + wet * 0.18
t = np.arange(N) / SR
fade = np.clip((T - t) / 1.0, 0, 1) * np.clip(t / 0.03, 0, 1)   # music under the endcard until the last second
out *= fade[:, None]
out = np.tanh(1.4 * out / np.abs(out).max()) / np.tanh(1.4)
out = out / np.abs(out).max() * 10 ** (-3 / 20)
with wave.open(OUT, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((np.clip(out, -1, 1) * 32767).astype("<i2").tobytes())
print(f"{OUT}: {T:.2f} s; sections {[(round(a, 2), k) for a, _, k in sections]}; levelups {len(LEVELUP)} end {END:.2f}")
