#!/usr/bin/env python3
"""Lakeside's high ground over the north-middle ore field (owner, 2026-11-24: "this needs to be raised up with a way up
overlooking all the ore around it as an advantage area ... expand that plateau area flatten it out some, add the trees
scattered on top as well, a ramp access on the back so units and buildings can be built on top of it").

Rewrites MAPS.lakes.rows in src/maps.js in place (run once; running again on the result changes nothing):
- a flat open top of radius TOP cells round (CX, CY), with trees scattered on it (small clumps, room left to build);
- a rim of cliff ('#') out to RIM, with a gap RAMP_W cells either side of the ramp's line (north, the side away from the
  ore that faces the north bases), the ramp itself bare dirt down to RAMP_LEN cells past the top;
- the ore the plateau covers is put back as a ring round its foot (nearest open grass first), so the field holds as much.
The heights come from MAPS.lakes.mesas (world.js makeHeights); keep the numbers here and there the same.
Usage: python3 tools/lakes-mesa.py <repo>
"""
import math, re, sys

CX, CY = 103.0, 69.0          # middle (cell-corner coordinates: cell x spans x .. x + 1)
TOP = 9.5                     # flat top: cells within this
RIM = 11.6                    # cliff rim out to this
RAMP = (0.0, -1.0)            # the ramp points north
RAMP_W = 3.5                  # half width of the gap
RAMP_LEN = 8                  # the ramp runs this far past the top's edge

def h(x, y, k):
    v = (x * 374761393 ^ y * 668265263 ^ k * 1442695041) & 0xffffffff
    v = (v ^ (v >> 13)) * 1274126177 & 0xffffffff
    return ((v ^ (v >> 16)) & 0xffffffff) / 4294967296

def decode(row):
    return ''.join(ch * int(n or 1) for n, ch in re.findall(r'(\d*)(\D)', row))

def encode(s):
    return ''.join((str(len(m.group())) if len(m.group()) > 1 else '') + m.group()[0] for m in re.finditer(r'(.)\1*', s))

def main(repo):
    path = repo + '/src/maps.js'
    src = open(path).read()
    a = src.index('  lakes: {')
    b = src.index('    rows: [', a)
    e = src.index('    ],', b)
    rows = re.findall(r"'([^']*)'", src[b:e])
    g = [list(decode(r)) for r in rows]
    W, H = len(g[0]), len(g)
    removed = 0
    for y in range(H):
        for x in range(W):
            dx, dy = x + 0.5 - CX, y + 0.5 - CY
            d = math.hypot(dx, dy)
            along, across = dx * RAMP[0] + dy * RAMP[1], abs(-dx * RAMP[1] + dy * RAMP[0])
            ramp = along > 0 and across < RAMP_W
            rim = d + (h(x, y, 3) - 0.5) * 0.8
            if rim < TOP or (ramp and along < TOP + RAMP_LEN + 0.5):
                if g[y][x] == 'o': removed += 1
                if rim < TOP:
                    # Scattered trees: a few clumps and singles, none on the ramp's line or right at its head.
                    clump = h(x // 3, y // 3, 7) < 0.2 and h(x, y, 9) < 0.5
                    near_ramp = along > 0 and across < RAMP_W + 1 and along > TOP - 3
                    g[y][x] = 'T' if (clump or h(x, y, 5) < 0.035) and not near_ramp and d > 1.5 else '.'
                else:
                    g[y][x] = ','
            elif d < RIM and not ramp:
                if g[y][x] == 'o': removed += 1
                g[y][x] = '#'
    # Put the ore back round the foot of the plateau, nearest first (off the ramp's approach).
    spots = []
    for y in range(H):
        for x in range(W):
            dx, dy = x + 0.5 - CX, y + 0.5 - CY
            d = math.hypot(dx, dy)
            along, across = dx * RAMP[0] + dy * RAMP[1], abs(-dx * RAMP[1] + dy * RAMP[0])
            if g[y][x] == '.' and RIM + 1.5 < d < 20 and not (along > 0 and across < RAMP_W + 1.5):
                spots.append((d + h(x, y, 11) * 1.5, x, y))
    spots.sort()
    for _, x, y in spots[:removed]: g[y][x] = 'o'
    out = ''.join("      '%s',\n" % encode(''.join(r)) for r in g)
    src = src[:b] + '    rows: [\n' + out + src[e:]
    open(path, 'w').write(src)
    print('ore cells moved:', removed, 'trees on top:', sum(r.count('T') for r in (
        [g[y][x] for x in range(W) if math.hypot(x + 0.5 - CX, y + 0.5 - CY) < TOP] for y in range(H))))
    for y in range(int(CY - 22), int(CY + 22)): print('%3d ' % y + ''.join(g[y][int(CX - 26):int(CX + 26)]))

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
