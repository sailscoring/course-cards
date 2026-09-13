import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { courseLegs, parseCourseCardFile, parseMarksFile } from '../src/index';
import { printed } from './printed';

function load(...rel: string[]): unknown {
  return JSON.parse(readFileSync(join(__dirname, '..', 'data', 'kyc', 'sovereigns-2025', ...rel), 'utf-8'));
}

const marks = parseMarksFile(load('marks.json'));
const rtc = parseCourseCardFile(load('rtc-coastal.json'));
const jp = parseCourseCardFile(load('jeanot-petch.json'));

// Every course of the RTC/Coastal tables, read by eye from the pictures on
// pages 16–19 of the sailing instructions: id | marks with sides | where it
// finishes | the printed approximate length.
const PRINTED = `
N1|B(p) J(p) G(p)|Start Area|9.6
N1A|B(p) C(p) B(p) J(p) G(p)|Start Area|12.0
N1B|D(p) H(s) M(p)|K|10.5
N1C|D(p) F(p) Lge Sov(p) G(s) H(s) M(p)|K|17.5
N2|B(p) J(s) K(s) C(p) B(p) M(s) A(p)|CF|10.7
N2A|B(p) G(p) D(p) C(s) M(s) A(p)|CF|15.0
N2B|M(s) E(p) Lge Sov(p) C(s) M(s) A(p)|CF|11.6
N2C|M(s) F(s) G(s) B(p) J(s) M(s) A(p)|CF|17.8
NE1|D(s) F(s) J(s)|Start Area|10.1
NE1A|D(s) E(s) J(s) C(s) J(s) C(s)|Start Area|11.4
NE1B|E(p) H(s) B(p)|J|11.8
NE1C|E(p) C(p) G(p) F(p) J(s) B(p)|J|16.0
NE1D|Cork Buoy(p)|J|20.0
NE2|D(p) J(s) C(p) K(s) M(s) A(p)|CF|10.8
NE2A|D(p) J(p) G(p) M(s) A(p)|CF|14.5
NE2B|Lge Sov(p) J(s) B(p) M(s) A(p)|CF|12.6
NE2C|Lge Sov(s) F(s) H(s) D(p) B(s) M(s) A(p)|CF|18.4
E1|Lge Sov(s) C(s) K(s) Lge Sov(s)|Start Area|10.0
E1A|Lge Sov(s) J(p) F(p) K(s)|Start Area|14.4
E1B|E(p) K(p) E(p)|C|10.2
E1C|E(s) J(p) F(p) K(s) E(p)|C|18.1
E1D|E(s) Black Tom(s) E(p)|C|21.4
E2|Lge Sov(p) K(p) E(p) M(s) A(p)|CF|11.6
E2A|Lge Sov(p) K(p) E(p) C(s) Lge Sov(p) M(s) A(p)|CF|16.1
E2B|E(p) B(p) C(s) K(s) B(p) M(s) A(p)|CF|10.6
E2C|E(p) K(p) E(p) B(s) Lge Sov(s) K(s) M(s) A(p)|CF|17.4
SE1|E(p) D(p) C(p) F(p)|Start Area|9.8
SE1A|E(p) D(p) B(s) M(p) F(p)|Start Area|11.1
SE1B|F(p) C(p) F(p)|K|11.0
SE1C|F(p) D(p) K(p) C(p) K(p) F(p)|K|17.0
SE2|E(p) D(p) K(p) C(p) M(s) C(p) M(s) A(p)|CF|11.2
SE2A|E(p) D(p) K(p) F(p) K(s) C(p) M(s) A(p)|CF|14.6
SE2B|F(p) E(p) K(p) C(p) M(s) A(p)|CF|12.8
SE2C|F(p) E(p) K(p) F(p) B(p) M(s) A(p)|CF|18.2
S1|C(p) E(s) F(s) C(s)|Start Area|9.8
S1A|C(p) D(s) F(s) D(p) C(s)|Start Area|12.2
S1B|G(s) K(p) J(p) M(s)|C|11.2
S1C|G(s) M(p) H(p) K(p) J(p) M(s)|C|17.3
S2|C(p) E(s) F(s) M(s) A(p)|CF|10.8
S2A|C(p) E(s) F(s) B(p) C(s) M(s) A(p)|CF|12.8
S2B|G(p) F(p) E(p) B(p) C(s) M(s) A(p)|CF|12.5
S2C|G(p) F(p) E(p) B(p) G(s) M(s) A(p)|CF|17.1
SW1|K(p) C(p) D(p) C(s) K(s)|Start Area|9.3
SW1A|K(p) B(s) J(p) D(p) K(s)|Start Area|11.7
SW1B|J(p) F(p) D(p)|C|10.8
SW1C|J(p) F(p) Lge Sov(p) J(p) Lge Sov(p)|C|18.1
SW2|K(p) C(p) D(p) K(s) M(s) A(p)|CF|10.2
SW2A|K(p) C(p) D(p) K(s) B(p) M(s) A(p)|CF|11.3
SW2B|J(p) Lge Sov(p) J(s) M(s) A(p)|CF|13.8
SW2C|J(p) F(p) Lge Sov(p) J(p) C(p) J(s) M(s) A(p)|CF|18.2
W1|K(p) C(p) E(p) K(p)|Start Area|10.0
W1A|K(p) C(p) Lge Sov(p) B(s) D(s) K(p)|Start Area|13.0
W1B|J(p) G(p) F(p)|J|10.5
W1C|J(p) G(p) F(p) J(p) F(p)|J|18.0
W1D|J(p) Cork Buoy(p)|J|23.0
W1E|J(p) Black Tom(s) F(p)|J|18.1
W2|K(p) E(p) K(s) M(s) A(p)|CF|10.5
W2A|K(p) E(p) K(s) B(p) M(s) A(p)|CF|12.0
W2B|J(s) E(p) C(s) B(s) D(p) M(s) A(p)|CF|15.5
W2C|J(p) F(p) J(s) E(p) K(s) M(s) A(p)|CF|19.2
NW1|M(p) F(p)|Start Area|8.2
NW1A|M(p) F(s) C(p) F(p)|Start Area|12.8
NW1B|K(p) J(p) F(p)|K|10.8
NW1C|K(p) J(p) F(p) K(p) F(p)|K|17.8
NW2|B(s) E(s) M(s) A(p)|CF|8.9
NW2A|B(p) C(p) F(p) M(s) A(p)|CF|11.5
NW2B|K(p) J(p) F(p) K(s) C(p) M(s) A(p)|CF|15.6
NW2C|K(p) J(p) F(p) K(p) F(p) M(s) A(p)|CF|20.3
`
  .trim()
  .split('\n')
  .map((line) => {
    const [id, seq, finish, length] = line.split('|') as [string, string, string, string];
    const sequence = seq.split(/(?<=\))\s+/).map((tok) => {
      const m = /^(.+)\((p|s)\)$/.exec(tok)!;
      return { mark: m[1]!, side: m[2] === 'p' ? 'port' : 'starboard' };
    });
    return { id, sequence, finish, length: Number(length) };
  });

