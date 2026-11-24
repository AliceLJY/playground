"""史前岛屿演示片的配乐、环境声、接署名页、合轨。页面本身没有声音，这里全部由代码合成，没有采样素材。

    <venv>/bin/python -I tools/demo-sound.py <demo.cjs 的输出目录> <成片.mp4> --endcard <署名页.mp4>
读 <目录>/timeline.json 与 screen.mp4，写 <目录>/music.wav（配乐）、<目录>/mix.wav（配乐加环境声），再合成成片（署名页叠化 0.5 秒接在最后一镜后面）。

配乐：D 大调，每分钟 120 拍，一小节 2 秒；连播里每个机位 8 秒，正好 4 小节，所以每次换机位都落在小节线上（脚本先核对一遍，对不上就报错）。
- 岛屿全景（开场 2 小节）：Dadd9 铺底慢慢涨起来，高处一串钟琴把主题动机先亮一下，底下是海浪；
- 水下剖面：镜头沉到水线，铺底和低音都闷下去（低通），开始有气泡；拇指琴慢慢拨主题；
- 礁盘：鱼群那一镜，拇指琴改成八分音符分解和弦、加沙锤，最亮的一段；
- 海沟：转 B 小调，低音换成长音，深处一声蛇颈龙类的低鸣（低频共振峰，音高往下滑）；
- 海滩（黑场切进）：黑场前一段风声往上推，切进来一记低鼓；回到水面上，海浪回来，长笛似的正弦吹主题，低鼓在一、三拍；
- 火山口（黑场切进）：全段最满，铜管似的锯齿和弦、定音鼓滚奏、熔岩低频隆隆、两三声翼龙叫，最后一拍落在 D 大调；
- 署名页：D 大调长音接着垫，两声落定音对着盖印章（1.8 秒）和按指纹（2.8 秒），最后 0.8 秒淡出。
混响：配乐整体过一个 2.4 秒衰减的卷积混响（左右声道两条不同的噪声冲激响应），听起来开阔一些。
响度：-12 LUFS 左右；限幅放在 4 倍采样率上做、限在 -3.5 dBFS，AAC 编码后真峰值要留在 0 以下（脚本最后读回成片实测）。
"""
import json, subprocess, sys, wave
from pathlib import Path
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

out, final = Path(sys.argv[1]), sys.argv[2]
endcard = sys.argv[sys.argv.index("--endcard") + 1] if "--endcard" in sys.argv else None
tl = json.loads((out / "timeline.json").read_text())
SR, FPS, XF = 48000, tl["fps"], 0.5
main = tl["dur"]
end_dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", endcard]).decode()) if endcard else 0.0
total = main + (end_dur - XF if endcard else 0)
n = int(round(total * SR))
rng = np.random.default_rng(48)
music = np.zeros((n, 2)); amb = np.zeros((n, 2))

def place(sig, t, pan=0.0, gain=1.0, bus=None):
    bus = music if bus is None else bus
    i = int(round(t * SR))
    if i >= n: return
    if sig.ndim == 1: sig = np.stack([sig * (1 - max(0, pan)), sig * (1 + min(0, pan))], 1)
    if i < 0: sig = sig[-i:]; i = 0
    sig = sig[: n - i] * gain
    bus[i:i + len(sig)] += sig

def tt(d): return np.arange(int(d * SR)) / SR
def adsr(t, d, a, r): return np.minimum(1, t / a) * np.clip((d - t) / r, 0, 1)
def lp(x, fc, order=2): return sosfilt(butter(order, fc, 'low', fs=SR, output='sos'), x, axis=0)
def hp(x, fc, order=2): return sosfilt(butter(order, fc, 'high', fs=SR, output='sos'), x, axis=0)
def bp(x, lo, hi, order=2): return sosfilt(butter(order, [lo, hi], 'band', fs=SR, output='sos'), x, axis=0)
def saw(ph): return 2 * (ph / (2 * np.pi) % 1) - 1
def hz(m): return 440 * 2 ** ((m - 69) / 12)

