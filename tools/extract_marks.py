#!/usr/bin/env python3
"""Generate a marks file from HYC's course card technical sheet.

The technical sheet is a real-text PDF: the "Racing Marks" table is parsed
from `pdftotext -bbox` word positions (column by x, row by the mark-letter's
baseline), so the JSON is a faithful, repeatable reading of the PDF.

    python3 tools/extract_marks.py <technical-sheet.pdf> --meta meta.json > marks.json

Marks whose position column holds prose rather than coordinates ("Upwind of
Start Line") are emitted with a `placement` note and no `position`: they are
laid per race and the caller of the leg library supplies where.

The sheet's explanatory text — "Navigation Marks and Obstructions" down the
left, "Course Selection" under the marks table — is carried as `notes`.
"""

import argparse
import json
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

WORD_RE = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')

# Column x-ranges (PDF points) of the Racing Marks table on the sheet.
COLUMNS = {
    'id': (315, 332),
    'name': (335, 392),
    'shape': (392, 432),
    'color': (432, 468),
    'pos': (468, 566),  # lat + lng, or prose spanning both ("Upwind of Start Line")
}


def words(pdf):
    xml = subprocess.run(['pdftotext', '-bbox', pdf, '-'], check=True, capture_output=True, text=True).stdout
    out = []
    for m in WORD_RE.finditer(xml):
        x0, y0, x1, y1 = (float(v) for v in m.groups()[:4])
        text = m.group(5)
        text = text.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>').replace('&#39;', "'").replace('&quot;', '"')
        out.append({'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1, 'cy': (y0 + y1) / 2, 'text': text})
    return out


def column_of(w):
    cx = (w['x0'] + w['x1']) / 2
    for name, (lo, hi) in COLUMNS.items():
        if lo <= cx < hi:
            return name
    return None


def parse_table(ws):
    # The table runs from below its header to the "Course Selection" heading;
    # the bearings table further down reuses the mark letters as row labels.
    header = min(w['cy'] for w in ws if w['text'] == 'Colour')
    footer = min(w['cy'] for w in ws if w['text'] == 'Selection')
    ws = [w for w in ws if header + 4 < w['cy'] < footer]
    # Row anchors: single capital letters in the id column.
    anchors = sorted(
        (w for w in ws if column_of(w) == 'id' and re.fullmatch(r'[A-Z]', w['text'])),
        key=lambda w: w['cy'],
    )
    rows = []
    for a in anchors:
        row = {'id': a['text'], 'cy': a['cy'], 'name': [], 'shape': [], 'color': [], 'pos': []}
        rows.append(row)
    # Assign every other table word to the nearest anchor row (within a row's height).
    for w in ws:
        col = column_of(w)
        if col is None or col == 'id':
            continue
        nearest = min(rows, key=lambda r: abs(r['cy'] - w['cy']))
        if abs(nearest['cy'] - w['cy']) > 9:
            continue
        nearest[col].append(w)
    marks = []
    for r in rows:
        if not r['name']:
            continue  # a stray letter (the header's own "I D" label) is not a mark
        def joined(key):
            # Words in reading order: by line (y), then x. Wrapped fragments
            # ("Orang" / "e", "Portmarnoc" / "k") are rejoined without a space
            # when the continuation is a lowercase fragment on the next line.
            items = sorted(r[key], key=lambda w: (round(w['cy']), w['x0']))
            text = ''
            last_cy = None
            for w in items:
                if not text:
                    text = w['text']
                elif last_cy is not None and w['cy'] > last_cy + 4 and re.fullmatch(r'[a-z]{1,2}', w['text']):
                    text += w['text']
                else:
                    text += ' ' + w['text']
                last_cy = w['cy']
            return text
        pos_words = sorted(r['pos'], key=lambda w: (round(w['cy']), w['x0']))
        nums = [w['text'] for w in pos_words]
        mark = {'id': r['id'], 'name': joined('name'), 'shape': joined('shape').lower(), 'color': joined('color').lower()}
        if len(nums) == 4 and all(re.fullmatch(r'\d+(\.\d+)?', n) for n in nums):
            lat = int(nums[0]) + float(nums[1]) / 60
            lng = -(int(nums[2]) + float(nums[3]) / 60)  # the sheet's longitudes are West
            mark['position'] = {'lat': round(lat, 6), 'lng': round(lng, 6)}
        else:
            mark['placement'] = joined('pos')
        marks.append(mark)
    return marks


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
    ap = argparse.ArgumentParser()
    ap.add_argument('pdf')
    ap.add_argument('--meta', help='JSON file whose keys (club, name, source…) head the output')
    args = ap.parse_args()
    meta = json.load(open(args.meta)) if args.meta else {}
    ws = words(args.pdf)
    marks = parse_table(ws)
    if not marks:
        sys.exit('no marks found')
    out = {'formatVersion': 1, **meta, 'notes': parse_notes(args.pdf, ws), 'marks': marks}
    json.dump(out, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write('\n')


if __name__ == '__main__':
    main()
