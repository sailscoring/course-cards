# HYC Autumn League 2026 — draft cards

**These are drafts, not the club's published cards.** They are the offshore
and inshore course cards as they stood on 6 September 2026, marked "Rev 0
(xx/yy/2026)" and, on the offshore card, "SEPT 6TH DRAFT", circulated for
comment before the league starts on 12 September. They are here to be read
by the tools and checked; when the club publishes the official cards this
data set gets a second pass against them, and the differences will show up
as a diff of this JSON.

| File | Source | Made by |
|---|---|---|
| `marks.json` | `../al-2025/source/AL_Course_Card_Technical_Sheet.pdf` | `tools/extract_marks.py` |
| `offshore.json` | `source/AL_Offshore_Course_Card_2026_draft.docx` | `tools/extract_hyc_al_card.py` |
| `inshore.json` | `source/AL_Inshore_Course_Card_2026_draft.xlsx` | `tools/extract_hyc_al_card.py` |
| `offshore.html`, `inshore.html`, `map/marks.svg` | the JSON above, `map/background.png` | `tools/render-cards.ts` |
| `map/background.png`, `.json` | OpenStreetMap + OpenSeaMap tiles | `tools/fetch_map.py` |

`manifest.json` records each artifact's source and the metadata that heads
the output; `pnpm data` rebuilds them all and `pnpm data:check` verifies the
committed files against a fresh run, then runs the cross-check below.

## How the JSON is produced

**The cards.** The club drafts these in Office rather than as PDFs: the
offshore card is a table in a Word document, the inshore card a sheet in an
Excel workbook. Both are XML in a zip, so `extract_hyc_al_card.py` reads them
directly rather than through a converter. Each is a row per wind direction,
000°–340° in 20° steps, lettered A–T (no I, no O), and four numbered columns
of courses, each a sequence of mark letters with a distance in nautical miles
beside it.

The side comes from the colour of each letter, as the card's own legend says:
"Marks coloured RED shall be rounded / passed to PORT. Those in GREEN and
underlined shall be rounded / passed to STARBOARD." Only the colour is read. The
underline the legend also mentions is not usable: on the offshore card the
whole 040° row is underlined by accident, wind column and distances included.
A letter in a course that is neither the card's red nor its green stops the
build rather than being guessed at; none is.

Course ids are the card's own letter and column, `A1` … `T4`, 72 per card.
The wind direction each row is headed with is carried as a note, not folded
into the id: the format describes a sequence of marks, and which wind it
suits is the club's heading over it. The 2025 cards encoded the beat in the
course number instead (`073` = 070°, column 3); these do not, and the drafts
do not say how a course is to be signalled.

Each course carries the length the card prints for it as `distanceNm`. That
is the club's figure on the club's own assumptions — see the cross-check —
not the sum of the legs computed from the marks, and the rendered pages show
both, side by side.

**Marks.** The club has not published a 2026 technical sheet, so the marks
are the 2025 sheet's, read from it in place by `extract_marks.py`; the
manifest points at the file in `../al-2025/source/`. That the positions are
still current is not assumed — it is checked, below.

**No start line.** Every other card here begins each course at the start
line its club's sailing instructions define, quoted from them. The 2026
sailing instructions are not published yet, so there is nothing to quote and
the cards carry no `startLine`: each course begins at Z, the first mark the
card prints, exactly as printed. When the SIs appear, the start line goes in
as it does elsewhere and every course begins there.

## How it was checked

`tools/check_hyc_al.py`, run by `pnpm data` and `pnpm data:check` from the
manifest's `checks`, recomputes the length of all 144 courses from the marks
and compares it with the length the card prints. The card's distances are
computed rather than measured, so they can be recomputed, and a course whose
marks and whose distance disagree has one or the other typed wrong.

The conventions the cards are laid out on, which the manifest carries per
card as `model`:

- the first leg is the beat to the windward mark Z, laid straight-line to
  windward of the start line — 0.67 NM offshore, 0.5 NM inshore — and sailed
  at the beating factor;
- the second leg, Z to the first fixed mark, is taken at an average, 0.4 NM
  offshore and 0.3 NM inshore, since where Z is laid on the day decides it;
- every leg between fixed marks is its great-circle length, lengthened by
  40% offshore and 50% inshore when it is upwind — its bearing within 45° of
  the wind direction the row is headed with. The offshore boats are closer
  winded, hence the smaller factor;
- offshore, the run in to the finish leaves the last mark on the card for Q
  (Rowan Rocks) and then the Howth buoy, both to starboard, finishing at the
  East Pier; inshore it goes to S (Spit), left to starboard, and finishes
  0.2 NM up the Sound.

The Howth buoy and the East Pier line have no published position, so what is
beyond Q is taken as a constant: 0.36 NM, the figure the card's own distances
imply. Everything else in the model is the club's.

With that, **the model reproduces 68 of the 72 offshore courses to within
0.19 NM and 64 of the 72 inshore ones to within 0.14 NM** — good enough to
say three things:

- the mark sequences read off the cards are the ones the distances were
  computed from, so the extraction is right;
- the 2025 sheet's positions are the ones the cards were laid out on, so
  using them for 2026 is sound;
- the conventions above are the ones actually applied.

The twelve courses that do not reconcile are recorded in the manifest as
known differences, with what is wrong with each; they are the substance of
the feedback on the drafts. Two more things the check does not catch, being
about the cards rather than their arithmetic: offshore K3 and K4 are the same
course (`Z O A K A G`, 12.6 NM) printed twice, and the inshore 280° and 300°
rows are identical to each other, course for course and distance for
distance.

One systematic wrinkle: the offshore 220°, 240° and 260° rows all run about
0.15 NM long against the model, which is what treating the run in to the
finish as upwind would add. The model does not do that, and 0.15 NM is inside
the tolerance, so it is noted rather than modelled.

## Notes on the cards

- **The courses stop before the finish.** Every offshore course ends at a
  fixed mark, G or K, and every inshore one at a fixed mark too; the run to
  the finishing line is in the card's note, not in the sequence, though the
  printed distance includes it. The 2025 cards ended each course at F, a mark
  of the marks file with a `placement` and no position, which is what the
  format is for. Until the finish is a mark, a consumer of this card gets the
  course as far as the last rounding mark and no further.
- **The offshore finishing line is blank.** The card reads "The finishing
  line for Offshore courses shall be between the ??????????????????, unless
  a race is shortened at a mark of the course." The inshore card says only
  "located in the Sound".
- The offshore card uses 12 marks (A D E G H I K O P U V Z) and the inshore
  card 11 (C D H I K O P U V W Z). B, F, J, M, Q, R, S, T and X are on the
  2025 sheet and named by neither — including F, the 2025 finish mark, and
  Q and S, which are on the run in to the offshore and inshore finishes but
  not printed in any course.
- Almost every mark on the inshore card is rounded to port: 8 of its 468
  mark roundings are to starboard, all in the 080°, 200° and 240° rows. The
  offshore card mixes the two throughout — 126 of 414 to starboard.
