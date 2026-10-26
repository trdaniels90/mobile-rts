# Generates spoken lines with the Kokoro neural voice (Apache-2.0), processes them with
# ffmpeg and writes src/voices.js with the clips embedded as base64 MP3 data URIs.
import sys, os, subprocess, base64, json, tempfile, soundfile as sf
from kokoro_onnx import Kokoro
model_dir, out_js = sys.argv[1], sys.argv[2]
k = Kokoro(os.path.join(model_dir, 'kokoro.int8.onnx'), os.path.join(model_dir, 'voices.bin'))

EVA = {
  'construction complete': 'Construction complete.',
  'unit ready': 'Unit ready.',
  'our base is under attack': 'Our base is under attack.',
  'ore truck under attack': 'Ore truck under attack.',
  'unit lost': 'Unit lost.',
  'structure lost': 'Structure lost.',
  'low power': 'Low power.',
  'insufficient funds': 'Insufficient funds.',
  'building': 'Building.',
  'training': 'Training.',
  'cancelled': 'Cancelled.',
  'unable to comply. building in progress': 'Unable to comply. Building in progress.',
  'queue is full': 'Unable to comply.',
  'not available': 'Unable to comply.',
  'cannot deploy here': 'Cannot deploy here.',
  'structure sold': 'Structure sold.',
  'select a structure to build': 'Select a structure to build.',
  'mission accomplished': 'Mission accomplished.',
  'mission failed': 'Mission failed.',
  'auto attack on': 'Auto attack, engaged.',
  'auto attack off. new units guard the base': 'Auto attack, disengaged.',
  'attack group moving out': 'Attack group, moving out.',
  'spy plane ready': 'Spy plane ready.',
  'paratroopers ready': 'Paratroopers ready.',
  'bombing run ready': 'Bombing run ready.',
  'select target': 'Select target.',
  'aircraft returning for repairs': 'Aircraft returning for repairs.',
}
ACKS = {
  'inf': ['Acknowledged.', 'Yes sir.', 'Moving out.', 'Affirmative.', 'Right away.'],
  'veh': ['Rolling out.', 'Affirmative.', 'Moving.', 'Acknowledged.', 'Vehicle reporting.'],
  'air': ['Roger.', 'In the air.', 'On my way.', 'Affirmative.'],
  'attack': ['Engaging.', 'Attacking.', 'Target acquired.', "Let's go!"],
}
EVA_FX = ('highpass=f=150,lowpass=f=7200,equalizer=f=2800:t=q:w=1.2:g=3,'
          'chorus=0.75:0.9:18:0.22:0.3:1.2,aecho=0.85:0.5:24:0.16,'
          'acompressor=threshold=-20dB:ratio=3:attack=5:release=80,loudnorm=I=-15:TP=-1.5:LRA=7')
RADIO_FX = ('highpass=f=320,lowpass=f=3300,acrusher=bits=11:mix=0.25:mode=log,'
            'acompressor=threshold=-22dB:ratio=5:attack=3:release=50,loudnorm=I=-16:TP=-1.5:LRA=7')

def render(text, voice, speed, fx):
    samples, sr = k.create(text, voice=voice, speed=speed, lang='en-us')
    with tempfile.TemporaryDirectory() as td:
        wav, mp3 = os.path.join(td, 'a.wav'), os.path.join(td, 'a.mp3')
        sf.write(wav, samples, sr)
        # Trim silence, process, pad a little tail for the echo, encode small mono MP3.
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-af',
                        'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,apad=pad_dur=0.12,' + fx,
                        '-ar', '22050', '-ac', '1', '-b:a', '40k', mp3], check=True)
        return base64.b64encode(open(mp3, 'rb').read()).decode()

clips, total = {}, 0
for key, text in EVA.items():
    b = render(text, 'af_heart', 0.93, EVA_FX); clips['eva:' + key] = b; total += len(b)
# Men's voices for the troops: riflemen on a field radio, tank crews deeper and muffled
# through the intercom, pilots on a cleaner aircraft radio.
INTERCOM_FX = ('highpass=f=220,lowpass=f=2600,equalizer=f=900:t=q:w=1:g=4,acrusher=bits=10:mix=0.3:mode=log,'
               'aecho=0.8:0.4:9:0.25,acompressor=threshold=-22dB:ratio=6:attack=3:release=50,loudnorm=I=-16:TP=-1.5:LRA=7')
PILOT_FX = ('highpass=f=380,lowpass=f=3800,acompressor=threshold=-22dB:ratio=5:attack=3:release=50,loudnorm=I=-16:TP=-1.5:LRA=7')
SPEAKERS = {
  'inf': (['am_michael', 'am_adam'], 1.05, RADIO_FX),
  'attack': (['am_michael', 'am_adam'], 1.08, RADIO_FX),
  'veh': (['am_onyx', 'am_fenrir'], 0.98, INTERCOM_FX),
  'air': (['am_eric', 'am_puck'], 1.05, PILOT_FX),
}
for kind, lines in ACKS.items():
    voices, speed, fx = SPEAKERS[kind]
    for text in lines:
        for v in voices:
            b = render(text, v, speed, fx); clips.setdefault('ack:' + kind, []).append(b); total += len(b)
with open(out_js, 'w') as f:
    f.write("'use strict';\n// Spoken lines generated with the Kokoro neural voice (Apache-2.0) and processed with ffmpeg.\n")
    f.write('// Regenerate with scripts/make_voices.py.\n')
    f.write('const VOICE_CLIPS = {\n')
    for key, v in clips.items():
        if isinstance(v, list): f.write('  %s: [%s],\n' % (json.dumps(key), ', '.join(json.dumps(x) for x in v)))
        else: f.write('  %s: %s,\n' % (json.dumps(key), json.dumps(v)))
    f.write('};\n')
print('clips', len(clips), 'KB', total // 1024)
