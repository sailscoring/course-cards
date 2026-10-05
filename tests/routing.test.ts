import { describe, expect, it } from 'vitest';

import { FormatError, parseRoutingFile } from '../src/index';

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
