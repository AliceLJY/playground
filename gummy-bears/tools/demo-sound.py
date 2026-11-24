"""软糖熊演示片的配乐与合成：读 tools/demo.cjs 写的 cues.json（每个手势的时刻、拉伸读数轨迹）和 page.wav
（页面自己当场合成的落地「啵」、抓起「啾」、拉长松手「嘣」），在底下垫一层代码合成的俏皮配乐，再接署名页的两声落定音，
最后响度归到 -12 LUFS 合成成片。全部代码合成，没有采样。

配乐（C 宫五声，每分钟 120 拍，C–Am–F–G 一小节一个和弦）：
- 木琴似的短音：起音脆、半拍内就收，八分音符上蹦着走的小旋律；低音跳八度，底鼓在一、三拍，指响在二、四拍，沙锤走八分。
- 事件：每次捏住往上拎，一声往上滑的哨音（很轻，跟着手的速度）；甩出去那一下哨音更高更快；
  点「再倒一些」那三下，配乐只留低音和沙锤，让一阵「啵啵啵」出来，每一下点按配一个往下的钟琴三连音；
  倒满后一记轻镲；最后一甩之后进尾奏，署名页底下分解和弦慢慢淡出。
页面声音是主角：配乐按页面声音出声那些片段的平均能量压在它下面 4 dB；整体再轻度饱和、限幅，归到 -12 LUFS。

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
BEAT = cue.get('beat', 0.5); BAR = 4 * BEAT
rng = np.random.default_rng(20261126)
cues = cue['cues']
touches = [c for c in cues if c['name'].startswith('touch:')]
lifts = {c['name'][5:]: c for c in cues if c['name'].startswith('lift:')}
pours = [c['t'] for c in cues if c['name'] == 'tap:pour']
piled = next(c['t'] for c in cues if c['name'] == 'piled')
end_t = next(c['t'] for c in cues if c['name'] == 'end')
OUTRO = np.ceil((end_t + 0.6) / BAR) * BAR      # 最后一甩落地后、下一小节进尾奏

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


def mallet(f, d=0.5, vol=1.0):
    """木琴：基音加 4 倍、10 倍泛音，泛音收得快，起音一点敲击噪声。"""
    t = ts(d)
    s = np.sin(2 * np.pi * f * t) * np.exp(-t * 9) + 0.35 * np.sin(2 * np.pi * f * 3.98 * t) * np.exp(-t * 28) + 0.12 * np.sin(2 * np.pi * f * 9.9 * t) * np.exp(-t * 60)
    s += hp(rng.uniform(-1, 1, len(t))) * np.exp(-t / 0.002) * 0.15
    return s * np.minimum(1, t / 0.0015) * vol


def glock(f, d=1.2, vol=1.0):
    t = ts(d)
    return (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 3)) * np.exp(-t * 2.6) * np.minimum(1, t / 0.002) * vol


def bass(f, d=0.22, vol=1.0):
    t = ts(d)
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t)
    return s * np.exp(-t / 0.09) * np.minimum(1, t / 0.004) * vol


def kick(vol=1.0):
    t = ts(0.25); f = 52 + 120 * np.exp(-t / 0.03)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.08) * vol


def snap(vol=1.0):
    t = ts(0.08); s = hp(hp(rng.uniform(-1, 1, len(t))))
    return (s * 0.7 + np.sin(2 * np.pi * 2100 * t) * 0.3) * np.exp(-t / 0.012) * vol


def shaker(vol=1.0):
    t = ts(0.06); s = hp(hp(hp(rng.uniform(-1, 1, len(t)))))
    return s * np.sin(np.pi * np.minimum(1, t / 0.06)) ** 2 * 0.5 * vol


def whistle(f0, f1, d, vol=1.0):
    """滑哨：正弦音高从 f0 滑到 f1，带一点颤。"""
    t = ts(d); f = f0 * (f1 / f0) ** (t / d) * (1 + 0.012 * np.sin(2 * np.pi * 9 * t))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * np.minimum(1, t / d)) ** 0.7 * vol


def cymbal(d=1.6, vol=1.0):
    t = ts(d); s = hp(hp(rng.uniform(-1, 1, len(t))))
    return s * np.exp(-t / (d * 0.3)) * np.minimum(1, t / 0.003) * vol


def boom(vol=1.0):
    t = ts(1.0); f = 40 + 55 * np.exp(-t / 0.08)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.4) * vol


def pad(fs, d, vol=1.0):
    t = ts(d); s = np.zeros(len(t))
    for f in fs:
        for det in (-0.12, 0.12):
            s += np.sin(2 * np.pi * f * (1 + det / 100) * t + rng.uniform(0, 6.3))
    return s * np.minimum(1, t / 0.4) * np.clip((d - t) / 1.2, 0, 1) * vol / len(fs)


CHORDS = [(48, [60, 64, 67]), (45, [57, 60, 64]), (41, [57, 60, 65]), (43, [59, 62, 67])]   # C Am F G
# 一小节一句（八分音符），C 宫五声，蹦着走、留空拍
PHRASES = [
    [72, None, 76, 79, None, 76, 74, None],
    [72, 69, None, 72, 76, None, None, None],
    [69, None, 72, 74, None, 72, 69, 67],
    [67, None, 69, 72, 74, None, 79, None],
    [76, 79, None, 81, 79, None, 76, None],
    [72, None, 74, 76, None, 74, 72, None],
    [69, 72, None, 69, 67, None, 69, None],
    [72, None, None, 67, 72, None, 84, None],
]


def pouring(t):      # 点「再倒一些」到倒满：只留低音和沙锤
    return pours[0] - 0.05 <= t < piled


n_bars = int(round(OUTRO / BAR))
for b in range(n_bars):
    t0 = b * BAR
    root, ch = CHORDS[b % 4]
    phrase = PHRASES[b % 8]
    for k in range(8):
        t = t0 + k * BEAT / 2
        beat = k / 2
        if k % 2 == 0:
            add(bass(midi(root + (12 if k in (2, 6) else 0))), t, 0.34)
            if not pouring(t):
                if beat in (0, 2):
                    add(kick(), t, 0.5)
                if beat in (1, 3):
                    add(snap(), t, 0.22, 0.15)
        add(shaker(), t, 0.12 if k % 2 else 0.07, -0.3)
        m = phrase[k]
        if m is not None and not pouring(t):
            add(mallet(midi(m)), t, 0.22, 0.25 if k % 2 else -0.1)
            if b >= 8 and k % 2 == 0:
                add(mallet(midi(m + 12), 0.3), t + 0.004, 0.06, -0.35)
    if not pouring(t0):
        add(pad([midi(n) for n in ch], BAR + 0.3), t0, 0.035)

# 捏住往上拎：一声往上滑的哨音；甩出去：更高更快
for c in touches:
    name = c['name'][6:]
    lf = lifts.get(name)
    if 'ling' in name:       # fling / pileFling / lastFling
        add(whistle(500, 900, 0.5), c['t'] + 0.05, 0.06, 0.2)
        if lf:
            add(whistle(700, 2200, 0.3), lf['t'] - 0.14, 0.08, -0.2)
    else:
        add(whistle(420, 820 + 300 * max(0, (lf['peak'] if lf else 1.3) - 1.2), 0.32), c['t'] + 0.03, 0.06, 0.15)
# 点「再倒一些」：往下的钟琴三连音；倒满一记轻镲
for k, tp in enumerate(pours):
    for j, m in enumerate((88 - 2 * k, 84 - 2 * k, 79 - 2 * k)):
        add(glock(midi(m), 0.9), tp + j * BEAT / 4, 0.07, 0.3 - 0.3 * j)
add(cymbal(2.0), piled, 0.07, 0.1)
# 尾奏：C 大六九和弦分解，署名页底下慢慢淡出
add(pad([midi(n) for n in (48, 55, 60, 64, 69, 74)], TOTAL - OUTRO + 0.5), OUTRO, 0.06)
add(bass(midi(36), 1.5), OUTRO, 0.4)
arp = [60, 64, 67, 69, 72, 76, 79, 81, 84]
for i, m in enumerate(arp + arp[::-1][1:5]):
    add(mallet(midi(m), 0.9), OUTRO + i * BEAT / 2, 0.16 if i < len(arp) else 0.1, -0.3 + 0.6 * (i % 2))
# 署名页两声落定音（模板 1.8 秒盖印章、2.8 秒按指纹）
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

# 页面声音出声的那些 50 ms 片段的平均能量；配乐整体压到它下面 8 dB
win = int(0.05 * SR); live_n = int(LIVE * SR)
segs = pg[: live_n - live_n % win].reshape(-1, win, 2)
seg_rms = np.sqrt((segs ** 2).mean(axis=(1, 2)))
active = seg_rms[seg_rms > 10 ** (-50 / 20)]
r_page = np.sqrt((active ** 2).mean())
r_music = np.sqrt((music[:live_n] ** 2).mean()) + 1e-12
music *= (r_page / r_music) * 10 ** (-4 / 20)
mix = pg + music
print(f'页面声出声片段 {len(active)} 段、平均 {20*np.log10(r_page):.1f} dBFS；配乐压到它下面 4 dB')


def save(path, x):
    x = np.clip(x, -1, 1)
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype('<i2').tobytes())


save(src + '/music.wav', music / max(1, np.abs(music).max()))
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
