import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { bearingDeg, distanceNm, parseMarksFile } from '../src/index';

/**
 * The technical sheet prints a mark-to-mark bearing table (magnetic,
 * "approx", whole degrees). It is an independent check on the marks file:
 * bearings computed from the extracted positions should differ from the
 * printed ones by one consistent offset — the magnetic variation when the
 * table was computed — and little else.
 *
 * That offset comes out at 6° W, the variation off Dublin around the year
 * 2000 (it is under 2° W in 2025), so the table is decades old. Four marks
 * have plainly been moved since — Cush, Island, Portmarnock and Spit
 * disagree with it by 10–25° — and are left out; every other pair agrees
 * to within 3°, which is as good as positions printed to 0.01' allow.
 */
function load(rel: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, '..', 'data', 'hyc', 'al-2025', rel), 'utf-8'));
}

const marks = parseMarksFile(load('marks.json'));
const table = load('bearings-magnetic.json') as Record<string, Record<string, number>>;

function angleDiff(a: number, b: number): number {
  return ((a - b + 540) % 360) - 180;
}

describe('the marks file against the club’s magnetic bearing table', () => {
  const byId = new Map(marks.marks.map((m) => [m.id, m]));
  const pairs: Array<{ from: string; to: string; printed: number; computed: number; nm: number }> = [];
  for (const [from, row] of Object.entries(table)) {
    for (const [to, printed] of Object.entries(row)) {
      const a = byId.get(from)!.position!;
      const b = byId.get(to)!.position!;
      pairs.push({ from, to, printed, computed: bearingDeg(a, b), nm: distanceNm(a, b) });
    }
  }

  it('covers the racing marks (not the South Rowan navigation mark) both ways', () => {
    const fixed = marks.marks.filter((m) => m.position).map((m) => m.id);
    expect(Object.keys(table).sort()).toEqual(fixed.filter((id) => id !== 'R').sort());
    expect(pairs).toHaveLength(20 * 19);
  });

  const moved = new Set(['C', 'I', 'P', 'S']);
  const current = pairs.filter((p) => !moved.has(p.from) && !moved.has(p.to));

  it('differs from the computed true bearings by one westerly variation', () => {
    const offsets = current.map((p) => angleDiff(p.printed, p.computed)).sort((x, y) => x - y);
    const median = offsets[Math.floor(offsets.length / 2)]!;
    expect(median).toBeGreaterThan(5);
    expect(median).toBeLessThan(7);
    for (const p of current) {
      expect(Math.abs(angleDiff(p.printed, p.computed) - median), `${p.from}→${p.to} (${p.nm.toFixed(2)} NM)`)
        .toBeLessThanOrEqual(3);
    }
  });

  it('shows the four moved marks as the outliers they are', () => {
    for (const id of moved) {
      const worst = Math.max(
        ...pairs.filter((p) => p.from === id || p.to === id).map((p) => Math.abs(angleDiff(p.printed, p.computed) - 6)),
      );
      expect(worst, id).toBeGreaterThan(8);
    }
  });
});
