import { describe, it, expect } from 'vitest';
import { formatFrameTime } from '../radar-frame-time';

const t = (key: string) => key;
const NOW_MS = Date.UTC(2026, 9, 17, 12, 0, 0);
const at = (minutesAgo: number) => (NOW_MS - minutesAgo * 60_000) / 1000;

describe('formatFrameTime', () => {
  it('says "Now" within 90 seconds either side of the clock', () => {
    expect(formatFrameTime(NOW_MS / 1000, NOW_MS, t, 'en-US')).toBe('rain-map.now');
    expect(formatFrameTime(at(1.5), NOW_MS, t, 'en-US')).toBe('rain-map.now');
    expect(formatFrameTime(at(-1.5), NOW_MS, t, 'en-US')).toBe('rain-map.now');
  });

  it('counts minutes through the two-hour loop so neighbouring frames stay distinct', () => {
    expect(formatFrameTime(at(10), NOW_MS, t, 'en-US')).toBe('10 min. ago');
    expect(formatFrameTime(at(60), NOW_MS, t, 'en-US')).toBe('60 min. ago');
    expect(formatFrameTime(at(90), NOW_MS, t, 'en-US')).toBe('90 min. ago');
  });

  it('rolls over to hours past 90 minutes instead of printing a huge minute count', () => {
    expect(formatFrameTime(at(91), NOW_MS, t, 'en-US')).toBe('2 hr. ago');
    expect(formatFrameTime(at(1730), NOW_MS, t, 'en-US')).toBe('29 hr. ago');
    expect(formatFrameTime(at(120), NOW_MS, t, 'de-DE')).toBe('vor 2 Std.');
  });
});
