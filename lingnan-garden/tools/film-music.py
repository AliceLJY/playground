# /// script
# dependencies = ["numpy"]
# ///
# 岭南园林一角导览片的配乐与合轨。用法：uv run tools/film-music.py <输出目录> <成片.mp4>
# 读 <输出目录>/timeline.json、ambience.wav、film-silent.mp4。
# 和十三行那支（D 宫、四拍、拨弦主奏加木鱼）有意做得不一样：这支是 A 羽调、三拍子、慢，
# 主奏是一支吹管（类洞箫，正弦加泛音加一点气声），下面是稀疏的拨弦分解和弦与长音，没有打击点。
import json, subprocess, sys, wave
from pathlib import Path
import numpy as np

out, final = Path(sys.argv[1]), sys.argv[2]
tl = json.loads((out / "timeline.json").read_text())
SR, total = 48000, tl["total"]
n = int(total * SR)
rng = np.random.default_rng(1881)
mix = np.zeros((n, 2))

def place(sig, t, pan=0.0, gain=1.0):
    i = int(t * SR)
    if i >= n or i < 0: return
    sig = sig[: n - i] * gain
    mix[i:i + len(sig), 0] += sig * (1 - max(0, pan)); mix[i:i + len(sig), 1] += sig * (1 + min(0, pan))

def pluck(freq, dur=2.4, bright=0.5):   # Karplus-Strong 拨弦
    N = int(SR / freq); buf = rng.uniform(-1, 1, N); buf = np.convolve(buf, np.ones(5) / 5, mode="same")
    y = np.empty(int(dur * SR)); damp = 0.995 - 0.003 * (1 - bright)
    for i in range(len(y)):
        y[i] = buf[i % N]; buf[i % N] = damp * 0.5 * (buf[i % N] + buf[(i + 1) % N])
    return y * np.exp(-np.linspace(0, 2.6, len(y)))

def flute(freq, dur, bend=0.0):   # 吹管：起音慢、延迟出现的颤音、少量气声
    m = int((dur + 0.35) * SR); t = np.arange(m) / SR
    vib = 1 + 0.0055 * np.sin(2 * np.pi * 4.6 * t) * np.clip((t - 0.35) / 0.5, 0, 1)
    glide = 1 + bend * np.exp(-t * 14)                       # 起音从下面滑上来一点
    ph = 2 * np.pi * np.cumsum(freq * vib * glide) / SR
    y = np.sin(ph) + 0.30 * np.sin(2 * ph + 0.4) + 0.09 * np.sin(3 * ph + 1.1) + 0.03 * np.sin(4 * ph)
    noise = rng.normal(0, 1, m); b = np.zeros(m); a = 0.0
    for i in range(m): a = a * 0.86 + noise[i] * 0.14; b[i] = a
    env = np.clip(t / 0.11, 0, 1) * np.clip((dur + 0.35 - t) / 0.35, 0, 1) * (0.82 + 0.18 * np.exp(-t * 1.6))
    return (y + 0.10 * b * (1 + np.sin(ph))) * env

def pad(freq, dur):
    t = np.arange(int(dur * SR)) / SR
    y = sum(np.sin(2 * np.pi * freq * k * t + rng.uniform(0, 6.28)) / (k ** 1.8) for k in (1, 2, 3))
    env = np.minimum(1, t / 2.2) * np.minimum(1, (dur - t) / 2.6)
    return y * env * (1 + 0.06 * np.sin(2 * np.pi * 0.17 * t))

# A 羽五声：A C D E G
SC = [110.0, 130.81, 146.83, 164.81, 196.0, 220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0]
BPM = 63; beat = 60 / BPM; bar = beat * 3
end = tl["endcardAt"] if tl["endcardAt"] is not None else total
# 长音铺底与拨弦分解和弦：每小节一个根音，第一拍低音，二三拍各一个高一点的音
ROOTS = [0, 0, 2, 0, 4, 2, 0, 3, 0, 2, 4, 0, 3, 2, 0, 0, 2, 4, 0, 0, 0, 0, 0, 0]
for b_i, r in enumerate(ROOTS):
    t0 = b_i * bar
    if t0 > end - 0.5: break
    if b_i % 2 == 0: place(pad(SC[r], bar * 2 + 2.4), t0, 0, 0.045); place(pad(SC[r] * 1.5, bar * 2 + 2.4), t0, 0.25, 0.022)
    quiet = len(tl["cuts"]) > 4 and tl["cuts"][3] - 0.5 <= t0 < tl["cuts"][4] - 1.0   # 屋里那一镜只留长音和吹管，响度上留出起伏
    if t0 > 1.2 and not quiet:                                # 开头一小节只有长音，让图先出来
        place(pluck(SC[r], 3.0, 0.25), t0, 0, 0.13)
        place(pluck(SC[r + 5], 2.2, 0.55), t0 + beat, -0.35, 0.07)
        place(pluck(SC[r + 7 if r + 7 < len(SC) else r + 5], 2.2, 0.55), t0 + 2 * beat, 0.35, 0.06)
