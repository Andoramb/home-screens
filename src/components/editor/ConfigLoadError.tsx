'use client';

import { useState } from 'react';
import { useTranslate } from '@/i18n';
import { useEditorStore } from '@/stores/editor-store';
import Button from '@/components/ui/Button';
import DataSection from '@/components/editor/settings/DataSection';

/**
 * What the editor and Settings show when the saved setup cannot be loaded at
 * all, in place of a "Loading…" that never ends. The usual cause is a damaged
 * data file, and the way out is a backup, so the backup tools are right here:
 * the Settings page that normally holds them needs the very setup that will
 * not load.
 */
export default function ConfigLoadError() {
  const t = useTranslate('editor');
  const detail = useEditorStore((s) => s.loadError?.detail ?? null);
  const loadConfig = useEditorStore((s) => s.loadConfig);
  const [retrying, setRetrying] = useState(false);

  const retry = async () => {
    setRetrying(true);
    try {
      await loadConfig();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="h-screen overflow-y-auto bg-hs-body" data-testid="config-load-error">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div role="alert" className="rounded-lg border border-hs-border-strong bg-hs-panel p-5">
          <h1 className="text-lg font-semibold text-hs-text-primary">{t('page.loadError.title')}</h1>
          <p className="mt-2 text-sm text-hs-text-secondary">{t('page.loadError.body')}</p>
          {detail && (
            <p className="mt-3 text-xs text-hs-text-faint" data-testid="config-load-error-detail">
              {t('page.loadError.detailLabel')}: {detail}
            </p>
          )}
          <div className="mt-4">
            <Button variant="primary" onClick={() => void retry()} disabled={retrying}>
              {retrying ? t('page.loadError.retrying') : t('page.loadError.retry')}
            </Button>
          </div>
        </div>
        <div className="mt-8">
          <DataSection onSettingsImported={() => {}} />
        </div>
      </div>
    </div>
  );
}
