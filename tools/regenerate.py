#!/usr/bin/env python3
"""Regenerate every data artifact from its source document.

Each `data/<club>/<event>/manifest.json` lists its artifacts: the output
file, the extraction tool, the source PDF (kept alongside, verbatim, with
the URL it was fetched from), the metadata that heads the output, and for a
card the document its notes are read from. Running
this rewrites the outputs; `--check` instead fails if any committed output
differs from a fresh extraction — the CI guard that the JSON really is what
the tools read from the PDFs. A manifest's `checks` names a tool that then
cross-checks the outputs against the club's other publications, in both
modes.

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


# How each card tool's notes are read from the document `notesSource` names.
NOTES_TOOLS = {
    'extract_card': ['extract_notes.py'],
    'extract_dbsc_card': ['extract_dbsc_marks.py', '--notes'],
}


def notes_file(base, artifact):
    tool, *flags = NOTES_TOOLS[artifact['tool']]
    notes = subprocess.run([sys.executable, os.path.join(TOOLS, tool), os.path.join(base, artifact['notesSource'])] + flags,
                           check=True, capture_output=True, text=True).stdout
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as fh:
        fh.write(notes)
    return fh.name


def extract(base, artifact, meta_path):
    tool = artifact['tool']
    source = os.path.join(base, artifact['source'])
    if tool == 'extract_marks':
        cmd = [sys.executable, os.path.join(TOOLS, 'extract_marks.py'), source, '--meta', meta_path]
    elif tool == 'extract_dbsc_marks':
        cmd = [sys.executable, os.path.join(TOOLS, 'extract_dbsc_marks.py'), source, '--meta', meta_path]
        if artifact.get('supplement'):
            cmd += ['--supplement', os.path.join(base, artifact['supplement']['source']),
                    '--supplement-ids', ','.join(artifact['supplement']['ids'])]
    elif tool == 'extract_card':
        cmd = [sys.executable, os.path.join(TOOLS, 'extract_card.py'), 'build', source, '--meta', meta_path,
               '--templates', os.path.join(TOOLS, 'templates', artifact['templates'])]
        if artifact.get('overrides'):
            cmd += ['--overrides', os.path.join(base, artifact['overrides'])]
    elif tool == 'extract_dbsc_card':
        cmd = [sys.executable, os.path.join(TOOLS, 'extract_dbsc_card.py'), source, '--meta', meta_path]
    else:
        sys.exit(f'{artifact["output"]}: unknown tool {tool}')
    if artifact.get('notesSource'):
        cmd += ['--notes', notes_file(base, artifact)]
    return subprocess.run(cmd, check=True, capture_output=True, text=True).stdout


def cross_check(base, manifest):
    """A data set's `checks`: the club's other publications against the outputs."""
    tool = manifest['checks']['tool']
    result = subprocess.run([sys.executable, os.path.join(TOOLS, tool + '.py'), base], capture_output=True, text=True)
    sys.stdout.write(result.stdout)
    sys.stderr.write(result.stderr)
    return result.returncode == 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('manifests', nargs='*')
    ap.add_argument('--check', action='store_true', help='verify committed outputs instead of rewriting them')
    args = ap.parse_args()
    failures = 0
    for manifest in args.manifests or sorted(find_manifests()):
        base = os.path.dirname(manifest)
        spec = json.load(open(manifest))
        for artifact in spec['artifacts']:
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
        if spec.get('checks'):
            failures += not cross_check(base, spec)
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
