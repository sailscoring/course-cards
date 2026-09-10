import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseCourseCardFile, parseMarksFile } from '../src/index';
import { printed } from './printed';

function load(rel: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, '..', 'data', 'hyc', 'al-2026', rel), 'utf-8'));
}

const marks = parseMarksFile(load('marks.json'));
const cards = {
  offshore: parseCourseCardFile(load('offshore.json')),
  inshore: parseCourseCardFile(load('inshore.json')),
};

describe('the HYC Autumn League 2026 marks file', () => {
  it('is the 2025 technical sheet’s, the club having published no 2026 one', () => {
    const al2025 = parseMarksFile(
      JSON.parse(readFileSync(join(__dirname, '..', 'data', 'hyc', 'al-2025', 'marks.json'), 'utf-8')),
    );
    expect(marks.marks).toEqual(al2025.marks);
    expect(marks.source).toBe(al2025.source);
  });
});

describe.each(Object.entries(cards))('the HYC Autumn League 2026 %s card', (name, card) => {
  it('has the card’s 18 × 4 courses, lettered A–T without I or O', () => {
    expect(card.marks).toBe('marks.json');
    const letters = 'ABCDEFGHJKLMNPQRST'.split('');
    expect(card.courses.map((c) => c.id)).toEqual(letters.flatMap((l) => [1, 2, 3, 4].map((n) => `${l}${n}`)));
  });

  it('carries the card’s heading, wind rows and notes', () => {
    expect(card.name).toMatch(/^Autumn League 2026 course card, (off|in)shore committee vessel starts$/);
    expect(card.notes?.map((n) => n.title)).toEqual(['Card heading', 'Wind direction', 'Card notes']);
    expect(card.notes![0]!.text).toContain('HYC COURSE CARD - 2026 Rev 0 (08/09/2026)');
    // The card heads the wind column with the ±10° it holds each row good for.
    const [heading, winds] = card.notes![1]!.text.split('\n');
    expect(heading).toBe('Wind Direction +/- 10°');
    // 000° to 340° in 20° steps, one row per course letter.
    expect(winds).toBe(
      'A 000°, B 020°, C 040°, D 060°, E 080°, F 100°, G 120°, H 140°, J 160°, K 180°, ' +
        'L 200°, M 220°, N 240°, P 260°, Q 280°, R 300°, S 320°, T 340°',
    );
    expect(card.notes![2]!.text).toContain('This course card forms part of the Sailing Instructions.');
  });

  it('begins every course at the start line SI 6.1 or 6.2 B defines', () => {
    const offshore = name === 'offshore';
    expect(card.startLine).toMatchObject({ id: 'SL', name: 'Start line' });
    expect(card.startLine!.position).toBeUndefined();
    expect(card.startLine!.source).toBe(
      `HYC Autumn League 2026 sailing instructions ${offshore ? '6.1' : '6.2'} A and B`,
    );
    // Both lines are laid on the day; the starting areas differ.
    expect(card.startLine!.placement).toContain(
      offshore ? 'North of Ireland’s Eye' : 'northwest of Ireland’s Eye',
    );
    expect(marks.marks.some((m) => m.id === 'SL')).toBe(false);
    // SI 6.1 C and 6.2 C: Z is laid to windward of the line and is the first
    // mark of every fixed-mark course.
    for (const course of card.courses) {
      expect(course.marks[0]!.mark, course.id).toBe('SL');
      expect(course.marks[1]!.mark, course.id).toBe('Z');
    }
  });

  it('every mark is one the sheet lists, rounded to a side the card’s colours give', () => {
    const known = new Set(marks.marks.map((m) => m.id));
    for (const course of card.courses) {
      for (const cm of printed(card, course.id)) {
        expect(known.has(cm.mark), `${course.id}: mark ${cm.mark}`).toBe(true);
        expect(cm.side, `${course.id}: mark ${cm.mark}`).toBeDefined();
        expect(cm.passing, `${course.id}: mark ${cm.mark}`).toBeUndefined();
      }
    }
  });

  it('carries the wind each row is laid out for: A 000° to T 340° in 20° steps', () => {
    const letters = 'ABCDEFGHJKLMNPQRST';
    for (const course of card.courses) {
      expect(course.windDirectionDeg, course.id).toBe(letters.indexOf(course.id[0]!) * 20);
    }
  });

  it('prints no distances: the published cards dropped the column the drafts had', () => {
    for (const course of card.courses) expect(course.distanceNm, course.id).toBeUndefined();
  });

  it('spot checks against the printed card', () => {
    const text = (id: string) =>
      // lowercase: starboard
      printed(card, id)
        .map((m) => (m.side === 'starboard' ? m.mark.toLowerCase() : m.mark))
        .join(' ');
    const expected: Record<string, Record<string, string>> = {
      offshore: {
        A1: 'Z U I h g',
        C1: 'Z p u k',
        D4: 'Z p a I e g',
        // The draft printed Z E O I G against 9.1 NM, a mile and four fifths
        // short of what its marks came to; the published card adds the I.
        N2: 'Z e I O I g',
        K3: 'Z O A K A g',
        K4: 'Z O A K A g', // the same course printed twice
        T4: 'Z V D U V K U g',
      },
      inshore: {
        A1: 'Z P W P W',
        E4: 'Z V C K V W O C i',
        N3: 'Z V H W o C',
        Q4: 'Z I D W D W C I W',
        R4: 'Z I D W D W C I W', // the 300° row repeats the 280° row
        T4: 'Z W C P C P C P',
      },
    };
    for (const [id, want] of Object.entries(expected[name]!)) expect(text(id), id).toBe(want);
  });
});

describe('the HYC Autumn League 2026 offshore card', () => {
  it('ends every course at K or G, as SI 6.1 D says the run in to the finish begins', () => {
    for (const course of cards.offshore.courses) {
      expect(['K', 'G'], course.id).toContain(course.marks.at(-1)!.mark);
    }
  });
});
