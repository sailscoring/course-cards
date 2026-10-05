#!/usr/bin/env python3
"""Generate Royal Cork Yacht Club's marks and course card files.

The club's **Keelboat Racing Course Card** is a real-text PDF: a chart of
Cork Harbour, then two pages of courses in two columns, each course a
heading ("COURSE 4 **."), sometimes a name ("Admiral's Choice."), and one
to three rounds — "• Round One: No.13 (S) - No.11 (S) - No.10 (P) - Dosco
(S) - Cage (P) (6 nm)" — each closing with the cumulative distance sailed
so far, under a wind heading ("N WIND") that applies to the courses below
it. A course is its rounds run together, from the start line to "Finish";
the rounds are where the race officer may shorten it. A fourth page carries
the card's notes and its starting and finishing lines.

    python3 tools/extract_rcyc_card.py card <card.pdf> --meta meta.json [--start-line s.json] [--notes n.json] > card.json
    python3 tools/extract_rcyc_card.py notes <card.pdf>                       # page 4 as notes
    python3 tools/extract_rcyc_card.py names <card.pdf>                       # every mark the courses name

The club's **General Sailing Instructions** (22.3) give positions for the
Port of Cork's permanently laid race marks — Dosco, Ringabella, Harp, East
Mark — and its **Autumn League Sailing Instructions** (36) for three of
them again, differently; neither positions anything else the courses name: the numbered channel buoys,
the E, W and EF2 buoys and Cage are Port of Cork navigation marks, charted
but positioned in no club or port document, EF4 is a race mark, and
Dutchman, Curlane and White Bay are laid where the card says. `marks` mode reads the laid marks'
positions from the instructions it is given — either layout: 22.3 prints
"Dosco 51º 49.26’ N 8º 15.81’ W" on one line, 36 prints the name and below
it "51º 47’ .20 N 008º 14’ .28 W" — takes any the other instructions place
and these do not from `--supplement`, each naming it as its `source`, and
takes the rest from `--add`, refusing a card that names a mark none of
them supplies.

    python3 tools/extract_rcyc_card.py marks <si.pdf> --card <card.pdf> --add marks.json \
        [--supplement <other-si.pdf> --supplement-ids 'East Mark' --supplement-citation TEXT] \
        [--buoys eoceanic.html --buoy-rows rows.json --buoy-citation TEXT] --meta meta.json > marks.json

Most of the buoys are positioned from **eOceanic**'s list of Irish marks, a
web page kept verbatim beside the instructions: a table of rows, each a
name ("Cork outer harbour Ramshead Bank No.6."), a latitude and longitude
in degrees and decimal minutes, and a light characteristic. `--buoy-rows`
maps a mark id to the row that names it; the mark's entry in `--add`
carries its id and name, and its position and `source` — the citation
followed by the row's name, which is where the buoy's number is printed —
are read from the page. A row named twice, or not at all, is refused, and
so is an `--add` entry for such a mark that brings a position of its own.

Mark names are normalised to the card's commonest spelling: "No.7", "No 7"
and "No7" are one mark, "Dosco" and "DOSCO" one, "Harp Mark" is Harp and
"Dutchman Mark" Dutchman; "Finish" and "Finish Cage" end a course at the
line.
"""

import argparse
import html
import json
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract_card import course_card_file, emit  # noqa: E402
from extract_kyc_marks import bbox_words  # noqa: E402

GUTTER = 300  # the course pages' two columns divide here, in points
COURSE_RE = re.compile(r'^COURSE (\d+)\s*(\*{1,2})?\.?$')
WIND_RE = re.compile(r'^(.+?) WIND(?: \((.+)\))?$')
ROUND_RE = re.compile(r'^Round\s*(One|Two|Three)\s*:?\s*(.*)$', re.S)
DISTANCE_RE = re.compile(r'^(.*?)\s*\(?\s*(\d+(?:\.\d+)?)\s*(?:nm|NM|Nm)?\s*\)?\s*\.?\s*$', re.S)  # "(4.7nm)"; once "4.7nm)", once "(8.4nm"
MARK_RE = re.compile(r'^(.+?)\s*\((P|S)\)$')
WINDS = {'N': 0, 'NE': 45, 'E': 90, 'SE': 135, 'S': 180, 'SW': 225, 'W': 270, 'NW': 315}
SPLIT_POSITION_RE = re.compile(r"^\s*(\d{2})\s*º\s*(\d{2})[’']\s*\.(\d+)\s*N\s+(\d{3})\s*º\s*(\d{2})[’']\s*\.(\d+)\s*W\s*$")
POSITION_RE = re.compile(r"^\s*(.+?)\s+(\d{2})º\s*(\d{2}\.\d+)[’']\s*N\s+(\d)º\s*(\d{2}\.\d+)[’']?\s*W\s*$")


