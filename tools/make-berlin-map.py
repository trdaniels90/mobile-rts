#!/usr/bin/env python3
"""Lay out the map "Berlin" (MAPS.berlin in src/maps.js) and print it for maps.js.

    python3 tools/make-berlin-map.py [--png out.png]

A divided city for 3 v 3 (or 2 v 2): three bases in the west of the city against three in the east. The Wall runs
north to south through the middle, a jagged line of concrete and rubble (rock) with a bare death strip either side;
four checkpoints open it, two north and two south of the river. The Spree winds west to east through the middle,
from the Havel lake in the west to the lake in the east, with two bridges on each side of the Wall. Each half has
three districts (neighbourhoods of houses on a street grid, each round a square), a big park (the Tiergarten in the
west, Treptower Park in the east) and an old airfield (Tempelhof in the west), open ground for a tank battle.
Only the ground is laid out here (rows, start positions, gem fields, the districts' squares and building plots,
lamps); the houses are rolled each battle from its seed (world.js genVillage). Every feature is listed once for the
west and turned half round the middle for the east (P below), so the two alliances' halves are alike.
An original layout inspired by the city's Cold War geography; no map or picture was traced.
Codes: '.' grass, ',' road, 'T' woods, '#' rock (the Wall), '~' water, '=' bridge, 'o' ore.
"""
import math
import sys

N = 200
P = lambda p: (N - p[0], N - p[1])   # half turn about the middle (continuous coordinates; a cell's middle is x + 0.5)


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


def cnoise(x, y, scale, s):   # noise the same at a point and its twin, so the halves match
    if x > N / 2 or (x == N / 2 and y > N / 2): x, y = N - x, N - y
    return noise(x, y, scale, s)


def seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - ax - dx * t, py - ay - dy * t)


def line_dist(x, y, pts):
    return min(seg_dist(x, y, *pts[i], *pts[i + 1]) for i in range(len(pts) - 1))


both = lambda items, f: items + [f(i) for i in items]
turn_line = lambda pts: [P(p) for p in reversed(pts)]

# Start positions (cells) in the west; the east's are their twins. Listed W north, middle, south, then E.
WEST = [(24, 26), (18, 92), (22, 168)]
SPAWNS = WEST + [(N - 1 - x, N - 1 - y) for x, y in WEST]
BASE_CLEAR = 15

# The Wall: a jagged line from the north edge to the middle (its twin carries it on to the south edge). Its gaps are the
# checkpoints (y from, y to), listed for the north half. The death strip is bare ground either side of it.
WALL_N = [(97, -2), (103, 14), (99, 30), (106, 44), (101, 60), (95, 74), (99, 88), (100, 100)]
WALL = WALL_N + turn_line(WALL_N)[1:]
WALL_W, STRIP = 1.15, 5.0
GAPS = both([(20, 28), (66, 74)], lambda g: (N - g[1], N - g[0]))

# The Spree, from the Havel in the west to the middle (its twin runs on east to the lake there); half width.
# It runs straight west to east for a few cells either side of each bridge, so each bridge is a clean span straight across.
SPREE_W = [(34, 132), (46, 124), (57, 121.5), (71, 121.5), (78, 117), (82, 108.5), (94, 108.5), (100, 100)]
SPREE = SPREE_W + turn_line(SPREE_W)[1:]
SPREE_HW = 2.6
BRIDGES = both([(64, 2.6), (88, 2.6)], lambda b: (N - b[0], b[1]))   # bridges across the river: x of the middle, half width

LAKES = both([(24, 136, 10, 7), (12, 128, 8, 12)], lambda l: (*P(l[:2]), l[2], l[3]))   # the Havel; x, y, radii
PARKS = both([(70, 100, 13, 6.5)], lambda p: (*P(p[:2]), p[2], p[3]))                    # Tiergarten / Treptower Park
FIELDS = both([(50, 153, 12, 8)], lambda f: (*P(f[:2]), f[2], f[3]))                     # Tempelhof: open ground, a runway

