import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { courseLegs, parseCourseCardFile, parseMarksFile } from '../src/index';
import { printed } from './printed';

function load(...rel: string[]): unknown {
  return JSON.parse(readFileSync(join(__dirname, '..', 'data', 'cybc', 'season-2026', ...rel), 'utf-8'));
}

const marks = parseMarksFile(load('marks.json'));
const cruiser = parseCourseCardFile(load('cruiser.json'));
const ecbkc = parseCourseCardFile(load('ec-bkc.json'));

// The Cruiser Course Card 2026 as printed: number | direction | length | course.
const CRUISER = `
1|NW+W+SW|Short (4)|Vp-Hs-SWp-CHp-NBs
2|NW+W+SW|Long (6)|Vp-Hs-SWp-CHp-SWp-CHp-NBs
3|NE+E+SE|Short (4)|Ss-Hp-NBp-CHs-SWs-Hp-Vs
4|NE+E+SE|Long (6)|Ss-Hp-NBp-CHs-SWs-CHp-NBs-Vs
5|West|Short (5.5)|Vp-NBp-CHs-BIs-INs-CHp-NBs
6|West|Long (7.5)|Vp-NBp-CHs-DRp-BIp-CHp-NBs
7|South West|Short (6)|Vp-NBp-CHs-INp-CWp-CHp-NBs
8|South West|Long (7.5)|Vp-NBp-CHs-Op-SUTp-CHp-NBs
9|South|Short (6)|NBp-CHs-CWs-INs-CHp-SWs-Hp-Vs
10|South|Long (7)|NBp-CHs-CWs-INs-BIp-CHp-SWs-Hp-Vs
11|South East|Short (6)|NBp-CHs-BIs-INs-CHp-SWs-Hp-Vs
12|South East|Long (7)|NBp-CHs-CWs-Os-CHp-SWs-Hp-Vs
13|East|Short (6.5)|NBp-CHs-BIs-Os-CHp-SWs-Hp-Vs
14|East|Long (7.5)|NBp-CHs-BIs-DRs-CHp-SWs-Hp-Vs
15|North East|Short (6)|NBp-CHs-CWs-CHp-SWs-Hp-Vs
16|North East|Long (7)|NBp-CHs-SUTs-CHp-SWs-Hp-Vs
17|North|Short (5.5)|Vp-NBp-CHs-BIs-INs-CHp-NBs
18|North|Long (7)|Vp-NBp-CHs-BIs-INp-CWp-BIp-CHp-NBs
19|North West|Short (5.5)|Vp-NBp-CHs-INp-BIp-CHp-NBs
20|North West|Long (8)|Vp-NBp-CHs-DRp-SUTp-CHp-NBs
21|West (inner)|Short (3.3)|Vp-CHp-NBs
22|South (inner)|Short (2.5)|Ss-NBs-Vs
23|East (inner)|Short (1.3)|Hs-Vs
24|North (inner)|Short (2.6)|Vp-NBp
`
  .trim()
  .split('\n')
  .map((line) => {
    const [id, direction, length, seq] = line.split('|') as [string, string, string, string];
    return {
      id,
      direction,
      length: Number(/\(([\d.]+)\)/.exec(length)![1]),
      marks: seq.split('-').map((tok) => ({ mark: tok.slice(0, -1), side: tok.endsWith('p') ? 'port' : 'starboard' })),
    };
  });

// SI 12.1 as printed, X1 high water then X2 low water: id | direction | marks with sides
// ("0" and "OUT" are the instructions' slips for O).
const ECBKC = `
A1|North|CW S,O P,SUT P
B1|North-East|DR P,BI S,SUT S
C1|East|O P,CW S,DR S,O S
D1|South-East|IN P,CW S,O P,SUT S,DR S
E1|South|IN P,SUT S,O S,IN S
F1|South-West|IN S,SUT P,BI P,DR S
G1|West|BI S,DR P,CW P,BI P
H1|North-West|BI S,O P,CW P,O P,CW P
A2|North|SUT P,IN P,O P,SUT P,O P
B2|North-East|DR,SUT,IN,DR
C2|East|O P,DR P,IN P,O P
D2|South-East|IN P,SUT S,DR S,O S
E2|South|O P,DR P,SUT P,O P,SUT P
F2|South-West|IN P,DR P,SUT P,O P,DR P
G2|West|DR P,IN S,SUT S,DR P
H2|North-West|SUT P,O P,DR P,SUT P,DR P
`
  .trim()
  .split('\n')
  .map((line) => {
    const [id, direction, seq] = line.split('|') as [string, string, string];
    return {
      id,
      direction,
      marks: seq.split(',').map((tok) => {
        const [mark, side] = tok.split(' ');
        return side ? { mark: mark!, side: side === 'P' ? 'port' : 'starboard' } : { mark: mark! };
      }),
    };
  });

const WINDS: Record<string, number> = {
  North: 0, 'North East': 45, 'North-East': 45, East: 90, 'South East': 135, 'South-East': 135,
  South: 180, 'South West': 225, 'South-West': 225, West: 270, 'North West': 315, 'North-West': 315,
};

