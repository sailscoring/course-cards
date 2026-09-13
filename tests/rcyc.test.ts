import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { courseLegs, parseCourseCardFile, parseMarksFile, printedMarks } from '../src/index';

function load(rel: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, '..', 'data', 'rcyc', 'keelboat-2026', rel), 'utf-8'));
}

const marks = parseMarksFile(load('marks.json'));
const card = parseCourseCardFile(load('keelboat.json'));
const byId = new Map(marks.marks.map((m) => [m.id, m]));

// The card's courses in its reading order — left column then right, page 2 then page 3.
const ORDER = '1 2 3 4 5 6 7 71 74 8 9 10 11 75 76 77 12 13 14 78 15 16 17 18 19 79 80 20 21 22 23 81 82 83 72 24 25 73 26 27'.split(' ');

// A dozen courses read from the printed card: the rounds run together, "P"/"S" the sides,
// "|Cage" the finishing line laid at Cage crossed mid-course, then the last distance printed.
const PRINTED: Array<[string, string, number | undefined, number | undefined]> = [
  ['1', 'Ringabella P, W2 P, Cage S, No.7 S, Cage P, Dosco P', 9.8, undefined],
  ['2', 'Dutchman P, W2 P, Cage S, No.7 S, Cage P, Dosco P', 8, undefined],
  ['4', 'No.13 S, No.11 S, No.10 P, Dosco S, Cage P, W4 S, Cage S, No.5 P, No.14 S, Dosco S', 11, 0],
  ['12', 'E2 P, No.14 S, Dosco S, Cage S, No.7 S, No.5 S, Cage S, No.10 P', 3, 180],
  ['23', 'No.8 P, No.3 S, W4 S, Cage S, Dosco P, No.8 P, No.5 S', undefined, 270],
  ['71', 'No.7 P, No.10 S, EF4 S, No.10 P, Dosco S, Cage S, No.7 S, No.5 S', 8.4, 45],
  ['73', 'White Bay P, Cage S, Dosco S, White Bay S, Cage S, White Bay P, No.8 S, No.5 S', 7.9, 315],
  ['75', 'No.8 P, Curlane S, No.12 S, No.8 S, Curlane S, No.10 S, Cage S, Curlane S', 6.2, 90],
  ['76', 'No.16 S, EF2 P, No.11 P, No.5 P, |Cage, No.8 P', 7, 90],
  ['81', 'No.16 S, EF2 S, No.11 P, No.5 S, |Cage, No.8 S', 6.8, 270],
  ['82', 'Harp P, No.3 P, Cage S, No.8 S', 6, 270],
  ['27', 'E1 P, No.6 S, No.3 P, Cage S, No.5 P, No.10 S, No.3 S', 8.4, 315],
];

function sequence(id: string): string {
  return printedMarks(card, id)
    .slice(0, -1) // the finish, SL
    .map((m) => (m.passing ? `|${m.mark}` : `${m.mark} ${m.side === 'port' ? 'P' : 'S'}`))
    .join(', ');
}

describe('the Royal Cork 2026 marks file', () => {
  it('positions the four Port of Cork laid race marks from the General Sailing Instructions 22.3', () => {
    expect(byId.get('Dosco')).toMatchObject({ name: 'Dosco (Corkbeg)', shape: 'conical', color: 'yellow', position: { lat: 51.821, lng: -8.2635 } });
    expect(byId.get('Ringabella')!.position).toEqual({ lat: 51.770667, lng: -8.292 });
    expect(byId.get('Harp')!.position).toEqual({ lat: 51.7865, lng: -8.236833 });
    expect(byId.get('East Mark')).toMatchObject({ name: 'East Mark (Formerly Mark B)', position: { lat: 51.771833, lng: -8.236333 } });
    expect(marks.marks.filter((m) => m.position).map((m) => m.id)).toEqual(['Dosco', 'Ringabella', 'Harp', 'East Mark']);
  });

  it('lists every other mark the card names, unplaced, and says why', () => {
    expect(marks.marks).toHaveLength(30);
    for (const id of ['No.3', 'No.20', 'E1', 'W4', 'EF2', 'Cage']) {
      expect(byId.get(id)!.position, id).toBeUndefined();
      expect(byId.get(id)!.placement, id).toMatch(/navigation buoy|Cage/);
    }
    expect(byId.get('Cage')).toMatchObject({ name: 'Cage (C1)', shape: 'conical', color: 'green' });
    expect(byId.get('Dutchman')!.placement).toMatch(/approx\. 2 cables SE of the Dutchman Rock/);
    expect(byId.get('Curlane')!.placement).toBe('“Curlane” will be a mark laid on the Curlane Bank.');
    const named = new Set(card.courses.flatMap((c) => c.marks.map((m) => m.mark)));
    for (const id of named) if (id !== 'SL') expect(byId.has(id), id).toBe(true);
  });
});

