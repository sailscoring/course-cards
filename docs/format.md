# The course-cards format, version 2

Two JSON file kinds, and a third that a data set may add: the routing
overlay. Every file carries `formatVersion` (an integer); a reader must
refuse a version newer than it understands and accept anything older. Positions are decimal degrees, WGS84, west and south negative.

## Marks file

The racing marks a club (or class) lists — on HYC's course card technical
sheet, a table of letter, name, shape, colour and position.

```json
{
  "formatVersion": 2,
  "club": "HYC",
  "name": "Autumn League 2025 racing marks",
  "source": "https://hyc.ie/system/resources/2331/original/AL_Course_Card_Technical_Sheet.pdf",
  "marks": [
    {
      "id": "I",
      "name": "Island",
      "shape": "conical",
      "color": "black",
      "position": { "lat": 53.411667, "lng": -6.072667 }
    },
    {
      "id": "Z",
      "name": "Zephyr",
      "shape": "inflatable",
      "color": "black",
      "placement": "Upwind of Start Line"
    }
  ]
}
```

- `id` — the card's label for the mark, unique within the file; usually one
  letter, matched verbatim by course sequences.
- `shape` / `color` — free-text physical description, lowercase by
  convention. Display hints, not semantics.
- `position` — where the mark is, for marks with a fixed position.
- `placement` — for a mark laid per race, where the club says it goes. A
  mark with no `position` has none until race day: its position is a
  race-day fact that whoever computes the legs must supply. HYC's Zephyr
  (the windward mark) and Finish are such marks; a club whose windward mark
  is a fixed mark simply has a position for it.
- `source` (on the file) — the document the file was made from, and the
  authority for the position of every mark that names no `source` of its
  own. A URL, where the document is published.
- `source` (on a mark) — the authority for that mark's position, where it
  is not the file's: a document and clause, a published set of positions,
  or a named person's local knowledge, in words. Absent, the position is
  the file's `source`'s. It speaks for the position only: a mark's name,
  shape and colour may come from elsewhere — HYC's Brass Monkey marks take
  theirs from the Autumn League sheet — without the mark naming it, because
  a reader acts on where a mark is, not on what it looks like. One file can
  hold positions from several authorities — Kinsale's
  is the club's table of approximate positions with the Commissioners of
  Irish Lights' Cork buoy added from OpenStreetMap — and a reader may well
  treat them differently: a navigation buoy is where the chart puts it, a
  club's laid mark is where the club last laid it.

  ```json
  {
    "id": "Cork Buoy",
    "name": "Cork",
    "shape": "safe water buoy",
    "color": "red and white",
    "position": { "lat": 51.71599, "lng": -8.26017 },
    "source": "OpenStreetMap node 1593411492 (CIL00240)"
  }
  ```

  It is the same field as the start line's `source` below, for the same
  reason; there it names the instruction that defines the line, which is
  also where any position the line has comes from.
- `notes` — what the file's `source` says about its marks, as printed, in
  the card's shape: each a `text` whose paragraphs are separated by
  newlines, and a `title` — the heading it is printed under, or a short one
  of our own where it has none. DBSC's marks sheet heads its table "Mark
  positions may vary slightly. All figures are approximate."; that is a
  note:

  ```json
  "notes": [
    { "title": "Positions", "text": "Mark positions may vary slightly. All figures are approximate." }
  ]
  ```

  A note is always the words of the file's `source`, never of a mark's own,
  so it speaks for the marks that are the file's and for no others.

  The format has no field that says a position is approximate, or how
  approximate. Most clubs do say so, and their words are carried here; a
  reader that must act on it reads the note. A field a program can branch
  on will be added, beside the words it rests on, when a reader needs one.
  What it will not carry is a figure no source states. The tolerances the
  data sets' cross-checks are held to are not such figures: each compares
  one statement of a position with another — the club's sheet with the
  harbour authority's notice, the club's position for a buoy with the
  chart's, the club's printed bearings with its own positions — and none
  says where a mark is. A note's absence means the source says nothing,
  not that its positions are exact.

