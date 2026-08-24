/**
 * Loading and validating format files. Deliberately dependency-free: the
 * format is small enough that hand checks read better than a schema library,
 * and consumers get plain typed objects.
 */

import { FORMAT_VERSION, type CourseCardFile, type MarksFile, type Position } from './types';

export class FormatError extends Error {}

function fail(path: string, message: string): never {
  throw new FormatError(`${path}: ${message}`);
}

function checkVersion(value: unknown, path: string): void {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    fail(path, 'formatVersion must be an integer');
  }
  if (value > FORMAT_VERSION) {
    fail(path, `formatVersion ${value} is newer than this library understands (${FORMAT_VERSION})`);
  }
}

function checkPosition(value: unknown, path: string): Position {
  if (typeof value !== 'object' || value === null) fail(path, 'expected a position object');
  const p = value as { lat?: unknown; lng?: unknown };
  if (typeof p.lat !== 'number' || p.lat < -90 || p.lat > 90) fail(path, 'lat must be -90…90');
  if (typeof p.lng !== 'number' || p.lng < -180 || p.lng > 180) fail(path, 'lng must be -180…180');
  return { lat: p.lat, lng: p.lng };
}

export function parseMarksFile(data: unknown): MarksFile {
  if (typeof data !== 'object' || data === null) fail('marks', 'expected an object');
  const obj = data as Record<string, unknown>;
  checkVersion(obj.formatVersion, 'marks.formatVersion');
  if (!Array.isArray(obj.marks) || obj.marks.length === 0) fail('marks.marks', 'expected marks');
  const ids = new Set<string>();
  const marks = obj.marks.map((raw, i) => {
    if (typeof raw !== 'object' || raw === null) fail(`marks.marks[${i}]`, 'expected an object');
    const m = raw as Record<string, unknown>;
    if (typeof m.id !== 'string' || !m.id) fail(`marks.marks[${i}].id`, 'expected an id');
    if (ids.has(m.id)) fail(`marks.marks[${i}].id`, `duplicate mark id "${m.id}"`);
    ids.add(m.id);
    return {
      id: m.id,
      ...(typeof m.name === 'string' ? { name: m.name } : {}),
      ...(typeof m.shape === 'string' ? { shape: m.shape } : {}),
      ...(typeof m.color === 'string' ? { color: m.color } : {}),
      position: checkPosition(m.position, `marks.marks[${i}].position`),
    };
  });
  return {
    formatVersion: obj.formatVersion as number,
    ...(typeof obj.club === 'string' ? { club: obj.club } : {}),
    marks,
  };
}

export function parseCourseCardFile(data: unknown): CourseCardFile {
  if (typeof data !== 'object' || data === null) fail('card', 'expected an object');
  const obj = data as Record<string, unknown>;
  checkVersion(obj.formatVersion, 'card.formatVersion');
  if (!Array.isArray(obj.courses) || obj.courses.length === 0) fail('card.courses', 'expected courses');

  let infrastructure: CourseCardFile['infrastructure'];
  if (obj.infrastructure != null) {
    if (typeof obj.infrastructure !== 'object') fail('card.infrastructure', 'expected an object');
    const inf = obj.infrastructure as Record<string, unknown>;
    infrastructure = {
      ...(inf.start != null ? { start: checkPosition(inf.start, 'card.infrastructure.start') } : {}),
      ...(inf.finish != null ? { finish: checkPosition(inf.finish, 'card.infrastructure.finish') } : {}),
      ...(typeof inf.firstUpwindDistanceNm === 'number' && inf.firstUpwindDistanceNm > 0
        ? { firstUpwindDistanceNm: inf.firstUpwindDistanceNm }
        : {}),
    };
  }

  const ids = new Set<string>();
  const courses = obj.courses.map((raw, i) => {
    if (typeof raw !== 'object' || raw === null) fail(`card.courses[${i}]`, 'expected an object');
    const c = raw as Record<string, unknown>;
    if (typeof c.id !== 'string' || !c.id) fail(`card.courses[${i}].id`, 'expected an id');
    if (ids.has(c.id)) fail(`card.courses[${i}].id`, `duplicate course id "${c.id}"`);
    ids.add(c.id);
    if (!Array.isArray(c.marks) || c.marks.length === 0) fail(`card.courses[${i}].marks`, 'expected marks');
    const marks = c.marks.map((rawMark, j) => {
      if (typeof rawMark !== 'object' || rawMark === null) fail(`card.courses[${i}].marks[${j}]`, 'expected an object');
      const cm = rawMark as Record<string, unknown>;
      if (typeof cm.mark !== 'string' || !cm.mark) fail(`card.courses[${i}].marks[${j}].mark`, 'expected a mark id');
      if (cm.rounding != null && cm.rounding !== 'port' && cm.rounding !== 'starboard') {
        fail(`card.courses[${i}].marks[${j}].rounding`, 'expected "port" or "starboard"');
      }
      return {
        mark: cm.mark,
        ...(cm.rounding != null ? { rounding: cm.rounding as 'port' | 'starboard' } : {}),
        ...(cm.passing === true ? { passing: true } : {}),
      };
    });
    const wind = c.windDirectionDeg;
    if (wind != null && (typeof wind !== 'number' || wind < 0 || wind > 360)) {
      fail(`card.courses[${i}].windDirectionDeg`, 'expected degrees 0–360');
    }
    return { id: c.id, ...(wind != null ? { windDirectionDeg: wind as number } : {}), marks };
  });

  return {
    formatVersion: obj.formatVersion as number,
    ...(typeof obj.club === 'string' ? { club: obj.club } : {}),
    ...(typeof obj.name === 'string' ? { name: obj.name } : {}),
    ...(infrastructure ? { infrastructure } : {}),
    courses,
  };
}
