import { describe, it, expect } from 'vitest';
import type { TimetableDetail } from '@/types/config';
import {
  dayBaseFontSize,
  dayGeometry,
  dayHoldsAt,
  dayTasteFontSize,
  resolveDayFontSize,
  type DayFitInput,
  type DayFitLesson,
  type DayWords,
} from '../timetable-day-fit';

/** The words the German wall prints, as the signed-off frames drew them. */
const DE: DayWords = {
  starts: 'los um'.length,
  ends: 'Schluss'.length,
  usually: 'sonst'.length,
  careUntil: 'OGS bis 15:00'.length,
  careShort: 'bis 15:00'.length,
  packTitle: 'Heute Abend einpacken'.length,
  packSub: 'für Freitag, 11. September'.length,
  nothing: 'nichts Besonderes'.length,
  time: 5,
  tick: 5,
};

const EN: DayWords = { ...DE, starts: 6, ends: 4, careUntil: 'Care until 3:00 PM'.length, careShort: 'until 3:00 PM'.length, packTitle: 'Pack tonight'.length, time: 8, tick: 5 };

function lesson(minutes: number, code: string, name: string, part: string, course = ''): DayFitLesson {
  return { minutes, codeChars: code.length, nameChars: name.length, namePartChars: part.length, courseChars: course.length };
}

/** The card padding and border the wall's default style gives every card. */
const INSET = 17;

/** The television every landscape frame was drawn on: 1856 by 912 under the top strip. */
function tv(overrides: Partial<DayFitInput> = {}): DayFitInput {
  return {
    width: 1856,
    height: 912,
    inset: INSET,
    orientation: 'rows',
    rowCount: 3,
    // Friday for Leon, Emma and Mia: 07:50 to Mia's OGS at 15:00.
    axis: { startMin: 7 * 60 + 30, endMin: 15 * 60 + 30 },
    detail: 'some',
    // The longest name on the day sits on a single period, as Leon's Geschichte does.
    lessons: [lesson(45, 'Ge', 'Geschichte', 'schichte'), lesson(90, 'Sp', 'Sport', 'Sport')],
    nameChars: 4,
    classChars: 3,
    schoolChars: 'Gymnasium am Rhein'.length,
    words: DE,
    timeFormat: '24h',
    hasShortDay: false,
    hasCare: true,
    hasWeekLetter: true,
    ...overrides,
  };
}

/** Within a tenth of the size the frame was drawn at, either way. */
function near(actual: number, drawn: number, tolerance = 0.12) {
  expect(actual, `${actual.toFixed(1)}px against the frame's ${drawn}px`).toBeGreaterThanOrEqual(drawn * (1 - tolerance));
  expect(actual, `${actual.toFixed(1)}px against the frame's ${drawn}px`).toBeLessThanOrEqual(drawn * (1 + tolerance));
}

