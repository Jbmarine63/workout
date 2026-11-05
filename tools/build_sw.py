#!/usr/bin/env python3
"""Regenerates sw.js with the full precache list and a content-hash cache version.
Run after changing any file:  python3 tools/build_sw.py
"""
import hashlib, json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {'tools', '.git', '.github', 'node_modules'}
SKIP_FILES = {'sw.js', 'README.md', 'CHANGES.md', '.nojekyll', '.gitignore', 'LICENSE'}
files = []
for dp, dns, fns in os.walk(ROOT):
    dns[:] = sorted(d for d in dns if d not in SKIP_DIRS)
    for fn in sorted(fns):
        rel = os.path.relpath(os.path.join(dp, fn), ROOT).replace(os.sep, '/')
        if rel in SKIP_FILES or fn.startswith('.'):
            continue
        files.append(rel)
hsh = hashlib.sha256()
for f in files:
    hsh.update(f.encode()); hsh.update(open(os.path.join(ROOT, f), 'rb').read())
hsh.update(open(os.path.join(ROOT, 'tools', 'sw.template.js'), 'rb').read())
version = hsh.hexdigest()[:12]
precache = ['./'] + files
tpl = open(os.path.join(ROOT, 'tools', 'sw.template.js')).read()
out = tpl.replace('__VERSION__', version).replace('__PRECACHE__', json.dumps(precache, indent=1))
open(os.path.join(ROOT, 'sw.js'), 'w').write(out)
print(f'sw.js: version {version}, {len(precache)} URLs')
