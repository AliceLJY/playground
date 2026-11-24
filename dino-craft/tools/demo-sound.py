"""方块侏罗纪演示片的配乐、音效、接署名页、合轨。游戏本身没有声音，这里全部由代码合成，没有采样素材。

    <venv>/bin/python -I tools/demo-sound.py <demo.cjs 的输出目录> <成片.mp4> --endcard <署名页.mp4>
读 <目录>/events.json 与 screen.mp4，写 <目录>/mix.wav，再合成成片（署名页叠化 0.5 秒接在最后一镜后面）。

音效只给画面里正在发生的事：
- 开火：按住开火先有一段转管预热的电机声（越转越高），每一发一声短促的枪响（噪声爆裂 + 低频一顿），命中加一声金属轻响；
- 霸王龙：开局冲过来、夜里盯上它时各一声吼（锯齿波共振峰 + 噪声，音高往下坠），打倒时一声往下掉的哀嚎；
  翼龙俯冲预警是一声尖叫（音高上挑），被扑中是一记闷响；
- 挖方块：泥土碎裂（带通噪声 + 低频）；放方块：木头两声敲；拾肉：两声往上的亮音；进食：两口咀嚼；
- 点按钮（工作台、配方、快捷栏、头灯）：很轻的一声点按；夜里走路：脚踩草地。
配乐：白天 D 宫五声、每分钟 112 拍，木琴一样的拨音加低音和沙锤；入夜前游戏钟飞转那两三秒是一串越来越快的滴答加上行琶音；
入夜一声低鼓，转 D 小调长音铺底、心跳一样的低鼓随霸王龙逼近加快；打倒后松下来；最后回头看坎上火把那一镜落在 D 大调的暖和弦上，
署名页底下长音接着垫、两声落定音（和别的片子的署名页一致），最后 0.8 秒淡出。
响度：竖屏短片交付 -12 LUFS 左右，先量整段再整体提，峰值用限幅器压在约 -3.6 dB（AAC 编码后会冒出样本间峰值，实测成片真峰值要留在 0 以下）。
"""
import json, re, subprocess, sys, wave
from pathlib import Path
import numpy as np

out, final = Path(sys.argv[1]), sys.argv[2]
endcard = sys.argv[sys.argv.index("--endcard") + 1] if "--endcard" in sys.argv else None
ev = json.loads((out / "events.json").read_text())
SR, FPS, XF = 48000, ev["fps"], 0.5
main = ev["dur"]
end_dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", endcard]).decode()) if endcard else 0.0
total = main + (end_dur - XF if endcard else 0)
n = int(round(total * SR))
rng = np.random.default_rng(731)
mix = np.zeros((n, 2)); sfx = np.zeros((n, 2))

def place(sig, t, pan=0.0, gain=1.0, bus=None):
    bus = mix if bus is None else bus
    i = int(round(t * SR))
    if i >= n: return
    if i < 0: sig = sig[-i:]; i = 0
    sig = sig[: n - i] * gain
    bus[i:i + len(sig), 0] += sig * (1 - max(0, pan)); bus[i:i + len(sig), 1] += sig * (1 + min(0, pan))

def tt(d): return np.arange(int(d * SR)) / SR
def env(t, a, d): return np.minimum(1, t / a) * np.exp(-t * d)
def lp(x, k):            # 一阶低通，k 越小越闷
    y = np.empty_like(x); acc = 0.0
    for i, v in enumerate(x): acc += k * (v - acc); y[i] = acc
    return y
def bp(x, lo, hi): return lp(x, hi) - lp(x, lo)

# ---------- 乐器 ----------
def pluck(f, d=0.9, b=0.9):          # 木琴 / 拨音
    t = tt(d); y = sum(np.sin(2 * np.pi * f * k * t) * np.exp(-t * (3 + 2.2 * k)) * b ** (k - 1) / k for k in range(1, 6))
    return y * np.minimum(1, t / 0.003) * 0.6
def bass(f, d=0.5):
    t = tt(d); return (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t)) * env(t, 0.005, 5)
