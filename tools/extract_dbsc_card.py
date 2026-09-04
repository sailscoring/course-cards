#!/usr/bin/env python3
"""Generate a course card file from one of DBSC's course cards.

The cards are real-text PDFs laid out as the club prints them: sections
lettered A–R (no I, no O), each headed with a bearing ("A 000°", "B 022°"
… the 16 compass points, the wind direction the section's courses are set
for) and listing courses 1–8 (1–5 on the Tuesday card) as rows of marks,
each mark a letter or digit suffixed `p` (red, rounded to port) or `s`
(green, starboard). The Red Fleet card prints bare letters and says "All
marks to be rounded to Port" instead. Sections sit in two or three columns;
the text under and beside them is the card's notes, and the section
headings are carried as a note too — the format keeps wind out of the
course description, and the heading is the card's, not the library's.

    python3 tools/extract_dbsc_card.py <card.pdf> --meta meta.json [--notes notes.json] > card.json

The sides come from the suffixes, or from the "All marks to be rounded to
Port" note when there are none; a mark the notes say is "to be passed"
rather than rounded (the Turning mark X on the hut cards) is a passing
mark. A word in a course row that is not a mark stops the build.
"""

import argparse
import json
import re
import subprocess
import sys

from extract_dbsc_marks import lines, words

TOKEN_RE = re.compile(r'([A-Z0-9])([ps])?')
HEADER_RE = re.compile(r'(\d{3})°')
SIDES = {'p': 'port', 's': 'starboard'}
# The title block's items; a line made only of these is not a note.
TITLE_RE = re.compile(r'AIB DBSC .* \d{4}$|CC\d - .*|VHF Channel \d+|Page \d of \d|Version \d+|\d\d/\d\d/\d{4}')


def pages(pdf):
    n = int(re.search(r'^Pages:\s+(\d+)', subprocess.run(['pdfinfo', pdf], check=True, capture_output=True, text=True).stdout, re.M).group(1))
    return [words(pdf, page=i + 1) for i in range(n)]


def parse_page(ws, page_no):
    """(courses, note lines) from one page's words."""
    used = set()
    headers = []  # (letter word, wind)
    for w in ws:
        m = HEADER_RE.fullmatch(w['text'])
        if not m:
            continue
        left = [v for v in ws if abs(v['cy'] - w['cy']) < 3 and v['x1'] <= w['x0'] and re.fullmatch(r'[A-Z]', v['text'])]
        if not left:
            sys.exit(f'page {page_no}: heading {w["text"]} has no section letter')
        letter = max(left, key=lambda v: v['x1'])
        headers.append((letter, int(m.group(1))))
        used.update((id(letter), id(w)))
    if not headers:
        sys.exit(f'page {page_no}: no course sections')
    # Columns: the distinct x positions of the section letters.
    xs = []
    for letter, _ in headers:
        if not any(abs(letter['x0'] - x) < 5 for x in xs):
            xs.append(letter['x0'])
    xs.sort()
    edges = xs + [max(w['x1'] for w in ws) + 1]

    def column(x):
        for i in range(len(xs)):
            if xs[i] - 5 <= x < edges[i + 1] - 5:
                return i
        return None

    courses = []
    sections = {}
    for letter, wind in sorted(headers, key=lambda h: h[0]['text']):  # the card's order: A, B, C…
        col = column(letter['x0'])
        below = [h for h in headers if column(h[0]['x0']) == col and h[0]['cy'] > letter['cy']]
        bottom = min((h[0]['cy'] for h in below), default=float('inf'))
        anchors = [w for w in ws if re.fullmatch(r'[1-8]', w['text']) and abs(w['x0'] - letter['x0']) < 5 and letter['cy'] < w['cy'] < bottom]
        sections[letter['text']] = wind
        for a in sorted(anchors, key=lambda w: w['cy']):
            used.add(id(a))
            row = [w for w in ws if abs(w['cy'] - a['cy']) < 3 and w['x0'] > a['x1'] and column(w['x0']) == col]
            marks = []
            for w in sorted(row, key=lambda w: w['x0']):
                m = TOKEN_RE.fullmatch(w['text'])
                if not m:
                    sys.exit(f'page {page_no}: course {letter["text"]}{a["text"]}: unexpected word {w["text"]!r}')
                used.add(id(w))
                marks.append((m.group(1), m.group(2)))
            if not marks:
                sys.exit(f'page {page_no}: course {letter["text"]}{a["text"]} has no marks')
            courses.append({'id': letter['text'] + a['text'], 'tokens': marks})
    # Everything else is notes, less the title block.
    rest = [w for w in ws if id(w) not in used]
    notes = []
    for line in lines(rest):
        line.sort(key=lambda w: w['x0'])
        segments = [[line[0]]]  # a wide gap separates the title block's items
        for prev, w in zip(line, line[1:]):
            if w['x0'] - prev['x1'] < 30:
                segments[-1].append(w)
            else:
                segments.append([w])
        texts = [' '.join(w['text'] for w in s) for s in segments]
        if all(not TITLE_RE.sub('', t).strip() for t in texts):
            continue
        notes.extend(texts)
    return courses, sections, notes


def paragraphs(note_lines):
    """Printed lines to paragraphs: a line continues the previous one when
    that one ended without punctuation and this one starts lowercase."""
    out = []
    for text in note_lines:
        if out and not re.search(r'[.:;!?]$', out[-1]) and text[:1].islower():
            out[-1] += ' ' + text
        else:
            out.append(text)
    seen = set()
    return [p for p in out if not (p in seen or seen.add(p))]  # page 2 repeats page 1's


def build(pdf):
    courses, sections, note_lines = [], {}, []
    for i, ws in enumerate(pages(pdf)):
        c, s, n = parse_page(ws, i + 1)
        courses += c
        for letter, bearing in s.items():
            if sections.setdefault(letter, bearing) != bearing:
                sys.exit(f'section {letter} is headed {sections[letter]:03d}° on one page and {bearing:03d}° on another')
        note_lines += n
    paras = paragraphs(note_lines)
    text = '\n'.join(paras)
    default_side = 'port' if re.search(r'All marks to be rounded to Port', text) else None
    passing = set(re.findall(r'except (?:\w+ \()?([A-Z0-9])\)? to be passed', text))
    out = []
    for c in courses:
        marks = []
        for mark, suffix in c['tokens']:
            side = SIDES[suffix] if suffix else default_side
            if not side:
                sys.exit(f'course {c["id"]}: mark {mark} has no side and the card does not say')
            entry = {'mark': mark, 'side': side}
            if mark in passing:
                entry['passing'] = True
            marks.append(entry)
        out.append({'id': c['id'], 'marks': marks})
    ids = [c['id'] for c in out]
    if len(set(ids)) != len(ids):
        sys.exit('duplicate course ids: ' + ', '.join(sorted({i for i in ids if ids.count(i) > 1})))
    headings = ', '.join(f'{letter} {bearing:03d}°' for letter, bearing in sorted(sections.items()))
    return out, [{'title': 'Course sections', 'text': headings}, {'title': 'Card notes', 'text': text}]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pdf')
    ap.add_argument('--meta', help='JSON file whose keys (club, name, source, marks…) head the output')
    ap.add_argument('--notes', help='JSON list of {title, text} notes to carry after the card\'s own')
    args = ap.parse_args()
    meta = json.load(open(args.meta)) if args.meta else {}
    courses, notes = build(args.pdf)
    if args.notes:
        notes += json.load(open(args.notes))
    out = {'formatVersion': 1, **meta, 'notes': notes, 'courses': courses}
    json.dump(out, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write('\n')


if __name__ == '__main__':
    main()
