// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { ScreenConfiguration } from '@/types/config';
import { I18nProvider } from '@/i18n/provider';
import { useEditorStore } from '@/stores/editor-store';
import enUSEditor from '@/translations/en-US/editor.json';
import BackgroundPicker from '../BackgroundPicker';

// The checklist needs every source's key status; stub it so `icloud` and
// `local` (no key required) sit alongside a `false` for the keyed ones —
// exercising the checklist without pulling in a real /api/secrets round trip.
vi.mock('@/hooks/useSecretStatus', () => ({
  useSecretStatus: () => ({
    status: { unsplash_access_key: true, nasa_api_key: false, immich_api_key: false, immich_url: false },
    loading: false,
    error: false,
    hasStatus: true,
    refetch: () => {},
  }),
}));

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locale="en-US" blob={{ editor: enUSEditor }}>
      {children}
    </I18nProvider>
  );
}

function seedStore(backgroundRotation: ScreenConfiguration['screens'][number]['backgroundRotation']): void {
  const config: ScreenConfiguration = {
    version: 14,
    settings: {
      rotationIntervalMs: 30000,
      displayWidth: 1080,
      displayHeight: 1920,
      latitude: 0,
      longitude: 0,
      weather: { provider: 'weatherapi', latitude: 0, longitude: 0, units: 'imperial' },
      calendar: { googleCalendarId: '', googleCalendarIds: [], icalSources: [], daysAhead: 7 },
    },
    screens: [{ id: 'screen-1', name: 'Screen 1', backgroundImage: '', modules: [], backgroundRotation }],
  };

  useEditorStore.setState({
    config,
    selectedDisplayId: null,
    selectedScreenId: 'screen-1',
  });
}

function currentRotation() {
  return useEditorStore.getState().config?.screens[0].backgroundRotation;
}

afterEach(() => {
  cleanup();
  useEditorStore.setState({ config: null, selectedDisplayId: null, selectedScreenId: null });
});

describe('BackgroundPicker — sources group always visible (item 1/2)', () => {
  it('shows Shade before Sources because it applies to every background, not one source', () => {
    seedStore({ sources: [], query: '', intervalMinutes: 60 } as never);
    const { container } = render(<BackgroundPicker />, { wrapper: Wrapper });

    const text = container.textContent ?? '';
    expect(text.indexOf(enUSEditor.backgroundPicker.shadeGroup)).toBeGreaterThanOrEqual(0);
    expect(text.indexOf(enUSEditor.backgroundPicker.sourcesGroup)).toBeGreaterThanOrEqual(0);
    expect(text.indexOf(enUSEditor.backgroundPicker.shadeGroup)).toBeLessThan(text.indexOf(enUSEditor.backgroundPicker.sourcesGroup));
  });

  it('shows the Sources group and every source checkbox even with zero sources checked', () => {
    seedStore({ sources: [], query: '', intervalMinutes: 60 } as never);
    const { container, getByText } = render(<BackgroundPicker />, { wrapper: Wrapper });

    expect(getByText(enUSEditor.backgroundPicker.sourcesGroup)).not.toBeNull();
    const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
    // unsplash, nasa-apod, immich, icloud, local — none checked yet.
    expect(checkboxes.length).toBeGreaterThanOrEqual(5);
    expect(checkboxes.every((cb) => !cb.checked)).toBe(true);
  });

  it('the refresh button is disabled with zero sources and enabled once one is checked', () => {
    seedStore({ sources: [], query: '', intervalMinutes: 60 } as never);
    const { container } = render(<BackgroundPicker />, { wrapper: Wrapper });

    const refreshBtn = container.querySelector('[data-testid="background-rotation-refresh"]') as HTMLButtonElement;
    expect(refreshBtn.disabled).toBe(true);

    const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
    const localCheckbox = checkboxes.find((cb) => cb.closest('label')?.textContent?.includes(enUSEditor.backgroundPicker.sources.local));
    fireEvent.click(localCheckbox!);

    expect(refreshBtn.disabled).toBe(false);
  });
});

