/**
 * A course as a picture: the marks at their real relative positions, the
 * legs between them in sailing order, a north arrow and a scale bar. Plain
 * standalone SVG — no script, no stylesheet, no ids, no external resource —
 * so the same string can be dropped inline into a results page, a dialog,
 * or a file, several times on one page, and look the same everywhere.
 *
 * On its own it is a sanity check, not a chart: a coordinate that went in
 * wrong should be obviously wrong at a glance, so plain ground, the marks
 * and the legs, with the marks a club charts drawn differently from the ones
 * the race committee laid on the day. Given a data set's captured chart as
 * `background`, the same drawing sits on the club's own water, with the
 * shore, the soundings and the seamarks the crew sees — embedded, never
 * linked, so a published page still fetches nothing.
 */

import { bearingDeg, distanceNm } from './geo.js';
import type { Position, Side } from './types.js';

/** A mark to draw. `label` is what is printed beside it — a letter or two,
 *  as on the card. `fixed` marks are the club's charted marks; the rest
 *  were laid on the day, and are drawn to say so. */
export interface DrawnMark {
  id: string;
  label: string;
  position: Position;
  fixed?: boolean;
}

/** One entry of the course to draw, by mark id, in sailing order. */
export interface DrawnCourseMark {
  mark: string;
  side?: Side;
  passing?: boolean;
}

/**
 * A raster chart to draw the course on: a north-up Web Mercator image
 * covering exactly `bounds`, which is what a data set's `map/background.png`
 * and its sidecar are, with the attribution its tile sources require. The
 * image is embedded whole and the drawing's own frame crops it; where the
 * course runs past what it covers, the marks are drawn on plain ground.
 */
export interface CourseBackground {
  png: Uint8Array;
  bounds: { south: number; west: number; north: number; east: number };
  width: number;
  height: number;
  attribution: string;
}

export interface RenderCourseOptions {
  /** Pixel width of the drawing; the height follows the marks' extent,
   *  kept between 0.6 and 1.4 times the width. Default 640. */
  width?: number;
  /** A mark id to ring — the one being edited, say. */
  highlight?: string;
  /** The picture's accessible name. */
  title?: string;
  /** The club's chart to draw on, where the marks come from a data set that
   *  captured one. */
  background?: CourseBackground;
  /** Refer to `background` by the id of a symbol already on the page — one
   *  `renderCourseBackgroundSymbol` wrote — rather than embedding the image
   *  in this drawing. A page with a drawing per race then carries the chart
   *  once, not once per race. `background` is still needed: it says where
   *  the chart lies and whose it is. */
  backgroundSymbol?: string;
}

// Web Mercator on the unit square.
const mx = (lng: number): number => (lng + 180) / 360;
const my = (lat: number): number => {
  const φ = (lat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(φ) + 1 / Math.cos(φ)) / Math.PI) / 2;
};

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const f = (n: number): string => n.toFixed(1);

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** The encoding of a chart already drawn, kept as long as the caller keeps
 *  the bytes. A page draws the same club's water once per race, and a dialog
 *  redraws it on every keystroke; encoding a few hundred kilobytes each time
 *  is the one expensive thing this renderer could do. */
const encoded = new WeakMap<Uint8Array, string>();

/** Base64 without Buffer or btoa: the renderer runs in a browser as often as
 *  in Node, and a chart of a few hundred kilobytes has to encode the same
 *  bytes in both. Built in chunks rather than one string per triple. */
function base64(bytes: Uint8Array): string {
  const already = encoded.get(bytes);
  if (already !== undefined) return already;
  const chunks: string[] = [];
  let chunk = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    chunk +=
      B64[(n >> 18) & 63]! +
      B64[(n >> 12) & 63]! +
      (b === undefined ? '=' : B64[(n >> 6) & 63]!) +
      (c === undefined ? '=' : B64[n & 63]!);
    if (chunk.length >= 8192) {
      chunks.push(chunk);
      chunk = '';
    }
  }
  chunks.push(chunk);
  const b64 = chunks.join('');
  encoded.set(bytes, b64);
  return b64;
}

function chartDataUrl(background: CourseBackground): string {
  return `data:image/png;base64,${base64(background.png)}`;
}

/**
 * The chart as a symbol, for a page to carry once and every drawing on it
 * to refer to by `backgroundSymbol: id`. The symbol spans the image's own
 * pixels and stretches to whatever box a drawing places it in, as the
 * embedded image does. It sits in an svg of no size that takes up no room,
 * rather than one hidden with `display: none`, which some browsers take as
 * leave to not paint what refers to it.
 */
