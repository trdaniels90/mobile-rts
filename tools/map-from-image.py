#!/usr/bin/env python3
"""Turn a pixel-art map design into a fixed layout for src/maps.js.

    python3 tools/map-from-image.py <design.png> <cells per side in the design> <game MAP size> [--bridge x0,y0,x1,y1 ...] [--ford x0,y0,x1,y1 ...]

The design is read one colour per design cell (the picture may be scaled up by a whole number):
dark green grass, blue water, brown shore (walkable dirt), light green woods, grey lines rock or
cliffs, yellow ore (with its darker specks), red dots start positions. Designs on a lavender ground
(maps/designs/snowbound.png) use their own browns and specks, and light grey lines are roads (dirt tracks). Each --bridge box (design
cells, inclusive) marks the grey bar there as a bridge; each --ford box makes it a shallow ford. The layout is scaled to the game's map
size and printed as run-length rows ('.' grass, ',' dirt, 'T' woods, '#' rock, '~' water,
'=' bridge, 'f' ford, 'o' ore) plus the start positions in game cells, west of the map's middle first.
"""
import sys
from PIL import Image

GRASS, SHORE, WATER, WOODS, RED = (44, 64, 56), (136, 112, 88), (92, 120, 164), (144, 164, 116), (168, 0, 0)
ROCK = {(84, 84, 84), (100, 88, 84)}
ORE = (244, 208, 120)
SPECK = {(136, 104, 80), (84, 72, 72), (100, 80, 56), (108, 100, 56)}   # dark flecks inside ore fields
# The lavender palette: its ground, shore, roads and the pale flecks in its ore fields.
LAV_GRASS, LAV_SHORE, LAV_ROAD = (228, 216, 228), (136, 104, 80), (124, 124, 124)
LAV_SPECK = {(196, 176, 140), (208, 192, 160), (220, 204, 196)}


def main():
    args = sys.argv[1:]
    bridges, fords = [], []
    for flag, boxes in (('--bridge', bridges), ('--ford', fords)):
        while flag in args:
            i = args.index(flag)
            boxes.append(tuple(int(v) for v in args[i + 1].split(',')))
            del args[i:i + 2]
    path, n, size = args[0], int(args[1]), int(args[2])
    im = Image.open(path).convert('RGB')
    px, k = im.load(), im.size[0] / n
    col = [[px[int((x + 0.5) * k), int((y + 0.5) * k)] for x in range(n)] for y in range(n)]
    global GRASS, SHORE, SPECK
    road = None
    if any(LAV_GRASS in r for r in col):
        GRASS, SHORE, SPECK, road = LAV_GRASS, LAV_SHORE, LAV_SPECK, LAV_ROAD

    grid, spawns = [['.'] * n for _ in range(n)], []
    for y in range(n):
        for x in range(n):
            c = col[y][x]
            if c == WATER: grid[y][x] = '~'
            elif c == SHORE or c == road: grid[y][x] = ','
            elif c == WOODS: grid[y][x] = 'T'
            elif c in ROCK:
                inside = lambda boxes: any(x0 <= x <= x1 and y0 <= y <= y1 for x0, y0, x1, y1 in boxes)
                grid[y][x] = '=' if inside(bridges) else 'f' if inside(fords) else '#'
            elif c == ORE: grid[y][x] = 'o'
            elif c == RED: spawns.append((x, y))
            elif c not in SPECK and c != GRASS: print('unknown colour', c, 'at', x, y, file=sys.stderr)
    # Specks count as ore when they touch an ore field.
    changed = True
    while changed:
        changed = False
        for y in range(n):
            for x in range(n):
                if col[y][x] in SPECK and grid[y][x] == '.' and any(0 <= x + dx < n and 0 <= y + dy < n and grid[y + dy][x + dx] == 'o' for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    grid[y][x] = 'o'; changed = True

    s = lambda v: int((v + 0.5) * size / n)   # design cell to game cell (nearest)
    rows = []
    for y in range(size):
        line = ''.join(grid[int((y + 0.5) * n / size)][int((x + 0.5) * n / size)] for x in range(size))
        out, i = '', 0
        while i < len(line):
            j = i
            while j < len(line) and line[j] == line[i]: j += 1
            out += (str(j - i) if j - i > 1 else '') + line[i]
            i = j
        rows.append(out)
    west = sorted((p for p in spawns if p[0] < n / 2), key=lambda p: p[1])
    east = sorted((p for p in spawns if p[0] >= n / 2), key=lambda p: p[1])
    print('    spawns: ' + str([[s(x), s(y)] for x, y in west + east]).replace(' ', '') + ',')
    print('    rows: [')
    for r in rows: print(f"      '{r}',")
    print('    ],')


main()
