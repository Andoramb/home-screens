// @vitest-environment jsdom

/**
 * The picker's tab follows the value: undo, redo and a layout import can
 * swap the value under a mounted picker (rule cards are keyed by rule id,
 * the picker is not remounted), and the tab holding the selection has to
 * be the one showing. Uploads land in the library through the shared hook
 * and select what they added.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import React from 'react';
import { I18nProvider } from '@/i18n/provider';
import DayArtPicker from '../DayArtPicker';

const editorFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/editor-fetch', () => ({ editorFetch, isSessionExpired: () => false }));
const invalidateByPrefix = vi.hoisted(() => vi.fn());
vi.mock('@/lib/display-cache', () => ({ displayCache: { invalidateByPrefix } }));

const SERVE = '/api/backgrounds/serve?file=calendar-art%2Fparty.png';
const BEACH = '/api/backgrounds/serve?file=calendar-art%2Fbeach.png';
const HALLOWEEN = '/starter-day-art/halloween.svg';

function listing(items: string[]) {
  editorFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return { ok: true, json: async () => ({ path: SERVE }) };
    if (url.startsWith('/api/backgrounds/directories')) return { ok: true, json: async () => ({ directories: [] }) };
    return { ok: true, json: async () => items.map((u) => ({ url: u, type: 'image' })) };
  });
}

const wrap = (ui: React.ReactElement) => <I18nProvider locale="en-US" blob={{}}>{ui}</I18nProvider>;
const pressedTab = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLButtonElement>('[data-day-art-picker] > div:first-child button'))
    .findIndex((b) => b.getAttribute('aria-pressed') === 'true');
const label = (tile: HTMLElement) => tile.querySelector<HTMLElement>('span:last-child')!;
const image = (tile: HTMLElement) => tile.querySelector<HTMLElement>('span:first-child')!.style.backgroundImage;

describe('DayArtPicker', () => {
  beforeEach(() => { editorFetch.mockReset(); invalidateByPrefix.mockReset(); listing([SERVE]); });
  afterEach(cleanup);

  it('follows the value onto the tab that holds it', async () => {
    const { container, rerender } = render(wrap(<DayArtPicker value={SERVE} onChange={() => {}} />));
    expect(pressedTab(container)).toBe(1);
    await act(async () => {});
    expect(container.querySelector('[data-my-art]')?.getAttribute('aria-pressed')).toBe('true');

    // Undo swaps the value back to built-in art: the Built-in tab shows it.
    rerender(wrap(<DayArtPicker value={HALLOWEEN} onChange={() => {}} />));
    expect(pressedTab(container)).toBe(0);
    expect(container.querySelector('[data-art-option="halloween"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('a clicked tab holds until the next pick', async () => {
    const onChange = vi.fn();
    const { container, rerender } = render(wrap(<DayArtPicker value={HALLOWEEN} onChange={onChange} />));
    const tabs = container.querySelectorAll<HTMLButtonElement>('[data-day-art-picker] > div:first-child button');
    await act(async () => { fireEvent.click(tabs[1]); });
    expect(pressedTab(container)).toBe(1);
    // A built-in value never shows as a "current picture" on Your pictures.
    expect(container.querySelector('[data-current-art]')).toBeNull();
    await act(async () => { fireEvent.click(container.querySelector('[data-my-art]')!); });
    expect(onChange).toHaveBeenCalledWith(SERVE);
    // The parent applies the pick; the tab now follows the value again.
    rerender(wrap(<DayArtPicker value={SERVE} onChange={onChange} />));
    expect(pressedTab(container)).toBe(1);
    rerender(wrap(<DayArtPicker value={HALLOWEEN} onChange={onChange} />));
    expect(pressedTab(container)).toBe(0);
  });

  it('marks the selected picture on Your pictures', async () => {
    listing([BEACH, SERVE]);
    const { container } = render(wrap(<DayArtPicker value={SERVE} onChange={() => {}} />));
    await act(async () => {});
    // The selected tile wears the accent border and ring and its name goes
    // accent; the other stays plain. Selection is read off aria-pressed so
    // listing order never matters.
    const selected = container.querySelector<HTMLElement>('[data-my-art][aria-pressed="true"]')!;
    const other = container.querySelector<HTMLElement>('[data-my-art][aria-pressed="false"]')!;
    expect(selected.className).toContain('border-hs-accent');
    expect(selected.className).toContain('ring-hs-accent');
    expect(other.className).not.toContain('border-hs-accent');
    expect(label(selected).className).toContain('text-hs-accent-hover');
    expect(label(other).className).toContain('text-hs-text-muted');
    // The full name is reachable by hover even when the tile truncates it.
    expect(selected.getAttribute('title')).toBe('party.png');
    expect(other.getAttribute('title')).toBe('beach.png');
    // Tiles paint the grid-size copy, not the full picture.
    expect(image(selected)).toContain('calendar-art%2Fparty.png&w=');
    expect(container.querySelector('[data-current-art]')).toBeNull();
  });

  it('marks the selected built-in art the same way', () => {
    const { container } = render(wrap(<DayArtPicker value={HALLOWEEN} onChange={() => {}} />));
    const halloween = container.querySelector<HTMLElement>('[data-art-option="halloween"]')!;
    const celebrate = container.querySelector<HTMLElement>('[data-art-option="celebrate"]')!;
    expect(halloween.className).toContain('border-hs-accent');
    expect(halloween.className).toContain('ring-hs-accent');
    expect(label(halloween).className).toContain('text-hs-accent-hover');
    expect(celebrate.className).not.toContain('ring-hs-accent');
    expect(label(celebrate).className).toContain('text-hs-text-muted');
  });

  it('shows the picture a rule holds when the folder no longer lists it', async () => {
    // Pictures & videos moved party.png to another folder and rewrote the
    // rule to follow; the wall still paints it, so the picker shows it.
    const moved = '/api/backgrounds/serve?file=holidays%2Fparty.png';
    listing([BEACH]);
    const { container, rerender } = render(wrap(<DayArtPicker value={moved} onChange={() => {}} />));
    // Nothing is known to be missing until the listing has come back.
    expect(container.querySelector('[data-current-art]')).toBeNull();
    await act(async () => {});
    const current = container.querySelector<HTMLElement>('[data-current-art]')!;
    expect(current.getAttribute('aria-pressed')).toBe('true');
    expect(current.className).toContain('ring-hs-accent');
    expect(current.getAttribute('title')).toBe('holidays/party.png');
    expect(image(current)).toContain('holidays%2Fparty.png&w=');
    expect(container.querySelector('[data-my-art]')?.getAttribute('aria-pressed')).toBe('false');

    // Picking a listed picture drops the held one.
    rerender(wrap(<DayArtPicker value={BEACH} onChange={() => {}} />));
    expect(container.querySelector('[data-current-art]')).toBeNull();
    expect(container.querySelector('[data-my-art]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('an upload selects the new picture and invalidates the canvas library cache', async () => {
    listing([]);
    const onChange = vi.fn();
    const { container } = render(wrap(<DayArtPicker value={undefined} onChange={onChange} />));
    const tabs = container.querySelectorAll<HTMLButtonElement>('[data-day-art-picker] > div:first-child button');
    await act(async () => { fireEvent.click(tabs[1]); });
    // An empty folder renders no grid at all, so nothing sits above Add a picture.
    expect(container.querySelector('.grid-cols-2')).toBeNull();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'party.png', { type: 'image/png' });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    expect(onChange).toHaveBeenCalledWith(SERVE);
    expect(invalidateByPrefix).toHaveBeenCalledWith('/api/backgrounds');
    const post = editorFetch.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'POST');
    expect((post![1] as RequestInit).body).toBeInstanceOf(FormData);
    expect(((post![1] as RequestInit).body as FormData).get('directory')).toBe('calendar-art');
  });
});
