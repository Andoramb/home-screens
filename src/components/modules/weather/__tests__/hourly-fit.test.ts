import { describe, expect, it } from 'vitest';
import { hoursThatFit } from '../WeatherHourlyView';

describe('hoursThatFit', () => {
  it('counts the columns a row holds whole, never less than one', () => {
    // At 26px type a column is 65px with a 9px gap: 340px holds four.
    expect(hoursThatFit(340, 26)).toBe(4);
    expect(hoursThatFit(1000, 26)).toBe(13);
    expect(hoursThatFit(20, 26)).toBe(1);
  });

  it('holds nothing back until the row has been measured', () => {
    expect(hoursThatFit(0, 26)).toBe(Infinity);
  });
});