def normalise(name):
    """The card's commonest spelling of a mark's name."""
    name = ' '.join(name.replace('–', ' ').replace('-', ' ').split()).strip(' .:')
    m = re.match(r'^No\.?\s*(\d+)$', name, re.I)
    if m:
        return f'No.{m.group(1)}'
    if name.upper() == 'DOSCO':
        return 'Dosco'
    if name.endswith(' Mark') and name != 'East Mark':
        name = name[:-5]
    return name


# --- the card's text, column by column ------------------------------------------------------

def column_lines(words, page, left):
    """One column of a page as lines of text, top to bottom."""
    # The running foot sits below 800 pt; the columns' text stops well above it.
    chosen = [w for w in words if w[0] == page and (w[1] < GUTTER) == left and w[4] < 800]
    lines = []
    for w in sorted(chosen, key=lambda w: (w[4], w[1])):
        if lines and abs(lines[-1][0] - w[4]) <= 2.5:
            lines[-1][1].append(w)
        else:
            lines.append([w[4], [w]])
    texts = [' '.join(w[5] for w in sorted(ws, key=lambda w: w[1])) for _, ws in lines]
    return [t for t in texts if not re.match(r'^(PAGE \d+|KEELBOAT RACING( COURSE CARD)?|COURSE CARD)$', t.strip())]  # the running foot, split at the gutter


def course_pages(words):
    """The pages that carry courses: those with a "COURSE n" heading."""
    return sorted({w[0] for w in words if w[5] == 'COURSE'})


def read_courses(pdf):
    """[{id, stars, name, wind, rounds: [(which, text, nm)], notes: [...]}]
    in the card's reading order — left column then right, page by page."""
    words = bbox_words(pdf)
    courses, wind = [], None
    for page in course_pages(words):
        for left in (True, False):
            lines = column_lines(words, page, left)
            i = 0
            while i < len(lines):
                line = lines[i].strip()
                m = WIND_RE.match(line)
                if m and not line.startswith('•'):
                    wind = line
                    i += 1
                    continue
                m = COURSE_RE.match(line)
                if not m:
                    i += 1
                    continue
                course = {'id': m.group(1), 'stars': m.group(2) or '', 'name': None, 'wind': wind, 'rounds': [], 'notes': []}
                i += 1
                # Everything up to the next course heading or wind heading belongs to this course.
                body = []
                while i < len(lines) and not COURSE_RE.match(lines[i].strip()) and not (WIND_RE.match(lines[i].strip()) and not lines[i].strip().startswith('•')):
                    body.append(lines[i].strip())
                    i += 1
                text = ' '.join(body)
                # The text is bullets: rounds, and the odd note. What comes
                # before the first bullet is the course's name, or a note.
                bullets = [b.strip() for b in text.split('•')]
                head = bullets[0]
                if head and not head.lower().startswith(('note', '“')):
                    course['name'] = head.rstrip('.')
                elif head:
                    course['notes'].append(head)
                for b in bullets[1:]:
                    rm = ROUND_RE.match(b)
                    if not rm:
                        course['notes'].append(' '.join(b.split()))
                        continue
                    which, rest = rm.group(1), rm.group(2)
                    rest = re.sub(r'\s+[a-z]$', '', rest)  # course 27 ends "(8.4nm) t", a stray letter
                    # A round closes with its cumulative distance, "(8.4nm)";
                    # course 23 prints none. A note may follow the distance.
                    dm = DISTANCE_RE.match(rest)
                    nm = None
                    if dm:
                        rest, nm = dm.group(1), float(dm.group(2))
                    else:
                        # a note after the distance: "… (4nm) Note: The Dutchman …"
                        parts = re.split(r'\s+(?=Note)', rest, maxsplit=1)
                        if len(parts) == 2:
                            course['notes'].append(' '.join(parts[1].split()))
                            dm = DISTANCE_RE.match(parts[0])
                            if dm:
                                rest, nm = dm.group(1), float(dm.group(2))
                    course['rounds'].append((which, ' '.join(rest.split()).strip(' -–'), nm))
                courses.append(course)
    return courses