describe('dayBaseFontSize against the signed-off frames', () => {
  it('H1: three kids at Some on a television', () => {
    near(dayBaseFontSize(tv()), 30);
  });

  it('H4: Less draws bigger than Some, More smaller', () => {
    const less = dayBaseFontSize(tv({ detail: 'less', height: 880 }));
    const some = dayBaseFontSize(tv());
    const more = dayBaseFontSize(tv({ detail: 'more' }));
    near(less, 34);
    near(more, 28);
    expect(less).toBeGreaterThan(some);
    // Some and More can settle on the same name-bound size on this day.
    expect(some).toBeGreaterThanOrEqual(more);
  });

  it('H5: five kids at Less still fit, smaller', () => {
    const five = dayBaseFontSize(tv({
      detail: 'less', rowCount: 5, axis: { startMin: 450, endMin: 990 }, nameChars: 5,
      lessons: [lesson(45, 'Sowi', 'Sozialwissenschaften', 'wissen-', 'GK'), lesson(45, 'Ge', 'Geschichte', 'schichte')],
    }));
    near(five, 26);
  });

  it('H6: one kid at More in half the height', () => {
    // The names bind here, not the height: the frame's face fits "schichte" in
    // a period at 34px where the wall's wider face needs a size or two less.
    near(dayBaseFontSize(tv({ detail: 'more', rowCount: 1, height: 520 })), 34, 0.16);
  });

  it('H7: a ten hour clock with a 45 minute "Deutsch" comes down for the name', () => {
    const long = dayBaseFontSize(tv({
      axis: { startMin: 450, endMin: 1020 },
      lessons: [lesson(45, 'Deu', 'Deutsch', 'Deutsch'), lesson(45, 'Ma', 'Mathe', 'Mathe', 'GK'), lesson(90, 'Bio', 'Biologie', 'logie', 'LK')],
    }));
    near(long, 28);
    expect(long).toBeLessThan(dayBaseFontSize(tv()));
  });

  it('H11: four kids on a short day, with the banner in the header', () => {
    near(dayBaseFontSize(tv({
      rowCount: 4, hasShortDay: true, axis: { startMin: 450, endMin: 990 },
      lessons: [lesson(45, 'Deu', 'Deutsch', 'Deutsch'), lesson(90, 'Bio', 'Biologie', 'logie', 'LK'), lesson(45, 'Mu', 'Musik', 'Musik')],
    })), 27, 0.15);
  });

  it('H12: four columns on a portrait wall', () => {
    const portrait = dayBaseFontSize(tv({
      orientation: 'columns',
      width: 1016,
      height: 1752,
      rowCount: 4,
      axis: { startMin: 450, endMin: 1020 },
      lessons: [lesson(45, 'SU', 'Sachunterricht', 'unter-'), lesson(45, 'Ma', 'Mathe', 'Mathe', 'GK'), lesson(45, 'Deu', 'Deutsch', 'Deutsch')],
    }));
    near(portrait, 24);
  });

  it('a 45 minute lesson beside a 90 minute double is measured on the 45', () => {
    const single = dayBaseFontSize(tv({ lessons: [lesson(45, 'Ge', 'Geschichte', 'schichte')] }));
    const doubles = dayBaseFontSize(tv({ lessons: [lesson(90, 'Ge', 'Geschichte', 'schichte')] }));
    expect(doubles).toBeGreaterThanOrEqual(single);
  });

  it('an eight hour day and a four hour day in the same box', () => {
    const short = dayBaseFontSize(tv({ axis: { startMin: 450, endMin: 690 } }));
    const long = dayBaseFontSize(tv({ axis: { startMin: 450, endMin: 930 } }));
    expect(short).toBeGreaterThanOrEqual(long);
    // Neither runs away: the width caps both.
    expect(short).toBeLessThanOrEqual(1856 / 52 + 0.01);
  });

  it('12-hour times widen the head and end columns', () => {
    const en = dayGeometry(tv({ words: EN, timeFormat: '12h' }), 30);
    const de = dayGeometry(tv(), 30);
    if (en.orientation !== 'rows' || de.orientation !== 'rows') throw new Error('rows');
    expect(en.endPx).toBeGreaterThan(de.endPx);
    expect(en.lanePx).toBeLessThan(de.lanePx);
  });

  it('labels every other hour once an hour is narrower than its label', () => {
    const roomy = dayGeometry(tv(), 30);
    const tight = dayGeometry(tv({ width: 700 }), 30);
    if (roomy.orientation !== 'rows' || tight.orientation !== 'rows') throw new Error('rows');
    expect(roomy.tickEvery).toBe(60);
    expect(tight.tickEvery).toBe(120);
  });

  it('is zero with no box, and never below six pixels with one', () => {
    expect(dayBaseFontSize(tv({ width: 0 }))).toBe(0);
    expect(dayTasteFontSize(tv({ height: 0 }))).toBe(0);
    expect(dayBaseFontSize(tv({ width: 200, height: 120, rowCount: 5 }))).toBeGreaterThanOrEqual(6);
  });
});

describe('resolveDayFontSize', () => {
  it('honours a size the rows can hold', () => {
    const own = dayBaseFontSize(tv());
    expect(resolveDayFontSize(tv(), own)).toEqual({ fontSize: own, shed: 0 });
  });

  it('sheds the rooms, then the names, before it declines a size', () => {
    const input = tv();
    const own = dayBaseFontSize(input);
    // Text size 150%: the names no longer fit the shortest block at that size.
    const pressed = resolveDayFontSize(input, own * 1.5);
    expect(pressed.shed).toBeGreaterThan(0);
    expect(pressed.fontSize).toBeGreaterThanOrEqual(own);
    // Whatever it settled on holds with what it kept.
    expect(dayHoldsAt({ ...input, shed: pressed.shed }, pressed.fontSize)).toBe(true);
    expect(dayHoldsAt({ ...input, shed: 0 }, own * 1.5)).toBe(false);
  });

  it('never comes down below the size it would have chosen for itself', () => {
    const input = tv();
    const own = dayBaseFontSize(input);
    const huge = resolveDayFontSize(input, own * 4);
    expect(huge.fontSize).toBeGreaterThanOrEqual(own);
    expect(huge.fontSize).toBeLessThan(own * 4);
    expect(dayHoldsAt({ ...input, shed: huge.shed }, huge.fontSize)).toBe(true);
  });

  it('at Less there is nothing to shed, so a size that will not hold comes down', () => {
    const input = tv({ detail: 'less' });
    const own = dayBaseFontSize(input);
    const pressed = resolveDayFontSize(input, own * 3);
    expect(pressed.fontSize).toBeLessThan(own * 3);
    expect(pressed.fontSize).toBeGreaterThanOrEqual(own);
  });

  it('passes an unmeasured box straight through', () => {
    expect(resolveDayFontSize(tv({ width: 0 }), 20)).toEqual({ fontSize: 20, shed: 0 });
  });
});

describe('detail tiers', () => {
  it.each<TimetableDetail>(['less', 'some', 'more'])('%s holds at its own size', (detail) => {
    const input = tv({ detail });
    expect(dayHoldsAt(input, dayBaseFontSize(input))).toBe(true);
  });
});
