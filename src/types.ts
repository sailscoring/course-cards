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

/** The ending every course on a card runs to, where the club's sailing
 *  instructions add one the card itself does not print — HYC's 2026 Autumn
 *  League cards stop at the last rounding mark and leave the run home to
 *  SI 6.1 D and 6.2 D. It is the finishing line as a mark, exactly like
 *  `startLine`: the same fields, a `placement` in the club's words where the
 *  line is laid on the day, and a `source` saying which instruction defines
 *  it. `via` is the marks the run in passes on the way to it.
 *
 *  Every course's `marks` already ends with `via` and then this line, so a
 *  reader that walks the sequence needs to know nothing about this field;
 *  it is here to say which of those entries the card does not print, and
 *  what the club's authority for them is. A card that prints its own ending
 *  (HYC's 2025 cards, which end each course at F) carries it in the
 *  sequences and no `finish`. */
export interface Finish extends StartLine {
  /** The marks the run in to the line passes, in sailing order, appended to
   *  every course ahead of the line itself. */
  via?: CourseMark[];
}

/** One course on the card: the marks in sailing order, beginning with the
 *  card's start line. Marks laid per race (the line itself, a windward mark,
 *  a finish) are in the sequence like any other; only their positions are
 *  missing until race day. */
export interface Course {
  /** The number or name the race committee displays; any string. */
  id: string;
  /** The course's length in nautical miles, where the club prints one on the
   *  card. The club's own figure on the club's own assumptions — it allows
   *  for beating, and for marks the card cannot place — so it is what the
   *  card says, not the sum of the legs the library computes. */
  distanceNm?: number;
  /** The true wind direction the club laid the course out for, in degrees,
   *  where the card says so — HYC's cards are a row per wind, so the first
   *  leg from the line is a beat. What the race committee picks a course
   *  by, and the wind a scorer expects on the day; not a fact about any
   *  race. Absent where the card gives none. */
  windDirectionDeg?: number;
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
  /** The ending the club's sailing instructions add to every course on this
   *  card, where the card does not print one. Its id resolves ahead of the
   *  marks file, like the start line's. */
  finish?: Finish;
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
