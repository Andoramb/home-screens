'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SKY_BASES, type SkyScene } from './sky-layer';
import { useCloudSprites, CLOUD_TILE_W, CLOUD_TILE_H, CLOUD_LAYERS } from './cloud-sprites';
import { MoonImage } from './moon';

/**
 * The living sky: an animated background that matches the weather.
 *
 * Every layer is an absolutely positioned element animated with transform
 * and opacity only, so a Raspberry Pi's compositor does all of it. No
 * `filter`, no canvas loop, no JavaScript per frame. The rules that keep it
 * cheap and seamless:
 *
 * - Clouds: three tinted sprite layers (far, mid, near) repeated along x on
 *   a layer one tile wider than the canvas, slid by exactly one tile width,
 *   so the loop is seamless at any canvas width and parallax comes free.
 * - Fog: wide, low wisps on three layers sliding at three speeds, two one
 *   way and one the other; a wisp that crosses the tile seam has a twin one
 *   tile over.
 * - Rain and snow: a layer one tile taller than the canvas slid down by one
 *   tile height, at two depths, in a container that skews the rain.
 * - Lightning: a glow from behind the cloud deck every 13 s, never a
 *   full-screen white.
 * - A faint scrim over the top of the sky so white type survives a white
 *   cloud behind the hero.
 *
 * A scene change cross-fades: the old stack stays underneath while the new
 * one fades in over a few seconds, then unmounts.
 */
const FADE_MS = 3000;

/**
 * `moonPlace` says where the moon may sit: beside the Forecast page's big
 * temperature (`hero`), or up in the header band where every other view
 * keeps only its place name and the clock (`header`).
 */
export default function LivingSky({ scene, moonPhase, moonPlace = 'header' }: { scene: SkyScene; moonPhase?: number; moonPlace?: 'hero' | 'header' }) {
  const [stacks, setStacks] = useState<Array<{ scene: SkyScene; id: number }>>(() => [{ scene, id: 0 }]);
  const nextId = useRef(1);
  const current = stacks[stacks.length - 1];
  useEffect(() => {
    if (current.scene.key === scene.key) return;
    setStacks((prev) => [...prev, { scene, id: nextId.current++ }]);
  }, [scene, current.scene.key]);
  // The incoming stack says when its fade is done; everything under it goes.
  // (A timer set in the effect above was cleared by its own cleanup as soon
  // as the new stack landed, and the old stacks piled up for good.)
  const settled = useCallback((id: number) => setStacks((prev) => prev.filter((s) => s.id >= id)), []);

  return (
    <div data-testid="fsw-sky" className={`fsw-sky fsw-sky-moon-${moonPlace}`} data-scene={current.scene.key} aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden', containerType: 'size' }}>
      <Keyframes />
      {stacks.map((s, i) => (
        <Stack key={s.id} id={s.id} scene={s.scene} moonPhase={moonPhase} fadeIn={i > 0} onSettled={settled} />
      ))}
    </div>
  );
}

function Stack({ id, scene, moonPhase, fadeIn, onSettled }: {
  id: number; scene: SkyScene; moonPhase?: number; fadeIn: boolean; onSettled: (id: number) => void;
}) {
  const sprites = useCloudSprites(Object.keys(scene.clouds).length ? scene.palette : null);
  const [shown, setShown] = useState(!fadeIn);
  useEffect(() => {
    if (!fadeIn) return;
    const raf = requestAnimationFrame(() => setShown(true));
    const timer = setTimeout(() => onSettled(id), FADE_MS + 100);
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); };
  }, [fadeIn, id, onSettled]);

  return (
    <div style={{
      position: 'absolute', inset: 0, background: SKY_BASES[scene.base],
      opacity: shown ? 1 : 0, transition: fadeIn ? `opacity ${FADE_MS}ms ease` : undefined,
    }}>
      {scene.stars && <Stars />}
      {scene.sun && <Sun low={scene.sun === 'low'} />}
      {scene.moon && <Moon phase={moonPhase ?? 0} />}
      {scene.deck && <Deck base={scene.base} />}
      {scene.lightning && <Lightning />}
      {CLOUD_LAYERS.map((layer) => {
        const opacity = scene.clouds[layer];
        if (opacity == null) return null;
        return (
          <div key={layer} style={{
            position: 'absolute', left: 0, top: 0, height: CLOUD_TILE_H,
            width: `calc(100% + ${CLOUD_TILE_W}px)`,
            backgroundImage: sprites ? `url(${sprites[layer]})` : undefined,
            backgroundRepeat: 'repeat-x', backgroundSize: `${CLOUD_TILE_W}px ${CLOUD_TILE_H}px`,
            // The sprites arrive a beat after the base paints: ease them in.
            opacity: sprites ? opacity : 0, transition: 'opacity 1.5s ease',
            animation: `fsw-sky-slide ${CLOUD_SPEED_S[layer]}s linear infinite`,
            willChange: 'transform',
          }} />
        );
      })}
      {scene.mist && <Mist night={scene.base === 'fog-night'} />}
      {scene.rain && <Rain />}
      {scene.snow && <Snow />}
      <div style={{
        position: 'absolute', left: 0, top: 0, width: '100%', height: '40%',
        background: 'radial-gradient(55% 80% at 50% 30%, rgba(10,14,30,.26), rgba(10,14,30,0) 100%)',
      }} />
    </div>
  );
}