## Course card file

The card a club prints: the courses, each an ordered sequence of marks.

```json
{
  "formatVersion": 2,
  "club": "HYC",
  "name": "Autumn League 2025 course card, inshore committee boat starts",
  "source": "https://hyc.ie/system/resources/2330/original/AL_Course_Card_Inshore_01.pdf",
  "marks": "marks.json",
  "startLine": {
    "id": "SL",
    "name": "Start line",
    "placement": "The starting area will be Northwest of Ireland's Eye. The Starting Line shall be between an orange buoy with an orange flag (to be passed to port) and a red/white pole or the mainmast of the Committee Starting Vessel that will display an orange flag.",
    "source": "HYC Autumn League 2025 sailing instructions 6.2 A and B"
  },
  "courses": [
    {
      "id": "041",
      "windDirectionDeg": 40,
      "marks": [
        { "mark": "SL" },
        { "mark": "Z", "side": "port" },
        { "mark": "W", "side": "port" },
        { "mark": "C", "side": "port" },
        { "mark": "H", "side": "port" },
        { "mark": "S", "side": "starboard", "passing": true },
        { "mark": "F", "side": "port" }
      ]
    }
  ]
}
```

- `marks` — the marks file the card's mark ids refer to, by name.
- `finish` — where the race ends, for a card that does not print it. Some
  clubs stop a course at its last rounding mark and put the run home in the
  **sailing instructions**: HYC's 2026 Autumn League cards end every course
  at K or G offshore, and SI 6.1 D sends them on "passing the Rowan Rocks
  Buoy and the Howth Mark (both IALA marks) to starboard" to the line at the
  East Pier. That ending is the same for every course on the card, so it is
  read from the instructions and carried here:

  ```json
  "finish": {
    "id": "FH",
    "name": "Finish line",
    "position": { "lat": 53.39334, "lng": -6.06529 },
    "placement": "For all Round the Cans Races (unless the course is shortened) the finish will be on the HYC finish line in Howth Sound…",
    "source": "HYC Autumn League 2026 sailing instructions 6.1 D",
    "via": [
      { "mark": "Q", "side": "starboard", "passing": true },
      { "mark": "HM", "side": "starboard", "passing": true }
    ]
  }
  ```

  It is a mark in every respect, like `startLine`, and its id resolves ahead
  of the marks file the same way; `via` is the marks the run in passes on the
  way to it. **Every course's `marks` already ends with `via` and then the
  line**, so a reader that walks the sequence needs to know nothing about
  this field: it is here to say which of those entries the card does not
  print, and which instruction is the authority for them. A card that prints
  its own ending — HYC's 2025 cards, whose courses end at F — carries it in
  the sequences and no `finish`.

  A finishing line laid on the day has a `placement` and no `position`, and a
  consumer is asked for it as it is asked for the start line; one with a
  fixed end, like the transit on the front of HYC's Finisher's Hut, can carry
  a position.
