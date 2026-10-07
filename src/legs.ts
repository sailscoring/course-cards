/**
 * From a card, its marks, and where the race actually was, to the legs
 * sailed: each one a distance and a true bearing.
 */

import { METRES_PER_NM, bearingDeg, distanceNm, midpointOf } from './geo.js';
import type {
  AssumedPosition,
  Course,
  CourseCardFile,
  CourseLeg,
  CourseMark,
  LineEnd,
  LineEndWaypoint,
  LineGeometry,
  LinePositions,
  Mark,
  MarksFile,
  Position,
  RacePositions,
  RoutingFile,
  StartLine,
  Waypoint,
} from './types.js';

export class CourseError extends Error {}

/** One entry of a course's sequence with its mark resolved: the entry as
 *  the card prints it, the mark it names, and whether the card itself places
 *  it. An unplaced mark — the start line laid on the day, a windward mark, a
 *  finish — is what a caller must ask the race officer for, and `placement`
 *  on the mark says where the club says it goes. A line whose ends the card
 *  fixes, each a position or a marks file mark with one, is placed. */
export interface ResolvedCourseMark {
  entry: CourseMark;
  mark: Mark;
  placed: boolean;
  /** The authority for the mark's position: its own `source`, else the file
   *  it comes from — the card for the start line and the finish, the marks
   *  file for the rest. Absent where neither names one. */
  source?: string;
}

/** The course a card gives that id, or an error naming it. */
function courseOf(card: CourseCardFile, courseId: string): Course {
  const course = card.courses.find((c) => c.id === courseId);
  if (!course) throw new CourseError(`no course "${courseId}" on the card`);
  return course;
}

/** The course's marks as the club prints them on the card: the sequence
 *  without the start line at its head, and without the ending the sailing
 *  instructions add at its tail (`card.finish` and the marks its `via` runs
 *  in through). What to show a competitor reading the card; `courseMarks`
 *  is what to sail. */
export function printedMarks(card: CourseCardFile, courseId: string): CourseMark[] {
  const course = courseOf(card, courseId);
  const head = card.startLine && course.marks[0]?.mark === card.startLine.id ? 1 : 0;
  const tail = card.finish ? (card.finish.via?.length ?? 0) + 1 : 0;
  return course.marks.slice(head, course.marks.length - tail);
}

function isLinePositions(given: Position | LinePositions): given is LinePositions {
  return 'ends' in given;
}

function markLabel(mark: Mark): string {
  return mark.name ? `${mark.name} (${mark.id})` : mark.id;
}

/** Whether the card places every end of a line itself: each a position of
 *  its own, or a marks file mark with one. */
function endsFixed(line: StartLine, marks: MarksFile | undefined): boolean {
  if (!line.ends) return false;
  return line.ends.every(
    (e) => e.position != null || (e.mark != null && marks?.marks.find((m) => m.id === e.mark)?.position != null),
  );
}

/** A line's ends placed for a race, and the ones that could not be: each
 *  end from the race if it was given there, else the card's position for
 *  it, else where its marks file mark was. A line the card gives no ends
 *  but the race does takes the race's, starboard first. `lineSource` is the
 *  authority for an end the card fixes and names none for. */
