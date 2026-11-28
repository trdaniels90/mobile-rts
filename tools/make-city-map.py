#!/usr/bin/env python3
"""Lay out the map "Rivergate City" (MAPS.city in src/maps.js) and print it for maps.js.

    python3 tools/make-city-map.py

A 2 v 2 city map: two bases in the west against two in the east. A river runs north to south down the middle of a
city, and the only ways across are three concrete bridges: a boulevard in the north, the main avenue in the middle
and a boulevard in the south. On each bank a grid of streets cuts the city into blocks; the buildings on the blocks
(`lots`) are rolled each battle from its seed (world.js genVillage, as for the villages), so the city is different
every game. Each bank has two plazas (`squares`, a fountain and a church) by the middle bridge and two parks (woods).
Everything is worked out on one quarter of the map (the north-west) and mirrored both ways, so the four starts are alike.
Codes: '.' grass, ',' street (dirt), 'T' woods, '#' rock, '~' water, '=' bridge deck, 'o' ore.
"""
import math

N = 144
H = (N - 1) / 2   # the middle line (71.5)


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


BASE = (20, 24)
BASE_CLEAR = 14
RIVER = 68                     # the river from here to the middle (8 cells wide in all)
CITY = (36, 14)                # the city's north-west corner (its ring street starts here)
# Streets (inclusive cells, in the quarter). V: north-south, H: west-east. The last of each reaches the river / the middle.
VST = [(36, 38), (49, 51), (62, RIVER - 1)]                      # ring, a street, the embankment
HST = [(14, 16), (29, 34), (45, 47), (58, 60), (68, 71)]         # ring, the north boulevard (bridge), streets, the main avenue (bridge)
BRIDGES = [(29, 34), (68, 71)]                                   # rows the bridges cross on (the avenue's is 8 wide, mirrored)
PLAZAS = [(52, 61, 61, 67)]                                      # blocks left open as plazas (x0, y0, x1, y1)
PARKS = [(39, 48, 48, 57)]                                       # blocks of woods
ORE = [(8, 40, 6.5), (36, 6, 5.5), (9, 60, 5), (26, 50, 4)]      # (the last: forward, by the city's west side)
GEMS = [(55.5, 7.0, 2.6), (30.0, 67.0, 2.4)]                     # north of the city, and between the bases by the avenue
ROADS = [   # dirt tracks outside the city: [points], half width
    ([BASE, (30, 31), (36, 31.5)], 1.6),             # to the north boulevard
    ([BASE, (19, 46), (22, 69.5), (36, 69.5)], 1.6),  # to the ally's base, and the main avenue
    ([(26, 44), (36, 46)], 1.3),                      # to the street at y 45-47
    ([(8, 40), (17, 38)], 1.2), ([(36, 6), (30, 16)], 1.2), ([(9, 60), (19, 58)], 1.2),   # out to the ore fields
    ([(30, 16), (36, 15)], 1.3),
]


def in_rng(v, r): return r[0] <= v <= r[1]


def in_box(x, y, b): return b[0] <= x <= b[2] and b[1] <= y <= b[3]


def quarter(x, y):
    """The ground at a cell of the north-west quarter."""
    if x >= RIVER:
        if any(in_rng(y, b) for b in BRIDGES): return '='
        return '~'
    if x >= CITY[0] and y >= CITY[1]:   # the city
        if any(in_rng(x, s) for s in VST) or any(in_rng(y, s) for s in HST): return ','
        if any(in_box(x, y, p) for p in PLAZAS): return ','
        if any(in_box(x, y, p) for p in PARKS):
            return 'T' if noise(x, y, 2.2, 7) > 0.42 and not (x in (39, 48) or y in (48, 57)) else '.'
        return '.'   # a block: buildings are put on it each battle
    for (ox, oy, r) in ORE + GEMS:
        if math.hypot(x - ox, y - oy) < r + 1.5: return '.'
    wx, wy = x + (noise(x, y, 9, 21) - 0.5) * 4, y + (noise(x, y, 9, 22) - 0.5) * 4   # roads wander a little
    for pts, w in ROADS:
        if any(seg_dist(wx, wy, *pts[i], *pts[i + 1]) < w + (noise(x, y, 4, 9) - 0.5) * 0.6 for i in range(len(pts) - 1)): return ','
    if math.hypot(x - BASE[0], y - BASE[1]) < BASE_CLEAR: return '.'
    if x > CITY[0] - 4 and y > CITY[1] - 4: return '.'   # open ground round the city
    if noise(x, y, 7, 1) * 0.75 + noise(x, y, 2.5, 2) * 0.25 > 0.62: return 'T'
    return '.'


