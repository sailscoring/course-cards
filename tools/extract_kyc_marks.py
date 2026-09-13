#!/usr/bin/env python3
"""Generate a marks file from Kinsale Yacht Club's racing marks table.

The Sovereign's Cup sailing instructions end with "KINSALE YACHT CLUB -
RACING MARKS - APPROXIMATE POSITIONS": a two-column table of the club's
lettered marks with a position each in degrees and decimal minutes
("51.41.19 N 008.29.74 W"), the odd description beside a letter ("South
Cardinal Buoy"), and Black Tom, the Courtmacsherry Bay lateral buoy the
coastal courses run out to. Under it a line says what colour the marks are.
The page is a real-text PDF, so the table is parsed from `pdftotext -bbox`
word positions: a mark's row is the baseline its letter sits on, and its
latitude and longitude are the two positions on that baseline. The club's
own 2022 course card and the 2023 Sovereign's Cup card print the same table
with an identical layout, so this reads them too.

    python3 tools/extract_kyc_marks.py <si.pdf> --meta meta.json [--amend <amendment.pdf>] [--add <marks.json>] > marks.json

`--amend` applies a sailing instructions amendment that changes the table:
"KINSALE YACHT CLUB - RACING MARKS -APPROXIMATE POSITIONS is changed as
follows:" and then a line per mark in the table's own form, "M 51.40.10 N
008.31.25 W". An amendment naming a mark the table does not list is refused.

`--add` appends marks the courses name and the table does not place — the
Sovereign islands, the Cork Buoy, the Charles Fort line — declared in the
data set's manifest with the reason and the source of any position. An id
the table already lists is refused, so the table stays the source for its
own marks.

The positions the club prints are "approximate", and the JSON carries them
as printed, to the hundredth of a minute — about 18 m — and no further.
"""

import argparse
import json
import re
import subprocess
import sys

sys.path.insert(0, __file__.rsplit('/', 1)[0])
from extract_card import FORMAT_VERSION  # noqa: E402

WORD_RE = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')
TITLE = 'RACING MARKS'
# "51.41.19" then "N"; "008.29.74" then "W". Black Tom is printed to the
# thousandth of a minute, and the hemisphere letter is sometimes run on to
# the number ("51.36.421N").
POSITION_RE = re.compile(r'^(\d{2,3})\.(\d{2})\.(\d{2,3})([NSEW])?$')
COLOURS_RE = re.compile(r'^All marks are (\w+) with the exception of (.*)$')
AMENDED_RE = re.compile(r'is changed as follows:', re.I)


def unescape(text):
    return text.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>').replace('&quot;', '"').replace('&#39;', "'")


def bbox_words(pdf):
    """Every word on every page with its box: [(page, x0, y0, x1, y1, text)]."""
    xml = subprocess.run(['pdftotext', '-bbox', pdf, '-'], check=True, capture_output=True, text=True).stdout
    out = []
    for number, page in enumerate(xml.split('<page ')[1:], 1):
        for m in WORD_RE.finditer(page):
            out.append((number, float(m.group(1)), float(m.group(2)), float(m.group(3)), float(m.group(4)), unescape(m.group(5))))
    return out


def table_page(words):
    """The page carrying the positions table, found by its title."""
    pages = sorted({w[0] for w in words if w[5] == 'APPROXIMATE' or w[5] == '-APPROXIMATE'})
    titled = [p for p in pages if any(w[0] == p and w[5] == 'POSITIONS' for w in words)]
    if len(titled) != 1:
        sys.exit(f'expected one page titled "… RACING MARKS - APPROXIMATE POSITIONS", found {len(titled)}')
    return titled[0]


def decimal(value):
    """"51.41.19" → 51.6865: degrees, minutes, and the decimal part of the
    minute, however many digits the club printed it to."""
    m = POSITION_RE.match(value)
    deg, minutes, frac = int(m.group(1)), int(m.group(2)), m.group(3)
    return round(deg + (minutes + int(frac) / 10 ** len(frac)) / 60, 6)


