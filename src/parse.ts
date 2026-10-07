/**
 * Loading and validating format files. Deliberately dependency-free: the
 * format is small enough that hand checks read better than a schema library,
 * and consumers get plain typed objects.
 */

import { METRES_PER_NM, distanceNm, midpointOf } from './geo.js';
import {
  FORMAT_VERSION,
  type AssumedPosition,
  type CourseCardFile,
  type CourseMark,
  type Finish,
  type LineEnd,
  type Mark,
  type MarksFile,
  type Note,
  type Position,
  type RoutingFile,
  type Side,
  type StartLine,
} from './types.js';

export class FormatError extends Error {}

function fail(path: string, message: string): never {
  throw new FormatError(`${path}: ${message}`);
}

function checkVersion(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    fail(path, 'formatVersion must be an integer');
  }
  if (value > FORMAT_VERSION) {
    fail(path, `formatVersion ${value} is newer than this library understands (${FORMAT_VERSION})`);
  }
  return value;
}

function checkPosition(value: unknown, path: string): Position {
  if (typeof value !== 'object' || value === null) fail(path, 'expected a position object');
  const p = value as { lat?: unknown; lng?: unknown };
  if (typeof p.lat !== 'number' || p.lat < -90 || p.lat > 90) fail(path, 'lat must be -90…90');
  if (typeof p.lng !== 'number' || p.lng < -180 || p.lng > 180) fail(path, 'lng must be -180…180');
  return { lat: p.lat, lng: p.lng };
}

function optionalString(obj: Record<string, unknown>, key: string): Record<string, string> {
  return typeof obj[key] === 'string' ? { [key]: obj[key] } : {};
}

function optionalNotes(obj: Record<string, unknown>, path: string): { notes?: Note[] } {
  if (obj.notes == null) return {};
  if (!Array.isArray(obj.notes)) fail(`${path}.notes`, 'expected an array');
  return {
    notes: obj.notes.map((raw, i) => {
      if (typeof raw !== 'object' || raw === null) fail(`${path}.notes[${i}]`, 'expected an object');
      const n = raw as Record<string, unknown>;
      if (typeof n.title !== 'string' || typeof n.text !== 'string') fail(`${path}.notes[${i}]`, 'expected title and text');
      return { title: n.title, text: n.text };
    }),
  };
}

/** The fields every mark carries, the start line included. */
function checkMark(raw: unknown, path: string, seen?: Set<string>): Mark {
  if (typeof raw !== 'object' || raw === null) fail(path, 'expected an object');
  const m = raw as Record<string, unknown>;
  if (typeof m.id !== 'string' || !m.id) fail(`${path}.id`, 'expected an id');
  if (seen?.has(m.id)) fail(`${path}.id`, `duplicate mark id "${m.id}"`);
  seen?.add(m.id);
  return {
    id: m.id,
    ...optionalString(m, 'name'),
    ...optionalString(m, 'shape'),
    ...optionalString(m, 'color'),
    ...(m.position != null ? { position: checkPosition(m.position, `${path}.position`) } : {}),
    ...optionalString(m, 'placement'),
    ...optionalString(m, 'source'),
  };
}

/** How far, in metres, a line's own `position` may be from the midpoint of
 *  its two fixed ends: rounding in the positions as printed, no more. */
const LINE_MIDPOINT_TOLERANCE_M = 5;

/** A start line or finish: a mark, and the two ends the sailing
 *  instructions give it, where they do — one starboard, one port. A line
 *  whose ends are both fixed by position and which carries a position of
 *  its own must put that position at their midpoint, since that is where a
 *  reader that knows nothing of ends will measure from. */
function checkLine(raw: unknown, path: string): StartLine {
  const line = checkMark(raw, path);
  const r = raw as Record<string, unknown>;
  if (r.ends == null) return line;
  if (!Array.isArray(r.ends) || r.ends.length !== 2) fail(`${path}.ends`, 'expected two ends');
  const ends = r.ends.map((rawEnd, i): LineEnd => {
    const endPath = `${path}.ends[${i}]`;
    if (typeof rawEnd !== 'object' || rawEnd === null) fail(endPath, 'expected an object');
    const e = rawEnd as Record<string, unknown>;
    if (e.end !== 'starboard' && e.end !== 'port') fail(`${endPath}.end`, 'expected "starboard" or "port"');
    if (e.mark != null && (typeof e.mark !== 'string' || !e.mark)) fail(`${endPath}.mark`, 'expected a mark id');
    if (e.mark != null && e.position != null) fail(endPath, 'expected at most one of mark and position');
    return {
      end: e.end,
      ...optionalString(e, 'name'),
      ...optionalString(e, 'mark'),
      ...(e.position != null ? { position: checkPosition(e.position, `${endPath}.position`) } : {}),
      ...optionalString(e, 'placement'),
      ...optionalString(e, 'source'),
    };
  }) as [LineEnd, LineEnd];
  if (ends[0].end === ends[1].end) fail(`${path}.ends`, 'expected one starboard end and one port end');
  const [a, b] = ends;
  if (line.position && a.position && b.position) {
    const offM = distanceNm(line.position, midpointOf(a.position, b.position)) * METRES_PER_NM;
    if (offM > LINE_MIDPOINT_TOLERANCE_M) {
      fail(`${path}.position`, `expected the midpoint of the line's fixed ends, not ${Math.round(offM)} m from it`);
    }
  }
  return { ...line, ends };
}

