# Dun Laoghaire Combined Clubs Regattas 2026

The four Dun Laoghaire waterfront clubs each ran a one- or two-day regatta
in 2026 — Dun Laoghaire Motor Yacht Club on 6–7 June, the National Yacht
Club on 13 June, the Royal Irish Yacht Club on 27 June and the Royal St.
George Yacht Club on 4 July — under one set of sailing instructions. Its
Addendum A, for the cruiser classes on Course Area A, carries "Course Card
A": 16 lettered sections of four courses each, sailed round DBSC's racing
marks, with DBSC's chart of the marks and its bearings and distances table
reproduced alongside.

| File | Source | Made by |
|---|---|---|
| `marks.json` | DBSC's `DBSC_Marks_Bearings_Distances_2026_v1.pdf` and marks CSV, from `../../dbsc/summer-2026/source/` | `tools/extract_dbsc_marks.py` |
| `course-card-a.json` | `source/2026_DL_Club_Regattas_SIs_Amendment_1_08Jun26_Copy.pdf`, page 5 (the picture) and page 4 (the notes) | `tools/extract_dlcc_card.py card`, `… notes`, with `overrides.json` |
| `course-card-a.html`, `map/marks.svg` | the JSON above, `map/background.png` | `tools/render-cards.ts` |
| `map/background.png`, `.json` | OpenStreetMap + OpenSeaMap tiles | `tools/fetch_map.py` |

`source/` keeps two copies of the SI verbatim. The JSON is read from
`2026_DL_Club_Regattas_SIs_Amendment_1_08Jun26_Copy.pdf`, the SI with
Amendment 1 of 8 June 2026 (which changes SI 13.1 and Addendum C only), as
published among the regatta's documents on racingrulesofsailing.org — the
manifest's `url` is that site's S3 object, which is only reachable through
the signed, expiring links the site issues. `DL-Club-Regattas-2026-Sailing-Instructions.pdf`
is the earlier "Final Draft" (26 May 2026) as the DMYC publishes it at
[dmyc.ie/2026/regatta-2026-sailing-instructions](https://www.dmyc.ie/2026/regatta-2026-sailing-instructions/),
kept so the check below can show the two agree on everything the card is
made from.

`manifest.json` records each artifact's source, the URL it was fetched
from, the metadata that heads the output, which addendum sections the card
carries as notes, and the cross-checks; `pnpm data` rebuilds everything and
`pnpm data:check` verifies the committed files against a fresh run — the
checks run in both.

## How the JSON is produced

**Marks.** Addendum A 2.1 says the marks "will be DBSC racing marks in
Dublin Bay, in the approximate positions shown in the Chart of DBSC Marks
and the DBSC Marks, Bearing and Distance Table included in this addendum".
Both are reproduced in the addendum as pictures: the table is DBSC's
"Marks, Bearings and Distances" sheet, version 1 of 7 April 2026 — the same
document, by its version box, as `../../dbsc/summer-2026/source/DBSC_Marks_Bearings_Distances_2026_v1.pdf`.
So the marks are read from that real-text original, exactly as for the DBSC
data set (with the two West Pier start marks and Zebra, which the chart
draws, from DBSC's marks CSV), and `marks.json` here is DBSC's mark for
mark; the test asserts it. The chart of the marks (page 6) is not used.

**Card.** The card is a picture on page 5 — a 1303 × 1344 JPEG embedded in
the PDF — so `tools/extract_dlcc_card.py` is a small purpose-built OCR in
the manner of the Autumn League cards' `extract_card.py`, whose glyph
matching it reuses:

1. The page is found by its text layer (the title "Course Card A"); the
   card is the largest image on it, read as embedded rather than rendered,
   so the glyphs are exactly what the club published.
2. The 16 red section letters place the sections on a 3 × 6 grid. Inside a
   section, the dark glyphs are grouped into lines and read left to right:
   the first glyph of each line is the course number, which must run 1–4,
   and the rest are the marks. The glyphs on the heading line right of the
   letter are the wind, read word by word — the blue text is anti-aliased
   into its neighbours in the JPEG, so only the strokes' cores count, which
   keeps touching letters apart.
3. Every glyph is recognised by nearest-template matching against the
   labelled shapes in `tools/templates/dlcc-regattas-2026/` (98 of them,
   the medoids of clustering the card's 497 glyphs at a distance of 0.06;
   `dot` is the decimal point). A glyph whose best match is not clearly
   ahead of the runner-up stops the build unless `overrides.json` resolves
   it: two heading digits are — the `0` of "045" and the second `5` of
   "157.5", both matched right but by too small a margin against `0`/`5`'s
   neighbours in this font, and both confirmed by eye.

The sides come from Addendum A 1.6, "All marks shall be rounded to port in
the order listed", which the tool requires to be in the SI's text; there
are no passing marks. Course ids are letter and number as displayed,
`A1` … `R4`.

**Notes.** The section headings are carried as the card's first note,
"Course sections" — `A NORTH 000, B NNE 022.5, C E 045, …` — as printed:
section C is headed "E 045" where the compass would say NE, which is how
the card has it. Then the card page's own line ("PLEASE RETAIN THIS CARD
…"), then Addendum A sections A1 The Course, A2 Marks and A3 Starting &
Finishing Lines, each item as one paragraph with its number, from
`pdftotext -layout`. A4 (class flags and start times) is not a matter for
the card. The addendum's course-signalling conventions — a number before
the letter repeats the course, two courses may be combined, Cruisers 4 and
5 may be given different courses — are in A1 as text; the JSON holds the
64 courses as printed and leaves the combinations to the reader, as it
does for every club.

## How it was checked

`tools/check_dlcc.py` runs as part of `pnpm data` and `pnpm data:check`:

- **The two copies of the SI agree.** The Course Card A picture in the
  Amendment 1 copy is byte for byte the picture in the DMYC's Final Draft,
  and Addendum A's text is identical in both, section by section — so the
  card here is the one the four clubs published, not something the
  amendment changed.
- **Positions against the sheet's bearings and distances.** DBSC's check:
  the 529 printed bearing/distance pairs are reproduced from the positions
  within 1° and 0.01 NM.

Structural tests (`tests/dlcc.test.ts`) compare all 64 courses with a
transcription of the printed card read by eye, and confirm the sections'
order, every mark rounded to port and one of the eight DBSC marks the card
uses (B–K), the 8-6-3-2 pattern of every section, the headings as printed,
and that the addendum's own examples (A3 is `E C K`, B4 is `F K`) agree
with the card. The templates were labelled from the same transcription,
cluster by cluster, and every cluster held one letter only.

## Notes on the card

- The start line is "approximately North of Dun Laoghaire Harbour" (A3.1)
  and the finish "to weather of the last mark" (A3.2): both race-day
  facts the library takes per race. There is no finish mark on the card.
- Each section's wind is the direction its courses are set for, as on
  DBSC's cards, printed here with the bearing to the half degree
  (`NNE 022.5`); it is the card's heading, not a property of the course.
- Section C's heading "E 045" is presumably a slip for "NE 045"; the JSON
  carries it as printed.
