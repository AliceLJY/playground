"""油彩孔雀演示片的配乐与合成：读 tools/demo.cjs 写的 cues.json（每个动作的时刻、孔雀状态轨迹）和 page.wav
（页面自己当场合成的脚步、开屏、啄、落地、插回的声音），在底下垫一层代码合成的配乐，再接署名页的两声落定音，
最后响度归到 -12 LUFS 合成成片。全部代码合成，没有采样。

配乐（F 宫五声，每分钟 80 拍，F–Dm–B♭–C 一小节一个和弦）：
- 拨弦：一串谐波按高低各自衰减，近似古筝；两小节一句的慢旋律，偶尔加一层高八度。
- 铺底：长音和弦，起落都慢；低音每小节第一拍一下。
- 事件：鼠标停到孔雀身上开屏时一串往上的五声刮奏；点下尾羽那一下三个音往下落（羽毛飘下）；
  羽毛插回原处时一声铃似的和弦；领着它走、走近啄、后退、跳那一段加一层轻的手鼓和短促拨音，
  啄的那一下、落地那一下各一记低音；最后一次开屏是最大的刮奏加整和弦，署名页底下分解和弦慢慢淡出。
页面声音很轻（开屏是一阵风声、脚步是很短的沙声），整体提起来再和配乐叠，让它们听得见、又不抢旋律。

    ~/.local/share/sweety-statechart-video/venv/bin/python -I tools/demo-sound.py <录制输出目录> <成片.mp4>
需要 numpy 和 ffmpeg。写 <录制输出目录>/music.wav、mix.wav，再按实测响度加增益、4 倍采样率上限幅，合成成片并打印实测响度。
"""
import json
import subprocess
import sys
import wave

import numpy as np

SR = 48000
src, film = sys.argv[1], sys.argv[2]
cue = json.load(open(src + '/cues.json', encoding='utf-8'))
LIVE, TOTAL = cue['live'], cue['total']
N = int(round(TOTAL * SR))
BEAT = cue.get('beat', 0.75); BAR = 4 * BEAT
rng = np.random.default_rng(20261125)
C = {}
for c in cue['cues']:
    C.setdefault(c['name'], []).append(c['t'])
track = cue['track']


def first_where(pred, after=0.0):
    return [r['t'] for i, r in enumerate(track) if r['t'] >= after and pred(r) and (i == 0 or not pred(track[i - 1]))]


fan_on = C['onBird'] + C['onBirdFinal']
plucks = C['press:pluck']
returns = C['returned']
pecks = first_where(lambda r: r['action'].startswith('peck'))
lands = first_where(lambda r: r['action'] == 'jump:land')
lead = C['lead'][0]
final_fan = C['onBirdFinal'][0]
OUTRO = final_fan

music = np.zeros((N, 2))


def ts(d):
    return np.arange(int(d * SR)) / SR


def add(sig, t0, gain=1.0, pan=0.0):
    i = int(round(t0 * SR))
    if i >= N or i + len(sig) <= 0:
        return
    if i < 0:
        sig = sig[-i:]; i = 0
    sig = sig[: N - i] * gain
    music[i: i + len(sig), 0] += sig * np.sqrt(0.5 * (1 - pan))
    music[i: i + len(sig), 1] += sig * np.sqrt(0.5 * (1 + pan))


def hp(x):
    return x - np.convolve(x, np.ones(8) / 8, mode='same')


def midi(m):
    return 440 * 2 ** ((m - 69) / 12)


def pluck(f, d=2.0, vol=1.0, bright=1.0):
    """古筝似的一下：谐波越高衰减越快，起音带一点拨片噪声。"""
    t = ts(d); s = np.zeros(len(t))
    for h in range(1, 9):
        fh = f * h * (1 + 0.0006 * h * h)
        if fh > 15000:
            break
        s += np.sin(2 * np.pi * fh * t + h) * (0.9 ** h) * np.exp(-t * (1.1 + 1.7 * h / bright)) / h ** 0.6
    s += hp(rng.uniform(-1, 1, len(t))) * np.exp(-t / 0.004) * 0.2
    # 一点揉弦：起音后 0.25 秒开始轻轻颤
    return s * np.minimum(1, t / 0.002) * vol


