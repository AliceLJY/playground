#!/usr/bin/env python3
"""花城秋岸 / 96 BPM, D major pentatonic; original additive synthesis, no samples.
~/.venv-kokoro/bin/python tools/demo-music.py <events.json> <out-dir>
Reads the recorder's duration/cues. Writes 48 kHz stereo WAV, two-pass -16 LUFS
master, AAC mux and measured final loudness. Requires existing numpy + ffmpeg.
"""
import json
import math
from pathlib import Path
import subprocess
import sys
import wave
import numpy as np

EV = json.loads(Path(sys.argv[1]).read_text())
OUT = Path(sys.argv[2]).resolve()
ROOT = Path(__file__).resolve().parents[2]
if OUT == ROOT or ROOT in OUT.parents:
    raise SystemExit('Media must be outside the repository')
OUT.mkdir(parents=True, exist_ok=True)
SR, BPM, DUR = 48000, 96, EV['seconds']
N, BEAT = round(SR * DUR), 60 / BPM
rng = np.random.default_rng(20261102)
mix = np.zeros((N, 2), dtype=np.float64)
hz = lambda midi: 440 * 2 ** ((midi - 69) / 12)


def put(at, signal, gain, pan=0):
    start = round(at * SR)
    if start < 0 or start >= N:
        return
    signal = signal[:N-start] * gain
    mix[start:start+len(signal), 0] += signal * math.sqrt((1-pan)/2)
    mix[start:start+len(signal), 1] += signal * math.sqrt((1+pan)/2)


def pluck(midi, dur=2.1, hammer=False, slide=False):
    """Stretched partials, bright short attack; paired strings on the dulcimer."""
    t = np.arange(round(SR*dur)) / SR
    bend = 1 - .018*np.exp(-t/.035) if slide else np.ones(len(t))
    phase = 2*np.pi*hz(midi)*np.cumsum(bend)/SR
    y = np.zeros(len(t))
    for k in range(1, 9):
        stretch = math.sqrt(1 + (.00018 if hammer else .00008)*k*k)
        envelope = np.exp(-t*(.8+.53*k)*(hz(midi)/440)**.28)
        partial = np.sin(phase*k*stretch)
        if hammer:
            partial = .65*partial + .35*np.sin(phase*k*stretch*1.0015)
        y += partial * envelope / k**(1.05 if hammer else 1.3)
    attack = np.minimum(1, t/.003)
    y *= attack * np.minimum(1, (dur-t)/.08)
    return y/1.8


def pad(notes, dur):
    t = np.arange(round(dur*SR))/SR
    e = np.minimum(1, t/1.2) * np.minimum(1, (dur-t)/1.8)
    y = np.zeros(len(t))
    for j, midi in enumerate(notes):
        f = hz(midi)
        y += (np.sin(2*np.pi*f*t+j)+.2*np.sin(2*np.pi*f*1.001*t+j))/len(notes)
    return y*e*(.90+.10*np.sin(2*np.pi*.23*t))


