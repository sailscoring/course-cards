# HYC Brass Monkey Winter Series 2025

Howth Yacht Club's Brass Monkey winter series, 9 November – 13 December
2025. The club publishes no separate course card: the sailing instructions
(Draft A, 6 November 2025) carry it as their last two pages — a "MARK
LOCATION CARD" page with a picture of the marks and a table of their
positions, and a "COURSE CARD" page of 16 numbered courses.

| File | Source | Made by |
|---|---|---|
| `marks.json` | `source/Brass_Monkey_SI_Winter_2025_.pdf`, page 7 (and §14 for the finish); shapes, colours and P's position from `../al-2025/marks.json` | `tools/extract_hyc_si.py marks` |
| `course-card.json` | the same PDF, page 8; notes from SI §8, 9, 10 and 14 | `tools/extract_hyc_si.py card`, `… notes` |
| `course-card.html`, `map/marks.svg` | the JSON above, `map/background.png` | `tools/render-cards.ts` |
| `map/background.png`, `.json` | OpenStreetMap + OpenSeaMap tiles | `tools/fetch_map.py` |

`manifest.json` records each artifact's source, the URL it was fetched
from, the metadata that heads the output, which SI sections the card
carries as notes, and the cross-check; `pnpm data` rebuilds everything and
`pnpm data:check` verifies the committed files against a fresh run — the
check runs in both.

## How the JSON is produced

The SI is a real-text PDF. The two tables are read from `pdftotext -bbox`
word positions, the instructions from `pdftotext -layout`.

**Marks.** The location table has a row per mark — name, letter, and
latitude and longitude as degrees and decimal minutes ("53 24.5",
"06 05.44"); longitudes are West, so negative. Eight marks: C Cush, D Dunbo,
H Hub, I Island, P Portmarnock, S Spit, V Viceroy, W West. That is all the
SI gives: 10.2 says the marks "are orange spherical or black conical" but
not which is which. These are the same club's marks as the Autumn League
2025 technical sheet lists (`../al-2025/marks.json`, same names; seven of
the eight positions agree within 0.12′), so the manifest's `details` has
the extractor take each mark's **shape and colour from that sheet** — and
its **position for Portmarnock**, whose table entry is wrong (below). The
sheet has Dunbo yellow and Viceroy orange conical, a little more varied
than 10.2's summary. The finish `F` ends every course but is
on no table: the extractor requires exactly one such mark, last on every
course, and describes it from SI §14 "The Finish" — "a spherical orange
cherry mark" gives its shape and colour, and 14.2's "all finishes will be
south of the Island mark in the vicinity of the Sound" is its `placement`.
It has no position until race day, like the Autumn League's finish.

**Card.** Each row is a number, a wind (N, N/E, … N/W) and the course as a
row of marks, each a letter suffixed `p` (printed red, rounded to port) or
`s` (green, starboard) and a comma, ending with the finish and a full stop:
`Hp, Wp, Ip, Hp, Wp, Is, F.` The finish has no suffix and so no side. The
extractor refuses any row word that is not such a token, and any number
that repeats. Course ids are the numbers as printed, `1` … `16`, as the
committee vessel's numeral boards show them.

**Notes.** The card's WIND column — the wind direction each course is set
for — is carried as the card's first note, "Wind" (`1 N, 2 N, 3 N/E, …`),
not as a course field: what the wind is doing on the day is the caller's
knowledge, not the card's. After it come the SI sections the manifest
names, each as printed with its number and title: 8 Race Area, 9 Courses,
10 Marks (including its letter table and the note that Spit "is to be
passed to the north and east") and 14 The Finish. An item's wrapped lines
are rejoined; a table row or a note after a blank line is a paragraph of
its own.

## How it was checked

`tools/check_hyc_si.py` runs as part of `pnpm data` and `pnpm data:check`,
comparing the positions with the SI's own picture of the marks — the only
other thing the document says about where they are. It finds the red dots
on the picture, fits a north-up chart to them against the marks' positions
(trying every pair of dots against every pair of marks, so one bad dot
cannot skew the fit) and reports any mark not drawn where the file puts
it. **Six of the eight marks sit within 5.4 pixels of their positions
(about 0.05′ on a chart drawn at 88 px per minute of longitude). Two do
not, and both are recorded as `expected` in the manifest:**

- **Dunbo (D)** is not drawn on the picture at all.
- **Portmarnock (P).** The SI's table says 53° 25.2′ N 06° 04.00′ W, which
  is open water between Hub and Viceroy, east of every other mark but
  Dunbo — a longitude slip, evidently. The picture's dot labelled P is at
  about 53° 25.82′ N 06° 06.28′ W, off Portmarnock strand, 1.3 NM away;
  the Autumn League 2025 sheet has the mark at 53° 25.63′ N 06° 05.80′ W,
  0.35 NM from that dot on a picture that says it is not to scale. **The
  JSON uses the Autumn League position**, the club's own figure for the
  same mark, and the table's is recorded here and in the manifest. The
  club has not been asked.

Against the Autumn League sheet the other seven positions agree within
0.12′ — Cush, Island and Spit differ by 0.03–0.11′, the rest are
identical.

Structural tests (`tests/hyc-brass-monkey.test.ts`) confirm the 16 courses
in order, every mark on the marks file with the sheet's name, shape and
colour, every course rounding to port, leaving Island to starboard and
ending at the finish, and spot checks of five courses read from the printed
card by eye. All 16 were compared against the PDF's text.

## Notes on the card

- Every course ends `Is, F.`: Island left to starboard, then the finish,
  which SI 14.2 puts south of Island in the vicinity of Howth Sound. The
  start line (a committee vessel "Northwest of Ireland's Eye", SI 8.1 and
  12.1) and the finish are race-day facts the library takes per race.
- All marks are rounding marks; there are no passing marks on this card.
- Spit (S) is on the location table and in SI 10.2's list, with the note
  that it "is to be passed to the north and east", but no course uses it.
- The card is one table of 16 rows, so the HTML page lists one course per
  row (the renderer's layout for cards that are neither HYC's numbered
  grid nor DBSC's lettered sections).