def bell(f, d=2.6, vol=1.0):
    t = ts(d); s = np.zeros(len(t))
    for k, a, dec in ((1, 1, 1.2), (2.76, 0.45, 2.4), (5.4, 0.25, 4.0), (0.5, 0.3, 0.9)):
        s += a * np.sin(2 * np.pi * f * k * t) * np.exp(-t * dec)
    return s * np.minimum(1, t / 0.003) * vol


def bass(f, d=1.6, vol=1.0):
    t = ts(d)
    s = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t)
    return s * np.exp(-t / 0.7) * np.minimum(1, t / 0.01) * vol


def drum(vol=1.0, f0=150):
    """手鼓：音高往下的短闷音，叠一点皮面噪声。"""
    t = ts(0.3); f = f0 * (0.7 + 0.3 * np.exp(-t / 0.03))
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.09)
    s += hp(rng.uniform(-1, 1, len(t))) * np.exp(-t / 0.012) * 0.15
    return s * vol


def boom(vol=1.0):
    t = ts(1.2); f = 40 + 55 * np.exp(-t / 0.08)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.45) * vol


def pad(fs, d, vol=1.0, att=1.0, rel=1.4):
    t = ts(d); s = np.zeros(len(t))
    for f in fs:
        for det in (-0.15, 0.15):
            ph = rng.uniform(0, 6.3)
            s += np.sin(2 * np.pi * f * (1 + det / 100) * t + ph) + 0.25 * np.sin(4 * np.pi * f * (1 + det / 100) * t + ph)
    a = np.minimum(1, t / att); r = np.clip((d - t) / rel, 0, 1)
    return s * a * r * vol / len(fs)


# F 宫五声：F G A C D
PENTA = [53, 55, 57, 60, 62, 65, 67, 69, 72, 74, 77, 79, 81, 84, 86]
CHORDS = [(41, [65, 69, 72]), (38, [62, 65, 69]), (46, [62, 65, 70]), (36, [64, 67, 72])]   # F Dm B♭ C
# 两小节一句（八分音符为单位，None 是空），慢、留白多
PHRASES = [
    [72, None, None, 74, 77, None, 74, None, 72, None, 69, None, None, None, None, None],
    [69, None, None, 72, 74, None, 72, 69, 67, None, None, None, 65, None, None, None],
    [77, None, None, 79, 81, None, 79, 77, 74, None, 77, None, None, None, None, None],
    [74, None, 72, None, 69, None, 67, None, 65, None, None, None, None, None, None, None],
]


def busy(t):          # 领着它走、走近、后退、跳那一段：节奏紧一点
    return lead - 0.3 <= t < final_fan - 0.2


