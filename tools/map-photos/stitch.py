# Joins capture.js's tiles into <out>/<map>.webp (full size) and <map>_small.webp (2400 px). python3 tools/map-photos/stitch.py <out> <map>
# Whole tiles first (they cover the corners the camera cannot centre on), then the middle of each, where the screen's
# own lighting is even, so the joins do not show (the camera steps half a screen).
import json, sys
from PIL import Image
d, mid = sys.argv[1], sys.argv[2]
J = json.load(open(f'{d}/{mid}.json'))
out = Image.new('RGB', (int(J['w']), int(J['h'])), (14, 16, 18))
ims = [(s, Image.open(s['f']).convert('RGB')) for s in J['shots']]
for s, im in ims:   # whole tiles first (they cover the corners the camera cannot centre on)
    out.paste(im, (round(s['x']), round(s['y'])))
for s, im in ims:   # then the middle of each: the screen's own lighting is even there, so the joins do not show
    w, h = im.size; cw, ch = int(w * 0.56), int(h * 0.56); l, t = (w - cw) // 2, (h - ch) // 2
    out.paste(im.crop((l, t, l + cw, t + ch)), (round(s['x']) + l, round(s['y']) + t))
out.save(f'{d}/{mid}.webp', quality=80, method=4)
s = out.copy(); s.thumbnail((2400, 2400)); s.save(f'{d}/{mid}_small.webp', quality=80)
print(mid, out.size)
