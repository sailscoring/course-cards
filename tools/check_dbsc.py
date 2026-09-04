#!/usr/bin/env python3
"""Cross-check a DBSC data set against everything else the club publishes.

The JSON is generated from the club's PDFs, which the club says are the
official documents. The club also publishes a machine-readable zip — CSV
course cards, a CSV marks list and a GPX file — with a warning that they
are untested and the PDFs win. This compares them:

  1. every course on every card's CSV against the JSON read from the PDF:
     same courses, same marks, same sides;
  2. the marks CSV and GPX against the marks JSON: same ids, names and
     positions (to the CSV's own rounding);
  3. the bearings and distances printed on the marks sheet against those
     computed from the positions — including the "Green 3" column, which
     is the only place the sheet gives that start mark.

    python3 tools/check_dbsc.py data/dbsc/summer-2026

Reads `checks` from the directory's manifest.json. Exit status 1 on any
difference, each one printed — except a difference the manifest records as
`expected` on a card check, which is printed as known; if that one ever
disappears (the club corrects a document), that is reported instead.
"""

import csv
import json
import math
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract_dbsc_marks import table  # noqa: E402

EARTH_RADIUS_NM = 3440.065


def distance_nm(a, b):
    φ1, φ2 = math.radians(a['lat']), math.radians(b['lat'])
    dφ, dλ = φ2 - φ1, math.radians(b['lng'] - a['lng'])
    h = math.sin(dφ / 2) ** 2 + math.cos(φ1) * math.cos(φ2) * math.sin(dλ / 2) ** 2
    return 2 * EARTH_RADIUS_NM * math.asin(math.sqrt(h))


def bearing_deg(a, b):
    φ1, φ2 = math.radians(a['lat']), math.radians(b['lat'])
    dλ = math.radians(b['lng'] - a['lng'])
    y = math.sin(dλ) * math.cos(φ2)
    x = math.cos(φ1) * math.sin(φ2) - math.sin(φ1) * math.cos(φ2) * math.cos(dλ)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def check_card(base, card_file, csv_file, expected=()):
    """`expected`: differences already known and recorded in the manifest —
    reported, but not failures; one that has gone away is."""
    card = json.load(open(os.path.join(base, card_file)))
    ours = {c['id']: ''.join(m['mark'] + m['side'][0] for m in c['marks']) for c in card['courses']}
    theirs = {}
    with open(os.path.join(base, csv_file), newline='') as fh:
        reader = csv.reader(fh)
        header = next(reader)
        assert header[0] == 'Course' and header[1] == 'Mark and Side x 10', header
        for row in reader:
            marks = [c for c in row[1:11] if c]
            if marks:
                theirs[row[0]] = ''.join(marks)
    known = {e['course']: e for e in expected}
    problems, noted = [], []
    for id_ in sorted(set(ours) | set(theirs)):
        if id_ not in theirs:
            problems.append(f'{id_}: on the PDF ({ours[id_]}) but not in the CSV')
        elif id_ not in ours:
            problems.append(f'{id_}: in the CSV ({theirs[id_]}) but not on the PDF')
        elif ours[id_] != theirs[id_]:
            e = known.get(id_)
            if e and e['pdf'] == ours[id_] and e['csv'] == theirs[id_]:
                noted.append(f'{id_}: PDF {ours[id_]} / CSV {theirs[id_]} — known: {e["note"]}')
            else:
                problems.append(f'{id_}: PDF {ours[id_]} / CSV {theirs[id_]}')
        elif id_ in known:
            problems.append(f'{id_}: the manifest expects a difference here but PDF and CSV agree ({ours[id_]})')
    return f'{card_file} vs {csv_file}: {len(ours)} courses', problems, noted