- `startLine` — where the race starts. A card names the marks of a course
  but not the line it begins at: that is in the club's **sailing
  instructions**, so it is read from them and carried here. It is a mark in
  every respect — the same `id`, `name`, `shape`, `color`, `position` and
  `placement` — and its `source` says which instruction defines it. Its id
  resolves ahead of the marks file, so a club whose start line is one of its
  own marks can say so. A line laid on the day has a `placement` in the
  club's own words and no `position`, exactly like HYC's Zephyr; a fixed one
  — DBSC's transit at the West Pier hut — could carry a `position`.

  A line has two ends, and where the sailing instructions say what forms
  them the card carries them as `ends`: one `starboard` and one `port`,
  named as the instructions name them, looking towards the first mark —
  not committee boat and pin, since the committee boat is not always at the
  starboard end. Each end may have a `name` in the club's words ("Red and
  white staff on the committee vessel"), and is placed one of three ways: a
  `position` of its own for a fixed end (the pole in front of a hut), a
  `mark` naming one of the marks file's marks (a club buoy that forms the
  pin), or neither, with a `placement` saying where it is laid on the day.
  An end's `source` is the instruction defining it, where that is not the
  line's own.

  ```json
  "startLine": {
    "id": "SL",
    "name": "Start line",
    "source": "CYBC sailing instructions 7.1 and 7.2",
    "ends": [
      { "end": "starboard", "name": "Mainmast of the committee boat", "placement": "Laid on the day" },
      { "end": "port", "name": "Outer pin-end mark", "placement": "Laid on the day" }
    ]
  }
  ```

  **Legs to and from a line with ends are measured from its geodesic
  midpoint**, which is how clubs' cards and race officers measure them. The
  line is still one mark of the course, by its id: no course's `marks`
  changes. A line with ends may carry a `position` as well, for readers
  that know nothing of ends; where both ends are fixed by `position`, it
  must be their midpoint, and the parser holds it to that within 5 m. A
  finish carries `ends` exactly as a start line does, and a course that
  finishes on the start line ends its sequence with the start line's id —
  the same line, ends and all.

  The start line belongs to the card, not to the marks file, because one
  marks file serves cards that start in different places: HYC's Autumn
  League offshore and inshore cards share a technical sheet but start north
  and north-west of Ireland's Eye respectively, and DBSC's five cards share
  a marks sheet but start either at a committee vessel or at the hut.
- `notes` — the club's explanatory text that goes with the card, as
  printed, each with a `title` and a `text` whose paragraphs are separated
  by newlines: HYC's "Navigation Marks and Obstructions" and "Course
  Selection". Cards sharing a technical sheet each carry a copy.
- `courses[].id` — what the race committee displays; any string. HYC's
  Autumn League 2025 cards number their courses so that the first two
  digits × 10 are the wind the row is laid out for and the third digit is
  the column; the 2026 cards letter the rows A–T and print the wind beside
  each. The format stores the id as printed — the encoding is the club's —
  and carries the wind itself in `windDirectionDeg`.
- `courses[].windDirectionDeg` — the true wind direction, in degrees, the
  club laid the course out for, where the card says so. HYC's cards are a
  row per wind: the first leg from the line to Z is a beat, and the race
  committee picks the row for the day's wind. It is what a scorer expects
  the wind to be, not a record of what it was — a card that gives no wind
  (DBSC's, DLCC's) omits it.
- `courses[].distanceNm` — the course's length in nautical miles, where the
  club prints one, as printed. It is the club's figure on the club's own
  assumptions: it allows for beating (the 2026 drafts of HYC's Autumn League
  card lengthened every upwind leg by 40% offshore and 50% inshore), and for
  the legs to and from marks the card cannot place. So it is not the sum of
  the legs the library computes from the marks, and a reader must not treat
  it as one — it is what the card tells a competitor to expect. No card in
  `data/` prints one at present: HYC's 2026 drafts did and the cards the
  club went on to publish do not.
- `courses[].marks` — every mark of the course in sailing order, beginning
  with the card's start line and ending at the line it finishes at, so the
  first leg runs from the start line to the first mark the club prints and
  the last runs to the finish. Marks laid per race are in the sequence like
  any other: HYC's courses all read `SL Z … F`. Where the club prints neither
  end, both come from the sailing instructions — the head from `startLine`,
  the tail from `finish` — and are in the sequence all the same, because a
  course that stops at the last mark printed is short by the run home, and
  nothing in a bare sequence says so. `side` is the side the mark
  is left on — `"port"` or `"starboard"` — and absent when the card doesn't
  say, as it doesn't for a start line. `passing: true` marks a passing (not
  rounding) mark, boxed on HYC's cards.

