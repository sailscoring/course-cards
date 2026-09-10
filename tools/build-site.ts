/**
 * Build the static site for courses.sailscoring.ie into site/:
 *
 *   /                                  landing page listing the course cards
 *   /index.json                        the same as a machine-readable catalogue
 *   /<club>/<event>/…                  the current artifacts (JSON, HTML, chart, sources)
 *   /course-cards.zip                  all of them, zipped
 *   /v<version>/<club>/<event>/…       the same again under the release version
 *   /v<version>/course-cards-v<version>.zip
 *   /v<earlier>/…                     the same, for the releases before it
 *
 * The version is package.json's, and a deploy also carries the versioned
 * trees of the RETAINED_RELEASES - 1 releases before it, rebuilt from the
 * assets those releases attached. That is what makes a /v<version>/ URL
 * usable: a consumer pinned to one keeps working while it upgrades, rather
 * than losing it the moment the next release deploys. Anything older stays
 * downloadable from its GitHub Release.
 *
 *     pnpm site
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { unzipSync, zipSync } from 'fflate';

import { FORMAT_VERSION, parseCatalogue, parseCourseCardFile, parseMarksFile, type Catalogue } from '../src/index';

const root = join(import.meta.dirname, '..');
const site = join(root, 'site');
const { version, repository } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as {
  version: string;
  repository: string;
};
const repoUrl = `https://github.com/${repository.replace(/^github:/, '')}`;
const siteUrl = 'https://courses.sailscoring.ie';

interface Manifest {
  club: string;
  event: string;
  artifacts: Array<{ output: string; tool: string; url?: string; source?: string; meta?: { name?: string; marks?: string } }>;
  map?: { background: string; layers: string[] };
}

function* manifests(dir: string): Generator<string> {
  for (const entry of readdirSync(dir).sort()) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* manifests(path);
    else if (entry === 'manifest.json') yield path;
  }
}

function* files(dir: string): Generator<string> {
  for (const entry of readdirSync(dir).sort()) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// --- collect -----------------------------------------------------------------

interface CardEntry {
  id: string;
  name: string;
  courses: number;
  json: string;
  html: string;
  source?: string;
}
interface SetEntry {
  path: string; // hyc/al-2025
  club: string;
  event: string;
  marks: { file: string; count: number; source?: string };
  cards: CardEntry[];
  map?: { svg: string; background: string; layers: string[] };
}

const sets: SetEntry[] = [];
for (const manifest of manifests(join(root, 'data'))) {
  const base = dirname(manifest);
  const rel = relative(join(root, 'data'), base);
  const m = JSON.parse(readFileSync(manifest, 'utf-8')) as Manifest;
  const marksArtifact = m.artifacts.find((a) => a.tool.endsWith('_marks'));
  if (!marksArtifact) throw new Error(`${rel}: no marks artifact`);
  const marks = parseMarksFile(JSON.parse(readFileSync(join(base, marksArtifact.output), 'utf-8')));
  const cards: CardEntry[] = [];
  for (const a of m.artifacts) {
    if (!a.tool.endsWith('_card')) continue;
    const card = parseCourseCardFile(JSON.parse(readFileSync(join(base, a.output), 'utf-8')));
    cards.push({
      id: a.output.replace(/\.json$/, ''),
      name: card.name ?? a.output,
      courses: card.courses.length,
      json: `${rel}/${a.output}`,
      html: `${rel}/${a.output.replace(/\.json$/, '.html')}`,
      ...(a.url ? { source: a.url } : {}),
    });
  }
  sets.push({
    path: rel,
    club: m.club,
    event: m.event,
    marks: {
      file: `${rel}/${marksArtifact.output}`,
      count: marks.marks.length,
      ...(marksArtifact.url ? { source: marksArtifact.url } : {}),
    },
    cards,
    ...(m.map
      ? { map: { svg: `${rel}/${dirname(m.map.background)}/marks.svg`, background: `${rel}/${m.map.background}`, layers: m.map.layers } }
      : {}),
  });
}

// --- write -------------------------------------------------------------------

rmSync(site, { recursive: true, force: true });
mkdirSync(site, { recursive: true });

const versionDir = `v${version}`;
const zipName = `course-cards-v${version}.zip`;

// Artifacts: once at the top level (current), once under the version.
for (const target of ['', versionDir]) {
  cpSync(join(root, 'data'), join(site, target), { recursive: true });
}

// The zip: data/ plus the format spec, README and licence.
const zipEntries: Record<string, Uint8Array> = {};
const prefix = `course-cards-v${version}/`;
for (const file of files(join(root, 'data'))) {
  zipEntries[prefix + relative(join(root, 'data'), file)] = readFileSync(file);
}
for (const extra of ['README.md', 'LICENSE', 'docs/format.md']) {
  zipEntries[prefix + extra] = readFileSync(join(root, extra));
}
const zip = zipSync(zipEntries, { level: 6 });
writeFileSync(join(site, 'course-cards.zip'), zip);
writeFileSync(join(site, versionDir, zipName), zip);

// Catalogue: typed as the library reads it, so a consumer's parseCatalogue
// and this writer cannot drift apart.
const catalogue: Catalogue = {
  version,
  generated: new Date().toISOString().slice(0, 10),
  formatVersion: FORMAT_VERSION,
  site: siteUrl,
  repository: repoUrl,
  zip: `${siteUrl}/${versionDir}/${zipName}`,
  sets: sets.map((s) => ({
    ...s,
    marks: { ...s.marks, url: `${siteUrl}/${versionDir}/${s.marks.file}` },
    cards: s.cards.map((c) => ({ ...c, url: `${siteUrl}/${versionDir}/${c.json}`, page: `${siteUrl}/${versionDir}/${c.html}` })),
  })),
};
parseCatalogue(JSON.parse(JSON.stringify(catalogue)));
writeFileSync(join(site, 'index.json'), JSON.stringify(catalogue, null, 2) + '\n');
writeFileSync(join(site, versionDir, 'index.json'), JSON.stringify(catalogue, null, 2) + '\n');

// --- the releases before this one --------------------------------------------

/**
 * How many releases a deploy carries under /v<version>/, this one included —
 * the window a consumer pinned to a versioned URL has to upgrade in. Raising
 * it costs about the size of the zip per release.
 */
