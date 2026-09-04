/**
 * Write an HTML page for every course card in data/: for each manifest, each
 * card artifact gets `<output>.html` next to it, rendered with the marks file
 * it names. `--check` verifies the committed pages instead.
 *
 *     pnpm render            # write
 *     pnpm render -- --check # verify
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { parseCourseCardFile, parseMarksFile, renderCardHtml } from '../src/index';

const root = join(import.meta.dirname, '..');
const check = process.argv.includes('--check');

function* manifests(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* manifests(path);
    else if (entry === 'manifest.json') yield path;
  }
}

let failures = 0;
for (const manifest of manifests(join(root, 'data'))) {
  const base = dirname(manifest);
  const { artifacts } = JSON.parse(readFileSync(manifest, 'utf-8')) as {
    artifacts: Array<{ output: string; tool: string; meta?: { marks?: string } }>;
  };
  for (const artifact of artifacts) {
    if (artifact.tool !== 'extract_card') continue;
    const marksName = artifact.meta?.marks;
    if (!marksName) throw new Error(`${artifact.output}: no marks file named in meta`);
    const card = parseCourseCardFile(JSON.parse(readFileSync(join(base, artifact.output), 'utf-8')));
    const marks = parseMarksFile(JSON.parse(readFileSync(join(base, marksName), 'utf-8')));
    const html = renderCardHtml(card, marks);
    const out = join(base, artifact.output.replace(/\.json$/, '.html'));
    const rel = relative(root, out);
    if (check) {
      const current = existsSync(out) ? readFileSync(out, 'utf-8') : null;
      const ok = current === html;
      failures += ok ? 0 : 1;
      console.log(`${rel}: ${ok ? 'ok' : 'DIFFERS'}`);
    } else {
      writeFileSync(out, html);
      console.log(`${rel}: written`);
    }
  }
}
process.exit(failures ? 1 : 0);
