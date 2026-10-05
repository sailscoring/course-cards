/**
 * Magnetic declination from the World Magnetic Model, for the card pages to
 * offer bearings in magnetic as well as true. The coefficients are NOAA's
 * WMM2025 as published (tools/wmm/WMM2025.COF, public domain), valid from
 * 2025.0 to 2030.0; the method is the one the model's report gives —
 * geodetic to geocentric on WGS 84, a spherical harmonic sum to degree 12
 * in Schmidt semi-normalised Legendre functions, and the field rotated back
 * to geodetic.
 *
 * Part of the artifact pipeline, not of the published library: the data and
 * the library stay true, and a page works its variation out when it is
 * rendered, for the place and season of its card.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Position } from '../src/index';

interface Model {
  name: string;
  epoch: number;
  /** g, h and their secular variation per year, by [n][m], Schmidt
   *  semi-normalised, in nT. */
  g: number[][];
  h: number[][];
  gdot: number[][];
  hdot: number[][];
}

const N = 12;

function load(path: string): Model {
  const lines = readFileSync(path, 'utf-8').split('\n');
  const [epoch, name] = lines[0]!.trim().split(/\s+/);
  const grid = (): number[][] => Array.from({ length: N + 1 }, () => new Array<number>(N + 1).fill(0));
  const model: Model = { name: name!, epoch: Number(epoch), g: grid(), h: grid(), gdot: grid(), hdot: grid() };
  for (const line of lines.slice(1)) {
    const f = line.trim().split(/\s+/).map(Number);
    if (f.length !== 6) continue;
    const [n, m, g, h, gdot, hdot] = f as [number, number, number, number, number, number];
    model.g[n]![m] = g;
    model.h[n]![m] = h;
    model.gdot[n]![m] = gdot;
    model.hdot[n]![m] = hdot;
  }
  return model;
}

const model = load(join(import.meta.dirname, 'wmm', 'WMM2025.COF'));

/** The model the declination comes from, as a page names it. */
export const WMM_NAME = model.name;

/** A date as a decimal year, the model's time axis. */
export function decimalYear(date: string): number {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`not a date: ${date}`);
  const y = d.getUTCFullYear();
  const start = Date.UTC(y, 0, 1);
  return y + (d.getTime() - start) / (Date.UTC(y + 1, 0, 1) - start);
}

/** The magnetic declination — the variation, to a sailor — at a position at
 *  sea level on a date (`YYYY-MM-DD`), in degrees east, west negative. */
export function declinationDeg(position: Position, date: string): number {
  return declinationAtDeg(position, decimalYear(date));
}

/** The declination at a decimal year and a height above the ellipsoid, the
 *  form the model's own test values take. */
export function declinationAtDeg(position: Position, t: number, heightKm = 0): number {
  if (t < model.epoch || t >= model.epoch + 5) throw new Error(`${t} is outside ${model.name}`);
  const dt = t - model.epoch;

  // geodetic to geocentric spherical, WGS 84
  const A = 6378.137;
  const flat = 1 / 298.257223563;
  const e2 = flat * (2 - flat);
  const RE = 6371.2;
  const φ = (position.lat * Math.PI) / 180;
  const λ = (position.lng * Math.PI) / 180;
  const rc = A / Math.sqrt(1 - e2 * Math.sin(φ) ** 2);
  const p = (rc + heightKm) * Math.cos(φ);
  const z = (rc * (1 - e2) + heightKm) * Math.sin(φ);
  const r = Math.hypot(p, z);
  const φc = Math.asin(z / r);

  // Gauss-normalised Legendre functions of the colatitude and their
  // derivatives in it, scaled to Schmidt's as they are summed
  const ct = Math.sin(φc);
  const st = Math.cos(φc);
  const P: number[][] = Array.from({ length: N + 1 }, () => new Array<number>(N + 1).fill(0));
  const dP: number[][] = Array.from({ length: N + 1 }, () => new Array<number>(N + 1).fill(0));
  const S: number[][] = Array.from({ length: N + 1 }, () => new Array<number>(N + 1).fill(0));
  P[0]![0] = 1;
  S[0]![0] = 1;
  for (let n = 1; n <= N; n++) {
    S[n]![0] = (S[n - 1]![0]! * (2 * n - 1)) / n;
    for (let m = 1; m <= n; m++) {
      S[n]![m] = S[n]![m - 1]! * Math.sqrt(((n - m + 1) * (m === 1 ? 2 : 1)) / (n + m));
    }
    for (let m = 0; m <= n; m++) {
      if (m === n) {
        P[n]![m] = st * P[n - 1]![m - 1]!;
        dP[n]![m] = st * dP[n - 1]![m - 1]! + ct * P[n - 1]![m - 1]!;
      } else {
        const k = n === 1 ? 0 : ((n - 1) ** 2 - m * m) / ((2 * n - 1) * (2 * n - 3));
        const P2 = n >= 2 ? P[n - 2]![m]! : 0;
        const dP2 = n >= 2 ? dP[n - 2]![m]! : 0;
        P[n]![m] = ct * P[n - 1]![m]! - k * P2;
        dP[n]![m] = ct * dP[n - 1]![m]! - st * P[n - 1]![m]! - k * dP2;
      }
    }
  }

  let x = 0;
  let y = 0;
  let zc = 0;
  for (let n = 1; n <= N; n++) {
    const ar = (RE / r) ** (n + 2);
    for (let m = 0; m <= n; m++) {
      const g = (model.g[n]![m]! + dt * model.gdot[n]![m]!) * S[n]![m]!;
      const h = (model.h[n]![m]! + dt * model.hdot[n]![m]!) * S[n]![m]!;
      const cm = Math.cos(m * λ);
      const sm = Math.sin(m * λ);
      x += ar * (g * cm + h * sm) * dP[n]![m]!;
      y += ar * m * (g * sm - h * cm) * P[n]![m]!;
      zc -= ar * (n + 1) * (g * cm + h * sm) * P[n]![m]!;
    }
  }
  y /= st;
  // back from geocentric to geodetic: only the north component turns
  const ψ = φc - φ;
  const north = x * Math.cos(ψ) - zc * Math.sin(ψ);
  return (Math.atan2(y, north) * 180) / Math.PI;
}
