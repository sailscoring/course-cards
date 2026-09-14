# Royal Cork Yacht Club, keelboat racing 2026

Royal Cork Yacht Club races keelboats in Cork Harbour through the season —
Thursday, Friday and Saturday leagues, an April league, an Autumn League,
and with Cove Sailing Club and Monkstown Bay Sailing Club the Cork Harbour
Combined League — and publishes for all of them one **Keelboat Racing
Course Card**: forty numbered courses round the harbour's navigation buoys
and the Port of Cork's laid race marks, each set out as rounds with the
cumulative distance at the end of each, under a heading for the wind it
suits. The club's **General Sailing Instructions** make the card part of
the instructions (22.1), give positions for the four Port of Cork laid
marks (22.3) — the only positions the club publishes — and define the
start and finish lines (26).

| File | Source | Made by |
|---|---|---|
| `marks.json` | `source/General-Sailing-Instructions-…-2026.pdf`, 22.3, for the four laid marks; OpenStreetMap for twenty harbour buoys, numbered by eye; the club, for Cage; the card, for every mark its courses name | `tools/extract_rcyc_card.py marks` |
| `keelboat.json` | `source/RCYC-Course-Card-Art-2026.pdf`, pages 2–4; the instructions' 26 for the start line | `tools/extract_rcyc_card.py card`, `… notes`, `tools/extract_start_line.py` |
| `source/*.md` | the two documents | `tools/pdf_markdown.py` |
| `keelboat.html`, `map/marks.svg` | the JSON above, `map/background.png` | `tools/render-cards.ts` |
| `map/background.png`, `.json` | OpenStreetMap + OpenSeaMap tiles | `tools/fetch_map.py` |

`source/` keeps the card ("RCYC Course Card Art 2026", the club's
Keelboats Notice Board) and the general instructions verbatim, with the
URLs they were fetched from in the manifest. `manifest.json` records each
artifact's source, the metadata that heads the output, and — at length —
the twenty-six marks added to the four the instructions place, where the
twenty traced from OpenStreetMap and the one the club gave came from, and
why the other five have no position; `pnpm data` rebuilds everything and
`pnpm data:check`
verifies the committed files against a fresh run.

## What the survey got wrong, and what the club has

