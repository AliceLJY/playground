"""碎碎平安演示片的配乐与合成：读 tools/demo.cjs 写的 cues.json 和 page.wav（页面自己当场合成的砸碎声），
在底下垫一层代码合成的配乐，卡在同一张 120 拍的网格上，再接署名页的两声落定音，最后响度归到 -12 LUFS 合成成片。全部代码合成，没有采样。

配乐（D 宫五声，I–vi–IV–V 四小节一轮）：
- 拨弦：一串谐波按高低各自衰减，近似古筝的一下；两小节一句的小旋律，后半程加一层高八度。
- 低音：每拍一下的短低音；底鼓在一、三拍，拍手在二、四拍，沙锤走八分音符。
- 事件：按住蓄力那一秒垫一段往上走的噪声，炸开那一下加一记镲和低频；「写烦心事」那几秒只留拨弦和沙锤，让打字声出来；
  「全砸了」那一下鼓全停一小节，只剩一记大镲和铺底和弦，下一小节加花回来；最后一下炸开之后进尾奏，署名页底下拨弦分解和弦慢慢淡出。

    ~/.local/share/sweety-statechart-video/venv/bin/python -I tools/demo-score.py <录制输出目录> <成片.mp4>
需要 numpy 和 ffmpeg。写 <录制输出目录>/music.wav、mix.wav，再两遍 loudnorm（线性）合成成片并打印实测响度。
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
BPM = 120; BEAT = 60 / BPM; BAR = 4 * BEAT
rng = np.random.default_rng(20261124)
acts = [a for a in cue['acts'] if a['kind'] != 'type' and not a.get('skip')]
holds = [a for a in acts if a['kind'] == 'hold']
smash_all = next(a['t'] for a in acts if a['kind'] == 'button' and a.get('name') == '全砸了')
write_on = next(a['t'] for a in acts if a['kind'] == 'button' and a.get('name') == '写烦心事')
note_burn = next(a['t'] for a in acts if a.get('note'))
final_hit = holds[-1]['t']
OUTRO = final_hit + BAR            # 最后一下炸开后再走一小节，进尾奏

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


def onepole_lp(x, fc):
    a = np.exp(-2 * np.pi * fc / SR)
    # 用截断的指数卷积核代替逐样本递推，避免 Python 循环
    k = (1 - a) * a ** np.arange(int(SR * 5 / fc) + 8)
    return np.convolve(x, k)[: len(x)]


def hp(x):
    return x - np.convolve(x, np.ones(8) / 8, mode='same')


def midi(m):
    return 440 * 2 ** ((m - 69) / 12)


def pluck(f, d=1.6, vol=1.0, bright=1.0):
    """古筝似的一下：谐波越高衰减越快，起音带一点噪声拨片声。"""
    t = ts(d); s = np.zeros(len(t))
    for h in range(1, 9):
        fh = f * h * (1 + 0.0006 * h * h)
        if fh > 15000:
            break
        s += np.sin(2 * np.pi * fh * t + h) * (0.9 ** h) * np.exp(-t * (1.6 + 1.9 * h / bright)) / h ** 0.6
    s += hp(rng.uniform(-1, 1, len(t))) * np.exp(-t / 0.004) * 0.25
    return s * np.minimum(1, t / 0.002) * vol


def bass(f, d=0.42, vol=1.0):
    t = ts(d)
    s = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2 * f * t) + 0.12 * np.sin(2 * np.pi * 3 * f * t)
    return s * np.exp(-t / 0.22) * np.minimum(1, t / 0.006) * vol


def kick(vol=1.0):
    t = ts(0.35)
    f = 48 + 110 * np.exp(-t / 0.035)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.12) * vol


def clap(vol=1.0):
    t = ts(0.22); s = hp(hp(rng.uniform(-1, 1, len(t))))
    env = np.exp(-t / 0.06) + 0.6 * np.exp(-np.maximum(0, t - 0.012) / 0.012) * (t > 0.012) + 0.5 * np.exp(-np.maximum(0, t - 0.024) / 0.012) * (t > 0.024)
    return s * env * 0.6 * vol


def shaker(vol=1.0):
    t = ts(0.07); s = hp(hp(hp(rng.uniform(-1, 1, len(t)))))
    return s * np.sin(np.pi * np.minimum(1, t / 0.07)) ** 2 * 0.5 * vol


def crash(d=2.2, vol=1.0):
    t = ts(d); s = hp(hp(rng.uniform(-1, 1, len(t))))
    for f in rng.uniform(3000, 9000, 18):
        s += np.sin(2 * np.pi * f * t + rng.uniform(0, 6.3)) * 0.06
    return s * np.exp(-t / (d * 0.32)) * np.minimum(1, t / 0.002) * vol


def boom(vol=1.0):
    t = ts(1.2)
    f = 38 + 60 * np.exp(-t / 0.08)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.45) * vol


def riser(d, vol=1.0):
    t = ts(d); s = rng.uniform(-1, 1, len(t))
    out = np.zeros(len(t)); seg = int(0.05 * SR)
    for i in range(0, len(t), seg):   # 分段带通：中心频率从 400 Hz 往上走到 5 kHz
        c = 400 * (5000 / 400) ** (i / len(t))
        x = s[i: i + seg]
        y = hp(x) if c > 2000 else x - onepole_lp(x, c * 0.5)
        out[i: i + seg] = onepole_lp(y, c * 1.6)[: len(x)]
    return out / (np.abs(out).max() + 1e-9) * (t / d) ** 2 * vol


def pad(fs, d, vol=1.0):
    t = ts(d); s = np.zeros(len(t))
    for f in fs:
        for det in (-0.12, 0.12):
            s += np.sin(2 * np.pi * f * (1 + det / 100) * t + rng.uniform(0, 6.3))
    att = np.minimum(1, t / 0.6); rel = np.minimum(1, (d - t) / 0.8)
    return s * att * np.clip(rel, 0, 1) * vol / len(fs)


# D 宫：I–vi–IV–V（D、Bm、G、A），旋律只用 D E F# A B
CHORDS = [(50, [62, 66, 69]), (47, [59, 62, 66]), (43, [59, 62, 67]), (45, [61, 64, 69])]
PENTA = [62, 64, 66, 69, 71, 74, 76, 78, 81]
# 两小节一句（以八分音符计，None 是空），四句轮着用
PHRASES = [
    [74, None, 71, 69, 71, None, 74, 76, 78, None, 76, 74, 71, None, 69, None],
    [69, None, 71, 74, 76, None, 74, 71, 69, None, 66, 64, 66, None, None, None],
    [74, 76, 78, None, 81, None, 78, 76, 74, None, 76, None, 71, 69, 71, None],
    [69, None, 66, 69, 71, None, 74, None, 76, 74, 71, None, 69, None, None, None],
]


def in_write(t):
    return write_on - 0.05 <= t < note_burn - 0.1


def drums_off(t):
    return smash_all <= t < smash_all - (smash_all % BAR) + 1.5 * BAR   # 「全砸了」那一下到下一小节第三拍


n_bars = int(np.ceil(OUTRO / BAR))
for b in range(n_bars):
    t0 = b * BAR
    root, ch = CHORDS[b % 4]
    phrase = PHRASES[(b // 2) % 4]
    for k in range(8):                     # 每小节 8 个八分音符
        t = t0 + k * BEAT / 2
        if t >= OUTRO:
            break
        beat = k / 2
        if k % 2 == 0:
            if not drums_off(t) and not in_write(t):
                if beat in (0, 2):
                    add(kick(), t, 0.55)
                if beat in (1, 3):
                    add(clap(), t, 0.32, 0.1)
                add(bass(midi(root + (12 if beat == 3 and b % 2 else 0))), t, 0.32)
            elif in_write(t) and beat == 0:
                add(bass(midi(root), 0.9), t, 0.22)
        if not drums_off(t):
            add(shaker(), t, 0.16 if k % 2 else 0.1, -0.3)
        m = phrase[(b % 2) * 8 + k]
        if m is not None:
            note = m
            add(pluck(midi(note), 1.4), t, 0.2, 0.25)
            if t > 16 and not in_write(t):            # 后半程加一层高八度，更亮
                add(pluck(midi(note + 12), 0.8, bright=1.4), t + 0.004, 0.06, -0.35)
    add(pad([midi(n) for n in ch], BAR + 0.4), t0, 0.05 if not drums_off(t0) else 0.09)

# 按住蓄力：从开始蓄（按下 280 ms 后）到炸开垫一段往上走的噪声；炸开一记镲和低频
for h in holds:
    start = h['t'] - 1.0
    add(riser(1.0), start, 0.12, 0.0)
    add(crash(1.8), h['t'], 0.16, 0.2); add(boom(), h['t'], 0.4)
# 全砸了：大镲＋低频＋铺底和弦，下一小节第三拍前一拍军鼓加花回来
add(crash(3.0), smash_all, 0.26); add(boom(), smash_all, 0.6)
back = smash_all - (smash_all % BAR) + 1.5 * BAR
for k, dt in enumerate([-0.5, -0.375, -0.25, -0.125]):
    add(clap(), back + dt, 0.14 + 0.05 * k, 0.1)
# 尾奏：署名页底下 D 大九和弦分解，慢慢淡出
arp = [50, 57, 62, 64, 66, 69, 74, 76, 78]
for i, m in enumerate(arp + arp[::-1][1:5]):
    add(pluck(midi(m), 2.4), OUTRO + i * BEAT / 2, 0.17 if i < len(arp) else 0.12, -0.3 + 0.6 * (i % 2))
add(pad([midi(n) for n in (50, 57, 62, 66, 69, 76)], TOTAL - OUTRO + 0.5), OUTRO, 0.08)
add(bass(midi(38), 2.5), OUTRO, 0.3)
# 署名页两声落定音（模板 1.8 秒盖印章、2.8 秒按指纹）：一下短促的「嗒」叠一记闷的低音
for dt in (1.8, 2.8):
    t = ts(0.08)
    click = (hp(rng.uniform(-1, 1, len(t))) * 0.5 + np.sin(2 * np.pi * 1800 * t)) * np.exp(-t / 0.012)
    add(click, LIVE + dt, 0.28); add(boom(), LIVE + dt, 0.35)
fade = np.ones(N); nf = int(1.6 * SR); fade[-nf:] = np.linspace(1, 0, nf) ** 1.5
music *= fade[:, None]

# 页面声音（只有实录段）
with wave.open(src + '/page.wav') as w:
    assert w.getframerate() == SR and w.getnchannels() == 2
    page = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').reshape(-1, 2) / 32768.0
pg = np.zeros((N, 2)); pg[: min(N, len(page))] = page[:N]


def rms(x):
    return np.sqrt(np.mean(x ** 2)) + 1e-12


live_n = int(LIVE * SR)
r_page, r_music = rms(pg[:live_n]), rms(music[:live_n])
music *= (r_page / r_music) * 10 ** (-4 / 20)     # 配乐比砸碎声低 4 dB（按实录段的平均能量）
mix = pg + music
print(f'页面声 RMS {20*np.log10(r_page):.1f} dBFS，配乐调到低 4 dB；首个非零样本在 {np.argmax(np.abs(mix).max(1) > 1e-4)/SR:.3f} 秒')


def save(path, x):
    x = np.clip(x, -1, 1)
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype('<i2').tobytes())


save(src + '/music.wav', music / max(1, np.abs(music).max()))
peak = np.abs(mix).max(); save(src + '/mix.wav', mix / peak * 0.7)

# 响度：砸碎声瞬态很尖，直接线性归一会冲破真峰。先按量到的整体响度加增益，再过限幅器压住尖峰（-3.5 dBFS），
# 限幅在 4 倍采样率上做（鞭炮那串噼啪瞬态极尖，原采样率上压住了，样点之间照样冲过 0 dB），限幅会吃掉一点响度，再量再补，收敛到 -12 LUFS。
def measure(path, af=None):
    cmd = ['ffmpeg', '-hide_banner', '-nostats', '-i', path] + (['-af', af + ',ebur128=peak=true'] if af else ['-af', 'ebur128=peak=true']) + ['-f', 'null', '-']
    e = subprocess.run(cmd, capture_output=True, text=True).stderr
    e = e[e.rindex('Summary:'):]
    i = float(e.split('I:')[1].split('LUFS')[0]); tp = float(e.split('Peak:')[1].split('dBFS')[0])
    return i, tp


TARGET, LIMIT = -12.0, 10 ** (-3.5 / 20)   # AAC 编码会把真峰再抬约 1 dB，留够余量
i0, _ = measure(src + '/mix.wav')
gain_db = TARGET - i0
for _ in range(5):
    af = f'aresample=192000,volume={gain_db:.2f}dB,alimiter=limit={LIMIT:.4f}:attack=1:release=60:level=disabled,aresample=48000'
    i1, tp1 = measure(src + '/mix.wav', af)
    if abs(i1 - TARGET) < 0.15:
        break
    gain_db += TARGET - i1
print(f'混音原始 {i0:.1f} LUFS，加 {gain_db:.1f} dB 并限幅后 {i1:.1f} LUFS、真峰 {tp1:.1f} dBFS')
subprocess.run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', src + '/video.mp4', '-i', src + '/mix.wav', '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
                '-af', af, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart', film], check=True)
i2, tp2 = measure(film)
print(f'成片实测：{i2:.1f} LUFS，真峰 {tp2:.1f} dBFS')
