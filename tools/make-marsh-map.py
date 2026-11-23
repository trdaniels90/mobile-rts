#!/usr/bin/env python3
"""Lay out the map "Heron Fen" (MAPS.marsh in src/maps.js) and print it for maps.js.

    python3 tools/make-marsh-map.py [--png out.png]

A 2 v 2 map: four bases, each on a high plateau in a corner (cliffs round its rim, three ramps down: toward the ally,
toward the middle and along the map's edge toward the enemy across it), and a misty fen in the middle: shallow water
you can wade (fords, 'f'), deep pools ('~'), reed beds and dead woods ('T'), and causeways of mud (',') leading to a
small fishing village on a dry island in the middle, with jetties ('=') out into the pools. West (starts 0-1) against
east (2-3). Everything is worked out on one quarter of the map (the north-west) and mirrored both ways, so the four
start positions are alike. The plateaus' height is set by world.js makeHeights (MAPS `plateau`), not here.
Codes: '.' grass, ',' dirt / mud, 'T' woods, '#' rock, '~' water, 'f' shallow water, '=' jetty, 'o' ore.
"""
import math
import sys
from collections import deque

N = 160
C = (N - 1) / 2   # the middle line


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


sm = lambda v: (lambda a: a * a * (3 - 2 * a))(max(0.0, min(1.0, v)))
BASE = (25, 25)
RP = 22            # the plateau's radius (cells from the base); MAPS plateau.r
EASE = 7           # the slope down from its rim; MAPS plateau.ease
BASE_CLEAR = 14
RAMPS = [(0, 1), (1 / math.sqrt(2), 1 / math.sqrt(2))]   # toward the ally (south) and the middle (no ramp toward the enemy: see CHANNEL)
CHANNEL = 73.5     # deep water from the map's edges to the island between west and east (cells from the middle line), so the
                   # only way across is through the village (owner: with routes round the edges no fighting took place in the town)
RAMP_W = 3.6       # half width of a ramp's gap in the cliffs
V0 = 66.5          # the village island: cells with max(|x - C|, |y - C|) < C - V0
SQ = 75            # the square: SQ .. N - 1 - SQ
ORE = [(13, 36, 4), (36, 13, 4), (17, 58, 5), (58, 10, 4.4)]   # two on the plateau, one below the ally ramp, one out by the edge
GEMS = [(57, 57, 2.4)]
ROADS = [   # mud causeways: [points], half width
    ([BASE, (25, 50), (22, 62), (24, C)], 1.5),          # down the ally ramp, meeting the ally's
    ([BASE, (44, 44), (V0 + 0.5, V0 + 0.5)], 1.5),       # down the middle ramp to the village
    ([(V0 + 1, C), (36, C)], 1.4),                         # the village's west street out to the meadow
    ([(17, 58), (23, 60)], 1.1),
]
POOLS = [(59.5, 72.5, 5.5, 3.8), (72.5, 59.5, 3.8, 5.5)]       # forced pools by the jetties: centre x, y, radii
JETTIES = [(61, 71, 66.5, 72.9), (71, 61, 72.9, 66.5)]     # x0, y0, x1, y1 (cells, inclusive at x0, y0)
BOATS = [(62.2, 74.6, 0), (63.6, 69.6, 0), (74.6, 62.2, 1), (69.6, 63.6, 1)]   # rowboats moored by the jetties (v: 0 along x, 1 along y)
RACKS = [(68.4, 70.0, 1), (70.0, 68.4, 0)]           # fishing nets drying on frames


def on_road(x, y):
    wx, wy = x + (noise(x, y, 9, 21) - 0.5) * 3, y + (noise(x, y, 9, 22) - 0.5) * 3   # causeways wander a little
    return any(seg_dist(wx, wy, *pts[i], *pts[i + 1]) < w + (noise(x, y, 4, 9) - 0.5) * 0.6 for pts, w in ROADS for i in range(len(pts) - 1))


