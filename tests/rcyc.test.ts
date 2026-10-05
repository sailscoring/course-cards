import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { courseLegs, parseCourseCardFile, parseMarksFile, parseRoutingFile, printedMarks } from '../src/index';

function load(rel: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, '..', 'data', 'rcyc', 'keelboat-2026', rel), 'utf-8'));
}

const marks = parseMarksFile(load('marks.json'));
const card = parseCourseCardFile(load('keelboat.json'));
const byId = new Map(marks.marks.map((m) => [m.id, m]));
const routing = parseRoutingFile(load('routing.json'));

// The card's courses in its reading order — left column then right, page 2 then page 3.
const ORDER = '1 2 3 4 5 6 7 71 74 8 9 10 11 75 76 77 12 13 14 78 15 16 17 18 19 79 80 20 21 22 23 81 82 83 72 24 25 73 26 27'.split(' ');

// A dozen courses read from the printed card: the rounds run together, "P"/"S" the sides,
// "|Cage" the finishing line laid at Cage crossed mid-course, then the last distance printed.
const PRINTED: Array<[string, string, number | undefined, number | undefined]> = [
  ['1', 'Ringabella P, W2 P, Cage S, No.7 S, Cage P, Dosco P', 9.8, undefined],
  ['2', 'Dutchman P, W2 P, Cage S, No.7 S, Cage P, Dosco P', 8, undefined],
  ['4', 'No.13 S, No.11 S, No.10 P, Dosco S, Cage P, W4 S, Cage S, No.5 P, No.14 S, Dosco S', 11, 0],
  ['12', 'E2 P, No.14 S, Dosco S, Cage S, No.7 S, No.5 S, Cage S, No.10 P', 3, 180],
  ['23', 'No.8 P, No.3 S, W4 S, Cage S, Dosco P, No.8 P, No.5 S', undefined, 270],
  ['71', 'No.7 P, No.10 S, EF4 S, No.10 P, Dosco S, Cage S, No.7 S, No.5 S', 8.4, 45],
  ['73', 'White Bay P, Cage S, Dosco S, White Bay S, Cage S, White Bay P, No.8 S, No.5 S', 7.9, 315],
  ['75', 'No.8 P, Curlane S, No.12 S, No.8 S, Curlane S, No.10 S, Cage S, Curlane S', 6.2, 90],
  ['76', 'No.16 S, EF2 P, No.11 P, No.5 P, |Cage, No.8 P', 7, 90],
  ['81', 'No.16 S, EF2 S, No.11 P, No.5 S, |Cage, No.8 S', 6.8, 270],
  ['82', 'Harp P, No.3 P, Cage S, No.8 S', 6, 270],
  ['27', 'E1 P, No.6 S, No.3 P, Cage S, No.5 P, No.10 S, No.3 S', 8.4, 315],
];

function sequence(id: string): string {
  return printedMarks(card, id)
    .slice(0, -1) // the finish, SL
    .map((m) => (m.passing ? `|${m.mark}` : `${m.mark} ${m.side === 'port' ? 'P' : 'S'}`))
    .join(', ');
}