/** Seconds per tile width: far is slowest, near fastest, so the layers part as they drift. */
// Seconds per tile. The tile is two screens wide, so a cloud crosses a
// 1080 px wall in half of this.
const CLOUD_SPEED_S = { far: 640, mid: 400, near: 250, veil: 520 } as const;
/** The mist wisps are drawn in pixels on their own one-screen tile. */
const MIST_TILE_W = 1080;

function Keyframes() {
  return (
    <style>{`
      @keyframes fsw-sky-slide { from { transform: translate3d(0,0,0); } to { transform: translate3d(-${CLOUD_TILE_W}px,0,0); } }
      @keyframes fsw-sky-slide-back { from { transform: translate3d(-${CLOUD_TILE_W}px,0,0); } to { transform: translate3d(0,0,0); } }
      @keyframes fsw-sky-slide-mist { from { transform: translate3d(0,0,0); } to { transform: translate3d(-${MIST_TILE_W}px,0,0); } }
      .fsw-sky { --fsw-moon-size: min(11cqw, 8cqh); --fsw-moon-left: 70cqw; --fsw-moon-top: 1.5cqh; }
      .fsw-sky-moon-hero { --fsw-moon-size: min(15cqw, 17cqh); --fsw-moon-left: 67cqw; --fsw-moon-top: 12cqh; }
      @container (orientation: landscape) {
        .fsw-sky { --fsw-moon-size: min(10cqh, 7cqw); --fsw-moon-left: 80cqw; --fsw-moon-top: 2cqh; }
        .fsw-sky-moon-hero { --fsw-moon-size: min(13cqh, 9cqw); --fsw-moon-left: 78cqw; --fsw-moon-top: 9cqh; }
      }
      @keyframes fsw-sky-slide-mist-back { from { transform: translate3d(-${MIST_TILE_W}px,0,0); } to { transform: translate3d(0,0,0); } }
      @keyframes fsw-sky-twinkle { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }
      @keyframes fsw-sky-breathe { from { transform: scale(1); } to { transform: scale(1.07); } }
      @keyframes fsw-sky-fall-480 { from { transform: translate3d(0,-480px,0); } to { transform: translate3d(0,0,0); } }
      @keyframes fsw-sky-fall-600 { from { transform: translate3d(0,-600px,0); } to { transform: translate3d(0,0,0); } }
      @keyframes fsw-sky-sway { from { transform: translate3d(-22px,0,0); } to { transform: translate3d(22px,0,0); } }
      @keyframes fsw-sky-flash { 0%, 100% { opacity: 0; } 46% { opacity: 0; } 46.6% { opacity: .32; } 47.4% { opacity: .06; } 48.2% { opacity: .22; } 49.5% { opacity: 0; } }
    `}</style>
  );
}

/**
 * The star field: one generated tile (public/sky/stars.png, white on
 * transparent, from scripts/sky-sprites.mjs) repeated in both directions,
 * twice at different scales so the repeat never reads, each breathing on its
 * own twinkle cycle. A cool haze sits behind it up and to the right.
 */
const STAR_LAYERS = [
  { size: '540px 960px', position: '0 0', opacity: .95, dur: 7, delay: 0 },
  { size: '918px 1632px', position: '310px 140px', opacity: .5, dur: 11, delay: 3 },
];

function Stars() {
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(60% 30% at 80% 20%, rgba(129,140,248,.22), transparent 70%)' }} />
      {STAR_LAYERS.map((l, i) => (
        <div key={i} style={{
          position: 'absolute', inset: 0, backgroundImage: 'url(/sky/stars.png)', backgroundRepeat: 'repeat',
          backgroundSize: l.size, backgroundPosition: l.position,
          opacity: l.opacity, animation: `fsw-sky-twinkle ${l.dur}s ease-in-out ${l.delay}s infinite`,
        }} />
      ))}
    </>
  );
}