# D E F# A B. A composed eight-bar motif, varied by register and ornaments.
scale = [62, 64, 66, 69, 71, 74, 76, 78, 81]
phrases = [
    [(0,2),(1,3),(1.5,4),(2.5,3),(3.5,1)],
    [(0,0),(1.5,1),(2,2),(3,3)],
    [(0,4),(.75,5),(1.5,4),(2.5,3),(3.5,2)],
    [(0,1),(1,2),(2,0)],
    [(0,3),(.5,4),(1.5,5),(2.5,6),(3.5,4)],
    [(0,3),(1,2),(2,1),(3.25,2)],
    [(0,4),(1,3),(1.5,2),(2.5,1),(3.25,3)],
    [(0,2),(1.5,1),(2.5,0)],
]
chords = [[50,57,62,66],[47,54,59,62],[45,52,57,64],[50,57,62,64]]
for bar in range(math.ceil(55/(4*BEAT))):
    start = bar*4*BEAT
    chord = chords[(bar//2)%4]
    put(start, pad(chord, 3.5), .11)
    put(start+.02, pluck(chord[0]-12, 1.8), .19)
    if start > 3:
        put(start+2*BEAT, pluck(chord[1]-12, 1.5), .12)
    arch_section = 30 <= start < 36
    for beat, index in phrases[bar%8]:
        at = start + beat*BEAT
        if at >= 55:
            continue
        if arch_section and beat % 1:
            continue
        note = scale[index]
        put(at, pluck(note, 2.4, hammer=True, slide=beat==0), .22 if not arch_section else .18, -.20)
        if EV['cues']['bridge']-3 <= at < 27:
            put(at+.018, pluck(note+12, 1.2, hammer=True), .065, .28)
    # Quiet guzheng-style broken fifths and light wooden pulse, never a heavy drum kit.
    for j in range(8):
        at = start + (j*.5 + (.045 if j%2 else 0))*BEAT
        if at >= 55 or (arch_section and j%2):
            continue
        put(at, pluck(chord[1+j%3], 1.2), .065, .25)
    if 4 < start < 50 and not arch_section:
        for beat in [1,3]:
            t=np.arange(round(.09*SR))/SR
            wood=(np.sin(2*np.pi*820*t)+.35*np.sin(2*np.pi*1350*t))*np.exp(-t*70)*np.minimum(1,t/.002)
            put(start+beat*BEAT,wood,.045,.08)

# Score accents use the exact image cue times: flower curtain, framed tower, city lights.
for cue, notes, gain in [('bridge',[74,78,81,86],.16),('arch',[69,74,78],.12),('lights',[74,81,86,90],.13)]:
    for j, note in enumerate(notes):
        put(EV['cues'][cue]+j*.15625,pluck(note,3.1,hammer=True),gain,-.3+j*.18)
for j,note in enumerate([50,57,62,69,74]):
    put(55.4+j*.09,pluck(note,3),.17,-.2+j*.1)

# Synthetic stereo early reflections: no impulse-response assets or downloaded material.
wet=np.zeros_like(mix)
for delay, gain in [(0.047,.14),(.083,.12),(.137,.10),(.211,.075),(.343,.05),(.557,.035)]:
    samples=round(delay*SR)
    wet[samples:]+=mix[:-samples,::-1]*gain
mix+=wet
mix=np.tanh(mix*1.2)/1.2
clock=np.arange(N)/SR
fade=np.minimum(1,clock/.7)*np.minimum(1,np.maximum(0,(DUR-.06-clock)/2.3))**1.4
mix*=fade[:,None]
mix*=.78/max(1e-9,np.abs(mix).max())
raw=OUT/'demo-music-raw.wav'
with wave.open(str(raw),'wb') as w:
    w.setnchannels(2);w.setsampwidth(2);w.setframerate(SR)
    w.writeframes((np.clip(mix,-1,1)*32767).astype('<i2').tobytes())

def run(args):
    return subprocess.run(['ffmpeg','-hide_banner','-nostdin',*map(str,args)],check=True,capture_output=True,text=True).stderr

def measurement(log):
    return json.loads(log[log.rfind('{'):log.rfind('}')+1])

measured=measurement(run(['-i',raw,'-af','loudnorm=I=-16:TP=-1.5:LRA=8:print_format=json','-f','null','-']))
params=':'.join(['loudnorm=I=-16:TP=-1.5:LRA=8','measured_I='+measured['input_i'],'measured_TP='+measured['input_tp'],'measured_LRA='+measured['input_lra'],'measured_thresh='+measured['input_thresh'],'offset='+measured['target_offset'],'linear=true','print_format=json'])
master=OUT/'demo-music.wav'
run(['-y','-i',raw,'-af',params,'-ar',SR,'-c:a','pcm_s24le',master])
silent=OUT/'huacheng-demo-silent-1080x1920.mp4'
if not silent.exists():
    raise SystemExit('Music written; render silent movie before final mux')
final=OUT/'huacheng-demo-1080x1920.mp4'
run(['-y','-i',silent,'-i',master,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-ar',SR,'-t',DUR,'-movflags','+faststart',final])
final_measure=measurement(run(['-i',final,'-af','loudnorm=I=-16:TP=-1.5:LRA=8:print_format=json','-vn','-f','null','-']))
assert abs(float(final_measure['input_i'])+16)<1,final_measure
assert float(final_measure['input_tp']) <= -1,final_measure
report={'bpm':BPM,'seconds':DUR,'scale':'D E F# A B','sources':'original additive synthesis; no samples','cues':EV['cues'],'rawMeasurement':measured,'finalAACMeasurement':final_measure}
(OUT/'music-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False,indent=2))