const RETAINED_RELEASES = 3;

// Downloads live outside site/, which is wiped on every build, and under the
// directory build caches keep, so a deploy re-fetches only what is new.
const cacheDir = join(root, 'node_modules', '.cache', 'course-cards-releases');

// The zip carries these beside the artifacts; the site tree is the artifacts.
const zipExtras = new Set(['README.md', 'LICENSE', 'docs/format.md']);

const rank = (v: string): number => v.split('.').reduce((n, part) => n * 100_000 + Number(part), 0);

// fetch's own message for a network failure is just "fetch failed"; the cause
// is where the reason is.
const why = (error: unknown): string => {
  const e = error as Error & { cause?: Error };
  return e.cause?.message ? `${e.message}: ${e.cause.message}` : e.message;
};

async function releaseAsset(tag: string, name: string): Promise<Uint8Array> {
  const cached = join(cacheDir, tag, name);
  if (existsSync(cached)) return readFileSync(cached);
  const response = await fetch(`${repoUrl}/releases/download/${tag}/${name}`);
  if (!response.ok) throw new Error(`${name}: ${response.status} ${response.statusText}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  mkdirSync(dirname(cached), { recursive: true });
  writeFileSync(cached, bytes);
  return bytes;
}

/** The versions of every published release, newest first. */
async function published(): Promise<string[]> {
  const headers: Record<string, string> = { accept: 'application/vnd.github+json' };
  // Not required — the repository is public — but it lifts the rate limit
  // where there is a token to hand, which on a busy build host matters.
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(`https://api.github.com/repos/${repository.replace(/^github:/, '')}/releases?per_page=100`, { headers });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const releases = (await response.json()) as Array<{ tag_name: string; draft: boolean; prerelease: boolean }>;
  return releases
    .filter((r) => !r.draft && !r.prerelease && /^v\d+\.\d+\.\d+$/.test(r.tag_name))
    .map((r) => r.tag_name.slice(1))
    .sort((a, b) => rank(b) - rank(a));
}

/**
 * A release's tree under /v<version>/, unpacked from the zip and the
 * catalogue it attached — the files that release published, verbatim, not a
 * rebuild of them from today's data or today's tools.
 */
async function retain(release: string): Promise<number> {
  const tag = `v${release}`;
  const [archive, index] = await Promise.all([releaseAsset(tag, `course-cards-${tag}.zip`), releaseAsset(tag, 'catalogue.json')]);
  const dir = join(site, tag);
  const zipPrefix = `course-cards-${tag}/`;
  let written = 0;
  for (const [entry, bytes] of Object.entries(unzipSync(archive))) {
    if (!entry.startsWith(zipPrefix) || entry.endsWith('/')) continue;
    const path = entry.slice(zipPrefix.length);
    if (zipExtras.has(path)) continue;
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), bytes);
    written++;
  }
  writeFileSync(join(dir, `course-cards-${tag}.zip`), archive);
  writeFileSync(join(dir, 'index.json'), index);
  return written;
}

// A release that cannot be fetched is a warning, not a failed deploy: the
// current site is still correct without it, and its paths 404 as they would
// have anyway. Watch for this in the build log — it is the one way the
// upgrade window silently narrows.
let retained: string[] = [];
try {
  retained = (await published()).filter((v) => rank(v) < rank(version)).slice(0, RETAINED_RELEASES - 1);
} catch (error) {
  console.warn(`site/: could not list earlier releases (${why(error)}); no /v<earlier>/ paths in this deploy`);
}
for (const release of retained) {
  try {
    console.log(`site/v${release}/: ${await retain(release)} files, from the assets of its release`);
  } catch (error) {
    console.warn(`site/v${release}/: not retained (${why(error)}); its paths will 404`);
  }
}

