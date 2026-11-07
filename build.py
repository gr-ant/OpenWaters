#!/usr/bin/env python3
"""Build "Open Waters.html" from src/: every local <script src> and <link rel="stylesheet"> in src/index.html is
inlined, in the order listed there. Usage: python3 build.py
New fish, boat or tackle? Add its .json file and a matching line to src/index.html (order matters: rigs after their parts)."""
import pathlib, re, sys

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
for p in sorted(SRC.rglob('*.js')) + sorted(SRC.rglob('*.json')) + sorted(SRC.rglob('*.css')):
    if (rel := p.relative_to(SRC).as_posix()) not in used:
        print(f'  warning: {rel} is not listed in src/index.html, so it is not in the build')
