/**
 * An in-memory revision the hub carries on the wall's heartbeat
 * (`readDisplayRevisions`): routes bump it when something a wall shows
 * changed, and a wall re-reads that data within a few seconds instead of on
 * its own poll.
 *
 * In memory only. A hub restart starts a new run id, so every wall reads the
 * data as changed once, which also covers anything that changed while the
 * hub was down.
 *
 * Held on `globalThis` because route bundles can each carry their own copy of
 * a module (webpack dev does), and the heartbeat must see the bumps every
 * route makes.
 */

export interface HubRevision {
  /** Record that the data changed. */
  bump(): void;
  /** The current revision; a different string means the data changed. */
  current(): string;
}

interface HubRevisionState {
  run: string;
  counter: number;
}

export function createHubRevision(name: string): HubRevision {
  const key = Symbol.for(`home-screens.${name}-revision.v1`);
  const globals = globalThis as typeof globalThis & { [key: symbol]: HubRevisionState | undefined };
  const state: HubRevisionState = globals[key] ??= { run: Date.now().toString(36), counter: 0 };
  return {
    bump: () => {
      state.counter += 1;
    },
    current: () => `${state.run}.${state.counter}`,
  };
}
