#!/bin/bash
# The Tiberian Sun look test copy for testers at https://trdaniels90.github.io/mobile-rts/ts/ (owner, 2026-11-19: "Separate TS
# link"). Builds this branch (claude/ts-look) into <out dir>/index.html plus <out dir>/grounds (this branch's baked ground).
# Then copy <out dir> to ts/ in a checkout of main (see "TS test link" in docs/NOTES.md). The copy:
#  - has its own version (VERSION + '-ts'): it never joins the real game's server or rooms (phone to phone with other TS copies);
#  - keeps its own saved game (IndexedDB 'red-horizon-ts');
#  - loads sprites, music and map pictures from the main site (../), which are the same on both branches (checked below).
#   tools/look/build-ts.sh <out dir>
set -e
out=${1:?out dir}; root=$(cd "$(dirname "$0")/../.." && pwd); cd "$root"
git fetch -q origin main
for d in sprites music maps; do if [ -n "$(git diff --stat origin/main HEAD -- $d)" ]; then echo "$d differs from main: copy it into the TS folder too"; exit 1; fi; done
mkdir -p "$out"
python3 scripts/build-single-file.py "$out/index.html" >/dev/null
python3 - "$out/index.html" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read()
rep = [("const VERSION = RELEASES[0].v;", "const VERSION = RELEASES[0].v + '-ts';   // (the TS look test copy at /ts/: its own version, so it never joins the real game's server or rooms)"),
       ("const DB = 'red-horizon',", "const DB = 'red-horizon-ts',"),
       ("fetch('sprites/manifest.json')", "fetch('../sprites/manifest.json')"),
       ("await fetch('sprites/' + sh.file)", "await fetch('../sprites/' + sh.file)"),
       ("fetch('music/' + id + '.mp3')", "fetch('../music/' + id + '.mp3')"),
       ("<title>Red Horizon</title>", "<title>Red Horizon: Tiberian Sun look test</title>")]
for a, b in rep:
    assert s.count(a) == 1, a
    s = s.replace(a, b)
import re
s = re.sub(r"'maps/([a-z]+)\.png", r"'../maps/\1.png", s)
open(p, 'w').write('<meta charset="utf-8">\n' + s)
PY
rm -rf "$out/grounds"; cp -r grounds "$out/grounds"
if [ -d normals ]; then rm -rf "$out/normals"; cp -r normals "$out/normals"; fi   # (the WebGL renderer's baked normal maps: this branch's, beside the page)
echo "built $out"
