/**
 * A course card as a self-contained HTML page: the course table as the club
 * prints it, the marks with a map, mark-to-mark bearings and distances, and
 * the club's explanatory notes. No dependencies, no scripts; inline CSS and
 * an inline SVG map, so the page can be published anywhere as a file.
 */

import { bearingDeg, distanceNm } from './geo';
import type { Course, CourseCardFile, Mark, MarksFile, Note, Position } from './types';

export interface RenderOptions {
  /** Page title; defaults to the card's name. */
  title?: string;
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
  .port { color: #c81e1e; }
  .stbd { color: #1a8a3c; }
  .passing { outline: 1.5px solid #222; outline-offset: 1px; }
  .legend { margin: .75rem 0 0; color: #333; }
  .legend .passing { margin: 0 .3em; }
  .numbers td, .numbers th { text-align: right; font-family: ui-monospace, monospace; font-size: 12px; padding: .15rem .35rem; }
  .numbers th:first-child { text-align: center; }
  .scroll { overflow-x: auto; }
  .marks-layout { display: flex; flex-wrap: wrap; gap: 2rem; align-items: flex-start; }
  .map { flex: 1 1 24rem; min-width: 20rem; }
  .map svg { width: 100%; height: auto; border: 1px solid #ccc; background: #f4f9fd; }
  .note p { margin: .3rem 0; max-width: 46rem; }
  .swatch { display: inline-block; width: .8em; height: .8em; border: 1px solid #555; vertical-align: -1px; margin-right: .3em; }
  @media print { body { padding: 0; } h2 { break-after: avoid; } }
`;

function courseCell(course: Course): string {
  return course.marks
    .map((m) => {
      const classes = [m.side === 'starboard' ? 'stbd' : m.side === 'port' ? 'port' : '', m.passing ? 'passing' : '']
        .filter(Boolean)
        .join(' ');
      return `<span class="${classes}">${esc(m.mark)}</span>`;
    })
    .join(' ');
}

/** Cards numbered like HYC's — two digits of row, one of column — lay out as
 *  the printed grid; anything else lists one course per row. */
function courseTable(card: CourseCardFile): string {
  const byId = new Map(card.courses.map((c) => [c.id, c]));
  const gridded = card.courses.every((c) => /^\d{3}$/.test(c.id));
  let html = '';
  if (gridded) {
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
    '<span class="port">Red</span> marks are rounded or passed to port, <span class="stbd">green</span> to starboard.</p>';
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

function marksTable(marks: MarksFile): string {
  let html = '<table><thead><tr><th></th><th>Name</th><th>Shape</th><th>Colour</th><th>Position</th></tr></thead><tbody>';
  for (const m of marks.marks) {
    const swatch = m.color ? `<span class="swatch" style="background:${SWATCH[m.color.toLowerCase()] ?? '#ccc'}"></span>` : '';
    html +=
      `<tr><th>${esc(m.id)}</th><td>${esc(m.name ?? '')}</td><td>${esc(m.shape ?? '')}</td>` +
      `<td>${swatch}${esc(m.color ?? '')}</td>` +
      `<td>${m.position ? formatPosition(m.position) : `<em>${esc(m.placement ?? '')}</em>`}</td></tr>`;
  }
  return html + '</tbody></table>';
}

/** An inline SVG of the fixed marks: north up, equirectangular, minute grid,
 *  one-mile scale bar. Marks laid per race are not on it. */
function map(marks: Mark[]): string {
  const fixed = marks.filter((m): m is Mark & { position: Position } => !!m.position);
  if (fixed.length < 2) return '';
  const lats = fixed.map((m) => m.position.lat);
  const lngs = fixed.map((m) => m.position.lng);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const k = Math.cos((midLat * Math.PI) / 180); // minutes of longitude per minute of latitude
  const pad = 0.6 / 60; // 0.6′ around the marks
  const minLat = Math.min(...lats) - pad;
  const maxLat = Math.max(...lats) + pad;
  const minLng = Math.min(...lngs) - pad / k;
  const maxLng = Math.max(...lngs) + pad / k;
  const width = 640;
  const scale = width / ((maxLng - minLng) * k); // px per degree of latitude
  const height = Math.round((maxLat - minLat) * scale);
  const x = (lng: number): number => (lng - minLng) * k * scale;
  const y = (lat: number): number => (maxLat - lat) * scale;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Map of the marks">`;
  svg += '<g stroke="#b9cbe0" stroke-width="1" font-size="11" fill="#5b6b7c">';
  for (let lat = Math.ceil(minLat * 60) / 60; lat < maxLat; lat += 1 / 60) {
    const yy = y(lat).toFixed(1);
    svg += `<line x1="0" y1="${yy}" x2="${width}" y2="${yy}"/>`;
    svg += `<text x="3" y="${(y(lat) - 3).toFixed(1)}" stroke="none">${formatPosition({ lat, lng: 0 }).split(' ').slice(0, 3).join(' ')}</text>`;
  }
  for (let lng = Math.ceil(minLng * 60) / 60; lng < maxLng; lng += 1 / 60) {
    const xx = x(lng).toFixed(1);
    svg += `<line x1="${xx}" y1="0" x2="${xx}" y2="${height}"/>`;
    svg += `<text x="${(x(lng) + 3).toFixed(1)}" y="${height - 4}" stroke="none">${formatPosition({ lat: 0, lng }).split(' ').slice(3).join(' ')}</text>`;
  }
  svg += '</g>';
  // scale bar: one minute of latitude is one nautical mile
  const bar = scale / 60;
  svg += `<g stroke="#222" stroke-width="2"><line x1="${width - 20 - bar}" y1="${height - 20}" x2="${width - 20}" y2="${height - 20}"/></g>`;
  svg += `<text x="${width - 20 - bar / 2}" y="${height - 26}" font-size="11" text-anchor="middle" fill="#222">1 NM</text>`;
  svg += `<text x="${width - 14}" y="18" font-size="12" text-anchor="middle" fill="#222">N</text><path d="M ${width - 14} 22 l 4 12 l -4 -3 l -4 3 z" fill="#222"/>`;
  for (const m of fixed) {
    const cx = x(m.position.lng).toFixed(1);
    const cy = y(m.position.lat).toFixed(1);
    const fill = SWATCH[(m.color ?? '').toLowerCase()] ?? '#888';
    svg += `<circle cx="${cx}" cy="${cy}" r="5" fill="${fill}" stroke="#111" stroke-width="1"><title>${esc(m.id)} ${esc(m.name ?? '')}</title></circle>`;
    svg += `<text x="${(+cx + 8).toFixed(1)}" y="${(+cy + 4).toFixed(1)}" font-size="13" font-weight="700" fill="#111">${esc(m.id)}</text>`;
  }
  return svg + '</svg>';
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
  const allNotes = [...(card.notes ?? []), ...(marks.notes ?? [])];
  return (
    `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${esc(title)}</title><style>${CSS}</style></head><body>\n` +
    `<h1>${esc(title)}</h1><p class="meta">${meta}</p>\n` +
    `<h2>Courses</h2>${courseTable(card)}\n` +
    `<h2>Marks</h2><div class="marks-layout"><div>${marksTable(marks)}</div><div class="map">${map(marks.marks)}</div></div>\n` +
    `<h2>Bearings between marks (° true)</h2>${pairTable(marks.marks, (a, b) => String(Math.round(bearingDeg(a, b)) % 360).padStart(3, '0'))}\n` +
    `<h2>Distances between marks (NM)</h2>${pairTable(marks.marks, (a, b) => distanceNm(a, b).toFixed(2))}\n` +
    notes(allNotes) +
    `</body></html>\n`
  );
}