describe('the Royal Cork 2026 marks file', () => {
  it('positions three Port of Cork laid race marks from the Autumn League Sailing Instructions 36', () => {
    // 36 prints "51º 47’ .20 N 008º 14’ .28 W" under "Harp Mark".
    expect(byId.get('Harp')).toMatchObject({ name: 'Harp', shape: 'conical', color: 'yellow', position: { lat: 51.786667, lng: -8.238 } });
    expect(byId.get('Ringabella')!.position).toEqual({ lat: 51.773167, lng: -8.296333 });
    expect(byId.get('Dosco')).toMatchObject({ name: 'Dosco (Corkbeg)', position: { lat: 51.820833, lng: -8.263833 } });
    expect(marks.marks.filter((m) => m.position).slice(0, 4).map((m) => m.id)).toEqual(['Harp', 'Ringabella', 'Dosco', 'East Mark']);
  });

  it('names the Autumn League instructions as its source, and 36 says the three are approximate', () => {
    expect(marks.source).toBe('https://www.royalcork.com/wp-content/uploads/2026/09/Royal-Cork-Yacht-Club-Keelboat-Autumn-League-2026-Sailing-Instructions-Final.pdf');
    for (const id of ['Harp', 'Ringabella', 'Dosco']) expect(byId.get(id)!.source, id).toBeUndefined();
    expect(marks.notes).toEqual([
      { title: 'Positions', text: 'Port of Cork Laid Race Marks are yellow permanently laid and may be in these approximate locations.' },
    ]);
  });

  it('takes East Mark, which 36 does not list, from the General Sailing Instructions 22.3', () => {
    expect(byId.get('East Mark')).toMatchObject({
      name: 'East Mark (Formerly Mark B)',
      position: { lat: 51.771833, lng: -8.236333 },
      source: 'General Sailing Instructions for Royal Cork Yacht Club Keelboat Racing 2026, 22.3',
    });
  });

  it('positions nineteen harbour navigation buoys from eOceanic, quoting the row that numbers each', () => {
    expect(marks.marks).toHaveLength(30);
    // 51°48.130'N 8°15.615'W, "White Bay No.3."; 51°50.828'N 8°17.285'W, "Cork harbour Cobh Road No.20".
    expect(byId.get('No.3')).toMatchObject({
      position: { lat: 51.802167, lng: -8.26025 },
      source: "eOceanic's list of Irish marks (eoceanic.com/weather/ireland, 5 October 2026): “White Bay No.3.”",
    });
    expect(byId.get('No.20')!.position).toEqual({ lat: 51.847133, lng: -8.288083 });
    expect(byId.get('E1')!.position).toEqual({ lat: 51.794517, lng: -8.258917 });
    expect(byId.get('W4')!.position).toEqual({ lat: 51.800517, lng: -8.26565 });
    // A placed mark carries no placement: that field is for marks laid per race.
    for (const id of ['No.3', 'No.20', 'E1', 'W4']) expect(byId.get(id)!.placement, id).toBeUndefined();
    expect(marks.marks.filter((m) => m.position)).toHaveLength(27);
    const listed = marks.marks.filter((m) => m.source?.startsWith("eOceanic's list of Irish marks")).map((m) => m.id);
    expect(listed).toEqual(['No.3', 'No.5', 'No.6', 'No.7', 'No.8', 'No.9', 'No.10', 'No.11', 'No.12', 'No.13', 'No.14', 'No.16', 'No.18', 'No.20', 'E1', 'E2', 'W1', 'W2', 'W4']);
    // Each row eOceanic is read from prints the buoy's number.
    for (const id of listed) {
      const row = byId.get(id)!.source!.match(/“(.*)”$/)![1]!;
      expect(row.split(' ').map((w) => w.replace(/\.$/, '')), id).toContain(id);
    }
  });

  it('places E4 from Pat Tanner’s photograph and plotter readings', () => {
    // 51°47.9305'N 8°15.7541'W.
    expect(byId.get('E4')!.position).toEqual({ lat: 51.798842, lng: -8.262568 });
    expect(byId.get('E4')!.source).toMatch(/^Pat Tanner, Cork Harbour workbook v3\.19 .*Navionics and B&G Vulcan/);
    expect(marks.marks.filter((m) => m.source === 'OpenStreetMap')).toEqual([]);
  });

  it('places Cage from the position the club gave, not from OpenStreetMap', () => {
    // 51°48.834'N 8°16.968'W. Buoy C1 is in no publication and in no OSM node
    // either — the nearest is 850 m off — so it is here on the club's word.
    expect(byId.get('Cage')).toMatchObject({
      name: 'Cage (C1)', shape: 'conical', color: 'green',
      position: { lat: 51.8139, lng: -8.2828 },
      source: 'Royal Cork Yacht Club correspondence',
    });
    expect(byId.get('Cage')!.placement).toBeUndefined();
  });

  it('places EF2 from the position the club gave', () => {
    // 51°50.631'N 8°14.238'W.
    expect(byId.get('EF2')).toMatchObject({ position: { lat: 51.84385, lng: -8.2373 }, source: 'Royal Cork Yacht Club correspondence' });
    expect(byId.get('EF2')!.placement).toBeUndefined();
  });

  it('places EF4, a race mark, from Pat Tanner’s workbook', () => {
    // 51°50.720'N 8°14.740'W.
    expect(byId.get('EF4')).toMatchObject({ name: 'EF4, a race mark', position: { lat: 51.845333, lng: -8.245667 } });
    expect(byId.get('EF4')!.source).toMatch(/^Pat Tanner, Cork Harbour workbook v3\.19 .*an RCYC reference it does not name$/);
    expect(byId.get('EF4')!.placement).toBeUndefined();
  });

  it('leaves unplaced the marks the card only describes', () => {
    expect(byId.get('Dutchman')!.placement).toMatch(/approx\. 2 cables SE of the Dutchman Rock/);
    expect(byId.get('Curlane')!.placement).toBe('“Curlane” will be a mark laid on the Curlane Bank.');
    expect(byId.get('White Bay')!.position).toBeUndefined();
    // A source speaks for a position, and these have none.
    for (const id of ['Dutchman', 'Curlane', 'White Bay']) expect(byId.get(id)!.source, id).toBeUndefined();
    const named = new Set(card.courses.flatMap((c) => c.marks.map((m) => m.mark)));
    for (const id of named) if (id !== 'SL') expect(byId.has(id), id).toBe(true);
  });

  it('runs each series of buoys from the entrance inward, no two in one place', () => {
    // The numbering runs inbound, and each series is checked end to end: the
    // lowest number lies nearer the harbour mouth than the highest. Buoy by
    // buoy the claim does not hold — the odd and even numbers run up opposite
    // sides of a channel that bends west past Cobh, so no distance from one
    // point rises monotonically along either, and asserting that it does would
    // take a channel centreline this data set has no source for.
    const roches = { lat: 51.793, lng: -8.2547 };
    const nm = (p: { lat: number; lng: number }) =>
      Math.hypot((p.lat - roches.lat) * 60, (p.lng - roches.lng) * 60 * Math.cos((p.lat * Math.PI) / 180));
    const series: [string, RegExp, number?][] = [
      ['odd channel', /^No\.(\d+)$/, 1],
      ['even channel', /^No\.(\d+)$/, 0],
      ['entrance', /^E(\d+)$/],
      ['west', /^W(\d+)$/],
    ];
    for (const [label, re, parity] of series) {
      const run = marks.marks
        .map((m) => ({ m, n: Number(re.exec(m.id)?.[1]) }))
        .filter((x) => !Number.isNaN(x.n) && x.m.position && (parity === undefined || x.n % 2 === parity))
        .sort((a, b) => a.n - b.n);
      expect(run.length, label).toBeGreaterThan(2);
      const first = run[0]!.m, last = run[run.length - 1]!.m;
      expect(nm(first.position!), `${label}: ${first.id} before ${last.id}`).toBeLessThan(nm(last.position!));
    }
    const placed = marks.marks.filter((m) => m.position);
    expect(new Set(placed.map((m) => `${m.position!.lat},${m.position!.lng}`)).size).toBe(placed.length);
    for (const m of placed) {
      expect(m.position!.lat, m.id).toBeGreaterThan(51.76);
      expect(m.position!.lat, m.id).toBeLessThan(51.87);
      expect(m.position!.lng, m.id).toBeGreaterThan(-8.31);
      expect(m.position!.lng, m.id).toBeLessThan(-8.22);
    }
  });
});