def marks_of(round_text, course_id):
    """A round's marks with sides, and how it ends: None for a round the
    course carries on from, 'line' for "Finish", 'cage' for "Finish Cage" —
    the line laid at Cage, which courses 76 and 81 cross at the end of their
    first round and sail on from."""
    text = re.sub(r'\)\s*\)', ')', round_text)  # a stray bracket: "Cage (S) )"
    tokens = [t.strip() for t in re.split(r'\s+[–-]\s*|(?<=\))\s*-|\s-(?=[A-Za-z])|(?<=\))\s+(?=[A-Z])', text) if t.strip()]
    marks, finish = [], None
    for tok in tokens:
        tok = tok.strip(' .')
        if re.match(r'^Finish\.?$', tok, re.I):
            finish = 'line'
            continue
        if re.match(r'^Finish Cage$', tok, re.I):
            finish = 'cage'
            continue
        m = MARK_RE.match(tok)
        if not m:
            sys.exit(f'course {course_id}: {tok!r} is not a mark and a side')
        marks.append({'mark': normalise(m.group(1)), 'side': 'port' if m.group(2) == 'P' else 'starboard'})
    return marks, finish


def wind_deg(heading):
    """"N WIND" → 0; "E WIND (LIGHT – H.W.)" → 90; "S/SW OR N/NE WIND" → None."""
    m = WIND_RE.match(heading or '')
    return WINDS.get(m.group(1)) if m else None


def cmd_card(args):
    courses = read_courses(args.pdf)
    if not courses:
        sys.exit('no courses found')
    out, rounds_note, names_note = [], [], []
    for c in courses:
        if not c['rounds']:
            sys.exit(f'course {c["id"]}: no rounds read')
        marks = []
        for k, (which, text, nm) in enumerate(c['rounds']):
            round_marks, finish = marks_of(text, c['id'])
            marks += round_marks
            last = k == len(c['rounds']) - 1
            if last and finish is None:
                sys.exit(f'course {c["id"]}: round {which} does not end at the finish')
            if not last and finish == 'line':
                sys.exit(f'course {c["id"]}: round {which} ends at the finish before the last round')
            if not last and finish == 'cage':
                # The round ends by crossing the line laid at Cage, and the
                # course carries on: the line is passed, and Cage is where.
                marks.append({'mark': 'Cage', 'passing': True})
        course = {'id': c['id']}
        deg = wind_deg(c['wind'])
        if deg is not None:
            course['windDirectionDeg'] = deg
        if c['rounds'][-1][2] is not None:
            course['distanceNm'] = c['rounds'][-1][2]
        course['marks'] = marks + [{'mark': '__START__'}]
        out.append(course)
        label = f'Course {c["id"]}{" " + c["stars"] if c["stars"] else ""}'
        rounds = '; '.join(f'Round {w}: {t}' + (f' ({nm:g}nm)' if nm is not None else '') for w, t, nm in c['rounds'])
        rounds_note.append(f'{label}{" (" + c["name"] + ")" if c["name"] else ""}, {c["wind"]}: {rounds}.' + (' ' + ' '.join(c['notes']) if c['notes'] else ''))
    ids = [c['id'] for c in out]
    if len(set(ids)) != len(ids):
        sys.exit('duplicate course numbers: ' + ', '.join(sorted({i for i in ids if ids.count(i) > 1})))
    start = json.load(open(args.start_line)) if args.start_line else None
    if not start:
        sys.exit('every course ends at "Finish", the start line, so the card needs a --start-line')
    for c in out:
        c['marks'][-1]['mark'] = start['id']
    meta = json.load(open(args.meta)) if args.meta else {}
    notes = [{'title': 'Courses as printed, by round', 'text': '\n'.join(rounds_note)}]
    if args.notes:
        notes += json.load(open(args.notes))
    emit(course_card_file(meta, start, notes, out), sys.stdout)


