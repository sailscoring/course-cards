# Schull Harbour Sailing Club, Calves Week 2026

Calves Week is Schull Harbour Sailing Club's cruiser regatta in Long
Island Bay, West Cork — the Quintas Capital Calves Week 2026, Tuesday 4 to
Friday 7 August, with a Fastnet Race on the Wednesday. It has no course
card in the printed sense: the sailing instructions (10.1) have the race
committee set each course on the day "using fixed marks (other than
Start/Finish marks) and islands in Long Island Bay as well as the Fastnet
Rock" and display it on a board on the committee boat. What the club does
publish is a **Marks, Distances and Bearings** sheet in the same style as
DBSC's — fourteen positioned marks with the bearing and distance between
every pair — and, on the event's official notice board, a **chartlet**
of the marks and a sheet of **buoy photographs**, each captioned with a
position. This data set is those marks, and a card with no courses that
carries the start line, the finish and the instructions on courses over
them, for a race officer's called course to be resolved against.

| File | Source | Made by |
|---|---|---|
| `marks.json` | `source/CalvesWeek_Marks_Bearings_Distances_2026_v1.pdf`; the chartlet's index for the ids; OpenStreetMap for the Fastnet Rock | `tools/extract_shsc.py marks` |
| `course-card.json` | the sheet's caveats; the sailing instructions' 9–11 as notes, 12.1 as the start line and 13.1 as the finish, from the transcript below | `tools/extract_shsc.py card`, `… notes`, `tools/extract_start_line.py`, `tools/extract_finish.py` |
| `source/Calves_Week_Sailing_Instructions_2026.md` | the instructions, a scan — transcribed by hand | a person |
| `source/Calves_Week_Chartlet_2026.md`, `…_Buoy_Photos_2026.md` | the two documents | `tools/pdf_markdown.py` |
| `course-card.html`, `map/marks.svg` | the JSON above, `map/background.png` | `tools/render-cards.ts` |
| `map/background.png`, `.json` | OpenStreetMap + OpenSeaMap tiles | `tools/fetch_map.py` |

`source/` keeps the four documents verbatim. The sailing instructions,
chartlet and buoy photos are from the event's official notice board on
racingrulesofsailing.org (event 15264), with their URLs in the manifest.
The sheet — "Calves Week, Marks, Distances and Bearings", version 1, dated
9 July 2026 — is on neither the notice board nor the club's site, and the
copy here was supplied to the project; the manifest says so. `manifest.json`
records each artifact's source, the metadata that heads the output, the
cross-checks and the one mark added; `pnpm data` rebuilds everything and
`pnpm data:check` verifies the committed files against a fresh run — the
cross-checks run in both.

## The documents

The regatta's documents are on its official notice board (SI 3.1), which
the Notice of Race (7.1) says will host it: the Notice of Race (February
2026) and two amendments (17 and 30 July, handicap rules and where ORC
results are hosted), the sailing instructions (20 July), the chartlet and
buoy photos, a safety notice, and the class allocations. The three kept are
the ones the marks and the card depend on:

| File | What it decides |
|---|---|
| `Calves_Week_Sailing_Instructions_2026.pdf` | 9.1 the racing area, Long Island Bay and the Fastnet Rock, with starts "near Copper Point or Inside Harbour" and finishes inside Schull Harbour; 10.1 courses set on the day, which is why the card has none; 11.1 the chart of the permanently laid marks; 12.1 the start line; 13.1 the finishing line. |
| `Calves_Week_Chartlet_2026.pdf` | The chart 11.1 promises: the marks over an Admiralty chart, an index lettering the six fixed marks (A, C, P, G, EC, WC), and on its second page the three navigation marks photographed with their positions. |
| `Calves_Week_Buoy_Photos_2026.pdf` | The eight laid marks photographed, each captioned with its position. |

The Notice of Race and its amendments say nothing about marks, courses or
lines and are not kept; nor are the safety notice and class allocations.

**The sailing instructions are a scan.** The PDF on the notice board is
ten page images with no text layer, so `tools/pdf_markdown.py` can make
nothing of it and the start line and finish could not be read from it in
the way every other data set's are. Its sidecar is instead **transcribed
by hand** from the page images — every instruction, 1 to 23, in the
document's own headings and numbering, with wording, spelling and
punctuation as printed; the cover, sponsors' logos, the notice board's
links page and the WhatsApp QR code are not. The manifest marks the
document `transcribed`, and `regenerate.py` keeps the file rather than
rewriting it, checking only that it is there. The start line, the finish
and the notes are read from the transcript by the same tools that read
every other club's instructions (`parts()` in `pdf_markdown.py` reads a
`.md` back as the blocks it would have produced), so the card quotes the
transcript exactly — and the transcript is what to check against the
scan, which is kept beside it.

## How the JSON is produced

