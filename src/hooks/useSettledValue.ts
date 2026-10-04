'use client';

import { useEffect, useState } from 'react';

/**
 * `value` once it has stopped changing for `delayMs`; until then, the last
 * value that did. The first render returns `value` itself, so nothing waits
 * on mount.
 *
 * For a fetch whose address follows text someone is still typing: the
 * Traffic module's request carries the route addresses, and asking on every
 * key spent one paid lookup per route per letter.
 */
export function useSettledValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return settled;
}
