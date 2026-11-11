#!/usr/bin/env python3
"""Shapes the rifle and machine-gun clips in src/sfx.js into short, punchy reports.

The freely licensed recordings (see CREDITS.md) stay as the attack of each shot; around them this
adds a synthesised body, crack and low thump, then cuts the tail short so bursts stay distinct.
  rifle: a dry, bright crack with a low-mid punch, about 0.2 s.
  mg:    pitched down, a deeper thud on every round, about 0.2 s.

scripts/make_sfx.py runs this on its output. Run it once only on fresh clips: shaping twice
shortens and thickens them again.  Usage: python3 scripts/shape_guns.py [src/sfx.js]
"""
import base64, json, os, re, subprocess, sys, tempfile
import numpy as np

SR = 22050
PATH = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'src', 'sfx.js')
# pitch: resampling factor (below 1 is lower). cut: decay (s) forced on the recording.
# Layers are (level, decay s, low Hz, high Hz) of filtered noise; thump is (level, decay s, from Hz, to Hz).
SHAPES = {
    'rifle': dict(length=0.2, pitch=1.0, cut=0.03, rec=0.8, drive=1.6,
                  layers=[(1.0, 0.008, 3000, 9000), (1.0, 0.028, 500, 4500), (0.12, 0.09, 200, 1500)],
                  thump=(0.22, 0.03, 420, 200)),
    'mg': dict(length=0.2, pitch=0.88, cut=0.035, rec=0.9, drive=1.8,
               layers=[(0.5, 0.006, 2500, 8000), (0.8, 0.03, 250, 2500)],
               thump=(0.24, 0.04, 300, 120)),
}

def decode(b64):
    with tempfile.NamedTemporaryFile(suffix='.mp3') as f:
        f.write(base64.b64decode(b64)); f.flush()
        raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', f.name, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'],
                             check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)

def encode(x):
    with tempfile.TemporaryDirectory() as td:
        mp3 = os.path.join(td, 'o.mp3')
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-',
                        '-ac', '1', '-ar', str(SR), '-b:a', '48k', mp3], input=x.astype(np.float32).tobytes(), check=True)
        return base64.b64encode(open(mp3, 'rb').read()).decode()

def band_noise(rng, n, lo, hi):
    spec = np.fft.rfft(rng.standard_normal(n)); f = np.fft.rfftfreq(n, 1 / SR)
    spec[(f < lo) | (f > hi)] = 0
    y = np.fft.irfft(spec, n)
    return y / (np.abs(y).max() or 1)

def shape(x, s, seed):
    rng = np.random.default_rng(seed)
    n = int(s['length'] * SR); t = np.arange(n) / SR
    x = x / (np.abs(x).max() or 1)
    start = max(0, int(np.argmax(np.abs(x) > 0.1)) - 20)          # from just before the onset
    x = x[start:]
    if s['pitch'] != 1: x = np.interp(np.arange(0, len(x), s['pitch']), np.arange(len(x)), x)
    rec = np.zeros(n); m = min(n, len(x)); rec[:m] = x[:m]
    out = s['rec'] * rec * np.exp(-t / s['cut'])
    for level, decay, lo, hi in s['layers']: out += level * band_noise(rng, n, lo, hi) * np.exp(-t / decay)
    level, decay, f0, f1 = s['thump']
    out += level * np.sin(2 * np.pi * np.cumsum(f1 + (f0 - f1) * np.exp(-t / (decay * 0.6))) / SR) * np.exp(-t / decay)
    out[:44] *= np.linspace(0, 1, 44)                              # 2 ms in, 20 ms out
    out[-441:] *= np.linspace(1, 0, 441)
    out = np.tanh(out / np.abs(out).max() * s['drive'])           # gritty, tight peaks
    return out / np.abs(out).max() * 0.9

src = open(PATH).read()
for key, s in SHAPES.items():
    m = re.search(r'^  "%s": (\[.*\]),$' % key, src, re.M)
    clips = [encode(shape(decode(b), s, 1000 + i)) for i, b in enumerate(json.loads(m.group(1)))]
    src = src[:m.start(1)] + '[' + ', '.join(json.dumps(c) for c in clips) + ']' + src[m.end(1):]
    print(key, len(clips), 'clips')
open(PATH, 'w').write(src)
