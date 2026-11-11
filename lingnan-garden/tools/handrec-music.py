# /// script
# dependencies = ["numpy"]
# ///
# 手机录屏版的配乐、套外框、接署名页、合轨。用法：
#   uv run tools/handrec-music.py <handrec.cjs 的输出目录> <成片.mp4> [--endcard <署名页.mp4>]
# 读 <目录>/cues.json、screen.mp4、ambience.wav、frame-bg.png、frame-phone.png。
# 配乐跟着手走：点按钮有一声小铃；推摇杆走起来拍子才进；屋里每甩一下是一串上行的快音，甩完落一个长音；
# 「带我逛一圈」时拖一下停住，音乐也跟着停到只剩长音，点「继续逛」再接上；俯瞰时上面再叠一层高音，收在主音上。
# 和这支片的导览版（A 羽调、三拍子、每分钟 63 拍、洞箫）以及十三行那支（D 宫、四拍、拨弦加木鱼）有意不同：
# 这段是 G 徵调、二拍子、每分钟 112 拍，主奏是敲出来的亮音（类扬琴），下面是木琴一样的低音和很轻的沙锤。
import json, subprocess, sys, wave
from pathlib import Path
import numpy as np

out, final = Path(sys.argv[1]), sys.argv[2]
endcard = sys.argv[sys.argv.index("--endcard") + 1] if "--endcard" in sys.argv else None
cj = json.loads((out / "cues.json").read_text())
SR, FPS, XF = 48000, cj["fps"], 0.5
main = cj["dur"]
end_dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", endcard]).decode()) if endcard else 0.0
total = main + (end_dur - XF if endcard else 0)
n = int(round(total * SR))
rng = np.random.default_rng(2611)
mix = np.zeros((n, 2))

def place(sig, t, pan=0.0, gain=1.0):
    i = int(t * SR)
    if i >= n or i < 0: return
    sig = sig[: n - i] * gain
    mix[i:i + len(sig), 0] += sig * (1 - max(0, pan)); mix[i:i + len(sig), 1] += sig * (1 + min(0, pan))

def struck(freq, dur=1.1, bright=1.0):   # 敲弦的亮音：一组衰减快慢不同的泛音，两根弦略微不齐
    t = np.arange(int(dur * SR)) / SR; y = np.zeros_like(t)
    for det in (1.0, 1.0035):
        for k in range(1, 9):
            y += np.sin(2 * np.pi * freq * det * k * t + 0.3 * k) * np.exp(-t * (2.6 + 1.5 * k)) * bright ** (k - 1) / k ** 1.15
    return y * np.minimum(1, t / 0.003) * 0.5

def mallet(freq, dur=0.7):               # 木琴一样的低音
    t = np.arange(int(dur * SR)) / SR
    return (np.sin(2 * np.pi * freq * t) * np.exp(-t * 7) + 0.35 * np.sin(2 * np.pi * freq * 3.9 * t) * np.exp(-t * 26)) * np.minimum(1, t / 0.004)

def ding(freq, dur=0.9):                 # 点按钮的小铃
    t = np.arange(int(dur * SR)) / SR
    return (np.sin(2 * np.pi * freq * t) + 0.45 * np.sin(2 * np.pi * freq * 2.76 * t) * np.exp(-t * 5) + 0.2 * np.sin(2 * np.pi * freq * 5.4 * t) * np.exp(-t * 9)) * np.exp(-t * 5.5) * np.minimum(1, t / 0.002)

def shaker(dur=0.05):
    m = int(dur * SR); x = rng.normal(0, 1, m); x = np.diff(x, prepend=0)      # 高通一下，只剩沙沙声
    return x * np.exp(-np.arange(m) / SR * 70)

def pad(freq, dur, a=0.9, r=1.4):
    t = np.arange(int(dur * SR)) / SR
    y = sum(np.sin(2 * np.pi * freq * k * t + rng.uniform(0, 6.28)) / (k ** 1.9) for k in (1, 2, 3))
    return y * np.minimum(1, t / a) * np.minimum(1, np.maximum(0, dur - t) / r) * (1 + 0.05 * np.sin(2 * np.pi * 0.23 * t))

# G 徵五声：G A C D E
SC = [98.0, 110.0, 130.81, 146.83, 164.81, 196.0, 220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0, 1046.5]
BPM = 112; beat = 60 / BPM; e8 = beat / 2
ev = cj["events"]; cues = cj["cues"]
taps = [c for c in cues if c["type"] == "tap"]
swipes = [c for c in cues if c.get("name", "").startswith(("屋里甩", "甩第"))]
slow = [c for c in cues if c.get("name", "").startswith("慢慢拖过")]
spin_all = swipes + slow
t_walk, t_arr, t_tour, t_top = ev["walk"], ev["arr"], ev["tour"], ev["top"]
t_pause = next(c["t"] for c in cues if c.get("name", "").startswith("逛着的时候"))
t_resume = next(c["end"] for c in cues if c.get("name") == "点「继续逛」")
spin_end = max(c["end"] for c in spin_all)

