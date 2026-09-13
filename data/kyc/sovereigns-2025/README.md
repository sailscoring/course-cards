# Kinsale Yacht Club, Sovereign's Cup 2025

Kinsale Yacht Club's Sovereign's Cup, incorporating the 2025 ICRA National
Championships, was sailed from 25 to 28 June 2025 off Kinsale. Its sailing
instructions carry two things this format holds: a table of the club's
racing marks with approximate positions, and — for the Coastal and
Non-Spinnaker fleets and, on round-the-cans days, the Spinnaker fleet — a
list of some seventy named courses round those marks, "RTC/Coastal
Courses", a table per wind direction. A supplementary instruction for the
Thursday's Jeanot Petch Sovereign's Cup races adds four more courses,
lettered ALPHA to DELTA, out to Cork Buoy and Black Tom.

This is the first data set outside Dublin Bay.

| File | Source | Made by |
|---|---|---|
| `marks.json` | `source/SOVS_2025_SIS_v6.pdf`, page 21, with `source/Amendment-1-2-SIs.pdf` applied | `tools/extract_kyc_marks.py` |
| `rtc-coastal.json` | `source/SOVS_2025_SIS_v6.pdf`, pages 16–19 (the pictures); FB 2–6 and FC 3–6 for the start line, the finish and the notes | `tools/extract_kyc_card.py card`, `… notes`, `tools/extract_start_line.py`, with `overrides.json` |
| `jeanot-petch.json` | `source/Supplementary_Sailing_Instructions_v1.pdf`; FB 2.1 of the SI for the start line | `tools/extract_kyc_card.py ssi`, `tools/extract_start_line.py` |
| `source/*.md` | the three documents | `tools/pdf_markdown.py` |
| `*.html`, `map/marks.svg` | the JSON above, `map/background.png` | `tools/render-cards.ts` |
| `map/background.png`, `.json` | OpenStreetMap + OpenSeaMap tiles | `tools/fetch_map.py` |

`source/` keeps the instructions (version 6, the one on the club's
official notice board), amendments 1 and 2, and the supplementary
instructions, verbatim, with the URLs they were fetched from in the
manifest. Amendments 3 and 4 change the starting order and the RTC time
limit and nothing a card depends on; they are not kept. `manifest.json`
records each artifact's source, the metadata that heads the output, the
marks added to the table and why, and the cross-checks; `pnpm data`
rebuilds everything and `pnpm data:check` verifies the committed files
against a fresh run — the checks run in both.

## What Kinsale publishes, and what this set is

The club's own season racing has **no numbered courses**: the club racing
instructions (valid from 2021, still what the club's Sailing Documents page
offers) say "Courses will be chosen by the Race Officer and displayed on a
blackboard on the Committee boat", and what the club calls its course card
is a list of the racing marks with positions and a chart of them. So the
club's ordinary racing is of the called-course kind — a marks file with no
card — and is not what this set holds. The Sovereign's Cup is different:
its instructions list courses by name, and that list is what is here. The
marks are the same eleven lettered marks the club races round all year,
at the positions the regatta's instructions give them.

## How the JSON is produced

**Marks.** Page 21 of the instructions is "KINSALE YACHT CLUB - RACING
MARKS - APPROXIMATE POSITIONS": eleven lettered marks A–M (no I, no L) and
Black Tom, each with a position in degrees and decimal minutes, and under
the table "All marks are Yellow with the exception of mark A (Green),
Bulman (South Cardinal) and Black Tom Mark (Green Lateral Buoy)". It is a
real-text page, so `extract_kyc_marks.py` reads it from `pdftotext -bbox`
word positions: a mark's row is the baseline its letter sits on, its
latitude and longitude the positions on that baseline. The table names no
marks: only B, whose description "South Cardinal Buoy" the colour line
matches to "Bulman", gets a name. FB 4 says the club's laid marks are
"yellow conical with a dayglo flag", which is where `conical` comes from.

Amendment 1 corrects M: the instructions print it at 51.39.48 N, which is
K's latitude, and the amendment puts it at 51.40.10 N 008.31.25 W, where
the club's 2022 card also has it. The tool reads the amendment's
"… is changed as follows: M 51.40.10 N 008.31.25 W" and applies it; an
amendment naming a mark the table lacks is refused.

Three marks the courses name are not in the table and are added from the
manifest: **Lge Sov** (the Great Sovereign island, which the supplementary
instructions call Big Sovereign), **Cork Buoy** (the Irish Lights safe
water mark off Cork Harbour, the eastern limit FB 4 puts on the navigation
marks used) and **CF** (Charles Fort, where courses "Finish at CF"). The
club gives none of them a position. Theirs are OpenStreetMap's — the same
source as the chart imagery and as the Howth Mark in `../../hyc/al-2026`:
the island's centre (a rounding mark the size of an island has no better
single point, and a course drawn to it is a few hundred metres off the
water actually sailed), the CIL buoy (node 1593411492, CIL00240) and the
fort's lighthouse (node 322520677). The manifest says so beside each. A
finishing line off Charles Fort is where the committee boat lays it, so a
caller may override CF as it may any mark.

**The RTC/Coastal card.** Pages 16–19 are pictures — four 1754 × 1240
images with no text layer — so `extract_kyc_card.py` is a small
purpose-built OCR in the manner of the Autumn League and Dun Laoghaire
cards' tools:

1. The pages are found by their text layer: the one whose text is the title
   "RTC/Coastal Courses" and a page number, then every following page whose
   text is a page number alone.
