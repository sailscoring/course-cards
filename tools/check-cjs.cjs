/*
 * Can a CommonJS consumer actually load the built library?
 *
 * This file is deliberately .cjs, and deliberately resolves the bare
 * specifier rather than dist/index.js: the failure it guards against is a
 * resolution failure, not a loading one. An exports map without a `require`
 * condition errors with ERR_PACKAGE_PATH_NOT_EXPORTED before Node reaches
 * the file, so requiring the path directly would pass while every real
 * consumer broke.
 *
 * Runs after `pnpm build`, against the package's own node_modules self-link.
 */
const assert = require('node:assert');

const lib = require('@sailscoring/course-cards');

const expected = [
  'CatalogueError',
  'CourseError',
  'FORMAT_VERSION',
  'FormatError',
  'METRES_PER_CABLE',
  'METRES_PER_NM',
  'bearingDeg',
  'courseLegs',
  'courseMarks',
  'destination',
  'distanceNm',
  'formatPosition',
  'legsFromWaypoints',
  'parseCatalogue',
  'parseCourseCardFile',
  'parseMarksFile',
  'parsePosition',
  'printedMarks',
  'renderCourseSvg',
  'totalDistanceNm',
];
assert.deepStrictEqual(Object.keys(lib).sort(), expected.sort());

// Not just names: the geometry has to survive the round trip.
const start = { lat: 53.3925, lng: -6.0672 };
const mark = lib.destination(start, 190, lib.METRES_PER_NM * 0.54);
assert.ok(Math.abs(lib.distanceNm(start, mark) - 0.54) < 0.00001);
assert.ok(Math.abs(lib.bearingDeg(start, mark) - 190) < 0.01);
assert.ok(Math.abs(lib.parsePosition(lib.formatPosition(mark, { minuteDecimals: 4 })).lat - mark.lat) < 0.00001);
const legs = lib.legsFromWaypoints([
  { mark: 'line', label: 'Start', position: start },
  { mark: 'Z', label: 'Z', position: mark },
]);
assert.strictEqual(legs.length, 1);
const svg = lib.renderCourseSvg(
  [{ id: 'line', label: 'Start', position: start }, { id: 'Z', label: 'Z', position: mark }],
  [{ mark: 'line' }, { mark: 'Z', side: 'port' }],
);
assert.ok(svg.startsWith('<svg ') && svg.includes('190° 0.54 NM'));

console.log('require() from CommonJS: ok');
