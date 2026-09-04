#!/usr/bin/env python3
"""Cross-check a data set read from HYC sailing instructions against the
picture the same SI prints: the "MARK LOCATION CARD" page draws the marks
as red dots on a chart above the table of positions. The picture is the only
other thing the document says about where the marks are, so this checks the
two agree.

The dots carry no machine-readable labels, so the check finds the red dots,
then tries every way of matching dots to marks and keeps the one under which
the most dots sit where the marks file's positions put them, in one north-up
linear fit (the picture is a plain chart, a few miles across, so an affine
fit is exact to well under a dot's width). A mark whose dot is not within
`tolerance` pixels of its fitted position — or that has no dot — is reported,
and so is any dot left over, with the position the fit implies for it.

    python3 tools/check_hyc_si.py data/hyc/brass-monkey-2025

Reads `checks` from the directory's manifest.json. Exit status 1 on any
difference, each one printed — except one the manifest records as
`expected` (a `mark` with no dot where the table puts it, or a stray `dot`
at a position), which is printed as known; if that one ever disappears (the
club corrects a document), that is reported instead.
"""

import itertools
import json
import math
import os
import subprocess
import sys
import tempfile

from PIL import Image

TOLERANCE_PX = 10  # about 0.1′ on a page-wide chart of Howth Sound
MIN_DOT_PX = 30


def page_image(pdf, page):
    """The largest image on the page, as an RGB Image."""
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(['pdfimages', '-f', str(page), '-l', str(page), '-png', pdf, os.path.join(tmp, 'img')], check=True)
        files = [os.path.join(tmp, f) for f in os.listdir(tmp)]
        if not files:
            sys.exit(f'{pdf}: no image on page {page}')
        best = max(files, key=lambda f: Image.open(f).size[0] * Image.open(f).size[1])
        return Image.open(best).convert('RGB')


def red_dots(image):
    """Centroids of the connected red blobs at least MIN_DOT_PX pixels big."""
    width, height = image.size
    px = image.load()

    def red(x, y):
        r, g, b = px[x, y]
        return r > 180 and g < 90 and b < 90

    seen = set()
    dots = []
    for y in range(height):
        for x in range(width):
            if (x, y) in seen or not red(x, y):
                continue
            stack, blob = [(x, y)], []
            seen.add((x, y))
            while stack:
                cx, cy = stack.pop()
                blob.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < width and 0 <= ny < height and (nx, ny) not in seen and red(nx, ny):
                        seen.add((nx, ny))
                        stack.append((nx, ny))
            if len(blob) >= MIN_DOT_PX:
                dots.append((sum(p[0] for p in blob) / len(blob), sum(p[1] for p in blob) / len(blob)))
    return dots


def fit_line(pairs):
    """Least-squares v = a·u + b over (u, v) pairs."""
    n = len(pairs)
    mu = sum(u for u, _ in pairs) / n
    mv = sum(v for _, v in pairs) / n
    suu = sum((u - mu) ** 2 for u, _ in pairs)
    a = sum((u - mu) * (v - mv) for u, v in pairs) / suu
    return a, mv - a * mu


def fit(pairs):
    """A north-up chart fit, ((ax, bx), (ay, by)), from (position, dot) pairs:
    x = ax·lng + bx, y = ay·lat + by."""
    return fit_line([(p['lng'], d[0]) for p, d in pairs]), fit_line([(p['lat'], d[1]) for p, d in pairs])


def project(f, p):
    (ax, bx), (ay, by) = f
    return ax * p['lng'] + bx, ay * p['lat'] + by


def unproject(f, d):
    (ax, bx), (ay, by) = f
    return {'lat': (d[1] - by) / ay, 'lng': (d[0] - bx) / ax}


def residual(f, p, d):
    x, y = project(f, p)
    return math.hypot(d[0] - x, d[1] - y)


def assign(f, marks, dots):
    """Each dot to the nearest mark under fit `f`, closest pairs first, when
    within tolerance: {mark id: dot}."""
    candidates = sorted(((residual(f, m['position'], d), m['id'], d) for m in marks for d in dots), key=lambda c: c[0])
    placed, used = {}, set()
    for r, id_, d in candidates:
        if r > TOLERANCE_PX:
            break
        if id_ not in placed and id(d) not in used:
            placed[id_] = d
            used.add(id(d))
    return placed


