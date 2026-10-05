#!/usr/bin/env python3
"""Cross-check a Royal Cork Yacht Club data set against the other readings
of its marks.

The marks file takes most of the harbour's buoys from eOceanic's list of
Irish marks, kept verbatim in source/. What else there is to hold them
against:

  1. **OpenStreetMap**: the buoys were first traced from it, independently
     of eOceanic, and the manifest records each traced position. Each buoy
     must lie within the manifest's tolerance of its trace, apart from the
     differences the manifest records as expected — and one recorded as
     expected that no longer differs is itself reported, so the record
     cannot go stale.
  2. **Lateral colours**: each eOceanic row a buoy is read from must name
     the buoy's number and give a light whose colour matches it under IALA
     region A — odd green, even red — so a row taken for the wrong buoy is
     caught.
  3. **eOceanic, for the club's own positions**: the marks placed from the
     club's correspondence must lie within the manifest's tolerance of the
     row eOceanic lists them under — the nearer, where a name is printed
     twice.

    python3 tools/check_rcyc.py data/rcyc/keelboat-2026

Reads `checks` from the directory's manifest.json. Exit status 1 on any
difference, each one printed.
"""

import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from check_kyc import distance_nm  # noqa: E402
from extract_rcyc_card import eoceanic_rows  # noqa: E402


def check_osm(base, item):
    marks = {m['id']: m for m in json.load(open(os.path.join(base, item['marks'])))['marks']}
    expected = item.get('expected', {})
    problems, noted = [], []
    for id_, ref in item['positions'].items():
        mark = marks.get(id_)
        if not mark or 'position' not in mark:
            problems.append(f'{id_}: not placed in {item["marks"]}')
            continue
        d = distance_nm(mark['position'], ref)
        line = f'{id_}: {mark["position"]["lat"]:.6f}, {mark["position"]["lng"]:.6f} is {d * 1852:.0f} m from the OpenStreetMap trace {ref["lat"]:.6f}, {ref["lng"]:.6f}'
        if id_ in expected:
            if d <= item['toleranceNm']:
                problems.append(f'{id_}: recorded as a known difference, but the position and the trace now agree')
            else:
                noted.append(f'known: {line} ({expected[id_]})')
        elif d > item['toleranceNm']:
            problems.append(line)
    return f'{item["marks"]} vs OpenStreetMap traces: {len(item["positions"])} buoys', problems, noted


def check_colours(base, item, rows_by_id):
    rows = eoceanic_rows(os.path.join(base, item['buoys']))
    problems = []
    for id_, name in rows_by_id.items():
        number = re.fullmatch(r'(?:No\.|[EW])(\d+)', id_)
        if not number:
            problems.append(f'{id_}: not a numbered buoy')
            continue
        if not re.search(rf'(?<![\w.]){re.escape(id_)}(?!\d)', name):
            problems.append(f'{id_}: row {name!r} does not print the number')
        light = rows[name][0][2]
        want = 'G' if int(number.group(1)) % 2 else 'R'
        colours = set(re.findall(r'\b(?:Fl|Q)\b[\s.(\d)]*([GR])\b', light))
        if colours != {want}:
            problems.append(f'{id_}: row {name!r} gives light {light!r}, not {"green" if want == "G" else "red"}')
    return f'{item["buoys"]}: {len(rows_by_id)} rows against IALA region A', problems, []


def check_club(base, item):
    marks = {m['id']: m for m in json.load(open(os.path.join(base, item['marks'])))['marks']}
    rows = eoceanic_rows(os.path.join(base, item['buoys']))
    problems = []
    for id_, name in item['rows'].items():
        mark = marks.get(id_)
        if not mark or 'position' not in mark:
            problems.append(f'{id_}: not placed in {item["marks"]}')
            continue
        if name not in rows:
            problems.append(f'{id_}: no row {name!r} in {item["buoys"]}')
            continue
        d, (lat, lng, _) = min((distance_nm(mark['position'], {'lat': r[0], 'lng': r[1]}), r) for r in rows[name])
        if d > item['toleranceNm']:
            problems.append(f'{id_}: {mark["position"]["lat"]:.6f}, {mark["position"]["lng"]:.6f} is {d * 1852:.0f} m from eOceanic\'s {name!r} {lat:.6f}, {lng:.6f}')
    return f'{item["marks"]} vs {item["buoys"]}: {len(item["rows"])} club positions', problems, []


def main():
    base = sys.argv[1]
    manifest = json.load(open(os.path.join(base, 'manifest.json')))
    rows_by_id = next(a['buoys']['rows'] for a in manifest['artifacts'] if a.get('buoys'))
    failures = 0
    for item in manifest['checks']['items']:
        kind = item['check']
        if kind == 'osm-positions':
            heading, problems, noted = check_osm(base, item)
        elif kind == 'lateral-colours':
            heading, problems, noted = check_colours(base, item, rows_by_id)
        elif kind == 'eoceanic-positions':
            heading, problems, noted = check_club(base, item)
        else:
            sys.exit(f'unknown check {kind}')
        known = f', {len(noted)} known difference(s)' if noted else ''
        print(f'{heading}: {f"{len(problems)} DIFFERENCES" if problems else "ok"}{known}')
        for line in problems + noted:
            print('  ' + line)
        failures += bool(problems)
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
