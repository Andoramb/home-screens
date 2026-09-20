// @vitest-environment jsdom

/**
 * The phone-bookmark hint renders a real address.
 *
 * It used to read "For phone bookmarks, append ?token=TOKEN to command URLs",
 * which never said what a command URL was and gave nothing to copy. The link
 * is now built from this hub's own origin, with the key filled in once it has
 * been revealed and a stand-in before that.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import React from 'react';

const mocks = vi.hoisted(() => ({
  displayFetch: vi.fn(),
  editorFetch: vi.fn(),
  storeState: { config: { displays: undefined } } as {
    config: { displays?: { id: string; name: string; screens: [] }[] };
  },
}));

vi.mock('@/lib/display-fetch', () => ({
  displayFetch: (...args: unknown[]) => mocks.displayFetch(...args),
}));
vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: (...args: unknown[]) => mocks.editorFetch(...args),
}));
vi.mock('@/stores/editor-store', () => {
  const useEditorStore = (selector?: (state: unknown) => unknown) =>
    (selector ? selector(mocks.storeState) : mocks.storeState);
  useEditorStore.getState = () => mocks.storeState;
  return { useEditorStore };
});

import DisplayTokenPanel from '../SecuritySection/DisplayTokenPanel';
import { I18nProvider } from '@/i18n/provider';
import { __resetOriginForTests } from '@/hooks/useOrigin';
import enUSEditor from '@/translations/en-US/editor.json';

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  __resetOriginForTests();
  mocks.storeState.config = { displays: undefined };
  // The editor is open on the hub's own name here, so useOrigin asks the hub
  // for its LAN address rather than printing "localhost" onto a bookmark.
  mocks.displayFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ origin: 'http://home-screens.local:3000' }),
  });
});

function renderPanel() {
  return render(
    <I18nProvider locale="en-US" blob={{ editor: enUSEditor }}>
      <DisplayTokenPanel token="secret-display-key" onTokenChange={() => {}} />
    </I18nProvider>,
  );
}

describe('the display key panel', () => {
  it('gives the key and the example link each their own handle', async () => {
    // Two code blocks that look alike. Addressing either by its classes is
    // what broke the security E2E spec when the second one arrived.
    const { findByTestId, getByTestId } = renderPanel();

    await findByTestId('display-key-bookmark-url');
    expect(getByTestId('display-key-value').textContent).toContain('secret-d');
    expect(getByTestId('display-key-bookmark-url').textContent).toContain('/api/display/sleep?');
  });

  it('shows a bookmarkable link with a stand-in until the key is revealed', async () => {
    const { findByText, getByText, queryByText } = renderPanel();

    const example = await findByText(/\/api\/display\/sleep\?/);
    // No displays registered: this install's display polls the legacy queue,
    // which is the one a link with no display named reaches.
    expect(example.textContent).toBe('http://home-screens.local:3000/api/display/sleep?token=YOUR-KEY');
    expect(example.textContent).not.toContain('secret-display-key');
    expect(queryByText(/points at/)).toBeNull();

    fireEvent.click(getByText('Reveal'));
    expect(example.textContent).toBe('http://home-screens.local:3000/api/display/sleep?token=secret-display-key');
  });

  it('names the display it controls once displays are registered', async () => {
    mocks.storeState.config = {
      displays: [
        { id: 'main', name: 'Kitchen', screens: [] },
        { id: 'playroom', name: 'Playroom', screens: [] },
      ],
    };
    const { findByText, getByText } = renderPanel();

    const example = await findByText(/\/api\/display\/sleep\?/);
    expect(example.textContent).toBe(
      'http://home-screens.local:3000/api/display/sleep?display=main&token=YOUR-KEY',
    );
    // With more than one display to aim at, the link says which one it hits.
    getByText("This one points at Kitchen. Swap main for another display's id to aim at that one.");
  });

  it('says nothing about aiming when there is only one display', async () => {
    mocks.storeState.config = { displays: [{ id: 'main', name: 'Kitchen', screens: [] }] };
    const { findByText, queryByText } = renderPanel();

    const example = await findByText(/\/api\/display\/sleep\?/);
    expect(example.textContent).toContain('display=main');
    expect(queryByText(/points at/)).toBeNull();
  });
});
