// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nProvider } from '@/i18n/provider';
import type { MediaInventory } from '@/lib/media-inventory';

const confirmState = vi.hoisted(() => ({ ask: vi.fn() }));
vi.mock('@/stores/confirm-store', () => ({
  useConfirmStore: { getState: () => ({ confirm: confirmState.ask }) },
}));

const editorFetch = vi.fn();
vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: (...args: unknown[]) => editorFetch(...args),
  isSessionExpired: () => false,
}));

import MediaLibraryPage, { formatBytes } from '../MediaLibraryPage';

/**
 * Placeholder-only templates for the two keys whose runtime values the tests
 * must see surface (usage names, refused filenames). Everything else stays
 * untranslated so t() returns the key — assertions stay structural and never
 * pin English copy. Task 6 replaces these templates with real strings.
 */
const BLOB = {
  editor: {
    settings: {
      mediaPage: {
        kind: { screen: '{name}', dayRule: '{name}', module: '{name}', other: '{name}' },
        refused: '{file}',
      },
    },
  },
};

function Wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider locale="en-US" blob={BLOB}>{children}</I18nProvider>;
}

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Root has an image, a video and an svg; nature holds two images and a mov. */
function seedInventory(): MediaInventory {
  return {
    items: [
      { path: 'clips/walk.mp4', kind: 'video', bytes: 5184000 },
      { path: 'lake_sunset.jpg', kind: 'image', bytes: 5344000, width: 4032, height: 3024 },
      { path: 'nature/foggy_ridge.webp', kind: 'image', bytes: 1994000, width: 2560, height: 1440 },
      { path: 'nature/forest_morning.jpg', kind: 'image', bytes: 5033000, width: 4032, height: 3024 },
      { path: 'nature/sledding.mov', kind: 'video', bytes: 112000000 },
      { path: 'waves.svg', kind: 'image', bytes: 12000, width: 1200, height: 800 },
    ],
    directories: [
      { name: 'clips', path: 'clips', count: 1 },
      { name: 'nature', path: 'nature', count: 3 },
    ],
    usage: {
      'nature/forest_morning.jpg': [
        { kind: 'screen', name: 'Hall', configPath: 'screens[0].backgroundImage' },
      ],
      'clips/walk.mp4': [
        { kind: 'module', name: 'Den', configPath: 'screens[1].modules[0].config.file' },
      ],
    },
  };
}

/**
 * Wire editorFetch: inventory GETs read live state (successful DELETEs drop
 * the file from subsequent inventories), DELETE answers 409 for paths listed
 * in `refuse`, POST uploads succeed.
 */
function mockApi(refuse: string[] = []) {
  const inv = seedInventory();
  editorFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === '/api/backgrounds/inventory') return jsonRes(inv);
    if (init?.method === 'DELETE') {
      const body = JSON.parse(String(init.body)) as { file: string; directory?: string };
      const path = body.directory ? `${body.directory}/${body.file}` : body.file;
      if (refuse.includes(path)) return jsonRes({ error: 'in use', usage: [] }, 409);
      inv.items = inv.items.filter((i) => i.path !== path);
      return jsonRes({ deleted: body.file });
    }
    if (init?.method === 'POST') return jsonRes({ paths: ['/x'] }, 201);
    return jsonRes({});
  });
}

function inventoryCallCount(): number {
  return editorFetch.mock.calls.filter(([url]) => url === '/api/backgrounds/inventory').length;
}

function tile(path: string): HTMLElement {
  return screen.getByTestId(`media-tile-${path}`);
}

async function renderLoaded() {
  const view = render(<MediaLibraryPage />, { wrapper: Wrapper });
  await waitFor(() => {
    expect(view.container.querySelectorAll('[data-media-path]').length).toBe(6);
  });
  return view;
}

function select(path: string) {
  fireEvent.click(tile(path).querySelector('input[type="checkbox"]')!);
}

beforeEach(() => {
  editorFetch.mockReset();
  confirmState.ask.mockReset();
  confirmState.ask.mockResolvedValue(true);
  mockApi();
});
afterEach(() => cleanup());