/** The sun: a soft glow high above the canvas by day, sitting on the horizon at golden hour. */
function Sun({ low }: { low: boolean }) {
  return (
    <div style={{
      position: 'absolute', width: 900, height: 900, borderRadius: '50%', left: '50%', marginLeft: -450,
      top: low ? '51%' : -560, willChange: 'transform',
      background: low
        ? 'radial-gradient(circle, rgba(255,236,190,1) 0%, rgba(255,170,90,.6) 12%, rgba(255,120,80,.25) 28%, transparent 60%)'
        : 'radial-gradient(circle, rgba(255,246,214,.95) 0%, rgba(255,222,140,.55) 14%, rgba(255,200,90,.22) 30%, transparent 60%)',
      animation: 'fsw-sky-breathe 9s ease-in-out infinite alternate',
    }} />
  );
}

/**
 * The moon, photographed, at its real phase, placed where the phone puts it:
 * beside the temperature on the right, under the cloud layers so a veil can
 * cross it. Container units size and place it, so a portrait wall and a
 * landscape one each get a moon in proportion (the rules live in Keyframes).
 */
function Moon({ phase }: { phase: number }) {
  return <MoonImage phase={phase} size="var(--fsw-moon-size)" glow style={{ position: 'absolute', left: 'var(--fsw-moon-left)', top: 'var(--fsw-moon-top)', opacity: .95 }} />;
}

const DECKS: Partial<Record<SkyScene['base'], string>> = {
  storm: 'linear-gradient(180deg, rgba(40,46,64,.75) 0%, rgba(40,46,64,.4) 45%, rgba(40,46,64,0) 100%)',
  rain: 'linear-gradient(180deg, rgba(40,46,64,.75) 0%, rgba(40,46,64,.4) 45%, rgba(40,46,64,0) 100%)',
  snow: 'linear-gradient(180deg, rgba(210,218,232,.5) 0%, rgba(210,218,232,.25) 45%, rgba(210,218,232,0) 100%)',
  'cloudy-night': 'linear-gradient(180deg, rgba(30,34,52,.7) 0%, rgba(30,34,52,.35) 45%, rgba(30,34,52,0) 100%)',
};
const DECK_DEFAULT = 'linear-gradient(180deg, rgba(190,198,212,.5) 0%, rgba(190,198,212,.3) 40%, rgba(190,198,212,0) 100%)';

function Deck({ base }: { base: SkyScene['base'] }) {
  return <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '42%', background: DECKS[base] ?? DECK_DEFAULT }} />;
}

function Lightning() {
  return (
    <div style={{
      position: 'absolute', left: 0, top: 0, width: '100%', height: '55%', opacity: 0,
      background: 'radial-gradient(55% 60% at 32% 10%, rgba(226,232,255,.95), rgba(200,210,255,.4) 45%, transparent 75%)',
      animation: 'fsw-sky-flash 13s linear infinite',
    }} />
  );
}

/** A wisp of fog: a wide, low ellipse at an x in the 1080px tile and a y as a share of the height. */
function wisp(w: number, h: number, x: number, yPct: number, rgb: string, a: number): string {
  return `radial-gradient(ellipse ${w}px ${h}px at ${x}px ${yPct}%, rgba(${rgb},${a}), rgba(${rgb},0) 100%)`;
}
/**
 * A wisp plus its twin one mist tile over when it crosses the seam. The
 * ellipse's `w` is its horizontal radius (CSS radial-gradient sizes are
 * radii), so a wisp reaches from x - w to x + w.
 */
function wisps(rgb: string, items: Array<[number, number, number, number, number]>): string {
  const out: string[] = [];
  for (const [w, h, x, y, a] of items) {
    out.push(wisp(w, h, x, y, rgb, a));
    if (x - w < 0) out.push(wisp(w, h, x + MIST_TILE_W, y, rgb, a));
    if (x + w > MIST_TILE_W) out.push(wisp(w, h, x - MIST_TILE_W, y, rgb, a));
  }
  return out.join(',');
}

const MIST_LAYERS = [
  { dur: 150, back: false, opacity: .85, image: wisps('238,241,247', [[620, 120, 300, 16, .5], [540, 100, 820, 33, .45], [600, 130, 440, 56, .45], [560, 120, 760, 79, .5]]) },
  { dur: 230, back: true, opacity: .75, image: wisps('228,232,240', [[680, 150, 700, 7, .42], [580, 110, 260, 43, .4], [640, 140, 600, 68, .42], [600, 130, 900, 92, .4]]) },
  { dur: 95, back: false, opacity: .5, image: wisps('255,255,255', [[420, 60, 420, 24, .5], [400, 56, 900, 52, .45], [440, 64, 360, 74, .45]]) },
];

