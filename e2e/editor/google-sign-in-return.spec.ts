import http from 'http';
import type { AddressInfo } from 'net';
import { createHash } from 'crypto';
import { rmSync } from 'fs';
import path from 'path';
import type { APIRequestContext } from '@playwright/test';
import { test as base, expect } from '../fixtures';
import { launchServer, type HsServer } from '../helpers/server';
import { baseConfig } from '../helpers/config-fixtures';

/**
 * A Google Photos sign-in coming straight back to the hub
 * (/editor/connect/google), as homescreens.dev forwards it when the sign-in
 * link carries a home-network hub address. Home Screens' own Google app is
 * switched on for this hub, and its sign-in helper is a local stand-in, so
 * nothing reaches Google: the stand-in accepts the code `good-code` and
 * refuses every other one the way Google refuses a used code.
 */

interface TokenStub {
  url: string;
  calls: URLSearchParams[];
  close(): Promise<void>;
}

async function startTokenStub(): Promise<TokenStub> {
  const calls: URLSearchParams[] = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      const form = new URLSearchParams(body);
      calls.push(form);
      res.setHeader('Content-Type', 'application/json');
      if (form.get('code') === 'good-code') {
        res.end(JSON.stringify({ access_token: 'ya29.stub', refresh_token: '1//stub', expires_in: 3600, token_type: 'Bearer' }));
        return;
      }
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'invalid_grant', error_description: 'Bad Request' }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/google/photos/token`,
    calls,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

const test = base.extend<object, { tokenStub: TokenStub; hostedServer: HsServer }>({
  tokenStub: [async ({}, use) => {
    const stub = await startTokenStub();
    await use(stub);
    await stub.close();
  }, { scope: 'worker' }],
  hostedServer: [async ({ tokenStub }, use) => {
    const server = await launchServer(
      { 'config.json': baseConfig() },
      { HS_GOOGLE_HOSTED: '1', HS_GOOGLE_PHOTOS_TOKEN_URL: tokenStub.url },
    );
    await use(server);
    await server.stop();
  }, { scope: 'worker' }],
  baseURL: async ({ hostedServer }, use) => {
    await use(hostedServer.baseURL);
  },
});

/** A fresh sign-in link from the hub, as the editor asks for it. */
async function signInLink(request: APIRequestContext, baseURL: string) {
  const res = await request.get(`/api/google-picker/auth?origin=${encodeURIComponent(baseURL)}`);
  expect(res.ok()).toBe(true);
  const { url, returnsToHub } = await res.json() as { url: string; returnsToHub: boolean };
  const params = new URL(url).searchParams;
  return { returnsToHub, state: params.get('state')!, challenge: params.get('code_challenge')! };
}

const returnPage = (params: Record<string, string>) => `/editor/connect/google?${new URLSearchParams(params)}`;

test.describe('Google Photos sign-in coming back to the hub', () => {
  test.beforeEach(({ hostedServer, tokenStub }) => {
    // Signed out, without a disconnect: that would try to revoke at Google.
    rmSync(path.join(hostedServer.sandboxDir, 'data', 'google-picker-tokens.json'), { force: true });
    tokenStub.calls.length = 0;
  });

  test('finishes the sign-in on the hub, handing over the PKCE verifier, and clears the code from the address', async ({ page, request, baseURL, tokenStub }) => {
    const link = await signInLink(request, baseURL);
    expect(link.returnsToHub).toBe(true);
    expect(Buffer.from(link.state.split('.')[1], 'base64url').toString()).toBe(baseURL);

    await page.goto(returnPage({ code: 'good-code', state: link.state }));

    await expect(page.getByRole('heading', { name: 'Google Photos is connected' })).toBeVisible();
    await expect(page).toHaveURL(/\/editor\/connect\/google$/);
    // Next's router keeps its own copy of the address and writes it back on
    // its next update, so the code must be gone from that copy too.
    await expect.poll(() => page.evaluate(() => JSON.stringify(window.history.state).includes('good-code'))).toBe(false);
    expect(tokenStub.calls).toHaveLength(1);
    const verifier = tokenStub.calls[0].get('code_verifier')!;
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(link.challenge);
    const status = await (await request.get('/api/google-picker/status')).json();
    expect(status.connected).toBe(true);
  });

  test('each sign-in works once', async ({ page, request, baseURL, tokenStub }) => {
    const link = await signInLink(request, baseURL);
    const url = returnPage({ code: 'good-code', state: link.state });

    await page.goto(url);
    await expect(page.getByRole('heading', { name: 'Google Photos is connected' })).toBeVisible();
    await page.goto(url);
    await expect(page.getByRole('heading', { name: 'That sign-in has expired' })).toBeVisible();
    expect(tokenStub.calls).toHaveLength(1);
  });

  test("a link that isn't this hub's can't use the sign-in that is waiting", async ({ page, request, baseURL, tokenStub }) => {
    const link = await signInLink(request, baseURL);
    const forged = `${'A'.repeat(43)}.${link.state.split('.')[1]}`;

    await page.goto(returnPage({ code: 'good-code', state: forged }));
    await expect(page.getByRole('heading', { name: 'That sign-in has expired' })).toBeVisible();
    expect(tokenStub.calls).toHaveLength(0);

    await page.goto(returnPage({ code: 'good-code', state: link.state }));
    await expect(page.getByRole('heading', { name: 'Google Photos is connected' })).toBeVisible();
  });

  test('a code Google no longer takes reads as an expired sign-in', async ({ page, request, baseURL }) => {
    const link = await signInLink(request, baseURL);

    await page.goto(returnPage({ code: 'used-code', state: link.state }));

    await expect(page.getByRole('heading', { name: 'That sign-in has expired' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back to the editor' })).toBeVisible();
  });

  test('says the sign-in was cancelled when the family said no on Google', async ({ page, request, baseURL, tokenStub }) => {
    const link = await signInLink(request, baseURL);

    await page.goto(returnPage({ error: 'access_denied', state: link.state }));

    await expect(page.getByRole('heading', { name: 'Sign-in was cancelled' })).toBeVisible();
    expect(tokenStub.calls).toHaveLength(0);
  });
});

base.describe('with the switch off', () => {
  base('the return page does not exist', async ({ page }) => {
    const res = await page.goto('/editor/connect/google?code=good-code&state=anything');
    expect(res?.status()).toBe(404);
  });
});