# 长音铺底：全程都在，停住那一段只剩它
for t0, root in ((0.0, 5), (t_walk, 5), (t_arr, 7), (t_tour, 5), (t_top, 5)):
    seg_end = min([x for x in (t_walk, t_arr, t_tour, t_top, main) if x > t0 + 0.01] or [main])
    place(pad(SC[root] / 2, seg_end - t0 + 1.2), t0, 0, 0.035); place(pad(SC[root] * 0.75, seg_end - t0 + 1.2), t0, 0.2, 0.02)

# 点按钮的小铃：音高按次序往上走
for i, c in enumerate(taps):
    place(ding(SC[10 + (i * 2) % 6] * (2 if i % 3 == 2 else 1)), c["t"] + 0.03, 0.15 if i % 2 else -0.15, 0.085)

# 拍子和旋律：从走起来开始，按 8 分音符的格子走。每小节两拍四个音
MOT = [[10, 12, 13, 12], [14, 13, 12, 10], [10, 11, 12, 14], [13, 12, 11, 10], [12, 13, 14, 15], [14, 12, 13, 10], [10, 12, 14, 13], [12, 11, 10, 10]]
BASS = [5, 5, 7, 5, 6, 7, 8, 5]
def groove(t0, t1, octave=1.0, first_bar=0, melody=True):
    bar = first_bar; t = t0
    while t < t1 - 0.05:
        b = BASS[bar % 8]
        place(mallet(SC[b] / 2), t, 0, 0.33)
        if t + beat < t1: place(mallet(SC[b] * 0.75), t + beat, 0, 0.22)
        for k in range(4):
            tk = t + k * e8
            if tk >= t1 - 0.02: break
            if k % 2 == 1: place(shaker(), tk, 0.4, 0.022)
            if melody and not (bar % 4 == 3 and k == 3):     # 每四小节最后空一个音，喘口气
                place(struck(SC[MOT[bar % 8][k]] * octave, 0.9 if k < 3 else 1.3, 0.92), tk, -0.2 + 0.13 * k, 0.14 if k == 0 else 0.11)
        bar += 1; t += 2 * beat
    return bar
# 开头（对照原图那几下）：只有长音、小铃和每拍一个轻轻的亮音
t = 0.25
while t < t_walk - 0.3:
    place(struck(SC[10 if int(t / beat) % 2 == 0 else 12], 1.2, 0.85), t, 0.1, 0.03); t += beat
bar = groove(t_walk, t_arr - 0.05)
# 屋里：每甩一下一串上行的快音，一下比一下高；甩完落一个长音
for i, c in enumerate(swipes):
    span = max(0.16, c["end"] - c["t"])
    run = [10 + i, 11 + i, 12 + i, 13 + i]
    for k, d in enumerate(run):
        place(struck(SC[min(d, len(SC) - 1)], 0.7, 1.0), c["t"] + k * span / 4, -0.3 + 0.2 * k, 0.10 + 0.01 * i)
    place(mallet(SC[5 + (i % 3)] / 2 * (1.5 if i % 2 else 1)), c["t"], 0, 0.22)
# 慢慢拖过满洲窗那两笔：一句舒展的长音，每笔四个音往上走
for i, c in enumerate(slow):
    span = c["end"] - c["t"]
    for k, d in enumerate(([12, 13, 14, 15], [13, 14, 15, 16])[i % 2]):
        place(struck(SC[d], 1.6, 0.85), c["t"] + k * span / 4, -0.25 + 0.17 * k, 0.085)
    place(mallet(SC[7 if i == 0 else 8] / 2, 1.0), c["t"], 0, 0.2)
place(struck(SC[15], 1.8, 0.9), spin_end + 0.05, 0, 0.13); place(struck(SC[12], 1.8, 0.9), spin_end + 0.05, 0.2, 0.08); place(mallet(SC[5] / 2, 1.0), spin_end + 0.05, 0, 0.26)
# 逛一圈：拍子接上；拖一下停住，音乐也停（只留长音和一声往下的滑音）；点「继续逛」再接上
bar = groove(t_tour + 0.12, t_pause, first_bar=bar)
place(struck(SC[12], 1.0, 0.8), t_pause + 0.02, 0, 0.09); place(struck(SC[10], 1.4, 0.8), t_pause + 0.02 + e8, 0, 0.08)
bar = groove(t_resume + 0.05, t_top - 0.02, first_bar=bar)
# 俯瞰：旋律上面再叠一层高音，最后收在主音上
last = main - 0.9
bar = groove(t_top + 0.1, last, first_bar=bar)
t = t_top + 0.1; hi = [15, 14, 13, 15, 14, 12, 13, 15]; k = 0
while t < last - 0.05:
    place(struck(SC[hi[k % 8]], 1.0, 0.95), t, 0.3, 0.05); t += beat; k += 1   # 上面再叠一层每拍一个的高音
