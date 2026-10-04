import { describe, it, expect } from 'vitest';
import { isCompleteTrafficRoute, trafficRows, type TrafficRouteResult } from '@/lib/traffic-routes';

describe('isCompleteTrafficRoute', () => {
  it('needs both addresses, ignoring spaces', () => {
    expect(isCompleteTrafficRoute({ label: 'Work', origin: '1 Main St', destination: '2 Oak Ave' })).toBe(true);
    expect(isCompleteTrafficRoute({ label: 'Work', origin: '1 Main St', destination: '' })).toBe(false);
    expect(isCompleteTrafficRoute({ label: 'Work', origin: '   ', destination: '2 Oak Ave' })).toBe(false);
    expect(isCompleteTrafficRoute({ label: 'Work' })).toBe(false);
    expect(isCompleteTrafficRoute(null)).toBe(false);
  });
});

describe('trafficRows', () => {
  const work = { label: 'Work', origin: 'A', destination: 'B' };
  const typing = { label: 'New route', origin: 'A', destination: '' };
  const school = { label: 'School', origin: 'A', destination: 'C' };

  it('lines the answers up with the complete routes and keeps the incomplete one in its place', () => {
    const results: TrafficRouteResult[] = [
      { label: 'Work', durationMinutes: 20, durationInTrafficMinutes: 25, delayMinutes: 5 },
      { label: 'School', error: 'notFound' },
    ];
    expect(trafficRows([work, typing, school], results)).toEqual([
      { route: work, state: 'answered', result: results[0] },
      { route: typing, state: 'incomplete' },
      { route: school, state: 'answered', result: results[1] },
    ]);
  });

  it('shows every route as waiting when nothing could be asked for', () => {
    expect(trafficRows([typing], undefined)).toEqual([{ route: typing, state: 'incomplete' }]);
  });

  it('leaves out a complete route the answer on hand does not cover yet', () => {
    const results: TrafficRouteResult[] = [{ label: 'Work', durationMinutes: 20, durationInTrafficMinutes: 25, delayMinutes: 5 }];
    expect(trafficRows([work, school], results)).toEqual([{ route: work, state: 'answered', result: results[0] }]);
    expect(trafficRows([work], [])).toEqual([]);
  });
});
