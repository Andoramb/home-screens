'use client';

import { useCallback, useEffect, useState } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import type { GoogleAppsStatus } from '@/lib/google-apps';

/**
 * Which Google app Calendar and Photos sign in with, from GET
 * /api/auth/google/apps. `apps` stays null until it arrives and after a
 * failed request; callers treat null as "Home Screens' app is off" and show
 * what they always have, so a hiccup never exposes the new screens.
 */
export function useGoogleApps(enabled = true): {
  apps: GoogleAppsStatus | null;
  loading: boolean;
  refetch: () => Promise<void>;
} {
  const [apps, setApps] = useState<GoogleAppsStatus | null>(null);
  const [loading, setLoading] = useState(enabled);

  const refetch = useCallback(async () => {
    try {
      const res = await editorFetch('/api/auth/google/apps');
      setApps(res.ok ? await res.json() : null);
    } catch {
      setApps(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) void refetch();
  }, [enabled, refetch]);

  return { apps, loading, refetch };
}

