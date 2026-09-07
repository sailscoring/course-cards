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
      event: 'Autumn League 2026 (draft cards)',
      marks: { file: 'hyc/al-2026/marks.json', count: 23, url: `${site}/v0.3.0/hyc/al-2026/marks.json` },
      cards: [
        {
          id: 'offshore',
          name: 'Autumn League 2026 course card, offshore — 6 September 2026 draft',
          courses: 72,
          json: 'hyc/al-2026/offshore.json',
          html: 'hyc/al-2026/offshore.html',
          url: `${site}/v0.3.0/hyc/al-2026/offshore.json`,
          page: `${site}/v0.3.0/hyc/al-2026/offshore.html`,
        },
      ],
      map: { svg: 'hyc/al-2026/map/marks.svg', background: 'hyc/al-2026/map/background.png', layers: ['osm', 'openseamap'] },
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
  });
});
