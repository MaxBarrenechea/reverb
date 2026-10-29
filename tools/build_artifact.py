#!/usr/bin/env python3
"""Packs Reverb into one HTML file for publishing as a claude.ai Artifact.

Usage: python3 tools/build_artifact.py OUTPUT.html
"""
import re, sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
out = Path(sys.argv[1] if len(sys.argv) > 1 else root / 'reverb-artifact.html')
html = (root / 'index.html').read_text(encoding='utf-8')

title = re.search(r'<title>.*?</title>', html, re.S).group(0)
fonts = re.search(r'<link href="https://fonts\.googleapis\.com/css2[^>]*>', html).group(0)
body = re.search(r'<body[^>]*>(.*)</body>', html, re.S).group(1)
body_class = re.search(r'<body([^>]*)>', html).group(1)
body = re.sub(r'\s*<script src="[^"]+"></script>', '', body)

css = (root / 'style.css').read_text(encoding='utf-8') + """
/* Artifact frame: the page already pads for the phone's safe areas, so fill what's left */
html, body { height: 100%; }
.app { height: 100%; padding: 8px; }
"""
scripts = ['window.REVERB_EMBED = true;'] + [
    (root / f).read_text(encoding='utf-8') for f in ('spotify-data.js', 'library.js', 'match.js', 'app.js')]
for s in scripts:
    if '</script' in s.lower():
        sys.exit('A script contains </script>, which would break the page')

# Body classes go on a wrapper script since the Artifact adds its own <body>
cls = re.search(r'class="([^"]*)"', body_class)
boot = f"document.body.className = {cls.group(1)!r};" if cls else ''

page = f"""{title}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
{fonts}
<style>
{css}
</style>
{body.strip()}
<script>{boot}</script>
""" + '\n'.join(f'<script>\n{s}\n</script>' for s in scripts) + '\n'
out.write_text(page, encoding='utf-8')
print(f'Wrote {out} ({len(page.encode()) / 1024:.0f} KB)')
