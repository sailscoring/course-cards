#!/usr/bin/env python3
"""Generate Clontarf Yacht and Boat Club's marks and course card files.

The club publishes a **Cruiser Course Card** each year: a real-text PDF
drawn in Illustrator with a chart of the marks, a legend of their two- and
three-letter labels ("BI = Bull Island"), and two half-tables of 24
numbered courses, each a wind direction, a length ("Short (4)"), a number
and the marks with sides run together ("Vp-Hs-SWp-CHp-NBs"). The club
publishes no positions: the six North Dublin Bay marks are positioned by
Dublin Port's Notice to Mariners, which the club's own regatta
instructions reproduce, and the six harbour marks by nobody.

    python3 tools/extract_cybc_card.py marks <card.pdf> --notice <ntm.pdf> --club "Clontarf Yacht and Boat Club" --meta meta.json > marks.json
    python3 tools/extract_cybc_card.py cruiser <card.pdf> --meta meta.json [--notes notes.json] > card.json

The **East Coast Bilge Keel Championship** sailing instructions carry a
second card, 12.1: eight high-water courses A1–H1 and eight low-water
courses A2–H2, one column per wind direction, each column a start line, a
run of marks with a P or S beside each, and a finish line. `ecbkc` mode
reads it from the text layer by the columns' positions on the page. The
instructions name two marks in ways the legend does not — "0" and "OUT"
for Outer — which `--aliases` maps, so the slip is recorded in the
manifest rather than guessed at here.

    python3 tools/extract_cybc_card.py ecbkc <si.pdf> --meta meta.json [--aliases a.json] [--start-line s.json] [--notes n.json] > card.json
    python3 tools/extract_cybc_card.py notes <si.pdf> --clauses "8.1,12.2 START-FINISH LINE,12.3"   # SI clauses as card notes
"""

import argparse
import json
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract_card import course_card_file, emit  # noqa: E402
from extract_kyc_marks import bbox_words  # noqa: E402
from extract_ntm_marks import sections  # noqa: E402

LEGEND_RE = re.compile(r'^([A-Z]{1,3}) = (.+)$')
COURSE_RE = re.compile(r'^([A-Z]{1,3}[ps])(?:-([A-Z]{1,3}[ps]))*$')
LENGTH_RE = re.compile(r'^(Short|Long) \(([\d.]+)\)$')
WINDS = {
    'North': 0, 'North East': 45, 'East': 90, 'South East': 135,
    'South': 180, 'South West': 225, 'West': 270, 'North West': 315,
}
ECBKC_WINDS = {'North': 0, 'North-East': 45, 'East': 90, 'South-East': 135, 'South': 180, 'South-West': 225, 'West': 270, 'North-West': 315}


def rows(words, page, tolerance=1.5):
    """A page's words grouped by baseline, each row left to right as
    (x0, text)."""
    lines = []
    for p, x0, y0, x1, y1, text in sorted(words, key=lambda w: (w[4], w[1])):
        if p != page:
            continue
        if lines and abs(lines[-1][0] - y1) <= tolerance:
            lines[-1][1].append((x0, text))
        else:
            lines.append([y1, [(x0, text)]])
    return [(y, sorted(ws)) for y, ws in lines]


# --- the legend, and the marks -------------------------------------------------------

def legend(words):
    """{label: name} from the card's legend, "BI = Bull Island" — the words
    of a legend line are the label, an equals sign and the name, at the x
    the legend is set at."""
    eq = [w for w in words if w[5] == '=']
    if not eq:
        sys.exit('no legend on the card')
    x = eq[0][1]
    out = {}
    for _, ws in rows(words, 1):
        ws = [(xx, t) for xx, t in ws if x - 30 <= xx <= x + 70]  # short of the right-hand table
        text = ' '.join(t for _, t in ws)
        m = LEGEND_RE.match(text)
        if m:
            out[m.group(1)] = m.group(2)
    if not out:
        sys.exit('the legend could not be read')
    return out


