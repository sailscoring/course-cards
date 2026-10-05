#!/usr/bin/env python3
"""Test a routing overlay's straight lines against INFOMAR bathymetry, at
the positions this data set carries.

A routing overlay's verdicts hold for the positions they were tested at;
when the marks file carries a mark somewhere else, its lines have to be
tested again there. This does that with the overlay contributor's own
method, so the new evidence is comparable with the old: Pat Tanner's
`scripts/geo.py` from github.com/Bateleur88/cork-harbour-orc (MIT), which
samples each line every 5 m on the UTM 29N grid against INFOMAR's 2 m
grids, deepest-priority first, and passes it with at least 1.5 m below
chart datum throughout.

It tests every physical line of the overlay with an end at one of
`--marks`: the direct pairs, and the legs of each passage. Marks are where
the marks file has them; waypoints, and marks with no position there,
where the overlay has them.

    python3 tools/check_depth.py data/rcyc/keelboat-2026 --orc ../cork-harbour-orc \\
        --rasters ~/infomar --order GEO12_04,KRY12_05,CB12_01 --marks Cage

Needs numpy and tifffile, and the INFOMAR GeoTIFFs (Contains Irish Public
Sector Data (Geological Survey Ireland & Marine Institute) licensed under
CC BY 4.0), which are not in this repository: they are 1.8 GB for Cork
Harbour, unzipped, from the Geological Survey's survey-leg downloads —

    https://gsi.geodata.gov.ie/downloads/Marine/Data/Downloads/2012/<id>/BY_<id>_CorkHarbour_2m_U29N_LAT_TIFF_Inshore_Ireland.zip

for <id> GEO12_04, KRY12_05 and CB12_01. Before trusting a run, test the
workbook's own validation case with Pat's `scripts/test_chords.py`:
Dosco > RW_Fort_Davis is 641.3 m, 130/130 samples, minimum 2.875 m.
Prints one line per line tested, and the evidence for each.
"""

import argparse
import glob
import json
import os
import sys


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('dataset')
    ap.add_argument('--orc', required=True, help="a checkout of Pat Tanner's cork-harbour-orc")
    ap.add_argument('--rasters', required=True, help='a directory holding the INFOMAR GeoTIFFs')
    ap.add_argument('--order', required=True, help='survey ids, comma-separated, in priority order')
    ap.add_argument('--marks', required=True, help='comma-separated mark ids whose lines to test')
    ap.add_argument('--spacing', type=float, default=5.0)
    ap.add_argument('--criterion', type=float, default=1.5)
    args = ap.parse_args()

    sys.path.insert(0, os.path.join(args.orc, 'scripts'))
    from geo import Raster, chord_result  # noqa: E402

    routing = json.load(open(os.path.join(args.dataset, 'routing.json')))
    marks = {m['id']: m for m in json.load(open(os.path.join(args.dataset, routing['marks'])))['marks']}
    where = {}
    for w in routing['waypoints']:
        where[w['id']] = (w['position']['lat'], w['position']['lng'])
    for a in routing['assumed']:
        if 'position' not in a:
            continue
        mark = marks.get(a['mark'])
        p = mark['position'] if mark and mark.get('position') else a['position']
        where[a.get('id', a['mark'])] = (p['lat'], p['lng'])

    tifs = sorted(glob.glob(os.path.join(os.path.expanduser(args.rasters), '**', '*.tif'), recursive=True))
    rasters = []
    for survey in args.order.split(','):
        found = [t for t in tifs if survey in os.path.basename(t)]
        if not found:
            sys.exit(f'no GeoTIFF for {survey} under {args.rasters}')
        rasters.append((survey, Raster(found[0])))

    wanted = set(args.marks.split(','))
    lines = set()
    for d in routing['direct']:
        lines.add(tuple(sorted((d['from'], d['to']))))
    for p in routing['passages']:
        route = [p['from'], *p['via'], p['to']]
        for a, b in zip(route, route[1:]):
            lines.add(tuple(sorted((a, b))))
    lines = sorted(l for l in lines if wanted & set(l))

    failed = 0
    for a, b in lines:
        r = chord_result(rasters, a, b, where, spacing=args.spacing, criterion=args.criterion)
        sources = '; '.join(f'{k} ({v})' for k, v in sorted(r['sources'].items(), key=lambda kv: -kv[1]))
        gap = f'; largest unsurveyed run {r["max_gap_m"]} m' if r['max_gap_samples'] else ''
        print(f'{a} – {b}: {r["verdict"]}, {r["length_m"]:,.1f} m, {r["covered"]}/{r["samples"]} samples '
              f'({sources}), minimum {r["min_depth_m"]} m below chart datum, '
              f'{r["below_criterion"]} below {r["criterion_m"]} m{gap}')
        failed += r['verdict'] not in ('PASS', 'PASS - INCOMPLETE COVERAGE') or bool(r['below_criterion'])
    print(f'{len(lines)} lines, {failed} failing')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
