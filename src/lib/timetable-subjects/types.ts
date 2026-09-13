/**
 * Shape of a built-in subject catalogue entry.
 *
 * A catalogue is the list of subjects a household starts from, before anyone
 * has typed a timetable of their own. Each locale lists the subjects that
 * country's schools actually teach, so the lists are not translations of one
 * another: they differ in length, in what they contain and in the short codes
 * that fit a narrow cell. What they do share is the colour language and the
 * icon vocabulary, so a wall reads the same way in every language.
 *
 * The colour language: the local language red, maths blue, the first foreign
 * language yellow, further foreign languages orange, Latin brown, sciences
 * green and teal, geography olive, history amber, society indigo, religion
 * violet, arts pink, sport lime, computing slate, and grey for the periods
 * that are not really a subject (support, class meeting, lunch).
 */

import type { TimetableSubject } from '@/types/timetables';

/**
 * Every picture a built-in subject may carry. The editor's subject picker
 * offers this set, so a catalogue can never name an icon nothing can draw.
 */
export const TIMETABLE_SUBJECT_ICONS = [
  'book',
  'triangle',
  'speech',
  'scroll',
  'leaf',
  'flask',
  'atom',
  'globe',
  'castle',
  'people',
  'star',
  'palette',
  'music',
  'ball',
  'chip',
  'magnifier',
  'heart',
  'chat',
] as const;

export type TimetableSubjectIcon = (typeof TIMETABLE_SUBJECT_ICONS)[number];

/**
 * A catalogue entry. Same shape a saved subject has, with the icon narrowed
 * to the shared vocabulary so a typo in a catalogue file fails the build.
 */
export interface DefaultSubject extends TimetableSubject {
  icon: TimetableSubjectIcon;
}
