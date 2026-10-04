// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, within } from '@testing-library/react';
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

function seedStore(backgroundRotation: ScreenConfiguration['screens'][number]['backgroundRotation'], backgroundImage = ''): void {
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
    screens: [{ id: 'screen-1', name: 'Screen 1', backgroundImage, modules: [], backgroundRotation }],
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

describe('BackgroundPicker — shade color semantics', () => {
  it('color swatch writes an opaque shade color so visibility is controlled by strength, not embedded alpha', () => {
    seedStore({ sources: [], query: '', intervalMinutes: 60 } as never);
    useEditorStore.getState().updateScreenShade('screen-1', {
      enabled: true,
      style: 'topBottom',
      strength: 60,
      color: 'rgba(26, 26, 26, 0)',
    } as never);

    const { container } = render(<BackgroundPicker />, { wrapper: Wrapper });

    const colorInputs = Array.from(container.querySelectorAll('input[type="color"]')) as HTMLInputElement[];
    const shadeColor = colorInputs[colorInputs.length - 1];
    fireEvent.change(shadeColor, { target: { value: '#112233' } });

    expect(useEditorStore.getState().config?.screens[0].shade?.color).toBe('#112233');
  });
});


describe('BackgroundPicker — unified Sources', () => {
  it('keeps only Shade and Sources cards, with all bundled groups inside Sources', () => {
    seedStore({ sources: [], query: '', intervalMinutes: 60 });
    const { container } = render(<BackgroundPicker />, { wrapper: Wrapper });
    const headings = Array.from(container.querySelectorAll('h4')).map((h) => h.textContent);
    expect(headings).toEqual([enUSEditor.backgroundPicker.shadeGroup, enUSEditor.backgroundPicker.sourcesGroup]);
    const sources = container.querySelectorAll('h4')[1].parentElement!.parentElement!;
    expect(within(sources).getByTestId('starter-group-theme')).not.toBeNull();
    expect(within(sources).getByTestId('starter-group-color')).not.toBeNull();
    expect(within(sources).getByTestId('starter-group-pattern')).not.toBeNull();
    expect(within(sources).getByTestId('starter-background-theme-linen').getAttribute('data-in-use')).toBe('true');
    expect(container.querySelector('[data-testid^="background-tab-"]')).toBeNull();
    expect(container.textContent).not.toContain('Your own pictures');
    expect(container.textContent).not.toContain('Upload Background');
    expect(sources.querySelectorAll('input[type="checkbox"]')).toHaveLength(5);
  });

  it('choosing a wall then None disables rotation and retains other rotation settings', () => {
    seedStore({ enabled: true, sources: ['icloud', 'local'], query: '', intervalMinutes: 30, localFolder: 'holiday' }, '/starter-backgrounds/ocean.svg');
    const { getByTestId } = render(<BackgroundPicker />, { wrapper: Wrapper });
    const theme = getByTestId('starter-background-theme-linen');
    fireEvent.click(theme);
    let screen = useEditorStore.getState().config!.screens[0];
    expect(screen.backgroundImage).toBe('/starter-backgrounds/theme-linen.svg');
    expect(screen.backgroundRotation).toMatchObject({ enabled: false, sources: [], localFolder: 'holiday', intervalMinutes: 30 });
    expect(theme.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(getByTestId('starter-background-none'));
    screen = useEditorStore.getState().config!.screens[0];
    expect(screen.backgroundImage).toBe('');
    expect(screen.backgroundRotation?.sources).toEqual([]);
    expect(getByTestId('starter-background-none').getAttribute('aria-pressed')).toBe('true');
  });

  it('None disables rotation even when no fixed image was set', () => {
    seedStore({ enabled: true, sources: ['icloud'], query: '', intervalMinutes: 60 });
    const { getByTestId } = render(<BackgroundPicker />, { wrapper: Wrapper });
    expect(getByTestId('starter-background-none').getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(getByTestId('starter-background-none'));
    expect(useEditorStore.getState().config!.screens[0].backgroundRotation?.sources).toEqual([]);
  });
});
