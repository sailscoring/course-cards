#!/usr/bin/env python3
"""Generate Schull Harbour Sailing Club's Calves Week marks file and card.

The club publishes for Calves Week a **Marks, Distances and Bearings**
sheet in the same style as DBSC's: a real-text PDF with a row per mark on
two printed lines — latitude minutes and a first line of description, then
longitude minutes and a second line, the mark's name between them — and
the bearing (first line) and distance (second) to every other mark under
column headings. Its header says what the minutes are relative to ("Lat N
51°+", "Long W 9°+"). Three rows carry no position: "Start" and "Finish",
which are the lines the sailing instructions define and the card carries
from them, and "Weather Mark", laid on the day, which becomes the one mark
with a `placement` and no position.

The sheet names its marks; the club's **chartlet** letters them ("A -
Amelia Buoy", … "WC - West Calf Island") in an index read from its text
layer, and those letters are the ids, matched to the sheet by name. The
eight laid marks are numbered 1–8 on both, and the weather mark — the
sheet heads its column "W'Wrd" — is W.

    python3 tools/extract_shsc.py marks <sheet.pdf> --chartlet <chartlet.pdf> --meta meta.json [--add marks.json] > marks.json
    python3 tools/extract_shsc.py card <sheet.pdf> --meta meta.json [--notes n.json] [--start-line s.json] [--finish f.json] > card.json
    python3 tools/extract_shsc.py notes <si.md> --sections 9,10,11         # sections of the instructions as notes

The card has no courses: SI 10.1 has the race committee set them on the
day from the fixed marks, the islands and the Fastnet Rock, and display
them on the committee boat. `card` therefore writes the start line, the
finish and the notes over an empty course list, and the sheet's own caveats
as the last note. `--add` appends marks the sheet does not list — the
Fastnet Rock — from the manifest. `table(pdf)` returns the printed bearing
and distance table for cross-checking the positions (tools/check_shsc.py).
"""

import argparse
import json
import re
import subprocess
import sys

sys.path.insert(0, __file__.rsplit('/', 1)[0])
from extract_card import course_card_file, emit  # noqa: E402
from extract_dbsc_marks import lines, words  # noqa: E402

FIGURE_RE = re.compile(r'^(?:\d{1,3}|\d+\.\d+)$')
INDEX_RE = re.compile(r'^([A-Z]{1,2}) - (.+?)\s*$')
POSITION_RE = re.compile(r'(\d{3})deg\s*(\d{2}\.\d{2})’N\s+(\d{3})\s*deg\s*(\d{2}\.\d{2})’W')


def header_bases(ws):
    """What the minutes are relative to: the "Lat N 51°+" / "Long W 9°+"
    header, set as separate words ("N", "51", "o", "+")."""
    bases = {}
    for hemi in 'NW':
        for w in ws:
            if w['text'] == hemi and w['cy'] < 170:
                right = min((v for v in ws if abs(v['cy'] - w['cy']) < 4 and v['x0'] >= w['x1']), key=lambda v: v['x0'])
                if right['text'].isdigit():
                    bases[hemi] = int(right['text'])
    if set(bases) != {'N', 'W'}:
        sys.exit('cannot read the sheet\'s "Lat N 51°+" / "Long W 9°+" header')
    return bases['N'], -bases['W']


def columns(ws):
    """The column headings — "Start", "W'Wrd", "Amelia", … "8", "Finish" —
    with the x of each: the words on the "Start" line right of the
    position column, run together where set close."""
    start = next(w for w in ws if w['text'] == 'Start' and w['x0'] > 150)
    row = sorted((w for w in ws if abs(w['cy'] - start['cy']) < 4 and w['x0'] > 150), key=lambda w: w['x0'])
    out = []
    for w in row:
        if out and w['x0'] - out[-1]['x1'] < 6:
            out[-1] = {'text': out[-1]['text'] + ' ' + w['text'], 'x0': out[-1]['x0'], 'x1': w['x1']}
        else:
            out.append({'text': w['text'], 'x0': w['x0'], 'x1': w['x1']})
    return {c['text']: (c['x0'] + c['x1']) / 2 for c in out}, start['cy']


