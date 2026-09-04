/**
 * A course card as a self-contained HTML page: the course table as the club
 * prints it, each course drawn on a chart of the marks when it is picked,
 * with its legs' bearings and distances, mark-to-mark bearings and
 * distances, and the club's explanatory notes. No scripts — the picker is a
 * radio button per course and a CSS `:has()` rule — inline CSS and an
 * inline SVG map, so the page can be published anywhere as a file.
 *
 * Part of the artifact pipeline (see render-cards.ts), not of the published
 * library, which it consumes like any other client.
 */

import { bearingDeg, distanceNm } from '../src/index';
import type { Course, CourseCardFile, CourseMark, Mark, MarksFile, Note, Position } from '../src/index';

export interface RenderOptions {
  /** Page title; defaults to the card's name. */
  title?: string;
  /** Chart imagery under the marks; without it the map is a plain grid. */
  background?: MapBackground;
}

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 53.446 → "53° 26.76′ N" — the way a club prints a position. */
export function formatPosition(p: Position): string {
  const dm = (value: number, width: number): string => {
    const abs = Math.abs(value);
    let deg = Math.floor(abs);
    let min = (abs - deg) * 60;
    if (min >= 59.995) {
      deg += 1;
      min = 0;
    }
    return `${String(deg).padStart(width, '0')}° ${min.toFixed(2).padStart(5, '0')}′`;
  };
  return `${dm(p.lat, 2)} ${p.lat >= 0 ? 'N' : 'S'} ${dm(p.lng, 3)} ${p.lng >= 0 ? 'E' : 'W'}`;
}

const CSS = `
  body { font: 14px/1.4 system-ui, sans-serif; color: #111; background: #fff; margin: 0; padding: 1.5rem; max-width: 72rem; }
  h1 { font-size: 1.6rem; margin: 0 0 .25rem; }
  h2 { font-size: 1.2rem; margin: 2rem 0 .75rem; border-bottom: 1px solid #ccc; padding-bottom: .25rem; }
  .meta { color: #555; margin-bottom: 1rem; }
  .meta a { color: inherit; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #999; padding: .3rem .5rem; text-align: left; vertical-align: top; }
  th { background: #eee; font-weight: 600; }
  .courses td { font-family: ui-monospace, Menlo, Consolas, monospace; font-weight: 700; letter-spacing: .15em; word-spacing: .2em; line-height: 1.7; }
  .courses { width: 100%; table-layout: fixed; }
  .courses th.row, .courses thead th:first-child { width: 2.2em; text-align: center; font-family: ui-monospace, monospace; }
  .courses tr:nth-child(even) td { background: #fdf7d8; }
  .courses td { padding: 0; }
  .courses label { display: block; padding: .3rem .5rem; cursor: pointer; }
  .courses label:hover { background: #e6efff; }
  .courses input { position: absolute; opacity: 0; width: 0; height: 0; }
  .courses input:focus-visible + span { outline: 2px solid #0b57d0; }
  .courses td:has(input:checked) { background: #cfe0ff !important; box-shadow: inset 0 0 0 2px #0b57d0; }
  .courses-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(20rem, 30rem); gap: 1.5rem; align-items: start; }
  .course-view { position: sticky; top: 0; max-height: 100vh; overflow-y: auto; }
  @media (max-width: 64rem) {
    .courses-layout { grid-template-columns: 1fr; }
    .course-view { order: -1; max-height: 50vh; background: #fff; border-bottom: 1px solid #ccc; z-index: 1; }
    .map svg { max-height: 36vh; width: auto; max-width: 100%; }
  }
  .course, .legs { display: none; }
  .legs h3 { font-size: 1rem; margin: .75rem 0 .25rem; }
  .legs .unplaced td { color: #777; }
  .legs tfoot td { font-weight: 700; }
  .legs p { color: #555; font-size: 12px; margin: .3rem 0 0; }
  .pick { color: #555; font-size: 12px; }
  body:has(.courses input:checked) .pick { display: none; }
  .leg { fill: none; stroke: #0b57d0; }
  .ah { fill: #0b57d0; }
  .ln { fill: #0b57d0; stroke: #fff; paint-order: stroke; font-weight: 700; text-anchor: middle; }
  .rp { fill: none; stroke: #c81e1e; }
  .rs { fill: none; stroke: #1a8a3c; }
  .rn { fill: none; stroke: #333; }
  .sections { display: grid; grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr)); gap: .75rem 1.5rem; }
  .port { color: #c81e1e; }
  .stbd { color: #1a8a3c; }
  .passing { outline: 1.5px solid #222; outline-offset: 1px; }
  .legend { margin: .75rem 0 0; color: #333; }
  .legend .passing { margin: 0 .3em; }
  .numbers td, .numbers th { text-align: right; font-family: ui-monospace, monospace; font-size: 12px; padding: .15rem .35rem; }
  .numbers th:first-child { text-align: center; }
  .scroll { overflow-x: auto; }
  .map { margin: 0; }
  .map svg { width: 100%; height: auto; border: 1px solid #ccc; background: #f4f9fd; }
  .map figcaption { color: #555; font-size: 12px; margin-top: .3rem; }
  .note p { margin: .3rem 0; max-width: 46rem; }
  .swatch { display: inline-block; width: .8em; height: .8em; border: 1px solid #555; vertical-align: -1px; margin-right: .3em; }
  @media print { body { padding: 0; } h2 { break-after: avoid; } .course-view { position: static; max-height: none; overflow: visible; } }
`;

