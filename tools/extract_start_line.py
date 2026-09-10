#!/usr/bin/env python3
"""Read a card's start line out of the sailing instructions that define it.

A course card names the marks of each course but not where the race starts:
that is in the club's sailing instructions, which say either where a line is
laid on the day ("between a red and white staff on the committee vessel …")
or, where it is fixed, exactly where it is ("a transit formed by bringing in
line the two triangles above the West Pier Hut"). Either way it is the same
kind of thing as HYC's Zephyr or Finish — a mark of the course with a
`placement` and no position — so the card carries it as its `startLine` and
every course begins there.

The clauses are picked out of the SI's own text (tools/pdf_markdown.py reads
the document into headings and clauses; this selects from them), so the
`placement` is the club's wording, quoted, not a paraphrase.

    python3 tools/extract_start_line.py source/SI.pdf --clauses 4.1,4.2 \\
        [--after "H4 The Start"] [--columns 2@2-3] --meta meta.json

`--clauses` names either a numbered clause ("4.1") or a heading ("B Starting
Line", whose paragraphs are taken together); `--after` scopes the search to
what follows a heading, for an SI that defines more than one start line.
`--meta` supplies the id, name and citation the format's `startLine` carries
alongside the placement this reads.
"""

import argparse
import json
import re
import sys

sys.path.insert(0, __file__.rsplit('/', 1)[0])
from pdf_markdown import pages, parts  # noqa: E402


def verbatim(pdf, columns, text):
    """That the placement really is what the document says, not something the
    paragraph rejoining made up: the text, its spacing normalised, has to
    appear in the document's own lines."""
    flat = re.sub(r'\s+', ' ', ' '.join(line for page in pages(pdf, columns) for line in page))
    if re.sub(r'\s+', ' ', text) not in flat:
        sys.exit(f'the text read is not in {pdf} verbatim:\n{text}')


def after(items, heading):
    """The document from the named heading or clause on, so a key that occurs
    under each of an SI's several start lines resolves to the right one. Which
    of the two it is depends on the SI: HYC headed its 2025 start lines
    "OFFSHORE COMMITTEE BOAT STARTS" and numbered its 2026 ones "6.1 Offshore
    Committee Vessel Starts:" within a "Schedule of Races" section."""
    for i, part in enumerate(items):
        if not part.startswith('```') and (part[3:] if part.startswith('## ') else part).startswith(heading):
            return items[i + 1:]
    sys.exit(f'nothing headed or numbered "{heading}" in the document')


def clause(items, key):
    """The text of a clause or of a heading's section, the label or heading
    itself dropped: what the instruction says, as prose."""
    for i, part in enumerate(items):
        if part.startswith('## ') and (part[3:] == key or part[3:].startswith(key + ' ')):
            body = []
            for rest in items[i + 1:]:
                if rest.startswith('## '):
                    break
                if not rest.startswith('```'):
                    body.append(rest)
            if body:
                return ' '.join(body)
        if not part.startswith(('## ', '```')) and (part == key or part.startswith(key + ' ')):
            # The key itself is the clause's label — a number, or the letter
            # and name of a lettered section the SI sets as a run-on rather
            # than as a heading — and what it introduces is the instruction.
            return part[len(key):].strip() or part
    sys.exit(f'no clause "{key}" in the document')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pdf')
    ap.add_argument('--clauses', required=True, help='the clauses or headings that define the line')
    ap.add_argument('--after', help='scope the search to what follows this heading')
    ap.add_argument('--columns', help='how many columns a page is set in, e.g. "2@2-3"')
    ap.add_argument('--meta', required=True, help='JSON with the start line\'s id, name and citation')
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
        sys.exit('--meta must give the start line an id')
    start = {'id': meta['id']}
    if meta.get('name'):
        start['name'] = meta['name']
    start['placement'] = placement
    if meta.get('source'):
        start['source'] = meta['source']
    print(json.dumps(start, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