export function parseMarksFile(data: unknown): MarksFile {
  if (typeof data !== 'object' || data === null) fail('marks', 'expected an object');
  const obj = data as Record<string, unknown>;
  const formatVersion = checkVersion(obj.formatVersion, 'marks.formatVersion');
  if (!Array.isArray(obj.marks) || obj.marks.length === 0) fail('marks.marks', 'expected marks');
  const ids = new Set<string>();
  const marks = obj.marks.map((raw, i) => checkMark(raw, `marks.marks[${i}]`, ids));
  return {
    formatVersion,
    ...optionalString(obj, 'club'),
    ...optionalString(obj, 'name'),
    ...optionalString(obj, 'source'),
    ...optionalNotes(obj, 'marks'),
    marks,
  };
}

/** A sequence of course marks: a course's own, or the run in the card's
 *  finish names. */
function checkCourseMarks(value: unknown, path: string): CourseMark[] {
  if (!Array.isArray(value)) fail(path, 'expected an array');
  return value.map((raw, j) => {
    const markPath = `${path}[${j}]`;
    if (typeof raw !== 'object' || raw === null) fail(markPath, 'expected an object');
    const cm = raw as Record<string, unknown>;
    if (typeof cm.mark !== 'string' || !cm.mark) fail(`${markPath}.mark`, 'expected a mark id');
    if (cm.side != null && cm.side !== 'port' && cm.side !== 'starboard') {
      fail(`${markPath}.side`, 'expected "port" or "starboard"');
    }
    return {
      mark: cm.mark,
      ...(cm.side != null ? { side: cm.side as Side } : {}),
      ...(cm.passing === true ? { passing: true } : {}),
    };
  });
}

export function parseCourseCardFile(data: unknown): CourseCardFile {
  if (typeof data !== 'object' || data === null) fail('card', 'expected an object');
  const obj = data as Record<string, unknown>;
  const formatVersion = checkVersion(obj.formatVersion, 'card.formatVersion');
  // A club whose race officer calls the course on the day publishes a card
  // with no courses: its start line, finish and notes over its marks.
  if (!Array.isArray(obj.courses)) fail('card.courses', 'expected a list of courses');

  // The start line is a mark, its source the instruction that defines it.
  const startLine: { startLine?: StartLine } =
    obj.startLine != null ? { startLine: checkLine(obj.startLine, 'card.startLine') } : {};

  // The finish is the same thing at the other end, plus the marks the run in
  // to it passes.
  let finish: { finish?: Finish } = {};
  if (obj.finish != null) {
    const raw = obj.finish as Record<string, unknown>;
    const via = raw.via == null ? {} : { via: checkCourseMarks(raw.via, 'card.finish.via') };
    finish = { finish: { ...checkLine(raw, 'card.finish'), ...via } };
  }

  const ids = new Set<string>();
  const courses = obj.courses.map((raw, i) => {
    const path = `card.courses[${i}]`;
    if (typeof raw !== 'object' || raw === null) fail(path, 'expected an object');
    const c = raw as Record<string, unknown>;
    if (typeof c.id !== 'string' || !c.id) fail(`${path}.id`, 'expected an id');
    if (ids.has(c.id)) fail(`${path}.id`, `duplicate course id "${c.id}"`);
    ids.add(c.id);
    if (c.distanceNm != null && (typeof c.distanceNm !== 'number' || !(c.distanceNm > 0))) {
      fail(`${path}.distanceNm`, 'expected a positive number of nautical miles');
    }
    if (
      c.windDirectionDeg != null &&
      (typeof c.windDirectionDeg !== 'number' || !(c.windDirectionDeg >= 0 && c.windDirectionDeg < 360))
    ) {
      fail(`${path}.windDirectionDeg`, 'expected a direction in degrees, 0 up to 360');
    }
    if (!Array.isArray(c.marks) || c.marks.length === 0) fail(`${path}.marks`, 'expected marks');
    const marks = checkCourseMarks(c.marks, `${path}.marks`);
    return {
      id: c.id,
      ...(c.windDirectionDeg != null ? { windDirectionDeg: c.windDirectionDeg as number } : {}),
      ...(c.distanceNm != null ? { distanceNm: c.distanceNm as number } : {}),
      marks,
    };
  });

  return {
    formatVersion,
    ...optionalString(obj, 'club'),
    ...optionalString(obj, 'name'),
    ...optionalString(obj, 'source'),
    ...optionalString(obj, 'marks'),
    ...startLine,
    ...finish,
    ...optionalNotes(obj, 'card'),
    courses,
  };
}