# ---------- 乐器 ----------
def pad(notes, d, a=1.2, r=1.5, cut=2400, det=0.006):        # 几个微失谐的锯齿叠起来过低通：暖的长音铺底
    t = tt(d); y = np.zeros(len(t))
    for m in notes:
        f = hz(m)
        for k in (-1, 0, 1): y += saw(2 * np.pi * f * (1 + k * det) * t + rng.uniform(0, 6.28))
    return hp(lp(y / (3 * len(notes)), cut), 110) * adsr(t, d, a, r)      # 低频让给低音，铺底不糊
def kalimba(m, d=1.6):                                      # 拇指琴：基音加两个不协和泛音，泛音衰减快
    t = tt(d); f = hz(m)
    y = np.sin(2 * np.pi * f * t) * np.exp(-t * 3) + 0.35 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 11) + 0.12 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 22)
    return y * np.minimum(1, t / 0.002)
def bell(m, d=3.0):
    t = tt(d); f = hz(m)
    return sum(a * np.sin(2 * np.pi * f * p * t) * np.exp(-t * k) for p, a, k in ((1, 1, 1.2), (2.0, 0.5, 2), (3.01, 0.25, 3.5), (4.17, 0.15, 5))) * np.minimum(1, t / 0.002)
def flute(m, d):                                            # 长笛似的：正弦加一点二次谐波，起音带气声，0.25 秒后才有颤音
    t = tt(d); f = hz(m); vib = 1 + 0.004 * np.sin(2 * np.pi * 5.2 * t) * np.clip((t - 0.25) / 0.3, 0, 1)
    ph = 2 * np.pi * np.cumsum(f * vib) / SR
    y = np.sin(ph) + 0.18 * np.sin(2 * ph) + 0.05 * np.sin(3 * ph)
    breath = bp(rng.normal(0, 1, len(t)), 1500, 6000) * 0.07 * (0.4 + np.exp(-t * 8))
    return (y + breath) * adsr(t, d, 0.07, 0.25)
def brass(notes, d, a=0.4, r=1.0):                         # 铜管似的和弦：锯齿，滤波随起音打开
    t = tt(d); y = np.zeros(len(t))
    for m in notes:
        for k in (-1, 1): y += saw(2 * np.pi * hz(m) * (1 + k * 0.003) * t)
    y /= 2 * len(notes)
    return (0.6 * lp(y, 900) + 0.4 * lp(y, 2600)) * adsr(t, d, a, r)
def bass(m, d, r=0.3):
    t = tt(d); f = hz(m); return (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t)) * adsr(t, d, 0.01, r) * 0.55
def lowdrum(f0=62, d=0.6):                                  # 低鼓：像远处的大鼓，不是电子底鼓
    t = tt(d); ph = 2 * np.pi * np.cumsum(f0 * (1 + 0.6 * np.exp(-t * 25))) / SR
    return (np.sin(ph) + 0.2 * lp(rng.normal(0, 1, len(t)), 300)) * np.exp(-t * 6) * np.minimum(1, t / 0.003)
def timpani(m, d=1.6):
    t = tt(d); f = hz(m); ph = 2 * np.pi * np.cumsum(f * (1 + 0.04 * np.exp(-t * 8))) / SR
    return (np.sin(ph) + 0.4 * np.sin(1.5 * ph) + 0.25 * lp(rng.normal(0, 1, len(t)), 500) * np.exp(-t * 20)) * np.exp(-t * 2.2) * np.minimum(1, t / 0.004)
def shaker(d=0.07):
    t = tt(d); return hp(rng.normal(0, 1, len(t)), 5000) * np.exp(-t * 55)
def bubble():
    d = rng.uniform(0.04, 0.09); t = tt(d); f0 = rng.uniform(350, 900)
    ph = 2 * np.pi * np.cumsum(f0 * (1 + 2.2 * t / d)) / SR
    return np.sin(ph) * np.sin(np.pi * t / d) ** 2
def call_low(d=2.4):                                        # 蛇颈龙类的低鸣：带颤的低频，两个共振峰，音高往下滑
    t = tt(d); f = 150 * (1 - 0.28 * t / d) * (1 + 0.015 * np.sin(2 * np.pi * 4.5 * t)); ph = 2 * np.pi * np.cumsum(f) / SR
    src = sum(np.sin(k * ph) / k for k in range(1, 16))
    return (bp(src, 180, 420) * 1.6 + bp(src, 600, 1100) * 0.7) * adsr(t, d, 0.4, 0.9)
