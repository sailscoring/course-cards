#!/usr/bin/env python3
"""Generate course card files from Kinsale Yacht Club's Sovereign's Cup
sailing instructions.

The instructions carry two kinds of course list:

- **"RTC/Coastal Courses"**, four pages of pictures: a table per wind
  direction — North, North East, … North West — of courses named for it
  (N1, N1A, … N2C), each a row of marks with the side to leave them on
  ("B(p)", "Lge Sov(s)"), where the course finishes ("Start Area", a mark's
  letter, or "CF" for Charles Fort), and an approximate length. The pages
  are embedded images with no text layer, so this is a small purpose-built
  OCR in the manner of `extract_card.py`, whose glyph matching it reuses:
  the ink is segmented into glyphs, the glyphs grouped into lines, words
  and columns, and every glyph recognised by nearest-template matching
  against labelled shapes; one whose best match is not clearly ahead of the
  runner-up stops the build unless an `--overrides` entry resolves it.

      python3 tools/extract_kyc_card.py cluster <si.pdf> <workdir>      # one-off: label the glyph shapes
      python3 tools/extract_kyc_card.py card <si.pdf> --templates <dir> --meta meta.json \\
          [--notes notes.json] [--start-line start.json] [--overrides o.json] > card.json

- **The supplementary sailing instructions** for the Jeanot Petch
  Sovereign's Cup races, a real-text PDF listing four lettered courses as
  prose: "Course ALPHA (A) – Start Area – Mark C", a line of marks with
  sides, "Finish at Charles Fort", and a midway point. `ssi` mode reads
  them from the text layer. The marks are named as the RTC card labels
  them, except "Big Sovereign" for the card's "Lge Sov" and "Charles Fort"
  for its "CF", which are mapped.

      python3 tools/extract_kyc_card.py ssi <ssi.pdf> --meta meta.json [--start-line start.json] > card.json

`notes` mode prints named sections of the instructions — "FB 4 MARKS",
"FC 6 FINISHING LINE" — as card notes, each paragraph as printed. The
instructions are set in two columns, so a section is read from the column
its heading is in, out of `pdftotext -bbox` word positions, rather than
from the page's flattened text.

      python3 tools/extract_kyc_card.py notes <si.pdf> --sections "FB 4 MARKS,FC 6 FINISHING LINE"

Every course begins at the card's start line and ends where the club says
it finishes: a course that finishes "at K" ends with an entry for K with no
side — the finishing line is laid beside that mark by the committee boat —
and one that finishes at the "Start Area" ends with the start line's own
id. The wind a table is headed with is carried as `windDirectionDeg`, and
the printed approximate length as `distanceNm`.
"""

import argparse
import difflib
import json
import os
import re
import subprocess
import sys
import tempfile

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageStat

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract_card import components, course_card_file, emit, load_templates  # noqa: E402
from extract_kyc_marks import bbox_words  # noqa: E402

