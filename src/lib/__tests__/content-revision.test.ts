import { describe, it, expect } from 'vitest';
import { contentRevision } from '../content-revision';

describe('contentRevision', () => {
  it('is stable for equal content and short enough to quote', () => {
    expect(contentRevision([{ id: 'a' }])).toBe(contentRevision([{ id: 'a' }]));
    expect(contentRevision([])).toHaveLength(24);
  });

  it('moves on any change to the content', () => {
    expect(contentRevision([{ id: 'a' }])).not.toBe(contentRevision([{ id: 'a' }, { id: 'b' }]));
    expect(contentRevision([{ id: 'a', name: 'x' }])).not.toBe(contentRevision([{ id: 'a', name: 'y' }]));
  });
});
