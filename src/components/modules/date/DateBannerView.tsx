'use client';

import { getDateInfoValues } from '@/lib/date-info';
import { useTranslate, useFormattingLocale, formatDateSync, dayMonthPattern } from '@/i18n';
import { TEXT_OPACITY } from '@/lib/constants';
import type { DateViewProps } from './types';

export default function DateBannerView({ config, now, scaledFontSize, containerRef }: DateViewProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  // Day and month in the order this language writes them ("29. SEPTEMBER").
  const dayAndMonth = formatDateSync(now, dayMonthPattern(locale, 'long'), { locale });
  const dayName = formatDateSync(now, 'EEEE', { locale });
  const year = formatDateSync(now, 'yyyy', { locale });

  const parts: string[] = [];
  if (config.showDayName) parts.push(dayName.toUpperCase());
  parts.push(dayAndMonth.toUpperCase());
  if (config.showYear) parts.push(year);

  const { weekNumber, dayOfYear } = getDateInfoValues(now);
  const infoParts: string[] = [];
  if (config.showWeekNumber) infoParts.push(`${t('date.weekAbbrev')} ${weekNumber}`);
  if (config.showDayOfYear) infoParts.push(`${t('date.dayAbbrev')} ${dayOfYear}`);

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col items-center justify-center"
    >
      <div
        className="tracking-[0.15em] font-light text-center"
        style={{ fontSize: scaledFontSize * 1.4 }}
        suppressHydrationWarning
      >
        {parts.map((part, i) => (
          <span key={i} suppressHydrationWarning>
            {i > 0 && (
              <span className="mx-2 opacity-30" style={{ color: config.accentColor }}>&bull;</span>
            )}
            {part}
          </span>
        ))}
      </div>

      {infoParts.length > 0 && (
        <div
          className="mt-1.5 tracking-[0.2em] uppercase"
          style={{ fontSize: scaledFontSize * 0.7, opacity: TEXT_OPACITY.tertiary }}
          suppressHydrationWarning
        >
          {infoParts.join('  ·  ')}
        </div>
      )}
    </div>
  );
}
