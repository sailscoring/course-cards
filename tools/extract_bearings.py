#!/usr/bin/env python3
"""Read the "Relative Bearings Table - Magnetic (Approx)" from HYC's course
card technical sheet into JSON: {"A": {"B": 186, ...}, ...} — the bearing
from the row mark to the column mark, degrees magnetic, as the club prints
it. Not part of the format: it is a published cross-check on the marks file,
used by the test suite.

    python3 tools/extract_bearings.py <technical-sheet.pdf> > bearings.json
"""

import json
import re
import subprocess
import sys


def main():
    text = subprocess.run(['pdftotext', '-layout', sys.argv[1], '-'], check=True, capture_output=True, text=True).stdout
    lines = text.split('\n')
    start = next(i for i, l in enumerate(lines) if 'Relative Bearings' in l)
    header = lines[start + 1].split()
    if not all(re.fullmatch(r'[A-Z]', h) for h in header):
        sys.exit(f'unexpected header: {header}')
    table = {}
    for line in lines[start + 2:]:
        tokens = line.split()
        if not tokens:
            if table:
                break
            continue
        row, values = tokens[0], tokens[1:]
        if not re.fullmatch(r'[A-Z]', row) or row not in header:
            sys.exit(f'unexpected row: {line!r}')
        # The diagonal cell is blank, so the row has one value fewer than the header.
        diag = header.index(row)
        if len(values) != len(header) - 1:
            sys.exit(f'row {row}: expected {len(header) - 1} values, got {len(values)}')
        values.insert(diag, None)
        table[row] = {col: int(v) for col, v in zip(header, values) if v is not None}
    if set(table) != set(header):
        sys.exit(f'rows {sorted(table)} != columns {sorted(header)}')
    json.dump(table, sys.stdout, indent=1)
    sys.stdout.write('\n')


if __name__ == '__main__':
    main()
