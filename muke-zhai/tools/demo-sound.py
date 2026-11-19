"""穆柯寨演示片的锣鼓：读 tools/demo.cjs 写的 events.json，按画面里的事件时间合成。全部代码合成，没有采样。

乐器（京剧武场五件，简化）：
- 大锣：一组不成整数比的泛音，音高起手后往下掉（「仓」那一声的下坠）。
- 小锣：音高起手后往上挑（「台」）。
- 铙钹：高频噪声加一簇高泛音；「才」是放开的，「七」是捂住的短声。
- 板：木头脆响。单皮鼓：紧皮的短「嘟」。

段落：
- 引子（戏单那 4 秒）：急急风（单皮鼓滚、铙钹小锣交替）收一个四击头，最后一个「仓」落在点掉引子那一下。
- 交手：一层轻的「长锤」点子垫底（板在拍上、小锣在后半拍、每小节一记轻大锣），第二场稍快。
- 事件：命中打「仓」（重招更响，枪尖点中杨宗保打轻「仓」，收场那一击打重「仓」）；架开是小锣「台」加板；对枪铙钹「才」；打掉金盔是重「仓」带长锣尾；
  挨打是低沉的大锣加鼓；大招起手滚一段急鼓，五枪每枪一记铙钹；势满小锣两声往上挑；换场「凤点头」。
- 收场：垫底停；杨宗保愣神时小锣两声慢「台」；亮相用四击头，最后一个「仓」落在她定住那一刻；
  结尾两行字幕底下一段慢板（板与小锣）；署名页一声大锣慢慢散。

    uv run --with numpy python tools/demo-sound.py <输出目录>     （读 events.json，写 sound-raw.wav）
    ffmpeg -i sound-raw.wav -af loudnorm=I=-16:TP=-1.5:LRA=11 -ar 44100 sound.wav
    ffmpeg -framerate 30 -i frames/%05d.jpg -i sound.wav -c:v libx264 -pix_fmt yuv420p -crf 18 \\
      -c:a aac -b:a 192k -movflags +faststart -shortest film.mp4
"""
import json
import sys
import wave

import numpy as np

SR = 44100
out = sys.argv[1]
ev = json.load(open(out + '/events.json', encoding='utf-8'))
T = ev['seconds']; N = int(T * SR) + SR
rng = np.random.default_rng(20261119)
mix = np.zeros(N)
marks = ev['marks']
first = lambda name, d=None: next((m['t'] for m in marks if m['name'] == name), d)
sec_play = first('section:play', 4.0)
sec_stage2 = first('section:stage2')
fin = first('phase:finale')
end = first('phase:end')
outro = first('section:outro', T - 6)


def add(sig, t0, gain=1.0):
    i = int(round(t0 * SR))
    if i < 0 or i >= N:
        return
    sig = sig[: N - i]
    mix[i: i + len(sig)] += sig * gain


def ts(d):
    return np.arange(int(d * SR)) / SR


def noise(d):
    return rng.uniform(-1, 1, int(d * SR))


def hp(x):
    return x - np.convolve(x, np.ones(6) / 6, mode='same')


def glide_sine(f0, fend, tau, d, phase=0.0):
    t = ts(d)
    f = fend + (f0 - fend) * np.exp(-t / tau)
    return np.sin(2 * np.pi * np.cumsum(f) / SR + phase)


def daluo(d=1.8, f0=230, vol=1.0):
    """大锣：起手偏高，往下掉；泛音不成整数比，高的先衰。"""
    t = ts(d); s = np.zeros(len(t))
    for i, m in enumerate([1, 1.43, 2.11, 2.77, 3.62, 4.4]):
        s += glide_sine(f0 * m * 1.1, f0 * m * 0.9, 0.22, d, i) * np.exp(-t / (d * 0.45 / (1 + i * 0.5))) / (1 + i * 0.6)
    s += hp(noise(d)) * np.exp(-t / 0.05) * 0.6
    return s * np.minimum(1, t / 0.004) * vol