function list(obj: Record<string, unknown>, key: string, path: string): unknown[] {
  if (obj[key] == null) return [];
  if (!Array.isArray(obj[key])) fail(`${path}.${key}`, 'expected an array');
  return obj[key] as unknown[];
}

function record(raw: unknown, path: string): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null) fail(path, 'expected an object');
  return raw as Record<string, unknown>;
}

function id(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value) fail(path, 'expected an id');
  return value;
}

/**
 * A routing overlay, checked within itself: every passage and pair names
 * assumed positions it declares, every `via` a waypoint or an assumed
 * position, every `as` an assumed position with one of its own; no id is
 * declared twice, and no pair is listed twice in either direction. Whether
 * its marks are the marks file's is for the caller to check against the
 * files it has.
 */
export function parseRoutingFile(data: unknown): RoutingFile {
  const obj = record(data, 'routing');
  const formatVersion = checkVersion(obj.formatVersion, 'routing.formatVersion');

  const ids = new Set<string>();
  const declare = (value: string, path: string) => {
    if (ids.has(value)) fail(path, `duplicate id "${value}"`);
    ids.add(value);
  };

  const assumed: AssumedPosition[] = list(obj, 'assumed', 'routing').map((raw, i) => {
    const path = `routing.assumed[${i}]`;
    const a = record(raw, path);
    const mark = id(a.mark, `${path}.mark`);
    const own = a.id == null ? mark : id(a.id, `${path}.id`);
    declare(own, `${path}.id`);
    if ((a.position == null) === (a.as == null)) fail(path, 'expected exactly one of position and as');
    if (typeof a.toleranceM !== 'number' || !(a.toleranceM >= 0)) fail(`${path}.toleranceM`, 'expected metres, 0 or more');
    return {
      id: own,
      mark,
      ...(a.position != null ? { position: checkPosition(a.position, `${path}.position`) } : {}),
      ...(a.as != null ? { as: id(a.as, `${path}.as`) } : {}),
      toleranceM: a.toleranceM,
      ...optionalString(a, 'note'),
      ...optionalString(a, 'source'),
    };
  });
  const placed = new Set(assumed.filter((a) => a.position).map((a) => a.id));
  assumed.forEach((a, i) => {
    if (a.as != null && !placed.has(a.as)) fail(`routing.assumed[${i}].as`, `"${a.as}" is not an assumed position with one of its own`);
  });

  const waypoints = list(obj, 'waypoints', 'routing').map((raw, i) => {
    const path = `routing.waypoints[${i}]`;
    const w = record(raw, path);
    const own = id(w.id, `${path}.id`);
    declare(own, `${path}.id`);
    return {
      id: own,
      ...optionalString(w, 'name'),
      position: checkPosition(w.position, `${path}.position`),
      ...optionalString(w, 'note'),
    };
  });
  const turning = new Set([...placed, ...waypoints.map((w) => w.id)]);

  // A pair is named by assumed positions with a position of their own; one
  // that stands in for another (`as`) takes that one's pairs, so naming it
  // in a pair would be a pair nothing ever looks up.
  const pairs = new Set<string>();
  const pair = (raw: Record<string, unknown>, path: string) => {
    const from = id(raw.from, `${path}.from`);
    const to = id(raw.to, `${path}.to`);
    for (const [key, value] of [['from', from], ['to', to]] as const) {
      if (!placed.has(value)) fail(`${path}.${key}`, `"${value}" is not an assumed position with one of its own`);
    }
    if (from === to) fail(path, 'a pair needs two ends');
    const key = [from, to].sort().join('\u0000');
    if (pairs.has(key)) fail(path, `${from} – ${to} is listed twice`);
    pairs.add(key);
    return { from, to };
  };

  const passages = list(obj, 'passages', 'routing').map((raw, i) => {
    const path = `routing.passages[${i}]`;
    const p = record(raw, path);
    const ends = pair(p, path);
    if (!Array.isArray(p.via) || p.via.length === 0) fail(`${path}.via`, 'expected the points the passage turns at');
    const via = p.via.map((v, j) => {
      const point = id(v, `${path}.via[${j}]`);
      if (!turning.has(point)) fail(`${path}.via[${j}]`, `"${point}" is neither a waypoint nor an assumed position`);
      return point;
    });
    return { ...ends, via, ...optionalString(p, 'note') };
  });
  const direct = list(obj, 'direct', 'routing').map((raw, i) => {
    const path = `routing.direct[${i}]`;
    const d = record(raw, path);
    return { ...pair(d, path), ...optionalString(d, 'note') };
  });

  return {
    formatVersion,
    ...optionalString(obj, 'club'),
    ...optionalString(obj, 'name'),
    ...optionalString(obj, 'source'),
    ...optionalString(obj, 'contributor'),
    ...optionalString(obj, 'method'),
    ...optionalString(obj, 'marks'),
    ...optionalNotes(obj, 'routing'),
    assumed,
    waypoints,
    passages,
    direct,
  };
}
