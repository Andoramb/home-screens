// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { DEFAULT_MODULE_STYLE, type TrafficConfig } from '@/types/config';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';
import { ModuleSurfaceProvider } from '../module-surface';

let mockData: unknown = null;
vi.mock('@/hooks/useFetchData', () => ({
  useFetchData: () => [mockData, null, null],
}));

import TrafficModule from '../TrafficModule';

const config: TrafficConfig = {
  routes: [{ label: 'Home to Work', origin: 'A', destination: 'B' }],
} as TrafficConfig;

const ui = (surface: 'display' | 'editor', moduleConfig: TrafficConfig = config) => (
  <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>
    <ModuleSurfaceProvider value={surface}>
      <TrafficModule config={moduleConfig} style={{ ...DEFAULT_MODULE_STYLE }} />
    </ModuleSurfaceProvider>
  </I18nProvider>
);

const SAMPLE = {
  routes: [{ label: 'Home to Work', durationMinutes: 22, durationInTrafficMinutes: 28, delayMinutes: 6 }],
  mock: true,
};

afterEach(() => { cleanup(); mockData = null; });

describe('TrafficModule sample data', () => {
  it('replaces sample numbers with the setup card on the wall', () => {
    mockData = SAMPLE;
    render(ui('display'));
    expect(screen.getByTestId('module-setup-state')).toBeTruthy();
    expect(screen.getByText('Traffic needs a Google Maps or TomTom key')).toBeTruthy();
    expect(screen.queryByText('28')).toBeNull();
  });

  it('keeps the sample numbers as a shape preview in the editor, labelled as such', () => {
    mockData = SAMPLE;
    render(ui('editor'));
    expect(screen.getByText('28')).toBeTruthy();
    expect(screen.getByText('Sample numbers until a traffic key is added')).toBeTruthy();
    expect(screen.queryByTestId('module-setup-state')).toBeNull();
  });

  it('renders real numbers on the wall without any sample notice', () => {
    mockData = { routes: SAMPLE.routes };
    render(ui('display'));
    expect(screen.getByText('28')).toBeTruthy();
    expect(screen.queryByText(/Sample numbers/)).toBeNull();
  });
});

describe('TrafficModule routes one at a time', () => {
  const mixedRoutes = {
    routes: [
      { label: 'Home to Work', origin: 'A', destination: 'B' },
      { label: 'New route', origin: 'A', destination: '' },
      { label: 'Lake', origin: 'A', destination: 'zzzz' },
    ],
  } as TrafficConfig;

  it.each(['display', 'editor'] as const)('shows each route its own way on the %s', (surface) => {
    mockData = {
      routes: [
        { label: 'Home to Work', durationMinutes: 22, durationInTrafficMinutes: 28, delayMinutes: 6 },
        { label: 'Lake', error: 'notFound' },
      ],
    };
    render(ui(surface, mixedRoutes));
    expect(screen.getByText('28')).toBeTruthy();
    expect(screen.getByText('Waiting for a start and end address')).toBeTruthy();
    expect(screen.getByText("Can't find this route. Check the addresses.")).toBeTruthy();
    expect(screen.queryByTestId('module-not-updating')).toBeNull();
  });

  it('says plainly when the service did not answer for one route', () => {
    mockData = { routes: [{ label: 'Home to Work', error: 'unavailable' }] };
    render(ui('display'));
    expect(screen.getByText('Home to Work')).toBeTruthy();
    expect(screen.getByText("Can't get the drive time right now")).toBeTruthy();
  });

  it('lists routes that are still being typed instead of loading forever', () => {
    render(ui('editor', { routes: [{ label: 'New route', origin: 'A', destination: '' }] } as TrafficConfig));
    expect(screen.getByText('New route')).toBeTruthy();
    expect(screen.getByText('Waiting for a start and end address')).toBeTruthy();
    expect(screen.queryByText('Loading traffic…')).toBeNull();
  });
});
