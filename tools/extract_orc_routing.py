#!/usr/bin/env python3
"""Generate a routing overlay from Pat Tanner's Cork Harbour workbook.

The workbook (github.com/Bateleur88/cork-harbour-orc) is a spreadsheet of
the 2026 RCYC keelboat card's mark pairs, each checked against INFOMAR
bathymetry and either found sailable as a straight line or routed through
routing waypoints he authored from local knowledge. Three of its sheets
are what the overlay is made of:

  - **Marks**: every mark and routing waypoint, with decimal positions in
    columns E and F; the waypoints are named `RW_…`.
  - **Passages**: one row per directed pair the straight line will not do,
    with its status and the waypoints it goes through, "A → B" or "A, B".
    Only VERIFIED rows are passages; the Curlane rows, which pass only near
    high water, are not.
  - **Required Pairs**: every directed pair the card sails, with its status;
    DIRECT – VERIFIED is a pair found sailable as a straight line.

The overlay keys a pair once, in either direction, so the tool merges each
pair with its reverse — and refuses a pair the workbook routes differently
each way, or calls direct one way and a passage the other. Its marks are
the workbook's names; `--names` maps any that are not the marks file's ids
(the workbook's "Grassy Mid" is the start line where it assumes it), and
every name left must be a mark of `--marks` — so a workbook mark the data
set does not know is refused, not carried. `--assumed` gives the tolerance
for each mark, the assumed positions a mark with no fixed position stands
in for another by, and any whose position is not the workbook's — each
with a `source` saying whose it is.

    python3 tools/extract_orc_routing.py <workbook.xlsx> --marks marks.json \\
        --names names.json --assumed assumed.json --meta meta.json > routing.json

Reads the .xlsx with the standard library: it is a zip of XML sheets.
"""

import argparse
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
REL = '{http://schemas.openxmlformats.org/package/2006/relationships}'


