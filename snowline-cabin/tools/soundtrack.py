"""Soundtrack for the demo video made by tools/record.cjs, synthesised from scratch: no samples, no music files.
    python3 tools/soundtrack.py out.wav            (needs numpy)
    ffmpeg -i video.mp4 -i out.wav -c:v copy -af loudnorm=I=-16:TP=-1.5:LRA=11 -c:a aac -b:a 192k -shortest with-sound.mp4
The cue times below are the marks record.cjs prints for its tour (59.5 s) followed by its finale take; the tour is
frame-exact, so the same script gives the same times. If the tour changes, read the new marks and edit CUES.
Layers: a slow pad, wind outdoors, a fire indoors, a bell figure when a summit lights, a soft rush on each flight,
and small high bells for the shooting stars."""
import sys, wave
import numpy as np

SR, DUR = 48000, 83.2
N = int(SR * DUR); t = np.arange(N) / SR
rng = np.random.default_rng(20261011)
T2 = 59.5                                            # where the finale take starts
CUES = dict(
    lit=[9.27, 15.58, T2 + 5.48],                    # a summit's lamps come on
    fly=[(4.3, 9.2), (12.95, 15.5), (19.0, 24.5), (T2 + 2.3, T2 + 5.4), (T2 + 8.7, T2 + 12.5)],
    tap=[4.2, 12.87, 18.98, 41.0, 57.2, T2 + 2.2],
    hour=(26.2, 40.2), dusk=28.4, dawn=36.0,
    inside=(41.4, 57.6), spots=[48.6, 54.2],
    finale=T2 + 8.67, end=T2 + 20.2,
)
env = lambda pts: np.interp(t, [p[0] for p in pts], [p[1] for p in pts])      # piecewise-linear envelope over the whole track
def noise_band(lo, hi, seed):                       # noise limited to a band, by zeroing the spectrum outside it
    spec = np.fft.rfft(np.random.default_rng(seed).standard_normal(N)); f = np.fft.rfftfreq(N, 1 / SR)
    spec *= (f > lo) * (f < hi) * np.minimum(1, (f - lo) / (lo * 0.5 + 1)) * np.minimum(1, (hi - f) / (hi * 0.3)).clip(0)
    x = np.fft.irfft(spec, N); return x / (np.abs(x).max() + 1e-9)
L = np.zeros(N); R = np.zeros(N)
def add(x, gain=1.0, pan=0.0): 
    global L, R
    L += x * gain * np.sqrt((1 - pan) / 2); R += x * gain * np.sqrt((1 + pan) / 2)

inside = env([(0, 0), (CUES['inside'][0] - 0.4, 0), (CUES['inside'][0], 1), (CUES['inside'][1] - 0.4, 1), (CUES['inside'][1], 0), (DUR, 0)])
outside = 1 - inside

# pad: four slow chords, each voice a few detuned sines with a breathing level
A4 = 440.0; hz = lambda semis: A4 * 2 ** (semis / 12)
CHORDS = [  # (start, notes in semitones from A4)          D minor 9 -> B flat major 7 -> F add 9 -> C sus
    (0.0, [-19, -12, -7, -4, 3]), (13.0, [-23, -11, -7, -4, 0]), (26.0, [-16, -9, -4, -2, 3]), (36.0, [-21, -9, -7, -2, 5]),
    (48.0, [-19, -12, -7, -4, 3]), (T2 + 0.0, [-23, -11, -7, -4, 0]), (T2 + 8.67, [-16, -9, -4, 0, 3, 8]), (DUR + 1, []),
]
pad = np.zeros(N)
for i in range(len(CHORDS) - 1):
    a, notes = CHORDS[i]; b = CHORDS[i + 1][0]
    e = env([(0, 0), (max(0, a - 2.5), 0), (a + 2.5, 1), (b - 2.5, 1), (b + 2.5, 0), (DUR + 9, 0)])
    for j, s in enumerate(notes):
        f = hz(s); v = np.zeros(N)
        for d in (-0.35, 0, 0.4): v += np.sin(2 * np.pi * f * (1 + d / 100) * t + rng.uniform(0, 6.28))
        v += 0.25 * np.sin(2 * np.pi * 2 * f * t + rng.uniform(0, 6.28))
        pad += v * e * (0.75 + 0.25 * np.sin(2 * np.pi * (0.07 + 0.013 * j) * t + j)) / (1 + j * 0.25)
