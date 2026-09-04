#!/usr/bin/env python3
"""Regenerate every data artifact from its source document.

Each `data/<club>/<event>/manifest.json` lists its artifacts: the output
file, the extraction tool, the source PDF (kept alongside, verbatim, with
the URL it was fetched from) and the metadata that heads the output. Running
this rewrites the outputs; `--check` instead fails if any committed output
differs from a fresh extraction — the CI guard that the JSON really is what
the tools read from the PDFs.

    python3 tools/regenerate.py [--check] [manifest.json ...]
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS = os.path.join(ROOT, 'tools')


def find_manifests():
    for dirpath, _, files in os.walk(os.path.join(ROOT, 'data')):
        if 'manifest.json' in files:
            yield os.path.join(dirpath, 'manifest.json')


def extract(base, artifact, meta_path):
    tool = artifact['tool']
    source = os.path.join(base, artifact['source'])
    if tool == 'extract_marks':
        cmd = [sys.executable, os.path.join(TOOLS, 'extract_marks.py'), source, '--meta', meta_path]
    elif tool == 'extract_bearings':
        cmd = [sys.executable, os.path.join(TOOLS, 'extract_bearings.py'), source]
    elif tool == 'extract_card':
        cmd = [sys.executable, os.path.join(TOOLS, 'extract_card.py'), 'build', source, '--meta', meta_path,
               '--templates', os.path.join(TOOLS, 'templates', artifact['templates'])]
        if artifact.get('overrides'):
            cmd += ['--overrides', os.path.join(base, artifact['overrides'])]
    else:
        sys.exit(f'{artifact["output"]}: unknown tool {tool}')
    return subprocess.run(cmd, check=True, capture_output=True, text=True).stdout


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('manifests', nargs='*')
    ap.add_argument('--check', action='store_true', help='verify committed outputs instead of rewriting them')
    args = ap.parse_args()
    failures = 0
    for manifest in args.manifests or sorted(find_manifests()):
        base = os.path.dirname(manifest)
        for artifact in json.load(open(manifest))['artifacts']:
            out_path = os.path.join(base, artifact['output'])
            rel = os.path.relpath(out_path, ROOT)
            with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as meta:
                json.dump(artifact.get('meta', {}), meta)
            try:
                fresh = extract(base, artifact, meta.name)
            except subprocess.CalledProcessError as e:
                print(f'{rel}: extraction failed\n{e.stderr}', file=sys.stderr)
                failures += 1
                continue
            finally:
                os.unlink(meta.name)
            if args.check:
                current = open(out_path).read() if os.path.exists(out_path) else None
                status = 'ok' if current == fresh else 'DIFFERS'
                failures += status != 'ok'
                print(f'{rel}: {status}')
            else:
                open(out_path, 'w').write(fresh)
                print(f'{rel}: written')
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
