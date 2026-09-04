import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseCourseCardFile, parseMarksFile } from '../src/index';

function load(rel: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, '..', 'data', 'dbsc', 'summer-2026', rel), 'utf-8'));
}

const marks = parseMarksFile(load('marks.json'));
const cards = {
  'cc1-saturday-cv': parseCourseCardFile(load('cc1-saturday-cv.json')),
  'cc2-saturday-hut': parseCourseCardFile(load('cc2-saturday-hut.json')),
  'cc3-thursday-blue': parseCourseCardFile(load('cc3-thursday-blue.json')),
  'cc4-thursday-red': parseCourseCardFile(load('cc4-thursday-red.json')),
  'cc5-tuesday-hut': parseCourseCardFile(load('cc5-tuesday-hut.json')),
};

// The card's course letters, one per compass point.
const LETTERS = 'ABCDEFGHJKLMNPQR';

describe('the DBSC 2026 marks file', () => {
  it('lists the 23 marks of the sheet plus the two hut start marks and Zebra, all with positions', () => {
    expect(marks.marks.map((m) => m.id).join('')).toBe('ABCDEFGHJKLMNOPQRSTVWXY23Z');
    for (const m of marks.marks) {
      expect(m.position, m.id).toBeDefined();
      expect(m.name, m.id).toBeTruthy();
    }
    expect(marks.marks.find((m) => m.id === 'X')).toMatchObject({ name: 'Turning', color: 'yellow nav mk' });
    expect(marks.marks.find((m) => m.id === '3')).toMatchObject({ name: 'Green Start' });
  });

  it('positions are in Dublin Bay, from the sheet’s minutes', () => {
    for (const m of marks.marks) {
      expect(m.position!.lat, m.id).toBeGreaterThan(53.28);
      expect(m.position!.lat, m.id).toBeLessThan(53.34);
      expect(m.position!.lng, m.id).toBeGreaterThan(-6.16);
      expect(m.position!.lng, m.id).toBeLessThan(-6.08);
    }
    // A Salthill: 53° 18.36′ N, 6° 9′ W; T Battery: 53° 17.52′ N, 6° 6.638′ W
    expect(marks.marks.find((m) => m.id === 'A')!.position).toEqual({ lat: 53.306, lng: -6.15 });
    expect(marks.marks.find((m) => m.id === 'T')!.position).toEqual({ lat: 53.292, lng: -6.110633 });
  });
});

describe.each(Object.entries(cards))('the DBSC 2026 %s card', (name, card) => {
  const rows = name === 'cc5-tuesday-hut' ? 5 : 8;

  it(`has ${LETTERS.length} × ${rows} courses in the card's order`, () => {
    expect(card.marks).toBe('marks.json');
    const expected: string[] = [];
    for (const letter of LETTERS) for (let n = 1; n <= rows; n++) expected.push(`${letter}${n}`);
    expect(card.courses.map((c) => c.id)).toEqual(expected);
  });

  it('every mark of every course is on the marks file, with a side', () => {
    const known = new Set(marks.marks.map((m) => m.id));
    for (const course of card.courses) {
      for (const cm of course.marks) {
        expect(known.has(cm.mark), `${course.id}: mark ${cm.mark}`).toBe(true);
        expect(cm.side, `${course.id}: mark ${cm.mark}`).toBeDefined();
      }
    }
  });

  it('carries the section headings, the card’s own notes and the marks sheet’s caveat', () => {
    expect(card.notes?.map((n) => n.title)).toEqual(['Course sections', 'Card notes', 'Marks, bearings and distances']);
    // the 16 compass points, as the card heads its sections
    expect(card.notes![0]!.text).toBe(
      [...LETTERS].map((l, i) => `${l} ${String(Math.floor(i * 22.5)).padStart(3, '0')}°`).join(', '),
    );
    expect(card.notes![2]!.text).toBe(
      'Mark positions may vary slightly. All figures are approximate. Warning: Some direct paths are obstructed.',
    );
  });

  it('spot checks against the printed card', () => {
    const text = (id: string) =>
      card.courses
        .find((c) => c.id === id)!
        .marks.map((m) => `${m.mark}${m.side === 'port' ? 'p' : 's'}${m.passing ? '*' : ''}`)
        .join(' ');
    const expected: Record<string, Record<string, string>> = {
      'cc1-saturday-cv': { A1: 'Ep Cp Np Fp Ws Mp As', H8: 'Yp Sp Bp', L1: 'Wp Ss Tp Qp Gp Ks Gp Ks Fp', R8: 'Cs Js Hs' },
      'cc2-saturday-hut': { A1: 'Ep Cp Np Fp Cp Vp Mp Xp*', K1: 'Fs Gs Vs Cs Es Bp Gs Vs Hp', L1: 'Gp Hp Ss Tp Qp Gp Ks Fp Ap Xp*', R8: 'Ls Vs Xp*' },
      'cc3-thursday-blue': { A1: 'Ds Jp Fp Bp Kp Ep 3s', A4: 'Ds Kp Ep Op', C1: 'Fp Cs Es Kp Gp Bp 3p', R8: 'Cs Xs' },
      'cc4-thursday-red': { A1: 'Np Vp Tp Vp Tp Rp Np Rp', E5: 'Pp Wp Yp Wp', R8: 'Np Wp Qp' },
      'cc5-tuesday-hut': { A1: 'Cs Kp Ep Lp Xp*', L5: 'Gp Xp*', Q1: 'Ls Np Ds Js Cp Xp*', R5: 'Ls Vs Xp*' },
    };
    for (const [id, want] of Object.entries(expected[name]!)) expect(text(id), id).toBe(want);
  });
});

describe('the DBSC cards’ conventions', () => {
  it('the Red Fleet card rounds everything to port, as its note says', () => {
    const card = cards['cc4-thursday-red'];
    expect(card.notes![1]!.text).toContain('All marks to be rounded to Port');
    for (const c of card.courses) for (const m of c.marks) expect(m.side, c.id).toBe('port');
  });

  it('the hut cards pass the Turning mark X rather than rounding it, and it ends every course', () => {
    for (const name of ['cc2-saturday-hut', 'cc5-tuesday-hut'] as const) {
      const card = cards[name];
      const exceptions = name === 'cc2-saturday-hut' ? ['K1'] : []; // printed without X on the PDF
      for (const c of card.courses) {
        for (const m of c.marks) expect(!!m.passing, `${name} ${c.id} ${m.mark}`).toBe(m.mark === 'X');
        if (!exceptions.includes(c.id)) expect(c.marks[c.marks.length - 1]!.mark, `${name} ${c.id}`).toBe('X');
      }
    }
  });

  it('the other cards round X', () => {
    for (const name of ['cc1-saturday-cv', 'cc3-thursday-blue', 'cc4-thursday-red'] as const) {
      for (const c of cards[name].courses) for (const m of c.marks) expect(m.passing, `${name} ${c.id}`).toBeUndefined();
    }
  });
});
