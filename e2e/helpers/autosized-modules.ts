import { getAllModuleDefinitions } from '@/lib/module-registry';
import type { ModuleType } from '@/types/config';

/**
 * Modules that size their type off their measured box, via `useScaledFontSize`
 * or `useFitFontSize`.
 *
 * Read from the registry's `autoSizesText` flag, which is what the editor uses
 * to explain what the Font Size slider does for the selected module. The flag
 * is enforced, not maintained by hand: a `meta` ratchet walks the import graph
 * of every entry in `module-components.ts` and fails if a module reaching
 * either hook is not flagged, or if a flagged module no longer reaches one.
 */
export const AUTOSIZED_MODULES: ModuleType[] = getAllModuleDefinitions()
  .filter((def) => def.autoSizesText)
  .map((def) => def.type);

/**
 * A reasoned exemption from one of the two properties the auto-size matrix
 * asserts. A reason here is a claim about how the module is *meant* to behave,
 * not a place to park one that fails.
 *
 * - `fill`: skip "the largest type is a real fraction of the card". Grid
 *   layouts break the assumption behind it, which is that the card height is
 *   the right denominator.
 * - `growth`: the ratio between the two boxes is not the module's own. Either
 *   it renders the same size in any box by design, or the small box's largest
 *   type is a pixel floor the module holds small print to rather than a size it
 *   chose. Either way the matrix asserts the opposite property (that the
 *   largest type does NOT double) instead.
 */
export interface AutoSizeExemption {
  fill?: string;
  growth?: string;
}

export const AUTOSIZE_EXEMPTIONS: Partial<Record<string, AutoSizeExemption>> = {
  countdown: {
    // The flip cards are authored at 28px times the module's own `scale` config
    // and ignore the box, so a countdown renders the same digits in a 220px card
    // and a 900px one. `scale` is the intended control and the E2E variant rows
    // pin 28 * scale exactly. A size that never grows also falls below any fill
    // floor once the box is big enough, so both properties are excused.
    growth: 'flip cards are 28px * config.scale, not box-derived',
    fill: 'see growth: a fixed size cannot hold a fraction of an arbitrary box',
  },
  'multi-month': {
    // Its largest type is a day number in a six-week by seven-day grid, so the
    // card height is the wrong denominator: 13.6px in a 900px card is one cell
    // of forty-two, not type lost in a void. It still has to grow with its box,
    // and does (2.67x across the pair).
    fill: 'a 6x7 grid: the cell, not the card, is what its type is sized against',
  },
  timetable: {
    // The same shape as multi-month, one card further in: two week cards side
    // by side, each a five-day grid of eight bell rows. The largest type is a
    // name over one of those grids (22.9px in the 900px box, 2.5%), so the
    // module's height is the wrong denominator for it.
    fill: 'week grids side by side: the cell, not the card, is what their type is sized against',
    // This used to carry a `growth` exemption too, because the small box
    // measured a pixel floor rather than type the card had chosen: a card that
    // asked for less than the floor was rescued up to it, so the floor was the
    // largest thing on screen over a card drawing 6px. A card now declines a
    // size it cannot hold instead of being rescued, so the pair measures the
    // card's own answer at both ends and the type really does follow the box.
  },
};
