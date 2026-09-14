'use client';

/**
 * What both views of the School Timetable module need before they can draw
 * anything: the timetables, the family roster, who the wall is showing, and
 * the days each of their schools is shut.
 *
 * Pulled out of the module so the Week view and the Day view read the same
 * people and the same holidays and cannot drift apart on either.
 */

import { useMemo } from 'react';
import type { TimetableConfig } from '@/types/config';
import type { FamilyMember } from '@/types/family';
import type { Timetable, TimetableSchool, TimetableSubject } from '@/types/timetables';
// Types only, both of them: these libraries read the disk and must never be
// bundled into a browser.
import type { LocalizedText, SchoolHolidaysResponse } from '@/lib/school-holidays';
import type { TimetableSnapshot } from '@/lib/timetable-data';
import type { FetchError } from '@/lib/fetch-error';
import type { TimetableClosure, TimetableHoliday } from '@/lib/timetable-layout';
import { useFamilyData } from '@/hooks/useFamilyData';
import { useFetchData } from '@/hooks/useFetchData';
import { FETCH_KEY_REGISTRY, timetablesUrl } from '@/lib/fetch-keys';
import { useLocale } from '@/i18n';

/** The store is polled about as often as somebody can change it in the editor. */
const TIMETABLES_TTL_MS = FETCH_KEY_REGISTRY.timetable?.ttlMs ?? 60_000;

/** A school year's holiday dates are published long in advance and never move. */
const HOLIDAYS_TTL_MS = 6 * 60 * 60 * 1000;

/** One person the wall is showing, before anything is known about holidays. */
export interface PersonEntry {
  member: FamilyMember;
  timetable: Timetable;
  school: TimetableSchool;
}

/** The days one region closes school, as the layout reads them. */
export interface SchoolClosures {
  schoolHolidays: TimetableHoliday[];
  publicHolidays: TimetableClosure[];
}

/** What a school with no region of its own gets: one object, so it never re-renders a card. */
export const NO_CLOSURES: SchoolClosures = { schoolHolidays: [], publicHolidays: [] };

/**
 * A school's region as the route takes it, or '' for a school with none. The
 * store already saves it upper case; a document edited by hand might not, and
 * a second spelling would be a second request for the same place.
 */
export function regionOf(school: TimetableSchool): string {
  return school.holidayRegion?.trim().toUpperCase() ?? '';
}

/**
 * The holiday's name in the display's language.
 *
 * The route answers with every language a row carries, so one cached copy
 * serves a household in any language and the pick happens at render. The
 * server library picks the same way; the two lines live here because that
 * library reads the disk.
 */
function localName(names: LocalizedText[] | undefined, locale: string): string {
  if (!names?.length) return '';
  const language = locale.split('-')[0].toUpperCase();
  const match =
    names.find((n) => n.language?.toUpperCase() === language)
    ?? names.find((n) => n.language?.toUpperCase() === 'EN')
    ?? names[0];
  return match.text ?? '';
}

export interface TimetablePeople {
  /** The store as last read; null until the first answer. */
  snapshot: TimetableSnapshot | null;
  error: FetchError | null;
  members: FamilyMember[];
  rosterLoading: boolean;
  rosterError: FetchError | null;
  subjects: TimetableSubject[];
  /** Who the wall is showing, in roster order. */
  shown: PersonEntry[];
  /** The days each region closes school, keyed by region code. */
  closures: Map<string, SchoolClosures>;
  /** The closures for one person's school, or none for a school without a region. */
  closuresFor: (entry: PersonEntry) => SchoolClosures;
}

export function useTimetablePeople(config: Pick<TimetableConfig, 'memberIds'>): TimetablePeople {
  // A holiday's name is a content word and follows the display's language; the
  // dates beside it follow the formatting locale, which is what that setting
  // is for. Read off one value, an English wall with German date formatting
  // said "Herbstferien, back to school on Montag, 26. Oktober".
  const locale = useLocale();

  const [snapshot, error] = useFetchData<TimetableSnapshot>(timetablesUrl(), TIMETABLES_TTL_MS);
  const { members, loading: rosterLoading, error: rosterError } = useFamilyData();

  const data = snapshot?.data;
  const subjects = useMemo(() => data?.subjects ?? [], [data]);

  // Who the wall is showing, settled before anything is asked about holidays:
  // the regions to ask about are these people's schools'.
  //
  // Cards follow the order the family list is in, so the wall matches the
  // roster rather than the order somebody happened to tick the boxes.
  const shown = useMemo<PersonEntry[]>(() => {
    const chosen = new Set(config.memberIds ?? []);
    if (!data || chosen.size === 0) return [];
    const out: PersonEntry[] = [];
    for (const member of members) {
      if (!chosen.has(member.id)) continue;
      const timetable = (data.timetables ?? []).find((entry) => entry.memberId === member.id);
      if (!timetable) continue;
      const school = (data.schools ?? []).find((entry) => entry.id === timetable.schoolId);
      if (!school) continue;
      out.push({ member, timetable, school });
    }
    return out;
  }, [data, members, config.memberIds]);

  // Every region the wall needs, deduped so three brothers and sisters at one
  // school are one question, and sorted so two walls showing the same schools
  // ask the same one however their cards happen to be ordered.
  const regions = useMemo(
    () => [...new Set(shown.map((entry) => regionOf(entry.school)).filter(Boolean))].sort(),
    [shown],
  );

  // No school naming a region means no request at all: a display that was
  // never asked to follow a school calendar must not quietly start talking to
  // one. Each code is escaped on its own so the commas between them stay
  // commas and the URL still reads.
  const [holidayData] = useFetchData<SchoolHolidaysResponse>(
    regions.length > 0
      ? `/api/timetables/holidays?region=${regions.map(encodeURIComponent).join(',')}`
      : '',
    HOLIDAYS_TTL_MS,
  );

  // Shaped once per region rather than once per card, so two children at one
  // school share the work as well as the request.
  const closures = useMemo(() => {
    const byRegion = new Map<string, SchoolClosures>();
    for (const [region, answer] of Object.entries(holidayData?.regions ?? {})) {
      byRegion.set(region, {
        schoolHolidays: (answer.schoolHolidays ?? [])
          // A half day is still a school day: lessons stop early, the wall does not.
          .filter((holiday) => !holiday.halfDay)
          .map((holiday) => ({
            name: localName(holiday.names, locale),
            start: holiday.startDate,
            end: holiday.endDate,
          })),
        publicHolidays: (answer.publicHolidays ?? []).map((day) => ({
          date: day.date,
          name: localName(day.names, locale),
        })),
      });
    }
    return byRegion;
  }, [holidayData, locale]);

  const closuresFor = useMemo(
    () => (entry: PersonEntry): SchoolClosures => closures.get(regionOf(entry.school)) ?? NO_CLOSURES,
    [closures],
  );

  return {
    snapshot: snapshot ?? null,
    error: error ?? null,
    members,
    rosterLoading,
    rosterError: rosterError ?? null,
    subjects,
    shown,
    closures,
    closuresFor,
  };
}