const WINDS: Record<string, number> = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };

describe('the Sovereign’s Cup 2025 marks file', () => {
  it('holds the table’s eleven lettered marks and Black Tom, then the three the manifest adds', () => {
    expect(marks.marks.map((m) => m.id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'M', 'Black Tom', 'Lge Sov', 'Cork Buoy', 'CF']);
    for (const m of marks.marks) expect(m.position, m.id).toBeDefined();
  });

  it('places M where amendment 1 puts it, not on K’s latitude as the instructions print it', () => {
    const byId = new Map(marks.marks.map((m) => [m.id, m]));
    expect(byId.get('M')!.position).toEqual({ lat: 51.668333, lng: -8.520833 });
    expect(byId.get('K')!.position).toEqual({ lat: 51.658, lng: -8.526333 });
  });

  it('describes the marks as the table’s colour line does', () => {
    const byId = new Map(marks.marks.map((m) => [m.id, m]));
    expect(byId.get('A')).toMatchObject({ color: 'green' });
    expect(byId.get('B')).toMatchObject({ name: 'Bulman', shape: 'south cardinal buoy' });
    expect(byId.get('C')).toMatchObject({ shape: 'conical', color: 'yellow' });
    expect(byId.get('Black Tom')).toMatchObject({ shape: 'lateral buoy', color: 'green', position: { lat: 51.607017, lng: -8.632467 } });
    expect(byId.get('Lge Sov')).toMatchObject({ name: 'Great Sovereign', shape: 'island' });
    expect(byId.get('CF')).toMatchObject({ name: 'Charles Fort' });
  });
});

