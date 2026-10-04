import type { TrafficRoute } from '@/types/config';

/**
 * Rules for the Traffic module's routes, shared by the URL it fetches with,
 * the route that looks them up, and the module that draws the answer.
 */

/**
 * A route with both ends filled in. Anything less is still being typed in
 * the editor: it is never sent to a traffic service (a blank address fails
 * the lookup) and the module shows it as waiting for its addresses.
 */
export function isCompleteTrafficRoute(route: Partial<TrafficRoute> | null | undefined): boolean {
  return typeof route?.origin === 'string' && route.origin.trim() !== ''
    && typeof route?.destination === 'string' && route.destination.trim() !== '';
}

/**
 * Why one route has no drive time. `notFound`: the service cannot place an
 * address or find a way between them, which only fixing the route helps.
 * `unavailable`: the service did not answer for this route right now.
 */
export type TrafficRouteError = 'notFound' | 'unavailable';

export interface TrafficTimes {
  durationMinutes: number;
  durationInTrafficMinutes: number;
  delayMinutes: number;
}

/** One route's answer from `/api/traffic`: its drive times, or why it has none. */
export type TrafficRouteResult =
  | ({ label: string } & TrafficTimes)
  | { label: string; error: TrafficRouteError };

/** What the module draws for one of its routes. */
export type TrafficRow =
  | { route: TrafficRoute; state: 'incomplete' }
  | { route: TrafficRoute; state: 'answered'; result: TrafficRouteResult };

/**
 * Pairs every configured route with its answer. The request carries only the
 * complete routes, in order, so the answers line up with those and the
 * incomplete ones keep their place in the list without one. A complete route
 * the answer on hand does not cover (it was asked for before the route was
 * finished) is left out until its answer arrives.
 */
export function trafficRows(routes: TrafficRoute[], results: TrafficRouteResult[] | undefined): TrafficRow[] {
  const rows: TrafficRow[] = [];
  let next = 0;
  for (const route of routes) {
    if (!isCompleteTrafficRoute(route)) {
      rows.push({ route, state: 'incomplete' });
      continue;
    }
    const result = results?.[next++];
    if (result) rows.push({ route, state: 'answered', result });
  }
  return rows;
}