# 主奏：按镜头起点起句，句子在镜头里走完。写法是（音阶里的第几个音, 几拍）
PHRASES = [
    [(10, 3), (12, 1), (11, 2), (10, 1), (8, 2), (10, 3)],          # 图 → 院子
    [(8, 2), (10, 1), (11, 3), (10, 1), (8, 2)],                     # 荷池
    [(12, 2), (11, 1), (10, 2), (8, 1), (7, 3)],                     # 敞厅满洲窗
    [(7, 1), (8, 2), (10, 3), (11, 1), (12, 2), (13, 3), (12, 1), (10, 2), (8, 3)],   # 屋里转一圈，句子长一点
    [(10, 2), (8, 1), (7, 2), (8, 1), (10, 3)],                      # 廊桥
    [(13, 3), (12, 1), (10, 2), (11, 3)],                            # 壁山
    [(8, 1), (10, 2), (12, 3), (10, 1), (8, 2), (5, 3)],             # 回望，落回主音
]
# 剪短的版本（tools/cut40.py 生成的 timeline 带 shots 名字和 phraseTail）：句子按镜头名字取，
# 并在下一镜起点之后 phraseTail 秒内收住，免得长句子拖进后面几镜叠成三条吹管。整片版不带 phraseTail，行为不变。
NAMES = ["card", "pond", "hall", "inside", "bridge", "rock", "finale"]
BY_NAME = dict(zip(NAMES, PHRASES))
shot_names = [s.get("name") for s in tl.get("shots", [])]
tail = tl.get("phraseTail")
for si, cut in enumerate(tl["cuts"][:len(PHRASES)]):
    if tl["endcardAt"] is not None and cut >= tl["endcardAt"]: break
    phrase = BY_NAME.get(shot_names[si], PHRASES[si]) if tail is not None and si < len(shot_names) else PHRASES[si]
    stop = (tl["cuts"][si + 1] + tail) if tail is not None and si + 1 < len(tl["cuts"]) else end
    t = cut + (2.6 if si == 0 else 0.9)
    for deg, beats in phrase:
        if t > end - 0.4 or (tail is not None and t + beat * beats > stop + beat): break
        d = beat * beats
        place(flute(SC[deg], d * 0.94, bend=-0.03), t, 0.1 if si % 2 else -0.1, 0.11)
        t += d
# 署名页两声落定，和别的片子的署名页一致
if tl["endcardAt"] is not None:
    def thud(dur=0.25, f=300):
        tt = np.arange(int(dur * SR)) / SR
        return np.sin(2 * np.pi * f * tt) * np.exp(-tt * 46)
    for dt in (1.8, 2.8): place(thud(0.25, 300) + 0.5 * thud(0.25, 150), tl["endcardAt"] + dt, 0, 0.3)
    place(pad(SC[0], total - tl["endcardAt"] + 0.5), tl["endcardAt"], 0, 0.05); place(pad(SC[3], total - tl["endcardAt"] + 0.5), tl["endcardAt"], 0.2, 0.025)   # 署名页下面垫一层长音，免得最后两秒全静
    place(pluck(SC[5], 3.5, 0.3), tl["endcardAt"] + 0.2, 0, 0.13); place(pluck(SC[8], 3.5, 0.3), tl["endcardAt"] + 0.5, 0, 0.10)
mix *= np.minimum(1, (total - np.arange(n) / SR) / 1.0)[:, None]

with wave.open(str(out / "ambience.wav")) as w:
    amb = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).reshape(-1, 2) / 32768
amb = np.vstack([amb, np.zeros((max(0, n - len(amb)), 2))])[:n]
allmix = amb * 0.9 + mix
allmix /= max(1.0, np.abs(allmix).max() / 0.95)
for name, arr in (("music.wav", mix / max(1e-6, np.abs(mix).max()) * 0.8), ("mix.wav", allmix)):
    with wave.open(str(out / name), "w") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(arr, -1, 1) * 32767).astype(np.int16).tobytes())
subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(out / "film-silent.mp4"), "-i", str(out / "mix.wav"), "-c:v", "copy",
                "-af", "loudnorm=I=-15:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", "-movflags", "+faststart", final], check=True)
print("写出", final, f"{total:.1f} 秒")
