/**
 * Loading and validating format files. Deliberately dependency-free: the
 * format is small enough that hand checks read better than a schema library,
 * and consumers get plain typed objects.
 */

import { FORMAT_VERSION, type CourseCardFile, type MarksFile, type Position, type Side } from './types';

export class FormatError extends Error {}

function fail(path: string, message: string): never {
  throw new FormatError(`${path}: ${message}`);
}

function checkVersion(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    fail(path, 'formatVersion must be an integer');
  }
  if (value > FORMAT_VERSION) {
    fail(path, `formatVersion ${value} is newer than this library understands (${FORMAT_VERSION})`);
  }
  return value;
}

function checkPosition(value: unknown, path: string): Position {
  if (typeof value !== 'object' || value === null) fail(path, 'expected a position object');
  const p = value as { lat?: unknown; lng?: unknown };
  if (typeof p.lat !== 'number' || p.lat < -90 || p.lat > 90) fail(path, 'lat must be -90…90');
  if (typeof p.lng !== 'number' || p.lng < -180 || p.lng > 180) fail(path, 'lng must be -180…180');
  return { lat: p.lat, lng: p.lng };
}

function optionalString(obj: Record<string, unknown>, key: string): Record<string, string> {
  return typeof obj[key] === 'string' ? { [key]: obj[key] } : {};
}

export function parseMarksFile(data: unknown): MarksFile {
  if (typeof data !== 'object' || data === null) fail('marks', 'expected an object');
  const obj = data as Record<string, unknown>;
  const formatVersion = checkVersion(obj.formatVersion, 'marks.formatVersion');
  if (!Array.isArray(obj.marks) || obj.marks.length === 0) fail('marks.marks', 'expected marks');
  const ids = new Set<string>();
  const marks = obj.marks.map((raw, i) => {
    const path = `marks.marks[${i}]`;
    if (typeof raw !== 'object' || raw === null) fail(path, 'expected an object');
    const m = raw as Record<string, unknown>;
    if (typeof m.id !== 'string' || !m.id) fail(`${path}.id`, 'expected an id');
    if (ids.has(m.id)) fail(`${path}.id`, `duplicate mark id "${m.id}"`);
    ids.add(m.id);
    return {
      id: m.id,
      ...optionalString(m, 'name'),
      ...optionalString(m, 'shape'),
      ...optionalString(m, 'color'),
      ...(m.position != null ? { position: checkPosition(m.position, `${path}.position`) } : {}),
      ...optionalString(m, 'placement'),
    };
  });
  return {
    formatVersion,
    ...optionalString(obj, 'club'),
    ...optionalString(obj, 'name'),
    ...optionalString(obj, 'source'),
    marks,
  };
}

export function parseCourseCardFile(data: unknown): CourseCardFile {
  if (typeof data !== 'object' || data === null) fail('card', 'expected an object');
  const obj = data as Record<string, unknown>;
  const formatVersion = checkVersion(obj.formatVersion, 'card.formatVersion');
  if (!Array.isArray(obj.courses) || obj.courses.length === 0) fail('card.courses', 'expected courses');

  const ids = new Set<string>();
  const courses = obj.courses.map((raw, i) => {
    const path = `card.courses[${i}]`;
    if (typeof raw !== 'object' || raw === null) fail(path, 'expected an object');
    const c = raw as Record<string, unknown>;
    if (typeof c.id !== 'string' || !c.id) fail(`${path}.id`, 'expected an id');
    if (ids.has(c.id)) fail(`${path}.id`, `duplicate course id "${c.id}"`);
    ids.add(c.id);
    if (!Array.isArray(c.marks) || c.marks.length === 0) fail(`${path}.marks`, 'expected marks');
    const marks = c.marks.map((rawMark, j) => {
      const markPath = `${path}.marks[${j}]`;
      if (typeof rawMark !== 'object' || rawMark === null) fail(markPath, 'expected an object');
      const cm = rawMark as Record<string, unknown>;
      if (typeof cm.mark !== 'string' || !cm.mark) fail(`${markPath}.mark`, 'expected a mark id');
      if (cm.side != null && cm.side !== 'port' && cm.side !== 'starboard') {
        fail(`${markPath}.side`, 'expected "port" or "starboard"');
      }
      return {
        mark: cm.mark,
        ...(cm.side != null ? { side: cm.side as Side } : {}),
        ...(cm.passing === true ? { passing: true } : {}),
      };
    });
    return { id: c.id, marks };
  });

  return {
    formatVersion,
    ...optionalString(obj, 'club'),
    ...optionalString(obj, 'name'),
    ...optionalString(obj, 'source'),
    ...optionalString(obj, 'marks'),
    courses,
  };
}