# Districts: middle (x, y), `main` half width of the main streets, `lanes` [(from, to)] further lanes, `half` the edge,
# `sq` half the square. Blocks between the lanes are the building plots (as Frostlight Valley's villages).
DISTRICTS = both([
    dict(c=(52, 62), main=2, lanes=[(8, 10), (15, 17)], half=17, sq=5),     # Charlottenburg (twin: Lichtenberg)
    dict(c=(70, 26), main=2, lanes=[(8, 10), (13, 15)], half=15, sq=5),     # Wedding (twin: Neukölln)
    dict(c=(79, 138), main=2, lanes=[(7, 9), (12, 14)], half=14, sq=5),    # Kreuzberg, by the Wall (twin: Mitte, Alexanderplatz)
], lambda d: dict(d, c=P(d['c'])))

ROADS = both([   # roads: [points], half width
    ([(24.5, 26.5), (48, 26), (58, 26)], 1.6),                # north-west base to Wedding
    ([(82, 26), (90, 24), (112, 24)], 1.6),                   # Wedding through the north checkpoint
    ([(18.5, 92.5), (36, 80), (40, 62)], 1.6),                # middle base to Charlottenburg
    ([(64, 62), (80, 66), (90, 70), (112, 70)], 1.6),         # Charlottenburg through the middle checkpoint
    ([(52, 49), (60, 38), (70, 38)], 1.3),                    # Charlottenburg to Wedding
    ([(22.5, 168.5), (40, 160), (44, 150)], 1.6),             # south-west base past Tempelhof
    ([(40, 153), (56, 152), (66, 150)], 1.4),                            # Tempelhof's apron road to Kreuzberg
    ([(80, 127), (84, 118), (88, 113), (88, 103), (88, 96), (80, 88), (64, 75)], 1.5),   # Kreuzberg over the bridge to Charlottenburg
    ([(64, 112), (64, 132), (69, 138)], 1.3),                 # the west bridge to Kreuzberg
    ([(64, 112), (60, 96), (52, 75)], 1.3),                   # and on north to Charlottenburg
    ([(24.5, 26.5), (22, 60), (18.5, 92.5)], 1.3),            # between the allies' bases
    ([(18.5, 92.5), (34, 110), (36, 120)], 1.2),
    ([(22.5, 168.5), (36, 148), (40, 140)], 1.2),
    ([(91, 136), (98, 131), (110, 130)], 1.4),                           # Kreuzberg through the south-middle checkpoint (twin: middle)
], lambda r: ([P(p) for p in r[0]], r[1]))

ORE = both([(8, 46, 8), (44, 10, 7), (6, 110, 7), (40, 98, 6), (10, 186, 8), (48, 186, 7), (38, 44, 5), (84, 50, 5.5), (84, 170, 6)],
           lambda o: (*P(o[:2]), o[2]))
GEMS = both([(6, 14, 3.2), (4, 76, 3.2), (6, 196, 3.2), (56, 170, 2.6), (86, 82, 2.4), (118, 44, 2.6)],
            lambda g: (*P(g[:2]), g[2]))


def district_at(x, y):
    """'lane', 'lot' or None for the ground of the districts."""
    for v in DISTRICTS:
        dx, dy = abs(x - v['c'][0]), abs(y - v['c'][1])
        if max(dx, dy) >= v['half']: continue
        if dx < v['sq'] and dy < v['sq']: return 'lane'
        if dx < v['main'] or dy < v['main']: return 'lane'
        if any(a <= dx < b or a <= dy < b for a, b in v['lanes']): return 'lane'
        return 'lot'
    return None


def near_district(x, y, pad):
    return any(max(abs(x - v['c'][0]), abs(y - v['c'][1])) < v['half'] + pad for v in DISTRICTS)


def in_gap(y):
    return any(a <= y < b for a, b in GAPS)


def water(x, y):
    calm = any(abs(x - bx) < hw + 3 for bx, hw in BRIDGES)   # straight banks by the bridges
    dr = line_dist(x, y, SPREE) + (0 if calm else (cnoise(x, y, 4, 7) - 0.5) * 0.5)
    if dr < SPREE_HW: return True
    return any(math.hypot((x - cx) / rx, (y - cy) / ry) + (cnoise(x, y, 3, 5) - 0.5) * 0.25 < 1 for (cx, cy, rx, ry) in LAKES)


