import { describe, expect, it } from 'vitest';

import { destination, parseRoutingFile, renderCourseBackgroundSymbol, renderCourseSvg, type CourseBackground, type DrawnMark } from '../src/index';

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
    expect(svg).toMatch(/<tspan font-weight="700">1<\/tspan> 190°T 0\.54 NM/);
    expect(svg).toMatch(/<tspan font-weight="700">6<\/tspan> \d{3}°T \d+\.\d\d NM/);
    expect(svg).not.toMatch(/<tspan font-weight="700">7<\/tspan>/);
  });

  it('labels the bearings in magnetic when given the variation', () => {
    // 1.5° west: magnetic reads 1.5° more than true, and is rounded after
    // the variation is applied — the first leg is 189.6° true, so 191°M,
    // not 190 + 1.5 rounded.
    const m = renderCourseSvg(marks, course, { magneticVariationDeg: -1.5 });
    expect(m).toMatch(/<tspan font-weight="700">1<\/tspan> 191°M 0\.54 NM/);
    expect(m).not.toMatch(/\d°T /);
  });

  it('draws a leg a routing overlay routes through its waypoints, lettered, and a leg it does not speak for dashed', () => {
    // An overlay that sends W to C round a point to the west, finds C to H
    // direct, and says nothing of the rest.
    const routing = parseRoutingFile({
      formatVersion: 2,
      assumed: [
        { mark: 'W', position: marks[3]!.position, toleranceM: 20 },
        { mark: 'C', position: marks[4]!.position, toleranceM: 20 },
        { mark: 'H', position: marks[5]!.position, toleranceM: 20 },
      ],
      waypoints: [{ id: 'RW_West', position: { lat: 53.425, lng: -6.11 } }],
      passages: [{ from: 'W', to: 'C', via: ['RW_West'] }],
      direct: [{ from: 'C', to: 'H' }],
    });
    const routed = renderCourseSvg(marks, course, { routing });
    expect(routed).toMatch(/<tspan font-weight="700">3a<\/tspan> \d{3}°T/);
    expect(routed).toMatch(/<tspan font-weight="700">3b<\/tspan> \d{3}°T/);
    expect(routed).not.toMatch(/<tspan font-weight="700">3<\/tspan>/);
    expect(routed).toMatch(/<path d="[^"]+z" fill="#fff" stroke="#0b57d0"[^>]*><title>RW_West<\/title>/);
    // Seven legs drawn — 3 is two — of which 1, 2, 5 and 6 are unreviewed and dashed.
    expect((routed.match(/<path d="M7 0L-5 5L-5 -5z"/g) ?? []).length).toBe(7);
    expect((routed.match(/stroke="#0b57d0" stroke-width="[\d.]+" fill="none" stroke-dasharray/g) ?? []).length).toBe(4);
    // Without an overlay nothing is dashed and nothing lettered.
    expect(svg).not.toMatch(/stroke="#0b57d0" stroke-width="[\d.]+" fill="none" stroke-dasharray/);
    expect(svg).not.toMatch(/RW_West|3a/);
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

  // Howth's captured chart, as a data set ships it: the bounds and pixel size
  // of map/background.png, with bytes standing in for the image itself.
  const chart: CourseBackground = {
    png: Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 253, 254, 255]),
    bounds: { south: 53.378333, west: -6.117948, north: 53.465167, east: -6.004886 },
    width: 1317,
    height: 1698,
    attribution: '© OpenStreetMap contributors · © OpenSeaMap contributors',
  };

  it('draws the course on the club\'s chart, embedded and attributed', () => {
    const drawn = renderCourseSvg(marks, course, { background: chart });
    const image = drawn.match(/<image href="data:image\/png;base64,([A-Za-z0-9+/=]+)"[^>]*\/>/);
    expect(image).not.toBeNull();
    expect(Buffer.from(image![1]!, 'base64')).toEqual(Buffer.from(chart.png));
    // One raster and nothing else fetched: a published page must still make
    // no request of its own.
    expect((drawn.match(/<image /g) ?? []).length).toBe(1);
    expect((drawn.match(/href=/g) ?? []).length).toBe(1);
    expect(drawn).not.toMatch(/<script|<style| id=| class=/);
    expect(drawn).toContain('>© OpenStreetMap contributors · © OpenSeaMap contributors</text>');
    // Still the same drawing over it.
    for (const m of marks) expect(drawn).toContain(`>${m.label}</text>`);
  });

  it('places the chart by its own corners, so the frame crops it', () => {
    const drawn = renderCourseSvg(marks, course, { background: chart, width: 640 });
    const rect = drawn.match(/<image [^>]*x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"/);
    expect(rect).not.toBeNull();
    const [x, y, w, h] = rect!.slice(1).map(Number) as [number, number, number, number];
    // The capture covers far more ground than a windward-leeward off the
    // harbour, so it hangs well outside the frame on every side.
    expect(x).toBeLessThan(0);
    expect(y).toBeLessThan(0);
    expect(x + w).toBeGreaterThan(640);
    expect(y + h).toBeGreaterThan(Number(drawn.match(/viewBox="0 0 640 (\d+)"/)![1]));
    // And it keeps the image's aspect: the crop is of the view, not the
    // pixels, so a stretched chart would be a projection bug.
    expect(w / h).toBeCloseTo(chart.width / chart.height, 1);
  });

  it('leaves plain ground where the course runs off the chart', () => {
    // A mark laid five miles east of anything the club captured.
    const offshore = [...marks, { id: 'far', label: 'K', position: { lat: 53.41, lng: -5.85 } }];
    const drawn = renderCourseSvg(offshore, course, { background: chart });
    const rect = drawn.match(/<image [^>]*x="(-?[\d.]+)"[^>]*width="([\d.]+)"/)!;
    const width = Number(drawn.match(/viewBox="0 0 (\d+) /)![1]);
    // The chart stops short of the frame's eastern edge rather than being
    // stretched over it, and the mark beyond is still drawn.
    expect(Number(rect[1]) + Number(rect[2])).toBeLessThan(width);
    expect(drawn).toContain('>K</text>');
  });

  it('refers to a chart the page carries once, rather than embedding it', () => {
    const symbol = renderCourseBackgroundSymbol(chart, 'chart-hyc');
    const image = symbol.match(/<image href="data:image\/png;base64,([A-Za-z0-9+/=]+)" width="1317" height="1698"/);
    expect(image).not.toBeNull();
    expect(Buffer.from(image![1]!, 'base64')).toEqual(Buffer.from(chart.png));
    expect(symbol).toContain('<symbol id="chart-hyc" viewBox="0 0 1317 1698" preserveAspectRatio="none">');

    const embedded = renderCourseSvg(marks, course, { background: chart });
    const referred = renderCourseSvg(marks, course, { background: chart, backgroundSymbol: 'chart-hyc' });
    expect(referred).not.toContain('data:');
    // The same box either way: only what fills it differs.
    const box = (svg: string) => svg.match(/<(?:image|use) [^>]*?(x="[^"]+" y="[^"]+" width="[^"]+" height="[^"]+")/)![1];
    expect(referred).toMatch(/<use href="#chart-hyc" x=/);
    expect(box(referred)).toBe(box(embedded));
    expect(referred).toContain('>© OpenStreetMap contributors · © OpenSeaMap contributors</text>');
  });

  it('refers to no chart the course never reaches', () => {
    const elsewhere = [
      { id: 'a', label: 'A', position: { lat: 51.79, lng: -8.29 } },
      { id: 'b', label: 'B', position: { lat: 51.81, lng: -8.26 } },
    ];
    const drawn = renderCourseSvg(elsewhere, [{ mark: 'a' }, { mark: 'b' }], { background: chart, backgroundSymbol: 'chart-hyc' });
    expect(drawn).not.toMatch(/<use|href=/);
  });

  it('leaves out a chart of water the course never reaches', () => {
    // A club's marks in Cork drawn with Howth's chart: nothing of it would
    // show, and a few hundred kilobytes would ride on the page for nothing.
    const elsewhere = [
      { id: 'a', label: 'A', position: { lat: 51.79, lng: -8.29 } },
      { id: 'b', label: 'B', position: { lat: 51.81, lng: -8.26 } },
    ];
    const drawn = renderCourseSvg(elsewhere, [{ mark: 'a' }, { mark: 'b' }], { background: chart });
    expect(drawn).not.toMatch(/<image|href=/);
    // And with it, no attribution: nothing of theirs is shown.
    expect(drawn).not.toContain('OpenStreetMap');
    expect(drawn).toContain('>A</text>');
  });
});