def in_ramp(x, y):
    dx, dy = x - BASE[0], y - BASE[1]
    for ux, uy in RAMPS:
        along = dx * ux + dy * uy
        if along > 0 and abs(-dx * uy + dy * ux) < RAMP_W: return True
    return False


def quarter(x, y):
    """The ground at a cell of the quarter (x, y up to the middle)."""
    d = math.hypot(x - BASE[0], y - BASE[1])
    # The village island.
    if min(x, y) > V0:
        lane = lambda a, b: a <= x <= b or a <= y <= b
        if x >= SQ and y >= SQ: return ','
        if lane(V0, V0 + 1.5) or lane(SQ - 2, SQ - 0.5) or x >= C - 1.6 or y >= C - 1.6: return ','
        return '.'
    if x > CHANNEL + (noise(x, y, 3, 51) - 0.5) * 2.4 and y < V0 - 0.5: return '~'   # the channel between west and east
    for (x0, y0, x1, y1) in JETTIES:
        if x0 <= x <= x1 and y0 <= y <= y1: return '='
    for (cx, cy, rx, ry) in POOLS:
        if math.hypot((x - cx) / rx, (y - cy) / ry) + (noise(x, y, 2.5, 31) - 0.5) * 0.3 < 1: return '~'
    # The plateau: its rim of cliffs (gaps for the ramps), open ground on top.
    rim = d + (noise(x, y, 2.2, 11) - 0.5) * 1.4
    if RP - 0.2 <= rim < RP + 1.6 and not in_ramp(x, y): return '#'
    for (ox, oy, r) in ORE + GEMS:
        if math.hypot(x - ox, y - oy) < r + 1.5: return '.'
    if on_road(x, y): return ','
    if d < BASE_CLEAR: return '.'
    if rim < RP:
        return 'T' if d > BASE_CLEAR + 3 and noise(x, y, 5, 41) * 0.7 + noise(x, y, 2, 42) * 0.3 > 0.66 else '.'
    # Below the plateau: the slope (dry), then the fen. The meadow between the two allies' plateaus is wet but firmer.
    if rim < RP + EASE + 1:
        return 'T' if noise(x, y, 4, 43) > 0.72 else '.'
    if min(x, y) > V0 - 2: return '.' if noise(x, y, 3, 44) > 0.25 else ','   # the island's shore
    fen = sm((d - (RP + EASE + 1)) / 6) * (0.3 + 0.7 * sm((x - 36) / 12))
    n = noise(x, y, 7, 1) * 0.65 + noise(x, y, 2.5, 2) * 0.35 + 0.3 * (fen - 1)
    if n > 0.56: return '~'
    if n > 0.41: return 'f'
    if noise(x, y, 3.5, 7) * 0.75 + noise(x, y, 1.5, 8) * 0.25 > 0.66: return 'T'   # reed beds and dead woods
    if fen > 0.5 and noise(x, y, 4, 9) > 0.68: return ','
    return '.'


