/** A country the holiday service knows, as `/api/holidays?countries` lists it. */
export interface HolidayCountry {
  countryCode: string;
  /** The service's own name for it, in English. */
  name: string;
}

/**
 * The holiday countries as a family reads them: named in their language and
 * sorted by that name.
 *
 * The service lists them in English, in the order of their two-letter codes
 * (Andorra, Antigua and Barbuda, Anguilla, Albania), which is no order anyone
 * can find a country in. The names come from the browser's own list for the
 * language, so every language the app ships is covered with no translation
 * file; a code the browser has no name for keeps the service's.
 */
export function localizedHolidayCountries(countries: readonly HolidayCountry[], locale: string): HolidayCountry[] {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([locale], { type: 'region' });
  } catch {
    names = null;
  }
  const nameOf = (country: HolidayCountry): string => {
    try {
      const name = names?.of(country.countryCode);
      // An unknown code comes back as the code itself.
      return name && name !== country.countryCode ? name : country.name;
    } catch {
      return country.name;
    }
  };
  return countries
    .map((country) => ({ countryCode: country.countryCode, name: nameOf(country) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}