A course card says where the start line is only as well as the sailing
instructions do — usually a description, not a position — and says nothing
about the race-by-race positions of its laid marks. Those are not the
card's to know.

## Race positions (per race, not part of the card)

What the leg library needs beyond the two files:

```json
{
  "marks": {
    "SL": { "lat": 53.4055, "lng": -6.0675 },
    "Z": { "lat": 53.39566, "lng": -6.07025 },
    "F": { "lat": 53.4085, "lng": -6.0705 }
  }
}
```

A line may be given its ends instead of one position — where the committee
boat and the pin were:

```json
{
  "marks": {
    "SL": { "ends": { "starboard": { "lat": 51.7825, "lng": -8.23442 }, "port": { "lat": 51.78045, "lng": -8.23508 } } }
  }
}
```

Each end is then placed from the race if given there, else from the card —
its own `position`, or where its `mark` was (for the race, or in the marks
file). The leg is measured from the ends' midpoint, and the library's
waypoint for the line says so (`line: "midpoint"`) and carries the ends. An
end nobody places is an error naming it and quoting its `placement`: the
library never guesses a midpoint from one end. A plain position for a line
is the line as one point — the committee boat alone, say — and so is a
card's own `position` for a line the race says nothing of. Ends given for a
line the card gives none make one all the same.

`marks` gives positions for everything the card cannot place — the start
line, the marks laid on the day — and may also override a fixed mark that
was moved. The sailed course is then the course's marks in order, and each
leg's distance and true bearing follow from the positions. A laid mark's
position typically comes from the committee boat's log — "1,000 m upwind at
250°" — for which the library provides the great-circle `destination`
helper. A mark with no position from either source is an error naming it and
quoting where the club says it goes, so the caller knows what to ask the
race officer for.

A course the race officer **called on the day** rather than displayed by
number — most clubs' racing, and a possibility at every club with a card —
is not in either file: it is a sequence of the marks file's ids with sides,
handed to the library per race like the positions are, and resolved against
the card (for its start line and finish) and the marks file exactly as a
numbered course is. Nothing is stored, so the format does not change; a
club with no numbered courses at all publishes a card with `courses: []`,
carrying its start line, its finish and its notes, over its marks file.

## Routing overlay (optional)

A leg is the straight line between two marks, and in pilotage waters that
line can cross land or a bank: no boat sails it, and its distance is short.
Which legs are sailable, and how the fleet goes round the ones that are not,
is local knowledge that no card prints. A routing overlay is that knowledge
for one data set, from whoever has it — a sailor who races there, the club —
and validated by them: a `routing.json` beside the marks file. It is a layer
of its own, with its own provenance, and it changes nothing in the card or
the marks file. A card's new revision is published without it, and an
overlay nobody maintains blocks nothing: the legs it no longer speaks for go
back to being straight lines, marked unreviewed.

```json
{
  "formatVersion": 2,
  "club": "RCYC",
  "name": "Cork Harbour passages for the 2026 keelboat card",
  "source": "https://github.com/Bateleur88/cork-harbour-orc",
  "contributor": "Pat Tanner",
  "method": "Local knowledge; each straight line between marks and waypoints tested against INFOMAR 2 m bathymetry, at least 1.5 m below chart datum",
  "marks": "marks.json",
  "assumed": [
    { "mark": "W2", "position": { "lat": 51.794867, "lng": -8.2723 }, "toleranceM": 20 },
    { "mark": "Cage", "position": { "lat": 51.8139, "lng": -8.2828 }, "toleranceM": 20 },
    { "id": "SL@grassy-walk", "mark": "SL", "position": { "lat": 51.811908, "lng": -8.283267 }, "toleranceM": 500 },
    { "id": "SL@dosco", "mark": "SL", "as": "Dosco", "toleranceM": 500 }
  ],
  "waypoints": [
    { "id": "RW_Rams_Head", "position": { "lat": 51.809117, "lng": -8.271883 } }
  ],
  "passages": [
    { "from": "W2", "to": "Cage", "via": ["RW_Rams_Head"] }
  ],
  "direct": [
    { "from": "Cage", "to": "No.7" }
  ]
}
```