2. The ink of each picture is segmented into glyphs (the headings'
   underlines erased first, so an underlined word does not scan as one
   glyph), grouped into lines by height, and split into columns and words
   by the gaps between them. A course row is the line that ends in a length
   — a token with a decimal point in it.
3. Every glyph is recognised by nearest-template matching against the
   labelled shapes in `tools/templates/kyc-sovereigns-2025/` (240 of them,
   the medoids of clustering the pages' 3,192 glyphs at a distance of
   0.15, labelled cluster by cluster from a contact sheet), but **against
   only the labels its place allows**: the first glyph of a mark token is
   one of the eleven mark letters, never a digit; a length is digits, a
   point and "nm"; a course id is the table's compass prefix, 1 or 2, and
   an optional A–E; a multi-word name — "Lge Sov", "Cork Buoy", "Black
   Tom", "Start Area" — is known from the lengths of its words and then
   checked letter by letter. At this size (a capital is 13–15 pixels tall) a
   B and an 8 are not reliably told apart by shape, and never have to be. A
   glyph whose best match is not clearly ahead of the runner-up stops the
   build unless `overrides.json` resolves it: 49 glyphs are, every one
   checked by eye from a crop of the picture — mostly E against F, C
   against G, and an 8 against a 3, 5 or 6 in a length, letters this face
   draws alike at this size. In eight of the 49 the best match was wrong,
   which is what the margin is for.
4. The glyph feature is the glyph at a fixed scale on a fixed baseline, not
   stretched to a box, and the distance between two is the ink where they
   differ as a share of the ink in both, at the best of nine one-pixel
   alignments — what makes two renderings of one letter, a sub-pixel apart,
   read as the same shape.

Each table's heading, "Direction North" and so on, gives `windDirectionDeg`
(0, 45, … 315); the course id is as printed; the side is the "(p)" or "(s)"
after each mark; the printed "Approx Length" is `distanceNm`. Where a
course finishes is the last entry of its sequence: "Finish at K" ends the
course at K with no side (the finishing line is laid beside that mark by
the committee boat, FB 6 / FC 6), "CF" at Charles Fort, and "Start Area"
back at the start line, `SL`.

**The Jeanot Petch card.** The supplementary instructions are real text:
"Course ALPHA (A) – Start Area – Mark C", a line of marks with sides,
"Finish at Charles Fort", a midway point. `ssi` mode reads them, mapping
"Big Sovereign" to the table's "Lge Sov" and "Charles Fort" to "CF". The
course id is the letter in brackets, as displayed. The start areas and
midway points, which the format has no field for, are the card's second
note; the instructions' preamble is its first.

**Start line.** FB 2.1 and 2.2: a committee-vessel line whose location "will
be advised over Ch72 at 10.00 hrs". It is the card's `startLine` with a
placement and no position, and every course begins there. The supplementary
instructions say "Starting Line: SI FB 2.1 applies", so the Jeanot Petch
card carries FB 2.1 too. Both are read by `extract_start_line.py`, which
refuses text that is not in the instructions verbatim; the instructions
are set in two columns, which the `columns` spec in the manifest tells it.

**Notes.** FB 3 (courses), FB 4 (marks), FB 6 (finishing line) and the
Fleet C counterparts FC 3 and FC 6, each paragraph as printed, read out of
the column its heading is in — the flattened text of a two-column page
interleaves them. The card page's own introduction ("The following courses,
selected to suit particular wind directions … CF = Charles Fort") is in the
picture and is not carried; its content is in the notes and the JSON.

## How it was checked

`tools/check_kyc.py` runs as part of `pnpm data` and `pnpm data:check`:

- **Bulman and Black Tom against Irish Lights.** Two of the club's marks
  are CIL navigation buoys with charted positions, which OpenStreetMap
  carries from CIL. The club's positions are within 0.07 NM of them.
- **Fleets B and C start the same way.** The card's start line is FB 2.1's;
  FC 2.1 says the same, the VHF channel apart.
- **Printed lengths against placed legs.** For every course, the legs
  between the marks the card places fall short of the printed length by up
  to 8.6 NM — the legs to and from the start area, which the card cannot
  place; the 8.6 is NE1D, out to Cork Buoy — and exceed it nowhere by more
  than 0.3 NM (SE2A, whose placed legs come to 14.8 against a printed 14.6,
  the lengths being approximate). A misread mark letter would move a course
  by miles.

Structural tests (`tests/kyc.test.ts`) compare all 68 RTC courses — marks,
sides, finish and printed length — with a transcription of the printed
tables read by eye before the OCR was run, and the Jeanot Petch courses
with the instructions' text. The two readings agree on every course.

**What was looked at and not used.** The club also published, for the 2023
Sovereign's Cup, a "Mark bearings & Distance" table (magnetic, variation
2°W). It is hand-assembled: its E, F and H distances match neither the 2023
card's positions nor the 2025 table's but the club's 2022 card's, and its
"To"/"From" columns do not keep one sense across the rows. It is not a
check on anything here and is not kept.

## Notes on the card

- The positions are the club's "approximate" ones, to the hundredth of a
  minute; the JSON carries them as printed and no further.
- Three marks are not where the club's 2022 card had them: F is 0.4′
  further south, H has gone from 3 NM south of the harbour to off the Old
  Head, and G — which the 2022 card did not have, and the 2023 Sovereign's
  Cup card put at the Old Head — is now 2 NM east of it. E is where the 2022
  card had it, though the 2023 card put it 3 NM further east. The
  instructions are the current statement and are what is here.
- The start area is chosen on the day, so no course can be computed to its
  full length from the card alone; a caller supplies `SL`. Courses that
  finish at the start area end at `SL` too.
