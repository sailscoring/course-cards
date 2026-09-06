import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FormatError, parseCourseCardFile, parseMarksFile } from '../src/index';
import { printed } from './printed';

function load(rel: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, '..', 'data', 'hyc', 'al-2025', rel), 'utf-8'));
}

const marks = parseMarksFile(load('marks.json'));
const cards = {
  offshore: parseCourseCardFile(load('offshore.json')),
  inshore: parseCourseCardFile(load('inshore.json')),
};

describe('the HYC Autumn League 2025 marks file', () => {
  it('lists the technical sheet: 21 fixed marks and two laid per race', () => {
    const fixed = marks.marks.filter((m) => m.position);
    const laid = marks.marks.filter((m) => !m.position);
    expect(fixed).toHaveLength(21);
    expect(laid.map((m) => m.id)).toEqual(['F', 'Z']);
    for (const m of laid) expect(m.placement).toBeTruthy();
    expect(marks.marks.find((m) => m.id === 'Z')).toMatchObject({
      name: 'Zephyr',
      shape: 'inflatable',
      color: 'black',
      placement: 'Upwind of Start Line',
    });
  });

  it('carries no notes — those are the cards’', () => {
    expect((marks as { notes?: unknown }).notes).toBeUndefined();
  });

  it('positions are in Howth Sound, to the sheet’s hundredth of a minute', () => {
    for (const m of marks.marks) {
      if (!m.position) continue;
      expect(m.position.lat, m.id).toBeGreaterThan(53.38);
      expect(m.position.lat, m.id).toBeLessThan(53.46);
      expect(m.position.lng, m.id).toBeGreaterThan(-6.11);
      expect(m.position.lng, m.id).toBeLessThan(-6.02);
    }
    // A 53 26.76 N, 06 03.26 W
    expect(marks.marks.find((m) => m.id === 'A')!.position).toEqual({ lat: 53.446, lng: -6.054333 });
  });
});

describe.each(Object.entries(cards))('the HYC Autumn League 2025 %s card', (name, card) => {
  it('has the 36 × 5 courses of the card, numbered as the committee boat shows them', () => {
    expect(card.marks).toBe('marks.json');
    const ids = card.courses.map((c) => c.id);
    const expected: string[] = [];
    for (let row = 0; row < 36; row++) {
      for (let col = 1; col <= 5; col++) expected.push(`${String(row).padStart(2, '0')}${col}`);
    }
    expect(ids).toEqual(expected);
  });

  it('carries the technical sheet’s notes', () => {
    expect(card.notes?.map((n) => n.title)).toEqual(['Navigation Marks and Obstructions', 'Course Selection']);
    expect(card.notes![1]!.text).toContain('Course 073 is the third course in from the left on line 07');
  });

  it('starts at the line the sailing instructions define, quoted', () => {
    expect(card.startLine).toMatchObject({ id: 'SL', name: 'Start line' });
    expect(card.startLine!.position).toBeUndefined();
    expect(card.startLine!.placement).toContain('of Ireland’s Eye');
    expect(card.startLine!.source).toMatch(/^HYC Autumn League 2025 sailing instructions 6\.[12] A and B$/);
    // The start line is the card's, not the club's: it differs between the
    // two cards over one marks file, and is not a mark on the sheet.
    expect(marks.marks.some((m) => m.id === 'SL')).toBe(false);
  });

  it('every course runs from the start line over the laid windward mark to the finish', () => {
    const known = new Set([...marks.marks.map((m) => m.id), card.startLine!.id]);
    for (const course of card.courses) {
      expect(course.marks[0]!.mark, course.id).toBe('SL');
      expect(course.marks[1]!.mark, course.id).toBe('Z');
      expect(course.marks[course.marks.length - 1]!.mark, course.id).toBe('F');
      for (const cm of course.marks) {
        expect(known.has(cm.mark), `${course.id}: mark ${cm.mark}`).toBe(true);
        if (cm.mark !== 'SL') expect(cm.side, `${course.id}: mark ${cm.mark}`).toBeDefined();
      }
    }
  });

  it('spot checks against the printed card', () => {
    const text = (id: string) =>
      printed(card, id)
        .map((m) => {
          const letter = m.side === 'starboard' ? m.mark.toLowerCase() : m.mark;
          return m.passing ? `[${letter}]` : letter;
        })
        .join(' ');
    // lowercase: starboard; [boxed]: passing mark
    const expected: Record<string, Record<string, string>> = {
      offshore: {
        '001': 'Z H I H [K] F',
        '051': '[Z] T g F',
        '062': 'Z p a e F',
        '124': 'Z O m e U g F',
        '233': 'Z e K e F',
        '323': '[Z] M K U F',
        '355': 'Z V I G A G A [k] F',
      },
      inshore: {
        '001': 'Z P W s F',
        '041': 'Z W C H [s] F',
        '084': 'Z V C K V W O C i [s] F',
        '134': 'Z v D P D V W s F',
        '182': 'Z V P W h [s] F',
        '245': 'Z V H W o C o [s] F',
        '355': 'Z W C P C P C P C W s F',
      },
    };
    for (const [id, want] of Object.entries(expected[name]!)) {
      expect(text(id), id).toBe(want);
    }
  });
});

describe('the parsers', () => {
  it('refuse a newer format version', () => {
    expect(() => parseMarksFile({ formatVersion: 3, marks: [] })).toThrow(FormatError);
    expect(() => parseCourseCardFile({ formatVersion: 3, courses: [] })).toThrow(/newer/);
  });

  it('read a card’s start line as the mark it is', () => {
    const card = parseCourseCardFile({
      formatVersion: 2,
      startLine: { id: 'SL', name: 'Start line', placement: 'Off the pier', source: 'SI 4.2', extra: 1 },
      courses: [{ id: '1', marks: [{ mark: 'SL' }, { mark: 'A', side: 'port' }] }],
    });
    expect(card.startLine).toEqual({ id: 'SL', name: 'Start line', placement: 'Off the pier', source: 'SI 4.2' });
    expect(() => parseCourseCardFile({ formatVersion: 2, startLine: { name: 'no id' }, courses: [] })).toThrow(FormatError);
  });

  it('carry the length a club prints for a course, and refuse a bad one', () => {
    const card = parseCourseCardFile({
      formatVersion: 2,
      courses: [{ id: 'A1', distanceNm: 7.4, marks: [{ mark: 'Z', side: 'port' }] }],
    });
    expect(card.courses[0]).toEqual({ id: 'A1', distanceNm: 7.4, marks: [{ mark: 'Z', side: 'port' }] });
    expect(() =>
      parseCourseCardFile({ formatVersion: 2, courses: [{ id: 'A1', distanceNm: 0, marks: [{ mark: 'Z' }] }] }),
    ).toThrow(/distanceNm/);
  });

  it('reject duplicate ids and bad sides', () => {
    const mark = { id: 'A', position: { lat: 53.4, lng: -6.1 } };
    expect(() => parseMarksFile({ formatVersion: 1, marks: [mark, mark] })).toThrow(/duplicate mark id/);
    expect(() =>
      parseCourseCardFile({ formatVersion: 1, courses: [{ id: '1', marks: [{ mark: 'A', side: 'left' }] }] }),
    ).toThrow(/side/);
  });

  it('keep only what the format defines', () => {
    const parsed = parseMarksFile({
      formatVersion: 1,
      marks: [{ id: 'Z', placement: 'Upwind of Start Line', shape: 'inflatable', extra: 1 }],
    });
    expect(parsed.marks[0]).toEqual({ id: 'Z', shape: 'inflatable', placement: 'Upwind of Start Line' });
  });
});
