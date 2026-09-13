# Clontarf Yacht and Boat Club, season 2026

Clontarf Yacht and Boat Club races cruisers and dinghies in North Dublin
Bay, between the Bull Wall and Sutton, and publishes a course card for
each: the **Cruiser Course Card 2026** is 24 numbered courses round twelve
lettered marks — six laid in the bay, six "harbour marks" inside the Bull
Wall — with a chart, a legend and each course's wind direction and length.
The club publishes no positions for its marks and no sailing instructions
for its season racing. The positions of the six bay marks come from
**Dublin Port's Notice to Mariners**, which lists the marks every club has
sanction to lay in the port limits; and the club's one published set of
instructions, for the **East Coast Bilge Keel Championship**, carries a
second card of sixteen courses round those six marks, with a start line.

| File | Source | Made by |
|---|---|---|
| `marks.json` | the card's legend (`source/2026-CYBC-Coursecards-Cruiser.pdf`) for the marks; `source/20-2026-Yacht-Racing-Marks.pdf` for the six positions | `tools/extract_cybc_card.py marks`, `tools/extract_ntm_marks.py` |
| `cruiser.json` | `source/2026-CYBC-Coursecards-Cruiser.pdf` | `tools/extract_cybc_card.py cruiser` |
| `ec-bkc.json` | `source/EC-BKC-2026-2-SI_rev03.pdf`, 12.1; 7.1–7.2 for the start line; 8.1, 12.2, 12.3 as notes | `tools/extract_cybc_card.py ecbkc`, `… notes`, `tools/extract_start_line.py` |
| `source/*.md` | the four documents | `tools/pdf_markdown.py` |
| `*.html`, `map/marks.svg` | the JSON above, `map/background.png` | `tools/render-cards.ts` |
| `map/background.png`, `.json` | OpenStreetMap + OpenSeaMap tiles | `tools/fetch_map.py` |

`source/` keeps the card as the club publishes it ("2026 CY&BC Coursecards
Cruiser.pdf", from the club's Course Cards page), the East Coast Bilge Keel
Championship instructions (revision 3 of 20 August 2026), Dublin Port's
notice 20 of 2026 and the port's summary of the year's notices, verbatim,
with the URLs they were fetched from in the manifest. The club's two dinghy
cards — fourteen numbered marks with no positions anywhere, and for the
summer 48 courses as sequences of those numbers — are not here: nothing
places a single one of their marks. `manifest.json` records each artifact's
source, the metadata that heads the output, the placement the harbour
marks carry and why, the instructions' two misprints of a mark, and the
cross-checks; `pnpm data` rebuilds everything and `pnpm data:check`
verifies the committed files against a fresh run — the checks run in both.

## How the JSON is produced

**Marks.** The card's legend letters twelve marks — `BI = Bull Island`,
`CH = Churn`, … `V = Vernon` — and that is the whole of what the club says
about them: no positions, no descriptions. The legend is read from the
card's text layer. Six of the twelve are the marks Dublin Port's notice
says the club "have permission to lay … within the Dublin Port Limits from
April to October": Sutton, Drumleck, Outer, Inner, Bull Island and
Causeway, each with a position to a hundredth of a minute and the same
letter the card uses (`SUT`, `DR`, `O`, `IN`, `BI`, `CW`). Those positions
are the marks file's, read by `tools/extract_ntm_marks.py` from the
notice's table for this club. The other six — Churn, Hub, North Bank, Spit,
South West and Vernon — the club's instructions call "Harbour Marks"; they
lie inside the Bull Wall, north of the shipping channel, and nobody
publishes a position for them. They carry a `placement` saying so and no
position, so a course that rounds them asks for their positions as it would
for a mark laid on the day. The names are the card's: the notice spells two
of them Drumlek and Causway.

**The cruiser card.** A real-text PDF: two half-tables, each row a wind
direction, a length class with the miles in brackets, a number and the
marks with sides run together, `Vp-Hs-SWp-CHp-NBs`. The tool finds the two
tables by their "No" column headings and reads each row's cells by their
x on the page; every mark must be one the legend letters, and there must be
24 courses. The side is the `p` or `s` after each mark; the miles in
brackets are `distanceNm` (the card heads the column "Legnth (mi)" — taken
as nautical miles, as every club's are); the wind is `windDirectionDeg`
where the card gives one direction, and absent for the four courses laid
out for three (`NW+W+SW`, `NE+E+SE`). Every course's direction and length
class, as printed, is the card's first note, since the format has no field
for a set of directions or for "Short" and "Long".

The card carries **no start line**: the club publishes no instructions for
its season racing, so there is nothing to quote. Its courses begin at the
first mark printed and end at the last, and the page and the library say
so — a scorer supplies the line if there is one to supply. This is the only
card in `data/` without one.

**The East Coast Bilge Keel Championship card.** 12.1 of the instructions
is a table of eight columns, one per wind direction, under "HIGH WATER 'X1'
COURSES" (A1–H1) and again under "LOW WATER 'X2' COURSES" (A2–H2): each
column a start line, a run of marks with `P` or `S` beside each, and a
finish line. It is read from the text layer by the columns' positions,
each word going to the column whose heading is nearest. Twice the
instructions print Outer as `0` (E2) and twice as `OUT` (A2), where every
other course and the legend have `O`; the manifest maps both to O and says
so. Course B2 prints no sides, so its entries carry none. The start line is
7.1 and 7.2, the committee-boat line; 8.1 says the finish "will be the same
line as the start line", so every course ends at `SL` too. 8.1, 12.2
("START-FINISH LINE & 1st LEG") and 12.3 are the card's notes — 12.2 by
its opening words, because the instructions number two clauses 12.2.

## How it was checked

`tools/check_cybc.py` runs as part of `pnpm data` and `pnpm data:check`:

- **The notice is the one in force.** The port's summary of 2026 notices
  lists notice 20 "Yacht Racing Marks" as issued on 1 January 2026 and no
  other notice with that title. The port's notices supersede one another
  and lapse at the year's end; when a new one is issued this check is what
  says the positions here are stale.
- **The club's positions against the port's.** 12.2 of the championship
  instructions prints "Approx. positions for Dublin Bays Marks" for the six
  bay marks, to a tenth of a minute. Each is the notice's position to that
  precision. (The instructions' text layer drops the "tt" and "ti"
  ligatures — "Su on", "posi ons" — so the check matches names by their
  remaining letters.)
- **Every mark a course names is one the legend letters**, on both cards.

Structural tests (`tests/cybc.test.ts`) compare all 24 cruiser courses and
all 16 championship courses with transcriptions of the printed tables, and
check which marks are placed and which are not.

The same notice is also checked against DBSC's marks sheet, in
`../../dbsc/summer-2026` — the one statement of where Dublin Bay's marks are
that is not the club's own.

## Notes on the card

- The harbour marks have no published position. If the club or the port
  publishes one, it belongs in the notice section or a club document, not
  in the manifest by hand.
- The bay marks' positions are the port's, to a hundredth of a minute;
  the club's own 12.2 gives them to a tenth and agrees.
- The cruiser card's inner courses (21–24) are short courses among the
  harbour marks, with one bay mark or none; all four are unplaceable until
  the harbour marks are.