describe('MediaLibraryPage — filters', () => {
  it('renders folder chips with live counts and the three kind segments', async () => {
    await renderLoaded();

    const chip = (folder: string) => screen.getByTestId(`media-chip-${folder || 'root'}`);
    expect(chip('all').querySelector('[data-count]')!.textContent).toBe('6');
    expect(chip('nature').querySelector('[data-count]')!.textContent).toBe('3');
    expect(chip('clips').querySelector('[data-count]')!.textContent).toBe('1');
    expect(chip('').querySelector('[data-count]')!.textContent).toBe('2');

    expect(screen.getByTestId('media-kind-all')).toBeTruthy();
    expect(screen.getByTestId('media-kind-image')).toBeTruthy();
    expect(screen.getByTestId('media-kind-video')).toBeTruthy();
  });

  it('filters the grid by folder chip and kind segment together', async () => {
    await renderLoaded();

    fireEvent.click(screen.getByTestId('media-chip-nature'));
    fireEvent.click(screen.getByTestId('media-kind-video'));

    const paths = Array.from(document.querySelectorAll('[data-media-path]'))
      .map((el) => el.getAttribute('data-media-path'));
    expect(paths).toEqual(['nature/sledding.mov']);
    // Chip counts follow the kind filter: only the two videos count now.
    expect(screen.getByTestId('media-chip-all').querySelector('[data-count]')!.textContent).toBe('2');
  });
});

describe('MediaLibraryPage — used files', () => {
  it('locks the checkbox, badges the tile, and popover lists the screen name', async () => {
    await renderLoaded();

    const used = tile('nature/forest_morning.jpg');
    expect(used.querySelector('input[type="checkbox"]')!.hasAttribute('disabled')).toBe(true);
    expect(used.querySelector('[data-in-use]')).toBeTruthy();
    expect(used.querySelector('[data-used-by]')!.textContent).toContain('Hall');

    const unused = tile('lake_sunset.jpg');
    expect(unused.querySelector('input[type="checkbox"]')!.hasAttribute('disabled')).toBe(false);
    expect(unused.querySelector('[data-in-use]')).toBeNull();
  });
});

describe('MediaLibraryPage — load failure', () => {
  it('shows a load-failure line instead of the empty state, and recovers on retry', async () => {
    let fail = true;
    editorFetch.mockImplementation(async (url: string) => {
      if (url === '/api/backgrounds/inventory') {
        return fail ? jsonRes({ error: 'boom' }, 500) : jsonRes(seedInventory());
      }
      return jsonRes({});
    });

    const view = render(<MediaLibraryPage />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('media-load-error')).toBeTruthy());
    // A failed load must not read as an empty library.
    expect(view.container.querySelector('[data-testid="media-empty"]')).toBeNull();
    expect(view.container.querySelectorAll('[data-media-path]')).toHaveLength(0);

    fail = false;
    fireEvent.click(screen.getByTestId('media-retry-button'));
    await waitFor(() => {
      expect(view.container.querySelectorAll('[data-media-path]')).toHaveLength(6);
    });
    expect(screen.queryByTestId('media-load-error')).toBeNull();
  });
});

