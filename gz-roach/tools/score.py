"""给导览录片配声音：读 tools/record.cjs 写的 <片名>.events.json，按同一时间轴合成。
全是算出来的，没有采样和现成音乐。需要 numpy。

    python3 tools/score.py <片名>.events.json <out.wav>
    ffmpeg -i 片.mp4 -i out.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart 成片.mp4

声音分层：底下一层暖和弦（四个和弦循环）；每只脚着地一声很轻的「嗒」，后足低一点、跑得越快越响；
导览光标每按一下一声软「咔」；墨镜落下时一串铃加一记低音。
"""
import json, sys, math
import numpy as np

SR = 48000
ev = json.load(open(sys.argv[1])); out = sys.argv[2]
dur = ev["duration"]; n = int(SR * dur)
L = np.zeros(n); R = np.zeros(n)
rng = np.random.default_rng(11)

def put(t, x, gain=1.0, pan=0.0):
    i = int(t * SR); j = min(n, i + len(x))
    if i >= n or j <= i: return
    a = (pan + 1) * math.pi / 4
    L[i:j] += x[: j - i] * gain * math.cos(a); R[i:j] += x[: j - i] * gain * math.sin(a)

def env(m, a, d):
    t = np.arange(m) / SR
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d)

hz = lambda midi: 440 * 2 ** ((midi - 69) / 12)

# 底层：Fmaj9 – Em7 – Dm9 – Cmaj7，每个 4.5 秒，三角波加慢起慢收，亮相段改成持续的 Cmaj9
chords = [[53, 57, 60, 64, 67], [52, 55, 59, 62], [50, 53, 57, 60, 64], [48, 52, 55, 59]]
swag_t = ev.get("swag") or dur
seg = 4.5
t0 = 0.0; k = 0
while t0 < dur:
    length = min(seg + 1.2, dur - t0)
    m = int(length * SR); t = np.arange(m) / SR
    shape = np.minimum(1, t / 0.9) * np.minimum(1, (length - t) / 1.1)
    notes = [48, 52, 55, 59, 62, 67] if t0 >= swag_t - 1 else chords[k % 4]
    pad = np.zeros(m)
    for q, note in enumerate(notes):
        f = hz(note); ph = rng.uniform(0, 1)
        tri = 2 * np.abs(2 * ((f * t + ph) % 1) - 1) - 1
        pad += (0.6 * tri + 0.4 * np.sin(2 * np.pi * f * 1.003 * t)) / len(notes)
    put(t0, pad * shape, 0.16, -0.25 if k % 2 else 0.25)
    t0 += seg; k += 1

# 脚步：很短的带通噪声，后足低、前足高；速度越快越响
def tick(freq, d=0.035):
    m = int(d * SR); t = np.arange(m) / SR
    noise = rng.uniform(-1, 1, m)
    s = np.sin(2 * np.pi * freq * t) * 0.6 + noise * np.exp(-t / 0.004) * 0.8
    return s * env(m, 0.0008, 0.009)
for s in ev["steps"]:
    f = [2600, 2100, 1500][s["pair"]]
    put(s["t"], tick(f * rng.uniform(0.95, 1.05)), 0.05 + 0.1 * s["v"] / 1.5, [-0.4, 0.4][s["leg"] % 2])

# 按钮：软咔
def click():
    m = int(0.06 * SR); t = np.arange(m) / SR
    return (np.sin(2 * np.pi * 1250 * t) * 0.7 + np.sin(2 * np.pi * 2900 * t) * 0.3) * env(m, 0.0006, 0.012)
for p in ev["presses"]:
    put(p, click(), 0.32)

# 墨镜落下：先一记低音，再一串五声音阶的铃
if ev.get("swag"):
    ts = ev["swag"] - 0.25
    m = int(1.6 * SR); t = np.arange(m) / SR
    f = 55 * (1 + 0.9 * np.exp(-t / 0.05))
    bass = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(m, 0.004, 0.45)
    put(ts, bass, 0.75)
    for q, note in enumerate([84, 86, 88, 91, 93, 96]):
        m = int(1.8 * SR); t = np.arange(m) / SR; fr = hz(note)
        bell = (np.sin(2 * np.pi * fr * t) + 0.35 * np.sin(2 * np.pi * fr * 2.76 * t) * np.exp(-t / 0.18)) * env(m, 0.002, 0.55)
        put(ts + 0.18 + q * 0.07, bell, 0.13, -0.6 + q * 0.24)

# 收尾淡出，按 RMS 把响度推到约 -14 LUFS 附近，再软限幅保峰值在 -1.5 dBFS 以下
fade = np.ones(n); fn = int(0.6 * SR); fade[-fn:] = np.linspace(1, 0, fn)
L *= fade; R *= fade
rms = math.sqrt(float(np.mean((L ** 2 + R ** 2) / 2))) or 1
g = 10 ** ((-13.9) / 20) / rms
L = np.tanh(L * g * 1.2) / 1.2; R = np.tanh(R * g * 1.2) / 1.2
peak = max(np.abs(L).max(), np.abs(R).max()); lim = 10 ** (-1.5 / 20)
if peak > lim: L *= lim / peak; R *= lim / peak
pcm = (np.stack([L, R], 1) * 32767).astype("<i2")
import wave
with wave.open(out, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print(f"wrote {out}: {dur:.1f}s, {len(ev['steps'])} steps, {len(ev['presses'])} presses, swag at {ev.get('swag')}")