for d, g, p in ((10, 0.14, 0), (12, 0.09, -0.2), (14, 0.08, 0.2), (15, 0.07, 0)):
    place(struck(SC[d], 2.6, 0.9), last, p, g)
place(mallet(SC[5] / 2, 1.4), last, 0, 0.3)
# 署名页：长音垫底，两声落定（和别的片子的署名页一致）
if endcard:
    t_end = main - XF
    def thud(dur=0.25, f=300):
        tt = np.arange(int(dur * SR)) / SR
        return np.sin(2 * np.pi * f * tt) * np.exp(-tt * 46)
    for dt in (1.8, 2.8): place(thud(0.25, 300) + 0.5 * thud(0.25, 150), t_end + dt, 0, 0.3)
    place(pad(SC[5] / 2, total - t_end + 0.3, 0.6, 1.2), t_end, 0, 0.06); place(pad(SC[8] / 2, total - t_end + 0.3, 0.6, 1.2), t_end, 0.2, 0.03)
    place(struck(SC[10], 3.0, 0.8), t_end + 0.25, 0, 0.09); place(struck(SC[13], 3.0, 0.8), t_end + 0.55, 0.15, 0.07)
mix *= np.minimum(1, (total - np.arange(n) / SR) / 0.6)[:, None]

with wave.open(str(out / "ambience.wav")) as w:
    amb = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).reshape(-1, 2) / 32768
amb = np.vstack([amb, np.zeros((max(0, n - len(amb)), 2))])[:n]
if endcard:   # 环境声在进署名页时退掉
    k = np.clip((main - np.arange(n) / SR) / XF, 0, 1); amb *= k[:, None]
allmix = amb * 0.6 + mix
allmix /= max(1.0, np.abs(allmix).max() / 0.95)
for name, arr in (("music.wav", mix / max(1e-6, np.abs(mix).max()) * 0.8), ("mix.wav", allmix)):
    with wave.open(str(out / name), "w") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(arr, -1, 1) * 32767).astype(np.int16).tobytes())

# 响度：竖屏短片交付 -12 LUFS 左右（video-director 返工规律里的默认值）。先量整段，再整体提，峰值用限幅器压在 -1.5 dB 以内，不动起伏
import re
m = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(out / "mix.wav"), "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
measured = float(re.findall(r"I:\s+(-?[\d.]+) LUFS", m)[-1])
gain = -12.0 - measured + 0.7        # 限幅器会吃掉约 0.7 dB，补回来
af = f"volume={gain:.2f}dB,alimiter=limit=0.84:attack=3:release=60:level=false"
print(f"混音实测 {measured:.1f} LUFS，整体提 {gain:.1f} dB")
# 画面：底图 + 手机屏幕内容（缩到 640 宽，放在 220,200）+ 外框叠层；再叠化到署名页
BT = "bt709"
fc = (f"[0:v]scale=out_color_matrix={BT}:out_range=tv,format=yuv444p[bg];"
      f"[1:v]scale=640:1304:flags=lanczos,format=yuv444p[scr];"
      f"[2:v]scale=out_color_matrix={BT}:out_range=tv,format=yuva444p[ph];"
      f"[bg][scr]overlay=220:200:shortest=1[a];[a][ph]overlay=0:0,fps={FPS},format=yuv420p,setsar=1[main]")
inputs = ["-loop", "1", "-framerate", str(FPS), "-t", f"{main:.3f}", "-i", str(out / "frame-bg.png"), "-i", str(out / "screen.mp4"),
          "-loop", "1", "-framerate", str(FPS), "-t", f"{main:.3f}", "-i", str(out / "frame-phone.png")]
if endcard:
    inputs += ["-i", endcard]
    fc += f";[3:v]fps={FPS},format=yuv420p,setsar=1[end];[main][end]xfade=transition=fade:duration={XF}:offset={main - XF:.3f}[v]"
    vmap = "[v]"
else: vmap = "[main]"
subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *inputs, "-i", str(out / "mix.wav"), "-filter_complex", fc, "-map", vmap, "-map", f"{4 if endcard else 3}:a",
                "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-color_range", "tv", "-colorspace", BT, "-color_primaries", BT, "-color_trc", BT, "-r", str(FPS),
                "-af", af, "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", f"{total:.3f}", "-movflags", "+faststart", final], check=True)
print("写出", final, f"正片 {main:.2f} 秒 + 署名页，共 {total:.2f} 秒")
