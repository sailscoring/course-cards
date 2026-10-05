import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { decimalYear, declinationAtDeg, declinationDeg } from '../tools/wmm';

// NOAA's test values for WMM2025, as published with the coefficients:
// decimal year, height (km), latitude, longitude, declination (°), ...
const values = readFileSync(join(__dirname, 'wmm2025-test-values.txt'), 'utf-8')
  .split('\n')
  .filter((l) => l.trim() && !l.startsWith('#'))
  .map((l) => l.trim().split(/\s+/).map(Number) as [number, number, number, number, number]);

describe('declinationDeg', () => {
  it('reproduces every one of NOAA’s WMM2025 test values', () => {
    expect(values.length).toBe(100);
    for (const [t, h, lat, lng, d] of values) {
      expect(Math.abs(declinationAtDeg({ lat, lng }, t, h) - d)).toBeLessThan(0.006);
    }
  });

  it('gives the variation off Howth in autumn 2026, about a degree west', () => {
    const d = declinationDeg({ lat: 53.4173, lng: -6.066 }, '2026-10-01');
    expect(d).toBeCloseTo(-1.09, 2);
  });

  it('works dates out as decimal years, and refuses one outside the model', () => {
    expect(decimalYear('2025-01-01')).toBe(2025);
    expect(decimalYear('2026-07-02')).toBeCloseTo(2026.5, 2);
    expect(() => declinationDeg({ lat: 53, lng: -6 }, '2024-12-31')).toThrow(/outside WMM-2025/);
    expect(() => declinationDeg({ lat: 53, lng: -6 }, '2030-01-01')).toThrow(/outside WMM-2025/);
  });
});
