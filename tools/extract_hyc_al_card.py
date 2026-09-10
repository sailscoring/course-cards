#!/usr/bin/env python3
"""Generate a course card file from an HYC Autumn League card.

The club drafts these cards in Office and publishes them as PDFs, and all
three are the same card:

  * a row per wind direction, 000° to 340° in 20° steps, lettered A–T (no I,
    no O) in a "Course" column;
  * four numbered columns of courses, each a sequence of mark letters, with
    the course's length in nautical miles printed beside it on the drafts
    and on no card the club has published;
  * over the table the card's heading and revision, under it the card's own
    notes, the first of which is the legend this reads the sides from.

Whichever it is, the side comes from the colour a character is drawn in —
"Marks coloured RED shall be rounded / passed to PORT. Those in GREEN and
underlined shall be rounded / passed to STARBOARD" — and that colour is read
from the document itself, never from a rendering of it: from the run (Word)
or rich-text run (Excel) a character belongs to, or from the fill colour the
PDF sets for it. The underline the legend also mentions is not usable: in
the 2026 drafts a whole row of the offshore card is underlined by accident,
so only the colour is read, and a character in a course cell that is neither
red nor green stops the build rather than being guessed at.

    python3 tools/extract_hyc_al_card.py <card.pdf|card.docx|card.xlsx> \
        --meta meta.json > card.json

Course ids are the card's own letter and column number — A1 … T4. The wind
direction each row is set for goes on each of the row's courses as
`windDirectionDeg`, and the whole wind column is kept as a note besides, as
the card prints it.
"""

import argparse
import json
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile

from extract_card import course_card_file, emit

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
S = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'

WIND_RE = re.compile(r'\d{3}')
LETTER_RE = re.compile(r'[A-Z]')


def flat(text):
    """A cell's text with its spacing normalised — the cards are typed, and
    carry stray double spaces and non-breaking spaces."""
    return ' '.join(text.split())


def side_of(colour, where):
    """The side a character's colour means. The card's letters are drawn in a
    few shades of each — Word's FF0000 and EE0000, Excel's ARGB FFFF0000;
    00B050 and 6AA84F for green — so this reads the hue rather than matching
    a list. A theme colour (the black of the wind and distance columns) is
    neither, and so is a course letter left black by mistake."""
    if not colour or not re.fullmatch(r'(?:[0-9A-Fa-f]{2})?[0-9A-Fa-f]{6}', colour):
        sys.exit(f'{where}: no colour to read a side from ({colour!r})')
    r, g, b = (int(colour[-6:][i:i + 2], 16) for i in (0, 2, 4))
    if r > 0x80 and r > g + 0x40 and r > b + 0x40:
        return 'port'
    if g > 0x80 and g > r + 0x40 and g > b + 0x40:
        return 'starboard'
    sys.exit(f"{where}: colour #{colour[-6:].upper()} is neither the card's red nor its green")


def marks_of(chars, where):
    """A course cell's coloured characters as the format's mark entries. These
    cards print no boxed marks, so every mark is a rounding mark."""
    marks = []
    for ch, colour in chars:
        if not ch.strip():
            continue
        if not LETTER_RE.fullmatch(ch):
            sys.exit(f'{where}: {ch!r} is not a mark letter')
        marks.append({'mark': ch, 'side': side_of(colour, f'{where}: mark {ch}')})
    if not marks:
        sys.exit(f'{where}: no marks')
    return marks


# --- Word (the offshore card) ----------------------------------------------

