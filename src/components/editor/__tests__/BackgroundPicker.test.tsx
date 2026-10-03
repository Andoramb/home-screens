// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { ScreenConfiguration } from '@/types/config';
import { I18nProvider } from '@/i18n/provider';
import { useEditorStore } from '@/stores/editor-store';
import enUSEditor from '@/translations/en-US/editor.json';
import BackgroundPicker from '../BackgroundPicker';
import { starterBackgroundsIn } from '@/lib/starter-backgrounds';

// Keep this focused on the editor-to-modal handoff. The modal's library hook
// is exercised separately; here it just supplies the props and bundled tiles.
vi.mock('@/hooks/useImageLibrary', () => ({
  useImageLibrary: () => ({
    directories: [], selectedDir: '', setSelectedDir: () => {}, loadingDirs: false,
    items: [], selectedImage: null, setSelectedImage: () => {}, loadingImages: false,
    uploading: false, uploadProgress: '', error: null, setError: () => {},
    newFolderName: '', setNewFolderName: () => {}, showNewFolder: false, setShowNewFolder: () => {},
    deletingImage: null, handleUpload: () => {}, handleDeleteImage: () => {},
    handleCreateFolder: () => {}, handleDeleteFolder: () => {}, refresh: () => {},
    fileInputRef: { current: null }, newFolderInputRef: { current: null },
  }),
}));

vi.mock('@/hooks/useEscapeKey', () => ({ useEscapeKey: () => {} }));

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

describe('BackgroundPicker — single media picker', () => {
  it('has one fixed-image entry and opens the virtual built-in folder in place of the local library grid, without remote fixed-image tabs', () => {
    seedStore({ sources: [], query: '', intervalMinutes: 60 });
    const { container } = render(<BackgroundPicker />, { wrapper: Wrapper });
    expect(container.textContent).not.toContain('Pick one fixed image below');
    expect(container.querySelector('[data-testid^="background-tab-"]')).toBeNull();
    expect(screen.getAllByRole('button', { name: enUSEditor.backgroundPicker.pickMedia })).toHaveLength(1);
    expect(container.querySelector('[data-testid="starter-group-theme"]')).toBeNull();

    fireEvent.click(screen.getByText(enUSEditor.backgroundPicker.pickMedia));
    const dialog = screen.getByRole('dialog');
    expect(dialog).not.toBeNull();
    const folder = screen.getByTestId('built-in-backgrounds-folder');
    expect(folder.textContent).toBe(enUSEditor.imageBrowserModal.builtInBackgrounds);
    expect(folder.getAttribute('aria-current')).toBe('page');
    expect(dialog.querySelectorAll('[data-testid="starter-background-collection"]')).toHaveLength(1);
    expect(dialog.querySelector('[data-testid="local-library-media-grid"]')).toBeNull();
    const localPanel = dialog.querySelector('[data-testid="built-in-backgrounds-view"]')!;
    fireEvent.click(screen.getByRole('button', { name: /^All Photos/ }));
    expect(dialog.querySelector('[data-testid="starter-background-collection"]')).toBeNull();
    expect(dialog.querySelector('[data-testid="local-library-media-grid"]')).not.toBeNull();
    fireEvent.click(folder);
    expect(dialog.querySelectorAll('[data-testid="starter-background-collection"]')).toHaveLength(1);
    expect(dialog.querySelector('[data-testid="local-library-media-grid"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'NASA' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Immich' })).toBeNull();
    for (const group of ['theme', 'color', 'pattern']) {
      expect(localPanel.querySelector(`[data-testid="starter-group-${group}"]`)).not.toBeNull();
    }
  });

  it('picking a bundled wallpaper saves the path and disables active rotation', () => {
    seedStore({ enabled: true, sources: ['local'], query: '', intervalMinutes: 60 });
    render(<BackgroundPicker />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText(enUSEditor.backgroundPicker.pickMedia));
    const path = starterBackgroundsIn('color')[0].path;
    fireEvent.click(screen.getByTestId(`starter-background-${starterBackgroundsIn('color')[0].id}`));
    expect(useEditorStore.getState().config?.screens[0].backgroundImage).toBe(path);
    expect(currentRotation()?.sources).toEqual([]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('picking the solid background also disables active rotation', () => {
    seedStore({ enabled: true, sources: ['local'], query: '', intervalMinutes: 60 });
    render(<BackgroundPicker />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText(enUSEditor.backgroundPicker.pickMedia));
    fireEvent.click(screen.getByTestId('starter-background-none'));
    expect(useEditorStore.getState().config?.screens[0].backgroundImage).toBe('');
    expect(currentRotation()?.sources).toEqual([]);
  });

  it('does not apply an old modal choice to a newly selected display', () => {
    seedStore({ enabled: true, sources: ['local'], query: '', intervalMinutes: 60 });
    useEditorStore.setState((state) => ({
      config: { ...state.config!, displays: [{
        id: 'other-display', name: 'Other display', screens: [{
          id: 'screen-1', name: 'Other screen', backgroundImage: '', modules: [],
        }],
      }] },
    }));
    render(<BackgroundPicker />, { wrapper: Wrapper });
    fireEvent.click(screen.getByText(enUSEditor.backgroundPicker.pickMedia));
    // Switching displays can leave the same selected screen id temporarily in
    // place; a stale picker must not modify that display's screen.
    useEditorStore.setState({ selectedDisplayId: 'other-display' });
    fireEvent.click(screen.getByTestId('starter-background-ocean'));
    const state = useEditorStore.getState();
    expect(state.config?.screens[0].backgroundImage).toBe('');
    expect(state.config?.displays?.[0].screens[0].backgroundImage).toBe('');
    expect(state.config?.screens[0].backgroundRotation?.sources).toEqual(['local']);
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
