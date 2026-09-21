import { describe, it, expect } from 'vitest';
import { formatTouchMatrix, parseTouchMatrix, touchAlignmentMode } from '@/lib/touch-matrix';

describe('touchAlignmentMode', () => {
  it('follows the rotation when nothing is saved', () => {
    expect(touchAlignmentMode(undefined)).toBe('follow');
    expect(touchAlignmentMode(null)).toBe('follow');
  });
  it('follows the rotation when what is saved is not a matrix', () => {
    expect(touchAlignmentMode([1, 0, 0])).toBe('follow');
  });
  it('reads the matrix that changes nothing as leaving touch alone', () => {
    expect(touchAlignmentMode([1, 0, 0, 0, 1, 0])).toBe('leave');
  });
  it('reads anything else as the owner\'s own numbers', () => {
    expect(touchAlignmentMode([-1, 0, 1, 0, 1, 0])).toBe('custom');
  });
});

describe('parseTouchMatrix', () => {
  it('takes spaces, commas and fractions', () => {
    expect(parseTouchMatrix(' 0 1 0 -1 0 1 ')).toEqual([0, 1, 0, -1, 0, 1]);
    expect(parseTouchMatrix('1.04, 0, -0.02, 0, 1.03, -.015')).toEqual([1.04, 0, -0.02, 0, 1.03, -0.015]);
  });
  it('refuses the wrong count, words, exponents and huge values', () => {
    expect(parseTouchMatrix('1 0 0 0 1')).toBeNull();
    expect(parseTouchMatrix('1 0 0 0 1 0 0')).toBeNull();
    expect(parseTouchMatrix('1 0 0 0 1 x')).toBeNull();
    expect(parseTouchMatrix('1 0 0 0 1 1e2')).toBeNull();
    expect(parseTouchMatrix('1 0 0 0 1 101')).toBeNull();
    expect(parseTouchMatrix('')).toBeNull();
  });
  it('round-trips through formatTouchMatrix', () => {
    expect(parseTouchMatrix(formatTouchMatrix([0, -1, 1, 1, 0, 0]))).toEqual([0, -1, 1, 1, 0, 0]);
    expect(formatTouchMatrix(undefined)).toBe('');
  });
});