The survey that set this data set up had Royal Cork calling its courses
as sequences of named marks with no numbered card. It does call courses
that way (22.2 allows the race officer "any combination of navigation
marks, Port of Cork Laid Race Marks, RCYC racing marks and inflatable
buoys"), and the called-course library entry points exist for it; but its
ordinary racing is "Round the Cans selected from the current Royal Cork
Keelboat Racing Course Card" (22.1), and the card is a real one. The
Cork Harbour Combined League's own instructions (2025) say the same: its
round-the-cans courses come from the Royal Cork card, which every boat
should carry. So the one card here serves three clubs' league racing, as
hoped — and the club with the most marks in `data/` was long the one with
the fewest of them placed, until twenty of the harbour buoys were traced
from OpenStreetMap and numbered against the chart.

## How the JSON is produced

**Marks.** 22.3 of the instructions: "Port of Cork Laid Race Marks are
yellow cones permanently laid and may be in these approximate locations",
then Dosco (Corkbeg), Ringabella, Harp and East Mark (Formerly Mark B) with
positions in degrees and decimal minutes. Those four are read from the
text layer and are the only marks with positions.

The card's courses name twenty-six more. Fourteen are the harbour's
numbered channel buoys (No.3 to No.20), eight are the lettered buoys of
the entrance and East Ferry channels (E1, E2, E4, W1, W2, W4, EF2, EF4) and
one is Cage, buoy C1, the green conical the Grassy Walk line finishes at.
They are Port of Cork navigation marks, on Admiralty chart 1777, and **no
document publishes a position for any of them**: not the club's
instructions, not the Cork Harbour Combined League's or the Autumn
League's, not any year's Cork Week instructions (whose harbour-marks
exhibit is a picture, and whose mark list positions only the offshore and
laid marks), not the Port of Cork's Information Manual or its passage
plans, which name the buoys and place none, and not the NGA List of Lights
(Pub. 114), which carries Cork Harbour's shore, range and pier lights —
Roche's Point, White Bay Range, Fort Davis Range, Spit Bank, Haulbowline,
Monkstown — and not one channel buoy.

**Twenty of them are positioned here anyway, and this is where they came
from.** OpenStreetMap holds the harbour's forty-six buoys with their
positions and, for thirty-two of them, their lateral colour; it holds no
name, number or reference for a single one, and neither does the
OpenSeaMap rendering of it, which draws the cones unlabelled. So the
positions are open data and the numbering is not: which cone is No.7 was
read off the chart, buoy by buoy, by this data set's maintainer, against
a plot of all forty-six. That is a human reading, not a citation, and it
is the one thing here that no document backs.

Three checks hold across all twenty, and they are what makes the reading
worth trusting. Every mark is a distinct OpenStreetMap node — no node
serves two numbers. Every node's recorded colour agrees with the
odd-is-green, even-is-red convention of IALA region A, which the card's own
Cage settles: the instructions call C1 "Green Conical", and C1 is odd.
And each series runs from the harbour mouth inward, its lowest number
nearer the entrance than its highest. `tests/rcyc.test.ts` asserts all
three. What is **not** asserted is that the numbers rise monotonically buoy
by buoy: the odd and even runs climb opposite sides of a channel that
bends west past Cobh, so no distance from any one point rises along either,
and a test that claimed otherwise would need a channel centreline this data
set has no source for.

**Cage is placed from neither source, and on the club's word alone.** Buoy
C1 is in no publication, and it is not in OpenStreetMap either — the
nearest node to it is 850 m away — so it could not be read off the chart
with the others. The club supplied its position directly: 51°48.834'N
8°16.968'W, the green conical the instructions describe at 26.1. That is
correspondence, not a document, and it is cited to nothing; if the club
ever prints it, the citation replaces the courtesy.

It is worth having, because it is the Grassy Walk line's outer distance
mark, and placing it made a check possible that tests everything at once.
Solve for the start line position that best fits the card's own printed
distances — 28 courses, nothing fed in but the mark positions and the
printed totals — and the answer lands at 51°48.693'N 8°17.676'W: 853 m from
Cage, 817 m from the club's pier at Crosshaven, on the 1500 m line between
them, 367 m from its midpoint. The fit recovered a point on the Grassy Walk
line without being told the line exists. A wrong Cage would have dragged it
off; so would a mis-numbered buoy. Median error 0.46 nm on courses of six to
twelve miles.

That check also settles course 12, whose third round prints "(3nm)" after
rounds of 7 and 9. Computed from positions it is 10.04 nm, which is what a
third round after 7 and 9 should be: the card has a misprint, and the JSON
still carries 3 as printed. Courses 3 and 19 sit furthest out — printed 12.0
against 9.09 and 10.38 — and are unexplained; every other course over the
same marks fits.

Five marks are still unplaced, each with a `placement` and no position.
**EF2 and EF4** were not identified — OpenStreetMap has three nodes in the
East Ferry channel, but tagged `seamark:type=yes` with no colour, so
nothing distinguishes them. The other three are laid marks:
Dutchman ("approx. 2 cables SE of the Dutchman Rock/Fennels Bay") and
Curlane ("a mark laid on the Curlane Bank") in the card's own words, and
White Bay, which course 73 names and nothing describes. The manifest lists
all twenty-six with the reasoning beside them.

The consequence has shifted but not closed: **thirty of the forty courses
can now be computed with only the start line supplied**, which was the point
of the exercise. Course 1, for instance, resolves Ringabella, W2, Cage, No.7
and Dosco from this file and asks only for SL. The ten that cannot are the
five rounding EF2 (8, 20, 76, 81) or EF4 (71), the four at Curlane (72, 75,
83) or Dutchman (2), and course 73 at White Bay — each asks the caller for
that mark, as every course asks for the line.

**Card.** Pages 2 and 3 of the card are two columns of courses; the tool
reads each column of each page top to bottom from `pdftotext -bbox` word
positions, cutting at the gutter. A wind heading ("N WIND", "S/SW OR N/NE
WIND", "E WIND (LIGHT – H.W.)") applies to the courses under it; a course
is "COURSE n", with a name for the first three ("Admiral's Choice") and
one to three bullets "Round One: … (6nm)". A course's marks are its rounds
run together, each mark with the side in brackets after it, from the
start line to "Finish" — which is the same line, so every course ends at
`SL`; `distanceNm` is the last cumulative distance printed, and
`windDirectionDeg` the heading's wind where it names one direction. The
rounds themselves, with their distances and the notes printed among them,
are the card's first note, course by course, because the rounds are where
the race officer may shorten and the format has no field for that.

The card's typography is loose, and the tool takes it as it comes: "No.7",
"No 7" and "No7" are one mark, "DOSCO" is Dosco, "Harp Mark" is Harp and
"Dutchman Mark" Dutchman; a distance is "(6nm)", "(6 nm)", "(8.4)", once
"4.7nm)" and once "(8.4nm"; course 27 ends in a stray "t"; course 75 runs
two marks together without a dash; course 19 has a stray bracket. Two
things are read for what they mean rather than what they print: courses 76
and 81 end their first round "Finish Cage" and sail on — the line laid at
Cage is crossed and the course continues, so that crossing is an entry
passing Cage — and course 23 prints no distances at all, so it has no
`distanceNm`. Course 12's third round prints "(3nm)" after rounds of 7 and
9; the JSON carries 3, as printed. The asterisks — `*` for a course that
minimises crossing the shipping channel, `**` for one that takes Dosco as
mark 1 when the Grassy Walk line is in use — are kept in the note; the
blue dot some numbers carry is a graphic and is not read.

**Start line.** 26 of the instructions, whole: the Grassy Walk line (a pole
in front of the hut and Cage or a laid mark as ODM) or a committee-vessel
line, either of which is also the finish. It is carried as the card's
`startLine` with no position, and every course begins and ends there.
The card's own page 4 says the same at more length and is carried as three
notes, as printed.

## How it was checked

There is nothing independent to check the four positions against: the
Autumn League 2025 instructions print the same four, a year older, and the
Cork Week instructions' laid marks sit near two of them but are not them.
The marks tool refuses a card that names a mark neither the instructions
nor the manifest supplies. Structural tests (`tests/rcyc.test.ts`) check
the forty courses' order, a dozen of them against the printed card round by
round, every course's start and finish at the line, the first note's
content, that no OpenStreetMap node serves two numbers, that every buoy's
colour agrees with the odd-is-green convention, that each series runs from
the entrance inward, and that a course asks the caller only for the line
and the marks left unplaced.

The strongest check is the card's own arithmetic, described above: fitting
a start line to the printed distances of 28 courses puts it on the Grassy
Walk line, which corroborates Cage and the numbering together. It is not a
test, because it fits a free parameter and would need an optimiser in the
suite to assert; `tools/` has no script for it either. Re-derive it from
`marks.json` and the card's `distanceNm` if a position is ever disputed.

## Notes on the card

- The card is the 2026 update of a card the club has kept since at least
  2008 (the chart on the club's website is "Revised 2008"); the 2025
  edition is also on the club's site.
- The twenty buoy positions are traced from OpenStreetMap and numbered by
  eye against the chart, and Cage is the club's own figure given in
  correspondence; neither is backed by a document, and a Port of Cork notice
  or list, or the club adding positions to its instructions, would replace
  both with a citation. OpenStreetMap's data is ODbL, which the MIT licence
  on this repository does not carry — worth settling, since these are
  positions taken as data, not tiles shown with attribution.
- EF2 and EF4 are the two still open, and nothing distinguishes
  OpenStreetMap's three East Ferry nodes from one another.
