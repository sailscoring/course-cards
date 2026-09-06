#!/usr/bin/env python3
"""Render a source PDF as Markdown, so its text is greppable and diffable.

The sailing instructions a course card is read with are kept in `source/`
verbatim, and each gets a `.md` sidecar written by this tool — the practice
the sibling `reference-docs` store follows for third-party documents. The
PDF stays the source of truth; the Markdown is a derived artifact, listed in
the data set's manifest as a `documents` entry and rewritten and verified by
tools/regenerate.py like every other output.

The rendering is mechanical and deterministic: `pdftotext` (the tool the
extractors already read these PDFs with), running headers and footers
dropped, wrapped prose rejoined into paragraphs, numbered clauses turned
into headings, and anything laid out in columns — the schedules and mark
tables — kept verbatim in a code block, where its alignment survives.

    python3 tools/pdf_markdown.py source/SI.pdf [--title T] [--columns SPEC]

`--columns` says how many columns a page is set in, since `-layout` would
otherwise interleave them line by line: `2@2-3` reads pages 2 and 3 as two
columns, one strip of the page at a time, and every other page as one.
"""

import argparse
import re
import subprocess
import sys

# A run of four or more spaces inside a line: the signature of text laid out
# in columns, which only survives verbatim. Three would catch the wide
# sentence spacing these documents are typeset with.
COLUMNED = re.compile(r'\S {4,}\S')
# "4.2", "B4", "A3.", "12.1" — the label a sailing instruction's clauses and
# sections are numbered with. A bare number is not one: a wrapped line can
# begin with a figure ("… (marked O, / 2, 3 respectively …)", "1000 on the
# day it takes effect"), so a label needs a letter or a dot to be a label.
LABEL_RE = r'(?:[A-Z]\d{1,2}(?:\.\d{1,2})*\.?|\d{1,2}(?:\.\d{1,2})+\.?|\d{1,2}\.)'
LABEL = re.compile(r'^(' + LABEL_RE + r')(?=\s|$)')
# That label set off from its clause by the hanging indent these documents
# are typeset with — spacing, not a column.
HANGING = re.compile(r'^(\s*)(' + LABEL_RE + r') {2,}(?=\S)')
# "B Starting Line –", "2. Measurement –": a short line closed by a spaced
# dash, the way these instructions head an item. The space keeps a word
# broken across a line out of it.
DASH_HEAD = re.compile(r'^(.{1,58}?)\s+[–-]$')


def columns_spec(spec):
    """`--columns` parsed: page number → how many columns it is set in."""
    counts = {}
    for part in filter(None, (spec or '').split(',')):
        n, _, span = part.partition('@')
        first, _, last = span.partition('-')
        for page in range(int(first or 1), int(last or first or 1) + 1):
            counts[page] = int(n)
    return counts


