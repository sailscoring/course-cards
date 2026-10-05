import { describe, expect, it } from 'vitest';

import { FormatError, calledCourseLegs, courseLegs, destination, parseCourseCardFile, parseMarksFile, parseRoutingFile } from '../src/index';

/** A small overlay over made-up marks: a headland between A and C that the
 *  fleet goes round by a waypoint, a straight run from A to B, and a start
 *  line assumed at a point and, near B, as B. */
export const ROUTING = {
  formatVersion: 2,
  source: 'local knowledge',
  contributor: 'A sailor',
  marks: 'marks.json',
  assumed: [
    { mark: 'A', position: { lat: 51.8, lng: -8.3 }, toleranceM: 20 },
    { mark: 'B', position: { lat: 51.8, lng: -8.28 }, toleranceM: 20 },
    { mark: 'C', position: { lat: 51.78, lng: -8.3 }, toleranceM: 20 },
    { id: 'SL@hut', mark: 'SL', position: { lat: 51.81, lng: -8.31 }, toleranceM: 500 },
    { id: 'SL@B', mark: 'SL', as: 'B', toleranceM: 500 },
  ],
  waypoints: [{ id: 'RW_Head', position: { lat: 51.79, lng: -8.29 } }],
  passages: [
    { from: 'A', to: 'C', via: ['RW_Head'], note: 'round the headland' },
    { from: 'SL@hut', to: 'C', via: ['A', 'RW_Head'] },
  ],
  direct: [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }, { from: 'SL@hut', to: 'A' }],
};

function without<T extends object>(obj: T, change: (o: T) => void): T {
  const copy = JSON.parse(JSON.stringify(obj)) as T;
  change(copy);
  return copy;
}

describe('parseRoutingFile', () => {
  it('reads an overlay, defaulting an assumed position’s id to its mark’s', () => {
    const r = parseRoutingFile(ROUTING);
    expect(r.contributor).toBe('A sailor');
    expect(r.assumed.map((a) => a.id)).toEqual(['A', 'B', 'C', 'SL@hut', 'SL@B']);
    expect(r.assumed[4]).toEqual({ id: 'SL@B', mark: 'SL', as: 'B', toleranceM: 500 });
    expect(r.passages[0]).toEqual({ from: 'A', to: 'C', via: ['RW_Head'], note: 'round the headland' });
    expect(r.direct).toHaveLength(3);
  });

  it('refuses a pair or a turn at something it does not declare', () => {
    expect(() => parseRoutingFile(without(ROUTING, (r) => r.direct.push({ from: 'A', to: 'D' })))).toThrow(/"D" is not an assumed position/);
    expect(() => parseRoutingFile(without(ROUTING, (r) => (r.passages[0]!.via = ['RW_Tail'])))).toThrow(/"RW_Tail" is neither a waypoint nor an assumed position/);
  });

  it('refuses a pair listed twice, in either direction, as a passage or as direct', () => {
    expect(() => parseRoutingFile(without(ROUTING, (r) => r.direct.push({ from: 'C', to: 'A' })))).toThrow(/C – A is listed twice/);
  });

  it('refuses a pair named by a stand-in, which nothing would look up', () => {
    expect(() => parseRoutingFile(without(ROUTING, (r) => r.direct.push({ from: 'SL@B', to: 'C' })))).toThrow(/"SL@B" is not an assumed position with one of its own/);
  });

  it('refuses an assumed position with both a position and a stand-in, or neither', () => {
    expect(() => parseRoutingFile(without(ROUTING, (r) => Object.assign(r.assumed[4]!, { position: { lat: 51.8, lng: -8.28 } })))).toThrow(FormatError);
    expect(() => parseRoutingFile(without(ROUTING, (r) => delete (r.assumed[0] as { position?: unknown }).position))).toThrow(/exactly one of position and as/);
  });

  it('refuses an id declared twice', () => {
    expect(() => parseRoutingFile(without(ROUTING, (r) => r.waypoints.push({ id: 'A', position: { lat: 51.8, lng: -8.3 } })))).toThrow(/duplicate id "A"/);
  });
});

