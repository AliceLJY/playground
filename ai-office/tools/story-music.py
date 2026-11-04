"""像素办公室日常系列的配乐：按 story-record.cjs 写的 marks.json，每一镜换一个和弦、镜头切换时一声钢片琴，
尤克里里扫弦（Karplus-Strong 拨弦）＋钢片琴旋律＋软贝斯＋沙锤，92 BPM、F 大调；标了 night 的镜头放慢放轻；
片尾署名页落在主和弦上淡出。纯 numpy 合成，无采样。
用法：~/.venv-kokoro/bin/python3 tools/story-music.py <marks.json> <shots.json> <片尾秒数> <out.wav>"""
import sys, json, wave, numpy as np
marks, shots = json.load(open(sys.argv[1])), json.load(open(sys.argv[2]))
END = float(sys.argv[3]); SR = 48000; BODY = marks['seconds']; T = BODY + END
n = int(SR * T); out = np.zeros((n, 2)); rng = np.random.default_rng(11)
BPM = 92; beat = 60 / BPM
NOTE = lambda m: 440 * 2 ** ((m - 69) / 12)
CH = {'F': [53, 57, 60, 65], 'Am': [57, 60, 64, 69], 'Bb': [58, 62, 65, 70], 'C': [55, 60, 64, 67], 'Dm': [50, 57, 62, 65], 'Gm': [55, 58, 62, 67]}
PROG = ['F', 'Am', 'Bb', 'C', 'F', 'Dm', 'Bb', 'C', 'Bb', 'Gm', 'C']
def put(sig, at, pan=0.0, amp=1.0):
    i = int(at * SR); m = min(len(sig), n - i)
    if m <= 0: return
    out[i:i+m, 0] += sig[:m] * amp * (1 - pan) / 2 * 2 ** .5
    out[i:i+m, 1] += sig[:m] * amp * (1 + pan) / 2 * 2 ** .5
def pluck(f, dur=1.2, bright=0.5):
    N = int(SR / f); buf = rng.uniform(-1, 1, N) * bright + rng.uniform(-1, 1, N) * (1 - bright) * 0.3
    L = int(dur * SR); y = np.zeros(L)
    for i in range(L):
        y[i] = buf[i % N]; buf[i % N] = 0.497 * (buf[i % N] + buf[(i + 1) % N])
    return y * np.minimum(1, np.arange(L) / 30)
def bell(f, dur=1.6):
    t = np.arange(int(dur * SR)) / SR; e = np.exp(-t * 3.2)
    return (np.sin(2*np.pi*f*t) + .4*np.sin(2*np.pi*f*2.76*t)*np.exp(-t*6) + .2*np.sin(2*np.pi*f*5.4*t)*np.exp(-t*10)) * e * np.minimum(1, t / .002)
def bass(f, dur):
    t = np.arange(int(dur * SR)) / SR
    return (np.sin(2*np.pi*f*t) + .25*np.sin(2*np.pi*2*f*t)) * np.exp(-t * 2.2) * np.minimum(1, t / .01)
def shaker(dur=.08):
    t = np.arange(int(dur * SR)) / SR; s = rng.standard_normal(len(t)); s = np.diff(s, prepend=0)
    return s * np.exp(-t * 60) * .25
cache = {}
def pl(m, dur, bright):
    k = (m, round(dur, 2), bright)
    if k not in cache: cache[k] = pluck(NOTE(m), dur, bright)
    return cache[k]
starts = [mk['start'] for mk in marks['marks']] + [BODY]
STRUM = [(0, 'd'), (1, 'd'), (1.5, 'u'), (2.5, 'u'), (3, 'd'), (3.5, 'u')]
PENTA = [0, 2, 4, 7, 9]
for k, mk in enumerate(marks['marks']):
    a, b = starts[k], starts[k + 1]; night = shots[k].get('night', False)
    chord = CH['Bb' if night else PROG[k % len(PROG)]]; vol = .5 if night else 1.0
    put(bell(NOTE(chord[-1] + 12)), a, .3, .22 * vol)                     # shot change chime
    t = a
    while t < b - .05:
        for off, d in STRUM:
            tt = t + off * beat
            if tt >= b - .05: break
            if night and d == 'u': continue
            notes = chord if d == 'd' else chord[::-1][:3]
            for j, m in enumerate(notes): put(pl(m, 1.0, .45 if d == 'd' else .3), tt + j * .012, -.25, .16 * vol)
            if not night and off in (1.5, 3.5): put(shaker(), tt, .4, .5)
        put(bass(NOTE(chord[0] - 12), beat * 2), t, 0, .35 * vol); put(bass(NOTE(chord[0] - 5), beat * 2), t + 2 * beat, 0, .28 * vol)
        t += 4 * beat
    # melody: a short phrase per shot from the F-major pentatonic, landing on a chord tone
    root = 65; mt = a + beat; phrase = rng.integers(4, 7)
    for i in range(phrase):
        if mt > b - beat: break
        m = root + PENTA[rng.integers(0, 5)] + (12 if rng.random() < .3 else 0)
        if i == phrase - 1: m = chord[2] + 12
        put(bell(NOTE(m), 1.2), mt, .2, .15 * vol); mt += beat * (1 if rng.random() < .6 else .5)
# endcard: F major, slow arpeggio, fade out
for j, m in enumerate([53, 57, 60, 65, 69, 72]): put(pl(m, 2.5, .4), BODY + .1 + j * .18, -.2, .18)
put(bass(NOTE(41), 3.0), BODY + .1, 0, .4); put(bell(NOTE(77), 3.0), BODY + 1.2, .2, .2)
fade = int(1.5 * SR); out[-fade:] *= np.linspace(1, 0, fade)[:, None]
out /= np.abs(out).max() + 1e-9; out *= .7
pcm = (out * 32767).astype('<i2')
with wave.open(sys.argv[4], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('wrote', sys.argv[4], f'{T:.2f}s')
