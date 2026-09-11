#!/usr/bin/env python3
"""Read a card's finish out of the sailing instructions that define it.

Some cards stop at the last rounding mark and leave the run home to the
sailing instructions: HYC's 2026 Autumn League cards print courses ending at
K or G offshore and at a fixed mark inshore, and SI 6.1 D and 6.2 D say what
every one of them does next — offshore, past Rowan Rocks and the Howth Mark
to the line at the East Pier; inshore, past Spit to the line in Howth Sound.
That ending is the same for every course on the card, so it belongs in every
course's sequence rather than in prose, and this reads it from the club's own
words the way tools/extract_start_line.py reads the start line.

    python3 tools/extract_finish.py source/SI.pdf --clauses "Round the Cans Races" \\
        [--after "6.1 Offshore Committee Vessel Starts:"] --meta meta.json \\
        [--via via.json]

`--meta` supplies the id, name and citation the format's `finish` carries
alongside the placement this reads, and a `position` where the line has one —
the offshore line's shore end is a transit on the East Pier, not a buoy laid
on the day. `--via` is the JSON list of course-mark entries the run in passes
on the way to the line ({"mark": "Q", "side": "starboard", "passing": true}),
which the sailing instruction names but the card does not print.
"""

import argparse
import json
import re
import sys

sys.path.insert(0, __file__.rsplit('/', 1)[0])
from extract_start_line import after, clause, verbatim  # noqa: E402
from pdf_markdown import parts  # noqa: E402

# The order the format sets a mark's fields in, so a finish reads like one.
FIELDS = ('name', 'shape', 'color', 'position')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pdf')
    ap.add_argument('--clauses', required=True, help='the clauses or headings that define the line')
    ap.add_argument('--after', help='scope the search to what follows this heading')
    ap.add_argument('--columns', help='how many columns a page is set in, e.g. "2@2-3"')
    ap.add_argument('--meta', required=True, help="JSON with the finish's id, name, position and citation")
    ap.add_argument('--via', help='JSON list of the course marks the run in passes')
    args = ap.parse_args()

    items = parts(args.pdf, args.columns)
    if args.after:
        items = after(items, args.after)
    texts = [clause(items, key.strip()) for key in args.clauses.split(',')]
    for text in texts:
        verbatim(args.pdf, args.columns, text)
    placement = re.sub(r'\s+', ' ', ' '.join(texts)).strip()

    meta = json.load(open(args.meta))
    if not meta.get('id'):
        sys.exit('--meta must give the finish an id')
    finish = {'id': meta['id']}
    for field in FIELDS:
        if meta.get(field):
            finish[field] = meta[field]
    finish['placement'] = placement
    if meta.get('source'):
        finish['source'] = meta['source']
    if args.via:
        via = json.load(open(args.via))
        if not isinstance(via, list) or not all(isinstance(v, dict) and v.get('mark') for v in via):
            sys.exit('--via must be a list of course marks, each with a "mark"')
        finish['via'] = via
    print(json.dumps(finish, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
