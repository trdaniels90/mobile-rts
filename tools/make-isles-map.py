#!/usr/bin/env python3
"""Lay out the map "Twin Isles" (MAPS.isles in src/maps.js) and print it for maps.js.

    python3 tools/make-isles-map.py

A 2 v 2 (or 1 v 1) naval map: two islands, west and east, across a strait, with open sea all round. No bridges and no
fords: the only ways across are by sea (Transports) and by air. Each island holds two bases near its outer (sea-side)
coast, so each has water close enough for a Naval Yard or Submarine Pen; ore by each base, more in the middle of the
island, and a gem field on the strait's shore, where the crossing is shortest. Worked out on one quarter of the map (the
north-west) and mirrored both ways, so the four starts are alike.
Codes: '.' grass, ',' dirt, 'T' woods, '#' rock, '~' water, 'o' ore.
"""
import math

N = 144


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


BASE = (20, 30)
BASE_CLEAR = 13
COAST_W, COAST_N = 6, 7          # the island's outer coasts (cells from the map's edge)
STRAIT_MID, STRAIT_END = 5, 10   # half the strait's width at the middle (y 71.5) and at the north end
ORE = [(10, 54, 5.0), (36, 15, 5.0), (40, 48, 5.5)]   # by the base (west coast), north, the island's middle
GEMS = [(56, 66, 2.6)]                               # on the strait's shore
ROCKS = [(46, 30, 2.2), (28, 62, 1.8)]
ROADS = [([BASE, (12, 46), (10, 54)], 1.4), ([BASE, (36, 15)], 1.3), ([BASE, (30, 44), (40, 48), (52, 62)], 1.5)]


def land(x, y):
    """Whether a cell of the north-west quarter is island (not sea): a coast with bays and headlands, the north-west
    corner rounded, the strait narrowest in the middle."""
    big = (noise(x, y, 15, 11) - 0.5) * 11 + (noise(x, y, 5, 12) - 0.5) * 3 + (noise(x, y, 2, 13) - 0.5) * 1.2
    k = y / 71.5
    strait = 71.5 - (STRAIT_END + (STRAIT_MID - STRAIT_END) * k * k)
    R = 20
    cx, cy = COAST_W + R, COAST_N + R
    corner = x < cx and y < cy and math.hypot(cx - x, cy - y) > R + big * 0.6
    return x > COAST_W + 2 + big and y > COAST_N + 2 + big * 0.8 and x < strait + big * 0.55 and not corner


def quarter(x, y):
    if not land(x, y): return '~'
    if not all(land(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))): return ','   # a beach
    for (ox, oy, r) in ORE + GEMS:
        if math.hypot(x - ox, y - oy) < r + 1.5: return '.'
    for (ox, oy, r) in ROCKS:
        if math.hypot(x - ox, y - oy) < r + noise(x, y, 2, 5): return '#'
    wx, wy = x + (noise(x, y, 9, 21) - 0.5) * 3, y + (noise(x, y, 9, 22) - 0.5) * 3
    for pts, w in ROADS:
        if any(seg_dist(wx, wy, *pts[i], *pts[i + 1]) < w + (noise(x, y, 4, 9) - 0.5) * 0.6 for i in range(len(pts) - 1)): return ','
    if math.hypot(x - BASE[0], y - BASE[1]) < BASE_CLEAR: return '.'
    if noise(x, y, 7, 1) * 0.75 + noise(x, y, 2.5, 2) * 0.25 > 0.66: return 'T'
    return '.'


def main():
    q = lambda v: min(v, N - 1 - v)
    m = lambda v: N - 1 - v
    grid = [[quarter(q(x), q(y)) for x in range(N)] for y in range(N)]
    for y in range(N):
        for x in range(N):
            for (ox, oy, r) in ORE:
                if math.hypot(q(x) - ox, q(y) - oy) < r - noise(x, y, 2, 3) * 0.9 and grid[y][x] == '.': grid[y][x] = 'o'
    rows = []
    for line in grid:
        line, out, i = ''.join(line), '', 0
        while i < len(line):
            j = i
            while j < len(line) and line[j] == line[i]: j += 1
            out += (str(j - i) if j - i > 1 else '') + line[i]
            i = j
        rows.append(out)
    bx, by = BASE
    spawns = [[bx, by], [bx, m(by)], [m(bx), by], [m(bx), m(by)]]
    gems = []
    for (gx, gy, r) in GEMS:
        for (x, y) in ((gx, gy), (gx, m(gy)), (m(gx), gy), (m(gx), m(gy))): gems.append([round(x, 1), round(y, 1), r])
    j = lambda v: str(v).replace(' ', '')
    print('    spawns: ' + j(spawns) + ',')
    print('    gems: ' + j(gems) + ',')
    print('    rows: [')
    for r in rows: print(f"      '{r}',")
    print('    ],')


main()