function Mist({ night }: { night: boolean }) {
  return (
    <>
      {MIST_LAYERS.map((l, i) => (
        <div key={i} style={{
          position: 'absolute', left: 0, top: 0, height: '100%', width: `calc(100% + ${MIST_TILE_W}px)`,
          backgroundImage: l.image, backgroundRepeat: 'repeat-x', backgroundSize: `${MIST_TILE_W}px 100%`,
          opacity: night ? l.opacity * .45 : l.opacity, willChange: 'transform',
          animation: `${l.back ? 'fsw-sky-slide-mist-back' : 'fsw-sky-slide-mist'} ${l.dur}s linear infinite`,
        }} />
      ))}
      <div style={{
        position: 'absolute', inset: 0,
        background: night
          ? 'linear-gradient(180deg, rgba(60,66,82,0) 0%, rgba(60,66,82,.3) 55%, rgba(70,76,92,.62) 100%)'
          : 'linear-gradient(180deg, rgba(160,168,182,0) 0%, rgba(160,168,182,.3) 55%, rgba(178,186,200,.62) 100%)',
      }} />
    </>
  );
}

const streak = (w: number, len: number, x: number, y: number, a: number) =>
  `radial-gradient(${w}px ${len}px at ${x}px ${y}px, rgba(205,225,255,${a}) 0 92%, transparent 100%)`;
const RAIN_NEAR = [streak(1.6, 30, 24, 60, .8), streak(1.6, 38, 96, 210, .75), streak(1.6, 26, 150, 400, .7), streak(1.6, 34, 208, 130, .8), streak(1.6, 28, 60, 330, .7), streak(1.6, 36, 176, 290, .75), streak(1.6, 24, 118, 20, .65)].join(',');
const RAIN_FAR = [streak(1.1, 20, 40, 100, .7), streak(1.1, 18, 130, 260, .6), streak(1.1, 22, 200, 40, .65), streak(1.1, 16, 80, 420, .6), streak(1.1, 20, 170, 360, .6)].join(',');

function Rain() {
  const layer = (image: string, dur: number, opacity: number, position?: string) => (
    <div style={{
      position: 'absolute', left: 0, top: 0, width: '100%', height: 'calc(100% + 480px)',
      backgroundImage: image, backgroundRepeat: 'repeat', backgroundSize: '240px 480px', backgroundPosition: position,
      opacity, willChange: 'transform', animation: `fsw-sky-fall-480 ${dur}s linear infinite`,
    }} />
  );
  return (
    <div style={{ position: 'absolute', left: '-14%', top: 0, width: '128%', height: '100%', transform: 'skewX(-7deg)' }}>
      {layer(RAIN_FAR, 1.35, .55, '70px 160px')}
      {layer(RAIN_NEAR, .8, 1)}
    </div>
  );
}

const flake = (r: number, x: number, y: number) => `radial-gradient(circle ${r}px at ${x}px ${y}px, #fff 50%, rgba(255,255,255,0) 100%)`;
const SNOW_NEAR = [flake(5, 40, 60), flake(4, 170, 150), flake(6, 290, 90), flake(4.5, 90, 300), flake(5.5, 240, 330), flake(4, 330, 470), flake(5, 140, 500), flake(6, 30, 420), flake(4.5, 210, 560)].join(',');
const SNOW_FAR = [flake(3, 60, 40), flake(2.5, 200, 120), flake(3, 320, 260), flake(2.5, 110, 380), flake(3, 260, 520), flake(2, 20, 560)].join(',');

function Snow() {
  const layer = (image: string, dur: number, opacity: number, position?: string) => (
    <div style={{
      position: 'absolute', left: 0, top: 0, width: '100%', height: 'calc(100% + 600px)',
      backgroundImage: image, backgroundRepeat: 'repeat', backgroundSize: '360px 600px', backgroundPosition: position,
      opacity, willChange: 'transform', animation: `fsw-sky-fall-600 ${dur}s linear infinite`,
    }} />
  );
  return (
    <div style={{ position: 'absolute', inset: -30, animation: 'fsw-sky-sway 6s ease-in-out infinite alternate' }}>
      {layer(SNOW_FAR, 8, .55, '120px 200px')}
      {layer(SNOW_NEAR, 4.5, 1)}
    </div>
  );
}
