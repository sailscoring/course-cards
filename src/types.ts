/**
 * The course-cards data format, version 1. See docs/format.md for the
 * narrative specification; these types are its normative shape.
 */

export const FORMAT_VERSION = 1;

/** Decimal degrees, WGS84. West longitudes and south latitudes negative. */
export interface Position {
  lat: number;
  lng: number;
}

/** A fixed racing mark as a club maintains it. */
export interface Mark {
  /** The card's label for the mark — usually a single letter. */
  id: string;
  name?: string;
  /** Physical description, free text by convention ('conical', 'inflatable'…). */
  shape?: string;
  color?: string;
  position: Position;
}

export interface MarksFile {
  formatVersion: number;
  /** Who maintains these marks (club or class), free text. */
  club?: string;
  marks: Mark[];
}

/** One entry of a course's mark sequence. */
export interface CourseMark {
  /** A mark id from the accompanying marks file. */
  mark: string;
  /** Which way the mark is left. Cards conventionally colour-code this;
   *  absent means the card's default (port for most cards). */
  rounding?: 'port' | 'starboard';
  /** A passing (not rounding) mark — boxed on HYC's card. */
  passing?: boolean;
}

/** One course on the card: an id and the fixed-mark sequence. The windward
 *  mark is deliberately not in the sequence — on cards like HYC's it is laid
 *  per race and its position is a race-day fact (see RaceGeometry). */
export interface Course {
  id: string;
  /** The wind direction the course is designed for. On HYC's card this is
   *  encoded in the course number (first two digits × 10); stored explicitly
   *  so the encoding convention stays the club's, not the format's. */
  windDirectionDeg?: number;
  marks: CourseMark[];
}

/** The card's standing race infrastructure: nominal start/finish positions
 *  and the nominal first beat, used when the race-day facts aren't recorded. */
export interface CardInfrastructure {
  start?: Position;
  finish?: Position;
  /** Nominal length of the first beat to a laid windward mark (NM). */
  firstUpwindDistanceNm?: number;
}

export interface CourseCardFile {
  formatVersion: number;
  club?: string;
  name?: string;
  infrastructure?: CardInfrastructure;
  courses: Course[];
}

/**
 * The race-day facts a card cannot know: where the start and finish actually
 * were, and — for clubs that lay their windward mark — where it was laid.
 * With these plus a course id, every leg of the race is geometry.
 */
export interface RaceGeometry {
  start?: Position;
  finish?: Position;
  /** The laid windward mark's position; boats sail start → windward mark →
   *  the course's first fixed mark. Absent for cards whose first mark is
   *  fixed (DBSC-style), or when it wasn't recorded. */
  windwardMark?: Position;
}

/** One computed leg: from → to as rhumb-line geometry. */
export interface CourseLeg {
  fromLabel: string;
  toLabel: string;
  from: Position;
  to: Position;
  distanceNm: number;
  bearingDeg: number;
}

/** A leg in ORC constructed-course terms (rule 402.5). */
export interface OrcLeg {
  distanceNm: number;
  bearingDeg: number;
  windDirectionDeg: number;
}
