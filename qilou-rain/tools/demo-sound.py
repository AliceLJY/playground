"""Soundtrack for the qilou-rain demo film, built from events.json written by tools/record.cjs.

Rain bed, a low synth pulse in D minor (bass, slow pad, soft ticks; no chiptune, no plucked strings, so it does
not sound like the neighbouring demos), and the game's cues on the frames where they happen: spray hiss while
the sprayer is on, a squelch per kill, a thump per slipper hit, an iron clang and two rising notes per sealed
manhole, a thud when bitten, a growl before the armoured one charges, a clang when it flips, and a short major
phrase at the end. Everything is synthesized here; no samples.

    uv run --with numpy python tools/demo-sound.py <out-dir>     (reads events.json, writes sound-raw.wav)
    ffmpeg -i sound-raw.wav -af loudnorm=I=-16:TP=-1.5:LRA=11 -ar 44100 sound.wav
    ffmpeg -framerate 30 -i frames/%05d.jpg -i sound.wav -vf "scale=1080:1920:flags=lanczos,setsar=1" \
      -c:v libx264 -pix_fmt yuv420p -color_range tv -crf 18 -c:a aac -b:a 192k -movflags +faststart -shortest film.mp4
"""
import json, sys, wave
import numpy as np

SR = 44100
out = sys.argv[1]
ev = json.load(open(out + '/events.json'))
T = ev['seconds']; N = int(T * SR); t = np.arange(N) / SR
rng = np.random.default_rng(20261111)
mix = np.zeros(N)
marks = ev['marks']
at = lambda name: [m['t'] for m in marks if m['name'] == name]
sec = {m['name'][8:]: m['t'] for m in marks if m['name'].startswith('section:')}

def lowpass(x, k):
    y = np.empty_like(x); a = 0.0
    for i in range(0, len(x), 1): a += k * (x[i] - a); y[i] = a
    return y
def add(sig, when, gain=1.0):
    i = int(when * SR)
    if i >= N or i < 0: return
    n = min(len(sig), N - i); mix[i:i + n] += sig[:n] * gain
def env(n, a=0.005, d=0.3): x = np.arange(n) / SR; return np.minimum(1, x / a) * np.exp(-x / d)
def noise(dur): return rng.uniform(-1, 1, int(dur * SR))
def P(*a):
    n = max(len(x) for x in a); return sum(np.pad(x, (0, n - len(x))) for x in a)
def tone(f, dur, d=0.3, shape='sin', slide=1.0):
    n = int(dur * SR); x = np.arange(n) / SR; ph = 2 * np.pi * f * (x + (slide - 1) * x * x / (2 * dur))
    s = np.sin(ph) if shape == 'sin' else np.sign(np.sin(ph)) * 0.5 if shape == 'sq' else 2 * ((ph / (2 * np.pi)) % 1) - 1
    return s * env(n, 0.006, d)

# rain bed: two bands of noise, quieter under the end card
white = rng.uniform(-1, 1, N)
low = np.convolve(white, np.ones(40) / 40, mode='same'); hi = white - np.convolve(white, np.ones(6) / 6, mode='same')
bed = low * 0.5 + hi * 0.07
fade = np.clip((sec.get('outro', T) + 1.5 - t) / 1.5, 0.25, 1) * np.clip(t / 1.0, 0, 1)
mix += bed * 0.16 * fade

