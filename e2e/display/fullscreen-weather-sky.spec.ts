import { test, expect } from '../fixtures';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { putConfig } from '../helpers/api';
import { stubModuleData } from '../helpers/stubs';
import { buildModuleInstance, matrixSettings } from '../helpers/module-fixtures';
import { richWeather } from '../helpers/weather-payload';

/**
 * The living sky crossfades to a new scene by mounting the new stack over
 * the old one and unmounting the old one once the fade is done. On every
 * load that happens once at least: the sky starts clear and fades to the
 * real scene when the weather lands.
 *
 * Animation frames do not run while a tab is hidden or the wall's screen is
 * blanked. The fade used to wait on one to flip the new stack's opacity, and
 * the settle timer, which does run, unmounted the old stack first, which
 * cancelled that frame and left the new sky at opacity 0 for good. The fade
 * is a CSS animation now, so it finishes on the clock whether frames run or
 * not. This loads with frames stubbed out and expects a fully opaque sky.
 */
test('the sky ends fully opaque after a scene change with no animation frames', async ({ page, request }) => {
  const weather = richWeather() as { hourly: Array<Record<string, unknown>> } & Record<string, unknown>;
  await stubModuleData(page, {
    overrides: {
      weather: {
        ...weather,
        hourly: weather.hourly.map((h) => ({ ...h, icon: 'cloud-rain', description: 'Rain' })),
        alerts: [], minutely: [],
      },
    },
  });
  await page.addInitScript(() => {
    window.requestAnimationFrame = () => 0;
    window.cancelAnimationFrame = () => {};
  });
  await page.setViewportSize({ width: 1080, height: 1920 });
  await putConfig(request, baseConfig({
    screens: [makeScreen('s1', 'S1', [{
      ...buildModuleInstance('fullscreen-weather', { view: 'forecast', skyLayer: 'living' }),
      position: { x: 0, y: 0 }, size: { w: 1080, h: 1920 },
    }])],
    settings: { ...matrixSettings(), displayWidth: 1080, displayHeight: 1920, displayTransform: 'normal' },
  }));
  await page.goto('/display');
  const sky = page.locator('[data-testid="fsw-sky"]');
  await expect(sky).toHaveAttribute('data-scene', 'rain');

  const stacks = () => sky.evaluate((el) => Array.from(el.children)
    .filter((c) => c.tagName === 'DIV')
    .map((c) => Number(getComputedStyle(c).opacity)));
  // The fade takes three seconds; afterwards exactly one stack remains and it is opaque.
  await expect.poll(stacks, { timeout: 10_000 }).toEqual([1]);
});
