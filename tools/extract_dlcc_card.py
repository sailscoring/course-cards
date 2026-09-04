#!/usr/bin/env python3
"""Generate the course card file from the Dun Laoghaire Combined Clubs regatta
sailing instructions, whose Addendum A carries "Course Card A" as a picture:
16 sections lettered A–R (no I, no O), one per compass point, each headed
by its letter in red and its wind in blue ("NORTH 000", "NNE 022.5", …),
and each listing courses 1–4 as a bold number and a row of black mark
letters — DBSC's racing marks, all rounded to port (A1.6).

    python3 tools/extract_dlcc_card.py cluster <si.pdf> <workdir>       # one-off: label the glyph shapes
    python3 tools/extract_dlcc_card.py card <si.pdf> --templates <dir> --meta meta.json [--notes n.json] > card.json
    python3 tools/extract_dlcc_card.py notes <si.pdf> --sections A1,A2,A3   # addendum sections as card notes

The card page is the one whose text layer is the title "Course Card A";
the card is the largest image on it, read as it is embedded, so the glyphs
are whatever the club rendered. The red letters place the sections on a
3 × 6 grid; the dark glyphs inside a section are grouped into lines, the
first glyph of each being the course number (which must run 1–4, as a
check on the segmentation), the rest its marks; the glyphs on the heading
line right of the letter are the wind, read word by word. Every glyph is
recognised by nearest-template matching against `templates/<name>/<LABEL>-
<n>.png` (the `dot` label is the decimal point), as `extract_card.py`
does for HYC's cards, and one whose best match is not clearly ahead of the
runner-up stops the build unless an `--overrides` entry resolves it. The
sides come from the addendum's "All marks shall be rounded to port"; if it
does not say so, the build stops.

The card's notes: the section headings as "Course sections", the card
page's own printed text as "Card notes", then whatever `--notes` carries —
`notes` mode prints the addendum sections named, each item as one
paragraph with its number, from `pdftotext -layout`.
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile

from PIL import Image, ImageChops, ImageDraw, ImageOps

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract_card import components, distance, emit, feature, load_templates, recognise  # noqa: E402

LABELS = {'dot': '.'}
HEADING_RE = re.compile(r'^[A-Z]+ \d{3}(\.\d)?$')
SECTION_RE = re.compile(r'^\s*([A-Z]\d)\.\s+(.+?)\s*$')
PAGE_HEADER = 'DUN LAOGHAIRE COMBINED CLUBS'
ITEM_RE = re.compile(r'^\s*(\d\.\d+)\s+(.+?)\s*$')


# --- the card image -----------------------------------------------------------

def page_texts(pdf):
    text = subprocess.run(['pdftotext', '-layout', pdf, '-'], check=True, capture_output=True, text=True).stdout
    return text.split('\f')[:-1] if text.endswith('\f') else text.split('\f')


def card_page(texts):
    pages = [i + 1 for i, t in enumerate(texts) if any(line.strip() == 'Course Card A' for line in t.splitlines())]
    if len(pages) != 1:
        sys.exit(f'expected one page titled "Course Card A", found {len(pages)}')
    return pages[0]


def card_image(pdf, page):
    tmp = tempfile.mkdtemp()
    subprocess.run(['pdfimages', '-f', str(page), '-l', str(page), '-png', pdf, os.path.join(tmp, 'im')], check=True)
    images = [Image.open(os.path.join(tmp, f)) for f in sorted(os.listdir(tmp))]
    if not images:
        sys.exit(f'page {page}: no images')
    im = max(images, key=lambda i: i.width * i.height).convert('RGB')
    # A glyph flush with the picture's edge still needs a margin to be cropped with.
    return ImageOps.expand(im, 16, 'white')


def masks(im):
    r, g, b = im.split()
    brightest = ImageChops.lighter(r, ImageChops.lighter(g, b))
    saturation = ImageChops.subtract(brightest, ImageChops.darker(r, ImageChops.darker(g, b)))
    dark = ImageChops.multiply(brightest.point(lambda v: 255 if v < 160 else 0), saturation.point(lambda v: 255 if v < 50 else 0))
    redness = ImageChops.subtract(r, ImageChops.lighter(g, b))
    red = ImageChops.multiply(redness.point(lambda v: 255 if v > 60 else 0), r.point(lambda v: 255 if v > 140 else 0))
    # The blue heading text is anti-aliased into its neighbours in the club's
    # JPEG; only the strokes' cores count, so touching letters stay apart.
    ink = brightest.point(lambda v: 255 if v < 190 else 0)
    return dark, red, ink


def glyphs_of(mask, min_pixels):
    return [{'box': box, 'pixels': n} for box, n in components(mask) if n >= min_pixels]


def centre(g):
    x0, y0, x1, y1 = g['box']
    return (x0 + x1) / 2, (y0 + y1) / 2


def text_lines(glyphs, glyph_h):
    """Glyphs grouped into lines by vertical centre, each line left to right."""
    glyphs = sorted(glyphs, key=lambda g: centre(g)[1])
    lines = []
    for g in glyphs:
        cy = centre(g)[1]
        if lines and abs(cy - lines[-1][0]) < glyph_h * 0.6:
            lines[-1][1].append(g)
        else:
            lines.append([cy, [g]])
    return [sorted(items, key=lambda g: g['box'][0]) for _, items in lines]


def words_of(line, glyph_h):
    """A line's glyphs split into words at gaps wider than a letter's spacing."""
    words = [[line[0]]]
    for prev, g in zip(line, line[1:]):
        if g['box'][0] - prev['box'][2] > glyph_h * 0.25:
            words.append([g])
        else:
            words[-1].append(g)
    return words


def read_card(pdf):
    """The picture and its sections: [{letter, heading: [[glyph…]…], rows: [[glyph…]…]}] in reading order."""
    im = card_image(pdf, card_page(page_texts(pdf)))
    dark, red, ink = masks(im)
    letters = glyphs_of(red, 8)
    if not letters:
        sys.exit('no red section letters found')
    heights = sorted(g['box'][3] - g['box'][1] for g in letters)
    glyph_h = heights[len(heights) // 2]
    # Columns: the letters' left edges, clustered.
    columns = []
    for g in sorted(letters, key=lambda g: g['box'][0]):
        if columns and g['box'][0] - columns[-1] < glyph_h * 3:
            continue
        columns.append(g['box'][0])
    margin = glyph_h // 2
    for g in letters:
        g['column'] = max(i for i, x in enumerate(columns) if x <= g['box'][0] + margin)
    letters.sort(key=lambda g: (round(g['box'][1] / (glyph_h * 4)), g['column']))
    sections = []
    for g in letters:
        x0 = columns[g['column']] - margin
        x1 = columns[g['column'] + 1] - margin if g['column'] + 1 < len(columns) else im.width
        below = [h['box'][1] for h in letters if h['column'] == g['column'] and h['box'][1] > g['box'][1]]
        y0, y1 = g['box'][1] - margin, (min(below) - margin) if below else im.height
        sections.append({'letter': g, 'area': (x0, y0, x1, y1)})
    dark_glyphs = [g for g in glyphs_of(dark, 8) if g['box'][3] - g['box'][1] >= glyph_h * 0.6]
    ink_glyphs = glyphs_of(ink, 4)
    for s in sections:
        x0, y0, x1, y1 = s['area']
        inside = lambda g: x0 <= centre(g)[0] < x1 and y0 <= centre(g)[1] < y1  # noqa: E731
        lx0, ly0, lx1, ly1 = s['letter']['box']
        heading = [g for g in ink_glyphs if inside(g) and g['box'][0] > lx1 and ly0 - margin < centre(g)[1] < ly1 + margin]
        s['heading'] = words_of(sorted(heading, key=lambda g: g['box'][0]), glyph_h) if heading else []
        s['rows'] = text_lines([g for g in dark_glyphs if inside(g) and centre(g)[1] > ly1], glyph_h)
        for g in [s['letter']] + [g for w in s['heading'] for g in w] + [g for r in s['rows'] for g in r]:
            g['feature'] = feature(im, g['box'])
    return im, sections


def all_glyphs(sections):
    """Every glyph with a key naming where it is on the card: `<section>/letter`,
    `<section>/heading/<word>/<glyph>`, `<section>/<row>/<glyph>` — indices
    before the glyphs are recognised, so a key is stable across runs."""
    for si, s in enumerate(sections):
        yield f'{si}/letter', s['letter']
        for wi, w in enumerate(s['heading']):
            for gi, g in enumerate(w):
                yield f'{si}/heading/{wi}/{gi}', g
        for ri, r in enumerate(s['rows']):
            for gi, g in enumerate(r):
                yield f'{si}/{ri}/{gi}', g


# --- cluster mode: label the card's glyph shapes ------------------------------

def cmd_cluster(args):
    im, sections = read_card(args.pdf)
    os.makedirs(args.workdir, exist_ok=True)
    glyphs = [dict(g, key=key) for key, g in all_glyphs(sections)]
    clusters = []
    for g in glyphs:
        best = min(((distance(g['feature'], c['proto']), k) for k, c in enumerate(clusters)), default=None)
        if best and best[0] < args.threshold:
            clusters[best[1]]['members'].append(g)
        else:
            clusters.append({'proto': g['feature'], 'members': [g]})
    print(f'{len(glyphs)} glyphs in {len(clusters)} clusters', file=sys.stderr)
    cs, per_row = 40, 20
    sheet = Image.new('RGB', (cs * (per_row + 2), cs * len(clusters)), 'white')
    draw = ImageDraw.Draw(sheet)
    for k, c in enumerate(clusters):
        members = c['members']
        medoid = min(members, key=lambda g: sum(distance(g['feature'], h['feature']) for h in members[:40]))
        medoid['feature'].save(os.path.join(args.workdir, f'cluster-{k}.png'))
        draw.text((4, k * cs + 4), f'{k} ({len(members)})', fill='blue')
        for j, g in enumerate(members[:per_row]):
            x0, y0, x1, y1 = g['box']
            crop = im.crop((x0 - 4, y0 - 4, x1 + 4, y1 + 4)).resize(((x1 - x0 + 8) * 2, (y1 - y0 + 8) * 2))
            crop.thumbnail((cs - 4, cs - 4))
            sheet.paste(crop, ((j + 2) * cs, k * cs + 2))
    sheet.save(os.path.join(args.workdir, 'clusters.png'))
    json.dump([[g['key'] for g in c['members']] for c in clusters], open(os.path.join(args.workdir, 'clusters.json'), 'w'), indent=1)


# --- card mode -----------------------------------------------------------------

def cmd_card(args):
    texts = page_texts(args.pdf)
    if not re.search(r'All marks shall be rounded to port', '\n'.join(texts), re.I):
        sys.exit('the addendum does not say all marks are rounded to port; the sides are unknown')
    im, sections = read_card(args.pdf)
    templates = [(LABELS.get(label, label), t) for label, t in load_templates(args.templates)]
    overrides = json.load(open(args.overrides)) if args.overrides else {}
    meta = json.load(open(args.meta)) if args.meta else {}
    if args.review:
        os.makedirs(args.review, exist_ok=True)
    problems = []

    def read(key, g):
        label, ok, d1, d2 = recognise(g, templates)
        if key in overrides:
            return overrides[key]
        if not ok:
            problems.append(f'{key}: best {label} ({d1:.3f}), runner-up {d2:.3f}')
            if args.review:
                x0, y0, x1, y1 = g['box']
                im.crop((x0 - 8, y0 - 8, x1 + 8, y1 + 8)).save(os.path.join(args.review, key.replace('/', '-') + '.png'))
        return label

    headings, courses = [], []
    for si, s in enumerate(sections):
        letter = read(f'{si}/letter', s['letter'])
        heading = ' '.join(''.join(read(f'{si}/heading/{wi}/{gi}', g) for gi, g in enumerate(w)) for wi, w in enumerate(s['heading']))
        if not HEADING_RE.match(heading):
            problems.append(f'section {letter}: heading {heading!r} is not a wind and a bearing')
        headings.append(f'{letter} {heading}')
        for ri, row in enumerate(s['rows']):
            glyphs = [read(f'{si}/{ri}/{gi}', g) for gi, g in enumerate(row)]
            number, marks = glyphs[0], glyphs[1:]
            if number != str(ri + 1):
                problems.append(f'section {letter}: row {ri + 1} is numbered {number!r}')
            if not marks:
                problems.append(f'section {letter}: course {number} has no marks')
            for m in marks:
                if not re.match(r'^[A-Z]$', m):
                    problems.append(f'section {letter}: course {number} has the glyph {m!r} for a mark')
            courses.append({'id': f'{letter}{number}', 'marks': [{'mark': m, 'side': 'port'} for m in marks]})
    ids = [c['id'] for c in courses]
    if len(set(ids)) != len(ids):
        problems.append('duplicate course ids: ' + ', '.join(sorted({i for i in ids if ids.count(i) > 1})))
    if problems:
        print('the card could not be read (unresolved glyphs go in --overrides after checking the image):', file=sys.stderr)
        for p in problems:
            print('  ' + p, file=sys.stderr)
        sys.exit(1)
    page_text = texts[card_page(texts) - 1]
    card_lines = [' '.join(line.split()) for line in page_text.splitlines() if line.strip()]
    card_notes = [line for line in card_lines if line not in ('DUN LAOGHAIRE COMBINED CLUBS', 'Course Card A', '2026')]
    notes = [{'title': 'Course sections', 'text': ', '.join(headings)}, {'title': 'Card notes', 'text': '\n'.join(card_notes)}]
    if args.notes:
        notes += json.load(open(args.notes))
    emit({'formatVersion': 1, **meta, 'notes': notes, 'courses': courses}, sys.stdout)


# --- notes mode: the addendum's sections ----------------------------------------

def addendum_sections(texts):
    """{number: (title, [item…])} for every `A<n>.` section of the SI, an item
    being its number and text, wrapped lines rejoined. A section ends at the
    next section heading, of any addendum, or at the next page's header."""
    out, current = {}, None
    for text in texts:
        for line in text.splitlines():
            m = SECTION_RE.match(line)
            if m:
                current = out.setdefault(m.group(1), (' '.join(m.group(2).split()), [])) if m.group(1)[0] == 'A' else None
                continue
            if line.strip() == PAGE_HEADER:
                current = None
            if current is None:
                continue
            m = ITEM_RE.match(line)
            if m:
                current[1].append(f'{m.group(1)} {" ".join(m.group(2).split())}')
            elif line.strip() and current[1]:
                current[1][-1] += ' ' + ' '.join(line.split())
    return out


