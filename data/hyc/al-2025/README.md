# HYC Autumn League 2025

Howth Yacht Club's Autumn League course cards, as published at hyc.ie:

| File | Source | Made by |
|---|---|---|
| `marks.json` | `source/AL_Course_Card_Technical_Sheet.pdf` | `tools/extract_marks.py` |
| `offshore.json` | `source/AL_Offshore_Course_Card.pdf` | `tools/extract_card.py` |
| `inshore.json` | `source/AL_Course_Card_Inshore_01.pdf` | `tools/extract_card.py` |
| `offshore.html`, `inshore.html`, `map/marks.svg` | the JSON above, `map/background.png` | `tools/render-cards.ts` |
| `map/background.png`, `.json` | OpenStreetMap + OpenSeaMap tiles | `tools/fetch_map.py` |

`manifest.json` records each artifact's source, the URL it was fetched
from, and the metadata that heads the output; `pnpm data` rebuilds them all
(extraction, then rendering) and `pnpm data:check` verifies the committed
files against a fresh run.

The HTML pages are the cards as a web page: the course table as printed,
the marks over a chart on which a picked course is drawn with its legs
numbered and tabulated (true bearing and distance, computed from the
positions; a leg from the start line or touching Z or F, which the card
cannot place, is listed without them), true bearings and distances between
every pair of marks, and the sheet's notes.

**Chart.** The map background is OpenStreetMap with the OpenSeaMap seamark
overlay (the real buoys and lights), fetched once at zoom 14 for the marks'
extent by `python3 tools/fetch_map.py data/hyc/al-2025` and committed as an
8-bit PNG with a sidecar giving its exact bounds, so rendering needs no
network and `pnpm data:check` is reproducible. Re-run the fetch to refresh
it. Both sources require attribution — © OpenStreetMap contributors (ODbL),
© OpenSeaMap contributors (CC BY-SA) — which the page prints on the map and
under it.

## How the JSON is produced

**Marks.** The technical sheet is a real-text PDF. The "Racing Marks" table
is read from `pdftotext -bbox` word positions — column by x, row by the
mark letter's baseline — so wrapped cells ("Orang / e", "Portmarnoc / k")
rejoin correctly. Positions are the sheet's degrees and decimal minutes
converted to decimal degrees; longitudes are West, so negative. Two marks
have prose where their coordinates would be — Zephyr, "Upwind of Start
Line", and Finish, "Between Island Mark and Howth Sound" — and are emitted
without a position and with that text as their `placement`.

**Notes.** The sheet's two passages of explanatory text — "Navigation Marks
and Obstructions" and "Course Selection" — are read from the page regions
beside and below the table by `tools/extract_notes.py` and carried as
`notes` on each card, since they are instructions for sailing the courses;
both cards name the sheet as their notes source in the manifest.

**Cards.** Both cards are pictures: the offshore card's letters are vector
outlines with no text layer, the inshore card is a 150 dpi scan (its text
layer is unusable OCR). `extract_card.py` renders the page at 600 dpi,
finds the 36 × 5 grid from the table rules, segments the red and green
letter glyphs in each cell, reads them line by line, and recognises each by
nearest-template matching against a handful of labelled glyph images per
letter (`tools/templates/<card>/`). It refuses to guess: a glyph whose best
match is not clearly ahead of the runner-up stops the build and must be
resolved by hand in an overrides file — neither card needed one. Red
letters become `side: "port"`, green `"starboard"`; a letter inside a box
becomes `passing: true`. Courses are numbered row + column as the card's
own instructions say (`073` is row 07, column 3).

## How it was checked

- Every glyph on both cards matched a template with a clear margin (worst
  case 0.034 against a required 0.025, on a 0–1 scale where letters differ
  by 0.1 or more).
- The extracted courses were rendered back as text grids and compared
  against the card images row by row; a dozen rows on each card, all
  boxed marks, and all green letters were checked by eye. Structural tests
  confirm every course on both cards runs `Z … F` over marks the sheet
  lists.
- As a one-off check, bearings computed from the extracted positions were
  compared with the sheet's "Relative Bearings Table – Magnetic (Approx)".
  They agree to within 3° for every pair of marks once one consistent
  offset is allowed — 6° W, the magnetic variation off Dublin around 2000,
  so that table is old. Four marks have evidently been moved since it was
  computed: pairs involving Cush, Island, Portmarnock or Spit disagree with
  it by 10–25°. The positions on the technical sheet are taken to be
  current, and the bearings on the HTML pages are computed from them (and
  are true, not magnetic).

## Notes on the cards

- The windward mark Z (Zephyr) and the finish F are marks on the card with
  no fixed position: every course starts `Z` and ends `F`. Where they were
  on a given day is supplied to the library with the start position.
- A boxed `Z` (offshore courses 051, 054, 323, 333) is a passing mark: the
  first leg goes past Zephyr to the next mark.
- The offshore card uses 15 marks (A D E F G H I K M O P T U V Z); the
  inshore card 13 (C D F H I K O P S U V W Z). B, J, Q, R and X are on the
  sheet but on neither card.
