import type { RefCallback } from 'react';
import type { DateConfig } from '@/types/config';

export interface DateViewProps {
  config: DateConfig;
  now: Date;
  scaledFontSize: number;
  /** The size at 100% Text size, for views that also fit a line to the box width (see clock/fit-width). */
  autoFontSize?: number;
  /** The measured box width; 0 until measured. */
  boxWidth?: number;
  containerRef: RefCallback<HTMLDivElement>;
}
