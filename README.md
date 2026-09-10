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
  the side it is left on and whether it is a passing mark, and the **start
  line** every course begins at, read from the club's sailing instructions
  and quoted from them.

A card cannot know where the start line was on the day, nor where the marks
laid per race went. Those are supplied to the library per race.

## The library

```ts
// npm install @sailscoring/course-cards
import { courseLegs, destination, parseCourseCardFile, parseMarksFile } from '@sailscoring/course-cards';

const marks = parseMarksFile(JSON.parse(marksJson));
const card = parseCourseCardFile(JSON.parse(cardJson));

const start = { lat: 53.4055, lng: -6.0675 };
const legs = courseLegs(card, marks, '041', {
  marks: {
    SL: start, // where the line was: the card quotes the SI, not a position
    Z: destination(start, 190, 1000), // laid 1,000 m upwind on 190°
    F: { lat: 53.4085, lng: -6.0705 },
  },
});
// legs[i] = { from, to, distanceNm, bearingDeg }
```

`courseLegs` walks the course's marks — the first of which is the card's
start line — and returns every leg's great-circle distance and initial true
bearing; a mark it cannot place is an error naming the mark and quoting
where the club says it is laid. What the wind was doing on each leg is the
caller's knowledge, not the library's — though where a card lays its
courses out for a wind, as HYC's do, each course carries it as
`windDirectionDeg`, so a caller can propose it.

Around that:

- `courseMarks(card, marks, courseId)` — the course's marks resolved, each
  saying whether the card places it; the ones it does not are what to ask
  the race officer for.
- `legsFromWaypoints(waypoints)` — the leg arithmetic on its own, for a
  course built by hand from placed marks with no card behind it.
- `parsePosition` / `formatPosition` — positions the way sailors write
  them: degrees and decimal minutes with or without the symbols, degrees
  minutes and seconds, decimal degrees; the hemisphere as a letter before or
  after, or a sign.
- `distanceNm`, `bearingDeg`, `destination`, `METRES_PER_NM`,
  `METRES_PER_CABLE` — the geometry for the arithmetic around a race.
- `renderCourseSvg(marks, course)` — the course as a picture: marks at
  their real relative positions, legs numbered with bearing and distance,
  north arrow, scale bar; one inert SVG element with no script, style, id or
  external resource, so it can go inline anywhere.
- `parseCatalogue` — a release's `index.json`, typed.

The package is ESM, and also loadable from CommonJS: the `exports` map
carries a `require` condition, and Node has been able to `require()` an ESM
module since 22.12 (the minimum in `engines`). So `const { courseLegs } =
require('@sailscoring/course-cards')` works, which matters for consumers
that cannot set `"type": "module"` at their root. `pnpm check:cjs` guards it
after a build, in CI and again on the packed artifact before it is published.

## Data

Each club's PDFs are kept alongside its JSON, and the JSON is **generated
from them** by the tools in `tools/`. A card's PDF is not the whole story:
the club's **sailing instructions** are what define the start line every
course begins at, say which card is used when, and give the conventions the
card's letters are printed under. Each data set therefore keeps the sailing
instructions that bear on its courses in `source/` too — only those; a
club's amendments are kept when they change something a card depends on and
left out when they do not, and the manifest records which and why. Every one
gets a Markdown sidecar (`foo.pdf` → `foo.md`, by `tools/pdf_markdown.py`)
so its text is greppable and diffable without a PDF viewer, following the
practice of the sibling `reference-docs` store; the PDF stays the source of
truth and the sidecar is regenerated and verified like every other artifact. The same pipeline renders each card
as a self-contained HTML page: the course table as printed, the marks over
an OpenStreetMap + OpenSeaMap chart — pick a course and it is drawn there,
leg by leg, with each leg's true bearing and distance — bearings and
distances between marks, and the notes. No scripts: the picker is a radio
button per course and a CSS rule. Every data set has a README saying how,
and how it was checked.

