"""Soundtrack for the cathedral demo film, built from events.json written by tools/film.cjs.

A quiet organ-like pad in D major (additive pipe tones, slow swells), church-bell tolls at the opening and a
distant one while walking across the forecourt, a fuller sound with a 16-foot pedal and a longer room once the
camera is through the door, a small rising phrase when the light turns from morning to evening, and two soft
taps when the end card's seal and thumbprint land. Everything is synthesized here; no samples, no existing tune.

    uv run --with numpy --with scipy python tools/demo-sound.py <out-dir>     (reads events.json, writes sound-raw.wav)
    ffmpeg -i sound-raw.wav -af loudnorm=I=-17:TP=-1.5:LRA=11 -ar 44100 sound.wav
    ffmpeg -framerate 30 -i frames/%05d.jpg -i sound.wav -c:v libx264 -pix_fmt yuv420p -color_range tv -crf 18 \
      -c:a aac -b:a 192k -movflags +faststart -shortest film.mp4
"""
import json, sys, wave
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 44100
out = sys.argv[1]
ev = json.load(open(out + '/events.json'))
T = ev['seconds']; N = int(T * SR); t = np.arange(N) / SR
rng = np.random.default_rng(20261121)
marks = ev['marks']
first = lambda name, d: next((m['t'] for m in marks if m['name'] == name), d)
t_in = first('zone:in', 24.5)
t_light, t_light_end, t_outro = first('section:light', 38.5), first('lightEnd', 46.5), first('section:outro', T - 5.6)
hz = lambda m: 440.0 * 2 ** ((m - 69) / 12)

def lp(x, f):
    return sosfilt(butter(2, f / (SR / 2), 'low', output='sos'), x)

def place(buf, sig, when, gain=1.0):
    i = int(when * SR)
    if i >= len(buf): return
    n = min(len(sig), len(buf) - i); buf[i:i + n] += sig[:n] * gain

# ---------- organ pad ----------
HARM = [(1, 1.0), (2, 0.5), (3, 0.32), (4, 0.22), (5, 0.1), (6, 0.08), (8, 0.05)]
def pipe(f, dur, att=0.9, rel=1.4):
    n = int((dur + rel) * SR); x = np.arange(n) / SR
    s = sum(a * (np.sin(2 * np.pi * f * h * x + h) + 0.6 * np.sin(2 * np.pi * f * h * 1.0006 * x)) for h, a in HARM if f * h < 7000)
    e = np.minimum(1, x / att) * np.clip((dur + rel - x) / rel, 0, 1)
    return s * e
CH = {'D': [50, 57, 62, 66], 'Bm': [47, 54, 59, 62], 'G': [43, 55, 59, 62], 'A': [45, 57, 61, 64], 'F#m': [42, 54, 57, 61],
      'Em': [40, 55, 59, 64], 'Dhi': [50, 62, 66, 69], 'A/C#': [49, 57, 64, 69]}
L = t_light
PROG = [(0, 'D'), (3.75, 'Bm'), (7.5, 'G'), (10.8, 'A'), (14, 'D'), (17.2, 'F#m'), (20.4, 'G'), (22.6, 'A'), (t_in - 0.4, 'D'), (t_in + 3.5, 'Bm'),
        (30, 'G'), (34.5, 'Em'), (L, 'G'), (L + 3, 'A/C#'), (L + 6, 'Dhi'), (t_outro, 'D')]
outside, inside = np.zeros(N), np.zeros(N)
for i, (s0, name) in enumerate(PROG):
    s1 = PROG[i + 1][0] if i + 1 < len(PROG) else T - 1.4
    for m in CH[name]:
        if s0 < t_in - 0.5: place(outside, pipe(hz(m + 12), s1 - s0), s0, 0.05)             # outside: a higher, thinner voicing
        else: place(inside, pipe(hz(m), s1 - s0), s0, 0.04)
    if s0 >= t_in - 0.5: place(inside, pipe(hz(CH[name][0] - 12), s1 - s0, att=1.6) * 1.3, s0, 0.045)   # 16' pedal inside
# outside sounds as if heard through the walls; the switch at the door is a short crossfade, not a cut
outside = lp(outside, 1100); inside = lp(inside, 3800)
trem = 1 + 0.035 * np.sin(2 * np.pi * 5.1 * t)
pad = outside * np.clip((t_in + 0.6 - t) / 1.2, 0, 1) + inside * trem
pad *= np.clip(t / 1.2, 0, 1) * np.clip((T - t) / 2.0, 0, 1)

# ---------- bells ----------
PART = [(0.5, 0.45, 9), (1, 0.8, 6), (1.183, 0.55, 4.5), (1.506, 0.3, 4), (2, 0.85, 3.4), (2.514, 0.28, 2.4), (2.662, 0.2, 2.2), (3.011, 0.18, 1.8), (4.166, 0.12, 1.2)]
def bell(f, dur=9.0):
    n = int(dur * SR); x = np.arange(n) / SR
    s = sum(a * np.sin(2 * np.pi * f * r * x + r * 3) * np.exp(-x / d) for r, a, d in PART)
    strike = lp(rng.uniform(-1, 1, n), 3000) * np.exp(-x / 0.012) * 0.6
    return (s + strike) * np.minimum(1, x / 0.002)
bells = np.zeros(N)
place(bells, bell(hz(62)), first('bell', 0.15), 0.32)
place(bells, bell(hz(57)), 3.9, 0.22)
place(bells, lp(bell(hz(62)), 1600), 15.2, 0.12)           # distant toll while crossing the forecourt
place(bells, lp(bell(hz(57)), 1600), 19.0, 0.08)

# ---------- light turning: a small rising phrase ----------
def flute(f, dur):
    n = int(dur * SR); x = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * x) + 0.25 * np.sin(4 * np.pi * f * x)) * np.minimum(1, x / 0.08) * np.exp(-x / (dur * 0.45))
rise = np.zeros(N)
for k, m in enumerate([74, 78, 81, 86]): place(rise, flute(hz(m), 2.6), L + 1.4 + k * 0.42, 0.06)
for k, m in enumerate([78, 81, 86, 90]): place(rise, flute(hz(m), 3.0), L + 5.6 + k * 0.42, 0.05)

# ---------- end card: seal and thumbprint land ----------
taps = np.zeros(N)
def tap():
    n = int(0.35 * SR); x = np.arange(n) / SR; f = 170 * np.exp(-x * 6)
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x / 0.07) + lp(rng.uniform(-1, 1, n), 2500) * np.exp(-x / 0.008) * 0.4)
for d in (1.8, 2.8): place(taps, tap(), t_outro + d, 0.35)

# ---------- room ----------
def ir(sec, damp):
    n = int(sec * SR); x = np.arange(n) / SR
    return lp(rng.uniform(-1, 1, n), damp) * np.exp(-x / (sec / 6.5))
wet_in = fftconvolve(pad + bells * 0.5 + rise, ir(4.5, 5000), mode='full')[:N] * 0.012
dry = pad + bells + rise + taps
mix = dry + wet_in * np.clip((t - t_in + 0.5) / 2, 0.35, 1)
mix /= np.max(np.abs(mix)) * 1.12
stereo = np.stack([mix, np.roll(mix, int(0.011 * SR)) * 0.96 + mix * 0.04], axis=1)
with wave.open(out + '/sound-raw.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(stereo, -1, 1) * 32767).astype('<i2').tobytes())
print('sound-raw.wav', round(T, 2), 's; door at', t_in, 'light at', L, 'outro at', t_outro)
