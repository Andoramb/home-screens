import { describe, it, expect } from 'vitest';
import { chooseGoogleApp, googleAppPreference } from '@/lib/google-app-choice';

describe('chooseGoogleApp', () => {
  it.each([
    // own pair saved (either half) | preference | hosted available | result
    [true, 'own', true, 'own'],
    [true, 'own', false, 'own'],
    [true, 'hosted', true, 'hosted'],
    [true, 'hosted', false, 'own'],
    [false, 'own', true, 'hosted'],
    [false, 'hosted', true, 'hosted'],
    [false, 'own', false, null],
    [false, 'hosted', false, null],
  ] as const)('saved %s, prefers %s, hosted available %s: %s', (ownSaved, preference, hostedAvailable, expected) => {
    expect(chooseGoogleApp({ ownSaved, preference, hostedAvailable })).toBe(expected);
  });
});

describe('googleAppPreference', () => {
  it('reads an unset setting as the household\'s own app, the rule before the switch existed', () => {
    expect(googleAppPreference(undefined)).toBe('own');
    expect(googleAppPreference(null)).toBe('own');
    expect(googleAppPreference({})).toBe('own');
    expect(googleAppPreference({ googleApp: 'hosted' })).toBe('hosted');
  });
});