def blocks():
    """The blocks between the streets in the quarter (x0, y0, x1, y1)."""
    xs = [(VST[i][1] + 1, VST[i + 1][0] - 1) for i in range(len(VST) - 1)]
    ys = [(HST[i][1] + 1, HST[i + 1][0] - 1) for i in range(len(HST) - 1)]
    return [(a, c, b, d) for (a, b) in xs for (c, d) in ys]


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
    mirror = lambda b: [(b[0], b[1], b[2], b[3]), (m(b[2]), b[1], m(b[0]), b[3]), (b[0], m(b[3]), b[2], m(b[1])), (m(b[2]), m(b[3]), m(b[0]), m(b[1]))]
    lots, squares = [], []
    for b in blocks():
        if any(b[0] <= p[0] and b[1] <= p[1] and p[2] <= b[2] and p[3] <= b[3] for p in PLAZAS + PARKS): continue
        lots += [list(v) for v in mirror(b)]
    for p in PLAZAS: squares += [list(v) for v in mirror((p[0] - 1, p[1] - 1, p[2] + 1, p[3] + 1))]   # the plaza and the edge of its streets (a church fits on a block within 3 cells)
    # Street lamps: along both sides of the streets every 6 cells, none in crossings, plus the plaza corners.
    lamps = []
    for (a, b) in VST[:2]:
        for i, t in enumerate(range(CITY[1] + 4, N - CITY[1] - 3, 6)):
            if any(in_rng(q(t), s) or in_rng(q(t) + 1, s) or in_rng(q(t) - 1, s) for s in HST): continue
            e = a + 0.15 if i % 2 else b + 0.85
            lamps += [[e, t + 0.5], [N - e, t + 0.5]]
    for (a, b) in HST[:4]:
        for i, t in enumerate(range(CITY[0] + 4, RIVER - 1, 6)):
            if any(in_rng(t, s) or in_rng(t + 1, s) or in_rng(t - 1, s) for s in VST): continue
            e = a + 0.15 if i % 2 else b + 0.85
            lamps += [[t + 0.5, e], [N - t - 0.5, e], [t + 0.5, N - e], [N - t - 0.5, N - e]]
    for (x0, y0, x1, y1) in squares: lamps += [[x0 + 0.4, y0 + 0.4], [x1 + 0.6, y0 + 0.4], [x0 + 0.4, y1 + 0.6], [x1 + 0.6, y1 + 0.6]]
    bx, by = BASE
    spawns = [[bx, by], [bx, m(by)], [m(bx), by], [m(bx), m(by)]]
    gems = []
    for (gx, gy, r) in GEMS:
        for (x, y) in ((gx, gy), (gx, m(gy)), (m(gx), gy), (m(gx), m(gy))): gems.append([round(x, 1), round(y, 1), r])
    j = lambda v: str(v).replace(' ', '')
    print('    squares: ' + j(squares) + ',')
    print('    lamps: ' + j([[round(x, 2), round(y, 2)] for x, y in lamps]) + ',')
    print('    spawns: ' + j(spawns) + ',')
    print('    gems: ' + j(gems) + ',')
    print('    lots: ' + j(lots) + ',')
    print('    rows: [')
    for r in rows: print(f"      '{r}',")
    print('    ],')


main()
