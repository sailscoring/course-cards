# The course-cards format, version 1

Two JSON file kinds. Every file carries `formatVersion` (an integer); a
reader must refuse a version newer than it understands and accept anything
older. Positions are decimal degrees, WGS84, west and south negative.

## Marks file

The fixed racing marks a club (or class) maintains.

```json
{
  "formatVersion": 1,
  "club": "HYC",
  "marks": [
    {
      "id": "I",
      "name": "Island",
      "shape": "conical",
      "color": "black",
      "position": { "lat": 53.411667, "lng": -6.073167 }
    }
  ]
}
```

- `id` — the card's label for the mark, unique within the file; usually one
  letter, matched verbatim by course sequences.
- `shape` / `color` — free-text physical description, lowercase by
  convention. Display hints, not semantics.

## Course card file

The card a club prints: numbered courses over the marks, plus the standing
race infrastructure.

```json
{
  "formatVersion": 1,
  "club": "HYC",
  "name": "Autumn League offshore course card",
  "infrastructure": {
    "start": { "lat": 53.41603, "lng": -6.0873 },
    "finish": { "lat": 53.40453, "lng": -6.07395 },
    "firstUpwindDistanceNm": 0.5
  },
  "courses": [
    {
      "id": "001",
      "marks": [
        { "mark": "H" },
        { "mark": "I" },
        { "mark": "K", "rounding": "starboard" }
      ]
    }
  ]
}
```

- `courses[].id` — the number a race committee displays; any string. Clubs
  that encode the design wind in the number may also state it explicitly as
  `windDirectionDeg` — the format stores the fact, not the club's encoding
  convention.
- `courses[].marks` — the fixed marks in sailing order. `rounding` is
  `"port"` or `"starboard"`; absent means the card's default. `passing:
  true` marks a passing (not rounding) mark — boxed on HYC's card.
- The **windward mark is deliberately not in the sequence** when the club
  lays it per race: its position is a race-day fact.
- `infrastructure` — nominal start/finish positions and the nominal first
  beat, used when race-day positions aren't recorded.

## Race geometry (per race, not part of the card)

What the card cannot know, recorded on the day:

```json
{
  "start": { "lat": 53.405033, "lng": -6.069167 },
  "finish": { "lat": 53.403383, "lng": -6.070783 },
  "windwardMark": { "lat": 53.4255, "lng": -6.089 }
}
```

The sailed course is then `start → windwardMark (when laid) → the course's
marks → finish`, and each leg's distance and true bearing follow from the
positions. A laid mark's position typically comes from the committee boat's
log — "1,000 m upwind at 250°" — for which the library provides the
great-circle `destination` helper.

## Versioning

`formatVersion` bumps when a change would make an older reader mis-read a
file — new optional fields ride along without a bump. Version 1 is the
initial format.
