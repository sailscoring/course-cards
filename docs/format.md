# The course-cards format, version 1

Two JSON file kinds. Every file carries `formatVersion` (an integer); a
reader must refuse a version newer than it understands and accept anything
older. Positions are decimal degrees, WGS84, west and south negative.

## Marks file

The racing marks a club (or class) lists — on HYC's course card technical
sheet, a table of letter, name, shape, colour and position.

```json
{
  "formatVersion": 1,
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
- `notes` — the document's explanatory text, as printed, each with a
  `title` and a `text` whose paragraphs are separated by newlines: HYC's
  "Navigation Marks and Obstructions" and "Course Selection". A course card
  file may carry `notes` too.

## Course card file

The card a club prints: the courses, each an ordered sequence of marks.

```json
{
  "formatVersion": 1,
  "club": "HYC",
  "name": "Autumn League 2025 course card, inshore committee boat starts",
  "source": "https://hyc.ie/system/resources/2330/original/AL_Course_Card_Inshore_01.pdf",
  "marks": "marks.json",
  "courses": [
    {
      "id": "041",
      "marks": [
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
- `courses[].id` — what the race committee displays; any string. HYC's
  three-digit numbers encode the first beat's bearing (first two digits ×
  10) and a column on the card (third digit); the format stores the number
  as printed and leaves the club's encoding convention to the club.
- `courses[].marks` — every mark of the course in sailing order, starting
  after the start line. Marks laid per race are in the sequence like any
  other: HYC's courses all read `Z … F`. `side` is the side the mark is left
  on — `"port"` or `"starboard"` — and absent when the card doesn't say.
  `passing: true` marks a passing (not rounding) mark, boxed on HYC's cards.

A course card says nothing about where the start line is, or the
race-by-race positions of its laid marks: those are not the card's to know.

## Race positions (per race, not part of the card)

What the leg library needs beyond the two files:

```json
{
  "start": { "lat": 53.4055, "lng": -6.0675 },
  "marks": {
    "Z": { "lat": 53.39566, "lng": -6.07025 },
    "F": { "lat": 53.4085, "lng": -6.0705 }
  }
}
```

`start` is where the start line was; `marks` gives positions for the marks
laid on the day, and may also override a fixed mark that was moved. The
sailed course is then `start → the course's marks in order`, and each leg's
distance and true bearing follow from the positions. A laid mark's position
typically comes from the committee boat's log — "1,000 m upwind at 250°" —
for which the library provides the great-circle `destination` helper.

## Versioning

`formatVersion` bumps when a change would make an older reader mis-read a
file — new optional fields ride along without a bump. Version 1 is the
initial format.
