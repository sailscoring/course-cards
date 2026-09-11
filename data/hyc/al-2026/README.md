# HYC Autumn League 2026

The offshore and inshore course cards for Howth Yacht Club's Autumn League
2026, 12 September to 17 October, as the club published them on 9 September —
"HYC COURSE CARD - 2026 Rev 0 (08/09/2026)" — with the marks they letter and
the start line and finish the sailing instructions define.

The club's filenames still say "Final Draft 4.1", but these are the cards
linked from the club's own event page as "Offshore Course Card" and "Inshore
Course Card", and SI 6.1 C and 6.2 C make the course card part of the sailing
instructions. This data set previously held the 6 September drafts, in Word
and Excel, that these replace; what changed is in "Against the drafts" below.

| File | Source | Made by |
|---|---|---|
| `marks.json` | `../al-2025/source/AL_Course_Card_Technical_Sheet.pdf`, `source/2026_AL_Sis.pdf` | `tools/extract_marks.py` |
| `offshore.json` | `source/Offshore_Autumn_League_Course_Card_-_2026_Final_Draft_4.1_Comp.pdf`, `source/2026_AL_Sis.pdf` | `tools/extract_hyc_al_card.py`, `tools/extract_start_line.py`, `tools/extract_finish.py` |
| `inshore.json` | `source/Inshore_Autumn_League_Course_Card_-_2026_Final_Draft_4.1_Comp.pdf`, `source/2026_AL_Sis.pdf`, `source/Autumn_League_SI_Amendment_01.pdf` | `tools/extract_hyc_al_card.py`, `tools/extract_start_line.py`, `tools/extract_finish.py` |
| `source/*.md` | the sailing instructions beside them | `tools/pdf_markdown.py` |
| `offshore.html`, `inshore.html`, `map/marks.svg` | the JSON above, `map/background.png` | `tools/render-cards.ts` |
| `map/background.png`, `.json` | OpenStreetMap + OpenSeaMap tiles | `tools/fetch_map.py` |

`manifest.json` records each artifact's source and the metadata that heads the
output; `pnpm data` rebuilds them all and `pnpm data:check` verifies the
committed files against a fresh run.

## How the JSON is produced

**The cards.** Each is a single page: a row per wind direction, 000°–340° in
20° steps, lettered A–T (no I, no O), and four numbered columns of courses,
each a sequence of mark letters. Course ids are the card's own letter and
column, `A1` … `T4`, 72 per card. The wind direction each row is headed with
is carried as a note and on each course as `windDirectionDeg`; it is not
folded into the id. The 2025 cards encoded the beat in the course number
instead (`073` = 070°, column 3), and these do not say how a course is to be
signalled beyond SI 6.1 C's "letters and numerals displayed on boards".

The side comes from the colour of each letter, as the card's own legend says:
"Marks coloured RED shall be rounded / passed to PORT. Those coloured GREEN
and underlined shall be rounded / passed to STARBOARD." These are real-text
PDFs, so `extract_hyc_al_card.py` reads the colour the PDF sets for the
glyphs — the document's own instruction, not a rendering of it — by way of
`pdftohtml -xml`, which breaks a line wherever the fill colour changes. The
underline the legend also mentions is not read: the 2026 drafts underlined a
whole row of the offshore card by accident. A letter in a course that is
neither the card's red nor its green stops the build rather than being
guessed at; none is.

The table's rules are drawn rather than typed, so the grid comes from the
card's own headings: a run belongs to the row whose wind direction is printed
nearest it down the left, and to the column whose number is printed over it.
That is geometry, so every build checks it against a second reading that uses
none of it: `pdftotext -layout` sets each row of the table on a line of its
own, and the letters of that line are the row's four courses run together. A
letter dropped, doubled or read out of order stops the build. The two
readings agree on all 144 courses of both cards. What the colour reading adds
on top is the side, and the two cards between them give 126 of 415 offshore
roundings to starboard and 8 of 468 inshore.

**The start line.** SI 6.1 B and 6.2 B define the offshore and inshore
starting lines, and 6.1 A and 6.2 A the areas they are laid in; both are
quoted verbatim into each card's `startLine` by `extract_start_line.py`, so
every course begins at `SL` and the first leg is the beat from the line to Z.
SI 6.1 C and 6.2 C say as much: Z is "laid approximately to windward of the
starting line" and "is the first mark on all fixed mark courses" — which the
cards bear out, every one of the 144 beginning at Z.

**The finish.** The cards print no course past its last rounding mark, and
the run home is the same for all 144, so it is in the sailing instructions
instead: SI 6.1 D offshore, and 6.2 D inshore as amendment 01 replaces it.
Each card carries it as its `finish` — the line as a mark, the instruction
quoted verbatim into its `placement` by `extract_finish.py`, and the marks
the run in passes in `via` — and every course ends with those marks and then
the line. See "The run home" below.

