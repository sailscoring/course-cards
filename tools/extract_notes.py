#!/usr/bin/env python3
"""Read the explanatory notes off HYC's course card technical sheet — the
"Navigation Marks and Obstructions" passage down the left and "Course
Selection" under the marks table — as a JSON list of {title, text}, text
paragraphs newline-separated. The notes belong to the course cards, so each
card artifact names this sheet as its notes source and gets a copy.

    python3 tools/extract_notes.py <technical-sheet.pdf> > notes.json
"""

import json
import subprocess
import sys

from extract_marks import words


def layout_text(pdf, x, y, w, h):
    """pdftotext -layout over one region of the page (points)."""
    return subprocess.run(
        ['pdftotext', '-layout', '-x', str(x), '-y', str(y), '-W', str(w), '-H', str(h), pdf, '-'],
        check=True, capture_output=True, text=True,
    ).stdout


def paragraphs(lines):
    """Rejoin wrapped lines: a paragraph starts after a blank line or on a line
    opening with a capital or a digit; a line opening in lowercase continues."""
    out = []
    for raw in lines:
        line = ' '.join(raw.split())
        if not line:
            out.append(None)
        elif out and out[-1] is not None and line[0].islower():
            out[-1] += ' ' + line
        else:
            out.append(line)
    return [p for p in out if p]


def parse_notes(pdf, ws):
    notes = []
    # Left column: heading then prose, from the top of the page to the bearings table.
    bearings_y = min(w['cy'] for w in ws if w['text'] == 'Relative')
    left = layout_text(pdf, 0, 0, 300, int(bearings_y) - 4).split('\n')
    paras = paragraphs(left)
    if paras:
        notes.append({'title': paras[0].title().replace(' And ', ' and '), 'text': '\n'.join(paras[1:])})
    # Right column: between the "Course Selection" heading and the bearings
    # table's own "Racing Marks" title.
    heading = next(w for w in ws if w['text'] == 'Selection')
    table_title_y = min(w['cy'] for w in ws if w['text'] == 'Racing' and w['cy'] > heading['cy'])
    right = layout_text(pdf, 300, int(heading['y1']) + 1, 300, int(table_title_y) - int(heading['y1']) - 8).split('\n')
    paras = paragraphs(right)
    if paras:
        notes.append({'title': 'Course Selection', 'text': '\n'.join(paras)})
    return notes


def main():
    pdf = sys.argv[1]
    json.dump(parse_notes(pdf, words(pdf)), sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write('\n')


if __name__ == '__main__':
    main()
