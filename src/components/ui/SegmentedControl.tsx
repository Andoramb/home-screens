'use client';

import { useRef, type KeyboardEvent } from 'react';
import clsx from 'clsx';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  /** The option that is currently chosen. */
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<SegmentedOption<T>>;
  /**
   * Spoken name of the group. A caption drawn by `LabeledField` is a real
   * `<label>`, which names form controls only, so a group of radios has to
   * repeat the wording here or it is announced with no name at all.
   */
  label?: string;
  /**
   * Forwarded to the outer element. `LabeledField as="div"` clones an id onto
   * its single child and points the caption's `htmlFor` at it, so without this
   * the caption would target nothing.
   */
  id?: string;
  disabled?: boolean;
  /** Extra classes for the track. */
  className?: string;
}

/**
 * One value out of a handful, drawn as the app's grey pill.
 *
 * It picks a value rather than turning one thing on, so the options carry
 * `aria-checked` radio semantics instead of `aria-pressed`, and arrow keys
 * move between them the way they do in any radio group. Segments share the
 * width evenly and wrap instead of truncating, so the longest translation
 * still reads in a narrow column.
 */
export default function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  id,
  disabled = false,
  className,
}: SegmentedControlProps<T>) {
  const trackRef = useRef<HTMLDivElement>(null);
  const current = options.findIndex((option) => option.value === value);

  const selectAt = (index: number) => {
    const option = options[index];
    if (!option || disabled) return;
    if (option.value !== value) onChange(option.value);
    // Keyboard movement selects and focuses in one step. The buttons keep
    // their positions across the re-render, so index is a safe handle.
    trackRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[index]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || options.length === 0) return;
    const from = current < 0 ? 0 : current;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        selectAt((from + 1) % options.length);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        selectAt((from - 1 + options.length) % options.length);
        break;
      case 'Home':
        event.preventDefault();
        selectAt(0);
        break;
      case 'End':
        event.preventDefault();
        selectAt(options.length - 1);
        break;
      default:
        break;
    }
  };

  return (
    <div
      ref={trackRef}
      id={id}
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onKeyDown={handleKeyDown}
      className={clsx(
        'flex w-full rounded-md border border-hs-border bg-hs-card p-0.5',
        disabled && 'opacity-50',
        className,
      )}
    >
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            // Arrow keys move inside a radio group, Tab moves past it, so only
            // one option is a tab stop. An unrecognised value leaves the first.
            tabIndex={checked || (current < 0 && index === 0) ? 0 : -1}
            disabled={disabled}
            onClick={() => selectAt(index)}
            className={clsx(
              'flex-1 rounded px-2 py-1 text-xs leading-tight transition-colors',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-hs-accent',
              'disabled:cursor-not-allowed',
              checked
                ? 'bg-hs-hover text-hs-text-primary'
                : 'text-hs-text-faint hover:text-hs-text-secondary',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
