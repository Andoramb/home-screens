'use client';

/**
 * A text box for a name the row it belongs to cannot do without.
 *
 * The window saves on a debounce and holds back rows that are still being
 * typed, so a box that wrote every keystroke straight into the document
 * destroyed its own row the moment somebody selected the name to retype it:
 * the school name box took every child's week at that school with it, and a
 * blanked break name took the times beside it.
 *
 * So a blank is never committed. The document goes on holding the last real
 * name, the box shows what is being typed, and leaving it empty puts the name
 * back on screen where the household can see nothing was thrown away. The
 * caller hears about that through `onRestore`, in case it has something to say.
 */

import { useState } from 'react';

interface NameInputProps {
  /** The name as the document holds it. Never blank once the row exists. */
  value: string;
  /** Called with every non-blank edit, so the rest of the screen keeps up. */
  onCommit: (name: string) => void;
  /** Called when the box was left empty and `value` was put back. */
  onRestore?: () => void;
  placeholder?: string;
  'aria-label'?: string;
  maxLength?: number;
  className?: string;
}

export default function NameInput({
  value,
  onCommit,
  onRestore,
  placeholder,
  'aria-label': ariaLabel,
  maxLength,
  className,
}: NameInputProps) {
  /** What is in the box while it differs from the document. */
  const [typed, setTyped] = useState<string | null>(null);

  return (
    <input
      type="text"
      value={typed ?? value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      maxLength={maxLength}
      className={className}
      onChange={(event) => {
        const next = event.target.value;
        setTyped(next);
        if (next.trim() !== '') onCommit(next);
      }}
      onBlur={() => {
        const blanked = typed !== null && typed.trim() === '';
        setTyped(null);
        if (blanked) onRestore?.();
      }}
    />
  );
}
