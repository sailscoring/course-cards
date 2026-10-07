import { describe, expect, it } from 'vitest';

import {
  CourseError,
  FormatError,
  METRES_PER_NM,
  bearingDeg,
  courseLegs,
  courseMarks,
  destination,
  distanceNm,
  lineGeometry,
  midpointOf,
  parseCourseCardFile,
  parseMarksFile,
  parseRoutingFile,
  renderCourseSvg,
  type DrawnMark,
} from '../src/index';

// Off Crosshaven: a committee boat at the starboard end, a pin 400 m to the
// south-south-west, and a windward mark laid upwind of the line. The card's
// fixed mark C sits to the north.
const cv = { lat: 51.7825, lng: -8.23442 };
const pin = destination(cv, 200, 400);
const C = { lat: 51.795, lng: -8.24 };

const marks = parseMarksFile({
  formatVersion: 2,
  source: 'Marks sheet',
  marks: [
    { id: 'Z', name: 'Windward', placement: 'Upwind of the start line' },
    { id: 'C', name: 'Cage', position: C },
    { id: 'P', name: 'Club pin', placement: 'Laid at the port end of the line' },
  ],
});

const laidLine = {
  id: 'SL',
  name: 'Start line',
  source: 'SI 7.1',
  ends: [
    { end: 'starboard', name: 'Mainmast of the committee vessel', placement: 'At the committee vessel' },
    { end: 'port', name: 'Outer pin-end mark', placement: 'An orange buoy to the south' },
  ],
};

function card(startLine: unknown, extra: Record<string, unknown> = {}) {
  return parseCourseCardFile({
    formatVersion: 2,
    source: 'Course card',
    startLine,
    courses: [{ id: '1', marks: [{ mark: 'SL' }, { mark: 'Z', side: 'port' }, { mark: 'C', side: 'port' }, { mark: 'SL' }] }],
    ...extra,
  });
}

describe('midpointOf', () => {
  it('is equidistant from both ends, on the line between them', () => {
    const mid = midpointOf(cv, pin);
    expect(distanceNm(cv, mid)).toBeCloseTo(distanceNm(mid, pin), 9);
    expect(distanceNm(cv, mid) * METRES_PER_NM).toBeCloseTo(200, 3);
    expect(bearingDeg(cv, mid)).toBeCloseTo(200, 3);
  });

  it('is the end itself for a line of no length, and crosses the antimeridian', () => {
    expect(midpointOf(cv, cv).lat).toBeCloseTo(cv.lat, 12);
    expect(midpointOf(cv, cv).lng).toBeCloseTo(cv.lng, 12);
    const mid = midpointOf({ lat: 0, lng: 179 }, { lat: 0, lng: -179 });
    expect(Math.abs(mid.lng)).toBeCloseTo(180, 9);
  });
});

describe('a line with two ends on the card', () => {
  const laid = card(laidLine);
  const race = { marks: { SL: { ends: { starboard: cv, port: pin } }, Z: destination(cv, 180, 1500) } };

  it('reads the ends as the instructions describe them', () => {
    expect(laid.startLine!.ends).toEqual(laidLine.ends);
  });

  it('measures the legs to and from the line at its midpoint', () => {
    const mid = midpointOf(cv, pin);
    const legs = courseLegs(laid, marks, '1', race);
    expect(legs[0]!.from.position).toEqual(mid);
    expect(legs[0]!.distanceNm).toBeCloseTo(distanceNm(mid, race.marks.Z), 12);
    expect(legs[0]!.bearingDeg).toBeCloseTo(bearingDeg(mid, race.marks.Z), 12);
    expect(legs[2]!.to.position).toEqual(mid);
  });

  it('says a leg was measured from the middle of a line, and carries its ends', () => {
    const [first] = courseLegs(laid, marks, '1', race);
    expect(first!.from).toEqual({
      mark: 'SL',
      label: 'Start line (SL)',
      position: midpointOf(cv, pin),
      line: 'midpoint',
      ends: [
        { end: 'starboard', label: 'Mainmast of the committee vessel', position: cv },
        { end: 'port', label: 'Outer pin-end mark', position: pin },
      ],
    });
    expect(first!.to.line).toBeUndefined();
  });

  it('measures from the committee boat when the race gives the line as one point', () => {
    const legs = courseLegs(laid, marks, '1', { marks: { SL: cv, Z: race.marks.Z } });
    expect(legs[0]!.from).toEqual({ mark: 'SL', label: 'Start line (SL)', position: cv });
  });

  it('names an end nobody placed, quoting where it goes, and never guesses a midpoint from one end', () => {
    const oneEnd = { marks: { SL: { ends: { starboard: cv } }, Z: race.marks.Z } };
    expect(() => courseLegs(laid, marks, '1', oneEnd)).toThrow(CourseError);
    expect(() => courseLegs(laid, marks, '1', oneEnd)).toThrow(
      'course 1: no position for the port end of "SL" (An orange buoy to the south)',
    );
    expect(() => courseLegs(laid, marks, '1', { marks: { Z: race.marks.Z } })).toThrow(
      'no position for the starboard end of "SL" (At the committee vessel)',
    );
  });

  it('lets the card’s own position stand where the race says nothing of the line', () => {
    const nominal = { lat: 51.781, lng: -8.236 };
    const withPosition = card({ ...laidLine, position: nominal });
    const legs = courseLegs(withPosition, marks, '1', { marks: { Z: race.marks.Z } });
    expect(legs[0]!.from).toEqual({ mark: 'SL', label: 'Start line (SL)', position: nominal, source: 'SI 7.1' });
    // ...but not once the race gives one end of it.
    expect(() =>
      courseLegs(withPosition, marks, '1', { marks: { SL: { ends: { port: pin } }, Z: race.marks.Z } }),
    ).toThrow('no position for the starboard end of "SL"');
  });

  it('asks the race for the line, as for any laid mark', () => {
    expect(courseMarks(laid, marks, '1')[0]!.placed).toBe(false);
  });
});