describe('the Keelboat Racing Course Card 2026', () => {
  it('has the forty courses in the card’s reading order', () => {
    expect(card.courses.map((c) => c.id)).toEqual(ORDER);
  });

  it('starts every course at the General Sailing Instructions’ line and finishes it there', () => {
    expect(card.startLine).toMatchObject({ id: 'SL', source: 'General Sailing Instructions for Royal Cork Yacht Club Keelboat Racing 2026, 26' });
    expect(card.startLine!.placement).toMatch(/^A number of Start\/ Finish lines may be used\. These include: 26\.1 Grassy Walk Line/);
    for (const course of card.courses) {
      expect(course.marks[0], course.id).toEqual({ mark: 'SL' });
      expect(course.marks[course.marks.length - 1], course.id).toEqual({ mark: 'SL' });
    }
  });

  it('reads the rounds as printed, run together, with the last cumulative distance', () => {
    for (const [id, seq, nm, wind] of PRINTED) {
      expect(sequence(id), id).toBe(seq);
      const course = card.courses.find((c) => c.id === id)!;
      expect(course.distanceNm, id).toBe(nm);
      expect(course.windDirectionDeg, id).toBe(wind);
    }
  });

  it('keeps each course’s rounds, distances and notes in the first note', () => {
    const lines = card.notes![0]!.text.split('\n');
    expect(card.notes![0]!.title).toBe('Courses as printed, by round');
    expect(lines).toHaveLength(40);
    expect(lines[0]).toBe('Course 1 (Admiral’s Choice), S/SW OR N/NE WIND: Round One: Ringabella (P) – W2 (P) - Cage (S) (6nm); Round Two: No.7 (S) - Cage (P) (8nm); Round Three: Dosco (P) - Finish. (9.8nm).');
    expect(lines.find((l) => l.startsWith('Course 2 '))).toMatch(/Note: The Dutchman mark will be a ‘laid’ club racing mark/);
    expect(lines.find((l) => l.startsWith('Course 72 '))).toMatch(/“Curlane” will be a mark laid on the Curlane Bank\./);
    expect(lines.find((l) => l.startsWith('Course 23 '))).toBe('Course 23 **, W WIND: Round One: No.8 (P) – No.3 (S) – W4 (S) - Cage (S); Round Two: Dosco (P) – No.8 (P) – No.5 (S) - Finish.');
    expect(card.notes!.map((n) => n.title).slice(1)).toEqual(['IMPORTANT NOTES', 'COMMITTEE VESSEL', 'GRASSY WALK LINE']);
  });

  it('needs from the caller only the line, for thirty-five of the forty courses', () => {
    const SL = { lat: 51.81155, lng: -8.29461 };
    const legs = courseLegs(card, marks, '1', { marks: { SL } });
    expect(legs.map((l) => l.to.mark)).toEqual(['Ringabella', 'W2', 'Cage', 'No.7', 'Cage', 'Dosco', 'SL']);
    // Every mark of course 1 but the line comes from the file, so these are real.
    expect(legs[1]!.distanceNm).toBeCloseTo(1.579, 2);
    expect(legs[3]!.distanceNm).toBeCloseTo(0.970, 2);

    const resolved = card.courses.filter((c) => {
      try { courseLegs(card, marks, c.id, { marks: { SL } }); return true; } catch { return false; }
    });
    expect(resolved).toHaveLength(35);
  });

  it('still asks the caller for the marks the card only describes', () => {
    const SL = { lat: 51.81155, lng: -8.29461 };
    expect(() => courseLegs(card, marks, '2', { marks: { SL } })).toThrow(/no position for mark "Dutchman"/);
    expect(() => courseLegs(card, marks, '73', { marks: { SL } })).toThrow(/no position for mark "White Bay"/);
    expect(() => courseLegs(card, marks, '75', { marks: { SL } })).toThrow(/no position for mark "Curlane" \(“Curlane” will be a mark laid/);
    const legs = courseLegs(card, marks, '2', { marks: { SL, Dutchman: { lat: 51.7847, lng: -8.283133 } } });
    expect(legs.map((l) => l.to.mark)).toContain('Dutchman');
  });
});

describe('the Cork Harbour routing overlay', () => {
  // Pat Tanner's Grassy Mid, where the overlay assumes a Grassy Walk start.
  const GRASSY = { lat: 51.811908, lng: -8.283267 };
  const shape = (id: string, SL = GRASSY) =>
    courseLegs(card, marks, id, { marks: { SL } }, routing).map((l) => `${l.from.mark}>${l.to.mark} ${l.review}`);

  it('is Pat Tanner’s workbook: eight waypoints, 45 passages and 79 direct pairs', () => {
    expect(routing.contributor).toBe('Pat Tanner');
    expect(routing.waypoints.map((w) => w.id)).toEqual([
      'RW_Fort_Davis', 'RW_Fort_Davis_South', 'RW_Rams_Head', 'RW_Refinery_North',
      'RW_Roches_Point', 'RW_Temblebreedy_Pier', 'RW_West_of_Refinery', 'RW_clear_spit_bank',
    ]);
    expect(routing.passages).toHaveLength(45);
    expect(routing.direct).toHaveLength(79);
  });

  it('assumes the start line at the Grassy Walk, or standing in for Dosco or No.8', () => {
    const lines = routing.assumed.filter((a) => a.mark === 'SL');
    expect(lines.map((a) => [a.id, a.as ?? a.position, a.toleranceM])).toEqual([
      ['SL@grassy-walk', GRASSY, 500],
      ['SL@dosco', 'Dosco', 500],
      ['SL@no8', 'No.8', 500],
    ]);
  });

  it('assumes every mark where the marks file has it, Cage apart', () => {
    for (const a of routing.assumed) {
      const mark = byId.get(a.mark);
      if (!a.position || !mark?.position) continue;
      const metres = Math.hypot((a.position.lat - mark.position.lat) * 111320, (a.position.lng - mark.position.lng) * 111320 * Math.cos(0.904));
      if (a.mark === 'Cage') expect(metres, a.mark).toBeGreaterThan(a.toleranceM);
      else expect(metres, a.mark).toBeLessThanOrEqual(a.toleranceM);
    }
  });

  it('routes course 1 from the Grassy Walk out past Rams Head to Ringabella', () => {
    expect(shape('1').slice(0, 5)).toEqual([
      'SL>RW_Temblebreedy_Pier passage',
      'RW_Temblebreedy_Pier>RW_Rams_Head passage',
      'RW_Rams_Head>W2 passage',
      'W2>Ringabella passage',
      'Ringabella>W2 direct',
    ]);
  });

  it('says nothing of a leg at Cage, which the workbook tested 39 m from the club’s position', () => {
    expect(shape('1').filter((l) => l.includes('Cage'))).toEqual([
      'W2>Cage unreviewed', 'Cage>No.7 unreviewed', 'No.7>Cage unreviewed', 'Cage>Dosco unreviewed',
    ]);
  });

  it('routes a committee-boat start near Dosco as Dosco: to Ringabella by W2', () => {
    const offDosco = { lat: 51.8225, lng: -8.2615 };
    expect(shape('1', offDosco).slice(0, 2)).toEqual(['SL>W2 passage', 'W2>Ringabella passage']);
  });
});