def parse_sheet(ws):
    """The sheet as rows: name, the two description lines, lat/long minutes
    where the row has them, and the bearing and distance printed to every
    column."""
    lat_base, lng_base = header_bases(ws)
    cols, head_y = columns(ws)
    first_col = min(cols.values())
    # Row anchors: the names, on their own line between the two printed lines.
    # The minutes are left of x=55, so a digit here is a laid mark's number.
    names = [w for w in ws if w['cy'] > head_y + 6 and 55 < w['x0'] < 110]
    rows = []
    for anchor in lines(names, tol=3):
        y = anchor[0]['cy']
        name = ' '.join(w['text'] for w in sorted(anchor, key=lambda w: w['x0']))
        upper = [w for w in ws if -8 < w['cy'] - y < -1.5]
        lower = [w for w in ws if 2 < w['cy'] - y < 9]

        def cells(line):
            mins = [w['text'] for w in line if w['x1'] < 55]
            text = ' '.join(w['text'] for w in sorted(line, key=lambda w: w['x0']) if 110 <= w['x0'] < first_col - 10)
            figures = {}
            for w in line:
                if w['x0'] < first_col - 10 or w['text'] in ('-', '_', 'o'):
                    continue
                if not FIGURE_RE.match(w['text']):
                    sys.exit(f'{name}: {w["text"]!r} at x={w["cx"]:.0f} is not a figure')
                col = min(cols, key=lambda c: abs(cols[c] - w['cx']))
                if abs(cols[col] - w['cx']) > 10:
                    sys.exit(f'{name}: figure {w["text"]!r} at x={w["cx"]:.0f} is under no column')
                figures[col] = w['text']
            return mins, text, figures

        lat_min, line1, bearings = cells(upper)
        lng_min, line2, distances = cells(lower)
        row = {'name': name, 'line1': line1, 'line2': line2,
               'bearings': {k: int(v) for k, v in bearings.items()},
               'distances': {k: float(v) for k, v in distances.items()}}
        if lat_min or lng_min:
            if len(lat_min) != 1 or len(lng_min) != 1:
                sys.exit(f'{name}: expected one latitude and one longitude minutes figure, got {lat_min} {lng_min}')
            row['position'] = {'lat': round(lat_base + float(lat_min[0]) / 60, 6),
                               'lng': round(lng_base - float(lng_min[0]) / 60, 6)}  # west
        elif bearings or distances:
            sys.exit(f'{name}: figures printed for a row with no position')
        rows.append(row)
    if not rows:
        sys.exit('no rows found')
    return rows


def caveats(ws):
    """The sheet's caveats — the text at the top right, one sentence a line."""
    out = []
    for line in lines(w for w in ws if w['cy'] < 170 and w['x0'] > 430):
        text = ' '.join(w['text'] for w in line)
        out.append(text if text.endswith('.') else text + '.')
    return ' '.join(out)


def chartlet_index(pdf):
    """The chartlet's index, letter → name: "A - Amelia Buoy"."""
    text = subprocess.run(['pdftotext', pdf, '-'], check=True, capture_output=True, text=True).stdout
    index = {}
    for line in text.split('\n'):
        m = INDEX_RE.match(line.strip())
        if m:
            index[m.group(1)] = m.group(2)
    if not index:
        sys.exit(f'{pdf}: no index lines ("A - Amelia Buoy") found')
    return index


def photo_positions(pdf):
    """Positions printed under photographs — the chartlet's "AMELIA BUOY …
    051deg 30.00’N 009 deg 31.43’W" and the buoy sheet's "Mark 1 - 051deg
    30.43’N 009deg 31.73’W" — as {label: position}, for cross-checking."""
    text = subprocess.run(['pdftotext', '-layout', pdf, '-'], check=True, capture_output=True, text=True).stdout
    out = {}
    pending = []
    for line in text.split('\n'):
        found = list(POSITION_RE.finditer(line))
        if not found:
            labels = [l.strip() for l in re.split(r' {3,}', line.strip()) if l.strip()]
            if labels and all(re.fullmatch(r'[A-Z/ ]+', l) for l in labels):
                pending = labels
            continue
        for k, m in enumerate(found):
            before = line[:m.start()].rstrip()
            label = re.search(r'(Mark \d+) -\s*$', before)
            key = label.group(1) if label else (pending[k] if k < len(pending) else None)
            if key is None:
                sys.exit(f'{pdf}: position {m.group(0)!r} under no label')
            out[key] = {'lat': round(int(m.group(1)) + float(m.group(2)) / 60, 6),
                        'lng': round(-(int(m.group(3)) + float(m.group(4)) / 60), 6)}
        pending = []
    if not out:
        sys.exit(f'{pdf}: no positions found')
    return out


