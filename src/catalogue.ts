/**
 * The catalogue a release publishes as `index.json` — what the site at
 * courses.sailscoring.ie serves at its root and under each `/vX.Y.Z/`:
 * which data sets the release holds, and the URL of every artifact. A
 * consumer that offers a club's cards reads this, and fetches the card it
 * needs by its `url`.
 */

export interface CatalogueCard {
  /** The card's file name without `.json` — `offshore`, `cc1-saturday-cv`. */
  id: string;
  /** The card's own name. */
  name: string;
  /** How many courses it holds. */
  courses: number;
  /** Site-relative paths of the card as JSON and as a page. */
  json: string;
  html: string;
  /** The club's document the card was read from, when public. */
  source?: string;
  /** Absolute, versioned URLs of the same. */
  url: string;
  page: string;
}

export interface CatalogueSet {
  /** `hyc/al-2025` — the set's directory, and the prefix of its paths. */
  path: string;
  club: string;
  event: string;
  marks: {
    file: string;
    count: number;
    /** The marks file's `source`, where it is a published document: the
     *  authority for the marks' positions. */
    source?: string;
    url: string;
  };
  cards: CatalogueCard[];
  /** The set's routing overlay, where it has one: local knowledge of which
   *  legs are sailable and how the fleet goes round the rest, with its own
   *  provenance — `courseLegs`' optional last argument. Absent from releases
   *  before 0.12.0, and from every set nobody has written one for. */
  routing?: {
    file: string;
    /** Who made it, and where it comes from. */
    contributor?: string;
    source?: string;
    url: string;
  };
  /** The set's chart, where it has one: the marks drawn as SVG, the chart
   *  image under them, and the tile layers it was fetched from. */
  map?: {
    svg: string;
    background: string;
    layers: string[];
    /** Where the background image goes, as `map/background.json` records it:
     *  the ground it covers, its pixel size, the zoom it was fetched at, and
     *  the attribution its sources require. A consumer drawing on the chart
     *  needs the image and this, and nothing else. Absent from releases
     *  before 0.8.0, which published the paths alone — so a newer library
     *  still reads an older release's catalogue, and simply has no chart to
     *  draw on. */
    placement?: {
      bounds: { south: number; west: number; north: number; east: number };
      width: number;
      height: number;
      zoom: number;
      attribution: string;
    };
  };
}

export interface Catalogue {
  /** The release, as the package version: `0.3.0`. */
  version: string;
  /** ISO date the catalogue was built. */
  generated: string;
  /** The format version every file in the release is written in. */
  formatVersion: number;
  site: string;
  repository: string;
  /** Everything in the release as one zip. */
  zip: string;
  sets: CatalogueSet[];
}

export class CatalogueError extends Error {}

function fail(path: string, message: string): never {
  throw new CatalogueError(`${path}: ${message}`);
}

function str(obj: Record<string, unknown>, key: string, path: string): string {
  if (typeof obj[key] !== 'string') fail(`${path}.${key}`, 'expected a string');
  return obj[key];
}

function optStr(obj: Record<string, unknown>, key: string): Record<string, string> {
  return typeof obj[key] === 'string' ? { [key]: obj[key] } : {};
}

function num(obj: Record<string, unknown>, key: string, path: string): number {
  if (typeof obj[key] !== 'number') fail(`${path}.${key}`, 'expected a number');
  return obj[key];
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(path, 'expected an object');
  return value as Record<string, unknown>;
}

function list(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, 'expected an array');
  return value;
}

/** Read a release's `index.json`, refusing anything that is not one. */
export function parseCatalogue(data: unknown): Catalogue {
  const obj = record(data, 'catalogue');
  const sets = list(obj.sets, 'catalogue.sets').map((rawSet, i): CatalogueSet => {
    const path = `catalogue.sets[${i}]`;
    const s = record(rawSet, path);
    const marks = record(s.marks, `${path}.marks`);
    const cards = list(s.cards, `${path}.cards`).map((rawCard, j): CatalogueCard => {
      const cardPath = `${path}.cards[${j}]`;
      const c = record(rawCard, cardPath);
      return {
        id: str(c, 'id', cardPath),
        name: str(c, 'name', cardPath),
        courses: num(c, 'courses', cardPath),
        json: str(c, 'json', cardPath),
        html: str(c, 'html', cardPath),
        ...optStr(c, 'source'),
        url: str(c, 'url', cardPath),
        page: str(c, 'page', cardPath),
      };
    });
    let routing: { routing?: CatalogueSet['routing'] } = {};
    if (s.routing != null) {
      const r = record(s.routing, `${path}.routing`);
      routing = {
        routing: {
          file: str(r, 'file', `${path}.routing`),
          ...optStr(r, 'contributor'),
          ...optStr(r, 'source'),
          url: str(r, 'url', `${path}.routing`),
        },
      };
    }
    let map: { map?: CatalogueSet['map'] } = {};
    if (s.map != null) {
      const m = record(s.map, `${path}.map`);
      let placement: { placement?: NonNullable<CatalogueSet['map']>['placement'] } = {};
      if (m.placement != null) {
        const pl = record(m.placement, `${path}.map.placement`);
        const b = record(pl.bounds, `${path}.map.placement.bounds`);
        placement = {
          placement: {
            bounds: {
              south: num(b, 'south', `${path}.map.placement.bounds`),
              west: num(b, 'west', `${path}.map.placement.bounds`),
              north: num(b, 'north', `${path}.map.placement.bounds`),
              east: num(b, 'east', `${path}.map.placement.bounds`),
            },
            width: num(pl, 'width', `${path}.map.placement`),
            height: num(pl, 'height', `${path}.map.placement`),
            zoom: num(pl, 'zoom', `${path}.map.placement`),
            attribution: str(pl, 'attribution', `${path}.map.placement`),
          },
        };
      }
      map = {
        map: {
          svg: str(m, 'svg', `${path}.map`),
          background: str(m, 'background', `${path}.map`),
          layers: list(m.layers, `${path}.map.layers`).map((l, k) => {
            if (typeof l !== 'string') fail(`${path}.map.layers[${k}]`, 'expected a string');
            return l;
          }),
          ...placement,
        },
      };
    }
    return {
      path: str(s, 'path', path),
      club: str(s, 'club', path),
      event: str(s, 'event', path),
      marks: {
        file: str(marks, 'file', `${path}.marks`),
        count: num(marks, 'count', `${path}.marks`),
        ...optStr(marks, 'source'),
        url: str(marks, 'url', `${path}.marks`),
      },
      cards,
      ...routing,
      ...map,
    };
  });
  return {
    version: str(obj, 'version', 'catalogue'),
    generated: str(obj, 'generated', 'catalogue'),
    formatVersion: num(obj, 'formatVersion', 'catalogue'),
    site: str(obj, 'site', 'catalogue'),
    repository: str(obj, 'repository', 'catalogue'),
    zip: str(obj, 'zip', 'catalogue'),
    sets,
  };
}
