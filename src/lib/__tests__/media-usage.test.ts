import { describe, it, expect } from 'vitest';
import { classifyMediaRef, normalizeMediaRef, rewriteMediaRefs, scanMediaUsage, scanMissingMedia } from '../media-usage';

describe('normalizeMediaRef', () => {
  it('extracts and decodes the file param from serve URLs, ignoring the media token', () => {
    expect(normalizeMediaRef('/api/backgrounds/serve?file=calendar-art%2Fpumpkins.jfif'))
      .toBe('calendar-art/pumpkins.jfif');
    expect(normalizeMediaRef('/api/backgrounds/serve?file=a%2Fb.mp4&mt=tok')).toBe('a/b.mp4');
  });
  it('reads a serve URL with an absolute origin or a hand-typed unencoded space', () => {
    expect(normalizeMediaRef('http://hub.local:3000/api/backgrounds/serve?file=x.jpg')).toBe('x.jpg');
    expect(normalizeMediaRef('/api/backgrounds/serve?file=my photo.jpg')).toBe('my photo.jpg');
  });
  it('ignores an unrelated URL that carries its own file param', () => {
    expect(normalizeMediaRef('https://photos.example.com/view?file=beach.jpg')).toBeNull();
    expect(normalizeMediaRef('https://example.com/api/backgrounds/serve?file=x.jpg&e=1')).toBe('x.jpg');
  });
  it('passes a bare relative path through, spaces included', () => {
    expect(normalizeMediaRef('nature/forest.jpg')).toBe('nature/forest.jpg');
    expect(normalizeMediaRef('themes/christmas/clip.mp4')).toBe('themes/christmas/clip.mp4');
    expect(normalizeMediaRef('my photo.jpg')).toBe('my photo.jpg');
  });
  it('maps the legacy static form to the library path', () => {
    expect(normalizeMediaRef('/backgrounds/themes/family.jpg')).toBe('themes/family.jpg');
    expect(normalizeMediaRef('/backgrounds/x.jpg')).toBe('x.jpg');
  });
  it('returns null for anything that is not a reference', () => {
    expect(normalizeMediaRef('#ff0000')).toBeNull();
    expect(normalizeMediaRef('')).toBeNull();
    expect(normalizeMediaRef('/starter-day-art/celebrate.svg')).toBeNull(); // built-ins are not library files
    expect(normalizeMediaRef('nature//a.jpg')).toBeNull();
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
    expect(usage.get('nature/forest.jpg')).toEqual([{ kind: 'screen', name: 'Hall', configPath: 'screens[0].backgroundImage', screenId: 's1' }]);
    expect(usage.get('clips/walk.mp4')).toEqual([{ kind: 'screen', name: 'Kitchen', configPath: 'displays[0].screens[0].backgroundImage', displayId: 'main', screenId: 's2' }]);
    expect(usage.get('calendar-art/pumpkins.jfif')![0].kind).toBe('dayRule');
    expect(usage.get('calendar-art/pumpkins.jfif')![0].configPath).toBe('displays[0].screens[1].dayRules[0].backgroundImage');
    expect(usage.has('waves.svg')).toBe(false);
  });
  it('does not count prose that merely contains a path', () => {
    const usage = scanMediaUsage({ note: 'see nature/forest.jpg later' }, known);
    expect(usage.size).toBe(0);
  });
  it('finds a spaced filename and a legacy static reference', () => {
    const spaced = new Set(['my photo.jpg', 'themes/family.jpg']);
    const config = { screens: [
      { name: 'A', backgroundImage: 'my photo.jpg' },
      { name: 'B', backgroundImage: '/backgrounds/themes/family.jpg' },
    ] };
    const usage = scanMediaUsage(config, spaced);
    expect(usage.get('my photo.jpg')![0].name).toBe('A');
    expect(usage.get('themes/family.jpg')![0].name).toBe('B');
  });
  it('labels module config references as modules with the screen name when present', () => {
    const config = { screens: [{ id: 's1', name: 'Den', modules: [{ type: 'image', config: { file: 'waves.svg' } }] }] };
    const usage = scanMediaUsage(config, known);
    expect(usage.get('waves.svg')).toEqual([{ kind: 'module', name: 'Den', configPath: 'screens[0].modules[0].config.file', screenId: 's1' }]);
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

  describe('folder-driven modules', () => {
    const library = new Set(['nature/a.jpg', 'nature/b.jpg', 'nature/deeper/c.jpg', 'root.jpg']);
    it('marks every file directly inside a slideshow folder as used by it', () => {
      const config = { screens: [{ name: 'Hall', modules: [
        { type: 'photo-slideshow', config: { source: 'local', directory: 'nature' } },
      ] }] };
      const usage = scanMediaUsage(config, library);
      const use = { kind: 'slideshow', name: 'Hall', configPath: 'screens[0].modules[0].config.directory' };
      expect(usage.get('nature/a.jpg')).toEqual([use]);
      expect(usage.get('nature/b.jpg')).toEqual([use]);
      // The listing is not recursive, so neither is the lock.
      expect(usage.has('nature/deeper/c.jpg')).toBe(false);
      expect(usage.has('root.jpg')).toBe(false);
    });
    it('treats an empty directory as the library top level, whatever the slash spelling', () => {
      for (const directory of ['', '/']) {
        const config = { screens: [{ modules: [{ type: 'fullscreen-photo', config: { directory } }] }] };
        const usage = scanMediaUsage(config, library);
        expect(usage.get('root.jpg')![0].kind).toBe('slideshow');
        expect(usage.has('nature/a.jpg')).toBe(false);
      }
    });
    it('does not lock the folder when the module shows one pinned file or another source', () => {
      const config = { screens: [{ modules: [
        { type: 'fullscreen-photo', config: { directory: 'nature', file: 'root.jpg' } },
        { type: 'photo-slideshow', config: { source: 'immich', directory: 'nature' } },
      ] }] };
      const usage = scanMediaUsage(config, library);
      expect(usage.has('nature/a.jpg')).toBe(false);
      expect(usage.get('root.jpg')![0].kind).toBe('module');
    });
    it('treats an empty file as single-photo mode with nothing picked, like the renderer', () => {
      const config = { screens: [{ modules: [{ type: 'fullscreen-photo', config: { directory: 'nature', file: '' } }] }] };
      expect(scanMediaUsage(config, library).size).toBe(0);
    });
    it('ignores a directory field on any other module type', () => {
      const config = { screens: [{ modules: [{ type: 'iframe', config: { directory: 'nature' } }] }] };
      expect(scanMediaUsage(config, library).size).toBe(0);
    });
  });

  it('carries the display, screen and module ids a use sits under', () => {
    const config = { displays: [{ id: 'main', screens: [
      { id: 's1', name: 'Hall', backgroundImage: 'x.jpg', modules: [{ id: 'm1', type: 'video', config: { file: 'clip.mp4' } }] },
    ] }] };
    const usage = scanMediaUsage(config, new Set(['x.jpg', 'clip.mp4']));
    expect(usage.get('x.jpg')![0]).toMatchObject({ displayId: 'main', screenId: 's1' });
    expect(usage.get('x.jpg')![0].moduleId).toBeUndefined();
    expect(usage.get('clip.mp4')![0]).toMatchObject({ displayId: 'main', screenId: 's1', moduleId: 'm1' });
  });

  it('never throws on odd input shapes', () => {
    expect(scanMediaUsage(null, known).size).toBe(0);
    expect(() => scanMediaUsage(JSON.parse('{"__proto__": "nature/forest.jpg"}'), known)).not.toThrow();
  });
});

describe('classifyMediaRef', () => {
  it('marks serve URLs and legacy static paths as explicit, bare strings as not', () => {
    expect(classifyMediaRef('/api/backgrounds/serve?file=a.jpg')).toEqual({ path: 'a.jpg', explicit: true });
    expect(classifyMediaRef('/backgrounds/a.jpg')).toEqual({ path: 'a.jpg', explicit: true });
    expect(classifyMediaRef('a.jpg')).toEqual({ path: 'a.jpg', explicit: false });
  });
});

describe('scanMissingMedia', () => {
  const existing = new Set(['have.jpg', 'nature/a.jpg', 'rotation-unsplash-x.jpg']);
  const folders = new Set(['nature']);
  it('reports serve URLs and media-looking bare paths that are not on disk, once per path', () => {
    const config = { screens: [
      { id: 's1', name: 'Hall', backgroundImage: '/api/backgrounds/serve?file=gone.jpg' },
      { id: 's2', name: 'Den', backgroundImage: 'gone.jpg' },
      { id: 's3', name: 'Ok', backgroundImage: 'have.jpg' },
      { id: 's4', name: 'Rot', backgroundImage: 'rotation-unsplash-x.jpg' },
    ] };
    const missing = scanMissingMedia(config, existing, folders);
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({ path: 'gone.jpg', kind: 'file' });
    expect(missing[0].uses.map((u) => u.name)).toEqual(['Hall', 'Den']);
  });
  it('ignores bare strings that do not end like a media file', () => {
    const config = { settings: { greeting: 'hello there', locale: 'en-US', theme: 'dark/blue' } };
    expect(scanMissingMedia(config, existing, folders)).toEqual([]);
  });
  it('reports a slideshow folder that is not on disk, and never the top level', () => {
    const config = { screens: [{ id: 's1', name: 'Hall', modules: [
      { id: 'm1', type: 'photo-slideshow', config: { directory: 'old-trips' } },
      { id: 'm2', type: 'photo-slideshow', config: { directory: '' } },
      { id: 'm3', type: 'photo-slideshow', config: { directory: 'nature' } },
    ] }] };
    const missing = scanMissingMedia(config, existing, folders);
    expect(missing).toEqual([{ path: 'old-trips', kind: 'folder', uses: [expect.objectContaining({ kind: 'slideshow', moduleId: 'm1' })] }]);
  });
});

describe('rewriteMediaRefs', () => {
  it('rewrites every reference form in place and reports the count', () => {
    const config = {
      screens: [
        { id: 's1', backgroundImage: 'a.jpg', dayRules: [{ backgroundImage: '/api/backgrounds/serve?file=a.jpg&mt=t' }] },
        { id: 's2', backgroundImage: '/backgrounds/a.jpg', modules: [{ type: 'video', config: { file: 'a.jpg' } }] },
      ],
      note: 'a.jpg is nice',
    };
    const { config: out, changed } = rewriteMediaRefs(config, (p) => (p === 'a.jpg' ? 'trips/a.jpg' : null), () => null);
    expect(changed).toBe(4);
    expect(out).not.toBe(config);
    expect(out.screens[0]!.backgroundImage).toBe('trips/a.jpg');
    expect(out.screens[0]!.dayRules![0]!.backgroundImage).toBe('/api/backgrounds/serve?file=trips%2Fa.jpg&mt=t');
    expect(out.screens[1]!.backgroundImage).toBe('/backgrounds/trips/a.jpg');
    expect(out.screens[1]!.modules![0]!.config.file).toBe('trips/a.jpg');
    // Prose that merely mentions the name is left alone.
    expect(out.note).toBe('a.jpg is nice');
    // Untouched input is not copied.
    expect(config.screens[0].backgroundImage).toBe('a.jpg');
  });

  it('returns the same reference when nothing matches', () => {
    const config = { screens: [{ backgroundImage: 'b.jpg' }] };
    const result = rewriteMediaRefs(config, () => null, () => null);
    expect(result.config).toBe(config);
    expect(result.changed).toBe(0);
  });

  it('maps slideshow folders through the folder mapper, not the file mapper', () => {
    const config = { screens: [{ modules: [
      { type: 'photo-slideshow', config: { source: 'local', directory: 'trips' } },
      { type: 'fullscreen-photo', config: { directory: 'trips', file: 'trips/a.jpg' } },
    ] }] };
    const { config: out, changed } = rewriteMediaRefs(
      config,
      (p) => (p.startsWith('trips/') ? `summer/${p.slice(6)}` : null),
      (f) => (f === 'trips' ? 'summer' : null),
    );
    expect(changed).toBe(2);
    expect(out.screens[0]!.modules[0]!.config.directory).toBe('summer');
    // Single-photo mode: its directory is not a shown folder, only its file moves.
    expect(out.screens[0]!.modules[1]!.config.directory).toBe('trips');
    expect(out.screens[0]!.modules[1]!.config.file).toBe('summer/a.jpg');
  });
});
