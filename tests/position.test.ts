import { describe, expect, it } from 'vitest';

import { formatPosition, parsePosition } from '../src/index';

// Zephyr laid off Howth: 53° 23.740′ N 006° 04.210′ W.
const z = { lat: 53 + 23.74 / 60, lng: -(6 + 4.21 / 60) };

function close(actual: ReturnType<typeof parsePosition>, expected: { lat: number; lng: number }): void {
  expect(actual).not.toBeNull();
  expect(actual!.lat).toBeCloseTo(expected.lat, 6);
  expect(actual!.lng).toBeCloseTo(expected.lng, 6);
}

describe('parsePosition', () => {
  it('reads degrees and decimal minutes however the symbols are typed', () => {
    close(parsePosition('53° 23.740′ N 006° 04.210′ W'), z);
    close(parsePosition("53° 23.740' N, 006° 04.210' W"), z);
    close(parsePosition('53 23.740 N 6 4.21 W'), z);
    close(parsePosition('53 23.740N 006 04.210W'), z);
    close(parsePosition('N 53 23.740 W 006 04.210'), z);
    close(parsePosition('N53°23.740′ W006°04.210′'), z);
  });

  it('takes the coordinates in either order when they carry letters', () => {
    close(parsePosition('006° 04.210′ W 53° 23.740′ N'), z);
    close(parsePosition('W 006 04.210, N 53 23.740'), z);
  });

  it('reads degrees, minutes and seconds', () => {
    close(parsePosition('53°23′44.4″N 6°4′12.6″W'), z);
    close(parsePosition('53 23 44.4 N, 6 4 12.6 W'), z);
  });

  it('reads decimal degrees, signed or lettered', () => {
    close(parsePosition('53.395667, -6.070167'), z);
    close(parsePosition('53.395667 -6.070167'), z);
    close(parsePosition('33.85 151.2'), { lat: 33.85, lng: 151.2 });
    close(parsePosition('53.395667 N 6.070167 W'), z);
    close(parsePosition('-33.85, 151.2'), { lat: -33.85, lng: 151.2 });
  });

  it('reads what formatPosition wrote', () => {
    for (const p of [z, { lat: -33.85, lng: 151.2 }, { lat: 0, lng: 0 }, { lat: 53.99999, lng: 0 }]) {
      const back = parsePosition(formatPosition(p, { minuteDecimals: 5 }))!;
      expect(back.lat).toBeCloseTo(p.lat, 6);
      expect(back.lng).toBeCloseTo(p.lng, 6);
    }
  });

  it('refuses what is not a position, and the errors a scorer wants caught', () => {
    expect(parsePosition('')).toBeNull();
    expect(parsePosition('upwind of the line')).toBeNull();
    expect(parsePosition('53 23.740 N')).toBeNull(); // one coordinate
    expect(parsePosition('53 23.740')).toBeNull(); // one coordinate, no letter
    expect(parsePosition('53 23.740 N 6 4.21')).toBeNull(); // one letter, one not
    expect(parsePosition('53 23.740 N 6 4.21 S')).toBeNull(); // two latitudes
    expect(parsePosition('53 63.740 N 6 4.21 W')).toBeNull(); // minutes ≥ 60
    expect(parsePosition('53 23 74 N 6 4 12 W')).toBeNull(); // seconds ≥ 60
    expect(parsePosition('93 23.740 N 6 4.21 W')).toBeNull(); // latitude > 90
    expect(parsePosition('53 23.740 N 186 4.21 W')).toBeNull(); // longitude > 180
    expect(parsePosition('53.5 23.740 N 6 4.21 W')).toBeNull(); // fractional degrees with minutes
    expect(parsePosition('53 23 44 12 N 6 4 12 W')).toBeNull(); // four numbers
    expect(parsePosition('N -53 23.740 W 6 4.21')).toBeNull(); // a sign and a letter
    expect(parsePosition('53 23.740 N 6 4.21 W 12')).toBeNull(); // three coordinates
    expect(parsePosition('53 23.740 N 6 4.21 W x')).toBeNull(); // trailing junk
  });
});

describe('formatPosition', () => {
  it('prints degrees and decimal minutes with hemisphere', () => {
    expect(formatPosition({ lat: 53.446, lng: -6.054333 })).toBe('53° 26.76′ N 006° 03.26′ W');
    expect(formatPosition({ lat: -33.85, lng: 151.2 })).toBe('33° 51.00′ S 151° 12.00′ E');
    expect(formatPosition({ lat: 53.99999, lng: 0 })).toBe('54° 00.00′ N 000° 00.00′ E');
  });

  it('prints a GPS log’s thousandths when asked', () => {
    expect(formatPosition({ lat: 53 + 23.74 / 60, lng: -(6 + 4.21 / 60) }, { minuteDecimals: 3 })).toBe(
      '53° 23.740′ N 006° 04.210′ W',
    );
    expect(formatPosition({ lat: 53.999999, lng: 0 }, { minuteDecimals: 3 })).toBe('54° 00.000′ N 000° 00.000′ E');
  });
});