**Marks.** The sheet is a real-text PDF, read from `pdftotext -bbox` word
positions like DBSC's: a row per mark on two printed lines — latitude
minutes and a first line of description ("Nav Bouy", "Island", "(Castle
Grounds)"), then longitude minutes and a second ("Conical Green", "Red
Conical") — with the name between them, and under column headings the
bearing (first line) and distance (second) to every other mark. The header
says what the minutes are relative to ("Lat N 51°+", "Long W 9°+");
longitudes are West, so negative. The six fixed marks keep the sheet's
names and take the chartlet's letters as ids, matched by name from the
index the chartlet's text layer carries ("EC - East Calf Island"); their
first description line is the `shape` and the second the `color`, both as
printed, lowercased — "nav bouy" is the club's spelling. The eight laid
marks are numbered 1–8 on sheet, chartlet and photos alike, so the number
is the id; the sheet describes each by where it is laid, in parentheses,
and by what it is, so the place is the `name` ("Castle Grounds", "NW -
Long Island") and the description the `color` ("red conical", "conical
with Parnells wrap"). Three rows have no position: "Start" and "Finish",
which are the committee boat *Blue Thunder* and are the lines the sailing
instructions define — the card carries them, the marks file does not — and
"Weather Mark", laid on the day, which is `W` (the sheet heads its column
"W'Wrd") with a `placement` and no position.

**The Fastnet Rock** is added from the manifest. SI 9.1 makes it part of
the racing area and 10.1 a mark courses may be set round; the chartlet
shows it, 2.8 miles beyond the chart's edge; the sheet does not list it.
Its position is OpenStreetMap's, the centre of the islet (way 348787096),
as Kinsale's Great Sovereign is placed — a rounding mark the size of a
rock has no better point, and the lighthouse is 25 m away.

**The card.** No courses. `startLine` is 12.1 verbatim — a committee-boat
line, laid on the day, so a placement and no position — and `finish` is
13.1, likewise: "the course side of a laid mark, or Mark No. 6 as
indicated", inside Schull Harbour by 9.1. A race officer's called course
is resolved against them with `calledCourseLegs`, the line, the finish and
the weather mark supplied per race. The notes are the instructions'
sections 9, 10 and 11 whole, one note each, and the sheet's own caveats
last: "Bearings in Black, relative to True North. Distances in Red, in
NM. Mark Positions may vary slightly. All figures are approximate.
WARNING: Some direct paths are obstructed."

## How it was checked

`tools/check_shsc.py` runs as part of `pnpm data` and `pnpm data:check`:

- **Positions against the chartlet and the buoy photos.** The chartlet
  captions Amelia, Cush and Perch/Bull Rock with positions, and the buoy
  sheet captions marks 1–8; all eleven agree with the sheet to the
  hundredth of a minute they are printed to. The three islands have only
  the sheet.
- **Positions against the sheet's own bearings and distances.** The sheet
  says its figures are approximate, and they are. Held to DBSC's tolerance
  of 1° and 0.01 NM, one pair of the 182 agrees; the typical miss is three
  or four degrees and a tenth or two of a mile, much the same whether the
  pair joins islands, navigation buoys or laid marks. Since the chartlet
  and the photographs bear the printed positions out, the positions are
  taken as the club's statement and the table as the weaker document. The
  check holds it to **15° and 0.5 NM**, which 163 pairs meet, and the
  manifest lists the nineteen that do not, each with what the sheet prints
  and what its positions give. Nine of those are slips in one cell — the
  reciprocal cell agrees with the positions: Amelia→6 prints 147° where
  6→Amelia prints 167°, 1→2 prints 095° 4.44 NM against 2→1's 076° 1.86
  NM, 1→Goat Island 7.63 NM against 2.94, 7→Goat Island 8.79 NM against
  4.79, Goat Island→8 6.27 NM against 3.27. The other ten are five pairs
  that miss in both directions. The check fails if a listed pair comes
  right, so the list tracks the club's corrections.
- Structural tests confirm the sixteen marks and their ids, the sheet's
  positions and descriptions for a sample, the weather mark unplaced, the
  card's empty course list, its start line and finish quoting 12.1 and
  13.1, its notes, and a called course resolved and its legs computed over
  the marks with the line, the finish and the weather mark supplied.

## Notes

- The sheet's version and date ("V1 09/07/2026") and its column for the
  finish are read but carried nowhere: the finish column is all dashes.
- The chartlet's chart is UKHO material under licence 16106, provided by
  Latitude Kinsale; only its index and captions are read, and its map is
  not reproduced. The map in `map/` is OpenStreetMap and OpenSeaMap.
- SI 7.4 schedules a Fastnet Race for Wednesday 5 August, which is why
  the Fastnet Rock is a mark here; the other days' courses are round the
  bay's marks and islands.
