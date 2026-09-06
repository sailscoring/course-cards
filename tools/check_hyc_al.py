#!/usr/bin/env python3
"""Cross-check an HYC Autumn League data set: the length the card prints
against the length its own marks and its own conventions give.

The card prints a distance beside every course, and that distance is
computed, not measured — so it can be recomputed, and a course whose marks
and whose distance disagree is one or the other typed wrong. The conventions
are the card's, and the manifest carries them per card in `model`:

  * the first leg is the beat to the windward mark Z, laid a fixed distance
    straight-line to windward of the start line (`firstBeatNm`), sailed at
    the beating factor;
  * the second leg, Z to the first fixed mark, is taken at an average
    (`secondLegNm`), since where Z was laid decides it;
  * every leg between fixed marks is the great-circle distance, lengthened
    by `upwindFactor` when its bearing is within `upwindWindowDeg` of the
    wind direction the card heads the row with — 40% offshore, 50% inshore,
    the offshore boats being closer winded;
  * the run in to the finish leaves the last mark on the card for the mark
    `finishVia` names and then `finishRunNm` more to the line.

    python3 tools/check_hyc_al.py data/hyc/al-2026

Reads `checks` from the directory's manifest.json; `toleranceNm` is how far
a course may be out before it is a difference, and `expected` records the
ones already known and read, which are printed but do not fail. Exit status
1 on any other difference.
"""

import json
import math
import os
import sys

NM_PER_RADIAN = 3440.065


def great_circle(a, b):
    """(distance in nautical miles, initial true bearing) between positions."""
    lat1, lng1, lat2, lng2 = (math.radians(v) for v in (a['lat'], a['lng'], b['lat'], b['lng']))
    d = 2 * math.asin(math.sqrt(math.sin((lat2 - lat1) / 2) ** 2
                                + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2))
    y = math.sin(lng2 - lng1) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(lng2 - lng1)
    return d * NM_PER_RADIAN, math.degrees(math.atan2(y, x)) % 360


def winds(card):
    """The wind direction each course letter is set for, off the card's own
    "Wind direction" note: "A 000°, B 020°, …"."""
    note = next((n for n in card.get('notes', []) if n['title'] == 'Wind direction'), None)
    if not note:
        sys.exit('the card carries no "Wind direction" note')
    out = {}
    for item in note['text'].split('\n')[-1].split(','):
        letter, bearing = item.split()
        out[letter] = int(bearing.rstrip('°'))
    return out


def length(course, wind, positions, model):
    """The course's length under the card's conventions, or a reason it cannot
    be computed."""
    marks = [m['mark'] for m in course['marks']]
    missing = [m for m in marks[1:] + [model['finishVia']] if m not in positions]
    if missing:
        return None, f'no position for {", ".join(sorted(set(missing)))}'

    def sailed(a, b):
        distance, bearing = great_circle(positions[a], positions[b])
        upwind = abs((bearing - wind + 180) % 360 - 180) <= model['upwindWindowDeg']
        return distance * (model['upwindFactor'] if upwind else 1)

    total = model['firstBeatNm'] * model['upwindFactor'] + model['secondLegNm']
    for a, b in zip(marks[1:], marks[2:]):
        total += sailed(a, b)
    return total + sailed(marks[-1], model['finishVia']) + model['finishRunNm'], None


def check_distances(base, spec):
    card = json.load(open(os.path.join(base, spec['card'])))
    marks = json.load(open(os.path.join(base, spec['marks'])))
    positions = {m['id']: m['position'] for m in marks['marks'] if m.get('position')}
    by_letter = winds(card)
    known = {e['course']: e['note'] for e in spec.get('expected', [])}
    tolerance = spec['toleranceNm']
    problems, noted, worst, checked = [], [], 0.0, 0
    for course in card['courses']:
        printed = course.get('distanceNm')
        if printed is None:
            continue
        wind = by_letter.get(course['id'][0])
        if wind is None:
            problems.append(f'{course["id"]}: the card heads no wind direction for row {course["id"][0]}')
            continue
        computed, why = length(course, wind, positions, model=spec['model'])
        if computed is None:
            problems.append(f'{course["id"]}: {why}')
            continue
        checked += 1
        out = printed - computed
        line = (f'{course["id"]} {" ".join(m["mark"] for m in course["marks"])} in a {wind:03d}° wind: '
                f'card {printed:.2f} NM, marks {computed:.2f} NM, {out:+.2f}')
        if abs(out) <= tolerance:
            if course['id'] in known:
                problems.append(f'{line} — recorded as a difference, but it agrees now')
            else:
                worst = max(worst, abs(out))
        elif course['id'] in known:
            noted.append(f'{line} — known: {known[course["id"]]}')
        else:
            problems.append(line)
    for course_id in sorted(set(known) - {c['id'] for c in card['courses']}):
        problems.append(f'{course_id}: recorded as a difference but not on the card')
    heading = (f'{spec["card"]} distances vs {spec["marks"]} positions: '
               f'{checked} courses, worst {worst:.2f} NM against a {tolerance:.2f} NM tolerance')
    return heading, problems, noted


def main():
    base = sys.argv[1]
    manifest = json.load(open(os.path.join(base, 'manifest.json')))
    failures = 0
    for check in manifest['checks']['items']:
        if check['check'] != 'distances':
            sys.exit(f'unknown check {check["check"]}')
        heading, problems, noted = check_distances(base, check)
        status = f'{len(problems)} DIFFERENCES' if problems else f'ok, {len(noted)} known difference(s)' if noted else 'ok'
        print(f'{heading}: {status}')
        for line in noted + problems:
            print('  ' + line)
        failures += bool(problems)
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