def gutters(lines, n):
    """The character positions of the n-1 gutters of a page set in columns:
    the widest runs of character positions that are blank on every line but
    a few (a heading spanning the page is one of the few), taken from the
    middle of the page rather than its margins."""
    body = [l for l in lines if l.strip()]
    width = max(len(l) for l in body)
    clear = [c for c in range(width) if sum(c >= len(l) or l[c] == ' ' for l in body) >= 0.9 * len(body)]
    bands = []
    for c in clear:
        if bands and bands[-1][-1] == c - 1:
            bands[-1].append(c)
        else:
            bands.append([c])
    inner = [b for b in bands if b[0] > width * 0.1 and b[-1] < width * 0.9]
    widest = sorted(sorted(inner, key=len, reverse=True)[: n - 1], key=lambda b: b[0])
    return [(b[0] + b[-1] + 1) // 2 for b in widest]


def decolumn(lines, n):
    """A page set in n columns read column by column instead of line by line.
    `-layout` keeps every line's horizontal position, so the columns can be
    cut apart at the gutters; a line whose text crosses a gutter spans the
    page, and is emitted whole between the bands it separates."""
    cuts = gutters(lines, n)
    if len(cuts) != n - 1:
        return lines
    out = []
    band = [[] for _ in cuts + [None]]
    def flush():
        for column in band:
            out.extend(column)
            column.clear()
    for line in lines:
        if any(c < len(line) and line[max(0, c - 1):c + 2].strip() for c in cuts):
            flush()
            out.append(line)
            continue
        for i, (a, b) in enumerate(zip([0] + cuts, cuts + [len(line)])):
            piece = line[a:b].rstrip()
            # A line blank in this column but not in its neighbour is an
            # artifact of cutting the page up, not a paragraph break; only a
            # line blank right across the page is one.
            if piece or not line.strip():
                band[i].append(piece)
    flush()
    return out


def pages(pdf, columns):
    """The PDF's pages as lists of lines, trailing space stripped."""
    text = subprocess.run(['pdftotext', '-layout', pdf, '-'], check=True, capture_output=True, text=True).stdout
    counts = columns_spec(columns)
    out = []
    for number, page in enumerate(text.split('\f'), 1):
        lines = [line.rstrip() for line in page.split('\n')]
        n = counts.get(number, 1)
        out.append(decolumn(lines, n) if n > 1 and any(l.strip() for l in lines) else lines)
    return out


def shape(line):
    """A line with its numbers, dates and spacing taken out, so the same
    running header on two pages compares equal."""
    return re.sub(r'\s+', ' ', re.sub(r'[\d/]+', '', line)).strip()


def furniture(pages):
    """The running headers and footers: lines within two of a page's top or
    bottom whose shape — the text with its numbers and dates taken out —
    repeats on most of the pages. A page number alone qualifies too."""
    seen = {}
    for page in pages:
        body = [i for i, line in enumerate(page) if line.strip()]
        if not body:
            continue
        edges = body[:3] + body[-3:]
        for edge in {shape(page[i]) for i in edges}:
            seen[edge] = seen.get(edge, 0) + 1
    enough = max(2, len([p for p in pages if any(l.strip() for l in p)]) // 2)
    return {edge for edge, n in seen.items() if n >= enough}


def blocks(lines):
    """The lines grouped into blocks separated by blank lines."""
    out = []
    current = []
    for line in lines:
        if line.strip():
            current.append(line)
        elif current:
            out.append(current)
            current = []
    if current:
        out.append(current)
    return out


def clauses(block):
    """A block split where a new clause begins: a line carrying a label at
    the indent the block started at, a line indented less than that (the end
    of a centred title, say), the line after a heading, or a short centred
    line between two finished clauses (the "Course Card" and "Platonic
    Course" cross-heads), or a line laid out in columns where the one before
    it was not, or the other way about — a schedule inside a section is a
    clause of its own, and stays verbatim without taking the prose around it
    with it. A line indented further is the same clause, wrapped."""
    out = []
    current = []
    base = None
    for line in block:
        indent = len(line) - len(line.lstrip())
        text = line.strip()
        ruled = bool(COLUMNED.search(line)) != any(COLUMNED.search(l) for l in current)
        labelled = (LABEL.match(text) or DASH_HEAD.match(text)) and (base is None or indent <= base + 2)
        crosshead = (
            current
            and indent > base
            and len(text) <= 40
            and text.lstrip('“"\'(').startswith(tuple(chr(c) for c in range(65, 91)))
            and not text.endswith(('.', ',', ';', ':'))
            and current[-1].rstrip().endswith(('.', ']'))
        )
        if current and (labelled or crosshead or ruled or indent < base or (len(current) == 1 and heading(paragraph(current)))):
            out.append(current)
            current = []
            base = None
        if base is None:
            base = indent
        current.append(line)
    if current:
        out.append(current)
    return out


def paragraph(lines):
    """Wrapped prose rejoined: one space between lines, a word broken across
    a line rejoined whole."""
    text = ''
    for line in lines:
        piece = line.strip()
        if text.endswith('-') and not text.endswith(('--', '- ')):
            text = text[:-1] + piece
        elif text:
            text += ' ' + piece
        else:
            text = piece
    return re.sub(r'\s+', ' ', text)


def heading(text):
    """The Markdown heading a line of prose is, or None. A section's label
    and title on their own short line ("H4 The Start", "10. Marks"), a short
    titled clause ("6.2 Inshore Committee Vessel Starts"), or a short line
    in capitals; everything else is prose."""
    dash = DASH_HEAD.match(text)
    if dash:
        return '## ' + dash.group(1)
    if len(text) > 60 or text.endswith(('.', ',', ';', ':', '-', '–')):
        return None
    label = LABEL.match(text)
    rest = text[label.end():].strip() if label else text
    if not rest or rest[0].islower():
        return None
    if label and (re.fullmatch(r'[A-Z]?\d+\.?', label.group(1)) or len(rest) <= 45):
        return '## ' + text
    if not label and text == text.upper() and re.search(r'[A-Z]{3}', text):
        return '## ' + text
    return None


def parts(pdf, columns=None):
    """The document as a list of Markdown blocks in reading order: headings
    ("## H4 The Start"), paragraphs, and fenced blocks of columned text."""
    doc = pages(pdf, columns)
    drop = furniture(doc)
    out = []
    for page in doc:
        for block in blocks(page):
            block = [HANGING.sub(r'\1\2 ', l) for l in block if shape(l) not in drop]
            if not block:
                continue
            for clause in clauses(block):
                if any(COLUMNED.search(l) for l in clause):
                    indent = min(len(l) - len(l.lstrip()) for l in clause)
                    out.append('```text\n' + '\n'.join(l[indent:] for l in clause) + '\n```')
                    continue
                text = paragraph(clause)
                out.append(heading(text) or text)
    return out


def render(pdf, title, columns):
    out = parts(pdf, columns)
    if not title:
        title = next((line for line in out if not line.startswith('```')), pdf)
        title = title.lstrip('# ')
    return f'# {title}\n\n' + '\n\n'.join(out) + '\n'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pdf')
    ap.add_argument('--title', help='the document\'s title; the first line of text by default')
    ap.add_argument('--columns', help='how many columns a page is set in, e.g. "2@2-3"')
    args = ap.parse_args()
    sys.stdout.write(render(args.pdf, args.title, args.columns))


if __name__ == '__main__':
    main()