export function renderCourseBackgroundSymbol(background: CourseBackground, id: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true"><defs><symbol id="${esc(id)}" viewBox="0 0 ${background.width} ${background.height}" preserveAspectRatio="none"><image href="${chartDataUrl(background)}" width="${background.width}" height="${background.height}" preserveAspectRatio="none"/></symbol></defs></svg>`;
}

/**
 * Draw `marks`, and the `course` over them when there is one. Every mark
 * given is drawn, on the course or not — a scorer checking a new mark wants
 * to see it among the ones already there. Returns '' when there is nothing
 * to draw.
 */
export function renderCourseSvg(marks: DrawnMark[], course: DrawnCourseMark[] = [], options: RenderCourseOptions = {}): string {
  if (marks.length === 0) return '';
  const width = options.width ?? 640;
  const u = width / 640;

  // Bounds: the marks' extent, padded, and never narrower than 0.6′ so a
  // single mark or a short line still sits in a sensible frame; then the
  // aspect held between 0.6 and 1.4 by widening the narrower axis.
  const lats = marks.map((m) => m.position.lat);
  const lngs = marks.map((m) => m.position.lng);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const k = Math.cos((midLat * Math.PI) / 180) || 1e-6;
  const latSpan = Math.max(Math.max(...lats) - Math.min(...lats), 0.6 / 60);
  const lngSpan = Math.max((Math.max(...lngs) - Math.min(...lngs)) * k, 0.6 / 60);
  let south = Math.min(...lats) - latSpan * 0.18 - (latSpan - (Math.max(...lats) - Math.min(...lats))) / 2;
  let north = Math.max(...lats) + latSpan * 0.18 + (latSpan - (Math.max(...lats) - Math.min(...lats))) / 2;
  let west = Math.min(...lngs) - (lngSpan * 0.18 + (lngSpan - (Math.max(...lngs) - Math.min(...lngs)) * k) / 2) / k;
  let east = Math.max(...lngs) + (lngSpan * 0.18 + (lngSpan - (Math.max(...lngs) - Math.min(...lngs)) * k) / 2) / k;
  let aspect = (my(south) - my(north)) / (mx(east) - mx(west)); // height / width
  if (aspect > 1.4) {
    const extra = ((mx(east) - mx(west)) * (aspect / 1.4 - 1)) / 2;
    west = (mx(west) - extra) * 360 - 180;
    east = (mx(east) + extra) * 360 - 180;
  } else if (aspect < 0.6) {
    const target = (mx(east) - mx(west)) * 0.6;
    const extra = (target - (my(south) - my(north))) / 2;
    const invMy = (y: number): number => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
    south = invMy(my(south) + extra);
    north = invMy(my(north) - extra);
  }
  aspect = (my(south) - my(north)) / (mx(east) - mx(west));
  const height = Math.round(width * aspect);
  const x = (lng: number): number => ((mx(lng) - mx(west)) / (mx(east) - mx(west))) * width;
  const y = (lat: number): number => ((my(lat) - my(north)) / (my(south) - my(north))) * height;
  const font = (px: number): string => `font-family="system-ui, sans-serif" font-size="${f(px * u)}"`;

  // Where the chart goes, if it is drawn at all. It is placed by its own
  // corners: the drawing and the image are both north-up Web Mercator, so
  // the projection between them is linear and the frame crops whatever falls
  // outside. Plain ground shows wherever the chart does not reach — a mark
  // laid beyond what the club captured. A chart of water this drawing never
  // reaches is dropped rather than embedded off-frame, because the bytes
  // would ride on the page for nothing.
  const placed = options.background && {
    chart: options.background,
    x: x(options.background.bounds.west),
    y: y(options.background.bounds.north),
    w: x(options.background.bounds.east) - x(options.background.bounds.west),
    h: y(options.background.bounds.south) - y(options.background.bounds.north),
  };
  const chart = placed && placed.x < width && placed.y < height && placed.x + placed.w > 0 && placed.y + placed.h > 0
    ? placed
    : undefined;
  // What a label's outline is painted in, so it reads over whatever is under
  // it: the plain ground, or the chart.
  const halo = chart ? '#fff' : '#f4f9fd';

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(options.title ?? (course.length ? 'Course drawing' : 'Marks drawing'))}">`;
  svg += `<rect x="0" y="0" width="${width}" height="${height}" fill="#f4f9fd"/>`;
  if (chart) {
    const at = `x="${f(chart.x)}" y="${f(chart.y)}" width="${f(chart.w)}" height="${f(chart.h)}"`;
    svg += options.backgroundSymbol
      ? `<use href="#${esc(options.backgroundSymbol)}" ${at}/>`
      : `<image href="${chartDataUrl(chart.chart)}" ${at} preserveAspectRatio="none"/>`;
  }

  // The minute grid, labelled along the left and bottom edges. Over a chart
  // it is a reference, not the ground itself, so it fades back, its labels
  // take an outline to read over the shore, and the bottom line of the
  // drawing goes to the attribution instead.
  const gridHalo = chart
    ? `stroke="${halo}" stroke-opacity="1" stroke-width="${f(3 * u)}" paint-order="stroke"`
    : 'stroke="none"';
  const lngLabelY = chart ? height - 16 * u : height - 4 * u;
  svg += `<g stroke="${chart ? '#5b6b7c' : '#c5d5e6'}" stroke-opacity="${chart ? '0.35' : '1'}" stroke-width="${f(u)}" ${font(10)} fill="${chart ? '#3b4b5c' : '#5b6b7c'}">`;
  const step = gridStep(north - south, east - west);
  for (let lat = Math.ceil(south / step) * step; lat < north; lat += step) {
    const yy = f(y(lat));
    svg += `<line x1="0" y1="${yy}" x2="${width}" y2="${yy}"/>`;
    svg += `<text x="${f(3 * u)}" y="${f(y(lat) - 3 * u)}" ${gridHalo}>${gridLabel(lat, 'lat', step)}</text>`;
  }
  for (let lng = Math.ceil(west / step) * step; lng < east; lng += step) {
    const xx = f(x(lng));
    svg += `<line x1="${xx}" y1="0" x2="${xx}" y2="${height}"/>`;
    svg += `<text x="${f(x(lng) + 3 * u)}" y="${f(lngLabelY)}" ${gridHalo}>${gridLabel(lng, 'lng', step)}</text>`;
  }
  svg += '</g>';

  // Scale bar: the largest of 1 NM, 0.5 NM, 0.2 NM and 1 cable that fits in
  // a third of the width; one minute of latitude is one nautical mile.
  const nmPx = y(south) - y(south + 1 / 60);
  const barNm = [1, 0.5, 0.2, 0.1].find((nm) => nm * nmPx <= width / 3) ?? 0.1;
  const bar = barNm * nmPx;
  const barY = height - 20 * u;
  svg += `<g stroke="#222" stroke-width="${f(2 * u)}"><line x1="${f(width - 20 * u - bar)}" y1="${f(barY)}" x2="${f(width - 20 * u)}" y2="${f(barY)}"/>`;
  svg += `<line x1="${f(width - 20 * u - bar)}" y1="${f(barY - 4 * u)}" x2="${f(width - 20 * u - bar)}" y2="${f(barY + 4 * u)}"/>`;
  svg += `<line x1="${f(width - 20 * u)}" y1="${f(barY - 4 * u)}" x2="${f(width - 20 * u)}" y2="${f(barY + 4 * u)}"/></g>`;
  svg += `<text x="${f(width - 20 * u - bar / 2)}" y="${f(barY - 7 * u)}" ${font(11)} text-anchor="middle" fill="#222">${barNm === 0.1 ? '1 cable' : `${barNm} NM`}</text>`;
  // North arrow.
  svg += `<text x="${f(width - 14 * u)}" y="${f(18 * u)}" ${font(12)} font-weight="700" text-anchor="middle" fill="#222">N</text>`;
  svg += `<path d="M ${f(width - 14 * u)} ${f(22 * u)} l ${f(4 * u)} ${f(12 * u)} l ${f(-4 * u)} ${f(-3 * u)} l ${f(-4 * u)} ${f(3 * u)} z" fill="#222"/>`;

  // Legs: numbered arrows in sailing order, a repeated leg in its own lane
  // beside the first, each labelled with its true bearing and distance.
  const byId = new Map(marks.map((m) => [m.id, m]));
  const ends = course.map((entry) => ({ entry, mark: byId.get(entry.mark) }));
  const traversals = new Map<string, number>();
  let legs = '';
  let labels = '';
  for (let i = 0; i < ends.length - 1; i++) {
    const a = ends[i]!.mark;
    const b = ends[i + 1]!.mark;
    if (!a || !b) continue;
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
    const off = (3 + 7 * n) * u;
    const trim = Math.min(12 * u, len / 3);
    const x1 = ax - uy * off + ux * trim;
    const y1 = ay + ux * off + uy * trim;
    const x2 = ax + dx - uy * off - ux * trim;
    const y2 = ay + dy + ux * off - uy * trim;
    legs += `<path d="M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}" stroke="#0b57d0" stroke-width="${f(2.5 * u)}" fill="none"/>`;
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    legs += `<path d="M7 0L-5 5L-5 -5z" fill="#0b57d0" transform="translate(${f(cx)} ${f(cy)}) rotate(${f(deg)}) scale(${f(u)})"/>`;
    // The leg's number, bearing and distance beside the lane, staggered along
    // a repeated leg so the labels do not stack.
    const lx = cx - uy * 9 * u + ux * 16 * u * n;
    const ly = cy + ux * 9 * u + uy * 16 * u * n;
    const anchor = -uy > 0.2 ? 'start' : -uy < -0.2 ? 'end' : 'middle';
    const brg = String(Math.round(bearingDeg(a.position, b.position)) % 360).padStart(3, '0');
    const dist = distanceNm(a.position, b.position).toFixed(2);
    labels += `<text x="${f(lx)}" y="${f(ly + 4 * u)}" ${font(11)} text-anchor="${anchor}" fill="#0b3d91" stroke="${halo}" stroke-width="${f(3 * u)}" paint-order="stroke"><tspan font-weight="700">${i + 1}</tspan> ${brg}° ${dist} NM</text>`;
  }
  svg += legs;

  // Rings for the side a mark is left on, dashed for a passing mark.
  for (const { entry, mark } of ends) {
    if (!mark) continue;
    const stroke = entry.side === 'port' ? '#c81e1e' : entry.side === 'starboard' ? '#2e8b57' : '#555';
    const dash = entry.passing ? ` stroke-dasharray="${f(3 * u)} ${f(3 * u)}"` : '';
    svg += `<circle cx="${f(x(mark.position.lng))}" cy="${f(y(mark.position.lat))}" r="${f(9 * u)}" fill="none" stroke="${stroke}" stroke-width="${f(2.5 * u)}"${dash}/>`;
  }

  // The marks: a club's charted marks filled dark, the ones laid on the day
  // hollow, the highlighted one haloed. Labels beside them.
  for (const m of marks) {
    const cx = x(m.position.lng);
    const cy = y(m.position.lat);
    if (options.highlight === m.id) {
      svg += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(14 * u)}" fill="#ffd54f" fill-opacity="0.6" stroke="#f9a825" stroke-width="${f(1.5 * u)}"/>`;
    }
    const fill = m.fixed ? '#333' : '#fff';
    const stroke = m.fixed ? '#fff' : '#d84315';
    svg += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(5 * u)}" fill="${fill}" stroke="${stroke}" stroke-width="${f(2 * u)}"><title>${esc(m.label)}</title></circle>`;
    svg += `<text x="${f(cx + 8 * u)}" y="${f(cy + 4 * u)}" ${font(13)} font-weight="700" fill="#111" stroke="${halo}" stroke-width="${f(3 * u)}" paint-order="stroke">${esc(m.label)}</text>`;
  }
  svg += labels;
  // Both tile sources require attribution wherever their pixels are shown.
  if (chart) {
    svg += `<text x="${f(3 * u)}" y="${f(height - 4 * u)}" ${font(10)} fill="#222" stroke="#fff" stroke-width="${f(3 * u)}" paint-order="stroke">${esc(chart.chart.attribution)}</text>`;
  }
  return svg + '</svg>';
}

/** The grid spacing in degrees: whole minutes when the frame is a few
 *  miles across, finer for a short course, coarser for a passage race. */
function gridStep(latSpanDeg: number, lngSpanDeg: number): number {
  const span = Math.max(latSpanDeg, lngSpanDeg) * 60; // in minutes
  const minutes = [0.1, 0.2, 0.5, 1, 2, 5, 10, 30, 60].find((m) => span / m <= 8) ?? 60;
  return minutes / 60;
}

function gridLabel(value: number, axis: 'lat' | 'lng', stepDeg: number): string {
  const abs = Math.abs(value);
  const deg = Math.floor(abs + 1e-9);
  const min = (abs - deg) * 60;
  const decimals = stepDeg * 60 >= 1 ? 0 : 1;
  const hemi = axis === 'lat' ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W';
  return `${deg}° ${min.toFixed(decimals).padStart(decimals ? 4 : 2, '0')}′ ${hemi}`;
}
