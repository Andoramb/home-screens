import { test, expect } from '../fixtures';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';
import { putConfig } from '../helpers/api';
import { renderOnDisplay } from '../helpers/display';

/**
 * A screen with nothing on it must not take a turn on the wall.
 *
 * Adding a screen in the editor used to put it into the rotation the moment
 * it existed, so a wall that cycled three screens went black for a whole
 * interval in every four while somebody was still building the fourth. The
 * rule itself is unit-tested in src/lib/__tests__/rotating-screens.test.ts;
 * these specs pin the rendered result, including the two things that must NOT
 * change: the first-boot watermark, and a preview of the screen being built.
 */

function threeScreensOneBlank() {
  return [
    makeScreen('s1', 'Screen 1', [textModule('PAGE 1')]),
    makeScreen('s2', 'Blank Screen', []),
    makeScreen('s3', 'Screen 3', [textModule('PAGE 3')]),
  ];
}

test('the dots count only the screens with something on them', async ({ page, request }) => {
  // Rotation frozen: the dot labels are then a stable reading of the rotation
  // rather than a race against it (the active dot is the pause control and
  // does not name its screen).
  await renderOnDisplay(page, request, baseConfig({
    screens: threeScreensOneBlank(),
    settings: { rotationIntervalMs: 60_000 },
  }));

  // One dot per rotating screen, and the second one is the third screen:
  // the blank screen in between is not a step anybody can land on.
  await expect(page.getByTestId('pagination-dots').getByRole('button')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Go to screen 2: Screen 3' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Blank Screen/ })).toHaveCount(0);
});

test('rotation never lands on the blank screen', async ({ page, request }) => {
  await renderOnDisplay(page, request, baseConfig({
    screens: threeScreensOneBlank(),
    settings: { rotationIntervalMs: 1_000 },
  }));

  // Sample the canvas across four intervals. Deliberately not an auto-retrying
  // assertion: a blank screen that holds the wall for one second in three is
  // exactly what a retry would wait out.
  const seen = new Set<string>();
  for (let i = 0; i < 12; i++) {
    const texts = await page.locator('[data-module-type]').allInnerTexts();
    expect(texts, 'the wall went blank: an empty screen took a turn').toHaveLength(1);
    seen.add(texts[0].trim());
    await page.waitForTimeout(400);
  }
  // And it really was rotating while we watched.
  expect([...seen].sort()).toEqual(['PAGE 1', 'PAGE 3']);
});

test('a wall with nothing on any screen still shows the setup watermark', async ({ page, request }) => {
  // The genuine first-boot case: skipping empty screens must not skip the one
  // thing that tells a new owner where to go.
  await putConfig(request, baseConfig({
    screens: [makeScreen('s1', 'Screen 1', []), makeScreen('s2', 'Screen 2', [])],
    settings: { rotationIntervalMs: 1_000 },
  }));
  await page.goto('/display');

  await expect(page.getByTestId('empty-display-hint')).toBeVisible();
});

test('emptying the last screen with content falls back to the watermark', async ({ page, request }) => {
  const config = baseConfig({
    screens: [makeScreen('s1', 'Screen 1', [textModule('PAGE 1')]), makeScreen('s2', 'Screen 2', [])],
    settings: { rotationIntervalMs: 1_000 },
  });
  await renderOnDisplay(page, request, config);
  await expect(page.getByText('PAGE 1', { exact: true })).toBeVisible();

  config.screens[0].modules = [];
  await putConfig(request, config);

  await expect(page.getByTestId('empty-display-hint')).toBeVisible({ timeout: 10_000 });
});

test('previewing the screen being built still shows that screen', async ({ page, request }) => {
  // ?screen= pins a screen that is out of the rotation, which is now where an
  // empty one lives. The editor's Preview button must still open it.
  await putConfig(request, baseConfig({
    screens: [
      makeScreen('s1', 'Screen 1', [textModule('PAGE 1')]),
      makeScreen('s2', 'Blank Screen', []),
    ],
    settings: { rotationIntervalMs: 60_000 },
  }));
  await page.goto('/display?screen=s2&preview=1');

  await expect(page.getByTestId('empty-display-hint')).toBeHidden();
  await expect(page.getByText('PAGE 1', { exact: true })).toHaveCount(0);
});