describe('the Keelboat Racing Course Card 2026', () => {
  it('has the forty courses in the card’s reading order', () => {
    expect(card.courses.map((c) => c.id)).toEqual(ORDER);
  });

  it('starts every course at the General Sailing Instructions’ line and finishes it there', () => {
    expect(card.startLine).toMatchObject({ id: 'SL', source: 'General Sailing Instructions for Royal Cork Yacht Club Keelboat Racing 2026, 26' });
    expect(card.startLine!.placement).toMatch(/^A number of Start\/ Finish lines may be used\. These include: 26\.1 Grassy Walk Line/);
    for (const course of card.courses) {
      expect(course.marks[0], course.id).toEqual({ mark: 'SL' });
      expect(course.marks[course.marks.length - 1], course.id).toEqual({ mark: 'SL' });
    }
  });

  it('reads the rounds as printed, run together, with the last cumulative distance', () => {
    for (const [id, seq, nm, wind] of PRINTED) {
      expect(sequence(id), id).toBe(seq);
      const course = card.courses.find((c) => c.id === id)!;
      expect(course.distanceNm, id).toBe(nm);
      expect(course.windDirectionDeg, id).toBe(wind);
    }
  });

  it('keeps each course’s rounds, distances and notes in the first note', () => {
    const lines = card.notes![0]!.text.split('\n');
    expect(card.notes![0]!.title).toBe('Courses as printed, by round');
    expect(lines).toHaveLength(40);
    expect(lines[0]).toBe('Course 1 (Admiral’s Choice), S/SW OR N/NE WIND: Round One: Ringabella (P) – W2 (P) - Cage (S) (6nm); Round Two: No.7 (S) - Cage (P) (8nm); Round Three: Dosco (P) - Finish. (9.8nm).');
    expect(lines.find((l) => l.startsWith('Course 2 '))).toMatch(/Note: The Dutchman mark will be a ‘laid’ club racing mark/);
    expect(lines.find((l) => l.startsWith('Course 72 '))).toMatch(/“Curlane” will be a mark laid on the Curlane Bank\./);
    expect(lines.find((l) => l.startsWith('Course 23 '))).toBe('Course 23 **, W WIND: Round One: No.8 (P) – No.3 (S) – W4 (S) - Cage (S); Round Two: Dosco (P) – No.8 (P) – No.5 (S) - Finish.');
    expect(card.notes!.map((n) => n.title).slice(1)).toEqual(['IMPORTANT NOTES', 'COMMITTEE VESSEL', 'GRASSY WALK LINE']);
  });

  it('cannot yet be sailed from the card alone: the navigation buoys are unplaced', () => {
    expect(() => courseLegs(card, marks, '1', { marks: { SL: { lat: 51.81, lng: -8.29 } } })).toThrow(/no position for mark "W2" \(A Port of Cork navigation buoy/);
    const positions = { SL: { lat: 51.81, lng: -8.29 }, W2: { lat: 51.795, lng: -8.27 }, Cage: { lat: 51.806, lng: -8.284 }, 'No.7': { lat: 51.822, lng: -8.27 } };
    const legs = courseLegs(card, marks, '1', { marks: positions });
    expect(legs.map((l) => l.to.mark)).toEqual(['Ringabella', 'W2', 'Cage', 'No.7', 'Cage', 'Dosco', 'SL']);
  });
});
