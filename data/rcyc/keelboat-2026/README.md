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
marks (22.3) and define the start and finish lines (26). The club's
**Autumn League Sailing Instructions** (September 2026) position three of
those four marks again (36), differently; the marks file takes the Autumn
League's, as below. Those are the only positions the club publishes.

| File | Source | Made by |
|---|---|---|
| `marks.json` | `source/Royal-Cork-Yacht-Club-Keelboat-Autumn-League-2026-….pdf`, 36, for three laid marks; `source/General-Sailing-Instructions-…-2026.pdf`, 22.3, for East Mark; `source/eoceanic-ireland.html`, eOceanic's list of Irish marks, for nineteen harbour buoys; Pat Tanner's workbook for E4 and EF4; the club, for Cage and EF2; the card, for every mark its courses name | `tools/extract_rcyc_card.py marks` |
| `keelboat.json` | `source/RCYC-Course-Card-Art-2026.pdf`, pages 2–4; the instructions' 26 for the start line | `tools/extract_rcyc_card.py card`, `… notes`, `tools/extract_start_line.py` |
| `routing.json` | `source/RCYC_Cork_Harbour_ORC_MASTER_v3_19_CAGE_CORROBORATED.xlsx`, Pat Tanner's workbook | `tools/extract_orc_routing.py` |
| `source/*.md` | the three documents | `tools/pdf_markdown.py` |
| `keelboat.html`, `map/marks.svg` | the JSON above, `map/background.png` | `tools/render-cards.ts` |
| `map/background.png`, `.json` | OpenStreetMap + OpenSeaMap tiles | `tools/fetch_map.py` |

`source/` keeps the card ("RCYC Course Card Art 2026", the club's
Keelboats Notice Board), the general and Autumn League instructions, and
eOceanic's list of marks verbatim, with the URLs they were fetched from in
the manifest. `manifest.json` records each artifact's source, the metadata
that heads the output, and — at length — the twenty-six marks added to the
four the instructions place, where each position came from, and why the
three laid marks have none; `pnpm data` rebuilds everything and
`pnpm data:check` verifies the committed files against a fresh run and
runs `tools/check_rcyc.py`.

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
the fewest of them placed, until the harbour buoys were placed — first
from OpenStreetMap, then from eOceanic's list and local knowledge (#13,
#17).

## How the JSON is produced

**Marks.** Two of the club's 2026 documents position the Port of Cork's
permanently laid race marks. The general instructions' 22.3 (March):
"Port of Cork Laid Race Marks are yellow cones permanently laid and may be
in these approximate locations", then Dosco (Corkbeg), Ringabella, Harp and
East Mark (Formerly Mark B). The Autumn League instructions' 36
(September): the same sentence without "cones", then Harp, Ringabella and
Dosco. They do not agree:

| Mark | General SIs 22.3 | Autumn League SIs 36 | Apart |
|---|---|---|---:|
| Ringabella | 51º 46.24’ N 8º 17.52’ W | 51º 46.39’ N 8º 17.78’ W | 408 m |
| Harp | 51º 47.19’ N 8º 14.21’ W | 51º 47.20’ N 8º 14.28’ W | 82 m |
| Dosco | 51º 49.26’ N 8º 15.81’ W | 51º 49.25’ N 8º 15.83’ W | 29 m |
| East Mark | 51º 46.31’ N 8º 14.18’ W | not listed | — |

Both print to a hundredth of a minute, about 18 m, so Dosco agrees as
closely as the two can; Ringabella and Harp do not, and a 408 m difference
for a permanently moored mark is not rounding — one document is wrong, or
the mark was moved and only one was updated. **The marks file takes the
Autumn League's**, the later of two current club documents, as Pat Tanner's
Cork Harbour workbook does. That is a rule, not a confirmation: his
workbook records the question as open, and the club has not been asked to
settle it. If it says 22.3 is right, the file's source goes back.

