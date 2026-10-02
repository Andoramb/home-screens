'use client';

import { useState, useEffect } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { usePolledFetch } from '@/hooks/usePolledFetch';
import { logger } from '@/lib/logger';
import { eventBus } from '@/lib/event-bus';
import type { RotationAnswer } from '@/lib/screen-background';

const log = logger('useActiveBackground');

/**
 * Polls the server-side background cache so the editor shows the same rotating
 * background the display is using. Returns null when rotation is disabled and
 * undefined until the screen's first answer is in (see resolveScreenBackground).
 *
 * Answers are kept per screen, so a screen never shows the photo of the one
 * selected before it, and going back to a screen shows its photo at once.
 */
export function useActiveBackground(screenId: string | undefined, rotationEnabled: boolean): RotationAnswer {
  const [answers, setAnswers] = useState<Record<string, string | null>>({});
  const record = (id: string, answer: string | null) =>
    setAnswers((prev) => (prev[id] === answer ? prev : { ...prev, [id]: answer }));

  // The editor's Refresh button (BackgroundPicker) force-fetches a new photo
  // directly against the rotate endpoint and publishes the result here, so
  // this hook's answer updates immediately instead of waiting up to 30s for
  // its next poll tick.
  useEffect(() => {
    return eventBus.subscribe('background.forceRefresh', (data) => {
      if (data.screenId === screenId) record(data.screenId, data.path);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `record` is stable per render via setAnswers identity; only screenId should re-subscribe
  }, [screenId]);

  usePolledFetch(
    async () => {
      const id = screenId!;
      try {
        const res = await editorFetch(`/api/backgrounds/rotate?screenId=${encodeURIComponent(id)}`);
        if (res.ok) {
          const data = await res.json();
          record(id, data.path || null);
          return;
        }
      } catch (err) {
        log.debug('Failed to fetch active background:', err);
      }
      // A failed lookup keeps the last answer; before one, the screen's own picture stands.
      setAnswers((prev) => (id in prev ? prev : { ...prev, [id]: null }));
    },
    [screenId],
    {
      intervalMs: 30_000,
      enabled: rotationEnabled && !!screenId,
      // With rotation off the canvas shows the screen's own picture. Recording
      // that as its answer keeps the picture up when rotation is switched on,
      // until the first photo arrives, instead of blanking it for the lookup.
      onSkip: () => {
        if (screenId) record(screenId, null);
      },
    },
  );

  if (!screenId || !rotationEnabled) return null;
  return answers[screenId];
}
