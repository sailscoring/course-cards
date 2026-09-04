import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseCourseCardFile, parseMarksFile } from '../src/index';
import { formatPosition, renderCardHtml, renderMarksMapSvg, type MapBackground } from '../tools/card-html';

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
    // course 041: Z W C H [S] F — S boxed and green, the cell a label around its radio button
    expect(html).toContain(
      '<td title="Course 041"><label><input type="radio" name="course" id="pick-041"><span>' +
        '<span class="port">Z</span> <span class="port">W</span> <span class="port">C</span> ' +
        '<span class="port">H</span> <span class="stbd passing">S</span> <span class="port">F</span></span></label></td>',
    );
  });

  it('draws every course on the chart, hidden until its radio button is picked', () => {
    expect((html.match(/<g class="course" id="course-/g) ?? []).length).toBe(inshore.courses.length);
    expect((html.match(/<div class="legs" id="legs-/g) ?? []).length).toBe(inshore.courses.length);
    expect(html).toContain('body:has(#pick-015:checked) #course-015, body:has(#pick-015:checked) #legs-015');
    expect(html).toContain('.course, .legs { display: none; }');
  });

  it('draws only the legs the card can place, a repeated leg in its own lane', () => {
    // 015: Z P C U P W P W S F — start→Z, Z→P and S→F cannot be placed; P→W is sailed twice
    const from = html.indexOf('<g class="course" id="course-015">');
    const overlay = html.slice(from, html.indexOf('</g>', from));
    expect((overlay.match(/<path class="leg"/g) ?? []).length).toBe(7);
    expect((overlay.match(/<use href="#ah"/g) ?? []).length).toBe(7);
    expect(overlay).toMatch(/<text class="ln"[^>]*>3<\/text>/);
    expect(overlay).toMatch(/<text class="ln"[^>]*>9<\/text>/);
    expect(overlay).not.toMatch(/<text class="ln"[^>]*>10<\/text>/);
    // rings: one per placed entry (P, C, U, P, W, P, W, S), none for Z or F
    expect((overlay.match(/<circle class="r[ps]"/g) ?? []).length).toBe(8);
    // 041's S is a passing mark: a dashed ring
    const from041 = html.indexOf('<g class="course" id="course-041">');
    expect(html.slice(from041, html.indexOf('</g>', from041))).toMatch(/<circle class="rs"[^>]*stroke-dasharray=/);
    // the second P→W lane sits further out than the first: different path coordinates
    const legs = [...overlay.matchAll(/<path class="leg" d="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(legs).size).toBe(legs.length);
  });

  it('tabulates each course’s legs, blank where the card cannot place them', () => {
    const table = html.slice(html.indexOf('<div class="legs" id="legs-015">'), html.indexOf('<div class="legs" id="legs-021">'));
    expect(table).toContain('<h3>Course 015</h3>');
    expect(table).toContain('<tr class="unplaced"><th>1</th><td>Start</td><td>Z</td><td>—</td><td>—</td></tr>');
    expect(table).toContain('<tr class="unplaced"><th>2</th><td>Z</td><td>P</td><td>—</td><td>—</td></tr>');
    expect(table).toContain('<tr><th>6</th><td>P</td><td>W</td><td>194</td><td>0.69</td></tr>');
    expect(table).toContain('<tr><th>7</th><td>W</td><td>P</td><td>014</td><td>0.69</td></tr>');
    expect(table).toContain('<tr class="unplaced"><th>10</th><td>S</td><td>F</td><td>—</td><td>—</td></tr>');
    expect(table).toContain('<td colspan="4">Legs between placed marks</td><td>6.64</td>');
    expect(table).toContain('has no position on the card');
  });

  it('lists every mark and maps the fixed ones', () => {
    for (const m of marks.marks) expect(html).toContain(`<th>${m.id}</th><td>${m.name}</td>`);
    expect(html).toContain('53° 26.76′ N 006° 03.26′ W'); // Apex, as the sheet prints it
    expect(html).toContain('<em>Upwind of Start Line</em>');
    expect((html.match(/<circle cx=/g) ?? []).length).toBe(21);
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

  it('lays DBSC’s lettered courses out as one section per letter', () => {
    const card = parseCourseCardFile(
      JSON.parse(readFileSync(join(__dirname, '..', 'data', 'dbsc', 'summer-2026', 'cc2-saturday-hut.json'), 'utf-8')),
    );
    const dbscMarks = parseMarksFile(
      JSON.parse(readFileSync(join(__dirname, '..', 'data', 'dbsc', 'summer-2026', 'marks.json'), 'utf-8')),
    );
    const out = renderCardHtml(card, dbscMarks);
    expect((out.match(/<table class="courses section">/g) ?? []).length).toBe(16);
    expect(out).toContain('<th class="row">B</th><th></th></tr></thead><tbody><tr><th class="row">1</th><td title="Course B1">');
    // B2: F B E G W J X — X boxed (passing), the rest by side
    expect(out).toContain(
      '<td title="Course B2"><label><input type="radio" name="course" id="pick-B2"><span>' +
        '<span class="port">F</span> <span class="stbd">B</span> <span class="stbd">E</span> ' +
        '<span class="stbd">G</span> <span class="stbd">W</span> <span class="port">J</span> <span class="port passing">X</span></span></label></td>',
    );
    // every DBSC mark is placed, so only the leg from the start line is blank
    const table = out.slice(out.indexOf('<div class="legs" id="legs-B2">'), out.indexOf('<div class="legs" id="legs-B3">'));
    expect(table).toContain('<tr class="unplaced"><th>1</th><td>Start</td><td>F</td><td>—</td><td>—</td></tr>');
    expect((table.match(/<tr><th>\d<\/th>/g) ?? []).length).toBe(6);
    // a two-colour mark gets its first colour's swatch
    expect(out).toContain('<span class="swatch" style="background:#f2d02d"></span>yellow/black');
  });

  it('falls back to a list for cards not numbered as a grid', () => {
    const card = { formatVersion: 1, courses: [{ id: 'Olympic', marks: [{ mark: 'A' }, { mark: 'K' }] }] };
    const out = renderCardHtml(card, marks, { title: 'Test' });
    expect(out).toContain('<th>Course</th><th>Marks</th>');
    expect(out).toContain('<th class="row">Olympic</th>');
  });
});

describe('renderMarksMapSvg', () => {
  it('is a standalone SVG of the fixed marks', () => {
    const svg = renderMarksMapSvg(marks);
    expect(svg.startsWith('<?xml version="1.0"')).toBe(true);
    expect(svg).toMatch(/<svg width="640" height="\d+" xmlns=/);
    expect((svg.match(/<circle /g) ?? []).length).toBe(21);
    expect(svg).not.toContain('class="course"');
  });
});

describe('formatPosition', () => {
  it('prints degrees and decimal minutes with hemisphere', () => {
    expect(formatPosition({ lat: 53.446, lng: -6.054333 })).toBe('53° 26.76′ N 006° 03.26′ W');
    expect(formatPosition({ lat: -33.85, lng: 151.2 })).toBe('33° 51.00′ S 151° 12.00′ E');
    expect(formatPosition({ lat: 53.99999, lng: 0 })).toBe('54° 00.00′ N 000° 00.00′ E');
  });
});