n_bars = int(np.ceil(OUTRO / BAR))
for b in range(n_bars):
    t0 = b * BAR
    root, ch = CHORDS[b % 4]
    add(pad([midi(n) for n in ch], BAR + 1.0, att=0.9), t0, 0.06)
    add(bass(midi(root)), t0, 0.32)
    phrase = PHRASES[(b // 2) % 4]
    for k in range(8):
        t = t0 + k * BEAT / 2
        if t >= OUTRO - 0.05:
            break
        m = phrase[(b % 2) * 8 + k]
        if m is not None:
            add(pluck(midi(m), 2.2), t, 0.22, 0.2)
            if b >= 4 and k % 4 == 0:
                add(pluck(midi(m + 12), 1.2, bright=1.4), t + 0.006, 0.05, -0.35)
        if busy(t):
            if k % 2 == 0:
                add(drum(f0=150 if k % 4 == 0 else 190), t, 0.22 if k % 4 == 0 else 0.13, -0.15)
            else:
                add(pluck(midi(ch[(k // 2) % 3]), 0.35, bright=0.7), t, 0.07, 0.35)    # 短促的弱拍拨音
        elif t > 6 and k % 4 == 0:
            add(drum(f0=120), t, 0.07, -0.1)

# 开屏：五声往上刮奏
for i, tf in enumerate(fan_on):
    n = 13 if tf == final_fan else 9
    for j in range(n):
        add(pluck(midi(PENTA[2 + j]), 2.4, bright=1.3), tf + j * 0.075, 0.12 + 0.006 * j, -0.5 + j / n)
# 点下尾羽：三个音往下落
for tp in plucks:
    for j, m in enumerate((86, 81, 77)):
        add(bell(midi(m), 1.6), tp + j * 0.28, 0.06, 0.3 - 0.3 * j)
# 插回原处：一声铃似的和弦
for tr in returns:
    for j, m in enumerate((77, 81, 84)):
        add(bell(midi(m), 2.6), tr + j * 0.03, 0.07)
# 啄、落地：一记低音
for tk in pecks:
    add(boom(), tk + 0.2, 0.28); add(drum(f0=220), tk + 0.2, 0.18)
for tl in lands:
    add(boom(), tl, 0.22)
# 尾奏：最后一次开屏的整和弦，署名页底下分解和弦慢慢淡出
add(pad([midi(n) for n in (53, 60, 65, 69, 72, 77)], TOTAL - OUTRO + 0.5, att=0.6, rel=2.5), OUTRO, 0.09)
add(bass(midi(41), 3.5), OUTRO, 0.35)
arp = [53, 60, 65, 67, 69, 72, 77, 79, 81]
for i, m in enumerate(arp + arp[::-1][1:6]):
    add(pluck(midi(m), 2.6), OUTRO + 1.2 + i * BEAT / 2, 0.15 if i < len(arp) else 0.1, -0.3 + 0.6 * (i % 2))
# 署名页两声落定音（模板 1.8 秒盖印章、2.8 秒按指纹）：一下短促的「嗒」叠一记闷的低音
for dt in (1.8, 2.8):
    t = ts(0.08)
    click = (hp(rng.uniform(-1, 1, len(t))) * 0.5 + np.sin(2 * np.pi * 1800 * t)) * np.exp(-t / 0.012)
    add(click, LIVE + dt, 0.22); add(boom(), LIVE + dt, 0.3)
fade = np.ones(N); nf = int(1.6 * SR); fade[-nf:] = np.linspace(1, 0, nf) ** 1.5
music *= fade[:, None]

# 页面声音（只有实录段）
with wave.open(src + '/page.wav') as w:
    assert w.getframerate() == SR and w.getnchannels() == 2
    page = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').reshape(-1, 2) / 32768.0
pg = np.zeros((N, 2)); pg[: min(N, len(page))] = page[:N]
music /= np.abs(music).max()
# 页面声音整体提起来：最响的一下（啄、落地）到配乐峰值的 0.55
pk = np.abs(pg).max()
gain_page = 0.55 / pk if pk > 0 else 0
pg *= gain_page
mix = pg + music
print(f'页面声原始峰值 {20*np.log10(pk+1e-12):.1f} dBFS，提 {20*np.log10(gain_page):.1f} dB 后与配乐叠')


def save(path, x):
    x = np.clip(x, -1, 1)
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype('<i2').tobytes())


save(src + '/music.wav', music)
# 轻度饱和：短促的尖峰先圆一圆（照 dino-craft），后面限幅器就不用压得太狠
mix /= np.abs(mix).max()
mix = np.tanh(2.4 * mix) / np.tanh(2.4)
peak = np.abs(mix).max(); save(src + '/mix.wav', mix / peak * 0.7)


def measure(path, af=None):
    cmd = ['ffmpeg', '-hide_banner', '-nostats', '-i', path] + (['-af', af + ',ebur128=peak=true'] if af else ['-af', 'ebur128=peak=true']) + ['-f', 'null', '-']
    e = subprocess.run(cmd, capture_output=True, text=True).stderr
    e = e[e.rindex('Summary:'):]
    i = float(e.split('I:')[1].split('LUFS')[0]); tp = float(e.split('Peak:')[1].split('dBFS')[0])
    return i, tp


TARGET, LIMIT = -12.0, 10 ** (-3.0 / 20)
i0, _ = measure(src + '/mix.wav')
gain_db = TARGET - i0
for _ in range(6):
    af = f'aresample=192000,volume={gain_db:.2f}dB,alimiter=limit={LIMIT:.4f}:attack=1:release=60:level=disabled,aresample=48000'
    i1, tp1 = measure(src + '/mix.wav', af)
    if abs(i1 - TARGET) < 0.15:
        break
    gain_db += TARGET - i1
print(f'混音原始 {i0:.1f} LUFS，加 {gain_db:.1f} dB 并限幅后 {i1:.1f} LUFS、真峰 {tp1:.1f} dBFS；限幅器在最响处最多压 {max(0, 20*np.log10(0.7) + gain_db + 3.0):.1f} dB')
subprocess.run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', src + '/video.mp4', '-i', src + '/mix.wav', '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
                '-af', af, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart', film], check=True)
i2, tp2 = measure(film)
print(f'成片实测：{i2:.1f} LUFS，真峰 {tp2:.1f} dBFS')
