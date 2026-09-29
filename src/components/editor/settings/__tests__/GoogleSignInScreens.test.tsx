// @vitest-environment jsdom

/**
 * Home Screens' own Google app stays invisible until Google approves it: with
 * HS_GOOGLE_HOSTED off (the hub reports `hostedAvailable: false`), or when
 * the hub can't be asked, the API keys card and the Calendar page render
 * exactly what they always have. With it on, a household that saved its own
 * app keeps its own sign-in screens.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nProvider } from '@/i18n/provider';
import enUSEditor from '@/translations/en-US/editor.json';
import enUSCore from '@/translations/en-US/core.json';
import type { GoogleAppsStatus } from '@/lib/google-apps';
import { useEditorStore } from '@/stores/editor-store';
import type { ScreenConfiguration } from '@/types/config';

const editorFetch = vi.fn();
vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: (...args: unknown[]) => editorFetch(...args),
  isSessionExpired: () => false,
}));

import GoogleIntegrationCard from '../GoogleIntegrationCard';
import CalendarSection from '../CalendarSection';

function Wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider locale="en-US" blob={{ editor: enUSEditor, core: enUSCore }}>{children}</I18nProvider>;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const OFF: GoogleAppsStatus = {
  calendar: { mode: null, hostedAvailable: false },
  photos: { mode: null, hostedAvailable: false },
};
const HOSTED: GoogleAppsStatus = {
  calendar: { mode: 'hosted', hostedAvailable: true },
  photos: { mode: 'hosted', hostedAvailable: true },
};

beforeEach(() => {
  editorFetch.mockReset();
});
afterEach(() => {
  cleanup();
});

describe('Google card on the API keys page', () => {
  function card(apps: GoogleAppsStatus | null, status: Record<string, boolean> = {}) {
    return render(<GoogleIntegrationCard status={status} onSaved={vi.fn()} apps={apps} />, { wrapper: Wrapper });
  }

  it.each([
    ['the switch is off', OFF],
    ['the hub could not be asked', null],
  ])('is the card it always was when %s', (_, apps) => {
    const view = card(apps, { google_client_id: true });
    expect(view.getByText('Google needs you to create a login for your own home first. Make an OAuth credential of type “TVs and Limited Input devices” in the Google Cloud Console, then paste both halves here.')).toBeTruthy();
    expect(view.getByText('Calendar Client ID')).toBeTruthy();
    expect(view.getByText('1 of 3')).toBeTruthy();
    expect(view.queryByText('Ready')).toBeNull();
    expect(view.queryByText('Use your own Google app')).toBeNull();
    expect(view.queryByTestId('google-ready')).toBeNull();
  });

  it('leads with "ready to use" and folds the sign-in boxes away when nothing is saved', () => {
    const view = card(HOSTED);
    expect(view.getByText('Ready')).toBeTruthy();
    expect(view.getByText('Google Calendar and Google Photos are ready to use')).toBeTruthy();
    expect(view.getByText('Maps API Key')).toBeTruthy();
    expect(view.getByText('Most homes don\'t need this.')).toBeTruthy();
    expect(view.queryByText('Calendar Client ID')).toBeNull();

    fireEvent.click(view.getByTestId('google-own-app-toggle'));
    expect(view.getByText(/anyone already signed in with Google will need to sign in again/)).toBeTruthy();
    expect(view.getByText('Calendar Client ID')).toBeTruthy();
    expect(view.getByText('Photos Import Client ID')).toBeTruthy();
  });

  it('opens on the household\'s own app, and says Photos alone is ready when only Photos uses Home Screens\' app', () => {
    const view = card(
      { calendar: { mode: 'own', hostedAvailable: true }, photos: { mode: 'hosted', hostedAvailable: true } },
      { google_client_id: true, google_client_secret: true },
    );
    expect(view.getByText('Using your own Google app')).toBeTruthy();
    expect(view.getByText('Open because you\'ve saved one.')).toBeTruthy();
    expect(view.getByText('Google Photos is ready to use')).toBeTruthy();
    expect(view.queryByText('Connect Google Calendar →')).toBeNull();
    expect(view.getByText('Calendar Client ID')).toBeTruthy();
  });
});

describe('Google Calendar on the Calendar page', () => {
  const values = {
    selectedCalendarIds: [],
    icalSources: [],
    icloudSources: [],
    personSources: {},
    daysAhead: 14,
    hideDeclined: false,
  };

  async function calendarPage(status: Record<string, unknown>) {
    editorFetch.mockImplementation(async (url: string) => {
      if (url === '/api/auth/google/status') return jsonResponse(status);
      if (url === '/api/auth/google/device') {
        return jsonResponse({ user_code: 'WXCP-RMTQ', verification_url: 'https://www.google.com/device', device_code: 'dc', interval: 5, expires_in: 1800 });
      }
      if (url.startsWith('/api/holidays')) return jsonResponse([]);
      if (url === '/api/icloud/accounts') return jsonResponse([]);
      return jsonResponse({});
    });
    const view = render(<CalendarSection values={values} onChange={vi.fn()} />, { wrapper: Wrapper });
    await act(async () => {});
    return view;
  }

  it('shows the own-app sign-in when the household saved its own app', async () => {
    const view = await calendarPage({ connected: false, credentialsConfigured: true, mode: 'own' });
    expect(view.getByText(/Requires a Google OAuth client/)).toBeTruthy();
    expect(view.queryByTestId('google-calendar-hosted-sign-in')).toBeNull();
  });

  it('sends a hub with no app to the API keys page, as before', async () => {
    const view = await calendarPage({ connected: false, credentialsConfigured: false, mode: null });
    expect(view.getByText(/Connecting your calendar needs a Google sign-in you create yourself/)).toBeTruthy();
    expect(view.queryByTestId('google-calendar-hosted-sign-in')).toBeNull();
  });

  it('offers Google\'s button and then the short code with Home Screens\' app', async () => {
    const view = await calendarPage({ connected: false, credentialsConfigured: true, mode: 'hosted' });
    expect(view.getByText(/You'll finish signing in on your phone or computer with a short code/)).toBeTruthy();
    expect(view.queryByText(/Requires a Google OAuth client/)).toBeNull();

    fireEvent.click(view.getByRole('button', { name: 'Sign in with Google' }));
    await act(async () => {});
    expect(view.getByText('WXCP-RMTQ')).toBeTruthy();
    expect(view.getByRole('link', { name: 'google.com/device' })).toBeTruthy();

    fireEvent.click(view.getByRole('button', { name: 'Cancel' }));
    expect(view.queryByText('WXCP-RMTQ')).toBeNull();
    expect(view.getByRole('button', { name: 'Sign in with Google' })).toBeTruthy();
  });

  it('redraws the calendar badges from a fresh read once the sign-in finishes, not from the status before it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    useEditorStore.setState({
      config: {
        screens: [],
        settings: { timezone: 'America/Chicago', calendar: { googleCalendarIds: ['family'], icalSources: [] } },
      } as unknown as ScreenConfiguration,
    });
    const notSignedIn = { id: 'family', name: 'Family', ok: false, messageKey: 'googleNotSignedIn', fetchedAt: Date.now() - 60_000 };
    const updated = { id: 'family', name: 'Family', ok: true, fetchedAt: Date.now() };
    let signedIn = false;
    editorFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/auth/google/status') return jsonResponse({ connected: false, credentialsConfigured: true, mode: 'own' });
      if (url === '/api/auth/google/device' && init?.method === 'POST') {
        return jsonResponse({ user_code: 'WXCP-RMTQ', verification_url: 'https://www.google.com/device', device_code: 'dc', interval: 5, expires_in: 1800 });
      }
      if (url === '/api/auth/google/device') {
        signedIn = true;
        return jsonResponse({ status: 'success' });
      }
      if (url === '/api/calendars') return jsonResponse([{ id: 'family', summary: 'Family', backgroundColor: '#88c', primary: false }]);
      // The latest status any display fetch recorded: still the one from before the sign-in.
      if (url === '/api/calendar/status') return jsonResponse({ sourceStatus: [notSignedIn] });
      if (url.startsWith('/api/calendar')) return jsonResponse({ events: [], sourceStatus: [signedIn ? updated : notSignedIn] });
      if (url.startsWith('/api/holidays')) return jsonResponse([]);
      if (url === '/api/icloud/accounts') return jsonResponse([]);
      return jsonResponse({});
    });
    try {
      const view = render(<CalendarSection values={{ ...values, selectedCalendarIds: ['family'] }} onChange={vi.fn()} />, { wrapper: Wrapper });
      await act(async () => {});
      fireEvent.click(view.getByRole('button', { name: 'Sign in with Google' }));
      await act(async () => {});
      expect(view.getByText('WXCP-RMTQ')).toBeTruthy();

      await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });

      expect(view.getByText('Family')).toBeTruthy();
      expect(view.container.querySelector('[data-source-health="ok"]')).toBeTruthy();
      expect(view.container.querySelector('[data-source-health="failing"]')).toBeNull();
      const reads = editorFetch.mock.calls.map(([url]) => url as string).filter((url) => url.startsWith('/api/calendar?') || url === '/api/calendar');
      expect(reads).toHaveLength(1);
    } finally {
      vi.useRealTimers();
      useEditorStore.setState({ config: null });
    }
  });
});