def shaker(d=0.06):
    x = np.diff(rng.normal(0, 1, int(d * SR)), prepend=0); return x * np.exp(-tt(d) * 60)
def pad(f, d, a=0.8, r=1.2, bright=1.9):
    t = tt(d); y = sum(np.sin(2 * np.pi * f * k * t + rng.uniform(0, 6.28)) / k ** bright for k in (1, 2, 3, 4))
    y += 0.6 * sum(np.sin(2 * np.pi * f * 1.004 * k * t) / k ** bright for k in (1, 2))
    return y * np.minimum(1, t / a) * np.minimum(1, np.maximum(0, d - t) / r)
def kick(f0=110, d=0.35):
    t = tt(d); ph = 2 * np.pi * np.cumsum(f0 * np.exp(-t * 18) + 42) / SR; return np.sin(ph) * env(t, 0.002, 9)
def tick(f=2600, d=0.03):
    t = tt(d); return np.sin(2 * np.pi * f * t) * np.exp(-t * 160)

# ---------- 音效 ----------
def gun_shot():
    t = tt(0.09); x = rng.normal(0, 1, len(t)); crack = bp(x, 0.08, 0.6) * np.exp(-t * 70)
    thump = np.sin(2 * np.pi * (90 + 60 * np.exp(-t * 60)) * t) * np.exp(-t * 45)
    return crack * 0.9 + thump * 0.8
def spin(d):                         # 转管电机：0.4 秒内转速起来，之后持平带一点颤
    t = tt(d); f = 70 + 160 * np.minimum(1, t / 0.45) ** 0.7
    ph = 2 * np.pi * np.cumsum(f) / SR
    y = 0.6 * np.sin(ph) + 0.25 * np.sin(2 * ph) + 0.15 * np.sin(3 * ph)
    y *= 0.75 + 0.25 * np.sin(6 * ph / 6)       # 六根枪管转过去的起伏
    return y * np.minimum(1, t / 0.05) * np.minimum(1, np.maximum(0, d - t) / 0.18)
def ting():
    t = tt(0.12); return (np.sin(2 * np.pi * 2900 * t) + 0.5 * np.sin(2 * np.pi * 4300 * t)) * np.exp(-t * 55)
def roar(d=1.3, f0=95, drop=0.45):
    t = tt(d); f = f0 * (1 - drop * t / d) * (1 + 0.04 * np.sin(2 * np.pi * 7 * t))
    ph = 2 * np.pi * np.cumsum(f) / SR
    saw = sum(np.sin(k * ph) / k for k in range(1, 14))
    growl = bp(saw, 0.02, 0.18) * 2.2 + 0.5 * bp(rng.normal(0, 1, len(t)), 0.015, 0.09)
    growl *= 1 + 0.5 * np.sin(2 * np.pi * 23 * t)                  # 喉咙里的颤
    return growl * np.minimum(1, t / 0.12) * np.minimum(1, np.maximum(0, d - t) / 0.5)
def screech(d=0.55):
    t = tt(d); f = 900 + 700 * t / d; ph = 2 * np.pi * np.cumsum(f) / SR
    y = np.sin(ph) + 0.4 * np.sin(2.01 * ph) + 0.3 * bp(rng.normal(0, 1, len(t)), 0.1, 0.5)
    return y * np.minimum(1, t / 0.04) * np.minimum(1, np.maximum(0, d - t) / 0.25) * 0.5
def dig():
    t = tt(0.22); x = rng.normal(0, 1, len(t))
    return bp(x, 0.03, 0.25) * env(t, 0.002, 22) * 1.2 + np.sin(2 * np.pi * 75 * t) * env(t, 0.002, 28) * 0.8
def knock(f=320):
    t = tt(0.16); return (np.sin(2 * np.pi * f * t) * np.exp(-t * 38) + 0.45 * np.sin(2 * np.pi * f * 2.7 * t) * np.exp(-t * 70)) * np.minimum(1, t / 0.001)
def click():
    t = tt(0.04); return (np.sin(2 * np.pi * 1700 * t) + 0.3 * rng.normal(0, 1, len(t))) * np.exp(-t * 140) * 0.5
