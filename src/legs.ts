/**
 * From a card, its marks, and where the race actually was, to the legs
 * sailed: each one a distance and a true bearing.
 */

import { bearingDeg, distanceNm } from './geo.js';
import type { CourseCardFile, CourseLeg, MarksFile, RacePositions, Waypoint } from './types.js';

export class CourseError extends Error {}

/**
 * The legs of a course: start line → each of the course's marks in order.
 * Positions come from the marks file, or from `race.marks` for marks laid on
 * the day (a race-day position also overrides a fixed one). A mark with no
 * position from either source is an error naming it, so the caller knows
 * what to ask the race officer for.
 */
export function courseLegs(
  card: CourseCardFile,
  marks: MarksFile,
  courseId: string,
  race: RacePositions,
): CourseLeg[] {
  const course = card.courses.find((c) => c.id === courseId);
  if (!course) throw new CourseError(`no course "${courseId}" on the card`);
  const byId = new Map(marks.marks.map((m) => [m.id, m]));

  const waypoints: Waypoint[] = [{ label: 'Start', position: race.start }];
  for (const { mark: id } of course.marks) {
    const mark = byId.get(id);
    if (!mark) throw new CourseError(`course ${course.id}: unknown mark "${id}"`);
    const position = race.marks?.[id] ?? mark.position;
    if (!position) {
      const where = mark.placement ? ` (${mark.placement})` : '';
      throw new CourseError(`course ${course.id}: no position for mark "${id}"${where}`);
    }
    waypoints.push({ mark: id, label: mark.name ? `${mark.name} (${id})` : id, position });
  }

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

export function totalDistanceNm(legs: CourseLeg[]): number {
  return legs.reduce((sum, leg) => sum + leg.distanceNm, 0);
}
