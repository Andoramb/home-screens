// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import enUSCore from '@/translations/en-US/core.json';
import enUSModules from '@/translations/en-US/modules.json';
import { DEFAULT_MODULE_STYLE, type GarbageDayConfig } from '@/types/config';
import GarbageDayModule from '../GarbageDayModule';

/** Trash on Saturdays only; the other rows are off. */
function config(over: Partial<GarbageDayConfig> = {}): GarbageDayConfig {
  return {
    trashDay: 6,
    trashFrequency: 'weekly',
    trashStartDate: '',
    recyclingDay: -1,
    customDay: -1,
    highlightMode: 'day-before',
    showTitle: false,
    ...over,
  } as GarbageDayConfig;
}

function rowText(over: Partial<GarbageDayConfig> = {}): string {
  const { container } = render(
    <I18nProvider locale="en-US" blob={{ core: enUSCore, modules: enUSModules }}>
      <GarbageDayModule config={config(over)} style={DEFAULT_MODULE_STYLE} />
    </I18nProvider>,
  );
  return container.textContent ?? '';
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('GarbageDayModule next collection', () => {
  it('names today on the morning of pickup when it highlights the day before', () => {
    vi.setSystemTime(new Date(2026, 9, 3, 8, 0)); // Saturday
    const text = rowText();
    expect(text).toContain('Today');
    expect(text).not.toContain('Next Saturday');
  });

  it('still highlights the day before pickup as tomorrow', () => {
    vi.setSystemTime(new Date(2026, 9, 2, 18, 0)); // Friday
    expect(rowText()).toContain('Tomorrow');
  });

  it('names today in day-of mode too', () => {
    vi.setSystemTime(new Date(2026, 9, 3, 8, 0));
    expect(rowText({ highlightMode: 'day-of' })).toContain('Today');
  });

  it('looks past a Saturday off-week of an every-other-week pickup', () => {
    vi.setSystemTime(new Date(2026, 9, 3, 8, 0));
    // Anchored the Saturday before, so this Saturday is an off week.
    const text = rowText({ trashFrequency: 'biweekly', trashStartDate: '2026-09-26' });
    expect(text).toContain('Next Saturday');
    expect(text).not.toContain('Today');
  });
});