# pulse: 104 BPM, D minor; bar = 4 beats; chords Dm / Bb / Gm / A
beat = 60 / 104; roots = [73.42, 58.27, 49.0, 55.0]; thirds = [1.189, 1.26, 1.189, 1.26]
play0, end0, outro0 = sec.get('play', 3), sec.get('end', T - 9), sec.get('outro', T - 5)
b = 0
while b * beat < outro0:
    tb = b * beat; bar = (b // 4) % 4; r = roots[bar]
    lvl = 0.35 if tb < play0 else 0.8 if tb < end0 else 0.5
    if b % 2 == 0 or tb > play0: add(P(tone(r, 0.42, 0.22, 'saw') * 0.5, tone(r / 2, 0.5, 0.3) * 0.9), tb, 0.2 * lvl)
    if b % 4 == 0:
        n = int(beat * 4 * SR); x = np.arange(n) / SR; pad = sum(np.sin(2 * np.pi * r * 2 * m * x + i) for i, m in enumerate([1, thirds[bar], 1.498, 2]))
        add(pad * np.minimum(1, x / 0.6) * np.minimum(1, (beat * 4 - x) / 0.5) * (1 + 0.3 * np.sin(2 * np.pi * 0.7 * x)), tb, 0.022 * lvl)
    if tb > play0 and tb < end0: add(noise(0.05) * env(int(0.05 * SR), 0.001, 0.012), tb + beat / 2, 0.07)
    if tb > play0 and tb < end0 and b % 4 == 2: add(P(tone(180, 0.2, 0.06, 'sin', 0.4), noise(0.2) * env(int(0.2 * SR), 0.001, 0.05) * 0.5), tb, 0.16)
    b += 1

# cues
on, off = at('spray-on'), at('spray-off')
for a, z in zip(on, off + [T] * (len(on) - len(off))):
    n = int(max(0.05, z - a) * SR); h = rng.uniform(-1, 1, n); h = h - np.convolve(h, np.ones(9) / 9, mode='same')
    x = np.arange(n) / SR; add(h * np.minimum(1, x / 0.03) * np.minimum(1, (n / SR - x) / 0.05 + 0.001), a, 0.16)
for k in at('kill'): add(P(np.convolve(noise(0.22), np.ones(30) / 30, mode='same') * env(int(0.22 * SR), 0.002, 0.07) * 3, tone(420, 0.12, 0.04, 'sq', 0.4) * 0.3), k, 0.3)
for k in at('slapHit'): add(P(tone(140, 0.2, 0.07, 'sin', 0.4), np.convolve(noise(0.12), np.ones(12) / 12, mode='same') * env(int(0.12 * SR), 0.001, 0.03) * 2), k, 0.55)
for k in at('hurt'): add(P(tone(82, 0.35, 0.12, 'saw', 0.5) * 0.6, tone(60, 0.3, 0.1)), k, 0.45)
for k in at('nest'): add((noise(0.6) - np.convolve(noise(0.6), np.ones(5) / 5, mode='same')) * env(int(0.6 * SR), 0.05, 0.2), k, 0.3)
for m in marks:
    if m['name'] == 'telegraph' and m.get('kind') == 'charger': add(tone(55, 0.95, 0.9, 'saw', 2.0) * np.linspace(0.2, 1, int(0.95 * SR)), m['t'], 0.3)
    if m['name'] == 'telegraph' and m.get('kind') == 'runner': add((noise(0.25) - np.convolve(noise(0.25), np.ones(4) / 4, mode='same')) * env(int(0.25 * SR), 0.01, 0.08), m['t'], 0.16)
for k in at('stun'): add(P(sum(tone(f, 0.9, 0.35) for f in (311, 466, 733, 1190)) * 0.3, tone(70, 0.4, 0.15)), k, 0.4)
for k in at('seal'):
    add(P(sum(tone(f, 1.2, 0.4) for f in (196, 277, 415, 622)) * 0.3, tone(90, 0.5, 0.2)), k, 0.5)
    add(tone(587.3, 0.3, 0.2), k + 0.3, 0.2); add(tone(880, 0.6, 0.35), k + 0.48, 0.2)
for k in at('radio'): add(tone(880, 0.06, 0.03, 'sq'), k, 0.06); add(tone(1320, 0.08, 0.04, 'sq'), k + 0.07, 0.06)
for i, f in enumerate([293.7, 370, 440, 587.3, 740]): add(P(tone(f, 1.6, 0.8), tone(f * 2, 1.0, 0.4) * 0.3), end0 + 0.2 + i * 0.16, 0.2)
for i, f in enumerate([146.8, 220, 293.7, 370, 440]): add(tone(f, 3.5, 1.6), outro0 + 0.2 + i * 0.1, 0.12)

mix *= np.clip((T - t) / 1.2, 0, 1)
mix = np.tanh(mix * 1.6) * 0.9
with wave.open(out + '/sound-raw.wav', 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32000).astype('<i2').tobytes())
print('wrote sound-raw.wav', round(T, 2), 's')