So the Autumn League instructions are the marks file's `source`, and Harp,
Ringabella and Dosco are read from 36, where each name is printed above
its position. East Mark, which 36 does not list and the card never names
but which 22.2 lets the race officer call, is taken from 22.3 and names it
as its own `source`. 36's caveat, that the marks "may be in these
approximate locations", is the file's one note; a note speaks for the
file's source, so for the three marks 36 places. 22.3 says the same of East
Mark, and that is told here, since a note cannot carry it.
`tools/check_rcyc.py` compares 22.3 with the marks file, with Ringabella
and Harp recorded as known differences: if the club corrects either
document so that they agree, the check fails, and the record goes.

For #16 this matters directly: Pat Tanner's passages to Ringabella and
Harp were depth-tested against the Autumn League positions, which the
marks file now carries.

The card's courses name twenty-six more. Fourteen are the harbour's
numbered channel buoys (No.3 to No.20), seven are the lettered buoys of
the entrance and East Ferry channels (E1, E2, E4, W1, W2, W4, EF2) and
one is Cage, buoy C1, the green conical the Grassy Walk line finishes at.
They are Port of Cork navigation marks, on Admiralty chart 1777, and **no
official document publishes a position for any of them**: not the club's
instructions, not the Cork Harbour Combined League's or the Autumn
League's, not any year's Cork Week instructions (whose harbour-marks
exhibit is a picture, and whose mark list positions only the offshore and
laid marks), not the Port of Cork's Information Manual or its passage
plans, which name the buoys and place none, and not the NGA List of Lights
(Pub. 114), which carries Cork Harbour's shore, range and pier lights —
Roche's Point, White Bay Range, Fort Davis Range, Spit Bank, Haulbowline,
Monkstown — and not one channel buoy.