describe('a line with fixed ends', () => {
  // One end a pole ashore with a position of its own, the other the club's
  // charted mark C.
  const pole = destination(C, 270, 600);
  const fixed = card({
    id: 'SL',
    name: 'Grassy Walk line',
    source: 'SI 26.1',
    ends: [
      { end: 'starboard', name: 'Pole in front of the hut', position: pole },
      { end: 'port', mark: 'C', source: 'SI 26.1(b)' },
    ],
  });

  it('needs nothing from the race, and the card places it', () => {
    expect(courseMarks(fixed, marks, '1')[0]!.placed).toBe(true);
    const legs = courseLegs(fixed, marks, '1', { marks: { Z: destination(C, 180, 1500) } });
    expect(legs[0]!.from.position).toEqual(midpointOf(pole, C));
    expect(legs[0]!.from.source).toBe('SI 26.1');
    expect(legs[0]!.from.ends).toEqual([
      { end: 'starboard', label: 'Pole in front of the hut', position: pole, source: 'SI 26.1' },
      { end: 'port', label: 'Cage (C)', mark: 'C', position: C, source: 'Marks sheet' },
    ]);
  });

  it('follows a moved mark to the end it forms, and lets the race override an end', () => {
    const moved = destination(C, 90, 100);
    const z = destination(C, 180, 1500);
    const g = courseLegs(fixed, marks, '1', { marks: { C: moved, Z: z } })[0]!.from;
    expect(g.ends![1].position).toEqual(moved);
    expect(g.ends![1].source).toBeUndefined();
    const over = courseLegs(fixed, marks, '1', { marks: { SL: { ends: { starboard: cv } }, Z: z } })[0]!.from;
    expect(over.ends![0].position).toEqual(cv);
    expect(over.source).toBeUndefined();
  });

  it('is an error where an end names a mark the marks file does not list', () => {
    const bad = card({ id: 'SL', ends: [{ end: 'starboard', position: pole }, { end: 'port', mark: 'Q' }] });
    expect(() => courseLegs(bad, marks, '1', { marks: { Z: C } })).toThrow('unknown mark "Q" at the port end of "SL"');
  });

  it('quotes the marks file’s placement for a laid mark forming an end', () => {
    const laidPin = card({ id: 'SL', ends: [{ end: 'starboard', position: pole }, { end: 'port', mark: 'P' }] });
    expect(() => courseLegs(laidPin, marks, '1', { marks: { Z: C } })).toThrow(
      'no position for the port end of "SL" (Laid at the port end of the line)',
    );
    expect(courseMarks(laidPin, marks, '1')[0]!.placed).toBe(false);
  });
});

