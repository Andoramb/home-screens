import { describe, it, expect } from 'vitest';
import { splitPlaceholders } from '@/components/editor/settings/DisplaysIndexPage';
import { LOCALES } from '@/i18n/manifest';
import { loadDict } from '@/i18n/__tests__/helpers/dict';
import en from '@/translations/en-US/editor.json';

/**
 * The sentence that explains how a second Pi joins.
 *
 * It used to be spliced from three keys around a styled label, and the tail of
 * the label was repeated in the key that followed it: "it will appear below as
 * an display waiting to be added waiting to be added with one click". One
 * sentence with named slots is both readable in English and translatable into
 * languages that put the pieces in another order, so this pins that shape
 * rather than just the wording.
 */

const BULLET = en.settings.displaysIndex.emptyBullet2;
const COMMAND = 'install.sh --display-only';

function sentence(template: string, label: string): string {
  return splitPlaceholders(template, ['command', 'label'])
    .map((part) => ('text' in part ? part.text : part.name === 'command' ? COMMAND : label))
    .join('');
}

describe('the "flash another Pi" bullet', () => {
  it('reads as one sentence with the label dropped in once', () => {
    const label = en.settings.displaysIndex.unadoptedLabel;
    const filled = sentence(BULLET, label);

    expect(filled).toBe(
      'Or flash another Pi with install.sh --display-only. Once it boots it will appear below as a display waiting to be added, and one click adds it.',
    );
    expect(filled.split(label)).toHaveLength(2);
    expect(filled).not.toMatch(/\ban display\b/);
  });

  it('keeps the command and the label as separate pieces to style', () => {
    const parts = splitPlaceholders(BULLET, ['command', 'label']);
    expect(parts.filter((p) => 'name' in p && p.name === 'command')).toHaveLength(1);
    expect(parts.filter((p) => 'name' in p && p.name === 'label')).toHaveLength(1);
  });

  it('carries both slots in every shipped locale', () => {
    for (const locale of Object.keys(LOCALES)) {
      const dict = loadDict(locale, 'editor') as { settings: { displaysIndex: Record<string, string> } };
      const template = dict.settings.displaysIndex.emptyBullet2;
      const parts = splitPlaceholders(template, ['command', 'label']);
      expect(parts.filter((p) => 'name' in p).map((p) => ('name' in p ? p.name : '')).sort(), locale)
        .toEqual(['command', 'label']);
    }
  });
});

describe('splitPlaceholders', () => {
  it('returns the whole string when it holds no slots', () => {
    expect(splitPlaceholders('plain text', ['a'])).toEqual([{ text: 'plain text' }]);
  });

  it('keeps an unnamed brace as ordinary text', () => {
    expect(splitPlaceholders('a {b} c', ['a'])).toEqual([{ text: 'a {b} c' }]);
  });

  it('drops the empty pieces either side of a slot', () => {
    expect(splitPlaceholders('{a}', ['a'])).toEqual([{ name: 'a' }]);
  });
});
