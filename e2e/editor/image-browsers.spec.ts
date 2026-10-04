import { test, expect } from '../fixtures';
import { buildModuleInstance } from '../helpers/module-fixtures';
import { selectModule, autosaved, moduleConfig } from '../helpers/editor';
import { stubModuleData } from '../helpers/stubs';

/**
 * Module media browsers, stub-driven at the browser boundary. The browser
 * fetches its data client-side (editorFetch → an internal /api/* proxy
 * route), so `page.route` intercepts the call before the proxy's own upstream
 * fetch can fire — the stubbed /api/* response stands in for the whole chain,
 * and the `stubModuleData` external-block catch-all proves no real upstream was
 * reached (asserted via `externalHits`).
 *
 * Entry points were read from the sources rather than guessed:
 *  - ImageBrowserModal opens from the image module's Library tab and writes the
 *    chosen path to the module's `config.src`.
 */

// 1x1 transparent PNG. Used as thumb `src` so grids render without any external
// image load (data: URIs are allowed through the external-block catch-all).
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const TINY_PNG_BYTES = Buffer.from(TINY_PNG.split(',')[1], 'base64');

test.describe('ImageBrowserModal (image module Library picker)', () => {
  test('browsing the local library and picking an image persists config.src', async ({ page, request }) => {
    const handle = await stubModuleData(page, { blockExternal: true });
    const PICKED = '/api/backgrounds/serve?file=beach.jpg';
    // Directory tree + media list the modal's local tab reads.
    await page.route('**/api/backgrounds/directories*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ directories: [{ name: 'All Photos', path: '', imageCount: 2 }] }) }),
    );
    await page.route('**/api/backgrounds/serve*', (route) =>
      route.fulfill({ status: 200, contentType: 'image/jpeg', body: TINY_PNG_BYTES }),
    );
    // The library fetches the typed media list; the video entry must be
    // filtered OUT of the pick-image grid.
    await page.route('**/api/backgrounds?media=both*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { url: PICKED, type: 'image' },
        { url: '/api/backgrounds/serve?file=forest.jpg', type: 'image' },
        { url: '/api/backgrounds/serve?file=clip.mp4', type: 'video' },
      ]) }),
    );

    await selectModule(page, request, buildModuleInstance('image'));

    // The image config defaults to the URL tab; switch to Library, then browse.
    await page.getByRole('button', { name: 'Library', exact: true }).click();
    await page.getByRole('button', { name: 'Browse Library...' }).click();

    await expect(page.getByRole('heading', { name: 'Image Library' })).toBeVisible();
    await expect(page.locator('[data-media-type="video"]')).toHaveCount(0);
    // Pick the first thumbnail, then confirm.
    await page.locator('button:has(img[src*="beach.jpg"])').click();
    await autosaved(page, async () => {
      await page.getByRole('button', { name: 'Select Image' }).click();
    });

    expect((await moduleConfig(request, 'image')).src).toBe(PICKED);
    expect(handle.externalHits).toEqual([]);
  });

  test('pick-video mode lists only videos and picking one persists config.file', async ({ page, request }) => {
    const handle = await stubModuleData(page, { blockExternal: true });
    await page.route('**/api/backgrounds/directories*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ directories: [{ name: 'All Photos', path: '', imageCount: 2 }] }) }),
    );
    await page.route('**/api/backgrounds/serve*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) }),
    );
    await page.route('**/api/backgrounds?media=both*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { url: '/api/backgrounds/serve?file=beach.jpg', type: 'image' },
        { url: '/api/backgrounds/serve?file=family-clip.mp4&mt=e2e-token', type: 'video' },
      ]) }),
    );
    // The standalone video module itself resolves through media=videos.
    await page.route('**/api/backgrounds?media=videos*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { url: '/api/backgrounds/serve?file=family-clip.mp4&mt=e2e-token', type: 'video' },
      ]) }),
    );

    await selectModule(page, request, buildModuleInstance('video'));
    await page.getByRole('button', { name: 'Browse Library...' }).click();

    await expect(page.getByRole('heading', { name: 'Video Library' })).toBeVisible();
    // Images are filtered out of the pick-video grid; the video tile shows.
    await expect(page.locator('img[src*="beach.jpg"]')).toHaveCount(0);
    await page.locator('[data-media-type="video"] button:has(video)').click();
    await autosaved(page, async () => {
      await page.getByRole('button', { name: 'Select Video' }).click();
    });

    // Config stores the file PATH, not the token-bearing serve URL.
    expect((await moduleConfig(request, 'video')).file).toBe('family-clip.mp4');
    expect(handle.externalHits).toEqual([]);
  });

  test('manage-directory mode shows video tiles alongside images', async ({ page, request }) => {
    const handle = await stubModuleData(page, { blockExternal: true });
    await page.route('**/api/backgrounds/directories*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ directories: [{ name: 'All Photos', path: '', imageCount: 2 }] }) }),
    );
    await page.route('**/api/backgrounds/serve*', (route) =>
      route.fulfill({ status: 200, contentType: 'image/jpeg', body: TINY_PNG_BYTES }),
    );
    await page.route('**/api/backgrounds?media=both*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { url: '/api/backgrounds/serve?file=beach.jpg', type: 'image' },
        { url: '/api/backgrounds/serve?file=family-clip.mp4', type: 'video' },
      ]) }),
    );

    await selectModule(page, request, buildModuleInstance('photo-slideshow'));
    await page.getByRole('button', { name: 'Browse...', exact: true }).click();

    // The mixed management view is media-branded, not image-branded.
    await expect(page.getByRole('heading', { name: 'Media Library' })).toBeVisible();
    await expect(page.getByText('All Photos & Videos').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload', exact: true })).toBeVisible();
    await expect(page.locator('img[src*="beach.jpg"]')).toBeVisible();
    await expect(page.locator('[data-media-type="video"]')).toHaveCount(1);
    // Both media kinds are counted in the toolbar summary.
    await expect(page.getByText('1 photo, 1 video')).toBeVisible();
    expect(handle.externalHits).toEqual([]);
  });
});