def cmd_marks(args):
    words = bbox_words(args.pdf)
    names = legend(words)
    positioned = {letter: (name, position) for name, position, letter, _ in sections(args.notice).get(args.club, [])}
    if not positioned:
        sys.exit(f'{args.notice}: no marks for {args.club!r}')
    marks = []
    for label, name in names.items():
        mark = {'id': label, 'name': name}
        if label in positioned:
            mark['position'] = positioned[label][1]
        else:
            mark['placement'] = args.placement
        marks.append(mark)
    unused = sorted(set(positioned) - set(names))
    if unused:
        sys.exit(f'the notice places marks the card does not letter: {", ".join(unused)}')
    meta = json.load(open(args.meta)) if args.meta else {}
    json.dump({'formatVersion': 2, **meta, 'marks': marks}, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write('\n')


# --- the cruiser card ------------------------------------------------------------------

def cmd_cruiser(args):
    words = bbox_words(args.pdf)
    names = legend(words)
    # The two half-tables: the columns' x, from the "No" headings.
    numbers = sorted(w[1] for w in words if w[5] == 'No')
    if len(numbers) != 2:
        sys.exit(f'expected two "No" column headings, found {len(numbers)}')
    directions = sorted(w[1] for w in words if w[5] == 'Direction')
    courses, details = [], []
    for y, ws in rows(words, 1):
        for k, x_no in enumerate(numbers):
            x_dir = directions[k]
            cell = [(x, t) for x, t in ws if x_dir - 12 <= x < (numbers[k + 1] - 80 if k + 1 < len(numbers) else 9999)]
            if not cell:
                continue
            seq = [(x, t) for x, t in cell if x > x_no + 12 and COURSE_RE.match(t)]
            if len(seq) != 1:
                continue
            number = [t for x, t in cell if x_no - 4 <= x <= x_no + 12 and t.isdigit()]
            direction = ' '.join(t for x, t in cell if x < x_dir + 55)
            length = ' '.join(t for x, t in cell if x_dir + 55 <= x < x_no - 4)
            if len(number) != 1 or not LENGTH_RE.match(length):
                sys.exit(f'row at y={y:.0f}: could not read number {number!r} or length {length!r}')
            marks = []
            for tok in seq[0][1].split('-'):
                label, side = tok[:-1], tok[-1]
                if label not in names:
                    sys.exit(f'course {number[0]}: mark {label!r} is not in the legend')
                marks.append({'mark': label, 'side': 'port' if side == 'p' else 'starboard'})
            course = {'id': number[0]}
            plain = direction.replace(' (inner)', '')
            if plain in WINDS:
                course['windDirectionDeg'] = WINDS[plain]
            course['distanceNm'] = float(LENGTH_RE.match(length).group(2))
            course['marks'] = marks
            courses.append(course)
            details.append(f'Course {number[0]}: {direction}, {length}.')
    if len(courses) != 24:
        sys.exit(f'expected 24 courses, read {len(courses)}')
    courses.sort(key=lambda c: int(c['id']))
    details.sort(key=lambda d: int(d.split()[1].rstrip(':')))
    meta = json.load(open(args.meta)) if args.meta else {}
    notes = [{'title': 'Directions and lengths, as printed', 'text': '\n'.join(details)}]
    if args.notes:
        notes += json.load(open(args.notes))
    emit(course_card_file(meta, None, notes, courses), sys.stdout)


# --- the East Coast Bilge Keel Championship card -------------------------------------------

def cmd_ecbkc(args):
    words = bbox_words(args.pdf)
    aliases = json.load(open(args.aliases)) if args.aliases else {}
    page = next(iter(sorted({w[0] for w in words if w[5] == 'COURSES' and any(v[0] == w[0] and v[5] == 'WATER' for v in words)})), None)
    if page is None:
        sys.exit('no "HIGH WATER … COURSES" page')
    lines = rows(words, page)
    courses = []
    i = 0
    while i < len(lines):
        y, ws = lines[i]
        heads = [(x, t) for x, t in ws if re.fullmatch(r'[A-H][12]', t)]
        if len(heads) != 8:
            i += 1
            continue
        winds = [t for _, t in lines[i + 1][1]]
        if len(winds) != 8 or any(w not in ECBKC_WINDS for w in winds):
            sys.exit(f'course headings at y={y:.0f} are not followed by eight winds: {winds}')
        # Each column: the mark words start at the heading's x (a little
        # left of it), the sides some 35 points right of that.
        columns = {t: x for x, t in heads}
        sequences = {t: [] for _, t in heads}
        j = i + 3  # past the "Start line" row
        while j < len(lines) and not any(t == 'Finish' for _, t in lines[j][1]):
            for x, t in lines[j][1]:
                col = min(heads, key=lambda h: abs(h[0] - x) if x <= h[0] + 20 else abs(h[0] + 35 - x))
                name = col[1]
                if t in ('P', 'S') and x > col[0] + 15:
                    if not sequences[name] or 'side' in sequences[name][-1]:
                        sys.exit(f'course {name}: a side {t!r} with no mark before it at y={lines[j][0]:.0f}')
                    sequences[name][-1]['side'] = 'port' if t == 'P' else 'starboard'
                else:
                    sequences[name].append({'mark': aliases.get(t, t)})
            j += 1
        for (x, name), wind in zip(sorted(heads), winds):
            if not sequences[name]:
                sys.exit(f'course {name} has no marks')
            courses.append({'id': name, 'windDirectionDeg': ECBKC_WINDS[wind], 'marks': sequences[name] + [{'mark': '__START__'}]})
        i = j + 1
    if len(courses) != 16:
        sys.exit(f'expected 16 courses, read {len(courses)}')
    start = json.load(open(args.start_line)) if args.start_line else None
    if not start:
        sys.exit('the courses finish at the start line, so the card needs a --start-line')
    for c in courses:
        c['marks'][-1]['mark'] = start['id']
    meta = json.load(open(args.meta)) if args.meta else {}
    notes = json.load(open(args.notes)) if args.notes else None
    emit(course_card_file(meta, start, notes, courses), sys.stdout)


# --- notes: SI clauses -----------------------------------------------------------------------

CLAUSE_RE = re.compile(r'^\s*(\d+\.\d+)\s+(.*)$')


def cmd_notes(args):
    """Named clauses of the instructions as notes: "12.2 START-FINISH LINE"
    picks the clause whose number and opening words those are, and runs to
    the next numbered clause. The instructions number two clauses 12.2, so
    a number alone would not do; the same regatta document also drops the
    "tt" and "ti" ligatures from its text layer ("Su on", "posi ons"), which
    is why the text is carried as the PDF has it and the README says so."""
    text = subprocess.run(['pdftotext', '-layout', args.pdf, '-'], check=True, capture_output=True, text=True).stdout
    lines = [' '.join(l.split()) for l in text.splitlines()]
    notes = []
    for key in args.clauses.split(','):
        key = key.strip()
        start = next((i for i, l in enumerate(lines) if l.startswith(key)), None)
        if start is None:
            sys.exit(f'no clause opening {key!r} in {args.pdf}')
        body = [lines[start]]
        for l in lines[start + 1:]:
            if CLAUSE_RE.match(l) or re.match(r'^\d+\s+[A-Z]', l) or l.startswith('REVSION'):
                break
            if l:
                body.append(l)
        number = CLAUSE_RE.match(lines[start]).group(1)
        notes.append({'title': number, 'text': ' '.join(body)[len(number):].strip()})
    json.dump(notes, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write('\n')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    m = sub.add_parser('marks')
    m.add_argument('pdf')
    m.add_argument('--notice', required=True, help="Dublin Port's Yacht Racing Marks notice")
    m.add_argument('--club', required=True)
    m.add_argument('--placement', required=True, help='the placement carried by a mark the notice does not position')
    m.add_argument('--meta')
    m.set_defaults(func=cmd_marks)
    c = sub.add_parser('cruiser')
    c.add_argument('pdf')
    c.add_argument('--meta')
    c.add_argument('--notes')
    c.set_defaults(func=cmd_cruiser)
    e = sub.add_parser('ecbkc')
    e.add_argument('pdf')
    e.add_argument('--meta')
    e.add_argument('--aliases', help='JSON {"as printed": "mark id"} for marks the instructions misname')
    e.add_argument('--start-line')
    e.add_argument('--notes')
    e.set_defaults(func=cmd_ecbkc)
    n = sub.add_parser('notes')
    n.add_argument('pdf')
    n.add_argument('--clauses', required=True)
    n.set_defaults(func=cmd_notes)
    args = ap.parse_args()
    args.func(args)


if __name__ == '__main__':
    main()
