#!/usr/bin/env python3
"""Read the yacht racing marks out of Dublin Port's Notice to Mariners.

Every year Dublin Port Company publishes a notice, "Yacht Racing Marks",
listing the marks each club has sanction to lay within the port limits
from April to October — a table per club of name, latitude, longitude,
the club's letter for the mark and a description. It is the harbour
authority's statement of where the marks are, independent of the clubs'
own sheets, and the one place Clontarf Yacht and Boat Club's marks are
given positions at all.

    python3 tools/extract_ntm_marks.py <notice.pdf> --club "Clontarf Yacht and Boat Club" [--meta meta.json] > marks.json
    python3 tools/extract_ntm_marks.py <notice.pdf> --list       # the clubs the notice covers

The notice is a real-text PDF. A club's table follows the line naming it
("Dublin Bay Sailing Club has statutory sanction to lay …", "Clontarf Yacht
and Boat Club have permission to lay …") and runs to the next such line or
the notice's footer. A row is a name, two positions in degrees and decimal
minutes, a letter and, for some, a description; a position printed in
brackets, and a name marked *, Ω or †, are read like any other — the
footnotes those marks refer to are the notice's, not the format's. The
JSON carries the position as printed, to the hundredth of a minute.

`current` mode checks a notice is the one in force: the year's summary of
notices ("Summary of Notices") must list it, by number and title, as
issued, and list no later notice with the same title.

    python3 tools/extract_ntm_marks.py current <summary.pdf> --notice 20 --title "Yacht Racing Marks"
"""

import argparse
import json
import re
import subprocess
import sys

sys.path.insert(0, __file__.rsplit('/', 1)[0])
from extract_card import FORMAT_VERSION  # noqa: E402

CLUB_RE = re.compile(r'^\s*(.+?) (?:has|have) (?:statutory sanction|permission) to lay', re.I)
ROW_RE = re.compile(
    r'^\s*\(?(?P<name>[A-Za-z][A-Za-z ]*?(?: \([A-Z0-9]+\))?)\s*[*Ω†]?\s*'
    r'\(?\s*(?P<latd>\d{2})°(?P<latm>\d{2}\.\d{2})\s*[’\']?\s*(?P<lath>[NS])\s*\)?\s+'
    r'\(?\s*(?P<lngd>\d{3})°(?P<lngm>\d{2}\.\d{2})\s*[’\']?\s*(?P<lngh>[EW])\s*\)?\s+'
    r'(?P<letter>\S+)\s*(?P<desc>.*?)\s*$'
)
FOOTER_RE = re.compile(r'^\s*(\*|Ω|†) Indicates|^\s*Captain|^\s*Masters, owners|^\s*Page \d')


def layout_text(pdf):
    return subprocess.run(['pdftotext', '-layout', pdf, '-'], check=True, capture_output=True, text=True).stdout


def sections(pdf):
    """{club: [rows]} for every club's table in the notice, a row being
    (name, position, letter, description)."""
    out, club = {}, None
    for line in layout_text(pdf).splitlines():
        m = CLUB_RE.match(line)
        if m:
            club = m.group(1).strip()
            out.setdefault(club, [])
            continue
        if club is None or not line.strip() or FOOTER_RE.match(line):
            continue
        m = ROW_RE.match(line)
        if not m:
            continue
        lat = int(m.group('latd')) + float(m.group('latm')) / 60
        lng = int(m.group('lngd')) + float(m.group('lngm')) / 60
        position = {
            'lat': round(-lat if m.group('lath') == 'S' else lat, 6),
            'lng': round(-lng if m.group('lngh') == 'W' else lng, 6),
        }
        out[club].append((m.group('name').strip(), position, m.group('letter'), m.group('desc').strip()))
    if not out:
        sys.exit(f'{pdf}: no club tables found')
    return out


def marks_of(pdf, club):
    found = sections(pdf)
    if club not in found:
        sys.exit(f'{pdf}: no table for {club!r}; the notice covers {", ".join(found)}')
    marks = []
    for name, position, letter, desc in found[club]:
        if letter == '-':
            continue  # DBSC's "Start" mark, which the club's own sheet does not letter either
        mark = {'id': letter, 'name': name}
        if desc:
            mark['color'] = desc.lower()
        mark['position'] = position
        marks.append(mark)
    return marks


def cmd_current(args):
    text = layout_text(args.summary)
    hits = [l for l in text.splitlines() if re.search(rf'^\s*{re.escape(args.notice)}\s+{re.escape(args.title)}\s', l)]
    if len(hits) != 1:
        sys.exit(f'{args.summary}: notice {args.notice} "{args.title}" is listed {len(hits)} times')
    if not re.search(r'\bIssued\b', hits[0]):
        sys.exit(f'{args.summary}: notice {args.notice} is not marked issued: {hits[0].strip()}')
    same_title = [l for l in text.splitlines() if re.search(rf'\s{re.escape(args.title)}\s', l)]
    if len(same_title) != 1:
        sys.exit(f'{args.summary}: {len(same_title)} notices titled "{args.title}":\n' + '\n'.join(l.strip() for l in same_title))
    print(f'{args.summary}: notice {args.notice} "{args.title}" is the one listed, {hits[0].strip().split(args.title, 1)[1].strip()}')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd')
    m = sub.add_parser('marks')
    m.add_argument('pdf')
    m.add_argument('--club', required=True)
    m.add_argument('--meta')
    m.set_defaults(func=None)
    ls = sub.add_parser('list')
    ls.add_argument('pdf')
    c = sub.add_parser('current')
    c.add_argument('summary')
    c.add_argument('--notice', required=True)
    c.add_argument('--title', required=True)
    c.set_defaults(func=cmd_current)
    args = ap.parse_args()
    if args.cmd == 'list':
        for club, rows in sections(args.pdf).items():
            print(f'{club}: {len(rows)} marks')
        return
    if args.cmd == 'current':
        cmd_current(args)
        return
    meta = json.load(open(args.meta)) if args.meta else {}
    json.dump({'formatVersion': FORMAT_VERSION, **meta, 'marks': marks_of(args.pdf, args.club)}, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write('\n')


if __name__ == '__main__':
    main()
