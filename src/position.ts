/**
 * Positions the way sailors write them. A committee boat's log, a mark
 * sheet, a GPS screen and a chart plotter each print a position in their own
 * style — degrees and decimal minutes with or without the symbols, degrees
 * minutes and seconds, or decimal degrees, the hemisphere as a letter before
 * or after or as a sign — and a scorer transcribes whichever is in front of
 * them. `parsePosition` reads all of them; `formatPosition` prints the one
 * form a club prints on its marks sheet.
 */

import type { Position } from './types.js';

/** Read a position from text. Accepts, in any of these styles, a latitude
 *  and a longitude:
 *
 *  - degrees and decimal minutes: `53° 23.740′ N 006° 04.210′ W`,
 *    `53 23.740 N, 6 4.21 W`, `N53 23.740 W006 04.210`
 *  - degrees, minutes and seconds: `53°23′44.4″N 6°4′12.6″W`
 *  - decimal degrees: `53.39566, -6.07025`, `53.39566 N 6.07025 W`
 *
 *  The hemisphere may be a letter before or after each coordinate, or a sign
 *  on decimal degrees; with letters the coordinates may come in either order.
 *  A comma may separate the two. Returns null for anything else, and for a
 *  latitude beyond ±90°, a longitude beyond ±180°, or minutes or seconds of
 *  60 or more — the transposition errors a scorer wants caught. */
export function parsePosition(text: string): Position | null {
  const normalised = text
    .replace(/[°º˚]/g, ' ')
    .replace(/[′'’‘`]/g, ' ')
    .replace(/[″"”“]/g, ' ')
    .toUpperCase()
    .trim();
  if (!normalised) return null;

  // Tokens: numbers (a sign allowed on the first of a coordinate), hemisphere
  // letters, and commas as hard boundaries between the two coordinates.
  const tokens = normalised.match(/[NSEW]|[+-]?\d+(?:\.\d+)?|,/g);
  if (!tokens || tokens.join('').replace(/[\s]/g, '').length !== normalised.replace(/\s/g, '').length) {
    return null;
  }

  // Group into coordinates: a hemisphere letter closes the group it follows,
  // or opens the next; a comma closes the group before it.
  interface Group { hemi?: 'N' | 'S' | 'E' | 'W'; numbers: number[] }
  const groups: Group[] = [];
  let current: Group = { numbers: [] };
  const close = (): void => {
    if (current.numbers.length > 0) groups.push(current);
    current = { numbers: [] };
  };
  for (const token of tokens) {
    if (token === ',') {
      close();
    } else if (/^[NSEW]$/.test(token)) {
      const hemi = token as Group['hemi'];
      if (current.numbers.length > 0 && !current.hemi) {
        // a trailing letter: it closes the coordinate before it
        current.hemi = hemi;
        close();
      } else {
        // a leading letter: it opens a coordinate (closing a led one before it)
        close();
        current.hemi = hemi;
      }
    } else {
      // a signed number starts a coordinate, so `53.39 -6.07` needs no comma
      if (current.numbers.length > 0 && /^[+-]/.test(token)) close();
      if (current.numbers.length === 3) return null;
      if (current.numbers.length === 0 && current.hemi && /^[+-]/.test(token)) return null;
      current.numbers.push(Number(token));
    }
  }
  close();
  // Two unsigned decimals with no comma and no letters — `53.39 6.07` off a
  // plotter — can only be decimal degrees: a degree with minutes is whole.
  if (groups.length === 1 && groups[0]!.numbers.length === 2 && !groups[0]!.hemi && !Number.isInteger(groups[0]!.numbers[0])) {
    const [lat, lng] = groups[0]!.numbers as [number, number];
    groups.splice(0, 1, { numbers: [lat] }, { numbers: [lng] });
  }
  if (groups.length !== 2) return null;

  const [a, b] = groups as [Group, Group];
  const lettered = a.hemi !== undefined && b.hemi !== undefined;
  if ((a.hemi !== undefined) !== (b.hemi !== undefined)) return null;

  const value = (g: Group): number | null => {
    const [d, m = 0, s = 0] = g.numbers as [number, number?, number?];
    if (g.numbers.length > 1 && (!Number.isInteger(d) || m < 0 || m >= 60)) return null;
    if (g.numbers.length > 2 && (!Number.isInteger(m) || s < 0 || s >= 60)) return null;
    const magnitude = Math.abs(d) + m / 60 + s / 3600;
    const negative = d < 0 || Object.is(d, -0) || g.hemi === 'S' || g.hemi === 'W';
    return negative ? -magnitude : magnitude;
  };

  let lat: number | null;
  let lng: number | null;
  if (lettered) {
    const isLat = (g: Group): boolean => g.hemi === 'N' || g.hemi === 'S';
    if (isLat(a) === isLat(b)) return null;
    lat = value(isLat(a) ? a : b);
    lng = value(isLat(a) ? b : a);
  } else {
    lat = value(a);
    lng = value(b);
  }
  if (lat === null || lng === null) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export interface FormatPositionOptions {
  /** Decimal places of the minutes: 2 as a marks sheet prints them (the
   *  default), 3 as a GPS log does. */
  minuteDecimals?: number;
}

/** 53.446, -6.054333 → `53° 26.76′ N 006° 03.26′ W`: degrees and decimal
 *  minutes, the way a club prints a position on its marks sheet. */
export function formatPosition(p: Position, options: FormatPositionOptions = {}): string {
  const decimals = options.minuteDecimals ?? 2;
  const dm = (value: number, width: number): string => {
    const abs = Math.abs(value);
    let deg = Math.floor(abs);
    let min = (abs - deg) * 60;
    if (min >= 60 - 0.5 / 10 ** decimals) {
      deg += 1;
      min = 0;
    }
    return `${String(deg).padStart(width, '0')}° ${min.toFixed(decimals).padStart(3 + decimals, '0')}′`;
  };
  return `${dm(p.lat, 2)} ${p.lat >= 0 ? 'N' : 'S'} ${dm(p.lng, 3)} ${p.lng >= 0 ? 'E' : 'W'}`;
}
