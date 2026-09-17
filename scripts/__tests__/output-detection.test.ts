import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import path from 'path';
import { parseWlrRandrOutput } from '@/lib/kiosk';

/**
 * Which Wayland output the kiosk drives.
 *
 * `wlr-randr` reports every connector it knows about, disabled ones included,
 * as `Enabled: no`. Taking the first line therefore put the rotation and the
 * resolution on a dark screen whenever a second port was connected but off,
 * and it defeated the obvious workaround: someone who ran
 * `wlr-randr --output DP-1 --off` to get a second monitor out of the way left
 * DP-1 in the listing and kept losing to it.
 *
 * Three copies do this parse and they cannot share code at runtime: the spoke
 * launcher ships to display-only devices on its own, upgrade.sh emits the hub
 * launcher as a literal string, and the editor's live-apply path is
 * TypeScript. This file holds all three to the same behaviour.
 */

const SCRIPTS = path.join(process.cwd(), 'scripts');
const read = (rel: string) => readFileSync(path.join(SCRIPTS, rel), 'utf-8');

/** The awk program out of a launcher's OUTPUT= line. */
function awkProgram(source: string, { generated }: { generated: boolean }): string {
  const line = source
    .split('\n')
    .find((l) => l.includes('OUTPUT=$(wlr-randr') && l.includes('awk'));
  if (!line) throw new Error('no OUTPUT= detection line found');
  // The hub launcher lives inside a single-quoted bash string, so its quotes
  // are written with the '"'"' idiom and have to be unescaped first.
  const unescaped = generated ? line.split(`'"'"'`).join("'") : line;
  const match = unescaped.match(/awk '(.*)'\)/);
  if (!match) throw new Error(`could not read the awk program from: ${line}`);
  return match[1];
}

const SPOKE = awkProgram(read('kiosk-launcher-display.sh'), { generated: false });
const HUB = awkProgram(read('upgrade.sh'), { generated: true });

/** Run an awk program the way the launcher does. */
const runAwk = (program: string, input: string) =>
  execFileSync('awk', [program], { input, encoding: 'utf8' }).trim();

/** One output block as wlr-randr prints it. */
const block = (name: string, enabled: boolean) =>
  `${name} "Some Vendor MODEL 1234 (${name})"\n`
  + '  Make: Some Vendor\n'
  + `  Enabled: ${enabled ? 'yes' : 'no'}\n`
  + '  Modes:\n'
  + '    1920x1080 px, 60.000000 Hz (preferred, current)\n'
  + '  Position: 0,0\n'
  + '  Transform: normal\n';

const CASES: Array<{ name: string; input: string; want: string }> = [
  {
    name: 'a single connected panel',
    input: block('HDMI-A-1', true),
    want: 'HDMI-A-1',
  },
  {
    name: 'skips a disabled output listed first',
    input: block('DP-1', false) + block('HDMI-A-1', true),
    want: 'HDMI-A-1',
  },
  {
    name: 'skips two disabled outputs to reach the live one',
    input: block('DP-1', false) + block('DP-2', false) + block('HDMI-A-1', true),
    want: 'HDMI-A-1',
  },
  {
    name: 'takes the first when several are live',
    input: block('DP-1', true) + block('HDMI-A-1', true),
    want: 'DP-1',
  },
  {
    name: 'falls back to the first name when none are enabled',
    input: block('DP-1', false) + block('HDMI-A-1', false),
    want: 'DP-1',
  },
  {
    name: 'falls back to HDMI-A-1 when wlr-randr says nothing',
    input: '',
    want: 'HDMI-A-1',
  },
];

describe('output detection', () => {
  describe.each([
    ['the spoke launcher', (input: string) => runAwk(SPOKE, input)],
    ['the hub launcher', (input: string) => runAwk(HUB, input)],
    ['the editor live-apply path', (input: string) => parseWlrRandrOutput(input)],
  ])('%s', (_label, detect) => {
    it.each(CASES)('$name', ({ input, want }) => {
      expect(detect(input)).toBe(want);
    });
  });

  it('keeps the two launcher copies identical', () => {
    // They ship separately and have drifted before; see chromium-flags.test.ts
    // for the flag list this mirrors.
    expect(HUB).toBe(SPOKE);
  });

  it('selects on Enabled rather than on line order', () => {
    for (const program of [HUB, SPOKE]) {
      expect(program).toContain('Enabled: yes');
      expect(program).not.toContain('head -1');
    }
  });
});