def cry(d=0.42, f0=1400):                                   # 翼龙叫：一声往上挑再落下的尖音，带点沙
    t = tt(d); f = f0 * (1 + 0.35 * np.sin(np.pi * t / d)); ph = 2 * np.pi * np.cumsum(f) / SR
    y = np.sin(ph) + 0.35 * np.sin(2.01 * ph) + 0.25 * bp(rng.normal(0, 1, len(t)), 1500, 4000)
    return y * adsr(t, d, 0.03, 0.18) * 0.6
def whoosh(d):                                              # 黑场前往上推的风声：带通中心频率随时间升高
    t = tt(d); x = rng.normal(0, 1, len(t)); y = np.zeros(len(t)); blk = 960
    for i in range(0, len(t), blk):
        s = i / len(t); y[i:i + blk] = bp(x[max(0, i - 4800):i + blk], 200 + 2400 * s ** 2, 600 + 5000 * s ** 2)[-len(x[i:i + blk]):]
    return y * (t / d) ** 2.2 * adsr(t, d, 0.01, 0.06)
def boom(d=1.8):
    t = tt(d); return (np.sin(2 * np.pi * (38 + 30 * np.exp(-t * 6)) * t) + 0.3 * lp(rng.normal(0, 1, len(t)), 180)) * np.exp(-t * 2.6) * np.minimum(1, t / 0.004)
def click():
    t = tt(0.04); return (np.sin(2 * np.pi * 1700 * t) + 0.3 * rng.normal(0, 1, len(t))) * np.exp(-t * 140) * 0.5
def thud():
    t = tt(0.3); return np.sin(2 * np.pi * (60 + 50 * np.exp(-t * 30)) * t) * np.exp(-t * 14) * np.minimum(1, t / 0.002) + 0.3 * lp(rng.normal(0, 1, len(t)), 600) * np.exp(-t * 30)

# ---------- 时刻：从录像时间线里读每次换机位、黑场 ----------
F = tl["frames"]
starts = {}
for f in F: starts.setdefault(f["shot"], f["t"])
cuts = []
for a, b in zip(F, F[1:]):
    if a["fade"] == 0 and b["fade"] > 0: cuts.append({"down": b["t"]})
    if b["fade"] == 0 and a["fade"] > 0 and cuts: cuts[-1]["up"] = b["t"]
for c in cuts: c["mid"] = round((c["down"] + c["up"]) / 2 * 2) / 2      # 黑场最深那一刻（落在拍点上）
BPM = 120; beat = 60 / BPM; bar = 4 * beat
order = ["overview", "cutaway", "reef", "trench", "beach", "summit"]
sec = {}
for k in order:      # 换机位落在小节线上（滑过去的机位比画面早 1/30 秒到，黑场切进的取黑场最深处）
    t = starts[k]; snap = round(t / bar) * bar
    if abs(t - snap) > 0.1: raise SystemExit(f"{k} 在 {t:.3f} 秒，没落在小节线上（{snap}），配乐对不上，先查录制段落")
    sec[k] = snap
sec["end"] = main
print("机位起点", {k: round(v, 2) for k, v in sec.items()}, "黑场", cuts)
def bars(k): return sec[k], sec[order[order.index(k) + 1]] if order.index(k) + 1 < len(order) else sec["end"]

# 和声（MIDI）：每小节一个和弦
D_ADD9, BM7, GMAJ7, D_, ASUS, A_, BM, G_, EM, FSM, G_ADD9 = ([50, 57, 62, 64, 66], [47, 54, 57, 62, 66], [43, 50, 54, 59, 62], [50, 57, 62, 66], [45, 52, 57, 62, 64],
    [45, 52, 57, 61, 64], [47, 54, 59, 62, 66], [43, 50, 55, 59, 62], [40, 47, 52, 55, 59], [42, 49, 54, 57, 61], [43, 50, 55, 57, 62])
PROG = {"overview": [D_ADD9, D_ADD9], "cutaway": [BM7, GMAJ7, D_, ASUS], "reef": [D_, A_, BM, G_], "trench": [BM, G_, EM, FSM],
        "beach": [G_, D_, A_, BM], "summit": [G_ADD9, A_, BM, D_]}
