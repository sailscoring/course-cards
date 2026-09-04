#!/usr/bin/env python3
"""Generate a marks file from DBSC's "Marks, Bearings and Distances" sheet.

The sheet is a real-text PDF: one row per mark, two printed lines each —
name and latitude minutes on the first, colour and longitude minutes on the
second, the letter between them — followed by the bearing (first line) and
distance (second line) to every other mark. Positions are read from
`pdftotext -bbox` word positions; the sheet's header says what the minutes
are relative to ("Lat N 53°+", "Long W 6°+").

    python3 tools/extract_dbsc_marks.py <sheet.pdf> --meta meta.json > marks.json
    python3 tools/extract_dbsc_marks.py <sheet.pdf> --notes          # the sheet's caveats, as card notes

Marks the club publishes only in its machine-readable marks list (the start
marks at the West Pier hut, Zebra) can be appended from that CSV with
`--supplement <csv> --supplement-ids 2,3,Z`; the sheet's own marks are never
taken from the CSV. `table(pdf)` returns the printed bearing/distance table
for cross-checking the positions (tools/check_dbsc.py).
"""

import argparse
import csv
import json
import re
import subprocess
import sys

WORD_RE = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')
UNESCAPE = {'&amp;': '&', '&lt;': '<', '&gt;': '>', '&#39;': "'", '&apos;': "'", '&quot;': '"'}


