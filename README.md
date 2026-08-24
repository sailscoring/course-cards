# course-cards

Sailing marks, course cards, and leg geometry: a **versioned data format**
for the course card a club prints — its fixed marks, its numbered courses,
its standing race infrastructure — plus a small TypeScript library that
turns a course number and the race-day facts into the legs actually sailed.

The format is the product; the library proves it. A club's card encoded
once serves every consumer: a scoring application deriving ORC
constructed-course legs by course number, a results page rendering the
course, and eventually a card-designing tool.

## The format (v1)

Two file kinds, plain JSON, specified in [`docs/format.md`](docs/format.md):

- **Marks** — the fixed racing marks a club maintains: id, name, physical
  description, decimal-degree position.
- **Course card** — the numbered courses as ordered mark sequences (with
  port/starboard roundings and passing marks), the card's nominal start,
  finish, and first-beat length.

What a card *cannot* know is recorded per race as `RaceGeometry`: where the
start and finish actually were, and — for clubs that lay their windward mark
per race — where it was laid. With those plus a course number, every leg is
geometry.

## The library

```ts
import { parseMarksFile, parseCourseCardFile, resolveRaceLegs, toOrcLegs } from '@sailscoring/course-cards';

const legs = resolveRaceLegs(card, marks, '10', { start, finish });
const orcLegs = toOrcLegs(legs, /* windDirectionDeg */ 340);
```

`resolveRaceLegs` walks start → (laid windward mark) → the course's fixed
marks → finish and returns each leg's rhumb distance and true bearing;
`toOrcLegs` recasts them as ORC rule 402.5 constructed-course legs. The
geometry primitives (`distanceNm`, `bearingDeg`, `destination`) use the same
Earth radius as the hand-computed HYC leg records, which the test suite
reproduces verbatim.

## Data

- `data/hyc-al/` — Howth Yacht Club's Autumn League offshore marks and card.
- `data/hyc-bm/` — the winter (Brass Monkeys) mark set, whose 13 Dec 2025
  course-10 leg record is the library's reference test.

Mark positions and card contents originate from the
[markmate](https://github.com/markmc/markmate) prototype, re-encoded into
this format.

## Status

Format-first: the versioned format and leg library are the deliverable; a
rendering component and a club-facing card designer grow here later. Part of
the [Sail Scoring](https://github.com/sailscoring/sailscoring) project — the
app consumes this format for ORC constructed-course scoring.

License: MIT. "Sail Scoring" and its logo are trademarks of Mark McLoughlin
and not covered by the code license.
