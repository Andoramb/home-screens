import { describe, it, expect, vi } from 'vitest';
import {
  assertUpgradePathAllowed,
  isDowngradeBlocked,
  lowestUnmetFloor,
  parseReleaseMarkers,
  resolveInstallTarget,
  UpgradePathError,
  versionOfTag,
  type PolicyTag,
} from '../update-policy';

interface Tag extends PolicyTag {
  tag: string;
}

function tag(version: string, extra?: { requires?: string[]; schema?: number }): Tag {
  return { tag: `v${version}`, version, ...extra };
}

const noLookup = vi.fn(async () => null);

describe('parseReleaseMarkers', () => {
  it('reads both markers', () => {
    const body = '## Notes\n<!-- home-screens-requires: 1.43.0 -->\n<!-- home-screens-schema: 13 -->\n- fixed things';
    expect(parseReleaseMarkers(body)).toEqual({ requires: ['1.43.0'], schema: 13 });
  });

  it('returns nothing for a body without markers, or no body at all', () => {
    expect(parseReleaseMarkers('## Notes\n- fixed things')).toEqual({ requires: [], schema: null });
    expect(parseReleaseMarkers('')).toEqual({ requires: [], schema: null });
    expect(parseReleaseMarkers(null)).toEqual({ requires: [], schema: null });
    expect(parseReleaseMarkers(undefined)).toEqual({ requires: [], schema: null });
  });

  it('accepts a leading v, loose whitespace and mixed case', () => {
    expect(parseReleaseMarkers('<!--HOME-SCREENS-REQUIRES:v1.43.0-->').requires).toEqual(['1.43.0']);
    expect(parseReleaseMarkers('<!--   home-screens-schema:   7   -->').schema).toBe(7);
  });

  it('accepts a comma list, drops junk entries and duplicates, and sorts ascending', () => {
    const body = '<!-- home-screens-requires: 1.50.0, v1.43.0, banana, 1.43.0, 2.0.0-rc.1 -->';
    expect(parseReleaseMarkers(body).requires).toEqual(['1.43.0', '1.50.0', '2.0.0-rc.1']);
  });

  it('takes the first marker of each kind', () => {
    const body = '<!-- home-screens-requires: 1.1.0 -->\n<!-- home-screens-requires: 9.9.9 -->\n<!-- home-screens-schema: 3 --><!-- home-screens-schema: 4 -->';
    expect(parseReleaseMarkers(body)).toEqual({ requires: ['1.1.0'], schema: 3 });
  });

  it('ignores a marker whose value is not a version or a number', () => {
    expect(parseReleaseMarkers('<!-- home-screens-requires: latest -->').requires).toEqual([]);
    expect(parseReleaseMarkers('<!-- home-screens-schema: thirteen -->').schema).toBeNull();
    expect(parseReleaseMarkers('<!-- home-screens-schema: 1.5 -->').schema).toBeNull();
  });
});

describe('versionOfTag', () => {
  it('strips one leading v only', () => {
    expect(versionOfTag('v1.2.3')).toBe('1.2.3');
    expect(versionOfTag('1.2.3')).toBe('1.2.3');
  });
});

describe('lowestUnmetFloor', () => {
  it('is null without floors or when every floor is met', () => {
    expect(lowestUnmetFloor(tag('2.0.0'), '1.43.0')).toBeNull();
    expect(lowestUnmetFloor(tag('2.0.0', { requires: ['1.43.0'] }), '1.43.0')).toBeNull();
    expect(lowestUnmetFloor(tag('2.0.0', { requires: ['1.43.0'] }), '1.44.0')).toBeNull();
  });

  it('names the lowest floor the device has not reached', () => {
    expect(lowestUnmetFloor(tag('2.0.0', { requires: ['1.43.0', '1.50.0'] }), '1.32.0')).toBe('1.43.0');
    expect(lowestUnmetFloor(tag('2.0.0', { requires: ['1.43.0', '1.50.0'] }), '1.45.0')).toBe('1.50.0');
  });

  it('treats a nightly below the floor as unmet', () => {
    expect(lowestUnmetFloor(tag('2.0.0', { requires: ['1.43.0'] }), '1.43.0-dev.20260908')).toBe('1.43.0');
    expect(lowestUnmetFloor(tag('2.0.0', { requires: ['1.43.0'] }), '1.44.0-dev.20260908')).toBeNull();
  });
});