def xiaoluo(d=0.7, f0=640, vol=1.0):
    """小锣：起手偏低，往上挑。"""
    t = ts(d); s = np.zeros(len(t))
    for i, m in enumerate([1, 1.52, 2.34]):
        s += glide_sine(f0 * m * 0.86, f0 * m * 1.05, 0.06, d, i) * np.exp(-t / (0.32 / (1 + i * 0.6))) / (1 + i)
    s += hp(noise(d)) * np.exp(-t / 0.015) * 0.3
    return s * np.minimum(1, t / 0.002) * vol


def naobo(open_=True, vol=1.0):
    """铙钹：「才」放开，「七」捂住。"""
    d = 0.9 if open_ else 0.12
    t = ts(d)
    s = hp(hp(noise(d))) * 1.4
    for f in rng.uniform(3200, 8200, 14):
        s += np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28)) * 0.12
    return s * np.exp(-t / (0.28 if open_ else 0.03)) * np.minimum(1, t / 0.001) * vol


def ban(vol=1.0):
    t = ts(0.08)
    s = np.convolve(noise(0.08), [1, -0.6, 0.2], mode='same') * np.sin(2 * np.pi * 2300 * t)
    s += np.sin(2 * np.pi * 1700 * t) * 0.6
    return s * np.exp(-t / 0.012) * vol


def danpi(vol=1.0):
    t = ts(0.14)
    s = glide_sine(620, 430, 0.02, 0.14) + hp(noise(0.14)) * 0.4
    return s * np.exp(-t / 0.035) * vol


def cang(t0, vol=1.0, tail=1.6):
    """仓：大锣＋铙钹＋小锣一起。"""
    add(daluo(tail, vol=1), t0, 0.55 * vol); add(naobo(True), t0, 0.32 * vol); add(xiaoluo(), t0, 0.18 * vol)


def cai(t0, vol=1.0):
    add(naobo(True), t0, 0.28 * vol); add(xiaoluo(0.5), t0, 0.16 * vol)


def tai(t0, vol=1.0):
    add(xiaoluo(), t0, 0.32 * vol)


def sijitou(t_last, vol=1.0):
    """四击头，按最后一个「仓」的时刻往前排：八 大 仓 才 仓 才 仓 令 才 仓。"""
    seq = [(-1.9, 'ban'), (-1.75, 'dp'), (-1.62, 'dp'), (-1.45, 'cang'), (-1.22, 'cai'), (-1.0, 'cang'),
           (-0.78, 'cai'), (-0.56, 'cang'), (-0.36, 'tai'), (-0.24, 'cai'), (0.0, 'CANG')]
    for dt, k in seq:
        t0 = t_last + dt
        if k == 'ban': add(ban(), t0, 0.5 * vol)
        elif k == 'dp': add(danpi(), t0, 0.45 * vol)
        elif k == 'cang': cang(t0, 0.8 * vol, 0.9)
        elif k == 'cai': cai(t0, 0.8 * vol)
        elif k == 'tai': tai(t0, 0.8 * vol)
        else: cang(t0, 1.15 * vol, 2.8)


def jijifeng(t0, t1, vol=1.0):
    """急急风：单皮鼓滚，铙钹小锣交替。"""
    t = t0; i = 0
    while t < t1:
        add(danpi(), t, 0.25 * vol)
        if i % 2 == 0: add(naobo(False), t, 0.5 * vol)
        else: add(xiaoluo(0.3), t, 0.12 * vol)
        t += 0.11; i += 1


# ---- 引子 ----
add(ban(), 0.25, 0.5)
jijifeng(0.45, sec_play - 1.95, 0.9)
sijitou(sec_play)

# ---- 交手垫底（长锤）----
stop_bed = fin if fin is not None else T
t = sec_play + 1.9; b = 0
while t < stop_bed - 0.2:
    stage2 = sec_stage2 is not None and t >= sec_stage2
    beat = 60 / (150 if stage2 else 138)
    if not (sec_stage2 is not None and sec_stage2 - 0.6 < t < sec_stage2 + 1.6):
        add(ban(), t, 0.18)
        add(xiaoluo(0.35), t + beat / 2, 0.06)
        if b % 4 == 0: add(daluo(0.9, 200), t, 0.12)
        if b % 4 == 2: add(naobo(False), t, 0.16)
    t += beat; b += 1

