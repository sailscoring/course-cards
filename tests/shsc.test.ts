import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { calledCourseLegs, calledCourseMarks, parseCourseCardFile, parseMarksFile } from '../src/index';

function load(rel: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, '..', 'data', 'shsc', 'calves-week-2026', rel), 'utf-8'));
}

const marks = parseMarksFile(load('marks.json'));
const card = parseCourseCardFile(load('course-card.json'));
const byId = new Map(marks.marks.map((m) => [m.id, m]));

describe('the Calves Week 2026 marks file', () => {
  it('letters the six fixed marks as the chartlet does, numbers the eight laid ones, and adds the weather mark and the Fastnet Rock', () => {
    expect(marks.marks.map((m) => m.id)).toEqual(['W', 'A', 'C', 'EC', 'G', 'P', 'WC', '1', '2', '3', '4', '5', '6', '7', '8', 'Fastnet']);
    expect(marks.marks.filter((m) => m.position)).toHaveLength(15);
  });

  it('reads the sheet: name and two lines of description, minutes on 51° N and 9° W', () => {
    // Amelia: 51° 30.00′ N, 9° 31.43′ W; Cush: 51° 30.31′ N, 9° 32.79′ W
    expect(byId.get('A')).toEqual({ id: 'A', name: 'Amelia', shape: 'nav bouy', color: 'conical green', position: { lat: 51.5, lng: -9.523833 } });
    expect(byId.get('C')).toEqual({ id: 'C', name: 'Cush', shape: 'north cardinal', color: 'yellow nav', position: { lat: 51.505167, lng: -9.5465 } });
    expect(byId.get('P')).toMatchObject({ name: 'Perch/Bull Rock', shape: 'iron beacon' });
    for (const id of ['EC', 'G', 'WC']) expect(byId.get(id)).toMatchObject({ shape: 'island' });
    expect(byId.get('WC')!.color).toBeUndefined();
    // A laid mark is named for where the club lays it: "1" over "(Castle Grounds)" / "Red Conical".
    expect(byId.get('1')).toEqual({ id: '1', name: 'Castle Grounds', color: 'red conical', position: { lat: 51.507167, lng: -9.528833 } });
    expect(byId.get('6')).toMatchObject({ name: 'Middle - Harbour', color: 'conical with uk sails wrap' });
    expect(byId.get('8')).toMatchObject({ name: 'Crookhaven', position: { lat: 51.479, lng: -9.691167 } });
  });

  it('positions are in Long Island Bay, and the Fastnet Rock south-west of it', () => {
    for (const m of marks.marks) {
      if (!m.position || m.id === 'Fastnet') continue;
      expect(m.position.lat, m.id).toBeGreaterThan(51.46);
      expect(m.position.lat, m.id).toBeLessThan(51.53);
      expect(m.position.lng, m.id).toBeGreaterThan(-9.7);
      expect(m.position.lng, m.id).toBeLessThan(-9.47);
    }
    expect(byId.get('Fastnet')).toEqual({ id: 'Fastnet', name: 'Fastnet Rock', shape: 'rock', position: { lat: 51.389282, lng: -9.602686 } });
  });

  it('carries the weather mark as laid on the day, with no position', () => {
    expect(byId.get('W')).toMatchObject({ name: 'Weather Mark', color: 'red conical' });
    expect(byId.get('W')!.position).toBeUndefined();
    expect(byId.get('W')!.placement).toMatch(/laid on the day/i);
  });
});

describe('the Calves Week 2026 card', () => {
  it('lists no courses: the race committee sets them on the day', () => {
    expect(card.marks).toBe('marks.json');
    expect(card.courses).toEqual([]);
  });

  it('starts on SI 12.1’s line and finishes on 13.1’s, both laid on the day', () => {
    expect(card.startLine).toEqual({
      id: 'SL',
      name: 'Start line',
      placement:
        'The starting line is between a red and white pole on the committee boat at the one end and the course side of the starting mark at the other. An inner-distance mark may be laid. Boats shall not sail between this mark and the committee boat at any time.',
      source: 'Calves Week 2026 sailing instructions 12.1',
    });
    expect(card.finish).toEqual({
      id: 'FL',
      name: 'Finish line',
      placement:
        'The finishing line is between the red and white pole on the finishing vessel displaying a blue flag and the course side of a laid mark, or Mark No. 6 as indicated.',
      source: 'Calves Week 2026 sailing instructions 13.1',
    });
    for (const id of ['SL', 'FL']) expect(byId.has(id), id).toBe(false);
  });

  it('carries the instructions on the racing area, courses and marks, then the sheet’s caveats', () => {
    expect(card.notes?.map((n) => n.title)).toEqual(['Racing area', 'Courses', 'Marks', 'Marks, distances and bearings']);
    expect(card.notes![0]!.text).toBe(
      '9.1 The racing area is Long Island Bay and the Fastnet Rock. All races will Start near Copper Point or Inside Harbour, and finish inside Schull Harbour.',
    );
    expect(card.notes![1]!.text).toContain('10.1 Courses will be determined by the Race Committee using fixed marks');
    expect(card.notes![1]!.text).toContain('\n10.2 Course details may be announced on VHF channel 69');
    expect(card.notes![3]!.text).toBe(
      'Bearings in Black, relative to True North. Distances in Red, in NM. Mark Positions may vary slightly. All figures are approximate. WARNING: Some direct paths are obstructed.',
    );
  });

  it('resolves a course called on the day over its marks, the line and the finish supplied per race', () => {
    const called = [
      { mark: 'A', side: 'port' as const },
      { mark: '3', side: 'starboard' as const },
      { mark: 'W', side: 'port' as const },
      { mark: 'FL' },
    ];
    const resolved = calledCourseMarks(card, marks, called);
    expect(resolved.map((m) => m.mark.id)).toEqual(['SL', 'A', '3', 'W', 'FL']);
    expect(resolved.filter((m) => !m.mark.position).map((m) => m.mark.id)).toEqual(['SL', 'W', 'FL']);
    const start = { lat: 51.5075, lng: -9.5335 };
    const legs = calledCourseLegs(card, marks, called, {
      marks: { SL: start, W: { lat: 51.5, lng: -9.51 }, FL: { lat: 51.5215, lng: -9.5355 } },
    });
    expect(legs.map((l) => `${l.from.mark}→${l.to.mark}`)).toEqual(['SL→A', 'A→3', '3→W', 'W→FL']);
    // Amelia to 3: the sheet prints 081° 0.98 NM, its positions give 043° 1.22 NM.
    expect(Math.round(legs[1]!.bearingDeg)).toBe(43);
    expect(legs[1]!.distanceNm).toBeCloseTo(1.22, 2);
    expect(() => calledCourseLegs(card, marks, called, { marks: { SL: start, FL: start } })).toThrow(/W/);
  });
});