function placeEnds(
  line: StartLine,
  race: RacePositions,
  marks: MarksFile | undefined,
  lineSource: string | undefined,
  what: string,
): { placed: LineEndWaypoint[]; missing: LineEnd[] } {
  const given = race.marks?.[line.id];
  const raceEnds = given && isLinePositions(given) ? given.ends : undefined;
  const ends: LineEnd[] = line.ends ?? [{ end: 'starboard' }, { end: 'port' }];
  const placed: LineEndWaypoint[] = [];
  const missing: LineEnd[] = [];
  for (const end of ends) {
    const mark = end.mark != null ? marks?.marks.find((m) => m.id === end.mark) : undefined;
    if (end.mark != null && !mark) throw new CourseError(`${what}: unknown mark "${end.mark}" at the ${end.end} end of "${line.id}"`);
    const label = end.name ?? (mark ? markLabel(mark) : `${end.end === 'starboard' ? 'Starboard' : 'Port'} end`);
    const base = { end: end.end, label, ...(mark ? { mark: mark.id } : {}) };
    const raceEnd = raceEnds?.[end.end];
    const raceMark = mark ? race.marks?.[mark.id] : undefined;
    if (raceEnd) {
      placed.push({ ...base, position: raceEnd });
    } else if (end.position) {
      const source = end.source ?? lineSource;
      placed.push({ ...base, position: end.position, ...(source != null ? { source } : {}) });
    } else if (raceMark && !isLinePositions(raceMark)) {
      placed.push({ ...base, position: raceMark });
    } else if (mark?.position) {
      const source = mark.source ?? marks?.source;
      placed.push({ ...base, position: mark.position, ...(source != null ? { source } : {}) });
    } else {
      missing.push(mark && !end.placement && mark.placement ? { ...end, placement: mark.placement } : end);
    }
  }
  return { placed, missing };
}

function missingEnd(what: string, line: StartLine, end: LineEnd): CourseError {
  const where = end.placement ? ` (${end.placement})` : '';
  return new CourseError(`${what}: no position for the ${end.end} end of "${line.id}"${where}`);
}

function geometry(placed: LineEndWaypoint[]): LineGeometry {
  const [a, b] = placed as [LineEndWaypoint, LineEndWaypoint];
  return {
    ends: [a, b],
    measuringPoint: midpointOf(a.position, b.position),
    lengthM: distanceNm(a.position, b.position) * METRES_PER_NM,
    bearingDeg: bearingDeg(a.position, b.position),
  };
}

/**
 * A start or finish line with two ends, placed for a race: its ends, the
 * point legs to and from it are measured from — their geodesic midpoint —
 * its length in metres, and the bearing from its first end to its second.
 * Each end is where the race says it was (`race.marks[line.id].ends`), else
 * where the card fixes it: a position of its own, or the marks file mark it
 * names (`marks`), wherever that mark was for the race. An end nobody
 * places is an error naming it and quoting where the club says it goes; the
 * midpoint is never guessed from one end.
 *
 * A line that is a single point is not a line with ends, and gives
 * `undefined`: one with no ends on the card or for the race, or one the
 * race gives a plain position.
 */
export function lineGeometry(line: StartLine, race: RacePositions = {}, marks?: MarksFile): LineGeometry | undefined {
  const given = race.marks?.[line.id];
  if (given ? !isLinePositions(given) : !line.ends) return undefined;
  const { placed, missing } = placeEnds(line, race, marks, line.source, `line "${line.id}"`);
  if (missing.length) throw missingEnd(`line "${line.id}"`, line, missing[0]!);
  return geometry(placed);
}

/** The marks of a sequence resolved against a card and its marks file: the
 *  start line and the finish ahead of the marks file, then the marks file. A
 *  mark none of them lists is an error naming it; `what` says which course
 *  the error is about. Each mark's authority is its own `source`, else that
 *  of the file it came from. */
function resolve(card: CourseCardFile, marks: MarksFile, sequence: CourseMark[], what: string): ResolvedCourseMark[] {
  const byId = new Map(marks.marks.map((m) => [m.id, { mark: m, fileSource: marks.source }]));
  if (card.startLine) byId.set(card.startLine.id, { mark: card.startLine, fileSource: card.source });
  if (card.finish) byId.set(card.finish.id, { mark: card.finish, fileSource: card.source });
  return sequence.map((entry) => {
    const found = byId.get(entry.mark);
    if (!found) throw new CourseError(`${what}: unknown mark "${entry.mark}"`);
    const { mark } = found;
    const source = mark.source ?? found.fileSource;
    const placed = mark.position != null || endsFixed(mark, marks);
    return { entry, mark, placed, ...(source != null ? { source } : {}) };
  });
}

