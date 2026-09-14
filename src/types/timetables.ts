/**
 * School timetables, stored in `data/timetables.json` (see
 * `lib/timetable-data.ts`).
 *
 * A timetable belongs to a person through `memberId` and holds nothing else
 * about them: names, colours and icons always come from the family roster
 * (`types/family.ts`). Schools own the bell schedule and the subject list is
 * shared by everyone, so a week is just a grid of subject ids.
 */

/** School days, Monday to Friday. Weekend lessons are out of scope. */
export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri';

/** The two plans a school alternates between when its weeks differ. */
export type WeekLetter = 'A' | 'B';

/**
 * The days in week order. Grids, day headers and the importer all walk this,
 * so nothing re-derives the ordering from an object's key order.
 */
export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri'] as const satisfies readonly DayKey[];

/**
 * One row of a school's bell schedule: a numbered lesson period, or a named
 * break between them ("Pause", "Frühstück", "Mittagspause").
 *
 * `start` and `end` are 'HH:MM' on a 24 hour clock and run in time order.
 * Period length is whatever the school uses; 40, 45, 60 and 67.5 minutes all
 * exist in the wild, so never assume a fixed grid step.
 */
export type TimetableSlot =
  | { kind: 'period'; n: number; start: string; end: string }
  | { kind: 'break'; label: string; start: string; end: string };

/** A dated exception at one school: a day off, or a day that ends early. */
export interface TimetableSpecialDay {
  /** YYYY-MM-DD, local calendar date. */
  date: string;
  /** What the day is called on the wall, for example "Rosenmontag". */
  label: string;
  /** `off` closes the whole day; `ends-after` keeps the morning and drops the rest. */
  kind: 'off' | 'ends-after';
  /** The last period that still happens. Read only when `kind` is `ends-after`. */
  period?: number;
}

export interface TimetableSchool {
  id: string;
  name: string;
  /** Periods and named breaks in time order. One bell schedule for the whole school. */
  slots: TimetableSlot[];
  /**
   * Whether the school alternates two weeks. `parity` reads the letter off the
   * ISO week number: odd weeks get `oddWeek`, even weeks the other letter.
   * Leaving room here for a school-published week list is deliberate.
   */
  weekCycle: { mode: 'off' } | { mode: 'parity'; oddWeek: WeekLetter };
  /**
   * Whose school holidays and public holidays close this school, as an
   * OpenHolidays region code ("DE-NW"), or a bare country code for the
   * countries that publish one set of dates and no regions ("LU").
   *
   * It belongs to the school because a school is in a place: a household with
   * children at schools in two states needs both, which one setting shared by
   * every card on a wall can never give them. Unset means no lookup at all, no
   * dimmed holiday columns and no back-to-school line.
   */
  holidayRegion?: string;
  /** After-school care and the time it runs until, per day (OGS "bis 16:00", Fridays earlier). */
  care?: { name: string; until: Partial<Record<DayKey, string>> };
  /** Dated exceptions such as carnival days or a report-card morning. */
  specialDays: TimetableSpecialDay[];
}

export interface TimetableSubject {
  id: string;
  /** Short form for narrow cells, for example "Ma" or "WiPo". */
  code: string;
  name: string;
  /** Colour the subject's lessons are tinted with. */
  color: string;
  /** Name of the small picture drawn in the cell, for example `flask`, for readers who need one. */
  icon: string;
  /** What to pack for this subject, for example "Sportzeug". */
  bring?: string;
}

/**
 * What happens in one period. A period with no entry is free.
 *
 * `room` is for the lessons that sit somewhere other than the class room; it
 * wins over the timetable's `usualRoom`. `course` is the group badge older
 * kids carry next to the subject ("LK", "GK").
 */
export type TimetableCell = { subjectId: string; room?: string; course?: string } | { lunch: true };

/** One week of lessons: day, then period number, then what happens in it. */
export type TimetableWeek = Partial<Record<DayKey, Record<number, TimetableCell>>>;

/**
 * Something about one day for one person: a test, a one-off thing to bring, or
 * lessons that are off.
 *
 * A test points at a subject, so it survives the timetable being repainted and
 * marks every lesson in that subject that day. A cancellation points at
 * periods, because "the 6th period is off" is how schools say it.
 */
export interface TimetableNote {
  id: string;
  /** YYYY-MM-DD, local calendar date. */
  date: string;
  kind: 'test' | 'bring' | 'cancelled';
  /** Test: the subject being tested. */
  subjectId?: string;
  /** Cancelled: the period numbers that are off that day. */
  periods?: number[];
  /** Test: an optional name ("Mathe-Arbeit"). Bring: the thing to bring. */
  text?: string;
}

export interface Timetable {
  /** A `FamilyMember` id, the only link to a person. Unknown ids are skipped at render. */
  memberId: string;
  schoolId: string;
  /** The class this person is in, for example "7c". */
  className?: string;
  /**
   * The room most of this person's lessons happen in. A cell's own `room`
   * overrides it for that lesson.
   */
  usualRoom?: string;
  /** Draw the subject picture in every cell, which helps younger readers. */
  icons?: boolean;
  /** `B` exists only when this person's two weeks actually differ. */
  weeks: { A: TimetableWeek; B?: TimetableWeek };
  /** Where the week came from, when it was read out of a spreadsheet. */
  source?: TimetableSource;
  /** Dates to remember: tests, one-off things to bring, lessons that are off. Sorted by date. */
  notes?: TimetableNote[];
}

/**
 * The spreadsheet a week came from, and what has happened since.
 *
 * `sync` is a promise to the household, so everything needed to keep it lives
 * here: the tab to re-read, what the household said the sheet's own codes mean,
 * when the sheet was last looked at whatever the answer was, and why the last
 * look failed. A failed look never replaces the week that is saved, so
 * `lastError` and a perfectly good week sit together.
 */
export interface TimetableSource {
  kind: 'sheet';
  url: string;
  importedAt: string;
  /** Re-read this sheet every hour and replace week A with what it says. */
  sync: boolean;
  /** The tab the import took, so a re-read goes to the same one rather than guessing. */
  tab?: string;
  /**
   * The subject the household said each of the sheet's own codes means, keyed by
   * the code as the sheet writes it.
   *
   * Only the codes that needed an answer are in here: a code that already names
   * a subject is matched on every read and has nothing to remember. Without it a
   * re-read would forget that "Maths" was Math and quietly empty every one of
   * those periods, which is the one thing a sheet must never do to a week
   * somebody has already checked.
   */
  codes?: Record<string, string>;
  /** When the sheet was last looked at, successfully or not. */
  lastCheckedAt?: string;
  /** Why the last look failed, as one of the import error keys. Absent when it worked. */
  lastError?: string;
}

export interface TimetableData {
  schools: TimetableSchool[];
  /** Shared by every timetable, so one colour change reaches all of them. */
  subjects: TimetableSubject[];
  /** One per person at most; a member id never appears twice. */
  timetables: Timetable[];
}

/** Limits enforced by the store; the editor surfaces mirror them. */
export const TIMETABLE_LIMITS = {
  maxSchools: 16,
  maxSlotsPerSchool: 16,
  maxSubjects: 64,
  maxTimetables: 64,
  maxSpecialDaysPerSchool: 64,
  maxNameLength: 60,
  maxCodeLength: 6,
  maxRoomLength: 16,
  maxBringLength: 40,
  maxNotesPerTimetable: 60,
  maxNoteLength: 40,
} as const;
