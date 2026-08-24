/**
 * From a card + marks + the race-day geometry to the legs actually sailed —
 * and from there to ORC constructed-course legs.
 */

import { bearingDeg, distanceNm } from './geo';
import type {
  Course,
  CourseCardFile,
  CourseLeg,
  MarksFile,
  OrcLeg,
  Position,
  RaceGeometry,
} from './types';

export class CourseError extends Error {}

interface Waypoint {
  label: string;
  position: Position;
}

function markWaypoints(course: Course, marks: MarksFile): Waypoint[] {
  const byId = new Map(marks.marks.map((m) => [m.id, m]));
  return course.marks.map((cm) => {
    const mark = byId.get(cm.mark);
    if (!mark) throw new CourseError(`course ${course.id}: unknown mark "${cm.mark}"`);
    return { label: mark.name ? `${mark.name} (${mark.id})` : mark.id, position: mark.position };
  });
}

/**
 * Resolve a race's legs: start → (laid windward mark, when given) → the
 * course's fixed marks in order → finish. Start and finish fall back to the
 * card's nominal infrastructure when the race-day positions weren't
 * recorded; without either, that end is simply omitted and the legs run
 * between what is known.
 */
export function resolveRaceLegs(
  card: CourseCardFile,
  marks: MarksFile,
  courseId: string,
  raceDay: RaceGeometry = {},
): CourseLeg[] {
  const course = card.courses.find((c) => c.id === courseId);
  if (!course) throw new CourseError(`no course "${courseId}" on the card`);

  const waypoints: Waypoint[] = [];
  const start = raceDay.start ?? card.infrastructure?.start;
  const finish = raceDay.finish ?? card.infrastructure?.finish;
  if (start) waypoints.push({ label: 'Start', position: start });
  if (raceDay.windwardMark) {
    waypoints.push({ label: 'Windward mark', position: raceDay.windwardMark });
  }
  waypoints.push(...markWaypoints(course, marks));
  if (finish) waypoints.push({ label: 'Finish', position: finish });

  if (waypoints.length < 2) {
    throw new CourseError(`course "${courseId}": not enough positions to form a leg`);
  }

  const legs: CourseLeg[] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i]!;
    const to = waypoints[i + 1]!;
    legs.push({
      fromLabel: from.label,
      toLabel: to.label,
      from: from.position,
      to: to.position,
      distanceNm: distanceNm(from.position, to.position),
      bearingDeg: bearingDeg(from.position, to.position),
    });
  }
  return legs;
}

export function totalDistanceNm(legs: CourseLeg[]): number {
  return legs.reduce((sum, leg) => sum + leg.distanceNm, 0);
}

/**
 * The legs in ORC constructed-course terms (rule 402.5): distance, bearing,
 * and the wind direction — one value for the race, refined per leg by the
 * caller if the wind shifted.
 */
export function toOrcLegs(legs: CourseLeg[], windDirectionDeg: number): OrcLeg[] {
  return legs.map((leg) => ({
    distanceNm: leg.distanceNm,
    bearingDeg: leg.bearingDeg,
    windDirectionDeg,
  }));
}
