import { test, expect } from '../fixtures';
import { baseConfig, makeScreen } from '../helpers/config-fixtures';
import { CHORE_DATA, putConfig, seedHouseholdChores, seedRedemptions, seedRewards } from '../helpers/api';
import { buildModuleInstance, matrixSettings } from '../helpers/module-fixtures';

/**
 * The rewards store's History button: the family's totals, opened in place,
 * with a way back to the store. Hidden until there is a history to show.
 */
test.describe('rewards store history', () => {
  test.beforeEach(async ({ request, sandboxDir }) => {
    await seedHouseholdChores(request, sandboxDir, CHORE_DATA);
  });

  async function openStore(request: Parameters<typeof putConfig>[0]) {
    const mod = buildModuleInstance('fullscreen-chore-chart', { view: 'rewards-store' });
    mod.id = 'store';
    await putConfig(request, baseConfig({ screens: [makeScreen('s1', 'S1', [mod])], settings: matrixSettings() }));
  }

  test('opens the totals and comes back to the store', async ({ page, request, sandboxDir }) => {
    seedRedemptions(sandboxDir);
    await openStore(request);
    await page.goto('/display');

    await page.getByTestId('fcc-store-history').click();
    const history = page.getByTestId('fcc-history');
    await expect(history).toHaveAttribute('data-variant', 'totals');
    // Three redemptions at 5 tickets each.
    await expect(history.getByTestId('fcc-history-tile').first()).toContainText('15');
    await expect(history.getByTestId('fcc-row')).toHaveCount(3);
    await expect(history.getByTestId('fcc-row').first()).toContainText('Movie night');

    await page.getByTestId('fcc-history-back').click();
    await expect(page.getByTestId('fcc-store')).toBeVisible();
  });

  test('has no History button before anything was redeemed', async ({ page, request, sandboxDir }) => {
    // The sandbox keeps its data between tests: start from an empty history.
    seedRedemptions(sandboxDir, []);
    await seedRewards(request, [{ id: 'r1', name: 'Candy', emoji: '', cost: 2, description: '', memberIds: [], enabled: true }]);
    await openStore(request);
    await page.goto('/display');

    await expect(page.getByTestId('fcc-store')).toContainText('Candy');
    await expect(page.getByTestId('fcc-store-history')).toHaveCount(0);
  });
});
