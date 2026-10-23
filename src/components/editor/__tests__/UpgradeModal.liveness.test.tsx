// @vitest-environment jsdom

/**
 * The update window proves it is alive while a step is silent.
 *
 * A Chromium update prints one line, then nothing for minutes while apt
 * downloads it. The pulsing dot and the shimmer on the bar are animations,
 * so they look the same whether or not the install is still going. Two
 * things on the window move only when time really passes and the page is
 * still hearing from the server: the clock beside the active step, and the
 * line under the console that counts how long nothing new has arrived.
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

async function renderModal() {
  render(
    <I18nProvider locale="en-US" blob={{ editor: enUSEditor, core: enUSCore }}>
      <UpgradeModal targetTag="v1.14.0" isRollback={false} currentVersion="1.13.0" onComplete={vi.fn()} onClose={vi.fn()} />
    </I18nProvider>,
  );
  await act(async () => { await Promise.resolve(); });
  const stream = FakeEventSource.last!;
  await act(async () => {
    stream.emit('progress', { type: 'progress', step: 'preflight', progress: 5, message: 'Checking...' });
    stream.emit('progress', { type: 'progress', step: 'setup-system', progress: 75, message: 'Applying system configuration...' });
    stream.emit('output', { type: 'output', step: 'setup-system', line: "Checking for newer versions of the display's programs..." });
  });
  return stream;
}

async function wait(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

const quietLine = () => screen.queryByTestId('upgrade-console-quiet');
const elapsed = () => screen.queryByTestId('upgrade-step-elapsed');

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal('EventSource', FakeEventSource);
  FakeEventSource.last = null;
  mocks.editorFetch.mockImplementation(async (url: string) => {
    if (url === '/api/system/upgrade') return new Response('{}', { status: 200 });
    return new Response(JSON.stringify({ upgradeRunning: true }), { status: 200 });
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the active step shows how long it has been running', () => {
  it('ticks beside the active row and nowhere else', async () => {
    await renderModal();
    await wait(1000);
    expect(elapsed()?.textContent).toBe('1s');
    await wait(74_000);
    expect(elapsed()?.textContent).toBe('1m 15s');
    // One clock, on the active row.
    expect(screen.getAllByTestId('upgrade-step-elapsed')).toHaveLength(1);
    expect(elapsed()!.closest('button')!.textContent).toContain(enUSEditor.upgradeModal.stepLabels['setup-system']);
  });

  it('restarts from zero when the next step begins', async () => {
    const stream = await renderModal();
    await wait(40_000);
    await act(async () => {
      stream.emit('progress', { type: 'progress', step: 'restart', progress: 90, message: 'Restarting service...' });
    });
    await wait(2000);
    expect(elapsed()?.textContent).toBe('2s');
    expect(elapsed()!.closest('button')!.textContent).toContain(enUSEditor.upgradeModal.stepLabels.restart);
  });

  it('stops once the install has finished', async () => {
    const stream = await renderModal();
    await wait(5000);
    await act(async () => {
      stream.emit('progress', { type: 'progress', step: 'complete', progress: 100, message: 'Done' });
    });
    expect(elapsed()).toBeNull();
  });
});

describe('the console says how long it has heard nothing', () => {
  it('stays quiet for the first half minute, then counts the silence', async () => {
    await renderModal();
    await wait(29_000);
    expect(quietLine()).toBeNull();
    await wait(1000);
    expect(quietLine()?.textContent).toBe('Still working, nothing new for 30s');
    await wait(60_000);
    expect(quietLine()?.textContent).toBe('Still working, nothing new for 1m 30s');
  });

  it('goes away when a new line arrives and counts again from there', async () => {
    const stream = await renderModal();
    await wait(45_000);
    expect(quietLine()).not.toBeNull();
    await act(async () => {
      stream.emit('output', { type: 'output', step: 'setup-system', line: 'Newer versions found: chromium (118 MB)' });
    });
    expect(quietLine()).toBeNull();
    await wait(29_000);
    expect(quietLine()).toBeNull();
    await wait(1000);
    expect(quietLine()?.textContent).toBe('Still working, nothing new for 30s');
  });

  it('counts a progress event as news too', async () => {
    const stream = await renderModal();
    await wait(25_000);
    await act(async () => {
      stream.emit('progress', { type: 'progress', step: 'setup-system', progress: 76, message: 'Applying system configuration...' });
    });
    await wait(10_000);
    expect(quietLine()).toBeNull();
  });

  it('is not shown while the console is pinned to an earlier step, nor after the install ends', async () => {
    const stream = await renderModal();
    await wait(45_000);
    expect(quietLine()).not.toBeNull();
    await act(async () => {
      stream.emit('progress', { type: 'progress', step: 'complete', progress: 100, message: 'Done' });
    });
    expect(quietLine()).toBeNull();
  });
});