def words(pdf, page=None):
    cmd = ['pdftotext', '-bbox']
    if page:
        cmd += ['-f', str(page), '-l', str(page)]
    xml = subprocess.run(cmd + [pdf, '-'], check=True, capture_output=True, text=True).stdout
    out = []
    for m in WORD_RE.finditer(xml):
        x0, y0, x1, y1 = (float(v) for v in m.groups()[:4])
        text = m.group(5)
        for k, v in UNESCAPE.items():
            text = text.replace(k, v)
        out.append({'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1, 'cx': (x0 + x1) / 2, 'cy': (y0 + y1) / 2, 'text': text})
    return out


def lines(ws, tol=2.5):
    """Group words into printed lines by baseline, each sorted left to right."""
    out = []
    for w in sorted(ws, key=lambda w: (w['cy'], w['x0'])):
        if out and abs(out[-1][-1]['cy'] - w['cy']) <= tol:
            out[-1].append(w)
        else:
            out.append([w])
    return out


def parse_sheet(ws):
    """The sheet as rows: id, name, colour, lat/long minutes, and the
    bearing and distance printed to every column letter."""
    # The header says what the minutes are relative to.
    lat_base = lng_base = None
    for w in ws:
        m = re.fullmatch(r'(\d+)°\+', w['text'])
        if m and w['cy'] < 60:
            prev = max((v for v in ws if abs(v['cy'] - w['cy']) < 4 and v['x1'] <= w['x0']), key=lambda v: v['x1'])
            if prev['text'] == 'N':
                lat_base = int(m.group(1))
            elif prev['text'] == 'W':
                lng_base = -int(m.group(1))
    if lat_base is None or lng_base is None:
        sys.exit('cannot read the sheet\'s "Lat N 53°+" / "Long W 6°+" header')
    # Column headers: the single-character mark ids on the "From" line.
    from_y = next(w['cy'] for w in ws if w['text'] == 'From')
    columns = {w['text']: w['cx'] for w in ws if abs(w['cy'] - from_y) < 4 and w['x0'] > 100 and re.fullmatch(r'[A-Z0-9]', w['text'])}
    # Row anchors: the mark id printed between its two lines.
    anchors = sorted((w for w in ws if w['cy'] > from_y + 6 and 45 < w['cx'] < 62 and re.fullmatch(r'[A-Z0-9]', w['text'])), key=lambda w: w['cy'])
    rows = []
    for a in anchors:
        upper = [w for w in ws if -9 < w['y0'] - a['y0'] < -1.5]
        lower = [w for w in ws if 2.5 < w['y0'] - a['y0'] < 10]

        def cells(line):
            mins = [w['text'] for w in line if w['x1'] < 45]
            text = ' '.join(w['text'] for w in sorted(line, key=lambda w: w['x0']) if 62 < w['x0'] < 118)
            figures = {}
            for w in line:
                if w['x0'] < 118 or w['text'] == '-':
                    continue
                col = min(columns, key=lambda c: abs(columns[c] - w['cx']))
                if abs(columns[col] - w['cx']) > 8:
                    sys.exit(f'{a["text"]}: figure {w["text"]!r} at x={w["cx"]:.0f} is under no column')
                figures[col] = w['text']
            return mins, text, figures

        lat_min, name, bearings = cells(upper)
        lng_min, colour, distances = cells(lower)
        if len(lat_min) != 1 or len(lng_min) != 1:
            sys.exit(f'{a["text"]}: expected one latitude and one longitude minutes figure, got {lat_min} {lng_min}')
        rows.append({
            'id': a['text'],
            'name': name,
            'color': colour.lower(),
            'position': {
                'lat': round(lat_base + float(lat_min[0]) / 60, 6),
                'lng': round(lng_base - float(lng_min[0]) / 60, 6),  # west
            },
            'bearings': {k: int(v) for k, v in bearings.items()},
            'distances': {k: float(v) for k, v in distances.items()},
        })
    return rows


def table(pdf):
    """{from: {to: (bearing, distanceNm)}} as printed, for every row/column pair."""
    out = {}
    for r in parse_sheet(words(pdf)):
        out[r['id']] = {k: (r['bearings'][k], r['distances'][k]) for k in r['bearings']}
    return out


def notes(ws):
    """The sheet's caveats — the free text at the top right of the page."""
    text = ' '.join(w['text'] for line in lines(w for w in ws if w['cy'] < 40 and w['x0'] > 520) for w in line)
    return [{'title': 'Marks, bearings and distances', 'text': text}]


def supplement(path, ids):
    """Marks from the club's machine-readable marks list, by id."""
    rows = {r['Letter']: r for r in csv.DictReader(open(path, newline=''))}
    out = []
    for id_ in ids:
        if id_ not in rows:
            sys.exit(f'{path}: no mark {id_}')
        r = rows[id_]
        out.append({
            'id': id_,
            'name': r['Name'],
            'position': {
                'lat': round(int(r['Lat deg']) + float(r['Lat min']) / 60, 6),
                'lng': round(int(r['Long deg']) - float(r['Long min']) / 60, 6),
            },
        })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pdf')
    ap.add_argument('--meta', help='JSON file whose keys (club, name, source…) head the output')
    ap.add_argument('--notes', action='store_true', help="print the sheet's caveats as card notes instead")
    ap.add_argument('--supplement', help="the club's machine-readable marks CSV")
    ap.add_argument('--supplement-ids', default='', help='comma-separated ids to take from the CSV')
    args = ap.parse_args()
    ws = words(args.pdf)
    if args.notes:
        json.dump(notes(ws), sys.stdout, indent=2, ensure_ascii=False)
        sys.stdout.write('\n')
        return
    meta = json.load(open(args.meta)) if args.meta else {}
    marks = [{k: r[k] for k in ('id', 'name', 'color', 'position')} for r in parse_sheet(ws)]
    if not marks:
        sys.exit('no marks found')
    if args.supplement_ids:
        if not args.supplement:
            sys.exit('--supplement-ids needs --supplement')
        ids = args.supplement_ids.split(',')
        for m in marks:
            if m['id'] in ids:
                sys.exit(f'{m["id"]} is on the sheet; take it from there')
        marks += supplement(args.supplement, ids)
    out = {'formatVersion': 1, **meta, 'marks': marks}
    json.dump(out, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write('\n')


if __name__ == '__main__':
    main()
