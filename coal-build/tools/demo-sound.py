"""小黑煤球盖广州演示片的配乐与合成：读 tools/demo.cjs 写的 events.json，按画面里的事件时间合成，接署名页，出成片。全部代码合成，没有采样。

    <venv 带 numpy 的 python> tools/demo-sound.py <demo.cjs 的输出目录> <成片.mp4>

调子：A 宫五声（A B C# E F#），二拍子，每分钟 132 拍；主奏是敲出来的亮音（类扬琴，每音两根弦微微错开），
下面拨弦低音、梆子打后半拍。和岭南园林那支（G 徵、112 拍）、十三行那支（D 宫、拨弦加木鱼）有意不同。

跟着画面走的地方：
- 开头 3 秒多是原速：每点一下楼是一声闷闷的「砖」，买卡是两声小铃；拍子从第 0 帧就在。
- 加速段：多一层十六分音的扬琴轮奏和沙沙声；煤球砌下的砖按十六分格子化成很轻的「嗒」，砌得越多越密。
- 每砌满一段（亮出那段画）：一串往上走的扬琴滑音落在一个亮的和音上；大招「齐心一砌」：一阵鼓滚加重音；糖水担：两声铃；穿堂风：一阵风声。
- 收尾：减速那一刻垫底收掉、留一层越来越响的轮奏，手指点大招那一下全体重音，整栋亮光时一串闪光滑音；
  结算卡底下回到慢一倍的主题，署名页继续垫一段，盖印章、按指纹各一声落定音，最后一个长音慢慢散掉（不在句中切断）。
"""
import json
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

out, final = Path(sys.argv[1]), sys.argv[2]
ev = json.loads((out / 'events.json').read_text(encoding='utf-8'))
SR, XF = 48000, 0.4
MAIN = ev['seconds']
END = ev.get('endcard', 5.6)
T = MAIN + END - XF                       # 成片总长：署名页叠化 0.4 秒进入
N = int(round(T * SR))
END0 = MAIN - XF                          # 署名页开始的时刻
rng = np.random.default_rng(20261124)
mix = np.zeros((N, 2))
BPM = 132.0
BEAT = 60 / BPM
EIGHTH, SIXT = BEAT / 2, BEAT / 4
RAMP_AT = 3.4
slowT, finT, doneT = ev.get('slowT'), ev.get('finaleTap'), ev.get('doneT')
events, taps, frames = ev['events'], ev['taps'], ev['frames']

A4 = 440.0
SCALE = [0, 2, 4, 7, 9]                    # A 宫：宫 商 角 徵 羽


def deg(d, octv=0):
    """五声音阶第 d 级（可越八度）→ 频率。"""
    o, i = divmod(d, 5)
    return A4 * 2 ** ((SCALE[i] + 12 * (o + octv)) / 12)


def ts(d):
    return np.arange(int(d * SR)) / SR


def place(sig, t, gain=1.0, pan=0.0):
    i = int(round(t * SR))
    if i >= N or len(sig) == 0:
        return
    if i < 0:
        sig = sig[-i:]; i = 0
    sig = sig[: N - i] * gain
    mix[i:i + len(sig), 0] += sig * (1 - max(0.0, pan))
    mix[i:i + len(sig), 1] += sig * (1 + min(0.0, pan))


def yq(f, d=0.9, bright=1.0):
    """扬琴一击：两根弦微错开，泛音略不成整数比，高的先衰；起音带一点竹槌的噪声。"""
    t = ts(d)
    s = np.zeros(len(t))
    for det in (-0.0012, 0.0012):
        for h, a in ((1, 1.0), (2.003, 0.45 * bright), (3.01, 0.22 * bright), (4.02, 0.1 * bright)):
            s += a * np.sin(2 * np.pi * f * (1 + det) * h * t) * np.exp(-t * (3.2 + 2.2 * h))
    s += rng.uniform(-1, 1, len(t)) * np.exp(-t / 0.004) * 0.25
    return s * np.minimum(1, t / 0.002) * 0.5


def bass(f, d=0.5):
    t = ts(d)
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t)
    return s * np.exp(-t / 0.22) * np.minimum(1, t / 0.004)


def bangzi(f=1450, d=0.07):
    t = ts(d)
    return np.sin(2 * np.pi * f * t) * np.exp(-t / 0.012) + rng.uniform(-1, 1, len(t)) * np.exp(-t / 0.003) * 0.3


def brick(d=0.12):
    """点楼砌下一块：闷闷的「砖」。"""
    t = ts(d)
    f = 210 * np.exp(-t / 0.05) + 140
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.03) + rng.uniform(-1, 1, len(t)) * np.exp(-t / 0.006) * 0.5)