TITLE = 'RTC/Coastal Courses'
# Labels a template file may carry for glyphs a file name cannot.
LABELS = {'dot': '.', 'lparen': '(', 'rparen': ')', 'slash': '/'}
WINDS = {
    'North': 0, 'North East': 45, 'East': 90, 'South East': 135,
    'South': 180, 'South West': 225, 'West': 270, 'North West': 315,
}
PREFIX = {0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW'}
ID_RE = re.compile(r'^(N|NE|E|SE|S|SW|W|NW)([12])([A-E])?$')
MARK_RE = re.compile(r'^(.+?)\((p|s)\)$')
LENGTH_RE = re.compile(r'^(\d{1,2}\.\d)nm$')
LETTERS = set('ABCDEFGHJKM')
NAMED = {'Lge Sov', 'Cork Buoy', 'Black Tom'}
FINISHES = {'Start Area', 'CF'} | LETTERS
SSI_ALIASES = {'Big Sovereign': 'Lge Sov', 'Charles Fort': 'CF'}
INK = 128
SEPARATE = 0.28  # a gap wider than this many glyph heights ends a word
COLUMN = 1.6     # … and this many, a column


# --- the pictures ----------------------------------------------------------------

def page_texts(pdf):
    text = subprocess.run(['pdftotext', pdf, '-'], check=True, capture_output=True, text=True).stdout
    return text.split('\f')[:-1] if text.endswith('\f') else text.split('\f')


def table_pages(texts):
    """The pages of the course tables: the one whose text layer is the title
    and a page number, then every following page whose text layer is a page
    number alone — the tables themselves are pictures."""
    titled = [i + 1 for i, t in enumerate(texts) if TITLE in t and re.fullmatch(r'\d+', t.replace(TITLE, '').strip())]
    if len(titled) != 1:
        sys.exit(f'expected one page whose text is "{TITLE}" and a page number, found {len(titled)}')
    pages = [titled[0]]
    for number in range(titled[0] + 1, len(texts) + 1):
        if re.fullmatch(r'\d+', texts[number - 1].strip()):
            pages.append(number)
        else:
            break
    return pages


def page_image(pdf, page):
    tmp = tempfile.mkdtemp()
    subprocess.run(['pdfimages', '-f', str(page), '-l', str(page), '-png', pdf, os.path.join(tmp, 'im')], check=True)
    images = [Image.open(os.path.join(tmp, f)) for f in sorted(os.listdir(tmp))]
    if not images:
        sys.exit(f'page {page}: no images')
    return max(images, key=lambda i: i.width * i.height).convert('RGB')


CANVAS = (24, 32)   # a glyph's feature: cap height scaled to CAP px, baseline at BASELINE
CAP = 20
BASELINE = 26


def erase_rules(ink, glyph_h):
    """The headings' underlines, erased from the ink so an underlined word
    does not scan as one glyph: any run of ink along a row longer than two
    letters is a rule, not a stroke."""
    w, h = ink.size
    px = ink.load()
    for y in range(h):
        x = 0
        while x < w:
            if px[x, y]:
                start = x
                while x < w and px[x, y]:
                    x += 1
                if x - start > glyph_h * 2:
                    for xx in range(start, x):
                        px[xx, y] = 0
            else:
                x += 1
    return ink


def glyphs_of(im):
    """The ink of the page as glyphs: dark connected components, the
    headings' underlines erased first and anything far larger than a letter
    — the page's decoration — dropped."""
    ink = im.convert('L').point(lambda v: 255 if v < INK else 0)
    comps = [(box, n) for box, n in components(ink) if n >= 20]
    heights = sorted(b[3] - b[1] for b, n in comps)
    glyph_h = heights[len(heights) // 2]
    ink = erase_rules(ink, glyph_h)
    glyphs = []
    for (x0, y0, x1, y1), n in components(ink):
        if n < 4:
            continue  # speckle
        if y1 - y0 > glyph_h * 3 or x1 - x0 > glyph_h * 6:
            continue  # decoration, or the page's title
        if y1 - y0 <= 3 and x1 - x0 >= 6:
            continue  # a scrap of underline a descender broke off
        glyphs.append({'box': (x0, y0, x1, y1), 'pixels': n})
    return glyphs, glyph_h


def centre(g):
    x0, y0, x1, y1 = g['box']
    return (x0 + x1) / 2, (y0 + y1) / 2


def text_lines(glyphs, glyph_h):
    """Glyphs grouped into lines, each line left to right with its baseline —
    the bottom most of its glyphs sit on. Letters are grouped first, by
    vertical centre against the running centre of the line they join, so a
    heading's capitals and its x-height letters land together; the small
    marks — dots, points — then join the nearest line, and a dot above the
    line's centre is an i's, not a decimal point, and is dropped."""
    letters = sorted((g for g in glyphs if g['pixels'] >= glyph_h * 1.5), key=lambda g: centre(g)[1])
    small = [g for g in glyphs if g['pixels'] < glyph_h * 1.5]
    lines = []
    for g in letters:
        cy = centre(g)[1]
        if lines and abs(cy - lines[-1][0]) < glyph_h * 0.6:
            items = lines[-1][1]
            items.append(g)
            lines[-1][0] = sum(centre(h)[1] for h in items) / len(items)
        else:
            lines.append([cy, [g]])
    for g in small:
        cy = centre(g)[1]
        nearest = min(lines, key=lambda l: abs(l[0] - cy), default=None)
        if nearest and abs(nearest[0] - cy) < glyph_h:
            nearest[1].append(g)
    out = []
    for cy, items in lines:
        items.sort(key=lambda g: g['box'][0])
        body = [g for g in items if not (g['pixels'] < glyph_h * 1.5 and centre(g)[1] < cy - glyph_h * 0.15)]
        if not body:
            continue
        bottoms = sorted(g['box'][3] for g in body if g['pixels'] >= glyph_h * 1.5)
        baseline = bottoms[len(bottoms) // 2]
        out.append((baseline, body))
    return out


def glyph_feature(im, box, baseline, glyph_h):
    """A glyph's shape at a fixed scale and a fixed place: its darkness,
    scaled so a capital is CAP px tall, set on a blank canvas with the line's
    baseline at BASELINE and the glyph centred across. Unlike stretching every
    glyph to one box, this keeps an l narrow, a t's crossbar where it is, a p
    below the line and a ( curving the way it curves — which is what tells
    them apart at this size."""
    x0, y0, x1, y1 = box
    scale = CAP / glyph_h
    w = max(1, round((x1 - x0) * scale))
    h = max(1, round((y1 - y0) * scale))
    if w > CANVAS[0]:
        h = max(1, round(h * CANVAS[0] / w))
        w = CANVAS[0]
    crop = im.crop((x0, y0, x1, y1)).convert('L')
    dark = crop.point(lambda v: 255 - v).resize((w, h), Image.BILINEAR)
    canvas = Image.new('L', CANVAS, 0)
    bottom = round(BASELINE + (y1 - baseline) * scale)
    top = min(max(bottom - h, 0), CANVAS[1] - h)
    canvas.paste(dark, ((CANVAS[0] - w) // 2, top))
    return canvas.filter(ImageFilter.GaussianBlur(0.6))


def ink_sum(im):
    return ImageStat.Stat(im).sum[0]


def distance(a, b):
    """How unlike two glyph features are: the ink where they differ as a
    share of the ink in both, taken at the best of the nine one-pixel
    alignments — 0 for the same shape, 1 for shapes with nothing in
    common. The alignment tolerance is what makes two renderings of one
    letter, a sub-pixel apart on the club's page, read as the same shape,
    and the share what keeps a t's crossbar from being lost in the area of a
    canvas mostly blank around an l."""
    total = ink_sum(a) + ink_sum(b)
    if total == 0:
        return 0.0
    best = None
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            d = ink_sum(ImageChops.difference(a, ImageChops.offset(b, dx, dy)))
            if best is None or d < best:
                best = d
    return best / total


MATCH_MAX = 0.30     # a glyph further than this from every template is unknown
MATCH_MARGIN = 0.06  # the runner-up label must be at least this much further away


def recognise(glyph, templates):
    best = {}
    for label, t in templates:
        d = distance(glyph['feature'], t)
        best[label] = min(d, best.get(label, 9))
    ranked = sorted(best.items(), key=lambda kv: kv[1])
    (label, d1), d2 = ranked[0], ranked[1][1] if len(ranked) > 1 else 9
    return label, d1 <= MATCH_MAX and d2 - d1 >= MATCH_MARGIN, d1, d2


def split(items, gap):
    groups = [[items[0]]]
    for prev, g in zip(items, items[1:]):
        if g['box'][0] - right_edge(groups[-1]) > gap:
            groups.append([g])
        else:
            groups[-1].append(g)
    return groups


def right_edge(glyphs):
    return max(g['box'][2] for g in glyphs)


def read_tables(pdf):
    """Every table page as its lines of columns of words of glyphs:
    [{page, lines: [[[ [glyph…] word… ] column… ] line…]}]."""
    out = []
    for page in table_pages(page_texts(pdf)):
        im = page_image(pdf, page)
        glyphs, glyph_h = glyphs_of(im)
        lines = []
        for baseline, line in text_lines(glyphs, glyph_h):
            cols = [split(col, glyph_h * SEPARATE) for col in split(line, glyph_h * COLUMN)]
            for col in cols:
                for word in col:
                    for g in word:
                        g['feature'] = glyph_feature(im, g['box'], baseline, glyph_h)
            lines.append(cols)
        out.append({'page': page, 'image': im, 'lines': lines, 'glyph_h': glyph_h})
    return out


def all_glyphs(tables):
    """Every glyph with a key naming where it is: `<table>/<line>/<column>/<word>/<glyph>`,
    indices before recognition, so a key is stable across runs."""
    for ti, t in enumerate(tables):
        for li, line in enumerate(t['lines']):
            for ci, col in enumerate(line):
                for wi, word in enumerate(col):
                    for gi, g in enumerate(word):
                        yield f'{ti}/{li}/{ci}/{wi}/{gi}', g


# --- cluster mode: label the glyph shapes --------------------------------------------

def cmd_cluster(args):
    tables = read_tables(args.pdf)
    os.makedirs(args.workdir, exist_ok=True)
    glyphs = [dict(g, key=key, table=int(key.split('/')[0])) for key, g in all_glyphs(tables)]
    clusters = []
    for g in glyphs:
        best = min(((distance(g['feature'], c['proto']), k) for k, c in enumerate(clusters)), default=None)
        if best and best[0] < args.threshold:
            clusters[best[1]]['members'].append(g)
        else:
            clusters.append({'proto': g['feature'], 'members': [g]})
    clusters.sort(key=lambda c: -len(c['members']))
    print(f'{len(glyphs)} glyphs in {len(clusters)} clusters', file=sys.stderr)
    cs, per_row = 36, 26
    sheet = Image.new('RGB', (cs * (per_row + 2), cs * len(clusters)), 'white')
    draw = ImageDraw.Draw(sheet)
    for k, c in enumerate(clusters):
        members = c['members']
        medoid = min(members, key=lambda g: sum(distance(g['feature'], h['feature']) for h in members[:40]))
        medoid['feature'].save(os.path.join(args.workdir, f'cluster-{k}.png'))
        draw.text((2, k * cs + 10), f'{k}({len(members)})', fill='blue')
        for j, g in enumerate(members[:per_row]):
            x0, y0, x1, y1 = g['box']
            im = tables[g['table']]['image']
            crop = im.crop((x0 - 2, y0 - 2, x1 + 2, y1 + 2))
            crop = crop.resize((crop.width * 2, crop.height * 2))
            crop.thumbnail((cs - 2, cs - 2))
            sheet.paste(crop, ((j + 2) * cs, k * cs + 1))
    sheet.save(os.path.join(args.workdir, 'clusters.png'))
    json.dump([[g['key'] for g in c['members']] for c in clusters], open(os.path.join(args.workdir, 'clusters.json'), 'w'), indent=1)


# --- card mode -------------------------------------------------------------------------

# What each glyph of a table can be, by where it stands. Reading a glyph
# against only the labels its place allows is what makes the tables legible
# at this size: a B is never asked whether it might be an 8, because no
# mark token has a digit in it, and no length has a letter before its "nm".
UPPER = set('ABCDEFGHJKLMNOPQRSTUVWXYZ')
LOWER = set('abcdefghijklmnopqrstuvwxyz')
DIGITS = set('0123456789')
WORDS = {  # multi-glyph tokens the tables print, by the lengths of their words
    (3, 3): 'Lge Sov', (4, 4): 'Cork Buoy', (5, 3): 'Black Tom', (5, 4): 'Start Area', (2,): 'CF',
}
HEADER_WORDS = {'Direction', 'North', 'East', 'South', 'West', 'Course', 'Mark', 'Rounding', 'Sequence',
                'Finish', 'at', 'Approx', 'Length'}
HEADER_CASE = {w.lower(): w for w in HEADER_WORDS}  # a bold c reads as a C: the headings are matched regardless of case


def nearest_word(read, candidates, ratio=0.6):
    """The candidate a loosely read word is, if any: the most similar of them
    by difflib's ratio, when similar enough and opening with the same letter.
    The headings are bold, in a larger face than the tables, and their
    letters are read with the tables' templates; they only need to be told
    apart, not spelled."""
    scored = sorted(((difflib.SequenceMatcher(None, read, c).ratio(), c) for c in candidates), reverse=True)
    score, best = scored[0]
    if score < ratio or read[:1] != best[:1]:
        return None
    return candidates[best] if isinstance(candidates, dict) else best


def cmd_card(args):
    tables = read_tables(args.pdf)
    templates = [(LABELS.get(label, label), t) for label, t in load_templates(args.templates)]
    overrides = json.load(open(args.overrides)) if args.overrides else {}
    meta = json.load(open(args.meta)) if args.meta else {}
    if args.review:
        os.makedirs(args.review, exist_ok=True)
    problems = []

    def read(key, g, table, allowed=None, report=True):
        """One glyph as a label, from the templates its place allows; an
        override settles a glyph the templates cannot. A heading's glyphs
        are read without complaint — the words are matched loosely."""
        if key in overrides:
            return overrides[key]
        pool = [(l, t) for l, t in templates if allowed is None or l in allowed]
        if not pool:
            problems.append(f'{key}: no templates for any of {sorted(allowed)}')
            return '?'
        label, ok, d1, d2 = recognise(g, pool)
        if not ok and report:
            problems.append(f'{key}: best {label!r} ({d1:.3f}), runner-up {d2:.3f}' + (f' among {"".join(sorted(allowed))}' if allowed else ''))
            if args.review:
                x0, y0, x1, y1 = g['box']
                table['image'].crop((x0 - 8, y0 - 8, x1 + 8, y1 + 8)).save(os.path.join(args.review, key.replace('/', '-') + '.png'))
        return label

    def read_word(prefix, word, table, allowed=None, report=True):
        return ''.join(read(f'{prefix}/{gi}', g, table, allowed, report) for gi, g in enumerate(word))

    def read_spelled(prefix, words, table, spelling):
        """A token whose spelling its shape already gives away — "Lge Sov" by
        its three-and-three glyphs — read letter by letter against that
        spelling alone, so a glyph that does not match its letter is caught.
        A word whose glyphs do not number its letters (two run together) is
        passed over: its identity rests on the token's shape and first letter."""
        for wi, (word, expected) in enumerate(zip(words, spelling.split())):
            if len(word) != len(expected):
                continue
            for gi, (g, letter) in enumerate(zip(word, expected)):
                got = read(f'{prefix}/{wi}/{gi}', g, table, {letter})
                if got != letter:
                    problems.append(f'{prefix}: expected {spelling!r}, glyph {wi}/{gi} read {got!r}')
        return spelling

    def named_token(prefix, words, table, candidates):
        """Which of the multi-word names a token is: by the lengths of its
        words when they match one exactly, otherwise by its number of words
        and its first letter, read against the candidates' initials."""
        shape = tuple(len(w) for w in words)
        exact = [c for c in candidates if tuple(len(w) for w in c.split()) == shape]
        if len(exact) == 1:
            return read_spelled(prefix, words, table, exact[0])
        same_words = [c for c in candidates if len(c.split()) == len(words)]
        if not same_words:
            return None
        initials = {c[0]: c for c in same_words}
        first = read(f'{prefix}/0/0', words[0][0], table, set(initials))
        if first not in initials:
            return None
        return read_spelled(prefix, words, table, initials[first])

    courses, headings = [], []
    wind = None
    for ti, t in enumerate(tables):
        for li, line in enumerate(t['lines']):
            if not line:
                continue
            key = f'{ti}/{li}'
            # A course row is the only kind of line that ends in a length,
            # "<n>.<n>nm" — a dot in the token gives it away before reading.
            # The point is kerned a little apart from the digit after it, so
            # the token's glyphs are taken whatever the word gaps made of them.
            last = [g for w in line[-1] for g in w]
            is_course = wind is not None and len(line) >= 4 and 4 <= len(last) <= 6 and \
                min(g['pixels'] for g in last) < t['glyph_h'] * 1.5
            if not is_course:
                # A heading's letters are spaced wider than the tables', so
                # its word gaps mean little: each column is read as one word.
                words = [''.join(read_word(f'{key}/{ci}/{wi}', w, t, UPPER | LOWER, report=False) for wi, w in enumerate(col)) for ci, col in enumerate(line)]
                if words and nearest_word(words[0], {'Direction'}):
                    name = nearest_word(''.join(words[1:]), {w.replace(' ', ''): w for w in WINDS})
                    if name is None:
                        problems.append(f'{key}: direction {words[1:]!r} is not a compass point')
                        continue
                    wind = WINDS[name]
                    headings.append(name)
                elif wind is not None and not (words and nearest_word(words[0], {'Course', 'Approx'}, 0.5)):
                    problems.append(f'{key}: {words!r} is neither a course nor a heading')
                continue
            # The course id: a compass prefix, 1 or 2, an optional letter.
            first = line[0]
            if len(first) != 1 or not 2 <= len(first[0]) <= 4:
                problems.append(f'{key}: the first column {[len(w) for w in first]} is not a course id')
                continue
            course_id = ''
            for gi, g in enumerate(first[0]):
                if not course_id or course_id[-1] in 'NESW' and len(course_id) == 1:
                    allowed = set('NESW') | ({'1', '2'} if course_id else set())
                else:
                    allowed = {'1', '2'} if course_id[-1] in 'NESW' else set('ABCDE')
                course_id += read(f'{key}/0/0/{gi}', g, t, allowed)
            if not ID_RE.match(course_id) or not course_id.startswith(PREFIX[wind]) or ID_RE.match(course_id).group(1) != PREFIX[wind]:
                problems.append(f'{key}: course id {course_id!r} under the {headings[-1]} heading')
                continue
            # The length: digits, a dot, then "nm".
            length = ''
            for gi, g in enumerate(last):
                allowed = {'n', 'm'} if gi >= len(last) - 2 else DIGITS | {'.'}
                length += read(f'{key}/{len(line) - 1}/{gi}', g, t, allowed)
            lm = LENGTH_RE.match(length)
            if not lm:
                problems.append(f'course {course_id}: length {length!r} is not "<n>.<n>nm"')
                continue
            # Where it finishes: the start area, CF, or a mark's letter.
            fin = line[-2]
            if len(fin) == 2:
                finish = named_token(f'{key}/{len(line) - 2}', fin, t, ['Start Area'])
            elif len(fin) == 1 and len(fin[0]) == 2:
                finish = read_spelled(f'{key}/{len(line) - 2}', fin, t, 'CF')
            elif len(fin) == 1 and len(fin[0]) == 1:
                finish = read(f'{key}/{len(line) - 2}/0/0', fin[0][0], t, LETTERS)
            else:
                finish = None
            if finish not in FINISHES:
                problems.append(f'course {course_id}: the finish column {[len(w) for w in fin]} is not a mark or the start area')
                continue
            # The marks: a name, then "(p)" or "(s)". A long name — "Black
            # Tom(s)" — runs up to the next column and closes the gap the
            # columns are told apart by, so each column is cut again after
            # any ")" that is not its last glyph. Then the glyphs of a column
            # are taken in order whatever the word gaps made of them: the last
            # three are the bracketed side, the rest the name, its words as
            # the gaps fall.
            columns = []
            for col in line[1:-2]:
                flat = [(wi, g) for wi, w in enumerate(col) for g in w]
                brackets = [(l, tt) for l, tt in templates if l in ('(', ')')]
                cut = [i + 1 for i, (wi, g) in enumerate(flat[:-1])
                       if recognise(g, brackets)[:2] == (')', True) and flat[i + 1][1]['box'][0] - g['box'][2] > t['glyph_h'] * SEPARATE]
                for a, b in zip([0] + cut, cut + [len(flat)]):
                    piece = flat[a:b]
                    words, prev = [], None
                    for wi, g in piece:
                        if words and wi == prev:
                            words[-1].append(g)
                        else:
                            words.append([g])
                        prev = wi
                    columns.append(words)
            marks = []
            for ci, col in enumerate(columns, 1):
                flat = [(wi, g) for wi, w in enumerate(col) for g in w]
                if len(flat) < 4:
                    problems.append(f'course {course_id}: column {ci} is too short for a mark and a side')
                    continue
                side_key = f'{key}/{ci}'
                side = read(f'{side_key}/side', flat[-2][1], t, {'p', 's'})
                for (wi, g), want in ((flat[-3], '('), (flat[-1], ')')):
                    got = read(f'{side_key}/{want}', g, t, {want})
                    if got != want:
                        problems.append(f'course {course_id}: column {ci} expected {want!r}, read {got!r}')
                name_words = []
                for wi, g in flat[:-3]:
                    if name_words and name_words[-1][0] == wi:
                        name_words[-1][1].append(g)
                    else:
                        name_words.append((wi, [g]))
                name_words = [w for _, w in name_words]
                if len(name_words) == 1 and len(name_words[0]) == 1:
                    name = read(f'{side_key}/0/0', name_words[0][0], t, LETTERS)
                else:
                    name = named_token(side_key, name_words, t, sorted(NAMED))
                if name is None:
                    problems.append(f'course {course_id}: column {ci} has a mark name of shape {[len(w) for w in name_words]}')
                    continue
                marks.append({'mark': name, 'side': 'port' if side == 'p' else 'starboard'})
            marks.append({'mark': '__START__' if finish == 'Start Area' else finish})
            courses.append({'id': course_id, 'windDirectionDeg': wind, 'distanceNm': float(lm.group(1)), 'marks': marks})
    if len(headings) != len(WINDS) or set(headings) != set(WINDS):
        problems.append(f'expected the eight compass points, found {headings}')
    ids = [c['id'] for c in courses]
    if len(set(ids)) != len(ids):
        problems.append('duplicate course ids: ' + ', '.join(sorted({i for i in ids if ids.count(i) > 1})))
    if problems:
        print('the card could not be read (unresolved glyphs go in --overrides after checking the image):', file=sys.stderr)
        for p in problems:
            print('  ' + p, file=sys.stderr)
        sys.exit(1)
    start = json.load(open(args.start_line)) if args.start_line else None
    if any(m['mark'] == '__START__' for c in courses for m in c['marks']):
        if not start:
            sys.exit('courses finish at the start area, so the card needs a --start-line to finish them at')
        for c in courses:
            for m in c['marks']:
                if m['mark'] == '__START__':
                    m['mark'] = start['id']
    notes = json.load(open(args.notes)) if args.notes else None
    emit(course_card_file(meta, start, notes, courses), sys.stdout)


# --- ssi mode: the Jeanot Petch courses, from the text layer -------------------------------

SSI_COURSE_RE = re.compile(r'^Course (\w+) \((\w+)\) – Start Area – Mark (\w+)$')
SSI_MARK_RE = re.compile(r'^(.+?) \((p|s)\)$')
SSI_MIDWAY_RE = re.compile(r'^[‘\']Midway[’\'] Point\s*[:–-]\s*(.+?)\.?$')


def cmd_ssi(args):
    text = subprocess.run(['pdftotext', '-layout', args.pdf, '-'], check=True, capture_output=True, text=True).stdout
    lines = [' '.join(l.split()) for l in text.splitlines()]
    lines = [l for l in lines if l]
    courses, details, preamble = [], [], []
    i = 0
    while i < len(lines) and not SSI_COURSE_RE.match(lines[i]):
        preamble.append(lines[i])
        i += 1
    while i < len(lines):
        m = SSI_COURSE_RE.match(lines[i])
        if not m:
            i += 1
            continue
        name, letter, start_mark = m.groups()
        i += 1
        body = ''
        while i < len(lines) and not re.search(r'Finish at \S', body):
            body += (' ' if body else '') + lines[i]
            i += 1
        seq, _, finish = body.partition(' – Finish at ')
        if not finish:
            seq, _, finish = body.partition(' - Finish at ')
        finish = finish.rstrip('.').strip()
        marks = []
        for tok in seq.split(','):
            mm = SSI_MARK_RE.match(tok.strip())
            if not mm:
                sys.exit(f'course {name}: {tok.strip()!r} is not a mark and a side')
            mark = SSI_ALIASES.get(mm.group(1), mm.group(1))
            if mark not in LETTERS and mark not in NAMED:
                sys.exit(f'course {name}: unknown mark {mm.group(1)!r}')
            marks.append({'mark': mark, 'side': 'port' if mm.group(2) == 'p' else 'starboard'})
        finish_mark = SSI_ALIASES.get(finish, finish)
        if finish_mark not in FINISHES:
            sys.exit(f'course {name}: finishes at {finish!r}')
        marks.append({'mark': finish_mark})
        midway = None
        if i < len(lines):
            mw = SSI_MIDWAY_RE.match(lines[i])
            if mw:
                midway = mw.group(1)
                i += 1
        courses.append({'id': letter, 'marks': marks})
        details.append(f'Course {name} ({letter}): start area at mark {start_mark}' + (f'; midway point {midway}' if midway else '') + '.')
    if not courses:
        sys.exit('no courses found in the supplementary instructions')
    meta = json.load(open(args.meta)) if args.meta else {}
    start = json.load(open(args.start_line)) if args.start_line else None
    notes = [
        {'title': 'Supplementary sailing instructions', 'text': '\n'.join(preamble)},
        {'title': 'Start areas and midway points', 'text': '\n'.join(details)},
    ]
    emit(course_card_file(meta, start, notes, courses), sys.stdout)


# --- notes mode: sections of the two-column instructions ---------------------------------

HEADING_RE = re.compile(r'^F[ABC] \d [A-Z][A-Z /&]+$')
ITEM_RE = re.compile(r'^([a-z]\.|\d\.\d)\s')


def column_lines(words, page, left):
    """The lines of one column of a page, top to bottom: words grouped by
    baseline, each line's words left to right and joined by spaces."""
    width = max(w[3] for w in words if w[0] == page)
    middle = width / 2
    chosen = [w for w in words if w[0] == page and ((w[1] < middle) if left else (w[1] >= middle))]
    lines = {}
    for _, x0, y0, x1, y1, text in chosen:
        key = next((k for k in lines if abs(k - y1) <= 2), None)
        if key is None:
            key = y1
        lines.setdefault(key, []).append((x0, text))
    return [(y, ' '.join(t for _, t in sorted(ws))) for y, ws in sorted(lines.items())]


def section(words, heading):
    """The paragraphs under a heading, from the column it is in down to the
    next heading of the same rank or the foot of the column."""
    hits = []
    for page in sorted({w[0] for w in words}):
        for left in (True, False):
            lines = column_lines(words, page, left)
            for i, (_, text) in enumerate(lines):
                if text == heading:
                    hits.append((page, left, lines, i))
    if len(hits) != 1:
        sys.exit(f'expected one heading {heading!r}, found {len(hits)}')
    _, _, lines, i = hits[0]
    paragraphs = []
    for _, text in lines[i + 1:]:
        if HEADING_RE.match(text) or re.fullmatch(r'\d+', text):
            break
        if ITEM_RE.match(text) or not paragraphs:
            paragraphs.append(text)
        else:
            paragraphs[-1] += ' ' + text
    return paragraphs


def cmd_notes(args):
    words = bbox_words(args.pdf)
    notes = []
    for heading in args.sections.split(','):
        heading = heading.strip()
        notes.append({'title': heading, 'text': '\n'.join(section(words, heading))})
    json.dump(notes, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write('\n')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    c = sub.add_parser('cluster')
    c.add_argument('pdf')
    c.add_argument('workdir')
    c.add_argument('--threshold', type=float, default=0.22)
    c.set_defaults(func=cmd_cluster)
    b = sub.add_parser('card')
    b.add_argument('pdf')
    b.add_argument('--templates', required=True)
    b.add_argument('--meta', help='JSON file whose keys (club, name, source, marks…) head the output')
    b.add_argument('--notes', help='JSON list of {title, text} notes to carry on the card')
    b.add_argument('--start-line', help="JSON for the card's start line, from tools/extract_start_line.py")
    b.add_argument('--overrides', help='JSON {"<glyph key>": "<LABEL>"} for glyphs verified by eye')
    b.add_argument('--review', help='directory to write crops of unresolved glyphs into')
    b.set_defaults(func=cmd_card)
    s = sub.add_parser('ssi')
    s.add_argument('pdf')
    s.add_argument('--meta')
    s.add_argument('--start-line')
    s.set_defaults(func=cmd_ssi)
    n = sub.add_parser('notes')
    n.add_argument('pdf')
    n.add_argument('--sections', required=True, help='comma-separated section headings, e.g. "FB 4 MARKS,FC 6 FINISHING LINE"')
    n.set_defaults(func=cmd_notes)
    args = ap.parse_args()
    args.func(args)


if __name__ == '__main__':
    main()
