import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CourseError,
  courseLegs,
  destination,
  parseCourseCardFile,
  parseMarksFile,
  totalDistanceNm,
} from '../src/index';

function load(rel: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, '..', 'data', 'hyc', 'al-2025', rel), 'utf-8'));
}

const marks = parseMarksFile(load('marks.json'));
const inshore = parseCourseCardFile(load('inshore.json'));
const offshore = parseCourseCardFile(load('offshore.json'));

// A plausible race day: committee boat off the harbour, Zephyr laid 0.6 NM
// upwind on 190°, finish between Island and the Sound as the sheet says.
const start = { lat: 53.4055, lng: -6.0675 };
const race = {
  start,
  marks: {
    Z: destination(start, 190, 0.6 * 1852),
    F: { lat: 53.4085, lng: -6.0705 },
  },
};

describe('courseLegs', () => {
  it('walks inshore course 001: start → Z → P → W → S → F', () => {
    const legs = courseLegs(inshore, marks, '001', race);
    expect(legs.map((l) => l.to.mark)).toEqual(['Z', 'P', 'W', 'S', 'F']);
    expect(legs[0]!.from).toEqual({ label: 'Start', position: start });
    expect(legs[1]!.from.label).toBe('Zephyr (Z)');
    expect(legs[0]!.distanceNm).toBeCloseTo(0.6, 3);
    expect(legs[0]!.bearingDeg).toBeCloseTo(190, 1);
    for (const leg of legs) {
      expect(leg.distanceNm).toBeGreaterThan(0);
      expect(leg.bearingDeg).toBeGreaterThanOrEqual(0);
      expect(leg.bearingDeg).toBeLessThan(360);
    }
    expect(totalDistanceNm(legs)).toBeCloseTo(legs.reduce((s, l) => s + l.distanceNm, 0), 12);
  });

  it('Portmarnock to West is the short leg south-south-west it is on the chart', () => {
    // P 53°25.63' N 6°05.80' W → W 53°24.96' N 6°06.07' W: 0.67' south and
    // 0.27' × cos(53.4°) ≈ 0.16' west, so about 0.69 NM on 193.5°.
    const legs = courseLegs(inshore, marks, '001', race);
    const pw = legs.find((l) => l.from.mark === 'P' && l.to.mark === 'W')!;
    expect(pw.distanceNm).toBeCloseTo(0.69, 2);
    expect(pw.bearingDeg).toBeCloseTo(193.5, 0);
  });

  it('resolves every course on both cards once Z and F are placed', () => {
    for (const card of [inshore, offshore]) {
      for (const course of card.courses) {
        const legs = courseLegs(card, marks, course.id, race);
        expect(legs).toHaveLength(course.marks.length);
        expect(legs[legs.length - 1]!.to.mark).toBe('F');
      }
    }
  });

  it('a race-day position overrides a fixed mark', () => {
    const moved = { lat: 53.41, lng: -6.09 };
    const legs = courseLegs(inshore, marks, '001', { ...race, marks: { ...race.marks, P: moved } });
    expect(legs[1]!.to.position).toEqual(moved);
  });

  it('names the mark it cannot place', () => {
    expect(() => courseLegs(inshore, marks, '001', { start })).toThrow(CourseError);
    expect(() => courseLegs(inshore, marks, '001', { start })).toThrow(
      'course 001: no position for mark "Z" (Upwind of Start Line)',
    );
    expect(() => courseLegs(inshore, marks, '999', race)).toThrow('no course "999"');
    const card = { formatVersion: 1, courses: [{ id: 'x', marks: [{ mark: 'Y' }] }] };
    expect(() => courseLegs(card, marks, 'x', race)).toThrow('unknown mark "Y"');
  });
});
