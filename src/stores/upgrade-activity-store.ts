import { create } from 'zustand';

interface UpgradeActivityState {
  /**
   * True from the moment the user starts an upgrade or rollback until they
   * close the modal (or the device reloads into the new build).
   */
  active: boolean;
  setActive: (active: boolean) => void;
}

/**
 * Whether an upgrade is running in THIS tab.
 *
 * `/api/system/version` reports `upgradeRunning` for every other surface,
 * but the update notification only polls it once an hour, so the tab that
 * starts the upgrade would keep offering the very version it is installing
 * for the rest of that hour. The store closes that window locally; the
 * server flag still covers the phone and any other open tab.
 */
export const useUpgradeActivityStore = create<UpgradeActivityState>((set) => ({
  active: false,
  setActive: (active) => set({ active }),
}));