def docx_card(path):
    """(heading lines, wind column heading, course rows, note lines) from the
    single table a Word course card is, with the document's own paragraphs —
    the draft marking — among its headings."""
    with zipfile.ZipFile(path) as z:
        body = ET.fromstring(z.read('word/document.xml')).find(W + 'body')
    tables = body.findall(W + 'tbl')
    if len(tables) != 1:
        sys.exit(f'{path}: expected one table, found {len(tables)}')

    def para_text(p):
        return flat(''.join(n.text or '' for n in p.iter(W + 't')))

    def text(cell):
        return flat(' '.join(t for t in (para_text(p) for p in cell.findall(W + 'p')) if t))

    def runs(cell):
        """(character, colour) for every character in a cell, in order."""
        out = []
        for para in cell.findall(W + 'p'):
            for run in para.findall(W + 'r'):
                props = run.find(W + 'rPr')
                colour = props.find(W + 'color') if props is not None else None
                colour = colour.get(W + 'val') if colour is not None else None
                for node in run.iter(W + 't'):
                    out += [(ch, colour) for ch in node.text or '']
        return out

    headings, wind_heading, rows, notes = [], None, [], []
    for tr in tables[0].findall(W + 'tr'):
        cells = tr.findall(W + 'tc')
        first = text(cells[0])
        if len(cells) == 1:
            (notes if rows else headings).append(first)
        elif wind_heading is None:
            wind_heading = first  # the header row: Wind | Course | 1 | | 2 | …
        elif WIND_RE.fullmatch(first):
            rows.append((first, text(cells[1]), [(runs(cells[i]), text(cells[i + 1])) for i in (2, 4, 6, 8)]))
        else:
            sys.exit(f'{path}: table row starting {first!r} is neither the header nor a course row')
    headings += [t for t in (para_text(p) for p in body.findall(W + 'p')) if t]
    return headings, wind_heading, rows, notes


# --- Excel (the inshore card) ----------------------------------------------

def xlsx_card(path):
    """The same, from the single sheet an Excel course card is.

    A cell's characters take the colour of the cell's own font unless the
    string is rich text, whose runs carry their own; that is how the sheet
    prints a course of red marks with one green one in it.
    """
    with zipfile.ZipFile(path) as z:
        shared = ET.fromstring(z.read('xl/sharedStrings.xml'))
        styles = ET.fromstring(z.read('xl/styles.xml'))
        sheet = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))

    def colour_of(node):
        c = node.find(S + 'color') if node is not None else None
        return c.get('rgb') if c is not None else None

    fonts = [colour_of(f) for f in styles.find(S + 'fonts')]
    cell_font = [int(x.get('fontId')) for x in styles.find(S + 'cellXfs')]
    strings = []
    for si in shared:
        parts = [(r.find(S + 't').text or '', colour_of(r.find(S + 'rPr'))) for r in si.findall(S + 'r')]
        strings.append(parts or [(si.find(S + 't').text or '', None)])

    cells = {}
    for row in sheet.find(S + 'sheetData'):
        for c in row.findall(S + 'c'):
            value = c.find(S + 'v')
            cells[c.get('r')] = (c.get('t'), value.text if value is not None else None,
                                 fonts[cell_font[int(c.get('s') or 0)]])

    def raw(ref):
        kind, value, default = cells.get(ref, (None, None, None))
        if value is None:
            return None, [], None
        return kind, (strings[int(value)] if kind == 's' else [(value, None)]), default

    def text(ref):
        return '\n'.join(flat(line) for line in ''.join(t for t, _ in raw(ref)[1]).split('\n') if flat(line))

    def runs(ref):
        kind, parts, default = raw(ref)
        if kind != 's':
            sys.exit(f'{path}: {ref} is not a course')
        return [(ch, colour or default) for part, colour in parts for ch in part]

    headings, wind_heading, rows, notes = [], None, [], []
    for r in range(1, max(int(re.sub(r'\D', '', ref)) for ref in cells) + 1):
        first = text(f'A{r}')
        if not first:
            continue
        if WIND_RE.fullmatch(first):
            if wind_heading is None:
                sys.exit(f'{path}: course row {r} comes before the header row')
            rows.append((first, text(f'B{r}'),
                         [(runs(f'{c}{r}'), text(f'{d}{r}')) for c, d in (('C', 'D'), ('E', 'F'), ('G', 'H'), ('I', 'J'))]))
        elif rows:
            notes += first.split('\n')
        elif text(f'B{r}') == 'Course':
            wind_heading = first  # the header row: its A cell heads the wind column
        else:
            headings += first.split('\n')
    return headings, wind_heading, rows, notes


# --- PDF (the published cards) ---------------------------------------------