def blip(f):
    t = tt(0.22); return (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t)) * env(t, 0.003, 14)
def thud():
    t = tt(0.3); return np.sin(2 * np.pi * (60 + 50 * np.exp(-t * 30)) * t) * env(t, 0.002, 14) + 0.3 * bp(rng.normal(0, 1, len(t)), 0.01, 0.08) * np.exp(-t * 30)
def munch():
    t = tt(0.12); return bp(rng.normal(0, 1, len(t)), 0.05, 0.4) * env(t, 0.003, 30)
def step():
    t = tt(0.1); return bp(rng.normal(0, 1, len(t)), 0.02, 0.2) * env(t, 0.004, 40) * 0.7

# ---------- 时刻 ----------
cue = {}
for c in ev["cues"]: cue.setdefault(c["name"], []).append(c)
first = lambda name, d=None: cue[name][0]["t"] if name in cue else d
E = ev["events"]
shots = [e["t"] for e in E if e["type"] == "shot"]
T_dusk, T_night, T_walk, T_back = first("dusk"), first("night"), first("walk"), first("eat")
print("cues", {k: [round(c["t"], 2) for c in v] for k, v in cue.items()})

# ---------- 音效 ----------
# 开火：按射击事件聚成一段段连射；每段之前 0.42 秒是预热（第一发要等转速够）
bursts, cur = [], None
for s in shots:
    if cur and s - cur[1] < 0.3: cur[1] = s
    else: cur = [s, s]; bursts.append(cur)
for a, b in bursts:
    place(spin(b - a + 0.42 + 0.35), a - 0.42, 0.15, 0.16, sfx)
for i, s in enumerate(shots):
    place(gun_shot(), s, 0.12 + 0.05 * np.sin(i), 0.34 * (1 + 0.06 * np.sin(i * 2.3)), sfx)
for e in E:
    t = e["t"]
    if e["type"] == "hit": place(ting(), t + 0.01, 0, 0.07, sfx)
    elif e["type"] == "kill": place(roar(1.5, 85, 0.6), t, -0.05, 0.42, sfx); place(thud(), t + 0.75, 0, 0.35, sfx)
    elif e["type"] == "mine": place(dig(), t, 0.1, 0.42, sfx)
    elif e["type"] == "place": place(knock(300 + 40 * (e.get("y", 0) % 3)), t, 0.05, 0.32, sfx); place(knock(520), t + 0.045, 0.05, 0.14, sfx)
    elif e["type"] == "pickup": place(blip(988), t, 0, 0.16, sfx); place(blip(1319), t + 0.08, 0, 0.14, sfx)
    elif e["type"] == "warning":
        if e.get("seconds", 0) > 1: place(screech(), t, -0.4, 0.16, sfx)      # 翼龙俯冲预警
        else: place(roar(0.9, 110, 0.3), t, 0, 0.36, sfx)                    # 霸王龙张嘴
    elif e["type"] == "hurt": place(thud(), t, 0, 0.42, sfx)
# 霸王龙冲上来那一声吼：开局一声（第一秒就有声音），夜里盯上它那一下一声
place(roar(1.4, 98, 0.4), 0.05, 0, 0.4, sfx)
for c in cue.get("target", []): place(roar(1.4, 92, 0.42), c["t"] + 0.1, -0.1, 0.36, sfx)
# 点按钮：工作台开、配方、关、两次快捷栏、头灯、进食（这些时刻在 cues 里，按下比 cue 早 0.3–0.5 秒）
for name, lead in (("craft", 0.0), ("crafted", 0.5), ("torch-slot", 0.25), ("lamp", 0.35)):
    for c in cue.get(name, []): place(click(), c["t"] - lead + 0.02, 0.2, 0.5, sfx)
