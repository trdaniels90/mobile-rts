#!/usr/bin/env python3
"""Lay out the map "Frostlight Valley" (MAPS.frost in src/maps.js) and print it for maps.js.

    python3 tools/make-winter-map.py [--png out.png]

A big winter map for 3 v 3: three bases in the west against three in the east. Three main routes cross between
them (north, middle and south), each through a snowed-in village, and two hamlets lie on the diagonal roads. Rocky
hills squeeze the middle route into a pass and stand between the routes; frozen lakes sit between them too. Street
lamps light the village lanes and the main roads (MAPS lamps), so the routes show at night.
Only the ground is laid out here (rows, start positions, gem fields, the villages' squares and building plots, lamps);
the houses are rolled each battle from its seed (world.js genVillage). Every feature is listed once for the west and
turned half round the middle for the east (P below), so the two alliances' halves are alike.
Codes: '.' snow, ',' track, 'T' woods, '#' rock, '~' frozen water, 'o' ore.
"""
import math
import sys

N = 216
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


both = lambda items, f: items + [f(i) for i in items]

# Start positions (cells) in the west; the east's are their twins. Listed W north, middle, south, then E.
WEST = [(24, 30), (21, 108), (24, 186)]
SPAWNS = WEST + [(N - 1 - x, N - 1 - y) for x, y in WEST]
BASE_CLEAR = 15

# Villages: middle (x, y, continuous), the street plan along each axis from the middle out: `main` half width of the
# main streets, `lanes` [(from, to)] further lanes (the last is the lane round the edge), `half` the edge, `sq` half the
# square. Blocks between the lanes are the building plots.
VILLAGES = [
    dict(c=(108, 108), main=2, lanes=[(13, 15), (24, 26)], half=26, sq=6),   # the middle: a market town
    dict(c=(108, 40), main=2, lanes=[(14, 16)], half=16, sq=6),            # on the north road (its twin on the south road)
    dict(c=(58, 152), main=2, lanes=[(10, 12)], half=12, sq=5),            # a hamlet on the south-west diagonal (twin north-east)
]
VILLAGES = VILLAGES[:1] + both(VILLAGES[1:], lambda v: dict(v, c=P(v['c'])))

ROADS = both([   # dirt tracks: [points], half width
    ([(24.5, 30.5), (52, 33), (82, 40.5)], 1.6),          # north-west base to the north village
    ([(21.5, 108.5), (50, 107), (82, 108)], 1.7),         # middle base through the pass to the town
    ([(24.5, 186.5), (60, 180), (82, 175.5)], 1.6),       # south-west base along the south road (its twin runs to the south village)
    ([(24.5, 30.5), (34, 66), (21.5, 108.5)], 1.3),       # between the allies' bases
    ([(21.5, 108.5), (32, 148), (24.5, 186.5)], 1.3),
    ([(24.5, 186.5), (40, 168), (46, 152)], 1.4),         # south-west base to its hamlet
    ([(70, 152), (82, 134)], 1.4),                        # and on to the town
    ([(24.5, 30.5), (52, 62), (82, 82)], 1.3),            # north-west base to the town's corner
    ([(108, 56), (108, 82)], 1.6),                        # north village to the town (twin: south)
    ([(124, 40.5), (150, 44), (170, 60)], 1.4),           # north village on east to the north-east hamlet's road
], lambda r: ([P(p) for p in r[0]], r[1]))

LAKES = both([(76, 64, 15, 9), (30, 210, 22, 7), (196, 136, 6, 10)], lambda l: (*P(l[:2]), l[2], l[3]))   # x, y, radii
# Rocky hills: blobs (x, y, rx, ry) and ridges (points, half width). The middle road's pass; hills between the routes.
HILLS = both([(52, 86, 12, 10), (54, 132, 11, 10), (108, 8, 10, 6), (8, 66, 6, 9), (86, 198, 7, 5)], lambda r: (*P(r[:2]), r[2], r[3]))
RIDGES = both([([(30, 50), (44, 48), (56, 54)], 1.6), ([(120, 140), (126, 150), (124, 160)], 1.6), ([(66, 196), (76, 190)], 1.4)],
              lambda r: ([P(p) for p in r[0]], r[1]))
ORE = both([(9, 50, 8.5), (46, 13, 7.5), (8, 128, 8.5), (40, 88, 6.5), (10, 168, 8), (46, 202, 7), (62, 118, 5.5), (78, 28, 6)],
           lambda o: (*P(o[:2]), o[2]))
GEMS = both([(6, 18, 3.2), (5, 96, 3.2), (8, 202, 3.2), (70, 96, 2.8), (82, 150, 2.6), (124, 60, 2.6), (134, 26, 2.6)],
            lambda g: (*P(g[:2]), g[2]))


def village_at(x, y):
    """'lane', 'lot' or None for the ground of the villages."""
    for v in VILLAGES:
        dx, dy = abs(x - v['c'][0]), abs(y - v['c'][1])
        if max(dx, dy) >= v['half']: continue
        if dx < v['sq'] and dy < v['sq']: return 'lane'
        if dx < v['main'] or dy < v['main']: return 'lane'
        if any(a <= dx < b or a <= dy < b for a, b in v['lanes']): return 'lane'
        return 'lot'
    return None


def near_village(x, y, pad):
    return any(max(abs(x - v['c'][0]), abs(y - v['c'][1])) < v['half'] + pad for v in VILLAGES)