def tick(d=0.04):
    t = ts(d)
    return np.sin(2 * np.pi * 2300 * t) * np.exp(-t / 0.006) + rng.uniform(-1, 1, len(t)) * np.exp(-t / 0.002) * 0.4


def bell(f, d=1.4):
    t = ts(d)
    s = sum(a * np.sin(2 * np.pi * f * m * t) * np.exp(-t * k) for m, a, k in ((1, 1, 2.2), (2.76, 0.4, 4), (5.4, 0.2, 7)))
    return s * np.minimum(1, t / 0.002)


def shaker(d=0.06):
    t = ts(d)
    n = rng.uniform(-1, 1, len(t))
    n = n - np.convolve(n, np.ones(4) / 4, mode='same')
    return n * np.sin(np.pi * np.minimum(1, t / d)) ** 2


def drum(f=95, d=0.45):
    t = ts(d)
    ff = f * (1 + 0.8 * np.exp(-t / 0.03))
    return np.sin(2 * np.pi * np.cumsum(ff) / SR) * np.exp(-t / 0.16) + rng.uniform(-1, 1, len(t)) * np.exp(-t / 0.01) * 0.3


def cymbal(d=1.6):
    t = ts(d)
    n = rng.uniform(-1, 1, len(t))
    n = n - np.convolve(n, np.ones(3) / 3, mode='same')
    return n * np.exp(-t / 0.45) * np.minimum(1, t / 0.003)


def whoosh(d=1.2):
    t = ts(d)
    n = rng.uniform(-1, 1, len(t))
    k = int(SR * 0.004)
    n = np.convolve(n, np.ones(k) / k, mode='same')
    return n * np.sin(np.pi * t / d) ** 2 * 3


def chord(t0, degs, gain=1.0, d=1.6, octv=0):
    for j, dg in enumerate(degs):
        place(yq(deg(dg, octv), d), t0 + j * 0.012, gain, pan=(j - len(degs) / 2) * 0.15)


def run_up(t0, start, n, gain=0.7, step=0.05):
    for j in range(n):
        place(yq(deg(start + j), 0.6), t0 - (n - j) * step, gain * (0.6 + 0.4 * j / n), pan=-0.3 + 0.6 * j / n)


# ---- 速度曲线：k 在哪一刻 ----
fr_t = np.array([f['t'] for f in frames]); fr_k = np.array([f['k'] for f in frames]); fr_laid = np.array([f['laid'] for f in frames])
def k_at(t):
    i = min(len(fr_t) - 1, max(0, int(np.searchsorted(fr_t, t))))
    return fr_k[i]

# ---- 主题（两小节一句，八分音符；-1 = 休止）----
THEME = [
    [4, 5, 7, 5, 4, 3, 2, -1], [3, 4, 5, 4, 3, 2, 1, -1], [2, 3, 4, 7, 5, 4, 3, 2], [1, 2, 3, 1, 0, -1, 0, -1],
    [5, 7, 8, 7, 5, 4, 5, -1], [4, 5, 7, 5, 4, 2, 3, -1], [2, 4, 3, 2, 1, 2, 3, 5], [4, 3, 2, 1, 0, -1, -1, -1],
]
BASS = [0, 3, 1, 0, 2, 3, 1, 0]          # 每句的低音（五声级，低两个八度）

HIT = finT if finT is not None else doneT          # 全体重音：点大招收尾那一下，或者最后一块砖落下、整栋盖好那一下
bed_end = (slowT if finT is not None else doneT) if doneT is not None else MAIN   # 默认收尾（手放开、自己砌完）主题一直走到盖完
# 开头：从第 0 帧起拍，主题照常；加速段加轮奏和沙沙
t, bar = 0.0, 0
while t < bed_end - 0.05:
    phrase = THEME[bar % len(THEME)]
    fast = t >= RAMP_AT + 1.0
    for j, d in enumerate(phrase):
        tt = t + j * EIGHTH
        if tt >= bed_end:
            break
        if d >= 0:
            place(yq(deg(d), 0.8), tt, 0.55 if j % 2 == 0 else 0.42, pan=-0.12)
        if j % 2 == 1:
            place(bangzi(), tt, 0.16, pan=0.35)
        if fast:      # 轮奏：两个八度之上的同音快速轮打
            for q in range(2):
                td = tt + q * SIXT
                if td < bed_end and d >= 0:
                    place(yq(deg(d, 1), 0.25, 0.6), td, 0.12, pan=0.3)
            place(shaker(), tt, 0.10, pan=-0.4); place(shaker(), tt + SIXT, 0.06, pan=-0.4)
    for b in range(2):
        tb = t + b * BEAT * 2
        if tb < bed_end:
            place(bass(deg(BASS[bar % len(BASS)] + (2 if b else 0), -2), 0.6), tb, 0.55)
    t += BEAT * 4
    bar += 1