for c in cue.get("crafted", []): place(click(), c["t"] + 0.02, 0.2, 0.5, sfx); place(blip(1175), c["t"] - 0.45, 0, 0.1, sfx); place(blip(1568), c["t"] - 0.37, 0, 0.09, sfx)
if T_back is not None: place(click(), T_back + 0.02, 0.2, 0.5, sfx); place(munch(), T_back + 0.15, 0, 0.35, sfx); place(munch(), T_back + 0.38, 0, 0.3, sfx)
if T_walk is not None:
    t = T_walk + 0.35; end_walk = first("pickups", T_walk + 3.5)
    while t < end_walk: place(step(), t, 0.1 * np.sin(t * 3), 0.25, sfx); t += 0.36
# 头灯打开：一声低低的「嗡」
if "lamp" in cue: place(pad(147, 0.9, 0.05, 0.6, 1.2), cue["lamp"][0]["t"] - 0.3, 0.2, 0.05, sfx)

# ---------- 配乐 ----------
D = 146.83
def pent(i):                     # D 宫五声：D E F# A B，往上叠八度
    deg = [0, 2, 4, 7, 9]; o, k = divmod(i, 5); return D * 2 ** ((12 * o + deg[k]) / 12)
BPM = 112; beat = 60 / BPM; e8 = beat / 2
MEL = [[5, 7, 8, 7], [9, 8, 7, 5], [5, 6, 7, 9], [8, 7, 6, 5], [7, 8, 9, 10], [9, 7, 8, 5], [5, 7, 9, 8], [7, 6, 5, 5]]
BAS = [0, 0, 3, 0, 4, 3, 2, 0]
def groove(t0, t1, gain=1.0, melody=True, bar=0):
    t = t0
    while t < t1 - 0.05:
        b = BAS[bar % 8]
        place(bass(pent(b) / 2), t, 0, 0.30 * gain)
        if t + beat < t1: place(bass(pent(b + 2) / 2, 0.35), t + beat, 0, 0.18 * gain)
        for k in range(4):
            tk = t + k * e8
            if tk >= t1 - 0.02: break
            if k % 2: place(shaker(), tk, 0.35, 0.03 * gain)
            if melody and not (bar % 4 == 3 and k == 3):
                place(pluck(pent(MEL[bar % 8][k])), tk, -0.2 + 0.13 * k, (0.13 if k == 0 else 0.10) * gain)
        bar += 1; t += 2 * beat
    return bar
# 白天：0 秒就进（开局第一拍落在第 0 帧），开火那段旋律收一收让枪声在前面
place(pad(D, T_dusk + 0.6, 0.3, 0.8), 0, 0, 0.045); place(pad(D * 1.5, T_dusk + 0.6, 0.3, 0.8), 0, 0.2, 0.025)
place(kick(), 0.0, 0, 0.4)
fire_end = bursts[0][1] + 0.2 if bursts else 3
bar = groove(0.0, fire_end, 0.55, melody=False)
bar = groove(fire_end, T_dusk, 1.0, bar=bar)
# 入夜前：游戏钟飞转，滴答越来越密，上行琶音
span = T_night - T_dusk; t = T_dusk; k = 0
while t < T_night - 0.02:
    s = (t - T_dusk) / span
    place(tick(2400 + 900 * s), t, 0.3 * np.sin(k), 0.09 + 0.06 * s, mix); k += 1
    t += 0.2 * (1 - 0.82 * s)
for i in range(14):
    place(pluck(pent(5 + i), 0.7), T_dusk + span * (i / 14) ** 0.8, -0.3 + 0.045 * i, 0.08 + 0.004 * i)
swell = tt(span); place(bp(rng.normal(0, 1, len(swell)), 0.01, 0.12) * (swell / span) ** 2, T_dusk, 0, 0.18)
# 入夜：低鼓一声，转 D 小调长音（D F A），心跳鼓随霸王龙逼近加快，打倒后松下来
place(kick(70, 0.8), T_night, 0, 0.7); place(thud(), T_night, 0, 0.3)
kill_night = [e["t"] for e in E if e["type"] == "kill" and e["t"] > T_night]
k_night = kill_night[0] if kill_night else T_night + 5
place(pad(D / 2, k_night - T_night + 1.2, 0.6, 1.0, 1.4), T_night, 0, 0.09); place(pad(D * 2 ** (3 / 12) / 2, k_night - T_night + 1.2, 0.8, 1.0, 1.4), T_night, -0.2, 0.05)
place(pad(D * 1.5 / 2, k_night - T_night + 1.2, 1.0, 1.0, 1.4), T_night, 0.2, 0.04)
t = T_night + 1.0
while t < k_night:
    s = (t - T_night) / max(0.1, k_night - T_night)
    place(kick(80, 0.3), t, 0, 0.36); place(kick(80, 0.3), t + 0.16, 0, 0.22)
    t += 0.85 - 0.35 * s