describe('the RTC/Coastal courses', () => {
  it('are the 68 courses of the eight tables, in the tables’ order', () => {
    expect(rtc.marks).toBe('marks.json');
    expect(rtc.courses.map((c) => c.id)).toEqual(PRINTED.map((p) => p.id));
  });

  it('every course begins at FB 2’s committee-vessel line', () => {
    expect(rtc.startLine).toMatchObject({ id: 'SL', name: 'Start line', source: "Sovereign's Cup 2025 sailing instructions FB 2.1 and 2.2" });
    expect(rtc.startLine!.position).toBeUndefined();
    expect(rtc.startLine!.placement).toMatch(/^The starting line will be between a Red & White Pole on the Committee Vessel/);
    expect(rtc.startLine!.placement).toMatch(/advised over Ch72 at 10\.00 hrs/);
    for (const course of rtc.courses) expect(course.marks[0]!.mark, course.id).toBe('SL');
  });

  it('every course is as printed: the marks and their sides, then where it finishes', () => {
    const known = new Set(marks.marks.map((m) => m.id));
    for (const p of PRINTED) {
      const seq = printed(rtc, p.id);
      const finish = seq[seq.length - 1]!;
      expect(seq.slice(0, -1), p.id).toEqual(p.sequence);
      expect(finish.side, `${p.id} finish`).toBeUndefined();
      expect(finish.mark, `${p.id} finish`).toBe(p.finish === 'Start Area' ? 'SL' : p.finish);
      for (const cm of p.sequence) expect(known.has(cm.mark), `${p.id}: mark ${cm.mark}`).toBe(true);
    }
  });

  it('carries each table’s wind and each course’s printed length', () => {
    for (const p of PRINTED) {
      const course = rtc.courses.find((c) => c.id === p.id)!;
      expect(course.windDirectionDeg, p.id).toBe(WINDS[/^[A-Z]+/.exec(p.id)![0]]);
      expect(course.distanceNm, p.id).toBe(p.length);
    }
  });

  it('computes legs for a course once the start area is given, and places every mark but the line', () => {
    const legs = courseLegs(rtc, marks, 'N2', { marks: { SL: { lat: 51.63, lng: -8.49 } } });
    expect(legs).toHaveLength(8);
    expect(legs.map((l) => l.to.mark)).toEqual(['B', 'J', 'K', 'C', 'B', 'M', 'A', 'CF']);
    expect(() => courseLegs(rtc, marks, 'N1', {})).toThrow(/no position for mark "SL"/);
  });

  it('carries FB 3, FB 4, FB 6, FC 3 and FC 6 as notes', () => {
    expect(rtc.notes?.map((n) => n.title)).toEqual(['FB 3 COURSES', 'FB 4 MARKS', 'FB 6 FINISHING LINE', 'FC 3 COURSES', 'FC 6 FINISHING LINE']);
    expect(rtc.notes![1]!.text).toMatch(/^The Kinsale Yacht Club permanently laid racing marks \(yellow conical with a dayglo flag\)/);
  });
});

describe('the Jeanot Petch courses', () => {
  it('are ALPHA to DELTA as the supplementary instructions list them', () => {
    expect(jp.courses.map((c) => c.id)).toEqual(['A', 'B', 'C', 'D']);
    const seq = (id: string) => printed(jp, id).map((m) => `${m.mark}${m.side ? `(${m.side[0]})` : ''}`).join(' ');
    expect(seq('A')).toBe('Cork Buoy(p) E(s) Lge Sov(p) Black Tom(s) B(p) K(s) M(s) A(p) CF');
    expect(seq('B')).toBe('E(p) C(p) G(s) Black Tom(s) C(p) J(s) K(s) M(s) A(p) CF');
    expect(seq('C')).toBe('E(s) H(p) F(s) Black Tom(s) Lge Sov(p) J(s) B(p) K(s) M(s) A(p) CF');
    expect(seq('D')).toBe('B(p) J(p) C(s) Black Tom(s) D(p) B(s) K(s) M(s) A(p) CF');
    for (const course of jp.courses) expect(course.marks[0]!.mark).toBe('SL');
  });

  it('starts at FB 2.1’s line, with the start areas and midway points in the notes', () => {
    expect(jp.startLine!.placement).toMatch(/^The starting line will be between a Red & White Pole/);
    expect(jp.startLine!.placement).not.toMatch(/advised over/);
    expect(jp.notes![1]!.text.split('\n')).toEqual([
      'Course ALPHA (A): start area at mark C; midway point Mark E (bearing 090 degrees).',
      'Course BRAVO (B): start area at mark C; midway point Black Tom (bearing 090 degrees).',
      'Course CHARLIE (C): start area at mark J; midway point Black Tom (bearing 090 degrees).',
      'Course DELTA (D): start area at mark J; midway point Black Tom (bearing 090 degrees).',
    ]);
  });
});
