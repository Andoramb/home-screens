import { describe, it, expect } from 'vitest';
import { normalizeMediaRef, scanMediaUsage } from '../media-usage';

describe('normalizeMediaRef', () => {
  it('extracts and decodes the file param from serve URLs, ignoring the media token', () => {
    expect(normalizeMediaRef('/api/backgrounds/serve?file=calendar-art%2Fpumpkins.jfif'))
      .toBe('calendar-art/pumpkins.jfif');
    expect(normalizeMediaRef('/api/backgrounds/serve?file=a%2Fb.mp4&mt=tok')).toBe('a/b.mp4');
  });
  it('passes a bare relative path through', () => {
    expect(normalizeMediaRef('nature/forest.jpg')).toBe('nature/forest.jpg');
    expect(normalizeMediaRef('themes/christmas/clip.mp4')).toBe('themes/christmas/clip.mp4');
  });
  it('returns null for anything that is not a reference', () => {
    expect(normalizeMediaRef('#ff0000')).toBeNull();
    expect(normalizeMediaRef('')).toBeNull();
    expect(normalizeMediaRef('/starter-day-art/celebrate.svg')).toBeNull(); // built-ins are not library files
  });
  it('returns null for a serve URL with a malformed percent escape', () => {
    expect(normalizeMediaRef('/api/backgrounds/serve?file=a%ZZ.mp4')).toBeNull();
  });
});

describe('scanMediaUsage', () => {
  const known = new Set(['nature/forest.jpg', 'calendar-art/pumpkins.jfif', 'clips/walk.mp4', 'waves.svg']);
  it('finds serve URLs and bare paths, in displays and legacy screens, with kinds and names', () => {
    const config = {
      screens: [{ id: 's1', name: 'Hall', backgroundImage: 'nature/forest.jpg' }],
      displays: [{ id: 'main', name: 'Main wall', screens: [
        { id: 's2', name: 'Kitchen', backgroundImage: '/api/backgrounds/serve?file=clips%2Fwalk.mp4' },
        { id: 's3', dayRules: [{ id: 'd1', match: {}, backgroundImage: '/api/backgrounds/serve?file=calendar-art%2Fpumpkins.jfif' }] },
      ] }],
    };
    const usage = scanMediaUsage(config, known);
    expect(usage.get('nature/forest.jpg')).toEqual([{ kind: 'screen', name: 'Hall', configPath: 'screens[0].backgroundImage' }]);
    expect(usage.get('clips/walk.mp4')).toEqual([{ kind: 'screen', name: 'Kitchen', configPath: 'displays[0].screens[0].backgroundImage' }]);
    expect(usage.get('calendar-art/pumpkins.jfif')![0].kind).toBe('dayRule');
    expect(usage.get('calendar-art/pumpkins.jfif')![0].configPath).toBe('displays[0].screens[1].dayRules[0].backgroundImage');
    expect(usage.has('waves.svg')).toBe(false);
  });
  it('does not count prose that merely contains a path', () => {
    const usage = scanMediaUsage({ note: 'see nature/forest.jpg later' }, known);
    expect(usage.size).toBe(0);
  });
  it('labels module config references as modules with the screen name when present', () => {
    const config = { screens: [{ id: 's1', name: 'Den', modules: [{ type: 'image', config: { file: 'waves.svg' } }] }] };
    const usage = scanMediaUsage(config, known);
    expect(usage.get('waves.svg')).toEqual([{ kind: 'module', name: 'Den', configPath: 'screens[0].modules[0].config.file' }]);
  });
  it('finds nested library paths (folders two deep) used by a video module', () => {
    const nested = new Set(['themes/christmas/clip.mp4']);
    const usage = scanMediaUsage(
      { screens: [{ name: 'Den', modules: [{ type: 'video', config: { file: 'themes/christmas/clip.mp4' } }] }] },
      nested,
    );
    expect(usage.get('themes/christmas/clip.mp4')).toEqual([
      { kind: 'module', name: 'Den', configPath: 'screens[0].modules[0].config.file' },
    ]);
  });
  it('records every use of the same file, not just the first', () => {
    const config = { screens: [
      { name: 'A', backgroundImage: 'x.jpg' },
      { name: 'B', backgroundImage: '/api/backgrounds/serve?file=x.jpg' },
    ] };
    const usage = scanMediaUsage(config, new Set(['x.jpg']));
    expect(usage.get('x.jpg')).toHaveLength(2);
    expect(usage.get('x.jpg')!.map((u) => u.name)).toEqual(['A', 'B']);
  });
  it('never throws on odd input shapes', () => {
    expect(scanMediaUsage(null, known).size).toBe(0);
    expect(() => scanMediaUsage(JSON.parse('{"__proto__": "nature/forest.jpg"}'), known)).not.toThrow();
  });
});
