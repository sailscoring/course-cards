import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseCourseCardFile, parseMarksFile } from '../src/index';
import { formatPosition, renderCardHtml, type MapBackground } from '../tools/card-html';

function load(rel: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, '..', 'data', 'hyc', 'al-2025', rel), 'utf-8'));
}

const marks = parseMarksFile(load('marks.json'));
const inshore = parseCourseCardFile(load('inshore.json'));

describe('renderCardHtml', () => {
  const html = renderCardHtml(inshore, marks);

  it('is a self-contained page with the card’s name and sources', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain(`<title>${inshore.name}</title>`);
    expect(html).toContain(inshore.source!);
    expect(html).toContain(marks.source!);
    expect(html).not.toMatch(/<script|<link/);
  });

  it('lays HYC’s three-digit courses out as the printed 36 × 5 grid', () => {
    expect((html.match(/<th class="row">\d\d<\/th>/g) ?? []).length).toBe(36);
    expect(html).toContain('<th>1</th><th>2</th><th>3</th><th>4</th><th>5</th>');
    // course 041: Z W C H [S] F — S boxed and green
    expect(html).toContain(
      '<td title="Course 041"><span class="port">Z</span> <span class="port">W</span> <span class="port">C</span> ' +
        '<span class="port">H</span> <span class="stbd passing">S</span> <span class="port">F</span></td>',
    );
  });

  it('lists every mark and maps the fixed ones', () => {
    for (const m of marks.marks) expect(html).toContain(`<th>${m.id}</th><td>${m.name}</td>`);
    expect(html).toContain('53° 26.76′ N 006° 03.26′ W'); // Apex, as the sheet prints it
    expect(html).toContain('<em>Upwind of Start Line</em>');
    expect((html.match(/<circle /g) ?? []).length).toBe(21);
    expect(html).toContain('1 NM');
    expect(html).not.toContain('<image');
  });

  it('embeds the chart background and its attribution when given one', () => {
    const png = join(__dirname, '..', 'data', 'hyc', 'al-2025', 'map', 'background.png');
    const sidecar = JSON.parse(readFileSync(png.replace(/\.png$/, '.json'), 'utf-8')) as Omit<MapBackground, 'png'>;
    const background: MapBackground = { ...sidecar, png: readFileSync(png) };
    const out = renderCardHtml(inshore, marks, { background });
    expect(out).toContain(`viewBox="0 0 ${sidecar.width} ${sidecar.height}"`);
    expect(out).toContain('<image href="data:image/png;base64,iVBOR');
    expect(out.match(/OpenSeaMap contributors/g)?.length).toBeGreaterThanOrEqual(2);
    // Island sits inside the image, a little east of centre
    const island = marks.marks.find((m) => m.id === 'I')!.position!;
    const { west, east } = sidecar.bounds;
    expect(island.lng).toBeGreaterThan(west);
    expect(island.lng).toBeLessThan(east);
  });

  it('tabulates true bearings and distances between the fixed marks', () => {
    expect(html).toContain('Bearings between marks (° true)');
    expect(html).toContain('Distances between marks (NM)');
    // 21 fixed marks → 21 rows of 21 cells in each table, diagonal blank
    expect((html.match(/<td><\/td>/g) ?? []).length).toBe(2 * 21);
  });

  it('carries the club’s notes', () => {
    expect(html).toContain('<h2>Navigation Marks and Obstructions</h2>');
    expect(html).toContain('<h2>Course Selection</h2>');
    expect(html).toContain('Therefore Course 073 is the third course in from the left on line 07');
  });

  it('falls back to a list for cards not numbered as a grid', () => {
    const card = { formatVersion: 1, courses: [{ id: 'Olympic', marks: [{ mark: 'A' }, { mark: 'K' }] }] };
    const out = renderCardHtml(card, marks, { title: 'Test' });
    expect(out).toContain('<th>Course</th><th>Marks</th>');
    expect(out).toContain('<th class="row">Olympic</th>');
  });
});

describe('formatPosition', () => {
  it('prints degrees and decimal minutes with hemisphere', () => {
    expect(formatPosition({ lat: 53.446, lng: -6.054333 })).toBe('53° 26.76′ N 006° 03.26′ W');
    expect(formatPosition({ lat: -33.85, lng: 151.2 })).toBe('33° 51.00′ S 151° 12.00′ E');
    expect(formatPosition({ lat: 53.99999, lng: 0 })).toBe('54° 00.00′ N 000° 00.00′ E');
  });
});
