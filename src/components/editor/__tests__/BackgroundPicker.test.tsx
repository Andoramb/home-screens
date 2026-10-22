// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, within, waitFor } from '@testing-library/react';
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
  it('splits into three collapsible sections: theme, background sources, and background effects (shade + effects)', () => {
    seedStore({ sources: [], query: '', intervalMinutes: 60 } as never);
    const { container } = render(<BackgroundPicker />, { wrapper: Wrapper });

    const titles = Array.from(container.querySelectorAll('button[class*="group"] > span.uppercase')).map((el) => el.textContent);
    expect(titles).toEqual([
      enUSEditor.backgroundPicker.groups.theme,
      enUSEditor.backgroundPicker.title,
      enUSEditor.backgroundPicker.effectsTitle,
    ]);
    const text = container.textContent ?? '';
    // Sources come before the effects section, which holds Shade and Effects.
    expect(text.indexOf(enUSEditor.backgroundPicker.sourcesGroup)).toBeLessThan(text.indexOf(enUSEditor.backgroundPicker.shadeGroup));
    expect(text.indexOf(enUSEditor.backgroundPicker.shadeGroup)).toBeLessThan(text.indexOf(enUSEditor.backgroundPicker.effectsGroup));
  });

  it('shows the Sources group and every source checkbox even with zero sources checked', () => {
    seedStore({ sources: [], query: '', intervalMinutes: 60 } as never);
    const { container, getByText } = render(<BackgroundPicker />, { wrapper: Wrapper });

    expect(getByText(enUSEditor.backgroundPicker.sourcesGroup)).not.toBeNull();
    const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
    // Two rotatable bundled groups (colors, patterns; themes are a single choice) plus five providers.
    expect(checkboxes).toHaveLength(7);
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
  it('keeps themes outside Sources, with colors and patterns inside', () => {
    seedStore({ sources: [], query: '', intervalMinutes: 60 });
    const { container } = render(<BackgroundPicker />, { wrapper: Wrapper });
    const headings = Array.from(container.querySelectorAll('h4')).map((h) => h.textContent);
    expect(headings).toEqual([
      enUSEditor.backgroundPicker.sourcesGroup,
      enUSEditor.backgroundPicker.shadeGroup,
      enUSEditor.backgroundPicker.effectsGroup,
    ]);
    const sources = container.querySelectorAll('h4')[0].parentElement!.parentElement!;
    expect(within(sources).queryByTestId('starter-source-theme')).toBeNull();
    expect(within(sources).queryByTestId('starter-background-theme-linen')).toBeNull();
    expect(container.querySelector('[data-testid="theme-backgrounds"] [data-testid="starter-background-theme-linen"]')).not.toBeNull();
    expect(within(sources).getByTestId('starter-source-color')).not.toBeNull();
    expect(within(sources).getByTestId('starter-source-pattern')).not.toBeNull();
    expect(within(sources).queryByRole('checkbox', { name: enUSEditor.backgroundPicker.groups.theme })).toBeNull();
    expect(container.querySelector('[data-testid^="background-tab-"]')).toBeNull();
    expect(container.textContent).not.toContain('Your own pictures');
    expect(container.textContent).not.toContain('Upload Background');
    // Only source-level toggles: no per-tile checkboxes.
    expect(sources.querySelectorAll('input[type="checkbox"]')).toHaveLength(7);
  });

  it('enabling a bundled group selects nothing; tiles then toggle by highlight, with no per-tile checkboxes', () => {
    seedStore({ sources: [], query: '', intervalMinutes: 30 }, '/starter-backgrounds/ocean.svg');
    const { getByRole, getByTestId, getByText, container } = render(<BackgroundPicker />, { wrapper: Wrapper });
    fireEvent.click(getByRole('checkbox', { name: enUSEditor.backgroundPicker.groups.color }));
    expect(currentRotation()?.sources).toEqual(['color']);
    expect(currentRotation()?.starterBackgroundIds?.color ?? []).toEqual([]);
    expect(getByTestId('starter-group-color').textContent).toContain('0/');
    expect(getByText(enUSEditor.backgroundPicker.pickToRotate)).not.toBeNull();
    expect(container.querySelectorAll('[data-testid^="starter-source-color"] input[type="checkbox"]')).toHaveLength(1);

    const tile = container.querySelector('[data-testid^="starter-background-"][aria-label^="Include"]') as HTMLElement;
    expect(tile.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(tile);
    expect(currentRotation()?.starterBackgroundIds?.color).toHaveLength(1);
    expect(tile.getAttribute('aria-pressed')).toBe('true');
    // Selecting a tile in rotation mode never overwrites the fixed background.
    expect(useEditorStore.getState().config!.screens[0].backgroundImage).toBe('/starter-backgrounds/ocean.svg');
    fireEvent.click(tile);
    expect(currentRotation()?.starterBackgroundIds?.color).toEqual([]);
  });

  it('with the group off, a tile is a fixed pick that ends rotation', () => {
    seedStore({ sources: ['icloud'], query: '', intervalMinutes: 30 }, '/starter-backgrounds/ocean.svg');
    const { getByTestId } = render(<BackgroundPicker />, { wrapper: Wrapper });
    fireEvent.click(getByTestId('starter-background-theme-linen'));
    expect(currentRotation()?.sources).toEqual([]);
    expect(useEditorStore.getState().config!.screens[0].backgroundImage).toBe('/starter-backgrounds/theme-linen.svg');
  });

  it('labels the Sources card as fixed or rotating', () => {
    seedStore({ sources: [], query: '', intervalMinutes: 60 });
    const { getByTestId, getByRole } = render(<BackgroundPicker />, { wrapper: Wrapper });
    expect(getByTestId('background-mode').textContent).toBe(enUSEditor.backgroundPicker.modeFixed);
    expect(getByTestId('background-mode').getAttribute('title')).toBe(enUSEditor.backgroundPicker.modeHelp);
    fireEvent.click(getByRole('checkbox', { name: enUSEditor.backgroundPicker.groups.color }));
    expect(getByTestId('background-mode').textContent).toBe(enUSEditor.backgroundPicker.modeRotating);
  });

  it('themes are a single choice: no rotation checkbox, and a tile is always a fixed pick', () => {
    // A `theme` entry left over from when themes were a rotation source is ignored.
    seedStore({ sources: ['theme' as never], query: '', intervalMinutes: 60 }, '/starter-backgrounds/ocean.svg');
    const { getByTestId, queryByRole } = render(<BackgroundPicker />, { wrapper: Wrapper });
    expect(queryByRole('checkbox', { name: enUSEditor.backgroundPicker.groups.theme })).toBeNull();
    // The stale entry does not make the screen look like it rotates.
    expect(getByTestId('background-mode').textContent).toBe(enUSEditor.backgroundPicker.modeFixed);
    const tile = getByTestId('starter-background-theme-linen');
    expect(tile.getAttribute('aria-label')).toBe('Use Linen as a fixed background');
    fireEvent.click(tile);
    expect(useEditorStore.getState().config!.screens[0].backgroundImage).toBe('/starter-backgrounds/theme-linen.svg');
    expect(getByTestId('background-mode').textContent).toBe(enUSEditor.backgroundPicker.modeFixed);
  });

  it('shows a visible hint and a disabled checkbox for sources that are not set up', () => {
    seedStore({ sources: [], query: '', intervalMinutes: 60 });
    const { getByTestId, getByRole } = render(<BackgroundPicker />, { wrapper: Wrapper });
    const immich = getByRole('checkbox', { name: new RegExp(enUSEditor.backgroundPicker.sources.immich) }) as HTMLInputElement;
    expect(immich.disabled).toBe(true);
    expect(immich.closest('label')!.getAttribute('title')).toContain(enUSEditor.backgroundPicker.sources.immich);
    const hint = getByTestId('background-source-not-set-up-immich');
    expect(hint.textContent).toContain(enUSEditor.backgroundPicker.sourceNotSetUp);
    const settingsLink = within(hint).getByTestId('integration-settings-link-immich') as HTMLAnchorElement;
    expect(settingsLink.getAttribute('href')).toContain('integrations.immich');
    expect(settingsLink.textContent).toContain(enUSEditor.backgroundPicker.sources.immich);
    expect(getByTestId('background-source-not-set-up-nasa-apod')).not.toBeNull();
  });

  it('lets a stale, already-enabled source that lost its key be turned off', () => {
    seedStore({ sources: ['immich'], query: '', intervalMinutes: 60 });
    const { getByRole, getByTestId } = render(<BackgroundPicker />, { wrapper: Wrapper });
    const immich = getByRole('checkbox', { name: new RegExp(enUSEditor.backgroundPicker.sources.immich) }) as HTMLInputElement;
    expect(immich.disabled).toBe(false);
    expect(getByTestId('background-source-key-missing')).not.toBeNull();
    fireEvent.click(immich);
    expect(currentRotation()?.sources).toEqual([]);
  });

  it('choosing a fixed wall then None ends rotation and retains other rotation settings', () => {
    seedStore({ enabled: true, sources: ['icloud', 'local'], query: '', intervalMinutes: 30, localFolder: 'holiday' }, '/starter-backgrounds/ocean.svg');
    const { getByTestId } = render(<BackgroundPicker />, { wrapper: Wrapper });
    fireEvent.click(getByTestId('starter-background-theme-linen'));
    let screen = useEditorStore.getState().config!.screens[0];
    expect(screen.backgroundImage).toBe('/starter-backgrounds/theme-linen.svg');
    expect(screen.backgroundRotation).toMatchObject({ sources: [], localFolder: 'holiday', intervalMinutes: 30 });
    expect(screen.backgroundRotation).not.toHaveProperty('enabled');
    fireEvent.click(getByTestId('starter-background-none'));
    screen = useEditorStore.getState().config!.screens[0];
    expect(screen.backgroundImage).toBe('');
    expect(screen.backgroundRotation?.sources).toEqual([]);
  });

  it('None disables rotation even when no fixed image was set', () => {
    seedStore({ enabled: true, sources: ['icloud'], query: '', intervalMinutes: 60 });
    const { getByTestId, getByText } = render(<BackgroundPicker />, { wrapper: Wrapper });
    fireEvent.click(getByText(enUSEditor.backgroundPicker.groups.color).closest('label')!.querySelector('input')!);
    expect(getByTestId('starter-background-none').getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(getByTestId('starter-background-none'));
    expect(useEditorStore.getState().config!.screens[0].backgroundRotation?.sources).toEqual([]);
  });
});

describe('BackgroundPicker — Local library', () => {
  const LIBRARY = ['/api/backgrounds/serve?file=a.jpg', '/api/backgrounds/serve?file=b.jpg'];

  function stubLibrary(onUpload?: () => Response) {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return onUpload ? onUpload() : new Response('{}');
      if (init?.method === 'HEAD') return new Response(null, { status: 200 });
      return new Response(JSON.stringify(url.startsWith('/api/backgrounds') ? LIBRARY : []));
    }));
  }
  afterEach(() => { vi.unstubAllGlobals(); });

  it('offers a folder or pictures; pictures start with nothing chosen', async () => {
    stubLibrary();
    seedStore({ sources: ['local'], query: '', intervalMinutes: 60 });
    const { getByTestId, findAllByTestId, getByText } = render(<BackgroundPicker />, { wrapper: Wrapper });
    expect(getByTestId('local-mode-folder').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(getByTestId('local-mode-images'));
    expect(currentRotation()?.localMode).toBe('images');
    const tiles = await findAllByTestId('local-picture');
    expect(tiles).toHaveLength(2);
    expect(tiles.every((tile) => tile.getAttribute('aria-pressed') === 'false')).toBe(true);
    expect(getByText(enUSEditor.backgroundPicker.local.upload)).not.toBeNull();
  });

  it('tapping pictures adds and removes them, like the color walls', async () => {
    stubLibrary();
    seedStore({ sources: ['local'], query: '', intervalMinutes: 60, localMode: 'images' });
    const { findAllByTestId } = render(<BackgroundPicker />, { wrapper: Wrapper });
    const tiles = await findAllByTestId('local-picture');
    fireEvent.click(tiles[0]);
    expect(currentRotation()?.localImages).toEqual([LIBRARY[0]]);
    fireEvent.click(tiles[1]);
    expect(currentRotation()?.localImages).toEqual(LIBRARY);
    fireEvent.click(tiles[0]);
    expect(currentRotation()?.localImages).toEqual([LIBRARY[1]]);
    // The folder setting is kept for when the user switches back.
    expect(currentRotation()?.localMode).toBe('images');
  });

  it('an uploaded picture joins the library and is chosen', async () => {
    stubLibrary(() => new Response(JSON.stringify({ path: '/api/backgrounds/serve?file=new.jpg' })));
    seedStore({ sources: ['local'], query: '', intervalMinutes: 60, localMode: 'images' });
    const { container, findAllByTestId } = render(<BackgroundPicker />, { wrapper: Wrapper });
    await findAllByTestId('local-picture');
    const input = container.querySelector('[data-testid="local-pictures"] input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'new.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(currentRotation()?.localImages).toEqual(['/api/backgrounds/serve?file=new.jpg']));
    expect((await findAllByTestId('local-picture'))).toHaveLength(3);
  });

  it('iCloud says it is not active until a valid album link is pasted', () => {
    seedStore({ sources: ['icloud'], query: '', intervalMinutes: 60 });
    const { queryByTestId, container } = render(<BackgroundPicker />, { wrapper: Wrapper });
    expect(queryByTestId('icloud-needs-link')).not.toBeNull();
    const input = container.querySelector('input[type="url"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'https://www.icloud.com/sharedalbum/#B0aGdXWuDG1PYBr' } });
    expect(queryByTestId('icloud-needs-link')).toBeNull();
  });
});

describe('BackgroundPicker — effects', () => {
  it('edits effect sliders directly without a preset picker', () => {
    seedStore({ sources: [], query: '', intervalMinutes: 60 } as never);
    const { getByText, queryByRole } = render(<BackgroundPicker />, { wrapper: Wrapper });

    expect(queryByRole('combobox', { name: /preset/i })).toBeNull();

    const warmthSlider = getByText(enUSEditor.backgroundPicker.effectsWarmthLabel).closest('label')!.querySelector('input[type="range"]') as HTMLInputElement;
    fireEvent.change(warmthSlider, { target: { value: '12' } });

    expect(useEditorStore.getState().config?.screens[0].effects).toEqual({
      brightness: 100, contrast: 100, saturation: 100, warmth: 12,
    });
  });

  it('resets an individual effect slider from the right-side reset button', () => {
    seedStore({ sources: [], query: '', intervalMinutes: 60 } as never);
    const { getByText, getByLabelText } = render(<BackgroundPicker />, { wrapper: Wrapper });

    const warmthSlider = getByText(enUSEditor.backgroundPicker.effectsWarmthLabel).closest('label')!.querySelector('input[type="range"]') as HTMLInputElement;
    fireEvent.change(warmthSlider, { target: { value: '12' } });
    fireEvent.click(getByLabelText(`Reset ${enUSEditor.backgroundPicker.effectsWarmthLabel}`));

    expect(useEditorStore.getState().config?.screens[0].effects).toEqual({
      brightness: 100, contrast: 100, saturation: 100, warmth: 0,
    });
  });
});
