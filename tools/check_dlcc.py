#!/usr/bin/env python3
"""Cross-check the Dun Laoghaire Combined Clubs data set.

  1. `marks-table`: the marks' positions against the bearings and distances
     DBSC prints on its sheet — `check_dbsc.py`'s check, since the marks are
     DBSC's and the sheet is the one the SI addendum reproduces.
  2. `same-addendum`: the SI the card was read from against another
     published copy of the same SI — the same Course Card A picture, byte
     for byte, and the same Addendum A text. The copy the JSON is read from
     came from the regatta's documents on racingrulesofsailing.org, whose
     links are signed and expire; the clubs' own websites carry the earlier
     draft, whose Addendum A must be the same for the card to be it.

    python3 tools/check_dlcc.py data/dlcc/regattas-2026

Reads `checks` from the directory's manifest.json. Exit status 1 on any
difference, each one printed.
"""

import json
import os
import sys

from PIL import ImageChops

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from check_dbsc import check_table  # noqa: E402
from extract_dlcc_card import addendum_sections, card_image, card_page, page_texts  # noqa: E402


def check_addendum(base, pdf, other):
    problems = []
    texts = [page_texts(os.path.join(base, p)) for p in (pdf, other)]
    pages = [card_page(t) for t in texts]
    images = [card_image(os.path.join(base, p), page) for p, page in zip((pdf, other), pages)]
    if images[0].size != images[1].size:
        problems.append(f'Course Card A pictures differ in size: {images[0].size} vs {images[1].size}')
    elif ImageChops.difference(images[0], images[1]).getbbox():
        problems.append('Course Card A pictures differ')
    if texts[0][pages[0] - 1] != texts[1][pages[1] - 1]:
        problems.append("the card pages' text differs")
    sections = [addendum_sections(t) for t in texts]
    for number in sorted(set(sections[0]) | set(sections[1])):
        if sections[0].get(number) != sections[1].get(number):
            problems.append(f'Addendum A section {number} differs')
    return f'{pdf} vs {other}: Course Card A picture and Addendum A text', problems, []


def main():
    base = sys.argv[1]
    manifest = json.load(open(os.path.join(base, 'manifest.json')))
    failures = 0
    for check in manifest['checks']['items']:
        kind = check['check']
        if kind == 'marks-table':
            heading, problems, noted = check_table(base, check['marks'], check['pdf'])
        elif kind == 'same-addendum':
            heading, problems, noted = check_addendum(base, check['pdf'], check['other'])
        else:
            sys.exit(f'unknown check {kind}')
        status = f'{len(problems)} DIFFERENCES' if problems else 'ok'
        print(f'{heading}: {status}')
        for p in noted + problems:
            print('  ' + p)
        failures += bool(problems)
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
