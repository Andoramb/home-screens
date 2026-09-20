'use client';

import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from 'react';
import { Check } from 'lucide-react';

interface MemberDotProps extends Omit<ComponentPropsWithoutRef<'div'>, 'color' | 'style'> {
  /** Diameter in px. The ring, the check and the initial are all fractions of it. */
  size: number;
  color: string;
  /** Shown inside a still-to-do dot. Empty where every dot in a section is the same person. */
  initial?: string;
  isCompleted: boolean;
  /** Merged over the computed style, for the caller's own layout needs. */
  style?: CSSProperties;
  /** Drawn inside the dot, over its face: the card's hold-progress ring. */
  children?: ReactNode;
}

/**
 * One person's mark on a chore: a solid disc with a check when done, a ring in
 * their colour with their initial inside when not. Both states read from
 * across a room, and the to-do state is what a parent scans for, so it is
 * never dimmed.
 *
 * The look is shared by the full-screen wall chart and the card chore chart at
 * very different sizes (60px across a room, 33px on a card), which is why every
 * measurement here is a fraction of `size`. Interaction is not shared: the wall
 * dot is a plain click, the card dot carries the press-and-hold guard, so every
 * role, label and handler arrives from the caller and is spread onto the same
 * element.
 */
export default function MemberDot({
  size,
  color,
  initial = '',
  isCompleted,
  style,
  children,
  ...rest
}: MemberDotProps) {
  return (
    <div
      {...rest}
      style={{
        width: size,
        height: size,
        // A dot is a circle whatever the row does: never shrunk by a crowded
        // line, and its ring is drawn inside the size, not added to it.
        flexShrink: 0,
        boxSizing: 'border-box',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...(isCompleted
          ? { background: color }
          : {
              border: `${Math.max(3, Math.round(size * 0.06))}px solid ${color}`,
              background: `color-mix(in srgb, ${color} 16%, transparent)`,
              color,
              fontSize: size * (initial.length > 1 ? 0.34 : 0.42),
              fontWeight: 700,
              lineHeight: 1,
            }),
        ...style,
      }}
    >
      {isCompleted ? <Check size={size * 0.55} color="white" strokeWidth={3} /> : initial}
      {children}
    </div>
  );
}
