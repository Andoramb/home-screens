import { describe, it, expect } from 'vitest';
import { validateConfigForWrite } from '@/lib/config-validation';
import { INVALID_CONFIGS } from './invalid-config-matrix';

describe('validateConfigForWrite', () => {
  it('accepts a minimal valid config', () => {
    expect(validateConfigForWrite({ screens: [], settings: {} })).toBeNull();
  });

  it('accepts a config with displays, schedules and visibility that are well formed', () => {
    expect(validateConfigForWrite({
      screens: [{ id: 's1', name: 'Main', modules: [{ id: 'm1', type: 'clock', config: {}, visibility: { conditions: [] } }], schedule: { daysOfWeek: [0, 6] } }],
      settings: { calendar: { personSources: { alice: ['cal-1'] } } },
      displays: [{ id: 'kitchen', screens: [] }],
    })).toBeNull();
  });

  for (const { name, config, error } of INVALID_CONFIGS) {
    it(`refuses ${name}`, () => {
      expect(validateConfigForWrite(config)).toMatch(error);
    });
  }

  it('turns a validator crash on a malformed document into a refusal', () => {
    // `modules` is a number, which the schedule walk cannot iterate.
    expect(validateConfigForWrite({ screens: [{ id: 's1', modules: 5 }], settings: {} })).toMatch(/Invalid config/);
  });
});