# 加速段煤球砌砖：按十六分格子化，砌得越多越密越响（但都很轻）
g = 0.0
while g < bed_end:
    i0, i1 = np.searchsorted(fr_t, g), np.searchsorted(fr_t, g + SIXT)
    if i1 > i0 and i1 < len(fr_laid) and g >= RAMP_AT:
        nb = fr_laid[i1] - fr_laid[i0]
        if nb > 0:
            place(tick(), g, min(0.12, 0.03 + 0.025 * np.log1p(nb)), pan=rng.uniform(-0.5, 0.5))
    g += SIXT

# 垫底先存一份，后面的事件声单独叠；砌好一段、大招、盖好时垫底让开（压低约 5 dB 再回来），让那一下听得出来
bed = mix.copy(); mix[:] = 0
duck = np.ones(N)
def duck_at(t0, depth=0.55, hold=0.7):
    i0, i1 = int((t0 - 0.03) * SR), int((t0 + hold) * SR)
    env = np.ones(N); a, b = max(0, i0), min(N, i1 + int(0.5 * SR))
    seg = np.arange(a, b)
    v = np.where(seg < i1, depth, depth + (1 - depth) * (seg - i1) / (0.5 * SR))
    env[a:b] = np.minimum(1, v); np.minimum(duck, env, out=duck)

# ---- 手指和游戏事件 ----
for tp in taps:
    if tp['target'] == 'building':
        place(brick(), tp['t'], 0.55, pan=rng.uniform(-0.2, 0.2))
last_stage = -9
for e in events:
    k, t0 = e['type'], e['t']
    if k == 'buy':
        place(bell(deg(7, 1), 0.35), t0, 0.10, pan=0.2); place(bell(deg(9, 1), 0.4), t0 + 0.06, 0.09, pan=0.2)
    elif k == 'skill':
        if finT is not None and abs(t0 - finT) < 0.2:
            continue      # 收尾那一发另外处理
        for j in range(8):
            place(drum(130 + j * 6, 0.2), t0 - 0.36 + j * 0.045, 0.22)
        place(drum(85, 0.6), t0, 0.7); chord(t0, [0, 2, 4, 5], 0.45, 1.4); place(cymbal(1.2), t0, 0.18); duck_at(t0, 0.65, 0.5)
    elif k == 'stage':
        if HIT is not None and abs(t0 - HIT) < 0.2:
            continue
        run_up(t0, 2, 8, 0.45); chord(t0, [5, 7, 9, 10], 0.6, 2.2); place(bell(deg(10, 0), 2.0), t0 + 0.02, 0.25); place(drum(90, 0.5), t0, 0.5); duck_at(t0)
        last_stage = t0
    elif k == 'event' and e.get('kind') == 'tea':
        place(bell(deg(9, 1), 1.0), t0, 0.16, pan=-0.3); place(bell(deg(7, 1), 1.0), t0 + 0.22, 0.16, pan=-0.3)
    elif k == 'tea':
        place(bell(deg(10, 1), 1.0), t0, 0.14, pan=0.3)
    elif k == 'event' and e.get('kind') == 'wind':
        place(whoosh(1.3), t0, 0.22)
    elif k == 'event' and e.get('kind') == 'bricks':
        place(drum(70, 0.5), t0, 0.45)

# ---- 收尾 ----
if slowT is not None and finT is None and doneT is not None:
    # 放慢看煤球自己砌完最后一截：主题照走，上面加一层越来越密、越来越响的轮奏，把气提到盖好那一下
    t = slowT
    while t < doneT - 0.02:
        p = (t - slowT) / max(doneT - slowT, 0.1)
        place(yq(deg(5 + int(p * 5)), 0.2, 0.7), t, 0.05 + 0.16 * p, pan=0.25 * np.sin(t * 7))
        if p > 0.5:
            place(drum(150 + 50 * p, 0.12), t, 0.12 * (p - 0.5) * 2)
        t += SIXT * (1 - 0.4 * p)
if slowT is not None and finT is not None:
    # 减速到点大招：一层越来越响的轮奏和鼓滚，把气提起来
    dur = finT - slowT
    t = slowT
    while t < finT - 0.02:
        p = (t - slowT) / max(dur, 0.1)
        place(yq(deg(5 + int(p * 4)), 0.2, 0.7), t, 0.12 + 0.25 * p, pan=0.2 * np.sin(t * 7))
        place(drum(150 + 40 * p, 0.12), t, 0.06 + 0.18 * p)
        t += SIXT * (1 - 0.5 * p)
    # 点下大招：全体重音
if HIT is not None:
    place(drum(70, 0.8), HIT, 0.95); place(cymbal(2.4), HIT, 0.3); chord(HIT, [0, 2, 4, 5, 7], 0.7, 2.6, octv=0); duck_at(HIT, 0.5, 1.0)
    place(bass(deg(0, -2), 1.6), HIT, 0.8)
    run_up(HIT + 0.5, 5, 10, 0.4, 0.04)