def sheets(path):
    """{sheet name: [row, ...]}, each row a list of cell values by column."""
    z = zipfile.ZipFile(path)
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS):
            shared.append(''.join(t.text or '' for t in si.iter(f'{{{NS["m"]}}}t')))
    rels = {r.get('Id'): r.get('Target') for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels')).iter(f'{REL}Relationship')}
    out = {}
    for s in ET.fromstring(z.read('xl/workbook.xml')).find('m:sheets', NS):
        target = rels[s.get(f'{{{NS["r"]}}}id')].lstrip('/')
        target = target if target.startswith('xl/') else 'xl/' + target
        rows = []
        for row in ET.fromstring(z.read(target)).iter(f'{{{NS["m"]}}}row'):
            values = []
            for c in row.findall('m:c', NS):
                col = 0
                for ch in re.match(r'[A-Z]+', c.get('r')).group():
                    col = col * 26 + ord(ch) - 64
                while len(values) < col - 1:
                    values.append(None)
                v = c.find('m:v', NS)
                if c.get('t') == 's':
                    value = shared[int(v.text)]
                elif c.get('t') == 'inlineStr':
                    value = ''.join(t.text or '' for t in c.iter(f'{{{NS["m"]}}}t'))
                elif v is None:
                    value = None
                elif c.get('t') in ('str', 'b'):
                    value = v.text
                else:
                    value = float(v.text)
                values.append(value)
            rows.append(values)
        out[s.get('name')] = rows
    return out


def cell(row, i):
    return row[i] if i < len(row) else None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('workbook')
    ap.add_argument('--marks', required=True, help="the data set's marks file")
    ap.add_argument('--names', help='JSON: {workbook name: overlay id}')
    ap.add_argument('--assumed', required=True, help='JSON: tolerances, stand-ins and positions not the workbook\'s')
    ap.add_argument('--meta')
    args = ap.parse_args()

    book = sheets(args.workbook)
    marks_file = {m['id'] for m in json.load(open(args.marks))['marks']}
    names = json.load(open(args.names)) if args.names else {}
    spec = json.load(open(args.assumed))
    meta = json.load(open(args.meta)) if args.meta else {}

    positions = {}
    for row in book['Marks'][1:]:
        name, lat, lng = cell(row, 0), cell(row, 4), cell(row, 5)
        if isinstance(name, str) and isinstance(lat, float) and isinstance(lng, float):
            positions[name.split(' / ')[0].strip()] = {'lat': round(lat, 6), 'lng': round(lng, 6)}

    def turns(text):
        return [p.strip() for p in re.split(r'→|,', text or '') if p.strip()]

    # Directed pairs, then merged with their reverses.
    passages, direct, skipped = {}, set(), []
    for row in book['Passages'][1:]:
        a, b, via, status, note = (cell(row, i) for i in (0, 1, 2, 4, 5))
        if status != 'VERIFIED':
            continue
        if a.startswith('RW_') or b.startswith('RW_'):
            skipped.append(f'{a} → {b}')  # a passage to a waypoint is no leg of a card
            continue
        passages[(a, b)] = (turns(via), note)
    for row in book['Required Pairs'][1:]:
        if cell(row, 5) == 'DIRECT – VERIFIED':
            direct.add((cell(row, 0), cell(row, 1)))

    merged_passages, merged_direct = {}, {}
    for (a, b), (via, note) in passages.items():
        if (b, a) in direct:
            sys.exit(f'{a} – {b}: direct one way and a passage the other')
        if (b, a) in passages and passages[(b, a)][0] != via[::-1]:
            sys.exit(f'{a} – {b}: routed differently each way')
        key = frozenset((a, b))
        if key not in merged_passages:
            merged_passages[key] = (a, b, via, note)
    for a, b in sorted(direct):
        key = frozenset((a, b))
        if key not in merged_direct:
            merged_direct[key] = (a, b)

    def rename(name):
        return names.get(name, name)

    used = set()
    for a, b, via, _ in merged_passages.values():
        used |= {a, b, *via}
    for a, b in merged_direct.values():
        used |= {a, b}
    excluded = set(spec.get('exclude', []))
    used -= excluded

    waypoints = []
    for name in sorted(n for n in used if n.startswith('RW_')):
        if name not in positions:
            sys.exit(f'{name}: no position in the workbook')
        waypoints.append({'id': name, 'position': positions[name]})

    assumed = []
    tolerances = spec['tolerances']
    for name in sorted(n for n in used if not n.startswith('RW_')):
        own = rename(name)
        mark = own.split('@')[0]
        if mark not in marks_file and mark not in spec.get('lines', []):
            sys.exit(f'{name}: not a mark of {args.marks}')
        given = spec.get('positions', {}).get(own)
        entry = {**({'id': own} if own != mark else {}), 'mark': mark}
        if given:
            entry['position'] = given['position']
        elif name in positions:
            entry['position'] = positions[name]
        else:
            sys.exit(f'{name}: no position in the workbook')
        entry['toleranceM'] = tolerances.get(own, tolerances['default'])
        note = (given or {}).get('note') or spec.get('notes', {}).get(own)
        if note:
            entry['note'] = note
        if given and given.get('source'):
            entry['source'] = given['source']
        assumed.append(entry)
    assumed += spec.get('standIns', [])

    out_passages = []
    for a, b, via, note in sorted(merged_passages.values(), key=lambda p: (rename(p[0]), rename(p[1]))):
        if {a, b, *via} & excluded:
            continue
        out_passages.append({'from': rename(a), 'to': rename(b), 'via': [rename(v) for v in via],
                             **({'note': ' '.join(note.split())} if note else {})})
    out_direct = [{'from': rename(a), 'to': rename(b)}
                  for a, b in sorted(merged_direct.values(), key=lambda p: (rename(p[0]), rename(p[1])))
                  if not {a, b} & excluded]

    for line in skipped:
        print(f'skipped {line}: a passage to a routing waypoint is no leg of a card', file=sys.stderr)
    json.dump({'formatVersion': 2, **meta, 'assumed': assumed, 'waypoints': waypoints,
               'passages': out_passages, 'direct': out_direct}, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write('\n')


if __name__ == '__main__':
    main()