def cell(x, y):
    """The ground at the cell whose middle is (x, y)."""
    v = village_at(x, y)
    if v: return ',' if v == 'lane' else '.'
    dl = [math.hypot((x - cx) / rx, (y - cy) / ry) + (cnoise(x, y, 3, 5) - 0.5) * 0.3 for (cx, cy, rx, ry) in LAKES]
    if any(d < 1 for d in dl): return '~'
    if any(d < 1.15 for d in dl): return '.'
    for (ox, oy, r) in ORE + GEMS:
        if math.hypot(x - ox, y - oy) < r + 1.5: return '.'
    for s in SPAWNS:
        if math.hypot(x - s[0] - 0.5, y - s[1] - 0.5) < BASE_CLEAR: return '.'
    k = -1 if x > N / 2 else 1   # (turned with the half, so the twin wanders the other way)
    wx, wy = x + k * (cnoise(x, y, 9, 21) - 0.5) * 4, y + k * (cnoise(x, y, 9, 22) - 0.5) * 4   # roads wander a little
    for pts, w in ROADS:
        if any(seg_dist(wx, wy, *pts[i], *pts[i + 1]) < w + (cnoise(x, y, 4, 9) - 0.5) * 0.6 for i in range(len(pts) - 1)): return ','
    if near_village(x, y, 3): return '.'
    for (cx, cy, rx, ry) in HILLS:   # a hill: cliffs round its edge, woods and crags on top (the painter draws rock as ridges)
        d = math.hypot((x - cx) / rx, (y - cy) / ry) + (cnoise(x, y, 2.5, 11) - 0.5) * 0.4
        if d < 1:
            if d > 1 - 2.4 / min(rx, ry) or cnoise(x, y, 2, 13) > 0.72: return '#'
            return 'T'
    for pts, w in RIDGES:
        if any(seg_dist(x, y, *pts[i], *pts[i + 1]) < w + (cnoise(x, y, 2, 12) - 0.5) * 1.4 for i in range(len(pts) - 1)): return '#'
    if any(seg_dist(wx, wy, *pts[i], *pts[i + 1]) < w + 2.5 for pts, w in ROADS for i in range(len(pts) - 1)): return '.'
    if near_village(x, y, 6): return '.'
    if cnoise(x, y, 7, 1) * 0.75 + cnoise(x, y, 2.5, 2) * 0.25 > 0.6: return 'T'
    if cnoise(x, y, 1.3, 31) > 0.93 and cnoise(x, y, 11, 32) > 0.55: return '#'   # a boulder now and then
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
    # Squares and plots: each quadrant's blocks between the lanes, less the square ([x0, y0, x1, y1] inclusive cells).
    squares, lots, lamps = [], [], []
    for v in VILLAGES:
        cx, cy, sq = v['c'][0], v['c'][1], v['sq']
        squares.append([int(cx - sq), int(cy - sq), int(cx + sq - 1), int(cy + sq - 1)])
        edges = [v['main']] + [e for a, b in v['lanes'] for e in (a, b)]
        blocks = [(edges[i], edges[i + 1]) for i in range(0, len(edges) - 1, 2)]   # main..lane1, lane1 end..lane2 ...
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
                            lots.append([int(xs[0]), int(ys[0]), int(xs[1]) - 1, int(ys[1]) - 1])
        # Lamps along each lane's edge every 6 cells, alternating sides, none in crossings or on the square; four at its corners.
        bands = [(-v['main'], v['main'])] + [(s * b, s * a) if s < 0 else (a, b) for a, b in v['lanes'] for s in (-1, 1)]
        bands = [tuple(sorted(b)) for b in bands]
        for a, b in bands:
            for i, t in enumerate(range(-v['half'] + 3, v['half'] - 2, 6)):
                tc = t + 0.5
                if any(c0 - 1 <= tc <= c1 + 1 for c0, c1 in bands) or (a == -v['main'] and -sq - 1 <= tc <= sq + 1): continue
                e = a + 0.15 if i % 2 else b - 0.15
                lamps += [(cx + e, cy + tc), (cx + tc, cy + e)]
        lamps += [(cx + sx * (sq - 0.6), cy + sy * (sq - 0.6)) for sx in (-1, 1) for sy in (-1, 1)]
    # Lamps along the main roads between the villages and the bases, beside the track every 9 cells.
    for pts, w in ROADS[:len(ROADS) // 2]:
        run, side = 4.0, 1
        for i in range(len(pts) - 1):
            (ax, ay), (bx, by) = pts[i], pts[i + 1]
            L = math.hypot(bx - ax, by - ay)
            while run < L:
                t = run / L
                px, py = ax + (bx - ax) * t + (-(by - ay) / L) * side * (w + 1.6), ay + (by - ay) * t + ((bx - ax) / L) * side * (w + 1.6)
                gx, gy = int(px), int(py)
                ok = 0 <= gx < N and 0 <= gy < N and grid[gy][gx] in '.,' and not near_village(px, py, 1) \
                    and all(math.hypot(px - s[0], py - s[1]) > 10 for s in SPAWNS)
                if ok: lamps += [(px, py), P((px, py))]
                run += 9; side = -side
            run -= L
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
        col = {'.': (236, 240, 246), ',': (150, 140, 128), 'T': (40, 70, 50), '#': (110, 100, 96), '~': (140, 180, 210), 'o': (200, 160, 60)}
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