/** The marks a card's course names, in sailing order, each resolved: the
 *  start line and the finish ahead of the marks file, then the marks file. A
 *  mark the card names but none of them lists is an error. This is the
 *  question "what does this course need that the card cannot supply?" — the
 *  ones with `placed` false. */
export function courseMarks(card: CourseCardFile, marks: MarksFile, courseId: string): ResolvedCourseMark[] {
  const course = courseOf(card, courseId);
  return resolve(card, marks, course.marks, `course ${course.id}`);
}

/** A course called on the day — "Dosco to starboard, W2 to port, Harp to
 *  port, finish at No 15" — as the sequence a race officer gives it, resolved
 *  the way a numbered course is. The race officer does not call the start
 *  line, so the card's `startLine` is put at the head of the sequence unless
 *  it is already there: a called course begins where every course on the
 *  card begins. Everything else is as for `courseMarks`: the finish and the
 *  start line resolve ahead of the marks file, an unknown mark is an error,
 *  and `placed` says which marks the caller must ask the race officer for.
 *
 *  This is the case between a numbered course and a bare list of positions:
 *  the club's marks are published and the course is not, which is how most
 *  clubs race. */
export function calledCourseMarks(card: CourseCardFile, marks: MarksFile, sequence: CourseMark[]): ResolvedCourseMark[] {
  return resolve(card, marks, calledCourse(card, sequence).marks, 'called course');
}

/** The called sequence as a `Course` of the card — the card's start line at
 *  its head, an empty id — so it can be drawn by `renderCourseSvg` or walked
 *  like any course on the card. */
export function calledCourse(card: CourseCardFile, sequence: CourseMark[]): Course {
  const start = card.startLine;
  const marks = start && sequence[0]?.mark !== start.id ? [{ mark: start.id }, ...sequence] : [...sequence];
  return { id: '', marks };
}

/** The legs between consecutive waypoints: each one's great-circle
 *  distance and initial true bearing. A sequence of one waypoint has no
 *  legs. This is the arithmetic `courseLegs` does once a card's course is
 *  resolved to positions, exposed so a course built by hand from placed
 *  marks — no card, no number — gets the same legs. */
export function legsFromWaypoints(waypoints: Waypoint[]): CourseLeg[] {
  const legs: CourseLeg[] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i]!;
    const to = waypoints[i + 1]!;
    legs.push({
      from,
      to,
      distanceNm: distanceNm(from.position, to.position),
      bearingDeg: bearingDeg(from.position, to.position),
    });
  }
  return legs;
}

/** Positions for resolved marks: the marks file's, or `race.marks` for a
 *  mark laid on the day — the line itself, a windward mark, a finish; a
 *  race-day position also overrides a fixed one. A mark with no position
 *  from either source is an error naming it and quoting where the club
 *  says it goes, so the caller knows what to ask the race officer for. A
 *  waypoint carries the mark's `source` only where the position is the
 *  files': one given for the race is the caller's.
 *
 *  A line with two ends — on the card, or given for the race — is placed at
 *  their midpoint, the waypoint saying so and carrying the ends. An end
 *  nobody places is an error naming it, except where the race says nothing
 *  of the line and the card gives it a position of its own: that position
 *  stands, the line as one point, as it did before lines had ends. */
function place(resolved: ResolvedCourseMark[], race: RacePositions, what: string, marks: MarksFile): Waypoint[] {
  return resolved.map(({ mark, source }) => {
    const given = race.marks?.[mark.id];
    const point = { mark: mark.id, label: markLabel(mark) };
    if (given && !isLinePositions(given)) return { ...point, position: given };
    const line = mark as StartLine;
    if (given || line.ends) {
      const { placed, missing } = placeEnds(line, race, marks, source, what);
      if (!missing.length) {
        const { ends, measuringPoint } = geometry(placed);
        return {
          ...point,
          position: measuringPoint,
          ...(!given && source != null ? { source } : {}),
          line: 'midpoint' as const,
          ends,
        };
      }
      if (given || !mark.position) throw missingEnd(what, line, missing[0]!);
    }
    if (!mark.position) {
      const where = mark.placement ? ` (${mark.placement})` : '';
      throw new CourseError(`${what}: no position for mark "${mark.id}"${where}`);
    }
    return { ...point, position: mark.position, ...(source != null ? { source } : {}) };
  });
}

