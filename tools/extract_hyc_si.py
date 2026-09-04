#!/usr/bin/env python3
"""Generate the marks and course card files from one of HYC's sailing
instructions that carries its course card in its last pages — the Brass
Monkey winter series: a "MARK LOCATION CARD" page with a picture of the
marks and a table (Mark, ID, North, West, degrees and decimal minutes), then
a "COURSE CARD" page: a table of NO., WIND and the course as a row of marks,
each a letter suffixed `p` (printed red, rounded to port) or `s` (green,
starboard), ending at the finish mark, which has no suffix.

    python3 tools/extract_hyc_si.py marks <si.pdf> --meta meta.json                 > marks.json
    python3 tools/extract_hyc_si.py card  <si.pdf> --meta meta.json [--notes n.json] > card.json
    python3 tools/extract_hyc_si.py notes <si.pdf> --sections 8,9,10,14             # SI sections as card notes

The SI is a real-text PDF; the tables are read from `pdftotext -bbox` word
positions, the instructions from `pdftotext -layout`. A mark the courses
use that the location table does not list must be the finish, and there
must be exactly one, ending every course: it is emitted without a position,
described from the SI's "The Finish" section (the mark's shape and colour,
and where the finish will be as its `placement`). The card's WIND column
is carried as the card's first note, not a course field — what the wind is
doing on the day is the caller's knowledge, not the library's. A word in a
course row that is not a mark stops the build.
"""

import argparse
import json
import re
import subprocess
import sys

from extract_dbsc_marks import lines, words

TOKEN_RE = re.compile(r'([A-Z])([ps])?([,.])')
WIND_RE = re.compile(r'[NSEW](/[NSEW])?')
SIDES = {'p': 'port', 's': 'starboard'}


def pages(pdf):
    n = int(re.search(r'^Pages:\s+(\d+)', subprocess.run(['pdfinfo', pdf], check=True, capture_output=True, text=True).stdout, re.M).group(1))
    return [words(pdf, page=i + 1) for i in range(n)]


def header_line(ws, *labels):
    """The line carrying all of `labels`, as {label: word}, or None."""
    for line in lines(ws):
        texts = {w['text']: w for w in line}
        if all(label in texts for label in labels):
            return texts
    return None


def dm(deg, minutes):
    """Degrees and decimal minutes, as printed, to decimal degrees."""
    return round(int(deg) + float(minutes) / 60, 6)


def parse_marks_page(ws, page_no):
    """The location table: [{id, name, position}] in the table's order."""
    header = header_line(ws, 'Mark', 'ID', 'North', 'West')
    if not header:
        return None
    cols = {k: header[k]['cx'] for k in ('Mark', 'ID', 'North', 'West')}
    cuts = [(cols['Mark'] + cols['ID']) / 2, (cols['ID'] + cols['North']) / 2, (cols['North'] + cols['West']) / 2]
    marks = []
    for line in lines(ws):
        if line[0]['cy'] <= header['Mark']['cy'] + 2:
            continue
        cells = [[], [], [], []]
        for w in line:
            cells[sum(w['cx'] > c for c in cuts)].append(w['text'])
        name, id_, north, west = (' '.join(c) for c in cells)
        if not re.fullmatch(r'[A-Z]', id_):
            if any(cells):
                break  # below the table: the footer
            continue
        if not (re.fullmatch(r'\d{2} \d\d?\.\d+', north) and re.fullmatch(r'\d{2} \d\d?\.\d+', west)):
            sys.exit(f'page {page_no}: mark {id_}: cannot read position {north!r} / {west!r}')
        marks.append({
            'id': id_,
            'name': name,
            'position': {'lat': dm(*north.split()), 'lng': -dm(*west.split())},  # west
        })
    if not marks:
        sys.exit(f'page {page_no}: a location table header but no rows')
    return marks


def parse_card_page(ws, page_no):
    """(courses, {id: wind}) from a course card page, or None if this is not one."""
    header = header_line(ws, 'NO.', 'WIND', 'COURSE', 'CARD')
    if not header:
        return None
    courses, winds = [], {}
    for line in lines(ws):
        if line[0]['cy'] <= header['NO.']['cy'] + 2 or not re.fullmatch(r'\d+', line[0]['text']):
            continue
        no, wind, *tokens = line
        if abs(no['cx'] - header['NO.']['cx']) > 15 or abs(wind['cx'] - header['WIND']['cx']) > 15:
            sys.exit(f'page {page_no}: row {no["text"]} is not under the NO. and WIND columns')
        if not WIND_RE.fullmatch(wind['text']):
            sys.exit(f'page {page_no}: course {no["text"]}: unexpected wind {wind["text"]!r}')
        marks = []
        for i, w in enumerate(tokens):
            m = TOKEN_RE.fullmatch(w['text'])
            last = i == len(tokens) - 1
            if not m or (m.group(3) == '.') != last:
                sys.exit(f'page {page_no}: course {no["text"]}: unexpected word {w["text"]!r}')
            entry = {'mark': m.group(1)}
            if m.group(2):
                entry['side'] = SIDES[m.group(2)]
            marks.append(entry)
        if not marks:
            sys.exit(f'page {page_no}: course {no["text"]} has no marks')
        courses.append({'id': no['text'], 'marks': marks})
        winds[no['text']] = wind['text']
    if not courses:
        sys.exit(f'page {page_no}: a course card header but no courses')
    return courses, winds