def rows(words, page):
    """The table's rows: the words of the page grouped by baseline — a
    letter, its description and its position are set a point or two apart —
    each row left to right as (x0, x1, text)."""
    lines = []
    for p, x0, y0, x1, y1, text in words:
        if p != page:
            continue
        for line in lines:
            if abs(line[0] - y1) <= 3.5:
                line[1].append((x0, x1, text))
                break
        else:
            lines.append([y1, [(x0, x1, text)]])
    return [sorted(ws) for _, ws in sorted(lines)]


def positions_in(row):
    """The (lat, lng) pairs in a row, each a number then its hemisphere
    letter, together or apart: [(x of the latitude, x the longitude ends at,
    position)]; and the row's other tokens, with their x."""
    pairs, rest, coords, i = [], [], [], 0
    while i < len(row):
        x0, x1, text = row[i]
        m = POSITION_RE.match(text)
        if m:
            hemi = m.group(4)
            if not hemi and i + 1 < len(row) and row[i + 1][2] in ('N', 'S', 'E', 'W'):
                hemi = row[i + 1][2]
                x1 = row[i + 1][1]
                i += 1
            if not hemi:
                sys.exit(f'position {text!r} has no hemisphere')
            value = decimal(text)
            coords.append((x0, x1, hemi, -value if hemi in ('S', 'W') else value))
        else:
            rest.append((x0, text))
        i += 1
    if len(coords) % 2:
        sys.exit(f'odd number of coordinates in row {[t for _, _, t in row]}')
    for j in range(0, len(coords), 2):
        (xa, _, h1, a), (_, xb, h2, b) = coords[j], coords[j + 1]
        if h1 not in 'NS' or h2 not in 'EW':
            sys.exit(f'coordinates out of order in row {[t for _, _, t in row]}')
        pairs.append((xa, xb, {'lat': a, 'lng': b}))
    return pairs, rest


def marks_from(words, page):
    """The table's marks in the printed order — down the left column, then
    down the right — each with its label, any description printed beside
    the label, and its position. A row holds one mark per column: the
    tokens left of a column's position are that mark's label and
    description. A label wrapped onto a second line ("Black" / "Tom") is a
    row of its own with no position, joined to the mark above it."""
    colours = None
    columns = []  # one list of marks per column
    for row in rows(words, page):
        text = ' '.join(t for _, _, t in row)
        if text.startswith('KINSALE YACHT CLUB'):
            continue
        m = COLOURS_RE.match(text)
        if m:
            colours = (m.group(1), m.group(2))
            continue
        pairs, rest = positions_in(row)
        if not pairs:
            if colours is None and columns and len(rest) == 1 and re.match(r'^[A-Z][a-z]+$', rest[0][1]):
                # The second line of a wrapped label: it belongs to the mark
                # whose label starts at the same x.
                x, fragment = rest[0]
                for column in columns:
                    if column and abs(column[-1]['x'] - x) < 2:
                        column[-1]['id'] += ' ' + fragment
                        break
                else:
                    sys.exit(f'stray word {fragment!r} in the table')
            continue
        while len(columns) < len(pairs):
            columns.append([])
        for k, (xa, _, pos) in enumerate(pairs):
            left = pairs[k - 1][1] if k else -1
            label = [(x, t) for x, t in rest if left < x < xa]
            if not label or not re.match(r'^[A-Z][a-z]*$', label[0][1]):
                sys.exit(f'row {text!r}: no label for the position {pos}')
            mark = {'id': label[0][1], 'x': label[0][0], 'position': pos}
            if len(label) > 1:
                mark['description'] = ' '.join(t for _, t in label[1:])
            columns[k].append(mark)
    if colours is None:
        sys.exit('no "All marks are … with the exception of …" line under the table')
    marks = [m for column in columns for m in column]
    for m in marks:
        del m['x']
    return marks, colours


COLOUR_WORDS = {'yellow', 'green', 'red', 'black', 'white', 'orange', 'blue'}
SHAPE_WORDS = {'buoy', 'cardinal', 'lateral', 'conical', 'spherical', 'pillar'}


