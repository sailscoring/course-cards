/**
 * The course-cards data format, version 2. See docs/format.md for the
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
  /** The authority for this mark's position, where it is not the file's own
   *  `source`: a document and clause, a published set of positions, or a
   *  named person's local knowledge — "RCYC General Sailing Instructions
   *  2026, 22.3", "OpenStreetMap node 1593411492 (CIL00240)". Absent, the
   *  position is the file's `source`'s. The position only: a name, shape or
   *  colour taken from elsewhere is not recorded. A navigation buoy is where
   *  the chart puts it and a club's laid mark is where the club last laid
   *  it; this is how a reader tells them apart. */
  source?: string;
}

export interface MarksFile {
  formatVersion: number;
  /** Who maintains these marks (club or class), free text. */
  club?: string;
  name?: string;
  /** The document the file was made from, and the authority for the
   *  position of every mark that names no `source` of its own. */
  source?: string;
  /** What the file's `source` says about its marks, as printed: "Mark
   *  positions may vary slightly. All figures are approximate." Always the
   *  words of the file's `source`, never of a mark's own. */
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

/** The start line of every course on a card, as the club's sailing
 *  instructions define it — the card names the marks, the instructions say
 *  where the race starts. It is a mark like any other: a position where the
 *  line is fixed, a `placement` in the club's own words where it is laid on
 *  the day, and its id at the head of every course. Its `source` is the
 *  document and clause the line is defined by: "DBSC Sailing Instructions
 *  H – Fixed Marks, Hut, 4.1 and 4.2". */
export type StartLine = Mark;

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
 *  where it was on the day — or, with a routing overlay, a routing waypoint
 *  a passage turns at. */
export interface Waypoint {
  /** The mark's id, or the routing waypoint's. */
  mark: string;
  label: string;
  position: Position;
  /** The authority for `position`: the mark's own `source`, else its file's
   *  — the card's for the start line and the finish, the marks file's for
   *  the rest, the routing overlay's for a routing waypoint. Absent where
   *  the position was given for the race, which makes it the caller's, and
   *  where no file names a source. */
  source?: string;
  /** A routing waypoint: a point a passage turns at, not a mark of the
   *  course. Nobody rounds it; it says where the water is. */
  routing?: true;
}

/** How a routing overlay speaks for a leg: a straight line it checked and
 *  found sailable, one leg of a passage it routes round what the straight
 *  line crosses, or neither — a pair it does not list, or one whose marks
 *  have moved from where it checked them. */
export type LegReview = 'direct' | 'passage' | 'unreviewed';

/** One leg of a course: the great-circle distance and initial true bearing
 *  from one waypoint to the next. */
export interface CourseLeg {
  from: Waypoint;
  to: Waypoint;
  distanceNm: number;
  bearingDeg: number;
  /** With a routing overlay, how it speaks for this leg. Absent without
   *  one: no overlay makes no claim. */
  review?: LegReview;
  /** With a routing overlay, which leg of the course as the card gives it
   *  this one sails — the index of the pair of consecutive marks it runs
   *  between. A passage splits one card leg into several legs that share it. */
  cardLeg?: number;
  /** With a routing overlay, how far, in metres, this leg's ends were from
   *  the positions the overlay assumed for them: the water between is not
   *  what it checked. Absent where both ends were where it assumed. */
  offsetM?: number;
}

/** A point a passage turns at that is not a mark. */
export interface RoutingWaypoint {
  id: string;
  name?: string;
  position: Position;
  note?: string;
}

/** The position a routing overlay's verdicts assume for a mark, and how far
 *  the mark may be from it before they no longer hold. A mark with no fixed
 *  position — the start line — may have several, each with its own `id`;
 *  one with `as` stands the mark in for another, taking that one's assumed
 *  position, passages and pairs. */
export interface AssumedPosition {
  /** What passages and pairs call it; the mark's own id unless given. */
  id: string;
  /** The mark it is a position for: a marks file id, or the card's start
   *  line or finish. */
  mark: string;
  /** Exactly one of `position` and `as`. */
  position?: Position;
  as?: string;
  toleranceM: number;
  note?: string;
  /** Where the position came from, where it is not the overlay's source. */
  source?: string;
}

/** A leg the straight line will not do, as the points it turns at. */
export interface Passage {
  /** Assumed-position ids. */
  from: string;
  to: string;
  /** Routing waypoint ids or assumed-position ids, in order from `from`. */
  via: string[];
  note?: string;
}

/** A pair checked and found sailable as a straight line. */
export interface DirectPair {
  from: string;
  to: string;
  note?: string;
}

/** Local knowledge of which legs are sailable and how a fleet goes round
 *  the ones that are not: a layer of its own over a data set's marks, with
 *  its own provenance. See docs/format.md. */
export interface RoutingFile {
  formatVersion: number;
  club?: string;
  name?: string;
  source?: string;
  /** Who made it. */
  contributor?: string;
  /** How its verdicts were reached. */
  method?: string;
  /** The marks file it was made against, by name. */
  marks?: string;
  notes?: Note[];
  assumed: AssumedPosition[];
  waypoints: RoutingWaypoint[];
  passages: Passage[];
  direct: DirectPair[];
}