describe('MediaLibraryPage — delete', () => {
  it('keeps the selection and sends no DELETE when the confirm is cancelled', async () => {
    confirmState.ask.mockResolvedValue(false);
    await renderLoaded();

    select('lake_sunset.jpg');
    select('waves.svg');
    fireEvent.click(screen.getByTestId('media-delete-button'));

    await waitFor(() => expect(confirmState.ask).toHaveBeenCalledTimes(1));
    expect(editorFetch.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(0);
    // Selection survives the cancel, so Delete stays armed.
    expect(screen.getByTestId('media-delete-button').hasAttribute('disabled')).toBe(false);
    expect((tile('lake_sunset.jpg').querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(true);
  });

  it('splits a nested path into file plus directory in the DELETE body', async () => {
    await renderLoaded();

    select('nature/foggy_ridge.webp');
    fireEvent.click(screen.getByTestId('media-delete-button'));

    await waitFor(() => {
      expect(screen.queryByTestId('media-tile-nature/foggy_ridge.webp')).toBeNull();
    });
    const deletes = editorFetch.mock.calls.filter(([, init]) => init?.method === 'DELETE');
    expect(deletes).toHaveLength(1);
    expect(JSON.parse(String(deletes[0][1]!.body))).toEqual({
      file: 'foggy_ridge.webp',
      directory: 'nature',
    });
  });

  it('deletes each selected file sequentially and refetches the inventory', async () => {
    await renderLoaded();
    const deleteButton = screen.getByTestId('media-delete-button');
    expect(deleteButton.hasAttribute('disabled')).toBe(true);

    select('lake_sunset.jpg');
    select('waves.svg');
    expect(deleteButton.hasAttribute('disabled')).toBe(false);

    fireEvent.click(deleteButton);
    await waitFor(() => expect(confirmState.ask).toHaveBeenCalledTimes(1));
    expect(confirmState.ask.mock.calls[0][0]).toMatchObject({ variant: 'danger' });

    const deletes = editorFetch.mock.calls.filter(([, init]) => init?.method === 'DELETE');
    expect(deletes).toHaveLength(2);
    expect(JSON.parse(String(deletes[0][1]!.body))).toEqual({ file: 'lake_sunset.jpg' });
    expect(JSON.parse(String(deletes[1][1]!.body))).toEqual({ file: 'waves.svg' });

    await waitFor(() => {
      expect(screen.queryByTestId('media-tile-lake_sunset.jpg')).toBeNull();
      expect(screen.queryByTestId('media-tile-waves.svg')).toBeNull();
    });
    expect(inventoryCallCount()).toBe(2);
    expect(deleteButton.hasAttribute('disabled')).toBe(true);
  });

  it('keeps a 409-refused file, drops the others, and names the refused file', async () => {
    mockApi(['waves.svg']);
    await renderLoaded();

    select('lake_sunset.jpg');
    select('waves.svg');
    fireEvent.click(screen.getByTestId('media-delete-button'));

    await waitFor(() => {
      expect(screen.queryByTestId('media-tile-lake_sunset.jpg')).toBeNull();
    });
    expect(screen.getByTestId('media-tile-waves.svg')).toBeTruthy();
    const refused = screen.getByTestId('media-refused');
    expect(refused.textContent).toContain('waves.svg');
    expect(refused.textContent).not.toContain('lake_sunset.jpg');
  });
});

describe('MediaLibraryPage — upload', () => {
  it('posts every picked file and the chosen directory in one request, then refetches', async () => {
    await renderLoaded();

    fireEvent.click(screen.getByTestId('media-upload-button'));
    const panel = screen.getByTestId('media-upload-panel');
    fireEvent.change(panel.querySelector('[data-upload-directory]')!, { target: { value: 'nature' } });

    const files = [
      new File(['aaaa'], 'a.jpg', { type: 'image/jpeg' }),
      new File(['bbbb'], 'b.png', { type: 'image/png' }),
    ];
    fireEvent.change(panel.querySelector('[data-file-input]')!, { target: { files } });

    await waitFor(() => expect(inventoryCallCount()).toBe(2));
    const posts = editorFetch.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts).toHaveLength(1);
    const [url, init] = posts[0];
    expect(url).toBe('/api/backgrounds');
    expect(init!.body).toBeInstanceOf(FormData);
    const body = init!.body as FormData;
    expect(body.getAll('file').map((f) => (f as File).name)).toEqual(['a.jpg', 'b.png']);
    expect(body.get('directory')).toBe('nature');
    // The panel closes on success.
    expect(screen.queryByTestId('media-upload-panel')).toBeNull();
  });

  it('surfaces the server error inline and keeps the panel open on failure', async () => {
    await renderLoaded();
    editorFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return jsonRes({ error: 'Invalid file type: c.gif' }, 400);
      if (url === '/api/backgrounds/inventory') return jsonRes(seedInventory());
      return jsonRes({});
    });

    fireEvent.click(screen.getByTestId('media-upload-button'));
    const panel = screen.getByTestId('media-upload-panel');
    fireEvent.change(panel.querySelector('[data-file-input]')!, {
      target: { files: [new File(['cccc'], 'c.gif', { type: 'image/gif' })] },
    });

    await waitFor(() => expect(screen.getByTestId('media-upload-error').textContent).toContain('c.gif'));
    expect(screen.getByTestId('media-upload-panel')).toBeTruthy();
    expect(inventoryCallCount()).toBe(1);
  });
});

describe('formatBytes', () => {
  it('formats with 1 KB = 1000 B, one decimal under ten of a unit', () => {
    expect(formatBytes(900)).toBe('900 B');
    expect(formatBytes(48213)).toBe('48 KB');
    expect(formatBytes(5184000)).toBe('5.2 MB');
    expect(formatBytes(112000000)).toBe('112 MB');
    expect(formatBytes(1200000000)).toBe('1.2 GB');
    // A missing byte count renders an em dash, never "NaN B".
    expect(formatBytes(Number.NaN)).toBe('—');
    expect(formatBytes(undefined as unknown as number)).toBe('—');
  });
});