/** The marks file's mark, or the card's start line or finish, where it was
 *  for the race — or nothing, where it is unknown or has no position. What
 *  a passage that turns at a mark needs. */
function markWaypoint(card: CourseCardFile, marks: MarksFile, race: RacePositions, id: string): Waypoint | undefined {
  try {
    return place(resolve(card, marks, [{ mark: id }], 'routing'), race, 'routing', marks)[0];
  } catch {
    return undefined;
  }
}

/**
 * A course's legs as a routing overlay sails them. For each leg of the
 * course, each end is matched to the nearest position the overlay assumed
 * for that mark, within its tolerance; then the pair, in either direction,
 * is a passage — sailed through its waypoints, reversed if listed the other
 * way — or direct, or not listed. An end with no assumed position in
 * tolerance, a pair not listed, or a passage turning at a mark that has
 * moved from where it was assumed, leaves the leg a straight line,
 * `unreviewed`.
 */
function routedLegs(points: Waypoint[], routing: RoutingFile, markAt: (id: string) => Waypoint | undefined): CourseLeg[] {
  const byId = new Map(routing.assumed.map((a) => [a.id, a]));
  const assumedAt = (a: AssumedPosition): Position => a.position ?? byId.get(a.as!)!.position!;
  const waypoints = new Map(routing.waypoints.map((w) => [w.id, w]));
  const pairs = new Map<string, { kind: 'direct' | 'passage'; via: string[] }>();
  for (const d of routing.direct) {
    pairs.set(`${d.from}\u0000${d.to}`, { kind: 'direct', via: [] });
    pairs.set(`${d.to}\u0000${d.from}`, { kind: 'direct', via: [] });
  }
  for (const p of routing.passages) {
    pairs.set(`${p.from}\u0000${p.to}`, { kind: 'passage', via: p.via });
    pairs.set(`${p.to}\u0000${p.from}`, { kind: 'passage', via: [...p.via].reverse() });
  }

  /** The nearest assumed position for a mark, within its tolerance: the id
   *  its pairs are listed under, and how far the mark was from it. */
  const match = (w: Waypoint): { key: string; offsetM: number } | undefined => {
    let best: { key: string; offsetM: number } | undefined;
    for (const a of routing.assumed) {
      if (a.mark !== w.mark) continue;
      const offsetM = distanceNm(w.position, assumedAt(a)) * METRES_PER_NM;
      if (offsetM <= a.toleranceM && (!best || offsetM < best.offsetM)) best = { key: a.as ?? a.id, offsetM };
    }
    return best;
  };

  /** A point a passage turns at: a routing waypoint, or a mark where it was
   *  for the race — which must be within tolerance of where it was
   *  assumed, or the passage no longer holds. */
  const turn = (id: string): { point: Waypoint; offsetM: number } | undefined => {
    const w = waypoints.get(id);
    if (w) {
      const point: Waypoint = { mark: w.id, label: w.name ?? w.id, position: w.position, routing: true };
      if (routing.source) point.source = routing.source;
      return { point, offsetM: 0 };
    }
    const a = byId.get(id)!;
    const point = markAt(a.mark);
    if (!point) return undefined;
    const offsetM = distanceNm(point.position, assumedAt(a)) * METRES_PER_NM;
    return offsetM <= a.toleranceM ? { point, offsetM } : undefined;
  };

  const legs: CourseLeg[] = [];
  const push = (from: Waypoint, to: Waypoint, review: CourseLeg['review'], cardLeg: number, offsetM: number) => {
    const [leg] = legsFromWaypoints([from, to]);
    const offset = Math.round(offsetM * 10) / 10;
    legs.push({ ...leg!, review, cardLeg, ...(offset > 0 ? { offsetM: offset } : {}) });
  };
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i]!;
    const to = points[i + 1]!;
    const a = match(from);
    const b = match(to);
    const listed = a && b ? pairs.get(`${a.key}\u0000${b.key}`) : undefined;
    const turns = listed?.via.map(turn);
    if (!listed || !turns || turns.some((t) => !t)) {
      push(from, to, 'unreviewed', i, 0);
      continue;
    }
    if (listed.kind === 'direct') {
      push(from, to, 'direct', i, Math.max(a!.offsetM, b!.offsetM));
      continue;
    }
    const route = [{ point: from, offsetM: a!.offsetM }, ...(turns as { point: Waypoint; offsetM: number }[]), { point: to, offsetM: b!.offsetM }];
    for (let j = 0; j < route.length - 1; j++) {
      push(route[j]!.point, route[j + 1]!.point, 'passage', i, Math.max(route[j]!.offsetM, route[j + 1]!.offsetM));
    }
  }
  return legs;
}

