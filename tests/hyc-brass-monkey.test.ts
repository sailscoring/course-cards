import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseCourseCardFile, parseMarksFile } from '../src/index';

function load(rel: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, '..', 'data', 'hyc', 'brass-monkey-2025', rel), 'utf-8'));
}

const marks = parseMarksFile(load('marks.json'));
const card = parseCourseCardFile(load('course-card.json'));

describe('the HYC Brass Monkey 2025 marks file', () => {
  it('lists the SI’s location table — eight fixed marks — and the finish, laid per race', () => {
    expect(marks.marks.map((m) => m.id).join('')).toBe('CDHIPSVWF');
    for (const m of marks.marks.slice(0, 8)) {
      expect(m.position, m.id).toBeDefined();
      expect(m.name, m.id).toBeTruthy();
      expect(m.shape, m.id).toBeUndefined(); // the SI does not say which is orange spherical and which black conical
    }
    expect(marks.marks[8]).toEqual({
      id: 'F',
      name: 'Finish',
      shape: 'spherical',
      color: 'orange',
      placement: 'South of the Island mark in the vicinity of the Sound',
    });
  });

  it('positions are the table’s degrees and decimal minutes, in Howth Sound', () => {
    for (const m of marks.marks) {
      if (!m.position) continue;
      expect(m.position.lat, m.id).toBeGreaterThan(53.4);
      expect(m.position.lat, m.id).toBeLessThan(53.44);
      expect(m.position.lng, m.id).toBeGreaterThan(-6.11);
      expect(m.position.lng, m.id).toBeLessThan(-6.06);
    }
    // Hub 53 25.71 N, 06 04.43 W; Cush 53 24.5 N, 06 05.44 W
    expect(marks.marks.find((m) => m.id === 'H')!.position).toEqual({ lat: 53.4285, lng: -6.073833 });
    expect(marks.marks.find((m) => m.id === 'C')!.position).toEqual({ lat: 53.408333, lng: -6.090667 });
    // Portmarnock as the table prints it — see the README: the SI's own picture puts it elsewhere
    expect(marks.marks.find((m) => m.id === 'P')!.position).toEqual({ lat: 53.42, lng: -6.066667 });
  });
});

describe('the HYC Brass Monkey 2025 course card', () => {
  it('has the 16 numbered courses in the card’s order', () => {
    expect(card.marks).toBe('marks.json');
    expect(card.courses.map((c) => c.id)).toEqual(Array.from({ length: 16 }, (_, i) => String(i + 1)));
  });

  it('every course rounds its marks to port, leaves Island to starboard last and ends at the finish, unsided', () => {
    const known = new Set(marks.marks.map((m) => m.id));
    for (const c of card.courses) {
      const finish = c.marks[c.marks.length - 1]!;
      expect(finish).toEqual({ mark: 'F' });
      const island = c.marks[c.marks.length - 2]!;
      expect(island, c.id).toEqual({ mark: 'I', side: 'starboard' });
      for (const cm of c.marks) {
        expect(known.has(cm.mark), `${c.id}: mark ${cm.mark}`).toBe(true);
        expect(cm.passing, `${c.id}: mark ${cm.mark}`).toBeUndefined();
        if (cm !== finish && !(cm.mark === 'I' && cm.side === 'starboard')) expect(cm.side, `${c.id}: mark ${cm.mark}`).toBe('port');
      }
    }
    // Spit is listed but on no course
    expect(card.courses.some((c) => c.marks.some((m) => m.mark === 'S'))).toBe(false);
  });

  it('spot checks against the printed card', () => {
    const text = (id: string) =>
      card.courses
        .find((c) => c.id === id)!
        .marks.map((m) => `${m.mark}${m.side === 'port' ? 'p' : m.side === 'starboard' ? 's' : ''}`)
        .join(' ');
    expect(text('1')).toBe('Hp Wp Ip Hp Wp Is F');
    expect(text('4')).toBe('Hp Wp Cp Vp Cp Hp Vp Is F');
    expect(text('10')).toBe('Ip Dp Hp Ip Dp Hp Ip Hp Is F');
    expect(text('13')).toBe('Wp Cp Ip Wp Is Wp Is F');
    expect(text('16')).toBe('Pp Wp Ip Pp Wp Cp Wp Is F');
  });

  it('carries the WIND column as a note, then the SI sections the manifest names', () => {
    expect(card.notes?.map((n) => n.title)).toEqual(['Wind', '8. Race Area', '9. Courses', '10. Marks', '14. The Finish']);
    expect(card.notes![0]!.text).toBe(
      '1 N, 2 N, 3 N/E, 4 N/E, 5 E, 6 E, 7 S/E, 8 S/E, 9 S, 10 S, 11 S/W, 12 S/W, 13 W, 14 W, 15 N/W, 16 N/W',
    );
    expect(card.notes![1]!.text).toBe('8.1 The Race Area will be Northwest of Ireland’s Eye.');
    const finish = card.notes![4]!.text.split('\n');
    expect(finish).toHaveLength(5);
    expect(finish[1]).toBe('14.2 Unless a race is shortened, all finishes will be south of the Island mark in the vicinity of the Sound.');
    // 10.2's mark table and its note are paragraphs of their own
    expect(card.notes![3]!.text.split('\n')).toContain('Note: The Spit mark is to be passed to the north and east.');
  });
});