/** An HTML id fragment for a course: its id with anything but letters and
 *  digits spelled as its code, so "041" and "B3" survive and odd ids do too. */
function courseKey(course: Course): string {
  return course.id.replace(/[^A-Za-z0-9]/g, (c) => `_${c.charCodeAt(0).toString(16)}`);
}

/** The course's marks as printed, wrapped in a label around the radio button
 *  that picks the course for the chart. */
function courseCell(course: Course): string {
  const seq = course.marks
    .map((m) => {
      const classes = [m.side === 'starboard' ? 'stbd' : m.side === 'port' ? 'port' : '', m.passing ? 'passing' : '']
        .filter(Boolean)
        .join(' ');
      return `<span class="${classes}">${esc(m.mark)}</span>`;
    })
    .join(' ');
  return `<label><input type="radio" name="course" id="pick-${courseKey(course)}"><span>${seq}</span></label>`;
}

/** Cards numbered like HYC's — two digits of row, one of column — lay out as
 *  the printed grid; cards lettered like DBSC's — a letter for the group, a
 *  digit for the course — as the printed sections, one small table per
 *  letter; anything else lists one course per row. */
function courseTable(card: CourseCardFile): string {
  const byId = new Map(card.courses.map((c) => [c.id, c]));
  const gridded = card.courses.every((c) => /^\d{3}$/.test(c.id));
  const sectioned = card.courses.every((c) => /^[A-Z]\d$/.test(c.id));
  let html = '';
  if (sectioned) {
    const letters = [...new Set(card.courses.map((c) => c.id[0]!))].sort();
    html += '<div class="sections">';
    for (const letter of letters) {
      html += `<table class="courses section"><thead><tr><th class="row">${letter}</th><th></th></tr></thead><tbody>`;
      for (const course of card.courses.filter((c) => c.id[0] === letter)) {
        html += `<tr><th class="row">${esc(course.id.slice(1))}</th><td title="Course ${esc(course.id)}">${courseCell(course)}</td></tr>`;
      }
      html += '</tbody></table>';
    }
    html += '</div>';
  } else if (gridded) {
    const rows = [...new Set(card.courses.map((c) => c.id.slice(0, 2)))].sort();
    const cols = [...new Set(card.courses.map((c) => c.id.slice(2)))].sort();
    html += '<div class="scroll"><table class="courses"><thead><tr><th></th>';
    html += cols.map((c) => `<th>${c}</th>`).join('');
    html += '</tr></thead><tbody>';
    for (const row of rows) {
      html += `<tr><th class="row">${row}</th>`;
      for (const col of cols) {
        const course = byId.get(row + col);
        html += `<td title="Course ${row}${col}">${course ? courseCell(course) : ''}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table></div>';
  } else {
    html += '<table class="courses"><thead><tr><th>Course</th><th>Marks</th></tr></thead><tbody>';
    for (const course of card.courses) {
      html += `<tr><th class="row">${esc(course.id)}</th><td>${courseCell(course)}</td></tr>`;
    }
    html += '</tbody></table>';
  }
  html +=
    '<p class="legend">All marks are rounding marks except those in a <span class="passing">box</span>, which are passing marks. ' +
    '<span class="port">Red</span> marks are rounded or passed to port, <span class="stbd">green</span> to starboard. ' +
    'Select a course to draw it on the chart: its legs are numbered in sailing order, a leg sailed again is drawn beside ' +
    'the first, and a ring shows the side each mark is left on.</p>';
  return html;
}

const SWATCH: Record<string, string> = {
  black: '#222',
  orange: '#f28c28',
  yellow: '#f2d02d',
  green: '#2e8b57',
  red: '#c81e1e',
  white: '#fff',
};

/** The swatch colour for a colour description: its first named colour
 *  ("yellow/black" → yellow), grey when none is known. */
function swatchOf(color: string | undefined): string {
  for (const word of (color ?? '').toLowerCase().split(/[^a-z]+/)) {
    if (SWATCH[word]) return SWATCH[word];
  }
  return '#888';
}

function marksTable(marks: MarksFile): string {
  let html = '<table><thead><tr><th></th><th>Name</th><th>Shape</th><th>Colour</th><th>Position</th></tr></thead><tbody>';
  for (const m of marks.marks) {
    const swatch = m.color ? `<span class="swatch" style="background:${swatchOf(m.color)}"></span>` : '';
    html +=
      `<tr><th>${esc(m.id)}</th><td>${esc(m.name ?? '')}</td><td>${esc(m.shape ?? '')}</td>` +
      `<td>${swatch}${esc(m.color ?? '')}</td>` +
      `<td>${m.position ? formatPosition(m.position) : `<em>${esc(m.placement ?? '')}</em>`}</td></tr>`;
  }
  return html + '</tbody></table>';
}

/** A raster background for the map: a Web Mercator image covering exactly
 *  `bounds`, as fetched by tools/fetch_map.py, with the attribution its
 *  sources require. */
export interface MapBackground {
  png: Uint8Array;
  bounds: { south: number; west: number; north: number; east: number };
  width: number;
  height: number;
  attribution: string;
}

// Web Mercator on the unit square.
const mx = (lng: number): number => (lng + 180) / 360;
const my = (lat: number): number => {
  const φ = (lat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(φ) + 1 / Math.cos(φ)) / Math.PI) / 2;
};

/** The projection of a chart: Web Mercator, north up, over `bounds`, in
 *  pixels of `width` × `height`; `u` scales stroke widths and type with the
 *  image so they look the same on screen whatever its resolution. */
interface Chart {
  bounds: MapBackground['bounds'];
  width: number;
  height: number;
  u: number;
  x(lng: number): number;
  y(lat: number): number;
}

function chart(fixed: Array<Mark & { position: Position }>, background?: MapBackground): Chart {
  let bounds: MapBackground['bounds'];
  let width: number;
  let height: number;
  if (background) {
    ({ bounds, width, height } = background);
  } else {
    const lats = fixed.map((m) => m.position.lat);
    const lngs = fixed.map((m) => m.position.lng);
    const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const pad = 0.6 / 60; // 0.6′ around the marks
    const k = Math.cos((midLat * Math.PI) / 180);
    bounds = {
      south: Math.min(...lats) - pad,
      north: Math.max(...lats) + pad,
      west: Math.min(...lngs) - pad / k,
      east: Math.max(...lngs) + pad / k,
    };
    width = 640;
    height = Math.round((width * (my(bounds.south) - my(bounds.north))) / (mx(bounds.east) - mx(bounds.west)));
  }
  return {
    bounds,
    width,
    height,
    u: width / 640,
    x: (lng) => ((mx(lng) - mx(bounds.west)) / (mx(bounds.east) - mx(bounds.west))) * width,
    y: (lat) => ((my(lat) - my(bounds.north)) / (my(bounds.south) - my(bounds.north))) * height,
  };
}

/** One end of a course leg on the page: the start line or a mark, placed
 *  when the card gives it a position. */
interface LegEnd {
  id: string;
  position?: Position;
  side?: CourseMark['side'];
  passing?: boolean;
}

/** The course's legs in sailing order: start line → each mark. Only a leg
 *  whose both ends the card places has a bearing and distance. */
function courseLegEnds(course: Course, byId: Map<string, Mark>): LegEnd[] {
  return [
    { id: 'Start' },
    ...course.marks.map((cm) => ({ id: cm.mark, position: byId.get(cm.mark)?.position, side: cm.side, passing: cm.passing })),
  ];
}

/** A course drawn on the chart, hidden until picked: its placeable legs as
 *  numbered arrows, a repeated leg in its own lane beside the first, and a
 *  ring on each mark for the side it is left on. Legs from the start line
 *  or touching a mark laid per race are not drawn — the card cannot place
 *  them. */
function courseOverlay(course: Course, byId: Map<string, Mark>, c: Chart): string {
  const { u, x, y } = c;
  const f = (n: number): string => n.toFixed(1);
  const ends = courseLegEnds(course, byId);
  let g = `<g class="course" id="course-${courseKey(course)}">`;
  const traversals = new Map<string, number>();
  for (let i = 0; i < ends.length - 1; i++) {
    const a = ends[i]!;
    const b = ends[i + 1]!;
    if (!a.position || !b.position) continue;
    const key = [a.id, b.id].sort().join('\0');
    const n = traversals.get(key) ?? 0;
    traversals.set(key, n + 1);
    const ax = x(a.position.lng);
    const ay = y(a.position.lat);
    const dx = x(b.position.lng) - ax;
    const dy = y(b.position.lat) - ay;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    // a lane to the right of travel: the first pass just off the mark-to-mark
    // line, each repeat further out; both ends stop short of the mark's ring
    const off = (3 + 7 * n) * u;
    const trim = 12 * u;
    const x1 = ax - uy * off + ux * trim;
    const y1 = ay + ux * off + uy * trim;
    const x2 = ax + dx - uy * off - ux * trim;
    const y2 = ay + dy + ux * off - uy * trim;
    g += `<path class="leg" d="M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}" stroke-width="${f(2.5 * u)}"/>`;
    const mxp = (x1 + x2) / 2;
    const myp = (y1 + y2) / 2;
    const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    g += `<use href="#ah" transform="translate(${f(mxp)} ${f(myp)}) rotate(${f(deg)}) scale(${f(u)})"/>`;
    // the leg number beyond the lane, staggered along a repeated leg
    const nx = mxp - uy * 8 * u + ux * 14 * u * n;
    const ny = myp + ux * 8 * u + uy * 14 * u * n;
    g += `<text class="ln" x="${f(nx)}" y="${f(ny + 4 * u)}" font-size="${f(11 * u)}" stroke-width="${f(3 * u)}">${i + 1}</text>`;
  }
  for (const e of ends) {
    if (!e.position) continue;
    const cls = e.side === 'port' ? 'rp' : e.side === 'starboard' ? 'rs' : 'rn';
    const dash = e.passing ? ` stroke-dasharray="${f(3 * u)} ${f(3 * u)}"` : '';
    g += `<circle class="${cls}" cx="${f(x(e.position.lng))}" cy="${f(y(e.position.lat))}" r="${f(9 * u)}" stroke-width="${f(2.5 * u)}"${dash}/>`;
  }
  return g + '</g>';
}

/** The legs of a course as a table, hidden until the course is picked:
 *  number, ends, true bearing and distance — blank for a leg the card
 *  cannot place — and the total of the placed legs. */
function legTable(course: Course, byId: Map<string, Mark>): string {
  const ends = courseLegEnds(course, byId);
  let total = 0;
  let unplaced = false;
  let rows = '';
  for (let i = 0; i < ends.length - 1; i++) {
    const a = ends[i]!;
    const b = ends[i + 1]!;
    if (a.position && b.position) {
      const d = distanceNm(a.position, b.position);
      total += d;
      rows +=
        `<tr><th>${i + 1}</th><td>${esc(a.id)}</td><td>${esc(b.id)}</td>` +
        `<td>${String(Math.round(bearingDeg(a.position, b.position)) % 360).padStart(3, '0')}</td><td>${d.toFixed(2)}</td></tr>`;
    } else {
      unplaced = true;
      rows += `<tr class="unplaced"><th>${i + 1}</th><td>${esc(a.id)}</td><td>${esc(b.id)}</td><td>—</td><td>—</td></tr>`;
    }
  }
  return (
    `<div class="legs" id="legs-${courseKey(course)}"><h3>Course ${esc(course.id)}</h3>` +
    `<table class="numbers"><thead><tr><th>Leg</th><th>From</th><th>To</th><th>° true</th><th>NM</th></tr></thead>` +
    `<tbody>${rows}</tbody><tfoot><tr><td colspan="4">Legs between placed marks</td><td>${total.toFixed(2)}</td></tr></tfoot></table>` +
    (unplaced ? '<p>A leg from the start line, or to or from a mark laid per race, has no position on the card.</p>' : '') +
    '</div>'
  );
}

/** The CSS that reveals a picked course's overlay and leg table. */
function pickRules(courses: Course[]): string {
  return courses
    .map((c) => `body:has(#pick-${courseKey(c)}:checked) #course-${courseKey(c)}, body:has(#pick-${courseKey(c)}:checked) #legs-${courseKey(c)}`)
    .join(',\n') + ' { display: block; }';
}

/** An inline SVG of the fixed marks over the background (or a plain grid
 *  when there is none): Web Mercator, north up, minute grid, one-mile scale
 *  bar. Marks laid per race are not on it. With `courses`, each course's
 *  overlay is included, hidden until picked. */
function map(marks: Mark[], background?: MapBackground, courses: Course[] = []): string {
  const fixed = marks.filter((m): m is Mark & { position: Position } => !!m.position);
  if (fixed.length < 2) return '';
  const c = chart(fixed, background);
  const { bounds, width, height, u, x, y } = c;
  const font = (px: number): string => `font-size="${(px * u).toFixed(1)}"`;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Map of the marks">`;
  if (courses.length) svg += '<defs><path id="ah" class="ah" d="M7 0L-5 5L-5 -5z"/></defs>';
  if (background) {
    const b64 = Buffer.from(background.png).toString('base64');
    svg += `<image href="data:image/png;base64,${b64}" x="0" y="0" width="${width}" height="${height}"/>`;
  }
  svg += `<g stroke="${background ? '#5b6b7c' : '#b9cbe0'}" stroke-opacity="${background ? 0.35 : 1}" stroke-width="${u}" ${font(11)} fill="#3b4b5c">`;
  for (let lat = Math.ceil(bounds.south * 60) / 60; lat < bounds.north; lat += 1 / 60) {
    const yy = y(lat).toFixed(1);
    svg += `<line x1="0" y1="${yy}" x2="${width}" y2="${yy}"/>`;
    svg += `<text x="${3 * u}" y="${(y(lat) - 3 * u).toFixed(1)}" stroke="none">${formatPosition({ lat, lng: 0 }).split(' ').slice(0, 3).join(' ')}</text>`;
  }
  for (let lng = Math.ceil(bounds.west * 60) / 60; lng < bounds.east; lng += 1 / 60) {
    const xx = x(lng).toFixed(1);
    svg += `<line x1="${xx}" y1="0" x2="${xx}" y2="${height}"/>`;
    svg += `<text x="${(x(lng) + 3 * u).toFixed(1)}" y="${height - 4 * u}" stroke="none">${formatPosition({ lat: 0, lng }).split(' ').slice(3).join(' ')}</text>`;
  }
  svg += '</g>';
  // scale bar: one minute of latitude is one nautical mile
  const bar = y(bounds.south) - y(bounds.south + 1 / 60);
  svg += `<g stroke="#222" stroke-width="${2 * u}"><line x1="${width - 20 * u - bar}" y1="${height - 20 * u}" x2="${width - 20 * u}" y2="${height - 20 * u}"/></g>`;
  svg += `<text x="${width - 20 * u - bar / 2}" y="${height - 26 * u}" ${font(11)} text-anchor="middle" fill="#222">1 NM</text>`;
  svg += `<text x="${width - 14 * u}" y="${18 * u}" ${font(12)} text-anchor="middle" fill="#222">N</text>`;
  svg += `<path d="M ${width - 14 * u} ${22 * u} l ${4 * u} ${12 * u} l ${-4 * u} ${-3 * u} l ${-4 * u} ${3 * u} z" fill="#222"/>`;
  const byId = new Map(marks.map((m) => [m.id, m]));
  svg += courses.map((course) => courseOverlay(course, byId, c)).join('');
  for (const m of fixed) {
    const cx = x(m.position.lng).toFixed(1);
    const cy = y(m.position.lat).toFixed(1);
    const fill = swatchOf(m.color);
    svg += `<circle cx="${cx}" cy="${cy}" r="${5 * u}" fill="${fill}" stroke="#fff" stroke-width="${1.5 * u}"><title>${esc(m.id)} ${esc(m.name ?? '')}</title></circle>`;
    svg += `<text x="${(+cx + 8 * u).toFixed(1)}" y="${(+cy + 4 * u).toFixed(1)}" ${font(13)} font-weight="700" fill="#111" stroke="#fff" stroke-width="${3 * u}" paint-order="stroke">${esc(m.id)}</text>`;
  }
  if (background) {
    svg += `<text x="${3 * u}" y="${height - 4 * u}" ${font(10)} fill="#222" stroke="#fff" stroke-width="${3 * u}" paint-order="stroke">${esc(background.attribution)}</text>`;
  }
  return svg + '</svg>';
}

/** The map on its own, as a standalone SVG file. */
export function renderMarksMapSvg(marks: MarksFile, background?: MapBackground): string {
  const svg = map(marks.marks, background);
  const size = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  const dims = size ? ` width="${size[1]}" height="${size[2]}"` : '';
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + svg.replace('<svg ', `<svg${dims} `) + '\n';
}

function pairTable(marks: Mark[], cell: (a: Position, b: Position) => string): string {
  const fixed = marks.filter((m): m is Mark & { position: Position } => !!m.position);
  let html = '<div class="scroll"><table class="numbers"><thead><tr><th>from \\ to</th>';
  html += fixed.map((m) => `<th>${esc(m.id)}</th>`).join('') + '</tr></thead><tbody>';
  for (const a of fixed) {
    html += `<tr><th>${esc(a.id)}</th>`;
    for (const b of fixed) {
      html += `<td>${a === b ? '' : cell(a.position, b.position)}</td>`;
    }
    html += '</tr>';
  }
  return html + '</tbody></table></div>';
}

function notes(items: Note[]): string {
  return items
    .map(
      (n) =>
        `<section class="note"><h2>${esc(n.title)}</h2>` +
        n.text
          .split('\n')
          .filter((p) => p.trim())
          .map((p) => `<p>${esc(p)}</p>`)
          .join('') +
        '</section>',
    )
    .join('');
}

export function renderCardHtml(card: CourseCardFile, marks: MarksFile, options: RenderOptions = {}): string {
  const title = options.title ?? card.name ?? 'Course card';
  const sources = [card.source, marks.source].filter((s): s is string => !!s);
  const meta = [card.club, ...sources.map((s) => `<a href="${esc(s)}">${esc(s)}</a>`)].filter(Boolean).join(' · ');
  const allNotes = card.notes ?? [];
  const byId = new Map(marks.marks.map((m) => [m.id, m]));
  const chartSvg = map(marks.marks, options.background, card.courses);
  const caption =
    (options.background ? `Chart: ${esc(options.background.attribution)}. ` : '') + 'Marks laid per race are not shown.';
  return (
    `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${esc(title)}</title><style>${CSS}${pickRules(card.courses)}\n</style></head><body>\n` +
    `<h1>${esc(title)}</h1><p class="meta">${meta}</p>\n` +
    `<h2>Courses</h2><div class="courses-layout"><div>${courseTable(card)}</div>` +
    (chartSvg
      ? `<aside class="course-view"><figure class="map">${chartSvg}<figcaption>${caption}</figcaption></figure>` +
        `<p class="pick">Select a course to draw it on the chart.</p>${card.courses.map((c) => legTable(c, byId)).join('')}</aside>`
      : '') +
    `</div>\n` +
    `<h2>Marks</h2>${marksTable(marks)}\n` +
    `<h2>Bearings between marks (° true)</h2>${pairTable(marks.marks, (a, b) => String(Math.round(bearingDeg(a, b)) % 360).padStart(3, '0'))}\n` +
    `<h2>Distances between marks (NM)</h2>${pairTable(marks.marks, (a, b) => distanceNm(a, b).toFixed(2))}\n` +
    notes(allNotes) +
    `</body></html>\n`
  );
}
