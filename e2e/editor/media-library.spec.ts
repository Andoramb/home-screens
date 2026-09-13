import { test, expect } from '../fixtures';
import { putConfig } from '../helpers/api';
import { baseConfig, makeScreen, textModule } from '../helpers/config-fixtures';

/**
 * The Pictures & videos settings page (the library's new home) and the
 * background picker it replaced: uploading through the real page, the in-use
 * lock that spares files a screen still shows, deletion of the free ones, and
 * the picker keeping upload but no longer offering per-file delete.
 */

/** 1×1 transparent PNG — the same bytes the radar tile stubs use. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

test.describe('Defaults › Pictures & videos', () => {
  test('the media page shows the library, locks used files, and deletes unused ones', async ({ page, request }) => {
    await putConfig(request, baseConfig());
    await page.goto('/editor/settings?section=defaults&page=media');
    await expect(page.getByTestId('media-upload-button')).toBeVisible();

    // Upload a batch through the page's own picker: both files must land as
    // tiles carrying their filenames, and the panel closes behind the batch.
    await page.getByTestId('media-upload-button').click();
    const panel = page.getByTestId('media-upload-panel');
    await expect(panel).toBeVisible();
    await panel.locator('[data-file-input]').setInputFiles([
      { name: 'e2e-a.png', mimeType: 'image/png', buffer: PNG_1X1 },
      { name: 'e2e-b.png', mimeType: 'image/png', buffer: PNG_1X1 },
    ]);

    const usedTile = page.getByTestId('media-tile-e2e-a.png');
    const freeTile = page.getByTestId('media-tile-e2e-b.png');
    await expect(usedTile).toContainText('e2e-a.png');
    await expect(freeTile).toContainText('e2e-b.png');
    await expect(panel).toHaveCount(0);

    // Reference one file from the screen (bare path form, the shape the
    // editor saves), then reload: the inventory's usage scan must see it and
    // lock that tile behind the in-use badge and a disabled checkbox.
    await putConfig(request, baseConfig({
      screens: [makeScreen('screen-1', 'Screen 1', [textModule('E2E HOME SCREEN')], { backgroundImage: 'e2e-a.png' })],
    }));
    const inventoryLoaded = page.waitForResponse(
      (r) => r.url().includes('/api/backgrounds/inventory') && r.ok(),
    );
    await page.reload();
    const inventory = (await (await inventoryLoaded).json()) as {
      items: { path: string }[];
      usage: Record<string, unknown[]>;
    };
    expect(inventory.items.map((item) => item.path)).toContain('e2e-a.png');
    expect(inventory.usage['e2e-a.png'].length).toBeGreaterThan(0);
    await expect(usedTile.locator('[data-in-use]')).toContainText('In use');
    await expect(usedTile.locator('input[type="checkbox"]')).toBeDisabled();
    await expect(freeTile.locator('input[type="checkbox"]')).toBeEnabled();
    await expect(freeTile.locator('[data-in-use]')).toHaveCount(0);

    // Deleting is possible for the free file and spares the used one.
    await freeTile.locator('input[type="checkbox"]').click();
    await expect(freeTile).toHaveAttribute('data-selected', 'true');
    await page.getByTestId('media-delete-button').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Delete 1 file?');
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(freeTile).toHaveCount(0);
    await expect(usedTile).toBeVisible();

    // Both facts survive a reload: the free file is gone from the library,
    // the used one is still there.
    await page.reload();
    await expect(usedTile).toContainText('e2e-a.png');
    await expect(freeTile).toHaveCount(0);
  });
});

test.describe('background picker', () => {
  test('the background picker no longer offers delete', async ({ page, request }) => {
    await putConfig(request, baseConfig());
    await page.goto('/editor');
    await expect(page.getByTestId('editor-canvas')).toBeVisible();
    // Empty state = screen selected, no module: the picker lives there.
    await page.getByTestId('editor-canvas').click({ position: { x: 5, y: 5 } });
    await expect(page.getByTestId('background-tab-local')).toBeVisible();

    // Upload stays: push one picture through the picker's own input.
    const upload = page.getByRole('button', { name: 'Upload Background' });
    await expect(upload).toBeVisible();
    await page.locator('[data-file-input]').setInputFiles({
      name: 'e2e-picker.png',
      mimeType: 'image/png',
      buffer: PNG_1X1,
    });

    // The "Your own pictures" grid (the picker's upload also picks the
    // background, so the canvas preview carries the same img — scope here).
    const grid = page.getByText('Your own pictures', { exact: true }).locator('xpath=following-sibling::div[1]');
    const row = grid.locator('img[src*="/api/backgrounds/serve?file=e2e-picker.png"]').locator('xpath=../..');
    await expect(row).toBeVisible();
    // The row is just its pick tile (img -> pick button -> row): before the
    // removal each row carried a second, hover-revealed delete button.
    await expect(row.locator('button')).toHaveCount(1);

    // Every library row is just its pick tile, and no control anywhere on
    // the picker answers to the removed "Delete" title.
    const rows = grid.locator(':scope > div');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);
    for (let i = 0; i < rowCount; i++) {
      await expect(rows.nth(i).locator('button')).toHaveCount(1);
    }
    await expect(page.locator('button[title="Delete"]')).toHaveCount(0);
  });
});