describe('a finish line of its own', () => {
  it('is measured from its midpoint the same way', () => {
    const fin = parseCourseCardFile({
      formatVersion: 2,
      startLine: { id: 'SL' },
      finish: {
        id: 'FL',
        ends: [
          { end: 'starboard', name: 'Committee vessel' },
          { end: 'port', name: 'Finish pin' },
        ],
      },
      courses: [{ id: '1', marks: [{ mark: 'SL' }, { mark: 'C' }, { mark: 'FL' }] }],
    });
    const fv = destination(C, 0, 800);
    const fp = destination(fv, 90, 150);
    const legs = courseLegs(fin, marks, '1', { marks: { SL: cv, FL: { ends: { starboard: fv, port: fp } } } });
    expect(legs[0]!.from.line).toBeUndefined();
    expect(legs[1]!.to.position).toEqual(midpointOf(fv, fp));
    expect(legs[1]!.to.line).toBe('midpoint');
  });
});

describe('ends given for the race only', () => {
  it('make a line of a start the card gives as one mark, starboard first', () => {
    const plain = card({ id: 'SL', name: 'Start line' });
    const legs = courseLegs(plain, marks, '1', { marks: { SL: { ends: { port: pin, starboard: cv } }, Z: C } });
    expect(legs[0]!.from.position).toEqual(midpointOf(cv, pin));
    expect(legs[0]!.from.ends!.map((e) => [e.end, e.label])).toEqual([
      ['starboard', 'Starboard end'],
      ['port', 'Port end'],
    ]);
  });
});

describe('lineGeometry', () => {
  const line = card(laidLine).startLine!;

  it('gives the ends, the measuring point, the length and the bearing along the line', () => {
    const g = lineGeometry(line, { marks: { SL: { ends: { starboard: cv, port: pin } } } })!;
    expect(g.measuringPoint).toEqual(midpointOf(cv, pin));
    expect(g.lengthM).toBeCloseTo(400, 3);
    expect(g.bearingDeg).toBeCloseTo(200, 3);
    expect(g.ends.map((e) => e.end)).toEqual(['starboard', 'port']);
  });

  it('is undefined for a line that is one point', () => {
    expect(lineGeometry(line, { marks: { SL: cv } })).toBeUndefined();
    expect(lineGeometry({ id: 'SL', position: cv })).toBeUndefined();
  });

  it('names the end it cannot place', () => {
    expect(() => lineGeometry(line, { marks: { SL: { ends: { port: pin } } } })).toThrow(
      'line "SL": no position for the starboard end of "SL" (At the committee vessel)',
    );
  });

  it('resolves an end that is a mark through the marks file', () => {
    const g = lineGeometry({ id: 'SL', ends: [{ end: 'starboard', position: cv }, { end: 'port', mark: 'C' }] }, {}, marks)!;
    expect(g.ends[1].position).toEqual(C);
    expect(g.measuringPoint).toEqual(midpointOf(cv, C));
  });
});

describe('the parser', () => {
  const pole = { lat: 51.8, lng: -8.3 };
  const hut = { lat: 51.801, lng: -8.302 };

  it('keeps a finish’s ends beside its run in', () => {
    const c = card({ id: 'SL' }, {
      finish: {
        id: 'FL',
        via: [{ mark: 'C', side: 'port' }],
        ends: [{ end: 'port', mark: 'C' }, { end: 'starboard', name: 'Committee vessel', placement: 'North of C' }],
      },
    });
    expect(c.finish!.via).toEqual([{ mark: 'C', side: 'port' }]);
    expect(c.finish!.ends).toEqual([{ end: 'port', mark: 'C' }, { end: 'starboard', name: 'Committee vessel', placement: 'North of C' }]);
  });

  it('refuses ends that are not one starboard and one port', () => {
    expect(() => card({ id: 'SL', ends: [{ end: 'port' }] })).toThrow('card.startLine.ends: expected two ends');
    expect(() => card({ id: 'SL', ends: [{ end: 'port' }, { end: 'port' }] })).toThrow('one starboard end and one port end');
    expect(() => card({ id: 'SL', ends: [{ end: 'left' }, { end: 'port' }] })).toThrow(FormatError);
    expect(() => card({ id: 'SL', ends: [{ end: 'starboard', mark: 'C', position: pole }, { end: 'port' }] })).toThrow(
      'at most one of mark and position',
    );
  });

  it('holds a fixed line’s own position to the midpoint of its ends', () => {
    const ends = [{ end: 'starboard', position: pole }, { end: 'port', position: hut }];
    expect(card({ id: 'SL', ends, position: midpointOf(pole, hut) }).startLine!.position).toEqual(midpointOf(pole, hut));
    expect(() => card({ id: 'SL', ends, position: pole })).toThrow(/card\.startLine\.position: expected the midpoint .* \d+ m from it/);
  });

  it('keeps only what the format defines on an end', () => {
    const c = card({ id: 'SL', ends: [{ end: 'starboard', colour: 'red', name: 'Pole' }, { end: 'port' }] });
    expect(c.startLine!.ends![0]).toEqual({ end: 'starboard', name: 'Pole' });
  });
});

