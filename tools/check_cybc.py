#!/usr/bin/env python3
"""Cross-check the Clontarf Yacht and Boat Club data set.

The six North Dublin Bay marks are positioned by Dublin Port's Notice to
Mariners, the harbour authority's statement; the club's own regatta
instructions print positions for the same six. What there is to hold the
set against:

  1. **The notice is the one in force.** The port's summary of the year's
     notices must list it, by number and title, as issued, and list no
     other notice with that title — the notices supersede one another, and
     a check aimed at a superseded one is worse than none.
  2. **The club's positions against the port's.** Clause 12.2 of the East
     Coast Bilge Keel Championship instructions gives "Approx. positions
     for Dublin Bays Marks", to a tenth of a minute; each must be the
     notice's position for the same mark, to that precision.
  3. **Every mark a card names is in the marks file**, so no course points
     at a mark the legend does not letter.

    python3 tools/check_cybc.py data/cybc/season-2026

Reads `checks` from the directory's manifest.json. Exit status 1 on any
difference, each one printed.
"""

import json
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract_ntm_marks import sections  # noqa: E402

# The regatta instructions' text layer drops the "tt" and "ti" ligatures:
# "Su on" is Sutton, "posi ons" positions. Names are matched on their
# letters, so the dropped pair does not matter.
SI_POSITION_RE = re.compile(r"^\s*([A-Za-z ]+?)\s+(\d{2})[’'](\d{2}\.\d+)N\s+(\d{3})[’'](\d{2}\.\d+)W\s*$")


def subsequence(short, long):
    it = iter(long)
    return all(ch in it for ch in short)


def check_current(base, item):
    result = subprocess.run(
        [sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'extract_ntm_marks.py'), 'current',
         os.path.join(base, item['summary']), '--notice', str(item['notice']), '--title', item['title']],
        capture_output=True, text=True,
    )
    heading = f'{item["summary"]}: notice {item["notice"]} "{item["title"]}" in force'
    return heading, [] if result.returncode == 0 else [result.stdout.strip() or result.stderr.strip()]


def check_si_positions(base, item):
    marks = {m['id']: m for m in json.load(open(os.path.join(base, item['marks'])))['marks']}
    text = subprocess.run(['pdftotext', '-layout', os.path.join(base, item['pdf']), '-'], check=True, capture_output=True, text=True).stdout
    printed = {}
    for line in text.splitlines():
        m = SI_POSITION_RE.match(line)
        if m:
            name = m.group(1).replace(' ', '').lower()
            printed[name] = ({'lat': int(m.group(2)) + float(m.group(3)) / 60, 'lng': -(int(m.group(4)) + float(m.group(5)) / 60)}, len(m.group(3).split('.')[1]))
    problems = []
    if len(printed) != item['count']:
        problems.append(f'read {len(printed)} positions from the instructions, expected {item["count"]}')
    matched = 0
    for name, (pos, digits) in printed.items():
        # "Su on" is Sutton with its ligature dropped: the printed letters
        # must appear in the mark's name in order, and only one name fits.
        fits = [mk for mk in marks.values() if mk.get('position') and subsequence(name, mk['name'].replace(' ', '').lower())]
        mark = fits[0] if len(fits) == 1 else None
        if not mark:
            problems.append(f'{name}: no positioned mark of that name in {item["marks"]}')
            continue
        matched += 1
        # The instructions print the minutes to one decimal; the notice to two.
        scale = 60 * 10 ** digits
        for axis in ('lat', 'lng'):
            if round(pos[axis] * scale) != round(mark['position'][axis] * scale):
                problems.append(f'{mark["id"]} {mark["name"]}: instructions {pos[axis]:.5f}, notice {mark["position"][axis]:.5f} ({axis})')
    return f'{item["pdf"]} 12.2 positions vs {item["marks"]}: {matched} marks', problems


def check_cards_marks(base, item):
    known = {m['id'] for m in json.load(open(os.path.join(base, item['marks'])))['marks']}
    problems = []
    for card_file in item['cards']:
        card = json.load(open(os.path.join(base, card_file)))
        ends = {e['id'] for e in (card.get('startLine'), card.get('finish')) if e}
        for course in card['courses']:
            for cm in course['marks']:
                if cm['mark'] not in known and cm['mark'] not in ends:
                    problems.append(f'{card_file} course {course["id"]}: mark {cm["mark"]!r} is not in the marks file')
    return f'{", ".join(item["cards"])} vs {item["marks"]}: every mark named is listed', problems


def main():
    base = sys.argv[1]
    manifest = json.load(open(os.path.join(base, 'manifest.json')))
    failures = 0
    for item in manifest['checks']['items']:
        kind = item['check']
        if kind == 'notice-in-force':
            heading, problems = check_current(base, item)
        elif kind == 'si-positions':
            heading, problems = check_si_positions(base, item)
        elif kind == 'cards-marks':
            heading, problems = check_cards_marks(base, item)
        else:
            sys.exit(f'unknown check {kind}')
        print(f'{heading}: {f"{len(problems)} DIFFERENCES" if problems else "ok"}')
        for p in problems:
            print('  ' + p)
        failures += bool(problems)
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
