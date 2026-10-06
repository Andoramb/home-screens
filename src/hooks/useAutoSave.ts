'use client';

import { useEffect, useMemo } from 'react';
import { useEditorStore } from '@/stores/editor-store';
import { validateAllSchedules, validateDisplays } from '@/lib/display-filter';
import { useDebouncedSave } from '@/hooks/useDebouncedSave';

const AUTO_SAVE_DELAY = 800;

export function useAutoSave() {
  const config = useEditorStore((s) => s.config);
  const isDirty = useEditorStore((s) => s.isDirty);
  const isSaving = useEditorStore((s) => s.isSaving);
  const saveConfig = useEditorStore((s) => s.saveConfig);
  const saveError = useEditorStore((s) => s.saveError);
  const saveConflict = useEditorStore((s) => s.saveConflict);

  // A transiently invalid config (e.g. a just-added visibility condition
  // whose key hasn't been typed yet) is an expected editing state, not a
  // failure: don't attempt a save at all — the property panel is already
  // showing the matching inline error. Same validators, same order as the
  // config route, so this can never block a config the server would accept.
  const isInvalid = useMemo(
    () => config != null && (validateDisplays(config) ?? validateAllSchedules(config)) != null,
    [config],
  );

  // Auto-save: debounce 800ms after the last change. Held while a save
  // conflict is waiting on the user — retrying would just be refused again.
  // Flush on unmount so a quick jump from /editor to /display (or closing the
  // editor tab right after tweaking an effect slider) still kicks off the
  // pending save instead of strandanding the draft only in local editor state.
  useDebouncedSave({
    values: [config],
    save: () => saveConfig(),
    debounceMs: AUTO_SAVE_DELAY,
    enabled: !!isDirty && !isSaving && !isInvalid && !saveConflict,
    skipInitial: false,
    flushOnUnmount: true,
    onError: () => {},
  });

  // Prevent navigating away with unsaved changes
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  return { isDirty, isSaving, saveError, saveConfig };
}