def pdf_runs(path):
    """(top, left, text, colour) for every run of same-coloured text on the
    card's single page.

    `pdftohtml -xml` breaks a line wherever the fill colour changes and names
    each run's colour in a fontspec, so the side is read from the colour the
    PDF sets for the glyphs — the document's own instruction — and not from a
    rendering of the page.
    """
    xml = subprocess.run(['pdftohtml', '-xml', '-i', '-stdout', path],
                         check=True, capture_output=True, text=True).stdout
    pages = ET.fromstring(xml).findall('page')
    if len(pages) != 1:
        sys.exit(f'{path}: expected a card of one page, found {len(pages)}')
    colours = {f.get('id'): (f.get('color') or '').lstrip('#') for f in pages[0].findall('fontspec')}
    return [(float(t.get('top')), float(t.get('left')), ''.join(t.itertext()), colours[t.get('font')])
            for t in pages[0].findall('text')]


def lines_of(runs):
    """Runs gathered into lines of the page: those whose tops are within a few
    points of each other, each line left to right, the lines down the page."""
    lines = []
    for run in sorted(runs):
        if lines and run[0] - lines[-1][0][0] <= 6:
            lines[-1].append(run)
        else:
            lines.append([run])
    return [sorted(line, key=lambda r: r[1]) for line in lines]


def verbatim(path, rows):
    """That the marks read out of the coloured runs really are the card's, and
    in its order.

    The grid `pdf_card` builds is geometry — which run falls in which cell —
    so it is checked against a reading that uses none of it: `-layout` sets
    each row of the table on a line of its own, and the letters of that line,
    its wind and course letter apart, are the row's four courses run
    together. A letter dropped, doubled or read out of order fails here.
    """
    lines = subprocess.run(['pdftotext', '-layout', path, '-'],
                           check=True, capture_output=True, text=True).stdout.splitlines()
    for wind, letter, columns in rows:
        head = re.compile(rf'\s*{re.escape(wind)}\s+{re.escape(letter)}\s+')
        printed = [re.sub(r'\s', '', line[m.end():])
                   for line in lines for m in [head.match(line)] if m]
        if len(printed) != 1:
            sys.exit(f'{path}: the {wind}° row is set on {len(printed)} lines of the text layer, not one')
        read = ''.join(ch for chars, _ in columns for ch, _ in chars if ch.strip())
        if printed[0] != read:
            sys.exit(f'{path}: the {wind}° row reads {read!r} by colour but {printed[0]!r} in the text layer')


def pdf_card(path):
    """The same, from a card the club has published as a PDF.

    The table's rules are drawn, not in the text layer, so the grid comes
    from the card's own headings: a run belongs to the row whose wind
    direction is printed nearest it down the left of the table, and to the
    column whose number is printed over it. Above the table is the card's
    heading, below it the card's notes, and left of the "Course" column the
    heading of the wind column — "Wind Direction +/- 10°", the tolerance
    included.
    """
    runs = pdf_runs(path)
    course = [i for i, r in enumerate(runs) if flat(r[2]) == 'Course']
    if len(course) != 1:
        sys.exit(f'{path}: expected one "Course" heading, found {len(course)}')
    header_top = runs[course[0]][0]
    numbers = [i for i, r in enumerate(runs)
               if flat(r[2]) in ('1', '2', '3', '4') and abs(r[0] - header_top) <= 6]
    columns = sorted(runs[i][1] for i in numbers)
    if len(columns) != 4:
        sys.exit(f'{path}: {len(columns)} of the four course columns are numbered over the "Course" heading')
    gutter = (columns[1] - columns[0]) / 2  # half a column: left of the first is the wind column

    winds = sorted((r[0], flat(r[2])) for r in runs
                   if r[1] < columns[0] - gutter and WIND_RE.fullmatch(flat(r[2])))
    if len(winds) < 2:
        sys.exit(f'{path}: {len(winds)} wind directions down the left of the table, expected the card\'s rows')
    pitch = min(b[0] - a[0] for a, b in zip(winds, winds[1:]))

    header = set(course) | set(numbers)
    above, below = [], []
    letters, cells = {}, {}
    for i, run in enumerate(runs):
        top, left, text, _ = run
        if i in header or not text.strip():
            continue
        row = min(winds, key=lambda w: abs(w[0] - top))
        if abs(row[0] - top) > pitch / 2:
            (below if top > winds[-1][0] else above).append(run)
        elif left >= columns[0] - gutter:
            cells.setdefault((row[1], max(c for c in range(4) if left >= columns[c] - gutter)), []).append(run)
        elif not WIND_RE.fullmatch(flat(text)):
            letters.setdefault(row[1], []).append(run)

    for _, wind in winds:
        if len(letters.get(wind, [])) != 1:
            sys.exit(f'{path}: the {wind}° row is labelled by {len(letters.get(wind, []))} runs, not one course letter')
        for column in range(4):
            if (wind, column) not in cells:
                sys.exit(f'{path}: the {wind}° row has no course in column {column + 1}')

    rows = [(wind, flat(letters[wind][0][2]),
             [([(ch, colour) for _, _, text, colour in sorted(cells[(wind, column)], key=lambda r: r[1])
                for ch in text], '')
              for column in range(4)])
            for _, wind in winds]
    verbatim(path, rows)

    # The card sets the degree sign of "+/- 10o" as a superscript letter o,
    # which comes out of the text layer as its own run.
    wind_column = ' '.join(flat(r[2]) for line in lines_of(r for r in above if r[1] < columns[0] - gutter)
                           for r in line)
    wind_heading = re.sub(r'(\d) o\b', r'\1°', wind_column)

    headings = [' '.join(flat(r[2]) for r in line)
                for line in lines_of(r for r in above if r[1] >= columns[0] - gutter)]
    notes = []
    for line in lines_of(below):
        text = flat(''.join(r[2] for r in line))
        # A note runs on over as many lines as it needs; a new one starts
        # where the card numbers it.
        if notes and not re.match(r'\d+[. ]', text):
            notes[-1] += ' ' + text
        else:
            notes.append(text)
    return headings, wind_heading, rows, notes


