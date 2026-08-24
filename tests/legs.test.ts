import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  parseCourseCardFile,
  parseMarksFile,
  resolveRaceLegs,
  toOrcLegs,
  totalDistanceNm,
  type CourseCardFile,
} from '../src/index';

function load(rel: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, '..', rel), 'utf-8'));
}

const bmMarks = parseMarksFile(load('data/hyc-bm/marks.json'));
const alMarks = parseMarksFile(load('data/hyc-al/marks.json'));
const alCard = parseCourseCardFile(load('data/hyc-al/card.json'));

describe('the Brass Monkeys reference record (13 Dec 2025, course 10)', () => {
  // The hand-computed leg record from HYC's winter series — the course as
  // actually sailed, start and finish from the committee boat's positions.
  // The expected distances and bearings are that record's, verbatim.
  const card: CourseCardFile = {
    formatVersion: 1,
    courses: [{ id: '10', marks: ['I', 'D', 'H', 'I', 'D', 'H', 'I', 'H', 'I'].map((mark) => ({ mark })) }],
  };
  const raceDay = {
    start: { lat: 53 + 24.302 / 60, lng: -(6 + 4.15 / 60) },
    finish: { lat: 53 + 24.203 / 60, lng: -(6 + 4.247 / 60) },
  };

  it('reproduces every leg distance and bearing', () => {
    const legs = resolveRaceLegs(card, bmMarks, '10', raceDay);
    const expected: Array<[number, number]> = [
      [0.423, 340.2],
      [0.323, 84.7],
      [1.040, 340.6],
      [1.011, 178.6],
      [0.323, 84.7],
      [1.040, 340.6],
      [1.011, 178.6],
      [1.011, 358.6],
      [1.011, 178.6],
      [0.505, 170.3],
    ];
    expect(legs).toHaveLength(expected.length);
    legs.forEach((leg, i) => {
      const [dist, brg] = expected[i]!;
      expect(leg.distanceNm, `leg ${i + 1} distance`).toBeCloseTo(dist, 3);
      expect(leg.bearingDeg, `leg ${i + 1} bearing`).toBeCloseTo(brg, 1);
    });
    expect(totalDistanceNm(legs)).toBeCloseTo(7.698, 3);
    expect(legs[0]!.fromLabel).toBe('Start');
    expect(legs[0]!.toLabel).toBe('Island (I)');
    expect(legs[legs.length - 1]!.toLabel).toBe('Finish');
  });

  it('converts to ORC constructed-course legs with the race wind', () => {
    const legs = toOrcLegs(resolveRaceLegs(card, bmMarks, '10', raceDay), 340);
    expect(legs).toHaveLength(10);
    expect(legs[0]).toEqual({
      distanceNm: expect.closeTo(0.423, 3),
      bearingDeg: expect.closeTo(340.2, 1),
      windDirectionDeg: 340,
    });
  });
});

describe('the Autumn League card', () => {
  it('every course resolves against the card infrastructure', () => {
    for (const course of alCard.courses) {
      const legs = resolveRaceLegs(alCard, alMarks, course.id);
      expect(legs.length).toBeGreaterThanOrEqual(course.marks.length + 1);
      expect(legs[0]!.fromLabel).toBe('Start');
      expect(legs[legs.length - 1]!.toLabel).toBe('Finish');
      expect(totalDistanceNm(legs)).toBeGreaterThan(1);
    }
  });

  it('a laid windward mark becomes the first leg', () => {
    const windward = { lat: 53.4255, lng: -6.089 };
    const legs = resolveRaceLegs(alCard, alMarks, '001', { windwardMark: windward });
    expect(legs[0]!.toLabel).toBe('Windward mark');
    expect(legs[1]!.fromLabel).toBe('Windward mark');
    // Race-day positions extend, not replace, the card's fixed marks.
    const plain = resolveRaceLegs(alCard, alMarks, '001');
    expect(legs).toHaveLength(plain.length + 1);
  });
});