**Marks.** SI 6.1 C and 6.2 C name a Technical Sheet, but the club has not
published a 2026 one, so the marks are the 2025 sheet's, read from it in
place by `extract_marks.py`; the manifest points at the file in
`../al-2025/source/`. Every letter the two cards use is on it, and that its
positions are still the ones the cards are laid out on was established while
the drafts were the source — see below.

One mark is not the sheet's. SI 6.1 D sends the offshore fleet home "passing
the Rowan Rocks Buoy and the Howth Mark (both IALA marks) to starboard":
Rowan Rocks is the sheet's Q, and the Howth Mark it does not letter. It is
here as **HM**, declared in the manifest with the instruction that names it,
at the position OpenStreetMap holds for the Commissioners of Irish Lights
buoy of that name — node 1592333181, `seamark:reference` CIL00910,
© OpenStreetMap contributors, the same source as the chart imagery. Nothing
else is added: `extract_marks.py` refuses a declared mark whose id is on the
sheet, so the sheet stays the source for its own.

## The run home

The two cards print courses that stop at a rounding mark, and the sailing
instructions carry every one of them on from there to the finishing line.
Offshore, SI 6.1 D: "After passing the last mark on the displayed course
(either K or G), boats shall sail to the finish line passing the Rowan Rocks
Buoy and the Howth Mark (both IALA marks) to starboard. The finish line is
between a vertical line on the front of the Finisher's Hut and a Black cherry
bouy." Inshore, SI 6.2 D as amendment 01 replaces it: "From the last mark on
the displayed course, boats shall sail to the finish line passing the Spit
mark to starboard", the line being "between a spherical orange Mark F and the
main mast (or red/white pole) on the adjacent Committee Finishing Vessel".

So every course here ends:

| | Run in | Finishing line |
|---|---|---|
| Offshore | **Q** then **HM**, both passed to starboard | **FH**, 53° 23.60′ N 006° 03.92′ W |
| Inshore | **S**, passed to starboard | **F**, laid on the day |

Each card carries that as its `finish`, with the instruction quoted into the
`placement` and the run in as `via`, and `extract_hyc_al_card.py` appends the
marks to all 144 courses. The card's own table is unchanged — `printedMarks`
is the sequence as the club sets it, and the rendered page uses it, so the
grid still reads `Z U I H G` and the ending is given once beneath it.

**Three ids are new to this data set.** HM is the Howth Mark, above. FH is
the offshore finishing line, named for the Finisher's Hut because the club
letters no mark there; F is the inshore one, which is what amendment 01 calls
it — "a spherical orange Mark F" — and which the 2025 sheet already lists as
"Finish". A card's `finish` resolves ahead of the marks file, so F here is
the 2026 instruction's line and not the sheet's 2025 entry, and the two cards
can finish in different places while sharing one marks file.

**Only the offshore line has a position.** Its shore end is a transit — "a
vertical line on the front of the Finisher's Hut" — and the SI puts the hut
"on the East Pier approximately 100m east of the old lighthouse". A hundred
metres due east of that lighthouse (OpenStreetMap way 377915968, as before)
is 53° 23.60′ N 006° 03.92′ W — which, by OpenStreetMap's outline of the
pier, is some twenty-five metres off its edge, so the instruction taken
literally does land on the pier and no guess is needed at where along it the
hut stands. The inshore line is a buoy and a
committee vessel laid per race: it has a `placement` and no position, and a
consumer is asked for it exactly as it is asked for the start line and for Z.

**What it is worth.** The run home is 1.22 NM from K and 1.74 NM from G — on
a seven-to-twelve-mile course, a tenth to a fifth of it. A consumer that
stopped at the last printed mark got a course short by that much with nothing
saying so, which matters most to a performance-curve score, where elapsed
time is divided by the course's length.

It is longer than the drafts' arithmetic assumed. The distance column the
drafts printed was reproduced by taking the last mark to Q and then a flat
0.36 NM to the line; Q to HM to FH is 0.50 NM. The drafts are superseded and
nothing here is checked against them, but the difference is the club's
allowance against the marks' own geometry, and it is the club's allowance
that was approximate.

Two things the ending is not. It is the **Round the Cans** finish: the same
instructions give Windward/Leeward races a line "approximately upwind of the
leeward mark", which is not these cards' courses. And it is the finish
"unless a race is shortened" — a shortened course is a race-day fact, like
where the line was laid, and nothing a card can carry.

## No distances, and what that costs

**The published cards print no distances.** The drafts gave every course a
length in nautical miles beside it, and the column is gone; `distanceNm` is
therefore absent from all 144 courses, and the rendered pages show only the
lengths the library computes from the marks.

That column was this data set's cross-check. The card's distances were
computed rather than measured, so they could be recomputed from the marks and
the club's own conventions, and 132 of the 144 agreed to a fifth of a mile.
Three things rested on that agreement, and all three were established while
the drafts were the source:

- the mark sequences read off the cards were the ones the distances were
  computed from, so the extraction was right;
- the 2025 sheet's positions were the ones the cards were laid out on, so
  using them for 2026 is sound;
