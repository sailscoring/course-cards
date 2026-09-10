# HYC Autumn League 2026

The offshore and inshore course cards for Howth Yacht Club's Autumn League
2026, 12 September to 17 October, as the club published them on 9 September —
"HYC COURSE CARD - 2026 Rev 0 (08/09/2026)" — with the marks they letter and
the start line the sailing instructions define.

The club's filenames still say "Final Draft 4.1", but these are the cards
linked from the club's own event page as "Offshore Course Card" and "Inshore
Course Card", and SI 6.1 C and 6.2 C make the course card part of the sailing
instructions. This data set previously held the 6 September drafts, in Word
and Excel, that these replace; what changed is in "Against the drafts" below.

| File | Source | Made by |
|---|---|---|
| `marks.json` | `../al-2025/source/AL_Course_Card_Technical_Sheet.pdf` | `tools/extract_marks.py` |
| `offshore.json` | `source/Offshore_Autumn_League_Course_Card_-_2026_Final_Draft_4.1_Comp.pdf`, `source/2026_AL_Sis.pdf` | `tools/extract_hyc_al_card.py`, `tools/extract_start_line.py` |
| `inshore.json` | `source/Inshore_Autumn_League_Course_Card_-_2026_Final_Draft_4.1_Comp.pdf`, `source/2026_AL_Sis.pdf` | `tools/extract_hyc_al_card.py`, `tools/extract_start_line.py` |
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

**Marks.** SI 6.1 C and 6.2 C name a Technical Sheet, but the club has not
published a 2026 one, so the marks are the 2025 sheet's, read from it in
place by `extract_marks.py`; the manifest points at the file in
`../al-2025/source/`. Every letter the two cards use is on it, and that its
positions are still the ones the cards are laid out on was established while
the drafts were the source — see below.

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

## Notes on the cards

- **The courses stop before the finish.** Every offshore course ends at G or
  K — which is what SI 6.1 D says the run in begins from, "the last mark on
  the displayed course (either K or G)" — and every inshore one at a fixed
  mark too. The run to the finishing line is in the card's note and in the
  SI, not in the sequence. The 2025 cards ended each course at F, a mark of
  the marks file with a `placement` and no position, which is what the format
  is for; until the finish is a mark here, a consumer of this card gets the
  course as far as the last rounding mark and no further.
- SI amendment 01 replaces 6.2 D, adding to the inshore finishing line the
  instruction to pass Spit to starboard on the way to it — which the inshore
  card already printed in its own note 2. It leaves 6.2 A and B, which the
  start line is read from, as they were.
- The offshore card uses 12 marks (A D E G H I K O P U V Z) and the inshore
  card 11 (C D H I K O P U V W Z). B, F, J, M, Q, R, S, T and X are on the
  2025 sheet and named by neither — including Q and S, which are on the run
  in to the offshore and inshore finishes but not printed in any course, and
  R, which SI 6.2 D names as one end of the inshore finishing area.
- Almost every mark on the inshore card is rounded to port: 8 of its 468
  mark roundings are to starboard, all in the 080°, 200° and 240° rows. The
  offshore card mixes the two throughout — 126 of 415 to starboard.