if doneT is not None:
    # 整栋亮光：闪光滑音
    for j in range(12):
        place(bell(deg(5 + j, 0), 0.8), doneT + 0.5 + j * 0.06, 0.06 + 0.005 * j, pan=-0.5 + j / 11)
    # 结算卡和署名页底下：主题慢一倍，最后落在宫音长音上
    t0 = doneT + 1.4
    CODA = [4, 5, 7, 5, 4, 3, 2, 3, 4, 3, 2, 1, 0]
    half = BEAT
    t = t0
    for j, d in enumerate(CODA):
        if t > T - 2.6:
            break
        place(yq(deg(d), 1.4), t, 0.42, pan=-0.1)
        if j % 2 == 0:
            place(bass(deg(BASS[(j // 2) % len(BASS)], -2), 0.9), t, 0.4)
        t += half
    # 最后一个宫音落在片尾前约 2.4 秒，留尾奏慢慢散
    tf = min(t, T - 2.4)
    chord(tf, [0, 2, 4], 0.4, 2.6); place(bass(deg(0, -2), 2.0), tf, 0.5); place(bell(deg(10), 2.4), tf, 0.1)
    # 垫一层很轻的长音，让署名页底下不空
    pad_t = ts(T - (doneT + 1.4))
    pad = (np.sin(2 * np.pi * deg(0, -1) * pad_t) + 0.5 * np.sin(2 * np.pi * deg(2, -1) * pad_t) + 0.4 * np.sin(2 * np.pi * deg(4, -1) * pad_t)) * 0.06
    pad *= np.minimum(1, pad_t / 1.0)
    place(pad, doneT + 1.4, 1.0)

# 署名页：盖印章、按指纹各一声落定音（模板 SFX_AT）
for sfx in (1.8, 2.8):
    place(brick(0.15), END0 + sfx, 0.5); place(drum(60, 0.5), END0 + sfx, 0.25)

mix += bed * duck[:, None]

# ---- 混响、收尾淡出、软限幅 ----
mono = mix.mean(axis=1)
ir_t = ts(1.2); ir = rng.standard_normal(len(ir_t)) * np.exp(-ir_t / 0.3); ir[0] = 0
L = 1 << int(np.ceil(np.log2(N + len(ir))))
for c in range(2):
    wet = np.fft.irfft(np.fft.rfft(mix[:, c], L) * np.fft.rfft(np.roll(ir, c * 37), L), L)[:N]
    mix[:, c] += wet * (0.12 * np.abs(mix[:, c]).max() / (np.abs(wet).max() + 1e-9))
tt = np.arange(N) / SR
mix *= np.clip((T - tt) / 1.6, 0, 1)[:, None]                         # 最后 1.6 秒淡出，长音的尾巴在里面
mix = np.tanh(mix / (np.abs(mix).max() + 1e-9) * 1.8) / np.tanh(1.8) * 0.9
raw = out / 'sound-raw.wav'
with wave.open(str(raw), 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(mix, -1, 1) * 32000).astype('<i2').tobytes())

# ---- 响度两遍：目标 -12 LUFS，真峰 -1.5（AAC 编码后会回弹约 0.8 dB）----
def ff(*a):
    return subprocess.run(['ffmpeg', '-hide_banner', '-y', *a], capture_output=True, text=True)
r = ff('-i', str(raw), '-af', 'loudnorm=I=-12:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-')
js = json.loads(r.stderr[r.stderr.rindex('{'):r.stderr.rindex('}') + 1])
snd = out / 'sound.wav'
ff('-i', str(raw), '-af', f"loudnorm=I=-12:TP=-1.5:LRA=11:measured_I={js['input_i']}:measured_TP={js['input_tp']}:measured_LRA={js['input_lra']}:measured_thresh={js['input_thresh']}:offset={js['target_offset']}:linear=true",
   '-ar', '48000', str(snd))

# ---- 合成：游戏画面叠化 0.4 秒进署名页，配乐整条铺底 ----
r = ff('-i', str(out / 'screen.mp4'), '-i', str(out / 'endcard.mp4'), '-i', str(snd),
       '-filter_complex', f'[0:v][1:v]xfade=transition=fade:duration={XF}:offset={MAIN - XF:.3f},format=yuv420p[v]',
       '-map', '[v]', '-map', '2:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
       '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-r', '30',
       '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-t', f'{T:.3f}', final)
if r.returncode:
    print(r.stderr[-2000:]); sys.exit(1)
print(json.dumps({'final': final, 'seconds': round(T, 2), 'loudnorm_first_pass': {k: js[k] for k in ('input_i', 'input_tp')}}, ensure_ascii=False))