- the conventions were the ones actually applied — a first beat of 0.67 NM
  offshore and 0.5 NM inshore, an average 0.4 / 0.3 NM from Z to the first
  fixed mark, upwind legs lengthened 40% offshore and 50% inshore, and a run
  in to the finish by way of Q offshore and S inshore.

With nothing printed to check against, `tools/check_hyc_al.py` has been
removed rather than left to pass vacuously; it and the twelve differences it
recorded are in the repository's history, with this data set's drafts. The
extraction no longer needs that corroboration — it is PDF text read twice
over, not OCR — but the second point does rest on the drafts, and the
sequences the drafts' arithmetic vouched for are, bar one course, exactly the
sequences on these cards.

## Against the drafts

**143 of the 144 courses are unchanged.** The one that is not is offshore
**N2**, which the drafts printed as `Z E O I G` against 9.1 NM — a mile and
four fifths short of what its own marks came to, the largest difference of
the twelve and the one recorded as "the sequence looks short rather than the
distance wrong". The published card reads `Z E I O I G`, which comes to
9.34 NM: the sequence was short, and an I has been added.

The other eleven differences cannot be resolved either way now that the
distances are gone. Two more things about the cards, unchanged from the
drafts and neither of them arithmetic:

- offshore K3 and K4 are the same course, `Z O A K A G`, printed twice;
- the inshore 280° and 300° rows are identical to each other, course for
  course.

Two things that did change besides N2:

- **The offshore finishing line is filled in.** The drafts read "between the
  ??????????????????"; the card now reads "between a vertical line on the
  front of the East Pier Finisher Hut & a black cherry buoy", which is SI
  6.1 D's line.
- **The wind column is headed "+/- 10°"**, the tolerance the drafts left to
  the reader. It is kept in the "Wind direction" note.

The notes also now carry the card's own numbering ("1.", "2.", "3") because
the PDF prints it as text where Word supplied it as a list style. The
offshore card numbers its third note "3" without the full stop the other two
have; that is the card's, and it is left alone.

## The charts

Each card's chart is cropped to that card. The 2025 sheet lists the marks of
both fleets and nine that neither card uses, and drawn whole it is a picture
mostly of water the fleet never sails: Malahide and Talbot pull it three
miles north, the Howth Sound marks two miles south. The manifest gives each
card a `chart` block, and the page is framed on the marks its own courses
name — which, now that every course runs to the finishing line, includes the
run home:

| | Framed on | Kept in besides |
|---|---|---|
| Inshore | C D H I K O P U V W, and **S** on the run in | **R** |
| Offshore | A D E G H I K O P U V, and **Q HM FH** on the run in | — |

Both charts used to be held open over water no course reached, because the
run in was prose: Q and S were kept in by hand, and the offshore chart by a
point for the old lighthouse the SI measures the Finisher's Hut from. They
are marks of every course now, so the frame reaches them of its own accord
and only one entry is left. The inshore card's note 2 and SI 6.2 D, as
amendment 01 replaces it, put the finish "in the vicinity of the Spit Mark
(S) and the South Rowan Buoy (R)": Spit is on the run in, and South Rowan is
kept in by hand, no course sailing to it.

The inshore finishing line is laid on the day and so is not drawn at all —
like SL and Z, the chart shows what the card can place. Each entry in the
manifest's `chart` block carries its own `why`, so nothing is cropped away
without the club's own words being the reason it could be.

The crop is per data set, not automatic: a card with no `chart` block is
still drawn on its whole marks file, and only these two cards have one. The
marks table and the bearing and distance matrices further down each page are
untouched — they are reference tables for the club's marks, not this card's.
`map/marks.svg`, the standalone map, is still every mark on the sheet.

## Notes on the cards

- **The cards stop before the finish; the courses here do not.** Every
  offshore course the club prints ends at G or K — which is what SI 6.1 D
  says the run in begins from, "the last mark on the displayed course (either
  K or G)" — and every inshore one at a fixed mark too. That ending is the
  same for all 144 courses, so the club states it once as prose rather than
  printing it 144 times, and a course read off the card alone is short by the
  run home with nothing to say so. It is in the sequences here instead; see
  "The run home".
- SI amendment 01 replaces 6.2 D, adding to the inshore finishing line the
  instruction to pass Spit to starboard on the way to it — which the inshore
  card already printed in its own note 2. It leaves 6.2 A and B, which the
  start line is read from, as they were.
- The offshore card prints 12 marks (A D E G H I K O P U V Z) and the inshore
  card 11 (C D H I K O P U V W Z). B, F, J, M, Q, R, S, T and X are on the
  2025 sheet and printed by neither — though Q and S are on the run in the
  sailing instructions add, and so are marks of every offshore and inshore
  course; R, which SI 6.2 D names as one end of the inshore finishing area,
  is on neither. The two
  subsets are not disjoint: ten marks are common to both, and only C and W
  are the inshore card's alone, A, E and G the offshore card's. See "The
  charts" below.
- Almost every mark on the inshore card is rounded to port: 8 of its 468
  mark roundings are to starboard, all in the 080°, 200° and 240° rows. The
  offshore card mixes the two throughout — 126 of 415 to starboard.
