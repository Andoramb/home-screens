// @vitest-environment jsdom

/**
 * The profile chips show what the wall is really showing. While a scheduled
 * profile runs, the manual pick waits for it: the phone used to tick the pick
 * anyway, and a tap toasted "Kitchen is showing all screens" while the wall
 * kept the scheduled screens.
 */

import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import core from '@/translations/en-US/core.json';
import remote from '@/translations/en-US/remote.json';
import { I18nProvider } from '@/i18n/provider';

const fetchMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/editor-fetch', () => ({ editorFetch: fetchMock }));
vi.mock('../../remote-toast', () => ({ showToast: toastMock }));
vi.mock('../../display-target', () => ({ useDisplayTarget: () => ({ target: 'kitchen' }) }));

import ProfileSwitcher from '../ProfileSwitcher';

const PROFILES = [
  { id: 'school', name: 'School' },
  { id: 'evening', name: 'Evening' },
];

function Wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider locale="en-US" blob={{ core, remote }}>{children}</I18nProvider>;
}

function renderSwitcher(activeProfile: string | null, scheduled: boolean) {
  return render(
    <ProfileSwitcher profiles={PROFILES} activeProfile={activeProfile} scheduled={scheduled} displayName="Kitchen" />,
    { wrapper: Wrapper },
  );
}

const chip = (name: string | RegExp) => screen.getByRole('button', { name });

async function tap(name: string | RegExp) {
  await act(async () => { fireEvent.click(chip(name)); });
}

beforeEach(() => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ProfileSwitcher', () => {
  it('ticks the profile the wall is showing and says a schedule chose it', () => {
    renderSwitcher('school', true);
    expect(chip(/School/).getAttribute('aria-pressed')).toBe('true');
    expect(chip('Evening').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('profile-scheduled-note').textContent)
      .toBe('School is on a schedule right now. What you pick here starts when it ends.');
  });

  it('saves a pick during a schedule without claiming the wall switched', async () => {
    renderSwitcher('school', true);
    await tap('Evening');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ profile: 'evening', displayId: 'kitchen' });
    expect(toastMock).toHaveBeenCalledWith('Kitchen will switch to Evening when School ends');
    // The wall keeps the scheduled screens, so the chip does too.
    expect(chip(/School/).getAttribute('aria-pressed')).toBe('true');
    expect(chip('Evening').getAttribute('aria-pressed')).toBe('false');
  });

  it('says All screens waits for the schedule too', async () => {
    renderSwitcher('school', true);
    await tap('All screens');
    expect(toastMock).toHaveBeenCalledWith('Kitchen will show all screens when School ends');
    expect(toastMock).not.toHaveBeenCalledWith('Kitchen is showing all screens');
  });

  it('saves the scheduled profile itself as the pick for after its schedule', async () => {
    // The ticked chip is the scheduled profile, not the saved pick, so a tap
    // on it is a real choice: keep School once its schedule ends.
    renderSwitcher('school', true);
    await tap(/School/);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ profile: 'school', displayId: 'kitchen' });
    expect(toastMock).toHaveBeenCalledWith('Kitchen will keep showing School after its schedule ends');
  });

  it('leaves the active chip alone with no schedule running', async () => {
    renderSwitcher('school', false);
    await tap(/School/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('switches straight away with no schedule running', async () => {
    renderSwitcher('school', false);
    expect(screen.queryByTestId('profile-scheduled-note')).toBeNull();
    await tap('Evening');
    expect(toastMock).toHaveBeenCalledWith('Kitchen switched to Evening');
    expect(chip(/Evening/).getAttribute('aria-pressed')).toBe('true');
  });
});
