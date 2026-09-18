'use client';

import { useCallback, useState } from 'react';
import { useUpgradeActivityStore } from '@/stores/upgrade-activity-store';

interface UseUpgradeModalReturn {
  /** The tag being installed — non-null while `UpgradeModal` should own the screen. */
  activeTarget: string | null;
  isRollback: boolean;
  fromVersion: string | null;
  onUpgrade: (tag: string, currentVersion: string | null) => void;
  onRollback: (tag: string, currentVersion: string | null) => void;
  onClose: () => void;
  onComplete: () => void;
}

/**
 * Target selection for the upgrade / rollback modal. Upgrade and rollback
 * are tracked separately because the modal renders differently for each,
 * but only one can be active at a time.
 */
export function useUpgradeModal(): UseUpgradeModalReturn {
  const [upgradeTarget, setUpgradeTarget] = useState<string | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<string | null>(null);
  const [fromVersion, setFromVersion] = useState<string | null>(null);
  // Tells the update toast to stop offering the version being installed.
  const setUpgradeActive = useUpgradeActivityStore((s) => s.setActive);

  const clearTargets = useCallback(() => {
    setUpgradeTarget(null);
    setRollbackTarget(null);
  }, []);

  const onUpgrade = useCallback((tag: string, currentVersion: string | null) => {
    setFromVersion(currentVersion);
    setUpgradeTarget(tag);
    setUpgradeActive(true);
  }, [setUpgradeActive]);

  const onRollback = useCallback((tag: string, currentVersion: string | null) => {
    setFromVersion(currentVersion);
    setRollbackTarget(tag);
    setUpgradeActive(true);
  }, [setUpgradeActive]);

  const onClose = useCallback(() => {
    clearTargets();
    setUpgradeActive(false);
  }, [clearTargets, setUpgradeActive]);

  // Deliberately leaves the flag set: the page reloads into the new build a
  // moment from now, and the stale version data behind the toast would
  // otherwise flash the old offer back in the gap.
  const onComplete = useCallback(() => {
    clearTargets();
    setTimeout(() => window.location.reload(), 2000);
  }, [clearTargets]);

  return {
    activeTarget: upgradeTarget || rollbackTarget,
    isRollback: !!rollbackTarget,
    fromVersion,
    onUpgrade,
    onRollback,
    onClose,
    onComplete,
  };
}