- `data/hyc/al-2025/` — Howth Yacht Club's Autumn League 2025: the marks
  from the course card technical sheet, and the offshore and inshore
  committee-boat-start course cards (180 courses each) with the sheet's
  notes. The technical sheet is parsed from its text layer; the two cards
  are pictures, read by a small purpose-built OCR. The two start lines —
  north and north-west of Ireland's Eye — come from SI 6.1 and 6.2.
  Published:
  [offshore](https://courses.sailscoring.ie/hyc/al-2025/offshore.html),
  [inshore](https://courses.sailscoring.ie/hyc/al-2025/inshore.html);
  [README](data/hyc/al-2025/README.md).
- `data/hyc/al-2026/` — Howth Yacht Club's Autumn League 2026: the offshore
  and inshore cards the club published on 9 September, 72 courses each,
  lettered A–T by the wind the row is laid out for. These are real-text
  PDFs, so the side of every mark is read from the colour the PDF sets for
  the letter — no OCR — and the letters themselves are read a second time,
  independently, out of the plain text layer. The marks are the 2025
  technical sheet's, the club having published no 2026 one; the two start
  lines, north and north-west of Ireland's Eye, come from SI 6.1 and 6.2.
  Unlike the drafts these replace, the published cards print no distances,
  so there is nothing left to cross-check them against — what that cost, and
  the single course that changed, are in the README.
  [README](data/hyc/al-2026/README.md).
- `data/hyc/brass-monkey-2025/` — Howth Yacht Club's Brass Monkey Winter
  Series 2025: the eight marks and 16 courses from the course card in the
  last two pages of the sailing instructions, read from the PDF's text layer
  and checked against the SI's own picture of the marks. The SI gives names
  and positions only, and misplaces Portmarnock; shapes, colours and that
  position come from the Autumn League sheet, as the README records. The
  start line is SI 12.1's, in SI 8.1's race area.
  [README](data/hyc/brass-monkey-2025/README.md).
- `data/dlcc/regattas-2026/` — the Dun Laoghaire Combined Clubs regattas
  2026 (DMYC, NYC, RIYC and RStGYC, June–July), whose common sailing
  instructions carry the cruisers' "Course Card A" in Addendum A as a
  picture: 16 lettered sections of four courses round DBSC's marks, read by
  a small purpose-built OCR, with the marks from DBSC's own sheet, which
  the addendum reproduces, and the start line from Addendum A 3.1.
  [README](data/dlcc/regattas-2026/README.md).
- `data/dbsc/summer-2026/` — Dublin Bay Sailing Club's Summer Series 2026:
  the 26 marks from the club's marks, bearings and distances sheet, and the
  five keelboat course cards (Saturday committee vessel and hut, Thursday
  Blue and Red fleets, Tuesday hut; 592 courses), all read from the PDFs'
  text layers and cross-checked against the club's own machine-readable
  CSV/GPX files — which agree apart from one course, recorded in the
  manifest. The start lines come from the sailing instructions supplements:
  B's committee vessel for cards 1, 3 and 4, and H's fixed transit at the
  West Pier hut for cards 2 and 5.
  [README](data/dbsc/summer-2026/README.md).

```sh
pnpm data        # rewrite the JSON from the PDFs, then the HTML from the JSON
pnpm data:check  # verify the committed files are what a fresh run produces
```

The extraction tools need Python 3, Pillow, and poppler's `pdftotext` /
`pdftoppm` / `pdfinfo`; rendering needs only Node.

## Releases and the site

Releases are tagged `vMAJOR.MINOR.PATCH`; the tag is also the version of
the artifacts, and each GitHub Release attaches:

- **`course-cards-vX.Y.Z.zip`** — every data set: marks and cards as JSON,
  the rendered HTML pages, the chart image, the clubs' source PDFs and the
  provenance manifests, plus the format spec.
- **`catalogue.json`** — what the release contains, with the URL of every
  artifact on the site.
- **`sailscoring-course-cards-X.Y.Z.tgz`** — the library as packed for
  npm, where it is published as
  [`@sailscoring/course-cards`](https://www.npmjs.com/package/@sailscoring/course-cards).

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
Vercel on every push to `main`.

### Cutting a release

1. Bump `version` in `package.json` and commit.
2. `git tag -a vX.Y.Z -m "…"`, then push `main` and the tag.
3. The release workflow tests, checks the tag matches `package.json`, attaches
   the assets to a GitHub Release, and **stages** the npm publish.
4. Approve the staged version — see below. **Until you do, nothing is
   installable from npm.** A green release workflow is not a finished release.

A re-run of a failed release uses the workflow file as it stood *at the tag*,
so a fix to the workflow only takes effect on a new tag.

### Publishing to npm

Publishing uses npm's **trusted publishing** with **staged publishing**, and
the two do different jobs.

Trusted publishing removes the credential: the workflow proves its identity to
the registry over GitHub's OIDC, so there is no token in the repository,
nothing to rotate, no expiry to track, and provenance is attached
automatically. It replaced a granular access token in September 2026, when npm
began restricting tokens that bypass two-factor authentication — such a token
can no longer publish directly, and CI cannot answer an OTP prompt, so no
token-based publish from Actions can succeed.

Staged publishing puts a person back in the loop. The trusted publisher is
configured **stage-only**, so the workflow runs `npm stage publish` and can do
nothing more: the tarball lands in a staging queue, and a maintainer promotes
it with 2FA. A compromised workflow can therefore stage something, but cannot
put it in front of anyone.

Approving a staged version, from a terminal that can answer a 2FA prompt:

```sh
npm stage list                  # versions awaiting approval
npm stage view <stage-id>       # inspect the tarball before promoting it
npm stage approve <stage-id>    # promote it; prompts for 2FA
npm stage reject <stage-id>     # or discard it
```

`approve` and `reject` need interactive authentication and cannot use an OIDC
token, so they are never automatable — by design. The package page on
npmjs.com does the same job.

The trust is configured on the registry side, at npmjs.com →
`@sailscoring/course-cards` → **Settings** → **Trusted Publisher** → GitHub
Actions:

| Field | Value |
|---|---|
| Organization | `sailscoring` |
| Repository | `course-cards` |
| Workflow filename | `release.yml` |
| Environment | *(empty)* |

Every field is case-sensitive and matched exactly, so **renaming
`release.yml`, the repository, or the org breaks publishing** until the
registry side is updated to match. The symptom is an authentication error or
an OTP prompt on the stage step, not a helpful message about mismatched
configuration.

The job needs `id-token: write` (it has it) and npm 11.5.1 or newer, which is
why it upgrades npm before publishing rather than trusting whatever the Node
release bundles.

## Status

Format-first: the versioned format and leg library are the deliverable,
with a course renderer beside them; a club-facing card designer grows here
later. Part
of the [Sail Scoring](https://github.com/sailscoring/sailscoring) project,
whose app consumes this format to fill in a race's legs by course number.

License: MIT. "Sail Scoring" and its logo are trademarks of Mark McLoughlin
and not covered by the code license.
