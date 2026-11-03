"""Soundtrack for the context-snake demo film, built from events.json written by tools/record.cjs.

A soft electric-piano bed (84 BPM, F major, sine partials with a slow tremolo, round bass, brushed hats)
so it does not sound like the chiptune and ukulele tracks of the neighbouring demos, plus the game's own
cues on the frames where they happen: a blip per pickup, a two-note chime per report, a falling sweep
for compression, a pop per dispatch, a buzz for 429 and a falling phrase when the snake bites itself.
Pure standard library, no samples.

    python3 -I tools/demo-sound.py <out-dir>        (reads <out-dir>/events.json, writes <out-dir>/sound-raw.wav)
    ffmpeg -i sound-raw.wav -af loudnorm=I=-16:TP=-1.5:LRA=11 -ar 44100 sound.wav
    ffmpeg -framerate 30 -i frames/%05d.jpg -i sound.wav -vf "scale=1080:1920:flags=lanczos,setsar=1" \
      -c:v libx264 -pix_fmt yuv420p -crf 18 -c:a aac -b:a 192k -movflags +faststart -shortest 片子.mp4
"""
import json, math, random, struct, sys, wave
from array import array

out = sys.argv[1]
ev = json.load(open(out + '/events.json', encoding='utf-8'))
SR = 44100
total = ev['seconds'] + 0.5
N = int(total * SR)
buf = array('d', bytes(8 * N))
rnd = random.Random(1104)


def add(t0, dur, fn, vol):
    i0 = int(t0 * SR)
    for i in range(int(dur * SR)):
        j = i0 + i
        if 0 <= j < N:
            buf[j] += vol * fn(i / SR)


def keys(freq, dur):
    # electric piano: a few sine partials, quick attack, long fall, gentle tremolo
    def f(t):
        env = min(1.0, t / 0.01) * math.exp(-t * 2.2)
        trem = 1 + 0.12 * math.sin(2 * math.pi * 5 * t)
        x = math.sin(2 * math.pi * freq * t) + 0.35 * math.sin(2 * math.pi * 2 * freq * t) * math.exp(-t * 6) + 0.12 * math.sin(2 * math.pi * 3 * freq * t) * math.exp(-t * 9)
        return env * trem * x
    return f


def tone(f0, f1, dur, wave_='sine'):
    def f(t):
        k = t / dur
        fr = f0 * (f1 / f0) ** k
        ph = 2 * math.pi * fr * t
        x = math.sin(ph) if wave_ == 'sine' else (1 if math.sin(ph) > 0 else -1) * 0.6 if wave_ == 'square' else 2 / math.pi * math.asin(math.sin(ph))
        return x * min(1.0, t / 0.005) * (1 - k) ** 2
    return f


def noise(dur, bright):
    state = [0.0]
    def f(t):
        w = rnd.uniform(-1, 1)
        state[0] = state[0] * (1 - bright) + w * bright
        return (w - state[0]) * math.exp(-t / dur * 5)
    return f


hz = lambda m: 440 * 2 ** ((m - 69) / 12)
# ---- bed: Fmaj7 - Dm7 - Bbmaj7 - C7, one bar each, 84 BPM ----
beat = 60 / 84
chords = [[65, 69, 72, 76], [62, 65, 69, 72], [58, 62, 65, 69], [60, 64, 67, 70]]
bass = [41, 38, 34, 36]
end_at = total - 0.3
bar = 0
while bar * 4 * beat < end_at:
    t = bar * 4 * beat
    c = chords[bar % 4]
    for k, m in enumerate(c):
        add(t + k * 0.02, 3.6 * beat, keys(hz(m), 3.6 * beat), 0.045)
    add(t + 2 * beat, 1.6 * beat, keys(hz(c[1] + 12), 1.6 * beat), 0.03)
    for b in (0, 2.5):
        add(t + b * beat, 1.2 * beat, tone(hz(bass[bar % 4]), hz(bass[bar % 4]), 1.2 * beat), 0.12)
    for h in range(8):
        add(t + h * beat / 2 + (0.03 if h % 2 else 0), 0.08, noise(0.08, 0.9), 0.02 if h % 2 else 0.012)
    bar += 1
# fade the bed in over the title and out at the very end
for i in range(N):
    tt = i / SR
    g = min(1.0, tt / 1.5) * min(1.0, max(0.0, (total - tt) / 2.0))
    buf[i] *= g

# ---- game cues on the frames where they happen ----
pitch = lambda: 1 + rnd.uniform(-0.06, 0.06)
for m in ev['marks']:
    t, n = m['t'], m['name']
    if n == 'eat':
        p = pitch(); add(t, 0.09, tone(660 * p, 990 * p, 0.09, 'tri'), 0.18)
    elif n == 'report':
        add(t, 0.12, tone(880, 880, 0.12), 0.22); add(t + 0.09, 0.2, tone(1320, 1320, 0.2), 0.2)
    elif n == 'compress':
        add(t, 0.35, tone(900, 160, 0.35, 'tri'), 0.22); add(t + 0.04, 0.4, noise(0.4, 0.3), 0.08)
    elif n == 'dispatch':
        add(t, 0.14, tone(220, 660, 0.14, 'tri'), 0.25)
    elif n == 'burst':
        add(t, 0.5, tone(140, 60, 0.5, 'square'), 0.18); add(t + 0.02, 0.5, tone(147, 62, 0.5, 'square'), 0.16)
    elif n == 'result':
        for k, f in enumerate([392, 330, 262, 196]):
            add(t + k * 0.16, 0.3, tone(f, f * 0.96, 0.3, 'tri'), 0.2)

peak = max(abs(x) for x in buf) or 1
with wave.open(out + '/sound-raw.wav', 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(b''.join(struct.pack('<h', int(32767 * 0.9 * x / peak)) for x in buf))
print('wrote', out + '/sound-raw.wav', round(total, 2), 's,', len(ev['marks']), 'marks')
