import { describe, it, expect } from 'vitest';
import { CONNECTABLE_SERVICES, isServiceConnected } from '@/lib/connectable-services';
import type { GoogleAppsStatus } from '@/lib/google-apps';

const google = CONNECTABLE_SERVICES.find((s) => s.id === 'google')!;
const todoist = CONNECTABLE_SERVICES.find((s) => s.id === 'todoist')!;

function apps(calendar: GoogleAppsStatus['calendar']['mode']): GoogleAppsStatus {
  return {
    calendar: { mode: calendar, hostedAvailable: calendar === 'hosted' },
    photos: { mode: null, hostedAvailable: calendar === 'hosted' },
  };
}

describe('isServiceConnected', () => {
  it('counts Google by its Calendar keys when Home Screens\' app is off or unknown', () => {
    expect(isServiceConnected(google, ['google_client_id', 'google_client_secret'])).toBe(true);
    expect(isServiceConnected(google, ['google_client_id'], apps(null))).toBe(false);
    expect(isServiceConnected(google, ['google_maps_key', 'google_web_client_id'], null)).toBe(false);
  });

  it('counts Google as connected, with no keys at all, when Calendar signs in with Home Screens\' app', () => {
    expect(isServiceConnected(google, [], apps('hosted'))).toBe(true);
  });

  it('never lets Home Screens\' Google app count for another service', () => {
    expect(isServiceConnected(todoist, [], apps('hosted'))).toBe(false);
  });
});
