# DBSC Summer Series 2026

Dublin Bay Sailing Club's 2026 course cards for keelboats racing on fixed
marks, as published at [dbsc.ie/racing/2026-course-cards](https://dbsc.ie/racing/2026-course-cards/):

| File | Source | Made by |
|---|---|---|
| `marks.json` | `source/DBSC_Marks_Bearings_Distances_2026_v1.pdf` (+ three marks from `source/machine-readable/DBSC_Marks_2026.csv`) | `tools/extract_dbsc_marks.py` |
| `cc1-saturday-cv.json` | `source/CC1_Saturday_CV_2026_v1.pdf` — Saturday, committee vessel starts | `tools/extract_dbsc_card.py` |
| `cc2-saturday-hut.json` | `source/CC2_Saturday_Hut_2026_v1.pdf` — Saturday, West Pier hut starts | `tools/extract_dbsc_card.py` |
| `cc3-thursday-blue.json` | `source/CC3_Thursday_Blue_2026_v1.pdf` — Thursday, Blue Fleet | `tools/extract_dbsc_card.py` |
| `cc4-thursday-red.json` | `source/CC4_Thursday_Red_2026_v1.pdf` — Thursday, Red Fleet | `tools/extract_dbsc_card.py` |
| `cc5-tuesday-hut.json` | `source/CC5_Tuesday_Hut_2026_v1.pdf` — Tuesday, hut starts | `tools/extract_dbsc_card.py` |
| `*.html`, `map/marks.svg` | the JSON above, `map/background.png` | `tools/render-cards.ts` |
| `map/background.png`, `.json` | OpenStreetMap + OpenSeaMap tiles | `tools/fetch_map.py` |

All the club's documents are version 1, dated 7 April 2026 (the Red Fleet
card 4 April). `source/` keeps them verbatim; `source/machine-readable/`
is the club's "Machine-Readable Course Cards and Marks" zip unpacked — a CSV
per card, a marks CSV and GPX, and the club's `Warning.txt`: *"These files
are not official DBSC documents. They have not been tested thoroughly … If
there is any difference between any of these files and the corresponding
official pdf document, the pdf document should be taken as correct."* The
JSON is therefore generated from the PDFs, and the machine-readable files
are used to check it (below). `source/CC-DBSC-Racing-Marks-Chart-2025.pdf`
is the club's chart of the marks, kept for reference: the club notes it has
not been revised for 2026 and shows approximate positions only.

`manifest.json` records each artifact's source, the URL it was fetched
from, the metadata that heads the output, and the cross-checks; `pnpm data`
rebuilds everything and `pnpm data:check` verifies the committed files
against a fresh run — the cross-checks run in both.

## How the JSON is produced

All the PDFs are real text, so extraction is a matter of reading
`pdftotext -bbox` word positions; nothing is OCR'd.

**Marks.** The "Marks, Bearings and Distances" sheet has a row per mark,
printed on two lines: name and latitude minutes, then colour and longitude
minutes, with the letter between. The header says what the minutes are
relative to ("Lat N 53°+", "Long W 6°+"); longitudes are West, so negative.
Colours are kept as printed, lowercased ("yellow/black", "yellow nav mk" for
the Turning mark, which is a navigation buoy); the sheet gives no shapes.
Three marks the club lists are not rows of the sheet — the black and green
start marks at the West Pier hut (`2`, `3`), which course card 3 uses, and
Zebra (`Z`), which the chart notes "shows position only and may not be
laid" and no 2026 course uses — and are appended from the club's marks CSV.
The sheet does have a column for `3` (bearings and distances *to* it),
which is checked against the CSV position below.

**Cards.** Each card is 16 sections lettered A–R (no I, no O), one per
compass point, each headed with a bearing (`A 000°`, `B 022°`, …) and
listing courses 1–8 (1–5 on the Tuesday card). A course is
a row of marks, each a letter or digit suffixed `p` (printed red, rounded to
port) or `s` (green, starboard). The extractor finds the section headings
(a `ddd°` word with a capital letter to its left), takes their x positions
as the columns, reads each numbered row within its column, and refuses any
word in a row that is not a mark. The course id is letter + number (`B3`);
the format stores the id as printed and leaves the club's convention to
the club, and the section headings are carried as the card's first note,
"Course sections". The Red Fleet card prints bare letters and says "All marks to be rounded to
Port", which the extractor applies; on the two hut cards the notes say the
Turning mark X is "to be passed to Port" rather than rounded, so it is a
passing mark there — on card 3, which also uses X, the notes say nothing
special and it is a rounding mark like the rest.

**Notes.** Every card carries its section headings as "Course sections",
its own printed text — the lines under and beside the courses, less the
title block — as "Card notes", and the marks sheet's caveat ("Mark positions may vary slightly. All figures are
approximate. Warning: Some direct paths are obstructed.") after it. The Red
Fleet card's "W/L courses 1-5 / RTC Courses 6-8" (windward–leeward, round
the cans) is in its notes.

## How it was checked

`tools/check_dbsc.py` runs as part of `pnpm data` and `pnpm data:check`:

- **Cards against the club's CSVs.** Every course on all five cards — 592
  courses — agrees with the machine-readable CSV in marks and sides, with
  **one exception: course K1 on card 2** (Saturday, hut). The PDF prints
  `Fs Gs Vs Cs Es Bp Gs Vs Hp`; the CSV ends it `… Hp Xp`, with the Turning
  mark that every other course on that card finishes with. The PDF cell is
  not clipped — the nine marks are spaced out to fill it — so the card as
  published omits X, whether by design or not. The club says the PDF is
  correct, so the JSON follows it; the difference is recorded as `expected`
  in the manifest, and the check will fail if either document changes.
- **Marks against the CSV and GPX.** All 26 marks: same ids, names and
  positions, to the CSV's own rounding.
- **Positions against the sheet's bearings and distances.** From the
  extracted positions, the true bearing and distance between every pair of
  marks on the sheet — 529 pairs, including the `3` column — reproduce the
  printed figures within 1° and 0.01 NM, i.e. to their printed precision.
  So the sheet's positions, its table, the CSV and the GPX are all one
  consistent set (the sheet says its bearings are true, and they are).
- Structural tests confirm each card's 16 × 8 (or 16 × 5) courses in the
  card's order, every mark on the marks file with a side, the Red Fleet
  card all to port, X passing and last on the hut cards (K1 excepted), and
  spot checks of a dozen courses read from the printed cards by eye.

## Notes on the cards

- Start lines: the committee-vessel cards (1, 3, 4) start at a committee
  vessel whose position is a race-day fact; the hut cards (2, 5) start on a
  transit from the West Pier hut, with an orange, black, green or yellow
  limit mark (`O`, `2`, `3`, or Omega `Y`) as signalled. Neither is on the
  card; the library takes the start position per race.
- The club's page notes for 2026: Merrion (`L`) has shifted slightly for
  marine survey work, Battery's (`T`) position has been updated, and Omega
  (`Y`) will not be a data buoy this year.
- The section bearing is the wind direction the section's courses are set
  for — A north, B 022½°, … R 337½°, printed rounded down — so a race
  officer picks the section by the wind and a course by length. The JSON
  carries the headings as printed, in the "Course sections" note, not as a
  property of the course: what the wind is doing on the day is the
  caller's knowledge, not the card's.