def match(marks, dots):
    """The assignment of dots to marks under which the most dots sit where the
    table puts them; returns (fit on those, {mark id: dot}, [stray dots]).
    Every pair of dots against every ordered pair of marks is a hypothesis
    for the chart's fit, so one badly placed dot cannot skew the rest."""
    by_id = {m['id']: m for m in marks}
    best = None
    for d1, d2 in itertools.combinations(dots, 2):
        for m1, m2 in itertools.permutations(marks, 2):
            if m1['position']['lng'] == m2['position']['lng'] or m1['position']['lat'] == m2['position']['lat']:
                continue
            f = fit([(m1['position'], d1), (m2['position'], d2)])
            if f[0][0] <= 0 or f[1][0] >= 0:
                continue  # east must be right and north up
            placed = assign(f, marks, dots)
            if len(placed) < 3:
                continue
            f = fit([(by_id[i]['position'], d) for i, d in placed.items()])
            placed = assign(f, marks, dots)
            rms = math.sqrt(sum(residual(f, by_id[i]['position'], d) ** 2 for i, d in placed.items()) / len(placed))
            key = (len(placed), -rms)
            if best is None or key > best[0]:
                best = (key, f, placed)
    if best is None:
        sys.exit('no way of matching the red dots to the table fits the picture')
    _, f, placed = best
    stray = [d for d in dots if not any(d is p for p in placed.values())]
    return f, placed, stray


def format_position(p):
    def dm(v, width):
        deg = int(abs(v))
        return f'{deg:0{width}d}° {(abs(v) - deg) * 60:05.2f}′'
    return f'{dm(p["lat"], 2)} {"N" if p["lat"] >= 0 else "S"} {dm(p["lng"], 3)} {"E" if p["lng"] >= 0 else "W"}'


def check_map_image(base, marks_file, pdf, page, expected=()):
    marks = [m for m in json.load(open(os.path.join(base, marks_file)))['marks'] if m.get('position')]
    image = page_image(os.path.join(base, pdf), page)
    dots = red_dots(image)
    f, placed, stray = match(marks, dots)
    (ax, _), (ay, _) = f
    scale = f'{ax / 60:.0f} px per minute of longitude, {-ay / 60:.0f} of latitude'
    worst = max(residual(f, m['position'], placed[m['id']]) for m in marks if m['id'] in placed)
    noted, problems = [], []
    known = {e['mark']: e.get('note', '') for e in expected if 'mark' in e}
    known_dots = [e for e in expected if 'dot' in e]

    def note(line, text):
        return f'{line} (known: {text})' if text else f'{line} (known)'

    for m in marks:
        if m['id'] in placed:
            if m['id'] in known:
                problems.append(f'{m["id"]} is drawn where the table puts it, but the manifest expects it not to be')
            continue
        line = f'{m["id"]} {m["name"]}: no dot within {TOLERANCE_PX} px of its {format_position(m["position"])}'
        (noted if m['id'] in known else problems).append(note(line, known.get(m['id'])) if m['id'] in known else line)
    for d in stray:
        p = unproject(f, d)
        line = f'a dot at pixel ({d[0]:.0f}, {d[1]:.0f}) is about {format_position(p)}, where the marks file puts no mark'
        expected_dot = next((e for e in known_dots if residual(f, e['dot'], d) <= TOLERANCE_PX), None)
        if expected_dot:
            known_dots.remove(expected_dot)
            noted.append(note(line, expected_dot.get('note', '')))
        else:
            problems.append(line)
    for e in known_dots:
        problems.append(f'the manifest expects a stray dot about {format_position(e["dot"])}, but there is none')
    summary = f'{len(placed)} of {len(marks)} marks drawn where the marks file puts them (worst {worst:.1f} px; {scale})'
    heading = f'{marks_file} against the picture on page {page} of {pdf}'
    return heading, summary, problems, noted


def main():
    base = sys.argv[1]
    manifest = json.load(open(os.path.join(base, 'manifest.json')))
    failures = 0
    for check in manifest['checks']['items']:
        kind = check['check']
        if kind == 'map-image':
            heading, summary, problems, noted = check_map_image(base, check['marks'], check['pdf'], check['page'], check.get('expected', ()))
        else:
            sys.exit(f'unknown check {kind}')
        status = f'{len(problems)} DIFFERENCES' if problems else f'ok, {len(noted)} known difference(s)' if noted else 'ok'
        print(f'{heading}: {status}')
        print('  ' + summary)
        for p in noted + problems:
            print('  ' + p)
        failures += bool(problems)
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