MOTIF = [(0, 78, 1), (1, 81, 1), (2, 83, 1.5), (3.5, 81, 0.5), (4, 78, 2), (6, 76, 1), (7, 74, 1)]     # 拍位、音、拍长：F#–A–B–A–F#–E–D，两小节
MOTIF2 = [(0, 78, 1), (1, 81, 1), (2, 86, 2), (4, 83, 1), (5, 81, 1), (6, 78, 2)]

def chords(k, fn):
    a, b = bars(k)
    for i, ch in enumerate(PROG[k]):
        t0 = a + i * bar
        if t0 < b - 0.05: fn(t0, ch, min(bar, b - t0))

# ---------- 配乐 ----------
# 岛屿全景：铺底从第 0 帧起涨，第一拍有一声低音和钟琴
a, b = bars("overview")
place(pad(D_ADD9, b - a + 1.2, a=1.0, r=1.4, cut=1800), a, 0, 0.36)
place(bass(38, b - a + 0.4, r=0.6), a, 0, 0.30)
for j, (bt, m, l) in enumerate(MOTIF[:5]): place(bell(m + 12, 2.6), a + 0.5 + bt * beat * 0.75, -0.3 + 0.15 * j, 0.10)
# 水下剖面：闷下去，拇指琴慢慢拨主题
def under(t0, ch, d): place(pad(ch, d + 0.6, a=0.6, r=0.8, cut=900), t0, 0, 0.42); place(bass(ch[0] - 12 if ch[0] > 45 else ch[0], d, r=0.4), t0, 0, 0.30)
chords("cutaway", under)
a, b = bars("cutaway")
for rep in range(2):
    for bt, m, l in (MOTIF if rep == 0 else MOTIF2): place(kalimba(m - 12, 1.8), a + rep * 2 * bar + bt * beat, -0.15, 0.22)
# 礁盘：八分音符分解和弦、沙锤，最亮
def reef(t0, ch, d):
    place(pad(ch, d + 0.5, a=0.3, r=0.7, cut=2600), t0, 0, 0.30); place(bass(ch[0] - 12 if ch[0] > 45 else ch[0], d * 0.5), t0, 0, 0.30)
    place(bass(ch[0] - 12 if ch[0] > 45 else ch[0], d * 0.5), t0 + d * 0.5, 0, 0.22)
    arp = [ch[1] + 12, ch[2] + 12, ch[3] + 12, ch[-1] + 12, ch[3] + 12, ch[2] + 12, ch[3] + 12, ch[-1] + 12]
    for j, m in enumerate(arp): place(kalimba(m, 1.0), t0 + j * beat / 2, -0.4 + 0.1 * j, 0.11 if j % 2 else 0.14)
    for j in range(8): place(shaker(), t0 + j * beat / 2, 0.35, 0.05 if j % 2 else 0.03)
chords("reef", reef)
a, b = bars("reef")
for bt, m, l in MOTIF2: place(bell(m + 12, 2.0), a + 2 * bar + bt * beat, 0.25, 0.06)
# 海沟：B 小调长音、低音持续，蛇颈龙类低鸣，拍子变稀（每小节两下拇指琴低音）
def trench(t0, ch, d):
    place(pad(ch, d + 0.8, a=0.8, r=1.0, cut=700), t0, 0, 0.48); place(bass(ch[0] - 12 if ch[0] > 42 else ch[0], d, r=0.6), t0, 0, 0.36)
    for j in (0, 2.5): place(kalimba(ch[1], 2.0), t0 + j * beat, -0.2, 0.12)
chords("trench", trench)
a, b = bars("trench")
place(call_low(2.6), a + 1.0, -0.15, 0.20); place(call_low(2.0), a + 4.6, 0.2, 0.13)
# 海滩：黑场前风声往上推，切进来一记低鼓；长笛吹主题，低鼓一、三拍
cb, cs = cuts[0], cuts[1]
for c in (cb, cs): place(whoosh(c["mid"] - c["down"] + 0.6), c["down"] - 0.6, 0, 0.16); place(boom(), c["mid"], 0, 0.30)
def beach(t0, ch, d):
    place(pad(ch, d + 0.6, a=0.4, r=0.8, cut=2000), t0, 0, 0.30); place(bass(ch[0] - 12 if ch[0] > 45 else ch[0], d * 0.75), t0, 0, 0.32)
    place(bass(ch[0] - 12 if ch[0] > 45 else ch[0], d * 0.25), t0 + 1.5 * beat * 2, 0, 0.22)
    for j in range(4):
        place(kalimba(ch[1 + j % 3] + 12, 0.9), t0 + j * beat + beat / 2, 0.35, 0.07)
        if j % 2 == 0: place(lowdrum(), t0 + j * beat, 0, 0.42)
        place(shaker(), t0 + j * beat + beat / 2, 0.4, 0.035)