describe('BackgroundPicker — multi-source rotation checklist', () => {
  it('checking a second source shows its settings block without touching the first', () => {
    seedStore({ enabled: true, sources: ['icloud'], query: '', intervalMinutes: 60, icloudAlbumUrl: 'https://www.icloud.com/sharedalbum/#existing' });
    const { container } = render(<BackgroundPicker />, { wrapper: Wrapper });

    // iCloud's settings (the album URL input) are already showing.
    const icloudInput = container.querySelector('input[type="url"]') as HTMLInputElement;
    expect(icloudInput).not.toBeNull();
    expect(icloudInput.value).toBe('https://www.icloud.com/sharedalbum/#existing');

    // Check the local-library checkbox too (unlocked, no key needed).
    const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
    const localCheckbox = checkboxes.find((cb) => cb.closest('label')?.textContent?.includes(enUSEditor.backgroundPicker.sources.local));
    expect(localCheckbox).toBeDefined();
    fireEvent.click(localCheckbox!);

    // Both sources are now checked, and iCloud's own field is untouched.
    const rotation = currentRotation();
    expect(rotation?.sources).toEqual(['icloud', 'local']);
    expect(rotation?.icloudAlbumUrl).toBe('https://www.icloud.com/sharedalbum/#existing');

    // The local folder picker's own block rendered too.
    expect(container.textContent).toContain(enUSEditor.backgroundPicker.local.folderLabel);
  });

  it('unchecking a source removes only that id from the array', () => {
    seedStore({
      enabled: true,
      sources: ['icloud', 'local'],
      query: '',
      intervalMinutes: 60,
      icloudAlbumUrl: 'https://www.icloud.com/sharedalbum/#keep',
      localFolder: 'vacation',
    });
    const { container } = render(<BackgroundPicker />, { wrapper: Wrapper });

    const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
    const localCheckbox = checkboxes.find((cb) => cb.closest('label')?.textContent?.includes(enUSEditor.backgroundPicker.sources.local));
    expect(localCheckbox?.checked).toBe(true);
    fireEvent.click(localCheckbox!);

    const rotation = currentRotation();
    expect(rotation?.sources).toEqual(['icloud']);
    // The remaining source's own settings are untouched.
    expect(rotation?.icloudAlbumUrl).toBe('https://www.icloud.com/sharedalbum/#keep');
    // The removed source's setting value is preserved on the object even
    // though it's no longer shown — unchecking only edits `sources`.
    expect(rotation?.localFolder).toBe('vacation');
  });
});

describe('BackgroundPicker — Unsplash query/collections toggle', () => {
  it('switching to collections mode and back preserves both the query text and the collection rows', () => {
    seedStore({
      enabled: true,
      sources: ['unsplash'],
      query: 'space',
      intervalMinutes: 60,
    });
    const { container } = render(<BackgroundPicker />, { wrapper: Wrapper });

    // Starts in query mode with the existing query shown.
    const queryInput = () => container.querySelector('input[placeholder]') as HTMLInputElement | null;
    expect(queryInput()?.value).toBe('space');

    // Switch to collections mode and enter one collection id.
    const modeButtons = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[];
    const collectionsBtn = modeButtons.find((b) => b.textContent === enUSEditor.backgroundPicker.unsplash.modeCollections)!;
    fireEvent.click(collectionsBtn);

    let rotation = currentRotation();
    expect(rotation?.unsplashMode).toBe('collections');
    // The query text is still on the object even though its field isn't shown.
    expect(rotation?.query).toBe('space');

    const collectionInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(collectionInput, { target: { value: 'abc123' } });
    fireEvent.blur(collectionInput, { target: { value: 'abc123' } });

    rotation = currentRotation();
    expect(rotation?.unsplashCollections).toEqual(['abc123']);

    // Switch back to query mode: the collection just entered must NOT be
    // discarded, only hidden — this was the bug where the toggle nulled out
    // `unsplashCollections` whenever query mode was selected.
    const queryBtn = modeButtons.find((b) => b.textContent === enUSEditor.backgroundPicker.unsplash.modeQuery)!;
    fireEvent.click(queryBtn);

    rotation = currentRotation();
    expect(rotation?.unsplashMode).toBe('query');
    expect(rotation?.unsplashCollections).toEqual(['abc123']);
    expect(rotation?.query).toBe('space');
    expect(queryInput()?.value).toBe('space');
  });
});
