import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { fetchWithTimeout, withAuth } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (request: NextRequest) => {
  // IP-based geolocation fallback (for non-HTTPS origins where browser geolocation is blocked)
  if (request.nextUrl.searchParams.get('detect') === 'ip') {
    try {
      const res = await fetchWithTimeout('http://ip-api.com/json/?fields=lat,lon,city,region,regionName,countryCode');
      if (res.ok) {
        const data = await res.json();
        const displayName = [data.city, data.regionName, data.countryCode].filter(Boolean).join(', ');
        const countryCode = typeof data.countryCode === 'string' ? data.countryCode.toUpperCase() : '';
        // This source gives the state on its own, so the ISO code is put back
        // together here. It is only ever offered as a suggestion somebody can
        // change, which is what makes a country that numbers its states
        // differently harmless.
        const region = typeof data.region === 'string' ? data.region.toUpperCase() : '';
        const subdivisionCode = /^[A-Z]{2}$/.test(countryCode) && /^[A-Z0-9]{1,3}$/.test(region)
          ? `${countryCode}-${region}`
          : '';
        return NextResponse.json({
          latitude: data.lat,
          longitude: data.lon,
          displayName,
          ...(countryCode ? { countryCode } : {}),
          ...(subdivisionCode ? { subdivisionCode } : {}),
        });
      }
    } catch {
      // fall through
    }
    return NextResponse.json({ error: 'IP geolocation failed' }, { status: 502 });
  }

  const query = request.nextUrl.searchParams.get('q');
  if (!query) {
    return NextResponse.json({ error: 'Missing query param: q' }, { status: 400 });
  }

  // If query looks like a US zip code (5 digits, optionally +4), add country hint
  const isZipCode = /^\d{5}(-\d{4})?$/.test(query.trim());
  const searchQuery = isZipCode ? `${query.trim()}, United States` : query;

  // Nominatim (OpenStreetMap) — no key required
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=1&addressdetails=1`;
  const res = await fetchWithTimeout(url, {
    headers: { 'User-Agent': 'HomeScreens/1.0' },
  });
  if (res.ok) {
    const results = await res.json();
    if (results.length > 0) {
      const r = results[0];
      const addr = r.address ?? {};
      const city = addr.city || addr.town || addr.village || addr.county || '';
      const state = addr.state || '';
      const country = addr.country_code?.toUpperCase() || '';
      const displayName = [city, state, country].filter(Boolean).join(', ');
      // The state's ISO code, e.g. "DE-NW" for Dusseldorf. School holidays are
      // set per state, so the settings page offers this as the region rather
      // than making somebody pick theirs off a list of sixteen.
      const subdivisionCode = typeof addr['ISO3166-2-lvl4'] === 'string' ? addr['ISO3166-2-lvl4'].toUpperCase() : '';
      return NextResponse.json({
        latitude: parseFloat(r.lat),
        longitude: parseFloat(r.lon),
        displayName: displayName || r.display_name,
        ...(country ? { countryCode: country } : {}),
        ...(subdivisionCode ? { subdivisionCode } : {}),
      });
    }
  }

  return NextResponse.json({ error: 'Location not found' }, { status: 404 });
}, 'Geocoding request failed');
