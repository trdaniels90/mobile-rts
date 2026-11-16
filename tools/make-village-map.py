#!/usr/bin/env python3
"""Lay out the map "Crossroads Village" (MAPS.village in src/maps.js) and print it for maps.js.

    python3 tools/make-village-map.py [size]

Grassland, four start positions (two west against two east), and a village in the middle: a square where two main
streets cross, side lanes and a lane round the edge. Only the ground is laid out here (rows, start positions, gem
fields and the village's building plots, `lots`); the houses on the plots are rolled each battle from its seed
(world.js genVillage), so the village is different every game. Everything is worked out on one quarter of the map
and mirrored both ways, so the four start positions are alike.
Codes: '.' grass, ',' dirt, 'T' woods, '#' rock, '~' water, 'o' ore.
"""
import math
import os
import sys

N = int(sys.argv[1]) if len(sys.argv) > 1 else 144
K = N / 144   # the layout is drawn for 144 cells


def h(x, y, s):   # a hash in [0, 1)
    v = (x * 374761393 + y * 668265263 + s * 2147483647) & 0xFFFFFFFF
    v = ((v ^ (v >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((v ^ (v >> 16)) & 0xFFFFFF) / 0x1000000


def noise(x, y, scale, s):   # smooth value noise
    gx, gy = x / scale, y / scale
    x0, y0 = math.floor(gx), math.floor(gy)
    fx, fy = gx - x0, gy - y0
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a, b = h(x0, y0, s), h(x0 + 1, y0, s)
    c, d = h(x0, y0 + 1, s), h(x0 + 1, y0 + 1, s)
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy


def seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - ax - dx * t, py - ay - dy * t)


S = lambda v: v * K
# VARIANT (env, for trying layouts; none is the shipped one): 'a' the lakes reach down to the village, 'b' the same with a
# shallow ford across each, 'c' woods fill the strip between each lake and the village.
VARIANT = os.environ.get('VARIANT', '')
BASE = (S(22), S(24))
BASE_CLEAR = 14
# Village, in the quarter (cells up to the middle line): the lane round it, side lanes, a main street, the square.
V0 = S(50)                      # outer edge of the ring lane
RING, SIDE, MAIN, SQUARE = (S(50), S(51.9)), (S(58), S(59.9)), (S(69.5), N / 2), S(64)
ORE = [(S(9), S(42), 7), (S(41), S(9), 6), (S(10), S(63), 5.5), (S(31), S(51), 4.5)]   # (the last: forward, toward the village)
GEMS = [(S(63.5), S(44), 2.6), (S(45.5), S(57), 2.6)]   # by the village's north (south) gates and its west (east) side
ROADS = [   # dirt tracks: [points], half width
    ([BASE, (S(36), S(37)), (S(50), S(51))], 1.6),
    *([([(S(36), S(37)), (S(50), S(41)), (S(71.5), S(41))], 1.4)] if not VARIANT else []),   # along the lake shore to the base across (mirrored)
    ([BASE, (S(21), S(46)), (S(22), S(71.5))], 1.4),   # to the ally's base
    *([([(S(71.5), S(41)), (S(70.5), S(50))], 1.5)] if not VARIANT else []),        # the main street out to the lake road
    ([(S(22), S(71.5)), (S(50), S(70.5))], 1.5),        # and out to the west road
    ([(S(9), S(42)), (S(21), S(40))], 1.2),             # out to the ore fields
    ([(S(41), S(9)), (S(36), S(25))], 1.2),
    ([(S(10), S(63)), (S(21), S(60))], 1.2),
]
PONDS = [((N - 1) / 2, S(10), S(24), S(24)),   # the lakes in the north and south: west and east meet round the village
          (S(39), (N - 1) / 2, S(4), S(7.5))]   # centre x, y, radii
if VARIANT in ('a', 'b'): PONDS.append(((N - 1) / 2, S(23), S(8), S(26)))   # the stub down to the village's outer lane
ROCKS = [(S(44), S(44), 2.2), (S(55), S(31), 1.8)]


def quarter(x, y):
    """The ground at a cell of the quarter (x, y below the middle)."""
    vx, vy = x >= V0 and y >= V0, None
    if x >= V0 and y >= V0:   # the village
        lane = lambda a, b: a <= x < b + 0.1 or a <= y < b + 0.1
        if x >= SQUARE and y >= SQUARE: return ','
        if lane(*RING) or lane(*SIDE) or x >= MAIN[0] or y >= MAIN[0]: return ','
        return '.'
    dd = [(math.hypot((x - cx) / rx, (y - cy) / ry) + (noise(x, y, 3, 5) - 0.5) * 0.35, cx, ry) for (cx, cy, rx, ry) in PONDS]
    for d, cx, ry in dd:   # water first (of every pond), then the shores
        if d < 1:
            if VARIANT == 'b' and 37.5 <= y <= 41.5 and ry > S(24): return 'f'   # a shallow ford across the stub
            return '~'
    if any(d < 1.18 for d, _, _ in dd): return ','
    for (ox, oy, r) in ORE + GEMS:
        if math.hypot(x - ox, y - oy) < r + 1.5: return '.'
    wx, wy = x + (noise(x, y, 9, 21) - 0.5) * 5, y + (noise(x, y, 9, 22) - 0.5) * 5   # roads wander a little
    for pts, w in ROADS:
        if any(seg_dist(wx, wy, *pts[i], *pts[i + 1]) < w + (noise(x, y, 4, 9) - 0.5) * 0.6 for i in range(len(pts) - 1)): return ','
    base = math.hypot(x - BASE[0], y - BASE[1])
    if base < BASE_CLEAR: return '.'
    for (rx, ry, r) in ROCKS:
        if math.hypot(x - rx, y - ry) + (noise(x, y, 2, 11) - 0.5) * 1.6 < r: return '#'
    if x > V0 - 3 and y > V0 - 3: return '.'   # open ground round the village
    if VARIANT == 'c' and 52 <= x <= 71.5 and 30 <= y <= 48.5 and not any(math.hypot(x - gx, y - gy) < r + 1.8 for gx, gy, r in GEMS): return 'T'
    if noise(x, y, 7, 1) * 0.75 + noise(x, y, 2.5, 2) * 0.25 > 0.6: return 'T'
    return '.'


def main():
    q = lambda v: min(v, N - 1 - v)
    grid = [[quarter(q(x), q(y)) for x in range(N)] for y in range(N)]
    # Ore and gems (gems are placed by the game, MAPS gems, on open ground).
    for y in range(N):
        for x in range(N):
            for (ox, oy, r) in ORE:
                if math.hypot(q(x) - ox, q(y) - oy) < r - (noise(x, y, 2, 3) * 0.9) and grid[y][x] == '.': grid[y][x] = 'o'
    rows = []
    for line in grid:
        line, out, i = ''.join(line), '', 0
        while i < len(line):
            j = i
            while j < len(line) and line[j] == line[i]: j += 1
            out += (str(j - i) if j - i > 1 else '') + line[i]
            i = j
        rows.append(out)
    m = lambda v: N - 1 - v
    bx, by = round(BASE[0]), round(BASE[1])
    spawns = [[bx, by], [bx, m(by)], [m(bx), by], [m(bx), m(by)]]
    gems = []
    for (gx, gy, r) in GEMS:
        for (x, y) in ((gx, gy), (m(gx), gy), (gx, m(gy)), (m(gx), m(gy))):
            gems.append([round(x, 1), round(y, 1), r])
    # Building plots: the blocks between the lanes, in the quarter, then mirrored. [x0, y0, x1, y1] (inclusive cells).
    a0, a1 = math.ceil(RING[1] + 0.1), math.floor(SIDE[0]) - 1     # first row of blocks
    b0, b1 = math.ceil(SIDE[1] + 0.1), math.ceil(MAIN[0]) - 1      # second row
    s0 = math.ceil(SQUARE)
    quart = [(a0, a0, a1, a1), (b0, a0, b1, a1), (a0, b0, a1, b1), (b0, b0, s0 - 1, b1), (s0, b0, b1, s0 - 1)]
    lots = []
    for (x0, y0, x1, y1) in quart:
        for fx in (False, True):
            for fy in (False, True):
                X0, X1 = (m(x1), m(x0)) if fx else (x0, x1)
                Y0, Y1 = (m(y1), m(y0)) if fy else (y0, y1)
                lots.append([X0, Y0, X1, Y1])
    # Street lamps along the lanes (cells, at a lane's edge, alternating sides), none in crossings or on the square;
    # four round the square's corners.
    lanes = [(round(RING[0]), round(RING[0]) + 1), (round(SIDE[0]), round(SIDE[0]) + 1), (math.ceil(MAIN[0]), N - 1 - math.ceil(MAIN[0]))]
    lanes += [(N - 1 - b, N - 1 - a) for a, b in lanes[:2]]
    sq0, sq1 = s0, N - 1 - s0
    lamps = []
    for a, b in lanes:
        main = b - a > 2
        for i, t in enumerate(range(round(V0) + 3, N - round(V0) - 3, 6)):
            if any(c0 - 1 <= t <= c1 + 1 for c0, c1 in lanes) or (main and sq0 - 1 <= t <= sq1 + 1): continue
            e = a + 0.15 if i % 2 else b + 0.85
            lamps += [[e, t + 0.5], [t + 0.5, e]]
    lamps += [[sq0 + 0.4, sq0 + 0.4], [sq1 + 0.6, sq0 + 0.4], [sq0 + 0.4, sq1 + 0.6], [sq1 + 0.6, sq1 + 0.6]]
    print('    square: ' + str([sq0, sq0, sq1, sq1]).replace(' ', '') + ',')
    print('    lamps: ' + str([[round(x, 2), round(y, 2)] for x, y in lamps]).replace(' ', '') + ',')
    print('    spawns: ' + str(spawns).replace(' ', '') + ',')
    print('    gems: ' + str(gems).replace(' ', '') + ',')
    print('    lots: ' + str(lots).replace(' ', '') + ',')
    print('    rows: [')
    for r in rows: print(f"      '{r}',")
    print('    ],')


main()