def cmd_notes(args):
    found = addendum_sections(page_texts(args.pdf))
    notes = []
    for number in args.sections.split(','):
        if number not in found:
            sys.exit(f'no section {number} in the addendum (found {", ".join(found)})')
        title, items = found[number]
        notes.append({'title': f'{number}. {title}', 'text': '\n'.join(items)})
    json.dump(notes, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write('\n')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    c = sub.add_parser('cluster')
    c.add_argument('pdf')
    c.add_argument('workdir')
    c.add_argument('--threshold', type=float, default=0.06)
    c.set_defaults(func=cmd_cluster)
    b = sub.add_parser('card')
    b.add_argument('pdf')
    b.add_argument('--templates', required=True)
    b.add_argument('--meta', help='JSON file whose keys (club, name, source, marks…) head the output')
    b.add_argument('--notes', help='JSON list of {title, text} notes to carry after the card\'s own')
    b.add_argument('--overrides', help='JSON {"<glyph key>": "<LABEL>"} for glyphs verified by eye')
    b.add_argument('--review', help='directory to write crops of unresolved glyphs into')
    b.set_defaults(func=cmd_card)
    n = sub.add_parser('notes')
    n.add_argument('pdf')
    n.add_argument('--sections', required=True, help='comma-separated addendum section numbers, e.g. A1,A2,A3')
    n.set_defaults(func=cmd_notes)
    args = ap.parse_args()
    args.func(args)


if __name__ == '__main__':
    main()
