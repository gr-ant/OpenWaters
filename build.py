#!/usr/bin/env python3
"""Build "Open Waters.html" from src/: every local <script src> and <link rel="stylesheet"> in src/index.html is
inlined, in the order listed there. Usage: python3 build.py
New fish, boat, tackle or song? Add its file and a matching line to src/index.html (order matters: rigs after their parts).
python3 build.py --shots [name ...] also takes the game's screenshots (electron/shots.js) into Screenshots/auto/."""
import pathlib, re, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent
SRC, OUT = ROOT / 'src', ROOT / 'Open Waters.html'
SCRIPT = re.compile(r'<script(.*?) src="([^"]+)"></script>\n')
STYLE = re.compile(r'<link rel="stylesheet" href="([^"]+)">\n')


def read(rel):
    text = (SRC / rel).read_text(encoding='utf-8')
    if re.search(r'</(script|style)', text, re.I):
        sys.exit(f'{rel}: contains a closing </script> or </style>, which would end the block early')
    return text if text.endswith('\n') else text + '\n'


used, out = set(), []
for line in (SRC / 'index.html').read_text(encoding='utf-8').splitlines(keepends=True):
    if m := SCRIPT.fullmatch(line):
        used.add(m[2]); out.append(f'<script{m[1]}>\n{read(m[2])}</script>\n')
    elif m := STYLE.fullmatch(line):
        used.add(m[1]); out.append(f'<style>\n{read(m[1])}</style>\n')
    else:
        out.append(line)

OUT.write_text(''.join(out), encoding='utf-8')
print(f'Built {OUT.name} from {len(used)} files')
for p in sorted(SRC.rglob('*')):
    if p.is_file() and p.suffix != '.md' and (rel := p.relative_to(SRC).as_posix()) != 'index.html' and rel not in used:   # (notes such as sim/README.md are not game files)
        print(f'  warning: {rel} is not listed in src/index.html, so it is not in the build')

if '--shots' in sys.argv:   # screenshots of the fresh build, in Electron (installed by: cd electron && npm install)
    electron = ROOT / 'electron' / 'node_modules' / '.bin' / 'electron'
    if not electron.exists():
        sys.exit('No Electron: run  cd electron && npm install  first')
    names = [a for a in sys.argv[1:] if a != '--shots']
    sys.exit(subprocess.run([str(electron), str(ROOT / 'electron' / 'shots.js'), *names], cwd=ROOT / 'electron').returncode)
