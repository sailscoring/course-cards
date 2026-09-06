import type { Course, CourseCardFile, CourseMark } from '../src/index';

/**
 * A course's marks as the club prints them on the card: the sequence without
 * the start line at its head, which comes from the sailing instructions and
 * is not one of the letters the card shows. The transcriptions the tests
 * compare against were read off the printed cards, so they compare against
 * this.
 */
export function printed(card: CourseCardFile, id: string): CourseMark[] {
  const course: Course = card.courses.find((c) => c.id === id)!;
  return course.marks.filter((m) => m.mark !== card.startLine?.id);
}
