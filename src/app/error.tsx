'use client';

import RouteErrorScreen, { ROUTE_ERROR_ENGLISH } from '@/components/RouteErrorScreen';

/** A failure above the language providers (one of the group layouts): plain English, since no dictionary is loaded here. */
export default function RootError({ error }: { error: Error & { digest?: string } }) {
  return <RouteErrorScreen error={error} text={ROUTE_ERROR_ENGLISH} />;
}
