# /// script
# dependencies = ["numpy"]
# ///
# 十三行江岸演示片的配乐与合轨。用法：uv run tools/film-music.py <输出目录> <成片.mp4>
# 读 <输出目录>/timeline.json 与 ambience.wav、film-silent.mp4，合成一条五声音阶的拨弦加低音铺底，
# 叠上页面环境声，响度归一后与画面合成。乐器：拨弦（类古筝）、长音铺底、木鱼点；不用方波芯片音色。
import json, subprocess, sys, wave
from pathlib import Path
import numpy as np

out, final = Path(sys.argv[1]), sys.argv[2]
tl = json.loads((out / "timeline.json").read_text())
SR, total = 48000, tl["total"]
n = int(total * SR)
rng = np.random.default_rng(1805)
mix = np.zeros((n, 2))

def place(sig, t, pan=0.0, gain=1.0):
    i = int(t * SR)
    if i >= n: return
    sig = sig[: n - i] * gain
    mix[i:i + len(sig), 0] += sig * (1 - max(0, pan)); mix[i:i + len(sig), 1] += sig * (1 + min(0, pan))

def pluck(freq, dur=2.6, bright=0.5):   # Karplus-Strong 拨弦
    N = int(SR / freq); buf = rng.uniform(-1, 1, N); buf = np.convolve(buf, np.ones(3) / 3, mode="same")
    y = np.empty(int(dur * SR)); damp = 0.996 - 0.002 * (1 - bright)
    for i in range(len(y)):
        y[i] = buf[i % N]; buf[i % N] = damp * 0.5 * (buf[i % N] + buf[(i + 1) % N])
    return y * np.exp(-np.linspace(0, 2.2, len(y)))

def pad(freq, dur):
    t = np.arange(int(dur * SR)) / SR
    y = sum(np.sin(2 * np.pi * freq * k * t + rng.uniform(0, 6.28)) / (k ** 1.6) for k in (1, 2, 3))
    env = np.minimum(1, t / 1.8) * np.minimum(1, (dur - t) / 2.2)
    return y * env * (1 + 0.08 * np.sin(2 * np.pi * 0.21 * t))

def block(dur=0.12, f=820):
    t = np.arange(int(dur * SR)) / SR
    return np.sin(2 * np.pi * f * t) * np.exp(-t * 46)

# D 宫五声：D E F# A B
SCALE = [146.83, 164.81, 185.0, 220.0, 246.94, 293.66, 329.63, 369.99, 440.0, 493.88, 587.33]
BPM = 76; beat = 60 / BPM
end = tl["endcardAt"] or total
# 铺底长音：每四小节换一次根音
for i, root in enumerate([73.42, 110.0, 98.0, 73.42, 110.0, 73.42]):
    t0 = i * beat * 8
    if t0 < end + 2: place(pad(root, beat * 8 + 2.5), t0, 0, 0.05); place(pad(root * 1.5, beat * 8 + 2.5), t0, 0.2, 0.03)
# 旋律：按镜头起点起句，句子在镜头里走完
PHRASES = [[5, 7, 8, 7, 5, 4, 5], [7, 8, 10, 8, 7, 5], [4, 5, 7, 5, 4, 2, 4], [5, 4, 2, 1, 2, 4], [8, 7, 5, 7, 8, 10, 8], [5, 7, 5, 4, 2, 4], [4, 2, 1, 0, 1, 2, 0]]
for si, cut in enumerate(tl["cuts"][:len(PHRASES)]):
    if tl["endcardAt"] is not None and cut >= tl["endcardAt"]: break
    t = cut + 0.5
    for k, deg in enumerate(PHRASES[si]):
        step = beat * (1 if k % 3 else 0.5) * (1.0 if si < 6 else 1.35)
        place(pluck(SCALE[deg], 2.8, 0.6), t, (-0.3 if k % 2 else 0.3), 0.16)
        if k % 2 == 0: place(pluck(SCALE[max(0, deg - 5)] / 2, 3.0, 0.3), t, 0, 0.12)
        t += step
    if si in (1, 4):
        for j in range(8): place(block(), cut + 1 + j * beat, 0.4, 0.035)
# 署名页两声落定
if tl["endcardAt"] is not None:
    for dt in (1.8, 2.8): place(block(0.25, 300) + 0.5 * block(0.25, 150), tl["endcardAt"] + dt, 0, 0.3)
    place(pluck(SCALE[0], 3.5, 0.3), tl["endcardAt"] + 0.2, 0, 0.14); place(pluck(SCALE[3], 3.5, 0.3), tl["endcardAt"] + 0.45, 0, 0.12)
mix *= np.minimum(1, (total - np.arange(n) / SR) / 1.5)[:, None]

with wave.open(str(out / "ambience.wav")) as w:
    amb = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).reshape(-1, 2) / 32768
amb = np.vstack([amb, np.zeros((max(0, n - len(amb)), 2))])[:n]
allmix = amb * 0.9 + mix
allmix /= max(1.0, np.abs(allmix).max() / 0.95)
for name, arr in (("music.wav", mix / max(1e-6, np.abs(mix).max()) * 0.8), ("mix.wav", allmix)):
    with wave.open(str(out / name), "w") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(arr, -1, 1) * 32767).astype(np.int16).tobytes())
subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(out / "film-silent.mp4"), "-i", str(out / "mix.wav"), "-c:v", "copy",
                "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", "-movflags", "+faststart", final], check=True)
print("写出", final, f"{total:.1f} 秒")
