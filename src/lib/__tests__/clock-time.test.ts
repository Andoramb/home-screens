import { describe, it, expect } from 'vitest';
import { formatClockTime, formatClockMinutes, resolveTimeFormat } from '@/lib/clock-time';
import { formatMealTime } from '@/lib/meal-constants';

// ── formatClockTime ──

describe('formatClockTime', () => {
  it('formats midnight, noon and the ends of the day in 12h', () => {
    expect(formatClockTime('00:00', '12h')).toBe('12:00 AM');
    expect(formatClockTime('12:00', '12h')).toBe('12:00 PM');
    expect(formatClockTime('12:05', '12h')).toBe('12:05 PM');
    expect(formatClockTime('23:59', '12h')).toBe('11:59 PM');
  });

  it('formats the same times in 24h', () => {
    expect(formatClockTime('00:00', '24h')).toBe('00:00');
    expect(formatClockTime('12:00', '24h')).toBe('12:00');
    expect(formatClockTime('12:05', '24h')).toBe('12:05');
    expect(formatClockTime('23:59', '24h')).toBe('23:59');
  });

  it('drops the leading zero on the hour in 12h and keeps it in 24h', () => {
    expect(formatClockTime('07:30', '12h')).toBe('7:30 AM');
    expect(formatClockTime('07:30', '24h')).toBe('07:30');
    expect(formatClockTime('9:00', '24h')).toBe('09:00');
    expect(formatClockTime('9:00', '12h')).toBe('9:00 AM');
  });

  it('switches the day period at noon, not at 1 PM', () => {
    expect(formatClockTime('11:59', '12h')).toBe('11:59 AM');
    expect(formatClockTime('13:00', '12h')).toBe('1:00 PM');
  });

  it('defaults to 12h when no format is given', () => {
    expect(formatClockTime('18:30')).toBe('6:30 PM');
    expect(formatClockTime('00:00')).toBe('12:00 AM');
  });

  it('returns an empty string for missing input', () => {
    expect(formatClockTime(undefined)).toBe('');
    expect(formatClockTime(null)).toBe('');
    expect(formatClockTime('')).toBe('');
  });

  it('returns an empty string for malformed or out-of-range input', () => {
    expect(formatClockTime('abc')).toBe('');
    expect(formatClockTime('12')).toBe('');
    expect(formatClockTime('12:5')).toBe('');
    expect(formatClockTime('12:005')).toBe('');
    expect(formatClockTime('24:00')).toBe('');
    expect(formatClockTime('25:00')).toBe('');
    expect(formatClockTime('12:60')).toBe('');
    expect(formatClockTime(' 12:00')).toBe('');
  });
});

// ── formatClockMinutes ──

describe('formatClockMinutes', () => {
  it('formats minutes from midnight in both formats', () => {
    expect(formatClockMinutes(0, '12h')).toBe('12:00 AM');
    expect(formatClockMinutes(0, '24h')).toBe('00:00');
    expect(formatClockMinutes(720, '12h')).toBe('12:00 PM');
    expect(formatClockMinutes(720, '24h')).toBe('12:00');
    expect(formatClockMinutes(725, '12h')).toBe('12:05 PM');
    expect(formatClockMinutes(725, '24h')).toBe('12:05');
    expect(formatClockMinutes(1439, '12h')).toBe('11:59 PM');
    expect(formatClockMinutes(1439, '24h')).toBe('23:59');
  });

  it('defaults to 12h when no format is given', () => {
    expect(formatClockMinutes(1110)).toBe('6:30 PM');
  });

  it('returns an empty string outside a single day', () => {
    expect(formatClockMinutes(-1)).toBe('');
    expect(formatClockMinutes(1440)).toBe('');
    expect(formatClockMinutes(99999)).toBe('');
  });

  it('returns an empty string for missing or non-integer input', () => {
    expect(formatClockMinutes(undefined)).toBe('');
    expect(formatClockMinutes(null)).toBe('');
    expect(formatClockMinutes(NaN)).toBe('');
    expect(formatClockMinutes(90.5)).toBe('');
  });

  it('agrees with formatClockTime across every minute of the day', () => {
    for (let minutes = 0; minutes < 1440; minutes++) {
      const hhmm = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
      expect(formatClockMinutes(minutes, '12h')).toBe(formatClockTime(hhmm, '12h'));
      expect(formatClockMinutes(minutes, '24h')).toBe(formatClockTime(hhmm, '24h'));
    }
  });
});

// ── resolveTimeFormat ──

describe('resolveTimeFormat', () => {
  it('prefers an explicit override', () => {
    expect(resolveTimeFormat('24h', '12h')).toBe('24h');
    expect(resolveTimeFormat('12h', '24h')).toBe('12h');
  });

  it('falls back to the household global, then 12h', () => {
    expect(resolveTimeFormat(undefined, '24h')).toBe('24h');
    expect(resolveTimeFormat(null, '24h')).toBe('24h');
    expect(resolveTimeFormat(undefined, undefined)).toBe('12h');
    expect(resolveTimeFormat(null, null)).toBe('12h');
  });
});

// ── Parity with the meal planner's existing output ──

/**
 * The meal planner formatted its own times before this module existed. These
 * are its exact shipped strings; the shared formatter has to keep producing
 * them, because every meal surface and its own test file expect them.
 */
const MEAL_PARITY_TABLE: { time: string; twelve: string; twentyFour: string }[] = [
  { time: '00:00', twelve: '12:00 AM', twentyFour: '00:00' },
  { time: '00:01', twelve: '12:01 AM', twentyFour: '00:01' },
  { time: '07:30', twelve: '7:30 AM',  twentyFour: '07:30' },
  { time: '9:00',  twelve: '9:00 AM',  twentyFour: '09:00' },
  { time: '11:59', twelve: '11:59 AM', twentyFour: '11:59' },
  { time: '12:00', twelve: '12:00 PM', twentyFour: '12:00' },
  { time: '12:05', twelve: '12:05 PM', twentyFour: '12:05' },
  { time: '12:30', twelve: '12:30 PM', twentyFour: '12:30' },
  { time: '13:00', twelve: '1:00 PM',  twentyFour: '13:00' },
  { time: '18:30', twelve: '6:30 PM',  twentyFour: '18:30' },
  { time: '23:59', twelve: '11:59 PM', twentyFour: '23:59' },
];

const MEAL_PARITY_REJECTS = ['', 'abc', '25:00', '12:60', '12', '12:5'];

describe('parity with formatMealTime', () => {
  for (const row of MEAL_PARITY_TABLE) {
    it(`${row.time} still renders as before`, () => {
      expect(formatClockTime(row.time, '12h')).toBe(row.twelve);
      expect(formatClockTime(row.time, '24h')).toBe(row.twentyFour);
      expect(formatMealTime(row.time, '12h')).toBe(row.twelve);
      expect(formatMealTime(row.time, '24h')).toBe(row.twentyFour);
    });
  }

  it('rejects the same inputs the meal planner rejected', () => {
    for (const bad of MEAL_PARITY_REJECTS) {
      expect(formatClockTime(bad, '12h')).toBe('');
      expect(formatMealTime(bad, '12h')).toBe('');
    }
    expect(formatMealTime(undefined)).toBe('');
  });

  it('keeps the same 12h default when no format is passed', () => {
    for (const row of MEAL_PARITY_TABLE) {
      expect(formatMealTime(row.time)).toBe(row.twelve);
      expect(formatClockTime(row.time)).toBe(row.twelve);
    }
  });
});
