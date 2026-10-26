#!/usr/bin/env python3
"""Builds src/music.js: the soundtrack's instruments, made from freely licensed recordings.

The songs themselves stay in src/audio.js as step patterns; this script renders the notes,
chords and drum hits they are played with (see CREDITS.md for every source):

  drums     Muldjord Kit (CC-BY 4.0)               kick, snare, ghost, hats, crash, toms, boots
  guitar    FreePats FSBS distorted guitar (CC0)   power chords (root, fifth, octave), two takes
  bass      FreePats picked bass (CC0)             single notes
  lead      VSCO 2 CE trumpet + French horn (CC0)  single notes
  stab      VSCO 2 CE trombone + horn staccato     minor chords
  pad       VSCO 2 CE cello + viola sections       sustained chords
  metal     VCSL anvil, brake drum, timpani (CC0)
  shout     Kokoro neural voices (Apache-2.0)      gang shouts, if kokoro_onnx is installed

Usage: python3 scripts/make_music.py <samples folder> [kokoro model folder] [output.js]
The samples folder holds the unpacked packs:
  EGuitarFSBS-dist1 SFZ+FLAC-20220911/, PickedBassYR SFZ+FLAC-20190930/, MuldjordKit SFZ+FLAC-20201018/,
  vsco/ (VSCO-2-CE, Brass and Strings), vcsl/ (VCSL, Idiophones and Membranophones)
Needs numpy, soundfile and ffmpeg.
"""
import base64, glob, json, os, re, subprocess, sys, tempfile
import numpy as np

SRC = sys.argv[1]
KOKORO = sys.argv[2] if len(sys.argv) > 2 else None
OUT = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.path.dirname(__file__), '..', 'src', 'music.js')
SR = 32000
GTR = os.path.join(SRC, 'EGuitarFSBS-dist1 SFZ+FLAC-20220911', 'samples', 'bridge')
BASS = os.path.join(SRC, 'PickedBassYR SFZ+FLAC-20190930', 'samples', 'pick')
KIT = os.path.join(SRC, 'MuldjordKit SFZ+FLAC-20201018', 'samples')
VSCO = os.path.join(SRC, 'vsco')
VCSL = os.path.join(SRC, 'vcsl')
PCS = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}


