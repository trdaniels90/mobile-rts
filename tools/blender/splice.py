"""Splice generated builders into src/models.js between marker comments.
python3 tools/blender/splice.py <models.js> <generated.js> <name>
The block between '// BLENDER:<name> begin' and '// BLENDER:<name> end' is replaced."""
import sys
path, gen, name = sys.argv[1:4]
t = open(path).read()
a = t.index('// BLENDER:%s begin\n' % name) + len('// BLENDER:%s begin\n' % name)
b = t.rindex('\n', 0, t.index('// BLENDER:%s end' % name)) + 1   # start of the end marker's line, keeps its indent
body = open(gen).read().split('\n', 1)[1]
open(path, 'w').write(t[:a] + body + t[b:])