describe('isDowngradeBlocked', () => {
  it('blocks only a declared schema below the local one', () => {
    expect(isDowngradeBlocked(tag('1.43.0', { schema: 13 }), 20)).toBe(true);
    expect(isDowngradeBlocked(tag('1.43.0', { schema: 20 }), 20)).toBe(false);
    expect(isDowngradeBlocked(tag('1.43.0', { schema: 21 }), 20)).toBe(false);
  });

  it('never blocks when either side is unknown', () => {
    expect(isDowngradeBlocked(tag('1.43.0'), 20)).toBe(false);
    expect(isDowngradeBlocked(tag('1.43.0', { schema: 13 }), null)).toBe(false);
  });
});

describe('resolveInstallTarget', () => {
  const none = { requiredStepFor: null, missingStep: null, blockedDowngrade: null };

  it('offers nothing when there are no tags', async () => {
    expect(await resolveInstallTarget('1.0.0', 13, [], noLookup)).toEqual({ target: null, ...none });
  });

  it('offers the newest tag when it declares no floor', async () => {
    const tags = [tag('1.7.0'), tag('1.6.0')];
    expect(await resolveInstallTarget('1.5.0', 13, tags, noLookup)).toEqual({ target: tags[0], ...none });
  });

  it('keeps the newest as target when it is the running version', async () => {
    const tags = [tag('1.7.0', { requires: ['1.6.0'] })];
    expect(await resolveInstallTarget('1.7.0', 13, tags, noLookup)).toEqual({ target: tags[0], ...none });
  });

  it('offers the newest when its floor is met', async () => {
    const tags = [tag('2.0.0', { requires: ['1.43.0'] }), tag('1.43.0')];
    expect(await resolveInstallTarget('1.43.0', 13, tags, noLookup)).toEqual({ target: tags[0], ...none });
    expect(await resolveInstallTarget('1.44.0', 13, tags, noLookup)).toEqual({ target: tags[0], ...none });
  });

  it('offers the floor instead when it is unmet and on the page', async () => {
    const tags = [tag('2.0.0', { requires: ['1.43.0'] }), tag('1.43.0'), tag('1.32.0')];
    const result = await resolveInstallTarget('1.32.0', 13, tags, noLookup);
    expect(result).toEqual({ target: tags[1], ...none, requiredStepFor: '2.0.0' });
    expect(noLookup).not.toHaveBeenCalled();
  });

  it('looks the floor up by tag when it has fallen off the page', async () => {
    const floor = tag('1.43.0');
    const lookup = vi.fn(async (t: string) => (t === 'v1.43.0' ? floor : null));
    const tags = [tag('2.0.0', { requires: ['1.43.0'] }), tag('2.0.0-dev.20261001')];
    const result = await resolveInstallTarget('1.32.0', 13, tags, lookup);
    expect(result).toEqual({ target: floor, ...none, requiredStepFor: '2.0.0' });
    expect(lookup).toHaveBeenCalledWith('v1.43.0');
  });

  it('offers nothing and names the missing step when the floor cannot be found', async () => {
    const tags = [tag('2.0.0', { requires: ['1.43.0'] })];
    const result = await resolveInstallTarget('1.32.0', 13, tags, noLookup);
    expect(result).toEqual({ target: null, ...none, requiredStepFor: '2.0.0', missingStep: '1.43.0' });
  });

  it('walks a chain of floors and offers the earliest', async () => {
    const tags = [
      tag('3.0.0', { requires: ['2.20.0'] }),
      tag('2.20.0', { requires: ['1.43.0'] }),
      tag('1.43.0'),
    ];
    expect(await resolveInstallTarget('1.32.0', 13, tags, noLookup)).toEqual({
      target: tags[2], ...none, requiredStepFor: '2.20.0',
    });
    expect(await resolveInstallTarget('1.43.0', 13, tags, noLookup)).toEqual({
      target: tags[1], ...none, requiredStepFor: '3.0.0',
    });
    expect(await resolveInstallTarget('2.20.0', 13, tags, noLookup)).toEqual({ target: tags[0], ...none });
  });

  it('offers the lowest unmet entry of a floor list', async () => {
    const tags = [tag('2.0.0', { requires: ['1.43.0', '1.50.0'] }), tag('1.50.0'), tag('1.43.0')];
    expect(await resolveInstallTarget('1.32.0', 13, tags, noLookup)).toEqual({
      target: tags[2], ...none, requiredStepFor: '2.0.0',
    });
    expect(await resolveInstallTarget('1.43.0', 13, tags, noLookup)).toEqual({
      target: tags[1], ...none, requiredStepFor: '2.0.0',
    });
  });

  it('gives up on a floor cycle instead of looping', async () => {
    const tags = [tag('2.0.0', { requires: ['1.9.0'] }), tag('1.9.0', { requires: ['2.0.0'] })];
    const result = await resolveInstallTarget('1.0.0', 13, tags, noLookup);
    expect(result.target).toBeNull();
    expect(result.missingStep).toBe('2.0.0');
  });

  it('sends a nightly below the floor to the floor', async () => {
    const tags = [tag('2.0.0', { requires: ['1.43.0'] }), tag('1.43.0')];
    expect(await resolveInstallTarget('1.43.0-dev.20260908', 13, tags, noLookup)).toEqual({
      target: tags[1], ...none, requiredStepFor: '2.0.0',
    });
  });

  it('offers a step back when the target can read the local settings', async () => {
    const tags = [tag('1.43.0', { schema: 13 })];
    expect(await resolveInstallTarget('1.44.0-dev.20260908', 13, tags, noLookup)).toEqual({ target: tags[0], ...none });
  });

  it('offers a step back with an undeclared schema, as before', async () => {
    const tags = [tag('1.43.0')];
    expect(await resolveInstallTarget('2.0.0', 20, tags, noLookup)).toEqual({ target: tags[0], ...none });
  });

  it('blocks a step back whose declared schema is below the local one', async () => {
    const tags = [tag('1.43.0', { schema: 13 })];
    expect(await resolveInstallTarget('2.0.0', 20, tags, noLookup)).toEqual({
      target: null, ...none, blockedDowngrade: '1.43.0',
    });
  });

  it('never blocks a step back when the local schema is unknown', async () => {
    const tags = [tag('1.43.0', { schema: 13 })];
    expect(await resolveInstallTarget('2.0.0', null, tags, noLookup)).toEqual({ target: tags[0], ...none });
  });
});

