#!/usr/bin/env python3
"""Regenerate every data artifact from its source document.

Each `data/<club>/<event>/manifest.json` lists its artifacts: the output
file, the extraction tool, the source PDF (kept alongside, verbatim, with
the URL it was fetched from), the metadata that heads the output, for a card
the document its notes are read from (and, for sailing instructions, which
of its sections), and the sailing instructions its start line is defined by.
Its `documents` are the source PDFs kept for reference — the club's sailing
instructions — each rendered as a Markdown sidecar so its text is greppable.
Running this rewrites the outputs; `--check` instead fails if any committed
output differs from a fresh extraction — the CI guard that the JSON really
is what the tools read from the PDFs. A manifest's `checks` names a tool
that then cross-checks the outputs against the club's other publications, in
both modes.

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
    'extract_hyc_si_card': ['extract_hyc_si.py', 'notes'],
    'extract_dlcc_card': ['extract_dlcc_card.py', 'notes'],
}


def notes_file(base, artifact):
    tool, *flags = NOTES_TOOLS[artifact['tool']]
    if artifact.get('notesSections'):
        flags += ['--sections', ','.join(artifact['notesSections'])]
    notes = subprocess.run([sys.executable, os.path.join(TOOLS, tool)] + flags + [os.path.join(base, artifact['notesSource'])],
                           check=True, capture_output=True, text=True).stdout
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as fh:
        fh.write(notes)
    return fh.name


def start_line_file(base, artifact):
    """The card's start line, read out of the sailing instructions the
    manifest names — see tools/extract_start_line.py."""
    spec = artifact['startLine']
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as meta:
        json.dump(spec['meta'], meta)
    cmd = [sys.executable, os.path.join(TOOLS, 'extract_start_line.py'), os.path.join(base, spec['source']),
           '--clauses', ','.join(spec['clauses']), '--meta', meta.name]
    if spec.get('after'):
        cmd += ['--after', spec['after']]
    if spec.get('columns'):
        cmd += ['--columns', spec['columns']]
    try:
        start = subprocess.run(cmd, check=True, capture_output=True, text=True).stdout
    finally:
        os.unlink(meta.name)
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as fh:
        fh.write(start)
    return fh.name


def finish_file(base, artifact):
    """The card's finish, read out of the sailing instructions the manifest
    names — see tools/extract_finish.py. `via` is the marks the run in
    passes, which the instruction names and the card does not print."""
    spec = artifact['finish']
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as meta:
        json.dump(spec['meta'], meta)
    cmd = [sys.executable, os.path.join(TOOLS, 'extract_finish.py'), os.path.join(base, spec['source']),
           '--clauses', ','.join(spec['clauses']), '--meta', meta.name]
    if spec.get('after'):
        cmd += ['--after', spec['after']]
    if spec.get('columns'):
        cmd += ['--columns', spec['columns']]
    via = None
    if spec.get('via'):
        with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as fh:
            json.dump(spec['via'], fh)
            via = fh.name
        cmd += ['--via', via]
    try:
        finish = subprocess.run(cmd, check=True, capture_output=True, text=True).stdout
    finally:
        os.unlink(meta.name)
        if via:
            os.unlink(via)
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as fh:
        fh.write(finish)
    return fh.name


def added_marks_file(base, artifact):
    """Marks the manifest declares because the club's sheet does not letter
    them — see tools/extract_marks.py `--add`. The manifest carries a `why`
    beside them; the tool is given only the marks."""
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as fh:
        json.dump(artifact['addMarks']['marks'], fh)
    return fh.name


def document(base, spec):
    """A source document rendered as Markdown — see tools/pdf_markdown.py."""
    cmd = [sys.executable, os.path.join(TOOLS, 'pdf_markdown.py'), os.path.join(base, spec['source'])]
    if spec.get('title'):
        cmd += ['--title', spec['title']]
    if spec.get('columns'):
        cmd += ['--columns', spec['columns']]
    return subprocess.run(cmd, check=True, capture_output=True, text=True).stdout


def extract(base, artifact, meta_path):
    tool = artifact['tool']
    source = os.path.join(base, artifact['source'])
    if tool == 'extract_marks':
        cmd = [sys.executable, os.path.join(TOOLS, 'extract_marks.py'), source, '--meta', meta_path]
        if artifact.get('addMarks'):
            cmd += ['--add', added_marks_file(base, artifact)]
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
    elif tool == 'extract_hyc_al_card':
        cmd = [sys.executable, os.path.join(TOOLS, 'extract_hyc_al_card.py'), source, '--meta', meta_path]
    elif tool in ('extract_hyc_si_marks', 'extract_hyc_si_card'):
        cmd = [sys.executable, os.path.join(TOOLS, 'extract_hyc_si.py'), tool.rsplit('_', 1)[1], source, '--meta', meta_path]
        if artifact.get('details'):
            d = artifact['details']
            cmd += ['--details', os.path.join(base, d['source']), '--details-fields', ','.join(d.get('fields', [])),
                    '--details-positions', ','.join(d.get('positions', []))]
    elif tool == 'extract_dlcc_card':
        cmd = [sys.executable, os.path.join(TOOLS, 'extract_dlcc_card.py'), 'card', source, '--meta', meta_path,
               '--templates', os.path.join(TOOLS, 'templates', artifact['templates'])]
        if artifact.get('overrides'):
            cmd += ['--overrides', os.path.join(base, artifact['overrides'])]
    else:
        sys.exit(f'{artifact["output"]}: unknown tool {tool}')
    if artifact.get('notesSource'):
        cmd += ['--notes', notes_file(base, artifact)]
    if artifact.get('startLine'):
        cmd += ['--start-line', start_line_file(base, artifact)]
    if artifact.get('finish'):
        cmd += ['--finish', finish_file(base, artifact)]
    return subprocess.run(cmd, check=True, capture_output=True, text=True).stdout


def cross_check(base, manifest):
    """A data set's `checks`: the club's other publications against the outputs."""
    tool = manifest['checks']['tool']
    result = subprocess.run([sys.executable, os.path.join(TOOLS, tool + '.py'), base], capture_output=True, text=True)
    sys.stdout.write(result.stdout)
    sys.stderr.write(result.stderr)
    return result.returncode == 0


def write(base, output, fresh, check):
    """Rewrite an output, or in `--check` report whether it is already what a
    fresh run produces."""
    path = os.path.join(base, output)
    rel = os.path.relpath(path, ROOT)
    if check:
        current = open(path).read() if os.path.exists(path) else None
        print(f'{rel}: {"ok" if current == fresh else "DIFFERS"}')
        return current == fresh
    open(path, 'w').write(fresh)
    print(f'{rel}: written')
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('manifests', nargs='*')
    ap.add_argument('--check', action='store_true', help='verify committed outputs instead of rewriting them')
    args = ap.parse_args()
    failures = 0
    for manifest in args.manifests or sorted(find_manifests()):
        base = os.path.dirname(manifest)
        spec = json.load(open(manifest))
        for doc in spec.get('documents', []):
            try:
                failures += not write(base, doc['output'], document(base, doc), args.check)
            except subprocess.CalledProcessError as e:
                print(f'{doc["output"]}: rendering failed\n{e.stderr}', file=sys.stderr)
                failures += 1
        for artifact in spec['artifacts']:
            rel = os.path.relpath(os.path.join(base, artifact['output']), ROOT)
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
            failures += not write(base, artifact['output'], fresh, args.check)
        if spec.get('checks'):
            failures += not cross_check(base, spec)
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
