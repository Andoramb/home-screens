'use client';

import RouteErrorScreen, { ROUTE_ERROR_ENGLISH } from '@/components/RouteErrorScreen';

/** The root layout itself failed, so this stands in for the whole document. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <title>Home Screens</title>
        <RouteErrorScreen error={error} text={ROUTE_ERROR_ENGLISH} />
      </body>
    </html>
  );
}