def cmd_names(args):
    names = set()
    for c in read_courses(args.pdf):
        for _, text, _ in c['rounds']:
            names.update(m['mark'] for m in marks_of(text, c['id'])[0])
    names.add('Cage')
    print('\n'.join(sorted(names)))


# --- notes: the fourth page ---------------------------------------------------------------------

def cmd_notes(args):
    words = bbox_words(args.pdf)
    page = max(w[0] for w in words)
    lines = [l for l in column_lines(words, page, True) + column_lines(words, page, False) if l.strip()]
    lines = [l for l in lines if not re.match(r'^(PAGE \d+|KEELBOAT RACING COURSE CARD)', l.strip())]
    notes, title, body = [], None, []
    for line in lines:
        if re.match(r'^[A-Z][A-Z /]+:?$', line.strip()) and len(line.strip()) > 4:
            if title and body:
                notes.append({'title': title, 'text': '\n'.join(body)})
            title, body = line.strip().rstrip(':'), []
            continue
        if line.startswith(('•', '*')) or not body:
            body.append(line.strip())
        else:
            body[-1] += ' ' + line.strip()
    if title and body:
        notes.append({'title': title, 'text': '\n'.join(body)})
    json.dump(notes, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write('\n')


# --- marks: the general instructions' positions, and the rest -----------------------------------------

def laid_marks(pdf):
    """The Port of Cork laid race marks' positions, as printed. The general
    instructions' 22.3 prints a name and a position on one line, and for two
    of them a parenthesis on the next ("(Corkbeg)", "(Formerly Mark B)"); the
    Autumn League's 36 prints the name ("Harp Mark", "Dosco (Corkbeg)") and,
    on the next line, the position with the minutes split at the point."""
    text = subprocess.run(['pdftotext', '-layout', pdf, '-'], check=True, capture_output=True, text=True).stdout
    lines = text.splitlines()
    marks = []
    for i, line in enumerate(lines):
        m = SPLIT_POSITION_RE.match(line)
        if m:
            name_line = next(l for l in reversed(lines[:i]) if l.strip())
            base, _, note = ' '.join(name_line.split()).partition(' (')
            name = normalise(base) + (f' ({note}' if note else '')
            lat = int(m.group(1)) + float(f'{m.group(2)}.{m.group(3)}') / 60
            lng = -(int(m.group(4)) + float(f'{m.group(5)}.{m.group(6)}') / 60)
            marks.append({'id': normalise(base), 'name': name, 'shape': 'conical', 'color': 'yellow',
                          'position': {'lat': round(lat, 6), 'lng': round(lng, 6)}})
            continue
        m = POSITION_RE.match(line)
        if not m:
            continue
        name = ' '.join(m.group(1).split())
        # A parenthesis on the lines below — "(Corkbeg)", "(Formerly Mark B)"
        # over two lines — belongs to the name.
        note = ''
        for l in lines[i + 1:i + 4]:
            l = l.strip()
            if not l or (not note and not l.startswith('(')):
                break
            note = (note + ' ' + l).strip()
            if note.endswith(')'):
                break
        lat = int(m.group(2)) + float(m.group(3)) / 60
        lng = -(int(m.group(4)) + float(m.group(5)) / 60)
        mark = {'id': name, 'name': name + (f' {note}' if note else ''), 'shape': 'conical', 'color': 'yellow', 'position': {'lat': round(lat, 6), 'lng': round(lng, 6)}}
        marks.append(mark)
    if len(marks) not in (3, 4):
        sys.exit(f'{pdf}: expected three or four Port of Cork laid marks, read {len(marks)}')
    return marks


def eoceanic_rows(path):
    """Every row of eOceanic's table of marks: {name: [(lat, lng, light), ...]},
    the name as printed, whitespace trimmed; a name printed twice keeps both."""
    page = open(path, encoding='utf-8', errors='replace').read()
    rows = {}
    for name, lat, lng, light in re.findall(r"<tr><td align='left'>(.*?)</td><td>(.*?)</td><td>(.*?)</td><td>(.*?)</td>", page):
        name, lat, lng, light = (' '.join(html.unescape(x).split()) for x in (name, lat, lng, light))
        mlat = re.fullmatch(r"(\d+)° ([\d.]+)' ([NS])", lat)
        mlng = re.fullmatch(r"(\d+)° ([\d.]+)' ([EW])", lng)
        if not (mlat and mlng):
            continue
        dd = lambda m: (int(m.group(1)) + float(m.group(2)) / 60) * (-1 if m.group(3) in 'SW' else 1)
        rows.setdefault(name, []).append((round(dd(mlat), 6), round(dd(mlng), 6), light))
    return rows


def buoy_positions(path, wanted, citation):
    """{id: (position, source)} for each id → row name of `wanted`."""
    rows = eoceanic_rows(path)
    out = {}
    for id_, name in wanted.items():
        found = rows.get(name, [])
        if len(found) != 1:
            sys.exit(f'--buoys: row {name!r} for {id_} appears {len(found)} times in {path}')
        lat, lng, _ = found[0]
        out[id_] = ({'lat': lat, 'lng': lng}, f'{citation}: “{name}”')
    return out


def cmd_marks(args):
    marks = laid_marks(args.pdf)
    ids = {m['id'] for m in marks}
    if args.supplement_ids:
        if not args.supplement or not args.supplement_citation:
            sys.exit('--supplement-ids needs --supplement and --supplement-citation')
        others = {m['id']: m for m in laid_marks(args.supplement)}
        for id_ in args.supplement_ids.split(','):
            if id_ in ids:
                sys.exit(f'--supplement-ids: {id_!r} is already placed by {args.pdf}')
            if id_ not in others:
                sys.exit(f'--supplement-ids: {args.supplement} does not place {id_!r}')
            marks.append({**others[id_], 'source': args.supplement_citation})
            ids.add(id_)
    added = json.load(open(args.add)) if args.add else []
    if args.buoys:
        placed = buoy_positions(args.buoys, json.load(open(args.buoy_rows)), args.buoy_citation)
        listed = {extra['id'] for extra in added}
        for id_ in placed:
            if id_ not in listed:
                sys.exit(f'--buoy-rows: {id_!r} is not among the --add marks')
        for extra in added:
            if extra['id'] in placed:
                if 'position' in extra or 'source' in extra:
                    sys.exit(f'--add: {extra["id"]!r} is positioned from --buoys and brings a position or source of its own')
                extra['position'], extra['source'] = placed[extra['id']]
    for extra in added:
        if extra['id'] in ids:
            sys.exit(f'--add: {extra["id"]!r} is already placed by the instructions')
        marks.append(extra)
        ids.add(extra['id'])
    named = set()
    for c in read_courses(args.card):
        for _, text, _ in c['rounds']:
            named.update(m['mark'] for m in marks_of(text, c['id'])[0])
    missing = sorted(named - ids)
    if missing:
        sys.exit(f'the card names marks neither the instructions nor --add supply: {", ".join(missing)}')
    meta = json.load(open(args.meta)) if args.meta else {}
    json.dump({'formatVersion': 2, **meta, 'marks': marks}, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write('\n')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    c = sub.add_parser('card')
    c.add_argument('pdf')
    c.add_argument('--meta')
    c.add_argument('--start-line')
    c.add_argument('--notes')
    c.set_defaults(func=cmd_card)
    n = sub.add_parser('notes')
    n.add_argument('pdf')
    n.set_defaults(func=cmd_notes)
    nm = sub.add_parser('names')
    nm.add_argument('pdf')
    nm.set_defaults(func=cmd_names)
    m = sub.add_parser('marks')
    m.add_argument('pdf', help='the general sailing instructions')
    m.add_argument('--card', required=True)
    m.add_argument('--add')
    m.add_argument('--supplement', help='other instructions, for laid marks these do not place')
    m.add_argument('--supplement-ids', default='', help='comma-separated ids to take from them')
    m.add_argument('--supplement-citation', help="those instructions in words, as the supplemented marks' source")
    m.add_argument('--buoys', help="eOceanic's page of marks, kept verbatim")
    m.add_argument('--buoy-rows', help='JSON: {mark id: the row naming it}')
    m.add_argument('--buoy-citation')
    m.add_argument('--meta')
    m.set_defaults(func=cmd_marks)
    args = ap.parse_args()
    args.func(args)


if __name__ == '__main__':
    main()
