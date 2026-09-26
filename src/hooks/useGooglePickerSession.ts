'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { editorFetch } from '@/lib/editor-fetch';

export interface PickerSession {
  id: string;
  pickerUri: string;
  pollIntervalMs: number;
}

/**
 * How a picking session stopped: the person finished picking, the session
 * vanished on Google's side, or the hub could not reach it several times in
 * a row. `cancel()` ends it without a report.
 */
export type PickerSessionEnd = 'picked' | 'expired' | 'failed';

const MAX_CONSECUTIVE_FAILURES = 5;

/**
 * One Google Photos picking session, shared by every surface that imports
 * from it (the editor's slideshow panel and the phone's Photos tab), so the
 * polling can't drift between them. `open()` asks the hub for a session and
 * returns it; the caller shows its `pickerUri`. The session is then polled
 * until the picks are in (`onEnd('picked', id)`, time to start the import),
 * or it expires or keeps failing.
 *
 * The polling is a state-driven effect, so `cancel()` or unmounting tears the
 * loop down even mid-request, and a response that lands after teardown can
 * neither re-arm the loop nor start an import for an abandoned session.
 */
export function useGooglePickerSession(onEnd: (end: PickerSessionEnd, sessionId: string) => void) {
  const [session, setSession] = useState<PickerSession | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    let inFlight = false;
    let settled = false;
    let failures = 0;

    const finish = (timer: ReturnType<typeof setInterval>, end: PickerSessionEnd) => {
      settled = true;
      clearInterval(timer);
      setSession(null);
      onEndRef.current(end, session.id);
    };

    const timer = setInterval(async () => {
      if (inFlight || settled) return;
      inFlight = true;
      try {
        const res = await editorFetch(`/api/google-picker/session?id=${encodeURIComponent(session.id)}`);
        if (cancelled || settled) return;
        if (!res.ok) {
          // A vanished session is over at once; anything else (a 500 from a
          // lost Google connection included) after a few failures in a row,
          // never an endless silent wait.
          if (res.status === 404) finish(timer, 'expired');
          else if (++failures >= MAX_CONSECUTIVE_FAILURES) finish(timer, 'failed');
          return;
        }
        failures = 0;
        const data = (await res.json()) as { mediaItemsSet?: boolean };
        if (cancelled || settled) return;
        if (data.mediaItemsSet) finish(timer, 'picked');
      } catch {
        // A thrown fetch is a network blip on this side: keep polling, but
        // not forever.
        if (!cancelled && !settled && ++failures >= MAX_CONSECUTIVE_FAILURES) finish(timer, 'failed');
      } finally {
        inFlight = false;
      }
    }, Math.max(session.pollIntervalMs || 5000, 2000));
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [session]);

  /** Start a session. Throws with the hub's reason when it cannot (an empty
   *  message when the answer carried none, such as a proxy's error page). */
  const open = useCallback(async (): Promise<PickerSession> => {
    const res = await editorFetch('/api/google-picker/session', { method: 'POST' });
    const data = (await res.json().catch(() => ({}))) as Partial<PickerSession> & { error?: unknown };
    if (!res.ok || !data.id || !data.pickerUri) {
      throw new Error(typeof data.error === 'string' ? data.error : '');
    }
    const session: PickerSession = { id: data.id, pickerUri: data.pickerUri, pollIntervalMs: data.pollIntervalMs ?? 5000 };
    setSession(session);
    return session;
  }, []);

  /** Stop waiting for picks. Telling Google is best effort. */
  const cancel = useCallback(() => {
    const abandoned = sessionRef.current;
    // Clearing the session tears the polling effect down.
    setSession(null);
    if (abandoned) {
      editorFetch(`/api/google-picker/session?id=${encodeURIComponent(abandoned.id)}`, { method: 'DELETE' }).catch(() => {});
    }
  }, []);

  return { session, open, cancel };
}
