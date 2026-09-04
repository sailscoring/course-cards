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
// npm install @sailscoring/course-cards
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

Each club's PDFs are kept alongside its JSON, and the JSON is **generated
from them** by the tools in `tools/`. The same pipeline renders each card
as a self-contained HTML page: the course table as printed, the marks over
an OpenStreetMap + OpenSeaMap chart, bearings and distances between marks,
and the notes. Every data set has a README saying how, and how it was
checked.

- `data/hyc/al-2025/` — Howth Yacht Club's Autumn League 2025: the marks
  from the course card technical sheet, and the offshore and inshore
  committee-boat-start course cards (180 courses each) with the sheet's
  notes. The technical sheet is parsed from its text layer; the two cards
  are pictures, read by a small purpose-built OCR. Published:
  [offshore](https://courses.sailscoring.ie/hyc/al-2025/offshore.html),
  [inshore](https://courses.sailscoring.ie/hyc/al-2025/inshore.html);
  [README](data/hyc/al-2025/README.md).
- `data/dbsc/summer-2026/` — Dublin Bay Sailing Club's Summer Series 2026:
  the 26 marks from the club's marks, bearings and distances sheet, and the
  five keelboat course cards (Saturday committee vessel and hut, Thursday
  Blue and Red fleets, Tuesday hut; 592 courses), all read from the PDFs'
  text layers and cross-checked against the club's own machine-readable
  CSV/GPX files — which agree apart from one course, recorded in the
  manifest. [README](data/dbsc/summer-2026/README.md).

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
3. The release workflow tests, attaches the assets to a GitHub Release, and
   publishes to npm — if the token below is alive.

### Rotating `NPM_TOKEN`

> ⚠️ **The npm publish token expires every 90 days** — npm's maximum for a
> token with write access. When it lapses, tagging a release still produces
> the GitHub Release but **nothing reaches npm**, and the only symptom is a
> failed "Publish to npm" step. The `npm-token-expiry` workflow opens an
> issue two weeks before the date recorded in the `NPM_TOKEN_EXPIRES`
> repository variable — so **record the date every time you rotate**.

1. npmjs.com → avatar → **Access Tokens** → **Generate New Token** →
   **Granular Access Token**.
2. Expiration **90 days**. **Bypass two-factor authentication: on** (CI
   cannot answer a 2FA prompt). Packages and scopes: **Read and write**,
   restricted to the `@sailscoring` scope. Organizations: **no access**.
   IP allowlist: empty.
3. Store the token and record its expiry, without pasting it anywhere else:

   ```sh
   gh secret set NPM_TOKEN                          # prompts for the value
   gh variable set NPM_TOKEN_EXPIRES --body YYYY-MM-DD
   ```

4. Delete the previous token on npm.

The alternative that needs no token is npm's *trusted publishing*
(GitHub OIDC), configured on the package's npm settings page; if adopted,
drop the token gate from `.github/workflows/release.yml`.

## Status

Format-first: the versioned format and leg library are the deliverable; a
rendering component and a club-facing card designer grow here later. Part
of the [Sail Scoring](https://github.com/sailscoring/sailscoring) project,
whose app consumes this format to fill in a race's legs by course number.

License: MIT. "Sail Scoring" and its logo are trademarks of Mark McLoughlin
and not covered by the code license.