def main():
    q = lambda v: min(v, N - 1 - v)
    grid = [[quarter(q(x), q(y)) for x in range(N)] for y in range(N)]
    for y in range(N):
        for x in range(N):
            for (ox, oy, r) in ORE:
                if math.hypot(q(x) - ox, q(y) - oy) < r - (noise(x, y, 2, 3) * 0.9) and grid[y][x] == '.': grid[y][x] = 'o'
    m = lambda v: N - 1 - v
    bx, by = BASE
    spawns = [[bx, by], [bx, m(by)], [m(bx), by], [m(bx), m(by)]]
    # Checks: every start reaches every other and the square; no deep water near a plateau (heights drop to 0 at shores).
    walk = lambda x, y: grid[y][x] not in 'T#~'
    seen, dq = {(bx, by)}, deque([(bx, by)])
    while dq:
        x, y = dq.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < N and 0 <= ny < N and (nx, ny) not in seen and walk(nx, ny): seen.add((nx, ny)); dq.append((nx, ny))
    for p in spawns + [[round(C), round(C) - 4]]: assert tuple(p) in seen, ('not reachable', p)
    # West reaches east only through the village: with the island (and a cell of its shore) taken away, no way across.
    seen2, dq = {(bx, by)}, deque([(bx, by)])
    while dq:
        x, y = dq.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < N and 0 <= ny < N and (nx, ny) not in seen2 and walk(nx, ny) and min(q(nx), q(ny)) <= V0 - 1: seen2.add((nx, ny)); dq.append((nx, ny))
    assert (m(bx), by) not in seen2 and (m(bx), m(by)) not in seen2, 'a way from west to east round the village'
    for y in range(N):
        for x in range(N):
            if grid[y][x] in '~f' and math.hypot(q(x) - bx, q(y) - by) < RP + 6: raise SystemExit(f'water on the slope at {x},{y}')
    if '--png' in sys.argv:
        from PIL import Image
        col = {'.': (60, 84, 44), ',': (110, 92, 60), 'T': (24, 44, 22), '#': (120, 118, 112), '~': (40, 60, 70), 'f': (70, 96, 92), '=': (150, 110, 60), 'o': (200, 170, 60)}
        im = Image.new('RGB', (N, N))
        for y in range(N):
            for x in range(N): im.putpixel((x, y), col[grid[y][x]])
        im.resize((N * 4, N * 4), Image.NEAREST).save(sys.argv[sys.argv.index('--png') + 1])
    rows = []
    for line in grid:
        line, out, i = ''.join(line), '', 0
        while i < len(line):
            j = i
            while j < len(line) and line[j] == line[i]: j += 1
            out += (str(j - i) if j - i > 1 else '') + line[i]
            i = j
        rows.append(out)
    mir = lambda pts: [p for (x, y, *rest) in pts for p in ([x, y, *rest], [m(x), y, *rest], [x, m(y), *rest], [m(x), m(y), *rest])]
    gems = [[round(x, 1), round(y, 1), r] for x, y, r in mir(GEMS)]
    # Building plots in the quarter (inclusive cells), then mirrored: the corner block, and a block either side of the square.
    a0, a1 = math.ceil(V0 + 1.6), SQ - 3
    quart = [(a0, a0, a1, a1), (a0, SQ, a1, math.floor(C - 1.7)), (SQ, a0, math.floor(C - 1.7), a1)]
    lots = []
    for (x0, y0, x1, y1) in quart:
        for fx in (False, True):
            for fy in (False, True):
                X0, X1 = (m(x1), m(x0)) if fx else (x0, x1)
                Y0, Y1 = (m(y1), m(y0)) if fy else (y0, y1)
                lots.append([X0, Y0, X1, Y1])
    # Lamps: along the island's lanes and at the square's corners, and along the jetties.
    lamps = []
    for t in (70.5,):
        lamps += [[V0 + 1.6, t], [t, V0 + 1.6]]
    lamps += [[SQ - 0.4, SQ - 0.4], [C - 2.2, V0 + 3.5], [V0 + 3.5, C - 2.2]]
    lamps += [[64.5, 70.6], [70.6, 64.5]]
    sq = [SQ, SQ, m(SQ), m(SQ)]
    rnd = lambda pts: str([[round(v, 2) for v in p] for p in pts]).replace(' ', '')
    boats = []
    for x, y, v in BOATS:
        boats += [[x, y, v], [m(x), y, v], [x, m(y), v], [m(x), m(y), v]]
    print('    square: ' + str(sq).replace(' ', '') + ',')
    print('    lamps: ' + rnd(mir(lamps)) + ',')
    print('    boats: ' + rnd(boats) + ',')
    print('    racks: ' + rnd(mir(RACKS)) + ',')
    print('    spawns: ' + str(spawns).replace(' ', '') + ',')
    print('    gems: ' + str(gems).replace(' ', '') + ',')
    print('    lots: ' + str(lots).replace(' ', '') + ',')
    print('    rows: [')
    for r in rows: print(f"      '{r}',")
    print('    ],')


main()
