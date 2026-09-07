import { describe, expect, it } from 'vitest';

import { destination, renderCourseSvg, type DrawnMark } from '../src/index';

// A Saturday off Howth: the line, two windward marks laid inner and outer,
// and the club's fixed marks W, C, H and S.
const start = { lat: 53.4055, lng: -6.0675 };
const marks: DrawnMark[] = [
  { id: 'line', label: 'Start', position: start },
  { id: 'zo', label: 'Z', position: destination(start, 190, 1000) },
  { id: 'zi', label: 'Z′', position: destination(start, 190, 600) },
  { id: 'W', label: 'W', position: { lat: 53.416, lng: -6.101167 }, fixed: true },
  { id: 'C', label: 'C', position: { lat: 53.4225, lng: -6.0825 }, fixed: true },
  { id: 'H', label: 'H', position: { lat: 53.399, lng: -6.0505 }, fixed: true },
  { id: 'S', label: 'S', position: { lat: 53.408, lng: -6.0245 }, fixed: true },
];
const course = [
  { mark: 'line' },
  { mark: 'zo', side: 'port' as const },
  { mark: 'W', side: 'port' as const },
  { mark: 'C', side: 'port' as const },
  { mark: 'H', side: 'port' as const },
  { mark: 'S', side: 'starboard' as const, passing: true },
  { mark: 'line', side: 'port' as const },
];

describe('renderCourseSvg', () => {
  const svg = renderCourseSvg(marks, course);

  it('is one standalone, inert SVG element', () => {
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 ')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).not.toMatch(/<script|<style|<image|href=| id=| class=/);
    expect(svg).toContain('role="img"');
  });

  it('draws every mark, the laid ones hollow and the charted ones filled', () => {
    expect((svg.match(/<title>/g) ?? []).length).toBe(marks.length);
    expect((svg.match(/fill="#333" stroke="#fff"/g) ?? []).length).toBe(4);
    expect((svg.match(/fill="#fff" stroke="#d84315"/g) ?? []).length).toBe(3);
    for (const m of marks) expect(svg).toContain(`>${m.label}</text>`);
  });

  it('numbers the legs in order with their bearing and distance', () => {
    expect((svg.match(/<path d="M7 0L-5 5L-5 -5z"/g) ?? []).length).toBe(6);
    expect(svg).toMatch(/<tspan font-weight="700">1<\/tspan> 190° 0\.54 NM/);
    expect(svg).toMatch(/<tspan font-weight="700">6<\/tspan> \d{3}° \d+\.\d\d NM/);
    expect(svg).not.toMatch(/<tspan font-weight="700">7<\/tspan>/);
  });

  it('rings each rounding for its side, dashed for a passing mark', () => {
    expect((svg.match(/stroke="#c81e1e"/g) ?? []).length).toBe(5);
    expect(svg).toMatch(/stroke="#2e8b57" stroke-width="2\.5" stroke-dasharray="3\.0 3\.0"/);
  });

  it('carries a north arrow and a scale bar sized to the frame', () => {
    expect(svg).toMatch(/>N<\/text>/);
    expect(svg).toMatch(/>(1|0\.5|0\.2) NM<\/text>/);
    const tiny = renderCourseSvg([marks[0]!, marks[2]!], [{ mark: 'line' }, { mark: 'zi' }]);
    expect(tiny).toMatch(/>(1 cable|0\.2 NM)<\/text>/);
  });

  it('halos the highlighted mark', () => {
    expect(svg).not.toContain('#ffd54f');
    expect(renderCourseSvg(marks, course, { highlight: 'zi' })).toContain('#ffd54f');
  });

  it('draws the marks alone when there is no course, and nothing at all with no marks', () => {
    const alone = renderCourseSvg(marks);
    expect((alone.match(/<title>/g) ?? []).length).toBe(marks.length);
    expect(alone).not.toContain('#0b57d0');
    expect(alone).toContain('aria-label="Marks drawing"');
    expect(renderCourseSvg([])).toBe('');
    // one mark still gets a frame with a grid and a scale
    expect(renderCourseSvg([marks[0]!])).toMatch(/viewBox="0 0 640 \d+"/);
  });

  it('keeps the frame a sensible shape however the marks lie', () => {
    const tall = renderCourseSvg([marks[0]!, { id: 'far', label: 'F', position: { lat: start.lat + 0.3, lng: start.lng } }]);
    const wide = renderCourseSvg([marks[0]!, { id: 'far', label: 'F', position: { lat: start.lat, lng: start.lng + 0.5 } }]);
    for (const drawn of [tall, wide]) {
      const h = Number(drawn.match(/viewBox="0 0 640 (\d+)"/)![1]);
      expect(h).toBeGreaterThanOrEqual(0.6 * 640 - 1);
      expect(h).toBeLessThanOrEqual(1.4 * 640 + 1);
    }
    expect(renderCourseSvg(marks, course, { width: 320 })).toContain('viewBox="0 0 320 ');
  });

  it('makes a mistyped longitude obvious: the frame widens to a passage-race grid', () => {
    const slip = [...marks, { id: 'oops', label: 'X', position: { lat: 53.41, lng: -60.07 } }];
    const drawn = renderCourseSvg(slip, course);
    expect(drawn).toMatch(/>\d+° 00′ W</); // a whole-degree grid, not minutes
    expect(drawn).toContain('>X</text>');
  });

  it('skips a course entry naming a mark it was not given, drawing the rest', () => {
    const drawn = renderCourseSvg(marks, [{ mark: 'line' }, { mark: 'nowhere' }, { mark: 'W' }]);
    expect((drawn.match(/<path d="M7 0L-5 5L-5 -5z"/g) ?? []).length).toBe(0);
    expect(drawn).toContain('>W</text>');
  });
});
