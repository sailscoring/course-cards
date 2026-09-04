#!/usr/bin/env python3
"""Generate a course card file from a scanned or vector-drawn HYC course card.

The cards are pictures — the offshore card's letters are vector outlines, the
inshore card is a scan — so this is a small purpose-built OCR:

1. Render the page (pdftoppm, 600 dpi) and find the table grid from its
   black rules: the last 36 row bands are courses 00–35, the last 5 column
   bands are columns 1–5.
2. In each cell, segment the coloured (red / green) letter glyphs, read
   them line by line, left to right, and note which are enclosed by a black
   box (the card's passing-mark notation).
3. Recognise each glyph by nearest-template matching against a small set of
   labelled glyph images (`templates/<card>/<LETTER>-<n>.png`) and refuse to
   guess: a glyph whose best match isn't clearly ahead of the runner-up is
   reported, and must be resolved with an explicit `--overrides` entry.

Red letters are rounded / passed to port, green to starboard.

    # one-off, to label a card's letter shapes:
    python3 tools/extract_card.py cluster <card.pdf> <workdir>
    # then copy workdir/cluster-<k>.png to templates/<card>/<LETTER>-<k>.png

    # repeatable:
    python3 tools/extract_card.py build <card.pdf> --templates <dir> --meta meta.json > card.json
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile

from PIL import Image, ImageChops, ImageDraw, ImageOps

DPI = 600
FEATURE_SIZE = (24, 32)
MATCH_MAX = 0.14      # a glyph further than this from every template is unknown
MATCH_MARGIN = 0.025  # runner-up letter must be at least this much further away


# --- image helpers ---------------------------------------------------------

def render(pdf, dpi=DPI):
    tmp = tempfile.mkdtemp()
    subprocess.run(['pdftoppm', '-r', str(dpi), '-png', '-singlefile', pdf, os.path.join(tmp, 'page')], check=True)
    return Image.open(os.path.join(tmp, 'page.png')).convert('RGB')


def colour_masks(im):
    r, g, b = im.split()
    dark = ImageChops.multiply(ImageChops.multiply(
        r.point(lambda v: 255 if v < 110 else 0), g.point(lambda v: 255 if v < 110 else 0)),
        b.point(lambda v: 255 if v < 110 else 0))
    redness = ImageChops.subtract(r, ImageChops.lighter(g, b))
    red = ImageChops.multiply(redness.point(lambda v: 255 if v > 60 else 0), r.point(lambda v: 255 if v > 140 else 0))
    # Green runs from the vector card's bright green to the scan's boxed
    # letters, printed in a dark green — hence the low bar.
    greenness = ImageChops.subtract(g, ImageChops.lighter(r, b))
    green = ImageChops.multiply(greenness.point(lambda v: 255 if v >= 12 else 0), g.point(lambda v: 255 if v >= 50 else 0))
    return dark, red, green


def line_bands(mask, axis, frac=0.45):
    """Runs of rows (axis 'y') or columns ('x') that are mostly dark: the rules."""
    W, H = mask.size
    prof = mask.resize((1, H) if axis == 'y' else (W, 1), Image.BOX).tobytes()
    out, cur = [], None
    for i, v in enumerate(prof):
        if v > frac * 255:
            cur = [i, i] if cur is None else [cur[0], i]
        elif cur:
            out.append(tuple(cur))
            cur = None
    if cur:
        out.append(tuple(cur))
    return out


def grid(dark):
    W, H = dark.size
    rows = line_bands(dark, 'y')[-38:]
    top, bot = rows[0][0], rows[-1][1]
    cols = line_bands(dark.crop((0, top, W, bot)), 'x')[-6:]
    if len(rows) != 38 or len(cols) != 6:
        sys.exit(f'grid: expected 38 rules × 6 rules, found {len(rows)} × {len(cols)}')
    cells = {}
    for ri in range(36):
        y0, y1 = rows[ri + 1][1] + 1, rows[ri + 2][0]
        for ci in range(5):
            x0, x1 = cols[ci][1] + 1, cols[ci + 1][0]
            cells[(ri, ci + 1)] = (x0, y0, x1, y1)
    return cells


def components(mask):
    """8-connected components of a binary 'L' image: list of (bbox, pixel count)."""
    w, h = mask.size
    data = mask.tobytes()
    seen = bytearray(len(data))
    comps = []
    for start, v in enumerate(data):
        if not v or seen[start]:
            continue
        stack = [start]
        seen[start] = 1
        n = 0
        x0 = x1 = start % w
        y0 = y1 = start // w
        while stack:
            i = stack.pop()
            n += 1
            x, y = i % w, i // w
            x0, x1, y0, y1 = min(x0, x), max(x1, x), min(y0, y), max(y1, y)
            for dy in (-1, 0, 1):
                yy = y + dy
                if yy < 0 or yy >= h:
                    continue
                for dx in (-1, 0, 1):
                    xx = x + dx
                    if xx < 0 or xx >= w:
                        continue
                    j = yy * w + xx
                    if data[j] and not seen[j]:
                        seen[j] = 1
                        stack.append(j)
        comps.append(((x0, y0, x1 + 1, y1 + 1), n))
    return comps


def feature(im, box):
    """Position-normalised soft image of a glyph: its darkness against the
    page, stretched to FEATURE_SIZE so shapes compare independently of the
    glyph's size, colour, or the row shading behind it."""
    pad = max(2, (box[3] - box[1]) // 12)
    crop = im.crop((box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad))
    darkness = ImageOps.invert(crop.convert('L'))
    return ImageOps.autocontrast(darkness, cutoff=(1, 1)).resize(FEATURE_SIZE, Image.BILINEAR)


def distance(a, b):
    return sum(abs(p - q) for p, q in zip(a.tobytes(), b.tobytes())) / (255.0 * FEATURE_SIZE[0] * FEATURE_SIZE[1])


def box_rings(dark, cell, glyph_h):
    """The passing-mark boxes in a cell: hollow dark rectangles taller than a
    letter, well inside the cell (the cell's own rules are cropped away). On
    the scanned card a box and the letter inside it are one dark blob, so
    the fill ratio allows for the letter too."""
    x0, y0, x1, y1 = cell
    crop = dark.crop(cell)
    w, h = crop.size
    rings = []
    for (bx0, by0, bx1, by1), n in components(crop):
        bw, bh = bx1 - bx0, by1 - by0
        if bx0 <= 1 or by0 <= 1 or bx1 >= w - 1 or by1 >= h - 1:
            continue
        if bh >= glyph_h * 1.3 and bw >= glyph_h * 1.2 and n <= 0.5 * bw * bh:
            rings.append((x0 + bx0, y0 + by0, x0 + bx1, y0 + by1))
    return rings


def clip_to_ring(box, ring, glyph_h):
    """A letter that touches its box scans as one blob with it; keep just the
    box's interior so the letter's shape is what gets matched."""
    inset = max(6, glyph_h // 5)
    rx0, ry0, rx1, ry1 = ring[0] + inset, ring[1] + inset, ring[2] - inset, ring[3] - inset
    return (max(box[0], rx0), max(box[1], ry0), min(box[2], rx1), min(box[3], ry1))


def cell_glyphs(im, dark, red, green, cell):
    """The coloured glyphs of one cell in reading order."""
    x0, y0, x1, y1 = cell
    union = ImageChops.lighter(red.crop(cell), green.crop(cell))
    comps = components(union)
    if not comps:
        return []
    heights = sorted(b[3] - b[1] for b, _ in comps)
    glyph_h = heights[len(heights) // 2]
    rings = box_rings(dark, cell, glyph_h)
    glyphs = []
    for (bx0, by0, bx1, by1), n in comps:
        w, h = bx1 - bx0, by1 - by0
        if n < glyph_h * glyph_h * 0.12 or h < glyph_h * 0.6:
            continue  # speckle
        if h > glyph_h * 1.3 and n < 0.4 * w * h:
            continue  # a passing-mark box drawn in the letter's own colour, not a letter
        abs_box = (x0 + bx0, y0 + by0, x0 + bx1, y0 + by1)
        cx, cy = (abs_box[0] + abs_box[2]) / 2, (abs_box[1] + abs_box[3]) / 2
        ring = next((r for r in rings if r[0] < cx < r[2] and r[1] < cy < r[3]), None)
        if ring:
            abs_box = clip_to_ring(abs_box, ring, glyph_h)
        reds = sum(1 for v in red.crop(abs_box).tobytes() if v)
        greens = sum(1 for v in green.crop(abs_box).tobytes() if v)
        glyphs.append({
            'box': abs_box,
            'colour': 'red' if reds >= greens else 'green',
            'boxed': ring is not None,
        })
    # Group into text lines by vertical centre, then order left to right.
    glyphs.sort(key=lambda g: (g['box'][1] + g['box'][3]) / 2)
    lines = []
    for g in glyphs:
        cy = (g['box'][1] + g['box'][3]) / 2
        if lines and abs(cy - lines[-1][0]) < glyph_h * 0.6:
            lines[-1][1].append(g)
        else:
            lines.append((cy, [g]))
    ordered = []
    for _, items in lines:
        ordered.extend(sorted(items, key=lambda g: g['box'][0]))
    for g in ordered:
        g['feature'] = feature(im, g['box'])
    return ordered


def read_card(pdf):
    im = render(pdf)
    dark, red, green = colour_masks(im)
    cells = grid(dark)
    out = {}
    for key in sorted(cells):
        out[key] = cell_glyphs(im, dark, red, green, cells[key])
    return im, out


# --- cluster mode: label a card's letter shapes ------------------------------

def cmd_cluster(args):
    im, cells = read_card(args.pdf)
    os.makedirs(args.workdir, exist_ok=True)
    glyphs = [dict(g, cell=key, index=i) for key, gs in cells.items() for i, g in enumerate(gs)]
    clusters = []
    for g in glyphs:
        best = min(((distance(g['feature'], c['proto']), k) for k, c in enumerate(clusters)), default=None)
        if best and best[0] < args.threshold:
            clusters[best[1]]['members'].append(g)
        else:
            clusters.append({'proto': g['feature'], 'members': [g]})
    print(f'{len(glyphs)} glyphs in {len(clusters)} clusters', file=sys.stderr)
    cs = 48
    per_row = 16
    sheet = Image.new('RGB', (cs * (per_row + 2), cs * len(clusters)), 'white')
    draw = ImageDraw.Draw(sheet)
    for k, c in enumerate(clusters):
        # the medoid is the template candidate
        members = c['members']
        medoid = min(members, key=lambda g: sum(distance(g['feature'], h['feature']) for h in members[:40]))
        medoid['feature'].save(os.path.join(args.workdir, f'cluster-{k}.png'))
        draw.text((4, k * cs + 4), f'{k} ({len(members)})', fill='blue')
        for j, g in enumerate(members[:per_row]):
            x0, y0, x1, y1 = g['box']
            crop = im.crop((x0 - 8, y0 - 8, x1 + 8, y1 + 8))
            crop.thumbnail((cs - 4, cs - 4))
            sheet.paste(crop, ((j + 2) * cs, k * cs + 2))
    sheet.save(os.path.join(args.workdir, 'clusters.png'))
    json.dump([[list(g['cell']) + [g['index']] for g in c['members']] for c in clusters],
              open(os.path.join(args.workdir, 'clusters.json'), 'w'))


# --- build mode: the card file ------------------------------------------------

def load_templates(directory):
    templates = []
    for name in sorted(os.listdir(directory)):
        if name.endswith('.png'):
            letter = name.split('-')[0].split('.')[0]
            templates.append((letter, Image.open(os.path.join(directory, name)).convert('L')))
    if not templates:
        sys.exit(f'no templates in {directory}')
    return templates


def recognise(glyph, templates):
    best = {}
    for letter, t in templates:
        d = distance(glyph['feature'], t)
        best[letter] = min(d, best.get(letter, 9))
    ranked = sorted(best.items(), key=lambda kv: kv[1])
    (letter, d1), d2 = ranked[0], ranked[1][1] if len(ranked) > 1 else 9
    ok = d1 <= MATCH_MAX and d2 - d1 >= MATCH_MARGIN
    return letter, ok, d1, d2


def cmd_build(args):
    im, cells = read_card(args.pdf)
    templates = load_templates(args.templates)
    overrides = json.load(open(args.overrides)) if args.overrides else {}
    meta = json.load(open(args.meta)) if args.meta else {}
    notes = json.load(open(args.notes)) if args.notes else None
    problems = []
    courses = []
    review_dir = args.review
    if review_dir:
        os.makedirs(review_dir, exist_ok=True)
    for (row, col), glyphs in cells.items():
        course_id = f'{row:02d}{col}'
        marks = []
        for i, g in enumerate(glyphs):
            key = f'{course_id}/{i}'
            letter, ok, d1, d2 = recognise(g, templates)
            if key in overrides:
                letter, ok = overrides[key], True
            if not ok:
                problems.append(f'{key}: best {letter} ({d1:.3f}), runner-up {d2:.3f}')
                if review_dir:
                    x0, y0, x1, y1 = g['box']
                    im.crop((x0 - 12, y0 - 12, x1 + 12, y1 + 12)).save(os.path.join(review_dir, f'{course_id}-{i}.png'))
            entry = {'mark': letter, 'side': 'port' if g['colour'] == 'red' else 'starboard'}
            if g['boxed']:
                entry['passing'] = True
            marks.append(entry)
        if not marks:
            problems.append(f'{course_id}: no glyphs found')
        courses.append({'id': course_id, 'marks': marks})
    if problems:
        print('unresolved glyphs (add to --overrides after checking the image):', file=sys.stderr)
        for p in problems:
            print('  ' + p, file=sys.stderr)
        sys.exit(1)
    out = {'formatVersion': 1, **meta, **({'notes': notes} if notes else {}), 'courses': courses}
    emit(out, sys.stdout)


def emit(card, fh):
    """Pretty JSON with each course on one line, so the card reads like a card."""
    head = {k: v for k, v in card.items() if k != 'courses'}
    text = json.dumps(head, indent=2, ensure_ascii=False)
    text = text[:-2] + ',\n  "courses": [\n'
    lines = ['    ' + json.dumps(c, separators=(', ', ': '), ensure_ascii=False) for c in card['courses']]
    text += ',\n'.join(lines) + '\n  ]\n}\n'
    fh.write(text)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    c = sub.add_parser('cluster')
    c.add_argument('pdf')
    c.add_argument('workdir')
    c.add_argument('--threshold', type=float, default=0.06)
    c.set_defaults(func=cmd_cluster)
    b = sub.add_parser('build')
    b.add_argument('pdf')
    b.add_argument('--templates', required=True)
    b.add_argument('--meta')
    b.add_argument('--notes', help='JSON list of {title, text} notes to carry on the card')
    b.add_argument('--overrides', help='JSON {"<course>/<glyph index>": "<LETTER>"} for glyphs verified by eye')
    b.add_argument('--review', help='directory to write crops of unresolved glyphs into')
    b.set_defaults(func=cmd_build)
    args = ap.parse_args()
    args.func(args)


if __name__ == '__main__':
    main()
