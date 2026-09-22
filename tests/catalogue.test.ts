import { describe, expect, it } from 'vitest';

import { CatalogueError, parseCatalogue } from '../src/index';

const site = 'https://courses.sailscoring.ie';
const index = {
  version: '0.3.0',
  generated: '2026-09-07',
  formatVersion: 2,
  site,
  repository: 'https://github.com/sailscoring/course-cards',
  zip: `${site}/v0.3.0/course-cards-v0.3.0.zip`,
  sets: [
    {
      path: 'hyc/al-2026',
      club: 'Howth Yacht Club',
      event: 'Autumn League 2026',
      marks: { file: 'hyc/al-2026/marks.json', count: 23, url: `${site}/v0.3.0/hyc/al-2026/marks.json` },
      cards: [
        {
          id: 'offshore',
          name: 'Autumn League 2026 course card, offshore committee vessel starts',
          courses: 72,
          json: 'hyc/al-2026/offshore.json',
          html: 'hyc/al-2026/offshore.html',
          url: `${site}/v0.3.0/hyc/al-2026/offshore.json`,
          page: `${site}/v0.3.0/hyc/al-2026/offshore.html`,
        },
      ],
      map: {
        svg: 'hyc/al-2026/map/marks.svg',
        background: 'hyc/al-2026/map/background.png',
        layers: ['osm', 'openseamap'],
        placement: {
          bounds: { south: 53.378333, west: -6.117948, north: 53.465167, east: -6.004886 },
          width: 1317,
          height: 1698,
          zoom: 14,
          attribution: '© OpenStreetMap contributors · © OpenSeaMap contributors',
        },
      },
    },
  ],
};

describe('parseCatalogue', () => {
  it('reads a release index and keeps only what the catalogue defines', () => {
    const catalogue = parseCatalogue({ ...index, extra: true });
    expect(catalogue).toEqual(index);
    expect(catalogue.sets[0]!.cards[0]!.url).toBe(`${site}/v0.3.0/hyc/al-2026/offshore.json`);
  });

  it('a set without a chart, and a card without a public source, are fine', () => {
    const { map: _map, ...set } = index.sets[0]!;
    void _map;
    const catalogue = parseCatalogue({ ...index, sets: [set] });
    expect(catalogue.sets[0]!.map).toBeUndefined();
    expect(catalogue.sets[0]!.cards[0]!.source).toBeUndefined();
  });

  it('refuses what is not a catalogue, naming the field', () => {
    expect(() => parseCatalogue(null)).toThrow(CatalogueError);
    expect(() => parseCatalogue({ ...index, sets: 'none' })).toThrow('catalogue.sets: expected an array');
    expect(() => parseCatalogue({ ...index, version: 3 })).toThrow('catalogue.version: expected a string');
    const badCard = { ...index.sets[0]!.cards[0]!, courses: '72' };
    expect(() => parseCatalogue({ ...index, sets: [{ ...index.sets[0]!, cards: [badCard] }] })).toThrow(
      'catalogue.sets[0].cards[0].courses: expected a number',
    );
    expect(() => parseCatalogue({ ...index, sets: [{ ...index.sets[0]!, marks: { file: 'x' } }] })).toThrow(
      'catalogue.sets[0].marks.count',
    );
    // Half a placement is worse than none: a chart is placeable or it is
    // not, so every field of one is required once there is one at all.
    const { bounds: _bounds, ...half } = index.sets[0]!.map!.placement!;
    void _bounds;
    const withHalf = { ...index.sets[0]!, map: { ...index.sets[0]!.map!, placement: half } };
    expect(() => parseCatalogue({ ...index, sets: [withHalf] })).toThrow(
      'catalogue.sets[0].map.placement.bounds: expected an object',
    );
    const badCredit = {
      ...index.sets[0]!,
      map: { ...index.sets[0]!.map!, placement: { ...index.sets[0]!.map!.placement!, attribution: 12 } },
    };
    expect(() => parseCatalogue({ ...index, sets: [badCredit] })).toThrow(
      'catalogue.sets[0].map.placement.attribution: expected a string',
    );
  });

  it('reads a release published before charts could be placed', () => {
    // 0.6.0 and 0.7.0 list a set's chart as paths alone, and both are still
    // served under their own version path. A consumer on a newer library
    // pinned to one of those reads it and has no chart to draw on — it does
    // not fail to read the release.
    const { placement: _placement, ...paths } = index.sets[0]!.map!;
    void _placement;
    const older = parseCatalogue({ ...index, sets: [{ ...index.sets[0]!, map: paths }] });
    expect(older.sets[0]!.map!.background).toBe('hyc/al-2026/map/background.png');
    expect(older.sets[0]!.map!.placement).toBeUndefined();
  });
});
