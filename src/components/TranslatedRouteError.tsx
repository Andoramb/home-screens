'use client';

import { useTranslate } from '@/i18n';
import RouteErrorScreen from './RouteErrorScreen';

/** The route error screen in the household's language, for pages inside a language provider. */
export default function TranslatedRouteError({ error }: { error: Error & { digest?: string } }) {
  const t = useTranslate('core');
  return (
    <RouteErrorScreen
      error={error}
      text={{
        title: t('routeError.title'),
        body: t('routeError.body'),
        help: t('routeError.help'),
        retry: t('routeError.retry'),
      }}
    />
  );
}
