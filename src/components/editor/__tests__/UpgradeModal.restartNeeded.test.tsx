// @vitest-environment jsdom

/**
 * The finished update window says when the device still needs a restart.
 *
 * It has no button for it: the page reloads onto the System page as soon as
 * the new version answers, a few seconds later, and that page offers the
 * restart. The line only says what comes next.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import React from 'react';

const mocks = vi.hoisted(() => ({
  editorFetch: vi.fn(),
}));

vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: (...args: unknown[]) => mocks.editorFetch(...args),
  isSessionExpired: () => false,
}));

import UpgradeModal from '../UpgradeModal';
import { I18nProvider } from '@/i18n/provider';
import enUSEditor from '@/translations/en-US/editor.json';
import enUSCore from '@/translations/en-US/core.json';

/** The server's progress stream, driven by the test. */
class FakeEventSource {
  static last: FakeEventSource | null = null;
  listeners = new Map<string, Array<(e: MessageEvent) => void>>();
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeEventSource.last = this;
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data: unknown) {
    for (const fn of this.listeners.get(type) ?? []) fn(new MessageEvent(type, { data: JSON.stringify(data) }));
  }
}

async function renderModal({ isRollback = false }: { isRollback?: boolean } = {}) {
  render(
    <I18nProvider locale="en-US" blob={{ editor: enUSEditor, core: enUSCore }}>
      <UpgradeModal targetTag="v1.14.0" isRollback={isRollback} currentVersion="1.13.0" onComplete={vi.fn()} onClose={vi.fn()} />
    </I18nProvider>,
  );
  await act(async () => { await Promise.resolve(); });
  return FakeEventSource.last!;
}

async function finish(stream: FakeEventSource, complete: Record<string, unknown>) {
  await act(async () => {
    stream.emit('progress', { type: 'progress', step: 'preflight', progress: 5, message: 'Checking...' });
    stream.emit('progress', { type: 'progress', step: 'setup-system', progress: 75, message: 'Applying system configuration...' });
    stream.emit('progress', { type: 'progress', step: 'complete', progress: 100, message: 'Upgrade to v1.14.0 complete!', ...complete });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('EventSource', FakeEventSource);
  FakeEventSource.last = null;
  // The trigger POST succeeds; the version poll after it never answers ready,
  // so the page never tries to reload during the test.
  mocks.editorFetch.mockImplementation(async (url: string) => {
    if (url === '/api/system/upgrade') return new Response('{}', { status: 200 });
    return new Response(JSON.stringify({ upgradeRunning: true }), { status: 200 });
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('finished update window', () => {
  it('says a restart comes next when the install still needs one', async () => {
    const stream = await renderModal();
    await finish(stream, { restartNeeded: true });

    const line = screen.getByTestId('upgrade-restart-needed');
    expect(line.textContent).toBe(enUSEditor.upgradeModal.restartNeeded);
    // No restart button in the window: the server is restarting under it.
    expect(line.querySelector('button')).toBeNull();
  });

  it('says nothing extra when the install needs no restart', async () => {
    const stream = await renderModal();
    await finish(stream, {});

    expect(screen.queryByTestId('upgrade-restart-needed')).toBeNull();
    expect(screen.getByText(enUSEditor.upgradeModal.status.complete)).toBeTruthy();
  });

  it('words the finished state from the dictionary, not the server\'s English', async () => {
    const stream = await renderModal();
    await finish(stream, { restartNeeded: true });

    expect(screen.getByText(enUSEditor.upgradeModal.successDefault)).toBeTruthy();
    expect(screen.queryByText('Upgrade to v1.14.0 complete!')).toBeNull();
    // The wait for the new version starts at once, in the page's language.
    expect(screen.getByText(enUSEditor.upgradeModal.reload.shuttingDown)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/server/i);
  });

  it('does not call going back a version an upgrade', async () => {
    const stream = await renderModal({ isRollback: true });
    await finish(stream, {});

    expect(screen.getByText("You're back on v1.14.0.")).toBeTruthy();
    expect(screen.queryByText(enUSEditor.upgradeModal.successDefault)).toBeNull();
  });

  it('still says a restart comes next when the connection drops while the device restarts', async () => {
    // The usual ending: the service restarts under the window, and the
    // finished event never arrives.
    const stream = await renderModal();
    await act(async () => {
      stream.emit('progress', { type: 'progress', step: 'preflight', progress: 5, message: 'Checking...' });
      stream.emit('progress', { type: 'progress', step: 'restart', progress: 90, message: 'Restarting service...', restartNeeded: true });
    });
    await act(async () => { stream.onerror?.(); });

    expect(screen.getByTestId('upgrade-restart-needed').textContent).toBe(enUSEditor.upgradeModal.restartNeeded);
    expect(screen.getByText(enUSEditor.upgradeModal.status.complete)).toBeTruthy();
  });

  it('says nothing extra when the connection drops during a restart the install did not owe', async () => {
    const stream = await renderModal();
    await act(async () => {
      stream.emit('progress', { type: 'progress', step: 'preflight', progress: 5, message: 'Checking...' });
      stream.emit('progress', { type: 'progress', step: 'restart', progress: 90, message: 'Restarting service...' });
    });
    await act(async () => { stream.onerror?.(); });

    expect(screen.queryByTestId('upgrade-restart-needed')).toBeNull();
    expect(screen.getByText(enUSEditor.upgradeModal.status.complete)).toBeTruthy();
  });

  it('keeps it out of the window while the install is still running', async () => {
    const stream = await renderModal();
    await act(async () => {
      stream.emit('progress', { type: 'progress', step: 'setup-system', progress: 75, message: 'Applying...', restartNeeded: true });
    });
    expect(screen.queryByTestId('upgrade-restart-needed')).toBeNull();
  });
});