describe('assertUpgradePathAllowed', () => {
  it('lets a target through when it declares nothing', () => {
    expect(() => assertUpgradePathAllowed('1.0.0', 13, tag('2.0.0'))).not.toThrow();
    expect(() => assertUpgradePathAllowed('2.0.0', 13, tag('1.0.0'))).not.toThrow();
  });

  it('refuses an upward target with an unmet floor and names the step', () => {
    expect(() => assertUpgradePathAllowed('1.32.0', 13, tag('2.0.0', { requires: ['1.43.0'] })))
      .toThrow('v2.0.0 needs v1.43.0 installed first. Update to v1.43.0, then update again.');
    try {
      assertUpgradePathAllowed('1.32.0', 13, tag('2.0.0', { requires: ['1.43.0'] }));
    } catch (err) {
      expect(err).toBeInstanceOf(UpgradePathError);
    }
  });

  it('lets an upward target through once its floor is met', () => {
    expect(() => assertUpgradePathAllowed('1.43.0', 13, tag('2.0.0', { requires: ['1.43.0'] }))).not.toThrow();
  });

  it('refuses a step back that cannot read the local settings', () => {
    expect(() => assertUpgradePathAllowed('2.0.0', 20, tag('1.43.0', { schema: 13 })))
      .toThrow('Going back to v1.43.0 would leave settings that version cannot read.');
  });

  it('lets a step back through at an equal or unknown schema', () => {
    expect(() => assertUpgradePathAllowed('2.0.0', 20, tag('1.43.0', { schema: 20 }))).not.toThrow();
    expect(() => assertUpgradePathAllowed('2.0.0', 20, tag('1.43.0'))).not.toThrow();
    expect(() => assertUpgradePathAllowed('2.0.0', null, tag('1.43.0', { schema: 13 }))).not.toThrow();
  });

  it('ignores floors on the running version itself', () => {
    expect(() => assertUpgradePathAllowed('2.0.0', 20, tag('2.0.0', { requires: ['1.43.0'] }))).not.toThrow();
  });
});
