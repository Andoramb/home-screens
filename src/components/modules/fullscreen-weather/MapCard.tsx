'use client';

import { Umbrella } from 'lucide-react';
import { FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import type { WeatherViewProps } from './weather-view-utils';
import { Card, CardLabel } from './parts';
import RadarCanvas from '../shared/RadarCanvas';

const RADAR_REFRESH_MS = FETCH_KEY_REGISTRY['rain-map']?.ttlMs ?? 600_000;

/**
 * The phone page's precipitation card: the Rain Map module's radar inside a
 * card, with a temperature pin at the household's location in place of the
 * module's white dot. Its basemap, zoom and animation are the Forecast view's
 * own settings, so a household can keep a dark standalone map and a light
 * one here.
 */
export default function MapCard({ p, land, style }: { p: WeatherViewProps; land?: boolean; style?: React.CSSProperties }) {
  const { s, u } = p.scale;
  if (p.latitude == null || p.longitude == null) return null;
  const now = p.hourly[0];
  const animate = p.config.mapAnimate !== false;
  const pin = (
    <div style={{
      position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 10,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: u * .5, pointerEvents: 'none',
    }}>
      <div style={{
        width: s * 7, height: s * 7, borderRadius: '50%', background: '#2b2d55', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: s * 3.1, fontWeight: 600,
        border: '4px solid #fff', boxShadow: '0 4px 14px rgba(0,0,0,.35)',
      }}>{now ? Math.round(now.temp) : ''}</div>
      <span style={{
        fontSize: s * 2.2, fontWeight: 600, whiteSpace: 'nowrap',
        color: p.config.mapStyle === 'dark' ? '#fff' : '#1f2235',
        textShadow: p.config.mapStyle === 'dark' ? '0 0 6px #000, 0 0 6px #000' : '0 0 6px #fff, 0 0 6px #fff',
      }}>{p.locationLabel}</span>
    </div>
  );
  return (
    <Card u={u} testId="fsw-map" style={style}>
      <CardLabel icon={Umbrella} s={s}>{p.t('fullscreen-weather.cards.map')}</CardLabel>
      <div style={{ flex: 1, minHeight: 0, marginTop: u * (land ? 1.3 : 1.8), borderRadius: u * 2, overflow: 'hidden', position: 'relative' }}>
        <RadarCanvas
          center={{ lat: p.latitude, lon: p.longitude }}
          zoom={p.config.mapZoom ?? 6}
          mapStyle={p.config.mapStyle ?? 'light'}
          colorScheme={2}
          smooth
          showSnow
          opacity={0.7}
          animationSpeedMs={500}
          extraDelayLastFrameMs={2000}
          showTimestamp
          showTimeline={animate}
          latestOnly={!animate}
          refreshIntervalMs={RADAR_REFRESH_MS}
          marker={pin}
        />
      </div>
    </Card>
  );
}
