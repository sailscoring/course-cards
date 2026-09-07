import { describe, expect, it } from 'vitest';

import { METRES_PER_CABLE, METRES_PER_NM, bearingDeg, destination, distanceNm } from '../src/geo';

const howth = { lat: 53.39, lng: -6.07 };

describe('geo primitives', () => {
  it('distance is symmetric and zero to itself', () => {
    const other = { lat: 53.428, lng: -6.074 };
    expect(distanceNm(howth, howth)).toBe(0);
    expect(distanceNm(howth, other)).toBeCloseTo(distanceNm(other, howth), 12);
  });

  it('one minute of latitude is one nautical mile, near enough', () => {
    // R = 3440.065 NM makes an arc-minute 1.0008 NM — the same radius the
    // reference leg records used, so the tolerance allows for it.
    expect(distanceNm(howth, { lat: howth.lat + 1 / 60, lng: howth.lng })).toBeCloseTo(1, 2);
    expect(bearingDeg(howth, { lat: howth.lat + 1 / 60, lng: howth.lng })).toBeCloseTo(0, 5);
  });

  it('destination inverts distance and bearing', () => {
    // Lay a windward mark 1,000 m upwind at 250° and sail back to it.
    const mark = destination(howth, 250, 1000);
    expect(distanceNm(howth, mark) * 1852).toBeCloseTo(1000, 3);
    expect(bearingDeg(howth, mark)).toBeCloseTo(250, 2);
  });

  it('a laid mark logged in miles or cables lands where the log says', () => {
    expect(METRES_PER_NM).toBe(1852);
    expect(METRES_PER_CABLE).toBe(185.2);
    const mark = destination(howth, 190, 0.6 * METRES_PER_NM);
    expect(distanceNm(howth, mark)).toBeCloseTo(0.6, 6);
    expect(distanceNm(howth, destination(howth, 190, 2 * METRES_PER_CABLE))).toBeCloseTo(0.2, 6);
  });
});
