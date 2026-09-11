/**
 * From a card, its marks, and where the race actually was, to the legs
 * sailed: each one a distance and a true bearing.
 */

import { bearingDeg, distanceNm } from './geo.js';
import type { Course, CourseCardFile, CourseLeg, CourseMark, Mark, MarksFile, RacePositions, Waypoint } from './types.js';

export class CourseError extends Error {}

/** One entry of a course's sequence with its mark resolved: the entry as
 *  the card prints it, the mark it names, and whether the card itself places
 *  it. An unplaced mark — the start line laid on the day, a windward mark, a
 *  finish — is what a caller must ask the race officer for, and `placement`
 *  on the mark says where the club says it goes. */
export interface ResolvedCourseMark {
  entry: CourseMark;
  mark: Mark;
  placed: boolean;
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

/** The marks a card's course names, in sailing order, each resolved: the
 *  start line and the finish ahead of the marks file, then the marks file. A
 *  mark the card names but none of them lists is an error. This is the
 *  question "what does this course need that the card cannot supply?" — the
 *  ones with `placed` false. */
export function courseMarks(card: CourseCardFile, marks: MarksFile, courseId: string): ResolvedCourseMark[] {
  const course = courseOf(card, courseId);
  const byId = new Map(marks.marks.map((m) => [m.id, m]));
  if (card.startLine) byId.set(card.startLine.id, card.startLine);
  if (card.finish) byId.set(card.finish.id, card.finish);
  return course.marks.map((entry) => {
    const mark = byId.get(entry.mark);
    if (!mark) throw new CourseError(`course ${course.id}: unknown mark "${entry.mark}"`);
    return { entry, mark, placed: mark.position != null };
  });
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

/**
 * The legs of a course: each of the course's marks in order, the first of
 * which is the card's start line. Positions come from the marks file, or
 * from `race.marks` for marks laid on the day — the line itself, a windward
 * mark, a finish (a race-day position also overrides a fixed one). A mark
 * with no position from either source is an error naming it and quoting
 * where the club says it goes, so the caller knows what to ask the race
 * officer for.
 */
export function courseLegs(
  card: CourseCardFile,
  marks: MarksFile,
  courseId: string,
  race: RacePositions,
): CourseLeg[] {
  const waypoints: Waypoint[] = courseMarks(card, marks, courseId).map(({ mark }) => {
    const position = race.marks?.[mark.id] ?? mark.position;
    if (!position) {
      const where = mark.placement ? ` (${mark.placement})` : '';
      throw new CourseError(`course ${courseId}: no position for mark "${mark.id}"${where}`);
    }
    return { mark: mark.id, label: mark.name ? `${mark.name} (${mark.id})` : mark.id, position };
  });
  return legsFromWaypoints(waypoints);
}

export function totalDistanceNm(legs: CourseLeg[]): number {
  return legs.reduce((sum, leg) => sum + leg.distanceNm, 0);
}