/**
 * The legs between consecutive waypoints, as a routing overlay sails them:
 * what `courseLegs` does given an overlay, for waypoints placed by hand — a
 * course with no card behind it, or a drawing's marks. `marks` are the marks
 * a passage may turn at, where they are (W2, on Cork Harbour's way from
 * Ringabella to Cage); the waypoints themselves by default. Each leg's
 * `cardLeg` indexes the pair of `waypoints` it sails between.
 */
export function routedLegsFromWaypoints(waypoints: Waypoint[], routing: RoutingFile, marks: Waypoint[] = waypoints): CourseLeg[] {
  const byMark = new Map(marks.map((m) => [m.mark, m]));
  return routedLegs(waypoints, routing, (id) => byMark.get(id));
}

/**
 * The legs of a course: each of the course's marks in order, the first of
 * which is the card's start line. Positions come from the marks file, or
 * from `race.marks` for marks laid on the day — the line itself, a windward
 * mark, a finish (a race-day position also overrides a fixed one). A mark
 * with no position from either source is an error naming it and quoting
 * where the club says it goes, so the caller knows what to ask the race
 * officer for.
 *
 * Given a routing overlay, a leg it routes round an obstruction is split
 * into the legs actually sailed, through the passage's waypoints, and every
 * leg says how the overlay speaks for it — `direct`, `passage` or
 * `unreviewed` — which leg of the card it sails, and how far its ends were
 * from where the overlay assumed them. Without one, the legs are straight
 * lines with none of that: no overlay makes no claim.
 */
export function courseLegs(
  card: CourseCardFile,
  marks: MarksFile,
  courseId: string,
  race: RacePositions,
  routing?: RoutingFile,
): CourseLeg[] {
  const points = place(courseMarks(card, marks, courseId), race, `course ${courseId}`, marks);
  if (!routing) return legsFromWaypoints(points);
  return routedLegs(points, routing, (id) => markWaypoint(card, marks, race, id));
}

/**
 * The legs of a course called on the day: `calledCourseMarks` placed and
 * walked exactly as `courseLegs` places and walks a numbered course, from
 * the card's start line to wherever the sequence ends, and routed the same
 * way given an overlay. What a scorer needs for a race whose course was
 * never on a card.
 */
export function calledCourseLegs(
  card: CourseCardFile,
  marks: MarksFile,
  sequence: CourseMark[],
  race: RacePositions,
  routing?: RoutingFile,
): CourseLeg[] {
  const points = place(calledCourseMarks(card, marks, sequence), race, 'called course', marks);
  if (!routing) return legsFromWaypoints(points);
  return routedLegs(points, routing, (id) => markWaypoint(card, marks, race, id));
}

export function totalDistanceNm(legs: CourseLeg[]): number {
  return legs.reduce((sum, leg) => sum + leg.distanceNm, 0);
}
