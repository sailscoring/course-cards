/**
 * Write an HTML page for every course card in data/: for each manifest, each
 * card artifact gets `<output>.html` next to it, rendered with the marks file
 * it names, and a data set with a chart gets `map/marks.svg`, the map of
 * its marks on its own. A card whose manifest entry has a `chart` block is
 * drawn on a chart cropped to that card — the marks its own courses use,
 * plus whatever the block keeps in — rather than on the whole marks file.
 * `--check` verifies the committed files instead. The last step of the
 * artifact pipeline, after tools/regenerate.py.
 *
 *     pnpm render            # write
 *     pnpm render -- --check # verify
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { parseCourseCardFile, parseMarksFile } from '../src/index';
import { renderCardHtml, renderMarksMapSvg, type ChartArea, type MapBackground } from './card-html';

const root = join(import.meta.dirname, '..');
const check = process.argv.includes('--check');

function* manifests(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* manifests(path);
    else if (entry === 'manifest.json') yield path;
  }
}

/** A manifest's `chart` block: what the card's chart must cover beyond the
 *  marks its own courses name, each entry saying why it is kept in. Either a
 *  `mark` of the marks file, drawn like any other, or a bare `position`,
 *  which only holds the frame open. */
interface ChartSpec {
  keep?: Array<{ mark?: string; position?: { lat: number; lng: number }; name?: string; why: string }>;
  paddingMinutes?: number;
  note?: string;
}

function chartArea(spec: ChartSpec | undefined): ChartArea | undefined {
  if (!spec) return undefined;
  const keep = spec.keep ?? [];
  return {
    keep: keep.flatMap((k) => (k.mark ? [k.mark] : [])),
    points: keep.flatMap((k) => (k.position ? [k.position] : [])),
    ...(spec.paddingMinutes === undefined ? {} : { paddingMinutes: spec.paddingMinutes }),
    ...(spec.note === undefined ? {} : { note: spec.note }),
  };
}

let failures = 0;
function emit(out: string, content: string): void {
  const rel = relative(root, out);
  if (check) {
    const current = existsSync(out) ? readFileSync(out, 'utf-8') : null;
    const ok = current === content;
    failures += ok ? 0 : 1;
    console.log(`${rel}: ${ok ? 'ok' : 'DIFFERS'}`);
  } else {
    writeFileSync(out, content);
    console.log(`${rel}: written`);
  }
}

for (const manifest of manifests(join(root, 'data'))) {
  const base = dirname(manifest);
  const { artifacts, map } = JSON.parse(readFileSync(manifest, 'utf-8')) as {
    artifacts: Array<{ output: string; tool: string; meta?: { marks?: string }; chart?: ChartSpec }>;
    map?: { background: string };
  };
  let background: MapBackground | undefined;
  if (map) {
    const png = join(base, map.background);
    const sidecar = JSON.parse(readFileSync(png.replace(/\.png$/, '.json'), 'utf-8')) as Omit<MapBackground, 'png'>;
    background = { ...sidecar, png: readFileSync(png) };
  }
  for (const artifact of artifacts) {
    if (!artifact.tool.endsWith('_card')) continue;
    const marksName = artifact.meta?.marks;
    if (!marksName) throw new Error(`${artifact.output}: no marks file named in meta`);
    const card = parseCourseCardFile(JSON.parse(readFileSync(join(base, artifact.output), 'utf-8')));
    const marks = parseMarksFile(JSON.parse(readFileSync(join(base, marksName), 'utf-8')));
    emit(
      join(base, artifact.output.replace(/\.json$/, '.html')),
      renderCardHtml(card, marks, { background, area: chartArea(artifact.chart) }),
    );
  }
  if (map) {
    const marksArtifact = artifacts.find((a) => a.tool.endsWith('_marks'));
    if (!marksArtifact) throw new Error(`${manifest}: chart but no marks artifact`);
    const marks = parseMarksFile(JSON.parse(readFileSync(join(base, marksArtifact.output), 'utf-8')));
    emit(join(base, dirname(map.background), 'marks.svg'), renderMarksMapSvg(marks, background));
  }
}
process.exit(failures ? 1 : 0);
