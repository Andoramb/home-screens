'use client';

import { useTranslate } from '@/i18n';
import MemberDot from '../shared/MemberDot';
import type { ToggleParams } from './helpers';

interface AssigneeDotProps {
  memberId: string;
  isCompleted: boolean;
  dotSize: number;
  choreId: string;
  choreName: string;
  memberName: string;
  memberColor: string;
  initial: string;
  allowTouch: boolean;
  onToggle: (params: ToggleParams) => void;
}

/**
 * One member's mark on a wall-chart chore row. The disc itself is
 * `MemberDot`, shared with the card chore chart; this adds the wall's own
 * interaction, which is a plain tap in both directions.
 */
export default function AssigneeDot({
  memberId,
  isCompleted,
  dotSize,
  choreId,
  choreName,
  memberName,
  memberColor,
  initial,
  allowTouch,
  onToggle,
}: AssigneeDotProps) {
  const t = useTranslate('modules');

  return (
    <MemberDot
      data-testid="fcc-dot"
      className={allowTouch ? 'press-dot' : undefined}
      role={allowTouch ? 'button' : undefined}
      tabIndex={allowTouch ? 0 : undefined}
      onClick={
        allowTouch
          ? () => onToggle({ choreId, memberId, choreName, memberName, memberColor, wasCompleted: isCompleted })
          : undefined
      }
      aria-label={
        allowTouch
          ? t(
              isCompleted
                ? 'fullscreen-chore-chart.ariaLabels.undoChore'
                : 'fullscreen-chore-chart.ariaLabels.completeChore',
              { chore: choreName, member: memberName },
            )
          : undefined
      }
      style={{ cursor: allowTouch ? 'pointer' : 'default' }}
      size={dotSize}
      color={memberColor}
      initial={initial}
      isCompleted={isCompleted}
    />
  );
}
