"""品牌片头的固定声音（3.6 秒，对齐 intro-record.cjs：0–1 s 标题头、1–2.2 s 推镜头、2.25 s 牌子落定）：门铃两声 → 镜头飞入的风声 → 牌子落定的木琴和弦。纯 numpy 合成，无采样。
用法：python3 tools/intro-sting.py <out.wav>"""
import sys, wave, numpy as np
SR = 48000; T = 3.6; n = int(SR * T); t = np.arange(n) / SR; out = np.zeros(n)
def note(f, at, dur=0.9, amp=0.35, bright=3.0):
    i = int(at * SR); m = min(n - i, int(dur * SR)); tt = np.arange(m) / SR
    env = np.exp(-tt * bright) * np.minimum(1, tt / 0.004)
    w = np.sin(2*np.pi*f*tt) + 0.35*np.sin(2*np.pi*f*4*tt)*np.exp(-tt*12) + 0.15*np.sin(2*np.pi*f*2*tt)
    out[i:i+m] += amp * env * w
# 门铃 叮—咚（E6 → C6）
note(1318.5, 0.15, 1.2, 0.28, 3.5); note(1046.5, 0.42, 1.4, 0.28, 3.0)
# 风声：1.0–2.3 s 带通噪声，中心频率上扬
rng = np.random.default_rng(5); noise = rng.standard_normal(n)
a, b = int(1.0*SR), int(2.3*SR); seg = noise[a:b]; L = b - a
spec = np.fft.rfft(seg); freqs = np.fft.rfftfreq(L, 1/SR)
chunks = []; step = 2048
for s in range(0, L, step):
    k = s / L; fc = 400 + 2600 * k**1.6
    c = noise[a+s:a+s+step]; C = np.fft.rfft(c, step); fr = np.fft.rfftfreq(step, 1/SR)
    C *= np.exp(-((fr - fc) / (fc*0.5))**2); chunks.append(np.fft.irfft(C, step)[:len(c)])
whoosh = np.concatenate(chunks)[:L]; env = np.sin(np.pi * np.linspace(0, 1, L))**1.5
out[a:b] += 0.9 * whoosh * env / (np.abs(whoosh).max() + 1e-9) * 0.35
# 牌子落定：2.25 s 木琴 C 大三和弦 + 低音
for f, d in [(523.25, 0), (659.25, 0.03), (783.99, 0.06), (1046.5, 0.09)]: note(f, 2.25 + d, 1.1, 0.22, 4.0)
note(130.81, 2.25, 1.1, 0.4, 3.0)
out[-int(0.08*SR):] *= np.linspace(1, 0, int(0.08*SR))
out = out / np.abs(out).max() * 0.6
st = np.stack([out, out], 1); pcm = (st * 32767).astype('<i2')
with wave.open(sys.argv[1], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('wrote', sys.argv[1])
