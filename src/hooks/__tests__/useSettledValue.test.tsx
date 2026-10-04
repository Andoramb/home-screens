// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useSettledValue } from '../useSettledValue';

describe('useSettledValue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('returns the first value at once', () => {
    const { result } = renderHook(() => useSettledValue('a', 800));
    expect(result.current).toBe('a');
  });

  it('keeps the last settled value while it keeps changing, then takes the newest', () => {
    const { result, rerender } = renderHook(({ v }) => useSettledValue(v, 800), { initialProps: { v: '1 Main' } });
    for (const v of ['1 Main S', '1 Main St', '1 Main St,']) {
      rerender({ v });
      act(() => { vi.advanceTimersByTime(500); });
      expect(result.current).toBe('1 Main');
    }
    act(() => { vi.advanceTimersByTime(800); });
    expect(result.current).toBe('1 Main St,');
  });
});