bright = env([(0, 0.55), (CUES['dusk'] - 1, 0.55), (CUES['dusk'], 0.7), (CUES['dawn'], 1.0), (CUES['hour'][1], 0.55), (CUES['finale'], 0.6), (CUES['finale'] + 3, 1.0), (DUR, 0.8)])
add(pad / np.abs(pad).max(), 0.34); 
shimmer = np.sin(2 * np.pi * hz(15) * t) * 0.5 + np.sin(2 * np.pi * hz(22) * t) * 0.3          # an airy top that opens at dawn and in the finale
add(shimmer * (bright - 0.55).clip(0) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.21 * t)), 0.09)

# wind outdoors (gusting), heard dull and low from indoors
gust = 0.55 + 0.3 * np.sin(2 * np.pi * 0.09 * t + 1) + 0.15 * np.sin(2 * np.pi * 0.23 * t)
add(noise_band(180, 900, 1) * gust * outside, 0.16, -0.25); add(noise_band(250, 1400, 2) * (1.1 - gust) * outside, 0.1, 0.3)
add(noise_band(60, 240, 3) * (0.6 + 0.4 * gust) * inside, 0.1)

# fire indoors: a low breath plus many tiny crackles
add(noise_band(70, 420, 4) * inside * (0.7 + 0.3 * np.sin(2 * np.pi * 0.7 * t)), 0.14, -0.2)
crack = np.zeros(N); hi = noise_band(1500, 7000, 5)
for _ in range(260):
    c = rng.uniform(*CUES['inside']); i0 = int(c * SR); n = int(SR * rng.uniform(0.004, 0.02)); a = rng.uniform(0.2, 1) ** 2
    if i0 + n < N: crack[i0:i0 + n] += hi[i0:i0 + n] * a * np.exp(-np.arange(n) / (n * 0.3))
add(crack * inside, 0.3, -0.15)

def bell(at, semis, gain=1.0, pan=0.0, decay=1.6):      # a small bell: a few inharmonic partials, each dying at its own rate
    i0 = int(at * SR); n = min(N - i0, int(SR * decay * 4)); 
    if n <= 0: return
    tt = np.arange(n) / SR; f = hz(semis); x = np.zeros(n)
    for mult, amp, d in ((1, 1, 1), (2.01, 0.5, 0.6), (2.76, 0.35, 0.45), (5.4, 0.18, 0.25), (8.9, 0.08, 0.15)):
        x += amp * np.sin(2 * np.pi * f * mult * tt) * np.exp(-tt / (decay * d))
    x *= np.minimum(1, tt / 0.004)
    L[i0:i0 + n] += x * gain * np.sqrt((1 - pan) / 2); R[i0:i0 + n] += x * gain * np.sqrt((1 + pan) / 2)

for k, at in enumerate(CUES['lit']):                    # lamps coming on: a rising three-note figure, higher each time
    for j, s in enumerate((3, 7, 10 if k < 2 else 12)): bell(at + 0.05 + j * 0.22, s + (0 if k == 0 else 2 if k == 1 else 5), 0.17, (j - 1) * 0.4, 2.0)
for at in CUES['tap']: bell(at, 15, 0.05, 0, 0.25)
for at in CUES['spots']: bell(at, 10, 0.045, 0, 0.3)

rush = noise_band(300, 2600, 6)                         # flights: air moving past, swelling in the middle
for a, b in CUES['fly']: add(rush * env([(0, 0), (a, 0), ((a + b) / 2, 1), (b, 0), (DUR, 0)]) ** 1.5, 0.11)

mr = np.random.default_rng(55)                          # shooting stars: one small high bell each, scattered left and right
for i in range(18): bell(CUES['finale'] + 1.6 + i * 0.42 + mr.uniform(0, 0.5), mr.choice([15, 19, 22, 24, 27]), 0.07, mr.uniform(-0.8, 0.8), 0.9)
for j, s in enumerate((-9, -2, 3, 8, 12)): bell(CUES['finale'] + 0.3 + j * 0.28, s, 0.13, (j - 2) * 0.3, 3.0)      # the finale opens with a wide rising chord

master = env([(0, 0), (1.6, 1), (T2 - 0.25, 1), (T2 - 0.02, 0.35), (T2 + 0.5, 1), (DUR - 3.2, 1), (DUR - 0.1, 0)])   # fade in, dip across the cut, fade out
st = np.stack([L, R], 1) * master[:, None]; st = np.tanh(st * 1.1) / 1.1
st /= max(1e-9, np.abs(st).max()) / 0.89
with wave.open(sys.argv[1], 'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((st * 32767).astype('<i2').tobytes())
print('wrote', sys.argv[1], 'seconds', DUR, 'peak', float(np.abs(st).max()))