def read(pdf):
    """Everything the document says: the location table, the courses and their winds."""
    marks, courses, winds = [], [], {}
    for i, ws in enumerate(pages(pdf)):
        found = parse_marks_page(ws, i + 1)
        if found:
            marks += found
        found = parse_card_page(ws, i + 1)
        if found:
            courses += found[0]
            winds.update(found[1])
    if not marks:
        sys.exit('no MARK LOCATION CARD table found')
    if not courses:
        sys.exit('no COURSE CARD table found')
    ids = [c['id'] for c in courses]
    if len(set(ids)) != len(ids):
        sys.exit('duplicate course numbers: ' + ', '.join(sorted({i for i in ids if ids.count(i) > 1})))
    return marks, courses, winds


def layout_text(pdf):
    return subprocess.run(['pdftotext', '-layout', pdf, '-'], check=True, capture_output=True, text=True).stdout


HEADING_RE = re.compile(r'^\s{0,6}(\d+)\.\s+(\S.*?)\s*$')
ITEM_RE = re.compile(r'^\s+(\d+\.\d+)\s+(\S.*?)\s*$')
FOOTER_RE = re.compile(r'\bDraft [A-Z]\b.*\d{4}\s*$')


def sections(text):
    """The SI's numbered sections, {number: (title, [paragraph, ...])}. An
    item ("10.1 …") runs on over its wrapped lines until a blank line or the
    next item; a line after a blank that is not an item — a table row, a
    note — is a paragraph of its own."""
    out = {}
    current = None
    open_item = False
    for raw in text.split('\n'):
        line = re.sub(r'\s+', ' ', raw).strip()
        if FOOTER_RE.search(raw):
            continue
        if not line:
            open_item = False
            continue
        m = HEADING_RE.match(raw)
        if m and not re.match(r'\d', m.group(2)):
            current = out[m.group(1)] = (m.group(2), [])
            open_item = False
            continue
        if current is None:
            continue
        paras = current[1]
        item = ITEM_RE.match(raw)
        if item:
            paras.append(f'{item.group(1)} {item.group(2)}')
            open_item = True
        elif open_item:
            paras[-1] += ' ' + line
        else:
            paras.append(line)
    return out


def finish_mark(id_, text):
    """The finish, as the SI's "The Finish" section describes it."""
    finish = next((paras for title, paras in sections(text).values() if title.lower() == 'the finish'), None)
    if finish is None:
        sys.exit(f'mark {id_} is on no location table and the SI has no "The Finish" section to describe it')
    body = ' '.join(finish)
    mark = {'id': id_, 'name': 'Finish'}
    m = re.search(r'\b(?:a|an) (\w+) (\w+) (?:\w+ )?mark\b', body)
    if m:
        mark['shape'], mark['color'] = m.group(1).lower(), m.group(2).lower()
    m = re.search(r'all finishes will be (.+?)\.', body)
    if not m:
        sys.exit('cannot read where the finish will be from the SI\'s "The Finish" section')
    mark['placement'] = m.group(1)[0].upper() + m.group(1)[1:]
    return mark


def marks_file(pdf):
    marks, courses, _ = read(pdf)
    known = {m['id'] for m in marks}
    unlisted = sorted({cm['mark'] for c in courses for cm in c['marks']} - known)
    if len(unlisted) > 1:
        sys.exit('marks on courses but on no location table: ' + ', '.join(unlisted))
    if unlisted:
        finish = unlisted[0]
        for c in courses:
            if c['marks'][-1]['mark'] != finish:
                sys.exit(f'course {c["id"]} does not end at {finish}, the mark on no location table')
        marks.append(finish_mark(finish, layout_text(pdf)))
    return marks


def card_file(pdf):
    _, courses, winds = read(pdf)
    wind_note = ', '.join(f'{c["id"]} {winds[c["id"]]}' for c in courses)
    return courses, [{'title': 'Wind', 'text': wind_note}]


def notes_file(pdf, numbers):
    found = sections(layout_text(pdf))
    out = []
    for n in numbers:
        if n not in found:
            sys.exit(f'the SI has no section {n}')
        title, paras = found[n]
        out.append({'title': f'{n}. {title}', 'text': '\n'.join(paras)})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('what', choices=['marks', 'card', 'notes'])
    ap.add_argument('pdf')
    ap.add_argument('--meta', help='JSON file whose keys (club, name, source, marks…) head the output')
    ap.add_argument('--notes', help='card: JSON list of {title, text} notes to carry after the card\'s own')
    ap.add_argument('--sections', default='', help='notes: comma-separated SI section numbers to carry')
    args = ap.parse_args()
    meta = json.load(open(args.meta)) if args.meta else {}
    if args.what == 'marks':
        out = {'formatVersion': 1, **meta, 'marks': marks_file(args.pdf)}
    elif args.what == 'card':
        courses, notes = card_file(args.pdf)
        if args.notes:
            notes += json.load(open(args.notes))
        out = {'formatVersion': 1, **meta, 'notes': notes, 'courses': courses}
    else:
        if not args.sections:
            sys.exit('notes: --sections is required')
        out = notes_file(args.pdf, args.sections.split(','))
    json.dump(out, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write('\n')


if __name__ == '__main__':
    main()