chords("beach", beach)
a, b = bars("beach")
for rep, mot in enumerate((MOTIF, MOTIF2)):
    for bt, m, l in mot: place(flute(m, l * beat + 0.15), a + rep * 2 * bar + bt * beat, -0.1, 0.17)
# 火山口：最满。铜管和弦、定音鼓滚奏、两三声翼龙叫，最后落在 D 大调
def summit(t0, ch, d):
    place(pad(ch, d + 0.5, a=0.2, r=0.6, cut=2800), t0, 0, 0.26); place(brass(ch[1:], d + 0.3), t0, 0, 0.30)
    place(bass(ch[0] - 12 if ch[0] > 42 else ch[0], d * 0.75), t0, 0, 0.36); place(timpani(ch[0] - 12 if ch[0] > 42 else ch[0]), t0, 0, 0.40)
    for j in range(4):
        place(lowdrum(70, 0.5), t0 + j * beat, 0, 0.36 if j % 2 == 0 else 0.20)
        place(shaker(), t0 + j * beat + beat / 2, 0.4, 0.04)
chords("summit", summit)
a, b = bars("summit")
for bt, m, l in MOTIF2: place(flute(m + 12, l * beat + 0.15), a + bt * beat, 0.15, 0.08); place(bell(m + 12, 1.5), a + bt * beat, 0.3, 0.04)
for bt, m, l in MOTIF[:5]: place(flute(m + 12, l * beat + 0.15), a + 2 * bar + bt * beat, 0.15, 0.09)
for j in range(12): place(timpani(38, 0.5), a + 2 * bar + 2 * beat + j * beat / 6 + 0.0, 0, 0.06 + 0.012 * j)     # 落 D 之前一串滚奏
for t, f0, pan in ((a + 0.9, 1500, -0.5), (a + 1.35, 1250, -0.45), (a + 4.4, 1650, 0.5)): place(cry(0.42, f0), t, pan, 0.08, amb)
# 收尾：D 大调长音一路垫进署名页（和弦在火山口最后一小节起音）
fin = sec["end"]
place(pad([38, 50, 57, 62, 66, 69], total - fin + 1.0, a=0.6, r=2.4, cut=1600), fin - 0.6, 0, 0.42)
place(bass(38, 2.5, r=1.8), fin, 0, 0.32); place(timpani(38, 2.4), fin, 0, 0.36)
for j, m in enumerate((74, 78, 81, 86)): place(bell(m, 3.2), fin + 0.25 + j * 0.3, -0.3 + 0.2 * j, 0.07)
if endcard:      # 署名页：两声落定（1.8 秒盖印章、2.8 秒按指纹）
    t_end = main - XF
    for dt in (1.8, 2.8): place(thud(), t_end + dt, 0, 0.5); place(click(), t_end + dt, 0, 0.4)

# ---------- 环境声：水面上是海浪，水下是闷的低频和气泡 ----------
def surf(d):
    t = tt(d); x = lp(rng.normal(0, 1, len(t)), 1400)
    swell = 0.55 + 0.45 * np.sin(2 * np.pi * t / 6.5 - 1.2) ** 2
    st = np.stack([x, np.roll(x, 2400)], 1) * swell[:, None]
    return hp(st, 90) * adsr(t, d, 1.0, 1.0)[:, None]
def underwater(d):
    t = tt(d); x = lp(rng.normal(0, 1, len(t)), 260) * (0.7 + 0.3 * np.sin(2 * np.pi * t / 5.0))
    return np.stack([x, np.roll(x, 1800)], 1) * adsr(t, d, 0.8, 0.8)[:, None]
