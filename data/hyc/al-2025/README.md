# HYC Autumn League 2025

Howth Yacht Club's Autumn League course cards, as published at hyc.ie:

| File | Source | Made by |
|---|---|---|
| `marks.json` | `source/AL_Course_Card_Technical_Sheet.pdf` | `tools/extract_marks.py` |
| `offshore.json` | `source/AL_Offshore_Course_Card.pdf` | `tools/extract_card.py` |
| `inshore.json` | `source/AL_Course_Card_Inshore_01.pdf` | `tools/extract_card.py` |
| `bearings-magnetic.json` | `source/AL_Course_Card_Technical_Sheet.pdf` | `tools/extract_bearings.py` |

`manifest.json` records each artifact's source, the URL it was fetched
from, and the metadata that heads the output; `python3 tools/regenerate.py`
rebuilds them all and `--check` verifies the committed files against a
fresh extraction.

## How the JSON is produced

**Marks.** The technical sheet is a real-text PDF. The "Racing Marks" table
is read from `pdftotext -bbox` word positions — column by x, row by the
mark letter's baseline — so wrapped cells ("Orang / e", "Portmarnoc / k")
rejoin correctly. Positions are the sheet's degrees and decimal minutes
converted to decimal degrees; longitudes are West, so negative. Two marks
have prose where their coordinates would be — Zephyr, "Upwind of Start
Line", and Finish, "Between Island Mark and Howth Sound" — and are emitted
without a position and with that text as their `placement`.

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

**Bearings.** The sheet's "Relative Bearings Table – Magnetic (Approx)" is
parsed from `pdftotext -layout`. It is not part of the format; it is an
independent published check on the marks file, used by the test suite.

## How it was checked

- Every glyph on both cards matched a template with a clear margin (worst
  case 0.034 against a required 0.025, on a 0–1 scale where letters differ
  by 0.1 or more).
- The extracted courses were rendered back as text grids and compared
  against the card images row by row; a dozen rows on each card, all
  boxed marks, and all green letters were checked by eye. Structural tests
  confirm every course on both cards runs `Z … F` over marks the sheet
  lists.
- Bearings computed from the extracted positions agree with the club's
  magnetic bearing table to within 3° for every pair of marks once one
  consistent offset is allowed — 6° W, the magnetic variation off Dublin
  around 2000, so the table is old. Four marks have evidently been moved
  since it was computed: pairs involving Cush, Island, Portmarnock or Spit
  disagree with it by 10–25°. The positions on the technical sheet are
  taken to be current.

## Notes on the cards

- The windward mark Z (Zephyr) and the finish F are marks on the card with
  no fixed position: every course starts `Z` and ends `F`. Where they were
  on a given day is supplied to the library with the start position.
- A boxed `Z` (offshore courses 051, 054, 323, 333) is a passing mark: the
  first leg goes past Zephyr to the next mark.
- The offshore card uses 15 marks (A D E F G H I K M O P T U V Z); the
  inshore card 13 (C D F H I K O P S U V W Z). B, J, Q, R and X are on the
  sheet but on neither card.