def table(pdf):
    """{from: {to: (bearing, distanceNm)}} as printed, by row name."""
    out = {}
    for r in parse_sheet(words(pdf)):
        if 'position' in r:
            out[r['name']] = {k: (r['bearings'][k], r['distances'][k]) for k in r['bearings']}
    return out


def mark_of(row, index):
    """A sheet row as a mark of the format."""
    name = row['name']
    if name in ('Start', 'Finish'):
        return None  # the lines the sailing instructions define; the card carries them
    if name == 'Weather Mark':
        return {'id': 'W', 'name': name, 'color': row['line2'].strip('()').lower(),
                'placement': 'Laid on the day as the weather mark; the sheet lists it with no position.'}
    mark = {}
    if name.isdigit():
        # "1" over "(Castle Grounds)" / "Red Conical": the number is the id,
        # the place the club lays it its name.
        mark['id'] = name
        mark['name'] = row['line1'].strip('()')
        mark['color'] = row['line2'].lower()
    else:
        letters = [k for k, v in index.items() if v == name or v.startswith(name + ' ')]
        if len(letters) != 1:
            sys.exit(f'{name}: the chartlet indexes it as {letters or "nothing"}')
        mark['id'] = letters[0]
        mark['name'] = name
        if row['line1']:
            mark['shape'] = row['line1'].lower()
        if row['line2']:
            mark['color'] = row['line2'].lower()
    mark['position'] = row['position']
    return mark


def cmd_marks(args):
    meta = json.load(open(args.meta)) if args.meta else {}
    index = chartlet_index(args.chartlet)
    marks = [m for m in (mark_of(r, index) for r in parse_sheet(words(args.pdf))) if m]
    if args.add:
        for extra in json.load(open(args.add)):
            if any(m['id'] == extra['id'] for m in marks):
                sys.exit(f'{extra["id"]} is on the sheet; take it from there')
            marks.append(extra)
    ids = [m['id'] for m in marks]
    if len(set(ids)) != len(ids):
        sys.exit(f'duplicate ids: {ids}')
    json.dump({'formatVersion': 2, **meta, 'marks': marks}, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write('\n')


def cmd_card(args):
    meta = json.load(open(args.meta)) if args.meta else {}
    notes = json.load(open(args.notes)) if args.notes else []
    notes.append({'title': 'Marks, distances and bearings', 'text': caveats(words(args.pdf))})
    start = json.load(open(args.start_line)) if args.start_line else None
    finish = json.load(open(args.finish)) if args.finish else None
    emit(course_card_file(meta, start, notes, [], finish), sys.stdout)


def cmd_notes(args):
    """Whole sections of the instructions as notes — "## 9 RACING AREA" and
    the clauses under it, one note per section, titled as the instructions
    head it."""
    from pdf_markdown import parts
    items = parts(args.source)
    wanted = args.sections.split(',')
    notes = []
    for number in wanted:
        for i, part in enumerate(items):
            if part.startswith('## ') and part[3:].split(' ', 1)[0] == number:
                body = []
                for rest in items[i + 1:]:
                    if rest.startswith('## '):
                        break
                    body.append(rest)
                title = part[3:].split(' ', 1)[1]
                notes.append({'title': title[0] + title[1:].lower(), 'text': '\n'.join(body)})
                break
        else:
            sys.exit(f'no section {number} in {args.source}')
    json.dump(notes, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write('\n')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    m = sub.add_parser('marks')
    m.add_argument('pdf', help='the marks, distances and bearings sheet')
    m.add_argument('--chartlet', required=True, help="the club's chartlet, whose index letters the marks")
    m.add_argument('--add', help='JSON list of marks the sheet does not list')
    m.add_argument('--meta')
    m.set_defaults(func=cmd_marks)
    c = sub.add_parser('card')
    c.add_argument('pdf', help='the sheet, for its caveats')
    c.add_argument('--meta')
    c.add_argument('--notes')
    c.add_argument('--start-line')
    c.add_argument('--finish')
    c.set_defaults(func=cmd_card)
    n = sub.add_parser('notes')
    n.add_argument('source', help='the sailing instructions, or their transcript')
    n.add_argument('--sections', required=True, help='comma-separated section numbers')
    n.set_defaults(func=cmd_notes)
    args = ap.parse_args()
    args.func(args)


if __name__ == '__main__':
    main()
