# The course-cards format, version 2

Two JSON file kinds. Every file carries `formatVersion` (an integer); a
reader must refuse a version newer than it understands and accept anything
older. Positions are decimal degrees, WGS84, west and south negative.

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
- `source` — the document the file was made from.

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
- `startLine` — where the race starts. A card names the marks of a course
  but not the line it begins at: that is in the club's **sailing
  instructions**, so it is read from them and carried here. It is a mark in
  every respect — the same `id`, `name`, `shape`, `color`, `position` and
  `placement` — plus a `source` saying which instruction defines it. Its id
  resolves ahead of the marks file, so a club whose start line is one of its
  own marks can say so. A line laid on the day has a `placement` in the
  club's own words and no `position`, exactly like HYC's Zephyr; a fixed one
  — DBSC's transit at the West Pier hut — could carry a `position`.

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
  the column; the 2026 drafts letter the rows A–T and print the wind beside
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
  assumptions: it allows for beating (HYC's Autumn League card lengthens
  every upwind leg by 40% offshore and 50% inshore), and for the legs to and
  from marks the card cannot place. So it is not the sum of the legs the
  library computes from the marks, and a reader must not treat it as one —
  it is what the card tells a competitor to expect.
- `courses[].marks` — every mark of the course in sailing order, beginning
  with the card's start line, so the first leg runs from the line to the
  first mark the club prints. Marks laid per race are in the sequence like
  any other: HYC's courses all read `SL Z … F`. `side` is the side the mark
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

`marks` gives positions for everything the card cannot place — the start
line, the marks laid on the day — and may also override a fixed mark that
was moved. The sailed course is then the course's marks in order, and each
leg's distance and true bearing follow from the positions. A laid mark's
position typically comes from the committee boat's log — "1,000 m upwind at
250°" — for which the library provides the great-circle `destination`
helper. A mark with no position from either source is an error naming it and
quoting where the club says it goes, so the caller knows what to ask the
race officer for.

## Versioning

`formatVersion` bumps when a change would make an older reader mis-read a
file — new optional fields ride along without a bump.

- **Version 1** — the initial format. Courses began at the first mark the
  card printed, and the start line was supplied per race, outside the files.
- **Version 2** — the start line is a mark of the course. A card carries a
  `startLine`, and every course begins with it. A version 1 reader would
  mis-read a version 2 card: it would take the start line for an ordinary
  mark and add a leg to it from a start position of its own. In the library,
  `RacePositions.start` is gone with it — the line's position is given in
  `marks` under its id, like any other mark laid on the day.
