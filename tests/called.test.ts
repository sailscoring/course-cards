import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CourseError,
  calledCourse,
  calledCourseLegs,
  calledCourseMarks,
  courseLegs,
  courseMarks,
  parseCourseCardFile,
  parseMarksFile,
  renderCourseSvg,
  type CourseMark,
} from '../src/index';

function load(...rel: string[]): unknown {
  return JSON.parse(readFileSync(join(__dirname, '..', 'data', ...rel), 'utf-8'));
}

// DBSC's marks file is a large mark database whose cards do not enumerate
// every sequence a race officer might call; Kinsale's is a club whose own
// season racing is nothing but called courses.
const dbscMarks = parseMarksFile(load('dbsc', 'summer-2026', 'marks.json'));
const dbscCard = parseCourseCardFile(load('dbsc', 'summer-2026', 'cc1-saturday-cv.json'));
const kycMarks = parseMarksFile(load('kyc', 'sovereigns-2025', 'marks.json'));
const kycCard = parseCourseCardFile(load('kyc', 'sovereigns-2025', 'rtc-coastal.json'));

const start = { lat: 53.29, lng: -6.11 };

describe('calledCourseMarks', () => {
  it('resolves a sequence the race officer called, from the card’s start line', () => {
    const called: CourseMark[] = [
      { mark: 'E', side: 'port' },
      { mark: 'W', side: 'starboard' },
      { mark: 'M', side: 'port' },
    ];
    const resolved = calledCourseMarks(dbscCard, dbscMarks, called);
    expect(resolved.map((r) => r.mark.id)).toEqual(['SL', 'E', 'W', 'M']);
    expect(resolved[0]!.mark).toBe(dbscCard.startLine);
    expect(resolved[0]!.placed).toBe(false);
    expect(resolved.slice(1).every((r) => r.placed)).toBe(true);
    expect(resolved[1]!.entry).toEqual({ mark: 'E', side: 'port' });
  });

  it('does not add the start line twice when the caller gave it', () => {
    const called: CourseMark[] = [{ mark: 'SL' }, { mark: 'E', side: 'port' }];
    expect(calledCourseMarks(dbscCard, dbscMarks, called).map((r) => r.mark.id)).toEqual(['SL', 'E']);
    expect(calledCourse(dbscCard, called).marks).toEqual(called);
  });

  it('is what courseMarks gives for a course the card does number', () => {
    const a1 = dbscCard.courses.find((c) => c.id === 'A1')!;
    expect(calledCourseMarks(dbscCard, dbscMarks, a1.marks.slice(1))).toEqual(courseMarks(dbscCard, dbscMarks, 'A1'));
  });

  it('names a mark the club does not list', () => {
    expect(() => calledCourseMarks(dbscCard, dbscMarks, [{ mark: 'Dosco', side: 'starboard' }])).toThrow(
      new CourseError('called course: unknown mark "Dosco"'),
    );
  });

  it('works for a card with no start line, from the first mark called', () => {
    const bare = { ...dbscCard, startLine: undefined };
    const called: CourseMark[] = [{ mark: 'E', side: 'port' }, { mark: 'W', side: 'port' }];
    expect(calledCourseMarks(bare, dbscMarks, called).map((r) => r.mark.id)).toEqual(['E', 'W']);
    expect(calledCourse(bare, called)).toEqual({ id: '', marks: called });
  });
});

describe('calledCourseLegs', () => {
  it('walks the called course once the start line is placed', () => {
    const legs = calledCourseLegs(dbscCard, dbscMarks, [{ mark: 'E', side: 'port' }, { mark: 'W', side: 'starboard' }], { marks: { SL: start } });
    expect(legs.map((l) => `${l.from.mark}→${l.to.mark}`)).toEqual(['SL→E', 'E→W']);
    expect(legs[0]!.from.position).toEqual(start);
    for (const leg of legs) expect(leg.distanceNm).toBeGreaterThan(0);
  });

  it('agrees with courseLegs for a numbered course’s own sequence', () => {
    const a1 = dbscCard.courses.find((c) => c.id === 'A1')!;
    const race = { marks: { SL: start } };
    expect(calledCourseLegs(dbscCard, dbscMarks, a1.marks.slice(1), race)).toEqual(courseLegs(dbscCard, dbscMarks, 'A1', race));
  });

  it('asks for the start line the way a numbered course does', () => {
    expect(() => calledCourseLegs(dbscCard, dbscMarks, [{ mark: 'E', side: 'port' }], {})).toThrow(/called course: no position for mark "SL" \(/);
  });

  it('gives a Kinsale race officer’s round-the-cans call its legs', () => {
    // Called on the day rather than picked off the card: B to port, K to
    // starboard, Black Tom to starboard, home to Charles Fort.
    const called: CourseMark[] = [
      { mark: 'B', side: 'port' },
      { mark: 'K', side: 'starboard' },
      { mark: 'Black Tom', side: 'starboard' },
      { mark: 'CF' },
    ];
    const legs = calledCourseLegs(kycCard, kycMarks, called, { marks: { SL: { lat: 51.66, lng: -8.49 } } });
    expect(legs.map((l) => l.to.mark)).toEqual(['B', 'K', 'Black Tom', 'CF']);
    expect(legs[2]!.to.label).toBe('Black Tom (Black Tom)');
    expect(legs[2]!.distanceNm).toBeCloseTo(5.0, 0);
  });
});

describe('a called course draws like any other', () => {
  it('renderCourseSvg takes calledCourse’s sequence with the card’s marks', () => {
    const called: CourseMark[] = [{ mark: 'E', side: 'port' }, { mark: 'W', side: 'starboard' }, { mark: 'M', side: 'port' }];
    const course = calledCourse(dbscCard, called);
    const drawn = calledCourseMarks(dbscCard, dbscMarks, called).map(({ mark }) => ({
      id: mark.id,
      label: mark.name ?? mark.id,
      position: mark.position ?? start,
      fixed: mark.position != null,
    }));
    const svg = renderCourseSvg(drawn, course.marks);
    expect(svg.startsWith('<svg')).toBe(true);
    for (const label of ['Start line', 'South Bar', 'Bay', 'Middle']) expect(svg).toContain(`<title>${label}</title>`);
    expect(svg.match(/<tspan font-weight="700">\d<\/tspan>/g)).toHaveLength(3); // three legs, numbered
  });
});