def describe(marks, colours):
    """Name, shape and colour from what the table says. The line under it —
    "All marks are Yellow with the exception of mark A (Green), Bulman (South
    Cardinal) and Black Tom Mark (Green Lateral Buoy)" — gives the default
    colour and describes the exceptions; FB 4 / FC 4 of the instructions say
    the club's laid marks are yellow conical buoys with a dayglo flag, which
    is where `conical` comes from. What is printed beside a letter is either
    the mark's name ("Harbour", "Black Head", on the club's own card) or its
    shape ("South Cardinal Buoy", on the 2025 table, which names no marks) —
    a shape by its words — and the exception describing the same mark, by
    its letter, its name or the same shape, gives the rest."""
    default, exceptions = colours
    named = {}
    for exc in re.split(r',\s*|\s+and\s+', exceptions):
        m = re.match(r'^(?:mark )?(.+?)(?: Mark)? \((.+)\)$', exc.strip().rstrip('.'))
        if m:
            named[m.group(1)] = m.group(2)
    out = []
    for mark in marks:
        m = {'id': mark['id']}
        desc = mark.get('description')
        shape_words = []
        if desc and any(w.lower() in SHAPE_WORDS for w in desc.split()):
            shape_words = desc.split()
            # The exception that describes the same buoy names the mark.
            for name, value in named.items():
                if value.lower() in desc.lower():
                    m['name'] = name
        elif desc:
            m['name'] = desc[:-5] if desc.endswith(' Mark') else desc
        exception = named.get(m['id']) or named.get(m.get('name'))
        if exception and not shape_words:
            shape_words = exception.split()
        if shape_words:
            if shape_words[0].lower() in COLOUR_WORDS:
                m['color'] = shape_words[0].lower()
                shape_words = shape_words[1:]
            if shape_words:
                m['shape'] = ' '.join(shape_words).lower()
            if 'color' not in m and exception and exception.split()[0].lower() in COLOUR_WORDS:
                m['color'] = exception.split()[0].lower()
        else:
            m['shape'] = 'conical'
            m['color'] = default.lower()
        m['position'] = mark['position']
        out.append({k: m[k] for k in ('id', 'name', 'shape', 'color', 'position') if k in m})
    return out


def amendments(pdf):
    """{id: position} for every mark an amendment re-places."""
    text = subprocess.run(['pdftotext', '-layout', pdf, '-'], check=True, capture_output=True, text=True).stdout
    lines = [' '.join(l.split()) for l in text.splitlines()]
    out = {}
    active = False
    for line in lines:
        if AMENDED_RE.search(line) and 'RACING MARKS' in line:
            active = True
            continue
        if not active:
            continue
        if not line:
            continue
        row = [(i, i, t) for i, t in enumerate(line.split())]
        pairs, rest = positions_in(row)
        if not pairs:
            break  # the next amendment
        if len(rest) != 1 or len(pairs) != 1:
            sys.exit(f'amendment line {line!r} is not one mark and one position')
        out[rest[0][1]] = pairs[0][2]
    if not out:
        sys.exit(f'{pdf}: no "RACING MARKS … is changed as follows" amendment found')
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('pdf')
    ap.add_argument('--meta', help='JSON file whose keys (club, name, source) head the output')
    ap.add_argument('--amend', action='append', default=[], help='an SI amendment re-placing marks in the table')
    ap.add_argument('--add', help='JSON list of marks to append that the table does not carry')
    args = ap.parse_args()

    words = bbox_words(args.pdf)
    page = table_page(words)
    marks, colours = marks_from(words, page)
    marks = describe(marks, colours)
    ids = [m['id'] for m in marks]
    if len(set(ids)) != len(ids):
        sys.exit('duplicate mark ids in the table: ' + ', '.join(sorted({i for i in ids if ids.count(i) > 1})))
    for pdf in args.amend:
        for mark_id, position in amendments(pdf).items():
            if mark_id not in ids:
                sys.exit(f'{pdf}: amends mark {mark_id!r}, which the table does not list')
            marks[ids.index(mark_id)]['position'] = position
    if args.add:
        for extra in json.load(open(args.add)):
            if extra['id'] in ids:
                sys.exit(f'--add: mark {extra["id"]!r} is already in the table')
            marks.append(extra)
    meta = json.load(open(args.meta)) if args.meta else {}
    out = {'formatVersion': FORMAT_VERSION, **meta, 'marks': marks}
    json.dump(out, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write('\n')


if __name__ == '__main__':
    main()