place(surf(sec["cutaway"] + 1.0), 0, 0, 0.18, amb)
place(underwater(sec["beach"] - sec["cutaway"] + 0.2), sec["cutaway"] - 0.4, 0, 0.28, amb)
t = sec["cutaway"] + 0.3
while t < cb["down"]:
    if not (sec["trench"] - 0.5 < t < sec["trench"] + 2): place(bubble(), t, rng.uniform(-0.6, 0.6), rng.uniform(0.02, 0.05), amb)
    t += rng.exponential(0.22 if sec["reef"] <= t < sec["trench"] else 0.45)
place(surf(sec["end"] - cb["mid"] + 0.5), cb["mid"], 0, 0.20, amb)
lava = lp(rng.normal(0, 1, int((sec["end"] - cs["mid"] + 1.5) * SR)), 110); lt = np.arange(len(lava)) / SR
place(lava * (0.6 + 0.4 * np.sin(2 * np.pi * lt / 2.7)) * adsr(lt, lt[-1], 0.5, 1.5), cs["mid"], 0, 0.5, amb)

# ---------- 混响、混音 ----------
ir_t = tt(2.4); irs = [lp(rng.normal(0, 1, len(ir_t)), 5000) * np.exp(-ir_t * 2.9) for _ in range(2)]
for ir in irs: ir[:int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
wet = np.stack([fftconvolve(music[:, c], irs[c])[:n] for c in range(2)], 1)
wet *= np.sqrt(np.mean(music ** 2)) / max(1e-9, np.sqrt(np.mean(wet ** 2)))
music_rev = music + 0.32 * wet
fade = np.minimum(1, (total - np.arange(n) / SR) / 0.8)[:, None]
mix = (music_rev + amb) * fade
first = np.argmax(np.abs(mix).max(1) > 1e-4) / SR
def save(path, x):
    x = np.clip(x, -1, 1)
    with wave.open(str(path), "w") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((x * 32767).astype("<i2").tobytes())
save(out / "music.wav", music_rev * fade / max(1e-9, np.abs(music_rev).max()))
save(out / "mix.wav", mix / max(1e-9, np.abs(mix).max()) * 0.7)
print(f"首个有声样本 {first:.3f} 秒")

def measure(path, af=None):
    cmd = ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", (af + "," if af else "") + "ebur128=peak=true", "-f", "null", "-"]
    e = subprocess.run(cmd, capture_output=True, text=True).stderr; e = e[e.rindex("Summary:"):]
    return float(e.split("I:")[1].split("LUFS")[0]), float(e.split("Peak:")[1].split("dBFS")[0])
TARGET, LIMIT = -12.0, 10 ** (-3.5 / 20)
i0, _ = measure(out / "mix.wav"); gain = TARGET - i0
for _ in range(6):
    af = f"aresample=192000,volume={gain:.2f}dB,alimiter=limit={LIMIT:.4f}:attack=1:release=60:level=disabled,aresample=48000"
    i1, tp1 = measure(out / "mix.wav", af)
    if abs(i1 - TARGET) < 0.15: break
    gain += TARGET - i1
print(f"混音原始 {i0:.1f} LUFS，加 {gain:.1f} dB 并限幅后 {i1:.1f} LUFS、真峰 {tp1:.1f} dBFS")
BT = "bt709"
fc = f"[0:v]fps={FPS},format=yuv420p,setsar=1[main]"
inputs = ["-i", str(out / "screen.mp4")]
if endcard:
    inputs += ["-i", endcard]
    fc += f";[1:v]fps={FPS},format=yuv420p,setsar=1[end];[main][end]xfade=transition=fade:duration={XF}:offset={main - XF:.3f}[v]"
    vmap = "[v]"
else: vmap = "[main]"
subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *inputs, "-i", str(out / "mix.wav"), "-filter_complex", fc, "-map", vmap, "-map", f"{2 if endcard else 1}:a",
                "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-color_range", "tv", "-colorspace", BT, "-color_primaries", BT, "-color_trc", BT, "-r", str(FPS),
                "-af", af, "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", f"{total:.3f}", "-movflags", "+faststart", final], check=True)
i2, tp2 = measure(final)
print(f"写出 {final}：正片 {main:.2f} 秒 + 署名页，共 {total:.2f} 秒；成片实测 {i2:.1f} LUFS，真峰 {tp2:.1f} dBFS")