def cell(x, y):
    """The ground at the cell whose middle is (x, y)."""
    if water(x, y):
        if any(abs(x - bx) < hw for bx, hw in BRIDGES) and line_dist(x, y, SPREE) < SPREE_HW + 1: return '='
        return '~'
    if any(abs(x - bx) < hw for bx, hw in BRIDGES) and line_dist(x, y, SPREE) < SPREE_HW + 3: return ','   # bridge approaches
    if line_dist(x, y, SPREE) < SPREE_HW + 1.2: return '.'   # the embankment
    dw = line_dist(x, y, WALL)
    if dw < WALL_W and not in_gap(y): return '#'
    if dw < STRIP: return ',' if in_gap(y) and dw < 2.5 else '.'
    d = district_at(x, y)
    if d: return ',' if d == 'lane' else '.'
    for (ox, oy, r) in ORE + GEMS:
        if math.hypot(x - ox, y - oy) < r + 1.5: return '.'
    for s in SPAWNS:
        if math.hypot(x - s[0] - 0.5, y - s[1] - 0.5) < BASE_CLEAR: return '.'
    k = -1 if x > N / 2 else 1
    wx, wy = x + k * (cnoise(x, y, 9, 21) - 0.5) * 2, y + k * (cnoise(x, y, 9, 22) - 0.5) * 2   # roads bend a little
    for pts, w in ROADS:
        if line_dist(wx, wy, pts) < w + (cnoise(x, y, 4, 9) - 0.5) * 0.4: return ','
    for (cx, cy, rx, ry) in FIELDS:   # the airfield: bare, with a runway across it
        if abs(x - cx) < rx and abs(y - cy) < ry:
            return ',' if abs(y - cy) < 1.5 and abs(x - cx) < rx - 2 else '.'
    if near_district(x, y, 3): return '.'
    for (cx, cy, rx, ry) in PARKS:   # the park: woods with paths and a clearing
        d = math.hypot((x - cx) / rx, (y - cy) / ry) + (cnoise(x, y, 2.5, 11) - 0.5) * 0.35
        if d < 1:
            if abs(y - cy) < 0.9 or abs(x - cx) < 0.9 or d < 0.25: return '.'
            return 'T'
    if any(line_dist(wx, wy, pts) < w + 2.0 for pts, w in ROADS): return '.'
    if near_district(x, y, 6): return '.'
    if cnoise(x, y, 7, 1) * 0.75 + cnoise(x, y, 2.5, 2) * 0.25 > 0.7: return 'T'   # gardens and woods in the outskirts
    if cnoise(x, y, 1.3, 31) > 0.94 and cnoise(x, y, 11, 32) > 0.6: return '#'     # rubble now and then
    return '.'