const MARKS = parseMarksFile({
  formatVersion: 2,
  source: 'the club',
  marks: [
    { id: 'A', position: { lat: 51.8, lng: -8.3 } },
    { id: 'B', position: { lat: 51.8, lng: -8.28 } },
    { id: 'C', position: { lat: 51.78, lng: -8.3 } },
    { id: 'D', position: { lat: 51.77, lng: -8.27 } },
  ],
});
const CARD = parseCourseCardFile({
  formatVersion: 2,
  marks: 'marks.json',
  startLine: { id: 'SL', placement: 'off the hut, or a committee boat' },
  courses: [
    { id: '1', marks: [{ mark: 'SL' }, { mark: 'A' }, { mark: 'C' }, { mark: 'B' }, { mark: 'SL' }] },
    { id: '2', marks: [{ mark: 'SL' }, { mark: 'C' }, { mark: 'A' }, { mark: 'D' }] },
  ],
});
const routing = parseRoutingFile(ROUTING);
const HUT = { lat: 51.81, lng: -8.31 };
const near = (p: { lat: number; lng: number }, metres: number) => destination(p, 90, metres);
const shape = (legs: ReturnType<typeof courseLegs>) =>
  legs.map((l) => `${l.from.mark}>${l.to.mark} ${l.review} ${l.cardLeg}${l.offsetM ? ` ${Math.round(l.offsetM)}m` : ''}`);

describe('courseLegs with a routing overlay', () => {
  it('leaves the legs as they were without one, with no review', () => {
    const legs = courseLegs(CARD, MARKS, '1', { marks: { SL: HUT } });
    expect(legs.map((l) => l.to.mark)).toEqual(['A', 'C', 'B', 'SL']);
    for (const l of legs) expect(Object.keys(l).sort()).toEqual(['bearingDeg', 'distanceNm', 'from', 'to']);
  });

  it('sails a passage through its waypoints and says how it speaks for every leg', () => {
    const legs = courseLegs(CARD, MARKS, '1', { marks: { SL: near(HUT, 100) } }, routing);
    expect(shape(legs)).toEqual([
      'SL>A direct 0 100m', // the line is 100 m from where the overlay assumed it
      'A>RW_Head passage 1',
      'RW_Head>C passage 1',
      'C>B direct 2', // listed B to C: a pair matches either way
      'B>SL unreviewed 3', // a line 100 m off the hut is 1.5 km from B, too far to be B
    ]);
    expect(legs[1]!.to).toMatchObject({ mark: 'RW_Head', routing: true, source: 'local knowledge' });
    expect(legs[0]!.to.routing).toBeUndefined();
  });

  it('sails a passage listed the other way through its waypoints in reverse, turning at a mark where the passage does', () => {
    const legs = courseLegs(CARD, MARKS, '2', { marks: { SL: HUT } }, routing);
    expect(shape(legs)).toEqual([
      'SL>A passage 0', // SL@hut to C, via A and the headland
      'A>RW_Head passage 0',
      'RW_Head>C passage 0',
      'C>RW_Head passage 1', // A to C, reversed
      'RW_Head>A passage 1',
      'A>D unreviewed 2', // a pair the overlay does not list
    ]);
  });

  it('stands a start line in for the mark it is near', () => {
    const legs = courseLegs(CARD, MARKS, '1', { marks: { SL: near({ lat: 51.8, lng: -8.28 }, 300) } }, routing);
    // SL within 500 m of B is B, and B to A is direct.
    expect(shape(legs)[0]).toBe('SL>A direct 0 300m');
    // From B to a finish standing in for B is B to itself, which no overlay
    // lists: nobody checked the hop from the mark to the line.
    expect(shape(legs).at(-1)).toBe('B>SL unreviewed 3');
  });

  it('says nothing of a leg from a line that is near no position the overlay assumed', () => {
    const legs = courseLegs(CARD, MARKS, '1', { marks: { SL: near(HUT, 2000) } }, routing);
    expect(shape(legs)[0]).toBe('SL>A unreviewed 0');
  });

  it('withdraws every verdict on a mark that has moved further than its tolerance', () => {
    // C moved 50 m: the passage to it and the pair from it no longer hold.
    const legs = courseLegs(CARD, MARKS, '1', { marks: { SL: HUT, C: near({ lat: 51.78, lng: -8.3 }, 50) } }, routing);
    expect(shape(legs)).toEqual(['SL>A direct 0', 'A>C unreviewed 1', 'C>B unreviewed 2', 'B>SL unreviewed 3']);
  });

  it('withdraws a passage that turns at a mark that has moved', () => {
    const legs = courseLegs(CARD, MARKS, '2', { marks: { SL: HUT, A: near({ lat: 51.8, lng: -8.3 }, 50) } }, routing);
    expect(shape(legs)[0]).toBe('SL>C unreviewed 0');
  });

  it('routes a course called on the day the same way', () => {
    const legs = calledCourseLegs(CARD, MARKS, [{ mark: 'A' }, { mark: 'C' }], { marks: { SL: HUT } }, routing);
    expect(shape(legs)).toEqual(['SL>A direct 0', 'A>RW_Head passage 1', 'RW_Head>C passage 1']);
  });
});
