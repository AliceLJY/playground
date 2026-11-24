"""环形空间站演示片的配乐、音效、接署名页、合轨。页面本身没有声音，这里全部由代码合成，没有采样素材。

    <venv>/bin/python -I tools/demo-sound.py <demo.cjs 的输出目录> <成片.mp4> --endcard <署名页.mp4>
读 <目录>/timeline.json 与 screen.mp4，写 <目录>/music.wav（配乐）、<目录>/mix.wav（配乐加音效），再合成成片（署名页叠化 0.5 秒接在最后一镜后面）。

配乐：每分钟 96 拍，一小节 2.5 秒；连播里每个机位 5 秒，正好 2 小节，换机位都落在小节线上（脚本先核对，对不上就报错）。
D 小调为主，收在 D 大调（日出）。
- 建立全景：Dm9 长音从第 0 帧涨起来，高处一层细碎的闪光（高频正弦颗粒），第一拍一声很低的轰；
- 桁架掠过（黑场切进）：一记撞击切进来，十六分音符的方波琶音开始，滤波慢慢打开；
- 环区旋转（黑场切进）：琶音更亮，加一层随环转动的低嗡（左右来回摆）、细碎的踩镲；
- 接近（花园那一镜录制时跳过了，15 秒处两段在全黑处接上）：八分音符的低音脉冲进来，推力器喷几下（短促的高通噪声）；
- 对齐：每小节一声声呐似的提示音，和弦往上走，越来越紧；
- 对接口：接触前一拍音乐收空，只剩一条往上推的噪声，接触那一帧（读数归零）一声金属撞击加低频轰；
- 停稳：12 个挂钩每锁上一个一声金属咔哒（时刻取自录像里挂钩读数每次加一的那一帧，音高逐个升高），12/12 时两声上行提示音；
- 地球日出（黑场切进）：转 D 大调，和弦整片铺开，相机看到太阳那一刻（场景 43 秒）一串高处的钟声；
- 署名页：D 大调长音接着垫，两声落定音对着盖印章（1.8 秒）和按指纹（2.8 秒），最后 0.8 秒淡出。
混响：配乐整体过一个 3 秒衰减的卷积混响。响度 -12 LUFS 左右；限幅在 4 倍采样率上做、限在 -3.5 dBFS，最后读回成片实测。
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
rng = np.random.default_rng(50)
music = np.zeros((n, 2)); sfx = np.zeros((n, 2))

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
def sq(ph, w=0.5): return np.where(ph / (2 * np.pi) % 1 < w, 1.0, -1.0)
def hz(m): return 440 * 2 ** ((m - 69) / 12)

# ---------- 乐器 ----------
def pad(notes, d, a=1.5, r=1.8, cut=2000, det=0.007):
    t = tt(d); y = np.zeros(len(t))
    for m in notes:
        f = hz(m)
        for k in (-1, 0, 1): y += saw(2 * np.pi * f * (1 + k * det) * t + rng.uniform(0, 6.28))
    y = hp(lp(y / (3 * len(notes)), cut), 110)
    lfo = 1 + 0.12 * np.sin(2 * np.pi * 0.23 * t)          # 慢慢呼吸
    return y * lfo * adsr(t, d, a, r)
def choir(notes, d, a=1.2, r=2.0):                         # 「啊」元音似的铺底：锯齿过两个共振峰
    t = tt(d); y = np.zeros(len(t))
    for m in notes:
        f = hz(m) * (1 + 0.003 * np.sin(2 * np.pi * 5 * t + rng.uniform(0, 6)))
        y += saw(2 * np.pi * np.cumsum(f) / SR)
    y /= len(notes)
    return (bp(y, 650, 1100) * 1.4 + bp(y, 1100, 1500) * 0.7 + lp(y, 400) * 0.4) * adsr(t, d, a, r)
def arp_note(m, d, cut):                                   # 琶音：窄方波，短促，过低通
    t = tt(d); y = sq(2 * np.pi * hz(m) * t, 0.3)
    return lp(y, cut) * np.exp(-t * 9) * np.minimum(1, t / 0.003) * 1.7
def bass(m, d, r=0.12):
    t = tt(d); f = hz(m); ph = 2 * np.pi * f * t
    return (np.sin(ph) + 0.4 * lp(saw(ph), 500)) * adsr(t, d, 0.006, r) * 0.42
def bell(m, d=3.0):
    t = tt(d); f = hz(m)
    return sum(a * np.sin(2 * np.pi * f * p * t) * np.exp(-t * k) for p, a, k in ((1, 1, 1.0), (2.0, 0.5, 1.8), (3.01, 0.25, 3), (4.17, 0.15, 4.5))) * np.minimum(1, t / 0.002)
def glitter(d, density=14):                                # 高处细碎的闪光：一串很短的高频正弦颗粒
    y = np.zeros((int(d * SR), 2)); t = 0.0
    while t < d - 0.2:
        g = bell(rng.choice([86, 88, 90, 93, 95, 98]), 0.5) * 0.25; i = int(t * SR); p = rng.uniform(-0.8, 0.8)
        g = g[: len(y) - i]; y[i:i + len(g), 0] += g * (1 - max(0, p)); y[i:i + len(g), 1] += g * (1 + min(0, p))
        t += rng.exponential(1 / density)
    tt_ = np.arange(len(y)) / SR; return y * adsr(tt_, d, 0.8, 0.8)[:, None]
def hat(d=0.05):
    t = tt(d); return hp(rng.normal(0, 1, len(t)), 7000) * np.exp(-t * 70)
def sub_boom(d=2.2):
    t = tt(d); return np.sin(2 * np.pi * np.cumsum(32 + 30 * np.exp(-t * 5)) / SR) * np.exp(-t * 2.2) * np.minimum(1, t / 0.01) * 0.7
def impact(d=1.6):                                         # 黑场切进来那一记：低频撞击加一点金属
    t = tt(d); body = np.sin(2 * np.pi * (45 + 60 * np.exp(-t * 18)) * t) * np.exp(-t * 4)
    noise = bp(rng.normal(0, 1, len(t)), 200, 3000) * np.exp(-t * 18)
    return body + 0.5 * noise
def metal_hit(d=2.4):                                      # 对接接触：不协和的金属分音长响，加低频一顿
    t = tt(d); y = np.zeros(len(t))
    for p, a, k in ((182, 1, 2.2), (403, 0.7, 3), (611, 0.5, 3.6), (957, 0.35, 5), (1442, 0.25, 7), (2210, 0.15, 9)):
        y += a * np.sin(2 * np.pi * p * t + rng.uniform(0, 6)) * np.exp(-t * k)
    thump = np.sin(2 * np.pi * (55 + 70 * np.exp(-t * 25)) * t) * np.exp(-t * 6)
    return (0.5 * y + 1.2 * thump + 0.4 * bp(rng.normal(0, 1, len(t)), 500, 4000) * np.exp(-t * 40)) * np.minimum(1, t / 0.001)
def latch(k):                                              # 挂钩锁上：短促的金属咔哒，音高随序号升高
    t = tt(0.25); f = 900 * 2 ** (k / 24)
    y = np.sin(2 * np.pi * f * t) * np.exp(-t * 30) + 0.5 * np.sin(2 * np.pi * f * 2.43 * t) * np.exp(-t * 45)
    return y * 0.6 + 0.8 * hp(rng.normal(0, 1, len(t)), 2500) * np.exp(-t * 120) + 0.6 * np.sin(2 * np.pi * 120 * t) * np.exp(-t * 40)
def thruster(d=0.35):                                      # 姿控推力器：一小股高通噪声，起得快、收得慢
    t = tt(d); return hp(rng.normal(0, 1, len(t)), 1800) * np.minimum(1, t / 0.01) * np.exp(-t * 9)
def ping(f=1320, d=1.6):                                   # 声呐似的提示音
    t = tt(d); return (np.sin(2 * np.pi * f * t) + 0.2 * np.sin(2 * np.pi * f * 2 * t)) * np.exp(-t * 3.2) * np.minimum(1, t / 0.004)
def riser(d):
    t = tt(d); x = rng.normal(0, 1, len(t)); y = np.zeros(len(t)); blk = 960
    for i in range(0, len(t), blk):
        s = i / len(t); y[i:i + blk] = bp(x[max(0, i - 4800):i + blk], 300 + 3000 * s ** 2, 900 + 7000 * s ** 2)[-len(x[i:i + blk]):]
    return y * (t / d) ** 2 * np.clip((d - t) / 0.02, 0, 1)
def hum(d, rate=0.8):                                      # 居住环转过镜头的低嗡：左右来回摆
    t = tt(d); x = lp(saw(2 * np.pi * 55 * t) + 0.5 * saw(2 * np.pi * 82.5 * t), 300) * adsr(t, d, 0.6, 0.6)
    p = np.sin(2 * np.pi * rate * t) * 0.7
    return np.stack([x * (1 - np.maximum(0, p)), x * (1 + np.minimum(0, p))], 1)
def thud():
    t = tt(0.3); return np.sin(2 * np.pi * (60 + 50 * np.exp(-t * 30)) * t) * np.exp(-t * 14) * np.minimum(1, t / 0.002) + 0.3 * lp(rng.normal(0, 1, len(t)), 600) * np.exp(-t * 30)
def click():
    t = tt(0.04); return (np.sin(2 * np.pi * 1700 * t) + 0.3 * rng.normal(0, 1, len(t))) * np.exp(-t * 140) * 0.5

# ---------- 时刻：从录像时间线读换机位、黑场、接触、挂钩 ----------
F = tl["frames"]
starts = {}
for f in F: starts.setdefault(f["shot"], f["t"])
BPM = 96; beat = 60 / BPM; bar = 4 * beat
order = [k for k in ["establish", "truss", "ring", "garden", "approach", "align", "port", "settle", "sunrise", "axis"] if k in starts]
sec = {}
for k in order:
    t = starts[k]; snap = round(t / bar) * bar
    if abs(t - snap) > 0.1: raise SystemExit(f"{k} 在 {t:.3f} 秒，没落在小节线上（{snap}），配乐对不上，先查录制段落")
    sec[k] = snap
sec["end"] = main
def span(k):
    i = order.index(k); return sec[k], (sec[order[i + 1]] if i + 1 < len(order) else sec["end"])
contact = next(f["t"] for f in F if f["dist"] <= 0.001)
latches = [b["t"] for a, b in zip(F, F[1:]) if b["latched"] > a["latched"]]
sun_seen = next((f["t"] for f in F if f["shot"] == "sunrise" and f["scene"] % 50 >= 43.0), None)    # SPEC A6：日出机位的相机 43 秒看到日出
print("机位起点", {k: round(v, 2) for k, v in sec.items()}, f"接触 {contact:.2f}，挂钩 {len(latches)} 个 {latches[0]:.2f}–{latches[-1]:.2f}，看到太阳 {sun_seen}")
cut_in = [k for k in order if k in ("truss", "ring", "approach", "sunrise", "axis", "garden")]

Dm9, BbM7, Gm9, Asus, Fadd9, Cadd9, Bbadd9, D_maj, Gadd9 = ([38, 50, 57, 60, 64, 65], [34, 46, 53, 57, 62], [31, 43, 50, 53, 57, 58], [33, 45, 52, 57, 62, 64],
    [29, 41, 48, 53, 55, 57], [36, 48, 55, 60, 62, 64], [34, 46, 53, 58, 60, 62], [38, 50, 57, 62, 66, 69], [31, 43, 50, 55, 57, 62])
PROG = {"establish": [Dm9, Dm9], "truss": [Dm9, BbM7], "ring": [Gm9, Asus], "approach": [Dm9, Dm9], "align": [BbM7, Cadd9],
        "port": [Gm9, Asus], "settle": [Fadd9, Cadd9], "sunrise": [Gadd9, D_maj]}

# ---------- 配乐 ----------
def bed(k, gain=0.34, cut=1800):
    a, b = span(k)
    for i, ch in enumerate(PROG[k]):
        t0 = a + i * bar
        if t0 < b - 0.05: place(pad(ch[1:], min(bar, b - t0) + 0.9, a=0.5 if i else 0.9, r=0.9, cut=cut), t0, 0, gain)
def arp(k, cut0, cut1, gain=0.09, octave=12):
    a, b = span(k); steps = int(round((b - a) / (beat / 4)))
    for j in range(steps):
        t0 = a + j * beat / 4; ch = PROG[k][min(len(PROG[k]) - 1, int((t0 - a) / bar))]
        notes = [ch[1], ch[2], ch[3], ch[2] + 12, ch[3], ch[4] if len(ch) > 4 else ch[3] + 12, ch[3] + 12, ch[2] + 12]
        cut = cut0 + (cut1 - cut0) * j / steps
        place(arp_note(notes[j % 8] + octave - 12, 0.3, cut), t0, 0.5 * np.sin(j * 0.7), gain * (1.25 if j % 4 == 0 else 1))
def pulse(k, gain=0.32):
    a, b = span(k); j = 0
    while a + j * beat / 2 < b - 0.05:
        t0 = a + j * beat / 2; ch = PROG[k][min(len(PROG[k]) - 1, int((t0 - a) / bar))]
        place(bass(ch[0] if ch[0] >= 33 else ch[0] + 12, beat / 2 * 0.8), t0, 0, gain * (1.2 if j % 2 == 0 else 0.8)); j += 1

# 建立全景
a, b = span("establish")
bed("establish", 0.36, 1400); place(sub_boom(3.0), 0.0, 0, 0.55); place(glitter(b - a + 1.0, 10), a + 0.3, 0, 0.12)
place(bass(38, b - a + 0.5, r=1.0), a, 0, 0.30)
# 黑场切进的每一镜：黑场前一段往上推，最黑处一记撞击
for k in cut_in:
    t = sec[k]; place(riser(0.6), t - 0.6, 0, 0.10, sfx); place(impact(), t, 0, 0.34, sfx)
# 桁架、环区：琶音、低嗡、踩镲
bed("truss", 0.30, 1600); arp("truss", 500, 1600, 0.08); pulse("truss", 0.18)
bed("ring", 0.30, 2000); arp("ring", 1400, 3200, 0.085); pulse("ring", 0.24)
a, b = span("ring"); place(hum(b - a + 0.3, 0.6), a, 0, 0.12, sfx)
for j in range(int((b - a) / (beat / 2))): place(hat(), a + j * beat / 2 + beat / 4, 0.4, 0.05 if j % 2 else 0.035)
# 接近：低音脉冲、推力器
bed("approach", 0.30, 1600); arp("approach", 900, 2000, 0.07); pulse("approach", 0.34)
a, b = span("approach")
for j, dt in enumerate((0.7, 1.15, 2.6, 3.4, 4.3)): place(thruster(), a + dt, (-0.6, 0.6, -0.4, 0.5, -0.2)[j], 0.10, sfx)
for j in range(int((b - a) / beat)): place(hat(0.04), a + j * beat + beat / 2, -0.4, 0.04)
# 对齐：每小节一声提示音，越来越紧
bed("align", 0.32, 2200); arp("align", 1600, 3600, 0.08); pulse("align", 0.34)
a, b = span("align")
for j, t0 in enumerate(np.arange(a, b - 0.1, bar / 2)): place(ping(1320 if j % 2 == 0 else 1760), t0, 0.3 * (-1) ** j, 0.09, sfx)
for j in range(int((b - a) / (beat / 2))): place(hat(), a + j * beat / 2, 0.4, 0.05 if j % 2 else 0.03)
for dt in (1.3, 3.1): place(thruster(0.25), a + dt, 0.5, 0.08, sfx)
# 对接口：接触前一拍收空，只剩往上推的噪声；接触那一帧撞击
a, b = span("port")
quiet = contact - beat * 1.5
def port(t0, t1):
    for i, ch in enumerate(PROG["port"]):
        s = a + i * bar
        if s < t1: place(pad(ch[1:], min(bar, t1 - s) + 0.4, a=0.4, r=0.35, cut=2400), s, 0, 0.32)
    j = 0
    while a + j * beat / 2 < t1 - 0.05:
        s = a + j * beat / 2; ch = PROG["port"][min(1, int((s - a) / bar))]
        place(bass(ch[0] if ch[0] >= 33 else ch[0] + 12, beat / 2 * 0.8), s, 0, 0.36 if j % 2 == 0 else 0.26)
        place(arp_note([ch[2], ch[3], ch[2] + 12, ch[3] + 12][j % 4], 0.3, 2800), s, 0.4 * np.sin(j), 0.08)
        place(hat(), s + beat / 4, 0.4, 0.045); j += 1
port(a, quiet)
place(riser(contact - quiet), quiet, 0, 0.16, sfx); place(pad([50, 57, 62, 64], contact - quiet + 0.2, a=contact - quiet, r=0.05, cut=3000), quiet, 0, 0.18)
place(metal_hit(), contact, 0, 0.46, sfx); place(sub_boom(2.0), contact, 0, 0.45)
# 停稳：挂钩一个个锁上，12/12 两声上行提示音；音乐回来
bed("settle", 0.30, 1800); pulse("settle", 0.22)
for i, t0 in enumerate(latches[:12]): place(latch(i), t0, 0.5 * np.sin(i * 2 * np.pi / 12), 0.28, sfx)
if len(latches) >= 12:
    done = latches[11]; place(ping(1175, 1.2), done + 0.25, -0.2, 0.08, sfx); place(ping(1568, 1.6), done + 0.45, 0.2, 0.08, sfx)
a, b = span("settle")
for j in range(int((b - a) / beat)): place(hat(0.04), a + j * beat + beat / 2, -0.4, 0.035)
# 日出：转 D 大调，整片铺开；看到太阳那一刻一串钟声
a, b = span("sunrise")
place(pad(Gadd9[1:], bar + 1.0, a=0.6, r=1.0, cut=2400), a, 0, 0.34); place(choir([55, 62, 67, 71], bar + 1.0, a=0.8, r=1.0), a, 0, 0.16)
place(bass(31 + 12, bar + 0.3, r=0.6), a, 0, 0.36)
d_on = a + bar
place(pad(D_maj[1:], total - d_on + 0.5, a=0.8, r=2.6, cut=2600), d_on, 0, 0.36); place(choir([62, 66, 69, 74], total - d_on + 0.5, a=1.0, r=2.6), d_on, 0, 0.18)
place(bass(38, total - d_on, r=2.2), d_on, 0, 0.36); place(sub_boom(3.0), d_on, 0, 0.3)
for j in range(int((b - a) / (beat / 4))): place(arp_note([62, 66, 69, 74, 78, 74, 69, 66][j % 8] + 12, 0.3, 1500 + 3000 * j / ((b - a) / (beat / 4))), a + j * beat / 4, 0.5 * np.sin(j * 0.7), 0.05)
if sun_seen is not None:
    for j, m in enumerate((86, 90, 93, 98)): place(bell(m, 3.5), sun_seen + j * 0.16, -0.45 + 0.3 * j, 0.06)
    place(glitter(total - sun_seen, 16), sun_seen, 0, 0.12)
if endcard:      # 署名页：两声落定（1.8 秒盖印章、2.8 秒按指纹）
    t_end = main - XF
    for dt in (1.8, 2.8): place(thud(), t_end + dt, 0, 0.5); place(click(), t_end + dt, 0, 0.4)

# ---------- 混响、混音 ----------
ir_t = tt(3.0); irs = [lp(rng.normal(0, 1, len(ir_t)), 6000) * np.exp(-ir_t * 2.3) for _ in range(2)]
for ir in irs: ir[:int(0.015 * SR)] *= np.linspace(0, 1, int(0.015 * SR))
wet = np.stack([fftconvolve(music[:, c], irs[c])[:n] for c in range(2)], 1)
wet *= np.sqrt(np.mean(music ** 2)) / max(1e-9, np.sqrt(np.mean(wet ** 2)))
wet_sfx = np.stack([fftconvolve(sfx[:, c], irs[c])[:n] for c in range(2)], 1)
wet_sfx *= np.sqrt(np.mean(sfx ** 2)) / max(1e-9, np.sqrt(np.mean(wet_sfx ** 2)))
music_rev = music + 0.35 * wet
fade = np.minimum(1, (total - np.arange(n) / SR) / 0.8)[:, None]
mix = hp(music_rev + sfx + 0.18 * wet_sfx, 30) * fade
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
