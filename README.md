# course-cards

Sailing marks, course cards, and leg geometry: a **versioned data format**
for the course card a club prints — its racing marks and its numbered
courses as mark sequences — plus a small, dependency-free TypeScript
library that turns a course number and the race-day positions into the
legs actually sailed, each with its distance and true bearing.

The format is the product; the library proves it. A club's card encoded
once serves every consumer: a scoring application that needs the legs of a
constructed course, a results page rendering the course, and eventually a
card-designing tool.

## The format (v1)

Two file kinds, plain JSON, specified in [`docs/format.md`](docs/format.md):

- **Marks** — the racing marks a club lists: id, name, physical description,
  and either a fixed position or a note on where the mark is laid per race
  ("Upwind of Start Line").
- **Course card** — the courses as ordered mark sequences, each mark with
  the side it is left on and whether it is a passing mark.

A card cannot know where the start line was on the day, nor where the marks
laid per race went. Those are supplied to the library per race.

## The library

```ts
// npm install https://github.com/sailscoring/course-cards/releases/download/v0.1.0/sailscoring-course-cards-0.1.0.tgz
import { courseLegs, destination, parseCourseCardFile, parseMarksFile } from '@sailscoring/course-cards';

const marks = parseMarksFile(JSON.parse(marksJson));
const card = parseCourseCardFile(JSON.parse(cardJson));

const start = { lat: 53.4055, lng: -6.0675 };
const legs = courseLegs(card, marks, '041', {
  start,
  marks: {
    Z: destination(start, 190, 1000), // laid 1,000 m upwind on 190°
    F: { lat: 53.4085, lng: -6.0705 },
  },
});
// legs[i] = { from, to, distanceNm, bearingDeg }
```

`courseLegs` walks start → each of the course's marks and returns every
leg's great-circle distance and initial true bearing; a mark it cannot
place is an error naming the mark and where the club says it is laid. What
the wind was doing on each leg is the caller's knowledge, not the
library's. The geometry primitives (`distanceNm`, `bearingDeg`,
`destination`) are exported for the arithmetic around a race.

## Data

`data/hyc/al-2025/` — Howth Yacht Club's Autumn League 2025: the marks
from the course card technical sheet, and the offshore and inshore
committee-boat-start course cards (180 courses each) with the sheet's
notes. The club's PDFs are kept alongside, and the JSON is **generated
from them** by the tools in `tools/` — a text-layer parser for the
technical sheet and a small purpose-built OCR for the two cards, which are
pictures. The same pipeline renders each card as a self-contained HTML
page: the course table as printed, the marks over an OpenStreetMap +
OpenSeaMap chart, bearings and distances between marks, and the notes.
Published: [HYC offshore](https://courses.sailscoring.ie/hyc/al-2025/offshore.html),
[HYC inshore](https://courses.sailscoring.ie/hyc/al-2025/inshore.html). See the
[data README](data/hyc/al-2025/README.md) for how, and how it was checked.

```sh
pnpm data        # rewrite the JSON from the PDFs, then the HTML from the JSON
pnpm data:check  # verify the committed files are what a fresh run produces
```

The extraction tools need Python 3, Pillow, and poppler's `pdftotext` /
`pdftoppm`; rendering needs only Node.

## Releases and the site

Releases are tagged `vMAJOR.MINOR.PATCH`; the tag is also the version of
the artifacts, and each GitHub Release attaches:

- **`course-cards-vX.Y.Z.zip`** — every data set: marks and cards as JSON,
  the rendered HTML pages, the chart image, the clubs' source PDFs and the
  provenance manifests, plus the format spec.
- **`catalogue.json`** — what the release contains, with the URL of every
  artifact on the site.
- **`sailscoring-course-cards-X.Y.Z.tgz`** — the library, packed for
  `npm install <url>`.

[courses.sailscoring.ie](https://courses.sailscoring.ie) lists the available
course cards and serves every artifact at its own URL — unversioned for the
current release, and under `/vX.Y.Z/` for the release it belongs to:

```
https://courses.sailscoring.ie/hyc/al-2025/offshore.json
https://courses.sailscoring.ie/v0.1.0/hyc/al-2025/offshore.json
https://courses.sailscoring.ie/v0.1.0/course-cards-v0.1.0.zip
https://courses.sailscoring.ie/index.json
```

A deploy carries one release; earlier releases stay downloadable from
GitHub. The site is built by `pnpm site` into `site/` and deployed by
Vercel on every push to `main`. Cutting a release is bumping the version in
`package.json`, committing, and pushing an annotated `vX.Y.Z` tag.

## Status

Format-first: the versioned format and leg library are the deliverable; a
rendering component and a club-facing card designer grow here later. Part
of the [Sail Scoring](https://github.com/sailscoring/sailscoring) project,
whose app consumes this format to fill in a race's legs by course number.

License: MIT. "Sail Scoring" and its logo are trademarks of Mark McLoughlin
and not covered by the code license.
