import { describe, it, expect } from 'vitest';
import { formatBytes } from '../format-bytes';

describe('formatBytes', () => {
  it('reads zero, a negative or a non-number as 0 B', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-5)).toBe('0 B');
    expect(formatBytes(Number.NaN)).toBe('0 B');
  });

  it('keeps one decimal below ten and none from ten up', () => {
    expect(formatBytes(3.1 * 1024 ** 2)).toBe('3.1 MB');
    expect(formatBytes(11 * 1024 ** 3)).toBe('11 GB');
    expect(formatBytes(461 * 1024)).toBe('461 KB');
  });

  it('steps up a unit at every 1024', () => {
    expect(formatBytes(1023)).toBe('1023 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1024 ** 2)).toBe('1.0 MB');
    expect(formatBytes(1024 ** 3)).toBe('1.0 GB');
    expect(formatBytes(1024 ** 4)).toBe('1.0 TB');
  });

  it('stays in TB past the last unit', () => {
    expect(formatBytes(2048 * 1024 ** 4)).toBe('2048 TB');
  });

  it('follows the locale\'s decimal mark when given one', () => {
    expect(formatBytes(3.1 * 1024 ** 2, 'de-DE')).toBe('3,1 MB');
    expect(formatBytes(3.1 * 1024 ** 2, 'en-US')).toBe('3.1 MB');
    expect(formatBytes(11 * 1024 ** 3, 'de-DE')).toBe('11 GB');
    expect(formatBytes(0, 'de-DE')).toBe('0 B');
  });
});
