#!/usr/bin/env python3
"""Cross-check Schull Harbour Sailing Club's Calves Week data set against
the club's other publications.

The marks file is read from the club's "Marks, Distances and Bearings"
sheet. The club also publishes, on the event's official notice board, a
chartlet whose second page captions photographs of the three navigation
marks with their positions, and a sheet of photographs of the eight laid
marks captioned the same way. This compares them:

  1. the chartlet's and the buoy sheet's captioned positions against the
     marks file — the same marks, the same positions to the minute;
  2. the bearings and distances printed on the sheet against those
     computed from its positions. The sheet says "All figures are
     approximate", and they are: the manifest sets the tolerance the table
     is held to, and lists as `expected` the pairs that miss even that,
     with what the sheet prints and what its positions give. A pair that
     comes right is reported, so the list tracks the club's corrections.

    python3 tools/check_shsc.py data/shsc/calves-week-2026

Reads `checks` from the directory's manifest.json. Exit status 1 on any
difference not recorded as expected.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from check_dbsc import bearing_deg, distance_nm  # noqa: E402
from extract_shsc import photo_positions, table  # noqa: E402


def check_captions(base, marks_file, pdf, labels):
    """`labels`: caption → mark id, as the manifest maps them."""
    marks = {m['id']: m for m in json.load(open(os.path.join(base, marks_file)))['marks']}
    captioned = photo_positions(os.path.join(base, pdf))
    problems = []
    for caption, position in captioned.items():
        id_ = labels.get(caption)
        if id_ is None:
            problems.append(f'{caption!r}: captioned on {pdf} but mapped to no mark')
            continue
        mark = marks.get(id_)
        if not mark or not mark.get('position'):
            problems.append(f'{caption!r} → {id_}: not a positioned mark of {marks_file}')
            continue
        if abs(mark['position']['lat'] - position['lat']) > 1e-6 or abs(mark['position']['lng'] - position['lng']) > 1e-6:
            problems.append(f'{caption!r} → {id_}: {pdf} {position}, sheet {mark["position"]}')
    for caption in set(labels) - set(captioned):
        problems.append(f'{caption!r}: mapped in the manifest but not captioned on {pdf}')
    return f'{pdf} captions vs {marks_file}: {len(captioned)} positions', problems, []


def check_table(base, marks_file, pdf, names, bearing_tol, distance_tol, expected):
    """`names`: the sheet's row name → mark id. `expected`: "from→to" →
    note, for pairs known to be beyond tolerance."""
    marks = {m['id']: m for m in json.load(open(os.path.join(base, marks_file)))['marks']}
    printed = table(os.path.join(base, pdf))
    problems, noted = [], []
    n, within = 0, 0
    worst = (0, 0.0)
    for a, row in printed.items():
        for b, (bearing, distance) in row.items():
            n += 1
            pa, pb = marks[names[a]]['position'], marks[names[b]]['position']
            cb, cd = bearing_deg(pa, pb), distance_nm(pa, pb)
            db = (round(cb) - bearing + 180) % 360 - 180
            dd = cd - distance
            key = f'{a}→{b}'
            line = f'{key}: printed {bearing:03d}° {distance:.2f} NM, computed {cb:05.1f}° {cd:.2f} NM'
            off = abs(db) > bearing_tol or abs(dd) > distance_tol
            if key in expected:
                if off:
                    noted.append(f'known: {line} — {expected[key]}')
                else:
                    problems.append(f'{key}: recorded as a known difference, but now within tolerance ({line})')
                continue
            if off:
                problems.append(line)
            else:
                within += 1
                worst = (max(worst[0], abs(db)), max(worst[1], abs(dd)))
    heading = (f'{pdf} bearings/distances vs {marks_file} positions: {n} pairs, {within} within {bearing_tol}° / {distance_tol} NM '
               f'(worst of those {worst[0]}° / {worst[1]:.2f} NM), {len(noted)} known beyond it')
    return heading, problems, noted


def main():
    base = sys.argv[1]
    manifest = json.load(open(os.path.join(base, 'manifest.json')))
    failures = 0
    for check in manifest['checks']['items']:
        kind = check['check']
        if kind == 'captions':
            heading, problems, noted = check_captions(base, check['marks'], check['pdf'], check['labels'])
        elif kind == 'marks-table':
            heading, problems, noted = check_table(base, check['marks'], check['pdf'], check['names'],
                                                  check['toleranceDeg'], check['toleranceNm'], check.get('expected', {}))
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