# 打倒之后：小调的拨音慢慢走，脚步在上面
minor = [0, 3, 5, 7, 10]
def mnr(i): o, k = divmod(i, 5); return D * 2 ** ((12 * o + minor[k]) / 12)
t = k_night + 0.4; seq = [5, 7, 6, 4, 5, 8, 7, 5]; i = 0
place(pad(D / 2, T_back - k_night + 0.8, 0.6, 0.8, 1.6), k_night + 0.2, 0, 0.06); place(pad(D * 2 ** (10 / 12) / 2, T_back - k_night + 0.8, 0.6, 0.8, 1.6), k_night + 0.2, 0.2, 0.035)
while t < T_back - 0.1:
    place(pluck(mnr(seq[i % 8]), 1.2, 0.8), t, -0.2 + 0.1 * (i % 4), 0.085); t += beat; i += 1
# 最后一镜：回头看坎上的火把，落在 D 大调的暖和弦上，一路垫进署名页
for f, g, p in ((D / 2, 0.07, 0), (D * 2 ** (4 / 12) / 2, 0.04, -0.2), (D * 1.5 / 2, 0.04, 0.2), (D * 2 ** (14 / 12) / 2, 0.025, 0)):
    place(pad(f, total - T_back + 0.2, 0.5, 1.4, 1.6), T_back + 0.6, p, g)
for j, d in enumerate((5, 7, 8, 10, 12)):
    place(pluck(pent(d), 1.8, 0.85), T_back + 0.7 + j * 0.22, -0.25 + 0.12 * j, 0.09)
place(bass(D / 2, 1.2), T_back + 0.7, 0, 0.3)
if endcard:      # 署名页：两声落定（1.8 秒盖印章、2.8 秒按指纹），上面一句慢拨
    t_end = main - XF
    for dt in (1.8, 2.8): place(thud(), t_end + dt, 0, 0.42); place(click(), t_end + dt, 0, 0.35)
    for j, d in enumerate((7, 9, 10)): place(pluck(pent(d), 2.4, 0.8), t_end + 0.35 + j * 0.45, 0.1 * j, 0.08)
fade = np.minimum(1, (total - np.arange(n) / SR) / 0.8)[:, None]
allmix = (mix + sfx) * fade
allmix /= max(1e-9, np.abs(allmix).max())
allmix = np.tanh(2.2 * allmix) / np.tanh(2.2) * 0.95     # 轻度饱和：枪声这类尖峰先圆一圆，后面限幅器就不用压得太狠
with wave.open(str(out / "mix.wav"), "w") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(allmix, -1, 1) * 32767).astype(np.int16).tobytes())

def lufs(path, af=None):
    cmd = ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", (af + "," if af else "") + "ebur128=peak=true", "-f", "null", "-"]
    return float(re.findall(r"I:\s+(-?[\d.]+) LUFS", subprocess.run(cmd, capture_output=True, text=True).stderr)[-1])
measured = lufs(out / "mix.wav"); gain = -12.0 - measured
for _ in range(5):               # 限幅器会吃掉一部分响度，按实测补，直到成品落在 -12 ± 0.3
    af = f"volume={gain:.2f}dB,alimiter=limit=0.66:attack=2:release=60:level=false"
    got = lufs(out / "mix.wav", af)
    if abs(got + 12.0) < 0.3: break
    gain += -12.0 - got
print(f"混音实测 {measured:.1f} LUFS，整体提 {gain:.1f} dB，限幅后 {got:.1f} LUFS")
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
print("写出", final, f"正片 {main:.2f} 秒 + 署名页，共 {total:.2f} 秒")
