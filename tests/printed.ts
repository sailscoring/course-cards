import { type CourseCardFile, type CourseMark, printedMarks } from '../src/index';

/**
 * A course's marks as the club prints them on the card: the sequence without
 * the start line at its head, which comes from the sailing instructions and
 * is not one of the letters the card shows, and without the ending the
 * instructions add at its tail where the card prints none. The
 * transcriptions the tests compare against were read off the printed cards,
 * so they compare against this.
 */
export function printed(card: CourseCardFile, id: string): CourseMark[] {
  return printedMarks(card, id);
}
