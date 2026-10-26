#!/usr/bin/env python3
"""Builds src/sfx.js from freely licensed recordings (see CREDITS.md).

Each clip is trimmed from its onset, optionally pitched, given a light 90s
"compressed sample" treatment, peak-normalised and stored as a base64 MP3.

Usage: python3 scripts/make_sfx.py <folder of source .wav files> [output.js]
The source folder holds the packs listed in CREDITS.md converted to mono WAV
(ffmpeg -i in -ac 1 -ar 22050 out.wav), named as in CLIPS below.
"""
import base64, json, os, re, subprocess, sys, tempfile

SRC = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', 'src', 'sfx.js')

# key: list of (source file, length in seconds, pitch factor, extra ffmpeg filters)
CLIPS = {
    'rifle': [('kurt_22magnum.wav', 0.32, 0.92, ''), ('kurt_22pistol.wav', 0.3, 0.88, ''),
              ('hingy_gunshot.wav', 0.38, 1.0, ''), ('rubberduck_bangs_shot_01.wav', 0.3, 0.95, '')],
    'mg': [('dklon_gunshots_gunshot_11.wav', 0.3, 1.0, ''), ('dklon_gunshots_gunshot_12.wav', 0.3, 1.05, ''),
           ('dklon_gunshots_gunshot_16.wav', 0.28, 1.0, '')],
    'cannon': [('thimras_cannon_fire.wav', 0.7, 1.25, ''), ('rubberduck_bangs_cannon_01.wav', 0.6, 1.0, ''),
               ('rubberduck_bangs_cannon_02.wav', 0.6, 1.0, '')],
    'turretGun': [('thimras_cannon_fire.wav', 0.9, 0.95, '')],
    'hitSmall': [('thimras_hit_wall_nosplash.wav', 0.65, 1.0, ''), ('rubberduck_100_explosion.wav', 0.55, 1.0, ''),
                 ('rubberduck_bangs_bang_03.wav', 0.5, 1.0, '')],
    'hitMed': [('qubodup_exp.wav', 1.1, 1.0, ''), ('thimras_cannon_hit.wav', 1.1, 1.0, '')],
    'explodeVeh': [('lamoot_deathflash.wav', 1.6, 1.0, ''), ('qubodup_exp.wav', 1.6, 0.85, '')],
    'explodeBig': [('lamoot_deathflash.wav', 2.2, 0.9, ''), ('thimras_ship_destroyed.wav', 2.4, 1.0, '')],
    'rocket': [('dklon_rockets_rocket_launch_1.wav', 0.9, 1.0, ''), ('dklon_rockets_rocket_launch_2.wav', 0.9, 1.0, ''),
               ('dklon_rockets_rocket_launch_3.wav', 0.9, 1.0, '')],
    'missile': [('dklon_rockets_rocket_launch_4.wav', 1.0, 1.15, ''), ('dklon_rockets_rocket_launch_2.wav', 1.0, 1.2, '')],
    'flak': [('rubberduck_bangs_fw_01.wav', 0.35, 0.9, ''), ('rubberduck_bangs_fw_05.wav', 0.35, 0.9, '')],
    'tesla': [('varkalandar_tesla.wav', 0.8, 1.0, '')],
    'flame': [('mightyglider_flame.wav', 0.45, 1.0, '')],
    'fireHit': [('antumdeluge_fire.wav', 0.9, 1.0, '')],
}
# Light 90s treatment: telephone-free but band-limited, a touch of bit grit, tight dynamics.
LOFI = 'highpass=f=45,lowpass=f=10000,acrusher=bits=11:mix=0.2:mode=log,acompressor=threshold=-16dB:ratio=3:attack=2:release=80'

def run(args):
    return subprocess.run(args, check=True, capture_output=True, text=True)

def onset(path):
    # First moment the sound rises above -35 dBFS, minus a few milliseconds.
    r = run(['ffmpeg', '-hide_banner', '-i', path, '-af', 'silencedetect=n=-35dB:d=0.01', '-f', 'null', '-'])
    m = re.search(r'silence_end: ([0-9.]+)', r.stderr)
    first = re.search(r'silence_start: ([0-9.]+)', r.stderr)
    if first and float(first.group(1)) < 0.005 and m: return max(0.0, float(m.group(1)) - 0.004)
    return 0.0

def peak_db(path):
    r = run(['ffmpeg', '-hide_banner', '-i', path, '-af', 'volumedetect', '-f', 'null', '-'])
    return float(re.search(r'max_volume: (-?[0-9.]+) dB', r.stderr).group(1))

out, total = {}, 0
with tempfile.TemporaryDirectory() as td:
    for key, items in CLIPS.items():
        for i, (src, length, pitch, extra) in enumerate(items):
            path = os.path.join(SRC, src)
            st = onset(path)
            fade = min(0.25, length * 0.4)
            pitch_f = f'asetrate={int(22050 * pitch)},aresample=22050,' if pitch != 1 else ''
            chain = (f'atrim=start={st:.3f}:duration={length / pitch:.3f},asetpts=PTS-STARTPTS,{pitch_f}'
                     f'afade=t=in:d=0.003,afade=t=out:st={max(0, length - fade):.3f}:d={fade:.3f},{LOFI}' + (',' + extra if extra else ''))
            mid, mp3 = os.path.join(td, 'm.wav'), os.path.join(td, 'o.mp3')
            run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', path, '-af', chain, '-ac', '1', '-ar', '22050', mid])
            gain = -1.0 - peak_db(mid)
            run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', mid, '-af', f'volume={gain:.2f}dB,alimiter=limit=0.95',
                 '-ac', '1', '-ar', '22050', '-b:a', '48k', mp3])
            b = base64.b64encode(open(mp3, 'rb').read()).decode()
            out.setdefault(key, []).append(b); total += len(b)
with open(OUT, 'w') as f:
    f.write("'use strict';\n// Battle sound effects built from freely licensed recordings (CC0 and CC-BY; see CREDITS.md).\n")
    f.write('// Regenerate with scripts/make_sfx.py.\n')
    f.write('const SFX_CLIPS = {\n')
    for key, v in out.items():
        f.write('  %s: [%s],\n' % (json.dumps(key), ', '.join(json.dumps(x) for x in v)))
    f.write('};\n')
print('clips', sum(len(v) for v in out.values()), 'KB', total // 1024)