describe('routing from a line', () => {
  // The overlay assumed the line where the committee boat usually is, and
  // checked the water from there to C.
  const assumed = destination(cv, 200, 150);
  const routing = parseRoutingFile({
    formatVersion: 2,
    assumed: [
      { mark: 'SL', position: assumed, toleranceM: 500 },
      { mark: 'C', position: C, toleranceM: 50 },
    ],
    direct: [{ from: 'SL', to: 'C' }],
  });
  const direct = parseCourseCardFile({
    formatVersion: 2,
    startLine: laidLine,
    courses: [{ id: '1', marks: [{ mark: 'SL' }, { mark: 'C' }] }],
  });

  it('matches the line by its measuring point, and reports how far that was from where it was assumed', () => {
    const [leg] = courseLegs(direct, marks, '1', { marks: { SL: { ends: { starboard: cv, port: pin } } } }, routing);
    expect(leg!.review).toBe('direct');
    expect(leg!.from.line).toBe('midpoint');
    expect(leg!.offsetM).toBeCloseTo(distanceNm(midpointOf(cv, pin), assumed) * METRES_PER_NM, 1);
    expect(leg!.offsetM).toBeGreaterThan(40);
  });
});

describe('drawing a line with two ends', () => {
  const mid = midpointOf(cv, pin);
  const drawn: DrawnMark[] = [
    {
      id: 'SL',
      label: 'Start',
      position: mid,
      ends: [
        { position: cv, label: 'Committee vessel', kind: 'vessel' },
        { position: pin, label: 'Pin', kind: 'buoy' },
      ],
    },
    { id: 'C', label: 'C', position: C, fixed: true },
  ];
  const svg = renderCourseSvg(drawn, [{ mark: 'SL' }, { mark: 'C', side: 'port' }, { mark: 'SL' }]);

  it('draws the segment between the ends, with a symbol for each, named on hover', () => {
    expect(svg).toMatch(/<path d="M[\d.]+ [\d.]+L[\d.]+ [\d.]+" stroke="#333" stroke-width="2.0" fill="none"\/>/);
    expect(svg).toContain('<title>Committee vessel</title></path>');
    expect(svg).toContain('fill="#f57c00"');
    expect(svg).toContain('<title>Pin</title></circle>');
    expect(svg).not.toMatch(/<script|<style|<image|href=| id=| class=/);
  });

  it('leaves the legs from the midpoint, which is drawn as the line’s mark', () => {
    expect((svg.match(/fill="#fff" stroke="#d84315"/g) ?? []).length).toBe(1);
    expect(svg).toContain('<title>Start</title>');
    expect(svg).toContain('<tspan font-weight="700">1</tspan>');
    expect(svg).toContain('<tspan font-weight="700">2</tspan>');
  });

  it('frames the ends as well as the marks', () => {
    // A long line whose ends reach well beyond the marks still fits.
    const far = destination(mid, 270, 4000);
    const wide = renderCourseSvg([{ ...drawn[0]!, ends: [{ position: far }, { position: destination(mid, 90, 4000) }] }, drawn[1]!]);
    const [, w, h] = wide.match(/viewBox="0 0 (\d+) (\d+)"/)!.map(Number);
    const segment = wide.match(/<path d="M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)" stroke="#333"/)!.slice(1).map(Number);
    for (const [i, v] of segment.entries()) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(i % 2 ? h! : w!);
    }
    expect(wide).toMatch(/<rect x="[\d.]+" y="[\d.]+" width="6.0" height="6.0" fill="#333"/);
  });

  it('draws a single-point line as it always did', () => {
    const plain = renderCourseSvg([{ id: 'SL', label: 'Start', position: cv }, drawn[1]!], [{ mark: 'SL' }, { mark: 'C' }]);
    expect(plain).not.toContain('stroke="#333" stroke-width="2.0" fill="none"');
  });
});
