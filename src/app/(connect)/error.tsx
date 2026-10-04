'use client';

import TranslatedRouteError from '@/components/TranslatedRouteError';

export default function RouteError({ error }: { error: Error & { digest?: string } }) {
  return <TranslatedRouteError error={error} />;
}
