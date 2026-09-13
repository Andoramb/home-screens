'use client';

/**
 * The heading above the week cards, and nothing else.
 *
 * It used to carry the week letter and the school-holiday line too, which cost
 * the module a band of its own height whether or not a household had asked for
 * one. No other module on the wall takes a band like that, so those two moved
 * onto the cards: the week letter is a badge beside each name, and the holiday
 * is the card's own day line, which is the thing it replaces anyway.
 *
 * What is left is the heading somebody typed, so a module with no heading draws
 * nothing here and the cards get the whole box.
 *
 * Its size and its band both arrive settled, from the module: the band is
 * height the cards do not get and the size comes from the cards, so the two
 * have to be worked out together or they chase each other. The band is fixed
 * rather than natural, and the heading is one line inside it that gives up its
 * end: it was the second line a long heading wrapped onto that took a fifth of
 * a small module's height and dropped the cards to 7px.
 */

import type { ModuleStyle } from '@/types/config';

export interface TimetableHeaderProps {
  style: ModuleStyle;
  /** The heading, when one is set. Empty draws nothing at all. */
  title?: string;
  /** The size it is drawn at, in CSS pixels, sized off the cards below it. */
  fontPx: number;
  /** The height it takes above the cards, in CSS pixels. */
  bandPx: number;
}

/** The line box the band was budgeted for, so the two cannot drift apart. */
const LINE_HEIGHT = 1.5;

export default function TimetableHeader({ style, title, fontPx, bandPx }: TimetableHeaderProps) {
  if (!title?.trim() || fontPx <= 0) return null;

  return (
    <div
      data-testid="timetable-header"
      style={{
        height: bandPx,
        flexShrink: 0,
        minWidth: 0,
        overflow: 'hidden',
        // The cards bake the module's opacity into their own glass; the line
        // above them carries it itself so the whole module dims together.
        opacity: style.backdropBlur > 0 ? undefined : style.opacity,
      }}
    >
      <div
        data-module-title
        style={{
          fontSize: `${fontPx}px`,
          lineHeight: LINE_HEIGHT,
          fontWeight: 600,
          minWidth: 0,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {title.trim()}
      </div>
    </div>
  );
}