def check_marks(base, marks_file, csv_file, gpx_file):
    marks = {m['id']: m for m in json.load(open(os.path.join(base, marks_file)))['marks']}
    problems = []
    rows = {r['Letter']: r for r in csv.DictReader(open(os.path.join(base, csv_file), newline=''))}
    for id_ in sorted(set(marks) | set(rows)):
        if id_ not in rows:
            problems.append(f'{id_}: in the JSON but not in the CSV')
            continue
        if id_ not in marks:
            problems.append(f'{id_}: in the CSV but not in the JSON')
            continue
        r, m = rows[id_], marks[id_]
        if r['Name'] != m['name']:
            problems.append(f'{id_}: name {m["name"]!r} / CSV {r["Name"]!r}')
        lat = int(r['Lat deg']) + float(r['Lat min']) / 60
        lng = int(r['Long deg']) - float(r['Long min']) / 60
        if abs(lat - m['position']['lat']) > 1e-6 or abs(lng - m['position']['lng']) > 1e-6:
            problems.append(f'{id_}: position {m["position"]} / CSV {lat:.6f} {lng:.6f}')
        # The CSV's own decimal-degree columns, to their 5 places.
        if abs(float(r['Lat deg.']) - lat) > 6e-6 or abs(float(r[' Long deg.']) - lng) > 6e-6:
            problems.append(f'{id_}: CSV decimal columns {r["Lat deg."]} {r[" Long deg."]} disagree with its own minutes')
    gpx = re.findall(r'<wpt lat="([-\d.]+)" lon="([-\d.]+)">.*?<name>(\S+) (.*?)</name>', open(os.path.join(base, gpx_file)).read())
    seen = set()
    for lat, lng, id_, name in gpx:
        seen.add(id_)
        m = marks.get(id_)
        if not m:
            problems.append(f'{id_}: in the GPX but not in the JSON')
        elif name != m['name'] or abs(float(lat) - m['position']['lat']) > 6e-6 or abs(float(lng) - m['position']['lng']) > 6e-6:
            problems.append(f'{id_}: GPX {name} {lat} {lng} / JSON {m["name"]} {m["position"]}')
    for id_ in sorted(set(marks) - seen):
        problems.append(f'{id_}: in the JSON but not in the GPX')
    return f'{marks_file} vs {csv_file}, {gpx_file}: {len(marks)} marks', problems, []


def check_table(base, marks_file, pdf, bearing_tol=1, distance_tol=0.01):
    marks = {m['id']: m for m in json.load(open(os.path.join(base, marks_file)))['marks']}
    printed = table(os.path.join(base, pdf))
    problems = []
    n = 0
    worst = (0, 0)
    for a, row in printed.items():
        for b, (bearing, distance) in row.items():
            n += 1
            pa, pb = marks[a]['position'], marks[b]['position']
            db = (round(bearing_deg(pa, pb)) - bearing + 180) % 360 - 180
            dd = distance_nm(pa, pb) - distance
            worst = (max(worst[0], abs(db)), max(worst[1], abs(dd)))
            if abs(db) > bearing_tol or abs(dd) > distance_tol + 0.005:
                problems.append(f'{a}→{b}: printed {bearing:03d}° {distance:.2f} NM, computed {bearing_deg(pa, pb):05.1f}° {distance_nm(pa, pb):.3f} NM')
    return f'{pdf} bearings/distances vs {marks_file} positions: {n} pairs, worst {worst[0]}° / {worst[1]:.3f} NM', problems, []


def main():
    base = sys.argv[1]
    manifest = json.load(open(os.path.join(base, 'manifest.json')))
    failures = 0
    for check in manifest['checks']['items']:
        kind = check['check']
        if kind == 'card-csv':
            heading, problems, noted = check_card(base, check['card'], check['csv'], check.get('expected', ()))
        elif kind == 'marks-csv':
            heading, problems, noted = check_marks(base, check['marks'], check['csv'], check['gpx'])
        elif kind == 'marks-table':
            heading, problems, noted = check_table(base, check['marks'], check['pdf'])
        else:
            sys.exit(f'unknown check {kind}')
        status = f'{len(problems)} DIFFERENCES' if problems else f'ok, {len(noted)} known difference(s)' if noted else 'ok'
        print(f'{heading}: {status}')
        for p in noted + problems:
            print('  ' + p)
        failures += bool(problems)
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
