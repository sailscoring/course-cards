#!/usr/bin/env python3
"""Cross-check a Kinsale Yacht Club data set against the club's other
publications and against the chart.

The JSON is generated from the Sovereign's Cup sailing instructions. What
else there is to hold it against — the club's 2023 bearings-and-distances
table is not among them; the data set's README says why:

  1. **OpenStreetMap's Commissioners of Irish Lights buoys**: the club's
     position for a navigation buoy it lists — Bulman, Black Tom — against
     the CIL position OpenStreetMap holds, as the manifest records it.
  2. **Fleets B and C start the same way**: the card's start line is read
     from FB 2.1; FC 2.1 must say the same thing, since the card serves
     both fleets.
  3. **The printed approximate length of every course** against the legs
     between the marks the card can place: the printed figure must exceed
     the sum of the placed legs (the legs to and from the start area, which
     the card cannot place, are what is missing) and by no more than the
     manifest allows. A misread mark letter moves a course by miles, which
     is what this catches.

    python3 tools/check_kyc.py data/kyc/sovereigns-2025

Reads `checks` from the directory's manifest.json. Exit status 1 on any
difference, each one printed.
"""

import json
import math
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract_kyc_card import section  # noqa: E402
from extract_kyc_marks import bbox_words  # noqa: E402

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


def angle_diff(a, b):
    return (a - b + 180) % 360 - 180


def check_osm(base, item):
    marks = {m['id']: m for m in json.load(open(os.path.join(base, item['marks'])))['marks']}
    problems = []
    for id_, ref in item['positions'].items():
        if id_ not in marks or 'position' not in marks[id_]:
            problems.append(f'{id_}: not placed in {item["marks"]}')
            continue
        d = distance_nm(marks[id_]['position'], {'lat': ref['lat'], 'lng': ref['lng']})
        if d > item.get('toleranceNm', 0.1):
            problems.append(f'{id_}: club {marks[id_]["position"]} is {d:.2f} NM from OSM {ref.get("node", "")} {ref["lat"]}, {ref["lng"]}')
    return f'{item["marks"]} vs OpenStreetMap CIL positions: {len(item["positions"])} marks', problems


def check_same_start(base, item):
    words = bbox_words(os.path.join(base, item['pdf']))
    texts = [' '.join(section(words, h)) for h in item['headings']]
    strip = lambda t: re.sub(r'\bC[Hh] ?\d+\b', 'CH', t)  # noqa: E731 — the fleets differ only by VHF channel
    problems = [] if len({strip(t) for t in texts}) == 1 else [f'{h}: {t}' for h, t in zip(item['headings'], texts)]
    return f'{item["pdf"]}: {" and ".join(item["headings"])} say the same', problems


def check_lengths(base, item):
    card = json.load(open(os.path.join(base, item['card'])))
    marks = {m['id']: m for m in json.load(open(os.path.join(base, item['marks'])))['marks']}
    if card.get('startLine'):
        marks[card['startLine']['id']] = card['startLine']
    problems, gaps = [], []
    for course in card['courses']:
        placed = [marks[m['mark']]['position'] for m in course['marks'] if marks[m['mark']].get('position')]
        legs = sum(distance_nm(a, b) for a, b in zip(placed, placed[1:]))
        gap = course['distanceNm'] - legs
        gaps.append(gap)
        if gap < -item.get('slackNm', 0.5) or gap > item['maxGapNm']:
            problems.append(f'{course["id"]}: printed {course["distanceNm"]:.1f} NM, placed legs {legs:.1f} NM ({len(placed)} of {len(course["marks"])} marks placed)')
    return (f'{item["card"]} printed lengths vs placed legs: {len(gaps)} courses, printed − placed from '
            f'{min(gaps):.1f} to {max(gaps):.1f} NM (allowed −{item.get("slackNm", 0.5):g} to {item["maxGapNm"]:g})'), problems


def main():
    base = sys.argv[1]
    manifest = json.load(open(os.path.join(base, 'manifest.json')))
    failures = 0
    for item in manifest['checks']['items']:
        kind = item['check']
        if kind == 'osm-positions':
            heading, problems = check_osm(base, item)
        elif kind == 'same-start-line':
            heading, problems = check_same_start(base, item)
        elif kind == 'printed-lengths':
            heading, problems = check_lengths(base, item)
        else:
            sys.exit(f'unknown check {kind}')
        print(f'{heading}: {f"{len(problems)} DIFFERENCES" if problems else "ok"}')
        for p in problems:
            print('  ' + p)
        failures += bool(problems)
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
