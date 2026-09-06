# HYC Autumn League 2025

Howth Yacht Club's Autumn League course cards, as published at hyc.ie:

| File | Source | Made by |
|---|---|---|
| `marks.json` | `source/AL_Course_Card_Technical_Sheet.pdf` | `tools/extract_marks.py` |
| `offshore.json` | `source/AL_Offshore_Course_Card.pdf`, start line from `source/2025_AL_Sailing_Instruction.Final.pdf` | `tools/extract_card.py`, `tools/extract_start_line.py` |
| `inshore.json` | `source/AL_Course_Card_Inshore_01.pdf`, start line from `source/2025_AL_Sailing_Instruction.Final.pdf` | `tools/extract_card.py`, `tools/extract_start_line.py` |
| `source/*.md` | the sailing instructions below | `tools/pdf_markdown.py` |
| `offshore.html`, `inshore.html`, `map/marks.svg` | the JSON above, `map/background.png` | `tools/render-cards.ts` |
| `map/background.png`, `.json` | OpenStreetMap + OpenSeaMap tiles | `tools/fetch_map.py` |

`manifest.json` records each artifact's source, the URL it was fetched
from, and the metadata that heads the output; `pnpm data` rebuilds them all
(extraction, then rendering) and `pnpm data:check` verifies the committed
files against a fresh run.

The HTML pages are the cards as a web page: the course table as printed,
the marks over a chart on which a picked course is drawn with its legs
numbered and tabulated (true bearing and distance, computed from the
positions; a leg touching the start line, Z or F, which the card cannot
place, is listed without them), true bearings and distances between
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

**Start line.** A course card names the marks; where the race starts is in
the sailing instructions, so it is read from them. SI 6.1 A and B place the
offshore starting area north of Ireland's Eye and define its line between an
orange outer distance mark and the committee vessel's red/white pole; SI 6.2
A and B do the same for the inshore fleet, north-west of Ireland's Eye. Each
card carries its own as a `startLine` with those clauses quoted, and every
course begins there — the two cards share one marks file but not one start
line, which is why the start line lives on the card. `extract_start_line.py`
refuses any text that is not in the SI verbatim.

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

## The sailing instructions

The SIs are source material for the cards, not just background: they define
the start lines above, and 6.1 C and 6.2 C say the windward mark Z is laid
to windward of the line and is the first mark of every fixed-mark course,
which is what the cards show. They are kept in `source/` with the card PDFs,
each with a Markdown sidecar written by `tools/pdf_markdown.py`.

| File | Source |
|---|---|
| `source/2025_AL_Sailing_Instruction.Final.pdf` | [hyc.ie](https://hyc.ie/system/resources/2328/original/2025_AL_Sailing_Instruction.Final.pdf) |
| `source/AL_Change_SI_No_2.pdf` | [hyc.ie](https://hyc.ie/system/resources/2343/original/AL_Change_SI_No_2.pdf), 24 September 2025 |

The club published three changes to the SIs; only no. 2 is kept. No. 1 moved
the finish for classes 4 and 5 and the Howth 17s into Howth Sound on
windward/leeward days, and no. 2 replaces its text in full (adding where the
Finisher's Hut is), so no. 1 is superseded. No. 3 changes the schedule for
18 October and which windward/leeward marks each fleet uses; neither is on a
course card, so it is not kept. None of the three touches the start lines or
the fixed-mark courses.

## How it was checked

- Every glyph on both cards matched a template with a clear margin (worst
  case 0.034 against a required 0.025, on a 0–1 scale where letters differ
  by 0.1 or more).
- The extracted courses were rendered back as text grids and compared
  against the card images row by row; a dozen rows on each card, all
  boxed marks, and all green letters were checked by eye. Structural tests
  confirm every course on both cards runs `SL Z … F` over marks the sheet
  lists, and that each card's start line quotes its own SI clause.
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

- The start line SL, the windward mark Z (Zephyr) and the finish F are marks
  of every course with no fixed position: every course reads `SL Z … F`.
  Where each of the three was on a given day is supplied to the library per
  race, by mark id.
- The offshore card's start line and its finish are described in different
  places and do not match the technical sheet: the sheet has F "Between
  Island Mark and Howth Sound", while SI 6.1 D puts the offshore finish in
  the vicinity of Mark Q (Rowan Rocks), and for classes 4 and 5 on two-race
  days change no. 2 puts it in Howth Sound. `marks.json` keeps the sheet's
  wording for F, since that is the document it is made from; the SIs are in
  `source/` for the rest.
- A boxed `Z` (offshore courses 051, 054, 323, 333) is a passing mark: the
  first leg goes past Zephyr to the next mark.
- The offshore card uses 15 marks (A D E F G H I K M O P T U V Z); the
  inshore card 13 (C D F H I K O P S U V W Z). B, J, Q, R and X are on the
  sheet but on neither card.
