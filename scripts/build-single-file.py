#!/usr/bin/env python3
"""Bundle the game into one self-contained HTML file (CSS and JS inlined).

Usage: python3 scripts/build-single-file.py [output.html]
Useful for hosts that serve a single page, such as a Claude artifact.
"""
import pathlib
import re
import sys

root = pathlib.Path(__file__).resolve().parent.parent
html = (root / 'index.html').read_text()
body = re.search(r'<!-- BEGIN BODY -->(.*)<!-- END BODY -->', html, re.S).group(1)
fonts = re.search(r'<link rel="stylesheet" href="(https://fonts[^"]+)">', html).group(1)
css = (root / 'style.css').read_text()
scripts = re.findall(r'<script src="([^"]+)"></script>', html)
js = '\n'.join((root / src).read_text() for src in scripts)

out = f'''<title>Red Horizon</title>
<meta name="description" content="Allies versus Soviets real-time strategy for iPhone and web browsers.">
<link rel="stylesheet" href="{fonts}">
<style>
{css}
</style>
{body.strip()}
<script>
{js}
</script>
'''
dest = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'dist' / 'red-horizon.html'
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(out)
print(f'Wrote {dest} ({len(out) // 1024} KB)')
