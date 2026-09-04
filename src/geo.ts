/**
 * Great-circle geometry on a sphere of the mean Earth radius (6371 km,
 * 3440.065 NM) — the usual choice for club-course distances, where the
 * difference from an ellipsoid is metres on legs of a mile or two.
 */

import type { Position } from './types.js';

const EARTH_RADIUS_NM = 3440.065;
const EARTH_RADIUS_M = 6371000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Haversine distance in nautical miles. */
export function distanceNm(a: Position, b: Position): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.sqrt(h));
}

/** Initial true bearing from a to b, degrees 0–360. */
export function bearingDeg(a: Position, b: Position): number {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** The point `distanceMeters` along `bearing` from `from` — how a laid
 *  windward mark's position is derived from the committee boat's log
 *  ("1,000 m upwind at 250°"). Standard great-circle direct solution. */
export function destination(from: Position, bearing: number, distanceMeters: number): Position {
  const δ = distanceMeters / EARTH_RADIUS_M;
  const θ = toRad(bearing);
  const φ1 = toRad(from.lat);
  const λ1 = toRad(from.lng);
  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ),
  );
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
    );
  return { lat: toDeg(φ2), lng: ((toDeg(λ2) + 540) % 360) - 180 };
}
