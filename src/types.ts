/**
 * The course-cards data format, version 1. See docs/format.md for the
 * narrative specification; these types are its normative shape.
 */

export const FORMAT_VERSION = 2;

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

export interface MarksFile {
  formatVersion: number;
  /** Who maintains these marks (club or class), free text. */
  club?: string;
  name?: string;
  /** Where the data came from — the club's published document. */
  source?: string;
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

/** The start line of every course on a card, as the club's sailing
 *  instructions define it — the card names the marks, the instructions say
 *  where the race starts. It is a mark like any other: a position where the
 *  line is fixed, a `placement` in the club's own words where it is laid on
 *  the day, and its id at the head of every course. */
export interface StartLine extends Mark {
  /** The document and clause the line is defined by: "DBSC Sailing
   *  Instructions H – Fixed Marks, Hut, 4.1 and 4.2". */
  source?: string;
}

/** One course on the card: the marks in sailing order, beginning with the
 *  card's start line. Marks laid per race (the line itself, a windward mark,
 *  a finish) are in the sequence like any other; only their positions are
 *  missing until race day. */
export interface Course {
  /** The number or name the race committee displays; any string. */
  id: string;
  marks: CourseMark[];
}

/** A passage of the club's explanatory text, as printed on or with the
 *  card: sailing instructions about the marks, how courses are signalled.
 *  Paragraphs are separated by newlines. */
export interface Note {
  title: string;
  text: string;
}

export interface CourseCardFile {
  formatVersion: number;
  club?: string;
  name?: string;
  source?: string;
  /** The marks file this card's mark ids refer to, by name. */
  marks?: string;
  /** The line every course on this card starts at. Its id resolves ahead of
   *  the marks file, so a card may start at a mark the club also lists. */
  startLine?: StartLine;
  notes?: Note[];
  courses: Course[];
}

/**
 * What a card cannot know: where the race actually was. Every mark without a
 * position — the start line, a windward mark laid to the day's wind, a
 * finish — must be given one here, and a fixed mark may be overridden if it
 * was moved.
 */
export interface RacePositions {
  marks?: Record<string, Position>;
}

/** One end of a leg: a mark of the course, the start line included, and
 *  where it was on the day. */
export interface Waypoint {
  mark: string;
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