# --- the card ---------------------------------------------------------------

READERS = {'.pdf': pdf_card, '.docx': docx_card, '.xlsx': xlsx_card}


def build(path):
    reader = READERS.get(path[path.rfind('.'):].lower())
    if not reader:
        sys.exit(f'{path}: not a PDF, Word or Excel course card')
    headings, wind_heading, rows, notes = reader(path)
    if wind_heading is None:
        sys.exit(f'{path}: no header row')
    if not rows:
        sys.exit(f'{path}: no course rows')

    winds, courses = [], []
    for wind, letter, cells in rows:
        if not LETTER_RE.fullmatch(letter):
            sys.exit(f'{path}: the {wind}° row is labelled {letter!r}, not a course letter')
        winds.append((letter, wind))
        for column, (chars, distance) in enumerate(cells, 1):
            where = f'{path}: course {letter}{column}'
            course = {'id': f'{letter}{column}', 'windDirectionDeg': int(wind)}
            if distance:
                try:
                    course['distanceNm'] = round(float(distance), 2)
                except ValueError:
                    sys.exit(f'{where}: {distance!r} is not a distance')
            course['marks'] = marks_of(chars, where)
            courses.append(course)
    ids = [c['id'] for c in courses]
    if len(set(ids)) != len(ids):
        sys.exit(f'{path}: duplicate course ids: ' + ', '.join(sorted({i for i in ids if ids.count(i) > 1})))
    if len({w for _, w in winds}) != len(winds):
        sys.exit(f'{path}: two rows are headed the same wind direction')

    return courses, [
        {'title': 'Card heading', 'text': '\n'.join(headings)},
        {'title': 'Wind direction', 'text': f'{wind_heading}\n' + ', '.join(f'{letter} {wind}°' for letter, wind in winds)},
        {'title': 'Card notes', 'text': '\n'.join(notes)},
    ]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('card')
    ap.add_argument('--meta', help='JSON file whose keys (club, name, source, marks…) head the output')
    ap.add_argument('--notes', help='JSON list of {title, text} notes to carry after the card\'s own')
    ap.add_argument('--start-line', help="JSON for the card's start line, from tools/extract_start_line.py")
    args = ap.parse_args()
    meta = json.load(open(args.meta)) if args.meta else {}
    courses, notes = build(args.card)
    if args.notes:
        notes += json.load(open(args.notes))
    start = json.load(open(args.start_line)) if args.start_line else None
    emit(course_card_file(meta, start, notes, courses), sys.stdout)


if __name__ == '__main__':
    main()
