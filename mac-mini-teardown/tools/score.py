"""给导览录片配声音：读 tools/record.cjs 写的 <片名>.events.json，按同一时间轴合成。
全是算出来的，没有采样和现成音乐。需要 numpy。

    uv run -q --with numpy python -I tools/score.py <片名>.events.json <out.wav> [--tail 秒]
    --tail：片尾再接一段（如 5.6 秒署名页），和弦铺底接着垫到最后，事件不变

声音分层：底下一层安静的和弦（四个和弦循环，拆到 SSD 特写时转大调持续音）；
每颗螺丝落进盘里一声金属「叮」（按刀头分四个音高）；每断一个接头一声短促的「咔」；
每句旁白出现时一声很轻的木鱼「嗒」；顺带看内存那一拍一个下行的低音；SSD 拔出来一记低音加一串铃；总结卡出现时一个和弦。
响度：这里先粗推到 -14 LUFS 附近，最终由成片脚本的 loudnorm 定在 -14 LUFS、真峰值 -2 dBFS 以内。
"""
import json, sys, math, wave
import numpy as np

SR = 48000
ev = json.load(open(sys.argv[1])); out = sys.argv[2]
tail = float(sys.argv[sys.argv.index("--tail") + 1]) if "--tail" in sys.argv else 0.0
dur = ev["duration"] + tail; n = int(SR * dur)
L = np.zeros(n); R = np.zeros(n)
rng = np.random.default_rng(16)

def put(t, x, gain=1.0, pan=0.0):
    i = int(t * SR); j = min(n, i + len(x))
    if i >= n or j <= i or i < 0: return
    a = (pan + 1) * math.pi / 4
    L[i:j] += x[: j - i] * gain * math.cos(a); R[i:j] += x[: j - i] * gain * math.sin(a)

def env(m, a, d):
    t = np.arange(m) / SR
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d)

hz = lambda midi: 440 * 2 ** ((midi - 69) / 12)

# 底层：Am9 – Fmaj7 – C – G6，每个 4 秒；SSD 拔出后转 Cmaj9 持续到底
chords = [[45, 52, 55, 59, 60], [41, 48, 52, 55, 57], [48, 52, 55, 60, 64], [43, 50, 55, 59, 64]]
bright = ev.get("ssdOut") or dur
seg = 4.0
t0 = 0.0; k = 0
while t0 < dur:
    length = min(seg + 1.4, dur - t0)
    m = int(length * SR); t = np.arange(m) / SR
    shape = np.minimum(1, t / 1.0) * np.minimum(1, (length - t) / 1.2)
    notes = [48, 55, 59, 62, 64, 67] if t0 >= bright - 0.5 else chords[k % 4]
    pad = np.zeros(m)
    for note in notes:
        f = hz(note); ph = rng.uniform(0, 1)
        tri = 2 * np.abs(2 * ((f * t + ph) % 1) - 1) - 1
        pad += (0.55 * tri + 0.45 * np.sin(2 * np.pi * f * 1.002 * t)) / len(notes)
    put(t0, pad * shape, 0.15, -0.25 if k % 2 else 0.25)
    t0 += seg; k += 1

# 螺丝落盘：短促的金属叮，按出场顺序升一点音高
def ting(freq, d=0.5):
    m = int(d * SR); t = np.arange(m) / SR
    s = np.sin(2 * np.pi * freq * t) + 0.4 * np.sin(2 * np.pi * freq * 2.72 * t) * np.exp(-t / 0.05) + 0.15 * np.sin(2 * np.pi * freq * 5.1 * t) * np.exp(-t / 0.02)
    return s * env(m, 0.0008, 0.12)
scale = [76, 79, 81, 83, 84, 86, 88, 91]
for i, ts in enumerate(ev["screws"]):
    put(ts, ting(hz(scale[i % len(scale)]) * rng.uniform(0.99, 1.01)), 0.10, [-0.5, 0.5][i % 2] * 0.6)

# 接头断开：两层短噪声的「咔」
def snap():
    m = int(0.05 * SR); t = np.arange(m) / SR
    noise = rng.uniform(-1, 1, m)
    return (noise * np.exp(-t / 0.003) * 0.8 + np.sin(2 * np.pi * 1900 * t) * 0.5) * env(m, 0.0004, 0.01)
for ts in ev["connectors"]:
    put(ts, snap(), 0.32); put(ts + 0.045, snap(), 0.2)

# 旁白换句：很轻的木鱼
def wood(f=620):
    m = int(0.12 * SR); t = np.arange(m) / SR
    return np.sin(2 * np.pi * f * t * (1 + 0.6 * np.exp(-t / 0.01))) * env(m, 0.0006, 0.03)
for ts in ev["beats"]:
    if 0.3 < ts < ev["duration"] - 0.2: put(ts, wood(), 0.14)

# 顺带看内存：一个下行的低音（「加不了」）
if ev.get("ram"):
    m = int(1.4 * SR); t = np.arange(m) / SR
    f = 98 * (1 - 0.18 * np.minimum(1, t / 0.8))
    put(ev["ram"], np.sin(2 * np.pi * np.cumsum(f) / SR) * env(m, 0.01, 0.5), 0.45)

# SSD 拔出：一记低音，再一串五声音阶的铃
def bells(ts, notes, gain=0.12):
    for q, note in enumerate(notes):
        m = int(1.8 * SR); t = np.arange(m) / SR; fr = hz(note)
        b = (np.sin(2 * np.pi * fr * t) + 0.35 * np.sin(2 * np.pi * fr * 2.76 * t) * np.exp(-t / 0.18)) * env(m, 0.002, 0.55)
        put(ts + q * 0.08, b, gain, -0.6 + q * 0.24)
if ev.get("ssdOut"):
    ts = ev["ssdOut"]
    m = int(1.6 * SR); t = np.arange(m) / SR
    f = 55 * (1 + 0.9 * np.exp(-t / 0.05))
    put(ts - 0.1, np.sin(2 * np.pi * np.cumsum(f) / SR) * env(m, 0.004, 0.45), 0.7)
    bells(ts + 0.1, [84, 86, 88, 91, 93, 96])
if ev.get("summary"):
    bells(ev["summary"] - 0.2, [72, 76, 79, 84], 0.1)

fade = np.ones(n); fn = int(0.8 * SR); fade[-fn:] = np.linspace(1, 0, fn)
L *= fade; R *= fade
rms = math.sqrt(float(np.mean((L ** 2 + R ** 2) / 2))) or 1
g = 10 ** ((-14.5) / 20) / rms
L = np.tanh(L * g * 1.2) / 1.2; R = np.tanh(R * g * 1.2) / 1.2
peak = max(np.abs(L).max(), np.abs(R).max()); lim = 10 ** (-2 / 20)
if peak > lim: L *= lim / peak; R *= lim / peak
pcm = (np.stack([L, R], 1) * 32767).astype("<i2")
with wave.open(out, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print(f"wrote {out}: {dur:.1f}s (tail {tail}), {len(ev['screws'])} screws, {len(ev['connectors'])} connectors, ssd out at {ev.get('ssdOut')}")
