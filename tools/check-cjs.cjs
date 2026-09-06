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
  'CourseError',
  'FORMAT_VERSION',
  'FormatError',
  'bearingDeg',
  'courseLegs',
  'destination',
  'distanceNm',
  'parseCourseCardFile',
  'parseMarksFile',
  'totalDistanceNm',
];
assert.deepStrictEqual(Object.keys(lib).sort(), expected.sort());

// Not just names: the geometry has to survive the round trip.
const start = { lat: 53.3925, lng: -6.0672 };
const mark = lib.destination(start, 190, 1000);
assert.ok(Math.abs(lib.distanceNm(start, mark) * 1852 - 1000) < 0.01);
assert.ok(Math.abs(lib.bearingDeg(start, mark) - 190) < 0.01);

console.log('require() from CommonJS: ok');
