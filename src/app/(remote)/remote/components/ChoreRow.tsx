'use client';

import { Check, Lock } from 'lucide-react';
import ChoreIcon from '@/components/modules/chore-chart/ChoreIcon';
import { useHoldToUncheck } from '@/hooks/useHoldToUncheck';
import { useTranslate } from '@/i18n';

/** Minimal shape the row renders from — the parent's assignment carries more fields. */
export interface ChoreRowAssignment {
  choreId: string;
  choreName: string;
  choreEmoji: string;
  points: number;
  isCompleted: boolean;
}

interface ChoreRowProps {
  assignment: ChoreRowAssignment;
  /** Optimistic in-flight toggle for this row — dims and disables it. */
  isToggling: boolean;
  /** True for kids viewing a past day: locked chip, non-interactive, not a button. */
  readOnly: boolean;
  /**
   * Kid view: un-checking a finished chore takes a press-and-hold instead of a
   * tap. A tap is how a sibling "accidentally" undoes someone else's work; a
   * hold is deliberate. Checking a chore off stays a single tap.
   */
  holdToUncheck?: boolean;
  /** Fill color for the completed checkbox (selected member's color, else accent). */
  checkedColor: string;
  showPoints: boolean;
  onToggle: () => void;
}

/**
 * A single chore card in the Today list. The read-only branch (kids viewing a
 * past day) renders a non-interactive div with a locked chip rather than a
 * button, so it is not announced as clickable.
 */
export default function ChoreRow({
  assignment,
  isToggling,
  readOnly,
  holdToUncheck = false,
  checkedColor,
  showPoints,
  onToggle,
}: ChoreRowProps) {
  const t = useTranslate('remote');
  const done = assignment.isCompleted;
  const holdMode = holdToUncheck && done && !readOnly && !isToggling;

  // The gesture itself lives in the hook, shared with the wall chart so the
  // two surfaces cannot drift apart on what a tap and a hold each mean.
  const hold = useHoldToUncheck();
  const handlers = hold.rowHandlers(assignment.choreId, holdMode, onToggle);
  const holding = hold.holdingKey === assignment.choreId;
  const hint = hold.hintKey === assignment.choreId;

  const rowStyle = {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 16px',
    background: done ? 'var(--hs-bg-card)' : 'var(--hs-bg-hover)',
    borderRadius: 12,
    marginBottom: 6,
    cursor: readOnly ? ('default' as const) : ('pointer' as const),
    transition: 'all 0.15s',
    border: 'none',
    color: 'inherit',
    textAlign: 'left' as const,
    opacity: isToggling ? 0.6 : 1,
    // A long press must not open the browser's copy/share sheet.
    userSelect: 'none' as const,
    WebkitUserSelect: 'none' as const,
    WebkitTouchCallout: 'none' as const,
    touchAction: 'pan-y' as const,
  };

  const checkbox = readOnly ? (
    // Locked chip: kid-viewing-past — visually distinct, not interactive
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        background: done ? 'var(--hs-bg-hover)' : 'var(--hs-bg-card)',
        border: done ? 'none' : '1px dashed var(--hs-border-strong)',
        color: 'var(--hs-text-faint)',
      }}
      aria-hidden="true"
    >
      {done ? (
        <Check size={16} color="var(--hs-text-muted)" strokeWidth={2.5} />
      ) : (
        <Lock size={12} color="var(--hs-text-faint)" strokeWidth={2.25} />
      )}
    </div>
  ) : (
    <div
      style={{
        position: 'relative',
        width: 28,
        height: 28,
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        transition: 'all 0.15s',
        background: done ? checkedColor : 'transparent',
        border: done ? 'none' : '2px solid var(--hs-border-strong)',
        overflow: 'hidden',
      }}
    >
      {/* Hold progress: the fill drains from the checkbox as the hold runs. */}
      {holding && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background: 'var(--hs-bg-card)',
            transformOrigin: 'bottom',
            transform: `scaleY(${hold.progress})`,
            opacity: 0.85,
          }}
        />
      )}
      {done && <Check size={16} color="white" strokeWidth={2.5} style={{ position: 'relative' }} />}
    </div>
  );

  const rowInner = (
    <>
      {checkbox}

      {assignment.choreEmoji && (
        <span style={{ flexShrink: 0 }}>
          <ChoreIcon value={assignment.choreEmoji} size={20} color={done ? 'var(--hs-text-faint)' : 'var(--hs-text-muted)'} />
        </span>
      )}

      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span
          style={{
            fontSize: 15,
            fontWeight: 500,
            textDecoration: done ? 'line-through' : 'none',
            color: done ? 'var(--hs-text-faint)' : 'var(--hs-text-body)',
          }}
        >
          {assignment.choreName}
        </span>
        {hint && (
          <span role="status" style={{ fontSize: 12, color: checkedColor, fontWeight: 500 }}>
            {t('choresTab.holdToUncheckHint')}
          </span>
        )}
      </span>

      {showPoints && assignment.points > 0 && (
        <span
          style={{
            fontSize: 11,
            flexShrink: 0,
            padding: '2px 8px',
            borderRadius: 999,
            background: 'var(--hs-bg-hover)',
            color: 'var(--hs-text-faint)',
            opacity: done ? 0.3 : 1,
          }}
        >
          {assignment.points === 1
            ? t('choresTab.ticketCountSingular', { n: assignment.points })
            : t('choresTab.ticketCountPlural', { n: assignment.points })}
        </span>
      )}
    </>
  );

  if (readOnly) {
    // Non-interactive row: not a button, no press-scale, not announced as clickable.
    return <div style={rowStyle}>{rowInner}</div>;
  }

  return (
    <button
      className="press-scale"
      {...handlers}
      disabled={isToggling}
      aria-label={
        done
          ? t('choresTab.choreAriaLabelCompleted', { chore: assignment.choreName })
          : t('choresTab.choreAriaLabelMarkComplete', { chore: assignment.choreName })
      }
      style={rowStyle}
    >
      {rowInner}
    </button>
  );
}