- `source`, `contributor`, `method` — where the overlay comes from, who
  made it, and how its verdicts were reached. `notes` as in the other files.
- `marks` — the marks file it was made against, by name.
- `waypoints` — the routing waypoints: points a passage turns at that are
  not marks, with an `id`, a `position`, and optionally a `name` and a
  `note`. No boat rounds one; it says where the water is.
- `passages` — a leg the straight line will not do, as the waypoints it
  goes through: `from` and `to` are marks, `via` is the ordered list of
  waypoints, or marks, in between. Each has an optional `note` saying why —
  a bank, or an exclusion zone in the sailing instructions, which no depth
  test would find.
- `direct` — the pairs the contributor checked and found sailable as a
  straight line. It is what tells a leg that was looked at from one that
  never was.

  A pair is listed once, as a passage or as direct, and matches in either
  direction: a passage sailed the other way goes through its waypoints in
  reverse. A pair the overlay does not list is unreviewed — typically one a
  later revision of the card introduced.
- `assumed` — the position the overlay's verdicts assume for each mark they
  rely on, and how far the mark may be from it before they no longer hold.
  A verdict on a narrow channel does not survive a mark moving: every
  passage and direct pair that touches a mark whose position — the marks
  file's, or the race's — is further than `toleranceM` from its assumed
  position is invalid, and its legs come back unreviewed. So the overlay
  goes stale mark by mark when the marks file moves on, and says nothing
  wrong in the meantime.

  A mark with no fixed position — the start line, a mark laid on the day —
  gets an assumed position the same way, and may get several, each with an
  `id` of its own: `SL@grassy-walk` is the start line where the overlay's
  routes from the Grassy Walk assume it, and passages and pairs name it as
  `SL@grassy-walk`. `as` says the mark stands in for another one instead:
  `SL@dosco`, the start line within 500 m of Dosco, takes Dosco's assumed
  position and Dosco's passages and pairs. For each end of a leg the
  library uses the nearest assumed position within tolerance. An `id`
  defaults to the mark's; `note` and `source` say where a position came
  from, where it is not the overlay's.

Given an overlay, the library splits each leg of a course that a passage
covers into the legs actually sailed, through its waypoints, and says of
every leg whether it is `direct`, part of a `passage`, or `unreviewed`; and
how far its ends were from the positions assumed for them, which is how far
the review reaches — a start line 300 m from the Grassy Walk's assumed
position is routed the Grassy Walk's way, but nobody checked the water
between the line and the first waypoint from where the line actually was.
Without an overlay the legs are as they always were, with no review status
at all: no overlay makes no claim, either way.

## Versioning

`formatVersion` bumps when a change would make an older reader mis-read a
file — new optional fields ride along without a bump. `finish` is such a
field: the ending it describes is in every course's `marks` too, so a reader
that has never heard of it still sails the whole course. So is `source` on a
mark: a reader that ignores it takes every mark to be the file's, which is
what it did before. And so are a marks file's `notes`. The routing overlay
is a file of its own beside the others, which a reader that has never heard
of it does not open; the legs it splits are new fields on a leg, and a leg
without them is what it always was. A line's `ends` are the same kind of
field: a reader that ignores them sees the line as the single mark it always
was, placed by its `position` or asked of the race.

- **Version 1** — the initial format. Courses began at the first mark the
  card printed, and the start line was supplied per race, outside the files.
- **Version 2** — the start line is a mark of the course. A card carries a
  `startLine`, and every course begins with it. A version 1 reader would
  mis-read a version 2 card: it would take the start line for an ordinary
  mark and add a leg to it from a start position of its own. In the library,
  `RacePositions.start` is gone with it — the line's position is given in
  `marks` under its id, like any other mark laid on the day.