# ---- 事件 ----
last_cang = -9.0
for m in marks:
    k, t0, kind = m['name'], m['t'], m.get('kind')
    if t0 < sec_play or t0 > outro:
        continue
    if k == 'hit':
        v = 1.0 if kind in ('heavy', 'dash', 'flip') else 0.7
        if t0 - last_cang > 0.12: cang(t0, v, 1.2 if v > 0.8 else 0.8); last_cang = t0
    elif k == 'tap':
        if t0 - last_cang > 0.12: cang(t0, 0.6, 0.7); last_cang = t0
    elif k == 'finale':
        cang(t0, 1.25, 2.2); last_cang = t0
    elif k == 'parry':
        tai(t0, 1.0); add(ban(), t0, 0.35)
    elif k == 'clash':
        cai(t0, 1.1)
    elif k == 'helmet':
        cang(t0, 1.3, 2.4); last_cang = t0
    elif k == 'hurt':
        add(daluo(1.0, 150), t0, 0.5); add(danpi(), t0, 0.5)
    elif k == 'block':
        add(naobo(False), t0, 0.5); add(ban(), t0, 0.25)
    elif k == 'shiFull':
        tai(t0, 0.7); tai(t0 + 0.18, 0.8)
    elif k == 'ult':
        jijifeng(t0, t0 + 0.55, 1.0)
    elif k == 'ultHit':
        cai(t0, 0.9)
    elif k == 'gongBig':
        add(daluo(3.2, 170), t0, 0.7)
    elif k == 'warn':
        add(danpi(), t0, 0.25)

# 换场：凤点头（台 台 仓）
if sec_stage2 is not None:
    tai(sec_stage2 - 0.35, 0.8); tai(sec_stage2 - 0.18, 0.9); cang(sec_stage2, 1.0, 1.8)

# ---- 收场 ----
if fin is not None:
    tai(fin + 0.9, 0.6); tai(fin + 1.7, 0.5)            # 杨宗保愣神，两声慢台
if end is not None:
    # 亮相在 phase:end 前 2.2 秒开始，第 12 帧（约 1.3 秒后）定住
    sijitou(end - 2.2 + 1.32, 1.0)
if end is not None:
    # 结尾两行字幕：慢板收尾垫底（板在拍上、小锣轻轻跟），别让字幕底下空着
    t, b2 = end + 1.4, 0
    while t < outro - 0.9:
        add(ban(), t, 0.16); add(xiaoluo(0.6), t + 0.45, 0.07)
        if b2 % 2 == 1: add(daluo(1.4, 190), t, 0.1)
        t += 0.9; b2 += 1
    tai(outro - 0.7, 0.5); tai(outro - 0.45, 0.6)
add(daluo(5.0, 160), outro + 0.3, 0.45)              # 署名页：一声大锣慢慢散

# ---- 混响与收尾 ----
ir_t = ts(1.1); ir = rng.standard_normal(len(ir_t)) * np.exp(-ir_t / 0.32); ir[0] = 0
L = 1 << int(np.ceil(np.log2(N + len(ir))))
wet = np.fft.irfft(np.fft.rfft(mix, L) * np.fft.rfft(ir, L), L)[:N]
mix = mix + wet * (0.16 * np.abs(mix).max() / (np.abs(wet).max() + 1e-9))
mix = mix[: int(T * SR)]
tt = np.arange(len(mix)) / SR
mix *= np.clip((T - tt) / 1.0, 0, 1)
mix = np.tanh(mix / (np.abs(mix).max() + 1e-9) * 2.2) * 0.9
with wave.open(out + '/sound-raw.wav', 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32000).astype('<i2').tobytes())
print('wrote sound-raw.wav', round(T, 2), 's', 'hits', sum(1 for m in marks if m['name'] == 'hit'), 'parries', sum(1 for m in marks if m['name'] == 'parry'))