def load(path, start=0.0, dur=None):
    args = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-ss', str(start), '-i', path]
    if dur: args += ['-t', str(dur)]
    raw = subprocess.run(args + ['-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def onset(x, thresh=0.02):
    peak = np.max(np.abs(x)) or 1
    i = int(np.argmax(np.abs(x) > peak * thresh))
    return x[max(0, i - int(SR * 0.002)):]


def shift(x, semis):
    """Repitch by resampling (like a hardware sampler: the length changes with the pitch)."""
    if abs(semis) < 1e-6: return x
    r = 2 ** (semis / 12)
    pos = np.arange(0, len(x) - 1, r)
    return np.interp(pos, np.arange(len(x)), x).astype(np.float32)


def fit(x, dur, fade=0.08):
    x = x[:int(dur * SR)]
    if len(x) < int(dur * SR): x = np.pad(x, (0, int(dur * SR) - len(x)))
    n = int(fade * SR)
    x[-n:] *= np.linspace(1, 0, n) ** 2
    n = int(0.002 * SR)
    x[:n] *= np.linspace(0, 1, n)
    return x


def mix(parts, dur):
    """parts: (signal, gain, delay seconds)."""
    out = np.zeros(int(dur * SR) + SR, dtype=np.float32)
    for x, g, d in parts:
        o = int(d * SR)
        x = x[:len(out) - o]
        out[o:o + len(x)] += x * g
    return out[:int(dur * SR)]


def f0(x):
    """Pitch of a sustained note by autocorrelation over a steady stretch."""
    seg = x[int(0.35 * SR):int(0.85 * SR)]
    seg = seg - seg.mean()
    ac = np.correlate(seg, seg, 'full')[len(seg) - 1:]
    lo, hi = int(SR / 1200), int(SR / 50)
    lag = lo + int(np.argmax(ac[lo:hi]))
    return 69 + 12 * np.log2(SR / lag / 440)


def note_of(name):
    m = re.search(r'([A-G]#?)(-?\d)', name)
    return 12 * (int(m.group(2)) + 1) + PCS[m.group(1)]


def vsco_bank(folder, pattern):
    """Every note of a VSCO folder with its true MIDI pitch. The library's octave naming
    differs per instrument, so the octave is taken from the measured pitch."""
    bank = []
    for p in sorted(glob.glob(os.path.join(VSCO, folder, pattern))):
        named = note_of(os.path.basename(p))
        x = onset(load(p, 0, 8))
        if len(x) < SR: continue
        est = f0(x)
        midi = min((named - 24, named - 12, named, named + 12), key=lambda m: abs(m - est))
        bank.append((midi, p, x))
    return bank


def nearest(bank, midi):
    m, _, x = min(bank, key=lambda b: (abs(b[0] - midi), b[0] < midi))
    return shift(x, midi - m)


def kit(folder, rank):
    """Muldjord kit layer by loudness rank: 1.0 = loudest, 0.0 = softest."""
    files = sorted(glob.glob(os.path.join(KIT, folder, '*.flac')))
    loud = sorted(files, key=lambda p: np.sqrt(np.mean(load(p, 0, 0.15) ** 2)))
    return onset(load(loud[round(rank * (len(loud) - 1))], 0, 3))


clips = {}
def put(key, x):
    clips.setdefault(key, []).append(x)

# --- Drums -----------------------------------------------------------------------------
for r in (1.0, 0.92, 0.85): put('kick', fit(kit('KdrumL', r), 0.5, 0.15))
for r in (1.0, 0.94, 0.88): put('snare', fit(kit('Snare1', r), 0.7, 0.3))
for r in (0.35, 0.45): put('ghost', fit(kit('Snare1', r), 0.3, 0.15))
for r in (0.85, 0.7, 0.6): put('hat', fit(kit('HihatClosed', r), 0.15, 0.06))
put('ohat', fit(kit('HihatOpen', 0.8), 0.6, 0.3))
put('crash', fit(kit('CrashL', 1.0), 2.4, 1.2))
put('china', fit(kit('China', 0.9), 1.6, 0.8))
for t in ('Tom1', 'Tom2', 'Tom3', 'Tom4'): put('tom', fit(kit(t, 0.9), 0.7, 0.3))
# Marching boots: a soft kick under a dampened snare, low-passed into a dull stamp.
for r in (0.3, 0.4):
    stamp = mix([(kit('KdrumR', r), 0.9, 0), (kit('SnareRest1', r + 0.2), 0.45, 0.004)], 0.25)
    k = np.exp(-np.arange(6) / 2.0); k /= k.sum()
    put('boots', fit(np.convolve(stamp, k, 'same').astype(np.float32), 0.25, 0.1))

# --- Metal percussion ---------------------------------------------------------------------
anv = os.path.join(VCSL, 'Idiophones', 'Struck Idiophones')
for f in ('Anvil_Hit1_v3_rr1_Mid.wav', 'Anvil_Hit2_v3_rr1_Mid.wav'):
    put('anvil', fit(mix([(onset(load(os.path.join(anv, 'Anvil', f), 0, 3)), 1, 0),
                          (onset(load(os.path.join(anv, 'Brake Drum', 'BrakeDrum2_Hammer3_v3_rr1_Mid.wav'), 0, 3)), 0.5, 0)], 1.6), 1.6, 0.6))
timp = os.path.join(VCSL, 'Membranophones', 'Struck Membranophones', 'Timpani 1', 'Hit')
put('timp', fit(onset(load(os.path.join(timp, 'Timpani1_Hit_v4_rr1_Sum.wav'), 0, 4)), 2.2, 1.0))

# --- Guitar: power chords from single distorted notes, two takes for double-tracking ------
gtr = []
for p in glob.glob(os.path.join(GTR, '*.flac')):
    b = os.path.basename(p)
    if '_soft_' in b: continue
    m = re.match(r'([A-G]#?)(\d)_s(\d)_(\d+)\.flac', b)
    gtr.append((12 * (int(m.group(2)) + 1) + PCS[m.group(1)], int(m.group(3)), int(m.group(4)), p))
def gnote(midi, take):
    # Nearest sampled note, preferring the lower strings for a thicker tone.
    best = min(gtr, key=lambda g: (abs(g[0] - midi), g[1], g[2] != take))
    return shift(onset(load(best[3], 0, 2.6)), midi - best[0])
GTR_ROOTS = [36, 38, 40, 42, 44, 46]
for take in (1, 2):
    for root in GTR_ROOTS:
        chord = mix([(gnote(root, take), 1.0, 0), (gnote(root + 7, take + 2), 0.75, 0.006), (gnote(root + 12, take), 0.45, 0.011)], 1.9)
        chord = np.tanh(chord * 1.6) / np.tanh(1.6)       # glue the three notes like one amp
        put('gtr%d' % take, fit(chord, 1.9, 0.25))

# --- Bass ---------------------------------------------------------------------------------
BASS_ROOTS = [28, 31, 34, 37, 40]
for root in BASS_ROOTS:
    name = {28: 'E', 31: 'G', 34: 'A#', 37: 'C#', 40: 'E2'}[root]
    put('bass', fit(onset(load(os.path.join(BASS, name + '.flac'), 0, 2)), 1.6, 0.2))

# --- Brass lead ---------------------------------------------------------------------------
trumpet = vsco_bank('Brass/Trumpet/sus', '*_v3_*.wav')
horn = vsco_bank('Brass/F Horn/sus', '*_v3_*.wav')
LEAD_ROOTS = [55, 58, 61, 64, 67, 70, 73, 76, 79]
for root in LEAD_ROOTS:
    parts = [(nearest(trumpet, root), 1.0, 0)]
    if min(abs(m - root) for m, _, _ in horn) <= 3: parts.append((nearest(horn, root), 0.55, 0.004))
    put('lead', fit(mix(parts, 2.4), 2.4, 0.4))

# --- Brass stabs (minor chord, root-third-fifth-octave) -------------------------------------
tbn = vsco_bank('Brass/Tenor Trombone/stac', '*_v3_rr1.wav')
hstac = vsco_bank('Brass/F Horn/stac', '*_v3_rr1.wav')
STAB_ROOTS = [48, 51, 54]
for root in STAB_ROOTS:
    parts = [(nearest(tbn, root), 1.0, 0), (nearest(tbn, root + 7), 0.8, 0.003),
             (nearest(hstac, root + 3), 0.8, 0.002), (nearest(hstac, root + 12), 0.7, 0.005)]
    put('stab', fit(mix(parts, 1.1), 1.1, 0.35))

# --- String pads ----------------------------------------------------------------------------
cello = vsco_bank('Strings/Cello Section/susvib', '*_v3_1.wav')
viola = vsco_bank('Strings/Viola Section/susvib', '*_v2_1.wav')
PAD_ROOTS = [48, 52]
for root in PAD_ROOTS:
    parts = [(nearest(cello, root - 12), 0.9, 0), (nearest(cello, root - 5), 0.6, 0.02),
             (nearest(viola, root), 0.7, 0.01), (nearest(viola, root + 3), 0.55, 0.03)]
    put('pad', fit(mix(parts, 4.5), 4.5, 1.2))

# --- Gang shouts ----------------------------------------------------------------------------
if KOKORO:
    try:
        from kokoro_onnx import Kokoro
        kk = Kokoro(os.path.join(KOKORO, 'kokoro.int8.onnx'), os.path.join(KOKORO, 'voices.bin'))
        for word in ('Hup!', 'Hey!'):
            parts = []
            for i, (v, sp) in enumerate([('am_michael', 1.15), ('am_adam', 1.1), ('am_onyx', 1.2), ('am_fenrir', 1.12), ('am_eric', 1.18)]):
                s, sr = kk.create(word, voice=v, speed=sp, lang='en-us')
                with tempfile.NamedTemporaryFile(suffix='.wav') as tf:
                    import soundfile as sf
                    sf.write(tf.name, s, sr)
                    x = onset(load(tf.name), 0.05)
                parts.append((shift(x, [-1, 0, -2, 1, -0.5][i]), 0.6, i * 0.009))
            put('shout', fit(mix(parts, 0.6), 0.6, 0.2))
    except ImportError:
        print('kokoro_onnx not installed: shouts stay synthesised')

# --- Encode -----------------------------------------------------------------------------------
import soundfile as sf
enc, total = {}, 0
with tempfile.TemporaryDirectory() as td:
    for key, items in clips.items():
        for x in items:
            x = x / (np.max(np.abs(x)) or 1) * 0.89
            wav, mp3 = os.path.join(td, 'a.wav'), os.path.join(td, 'a.mp3')
            sf.write(wav, x, SR)
            subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-af', 'highpass=f=28',
                            '-ac', '1', '-ar', str(SR), '-b:a', '56k', mp3], check=True)
            b = base64.b64encode(open(mp3, 'rb').read()).decode()
            enc.setdefault(key, []).append(b); total += len(b)
roots = {'gtr1': GTR_ROOTS, 'gtr2': GTR_ROOTS, 'bass': BASS_ROOTS, 'lead': LEAD_ROOTS, 'stab': STAB_ROOTS, 'pad': PAD_ROOTS}
with open(OUT, 'w') as f:
    f.write("'use strict';\n// Soundtrack instruments built from freely licensed recordings (CC0, CC-BY 4.0; see CREDITS.md).\n")
    f.write('// Regenerate with scripts/make_music.py. MUSIC_ROOTS gives the MIDI note of each pitched clip.\n')
    f.write('const MUSIC_ROOTS = %s;\n' % json.dumps(roots))
    f.write('const MUSIC_CLIPS = {\n')
    for key, v in enc.items():
        f.write('  %s: [%s],\n' % (json.dumps(key), ', '.join(json.dumps(x) for x in v)))
    f.write('};\n')
print('clips', sum(len(v) for v in enc.values()), 'KB', total // 1024)
for name, bank in (('trumpet', trumpet), ('horn', horn), ('trombone', tbn), ('horn stac', hstac), ('cello', cello), ('viola', viola)):
    print(name, sorted(m for m, _, _ in bank))