**Nineteen of them are positioned from eOceanic, a cruising-guide site.**
Its list of Irish marks (https://eoceanic.com/weather/ireland, kept
verbatim as `source/eoceanic-ireland.html`, fetched 5 October 2026) gives
Cork Harbour's buoys by name, each with a position to a thousandth of a
minute and its light, and the names carry the numbers: "Cork outer harbour
Ramshead Bank No.6.", "Chicargo Knoll E1 Cork Outer Harbour". It does not
say where its positions come from, so they are a published list of unknown
origin rather than an official one. The manifest maps each mark to the row
that names it, the tool reads the position from that row, and each mark's
`source` quotes the row — which is where its number is printed. Pat
Tanner's Cork Harbour workbook
(https://github.com/Bateleur88/cork-harbour-orc), built from local
knowledge for the passage work in #16, takes its buoys from the same list,
and its depth tests were run against these positions.

The buoys were first positioned here from **OpenStreetMap**, which holds
the harbour's forty-six buoys with their positions and, for thirty-two of
them, their lateral colour, but no name or number for a single one: which
cone was No.7 was read off the chart, buoy by buoy, by this data set's
maintainer. That reading is now the cross-check, and it agrees. Every
eOceanic buoy is the nearest of eOceanic's buoys to the OpenStreetMap
node this data set had numbered the same — the numbering, a human reading
until now, is confirmed by a document — and sixteen of the nineteen lie
within 60 m of their node, as does E4, below. The other three are further apart: No.9 by
295 m, No.6 by 102 m and W1 by 73 m. Which reading is nearer the buoy is
not known; eOceanic's is the one carried. `tools/check_rcyc.py` holds all
twenty buoys to their nodes, with those three recorded as known differences, and
checks that each row eOceanic is read from prints the buoy's number and a
light of the colour IALA region A gives it — odd green, even red, which the
card's own Cage settles: the instructions call C1 "Green Conical", and C1
is odd. `tests/rcyc.test.ts` asserts that no two buoys share a place and
that each series runs from the harbour mouth inward, its lowest number
nearer the entrance than its highest. What is **not** asserted is that the
numbers rise monotonically buoy by buoy: the odd and even runs climb
opposite sides of a channel that bends west past Cobh, so no distance from
any one point rises along either, and a test that claimed otherwise would
need a channel centreline this data set has no source for.

**E4, the north cardinal, is placed from Pat Tanner's workbook**, not
from eOceanic. His position is a geotagged photograph of the buoy, and on
29 September 2026 he confirmed it with two plotters: a Navionics reading
6.9 m from it and a B&G Vulcan 0.9 m. eOceanic's "The Sound E4" is 23 m
from it, and 24 and 30 m from the two readings, so of the three
statements of where E4 is, the photograph has the best support. Its
OpenStreetMap node, the cross-check, is 16 m off. E4's `source` names the
workbook and the readings.

**Cage is placed from the club's correspondence.** Buoy C1 is not in
OpenStreetMap — the nearest node to it is 850 m away — so it could not be
read off the chart with the others. The club supplied its position
directly: 51°48.834'N 8°16.968'W, the green conical the instructions
describe at 26.1. eOceanic lists "C1" 39 m from it, which corroborates it
and does not displace it: the club's figure for the mark its own line is
laid to is the better authority. That is
correspondence, not a document, and Cage's `source` says so — "Royal Cork
Yacht Club correspondence"; if the club ever prints it, the citation
replaces the correspondence.

It is worth having, because it is the Grassy Walk line's outer distance
mark, and placing it made a check possible that tests everything at once.
Solve for the start line position that best fits the card's own printed
distances — 28 courses, nothing fed in but the mark positions and the
printed totals — and the answer lands at 51°48.675'N 8°17.767'W: 963 m from
Cage, 754 m from the club's pier at Crosshaven, between them near the
1500 m line, 431 m from its midpoint. The fit recovered a point near the
Grassy Walk line without being told the line exists. A wrong Cage would
have dragged it off; so would a mis-numbered buoy. Median error 0.54 nm on
courses of six to twelve miles. The fit was first made on the
OpenStreetMap traces and 22.3's laid marks, when it landed 367 m from the
midpoint with a median error of 0.46 nm: the positions carried now fit the
printed distances no better, and the printed distances, as below, are
estimates. The five courses that EF2 and EF4 have since made computable
(8, 20, 71, 76, 81) fit less well still — with them, 33 courses, the point
is 597 m from the midpoint and course 20 is 2.0 nm short of its printed
13.5 — and are left out so the figure stays comparable.

That check also settles course 12, whose third round prints "(3nm)" after
rounds of 7 and 9. Computed from positions it is 10.38 nm, which is what a
third round after 7 and 9 should be: the card has a misprint, and the JSON
still carries 3 as printed. Courses 3 and 19 sit furthest out — printed 12.0
against 9.08 and 10.46. Pat Tanner's workbook records the card's author on
the printed distances generally: they are estimates, carried forward
through the card's revisions and not recalculated when a course changes.

**EF2 is placed as the club gave it**, on the same footing as Cage:
51° 50.631' N 8° 14.238' W, in correspondence, and its `source` says so.
Two other readings agree: eOceanic lists it, as "Cork Harbour east channel"
with EF2 in its light, 49 m away, and a Navionics reading by Pat Tanner is
15 m south on the same longitude. `tools/check_rcyc.py` holds Cage and EF2
to eOceanic's rows. This data set once explained EF2 and EF4 as
unidentifiable because OpenStreetMap's three East Ferry nodes, tagged
`seamark:type=yes`, had no colour to tell them apart; that took the nodes
for the EF buoys, and they are not: the nearest is 571 m from the club's
EF2 (#14).

**EF4 is a race mark, not a navigation buoy**, and it is placed on Pat
Tanner's word. His workbook records it as a permanently moored race mark,
unlit, at 51° 50.720' N 8° 14.740' W, from "a published RCYC reference"
it does not name, and no RCYC publication found gives it; so its `source`
names the workbook and says the reference is unnamed. If the club's
document turns up, it replaces the workbook. It is not EF1, which the club
also gave a position for (#14): EF1 is the lit starboard-hand buoy of the
East Ferry channel, 1.6 km to the east, and the card never names it.
eOceanic, which lists the channel's lit buoys, has nothing within 500 m of
EF4.

Three marks are still unplaced, each with a `placement` and no position,
and all three are laid marks:
Dutchman ("approx. 2 cables SE of the Dutchman Rock/Fennels Bay") and
Curlane ("a mark laid on the Curlane Bank") in the card's own words, and
White Bay, which course 73 names and nothing describes. The manifest lists
all twenty-six with the reasoning beside them.

Pat Tanner's workbook has planning positions for all three — Dutchman
51.7847, -8.283133; Curlane 51.8241, -8.287567; White Bay 51.80635,
-8.254067 — and records them as approximations for laying the marks, which
are laid afresh each race day: his race officer's page uses the RIB's GPS
fix of the day's mark wherever there is one. They are told here and not
carried as positions, because a position in the marks file is one a reader
may compute with, and these would be taken for where the mark is. On race
day the caller supplies the fix, as it supplies the line.

The consequence has shifted but not closed: **thirty-five of the forty
courses can now be computed with only the start line supplied**, which was
the point of the exercise. Course 1, for instance, resolves Ringabella, W2,
Cage, No.7 and Dosco from this file and asks only for SL. The five that
cannot are the four at Curlane (72, 75, 83) or Dutchman (2), and course 73
at White Bay — each asks the caller for that mark, as every course asks for
the line, and rightly: they are laid on the day, and only then is there a
position for them.

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

## The routing overlay

Many of the card's legs are not sailable as straight lines: Cork Harbour's
banks, Spike Island and the shore between the Grassy Walk and the entrance
lie across them (#16). `routing.json` is the local knowledge that says which
are and how the fleet goes round the rest, and it is **Pat Tanner's**: his
master workbook, kept verbatim in `source/` (v3.19, from
https://github.com/Bateleur88/cork-harbour-orc, SHA-256
`ff0ae3ee…a735220`), from which `tools/extract_orc_routing.py` generates
the overlay. His repository is MIT-licensed, which is taken to cover the
waypoints and passages.

He tested every straight line the card sails against INFOMAR's 2 m
bathymetry, sampling every 5 m, and passed a line with at least 1.5 m below
chart datum throughout — a modelling rule, he is careful to say, not a
declaration of navigational safety. Where a line failed he authored a
passage through waypoints of his own; three more pass the depth test but are
routed to keep 150 m off the Refinery Jetty, which the instructions exclude.
The overlay carries **eight waypoints, 45 passages and 79 pairs found
direct**, each pair once in either direction (the workbook lists them by
direction; the tool merges each with its reverse, and refuses a pair routed
differently each way). One workbook passage is left out, Grassy Mid to
RW_Rams_Head, because it ends at a waypoint and so is no leg of a card.
Curlane is left out altogether: its ten pairs fail the depth test and are
sailable only near high water, which is a condition of the courses (#18),
not a route.

**Where it assumes the marks are.** Each verdict holds for the positions it
was tested at, so the overlay assumes each mark where the workbook has it,
within 20 m, and a mark the marks file has moved further is stale: the
library leaves every pair touching it unreviewed, and `pnpm data:check`
reports it without failing. The workbook's positions are this data set's
for every mark it uses except Dosco, 10.5 m off and within tolerance, and
**Cage, 39 m off**: the workbook tested eOceanic's C1, and the marks file
carries the club's position. Rather than move the mark to suit the overlay,
Cage's lines were **tested again at the club's position**, with the
workbook's own method — `tools/check_depth.py` runs Pat's sampling code
(`scripts/geo.py` from his repository) against the same three INFOMAR grids,
GEO12_04, KRY12_05 and CB12_01, and first reproduced his validation case
exactly: Dosco to RW_Fort_Davis, 641.3 m, 130 of 130 samples, minimum
2.875 m. All eleven pass, every sample covered, so Cage is assumed at the
club's position:

| Line | Length | Samples | Minimum below chart datum |
|---|---:|---:|---:|
| Cage – Dosco | 1,517.9 m | 305/305 | 1.968 m |
| Cage – No.5 | 946.1 m | 191/191 | 2.009 m |
| Cage – No.6 | 1,520.1 m | 306/306 | 2.526 m |
| Cage – No.7 | 1,802.7 m | 362/362 | 1.819 m |
| Cage – No.8 | 896.2 m | 181/181 | 1.761 m |
| Cage – No.10 | 1,797.6 m | 361/361 | 1.692 m |
| Cage – No.11 | 3,739.9 m | 749/749 | 1.756 m |
| Cage – No.12 | 2,278.5 m | 457/457 | 1.749 m |
| Cage – RW_Rams_Head | 921.7 m | 186/186 | 2.526 m |
| Cage – RW_West_of_Refinery | 2,596.2 m | 521/521 | 1.796 m |
| Cage – White Bay | 2,151.6 m | 432/432 | 2.514 m |

Cage – No.6, which the workbook passed with a 29.9 m unsurveyed run near
its Cage, is fully covered from the club's. The grids are 1.8 GB and are
not in this repository; `tools/check_depth.py`'s header says how to fetch
them and rerun it.

The start line has three assumed positions, after the workbook's three
starting and finishing options: **the Grassy Walk**, at the workbook's
Grassy Mid (the midpoint of the line's shore end and Cage), within 500 m —
where Pat's own race officer page warns that a recorded line is away from
the point its routes assume; and a committee-boat line within 500 m of
**Dosco** or of **No.8**, routed as that mark. The instructions say only
that a committee vessel may lay a line (Autumn League 44); the areas are the
workbook's. Dutchman and White Bay, laid afresh each race day, are assumed
at the workbook's planning positions within 200 m.

## How it was checked

The laid race marks are checked against the club's other statement of
them: the general instructions' 22.3, which agrees on Dosco and differs on
Ringabella and Harp, as above. The Cork Week instructions' laid marks sit
near two of them but are not them. The marks tool refuses a card that names
a mark neither the instructions nor the manifest supplies. Structural tests (`tests/rcyc.test.ts`) check
the forty courses' order, a dozen of them against the printed card round by
round, every course's start and finish at the line, the first note's
content, the source of every position, that no two buoys share a place,
that each series runs from the entrance inward, and that a course asks the
caller only for the line and the marks left unplaced. `tools/check_rcyc.py`,
run by `pnpm data:check`, holds the buoys to their OpenStreetMap traces and
to the colours their numbers give them, the club's Cage and EF2 to
eOceanic's, and the laid race marks to 22.3, each difference that is known
recorded in the manifest with its reason.

The card's own arithmetic, described above, is a weaker check than it
first looked: fitting a start line to the printed distances of 28 courses
puts it near the Grassy Walk line, which says Cage and the numbering are
not badly wrong, but the printed distances are estimates and each
correction to the positions has made the fit slightly worse. It is not a
test, because it fits a free parameter and would need an optimiser in the
suite to assert; `tools/` has no script for it either. Re-derive it from
`marks.json` and the card's `distanceNm` if a position is ever disputed.

## Notes on the card

- The card is the 2026 update of a card the club has kept since at least
  2008 (the chart on the club's website is "Revised 2008"); the 2025
  edition is also on the club's site.
- Nineteen buoy positions are eOceanic's, whose own source is not stated;
  E4's is Pat Tanner's, from a photograph and two plotter readings, and so is
  EF4's, from an RCYC reference his workbook does not name; Cage and EF2
  are the club's own figures given in correspondence. None is backed by an
  official document, and a Port of Cork notice or list, or the club adding
  positions to its instructions, would replace them with a citation. OpenStreetMap's data is ODbL, which
  the MIT licence on this repository does not carry — worth settling for
  the cross-check's traces, since these are positions taken as data, not
  tiles shown with attribution; eOceanic states no licence for its list.
- EF4's position rests on an RCYC reference nobody has named; finding it
  would give the mark a document.
