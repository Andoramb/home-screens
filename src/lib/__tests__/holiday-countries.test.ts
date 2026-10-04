import { describe, expect, it } from 'vitest';
import { localizedHolidayCountries } from '../holiday-countries';

const LISTED = [
  { countryCode: 'AD', name: 'Andorra' },
  { countryCode: 'AL', name: 'Albania' },
  { countryCode: 'AT', name: 'Austria' },
  { countryCode: 'DE', name: 'Germany' },
  { countryCode: 'US', name: 'United States' },
];

describe('localizedHolidayCountries', () => {
  it('names the countries in the language and sorts by that name', () => {
    expect(localizedHolidayCountries(LISTED, 'de-DE').map((c) => c.name)).toEqual([
      'Albanien', 'Andorra', 'Deutschland', 'Österreich', 'Vereinigte Staaten',
    ]);
  });

  it('sorts English by name too, not by code', () => {
    expect(localizedHolidayCountries(LISTED, 'en-US').map((c) => c.countryCode)).toEqual(['AL', 'AD', 'AT', 'DE', 'US']);
  });

  it('keeps the listed name for a code the browser has no name for', () => {
    expect(localizedHolidayCountries([{ countryCode: 'ZZ9', name: 'Somewhere' }], 'de-DE')).toEqual([
      { countryCode: 'ZZ9', name: 'Somewhere' },
    ]);
  });
});
