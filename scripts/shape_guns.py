#!/usr/bin/env python3
"""Shapes the rifle and machine-gun clips in src/sfx.js into short, punchy reports.

The freely licensed recordings (see CREDITS.md) stay as the attack of each shot; around them this
adds a synthesised body, crack and low thump, then cuts the tail short so bursts stay distinct.
  rifle: the two fullest recordings pitched up, cut short, with a little added crack, about 0.2 s.
  mg:    pitched down, a deeper thud on every round, about 0.2 s (Ranger, Hind).
  pillbox: after the MG42, from the mg recordings: two deep, sharp rounds 40 ms apart in each clip, so a burst
         rips at about 25 rounds a second.

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
    # takes: (recording, pitch) per clip. Only the two full gunshots are used (hingydunyas, rubberduck),
    # pitched up; the two .22 recordings are bare clicks.
    'rifle': dict(length=0.2, cut=0.035, rec=1.0, drive=1.6, layers=[(0.5, 0.004, 3500, 9000)], thump=(0.12, 0.02, 400, 200),
                  takes=[(2, 1.15), (2, 1.22), (3, 1.1), (3, 1.18)]),
    # The Pillbox gun, after the MG42: made from the mg recordings (`source`), pitched down.
    'pillbox': dict(source='mg', length=0.24, pitch=0.8, cut=0.02, rec=0.9, drive=2.0, double=0.04,
                    layers=[(0.6, 0.004, 2000, 8000), (0.9, 0.016, 450, 3000), (0.07, 0.11, 200, 1500)],
                    thump=(0.32, 0.024, 320, 130)),
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

def one_round(x, s, rng, pitch):
    n = int(s['length'] * SR); t = np.arange(n) / SR
    x = x / (np.abs(x).max() or 1)
    start = max(0, int(np.argmax(np.abs(x) > 0.1)) - 20)          # from just before the onset
    x = x[start:]
    if pitch != 1: x = np.interp(np.arange(0, len(x), pitch), np.arange(len(x)), x)
    rec = np.zeros(n); m = min(n, len(x)); rec[:m] = x[:m]
    out = s['rec'] * rec * np.exp(-t / s['cut'])
    for level, decay, lo, hi in s.get('layers', []): out += level * band_noise(rng, n, lo, hi) * np.exp(-t / decay)
    level, decay, f0, f1 = s['thump']
    out += level * np.sin(2 * np.pi * np.cumsum(f1 + (f0 - f1) * np.exp(-t / (decay * 0.6))) / SR) * np.exp(-t / decay)
    out[:44] *= np.linspace(0, 1, 44)                              # 2 ms in
    return out

def shape(x, s, seed, pitch=None):
    rng = np.random.default_rng(seed)
    out = one_round(x, s, rng, pitch or s.get('pitch', 1))
    if s.get('double'):                                            # a second round close behind the first
        d = int(s['double'] * SR); second = one_round(x, s, rng, (pitch or s.get('pitch', 1)) * 1.03)
        out[d:] += 0.92 * second[:-d]
    out[-441:] *= np.linspace(1, 0, 441)                          # 20 ms out
    out = np.tanh(out / np.abs(out).max() * s['drive'])           # gritty, tight peaks
    return out / np.abs(out).max() * 0.9

def main():
    src = open(PATH).read()
    line = lambda key: re.search(r'^  "%s": (\[.*\]),$' % key, src, re.M)
    fresh = {k: [decode(b) for b in json.loads(line(k).group(1))] for k in {s.get('source', k) for k, s in SHAPES.items()}}
    for key, s in SHAPES.items():
        raw = fresh[s.get('source', key)]
        takes = s.get('takes') or [(i, None) for i in range(len(raw))]   # (recording, pitch) per finished clip
        clips = '[' + ', '.join(json.dumps(encode(shape(raw[i], s, 1000 + k, p))) for k, (i, p) in enumerate(takes)) + ']'
        m = line(key)
        if m: src = src[:m.start(1)] + clips + src[m.end(1):]
        else: e = line(s['source']).end(); src = src[:e] + '\n  "%s": %s,' % (key, clips) + src[e:]   # a sound of its own
        print(key, len(takes), 'clips')
    open(PATH, 'w').write(src)

if __name__ == '__main__':
    main()
