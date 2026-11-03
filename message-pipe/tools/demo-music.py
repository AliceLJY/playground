#!/usr/bin/env python3
"""一条消息的旅程 · 演示片配乐（没有配音）。numpy 离线合成，时间只读 tools/record.cjs 写的 events.json。

用法（需要 numpy，例如 ~/.venv-kokoro/bin/python3）：
    python3 tools/demo-music.py <events.json> <输出.wav>

- 铺底：104 BPM，C 大调五声，四小节一轮 C–Am–F–G 的软正弦和弦 + 三角波八分琶音；关卡段加轻底鼓。
- 事件：每次点按一声高音拨弦（音高在五声音阶里轮换），发车一串上行琶音，送到一个大三和弦铃声，
  卡在半路（漏站 / 空箱子）两声下行的闷音，失败提示期间琶音压低。按钮一声轻嗒。
- 署名页：和弦收在 C，1.8 s、2.8 s 各一声落定音（对应盖印章、按指纹），最后 1 秒淡出。
母带：tanh 轻驱动，峰值 -3 dBFS；响度另用 ffmpeg loudnorm 单独做成 wav 再混流（别在混流时带 -shortest）。
"""
import json, sys, wave
import numpy as np

ev = json.load(open(sys.argv[1], encoding="utf-8"))
OUT = sys.argv[2]
SR = 44100
T = ev["seconds"]
N = int(round(T * SR))
mix = np.zeros((N, 2))
marks = ev["marks"]
sec = sorted((s["t"], s["kind"]) for s in ev["sections"])
END = next((m["t"] for m in marks if m["name"] == "endcard"), T)
BPM = 104
beat = 60 / BPM

def note(m):  # midi -> Hz
    return 440 * 2 ** ((m - 69) / 12)

def add(sig, t0, gain=1.0, pan=0.0):
    i = int(t0 * SR)
    if i >= N or i + len(sig) <= 0:
        return
    s = sig[: max(0, N - i)]
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    mix[i:i + len(s), 0] += s * gain * l
    mix[i:i + len(s), 1] += s * gain * r

def env(n, a=0.005, d=0.3):
    t = np.arange(n) / SR
    return np.minimum(1, t / a) * np.exp(-t / d)

def tone(f, dur, kind="sine", a=0.005, d=0.3):
    n = int(dur * SR); t = np.arange(n) / SR
    if kind == "tri":
        w = 2 / np.pi * np.arcsin(np.sin(2 * np.pi * f * t))
    elif kind == "sq":
        w = np.tanh(3 * np.sin(2 * np.pi * f * t)) * 0.6
    else:
        w = np.sin(2 * np.pi * f * t)
    return w * env(n, a, d)

# ---- bed ----
CHORDS = [[48, 52, 55, 60], [45, 48, 52, 57], [41, 45, 48, 53], [43, 47, 50, 55]]  # C Am F G
fail_spans = []
for m in marks:
    if m["name"] in ("fail", "emptybox"):
        fail_spans.append((m["t"], m["t"] + 2.6))
def ducked(t):
    return any(a <= t < b for a, b in fail_spans)
in_level = lambda t: any(k.startswith("level") and t0 <= t < (sec[i + 1][0] if i + 1 < len(sec) else T) for i, (t0, k) in enumerate(sec))

bar = 4 * beat
t = 0.0; k = 0
while t < T:
    ch = CHORDS[k % 4] if t < END else [48, 52, 55, 60]
    for m in ch:
        add(tone(note(m), bar + 0.4, "sine", a=0.4, d=2.2), t, 0.045, pan=((m % 7) - 3) / 6)
    for j in range(8):  # eighth-note arpeggio
        tt = t + j * beat / 2
        if tt >= T: break
        m = ch[j % 4] + (12 if j % 8 >= 4 else 0) + 12
        g = 0.035 * (0.35 if ducked(tt) else 1)
        add(tone(note(m), 0.4, "tri", d=0.18), tt, g, pan=0.3 if j % 2 else -0.3)
    if in_level(t) and t < END:
        for j in (0, 2):
            tt = t + j * beat; n = int(0.25 * SR); x = np.arange(n) / SR
            kick = np.sin(2 * np.pi * (55 * x + 60 * (1 - np.exp(-x * 30)) / 30)) * np.exp(-x * 14)
            add(kick, tt, 0.16)
    t += bar; k += 1

# ---- events ----
PENTA = [72, 74, 76, 79, 81, 84]
tap_i = 0
for m in marks:
    nm, tt = m["name"], m["t"]
    if nm == "tap":
        add(tone(note(PENTA[tap_i % len(PENTA)]), 0.25, "tri", a=0.002, d=0.07), tt, 0.11, pan=0.15); tap_i += 1
    elif nm == "button":
        n = int(0.03 * SR); add(np.random.default_rng(int(tt * 1000)).normal(0, 1, n) * env(n, 0.001, 0.008), tt, 0.05)
    elif nm == "ride":
        for j, mm in enumerate([60, 64, 67, 72]):
            add(tone(note(mm), 0.35, "tri", d=0.15), tt + j * 0.07, 0.09)
    elif nm == "deliver":
        for mm in (72, 76, 79, 84):
            add(tone(note(mm), 1.6, "sine", a=0.003, d=0.7) + 0.3 * tone(note(mm) * 2.01, 1.6, "sine", a=0.003, d=0.4), tt, 0.07)
    elif nm in ("fail", "emptybox"):
        add(tone(note(55), 0.3, "sq", d=0.12), tt, 0.09)
        add(tone(note(50), 0.45, "sq", d=0.2), tt + 0.22, 0.09)

# endcard: two settling pops (stamp, fingerprint)
for d in (1.8, 2.8):
    n = int(0.25 * SR); x = np.arange(n) / SR
    pop = np.sin(2 * np.pi * (90 * x + 200 * (1 - np.exp(-x * 40)) / 40)) * np.exp(-x * 18)
    add(pop, END + d, 0.35)
    add(tone(note(84), 0.3, "sine", a=0.001, d=0.08), END + d, 0.06)

# fade the last second
f = int(1.0 * SR); mix[-f:] *= np.linspace(1, 0, f)[:, None]
mix = np.tanh(mix * 1.4)
mix *= 10 ** (-3 / 20) / max(1e-9, np.abs(mix).max())
pcm = (mix * 32767).astype("<i2")
with wave.open(OUT, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print(OUT, round(T, 2), "s")
