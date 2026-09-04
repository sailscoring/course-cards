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

/** A racing mark as the club lists it. */
export interface Mark {
  /** The card's label for the mark — usually a single letter. */
  id: string;
  name?: string;
  /** Physical description, free text by convention ('conical', 'inflatable'…). */
  shape?: string;
  color?: string;
  /** Where the mark is, for marks with a fixed position. Absent for marks laid
   *  per race (a windward mark, a finish mark), whose position is a race-day
   *  fact supplied by whoever computes the legs. */
  position?: Position;
  /** Where a per-race mark is laid, in the club's words: "Upwind of Start
   *  Line", "Between Island Mark and Howth Sound". */
  placement?: string;
}

/** A passage of the club's explanatory text, as printed: sailing
 *  instructions about the marks, how courses are signalled. Paragraphs are
 *  separated by newlines. */
export interface Note {
  title: string;
  text: string;
}

export interface MarksFile {
  formatVersion: number;
  /** Who maintains these marks (club or class), free text. */
  club?: string;
  name?: string;
  /** Where the data came from — the club's published document. */
  source?: string;
  notes?: Note[];
  marks: Mark[];
}

/** Which side a mark is left on. */
export type Side = 'port' | 'starboard';

/** One entry of a course's mark sequence. */
export interface CourseMark {
  /** A mark id from the marks file. */
  mark: string;
  /** The side the mark is rounded, or passed, on. Absent when the card
   *  doesn't say. */
  side?: Side;
  /** A passing mark, not a rounding mark — boxed on HYC's cards. */
  passing?: boolean;
}

/** One course on the card: the marks in sailing order, from the start line.
 *  Marks laid per race (a windward mark, a finish) are in the sequence like
 *  any other; only their positions are missing until race day. */
export interface Course {
  /** The number or name the race committee displays; any string. */
  id: string;
  marks: CourseMark[];
}

export interface CourseCardFile {
  formatVersion: number;
  club?: string;
  name?: string;
  source?: string;
  /** The marks file this card's mark ids refer to, by name. */
  marks?: string;
  notes?: Note[];
  courses: Course[];
}

/**
 * What a card cannot know: where the race actually was. Every course starts
 * at the start line; marks the marks file lists without a position must be
 * given one here, and a fixed mark may be overridden if it was moved.
 */
export interface RacePositions {
  start: Position;
  marks?: Record<string, Position>;
}

/** One end of a leg: the start line or a mark, and where it was. */
export interface Waypoint {
  /** Mark id; absent for the start line. */
  mark?: string;
  label: string;
  position: Position;
}

/** One leg of a course: the great-circle distance and initial true bearing
 *  from one waypoint to the next. */
export interface CourseLeg {
  from: Waypoint;
  to: Waypoint;
  distanceNm: number;
  bearingDeg: number;
}