describe('the Clontarf 2026 marks file', () => {
  it('letters the twelve marks of the card’s legend, in its order', () => {
    expect(marks.marks.map((m) => `${m.id}=${m.name}`)).toEqual([
      'BI=Bull Island', 'CH=Churn', 'CW=Causeway', 'DR=Drumleck', 'H=Hub', 'IN=Inner',
      'NB=North Bank', 'O=Outer', 'S=Spit', 'SUT=Sutton', 'SW=South West', 'V=Vernon',
    ]);
  });

  it('positions the six bay marks from Dublin Port’s notice and none of the harbour marks', () => {
    const byId = new Map(marks.marks.map((m) => [m.id, m]));
    expect(byId.get('SUT')!.position).toEqual({ lat: 53.363333, lng: -6.13 });
    expect(byId.get('BI')!.position).toEqual({ lat: 53.351667, lng: -6.146667 });
    expect(byId.get('CW')!.position).toEqual({ lat: 53.358333, lng: -6.14 });
    for (const id of ['CH', 'H', 'NB', 'S', 'SW', 'V']) {
      expect(byId.get(id)!.position, id).toBeUndefined();
      expect(byId.get(id)!.placement, id).toMatch(/harbour marks/);
    }
    expect(marks.marks.filter((m) => m.position)).toHaveLength(6);
  });
});

describe('the Cruiser Course Card 2026', () => {
  it('has the 24 courses as printed, with no start line', () => {
    expect(cruiser.startLine).toBeUndefined();
    expect(cruiser.finish).toBeUndefined();
    expect(cruiser.courses.map((c) => c.id)).toEqual(CRUISER.map((c) => c.id));
    for (const p of CRUISER) {
      expect(printed(cruiser, p.id), p.id).toEqual(p.marks);
      const course = cruiser.courses.find((c) => c.id === p.id)!;
      expect(course.distanceNm, p.id).toBe(p.length);
      const plain = p.direction.replace(' (inner)', '');
      expect(course.windDirectionDeg, p.id).toBe(plain in WINDS ? WINDS[plain] : undefined);
    }
  });

  it('keeps every course’s direction and length class as printed in a note', () => {
    expect(cruiser.notes![0]!.title).toBe('Directions and lengths, as printed');
    const lines = cruiser.notes![0]!.text.split('\n');
    expect(lines[0]).toBe('Course 1: NW+W+SW, Short (4).');
    expect(lines[20]).toBe('Course 21: West (inner), Short (3.3).');
  });

  it('computes legs only where the marks are placed', () => {
    // Course 17 rounds two bay marks between harbour marks the club does not place.
    expect(() => courseLegs(cruiser, marks, '17', {})).toThrow(/no position for mark "V" \(One of the club's harbour marks/);
    const positions = { V: { lat: 53.36, lng: -6.19 }, NB: { lat: 53.35, lng: -6.17 }, CH: { lat: 53.345, lng: -6.155 } };
    const legs = courseLegs(cruiser, marks, '17', { marks: positions });
    expect(legs.map((l) => l.to.mark)).toEqual(['NB', 'CH', 'BI', 'IN', 'CH', 'NB']);
  });
});

describe('the East Coast Bilge Keel Championship 2026 courses', () => {
  it('are the sixteen of SI 12.1, each from the start line and back to it', () => {
    expect(ecbkc.courses.map((c) => c.id)).toEqual(ECBKC.map((c) => c.id));
    expect(ecbkc.startLine).toMatchObject({ id: 'SL', source: 'East Coast Bilge Keel Championship 2026 sailing instructions 7.1 and 7.2' });
    expect(ecbkc.startLine!.placement).toMatch(/^The start Line: shall be between the mainmast of the committee boat and an Outer Pin-end mark/);
    for (const p of ECBKC) {
      const course = ecbkc.courses.find((c) => c.id === p.id)!;
      expect(course.marks[0], p.id).toEqual({ mark: 'SL' });
      expect(course.marks[course.marks.length - 1], p.id).toEqual({ mark: 'SL' });
      expect(course.marks.slice(1, -1), p.id).toEqual(p.marks);
      expect(course.windDirectionDeg, p.id).toBe(WINDS[p.direction]);
    }
  });

  it('is fully placed: every course computes once the line is given', () => {
    const line = { lat: 53.352, lng: -6.13 };
    for (const course of ecbkc.courses) {
      const legs = courseLegs(ecbkc, marks, course.id, { marks: { SL: line } });
      expect(legs, course.id).toHaveLength(course.marks.length - 1);
      expect(legs[legs.length - 1]!.to.position, course.id).toEqual(line);
    }
  });

  it('carries 8.1, 12.2 and 12.3 as notes', () => {
    expect(ecbkc.notes!.map((n) => n.title)).toEqual(['8.1', '12.2', '12.3']);
    expect(ecbkc.notes![0]!.text).toMatch(/^The finish line will be the same line as the start line/);
    expect(ecbkc.notes![1]!.text).toMatch(/^START-FINISH LINE & 1st LEG/);
  });
});
