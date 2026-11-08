"""Build local icon subsets from the icon names used in both web apps.

Requires fonttools and brotli (local .local-preview/font-tools is also supported).
Original full font is retained as the build source; pages use hashed subsets.
"""
from pathlib import Path
import hashlib
import json
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / '.local-preview/font-tools'))
from fontTools.ttLib import TTFont
from fontTools import subset

source = ROOT / 'apps/engineer-app-web/fonts/material-symbols-outlined.woff2'
font = TTFont(source)
available = set(font.getGlyphOrder())
ascii_glyphs = {glyph for code, glyph in font.getBestCmap().items() if code < 128}
words = set()
for app in ['customer-app-web', 'engineer-app-web']:
    for page in (ROOT / 'apps' / app).rglob('*'):
        if page.suffix not in ['.html', '.js', '.css'] or page.name == 'tailwind.js':
            continue
        words.update(re.findall(r'\b[a-z][a-z0-9_]{1,60}\b', page.read_text(encoding='utf-8')))
names = sorted((words & available) - ascii_glyphs)
glyphs = set(names) | {name + '.fill' for name in names if name + '.fill' in available}
options = subset.Options()
options.layout_closure = False
builder = subset.Subsetter(options=options)
builder.populate(glyphs=glyphs, text=''.join(names))
builder.subset(font)
font.flavor = 'woff2'
runtime = ROOT / '.local-preview'
runtime.mkdir(exist_ok=True)
temporary = runtime / 'icons-subset.woff2'
font.save(temporary)
data = temporary.read_bytes()
name = 'material-symbols-' + hashlib.sha256(data).hexdigest()[:12] + '.woff2'
for app in ['customer-app-web', 'engineer-app-web']:
    directory = ROOT / 'apps' / app
    (directory / 'fonts' / name).write_bytes(data)
    css = directory / 'fonts/material-symbols.css'
    content = re.sub(r'material-symbols-(?:outlined|[a-f0-9]{12})\.woff2', name, css.read_text(encoding='utf-8'))
    css.write_text(content, encoding='utf-8')
    for page in directory.glob('*.html'):
        content = page.read_text(encoding='utf-8')
        if '/fonts/material-symbols.css' not in content:
            continue
        content = re.sub(r'<link rel="preload" href="/fonts/material-symbols-[a-f0-9]{12}\.woff2" as="font" type="font/woff2" crossorigin>', '', content)
        content = content.replace('</head>', '<link rel="preload" href="/fonts/' + name + '" as="font" type="font/woff2" crossorigin></head>')
        page.write_text(content, encoding='utf-8')
report = {'file': name, 'icons': names, 'originalBytes': source.stat().st_size, 'bytes': len(data)}
(runtime / 'icon-subset.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(f'{len(names)} icons: {report["originalBytes"]} -> {len(data)} bytes ({name})')
