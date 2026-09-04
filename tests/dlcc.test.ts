import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseCourseCardFile, parseMarksFile } from '../src/index';

function load(...rel: string[]): unknown {
  return JSON.parse(readFileSync(join(__dirname, '..', 'data', ...rel), 'utf-8'));
}

const marks = parseMarksFile(load('dlcc', 'regattas-2026', 'marks.json'));
const card = parseCourseCardFile(load('dlcc', 'regattas-2026', 'course-card-a.json'));

// Every course of the printed card, read by eye from the picture in the SI.
const PRINTED = `
A NORTH 000|E D B D B D C K|E D B D C K|E C K|E K
B NNE 022.5|F E B E B E C K|F E B E C K|F C K|F K
C E 045|F E C E C E D B|F E C E D B|F D B|F B
D ENE 066.5|G F C F C F D B|G F C F D B|G D B|G B
E EAST 090|G F D F D F E C|G F D F E C|G E C|G C
F ESE 112.5|J G D G D G E C|J G D G E C|J E C|J C
G SE 135|J G E G E G F D|J G E G F D|J F D|J D
H SSE 157.5|K J E J E J F D|K J E J F D|K F D|K D
J SOUTH 180|K J F J F J G E|K J F J G E|K G E|K E
K SSW 202.5|B K F K F K G E|B K F K G E|B G E|B E
L SW 225|B K G K G K G F|B K G K J F|B J F|B F
M WSW 247.5|C B G B G B J F|C B G B J F|C J F|C F
N WEST 270|C B J B J B K G|C B J B K G|C K G|C G
P WNW 292.5|D C J C J C K G|D C J C K G|D K G|D G
Q NW 315|D C K C K C B J|D C K C B J|D B J|D J
R NNW 337.5|E D K D K D B J|E D K D B J|E B J|E J
`
  .trim()
  .split('\n')
  .map((line) => {
    const [heading, ...rows] = line.split('|');
    return { heading: heading!, letter: heading!.split(' ')[0]!, rows };
  });

describe('the Combined Clubs 2026 marks file', () => {
  it('is DBSC’s 2026 set — the sheet the addendum reproduces, plus the hut start marks and Zebra', () => {
    const dbsc = parseMarksFile(load('dbsc', 'summer-2026', 'marks.json'));
    expect(marks.marks).toEqual(dbsc.marks);
    expect(marks.marks.map((m) => m.id).join('')).toBe('ABCDEFGHJKLMNOPQRSTVWXY23Z');
  });
});

describe('the Combined Clubs 2026 Course Card A', () => {
  it('has the 16 lettered sections × 4 courses in the card’s order', () => {
    expect(card.marks).toBe('marks.json');
    expect(card.courses.map((c) => c.id)).toEqual(PRINTED.flatMap((s) => [1, 2, 3, 4].map((n) => `${s.letter}${n}`)));
  });

  it('every course is as printed, every mark rounded to port and one of DBSC’s', () => {
    const known = new Set(marks.marks.map((m) => m.id));
    for (const section of PRINTED) {
      section.rows.forEach((row, i) => {
        const course = card.courses.find((c) => c.id === `${section.letter}${i + 1}`)!;
        expect(course.marks.map((m) => m.mark).join(' '), course.id).toBe(row);
        for (const cm of course.marks) {
          expect(cm.side, `${course.id}: mark ${cm.mark}`).toBe('port');
          expect(cm.passing, `${course.id}: mark ${cm.mark}`).toBeUndefined();
          expect(known.has(cm.mark), `${course.id}: mark ${cm.mark}`).toBe(true);
        }
      });
    }
    // The card uses eight of the marks, B–K
    const used = new Set(card.courses.flatMap((c) => c.marks.map((m) => m.mark)));
    expect([...used].sort().join('')).toBe('BCDEFGJK');
  });

  it('each section’s courses shorten in the card’s pattern: 8, 6, 3 and 2 marks', () => {
    for (const section of PRINTED) {
      const lengths = [1, 2, 3, 4].map((n) => card.courses.find((c) => c.id === `${section.letter}${n}`)!.marks.length);
      expect(lengths, section.letter).toEqual([8, 6, 3, 2]);
    }
  });

  it('carries the section headings as printed — including "C E 045" — the card’s own line, and Addendum A §1–3', () => {
    expect(card.notes?.map((n) => n.title)).toEqual([
      'Course sections',
      'Card notes',
      'A1. The Course',
      'A2. Marks',
      'A3. Starting & Finishing Lines',
    ]);
    expect(card.notes![0]!.text).toBe(PRINTED.map((s) => s.heading).join(', '));
    expect(card.notes![1]!.text).toBe('PLEASE RETAIN THIS CARD FOR DMYC, NYC, RIYC & RSGYC 2026 REGATTAS');
    const a1 = card.notes![2]!.text.split('\n');
    expect(a1).toHaveLength(6);
    expect(a1[5]).toBe('1.6 All marks shall be rounded to port in the order listed.');
    expect(a1[2]).toBe(
      '1.3 If there is a number preceding the letter, the course shall be repeated that number of times. For example, the display of 2A3 means that course A3 shall be sailed twice: E C K E C K.',
    );
    expect(card.notes![4]!.text.split('\n')[0]).toBe('3.1 The race start line will be approximately North of Dun Laoghaire Harbour.');
  });

  it('A1.3’s example agrees with the card: A3 is E C K, and A1.4’s B4 is F K', () => {
    expect(card.courses.find((c) => c.id === 'A3')!.marks.map((m) => m.mark).join(' ')).toBe('E C K');
    expect(card.courses.find((c) => c.id === 'B4')!.marks.map((m) => m.mark).join(' ')).toBe('F K');
  });
});