def main():
    grid = [[cell(x + 0.5, y + 0.5) for x in range(N)] for y in range(N)]
    for y in range(N):   # ore (gems are placed by the game on open ground)
        for x in range(N):
            for (ox, oy, r) in ORE:
                if math.hypot(x + 0.5 - ox, y + 0.5 - oy) < r - cnoise(x + 0.5, y + 0.5, 2, 3) * 0.9 and grid[y][x] == '.': grid[y][x] = 'o'
    assert all(grid[y][x] == grid[N - 1 - y][N - 1 - x] for y in range(N) for x in range(N)), 'halves differ'
    rows = []
    for line in grid:
        line, out, i = ''.join(line), '', 0
        while i < len(line):
            j = i
            while j < len(line) and line[j] == line[i]: j += 1
            out += (str(j - i) if j - i > 1 else '') + line[i]
            i = j
        rows.append(out)
    squares, lots, lamps = [], [], []
    for v in DISTRICTS:
        cx, cy, sq = v['c'][0], v['c'][1], v['sq']
        squares.append([int(cx - sq), int(cy - sq), int(cx + sq - 1), int(cy + sq - 1)])
        edges = [v['main']] + [e for a, b in v['lanes'] for e in (a, b)]
        blocks = [(edges[i], edges[i + 1]) for i in range(0, len(edges) - 1, 2)]
        for bx in blocks:
            for by in blocks:
                parts = [(bx, by)]
                if bx[0] < sq and by[0] < sq:   # the square takes a corner: an L in two pieces
                    parts = [((max(bx[0], sq), bx[1]), by), ((bx[0], min(bx[1], sq)), (max(by[0], sq), by[1]))]
                for (ax, ay) in parts:
                    if ax[1] - ax[0] < 2 or ay[1] - ay[0] < 2: continue
                    for sxg in (-1, 1):
                        for syg in (-1, 1):
                            xs = sorted([cx + sxg * ax[0], cx + sxg * ax[1]]); ys = sorted([cy + syg * ay[0], cy + syg * ay[1]])
                            L = [int(xs[0]), int(ys[0]), int(xs[1]) - 1, int(ys[1]) - 1]
                            if all(grid[yy][xx] == '.' for yy in range(L[1], L[3] + 1) for xx in range(L[0], L[2] + 1)): lots.append(L)
        bands = [(-v['main'], v['main'])] + [(s * b, s * a) if s < 0 else (a, b) for a, b in v['lanes'] for s in (-1, 1)]
        bands = [tuple(sorted(b)) for b in bands]
        for a, b in bands:
            for i, t in enumerate(range(-v['half'] + 3, v['half'] - 2, 6)):
                tc = t + 0.5
                if any(c0 - 1 <= tc <= c1 + 1 for c0, c1 in bands) or (a == -v['main'] and -sq - 1 <= tc <= sq + 1): continue
                e = a + 0.15 if i % 2 else b - 0.15
                lamps += [(cx + e, cy + tc), (cx + tc, cy + e)]
        lamps += [(cx + sx * (sq - 0.6), cy + sy * (sq - 0.6)) for sx in (-1, 1) for sy in (-1, 1)]
    # Floodlights along the death strip, both sides of the Wall, every 8 cells.
    for y in range(4, N // 2, 8):
        yc = y + 0.5
        xw = min(range(N * 4), key=lambda i: abs(line_dist(i / 4, yc, WALL)) if i / 4 < N / 2 + 12 and i / 4 > N / 2 - 12 else 1e9) / 4
        for side in (-1, 1):
            px = xw + side * 3.2
            if 0 <= int(px) < N and grid[int(yc)][int(px)] in '.,' and not in_gap(yc): lamps += [(px, yc), P((px, yc))]
    print('    squares: ' + str(squares).replace(' ', '') + ',')
    print('    lamps: ' + str([[round(x, 2), round(y, 2)] for x, y in lamps]).replace(' ', '') + ',')
    print('    spawns: ' + str([list(s) for s in SPAWNS]).replace(' ', '') + ',')
    print('    gems: ' + str([[round(x, 1), round(y, 1), r] for x, y, r in GEMS]).replace(' ', '') + ',')
    print('    lots: ' + str(lots).replace(' ', '') + ',')
    print('    rows: [')
    for r in rows: print(f"      '{r}',")
    print('    ],')
    if '--png' in sys.argv:
        from PIL import Image, ImageDraw
        col = {'.': (120, 160, 90), ',': (150, 140, 128), 'T': (40, 80, 45), '#': (200, 200, 200), '~': (70, 120, 180), '=': (120, 90, 60), 'o': (200, 160, 60)}
        im = Image.new('RGB', (N, N))
        im.putdata([col[grid[y][x]] for y in range(N) for x in range(N)])
        im = im.resize((N * 4, N * 4), Image.NEAREST)
        d = ImageDraw.Draw(im)
        for x0, y0, x1, y1 in lots: d.rectangle([x0 * 4, y0 * 4, x1 * 4 + 3, y1 * 4 + 3], outline=(180, 90, 60))
        for x, y in lamps: d.ellipse([x * 4 - 2, y * 4 - 2, x * 4 + 2, y * 4 + 2], fill=(255, 200, 40))
        for x, y in SPAWNS: d.ellipse([x * 4 - 8, y * 4 - 8, x * 4 + 12, y * 4 + 12], fill=(230, 40, 40))
        for x, y, r in GEMS: d.ellipse([(x - r) * 4, (y - r) * 4, (x + r) * 4, (y + r) * 4], outline=(160, 40, 200), width=2)
        im.save(sys.argv[sys.argv.index('--png') + 1])


main()