// --- landing page ------------------------------------------------------------
const setHtml = sets
  .map((s) => {
    const cards = s.cards
      .map(
        (c) => `
        <li class="card">
          <div class="name"><a href="${esc(c.html)}">${esc(c.name)}</a></div>
          <div class="sub">${c.courses} courses ·
            <a href="${esc(c.json)}">JSON</a> ·
            <a href="${esc(versionDir + '/' + c.json)}">JSON v${esc(version)}</a>${
              c.source ? ` · <a href="${esc(c.source)}">club's PDF</a>` : ''
            }</div>
        </li>`,
      )
      .join('');
    return `
    <section>
      <h2>${esc(s.club)} <span class="n">${esc(s.event)}</span></h2>
      <ul class="cards">${cards}
        <li class="card">
          <div class="name">Marks</div>
          <div class="sub">${s.marks.count} marks ·
            <a href="${esc(s.marks.file)}">JSON</a> ·
            <a href="${esc(versionDir + '/' + s.marks.file)}">JSON v${esc(version)}</a>${
              s.marks.source ? ` · <a href="${esc(s.marks.source)}">club's PDF</a>` : ''
            }${s.map ? ` · <a href="${esc(s.map.svg)}">map</a> · <a href="${esc(s.map.background)}">chart background</a>` : ''}</div>
        </li>
      </ul>
      <p class="sub">Provenance and checks: <a href="${esc(s.path)}/README.md">${esc(s.path)}/README.md</a> · <a href="${esc(s.path)}/manifest.json">manifest</a></p>
    </section>`;
  })
  .join('');

const index = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sail Scoring · Course Cards</title>
<meta name="description" content="Sailing clubs' racing marks and course cards as versioned, machine-readable data, with each card rendered as a web page.">
<style>
  :root { color-scheme: light; }
  body { margin: 0; font: 16px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #0f172a; background: #f8fafc; }
  main { max-width: 52rem; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }
  h1 { margin: 0 0 .25rem; font-size: 1.7rem; letter-spacing: -.01em; }
  .lede { color: #475569; margin: 0 0 2rem; max-width: 42rem; }
  h2 { font-size: 1.05rem; margin: 2rem 0 .75rem; }
  h2 .n { color: #64748b; font-weight: 400; margin-left: .4rem; }
  ul.cards { list-style: none; padding: 0; margin: 0; display: grid; gap: .75rem; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: .5rem; padding: .85rem 1rem; }
  .name { font-weight: 600; }
  .sub { color: #64748b; font-size: .9rem; }
  a { color: #0f5cad; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .release { background: #fff; border: 1px solid #e2e8f0; border-radius: .5rem; padding: .85rem 1rem; margin: 0 0 1rem; }
  code { font-size: .85em; background: #eef2f7; padding: .1em .3em; border-radius: .25rem; }
  footer { margin-top: 3rem; color: #94a3b8; font-size: .85rem; }
</style>
</head>
<body>
<main>
  <h1>Course Cards</h1>
  <p class="lede">Sailing clubs' racing marks and course cards as versioned, machine-readable data — generated from the clubs' own published documents — with each card rendered as a web page. Part of <a href="https://sailscoring.ie">Sail Scoring</a>.</p>

  <div class="release">
    <div class="name">Release v${esc(version)}</div>
    <div class="sub">
      <a href="${esc(versionDir)}/${esc(zipName)}">Download everything (zip)</a> ·
      <a href="index.json">catalogue (JSON)</a> ·
      <a href="${esc(repoUrl)}">source &amp; format spec on GitHub</a> ·
      <a href="${esc(repoUrl)}/releases">all releases</a>
    </div>
    <p class="sub" style="margin:.5rem 0 0">Every file is available at its unversioned path (current release) and under <code>/${esc(versionDir)}/</code>${
      retained.length
        ? `, and the ${retained.length === 1 ? 'release before it is' : `${retained.length} releases before it are`} still served under ${retained
            .map((v) => `<code>/v${esc(v)}/</code>`)
            .join(' and ')}`
        : ''
    }. Every release, however old, is attached to its GitHub Release.</p>
  </div>
  ${setHtml}
  <footer>Marks and courses are the clubs' publications, reproduced for racing use; the format, tools and library are MIT-licensed. Charts © OpenStreetMap contributors, © OpenSeaMap contributors.</footer>
</main>
</body>
</html>
`;
writeFileSync(join(site, 'index.html'), index);

const count = [...files(site)].length;
console.log(`site/: ${count} files, ${sets.reduce((n, s) => n + s.cards.length, 0)} cards, v${version}, zip ${(zip.length / 1024).toFixed(0)} KB`);
